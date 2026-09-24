/** Independent bounded recordings; never delay the Unmute audio transport. */
class StreamSpeakers {
    constructor(api, publish, { Recorder = globalThis.MediaRecorder, duration = 4000 } = {}) {
        if (!Number.isInteger(duration) || duration < 1 || duration > 4000) throw new Error('Invalid speaker recording duration');
        Object.assign(this, { api, publish, Recorder, duration }); this.generation = 0;
    }
    emit(observation) {
        const encoded = JSON.stringify(observation);
        if (encoded === this.lastObservation) return;
        this.lastObservation = encoded; this.publish(observation);
    }
    start(stream) { this.stop(); this.stream = stream; const generation = this.generation; void this.cycle(generation); }
    async cycle(generation) {
        try {
            const { enabled } = await this.api.liveSpeakerStatus();
            if (generation !== this.generation) return;
            if (enabled) {
                const audio = await this.record(generation);
                if (generation !== this.generation) return;
                const result = await this.api.analyseSpeakers(new Uint8Array(await audio.arrayBuffer()));
                if (generation === this.generation) this.emit(result);
            } else this.emit(null);
        } catch { if (generation === this.generation) this.emit(null); }
        finally { if (generation === this.generation) this.retry = setTimeout(() => this.cycle(generation), 500); }
    }
    record(generation) {
        return new Promise((resolve, reject) => {
            const recorder = this.recorder = new this.Recorder(this.stream, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 32000 });
            const chunks = []; let bytes = 0;
            recorder.ondataavailable = event => { bytes += event.data.size; if (bytes <= 256000) chunks.push(event.data); };
            recorder.onerror = () => { clearTimeout(this.timer); reject(new Error('Recording unavailable')); };
            recorder.onstop = () => { clearTimeout(this.timer); this.recorder = null; if (generation !== this.generation || bytes > 256000) reject(new Error('Recording cancelled')); else resolve(new Blob(chunks, { type: recorder.mimeType })); };
            recorder.start(); this.timer = setTimeout(() => { if (recorder.state !== 'inactive') recorder.stop(); }, this.duration);
        });
    }
    stop() {
        ++this.generation; clearTimeout(this.timer); clearTimeout(this.retry);
        if (this.recorder?.state !== 'inactive') { try { this.recorder?.stop(); } catch {} }
        this.recorder = null; this.stream = null;
        this.api.cancelSpeakers().catch(() => {}); this.emit(null);
    }
}
if (typeof module !== 'undefined') module.exports = StreamSpeakers;
else window.StreamSpeakers = StreamSpeakers;
