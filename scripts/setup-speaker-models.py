#!/usr/bin/env python3
"""Download pinned, verified models for optional home-testing diarisation."""
import hashlib
import io
import json
from pathlib import Path
import tarfile
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
manifest = json.loads((ROOT / 'recognition/speaker-models.json').read_text())
destination = ROOT / 'recognition-models/speaker'
destination.mkdir(parents=True, exist_ok=True)

def download(url, expected):
    with urllib.request.urlopen(url, timeout=60) as response:
        data = response.read(40 * 1024 * 1024 + 1)
    if len(data) > 40 * 1024 * 1024 or hashlib.sha256(data).hexdigest() != expected:
        raise RuntimeError('Model download checksum mismatch')
    return data

def save(name, data, expected):
    if hashlib.sha256(data).hexdigest() != expected:
        raise RuntimeError('Model checksum mismatch')
    temporary = destination / (name + '.tmp')
    temporary.write_bytes(data)
    temporary.replace(destination / name)

archive = manifest['segmentationArchive']
with tarfile.open(fileobj=io.BytesIO(download(archive['url'], archive['sha256'])), mode='r:bz2') as tar:
    # Read only fixed members; never extract archive paths onto the filesystem.
    save('segmentation.onnx', tar.extractfile(archive['member']).read(), manifest['files']['segmentation.onnx'])
    (destination / 'LICENSE.segmentation.txt').write_bytes(tar.extractfile(archive['member'].rsplit('/', 1)[0] + '/LICENSE').read())
(destination / 'NOTICE').write_text('Licensed by Rev under the Rev Model Non-Production License\n')
save('embedding.onnx', download(manifest['embeddingUrl'], manifest['files']['embedding.onnx']), manifest['files']['embedding.onnx'])
print('Verified speaker models installed. License: recognition-models/speaker/LICENSE.segmentation.txt')
