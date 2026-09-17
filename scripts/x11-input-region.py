#!/usr/bin/env python3
"""Set an X11 input-only region; leave the visual window and waveform untouched."""
import ctypes as C
import json
import math
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
shape.XShapeQueryExtension.argtypes = [C.c_void_p, C.POINTER(C.c_int), C.POINTER(C.c_int)]

def rectangles(data, width, height):
    vw, vh = data['width'], data['height']
    regions = data['regions']
    if not all(isinstance(v, (int, float)) and math.isfinite(v) and 0 < v <= 4096 for v in (vw, vh)) or not 1 <= len(regions) <= 8:
        raise ValueError('Invalid input regions')
    if not 1 <= width <= 8192 or not 1 <= height <= 8192:
        raise ValueError('Invalid window dimensions')
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
    try:
        for line in iter(lambda: sys.stdin.readline(8193), ''):
            if len(line) > 8192:
                raise ValueError('Input region message too large')
            data = json.loads(line)
            if data is None:
                shape.XShapeCombineMask(display, window, 2, 0, 0, 0, 0)
            else:
                root, px, py = C.c_ulong(), C.c_int(), C.c_int()
                width, height, border, depth = C.c_uint(), C.c_uint(), C.c_uint(), C.c_uint()
                if not x.XGetGeometry(display, window, C.byref(root), C.byref(px), C.byref(py), C.byref(width), C.byref(height), C.byref(border), C.byref(depth)):
                    break
                values = rectangles(data, width.value, height.value)
                buffer = (Rectangle * len(values))(*values)
                shape.XShapeCombineRectangles(display, window, 2, 0, 0, buffer, len(values), 0, 3)
            x.XSync(display, 0)
            print('ready', flush=True)
    finally:
        shape.XShapeCombineMask(display, window, 2, 0, 0, 0, 0)
        x.XSync(display, 0)
        x.XCloseDisplay(display)

if __name__ == '__main__':
    main()
