const test = require('node:test');
const assert = require('node:assert/strict');
const { nodeTool } = require('../../lib/node-snapshot');
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
    assert.match(chat.messages[0].content, /Ollama model "test-model"/);
    assert.match(chat.messages[0].content, /on-screen portrait avatar/);
    assert.match(chat.messages[0].content, /ask a brief clarification/);
    assert.deepEqual(chat.options, { num_predict: 160, num_ctx: 8192 });
    assert.equal(voice.busy, false);
    voice.fetch = async url => url.includes('transcriptions') ? Response.json({ text: 'Hi' }) : url.includes('/api/chat') ? Response.json({ message: { content: 'Hello' } }) : new Response('invalid audio');
    await assert.rejects(voice.converse(new Uint8Array(200)), /Speech synthesis failed/);
    assert.equal(voice.history.length, 2);
});
test('cancelling an in-flight turn aborts the service request and releases the busy guard', async () => {
    const voice = new LocalVoice({ config, fetchImpl: (_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true })) });
    const pending = voice.converse(new Uint8Array(200));
    await assert.rejects(voice.converse(new Uint8Array(200)), /already in progress/);
    voice.cancel(); await assert.rejects(pending, { code: 'cancelled' });
    assert.equal(voice.busy, false);
});

test('model selects the readonly tool for a follow-up and receives fresh facts before speaking', async () => {
    let chats = 0, reads = 0; const wav = Buffer.alloc(44); wav.write('RIFF');
    const voice = new LocalVoice({ config, nodeSnapshot: async () => { reads++; return { lightning: { activeChannels: 3 } }; }, fetchImpl: async (url, options) => {
        if (url.includes('transcriptions')) return Response.json({ text: 'And how many are active?' });
        if (url.includes('/api/chat')) {
            const body = JSON.parse(options.body); chats++;
            if (chats === 1) { assert.equal(body.tools[0].function.name, nodeTool.function.name); return Response.json({ message: { content: '', tool_calls: [{ function: { name: nodeTool.function.name, arguments: {} } }] } }); }
            assert.equal(body.tools, undefined); assert.equal(body.messages.at(-1).role, 'tool');
            assert.equal(JSON.parse(body.messages.at(-1).content).lightning.activeChannels, 3);
            return Response.json({ message: { content: 'Three are active.' } });
        }
        return new Response(wav);
    } });
    assert.equal((await voice.converse(new Uint8Array(200))).reply, 'Three are active.');
    assert.equal(reads, 1); assert.equal(chats, 2);
});
test('unapproved model commands never execute', async () => {
    let reads = 0;
    const voice = new LocalVoice({ config, nodeSnapshot: async () => { reads++; }, fetchImpl: async url => url.includes('transcriptions') ? Response.json({ text: 'Run a command' }) : Response.json({ message: { tool_calls: [{ function: { name: 'shell', arguments: { command: 'pay' } } }] } }) });
    await assert.rejects(voice.converse(new Uint8Array(200)), /language model/);
    assert.equal(reads, 0);
});

test('tool-selection commentary is never spoken or saved when no tool is needed', async () => {
    let chats = 0, spoken; const wav = Buffer.alloc(44); wav.write('RIFF');
    const draft = 'No specific function call is required; I can respond with a greeting.';
    const voice = new LocalVoice({ config, nodeSnapshot: async () => { throw new Error('Unexpected lookup'); }, fetchImpl: async (url, options) => {
        if (url.includes('transcriptions')) return Response.json({ text: 'Hello' });
        if (url.includes('/api/chat')) {
            const body = JSON.parse(options.body); chats++;
            if (chats === 1) return Response.json({ message: { content: draft } });
            assert.equal(body.tools, undefined); assert.ok(!JSON.stringify(body.messages).includes(draft));
            return Response.json({ message: { content: 'Hello! How are you?' } });
        }
        spoken = JSON.parse(options.body).text; return new Response(wav);
    } });
    const result = await voice.converse(new Uint8Array(200));
    assert.equal(spoken, 'Hello! How are you?'); assert.equal(result.reply, spoken);
    assert.equal(voice.history.at(-1).content, spoken); assert.equal(chats, 2);
});
test('explicit final reply takes one model call and excludes tool-selection prose', async () => {
    let chats = 0, spoken; const wav = Buffer.alloc(44); wav.write('RIFF');
    const voice = new LocalVoice({ config, fetchImpl: async (url, options) => {
        if (url.includes('transcriptions')) return Response.json({ text: 'Hello' });
        if (url.includes('/api/chat')) { chats++; return Response.json({ message: { content: 'I should greet the user.', tool_calls: [{ function: { name: 'respond_to_user', arguments: { reply: 'Hi! Good to hear from you.' } } }] } }); }
        spoken = JSON.parse(options.body).text; return new Response(wav);
    } });
    await voice.converse(new Uint8Array(200)); assert.equal(chats, 1);
    assert.equal(spoken, 'Hi! Good to hear from you.'); assert.equal(voice.history.at(-1).content, spoken);
});
test('recognised live node questions require a snapshot before any model answer', async () => {
    let reads = 0, chats = 0; const wav = Buffer.alloc(44); wav.write('RIFF');
    const voice = new LocalVoice({ config, nodeSnapshot: async () => { reads++; return { lightning: { state: 'unavailable' } }; }, fetchImpl: async (url, options) => {
        if (url.includes('transcriptions')) return Response.json({ text: 'How many lightning channels do we have?' });
        if (url.includes('/api/chat')) { chats++; assert.equal(reads, 1); const body = JSON.parse(options.body); assert.equal(body.tools, undefined); assert.match(body.messages.at(-1).content, /unavailable/); return Response.json({ message: { content: 'I cannot check the node right now.' } }); }
        return new Response(wav);
    } });
    assert.equal((await voice.converse(new Uint8Array(200))).reply, 'I cannot check the node right now.');
    assert.equal(chats, 1);
});
