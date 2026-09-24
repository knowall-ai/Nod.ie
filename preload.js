const { contextBridge, ipcRenderer } = require('electron');
const subscribe = (channel, callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
};
contextBridge.exposeInMainWorld('nodie', {
    platform: 'electron',
    transcriptSession: () => ipcRenderer.invoke('transcript-session'),
    saveTranscript: (epoch, turn) => ipcRenderer.invoke('transcript-save', epoch, turn),
    onHistoryCleared: fn => subscribe('history-cleared', fn),


    analyseSpeakers: audio => ipcRenderer.invoke('speaker-analyse', audio),
    cancelSpeakers: () => ipcRenderer.invoke('speaker-cancel'),
    liveSpeakerStatus: () => ipcRenderer.invoke('speaker-live-status'),
    speakerStatus: () => ipcRenderer.invoke('speaker-status'),
    speakerEnabled: enabled => ipcRenderer.invoke('speaker-enabled', enabled),
    speakerEdit: (id, name) => ipcRenderer.invoke('speaker-edit', id, name),
    speakerMerge: (source, target) => ipcRenderer.invoke('speaker-merge', source, target),
    speakerForget: () => ipcRenderer.invoke('speaker-forget'),
    clearHistory: () => ipcRenderer.invoke('clear-history'),
    analyseFaces: image => ipcRenderer.invoke('face-analyse', image),
    cancelFaces: () => ipcRenderer.invoke('face-cancel'),
    faceStatus: () => ipcRenderer.invoke('face-status'),
    faceEnabled: enabled => ipcRenderer.invoke('face-enabled', enabled),
    faceEdit: (id, name) => ipcRenderer.invoke('face-edit', id, name),
    faceMerge: (source, target) => ipcRenderer.invoke('face-merge', source, target),
    faceForget: () => ipcRenderer.invoke('face-forget'),
    analyseVision: image => ipcRenderer.invoke('vision-analyse', image),
    cancelVision: () => ipcRenderer.invoke('vision-cancel'),
    voiceHealth: () => ipcRenderer.invoke('voice-health'),
    voiceTurn: async (audio) => {
        const result = await ipcRenderer.invoke('voice-turn', audio);
        if (result.failure) { const error = new Error(result.failure.error); error.code = result.failure.code; throw error; }
        return result;
    },
    renderLipSegment: (audio, trim) => ipcRenderer.invoke('lip-segment', audio, trim),
    cancelLipSync: () => ipcRenderer.invoke('lip-cancel'),
    voiceCancel: () => ipcRenderer.invoke('voice-cancel'),
    getConfig: () => ipcRenderer.invoke('get-config'),
    getSystemPrompt: () => ipcRenderer.invoke('get-system-prompt'),
    openSettings: () => ipcRenderer.invoke('open-settings'),
    saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
    onToggleMute: (fn) => subscribe('toggle-mute', fn),
    onConfigChanged: (fn) => subscribe('config-changed', fn),
    onQuit: (fn) => subscribe('app-will-quit', fn),
    setHitRegions: value => ipcRenderer.send('overlay-hit-regions', value),
    beginDrag: () => ipcRenderer.send('begin-drag'),
    endDrag: () => ipcRenderer.invoke('end-drag'),
    getDiagnostics: () => ipcRenderer.invoke('diagnostics-status'),
    getSecurityStatus: () => ipcRenderer.invoke('security-status'),
    scanSecurity: () => ipcRenderer.invoke('security-scan'),
    reviewUpdate: (id) => ipcRenderer.invoke('security-review', id),
    applyUpdate: (id) => ipcRenderer.invoke('security-apply', id),
    dismissUpdate: (id) => ipcRenderer.invoke('security-dismiss', id),
    onSecurityStatus: (fn) => subscribe('security-status-changed', fn)
});
