const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
test('direct dragging waits for native movement result and distinguishes taps and cancelled gestures', async () => {
    const handlers = {}, globalHandlers = {}; let finish, starts = 0;
    const context = { module: { exports: {} }, window: { addEventListener: (name, fn) => globalHandlers[name] = fn } };
    vm.runInNewContext(fs.readFileSync('modules/desktop-drag.js', 'utf8'), context);
    const wasDragged = context.module.exports({ addEventListener: (name, fn) => handlers[name] = fn, setPointerCapture() {} }, {
        beginDrag: () => starts++, endDrag: () => new Promise(resolve => { finish = resolve; })
    });
    const event = { button: 0, pointerId: 1, preventDefault() {} };
    handlers.pointerdown(event); handlers.pointerup(event); const tap = wasDragged(); finish(false); assert.equal(await tap, false);
    handlers.pointerdown(event); handlers.pointerup(event); const drag = wasDragged(); finish(true); assert.equal(await drag, true);
    handlers.pointerdown(event); globalHandlers.blur(); finish(false); assert.equal(await wasDragged(), true);
    assert.equal(starts, 3);
});
