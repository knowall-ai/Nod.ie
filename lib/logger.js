const fs = require('node:fs');
const path = require('node:path');
class Logger {
    constructor(directory, maxBytes = 2 * 1024 * 1024) { this.directory = directory; this.maxBytes = maxBytes; this.recent = []; }
    write(level, event, fields = {}) {
        // An allowlist deliberately excludes arbitrary messages, stacks, URLs, audio and transcripts.
        const entry = { at: new Date().toISOString(), level: ['info', 'warn', 'error'].includes(level) ? level : 'info', event: /^[a-z0-9_.-]{1,80}$/.test(event) ? event : 'unknown' };
        for (const key of ['stage', 'code', 'status', 'durationMs', 'count']) {
            const value = fields[key];
            if (typeof value === 'number' && Number.isFinite(value)) entry[key] = value;
            else if (typeof value === 'string' && /^[a-zA-Z0-9_.-]{1,80}$/.test(value)) entry[key] = value;
        }
        this.recent.push(entry); this.recent = this.recent.slice(-100);
        try {
            fs.mkdirSync(this.directory, { recursive: true, mode: 0o700 });
            const file = path.join(this.directory, 'nodie.jsonl');
            if (fs.existsSync(file) && fs.statSync(file).size >= this.maxBytes) fs.renameSync(file, file + '.1');
            fs.appendFileSync(file, JSON.stringify(entry) + '\n', { mode: 0o600 });
        } catch { if (!this.warned) { this.warned = true; console.warn('Nod.ie diagnostic log is unavailable.'); } }
        return entry;
    }
    summary() { return this.recent.filter(entry => entry.level !== 'info').slice(-10); }
}
module.exports = { Logger };
