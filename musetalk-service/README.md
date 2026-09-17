# MuseTalk Service for Nod.ie

This service provides lip-sync capabilities for the Nod.ie avatar.

## Current Status ✅

The service is now running with a **basic lip-sync** implementation that:
- Maps audio volume to mouth openness in real-time
- Selects appropriate frames from your video based on speech volume
- Works without GPU or heavy ML dependencies
- Provides low-latency response for natural conversation

### How It Works

1. **Audio Analysis**: Incoming audio is analyzed for volume/amplitude
2. **Frame Selection**: Higher volume = more open mouth position
3. **Smooth Transitions**: Volume changes are smoothed over 3 samples
4. **Real-time Response**: Frames update immediately with speech

## Full MuseTalk Integration

To enable full MuseTalk lip-sync with proper AI-driven mouth movements:

### Option 1: Use MuseTalk Web Service (Recommended)
1. Run MuseTalk's Gradio interface:
   ```bash
   cd ../musetalk-repo
   python app.py --server_port 7860
   ```
2. Access at http://localhost:7860
3. Upload your avatar video and audio for processing

### Option 2: Docker with GPU (Advanced)
1. Ensure NVIDIA Docker runtime is installed
2. Build the full MuseTalk image:
   ```bash
   docker build -f Dockerfile -t musetalk-full .
   ```
3. Run with GPU support:
   ```bash
   docker run --gpus all -p 8766:8765 musetalk-full
   ```

### Option 3: Use External Services
- **Replicate**: https://replicate.com/douwantech/musetalk ($0.42 per run)
- **Sieve**: https://www.sievedata.com/functions/sieve/musetalk

## Current Implementation

The simplified version (`musetalk_api_simple.py`) provides:
- Real-time audio processing
- Volume-based mouth animation
- Low latency response
- No GPU required

To use the simplified version:
```bash
docker build -f Dockerfile.simple -t musetalk-simple .
docker run -p 8766:8765 musetalk-simple
```

## Files

- `musetalk_api.py` - Full MuseTalk integration (requires models)
- `musetalk_api_simple.py` - Simplified volume-based lip-sync
- `Dockerfile` - Full MuseTalk with GPU support
- `Dockerfile.simple` - Lightweight version
- `download_models.py` - Script to download MuseTalk models