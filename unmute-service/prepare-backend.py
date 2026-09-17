#!/usr/bin/env python3
"""Prepare a local override for the installed KnowAll Unmute fork; never edit its source."""
import argparse
from pathlib import Path
parser = argparse.ArgumentParser()
parser.add_argument('unmute_root', type=Path)
args = parser.parse_args()
source = (args.unmute_root / 'unmute/llm/llm_utils.py').read_text()
needle = '"temperature": self.temperature,'
if source.count(needle) != 1:
    raise SystemExit('Unsupported Unmute adapter: review the upstream source before applying this patch.')
source = source.replace(needle, needle + '\n            "reasoning_effort": "none",')
output = Path(__file__).parent / 'generated'
output.mkdir(exist_ok=True)
(output / 'llm_utils.py').write_text(source)
print('Prepared Qwen non-reasoning streaming adapter.')
