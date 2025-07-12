#!/usr/bin/env node
/**
 * Test to verify the exact audio format returned by Unmute
 */
const WebSocket = require('ws');
const fs = require('fs');

console.log('🔍 Testing Unmute audio format...\n');

const ws = new WebSocket('ws://localhost:8765/v1/realtime', ['realtime']);
let audioReceived = false;

ws.on('open', () => {
    console.log('✅ Connected to Unmute');
    
    // Configure session
    ws.send(JSON.stringify({
        type: 'session.update',
        session: {
            voice: 'nova',
            model: 'unmute-mini'
        }
    }));
    
    // Send a simple text prompt to get audio response
    setTimeout(() => {
        console.log('📤 Sending text prompt to generate audio response...');
        
        // Create a short audio input that says "hello"
        const sampleRate = 16000;
        const duration = 0.5;
        const samples = sampleRate * duration;
        const pcm16 = new Int16Array(samples);
        
        // Generate a tone (to trigger a response)
        for (let i = 0; i < samples; i++) {
            pcm16[i] = Math.sin(2 * Math.PI * 440 * i / sampleRate) * 0x2000;
        }
        
        const bytes = new Uint8Array(pcm16.buffer);
        const base64 = Buffer.from(bytes).toString('base64');
        
        ws.send(JSON.stringify({
            type: 'input_audio_buffer.append',
            audio: base64
        }));
    }, 500);
});

ws.on('message', (data) => {
    const msg = JSON.parse(data);
    
    if (msg.type === 'error') {
        console.error('❌ Error:', msg.error);
        return;
    }
    
    console.log('📥 Message type:', msg.type);
    
    if (msg.type === 'response.audio.delta' && msg.delta) {
        audioReceived = true;
        console.log('\n🎵 Audio Response Analysis:');
        console.log('  Base64 length:', msg.delta.length);
        
        // Decode and analyze
        const audioBytes = Buffer.from(msg.delta, 'base64');
        console.log('  Decoded bytes:', audioBytes.length);
        
        // Log first 32 bytes as hex
        const header = audioBytes.slice(0, 32);
        console.log('  Header (hex):', header.toString('hex').match(/.{2}/g).join(' '));
        
        // Check for known signatures
        if (audioBytes[0] === 0x4F && audioBytes[1] === 0x67 && audioBytes[2] === 0x67 && audioBytes[3] === 0x53) {
            console.log('  ✅ Format: OGG container (OggS signature found)');
        } else if (audioBytes[0] === 0x1A && audioBytes[1] === 0x45 && audioBytes[2] === 0xDF) {
            console.log('  ✅ Format: WebM container');
        } else if (audioBytes[0] === 0xFF && (audioBytes[1] & 0xF0) === 0xF0) {
            console.log('  ✅ Format: Raw AAC/MP3');
        } else {
            console.log('  ❓ Format: Unknown - might be raw Opus frames');
            
            // Check if it looks like Opus TOC byte
            const tocByte = audioBytes[0];
            const config = (tocByte >> 3) & 0x1F;
            const stereo = (tocByte >> 2) & 0x01;
            const frameCount = tocByte & 0x03;
            
            console.log('  Possible Opus TOC byte analysis:');
            console.log(`    Config: ${config}`);
            console.log(`    Stereo: ${stereo}`);
            console.log(`    Frame count code: ${frameCount}`);
        }
        
        // Save samples for external analysis
        fs.writeFileSync('/tmp/unmute-audio-sample.bin', audioBytes);
        console.log('\n  💾 Saved to: /tmp/unmute-audio-sample.bin');
        console.log('  Run: file /tmp/unmute-audio-sample.bin');
        console.log('  Or: hexdump -C /tmp/unmute-audio-sample.bin | head -20');
        
        // Try to save multiple chunks
        if (!global.allChunks) {
            global.allChunks = [];
        }
        global.allChunks.push(audioBytes);
    }
    
    if (msg.type === 'response.done') {
        console.log('\n✅ Response complete');
        
        if (global.allChunks && global.allChunks.length > 0) {
            const combined = Buffer.concat(global.allChunks);
            fs.writeFileSync('/tmp/unmute-audio-combined.bin', combined);
            console.log(`\n💾 Saved ${global.allChunks.length} chunks combined to: /tmp/unmute-audio-combined.bin`);
            console.log('  Total size:', combined.length, 'bytes');
        }
        
        setTimeout(() => ws.close(), 1000);
    }
});

ws.on('close', () => {
    console.log('\n🔌 Connection closed');
    
    if (!audioReceived) {
        console.log('\n❌ No audio received from Unmute');
        console.log('💡 Check: docker logs unmute-backend');
    } else {
        console.log('\n✅ Test complete - check the saved files for format analysis');
    }
});

ws.on('error', (err) => {
    console.error('❌ WebSocket error:', err.message);
});