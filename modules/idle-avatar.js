/** Local idle video and bounded, cancellable transitions around speech playback. */
class IdleAvatar {
    constructor({enabled=true, avatarEnabled=true}={}) {
        this.video=document.getElementById('avatar-idle');
        this.cover=document.getElementById('avatar-handoff');
        this.lastTilt=-Infinity;
        this.clip={name:'nodie-idle',duration:6,blinks:[2.25,4.7]};
        this.enabled=enabled;this.avatarEnabled=avatarEnabled;this.speaking=false;this.generation=0;
        this.motion=window.matchMedia('(prefers-reduced-motion: reduce)');
        this.onMotion=()=>this.refresh();this.motion.addEventListener('change',this.onMotion);
        this.video?.addEventListener('ended',()=>this.scheduleNext());
        this.video?.addEventListener('error',()=>{this.available=false;this.hideIdle();});
        this.available=true;this.refresh();
    }
    /** Start the bundled, silent idle clip only when motion and avatar are enabled. */
    refresh() {
        if(this.disposed || !this.video) return;
        if(!this.enabled || !this.avatarEnabled || this.motion.matches || this.speaking || !this.available) {this.hideIdle();return;}
        const generation=this.generation;
        this.video.play().then(()=>{
            if(generation!==this.generation || this.speaking || this.disposed || !this.enabled || !this.avatarEnabled || this.motion.matches) return;
            this.video.style.opacity='1';
        }).catch(()=>this.hideIdle());
    }
    hideIdle() {clearTimeout(this.motionTimer);if(this.video){this.video.style.opacity='0';this.video.pause();}}
    setEnabled(enabled, avatarEnabled=this.avatarEnabled) {this.enabled=enabled;this.avatarEnabled=avatarEnabled;++this.generation;this.refresh();}
    /** Leave quiet gaps and vary gestures, with blinks more frequent than head turns. */
    scheduleNext() {
        this.hideIdle();
        if(this.speaking || this.disposed || !this.enabled || !this.avatarEnabled || this.motion.matches || !this.available)return;
        const generation=this.generation;
        this.motionTimer=setTimeout(()=>{
            if(generation!==this.generation || this.speaking || this.disposed)return;
            const blink={name:'nodie-idle-blink',duration:6,blinks:[2.25,4.7]};
            const choices=[blink,blink,blink,blink,blink,{name:'nodie-look-left',duration:3,blinks:[2.25]},{name:'nodie-look-right',duration:3,blinks:[1.7]}];
            if(Date.now()-this.lastTilt>=60000)choices.push({name:'nodie-head-tilt',duration:3,blinks:[]});
            const options=choices.filter(clip=>clip.name!==this.clip.name || clip.name===blink.name);
            this.clip=options[Math.floor(Math.random()*options.length)];
            if(this.clip.name==='nodie-head-tilt')this.lastTilt=Date.now();
            this.video.src=`assets/avatars/${this.clip.name}.mp4`;this.video.load();this.refresh();
        },1800+Math.random()*2400);
    }
    /** Finish an in-progress blink, then dissolve to the unchanged neutral portrait. */
    prepareSpeech() {
        if(this.speaking) return this.settled || Promise.resolve();
        clearTimeout(this.motionTimer);this.speaking=true;const generation=++this.generation;clearTimeout(this.idleTimer);
        const t=this.video?.currentTime%this.clip.duration;
        let blinkRemaining=0;
        for(const center of this.clip.blinks) if(t>=center-.18 && t<center+.18) blinkRemaining=Math.max(blinkRemaining,(center+.18-t)*1000);
        this.settled=new Promise(resolve=>{
            setTimeout(()=>{
                if(generation!==this.generation || this.disposed){resolve();return;}
                if(this.video)this.video.style.opacity='0';
                setTimeout(()=>{if(generation===this.generation)this.video?.pause();resolve();},160);
            },Math.min(360,blinkRemaining));
        });
        return this.settled;
    }
    /** Preserve a decoded frame while the shared speech element loads its next segment. */
    holdSpeech(video, continuing=false) {
        this.continuingSpeech=continuing;
        if(this.cover && video?.readyState>=2) {
            try {const ctx=this.cover.getContext('2d');ctx.drawImage(video,0,0,this.cover.width,this.cover.height);this.cover.style.transition='none';this.cover.style.opacity='1';}catch{}
        }
        if(continuing)return;
        this.speaking=false;this.settled=null;const generation=++this.generation;
        clearTimeout(this.idleTimer);
        this.idleTimer=setTimeout(()=>{
            if(generation!==this.generation || this.disposed)return;
            this.fadeCover();if(this.video)this.video.currentTime=0;this.refresh();
        },160);
    }
    /** Reveal only a decoded frame; stale readiness callbacks cannot replace a newer face. */
    revealSpeech(video) {
        const generation=this.generation;
        const show=()=>{
            if(generation!==this.generation || !this.speaking || this.disposed || video.paused)return;
            // Between speech segments, replace the held frame immediately once decoded.
            // Crossfading mouth shapes repeatedly makes articulation appear sluggish.
            video.style.transition=this.continuingSpeech?'none':'opacity 120ms linear';
            video.style.opacity='1';
            if(this.continuingSpeech && this.cover){this.cover.style.transition='none';this.cover.style.opacity='0';}
            else this.fadeCover();
        };
        if(video.requestVideoFrameCallback) video.requestVideoFrameCallback(show);
        else if(video.readyState>=2) show();
        else video.addEventListener('loadeddata',show,{once:true});
    }
    fadeCover(){if(this.cover){this.cover.style.transition='opacity 120ms linear';this.cover.style.opacity='0';}}
    /** Stop idle media and invalidate delayed transitions on application shutdown. */
    dispose(){this.disposed=true;++this.generation;clearTimeout(this.idleTimer);clearTimeout(this.motionTimer);this.hideIdle();this.motion.removeEventListener('change',this.onMotion);}
}
if(typeof window!=='undefined')window.IdleAvatar=IdleAvatar;
if(typeof module!=='undefined')module.exports={IdleAvatar};
