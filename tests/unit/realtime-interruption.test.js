const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
test('interruption clears buffered output, drops decoded tail, and preserves Opus continuity', async () => {
    const posts = []; let worker; let starts=0;
    class Context {
        constructor() { this.sampleRate = 48000; this.audioWorklet = { addModule: async () => {} }; }
        createGain() { return { gain: {}, connect() {}, disconnect() {} }; }
    }
    class Worker { constructor() { worker = this; } postMessage() {} }
    const context = { module: { exports: {} }, window: { NodieRenderer: {onAudioPlaybackStart(){starts++}}, AudioContext: Context, location: { pathname: '/' } },
        AudioWorkletNode: class { constructor() { this.port = { postMessage: x => posts.push(x) }; } connect() {} }, Worker, console: { log() {}, info() {}, debug() {} } };
    vm.runInNewContext(fs.readFileSync('modules/audio-playback-web.js', 'utf8'), context);
    const player = new context.module.exports(); await player.initialize();
    const decoder = player.decoderWorker;
    worker.onmessage({ data: {generation:0,frames:[new Float32Array(128)]} });
    player.interrupt();
    await player.processAudioDelta(new Uint8Array(0));
    assert.equal(starts,0);
    worker.onmessage({ data: {generation:0,frames:[new Float32Array(128)]} });
    assert.deepEqual(posts.map(x => x.type), ['audio', 'reset']);
    assert.equal(player.decoderWorker, decoder);
    player.beginResponse();
    worker.onmessage({ data: {generation:0,frames:[new Float32Array(128)]} });
    assert.deepEqual(posts.map(x => x.type), ['audio', 'reset', 'reset']);
    worker.onmessage({ data: {generation:player.generation,frames:[new Float32Array(128)]} });
    assert.deepEqual(posts.map(x => x.type), ['audio', 'reset', 'reset', 'audio']);
});
test('both Unmute interruption events clear speech without stopping microphone capture', async () => {
    const context = { window: { addEventListener() {} }, document: { readyState: 'loading', addEventListener() {} }, console: { debug() {} }, module: { exports: {} }, clearTimeout };
    vm.runInNewContext(fs.readFileSync('renderer.js', 'utf8'), context);
    const renderer = context.module.exports;
    let interrupted = 0;
    const capture = { stop() { assert.fail('Interruption stopped microphone'); } };
    renderer.state.audioCapture = capture;
    renderer.state.audioPlayback = { interrupt() { interrupted++; } };
    for (const type of ['input_audio_buffer.speech_started', 'unmute.interrupted_by_vad']) {
        renderer.pcmAudioAccumulator = [1]; renderer.isAssistantSpeaking = true;
        await renderer.handleRealtimeMessage({ type });
        assert.equal(renderer.pcmAudioAccumulator.length, 0); assert.equal(renderer.isAssistantSpeaking, false);
        assert.equal(renderer.state.audioCapture, capture);
    }
    await renderer.handleRealtimeMessage({ type: 'input_audio_buffer.speech_stopped' });
    assert.equal(interrupted, 2);
});
test('a notification uses the avatar status or its fallback, never both', () => {
    const status = { style: {} }, fallback = { style: {} };
    let showStatus = true;
    const context = { window: { addEventListener() {} }, document: { readyState: 'loading', addEventListener() {}, getElementById: id => id === 'status-text' ? (showStatus ? status : null) : id === 'notification' ? fallback : null }, console: { debug() {}, log() {} }, module: { exports: {} }, setTimeout() {} };
    vm.runInNewContext(fs.readFileSync('renderer.js', 'utf8'), context);
    context.module.exports.showNotification('Connection failed', 'error');
    assert.equal(status.textContent, 'Connection failed'); assert.equal(fallback.textContent, undefined);
    showStatus = false;
    context.module.exports.showNotification('Connection failed', 'error');
    assert.equal(fallback.textContent, 'Connection failed');
});
test('a new response cancels the previous response avatar-reset timer',async()=>{
 const timers=new Map();let next=0,resets=0;
 const context={window:{addEventListener(){}},document:{readyState:'loading',addEventListener(){}},console:{log(){},debug(){}},module:{exports:{}},setTimeout:(fn)=>{timers.set(++next,fn);return next},clearTimeout:id=>timers.delete(id)};
 vm.runInNewContext(fs.readFileSync('renderer.js','utf8'),context);const r=context.module.exports;r.flushPCMAudio=()=>{};r.state.avatarManager={setSpeechVideo(){resets++}};
 await r.handleRealtimeMessage({type:'response.created'});await r.handleRealtimeMessage({type:'response.done'});assert.equal(timers.size,1);
 await r.handleRealtimeMessage({type:'response.created'});assert.equal(timers.size,0);assert.equal(resets,0);
});

test('desktop readiness runs microphone capture; muted readiness never restarts it',async()=>{
 for(const platform of ['electron','web']) {
  let starts=0,stops=0;const analyser={};
  class Capture {async start(){starts++;}stop(){stops++;}getAnalyser(){return analyser;}}
  const context={window:{nodie:{platform},AudioCaptureWeb:Capture,addEventListener(){}},document:{readyState:'loading',addEventListener(){}},console:{log(){},debug(){}},module:{exports:{}}};
  vm.runInNewContext(fs.readFileSync('renderer.js','utf8'),context);const r=context.module.exports;
  r.setStatus=()=>{};r.hideLoadingText=()=>{};
  assert.equal(r.state.isMuted,platform!=='electron');r.state.isConnected=true;r.checkIfFullyLoaded();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(starts,platform==='electron'?1:0);
  if(platform==='electron')assert.equal(r.state.analyser,analyser);
  r.state.isMuted=true;r.stopMicrophone();r.checkIfFullyLoaded();await new Promise(resolve=>setImmediate(resolve));assert.equal(starts,platform==='electron'?1:0);
 }
});
test('desktop microphone startup failure restores muted state and reports it',async()=>{
 let stopped=0,notice;
 class Capture {async start(){throw Error('permission denied');}stop(){stopped++;}}
 const context={window:{nodie:{platform:'electron'},AudioCaptureWeb:Capture,addEventListener(){}},document:{readyState:'loading',addEventListener(){}},console:{log(){},debug(){}},module:{exports:{}}};
 vm.runInNewContext(fs.readFileSync('renderer.js','utf8'),context);const r=context.module.exports;
 r.setStatus=()=>{};r.showNotification=message=>{notice=message;};r.state.isConnected=true;
 await r.startMicrophone();assert.equal(stopped,1);assert.equal(r.state.isMuted,true);assert.equal(r.state.audioCapture,null);assert.match(notice,/permission denied/);
});
