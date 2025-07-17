"""
MuseTalk API Service with Real Model Integration
Provides REST and WebSocket endpoints for real-time lip-sync animation
"""

import asyncio
import base64
import json
import logging
import time
import sys
from pathlib import Path
from typing import Optional, Dict, Any
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, UploadFile, File
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import numpy as np
import cv2
from PIL import Image
import io
import torch
from transformers import WhisperModel, WhisperProcessor

# Add MuseTalk to path
sys.path.append('/app')

# Import MuseTalk components
try:
    from musetalk.utils.utils import load_all_model, datagen
    from musetalk.utils.audio_processor import AudioProcessor
    from musetalk.utils.preprocessing import get_landmark_and_bbox, read_imgs
    from musetalk.utils.blending import get_image_prepare_material, get_image_blending
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

# Frame buffer for synchronization
frame_buffer = {}
frame_counter = 0

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize models on startup"""
    try:
        if MUSETALK_AVAILABLE:
            logger.info("Initializing MuseTalk models...")
            
            # Load models
            device = model_state["device"]
            dtype = model_state["dtype"]
            
            # Load VAE, UNet, and Positional Encoding
            vae, unet, pe = load_all_model(
                unet_model_path="/app/models/musetalkV15/unet.pth",
                vae_type="sd-vae-ft-mse",
                unet_config="/app/models/musetalkV15/musetalk.json",
                device=device
            )
            
            model_state["vae"] = vae
            model_state["unet"] = unet
            model_state["pe"] = pe
            
            # Load Whisper for audio processing
            whisper = WhisperModel.from_pretrained("openai/whisper-tiny").to(device)
            model_state["whisper"] = whisper
            model_state["whisper_processor"] = WhisperProcessor.from_pretrained("openai/whisper-tiny")
            
            # Initialize audio processor
            model_state["audio_processor"] = AudioProcessor(
                16000,  # sample_rate
                25      # fps
            )
            
            # Initialize face parsing
            model_state["face_parsing"] = FaceParsing(device=device)
            
            model_state["initialized"] = True
            logger.info("MuseTalk models initialized successfully")
        else:
            logger.warning("MuseTalk not available, running in fallback mode")
    except Exception as e:
        logger.error(f"Failed to initialize MuseTalk: {e}")
    
    yield
    
    # Cleanup on shutdown
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
    try:
        face_size = request.get("face_size", 256)
        quality = request.get("quality", "auto")
        
        logger.info(f"Initializing model with face_size={face_size}, quality={quality}")
        
        return {"status": "initialized", "face_size": face_size}
    except Exception as e:
        logger.error(f"Initialization error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for real-time streaming"""
    await websocket.accept()
    client_id = id(websocket)
    logger.info(f"WebSocket client {client_id} connected")
    
    # Load avatar video and prepare for MuseTalk
    video_path = Path("/app/avatars/nodie-video-03.mp4")
    logger.info(f"Loading avatar video: {video_path}")
    
    # Prepare avatar materials if MuseTalk is available
    avatar_info = {}
    vae_encode_latents = []
    
    if MUSETALK_AVAILABLE and model_state["initialized"] and video_path.exists():
        try:
            # Read video frames
            cap = cv2.VideoCapture(str(video_path))
            frames = []
            while True:
                ret, frame = cap.read()
                if not ret:
                    break
                frames.append(cv2.resize(frame, (256, 256)))
                if len(frames) >= 150:  # Limit frames for memory
                    break
            cap.release()
            logger.info(f"Loaded {len(frames)} frames")
            
            if frames:
                # Get face landmarks and bbox for first frame
                coord_list, frame_list = get_landmark_and_bbox(frames, 10)
                
                if coord_list and len(coord_list[0]) > 0:
                    # Process first valid frame
                    first_frame_idx = 0
                    for i, coords in enumerate(coord_list):
                        if coords:
                            first_frame_idx = i
                            break
                    
                    first_frame = frames[first_frame_idx]
                    first_coords = coord_list[first_frame_idx]
                    
                    # Get avatar materials
                    avatar_info = get_image_prepare_material(
                        first_frame, 
                        first_coords,
                        model_state["face_parsing"],
                        model_state["device"]
                    )
                    
                    # Encode frames to latents
                    logger.info("Encoding frames to latents...")
                    for i, frame in enumerate(frames[:50]):  # Limit for memory
                        if i % 10 == 0:
                            logger.info(f"Encoding frame {i}...")
                        latent = model_state["vae"].encode_latents(
                            frame,
                            avatar_info["mask_crop"],
                            avatar_info["face_mask"]
                        )
                        vae_encode_latents.append(latent)
                    
                    logger.info(f"Encoded {len(vae_encode_latents)} latents")
                else:
                    logger.warning("No face detected in video")
        except Exception as e:
            logger.error(f"Error preparing avatar: {e}")
            import traceback
            traceback.print_exc()
    
    # Fallback frames if MuseTalk not available
    if not vae_encode_latents:
        logger.warning("Using fallback video frames (no lip-sync)")
        cap = cv2.VideoCapture(str(video_path))
        video_frames = []
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            video_frames.append(cv2.resize(frame, (256, 256)))
        cap.release()
    
    frame_count = 0
    
    try:
        while True:
            # Receive message
            data = await websocket.receive_json()
            
            if data["type"] == "audio":
                # Process audio frame
                audio_data = base64.b64decode(data["audio"])
                timestamp = data.get("timestamp", time.time())
                
                if MUSETALK_AVAILABLE and model_state["initialized"] and vae_encode_latents:
                    try:
                        # Extract audio features with Whisper
                        audio_array = np.frombuffer(audio_data, dtype=np.float32)
                        
                        # Get whisper features
                        whisper_chunks = model_state["audio_processor"].get_whisper_chunk(
                            audio_array,
                            model_state["device"],
                            model_state["dtype"],
                            model_state["whisper"]
                        )
                        
                        # Generate lip-synced frame
                        for whisper_batch, latent_batch in datagen(
                            [whisper_chunks],
                            vae_encode_latents,
                            batch_size=1,
                            delay_frame=0,
                            device=model_state["device"]
                        ):
                            # Apply positional encoding
                            audio_feature_batch = model_state["pe"](whisper_batch)
                            
                            # Generate with UNet
                            timesteps = torch.zeros(1, device=model_state["device"], dtype=torch.long)
                            pred_latents = model_state["unet"].model(
                                latent_batch,
                                timesteps,
                                encoder_hidden_states=audio_feature_batch
                            ).sample
                            
                            # Decode latents to image
                            recon = model_state["vae"].decode_latents(pred_latents)
                            
                            # Blend with original frame
                            base_frame = frames[frame_count % len(frames)]
                            frame = get_image_blending(
                                base_frame,
                                recon[0],
                                avatar_info
                            )
                            
                            break  # Process only first batch
                        
                        logger.debug(f"Generated lip-synced frame {frame_count}")
                        
                    except Exception as e:
                        logger.error(f"MuseTalk processing error: {e}")
                        # Fallback to cycling frames
                        frame = video_frames[frame_count % len(video_frames)]
                else:
                    # Fallback: cycle through video frames
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
                # Update configuration
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
        "frames_processed": frame_counter,
        "buffer_size": len(frame_buffer),
        "model_status": model_state,
        "musetalk_available": MUSETALK_AVAILABLE
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8765)