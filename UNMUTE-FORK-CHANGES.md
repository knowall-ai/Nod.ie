# Unmute Fork Changes for KnowAll-AI

## Summary of Modifications

I've successfully modified your forked Unmute repository at `/mnt/raid1/GitHub/unmute/` with the following changes:

### 1. Environmental Awareness (`unmute/llm/system_prompt.py`)

Added a new `_ENVIRONMENTAL_AWARENESS` section that instructs the AI to:
- Recognize it's operating on someone's personal computer
- Ignore background noise and conversations not directed at it
- Be patient with silence (no more "are you still there?" prompts)
- Only respond when clearly being addressed

### 2. Identity Update (`unmute/llm/system_prompt.py`)

Changed the "WHO ARE YOU" section from:
- "This website is unmute dot SH"
- References to being on unmute.sh

To:
- "You are an AI voice assistant running on a customized fork of Kyutai Unmute maintained by KnowAll AI"
- "You're running locally on someone's personal computer as a desktop assistant application"
- Clear attribution to both Kyutai Labs (for core technology) and KnowAll AI (for the fork)

### 3. Silence Handling (`unmute/llm/system_prompt.py`)

Modified the "SILENCE AND CONVERSATION END" section to:
- Remove prompts asking if the user is still there
- Remove automatic goodbye messages after silence
- Treat silence as normal and expected
- Wait patiently instead of filling silence

### 4. Unmute Explanation (`unmute/llm/system_prompt.py`)

Updated the explanation instructions to:
- Mention it's a KnowAll AI fork
- Clarify it's a desktop application, not a web service
- Maintain accurate technical details about the system

## Next Steps

1. **Commit the changes:**
   ```bash
   cd /mnt/raid1/GitHub/unmute
   git add unmute/llm/system_prompt.py
   git commit -m "Customize Unmute for KnowAll AI desktop integration

   - Add environmental awareness for background noise
   - Update identity to clarify desktop app running on fork
   - Remove 'are you still there' prompts for better UX
   - Improve silence handling for real-world usage"
   ```

2. **Push to your fork:**
   ```bash
   git push origin main
   ```

3. **Rebuild the Docker container:**
   ```bash
   docker build -t unmute-backend:knowall .
   docker stop unmute-backend
   docker run -d --name unmute-backend-knowall -p 8765:80 unmute-backend:knowall
   ```

4. **Restart Nod.ie** to use the updated backend

These changes will make Nod.ie:
- Stop thinking she's on unmute.sh
- Be more patient with silence
- Ignore background conversations
- Properly identify as a KnowAll AI desktop assistant