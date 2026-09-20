"""One bounded CPU frame. JPEG bytes enter stdin; only features leave stdout."""
import hashlib
import io
import json
import sys
from pathlib import Path
import cv2
import numpy as np
from PIL import Image

def analyse(body, root):
    if len(body) > 512000 or not body.startswith(b'\xff\xd8'):
        raise ValueError('Invalid JPEG')
    with Image.open(io.BytesIO(body)) as header:
        width, height = header.size
        if width < 32 or height < 32 or width > 1280 or height > 960:
            raise ValueError('Invalid image dimensions')
    cv2.setNumThreads(1)
    manifest = json.loads((root / 'recognition/face-models.json').read_text())
    models = root / 'recognition-models/face'
    for name, item in manifest['files'].items():
        if hashlib.sha256((models / name).read_bytes()).hexdigest() != item['sha256']:
            raise ValueError('Unverified face model')
    image = cv2.imdecode(np.frombuffer(body, dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError('Invalid image')
    detector = cv2.FaceDetectorYN.create(str(models / 'face_detection_yunet_2023mar.onnx'), '', (width, height), 0.9, 0.3, 5000)
    recognizer = cv2.FaceRecognizerSF.create(str(models / 'face_recognition_sface_2021dec.onnx'), '')
    _, faces = detector.detect(image)
    result = []
    for face in ([] if faces is None else faces[:8]):
        if min(face[2:4]) < 64:
            continue
        crop = recognizer.alignCrop(image, face)
        if cv2.Laplacian(cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY), cv2.CV_64F).var() < 40:
            continue
        vector = recognizer.feature(crop).reshape(-1)
        norm = np.linalg.norm(vector)
        if len(vector) != 128 or not np.isfinite(vector).all() or norm <= 0:
            continue
        result.append({'box': [float(v) for v in face[:4]], 'vector': (vector / norm).tolist()})
    return {'model': manifest['files']['face_recognition_sface_2021dec.onnx']['sha256'], 'faces': result}

if __name__ == '__main__':
    try:
        result = analyse(sys.stdin.buffer.read(512001), Path(__file__).resolve().parents[1])
        print(json.dumps(result, allow_nan=False))
    except Exception:
        print('Face analysis unavailable', file=sys.stderr)
        sys.exit(1)
