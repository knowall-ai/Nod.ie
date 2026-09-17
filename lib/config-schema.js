(function (root) {
    const aliases = { UNMUTE_BACKEND_URL: 'unmuteBackendUrl', VOICE_MODEL: 'voiceModel', LLM_MODEL: 'llmModel', ASSISTANT_NAME: 'assistantName', GLOBAL_HOTKEY: 'globalHotkey', AVATAR_ENABLED: 'avatarEnabled' };
    const publicKeys = ['UNMUTE_BACKEND_URL', 'VOICE_MODEL', 'LLM_MODEL', 'ASSISTANT_NAME', 'GLOBAL_HOTKEY', 'AVATAR_ENABLED', 'MUSETALK_HTTP', 'MUSETALK_WS', 'WEB_TEST_PORT', 'VOICE_MODE'];
    function normalize(input = {}) {
        const result = {};
        for (const key of publicKeys) {
            const value = input[key] ?? input[aliases[key]];
            if (value !== undefined && value !== null) result[key] = value;
        }
        result.AVATAR_ENABLED = result.AVATAR_ENABLED !== false && result.AVATAR_ENABLED !== 'false';
        return result;
    }
    function validateSettingsPatch(settings) {
        if (!settings || typeof settings !== 'object' || Object.getPrototypeOf(settings) !== Object.prototype || Object.keys(settings).some(key => !Object.hasOwn(aliases, key))) throw new Error('Unsupported settings');
        if ('AVATAR_ENABLED' in settings && typeof settings.AVATAR_ENABLED !== 'boolean') throw new Error('Invalid avatar setting');
        return settings;
    }
    function validate(input) {
        const config = normalize(input);
        if (config.VOICE_MODE !== 'local' && !config.UNMUTE_BACKEND_URL) throw new Error('UNMUTE_BACKEND_URL must be configured');
        for (const [key, protocols] of Object.entries({ UNMUTE_BACKEND_URL: ['ws:', 'wss:'], MUSETALK_WS: ['ws:', 'wss:'], MUSETALK_HTTP: ['http:', 'https:'] })) {
            if (!config[key]) continue;
            let url;
            try { url = new URL(config[key]); } catch { throw new Error(`${key} must be a valid URL`); }
            if (!protocols.includes(url.protocol) || url.username || url.password || url.hash || url.search) throw new Error(`${key} has an unsupported protocol or embedded credentials/query`);
        }
        for (const key of ['VOICE_MODEL', 'LLM_MODEL', 'ASSISTANT_NAME', 'GLOBAL_HOTKEY']) {
            if (config[key] !== undefined && (typeof config[key] !== 'string' || config[key].length > 1024)) throw new Error(`Invalid ${key}`);
        }
        return config;
    }
    const api = { normalize, validate, validateSettingsPatch, publicKeys, aliases };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.NodieConfigSchema = api;
})(typeof window !== 'undefined' ? window : globalThis);
