const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { ConversationHistory } = require('../../lib/conversation-history');
async function fixture(t) { const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'nodie-history-')); t.after(() => fs.rm(dir, { recursive: true, force: true })); return path.join(dir, 'history.json'); }
test('history survives new instances, retains six turns and uses private file permissions', async t => {
    const file = await fixture(t); const store = new ConversationHistory(file); const initial = await store.load();
    for (let i = 0; i < 8; i++) await store.append(initial.epoch, 'question ' + i, 'answer ' + i);
    const restored = await new ConversationHistory(file).load();
    assert.equal(restored.turns.length, 12); assert.equal(restored.turns[0].content, 'question 2');
    assert.equal((await fs.stat(file)).mode & 0o777, 0o600);
});
test('concurrent writers retain both turns and clearing invalidates in-flight writes', async t => {
    const file = await fixture(t); const a = new ConversationHistory(file); const b = new ConversationHistory(file); const saved = await a.load();
    await Promise.all([a.append(saved.epoch, 'one', 'reply one'), b.append(saved.epoch, 'two', 'reply two')]);
    assert.equal((await a.load()).turns.length, 4);
    const cleared = await b.clear(); assert.notEqual(cleared.epoch, saved.epoch);
    await a.append(saved.epoch, 'stale', 'must not reappear'); assert.deepEqual((await a.load()).turns, []);
});
test('oversized or malformed saved history fails explicitly and can be cleared', async t => {
    const file = await fixture(t); await fs.writeFile(file, '{broken'); const store = new ConversationHistory(file);
    await assert.rejects(store.load()); await store.clear(); assert.deepEqual((await store.load()).turns, []);
});
