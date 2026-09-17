// Only voice operations are exposed by the loopback web app. No Docker/update API.
if (!window.nodie && window.ENV_CONFIG?.VOICE_MODE === 'local') {
    const post = async (route, body, type = 'application/octet-stream') => {
        const response = await fetch(route, { method: 'POST', headers: { 'Content-Type': type }, body });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Voice request failed');
        return result;
    };
    window.nodie = {
        platform: 'web',
        getConfig: async () => window.ENV_CONFIG,
        getSystemPrompt: async () => (await fetch('/system-prompt')).text(),
        clearHistory: () => post('/voice/clear-history'),
        voiceHealth: () => post('/voice/health'),
        voiceTurn: async audio => { const result = await post('/voice/turn', audio); result.audio = Uint8Array.from(atob(result.audio), c => c.charCodeAt(0)); return result; },
        voiceCancel: () => post('/voice/cancel'),
        onToggleMute: () => {}, onQuit: () => {}, onConfigChanged: () => {}
    };
}
