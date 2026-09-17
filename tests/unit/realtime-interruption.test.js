const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
test('interruption clears buffered output, drops decoded tail, and preserves Opus continuity', async () => {
    const posts = []; let worker;
    class Context {
        constructor() { this.sampleRate = 48000; this.audioWorklet = { addModule: async () => {} }; }
        createGain() { return { gain: {}, connect() {}, disconnect() {} }; }
    }
    class Worker { constructor() { worker = this; } postMessage() {} }
    const context = { module: { exports: {} }, window: { AudioContext: Context, location: { pathname: '/' } },
        AudioWorkletNode: class { constructor() { this.port = { postMessage: x => posts.push(x) }; } connect() {} }, Worker, console: { log() {}, info() {}, debug() {} } };
    vm.runInNewContext(fs.readFileSync('modules/audio-playback-web.js', 'utf8'), context);
    const player = new context.module.exports(); await player.initialize();
    const decoder = player.decoderWorker;
    worker.onmessage({ data: [new Float32Array(128)] });
    player.interrupt();
    worker.onmessage({ data: [new Float32Array(128)] });
    assert.deepEqual(posts.map(x => x.type), ['audio', 'reset']);
    assert.equal(player.decoderWorker, decoder);
    player.beginResponse(); worker.onmessage({ data: [new Float32Array(128)] });
    assert.deepEqual(posts.map(x => x.type), ['audio', 'reset', 'reset', 'audio']);
});
test('both Unmute interruption events clear speech without stopping microphone capture', async () => {
    const context = { window: { addEventListener() {} }, document: { readyState: 'loading', addEventListener() {} }, console: { debug() {} }, module: { exports: {} }, clearTimeout };
    vm.runInNewContext(fs.readFileSync('renderer.js', 'utf8'), context);
    const renderer = context.module.exports;
    let interrupted = 0;
    const capture = { stop() { assert.fail('Interruption stopped microphone'); } };
    renderer.state.audioCapture = capture;
    renderer.state.audioPlayback = { interrupt() { interrupted++; } };
    for (const type of ['input_audio_buffer.speech_started', 'unmute.interrupted_by_vad']) {
        renderer.pcmAudioAccumulator = [1]; renderer.isAssistantSpeaking = true;
        await renderer.handleRealtimeMessage({ type });
        assert.equal(renderer.pcmAudioAccumulator.length, 0); assert.equal(renderer.isAssistantSpeaking, false);
        assert.equal(renderer.state.audioCapture, capture);
    }
    await renderer.handleRealtimeMessage({ type: 'input_audio_buffer.speech_stopped' });
    assert.equal(interrupted, 2);
});
test('a notification uses the avatar status or its fallback, never both', () => {
    const status = { style: {} }, fallback = { style: {} };
    let showStatus = true;
    const context = { window: { addEventListener() {} }, document: { readyState: 'loading', addEventListener() {}, getElementById: id => id === 'status-text' ? (showStatus ? status : null) : id === 'notification' ? fallback : null }, console: { debug() {}, log() {} }, module: { exports: {} }, setTimeout() {} };
    vm.runInNewContext(fs.readFileSync('renderer.js', 'utf8'), context);
    context.module.exports.showNotification('Connection failed', 'error');
    assert.equal(status.textContent, 'Connection failed'); assert.equal(fallback.textContent, undefined);
    showStatus = false;
    context.module.exports.showNotification('Connection failed', 'error');
    assert.equal(fallback.textContent, 'Connection failed');
});
