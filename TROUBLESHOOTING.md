# Nod.ie Troubleshooting Guide

## Quick Reference

| Problem | Solution |
|---------|----------|
| Nod.ie can't hear me | 1. Check microphone permissions in system settings<br>2. Click circle to unmute (red = muted, purple = listening)<br>3. Run `arecord -l` to verify microphone detected |
| Can't hear Nod.ie's responses | 1. Check system audio: `speaker-test -t wav -c 2`<br>2. Verify Unmute services: `cd ../unmute && docker compose ps`<br>3. Open Developer Tools → Console, look for "response.audio.delta" messages |
| "Internal server error" messages | **FIXED** - Empty audio data crashes backend<br>1. Update to latest version with audio validation<br>2. Check console for "Skipping too-short audio data" messages<br>3. Restart if using older version without validation |
| "Too many people are connected" error | 1. Kill all Nod.ie processes: `pkill -f "electron.*nodie"`<br>2. Restart Unmute: `cd ../unmute && docker compose restart`<br>3. Close any browser tabs with http://localhost:3000 open<br>4. Increase batch_size in STT/TTS configs (see below) |
| WebSocket connection failed | 1. Verify Unmute is running: `curl http://localhost:8765/v1/health`<br>2. Check port 8765 is available: `sudo netstat -tlnp \| grep 8765`<br>3. Restart Unmute services if needed |
| White waveform disappearing | Canvas element ID mismatch - Fixed in ui-manager.js<br>Check audio context state in Console: `audioCapture?.audioContext?.state` |
| Circle shows thinking state on startup | Fixed - only shows thinking when actually processing<br>Clear cache and restart if persists |
| Can't drag the window | Click and drag on transparent area around circle<br>Circle itself is for mute/unmute toggle |
| Audio format error: "unexpected ogg capture pattern" | MediaRecorder produces WebM, Unmute expects OGG<br>Fixed by switching to opus-recorder library |
| Too many Electron processes | Multiple Nod.ie instances running<br>1. Kill all: `pkill -f "electron.*nodie"`<br>2. Check if killed: `ps aux \| grep -E "electron.*nodie" \| grep -v grep`<br>3. If persists, force kill: `killall -9 electron` |
| Slow responses (10+ seconds) | Ollama running on CPU instead of GPU<br>1. Check GPU memory: `nvidia-smi`<br>2. Stop other GPU services<br>3. Restart Ollama: `docker restart ollama`<br>4. See "Performance Issues" section below |
| STT mishears "Nod.ie" | Common mis-transcriptions: Navy, Nandi, Nody, Hody<br>The LLM is configured to recognize these as "Nod.ie"<br>Say "Node-ee" or "Noddy" for better recognition |

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

### 🚨 Critical Bug: "Internal server error" (FIXED)

**Problem**: Backend crashes with "Internal server error" messages and WebSocket disconnections.

**Root Cause**: 
- Unmute backend tries to access `opus_bytes[5]` without validating data length
- Empty or malformed audio data (< 6 bytes) causes IndexError in backend
- This was a regression introduced during avatar implementation work

**Fix Applied**:
Multi-layer validation prevents invalid audio data from reaching the backend:

1. **Audio Capture Level**: Skip data < 6 bytes
2. **Renderer Level**: Skip base64 data < 8 characters  
3. **Backend Protection**: Backend expects minimum 6 bytes for BOS flag check

**How to Verify Fix**:
```bash
# 1. Check console for validation messages
Open Developer Tools → Console
Look for: "⚠️ Skipping too-short audio data"

# 2. Test with debug script
node debug-audio-detailed.js
# Should NOT crash backend with "Internal server error"

# 3. Verify audio capture working
# Console should show: "📤 Calling onAudioData with base64 chunk"
```

**Prevention**: Always validate audio data length before sending to WebSocket.

### 🎭 MuseTalk Avatar Issues

| Problem | Solution |
|---------|----------|
| MuseTalk WebSocket disconnects immediately | Check AVATAR_VIDEO_PATH environment variable is set |
| "invalid literal for int() with base 10: 'cudacuda...'" | Function parameter error - fixed in get_image_prepare_material call |
| MuseTalk shows "Disconnected" in web interface | Ensure container has AVATAR_VIDEO_PATH=/app/avatars/nodie-video-03.mp4 |
| No avatar video fallback | Add `<video>` tag with src="assets/avatars/nodie-video-01.mp4" |
| Canvas shows no default avatar image | Check asset paths - use "../assets/" for tests, "./assets/" for main |
| MuseTalk audio decoding fails - "[ogg @ 0x...] Codec not found" | Container's ffmpeg lacks proper Opus support - fixed with Python libraries (pydub, pyogg) |
| "Audio decoding failed" in MuseTalk logs | OGG Opus format from browser not compatible with conda ffmpeg build |
| MuseTalk generates frames but no lip-sync | Audio processing failing - check for "Successfully decoded Opus audio" in logs |
| MuseTalk falls back to video cycling | Real audio not being processed - audio decoding step is failing |

**Diagnosing MuseTalk Issues:**

1. **Check MuseTalk service health:**
   ```bash
   curl http://localhost:8765/health
   # Should return: {"status":"healthy","model_loaded":true,...}
   ```

2. **Check container environment:**
   ```bash
   docker exec musetalk env | grep AVATAR_VIDEO_PATH
   # Should show: AVATAR_VIDEO_PATH=/app/avatars/nodie-video-03.mp4
   ```

3. **Check WebSocket connection logs:**
   ```bash
   docker logs musetalk --tail 20
   # Look for: "WebSocket client connected" without errors
   ```

4. **Check audio processing logs:**
   ```bash
   docker logs musetalk --tail 50 | grep -E "(Processing audio|Successfully decoded|Audio decoding failed)"
   # Should show successful Opus decoding, not "Audio decoding failed"
   ```

5. **Verify real-time lip-sync:**
   ```bash
   # Open web test page: http://localhost:8095/tests/test-web.html
   # Speak into microphone and check logs for:
   docker logs musetalk --tail 10 | grep "Generated actual lip-synced frame"
   # If missing, audio processing is failing
   ```

**Common MuseTalk Fixes:**

1. **Set environment variable and restart:**
   ```bash
   cd musetalk-service
   AVATAR_VIDEO_PATH=/app/avatars/nodie-video-03.mp4 docker compose up -d
   ```

2. **Verify video files exist:**
   ```bash
   docker exec musetalk ls -la /app/avatars/
   # Should list .mp4 files
   ```

3. **Check preprocessing errors:**
   - Look for "Error preparing avatar" in logs
   - Face detection may fail on some video frames
   - Falls back to static video frames when MuseTalk fails

4. **Fix Opus audio decoding (Current Issue):**
   ```bash
   # Update container with Python audio libraries
   cd musetalk-service
   docker compose down
   docker compose up --build -d
   
   # Check if pydub and pyogg are installed
   docker exec musetalk pip list | grep -E "(pydub|pyogg)"
   ```

5. **Test audio decoding:**
   ```bash
   # Speak into microphone on test page and check logs
   docker logs musetalk --follow | grep -E "(decoded|audio)"
   # Should see: "✅ Successfully decoded Opus audio"
   # Not: "Audio decoding failed"
   ```

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

### 🚀 Performance Issues

| Problem | Solution |
|---------|----------|
| Very slow responses (10-30s) | LLM running on CPU - check GPU memory availability |
| High CPU usage from Ollama | Model can't fit in GPU memory, falling back to CPU |
| Multiple AI services competing | Stop unused services to free GPU memory |
| GPU memory fragmentation | Restart Docker services to clean up memory |

**Diagnosing GPU Issues:**

1. **Check what's using GPU memory:**
   ```bash
   nvidia-smi
   # Look for processes using significant memory
   ```

2. **Check if Ollama is using GPU:**
   ```bash
   nvidia-smi | grep ollama
   # Should show ollama process if using GPU
   ```

3. **Common GPU memory hogs:**
   - Text Generation Inference (TGI) containers
   - Other AI models (Stable Diffusion, etc.)
   - Multiple Ollama models loaded simultaneously
   - Browser tabs with GPU acceleration

**Optimizing for Nod.ie:**

1. **Configure Ollama for single model:**
   ```bash
   # Set in Ollama container environment:
   OLLAMA_MAX_LOADED_MODELS=1
   OLLAMA_NUM_PARALLEL=1
   OLLAMA_KEEP_ALIVE=5m
   ```

2. **Free up GPU memory:**
   ```bash
   # Stop unused containers
   docker ps | grep -E "tgi|text-generation"
   docker stop <container_id>
   
   # Unload Ollama models
   docker exec ollama ollama rm <unused_model>
   ```

3. **Monitor GPU usage during operation:**
   ```bash
   watch -n 1 nvidia-smi
   ```

**Expected GPU Usage:**
- Moshi STT: ~2.6GB
- Moshi TTS: ~6.4GB
- Ollama (llama3.2:3b): ~4GB
- **Total**: ~13GB minimum

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
| "invalid literal for int() with base 10: 'cudacudacuda...'" | MuseTalk function call error | Fixed get_image_prepare_material parameters |
| "AVATAR_VIDEO_PATH environment variable not set" | MuseTalk WebSocket closes immediately | Set AVATAR_VIDEO_PATH=/app/avatars/nodie-video-03.mp4 |

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

## STT/TTS Connection Limits

The Unmute backend uses batch processing for STT (Speech-to-Text) and TTS (Text-to-Speech) services. By default, the development configuration only allows 1 STT connection and 2 TTS connections.

### Increasing Connection Limits

If you get "Too many people are connected" errors or need multiple Nod.ie instances:

1. **Edit STT configuration** (`../unmute/services/moshi-server/configs/stt.toml`):
   ```toml
   # Change from:
   batch_size = 1
   # To (adjust based on GPU memory):
   batch_size = 8
   ```

2. **Edit TTS configuration** (`../unmute/services/moshi-server/configs/tts.toml`):
   ```toml
   # Change from:
   batch_size = 2
   # To (adjust based on GPU memory):
   batch_size = 8
   ```

3. **Rebuild and restart services**:
   ```bash
   cd ../unmute
   docker compose build stt tts
   docker compose restart stt tts
   ```

### GPU Memory Considerations

Each additional connection uses more GPU memory:
- **STT**: ~300-400 MB per connection
- **TTS**: ~500-700 MB per connection

Check your GPU memory before increasing batch size:
```bash
nvidia-smi --query-gpu=name,memory.total,memory.used,memory.free --format=csv
```

**Recommended batch sizes by GPU:**
- RTX 3090 (24GB): batch_size = 8-16
- RTX 3080 (10GB): batch_size = 4-8
- RTX 3070 (8GB): batch_size = 2-4

### Production vs Development Config

The Unmute repository includes production configs with higher batch sizes:
- `stt-prod.toml`: batch_size = 64
- `tts-prod.toml`: batch_size = 64

To use production configs, modify the docker-compose.yml:
```yaml
stt:
  command: worker --config configs/stt-prod.toml

tts:
  command: worker --config configs/tts-prod.toml
```

**Note**: Production configs are optimized for server deployments with multiple GPUs.

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