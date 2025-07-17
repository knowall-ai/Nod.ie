"""
Basic lip-sync service without heavy dependencies
Maps audio volume to mouth frames
"""

import asyncio
import base64
import json
import logging
import time
import struct
from pathlib import Path
from typing import Optional, Dict, Any
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import cv2
import numpy as np

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Global state
model_state = {
    "initialized": True,
    "processing": False
}

# Frame cache
frame_cache = {}

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize on startup"""
    logger.info("Starting basic lip-sync service")
    yield
    logger.info("Shutting down basic lip-sync service")

app = FastAPI(lifespan=lifespan)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health_check():
    """Check service health"""
    return {
        "status": "healthy",
        "model_loaded": True,
        "device": "cpu",
        "processing": model_state["processing"],
        "mode": "basic_volume_mapping"
    }

def analyze_audio_volume(audio_data: bytes) -> float:
    """Simple audio volume analysis"""
    try:
        # Try to interpret as 16-bit PCM audio
        samples = []
        for i in range(0, len(audio_data)-1, 2):
            sample = struct.unpack('<h', audio_data[i:i+2])[0]
            samples.append(sample / 32768.0)  # Normalize to -1 to 1
        
        if not samples:
            return 0.0
            
        # Calculate RMS (root mean square)
        rms = np.sqrt(np.mean(np.array(samples)**2))
        
        # Normalize to 0-1 range with some amplification
        volume = min(1.0, rms * 5.0)
        return volume
    except Exception as e:
        logger.debug(f"Audio analysis error: {e}")
        return 0.0

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for real-time streaming"""
    await websocket.accept()
    client_id = id(websocket)
    logger.info(f"WebSocket client {client_id} connected")
    
    # Load avatar video
    video_path = Path("/app/avatars/nodie-video-03.mp4")
    if not video_path.exists():
        # Try alternate paths
        for alt_path in [
            Path("../assets/avatars/nodie-video-03.mp4"),
            Path("assets/avatars/nodie-video-03.mp4"),
            Path("/app/avatars/nodie-video-01.mp4")
        ]:
            if alt_path.exists():
                video_path = alt_path
                break
    
    logger.info(f"Loading avatar video: {video_path}")
    
    video_frames = []
    mouth_frames = {}  # Dictionary to store frames by mouth openness level
    
    if video_path.exists():
        cap = cv2.VideoCapture(str(video_path))
        fps = cap.get(cv2.CAP_PROP_FPS)
        frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        
        logger.info(f"Video info - FPS: {fps}, Total frames: {frame_count}")
        
        # Load frames
        frame_idx = 0
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            frame = cv2.resize(frame, (256, 256))
            video_frames.append(frame)
            frame_idx += 1
        
        cap.release()
        logger.info(f"Loaded {len(video_frames)} frames")
        
        # Select key frames for different mouth states
        if len(video_frames) >= 10:
            # Distribute frames across the video for variety
            mouth_frames = {
                0.0: video_frames[0],        # Closed mouth (start)
                0.1: video_frames[len(video_frames)//10],
                0.2: video_frames[len(video_frames)//8],
                0.3: video_frames[len(video_frames)//6],
                0.4: video_frames[len(video_frames)//5],
                0.5: video_frames[len(video_frames)//4],
                0.6: video_frames[len(video_frames)//3],
                0.7: video_frames[len(video_frames)//2],
                0.8: video_frames[int(len(video_frames)*0.7)],
                0.9: video_frames[int(len(video_frames)*0.85)],
                1.0: video_frames[-1]        # Most open (end)
            }
        else:
            # Use all available frames
            for i, frame in enumerate(video_frames):
                mouth_frames[i / max(1, len(video_frames)-1)] = frame
    else:
        logger.warning(f"Video not found at {video_path}")
        # Create gray placeholder
        placeholder = np.ones((256, 256, 3), dtype=np.uint8) * 128
        mouth_frames = {0.0: placeholder}
    
    # State tracking
    frame_count = 0
    volume_history = []
    last_speaking = False
    
    try:
        while True:
            # Receive message
            data = await websocket.receive_json()
            
            if data["type"] == "audio":
                # Process audio frame
                audio_data = base64.b64decode(data["audio"])
                timestamp = data.get("timestamp", time.time())
                
                # Analyze audio volume
                volume = analyze_audio_volume(audio_data)
                
                # Smooth volume changes
                volume_history.append(volume)
                if len(volume_history) > 3:  # Keep last 3 samples
                    volume_history.pop(0)
                smoothed_volume = np.mean(volume_history) if volume_history else 0
                
                # Detect if speaking (volume above threshold)
                is_speaking = smoothed_volume > 0.05
                
                # Select appropriate frame
                if mouth_frames:
                    # Find closest volume level
                    closest_level = min(mouth_frames.keys(), 
                                      key=lambda x: abs(x - smoothed_volume))
                    frame = mouth_frames[closest_level].copy()
                    
                    # Log state changes
                    if is_speaking != last_speaking:
                        logger.info(f"Speaking state changed: {is_speaking}, volume: {smoothed_volume:.2f}")
                    last_speaking = is_speaking
                    
                    # Periodic logging
                    if frame_count % 30 == 0 and is_speaking:
                        logger.debug(f"Volume: {smoothed_volume:.2f}, Level: {closest_level}")
                else:
                    frame = video_frames[0] if video_frames else np.ones((256, 256, 3), dtype=np.uint8) * 128
                
                # Encode and send frame
                _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
                frame_base64 = base64.b64encode(buffer).decode('utf-8')
                
                await websocket.send_json({
                    "type": "frame",
                    "timestamp": timestamp,
                    "frame": frame_base64
                })
                
                frame_count += 1
                
            elif data["type"] == "config":
                logger.info(f"Config update: {data}")
                
    except WebSocketDisconnect:
        logger.info(f"WebSocket client {client_id} disconnected")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        await websocket.close()

@app.get("/stats")
async def get_stats():
    """Get processing statistics"""
    return {
        "mode": "basic_volume_mapping",
        "description": "Volume-based mouth animation without ML models",
        "model_status": model_state
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8765)