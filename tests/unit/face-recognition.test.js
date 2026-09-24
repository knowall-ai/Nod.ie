const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { FaceStore, FaceRecognition, MODEL } = require('../../lib/face-recognition');
const vector = i => Array.from({ length: 128 }, (_, n) => n === i ? 1 : 0);
const result = (...vectors) => ({ model: MODEL, faces: vectors.map(vector => ({ vector })) });
async function store(t) { const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'nodie-faces-')); t.after(() => fs.rm(dir, { recursive: true, force: true })); return new FaceStore(path.join(dir, 'faces.json')); }
test('disabled faces never invoke inference', async t => {
    const s = await store(t); let called = false;
    const engine = new FaceRecognition({ store: s, analyse: async () => { called = true; } });
    assert.equal((await engine.analyse(new Uint8Array(100))).state, 'disabled'); assert.equal(called, false);
});
test('remembered names survive restart; embeddings do not reach settings', async t => {
    const s = await store(t); await s.configure(true); const d = await s.load();
    const observed = await s.observe(result(vector(0)), d.epoch); await s.edit(observed.faces[0].id, 'Example');
    const restarted = new FaceStore(s.file), next = await restarted.load();
    assert.equal((await restarted.observe(result(vector(0)), next.epoch)).faces[0].name, 'Example');
    assert.equal(JSON.stringify(await restarted.status()).includes('vectors'), false);
});
test('disable, deletion and cancellation invalidate late results', async t => {
    const s = await store(t); await s.configure(true); const old = await s.load(); await s.forget();
    assert.equal((await s.observe(result(vector(0)), old.epoch)).state, 'disabled');
    await s.configure(true); const current = await s.load(); const controller = new AbortController(); controller.abort();
    await assert.rejects(s.observe(result(vector(0)), current.epoch, controller.signal));
    assert.equal((await s.status()).profiles.length, 0);
});
test('ambiguous matches remain unnamed and merging retains both samples', async t => {
    const s = await store(t); await s.configure(true); let d = await s.load();
    const observed = await s.observe(result(vector(0), vector(1)), d.epoch);
    const mixed = vector(0).map((_, i) => i < 2 ? Math.SQRT1_2 : 0);
    assert.equal((await s.observe(result(mixed), d.epoch)).faces[0].uncertain, true);
    await s.edit(observed.faces[0].id, 'Example'); await s.merge(observed.faces[1].id, observed.faces[0].id); d = await s.load();
    assert.equal((await s.observe(result(vector(1)), d.epoch)).faces[0].name, 'Example');
});
test('invalid models and vectors cannot be saved', async t => {
    const s = await store(t); await s.configure(true); const d = await s.load();
    assert.throws(() => s.observe({ ...result(vector(0)), model: 'wrong' }, d.epoch));
    assert.throws(() => s.observe(result([NaN]), d.epoch));
});
test('runtime faces are temporary until a name is confirmed',async t=>{
 const s=await store(t);await s.configure(true);const engine=new FaceRecognition({store:s,analyse:async()=>result(vector(0))});
 const first=await engine.analyse(new Uint8Array(100));assert.equal((await s.status()).profiles.length,0);
 const second=await engine.analyse(new Uint8Array(100));assert.equal(first.faces[0].id,second.faces[0].id);
 assert.equal(await s.nameObserved(first,first.faces[0].id,'Example'),true);assert.equal((await s.status()).profiles.length,1);
});
test('status polling and repeated temporary face frames do not rewrite profiles',async t=>{
 const s=await store(t);await s.configure(true);let writes=0;const original=s.write.bind(s);s.write=async d=>{writes++;return original(d);};
 const engine=new FaceRecognition({store:s,analyse:async()=>result(vector(0))});
 for(let i=0;i<10;i++){await s.status();await engine.analyse(new Uint8Array(100));}
 assert.equal(writes,0);const o=engine.lastObservation;await s.nameObserved(o,o.faces[0].id,'Example');assert.equal(writes,1);
 for(let i=0;i<10;i++)await engine.analyse(new Uint8Array(100));assert.equal(writes,1);
});
