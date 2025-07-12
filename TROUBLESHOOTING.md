# Nod.ie Troubleshooting Guide

## Quick Reference

| Problem | Solution |
|---------|----------|
| Nod.ie can't hear me | 1. Check microphone permissions in system settings<br>2. Click circle to unmute (red = muted, purple = listening)<br>3. Run `arecord -l` to verify microphone detected |
| Can't hear Nod.ie's responses | 1. Check system audio: `speaker-test -t wav -c 2`<br>2. Verify Unmute services: `cd ../unmute && docker compose ps`<br>3. Open Developer Tools → Console, look for "response.audio.delta" messages |
| "Too many people are connected" error | 1. Kill all Nod.ie processes: `pkill -f "electron.*nodie"`<br>2. Restart Unmute: `cd ../unmute && docker compose restart`<br>3. Close any browser tabs with http://localhost:3000 open<br>4. Connection handling has been improved to prevent leaks |
| WebSocket connection failed | 1. Verify Unmute is running: `curl http://localhost:8765/v1/health`<br>2. Check port 8765 is available: `sudo netstat -tlnp \| grep 8765`<br>3. Restart Unmute services if needed |
| White waveform disappearing | Canvas element ID mismatch - Fixed in ui-manager.js<br>Check audio context state in Console: `audioCapture?.audioContext?.state` |
| Circle shows thinking state on startup | Fixed - only shows thinking when actually processing<br>Clear cache and restart if persists |
| Can't drag the window | Click and drag on transparent area around circle<br>Circle itself is for mute/unmute toggle |
| Audio format error: "unexpected ogg capture pattern" | MediaRecorder produces WebM, Unmute expects OGG<br>Fixed by switching to opus-recorder library |
| Too many Electron processes | Multiple Nod.ie instances running<br>1. Kill all: `pkill -f "electron.*nodie"`<br>2. Check if killed: `ps aux \| grep -E "electron.*nodie" \| grep -v grep`<br>3. If persists, force kill: `killall -9 electron` |

## Detailed Solutions

### 🎤 Microphone Issues

| Problem | Solution |
|---------|----------|
| Microphone access denied | Grant permission when prompted or check Settings → Privacy → Microphone |
| No audio visualization | Check if audio context is active in Developer Tools Console |
| Recording stops unexpectedly | Audio context might be suspended - click Nod.ie to reactivate |
| Multiple microphones | Default microphone is used - change system default if needed |

### 🔊 Audio Playback Issues

| Problem | Solution |
|---------|----------|
| Audio works in Unmute frontend but not Nod.ie | AudioWorklet or decoder issue - check decoderWorker.min.js is loaded |
| Buffer length errors | Fixed with proper calculation: (960 * sampleRate) / 24000 |
| No audio despite receiving data | Check audio context state: `audioPlayback?.audioContext?.state` |
| Audio cutting out | Check for errors in Console related to audio processing |
| Response lag/latency | Audio chunks may be buffering - check Console for "Decoded audio frame" timing |

### 🔄 Process Management

| Problem | Solution |
|---------|----------|
| Multiple Nod.ie instances | Only one instance should run at a time<br>Use system tray to manage single instance |
| Zombie Electron processes | Test scripts may leave processes<br>Clean up: `pkill -f "electron.*nodie"` after tests |
| High memory usage | Each Electron process uses ~100MB<br>Kill extras: `ps aux \| grep electron \| wc -l` to count |
| Tests creating multiple instances | Tests should clean up properly<br>Fixed in test scripts with proper cleanup handlers |
| Can't kill processes | Try: `sudo pkill -9 -f "electron.*nodie"`<br>Or restart system if needed |

**Prevention strategies:**
1. **Single instance enforcement** - Main.js should prevent multiple instances
2. **Test cleanup** - All test scripts now include cleanup on exit
3. **Process monitoring** - Regularly check: `ps aux | grep -c "electron.*nodie"`
4. **Automatic cleanup** - Tray menu "Quit" properly closes all processes

### 🌐 Connection Issues

| Problem | Solution |
|---------|----------|
| WebSocket keeps reconnecting | Check Unmute backend logs: `docker logs -f unmute-backend` |
| Connection timeout | Increase timeout in websocket-handler.js if on slow network |
| SSL/TLS errors | Nod.ie uses ws:// not wss:// - ensure no proxy interference |
| Port conflicts | Change port in docker-compose.yml and config.json if 8765 is taken |

### 🖥️ Display Issues

| Problem | Solution |
|---------|----------|
| Purple circle alignment jumps | CSS transition issue - fixed by removing layout-affecting transitions |
| No color change between states | Intentional - purple gradient for all states except muted (red) |
| Thinking animation too aggressive | Reduced to subtle pulse animation (5% scale) |
| Glow effect clipped | Reduced from 15px to 8px shadow, removed drop shadows |
| Red error visualization not showing | Only appears when analyser is destroyed or errors occur |

### ⚙️ Configuration Issues

| Problem | Solution |
|---------|----------|
| Config file location unknown | Default: `~/.config/nodie/config.json` |
| Global hotkey not working | Check for conflicts, try different combination in config.json |
| Voice selection not changing | Use full voice paths from available-voices.md |
| n8n webhooks not triggering | Verify webhook URL is accessible from Nod.ie |

## Debugging Audio Lag

If experiencing lag in Nod.ie's responses:

1. **Check audio chunk timing** in Developer Tools Console:
   ```javascript
   // Look for timing between these messages:
   // "📥 Processing audio delta" - when audio is received
   // "🔊 Decoded audio frame" - when audio is decoded
   // "🎵 Sending to decoder" - decoder processing start
   ```

2. **Monitor WebSocket latency**:
   ```javascript
   // Check message receive timing
   // "📨 Unmute message: response.audio.delta"
   ```

3. **Potential causes**:
   - Network latency to Unmute backend
   - Audio decoder processing delay
   - AudioWorklet buffer underruns
   - System audio driver latency

## Debug Commands

### Check Services
```bash
# Unmute health check
curl http://localhost:8765/v1/health

# Docker containers status
cd ../unmute && docker compose ps

# Active connections count
docker exec unmute-backend netstat -an | grep 8765 | wc -l
```

### Audio Testing
```bash
# List audio devices
pactl list short sources
pactl list short sinks

# Test microphone
arecord -d 5 test.wav && aplay test.wav

# Test speakers
speaker-test -t wav -c 2
```

### Developer Tools Console Commands
```javascript
// Check connection
console.log(wsHandler?.isConnected)

// Check audio contexts
console.log(audioCapture?.audioContext?.state)
console.log(audioPlayback?.audioContext?.state)

// Check if receiving audio
// Look for these in logs:
// "📨 Unmute message: response.audio.delta"
// "Received audio delta"
```

## Common Error Messages

| Error | Meaning | Solution |
|-------|---------|----------|
| "unexpected ogg capture pattern [67, 182, 117, 1]" | Wrong audio format (WebM instead of OGG) | Fixed with opus-recorder |
| "First packet must have beginning of stream flag set" | OGG stream not properly initialized | Fixed with streamPages: true |
| "Too many people are connected" | Connection limit reached | Restart Unmute services |
| "Cannot read properties of undefined (reading 'getContext')" | Canvas element not found | Fixed element ID reference |
| "Invalid instructions format" | Wrong message format | Use discriminated union objects |

## Prevention Tips

1. **Always close Nod.ie properly** - Use Cmd+Q or system tray quit to ensure cleanup
2. **Monitor WebSocket connections** - Check Developer Tools for connection status
3. **Keep one instance running** - Multiple instances can cause connection conflicts
4. **Regular restarts** - If experiencing issues, restart both Nod.ie and Unmute services

## Audio Debugging

### Quick Audio Test
If Nod.ie isn't producing audio:

1. **Open Developer Tools** (right-click on purple circle → Developer Tools)
2. **Test basic audio** in the console:
   ```javascript
   // Test if audio works at all
   const ctx = new AudioContext();
   const osc = ctx.createOscillator();
   osc.connect(ctx.destination);
   osc.start();
   setTimeout(() => osc.stop(), 500);
   ```

3. **Check decoder files**:
   - Ensure `decoderWorker.min.js` exists in root directory
   - Ensure `decoderWorker.min.wasm` exists in root directory
   - If missing: `cp node_modules/opus-recorder/dist/decoderWorker.min.* .`

### Common Audio Errors

| Error | Solution |
|-------|----------|
| "RuntimeError: Aborted" in decoderWorker | Missing WASM file - copy from node_modules |
| "Decoder message with no data" | Format mismatch - should be fixed in latest version |
| No audio despite receiving data | Check AudioContext state isn't suspended |

## Architecture Summary

### Current Audio Pipeline
1. **Audio Capture**: Uses opus-recorder library for proper Opus encoding
2. **WebSocket Format**: Sends base64-encoded Opus audio in OGG container
3. **Audio Playback**: Uses AudioWorklet with Opus decoder worker
4. **Decoder**: Requires `decoderWorker.min.js` and `decoderWorker.min.wasm`

### Key Files
- `/renderer.js` - Main WebSocket and audio handling
- `/modules/audio-playback.js` - Audio decoding and playback
- `/modules/websocket-handler.js` - Unmute connection and voice config
- `/modules/audio-capture.js` - Microphone capture with opus-recorder
- `/audio-output-processor.js` - AudioWorklet for low-latency playback

## Recent Improvements

The following issues have been fixed:

| Improvement | Description |
|-------------|-------------|
| Single instance enforcement | Only one Nod.ie instance can run at a time |
| WebSocket connection cleanup | Proper cleanup prevents "Too many people connected" errors |
| Process cleanup on quit | App properly closes all connections when quitting |
| Visibility handling | Audio capture pauses when window is hidden |
| Reconnection debouncing | Prevents rapid reconnection attempts |
| Canvas element fix | Fixed waveform visualization disappearing |
| Audio decoder fix | Fixed decoder expecting array format for Opus frames |
| Voice configuration | Now uses full voice paths instead of short names |
| WASM file deployment | Added decoderWorker.min.wasm to root directory |
| Model parameter fix | Added missing 'model: llama3.2:3b' to session config |
| PROMPT.md system | Created prompt loading system (simplified for size constraints) |
| Renderer process fix | Removed Node.js fs/path modules from renderer |

## Still Having Issues?

1. **Collect logs**:
   ```bash
   # Nod.ie debug
   npm run debug > nodie-debug.log 2>&1
   
   # Unmute logs
   docker logs unmute-backend > unmute-backend.log 2>&1
   docker logs unmute-tts > unmute-tts.log 2>&1
   ```

2. **System info**:
   ```bash
   uname -a
   node --version
   npm --version
   ```

3. **Check prerequisites** - See README.md for system requirements