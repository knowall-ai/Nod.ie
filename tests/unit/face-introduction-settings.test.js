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
