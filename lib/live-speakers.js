/** Only one small microphone sample may enter local inference at a time. */
class LiveSpeakers {
    constructor(recognition, { timeoutMs = 1800 } = {}) { this.timeoutMs = timeoutMs; this.recognition = recognition; this.controller = null; this.observations=[]; }
    forInterval(start,end) {
        const candidates=this.observations.filter(o=>Date.now()-o.receivedAt<30000 && o.interval.start<=start && o.interval.end>=end && o.speakers.length===1 && o.speakers[0].id && !o.speakers[0].name && !o.speakers[0].uncertain && o.segments?.some(s=>s.speaker===o.speakers[0].speaker && o.interval.start+s.start<=start-.05 && o.interval.start+s.end>=end+.05));
        return candidates.length===1?candidates[0]:null;
    }
    cancel() { this.controller?.abort(); this.observations=[]; this.lastObservation=null; }
    async analyse(audio, interval) {
        if(interval && (!Number.isFinite(interval.start)||!Number.isFinite(interval.end)||interval.start<0||interval.end<=interval.start||interval.end-interval.start>5))throw Error('Invalid audio interval');
        if (!(audio instanceof Uint8Array) || audio.byteLength < 100 || audio.byteLength > 256000) throw new Error('Invalid speaker recording');
        if (this.controller) return null;
        const controller = this.controller = new AbortController();
        let timer;
        const stopped = new Promise(resolve => controller.signal.addEventListener('abort', () => resolve(null), { once: true }));
        timer = setTimeout(() => controller.abort(), this.timeoutMs);
        const operation = Promise.resolve().then(() => this.recognition.analyse(Buffer.from(audio), controller.signal, { enrol: true })).finally(() => {
            if (this.controller === controller) this.controller = null;
        });
        try {
            const result = await Promise.race([operation, stopped]);
            if (!result || controller.signal.aborted || result.state !== 'ready') return null;
            this.lastObservation={...result,receivedAt:Date.now(),interval};
            if(interval)this.observations=[...this.observations.filter(o=>Date.now()-o.receivedAt<30000),this.lastObservation].slice(-12);
            return { speakers: result.speakers.map(({ speaker,id,name,uncertain,mayAskName }) => ({speaker,id,name:name||null,uncertain:Boolean(uncertain),mayAskName:Boolean(mayAskName)})), segments:result.segments||[], attribution: result.transcriptAttribution };
        } finally { clearTimeout(timer); }
    }
}
module.exports = { LiveSpeakers };
