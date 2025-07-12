#!/usr/bin/env node

/**
 * Test Unmute with timed audio chunks to simulate speech
 */

const WebSocket = require('ws');

console.log('Testing Unmute with simulated speech timing...\n');

function createOpusHeaders() {
    // OpusHead
    const opusHead = Buffer.concat([
        Buffer.from([
            0x4F, 0x67, 0x67, 0x53,  // OggS
            0x00,                     // Version
            0x02,                     // Header type (first page)
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,  // Granule
            0x12, 0x34, 0x56, 0x78,  // Serial
            0x00, 0x00, 0x00, 0x00,  // Sequence
            0x00, 0x00, 0x00, 0x00,  // CRC
            0x01,                     // Segments
            0x13                      // Segment size
        ]),
        Buffer.from([
            0x4F, 0x70, 0x75, 0x73,  // OpusHead
            0x48, 0x65, 0x61, 0x64,
            0x01,                     // Version
            0x01,                     // Channels
            0x38, 0x01,              // Pre-skip
            0xC0, 0x5D, 0x00, 0x00,  // Sample rate (24000)
            0x00, 0x00,              // Gain
            0x00                      // Mapping
        ])
    ]);
    
    // OpusTags
    const opusTags = Buffer.concat([
        Buffer.from([
            0x4F, 0x67, 0x67, 0x53,  // OggS
            0x00,                     // Version
            0x00,                     // Header type
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x12, 0x34, 0x56, 0x78,
            0x01, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00,
            0x01,
            0x10
        ]),
        Buffer.from([
            0x4F, 0x70, 0x75, 0x73,  // OpusTags
            0x54, 0x61, 0x67, 0x73,
            0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00
        ])
    ]);
    
    return [opusHead, opusTags];
}

async function testUnmute() {
    const ws = new WebSocket('ws://localhost:8765/v1/realtime', ['realtime']);
    let sequence = 2;
    
    ws.on('open', () => {
        console.log('✓ Connected to Unmute\n');
        
        // Configure session
        ws.send(JSON.stringify({
            type: 'session.update',
            session: {
                voice: 'nova',
                allow_recording: false,
                instructions: {
                    type: 'constant',
                    text: 'You are Nod.ie, a friendly AI assistant. When you hear silence or any audio, please say "Hello! I can hear you. How can I help today?"'
                }
            }
        }));
        
        // Send headers first
        const [head, tags] = createOpusHeaders();
        ws.send(JSON.stringify({
            type: 'input_audio_buffer.append',
            audio: head.toString('base64')
        }));
        
        setTimeout(() => {
            ws.send(JSON.stringify({
                type: 'input_audio_buffer.append',
                audio: tags.toString('base64')
            }));
        }, 50);
        
        // Send audio chunks over 3 seconds to simulate speech
        console.log('📤 Sending audio chunks (3 seconds)...');
        let chunkCount = 0;
        
        const audioInterval = setInterval(() => {
            // Create audio page with varying content to simulate speech
            const audioPage = Buffer.concat([
                Buffer.from([
                    0x4F, 0x67, 0x67, 0x53,  // OggS
                    0x00,                     // Version
                    0x00,                     // Header type
                    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
                    0x12, 0x34, 0x56, 0x78,
                    sequence, 0x00, 0x00, 0x00,
                    0x00, 0x00, 0x00, 0x00,
                    0x01,
                    0x03
                ]),
                // Vary the audio data slightly
                Buffer.from([0xFC, 0xFF, 0xFE - (chunkCount % 3)])
            ]);
            
            ws.send(JSON.stringify({
                type: 'input_audio_buffer.append',
                audio: audioPage.toString('base64')
            }));
            
            sequence++;
            chunkCount++;
            
            if (chunkCount >= 30) {  // 3 seconds at 100ms intervals
                clearInterval(audioInterval);
                console.log(`   Sent ${chunkCount} audio chunks`);
                console.log('\n⏳ Waiting for response...\n');
            }
        }, 100);
    });
    
    ws.on('message', (data) => {
        const msg = JSON.parse(data);
        
        if (msg.type !== 'session.updated') {
            console.log(`📨 ${msg.type}`);
        }
        
        if (msg.type === 'response.audio.delta') {
            console.log('✅ AUDIO RESPONSE RECEIVED!');
            console.log(`   Audio length: ${msg.delta?.length || 0} bytes`);
            setTimeout(() => ws.close(), 2000);
        }
        
        if (msg.type === 'response.text.delta' && msg.delta) {
            console.log(`   Text: "${msg.delta}"`);
        }
        
        if (msg.type === 'response.function_call') {
            console.log(`   Function: ${msg.name}`);
        }
        
        if (msg.error) {
            console.log('❌ Error:', JSON.stringify(msg.error, null, 2));
        }
    });
    
    ws.on('error', (err) => {
        console.error('WebSocket error:', err);
    });
    
    ws.on('close', () => {
        console.log('\nTest completed');
        process.exit(0);
    });
    
    // Timeout after 20 seconds
    setTimeout(() => {
        console.log('\n⏱️ Test timeout');
        ws.close();
    }, 20000);
}

testUnmute().catch(console.error);