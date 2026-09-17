# Nod.ie Architecture Guide

This document explains how Nod.ie is built, its components, and how they work together to create a low-latency voice assistant.

## Overview

Nod.ie is an Electron-based desktop application that provides an always-available voice interface to AI models through Kyutai Unmute's real-time voice conversation system. It achieves <200ms response latency through careful architecture choices.

## Core Components

### 1. Electron Framework
- **Main Process** (`main.js`): Manages the application lifecycle, window creation, and system integration
- **Renderer Process**: 
  - `renderer-common.js`: Shared core functionality
  - `renderer-electron.js`: Electron-specific implementation
  - `renderer-web.js`: Web browser version for testing
- **Preload Script**: Not used (direct Node.js integration in renderer)

### 2. Audio Pipeline

#### Input Chain (Your Voice → AI)
```
Microphone → MediaRecorder → opus-recorder → Base64 Opus → WebSocket → Unmute
```

1. **Audio Capture** (`modules/audio-capture.js`)
   - Uses `opus-recorder` library for proper Opus encoding
   - Captures audio in 250ms chunks
   - Outputs Opus audio in OGG container format
   - Base64 encodes for WebSocket transmission

2. **WebSocket Streaming**
   - Sends via `input_audio_buffer.append` messages
   - No commit needed (Unmute processes continuously)
   - Low latency through small chunk sizes

#### Output Chain (AI → Your Ears)
```
Unmute → WebSocket → Base64 Opus → Decoder → AudioWorklet → Speakers
```

1. **Audio Reception** (`renderer.js`)
   - Receives `response.audio.delta` messages
   - Decodes Base64 to Uint8Array
   - Passes to audio playback module

2. **Audio Playback** (`modules/audio-playback.js`)
   - Uses `decoderWorker.min.js` for Opus decoding
   - Requires `decoderWorker.min.wasm` WebAssembly module
   - AudioWorklet (`audio-output-processor.js`) for low-latency playback
   - Direct connection to audio context destination

### 3. WebSocket Protocol

#### Connection Management (`modules/websocket-handler.js`)
- Connects to `ws://localhost:8765/v1/realtime`
- Automatic reconnection with exponential backoff
- Connection cleanup to prevent "too many connections" errors

#### Message Flow
1. **Session Configuration**
   ```javascript
   {
     type: 'session.update',
     session: {
       model: 'llama3.2:3b',
       voice: 'unmute-prod-website/ex04_narration_longform_00001.wav',
       instructions: { type: 'constant', text: systemPrompt }
     }
   }
   ```

2. **Audio Streaming**
   ```javascript
   {
     type: 'input_audio_buffer.append',
     audio: 'base64-encoded-opus-data'
   }
   ```

3. **Response Handling**
   - `response.audio.delta`: Audio chunks to play
   - `response.audio_transcript.delta`: What AI is saying
   - `conversation.item.input_audio_transcription.delta`: What you said

### 4. User Interface

#### Visual Design (`index.html`)
- Frameless, transparent window
- Circular overlay with gradient
- Always-on-top positioning
- Draggable via transparent background

#### State Management (`modules/ui-manager.js`)
- **Loading** (orange pulse): Initializing connections
- **Idle** (purple): Listening for input
- **Muted** (red): Not capturing audio
- **Thinking** (yellow spin): Processing
- **Speaking** (audio ring): Visualizing audio

#### Audio Visualization
- Uses Web Audio API AnalyserNode
- Real-time frequency data visualization
- Canvas-based waveform rendering
- Synchronized with actual audio levels

## Key Architecture Decisions

### 1. Electron Over Web App
- System-wide hotkeys (Ctrl+Shift+Space)
- Always-on-top overlay
- Native audio device access
- No browser security restrictions

### 2. WebSocket Over REST
- Real-time bidirectional streaming
- Low latency audio transmission
- Continuous conversation flow
- No request/response overhead

### 3. Opus Codec Choice
- Optimized for voice
- Low bitrate with high quality
- Hardware acceleration support
- Standard in WebRTC/VoIP

### 4. AudioWorklet Over Audio Element
- Sample-accurate timing
- Low latency playback
- No main thread blocking
- Direct audio graph integration

### 5. Modular Architecture
- Separate concerns (audio, UI, networking)
- Easier testing and debugging
- Reusable components
- Clear data flow

## Loading State Detection

Nod.ie implements intelligent loading state management to ensure a smooth user experience:

### Loading State Components
1. **Visual Feedback**: Orange pulsing animation with "Loading Nod.ie..." text
2. **Connection Detection**: Monitors WebSocket connection to Unmute backend
3. **Resource Loading**: Tracks avatar video/image loading status
4. **User Interaction**: Prevents actions until fully loaded

### Loading State Flow
```javascript
// Initial state
state.isLoading = true
showLoadingText("Loading Nod.ie...")

// WebSocket connection established
ws.onopen → checkIfFullyLoaded()

// All resources ready
state.isLoading = false
hideLoadingText()
setStatus('idle')
```

### Loading Indicators
- **Center Text**: Status messages appear in the center of the circle
- **Pulse Animation**: Gentle scale animation (1.0 → 1.02 → 1.0)
- **Orange Gradient**: Visual distinction from other states
- **10s Timeout**: Fallback if connection fails

### Benefits
- Users know when Nod.ie is ready
- Prevents errors from premature interaction
- Clear feedback during slow connections
- Graceful handling of connection failures

## Performance Optimizations

### Audio Latency Reduction
1. **Small chunk sizes** (250ms) balance latency vs reliability
2. **Direct audio path** through AudioWorklet
3. **Pre-initialized audio contexts** avoid startup delay
4. **Continuous streaming** without buffering entire responses

### Resource Management
1. **Pause when hidden** to save CPU
2. **Single WebSocket connection** properly managed
3. **Cleanup on close** prevents resource leaks
4. **Efficient visualization** with requestAnimationFrame

## Integration Points

### Unmute Backend Services
- **unmute-backend**: Main orchestrator on port 8000 (regular) or 8001 (MCP version)
- **unmute-stt**: Speech-to-text using Moshi models
- **unmute-tts**: Text-to-speech using Moshi models  
- **ollama**: LLM inference backend
- **musetalk** (optional): Lip-sync avatar generation on port 8766

All services run on the `ai-stack` Docker network for inter-service communication.

### External Services
- **n8n webhooks**: Automation and notifications
- **LND (planned)**: Lightning Network integration
- **MCP servers (planned)**: Extended capabilities

## Security Considerations

1. **Local-only by default**: WebSocket to localhost
2. **No cloud dependencies**: All processing local
3. **No audio recording**: When `allow_recording: false`
4. **Mute control**: User controls when listening

## Development Workflow

### Adding Features
1. Identify the component (main/renderer/module)
2. Follow existing patterns
3. Test with appropriate test suite
4. Update documentation

### Debugging
1. **Developer Tools**: Right-click → Inspect
2. **Console Logging**: Extensive throughout
3. **Test Scripts**: Comprehensive test coverage
4. **Audio Test Page**: `tests/browser-test.html`

### Common Issues
- **Missing WASM**: Copy from node_modules
- **Audio Context Suspended**: User interaction required
- **WebSocket Errors**: Check Unmute is running
- **No Audio**: Verify decoder is working

## Testing Architecture

### Test Organization
- All tests located in `tests/` directory
- Playwright for UI testing (cross-platform consistency)
- Screenshots saved to `tests/screenshots/` (gitignored)
- Full console output captured for debugging

### Test Strategy
1. **Unit Tests**: Individual module functionality
2. **Integration Tests**: Component interactions
3. **E2E Tests**: Full voice conversation flow
4. **Visual Tests**: Screenshot-based regression testing

### Web Testing Mode
- Separate web version (`test-web.html` + `renderer-web.js`)
- Allows Playwright automation without Electron complexity
- Shared code via `renderer-common.js`
- Debug UI shows real-time status

## Available Voice Configuration

Nod.ie supports multiple voices through the Unmute system. Voices are configured via the `voice` parameter in the WebSocket session.

### English Voices

1. **Watercooler** (Default VCTK dataset voice)
   - Path: `unmute-prod-website/p329_022.wav`
   - Description: Natural conversational voice
   
2. **Quiz Show** (UK male, skeptical)
   - Path: `unmute-prod-website/freesound/519189_request-42---hmm-i-dont-knowwav.mp3`
   - Description: British male voice with a skeptical tone
   
3. **Gertrude** (Kind and sympathetic)
   - Path: `unmute-prod-website/freesound/440565_why-is-there-educationwav.mp3`
   - Description: Warm female voice, good for advice-giving
   
4. **Dev (news)** (Václav from Kyutai)
   - Path: `unmute-prod-website/developer-1.mp3`
   - Description: Developer voice, good for technical/news content
   
5. **Explanation** (Expresso dataset)
   - Path: `unmute-prod-website/ex04_narration_longform_00001.wav`
   - Description: Clear voice for explanatory content

### French/Multilingual Voices

6. **Charles** (Charles de Gaulle)
   - Path: `unmute-prod-website/degaulle-2.wav`
   - Description: Historical figure voice, speaks French/English
   
7. **Développeuse** (French developer)
   - Path: `unmute-prod-website/developpeuse-3.wav`
   - Description: French female developer voice
   
8. **Fabieng** (French business coach)
   - Path: `unmute-prod-website/fabieng-enhanced-v2.wav`
   - Description: Dynamic French voice with English mixed in

### Voice Configuration

Voice selection is configured in:
- Environment variable: `VOICE_MODEL`
- Config file: `~/.config/nodie/config.json`
- Session update message: `voice` parameter

## Future Architecture Considerations

### Planned Enhancements
1. **Wake word detection**: "Hey Nod.ie"
2. **Multi-model support**: Different LLMs
3. **Plugin system**: Extensible capabilities
4. **Cloud backup**: Settings sync

### Scalability
- Current: Single user, local instance
- Future: Multi-user with proper isolation
- Consideration: Resource pooling for models

## Testing Architecture

### Test Categories
1. **Unit Tests**: Individual modules
2. **Integration Tests**: Component interaction
3. **End-to-End Tests**: Full conversation flow
4. **Browser Tests**: Audio API compatibility

### Test Infrastructure
- `run-all-tests.js`: Complete test suite
- `run-non-electron-tests.js`: Fast feedback
- `serve-browser-test.js`: Interactive testing

## Conclusion

Nod.ie's architecture prioritizes:
- **Low latency** through streaming and direct audio paths
- **Reliability** through proper error handling and reconnection
- **User control** through simple, responsive interface
- **Extensibility** through modular design

The combination of Electron's desktop integration, WebSocket streaming, Opus audio codec, and Unmute's voice processing creates a responsive voice assistant that feels natural to use.