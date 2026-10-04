const test=require('node:test'),assert=require('node:assert/strict');
const {PersonLinkSettings}=require('../../modules/person-link-settings');
class Element {
 constructor(){this.value='';this.children=[];this.textContent='';}
 append(...children){this.children.push(...children);}
 replaceChildren(...children){this.children=children;}
 scrollIntoView(){}
 focus(){this.focused=true;}
 reportValidity(){return Boolean(this.value.trim());}
}
function fixture(t){
 const nodes=new Map(),doc={getElementById:id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);},createElement:()=>new Element()};
 const data={people:[{id:'person-existing',name:'Robin',faces:['another-face'],voices:['another-voice'],memory:{id:7,name:'Robin'}}],faces:[{id:'new-face',name:'Robin'},{id:'another-face',name:'Robin'}],voices:[{id:'another-voice',name:'Robin'}],memories:[{id:7,name:'Robin'}],memoryAvailable:true};
 const calls=[],api={personOptions:async()=>data,savePerson:async c=>{calls.push(c);return {name:c.name};},removePerson:async()=>{}};
 const panel=new PersonLinkSettings(api,doc);t.after(()=>panel.stop());return {panel,api,data,calls};
}
test('introduction preselects only its exact saved face, never a same-name person, voice or memory',async t=>{
 const {panel,calls}=fixture(t);await panel.refresh({kind:'face',profileId:'new-face'});
 assert.equal(panel.el('person-face').value,'new-face');assert.equal(panel.el('person-name').value,'Robin');
 for(const field of ['person-existing','person-voice','person-memory'])assert.equal(panel.el(field).value,'');
 assert.equal(calls.length,0);
 panel.el('person-existing').value='person-existing';panel.selectPerson();
 assert.equal(panel.el('person-face').value,'new-face');assert.equal(panel.el('person-voice').value,'');
 panel.el('person-voice').value='another-voice';await panel.save();
 assert.deepEqual(calls,[{id:'person-existing',name:'Robin',faceId:'new-face',voiceId:'another-voice',memoryId:7}]);
 assert.match(panel.el('people-status').textContent,/Links saved/);
});
test('choosing a different person clears unrelated face/voice selections',async t=>{
 const {panel}=fixture(t);await panel.refresh();panel.el('person-face').value='new-face';panel.el('person-voice').value='another-voice';
 panel.el('person-existing').value='person-existing';panel.selectPerson();
 assert.equal(panel.el('person-face').value,'');assert.equal(panel.el('person-voice').value,'');assert.equal(panel.el('person-memory').value,'7');
 panel.el('person-existing').value='';panel.selectPerson();assert.equal(panel.el('person-memory').value,'');assert.equal(panel.el('person-name').value,'');
});
test('removed introduced profiles cannot select a same-name replacement',async t=>{
 const {panel,calls}=fixture(t);await panel.refresh({kind:'face',profileId:'removed'});
 assert.equal(panel.guided,null);assert.equal(panel.el('person-face').value,'');assert.match(panel.el('people-status').textContent,/changed or was removed/);
 await panel.save();assert.equal(calls.length,0);
});
test('only a previously confirmed profile association can select an existing person',async t=>{
 const {panel,data}=fixture(t);data.people[0].faces.push('new-face');await panel.refresh({kind:'face',profileId:'new-face'});
 assert.equal(panel.el('person-existing').value,'person-existing');assert.equal(panel.el('person-memory').value,'7');assert.equal(panel.el('person-voice').value,'');
});
test('late option requests cannot overwrite a newer introduction or write after Settings closes',async t=>{
 const {panel,api,data}=fixture(t);const pending=[];api.personOptions=()=>new Promise(r=>pending.push(r));
 const old=panel.refresh(),current=panel.refresh({kind:'face',profileId:'new-face'});
 await panel.save();pending[1](data);await current;pending[0]({...data,faces:[]});await old;
 assert.equal(panel.el('person-face').value,'new-face');assert.equal(panel.loading,false);
 const closing=panel.refresh();panel.stop();pending[2]({...data,faces:[]});await closing;assert.equal(panel.el('person-face').value,'new-face');
});
test('failed link writes retain explicit choices and show the backend rejection',async t=>{
 const {panel,api}=fixture(t);await panel.refresh({kind:'face',profileId:'new-face'});
 api.savePerson=async()=>{throw Error('Profile already linked to another person');};await panel.save();
 assert.match(panel.el('people-status').textContent,/already linked/);assert.equal(panel.el('person-face').value,'new-face');assert.equal(panel.el('person-save').disabled,false);
});
test('voice shortcut selects only the saved voice and waits for explicit face and memory choices',async t=>{
 const {panel,data,calls}=fixture(t);data.people=[];await panel.refresh({kind:'voice',profileId:'another-voice'});
 assert.equal(panel.el('person-voice').value,'another-voice');for(const field of ['person-face','person-existing','person-memory'])assert.equal(panel.el(field).value,'');assert.equal(calls.length,0);
});
