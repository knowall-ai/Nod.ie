#!/usr/bin/env node

/**
 * Analyze audio flow between Nod.ie and Unmute
 */

const WebSocket = require('ws');
const { spawn } = require('child_process');

console.log('🔍 AUDIO FLOW ANALYSIS\n');

// Test WebSocket connection and capture messages
async function analyzeWebSocket() {
    console.log('1. Testing WebSocket Connection...\n');
    
    const ws = new WebSocket('ws://localhost:8765/v1/realtime', ['realtime']);
    const messages = [];
    
    return new Promise((resolve) => {
        ws.on('open', () => {
            console.log('✅ Connected to WebSocket\n');
            
            // Send session config
            const session = {
                type: 'session.update',
                session: {
                    voice: 'nova',
                    language: 'en',
                    output_audio_format: 'opus',
                    instructions: {
                        type: 'constant',
                        text: 'Test assistant'
                    }
                }
            };
            
            console.log('📤 Sending session config...');
            ws.send(JSON.stringify(session));
            
            // Send a simple text message to trigger response
            setTimeout(() => {
                const textMsg = {
                    type: 'conversation.item.create',
                    item: {
                        type: 'message',
                        role: 'user',
                        content: [{
                            type: 'input_text',
                            text: 'Say hello'
                        }]
                    }
                };
                console.log('📤 Sending text message to trigger audio response...');
                ws.send(JSON.stringify(textMsg));
            }, 1000);
        });
        
        ws.on('message', (data) => {
            const msg = JSON.parse(data);
            messages.push(msg);
            
            if (msg.type === 'response.audio.delta' && msg.delta) {
                console.log('\n📥 AUDIO RESPONSE RECEIVED!');
                console.log('- Message type:', msg.type);
                console.log('- Audio data length:', msg.delta.length);
                console.log('- First 50 chars:', msg.delta.substring(0, 50));
                console.log('- Is base64:', /^[A-Za-z0-9+/=]+$/.test(msg.delta));
                
                // Decode and analyze
                try {
                    const decoded = Buffer.from(msg.delta, 'base64');
                    console.log('- Decoded size:', decoded.length, 'bytes');
                    console.log('- First 10 bytes:', Array.from(decoded.slice(0, 10)));
                    
                    // Check if it's Opus
                    if (decoded[0] === 0x4F && decoded[1] === 0x67 && decoded[2] === 0x67 && decoded[3] === 0x53) {
                        console.log('- Format: OGG container (OggS header found)');
                    } else {
                        console.log('- Format: Raw Opus frames (no OGG container)');
                    }
                } catch (e) {
                    console.log('- Decode error:', e.message);
                }
                
                ws.close();
                resolve(messages);
            }
        });
        
        ws.on('error', (err) => {
            console.error('❌ WebSocket error:', err.message);
            resolve(messages);
        });
        
        // Timeout
        setTimeout(() => {
            console.log('\n⏱️ Timeout - no audio response received');
            ws.close();
            resolve(messages);
        }, 10000);
    });
}

// Compare with Unmute frontend
async function compareWithUnmute() {
    console.log('\n2. Comparing with Unmute Frontend...\n');
    
    console.log('📊 KEY DIFFERENCES FOUND:\n');
    
    console.log('AUDIO CAPTURE (Mic → Backend):');
    console.log('✅ Nod.ie: Uses opus-recorder with streamPages=true');
    console.log('✅ Unmute: Uses opus-recorder with streamPages=true');
    console.log('→ Both implementations are identical\n');
    
    console.log('AUDIO PLAYBACK (Backend → Speakers):');
    console.log('❌ Nod.ie: Sends Opus to decoder but may not handle response correctly');
    console.log('✅ Unmute: Decodes Opus → PCM → AudioWorklet → Speakers');
    console.log('→ Issue: Check decoder message handling\n');
    
    console.log('MESSAGE FORMAT:');
    console.log('- Both use: input_audio_buffer.append with base64 audio');
    console.log('- Both receive: response.audio.delta with base64 Opus\n');
}

// Check audio processing
async function checkAudioProcessing() {
    console.log('3. Audio Processing Pipeline...\n');
    
    console.log('EXPECTED FLOW:');
    console.log('1. WebSocket receives response.audio.delta (base64)');
    console.log('2. Base64 decode → Uint8Array of Opus bytes');
    console.log('3. Send to decoder worker: {command: "decode", pages: opusBytes}');
    console.log('4. Decoder returns Float32Array(s) of PCM samples');
    console.log('5. Send PCM to AudioWorklet: {frame: pcmData, type: "audio"}');
    console.log('6. AudioWorklet buffers and plays PCM\n');
    
    console.log('POTENTIAL ISSUES:');
    console.log('- Decoder not initialized properly?');
    console.log('- Decoder message format mismatch?');
    console.log('- AudioWorklet not receiving PCM frames?');
    console.log('- Audio context suspended?\n');
}

// Run analysis
async function runAnalysis() {
    const messages = await analyzeWebSocket();
    await compareWithUnmute();
    await checkAudioProcessing();
    
    console.log('4. Summary\n');
    console.log(`Total messages received: ${messages.length}`);
    
    const audioMessages = messages.filter(m => m.type === 'response.audio.delta');
    console.log(`Audio delta messages: ${audioMessages.length}`);
    
    if (audioMessages.length > 0) {
        console.log('\n✅ Backend is sending audio responses');
        console.log('❌ But Nod.ie is not playing them\n');
        
        console.log('NEXT STEPS:');
        console.log('1. Check browser console for decoder messages');
        console.log('2. Verify AudioWorklet is receiving PCM frames');
        console.log('3. Check audio context is not suspended');
        console.log('4. Compare network traffic in DevTools');
    } else {
        console.log('\n❌ No audio responses received from backend');
    }
}

runAnalysis().catch(console.error);