/** Lightweight local energy endpointing; no additional model or idle microphone. */
class EndOfSpeech {
    constructor(startedAt) {
        this.startedAt = startedAt;
        this.previousAt = startedAt;
        this.voiceMs = 0;
        this.heardSpeech = false;
        this.lastVoiceAt = startedAt;
        this.noiseFloor = 0.003;
    }
    observe(rms, now) {
        const elapsed = Math.max(0, Math.min(now - this.previousAt, 100));
        this.previousAt = now;
        const voiced = Number.isFinite(rms) && rms >= Math.max(0.012, this.noiseFloor * 3);
        if (voiced) {
            this.voiceMs += elapsed;
            this.lastVoiceAt = now;
            if (this.voiceMs >= 250) this.heardSpeech = true;
        } else {
            if (!this.heardSpeech) this.voiceMs = 0;
            if (Number.isFinite(rms) && rms >= 0) this.noiseFloor += (Math.min(rms, 0.01) - this.noiseFloor) * 0.02;
        }
        if (this.heardSpeech && now - this.lastVoiceAt >= 900) return 'finished';
        if (!this.heardSpeech && now - this.startedAt >= 10000) return 'no-speech';
        return null;
    }
}
if (typeof module !== 'undefined') module.exports = { EndOfSpeech };
if (typeof window !== 'undefined') window.EndOfSpeech = EndOfSpeech;
