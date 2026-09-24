const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
function harness(render){
    const urls=[],players=[],sources=[];let cancels=0;
    class AudioContext { constructor(){this.currentTime=0} resume(){return Promise.resolve()} close(){return Promise.resolve()} createGain(){return {gain:{value:1},connect(){},disconnect(){}}} createBuffer(_channels,count,rate){return {duration:count/rate,getChannelData:()=>new Float32Array(count)}} createBufferSource(){const source={connect(){},disconnect(){},start(at){this.at=at},stop(){this.stopped=true}};sources.push(source);return source} }
    class Player {constructor(){players.push(this)}play(){this.started=true;return Promise.resolve()}pause(){this.paused=true}removeAttribute(){}load(){}}
    const video=new Player();
    const context={AudioContext,module:{exports:{}},window:{nodie:{renderLipSegment:render,cancelLipSync:async()=>{cancels++}}},document:{getElementById:()=>video},Audio:Player,Blob,Float32Array,Uint8Array,DataView,setTimeout,clearTimeout,URL:{createObjectURL:()=>{const url='blob:'+urls.length;urls.push(url);return url},revokeObjectURL(){}}};
    vm.runInNewContext(fs.readFileSync('modules/streaming-lip-sync.js','utf8'),context);
    const errors=[];const renderer={state:{avatarEnabled:true,speakerMuted:false,avatarManager:{setSpeechVideo(){}}},showNotification:x=>errors.push(x)};
    return {queue:new context.module.exports.StreamingLipSync(renderer),video,players,sources,errors,urls,cancels:()=>cancels};
}
const tick=()=>new Promise(r=>setImmediate(r));
test('streaming PCM is scheduled before video resolves and preserves segment order',async()=>{
    const pending=[];const h=harness(audio=>new Promise(resolve=>pending.push({audio,resolve})));
    h.queue.push(new Float32Array(30720),48000);h.queue.push(new Float32Array(30720),48000);
    assert.equal(pending.length,1);assert.equal(h.video.started,undefined);assert.equal(h.sources.length,2);
    const wav=Buffer.from(pending[0].audio);assert.equal(wav.toString('ascii',0,4),'RIFF');assert.equal(wav.readUInt32LE(40),61440);
    pending[0].resolve(new Uint8Array(16));await new Promise(r=>setTimeout(r,780));assert.equal(h.video.started,true);assert.equal(pending.length,2);
    pending[1].resolve(new Uint8Array(16));await tick();assert.equal(h.urls.length,1);
    assert.equal(h.sources[1].at,h.sources[0].at+.64);h.queue.context.currentTime=h.sources[1].at;h.sources[0].onended();await tick();assert.equal(h.urls.length,2);h.queue.cancel();
});
test('interruption discards an in-flight video and never plays stale audio fallback',async()=>{
    let reject;const h=harness(()=>new Promise((_r,j)=>reject=j));
    h.queue.push(new Float32Array(30720),48000);h.queue.cancel();reject(new Error('cancelled'));await tick();
    assert.equal(h.urls.length,0);assert.equal(h.errors.length,0);assert.equal(h.cancels(),1);
});
test('neural failure plays the same speech as audio and mute updates the active player',async()=>{
    const h=harness(async()=>{throw new Error('GPU unavailable')});h.queue.push(new Float32Array(30720),48000);await tick();
    assert.equal(h.errors.length,1);assert.equal(h.sources.length,1);assert.equal(h.urls.length,0);
    h.queue.setMuted(true);assert.equal(h.queue.gain.gain.value,0);h.queue.cancel();assert.equal(h.sources[0].stopped,true);
});

test('slow rendering cannot delay later PCM and expired videos are discarded',async()=>{
    let finish;const h=harness(()=>new Promise(resolve=>finish=resolve));
    h.queue.push(new Float32Array(30720),48000);h.queue.push(new Float32Array(30720),48000);
    assert.equal(h.sources.length,2);assert.equal(h.sources[1].at,h.sources[0].at+.64);
    h.queue.context.currentTime=3;h.sources[0].onended();h.sources[1].onended();
    finish(new Uint8Array(16));await tick();assert.equal(h.urls.length,0);assert.equal(h.sources.length,2);h.queue.cancel();
});
test('server rejects a render submitted with a pre-cancelled generation',async()=>{
    const {StreamingLipSync}=require('../../lib/streaming-lip-sync');const server=new StreamingLipSync({url:'http://127.0.0.1:1'});
    const generation=server.generation;server.cancel();
    await assert.rejects(server.render(new Uint8Array(44),generation),/cancelled/);
});

test('video catches up with audio after asynchronous decoder startup',async()=>{
    const h=harness(async()=>new Uint8Array(16));
    h.video.play=async()=>{h.queue.context.currentTime=1.03;};
    h.queue.push(new Float32Array(30720),48000);
    await new Promise(r=>setTimeout(r,800));
    assert.equal(h.video.currentTime,0);
    assert.equal(h.video.playbackRate,1.3);
    h.video.currentTime=.29;await new Promise(r=>setTimeout(r,50));
    assert.ok(h.video.playbackRate<1 && h.video.playbackRate>=.9);
    h.queue.cancel();
});

test('the final audio restores idle even when its video never arrives',async()=>{
    const pending=[];const held=[];
    const h=harness(()=>new Promise(resolve=>pending.push(resolve)));
    h.video.style={};
    h.queue.renderer.state.avatarManager.idle={prepareSpeech(){},holdSpeech(_video,continuing){held.push(continuing)}};
    h.queue.push(new Float32Array(30720),48000);h.queue.push(new Float32Array(30720),48000);
    pending[0](new Uint8Array(16));await tick();
    h.queue.context.currentTime=h.sources[1].at;h.sources[0].onended();
    assert.equal(held.at(-1),true);
    h.queue.context.currentTime=3;h.sources[1].onended();
    assert.equal(held.at(-1),false);
    assert.equal(h.queue.activeJob,null);
    pending[1](new Uint8Array(16));await tick();assert.equal(h.queue.activeJob,null);
    h.queue.cancel();
});

test('expiring final video does not count its own source as continuing speech',async()=>{
 const h=harness(()=>new Promise(()=>{}));const held=[];
 h.queue.renderer.state.avatarManager.idle={prepareSpeech(){},holdSpeech(_v,c){held.push(c)}};
 h.queue.push(new Float32Array(30720),48000);
 h.queue.activeJob={source:h.sources[0]};h.queue.release();
 assert.equal(held.at(-1),false);h.queue.cancel();
});
test('oversized PCM splits without losing samples and rejects invalid inputs', async()=>{
 const h=harness(()=>new Promise(()=>{}));
 h.queue.push(new Float32Array(70000),48000);
 assert.equal(h.sources.length,2);assert.equal(h.queue.length,8560);
 for(const [frame,rate] of [[new Float32Array(),48000],[[1],48000],[new Float32Array(1),48000.5]]) h.queue.push(frame,rate);
 assert.equal(h.queue.length,8560);h.queue.flush();assert.equal(h.sources.length,3);await h.queue.cancel();
});
test('cancellation awaits context close and prevents premature replacement', async()=>{
 const h=harness(()=>new Promise(()=>{}));h.queue.push(new Float32Array(30720),48000);
 const old=h.queue.context;let finish;old.close=()=>new Promise(resolve=>{finish=resolve;});
 let done=false;const close=h.queue.cancel().then(()=>{done=true;});await tick();
 assert.equal(done,false);assert.equal(h.queue.context,old);
 h.queue.push(new Float32Array(30720),48000);assert.equal(h.sources.length,1);
 finish();await close;await tick();assert.equal(h.sources.length,2);assert.notEqual(h.queue.context,old);await h.queue.cancel();
});
test('context close cannot block cancellation indefinitely', async()=>{
 const h=harness(()=>new Promise(()=>{}));h.queue.push(new Float32Array(30720),48000);h.queue.context.close=()=>new Promise(()=>{});
 await h.queue.cancel();assert.equal(h.queue.context,null);assert.equal(h.queue.closing,null);
});

test('neural clips carry past and queued future speech without replaying context audio',async t=>{
 const pending=[];const h=harness((audio,trim)=>new Promise(resolve=>pending.push({audio,trim,resolve})));t.after(()=>h.queue.cancel());
 h.queue.push(new Float32Array(30720).fill(.1),48000);
 h.queue.push(new Float32Array(30720).fill(.2),48000);
 h.queue.push(new Float32Array(30720).fill(.3),48000);
 assert.equal(h.sources.length,3);
 pending[0].resolve(new Uint8Array(16));await tick();
 const p=pending[1],wav=Buffer.from(p.audio);
 assert.equal(p.trim.startFrame,8);assert.equal(p.trim.frameCount,16);
 assert.equal(wav.readUInt32LE(40),Math.round(48000*1.12*2));
 assert.equal(wav.readInt16LE(44),Math.round(.1*32767));
 assert.equal(wav.readInt16LE(44+15360*2),Math.round(.2*32767));
 assert.equal(wav.readInt16LE(44+46080*2),Math.round(.3*32767));
 assert.ok(Math.abs(h.sources[1].buffer.duration-.64)<1e-9);
 h.queue.cancel();pending[1].resolve(new Uint8Array(16));await tick();
 assert.equal(h.queue.pastPCM,null);
 h.queue.pastPCM=new Uint8Array(8);h.queue.beginResponse();assert.equal(h.queue.pastPCM,null);
});

test('frame ranges are bounded before a render request can start',async()=>{
 let audio;const h=harness(async wav=>{audio=wav;return new Uint8Array(16)});
 h.queue.push(new Float32Array(30720),48000);await tick();h.queue.cancel();
 const {StreamingLipSync}=require('../../lib/streaming-lip-sync');const server=new StreamingLipSync({url:'http://127.0.0.1:1'});
 for(const trim of [{startFrame:-1,frameCount:16},{startFrame:9,frameCount:1},{startFrame:0,frameCount:99},{startFrame:0,frameCount:16,path:'/tmp/x'},{startFrame:NaN,frameCount:16}])
  await assert.rejects(server.render(audio,undefined,trim),/Invalid lip-sync frame range/);
});


test('short final clips pad complete frames without lengthening audible speech',async t=>{
 for(const length of [1,480,3168,10000]) {
  let request;const h=harness(async(audio,trim)=>{request={audio:Buffer.from(audio),trim};return new Uint8Array(16)});
  t.after(()=>h.queue.cancel());h.queue.push(new Float32Array(length),48000);h.queue.flush();await tick();
  assert.equal(h.sources[0].buffer.duration,length/48000);
  assert.ok(request.trim.frameCount>=3);
  const duration=request.audio.readUInt32LE(40)/2/48000;
  assert.ok((request.trim.startFrame+request.trim.frameCount)/25<=duration);
 }
});
test('non-frame-divisible sample rates keep whole PCM samples and omit context trimming',async t=>{
 let request;const h=harness(async(audio,trim)=>{request={audio:Buffer.from(audio),trim};return new Uint8Array(16)});
 t.after(()=>h.queue.cancel());h.queue.push(new Float32Array(28160),44101);h.queue.flush();await tick();
 assert.equal(request.trim,undefined);assert.equal(request.audio.readUInt32LE(40)%2,0);
 assert.equal(request.audio.readUInt32LE(24),44101);
});
