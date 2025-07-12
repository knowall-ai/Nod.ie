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

## Code Style Guidelines

### JavaScript
- Use async/await for asynchronous operations
- Add console.log statements for debugging audio flow
- Handle errors gracefully with user-friendly notifications
- Comment complex audio processing code

### CSS
- Use CSS variables for colors and transitions
- Avoid properties that affect layout in state changes (causes alignment bugs)
- Test animations across different states (idle, muted, thinking)

### File Organization
```
Nod.ie/
├── main.js          # Electron main process
├── renderer.js      # WebSocket and audio handling
├── index.html       # UI and styling
├── package.json     # Dependencies and scripts
├── tests/           # Test suites
├── README.md        # User documentation
├── TROUBLESHOOTING.md # Problem/solution guide
├── TODO.md          # Outstanding tasks
└── CLAUDE.md        # This file
```

## Current Issues & Context

### 🔴 Critical: Audio Format Issue (2025-07-11)
**DISCOVERED**: Unmute expects Opus audio in OGG container format, not raw Opus frames or WebM-wrapped Opus.
- The first packet must have "beginning of stream" flag set (byte 5 with bit 2 set)
- MediaRecorder produces WebM container which Unmute rejects with "unexpected ogg capture pattern"
- **SOLUTION**: Use opus-recorder library with `streamPages: true` to create proper OGG Opus format
- **STATUS**: Implemented opus-recorder but needs browser environment (won't work in Node.js tests)

### 🟡 White Wave Visualization
The white audio visualization circle was disappearing after briefly showing.
- **CAUSE**: AudioContext and analyser weren't properly initialized as class properties
- **FIXED**: Added proper initialization in audio-capture.js constructor

### 🟢 What's Working
- WebSocket connection to Unmute
- Opus decoder integration (using Unmute's decoder worker)
- Visual feedback (audio ring animation)
- Basic mute/unmute functionality
- Audio playback infrastructure (AudioWorklet + decoder)

### 📝 Architecture Decision: Electron vs React (2025-07-11)
User suggested converting to React to match Unmute's implementation. Decision:
- **Keep Electron**: Simpler for overlay UI, less overhead
- **Use same audio libraries**: opus-recorder, decoder workers work in both
- **Key insight**: The audio handling code is nearly identical regardless of framework
- Unmute uses React because it's a full web app; we just need an overlay

## Important Implementation Details

### Audio Format (CRITICAL - Updated 2025-07-11)
- **Input**: Must use opus-recorder to create OGG Opus format (NOT MediaRecorder WebM)
- **Output**: Base64-encoded raw Opus frames from Unmute
- **Decoding**: Use Unmute's decoderWorker.min.js with AudioWorklet
- **Key Settings**: 24kHz sample rate, mono, streamPages: true

### Unmute WebSocket Protocol
Unmute only accepts these message types:
- `session.update` - Configure voice and model
- `input_audio_buffer.append` - Stream audio chunks
- `unmute.input_audio_buffer.append_anonymized` - For anonymous recording

It does NOT support:
- `conversation.item.create` (no text input)
- `response.create` (no manual response trigger)
- `input_audio_buffer.commit` (no commit needed)

### State Management
- `isConnected` - WebSocket connection status
- `isMuted` - Microphone mute state
- `mediaRecorder` - Active recording session
- `audioQueue` - Buffered audio chunks for playback

## Testing Guidelines

Always test:
1. Audio playback with different system configurations
2. Microphone permissions and device selection
3. State transitions (muted ↔ unmuted)
4. Visual feedback synchronization
5. Error scenarios (Unmute down, no microphone)
- Do not finish and say things are all fixed without first running all tests and confirming they pass

## Common Pitfalls

1. **Don't use espeak for production audio** - Always use Unmute's TTS
2. **Don't send text to Unmute** - It only processes audio input
3. **Don't assume audio format** - Check MediaRecorder.isTypeSupported()
4. **Don't modify layout in state changes** - Causes alignment bugs

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

## Resources

- [Unmute GitHub](https://github.com/kyutai-labs/unmute) - Check for API updates
- [Electron Docs](https://www.electronjs.org/) - For desktop integration
- [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API) - For audio processing

## Contact

When stuck on audio issues, consider:
1. Testing with Unmute's web interface (http://localhost:3000)
2. Checking Unmute backend logs: `docker logs unmute-backend`
3. Comparing with Unmute's frontend implementation