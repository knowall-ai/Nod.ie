const test = require('node:test');
const {execFileSync} = require('node:child_process');
test('Ollama warm-up survives cancellation and refreshes bounded residency', () => {
    execFileSync('python3', ['unmute-service/test_ollama_warmup.py'], {timeout:10000, stdio:'pipe'});
});
