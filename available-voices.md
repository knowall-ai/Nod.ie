# Available Voices for Nod.ie

You can change the voice in Nod.ie through the Settings window (right-click → Settings) or by editing the `modules/websocket-handler.js` file.

## English Voices

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

## French/Multilingual Voices

6. **Charles** (Charles de Gaulle)
   - Path: `unmute-prod-website/degaulle-2.wav`
   - Description: Historical figure voice, speaks French/English
   
7. **Développeuse** (French developer)
   - Path: `unmute-prod-website/developpeuse-3.wav`
   - Description: French female developer voice
   
8. **Fabieng** (French business coach)
   - Path: `unmute-prod-website/fabieng-enhanced-v2.wav`
   - Description: Dynamic French voice with English mixed in

## How to Change the Voice

### Method 1: Using Settings (Recommended)
1. Right-click on Nod.ie
2. Select "Settings"
3. Choose a voice from the "Voice Model" dropdown
4. Click "Save Settings"

### Method 2: Manual Edit
1. Open `modules/websocket-handler.js`
2. Find the line with `voice: this.config.voice ||`
3. Replace the default voice path with any of the paths listed above
4. Save the file and restart Nod.ie

## Additional Voices Available

According to Kyutai's TTS page (https://kyutai.org/next/tts), many more voices are available:

### US Voices (Expresso Dataset)
- Angry (female/male)
- Calming (female/male)
- Confused (female/male)
- Desire (female/male)
- Fearful (female)
- Jazz radio (male)
- Narration (female)
- Sad (female/male)
- Sarcastic (female/male)
- Show host (male)
- Whisper (female)

### UK Voices (VCTK Dataset)
- VCTK 226 (male)
- VCTK 228 (female)
- VCTK 231 (female)
- VCTK 255 (male)
- VCTK 277 (female)
- VCTK 292 (male)

### French Voices (CML Dataset)
- CML 12977 (female)
- CML 1406 (male)
- CML 2154 (female)
- CML 4724 (male)

### EARS Dataset Voices
- Multiple speakers (003, 013, 022, 031, 040, 051, 060, 070, 080, 091, 105)

**Note**: File paths for these additional voices are not yet documented. You may need to experiment with paths like `expresso/[filename].wav` or `vctk/[speaker].wav`.

## Note About 'nova' Voice

The 'nova' voice that was previously configured appears to be a placeholder or non-existent voice in the Unmute system. The actual available voices are those listed above, which come from the Unmute voice library.