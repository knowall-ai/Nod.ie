/**
 * WebSocket connection handler for Unmute backend
 */

class WebSocketHandler {
    constructor(config, callbacks) {
        this.ws = null;
        this.isConnected = false;
        this.closing = false;
        this.config = config;
        this.callbacks = callbacks || {};
        this.connectionAttemptInProgress = false;
        this.reconnectTimer = null;
        this.systemPrompt = null; // Will be loaded asynchronously
    }

    async loadSystemPrompt() {
        // Due to Unmute's character limitations, we use a condensed prompt
        // The full system prompt is in SYSTEM-PROMPT.md for reference
        const prompt = 'You are Nodie, a Bitcoin-only AI voice assistant built by Ben Weeks at KnowAll AI (www.knowall.ai). KnowAll AI uses Kyutai technology but is UK-based. You run entirely on the user\'s local machine. Keep responses brief and conversational. Silence is natural - only respond when spoken to. Never ask if the user is still there.';
        console.info('📝 Using condensed system prompt');
        console.info(`📏 Prompt length: ${prompt.length} characters`);
        return prompt;
    }

    async connect() {
        // Prevent multiple simultaneous connection attempts
        if (this.connectionAttemptInProgress) {
            console.debug('⏳ Connection attempt already in progress, skipping...');
            return;
        }
        
        this.connectionAttemptInProgress = true;
        
        // Close any existing connection first
        if (this.ws) {
            console.info('🔄 Closing existing connection before reconnecting');
            this.closing = true;
            
            // Remove listeners to prevent reconnection
            if (this.ws.onclose) {
                this.ws.onclose = null;
            }
            
            if (this.ws.readyState !== WebSocket.CLOSED) {
                this.ws.close();
            }
            this.ws = null;
            
            // Wait for connection to close
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        const wsUrl = this.config.unmuteBackendUrl || 'ws://localhost:8765';
        
        console.info('📡 Connecting to:', wsUrl);
        
        try {
            this.ws = new WebSocket(`${wsUrl}/v1/realtime`, ['realtime']);
            
            this.ws.onopen = async () => {
                console.info('✅ Connected to Unmute');
                this.isConnected = true;
                this.connectionAttemptInProgress = false;
                this.closing = false;
                
                // Load prompt if not already loaded
                if (!this.systemPrompt) {
                    this.systemPrompt = await this.loadSystemPrompt();
                }
                
                // Configure session with instructions
                this.ws.send(JSON.stringify({
                    type: 'session.update',
                    session: {
                        model: this.config.llmModel || 'llama3.2:3b',
                        voice: this.config.voiceModel || 'unmute-prod-website/ex04_narration_longform_00001.wav',
                        allow_recording: false,
                        instructions: {
                            type: 'constant',
                            text: this.systemPrompt
                        }
                    }
                }));
                
                if (this.callbacks.onConnect) {
                    this.callbacks.onConnect();
                }
            };
            
            this.ws.onmessage = (event) => {
                const data = JSON.parse(event.data);
                console.debug('Received message:', data.type);
                
                if (this.callbacks.onMessage) {
                    this.callbacks.onMessage(data);
                }
            };
            
            this.ws.onerror = (error) => {
                console.error('WebSocket error:', error);
                this.connectionAttemptInProgress = false;
                if (this.callbacks.onError) {
                    this.callbacks.onError(error);
                }
            };
            
            this.ws.onclose = (event) => {
                this.isConnected = false;
                this.connectionAttemptInProgress = false;
                console.info('WebSocket closed:', event.code, event.reason);
                
                // Clear any pending reconnect
                if (this.reconnectTimer) {
                    clearTimeout(this.reconnectTimer);
                    this.reconnectTimer = null;
                }
                
                // Only reconnect if not closing intentionally
                if (!this.closing) {
                    // Check specific error conditions
                    if (event.reason && event.reason.includes('Too many people')) {
                        console.error('❌ Too many connections - will retry in 30s');
                        this.reconnectTimer = setTimeout(() => this.connect(), 30000);
                    } else if (event.reason && event.reason.includes('Internal server error')) {
                        console.error('💀 Fatal Unmute error - check backend logs');
                        this.reconnectTimer = setTimeout(() => this.connect(), 30000);
                    } else {
                        // Normal reconnection after 5 seconds
                        console.warn('⚠️ WebSocket closed unexpectedly, will reconnect in 5 seconds...');
                        this.reconnectTimer = setTimeout(() => this.connect(), 5000);
                    }
                } else {
                    console.info('✅ Connection closed intentionally');
                }
                
                if (this.callbacks.onClose) {
                    this.callbacks.onClose(event);
                }
            };
            
        } catch (error) {
            console.error('Failed to connect:', error);
            this.connectionAttemptInProgress = false;
            this.reconnectTimer = setTimeout(() => this.connect(), 5000);
        }
    }

    send(data) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data));
        }
    }

    close() {
        console.info('🛑 Closing WebSocket connection');
        this.closing = true;
        
        // Clear any reconnect timer
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        
        if (this.ws) {
            // Remove onclose handler to prevent reconnection
            const originalOnClose = this.ws.onclose;
            this.ws.onclose = (event) => {
                console.info('✅ Connection closed (final)');
                this.isConnected = false;
                this.connectionAttemptInProgress = false;
            };
            
            if (this.ws.readyState !== WebSocket.CLOSED) {
                this.ws.close();
            }
            this.ws = null;
        }
    }

    getState() {
        return {
            isConnected: this.isConnected,
            readyState: this.ws?.readyState,
            readyStateText: ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'][this.ws?.readyState || 3]
        };
    }
}

module.exports = WebSocketHandler;