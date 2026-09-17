"""Optional loopback-only Kokoro TTS, CPU-only with bounded inference concurrency."""
import io
import json
import os
from pathlib import Path
from http.server import BaseHTTPRequestHandler, HTTPServer
import onnxruntime as rt
import soundfile as sf
from kokoro_onnx import Kokoro
from types import SimpleNamespace

root = Path(__file__).resolve().parents[1]
options = rt.SessionOptions()
options.intra_op_num_threads = 2
options.inter_op_num_threads = 1
options.execution_mode = rt.ExecutionMode.ORT_SEQUENTIAL
session = rt.InferenceSession(str(root / 'voice-models/kokoro-v1.0.onnx'), sess_options=options, providers=['CPUExecutionProvider'])
class FloatSpeedSession:
    """Use Kokoro's float-speed input path for the pinned model export.

    kokoro-onnx's input_ids path casts fractional speed to int32, but this
    export requires float32. Translate only the token name at the boundary.
    """
    def __init__(self, session):
        self.session = session
        self._model_path = session._model_path

    def get_inputs(self):
        return [SimpleNamespace(name='tokens' if item.name == 'input_ids' else item.name) for item in self.session.get_inputs()]

    def run(self, outputs, inputs):
        return self.session.run(outputs, {'input_ids' if key == 'tokens' else key: value for key, value in inputs.items()})

engine = Kokoro.from_session(FloatSpeedSession(session), str(root / 'voice-models/voices-v1.0.bin'))
voices = {'af_heart', 'af_bella', 'bf_emma', 'bf_isabella'}

class Handler(BaseHTTPRequestHandler):
    def setup(self):
        super().setup()
        self.connection.settimeout(10)

    def log_message(self, *_args):
        pass  # Do not log speech text.

    def reply(self, status, data, content_type='application/json'):
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path == '/health':
            self.reply(200, json.dumps({'status': 'healthy', 'device': 'cpu', 'threads': 2, 'voices': sorted(voices)}).encode())
        else:
            self.reply(404, b'{}')

    def do_POST(self):
        # Only the local backend calls this service. Reject browser-originated cross-origin requests.
        if self.headers.get('Origin') or self.path != '/api/tts' or self.headers.get('Content-Type', '').split(';')[0] != 'application/json':
            self.reply(403, b'{}')
            return
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= 8192:
                self.reply(413, b'{}')
                return
            body = json.loads(self.rfile.read(length))
            text = body.get('text')
            voice = body.get('speaker') or 'af_heart'
            speed = float(body.get('speed', 1.06))
            if not isinstance(text, str) or not 0 < len(text) <= 1500 or voice not in voices or not 0.8 <= speed <= 1.3:
                self.reply(400, b'{}')
                return
            samples, rate = engine.create(text, voice=voice, speed=speed, lang='en-gb' if voice.startswith('b') else 'en-us')
            output = io.BytesIO()
            sf.write(output, samples, rate, format='WAV', subtype='PCM_16')
            self.reply(200, output.getvalue(), 'audio/wav')
        except Exception:
            self.reply(500, b'{"error":"Speech synthesis failed"}')

if __name__ == '__main__':
    port = int(os.environ.get('NODIE_TTS_PORT', '8104'))
    print(f'Nod.ie CPU voice ready on 127.0.0.1:{port}', flush=True)
    HTTPServer(('127.0.0.1', port), Handler).serve_forever()
