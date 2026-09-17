const { chromium } = require('playwright');
const fs = require('fs').promises;
const path = require('path');

(async () => {
    const browser = await chromium.launch({ 
        headless: false,
        devtools: true 
    });
    
    const context = await browser.newContext({
        permissions: ['microphone']
    });
    
    const page = await context.newPage();
    
    // Collect console logs
    const consoleLogs = [];
    page.on('console', msg => {
        const log = {
            type: msg.type(),
            text: msg.text(),
            timestamp: new Date().toISOString()
        };
        consoleLogs.push(log);
        console.log(`[${log.type}] ${log.text}`);
    });
    
    console.log('Opening test page...');
    await page.goto('http://localhost:8095/tests/test-web.html');
    
    // Wait for page to load
    await page.waitForTimeout(2000);
    
    // Get window.CONFIG
    const config = await page.evaluate(() => {
        return window.CONFIG || null;
    });
    
    // Get ENV_CONFIG
    const envConfig = await page.evaluate(() => {
        return window.ENV_CONFIG || null;
    });
    
    // Wait a bit to see WebSocket connection attempts
    console.log('Waiting for WebSocket connections...');
    await page.waitForTimeout(3000);
    
    // Take screenshot
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const screenshotPath = path.join(__dirname, 'screenshots', `backend-check-${timestamp}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`Screenshot saved to: ${screenshotPath}`);
    
    // Find WebSocket connection logs
    const wsLogs = consoleLogs.filter(log => 
        log.text.includes('WebSocket') || 
        log.text.includes('ws://') ||
        log.text.includes('backend')
    );
    
    // Save configuration details
    const configDetails = {
        timestamp: new Date().toISOString(),
        windowConfig: config,
        envConfig: envConfig,
        websocketLogs: wsLogs,
        allConsoleLogs: consoleLogs
    };
    
    const configPath = path.join(__dirname, 'screenshots', `backend-config-${timestamp}.json`);
    await fs.writeFile(configPath, JSON.stringify(configDetails, null, 2));
    console.log(`Configuration saved to: ${configPath}`);
    
    // Print summary
    console.log('\n=== Backend Configuration Summary ===');
    console.log('Window CONFIG:', config);
    console.log('ENV CONFIG:', envConfig);
    console.log('\nWebSocket-related logs:');
    wsLogs.forEach(log => {
        console.log(`  - ${log.text}`);
    });
    
    // Determine which backend is being used
    const backendUrl = config?.unmuteBackendUrl || envConfig?.UNMUTE_BACKEND_URL;
    if (backendUrl) {
        console.log(`\n✅ Backend URL configured: ${backendUrl}`);
        if (backendUrl.includes('8765')) {
            console.log('   → Using DEFAULT unmute-backend (port 8765)');
        } else if (backendUrl.includes('8766')) {
            console.log('   → Using MCP unmute-backend-mcp (port 8766)');
        }
    } else {
        console.log('\n❌ No backend URL found in configuration!');
    }
    
    // Keep browser open for manual inspection
    console.log('\n✨ Browser will remain open for inspection. Press Ctrl+C to exit.');
    
})().catch(console.error);