const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { VoiceError, publicError } = require('../../lib/voice-error');
test('desktop voice bridge exposes the safe voice error without Electron IPC wrapper text', async () => {
    let api;
    let result = { failure: publicError(new VoiceError('no-speech', 422)) };
    vm.runInNewContext(fs.readFileSync('preload.js', 'utf8'), { require: name => {
        assert.equal(name, 'electron');
        return { contextBridge: { exposeInMainWorld: (_name, value) => api = value }, ipcRenderer: { invoke: async channel => { assert.equal(channel, 'voice-turn'); return result; } } };
    } });
    await assert.rejects(api.voiceTurn(new Uint8Array(200)), { message: 'No speech detected. Please try again.', code: 'no-speech' });
    result = { audio: new Uint8Array(44), reply: 'Hello' };
    assert.equal(await api.voiceTurn(new Uint8Array(200)), result);
});
