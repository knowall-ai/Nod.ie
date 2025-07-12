# Nod.ie TODO List

## 🔥 High Priority

### Fix Settings Window
- [ ] Settings window is not opening/working properly
- [ ] Debug IPC communication for settings dialog
- [ ] Ensure config.json is properly loaded/saved
- [ ] Test settings persistence across restarts

### Fix Audio Capture Reliability
- [ ] Sometimes Nod.ie stops hearing user input
- [ ] May be related to audio context suspension
- [ ] Could be WebSocket connection dropping
- [ ] Add automatic reconnection for audio capture
- [ ] Add visual indicator when microphone is active/inactive

## Audio Issues (Mostly Resolved)

### 1. Fix Audio Output from Unmute
- [ ] Debug why `response.audio.delta` messages aren't producing sound
- [ ] Verify audio format compatibility (OGG/Opus playback)
- [ ] Test with different audio playback methods (Audio element vs Web Audio API)
- [ ] Add audio debugging panel in Developer Tools
- [ ] Check system audio routing (HDMI vs speakers)

### 2. Improve Audio Input Quality
- [ ] Test different MediaRecorder configurations
- [ ] Optimize chunk size for better recognition
- [ ] Add audio level meter for microphone input
- [ ] Handle multiple microphone devices properly

## 🎯 Core Features

### 3. Voice Activation
- [ ] Implement wake word detection ("Hey Nod.ie")
- [ ] Add voice activity detection (VAD) for automatic listening
- [ ] Create hotword training interface

### 4. Natural Welcome Message
- [ ] Use Unmute's TTS for welcome (not espeak)
- [ ] Pre-record welcome audio with Unmute
- [ ] Or trigger introduction with ambient sound detection

## 💡 User Experience

### 5. Visual Feedback Improvements
- [ ] Add speech-to-text transcription display
- [ ] Show thinking/processing state more clearly
- [ ] Add conversation history overlay
- [ ] Implement typing indicator while Nod.ie responds
- [ ] Ability to mute/unmute the agent speaking (separate from microphone mute)
- [ ] Animated visual of the AI agent with mouth movements matching speech

### 6. Window Management
- [ ] Add resize handle for larger view mode
- [ ] Create settings window (not just JSON file)
- [ ] Add minimize to system tray
- [ ] Remember window position across restarts

### 7. Better Error Handling
- [ ] Show connection status indicator
- [ ] Auto-reconnect with exponential backoff
- [ ] Display helpful error messages to user
- [ ] Add fallback for when Unmute is down

## 🔧 Technical Improvements

### 8. Audio Pipeline Optimization
- [ ] Implement audio queue management
- [ ] Add echo cancellation
- [ ] Optimize for low-latency streaming
- [ ] Support different audio codecs

### 9. Integration Features
- [ ] n8n webhook implementation
- [ ] Claude Code integration (bidirectional)
- [ ] Custom command system
- [ ] Plugin architecture

### 10. Settings & Configuration
- [ ] GUI settings panel
- [ ] Voice selection dropdown
- [ ] Model selection (unmute-mini vs unmute-large)
- [ ] Microphone/speaker device selection
- [ ] Hotkey customization

## 🧪 Testing & Debugging

### 11. Comprehensive Test Suite
- [ ] Audio playback tests
- [ ] Microphone capture tests
- [ ] WebSocket connection tests
- [ ] End-to-end conversation tests
- [ ] Performance benchmarks

### 12. Developer Tools
- [ ] Add debug mode with verbose logging
- [ ] WebSocket message inspector
- [ ] Audio stream analyzer
- [ ] Latency measurements

## 📚 Documentation

### 13. User Documentation
- [ ] Video tutorial for setup
- [ ] Common commands guide
- [ ] Troubleshooting flowchart
- [ ] FAQ section

### 14. Developer Documentation
- [ ] API reference for extensions
- [ ] Architecture diagrams
- [ ] Contributing guide
- [ ] Plugin development guide

## 🚀 Future Features

### 15. MCP (Model Context Protocol) Integration
- [ ] Ability to connect to MCP Servers
- [ ] Implementation of memory (via MCP servers)
- [ ] Persistent context across conversations
- [ ] Access to local tools and resources
- [ ] MCP server for web search capabilities

### 16. Advanced n8n Integration
- [ ] Receive alerts and make announcements from n8n workflows
- [ ] Initiate n8n workflows via voice commands
- [ ] Two-way communication with automation platform
- [ ] Custom webhook handlers for events

### 17. Visual Capabilities
- [ ] Ability to "see" screenshots for contextual assistance
- [ ] Stream screen content for real-time commentary
- [ ] Visual tutoring mode (e.g., "What am I doing wrong here?")
- [ ] Screen annotation suggestions

### 18. System Control
- [ ] Ability to open local applications
- [ ] Navigate websites via voice commands
- [ ] Control system settings
- [ ] Execute approved shell commands

### 19. Lightning Network Integration
- [ ] Connect to LND for channel management
- [ ] Monitor channel health and balance
- [ ] Voice alerts for channel issues
- [ ] Execute Lightning payments via voice
- [ ] Integration with black-panther home server

### 20. Advanced Capabilities
- [ ] Multi-language support
- [ ] Voice cloning/customization
- [ ] Offline mode with local models
- [ ] Screen reading capability
- [ ] Integration with other AI services

### 21. Platform Support
- [ ] Windows compatibility
- [ ] macOS optimizations
- [ ] Linux package (.deb, .rpm)
- [ ] Auto-update system

## 🐛 Known Bugs to Fix

1. **Audio not playing** - Main issue preventing voice responses from Unmute
2. **Circle alignment jumps** - Circle moves position after unmuting (CSS transition issue)
   - Need to ensure position remains fixed during state changes
   - May need to separate visual states from layout properties
3. **Drag functionality** - NOT WORKING
   - CSS `-webkit-app-region` conflicts with click events
   - Need to implement manual mouse event handling
   - Add visual feedback when drag is ready
4. **Memory leaks** - Long-running sessions may accumulate audio buffers
5. **WebSocket errors** - Better error handling needed
6. **Developer Tools window** - Too small when attached, needs detached mode by default

## 📝 Notes

- Priority should be fixing audio output - without this, Nod.ie can't fulfill its primary purpose
- Consider using Unmute's frontend code as reference for audio handling
- May need to collaborate with Kyutai team for better documentation
- Test with different audio devices (USB, HDMI, Bluetooth)