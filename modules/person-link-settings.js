/** Only explicit Settings choices link enrolled profiles to a person or memory. */
class PersonLinkSettings {
 constructor(api,doc=document){
  this.api=api;this.doc=doc;this.generation=0;this.el=id=>doc.getElementById(id);
  this.el('person-existing').onchange=()=>this.selectPerson();
  this.el('people-refresh').onclick=()=>void this.refresh();
  this.el('person-save').onclick=()=>void this.save();
 }
 stop(){++this.generation;}
 options(id,rows,empty){
  const select=this.el(id);select.replaceChildren();
  for(const row of [{id:'',name:empty},...rows]){const option=this.doc.createElement('option');option.value=String(row.id);option.textContent=row.name+(row.id!==''?' ('+String(row.id).slice(0,8)+')':'');select.append(option);}
  select.value='';
 }
 async refresh(profile=null){
  if(this.saving)return;
  const generation=++this.generation;this.loading=true;this.el('person-save').disabled=true;
  try{
   const data=await this.api.personOptions();if(generation!==this.generation)return;
   this.data=data;this.guided=null;
   this.options('person-existing',data.people,'Create a new local person');
   this.options('person-face',data.faces,'No face selected');this.options('person-voice',data.voices,'No voice selected');
   this.options('person-memory',[...new Map([...data.memories,...data.people.map(p=>p.memory).filter(Boolean)].map(m=>[m.id,m])).values()],'No memory link');
   this.el('person-name').value='';
   this.el('people-list').replaceChildren(...data.people.map(p=>{
    const row=this.doc.createElement('p');row.textContent=p.name+': '+p.faces.length+' face profile(s), '+p.voices.length+' voice profile(s)'+(p.memory?', memory: '+p.memory.name:'');
    const button=this.doc.createElement('button');button.textContent='Unlink';button.onclick=()=>void this.remove(p.id);row.append(button);return row;
   }));
   const status=this.el('people-status');status.textContent=data.memoryAvailable?'Select the profiles you know belong to this person.':'Memory is unavailable; recognition profiles can still be linked locally.';
   if(profile){
    const kind=profile.kind==='face'?'faces':profile.kind==='voice'?'voices':null;
    const saved=kind&&data[kind].find(p=>p.id===profile.profileId);
    if(!saved){status.textContent='The introduced profile changed or was removed. Refresh profiles before linking.';return;}
    this.guided={kind:profile.kind,profileId:saved.id,name:saved.name};
    // Reuse only a previously confirmed profile association, never a matching name.
    const owner=data.people.find(p=>p[kind].includes(saved.id));this.el('person-existing').value=owner?.id||'';this.selectPerson();
    status.textContent=`${saved.name}'s ${profile.kind} profile is selected. Choose the person, voice and memory links you want, then confirm.`+(data.memoryAvailable?'':' Memory is unavailable; refresh when it reconnects.');
    this.el('people-links').scrollIntoView({block:'start'});this.el('person-existing').focus();
   }
  }catch(e){if(generation===this.generation)this.el('people-status').textContent=e.message||'Person links are unavailable. Please refresh.';}
  finally{if(generation===this.generation){this.loading=false;this.el('person-save').disabled=false;}}
 }
 selectPerson(){
  const person=this.data?.people.find(p=>p.id===this.el('person-existing').value);
  this.el('person-name').value=person?.name||this.guided?.name||'';
  this.el('person-memory').value=person?.memory?String(person.memory.id):'';
  // Switching people must not carry a previously selected unrelated voice/face forward.
  this.el('person-face').value=this.guided?.kind==='face'?this.guided.profileId:'';
  this.el('person-voice').value=this.guided?.kind==='voice'?this.guided.profileId:'';
 }
 async save(){
  if(this.saving||this.loading||!this.data||!this.el('person-name').reportValidity())return;
  this.saving=true;this.el('person-save').disabled=true;
  const generation=this.generation;
  try{
   const person=await this.api.savePerson({id:this.el('person-existing').value||null,name:this.el('person-name').value,faceId:this.el('person-face').value||null,voiceId:this.el('person-voice').value||null,memoryId:this.el('person-memory').value===''?null:Number(this.el('person-memory').value)});
   if(generation!==this.generation)return;
   this.saving=false;await this.refresh();
   if(generation+1===this.generation)this.el('people-status').textContent=`Links saved for ${person.name}. Recognition remains a possible match.`;
  }catch(e){if(generation===this.generation)this.el('people-status').textContent=e.message||'Links could not be saved. Please refresh and check before retrying.';}
  finally{this.saving=false;this.el('person-save').disabled=false;}
 }
 async remove(id){try{await this.api.removePerson(id);await this.refresh();}catch(e){this.el('people-status').textContent=e.message||'Links could not be removed.';}}
}
if(typeof module!=='undefined')module.exports={PersonLinkSettings};
if(typeof window!=='undefined')window.addEventListener('DOMContentLoaded',()=>{
 if(!window.nodie?.personOptions)return;
 const panel=new PersonLinkSettings(window.nodie);void panel.refresh();
 window.addEventListener('recognition-profile-link-requested',event=>void panel.refresh(event.detail));
 window.addEventListener('pagehide',()=>panel.stop(),{once:true});
});
