/** Opt-in continuous conversation; capture pauses during replies and stops on cancellation. */
class LocalVoiceSession {
    constructor(renderer) { this.renderer = renderer; this.state = 'idle'; this.generation = 0; this.listeningEnabled = false; this.emptyTurns = 0; }
    async initialize() {
        const health = await window.nodie.voiceHealth();
        this.renderer.state.isLoading = false;
        this.renderer.state.isMuted = true;
        this.renderer.state.isConnected = health.ready;
        this.renderer.updateWSStatus(health.ready ? 'Local voice ready' : 'Unavailable');
        this.status(health.ready ? '' : `Unavailable: ${health.unavailable.join(', ')}`);
    }
    status(text) {
        this.renderer.setStatus(this.state === 'processing' ? 'thinking' : 'idle');
        const status = document.getElementById('status-text');
        if (status) { status.textContent = text; status.style.display = text ? 'block' : 'none'; }
    }
    async toggle() {
        if (this.state === 'starting') { this.cancel(); return; }
        if (this.state === 'recording') { this.finish(); return; }
        if (this.state === 'processing' || this.state === 'speaking') { this.cancel(); this.status(''); return; }
        this.listeningEnabled = true;
        const generation = ++this.generation;
        this.state = 'starting'; this.status('');
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
            this.recorder.ondataavailable = event => { bytes += event.data.size; if (bytes > 5 * 1024 * 1024) { this.cancel(); this.status('Recording limit reached'); } else if (event.data.size) chunks.push(event.data); };
            this.recorder.onerror = () => { this.cancel(); this.status('Recording failed'); };
            this.recorder.onstop = () => { if (generation !== this.generation) return; this.releaseMicrophone(); this.send(chunks, generation); };
            this.recorder.start(250);
            this.state = 'recording'; this.renderer.state.isMuted = false; this.status('');
            this.startEndpointDetection(generation);
            this.limitTimer = setTimeout(() => this.finish(), 30000);
        } catch (error) { this.cancel(); this.status(error.message); }
    }
    toggleListening() {
        if (this.listeningEnabled) { this.cancel(); this.status(''); }
        else { this.emptyTurns = 0; return this.toggle(); }
    }
    resumeListening(delay = 250) {
        clearTimeout(this.resumeTimer);
        if (!this.listeningEnabled) return;
        const generation = this.generation;
        this.resumeTimer = setTimeout(() => {
            if (this.listeningEnabled && generation === this.generation && this.state === 'idle') this.toggle();
        }, delay);
    }
    resetQuietRecording() {
        const enabled = this.listeningEnabled;
        this.cancel();
        this.listeningEnabled = enabled;
        this.status('');
        this.resumeListening();
    }
    startEndpointDetection(generation) {
        const detector = new window.EndOfSpeech(performance.now());
        const samples = new Float32Array(this.analyser.fftSize);
        this.endpointTimer = setInterval(() => {
            if (generation !== this.generation || this.state !== 'recording') return;
            this.analyser.getFloatTimeDomainData(samples);
            let energy = 0;
            for (const value of samples) energy += value * value;
            const outcome = detector.observe(Math.sqrt(energy / samples.length), performance.now());
            if (outcome === 'finished') this.finish();
            else if (outcome === 'no-speech') this.resetQuietRecording();
        }, 50);
    }
    finish() { clearInterval(this.endpointTimer); this.endpointTimer = null; clearTimeout(this.limitTimer); if (this.recorder?.state === 'recording') this.recorder.stop(); }
    releaseMicrophone() {
        clearInterval(this.endpointTimer); this.endpointTimer = null;
        this.stream?.getTracks().forEach(t => t.stop()); this.stream = null;
        this.source?.disconnect(); this.source = null;
        this.context?.close().catch(() => {}); this.context = null;
        this.renderer.state.analyser = null; this.renderer.state.isMuted = true;
    }
    async send(chunks, generation) {
        this.state = 'processing'; this.status('');
        try {
            const audio = new Uint8Array(await new Blob(chunks).arrayBuffer());
            if (generation !== this.generation) return;
            const result = await window.nodie.voiceTurn(audio);
            if (generation !== this.generation) return;
            this.emptyTurns = 0;
            if (result.controls) this.renderer.controls.applyVoiceControls(result.controls);
            if (result.silent) { this.state = 'idle'; this.status(''); this.resumeListening(); return; }
            await this.playReply(result, generation);
        } catch (error) {
            if (generation === this.generation) {
                this.releasePlayback(); this.state = 'idle';
                if (error.code === 'no-speech' && ++this.emptyTurns < 3 && this.listeningEnabled) { this.status(''); this.resumeListening(1000); }
                else { this.listeningEnabled = false; this.status(error.message); }
            }
        }
    }
    async playReply(result, generation, useVideo = true) {
        if (generation !== this.generation) return;
        this.state = 'speaking';
        const manager = this.renderer.state.avatarManager;
        const video = useVideo && result.video && manager?.isEnabled() ? document.getElementById('avatar-video') : null;
        this.status(result.lipSync === 'unavailable' ? 'Lip sync unavailable' : result.memory === 'unavailable' ? 'Memory unavailable' : '');
        this.audioUrl = URL.createObjectURL(new Blob([video ? result.video : result.audio], { type: video ? 'video/mp4' : 'audio/wav' }));
        const player = video || new Audio();
        this.player = player;
        player.loop = false; player.muted = Boolean(this.renderer.state.speakerMuted); player.src = this.audioUrl;
        manager?.setSpeechVideo(Boolean(video));
        player.onended = () => {
            if (this.player !== player) return;
            this.releasePlayback(); this.state = 'idle'; this.status(''); this.resumeListening();
        };
        const failed = () => {
            if (this.player !== player || generation !== this.generation) return;
            this.releasePlayback();
            if (video) {
                this.playReply({ ...result, lipSync: 'unavailable' }, generation, false).catch(() => {
                    if (generation === this.generation) { this.releasePlayback(); this.state = 'idle'; this.listeningEnabled = false; this.status('Playback failed'); }
                });
            } else { this.state = 'idle'; this.listeningEnabled = false; this.status('Playback failed'); }
        };
        player.onerror = failed;
        try { await player.play(); } catch { failed(); }
    }
    releasePlayback() {
        if (this.player) {
            this.player.onended = null; this.player.onerror = null;
            this.player.pause(); this.player.removeAttribute('src'); this.player.load(); this.player = null;
        }
        this.renderer.state.avatarManager?.setSpeechVideo(false);
        if (this.audioUrl) URL.revokeObjectURL(this.audioUrl);
        this.audioUrl = null;
    }
    cancel() {
        this.listeningEnabled = false; clearTimeout(this.resumeTimer); this.resumeTimer = null;
        ++this.generation; clearTimeout(this.limitTimer);
        if (this.recorder?.state === 'recording') this.recorder.stop();
        this.recorder = null; this.releaseMicrophone(); this.releasePlayback();
        window.nodie.voiceCancel().catch(() => {}); this.state = 'idle';
        this.renderer.controls?.update();
    }
}
window.LocalVoiceSession = LocalVoiceSession;
