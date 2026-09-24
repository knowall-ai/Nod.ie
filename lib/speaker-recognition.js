const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { ConversationHistory } = require('./conversation-history');
const MODEL = require('../recognition/speaker-models.json').files['embedding.onnx'];
const PRUNED = Symbol('pruned');
const DAYS = 7 * 86400000;
const vectorOK = v => Array.isArray(v) && v.length === 512 && v.every(Number.isFinite) && Math.abs(Math.hypot(...v) - 1) < 0.02;
const nameOK = n => typeof n === 'string' && n.trim().length > 0 && n.length <= 80 && !/[\x00-\x1f\x7f]/.test(n);
const samples = p => [p.vector, ...(p.additionalVoices || [])];
const cosine = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
class SpeakerStore extends ConversationHistory {
    empty() { return { version: 1, epoch: crypto.randomUUID(), enabled: false, profiles: [] }; }
    async read() {
        let data;
        try { if ((await fs.stat(this.file)).size > 1024 * 1024) throw new Error('Speaker profiles exceed limit'); data = JSON.parse(await fs.readFile(this.file, 'utf8')); }
        catch (e) { if (e.code !== 'ENOENT') throw e; return this.empty(); }
        if (data.version !== 1 || typeof data.epoch !== 'string' || typeof data.enabled !== 'boolean' || !Array.isArray(data.profiles) || data.profiles.length > 32 || data.profiles.some(p => typeof p.id !== 'string' || !/^[a-f0-9-]{36}$/.test(p.id) || p.model !== MODEL || !vectorOK(p.vector) || (p.additionalVoices !== undefined && (!Array.isArray(p.additionalVoices) || p.additionalVoices.length > 7 || p.additionalVoices.some(v => !vectorOK(v)))) || (p.name !== null && !nameOK(p.name)) || !Number.isFinite(p.lastSeen) || !Number.isFinite(p.lastAsked))) throw new Error('Invalid speaker profiles');
        if (data.profiles.reduce((n, p) => n + samples(p).length, 0) > 64 || new Set(data.profiles.map(p => p.id)).size !== data.profiles.length) throw new Error('Invalid speaker profiles');
        const before=data.profiles.length;
        data.profiles = data.profiles.filter(p => p.name || Date.now() - p.lastSeen < DAYS);
        data[PRUNED]=data.profiles.length!==before;
        return data;
    }
    async load() { const d=await this.read();if(!d[PRUNED])return d;return this.transaction(async()=>{const latest=await this.read();if(latest[PRUNED])await this.write(latest);return latest;}); }
    async status() { const d=await this.load();return {enabled:d.enabled,profiles:d.profiles.map(p=>({id:p.id,name:p.name,lastSeen:p.lastSeen,voiceSamples:samples(p).length}))}; }
    async configure(enabled) { if (typeof enabled !== 'boolean') throw new Error('Invalid recognition setting'); return this.transaction(async () => { const d = await this.read(); d.enabled = enabled; d.epoch = crypto.randomUUID(); await this.write(d); }); }
    async edit(id, name) {
        if (typeof id !== 'string' || (name !== null && !nameOK(name))) throw new Error('Invalid speaker edit');
        return this.transaction(async () => { const d = await this.read(); const p = d.profiles.find(p => p.id === id); if (!p) throw new Error('Speaker no longer exists'); if (name === null) d.profiles = d.profiles.filter(p => p.id !== id); else p.name = name.trim(); d.epoch = crypto.randomUUID(); await this.write(d); });
    }
    async merge(sourceId, targetId) {
        if (typeof sourceId !== 'string' || typeof targetId !== 'string' || sourceId === targetId) throw new Error('Choose two different people');
        return this.transaction(async () => {
            const d = await this.read();
            const source = d.profiles.find(p => p.id === sourceId), target = d.profiles.find(p => p.id === targetId);
            if (!source || !target) throw new Error('A selected profile no longer exists');
            const voices = [...samples(target), ...samples(source)];
            if (voices.length > 8) throw new Error('A person can retain at most eight voice samples');
            target.additionalVoices = voices.slice(1);
            target.lastSeen = Math.max(source.lastSeen, target.lastSeen);
            target.lastAsked = Math.max(source.lastAsked, target.lastAsked);
            d.profiles = d.profiles.filter(p => p.id !== sourceId);
            d.epoch = crypto.randomUUID();
            await this.write(d);
        });
    }
    async forget() { return this.transaction(async () => { const d = this.empty(); await this.write(d); }); }
    async observe(result, epoch, signal, { enrol = true, temporary = false } = {}) {
        if (result.model !== MODEL || !Array.isArray(result.speakers) || result.speakers.length > 8 || !Array.isArray(result.segments) || result.segments.length > 64 || !Number.isFinite(result.duration) || result.duration < 0 || result.duration > 30 || result.speakers.some(s => !Number.isInteger(s.speaker) || s.speaker < 0 || !Number.isFinite(s.cleanSeconds) || s.cleanSeconds < 0 || s.cleanSeconds > 30 || (s.embedding !== null && !vectorOK(s.embedding))) || new Set(result.speakers.map(s => s.speaker)).size !== result.speakers.length || result.segments.some(s => !Number.isFinite(s.start) || !Number.isFinite(s.end) || s.start < 0 || s.end <= s.start || s.end > result.duration + 0.05 || !result.speakers.some(p => p.speaker === s.speaker))) throw new Error('Invalid diarisation result');
        return this.transaction(async () => {
            signal?.throwIfAborted(); const d = await this.read();
            signal?.throwIfAborted();
            if (!d.enabled || d.epoch !== epoch) return { state: 'disabled', speakers: [] };
            if(this.candidateEpoch!==d.epoch){this.candidateEpoch=d.epoch;this.candidates=[];}
            this.candidates=(this.candidates||[]).filter(p=>Date.now()-p.lastSeen<90000);
            let dirty=Boolean(d[PRUNED]);const used = new Set(); const speakers = [];
            for (const s of result.speakers) {
                if (!s.embedding || s.cleanSeconds < 1.5) { speakers.push({ speaker: s.speaker, uncertain: true }); continue; }
                const ranked = [...d.profiles,...(temporary?this.candidates:[])].map(p => ({ p, score: Math.max(...samples(p).map(v => cosine(v, s.embedding))) })).sort((a, b) => b.score - a.score);
                let p;
                if (ranked[0]?.score >= 0.8) {
                    if (ranked[0].score - (ranked[1]?.score ?? -1) < 0.1 || used.has(ranked[0].p.id)) { speakers.push({ speaker: s.speaker, uncertain: true }); continue; }
                    p = ranked[0].p;
                } else if (ranked[0]?.score >= 0.65) { speakers.push({ speaker: s.speaker, uncertain: true }); continue; }
                else if (enrol && d.profiles.length < 32 && d.profiles.reduce((n, p) => n + samples(p).length, 0) < 64) { p = { id: crypto.randomUUID(), model: MODEL, vector: s.embedding, name: null, lastSeen: Date.now(), lastAsked: 0 }; if(temporary){this.candidates.push(p);this.candidates=this.candidates.slice(-16);}else{d.profiles.push(p);dirty=true;} }
                if (!p) { speakers.push({ speaker: s.speaker, uncertain: true }); continue; }
                used.add(p.id);const persisted=d.profiles.includes(p);if(!persisted||Date.now()-p.lastSeen>=60000){p.lastSeen=Date.now();if(persisted)dirty=true;}
                const mayAskName = enrol && !p.name && Date.now() - p.lastAsked > 300000;
                if (mayAskName) {p.lastAsked=Date.now();if(persisted)dirty=true;}
                speakers.push({ speaker: s.speaker, id: p.id, name: p.name, mayAskName });
            }
            signal?.throwIfAborted(); if(dirty)await this.write(d);
            return { state: 'ready', epoch: d.epoch, speakers, segments: result.segments, transcriptAttribution: speakers.length === 1 && speakers[0].id ? 'single-speaker' : 'unattributed' };
        });
    }
    async nameObserved(observation, id, name, signal) {
        if (!nameOK(name) || observation?.state !== 'ready' || observation.speakers.length !== 1 || observation.speakers[0].id !== id || observation.speakers[0].name) return false;
        return this.transaction(async () => { signal?.throwIfAborted(); const d = await this.read(); if (!d.enabled || d.epoch !== observation.epoch) return false; let p = d.profiles.find(p => p.id === id);if(!p && this.candidateEpoch===d.epoch){p=this.candidates?.find(p=>p.id===id&&Date.now()-p.lastSeen<90000);if(p){if(d.profiles.length>=32||d.profiles.reduce((n,p)=>n+samples(p).length,0)>=64)return false;d.profiles.push({...p});p=d.profiles.at(-1);}} if (!p || p.name) return false; p.name = name.trim(); await this.write(d);this.candidates=this.candidates?.filter(c=>c.id!==id); return true; });
    }
}
class SpeakerRecognition {
    constructor({ store = new SpeakerStore(path.join(require('node:os').homedir(), '.config/nodie/recognition/speakers.json')), fetchImpl = fetch } = {}) { this.store = store; this.fetch = fetchImpl; }
    async analyse(audio, signal, { enrol = true, temporary = true } = {}) {
        try {
            const saved = await this.store.load();
            signal?.throwIfAborted();
            if (!saved.enabled) return { state: 'disabled', speakers: [] };
            const response = await this.fetch('http://127.0.0.1:8106/diarize', { method: 'POST', body: audio, signal: AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(1800)]) });
            if (!response.ok) throw new Error('Speaker service unavailable');
            signal?.throwIfAborted();
            const text = await response.text(); if (text.length > 200000) throw new Error('Oversized speaker result');
            signal?.throwIfAborted();
            return await this.store.observe(JSON.parse(text), saved.epoch, signal, { enrol, temporary });
        } catch { return { state: 'unavailable', speakers: [] }; }
    }
    name(observation, id, name, signal) { return this.store.nameObserved(observation, id, name, signal); }
}
const speakerTool = { type: 'function', function: { name: 'name_current_speaker', description: 'Propose a name explicitly introduced for the sole current unidentified speaker. Saving requires separate on-screen confirmation. Only use the current speaker ID supplied in the observation. Do not guess names from memory, a third-person mention or a quotation. If uncertain ask naturally. This labels a local voice profile, not an authenticated identity.', parameters: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' } }, required: ['id', 'name'], additionalProperties: false } } };
module.exports = { SpeakerStore, SpeakerRecognition, speakerTool, MODEL };
