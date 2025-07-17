/**
 * MuseTalk client - uses Gradio API for HuggingFace container
 */

const MuseTalkGradioClient = require('./musetalk-gradio-client');
const MuseTalkSimpleClient = require('./musetalk-simple-client');

class MuseTalkClient {
    constructor() {
        this.gradioClient = null;
        this.frameCallback = null;
        this.connected = false;
        this.fallbackToStatic = true;
        this.selectedVideo = 'nodie-video-01.mp4';
    }

    async initialize() {
        try {
            // Try full Gradio client first
            console.info('🎭 Attempting to connect to MuseTalk Gradio...');
            this.gradioClient = new MuseTalkGradioClient();
            
            // Set up frame callback
            this.gradioClient.setFrameCallback((frame) => {
                if (this.frameCallback) {
                    this.frameCallback(frame);
                }
            });
            
            const initialized = await this.gradioClient.initialize();
            this.connected = initialized;
            
            if (!initialized) {
                // Check if it's due to too many connections
                if (this.gradioClient.tooManyConnections) {
                    console.warn('🎭 MuseTalk has too many connections - using static avatar');
                    this.fallbackToStatic = true;
                    this.connected = false;
                    return false;
                }
                
                console.warn('🎭 MuseTalk Gradio not available, trying simple client...');
                
                // Try simple client as fallback for other errors
                this.gradioClient = new MuseTalkSimpleClient();
                this.gradioClient.setFrameCallback((frame) => {
                    if (this.frameCallback) {
                        this.frameCallback(frame);
                    }
                });
                
                const simpleInit = await this.gradioClient.initialize();
                if (simpleInit) {
                    console.info('🎭 Using MuseTalk Simple Client (limited functionality)');
                    this.connected = true;
                    this.fallbackToStatic = false;
                    return true;
                } else {
                    this.fallbackToStatic = true;
                }
            } else {
                console.info('🎭 MuseTalk Gradio connected successfully');
                this.fallbackToStatic = false;
            }
            
            return initialized;
        } catch (error) {
            console.error('Failed to initialize MuseTalk:', error);
            this.fallbackToStatic = true;
            return false;
        }
    }

    async processAudioFrame(audioData, timestamp) {
        if (!this.connected || !this.gradioClient) {
            console.debug('MuseTalk not connected, skipping audio frame');
            return;
        }

        try {
            // Add audio chunk to Gradio client buffer
            await this.gradioClient.addAudioChunk(audioData);
        } catch (error) {
            console.error('Failed to send audio to MuseTalk:', error);
        }
    }

    setFrameCallback(callback) {
        this.frameCallback = callback;
    }

    setVideo(videoName) {
        this.selectedVideo = videoName;
        // TODO: Re-upload new video to Gradio
    }

    isAvailable() {
        // Check if the client has too many connections
        if (this.gradioClient && this.gradioClient.tooManyConnections) {
            return false;
        }
        return this.connected && !this.fallbackToStatic;
    }

    cleanup() {
        if (this.gradioClient) {
            this.gradioClient.cleanup();
            this.gradioClient = null;
        }
        this.connected = false;
    }
}

module.exports = MuseTalkClient;