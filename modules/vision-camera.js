/** Opt-in camera source. Only selected JPEGs reach the supplied analysis callback. */
class VisionCamera {
    constructor({ onFrame, canAnalyse = () => true, onError = () => {}, onState = () => {}, preview = null, mediaDevices = navigator.mediaDevices, document = globalThis.document, clock = () => performance.now(), selector = new window.VisionFrameSelector() } = {}) {
        if (typeof onFrame !== 'function') throw new Error('An analysis callback is required');
        Object.assign(this, { onFrame, canAnalyse, onError, onState, preview, mediaDevices, document, clock, selector });
        this.generation = 0; this.active = false; this.starting = false;
    }
    async start() {
        if (this.active || this.starting) return;
        this.starting = true; this.onState();
        const generation = ++this.generation;
        let stream;
        try {
            stream = await this.mediaDevices.getUserMedia({ audio: false, video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 10, max: 10 } } });
            if (generation !== this.generation) { stream.getTracks().forEach(t => t.stop()); return; }
            this.stream = stream;
            this.video = this.preview || this.document.createElement('video');
            this.video.muted = true; this.video.playsInline = true; this.video.srcObject = stream;
            this.small = this.document.createElement('canvas'); this.small.width = 64; this.small.height = 48;
            this.full = this.document.createElement('canvas');
            this.smallContext = this.small.getContext('2d', { willReadFrequently: true });
            this.fullContext = this.full.getContext('2d');
            this.controller = new AbortController(); this.selector.reset();
            for (const track of stream.getVideoTracks()) track.addEventListener('ended', () => { if (generation === this.generation) this.stop(); }, { once: true });
            await this.video.play();
            if (generation !== this.generation) return;
            this.active = true; this.starting = false; this.onState();
            this.timer = setInterval(() => { void this.tick(); }, 250);
        } catch {
            stream?.getTracks().forEach(t => t.stop());
            if (generation === this.generation) { this.stop(); this.onError('Camera could not be opened.'); }
        } finally { if (generation === this.generation) this.starting = false; }
    }
    requestFrame() {
        if (!this.active) return false; // Explicit requests never turn on an off camera.
        this.requested = true; void this.tick(); return true;
    }
    async tick() {
        if (!this.active || this.busy || !this.canAnalyse() || this.video.readyState < 2) return;
        const token = this.busy = {}, generation = this.generation;
        try {
            this.smallContext.drawImage(this.video, 0, 0, 64, 48);
            const choice = this.selector.select(this.smallContext.getImageData(0, 0, 64, 48).data, this.clock(), Boolean(this.requested));
            if (!choice) return;
            this.requested = false;
            const scale = Math.min(1, 768 / this.video.videoWidth, 576 / this.video.videoHeight);
            if (!Number.isFinite(scale) || scale <= 0) return;
            this.full.width = Math.max(1, Math.round(this.video.videoWidth * scale));
            this.full.height = Math.max(1, Math.round(this.video.videoHeight * scale));
            this.fullContext.drawImage(this.video, 0, 0, this.full.width, this.full.height);
            const blob = await new Promise(resolve => this.full.toBlob(resolve, 'image/jpeg', .85));
            if (!blob || blob.size > 512000) throw new Error('Frame could not be encoded');
            if (generation !== this.generation || !this.active) return;
            const result = await this.onFrame({ image: blob, reason: choice.reason, capturedAt: new Date().toISOString(), signal: this.controller.signal });
            if (result?.retry && generation === this.generation) this.selector.reset();
        } catch {
            if (generation === this.generation && this.active) this.onError('Selected camera frame could not be analysed.');
        } finally { if (this.busy === token) this.busy = null; }
    }
    stop() {
        ++this.generation; this.active = this.starting = this.requested = false;
        clearInterval(this.timer); this.controller?.abort();
        this.stream?.getTracks().forEach(t => t.stop());
        if (this.video) { this.video.pause(); this.video.srcObject = null; }
        for (const canvas of [this.small, this.full]) if (canvas) canvas.width = canvas.height = 0;
        this.stream = this.video = this.small = this.full = this.smallContext = this.fullContext = this.controller = this.busy = null;
        this.selector.reset(); this.onState();
    }
}
if (typeof window !== 'undefined') window.VisionCamera = VisionCamera;
if (typeof module !== 'undefined') module.exports = VisionCamera;
