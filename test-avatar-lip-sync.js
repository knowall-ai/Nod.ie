#!/usr/bin/env node
/**
 * Test avatar lip-sync functionality by opening the web version and checking console logs
 */

const { chromium } = require('playwright');

async function testAvatarLipSync() {
    console.log('🧪 Testing Avatar Lip-Sync Functionality...\n');
    
    const browser = await chromium.launch({
        headless: false, // Keep visible for debugging
        args: [
            '--use-fake-ui-for-media-stream',
            '--use-fake-device-for-media-stream',
            '--allow-running-insecure-content',
            '--disable-web-security'
        ]
    });
    
    const page = await browser.newPage();
    
    // Enable console logging
    page.on('console', msg => {
        const type = msg.type();
        const text = msg.text();
        if (text.includes('🎭') || text.includes('Avatar') || text.includes('MuseTalk')) {
            console.log(`[${type}] ${text}`);
        }
    });
    
    page.on('pageerror', error => {
        console.error('❌ Page error:', error.message);
    });
    
    try {
        // Navigate to the web test page
        console.log('📖 Loading web test page...');
        await page.goto('http://localhost:8095/tests/test-web.html', {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });
        
        // Wait for initialization
        console.log('⏱️ Waiting for initialization...');
        await page.waitForTimeout(3000);
        
        // Check if avatar manager is initialized
        const avatarManagerExists = await page.evaluate(() => {
            return window.NodieRenderer && 
                   window.NodieRenderer.state && 
                   window.NodieRenderer.state.avatarManager !== null;
        });
        
        console.log('🎭 Avatar Manager initialized:', avatarManagerExists);
        
        // Check if MuseTalk connection was tested
        const musetalkConnected = await page.evaluate(() => {
            return window.NodieRenderer && 
                   window.NodieRenderer.state && 
                   window.NodieRenderer.state.avatarManager &&
                   window.NodieRenderer.state.avatarManager.isMuseTalkConnected &&
                   window.NodieRenderer.state.avatarManager.isMuseTalkConnected();
        });
        
        console.log('🔗 MuseTalk connected:', musetalkConnected);
        
        // Test avatar animation trigger
        console.log('🎬 Testing avatar animation trigger...');
        await page.evaluate(() => {
            if (window.NodieRenderer && window.NodieRenderer.onAudioPlaybackStart) {
                console.log('🎭 Triggering avatar animation via onAudioPlaybackStart');
                window.NodieRenderer.onAudioPlaybackStart();
            }
        });
        
        await page.waitForTimeout(2000);
        
        // Check if avatar is animated
        const isAnimated = await page.evaluate(() => {
            return window.NodieRenderer && 
                   window.NodieRenderer.state && 
                   window.NodieRenderer.state.avatarManager &&
                   window.NodieRenderer.state.avatarManager.isAnimated &&
                   window.NodieRenderer.state.avatarManager.isAnimated();
        });
        
        console.log('🎭 Avatar is animated:', isAnimated);
        
        // Test stopping animation
        console.log('🛑 Testing avatar animation stop...');
        await page.evaluate(() => {
            if (window.NodieRenderer && window.NodieRenderer.onAudioPlaybackStop) {
                console.log('🎭 Stopping avatar animation via onAudioPlaybackStop');
                window.NodieRenderer.onAudioPlaybackStop();
            }
        });
        
        await page.waitForTimeout(2000);
        
        // Check if avatar is back to static
        const isStatic = await page.evaluate(() => {
            return window.NodieRenderer && 
                   window.NodieRenderer.state && 
                   window.NodieRenderer.state.avatarManager &&
                   window.NodieRenderer.state.avatarManager.isAnimated &&
                   !window.NodieRenderer.state.avatarManager.isAnimated();
        });
        
        console.log('🎭 Avatar returned to static:', isStatic);
        
        // Test frame update functionality
        console.log('🖼️ Testing frame update...');
        await page.evaluate(() => {
            if (window.updateAvatarFrame) {
                console.log('🎭 Testing frame update with dummy data');
                const dummyFrame = {
                    data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
                    timestamp: Date.now()
                };
                window.updateAvatarFrame(dummyFrame);
            } else {
                console.log('❌ updateAvatarFrame not available');
            }
        });
        
        await page.waitForTimeout(1000);
        
        console.log('\n✅ Avatar lip-sync integration test completed!');
        console.log('👀 Check the browser window to see the visual results');
        console.log('Press Ctrl+C to close when ready...');
        
        // Keep the page open for manual inspection
        await new Promise(() => {});
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
    } finally {
        await browser.close();
    }
}

// Run the test
testAvatarLipSync().catch(console.error);