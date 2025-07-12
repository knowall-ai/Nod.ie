# Available Voices for Nod.ie

You can change the voice in Nod.ie by editing the `modules/websocket-handler.js` file and replacing the `voice` parameter in the `session.update` message.

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

1. Open `modules/websocket-handler.js`
2. Find line 61 where it says `voice: 'unmute-prod-website/p329_022.wav'`
3. Replace with any of the paths listed above
4. Save the file and restart Nod.ie

## Note About 'nova' Voice

The 'nova' voice that was previously configured appears to be a placeholder or non-existent voice in the Unmute system. The actual available voices are those listed above, which come from the Unmute voice library.