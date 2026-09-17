/** Renderer geometry is in CSS pixels; native cursor/window bounds are in DIP. */
function validateRegions(value) {
    if (!value || !Number.isFinite(value.width) || !Number.isFinite(value.height) || value.width <= 0 || value.height <= 0 || value.width > 4096 || value.height > 4096 || !Array.isArray(value.regions) || value.regions.length < 1 || value.regions.length > 8 || value.regions.some(r => !r || ['x', 'y', 'width', 'height'].some(k => !Number.isFinite(r[k])) || r.width <= 0 || r.height <= 0 || Math.abs(r.x) > 4096 || Math.abs(r.y) > 4096 || r.width > 4096 || r.height > 4096)) throw new Error('Invalid overlay hit regions');
    return value;
}
function hitsOverlay(cursor, bounds, geometry) {
    // Preserve interaction during loading/recovery, before DOM geometry is available.
    if (!geometry) return true;
    const x = (cursor.x - bounds.x) * geometry.width / bounds.width;
    const y = (cursor.y - bounds.y) * geometry.height / bounds.height;
    return geometry.regions.some(r => Math.pow((x - r.x - r.width / 2) / (r.width / 2), 2) + Math.pow((y - r.y - r.height / 2) / (r.height / 2), 2) <= 1);
}
function trackPointer(win, screen, isDragging, { schedule = setInterval, clear = clearInterval } = {}) {
    let geometry = null, ignoring = false;
    const update = () => {
        if (win.isDestroyed() || !win.isVisible()) return;
        const next = !isDragging() && !hitsOverlay(screen.getCursorScreenPoint(), win.getContentBounds(), geometry);
        if (next !== ignoring) { win.setIgnoreMouseEvents(next); ignoring = next; }
    };
    // Electron forwards ignored mousemove only on Windows/macOS. Native cursor
    // polling also recovers interaction on Linux, without clipping the waveform.
    const timer = schedule(update, 16); timer?.unref?.();
    win.on('closed', () => clear(timer));
    win.on('show', update);
    win.webContents.on('did-start-loading', () => { geometry = null; update(); });
    win.webContents.on('render-process-gone', () => { geometry = null; update(); });
    return { setRegions(value) { geometry = validateRegions(value); update(); }, update, stop: () => clear(timer) };
}
module.exports = { validateRegions, hitsOverlay, trackPointer };
