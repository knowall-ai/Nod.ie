const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createServer } = require('../../lib/web-server');
test('static server protects private files, traversal, symlinks, rebinding and voice CSRF', async t => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'nodie-server-test-'));
    await fs.writeFile(path.join(root, 'index.html'), '<html>public</html>');
    await fs.writeFile(path.join(root, '.env'), 'SECRET=hidden');
    await fs.symlink('/etc/passwd', path.join(root, 'renderer.js'));
    let calls = 0;
    const server = createServer({ root, config: { UNMUTE_BACKEND_URL: 'ws://localhost:8767', SECRET: 'hidden' }, voice: { health: async () => { calls++; return { ready: true }; } } });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(async () => { await new Promise(resolve => server.close(resolve)); await fs.rm(root, { recursive: true, force: true }); });
    const port = server.address().port;
    function request(url, headers = {}, method = 'GET') { return new Promise((resolve, reject) => { const req = http.request({ host: '127.0.0.1', port, path: url, method, headers }, res => { let body = ''; res.on('data', c => body += c); res.on('end', () => resolve({ status: res.statusCode, body, headers: res.headers })); }); req.on('error', reject); req.end(); }); }
    for (const url of ['/.env', '/../outside', '/%2e%2e/outside', '/.git/config', '/renderer.js']) assert.equal((await request(url)).status, 403, url);
    assert.equal((await request('/main.js')).status, 404);
    assert.equal((await request('/', { Host: 'attacker.example' })).status, 403);
    const config = await request('/env-config.js'); assert.equal(config.status, 200); assert.ok(!config.body.includes('hidden'));
    assert.match((await request('/')).headers['content-security-policy'], /object-src 'none'/);
    assert.equal((await request('/voice/health', { Origin: 'http://attacker.example' }, 'POST')).status, 403);
    assert.equal((await request('/voice/health', { Origin: `http://127.0.0.1:${port}` }, 'POST')).status, 200);
    assert.equal(calls, 1);
});
