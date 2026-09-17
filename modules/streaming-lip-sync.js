/** Bounded neural video segments with synchronized audio and interruption cancellation. */
class StreamingLipSync {
    constructor(renderer) { this.renderer = renderer; this.generation = 0; this.samples = []; this.length = 0; this.jobs = []; this.ready = []; this.failed = false; this.sources = new Set(); }
    enabled() { return this.renderer.state.avatarEnabled && Boolean(window.nodie?.renderLipSegment); }
    push(frame, rate) {
        if (!this.enabled()) return;
        if (!Number.isFinite(rate) || rate < 8000 || rate > 96000) return;
        this.rate = rate;
        this.samples.push(new Float32Array(frame)); this.length += frame.length;
        clearTimeout(this.flushTimer);
        if (this.length >= rate * .64) this.flush();
        else this.flushTimer = setTimeout(() => this.flush(), 150);
    }
    flush() {
        clearTimeout(this.flushTimer);
        if (!this.length) return;
        const rate = this.rate, length = this.length;
        const frames = this.samples; this.samples = []; this.length = 0;
        const count = Math.ceil(Math.max(length / rate, .12) * 25) * rate / 25;
        const audio = new Uint8Array(44 + Math.ceil(count) * 2), view = new DataView(audio.buffer);
        const text = (at, value) => { for (let i=0;i<value.length;i++) audio[at+i]=value.charCodeAt(i); };
        text(0,'RIFF'); view.setUint32(4,audio.length-8,true); text(8,'WAVE'); text(12,'fmt '); view.setUint32(16,16,true); view.setUint16(20,1,true); view.setUint16(22,1,true); view.setUint32(24,rate,true); view.setUint32(28,rate*2,true); view.setUint16(32,2,true); view.setUint16(34,16,true); text(36,'data'); view.setUint32(40,audio.length-44,true);
        let at=44; for(const frame of frames) for(const sample of frame) { view.setInt16(at, Math.round(Math.max(-1,Math.min(1,Number.isFinite(sample)?sample:0))*32767), true); at+=2; }
        if (this.jobs.length + this.ready.length > 48) { this.cancel(); this.renderer.showNotification('Speech buffer limit reached. Please try a shorter reply.', 'error'); return; }
        this.jobs.push({audio}); this.renderNext();
    }
    async renderNext() {
        if(this.rendering || !this.jobs.length || this.ready.length >= 2) return;
        const generation=this.generation, token=this.rendering={};
        const job=this.jobs.shift();
        try {
            if(!this.failed && this.enabled()) job.video=await window.nodie.renderLipSegment(job.audio);
        } catch {
            if(generation===this.generation) { this.failed=true; this.renderer.showNotification('Lip sync unavailable; continuing with audio.', 'error'); }
        }
        if(generation!==this.generation || this.rendering!==token) return;
        this.rendering=null;
        try { this.scheduleAudio(job, generation); }
        catch { this.cancel(); this.renderer.showNotification('Speech playback failed.', 'error'); return; }
        this.ready.push(job); this.playNext(); this.renderNext();
    }
    scheduleAudio(job, generation) {
        if (!this.context) {
            this.context = new AudioContext(); this.gain = this.context.createGain();
            this.gain.gain.value = this.renderer.state.speakerMuted ? 0 : 1;
            this.gain.connect(this.context.destination); this.nextStart = 0;
            this.context.resume().catch(() => { if (generation === this.generation) this.cancel(); });
        }
        const view = new DataView(job.audio.buffer), count=(job.audio.length-44)/2;
        const buffer=this.context.createBuffer(1,count,view.getUint32(24,true));
        const samples=buffer.getChannelData(0);
        for(let i=0;i<count;i++) samples[i]=view.getInt16(44+i*2,true)/32768;
        const source=job.source=this.context.createBufferSource(); source.buffer=buffer; source.connect(this.gain);
        job.at=Math.max(this.context.currentTime+.1,this.nextStart); this.nextStart=job.at+buffer.duration;
        this.sources.add(source);
        source.onended=()=>{
            this.sources.delete(source);source.disconnect();
            if(generation!==this.generation) return;
            if(this.activeJob===job) {this.release();this.playNext();}
        };
        source.start(job.at);
    }
    async playNext() {
        if(this.activeJob || !this.ready.length) return;
        const generation=this.generation, job=this.activeJob=this.ready.shift(); this.renderNext();
        const video=job.video && this.enabled() ? document.getElementById('avatar-video') : null;
        if(!video) return; // Audio is scheduled independently and never waits for video decoding.
        const player=this.player=video;
        this.url=URL.createObjectURL(new Blob([job.video], {type:'video/mp4'}));
        player.src=this.url;player.loop=false;player.muted=true;player.load();
        const fail=()=>{ if(generation===this.generation && this.player===player) this.renderer.state.avatarManager?.setSpeechVideo(false); };
        player.onerror=fail;
        this.videoTimer=setTimeout(async()=>{
            if(generation!==this.generation || this.player!==player) return;
            this.renderer.state.avatarManager?.setSpeechVideo(true);
            try {await player.play();} catch {fail();}
        },Math.max(0,(job.at-this.context.currentTime)*1000));
    }
    release() {
        clearTimeout(this.videoTimer); this.activeJob=null;
        if(this.player) { this.player.onended=null;this.player.onerror=null;this.player.pause();this.player.removeAttribute('src');this.player.load();this.player=null; }
        if(this.url) URL.revokeObjectURL(this.url); this.url=null;
        this.renderer.state.avatarManager?.setSpeechVideo(false);
    }
    beginResponse() { this.failed=false; }
    setMuted(muted) { if(this.gain) this.gain.gain.value=muted?0:1; }
    cancel() {
        ++this.generation; clearTimeout(this.flushTimer);this.samples=[];this.length=0;this.jobs=[];this.ready=[];this.rendering=null;this.release();
        for(const source of this.sources) {source.onended=null;try{source.stop();}catch{}source.disconnect();}
        this.sources.clear();this.gain?.disconnect();this.gain=null;
        this.context?.close().catch(()=>{});this.context=null;this.nextStart=0;
        window.nodie?.cancelLipSync?.().catch(()=>{});
    }
}
if(typeof window!=='undefined') window.StreamingLipSync=StreamingLipSync;
if(typeof module!=='undefined') module.exports={StreamingLipSync};
