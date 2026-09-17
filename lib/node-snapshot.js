const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const runFile = promisify(execFile);
const MAX_SATS = 21_000_000 * 100_000_000;
const integer = (value, cap = MAX_SATS) => {
    if (typeof value !== 'number' && (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value))) throw new Error('Invalid node metric');
    const n = typeof value === 'number' ? value : Number.parseInt(value, 10);
    if (!Number.isSafeInteger(n) || n < 0 || n > cap) throw new Error('Invalid node metric');
    return n;
};
function requiresNodeSnapshot(text, history = []) {
    const topic = /\b(bitcoin|core|lightning|lnd|channels?|liquidity|sats?|satoshis)\b/i;
    if (topic.test(text)) return true;
    const previousUser = history.filter(m => m.role === 'user').at(-1)?.content || '';
    return topic.test(previousUser) && /\b(how many|how much|active|inactive|pending|balance|version|capacity|inbound|outbound|available|running)\b/i.test(text);
}
const version = value => { if (typeof value !== 'string' || value.length > 100) throw new Error('Invalid version'); return value; };
async function nodeSnapshot({ run = runFile, signal } = {}) {
    // Fixed commands only. User/model text never supplies a command or argument.
    const json = async args => JSON.parse((await run('docker', ['exec', ...args], { timeout: 5000, maxBuffer: 2 * 1024 * 1024, signal })).stdout);
    const lnd = method => json(['lnd', 'lncli', '--macaroonpath=/root/.lnd/data/chain/bitcoin/mainnet/readonly.macaroon', method]);
    const [bitcoin, lightning] = await Promise.allSettled([
        json(['bitcoind', 'bitcoin-cli', 'getnetworkinfo']).then(info => ({ state: 'checked', version: version(info.subversion) })),
        Promise.all([lnd('getinfo'), lnd('listchannels')]).then(([info, result]) => {
            if (!Array.isArray(result.channels)) throw new Error('Invalid channels');
            const channels = result.channels.map(c => ({ active: c.active === true, capacitySats: integer(c.capacity), localBalanceSats: integer(c.local_balance), remoteBalanceSats: integer(c.remote_balance), localReserveSats: integer(c.local_chan_reserve_sat), remoteReserveSats: integer(c.remote_chan_reserve_sat), unsettledSats: integer(c.unsettled_balance) }));
            const sum = (list, key) => integer(list.reduce((n, c) => n + c[key], 0));
            const totals = list => Object.fromEntries(['capacitySats', 'localBalanceSats', 'remoteBalanceSats', 'localReserveSats', 'remoteReserveSats', 'unsettledSats'].map(key => [key, sum(list, key)]));
            return { state: 'checked', implementation: 'LND', version: version(info.version), openChannels: channels.length, activeChannels: channels.filter(c => c.active).length, pendingChannels: integer(info.num_pending_channels, 1_000_000), totals: totals(channels), activeTotals: totals(channels.filter(c => c.active)), channels: channels.slice(0, 20), channelDetailsTruncated: channels.length > 20, note: 'All values are sats. Local/remote balances describe outbound/inbound balance, not guaranteed routable liquidity. Reserves, fees, HTLC limits and peer availability restrict payments. Inactive channels are excluded from activeTotals. Channel calls are a best-effort snapshot, not atomic.' };
        })
    ]);
    const result = r => r.status === 'fulfilled' ? r.value : { state: 'unavailable' };
    return { checkedAt: new Date().toISOString(), scope: 'Local bitcoind and lnd containers only; no payment or channel mutation access', bitcoin: result(bitcoin), lightning: result(lightning) };
}
const nodeTool = { type: 'function', function: { name: 'get_node_status', description: 'Look up current local Bitcoin Core version and LND version, open/active/pending channel counts, channel balances and reserves. Read-only. Use for live node questions and follow-ups; unavailable data must not be guessed.', parameters: { type: 'object', properties: {}, required: [], additionalProperties: false } } };
module.exports = { nodeSnapshot, nodeTool, requiresNodeSnapshot };
