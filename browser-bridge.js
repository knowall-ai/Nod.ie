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
        renderLipSegment: async audio => { const r = await fetch('/lip/segment', { method: 'POST', headers: { 'Content-Type': 'audio/wav' }, body: audio }); if (!r.ok) throw new Error('Lip sync unavailable'); return new Uint8Array(await r.arrayBuffer()); },
        cancelLipSync: () => post('/lip/cancel'),
        getConfig: async () => window.ENV_CONFIG,
        getSystemPrompt: async () => (await fetch('/system-prompt')).text(),
        clearHistory: window.ENV_CONFIG.VOICE_MODE === 'local' ? () => post('/voice/clear-history') : undefined,
        voiceHealth: () => post('/voice/health'),
        voiceTurn: async audio => { const result = await post('/voice/turn', audio); result.audio = Uint8Array.from(atob(result.audio), c => c.charCodeAt(0)); if (result.video) result.video = Uint8Array.from(atob(result.video), c => c.charCodeAt(0)); return result; },
        voiceCancel: () => post('/voice/cancel'),
        onToggleMute: () => {}, onQuit: () => {}, onConfigChanged: () => {}
    };
}
