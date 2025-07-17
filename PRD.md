# Product Requirements Document (PRD) - Nod.ie

## Overview
Nod.ie is an always-listening AI voice assistant with a visual interface that provides real-time feedback through avatars and audio visualizations.

## Structure
- **Epic**: High-level business goal
- **Feature**: Specific functionality that delivers value
- **User Story**: Detailed requirement from the user's perspective

---

## Epic: Voice Assistant Interface
Provide users with a complete voice interaction experience including visual feedback, voice processing, and intelligent responses.

### Feature: Microphone Waveform
Real-time visualization of audio input that shows when Nod.ie is listening and responding to sound.

#### User Stories:
1. **As a user, I want to see a visual indicator when Nod.ie is listening**
   - GIVEN Nod.ie is unmuted
   - WHEN I am not speaking
   - THEN I see a perfect orange circle around Nod.ie's circumference

2. **As a user, I want to see my voice visualized**
   - GIVEN Nod.ie is unmuted and listening
   - WHEN I speak
   - THEN the orange circle deforms outward based on my voice volume
   - AND returns to a perfect circle when I stop speaking

3. **As a user, I want visual interest even when not speaking**
   - GIVEN Nod.ie is unmuted
   - WHEN the waveform is displayed
   - THEN the waveform slowly rotates (10-second full rotation)
   - AND maintains its shape while rotating

#### Technical Requirements:
- **Color**: Orange (#F7931A) with glow effect
- **Thickness**: 6px stroke width
- **Glow**: 20px blur shadow
- **Position**: Exactly on the circle's circumference (not inside, not clipped)
- **Canvas Size**: 300x300px to prevent clipping
- **Behavior**: 
  - Perfect circle when silent (no deformation)
  - Only deforms outward when amplitude > 0.1
  - Maximum deformation: 15px outward
  - Rotation: Continuous clockwise, 10 seconds per revolution
- **States**:
  - Hidden when muted
  - Visible when unmuted

### Feature: Avatar Display
Visual representation of Nod.ie that provides a friendly face for interaction.

#### User Stories:
1. **As a user, I want to see Nod.ie's face when not actively using voice**
   - GIVEN Nod.ie is muted
   - WHEN I look at the interface
   - THEN I see Nod.ie's avatar image/video
   - AND the avatar fills the entire circle

2. **As a user, I want clear indication of voice mode**
   - GIVEN Nod.ie is unmuted
   - WHEN I'm in voice interaction mode
   - THEN I see a microphone icon instead of the avatar
   - AND the icon is centered in the circle

3. **As a user, I want animated avatar support**
   - GIVEN video avatar is available
   - WHEN Nod.ie is muted and visible
   - THEN the avatar video plays on loop
   - AND falls back to static image if video fails

#### Technical Requirements:
- **Default State**: Shows avatar (muted state)
- **Active State**: Shows microphone icon (unmuted state)
- **Image Format**: PNG, circular crop
- **Video Format**: MP4, looped, muted
- **Fallback**: Always fall back to static image if video fails
- **Path**: `assets/avatars/nodie-default.png` (and .mp4)

### Feature: Speech-to-Text (STT)
Real-time transcription of user's voice input into text for processing.

#### User Stories:
1. **As a user, I want Nod.ie to accurately hear what I say**
   - GIVEN I'm speaking clearly
   - WHEN I talk to Nod.ie
   - THEN my speech is transcribed accurately
   - AND I see confirmation that Nod.ie heard me (visual feedback)

2. **As a user, I want continuous conversation**
   - GIVEN Nod.ie is unmuted
   - WHEN I speak
   - THEN Nod.ie processes my speech in real-time
   - AND doesn't require wake words or push-to-talk

#### Technical Requirements:
- **Engine**: Kyutai Moshi models via unmute-stt service
- **Streaming**: Real-time WebSocket streaming
- **Language**: English (primary)
- **Latency**: <100ms for transcription start
- **Format**: Opus audio chunks → text output

### Feature: Text-to-Speech (TTS)
Natural voice synthesis for Nod.ie's responses.

#### User Stories:
1. **As a user, I want Nod.ie to speak naturally**
   - GIVEN Nod.ie has a response
   - WHEN it speaks to me
   - THEN the voice sounds natural and pleasant
   - AND matches the selected voice personality

2. **As a user, I want smooth audio playback**
   - GIVEN Nod.ie is speaking
   - WHEN generating long responses
   - THEN audio streams smoothly without gaps
   - AND doesn't cut off mid-sentence

#### Technical Requirements:
- **Engine**: Kyutai Moshi models via unmute-tts service
- **Voices**: Multiple options (nova, watercooler, etc.)
- **Streaming**: Chunked audio playback via AudioWorklet
- **Format**: Base64 Opus → decoded PCM audio
- **Latency**: <200ms from text to first audio

### Feature: Language Model (LLM)
Intelligent response generation based on user input.

#### User Stories:
1. **As a user, I want intelligent responses**
   - GIVEN I ask Nod.ie a question
   - WHEN it processes my request
   - THEN it provides relevant, helpful answers
   - AND remembers our conversation context

2. **As a user, I want Nod.ie to be concise**
   - GIVEN I'm having a voice conversation
   - WHEN Nod.ie responds
   - THEN answers are brief and to the point
   - AND don't ramble unnecessarily

#### Technical Requirements:
- **Model**: Llama 3.2 3B (via Ollama)
- **Context**: Maintains conversation history
- **Response Style**: Brief, conversational
- **Processing**: Via unmute-backend orchestration

### Feature: Settings
User preferences and configuration options.

#### User Stories:
1. **As a user, I want to customize Nod.ie's voice**
   - GIVEN I have preferences
   - WHEN I access settings
   - THEN I can choose from available voices
   - AND the change applies immediately

2. **As a user, I want to adjust audio sensitivity**
   - GIVEN my environment is noisy/quiet
   - WHEN I need to adjust sensitivity
   - THEN I can change microphone sensitivity
   - AND Nod.ie responds appropriately

#### Technical Requirements:
- **Storage**: `~/.config/nodie/config.json`
- **Options**: Voice selection, sensitivity, avatar choice
- **UI**: Accessible settings panel
- **Apply**: Real-time without restart

### Feature: Loading State
Show when Nod.ie is initializing and not yet ready.

#### User Stories:
1. **As a user, I want to know when Nod.ie is starting up**
   - GIVEN I launch Nod.ie
   - WHEN it's connecting to services
   - THEN I see "Loading Nod.ie..." in the center
   - AND an orange pulsing animation

#### Technical Requirements:
- **Animation**: Orange gradient with pulse effect
- **Text**: Centered in circle
- **Completion**: When WebSocket connects
- **Timeout**: 10 seconds maximum

---

## Design Principles

1. **Immediate Feedback**: Every action should have instant visual response
2. **Natural Interaction**: Voice-first, with visual support
3. **Fail Gracefully**: Always have fallbacks
4. **Consistent State**: Visual elements match actual state
5. **Performance First**: Smooth animations, low latency

## Success Metrics

- Voice response latency < 200ms
- Waveform animation at 60 FPS
- Zero visual glitches or clipping
- Settings changes apply instantly
- 100% state consistency