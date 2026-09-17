/** Visible device controls. Camera stays off until a vision pipeline exists. */
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
            if (voice && ['processing', 'speaking'].includes(voice.state)) voice.cancel();
            renderer.toggleMute();
            this.update();
        });
        this.speaker?.addEventListener('click', () => this.setSpeakerMuted(!renderer.state.speakerMuted));
        this.camera?.addEventListener('click', () => renderer.showNotification('Camera is off. Vision is not connected yet.', 'info'));
        this.update();
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
        if (controls.microphoneEnabled === false) this.renderer.localVoice?.releaseMicrophone();
        if (Object.hasOwn(controls, 'speakerEnabled')) this.setSpeakerMuted(!controls.speakerEnabled);
        this.update();
    }
    update() {
        const state = this.renderer.state;
        const local = this.renderer.localVoice;
        const micOn = local ? local.state === 'recording' && !state.isMuted : Boolean(state.audioCapture && !state.isMuted);
        if (this.mic) {
            this.mic.disabled = state.isLoading;
            this.mic.setAttribute('aria-pressed', String(micOn));
            this.mic.dataset.on = String(micOn);
            this.mic.setAttribute('aria-busy', String(local?.state === 'starting'));
            this.mic.title = local?.state === 'starting' ? 'Opening microphone' : micOn ? 'Microphone on' : 'Microphone off';
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
