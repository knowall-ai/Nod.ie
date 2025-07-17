/**
 * MuseTalk Client - Handles communication with MuseTalk API for lip-sync animation
 */

// Load config based on environment
const config = (() => {
    if (typeof require !== 'undefined') {
        return require('../config');
    } else {
        return window.NodieConfig || {
            MUSETALK_PORT: '8765',
            MUSETALK_HTTP: 'http://localhost:8765',
            MUSETALK_URL: 'ws://localhost:8765'
        };
    }
})();

class MuseTalkClient {
    constructor() {
        this.wsUrl = `${config.MUSETALK_URL}/ws`;
        this.apiUrl = config.MUSETALK_HTTP;
        this.ws = null;
        this.connected = false;
        this.frameBuffer = [];
        this.frameCallback = null;
        this.lastFrameTime = 0;
        this.frameDropThreshold = 100; // ms
        this.isProcessing = false;
        this.fallbackToStatic = false;
        this.performanceMonitor = {
            frameCount: 0,
            totalLatency: 0,
            avgLatency: 0
        };
    }

    async initialize() {
        try {
            // Check if service is healthy
            console.info('🎭 Checking MuseTalk service health...');
            const health = await this.checkHealth();
            console.info('🎭 MuseTalk health response:', health);
            
            if (health.status !== 'healthy') {
                console.warn('MuseTalk service not healthy, falling back to static avatar');
                this.fallbackToStatic = true;
                return false;
            }

            // Initialize model
            await fetch(`${this.apiUrl}/initialize`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    face_size: 256,
                    quality: 'auto'
                })
            });

            // Connect WebSocket
            await this.connectWebSocket();
            return true;
        } catch (error) {
            console.error('Failed to initialize MuseTalk client:', error);
            this.fallbackToStatic = true;
            return false;
        }
    }

    async connectWebSocket() {
        return new Promise((resolve, reject) => {
            this.ws = new WebSocket(this.wsUrl);

            this.ws.onopen = () => {
                console.info('🎭 MuseTalk WebSocket connected');
                this.connected = true;
                resolve();
            };

            this.ws.onmessage = (event) => {
                const data = JSON.parse(event.data);
                this.handleFrame(data);
            };

            this.ws.onerror = (error) => {
                console.error('MuseTalk WebSocket error:', error);
                this.connected = false;
                reject(error);
            };

            this.ws.onclose = () => {
                console.info('🎭 MuseTalk WebSocket disconnected');
                this.connected = false;
                // Attempt reconnection after 5 seconds
                setTimeout(() => {
                    if (!this.connected) {
                        this.connectWebSocket().catch(console.error);
                    }
                }, 5000);
            };
        });
    }

    async checkHealth() {
        try {
            const response = await fetch(`${this.apiUrl}/health`);
            if (!response.ok) {
                return { status: 'error', error: `HTTP ${response.status}` };
            }
            return await response.json();
        } catch (error) {
            console.error('🎭 MuseTalk health check error:', error);
            return { status: 'error', error: error.message };
        }
    }

    async processAudioFrame(audioData, timestamp) {
        // Don't process if fallen back to static
        if (this.fallbackToStatic || !this.connected) {
            return;
        }

        // Skip if still processing previous frame (prevent queue buildup)
        if (this.isProcessing) {
            return;
        }

        this.isProcessing = true;
        const startTime = performance.now();

        try {
            // Convert audio data to base64
            const base64Audio = btoa(String.fromCharCode.apply(null, audioData));

            // Send to MuseTalk via WebSocket
            this.ws.send(JSON.stringify({
                type: 'audio',
                audio: base64Audio,
                timestamp: timestamp
            }));

            // Monitor performance
            const latency = performance.now() - startTime;
            this.updatePerformanceMetrics(latency);

            // Auto-fallback if performance is poor
            if (this.performanceMonitor.avgLatency > 500) {
                console.warn('MuseTalk performance degraded, falling back to static avatar');
                this.fallbackToStatic = true;
            }
        } catch (error) {
            console.error('Error processing audio frame:', error);
        } finally {
            this.isProcessing = false;
        }
    }

    handleFrame(data) {
        if (data.type === 'frame') {
            const frame = {
                timestamp: data.timestamp,
                data: data.frame // base64 encoded image
            };

            // Add to buffer
            this.frameBuffer.push(frame);

            // Keep buffer size reasonable
            if (this.frameBuffer.length > 30) {
                this.frameBuffer.shift();
            }

            // Trigger callback if set
            if (this.frameCallback) {
                this.frameCallback(frame);
            }
        }
    }

    getFrameForTimestamp(timestamp) {
        if (this.frameBuffer.length === 0) {
            return null;
        }

        // Find closest frame
        let closestFrame = null;
        let minDiff = Infinity;

        for (const frame of this.frameBuffer) {
            const diff = Math.abs(frame.timestamp - timestamp);
            if (diff < minDiff) {
                minDiff = diff;
                closestFrame = frame;
            }
        }

        // Only return if within threshold
        if (minDiff < this.frameDropThreshold) {
            return closestFrame;
        }

        return null;
    }

    updatePerformanceMetrics(latency) {
        this.performanceMonitor.frameCount++;
        this.performanceMonitor.totalLatency += latency;
        this.performanceMonitor.avgLatency = 
            this.performanceMonitor.totalLatency / this.performanceMonitor.frameCount;

        // Log performance every 100 frames
        if (this.performanceMonitor.frameCount % 100 === 0) {
            console.debug('🎭 MuseTalk performance:', {
                avgLatency: this.performanceMonitor.avgLatency.toFixed(2) + 'ms',
                frameCount: this.performanceMonitor.frameCount,
                bufferSize: this.frameBuffer.length
            });
        }
    }

    setFrameCallback(callback) {
        this.frameCallback = callback;
    }

    isAvailable() {
        return this.connected && !this.fallbackToStatic;
    }

    getFrameQueueSize() {
        return this.frameBuffer.length;
    }

    cleanup() {
        if (this.ws) {
            this.ws.close();
        }
        this.frameBuffer = [];
        this.connected = false;
    }
}

module.exports = MuseTalkClient;