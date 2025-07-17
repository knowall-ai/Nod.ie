/**
 * Avatar Manager - Handles avatar display and animation
 */

const Store = require('electron-store');

class AvatarManager {
    constructor() {
        this.store = new Store();
        this.enabled = this.store.get('avatarEnabled', true);
        this.animated = false;
        this.frameQueue = [];
        this.maxQueueSize = 5;
    }

    initialize() {
        // Apply initial avatar state
        if (this.enabled) {
            this.showAvatar();
        }
        
        // Set up frame update handler
        window.updateAvatarFrame = this.updateFrame.bind(this);
    }

    showAvatar() {
        const circle = document.getElementById('circle');
        circle.classList.add('avatar-active', 'avatar-static');
    }

    hideAvatar() {
        const circle = document.getElementById('circle');
        circle.classList.remove('avatar-active', 'avatar-animated', 'avatar-static');
        this.animated = false;
    }

    setEnabled(enabled) {
        this.enabled = enabled;
        this.store.set('avatarEnabled', enabled);
        
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
        const videoEl = document.getElementById('avatar-video');
        const circle = document.getElementById('circle');
        
        try {
            // Convert base64 to blob URL
            const binaryData = atob(frame.data);
            const arrayBuffer = new ArrayBuffer(binaryData.length);
            const uint8Array = new Uint8Array(arrayBuffer);
            
            for (let i = 0; i < binaryData.length; i++) {
                uint8Array[i] = binaryData.charCodeAt(i);
            }
            
            const blob = new Blob([uint8Array], { type: 'image/jpeg' });
            const url = URL.createObjectURL(blob);
            
            // Update animation state if needed
            if (!this.animated) {
                this.setAnimationMode(true);
            }
            
            // Update video source
            videoEl.src = url;
            
            // Clean up old blob URL after frame is loaded
            videoEl.onload = () => {
                setTimeout(() => URL.revokeObjectURL(url), 100);
            };
            
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