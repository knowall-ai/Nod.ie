"""Expose only the selected voice set, even when HF's cached snapshot contains more."""
from pathlib import Path
import shutil
from huggingface_hub import snapshot_download
source = Path(snapshot_download('kyutai/tts-voices', allow_patterns=['unmute-prod-website/*.safetensors']))
destination = Path('/tmp/nodie-voices') / 'unmute-prod-website'
# The runtime folder is private to this container and contains only generated links.
if destination.parent.exists():
    shutil.rmtree(destination.parent)
destination.mkdir(parents=True)
count = 0
for voice in (source / 'unmute-prod-website').glob('*.safetensors'):
    (destination / voice.name).symlink_to(voice.resolve())
    count += 1
if not count:
    raise RuntimeError('Selected voice set is unavailable')
print(f'Prepared {count} voice files; other cached voices are excluded.', flush=True)
