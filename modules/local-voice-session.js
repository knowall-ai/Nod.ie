/** Push-to-talk local voice session. No microphone or model work while idle. */
class LocalVoiceSession {
    constructor(renderer) { this.renderer = renderer; this.state = 'idle'; this.generation = 0; }
    async initialize() {
        const health = await window.nodie.voiceHealth();
        this.renderer.state.isLoading = false;
        this.renderer.state.isMuted = true;
        this.renderer.state.isConnected = health.ready;
        this.renderer.updateWSStatus(health.ready ? 'Local voice ready' : 'Unavailable');
        this.status(health.ready ? 'Click to speak' : `Unavailable: ${health.unavailable.join(', ')}`);
    }
    status(text) {
        this.renderer.setStatus(this.state === 'processing' ? 'thinking' : 'idle');
        const status = document.getElementById('status-text');
        if (status) { status.textContent = text; status.style.display = 'block'; }
    }
    async toggle() {
        if (this.state === 'starting') { this.cancel(); return; }
        if (this.state === 'recording') { this.finish(); return; }
        if (this.state === 'processing' || this.state === 'speaking') { this.cancel(); this.status('Cancelled. Click to speak'); return; }
        const generation = ++this.generation;
        this.state = 'starting'; this.status('Opening microphone…');
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, channelCount: 1 }, video: false });
            if (generation !== this.generation) { stream.getTracks().forEach(t => t.stop()); return; }
            this.stream = stream;
            this.context = new AudioContext();
            this.source = this.context.createMediaStreamSource(stream);
            this.analyser = this.context.createAnalyser(); this.source.connect(this.analyser);
            this.renderer.state.analyser = this.analyser;
            const mimeType = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus'].find(type => MediaRecorder.isTypeSupported(type));
            if (!mimeType) throw new Error('No supported recording format');
            const chunks = []; let bytes = 0;
            this.recorder = new MediaRecorder(stream, { mimeType });
            this.recorder.ondataavailable = event => { bytes += event.data.size; if (bytes > 5 * 1024 * 1024) { this.cancel(); this.status('Recording too long. Click to try again.'); } else if (event.data.size) chunks.push(event.data); };
            this.recorder.onerror = () => { this.cancel(); this.status('Recording failed. Click to try again.'); };
            this.recorder.onstop = () => { if (generation !== this.generation) return; this.releaseMicrophone(); this.send(chunks, generation); };
            this.recorder.start(250);
            this.state = 'recording'; this.renderer.state.isMuted = false; this.status('Listening — click to send');
            this.limitTimer = setTimeout(() => this.finish(), 30000);
        } catch (error) { this.cancel(); this.status(error.message); }
    }
    finish() { clearTimeout(this.limitTimer); if (this.recorder?.state === 'recording') this.recorder.stop(); }
    releaseMicrophone() {
        this.stream?.getTracks().forEach(t => t.stop()); this.stream = null;
        this.source?.disconnect(); this.source = null;
        this.context?.close().catch(() => {}); this.context = null;
        this.renderer.state.analyser = null; this.renderer.state.isMuted = true;
    }
    async send(chunks, generation) {
        this.state = 'processing'; this.status('Thinking… click to cancel');
        try {
            const audio = new Uint8Array(await new Blob(chunks).arrayBuffer());
            const result = await window.nodie.voiceTurn(audio);
            if (generation !== this.generation) return;
            this.state = 'speaking';
            this.status(result.memory === 'unavailable' ? 'Speaking (memory unavailable)' : 'Speaking — click to stop');
            this.audioUrl = URL.createObjectURL(new Blob([result.audio], { type: 'audio/wav' }));
            this.player = new Audio(this.audioUrl);
            this.player.onended = () => { this.releasePlayback(); this.state = 'idle'; this.status('Click to speak'); };
            this.player.onerror = () => { this.releasePlayback(); this.state = 'idle'; this.status('Playback failed. Click to try again.'); };
            await this.player.play();
        } catch (error) { if (generation === this.generation) { this.releasePlayback(); this.state = 'idle'; this.status(error.message); } }
    }
    releasePlayback() { this.player?.pause(); this.player = null; if (this.audioUrl) URL.revokeObjectURL(this.audioUrl); this.audioUrl = null; }
    cancel() {
        ++this.generation; clearTimeout(this.limitTimer);
        if (this.recorder?.state === 'recording') this.recorder.stop();
        this.recorder = null; this.releaseMicrophone(); this.releasePlayback();
        window.nodie.voiceCancel().catch(() => {}); this.state = 'idle';
    }
}
window.LocalVoiceSession = LocalVoiceSession;
