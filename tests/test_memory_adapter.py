"""Run after prepare-backend: verify outer memory deadlines and uncertain saves."""
import ast
import asyncio
import json
from pathlib import Path
import types
import unittest
root = Path(__file__).resolve().parents[1]
tree = ast.parse((root / 'unmute-service/generated/mcp_manager.py').read_text())
assert any(isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id == '_nodie_uncertain_save' for t in n.targets) and isinstance(n.value, ast.Constant) and n.value.value is False for n in tree.body), 'Missing module-level uncertainty latch'
wrapper = next(n for n in ast.walk(tree) if isinstance(n, ast.AsyncFunctionDef) and n.name == 'execute_tool')
ns = {'asyncio': asyncio, '_nodie_uncertain_save': False}
exec(compile(ast.Module(body=[wrapper], type_ignores=[]), '<memory-adapter>', 'exec'), ns)

class MemoryTest(unittest.IsolatedAsyncioTestCase):
    def setUp(self): ns['_nodie_uncertain_save'] = False
    async def test_unknown_or_crashed_child_pauses_later_saves(self):
        for outcome in ['{"status":"unknown"}', 'invalid', RuntimeError('child exited')]:
            ns['_nodie_uncertain_save'] = False
            calls = []
            async def execute(name, args):
                calls.append(name)
                if isinstance(outcome, Exception): raise outcome
                return outcome
            manager = types.SimpleNamespace(_nodie_execute_tool=execute)
            result = json.loads(await ns['execute_tool'](manager, 'reverie.save_memory', {}))
            self.assertEqual(result['status'], 'unknown')
            result = json.loads(await ns['execute_tool'](manager, 'reverie.save_memory', {}))
            self.assertEqual(result['status'], 'not-saved')
            self.assertEqual(len(calls), 1)

    async def test_reconnect_does_not_clear_unconfirmed_save(self):
        async def execute(name, args): return '{"status":"unknown"}'
        first=types.SimpleNamespace(_nodie_execute_tool=execute)
        await ns['execute_tool'](first, 'reverie.save_memory', {})
        async def never(*args): self.fail('write after reconnect')
        replacement=types.SimpleNamespace(_nodie_execute_tool=never)
        self.assertEqual(json.loads(await ns['execute_tool'](replacement, 'reverie.save_memory', {}))['status'], 'not-saved')

    async def test_confirmed_saves_and_searches_keep_working(self):
        async def execute(name, args): return '{"status":"saved"}'
        manager = types.SimpleNamespace(_nodie_execute_tool=execute)
        for _ in range(2):
            self.assertEqual(json.loads(await ns['execute_tool'](manager, 'reverie.save_memory', {}))['status'], 'saved')
        ns['_nodie_uncertain_save'] = True
        self.assertEqual(await ns['execute_tool'](manager, 'reverie.search_memories', {}), '{"status":"saved"}')

    async def test_cancellation_preserves_uncertainty(self):
        async def execute(name, args): raise asyncio.CancelledError()
        manager = types.SimpleNamespace(_nodie_execute_tool=execute)
        with self.assertRaises(asyncio.CancelledError):
            await ns['execute_tool'](manager, 'reverie.save_memory', {})
        self.assertTrue(ns['_nodie_uncertain_save'])

    def test_outer_deadline_exceeds_bridge_budget_only_for_saves(self):
        call = next(n for n in ast.walk(tree) if isinstance(n, ast.Call) and ast.unparse(n.func) == 'asyncio.wait_for' and n.args and ast.unparse(n.args[0]) == 'process.stdout.readline()' and any(k.arg == 'timeout' and isinstance(k.value, ast.IfExp) for k in n.keywords))
        deadline = next(k.value for k in call.keywords if k.arg == 'timeout')
        code = compile(ast.Expression(deadline), '<deadline>', 'eval')
        self.assertGreater(eval(code, {'tool_name': 'reverie.save_memory'}), 5 + 2.5 + 7)
        self.assertEqual(eval(code, {'tool_name': 'reverie.search_memories'}), 10)

if __name__ == '__main__': unittest.main()
