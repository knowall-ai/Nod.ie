/** Explicit local links. Equal names alone never merge identities. No biometrics here. */
const fs=require('node:fs/promises');
const crypto=require('node:crypto');
const {ConversationHistory}=require('./conversation-history');
const uuid=s=>typeof s==='string'&&/^[a-f0-9-]{36}$/.test(s);
const name=s=>typeof s==='string'&&s.trim().length>0&&s.length<=160&&!/[\p{Cc}\p{Cf}]/u.test(s);
class PersonRegistry extends ConversationHistory {
 empty(){return {version:1,revision:crypto.randomUUID(),people:[]};}
 async read(){
  let d;try{if((await fs.stat(this.file)).size>64000)throw Error('Person links exceed limit');d=JSON.parse(await fs.readFile(this.file,'utf8'));}catch(e){if(e.code==='ENOENT')return this.empty();throw e;}
  if(d.version!==1||!uuid(d.revision)||!Array.isArray(d.people)||d.people.length>64||d.people.some(p=>!uuid(p.id)||!name(p.name)||!Array.isArray(p.faces)||!Array.isArray(p.voices)||p.faces.length>32||p.voices.length>32||[...p.faces,...p.voices].some(id=>!uuid(id))||(p.memory!==null&&(!Number.isSafeInteger(p.memory?.id)||p.memory.id<0||!name(p.memory.name)))))throw Error('Invalid person links');
  return d;
 }
 save({id,name:label,faceId,voiceId,memory},profiles){
  if(id!==null&&!uuid(id)||!name(label)||faceId!==null&&!uuid(faceId)||voiceId!==null&&!uuid(voiceId)||!faceId&&!voiceId&&!id)throw Error('Choose at least one named recognition profile');
  if(faceId&&!profiles.faces.some(p=>p.id===faceId&&p.name)||voiceId&&!profiles.voices.some(p=>p.id===voiceId&&p.name))throw Error('Recognition profile changed; refresh and select again');
  if(memory!==null&&(!Number.isSafeInteger(memory?.id)||!name(memory.name)))throw Error('Invalid memory selection');
  return this.transaction(async()=>{
   const d=await this.read();let person=id?d.people.find(p=>p.id===id):null;
   if(id&&!person)throw Error('Person link no longer exists');
   if(d.people.some(p=>p.id!==id&&((faceId&&p.faces.includes(faceId))||(voiceId&&p.voices.includes(voiceId)))))throw Error('Profile already linked to another person; unlink it first');
   if(!person){if(d.people.length>=64)throw Error('Person link limit reached');person={id:crypto.randomUUID(),name:label.trim(),faces:[],voices:[],memory:null};d.people.push(person);}
   person.name=label.trim();if(faceId&&!person.faces.includes(faceId))person.faces.push(faceId);if(voiceId&&!person.voices.includes(voiceId))person.voices.push(voiceId);person.memory=memory;
   d.revision=crypto.randomUUID();await this.write(d);return person;
  });
 }
 remove(id){if(!uuid(id))throw Error('Invalid person');return this.transaction(async()=>{const d=await this.read();d.people=d.people.filter(p=>p.id!==id);d.revision=crypto.randomUUID();await this.write(d);});}
 unlink(kind,id=null){if(!['faces','voices'].includes(kind)||id!==null&&!uuid(id))throw Error('Invalid profile');return this.transaction(async()=>{const d=await this.read();for(const p of d.people)p[kind]=id===null?[]:p[kind].filter(x=>x!==id);d.people=d.people.filter(p=>p.faces.length||p.voices.length);d.revision=crypto.randomUUID();await this.write(d);});}
}
module.exports={PersonRegistry};
