import os
from pathlib import Path
import subprocess
import tempfile
import time
import unittest
from deadline_worker import DeadlineEngine

class FakeEngine:
    model_id = 'synthetic-test'
    def analyse(self, body):
        if body.startswith(b'slow:'):
            child = subprocess.Popen(['sleep', '30'])
            Path(body[5:].decode()).write_text(str(child.pid))
            time.sleep(30)
        return {'ok': True}

class DeadlineTests(unittest.TestCase):
    def test_timeout_kills_worker_and_decoder_and_next_request_succeeds(self):
        engine = DeadlineEngine(FakeEngine)
        try:
            with tempfile.TemporaryDirectory() as directory:
                marker = Path(directory) / 'pid'
                started = time.monotonic()
                with self.assertRaises(TimeoutError):
                    engine.analyse(b'slow:' + str(marker).encode(), started + .25)
                self.assertLess(time.monotonic() - started, .6)
                self.assertIsNone(engine.process)
                child_pid = int(marker.read_text())
                # A killed orphan can remain a zombie until reaped by PID 1.
                stat = Path(f'/proc/{child_pid}/stat')
                for _ in range(20):
                    if not stat.exists() or stat.read_text().split()[2] == 'Z':
                        break
                    time.sleep(.01)
                self.assertTrue(not stat.exists() or stat.read_text().split()[2] == 'Z')
                started = time.monotonic()
                self.assertEqual(engine.analyse(b'fast'), {'ok': True})
                self.assertLess(time.monotonic() - started, 1.6)
        finally:
            engine.close()

if __name__ == '__main__': unittest.main()
