/** Renderer geometry is in CSS pixels; native cursor/window bounds are in DIP. */
function validateRegions(value) {
    if (!value || !Number.isFinite(value.width) || !Number.isFinite(value.height) || value.width <= 0 || value.height <= 0 || value.width > 4096 || value.height > 4096 || !Array.isArray(value.regions) || value.regions.length < 1 || value.regions.length > 8 || value.regions.some(r => !r || ['x', 'y', 'width', 'height'].some(k => !Number.isFinite(r[k])) || r.width <= 0 || r.height <= 0 || Math.abs(r.x) > 4096 || Math.abs(r.y) > 4096 || r.width > 4096 || r.height > 4096)) throw new Error('Invalid overlay hit regions');
    return { width: value.width, height: value.height, regions: value.regions.map(({ x, y, width, height }) => ({ x, y, width, height })) };
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
        if (next !== ignoring) { win.setIgnoreMouseEvents(next, { forward: true }); ignoring = next; }
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
function nativeInputRegion(win, logger) {
    const child = require('node:child_process').spawn('python3', [require('node:path').join(__dirname, '../scripts/x11-input-region.py'), String(win.getNativeWindowHandle().readUInt32LE())], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stopped = false;
    const reset = () => { if (!stopped && child.stdin.writable) child.stdin.write('null\n'); };
    child.on('error', () => logger?.write('warn', 'overlay.input-region-unavailable'));
    child.stderr.on('data', () => {});
    child.stdout.on('data', () => {});
    child.stdin.on('error', () => {});
    child.on('exit', code => { if (!stopped && code) logger?.write('warn', 'overlay.input-region-unavailable'); stopped = true; });
    const stop = () => { if (!stopped) { stopped = true; child.stdin.end(); } };
    win.on('closed', stop);
    win.webContents.on('did-start-loading', reset);
    win.webContents.on('render-process-gone', reset);
    return { setRegions(value) { value = validateRegions(value); if (!stopped && child.stdin.writable) child.stdin.write(JSON.stringify(value) + '\n'); }, stop };
}
module.exports = { validateRegions, hitsOverlay, trackPointer, nativeInputRegion };
