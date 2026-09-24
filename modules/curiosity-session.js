/** Coordinates quiet delivery; facts and durable budgets remain in the main process. */
class CuriositySession {
    constructor(renderer, { now = () => Date.now() } = {}) {
        this.renderer = renderer; this.now = now; this.started = now(); this.lastActivity = now(); this.generation = 0;
        this.timer = setInterval(() => void this.tick(), 1000);
    }
    send(session) { this.renderer.state.wsHandler?.send({ type: 'session.update', session: { allow_recording: false, ...session } }); }
    reset() { if(this.active)void this.finish(this.active.delivered?'interrupted':'cancelled');clearTimeout(this.answerTimer);++this.generation; this.candidate = null; this.active = null; this.blockedUntilReply = false; this.started = this.now(); this.lastActivity = this.now(); this.send({ curiosity_allowed: false, curiosity_event: null }); }
    async consider(candidate, frame) {
        if (!candidate?.token || !frame || frame.capturedAt!==candidate.capturedAt || frame.signal.aborted) return;
        const generation=this.generation;
        const bytes=new Uint8Array(await frame.image.arrayBuffer());
        if(generation!==this.generation || frame.signal.aborted || bytes.length>512000)return;
        let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
        this.candidate={...candidate,scene:{status:'snapshot',capturedAt:frame.capturedAt,imageJpeg:btoa(binary)}};
    }
    reason(includePending=true) {
        const r = this.renderer;
        if (!r.state.isConnected || r.localVoice || !r.visionContext?.active) return 'camera or conversation unavailable';
        if (r.state.isMuted || r.state.speakerMuted) return 'microphone or speaker muted';
        if (r.recognition?.pending) return 'introduction confirmation open';
        if (r.isAssistantSpeaking || r.streamingLips?.sources.size || this.now() - this.lastActivity < 20000) return 'conversation active';
        if (this.now() - this.started < 60000) return 'settling after camera/session start';
        if (includePending && this.blockedUntilReply) return 'waiting for a user reply';
        return null;
    }
    async tick() {
        if(this.active && !this.active.accepted && this.now()>this.active.deadline){await this.finish('cancelled');this.blockedUntilReply=false;this.send({curiosity_allowed:false,curiosity_event:null});this.allowed=false;this.debug('Dropped: backend delivery deadline');}
        const reason = this.reason(false);
        if (reason) { if (this.allowed) this.send({ curiosity_allowed: false, curiosity_event: null }); this.allowed = false; }
        const c = this.candidate;
        if (!c || this.claiming || this.active || this.blockedUntilReply) return;
        if (this.now() - Date.parse(c.capturedAt) > 15000) { this.candidate = null; this.debug('Dropped: observation expired'); return; }
        if (reason) { if (reason !== this.lastReason) this.debug('Deferred: ' + reason); this.lastReason = reason; return; }
        const generation = this.generation; this.claiming = true; this.candidate = null;
        try {
            const result = await window.nodie.claimCuriosity(c.token);
            if (generation !== this.generation || this.reason()) {if(result?.event)await window.nodie.curiosityOutcome(result.event.token,'cancelled');return;}
            if (!result?.event) { this.debug(result?.reason || 'No eligible observation'); return; }
            this.active = { token: result.event.token, started: this.now(), deadline:Date.parse(c.capturedAt)+20000, delivered:false, accepted:false };
            this.blockedUntilReply = true; this.allowed = true;
            this.send({ curiosity_allowed: true, curiosity_event: result.event, curiosity_scene: c.scene });
            this.debug('Requested: ' + result.event.key);
        } catch { this.debug('Curiosity unavailable'); }
        finally { this.claiming = false; }
    }
    event(data) {
        if (['input_audio_buffer.speech_started','conversation.item.input_audio_transcription.delta','response.created','response.audio.delta'].includes(data.type)) this.lastActivity = this.now();
        if (data.type === 'conversation.item.input_audio_transcription.delta' && data.delta?.trim()) {
            this.blockedUntilReply = false;
            if (this.active) void this.finish(!this.active.delivered?'cancelled':this.active.done?'answered':'interrupted');
        }
        if (data.type === 'nodie.curiosity_started' && this.active?.token === data.token) {this.active.accepted=true;this.debug('Accepted: ' + data.key);}
        if (data.type === 'response.audio.delta' && this.active?.accepted) this.active.delivered = true;
        if (data.type === 'response.audio.done' && this.active?.accepted) {
            if(!this.active.delivered){void this.finish('cancelled');this.blockedUntilReply=false;return;}
            this.active.done = true;
            const token = this.active.token;
            clearTimeout(this.answerTimer);
            this.answerTimer = setTimeout(() => { if (this.active?.token === token) void this.finish('unanswered'); }, 30000);
        }
    }
    async finish(outcome) {
        const active = this.active; this.active = null; clearTimeout(this.answerTimer);
        if (!active) return;
        try { await window.nodie.curiosityOutcome(active.token, outcome); this.debug(outcome); } catch { this.debug('Could not record outcome'); }
    }
    debug(text) { this.renderer.debugStream?.add('Curiosity', text); }
    dispose() { clearInterval(this.timer); clearTimeout(this.answerTimer); this.reset(); }
}
if (typeof window !== 'undefined') window.CuriositySession = CuriositySession;
if (typeof module !== 'undefined') module.exports = CuriositySession;
