/**
 * Unified renderer for both Electron and Web environments
 */

// Platform detection - minimal, just for necessary differences
const isElectron = typeof require !== 'undefined' && typeof process !== 'undefined' && process.versions && process.versions.electron;

// Set platform attribute for CSS styling
function setPlatformAttribute() {
    document.body.setAttribute('data-platform', isElectron ? 'electron' : 'web');
}

// Load modules based on environment
const { ipcRenderer } = isElectron ? require('electron') : {};
// Use web-compatible modules that work in both environments
const AudioCapture = isElectron ? require('./modules/audio-capture') : window.AudioCaptureWeb;
const AudioPlayback = isElectron ? require('./modules/audio-playback') : window.AudioPlaybackWeb;
const AvatarManagerClass = isElectron ? require('./modules/avatar-manager') : window.AvatarManager;

// Unified Renderer object
const NodieRenderer = {
    // State
    state: {
        isConnected: false,
        isMuted: false, // Start unmuted to see waveform
        wsHandler: null,
        audioContext: null,
        mediaStream: null,
        analyser: null,
        avatarEnabled: true,
        isLoading: true,
        audioCapture: null,
        audioPlayback: null,
        avatarManager: null
    },
    
    // Audio accumulation for MuseTalk (since individual deltas may be fragments)
    museTalkAudioAccumulator: new Uint8Array(0),
    museTalkFlushTimeout: null,
    
    // PCM audio accumulation for MuseTalk
    pcmAudioAccumulator: [],
    pcmFlushTimeout: null,
    

    // UI Functions
    setStatus(status) {
        const circle = document.getElementById('circle');
        if (!circle) return;
        
        circle.className = '';
        if (this.state.isLoading) {
            circle.classList.add('loading');
        } else if (this.state.isMuted) {
            circle.classList.add('muted');
        } else if (status === 'thinking') {
            circle.classList.add('thinking');
        } else if (status === 'listening') {
            circle.classList.add('listening');
        } else {
            circle.classList.add('idle');
        }
        
        console.log('Status changed to:', status);
        
        // Update debug info if in web mode
        const statusEl = document.getElementById('status');
        if (statusEl) {
            statusEl.textContent = this.state.isLoading ? 'Loading...' : status;
        }
    },

    showNotification(text, type = 'info') {
        // Try to show in center first
        const statusText = document.getElementById('status-text');
        if (statusText) {
            statusText.textContent = text;
            statusText.style.display = 'block';
            setTimeout(() => {
                statusText.style.display = 'none';
            }, 3000);
        }
        
        // Fallback to corner notification
        const notification = document.getElementById('notification');
        if (notification) {
            notification.textContent = text;
            notification.className = `notification ${type}`;
            notification.style.display = 'block';
            
            setTimeout(() => {
                notification.style.display = 'none';
            }, 3000);
        }
        
        console.log('Notification:', text);
    },

    // Avatar Functions
    showAvatar() {
        if (!this.state.avatarEnabled) return;
        
        const container = document.getElementById('avatar-container');
        
        if (container) {
            container.style.display = 'block';
            this.updateAvatarStatus('Visible');
        }
    },

    hideAvatar() {
        const container = document.getElementById('avatar-container');
        
        if (container) {
            container.style.display = 'none';
            this.updateAvatarStatus('Hidden');
        }
    },

    updateAvatarStatus(text) {
        const el = document.getElementById('avatar-status');
        if (el) el.textContent = text;
    },

    updateWSStatus(text) {
        // Update generic ws-status (for backward compatibility)
        const el = document.getElementById('ws-status');
        if (el) el.textContent = text;
        
        // Update specific Unmute status
        const unmuteEl = document.getElementById('unmute-ws-status');
        if (unmuteEl) {
            unmuteEl.textContent = text;
            unmuteEl.className = text === 'Connected' ? 'connected' : 'disconnected';
        }
    },

    // Audio Visualization
    startWaveform() {
        const canvas = document.getElementById('waveform');
        if (!canvas) {
            console.error('❌ Waveform canvas not found');
            return;
        }
        
        // Always show the waveform - it will be static without analyser, dynamic with analyser
        
        console.log('✅ Starting waveform visualization');
        const ctx = canvas.getContext('2d');
        canvas.width = 300;
        canvas.height = 300;
        
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        // Match the avatar diameter exactly (250px)
        const radius = 125; // Avatar is 250px diameter, so radius is 125px
        
        let animationId;
        
        const draw = () => {
            animationId = requestAnimationFrame(draw);
            
            // Clear canvas
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            // Draw orange waveform ring with glow
            ctx.shadowColor = 'rgba(247, 147, 26, 1)';
            ctx.shadowBlur = 20;
            ctx.strokeStyle = 'rgba(247, 147, 26, 1)';
            ctx.lineWidth = 6;
            
            // Rotating offset for visual interest (10 second rotation)
            const rotationOffset = (Date.now() % 10000) / 10000 * Math.PI * 2;
            
            // Check if we have significant audio activity
            let hasAudioActivity = false;
            if (this.state.analyser) {
                const bufferLength = this.state.analyser.frequencyBinCount;
                const dataArray = new Uint8Array(bufferLength);
                this.state.analyser.getByteFrequencyData(dataArray);
                
                // Check for audio activity
                for (let i = 0; i < bufferLength; i++) {
                    if (dataArray[i] > 25) { // Threshold for activity
                        hasAudioActivity = true;
                        break;
                    }
                }
                
                // If audio activity, draw reactive waveform
                if (hasAudioActivity) {
                    ctx.beginPath();
                    const segments = 120;
                    
                    for (let i = 0; i <= segments; i++) {
                        const angle = (i / segments) * Math.PI * 2 + rotationOffset;
                        const freqIndex = Math.floor((i / segments) * bufferLength * 0.5);
                        const amplitude = dataArray[freqIndex] / 255;
                        const deformation = amplitude > 0.1 ? amplitude * 15 : 0;
                        const r = radius + deformation;
                        
                        const x = centerX + r * Math.cos(angle);
                        const y = centerY + r * Math.sin(angle);
                        
                        if (i === 0) {
                            ctx.moveTo(x, y);
                        } else {
                            ctx.lineTo(x, y);
                        }
                    }
                    ctx.closePath();
                    ctx.stroke();
                } else {
                    // No activity - draw perfect smooth circle
                    ctx.beginPath();
                    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
                    ctx.stroke();
                }
            } else {
                // No analyser - draw perfect smooth circle
                ctx.beginPath();
                ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
                ctx.stroke();
            }
        };
        
        draw();
        
        return () => {
            if (animationId) {
                cancelAnimationFrame(animationId);
            }
        };
    },

    // WebSocket Connection
    async getConfig() {
        if (isElectron && ipcRenderer) {
            try {
                return await ipcRenderer.invoke('get-config');
            } catch (error) {
                console.error('Failed to get config from main process:', error);
            }
        }
        
        // Web environment or fallback
        const defaultConfig = (() => {
            try {
                return require('./config');
            } catch (e) {
                return {
                    UNMUTE_BACKEND_URL: undefined, // Must be configured in .env
                    VOICE_MODEL: 'unmute-prod-website/ex04_narration_longform_00001.wav'
                };
            }
        })();
        
        return window.NodieConfig || window.ENV_CONFIG || defaultConfig;
    },


    async connectToUnmute() {
        try {
            this.updateWSStatus('Connecting...');
            
            // Get backend URL from config
            const config = await this.getConfig();
            const backendUrl = config.UNMUTE_BACKEND_URL;
            if (!backendUrl) {
                console.error('❌ UNMUTE_BACKEND_URL not configured in .env');
                this.showNotification('Backend URL not configured', 'error');
                return;
            }
            
            const ws = new WebSocket(`${backendUrl}/v1/realtime`, ['realtime']);
            
            ws.onopen = () => {
                console.log('✅ Connected to Unmute');
                this.state.isConnected = true;
                this.updateWSStatus('Connected');
                
                // Configure session
                ws.send(JSON.stringify({
                    type: 'session.update',
                    session: {
                        model: 'llama3.2:3b',
                        voice: config.VOICE_MODEL || 'unmute-prod-website/ex04_narration_longform_00001.wav',
                        instructions: {
                            type: 'constant',
                            text: 'You are Nodey, a helpful female AI assistant. Speak naturally in first person - say "I" not "Nodey" when referring to yourself. If asked to spell your name, spell it "N-O-D dot I-E" (nod.ie). When users say words that sound like: Noddy, Nody, Nodey, Node-ee, Nodi, Navy, Nandi, Maddie, Maggie, Nogi, Nadie, Moby, or similar sounds, they are addressing you by YOUR name "Nodey" (these are variations of your name, not the user\'s name). Do not call the user by these names. Keep responses brief and conversational.'
                        },
                        allow_recording: true  // Enable recording for voice input
                    }
                }));
                
                this.showNotification('Connected to Unmute', 'success');
                this.checkIfFullyLoaded();
            };
            
            ws.onmessage = async (event) => {
                const data = JSON.parse(event.data);
                console.debug('Message:', data.type);
                
                // Log error details
                if (data.type === 'error') {
                    console.error('❌ Unmute error:', data.error || data);
                }
                
                // Reset audio playback notification flag for new responses
                if (data.type === 'response.created') {
                    if (this.state.audioPlayback) {
                        this.state.audioPlayback.hasNotifiedPlaybackStart = false;
                    }
                }
                
                if (data.type === 'response.audio.delta' && data.delta) {
                    console.info('🔊 Received audio response from backend');
                    
                    // Initialize audio playback if needed
                    if (!this.state.audioPlayback && AudioPlayback) {
                        this.state.audioPlayback = new AudioPlayback();
                        await this.state.audioPlayback.initialize();
                    }
                    
                    
                    // Decode base64 to Uint8Array
                    const binaryString = atob(data.delta);
                    const bytes = new Uint8Array(binaryString.length);
                    for (let i = 0; i < binaryString.length; i++) {
                        bytes[i] = binaryString.charCodeAt(i);
                    }
                    
                    // Debug the data format
                    if (!this.debuggedAudio) {
                        const first4 = Array.from(bytes.slice(0, 4));
                        const isOgg = first4[0] === 79 && first4[1] === 103 && first4[2] === 103 && first4[3] === 83;
                        console.debug('🎵 Audio delta format:', {
                            length: bytes.length,
                            first10: Array.from(bytes.slice(0, 10)),
                            isOgg: isOgg,
                            first4Hex: first4.map(b => b.toString(16).padStart(2, '0')).join(' '),
                            isTypedArray: bytes instanceof Uint8Array,
                            hasBuffer: !!bytes.buffer
                        });
                        this.debuggedAudio = true;
                    }
                    
                    if (this.state.audioPlayback) {
                        await this.state.audioPlayback.processAudioDelta(bytes);
                    }
                    
                    // Send TTS audio to MuseTalk
                    if (this.state.avatarManager) {
                        // For now, just accumulate all audio data
                        // The issue is that individual OGG segments are too small to decode
                        const newAccumulator = new Uint8Array(this.museTalkAudioAccumulator.length + bytes.length);
                        newAccumulator.set(this.museTalkAudioAccumulator);
                        newAccumulator.set(bytes, this.museTalkAudioAccumulator.length);
                        this.museTalkAudioAccumulator = newAccumulator;
                        
                        // Clear existing timeout
                        if (this.museTalkFlushTimeout) {
                            clearTimeout(this.museTalkFlushTimeout);
                        }
                        
                        // Only send when we have a reasonable amount of data
                        // Need enough for meaningful audio processing
                        const shouldFlushNow = this.museTalkAudioAccumulator.length > 10000; // ~10KB threshold
                        
                        if (shouldFlushNow) {
                            this.flushMuseTalkAudio();
                        } else {
                            // Set timeout to flush after delay
                            this.museTalkFlushTimeout = setTimeout(() => {
                                this.flushMuseTalkAudio();
                            }, 1000); // 1 second delay to accumulate more
                        }
                    }
                }
                
                if (data.type === 'response.audio_transcript.delta' && data.delta) {
                    console.debug('Assistant says:', data.delta);
                }
                
                // Handle when response ends (return avatar to idle)
                if (data.type === 'response.done') {
                    console.debug('🎭 Response completed, returning avatar to idle');
                    
                    // Flush any remaining audio to MuseTalk
                    this.flushMuseTalkAudio();
                    
                    // Return avatar to idle
                    if (this.state.avatarManager) {
                        this.state.avatarManager.setIdle();
                    }
                }
                
                if (data.type === 'conversation.item.input_audio_transcription.delta' && data.delta) {
                    console.info('You said:', data.delta);
                }
                
            };
            
            ws.onerror = (error) => {
                console.error('WebSocket error:', error);
                this.updateWSStatus('Error');
                this.showNotification('Connection error', 'error');
            };
            
            ws.onclose = () => {
                console.log('WebSocket closed');
                this.state.isConnected = false;
                this.updateWSStatus('Disconnected');
                this.setStatus('idle');
            };
            
            this.state.wsHandler = ws;
            
        } catch (error) {
            console.error('Failed to connect:', error);
            this.updateWSStatus('Failed');
            this.showNotification('Failed to connect to Unmute', 'error');
        }
    },

    // Microphone Access
    async startMicrophone() {
        try {
            // Use AudioCapture module if available (Electron)
            if (AudioCapture) {
                this.state.audioCapture = new AudioCapture((audioData) => {
                    // Validate audio data before sending
                    // Backend expects at least 6 bytes to check opus_bytes[5]
                    if (!audioData || audioData.length === 0) {
                        console.debug('⚠️ Skipping empty audio data in renderer');
                        return;
                    }
                    
                    // Additional validation for base64 length
                    // Base64 encoding of 6 bytes = 8 characters minimum
                    if (audioData.length < 8) {
                        console.debug('⚠️ Skipping too-short base64 audio data in renderer, length:', audioData.length);
                        return;
                    }
                    
                    // Send audio to WebSocket
                    if (this.state.wsHandler && this.state.wsHandler.readyState === WebSocket.OPEN) {
                        this.state.wsHandler.send(JSON.stringify({
                            type: 'input_audio_buffer.append',
                            audio: audioData
                        }));
                    }
                    
                });
                
                await this.state.audioCapture.start();
                this.state.analyser = this.state.audioCapture.getAnalyser();
                
                console.log('🎤 Audio capture started, analyser:', !!this.state.analyser);
                
                // Waveform is already running, now it will be dynamic with analyser
                console.log('🌊 Waveform now has analyser for dynamic visualization');
            } else {
                console.error('❌ AudioCapture module not available');
                this.showNotification('Audio capture not available', 'error');
            }
            
            console.log('✅ Microphone started');
            this.showNotification('Microphone active', 'success');
            
        } catch (error) {
            console.error('Microphone failed:', error);
            this.showNotification('Microphone access denied', 'error');
        }
    },

    // Toggle Mute
    toggleMute() {
        this.state.isMuted = !this.state.isMuted;
        this.setStatus('idle');
        
        if (this.state.isMuted) {
            this.showNotification('Muted', 'info');
            this.showAvatar(); // Show avatar when muted
            
            // Stop audio capture
            if (this.state.audioCapture) {
                this.state.audioCapture.stop();
                this.state.audioCapture = null;
            }
            
            // Stop media stream
            if (this.state.mediaStream) {
                this.state.mediaStream.getTracks().forEach(track => track.stop());
                this.state.mediaStream = null;
            }
        } else {
            this.showNotification('Unmuted', 'success');
            this.showAvatar(); // Always show avatar - don't hide when unmuted
            if (this.state.isConnected) {
                this.startMicrophone();
            }
        }
    },

    // Avatar Loading
    async loadVideoAvatar() {
        const video = document.getElementById('avatar-video');
        const image = document.getElementById('avatar-image');
        
        if (!video || !this.state.avatarEnabled) return;
        
        try {
            // Try to load a test video - handle both electron and web paths
            const videoUrl = window.location.pathname.includes('tests/') 
                ? '../assets/avatars/nodie-video-01.mp4'
                : 'assets/avatars/nodie-video-01.mp4';
            
            this.updateAvatarStatus('Loading video...');
            console.log('🎥 Loading video from:', videoUrl);
            
            video.src = videoUrl;
            video.style.display = 'block';
            if (image) image.style.display = 'none';
            
            await new Promise((resolve, reject) => {
                video.onloadeddata = () => {
                    this.updateAvatarStatus('Video loaded');
                    console.log('✅ Video avatar loaded successfully');
                    resolve();
                };
                video.onerror = (e) => {
                    this.updateAvatarStatus('Video failed, using image');
                    console.error('Video loading failed:', e);
                    reject(e);
                };
            });
            
        } catch (error) {
            console.error('Failed to load video avatar:', error);
            // Fall back to image
            video.style.display = 'none';
            if (image) {
                image.style.display = 'block';
                this.updateAvatarStatus('Using static image');
            }
        }
    },

    // Loading state management
    showLoadingText(text) {
        const statusText = document.getElementById('status-text');
        if (statusText) {
            statusText.textContent = text;
            statusText.style.display = 'block';
        }
    },

    hideLoadingText() {
        const statusText = document.getElementById('status-text');
        if (statusText) {
            statusText.style.display = 'none';
        }
    },

    checkIfFullyLoaded() {
        if (this.state.isConnected) {
            this.state.isLoading = false;
            this.setStatus('idle');
            this.hideLoadingText();
            console.log('✅ Fully loaded and ready');
            console.log('📊 Mute state:', this.state.isMuted);
            
            // Start microphone if unmuted
            if (!this.state.isMuted) {
                console.log('🎤 Starting microphone because unmuted');
                this.startMicrophone();
            } else {
                console.log('🔇 Not starting microphone because muted');
            }
        }
    },

    // Flush accumulated MuseTalk audio
    flushMuseTalkAudio() {
        // Only send if we have a substantial amount of audio data (avoid "End of file" errors)
        if (this.museTalkAudioAccumulator.length > 5000 && this.state.avatarManager) {
            // Debug: Check what format we're sending
            const first4Bytes = Array.from(this.museTalkAudioAccumulator.slice(0, 4));
            const isOgg = first4Bytes[0] === 79 && first4Bytes[1] === 103 && first4Bytes[2] === 103 && first4Bytes[3] === 83; // OggS
            console.info('🎭 Audio format check:', isOgg ? 'OGG detected' : 'Raw data', 'First 4 bytes:', first4Bytes);
            
            const base64Audio = btoa(String.fromCharCode.apply(null, this.museTalkAudioAccumulator));
            console.info('🎭 Flushing accumulated audio to MuseTalk:', base64Audio.length, 'chars from', this.museTalkAudioAccumulator.length, 'bytes');
            this.state.avatarManager.sendAudioToMuseTalk(base64Audio);
            
            // Reset accumulator
            this.museTalkAudioAccumulator = new Uint8Array(0);
        } else if (this.museTalkAudioAccumulator.length > 0) {
            console.debug('🎭 Skipping small audio chunk to MuseTalk:', this.museTalkAudioAccumulator.length, 'bytes (too small)');
            // Still reset to avoid accumulating forever
            this.museTalkAudioAccumulator = new Uint8Array(0);
        }
        
        // Clear timeout
        if (this.museTalkFlushTimeout) {
            clearTimeout(this.museTalkFlushTimeout);
            this.museTalkFlushTimeout = null;
        }
    },

    // Initialize
    initialize() {
        console.log('📄 Renderer initializing...');
        
        // Set platform attribute
        setPlatformAttribute();
        
        // Show loading state
        this.state.isLoading = true;
        this.setStatus('loading');
        this.showLoadingText('Loading Nod.ie...');
        
        // Set up click handler
        const circle = document.getElementById('circle');
        if (circle) {
            circle.addEventListener('click', () => {
                if (!this.state.isLoading) {
                    this.toggleMute();
                } else {
                    this.showNotification('Still loading, please wait...', 'info');
                }
            });
        }
        
        // Initialize connections
        this.connectToUnmute();
        // this.loadVideoAvatar(); // Disabled - using MuseTalk frames instead
        
        // Initialize avatar manager (for MuseTalk integration)
        console.log('🔍 Checking AvatarManagerClass:', typeof AvatarManagerClass);
        console.log('🔍 Canvas element exists:', !!document.getElementById('avatar-canvas'));
        if (AvatarManagerClass) {
            console.log('🔍 Creating new AvatarManagerClass...');
            this.state.avatarManager = new AvatarManagerClass();
            console.log('🔍 Calling initialize...');
            this.state.avatarManager.initialize();
            console.log('✅ Avatar manager initialized');
        } else {
            console.error('❌ AvatarManagerClass not found');
        }
        
        // Start waveform (will be static until analyser is available)
        this.startWaveform();
        
        // Fallback timeout in case connection fails
        setTimeout(() => {
            if (this.state.isLoading) {
                this.state.isLoading = false;
                this.setStatus('idle');
                if (!this.state.isConnected) {
                    this.showNotification('Failed to connect to backend', 'error');
                }
            }
        }, 10000); // 10 second timeout
        
        console.log('✅ Renderer initialized');
    },

    // Audio playback handlers to prevent initial self-interruption using gain ducking
    onAudioPlaybackStart() {
        // Duck microphone gain instead of pausing to preserve echo cancellation
        if (this.state.audioCapture) {
            this.state.audioCapture.setGain(0.1); // Reduce to 10% for initial period
            
            // Restore normal gain after a short delay
            setTimeout(() => {
                if (this.state.audioCapture) {
                    this.state.audioCapture.setGain(1.0);
                }
            }, 200); // 200ms delay - enough to prevent immediate self-interruption
        }
        
        // Trigger avatar animation if avatar manager is available
        if (this.state.avatarManager && typeof this.state.avatarManager.setAnimationMode === 'function') {
            this.state.avatarManager.setAnimationMode(true);
        }
    },

    onAudioPlaybackStop() {
        // Ensure microphone gain is restored when audio playback stops
        if (this.state.audioCapture) {
            console.debug('🎤 Ensuring microphone gain is restored after audio playback');
            this.state.audioCapture.setGain(1.0);
        }
        
        // Return avatar to static mode if avatar manager is available
        if (this.state.avatarManager && typeof this.state.avatarManager.setAnimationMode === 'function') {
            this.state.avatarManager.setAnimationMode(false);
        }
    },
    
    // Handle decoded PCM audio from decoderWorker
    onDecodedAudio(pcmFrame) {
        if (!this.state.avatarManager) return;
        
        // pcmFrame is a Float32Array of PCM audio
        // Accumulate PCM frames
        this.pcmAudioAccumulator.push(pcmFrame);
        
        // Clear existing timeout
        if (this.pcmFlushTimeout) {
            clearTimeout(this.pcmFlushTimeout);
        }
        
        // Calculate total samples
        const totalSamples = this.pcmAudioAccumulator.reduce((sum, frame) => sum + frame.length, 0);
        
        // Send when we have enough audio (0.5 seconds at 48kHz = 24000 samples)
        if (totalSamples > 24000) {
            this.flushPCMAudio();
        } else {
            // Set timeout to flush after delay
            this.pcmFlushTimeout = setTimeout(() => {
                this.flushPCMAudio();
            }, 500); // 500ms delay
        }
    },
    
    // Send accumulated PCM audio to MuseTalk
    flushPCMAudio() {
        if (this.pcmAudioAccumulator.length === 0) return;
        
        // Combine all PCM frames
        const totalSamples = this.pcmAudioAccumulator.reduce((sum, frame) => sum + frame.length, 0);
        const combinedPCM = new Float32Array(totalSamples);
        let offset = 0;
        
        for (const frame of this.pcmAudioAccumulator) {
            combinedPCM.set(frame, offset);
            offset += frame.length;
        }
        
        // Convert Float32Array to Int16Array for WAV format
        const int16Audio = new Int16Array(combinedPCM.length);
        for (let i = 0; i < combinedPCM.length; i++) {
            // Clamp and convert to int16
            const sample = Math.max(-1, Math.min(1, combinedPCM[i]));
            int16Audio[i] = sample * 32767;
        }
        
        // Convert to base64
        const uint8Audio = new Uint8Array(int16Audio.buffer);
        const base64Audio = btoa(String.fromCharCode.apply(null, uint8Audio));
        
        console.info('🎭 Sending PCM audio to MuseTalk:', base64Audio.length, 'chars from', totalSamples, 'samples');
        
        // Send as PCM data with metadata
        if (this.state.avatarManager && this.state.avatarManager.musetalkWsClient) {
            this.state.avatarManager.musetalkWsClient.sendAudio(base64Audio, {
                format: 'pcm',
                sampleRate: 48000, // Assuming 48kHz from audio context
                channels: 1,
                bitDepth: 16
            });
        }
        
        // Clear accumulator
        this.pcmAudioAccumulator = [];
        
        // Clear timeout
        if (this.pcmFlushTimeout) {
            clearTimeout(this.pcmFlushTimeout);
            this.pcmFlushTimeout = null;
        }
    }
};

// Track console errors for debug UI (works in both environments)
let errorCount = 0;
const originalError = console.error;
console.error = function(...args) {
    errorCount++;
    const el = document.getElementById('console-errors');
    if (el) el.textContent = `${errorCount} errors`;
    originalError.apply(console, args);
};

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        NodieRenderer.initialize();
    });
} else {
    // DOM already loaded
    NodieRenderer.initialize();
}

// Export for testing and global access
if (typeof module !== 'undefined' && module.exports) {
    module.exports = NodieRenderer;
}

// Ensure global access in browser
if (typeof window !== 'undefined') {
    window.NodieRenderer = NodieRenderer;
    console.debug('🌐 NodieRenderer attached to window globally');
}

// Global error handling
window.addEventListener('error', (e) => {
    console.error('Global error:', e.error);
});