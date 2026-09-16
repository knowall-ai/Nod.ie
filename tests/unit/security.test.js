const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { SecurityMonitor, compare, splitImage } = require('../../security/monitor');
const digest = 'sha256:' + 'a'.repeat(64), old = 'sha256:' + 'b'.repeat(64);
test('versions include CLN calendar releases and do not treat RC builds as stable', () => { assert.equal(compare('v26.06.6', 'v26.06.7'), -1); assert.equal(compare('v2.4.2-rc1', '2.4.2'), null); assert.equal(splitImage('docker.io/ollama/ollama:latest').repository, 'ollama/ollama'); });
async function fixture(t) {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'nodie-monitor-test-'));
    t.after(() => fs.rm(dir, { recursive: true, force: true }));
    const file = path.join(dir, 'compose.yml'); await fs.writeFile(file, 'services:\n  ollama:\n    image: ollama/ollama:latest\n');
    let now = Date.now(); let notify = 0;
    const item = { id: 'c'.repeat(64), name: '/ollama', image: 'ollama/ollama:latest', imageId: old, project: 'test', service: 'ollama', files: file, cwd: dir, state: 'running' };
    const commands = []; let updated = false;
    const run = async args => {
        commands.push(args);
        const a = args[0] === '--context' ? args.slice(2) : args;
        if (a[0] === 'context') return a[1] === 'show' ? 'default' : 'unix:///var/run/docker.sock';
        if (a[0] === 'ps') return item.id;
        if (a[0] === 'inspect') return JSON.stringify({ ...item, imageId: updated ? digest : old });
        if (a[0] === 'image') return a.includes('{{.Id}}') ? digest : JSON.stringify({ digests: ['ollama/ollama@' + (updated ? digest : old)], arch: 'amd64', os: 'linux' });
        if (a[0] === 'buildx') return JSON.stringify({ digest });
        if (a[0] === 'pull') return '';
        if (a[0] === 'compose') { updated = true; return ''; }
        throw new Error('Unexpected command');
    };
    const monitor = new SecurityMonitor({ stateDir: dir, run, fetchJSON: async () => ({ tag_name: 'v0.34.1' }), notify: () => notify++, now: () => now });
    return { monitor, commands, file, item, getNotify: () => notify, age: () => now += 7 * 60 * 60 * 1000 };
}
test('scan is read-only, compares running digests and deduplicates notifications', async t => {
    const f = await fixture(t); const state = await f.monitor.scan(); await f.monitor.scan();
    assert.equal(state.containers[0].status, 'update-recommended'); assert.equal(f.getNotify(), 1);
    assert.ok(!f.commands.some(a => ['pull', 'compose', 'restart', 'stop'].includes(a[0])));
    assert.ok(!f.commands.some(a => a.join(' ').includes('.Config.Env')));
});
test('approved plan is single-use and pins the verified digest', async t => {
    const f = await fixture(t); await f.monitor.scan(); const plan = await f.monitor.prepare(f.item.id); assert.equal(plan.executable, true);
    const result = await f.monitor.apply(plan.id); assert.equal(result.status, 'verified');
    assert.ok(f.commands.some(a => a.includes('pull') && a.includes('ollama/ollama@' + digest)));
    assert.ok(f.commands.some(a => a.includes('--no-deps') && a.includes('--no-build')));
    await assert.rejects(() => f.monitor.apply(plan.id), /expired/);
});
test('changed Compose files and stale scans cannot be applied', async t => {
    const f = await fixture(t); await f.monitor.scan(); const plan = await f.monitor.prepare(f.item.id);
    await fs.appendFile(f.file, '# changed\n'); await assert.rejects(() => f.monitor.apply(plan.id), /configuration changed/);
    assert.ok(!f.commands.some(a => a.includes('pull')));
    f.age(); await assert.rejects(() => f.monitor.prepare(f.item.id), /fresh scan/);
});
test('failed release checks remain unknown', async t => {
    const f = await fixture(t); f.monitor.fetchJSON = async () => { throw new Error('offline'); };
    const result = await f.monitor.scan(); assert.equal(result.containers[0].status, 'unknown');
});
