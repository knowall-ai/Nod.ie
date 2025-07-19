const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  // Create logs directory if it doesn't exist
  const logsDir = path.join(__dirname, '../logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir);
  }

  // Create screenshots directory if it doesn't exist
  const screenshotsDir = path.join(__dirname, 'screenshots');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir);
  }

  const logFile = path.join(logsDir, `audio-flow-monitor-${Date.now()}.log`);
  const logStream = fs.createWriteStream(logFile, { flags: 'a' });

  const log = (message) => {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}\n`;
    console.log(logMessage.trim());
    logStream.write(logMessage);
  };

  log('Starting audio flow monitor...');

  const browser = await chromium.launch({
    headless: false,
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream'
    ]
  });

  const context = await browser.newContext({
    permissions: ['microphone']
  });

  const page = await context.newPage();

  // Listen to console messages
  page.on('console', msg => {
    const text = msg.text();
    const keywords = ['PCM', 'MuseTalk', 'audio', 'frame', 'Audio', 'Frame', 'AUDIO', 'FRAME'];
    
    if (keywords.some(keyword => text.includes(keyword))) {
      log(`CONSOLE: ${text}`);
    }
  });

  // Also log errors
  page.on('pageerror', error => {
    log(`ERROR: ${error.message}`);
  });

  log('Opening http://localhost:8095/tests/test-web.html');
  await page.goto('http://localhost:8095/tests/test-web.html');

  log('Waiting 5 seconds for everything to load...');
  await page.waitForTimeout(5000);

  // Evaluate JavaScript to log current state
  const state = await page.evaluate(() => {
    const getState = () => {
      const stateInfo = {
        timestamp: new Date().toISOString(),
        hasAudioCapture: typeof window.audioCapture !== 'undefined',
        hasWebSocketManager: typeof window.wsManager !== 'undefined',
        hasAvatarManager: typeof window.avatarManager !== 'undefined',
        hasMuseTalkClient: typeof window.musetalkClient !== 'undefined'
      };

      // Try to get more specific state if objects exist
      if (window.audioCapture) {
        stateInfo.audioCapture = {
          isCapturing: window.audioCapture.isCapturing || false,
          hasStream: !!window.audioCapture.stream
        };
      }

      if (window.wsManager) {
        stateInfo.websocket = {
          isConnected: window.wsManager.isConnected || false,
          readyState: window.wsManager.ws ? window.wsManager.ws.readyState : 'no websocket'
        };
      }

      if (window.musetalkClient) {
        stateInfo.musetalk = {
          isConnected: window.musetalkClient.isConnected || false,
          readyState: window.musetalkClient.ws ? window.musetalkClient.ws.readyState : 'no websocket'
        };
      }

      return stateInfo;
    };

    return getState();
  });

  log('Current page state:');
  log(JSON.stringify(state, null, 2));

  // Take screenshots every 5 seconds for 20 seconds
  let screenshotCount = 0;
  const screenshotInterval = setInterval(async () => {
    screenshotCount++;
    const screenshotPath = path.join(screenshotsDir, `audio-flow-${Date.now()}-${screenshotCount}.png`);
    await page.screenshot({ path: screenshotPath });
    log(`Screenshot saved: ${screenshotPath}`);

    // Also log current state
    const currentState = await page.evaluate(() => {
      return {
        timestamp: new Date().toISOString(),
        audioCapturing: window.audioCapture?.isCapturing || false,
        wsConnected: window.wsManager?.isConnected || false,
        musetalkConnected: window.musetalkClient?.isConnected || false
      };
    });
    log(`Current state: ${JSON.stringify(currentState)}`);
  }, 5000);

  log('Monitoring for 20 seconds...');
  await page.waitForTimeout(20000);

  clearInterval(screenshotInterval);

  log('Monitoring complete. Closing browser...');
  logStream.end();
  
  await browser.close();
  
  console.log(`\nLogs saved to: ${logFile}`);
  console.log(`Screenshots saved to: ${screenshotsDir}`);
})();