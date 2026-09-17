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
test('server rejects segments cancelled while their upload was in progress',async()=>{
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
