const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
function harness(devicePixelRatio=1){
 const timers=new Map();let id=0,draws=0;const listeners={};const video={currentTime:0,style:{},play(){this.paused=false;return Promise.resolve()},pause(){this.paused=true},load(){},addEventListener(name,fn){listeners[name]=fn}};
 const cover={width:512,height:512,style:{},getContext:()=>({drawImage(){draws++}})};
 const motion={matches:false,addEventListener(){},removeEventListener(){}};
 const context={Math:Object.assign(Object.create(Math),{random:()=>.999}),module:{exports:{}},window:{devicePixelRatio,matchMedia:()=>motion},document:{getElementById:id=>id==='avatar-idle'?video:cover},setTimeout:(fn,ms)=>{timers.set(++id,{fn,ms});return id},clearTimeout:id=>timers.delete(id)};
 vm.runInNewContext(fs.readFileSync('modules/idle-avatar.js','utf8'),context);
 const idle=new context.module.exports.IdleAvatar();
 return {idle,video,cover,motion,timers,listeners,draws:()=>draws,run(){const list=[...timers.values()];timers.clear();list.forEach(t=>t.fn())}};
}
test('a blink settles within the first-audio buffer and idle stops before speech',async()=>{
 const h=harness();await Promise.resolve();h.video.currentTime=2.25;const settled=h.idle.prepareSpeech();
 assert.equal(h.idle.speaking,true);assert.ok([...h.timers.values()][0].ms<=360);h.run();assert.equal(h.video.style.opacity,'0');h.run();await settled;assert.equal(h.video.paused,true);
});
test('hold the previous frame until a decoded speech frame is presented',async()=>{
 const h=harness();h.idle.prepareSpeech();h.run();h.run();
 const speech={readyState:2,paused:false,style:{},requestVideoFrameCallback(cb){this.ready=cb}};
 h.idle.holdSpeech(speech,true);assert.equal(h.draws(),1);assert.equal(h.cover.style.opacity,'1');
 h.idle.revealSpeech(speech);assert.equal(speech.style.opacity,undefined);speech.ready();assert.equal(speech.style.opacity,'1');assert.equal(h.cover.style.opacity,'0');assert.equal(h.cover.style.transition,'none');assert.equal(speech.style.transition,'none');
});
test('interruption invalidates a delayed decoded-frame callback',()=>{
 const h=harness();h.idle.prepareSpeech();const speech={readyState:2,paused:false,style:{},requestVideoFrameCallback(cb){this.ready=cb}};
 h.idle.revealSpeech(speech);h.idle.holdSpeech(speech,false);speech.ready();assert.equal(speech.style.opacity,undefined);h.run();h.idle.dispose();
});
test('disabled and reduced-motion preferences stop idle playback',async()=>{
 const h=harness();await Promise.resolve();h.idle.setEnabled(false);assert.equal(h.video.paused,true);h.idle.setEnabled(true);h.motion.matches=true;h.idle.onMotion();await Promise.resolve();assert.equal(h.video.style.opacity,'0');h.idle.dispose();
});

test('idle gestures leave bounded quiet pauses and speech cancels the next gesture',()=>{
 const h=harness();h.listeners.ended();assert.equal(h.video.paused,true);
 const pending=[...h.timers.values()];assert.equal(pending.length,1);assert.ok(pending[0].ms>=1800&&pending[0].ms<=4200);
 h.run();assert.match(h.video.src,/assets\/avatars\/nodie-(idle-blink|look-left|look-right|head-tilt)\.mp4/);
 h.listeners.ended();h.idle.prepareSpeech();assert.equal([...h.timers.values()].some(t=>t.ms>=1800),false);h.idle.dispose();
});

test('a head tilt cannot be selected again within one minute',()=>{
 const h=harness();h.idle.scheduleNext();h.run();assert.equal(h.idle.clip.name,'nodie-head-tilt');
 h.idle.scheduleNext();h.run();assert.notEqual(h.idle.clip.name,'nodie-head-tilt');h.idle.scheduleNext();h.run();assert.notEqual(h.idle.clip.name,'nodie-head-tilt');h.idle.dispose();
});

test('a stale play rejection cannot hide a newer motion-preference playback',async()=>{
 const h=harness();await Promise.resolve();let reject;
 h.video.play=()=>new Promise((_resolve,r)=>{reject=r});h.idle.refresh();
 h.motion.matches=true;h.idle.onMotion();
 h.video.play=()=>{h.video.paused=false;return Promise.resolve()};
 h.motion.matches=false;h.idle.onMotion();await Promise.resolve();
 reject(new Error('old attempt'));await Promise.resolve();await Promise.resolve();
 assert.equal(h.video.paused,false);assert.equal(h.video.style.opacity,'1');h.idle.dispose();
});

test('handoff canvas retains detail on scaled displays with bounded allocation',()=>{
 for(const [scale,pixels] of [[1,250],[2,500],[3,750],[5,1024]]) {
  const h=harness(scale);assert.equal(h.cover.width,pixels);assert.equal(h.cover.height,pixels);h.idle.dispose();
 }
});
