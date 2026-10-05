const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { assertPrivateFile, privateTempDir } = require('../helpers/private-file.cjs');

test('privacy assertion rejects a file readable by everyone', t => {
    const dir = privateTempDir(path.join(os.tmpdir(), 'nodie-privacy-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const file = path.join(dir, 'private.json');
    fs.writeFileSync(file, '{}', { mode: 0o600 });
    assertPrivateFile(file);
    if (process.platform === 'win32') {
        execFileSync('icacls.exe', [file, '/grant', '*S-1-1-0:(R)'], { windowsHide: true, timeout: 10000 });
    } else {
        fs.chmodSync(file, 0o644);
    }
    assert.throws(() => assertPrivateFile(file), assert.AssertionError);
});
