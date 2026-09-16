const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const fs = require('node:fs/promises');
const os = require('node:os');
const runFile = promisify(execFile);
const safeName = value => String(value || 'container').replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 80);
function changes(previous, current) {
    const alerts = [];
    for (const item of current) {
        const before = previous?.find(old => old.id === item.id);
        const add = (code, message) => alerts.push({ code, service: safeName(item.name), message });
        if (item.state === 'running' && item.health === 'unhealthy') add('unhealthy', 'Container health check is failing.');
        if (item.oom && item.state !== 'running') add('out-of-memory', 'Container was terminated for exceeding available memory.');
        if (before?.state === 'running' && ['exited', 'dead'].includes(item.state)) add('stopped', 'Previously running container has stopped; check whether this was intentional.');
        if (before && item.restarts > before.restarts) add(item.restarts - before.restarts >= 3 ? 'restart-loop' : 'restarted', 'Container restarted since the previous sample.');
        if (previous && !before && item.state === 'running') add('new-container', 'A new running container appeared; this may be an expected deployment.');
    }
    return alerts;
}
class Diagnostics {
    constructor({ logger, notify = () => {}, run = runFile, interval = 60000 }) {
        Object.assign(this, { logger, notify, run, interval });
        this.current = { state: 'not-checked', checkedAt: null, alerts: [], scope: 'Container health and host resource signals; not intrusion detection.' };
        this.alerts = new Map(); this.pressure = 0;
    }
    status() { return structuredClone({ ...this.current, recentErrors: this.logger.summary() }); }
    start() { this.timer = setInterval(() => this.scan(), this.interval); this.timer.unref?.(); return this.scan(); }
    stop() { clearInterval(this.timer); }
    scan() { if (!this.scanning) this.scanning = this.sample().finally(() => { this.scanning = null; }); return this.scanning; }
    async sample() {
        try {
            const opts = { timeout: 10000, maxBuffer: 1024 * 1024 };
            const ids = (await this.run('docker', ['ps', '-aq', '--no-trunc'], opts)).stdout.trim().split('\n').filter(id => /^[a-f0-9]{64}$/.test(id));
            if (ids.length > 500) throw new Error('Inventory exceeds monitoring limit');
            const format = '{"id":{{json .Id}},"name":{{json .Name}},"state":{{json .State.Status}},"health":{{with (index .State "Health")}}{{json .Status}}{{else}}null{{end}},"restarts":{{json .RestartCount}},"oom":{{json .State.OOMKilled}}}';
            const items = ids.length ? (await this.run('docker', ['inspect', '--format', format, ...ids], opts)).stdout.trim().split('\n').filter(Boolean).map(line => JSON.parse(line)) : [];
            const now = Date.now(); const events = changes(this.previous, items); this.previous = items;
            let available = os.freemem();
            if (process.platform === 'linux') { const mem = await fs.readFile('/proc/meminfo', 'utf8'); const match = /^MemAvailable:\s+(\d+) kB/m.exec(mem); if (match) available = Number(match[1]) * 1024; }
            const pressure = available < Math.max(1024 ** 3, os.totalmem() * 0.05) || os.loadavg()[0] > os.cpus().length * 1.5;
            this.pressure = pressure ? this.pressure + 1 : 0;
            if (this.pressure >= 3) events.push({ code: 'resource-pressure', service: 'host', message: 'Memory availability or system load has exceeded the threshold for three samples.' });
            let count = 0;
            for (const event of events) {
                const key = event.service + ':' + event.code;
                if (!this.alerts.has(key) || now - this.alerts.get(key).lastNotified > 60 * 60 * 1000) { count++; this.logger.write('warn', 'diagnostics.alert', { code: event.code }); event.lastNotified = now; }
                this.alerts.set(key, { ...event, lastNotified: event.lastNotified || this.alerts.get(key).lastNotified, at: new Date(now).toISOString() });
            }
            for (const [key, event] of this.alerts) if (now - Date.parse(event.at) > 60 * 60 * 1000) this.alerts.delete(key);
            if (count) this.notify(count);
            this.current = { ...this.current, state: 'checked', checkedAt: new Date(now).toISOString(), containers: items.length, alerts: [...this.alerts.values()].slice(-20), availableMemoryMB: Math.round(available / 1024 ** 2), load1m: os.loadavg()[0] };
        } catch { this.current = { ...this.current, state: 'unavailable', checkedAt: new Date().toISOString() }; this.logger.write('warn', 'diagnostics.unavailable', { code: 'inventory-failed' }); }
        return this.status();
    }
}
module.exports = { Diagnostics, changes };
