const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalize, validate } = require('../../lib/config-schema');
test('legacy desktop settings normalize to the same public schema as browser config', () => {
    assert.equal(validate({ unmuteBackendUrl: 'ws://localhost:8767', voiceModel: 'voice' }).UNMUTE_BACKEND_URL, 'ws://localhost:8767');
    assert.equal(normalize({ NEO4J_PASSWORD: 'secret', N8N_WEBHOOK_URL: 'secret' }).NEO4J_PASSWORD, undefined);
    assert.equal(normalize({ avatarEnabled: false }).AVATAR_ENABLED, false);
});
test('configuration rejects missing realtime URLs and embedded credentials', () => {
    assert.throws(() => validate({}));
    assert.throws(() => validate({ UNMUTE_BACKEND_URL: 'ws://user:password@localhost' }));
    assert.doesNotThrow(() => validate({ VOICE_MODE: 'local' }));
});
