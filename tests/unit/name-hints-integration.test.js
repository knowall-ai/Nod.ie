const test=require('node:test'),assert=require('node:assert/strict');
const {LocalVoice}=require('../../lib/local-voice');
const config=(key,fallback)=>({LOCAL_STT_URL:'http://127.0.0.1:8100',LOCAL_TTS_URL:'http://tts',OLLAMA_URL:'http://llm',LOCAL_LLM_MODEL:'test-model'}[key]??fallback);
function fixture({url,enabled=true,responses}={}){
 const forms=[],voice=new LocalVoice({config:(key,fallback)=>key==='LOCAL_STT_URL'&&url?url:key==='LOCAL_STT_NAME_HINTS'?enabled:config(key,fallback),nameHints:{get:async()=>['Cerys','Cezzy']},fetchImpl:async(_url,options)=>{forms.push(options.body);return responses?responses(forms.length):Response.json({text:'I met Cerys.'});}});return {voice,forms};
}
test('native hotwords suggestions accompany timings but never replace provider transcript',async()=>{
 const {voice,forms}=fixture();const result=await voice.transcribe(new Uint8Array(200),true);assert.equal(forms[0].get('hotwords'),'Cerys, Cezzy');assert.equal(forms[0].get('prompt'),null);assert.equal(forms[0].get('timestamp_granularities[]'),'word');assert.equal(result.text,'I met Cerys.');assert.deepEqual(result.nameHintStatus,{state:'applied',count:2});
});
test('disabled and non-loopback requests never read or transmit private names',async()=>{
 for(const [options,state] of [[{enabled:false},'disabled'],[{url:'http://192.168.1.35:8100'},'non-local'],[{url:'https://speech.example.test'},'non-local']]){
  const {voice,forms}=fixture(options);voice.nameHints.get=()=>assert.fail('private names should not be read');const result=await voice.transcribe(new Uint8Array(200),false);assert.equal(forms[0].get('hotwords'),null);assert.equal(result.nameHintStatus.state,state);
 }
});
test('unsupported hotwords retry without hints while retaining word timing and cache only that limitation',async()=>{
 const {voice,forms}=fixture({responses:n=>n===1?Response.json({detail:'hotwords unsupported'},{status:422}):Response.json({text:'Cerys'})});
 const result=await voice.transcribe(new Uint8Array(200),true);assert.equal(forms.length,2);assert.equal(forms[1].get('hotwords'),null);assert.equal(forms[1].get('response_format'),'verbose_json');assert.equal(result.nameHintStatus.state,'unsupported');
 await voice.transcribe(new Uint8Array(200),true);assert.equal(forms.length,3);assert.equal(forms[2].get('hotwords'),null);
});
test('independent timing and hint rejections need at most three validation requests',async()=>{
 const {voice,forms}=fixture({responses:n=>n===1?Response.json({detail:'timestamp_granularities[] unsupported'},{status:422}):n===2?Response.json({detail:'hotwords unsupported'},{status:400}):Response.json({text:'Cerys'})});
 await voice.transcribe(new Uint8Array(200),true);assert.equal(forms.length,3);assert.equal(forms[1].get('hotwords'),'Cerys, Cezzy');assert.equal(forms[1].get('response_format'),null);assert.equal(forms[2].get('hotwords'),null);
});
test('provider authentication and unrelated validation errors are never retried',async()=>{
 for(const status of [401,503,422]){const {voice,forms}=fixture({responses:()=>Response.json({detail:'Invalid model'},{status})});await assert.rejects(voice.transcribe(new Uint8Array(200),false));assert.equal(forms.length,1);}
});
test('hinted audio never follows redirects or retries without the privacy guard',async()=>{
 const http=require('node:http');
 for(const status of [307,308]){
  let sourceHits=0,destinationHits=0;
  const destination=http.createServer((_req,res)=>{destinationHits++;res.end('{}');});
  await new Promise(resolve=>destination.listen(0,'127.0.0.1',resolve));
  const source=http.createServer((req,res)=>{sourceHits++;req.resume();res.writeHead(status,{Location:`http://127.0.0.1:${destination.address().port}/capture`});res.end();});
  await new Promise(resolve=>source.listen(0,'127.0.0.1',resolve));
  try{
   const voice=new LocalVoice({config:(key,fallback)=>key==='LOCAL_STT_URL'?`http://127.0.0.1:${source.address().port}`:config(key,fallback),nameHints:{get:async()=>['Cerys']}});
   await assert.rejects(voice.transcribe(new Uint8Array(200),false));
   assert.equal(sourceHits,1);assert.equal(destinationHits,0);
  }finally{source.closeAllConnections();destination.closeAllConnections();await Promise.all([new Promise(r=>source.close(r)),new Promise(r=>destination.close(r))]);}
 }
});
test('name hint preference defaults on and accepts only a boolean settings patch',()=>{
 const schema=require('../../lib/config-schema');
 assert.equal(schema.normalize({}).LOCAL_STT_NAME_HINTS,true);
 assert.equal(schema.normalize({localSttNameHints:false}).LOCAL_STT_NAME_HINTS,false);
 assert.equal(schema.normalize({LOCAL_STT_NAME_HINTS:'false'}).LOCAL_STT_NAME_HINTS,false);
 assert.equal(schema.validateSettingsPatch({LOCAL_STT_NAME_HINTS:false}).LOCAL_STT_NAME_HINTS,false);
 assert.throws(()=>schema.validateSettingsPatch({LOCAL_STT_NAME_HINTS:'false'}));
});
