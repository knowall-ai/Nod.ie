const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
function harness(){
 const timers=new Map();let id=0,draws=0;const video={currentTime:0,style:{},play(){this.paused=false;return Promise.resolve()},pause(){this.paused=true},addEventListener(){}};
 const cover={width:512,height:512,style:{},getContext:()=>({drawImage(){draws++}})};
 const motion={matches:false,addEventListener(){},removeEventListener(){}};
 const context={module:{exports:{}},window:{matchMedia:()=>motion},document:{getElementById:id=>id==='avatar-idle'?video:cover},setTimeout:(fn,ms)=>{timers.set(++id,{fn,ms});return id},clearTimeout:id=>timers.delete(id)};
 vm.runInNewContext(fs.readFileSync('modules/idle-avatar.js','utf8'),context);
 const idle=new context.module.exports.IdleAvatar();
 return {idle,video,cover,motion,timers,draws:()=>draws,run(){const list=[...timers.values()];timers.clear();list.forEach(t=>t.fn())}};
}
test('a blink settles within the first-audio buffer and idle stops before speech',async()=>{
 const h=harness();await Promise.resolve();h.video.currentTime=2.25;const settled=h.idle.prepareSpeech();
 assert.equal(h.idle.speaking,true);assert.ok([...h.timers.values()][0].ms<=360);h.run();assert.equal(h.video.style.opacity,'0');h.run();await settled;assert.equal(h.video.paused,true);
});
test('hold the previous frame until a decoded speech frame is presented',async()=>{
 const h=harness();h.idle.prepareSpeech();h.run();h.run();
 const speech={readyState:2,paused:false,style:{},requestVideoFrameCallback(cb){this.ready=cb}};
 h.idle.holdSpeech(speech,true);assert.equal(h.draws(),1);assert.equal(h.cover.style.opacity,'1');
 h.idle.revealSpeech(speech);assert.equal(speech.style.opacity,undefined);speech.ready();assert.equal(speech.style.opacity,'1');assert.equal(h.cover.style.opacity,'0');
});
test('interruption invalidates a delayed decoded-frame callback',()=>{
 const h=harness();h.idle.prepareSpeech();const speech={readyState:2,paused:false,style:{},requestVideoFrameCallback(cb){this.ready=cb}};
 h.idle.revealSpeech(speech);h.idle.holdSpeech(speech,false);speech.ready();assert.equal(speech.style.opacity,undefined);h.run();h.idle.dispose();
});
test('disabled and reduced-motion preferences stop idle playback',async()=>{
 const h=harness();await Promise.resolve();h.idle.setEnabled(false);assert.equal(h.video.paused,true);h.idle.setEnabled(true);h.motion.matches=true;h.idle.onMotion();await Promise.resolve();assert.equal(h.video.style.opacity,'0');h.idle.dispose();
});
