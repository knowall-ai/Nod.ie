/**
 * Simple video avatar that cycles through video files
 * without external API dependencies
 */

class SimpleVideoAvatar {
    constructor() {
        this.videos = [
            'assets/avatars/nodie-video-01.mp4',
            'assets/avatars/nodie-video-02.mp4', 
            'assets/avatars/nodie-video-03.mp4'
        ];
        this.currentVideoIndex = 0;
        this.isPlaying = false;
        this.videoElement = null;
    }

    initialize() {
        console.info('🎬 Initializing simple video avatar...');
        this.videoElement = document.getElementById('avatar-video');
        
        if (!this.videoElement) {
            console.error('🎬 Video element not found');
            return false;
        }

        // Set up video element
        this.videoElement.muted = true;
        this.videoElement.loop = true;
        this.videoElement.style.display = 'none';
        
        // Load first video
        this.loadVideo(0);
        
        console.info('🎬 Simple video avatar initialized');
        return true;
    }

    loadVideo(index) {
        if (index >= 0 && index < this.videos.length) {
            this.currentVideoIndex = index;
            this.videoElement.src = this.videos[index];
            console.info(`🎬 Loaded video: ${this.videos[index]}`);
        }
    }

    startTalking() {
        if (!this.videoElement) return;
        
        console.info('🎬 Starting video playback...');
        this.isPlaying = true;
        
        // Show video, hide static image
        this.videoElement.style.display = 'block';
        const avatarImage = document.getElementById('avatar-image');
        if (avatarImage) {
            avatarImage.style.display = 'none';
        }
        
        // Add avatar animation classes
        const circle = document.getElementById('circle');
        if (circle) {
            circle.classList.add('avatar-active', 'avatar-animated');
            circle.classList.remove('avatar-static');
        }
        
        // Play video
        this.videoElement.play().catch(error => {
            console.error('🎬 Failed to play video:', error);
        });
    }

    stopTalking() {
        if (!this.videoElement) return;
        
        console.info('🎬 Stopping video playback...');
        this.isPlaying = false;
        
        // Hide video, show static image
        this.videoElement.style.display = 'none';
        this.videoElement.pause();
        
        const avatarImage = document.getElementById('avatar-image');
        if (avatarImage) {
            avatarImage.style.display = 'block';
        }
        
        // Update avatar classes
        const circle = document.getElementById('circle');
        if (circle) {
            circle.classList.add('avatar-active', 'avatar-static');
            circle.classList.remove('avatar-animated');
        }
    }

    setFrameCallback(callback) {
        // Simple implementation - just call callback when video starts/stops
        this.frameCallback = callback;
    }

    // Simple video cycling when audio is detected
    processAudio(audioData) {
        if (!this.isPlaying && audioData && audioData.length > 0) {
            // Check if there's significant audio activity
            const avgVolume = audioData.reduce((sum, val) => sum + Math.abs(val), 0) / audioData.length;
            if (avgVolume > 0.01) { // Threshold for detecting speech
                this.startTalking();
                
                // Stop after a short time if no more audio
                setTimeout(() => {
                    if (this.isPlaying) {
                        this.stopTalking();
                    }
                }, 3000);
            }
        }
    }
}

module.exports = SimpleVideoAvatar;