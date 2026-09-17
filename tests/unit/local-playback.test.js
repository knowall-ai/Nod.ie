const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
function harness(videoPlay) {
    let revoked = 0, audioStarts = 0, visible = false;
    class Audio { play() { audioStarts++; return Promise.resolve(); } pause() {} removeAttribute() {} load() {} }
    const video = { play: videoPlay, pause() {}, removeAttribute() {}, load() {} };
    const context = { window: { nodie: { voiceCancel: async () => {} } }, document: { getElementById: id => id === 'avatar-video' ? video : null }, Audio, Blob, clearTimeout, clearInterval, setTimeout,
        URL: { createObjectURL: () => 'blob:test', revokeObjectURL: () => revoked++ } };
    vm.runInNewContext(fs.readFileSync('modules/local-voice-session.js', 'utf8'), context);
    const session = new context.window.LocalVoiceSession({ state: { avatarManager: { isEnabled: () => true, setSpeechVideo: value => visible = value } }, setStatus() {} });
    return { session, video, stats: () => ({ revoked, audioStarts, visible }) };
}
test('video decoder failure falls back to audio once and clears handlers and media URLs', async () => {
    const h = harness(() => Promise.reject(new Error('Unsupported codec')));
    await h.session.playReply({ audio: new Uint8Array(44), video: new Uint8Array(16) }, 0);
    assert.equal(h.stats().audioStarts, 1); assert.equal(h.stats().visible, false); assert.equal(h.stats().revoked, 1);
    assert.equal(h.video.onended, null); assert.equal(h.video.onerror, null);
    h.session.cancel(); assert.equal(h.stats().revoked, 2); assert.equal(h.session.player, null);
});
test('cancelled pending video play cannot return to speaking or start audio later', async () => {
    let reject;
    const h = harness(() => new Promise((_resolve, fail) => { reject = fail; }));
    const playing = h.session.playReply({ audio: new Uint8Array(44), video: new Uint8Array(16) }, 0);
    h.session.cancel(); reject(new Error('Playback interrupted')); await playing;
    assert.equal(h.session.state, 'idle'); assert.equal(h.stats().audioStarts, 0); assert.equal(h.stats().visible, false);
    assert.equal(h.session.player, null); assert.equal(h.video.onerror, null); assert.equal(h.stats().revoked, 1);
});

test('continuous listening resumes after playback but cancellation invalidates a queued resume', async () => {
    const h = harness(() => Promise.resolve()); let starts = 0;
    h.session.listeningEnabled = true;
    h.session.toggle = async () => { starts++; };
    await h.session.playReply({ audio: new Uint8Array(44), video: new Uint8Array(16) }, 0);
    assert.equal(starts, 0);
    h.video.onended();
    await new Promise(resolve => setTimeout(resolve, 300));
    assert.equal(starts, 1);
    h.session.resumeListening(5); h.session.cancel();
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(starts, 1); assert.equal(h.session.listeningEnabled, false);
});
test('spoken microphone-off prevents resuming after the acknowledgement', async () => {
    const h = harness(() => Promise.resolve()); let starts = 0;
    h.session.toggle = async () => { starts++; };
    h.session.listeningEnabled = false;
    await h.session.playReply({ audio: new Uint8Array(44), video: new Uint8Array(16) }, 0);
    h.video.onended();
    await new Promise(resolve => setTimeout(resolve, 300));
    assert.equal(starts, 0);
});
