/** Renderer geometry is in CSS pixels; native cursor/window bounds are in DIP. */
function validateRegions(value) {
    const shape = (v, keys) => v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
    const pixel = (v, minimum = 0) => Number.isInteger(v) && v >= minimum && v <= 4096;
    if (!shape(value, ['width', 'height', 'regions']) || !pixel(value.width, 1) || !pixel(value.height, 1) || !Array.isArray(value.regions) || value.regions.length > 8 || value.regions.some(r => !shape(r, ['x', 'y', 'width', 'height']) || !pixel(r.x) || !pixel(r.y) || !pixel(r.width, 1) || !pixel(r.height, 1))) throw new Error('Invalid overlay hit regions');
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
    let geometry = null, ignoring = false, fullscreen=false;
    const update = () => {
        if (win.isDestroyed() || !win.isVisible()) return;
        const next = !fullscreen && !isDragging() && !hitsOverlay(screen.getCursorScreenPoint(), win.getContentBounds(), geometry);
        if (next !== ignoring) { win.setIgnoreMouseEvents(next, { forward: true }); ignoring = next; }
    };
    // Electron forwards ignored mousemove only on Windows/macOS. Native cursor
    // polling also recovers interaction on Linux, without clipping the waveform.
    const timer = schedule(update, 16); timer?.unref?.();
    win.on('closed', () => clear(timer));
    win.on('show', update);
    win.webContents.on('did-start-loading', () => { geometry = null; update(); });
    win.webContents.on('render-process-gone', () => { geometry = null; update(); });
    return { setFullScreen(value){fullscreen=Boolean(value);update();}, setRegions(value) { geometry = validateRegions(value); update(); }, update, stop: () => clear(timer) };
}
const closedHelpers = new WeakSet();
/** Await helper close, with a kill backstop and an absolute cleanup deadline. */
function closeHelper(child, timeout = 500) {
    return new Promise(resolve => {
        if (closedHelpers.has(child)) return resolve();
        let killTimer, deadline;
        const done = () => { clearTimeout(killTimer); clearTimeout(deadline); child.removeListener('close', done); resolve(); };
        child.once('close', done);
        killTimer = setTimeout(() => { try { child.kill('SIGKILL'); } catch {} }, timeout);
        deadline = setTimeout(done, timeout + 250);
        try { child.stdin.end(); } catch { try { child.kill('SIGKILL'); } catch {} }
    });
}
function nativeInputRegion(win, logger, { spawn = require('node:child_process').spawn } = {}) {
    let stopped = false, painted = false, fullscreen=false, geometry = null, child = null, retry, closing, delay = 250;
    const publish = () => { if (!stopped && painted && geometry && child?.stdin.writable) child.stdin.write(JSON.stringify(fullscreen?null:geometry) + '\n'); };
    const launch = () => {
        if(stopped || win.isDestroyed()) return;
        const current = child = spawn('python3', [require('node:path').join(__dirname, '../scripts/x11-input-region.py'), String(win.getNativeWindowHandle().readUInt32LE())], { stdio: ['pipe', 'pipe', 'pipe'] });
        current.once('close', () => {
            closedHelpers.add(current);
            if(child===current)child=null;
            if(!stopped) { logger?.write('warn','overlay.input-region-unavailable'); retry=setTimeout(launch,delay);retry.unref?.();delay=Math.min(delay*2,5000); }
        });
        current.on('error', () => {}); // spawn failures also emit close; retry only there.
        current.stderr.on('data', () => {});current.stdout.on('data', () => {delay=250;});current.stdin.on('error', () => {});
        publish();
    };
    win.once('ready-to-show', () => { painted = true; publish(); });
    win.on('show', publish);win.on('resize', publish);win.webContents.on('did-finish-load', publish);
    const reset = () => { geometry = null; if (!stopped && child?.stdin.writable) child.stdin.write('null\n'); };
    const stop = () => { stopped = true;clearTimeout(retry);return closing ||= child ? closeHelper(child) : Promise.resolve(); };
    win.on('closed', stop);win.webContents.on('did-start-loading', reset);win.webContents.on('render-process-gone', reset);
    launch();
    return { setFullScreen(value){fullscreen=Boolean(value);publish();}, setRegions(value) { geometry = validateRegions(value); publish(); }, stop };
}
module.exports = { validateRegions, hitsOverlay, trackPointer, nativeInputRegion, closeHelper };
