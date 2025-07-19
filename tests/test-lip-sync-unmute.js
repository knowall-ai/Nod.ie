const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// Ensure screenshots directory exists
const screenshotsDir = path.join(__dirname, 'screenshots', 'lip-sync-test');
if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
}

// Create logs directory
const logsDir = path.join(__dirname, '..', '..', 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

const logFile = path.join(logsDir, `lip-sync-test-${new Date().toISOString().replace(/:/g, '-')}.log`);
const logStream = fs.createWriteStream(logFile, { flags: 'a' });

function log(message) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}`;
    console.log(logMessage);
    logStream.write(logMessage + '\n');
}

async function testLipSync() {
    log('Starting lip-sync test...');
    
    const browser = await chromium.launch({
        headless: false,
        args: [
            '--use-fake-ui-for-media-stream',
            '--use-fake-device-for-media-stream',
            '--allow-file-access-from-files'
        ]
    });

    const context = await browser.newContext({
        permissions: ['microphone']
    });

    const page = await context.newPage();
    
    // Collect all console logs
    const consoleLogs = [];
    page.on('console', msg => {
        const logEntry = `[CONSOLE ${msg.type()}] ${msg.text()}`;
        consoleLogs.push(logEntry);
        log(logEntry);
    });

    page.on('pageerror', error => {
        log(`[PAGE ERROR] ${error.message}`);
    });

    try {
        log('Navigating to test page...');
        await page.goto('http://localhost:8095/tests/test-web.html');
        
        // Wait for initial load
        await page.waitForTimeout(2000);
        
        // Take initial screenshot
        await page.screenshot({ 
            path: path.join(screenshotsDir, '01-initial.png'),
            fullPage: true 
        });
        log('Took initial screenshot');

        // Wait for WebSocket connections
        log('Waiting for WebSocket connections to establish...');
        await page.waitForFunction(() => {
            const statusElement = document.querySelector('.status');
            return statusElement && statusElement.textContent.includes('Connected');
        }, { timeout: 10000 });

        // Check if muted and unmute if necessary
        const muteButton = await page.$('.mute-button');
        if (muteButton) {
            const isMuted = await page.evaluate(() => {
                const button = document.querySelector('.mute-button');
                return button && button.textContent.includes('Unmute');
            });
            
            if (isMuted) {
                log('App is muted, clicking unmute button...');
                await muteButton.click();
                await page.waitForTimeout(1000);
            } else {
                log('App is already unmuted');
            }
        }

        // Take screenshot after unmuting
        await page.screenshot({ 
            path: path.join(screenshotsDir, '02-unmuted.png'),
            fullPage: true 
        });

        // Inject JavaScript to make Unmute speak
        log('Injecting script to trigger Unmute speech...');
        await page.evaluate(() => {
            console.log('🎯 Attempting to trigger Unmute speech...');
            
            // Try to access the WebSocket handler
            if (window.unmuteWebSocket && window.unmuteWebSocket.ws && window.unmuteWebSocket.ws.readyState === WebSocket.OPEN) {
                console.log('✅ Found active Unmute WebSocket connection');
                
                // Send a session update to make Unmute introduce itself
                const message = {
                    type: 'session.update',
                    session: {
                        modalities: ['audio'],
                        instructions: 'You are testing the lip sync feature. Please say exactly: "Hello, I am testing the lip sync feature. Can you see my avatar lips moving in sync with my voice? One, two, three, four, five."'
                    }
                };
                
                console.log('📤 Sending session.update message:', message);
                window.unmuteWebSocket.ws.send(JSON.stringify(message));
                
                // Also try to trigger a response by sending some audio
                setTimeout(() => {
                    console.log('📤 Attempting to trigger response...');
                    // Send a small amount of audio data to potentially trigger a response
                    const silentAudioData = new Uint8Array(100).fill(0);
                    const base64Audio = btoa(String.fromCharCode.apply(null, silentAudioData));
                    
                    const audioMessage = {
                        type: 'input_audio_buffer.append',
                        audio: base64Audio
                    };
                    
                    window.unmuteWebSocket.ws.send(JSON.stringify(audioMessage));
                }, 1000);
            } else {
                console.error('❌ No active Unmute WebSocket found');
            }
        });

        // Monitor for 30 seconds, taking screenshots
        log('Monitoring for lip-sync activity for 30 seconds (Unmute may take time to respond)...');
        const startTime = Date.now();
        let screenshotCount = 3;
        let firstAudioDetected = null;
        let firstMuseTalkDetected = null;
        
        while (Date.now() - startTime < 30000) {
            await page.waitForTimeout(2000);
            
            // Take screenshot
            const screenshotPath = path.join(screenshotsDir, `${screenshotCount.toString().padStart(2, '0')}-during-speech.png`);
            await page.screenshot({ 
                path: screenshotPath,
                fullPage: true 
            });
            log(`Took screenshot ${screenshotCount}`);
            
            // Check for audio/video activity in console
            const recentLogs = await page.evaluate(() => {
                const logs = [];
                // Get recent console messages if stored
                if (window.consoleLogs) {
                    logs.push(...window.consoleLogs.slice(-10));
                }
                return logs;
            });
            
            // Look for key indicators
            const hasAudioActivity = consoleLogs.some(log => 
                log.includes('PCM audio') || 
                log.includes('audio chunk') ||
                log.includes('Playing audio') ||
                log.includes('Decoding audio') ||
                log.includes('Audio data received') ||
                log.includes('audio.delta') ||
                log.includes('🔊') || // Audio playback indicator
                log.includes('Speaking') ||
                log.includes('TTS')
            );
            
            const hasMuseTalkActivity = consoleLogs.some(log => 
                log.includes('MuseTalk frame') || 
                log.includes('frame update') ||
                log.includes('Canvas update') ||
                log.includes('Lip sync') ||
                log.includes('Avatar frame') ||
                log.includes('🎬') // Video frame indicator
            );
            
            // Look for Unmute welcome message
            const hasWelcomeMessage = consoleLogs.some(log => 
                log.includes('welcome') || 
                log.includes('Welcome') ||
                log.includes('Hello') ||
                log.includes('Hi there') ||
                log.includes('ready to') ||
                log.includes('How can I help')
            );
            
            if (hasWelcomeMessage) {
                log('🎉 Unmute welcome message detected - she is ready!');
            }
            
            if (hasAudioActivity && !firstAudioDetected) {
                firstAudioDetected = Date.now() - startTime;
                log(`✅ First audio activity detected at ${firstAudioDetected}ms`);
            }
            if (hasMuseTalkActivity && !firstMuseTalkDetected) {
                firstMuseTalkDetected = Date.now() - startTime;
                log(`✅ First MuseTalk frame updates detected at ${firstMuseTalkDetected}ms`);
            }
            
            // Show progress indicator
            const elapsed = Math.floor((Date.now() - startTime) / 1000);
            if (elapsed % 5 === 0) {
                log(`⏱️ Waiting... ${elapsed}s elapsed`);
            }
            
            screenshotCount++;
        }

        // Final analysis
        log('\n=== Test Results ===');
        log(`Total console logs collected: ${consoleLogs.length}`);
        
        // Count specific log types
        const audioLogs = consoleLogs.filter(log => log.toLowerCase().includes('audio')).length;
        const pcmLogs = consoleLogs.filter(log => log.includes('PCM')).length;
        const museTalkLogs = consoleLogs.filter(log => log.toLowerCase().includes('musetalk')).length;
        const frameLogs = consoleLogs.filter(log => log.toLowerCase().includes('frame')).length;
        const errorLogs = consoleLogs.filter(log => log.includes('[CONSOLE error]')).length;
        const welcomeLogs = consoleLogs.filter(log => 
            log.toLowerCase().includes('welcome') || 
            log.toLowerCase().includes('hello')
        ).length;
        
        log(`Audio-related logs: ${audioLogs}`);
        log(`PCM audio logs: ${pcmLogs}`);
        log(`MuseTalk logs: ${museTalkLogs}`);
        log(`Frame update logs: ${frameLogs}`);
        log(`Welcome/greeting logs: ${welcomeLogs}`);
        log(`Error logs: ${errorLogs}`);
        
        // Timing analysis
        if (firstAudioDetected) {
            log(`\n⏱️ Time to first audio: ${firstAudioDetected}ms`);
        } else {
            log('\n❌ No audio activity detected during test');
        }
        
        if (firstMuseTalkDetected) {
            log(`⏱️ Time to first MuseTalk frame: ${firstMuseTalkDetected}ms`);
        } else {
            log('❌ No MuseTalk frame updates detected during test');
        }
        
        // Check if lip sync appears to be working
        if (firstAudioDetected && firstMuseTalkDetected) {
            const syncDelay = Math.abs(firstMuseTalkDetected - firstAudioDetected);
            log(`\n🔄 Audio to video sync delay: ${syncDelay}ms`);
            if (syncDelay < 500) {
                log('✅ Lip sync appears to be working (low delay)');
            } else {
                log('⚠️ Lip sync may have synchronization issues (high delay)');
            }
        }
        
        // Save all console logs
        const allLogsPath = path.join(logsDir, `lip-sync-console-${new Date().toISOString().replace(/:/g, '-')}.log`);
        fs.writeFileSync(allLogsPath, consoleLogs.join('\n'));
        log(`\nAll console logs saved to: ${allLogsPath}`);
        
        // Take final screenshot
        await page.screenshot({ 
            path: path.join(screenshotsDir, 'final.png'),
            fullPage: true 
        });
        
        log('\n✅ Test completed successfully');
        log(`Screenshots saved to: ${screenshotsDir}`);
        log(`Logs saved to: ${logFile}`);

    } catch (error) {
        log(`❌ Test failed: ${error.message}`);
        console.error(error);
        
        // Take error screenshot
        await page.screenshot({ 
            path: path.join(screenshotsDir, 'error.png'),
            fullPage: true 
        });
    } finally {
        logStream.end();
        await browser.close();
    }
}

// Add helper to capture console logs in page context
async function setupConsoleCapture(page) {
    await page.evaluateOnNewDocument(() => {
        window.consoleLogs = [];
        const originalLog = console.log;
        const originalError = console.error;
        const originalWarn = console.warn;
        
        console.log = (...args) => {
            window.consoleLogs.push(`[LOG] ${args.join(' ')}`);
            originalLog.apply(console, args);
        };
        
        console.error = (...args) => {
            window.consoleLogs.push(`[ERROR] ${args.join(' ')}`);
            originalError.apply(console, args);
        };
        
        console.warn = (...args) => {
            window.consoleLogs.push(`[WARN] ${args.join(' ')}`);
            originalWarn.apply(console, args);
        };
    });
}

// Run the test
testLipSync().catch(console.error);