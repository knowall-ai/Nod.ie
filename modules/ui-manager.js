/**
 * UI state and visual feedback manager
 */

class UIManager {
    constructor() {
        this.isMuted = false;
        this._initialized = false;
    }
    
    _ensureInitialized() {
        if (!this._initialized) {
            this.circle = document.getElementById('circle');
            this.notification = document.getElementById('notification');
            this.waveform = document.getElementById('waveform');
            this.audioRing = document.getElementById('audioRing');
            this._initialized = true;
        }
    }

    setStatus(status) {
        console.log(`🎨 UI Status change: ${status} (muted: ${this.isMuted})`);
        this._ensureInitialized();
        
        if (!this.circle) {
            console.warn('UI not ready, skipping status update');
            return;
        }
        
        // Clear all classes first
        this.circle.className = '';
        
        // Add appropriate class
        if (this.isMuted) {
            this.circle.classList.add('muted');
        } else if (status === 'thinking') {
            this.circle.classList.add('thinking');
        } else if (status === 'listening') {
            this.circle.classList.add('listening');
        } else {
            this.circle.classList.add('idle');
        }
        
        this.circle.style.cursor = 'pointer';
    }

    showNotification(text, type = 'info') {
        this._ensureInitialized();
        
        if (!this.notification) {
            console.warn('Notification element not ready');
            return;
        }
        
        this.notification.textContent = text;
        this.notification.style.display = 'block';
        this.notification.className = `notification ${type}`;
        
        clearTimeout(this.notification.hideTimeout);
        this.notification.hideTimeout = setTimeout(() => {
            this.notification.style.display = 'none';
        }, 5000);
    }

    setMuted(muted) {
        this.isMuted = muted;
        this.setStatus('idle');
        
        if (muted) {
            this.showNotification('Microphone muted', 'info');
        } else {
            this.showNotification('Microphone unmuted', 'success');
        }
    }

    showAudioActivity() {
        this.audioRing.classList.add('active');
        setTimeout(() => this.audioRing.classList.remove('active'), 500);
    }

    visualizeAudio(analyser) {
        const canvas = this.waveform;
        const ctx = canvas.getContext('2d');
        
        // Set canvas size to match the full circle
        canvas.width = 250;
        canvas.height = 250;
        
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const radius = 115; // Just inside the 250px circle
        
        let visualizationActive = true;
        
        const draw = () => {
            if (!visualizationActive) {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                return;
            }
            
            requestAnimationFrame(draw);
            
            if (!analyser) {
                this.showErrorVisualization();
                visualizationActive = false;
                return;
            }
            
            // Check if analyser is still valid
            let bufferLength, dataArray;
            try {
                bufferLength = analyser.frequencyBinCount;
                dataArray = new Uint8Array(bufferLength);
                analyser.getByteFrequencyData(dataArray);
            } catch (error) {
                console.error('❌ Analyser error:', error);
                this.showErrorVisualization();
                visualizationActive = false;
                return;
            }
            
            // Calculate average volume
            let sum = 0;
            for (let i = 0; i < bufferLength; i++) {
                sum += dataArray[i];
            }
            const average = sum / bufferLength;
            
            // Clear canvas
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            // Draw circular waveform with rotating starting position
            // Add glow effect
            ctx.shadowColor = 'rgba(247, 147, 26, 0.8)'; // Bitcoin orange glow
            ctx.shadowBlur = 15;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
            
            ctx.strokeStyle = 'rgba(247, 147, 26, 0.9)'; // Bitcoin orange
            ctx.lineWidth = 8; // Much thicker line
            
            // Calculate rotating offset based on time (10 second rotation)
            const rotationOffset = (Date.now() % 10000) / 10000 * 360;
            
            // Draw full circle waveform
            ctx.beginPath();
            let firstPoint = true;
            
            for (let i = 0; i < 360; i += 3) {  // More points for smoother waveform
                const angleWithOffset = ((i + rotationOffset) % 360) * Math.PI / 180;
                const index = Math.floor((i / 360) * bufferLength);
                const amplitude = dataArray[index] / 256;
                const r = radius + amplitude * 20;
                
                const x = centerX + r * Math.cos(angleWithOffset);
                const y = centerY + r * Math.sin(angleWithOffset);
                
                if (firstPoint) {
                    ctx.moveTo(x, y);
                    firstPoint = false;
                } else {
                    ctx.lineTo(x, y);
                }
            }
            
            ctx.closePath();
            ctx.stroke();
            
            // Optional: Add a dot to show the current position
            ctx.fillStyle = 'rgba(247, 147, 26, 1)'; // Bitcoin orange
            ctx.beginPath();
            const dotAngle = rotationOffset * Math.PI / 180;
            const dotX = centerX + radius * Math.cos(dotAngle);
            const dotY = centerY + radius * Math.sin(dotAngle);
            ctx.arc(dotX, dotY, 5, 0, 2 * Math.PI);
            ctx.fill();
            
            // Show audio ring when there's significant audio
            if (average > 30) {
                this.audioRing.classList.add('active');
            } else {
                this.audioRing.classList.remove('active');
            }
        };
        
        draw();
        
        // Return stop function
        return () => {
            visualizationActive = false;
            this.audioRing.classList.remove('active');
        };
    }
    
    showErrorVisualization() {
        const canvas = this.waveform;
        const ctx = canvas.getContext('2d');
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const radius = 40;
        
        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Draw red circle to indicate error
        ctx.strokeStyle = 'rgba(255, 0, 0, 0.8)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
        ctx.stroke();
        
        // Add blinking effect
        let blink = true;
        const blinkInterval = setInterval(() => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            if (blink) {
                ctx.strokeStyle = 'rgba(255, 0, 0, 0.8)';
                ctx.beginPath();
                ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
                ctx.stroke();
            }
            blink = !blink;
        }, 500);
        
        // Stop blinking after 5 seconds
        setTimeout(() => clearInterval(blinkInterval), 5000);
    }
}

module.exports = UIManager;