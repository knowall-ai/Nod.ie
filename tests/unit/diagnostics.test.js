const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Logger } = require('../../lib/logger');
const { changes } = require('../../lib/diagnostics');
test('logs omit arbitrary messages, secrets and audio and rotate within the bound', t => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nodie-logs-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const logger = new Logger(dir, 100);
    logger.write('error', 'voice.failed', { stage: 'speech', password: 'secret-test', message: 'private transcript', code: 'token=secret-test' });
    logger.write('warn', 'memory.unavailable'); logger.write('warn', 'memory.unavailable');
    const content = fs.readdirSync(dir).map(name => fs.readFileSync(path.join(dir, name), 'utf8')).join('');
    assert.doesNotMatch(content, /secret-test|private transcript/);
    assert.ok(fs.existsSync(path.join(dir, 'nodie.jsonl.1')));
    assert.equal(fs.statSync(path.join(dir, 'nodie.jsonl')).mode & 0o777, 0o600);
});
test('diagnostics distinguish old stopped containers from new failures and changes', () => {
    const base = { id: '1', name: '/ollama', state: 'running', health: 'healthy', restarts: 0, oom: false };
    assert.deepEqual(changes(undefined, [{ ...base, state: 'exited' }]), []);
    const events = changes([base], [{ ...base, state: 'exited', oom: true, restarts: 3 }, { ...base, id: '2', name: '/new-service' }]);
    assert.deepEqual(events.map(e => e.code), ['out-of-memory', 'stopped', 'restart-loop', 'new-container']);
    assert.equal(changes([base], [{ ...base, health: 'unhealthy' }])[0].code, 'unhealthy');
});
