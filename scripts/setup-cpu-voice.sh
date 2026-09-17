#!/usr/bin/env bash
set -euo pipefail
root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"
python3 -m venv .venv-voice
.venv-voice/bin/pip install -r voice/requirements.txt
python3 - <<'PY'
import hashlib,json,urllib.request
from pathlib import Path
Path('voice-models').mkdir(exist_ok=True)
for item in json.loads(Path('voice/models.json').read_text()):
    target = Path('voice-models') / item['name']
    if not target.exists(): urllib.request.urlretrieve(item['url'], target)
    if hashlib.sha256(target.read_bytes()).hexdigest() != item['sha256']:
        raise SystemExit('Model checksum mismatch: ' + item['name'])
print('Voice models verified.')
PY
