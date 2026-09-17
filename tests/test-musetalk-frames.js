#!/usr/bin/env node
/**
 * Test MuseTalk frame generation directly
 */

const WebSocket = require('ws');
const config = require('../config');

async function testMuseTalkFrames() {
    console.log('🔗 Testing MuseTalk WebSocket frame generation...');
    console.log('WS URL:', config.MUSETALK_WS);
    
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(config.MUSETALK_WS);
        let frameCount = 0;
        const startTime = Date.now();
        
        ws.on('open', () => {
            console.log('✅ Connected to MuseTalk WebSocket');
            
            // Send test audio data
            console.log('📤 Sending test audio...');
            
            // Create a simple sine wave audio
            const sampleRate = 24000;
            const duration = 2; // 2 seconds
            const samples = sampleRate * duration;
            const audioData = new Float32Array(samples);
            
            // Generate sine wave
            for (let i = 0; i < samples; i++) {
                audioData[i] = Math.sin(2 * Math.PI * 440 * i / sampleRate) * 0.5;
            }
            
            // Convert to base64
            const buffer = Buffer.from(audioData.buffer);
            const base64Audio = buffer.toString('base64');
            
            // Send audio chunks
            const chunkSize = 4800; // 200ms chunks at 24kHz
            for (let i = 0; i < samples; i += chunkSize) {
                const chunk = audioData.slice(i, Math.min(i + chunkSize, samples));
                const chunkBuffer = Buffer.from(chunk.buffer);
                const chunkBase64 = chunkBuffer.toString('base64');
                
                ws.send(JSON.stringify({
                    type: 'audio',
                    audio: chunkBase64,
                    timestamp: Date.now()
                }));
            }
            
            console.log('📤 Sent audio data');
        });
        
        ws.on('message', (data) => {
            try {
                const msg = JSON.parse(data.toString());
                
                if (msg.type === 'frame') {
                    frameCount++;
                    const elapsed = (Date.now() - startTime) / 1000;
                    const fps = frameCount / elapsed;
                    
                    console.log(`🎭 Received frame ${frameCount} (${fps.toFixed(1)} FPS)`);
                    console.log(`   Frame size: ${msg.frame ? msg.frame.length : 0} bytes`);
                    
                    // Close after receiving 30 frames
                    if (frameCount >= 30) {
                        console.log(`\n✅ Successfully received ${frameCount} frames`);
                        console.log(`Average FPS: ${fps.toFixed(1)}`);
                        ws.close();
                        resolve(true);
                    }
                } else if (msg.type === 'error') {
                    console.error('❌ MuseTalk error:', msg.message);
                } else {
                    console.log('📨 Message:', msg.type);
                }
            } catch (error) {
                console.error('Error parsing message:', error);
            }
        });
        
        ws.on('error', (error) => {
            console.error('❌ WebSocket error:', error.message);
            reject(error);
        });
        
        ws.on('close', () => {
            console.log('🔌 WebSocket closed');
            if (frameCount === 0) {
                reject(new Error('No frames received'));
            }
        });
        
        // Timeout after 10 seconds
        setTimeout(() => {
            if (ws.readyState === WebSocket.OPEN) {
                console.log('⏱️ Timeout - closing connection');
                ws.close();
            }
            if (frameCount === 0) {
                reject(new Error('Timeout - no frames received'));
            } else {
                resolve(true);
            }
        }, 10000);
    });
}

// Run the test
testMuseTalkFrames()
    .then(() => {
        console.log('\n🎉 MuseTalk frame test completed successfully!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ MuseTalk frame test failed:', error.message);
        process.exit(1);
    });