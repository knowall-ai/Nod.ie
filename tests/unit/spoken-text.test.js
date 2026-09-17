const test = require('node:test');
const assert = require('node:assert/strict');
const { spokenText } = require('../../lib/spoken-text');
test('spoken replies omit emoji sequences without damaging words, numbers or currency', () => {
    assert.equal(spokenText('Hello! 😊'), 'Hello!');
    assert.equal(spokenText('Yes 👍🏽, that works 👩‍💻.'), 'Yes, that works.');
    assert.equal(spokenText('hello😊world'), 'hello world');
    assert.equal(spokenText('UK 🇬🇧; item 1️⃣.'), 'UK; item.');
    assert.equal(spokenText('₿0.001, £5, €6, $7; 3.14 × 2 = 6.28.'), '₿0.001, £5, €6, $7; 3.14 × 2 = 6.28.');
    assert.equal(spokenText('😊😅'), '');
});
test('actual voice payload and saved history exclude emoji names and symbols', async () => {
    const { LocalVoice } = require('../../lib/local-voice'); const wav = Buffer.alloc(44); wav.write('RIFF'); let speech;
    const voice = new LocalVoice({ config: k => ({ LOCAL_STT_URL: 'http://stt', LOCAL_TTS_URL: 'http://tts', OLLAMA_URL: 'http://llm', LOCAL_LLM_MODEL: 'test' })[k], fetchImpl: async (url, options) => {
        if (url.includes('transcriptions')) return Response.json({ text: 'Hello' });
        if (url.includes('/api/chat')) return Response.json({ message: { tool_calls: [{ function: { name: 'respond_to_user', arguments: { reply: 'Good to hear from you! 😊' } } }] } });
        speech = JSON.parse(options.body).text; return new Response(wav);
    } });
    assert.equal((await voice.converse(new Uint8Array(200))).reply, 'Good to hear from you!');
    assert.equal(speech, 'Good to hear from you!'); assert.equal(voice.history.at(-1).content, speech);
});
