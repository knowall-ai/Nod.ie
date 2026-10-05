const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
function harness(videoPlay) {
    let revoked = 0, audioStarts = 0, visible = false;
    class Audio { play() { audioStarts++; return Promise.resolve(); } pause() {} removeAttribute() {} load() {} }
    const video = { play: videoPlay, pause() {}, removeAttribute() {}, load() {} };
    const context = { window: { nodie: { voiceCancel: async () => {} } }, document: { getElementById: id => id === 'avatar-video' ? video : null }, Audio, Blob, clearTimeout, clearInterval, setTimeout,
        URL: { createObjectURL: () => 'blob:test', revokeObjectURL: () => revoked++ } };
    vm.runInNewContext(fs.readFileSync('modules/local-voice-session.js', 'utf8'), context);
    const session = new context.window.LocalVoiceSession({ state: { avatarManager: { isEnabled: () => true, setSpeechVideo: value => visible = value } }, setStatus() {} });
    return { session, video, window:context.window, stats: () => ({ revoked, audioStarts, visible }) };
}
test('video decoder failure falls back to audio once and clears handlers and media URLs', async () => {
    const h = harness(() => Promise.reject(new Error('Unsupported codec')));
    await h.session.playReply({ audio: new Uint8Array(44), video: new Uint8Array(16) }, 0);
    assert.equal(h.stats().audioStarts, 1); assert.equal(h.stats().visible, false); assert.equal(h.stats().revoked, 1);
    assert.equal(h.video.onended, null); assert.equal(h.video.onerror, null);
    h.session.cancel(); assert.equal(h.stats().revoked, 2); assert.equal(h.session.player, null);
});
test('cancelled pending video play cannot return to speaking or start audio later', async () => {
    let reject;
    const h = harness(() => new Promise((_resolve, fail) => { reject = fail; }));
    const playing = h.session.playReply({ audio: new Uint8Array(44), video: new Uint8Array(16) }, 0);
    h.session.cancel(); reject(new Error('Playback interrupted')); await playing;
    assert.equal(h.session.state, 'idle'); assert.equal(h.stats().audioStarts, 0); assert.equal(h.stats().visible, false);
    assert.equal(h.session.player, null); assert.equal(h.video.onerror, null); assert.equal(h.stats().revoked, 1);
});

test('continuous listening resumes after playback but cancellation invalidates a queued resume', async () => {
    const h = harness(() => Promise.resolve()); let starts = 0;
    h.session.listeningEnabled = true;
    h.session.toggle = async () => { starts++; };
    await h.session.playReply({ audio: new Uint8Array(44), video: new Uint8Array(16) }, 0);
    assert.equal(starts, 0);
    h.video.onended();
    await new Promise(resolve => setTimeout(resolve, 300));
    assert.equal(starts, 1);
    h.session.resumeListening(5); h.session.cancel();
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(starts, 1); assert.equal(h.session.listeningEnabled, false);
});
test('spoken microphone-off prevents resuming after the acknowledgement', async () => {
    const h = harness(() => Promise.resolve()); let starts = 0;
    h.session.toggle = async () => { starts++; };
    h.session.listeningEnabled = false;
    await h.session.playReply({ audio: new Uint8Array(44), video: new Uint8Array(16) }, 0);
    h.video.onended();
    await new Promise(resolve => setTimeout(resolve, 300));
    assert.equal(starts, 0);
});

test('local initialization preserves explicit listening intent and cancels stale health results',async()=>{
 let health,starts=0;const context={window:{nodie:{voiceHealth:()=>new Promise(r=>{health=r;}),voiceCancel:async()=>{}}},document:{getElementById:()=>null},clearTimeout,clearInterval};
 vm.runInNewContext(fs.readFileSync('modules/local-voice-session.js','utf8'),context);
 const renderer={state:{isMuted:true},setStatus(){},updateWSStatus(){}};
 const session=new context.window.LocalVoiceSession(renderer);session.toggle=async()=>{starts++;};
 let pending=session.initialize(true);health({ready:true});await pending;assert.equal(starts,1);
 pending=session.initialize(false);health({ready:true});await pending;assert.equal(starts,1);
 pending=session.initialize(true);session.cancel();health({ready:true});await pending;assert.equal(starts,1);assert.equal(renderer.state.isMuted,true);
});

test('local Debug does not call an intercepted or muted reply spoken before playback',async()=>{
 const h=harness(()=>Promise.resolve()),rows=[];h.session.renderer.debugStream={add:(source,text)=>rows.push([source,text])};
 h.session.debugTurn({transcript:'Nodie go full screen',reply:'Unplayed reply',wordAttribution:{state:'unavailable',reason:'missing-timestamps'}});
 assert.ok(rows.some(([source])=>source==='Heard'));assert.ok(!rows.some(([source])=>source==='Said'));
 h.session.renderer.state.speakerMuted=true;await h.session.playReply({audio:new Uint8Array(44),reply:'Muted'},0);assert.ok(!rows.some(([source])=>source==='Said'));h.session.cancel();
 h.session.renderer.state.speakerMuted=false;await h.session.playReply({audio:new Uint8Array(44),reply:'Actually playing'},h.session.generation);assert.deepEqual(rows.filter(([source])=>source==='Said'),[['Said','Actually playing']]);h.session.cancel();
});
test('a cancelled delayed playback cannot claim a reply was spoken',async()=>{
 let played;const h=harness(()=>new Promise(resolve=>played=resolve)),rows=[];h.session.renderer.debugStream={add:(source,text)=>rows.push([source,text])};
 const pending=h.session.playReply({audio:new Uint8Array(44),video:new Uint8Array(16),reply:'Cancelled'},0);h.session.cancel();played();await pending;assert.equal(rows.length,0);
});

test('a locally intercepted command logs heard words but never calls playback or Said',async()=>{
 const h=harness(()=>Promise.resolve()),rows=[];h.session.renderer.debugStream={add:(source,text)=>rows.push([source,text])};
 h.window.nodie.voiceTurn=async()=>({transcript:'Nodie go full screen',reply:'Not played',wordAttribution:{state:'unavailable'}});
 h.window.SpokenControls=class{async accept(){return true;}};let plays=0;h.session.playReply=async()=>{plays++;};
 await h.session.send([new Blob(['synthetic audio'])],0);assert.equal(plays,0);assert.ok(rows.some(([source])=>source==='Heard'));assert.ok(!rows.some(([source])=>source==='Said'));
});
test('a visual reply arriving after camera off/reopen is discarded before playback',async()=>{
 const h=harness(()=>Promise.resolve());h.session.renderer.visionContext={cameraEpoch:1,prepareLocalTurn:async()=>{}};let resumed=0;
 h.session.resumeListening=()=>resumed++;
 h.window.nodie.voiceTurn=async()=>{h.session.renderer.visionContext.cameraEpoch=2;return {transcript:'What is here?',reply:'Old view',vision:{state:'snapshot'},audio:new Uint8Array(44)};};
 await h.session.send([new Blob([new Uint8Array(200)])],0);assert.equal(h.stats().audioStarts,0);assert.equal(h.session.state,'idle');assert.equal(resumed,1);
});
test('visual history acknowledgement follows actual audible playback, never muted playback',async()=>{
 for(const muted of [false,true]){const h=harness(()=>Promise.resolve());let acks=0;h.window.nodie.visualReplyStarted=async id=>{assert.equal(id,'fixture-turn');acks++;};h.session.renderer.state.speakerMuted=muted;await h.session.playReply({audio:new Uint8Array(44),reply:'The mug is red.',vision:{turnId:'fixture-turn'}},0);assert.equal(acks,muted?0:1);h.session.cancel();}
});
test('camera change during awaited control parsing prevents a visual reply from starting',async()=>{
 const h=harness(()=>Promise.resolve());h.session.renderer.visionContext={active:true,cameraEpoch:1,prepareLocalTurn:async()=>{}};h.session.resumeListening=()=>{};
 h.window.nodie.voiceTurn=async()=>({transcript:'What is here?',reply:'Old view',vision:{state:'snapshot'},audio:new Uint8Array(44)});
 h.window.SpokenControls=class{async accept(){h.session.renderer.visionContext.cameraEpoch=2;h.session.cameraChanged(2);return false;}};
 await h.session.send([new Blob([new Uint8Array(200)])],0);assert.equal(h.stats().audioStarts,0);assert.ok(!h.session.player);
});
test('camera change stops an already-playing visual reply',async()=>{
 const h=harness(()=>Promise.resolve());h.session.renderer.visionContext={cameraEpoch:1};h.session.resumeListening=()=>{};await h.session.playReply({audio:new Uint8Array(44),reply:'The mug is red.'},0,true,1);assert.equal(h.stats().audioStarts,1);h.session.renderer.visionContext.cameraEpoch=2;h.session.cameraChanged(2);assert.equal(h.session.player,null);assert.equal(h.session.state,'idle');assert.equal(h.session.generation,1);
});
test('accepted commands and silent turns clear the visual tracker before another recording',async()=>{
 for(const silent of [false,true]){const h=harness(()=>Promise.resolve());h.session.renderer.visionContext={active:true,cameraEpoch:1,prepareLocalTurn:async()=>{}};h.session.resumeListening=()=>{};h.window.nodie.voiceTurn=async()=>({transcript:'Nodie, stop listening',reply:'',silent,vision:{state:'snapshot'}});h.window.SpokenControls=class{async accept(){return !silent;}};
 await h.session.send([new Blob([new Uint8Array(200)])],0);assert.equal(h.session.visualEpoch,undefined);h.session.state='recording';h.session.cameraChanged(2);assert.equal(h.session.generation,0);assert.equal(h.session.state,'recording');}
});
