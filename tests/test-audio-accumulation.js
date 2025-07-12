#!/usr/bin/env node
/**
 * Test if Unmute sends complete audio or needs accumulation
 */
const WebSocket = require('ws');
const fs = require('fs');
const { exec } = require('child_process');

console.log('🔊 Testing Unmute audio accumulation\n');

const ws = new WebSocket('ws://localhost:8765/v1/realtime', ['realtime']);
const audioChunks = [];
let responseId = null;

ws.on('open', () => {
    console.log('✅ Connected');
    
    // Configure session
    ws.send(JSON.stringify({
        type: 'session.update',
        session: {
            voice: 'nova',
            allow_recording: false
        }
    }));
    
    // Send silence to trigger response
    setTimeout(() => {
        const pcm16 = new Int16Array(16000); // 1 second silence
        const base64 = Buffer.from(pcm16.buffer).toString('base64');
        
        ws.send(JSON.stringify({
            type: 'input_audio_buffer.append',
            audio: base64
        }));
        
        console.log('📤 Sent input audio');
    }, 500);
});

ws.on('message', (data) => {
    const msg = JSON.parse(data);
    
    if (msg.type === 'response.created') {
        responseId = msg.response.id;
        console.log('📥 Response started, ID:', responseId);
    }
    
    if (msg.type === 'response.audio.delta') {
        const chunkData = {
            index: audioChunks.length,
            base64Length: msg.delta?.length || 0,
            responseId: msg.response_id
        };
        
        if (msg.delta) {
            chunkData.bytes = Buffer.from(msg.delta, 'base64');
            audioChunks.push(chunkData.bytes);
        }
        
        console.log(`📥 Audio chunk ${chunkData.index}: ${chunkData.bytes?.length || 0} bytes`);
    }
    
    if (msg.type === 'response.done') {
        console.log('\n✅ Response complete');
        console.log(`📊 Total chunks: ${audioChunks.length}`);
        
        if (audioChunks.length > 0) {
            // Save individual chunks
            audioChunks.forEach((chunk, i) => {
                fs.writeFileSync(`/tmp/chunk-${i}.opus`, chunk);
            });
            
            // Save combined
            const combined = Buffer.concat(audioChunks);
            fs.writeFileSync('/tmp/combined.opus', combined);
            
            console.log(`\n💾 Saved ${audioChunks.length} chunks`);
            console.log(`📏 Combined size: ${combined.length} bytes`);
            
            // Try to identify format
            exec('file /tmp/chunk-0.opus', (err, stdout) => {
                console.log('\n🔍 First chunk format:');
                console.log(stdout);
                
                exec('file /tmp/combined.opus', (err2, stdout2) => {
                    console.log('🔍 Combined format:');
                    console.log(stdout2);
                    
                    // Try playing
                    console.log('\n🔊 Attempting playback...');
                    exec('ffplay -nodisp -autoexit /tmp/combined.opus 2>&1', (err3, stdout3, stderr3) => {
                        if (err3) {
                            console.log('❌ ffplay failed:', stderr3);
                            
                            // Try with explicit format
                            exec('ffplay -f opus -nodisp -autoexit /tmp/combined.opus 2>&1', (err4, stdout4, stderr4) => {
                                if (err4) {
                                    console.log('❌ ffplay -f opus failed:', stderr4);
                                } else {
                                    console.log('✅ Playback worked with -f opus flag!');
                                }
                                ws.close();
                            });
                        } else {
                            console.log('✅ Playback successful!');
                            ws.close();
                        }
                    });
                });
            });
        } else {
            console.log('❌ No audio chunks received');
            ws.close();
        }
    }
});

ws.on('close', () => {
    console.log('\n🔌 Test complete');
});

ws.on('error', (err) => {
    console.error('❌ Error:', err.message);
});