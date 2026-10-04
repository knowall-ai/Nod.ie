/** One explicit, expiring calibration sample. Raw media is never retained here. */
const crypto=require('node:crypto');
const {MODEL:FACE_MODEL}=require('./face-recognition');
const {MODEL:VOICE_MODEL}=require('./speaker-recognition');
const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0);
const valid=(v,size)=>Array.isArray(v)&&v.length===size&&v.every(Number.isFinite)&&Math.abs(Math.hypot(...v)-1)<.02;
const vectors=(p,kind)=>kind==='face'?p.vectors:[p.vector,...(p.additionalVoices||[])];
function match(vector,profiles,kind){
 const ranked=profiles.filter(p=>p.name).map(p=>({id:p.id,name:p.name,score:Math.max(...vectors(p,kind).map(v=>dot(v,vector)))})).sort((a,b)=>b.score-a.score);
 const top=ranked[0],threshold=kind==='face'?.6:.8,margin=kind==='face'?.12:.1;
 return {ranked,possible:Boolean(top&&top.score>=threshold&&top.score-(ranked[1]?.score??-1)>=margin)};
}
class RecognitionCalibration {
 constructor({faces,voices,extractFace,extractVoice,now=()=>Date.now(),notify=()=>{},deadlineMs=60000}){Object.assign(this,{stores:{face:faces,voice:voices},extractFace,extractVoice,now,notify,deadlineMs});}
 get active(){return Boolean(this.pending||this.beginning);}
 cancel(){this.beginning=null;clearTimeout(this.expiry);this.pending?.controller.abort();this.pending=null;this.result=null;this.notify();}
 view(){const p=this.pending;return p?{token:p.token,kind:p.kind,mode:p.mode,profileId:p.profileId,name:p.name,phase:p.phase,expiresAt:p.until,report:p.report||null}:this.result||null;}
 async status(){
  const [face,voice]=await Promise.all([this.stores.face.read(),this.stores.voice.read()]);
  return {faces:{enabled:face.enabled,profiles:face.profiles.filter(p=>p.name).map(p=>({id:p.id,name:p.name,samples:p.vectors.length,maxSamples:4}))},voices:{enabled:voice.enabled,profiles:voice.profiles.filter(p=>p.name).map(p=>({id:p.id,name:p.name,samples:vectors(p,'voice').length,maxSamples:8}))},operation:this.view()};
 }
 async begin(choice){
  if(!choice||typeof choice!=='object'||Array.isArray(choice)||Object.keys(choice).some(k=>!['kind','profileId','mode'].includes(k)))throw Error('Invalid calibration choice');
  const {kind,profileId,mode}=choice;
  if(!['face','voice'].includes(kind)||!['collect','test'].includes(mode)||typeof profileId!=='string')throw Error('Choose a named profile and calibration mode');
  this.cancel();const guard=this.beginning={};try{const d=await this.stores[kind].read();if(this.beginning!==guard)return null;
  const p=d.profiles.find(p=>p.id===profileId&&p.name);if(!d.enabled||!p)throw Error('Enable recognition and choose an enrolled named profile');
  if(mode==='collect'&&kind==='voice'&&d.profiles.reduce((n,p)=>n+vectors(p,'voice').length,0)>=64)throw Error('The total voice sample limit has been reached');
  if(mode==='collect'&&vectors(p,kind).length>=(kind==='face'?4:8))throw Error('This profile has reached its sample limit');
  const token=crypto.randomUUID();this.pending={token,kind,mode,profileId,name:p.name,epoch:d.epoch,phase:'waiting',until:this.now()+this.deadlineMs,controller:new AbortController()};
  this.expiry=setTimeout(()=>{if(this.pending?.token===token){this.pending.controller.abort();this.pending=null;this.result={phase:'expired',kind,report:{message:'Calibration expired. Capture a fresh sample.'}};this.notify();}},this.deadlineMs);this.expiry.unref?.();this.notify();return this.view();
  }finally{if(this.beginning===guard)this.beginning=null;}
 }
 failure(token,code){
  const p=this.pending;if(!p||p.token!==token)return;
  const messages={'camera-off':'Turn on the existing camera before capturing.','microphone-off':'Turn on the existing microphone before capturing.','assistant-speaking':'Wait until the assistant is quiet.','device-changed':'The camera or microphone changed. Capture again.','capture-unavailable':'The sample could not be captured. Try again.'};
  this.finish(p,{message:messages[code]||messages['capture-unavailable']},'rejected');
 }
 finish(p,report,phase='complete'){
  if(this.pending!==p)return;clearTimeout(this.expiry);p.controller.abort();this.pending=null;this.result={kind:p.kind,mode:p.mode,profileId:p.profileId,name:p.name,phase,report};this.notify();
 }
 async submit(token,body){
  const p=this.pending;if(!p||p.token!==token||p.phase!=='waiting'||this.now()>=p.until)return null;
  if(!(body instanceof Uint8Array)||body.length<100||body.length>(p.kind==='face'?512000:256000)){this.failure(token,'capture-unavailable');return this.view();}
  p.phase='analysing';this.notify();const started=this.now();let timer;
  try{
   const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{p.controller.abort();reject(Error('Analysis deadline exceeded'));},3000);});
   const result=await Promise.race([(p.kind==='face'?this.extractFace:this.extractVoice)(body,p.controller.signal),timeout]);
   p.controller.signal.throwIfAborted();if(this.pending!==p||this.now()>=p.until)return null;
   const latencyMs=Math.max(0,this.now()-started);let vector,thumbnail=null,quality;
   if(p.kind==='face'){
    if(result?.model!==FACE_MODEL||result.quality?.detectedFaces!==1||result.faces?.length!==1||!valid(result.faces[0].vector,128)||typeof result.faces[0].thumbnail!=='string'||result.faces[0].thumbnail.length>12000||!/^\/9j\/[A-Za-z0-9+/]*={0,2}$/.test(result.faces[0].thumbnail)){this.finish(p,{latencyMs,message:'Use one clearly visible, sufficiently large, sharp face. Other detected faces, blur or small faces cannot be calibrated.'},'rejected');return this.view();}
    vector=result.faces[0].vector;thumbnail=result.faces[0].thumbnail;quality='One isolated, sharp face';
   }else{
    const s=result?.speakers?.[0];
    if(result?.model!==VOICE_MODEL||result.speakers?.length!==1||!s||!valid(s.embedding,512)||!Number.isFinite(result.duration)||result.duration>5||!Number.isFinite(s.cleanSeconds)||s.cleanSeconds<2.5||s.cleanSeconds>result.duration+.05||!result.segments?.length||result.segments.some(seg=>seg.speaker!==s.speaker||!Number.isFinite(seg.start)||!Number.isFinite(seg.end)||seg.start<0||seg.end<=seg.start||seg.end>result.duration+.05)){this.finish(p,{latencyMs,message:'Speak alone for at least 2.5 clean seconds. Silence, short samples and multiple or overlapping speakers cannot be calibrated.'},'rejected');return this.view();}
    const spans=result.segments.map(seg=>[seg.start,seg.end]).sort((a,b)=>a[0]-b[0]);let end=0,covered=0;for(const [a,b] of spans){covered+=Math.max(0,b-Math.max(end,a));end=Math.max(end,b);}
    if(covered<2.5||s.cleanSeconds>covered+.05){this.finish(p,{latencyMs,message:'The sample has insufficient clean speech coverage. Speak alone for a fresh sample.'},'rejected');return this.view();}
    vector=s.embedding;quality=`${s.cleanSeconds.toFixed(1)} clean seconds; one speaker`;
   }
   const d=await this.stores[p.kind].read();p.controller.signal.throwIfAborted();if(this.pending!==p)return null;
   if(!d.enabled||d.epoch!==p.epoch||!d.profiles.some(v=>v.id===p.profileId&&v.name)){this.finish(p,{latencyMs,message:'The selected profile changed. Refresh and capture again.'},'rejected');return this.view();}
   const outcome=match(vector,d.profiles,p.kind),top=outcome.ranked[0],target=outcome.ranked.find(v=>v.id===p.profileId);
   const report={latencyMs,quality,match:outcome.possible?{profileId:top.id,name:top.name,selected:top.id===p.profileId}:null,similarity:target?Number(target.score.toFixed(3)):null,message:outcome.possible?`Possible match: ${top.name}${top.id===p.profileId?' (selected profile)':' (different profile)'}`:'Uncertain or unknown; no identity established.'};
   if(p.mode==='test'){this.finish(p,report);return this.view();}
   if(!target||target.score<(p.kind==='face'?.4:.65)||(top.id!==p.profileId&&top.score>=target.score)){this.finish(p,{...report,message:'The sample differs from the selected profile or fits another profile better. Check the person/profile and capture again.'},'rejected');return this.view();}
   if(vectors(d.profiles.find(v=>v.id===p.profileId),p.kind).some(v=>dot(v,vector)>.995)){this.finish(p,{...report,message:'This sample is too similar to an existing sample. Try a slightly different view, lighting or spoken phrase.'},'rejected');return this.view();}
   p.vector=vector;p.report={...report,thumbnail};p.phase='ready';this.notify();return this.view();
  }catch{if(this.pending===p){this.finish(p,{message:'Analysis was cancelled, timed out or unavailable. Capture a fresh sample.'},'rejected');}return this.view();}
  finally{clearTimeout(timer);}
 }
 async confirm(token,accepted){
  const p=this.pending;if(!p||p.token!==token||p.phase!=='ready'||typeof accepted!=='boolean')return {saved:false};
  if(!accepted){this.cancel();return {saved:false,cancelled:true};}
  if(this.now()>=p.until){this.cancel();return {saved:false};}
  p.phase='saving';this.notify();
  try{
   const saved=await this.stores[p.kind].addSample(p.profileId,p.vector,p.epoch,p.controller.signal);
   if(this.pending!==p)return {saved:false};this.finish(p,{...p.report,thumbnail:null,message:saved?'Sample saved for the selected profile.':'The profile changed; no sample was saved.'},saved?'saved':'rejected');return {saved};
  }catch{if(this.pending===p)this.finish(p,{message:'Saving could not be confirmed. Check sample counts before trying again.'},'rejected');return {saved:false};}
 }
}
module.exports={RecognitionCalibration};
