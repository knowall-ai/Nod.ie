/**
 * Simple static video player for MuseTalk fallback
 * Shows pre-recorded video when audio is playing
 */

class MuseTalkStaticVideo {
    constructor() {
        this.videoElement = null;
        this.isPlaying = false;
        this.videoFiles = [
            'nodie-video-01.mp4',
            'nodie-video-02.mp4', 
            'nodie-video-03.mp4'
        ];
        this.currentVideoIndex = 0;
    }

    initialize() {
        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.initialize());
            return false;
        }
        
        // Get or create video element
        this.videoElement = document.getElementById('avatar-video');
        if (!this.videoElement) {
            console.error('Video element not found');
            return false;
        }

        try {
            // Set initial video
            this.videoElement.src = `./assets/avatars/${this.videoFiles[0]}`;
            this.videoElement.loop = true;
            this.videoElement.muted = true;
            
            // Preload video
            this.videoElement.load();
            
            console.log('🎥 Static video initialized');
            return true;
        } catch (error) {
            console.error('Failed to initialize static video:', error);
            return false;
        }
    }

    async playVideo() {
        if (!this.videoElement || this.isPlaying) return;
        
        try {
            this.isPlaying = true;
            
            // Show video element
            const imageEl = document.getElementById('avatar-image');
            const circle = document.getElementById('circle');
            
            if (imageEl) imageEl.style.display = 'none';
            if (this.videoElement) this.videoElement.style.display = 'block';
            if (circle) {
                circle.classList.add('avatar-animated');
                circle.classList.remove('avatar-static');
            }
            
            // Play video
            await this.videoElement.play();
            console.log('🎥 Static video playing');
            
        } catch (error) {
            console.error('Failed to play video:', error);
            this.isPlaying = false;
        }
    }

    stopVideo() {
        if (!this.videoElement) return;
        
        this.isPlaying = false;
        this.videoElement.pause();
        this.videoElement.currentTime = 0;
        
        // Hide video, show image
        const imageEl = document.getElementById('avatar-image');
        const circle = document.getElementById('circle');
        
        if (this.videoElement) this.videoElement.style.display = 'none';
        if (imageEl) imageEl.style.display = 'block';
        if (circle) {
            circle.classList.add('avatar-static');
            circle.classList.remove('avatar-animated');
        }
        
        console.log('🎥 Static video stopped');
    }

    switchVideo(index) {
        if (index >= 0 && index < this.videoFiles.length) {
            this.currentVideoIndex = index;
            this.videoElement.src = `./assets/avatars/${this.videoFiles[index]}`;
            this.videoElement.load();
        }
    }

    // Called when audio starts playing
    onAudioStart() {
        this.playVideo();
    }

    // Called when audio stops
    onAudioStop() {
        // Keep playing for a bit then stop
        setTimeout(() => {
            if (!this.isPlaying) return;
            this.stopVideo();
        }, 2000);
    }
}

module.exports = MuseTalkStaticVideo;