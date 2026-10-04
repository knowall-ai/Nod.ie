/** Proposals bind to captured observations; only the UI confirms persistence. */
const crypto = require('node:crypto');
const nameOK = name => typeof name === 'string' && name.replace(/[\u200c\u200d]/g,'').trim().length > 0 && name.length <= 80 && !/[\p{Cc}\p{Cf}]/u.test(name.replace(/[\u200c\u200d]/g,''));
class RecognitionNames {
    constructor({ faces, voices, classify, now = () => Date.now(), record = () => {} }) {
        Object.assign(this, { faces, voices, classify, now, record }); this.generation = 0;
    }
    cancel() { clearTimeout(this.pendingTimer); ++this.generation; this.pending = null;this.intentCache=[]; this.controller?.abort(); }
    setPending(proposal) {
        clearTimeout(this.pendingTimer);this.pending=proposal;
        this.pendingTimer=setTimeout(()=>{if(this.pending===proposal)this.pending=null;},Math.max(0,proposal.until-this.now()));
        this.pendingTimer.unref?.();
    }
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
        const freshFace = face && this.now() - face.receivedAt <= 15000 && face.faces?.some(f=>f.id&&!f.name&&!f.uncertain&&(face.faces.length===1||f.thumbnail)) ? face : null;
        if (!voice && !freshFace) return { status: 'awaiting-observation' };
        this.busy = true;this.controller=new AbortController();
        try {
            const intent = await this.intentFor(turn.text,this.controller.signal,turn.previousAssistant||'');
            if (generation !== this.generation || !intent || !['voice', 'face'].includes(intent.kind) || !nameOK(intent.name)) return { status: 'not-saved' };
            const observation = intent.kind === 'voice' ? voice : freshFace;
            if(intent.kind==='voice' && !voice)return {status:'awaiting-observation'};
            if (!observation || this.now() - observation.receivedAt > 30000) return { status: 'not-saved' };
            const candidates = intent.kind === 'face' ? observation.faces.filter(f=>f.id&&!f.name&&!f.uncertain&&(observation.faces.length===1||f.thumbnail)) : [];
            const selectionRequired = intent.kind === 'face' && observation.faces.length > 1;
            const item = intent.kind === 'voice' ? observation.speakers[0] : candidates[0];
            const token = crypto.randomUUID();
            this.setPending({ token, kind: intent.kind, name: intent.name.trim(), observation, id: selectionRequired ? null : item.id, candidates, selectionRequired, heard:turn.text.slice(0,300), until: this.now() + 60000 });
            return { status: 'pending', token, kind: intent.kind, name: this.pending.name, selectionInSettings: intent.kind==='face'&&candidates.some(f=>f.thumbnail), confirmationInSettings:intent.kind==='voice' };
        } finally { this.busy = false; }
    }
    async proposeLocal(observation, text, previousAssistant='') {
        if(this.pending && this.now()>this.pending.until)this.pending=null;
        if (this.pending || this.busy || observation?.state !== 'ready' || observation.speakers?.length !== 1 || !observation.speakers[0].id || observation.speakers[0].name || observation.speakers[0].uncertain || !Array.isArray(observation.segments) || !observation.segments.length || observation.segments.some(s=>s.speaker!==observation.speakers[0].speaker||!Number.isFinite(s.start)||!Number.isFinite(s.end)||s.end<=s.start) || typeof text !== 'string' || text.length > 2000) return {status:'not-saved'};
        const generation=this.generation;this.busy=true;this.controller=new AbortController();
        try {
            const intent=await this.classify(text,this.controller.signal,previousAssistant);
            if(generation!==this.generation || intent?.kind!=='voice' || !nameOK(intent.name))return {status:'not-saved'};
            const token=crypto.randomUUID();this.setPending({token,kind:'voice',name:intent.name.trim(),observation,id:observation.speakers[0].id,heard:text.slice(0,300),until:this.now()+60000});
            return {status:'pending',token,kind:'voice',name:this.pending.name,confirmationInSettings:true};
        } finally {this.busy=false;}
    }
    selection() {
        const p=this.pending;
        if(!p||p.kind!=='face')return null;
        if(this.now()>p.until){clearTimeout(this.pendingTimer);this.pending=null;return null;}
        return {token:p.token,name:p.name,expiresAt:p.until,selectionRequired:p.selectionRequired,faces:(p.candidates||[]).filter(f=>f.thumbnail).map(f=>({id:f.id,thumbnail:f.thumbnail}))};
    }
    voiceSelection() {
        const p=this.pending;if(!p||p.kind!=='voice')return null;
        if(this.now()>=p.until){clearTimeout(this.pendingTimer);this.pending=null;return null;}
        return {token:p.token,name:p.name,expiresAt:p.until,heard:p.heard||''};
    }
    async confirm(token, accepted, correctedName, selectedFaceId) {
        const p = this.pending;
        if (typeof accepted !== 'boolean' || !p || p.token !== token) return { status: 'not-saved' };
        if (accepted && correctedName !== undefined && !nameOK(correctedName)) return { status: 'invalid-name', kind: p.kind, name: p.name };
        let id=p.id;
        if(accepted&&p.kind==='face'&&(p.selectionRequired||selectedFaceId!==undefined)){
            if(typeof selectedFaceId!=='string'||!p.candidates.some(f=>f.id===selectedFaceId))return {status:'select-face',kind:p.kind,name:p.name};
            id=selectedFaceId;
        }
        const label = accepted && correctedName !== undefined ? correctedName.trim() : p.name;
        clearTimeout(this.pendingTimer);this.pending = null;
        if (this.now() > p.until) return { status: 'not-saved' };
        if (!accepted) return { status: 'cancelled', kind: p.kind, name: p.name };
        const source = p.kind === 'face' ? this.faces : this.voices;
        if(p.kind==='face' && (!source.lastObservation || this.now()-source.lastObservation.receivedAt>15000 || source.lastObservation.faces?.filter(f=>f.id===id&&!f.name&&!f.uncertain).length!==1))return {status:'not-saved',kind:p.kind,name:p.name};
        const saved = await source.store.nameObserved(p.observation, id, label);
        if (saved) { try { this.record({ source: p.kind, kind: 'name-confirmed', subject: label, uncertain: false }); } catch {} }
        return { status: saved ? 'saved' : 'not-saved', kind: p.kind, name: label, ...(saved?{profileId:id}:{}) };
    }
}
module.exports = { RecognitionNames };
