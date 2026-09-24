const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const {FaceWorker}=require('./face-worker');
const PRUNED=Symbol('pruned');
const { ConversationHistory } = require('./conversation-history');
const MODEL = require('../recognition/face-models.json').files['face_recognition_sface_2021dec.onnx'].sha256;
const vectorOK = v => Array.isArray(v) && v.length === 128 && v.every(Number.isFinite) && Math.abs(Math.hypot(...v) - 1) < .02;
const nameOK = n => n === null || (typeof n === 'string' && n.trim().length > 0 && n.length <= 80 && !/[\x00-\x1f\x7f]/.test(n));
const cosine = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
class FaceStore extends ConversationHistory {
    empty() { return { version: 1, model: MODEL, epoch: crypto.randomUUID(), enabled: false, profiles: [] }; }
    async read() {
        let d;
        try { if ((await fs.stat(this.file)).size > 512000) throw new Error('Face profiles exceed limit'); d = JSON.parse(await fs.readFile(this.file, 'utf8')); }
        catch (error) { if (error.code !== 'ENOENT') throw error;const d=this.empty();d[PRUNED]=true;return d; }
        if (d.version !== 1 || d.model !== MODEL || typeof d.epoch !== 'string' || typeof d.enabled !== 'boolean' || !Array.isArray(d.profiles) || d.profiles.length > 32 || d.profiles.some(p => typeof p.id !== 'string' || !/^[a-f0-9-]{36}$/.test(p.id) || !nameOK(p.name) || !Number.isFinite(p.lastSeen) || !Array.isArray(p.vectors) || !p.vectors.length || p.vectors.length > 4 || p.vectors.some(v => !vectorOK(v))) || new Set(d.profiles.map(p => p.id)).size !== d.profiles.length) throw new Error('Invalid face profiles');
        const count=d.profiles.length;d.profiles = d.profiles.filter(p => p.name || Date.now() - p.lastSeen < 7 * 86400000);
        if(count!==d.profiles.length)d[PRUNED]=true;return d;
    }
    async load() { return this.transaction(async () => { const d = await this.read(); if(d[PRUNED])await this.write(d); return d; }); }
    async status() { const d = await this.load(); return { enabled: d.enabled, profiles: d.profiles.map(({ id, name, lastSeen }) => ({ id, name, lastSeen })) }; }
    async configure(enabled) { if (typeof enabled !== 'boolean') throw new Error('Invalid face setting'); return this.mutate(d => { d.enabled = enabled; }); }
    mutate(action) { return this.transaction(async () => { const d = await this.read(); action(d); d.epoch = crypto.randomUUID(); await this.write(d); }); }
    edit(id, name) { if (!nameOK(name)) throw new Error('Invalid face name'); return this.mutate(d => { const p = d.profiles.find(p => p.id === id); if (!p) throw new Error('Face profile no longer exists'); if (name === null) d.profiles = d.profiles.filter(p => p.id !== id); else p.name = name.trim(); }); }
    merge(source, target) { return this.mutate(d => { const a = d.profiles.find(p => p.id === source), b = d.profiles.find(p => p.id === target); if (!a || !b || a === b) throw new Error('Choose two face profiles'); if (a.vectors.length + b.vectors.length > 4) throw new Error('At most four face samples per person'); b.vectors.push(...a.vectors); b.lastSeen = Math.max(a.lastSeen, b.lastSeen); d.profiles = d.profiles.filter(p => p !== a); }); }
    nameObserved(observation,id,name){
        if(typeof name!=='string'||!nameOK(name)||observation?.faces?.length!==1||observation.faces[0].id!==id||observation.faces[0].name)return false;
        return this.transaction(async()=>{const d=await this.read();if(!d.enabled||d.epoch!==observation.epoch)return false;let p=d.profiles.find(p=>p.id===id);if(!p && this.candidateEpoch===d.epoch){p=this.candidates?.find(p=>p.id===id&&Date.now()-p.lastSeen<90000);if(p){if(d.profiles.length>=32)return false;d.profiles.push({...p});p=d.profiles.at(-1);}}if(!p||p.name)return false;p.name=name.trim();await this.write(d);this.candidates=this.candidates?.filter(c=>c.id!==id);return true;});
    }
    forget() { return this.transaction(() => this.write(this.empty())); }
    observe(result, epoch, signal, {temporary=false}={}) {
        if (result?.model !== MODEL || !Array.isArray(result.faces) || result.faces.length > 8 || result.faces.some(f => !vectorOK(f.vector))) throw new Error('Invalid face result');
        return this.transaction(async () => {
            signal?.throwIfAborted(); const d = await this.read(); if (!d.enabled || d.epoch !== epoch) return { state: 'disabled', faces: [] };
            if(this.candidateEpoch!==d.epoch){this.candidateEpoch=d.epoch;this.candidates=[];}
            this.candidates=(this.candidates||[]).filter(p=>Date.now()-p.lastSeen<90000);
            let dirty=Boolean(d[PRUNED]);const used = new Set(), faces = [];
            for (const face of result.faces) {
                const ranked = [...d.profiles,...(temporary?this.candidates:[])].map(p => ({ p, score: Math.max(...p.vectors.map(v => cosine(v, face.vector))) })).sort((a, b) => b.score - a.score);
                let p;
                if (ranked[0]?.score >= .6 && ranked[0].score - (ranked[1]?.score ?? -1) >= .12 && !used.has(ranked[0].p.id)) p = ranked[0].p;
                else if (ranked[0]?.score >= .4) { faces.push({ uncertain: true, name: null }); continue; }
                else if (d.profiles.length < 32) { p = { id: crypto.randomUUID(), name: null, vectors: [face.vector], lastSeen: Date.now() }; if(temporary){this.candidates.push(p);this.candidates=this.candidates.slice(-16);}else {d.profiles.push(p);dirty=true;} }
                if (!p) { faces.push({ uncertain: true, name: null }); continue; }
                used.add(p.id);if(!d.profiles.includes(p)||Date.now()-p.lastSeen>=60000){p.lastSeen=Date.now();if(d.profiles.includes(p))dirty=true;} faces.push({ id: p.id, name: p.name, uncertain: false });
            }
            signal?.throwIfAborted(); if(dirty)await this.write(d); return { state: 'ready', epoch:d.epoch, faces };
        });
    }
}
class FaceRecognition {
    constructor({ store = new FaceStore(path.join(require('node:os').homedir(), '.config/nodie/recognition/faces.json')), analyse } = {}) { this.store=store;this.worker=analyse?null:new FaceWorker();this.analyseFrame=analyse||((image,signal)=>this.worker.analyse(image,signal)); }
    cancel() { this.controller?.abort();this.worker?.close(); this.lastObservation=null; }
    async analyse(image) {
        if (!(image instanceof Uint8Array) || image.length < 100 || image.length > 512000) throw new Error('Invalid face frame');
        if (this.controller) return { state: 'busy', faces: [] };
        const controller = this.controller = new AbortController();
        try {
            const d = await this.store.load(); if (!d.enabled) return { state: 'disabled', faces: [] };
            controller.signal.throwIfAborted();
            const result=await this.store.observe(await this.analyseFrame(image,controller.signal),d.epoch,controller.signal,{temporary:true});this.lastObservation={...result,receivedAt:Date.now()};return result;
        } catch { return { state: 'unavailable', faces: [] }; }
        finally { if (this.controller === controller) this.controller = null; }
    }
}
module.exports = { FaceStore, FaceRecognition, MODEL };
