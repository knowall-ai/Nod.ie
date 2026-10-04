/** An introduction labels only its captured sole voice, after explicit confirmation. */
class VoiceIntroductionSettings {
 constructor(api,doc=document,onLinkProfile=()=>{}){
  this.api=api;this.doc=doc;this.onLinkProfile=onLinkProfile;this.generation=0;this.el=id=>doc.getElementById('voice-introduction-'+id);
  this.section=doc.getElementById('voice-introduction');this.form=this.el('form');this.name=this.el('name');this.status=this.el('status');
  this.el('confirm').onclick=()=>void this.confirm(true);this.el('cancel').onclick=()=>void this.confirm(false);
  this.name.oninput=()=>{this.status.textContent='';};this.el('link').onclick=()=>{if(this.savedProfile)this.onLinkProfile(this.savedProfile);};
 }
 clear(){clearTimeout(this.expiry);this.pending=null;this.savedProfile=null;this.name.value='';this.el('heard').textContent='';this.el('link').hidden=true;}
 stop(){++this.generation;this.clear();this.unsubscribe?.();}
 start(){this.unsubscribe=this.api.onIntroductionChanged?.(()=>void this.refresh());void this.refresh();}
 async refresh(){
  if(this.saving)return;const generation=++this.generation;
  try{
   const p=await this.api.voiceIntroduction();if(generation!==this.generation||this.saving)return;
   if(!p||Date.now()>=p.expiresAt){this.clear();this.section.hidden=true;return;}
   if(this.pending?.token===p.token)return;
   this.clear();this.pending=p;this.name.value=p.name;this.el('heard').textContent=p.heard?`Heard: ${p.heard}`:'';
   this.section.hidden=false;this.form.hidden=false;this.status.textContent='';this.section.scrollIntoView({block:'start'});
   this.expiry=setTimeout(()=>{if(this.pending===p){this.clear();this.form.hidden=true;this.status.textContent='This introduction expired. Please introduce yourself again.';}},Math.max(0,p.expiresAt-Date.now()));
  }catch{if(generation===this.generation){this.clear();this.form.hidden=true;this.section.hidden=false;this.status.textContent='The voice introduction is unavailable. Please try again.';}}
 }
 async confirm(accepted){
  const p=this.pending;if(!p||this.saving||accepted&&!this.name.reportValidity())return;
  const guard=this.saving={pending:p};this.el('confirm').disabled=true;this.el('cancel').disabled=true;
  let timer;
  try{
   const result=await Promise.race([this.api.confirmRecognitionName(p.token,accepted,accepted?this.name.value.trim():undefined),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Confirmation timed out')),10000);})]);
   if(this.pending!==p)return;
   if(result.status==='invalid-name'){this.status.textContent='Enter a valid name.';return;}
   this.clear();this.form.hidden=true;
   this.status.textContent=result.status==='saved'?'Name saved for the voice in this introduction.':result.status==='cancelled'?'Introduction cancelled.':'The voice profile or introduction changed. Please introduce yourself again.';
   if(result.status==='saved'&&result.profileId){this.savedProfile={kind:'voice',profileId:result.profileId};this.el('link').hidden=false;}
  }catch{if(this.pending===p){this.clear();this.form.hidden=true;this.status.textContent='Confirmation could not be completed. Check saved voice profiles before trying again.';}}
  finally{clearTimeout(timer);if(this.saving===guard){this.saving=null;this.el('confirm').disabled=false;this.el('cancel').disabled=false;}}
 }
}
if(typeof module!=='undefined')module.exports={VoiceIntroductionSettings};
if(typeof window!=='undefined')window.addEventListener('DOMContentLoaded',()=>{
 if(window.nodie?.voiceIntroduction){const panel=new VoiceIntroductionSettings(window.nodie,document,profile=>window.dispatchEvent(new CustomEvent('recognition-profile-link-requested',{detail:profile})));panel.start();window.addEventListener('pagehide',()=>panel.stop(),{once:true});}
});
