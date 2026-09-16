const { app, BrowserWindow, globalShortcut, Tray, Menu, ipcMain, dialog, Notification, session, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const Store = require('electron-store');
const env = require('./config');
const { normalize, validate, aliases } = require('./lib/config-schema');
const { LocalVoice } = require('./lib/local-voice');
const { SecurityMonitor } = require('./security/monitor');
if (!app.requestSingleInstanceLock()) { app.quit(); } else { start(); }
function start() {
    const store = new Store();
    const voice = new LocalVoice();
    let mainWindow, settingsWindow, tray, monitor;
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
    handle('voice-health', () => voice.health());
    handle('voice-turn', audio => voice.converse(audio));
    handle('voice-cancel', () => voice.cancel());
    handle('get-system-prompt', () => fs.readFileSync(path.join(__dirname, 'SYSTEM-PROMPT.md'), 'utf8'));
    handle('save-settings', settings => {
        if (!settings || typeof settings !== 'object' || Object.keys(settings).some(key => !['ASSISTANT_NAME', 'UNMUTE_BACKEND_URL', 'VOICE_MODEL', 'LLM_MODEL', 'GLOBAL_HOTKEY', 'AVATAR_ENABLED'].includes(key))) throw new Error('Unsupported settings');
        if ('AVATAR_ENABLED' in settings && typeof settings.AVATAR_ENABLED !== 'boolean') throw new Error('Invalid avatar setting');
        const next = validate({ ...config(), ...settings });
        for (const key of Object.keys(settings)) store.set(aliases[key], next[key]);
        shortcuts();
        mainWindow.webContents.send('config-changed', next);
        return next;
    }, true);
    ipcMain.on('move-window', (event, delta) => {
        if (!trusted(event) || event.sender !== mainWindow.webContents) return;
        if (!delta || !Number.isFinite(delta.deltaX) || !Number.isFinite(delta.deltaY) || Math.abs(delta.deltaX) > 1000 || Math.abs(delta.deltaY) > 1000) return;
        const [x, y] = mainWindow.getPosition(); mainWindow.setPosition(Math.round(x + delta.deltaX), Math.round(y + delta.deltaY));
    });
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
        mainWindow = secureWindow({ width: 300, height: 300, title: 'Nod.ie', frame: false, transparent: true, alwaysOnTop: true, resizable: false, skipTaskbar: true }, 'index.html');
        const position = store.get('position');
        const { screen } = require('electron');
        const area = screen.getPrimaryDisplay().workArea;
        if (position && Number.isFinite(position.x) && Number.isFinite(position.y) && screen.getAllDisplays().some(d => position.x >= d.workArea.x && position.y >= d.workArea.y && position.x + 300 <= d.workArea.x + d.workArea.width && position.y + 300 <= d.workArea.y + d.workArea.height)) mainWindow.setPosition(position.x, position.y);
        else mainWindow.setPosition(area.x + area.width - 350, area.y + area.height - 350);
        mainWindow.on('moved', () => { const [x, y] = mainWindow.getPosition(); store.set('position', { x, y }); });
        mainWindow.on('close', event => { if (!app.isQuitting) { event.preventDefault(); mainWindow.hide(); } });
        const menu = Menu.buildFromTemplate([{ label: 'Show Nod.ie', click: () => mainWindow.show() }, { label: 'Settings and security updates', click: showSettings }, { label: 'Reload', click: () => mainWindow.reload() }, { label: 'Developer tools', click: () => mainWindow.webContents.openDevTools({ mode: 'detach' }) }, { type: 'separator' }, { label: 'Quit', click: () => app.quit() }]);
        mainWindow.webContents.on('context-menu', () => menu.popup());
        if (fs.existsSync(path.join(__dirname, 'icon.png'))) { tray = new Tray(path.join(__dirname, 'icon.png')); tray.setToolTip('Nod.ie'); tray.setContextMenu(menu); tray.on('click', () => mainWindow.show()); }
        shortcuts();
        monitor = new SecurityMonitor({ stateDir: path.join(app.getPath('userData'), 'security'), onChange: status => { if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.webContents.send('security-status-changed', status); }, notify: count => { if (Notification.isSupported()) { const notice = new Notification({ title: 'Nod.ie: updates recommended', body: `${count} container update recommendation(s). Open Settings to review before applying.` }); notice.on('click', showSettings); notice.show(); } } });
        monitor.start();
    }).catch(error => { console.error(error); app.quit(); });
    app.on('before-quit', () => { app.isQuitting = true; monitor?.stop(); voice.close().catch(() => {}); mainWindow?.webContents.send('app-will-quit'); });
    app.on('will-quit', () => globalShortcut.unregisterAll());
    app.on('second-instance', () => { mainWindow?.show(); mainWindow?.focus(); });
}
