/**
 * Gradio client for HuggingFace MuseTalk container
 * Uses queue-based API for inference
 */

// In Electron renderer, always use window.fetch
const fetch = window.fetch;

// In Electron renderer, use the browser's EventSource
const EventSource = window.EventSource;

// Global connection tracking to prevent "too many connections"
let globalMuseTalkConnection = null;

class MuseTalkGradioClient {
    constructor() {
        this.baseUrl = 'http://localhost:8765';
        this.sessionHash = this.generateSessionHash();
        this.videoPath = null;
        this.isProcessing = false;
        this.frameCallback = null;
        this.audioBuffer = [];
        this.audioBufferDuration = 1000; // 1 second of audio
        this.lastProcessTime = 0;
        this.minProcessInterval = 800; // Process at most every 0.8 seconds
        this.audioCounter = 0;
        this.tooManyConnections = false;
        
        // Use singleton pattern to prevent multiple connections
        if (globalMuseTalkConnection) {
            console.warn('🎭 Reusing existing MuseTalk connection');
            return globalMuseTalkConnection;
        }
        globalMuseTalkConnection = this;
    }

    generateSessionHash() {
        return Math.random().toString(36).substring(2, 15);
    }

    createSilentWav(numSamples, sampleRate) {
        // WAV file header
        const bytesPerSample = 2; // 16-bit
        const numChannels = 1; // Mono
        const byteRate = sampleRate * numChannels * bytesPerSample;
        const blockAlign = numChannels * bytesPerSample;
        const dataSize = numSamples * bytesPerSample;
        const fileSize = 44 + dataSize; // Header is 44 bytes
        
        const buffer = new ArrayBuffer(fileSize);
        const view = new DataView(buffer);
        
        // Write WAV header
        const writeString = (offset, string) => {
            for (let i = 0; i < string.length; i++) {
                view.setUint8(offset + i, string.charCodeAt(i));
            }
        };
        
        writeString(0, 'RIFF');
        view.setUint32(4, fileSize - 8, true);
        writeString(8, 'WAVE');
        writeString(12, 'fmt ');
        view.setUint32(16, 16, true); // fmt chunk size
        view.setUint16(20, 1, true); // PCM format
        view.setUint16(22, numChannels, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, byteRate, true);
        view.setUint16(32, blockAlign, true);
        view.setUint16(34, 16, true); // Bits per sample
        writeString(36, 'data');
        view.setUint32(40, dataSize, true);
        
        // Fill with silence (zeros already there)
        
        return new Uint8Array(buffer);
    }

    async checkConnection() {
        try {
            const response = await fetch(`${this.baseUrl}/config`);
            if (!response.ok) {
                const text = await response.text();
                if (text.includes('too many people connected') || text.includes('Too many people connected')) {
                    console.warn('🎭 MuseTalk: Too many connections - will use static avatar');
                    this.tooManyConnections = true;
                    return false;
                }
            }
            const config = await response.json();
            return config.version && config.dependencies;
        } catch (error) {
            console.error('Failed to connect to MuseTalk:', error);
            return false;
        }
    }

    async uploadAudioBuffer(audioData) {
        try {
            // Create FormData for upload
            const formData = new FormData();
            const blob = new Blob([audioData], { type: 'audio/wav' });
            formData.append('files', blob, `audio-${Date.now()}.wav`);
            
            const response = await fetch(`${this.baseUrl}/upload`, {
                method: 'POST',
                body: formData
            });
            
            if (!response.ok) {
                console.error('Audio upload failed:', response.status);
                return null;
            }
            
            const result = await response.json();
            console.debug('Upload response:', result);
            
            // Return the full file object as expected by Gradio
            if (result && result.length > 0) {
                return {
                    path: result[0],
                    url: null,
                    size: audioData.length,
                    orig_name: `audio-${Date.now()}.wav`,
                    mime_type: 'audio/wav'
                };
            }
            return null;
        } catch (error) {
            console.error('Failed to upload audio:', error);
            return null;
        }
    }

    async processAudioBuffer() {
        if (this.isProcessing || this.audioBuffer.length === 0) {
            return;
        }

        const now = Date.now();
        if (now - this.lastProcessTime < this.minProcessInterval) {
            return;
        }

        this.isProcessing = true;
        this.lastProcessTime = now;

        try {
            // Combine audio buffer into single file
            const audioData = Buffer.concat(this.audioBuffer);
            this.audioBuffer = []; // Clear buffer

            // Skip if audio data is too small
            if (audioData.length < 1000) {
                console.debug('Audio buffer too small, skipping');
                this.isProcessing = false;
                return;
            }

            // For now, use a dummy audio to test video functionality
            // We'll need to convert Opus to WAV later
            console.debug('🎭 Using test audio for MuseTalk');
            
            // Create a simple WAV header + silence
            const sampleRate = 16000;
            const duration = 1; // 1 second
            const numSamples = sampleRate * duration;
            const wavData = this.createSilentWav(numSamples, sampleRate);
            
            const uploadedAudio = await this.uploadAudioBuffer(wavData);
            if (!uploadedAudio) {
                console.error('Failed to upload audio');
                this.isProcessing = false;
                return;
            }
            
            console.debug('🎭 Test audio uploaded:', uploadedAudio);
            
            // Submit job to queue with uploaded files
            const jobData = {
                data: [
                    uploadedAudio,  // Uploaded audio path
                    {               // Video file in container
                        path: "/app/avatars/nodie-video-01.mp4",
                        url: null,
                        size: 11981230,
                        orig_name: "nodie-video-01.mp4",
                        mime_type: "video/mp4"
                    },
                    0               // bbox_shift
                ],
                event_data: null,
                fn_index: 1,  // inference function
                trigger_id: 8, // button trigger
                session_hash: this.sessionHash
            };

            const response = await fetch(`${this.baseUrl}/queue/join`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(jobData)
            });

            if (!response.ok) {
                const text = await response.text();
                if (text.includes('too many people connected') || text.includes('Too many people connected')) {
                    console.warn('🎭 MuseTalk: Too many connections - falling back to static avatar');
                    this.tooManyConnections = true;
                    this.isProcessing = false;
                    return;
                }
                throw new Error(`Queue join failed: ${response.status}`);
            }

            const result = await response.json();
            const eventId = result.event_id;

            // Listen for results using EventSource
            this.listenForResults(eventId, opusPath);

        } catch (error) {
            console.error('MuseTalk processing error:', error);
            this.isProcessing = false;
        }
    }

    listenForResults(eventId, audioPath) {
        if (!EventSource) {
            console.error('EventSource not available - cannot listen for results');
            this.isProcessing = false;
            return;
        }
        
        const eventUrl = `${this.baseUrl}/queue/data?session_hash=${this.sessionHash}`;
        const eventSource = new EventSource(eventUrl);

        const cleanup = () => {
            eventSource.close();
            this.isProcessing = false;
        };

        eventSource.onmessage = async (event) => {
            try {
                const data = JSON.parse(event.data);
                
                if (data.msg === 'process_completed' && data.event_id === eventId) {
                    if (data.success && data.output && data.output.data) {
                        const outputVideo = data.output.data[0];
                        if (outputVideo && outputVideo.path) {
                            await this.processOutputVideo(outputVideo.path);
                        }
                    }
                    cleanup();
                } else if (data.msg === 'process_failed' || data.msg === 'error') {
                    console.error('MuseTalk processing failed:', data);
                    cleanup();
                }
            } catch (error) {
                console.error('Error processing event:', error);
            }
        };

        eventSource.onerror = (error) => {
            console.error('EventSource error:', error);
            cleanup();
        };

        // Timeout after 30 seconds
        setTimeout(() => {
            if (this.isProcessing) {
                console.warn('MuseTalk processing timeout');
                cleanup();
            }
        }, 30000);
    }

    async processOutputVideo(outputPath) {
        try {
            // For now, just extract a frame from the video
            // In a production system, we'd stream frames or extract multiple frames
            console.log('Processing output video:', outputPath);
            
            // The output is a path on the server, we need to download it
            const videoUrl = outputPath.startsWith('http') 
                ? outputPath 
                : `${this.baseUrl}/file=${outputPath}`;
                
            if (this.frameCallback) {
                // Send the video URL to be processed
                this.frameCallback({
                    type: 'video_url',
                    url: videoUrl,
                    timestamp: Date.now()
                });
            }
        } catch (error) {
            console.error('Failed to process output video:', error);
        }
    }

    async addAudioChunk(audioData) {
        this.audioBuffer.push(Buffer.from(audioData));
        
        // Check if we have enough audio to process
        const bufferSize = this.audioBuffer.reduce((acc, chunk) => acc + chunk.length, 0);
        if (bufferSize > 12000) { // About 0.5 seconds of audio at 24kHz
            await this.processAudioBuffer();
        }
    }

    setFrameCallback(callback) {
        this.frameCallback = callback;
    }

    async initialize() {
        const connected = await this.checkConnection();
        if (!connected) {
            console.error('MuseTalk Gradio interface not available');
            return false;
        }

        // Video is already available in the container at /app/avatars/
        console.log('🎭 Using pre-mounted avatar video in container');

        // Start processing loop
        setInterval(() => {
            this.processAudioBuffer();
        }, 500);

        return true;
    }

    cleanup() {
        this.audioBuffer = [];
        this.isProcessing = false;
    }
}

module.exports = MuseTalkGradioClient;