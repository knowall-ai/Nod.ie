"""Loopback CPU diarisation. Audio stays in memory and is never logged or retained."""
import hashlib
import json
import os
import subprocess
import time
import threading
from deadline_worker import DeadlineEngine, BusyError
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit
import numpy as np
import sherpa_onnx

ROOT = Path(__file__).resolve().parents[1]
MODEL_DIR = Path(os.environ.get('NODIE_SPEAKER_MODELS', ROOT / 'recognition-models' / 'speaker'))

class SpeakerEngine:
    def __init__(self, model_dir=MODEL_DIR):
        manifest = json.loads((ROOT / 'recognition' / 'speaker-models.json').read_text())
        for name, expected in manifest['files'].items():
            if hashlib.sha256((model_dir / name).read_bytes()).hexdigest() != expected:
                raise RuntimeError('Speaker model checksum mismatch')
        self.model_id = manifest['files']['embedding.onnx']
        embedding = sherpa_onnx.SpeakerEmbeddingExtractorConfig(model=str(model_dir / 'embedding.onnx'), num_threads=2, provider='cpu')
        config = sherpa_onnx.OfflineSpeakerDiarizationConfig(
            segmentation=sherpa_onnx.OfflineSpeakerSegmentationModelConfig(
                pyannote=sherpa_onnx.OfflineSpeakerSegmentationPyannoteModelConfig(model=str(model_dir / 'segmentation.onnx')),
                num_threads=2, provider='cpu'),
            embedding=embedding,
            clustering=sherpa_onnx.FastClusteringConfig(num_clusters=-1, threshold=0.5),
            min_duration_on=0.3, min_duration_off=0.5)
        if not config.validate():
            raise RuntimeError('Invalid speaker model configuration')
        self.diarizer = sherpa_onnx.OfflineSpeakerDiarization(config)
        self.extractor = sherpa_onnx.SpeakerEmbeddingExtractor(embedding)

    def analyse(self, body):
        # Restrict demuxer input to supported recorder containers, with no file/network protocols.
        if not (body.startswith(b'OggS') or body.startswith(b'\x1aE\xdf\xa3') or (body.startswith(b'RIFF') and body[8:12] == b'WAVE')):
            raise ValueError('Unsupported audio container')
        decoded = subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-nostdin', '-protocol_whitelist', 'pipe', '-i', 'pipe:0', '-vn', '-t', '30', '-ac', '1', '-ar', '16000', '-f', 'f32le', 'pipe:1'], input=body, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=8, check=True).stdout
        samples = np.frombuffer(decoded, dtype='<f4').copy()
        if not 1600 <= len(samples) <= 480000 or not np.isfinite(samples).all():
            raise ValueError('Invalid audio duration')
        intervals = self.diarizer.process(samples).sort_by_start_time()
        if len(intervals) > 64 or len({r.speaker for r in intervals}) > 8:
            raise ValueError('Too many speaker segments')
        segments = [{'start': round(r.start, 3), 'end': round(r.end, 3), 'speaker': int(r.speaker)} for r in intervals]
        speakers = []
        for speaker in sorted({r.speaker for r in intervals}):
            clean = [r for r in intervals if r.speaker == speaker and not any(other.speaker != speaker and max(r.start, other.start) < min(r.end, other.end) for other in intervals)]
            chunks = [samples[max(0, int(r.start * 16000)):min(len(samples), int(r.end * 16000))] for r in clean]
            voice = np.concatenate(chunks)[:160000] if chunks else np.empty(0, dtype=np.float32)
            embedding = None
            if len(voice) >= 24000:
                stream = self.extractor.create_stream()
                stream.accept_waveform(16000, voice)
                stream.input_finished()
                if self.extractor.is_ready(stream):
                    vector = np.asarray(self.extractor.compute(stream), dtype=np.float32)
                    norm = np.linalg.norm(vector)
                    if np.isfinite(vector).all() and norm > 0:
                        embedding = (vector / norm).tolist()
            speakers.append({'speaker': int(speaker), 'cleanSeconds': round(len(voice) / 16000, 3), 'embedding': embedding})
        return {'model': self.model_id, 'duration': round(len(samples) / 16000, 3), 'segments': segments, 'speakers': speakers}

class Handler(BaseHTTPRequestHandler):
    engine = None
    requests = threading.BoundedSemaphore(2)
    def setup(self):
        super().setup()
        self.connection.settimeout(10)
    def log_message(self, *_args):
        pass
    def reply(self, status, result):
        payload = json.dumps(result, allow_nan=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(payload)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.end_headers()
        self.wfile.write(payload)
    def local_request(self):
        return not self.headers.get('Origin') and urlsplit('http://' + self.headers.get('Host', '')).hostname in ('localhost', '127.0.0.1')
    def do_GET(self):
        if not self.local_request():
            return self.reply(403, {'error': 'Forbidden'})
        if self.path != '/health':
            return self.reply(404, {'error': 'Not found'})
        self.reply(200, {'ready': True, 'device': 'cpu', 'threads': 2, 'model': self.engine.model_id})
    def do_POST(self):
        if not self.local_request() or self.path != '/diarize':
            return self.reply(403, {'error': 'Forbidden'})
        if not self.requests.acquire(blocking=False):
            return self.reply(503, {'error': 'Speaker analysis busy'})
        deadline = time.monotonic() + 1.6
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if not 100 <= size <= 5 * 1024 * 1024:
                return self.reply(413, {'error': 'Invalid audio size'})
            chunks = []
            received = 0
            while received < size:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    raise TimeoutError('Request deadline exceeded')
                self.connection.settimeout(remaining)
                chunk = self.rfile.read1(min(65536, size - received))
                if not chunk:
                    break
                chunks.append(chunk)
                received += len(chunk)
            body = b''.join(chunks)
            if len(body) != size:
                return self.reply(400, {'error': 'Incomplete recording'})
            self.reply(200, self.engine.analyse(body, deadline))
        except TimeoutError:
            self.reply(504, {'error': 'Speaker analysis timed out'})
        except BusyError:
            self.reply(503, {'error': 'Speaker analysis busy'})
        except (ValueError, subprocess.SubprocessError):
            self.reply(422, {'error': 'Speaker analysis could not use this recording'})
        except Exception:
            self.reply(503, {'error': 'Speaker analysis unavailable'})
        finally:
            self.requests.release()

if __name__ == '__main__':
    Handler.engine = DeadlineEngine(SpeakerEngine)
    print('Nod.ie CPU speaker service ready on 127.0.0.1:8106', flush=True)
    try:
        ThreadingHTTPServer(('127.0.0.1', 8106), Handler).serve_forever()
    finally:
        Handler.engine.close()
