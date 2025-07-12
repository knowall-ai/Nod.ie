#!/usr/bin/env node

/**
 * Direct test of Unmute WebSocket with proper Opus data
 */

const WebSocket = require('ws');
const fs = require('fs');

console.log('Testing Unmute WebSocket directly...\n');

// Create a valid Opus stream with multiple pages
function createOpusStream() {
    const pages = [];
    
    // Page 1: OpusHead (header)
    const opusHead = Buffer.concat([
        Buffer.from([
            0x4F, 0x67, 0x67, 0x53,  // OggS
            0x00,                     // Version
            0x02,                     // Header type (first page)
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,  // Granule position
            0x12, 0x34, 0x56, 0x78,  // Serial number
            0x00, 0x00, 0x00, 0x00,  // Page sequence
            0x00, 0x00, 0x00, 0x00,  // CRC (placeholder)
            0x01,                     // Number of segments
            0x13                      // Segment size (19 bytes for OpusHead)
        ]),
        Buffer.from([
            0x4F, 0x70, 0x75, 0x73,  // OpusHead magic
            0x48, 0x65, 0x61, 0x64,  // "Head"
            0x01,                     // Version
            0x01,                     // Channel count
            0x38, 0x01,              // Pre-skip (312)
            0xC0, 0x5D, 0x00, 0x00,  // Sample rate (24000)
            0x00, 0x00,              // Output gain
            0x00                      // Channel mapping
        ])
    ]);
    pages.push(opusHead);
    
    // Page 2: OpusTags (comment header)
    const opusTags = Buffer.concat([
        Buffer.from([
            0x4F, 0x67, 0x67, 0x53,  // OggS
            0x00,                     // Version
            0x00,                     // Header type (continuation)
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,  // Granule position
            0x12, 0x34, 0x56, 0x78,  // Serial number
            0x01, 0x00, 0x00, 0x00,  // Page sequence
            0x00, 0x00, 0x00, 0x00,  // CRC (placeholder)
            0x01,                     // Number of segments
            0x10                      // Segment size
        ]),
        Buffer.from([
            0x4F, 0x70, 0x75, 0x73,  // OpusTags magic
            0x54, 0x61, 0x67, 0x73,  // "Tags"
            0x00, 0x00, 0x00, 0x00,  // Vendor string length
            0x00, 0x00, 0x00, 0x00   // Comment count
        ])
    ]);
    pages.push(opusTags);
    
    // Page 3+: Audio data (silence)
    for (let i = 0; i < 20; i++) {
        const audioPage = Buffer.concat([
            Buffer.from([
                0x4F, 0x67, 0x67, 0x53,  // OggS
                0x00,                     // Version
                0x00,                     // Header type
                0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,  // Granule position
                0x12, 0x34, 0x56, 0x78,  // Serial number
                (i + 2), 0x00, 0x00, 0x00,  // Page sequence
                0x00, 0x00, 0x00, 0x00,  // CRC (placeholder)
                0x01,                     // Number of segments
                0x03                      // Segment size (3 bytes - minimal Opus frame)
            ]),
            Buffer.from([0xFC, 0xFF, 0xFE])  // Opus silence frame
        ]);
        pages.push(audioPage);
    }
    
    return pages;
}

async function testUnmute() {
    const ws = new WebSocket('ws://localhost:8765/v1/realtime', ['realtime']);
    let messageCount = 0;
    
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
                    text: 'You are a helpful assistant. Say "Hello, I can hear you!" when you receive audio.'
                }
            }
        }));
        
        console.log('📤 Sending Opus audio stream...');
        
        // Send audio pages
        const pages = createOpusStream();
        pages.forEach((page, index) => {
            setTimeout(() => {
                const base64 = page.toString('base64');
                ws.send(JSON.stringify({
                    type: 'input_audio_buffer.append',
                    audio: base64
                }));
                console.log(`   Sent page ${index + 1}/${pages.length} (${page.length} bytes)`);
            }, index * 50);  // Send pages with 50ms intervals
        });
    });
    
    ws.on('message', (data) => {
        messageCount++;
        const msg = JSON.parse(data);
        
        if (messageCount <= 10 || msg.type.includes('audio')) {
            console.log(`\n📨 Message ${messageCount}: ${msg.type}`);
            
            if (msg.type === 'response.audio.delta') {
                console.log('✅ AUDIO RESPONSE RECEIVED!');
                console.log(`   Audio length: ${msg.delta?.length || 0} bytes`);
                console.log('   Unmute is working correctly!');
                
                // Close after receiving audio
                setTimeout(() => ws.close(), 1000);
            }
            
            if (msg.type === 'response.text.delta') {
                console.log(`   Text: "${msg.delta}"`);
            }
            
            if (msg.type === 'response.done') {
                console.log('   Response completed');
            }
            
            if (msg.error) {
                console.log('❌ Error:', msg.error);
            }
        }
    });
    
    ws.on('error', (err) => {
        console.error('WebSocket error:', err);
    });
    
    ws.on('close', () => {
        console.log('\nConnection closed');
    });
    
    // Timeout after 15 seconds
    setTimeout(() => {
        console.log('\n⏱️ Test timeout - closing connection');
        ws.close();
    }, 15000);
}

testUnmute().catch(console.error);