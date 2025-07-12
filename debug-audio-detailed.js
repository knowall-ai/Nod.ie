#!/usr/bin/env node

/**
 * Detailed Audio Debug Script for Nod.ie
 * Captures console output and monitors audio processing
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('🔍 Starting Nod.ie with detailed audio debugging...\n');
console.log('━'.repeat(60));
console.log('📋 DEBUG CHECKLIST:');
console.log('━'.repeat(60));
console.log();
console.log('1. ✋ RIGHT-CLICK on Nod.ie window → "Developer Tools"');
console.log('2. 📊 Go to the CONSOLE tab');
console.log('3. 🎤 Click the purple circle to unmute (if needed)');
console.log('4. 🗣️ Say: "Hello, can you hear me?"');
console.log('5. 👀 Watch for these messages in console:');
console.log();
console.log('   Expected Audio Flow:');
console.log('   ├─ "🎙️ Starting audio capture..."');
console.log('   ├─ "📤 Sending audio chunk"');
console.log('   ├─ "📥 Processing audio delta"'); 
console.log('   ├─ "🔊 Decoded audio frame: X samples"');
console.log('   └─ "🔈 Playing audio chunk"');
console.log();
console.log('   Common Issues:');
console.log('   ├─ ❌ "Decoder message with no data"');
console.log('   ├─ ❌ "Audio context suspended"');
console.log('   ├─ ❌ "Failed to decode audio"');
console.log('   └─ ❌ "WebSocket disconnected"');
console.log();
console.log('━'.repeat(60));
console.log();

// Create a log file for this session
const logFile = path.join(__dirname, `nodie-debug-${Date.now()}.log`);
const logStream = fs.createWriteStream(logFile, { flags: 'a' });

console.log(`📝 Logging to: ${logFile}\n`);

// Start Nod.ie with environment variables for debugging
const nodie = spawn('npx', ['electron', '.'], {
    cwd: __dirname,
    env: {
        ...process.env,
        ELECTRON_ENABLE_LOGGING: '1',
        NODE_ENV: 'development',
        DEBUG: '*'
    }
});

// Capture stdout
nodie.stdout.on('data', (data) => {
    const text = data.toString();
    logStream.write(`[STDOUT] ${text}`);
    
    // Highlight important messages
    if (text.includes('audio') || text.includes('Audio') || 
        text.includes('decoded') || text.includes('WebSocket')) {
        process.stdout.write(`📢 ${text}`);
    }
});

// Capture stderr
nodie.stderr.on('data', (data) => {
    const text = data.toString();
    logStream.write(`[STDERR] ${text}`);
    
    // Show errors
    if (text.includes('ERROR') || text.includes('Error')) {
        process.stdout.write(`❌ ${text}`);
    }
});

// Monitor backend in parallel
console.log('🔌 Monitoring Unmute backend...\n');
const backendMonitor = spawn('bash', ['-c', `
    docker logs -f unmute-backend 2>&1 | while IFS= read -r line; do
        if echo "$line" | grep -q "response.audio.delta\\|WebSocket\\|error\\|ERROR"; then
            echo "🔙 Backend: $line"
        fi
    done
`]);

backendMonitor.stdout.on('data', (data) => {
    process.stdout.write(data);
    logStream.write(`[BACKEND] ${data}`);
});

// Quick test script content
const testInstructions = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🧪 QUICK TEST COMMANDS FOR DEVELOPER CONSOLE:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Copy and paste these into the Developer Console:

1. Check Audio Context State:
   console.log('Audio Context State:', window.audioContext?.state);
   if (window.audioContext?.state === 'suspended') {
       window.audioContext.resume().then(() => console.log('✅ Audio Context Resumed'));
   }

2. Check WebSocket Connection:
   console.log('WebSocket State:', window.ws?.readyState === 1 ? '✅ Connected' : '❌ Disconnected');

3. Check Audio Playback Module:
   console.log('Audio Module:', window.audioPlayback ? '✅ Loaded' : '❌ Not Loaded');
   console.log('Output Worklet:', window.audioPlayback?.outputWorklet ? '✅ Ready' : '❌ Not Ready');

4. Test Audio Playback Directly:
   // Create a test tone
   if (window.audioContext) {
       const osc = window.audioContext.createOscillator();
       osc.connect(window.audioContext.destination);
       osc.frequency.value = 440;
       osc.start();
       setTimeout(() => { osc.stop(); console.log('✅ Test tone played'); }, 500);
   }

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;

console.log(testInstructions);

// Cleanup on exit
nodie.on('close', (code) => {
    console.log(`\n✋ Nod.ie exited with code ${code}`);
    logStream.end();
    backendMonitor.kill();
    process.exit(code);
});

process.on('SIGINT', () => {
    console.log('\n✋ Stopping debug session...');
    nodie.kill();
    backendMonitor.kill();
    logStream.end();
    process.exit(0);
});

// After 2 seconds, remind user about Developer Tools
setTimeout(() => {
    console.log('\n⏰ REMINDER: Open Developer Tools now!');
    console.log('   Right-click on Nod.ie → Developer Tools → Console tab\n');
}, 2000);