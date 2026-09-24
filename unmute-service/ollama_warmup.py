"""Bounded Ollama residency refresh, shared across cancellable speech turns."""
import asyncio
import json
import logging
import os
import time
from urllib.parse import urlsplit

LOAD_DEADLINE = 90

LOG = logging.getLogger(__name__)
_task = None
_key = None
_ready_until = 0.0


async def _load(url, model):
    # HTTPX is already a dependency of the installed OpenAI client.
    import httpx
    if urlsplit(url).scheme not in {'http', 'https'}:
        raise ValueError('Unsupported warm-up URL')
    client = httpx.AsyncClient(timeout=LOAD_DEADLINE, follow_redirects=False)
    response = None
    try:
        request = client.build_request('POST', url.rstrip('/') + '/api/generate',
                                       json={'model': model, 'stream': False, 'keep_alive': '30m'})
        response = await client.send(request, stream=True)
        response.raise_for_status()
        body = bytearray()
        async for chunk in response.aiter_bytes():
            body.extend(chunk)
            if len(body) > 65536:
                raise RuntimeError('Oversized warm-up response')
        if not json.loads(body).get('done'):
            raise RuntimeError('Model warm-up did not complete')
    finally:
        try:
            if response is not None:
                await asyncio.wait_for(response.aclose(), timeout=2)
        finally:
            await asyncio.wait_for(client.aclose(), timeout=2)


async def _refresh(url, model):
    global _ready_until
    started = time.monotonic()
    try:
        await asyncio.wait_for(_load(url, model), timeout=LOAD_DEADLINE)
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
        await asyncio.wait_for(asyncio.shield(task), timeout=LOAD_DEADLINE + 5)
