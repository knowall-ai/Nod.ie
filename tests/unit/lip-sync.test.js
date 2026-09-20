const test = require('node:test');
const assert = require('node:assert/strict');
const { renderSpeech, VIDEO_ONLY_HEADER, VIDEO_ONLY_VALUE } = require('../../lib/lip-sync');
const { LocalVoice } = require('../../lib/local-voice');
const video = Buffer.alloc(16); video.write('ftyp', 4);
test('neural client validates video type and bounds streamed responses', async () => {
    const result = await renderSpeech(new Uint8Array(44), { url: 'http://localhost:8768', fetchImpl: async (url, options) => {
        assert.equal(url, 'http://localhost:8768/render'); assert.equal(options.headers['Content-Type'], 'audio/wav');
        return new Response(video, { headers: { 'Content-Type': 'video/mp4' } });
    } });
    assert.deepEqual(Buffer.from(result), video);
    await assert.rejects(renderSpeech(new Uint8Array(44), { url: 'http://localhost', fetchImpl: async () => new Response('bad', { headers: { 'Content-Type': 'video/mp4' } }) }), /Invalid lip-sync/);
    let cancelled = false;
    await assert.rejects(renderSpeech(new Uint8Array(44), { url: 'http://localhost', fetchImpl: async () => new Response(new ReadableStream({
        start(controller) { controller.enqueue(new Uint8Array(21 * 1024 * 1024)); }, cancel() { cancelled = true; }
    }), { headers: { 'Content-Type': 'video/mp4' } }) }), /exceeds limit/);
    assert.equal(cancelled, true);
});
test('neural failure keeps speech available, successful video is returned, disabled avatars skip GPU work', async () => {
    const values = { LOCAL_STT_URL: 'http://stt', LOCAL_TTS_URL: 'http://tts', OLLAMA_URL: 'http://llm', LOCAL_LIP_SYNC_URL: 'http://lips', LOCAL_LLM_MODEL: 'test' };
    let enabled = true, fail = true, renders = 0;
    const wav = Buffer.alloc(44); wav.write('RIFF');
    const voice = new LocalVoice({ config: key => values[key], avatarEnabled: () => enabled, fetchImpl: async url => {
        if (url.endsWith('/render')) { renders++; return fail ? new Response('', { status: 503 }) : new Response(video, { headers: { 'Content-Type': 'video/mp4' } }); }
        if (url.includes('transcriptions')) return Response.json({ text: 'Hi' });
        if (url.includes('/api/chat')) return Response.json({ message: { content: 'Hello' } });
        return new Response(wav);
    } });
    let result = await voice.converse(new Uint8Array(100));
    assert.equal(result.lipSync, 'unavailable'); assert.equal(result.video, null); assert.equal(result.audio.length, 44);
    fail = false; result = await voice.converse(new Uint8Array(100));
    assert.equal(result.lipSync, 'generated'); assert.deepEqual(Buffer.from(result.video), video);
    enabled = false; result = await voice.converse(new Uint8Array(100));
    assert.equal(result.lipSync, 'disabled'); assert.equal(renders, 2);
});
test('cancelling neural rendering does not return a stale audio fallback or save the turn', async () => {
    const values = { LOCAL_STT_URL: 'http://stt', LOCAL_TTS_URL: 'http://tts', OLLAMA_URL: 'http://llm', LOCAL_LIP_SYNC_URL: 'http://lips' };
    const wav = Buffer.alloc(44); wav.write('RIFF'); let rendering;
    const started = new Promise(resolve => { rendering = resolve; });
    const voice = new LocalVoice({ config: key => values[key], fetchImpl: async (url, options) => {
        if (url.endsWith('/render')) { rendering(); return new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true })); }
        if (url.includes('transcriptions')) return Response.json({ text: 'Hi' });
        if (url.includes('/api/chat')) return Response.json({ message: { content: 'Hello' } });
        return new Response(wav);
    } });
    const pending = voice.converse(new Uint8Array(100)); await started; voice.cancel();
    await assert.rejects(pending, { code: 'cancelled' }); assert.equal(voice.history.length, 0); assert.equal(voice.busy, false);
});

test('only separately scheduled streaming speech requests video-only encoding',async()=>{
 for(const videoOnly of [false,true]) {
  await renderSpeech(new Uint8Array(44),{url:'http://localhost',videoOnly,fetchImpl:async(_url,options)=>{
   assert.equal(options.headers['X-Nodie-Video-Only'],videoOnly?'1':undefined);
   return new Response(video,{headers:{'Content-Type':'video/mp4'}});
  }});
 }
});

test('invalid options fail before contacting the neural service', async () => {
 let calls=0;const options={url:'http://localhost',fetchImpl:async()=>{calls++;}};
 for(const extra of [{videoOnly:'true'},{unexpected:true},{videoOnly:1}]) await assert.rejects(renderSpeech(new Uint8Array(44),{...options,...extra}),/Invalid/);
 assert.equal(calls,0);
});
