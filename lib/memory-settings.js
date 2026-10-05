const crypto=require('node:crypto');
const {connectReverie}=require('./reverie-connection');
const KEY='reverieConnection';
function validateConnection(input){
 if(!input||Object.getPrototypeOf(input)!==Object.prototype||Object.keys(input).some(k=>!['uri','database','username','password'].includes(k)))throw Error('Invalid memory connection');
 const {uri,database,username,password=''}=input;
 if(typeof uri!=='string'||uri.length>512)throw Error('Enter a valid Neo4j address');
 let url;try{url=new URL(uri);}catch{throw Error('Enter a valid Neo4j address');}
 if(!['bolt:','bolt+s:','neo4j:','neo4j+s:'].includes(url.protocol)||!url.hostname||url.username||url.password||url.search||url.hash||!['','/'].includes(url.pathname))throw Error('Use a Neo4j or Bolt URI without credentials or a path');
 if(typeof database!=='string'||!database.trim()||database.length>128||/[\p{Cc}\p{Cf}]/u.test(database))throw Error('Enter a database name');
 if(typeof username!=='string'||!username.trim()||username.length>128||/[\p{Cc}\p{Cf}]/u.test(username))throw Error('Enter a username');
 if(typeof password!=='string'||password.length>4096||password.includes('\0'))throw Error('Invalid password');
 return {uri:url.href.replace(/\/$/,''),database:database.trim(),username:username.trim(),password};
}
function targetKey(value){return value?crypto.createHash('sha256').update(JSON.stringify([value.uri,value.database,value.username])).digest('hex'):'legacy';}
class MemorySettings{
 constructor({store,safeStorage,connect=connectReverie}){Object.assign(this,{store,safeStorage,connect});}
 secure(){return this.safeStorage.isEncryptionAvailable()&&this.safeStorage.getSelectedStorageBackend?.()!=='basic_text';}
 status(){const saved=this.store.get(KEY);return {mode:saved?'configured':'legacy',uri:saved?.uri||'',database:saved?.database||'neo4j',username:saved?.username||'',hasPassword:Boolean(saved?.encryptedPassword),secureStorage:this.secure()};}
 prepare(input){
  const value=validateConnection(input),saved=this.store.get(KEY);
  if(!value.password){
   if(!saved||targetKey(saved)!==targetKey(value))throw Error('Enter the password for this connection');
   if(!this.secure())throw Error('Secure password storage is unavailable');
   try{value.password=this.safeStorage.decryptString(Buffer.from(saved.encryptedPassword,'base64'));}catch{throw Error('Saved password cannot be unlocked; enter it again');}
  }
  if(!value.password)throw Error('Enter the password for this connection');
  return value;
 }
 save(input){
  if(!this.secure())throw Error('Secure password storage is unavailable; configure an OS credential store first');
  const value=this.prepare(input);let encryptedPassword;
  try{encryptedPassword=this.safeStorage.encryptString(value.password).toString('base64');}catch{throw Error('Password could not be stored securely');}
  const {password,...publicFields}=value;this.store.set(KEY,{...publicFields,encryptedPassword});return this.status();
 }
 reset(){this.store.delete(KEY);return this.status();}
 credentials(){
  if(!this.store.get(KEY))return null;
  const value=this.prepare({...this.statusFields(),password:''});
  return {NEO4J_URI:value.uri,NEO4J_DATABASE:value.database,NEO4J_USERNAME:value.username,NEO4J_PASSWORD:value.password};
 }
 statusFields(){const {uri,database,username}=this.store.get(KEY);return {uri,database,username};}
 async test(input){
  if(this.testing)throw Error('A connection test is already running');
  const value=this.prepare(input);let client;this.testing=true;
  try{
   client=await this.connect({NEO4J_URI:value.uri,NEO4J_DATABASE:value.database,NEO4J_USERNAME:value.username,NEO4J_PASSWORD:value.password});
   const result=await client.callTool({name:'search_memories',arguments:{query:'Nodie connection test',limit:1,depth:0,search_mode:'keyword'}},undefined,{timeout:5000});
   if(result?.isError)throw Error('Unavailable');
   return {state:'connected',message:'Connected. Read access verified; no memories changed.'};
  }catch{throw Error('Connection test failed. Check the address, database, credentials and network access.');}
  finally{try{await client?.close().catch(()=>{});}finally{this.testing=false;}}
 }
}
module.exports={MemorySettings,validateConnection,targetKey};
