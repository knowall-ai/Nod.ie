/** Clamp a fixed-origin drag to the destination display's usable desktop. */
function dragPosition(origin, cursor, start, size, area) {
    const clamp = (value, min, max) => Math.max(min, Math.min(Math.max(min, max), Math.round(value)));
    return [
        clamp(start[0] + cursor.x - origin.x, area.x, area.x + area.width - size[0]),
        clamp(start[1] + cursor.y - origin.y, area.y, area.y + area.height - size[1])
    ];
}
module.exports = { dragPosition };
