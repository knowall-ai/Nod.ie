const test = require('node:test');
const assert = require('node:assert/strict');
const { dragPosition } = require('../../lib/window-drag');
const area = { x: 0, y: 0, width: 1280, height: 720 };
test('downward dragging stays monotonic and can overlap the panel and stops with a recoverable strip on the 300% desktop', () => {
    const origin = { x: 950, y: 500 }, start = [800, 350];
    const ys = [10, 20, 30, 40, 100, 200].map(dy => dragPosition(origin, { x: 950, y: 500 + dy }, start, [300, 300], area)[1]);
    assert.deepEqual(ys, [360, 370, 380, 390, 450, 550]);
    assert.deepEqual(dragPosition(origin, { x: 950, y: 480 }, start, [300, 300], area), [800, 330]);
});
test('drag bounds support displays left of the primary monitor', () => {
    assert.deepEqual(dragPosition({ x: 0, y: 200 }, { x: -1200, y: 250 }, [0, 100], [300, 300], { x: -1280, y: 0, width: 1280, height: 720 }), [-1200, 150]);
});

test('clock placement and saved partially offscreen positions remain reachable', () => {
    const start = [1150, 570], zero = { x: 0, y: 0 };
    assert.deepEqual(dragPosition(zero, zero, start, [300, 300], area), start);
    assert.deepEqual(dragPosition(zero, { x: 1000, y: 1000 }, start, [300, 300], area), [1180, 620]);
});

test('a display smaller than the avatar permits clipping without resizing the fixed overlay', () => {
    const size = [300, 300];
    assert.deepEqual(dragPosition({ x: 0, y: 0 }, { x: 500, y: 500 }, [0, 0], size, { x: 0, y: 0, width: 200, height: 150 }), [100, 50]);
    assert.deepEqual(size, [300, 300]);
});
