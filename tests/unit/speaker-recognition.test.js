const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { SpeakerStore, SpeakerRecognition, MODEL } = require('../../lib/speaker-recognition');
const vector = i => Array.from({ length: 512 }, (_, n) => n === i ? 1 : 0);
const result = (...vectors) => ({ model: MODEL, duration: 4 * vectors.length, speakers: vectors.map((v, i) => ({ speaker: i, cleanSeconds: 3, embedding: v })), segments: vectors.map((_, i) => ({ start: i * 4, end: (i + 1) * 4, speaker: i })) });
async function fixture(t) { const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'nodie-speakers-')); t.after(() => fs.rm(dir, { recursive: true, force: true })); const store = new SpeakerStore(path.join(dir, 'profiles.json')); return store; }
test('disabled recognition never sends audio, and enabled profiles survive restart without exposing embeddings', async t => {
    const store = await fixture(t); let calls = 0;
    const service = new SpeakerRecognition({ store, fetchImpl: async () => { calls++; return Response.json(result(vector(0))); } });
    assert.equal((await service.analyse(Buffer.alloc(200))).state, 'disabled'); assert.equal(calls, 0);
    await store.configure(true);
    const first = await service.analyse(Buffer.alloc(200)); assert.equal(first.state, 'ready'); assert.ok(first.speakers[0].mayAskName);
    assert.equal(await service.name(first, first.speakers[0].id, 'Ben'), true);
    const next = new SpeakerRecognition({ store: new SpeakerStore(store.file), fetchImpl: service.fetch });
    const second = await next.analyse(Buffer.alloc(200)); assert.equal(second.speakers[0].name, 'Ben'); assert.equal(second.speakers[0].id, first.speakers[0].id);
    assert.equal(JSON.stringify(second).includes('embedding'), false); assert.equal(JSON.stringify(await store.status()).includes('vector'), false);
    assert.equal((await fs.stat(store.file)).mode & 0o777, 0o600);
});
test('clear/disable invalidates in-flight observations and naming; no resurrection', async t => {
    const store = await fixture(t); await store.configure(true); const { epoch } = await store.load();
    const observed = await store.observe(result(vector(0)), epoch);
    await store.forget(); assert.equal((await store.observe(result(vector(0)), epoch)).state, 'disabled');
    assert.equal(await store.nameObserved(observed, observed.speakers[0].id, 'Ben'), false);
    await store.configure(true); assert.equal((await store.observe(result(vector(0)), epoch)).state, 'disabled'); assert.equal((await store.status()).profiles.length, 0);
});
test('multiple speakers are not attributed or named from the whole transcript; repeated questions are throttled', async t => {
    const store = await fixture(t); await store.configure(true); const { epoch } = await store.load();
    const mixed = await store.observe(result(vector(0), vector(1)), epoch); assert.equal(mixed.transcriptAttribution, 'unattributed');
    assert.equal(await store.nameObserved(mixed, mixed.speakers[0].id, 'Ben'), false);
    const again = await store.observe(result(vector(0)), epoch); assert.equal(again.speakers[0].mayAskName, false);
    const duplicate = await store.observe(result(vector(0), vector(0)), epoch); assert.equal(duplicate.speakers[1].uncertain, true);
});
test('ambiguous similarity and insufficient voice stay unidentified; malformed results cannot persist', async t => {
    const store = await fixture(t); await store.configure(true); const { epoch } = await store.load();
    await store.observe(result(vector(0)), epoch);
    const near = vector(0); near[0] = 0.7; near[1] = Math.sqrt(1 - 0.49);
    assert.equal((await store.observe(result(near), epoch)).speakers[0].uncertain, true);
    assert.equal((await store.observe(result(null), epoch)).speakers[0].uncertain, true);
    const bad = result(vector(1)); bad.speakers[0].embedding[0] = NaN;
    await assert.rejects(store.observe(bad, epoch), /Invalid diarisation/);
    assert.equal((await store.status()).profiles.length, 1);
});
test('unavailable service does not reject a conversation, and aborted analysis cannot save a profile', async t => {
    const store = await fixture(t); await store.configure(true);
    const service = new SpeakerRecognition({ store, fetchImpl: async () => { throw new Error('offline'); } });
    assert.equal((await service.analyse(Buffer.alloc(200))).state, 'unavailable');
    await assert.rejects(store.observe(result(vector(0)), (await store.load()).epoch, AbortSignal.abort()));
    assert.equal((await store.status()).profiles.length, 0);
});
test('voice integration supplies named context without vectors and only exposes naming for a sole unknown profile', async () => {
    const { LocalVoice } = require('../../lib/local-voice');
    let chats = 0, named = 0;
    const wav = Buffer.alloc(44); wav.write('RIFF');
    const observation = { state: 'ready', speakers: [{ id: 'current', name: null, mayAskName: true }], transcriptAttribution: 'single-speaker' };
    const voice = new LocalVoice({ config: k => ({ LOCAL_STT_URL: 'http://stt', LOCAL_TTS_URL: 'http://tts', OLLAMA_URL: 'http://llm', LOCAL_LLM_MODEL: 'test' })[k], speakerRecognition: { analyse: async () => observation, name: async (o, id, name) => { assert.equal(o, observation); assert.equal(id, 'current'); assert.equal(name, 'Ben'); named++; return true; } }, fetchImpl: async (url, options) => {
        if (url.includes('transcriptions')) return Response.json({ text: 'My name is Ben.' });
        if (url.includes('/api/chat')) {
            const request = JSON.parse(options.body);
            if (++chats === 1) { assert.ok(request.tools.some(t => t.function.name === 'name_current_speaker')); assert.ok(request.messages.some(m => m.content.includes('fallible matching'))); return Response.json({ message: { tool_calls: [{ function: { name: 'name_current_speaker', arguments: { id: 'current', name: 'Ben' } } }] } }); }
            assert.deepEqual(JSON.parse(request.messages.at(-1).content), { applied: false,status:'pending' }); return Response.json({ message: { content: 'Nice to meet you, Ben.' } });
        }
        return new Response(wav);
    } });
    voice.proposeSpeakerName=async(o,text)=>{assert.equal(o,observation);assert.equal(text,'My name is Ben.');return {status:'pending'};};
    const reply = await voice.converse(new Uint8Array(200)); assert.equal(named, 0); assert.equal(reply.reply, 'Nice to meet you, Ben.'); assert.equal(reply.speakers.state, 'ready');
});
test('merging retains both voices under the chosen person and invalidates old observations', async t => {
 const store=await fixture(t);await store.configure(true);const {epoch}=await store.load();
 const observed=await store.observe(result(vector(0),vector(1)),epoch);
 const [a,b]=observed.speakers;await store.edit(b.id,'Ben');
 await store.merge(a.id,b.id);
 const status=await store.status();assert.equal(status.profiles.length,1);assert.equal(status.profiles[0].voiceSamples,2);assert.equal(status.profiles[0].name,'Ben');
 const saved=await store.load();
 for(const v of [vector(0),vector(1)])assert.equal((await store.observe(result(v),saved.epoch)).speakers[0].id,b.id);
 assert.equal((await store.observe(result(vector(2)),epoch)).state,'disabled');
 await assert.rejects(store.merge(b.id,b.id));await assert.rejects(store.merge(a.id,b.id));
 await store.edit(b.id,null);assert.equal((await store.status()).profiles.length,0);
});
test('merge refuses capacity overflow without partially removing a person',async t=>{
 const store=await fixture(t);await store.configure(true);let epoch=(await store.load()).epoch;
 const first=await store.observe(result(...Array.from({length:7},(_,i)=>vector(i))),epoch);
 const second=await store.observe(result(vector(7),vector(8)),epoch);
 const target=first.speakers[0].id;
 for(const s of [...first.speakers.slice(1),...second.speakers.slice(0,1)])await store.merge(s.id,target);
 await assert.rejects(store.merge(second.speakers[1].id,target),/eight/);
 const status=await store.status();assert.equal(status.profiles.length,2);assert.equal(status.profiles.find(p=>p.id===target).voiceSamples,8);
});
test('background matching never enrols unfamiliar voices',async t=>{
 const store=await fixture(t);await store.configure(true);
 const service=new SpeakerRecognition({store,fetchImpl:async()=>Response.json(result(vector(0)))});
 const unknown=await service.analyse(Buffer.alloc(200),undefined,{enrol:false});
 assert.equal(unknown.speakers[0].uncertain,true);assert.equal((await store.status()).profiles.length,0);
 const enrolled=await service.analyse(Buffer.alloc(200));await service.name(enrolled,enrolled.speakers[0].id,'Example');
 assert.equal((await service.analyse(Buffer.alloc(200),undefined,{enrol:false})).speakers[0].name,'Example');
});

test('unchanged background matches and status reads do not rewrite embeddings or consume naming prompts',async t=>{
 const store=await fixture(t);await store.configure(true);const {epoch}=await store.load();
 await store.observe(result(vector(0)),epoch);
 const d=await store.read();d.profiles[0].lastAsked=0;await store.write(d);
 let writes=0;const write=store.write.bind(store);store.write=async data=>{writes++;return write(data)};
 for(let i=0;i<10;i++){await store.load();await store.status();await store.observe(result(vector(0)),epoch,undefined,{enrol:false});}
 assert.equal(writes,0);assert.equal((await store.read()).profiles[0].lastAsked,0);
 assert.equal((await store.observe(result(vector(0)),epoch)).speakers[0].mayAskName,true);
 assert.equal(writes,1);
});
