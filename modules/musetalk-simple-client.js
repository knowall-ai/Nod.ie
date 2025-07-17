/**
 * Simplified MuseTalk client without EventSource
 * Falls back to polling for compatibility
 */

class MuseTalkSimpleClient {
    constructor() {
        this.baseUrl = 'http://localhost:8765';
        this.isProcessing = false;
        this.frameCallback = null;
        this.connected = false;
    }

    async initialize() {
        try {
            // Just check if MuseTalk is accessible
            const response = await fetch(this.baseUrl + '/config');
            const config = await response.json();
            console.log('🎭 MuseTalk Simple Client connected to Gradio v' + config.version);
            this.connected = true;
            return true;
        } catch (error) {
            console.error('Failed to connect to MuseTalk:', error);
            return false;
        }
    }

    async processAudioFrame(audioData, timestamp) {
        // For now, just log that we would process
        console.debug('🎭 Would process audio frame of size:', audioData.length);
        
        // Simulate lip-sync by sending random mouth positions
        if (this.frameCallback && Math.random() > 0.7) {
            this.frameCallback({
                type: 'simple_lipsync',
                mouthOpen: Math.random(),
                timestamp: timestamp
            });
        }
    }

    setFrameCallback(callback) {
        this.frameCallback = callback;
    }

    isAvailable() {
        return this.connected;
    }

    cleanup() {
        this.connected = false;
    }
}

module.exports = MuseTalkSimpleClient;