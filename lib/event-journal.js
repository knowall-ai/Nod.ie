/** Text-only observations, separate from conversational and identity memory. */
const fs=require('node:fs/promises');const crypto=require('node:crypto');const {ConversationHistory}=require('./conversation-history');
const sources=['vision','face','voice'];
const kinds=['appeared','out-of-view','observed','recognised','name-confirmed'];
const clean=s=>typeof s==='string' && s.length>0 && s.length<=200 && !/[\x00-\x1f\x7f]/.test(s);
class EventJournal extends ConversationHistory {
 constructor(file,{now=()=>Date.now(),timezone=process.env.NODIE_TIMEZONE||Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC'}={}){super(file);new Intl.DateTimeFormat('en',{timeZone:timezone});this.now=now;this.timezone=timezone;}
 empty(){return {version:1,timezone:this.timezone,epoch:crypto.randomUUID(),retentionDays:30,enabled:true,events:[]};}
 async read(){let d;this.missing=false;try{if((await fs.stat(this.file)).size>3000000)throw Error('Journal exceeds limit');d=JSON.parse(await fs.readFile(this.file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;this.missing=true;return this.empty();}
  if(d.version!==1 || typeof d.epoch!=='string' || ![7,30,0].includes(d.retentionDays) || !Array.isArray(d.events) || d.events.length>6000 || d.events.some(e=>!sources.includes(e.source)||!kinds.includes(e.kind)||!clean(e.subject)||!Number.isFinite(Date.parse(e.at))))throw Error('Invalid event journal');if(d.enabled===undefined)d.enabled=true;return d;}
 prune(d){d.events=d.events.filter(e=>!d.retentionDays || Date.parse(e.at)>=this.now()-d.retentionDays*86400000).slice(-6000);return d;}
 load(){return this.transaction(async()=>{const d=await this.read(),count=d.events.length;this.prune(d);if(this.missing||count!==d.events.length||d.timezone!==this.timezone){d.timezone=this.timezone;await this.write(d);}return d;});}
 append({source,kind,subject,uncertain=true,at=this.now()},epoch){if(!sources.includes(source)||!kinds.includes(kind)||!clean(subject)||typeof uncertain!=='boolean'||!Number.isFinite(at)||at>this.now()||at<this.now()-86400000)throw Error('Invalid event');return this.transaction(async()=>{const d=this.prune(await this.read());if(epoch && epoch!==d.epoch)return 'stale';if(!d.enabled)return 'disabled';const last=d.events.findLast(e=>e.source===source&&e.kind===kind&&e.subject===subject);if(last && this.now()-Date.parse(last.at)<(source==='vision'||kind==='name-confirmed'?60000:1800000))return 'duplicate';d.events.push({id:crypto.randomUUID(),at:new Date(at).toISOString(),source,kind,subject,uncertain});this.prune(d);await this.write(d);this.onEvent?.(d.events.at(-1));return 'saved';});}
 async reference(text){
  if(!/\b(journal|events|what happened|who (?:came|visited)|what (?:have you|did you) (?:see|hear|notice)|(?:see|seen|hear|heard|happen|happened|recognise|recognize).*(?:today|yesterday|earlier|last week))\b/i.test(text))return null;
  if(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december|\d+(?:st|nd|rd|th)|\d+ days? ago)\b/i.test(text))return {status:'unsupported-date',message:'Ask which date in YYYY-MM-DD form; no events supplied.'};
  const now=this.now(),day=new Date(now-(/yesterday/i.test(text)?86400000:0));const key=date=>new Intl.DateTimeFormat('en-CA',{timeZone:this.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
  const through=text.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0]||key(day),from=/last week/i.test(text)?key(new Date(Date.parse(through+'T12:00:00Z')-6*86400000)):through;
  try{const data=await this.load(),events=data.events.filter(e=>{const date=key(new Date(e.at));return date>=from&&date<=through;});return {status:'ok',from,through,timezone:this.timezone,total:events.length,truncated:events.length>60,events:events.slice(-60)};}catch{return {status:'unavailable'};}
 }
 configure(days){if(![7,30,0].includes(days))throw Error('Invalid retention');return this.transaction(async()=>{const d=await this.read();d.retentionDays=days;await this.write(this.prune(d));});}
 enabled(value){if(typeof value!=='boolean')throw Error('Invalid journal setting');return this.transaction(async()=>{const d=await this.read();d.enabled=value;d.epoch=crypto.randomUUID();await this.write(d);});}
 clear(){return this.transaction(async()=>{let old;try{old=await this.read();}catch{}const d=this.empty();d.retentionDays=old?.retentionDays??30;d.enabled=old?.enabled??true;await this.write(d);return d;});}
}
/** Missing detections are not departures: require repeated successful observations. */
class PresenceEvents {
 constructor(journal,{now=()=>Date.now()}={}){this.journal=journal;this.now=now;this.reset();}
 reset(){this.present=new Map();this.candidates=new Map();this.generation=(this.generation||0)+1;}
 async observe(subjects,epoch){const generation=this.generation,now=this.now(),seen=new Set(subjects);if(seen.size>12 || [...seen].some(s=>!clean(s)))throw Error('Invalid observations');
  for(const subject of seen){let p=this.present.get(subject);if(p){p.misses=0;continue;}const c=this.candidates.get(subject)||{hits:0,at:now};c.hits++;this.candidates.set(subject,c);if(c.hits>=2&&now-c.at>=5000){const saved=await this.journal.append({source:'vision',kind:'appeared',subject,uncertain:true,at:c.at},epoch);if(saved==='stale'||saved==='disabled'){this.reset();return;}if(generation!==this.generation)return;this.present.set(subject,{misses:0});this.candidates.delete(subject);}}
  for(const subject of this.candidates.keys())if(!seen.has(subject))this.candidates.delete(subject);
  for(const [subject,p] of this.present){if(seen.has(subject))continue;if(!p.misses)p.absentAt=now;p.misses++;if(p.misses>=3&&now-p.absentAt>=30000){const saved=await this.journal.append({source:'vision',kind:'out-of-view',subject,uncertain:true,at:p.absentAt},epoch);if(saved==='stale'||saved==='disabled'){this.reset();return;}if(generation!==this.generation)return;this.present.delete(subject);}}
 }
}
module.exports={EventJournal,PresenceEvents};
