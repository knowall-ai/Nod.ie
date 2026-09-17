#!/usr/bin/env node
/**
 * Test MuseTalk Opus audio processing
 */

const WebSocket = require('ws');
const fs = require('fs');

async function testMuseTalkOpus() {
    console.log('🧪 Testing MuseTalk Opus audio processing...');
    
    try {
        // Create a simple Opus audio sample (simulated)
        const dummyOpusData = Buffer.from([
            // OGG Opus header with BOS flag
            0x4F, 0x67, 0x67, 0x53, 0x00, 0x02, // OggS with BOS flag
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x01, 0x02, 0x03, 0x04, // serial number
            0x00, 0x00, 0x00, 0x00, // page sequence
            0x7F, 0x98, 0x6C, 0x2B, // checksum placeholder
            0x01, // segment count
            0x13, // segment length
            // OpusHead packet
            0x4F, 0x70, 0x75, 0x73, 0x48, 0x65, 0x61, 0x64,
            0x01, 0x01, 0x38, 0x01, 0x80, 0xBB, 0x00, 0x00,
            0x00, 0x00, 0x00
        ]);
        
        const base64Audio = dummyOpusData.toString('base64');
        console.log(`🎵 Created dummy Opus data: ${base64Audio.length} chars`);
        
        // Connect to MuseTalk WebSocket
        const ws = new WebSocket('ws://localhost:8765/ws');
        
        ws.on('open', () => {
            console.log('✅ Connected to MuseTalk WebSocket');
            
            // Send audio data
            ws.send(JSON.stringify({
                type: 'audio',
                audio: base64Audio,
                timestamp: Date.now()
            }));
            console.log('📤 Sent audio data to MuseTalk');
        });
        
        ws.on('message', (data) => {
            try {
                const message = JSON.parse(data);
                if (message.type === 'frame') {
                    console.log('🎭 Received lip-sync frame from MuseTalk');
                    console.log(`   Timestamp: ${message.timestamp}`);
                    console.log(`   Frame size: ${message.frame ? message.frame.length : 0} chars`);
                    
                    // Close after receiving first frame
                    ws.close();
                    process.exit(0);
                } else {
                    console.log('📨 Received message:', message.type);
                }
            } catch (err) {
                console.error('Error parsing message:', err);
            }
        });
        
        ws.on('error', (error) => {
            console.error('❌ WebSocket error:', error);
        });
        
        ws.on('close', () => {
            console.log('🔌 WebSocket closed');
        });
        
        // Timeout after 10 seconds
        setTimeout(() => {
            console.log('⏰ Test timeout - closing connection');
            ws.close();
            process.exit(1);
        }, 10000);
        
    } catch (error) {
        console.error('❌ Test failed:', error);
        process.exit(1);
    }
}

// Run the test
testMuseTalkOpus();