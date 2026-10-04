const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {PersonRegistry}=require('../../lib/person-registry'),{unlinkRegistries}=require('../../lib/person-link-registries'),{targetKey}=require('../../lib/memory-settings');
const {createLinkedResolver}=require('../../unmute-service/linked-people.cjs');
test('editing a profile under brain B invalidates brain A and legacy links before switching back',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'nodie-brain-links-'));const profiles={faces:[{id:crypto.randomUUID(),name:'Robin'}],voices:[{id:crypto.randomUUID(),name:'Robin'}]};
 const legacy=path.join(dir,'legacy.json'),connections=path.join(dir,'connections');await fs.mkdir(connections);
 const files=[legacy,...['brain-a','brain-b'].map(host=>path.join(connections,targetKey({uri:'bolt://'+host,database:'neo4j',username:'reader'})+'.json'))];
 try{
  for(const file of files)await new PersonRegistry(file).save({id:null,name:'Robin',faceId:profiles.faces[0].id,voiceId:profiles.voices[0].id,memory:{id:7,name:'Robin'}},profiles);
  await unlinkRegistries(connections,legacy,'faces',profiles.faces[0].id);
  for(const file of files)assert.deepEqual((await new PersonRegistry(file).read()).people[0].faces,[]);
  await unlinkRegistries(connections,legacy,'voices',profiles.voices[0].id);
  for(const file of files){
   const resolve=createLinkedResolver(()=>assert.fail('stale identity must not query memory'),()=>new PersonRegistry(file).read());
   assert.deepEqual(await resolve({faces:[profiles.faces[0].id],voices:[profiles.voices[0].id]}),{people:[]});
  }
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('missing registry directories are harmless; malformed registries stop identity changes',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'nodie-brain-links-'));
 try{
  await unlinkRegistries(path.join(dir,'missing'),path.join(dir,'legacy.json'),'faces');
  await fs.writeFile(path.join(dir,'a'.repeat(64)+'.json'),'invalid');
  await assert.rejects(unlinkRegistries(dir,path.join(dir,'legacy.json'),'voices'));
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
