const { chromium } = require('playwright');

(async () => {
    console.log('=== NODI.E BACKEND VERIFICATION ===\n');
    
    const browser = await chromium.launch({ 
        headless: true
    });
    
    const context = await browser.newContext({
        permissions: ['microphone']
    });
    
    const page = await context.newPage();
    
    // Monitor network requests
    const wsUrls = [];
    page.on('request', request => {
        const url = request.url();
        if (url.startsWith('ws://')) {
            wsUrls.push(url);
        }
    });
    
    console.log('Loading test page...');
    await page.goto('http://localhost:8095/tests/test-web.html');
    await page.waitForTimeout(3000);
    
    // Get configuration
    const config = await page.evaluate(() => window.CONFIG);
    
    console.log('Configuration found:');
    console.log('  UNMUTE_BACKEND_URL:', config?.UNMUTE_BACKEND_URL);
    console.log('  UNMUTE_MCP_BACKEND_URL:', config?.UNMUTE_MCP_BACKEND_URL);
    console.log('  MUSETALK_WS:', config?.MUSETALK_WS);
    
    console.log('\nWebSocket connections attempted:');
    const unmuteConnections = wsUrls.filter(url => url.includes('/v1/realtime'));
    const musetalkConnections = wsUrls.filter(url => url.includes('/ws') && !url.includes('/v1/realtime'));
    
    unmuteConnections.forEach(url => {
        console.log('  Unmute:', url);
    });
    musetalkConnections.forEach(url => {
        console.log('  MuseTalk:', url);
    });
    
    console.log('\n=== RESULT ===');
    if (unmuteConnections.length > 0) {
        const url = unmuteConnections[0];
        if (url.includes('8767')) {
            console.log('✅ Using DEFAULT unmute-backend on port 8767');
            console.log('   (NOT the MCP version)');
        } else if (url.includes('8766')) {
            console.log('✅ Using unmute-backend-mcp on port 8766');
            console.log('   (WITH MCP integration)');
        } else {
            console.log('✅ Using backend:', url);
        }
    } else {
        console.log('❌ No Unmute WebSocket connection detected');
        console.log('   Code should connect to:', config?.UNMUTE_BACKEND_URL);
    }
    
    // Save detailed log
    const fs = require('fs').promises;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    await fs.writeFile(
        `tests/screenshots/backend-verification-${timestamp}.json`,
        JSON.stringify({ config, wsUrls, unmuteConnections, musetalkConnections }, null, 2)
    );
    
    await browser.close();
    
})().catch(console.error);