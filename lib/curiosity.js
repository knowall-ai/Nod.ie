/** Bounded visual novelty and durable delivery budgets. No wording or identities. */
const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const { ConversationHistory } = require('./conversation-history');
const LEVELS = { off: null, observe: { gap: 240000, cap: 15 }, low: { gap: 600000, cap: 6 }, normal: { gap: 240000, cap: 15 }, high: { gap: 90000, cap: 30 } };
const category = value => value.normalize('NFKC').toLowerCase().trim().replace(/\s+/g, ' ').slice(0,40);
class SceneDelta {
    constructor() { this.reset(); }
    reset() { this.baseline = null; this.previous = null; }
    observe(scene, at) {
        const items = new Map();
        for (const a of scene.animals || []) if (!a.onScreen) items.set('animal:' + category(a.kind), { type: 'animal', kind: category(a.kind), appearance: a.appearance });
        for (const o of scene.objects || []) if (o.heldByPerson && !o.onScreen) items.set('held-object:' + category(o.kind), { type: 'held-object', kind: category(o.kind), appearance: o.appearance });
        const current = { items, people: scene.people, at };
        const previous = this.previous; this.previous = current;
        if (!previous || at - previous.at < 5000) return [];
        if (!this.baseline) { this.baseline = previous; return []; }
        const events = [];
        if (current.people > this.baseline.people && current.people === previous.people) events.push({ type: 'people', kind: 'person', appearance: '', count: current.people });
        for (const [key, item] of items) if (previous.items.has(key) && !this.baseline.items.has(key)) events.push(item);
        // Only stable additions/removals change the baseline. Failed analyses never call us.
        for (const key of this.baseline.items.keys()) if (!items.has(key) && !previous.items.has(key)) this.baseline.items.delete(key);
        for (const [key, item] of items) if (previous.items.has(key)) this.baseline.items.set(key, item);
        if (current.people === previous.people) this.baseline.people = current.people;
        return scene.people > 0 ? events.map(e => ({ ...e, key: e.type + ':' + e.kind })) : [];
    }
}
class CuriosityLedger extends ConversationHistory {
    constructor(file, { now = () => Date.now(), timezone = Intl.DateTimeFormat().resolvedOptions().timeZone } = {}) { super(file); Object.assign(this, { now, timezone }); }
    empty() { return { version: 1, entries: [], pauseUntil: 0, ignored: 0 }; }
    async read() {
        try {
            if ((await fs.stat(this.file)).size > 128000) throw Error('Curiosity history exceeds limit');
            const d = JSON.parse(await fs.readFile(this.file, 'utf8'));
            if (d.version !== 1 || !Array.isArray(d.entries) || d.entries.length > 256 || !Number.isFinite(d.pauseUntil) || !Number.isInteger(d.ignored) || d.entries.some(e => typeof e.key !== 'string' || e.key.length > 100 || !Number.isFinite(e.at) || typeof e.token !== 'string' || !['claimed','answered','unanswered','interrupted','cancelled'].includes(e.outcome))) throw Error('Invalid curiosity history');
            d.entries = d.entries.filter(e => this.now() - e.at < 30 * 86400000); return d;
        } catch (e) { if (e.code === 'ENOENT') return this.empty(); throw e; }
    }
    claim(candidate, level) {
        return this.transaction(async () => {
            const rule = LEVELS[level]; if (!rule) return { reason: 'off' };
            const d = await this.read(), now = this.now(), counted = d.entries.filter(e=>e.outcome!=='cancelled'), last = counted.at(-1);
            const day = at => new Intl.DateTimeFormat('en-CA', { timeZone: this.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
            let reason;
            if (d.pauseUntil > now) reason = 'paused after unanswered or interrupted question';
            else if (level === 'low' && candidate.type === 'held-object') reason = 'object questions disabled at low frequency';
            else if (counted.some(e => e.key === candidate.key && now - e.at < 86400000)) reason = 'topic already raised today';
            else if (last && now - last.at < rule.gap * (d.ignored ? 2 : 1)) reason = 'frequency cooldown';
            else if (counted.some(e => e.type === candidate.type && now - e.at < 1800000)) reason = 'same topic type cooldown';
            else if (counted.filter(e => day(e.at) === day(now)).length >= rule.cap) reason = 'daily budget reached';
            if (reason) return { reason };
            if (level === 'observe') return { reason: 'would ask (observation only)' };
            const token = crypto.randomUUID();
            d.entries.push({ key: candidate.key, type: candidate.type, at: now, token, outcome: 'claimed' }); d.entries = d.entries.slice(-256);
            await this.write(d); // Reserve before speaking: a crash must not cause a repeat.
            return { token, recentlyRaised: d.entries.slice(-6, -1).map(e => e.key) };
        });
    }
    outcome(token, outcome) {
        if (typeof token !== 'string' || !['answered','unanswered','interrupted','cancelled'].includes(outcome)) throw Error('Invalid curiosity outcome');
        return this.transaction(async () => {
            const d = await this.read(), entry = d.entries.find(e => e.token === token);
            if (!entry || entry.outcome !== 'claimed') return;
            entry.outcome = outcome;
            if (outcome === 'answered') d.ignored = 0;
            else if (outcome === 'interrupted') d.pauseUntil = this.now() + 900000;
            else if (outcome === 'unanswered') { d.ignored++; if (d.ignored >= 2) d.pauseUntil = this.now() + 3600000; }
            await this.write(d);
        });
    }
    clear() { return this.transaction(() => this.write(this.empty())); }
}
module.exports = { SceneDelta, CuriosityLedger, LEVELS };
