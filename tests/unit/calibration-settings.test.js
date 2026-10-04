const test=require('node:test'),assert=require('node:assert/strict');
const {CalibrationSettings}=require('../../modules/calibration-settings');
class Element{constructor(){this.value='';this.children=[];this.textContent='';this.hidden=false;}append(...c){this.children.push(...c);}replaceChildren(...c){this.children=c;}}
function fixture(t){
 const nodes=new Map(),doc={getElementById:id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);},createElement:()=>new Element()};
 const data={faces:{enabled:true,profiles:[{id:'face',name:'Robin',samples:1,maxSamples:4}]},voices:{enabled:true,profiles:[{id:'voice',name:'Robin',samples:1,maxSamples:8}]},operation:null};
 const calls=[],api={calibrationStatus:async()=>structuredClone(data),beginCalibration:async c=>{calls.push(c);},confirmCalibration:async(token,accepted)=>{calls.push([token,accepted]);data.faces.profiles[0].samples=2;data.operation={kind:'face',name:'Robin',phase:'saved',report:{message:'Sample saved.',latencyMs:74}};},cancelCalibration:async()=>{data.operation=null;}};
 const p=new CalibrationSettings(api,doc);t.after(()=>p.stop());return {p,data,api,calls};
}
test('profile selection is explicit and capture/test retain distinct modes without auto-save',async t=>{
 const {p,calls}=fixture(t);await p.refresh();assert.equal(p.el('profile').value,'');assert.equal(p.el('collect').disabled,true);
 p.el('profile').value='face';p.details();await p.begin('test');assert.deepEqual(calls,[{kind:'face',profileId:'face',mode:'test'}]);
});
test('ready sample shows an isolated crop and named confirmation, then clears it after save',async t=>{
 const {p,data,calls}=fixture(t);data.operation={token:'captured',kind:'face',profileId:'face',name:'Robin',phase:'ready',expiresAt:Date.now()+60000,report:{message:'Possible match: Robin',quality:'Sharp face',thumbnail:'/9j/AAA=',latencyMs:74}};
 await p.refresh();assert.equal(p.el('preview').children.length,1);assert.equal(p.el('confirm').hidden,false);assert.match(p.el('confirm').textContent,/Robin/);assert.equal(p.el('kind').disabled,true);assert.equal(p.el('cancel').disabled,false);assert.equal(calls.length,0);
 await p.confirm();assert.deepEqual(calls,[['captured',true]]);assert.equal(p.el('preview').children.length,0);assert.equal(p.el('confirm').hidden,true);assert.match(p.el('counts').textContent,/2 of 4/);
});
test('completed recognition tests never expose confirmation and sample limits still allow testing',async t=>{
 const {p,data}=fixture(t);data.faces.profiles[0].samples=4;data.operation={kind:'face',profileId:'face',name:'Robin',mode:'test',phase:'complete',report:{message:'Uncertain; no identity established.',latencyMs:80}};
 await p.refresh();p.el('profile').value='face';p.details();assert.equal(p.el('confirm').hidden,true);assert.equal(p.el('collect').disabled,true);assert.equal(p.el('test').disabled,false);
});
test('late status fetches cannot restore a preview after Settings closes',async t=>{
 const {p,api,data}=fixture(t);let finish;api.calibrationStatus=()=>new Promise(r=>finish=r);const pending=p.refresh();p.stop();finish(data);await pending;assert.equal(p.el('preview').children.length,0);
});
test('a stalled capture-start request releases the Settings guard and asks for a fresh attempt',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const {p,api}=fixture(t);await p.refresh();p.el('profile').value='face';p.details();api.beginCalibration=()=>new Promise(()=>{});
 const pending=p.begin('collect');t.mock.timers.tick(10001);await pending;
 assert.equal(p.busy,false);assert.equal(p.el('collect').disabled,false);assert.equal(p.el('kind').disabled,false);assert.match(p.el('status').textContent,/Capture did not start/);
});

test('save disables Cancel immediately and stale ready notifications cannot enable it',async t=>{
 const {p,data,api}=fixture(t);data.operation={token:'captured',kind:'face',profileId:'face',name:'Robin',phase:'ready',report:{message:'Confirm sample'}};
 await p.refresh();assert.equal(p.el('cancel').disabled,false);
 let finish,cancelled=0;api.confirmCalibration=()=>new Promise(resolve=>finish=resolve);api.cancelCalibration=async()=>{cancelled++;};
 const saving=p.confirm();assert.equal(p.el('cancel').disabled,true);
 await p.refresh();assert.equal(p.el('cancel').disabled,true);await p.cancel();assert.equal(cancelled,0);
 data.operation={phase:'saved',kind:'face',report:{message:'Saved'}};finish({saved:true});await saving;assert.equal(p.busy,false);assert.equal(p.el('cancel').disabled,true);
});
test('unconfirmed save keeps cancellation disabled until fresh status establishes its state',async t=>{
 const {p,data,api}=fixture(t);data.operation={token:'captured',kind:'face',profileId:'face',name:'Robin',phase:'ready',report:{message:'Confirm sample'}};
 await p.refresh();api.confirmCalibration=async()=>{throw Error('Connection lost');};await p.confirm();
 assert.equal(p.el('cancel').disabled,true);assert.equal(p.el('confirm').hidden,true);
 data.operation={phase:'saving',kind:'face',profileId:'face'};await p.refresh();assert.equal(p.el('cancel').disabled,true);
 data.operation=null;await p.refresh();assert.equal(p.el('collect').disabled,false);
});
