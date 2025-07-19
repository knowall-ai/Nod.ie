const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function testAvatarLipSync() {
    console.log('🧪 Starting Avatar Lip-Sync Test');
    
    const browser = await chromium.launch({
        headless: false,  // Set to true for CI
        args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream']
    });
    
    const context = await browser.newContext({
        permissions: ['microphone']
    });
    
    const page = await context.newPage();
        // Set up console log collection
        const consoleLogs = [];
        const errorLogs = [];
        
        page.on('console', msg => {
            const text = msg.text();
            consoleLogs.push({
                type: msg.type(),
                text: text,
                time: new Date().toISOString()
            });
            
            if (msg.type() === 'error') {
                errorLogs.push(text);
            }
        });

        page.on('pageerror', error => {
            errorLogs.push(`Page error: ${error.message}`);
        });

        // Create screenshot directory if it doesn't exist
        const screenshotDir = path.join(__dirname, 'screenshots');
        if (!fs.existsSync(screenshotDir)) {
            fs.mkdirSync(screenshotDir, { recursive: true });
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

        console.log('1. Navigating to test page...');
        await page.goto('http://localhost:8095/tests/test-web.html');
        
        // Take initial screenshot
        await page.screenshot({ 
            path: path.join(screenshotDir, `${timestamp}-01-initial-page.png`),
            fullPage: true 
        });
        console.log('   ✓ Initial screenshot taken');

        // Wait for page to fully load
        await page.waitForTimeout(2000);

        // Check for avatar container
        console.log('2. Checking avatar elements...');
        
        // Debug: check what elements exist on the page
        const avatarContainerExists = await page.locator('#avatar-container').count() > 0;
        const avatarCanvasExists = await page.locator('#avatar-canvas').count() > 0;
        const avatarVideoExists = await page.locator('#avatar-video').count() > 0;
        
        console.log(`   Avatar container exists: ${avatarContainerExists}`);
        console.log(`   Avatar canvas exists: ${avatarCanvasExists}`);
        console.log(`   Avatar video exists: ${avatarVideoExists}`);
        
        if (avatarCanvasExists) {
            const avatarCanvas = await page.locator('#avatar-canvas');
            const canvasVisible = await avatarCanvas.isVisible();
            const canvasBox = await avatarCanvas.boundingBox();
            console.log(`   Avatar canvas visible: ${canvasVisible}`);
            if (canvasBox) {
                console.log(`   Avatar canvas dimensions: ${canvasBox.width}x${canvasBox.height}`);
            }
        }
        
        if (!avatarCanvasExists) {
            console.log('   ✗ Avatar elements not found');
            errorLogs.push('Avatar elements not found');
        } else {
            console.log('   ✓ Avatar elements found');
        }

        // Check WebSocket connections
        console.log('3. Checking WebSocket connections...');
        await page.waitForTimeout(3000); // Give time for connections to establish

        // Check connection status in the UI
        const unmuteStatus = await page.locator('#unmute-status');
        const musetalkStatus = await page.locator('#musetalk-status');
        
        await page.screenshot({ 
            path: path.join(screenshotDir, `${timestamp}-02-connections.png`),
            fullPage: true 
        });

        // Look for connection logs
        const unmuteConnected = consoleLogs.some(log => 
            log.text.includes('Connected to Unmute') || 
            log.text.includes('WebSocket connected')
        );
        const musetalkConnected = consoleLogs.some(log => 
            log.text.includes('Connected to MuseTalk') || 
            log.text.includes('MuseTalk WebSocket opened')
        );

        console.log(`   Unmute connection: ${unmuteConnected ? '✓' : '✗'}`);
        console.log(`   MuseTalk connection: ${musetalkConnected ? '✓' : '✗'}`);

        // Click to unmute
        console.log('4. Clicking circle to unmute...');
        const circle = await page.locator('#circle');
        
        // Get initial state
        const initialClasses = await circle.getAttribute('class');
        console.log(`   Initial circle state: ${initialClasses}`);
        
        await circle.click();
        
        await page.waitForTimeout(1000);
        await page.screenshot({ 
            path: path.join(screenshotDir, `${timestamp}-03-unmuted.png`),
            fullPage: true 
        });
        console.log('   ✓ Unmuted screenshot taken');

        // Check if circle changed state
        const circleClasses = await circle.getAttribute('class');
        console.log(`   Circle state after click: ${circleClasses}`);
        
        // Check debug info
        const unmuteWsText = await page.locator('#unmute-ws-status').textContent();
        const musetalkWsText = await page.locator('#musetalk-ws-status').textContent();
        const avatarText = await page.locator('#avatar-status').textContent();
        console.log(`   Unmute WS: ${unmuteWsText}`);
        console.log(`   MuseTalk WS: ${musetalkWsText}`);
        console.log(`   Avatar: ${avatarText}`);

        // Wait and monitor for avatar frame updates
        console.log('5. Monitoring avatar frame updates...');
        
        // Clear console logs to focus on frame updates
        const frameUpdateStart = consoleLogs.length;
        
        // Wait 5 seconds while monitoring
        await page.waitForTimeout(5000);
        
        // Check for frame update logs
        const frameUpdates = consoleLogs.slice(frameUpdateStart).filter(log => 
            log.text.includes('frame') || 
            log.text.includes('Frame') ||
            log.text.includes('avatar') ||
            log.text.includes('MuseTalk') ||
            log.text.includes('PCM') ||
            log.text.includes('audio') ||
            log.text.includes('lip-sync')
        );

        console.log(`   Found ${frameUpdates.length} frame-related logs`);
        frameUpdates.slice(0, 10).forEach(log => {
            console.log(`   - [${log.type}] ${log.text}`);
        });
        
        // Also check for any WebSocket messages
        const wsMessages = consoleLogs.slice(frameUpdateStart).filter(log =>
            log.text.includes('WebSocket') || 
            log.text.includes('ws:') ||
            log.text.includes('Sending') ||
            log.text.includes('Received')
        );
        
        if (wsMessages.length > 0) {
            console.log(`   WebSocket activity detected: ${wsMessages.length} messages`);
        }

        await page.screenshot({ 
            path: path.join(screenshotDir, `${timestamp}-04-after-speaking.png`),
            fullPage: true 
        });

        // Click to mute again
        console.log('6. Clicking to mute again...');
        await circle.click();
        await page.waitForTimeout(1000);
        
        await page.screenshot({ 
            path: path.join(screenshotDir, `${timestamp}-05-final-state.png`),
            fullPage: true 
        });

        // Check for errors
        console.log('7. Checking for errors...');
        if (errorLogs.length > 0) {
            console.log(`   ⚠️  Found ${errorLogs.length} errors:`);
            errorLogs.forEach(err => console.log(`   - ${err}`));
        } else {
            console.log('   ✓ No errors found');
        }

        // Summary of important logs
        console.log('\n8. Important console logs:');
        const importantLogs = consoleLogs.filter(log => 
            log.text.includes('WebSocket') ||
            log.text.includes('Connected') ||
            log.text.includes('Error') ||
            log.text.includes('error') ||
            log.text.includes('Failed') ||
            log.text.includes('frame') ||
            log.text.includes('Frame') ||
            log.text.includes('PCM') ||
            log.text.includes('audio')
        );

        importantLogs.slice(-20).forEach(log => {
            console.log(`   [${log.type}] ${log.text}`);
        });

        // Write full logs to file
        const logPath = path.join(screenshotDir, `${timestamp}-console-logs.json`);
        fs.writeFileSync(logPath, JSON.stringify(consoleLogs, null, 2));
        console.log(`\n✓ Full console logs saved to: ${logPath}`);

        // Clean up
        await browser.close();
        
        // Final summary
        console.log('\n📊 Test Summary:');
        console.log(`   Total logs collected: ${consoleLogs.length}`);
        console.log(`   Errors found: ${errorLogs.length}`);
        console.log(`   Screenshots taken: 5`);
        console.log(`   Screenshots saved to: ${screenshotDir}`);
        
        if (errorLogs.length > 0) {
            console.error('\n❌ Test failed due to errors');
            process.exit(1);
        } else {
            console.log('\n✅ Test completed successfully');
        }
}

// Run the test
testAvatarLipSync().catch(error => {
    console.error('Test failed:', error);
    process.exit(1);
});