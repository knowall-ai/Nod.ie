/** One microphone stream shared by the encoder and analyser on both platforms. */
class AudioCaptureWeb {
    constructor(onAudioData) { this.onAudioData = onAudioData; this.generation = 0; this.isCapturing = false; this.isPaused = false; }
    start() {
        if (this.starting) return this.starting;
        if (this.isCapturing) return Promise.resolve();
        const generation = ++this.generation;
        this.starting = this.open(generation).finally(() => { this.starting = null; });
        return this.starting;
    }
    async open(generation) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: true, channelCount: 1 }, video: false });
            if (generation !== this.generation) { stream.getTracks().forEach(track => track.stop()); return; }
            this.stream = stream;
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.source = this.audioContext.createMediaStreamSource(stream);
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 2048;
            this.source.connect(this.analyser);
            const base = window.location.pathname.includes('/tests/') ? '../' : './';
            this.recorder = new window.Recorder({ sourceNode: this.source, encoderPath: base + 'encoderWorker.min.js', bufferLength: Math.round(960 * this.audioContext.sampleRate / 24000), encoderSampleRate: 24000, encoderFrameSize: 20, maxFramesPerPage: 2, numberOfChannels: 1, recordingGain: 1, resampleQuality: 3, encoderComplexity: 0, encoderApplication: 2049, streamPages: true });
            this.recorder.ondataavailable = (data) => {
                if (generation !== this.generation || this.isPaused) return;
                const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
                if (bytes.length < 6) return;
                let binary = '';
                for (const byte of bytes) binary += String.fromCharCode(byte);
                this.onAudioData?.(btoa(binary));
            };
            await this.audioContext.resume();
            if (generation !== this.generation) return;
            await this.recorder.start();
            if (generation !== this.generation) return;
            this.isCapturing = true;
        } catch (error) { if (generation === this.generation) { this.stop(); throw error; } }
    }
    stop() {
        ++this.generation;
        this.isCapturing = false;
        this.isPaused = false;
        const recorder = this.recorder;
        this.recorder = null;
        if (recorder) { recorder.ondataavailable = () => {}; try { recorder.close(); } catch {} }
        this.stream?.getTracks().forEach(track => track.stop());
        this.stream = null;
        this.source?.disconnect(); this.source = null;
        this.analyser?.disconnect(); this.analyser = null;
        if (this.audioContext && this.audioContext.state !== 'closed') this.audioContext.close().catch(() => {});
        this.audioContext = null;
    }
    setGain(gain) { this.recorder?.setRecordingGain(gain); }
    pause() { this.isPaused = true; }
    resume() { this.isPaused = false; }
    getAnalyser() { return this.analyser; }
}
if (typeof module !== 'undefined' && module.exports) module.exports = AudioCaptureWeb;
else window.AudioCaptureWeb = AudioCaptureWeb;
