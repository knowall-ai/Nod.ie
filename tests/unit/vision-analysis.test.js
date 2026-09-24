const test=require('node:test');const assert=require('node:assert/strict');
const {VisionAnalysis}=require('../../lib/vision-analysis');const Context=require('../../modules/vision-context');
const jpeg=new Uint8Array([255,216,1,255,217]);
test('vision uses image-capable local model, disables thinking and bounds output',async()=>{
 let request;const service=new VisionAnalysis({fetchImpl:async(url,options)=>{request=JSON.parse(options.body);return Response.json({message:{content:'A cat on a chair.'}});}});
 assert.deepEqual(await service.analyse(jpeg),{status:'ready',description:'A cat on a chair.'});
 assert.equal(request.think,false);assert.equal(request.stream,false);assert.equal(request.messages[1].images[0],Buffer.from(jpeg).toString('base64'));assert.ok(request.options.num_predict<=140);
 await assert.rejects(service.analyse(new Uint8Array([1,2,3])));
});
test('one request, cancellation and timeout cannot publish stale results',async()=>{
 let finish;const service=new VisionAnalysis({fetchImpl:()=>new Promise(r=>{finish=r;})});const pending=service.analyse(jpeg);
 assert.equal((await service.analyse(jpeg)).status,'busy');service.cancel();finish(Response.json({message:{content:'stale'}}));assert.equal((await pending).status,'cancelled');
 const timed=new VisionAnalysis({timeoutMs:5,fetchImpl:(_u,{signal})=>new Promise((_r,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted'))))});
 assert.equal((await timed.analyse(jpeg)).status,'unavailable');
});
test('oversized output and tool calls are rejected',async()=>{
 for(const data of [{message:{content:'x'.repeat(33000)}},{message:{content:'fine',tool_calls:[{}]}},{message:{thinking:'private'}}]) {
  const service=new VisionAnalysis({fetchImpl:async()=>Response.json(data)});assert.equal((await service.analyse(jpeg)).status,'unavailable');
 }
});
function fixture(t){let now=Date.now();const sent=[];
 const renderer={state:{isConnected:true,wsHandler:{send:x=>sent.push(x)}},unmuteBasePrompt:'You are Nodie.',showNotification(){}};
 const api={analyseVision:async()=>{throw Error('Background model must not run')}};
 const context=new Context(renderer,api,{now:()=>now});t.after(()=>context.dispose());context.setActive(true);
 return {context,renderer,sent,advance:n=>{now+=n;},frame:()=>({image:new Blob([jpeg]),capturedAt:new Date(now).toISOString(),signal:new AbortController().signal})};
}
test('voice receives the actual JPEG separately from authoritative camera state',async t=>{
 const h=fixture(t);await h.context.analyse(h.frame());const session=h.sent.at(-1).session;
 assert.equal(session.scene_data.imageJpeg,Buffer.from(jpeg).toString('base64'));
 assert.match(session.instructions.text,/camera device state: ON/);assert.equal(session.allow_recording,false);
 assert.equal(session.scene_data.description,undefined);assert.doesNotMatch(session.instructions.text,/\/9gB\/9k=/);
 assert.equal(h.context.canAnalyse(),false);h.advance(2001);assert.equal(h.context.canAnalyse(),true);
 h.context.setActive(false);assert.deepEqual(h.sent.at(-1).session.scene_data,{status:'camera-off'});
 assert.match(h.sent.at(-1).session.instructions.text,/camera device state: OFF/);
});
test('camera off during JPEG conversion discards the late image',async t=>{
 const h=fixture(t);let finish;const frame=h.frame();frame.image={arrayBuffer:()=>new Promise(r=>finish=r)};
 const pending=h.context.analyse(frame);h.context.setActive(false);finish(jpeg.buffer);await pending;
 assert.equal(h.context.scene,null);assert.equal(h.sent.at(-1).session.scene_data.status,'camera-off');
});
test('expired image leaves the camera ON and is not sent',async t=>{
 const h=fixture(t);await h.context.analyse(h.frame());h.advance(76000);h.context.update();
 const session=h.sent.at(-1).session;assert.equal(session.scene_data.status,'camera-on-awaiting-analysis');
 assert.match(session.instructions.text,/Camera is ON/);assert.equal(session.scene_data.imageJpeg,undefined);
});
test('speech requests a fresh selected image without a background vision inference',async t=>{
 const h=fixture(t);let requests=0;h.renderer.controls={updateCamera(){},cameraSource:{requestFrame:()=>requests++}};
 h.context.voiceEvent({type:'conversation.item.input_audio_transcription.delta'});assert.equal(requests,1);
 await h.context.analyse(h.frame());assert.equal(h.context.status,'snapshot');
 h.context.setActive(false);h.context.voiceEvent({type:'conversation.item.input_audio_transcription.delta'});assert.equal(requests,1);
});
test('invalid JPEG never replaces the current camera image',async t=>{
 const h=fixture(t);await h.context.analyse(h.frame());h.advance(2001);const scene=h.context.scene;
 const f=h.frame();f.image=new Blob(['not jpeg']);assert.deepEqual(await h.context.analyse(f),{retry:true});assert.equal(h.context.scene,scene);
});
