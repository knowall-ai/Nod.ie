#!/usr/bin/env python3
"""Download pinned MuseTalk model assets atomically; verify existing files too."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import tempfile
import urllib.request

ROOT = Path(__file__).resolve().parents[1]

def digest(path):
    sha = hashlib.sha256()
    with path.open('rb') as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b''):
            sha.update(chunk)
    return sha.hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--verify', action='store_true', help='Verify without downloading')
    args = parser.parse_args()
    manifest = json.loads((ROOT / 'musetalk-service/models-neural.json').read_text())
    for asset in manifest['files']:
        destination = ROOT / 'voice-models/musetalk' / asset['path']
        if destination.is_file() and destination.stat().st_size == asset['size'] and digest(destination) == asset['sha256']:
            print('Verified', asset['path']); continue
        if args.verify:
            raise SystemExit('Missing or invalid model: ' + asset['path'])
        destination.parent.mkdir(parents=True, exist_ok=True)
        fd, name = tempfile.mkstemp(prefix='.download-', dir=destination.parent)
        try:
            with os.fdopen(fd, 'wb') as output, urllib.request.urlopen(asset['url'], timeout=60) as response:
                length = 0
                while chunk := response.read(1024 * 1024):
                    length += len(chunk)
                    if length > asset['size']:
                        raise ValueError('Model exceeds expected size')
                    output.write(chunk)
            temporary = Path(name)
            if temporary.stat().st_size != asset['size'] or digest(temporary) != asset['sha256']:
                raise ValueError('Model verification failed: ' + asset['path'])
            temporary.chmod(0o644)
            os.replace(temporary, destination)
            print('Installed', asset['path'])
        finally:
            Path(name).unlink(missing_ok=True)

if __name__ == '__main__':
    main()
