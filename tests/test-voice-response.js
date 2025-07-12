#!/usr/bin/env node
/**
 * Test different voices and generate actual speech
 */
const WebSocket = require('ws');
const fs = require('fs');

const voice = process.argv[2] || 'nova';
console.log(`🎤 Testing Unmute with voice: ${voice}\n`);

const ws = new WebSocket('ws://localhost:8765/v1/realtime', ['realtime']);
let responseReceived = false;

// Timeout
setTimeout(() => {
    if (!responseReceived) {
        console.log('\n⏱️ Timeout - no response received');
    }
    ws.close();
}, 15000);

ws.on('open', () => {
    console.log('✅ Connected');
    
    // Configure session
    ws.send(JSON.stringify({
        type: 'session.update', 
        session: {
            voice: voice,
            allow_recording: false
        }
    }));
    
    // Wait then send actual speech audio
    setTimeout(() => {
        console.log('📤 Sending "Hello" audio...');
        
        // Generate a simple sine wave pattern that might be interpreted as speech
        const sampleRate = 16000;
        const duration = 1.0;
        const samples = sampleRate * duration;
        const pcm16 = new Int16Array(samples);
        
        // Create a more complex waveform that might trigger speech recognition
        for (let i = 0; i < samples; i++) {
            const t = i / sampleRate;
            // Mix multiple frequencies to simulate speech
            let sample = 0;
            sample += Math.sin(2 * Math.PI * 200 * t) * 0.3;  // Low freq
            sample += Math.sin(2 * Math.PI * 800 * t) * 0.2;  // Mid freq
            sample += Math.sin(2 * Math.PI * 2000 * t) * 0.1; // High freq
            
            // Add some envelope
            const envelope = Math.sin(Math.PI * t / duration);
            pcm16[i] = sample * envelope * 0x4000;
        }
        
        // Convert to base64 and send
        const bytes = new Uint8Array(pcm16.buffer);
        const base64 = Buffer.from(bytes).toString('base64');
        
        // Send in realistic chunks
        const chunkSize = 8192;
        for (let i = 0; i < base64.length; i += chunkSize) {
            ws.send(JSON.stringify({
                type: 'input_audio_buffer.append',
                audio: base64.slice(i, i + chunkSize)
            }));
        }
        
        console.log('✅ Audio sent');
    }, 1000);
});

ws.on('message', (data) => {
    const msg = JSON.parse(data);
    
    if (msg.type === 'error') {
        console.error('❌ Error:', msg.error);
        return;
    }
    
    console.log(`📥 ${msg.type}`);
    
    if (msg.type === 'response.created') {
        responseReceived = true;
    }
    
    if (msg.type === 'response.audio.delta' && msg.delta) {
        console.log(`  🎵 Audio received: ${msg.delta.length} bytes (base64)`);
        
        // Save first chunk for analysis
        if (!global.savedFirst) {
            global.savedFirst = true;
            const bytes = Buffer.from(msg.delta, 'base64');
            fs.writeFileSync('/tmp/unmute-response.bin', bytes);
            console.log('  💾 Saved to /tmp/unmute-response.bin');
            console.log(`  📊 First 8 bytes: ${bytes.slice(0, 8).toString('hex')}`);
        }
    }
    
    if (msg.type === 'response.audio_transcript.delta' && msg.delta) {
        console.log(`  🗣️ Unmute says: "${msg.delta}"`);
    }
    
    if (msg.type === 'conversation.item.input_audio_transcription.delta' && msg.transcript) {
        console.log(`  🎤 Heard: "${msg.transcript}"`);
    }
    
    if (msg.type === 'response.done') {
        console.log('\n✅ Complete');
        setTimeout(() => ws.close(), 500);
    }
});

ws.on('close', () => {
    console.log('\nTest finished');
    
    if (fs.existsSync('/tmp/unmute-response.bin')) {
        console.log('\nRun these commands to analyze the audio:');
        console.log('  file /tmp/unmute-response.bin');
        console.log('  hexdump -C /tmp/unmute-response.bin | head -10');
    }
});

ws.on('error', (err) => {
    console.error('❌ Error:', err.message);
});