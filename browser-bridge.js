// Only voice operations are exposed by the loopback web app. No Docker/update API.
if (!window.nodie && window.ENV_CONFIG) {
    const post = async (route, body, type = 'application/octet-stream') => {
        const response = await fetch(route, { method: 'POST', headers: { 'Content-Type': type }, body });
        const result = await response.json();
        if (!response.ok) { const error = new Error(result.error || 'Voice request failed'); error.code = result.code; throw error; }
        return result;
    };
    window.nodie = {
        platform: 'web',
        renderLipSegment: async (audio, trim) => { const r = await fetch('/lip/segment', { method: 'POST', headers: { 'Content-Type': 'audio/wav', ...(trim ? {'X-Nodie-Start-Frame': String(trim.startFrame), 'X-Nodie-Frame-Count': String(trim.frameCount)} : {}) }, body: audio }); if (!r.ok) throw new Error('Lip sync unavailable'); return new Uint8Array(await r.arrayBuffer()); },
        cancelLipSync: () => post('/lip/cancel'),
        getConfig: async () => window.ENV_CONFIG,
        getSystemPrompt: async () => (await fetch('/system-prompt')).text(),
        transcriptSession: () => post('/transcript/session'),
        saveTranscript: (epoch, turn) => post('/transcript/save', JSON.stringify({ epoch, turn }), 'application/json'),
        clearHistory: async () => {
            const result = await post('/transcript/clear');
            window.dispatchEvent(new CustomEvent('history-cleared', { detail: result }));
            return result;
        },
        onHistoryCleared: fn => window.addEventListener('history-cleared', event => fn(event.detail)),
        analyseVision: image => post('/vision/analyse', image, 'image/jpeg'),
        cancelVision: () => post('/vision/cancel'),
        voiceHealth: () => post('/voice/health'),
        voiceTurn: async audio => { const result = await post('/voice/turn', audio); result.audio = Uint8Array.from(atob(result.audio), c => c.charCodeAt(0)); if (result.video) result.video = Uint8Array.from(atob(result.video), c => c.charCodeAt(0)); return result; },
        voiceCancel: () => post('/voice/cancel'),
        onToggleMute: () => {}, onQuit: () => {}, onConfigChanged: () => {}
    };
}
