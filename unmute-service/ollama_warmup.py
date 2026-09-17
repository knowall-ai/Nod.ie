"""Bounded Ollama residency refresh, shared across cancellable speech turns."""
import asyncio
import json
import logging
import os
import time
import urllib.request

LOG = logging.getLogger(__name__)
_task = None
_key = None
_ready_until = 0.0


def _load(url, model):
    body = json.dumps({'model': model, 'stream': False, 'keep_alive': '30m'}).encode()
    request = urllib.request.Request(url.rstrip('/') + '/api/generate', data=body,
                                     headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(request, timeout=90) as response:
        result = json.loads(response.read(65536))
    if not result.get('done'):
        raise RuntimeError('Model warm-up did not complete')


async def _refresh(url, model):
    global _ready_until
    started = time.monotonic()
    try:
        await asyncio.to_thread(_load, url, model)
    except Exception:
        _ready_until = 0.0
        LOG.warning('ollama_warmup_failed')
        return False
    _ready_until = time.monotonic() + 60
    LOG.info('ollama_warmup_ready duration_ms=%d', round((time.monotonic()-started)*1000))
    return True


def start_warmup(url, model, force=False):
    """Start a single load; interruption of a caller must not cancel model loading."""
    global _task, _key, _ready_until
    if os.environ.get('NODIE_OLLAMA_WARMUP') != '1' or not model:
        return None
    key = (url, model)
    if _task is not None and not _task.done():
        # This backend serves one configured model. Never start competing loads.
        return _task if key == _key else None
    if not force and key == _key and time.monotonic() < _ready_until:
        return _task
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        return None
    _key = key
    _ready_until = 0.0
    _task = loop.create_task(_refresh(url, model))
    return _task


async def ensure_warm(url, model):
    task = start_warmup(url, model)
    if task is not None:
        await asyncio.shield(task)
