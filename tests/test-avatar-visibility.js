const { chromium } = require('playwright');
const path = require('path');

async function testAvatarVisibility() {
    console.log('Testing avatar visibility...');
    
    const browser = await chromium.launch({
        headless: false,
        args: ['--use-fake-ui-for-media-stream']
    });

    const page = await browser.newPage();
    
    // Collect console logs
    page.on('console', msg => {
        console.log(`[CONSOLE ${msg.type()}] ${msg.text()}`);
    });

    try {
        await page.goto('http://localhost:8095/tests/test-web.html');
        await page.waitForTimeout(3000);

        // Check if avatar canvas exists and is visible
        const canvasInfo = await page.evaluate(() => {
            const canvas = document.querySelector('#avatar-canvas');
            if (!canvas) return { exists: false };
            
            const rect = canvas.getBoundingClientRect();
            const computed = window.getComputedStyle(canvas);
            
            return {
                exists: true,
                visible: computed.display !== 'none' && computed.visibility !== 'hidden',
                opacity: computed.opacity,
                zIndex: computed.zIndex,
                position: computed.position,
                bounds: {
                    x: rect.x,
                    y: rect.y,
                    width: rect.width,
                    height: rect.height
                },
                hasContent: canvas.width > 0 && canvas.height > 0
            };
        });
        
        console.log('\nAvatar Canvas Info:', JSON.stringify(canvasInfo, null, 2));

        // Check waveform canvas for comparison
        const waveformInfo = await page.evaluate(() => {
            const canvas = document.querySelector('#waveform');
            if (!canvas) return { exists: false };
            
            const computed = window.getComputedStyle(canvas);
            return {
                exists: true,
                zIndex: computed.zIndex,
                position: computed.position
            };
        });
        
        console.log('\nWaveform Canvas Info:', JSON.stringify(waveformInfo, null, 2));

        // Try to make avatar visible
        await page.evaluate(() => {
            const avatarCanvas = document.querySelector('#avatar-canvas');
            if (avatarCanvas) {
                avatarCanvas.style.zIndex = '10';
                avatarCanvas.style.opacity = '1';
                console.log('Avatar canvas z-index set to 10');
            }
        });

        await page.waitForTimeout(2000);
        await page.screenshot({ path: path.join(__dirname, 'screenshots', 'avatar-visibility-test.png') });
        console.log('\nScreenshot saved to tests/screenshots/avatar-visibility-test.png');

    } catch (error) {
        console.error('Test failed:', error);
    } finally {
        await browser.close();
    }
}

testAvatarVisibility().catch(console.error);