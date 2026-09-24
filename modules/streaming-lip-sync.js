/** Bounded neural video segments with synchronized audio and interruption cancellation. */
class StreamingLipSync {
    /** Initialize bounded audio and video queues for one renderer. */
    constructor(renderer) { this.renderer = renderer; this.generation = 0; this.samples = []; this.length = 0; this.jobs = []; this.ready = []; this.failed = false; this.sources = new Set(); this.firstSegment=true; }
    /** Report whether avatar rendering is enabled and a transport is available. */
    enabled() { return this.renderer.state.avatarEnabled && Boolean(window.nodie?.renderLipSegment); }
    /** Collect decoded speech into short neural-rendering segments. */
    push(frame, rate) {
        if (!this.enabled()) return;
        if (!Number.isInteger(rate) || rate < 8000 || rate > 96000 || !(frame instanceof Float32Array) || !frame.length) return;
        if (this.closing) {
            const generation = this.generation;
            this.closing.then(() => { if (generation === this.generation) this.push(frame, rate); });
            return;
        }
        if (this.length && this.rate !== rate) this.flush();
        this.rate = rate;
        this.renderer.state.avatarManager?.idle?.prepareSpeech();
        clearTimeout(this.flushTimer);
        const generation = this.generation, limit = Math.floor(rate * .64);
        for (let offset = 0; offset < frame.length && generation === this.generation;) {
            const count = Math.min(limit - this.length, frame.length - offset);
            this.samples.push(frame.slice(offset, offset + count)); this.length += count; offset += count;
            if (this.length === limit) this.flush();
        }
        if (this.length) this.flushTimer = setTimeout(() => this.flush(), 150);
    }
    /** Queue PCM immediately and prepare the corresponding video job. */
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
        const job = {audio, samplesLength: length};
        try { this.scheduleAudio(job, this.generation); }
        catch { this.cancel(); this.renderer.showNotification('Speech playback failed.', 'error'); return; }
        this.jobs.push(job); this.renderNext();
    }
    /** Render video serially without blocking audio scheduling. */
    async renderNext() {
        if(this.rendering || !this.jobs.length || this.ready.length >= 2) return;
        const generation=this.generation, token=this.rendering={};
        const job=this.jobs.shift();
        if (job.ended) { this.rendering=null; this.renderNext(); return; }
        try {
            if(!this.failed && this.enabled()) job.video=await window.nodie.renderLipSegment(job.audio);
        } catch {
            if(generation===this.generation) { this.failed=true; this.renderer.showNotification('Lip sync unavailable; continuing with audio.', 'error'); }
        }
        if(generation!==this.generation || this.rendering!==token) return;
        this.rendering=null;
        if (!job.ended && this.context && this.context.currentTime < job.until) this.ready.push(job);
        this.playNext(); this.renderNext();
    }
    /** Schedule speech on a continuous clock with a fixed initial video buffer. */
    scheduleAudio(job, generation) {
        if (!this.context) {
            this.context = new AudioContext(); this.gain = this.context.createGain();
            this.gain.gain.value = this.renderer.state.speakerMuted ? 0 : 1;
            this.gain.connect(this.context.destination); this.nextStart = this.context.currentTime + .75;
            this.context.resume().catch(() => { if (generation === this.generation) this.cancel(); });
        }
        if(this.firstSegment) { this.nextStart=Math.max(this.nextStart,this.context.currentTime+.75);this.firstSegment=false; }
        const view = new DataView(job.audio.buffer), count=job.samplesLength ?? (job.audio.length-44)/2;
        const buffer=this.context.createBuffer(1,count,view.getUint32(24,true));
        const samples=buffer.getChannelData(0);
        for(let i=0;i<count;i++) samples[i]=view.getInt16(44+i*2,true)/32768;
        const source=job.source=this.context.createBufferSource(); source.buffer=buffer; source.connect(this.gain);
        job.at=Math.max(this.context.currentTime+.1,this.nextStart); this.nextStart=job.until=job.at+buffer.duration;
        this.sources.add(source);
        source.onended=()=>{
            job.ended=true;this.sources.delete(source);source.disconnect();
            if(generation!==this.generation) return;
            // The last audio may have no video (expired render or decoder failure).
            if(!this.sources.size) this.release(false);
            else if(this.activeJob===job) this.release();
            this.ready=this.ready.filter(item=>!item.ended);this.playNext();this.renderNext();
        };
        source.start(job.at);
    }
    /** Present ready video against its existing audio playback deadline. */
    async playNext() {
        if(this.activeJob) return;
        this.ready=this.ready.filter(job=>!job.ended && this.context && this.context.currentTime<job.until);
        if(!this.ready.length) return;
        const generation=this.generation, job=this.activeJob=this.ready.shift(); this.renderNext();
        const video=job.video && this.enabled() ? document.getElementById('avatar-video') : null;
        if(!video) return; // Audio is scheduled independently and never waits for video decoding.
        const player=this.player=video;
        this.url=URL.createObjectURL(new Blob([job.video], {type:'video/mp4'}));
        if(this.renderer.state.avatarManager?.idle) player.style.opacity='0';
        player.src=this.url;player.loop=false;player.muted=true;player.playbackRate=1;player.load();
        const fail=()=>{ if(generation===this.generation && this.player===player) this.renderer.state.avatarManager?.setSpeechVideo(false); };
        player.onerror=fail;
        this.videoTimer=setTimeout(async()=>{
            if(generation!==this.generation || this.player!==player || this.activeJob!==job || job.ended) return;
            if (this.context.currentTime >= job.until) { this.release(); this.playNext(); return; }
            // A late video catches up to the independent audio clock; it never delays speech.
            player.currentTime=Math.max(0,this.context.currentTime-job.at);
            this.renderer.state.avatarManager?.setSpeechVideo(true);
            try {
                await player.play();
                if(generation!==this.generation || this.player!==player || this.activeJob!==job || job.ended)return;
                // Decoder startup advances the audio clock after the initial seek.
                const elapsed=this.context.currentTime-job.at;
                if(elapsed>=job.until-job.at){this.release();this.playNext();return;}
                // Seeking again stalls decoding; gently catch up against the audio clock.
                const synchronize=()=>{
                    if(generation!==this.generation || this.player!==player || this.activeJob!==job || job.ended)return;
                    const drift=this.context.currentTime-job.at-player.currentTime;
                    player.playbackRate=Math.max(.9,Math.min(1.3,1+drift*4));
                    this.syncTimer=setTimeout(synchronize,40);
                };
                synchronize();
                this.renderer.state.avatarManager?.idle?.revealSpeech(player);
            } catch {fail();}
        },Math.max(0,(job.at-this.context.currentTime)*1000));
    }
    /** Release the active video and its object URL. */
    release(continuing = [...this.sources].some(source => source !== this.activeJob?.source)) {
        this.renderer.state.avatarManager?.idle?.holdSpeech(this.player, continuing);
        clearTimeout(this.videoTimer);clearTimeout(this.syncTimer); this.activeJob=null;
        if(this.player) { this.player.onended=null;this.player.onerror=null;this.player.pause();this.player.removeAttribute('src');this.player.load();this.player=null; }
        if(this.url) URL.revokeObjectURL(this.url); this.url=null;
        this.renderer.state.avatarManager?.setSpeechVideo(false);
    }
    /** Permit video rendering again after a previous response failed. */
    beginResponse() { this.failed=false; this.firstSegment=true; }
    /** Apply the speaker preference to independently scheduled PCM. */
    setMuted(muted) { if(this.gain) this.gain.gain.value=muted?0:1; }
    /** Invalidate pending work and stop all audio and video immediately. */
    cancel() {
        ++this.generation; clearTimeout(this.flushTimer);this.samples=[];this.length=0;this.jobs=[];this.ready=[];this.rendering=null;this.release(false);
        for(const source of this.sources) {source.onended=null;try{source.stop();}catch{}source.disconnect();}
        this.sources.clear();this.gain?.disconnect();this.gain=null;
        const context = this.context; this.nextStart=0;
        window.nodie?.cancelLipSync?.().catch(()=>{});
        if (this.closing) return this.closing;
        let timer;
        const close = Promise.resolve().then(() => context?.close()).catch(() => {});
        const closing = this.closing = Promise.race([close, new Promise(resolve => { timer = setTimeout(resolve, 500); })]).finally(() => {
            clearTimeout(timer);
            if (this.context === context) this.context = null;
            if (this.closing === closing) this.closing = null;
        });
        return closing;
    }
}
if(typeof window!=='undefined') window.StreamingLipSync=StreamingLipSync;
if(typeof module!=='undefined') module.exports={StreamingLipSync};
