const test = require('node:test');
const assert = require('node:assert/strict');
const { nodeSnapshot } = require('../../lib/node-snapshot');
test('node queries use fixed readonly commands, omit identities and distinguish active balances', async () => {
    const calls = [];
    const run = async (file, args, options) => {
        calls.push({ file, args, options });
        const method = args.at(-1);
        const channel = { capacity: '100', local_balance: '60', remote_balance: '35', local_chan_reserve_sat: '2', remote_chan_reserve_sat: '2', unsettled_balance: '0', remote_pubkey: 'PRIVATE-IDENTITY' };
        return { stdout: JSON.stringify(method === 'getnetworkinfo' ? { subversion: '/Satoshi:31.1.0/' } : method === 'getinfo' ? { version: '0.21.3', num_pending_channels: 1 } : { channels: [{ ...channel, active: true }, { ...channel, active: false }] }) };
    };
    const result = await nodeSnapshot({ run });
    assert.equal(result.lightning.openChannels, 2); assert.equal(result.lightning.activeChannels, 1);
    assert.equal(result.lightning.totals.localBalanceSats, 120); assert.equal(result.lightning.activeTotals.localBalanceSats, 60);
    assert.ok(!JSON.stringify(result).includes('PRIVATE-IDENTITY'));
    assert.equal(calls.length, 3);
    for (const call of calls) { assert.equal(call.file, 'docker'); assert.equal(call.options.timeout, 5000); assert.ok(!call.args.join(' ').includes('closeallchannels')); if (call.args.includes('lncli')) assert.ok(call.args.some(a => a.endsWith('/readonly.macaroon'))); }
});
test('node failure is unavailable, never a fabricated zero or leaked raw error', async () => {
    const result = await nodeSnapshot({ run: async () => { throw new Error('secret'); } });
    assert.deepEqual(result.bitcoin, { state: 'unavailable' }); assert.deepEqual(result.lightning, { state: 'unavailable' });
    assert.ok(!JSON.stringify(result).includes('secret'));
});
