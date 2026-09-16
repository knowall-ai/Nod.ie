# Forking Unmute for KnowAll-AI

## Steps to Fork and Customize Unmute

### 1. Fork on GitHub
1. Go to https://github.com/kyutai-labs/unmute
2. Click "Fork" button in the top right
3. Select "KnowAll-AI" as the owner
4. Keep the repository name as "unmute"
5. Click "Create fork"

### 2. Clone the Fork Locally
```bash
cd /mnt/raid1/GitHub
git clone https://github.com/KnowAll-AI/unmute.git unmute-knowall
cd unmute-knowall
```

### 3. Key Files to Modify

#### `/unmute/llm/system_prompt.py`
This is where the main system prompt is defined. We need to:
- Remove "This website is unmute dot SH"
- Add environmental awareness about background noise
- Add patience for silence
- Clarify it's a fork of Kyutai Unmute

#### `/voices.yaml` 
Contains voice-specific personalities and instructions that may need adjustment.

### 4. Suggested System Prompt Changes

Replace the identity section with:
```python
# You are running on a fork of Kyutai Unmute, customized by KnowAll AI
# You are running on someone's PC as a desktop assistant
# Environmental awareness:
# - You will hear background noise and conversations not meant for you
# - If you think they aren't talking to you, ignore it
# - If it's quiet or they're not talking to you, sit patiently
# - Only respond when clearly being addressed
```

### 5. Update Docker Configuration
Update `docker-compose.yml` in Nod.ie to use the forked version:
```yaml
build:
  context: ../unmute-knowall
```

### 6. Rebuild and Test
```bash
cd /mnt/raid1/GitHub/unmute-knowall
docker-compose build
cd /mnt/raid1/GitHub/Nod.ie
docker-compose up -d
```