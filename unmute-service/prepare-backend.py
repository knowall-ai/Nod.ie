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

handler = (args.unmute_root / 'unmute/unmute_handler.py').read_text()
patches = [
    ('        asyncio.create_task(self._initialize_mcp())', '        self._mcp_initialized = False\n        asyncio.create_task(self._initialize_mcp())'),
    ('            logger.error(f"Traceback: {traceback.format_exc()}")', '            logger.error(f"Traceback: {traceback.format_exc()}")\n        finally:\n            self._mcp_initialized = True'),
    ('if self.mcp_manager and not self.mcp_manager.available_tools:', 'if self.mcp_manager and not self._mcp_initialized:'),
]
for old, new in patches:
    if handler.count(old) != 1:
        raise SystemExit('Unsupported Unmute initialization: review the source before patching.')
    handler = handler.replace(old, new)
(output / 'unmute_handler.py').write_text(handler)
print('Prepared tool-independent speech startup.')
