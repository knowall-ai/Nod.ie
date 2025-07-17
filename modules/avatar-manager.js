/**
 * Avatar Manager - Handles avatar display and animation
 */

const Store = require('electron-store');
const MuseTalkStaticVideo = require('./musetalk-static-video');

class AvatarManager {
    constructor() {
        // Delay store access to avoid early IPC issues
        this.store = null;
        this.enabled = true; // Default to true
        this.animated = false;
        this.frameQueue = [];
        this.maxQueueSize = 5;
        this.staticVideo = new MuseTalkStaticVideo();
    }

    initialize() {
        // Initialize store now that IPC is ready
        try {
            this.store = new Store();
            this.enabled = this.store.get('avatarEnabled', true);
        } catch (error) {
            console.warn('Could not access store, using defaults:', error);
            this.enabled = true;
        }
        
        // Apply initial avatar state
        if (this.enabled) {
            this.showAvatar();
        }
        
        // Initialize static video player
        this.staticVideo.initialize();
        
        // Set up frame update handler
        window.updateAvatarFrame = this.updateFrame.bind(this);
        
        // Set up audio playback hooks
        window.onAudioPlaybackStart = () => {
            if (this.enabled) {
                this.staticVideo.onAudioStart();
            }
        };
        
        window.onAudioPlaybackStop = () => {
            if (this.enabled) {
                this.staticVideo.onAudioStop();
            }
        };
    }

    showAvatar() {
        const circle = document.getElementById('circle');
        circle.classList.add('avatar-active', 'avatar-static');
        document.body.classList.add('avatar-enabled');
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
        const imageEl = document.getElementById('avatar-image');
        const circle = document.getElementById('circle');
        
        try {
            // Handle different frame types
            if (frame.type === 'video_url') {
                console.log('🎭 Received video URL from MuseTalk:', frame.url);
                
                // Update animation state
                if (!this.animated) {
                    this.setAnimationMode(true);
                    // Hide static image, show video
                    imageEl.style.display = 'none';
                    videoEl.style.display = 'block';
                }
                
                // Set the video source to the MuseTalk generated video
                videoEl.src = frame.url;
                videoEl.play().catch(e => {
                    console.warn('Video autoplay failed:', e);
                });
                
                return;
            }
            
            console.debug('🎭 Displaying frame, data length:', frame.data ? frame.data.length : 0);
            
            // For video element, we need to use an img element that updates rapidly
            // Convert base64 to data URL (simpler approach)
            const dataUrl = `data:image/jpeg;base64,${frame.data}`;
            
            // Update animation state if needed
            if (!this.animated) {
                this.setAnimationMode(true);
                // Hide static image, show video
                imageEl.style.display = 'none';
                videoEl.style.display = 'block';
            }
            
            // Update video element (which is actually an img for rapid updates)
            videoEl.src = dataUrl;
            
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
}

module.exports = AvatarManager;