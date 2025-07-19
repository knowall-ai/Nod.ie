/**
 * Web-compatible configuration for Nod.ie
 * Since we can't read .env files in the browser, we use window.ENV_CONFIG
 * For testing, manually set window.ENV_CONFIG before loading this script
 */

// Get config from window - must be set by the server or manually
const envConfig = (typeof window !== 'undefined' && window.ENV_CONFIG) || {};

// If no config provided, log error
if (typeof window !== 'undefined' && !window.ENV_CONFIG) {
    console.error('❌ window.ENV_CONFIG not set. Please configure environment variables.');
}

// Configuration from environment
const config = {
    // Port configurations
    UNMUTE_BACKEND_PORT: envConfig.UNMUTE_BACKEND_PORT,
    UNMUTE_MCP_BACKEND_PORT: envConfig.UNMUTE_MCP_BACKEND_PORT,
    MUSETALK_PORT: envConfig.MUSETALK_PORT,
    WEB_TEST_PORT: envConfig.WEB_TEST_PORT,
    
    // URLs
    UNMUTE_BACKEND_URL: envConfig.UNMUTE_BACKEND_URL,
    UNMUTE_MCP_BACKEND_URL: envConfig.UNMUTE_MCP_BACKEND_URL,
    MUSETALK_URL: envConfig.MUSETALK_URL,
    MUSETALK_WS: envConfig.MUSETALK_WS,
    
    // HTTP URLs
    UNMUTE_BACKEND_HTTP: envConfig.UNMUTE_BACKEND_HTTP,
    UNMUTE_MCP_BACKEND_HTTP: envConfig.UNMUTE_MCP_BACKEND_HTTP,
    MUSETALK_HTTP: envConfig.MUSETALK_HTTP,
    
    // Other settings
    VOICE_MODEL: envConfig.VOICE_MODEL,
    ASSISTANT_NAME: envConfig.ASSISTANT_NAME,
    AVATAR_VIDEO_PATH: envConfig.AVATAR_VIDEO_PATH
};

// Export for both CommonJS and ES modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = config;
} else if (typeof window !== 'undefined') {
    window.CONFIG = config;  // Used by avatar-manager-web.js
    window.NodieConfig = config;  // For backward compatibility
}

config;