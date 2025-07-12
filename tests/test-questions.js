#!/usr/bin/env node

/**
 * Test Unmute with specific questions using text-to-speech
 */

const { spawn } = require('child_process');
const WebSocket = require('ws');

console.log('╔════════════════════════════════════════╗');
console.log('║    TESTING UNMUTE WITH QUESTIONS       ║');
console.log('╚════════════════════════════════════════╝\n');

const questions = [
    "What is the date today?",
    "What is the weather like?",
    "What is your name?",
    "Can you count to five?",
    "What is two plus two?"
];

let currentQuestion = 0;
let ws;

// Generate speech for a question
async function speakQuestion(text) {
    console.log(`\n🗣️  Speaking: "${text}"`);
    
    return new Promise((resolve) => {
        const espeak = spawn('espeak', [
            '-a', '200',     // Amplitude (volume)
            '-s', '140',     // Speed
            '-p', '50',      // Pitch
            text
        ]);
        
        espeak.on('close', () => {
            setTimeout(resolve, 1000); // Wait a bit after speaking
        });
    });
}

// Convert text to audio data that can be sent to Unmute
async function textToAudioData(text) {
    return new Promise((resolve, reject) => {
        // Use espeak to generate WAV data
        const espeak = spawn('espeak', [
            '-w', '/tmp/question.wav',
            '-a', '200',
            '-s', '140',
            '-p', '50',
            text
        ]);
        
        espeak.on('close', (code) => {
            if (code === 0) {
                // Convert WAV to raw PCM
                const ffmpeg = spawn('ffmpeg', [
                    '-i', '/tmp/question.wav',
                    '-f', 's16le',
                    '-ar', '16000',
                    '-ac', '1',
                    '-',
                    '-y'
                ]);
                
                let audioData = Buffer.alloc(0);
                
                ffmpeg.stdout.on('data', (chunk) => {
                    audioData = Buffer.concat([audioData, chunk]);
                });
                
                ffmpeg.on('close', () => {
                    resolve(audioData);
                });
                
                ffmpeg.on('error', reject);
            } else {
                reject(new Error('espeak failed'));
            }
        });
    });
}

// Test direct connection to Unmute
async function testUnmuteWithQuestions() {
    console.log('📡 Connecting to Unmute...');
    
    ws = new WebSocket('ws://localhost:8765/v1/realtime', ['realtime']);
    
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
                    text: 'You are a helpful AI assistant. Please answer questions briefly and clearly.'
                }
            }
        }));
        
        // Start asking questions
        setTimeout(() => askNextQuestion(), 2000);
    });
    
    ws.on('message', (data) => {
        const msg = JSON.parse(data);
        
        if (msg.type === 'response.text.delta' && msg.delta) {
            process.stdout.write(msg.delta);
        }
        
        if (msg.type === 'response.done') {
            console.log('\n');
            // Ask next question after response
            setTimeout(() => askNextQuestion(), 2000);
        }
        
        if (msg.type === 'response.audio.delta') {
            console.log(`🔊 Audio response received (${msg.delta?.length || 0} bytes)`);
        }
    });
    
    ws.on('error', (err) => {
        console.error('WebSocket error:', err);
    });
    
    ws.on('close', () => {
        console.log('\nConnection closed');
    });
}

async function askNextQuestion() {
    if (currentQuestion >= questions.length) {
        console.log('\n✅ All questions asked!');
        ws.close();
        process.exit(0);
    }
    
    const question = questions[currentQuestion];
    currentQuestion++;
    
    try {
        // Play the question out loud
        await speakQuestion(question);
        
        // Get audio data and send to Unmute
        console.log('📤 Sending audio to Unmute...');
        const audioData = await textToAudioData(question);
        
        // Send as base64
        const base64Audio = audioData.toString('base64');
        
        // Send in chunks like real speech
        const chunkSize = 8192;
        for (let i = 0; i < base64Audio.length; i += chunkSize) {
            ws.send(JSON.stringify({
                type: 'input_audio_buffer.append',
                audio: base64Audio.slice(i, i + chunkSize)
            }));
        }
        
        console.log('⏳ Waiting for response...\n');
        console.log('🤖 Unmute: ', '');
        
    } catch (error) {
        console.error('Error:', error);
        askNextQuestion();
    }
}

// Test with Nod.ie running
async function testNodieWithQuestions() {
    console.log('\n\n📱 Now testing with Nod.ie...\n');
    
    const nodie = spawn('npx', ['electron', '.', '--no-sandbox'], {
        cwd: require('path').join(__dirname, '..'),
        stdio: 'pipe'
    });
    
    let connected = false;
    
    nodie.stdout.on('data', (data) => {
        const text = data.toString();
        
        if (text.includes('Connected to Unmute') && !connected) {
            connected = true;
            console.log('✓ Nod.ie connected!\n');
            
            // Start asking questions
            setTimeout(async () => {
                for (const question of questions) {
                    await speakQuestion(question);
                    await new Promise(resolve => setTimeout(resolve, 5000)); // Wait for response
                }
                
                console.log('\n✅ Test completed!');
                nodie.kill();
                process.exit(0);
            }, 3000);
        }
        
        if (text.includes('response.text.delta')) {
            console.log('📝 Nod.ie got text response');
        }
        
        if (text.includes('response.audio.delta')) {
            console.log('🔊 Nod.ie got audio response');
        }
    });
    
    nodie.stderr.on('data', (data) => {
        if (!data.toString().includes('Passthrough')) {
            console.error('Error:', data.toString());
        }
    });
    
    // Timeout
    setTimeout(() => {
        console.log('\n⏱️ Test timeout');
        nodie.kill();
        process.exit(1);
    }, 60000);
}

// Main test flow
async function runTest() {
    // Check dependencies
    try {
        await new Promise((resolve, reject) => {
            spawn('which', ['espeak']).on('close', code => 
                code === 0 ? resolve() : reject()
            );
        });
        
        await new Promise((resolve, reject) => {
            spawn('which', ['ffmpeg']).on('close', code => 
                code === 0 ? resolve() : reject()
            );
        });
    } catch {
        console.error('❌ Missing dependencies. Install with:');
        console.error('   sudo apt-get install espeak ffmpeg');
        process.exit(1);
    }
    
    // First test Unmute directly
    await testUnmuteWithQuestions();
    
    // Then test with Nod.ie
    await testNodieWithQuestions();
}

runTest().catch(console.error);