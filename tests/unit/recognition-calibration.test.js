const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {RecognitionCalibration}=require('../../lib/recognition-calibration'),{FaceStore,MODEL:FM}=require('../../lib/face-recognition'),{SpeakerStore,MODEL:VM}=require('../../lib/speaker-recognition');
const id='11111111-1111-1111-1111-111111111111';
const vector=(size,score=1)=>Array.from({length:size},(_,i)=>i===0?score:i===1?Math.sqrt(1-score*score):0);
async function fixture(t){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'nodie-calibration-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const faces=new FaceStore(path.join(dir,'faces.json')),voices=new SpeakerStore(path.join(dir,'voices.json'));
 const f=faces.empty();f.enabled=true;f.profiles=[{id,name:'Robin',vectors:[vector(128)],lastSeen:1}];await faces.write(f);
 const v=voices.empty();v.enabled=true;v.profiles=[{id,name:'Robin',model:VM,vector:vector(512),lastSeen:1,lastAsked:0}];await voices.write(v);
 let rawFace={model:FM,quality:{detectedFaces:1},faces:[{vector:vector(128,.9),thumbnail:'/9j/AAA='}]};
 let rawVoice={model:VM,duration:4,speakers:[{speaker:0,cleanSeconds:3,embedding:vector(512,.9)}],segments:[{speaker:0,start:.2,end:3.2}]};
 const c=new RecognitionCalibration({faces,voices,extractFace:async()=>rawFace,extractVoice:async()=>rawVoice});t.after(()=>c.cancel());
 return {c,faces,voices,rawFace,rawVoice,body:new Uint8Array(100)};
}
test('face and voice samples require an explicit confirmation, preserve IDs and invalidate old observations',async t=>{
 for(const kind of ['face','voice']){
  const {c,faces,voices,body}=await fixture(t),store=kind==='face'?faces:voices,before=await fs.readFile(store.file,'utf8');
  const p=await c.begin({kind,profileId:id,mode:'collect'});await c.submit(p.token,body);
  assert.equal(c.view().phase,'ready');assert.equal(await fs.readFile(store.file,'utf8'),before);assert.doesNotMatch(JSON.stringify(await c.status()),/vector|embedding/);
  assert.deepEqual(await c.confirm(p.token,true),{saved:true});const saved=await store.read();assert.notEqual(saved.epoch,JSON.parse(before).epoch);assert.equal(saved.profiles[0].id,id);
  assert.equal(kind==='face'?saved.profiles[0].vectors.length:saved.profiles[0].additionalVoices.length+1,2);assert.equal(c.view().report.thumbnail,null);assert.equal((await fs.stat(store.file)).mode&0o777,0o600);
 }
});
test('recognition testing never writes either profile store, creates candidates or offers saving',async t=>{
 const {c,faces,voices,body}=await fixture(t);const before=await Promise.all([fs.readFile(faces.file,'utf8'),fs.readFile(voices.file,'utf8')]);
 for(const kind of ['face','voice']){const p=await c.begin({kind,profileId:id,mode:'test'});await c.submit(p.token,body);assert.equal(c.view().phase,'complete');assert.equal(c.view().report.match.selected,true);assert.equal(c.pending,null);assert.deepEqual(await c.confirm(p.token,true),{saved:false});}
 assert.deepEqual(await Promise.all([fs.readFile(faces.file,'utf8'),fs.readFile(voices.file,'utf8')]),before);assert.equal(faces.candidates,undefined);assert.equal(voices.candidates,undefined);
});
test('unnamed competitors prevent a named calibration match and block collecting their samples',async t=>{
 for(const kind of ['face','voice']){
  const {c,faces,voices,body,rawFace,rawVoice}=await fixture(t),store=kind==='face'?faces:voices,size=kind==='face'?128:512;
  const data=await store.read(),profile=data.profiles[0];
  if(kind==='face'){profile.vectors=[vector(size,.9)];rawFace.faces[0].vector=vector(size);}
  else{profile.vector=vector(size,.9);rawVoice.speakers[0].embedding=vector(size);}
  data.profiles.push({...profile,id:'22222222-2222-2222-2222-222222222222',name:null,lastSeen:Date.now(),...(kind==='face'?{vectors:[vector(size,.95)]}:{vector:vector(size,.95)})});await store.write(data);
  const observed=await store.observe(kind==='face'?rawFace:rawVoice,data.epoch,undefined,{enrol:false});
  assert.equal((kind==='face'?observed.faces:observed.speakers)[0].uncertain,true);
  const before=await fs.readFile(store.file,'utf8');
  const testing=await c.begin({kind,profileId:id,mode:'test'});await c.submit(testing.token,body);
  assert.equal(c.view().phase,'complete');assert.equal(c.view().report.match,null);assert.match(c.view().report.message,/Uncertain/);
  const collecting=await c.begin({kind,profileId:id,mode:'collect'});await c.submit(collecting.token,body);
  assert.equal(c.view().phase,'rejected');assert.deepEqual(await c.confirm(collecting.token,true),{saved:false});
  assert.equal(await fs.readFile(store.file,'utf8'),before);
 }
});
test('multiple/poor faces, overlap, short voices and inconsistent clean coverage are rejected',async t=>{
 for(const variant of ['multiple-face','blurry-face','overlap','short','inflated-clean']){
  const {c,rawFace,rawVoice,body}=await fixture(t);let kind='voice';
  if(variant==='multiple-face'){kind='face';rawFace.quality.detectedFaces=2;}
  if(variant==='blurry-face'){kind='face';rawFace.faces=[];}
  if(variant==='overlap')rawVoice.speakers.push({speaker:1,cleanSeconds:1,embedding:vector(512)});
  if(variant==='short')rawVoice.speakers[0].cleanSeconds=1;
  if(variant==='inflated-clean')rawVoice.segments=[{speaker:0,start:0,end:.2}];
  const p=await c.begin({kind,profileId:id,mode:'collect'});await c.submit(p.token,body);assert.equal(c.view().phase,'rejected');assert.equal(c.pending,null);
 }
});
test('duplicates, unrelated samples, stale epochs and changed profiles cannot add samples',async t=>{
 for(const change of ['duplicate','unrelated','epoch','removed']){
  const {c,faces,rawFace,body}=await fixture(t);if(change==='duplicate')rawFace.faces[0].vector=vector(128);if(change==='unrelated')rawFace.faces[0].vector=vector(128,.1);
  const p=await c.begin({kind:'face',profileId:id,mode:'collect'});await c.submit(p.token,body);
  if(['duplicate','unrelated'].includes(change)){assert.equal(c.view().phase,'rejected');continue;}
  if(change==='epoch')await faces.configure(true);else await faces.edit(id,null);
  assert.deepEqual(await c.confirm(p.token,true),{saved:false});
 }
});
test('cancellation and late extraction cannot resurrect a replacement capture',async t=>{
 const {c,body}=await fixture(t);let finish;c.extractFace=()=>new Promise(r=>finish=r);
 const first=await c.begin({kind:'face',profileId:id,mode:'collect'}),old=c.submit(first.token,body);
 const next=await c.begin({kind:'voice',profileId:id,mode:'test'});finish({model:FM,quality:{detectedFaces:1},faces:[]});await old;assert.equal(c.view().token,next.token);assert.equal(c.view().phase,'waiting');
});
test('cancellation while reading the profile cannot launch a late capture',async t=>{
 const {c,faces}=await fixture(t);const data=await faces.read();let finish;c.stores.face.read=()=>new Promise(r=>finish=r);
 const pending=c.begin({kind:'face',profileId:id,mode:'collect'});c.cancel();finish(data);assert.equal(await pending,null);assert.equal(c.pending,null);
});
test('expired proposals discard private vectors and thumbnails and reject late confirmation',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const {c,body}=await fixture(t),p=await c.begin({kind:'face',profileId:id,mode:'collect'});await c.submit(p.token,body);
 t.mock.timers.tick(60001);assert.equal(c.pending,null);assert.equal(c.view().phase,'expired');assert.doesNotMatch(JSON.stringify(c.view()),/thumbnail|vector/);assert.deepEqual(await c.confirm(p.token,true),{saved:false});
});
test('stores enforce per-profile and shared voice sample limits independently of the UI',async t=>{
 const {c,faces,voices}=await fixture(t);const f=await faces.read();f.profiles[0].vectors=Array.from({length:4},()=>vector(128));await faces.write(f);
 await assert.rejects(c.begin({kind:'face',profileId:id,mode:'collect'}),/sample limit/);assert.equal(await faces.addSample(id,vector(128,.9),f.epoch),false);
 const v=await voices.read();v.profiles[0].additionalVoices=Array.from({length:7},()=>vector(512));await voices.write(v);
 await assert.rejects(c.begin({kind:'voice',profileId:id,mode:'collect'}),/sample limit/);assert.equal(await voices.addSample(id,vector(512,.9),v.epoch),false);
});
test('shared voice capacity prevents adding a sample even when the selected profile has room',async t=>{
 const {c,voices}=await fixture(t),d=await voices.read(),template=d.profiles[0];
 d.profiles=[template,...Array.from({length:9},(_,i)=>({...template,id:`22222222-2222-2222-2222-${String(i).padStart(12,'0')}`,additionalVoices:Array.from({length:6},()=>vector(512))}))];await voices.write(d);
 assert.equal(d.profiles.reduce((n,p)=>n+1+(p.additionalVoices?.length||0),0),64);
 await assert.rejects(c.begin({kind:'voice',profileId:id,mode:'collect'}),/total voice sample limit/);
 assert.equal(await voices.addSample(id,vector(512,.9),d.epoch),false);
});
test('analysis deadlines clear the captured operation without accepting a late result',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const {c,body,rawFace}=await fixture(t);let finish;c.extractFace=()=>new Promise(r=>finish=r);
 const p=await c.begin({kind:'face',profileId:id,mode:'collect'}),request=c.submit(p.token,body);t.mock.timers.tick(3001);await request;
 assert.equal(c.pending,null);assert.equal(c.view().phase,'rejected');finish(rawFace);await Promise.resolve();assert.equal(c.pending,null);
});
