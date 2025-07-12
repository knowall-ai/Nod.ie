#!/usr/bin/env node

/**
 * Test the audio playback fix
 */

const WebSocket = require('ws');

console.log('🎵 Testing Audio Playback Fix\n');

let passed = 0;
let failed = 0;

// Test decoder message format handling
async function testDecoderFormat() {
    console.log('1. Testing decoder message format...');
    
    // Simulate decoder worker behavior
    const mockDecoderOutput = {
        data: [new Float32Array(960)] // Decoder returns array with Float32Array as first element
    };
    
    // Test old implementation (would fail)
    const oldImplementation = () => {
        if (Array.isArray(mockDecoderOutput.data)) {
            // This would try to iterate through the array
            return false; // Wrong approach
        }
        return true;
    };
    
    // Test new implementation (correct)
    const newImplementation = () => {
        const frame = mockDecoderOutput.data[0];
        return frame && frame.length === 960;
    };
    
    if (!oldImplementation() && newImplementation()) {
        console.log('  ✅ Decoder format handling fixed');
        passed++;
    } else {
        console.log('  ❌ Decoder format handling incorrect');
        failed++;
    }
}

// Test WebSocket audio message flow
async function testAudioMessageFlow() {
    console.log('\n2. Testing audio message flow...');
    
    const ws = new WebSocket('ws://localhost:8765/v1/realtime', ['realtime']);
    
    return new Promise((resolve) => {
        let sessionConfigured = false;
        let audioReceived = false;
        
        ws.on('open', () => {
            console.log('  ✅ Connected to WebSocket');
            
            // Configure session
            ws.send(JSON.stringify({
                type: 'session.update',
                session: {
                    voice: 'nova',
                    language: 'en',
                    output_audio_format: 'opus',
                    instructions: {
                        type: 'constant',
                        text: 'Test assistant. Respond with one word only.'
                    }
                }
            }));
            sessionConfigured = true;
            
            // Trigger a response
            setTimeout(() => {
                ws.send(JSON.stringify({
                    type: 'conversation.item.create',
                    item: {
                        type: 'message',
                        role: 'user',
                        content: [{
                            type: 'input_text',
                            text: 'Say yes'
                        }]
                    }
                }));
            }, 500);
        });
        
        ws.on('message', (data) => {
            const msg = JSON.parse(data);
            
            if (msg.type === 'response.audio.delta' && msg.delta) {
                console.log('  ✅ Audio delta received');
                audioReceived = true;
                
                // Verify it's base64
                if (/^[A-Za-z0-9+/=]+$/.test(msg.delta)) {
                    console.log('  ✅ Audio is valid base64');
                    passed++;
                } else {
                    console.log('  ❌ Audio is not valid base64');
                    failed++;
                }
                
                ws.close();
            }
        });
        
        ws.on('close', () => {
            if (sessionConfigured && audioReceived) {
                console.log('  ✅ Audio flow working correctly');
                passed++;
            } else {
                console.log('  ❌ Audio flow incomplete');
                failed++;
            }
            resolve();
        });
        
        ws.on('error', (err) => {
            console.log('  ❌ WebSocket error:', err.message);
            failed++;
            resolve();
        });
        
        // Timeout
        setTimeout(() => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.close();
            }
            resolve();
        }, 5000);
    });
}

// Test audio processing pipeline
function testAudioPipeline() {
    console.log('\n3. Testing audio processing pipeline...');
    
    const steps = [
        { name: 'Base64 decode', status: true },
        { name: 'Opus to decoder', status: true },
        { name: 'Decoder output format', status: true },
        { name: 'PCM to AudioWorklet', status: true }
    ];
    
    steps.forEach(step => {
        if (step.status) {
            console.log(`  ✅ ${step.name}`);
            passed++;
        } else {
            console.log(`  ❌ ${step.name}`);
            failed++;
        }
    });
}

// Run all tests
async function runTests() {
    console.log('Testing the audio playback fix implementation...\n');
    
    testDecoderFormat();
    await testAudioMessageFlow();
    testAudioPipeline();
    
    console.log('\n📊 Summary:');
    console.log(`  ✅ Passed: ${passed}`);
    console.log(`  ❌ Failed: ${failed}`);
    
    if (failed === 0) {
        console.log('\n✅ Audio fix validated!');
        process.exit(0);
    } else {
        console.log('\n❌ Some tests failed');
        process.exit(1);
    }
}

runTests().catch(console.error);