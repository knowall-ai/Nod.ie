const test=require('node:test');
const assert=require('node:assert/strict');
const {FaceIntroductionSettings}=require('../../modules/face-introduction-settings');
const {RecognitionSession}=require('../../modules/recognition-session');

class Element {
 constructor(){this.children=[];this.hidden=false;this.value='';this.textContent='';}
 append(...children){this.children.push(...children);}
 replaceChildren(){this.children=[];}
 querySelector(){return this.children.flatMap(c=>c.children).find(c=>c.type==='radio'&&c.checked);}
 scrollIntoView(){}
 reportValidity(){return Boolean(this.value.trim());}
}
function fixture(t){
 const nodes=new Map(),doc={getElementById:id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);},createElement:()=>new Element()};
 let proposal={token:'original',name:'Robin',expiresAt:Date.now()+60000,selectionRequired:true,faces:[{id:'a',thumbnail:'/9j/AAA='},{id:'b',thumbnail:'/9j/BBB='}]};
 const calls=[],api={faceIntroduction:async()=>proposal,confirmRecognitionName:async(...args)=>{calls.push(args);return {status:'saved'};}};
 const panel=new FaceIntroductionSettings(api,doc);t.after(()=>panel.stop());
 return {panel,api,calls,setProposal:p=>{proposal=p;},proposal};
}
test('Settings requires an explicit face choice and submits the corrected name with that snapshot ID',async t=>{
 const {panel,calls}=fixture(t);await panel.refresh();
 assert.equal(panel.choices.children.length,2);assert.equal(panel.choices.querySelector(),undefined);
 await panel.confirm(true);assert.equal(calls.length,0);assert.match(panel.status.textContent,/Select/);
 panel.choices.children[1].children[1].checked=true;panel.choices.onchange();assert.equal(panel.status.textContent,'');
 panel.name.value='  Correct spelling  ';await panel.confirm(true);
 assert.deepEqual(calls,[['original',true,'Correct spelling','b']]);
 assert.equal(panel.choices.children.length,0);assert.equal(panel.name.value,'');assert.equal(panel.form.hidden,true);assert.match(panel.status.textContent,/Name saved/);
});
test('late Settings fetches cannot replace a newer proposal or restore crops after close',async t=>{
 const {panel,api,proposal}=fixture(t);const pending=[];api.faceIntroduction=()=>new Promise(r=>pending.push(r));
 const old=panel.refresh(),next=panel.refresh();pending[1]({...proposal,token:'new'});await next;
 pending[0](proposal);await old;assert.equal(panel.pending.token,'new');
 const closing=panel.refresh();panel.stop();pending[2](proposal);await closing;
 assert.equal(panel.pending,null);assert.equal(panel.choices.children.length,0);
});
test('expiry clears the thumbnail elements and prevents confirmation',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const {panel,calls}=fixture(t);await panel.refresh();
 t.mock.timers.tick(60001);assert.equal(panel.pending,null);assert.equal(panel.choices.children.length,0);
 await panel.confirm(true);assert.equal(calls.length,0);assert.match(panel.status.textContent,/expired/);
});
test('invalid names allow a correction; cancellation requires no face selection and discards crops',async t=>{
 const {panel,api,calls}=fixture(t);await panel.refresh();panel.choices.children[0].children[1].checked=true;
 api.confirmRecognitionName=async()=>({status:'invalid-name'});await panel.confirm(true);
 assert.equal(panel.pending.token,'original');assert.match(panel.status.textContent,/valid name/);
 panel.name.oninput();assert.equal(panel.status.textContent,'');
 api.confirmRecognitionName=async(...args)=>{calls.push(args);return {status:'cancelled'};};
 panel.choices.children[0].children[1].checked=false;await panel.confirm(false);
 assert.equal(calls[0][1],false);assert.equal(panel.pending,null);assert.equal(panel.choices.children.length,0);
});
test('a Settings result arriving before the proposal response cannot resurrect a naming prompt',()=>{
 const feedback=[],s=Object.create(RecognitionSession.prototype);
 Object.assign(s,{renderer:{},completedProposals:new Map(),prompt:{hidden:false},nameInput:{value:''},send:v=>feedback.push(v),schedule:()=>{}});
 s.result({token:'late',status:'cancelled',kind:'face',name:'Robin'});
 s.showPrompt({token:'late',status:'pending',selectionInSettings:true,kind:'face',name:'Robin'});
 assert.equal(s.pending,null);assert.equal(s.prompt.hidden,true);assert.equal(s.expiry,undefined);
 assert.equal(feedback.at(-1).recognition_feedback.status,'cancelled');
 for(let i=0;i<20;i++)s.result({token:String(i),status:'saved'});
 assert.equal(s.completedProposals.size,8);
});
test('a stalled save releases controls and replays a newer introduction without accepting late results',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const {panel,api,setProposal,proposal}=fixture(t);await panel.refresh();
 panel.choices.children[0].children[1].checked=true;let finish;
 api.confirmRecognitionName=()=>new Promise(resolve=>{finish=resolve;});
 const stalled=panel.confirm(true);assert.equal(panel.cancelButton.disabled,true);assert.equal(panel.name.disabled,true);
 setProposal({...proposal,token:'next',name:'Taylor'});await panel.refresh();assert.equal(panel.pending.token,'original');
 t.mock.timers.tick(10001);await stalled;await Promise.resolve();
 assert.equal(panel.saving,false);assert.equal(panel.cancelButton.disabled,false);assert.equal(panel.name.disabled,false);
 assert.equal(panel.pending.token,'next');assert.equal(panel.name.value,'Taylor');
 finish({status:'saved'});await Promise.resolve();assert.equal(panel.pending.token,'next');assert.equal(panel.name.value,'Taylor');
});
test('expiry discards crops during an accepted save while its successful feedback remains visible',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const {panel,api,setProposal,proposal}=fixture(t);
 setProposal({...proposal,expiresAt:Date.now()+1000});await panel.refresh();panel.choices.children[0].children[1].checked=true;let finish;
 api.confirmRecognitionName=()=>new Promise(resolve=>{finish=resolve;});const saving=panel.confirm(true);
 t.mock.timers.tick(1001);assert.equal(panel.pending,null);assert.equal(panel.choices.children.length,0);assert.equal(panel.name.value,'');assert.match(panel.status.textContent,/in progress/);
 setProposal(null);await panel.refresh();finish({status:'saved'});await saving;await Promise.resolve();
 assert.match(panel.status.textContent,/Name saved/);assert.equal(panel.section.hidden,false);assert.equal(panel.saving,false);
});
test('a stalled save reports uncertainty and permits the next introduction',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const {panel,api,setProposal,proposal}=fixture(t);await panel.refresh();panel.choices.children[0].children[1].checked=true;
 api.confirmRecognitionName=()=>new Promise(()=>{});const saving=panel.confirm(true);t.mock.timers.tick(10001);await saving;
 assert.equal(panel.pending,null);assert.equal(panel.saving,false);assert.match(panel.status.textContent,/Check the saved profiles/);
 setProposal({...proposal,token:'next'});await panel.refresh();assert.equal(panel.pending.token,'next');
});
test('stopping during confirmation releases the guard and late completion cannot replace a new save',async t=>{
 const {panel,api,setProposal,proposal}=fixture(t);await panel.refresh();panel.choices.children[0].children[1].checked=true;
 const replies=[];api.confirmRecognitionName=()=>new Promise(resolve=>replies.push(resolve));const old=panel.confirm(true);panel.stop();await old;
 setProposal({...proposal,token:'new'});await panel.refresh();panel.choices.children[0].children[1].checked=true;const current=panel.confirm(true),guard=panel.confirmation;
 replies[0]({status:'saved'});await Promise.resolve();assert.equal(panel.confirmation,guard);assert.equal(panel.pending.token,'new');assert.equal(panel.saving,true);
 replies[1]({status:'saved'});await current;assert.equal(panel.saving,false);assert.match(panel.status.textContent,/Name saved/);
});
test('a status fetch started before confirmation cannot resurrect the saved proposal',async t=>{
 const {panel,api,proposal}=fixture(t);await panel.refresh();panel.choices.children[0].children[1].checked=true;let fetched;
 api.faceIntroduction=()=>new Promise(resolve=>{fetched=resolve;});const stale=panel.refresh();
 await panel.confirm(true);fetched(proposal);await stale;
 assert.equal(panel.pending,null);assert.equal(panel.choices.children.length,0);assert.match(panel.status.textContent,/Name saved/);
});
