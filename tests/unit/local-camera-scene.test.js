const test=require('node:test'),assert=require('node:assert/strict');
const {LocalCameraScene,cameraMessages}=require('../../lib/local-camera-scene');
const jpeg=Buffer.from([255,216,1,255,217]).toString('base64');
test('bounded JPEG expires without turning camera off and off discards pixels immediately',t=>{
 let now=Date.now(),off=0;const scene=new LocalCameraScene({now:()=>now,onOff:()=>off++});t.after(()=>scene.dispose());
 const capturedAt=new Date(now).toISOString();scene.update({status:'snapshot',imageJpeg:jpeg,capturedAt});assert.equal(scene.current().imageJpeg,jpeg);
 now+=10001;assert.deepEqual(scene.current(),{status:'camera-on-awaiting-analysis'});assert.equal(scene.image,null);
 scene.update({status:'camera-off'});assert.deepEqual(scene.current(),{status:'camera-off'});assert.equal(off,1);
});
test('invalid payloads never replace a valid image',t=>{
 const scene=new LocalCameraScene();t.after(()=>scene.dispose());const capturedAt=new Date().toISOString();scene.update({status:'snapshot',imageJpeg:jpeg,capturedAt});
 for(const patch of [{capturedAt:'bad'},{capturedAt:new Date(Date.now()+60000).toISOString()},{capturedAt:new Date(Date.now()-11000).toISOString()},{imageJpeg:'abcd'},{imageJpeg:jpeg+'\n'},{imageJpeg:'a'.repeat(682672)},{instruction:'untrusted'}, {status:'invented'}])assert.throws(()=>scene.update({status:'snapshot',imageJpeg:jpeg,capturedAt,...patch}));
 assert.equal(scene.current().imageJpeg,jpeg);
});
test('native image is a separate user message; state policy contains no image bytes',()=>{
 const input=[{role:'system',content:'Policy'},{role:'user',content:'What is on the table?'}];
 const result=cameraMessages(input,{status:'snapshot',imageJpeg:jpeg,capturedAt:new Date().toISOString()});
 assert.equal(result.at(-1).content,input.at(-1).content);assert.deepEqual(result.at(-2).images,[jpeg]);assert.match(result.at(-2).content,/Untrusted camera image/);assert.ok(!result[0].content.includes(jpeg));assert.equal(input.length,2);assert.equal(input[0].content,'Policy');
});
test('camera-off revision and replacement session reject delayed old snapshots',t=>{
 const scene=new LocalCameraScene();t.after(()=>scene.dispose());const {token}=scene.begin(),capturedAt=new Date().toISOString();
 scene.accept({token,revision:1,status:'snapshot',imageJpeg:jpeg,capturedAt});scene.accept({token,revision:3,status:'camera-off'});
 assert.deepEqual(scene.accept({token,revision:2,status:'snapshot',imageJpeg:jpeg,capturedAt}),{status:'ignored'});assert.equal(scene.current().status,'camera-off');
 const next=scene.begin();assert.notEqual(next.token,token);assert.equal(scene.accept({token,revision:4,status:'snapshot',imageJpeg:jpeg,capturedAt}).status,'stale-session');assert.equal(scene.current().status,'camera-off');
});
test('abandoned camera lease expires to unavailable and repeated off does not repeat cancellation',t=>{
 let now=Date.now(),off=0;const scene=new LocalCameraScene({now:()=>now,onOff:()=>off++});t.after(()=>scene.dispose());
 scene.update({status:'camera-off'});assert.equal(off,0);scene.update({status:'camera-on-awaiting-analysis'});now+=90001;assert.equal(scene.current().status,'camera-unavailable');assert.equal(off,1);scene.update({status:'camera-off'});assert.equal(off,1);
});
