#!/usr/bin/env node

/**
 * Test Nod.ie conversation flow
 */

const { spawn } = require('child_process');

console.log('╔════════════════════════════════════════╗');
console.log('║    CONVERSATION TEST FOR NOD.IE        ║');
console.log('╚════════════════════════════════════════╝\n');

async function testConversation() {
    console.log('🚀 Starting Nod.ie with detailed logging...\n');
    
    const nodie = spawn('npx', ['electron', '.', '--no-sandbox'], {
        cwd: require('path').join(__dirname, '..'),
        stdio: 'pipe'
    });
    
    let lastLogTime = Date.now();
    const logWithTime = (msg) => {
        const now = Date.now();
        const delta = now - lastLogTime;
        console.log(`[+${delta}ms] ${msg}`);
        lastLogTime = now;
    };
    
    // Track conversation state
    let state = {
        connected: false,
        recording: false,
        sendingAudio: false,
        receivingResponse: false,
        playingAudio: false,
        errors: []
    };
    
    nodie.stdout.on('data', (data) => {
        const lines = data.toString().split('\n').filter(l => l.trim());
        
        lines.forEach(line => {
            // Always show these important messages
            if (line.includes('Connected to Unmute')) {
                state.connected = true;
                logWithTime('✅ Connected to Unmute');
            }
            
            if (line.includes('Opus recorder started')) {
                state.recording = true;
                logWithTime('🎤 Recording started');
            }
            
            if (line.includes('Mic Data chunk')) {
                state.sendingAudio = true;
                if (line.includes('OggS')) {
                    logWithTime('📤 Sending audio (valid OGG format)');
                }
            }
            
            if (line.includes('response.audio.delta')) {
                state.receivingResponse = true;
                logWithTime('📥 Receiving audio response');
            }
            
            if (line.includes('Audio data length:')) {
                const match = line.match(/length: (\d+)/);
                if (match) {
                    logWithTime(`🔊 Audio chunk: ${match[1]} bytes`);
                }
            }
            
            if (line.includes('Playing audio')) {
                state.playingAudio = true;
                logWithTime('🔊 Playing audio response');
            }
            
            if (line.includes('Error') || line.includes('error')) {
                state.errors.push(line);
                logWithTime(`❌ ERROR: ${line}`);
            }
            
            // Show WebSocket messages
            if (line.includes('Received message:')) {
                logWithTime(`📨 ${line}`);
            }
            
            // Show any decoder/playback issues
            if (line.includes('decoder') || line.includes('worklet')) {
                logWithTime(`🔧 ${line}`);
            }
        });
    });
    
    nodie.stderr.on('data', (data) => {
        const text = data.toString();
        if (!text.includes('Passthrough is not supported') && 
            !text.includes('MESA-LOADER')) {
            logWithTime(`⚠️  STDERR: ${text.trim()}`);
        }
    });
    
    // After 30 seconds, analyze the conversation
    setTimeout(() => {
        nodie.kill();
        
        console.log('\n╔════════════════════════════════════════╗');
        console.log('║           CONVERSATION ANALYSIS        ║');
        console.log('╚════════════════════════════════════════╝\n');
        
        console.log('Connection:', state.connected ? '✅ Success' : '❌ Failed');
        console.log('Recording:', state.recording ? '✅ Started' : '❌ Not started');
        console.log('Sending audio:', state.sendingAudio ? '✅ Yes' : '❌ No');
        console.log('Receiving response:', state.receivingResponse ? '✅ Yes' : '❌ No');
        console.log('Playing audio:', state.playingAudio ? '✅ Yes' : '❌ No');
        
        if (state.errors.length > 0) {
            console.log('\nErrors found:');
            state.errors.forEach(err => console.log('  -', err));
        }
        
        console.log('\nPossible issues:');
        if (!state.recording) {
            console.log('- Microphone not initialized or permissions denied');
        }
        if (state.recording && !state.sendingAudio) {
            console.log('- Audio capture not producing data');
        }
        if (state.sendingAudio && !state.receivingResponse) {
            console.log('- Unmute not responding to audio input');
            console.log('- Check if audio is too quiet or not detected as speech');
        }
        if (state.receivingResponse && !state.playingAudio) {
            console.log('- Audio playback not working');
            console.log('- Check decoder and AudioWorklet initialization');
        }
        
        process.exit(0);
    }, 30000);
}

testConversation().catch(console.error);