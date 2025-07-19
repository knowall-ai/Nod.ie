# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with the Nod.ie codebase.

## Project Overview

Nod.ie is an always-listening AI voice assistant built with:
- **Electron** for the desktop overlay interface
- **Kyutai Unmute** for real-time voice conversations
- **WebSocket** for streaming audio communication
- **Web Audio API** for audio processing and visualization

## Key Principles

1. **Audio First**: Nod.ie is a voice interface - all interactions should prioritize natural voice communication
2. **Low Latency**: Target <200ms response time for voice interactions
3. **Always Available**: Nod.ie should be unobtrusive but instantly accessible
4. **Privacy Conscious**: Audio is not recorded when muted, user control is paramount
5. **Clean Codebase**: Keep directories organized and free from clutter
6. **Incremental Changes**: Make small, focused changes rather than big rewrites or new implementations unless explicitly agreed upon

## Code Style Guidelines

### Unified Codebase Approach
- **Single renderer.js**: Both Electron and Web use the same renderer file
- **Platform detection**: Use runtime checks to handle platform differences
- **CSS data attributes**: Use `data-platform="electron|web"` for styling differences
- **Conditional features**: Hide/show UI elements based on platform needs
- **Module compatibility**: Handle both CommonJS (Electron) and browser globals

### JavaScript
- Use async/await for asynchronous operations
- Add console.log statements for debugging audio flow
- Handle errors gracefully with user-friendly notifications
- Comment complex audio processing code
- Make incremental changes - don't rewrite working code without discussion
- Test your changes immediately after making them
- Use platform detection for environment-specific code:
  ```javascript
  const isElectron = typeof require !== 'undefined' && require('electron');
  ```

### CSS
- Use CSS variables for colors and transitions
- Avoid properties that affect layout in state changes (causes alignment bugs)
- Test animations across different states (idle, muted, thinking)

### File Organization
```
Nod.ie/
├── main.js             # Electron main process
├── renderer.js         # Unified renderer for both Electron and Web
├── index.html          # Electron UI
├── package.json        # Dependencies and scripts
├── modules/            # Reusable modules
├── tests/              # All test files
│   ├── test-web.html   # Web test harness (uses same renderer.js)
│   └── screenshots/    # Test screenshots (gitignored)
├── logs/               # All log files (gitignored)
├── temp/               # Temporary scripts (gitignored)
├── assets/             # Static assets
│   └── avatars/        # Avatar images/videos
├── musetalk-service/   # MuseTalk Docker service
├── docs/               # Documentation
├── README.md           # User documentation
├── TROUBLESHOOTING.md  # Problem/solution guide
├── ARCHITECTURE.md     # Technical architecture
├── PRD.md              # Product Requirements Document
└── CLAUDE.md           # This file
```

### Directory Guidelines

1. **Keep directories clean**: No temporary files in root
2. **Logs**: All logs go in `logs/` folder (gitignored)
3. **Screenshots**: Test screenshots in `tests/screenshots/` (gitignored)
4. **Temporary scripts**: One-off scripts in `temp/` folder (gitignored)
5. **Test files**: All tests must be in `tests/` folder
6. **Module organization**: Keep related functionality together
7. **No file clutter**: Remove old versions (no -tmp, -fixed, -working suffixes)
8. **Unified code**: No separate renderer-electron.js or renderer-web.js files

## Current Issues & Context

### 🔴 Critical: "Internal server error" Bug (2025-07-17) - FIXED
**DISCOVERED**: Unmute backend crashes when receiving empty or invalid audio data.
- **CAUSE**: Backend tries to access `opus_bytes[5]` without length validation
- **SYMPTOMS**: "Internal server error" messages and connection drops
- **ROOT CAUSE**: Empty audio data or packets < 6 bytes cause IndexError in backend
- **REGRESSION**: This was NOT an issue in master branch - introduced during avatar implementation
- **SOLUTION**: Added multi-layer validation to prevent invalid audio data from being sent
- **STATUS**: FIXED - Added validation in audio-capture.js, audio-capture-web.js, and renderer.js

### 🟢 Audio Format Issue (2025-07-11) - RESOLVED
**DISCOVERED**: Unmute expects Opus audio in OGG container format, not raw Opus frames or WebM-wrapped Opus.
- The first packet must have "beginning of stream" flag set (byte 5 with bit 2 set)
- MediaRecorder produces WebM container which Unmute rejects with "unexpected ogg capture pattern"
- **SOLUTION**: Use opus-recorder library with `streamPages: true` to create proper OGG Opus format
- **STATUS**: IMPLEMENTED and working

### 🟢 White Wave Visualization - RESOLVED
The white audio visualization circle was disappearing after briefly showing.
- **CAUSE**: AudioContext and analyser weren't properly initialized as class properties
- **FIXED**: Added proper initialization in audio-capture.js constructor

### 🟢 What's Working
- WebSocket connection to Unmute
- Opus decoder integration (using Unmute's decoder worker)
- Visual feedback (audio ring animation)
- Basic mute/unmute functionality
- Audio playback infrastructure (AudioWorklet + decoder)
- Multi-layer audio data validation preventing backend crashes

### 📝 Architecture Decision: Electron vs React (2025-07-11)
User suggested converting to React to match Unmute's implementation. Decision:
- **Keep Electron**: Simpler for overlay UI, less overhead
- **Use same audio libraries**: opus-recorder, decoder workers work in both
- **Key insight**: The audio handling code is nearly identical regardless of framework
- Unmute uses React because it's a full web app; we just need an overlay

## Important Implementation Details

### Audio Format (CRITICAL - Updated 2025-07-17)
- **Input**: Must use opus-recorder to create OGG Opus format (NOT MediaRecorder WebM)
- **Output**: Base64-encoded raw Opus frames from Unmute
- **Decoding**: Use Unmute's decoderWorker.min.js with AudioWorklet
- **Key Settings**: 24kHz sample rate, mono, streamPages: true
- **Validation**: REQUIRED - Audio data must be ≥6 bytes to prevent backend crashes

### Audio Data Validation (CRITICAL - Added 2025-07-17)
Multi-layer validation prevents backend crashes from invalid audio data:

1. **Audio Capture Level** (`audio-capture.js` & `audio-capture-web.js`):
   ```javascript
   if (data.length < 6) {
       console.debug('⚠️ Skipping too-short audio data, length:', data.length);
       return;
   }
   ```

2. **Renderer Level** (`renderer.js`):
   ```javascript
   if (!audioData || audioData.length < 8) {
       console.debug('⚠️ Skipping invalid audio data in renderer');
       return;
   }
   ```

3. **Backend Protection**: Backend expects minimum 6 bytes to check `opus_bytes[5]` for BOS flag

### Unmute WebSocket Protocol
Unmute only accepts these message types:
- `session.update` - Configure voice and model
- `input_audio_buffer.append` - Stream audio chunks
- `unmute.input_audio_buffer.append_anonymized` - For anonymous recording

It does NOT support:
- `conversation.item.create` (no text input)
- `response.create` (no manual response trigger)
- `input_audio_buffer.commit` (no commit needed)

### Backend Configuration
- **Default backend**: `ws://localhost:8765` (unmute-backend)
- **MCP backend**: `ws://localhost:8766` (unmute-backend-mcp)
- Configure in config.json: `"unmuteBackendUrl": "ws://localhost:8765"`

### State Management
- `isConnected` - WebSocket connection status
- `isMuted` - Microphone mute state
- `mediaRecorder` - Active recording session
- `audioQueue` - Buffered audio chunks for playback

## Testing Guidelines

### Test Organization
- **All tests must be in the `tests/` folder** - No test files in the root directory
- **Use Playwright for all UI testing** - Provides consistent cross-platform testing
- **Screenshots go in `tests/screenshots/`** - Must be added to `.gitignore`
- **Enable console logging** - Capture all console output for debugging

### Test Coverage
Always test:
1. Audio playback with different system configurations
2. Microphone permissions and device selection  
3. State transitions (muted ↔ unmuted)
4. Visual feedback synchronization
5. Error scenarios (Unmute down, no microphone)
6. Avatar video loading and lip-sync
7. Orange waveform visualization
8. **Platform consistency**: Ensure both Electron and Web versions behave identically

### Playwright Best Practices
- Use `headless: false` during development for visual debugging
- Enable fake media streams for consistent microphone testing
- Take screenshots at key points for visual regression testing
- Capture and analyze console errors
- **Test with unified code**: Web tests now accurately reflect Electron behavior since they use the same renderer.js

### Important
- **Test as you go** - Run tests immediately after making changes
- Do not finish and say things are all fixed without first running all tests and confirming they pass
- Always check `tests/screenshots/` for visual confirmation of features
- Test your own work before declaring completion

## Common Pitfalls

1. **Don't use espeak for production audio** - Always use Unmute's TTS
2. **Don't send text to Unmute** - It only processes audio input
3. **Don't assume audio format** - Check MediaRecorder.isTypeSupported()
4. **Don't modify layout in state changes** - Causes alignment bugs
5. **Don't rewrite working features** - Make incremental improvements instead
6. **Don't implement new features without agreement** - Discuss major changes first
7. **Don't use fallbacks in configuration** - NEVER use patterns like:
   - `window.CONFIG?.MUSETALK_WS || 'ws://localhost:8765/ws'` ❌
   - `os.environ.get('AVATAR_VIDEO_PATH', '/app/avatars/nodie-video-03.mp4')` ❌
   - `getConfig('MUSETALK_PORT', '8765')` ❌
   
   Instead, always require configuration from .env file:
   - `window.CONFIG?.MUSETALK_WS` ✅
   - `os.environ.get('AVATAR_VIDEO_PATH')` ✅ (with error handling if missing)
   - `getConfig('MUSETALK_PORT')` ✅

## Debugging Tips

1. Enable Developer Tools with right-click → Developer Tools
2. Check Console for WebSocket messages and errors
3. Monitor Network tab for WebSocket frames
4. Use `console.log` liberally for audio debugging
5. Test with simple audio files first

## Future Considerations

- Wake word detection ("Hey Nod.ie")
- Multiple voice options beyond 'nova'
- Offline mode with local models
- Plugin system for extensibility

## Backend Setup

There are two Unmute backend instances:

### unmute-backend (Default)
- **Location**: Regular Kyutai Unmute backend
- **Port**: 8765 (WebSocket)
- **Frontend**: http://localhost:3000
- **Docker logs**: `docker logs unmute-backend`
- **Use case**: Standard voice conversations

### unmute-backend-mcp (MCP Integration)
- **Location**: Fork of Unmute with MCP integration
- **Port**: 8766 (WebSocket)
- **Frontend**: http://localhost:3001
- **Docker logs**: `docker logs unmute-backend-mcp`
- **Use case**: Voice conversations with MCP tool integration

## Unified Codebase Approach (Electron + Web)

### Architecture
We maintain a unified codebase that runs in both Electron and web browsers:

1. **renderer-common.js**: Core functionality (WebSocket, audio, UI)
2. **renderer-electron.js**: Thin wrapper for Electron-specific features
3. **renderer-web.js**: Thin wrapper for web-specific features
4. **renderer-common.css**: Shared styles
5. **renderer-electron.css**: Electron overrides (transparency, sizing)
6. **renderer-web.css**: Web overrides (background, debug UI)

### Key Differences to Handle

**Module System**:
- Electron: CommonJS with `require()`
- Web: Global scripts with `<script>` tags
- Solution: UMD pattern in renderer-common.js

**Configuration**:
- Electron: IPC from main process
- Web: Window.ENV_CONFIG object
- Solution: Abstract config getter in common code

**Platform APIs**:
- Electron: ipcRenderer, custom window controls
- Web: Standard browser APIs only
- Solution: Feature detection and graceful fallbacks

**UI Requirements**:
- Electron: Transparent overlay (230px circle)
- Web: Full page app (250px circle)
- Solution: CSS overrides per platform

### Testing Strategy
1. Test core functionality in web browser first (easier debugging)
2. Verify Electron-specific features separately
3. Use feature flags for platform-specific code paths

## Resources

- [Unmute GitHub](https://github.com/kyutai-labs/unmute) - Check for API updates
- [Electron Docs](https://www.electronjs.org/) - For desktop integration
- [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API) - For audio processing

## Contact

When stuck on audio issues, consider:
1. Testing with Unmute's web interface (http://localhost:3000 for default, http://localhost:3001 for MCP)
2. Checking backend logs: `docker logs unmute-backend` or `docker logs unmute-backend-mcp`
3. Comparing with Unmute's frontend implementation