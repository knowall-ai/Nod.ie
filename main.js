const { app, BrowserWindow, globalShortcut, Tray, Menu, ipcMain, dialog, Notification, session, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const Store = require('electron-store');
const env = require('./config');
const { normalize, validate, validateSettingsPatch, aliases } = require('./lib/config-schema');
const { LocalVoice } = require('./lib/local-voice');
const { SecurityMonitor } = require('./security/monitor');
const { Logger } = require('./lib/logger');
const { Diagnostics } = require('./lib/diagnostics');
const { dragPosition } = require('./lib/window-drag');
if (!app.requestSingleInstanceLock()) { app.quit(); } else { start(); }
function start() {
    const store = new Store();
    const logger = new Logger(path.join(app.getPath('userData'), 'logs'));
    const diagnostics = new Diagnostics({ logger, notify: count => { if (Notification.isSupported()) new Notification({ title: 'Nod.ie: activity needs attention', body: `${count} health/activity signal(s). Open Settings to inspect; these may be expected changes.` }).show(); } });
    const historyStore = new (require('./lib/conversation-history').ConversationHistory)(path.join(require('node:os').homedir(), '.config/nodie/conversations/local.json'));
    const voice = new LocalVoice({ logger, historyStore, avatarEnabled: () => config().AVATAR_ENABLED, diagnostics: () => diagnostics.status() });
    let mainWindow, settingsWindow, tray, monitor, dragTimer, dragDeadline, dragMoved = false, updateDrag;
    const stopDrag = () => { updateDrag?.(); clearInterval(dragTimer); clearTimeout(dragDeadline); dragTimer = null; updateDrag = null; return dragMoved; };
    const config = () => normalize({ ...env, ...Object.fromEntries(Object.entries(aliases).map(([key, alias]) => [key, store.get(alias) ?? env[key]])) });
    const isLocalFrame = (event, file) => event.senderFrame === event.sender.mainFrame && event.senderFrame.url === pathToFileURL(path.join(__dirname, file)).href;
    const trusted = event => [mainWindow, settingsWindow].some(win => win && !win.isDestroyed() && event.sender === win.webContents) && (isLocalFrame(event, 'index.html') || isLocalFrame(event, 'settings.html'));
    const handle = (channel, callback, settingsOnly = false) => ipcMain.handle(channel, (event, ...args) => {
        if (!trusted(event) || (settingsOnly && event.sender !== settingsWindow?.webContents)) throw new Error('Untrusted IPC sender');
        return callback(...args);
    });
    function secureWindow(options, file) {
        const win = new BrowserWindow({ ...options, webPreferences: { preload: path.join(__dirname, 'preload.js'), nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, autoplayPolicy: 'no-user-gesture-required' } });
        win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
        win.webContents.on('will-navigate', event => event.preventDefault());
        win.webContents.on('will-attach-webview', event => event.preventDefault());
        win.loadFile(file);
        return win;
    }
    function showSettings() {
        if (settingsWindow && !settingsWindow.isDestroyed()) return settingsWindow.focus();
        settingsWindow = secureWindow({ width: 780, height: 850, parent: mainWindow, title: 'Nod.ie Settings' }, 'settings.html');
        settingsWindow.on('closed', () => { settingsWindow = null; });
    }
    function shortcuts() {
        globalShortcut.unregisterAll();
        const hotkey = config().GLOBAL_HOTKEY;
        if (hotkey) {
            try { if (!globalShortcut.register(hotkey, () => mainWindow.webContents.send('toggle-mute'))) console.warn('Mute shortcut unavailable'); }
            catch { console.warn('Invalid mute shortcut'); }
        }
        globalShortcut.register('CommandOrControl+Shift+A', () => mainWindow.show());
        globalShortcut.register('CommandOrControl+Shift+Q', () => app.quit());
    }
    handle('get-config', config);
    handle('open-settings', () => { showSettings(); return { status: 'opened' }; });
    handle('diagnostics-status', () => diagnostics.status());
    const streamLips = new (require('./lib/streaming-lip-sync').StreamingLipSync)({ url: env.getConfig('LOCAL_LIP_SYNC_URL'), enabled: () => config().AVATAR_ENABLED });
    handle('lip-segment', (audio, trim) => streamLips.render(audio, undefined, trim));
    handle('lip-cancel', () => streamLips.cancel());
    app.on('before-quit', () => streamLips.cancel());
    handle('voice-health', () => voice.health());
    handle('voice-turn', async audio => {
        try { return await voice.converse(audio); }
        catch (error) { return { failure: require('./lib/voice-error').publicError(error) }; }
    });
    handle('clear-history', () => voice.clearHistory(), true);
    handle('voice-cancel', () => voice.cancel());
    handle('get-system-prompt', () => fs.readFileSync(path.join(__dirname, 'SYSTEM-PROMPT.md'), 'utf8'));
    handle('save-settings', settings => {
        let stage = 'validation';
        try {
            validateSettingsPatch(settings);
            const next = validate({ ...config(), ...settings });
            stage = 'storage';
            store.set(Object.fromEntries(Object.keys(settings).map(key => [aliases[key], next[key]])));
            stage = 'apply';
            shortcuts();
            mainWindow.webContents.send('config-changed', next);
            logger.write('info', 'settings.saved', { count: Object.keys(settings).length });
            return next;
        } catch (error) {
            logger.write('error', 'settings.failed', { stage, code: stage === 'validation' ? 'invalid-settings' : 'save-failed' });
            throw error;
        }
    }, true);
    ipcMain.on('begin-drag', event => {
        if (!trusted(event) || event.sender !== mainWindow.webContents || dragTimer) return;
        const { screen } = require('electron');
        const origin = screen.getCursorScreenPoint();
        const start = mainWindow.getPosition();
        const size = mainWindow.getSize();
        let last = start;
        // Cursor and window positions are both desktop-independent pixels. Renderer
        // screenX/screenY mix coordinate spaces on scaled X11 desktops.
        dragMoved = false;
        updateDrag = () => {
            if (mainWindow.isDestroyed()) return;
            const point = screen.getCursorScreenPoint();
            if (!dragMoved && Math.hypot(point.x - origin.x, point.y - origin.y) < 5) return;
            dragMoved = true;
            const next = dragPosition(origin, point, start, size, screen.getDisplayNearestPoint(point).bounds);
            // Repeated identical moves can fight the window manager's edge constraints.
            if (next[0] === last[0] && next[1] === last[1]) return;
            last = next;
            mainWindow.setPosition(...next);
        };
        dragTimer = setInterval(updateDrag, 16);
        dragDeadline = setTimeout(stopDrag, 30000);
    });
    ipcMain.handle('end-drag', event => { if (!trusted(event) || event.sender !== mainWindow.webContents) throw new Error('Untrusted drag'); return stopDrag(); });
    handle('security-status', () => monitor.status());
    handle('security-scan', () => monitor.scan(), true);
    handle('security-dismiss', id => monitor.dismiss(id), true);
    handle('security-review', id => monitor.prepare(id), true);
    handle('security-apply', async id => {
        const plan = monitor.getPlan(id);
        if (!plan.executable) { await shell.openExternal(plan.guide); return { status: 'manual', message: 'Official update instructions opened. No containers changed.' }; }
        const result = await dialog.showMessageBox(settingsWindow, { type: 'warning', title: 'Approve this update', message: `Apply the reviewed update to ${plan.name}?`, detail: `${plan.summary}\n\nThe service will restart. Other services will not be updated. No automatic database rollback will be attempted.`, buttons: ['Cancel', 'Apply update'], defaultId: 0, cancelId: 0, checkboxLabel: 'I have verified the service-specific backup/recovery requirements and accept the restart.', checkboxChecked: false });
        if (result.response !== 1 || !result.checkboxChecked) return { status: 'cancelled' };
        return monitor.apply(id);
    }, true);
    app.whenReady().then(() => {
        session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) => {
            callback(contents === mainWindow?.webContents && contents.getURL() === pathToFileURL(path.join(__dirname, 'index.html')).href && permission === 'media' && !details.mediaTypes?.includes('video'));
        });
        session.defaultSession.setPermissionCheckHandler((contents, permission, _origin, details) => contents === mainWindow?.webContents && permission === 'media' && details.mediaType !== 'video');
        mainWindow = secureWindow({ width: 300, height: 300, title: 'Nod.ie', frame: false, transparent: true, alwaysOnTop: true, resizable: false, skipTaskbar: true, ...(process.platform === 'linux' ? { type: 'dock' } : {}) }, 'index.html');
        // A Linux dock overlay avoids KWin's normal-window panel avoidance and resize drift.
        mainWindow.setAlwaysOnTop(true, 'screen-saver');
        const position = store.get('position');
        const { screen } = require('electron');
        const area = screen.getPrimaryDisplay().workArea;
        if (position && Number.isFinite(position.x) && Number.isFinite(position.y) && screen.getAllDisplays().some(d => { const p = dragPosition({ x: 0, y: 0 }, { x: 0, y: 0 }, [position.x, position.y], [300, 300], d.bounds); return p[0] === position.x && p[1] === position.y; })) mainWindow.setPosition(position.x, position.y);
        else mainWindow.setPosition(area.x + area.width - 350, area.y + area.height - 350);
        mainWindow.on('moved', () => { const [x, y] = mainWindow.getPosition(); store.set('position', { x, y }); });
        mainWindow.on('close', event => { if (!app.isQuitting) { event.preventDefault(); mainWindow.hide(); } });
        const menu = Menu.buildFromTemplate([{ label: 'Show Nod.ie', click: () => mainWindow.show() }, { label: 'Settings and security updates', click: showSettings }, { label: 'Reload', click: () => mainWindow.reload() }, { label: 'Developer tools', click: () => mainWindow.webContents.openDevTools({ mode: 'detach' }) }, { type: 'separator' }, { label: 'Quit', click: () => app.quit() }]);
        mainWindow.webContents.on('context-menu', () => menu.popup());
        if (fs.existsSync(path.join(__dirname, 'icon.png'))) { tray = new Tray(path.join(__dirname, 'icon.png')); tray.setToolTip('Nod.ie'); tray.setContextMenu(menu); tray.on('click', () => mainWindow.show()); }
        shortcuts();
        monitor = new SecurityMonitor({ stateDir: path.join(app.getPath('userData'), 'security'), onChange: status => { if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.webContents.send('security-status-changed', status); }, notify: count => { if (Notification.isSupported()) { const notice = new Notification({ title: 'Nod.ie: updates recommended', body: `${count} container update recommendation(s). Open Settings to review before applying.` }); notice.on('click', showSettings); notice.show(); } } });
        diagnostics.start();
        monitor.start().catch(() => logger.write('error', 'updates.monitor-failed'));
        logger.write('info', 'desktop.started');
    }).catch(error => { logger.write('error', 'desktop.start-failed', { code: error.code || 'unknown' }); app.quit(); });
    app.on('before-quit', () => { app.isQuitting = true; stopDrag(); monitor?.stop(); diagnostics.stop(); voice.close().catch(() => {}); mainWindow?.webContents.send('app-will-quit'); });
    app.on('will-quit', () => globalShortcut.unregisterAll());
    app.on('second-instance', () => { mainWindow?.show(); mainWindow?.focus(); });
}
