/**
 * Unified Avatar Manager - Handles avatar display and animation for both Electron and Web
 */

// Platform detection
const isElectronEnv = typeof require !== 'undefined' && typeof process !== 'undefined' && process.versions && process.versions.electron;

// Platform-specific imports
let Store, MuseTalkStaticVideo, avatarConfig;

if (isElectronEnv) {
    Store = require('electron-store');
    MuseTalkStaticVideo = require('./musetalk-static-video');
    avatarConfig = require('../config');
} else {
    // Web environment - use window.CONFIG (no fallbacks)
    avatarConfig = {
        MUSETALK_HTTP: window.CONFIG?.MUSETALK_HTTP,
        MUSETALK_WS: window.CONFIG?.MUSETALK_WS
    };
}

// Get MuseTalkWebSocketClient based on environment
function getMuseTalkClient() {
    if (isElectronEnv) {
        const MuseTalkWebSocketClient = require('./musetalk-websocket-client');
        return MuseTalkWebSocketClient;
    } else {
        return window.MuseTalkWebSocketClient;
    }
}

class AvatarManager {
    constructor() {
        // Delay store access to avoid early IPC issues
        this.store = null;
        this.enabled = true; // Default to true
        this.animated = false;
        this.frameQueue = [];
        this.maxQueueSize = 5;
        this.staticVideo = isElectronEnv ? new MuseTalkStaticVideo() : null;
        this.musetalkApiUrl = avatarConfig.MUSETALK_HTTP;
        this.musetalkWsUrl = avatarConfig.MUSETALK_WS;
        this.musetalkConnected = false;
        this.musetalkWsClient = null;
        
        console.log('🎭 AvatarManager constructor completed');
    }

    initialize() {
        console.log(`🎭 Initializing Avatar Manager (${isElectronEnv ? 'Electron' : 'Web'})`);
        
        // Initialize store (Electron only)
        if (isElectronEnv) {
            try {
                this.store = new Store();
                this.enabled = this.store.get('avatarEnabled', true);
            } catch (error) {
                console.warn('Could not access store, using defaults:', error);
                this.enabled = true;
            }
        } else {
            // Web - always enabled
            this.enabled = true;
        }
        
        // Initialize canvas with default image after DOM is ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                this.initializeCanvas();
            });
        } else {
            // DOM ready, initialize immediately
            setTimeout(() => this.initializeCanvas(), 100);
        }
        
        // Apply initial avatar state
        if (this.enabled) {
            this.showAvatar();
        }
        
        // Initialize static video player (Electron only)
        if (this.staticVideo) {
            this.staticVideo.initialize();
        }
        
        // Test MuseTalk connectivity and establish WebSocket
        this.testMuseTalkConnection().then(() => {
            if (this.musetalkConnected) {
                this.connectMuseTalkWebSocket();
            }
        });
        
        // Set up frame update handler
        window.updateAvatarFrame = this.updateFrame.bind(this);
        
        // Set up audio playback hooks
        window.onAudioPlaybackStart = () => {
            if (this.enabled) {
                if (this.staticVideo) {
                    this.staticVideo.onAudioStart();
                } else {
                    console.log('🎭 Audio playback started - avatar should animate');
                }
            }
        };
        
        window.onAudioPlaybackStop = () => {
            if (this.enabled) {
                if (this.staticVideo) {
                    this.staticVideo.onAudioStop();
                } else {
                    console.log('🎭 Audio playback stopped - avatar should return to static');
                }
            }
        };
    }
    
    initializeCanvas() {
        console.log('🎭 initializeCanvas called');
        const canvasEl = document.getElementById('avatar-canvas');
        if (!canvasEl) {
            console.error('🎭 Avatar canvas not found during initialization');
            console.log('🎭 Available elements:', document.querySelectorAll('canvas').length, 'canvas elements');
            return;
        }
        console.log('🎭 Canvas found, initializing with default image', canvasEl);
        
        // Debug canvas visibility
        const computedStyle = window.getComputedStyle(canvasEl);
        console.log('🎭 Canvas initial visibility:', {
            display: computedStyle.display,
            visibility: computedStyle.visibility,
            opacity: computedStyle.opacity,
            width: computedStyle.width,
            height: computedStyle.height
        });
        
        const ctx = canvasEl.getContext('2d');
        const defaultImg = new Image();
        
        defaultImg.onload = () => {
            console.log('🎭 Loading default avatar image to canvas');
            ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
            ctx.drawImage(defaultImg, 0, 0, canvasEl.width, canvasEl.height);
        };
        
        defaultImg.onerror = (e) => {
            console.error('🎭 Failed to load default avatar image:', e);
            console.error('🎭 Attempted path:', defaultImg.src);
        };
        
        // Platform-specific asset path
        if (isElectronEnv) {
            defaultImg.src = './assets/avatars/nodie-default.png';
        } else {
            // Web - handle tests directory
            const basePath = window.location.pathname.includes('/tests/') ? '../' : './';
            defaultImg.src = `${basePath}assets/avatars/nodie-default.png`;
        }
    }

    showAvatar() {
        const circle = document.getElementById('circle');
        circle.classList.add('avatar-active', 'avatar-static');
        document.body.classList.add('avatar-enabled');
        
        // Force canvas to be visible for debugging
        const canvasEl = document.getElementById('avatar-canvas');
        if (canvasEl) {
            canvasEl.style.display = 'block';
            canvasEl.style.visibility = 'visible';
            canvasEl.style.opacity = '1';
            console.log('🎭 Forced canvas visibility in showAvatar');
        }
    }

    hideAvatar() {
        const circle = document.getElementById('circle');
        circle.classList.remove('avatar-active', 'avatar-animated', 'avatar-static');
        document.body.classList.remove('avatar-enabled');
        this.animated = false;
    }

    setEnabled(enabled) {
        this.enabled = enabled;
        if (this.store) {
            this.store.set('avatarEnabled', enabled);
        }
        
        if (enabled) {
            this.showAvatar();
        } else {
            this.hideAvatar();
        }
    }

    setAnimationMode(animated, available = true) {
        const circle = document.getElementById('circle');
        
        if (animated && available && this.enabled) {
            circle.classList.add('avatar-animated');
            circle.classList.remove('avatar-static');
            this.animated = true;
        } else if (this.enabled) {
            circle.classList.add('avatar-static');
            circle.classList.remove('avatar-animated');
            this.animated = false;
        }
    }

    updateFrame(frame) {
        if (!this.enabled || !frame || !frame.data) return;
        
        // Add frame to queue
        this.frameQueue.push(frame);
        
        // Limit queue size
        while (this.frameQueue.length > this.maxQueueSize) {
            this.frameQueue.shift();
        }
        
        // Process frame
        this.displayFrame(frame);
    }

    displayFrame(frame) {
        // Re-enabled with video support
        
        const videoEl = document.getElementById('avatar-video');
        const canvasEl = document.getElementById('avatar-canvas');
        const circle = document.getElementById('circle');
        
        try {
            // Handle different frame types
            if (frame.type === 'video_url') {
                console.log('🎭 Received video URL from MuseTalk:', frame.url);
                
                // Update animation state
                if (!this.animated) {
                    this.setAnimationMode(true);
                    // Hide canvas, show video
                    canvasEl.style.display = 'none';
                    videoEl.style.display = 'block';
                }
                
                // Set the video source to the MuseTalk generated video
                videoEl.src = frame.url;
                videoEl.play().catch(e => {
                    console.warn('Video autoplay failed:', e);
                });
                
                return;
            }
            
            console.debug('🎭 Displaying frame on canvas, data length:', frame.data ? frame.data.length : 0);
            
            // Update animation state if needed
            if (!this.animated) {
                this.setAnimationMode(true);
                // Hide video, show canvas
                videoEl.style.display = 'none';
                canvasEl.style.display = 'block';
                
                // Ensure avatar container has the right classes
                const circle = document.getElementById('circle');
                if (!circle.classList.contains('avatar-active')) {
                    console.log('🎭 Adding avatar-active class to show canvas');
                    circle.classList.add('avatar-active');
                }
            }
            
            // Draw frame on canvas for smooth updates
            const ctx = canvasEl.getContext('2d');
            const img = new Image();
            
            img.onload = () => {
                // Clear and draw new frame
                ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
                ctx.drawImage(img, 0, 0, canvasEl.width, canvasEl.height);
            };
            
            // Set source to trigger load
            img.src = `data:image/jpeg;base64,${frame.data}`;
            
        } catch (error) {
            console.error('Error displaying avatar frame:', error);
            // Fall back to static on error
            this.setAnimationMode(false);
        }
    }

    updateStatus(audioPlayback) {
        if (!audioPlayback) return;
        
        const status = audioPlayback.getAvatarStatus();
        
        if (status.available && !status.fallbackToStatic) {
            this.setAnimationMode(true, true);
        } else {
            this.setAnimationMode(false, true);
        }
    }

    getFrameQueueSize() {
        return this.frameQueue.length;
    }

    clearFrameQueue() {
        this.frameQueue = [];
    }

    isEnabled() {
        return this.enabled;
    }

    isAnimated() {
        return this.animated;
    }

    async testMuseTalkConnection() {
        try {
            console.log('🔗 Testing MuseTalk API connection to:', this.musetalkApiUrl);
            
            const response = await fetch(`${this.musetalkApiUrl}/health`, {
                method: 'GET',
                timeout: 5000
            });
            
            if (response.ok) {
                const data = await response.json();
                this.musetalkConnected = true;
                console.log('✅ MuseTalk API connected:', data);
                return true;
            } else {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
        } catch (error) {
            this.musetalkConnected = false;
            console.warn('⚠️ MuseTalk API not available:', error.message);
            console.warn('🎭 Avatar will use static video fallback');
            this.updateMuseTalkStatus('API Failed');
            return false;
        }
    }

    async getMuseTalkStatus() {
        if (!this.musetalkConnected) {
            return { connected: false, message: 'Not connected' };
        }
        
        try {
            const response = await fetch(`${this.musetalkApiUrl}/status`);
            const data = await response.json();
            return { connected: true, ...data };
        } catch (error) {
            this.musetalkConnected = false;
            return { connected: false, message: error.message };
        }
    }

    isMuseTalkConnected() {
        return this.musetalkConnected;
    }

    async connectMuseTalkWebSocket() {
        if (!this.musetalkWsUrl) {
            console.warn('MuseTalk WebSocket URL not configured');
            this.updateMuseTalkStatus('Not configured');
            return;
        }

        try {
            this.updateMuseTalkStatus('Connecting...');
            this.musetalkWsClient = new MuseTalkWebSocketClient(this.musetalkWsUrl);
            
            // Set up frame callback
            this.musetalkWsClient.setFrameCallback((frame) => {
                this.updateFrame(frame);
            });

            await this.musetalkWsClient.connect();
            console.log('✅ MuseTalk WebSocket connected for lip-sync');
            this.updateMuseTalkStatus('Connected');
            
            // Add musetalk-connected class to enable canvas visibility
            const circle = document.getElementById('circle');
            if (circle) {
                circle.classList.add('musetalk-connected');
                console.log('🎭 Added musetalk-connected class to circle');
            }
        } catch (error) {
            console.warn('⚠️ MuseTalk WebSocket connection failed:', error);
            this.musetalkWsClient = null;
            this.updateMuseTalkStatus('Failed');
        }
    }

    updateMuseTalkStatus(status) {
        const el = document.getElementById('musetalk-ws-status');
        if (el) {
            el.textContent = status;
            el.className = status === 'Connected' ? 'connected' : 'disconnected';
        }
    }

    sendAudioToMuseTalk(audioData) {
        console.info('🎯 Avatar manager sending audio to MuseTalk:', audioData.length, 'chars');
        if (this.musetalkWsClient && this.musetalkWsClient.isConnected()) {
            this.musetalkWsClient.sendAudio(audioData);
        } else {
            console.warn('⚠️ MuseTalk WebSocket not connected, skipping audio');
        }
    }

    setIdle() {
        // Return avatar to idle state (show default video instead of MuseTalk frames)
        console.debug('🎭 Setting avatar to idle state');
        
        const videoEl = document.getElementById('avatar-video');
        const canvasEl = document.getElementById('avatar-canvas');
        
        if (videoEl && canvasEl) {
            // Switch back to static video
            this.animated = false;
            canvasEl.style.display = 'none';
            videoEl.style.display = 'block';
            
            // Reset to default video source
            if (videoEl.src !== 'assets/avatars/nodie-video-01.mp4') {
                videoEl.src = 'assets/avatars/nodie-video-01.mp4';
            }
        }
    }
}

// UMD export pattern for both Electron and Web
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AvatarManager;
} else if (typeof window !== 'undefined') {
    window.AvatarManager = AvatarManager;
}