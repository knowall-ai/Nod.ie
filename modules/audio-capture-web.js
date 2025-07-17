/**
 * Web-compatible audio capture using opus-recorder
 * This module works in both Electron and browser environments
 */

// Import opus-recorder based on environment
const getRecorder = () => {
    if (typeof window !== 'undefined' && window.Recorder) {
        return window.Recorder; // Browser global
    } else if (typeof require !== 'undefined') {
        return require('opus-recorder'); // CommonJS
    } else {
        throw new Error('opus-recorder not available');
    }
};

class AudioCaptureWeb {
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
        try {
            console.log('🎤 Starting audio capture (web-compatible)...');
            
            // Get microphone permission - match Electron version exactly
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
            
            // Create analyser for waveform
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 2048;
            this.analyser.smoothingTimeConstant = 0.8;
            
            // Connect: source -> gainNode -> analyser
            this.source.connect(this.gainNode);
            this.gainNode.connect(this.analyser);
            
            // Get Recorder class
            const Recorder = getRecorder();
            
            // Configure recorder to match Unmute's expected format
            const config = {
                encoderPath: typeof window !== 'undefined' 
                    ? '/node_modules/opus-recorder/dist/encoderWorker.min.js'
                    : require.resolve('opus-recorder/dist/encoderWorker.min.js'),
                mediaTrackConstraints: {
                    echoCancellation: true,
                    noiseSuppression: false,
                    autoGainControl: true,
                    channelCount: 1
                },
                encoderSampleRate: 24000,
                numberOfChannels: 1,
                streamPages: true,  // CRITICAL: Unmute needs OGG pages, not raw Opus
                maxFramesPerPage: 1,
                encoderFrameSize: 20,
                encoderComplexity: 10,
                resampleQuality: 10
            };
            
            // Create recorder instance
            this.recorder = new Recorder(config);
            
            // Handle audio data
            this.recorder.ondataavailable = (arrayBuffer) => {
                // Skip processing if paused
                if (this.isPaused) {
                    console.debug('⏸️ Skipping audio data while paused');
                    return;
                }
                
                if (this.onAudioData && arrayBuffer.byteLength >= 6) {
                    // Convert to base64 for WebSocket transmission
                    const uint8Array = new Uint8Array(arrayBuffer);
                    const base64 = btoa(String.fromCharCode(...uint8Array));
                    this.onAudioData(base64);
                } else if (arrayBuffer.byteLength > 0 && arrayBuffer.byteLength < 6) {
                    console.debug('⚠️ Skipping too-short audio data, length:', arrayBuffer.byteLength);
                }
            };
            
            // Start recording with the stream
            await this.recorder.start(this.stream);
            this.isCapturing = true;
            
            console.log('✅ Audio capture started successfully');
            
        } catch (error) {
            console.error('❌ Failed to start audio capture:', error);
            throw error;
        }
    }

    stop() {
        console.log('🛑 Stopping audio capture...');
        
        if (this.recorder && this.isCapturing) {
            this.recorder.stop();
            this.recorder = null;
        }
        
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
        
        if (this.source) {
            this.source.disconnect();
            this.source = null;
        }
        
        if (this.audioContext && this.audioContext.state !== 'closed') {
            this.audioContext.close();
            this.audioContext = null;
        }
        
        this.isCapturing = false;
        this.analyser = null;
        
        console.log('✅ Audio capture stopped');
    }

    setGain(gain) {
        if (this.gainNode) {
            console.debug(`🎚️ Setting microphone gain to ${gain} (web)`);
            this.gainNode.gain.value = gain;
        }
    }

    pause() {
        if (this.isCapturing && !this.isPaused) {
            console.debug('⏸️ Pausing audio capture (web)');
            this.isPaused = true;
            // Don't stop the recorder, just flag to skip processing audio data
        }
    }

    resume() {
        if (this.isCapturing && this.isPaused) {
            console.debug('▶️ Resuming audio capture (web)');
            this.isPaused = false;
        }
    }

    getAnalyser() {
        return this.analyser;
    }
}

// Export for both CommonJS and browser
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AudioCaptureWeb;
} else if (typeof window !== 'undefined') {
    window.AudioCaptureWeb = AudioCaptureWeb;
}