const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
function captureContext(getUserMedia) {
    const context = { module: { exports: {} }, navigator: { mediaDevices: { getUserMedia } }, window: {}, Uint8Array, btoa };
    vm.runInNewContext(fs.readFileSync('modules/audio-capture-web.js', 'utf8'), context);
    return context.module.exports;
}
test('muting while microphone permission is pending releases the eventual stream', async () => {
    let resolve; let stopped = 0;
    const Capture = captureContext(() => new Promise(r => { resolve = r; }));
    const capture = new Capture(() => assert.fail('Muted capture sent audio'));
    const pending = capture.start(); capture.stop();
    resolve({ getTracks: () => [{ stop: () => stopped++ }] }); await pending;
    assert.equal(stopped, 1); assert.equal(capture.isCapturing, false);
});
test('duplicate microphone starts share a single permission request', async () => {
    let count = 0, resolve;
    const Capture = captureContext(() => { count++; return new Promise(r => { resolve = r; }); });
    const capture = new Capture(() => {});
    const a = capture.start(), b = capture.start(); assert.equal(a, b); assert.equal(count, 1);
    capture.stop(); resolve({ getTracks: () => [] }); await a;
});
test('realtime reconnects once, preserves prompt, handles invalid messages and stops permanently', () => {
    const sockets = [], timers = new Map(); let next = 0, errors = 0;
    class Socket { constructor() { this.readyState = 0; sockets.push(this); } send(data) { this.sent = JSON.parse(data); } close() { this.readyState = 3; this.onclose?.(); } }
    const context = { module: { exports: {} }, WebSocket: Socket, setTimeout: fn => { const id = ++next; timers.set(id, fn); return id; }, clearTimeout: id => timers.delete(id) };
    vm.runInNewContext(fs.readFileSync('modules/websocket-handler.js', 'utf8'), context);
    const Handler = context.module.exports;
    const handler = new Handler({ UNMUTE_BACKEND_URL: 'ws://localhost', SYSTEM_PROMPT: 'Nodie prompt' }, { onMessage: () => {}, onError: () => errors++ });
    handler.connect(); handler.connect(); assert.equal(sockets.length, 1);
    sockets[0].readyState = 1; sockets[0].onopen(); assert.equal(sockets[0].sent.session.instructions.text, 'Nodie prompt');
    sockets[0].onmessage({ data: 'invalid' }); assert.equal(errors, 1);
    sockets[0].close(); assert.equal(timers.size, 1);
    [...timers.values()][0](); assert.equal(sockets.length, 2);
    handler.close(); assert.equal(timers.size, 0); handler.connect(); assert.equal(sockets.length, 2);
});
