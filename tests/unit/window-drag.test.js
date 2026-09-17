const test = require('node:test');
const assert = require('node:assert/strict');
const { dragPosition } = require('../../lib/window-drag');
const area = { x: 0, y: 0, width: 1280, height: 674 };
test('downward dragging stays monotonic and stops at the usable bottom edge on the 300% desktop', () => {
    const origin = { x: 950, y: 500 }, start = [800, 350];
    const ys = [10, 20, 30, 40, 100, 200].map(dy => dragPosition(origin, { x: 950, y: 500 + dy }, start, [300, 300], area)[1]);
    assert.deepEqual(ys, [360, 370, 374, 374, 374, 374]);
    assert.deepEqual(dragPosition(origin, { x: 950, y: 480 }, start, [300, 300], area), [800, 330]);
});
test('drag bounds support displays left of the primary monitor', () => {
    assert.deepEqual(dragPosition({ x: 0, y: 200 }, { x: -1200, y: 250 }, [0, 100], [300, 300], { x: -1280, y: 0, width: 1280, height: 720 }), [-1200, 150]);
});
