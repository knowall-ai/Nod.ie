/** Only one small microphone sample may enter local inference at a time. */
class LiveSpeakers {
    constructor(recognition, { timeoutMs = 1800 } = {}) { this.timeoutMs = timeoutMs; this.recognition = recognition; this.controller = null; this.observations=[]; }
    forInterval(start,end) {
        const observations=this.observations.filter(o=>Date.now()-o.receivedAt<30000 && o.interval.end>start-.05 && o.interval.start<end+.05);
        if(!observations.length)return null;
        const spans=[];let identity,epoch;
        for(const o of observations){
            if(o.speakers.length!==1)return null;
            const speaker=o.speakers[0];if(!speaker.id||speaker.name||speaker.uncertain)return null;
            if(identity && (identity!==speaker.id||epoch!==o.epoch))return null;
            identity=speaker.id;epoch=o.epoch;
            for(const s of o.segments||[])if(s.speaker===speaker.speaker)spans.push([o.interval.start+s.start,o.interval.start+s.end]);
        }
        spans.sort((a,b)=>a[0]-b[0]);let covered=start-.05;
        for(const [a,b] of spans){if(b<covered)continue;if(a>covered+.001)return null;covered=Math.max(covered,b);if(covered>=end+.05)return observations.at(-1);}
        return null;
    }

    cancel() { this.controller?.abort(); this.observations=[]; this.lastObservation=null; }
    async analyse(audio, interval) {
        if(interval && (!Number.isFinite(interval.start)||!Number.isFinite(interval.end)||interval.start<0||interval.end<=interval.start||interval.end-interval.start>5))throw Error('Invalid audio interval');
        if (!(audio instanceof Uint8Array) || audio.byteLength < 100 || audio.byteLength > 256000) throw new Error('Invalid speaker recording');
        if(interval && this.lastIntervalStart!==undefined && interval.start<this.lastIntervalStart){this.cancel();}
        if(interval)this.lastIntervalStart=interval.start;
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
