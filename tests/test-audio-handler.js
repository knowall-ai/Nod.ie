#!/usr/bin/env node
/**
 * Test the AudioHandler with real Unmute responses
 */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const WebSocket = require('ws');

let testWindow;
let ws;

// Test configuration
const TEST_TIMEOUT = 30000; // 30 seconds
let testPassed = false;

app.on('ready', async () => {
    console.log('🔊 Testing Nod.ie Audio Handler\n');
    
    // Create hidden test window
    testWindow = new BrowserWindow({
        width: 800,
        height: 600,
        show: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            autoplayPolicy: 'no-user-gesture-required'
        }
    });
    
    // Load test page
    testWindow.loadFile(path.join(__dirname, 'test-audio.html'));
    
    // Wait for page to load
    testWindow.webContents.on('did-finish-load', () => {
        console.log('✅ Test window loaded');
        runAudioTest();
    });
    
    // Show dev tools for debugging
    testWindow.webContents.openDevTools();
    
    // Timeout
    setTimeout(() => {
        if (!testPassed) {
            console.error('❌ Test timeout');
            cleanup(1);
        }
    }, TEST_TIMEOUT);
});

async function runAudioTest() {
    console.log('📡 Connecting to Unmute...');
    
    ws = new WebSocket('ws://localhost:8765/v1/realtime', ['realtime']);
    
    ws.on('open', () => {
        console.log('✅ Connected to Unmute');
        
        // Configure session
        ws.send(JSON.stringify({
            type: 'session.update',
            session: {
                voice: 'nova',
                allow_recording: false
            }
        }));
        
        // Send test audio after a moment
        setTimeout(() => {
            console.log('📤 Sending test audio input...');
            
            // Generate 1 second of silence
            const sampleRate = 16000;
            const pcm16 = new Int16Array(sampleRate);
            
            // Add a simple tone burst to trigger response
            for (let i = 8000; i < 9000; i++) {
                pcm16[i] = Math.sin(2 * Math.PI * 440 * i / sampleRate) * 0x4000;
            }
            
            const base64 = Buffer.from(pcm16.buffer).toString('base64');
            
            // Send in chunks
            const chunkSize = 8192;
            for (let i = 0; i < base64.length; i += chunkSize) {
                ws.send(JSON.stringify({
                    type: 'input_audio_buffer.append',
                    audio: base64.slice(i, i + chunkSize)
                }));
            }
            
            console.log('✅ Audio input sent');
        }, 1000);
    });
    
    let audioReceived = false;
    let audioPlayed = false;
    
    ws.on('message', async (data) => {
        const msg = JSON.parse(data);
        
        if (msg.type === 'error') {
            console.error('❌ Unmute error:', msg.error);
            return;
        }
        
        console.log(`📥 ${msg.type}`);
        
        if (msg.type === 'response.audio.delta' && msg.delta) {
            audioReceived = true;
            console.log('  🎵 Audio chunk received, testing playback...');
            
            // Send to test window
            const result = await testWindow.webContents.executeJavaScript(`
                (async () => {
                    try {
                        await window.testAudioPlayback('${msg.delta}');
                        return { success: true };
                    } catch (error) {
                        return { success: false, error: error.message };
                    }
                })();
            `);
            
            if (result.success) {
                audioPlayed = true;
                console.log('  ✅ Audio processed successfully!');
            } else {
                console.error('  ❌ Audio processing failed:', result.error);
            }
        }
        
        if (msg.type === 'response.done') {
            console.log('\n📊 Test Results:');
            console.log(`  Audio received: ${audioReceived ? '✅' : '❌'}`);
            console.log(`  Audio played: ${audioPlayed ? '✅' : '❌'}`);
            
            if (audioReceived && audioPlayed) {
                console.log('\n✅ AUDIO TEST PASSED!');
                testPassed = true;
                cleanup(0);
            } else {
                console.log('\n❌ AUDIO TEST FAILED');
                
                // Get detailed logs from test window
                const logs = await testWindow.webContents.executeJavaScript('window.getLogs()');
                console.log('\nDetailed logs:');
                logs.forEach(log => console.log(`  ${log}`));
                
                cleanup(1);
            }
        }
    });
    
    ws.on('error', (err) => {
        console.error('❌ WebSocket error:', err.message);
        cleanup(1);
    });
}

function cleanup(exitCode) {
    if (ws) ws.close();
    if (testWindow) testWindow.close();
    setTimeout(() => {
        app.quit();
        process.exit(exitCode);
    }, 1000);
}

app.on('window-all-closed', () => {
    app.quit();
});