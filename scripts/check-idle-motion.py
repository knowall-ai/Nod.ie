#!/usr/bin/env python3
"""Check bundled head-clip timing and neutral endpoints; requires FFmpeg."""
import argparse
import json
import statistics
import subprocess
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('avatars', nargs='?', type=Path, default=Path(__file__).resolve().parents[1] / 'assets/avatars')
args = parser.parse_args()
for name, frames in [('nodie-idle', 150), ('nodie-idle-blink', 150), ('nodie-look-left', 75), ('nodie-look-right', 75), ('nodie-head-tilt', 70)]:
    path = args.avatars / (name + '.mp4')
    metadata = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=avg_frame_rate,nb_frames,width,height', '-of', 'json', str(path)]))['streams'][0]
    assert metadata['avg_frame_rate'] == '25/1' and int(metadata['nb_frames']) == frames, name + ': changed timing'
    assert (metadata['width'], metadata['height']) == (768, 768), name + ': changed resolution'
    raw = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', str(path), '-vf', 'scale=256:256', '-f', 'rawvideo', '-pix_fmt', 'gray', 'pipe:1'])
    size = 256 * 256
    assert len(raw) == frames * size, name + ': missing decoded frames'
    differences = [statistics.mean(abs(a-b) for a, b in zip(raw[(i-1)*size:i*size], raw[i*size:(i+1)*size])) for i in range(1, frames)]
    print(json.dumps({'clip': name, 'first': differences[0], 'last': differences[-1], 'median': statistics.median(differences), 'maximum': max(differences)}))
    # Old assets jump by 1.5 grayscale levels at the boundary. Allow codec noise
    # while rejecting an abrupt switch back to the original portrait.
    assert max(differences[0], differences[-1]) < .2, name + ': neutral endpoint jump'

    if name != 'nodie-idle-blink':
        # Inspect the entire eased boundary: a pose mismatch must not merely be
        # spread across eight frames and hidden by the endpoint fade.
        assert max(differences[:8] + differences[-8:]) < max(.05, statistics.median(differences)*2.5), name + ': boundary motion spike'
    else:
        # Eye closure may change rapidly; it must not move the neck or torso.
        start = 145 * 256
        reference = raw[start:size]
        body = [statistics.mean(abs(a-b) for a,b in zip(reference, raw[i*size+start:(i+1)*size])) for i in range(frames)]
        print(json.dumps({'clip': name, 'maximum_body_change': max(body)}))
        assert max(body) < .2, name + ': blink moves neck/torso'
