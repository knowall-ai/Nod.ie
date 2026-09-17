const { contextBridge, ipcRenderer } = require('electron');
const subscribe = (channel, callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
};
contextBridge.exposeInMainWorld('nodie', {
    platform: 'electron',
    clearHistory: () => ipcRenderer.invoke('clear-history'),
    voiceHealth: () => ipcRenderer.invoke('voice-health'),
    voiceTurn: (audio) => ipcRenderer.invoke('voice-turn', audio),
    voiceCancel: () => ipcRenderer.invoke('voice-cancel'),
    getConfig: () => ipcRenderer.invoke('get-config'),
    getSystemPrompt: () => ipcRenderer.invoke('get-system-prompt'),
    saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
    onToggleMute: (fn) => subscribe('toggle-mute', fn),
    onConfigChanged: (fn) => subscribe('config-changed', fn),
    onQuit: (fn) => subscribe('app-will-quit', fn),
    beginDrag: () => ipcRenderer.send('begin-drag'),
    endDrag: () => ipcRenderer.send('end-drag'),
    getDiagnostics: () => ipcRenderer.invoke('diagnostics-status'),
    getSecurityStatus: () => ipcRenderer.invoke('security-status'),
    scanSecurity: () => ipcRenderer.invoke('security-scan'),
    reviewUpdate: (id) => ipcRenderer.invoke('security-review', id),
    applyUpdate: (id) => ipcRenderer.invoke('security-apply', id),
    dismissUpdate: (id) => ipcRenderer.invoke('security-dismiss', id),
    onSecurityStatus: (fn) => subscribe('security-status-changed', fn)
});
