#!/usr/bin/env python3
"""Download pinned OpenCV models; never download during recognition."""
import hashlib
import json
import urllib.request
from pathlib import Path
root = Path(__file__).resolve().parents[1]
manifest = json.loads((root / 'recognition/face-models.json').read_text())
destination = root / 'recognition-models/face'
destination.mkdir(parents=True, exist_ok=True)
for name, item in manifest['files'].items():
    url = f"https://media.githubusercontent.com/media/opencv/opencv_zoo/{manifest['revision']}/models/{item['directory']}/{name}"
    with urllib.request.urlopen(url, timeout=60) as response:
        data = response.read(item['size'] + 1)
    if len(data) != item['size'] or hashlib.sha256(data).hexdigest() != item['sha256']:
        raise SystemExit('Face model checksum mismatch')
    (destination / name).write_bytes(data)
print('Verified local face models installed.')
