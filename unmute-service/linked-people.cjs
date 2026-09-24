/** Read-only brief from explicitly linked IDs; never fuzzy-match a biometric label. */
const fs=require('node:fs/promises');
const uuid=s=>typeof s==='string'&&/^[a-f0-9-]{36}$/.test(s);
const valid=args=>args&&Object.keys(args).every(k=>['faces','voices'].includes(k))&&['faces','voices'].every(k=>Array.isArray(args[k])&&args[k].length<=8&&args[k].every(uuid));
const decode=r=>{if(r?.isError)throw Error('Memory unavailable');const text=(r.content||[]).filter(c=>c.type==='text').map(c=>c.text).join('\n');if(text.length>8000000)throw Error('Oversized memory result');const rows=JSON.parse(text);if(!Array.isArray(rows))throw Error('Invalid person result');return rows;};
async function personOptions(connect){const client=await connect();if(!client)throw Error('Memory is not configured');const rows=decode(await client.callTool({name:'search_memories',arguments:{label:'Person',limit:200,depth:0,search_mode:'keyword'}},undefined,{timeout:2500}));return rows.filter(r=>Number.isSafeInteger(r.memory?._id)&&r.memory._id>=0&&typeof r.memory.name==='string').map(r=>({id:r.memory._id,name:r.memory.name.slice(0,160)}));}
async function readRegistry(){try{const file=process.env.NODIE_PERSON_LINKS_FILE||'/app/nodie-events/person-links.json';if((await fs.stat(file)).size>64000)throw Error('Person links exceed limit');const d=JSON.parse(await fs.readFile(file,'utf8'));if(d.version!==1||!Array.isArray(d.people)||d.people.length>64)throw Error('Invalid person links');return d;}catch(e){if(e.code==='ENOENT')return {people:[]};throw e;}}
function createLinkedResolver(connect,load=readRegistry){
 let cached;
 return async args=>{
  if(!valid(args))throw Error('Invalid recognition references');
  const registry=await load();
  const people=registry.people.filter(p=>p.memory&&((p.faces||[]).some(id=>args.faces.includes(id))||(p.voices||[]).some(id=>args.voices.includes(id)))).slice(0,2);
  if(!people.length)return {people:[]};
  const key=JSON.stringify([registry.revision,people.map(p=>p.id)]);
  if(cached?.key===key&&Date.now()<cached.until)return cached.result;
  const client=await connect();if(!client)return {people:[]};const briefs=[];
  for(const p of people){
   if(!Number.isSafeInteger(p.memory.id)||p.memory.id<0||typeof p.memory.name!=='string'||p.memory.name.length>160)continue;
   const rows=decode(await client.callTool({name:'search_memories',arguments:{query:p.memory.name,label:'Person',search_mode:'exact',limit:20,depth:1}},undefined,{timeout:1000}));
   const row=rows.find(r=>r.memory?._id===p.memory.id);if(!row)continue;
   const m=row.memory,brief={personId:p.id,name:String(m.name).slice(0,160),match:'possible-recognition',notes:typeof m.notes==='string'?m.notes.slice(0,600):'',aliases:Array.isArray(m.aliases)?m.aliases.filter(a=>typeof a==='string').slice(0,6).map(a=>a.slice(0,80)):[]};
   brief.connections=(row.connections||[]).slice(0,4).map(c=>({name:String(c.memory?.name||'').slice(0,100),relationship:typeof c.relationship==='string'?c.relationship.slice(0,80):String(c.relationship?.type||c.type||'').slice(0,80)}));
   briefs.push(brief);
  }
  const result={people:briefs};cached={key,result,until:Date.now()+30000};return result;
 };
}
module.exports={createLinkedResolver,personOptions,valid};
