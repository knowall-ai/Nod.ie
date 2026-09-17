const test = require('node:test');
const assert = require('node:assert/strict');
const { isAddressedToNodie } = require('../../lib/direct-address');
test('direct address tolerates bounded ASR spellings and common greeting prefixes', () => {
    for (const text of ['Nodie, mute yourself', 'Hey Nodey stop listening', 'Nod.ie: turn your speaker on', 'Okay, Noddy, mute', 'Please Nodi stop listening', '  NODY! Be quiet']) assert.equal(isAddressedToNodie(text), true, text);
});
test('similar words, quoted mentions and a name elsewhere do not authorize controls', () => {
    for (const text of ['', 'Mute yourself', 'Nobody mute', 'Node, mute', 'Nodien mute', 'Tell Nodie to mute', '"Nodie, mute yourself" is a command', 'My friend Nodie says mute', null]) assert.equal(isAddressedToNodie(text), false, String(text));
});
