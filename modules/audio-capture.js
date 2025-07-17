/**
 * Audio capture using opus-recorder - matching Unmute's exact configuration
 */

const Recorder = require('opus-recorder');

class AudioCapture {
    constructor(onAudioData) {
        this.recorder = null;
        this.onAudioData = onAudioData;
        this.isCapturing = false;
        this.isPaused = false;
        this.stream = null;
        this.audioContext = null;
        this.analyser = null;
        this.source = null;
        this.gainNode = null;
        this.originalGain = 1.0;
    }

    async start() {
        if (this.isCapturing) return;
        
        try {
            console.info('🎤 Starting audio capture...');
            
            // First get the media stream - matching Unmute's constraints exactly
            this.stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: true,
                    noiseSuppression: false,
                    autoGainControl: true,
                    channelCount: 1
                },
                video: false
            });
            
            // Create audio context for visualization
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.source = this.audioContext.createMediaStreamSource(this.stream);
            
            // Create gain node for ducking
            this.gainNode = this.audioContext.createGain();
            this.gainNode.gain.value = this.originalGain;
            
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 2048;
            
            // Connect: source -> gainNode -> analyser
            this.source.connect(this.gainNode);
            this.gainNode.connect(this.analyser);
            
            // Match Unmute's recorder options exactly
            const recorderOptions = {
                mediaTrackConstraints: {
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: false,
                        autoGainControl: true,
                        channelCount: 1
                    },
                    video: false
                },
                encoderPath: 'encoderWorker.min.js',
                bufferLength: Math.round((960 * this.audioContext.sampleRate) / 24000),
                encoderFrameSize: 20,
                encoderSampleRate: 24000,
                maxFramesPerPage: 2,
                numberOfChannels: 1,
                recordingGain: 1,
                resampleQuality: 3,
                encoderComplexity: 0,
                encoderApplication: 2049,
                streamPages: true
            };
            
            let chunk_idx = 0;
            let lastpos = 0;
            this.recorder = new Recorder(recorderOptions);
            
            this.recorder.ondataavailable = (data) => {
                // Skip processing if paused
                if (this.isPaused) {
                    console.debug('⏸️ Skipping audio data while paused');
                    return;
                }
                
                // Log like Unmute does
                if (chunk_idx < 3) {
                    console.debug(
                        Date.now() % 1000,
                        "Mic Data chunk",
                        chunk_idx++,
                        "size:",
                        data.length
                    );
                    
                    // Debug the format
                    console.debug('First 4 bytes:', Array.from(data.slice(0, 4)));
                    console.debug('As string:', String.fromCharCode(...data.slice(0, 4)));
                }
                
                if (this.onAudioData) {
                    // Skip empty or too-short data to prevent backend crashes
                    // Backend expects at least 6 bytes to check opus_bytes[5]
                    if (data.length < 6) {
                        console.debug('⚠️ Skipping too-short audio data, length:', data.length);
                        return;
                    }
                    
                    // Base64 encode exactly like Unmute
                    let binary = "";
                    for (let i = 0; i < data.length; i++) {
                        binary += String.fromCharCode(data[i]);
                    }
                    const base64 = btoa(binary);
                    console.debug('📤 Calling onAudioData with base64 chunk, length:', base64.length);
                    this.onAudioData(base64);
                } else {
                    console.error('❌ No onAudioData callback set!');
                }
            };
            
            this.recorder.onerror = (error) => {
                console.error('❌ Recorder error:', error);
            };
            
            // Resume audio context and start recording
            await this.audioContext.resume();
            await this.recorder.start();
            
            this.isCapturing = true;
            console.info('✅ Opus recorder started');
            
        } catch (error) {
            console.error('❌ Failed to start audio capture:', error);
            throw error;
        }
    }

    stop() {
        if (!this.isCapturing) return;
        
        this.isCapturing = false;
        
        if (this.recorder) {
            this.recorder.stop();
            console.info('🛑 Opus recorder stopped');
        }
        
        // Keep the audio context and analyser alive for visualization
        // Just stop the recording, don't destroy everything
        console.debug('📊 Keeping audio context alive for visualization');
    }

    setGain(gain) {
        if (this.gainNode) {
            console.debug(`🎚️ Setting microphone gain to ${gain}`);
            this.gainNode.gain.value = gain;
        }
    }

    pause() {
        if (this.isCapturing && !this.isPaused) {
            console.debug('⏸️ Pausing audio capture');
            this.isPaused = true;
            // Don't stop the recorder, just flag to skip processing audio data
        }
    }

    resume() {
        if (this.isCapturing && this.isPaused) {
            console.debug('▶️ Resuming audio capture');
            this.isPaused = false;
        }
    }

    getAnalyser() {
        // Check if audio context is still valid
        if (this.audioContext && this.audioContext.state === 'closed') {
            console.error('❌ Audio context is closed!');
            return null;
        }
        return this.analyser;
    }
}

module.exports = AudioCapture;