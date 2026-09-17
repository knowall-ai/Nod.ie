/** Shared realtime connection with one socket, bounded backoff and intentional shutdown. */
class WebSocketHandler {
    constructor(config, callbacks = {}) { this.config = config; this.callbacks = callbacks; this.generation = 0; this.attempt = 0; this.closed = false; }
    connect() {
        if (this.closed || (this.ws && this.ws.readyState < 2)) return;
        const generation = ++this.generation;
        try {
            const ws = this.ws = new WebSocket(this.config.UNMUTE_BACKEND_URL.replace(/\/$/, '') + '/v1/realtime', ['realtime']);
            this.timeout = setTimeout(() => { if (generation === this.generation && ws.readyState === 0) ws.close(); }, 15000);
            ws.onopen = () => {
                clearTimeout(this.timeout);
                if (generation !== this.generation || this.closed) return;
                this.attempt = 0;
                this.send({ type: 'session.update', session: { model: this.config.LLM_MODEL, voice: this.config.VOICE_MODEL, allow_recording: false, instructions: { type: 'constant', text: this.config.SYSTEM_PROMPT } } });
                this.callbacks.onConnect?.();
            };
            ws.onmessage = event => {
                if (generation !== this.generation || this.closed) return;
                try { Promise.resolve(this.callbacks.onMessage?.(JSON.parse(event.data))).catch(error => this.callbacks.onError?.(error)); }
                catch (error) { this.callbacks.onError?.(error); }
            };
            ws.onerror = () => { if (generation === this.generation && !this.closed) this.callbacks.onError?.(new Error('Realtime connection failed')); };
            ws.onclose = () => {
                clearTimeout(this.timeout);
                if (generation !== this.generation || this.closed) return;
                this.ws = null;
                this.callbacks.onClose?.();
                this.scheduleReconnect();
            };
        } catch (error) { this.callbacks.onError?.(error); this.scheduleReconnect(); }
    }
    scheduleReconnect() {
        if (this.closed) return;
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = setTimeout(() => this.connect(), Math.min(30000, 1000 * 2 ** this.attempt++));
    }
    send(data) { if (this.ws?.readyState === 1) this.ws.send(typeof data === 'string' ? data : JSON.stringify(data)); }
    get readyState() { return this.ws?.readyState ?? 3; }
    close() {
        this.closed = true; ++this.generation;
        clearTimeout(this.timeout); clearTimeout(this.reconnectTimer);
        const ws = this.ws; this.ws = null;
        if (ws) { ws.onclose = null; ws.onmessage = null; ws.onopen = null; ws.onerror = null; ws.close(); }
    }
}
if (typeof module !== 'undefined' && module.exports) module.exports = WebSocketHandler;
else window.WebSocketHandler = WebSocketHandler;
