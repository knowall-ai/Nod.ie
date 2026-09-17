/**
 * Audio playback implementation matching unmute-frontend exactly
 * Based on unmute-frontend/src/app/useAudioProcessor.ts
 */

class AudioPlaybackUnmute {
    constructor() {
        this.audioContext = null;
        this.outputWorklet = null;
        this.decoder = null;
        this.isInitialized = false;
        this.analyser = null;
        this.bufferLength = 0;
    }

    async initialize() {
        if (this.isInitialized) return;

        try {
            console.log('🎵 Initializing unmute-frontend audio playback...');
            
            // Create audio context (matching unmute-frontend)
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();

            // Calculate buffer length (matching unmute-frontend)
            this.bufferLength = Math.round((960 * this.audioContext.sampleRate) / 24000);

            // Load audio worklet (matching unmute-frontend)
            await this.audioContext.audioWorklet.addModule('audio-output-processor.js');
            this.outputWorklet = new AudioWorkletNode(this.audioContext, 'audio-output-processor');

            // Connect to destination (matching unmute-frontend)
            this.outputWorklet.connect(this.audioContext.destination);

            // Create analyser for visualization (matching unmute-frontend)
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 2048;
            this.outputWorklet.connect(this.analyser);

            // Initialize decoder worker (matching unmute-frontend)
            const workerPath = window.location.pathname.includes('/tests/') 
                ? '../decoderWorker.min.js' 
                : 'decoderWorker.min.js';
            
            this.decoder = new Worker(workerPath);

            // Setup decoder message handler (matching unmute-frontend)
            this.decoder.onmessage = (event) => {
                if (!event.data) return;

                const frame = event.data[0];
                if (frame && frame.length > 0) {
                    console.debug('🔊 Sending decoded audio to worklet');
                    this.outputWorklet.port.postMessage({
                        frame: frame,
                        type: 'audio',
                        micDuration: 0
                    });
                }
            };

            // Initialize decoder (matching unmute-frontend exactly)
            this.decoder.postMessage({
                command: 'init',
                bufferLength: this.bufferLength,
                decoderSampleRate: 24000,
                outputBufferSampleRate: this.audioContext.sampleRate,
                resampleQuality: 0
            });

            this.isInitialized = true;
            console.log('✅ Unmute-frontend audio playback initialized');

        } catch (error) {
            console.error('❌ Failed to initialize unmute-frontend audio playback:', error);
            throw error;
        }
    }

    async processAudioDelta(opusBytes) {
        if (!this.isInitialized) {
            await this.initialize();
        }

        try {
            // Resume audio context if suspended (matching unmute-frontend)
            if (this.audioContext.state === 'suspended') {
                console.info('🔊 Resuming audio context');
                await this.audioContext.resume();
            }

            // Send Opus data to decoder (matching unmute-frontend)
            console.debug('🎵 Sending to decoder...');
            this.decoder.postMessage({
                command: 'decode',
                pages: opusBytes
            }, [opusBytes.buffer]);

        } catch (error) {
            console.error('❌ Error processing audio delta:', error);
        }
    }

    getAnalyser() {
        return this.analyser;
    }

    async stop() {
        console.log('🛑 Stopping unmute-frontend audio playback...');
        
        if (this.outputWorklet) {
            this.outputWorklet.port.postMessage({ type: 'reset' });
            this.outputWorklet.disconnect();
            this.outputWorklet = null;
        }
        
        if (this.decoder) {
            this.decoder.terminate();
            this.decoder = null;
        }
        
        if (this.audioContext && this.audioContext.state !== 'closed') {
            await this.audioContext.close();
            this.audioContext = null;
        }
        
        this.isInitialized = false;
        this.analyser = null;
        
        console.log('✅ Unmute-frontend audio playback stopped');
    }
}

// Export for browser
if (typeof window !== 'undefined') {
    window.AudioPlaybackUnmute = AudioPlaybackUnmute;
}