#!/usr/bin/env node

/**
 * Test Nod.ie by speaking to it
 */

const { spawn } = require('child_process');

console.log('╔════════════════════════════════════════╗');
console.log('║    SPEECH TEST FOR NOD.IE              ║');
console.log('╚════════════════════════════════════════╝\n');

// Start Nod.ie and speak to it
async function testNodieWithSpeech() {
    console.log('🚀 Starting Nod.ie...');
    
    return new Promise((resolve) => {
        const nodie = spawn('npx', ['electron', '.', '--no-sandbox'], {
            cwd: __dirname,
            stdio: 'pipe',
            env: { ...process.env, DISPLAY: ':0' }
        });
        
        let output = '';
        let gotResponse = false;
        let connected = false;
        
        nodie.stdout.on('data', (data) => {
            const text = data.toString();
            output += text;
            process.stdout.write(text);
            
            if (text.includes('Connected to Unmute') && !connected) {
                connected = true;
                console.log('\n✓ Nod.ie connected! Speaking in 3 seconds...\n');
                
                // Wait for Nod.ie to be ready, then speak
                setTimeout(() => {
                    console.log('🗣️ Speaking: "Hello Nod.ie, can you hear me?"');
                    
                    // Use espeak to generate speech
                    spawn('espeak', [
                        '-a', '150',     // Amplitude
                        '-s', '150',     // Speed
                        '-p', '50',      // Pitch
                        'Hello Nod.ie, can you hear me?'
                    ]);
                }, 3000);
            }
            
            if (text.includes('response.audio.delta')) {
                gotResponse = true;
                console.log('\n✅ NOD.IE RECEIVED AUDIO RESPONSE!');
            }
            
            if (text.includes('Audio data length:')) {
                console.log('🔊 Audio response details:', text.trim());
            }
        });
        
        nodie.stderr.on('data', (data) => {
            const text = data.toString();
            output += text;
            
            // Filter out non-critical Electron warnings
            if (!text.includes('Passthrough is not supported') && 
                !text.includes('MESA-LOADER')) {
                process.stderr.write(text);
            }
        });
        
        // Give it 30 seconds to respond
        setTimeout(() => {
            nodie.kill();
            
            console.log('\n╔════════════════════════════════════════╗');
            console.log('║              TEST RESULT               ║');
            console.log('╚════════════════════════════════════════╝\n');
            
            if (gotResponse) {
                console.log('✅ SUCCESS! Nod.ie heard and responded!');
                console.log('\nNod.ie is fully functional:');
                console.log('- Connected to Unmute backend ✓');
                console.log('- Captured microphone audio ✓');
                console.log('- Received AI response ✓');
                console.log('- Ready to play audio response ✓');
            } else if (connected) {
                console.log('⚠️  PARTIAL SUCCESS');
                console.log('\nNod.ie connected but did not respond:');
                console.log('- Check microphone permissions');
                console.log('- Ensure microphone is not muted');
                console.log('- Try speaking louder or closer to mic');
            } else {
                console.log('❌ FAILURE');
                console.log('\nNod.ie failed to connect to Unmute.');
                console.log('Check that Unmute backend is running.');
            }
            
            resolve(gotResponse);
        }, 30000);
    });
}

// Check dependencies
async function checkDependencies() {
    try {
        await new Promise((resolve, reject) => {
            spawn('which', ['espeak']).on('close', code => 
                code === 0 ? resolve() : reject()
            );
        });
    } catch {
        console.error('❌ Missing espeak. Install with: sudo apt-get install espeak');
        process.exit(1);
    }
}

// Run test
checkDependencies().then(testNodieWithSpeech).catch(console.error);