"""
MuseTalk API Service - Simplified version
Uses basic audio-to-mouth mapping instead of full MuseTalk
"""

import asyncio
import base64
import json
import logging
import time
import numpy as np
import cv2
from pathlib import Path
from typing import Optional, Dict, Any
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Global state
model_state = {
    "initialized": True,
    "processing": False
}

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize on startup"""
    logger.info("Starting simplified MuseTalk service")
    yield
    logger.info("Shutting down simplified MuseTalk service")

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
        "mode": "simplified"
    }

@app.post("/initialize")
async def initialize_model(request: Dict[str, Any]):
    """Initialize model"""
    return {"status": "initialized", "mode": "simplified"}

def analyze_audio_volume(audio_data: bytes) -> float:
    """Simple audio volume analysis"""
    try:
        # Convert bytes to numpy array
        audio_array = np.frombuffer(audio_data, dtype=np.float32)
        # Calculate RMS (root mean square) as volume indicator
        rms = np.sqrt(np.mean(audio_array**2))
        # Normalize to 0-1 range
        return min(1.0, rms * 10)
    except:
        return 0.0

def select_mouth_frame(volume: float, num_frames: int) -> int:
    """Select frame based on audio volume"""
    # Map volume to mouth openness
    # 0 = closed mouth, 1 = fully open
    # Assuming frames are ordered from closed to open mouth
    frame_idx = int(volume * (num_frames - 1))
    return min(frame_idx, num_frames - 1)

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for real-time streaming"""
    await websocket.accept()
    client_id = id(websocket)
    logger.info(f"WebSocket client {client_id} connected")
    
    # Load avatar video
    video_path = Path("/app/avatars/nodie-video-03.mp4")
    logger.info(f"Loading avatar video: {video_path}")
    
    video_frames = []
    mouth_states = []  # Store frames by mouth openness
    
    if video_path.exists():
        cap = cv2.VideoCapture(str(video_path))
        fps = cap.get(cv2.CAP_PROP_FPS)
        frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        
        logger.info(f"Video info - FPS: {fps}, Total frames: {frame_count}")
        
        # Load all frames
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            frame = cv2.resize(frame, (256, 256))
            video_frames.append(frame)
        
        cap.release()
        logger.info(f"Loaded {len(video_frames)} frames")
        
        # Organize frames into mouth states (simplified)
        # Assume video has different mouth positions throughout
        if len(video_frames) > 0:
            # Use 10 different mouth states
            num_states = min(10, len(video_frames))
            for i in range(num_states):
                idx = int(i * len(video_frames) / num_states)
                mouth_states.append(video_frames[idx])
            logger.info(f"Created {len(mouth_states)} mouth states")
    else:
        logger.warning(f"Video not found at {video_path}")
        # Create placeholder frame
        placeholder = np.ones((256, 256, 3), dtype=np.uint8) * 128
        video_frames = [placeholder]
        mouth_states = [placeholder]
    
    frame_count = 0
    last_volume = 0.0
    volume_history = []
    
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
                if len(volume_history) > 5:
                    volume_history.pop(0)
                smoothed_volume = np.mean(volume_history)
                
                # Select appropriate mouth frame based on volume
                if len(mouth_states) > 1:
                    mouth_idx = select_mouth_frame(smoothed_volume, len(mouth_states))
                    frame = mouth_states[mouth_idx].copy()
                    
                    if frame_count % 30 == 0:  # Log periodically
                        logger.info(f"Audio volume: {smoothed_volume:.2f}, Mouth state: {mouth_idx}/{len(mouth_states)}")
                else:
                    # Fallback to cycling through frames
                    frame = video_frames[frame_count % len(video_frames)]
                
                # Add some visual feedback for audio (optional)
                if smoothed_volume > 0.1:
                    # Add subtle glow effect when speaking
                    glow = np.ones_like(frame, dtype=np.float32)
                    glow[:, :] = [1.05, 1.02, 1.0]  # Slight warm tint
                    frame = np.clip(frame.astype(np.float32) * glow, 0, 255).astype(np.uint8)
                
                # Encode and send frame
                _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 90])
                frame_base64 = base64.b64encode(buffer).decode('utf-8')
                
                await websocket.send_json({
                    "type": "frame",
                    "timestamp": timestamp,
                    "frame": frame_base64
                })
                
                frame_count += 1
                last_volume = smoothed_volume
                
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
        "mode": "simplified",
        "description": "Using volume-based mouth animation instead of full MuseTalk",
        "model_status": model_state
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8765)