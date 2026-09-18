const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { setTimeout: delay } = require('node:timers/promises');
class ConversationHistory {
    constructor(file) { this.file = file; }
    async transaction(callback) {
        await fs.mkdir(path.dirname(this.file), { recursive: true, mode: 0o700 });
        const lock = this.file + '.lock'; let handle;
        for (let attempt = 0; attempt < 40 && !handle; attempt++) {
            try { handle = await fs.open(lock, 'wx', 0o600); }
            catch (error) {
                if (error.code !== 'EEXIST') throw error;
                try { if (Date.now() - (await fs.stat(lock)).mtimeMs > 30000) await fs.unlink(lock); } catch (error) { if (error.code !== 'ENOENT') throw error; }
                await delay(50);
            }
        }
        if (!handle) throw new Error('Conversation history is busy');
        try { return await callback(); } finally { await handle.close(); await fs.unlink(lock).catch(() => {}); }
    }
    async read() {
        let data;
        try {
            if ((await fs.stat(this.file)).size > 64000) throw new Error('Conversation history exceeds size limit');
            data = JSON.parse(await fs.readFile(this.file, 'utf8'));
        } catch (error) { if (error.code !== 'ENOENT') throw error; }
        if (!data) return null;
        if (data.version !== 1 || typeof data.epoch !== 'string' || !Array.isArray(data.turns) || data.turns.length > 12 || data.turns.some(t => !['user', 'assistant'].includes(t.role) || typeof t.content !== 'string' || t.content.length > 2000)) throw new Error('Invalid conversation history');
        return data;
    }
    async write(data) {
        const temp = this.file + '.' + crypto.randomUUID() + '.tmp';
        try { await fs.writeFile(temp, JSON.stringify(data), { mode: 0o600, flag: 'wx' }); await fs.rename(temp, this.file); }
        finally { await fs.unlink(temp).catch(() => {}); }
    }
    empty() { return { version: 1, epoch: crypto.randomUUID(), updatedAt: new Date().toISOString(), turns: [] }; }
    load() { return this.transaction(async () => { let data = await this.read(); if (!data) { data = this.empty(); await this.write(data); } return data; }); }
    append(epoch, user, assistant) {
        return this.transaction(async () => {
            const data = await this.read();
            // A clear in another process invalidates in-flight turns too.
            if (!data || data.epoch !== epoch) return data || this.empty();
            data.turns = [...data.turns, { role: 'user', content: user.slice(0, 2000) }, { role: 'assistant', content: assistant.slice(0, 2000) }].slice(-12);
            data.updatedAt = new Date().toISOString(); await this.write(data); return data;
        });
    }
    upsert(epoch, turn) {
        if (typeof epoch !== 'string' || epoch.length > 100 || !turn ||
            typeof turn.id !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(turn.id) ||
            !['user', 'assistant'].includes(turn.role) || typeof turn.content !== 'string' ||
            !turn.content.trim() || turn.content.length > 2000) throw new Error('Invalid transcript');
        return this.transaction(async () => {
            const data = await this.read();
            if (!data || data.epoch !== epoch) return { epoch: data?.epoch, saved: false };
            const previous = data.turns.find(t => t.id === turn.id);
            if (previous && previous.role !== turn.role) throw new Error('Invalid transcript role');
            if (previous) previous.content = turn.content;
            else data.turns.push({ id: turn.id, role: turn.role, content: turn.content, at: new Date().toISOString() });
            data.turns = data.turns.slice(-12);
            data.updatedAt = new Date().toISOString();
            while (Buffer.byteLength(JSON.stringify(data)) > 60000) data.turns.shift();
            await this.write(data);
            return { epoch: data.epoch, saved: true };
        });
    }
    clear() { return this.transaction(async () => { const data = this.empty(); await this.write(data); return data; }); }
}
module.exports = { ConversationHistory };
