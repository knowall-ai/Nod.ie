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
function fixture(t){let now=Date.now(),calls=0,cancels=0;const sent=[];
 const renderer={state:{isConnected:true,wsHandler:{send:x=>sent.push(x)}},unmuteBasePrompt:'You are Nodie.',showNotification(){}};
 const api={analyseVision:async()=>{calls++;return {status:'ready',description:'A cat.'};},cancelVision:async()=>{cancels++;}};
 const context=new Context(renderer,api,{now:()=>now});t.after(()=>context.dispose());context.setActive(true);
 return {context,renderer,api,sent,advance:n=>{now+=n;},calls:()=>calls,cancels:()=>cancels,frame:()=>({image:new Blob([jpeg]),capturedAt:new Date(now).toISOString(),signal:new AbortController().signal})};
}
test('voice gets priority, selected scene is bounded context and off clears it',async t=>{
 const h=fixture(t);h.context.initialCapture=false;assert.equal(h.context.canAnalyse(),false);h.advance(2100);await h.context.analyse(h.frame());assert.equal(h.calls(),1);
 assert.equal(h.sent.at(-1).session.scene_data.description,'A cat.');assert.doesNotMatch(h.sent.at(-1).session.instructions.text,/A cat/);assert.equal(h.sent.at(-1).session.allow_recording,false);
 assert.equal(h.context.canAnalyse(),false);h.advance(15000);assert.equal(h.context.canAnalyse(),true);
 h.context.voiceEvent({type:'response.audio.delta'});assert.equal(h.context.canAnalyse(),false);
 h.context.setActive(false);assert.equal(h.sent.at(-1).session.scene_data.status,'camera-off');assert.doesNotMatch(h.sent.at(-1).session.instructions.text,/A cat/);
});
test('camera off during analysis discards late scene, stale scenes expire',async t=>{
 const h=fixture(t);h.advance(2100);let finish;h.api.analyseVision=()=>new Promise(r=>{finish=r;});
 const pending=h.context.analyse(h.frame());await new Promise(r=>setImmediate(r));h.context.setActive(false);finish({status:'ready',description:'old scene'});await pending;
 assert.equal(h.context.scene,null);assert.equal(h.sent.at(-1).session.scene_data.status,'camera-off');
 h.context.active=true;h.context.scene={description:'stale',capturedAt:new Date(0).toISOString()};h.context.update();assert.equal(h.sent.at(-1).session.scene_data.status,'camera-on-awaiting-analysis');
});

test('explicit camera enable gets a first snapshot despite voice activity; later work yields',async t=>{
 const h=fixture(t);assert.equal(h.context.canAnalyse(),true);
 let finish;h.api.analyseVision=()=>new Promise(r=>{finish=r;});const pending=h.context.analyse(h.frame());await new Promise(r=>setImmediate(r));
 const before=h.cancels();h.context.voiceEvent({type:'response.created'});assert.equal(h.cancels(),before);
 finish({status:'ready',description:'A chair.'});await pending;assert.equal(h.context.initialCapture,false);
 assert.equal(h.context.status,'snapshot');assert.ok(!h.sent.at(-1).session.instructions.text.includes(Context.PENDING_ANALYSIS_MESSAGE));h.context.setActive(false);assert.equal(h.context.status,'camera-off');assert.ok(!h.sent.at(-1).session.instructions.text.includes(Context.PENDING_ANALYSIS_MESSAGE));
 h.context.setActive(true);assert.equal(h.context.status,'camera-on-awaiting-analysis');assert.equal(h.context.canAnalyse(),true);
 assert.ok(h.sent.at(-1).session.instructions.text.includes(Context.PENDING_ANALYSIS_MESSAGE));
});
