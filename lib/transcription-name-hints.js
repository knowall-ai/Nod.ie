/** Lexical hints only. No inference, fuzzy aliases, identity linking or writes. */
function boundedNames(values){
 const names=[],seen=new Set();let length=0;
 for(const value of values){
  if(typeof value!=='string'||value.length>80||!value.trim()||!/^\p{L}[\p{L}\p{M}\p{N} .’'\-\u200c\u200d]*$/u.test(value)||value.trim().split(/\s+/u).length>6)continue;
  const name=value.normalize('NFC').trim().replace(/ +/g,' '),key=name.toLowerCase(),next=length+name.length+(names.length?2:0);
  if(seen.has(key)||next>300)continue;
  seen.add(key);names.push(name);length=next;if(names.length===16)break;
 }
 return names;
}
class TranscriptionNameHints{
 constructor({profiles=async()=>[],memory=()=>null,now=()=>Date.now(),budgetMs=100}={}){Object.assign(this,{profiles,memory,now,budgetMs});this.cached=[];this.expires=0;}
 refresh(){
  const client=this.memory();if(!client||this.refreshing)return this.refreshing;
  this.refreshing=Promise.resolve().then(async()=>{
   const response=await client.callTool({name:'search_memories',arguments:{label:'Person',limit:32,depth:0,search_mode:'keyword'}},undefined,{timeout:500});
   if(response?.isError)throw Error('Name index unavailable');
   const text=(response.content||[]).filter(c=>c.type==='text').map(c=>c.text).join('\n');if(text.length>256000)throw Error('Name index too large');
   const rows=JSON.parse(text);if(!Array.isArray(rows))throw Error('Invalid name index');
   this.cached=rows.slice(0,32).filter(r=>Number.isSafeInteger(r.memory?._id)&&r.memory._id>=0).flatMap(({memory:m})=>[m.name,m.nickname,...(Array.isArray(m.aliases)?m.aliases.slice(0,6):[])]).filter(n=>boundedNames([n]).length);this.expires=this.now()+30000;
  }).catch(()=>{this.cached=[];this.expires=this.now()+5000;}).finally(()=>{this.refreshing=null;});
  return this.refreshing;
 }
 async get(signal){
  signal?.throwIfAborted();let timer,profileNames=[];
  const operation=Promise.resolve().then(async()=>{
   const profiles=await this.profiles();profileNames=(Array.isArray(profiles)?profiles:[]).slice(0,8);if(this.now()>=this.expires)await this.refresh();
   return boundedNames([...profileNames,...(this.now()<this.expires?this.cached:[])]);
  });
  const names=await Promise.race([operation.catch(()=>[]),new Promise(resolve=>{timer=setTimeout(()=>resolve(boundedNames(profileNames)),this.budgetMs);})]);clearTimeout(timer);signal?.throwIfAborted();return names;
 }
}
module.exports={boundedNames,TranscriptionNameHints};
