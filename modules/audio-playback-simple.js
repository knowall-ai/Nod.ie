/**
 * Simplified audio playback handler
 * Just handles basic Opus decoding without complex initialization
 */

class AudioPlaybackSimple {
    constructor() {
        this.audioContext = null;
        this.outputWorklet = null;
        this.decoder = null;
        this.isInitialized = false;
        this.isPlaying = false;
        this.analyser = null;
        this.avatarEnabled = true;
    }

    async initialize() {
        if (this.isInitialized) return;

        try {
            console.info('🎵 Initializing simplified audio playback...');
            
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
            
            // Setup decoder message handler
            this.decoder.onmessage = (event) => {
                if (!event.data || !event.data[0]) return;
                
                const frame = event.data[0];
                if (frame && frame.length > 0) {
                    this.outputWorklet.port.postMessage({
                        frame: frame,
                        type: 'audio',
                        micDuration: 0
                    });
                }
            };

            // Initialize decoder
            const bufferLength = Math.round((960 * this.audioContext.sampleRate) / 24000);
            this.decoder.postMessage({
                command: 'init',
                bufferLength: bufferLength,
                decoderSampleRate: 24000,
                outputBufferSampleRate: this.audioContext.sampleRate,
                resampleQuality: 0
            });

            this.isInitialized = true;
            console.info('✅ Simplified audio playback initialized');
            
        } catch (error) {
            console.error('❌ Failed to initialize simplified audio playback:', error);
            throw error;
        }
    }

    async processAudioDelta(opusBytes) {
        if (!this.isInitialized) {
            await this.initialize();
        }

        try {
            // Resume audio context if suspended
            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }

            // Trigger avatar video playback
            if (this.avatarEnabled && window.onAudioPlaybackStart) {
                window.onAudioPlaybackStart();
            }
            
            // Send Opus data to decoder
            this.decoder.postMessage({
                command: 'decode',
                pages: opusBytes
            }, [opusBytes.buffer]);

            this.isPlaying = true;
            
        } catch (error) {
            console.error('❌ Error processing audio delta:', error);
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
        
        // Trigger avatar video stop
        if (this.avatarEnabled && window.onAudioPlaybackStop) {
            window.onAudioPlaybackStop();
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

module.exports = AudioPlaybackSimple;