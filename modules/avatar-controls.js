/** Visible device controls, including an opt-in camera preview. */
class AvatarControls {
    static speakerStorageKey = 'nodie.speaker-muted';
    constructor(renderer) {
        this.renderer = renderer;
        this.mic = document.getElementById('control-mic');
        this.speaker = document.getElementById('control-speaker');
        this.camera = document.getElementById('control-camera');
        this.settings = document.getElementById('control-settings');
        if (this.settings && typeof window.nodie?.openSettings === 'function') {
            this.settings.hidden = false;
            this.settings.addEventListener('click', () => window.nodie.openSettings().catch(() => renderer.showNotification('Could not open Settings.', 'error')));
        }
        try { renderer.state.speakerMuted = localStorage.getItem(AvatarControls.speakerStorageKey) === 'true'; } catch { renderer.state.speakerMuted = false; }
        this.mic?.addEventListener('click', () => {
            if (renderer.state.isLoading) return;
            const voice = renderer.localVoice;
            if (voice) voice.toggleListening();
            else renderer.toggleMute();
            this.update();
        });
        this.speaker?.addEventListener('click', () => this.setSpeakerMuted(!renderer.state.speakerMuted));
        this.preview = this.camera?.querySelector('video');
        if (window.VisionCamera && this.preview) {
            this.cameraSource = new window.VisionCamera({
                preview: this.preview,
                onFrame: frame => { this.latestFrame = frame; },
                onError: message => renderer.showNotification(message, 'error'),
                onState: () => { if (!this.cameraSource?.active) this.latestFrame = null; this.updateCamera(); }
            });
            window.addEventListener('pagehide', () => this.cameraSource.stop());
        }
        this.camera?.addEventListener('click', () => {
            if (!this.cameraSource) return renderer.showNotification('Camera is off. Preview is unavailable.', 'info');
            if (this.cameraSource.active || this.cameraSource.starting) this.cameraSource.stop();
            else void this.cameraSource.start();
        });
        this.update();
    }
    updateCamera() {
        if (!this.camera || !this.preview) return;
        const active = Boolean(this.cameraSource?.active), starting = Boolean(this.cameraSource?.starting);
        this.camera.dataset.on = String(active);
        this.camera.setAttribute('aria-pressed', String(active));
        this.camera.setAttribute('aria-busy', String(starting));
        this.camera.setAttribute('aria-label', active ? 'Turn camera preview off' : starting ? 'Cancel opening camera' : 'Turn camera preview on');
        this.camera.title = active ? 'Camera on — preview only; scene understanding is not connected yet' : starting ? 'Opening camera — click to cancel' : 'Camera off';
        this.preview.hidden = !active;
        this.camera.querySelector('img').hidden = active;
    }
    setSpeakerMuted(muted) {
        if (typeof muted !== 'boolean') throw new Error('Invalid speaker state');
        const renderer = this.renderer;
        renderer.state.speakerMuted = muted;
        if (renderer.localVoice?.player) renderer.localVoice.player.muted = muted;
        renderer.state.audioPlayback?.setMuted(muted);
        try { localStorage.setItem(AvatarControls.speakerStorageKey, String(muted)); } catch { /* Still works without persistence. */ }
        this.update();
    }
    applyVoiceControls(controls) {
        if (!controls || typeof controls !== 'object' || Array.isArray(controls) || Object.keys(controls).some(key => !['microphoneEnabled', 'speakerEnabled'].includes(key)) || (Object.hasOwn(controls, 'microphoneEnabled') && controls.microphoneEnabled !== false) || (Object.hasOwn(controls, 'speakerEnabled') && typeof controls.speakerEnabled !== 'boolean')) throw new Error('Invalid voice controls');
        if (controls.microphoneEnabled === false && this.renderer.localVoice) {
            this.renderer.localVoice.listeningEnabled = false;
            this.renderer.localVoice.releaseMicrophone();
        }
        if (Object.hasOwn(controls, 'speakerEnabled')) this.setSpeakerMuted(!controls.speakerEnabled);
        this.update();
    }
    update() {
        this.updateCamera();
        const state = this.renderer.state;
        const local = this.renderer.localVoice;
        const micOn = local ? Boolean(local.listeningEnabled) : Boolean(state.audioCapture && !state.isMuted);
        if (this.mic) {
            this.mic.disabled = state.isLoading;
            this.mic.setAttribute('aria-pressed', String(micOn));
            this.mic.dataset.on = String(micOn);
            this.mic.setAttribute('aria-busy', String(local?.state === 'starting'));
            this.mic.title = local?.state === 'starting' ? 'Opening microphone' : micOn ? (local && local.state !== 'recording' ? 'Listening enabled; microphone paused during reply' : 'Listening enabled') : 'Microphone off';
            this.mic.querySelector('img').src = this.icon(micOn ? 'mic' : 'mic-off');
        }
        if (this.speaker) {
            const on = !state.speakerMuted;
            this.speaker.setAttribute('aria-pressed', String(on));
            this.speaker.dataset.on = String(on);
            this.speaker.title = on ? 'Speaker on' : 'Speaker off';
            this.speaker.querySelector('img').src = this.icon(on ? 'volume-2' : 'volume-x');
        }
    }
    icon(name) { return `${window.location.pathname.includes('/tests/') ? '../' : './'}assets/icons/lucide/${name}.svg`; }
}
window.AvatarControls = AvatarControls;
