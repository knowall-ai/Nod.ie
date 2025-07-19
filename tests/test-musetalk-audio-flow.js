const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
  console.log('Starting MuseTalk audio flow test...');
  
  // Create screenshots directory if it doesn't exist
  const screenshotsDir = path.join(__dirname, 'screenshots', 'musetalk-audio-flow');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  // Create logs directory
  const logsDir = path.join(__dirname, '..', 'logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }

  // Launch browser with fake media
  const browser = await chromium.launch({
    headless: false,
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--disable-web-security',
      '--allow-insecure-localhost'
    ]
  });

  const context = await browser.newContext({
    permissions: ['microphone']
  });

  const page = await context.newPage();

  // Collect all console messages
  const consoleLogs = [];
  page.on('console', msg => {
    const text = msg.text();
    const timestamp = new Date().toISOString();
    consoleLogs.push(`[${timestamp}] [${msg.type()}] ${text}`);
    
    // Highlight specific audio-related logs
    if (text.includes('onDecodedAudio') || 
        text.includes('PCM') || 
        text.includes('flushPCMAudio') || 
        text.includes('Sending audio to MuseTalk') ||
        text.includes('MuseTalk') ||
        text.includes('audio data') ||
        text.includes('AudioWorklet') ||
        text.includes('decodeAudioData') ||
        text.includes('audio/pcm') ||
        text.includes('PCM buffer') ||
        text.includes('Avatar PCM') ||
        text.includes('processedBuffer')) {
      console.log(`🎵 AUDIO LOG: ${text}`);
    }
  });

  try {
    // Navigate to the test page
    console.log('Navigating to test page...');
    await page.goto('http://localhost:8095/tests/test-web.html');
    
    // Take initial screenshot
    await page.screenshot({ 
      path: path.join(screenshotsDir, '01-initial.png'),
      fullPage: true 
    });
    console.log('✅ Initial screenshot taken');

    // Wait for connections to establish
    console.log('Waiting 3 seconds for connections to establish...');
    await page.waitForTimeout(3000);
    
    await page.screenshot({ 
      path: path.join(screenshotsDir, '02-after-connection-wait.png'),
      fullPage: true 
    });

    // Get viewport size and click in the center where the circle is
    const viewport = page.viewportSize();
    const centerX = viewport.width / 2;
    const centerY = viewport.height / 2;
    
    console.log(`Viewport size: ${viewport.width}x${viewport.height}`);
    console.log(`Clicking at center: ${centerX}, ${centerY}`);
    
    // Click once to ensure it's unmuted
    console.log('Clicking circle to unmute...');
    await page.mouse.click(centerX, centerY);
    
    await page.waitForTimeout(1000);
    await page.screenshot({ 
      path: path.join(screenshotsDir, '03-after-first-click.png'),
      fullPage: true 
    });

    // Monitor for 5 seconds
    console.log('Monitoring audio data flow for 5 seconds...');
    await page.waitForTimeout(5000);
    
    await page.screenshot({ 
      path: path.join(screenshotsDir, '04-after-monitoring.png'),
      fullPage: true 
    });

    // Click again to mute
    console.log('Clicking circle again to mute...');
    await page.mouse.click(centerX, centerY);
    
    await page.waitForTimeout(1000);
    await page.screenshot({ 
      path: path.join(screenshotsDir, '05-after-second-click.png'),
      fullPage: true 
    });

    // Wait a bit more to capture any final logs
    await page.waitForTimeout(2000);

    // Save all console logs
    const logFilePath = path.join(logsDir, `musetalk-audio-flow-${Date.now()}.log`);
    fs.writeFileSync(logFilePath, consoleLogs.join('\n'), 'utf8');
    console.log(`✅ Console logs saved to: ${logFilePath}`);

    // Filter and display audio-related logs
    console.log('\n📊 Audio-related logs summary:');
    const audioLogs = consoleLogs.filter(log => 
      log.includes('onDecodedAudio') || 
      log.includes('PCM') || 
      log.includes('flushPCMAudio') || 
      log.includes('Sending audio to MuseTalk') ||
      log.includes('MuseTalk') ||
      log.includes('audio data') ||
      log.includes('AudioWorklet') ||
      log.includes('decodeAudioData') ||
      log.includes('audio/pcm') ||
      log.includes('PCM buffer') ||
      log.includes('Avatar PCM') ||
      log.includes('processedBuffer')
    );

    if (audioLogs.length === 0) {
      console.log('❌ No audio data logs found!');
    } else {
      console.log(`Found ${audioLogs.length} audio-related logs:`);
      audioLogs.forEach(log => console.log(log));
    }

    // Keep browser open for manual inspection
    console.log('\n🔍 Browser will remain open for manual inspection...');
    console.log('Press Ctrl+C to close when done.');
    
    // Wait indefinitely (until manual close)
    await new Promise(() => {});
  } catch (error) {
    console.error('Test failed:', error);
    await browser.close();
    process.exit(1);
  }
})();