/** Bounded text-only transcript of received STT and spoken-text events. */
class StreamingTranscript {
    constructor(api, onError = () => {}) {
        this.api = api; this.onError = onError; this.queue = Promise.resolve(); this.revision = 0;
    }
    async start() {
        await this.finish();
        try { this.reset(await this.api.transcriptSession()); }
        catch { this.epoch = null; this.onError(); }
    }
    reset({ epoch }) {
        clearTimeout(this.timer); this.turn = null; this.epoch = epoch; ++this.revision;
    }
    event(data) {
        if (['response.created', 'response.audio.done', 'response.done', 'unmute.interrupted_by_vad'].includes(data.type)) this.finish();
        const role = data.type === 'conversation.item.input_audio_transcription.delta' ? 'user'
            : data.type === 'response.text.delta' ? 'assistant' : null;
        // Ignore internal LLM-ready events: they may never have been spoken.
        if (!role || typeof data.delta !== 'string' || !data.delta || !this.epoch) return;
        if (this.turn?.role !== role) this.finish();
        if (!this.turn && !data.delta.trim()) return;
        if (!this.turn) this.turn = { id: crypto.randomUUID(), role, content: '' };
        this.turn.content = (this.turn.content + data.delta).slice(0, 2000);
        if (!this.timer) this.timer = setTimeout(() => { this.timer = null; this.save(); }, 500);
    }
    save() {
        if (!this.turn || !this.epoch) return this.queue;
        const turn = { ...this.turn }, epoch = this.epoch, revision = this.revision;
        this.queue = this.queue.then(async () => {
            if (revision !== this.revision) return;
            const result = await this.api.saveTranscript(epoch, turn);
            if (!result.saved && revision === this.revision) this.reset({ epoch: result.epoch });
        }).catch(() => { if (revision === this.revision) this.onError(); });
        return this.queue;
    }
    finish() {
        clearTimeout(this.timer); this.timer = null;
        const pending = this.save(); this.turn = null; return pending;
    }
}
if (typeof window !== 'undefined') window.StreamingTranscript = StreamingTranscript;
if (typeof module !== 'undefined') module.exports = StreamingTranscript;
