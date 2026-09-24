/** Optional neural rendering. Failure must leave the synthesized voice usable. */
const VIDEO_ONLY_HEADER = 'X-Nodie-Video-Only';
const VIDEO_ONLY_VALUE = '1';
async function renderSpeech(audio, options) {
    if (!options || typeof options !== 'object' || Array.isArray(options) || Object.keys(options).some(key => !['url', 'signal', 'videoOnly', 'trim', 'fetchImpl'].includes(key))) throw new Error('Invalid lip-sync options');
    const { url, signal, videoOnly = false, trim, fetchImpl = fetch } = options;
    if (typeof fetchImpl !== 'function') throw new Error('Invalid lip-sync options');
    if (typeof videoOnly !== 'boolean') throw new Error('Invalid video-only option');
    if (trim !== undefined && (!trim || typeof trim !== 'object' || Array.isArray(trim) || Object.keys(trim).some(key => !['startFrame', 'frameCount'].includes(key)) || !Number.isInteger(trim.startFrame) || trim.startFrame < 0 || trim.startFrame > 8 || !Number.isInteger(trim.frameCount) || trim.frameCount < 1 || trim.frameCount > 33)) throw new Error('Invalid lip-sync frame range');
    const endpoint = new URL(url);
    if (!['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw new Error('Invalid lip-sync endpoint');
    const response = await fetchImpl(endpoint.href.replace(/\/$/, '') + '/render', {
        method: 'POST', headers: { 'Content-Type': 'audio/wav', ...(videoOnly ? { [VIDEO_ONLY_HEADER]: VIDEO_ONLY_VALUE } : {}), ...(trim ? { 'X-Nodie-Start-Frame': String(trim.startFrame), 'X-Nodie-Frame-Count': String(trim.frameCount) } : {}) }, body: audio,
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
module.exports = { renderSpeech, VIDEO_ONLY_HEADER, VIDEO_ONLY_VALUE };
