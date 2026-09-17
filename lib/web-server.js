const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { normalize } = require('./config-schema');
const CSP = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' ws: wss: http: https:; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'";
const files = new Set(['index.html', 'browser-bridge.js', 'renderer.js', 'renderer.css', 'config-web.js', 'lib/config-schema.js', 'modules/audio-capture-web.js', 'modules/audio-playback-web.js', 'modules/avatar-manager.js', 'modules/musetalk-websocket-client.js', 'modules/websocket-handler.js', 'modules/local-voice-session.js', 'modules/desktop-drag.js', 'audio-output-processor.js', 'decoderWorker.min.js', 'decoderWorker.min.wasm', 'encoderWorker.min.js', 'node_modules/opus-recorder/dist/recorder.min.js', 'tests/test-web.html', 'favicon.ico']);
function createServer({ root = path.resolve(__dirname, '..'), config = require('../config'), voice, monitor, diagnostics, logger } = {}) {
    if (!voice && config.VOICE_MODE === 'local') voice = new (require('./local-voice').LocalVoice)();
    return http.createServer(async (req, res) => {
        res.setHeader('Content-Security-Policy', CSP);
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Cache-Control', 'no-store');
        const fail = (code) => { res.writeHead(code); res.end(http.STATUS_CODES[code]); };
        try {
            // Restrict Host too: a loopback listener alone does not prevent DNS rebinding.
            const host = new URL(`http://${req.headers.host || ''}`).hostname;
            if (!['localhost', '127.0.0.1', '[::1]'].includes(host)) return fail(403);
            if (req.url.startsWith('/voice/')) {
                if (!voice || req.method !== 'POST') return fail(405);
                if (req.headers.origin !== `http://${req.headers.host}` || (req.headers['sec-fetch-site'] && req.headers['sec-fetch-site'] !== 'same-origin')) return fail(403);
                res.setHeader('Content-Type', 'application/json');
                try {
                    if (req.url === '/voice/health') return res.end(JSON.stringify(await voice.health()));
                    if (req.url === '/voice/clear-history') return res.end(JSON.stringify(await voice.clearHistory()));
                    if (req.url === '/voice/cancel') { voice.cancel(); return res.end('{}'); }
                    if (req.url !== '/voice/turn') return fail(404);
                    const chunks = []; let length = 0;
                    for await (const chunk of req) { length += chunk.length; if (length > 5 * 1024 * 1024) return fail(413); chunks.push(chunk); }
                    const result = await voice.converse(new Uint8Array(Buffer.concat(chunks)));
                    return res.end(JSON.stringify({ ...result, audio: Buffer.from(result.audio).toString('base64'), video: result.video ? Buffer.from(result.video).toString('base64') : null }));
                } catch (error) { const safe = require('./voice-error').publicError(error); res.writeHead(safe.status); return res.end(JSON.stringify(safe)); }
            }
            if (!['GET', 'HEAD'].includes(req.method)) return fail(405);
            const raw = decodeURIComponent(req.url.split('?')[0]);
            if (!raw.startsWith('/') || raw.includes('\\') || raw.includes('\0') || raw.split('/').some(s => s === '..' || s.startsWith('.'))) return fail(403);
            if (raw === '/diagnostics/status') { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify(diagnostics ? diagnostics.status() : { state: 'not-running' })); }
            if (raw === '/security/status') {
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify(monitor ? monitor.status() : { state: 'not-running', containers: [] }));
            }
            if (raw === '/env-config.js') {
                res.setHeader('Content-Type', 'application/javascript');
                return res.end(req.method === 'HEAD' ? undefined : `window.ENV_CONFIG = ${JSON.stringify(normalize(config))};`);
            }
            if (raw === '/system-prompt') {
                res.setHeader('Content-Type', 'text/plain; charset=utf-8');
                return res.end(req.method === 'HEAD' ? undefined : await fs.readFile(path.join(root, 'SYSTEM-PROMPT.md')));
            }
            const name = raw === '/' ? 'index.html' : raw.slice(1);
            if (!files.has(name) && !/^assets\/avatars\/[a-zA-Z0-9_-]+\.(png|jpg|jpeg|mp4|webm)$/.test(name)) return fail(404);
            const realRoot = await fs.realpath(root);
            const file = await fs.realpath(path.join(root, name));
            if (!file.startsWith(realRoot + path.sep)) return fail(403);
            const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.mp4': 'video/mp4', '.webm': 'video/webm' };
            res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
            res.end(req.method === 'HEAD' ? undefined : await fs.readFile(file));
        } catch (error) { if (!res.headersSent) fail(error.code === 'ENOENT' ? 404 : 400); else res.end(); }
    });
}
function start() {
    const config = require('../config');
    const port = Number(config.WEB_TEST_PORT || 8095);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid WEB_TEST_PORT');
    const { SecurityMonitor } = require('../security/monitor');
    const { execFile } = require('node:child_process');
    const monitor = new SecurityMonitor({ stateDir: path.join(require('node:os').homedir(), '.config/nodie/security'), notify: count => execFile('notify-send', ['Nod.ie: updates recommended', `${count} container update recommendation(s). Review in Nod.ie Settings.`], () => {}) });
    const logger = new (require('./logger').Logger)(path.join(require('node:os').homedir(), '.config/nodie/logs'));
    const diagnostics = new (require('./diagnostics').Diagnostics)({ logger, notify: count => execFile('notify-send', ['Nod.ie: activity needs attention', `${count} health/activity signal(s). Ask Nod.ie or inspect Settings.`], () => {}) });
    const historyStore = new (require('./conversation-history').ConversationHistory)(path.join(require('node:os').homedir(), '.config/nodie/conversations/local.json'));
    const voice = config.VOICE_MODE === 'local' ? new (require('./local-voice').LocalVoice)({ logger, historyStore, diagnostics: () => diagnostics.status() }) : undefined;
    const server = createServer({ config, monitor, diagnostics, logger });
    diagnostics.start();
    logger.write('info', 'web.started');
    monitor.start().catch(() => logger.write('error', 'updates.monitor-failed'));
    server.on('close', () => { monitor.stop(); diagnostics.stop(); voice?.close().catch(() => {}); });
    server.listen(port, '127.0.0.1', () => console.log(`Nod.ie: http://127.0.0.1:${port}`));
    return server;
}
module.exports = { createServer, start, CSP };
