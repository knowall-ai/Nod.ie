"""Conservative face-only preview rectangles; this does not establish liveness."""
import math

def isolated_crop(box, other_boxes, width, height):
    def valid(value):
        return (isinstance(value, (list, tuple)) and len(value) == 4
                and all(isinstance(v, (int, float)) and math.isfinite(v) for v in value)
                and value[2] > 0 and value[3] > 0)
    if not valid(box) or width <= 0 or height <= 0:
        return None
    x, y, w, h = box
    left, top = max(0, math.floor(x)), max(0, math.floor(y))
    right, bottom = min(width, math.ceil(x + w)), min(height, math.ceil(y + h))
    if right <= left or bottom <= top or (right-left)*(bottom-top) < w*h*.5:
        return None
    for other in other_boxes:
        if not valid(other):
            return None
        ox, oy, ow, oh = other
        if max(left, ox) < min(right, ox+ow) and max(top, oy) < min(bottom, oy+oh):
            return None
    return left, top, right, bottom
