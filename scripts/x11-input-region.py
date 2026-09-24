#!/usr/bin/env python3
"""Set an X11 input-only region; leave the visual window and waveform untouched."""
import ctypes as C
import json
import math
import os
import select
import sys

class Rectangle(C.Structure):
    _fields_ = [('x', C.c_short), ('y', C.c_short), ('width', C.c_ushort), ('height', C.c_ushort)]

x = C.CDLL('libX11.so.6')
shape = C.CDLL('libXext.so.6')
x.XOpenDisplay.restype = C.c_void_p
x.XDefaultRootWindow.argtypes = [C.c_void_p]
x.XDefaultRootWindow.restype = C.c_ulong
x.XGetGeometry.argtypes = [C.c_void_p, C.c_ulong, C.POINTER(C.c_ulong), C.POINTER(C.c_int), C.POINTER(C.c_int), *[C.POINTER(C.c_uint)] * 4]
x.XSync.argtypes = [C.c_void_p, C.c_int]
x.XCloseDisplay.argtypes = [C.c_void_p]
shape.XShapeCombineRectangles.argtypes = [C.c_void_p, C.c_ulong, C.c_int, C.c_int, C.c_int, C.POINTER(Rectangle), C.c_int, C.c_int, C.c_int]
shape.XShapeCombineMask.argtypes = [C.c_void_p, C.c_ulong, C.c_int, C.c_int, C.c_int, C.c_ulong, C.c_int]
x.XFree.argtypes = [C.c_void_p]
x.XQueryTree.argtypes = [C.c_void_p, C.c_ulong, C.POINTER(C.c_ulong), C.POINTER(C.c_ulong), C.POINTER(C.POINTER(C.c_ulong)), C.POINTER(C.c_uint)]
shape.XShapeGetRectangles.argtypes = [C.c_void_p, C.c_ulong, C.c_int, C.POINTER(C.c_int), C.POINTER(C.c_int)]
shape.XShapeGetRectangles.restype = C.POINTER(Rectangle)
shape.XShapeQueryExtension.argtypes = [C.c_void_p, C.POINTER(C.c_int), C.POINTER(C.c_int)]

def rectangles(data, width, height):
    vw, vh = data['width'], data['height']
    regions = data['regions']
    if not all(isinstance(v, (int, float)) and math.isfinite(v) and 0 < v <= 4096 for v in (vw, vh)) or not 0 <= len(regions) <= 8:
        raise ValueError('Invalid input regions')
    if not 1 <= width <= 8192 or not 1 <= height <= 8192:
        raise ValueError('Invalid window dimensions')
    if not regions:
        return []
    rows = {}
    for r in regions:
        if not all(isinstance(r[k], (int, float)) and math.isfinite(r[k]) and abs(r[k]) <= 4096 for k in ('x', 'y', 'width', 'height')) or r['width'] <= 0 or r['height'] <= 0:
            raise ValueError('Invalid ellipse')
        rx, ry = r['width'] * width / vw / 2, r['height'] * height / vh / 2
        cx, cy = r['x'] * width / vw + rx, r['y'] * height / vh + ry
        for y in range(max(0, math.floor(cy - ry)), min(height, math.ceil(cy + ry))):
            fraction = 1 - ((y + 0.5 - cy) / ry) ** 2
            if fraction < 0:
                continue
            dx = rx * math.sqrt(fraction)
            left, right = max(0, math.ceil(cx - dx - 0.5)), min(width, math.floor(cx + dx - 0.5) + 1)
            if right > left:
                rows.setdefault(y, []).append((left, right))
    result = []
    for y, spans in sorted(rows.items()):
        merged = []
        for left, right in sorted(spans):
            if merged and left <= merged[-1][1]:
                merged[-1] = (merged[-1][0], max(merged[-1][1], right))
            else:
                merged.append((left, right))
        result.extend(Rectangle(left, y, right - left, 1) for left, right in merged)
    if not result or len(result) > 16384:
        raise ValueError('Invalid input region size')
    return result

def main():
    window = int(sys.argv[1])
    if not 0 < window <= 0xffffffff:
        raise ValueError('Invalid X11 window')
    display = x.XOpenDisplay(None)
    if not display:
        raise RuntimeError('X11 unavailable')
    event, error = C.c_int(), C.c_int()
    if not shape.XShapeQueryExtension(display, C.byref(event), C.byref(error)):
        x.XCloseDisplay(display)
        raise RuntimeError('XShape unavailable')
    def geometry(target):
        root, px, py = C.c_ulong(), C.c_int(), C.c_int()
        width, height, border, depth = C.c_uint(), C.c_uint(), C.c_uint(), C.c_uint()
        if not x.XGetGeometry(display, target, C.byref(root), C.byref(px), C.byref(py), C.byref(width), C.byref(height), C.byref(border), C.byref(depth)):
            raise RuntimeError('Window unavailable')
        return px.value, py.value, width.value, height.value

    def tree(target):
        root, parent = C.c_ulong(), C.c_ulong()
        children, count = C.POINTER(C.c_ulong)(), C.c_uint()
        if not x.XQueryTree(display, target, C.byref(root), C.byref(parent), C.byref(children), C.byref(count)):
            raise RuntimeError('Window unavailable')
        values = [children[i] for i in range(count.value)]
        x.XFree(children)
        return root.value, parent.value, values

    def frames():
        # KWin adds two frameless wrapper windows. Never shape the root or a
        # shared/differently sized ancestor, only this client's exclusive frame.
        result, current = [window], window
        size = geometry(window)[2:]
        for _ in range(4):
            root, parent, _children = tree(current)
            if parent == root or not parent:
                break
            if tree(parent)[2] != [current] or geometry(parent)[2:] != size or geometry(current)[:2] != (0, 0):
                break
            result.append(parent)
            current = parent
        return result

    def signature(target):
        count, ordering = C.c_int(), C.c_int()
        values = shape.XShapeGetRectangles(display, target, 2, C.byref(count), C.byref(ordering))
        result = tuple((values[i].x, values[i].y, values[i].width, values[i].height) for i in range(count.value))
        x.XFree(values)
        return result

    shaped = set()
    data, pending = None, b''
    cached = None
    buffer = None
    count = 0
    expected = ()
    try:
        while True:
            readable, _, _ = select.select([sys.stdin], [], [], 0.05)
            changed = False
            if readable:
                chunk = os.read(sys.stdin.fileno(), 8193)
                if not chunk:
                    break
                pending += chunk
                while b'\n' in pending:
                    line, pending = pending.split(b'\n', 1)
                    if len(line) > 8192:
                        raise ValueError('Input region message too large')
                    data = json.loads(line)
                    cached = None
                    changed = True
                if len(pending) > 8192:
                    raise ValueError('Input region message too large')
            if data is None:
                for target in frames() if shaped else []:
                    if target in shaped:
                        shape.XShapeCombineMask(display, target, 2, 0, 0, 0, 0)
                shaped.clear()
            else:
                width, height = geometry(window)[2:]
                if cached != (id(data), width, height):
                    values = rectangles(data, width, height)
                    count = len(values)
                    buffer = (Rectangle * count)(*values)
                    expected = tuple((r.x, r.y, r.width, r.height) for r in values)
                    cached = (id(data), width, height)
                for target in frames():
                    current = signature(target)
                    # Compare with our intended mask, never a read-back that
                    # Electron/KWin may already have reset in another connection.
                    if current != expected:
                        shape.XShapeCombineRectangles(display, target, 2, 0, 0, buffer, count, 0, 3)
                        x.XSync(display, 0)
                        shaped.add(target)
            x.XSync(display, 0)
            if changed:
                print('ready', flush=True)
    finally:
        for target in frames():
            if target in shaped:
                shape.XShapeCombineMask(display, target, 2, 0, 0, 0, 0)
        x.XSync(display, 0)
        x.XCloseDisplay(display)

if __name__ == '__main__':
    main()
