#!/usr/bin/env node
/** Optional synthetic model check. Does not read transcripts, memory, images or device state. */
const fs=require('node:fs/promises'),path=require('node:path');
const {followupMessages}=require('../lib/followup-context');
async function run(){
 const args=process.argv.slice(2),option=(name,fallback)=>{const i=args.indexOf(name);return i>=0?args[i+1]:fallback;};
 const endpoint=option('--url','http://127.0.0.1:11434'),model=option('--model','qwen3.5:9b'),output=option('--output','/tmp/nodie-followup-model-check.json');
 const url=new URL(endpoint);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw Error('Invalid model endpoint');
 const prompt=await fs.readFile(path.join(__dirname,'../SYSTEM-PROMPT.md'),'utf8'),cases=JSON.parse(await fs.readFile(path.join(__dirname,'../tests/fixtures/followup-scenarios.json'),'utf8')),results=[];
 for(const scenario of cases){
  const base=[{role:'system',content:prompt},...scenario.history,{role:'user',content:scenario.current}],replies={};
  for(const mode of ['baseline','questionContext']){
   const messages=mode==='baseline'?base:followupMessages(base,scenario.history),start=performance.now();
   const response=await fetch(new URL('/api/chat',url),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model,messages,think:false,stream:false,keep_alive:'30m',options:{temperature:0,seed:42,num_ctx:8192,num_predict:160}}),signal:AbortSignal.timeout(45000)});
   if(!response.ok)throw Error('Model check failed: HTTP '+response.status);
   const result=await response.json();replies[mode]={text:result.message?.content||'',elapsedMs:Math.round(performance.now()-start)};
  }
  results.push({...scenario,replies});console.log(JSON.stringify({id:scenario.id,...replies}));
 }
 await fs.writeFile(output,JSON.stringify({model,synthetic:true,results},null,2),{mode:0o600});
 console.log('Saved synthetic replies for manual assessment: '+output);
}
run().catch(error=>{console.error(error.message);process.exitCode=1;});
