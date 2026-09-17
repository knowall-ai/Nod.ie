const { chromium } = require('playwright');
const fs = require('fs').promises;
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const report = {
    timestamp,
    canvasVisible: false,
    canvasStyles: {},
    frameMessages: [],
    consoleErrors: [],
    canvasDimensions: {},
    debugBorderPresent: false,
    framesDrawn: 0,
    canvasContext: null
  };

  // Collect all console messages
  const consoleLogs = [];
  page.on('console', msg => {
    const logEntry = {
      type: msg.type(),
      text: msg.text(),
      time: new Date().toISOString()
    };
    consoleLogs.push(logEntry);
    
    // Look for canvas-related messages
    if (msg.text().includes('canvas') || 
        msg.text().includes('frame') || 
        msg.text().includes('draw') ||
        msg.text().includes('render')) {
      report.frameMessages.push(logEntry);
    }
    
    // Collect errors
    if (msg.type() === 'error') {
      report.consoleErrors.push(logEntry);
    }
  });

  console.log('Opening test page...');
  await page.goto('http://localhost:8095/tests/test-web.html');
  
  // Take initial screenshot
  await page.screenshot({ 
    path: `tests/screenshots/canvas-test-${timestamp}-01-initial.png`,
    fullPage: true 
  });

  // Wait for page to fully load
  await page.waitForLoadState('networkidle');
  
  // Wait a bit for any initialization
  await page.waitForTimeout(3000);

  // Check if avatar canvas exists
  const canvasExists = await page.locator('#avatar-canvas').count() > 0;
  console.log('Canvas element exists:', canvasExists);

  if (canvasExists) {
    // Get canvas visibility
    report.canvasVisible = await page.locator('#avatar-canvas').isVisible();
    console.log('Canvas visible:', report.canvasVisible);

    // Get computed styles
    report.canvasStyles = await page.evaluate(() => {
      const canvas = document.getElementById('avatar-canvas');
      if (!canvas) return null;
      
      const styles = window.getComputedStyle(canvas);
      return {
        display: styles.display,
        visibility: styles.visibility,
        opacity: styles.opacity,
        position: styles.position,
        top: styles.top,
        left: styles.left,
        width: styles.width,
        height: styles.height,
        border: styles.border,
        zIndex: styles.zIndex,
        transform: styles.transform,
        pointerEvents: styles.pointerEvents
      };
    });
    console.log('Canvas styles:', JSON.stringify(report.canvasStyles, null, 2));

    // Check for red debug border
    report.debugBorderPresent = report.canvasStyles?.border?.includes('red') || false;
    console.log('Debug border present:', report.debugBorderPresent);

    // Get canvas dimensions and context info
    report.canvasDimensions = await page.evaluate(() => {
      const canvas = document.getElementById('avatar-canvas');
      if (!canvas) return null;
      
      return {
        width: canvas.width,
        height: canvas.height,
        clientWidth: canvas.clientWidth,
        clientHeight: canvas.clientHeight,
        offsetWidth: canvas.offsetWidth,
        offsetHeight: canvas.offsetHeight,
        boundingRect: canvas.getBoundingClientRect()
      };
    });
    console.log('Canvas dimensions:', JSON.stringify(report.canvasDimensions, null, 2));

    // Check if canvas has a rendering context
    report.canvasContext = await page.evaluate(() => {
      const canvas = document.getElementById('avatar-canvas');
      if (!canvas) return null;
      
      try {
        const ctx = canvas.getContext('2d');
        if (!ctx) return 'no-context';
        
        // Check if anything has been drawn
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const hasContent = imageData.data.some(pixel => pixel !== 0);
        
        return {
          hasContext: true,
          hasContent: hasContent,
          canvasDataLength: imageData.data.length
        };
      } catch (e) {
        return { error: e.message };
      }
    });
    console.log('Canvas context info:', JSON.stringify(report.canvasContext, null, 2));
  }

  // Wait for connections to establish
  console.log('Waiting for connections...');
  await page.waitForTimeout(5000);

  // Take screenshot after connections
  await page.screenshot({ 
    path: `tests/screenshots/canvas-test-${timestamp}-02-after-wait.png`,
    fullPage: true 
  });

  // Try to trigger some activity by clicking unmute
  const unmuteButton = page.locator('#unmute-button');
  if (await unmuteButton.isVisible()) {
    console.log('Clicking unmute button...');
    await unmuteButton.click();
    await page.waitForTimeout(3000);
    
    // Take screenshot after unmute
    await page.screenshot({ 
      path: `tests/screenshots/canvas-test-${timestamp}-03-unmuted.png`,
      fullPage: true 
    });
  }

  // Monitor for frame drawing for 5 seconds
  console.log('Monitoring for frame drawing...');
  const frameCount = await page.evaluate(() => {
    return new Promise((resolve) => {
      let frames = 0;
      const canvas = document.getElementById('avatar-canvas');
      if (!canvas) {
        resolve(0);
        return;
      }

      // Override drawImage to count frames
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const originalDrawImage = ctx.drawImage;
        ctx.drawImage = function(...args) {
          frames++;
          console.log(`Frame drawn: ${frames}`);
          return originalDrawImage.apply(this, args);
        };
      }

      // Wait 5 seconds then resolve with frame count
      setTimeout(() => resolve(frames), 5000);
    });
  });
  
  report.framesDrawn = frameCount;
  console.log('Frames drawn during monitoring:', frameCount);

  // Take final screenshot
  await page.screenshot({ 
    path: `tests/screenshots/canvas-test-${timestamp}-04-final.png`,
    fullPage: true 
  });

  // Save console logs
  await fs.writeFile(
    path.join('tests/screenshots', `canvas-test-${timestamp}-console.json`),
    JSON.stringify(consoleLogs, null, 2)
  );

  // Save report
  await fs.writeFile(
    path.join('tests/screenshots', `canvas-test-${timestamp}-report.json`),
    JSON.stringify(report, null, 2)
  );

  // Print summary
  console.log('\n=== Canvas Visibility Test Report ===');
  console.log('Canvas exists:', canvasExists);
  console.log('Canvas visible:', report.canvasVisible);
  console.log('Debug border present:', report.debugBorderPresent);
  console.log('Canvas dimensions:', report.canvasDimensions?.width, 'x', report.canvasDimensions?.height);
  console.log('Canvas has content:', report.canvasContext?.hasContent);
  console.log('Frames drawn:', report.framesDrawn);
  console.log('Canvas-related messages:', report.frameMessages.length);
  console.log('Console errors:', report.consoleErrors.length);
  console.log('\nFull report saved to:', `canvas-test-${timestamp}-report.json`);
  console.log('Screenshots saved with prefix:', `canvas-test-${timestamp}`);
  
  await browser.close();
})().catch(console.error);