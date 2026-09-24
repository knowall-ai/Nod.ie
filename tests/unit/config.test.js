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

test('settings IPC accepts only plain objects with approved keys', () => {
    const { validateSettingsPatch } = require('../../lib/config-schema');
    for (const value of [null, [], new Date(), new Map(), new Uint8Array(), 'name', 1, Object.create({ AVATAR_ENABLED: true }), { toString: 'override' }, { UNKNOWN: true }]) {
        assert.throws(() => validateSettingsPatch(value), /Unsupported settings/);
    }
    assert.doesNotThrow(() => validateSettingsPatch({ AVATAR_ENABLED: false, ASSISTANT_NAME: 'Nod.ie' }));
    assert.throws(() => validateSettingsPatch({ AVATAR_ENABLED: 'false' }), /Invalid avatar setting/);
});

test('public lip-sync capability reflects configuration without exposing its URL',()=>{
 assert.equal(normalize({}).LIP_SYNC_CONFIGURED,false);
 assert.equal(normalize({LOCAL_LIP_SYNC_URL:''}).LIP_SYNC_CONFIGURED,false);
 const config=normalize({LOCAL_LIP_SYNC_URL:'http://localhost:8768'});
 assert.equal(config.LIP_SYNC_CONFIGURED,true);assert.equal(config.LOCAL_LIP_SYNC_URL,undefined);
 assert.equal(normalize(config).LIP_SYNC_CONFIGURED,true);
});
