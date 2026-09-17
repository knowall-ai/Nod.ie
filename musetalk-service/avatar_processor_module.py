"""
Avatar Processing Module for MuseTalk
Handles video loading, face detection, and frame generation
"""

import logging
import cv2
import numpy as np
from pathlib import Path
import torch
import tempfile
import os

logger = logging.getLogger(__name__)

class AvatarProcessorModule:
    def __init__(self, model_state):
        self.model_state = model_state
        
    def load_avatar_video(self, video_path):
        """Load and prepare avatar video frames"""
        video_path = Path(video_path)
        logger.info(f"Loading avatar video: {video_path}")
        
        if not video_path.exists():
            raise FileNotFoundError(f"Avatar video not found: {video_path}")
        
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
        
        return frames
    
    def prepare_avatar_materials(self, frames):
        """Prepare avatar materials for MuseTalk processing"""
        avatar_info = {}
        vae_encode_latents = []
        
        if not self.model_state["initialized"] or not frames:
            return avatar_info, vae_encode_latents
            
        try:
            # Import MuseTalk utilities
            from musetalk.utils.preprocessing import get_landmark_and_bbox
            from musetalk.utils.blending import get_image_prepare_material
            
            # Save frames temporarily for preprocessing
            temp_dir = tempfile.mkdtemp()
            temp_paths = []
            
            # Save first 10 frames as temporary images
            for i, frame in enumerate(frames[:10]):
                temp_path = os.path.join(temp_dir, f"frame_{i:03d}.jpg")
                cv2.imwrite(temp_path, frame)
                temp_paths.append(temp_path)
            
            # Now use the file-based preprocessing
            coord_list, frame_list = get_landmark_and_bbox(temp_paths, 10)
            
            # Clean up temp files
            for temp_path in temp_paths:
                if os.path.exists(temp_path):
                    os.remove(temp_path)
            os.rmdir(temp_dir)
            
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
                    fp=self.model_state["face_parsing"]
                )
                
                # Debug what avatar_info contains
                logger.info(f"Avatar info type: {type(avatar_info)}")
                logger.info(f"Avatar info: {avatar_info}")
                
                # Handle if avatar_info is a tuple instead of dict
                if isinstance(avatar_info, tuple):
                    logger.warning("avatar_info is tuple, converting to dict format")
                    # Assume it returns (crop_info, mask_info) or similar
                    avatar_info = {
                        "mask_crop": avatar_info[0] if len(avatar_info) > 0 else None,
                        "face_mask": avatar_info[1] if len(avatar_info) > 1 else None
                    }
                
                # Encode frames to latents
                logger.info("Encoding frames to latents...")
                for i, frame in enumerate(frames[:50]):  # Limit for memory
                    if i % 10 == 0:
                        logger.info(f"Encoding frame {i}...")
                    # Use the correct VAE method that handles preprocessing
                    try:
                        # Ensure frame is 256x256 BGR format for VAE
                        crop_frame = cv2.resize(frame, (256, 256), interpolation=cv2.INTER_LANCZOS4)
                        
                        # Use get_latents_for_unet which handles all preprocessing internally
                        latent = self.model_state["vae"].get_latents_for_unet(crop_frame)
                        logger.debug(f"Successfully encoded frame {i} to latent shape: {latent.shape}")
                    except Exception as e:
                        logger.error(f"VAE encoding failed for frame {i}: {e}")
                        # Skip this frame and continue with fallback
                        continue
                    vae_encode_latents.append(latent)
                
                logger.info(f"Encoded {len(vae_encode_latents)} latents")
            else:
                logger.warning("No face detected in video")
                
        except Exception as e:
            logger.error(f"Error preparing avatar: {e}")
            import traceback
            traceback.print_exc()
            
        return avatar_info, vae_encode_latents
    
    def generate_lip_synced_frame(self, whisper_chunks, vae_encode_latents, avatar_info, video_frames, frame_count):
        """Generate lip-synced frame using MuseTalk pipeline"""
        if not whisper_chunks or not vae_encode_latents:
            # No whisper chunks or latents, use fallback
            return video_frames[frame_count % len(video_frames)]
            
        try:
            # Import MuseTalk utilities
            from musetalk.utils.utils import datagen
            from musetalk.utils.blending import get_image_blending
            
            # Get a latent for this frame
            latent_idx = frame_count % len(vae_encode_latents)
            current_latent = vae_encode_latents[latent_idx]
            
            # Process with datagen (simplified for real-time)
            for whisper_batch, latent_batch in datagen(
                [whisper_chunks],
                [current_latent],
                batch_size=1,
                delay_frame=0,
                device=self.model_state["device"]
            ):
                # Apply positional encoding
                audio_feature_batch = self.model_state["pe"](whisper_batch)
                
                # Generate with UNet
                timesteps = torch.zeros(1, device=self.model_state["device"], dtype=torch.long)
                pred_latents = self.model_state["unet"].model(
                    latent_batch,
                    timesteps,
                    encoder_hidden_states=audio_feature_batch
                ).sample
                
                # Decode latents to image
                recon = self.model_state["vae"].decode_latents(pred_latents)
                
                # Blend with original frame
                base_frame = video_frames[frame_count % len(video_frames)]
                frame = get_image_blending(
                    base_frame,
                    recon[0],
                    avatar_info
                )
                
                logger.debug("✅ Generated actual lip-synced frame using MuseTalk")
                return frame
                
        except Exception as e:
            logger.warning(f"MuseTalk processing failed: {e}, using fallback")
            return video_frames[frame_count % len(video_frames)]