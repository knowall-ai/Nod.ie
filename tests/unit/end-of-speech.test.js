const test = require('node:test');
const assert = require('node:assert/strict');
const { EndOfSpeech } = require('../../modules/end-of-speech');
test('endpointing waits through natural pauses and submits after sustained speech then silence', () => {
    const detector = new EndOfSpeech(0);
    for (let t = 50; t <= 500; t += 50) assert.equal(detector.observe(0.05, t), null);
    for (let t = 550; t <= 1100; t += 50) assert.equal(detector.observe(0.002, t), null);
    for (let t = 1150; t <= 1500; t += 50) assert.equal(detector.observe(0.05, t), null);
    assert.equal(detector.observe(0.002, 2350), null);
    assert.equal(detector.observe(0.002, 2400), 'finished');
});
test('silence and brief clicks do not submit recordings as speech', () => {
    const detector = new EndOfSpeech(0);
    for (let t = 50; t < 10000; t += 50) assert.equal(detector.observe(t % 1000 === 0 ? 0.1 : 0.002, t), null);
    assert.equal(detector.observe(0.002, 10000), 'no-speech');
});
