/** Bounded text-only transcript of received STT and spoken-text events. */
class StreamingTranscript {
    constructor(api, onError = () => {}, { wordDeltas = false } = {}) {
        this.wordDeltas = wordDeltas;this.recentTurns=[];
        this.api = api; this.onError = onError; this.queue = Promise.resolve(); this.revision = 0;
    }
    async start() {
        await this.finish();
        try { this.reset(await this.api.transcriptSession()); }
        catch { this.epoch = null; this.onError(); }
    }
    reset({ epoch }) {
        clearTimeout(this.timer); this.turn = null; this.recentTurns=[]; this.epoch = epoch; ++this.revision;
    }
    attribute(words){
        if(!Array.isArray(words))return;
        for(const turn of this.recentTurns){let changed=false;for(const word of turn.words||[]){const match=words.find(w=>w.start===word.start&&w.text===word.text);if(!match||!Number.isFinite(match.end)||match.end<word.start||match.end-word.start>5)continue;word.end=match.end;word.speaker=match.name||null;word.attribution=match.attribution==='possible-match'?'possible-match':'unattributed';changed=true;}if(changed)this.save(turn);}
    }
    event(data) {
        if (['response.created', 'response.audio.done', 'response.done', 'unmute.interrupted_by_vad'].includes(data.type)) this.finish();
        const role = data.type === 'conversation.item.input_audio_transcription.delta' ? 'user'
            : data.type === 'response.text.delta' ? 'assistant' : null;
        // Ignore internal LLM-ready events: they may never have been spoken.
        if (!role || typeof data.delta !== 'string' || !data.delta || !this.epoch) return;
        if (this.turn?.role !== role) this.finish();
        if (!this.turn && !data.delta.trim()) return;
        if(!this.turn){this.turn={id:crypto.randomUUID(),role,content:''};this.recentTurns.push(this.turn);this.recentTurns=this.recentTurns.slice(-12);}
        if(role==='user'&&Number.isFinite(data.start_time)&&data.start_time>=0){this.turn.words ||= [];if(this.turn.words.length<100)this.turn.words.push({text:data.delta.slice(0,200),start:data.start_time,attribution:'unattributed'});}
        // Unmute emits words; generic streams emit literal fragments.
        // Match upstream Chatbot.add_chat_message_delta only for word events.
        const separator = this.wordDeltas && /\S$/.test(this.turn.content) && /^\S/.test(data.delta) ? ' ' : '';
        this.turn.content = (this.turn.content + separator + data.delta).slice(0, 2000);
        if (!this.timer) this.timer = setTimeout(() => { this.timer = null; this.save(); }, 500);
    }
    save(target=this.turn) {
        if (!target || !this.epoch) return this.queue;
        const turn = { ...target, ...(target.words?{words:target.words.map(w=>({...w}))}:{}) }, epoch = this.epoch, revision = this.revision;
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
