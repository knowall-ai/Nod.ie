"""
Audio Processing Module for MuseTalk
Handles PCM, OGG, and Opus audio format processing
"""

import logging
import tempfile
import os
import subprocess
import numpy as np
import scipy.signal
import torch

logger = logging.getLogger(__name__)

class AudioProcessorModule:
    def __init__(self, model_state):
        self.model_state = model_state
    
    def process_audio_data(self, audio_data, audio_format, sample_rate=24000, channels=1, bit_depth=16):
        """
        Process audio data based on format and return normalized float32 array
        
        Returns:
            audio_array: numpy array of float32 audio samples at 24kHz
        """
        logger.info(f"📤 Processing audio data: {len(audio_data)} bytes, format: {audio_format}")
        
        if audio_format == "pcm":
            return self._process_pcm_audio(audio_data, sample_rate)
        else:
            return self._process_opus_audio(audio_data, audio_format)
    
    def _process_pcm_audio(self, audio_data, sample_rate):
        """Process PCM audio directly"""
        # PCM audio is already in Int16 format
        audio_array = np.frombuffer(audio_data, dtype=np.int16).astype(np.float32)
        audio_array = audio_array / (2**15)  # Normalize from int16 to float32
        
        # Resample if needed (Whisper expects 24kHz)
        if sample_rate != 24000:
            # Resample to 24kHz
            num_samples = int(len(audio_array) * 24000 / sample_rate)
            audio_array = scipy.signal.resample(audio_array, num_samples)
            logger.info(f"Resampled from {sample_rate}Hz to 24000Hz")
        
        logger.info(f"✅ Successfully processed PCM audio: {len(audio_array)} samples at 24kHz")
        return audio_array
    
    def _process_opus_audio(self, audio_data, audio_format):
        """Process OGG/Opus audio formats"""
        logger.debug(f"First 20 bytes: {audio_data[:20].hex() if len(audio_data) >= 20 else audio_data.hex()}")
        
        # Detect audio format
        if len(audio_data) >= 4:
            header = audio_data[:4]
            if header == b'OggS':
                logger.info("✅ Valid OGG header detected")
                audio_format = "ogg"
            else:
                logger.info(f"📊 Raw Opus frames detected (first 4 bytes: {header.hex()})")
                audio_format = "raw_opus"
        else:
            logger.warning(f"⚠️ Audio data too short: {len(audio_data)} bytes")
        
        # Decode audio using ffmpeg
        try:
            # Save to temporary file with appropriate extension
            suffix = '.ogg' if audio_format == "ogg" else '.opus'
            with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as temp_file:
                temp_file.write(audio_data)
                temp_audio_path = temp_file.name
            
            # Create temporary WAV file for output
            temp_wav_path = temp_audio_path.replace(suffix, '.wav')
            
            # Build ffmpeg command based on format
            if audio_format == "raw_opus":
                # For raw Opus frames, specify input format
                cmd = [
                    '/usr/bin/ffmpeg',
                    '-hide_banner',
                    '-loglevel', 'error',
                    '-f', 'opus',       # Specify raw Opus input format
                    '-i', temp_audio_path,
                    '-ar', '24000',     # 24kHz sample rate
                    '-ac', '1',         # mono
                    '-acodec', 'pcm_s16le',
                    '-f', 'wav',
                    '-y',
                    temp_wav_path
                ]
            else:
                # For OGG Opus, use standard decoding
                cmd = [
                    '/usr/bin/ffmpeg',
                    '-hide_banner',
                    '-loglevel', 'error',
                    '-i', temp_audio_path,
                    '-ar', '24000',     # 24kHz sample rate
                    '-ac', '1',         # mono
                    '-acodec', 'pcm_s16le',
                    '-f', 'wav',
                    '-y',
                    temp_wav_path
                ]
            
            logger.debug(f"Running system ffmpeg: {' '.join(cmd)}")
            result = subprocess.run(cmd, capture_output=True, text=True)
            
            if result.returncode == 0:
                # Load the converted WAV file
                import wave
                with wave.open(temp_wav_path, 'rb') as wav_file:
                    frames = wav_file.readframes(wav_file.getnframes())
                    audio_array = np.frombuffer(frames, dtype=np.int16).astype(np.float32)
                    audio_array = audio_array / (2**15)  # Normalize from int16 to float32
                    sample_rate = wav_file.getframerate()
                
                # Clean up temp files
                os.unlink(temp_audio_path)
                os.unlink(temp_wav_path)
                
                logger.info(f"✅ Successfully decoded Opus audio with system ffmpeg: {len(audio_array)} samples at {sample_rate}Hz")
                return audio_array
            else:
                logger.error(f"System ffmpeg failed with return code {result.returncode}")
                logger.error(f"ffmpeg stderr: {result.stderr}")
                raise Exception(f"System ffmpeg decoding failed: {result.stderr}")
                
        except Exception as e:
            logger.error(f"Audio processing failed: {e}")
            raise
    
    def get_whisper_features(self, audio_array):
        """Process audio with Whisper to get features for lip-sync"""
        if not self.model_state["whisper"] or not self.model_state["audio_processor"]:
            logger.debug("Whisper model not available")
            return None
            
        try:
            # Convert numpy array to PyTorch tensor for Whisper processing
            audio_tensor = torch.from_numpy(audio_array).to(self.model_state["device"])
            
            # Get whisper features from the decoded audio
            whisper_chunks = self.model_state["audio_processor"].get_whisper_chunk(
                audio_tensor,
                self.model_state["device"],
                self.model_state["dtype"],
                self.model_state["whisper"],
                librosa_length=len(audio_array)
            )
            
            logger.debug(f"Generated whisper chunks: {len(whisper_chunks) if whisper_chunks else 0}")
            
            # Debug whisper_chunks format
            if whisper_chunks:
                logger.debug(f"Whisper chunks type: {type(whisper_chunks)}")
                if isinstance(whisper_chunks, (list, tuple)):
                    logger.debug(f"Whisper chunks length: {len(whisper_chunks)}")
                    if len(whisper_chunks) > 0:
                        logger.debug(f"First chunk type: {type(whisper_chunks[0])}")
                        logger.debug(f"First chunk shape: {getattr(whisper_chunks[0], 'shape', 'no shape')}")
            
            return whisper_chunks
            
        except Exception as e:
            logger.error(f"Whisper processing failed: {e}")
            return None