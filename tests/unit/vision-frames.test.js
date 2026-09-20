const test = require('node:test');
const assert = require('node:assert/strict');
const Selector = require('../../modules/vision-frame-selector');
const Camera = require('../../modules/vision-camera');
function frame(value=80) { const data=new Uint8ClampedArray(64*48*4); for(let i=0;i<data.length;i+=4){data[i]=data[i+1]=data[i+2]=value;data[i+3]=255;}return data; }
function patch(data, start=0) { const copy=data.slice();for(let i=start*4;i<(start+400)*4;i+=4){copy[i]=180;copy[i+1]=20;}return copy; }
function initial(selector, data) {assert.equal(selector.select(data,0),null);assert.equal(selector.select(data,500).reason,'initial');}
test('stationary frames, sensor noise and uniform exposure changes skip inference',()=>{
 const s=new Selector(),a=frame();initial(s,a);
 const noise=a.map((v,i)=>i%4===3?v:v+(i%5)-2);
 assert.equal(s.select(noise,6000),null);assert.equal(s.select(frame(110),7000),null);
 assert.equal(s.select(a,10000),null);
});
test('new object settles, selects once and obeys cooldown; refresh and explicit requests work',()=>{
 const s=new Selector(),a=frame(),b=patch(a);initial(s,a);
 assert.equal(s.select(b,6000),null);assert.equal(s.select(b,6500).reason,'change');
 assert.equal(s.select(b,7000),null);
 assert.equal(s.select(a,7500),null);assert.equal(s.select(a,8000),null);
 assert.equal(s.select(a,11500).reason,'change');
 assert.equal(s.select(a,12000,true).reason,'requested');
 assert.equal(s.select(a,71999),null);assert.equal(s.select(a,72000).reason,'refresh');
});
test('continuous motion has bounded wait and slow cumulative changes compare to selected frame',()=>{
 const s=new Selector(),a=frame();initial(s,a);
 for(let t=6000;t<8500;t+=250)assert.equal(s.select(patch(a,(t/250%2)*500),t),null);
 assert.equal(s.select(patch(a),8500).reason,'change');
 const gradual=new Selector();initial(gradual,a);
 for(let n=1;n<=4;n++){
  const b=a.slice();for(let i=0;i<n*120*4;i+=4)b[i]=200;
  gradual.select(b,6000+n*250);
  if(n===4)assert.equal(gradual.select(b,7600).reason,'change');
 }
});
test('transient motion returning to the reference cancels selection',()=>{
 const s=new Selector(),a=frame();initial(s,a);
 assert.equal(s.select(patch(a),6000),null);
 assert.equal(s.select(a,6250),null);assert.equal(s.select(a,7000),null);
 assert.throws(()=>s.select(a,6999));assert.throws(()=>s.select(new Uint8ClampedArray(4),8000));
});
function fixture() {
 let stopped=0, resolvePermission, resolveEncode, calls=0;
 const track={stop(){stopped++;},addEventListener(){}};
 const stream={getTracks:()=>[track],getVideoTracks:()=>[track]};
 const video={readyState:2,videoWidth:640,videoHeight:480,play:async()=>{},pause(){}};
 const context={drawImage(){},getImageData:()=>({data:frame()})};
 const document={createElement:kind=>kind==='video'?video:{getContext:()=>context,toBlob:fn=>{resolveEncode=fn;}}};
 const mediaDevices={getUserMedia:()=>new Promise(r=>{resolvePermission=r;})};
 const camera=new Camera({mediaDevices,document,selector:new Selector(),clock:()=>1000,onFrame:async()=>{calls++;}});
 return {camera,stream,get stopped(){return stopped;},get calls(){return calls;},permit(){resolvePermission(stream);},encode(){resolveEncode(new Blob(['jpeg'],{type:'image/jpeg'}));}};
}
test('stopping during permission prompt closes late stream without starting capture',async()=>{
 const f=fixture(),start=f.camera.start();f.camera.stop();f.permit();await start;
 assert.equal(f.stopped,1);assert.equal(f.camera.active,false);assert.equal(f.calls,0);
 assert.equal(f.camera.requestFrame(),false);
});
test('stopping while JPEG encodes prevents delivery',async t=>{
 const f=fixture();t.after(()=>f.camera.stop());const start=f.camera.start();f.permit();await start;
 f.camera.requested=true;const tick=f.camera.tick();f.camera.stop();f.encode();await tick;
 assert.equal(f.calls,0);assert.equal(f.stopped,1);
});
test('analysis backpressure skips extra frames and stop aborts in-flight analysis',async t=>{
 const f=fixture();t.after(()=>f.camera.stop());let delivered=0,signal,finish;
 f.camera.onFrame=async packet=>{delivered++;signal=packet.signal;await new Promise(r=>{finish=r;});};
 const start=f.camera.start();f.permit();await start;
 f.camera.requested=true;const tick=f.camera.tick();f.encode();await Promise.resolve();
 f.camera.requestFrame();await f.camera.tick();assert.equal(delivered,1);
 f.camera.stop();assert.equal(signal.aborted,true);finish();await tick;
});

test('selected frames retain detail, preserve aspect ratio and never upscale',async t=>{
 for(const [width,height,expected] of [[1280,720,[768,432]],[640,480,[640,480]],[1920,1080,[768,432]],[1080,1920,[324,576]]]) {
  const f=fixture();t.after(()=>f.camera.stop());const start=f.camera.start();f.permit();await start;
  f.camera.video.videoWidth=width;f.camera.video.videoHeight=height;
  f.camera.requested=true;const tick=f.camera.tick();
  assert.deepEqual([f.camera.full.width,f.camera.full.height],expected);
  f.encode();await tick;f.camera.stop();
 }
});
