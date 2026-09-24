const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {PersonRegistry}=require('../../lib/person-registry');
const {createLinkedResolver}=require('../../unmute-service/linked-people.cjs');
const a='11111111-1111-1111-1111-111111111111',b='22222222-2222-2222-2222-222222222222';
test('confirmed profiles share a stable person and memory, duplicate names never merge',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'nodie-people-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const r=new PersonRegistry(path.join(dir,'links.json'));
 const profiles={faces:[{id:a,name:'Alex'}],voices:[{id:b,name:'Alex'}]},memory={id:7,name:'Alex Example'};
 const one=await r.save({id:null,name:'Alex',faceId:a,voiceId:null,memory},profiles);
 const two=await r.save({id:null,name:'Alex',faceId:null,voiceId:b,memory:null},profiles);assert.notEqual(one.id,two.id);
 await assert.rejects(r.save({id:one.id,name:'Alex',faceId:a,voiceId:b,memory},profiles),/already linked/);
 await r.remove(two.id);const linked=await r.save({id:one.id,name:'Alex',faceId:a,voiceId:b,memory},profiles);assert.equal(linked.id,one.id);
 assert.deepEqual(linked.voices,[b]);assert.equal(new PersonRegistry(r.file).file,r.file);assert.equal((await r.read()).people.length,1);
 await r.unlink('faces',a);assert.equal((await r.read()).people[0].voices.length,1);await r.unlink('voices');assert.equal((await r.read()).people.length,0);assert.equal((await fs.stat(r.file)).mode&0o777,0o600);
});
test('unknown or removed profiles and invalid memory IDs cannot be linked',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'nodie-people-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const r=new PersonRegistry(path.join(dir,'links.json'));
 assert.throws(()=>r.save({id:null,name:'Alex',faceId:a,voiceId:null,memory:null},{faces:[],voices:[]}),/changed/);
 assert.throws(()=>r.save({id:null,name:'Alex',faceId:a,voiceId:null,memory:{id:'7',name:'Alex'}},{faces:[{id:a,name:'Alex'}],voices:[]}),/memory/);
});
test('linked recall filters exact memory ID, bounds context, caches and invalidates unlink',async()=>{
 let calls=0;const registry={revision:'first',people:[{id:'person',faces:[a],voices:[b],memory:{id:7,name:'Alex Example'}}]};
 const resolve=createLinkedResolver(async()=>({callTool:async r=>{calls++;assert.equal(r.name,'search_memories');assert.equal(r.arguments.search_mode,'exact');return {content:[{type:'text',text:JSON.stringify([{memory:{_id:8,name:'Alex Example',notes:'Wrong person'}},{memory:{_id:7,name:'Alex Example',notes:'x'.repeat(5000),embedding:[1,2],aliases:['Al']},connections:[{memory:{name:'Relative',embedding:[1]},relationship:'KNOWS'}]}])}]};}}),async()=>registry);
 const result=await resolve({faces:[a],voices:[]});assert.equal(result.people.length,1);assert.equal(result.people[0].notes.length,600);assert.doesNotMatch(JSON.stringify(result),/Wrong person|embedding/);
 await resolve({faces:[],voices:[b]});assert.equal(calls,1);
 registry.revision='second';registry.people=[];assert.deepEqual(await resolve({faces:[a],voices:[]}),{people:[]});
 await assert.rejects(resolve({faces:['not-an-id'],voices:[]}));
});
test('missing memory record does not fall back to another person with the same name',async()=>{
 const resolve=createLinkedResolver(async()=>({callTool:async()=>({content:[{type:'text',text:JSON.stringify([{memory:{_id:8,name:'Alex Example'}}])}]})}),async()=>({people:[{id:'p',faces:[a],voices:[],memory:{id:7,name:'Alex Example'}}]}));
 assert.deepEqual(await resolve({faces:[a],voices:[]}),{people:[]});
});
test('unlink during memory lookup discards the in-flight personal brief',async()=>{
 let finish;let registry={revision:'old',people:[{id:'p',faces:[a],voices:[],memory:{id:7,name:'Alex Example'}}]};
 const resolver=createLinkedResolver(async()=>({callTool:()=>new Promise(r=>finish=r)}),async()=>registry);
 const pending=resolver({faces:[a],voices:[]});await new Promise(r=>setImmediate(r));registry={revision:'new',people:[]};finish({content:[{type:'text',text:JSON.stringify([{memory:{_id:7,name:'Alex Example',notes:'private'}}])}]});assert.deepEqual(await pending,{people:[]});
});
