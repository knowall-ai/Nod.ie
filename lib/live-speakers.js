/** Only one small microphone sample may enter local inference at a time. */
class LiveSpeakers {
    constructor(recognition, { timeoutMs = 1800 } = {}) { this.timeoutMs = timeoutMs; this.recognition = recognition; this.controller = null; }
    cancel() { this.controller?.abort(); }
    async analyse(audio) {
        if (!(audio instanceof Uint8Array) || audio.byteLength < 100 || audio.byteLength > 256000) throw new Error('Invalid speaker recording');
        if (this.controller) return null;
        const controller = this.controller = new AbortController();
        let timer;
        const stopped = new Promise(resolve => controller.signal.addEventListener('abort', () => resolve(null), { once: true }));
        timer = setTimeout(() => controller.abort(), this.timeoutMs);
        const operation = Promise.resolve().then(() => this.recognition.analyse(Buffer.from(audio), controller.signal, { enrol: false })).finally(() => {
            if (this.controller === controller) this.controller = null;
        });
        try {
            const result = await Promise.race([operation, stopped]);
            if (!result || controller.signal.aborted || result.state !== 'ready') return null;
            return { speakers: result.speakers.map(({ name, uncertain }) => ({ name: name || null, uncertain: Boolean(uncertain) })), attribution: result.transcriptAttribution };
        } finally { clearTimeout(timer); }
    }
}
module.exports = { LiveSpeakers };
