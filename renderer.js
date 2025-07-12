/**
 * Nod.ie Renderer Process - Main entry point
 */

const { ipcRenderer } = require('electron');
const WebSocketHandler = require('./modules/websocket-handler');
const AudioCapture = require('./modules/audio-capture');
const UIManager = require('./modules/ui-manager');
const AudioPlayback = require('./modules/audio-playback');

// Initialize modules
const ui = new UIManager();
let wsHandler = null;
let audioCapture = null;
let audioPlayback = null;
let stopVisualization = null;

// Initialize audio playback
async function initAudioPlayback() {
    if (!audioPlayback) {
        audioPlayback = new AudioPlayback();
        await audioPlayback.initialize();
        console.info('🎵 Audio playback initialized');
    }
    return audioPlayback;
}

// Handle incoming messages from Unmute
async function handleUnmuteMessage(data) {
    console.debug('📨 Unmute message:', data.type);
    
    // Handle errors
    if (data.type === 'error') {
        console.error('Unmute error:', JSON.stringify(data.error));
        ui.showNotification(`Error: ${data.error.message || 'Unknown error'}`, 'error');
        return;
    }
    
    switch (data.type) {
        case 'response.audio.delta':
            // Play audio response
            if (data.delta) {
                console.debug('Received audio delta');
                if (!audioPlayback) {
                    await initAudioPlayback();
                }
                // Decode base64 to Uint8Array
                const binaryString = atob(data.delta);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }
                await audioPlayback.processAudioDelta(bytes);
                ui.showAudioActivity();
            }
            break;
            
        case 'response.audio_transcript.delta':
            // Show what Nod.ie is saying
            if (data.delta) {
                ui.showNotification(`Nod.ie: ${data.delta}`, 'response');
            }
            break;
            
        case 'conversation.item.input_audio_transcription.delta':
            // Show what user said
            if (data.transcript) {
                ui.showNotification(`You: ${data.transcript}`, 'transcript');
            }
            break;
            
        case 'response.created':
            ui.setStatus('thinking');
            break;
            
        case 'response.done':
            ui.setStatus('idle');
            // Send to n8n if configured
            sendToN8N({
                event: 'nodie_response',
                response: data.response,
                timestamp: new Date().toISOString()
            });
            // Keep listening for continuous conversation
            if (!ui.isMuted && wsHandler?.isConnected) {
                console.debug('🔄 Ready for next interaction');
                // Ensure audio capture continues
                if (!audioCapture?.isCapturing) {
                    console.debug('🎤 Restarting audio capture');
                    setTimeout(() => startListening(), 1000);
                }
            }
            break;
    }
}

// Start audio capture
async function startListening() {
    console.debug('🎤 startListening called', {
        wsConnected: wsHandler?.isConnected,
        muted: ui.isMuted
    });
    
    if (!wsHandler?.isConnected || ui.isMuted) {
        console.warn('⚠️ Cannot start listening - not connected or muted');
        return;
    }
    
    try {
        audioCapture = new AudioCapture((base64Audio) => {
            // Send audio to Unmute
            console.debug('🎤 Audio chunk captured, sending to Unmute...');
            wsHandler.send({
                type: 'input_audio_buffer.append',
                audio: base64Audio
            });
        });
        
        await audioCapture.start();
        console.info('✅ Audio capture started');
        
        // Start visualization
        const analyser = audioCapture.getAnalyser();
        if (analyser) {
            stopVisualization = ui.visualizeAudio(analyser);
        }
        
    } catch (error) {
        console.error('Failed to start listening:', error);
        ui.showNotification('Microphone access denied', 'error');
    }
}

// Stop audio capture
function stopListening() {
    console.info('🚫 Stopping audio capture');
    
    if (stopVisualization) {
        stopVisualization();
        stopVisualization = null;
    }
    
    if (audioCapture) {
        audioCapture.stop();
        audioCapture = null;
    }
    
    ui.setStatus('idle');
}

// Toggle mute state
function toggleMute() {
    ui.setMuted(!ui.isMuted);
    
    if (ui.isMuted) {
        stopListening();
    } else if (wsHandler?.isConnected) {
        startListening();
    }
}

// Connect to Unmute backend
async function connectToUnmute() {
    const config = await ipcRenderer.invoke('get-config');
    console.info('🔄 Connecting with config:', { voice: config.voice, model: config.modelName });
    
    wsHandler = new WebSocketHandler(config, {
        onConnect: () => {
            console.debug('🔗 WebSocket connected callback fired');
            // Clear loading state
            ui.setStatus('idle');
            // Start listening if not muted
            if (!ui.isMuted) {
                console.info('🎙️ Will start listening in 1 second...');
                setTimeout(() => startListening(), 1000);
            } else {
                console.info('🔇 Muted, not starting audio capture');
            }
        },
        onMessage: handleUnmuteMessage,
        onError: (error) => {
            ui.showNotification('Connection error', 'error');
        }
    });
    
    wsHandler.connect();
}

// n8n integration
async function sendToN8N(data) {
    await ipcRenderer.invoke('send-notification', data);
}

// Handle drag functionality
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;

document.body.addEventListener('mousedown', (e) => {
    if (!e.target.closest('#circle')) {
        isDragging = true;
        dragStartX = e.screenX;
        dragStartY = e.screenY;
    }
});

document.addEventListener('mousemove', (e) => {
    if (isDragging) {
        const deltaX = e.screenX - dragStartX;
        const deltaY = e.screenY - dragStartY;
        
        ipcRenderer.send('move-window', { deltaX, deltaY });
        
        dragStartX = e.screenX;
        dragStartY = e.screenY;
    }
});

document.addEventListener('mouseup', () => {
    isDragging = false;
});

// Event handlers
ui.circle.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleMute();
});

// IPC handlers
ipcRenderer.on('toggle-mute', () => {
    toggleMute();
});

ipcRenderer.on('n8n-notification', (event, data) => {
    ui.showNotification(data.message, 'n8n');
    
    // Speak the notification if connected
    if (wsHandler?.isConnected) {
        // Note: Unmute doesn't support text input, only audio
        console.debug('n8n notification received:', data.message);
    }
});

// Reconnect when settings change
ipcRenderer.on('settings-updated', async () => {
    console.info('⚙️ Settings updated, restarting everything...');
    
    // Reload the window to ensure fresh start
    window.location.reload();
});

// Initialize
console.info('🚀 Nod.ie renderer starting...');
ui.setStatus('loading');
connectToUnmute();

// Keep visualization alive
setInterval(() => {
    if (audioCapture && !stopVisualization) {
        const analyser = audioCapture.getAnalyser();
        if (analyser) {
            console.debug('🔄 Restarting visualization');
            stopVisualization = ui.visualizeAudio(analyser);
        }
    }
}, 5000);

// Show ready state
setTimeout(() => {
    console.debug('🔍 Ready check:', {
        wsConnected: wsHandler?.isConnected,
        muted: ui.isMuted
    });
    if (wsHandler?.isConnected && !ui.isMuted) {
        ui.showNotification('Nod.ie is ready! Say hello to get started.', 'success');
        ui.showAudioActivity();
    }
}, 2000);

// Clean up on window close
window.addEventListener('beforeunload', () => {
    console.info('🧹 Window unloading, cleaning up...');
    if (wsHandler) {
        wsHandler.close();
    }
    if (audioCapture) {
        audioCapture.stop();
    }
    if (audioPlayback) {
        audioPlayback.cleanup();
    }
});

// Handle app quit signal from main process
ipcRenderer.on('app-will-quit', () => {
    console.info('🧹 App is quitting, cleaning up...');
    if (wsHandler) {
        wsHandler.close();
    }
    if (audioCapture) {
        audioCapture.stop();
    }
    if (audioPlayback) {
        audioPlayback.cleanup();
    }
});

// Handle cleanup signal
ipcRenderer.on('cleanup-connections', () => {
    console.info('🧹 Cleanup requested, closing connections...');
    if (wsHandler) {
        wsHandler.close();
    }
});

// Clean up when page becomes hidden (minimized/background)
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        console.debug('🧹 Page hidden, pausing connections...');
        // Don't close WebSocket on hide, just stop audio capture to save resources
        if (audioCapture) {
            audioCapture.stop();
        }
    } else {
        console.debug('👁️ Page visible again');
        // Restart audio capture if unmuted
        if (!ui.isMuted && wsHandler?.isConnected) {
            setTimeout(() => startListening(), 1000);
        }
    }
});