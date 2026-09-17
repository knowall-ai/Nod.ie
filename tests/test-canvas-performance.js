const { chromium } = require('playwright');
const fs = require('fs').promises;
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const performanceData = {
    frameTimings: [],
    frameIntervals: [],
    averageFPS: 0,
    minInterval: Infinity,
    maxInterval: 0,
    droppedFrames: 0,
    totalFrames: 0
  };

  // Track frame timings
  let lastFrameTime = null;
  
  page.on('console', msg => {
    if (msg.text().includes('Displaying frame on canvas')) {
      const currentTime = Date.now();
      performanceData.frameTimings.push(currentTime);
      performanceData.totalFrames++;
      
      if (lastFrameTime) {
        const interval = currentTime - lastFrameTime;
        performanceData.frameIntervals.push(interval);
        performanceData.minInterval = Math.min(performanceData.minInterval, interval);
        performanceData.maxInterval = Math.max(performanceData.maxInterval, interval);
        
        // Count as dropped frame if interval > 80ms (less than 12.5 FPS)
        if (interval > 80) {
          performanceData.droppedFrames++;
        }
      }
      lastFrameTime = currentTime;
    }
  });

  console.log('Opening test page...');
  await page.goto('http://localhost:8095/tests/test-web.html');
  
  // Wait for initial load
  await page.waitForTimeout(3000);
  
  // Inject performance monitoring
  await page.evaluate(() => {
    window.performanceMetrics = {
      canvasDrawCalls: 0,
      lastDrawTime: 0,
      drawIntervals: []
    };
    
    const canvas = document.getElementById('avatar-canvas');
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        // Monitor all drawing operations
        const originalDrawImage = ctx.drawImage;
        const originalPutImageData = ctx.putImageData;
        
        ctx.drawImage = function(...args) {
          window.performanceMetrics.canvasDrawCalls++;
          const now = performance.now();
          if (window.performanceMetrics.lastDrawTime) {
            window.performanceMetrics.drawIntervals.push(now - window.performanceMetrics.lastDrawTime);
          }
          window.performanceMetrics.lastDrawTime = now;
          console.log(`Canvas drawImage called at ${now}`);
          return originalDrawImage.apply(this, args);
        };
        
        ctx.putImageData = function(...args) {
          window.performanceMetrics.canvasDrawCalls++;
          const now = performance.now();
          if (window.performanceMetrics.lastDrawTime) {
            window.performanceMetrics.drawIntervals.push(now - window.performanceMetrics.lastDrawTime);
          }
          window.performanceMetrics.lastDrawTime = now;
          console.log(`Canvas putImageData called at ${now}`);
          return originalPutImageData.apply(this, args);
        };
      }
    }
  });

  console.log('Monitoring performance for 30 seconds...');
  
  // Take periodic screenshots
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(5000);
    await page.screenshot({ 
      path: `tests/screenshots/perf-test-${timestamp}-${i+1}.png`,
      fullPage: true 
    });
    
    // Get current metrics
    const metrics = await page.evaluate(() => window.performanceMetrics);
    console.log(`After ${(i+1)*5}s - Draw calls: ${metrics.canvasDrawCalls}`);
  }
  
  // Get final performance metrics
  const finalMetrics = await page.evaluate(() => window.performanceMetrics);
  
  // Calculate statistics
  if (performanceData.frameIntervals.length > 0) {
    const avgInterval = performanceData.frameIntervals.reduce((a, b) => a + b, 0) / performanceData.frameIntervals.length;
    performanceData.averageFPS = 1000 / avgInterval;
  }
  
  // Save performance report
  const report = {
    timestamp,
    performanceData,
    canvasMetrics: finalMetrics,
    summary: {
      totalFramesReceived: performanceData.totalFrames,
      averageFPS: performanceData.averageFPS.toFixed(2),
      minFrameInterval: performanceData.minInterval + 'ms',
      maxFrameInterval: performanceData.maxInterval + 'ms',
      droppedFrames: performanceData.droppedFrames,
      dropRate: ((performanceData.droppedFrames / performanceData.totalFrames) * 100).toFixed(2) + '%'
    }
  };
  
  await fs.writeFile(
    path.join('tests/screenshots', `perf-test-${timestamp}-report.json`),
    JSON.stringify(report, null, 2)
  );
  
  // Print summary
  console.log('\n=== Performance Test Report ===');
  console.log('Total frames received:', report.summary.totalFramesReceived);
  console.log('Average FPS:', report.summary.averageFPS);
  console.log('Frame interval range:', report.summary.minFrameInterval, '-', report.summary.maxFrameInterval);
  console.log('Dropped frames:', report.summary.droppedFrames, `(${report.summary.dropRate})`);
  console.log('Canvas draw calls:', finalMetrics.canvasDrawCalls);
  console.log('\nReport saved to:', `perf-test-${timestamp}-report.json`);
  
  await browser.close();
})().catch(console.error);