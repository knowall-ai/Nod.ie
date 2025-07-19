/**
 * MuseTalk WebSocket Client
 * Handles real-time audio streaming to MuseTalk for lip-sync generation
 */

class MuseTalkWebSocketClient {
    constructor(url) {
        if (!url) {
            throw new Error('MuseTalk WebSocket URL is required');
        }
        this.url = url;
        this.ws = null;
        this.connected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000;
        this.frameCallback = null;
    }

    async connect() {
        return new Promise((resolve, reject) => {
            try {
                console.log('🔗 Connecting to MuseTalk WebSocket:', this.url);
                this.ws = new WebSocket(this.url);

                this.ws.onopen = () => {
                    console.log('✅ MuseTalk WebSocket connected');
                    this.connected = true;
                    this.reconnectAttempts = 0;
                    resolve();
                };

                this.ws.onmessage = (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        this.handleMessage(data);
                    } catch (error) {
                        console.error('Error parsing MuseTalk message:', error);
                    }
                };

                this.ws.onerror = (error) => {
                    console.error('❌ MuseTalk WebSocket error:', error);
                    this.connected = false;
                };

                this.ws.onclose = () => {
                    console.log('🔌 MuseTalk WebSocket disconnected');
                    this.connected = false;
                    this.attemptReconnect();
                };

                // Timeout connection attempt (increased for model loading)
                setTimeout(() => {
                    if (!this.connected) {
                        reject(new Error('MuseTalk connection timeout'));
                    }
                }, 15000); // 15 seconds to allow for model initialization

            } catch (error) {
                reject(error);
            }
        });
    }

    handleMessage(data) {
        if (data.type === 'frame') {
            console.debug('🎭 Received lip-sync frame from MuseTalk');
            
            // Call the frame callback if set
            if (this.frameCallback && data.frame) {
                this.frameCallback({
                    type: 'musetalk_frame',
                    data: data.frame,
                    timestamp: data.timestamp || Date.now()
                });
            }
        } else if (data.type === 'error') {
            console.error('MuseTalk error:', data.message);
        } else if (data.type === 'status') {
            console.log('MuseTalk status:', data);
        }
    }

    sendAudio(audioData, metadata = {}) {
        if (!this.connected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
            console.debug('MuseTalk WebSocket not ready, skipping audio');
            return;
        }

        try {
            const message = {
                type: 'audio',
                audio: audioData,
                timestamp: Date.now(),
                ...metadata // Include format, sampleRate, channels, bitDepth if provided
            };
            
            this.ws.send(JSON.stringify(message));
        } catch (error) {
            console.error('Error sending audio to MuseTalk:', error);
        }
    }

    sendConfig(config) {
        if (!this.connected || !this.ws) return;

        try {
            this.ws.send(JSON.stringify({
                type: 'config',
                ...config
            }));
        } catch (error) {
            console.error('Error sending config to MuseTalk:', error);
        }
    }

    setFrameCallback(callback) {
        this.frameCallback = callback;
    }

    attemptReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('Max reconnection attempts reached for MuseTalk');
            return;
        }

        this.reconnectAttempts++;
        console.log(`Attempting to reconnect to MuseTalk (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);

        setTimeout(() => {
            this.connect().catch(error => {
                console.error('MuseTalk reconnection failed:', error);
            });
        }, this.reconnectDelay * this.reconnectAttempts);
    }

    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.connected = false;
    }

    isConnected() {
        return this.connected && this.ws && this.ws.readyState === WebSocket.OPEN;
    }
}

// Export for both Node.js and browser
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MuseTalkWebSocketClient;
} else {
    window.MuseTalkWebSocketClient = MuseTalkWebSocketClient;
}