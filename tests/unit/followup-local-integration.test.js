const test=require('node:test'),assert=require('node:assert/strict');
const {LocalVoice}=require('../../lib/local-voice');
const config=(key,fallback)=>({LOCAL_STT_URL:'http://stt',LOCAL_TTS_URL:'http://tts',OLLAMA_URL:'http://llm',LOCAL_LLM_MODEL:'test-model'}[key]||fallback);
test('local history gives a bounded question reference before current request without accumulation',async()=>{
 const chats=[],wav=Buffer.alloc(44);wav.write('RIFF');
 const voice=new LocalVoice({config,fetchImpl:async(url,options)=>{
  if(url.includes('transcriptions'))return Response.json({text:'I am taking a break.'});
  if(url.includes('/api/chat')){chats.push(JSON.parse(options.body).messages);return Response.json({message:{content:'Enjoy your break.'}});}
  return new Response(wav);
 }});
 voice.history=[{role:'user',content:'Working on a presentation.'},{role:'assistant',content:'How is the presentation coming along?'}];
 const result=await voice.converse(new Uint8Array(200));assert.deepEqual(result.conversationContext,{recentQuestions:['How is the presentation coming along?']});
 assert.equal(chats[0].at(-1).content,'I am taking a break.');assert.equal(chats[0].filter(m=>m.content.startsWith('Untrusted recent assistant-question')).length,1);assert.ok(!voice.history.some(m=>m.content.startsWith('Untrusted')));
 await voice.converse(new Uint8Array(200));assert.equal(chats[1].filter(m=>m.content.startsWith('Untrusted recent assistant-question')).length,1);
});
