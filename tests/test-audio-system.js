/**
 * Comprehensive test for Nod.ie audio system
 * Run with: node tests/test-audio-system.js
 */

const { app, BrowserWindow } = require('electron');
const path = require('path');

app.whenReady().then(() => {
    const win = new BrowserWindow({
        width: 120,
        height: 120,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });
    
    win.loadFile('index.html');
    win.webContents.openDevTools({ mode: 'detach' });
    
    // Monitor everything after load
    win.webContents.on('did-finish-load', () => {
        console.log('🧪 Nod.ie Test Started - Watch the console for:');
        console.log('  - "Mic Data chunk" = Audio being captured');
        console.log('  - "First 4 bytes" = Should show OggS format');
        console.log('  - "response.audio.delta" = Nod.ie responding');
        console.log('  - Speak to test!');
        
        // Add monitoring
        setTimeout(() => {
            win.webContents.executeJavaScript(`
                // Monitor audio chunks
                let audioChunkCount = 0;
                let responseCount = 0;
                
                // Check initial state
                console.log('📊 Initial State:');
                console.log('  Muted:', ui?.isMuted);
                console.log('  WebSocket:', wsHandler?.isConnected);
                console.log('  Audio Capture:', audioCapture?.isCapturing);
                
                // Monitor WebSocket messages
                if (wsHandler && wsHandler.ws && wsHandler.ws.onmessage) {
                    const original = wsHandler.ws.onmessage;
                    wsHandler.ws.onmessage = function(event) {
                        const data = JSON.parse(event.data);
                        if (data.type === 'response.audio.delta') {
                            responseCount++;
                            console.log('🎵 AUDIO RESPONSE #' + responseCount);
                        } else if (data.type === 'error') {
                            console.error('❌ ERROR:', data.error);
                        }
                        return original.call(this, event);
                    };
                }
            `);
        }, 2000);
    });
    
    // Quit after 30 seconds
    setTimeout(() => {
        console.log('🏁 Test complete');
        app.quit();
    }, 30000);
});