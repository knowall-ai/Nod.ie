/** Settings exposes quality and explicit sample consent, never embeddings. */
class CalibrationSettings {
 constructor(api,doc=document){this.api=api;this.doc=doc;this.generation=0;this.el=id=>doc.getElementById('calibration-'+id);
  this.el('kind').onchange=()=>this.profiles();this.el('profile').onchange=()=>this.details();
  this.el('refresh').onclick=()=>void this.refresh();this.el('collect').onclick=()=>void this.begin('collect');this.el('test').onclick=()=>void this.begin('test');
  this.el('confirm').onclick=()=>void this.confirm();this.el('cancel').onclick=()=>void this.cancel();
 }
 start(){this.unsubscribe=this.api.onCalibrationChanged?.(()=>void this.refresh());void this.refresh();}
 stop(){++this.generation;clearTimeout(this.expiry);this.clearPreview();this.unsubscribe?.();}
 clearPreview(){this.el('preview').replaceChildren();this.el('confirm').hidden=true;}
 profiles(){
  const kind=this.el('kind').value,data=this.data?.[kind==='face'?'faces':'voices'];this.el('profile').replaceChildren();
  for(const p of [{id:'',name:'Choose a named profile'},...(data?.profiles||[])]){const option=this.doc.createElement('option');option.value=p.id;option.textContent=p.name+(p.id?' ('+p.id.slice(0,8)+')':'');this.el('profile').append(option);}
  this.el('profile').value='';this.details();
 }
 details(){
  const kind=this.el('kind').value,data=this.data?.[kind==='face'?'faces':'voices'],profile=data?.profiles.find(p=>p.id===this.el('profile').value);
  this.el('instructions').textContent=kind==='face'?'Keep the camera on and show only the selected person. Try a front view, a slight turn, or different lighting. Confirm each crop yourself.':'Keep the microphone on and speak alone for four seconds. Use a different phrase for each sample. Conversation audio pauses during this capture.';
  this.el('counts').textContent=!data?.enabled?'Enable this recognition type first.':!profile?'Introduce and name a profile first, then select it here.':`${profile.name}: ${profile.samples} of ${profile.maxSamples} samples saved.`;
  const busy=this.busy||['waiting','analysing','ready','saving'].includes(this.operation?.phase);
  this.el('kind').disabled=busy;this.el('profile').disabled=busy;
  this.el('collect').disabled=busy||!data?.enabled||!profile||profile.samples>=profile.maxSamples;
  this.el('test').disabled=busy||!data?.enabled||!profile;
 }
 async refresh(){
  const generation=++this.generation;
  try{
   const data=await this.api.calibrationStatus();if(generation!==this.generation)return;
   const kind=this.el('kind').value||'face',selected=this.el('profile').value;
   this.data=data;this.operation=data.operation;this.el('kind').value=kind;this.profiles();this.el('profile').value=selected;
   const op=data.operation;clearTimeout(this.expiry);this.clearPreview();
   if(op){
    if(['waiting','analysing','ready','saving'].includes(op.phase)){this.el('kind').value=op.kind;this.profiles();this.el('profile').value=op.profileId;}
    const report=op.report;
    this.el('status').textContent=report?`${op.name||''}${op.name?' · ':''}${report.message}${report.quality?' · '+report.quality:''}${report.latencyMs!==undefined?' · Analysis: '+report.latencyMs+' ms':''}${report.similarity!==undefined&&report.similarity!==null?' · Match similarity: '+report.similarity+' (not an identity probability)':''}`:op.phase==='waiting'?(op.kind==='face'?'Capturing from the active camera…':'Recording four seconds from the active microphone…'):op.phase==='analysing'?'Checking sample quality and recognition…':'Saving the confirmed sample…';
    if(op.phase==='ready'){
     if(report.thumbnail){const image=this.doc.createElement('img');image.src='data:image/jpeg;base64,'+report.thumbnail;image.alt='Selected calibration face sample';image.width=96;image.height=96;this.el('preview').append(image);}
     this.el('confirm').textContent=`Add this ${op.kind} sample to ${op.name}`;this.el('confirm').hidden=false;
    }
    if(op.expiresAt)this.expiry=setTimeout(()=>{if(this.operation?.token===op.token){this.clearPreview();this.el('status').textContent='Calibration expired. Capture a fresh sample.';void this.cancel();}},Math.max(0,op.expiresAt-Date.now()));
   }else this.el('status').textContent='Samples are added only after you confirm. Testing never saves a guess.';
   this.el('cancel').disabled=!op||!['waiting','analysing','ready'].includes(op.phase);this.details();
  }catch(e){if(generation===this.generation){this.clearPreview();this.el('status').textContent=e.message||'Calibration is unavailable. Refresh and try again.';}}
 }
 async begin(mode){
  if(this.busy)return;this.busy=true;this.details();this.el('status').textContent='Checking the selected profile…';
  let timer;
  try{await Promise.race([this.api.beginCalibration({kind:this.el('kind').value,profileId:this.el('profile').value,mode}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Capture did not start. Refresh and try again.')),10000);})]);await this.refresh();}
  catch(e){void this.api.cancelCalibration().catch(()=>{});this.el('status').textContent=e.message||'Capture could not start.';}
  finally{clearTimeout(timer);this.busy=false;this.details();}
 }
 async confirm(){
  const op=this.operation;if(this.busy||op?.phase!=='ready')return;this.busy=true;this.el('confirm').disabled=true;
  let timer;
  try{await Promise.race([this.api.confirmCalibration(op.token,true),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Save did not complete. Check sample counts before retrying.')),10000);})]);await this.refresh();}
  catch(e){this.clearPreview();this.el('status').textContent=e.message||'Saving could not be confirmed. Check sample counts before retrying.';}
  finally{clearTimeout(timer);this.busy=false;this.el('confirm').disabled=false;this.details();}
 }
 async cancel(){this.clearPreview();try{await this.api.cancelCalibration();await this.refresh();}catch{this.el('status').textContent='Cancellation could not be confirmed. Refresh before trying again.';}}
}
if(typeof module!=='undefined')module.exports={CalibrationSettings};
if(typeof window!=='undefined')window.addEventListener('DOMContentLoaded',()=>{if(window.nodie?.calibrationStatus){const p=new CalibrationSettings(window.nodie);p.start();window.addEventListener('pagehide',()=>p.stop(),{once:true});}});
