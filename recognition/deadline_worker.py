"""One cancellable analysis worker; timeout kills decoding and inference together."""
import multiprocessing
import os
import signal
import threading
import time

class BusyError(Exception):
    pass

def _worker(connection, factory):
    os.setsid()  # FFmpeg children share this group and are killed on expiry.
    try:
        engine = factory()
        connection.send(('ready', engine.model_id))
        while True:
            body = connection.recv()
            try:
                result = engine.analyse(body)
                connection.send(('result', result))
            except Exception:
                connection.send(('invalid', None))
    except (EOFError, BrokenPipeError):
        pass
    finally:
        connection.close()

class DeadlineEngine:
    def __init__(self, factory, startup_timeout=15):
        self.factory = factory
        self.startup_timeout = startup_timeout
        self.lock = threading.Lock()
        self.process = None
        self.connection = None
        self.ready = False
        self._start()
        try:
            self._wait_ready(time.monotonic() + startup_timeout)
        except Exception:
            self.close()
            raise

    def _start(self):
        context = multiprocessing.get_context('spawn')
        self.connection, child = context.Pipe()
        self.process = context.Process(target=_worker, args=(child, self.factory), daemon=True)
        self.ready = False
        self.process.start()
        self.startup_deadline = time.monotonic() + self.startup_timeout
        child.close()

    def _receive(self, deadline):
        remaining = deadline - time.monotonic()
        if remaining <= 0 or not self.connection.poll(remaining):
            raise TimeoutError('Analysis deadline exceeded')
        return self.connection.recv()

    def _wait_ready(self, deadline):
        if not self.ready:
            status, model_id = self._receive(deadline)
            if status != 'ready':
                raise RuntimeError('Worker startup failed')
            self.model_id = model_id
            self.ready = True

    def analyse(self, body, deadline=None):
        if not self.lock.acquire(blocking=False):
            raise BusyError('Analysis already in progress')
        deadline = deadline if deadline is not None else time.monotonic() + 1.6
        try:
            if self.process is None:
                self._start()
            if not self.ready:
                if self.process.is_alive() and not self.connection.poll():
                    if time.monotonic() >= self.startup_deadline:
                        raise TimeoutError('Worker startup deadline exceeded')
                    raise BusyError('Analysis worker is starting')
                self._wait_ready(deadline)
            self.connection.send(body)
            status, result = self._receive(deadline)
            if status == 'invalid':
                raise ValueError('Invalid recording')
            if status != 'result':
                raise RuntimeError('Invalid worker result')
            return result
        except (ValueError, BusyError):
            raise
        except Exception:
            self.close()
            # Let the replacement warm up independently of request deadlines.
            self._start()
            raise
        finally:
            self.lock.release()

    def close(self):
        process, self.process = self.process, None
        if process is not None:
            if process.is_alive():
                try:
                    if os.getpgid(process.pid) == process.pid:
                        os.killpg(process.pid, signal.SIGKILL)
                    else:
                        process.kill()
                except ProcessLookupError:
                    pass
            process.join(timeout=0.05)
        if self.connection:
            self.connection.close()
            self.connection = None
        self.ready = False
