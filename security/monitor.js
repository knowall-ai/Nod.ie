const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const runFile = promisify(execFile);
const INTERVAL = 6 * 60 * 60 * 1000;
const SOURCES = {
    'elementsproject/lightningd': { repo: 'ElementsProject/lightning', title: 'Core Lightning', guide: 'https://docs.corelightning.org/docs/installation' },
    'btcpayserver/btcpayserver': { repo: 'btcpayserver/btcpayserver', title: 'BTCPay Server', guide: 'https://docs.btcpayserver.org/Docker/updating/', managed: true },
    'lightninglabs/lnd': { repo: 'lightningnetwork/lnd', title: 'LND', guide: 'https://docs.lightning.engineering/lightning-network-tools/lnd/run-lnd' },
    'bitcoin/bitcoin': { repo: 'bitcoin/bitcoin', title: 'Bitcoin Core', guide: 'https://bitcoincore.org/en/download/' },
    'ollama/ollama': { repo: 'ollama/ollama', title: 'Ollama', guide: 'https://docs.ollama.com/docker' },
    'lnbits/lnbits': { repo: 'lnbits/lnbits', title: 'LNbits', guide: 'https://docs.lnbits.org/guide/installation.html' },
    'n8nio/n8n': { repo: 'n8n-io/n8n', title: 'n8n', guide: 'https://docs.n8n.io/hosting/installation/docker/' }
};
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
function splitImage(image) {
    let ref = image.replace(/^docker\.io\//, '');
    if (ref.includes('@')) return { repository: ref.split('@')[0], tag: null };
    const colon = ref.lastIndexOf(':');
    return colon > ref.lastIndexOf('/') ? { repository: ref.slice(0, colon), tag: ref.slice(colon + 1) } : { repository: ref, tag: 'latest' };
}
function version(text) { const match = /^(?:v|n8n@)?(\d+)\.(\d+)(?:\.(\d+))?(?:-beta)?$/.exec(text || ''); return match ? match.slice(1).map(x => Number(x || 0)) : null; }
function compare(a, b) { const x = version(a), y = version(b); if (!x || !y) return null; for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return Math.sign(x[i] - y[i]); return 0; }
async function docker(args, options = {}) {
    try { return (await runFile('docker', args, { timeout: 20000, maxBuffer: 2 * 1024 * 1024, ...options })).stdout.trim(); }
    catch { throw new Error(`Docker ${args[0]} failed or timed out; check Docker access and connectivity.`); }
}
class SecurityMonitor {
    constructor({ stateDir, onChange = () => {}, notify = () => {}, run = docker, fetchJSON, now = () => Date.now() }) {
        Object.assign(this, { stateDir, onChange, notify, run, now });
        this.fetchJSON = fetchJSON || (async url => { const response = await fetch(url, { headers: { 'User-Agent': 'Nodie-security-monitor', Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(10000), redirect: 'error' }); if (!response.ok) throw new Error(`Release feed unavailable (${response.status})`); return response.json(); });
        this.current = { state: 'not-checked', containers: [], checkedAt: null, lastSuccessfulAt: null, intervalHours: 6 };
        this.dismissed = {}; this.plans = new Map(); this.busy = false;
    }
    async start() {
        try { const data = JSON.parse(await fs.readFile(path.join(this.stateDir, 'status.json'), 'utf8')); this.dismissed = data.dismissed || {}; this.current = { ...data.current, state: 'stale' }; } catch {}
        this.timer = setInterval(() => this.scan().catch(() => {}), INTERVAL); this.timer.unref?.();
        await this.scan();
    }
    stop() { clearInterval(this.timer); }
    status() { return structuredClone(this.current); }
    async persist() { await fs.mkdir(this.stateDir, { recursive: true, mode: 0o700 }); await fs.writeFile(path.join(this.stateDir, 'status.json'), JSON.stringify({ current: this.current, dismissed: this.dismissed }), { mode: 0o600 }); }
    async inventory() {
        const context = await this.run(['context', 'show']);
        const endpoint = await this.run(['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}', context]);
        const ids = (await this.run(['ps', '-q', '--no-trunc'])).split('\n').filter(Boolean);
        const containers = [];
        for (const id of ids) {
            if (!/^[a-f0-9]{64}$/.test(id)) continue;
            // Deliberately exclude environment variables, mounts and credentials.
            const format = '{"id":{{json .Id}},"name":{{json .Name}},"image":{{json .Config.Image}},"imageId":{{json .Image}},"project":{{json (index .Config.Labels "com.docker.compose.project")}},"service":{{json (index .Config.Labels "com.docker.compose.service")}},"files":{{json (index .Config.Labels "com.docker.compose.project.config_files")}},"cwd":{{json (index .Config.Labels "com.docker.compose.project.working_dir")}},"state":{{json .State.Status}}}';
            const item = JSON.parse(await this.run(['inspect', '--format', format, id]));
            const image = JSON.parse(await this.run(['image', 'inspect', '--format', '{"digests":{{json .RepoDigests}},"arch":{{json .Architecture}},"os":{{json .Os}}}', item.imageId]));
            containers.push({ ...item, ...image, name: item.name.replace(/^\//, ''), context, endpoint });
        }
        return containers;
    }
    scan() {
        if (this.scanning) return this.scanning;
        if (this.busy) return Promise.resolve(this.status());
        this.scanning = this.scanOnce().finally(() => { this.scanning = null; }); return this.scanning;
    }
    async scanOnce() {
        this.current.state = 'scanning'; this.onChange(this.status());
        try {
            const items = await this.inventory();
            const releases = new Map();
            for (const item of items) {
                const { repository, tag } = splitImage(item.image); const source = SOURCES[repository];
                item.status = 'unknown'; item.reason = 'No verified release adapter for this image; no automatic update proposed.';
                if (!source) continue;
                item.title = source.title; item.guide = source.guide;
                try {
                    if (!releases.has(source.repo)) releases.set(source.repo, this.fetchJSON(`https://api.github.com/repos/${source.repo}/releases/latest`));
                    const release = await releases.get(source.repo);
                    if (!release.tag_name || release.draft || release.prerelease) throw new Error('No stable release identified');
                    item.latest = release.tag_name; item.releaseUrl = `https://github.com/${source.repo}/releases`;
                    const comparison = compare(tag, release.tag_name);
                    item.status = comparison === -1 ? 'update-recommended' : comparison === 0 ? 'version-current' : 'unknown';
                    item.reason = comparison === -1 ? `A newer stable release (${release.tag_name}) is available. Review compatibility before changing version.` : comparison === 0 ? 'Version matches the latest stable release; this is not a full vulnerability assessment.' : 'The image tag cannot establish the running application version.';
                    // Floating tags must be checked by digest; release numbers alone are insufficient.
                    if (tag) {
                        try {
                            const target = await this.manifest(item.image);
                            item.targetDigest = target.digest;
                            const matches = (item.digests || []).some(d => target.digests.includes(d.split('@')[1]));
                            item.digestMatches = matches;
                            if (!matches) { item.status = 'update-recommended'; item.reason += ' The registry image for the configured tag differs from the running image.'; }
                            else if (comparison === null) { item.status = 'image-current'; item.reason = 'Running digest matches the configured registry tag. A pinned older version may still require an upgrade.'; }
                        } catch { item.reason += ' Registry digest verification unavailable.'; if (comparison !== -1) item.status = 'unknown'; }
                    }
                    if (repository === 'elementsproject/lightningd' && tag?.replace(/^v/, '') === '26.06.7') {
                        const fixed = 'sha256:0421a5f0d1b2e1ad639edfa17d777816040e3850d91bae7f2d32186d9c1e6da4';
                        if (!(item.digests || []).some(d => d.endsWith('@' + fixed))) {
                            item.status = 'security-review'; item.reason = 'CLN 26.06.7 initially shipped incorrectly tagged images. Verify against the corrected manifest before treating this installation as patched.';
                            item.advisory = 'https://github.com/ElementsProject/lightning/releases/tag/v26.06.7';
                        }
                    }
                    if (repository === 'btcpayserver/btcpayserver' && (compare(tag, '2.4.2') === -1 || /^v?2\.4\.2-rc/i.test(tag || ''))) {
                        item.status = 'security-review'; item.reason = 'Affected by the BTCPay credential-exposure advisory. LND deployments require urgent patching, credential rotation and activity review; inspect the entire stack.';
                        item.advisory = 'https://blog.btcpayserver.org/security-advisory-btcpay-server-2-4-2/';
                    }
                } catch { item.status = 'unknown'; item.reason = 'Official release check failed. Do not assume this service is patched.'; }
                item.recommendationId = hash([item.id, item.imageId, item.latest, item.targetDigest, item.status]);
            }
            const now = new Date(this.now()).toISOString();
            this.current = { state: items.some(i => i.status === 'unknown') ? 'partial' : 'checked', containers: items, checkedAt: now, lastSuccessfulAt: now, intervalHours: 6, context: items[0]?.context || null };
            const alerts = items.filter(i => ['update-recommended', 'security-review'].includes(i.status) && !this.dismissed[i.recommendationId]);
            if (alerts.length) { this.notify(alerts.length); for (const item of alerts) this.dismissed[item.recommendationId] = now; }
        } catch (error) { this.current = { ...this.current, state: 'unknown', error: error.message, checkedAt: new Date(this.now()).toISOString() }; }
        await this.persist(); this.onChange(this.status()); return this.status();
    }
    async manifest(reference) {
        if (!/^[a-zA-Z0-9][a-zA-Z0-9./_:@-]+$/.test(reference)) throw new Error('Invalid image reference');
        const manifest = JSON.parse(await this.run(['buildx', 'imagetools', 'inspect', reference, '--format', '{{json .Manifest}}']));
        if (!/^sha256:[a-f0-9]{64}$/.test(manifest.digest || '')) throw new Error('Registry did not return a digest');
        return { digest: manifest.digest, digests: [manifest.digest, ...(manifest.manifests || []).map(m => m.digest)] };
    }
    async dismiss(id) { this.dismissed[id] = new Date(this.now()).toISOString(); await this.persist(); return this.status(); }
    async fileState(item) {
        if (!item.endpoint?.startsWith('unix://') || process.env.DOCKER_HOST || !item.cwd || !path.isAbsolute(item.cwd)) throw new Error('Automatic apply requires a local Docker context and Compose project');
        const files = (item.files || '').split(',');
        if (!files.length || files.some(f => !path.isAbsolute(f))) throw new Error('Compose source files unavailable');
        const entries = [];
        for (const file of [...files, path.join(item.cwd, '.env')]) {
            try { entries.push([file, hash(await fs.readFile(file))]); } catch (error) { if (error.code === 'ENOENT' && file.endsWith('/.env')) entries.push([file, null]); else throw error; }
        }
        // Compose resolves env_file, includes and interpolation. Hash the resolved
        // result in memory only: it can contain credentials and must never be logged.
        const resolved = await this.run(['--context', item.context, 'compose', '--project-directory', item.cwd, '-p', item.project, ...files.flatMap(file => ['-f', file]), 'config', '--format', 'json'], { cwd: item.cwd });
        const service = JSON.parse(resolved).services?.[item.service];
        if (!service) throw new Error('Compose service is no longer defined');
        return { files, fingerprint: hash([entries, resolved]) };
    }
    async prepare(id) {
        if (this.busy) throw new Error('An update is already in progress');
        const item = this.current.containers.find(i => i.id === id);
        if (!item || !['update-recommended', 'security-review'].includes(item.status)) throw new Error('No current recommendation for this container');
        if (this.now() - Date.parse(this.current.checkedAt) > INTERVAL || this.current.state === 'unknown') throw new Error('Run a fresh scan first');
        const source = SOURCES[splitImage(item.image).repository];
        const plan = { id: crypto.randomUUID(), container: structuredClone(item), name: item.name, guide: source.guide, executable: false, createdAt: this.now(), summary: item.reason };
        // Only refresh a configured tag. Version changes and managed BTCPay stacks use their official upgrade path.
        try {
            const inManagedStack = source.managed || this.current.containers.some(other => other.project === item.project && splitImage(other.image).repository === 'btcpayserver/btcpayserver');
            if (inManagedStack || !item.project || !item.service || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(item.service) || !/^[a-z0-9][a-z0-9_-]*$/.test(item.project) || !item.targetDigest || item.digestMatches) throw new Error('Use the official deployment upgrade procedure');
            const target = await this.manifest(item.image);
            if (target.digest !== item.targetDigest) throw new Error('Registry changed; scan again');
            Object.assign(plan, await this.fileState(item));
            plan.target = splitImage(item.image).repository + '@' + target.digest;
            plan.executable = true;
            plan.summary += `\n\nContext: ${item.context}\nService: ${item.project}/${item.service}\nCurrent image: ${item.imageId}\nTarget: ${plan.target}\nOnly the existing tag is refreshed. Review upstream migration and recovery requirements.`;
        } catch (error) { plan.summary += '\n\n' + error.message + '. Open the official update guide.'; }
        this.plans.set(plan.id, plan); return this.publicPlan(plan);
    }
    publicPlan(plan) { return { id: plan.id, name: plan.name, executable: plan.executable, guide: plan.guide, summary: plan.summary }; }
    getPlan(id) { const plan = this.plans.get(id); if (!plan || this.now() - plan.createdAt > 10 * 60 * 1000) throw new Error('Update plan expired; review again'); return this.publicPlan(plan); }
    async apply(id) {
        this.getPlan(id);
        const plan = this.plans.get(id);
        if (!plan.executable || this.busy) throw new Error('Update cannot be applied');
        this.busy = true; this.plans.delete(id);
        let phase = 'preflight';
        try {
            const inventory = await this.inventory();
            const item = inventory.find(i => i.id === plan.container.id);
            if (!item || hash(item) !== hash(Object.fromEntries(Object.keys(item).map(key => [key, plan.container[key]])))) throw new Error('Container changed; scan and review again');
            if ((await this.fileState(item)).fingerprint !== plan.fingerprint) throw new Error('Compose configuration changed; review again');
            const context = ['--context', item.context];
            phase = 'pull';
            await this.run([...context, 'pull', plan.target], { timeout: 10 * 60 * 1000 });
            if ((await this.fileState(item)).fingerprint !== plan.fingerprint) throw new Error('Compose configuration changed during download');
            const override = path.join(this.stateDir, `approved-${id}.json`);
            await fs.mkdir(this.stateDir, { recursive: true, mode: 0o700 });
            await fs.writeFile(override, JSON.stringify({ services: { [item.service]: { image: plan.target } } }), { mode: 0o600 });
            const args = [...context, 'compose', '--project-directory', item.cwd, '-p', item.project, ...plan.files.flatMap(file => ['-f', file]), '-f', override, 'up', '-d', '--no-deps', '--no-build', '--pull', 'never', '--wait', '--wait-timeout', '120', item.service];
            phase = 'restart'; await this.run(args, { timeout: 180000, cwd: item.cwd });
            phase = 'verification';
            const expectedId = await this.run([...context, 'image', 'inspect', '--format', '{{.Id}}', plan.target]);
            const next = (await this.inventory()).find(i => i.project === item.project && i.service === item.service);
            if (!next || next.imageId !== expectedId || next.state !== 'running') throw new Error('Running image could not be verified');
            await this.audit({ id, name: item.name, target: plan.target, outcome: 'verified', override });
            return { status: 'verified', message: 'Pinned image is running and Compose health checks passed where defined. Application-level validation is still required. The approved override is retained for subsequent Compose operations.' };
        } catch (error) { await this.audit({ id, name: plan.name, outcome: 'failed', phase }); throw new Error(`Update failed during ${phase}. Inspect the service; no automatic rollback was attempted. ${error.message}`); }
        finally { this.busy = false; await this.scan(); }
    }
    async audit(entry) { await fs.mkdir(this.stateDir, { recursive: true, mode: 0o700 }); await fs.appendFile(path.join(this.stateDir, 'audit.jsonl'), JSON.stringify({ at: new Date(this.now()).toISOString(), ...entry }) + '\n', { mode: 0o600 }); }
}
module.exports = { SecurityMonitor, splitImage, compare, SOURCES, INTERVAL };
