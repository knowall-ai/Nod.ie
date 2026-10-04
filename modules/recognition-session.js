/** Uses the STT audio clock and never opens another microphone. */
class RecognitionSession {
 constructor(renderer){this.renderer=renderer;this.generation=0;this.words=[];this.turns=[];this.askedFaces=new Map();this.logged=new Set();this.completedProposals=new Map();this.createPrompt();}
 send(session){this.renderer.state.wsHandler?.send({type:'session.update',session:{allow_recording:false,...session}});}
 start(){this.stop();const generation=this.generation;const update=async()=>{try{const status=await window.nodie.liveSpeakerStatus();if(generation!==this.generation)return;const enabled=Boolean(status.enabled)&&!this.renderer.state.isMuted;if(this.enabled&&!enabled){window.nodie.cancelRecognition?.().catch(()=>{});this.clearPrompt();}this.enabled=enabled;this.send({speaker_tracking_enabled:enabled});}catch{this.enabled=false;this.send({speaker_tracking_enabled:false});}};void update();this.poll=setInterval(update,5000);}
 stop(){++this.generation;clearInterval(this.poll);clearTimeout(this.attemptTimer);this.enabled=false;this.words=[];this.turns=[];this.assistantText='';this.previousAssistant='';this.logged=new Set();this.completedProposals.clear();this.speaking=false;this.clearPrompt();this.send({speaker_tracking_enabled:false,speaker_observation:null,face_observation:null,recognition_feedback:null});window.nodie?.cancelRecognition?.().catch(()=>{});window.nodie?.cancelSpeakers?.().catch(()=>{});}
 confirmationBusy(busy){this.prompt?.setAttribute?.('aria-busy',String(busy));for(const element of [this.confirmButton,this.cancelButton,this.nameInput])if(element)element.disabled=busy;}
 releaseConfirmation(confirmation=this.confirming){if(!confirmation)return;clearTimeout(confirmation.timer);confirmation.cancel?.();if(this.confirming===confirmation){this.confirming=null;this.confirmationBusy(false);if(this.pending===confirmation.pending&&this.label)this.label.textContent=confirmation.label;}}
 clearPrompt(){this.releaseConfirmation();clearTimeout(this.expiry);this.pending=null;if(this.prompt)this.prompt.hidden=true;if(this.nameInput)this.nameInput.value='';}
 event(data){
  if(data.type==='nodie.speaker_audio'){void this.analyse(data);return;}
  if(data.type==='nodie.word_end'){const word=this.words.at(-1)||this.turns.at(-1)?.words.at(-1);if(word&&Number.isFinite(data.end_time)&&data.end_time>word.start)word.end=data.end_time;this.schedule();return;}
  if(data.type==='nodie.attributed_words'){
   this.renderer.transcript?.attribute?.(data.words);
   for(const word of data.words||[]){for(const target of [...this.words,...this.turns.flatMap(t=>t.words)])if(target.start===word.start&&target.text===word.text)Object.assign(target,word);
    const key=word.start+':'+(word.profile||'?');if(this.logged.has(key))continue;this.logged.add(key);if(this.logged.size>200)this.logged.delete(this.logged.values().next().value);this.renderer.debugStream?.add('Speaker words',`${word.name||(word.profile?'Unknown speaker':'Unattributed')}: ${word.text}`);
   }this.schedule();return;
  }
  if(data.type==='response.text.delta'&&typeof data.delta==='string')this.assistantText=((this.assistantText||'')+data.delta).slice(-2000);
  if(data.type==='conversation.item.input_audio_transcription.delta'&&typeof data.delta==='string'&&Number.isFinite(data.start_time)){if(!this.words.length)this.previousAssistant=this.assistantText||'';this.words.push({text:data.delta,start:data.start_time});this.words=this.words.slice(-100);}
  if(data.type==='response.created'){if(this.words.length)this.turns.push({words:this.words,previousAssistant:this.previousAssistant,at:Date.now()});this.turns=this.turns.slice(-3);this.words=[];this.assistantText='';this.speaking=true;}
  if(['response.done','response.audio.done','response.cancelled','unmute.interrupted_by_vad'].includes(data.type)){this.speaking=false;this.schedule();}
 }
 schedule(){clearTimeout(this.attemptTimer);if(!this.speaking)this.attemptTimer=setTimeout(()=>void this.propose(),300);}
 async analyse(data){if(!this.enabled||this.busy||typeof data.audio!=='string'||data.audio.length>350000||!Number.isFinite(data.start_time)||!Number.isFinite(data.end_time)||data.start_time<0||data.end_time<=data.start_time||data.end_time-data.start_time>5)return;const generation=this.generation;this.busy=true;try{const bytes=Uint8Array.from(atob(data.audio),c=>c.charCodeAt(0));const observation=await window.nodie.analyseSpeakers(bytes,{start:data.start_time,end:data.end_time});if(generation!==this.generation||!this.enabled||!observation)return;this.send({speaker_observation:{...observation,start_time:data.start_time,end_time:data.end_time}});this.schedule();}catch{}finally{this.busy=false;}}
 faces(result){const faces=result?.state==='ready'?result.faces:[];this.send({face_observation:faces.map(f=>{const mayAskName=!f.name&&!f.uncertain&&f.id&&Date.now()-(this.askedFaces.get(f.id)||0)>300000;if(mayAskName)this.askedFaces.set(f.id,Date.now());return {profileId:f.name&&!f.uncertain?f.id:null,name:f.name||null,uncertain:true,mayAskName:Boolean(mayAskName)};})});}
 async propose(){if(this.proposing||this.pending||this.speaking)return;const turn=this.turns.find(t=>!t.attempted&&Date.now()-t.at<15000&&t.words.every(w=>Number.isFinite(w.end)));if(!turn)return;turn.attempted=true;const generation=this.generation;this.proposing=true;try{const result=await window.nodie.proposeRecognitionName({text:turn.words.map(w=>w.text).join(' ').slice(0,2000),start:turn.words[0].start,end:turn.words.at(-1).end,previousAssistant:turn.previousAssistant});if(['awaiting-observation','deferred'].includes(result.status))turn.attempted=false;if(generation!==this.generation||result.status!=='pending')return;this.showPrompt(result);}catch{}finally{this.proposing=false;}}
 showPrompt(result){this.releaseConfirmation();this.pending=result;clearTimeout(this.expiry);if(this.completedProposals.has(result.token)){this.result(this.completedProposals.get(result.token));return;}if(result.selectionInSettings){this.expiry=setTimeout(()=>{if(this.pending===result)void this.confirm(false);},60000);this.prompt.hidden=true;this.send({recognition_feedback:{status:'pending',kind:result.kind,name:result.name}});return;}this.nameInput.value=result.name;clearTimeout(this.expiry);this.expiry=setTimeout(()=>{if(this.pending===result)void this.confirm(false);},60000);this.label.textContent=`Name ${result.kind==='face'?'the sole person visible when introduced':'the voice in that introduction'}. Check the spelling, then confirm to save.`;this.prompt.hidden=false;this.send({recognition_feedback:{status:'pending',kind:result.kind,name:result.name}});}
 result(result){
  if(!result?.token)return;
  // Settings may finish or close before the proposal IPC response reaches this window.
  this.completedProposals.set(result.token,result);if(this.completedProposals.size>8)this.completedProposals.delete(this.completedProposals.keys().next().value);
  if(!this.pending||result.token!==this.pending.token)return;
  this.clearPrompt();this.send({recognition_feedback:{status:result.status,kind:result.kind,name:result.name}});this.schedule();
  this.renderer.debugStream?.add('Naming',`${result.kind}: ${result.name} — ${result.status}`);
 }
 async confirm(accepted){
  const pending=this.pending;if(!pending||this.confirming)return;
  if(accepted&&!this.nameInput.reportValidity())return;
  const name=this.nameInput.value.trim(),generation=this.generation,confirmation={pending,label:this.label.textContent};this.confirming=confirmation;this.confirmationBusy(true);this.label.textContent='Saving the name…';
  const deadline=new Promise((_,reject)=>{confirmation.cancel=()=>reject(Error('Confirmation superseded'));confirmation.timer=setTimeout(()=>reject(Error('Confirmation timed out')),10000);});
  try{
   const result=await Promise.race([window.nodie.confirmRecognitionName(pending.token,accepted,accepted?name:undefined),deadline]);
   if(generation!==this.generation||this.pending!==pending)return;
   if(result.status==='invalid-name'){this.renderer.showNotification('Enter a valid name before confirming.','error');return;}
   this.clearPrompt();const savedName=result.name||pending.name;
   this.send({recognition_feedback:{status:result.status,kind:pending.kind,name:savedName}});this.schedule();
   this.renderer.debugStream?.add('Naming',`${pending.kind}: ${savedName} — ${result.status}`);
  }catch{if(generation===this.generation&&this.pending===pending){this.clearPrompt();this.renderer.showNotification('Name confirmation could not be completed. Check saved profiles before trying again.','error');}}
  finally{this.releaseConfirmation(confirmation);}
 }
 createPrompt(){this.prompt=document.createElement('div');this.prompt.id='recognition-confirm';this.prompt.hidden=true;this.prompt.setAttribute('role','alertdialog');this.prompt.setAttribute('aria-label','Confirm recognition label');this.label=document.createElement('span');this.prompt.append(this.label);const field=document.createElement('label');field.textContent='Name';this.nameInput=document.createElement('input');this.nameInput.type='text';this.nameInput.maxLength=80;this.nameInput.required=true;this.nameInput.autocomplete='off';this.nameInput.setAttribute('aria-label','Correct the name spelling');field.append(this.nameInput);this.prompt.append(field);for(const [text,value] of [['Confirm',true],['Cancel',false]]){const b=document.createElement('button');b.type='button';b.textContent=text;b.onclick=()=>void this.confirm(value);if(value)this.confirmButton=b;else this.cancelButton=b;this.prompt.append(b);}document.body.append(this.prompt);}
}
if(typeof window!=='undefined')window.RecognitionSession=RecognitionSession;
if(typeof module!=='undefined')module.exports={RecognitionSession};

if(typeof window!=='undefined')window.addEventListener('DOMContentLoaded',()=>{if(window.NodieRenderer&&window.nodie?.proposeRecognitionName){const r=window.NodieRenderer;r.recognition ||= new RecognitionSession(r);window.nodie.onRecognitionProposal?.(p=>r.recognition.showPrompt(p));window.nodie.onRecognitionResult?.(p=>r.recognition.result(p));}});
