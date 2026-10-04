const test=require('node:test'),assert=require('node:assert/strict');
const {CalibrationCapture}=require('../../modules/calibration-capture');
class Recorder{
 static isTypeSupported(){return true;}
 constructor(stream){this.stream=stream;this.state='inactive';}
 start(){this.state='recording';}
 stop(){this.state='inactive';this.ondataavailable?.({data:new Blob([new Uint8Array(120)])});this.onstop?.();}
}
function fixture(t){
 const track={readyState:'live'},stream={getAudioTracks:()=>[track]};let pauses=0,resumes=0;
 const r={state:{isMuted:false,audioCapture:{stream,isCapturing:true,isPaused:false,pause(){this.isPaused=true;pauses++;},resume(){this.isPaused=false;resumes++;}}},isAssistantSpeaking:false};
 const calls=[],failures=[],api={submitCalibration:async(...a)=>calls.push(a),calibrationFailure:async(...a)=>failures.push(a)};
 const c=new CalibrationCapture(r,api,{Recorder,doc:{}});t.after(()=>c.cancel());return {c,r,track,calls,failures,counts:()=>({pauses,resumes})};
}
test('four-second voice capture shares the active microphone and restores its transport without stopping tracks',async t=>{
 t.mock.timers.enable({apis:['setTimeout','setInterval']});const {c,r,track,calls,counts}=fixture(t);const pending=c.capture({token:'one',kind:'voice'});
 assert.equal(r.state.audioCapture.isPaused,true);t.mock.timers.tick(4001);await pending;
 assert.equal(calls[0][0],'one');assert.equal(calls[0][1].length,120);assert.deepEqual(counts(),{pauses:1,resumes:1});assert.equal(track.readyState,'live');assert.equal(c.active,false);
});
test('muted microphones and assistant playback cannot produce a calibration sample',async t=>{
 for(const mode of ['muted','speaking']){const {c,r,calls,failures}=fixture(t);if(mode==='muted')r.state.isMuted=true;else r.isAssistantSpeaking=true;
 await c.capture({token:'one',kind:'voice'});assert.equal(calls.length,0);assert.equal(failures[0][1],mode==='muted'?'microphone-off':'assistant-speaking');}
});
test('microphone shutdown or cancellation discards the partial clip and restores only the original transport',async t=>{
 t.mock.timers.enable({apis:['setTimeout','setInterval']});const {c,track,calls,failures,counts}=fixture(t);const pending=c.capture({token:'one',kind:'voice'});track.readyState='ended';t.mock.timers.tick(101);await pending;
 assert.equal(calls.length,0);assert.equal(failures[0][1],'device-changed');assert.deepEqual(counts(),{pauses:1,resumes:1});
});
test('existing camera snapshots are bounded, cleared and cannot enable an off camera',async t=>{
 const {c,r,calls,failures}=fixture(t);await c.capture({token:'off',kind:'face'});assert.equal(failures[0][1],'camera-off');
 const video={readyState:2,videoWidth:1920,videoHeight:1080},canvas={getContext:()=>({drawImage:()=>{}}),toBlob:cb=>cb(new Blob([new Uint8Array(120)]))};
 r.controls={cameraSource:{active:true,video}};c.doc={createElement:()=>canvas};await c.capture({token:'on',kind:'face'});
 assert.equal(calls[0][0],'on');assert.equal(canvas.width,0);assert.equal(canvas.height,0);
});
test('hung submission cannot leave voice transport paused or the capture guard occupied',async t=>{
 t.mock.timers.enable({apis:['setTimeout','setInterval']});const {c,counts}=fixture(t);c.api.submitCalibration=()=>new Promise(()=>{});
 const pending=c.capture({token:'one',kind:'voice'});t.mock.timers.tick(4001);await new Promise(r=>setImmediate(r));t.mock.timers.tick(6000);await pending;
 assert.deepEqual(counts(),{pauses:1,resumes:1});assert.equal(c.active,false);assert.equal(c.pending,null);
});
test('camera encoding that stalls is cancelled and its canvas pixels are discarded at the deadline',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const {c,r,calls}=fixture(t);const canvas={getContext:()=>({drawImage:()=>{}}),toBlob:()=>{}};
 r.controls={cameraSource:{active:true,generation:1,video:{readyState:2,videoWidth:1920,videoHeight:1080}}};c.doc={createElement:()=>canvas};
 const pending=c.capture({token:'one',kind:'face'});t.mock.timers.tick(10001);await pending;
 assert.equal(canvas.width,0);assert.equal(canvas.height,0);assert.equal(calls.length,0);assert.equal(c.active,false);
});
