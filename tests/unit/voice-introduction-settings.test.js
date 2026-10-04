const test=require('node:test'),assert=require('node:assert/strict');
const {VoiceIntroductionSettings}=require('../../modules/voice-introduction-settings');
class Element{constructor(){this.value='';this.textContent='';this.hidden=false;}scrollIntoView(){}reportValidity(){return Boolean(this.value.trim());}}
function fixture(t){
 const nodes=new Map(),doc={getElementById:id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);}};
 let proposal={token:'voice-a',name:'Misheard',heard:'Hello, I am Robin.',expiresAt:Date.now()+60000};
 const calls=[],links=[],api={voiceIntroduction:async()=>proposal,confirmRecognitionName:async(...args)=>{calls.push(args);return {status:'saved',kind:'voice',name:args[2],profileId:'saved-voice'};}};
 const panel=new VoiceIntroductionSettings(api,doc,p=>links.push(p));t.after(()=>panel.stop());return {panel,api,calls,links,proposal,setProposal:p=>{proposal=p;}};
}
test('voice confirmation corrects spelling on the captured proposal and offers only its saved profile',async t=>{
 const {panel,calls,links}=fixture(t);await panel.refresh();assert.match(panel.el('heard').textContent,/Hello/);
 panel.name.value='  Robin  ';await panel.confirm(true);assert.deepEqual(calls,[['voice-a',true,'Robin']]);
 assert.equal(panel.form.hidden,true);assert.equal(panel.el('heard').textContent,'');assert.equal(panel.name.value,'');
 panel.el('link').onclick();assert.deepEqual(links,[{kind:'voice',profileId:'saved-voice'}]);panel.clear();panel.el('link').onclick();assert.equal(links.length,1);
});
test('invalid corrections stay editable, and cancellation cannot create a link shortcut',async t=>{
 const {panel,api}=fixture(t);await panel.refresh();api.confirmRecognitionName=async()=>({status:'invalid-name'});await panel.confirm(true);
 assert.equal(panel.pending.token,'voice-a');assert.match(panel.status.textContent,/valid name/);
 api.confirmRecognitionName=async()=>({status:'cancelled'});await panel.confirm(false);assert.equal(panel.savedProfile,null);assert.equal(panel.el('link').hidden,true);
});
test('expiry discards heard text and name and prevents any save',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const {panel,calls}=fixture(t);await panel.refresh();t.mock.timers.tick(60001);
 await panel.confirm(true);assert.equal(calls.length,0);assert.equal(panel.el('heard').textContent,'');assert.equal(panel.name.value,'');assert.match(panel.status.textContent,/expired/);
});
test('late fetches cannot replace a newer introduction or restore text after close',async t=>{
 const {panel,api,proposal}=fixture(t);const replies=[];api.voiceIntroduction=()=>new Promise(r=>replies.push(r));
 const old=panel.refresh(),current=panel.refresh();replies[1]({...proposal,token:'current'});await current;replies[0](proposal);await old;assert.equal(panel.pending.token,'current');
 const closing=panel.refresh();panel.stop();replies[2](proposal);await closing;assert.equal(panel.pending,null);assert.equal(panel.name.value,'');
});
test('a stalled save releases the guard with uncertain-write feedback; its late result cannot restore a shortcut',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const {panel,api,proposal}=fixture(t);await panel.refresh();let finish;api.confirmRecognitionName=()=>new Promise(r=>finish=r);
 const saving=panel.confirm(true);t.mock.timers.tick(10001);await saving;assert.equal(panel.saving,null);assert.match(panel.status.textContent,/Check saved voice profiles/);
 finish({status:'saved',profileId:'late'});await Promise.resolve();assert.equal(panel.savedProfile,null);
 await panel.refresh();assert.equal(panel.pending.token,proposal.token);
});
