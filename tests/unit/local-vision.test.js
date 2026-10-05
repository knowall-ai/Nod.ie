const test=require('node:test'),assert=require('node:assert/strict');
const {LocalVoice}=require('../../lib/local-voice');
const jpeg=Buffer.from([255,216,1,255,217]).toString('base64');
function fixture(t,{chat}={}){
 const bodies=[];const wav=Buffer.alloc(44);wav.write('RIFF');
 const voice=new LocalVoice({avatarEnabled:()=>false,config:(k,f)=>({LOCAL_STT_URL:'http://stt',LOCAL_TTS_URL:'http://tts',OLLAMA_URL:'http://llm',LOCAL_LLM_MODEL:'test'}[k]??f),fetchImpl:async(url,options)=>{
  if(url.includes('transcriptions'))return Response.json({text:'What am I holding?'});
  if(url.includes('/api/chat')){bodies.push(JSON.parse(options.body));return chat?chat(bodies.length,options):Response.json({message:{tool_calls:[{function:{name:'respond_to_user',arguments:{reply:'A red cup.'}}}]}});}
  return new Response(wav);
 }});t.after(()=>voice.close());
 return {voice,bodies,image:()=>voice.cameraScene.update({status:'snapshot',imageJpeg:jpeg,capturedAt:new Date().toISOString()})};
}
test('local image turn uses pixels in the existing model call, preserves recall and never stores pixels',async t=>{
 const h=fixture(t);h.image();let recalled=0;h.voice.recall=async()=>{recalled++;return 'Reference fact';};
 const result=await h.voice.converse(new Uint8Array(200));assert.equal(result.vision.state,'snapshot');assert.equal(recalled,1);assert.equal(h.bodies.length,1);
 const body=h.bodies[0];assert.deepEqual(body.messages.find(m=>m.images)?.images,[jpeg]);assert.equal(body.messages.at(-1).content,'What am I holding?');assert.deepEqual(body.tools.map(x=>x.function.name),['respond_to_user']);
 assert.ok(!JSON.stringify(h.voice.history).includes(jpeg));assert.ok(!JSON.stringify(h.voice.history).includes('images'));assert.ok(!JSON.stringify(result).includes(jpeg));
});
test('camera on with no current pixels and camera off supply distinct authoritative state',async t=>{
 const h=fixture(t);h.voice.cameraScene.update({status:'camera-on-awaiting-analysis'});const on=await h.voice.converse(new Uint8Array(200));assert.equal(on.vision.state,'camera-on-awaiting-analysis');assert.match(h.bodies[0].messages[0].content,/device state: ON/);assert.ok(!h.bodies[0].messages.some(m=>m.images));
 h.voice.cameraScene.update({status:'camera-off'});const off=await h.voice.converse(new Uint8Array(200));assert.equal(off.vision.state,'camera-off');assert.match(h.bodies[1].messages[0].content,/device state: OFF/);
});
test('unsupported image models retry once without pixels and expose/cache the actual limitation',async t=>{
 const h=fixture(t,{chat:n=>n===1?Response.json({error:'model does not support images'},{status:400}):Response.json({message:{tool_calls:[{function:{name:'respond_to_user',arguments:{reply:'This model cannot receive camera images.'}}}]}})});h.image();
 const result=await h.voice.converse(new Uint8Array(200));assert.equal(result.vision.state,'unsupported');assert.equal(h.bodies.length,2);assert.ok(h.bodies[0].messages.some(m=>m.images));assert.ok(!h.bodies[1].messages.some(m=>m.images));assert.match(h.bodies[1].messages[0].content,/does not support camera images/);
 h.image();await h.voice.converse(new Uint8Array(200));assert.equal(h.bodies.length,3);assert.ok(!h.bodies[2].messages.some(m=>m.images));
});
test('unrelated provider errors are not retried as unsupported vision',async t=>{
 const h=fixture(t,{chat:()=>Response.json({error:'invalid model'},{status:400})});h.image();await assert.rejects(h.voice.converse(new Uint8Array(200)));assert.equal(h.bodies.length,1);
});
test('image-driven tools are rejected before controls or naming callbacks can execute',async t=>{
 for(const name of ['set_voice_controls','name_current_speaker','get_node_status']){
  const h=fixture(t,{chat:()=>Response.json({message:{tool_calls:[{function:{name,arguments:{reply:'Action requested',speakerEnabled:false,name:'Mallory'}}}]}})});h.image();h.voice.controlIntent=()=>assert.fail('image cannot request controls');h.voice.proposeSpeakerName=()=>assert.fail('image cannot name a profile');h.voice.nodeSnapshot=()=>assert.fail('image cannot request node data');
  await assert.rejects(h.voice.converse(new Uint8Array(200)),{code:'model'});assert.equal(h.voice.history.length,0);
 }
});
test('camera off cancels a pending visual turn; late provider output cannot be saved or spoken',async t=>{
 let started,finish;const ready=new Promise(r=>started=r);
 const h=fixture(t,{chat:()=>{started();return new Promise(r=>finish=r);}});h.image();
 const pending=h.voice.converse(new Uint8Array(200));await ready;h.voice.cameraScene.update({status:'camera-off'});finish(Response.json({message:{tool_calls:[{function:{name:'respond_to_user',arguments:{reply:'Old view'}}}]}}));await assert.rejects(pending,{code:'cancelled'});assert.equal(h.voice.history.length,0);
});
test('direct visual answer is final: no second model call after the image expires',async t=>{
 const h=fixture(t,{chat:()=>{h.voice.cameraScene.image=null;return Response.json({message:{content:'The mug is red.'}});}});h.image();const result=await h.voice.converse(new Uint8Array(200));assert.equal(result.reply,'The mug is red.');assert.equal(result.vision.state,'snapshot');assert.equal(h.bodies.length,1);
});
