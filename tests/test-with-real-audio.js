#!/usr/bin/env node

/**
 * Test Nod.ie with real audio recording
 */

const { spawn } = require('child_process');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

console.log('╔════════════════════════════════════════╗');
console.log('║    REAL AUDIO TEST FOR NOD.IE          ║');
console.log('╚════════════════════════════════════════╝\n');

// First, let's record some real audio
async function recordAudio() {
    console.log('🎤 Recording 3 seconds of audio...');
    
    return new Promise((resolve, reject) => {
        // Use arecord to capture raw audio
        const record = spawn('arecord', [
            '-f', 'S16_LE',     // 16-bit signed little-endian
            '-r', '24000',       // 24kHz sample rate
            '-c', '1',           // Mono
            '-d', '3',           // 3 seconds
            '-t', 'raw',         // Raw format
            '/tmp/test-audio.raw'
        ]);
        
        record.on('close', (code) => {
            if (code === 0) {
                console.log('✓ Audio recorded successfully');
                resolve();
            } else {
                reject(new Error(`Recording failed with code ${code}`));
            }
        });
        
        record.on('error', reject);
    });
}

// Convert raw audio to Opus using ffmpeg
async function convertToOpus() {
    console.log('🔄 Converting to Opus format...');
    
    return new Promise((resolve, reject) => {
        const convert = spawn('ffmpeg', [
            '-f', 's16le',
            '-ar', '24000',
            '-ac', '1',
            '-i', '/tmp/test-audio.raw',
            '-c:a', 'libopus',
            '-b:a', '24k',
            '-application', 'voip',
            '-frame_duration', '20',
            '-packet_loss', '0',
            '-vbr', 'off',
            '-f', 'ogg',
            '-y',
            '/tmp/test-audio.ogg'
        ]);
        
        convert.on('close', (code) => {
            if (code === 0) {
                console.log('✓ Converted to OGG Opus');
                resolve();
            } else {
                reject(new Error(`Conversion failed with code ${code}`));
            }
        });
        
        convert.on('error', reject);
    });
}

// Test with the real audio
async function testWithRealAudio() {
    console.log('\n📡 Connecting to Unmute...');
    
    const ws = new WebSocket('ws://localhost:8765/v1/realtime', ['realtime']);
    let gotResponse = false;
    
    return new Promise((resolve) => {
        ws.on('open', async () => {
            console.log('✓ Connected to Unmute');
            
            // Configure session
            ws.send(JSON.stringify({
                type: 'session.update',
                session: {
                    voice: 'nova',
                    allow_recording: false,
                    instructions: {
                        type: 'constant',
                        text: 'You are a helpful assistant. Please respond to what you hear.'
                    }
                }
            }));
            
            // Read the OGG file and send it in chunks
            const oggData = fs.readFileSync('/tmp/test-audio.ogg');
            console.log(`📤 Sending ${oggData.length} bytes of OGG Opus audio...`);
            
            // Send the entire file as base64
            const chunk = oggData.toString('base64');
            ws.send(JSON.stringify({
                type: 'input_audio_buffer.append',
                audio: chunk
            }));
            
            console.log('⏳ Waiting for response...');
        });
        
        ws.on('message', (data) => {
            const msg = JSON.parse(data);
            console.log(`📨 Received: ${msg.type}`);
            
            if (msg.type === 'response.audio.delta') {
                gotResponse = true;
                console.log('✅ GOT AUDIO RESPONSE FROM UNMUTE!');
                console.log(`   Audio data length: ${msg.delta?.length || 0}`);
            }
        });
        
        ws.on('error', (err) => {
            console.error('❌ WebSocket error:', err.message);
        });
        
        // Wait 10 seconds for response
        setTimeout(() => {
            ws.close();
            if (!gotResponse) {
                console.log('\n❌ No audio response received');
            }
            resolve(gotResponse);
        }, 10000);
    });
}

// Test Nod.ie with monitoring
async function testNodieWithMonitoring() {
    console.log('\n🚀 Starting Nod.ie and monitoring output...');
    
    return new Promise((resolve) => {
        const nodie = spawn('npx', ['electron', '.', '--no-sandbox'], {
            cwd: __dirname,
            stdio: 'pipe'
        });
        
        let output = '';
        let gotResponse = false;
        
        nodie.stdout.on('data', (data) => {
            const text = data.toString();
            output += text;
            process.stdout.write(text);
            
            if (text.includes('response.audio.delta')) {
                gotResponse = true;
                console.log('\n✅ NOD.IE RECEIVED AUDIO RESPONSE!');
            }
        });
        
        nodie.stderr.on('data', (data) => {
            const text = data.toString();
            output += text;
            process.stderr.write(text);
        });
        
        // Kill after 20 seconds
        setTimeout(() => {
            nodie.kill();
            resolve(gotResponse);
        }, 20000);
    });
}

// Main test flow
async function runTest() {
    try {
        // First test: Direct connection with real audio
        await recordAudio();
        await convertToOpus();
        const directTest = await testWithRealAudio();
        
        // Second test: Nod.ie integration
        const nodieTest = await testNodieWithMonitoring();
        
        // Results
        console.log('\n╔════════════════════════════════════════╗');
        console.log('║              TEST RESULTS              ║');
        console.log('╚════════════════════════════════════════╝\n');
        
        if (directTest && nodieTest) {
            console.log('✅ FULL SUCCESS!');
            console.log('Both direct Unmute connection and Nod.ie integration work!');
        } else if (directTest && !nodieTest) {
            console.log('⚠️  PARTIAL SUCCESS');
            console.log('Direct Unmute connection works ✅');
            console.log('Nod.ie integration needs fixing ❌');
        } else {
            console.log('❌ FAILURE');
            console.log('Neither test succeeded. Check audio recording and Unmute.');
        }
        
    } catch (error) {
        console.error('Test error:', error);
    }
}

// Check if we have required tools
async function checkDependencies() {
    const tools = ['arecord', 'ffmpeg'];
    for (const tool of tools) {
        try {
            await new Promise((resolve, reject) => {
                spawn('which', [tool]).on('close', code => 
                    code === 0 ? resolve() : reject()
                );
            });
        } catch {
            console.error(`❌ Missing required tool: ${tool}`);
            console.log(`Please install: sudo apt-get install ${tool === 'arecord' ? 'alsa-utils' : tool}`);
            process.exit(1);
        }
    }
}

// Run the test
checkDependencies().then(runTest);