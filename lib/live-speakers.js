/** Only one small microphone sample may enter local inference at a time. */
class LiveSpeakers {
    constructor(recognition) { this.recognition = recognition; this.controller = null; }
    cancel() { this.controller?.abort(); }
    async analyse(audio) {
        if (!(audio instanceof Uint8Array) || audio.byteLength < 100 || audio.byteLength > 256000) throw new Error('Invalid speaker recording');
        if (this.controller) return null;
        const controller = this.controller = new AbortController();
        try {
            const result = await this.recognition.analyse(Buffer.from(audio), controller.signal);
            if (controller.signal.aborted || result.state !== 'ready') return null;
            return { speakers: result.speakers.map(({ name, uncertain }) => ({ name: name || null, uncertain: Boolean(uncertain) })), attribution: result.transcriptAttribution };
        } finally { if (this.controller === controller) this.controller = null; }
    }
}
module.exports = { LiveSpeakers };
