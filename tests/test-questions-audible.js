#!/usr/bin/env node

/**
 * Test Unmute with audible questions and responses
 * This version plays both questions and responses through speakers
 */

const { spawn } = require('child_process');
const WebSocket = require('ws');
const fs = require('fs');

console.log('╔════════════════════════════════════════╗');
console.log('║  AUDIBLE TEST - YOU WILL HEAR AUDIO!   ║');
console.log('╚════════════════════════════════════════╝\n');

const questions = [
    "Hello Nod.ie, can you hear me?",
    "What is the date today?",
    "What is the weather like?",
    "What is your name?",
    "Can you count to five?",
    "What is two plus two?"
];

let currentQuestion = 0;
let ws;
let audioChunks = [];

// Play audio through speakers using paplay or aplay
async function playAudio(audioData, format = 'opus') {
    return new Promise((resolve) => {
        let player;
        
        if (format === 'opus') {
            // First decode Opus to PCM
            console.log('🔊 Playing Unmute response...');
            
            // Save to temp file
            fs.writeFileSync('/tmp/response.opus', audioData);
            
            // Decode and play
            const decode = spawn('ffmpeg', [
                '-i', '/tmp/response.opus',
                '-f', 's16le',
                '-ar', '48000',
                '-ac', '1',
                '-'
            ]);
            
            player = spawn('aplay', [
                '-f', 'S16_LE',
                '-r', '48000',
                '-c', '1'
            ]);
            
            decode.stdout.pipe(player.stdin);
            
            player.on('close', () => {
                console.log('✓ Finished playing response\n');
                resolve();
            });
            
        } else {
            // Play WAV directly
            player = spawn('aplay', [audioData]);
            player.on('close', resolve);
        }
    });
}

// Speak question audibly
async function speakQuestion(text) {
    console.log(`\n🗣️  Speaking: "${text}"`);
    
    return new Promise((resolve) => {
        const espeak = spawn('espeak', [
            '-a', '200',
            '-s', '140',
            '-p', '50',
            text
        ]);
        
        espeak.on('close', () => {
            setTimeout(resolve, 500);
        });
    });
}

// Convert text to audio and also get the data
async function textToAudioData(text) {
    return new Promise((resolve, reject) => {
        const wavFile = '/tmp/question.wav';
        
        const espeak = spawn('espeak', [
            '-w', wavFile,
            '-a', '200',
            '-s', '140',
            '-p', '50',
            text
        ]);
        
        espeak.on('close', (code) => {
            if (code === 0) {
                // Read the WAV file
                const wavData = fs.readFileSync(wavFile);
                
                // Convert to raw PCM for Unmute
                const ffmpeg = spawn('ffmpeg', [
                    '-i', wavFile,
                    '-f', 's16le',
                    '-ar', '16000',
                    '-ac', '1',
                    '-',
                    '-y'
                ]);
                
                let pcmData = Buffer.alloc(0);
                
                ffmpeg.stdout.on('data', (chunk) => {
                    pcmData = Buffer.concat([pcmData, chunk]);
                });
                
                ffmpeg.on('close', () => {
                    resolve(pcmData);
                });
                
                ffmpeg.on('error', reject);
            } else {
                reject(new Error('espeak failed'));
            }
        });
    });
}

// Test with audible feedback
async function testWithAudio() {
    console.log('📡 Connecting to Unmute...');
    
    ws = new WebSocket('ws://localhost:8765/v1/realtime', ['realtime']);
    
    ws.on('open', () => {
        console.log('✓ Connected to Unmute\n');
        
        ws.send(JSON.stringify({
            type: 'session.update',
            session: {
                voice: 'nova',
                allow_recording: false,
                instructions: {
                    type: 'constant',
                    text: 'You are Nod.ie, a friendly AI assistant. Please answer questions briefly and clearly. Keep responses under 50 words.'
                }
            }
        }));
        
        setTimeout(() => askNextQuestion(), 2000);
    });
    
    ws.on('message', async (data) => {
        const msg = JSON.parse(data);
        
        if (msg.type === 'response.text.delta' && msg.delta) {
            process.stdout.write(msg.delta);
        }
        
        if (msg.type === 'response.audio.delta' && msg.delta) {
            // Accumulate audio chunks
            const audioBytes = Buffer.from(msg.delta, 'base64');
            audioChunks.push(audioBytes);
        }
        
        if (msg.type === 'response.done') {
            console.log('\n');
            
            // Play accumulated audio
            if (audioChunks.length > 0) {
                const fullAudio = Buffer.concat(audioChunks);
                audioChunks = [];
                
                await playAudio(fullAudio, 'opus');
            }
            
            // Ask next question
            setTimeout(() => askNextQuestion(), 1000);
        }
    });
    
    ws.on('error', (err) => {
        console.error('WebSocket error:', err);
    });
    
    ws.on('close', () => {
        console.log('\nTest completed!');
    });
}

async function askNextQuestion() {
    if (currentQuestion >= questions.length) {
        console.log('\n✅ All questions asked!');
        console.log('\n🎯 Summary:');
        console.log('- You heard the questions being spoken');
        console.log('- Unmute received and processed the audio');
        console.log('- You heard Unmute\'s responses');
        
        ws.close();
        process.exit(0);
    }
    
    const question = questions[currentQuestion];
    currentQuestion++;
    
    try {
        // Speak the question out loud
        await speakQuestion(question);
        
        // Get audio data
        console.log('📤 Sending audio to Unmute...');
        const audioData = await textToAudioData(question);
        
        // Send as base64
        const base64Audio = audioData.toString('base64');
        
        // Send in chunks
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

// Check dependencies
async function checkDependencies() {
    const tools = ['espeak', 'ffmpeg', 'aplay'];
    
    for (const tool of tools) {
        try {
            await new Promise((resolve, reject) => {
                spawn('which', [tool]).on('close', code => 
                    code === 0 ? resolve() : reject()
                );
            });
        } catch {
            console.error(`❌ Missing ${tool}. Install with:`);
            console.error(`   sudo apt-get install ${tool === 'aplay' ? 'alsa-utils' : tool}`);
            process.exit(1);
        }
    }
}

// Main
async function runTest() {
    console.log('🔊 This test will play audio through your speakers!');
    console.log('📢 Make sure your volume is at a comfortable level.\n');
    
    await checkDependencies();
    await testWithAudio();
}

runTest().catch(console.error);