/**
 * Audio playback handler using Unmute's decoder worker
 * Handles Opus audio decoding and playback
 */

class AudioPlayback {
    constructor() {
        this.audioContext = null;
        this.outputWorklet = null;
        this.decoder = null;
        this.isInitialized = false;
        this.isPlaying = false;
        this.analyser = null;
    }

    async initialize() {
        if (this.isInitialized) return;

        try {
            // Create audio context
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();

            // Load and create the output worklet
            await this.audioContext.audioWorklet.addModule('audio-output-processor.js');
            this.outputWorklet = new AudioWorkletNode(this.audioContext, 'audio-output-processor');
            
            // Connect to speakers
            this.outputWorklet.connect(this.audioContext.destination);
            
            // Create analyser for visualization
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 2048;
            this.outputWorklet.connect(this.analyser);

            // Initialize decoder worker
            this.decoder = new Worker('decoderWorker.min.js');
            
            // Setup decoder message handler (matching Unmute's implementation)
            this.decoder.onmessage = (event) => {
                if (!event.data) {
                    console.warn('⚠️ Decoder message with no data');
                    return;
                }
                
                // Unmute expects event.data to be an array and uses the first element
                const frame = event.data[0];
                
                if (frame && frame.length > 0) {
                    console.debug('🔊 Decoded audio frame:', frame.length, 'samples');
                    
                    // Send decoded audio to worklet (matching Unmute's format)
                    this.outputWorklet.port.postMessage({
                        frame: frame,
                        type: 'audio',
                        micDuration: 0  // TODO: Track actual mic duration if needed
                    });
                } else if (event.data.error) {
                    console.error('❌ Decoder error:', event.data.error);
                } else {
                    console.warn('⚠️ Decoder returned empty frame or unexpected format:', event.data);
                }
            };

            // Initialize decoder with proper parameters
            const bufferLength = Math.round((960 * this.audioContext.sampleRate) / 24000);
            console.info('🎧 Initializing decoder:', {
                bufferLength,
                decoderSampleRate: 24000,
                outputBufferSampleRate: this.audioContext.sampleRate,
                resampleQuality: 0
            });
            
            this.decoder.postMessage({
                command: 'init',
                bufferLength: bufferLength,
                decoderSampleRate: 24000,
                outputBufferSampleRate: this.audioContext.sampleRate,
                resampleQuality: 0
            });

            this.isInitialized = true;
            console.info('Audio playback initialized');
        } catch (error) {
            console.error('Failed to initialize audio playback:', error);
            throw error;
        }
    }

    async processAudioDelta(opusBytes) {
        if (!this.isInitialized) {
            await this.initialize();
        }

        try {
            console.debug('📥 Processing audio delta:', {
                length: opusBytes.length,
                type: opusBytes.constructor.name,
                first10Bytes: Array.from(opusBytes.slice(0, 10))
            });
            
            // Resume audio context if suspended
            if (this.audioContext.state === 'suspended') {
                console.info('▶️ Resuming audio context');
                await this.audioContext.resume();
            }

            // Log audio context state
            console.debug('🔊 Audio context state:', {
                state: this.audioContext.state,
                sampleRate: this.audioContext.sampleRate,
                currentTime: this.audioContext.currentTime,
                destination: this.audioContext.destination
            });

            // Send Opus data to decoder
            console.debug('🎵 Sending to decoder...');
            this.decoder.postMessage({
                command: 'decode',
                pages: opusBytes
            }, [opusBytes.buffer]);

            this.isPlaying = true;
        } catch (error) {
            console.error('❌ Error processing audio delta:', error);
            console.error('Stack:', error.stack);
        }
    }

    getAnalyser() {
        return this.analyser;
    }

    stop() {
        this.isPlaying = false;
        if (this.outputWorklet) {
            this.outputWorklet.port.postMessage({ command: 'clear' });
        }
    }

    async cleanup() {
        this.stop();
        
        if (this.decoder) {
            this.decoder.terminate();
            this.decoder = null;
        }
        
        if (this.audioContext) {
            await this.audioContext.close();
            this.audioContext = null;
        }
        
        this.outputWorklet = null;
        this.analyser = null;
        this.isInitialized = false;
    }
}

module.exports = AudioPlayback;