const test = require('node:test');
const assert = require('node:assert/strict');
const { LocalVoice } = require('../../lib/local-voice');
const values = { LOCAL_STT_URL: 'http://stt', LOCAL_TTS_URL: 'http://tts', OLLAMA_URL: 'http://llm', LOCAL_LLM_MODEL: 'test-model' };
const config = (key, fallback) => values[key] || fallback;
test('local turn supplies clock context, bounds model work and validates WAV output', async () => {
    const requests = [];
    const wav = Buffer.alloc(44); wav.write('RIFF');
    const voice = new LocalVoice({ config, fetchImpl: async (url, options) => {
        requests.push({ url, options });
        if (url.includes('transcriptions')) return Response.json({ text: 'What day is it?' });
        if (url.includes('/api/chat')) return Response.json({ message: { content: 'It is Thursday.' } });
        return new Response(wav);
    } });
    const result = await voice.converse(new Uint8Array(200));
    assert.equal(result.reply, 'It is Thursday.');
    const chat = JSON.parse(requests[1].options.body);
    assert.match(chat.messages[0].content, /Current local date and time:/);
    assert.deepEqual(chat.options, { num_predict: 90, num_ctx: 8192 });
    assert.equal(voice.busy, false);
    voice.fetch = async url => url.includes('transcriptions') ? Response.json({ text: 'Hi' }) : url.includes('/api/chat') ? Response.json({ message: { content: 'Hello' } }) : new Response('invalid audio');
    await assert.rejects(voice.converse(new Uint8Array(200)), /WAV/);
    assert.equal(voice.history.length, 2);
});
test('cancelling an in-flight turn aborts the service request and releases the busy guard', async () => {
    const voice = new LocalVoice({ config, fetchImpl: (_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true })) });
    const pending = voice.converse(new Uint8Array(200));
    await assert.rejects(voice.converse(new Uint8Array(200)), /already in progress/);
    voice.cancel(); await assert.rejects(pending, { name: 'AbortError' });
    assert.equal(voice.busy, false);
});
