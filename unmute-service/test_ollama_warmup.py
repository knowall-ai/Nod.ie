import asyncio
import importlib.util
import os
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('warmup', Path(__file__).with_name('ollama_warmup.py'))
warmup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(warmup)

class WarmupTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        warmup._task = None
        warmup._key = None
        warmup._ready_until = 0
        self.env = patch.dict(os.environ, NODIE_OLLAMA_WARMUP='1')
        self.env.start()

    async def asyncTearDown(self):
        if warmup._task:
            await warmup._task
        self.env.stop()

    async def test_interrupt_does_not_cancel_shared_load(self):
        entered, release = asyncio.Event(), asyncio.Event()
        async def refresh(*args):
            entered.set()
            await release.wait()
            return True
        with patch.object(warmup, '_refresh', refresh):
            caller = asyncio.create_task(warmup.ensure_warm('http://localhost:11434', 'test'))
            await entered.wait()
            task = warmup._task
            caller.cancel()
            with self.assertRaises(asyncio.CancelledError):
                await caller
            self.assertFalse(task.cancelled())
            self.assertIs(warmup.start_warmup('http://localhost:11434', 'test'), task)
            release.set()
            await task

    async def test_residency_cache_and_post_turn_refresh(self):
        with patch.object(warmup, '_load') as load:
            await warmup.ensure_warm('http://localhost:11434', 'test')
            await warmup.ensure_warm('http://localhost:11434', 'test')
            self.assertEqual(load.call_count, 1)
            await warmup.start_warmup('http://localhost:11434', 'test', force=True)
            self.assertEqual(load.call_count, 2)

    async def test_failure_is_retryable_and_disabled_is_noop(self):
        with patch.object(warmup, '_load', side_effect=OSError('private')) as load:
            await warmup.ensure_warm('http://localhost:11434', 'test')
            await warmup.ensure_warm('http://localhost:11434', 'test')
            self.assertEqual(load.call_count, 2)
            os.environ['NODIE_OLLAMA_WARMUP'] = '0'
            self.assertIsNone(warmup.start_warmup('http://localhost:11434', 'test'))

if __name__ == '__main__':
    unittest.main()
