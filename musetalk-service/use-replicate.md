# Using Replicate for MuseTalk

Since setting up full MuseTalk locally is complex, you can use Replicate's hosted version:

## Quick Start

1. Get a Replicate API token from https://replicate.com/account/api-tokens

2. Install Replicate client:
```bash
pip install replicate
```

3. Use MuseTalk:
```python
import replicate

output = replicate.run(
    "douwantech/musetalk:6bb2fc73281952728c801512ab42fce3a0d8d47ab676e11c00daf68226528f89",
    input={
        "video": "your-avatar-video.mp4",
        "audio": "nodie-speech-audio.wav"
    }
)
```

## Pricing
- ~$0.42 per run
- Runs on NVIDIA L40S GPU
- Takes ~8 minutes per video

## Integration with Nod.ie
For real-time use, this would need to:
1. Buffer Nod.ie's speech
2. Send chunks to Replicate
3. Cache results for common phrases
4. Fall back to simple lip-sync while processing