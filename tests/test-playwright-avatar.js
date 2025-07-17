const { chromium } = require('playwright');
const fs = require('fs').promises;
const path = require('path');

async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function testAvatarFunctionality() {
    console.log('🧪 Starting Playwright Avatar Test');
    
    const browser = await chromium.launch({
        headless: false,  // Set to true for CI
        args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream']
    });
    
    const context = await browser.newContext({
        permissions: ['microphone']
    });
    
    const page = await context.newPage();
    
    // Capture console logs and errors
    const consoleLogs = [];
    const consoleErrors = [];
    
    page.on('console', msg => {
        if (msg.type() === 'error') {
            consoleErrors.push(msg.text());
        }
        consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
    });
    
    page.on('pageerror', error => {
        consoleErrors.push(error.toString());
    });
    
    try {
        console.log('📄 Loading web page...');
        await page.goto('http://localhost:8889/tests/test-web.html');
        await page.waitForLoadState('networkidle');
        
        // Take initial screenshot
        await page.screenshot({ path: 'tests/screenshots/01-initial-state.png' });
        console.log('📸 Initial screenshot taken');
        
        // Check initial state
        const circle = await page.locator('#circle');
        const isVisible = await circle.isVisible();
        if (!isVisible) throw new Error('Circle element not visible');
        
        // Check size and shape
        const circleBox = await circle.boundingBox();
        console.log(`📏 Circle dimensions: ${circleBox.width}x${circleBox.height}`);
        
        if (circleBox.width !== 250 || circleBox.height !== 250) {
            console.error('❌ Circle size incorrect! Expected 250x250');
        } else {
            console.log('✅ Circle size correct: 250x250');
        }
        
        // Wait for WebSocket connection
        await page.waitForTimeout(2000);
        
        // Check WebSocket status
        const wsStatus = await page.locator('#ws-status').textContent();
        console.log(`🔌 WebSocket status: ${wsStatus}`);
        
        // Click to unmute
        console.log('🎤 Clicking to unmute...');
        await circle.click();
        await page.waitForTimeout(1000);
        
        // Take screenshot after unmute
        await page.screenshot({ path: 'tests/screenshots/02-unmuted.png' });
        
        // Check if avatar is visible
        const avatarContainer = await page.locator('#avatar-container');
        const isAvatarVisible = await avatarContainer.evaluate(el => !el.classList.contains('hidden'));
        console.log(`👤 Avatar visible: ${isAvatarVisible}`);
        
        // Check if video is loaded
        const videoElement = await page.locator('#avatar-video');
        const videoSrc = await videoElement.getAttribute('src');
        console.log(`🎥 Video source: ${videoSrc || 'none'}`);
        
        // Check if waveform canvas exists
        const waveformCanvas = await page.locator('#waveform');
        const canvasVisible = await waveformCanvas.isVisible();
        console.log(`🌊 Waveform canvas visible: ${canvasVisible}`);
        
        // Take multiple screenshots to detect video movement
        if (videoSrc) {
            console.log('📸 Taking screenshots to detect video movement...');
            const screenshots = [];
            
            for (let i = 0; i < 5; i++) {
                await page.waitForTimeout(500);
                const screenshotPath = `tests/screenshots/video-frame-${i}.png`;
                await page.screenshot({ path: screenshotPath });
                screenshots.push(screenshotPath);
            }
            
            console.log('✅ Video frame screenshots taken');
        }
        
        // Check orange waveform rendering
        const waveformData = await page.evaluate(() => {
            const canvas = document.getElementById('waveform');
            if (!canvas) return null;
            
            const ctx = canvas.getContext('2d');
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            
            // Check for orange pixels (R > 200, G > 100, B < 100)
            let orangePixelCount = 0;
            for (let i = 0; i < imageData.data.length; i += 4) {
                const r = imageData.data[i];
                const g = imageData.data[i + 1];
                const b = imageData.data[i + 2];
                const a = imageData.data[i + 3];
                
                if (r > 200 && g > 100 && b < 100 && a > 0) {
                    orangePixelCount++;
                }
            }
            
            return {
                width: canvas.width,
                height: canvas.height,
                orangePixels: orangePixelCount,
                hasOrangeWaveform: orangePixelCount > 100
            };
        });
        
        if (waveformData) {
            console.log(`🎨 Waveform analysis:`, waveformData);
            if (waveformData.hasOrangeWaveform) {
                console.log('✅ Orange waveform detected!');
            } else {
                console.log('❌ No orange waveform detected');
            }
        }
        
        // Check avatar status
        const avatarStatus = await page.locator('#avatar-status').textContent();
        console.log(`👤 Avatar status: ${avatarStatus}`);
        
        // Final screenshot
        await page.screenshot({ path: 'tests/screenshots/03-final-state.png' });
        
        // Summary
        console.log('\n📊 Test Summary:');
        console.log(`- Console errors: ${consoleErrors.length}`);
        if (consoleErrors.length > 0) {
            console.log('  Errors:', consoleErrors);
        }
        console.log(`- Circle size: ${circleBox.width === 250 && circleBox.height === 250 ? '✅' : '❌'}`);
        console.log(`- WebSocket: ${wsStatus === 'Connected' ? '✅' : '❌'}`);
        console.log(`- Avatar visible: ${isAvatarVisible ? '✅' : '❌'}`);
        console.log(`- Video loaded: ${videoSrc ? '✅' : '❌'}`);
        console.log(`- Orange waveform: ${waveformData?.hasOrangeWaveform ? '✅' : '❌'}`);
        
    } catch (error) {
        console.error('❌ Test failed:', error);
        await page.screenshot({ path: 'tests/screenshots/error-state.png' });
    } finally {
        await browser.close();
    }
}

// Create screenshots directory
async function setup() {
    try {
        await fs.mkdir('tests/screenshots', { recursive: true });
    } catch (error) {
        // Directory might already exist
    }
}

// Run the test
setup().then(() => {
    testAvatarFunctionality();
});