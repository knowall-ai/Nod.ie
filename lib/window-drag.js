/** Use the full display, including panels; keep enough overlay visible to recover it. */
function dragPosition(origin, cursor, start, size, area) {
    const clamp = (value, min, max) => Math.max(min, Math.min(Math.max(min, max), Math.round(value)));
    const visibleX = Math.min(100, size[0], area.width);
    const visibleY = Math.min(100, size[1], area.height);
    return [
        clamp(start[0] + cursor.x - origin.x, area.x - size[0] + visibleX, area.x + area.width - visibleX),
        clamp(start[1] + cursor.y - origin.y, area.y, area.y + area.height - visibleY)
    ];
}
module.exports = { dragPosition };
