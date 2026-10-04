const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {LocalVoice}=require('../../lib/local-voice'),{ConversationHistory}=require('../../lib/conversation-history');
const config=(key,fallback)=>({LOCAL_STT_URL:'http://stt',LOCAL_TTS_URL:'http://tts',OLLAMA_URL:'http://llm',LOCAL_LLM_MODEL:'test-model'}[key]||fallback);
const timed={text:'Hello both',duration:4,words:[{word:' Hello',start:.2,end:.6,probability:.9},{word:' both',start:2.2,end:2.6,probability:.95}]};
const observed={state:'ready',duration:4,speakers:[{speaker:0,id:'voice-a',name:'Robin'},{speaker:1,id:'voice-b',name:'Taylor'}],segments:[{speaker:0,start:0,end:2},{speaker:1,start:2,end:4}],transcriptAttribution:'unattributed'};
function fixture({enabled=true,transcription=timed,observation=observed,historyStore}={}){
 const forms=[],chats=[],recalls=[],wav=Buffer.alloc(44);wav.write('RIFF');
 const voice=new LocalVoice({config,historyStore,speakerRecognition:{enabled:async()=>enabled,analyse:async()=>observation},fetchImpl:async(url,options)=>{
  if(url.includes('transcriptions')){forms.push(options.body);return Response.json(transcription);}
  if(url.includes('/api/chat')){chats.push(JSON.parse(options.body));return Response.json({message:{content:'Hello there.'}});}
  return new Response(wav);
 }});voice.linkedRecall=async args=>{recalls.push(args);return {people:[{name:'Linked example'}]};};return {voice,forms,chats,recalls};
}
test('local turn requests word timestamps and uses only attributed voices for linked recall',async()=>{
 const {voice,forms,chats,recalls}=fixture();const result=await voice.converse(new Uint8Array(200));
 assert.equal(forms[0].get('response_format'),'verbose_json');assert.deepEqual(forms[0].getAll('timestamp_granularities[]'),['word']);
 assert.deepEqual(result.wordAttribution.words.map(w=>w.profile),['voice-a','voice-b']);assert.deepEqual(recalls,[{faces:[],voices:['voice-a','voice-b']}]);
 assert.ok(chats[0].messages.some(m=>m.content.includes('wordAttribution')));assert.ok(chats[0].messages[0].role==='system');
});
test('missing timing, overlap and transcript mismatch cannot retrieve a voice-linked biography',async()=>{
 for(const options of [{transcription:{text:'Hello both'}},{observation:{...observed,segments:[...observed.segments,{speaker:1,start:0,end:2},{speaker:0,start:2,end:4}]}},{transcription:{...timed,text:'Different words'}}]){
  const {voice,recalls}=fixture(options);const result=await voice.converse(new Uint8Array(200));assert.equal(recalls.length,0);assert.equal(result.reply,'Hello there.');
 }
});
test('disabled recognition uses ordinary transcription without timestamp overhead',async()=>{
 const {voice,forms}=fixture({enabled:false,transcription:{text:'Hello both'},observation:{state:'disabled',speakers:[]}});const result=await voice.converse(new Uint8Array(200));
 assert.equal(forms[0].get('response_format'),null);assert.equal(result.wordAttribution.state,'unavailable');
});
test('explicit format validation failure falls back once and caches that provider limitation',async()=>{
 const voice=new LocalVoice({config}),forms=[];
 voice.fetch=async(url,options)=>{forms.push(options.body);return forms.length===1?Response.json({error:{param:'timestamp_granularities[]',message:'unsupported'}},{status:422}):Response.json({text:'Hello'});};
 assert.equal((await voice.transcribe(new Uint8Array(200),true)).text,'Hello');assert.equal((await voice.transcribe(new Uint8Array(200),true)).text,'Hello');
 assert.equal(forms.length,3);assert.equal(forms[0].get('response_format'),'verbose_json');assert.equal(forms[1].get('response_format'),null);assert.equal(forms[2].get('response_format'),null);
});
test('authentication, service and unrelated validation failures do not retry transcription',async()=>{
 for(const status of [401,503,422]){
  const voice=new LocalVoice({config});let calls=0;voice.fetch=async()=>{calls++;return Response.json({detail:'Invalid model'},{status});};
  await assert.rejects(voice.transcribe(new Uint8Array(200),true));assert.equal(calls,1);
 }
});
test('attributed local words survive restart and remain reference data rather than chat message fields',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'nodie-local-attribution-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const store=new ConversationHistory(path.join(dir,'history.json'));
 const {voice,chats}=fixture({historyStore:store});await voice.converse(new Uint8Array(200));const saved=await new ConversationHistory(store.file).load();
 assert.deepEqual(saved.turns[0].words.map(w=>[w.profile,w.speaker]),[['voice-a','Robin'],['voice-b','Taylor']]);
 await voice.converse(new Uint8Array(200));assert.ok(chats[1].messages.every(m=>!Object.hasOwn(m,'words')));assert.equal((await fs.stat(store.file)).mode&0o777,0o600);
});
