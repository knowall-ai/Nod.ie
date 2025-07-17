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
    // Port configurations
    UNMUTE_BACKEND_PORT: getConfig('UNMUTE_BACKEND_PORT', '8767'),
    UNMUTE_MCP_BACKEND_PORT: getConfig('UNMUTE_MCP_BACKEND_PORT', '8766'),
    MUSETALK_PORT: getConfig('MUSETALK_PORT', '8765'),
    WEB_TEST_PORT: getConfig('WEB_TEST_PORT', '8095'),
    
    // URLs
    UNMUTE_BACKEND_URL: getConfig('UNMUTE_BACKEND_URL', `ws://localhost:${getConfig('UNMUTE_BACKEND_PORT', '8767')}`),
    UNMUTE_MCP_BACKEND_URL: getConfig('UNMUTE_MCP_BACKEND_URL', `ws://localhost:${getConfig('UNMUTE_MCP_BACKEND_PORT', '8766')}`),
    MUSETALK_URL: getConfig('MUSETALK_URL', `ws://localhost:${getConfig('MUSETALK_PORT', '8765')}`),
    
    // HTTP URLs
    UNMUTE_BACKEND_HTTP: `http://localhost:${getConfig('UNMUTE_BACKEND_PORT', '8767')}`,
    UNMUTE_MCP_BACKEND_HTTP: `http://localhost:${getConfig('UNMUTE_MCP_BACKEND_PORT', '8766')}`,
    MUSETALK_HTTP: `http://localhost:${getConfig('MUSETALK_PORT', '8765')}`,
    
    // Other settings
    VOICE_MODEL: getConfig('VOICE_MODEL', 'unmute-prod-website/ex04_narration_longform_00001.wav'),
    ASSISTANT_NAME: getConfig('ASSISTANT_NAME', 'Nodie'),
    
    // Helper function
    getConfig
};