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
    
    // Intercept WebSocket connections
    const wsConnections = [];
    await page.route('**/*', (route) => {
        const url = route.request().url();
        if (url.startsWith('ws://')) {
            console.log(`🔌 WebSocket connection attempt: ${url}`);
            wsConnections.push(url);
        }
        route.continue();
    });
    
    console.log('Opening test page...');
    await page.goto('http://localhost:8095/tests/test-web.html');
    
    // Wait for page to load
    await page.waitForTimeout(2000);
    
    // Get the renderer's backend URL directly from the global NodieRenderer
    const backendInfo = await page.evaluate(() => {
        if (window.NodieRenderer && window.NodieRenderer.websocketHandler) {
            const ws = window.NodieRenderer.websocketHandler;
            return {
                url: ws.url,
                isConnected: ws.isConnected,
                wsObject: ws.ws ? {
                    readyState: ws.ws.readyState,
                    url: ws.ws.url
                } : null
            };
        }
        return null;
    });
    
    // Get config
    const config = await page.evaluate(() => window.CONFIG || null);
    
    // Take screenshot
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const screenshotPath = path.join(__dirname, 'screenshots', `backend-simple-${timestamp}.png`);
    await page.screenshot({ path: screenshotPath });
    
    // Print results
    console.log('\n=== BACKEND CONFIGURATION ===');
    console.log('CONFIG.UNMUTE_BACKEND_URL:', config?.UNMUTE_BACKEND_URL);
    console.log('CONFIG.UNMUTE_MCP_BACKEND_URL:', config?.UNMUTE_MCP_BACKEND_URL);
    
    console.log('\n=== ACTUAL CONNECTION ===');
    if (backendInfo) {
        console.log('WebSocket URL:', backendInfo.url);
        console.log('Is Connected:', backendInfo.isConnected);
        if (backendInfo.wsObject) {
            console.log('WebSocket State:', backendInfo.wsObject.readyState, '(1=OPEN)');
        }
    }
    
    console.log('\n=== INTERCEPTED WEBSOCKET URLS ===');
    wsConnections.forEach(url => console.log(`  - ${url}`));
    
    // Determine which backend
    const actualUrl = backendInfo?.url || '';
    console.log('\n=== RESULT ===');
    if (actualUrl.includes('8767')) {
        console.log('✅ Using UNMUTE_BACKEND on port 8767');
    } else if (actualUrl.includes('8766')) {
        console.log('✅ Using UNMUTE_MCP_BACKEND on port 8766');
    } else if (actualUrl) {
        console.log(`✅ Using backend: ${actualUrl}`);
    } else {
        console.log('❌ No backend connection found');
    }
    
    await browser.close();
    
})().catch(console.error);