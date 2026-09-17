const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
function setup() {
    const elements = Object.fromEntries(['mic', 'speaker', 'camera'].map(name => {
        const element = { dataset: {}, attrs: {}, handlers: {}, image: {}, addEventListener(type, fn) { this.handlers[type] = fn; }, setAttribute(k, v) { this.attrs[k] = v; }, querySelector() { return this.image; } };
        return ['control-' + name, element];
    }));
    const saved = new Map();
    const window = { location: { pathname: '/' } };
    vm.runInNewContext(fs.readFileSync('modules/avatar-controls.js', 'utf8'), { window, document: { getElementById: id => elements[id] }, localStorage: { getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value) } });
    saved.set(window.AvatarControls.speakerStorageKey, 'true');
    return { elements, saved, Controls: window.AvatarControls };
}
test('speaker preference affects current local and realtime playback and stays independent of microphone', () => {
    const { elements, saved, Controls } = setup(); let gainMuted, toggles = 0;
    const renderer = { state: { isLoading: false, isMuted: true, audioPlayback: { setMuted: value => gainMuted = value } }, localVoice: { state: 'idle', player: { muted: true } }, toggleMute: () => toggles++ };
    new Controls(renderer);
    assert.equal(renderer.state.speakerMuted, true);
    elements['control-speaker'].handlers.click();
    assert.equal(renderer.localVoice.player.muted, false); assert.equal(gainMuted, false); assert.equal(saved.get(Controls.speakerStorageKey), 'false'); assert.equal(toggles, 0);
    elements['control-speaker'].handlers.click(); assert.equal(renderer.localVoice.player.muted, true); assert.equal(gainMuted, true);
});
test('microphone interrupts a reply before recording and camera only explains its unavailable state', () => {
    const { elements, Controls } = setup(); const calls = [];
    const renderer = { state: { isLoading: false, isMuted: true }, localVoice: { state: 'speaking', cancel: () => calls.push('cancel') }, toggleMute: () => calls.push('record'), showNotification: message => calls.push(message) };
    const controls = new Controls(renderer);
    elements['control-mic'].handlers.click(); assert.deepEqual(calls, ['cancel', 'record']);
    renderer.localVoice.state = 'recording'; renderer.state.isMuted = false; controls.update();
    assert.equal(elements['control-mic'].attrs['aria-pressed'], 'true');
    elements['control-camera'].handlers.click(); assert.match(calls.at(-1), /Camera is off/);
});

test('spoken controls are idempotent and reject invalid actions before changing devices', () => {
    const { Controls, saved } = setup(); let released = 0;
    const renderer = { state: { isMuted: true }, localVoice: { state: 'processing', releaseMicrophone: () => released++ } };
    const controls = new Controls(renderer);
    controls.applyVoiceControls({ microphoneEnabled: false, speakerEnabled: false });
    controls.applyVoiceControls({ speakerEnabled: false });
    assert.equal(released, 1); assert.equal(renderer.state.speakerMuted, true);
    controls.applyVoiceControls({ speakerEnabled: true });
    assert.equal(renderer.state.speakerMuted, false); assert.equal(saved.get(Controls.speakerStorageKey), 'false');
    assert.throws(() => controls.applyVoiceControls({ microphoneEnabled: false, speakerEnabled: 'false' }));
    assert.equal(released, 1); assert.equal(renderer.state.speakerMuted, false);
});
