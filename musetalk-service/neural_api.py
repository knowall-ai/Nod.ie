"""Bounded, local MuseTalk 1.5 inference for Nod.ie's built-in portrait.

The inference architecture follows TMElyralab/MuseTalk (MIT). No uploads of
models, arbitrary paths, remote URLs, shell commands, or saved conversations.
"""
import asyncio
import io
import json
import logging
import math
import os
import subprocess
import tempfile
import threading
import time
from contextlib import asynccontextmanager
from pathlib import Path

import cv2
import numpy as np
import soundfile as sf
import torch
from diffusers import AutoencoderKL, UNet2DConditionModel
from fastapi import FastAPI, HTTPException, Request, Response
from scipy.signal import resample_poly
from transformers import WhisperFeatureExtractor, WhisperModel

LOG = logging.getLogger('nodie.musetalk')
MAX_BYTES = 5 * 1024 * 1024
MAX_SECONDS = 30
FPS = 25
BATCH_SIZE = int(os.environ.get("MUSETALK_BATCH_SIZE", "8"))
if not 1 <= BATCH_SIZE <= 8:
    raise ValueError("MUSETALK_BATCH_SIZE must be 1 to 8")
MODEL_ROOT = Path(os.environ.get('MODEL_ROOT', '/models'))
AVATAR_PATH = os.environ.get('AVATAR_PATH', '/avatars/nodie-default.png')
engine = None
busy = asyncio.Lock()


def read_audio(body):
    if len(body) > MAX_BYTES or body[:4] != b'RIFF' or body[8:12] != b'WAVE':
        raise ValueError('Expected a bounded WAV file')
    with sf.SoundFile(io.BytesIO(body)) as audio:
        if audio.channels not in (1, 2) or not 8000 <= audio.samplerate <= 96000 or not 0.1 <= audio.frames / audio.samplerate <= MAX_SECONDS:
            raise ValueError('Unsupported audio duration or format')
        samples = audio.read(dtype='float32', always_2d=True).mean(axis=1)
        rate = audio.samplerate
    if not np.isfinite(samples).all():
        raise ValueError('Invalid audio samples')
    divisor = math.gcd(rate, 16000)
    return resample_poly(samples, 16000 // divisor, rate // divisor).astype(np.float32)


class Engine:
    def __init__(self):
        if not torch.cuda.is_available():
            raise RuntimeError('CUDA is required; CPU inference is intentionally disabled')
        torch.set_num_threads(4)
        torch.cuda.set_per_process_memory_fraction(0.25)
        self.device, self.dtype = 'cuda', torch.float16
        self.vae = AutoencoderKL.from_pretrained(MODEL_ROOT / 'sd-vae-ft-mse', local_files_only=True, use_safetensors=True).eval().to(device=self.device, dtype=self.dtype)
        with open(MODEL_ROOT / 'musetalkV15/musetalk.json') as file:
            self.unet = UNet2DConditionModel(**json.load(file))
        # The setup script verifies official model hashes before installation.
        state = torch.load(MODEL_ROOT / 'musetalkV15/unet.pth', map_location='cpu', weights_only=True)
        self.unet.load_state_dict(state)
        del state
        self.unet = self.unet.eval().to(device=self.device, dtype=self.dtype)
        self.whisper = WhisperModel.from_pretrained(MODEL_ROOT / 'whisper-tiny', local_files_only=True, use_safetensors=True).eval().to(device=self.device, dtype=self.dtype)
        self.extractor = WhisperFeatureExtractor.from_pretrained(MODEL_ROOT / 'whisper-tiny', local_files_only=True)
        position = torch.arange(50, dtype=torch.float32).unsqueeze(1)
        scale = torch.exp(torch.arange(0, 384, 2, dtype=torch.float32) * (-math.log(10000.0) / 384))
        encoding = torch.zeros(50, 384)
        encoding[:, 0::2], encoding[:, 1::2] = torch.sin(position * scale), torch.cos(position * scale)
        self.encoding = encoding.unsqueeze(0).to(device=self.device, dtype=self.dtype)
        self.image = cv2.imread(AVATAR_PATH)
        if self.image is None:
            raise RuntimeError('Built-in avatar is missing')
        self.image = cv2.resize(self.image, (512, 512))
        # Calibrated once for the bundled portrait: no extra face-detection models.
        self.box = tuple(int(v * 512) for v in (0.31, 0.165, 0.68, 0.60))
        x1, y1, x2, y2 = self.box
        crop = cv2.resize(self.image[y1:y2, x1:x2], (256, 256))
        tensor = torch.from_numpy(crop[:, :, ::-1].copy()).permute(2, 0, 1).unsqueeze(0).to(device=self.device, dtype=self.dtype) / 255
        masked = tensor.clone(); masked[:, :, 128:, :] = 0
        with torch.inference_mode():
            # A deterministic cached reference avoids random changes between responses.
            latents = [self.vae.encode(image * 2 - 1).latent_dist.mode() * self.vae.config.scaling_factor for image in (masked, tensor)]
            self.latent = torch.cat(latents, dim=1)
        mask = np.zeros((y2 - y1, x2 - x1), np.float32)
        cv2.ellipse(mask, (mask.shape[1] // 2, int(mask.shape[0] * .71)), (int(mask.shape[1] * .43), int(mask.shape[0] * .25)), 0, 0, 360, 1, -1)
        self.mask = cv2.GaussianBlur(mask, (21, 21), 0)[..., None]
        self.last_stats = {}
        # Warm up feature extraction and kernels before /health reports ready.
        self.render(np.zeros(3200, np.float32), threading.Event())
        torch.cuda.empty_cache()

    @torch.inference_mode()
    def render(self, samples, cancelled, video_only=False):
        start = time.monotonic()
        torch.cuda.reset_peak_memory_stats()
        features = self.extractor(samples, sampling_rate=16000, return_tensors='pt').input_features.to(device=self.device, dtype=self.dtype)
        hidden = self.whisper.encoder(features, output_hidden_states=True).hidden_states
        hidden = torch.stack(hidden, dim=2)[:, :math.floor(len(samples) / 16000 * 50)]
        hidden = torch.cat([torch.zeros_like(hidden[:, :4]), hidden, torch.zeros_like(hidden[:, :12])], dim=1)
        count = max(1, math.floor(len(samples) / 16000 * FPS))
        chunks = torch.cat([hidden[:, i * 2:i * 2 + 10] for i in range(count)], dim=0).reshape(count, 50, 384)
        with tempfile.TemporaryDirectory(prefix='nodie-lips-') as directory:
            directory = Path(directory)
            wav = directory / 'speech.wav'; output = directory / 'reply.mp4'
            if not video_only:
                sf.write(wav, samples, 16000, subtype='PCM_16')
            args = ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pixel_format', 'bgr24', '-video_size', '512x512', '-framerate', str(FPS), '-i', 'pipe:0']
            if not video_only:
                args += ['-i', str(wav)]
            args += ['-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '22', '-pix_fmt', 'yuv420p', '-threads', '2']
            args += ['-an'] if video_only else ['-c:a', 'aac', '-shortest']
            args += ['-movflags', '+faststart', str(output)]
            process = subprocess.Popen(args, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            try:
                x1, y1, x2, y2 = self.box
                for at in range(0, count, BATCH_SIZE):
                    if cancelled.is_set():
                        raise RuntimeError('cancelled')
                    audio = chunks[at:at + BATCH_SIZE] + self.encoding
                    latent = self.latent.expand(len(audio), -1, -1, -1)
                    prediction = self.unet(latent, torch.tensor([0], device=self.device), encoder_hidden_states=audio).sample
                    faces = self.vae.decode(prediction / self.vae.config.scaling_factor).sample
                    faces = ((faces / 2 + .5).clamp(0, 1).permute(0, 2, 3, 1).float().cpu().numpy() * 255).round().astype(np.uint8)[..., ::-1]
                    for face in faces:
                        frame = self.image.copy()
                        region = cv2.resize(face, (x2 - x1, y2 - y1))
                        frame[y1:y2, x1:x2] = (region * self.mask + frame[y1:y2, x1:x2] * (1 - self.mask)).astype(np.uint8)
                        process.stdin.write(frame.tobytes())
                process.stdin.close()
                if process.wait(timeout=15):
                    raise RuntimeError('Video encoding failed')
                if output.stat().st_size > 20 * 1024 * 1024:
                    raise RuntimeError('Video output exceeds limit')
                result = output.read_bytes()
            finally:
                if process.poll() is None:
                    process.kill(); process.wait()
                if not process.stdin.closed:
                    process.stdin.close()
        self.last_stats = {'frames': count, 'duration_seconds': round(len(samples) / 16000, 3), 'render_seconds': round(time.monotonic() - start, 3), 'peak_gpu_mib': round(torch.cuda.max_memory_allocated() / 2**20)}
        LOG.info('render_completed %s', json.dumps(self.last_stats))
        return result


@asynccontextmanager
async def lifespan(_app):
    global engine
    engine = await asyncio.to_thread(Engine)
    yield
    engine = None
    torch.cuda.empty_cache()


app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)


@app.get('/health')
async def health():
    return {'status': 'ready' if engine else 'starting', 'model': 'MuseTalk 1.5', 'device': 'cuda', 'busy': busy.locked(), 'last_render': engine.last_stats if engine else {}}


@app.post('/render')
async def render(request: Request):
    # Browser clients must go through Nod.ie's same-origin bridge.
    if request.headers.get('origin') or request.headers.get('content-type', '').split(';')[0] != 'audio/wav':
        raise HTTPException(403, 'Use the local application bridge')
    video_only = request.headers.get('x-nodie-video-only', '0')
    if video_only not in {'0', '1'}:
        raise HTTPException(400, 'Invalid video-only mode')
    if busy.locked():
        raise HTTPException(409, 'Renderer busy')
    async with busy:
        body = bytearray()
        try:
            async with asyncio.timeout(10):
                async for chunk in request.stream():
                    body.extend(chunk)
                    if len(body) > MAX_BYTES:
                        raise HTTPException(413, 'Audio exceeds limit')
            samples = read_audio(body)
        except (ValueError, RuntimeError):
            raise HTTPException(400, 'Invalid WAV audio')
        except TimeoutError:
            raise HTTPException(408, 'Audio upload timed out')
        cancelled = threading.Event()
        task = asyncio.create_task(asyncio.to_thread(engine.render, samples, cancelled, video_only == '1'))
        deadline = time.monotonic() + 60
        try:
            while not task.done():
                if await request.is_disconnected() or time.monotonic() > deadline:
                    cancelled.set()
                await asyncio.sleep(.05)
            video = await task
            return Response(video, media_type='video/mp4', headers={'Cache-Control': 'no-store'})
        except Exception:
            LOG.warning('render_failed')
            raise HTTPException(503, 'Lip-sync rendering unavailable')
        finally:
            cancelled.set()
            # Do not release the GPU lock until a cancelled worker actually exits.
            if not task.done():
                try:
                    await asyncio.shield(task)
                except Exception:
                    pass
