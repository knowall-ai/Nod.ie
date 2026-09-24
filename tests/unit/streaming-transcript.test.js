const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const Transcript = require('../../modules/streaming-transcript');
const { ConversationHistory } = require('../../lib/conversation-history');
async function fixture(t, options) {
 const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'nodie-transcript-'));
 t.after(() => fs.rm(dir, {recursive:true,force:true}));
 const store = new ConversationHistory(path.join(dir,'local.json'));
 const transcript = new Transcript({transcriptSession:()=>store.load(),saveTranscript:(epoch,turn)=>store.upsert(epoch,turn)},()=>assert.fail('save failed'),options);
 await transcript.start(); t.after(()=>transcript.finish()); return {store,transcript};
}
test('Unmute spoken text and user words survive restart; internal generation is excluded',async t=>{
 const {store,transcript:s}=await fixture(t);
 s.event({type:'conversation.item.input_audio_transcription.delta',delta:'Hello'});
 s.event({type:'conversation.item.input_audio_transcription.delta',delta:' Nodie'});
 s.event({type:'response.created'});
 s.event({type:'unmute.response.text.delta.ready',delta:'private thought'});
 s.event({type:'response.text.delta',delta:'Hello'});
 await s.save();
 s.event({type:'response.text.delta',delta:' Ben.'});
 s.event({type:'response.audio.done'});await s.queue;
 assert.deepEqual((await new ConversationHistory(store.file).load()).turns.map(x=>[x.role,x.content]),[['user','Hello Nodie'],['assistant','Hello Ben.']]);
});
test('clear rejects checkpoints from old sessions and allows new conversation',async t=>{
 const {store,transcript:s}=await fixture(t);
 s.event({type:'response.text.delta',delta:'old'});
 const cleared=await store.clear();await s.finish();
 assert.deepEqual((await store.load()).turns,[]);
 s.reset(cleared);s.event({type:'conversation.item.input_audio_transcription.delta',delta:'new'});await s.finish();
 assert.equal((await store.load()).turns[0].content,'new');
});
test('bounded updates are idempotent, private, and reject invalid roles',async t=>{
 const {store}=await fixture(t);const {epoch}=await store.load();
 for(let i=0;i<20;i++)await store.upsert(epoch,{id:'turn-'+i,role:'user',content:'\u0001'.repeat(2000)});
 const data=await store.load();assert.ok(data.turns.length<=12);assert.ok((await fs.stat(store.file)).size<=60000);
 assert.equal((await fs.stat(store.file)).mode&0o777,0o600);
 assert.throws(()=>store.upsert(epoch,{id:'bad',role:'system',content:'test'}));
});
test('browser transcript routes require same origin and clear works in Unmute mode',async t=>{
 const {store}=await fixture(t);
 const server=require('../../lib/web-server').createServer({config:{VOICE_MODE:'unmute'},historyStore:store});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const base=`http://127.0.0.1:${server.address().port}`;
 assert.equal((await fetch(base+'/transcript/session',{method:'POST'})).status,403);
 const post=(route,body)=>fetch(base+route,{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:body&&JSON.stringify(body)});
 const {epoch}=await (await post('/transcript/session')).json();
 assert.equal((await post('/transcript/save',{epoch,turn:{id:'test',role:'assistant',content:'Hello.'}})).status,200);
 assert.equal((await store.load()).turns.length,1);
 assert.equal((await post('/transcript/save',{epoch,turn:{id:'bad',role:'system',content:'not allowed'}})).status,400);
 assert.equal((await post('/transcript/clear')).status,200);
 assert.deepEqual((await store.load()).turns,[]);
});

test('delta chunks preserve word boundaries, punctuation and whitespace',async t=>{
 const {store,transcript:s}=await fixture(t);
 for(const delta of ['  ','Hel','lo',',',' ','world','!']) s.event({type:'response.text.delta',delta});
 await s.finish();assert.equal((await store.load()).turns[0].content,'Hello, world!');
});
test('unknown transcript fields are rejected at store and HTTP boundaries',async t=>{
 const {store}=await fixture(t);const {epoch}=await store.load();const turn={id:'test',role:'user',content:'Hello'};
 assert.throws(()=>store.upsert(epoch,{...turn,extra:true}),/Invalid transcript/);
 const server=require('../../lib/web-server').createServer({config:{VOICE_MODE:'unmute'},historyStore:store});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 const base=`http://127.0.0.1:${server.address().port}`;
 for(const body of [{epoch,turn,extra:true},{epoch,turn:{...turn,extra:true}},null,[]]) {
  const response=await fetch(base+'/transcript/save',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify(body)});
  assert.equal(response.status,400);
 }
 assert.deepEqual((await store.load()).turns,[]);
});

test('Unmute word events match upstream STT and spoken TTS spacing',async t=>{
 const {store,transcript:s}=await fixture(t,{wordDeltas:true});
 for(const delta of ['Hello','Nodie.']) s.event({type:'conversation.item.input_audio_transcription.delta',delta});
 s.event({type:'response.created'});
 for(const delta of ['Hello',' Ben.',' How','are','you?']) s.event({type:'response.text.delta',delta});
 await s.finish();
 assert.deepEqual((await store.load()).turns.map(x=>x.content),['Hello Nodie.','Hello Ben. How are you?']);
});
