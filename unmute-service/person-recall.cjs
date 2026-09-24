/** Resolve transcript words against a bounded private index; never learn fuzzy aliases. */
const normalize=s=>s.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const phonetic=s=>normalize(s).replace(/ph/g,'f').replace(/(?:ie|ee|y)$/,'i').replace(/(.)\1+/g,'$1');
function candidates(text,rows){
 const query=' '+normalize(text)+' ',words=normalize(text).split(' ');const found=[];
 const common=new Set(['will','may','mark','bill','hope','joy','grant','rose','dawn']);
 for(const row of rows){const m=row.memory||{},name=m.name;if(typeof name!=='string')continue;
  const aliases=[name,name.split(' ')[0],m.nickname,...(Array.isArray(m.aliases)?m.aliases:[])].filter(a=>typeof a==='string'&&normalize(a).length>=3);
  let match=null;
  for(const alias of aliases){const a=normalize(alias);if(query.includes(' '+a+' ')){match=common.has(a)||(a===normalize(name.split(' ')[0])&&a!==normalize(name))?'possible':'exact';if(match==='exact')break;}
   if(!a.includes(' ')&&a.length>=4&&words.some(w=>w.length>=4&&phonetic(w)===phonetic(a)))match='possible';
  }
  if(match)found.push({name,match});
 }
 if(found.filter(p=>p.match==='exact').length>1)for(const person of found)person.match='possible';
 return found.sort((a,b)=>(a.match==='exact'?-1:1)-(b.match==='exact'?-1:1)).slice(0,2);
}
const clean=memory=>Object.fromEntries(Object.entries(memory||{}).filter(([k])=>!['embedding','name_embedding','embedding_model','embedded_at'].includes(k)));
function createResolver(connect){
 let rows,expires=0;
 const decode=r=>{if(r.isError)throw Error('Memory unavailable');const text=r.content.filter(c=>c.type==='text').map(c=>c.text).join('\n');if(text.length>8000000)throw Error('Oversized memory result');return JSON.parse(text);};
 return async text=>{
  const deadline=Date.now()+7500;const client=await connect();
  const budget=()=>{const left=deadline-Date.now();if(left<20)throw Error('Recall deadline');return Math.min(2500,left);};
  if(!rows||Date.now()>=expires){rows=decode(await client.callTool({name:'search_memories',arguments:{label:'Person',limit:200,depth:0,search_mode:'keyword'}},undefined,{timeout:budget()}));if(!Array.isArray(rows))throw Error('Invalid person index');rows=rows.map(r=>({memory:{name:r.memory?.name,nickname:r.memory?.nickname,aliases:r.memory?.aliases}}));expires=Date.now()+30000;}
  const matches=candidates(text,rows),people=[];
  for(const candidate of matches){const memories=decode(await client.callTool({name:'search_memories',arguments:{query:candidate.name,label:'Person',search_mode:'exact',limit:2,depth:1}},undefined,{timeout:budget()}));const cleaned=memories.map(r=>({...r,memory:clean(r.memory),connections:r.connections?.slice(0,8).map(c=>({...c,memory:clean(c.memory)}))}));
   const person={...candidate,memories:cleaned};while(JSON.stringify([...people,person]).length>14000&&person.memories.some(m=>m.connections?.length)){for(const m of person.memories)m.connections?.pop();person.truncated=true;}
   if(JSON.stringify([...people,person]).length<=14000)people.push(person);else people.push({...candidate,memories:[{memory:{name:candidate.name}}],truncated:true});}
  return {status:'ok',people,indexTruncated:rows.length===200};
 };
}
module.exports={candidates,createResolver};
