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
        this.avatarEnabled = false;
        this.currentTimestamp = 0;
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

            // Check avatar settings
            try {
                const Store = require('electron-store');
                const configStore = new Store();
                this.avatarEnabled = configStore.get('avatarEnabled', true);
                console.info('🎭 Avatar enabled:', this.avatarEnabled);
            } catch (error) {
                console.warn('Could not access store for avatar setting, using default:', error);
                this.avatarEnabled = true;
            }

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

            // Update timestamp for synchronization
            this.currentTimestamp = Date.now();
            
            // Trigger avatar video playback
            if (this.avatarEnabled && window.onAudioPlaybackStart) {
                window.onAudioPlaybackStart();
            }
            
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
        
        // Trigger avatar video stop
        if (this.avatarEnabled && window.onAudioPlaybackStop) {
            window.onAudioPlaybackStop();
        }
    }

    setupSimpleAvatarHandling() {
        if (!this.videoAvatar) return;
        
        console.info('🎬 Setting up simple avatar video handling');
        
        // Show static avatar initially
        const avatarImage = document.getElementById('avatar-image');
        const circle = document.getElementById('circle');
        
        if (avatarImage && circle) {
            avatarImage.style.display = 'block';
            circle.classList.add('avatar-active', 'avatar-static');
        }
    }

    setupAvatarHandling() {
        // Set up frame callback to update UI
        this.musetalkClient.setFrameCallback((frame) => {
            // Send frame to UI
            if (window.updateAvatarFrame) {
                window.updateAvatarFrame(frame);
            }
        });
    }

    setAvatarEnabled(enabled) {
        this.avatarEnabled = enabled;
        try {
            const Store = require('electron-store');
            const configStore = new Store();
            configStore.set('avatarEnabled', enabled);
        } catch (error) {
            console.warn('Could not save avatar setting:', error);
        }
        
        // Initialize or cleanup MuseTalk based on setting
        if (enabled && !this.musetalkClient) {
            this.musetalkClient = new MuseTalkClient();
            this.musetalkClient.initialize().then(ready => {
                if (ready) {
                    this.setupAvatarHandling();
                }
            });
        } else if (!enabled && this.musetalkClient) {
            this.musetalkClient.cleanup();
            this.musetalkClient = null;
        }
    }

    getAvatarStatus() {
        return {
            enabled: this.avatarEnabled,
            available: this.musetalkClient?.isAvailable() || false,
            fallbackToStatic: this.musetalkClient?.fallbackToStatic || true
        };
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
        
        if (this.musetalkClient) {
            this.musetalkClient.cleanup();
            this.musetalkClient = null;
        }
        
        this.outputWorklet = null;
        this.analyser = null;
        this.isInitialized = false;
    }
}

module.exports = AudioPlayback;