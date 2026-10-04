const test=require('node:test'),assert=require('node:assert/strict');
const {MemorySettings,validateConnection,targetKey}=require('../../lib/memory-settings');
const input={uri:'neo4j+s://brain.example:7687',database:'memories',username:'reader',password:'fixture-secret'};
function fixture(options={}){
 let saved;
 const store={get:()=>saved,set:(_key,value)=>{saved=value;},delete:()=>{saved=undefined;}};
 const safeStorage={isEncryptionAvailable:()=>true,getSelectedStorageBackend:()=> 'gnome_libsecret',encryptString:s=>Buffer.from('protected:'+s),decryptString:b=>b.toString().replace(/^protected:/,'')};
 const settings=new MemorySettings({store,safeStorage,...options});return {settings,store,safeStorage,read:()=>saved};
}
test('only explicit credential-free Neo4j targets are accepted',()=>{
 for(const uri of ['bolt://localhost:7687','neo4j://192.0.2.10:7687','bolt+s://brain.example','neo4j+s://brain.example'])assert.equal(validateConnection({...input,uri}).uri,uri);
 for(const uri of ['https://brain.example','bolt+ssc://brain.example','neo4j://user:secret@brain.example','neo4j://brain.example/path','neo4j://brain.example?secret=x','neo4j://brain.example#x','bad'])assert.throws(()=>validateConnection({...input,uri}));
 for(const patch of [{username:''},{database:'\n'},{password:1},{password:'\0'},{unknown:'value'},{uri:123}])assert.throws(()=>validateConnection({...input,...patch}));
});
test('password is encrypted, excluded from status and reusable only for unchanged target',()=>{
 const {settings,read}=fixture();assert.equal(settings.status().mode,'legacy');
 const status=settings.save(input);assert.equal(status.mode,'configured');assert.equal(status.hasPassword,true);assert.ok(!('password' in read()));assert.ok(!JSON.stringify(status).includes('fixture-secret'));assert.ok(!JSON.stringify(status).includes('encryptedPassword'));
 assert.equal(settings.credentials().NEO4J_PASSWORD,input.password);
 settings.save({...input,password:''});
 for(const patch of [{uri:'neo4j+s://other.example'},{database:'other'},{username:'other'}])assert.throws(()=>settings.prepare({...input,...patch,password:''}),/Enter the password/);
 settings.reset();assert.equal(settings.credentials(),null);assert.equal(settings.status().mode,'legacy');
});
test('unavailable or plaintext-fallback OS storage cannot persist or unlock passwords',()=>{
 const {settings,safeStorage,read}=fixture();safeStorage.isEncryptionAvailable=()=>false;
 assert.throws(()=>settings.save(input),/Secure password storage/);assert.equal(read(),undefined);
 safeStorage.isEncryptionAvailable=()=>true;safeStorage.getSelectedStorageBackend=()=> 'basic_text';assert.throws(()=>settings.save(input));
 safeStorage.getSelectedStorageBackend=()=> 'kwallet6';settings.save(input);safeStorage.getSelectedStorageBackend=()=> 'basic_text';assert.throws(()=>settings.credentials());
});
test('read-only test verifies DB query, closes client, never persists or returns memory contents',async()=>{
 const calls=[];let closed=0,credentials;
 const {settings,read}=fixture({connect:async value=>{credentials=value;return {callTool:async(...args)=>{calls.push(args);return {content:[{type:'text',text:'private memory'}]};},close:async()=>{closed++;}};}});
 const result=await settings.test(input);assert.equal(result.state,'connected');assert.ok(!JSON.stringify(result).includes('private memory'));assert.equal(read(),undefined);assert.equal(closed,1);
 assert.equal(credentials.NEO4J_URI,input.uri);assert.equal(credentials.NEO4J_PASSWORD,input.password);assert.equal(calls.length,1);assert.equal(calls[0][0].name,'search_memories');assert.equal(calls[0][0].arguments.limit,1);assert.equal(calls[0][2].timeout,5000);
});
test('failure hides upstream credentials and closes connected client',async()=>{
 let closed=0;
 const {settings}=fixture({connect:async()=>({callTool:async()=>{throw Error(input.password);},close:async()=>{closed++;}})});
 await assert.rejects(settings.test(input),e=>!e.message.includes(input.password)&&/Connection test failed/.test(e.message));assert.equal(closed,1);
 const errorResult=fixture({connect:async()=>({callTool:async()=>({isError:true}),close:async()=>{closed++;}})});
 await assert.rejects(errorResult.settings.test(input));assert.equal(closed,2);
});
test('database identity key excludes passwords and differs for distinct targets',()=>{
 assert.equal(targetKey(input),targetKey({...input,password:'changed'}));
 for(const patch of [{uri:'bolt://other:7687'},{database:'other'},{username:'other'}])assert.notEqual(targetKey(input),targetKey({...input,...patch}));
 assert.equal(targetKey(null),'legacy');
});
test('parallel test requests are bounded to one client and failures release the slot',async()=>{
 let release,calls=0;
 const {settings}=fixture({connect:async()=>{calls++;await new Promise(r=>release=r);return {callTool:async()=>({isError:true}),close:async()=>{}};}});
 const first=settings.test(input);await assert.rejects(settings.test(input),/already running/);assert.equal(calls,1);
 release();await assert.rejects(first);assert.equal(settings.testing,false);
});
test('legacy credentials import only fixed Neo4j variables without executing configured commands',async()=>{
 const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'nodie-memory-config-')),file=path.join(dir,'config.json');
 try{
  await fs.writeFile(file,JSON.stringify({mcpServers:{reverie:{command:'never-execute-this',env:{NEO4J_URI:input.uri,NEO4J_PASSWORD:input.password,UNTRUSTED:'ignored'}}}}),{mode:0o600});
  const {legacyCredentials}=require('../../lib/reverie-connection');
  assert.deepEqual(await legacyCredentials(key=>({REVERIE_CONFIG_PATH:file,REVERIE_CONFIG_SERVER:'reverie'}[key])),{NEO4J_URI:input.uri,NEO4J_PASSWORD:input.password});
  assert.equal(await legacyCredentials(()=>null),null);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
