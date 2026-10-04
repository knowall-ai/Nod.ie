"""One bounded CPU frame. JPEG bytes enter stdin; features and bounded preview crops leave stdout."""
import hashlib
import io
import json
import sys
from pathlib import Path
import cv2
import numpy as np
from PIL import Image
from face_crops import isolated_crop
import base64

class FrameEngine:
    def __init__(self, root):
        cv2.setNumThreads(1)
        manifest = json.loads((root / 'recognition/face-models.json').read_text())
        models = root / 'recognition-models/face'
        for name, item in manifest['files'].items():
            if hashlib.sha256((models / name).read_bytes()).hexdigest() != item['sha256']:
                raise ValueError('Unverified face model')
        self.model_id = manifest['files']['face_recognition_sface_2021dec.onnx']['sha256']
        self.detector = cv2.FaceDetectorYN.create(str(models / 'face_detection_yunet_2023mar.onnx'), '', (320, 240), 0.9, 0.3, 5000)
        self.recognizer = cv2.FaceRecognizerSF.create(str(models / 'face_recognition_sface_2021dec.onnx'), '')

    def analyse(self, body):
        if len(body) > 512000 or not body.startswith(b'\xff\xd8'):
            raise ValueError('Invalid JPEG')
        with Image.open(io.BytesIO(body)) as header:
            width, height = header.size
            if width < 32 or height < 32 or width > 1280 or height > 960:
                raise ValueError('Invalid image dimensions')
        image = cv2.imdecode(np.frombuffer(body, dtype=np.uint8), cv2.IMREAD_COLOR)
        if image is None:
            raise ValueError('Invalid image')
        detector = self.detector
        detector.setInputSize((width,height))
        recognizer = self.recognizer
        _, faces = detector.detect(image)
        result = []
        detected = [] if faces is None else faces[:8]
        for index, face in enumerate(detected):
            if min(face[2:4]) < 64:
                continue
            crop = recognizer.alignCrop(image, face)
            if cv2.Laplacian(cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY), cv2.CV_64F).var() < 40:
                continue
            vector = recognizer.feature(crop).reshape(-1)
            norm = np.linalg.norm(vector)
            if len(vector) != 128 or not np.isfinite(vector).all() or norm <= 0:
                continue
            box = [float(v) for v in face[:4]]
            bounds = isolated_crop(box, [[float(v) for v in other[:4]] for j, other in enumerate(detected) if j != index], width, height)
            thumbnail = None
            if bounds is not None and (faces is None or len(faces) <= 8):
                left, top, right, bottom = bounds
                preview = cv2.resize(image[top:bottom, left:right], (96, 96), interpolation=cv2.INTER_AREA)
                ok, encoded = cv2.imencode('.jpg', preview, [cv2.IMWRITE_JPEG_QUALITY, 70])
                if ok and len(encoded) <= 8000:
                    thumbnail = base64.b64encode(encoded).decode('ascii')
            result.append({'box': box, 'vector': (vector / norm).tolist(), 'thumbnail': thumbnail})
        return {'model': self.model_id, 'faces': result, 'quality': {'detectedFaces': 0 if faces is None else len(faces)}}

if __name__ == '__main__':
    try:
        engine=FrameEngine(Path(__file__).resolve().parents[1])
        if '--stream' in sys.argv:
            import base64
            while True:
                line=sys.stdin.buffer.readline(683000)
                if not line:break
                if not line.endswith(b'\n'):raise ValueError('Oversized frame')
                try:result=engine.analyse(base64.b64decode(line.strip(),validate=True))
                except Exception:result={'error':'Face analysis unavailable'}
                print(json.dumps(result,allow_nan=False),flush=True)
        else:
            print(json.dumps(engine.analyse(sys.stdin.buffer.read(512001)),allow_nan=False))
    except Exception:
        print('Face analysis unavailable',file=sys.stderr)
        sys.exit(1)
