const { chromium } = require('playwright');
const path = require('path');

async function debugAvatarCanvas() {
    console.log('Debugging avatar canvas issue...');
    
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
        
        // Wait for MuseTalk to connect and frames to be processed
        await page.waitForTimeout(5000);
        
        // Wait for lip-sync frames
        await page.waitForFunction(() => {
            const logs = window.consoleLogs || [];
            return logs.some(log => log.includes('Displaying frame on canvas'));
        }, { timeout: 10000 }).catch(() => console.log('No frames detected yet'));

        // Debug canvas state after frames should be displaying
        const canvasDebug = await page.evaluate(() => {
            const canvas = document.getElementById('avatar-canvas');
            const video = document.getElementById('avatar-video');
            const container = document.getElementById('avatar-container');
            const circle = document.getElementById('circle');
            
            if (!canvas) return { error: 'Canvas not found' };
            
            const ctx = canvas.getContext('2d');
            const imageData = ctx.getImageData(0, 0, 1, 1);
            const hasContent = imageData.data.some(pixel => pixel > 0);
            
            // Force canvas to be visible
            canvas.style.display = 'block';
            canvas.style.visibility = 'visible';
            canvas.style.opacity = '1';
            canvas.style.zIndex = '100';
            canvas.style.position = 'relative';
            
            return {
                canvas: {
                    id: canvas.id,
                    width: canvas.width,
                    height: canvas.height,
                    clientWidth: canvas.clientWidth,
                    clientHeight: canvas.clientHeight,
                    display: window.getComputedStyle(canvas).display,
                    visibility: window.getComputedStyle(canvas).visibility,
                    opacity: window.getComputedStyle(canvas).opacity,
                    zIndex: window.getComputedStyle(canvas).zIndex,
                    position: window.getComputedStyle(canvas).position,
                    hasContent: hasContent
                },
                video: {
                    display: window.getComputedStyle(video).display,
                    src: video.src
                },
                container: {
                    display: window.getComputedStyle(container).display,
                    visibility: window.getComputedStyle(container).visibility,
                    opacity: window.getComputedStyle(container).opacity,
                    width: container.clientWidth,
                    height: container.clientHeight
                },
                circle: {
                    classes: circle.className,
                    display: window.getComputedStyle(circle).display
                }
            };
        });
        
        console.log('\n=== Canvas Debug Info ===');
        console.log(JSON.stringify(canvasDebug, null, 2));
        
        // Take screenshot after forcing visibility
        await page.waitForTimeout(1000);
        await page.screenshot({ 
            path: path.join(__dirname, 'screenshots', 'avatar-canvas-debug.png'),
            fullPage: true 
        });
        
        // Try drawing something on the canvas to test
        await page.evaluate(() => {
            const canvas = document.getElementById('avatar-canvas');
            const ctx = canvas.getContext('2d');
            
            // Draw a red square to test if canvas is working
            ctx.fillStyle = 'red';
            ctx.fillRect(50, 50, 100, 100);
            
            console.log('Drew red square on canvas for testing');
        });
        
        await page.waitForTimeout(1000);
        await page.screenshot({ 
            path: path.join(__dirname, 'screenshots', 'avatar-canvas-test-square.png'),
            fullPage: true 
        });

    } catch (error) {
        console.error('Debug failed:', error);
    } finally {
        await page.waitForTimeout(3000); // Keep open to see
        await browser.close();
    }
}

// Add console capture
async function setupConsoleCapture(page) {
    await page.evaluateOnNewDocument(() => {
        window.consoleLogs = [];
        const originalLog = console.log;
        const originalDebug = console.debug;
        
        console.log = (...args) => {
            window.consoleLogs.push(args.join(' '));
            originalLog.apply(console, args);
        };
        
        console.debug = (...args) => {
            window.consoleLogs.push(args.join(' '));
            originalDebug.apply(console, args);
        };
    });
}

debugAvatarCanvas().catch(console.error);