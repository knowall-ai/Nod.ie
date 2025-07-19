/**
 * Configuration loader for Nod.ie
 * Reads from .env file or environment variables
 */
const fs = require('fs');
const path = require('path');

// Load .env file if it exists
const envPath = path.join(__dirname, '.env');
const envVars = {};

if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const lines = envContent.split('\n');
    
    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
            const [key, ...valueParts] = trimmed.split('=');
            if (key && valueParts.length > 0) {
                envVars[key.trim()] = valueParts.join('=').trim();
            }
        }
    }
}

// Helper function to get config value
function getConfig(key, defaultValue = null) {
    return process.env[key] || envVars[key] || defaultValue;
}

module.exports = {
    // Host configurations
    UNMUTE_BACKEND_HOST: getConfig('UNMUTE_BACKEND_HOST'),
    UNMUTE_MCP_BACKEND_HOST: getConfig('UNMUTE_MCP_BACKEND_HOST'),
    MUSETALK_HOST: getConfig('MUSETALK_HOST'),
    
    // Port configurations
    UNMUTE_BACKEND_PORT: getConfig('UNMUTE_BACKEND_PORT'),
    UNMUTE_MCP_BACKEND_PORT: getConfig('UNMUTE_MCP_BACKEND_PORT'),
    MUSETALK_PORT: getConfig('MUSETALK_PORT'),
    WEB_TEST_PORT: getConfig('WEB_TEST_PORT'),
    
    // URLs - require explicit configuration
    UNMUTE_BACKEND_URL: getConfig('UNMUTE_BACKEND_URL'),
    UNMUTE_MCP_BACKEND_URL: getConfig('UNMUTE_MCP_BACKEND_URL'),
    MUSETALK_URL: getConfig('MUSETALK_URL'),
    MUSETALK_WS: getConfig('MUSETALK_WS'),
    
    // HTTP URLs
    UNMUTE_BACKEND_HTTP: getConfig('UNMUTE_BACKEND_HTTP'),
    UNMUTE_MCP_BACKEND_HTTP: getConfig('UNMUTE_MCP_BACKEND_HTTP'),
    MUSETALK_HTTP: getConfig('MUSETALK_HTTP'),
    
    // Other settings
    VOICE_MODEL: getConfig('VOICE_MODEL'),
    ASSISTANT_NAME: getConfig('ASSISTANT_NAME'),
    AVATAR_VIDEO_PATH: getConfig('AVATAR_VIDEO_PATH'),
    
    // Helper function
    getConfig
};