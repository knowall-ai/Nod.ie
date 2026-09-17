const { renderSpeech } = require('./lip-sync');
/** One bounded renderer request at a time, cancelled on interruption or shutdown. */
class StreamingLipSync {
    constructor({ url, enabled = () => true } = {}) { this.url = url; this.enabled = enabled; this.current = null; this.generation = 0; }
    async render(audio, generation = this.generation) {
        if (generation !== this.generation) throw new Error('Lip sync cancelled');
        if (!this.enabled() || !this.url || this.current) throw new Error('Lip sync unavailable');
        if (!(audio instanceof Uint8Array) || audio.length < 44 || audio.length > 250000) throw new Error('Invalid lip-sync segment');
        const b = Buffer.from(audio);
        const rate = b.readUInt32LE(24), size = b.readUInt32LE(40);
        if (b.readUInt32LE(4)!==b.length-8 || b.readUInt32LE(28)!==rate*2 || b.readUInt16LE(32)!==2 || b.toString('ascii',0,4)!=='RIFF' || b.toString('ascii',8,12)!=='WAVE' || b.toString('ascii',12,16)!=='fmt ' || b.readUInt32LE(16)!==16 || b.readUInt16LE(20)!==1 || b.readUInt16LE(22)!==1 || b.readUInt16LE(34)!==16 || b.toString('ascii',36,40)!=='data' || size!==b.length-44 || size%2 || rate<8000 || rate>96000 || size/(rate*2)<.1 || size/(rate*2)>1.3) throw new Error('Invalid lip-sync WAV');
        const controller = this.current = new AbortController();
        try { return await renderSpeech(audio, { url: this.url, videoOnly: true, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(2500)]) }); }
        finally { if(this.current===controller) this.current=null; }
    }
    cancel() { ++this.generation; this.current?.abort(); }
}
module.exports = { StreamingLipSync };
