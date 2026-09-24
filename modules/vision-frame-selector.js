/** Cheap CPU gate for vision inference; change is a trigger, not semantic interest. */
class VisionFrameSelector {
    constructor({ cooldownMs = 5000, refreshMs = 60000, settleMs = 500, maxWaitMs = 2500 } = {}) {
        for (const value of [cooldownMs, refreshMs, settleMs, maxWaitMs]) {
            if (!Number.isFinite(value) || value < 0) throw new Error('Invalid frame timing');
        }
        if (refreshMs < cooldownMs || maxWaitMs < settleMs) throw new Error('Invalid frame timing order');
        Object.assign(this, { cooldownMs, refreshMs, settleMs, maxWaitMs });
        this.reset();
    }
    reset() {
        this.reference = this.previous = null;
        this.lastSelected = -Infinity; this.lastTime = -Infinity;
        this.pendingSince = this.stableSince = null;
    }
    static difference(a, b) {
        // Median luminance shift suppresses near-uniform auto-exposure changes.
        const histogram = new Uint32Array(511);
        const luminance = (p, i) => Math.round((p[i] + 2 * p[i + 1] + p[i + 2]) / 4);
        const pixels = a.length / 4;
        for (let i = 0; i < a.length; i += 4) histogram[luminance(b, i) - luminance(a, i) + 255]++;
        let count = 0, shift = 0;
        for (let i = 0; i < histogram.length; i++) {
            count += histogram[i];
            if (count >= pixels / 2) { shift = i - 255; break; }
        }
        let changed = 0, total = 0;
        for (let i = 0; i < a.length; i += 4) {
            const delta = Math.max(...[0, 1, 2].map(c => Math.abs(b[i + c] - a[i + c] - shift)));
            total += delta;
            if (delta > 18) changed++;
        }
        return { fraction: changed / pixels, mean: total / pixels };
    }
    select(rgba, now, requested = false) {
        if (!(rgba instanceof Uint8ClampedArray) || rgba.length !== 64 * 48 * 4 || !Number.isFinite(now) || now < this.lastTime) throw new Error('Invalid comparison frame');
        this.lastTime = now;
        const changed = this.reference && VisionFrameSelector.difference(this.reference, rgba);
        const moving = this.previous && VisionFrameSelector.difference(this.previous, rgba);
        this.previous = rgba.slice();
        const significant = changed && changed.fraction >= .08 && changed.mean >= 3;
        const motion = moving && moving.fraction >= .025 && moving.mean >= 1;
        const refresh = now - this.lastSelected >= this.refreshMs;
        if (motion || this.stableSince === null) this.stableSince = now;
        if (!this.reference || significant || refresh) this.pendingSince ??= now;
        else this.pendingSince = null;
        const ready = this.pendingSince !== null && (now - this.stableSince >= this.settleMs || now - this.pendingSince >= this.maxWaitMs);
        let reason = null;
        if (requested) reason = 'requested';
        else if (ready && now - this.lastSelected >= this.cooldownMs) reason = !this.reference ? 'initial' : significant ? 'change' : 'refresh';
        if (!reason) return null;
        this.reference = rgba.slice(); this.lastSelected = now; this.pendingSince = null;
        return { reason, changedFraction: changed?.fraction ?? 1 };
    }
}
if (typeof window !== 'undefined') window.VisionFrameSelector = VisionFrameSelector;
if (typeof module !== 'undefined') module.exports = VisionFrameSelector;
