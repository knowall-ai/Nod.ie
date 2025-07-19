/**
 * Web-compatible audio playback using AudioWorklet and Opus decoder
 */

class AudioPlaybackWeb {
    constructor() {
        this.audioContext = null;
        this.audioWorklet = null;
        this.decoderWorker = null;
        this.isInitialized = false;
        this.audioQueue = [];
        this.isPlaying = false;
        this.activeSource = null;
        this.hasNotifiedPlaybackStart = false;
    }

    async initialize() {
        try {
            console.log('🔊 Initializing audio playback (web)...');
            
            // Create audio context
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            // Load AudioWorklet processor (like official frontend)
            const workletPath = window.location.pathname.includes('/tests/') 
                ? '../audio-output-processor.js' 
                : './audio-output-processor.js';
            
            console.info('🔊 Loading audio worklet from:', workletPath);
            await this.audioContext.audioWorklet.addModule(workletPath);
            
            // Create output worklet
            this.outputWorklet = new AudioWorkletNode(this.audioContext, 'audio-output-processor');
            this.outputWorklet.connect(this.audioContext.destination);
            
            // Initialize decoder worker - use relative path
            const workerPath = window.location.pathname.includes('/tests/') 
                ? '../decoderWorker.min.js' 
                : 'decoderWorker.min.js';
            
            console.info('🔊 Loading decoder worker from:', workerPath);
            this.decoderWorker = new Worker(workerPath);
            
            // Handle decoded audio from worker (like official frontend)
            this.decoderWorker.onmessage = (event) => {
                if (!event.data) return;
                
                const frame = event.data[0];
                if (frame) {
                    console.debug('🔊 Sending decoded audio to worklet');
                    this.outputWorklet.port.postMessage({
                        frame: frame,
                        type: 'audio',
                        micDuration: 0
                    });
                    
                    // Also send PCM audio to MuseTalk
                    if (window.NodieRenderer && window.NodieRenderer.onDecodedAudio) {
                        // frame is Float32Array of PCM audio at outputBufferSampleRate
                        window.NodieRenderer.onDecodedAudio(frame);
                    }
                }
            };
            
            // Initialize the decoder (like official frontend)
            this.decoderWorker.postMessage({
                command: 'init',
                bufferLength: Math.round((960 * this.audioContext.sampleRate) / 24000),
                decoderSampleRate: 24000,
                outputBufferSampleRate: this.audioContext.sampleRate,
                resampleQuality: 0
            });
            
            this.isInitialized = true;
            console.log('✅ Audio playback initialized with AudioWorklet');
            
        } catch (error) {
            console.error('❌ Failed to initialize audio playback:', error);
            // Fallback: try simpler approach
            await this.initializeFallback();
        }
    }

    async initializeFallback() {
        console.log('🔊 Using fallback audio playback...');
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.isInitialized = true;
    }

    async processAudioDelta(audioData) {
        if (!this.isInitialized) {
            await this.initialize();
        }

        // Resume audio context if needed
        if (this.audioContext && this.audioContext.state === 'suspended') {
            console.info('🔊 Auto-resuming audio context');
            await this.audioContext.resume();
        }

        // Notify that audio playback is starting (only once per response)
        if (!this.hasNotifiedPlaybackStart && window.NodieRenderer && window.NodieRenderer.onAudioPlaybackStart) {
            window.NodieRenderer.onAudioPlaybackStart();
            this.hasNotifiedPlaybackStart = true;
        }

        if (this.decoderWorker) {
            // Send the raw audioData (Uint8Array) to decoder, same as Electron version
            console.debug('🔊 Processing audio delta');
            // Create a copy to avoid buffer transfer issues
            const audioDataCopy = new Uint8Array(audioData);
            this.decoderWorker.postMessage({
                command: 'decode', 
                pages: audioDataCopy
            });
        } else {
            console.warn('Decoder not available, queueing audio');
            this.audioQueue.push(audioData);
        }
    }

    

    async stop() {
        console.log('🛑 Stopping audio playback...');
        
        // Reset notification flag for next response
        this.hasNotifiedPlaybackStart = false;
        
        // Notify that audio playback is stopping
        if (window.NodieRenderer && window.NodieRenderer.onAudioPlaybackStop) {
            console.debug('🔊 Notifying gain ducking stop');
            window.NodieRenderer.onAudioPlaybackStop();
        }
        
        if (this.outputWorklet) {
            this.outputWorklet.disconnect();
            this.outputWorklet = null;
        }
        
        if (this.decoderWorker) {
            this.decoderWorker.terminate();
            this.decoderWorker = null;
        }
        
        if (this.audioContext && this.audioContext.state !== 'closed') {
            await this.audioContext.close();
            this.audioContext = null;
        }
        
        this.isInitialized = false;
        this.audioQueue = [];
        
        console.log('✅ Audio playback stopped');
    }
}

// Export for browser
if (typeof window !== 'undefined') {
    window.AudioPlaybackWeb = AudioPlaybackWeb;
}