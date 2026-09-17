/** Visible device controls. Camera stays off until a vision pipeline exists. */
class AvatarControls {
    static speakerStorageKey = 'nodie.speaker-muted';
    constructor(renderer) {
        this.renderer = renderer;
        this.mic = document.getElementById('control-mic');
        this.speaker = document.getElementById('control-speaker');
        this.camera = document.getElementById('control-camera');
        try { renderer.state.speakerMuted = localStorage.getItem(AvatarControls.speakerStorageKey) === 'true'; } catch { renderer.state.speakerMuted = false; }
        this.mic?.addEventListener('click', () => {
            if (renderer.state.isLoading) return;
            const voice = renderer.localVoice;
            if (voice && ['processing', 'speaking'].includes(voice.state)) voice.cancel();
            renderer.toggleMute();
            this.update();
        });
        this.speaker?.addEventListener('click', () => {
            renderer.state.speakerMuted = !renderer.state.speakerMuted;
            if (renderer.localVoice?.player) renderer.localVoice.player.muted = renderer.state.speakerMuted;
            renderer.state.audioPlayback?.setMuted(renderer.state.speakerMuted);
            try { localStorage.setItem(AvatarControls.speakerStorageKey, String(renderer.state.speakerMuted)); } catch { /* Still works without persistence. */ }
            this.update();
        });
        this.camera?.addEventListener('click', () => renderer.showNotification('Camera is off. Vision is not connected yet.', 'info'));
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
