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
    const journal = new (require('./lib/event-journal').EventJournal)(path.join(require('node:os').homedir(), '.config/nodie/events/journal.json'), {timezone:env.getConfig('NODIE_TIMEZONE') || Intl.DateTimeFormat().resolvedOptions().timeZone});
    const debug=(source,text)=>mainWindow?.webContents.send('debug-event',{source,text});
    journal.onEvent=event=>debug('Journal',`${event.source}: ${event.subject} — ${event.kind}${event.uncertain?' (uncertain)':''}`);
    void journal.load().catch(()=>console.warn('Event journal unavailable'));
    const nodePublisher=new(require('./lib/node-status-publisher').NodeStatusPublisher)(path.join(require('node:os').homedir(),'.config/nodie/events/node-status.json'));
    nodePublisher.start();app.on('before-quit',()=>nodePublisher.stop());
    const speakerRecognition = new (require('./lib/speaker-recognition').SpeakerRecognition)();
    const voice = new LocalVoice({ logger, historyStore, journal, speakerRecognition, avatarEnabled: () => config().AVATAR_ENABLED, diagnostics: () => diagnostics.status() });
    let windowMode;
    let mainWindow, pointerTracker, settingsWindow, tray, monitor, dragTimer, dragDeadline, dragMoved = false, updateDrag;
    const stopDrag = () => { updateDrag?.(); clearInterval(dragTimer); clearTimeout(dragDeadline); dragTimer = null; updateDrag = null; return dragMoved; };
    const config = () => normalize({ ...env, ...Object.fromEntries(Object.entries(aliases).map(([key, alias]) => [key, store.get(alias) ?? env[key]])) });
    const isLocalFrame = (event, file) => event.senderFrame === event.sender.mainFrame && event.senderFrame.url === pathToFileURL(path.join(__dirname, file)).href;
    const trusted = event => [mainWindow, settingsWindow].some(win => win && !win.isDestroyed() && event.sender === win.webContents) && (isLocalFrame(event, 'index.html') || isLocalFrame(event, 'settings.html'));
    const handle = (channel, callback, settingsOnly = false) => ipcMain.handle(channel, (event, ...args) => {
        if (!trusted(event) || (settingsOnly && event.sender !== settingsWindow?.webContents)) throw new Error('Untrusted IPC sender');
        return callback(...args);
    });
    function secureWindow(options, file) {
        const win = new BrowserWindow({ ...options, webPreferences: { preload: path.join(__dirname, 'preload.js'), nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, backgroundThrottling: file !== 'index.html', autoplayPolicy: 'no-user-gesture-required' } });
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
        windowMode?.syncEscape();
    }
    handle('window-action', value => windowMode.action(value));
    handle('get-config', config);
    handle('open-settings', () => { showSettings(); return { status: 'opened' }; });
    handle('diagnostics-status', () => diagnostics.status());
    const streamLips = new (require('./lib/streaming-lip-sync').StreamingLipSync)({ url: env.getConfig('LOCAL_LIP_SYNC_URL'), enabled: () => config().AVATAR_ENABLED });
    handle('lip-segment', (audio, trim) => streamLips.render(audio, undefined, trim));
    handle('lip-cancel', () => streamLips.cancel());
    app.on('before-quit', () => streamLips.cancel());

    const vision = new (require('./lib/vision-analysis').VisionAnalysis)({ url: env.getConfig('OLLAMA_URL', 'http://127.0.0.1:11434'), model: env.getConfig('LOCAL_VISION_MODEL', env.LLM_MODEL || 'nodie-qwen3.5:9b') });
    const faces = new (require('./lib/face-recognition').FaceRecognition)();
    const recorder=new(require('./lib/journal-recorder').JournalRecorder)(journal,debug);
    handle('face-analyse',image=>recorder.capture(()=>faces.analyse(image),result=>{debug('Face',result.state==='ready'?result.faces.map(f=>f.name?`Possible match: ${f.name}`:'Unknown person').join('; ')||'No usable face':result.state);return result.state==='ready'?result.faces.map(f=>({source:'face',kind:f.name?'recognised':'observed',subject:f.name||'Unknown person',uncertain:true})):[];}));
    handle('face-cancel', () => faces.cancel());
    handle('face-status', () => faces.store.status(), true);
    handle('face-enabled', enabled => { faces.cancel(); return faces.store.configure(enabled); }, true);
    handle('face-edit', async (id, name) => {await faces.store.edit(id,name);if(name)recorder.record({source:'face',kind:'name-confirmed',subject:name,uncertain:false});}, true);
    handle('face-merge', (source, target) => faces.store.merge(source, target), true);
    handle('face-forget', () => { faces.cancel(); return faces.store.forget(); }, true);
    app.on('before-quit', () => faces.cancel());
    const {SceneDelta,CuriosityLedger}=require('./lib/curiosity');
    const sceneDelta=new SceneDelta();
    const curiosityLedger=new CuriosityLedger(path.join(require('node:os').homedir(),'.config/nodie/events/curiosity.json'),{timezone:journal.timezone});
    let curiosityCandidate;
    const observeCuriosity=(scene,capturedAt)=>{
        const at=Date.parse(capturedAt);
        if(!Number.isFinite(at)||Date.now()-at>20000||at>Date.now())return;
        const events=sceneDelta.observe(scene,at);
        if(!events.length)return;
        const candidate=events[0];
        curiosityCandidate={...candidate,capturedAt,token:require('node:crypto').randomUUID()};
        debug('Curiosity','New visual change: '+candidate.key);
        return {token:curiosityCandidate.token,capturedAt};
    };
    handle('curiosity-claim',async token=>{
        const c=curiosityCandidate;
        if(!c||c.token!==token||Date.now()-Date.parse(c.capturedAt)>20000)return {reason:'observation expired'};
        curiosityCandidate=null;
        const result=await curiosityLedger.claim(c,config().CURIOSITY_LEVEL);
        return result.token?{event:{...c,token:result.token,recentlyRaised:result.recentlyRaised}}:result;
    });
    handle('curiosity-outcome',(token,outcome)=>curiosityLedger.outcome(token,outcome));
    const journalVision=new(require('./lib/journal-vision').JournalVision)({journal,publish:debug,onScene:observeCuriosity,vision:new(require('./lib/vision-analysis').VisionAnalysis)({url:env.getConfig('OLLAMA_URL','http://127.0.0.1:11434'),model:env.getConfig('LOCAL_VISION_MODEL',env.LLM_MODEL||'nodie-qwen3.5:9b'),timeoutMs:3000})});
    handle('journal-frame',(image,capturedAt)=>journalVision.analyse(image,capturedAt));
    handle('journal-cancel',reset=>{journalVision.cancel(reset===true);if(reset===true){sceneDelta.reset();curiosityCandidate=null;}});
    handle('journal-list',()=>journal.load(),true);
    handle('journal-enabled',value=>{journalVision.cancel(true);return journal.enabled(value);},true);
    handle('journal-retention',days=>journal.configure(days),true);
    handle('journal-clear',async()=>{journalVision.cancel(true);sceneDelta.reset();curiosityCandidate=null;await curiosityLedger.clear();return journal.clear();},true);
    app.on('before-quit',()=>journalVision.cancel());
    handle('vision-analyse' , image => vision.analyse(image));
    handle('vision-cancel', () => vision.cancel());
    app.on('before-quit', () => vision.cancel());
    handle('voice-health', () => voice.health());
    handle('voice-turn', async audio => {
        try { return await voice.converse(audio); }
        catch (error) { return { failure: require('./lib/voice-error').publicError(error) }; }
    });
    handle('transcript-session', async () => ({ epoch: (await historyStore.load()).epoch }));
    handle('transcript-save', (epoch, turn) => historyStore.upsert(epoch, turn));
    handle('clear-history', async () => {
        const result = await voice.clearHistory();
        mainWindow?.webContents.send('history-cleared', { epoch: (await historyStore.load()).epoch });
        return result;
    }, true);

    const liveSpeakers = new (require('./lib/live-speakers').LiveSpeakers)(speakerRecognition);
    const recognitionNames=new(require('./lib/recognition-names').RecognitionNames)({faces,voices:{store:speakerRecognition.store,forInterval:(start,end)=>liveSpeakers.forInterval(start,end)},classify:require('./lib/recognition-intent').recognitionIntent({url:env.getConfig('OLLAMA_URL'),model:env.LLM_MODEL||env.getConfig('LOCAL_LLM_MODEL')}),record:event=>recorder.record(event)});
    voice.proposeSpeakerName=async(observation,text,previousAssistant)=>{const proposal=await recognitionNames.proposeLocal(observation,text,previousAssistant);if(proposal.status==='pending')mainWindow?.webContents.send('recognition-proposal',proposal);return proposal;};
    handle('recognition-propose',turn=>recognitionNames.propose(turn));
    handle('recognition-confirm',(token,accepted)=>recognitionNames.confirm(token,accepted));
    handle('recognition-cancel',()=>recognitionNames.cancel());
    handle('speaker-analyse',(audio,interval)=>recorder.capture(()=>liveSpeakers.analyse(audio,interval),result=>{if(!result)return [];debug('Voice recognition',result.speakers.map(s=>s.name&&!s.uncertain?`Possible match: ${s.name}`:'Unknown speaker').join('; '));return result.speakers.map(s=>({source:'voice',kind:s.name&&!s.uncertain?'recognised':'observed',subject:s.name&&!s.uncertain?s.name:'Unknown speaker',uncertain:true}));}));
    handle('speaker-cancel', () => liveSpeakers.cancel());
    handle('speaker-live-status', async () => ({ enabled: (await speakerRecognition.store.status()).enabled }));
    app.on('before-quit', () => liveSpeakers.cancel());
    handle('speaker-status', () => speakerRecognition.store.status(), true);
    handle('speaker-enabled', enabled => speakerRecognition.store.configure(enabled), true);
    handle('speaker-edit', async (id, name) => {await speakerRecognition.store.edit(id,name);if(name)recorder.record({source:'voice',kind:'name-confirmed',subject:name,uncertain:false});}, true);
    handle('speaker-merge', (source, target) => speakerRecognition.store.merge(source, target), true);
    handle('speaker-forget', () => speakerRecognition.store.forget(), true);
    handle('voice-cancel', () => {voice.cancel();recognitionNames.cancel();});
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
    ipcMain.on('overlay-hit-regions', (event, value) => {
        if (!trusted(event) || event.sender !== mainWindow?.webContents) return;
        try { pointerTracker?.setRegions(value); } catch { logger.write('warn', 'overlay.invalid-hit-regions'); }
    });
    ipcMain.on('begin-drag', event => {
        if (!trusted(event) || event.sender !== mainWindow.webContents || dragTimer || windowMode?.isFullscreen()) return;
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
            callback(contents === mainWindow?.webContents && contents.getURL() === pathToFileURL(path.join(__dirname, 'index.html')).href && permission === 'media');
        });
        session.defaultSession.setPermissionCheckHandler((contents, permission, _origin, details) => contents === mainWindow?.webContents && permission === 'media' && contents.getURL() === pathToFileURL(path.join(__dirname, 'index.html')).href);
        mainWindow = secureWindow({ width: 300, height: 300, title: 'Nod.ie', frame: false, transparent: true, alwaysOnTop: true, resizable: false, skipTaskbar: true, ...(process.platform === 'linux' ? { type: 'dock' } : {}) }, 'index.html');
        // A Linux dock overlay avoids KWin's normal-window panel avoidance and resize drift.
        mainWindow.setAlwaysOnTop(true, 'screen-saver');
        const input = require('./lib/window-hit-test');
        pointerTracker = process.platform === 'linux' && process.env.DISPLAY ? input.nativeInputRegion(mainWindow, logger) : input.trackPointer(mainWindow, require('electron').screen, () => Boolean(dragTimer));
        windowMode=require('./lib/window-controls').windowControls(mainWindow,pointerTracker,globalShortcut);
        const position = store.get('position');
        const { screen } = require('electron');
        const area = screen.getPrimaryDisplay().workArea;
        if (position && Number.isFinite(position.x) && Number.isFinite(position.y) && screen.getAllDisplays().some(d => { const p = dragPosition({ x: 0, y: 0 }, { x: 0, y: 0 }, [position.x, position.y], [300, 300], d.bounds); return p[0] === position.x && p[1] === position.y; })) mainWindow.setPosition(position.x, position.y);
        else mainWindow.setPosition(area.x + area.width - 350, area.y + area.height - 350);
        mainWindow.on('moved', () => { if(windowMode.isFullscreen())return; const [x, y] = mainWindow.getPosition(); store.set('position', { x, y }); });
        mainWindow.on('close', event => { if (!app.isQuitting) { event.preventDefault(); mainWindow.hide(); } });
        const menu = Menu.buildFromTemplate([{ label: 'Show Nod.ie', click: () => mainWindow.show() }, { label: 'Settings and security updates', click: showSettings }, { label: 'Reload', click: () => mainWindow.reload() }, { label: 'Developer tools', click: () => mainWindow.webContents.openDevTools({ mode: 'detach' }) }, { type: 'separator' }, { label: 'Quit', click: () => app.quit() }]);
        mainWindow.webContents.on('context-menu', () => menu.popup());
        const trayIcon = path.join(__dirname, 'assets/icons/tray.png');
        if (fs.existsSync(trayIcon)) { tray = new Tray(trayIcon); tray.setToolTip('Nod.ie'); tray.setContextMenu(menu); tray.on('click', () => mainWindow.show()); }
        shortcuts();
        monitor = new SecurityMonitor({ stateDir: path.join(app.getPath('userData'), 'security'), onChange: status => { if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.webContents.send('security-status-changed', status); }, notify: count => { if (Notification.isSupported()) { const notice = new Notification({ title: 'Nod.ie: updates recommended', body: `${count} container update recommendation(s). Open Settings to review before applying.` }); notice.on('click', showSettings); notice.show(); } } });
        diagnostics.start();
        monitor.start().catch(() => logger.write('error', 'updates.monitor-failed'));
        logger.write('info', 'desktop.started');
    }).catch(error => { logger.write('error', 'desktop.start-failed', { code: error.code || 'unknown' }); app.quit(); });
    let quitCleanup = false;
    app.on('before-quit', event => {
        if (quitCleanup) return;
        event.preventDefault();
        if (app.isQuitting) return;
        app.isQuitting = true;
        stopDrag(); monitor?.stop(); diagnostics.stop(); voice.close().catch(() => {});
        mainWindow?.webContents.send('app-will-quit');
        (async () => {
            try { await pointerTracker?.stop(); }
            finally { quitCleanup = true; app.quit(); }
        })().catch(() => {});
    });
    app.on('will-quit', () => globalShortcut.unregisterAll());
    app.on('second-instance', () => { mainWindow?.show(); mainWindow?.focus(); });
}
