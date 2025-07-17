/**
 * Web-compatible configuration for Nod.ie
 * Since we can't read .env files in the browser, we use window.ENV_CONFIG or defaults
 */

// Get config from window or use defaults
const envConfig = (typeof window !== 'undefined' && window.ENV_CONFIG) || {};

// Default configuration
const config = {
    // Port configurations
    UNMUTE_BACKEND_PORT: envConfig.UNMUTE_BACKEND_PORT || '8767',
    UNMUTE_MCP_BACKEND_PORT: envConfig.UNMUTE_MCP_BACKEND_PORT || '8766',
    MUSETALK_PORT: envConfig.MUSETALK_PORT || '8765',
    WEB_TEST_PORT: envConfig.WEB_TEST_PORT || '8095',
    
    // URLs
    UNMUTE_BACKEND_URL: envConfig.UNMUTE_BACKEND_URL || `ws://localhost:${envConfig.UNMUTE_BACKEND_PORT || '8767'}`,
    UNMUTE_MCP_BACKEND_URL: envConfig.UNMUTE_MCP_BACKEND_URL || `ws://localhost:${envConfig.UNMUTE_MCP_BACKEND_PORT || '8766'}`,
    MUSETALK_URL: envConfig.MUSETALK_URL || `ws://localhost:${envConfig.MUSETALK_PORT || '8765'}`,
    
    // HTTP URLs
    UNMUTE_BACKEND_HTTP: envConfig.UNMUTE_BACKEND_HTTP || `http://localhost:${envConfig.UNMUTE_BACKEND_PORT || '8767'}`,
    UNMUTE_MCP_BACKEND_HTTP: envConfig.UNMUTE_MCP_BACKEND_HTTP || `http://localhost:${envConfig.UNMUTE_MCP_BACKEND_PORT || '8766'}`,
    MUSETALK_HTTP: envConfig.MUSETALK_HTTP || `http://localhost:${envConfig.MUSETALK_PORT || '8765'}`,
    
    // Other settings
    VOICE_MODEL: envConfig.VOICE_MODEL || 'unmute-prod-website/ex04_narration_longform_00001.wav',
    ASSISTANT_NAME: envConfig.ASSISTANT_NAME || 'Nodie'
};

// Export for both CommonJS and ES modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = config;
} else if (typeof window !== 'undefined') {
    window.NodieConfig = config;
}

config;