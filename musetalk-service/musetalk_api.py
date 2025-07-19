"""
MuseTalk API Service - Refactored Main Entry Point
Uses modular architecture with separate audio and avatar processing modules
"""

import asyncio
import base64
import json
import logging
import os
import sys
import time
from pathlib import Path
from typing import Optional, Dict, Any
from contextlib import asynccontextmanager

import numpy as np
import cv2
import torch
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from transformers import WhisperModel, WhisperProcessor

# Add modules to path
sys.path.append('/app')

# Import our modular components
from audio_processor_module import AudioProcessorModule
from avatar_processor_module import AvatarProcessorModule

# Import MuseTalk components
try:
    from musetalk.utils.utils import load_all_model
    from musetalk.utils.audio_processor import AudioProcessor
    from musetalk.utils.face_parsing import FaceParsing
    MUSETALK_AVAILABLE = True
except ImportError as e:
    logging.warning(f"MuseTalk not available: {e}")
    MUSETALK_AVAILABLE = False

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Global state
model_state = {
    "initialized": False,
    "vae": None,
    "unet": None,
    "pe": None,
    "whisper": None,
    "whisper_processor": None,
    "audio_processor": None,
    "face_parsing": None,
    "device": "cuda" if torch.cuda.is_available() else "cpu",
    "dtype": torch.float16 if torch.cuda.is_available() else torch.float32,
    "processing": False
}

# Initialize modules
audio_module = None
avatar_module = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize models on startup"""
    global audio_module, avatar_module
    
    try:
        if MUSETALK_AVAILABLE:
            logger.info("Initializing MuseTalk models...")
            
            # Load models
            device = model_state["device"]
            dtype = model_state["dtype"]
            
            # Load VAE, UNet, and Positional Encoding
            vae, unet, pe = load_all_model(
                unet_model_path="/app/models/musetalkV15/unet.pth",
                vae_type="/app/models/sd-vae",
                unet_config="/app/models/musetalkV15/musetalk.json",
                device=device
            )
            
            model_state["vae"] = vae
            model_state["unet"] = unet
            model_state["pe"] = pe
            
            # Load Whisper for audio processing
            try:
                whisper_model_name = "openai/whisper-tiny"
                logger.info(f"Loading Whisper model: {whisper_model_name}")
                whisper = WhisperModel.from_pretrained(whisper_model_name).to(device)
                model_state["whisper"] = whisper
                model_state["whisper_processor"] = WhisperProcessor.from_pretrained(whisper_model_name)
                logger.info("Whisper model loaded successfully")
            except Exception as e:
                logger.error(f"Failed to load Whisper model: {e}")
                model_state["whisper"] = None
                model_state["whisper_processor"] = None
            
            # Initialize audio processor
            model_state["audio_processor"] = AudioProcessor(feature_extractor_path="openai/whisper-tiny")
            
            # Initialize face parsing
            model_state["face_parsing"] = FaceParsing()
            
            # Initialize our modules
            audio_module = AudioProcessorModule(model_state)
            avatar_module = AvatarProcessorModule(model_state)
            
            model_state["initialized"] = True
            logger.info("MuseTalk models initialized successfully")
        else:
            logger.warning("MuseTalk not available, running in fallback mode")
    except Exception as e:
        logger.error(f"Failed to initialize MuseTalk: {e}")
    
    yield
    
    logger.info("Shutting down MuseTalk service")

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
    """Check service health and model status"""
    return {
        "status": "healthy" if model_state["initialized"] else "initializing",
        "model_loaded": model_state["initialized"],
        "device": model_state["device"],
        "processing": model_state["processing"],
        "musetalk_available": MUSETALK_AVAILABLE
    }

@app.post("/initialize")
async def initialize_model(request: Dict[str, Any]):
    """Initialize or reinitialize the model with specific parameters"""
    face_size = request.get("face_size", 256)
    quality = request.get("quality", "auto")
    logger.info(f"Initializing model with face_size={face_size}, quality={quality}")
    return {"status": "initialized", "face_size": face_size}

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for real-time streaming"""
    await websocket.accept()
    client_id = id(websocket)
    logger.info(f"WebSocket client {client_id} connected")
    
    # Load avatar video
    avatar_video = os.environ.get('AVATAR_VIDEO_PATH')
    if not avatar_video:
        logger.error("AVATAR_VIDEO_PATH environment variable not set")
        await websocket.close(code=1008, reason="Avatar video path not configured")
        return
        
    video_path = Path(avatar_video)
    logger.info(f"Loading avatar video: {video_path}")
    
    # Load video frames
    try:
        video_frames = avatar_module.load_avatar_video(video_path)
    except FileNotFoundError:
        logger.error(f"Avatar video not found: {video_path}")
        await websocket.close(code=1008, reason="Avatar video not found")
        return
    
    # Prepare avatar materials if MuseTalk is available
    avatar_info = {}
    vae_encode_latents = []
    
    if MUSETALK_AVAILABLE and model_state["initialized"]:
        avatar_info, vae_encode_latents = avatar_module.prepare_avatar_materials(video_frames)
    
    if not vae_encode_latents:
        logger.warning("Using fallback video frames (no lip-sync)")
    
    frame_count = 0
    
    try:
        while True:
            # Receive message
            data = await websocket.receive_json()
            
            if data["type"] == "audio":
                # Process audio frame
                audio_data = base64.b64decode(data["audio"])
                timestamp = data.get("timestamp", time.time())
                
                # Get audio metadata
                audio_format = data.get("format", "ogg")
                sample_rate = data.get("sampleRate", 24000)
                channels = data.get("channels", 1)
                bit_depth = data.get("bitDepth", 16)
                
                # Initialize frame variable
                frame = None
                
                if MUSETALK_AVAILABLE and model_state["initialized"] and vae_encode_latents:
                    try:
                        # Process audio data
                        audio_array = audio_module.process_audio_data(
                            audio_data, audio_format, sample_rate, channels, bit_depth
                        )
                        
                        # Get Whisper features
                        whisper_chunks = audio_module.get_whisper_features(audio_array)
                        
                        # Generate lip-synced frame
                        frame = avatar_module.generate_lip_synced_frame(
                            whisper_chunks, vae_encode_latents, avatar_info, 
                            video_frames, frame_count
                        )
                        
                    except Exception as e:
                        logger.error(f"MuseTalk processing error: {e}")
                        frame = video_frames[frame_count % len(video_frames)]
                else:
                    # Fallback: cycle through video frames
                    frame = video_frames[frame_count % len(video_frames)]
                
                # Ensure frame is valid
                if frame is None:
                    logger.warning("Frame is None, using fallback")
                    frame = video_frames[frame_count % len(video_frames)]
                
                # Encode and send frame
                _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 90])
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
        "frames_processed": frame_count if 'frame_count' in locals() else 0,
        "model_status": model_state,
        "musetalk_available": MUSETALK_AVAILABLE
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8765)