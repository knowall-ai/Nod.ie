#!/usr/bin/env node

/**
 * Test PCM Audio Flow to MuseTalk
 * Tests the complete audio pipeline from PCM audio through MuseTalk processing
 */

const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

// Get config from environment
const MUSETALK_WS_URL = process.env.MUSETALK_WS || 'ws://localhost:8765/ws';

// Generate test PCM audio (1 second of 440Hz sine wave at 48kHz)
function generateTestPCM(durationSeconds = 1, sampleRate = 48000) {
    const numSamples = sampleRate * durationSeconds;
    const frequency = 440; // A4 note
    const pcmData = new Int16Array(numSamples);
    
    for (let i = 0; i < numSamples; i++) {
        const t = i / sampleRate;
        const sample = Math.sin(2 * Math.PI * frequency * t);
        pcmData[i] = Math.floor(sample * 32767); // Convert to int16
    }
    
    return Buffer.from(pcmData.buffer);
}

async function testPCMAudioFlow() {
    console.log('🔗 Testing PCM Audio Flow to MuseTalk...');
    console.log('WS URL:', MUSETALK_WS_URL);
    
    const ws = new WebSocket(MUSETALK_WS_URL);
    let frameCount = 0;
    let startTime = Date.now();
    
    return new Promise((resolve, reject) => {
        ws.on('open', () => {
            console.log('✅ Connected to MuseTalk WebSocket');
            
            // Generate test PCM audio
            const pcmBuffer = generateTestPCM(0.5); // 0.5 seconds of audio
            const base64Audio = pcmBuffer.toString('base64');
            
            console.log('📤 Sending PCM audio...');
            console.log(`   Size: ${pcmBuffer.length} bytes`);
            console.log(`   Format: PCM Int16`);
            console.log(`   Sample Rate: 48000 Hz`);
            console.log(`   Duration: 0.5 seconds`);
            
            // Send PCM audio with metadata
            const audioMessage = {
                type: 'audio',
                audio: base64Audio,
                format: 'pcm',
                sampleRate: 48000,
                channels: 1,
                bitDepth: 16,
                timestamp: Date.now()
            };
            
            ws.send(JSON.stringify(audioMessage));
            console.log('📤 Sent PCM audio data with metadata');
            
            // Send a few more chunks to test continuous processing
            setTimeout(() => {
                const pcmBuffer2 = generateTestPCM(0.3, 48000);
                ws.send(JSON.stringify({
                    type: 'audio',
                    audio: pcmBuffer2.toString('base64'),
                    format: 'pcm',
                    sampleRate: 48000,
                    channels: 1,
                    bitDepth: 16,
                    timestamp: Date.now()
                }));
                console.log('📤 Sent second PCM chunk');
            }, 500);
            
            // Close after timeout
            setTimeout(() => {
                console.log('⏱️ Test duration complete - closing connection');
                ws.close();
            }, 5000);
        });
        
        ws.on('message', (data) => {
            try {
                const msg = JSON.parse(data);
                if (msg.type === 'frame') {
                    frameCount++;
                    const elapsed = (Date.now() - startTime) / 1000;
                    const fps = frameCount / elapsed;
                    
                    console.log(`🎭 Received frame ${frameCount} (${fps.toFixed(1)} FPS)`);
                    console.log(`   Frame size: ${msg.frame.length} bytes`);
                    
                    // Save first frame for inspection
                    if (frameCount === 1 && msg.frame) {
                        const frameBuffer = Buffer.from(msg.frame, 'base64');
                        const framePath = path.join(__dirname, 'screenshots', 'pcm-test-frame.jpg');
                        fs.mkdirSync(path.dirname(framePath), { recursive: true });
                        fs.writeFileSync(framePath, frameBuffer);
                        console.log(`   Saved first frame to: ${framePath}`);
                    }
                } else if (msg.type === 'error') {
                    console.error('❌ MuseTalk error:', msg.message);
                } else {
                    console.log('📨 Other message:', msg.type);
                }
            } catch (e) {
                console.error('Error parsing message:', e);
            }
        });
        
        ws.on('error', (error) => {
            console.error('❌ WebSocket error:', error);
            reject(error);
        });
        
        ws.on('close', () => {
            console.log(`\n📊 Test Summary:`);
            console.log(`   Total frames received: ${frameCount}`);
            console.log(`   Test duration: ${((Date.now() - startTime) / 1000).toFixed(1)} seconds`);
            console.log(`   Average FPS: ${(frameCount / ((Date.now() - startTime) / 1000)).toFixed(1)} FPS`);
            
            if (frameCount > 0) {
                console.log('\n🎉 PCM audio flow test completed successfully!');
                resolve();
            } else {
                console.log('\n⚠️ No frames received - check MuseTalk logs');
                reject(new Error('No frames received'));
            }
        });
    });
}

// Run the test
testPCMAudioFlow()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error('Test failed:', error);
        process.exit(1);
    });