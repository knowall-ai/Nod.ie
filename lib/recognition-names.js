/** Proposals bind to captured observations; only the UI confirms persistence. */
const crypto = require('node:crypto');
const nameOK = name => typeof name === 'string' && name.trim().length > 0 && name.length <= 80 && !/[\p{Cc}\p{Cf}]/u.test(name.replace(/[\u200c\u200d]/g,''));
class RecognitionNames {
    constructor({ faces, voices, classify, now = () => Date.now(), record = () => {} }) {
        Object.assign(this, { faces, voices, classify, now, record }); this.generation = 0;
    }
    cancel() { ++this.generation; this.pending = null;this.intentCache=[]; this.controller?.abort(); }
    async intentFor(text,signal,previousAssistant){
        const key=JSON.stringify([text,previousAssistant]);
        this.intentCache=(this.intentCache||[]).filter(c=>this.now()-c.at<15000);
        const cached=this.intentCache.find(c=>c.key===key);if(cached)return cached.intent;
        const generation=this.generation,intent=await this.classify(text,signal,previousAssistant);
        if(generation===this.generation)this.intentCache=[...this.intentCache,{key,intent,at:this.now()}].slice(-3);
        return intent;
    }
    async propose(turn) {
        if(this.pending && this.now()>this.pending.until)this.pending=null;
        if (!turn || (turn.previousAssistant!==undefined && (typeof turn.previousAssistant!=='string'||turn.previousAssistant.length>2000)) || typeof turn.text !== 'string' || !turn.text.trim() || turn.text.length > 2000 || !Number.isFinite(turn.start) || !Number.isFinite(turn.end) || turn.start < 0 || turn.end <= turn.start || turn.end - turn.start > 30) throw Error('Invalid introduction');
        if (this.pending || this.busy) return { status: 'deferred' };
        const generation = this.generation;
        // Snapshot candidates before model inference. A later camera/audio window cannot replace them.
        const voice = this.voices.forInterval(turn.start, turn.end);
        const face = this.faces.lastObservation;
        const freshFace = face && this.now() - face.receivedAt <= 15000 && face.faces?.length === 1 && face.faces[0].id && !face.faces[0].name && !face.faces[0].uncertain ? face : null;
        if (!voice && !freshFace) return { status: 'awaiting-observation' };
        this.busy = true;this.controller=new AbortController();
        try {
            const intent = await this.intentFor(turn.text,this.controller.signal,turn.previousAssistant||'');
            if (generation !== this.generation || !intent || !['voice', 'face'].includes(intent.kind) || !nameOK(intent.name)) return { status: 'not-saved' };
            const observation = intent.kind === 'voice' ? voice : freshFace;
            if(intent.kind==='voice' && !voice)return {status:'awaiting-observation'};
            if (!observation || this.now() - observation.receivedAt > 30000) return { status: 'not-saved' };
            const item = intent.kind === 'voice' ? observation.speakers[0] : observation.faces[0];
            const token = crypto.randomUUID();
            this.pending = { token, kind: intent.kind, name: intent.name.trim(), observation, id: item.id, until: this.now() + 60000 };
            return { status: 'pending', token, kind: intent.kind, name: this.pending.name };
        } finally { this.busy = false; }
    }
    async proposeLocal(observation, text, previousAssistant='') {
        if(this.pending && this.now()>this.pending.until)this.pending=null;
        if (this.pending || this.busy || observation?.state !== 'ready' || observation.speakers?.length !== 1 || !observation.speakers[0].id || observation.speakers[0].name || observation.speakers[0].uncertain || typeof text !== 'string' || text.length > 2000) return {status:'not-saved'};
        const generation=this.generation;this.busy=true;this.controller=new AbortController();
        try {
            const intent=await this.classify(text,this.controller.signal,previousAssistant);
            if(generation!==this.generation || intent?.kind!=='voice' || !nameOK(intent.name))return {status:'not-saved'};
            const token=crypto.randomUUID();this.pending={token,kind:'voice',name:intent.name.trim(),observation,id:observation.speakers[0].id,until:this.now()+60000};
            return {status:'pending',token,kind:'voice',name:this.pending.name};
        } finally {this.busy=false;}
    }
    async confirm(token, accepted) {
        const p = this.pending;
        if (typeof accepted !== 'boolean' || !p || p.token !== token) return { status: 'not-saved' };
        this.pending = null;
        if (this.now() > p.until) return { status: 'not-saved' };
        if (!accepted) return { status: 'cancelled', kind: p.kind, name: p.name };
        const source = p.kind === 'face' ? this.faces : this.voices;
        if(p.kind==='face' && (!source.lastObservation || this.now()-source.lastObservation.receivedAt>15000 || source.lastObservation.faces?.length!==1 || source.lastObservation.faces[0].id!==p.id))return {status:'not-saved',kind:p.kind,name:p.name};
        const saved = await source.store.nameObserved(p.observation, p.id, p.name);
        if (saved) { try { this.record({ source: p.kind, kind: 'name-confirmed', subject: p.name, uncertain: false }); } catch {} }
        return { status: saved ? 'saved' : 'not-saved', kind: p.kind, name: p.name };
    }
}
module.exports = { RecognitionNames };
