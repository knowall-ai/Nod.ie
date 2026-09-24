const {test}=require('node:test');
const assert=require('node:assert/strict');
const {saveMemory,validSave}=require('../../unmute-service/reverie-readonly.cjs');
const args={name:'Test person',label:'Person',fact:'Likes blue.'};
function mock(rows, mutation) {const calls=[];return {calls,async callTool(call){calls.push(call);const value=call.name==='search_memories'?rows:await mutation(call);return {content:[{type:'text',text:JSON.stringify(value)}]};}};}
test('save validates bounded arguments and rejects arbitrary properties',()=>{assert.equal(validSave(args),true);for(const a of [{...args,cypher:'x'},{...args,fact:''},{...args,label:'Person) DELETE'},{...args,fact:'x'.repeat(1501)}])assert.equal(validSave(a),false);});
test('create confirms returned data and repeated fact does not write again',async()=>{const c=mock([],c=>({memory:{_id:42,...c.arguments.properties}}));assert.equal((await saveMemory(c,args)).status,'saved');assert.equal(c.calls[1].name,'create_memory');const d=mock([{memory:{_id:42,notes:args.fact}}],()=>{throw Error('must not write')});assert.equal((await saveMemory(d,args)).already_present,true);assert.equal(d.calls.length,1);});
test('updates append notes without changing unrelated properties',async()=>{const c=mock([{memory:{_id:42,name:args.name,notes:'Existing fact.',age:9}}],c=>({memory:{_id:42,...c.arguments.properties}}));assert.equal((await saveMemory(c,args)).status,'saved');assert.deepEqual(c.calls[1].arguments,{nodeId:42,properties:{notes:'Existing fact.\nLikes blue.'}});});
test('ambiguous identities and invalid notes never write',async()=>{for(const rows of [[{memory:{_id:1}},{memory:{_id:2}}],[{memory:{_id:1,notes:['old']}}]]) {const c=mock(rows,()=>{throw Error('no write')});assert.equal((await saveMemory(c,args)).status,'not-saved');assert.equal(c.calls.length,1);}});
test('failed or unconfirmed writes report unknown and never retry',async()=>{for(const mutate of [()=>{throw Error('timeout')},()=>({memory:{_id:42,notes:'wrong'}})]) {const c=mock([],mutate);assert.equal((await saveMemory(c,args)).status,'unknown');assert.equal(c.calls.length,2);}});

test('multiline facts are rejected by schema and runtime before any write',async()=>{
 const {saveTool}=require('../../unmute-service/reverie-readonly.cjs');
 const pattern=new RegExp(saveTool.inputSchema.properties.fact.pattern);
 for(const fact of ['A\nB','A\rB','A\r\nB','A\n']) {
  assert.equal(pattern.test(fact),false);
  const c=mock([],()=>{throw Error('must not write')});
  assert.equal((await saveMemory(c,{...args,fact})).status,'not-saved');
  assert.equal(c.calls.length,0);
 }
});
test('exact lookup scopes a same-name identity to its category',async()=>{
 const c={calls:[],async callTool(call){this.calls.push(call);const value=call.name==='search_memories'
   ? (call.arguments.label==='Person'?[]:[{memory:{_id:7,name:args.name,notes:'A place.'}}])
   : {memory:{_id:42,...call.arguments.properties}};
  return {content:[{type:'text',text:JSON.stringify(value)}]};}};
 assert.equal((await saveMemory(c,args)).status,'saved');
 assert.equal(c.calls[0].arguments.label,'Person');assert.equal(c.calls[1].name,'create_memory');
});

test('an unconfirmed write blocks later mutations in the bridge',async()=>{
 const {createMemoryServer}=require('../../unmute-service/reverie-readonly.cjs');
 const {Client}=require('@modelcontextprotocol/sdk/client/index.js');
 const {InMemoryTransport}=require('@modelcontextprotocol/sdk/inMemory.js');
 let mutations=0;const upstream=mock([],()=>{mutations++;throw Error('uncertain commit');});
 const server=createMemoryServer(async()=>upstream);const client=new Client({name:'test',version:'1'});
 const [a,b]=InMemoryTransport.createLinkedPair();await server.connect(a);await client.connect(b);
 try {
  const call=async()=>JSON.parse((await client.callTool({name:'save_memory',arguments:args})).content[0].text);
  assert.equal((await call()).status,'unknown');assert.equal((await call()).status,'not-saved');assert.equal(mutations,1);
 }finally{await client.close();await server.close();}
});
