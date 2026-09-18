/** Optional neural rendering. Failure must leave the synthesized voice usable. */
async function renderSpeech(audio, { url, signal, videoOnly = false, trim, fetchImpl = fetch }) {
    const endpoint = new URL(url);
    if (!['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw new Error('Invalid lip-sync endpoint');
    const response = await fetchImpl(endpoint.href.replace(/\/$/, '') + '/render', {
        method: 'POST', headers: { 'Content-Type': 'audio/wav', ...(videoOnly ? { 'X-Nodie-Video-Only': '1' } : {}), ...(trim ? {'X-Nodie-Start-Frame': String(trim.startFrame), 'X-Nodie-Frame-Count': String(trim.frameCount)} : {}) }, body: audio,
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(45000)]) : AbortSignal.timeout(45000)
    });
    if (!response.ok || response.headers.get('content-type')?.split(';')[0] !== 'video/mp4') throw new Error('Lip-sync service unavailable');
    const reader = response.body.getReader(), chunks = []; let length = 0;
    try {
        while (true) {
            const { done, value } = await reader.read(); if (done) break;
            length += value.byteLength;
            if (length > 20 * 1024 * 1024) throw new Error('Lip-sync video exceeds limit');
            chunks.push(value);
        }
    } catch (error) { await reader.cancel().catch(() => {}); throw error; }
    finally { reader.releaseLock(); }
    const video = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { video.set(chunk, offset); offset += chunk.length; }
    if (length < 12 || String.fromCharCode(...video.subarray(4, 8)) !== 'ftyp') throw new Error('Invalid lip-sync video');
    return video;
}
module.exports = { renderSpeech };
