"""Interrupted delivery facts must not infer words, mutate history or outlive replies."""
import ast
import asyncio
import copy
import importlib.util
from pathlib import Path
import types
import unittest

root = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('interruption_context', root / 'unmute-service/interruption_context.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class InterruptionTest(unittest.TestCase):
    def setUp(self):
        self.now = 10
        self.state = module.InterruptionContext(clock=lambda: self.now)
        self.history = [{'role': 'system', 'content': 'Synthetic policy'},
                        {'role': 'user', 'content': 'I found my keys.'},
                        {'role': 'assistant', 'content': 'Ah, understood'}]

    def interrupt(self):
        self.state.capture(self.history)
        self.history[-1]['content'] += ' —'
        self.history.extend([{'role': 'user', 'content': 'What were you about to say?'},
                             {'role': 'assistant', 'content': ''}])

    def test_actual_interruption_adds_facts_without_mutating_or_quoting(self):
        self.interrupt()
        before = copy.deepcopy(self.history)
        result = self.state.messages(self.history, self.history)
        self.assertEqual(self.history, before)
        self.assertEqual(result[1:], before[1:])
        self.assertIn('"last_assistant_response": "interrupted"', result[0]['content'])
        self.assertIn('"intended_continuation": "not_recorded"', result[0]['content'])
        self.assertIn('"physical_playback": "not_verified"', result[0]['content'])
        self.assertNotIn('Ah, understood', result[0]['content'])

    def test_marker_alone_records_no_generated_words(self):
        self.history[-1]['content'] = ''
        self.interrupt()
        self.assertIn('"generated_text_before_interruption": false',
                      self.state.messages(self.history, self.history)[0]['content'])

    def test_natural_dash_is_not_an_interruption_event(self):
        self.history[-1]['content'] += ' —'
        self.assertIs(self.state.messages(self.history, self.history), self.history)

    def test_completed_later_reply_supersedes_state_permanently(self):
        self.interrupt()
        self.history[-1]['content'] = 'Synthetic later reply.'
        self.assertIs(self.state.messages(self.history, self.history), self.history)
        self.history.pop()
        self.assertIs(self.state.messages(self.history, self.history), self.history)

    def test_expiry_and_reset_drop_old_delivery_facts(self):
        self.interrupt()
        self.now = 131
        self.assertIs(self.state.messages(self.history, self.history), self.history)
        self.state.capture(self.history[:3])
        replacement = copy.deepcopy(self.history)
        self.assertIs(self.state.messages(replacement, replacement), replacement)

    def test_user_turn_cannot_be_captured_as_assistant(self):
        self.state.capture(self.history[:2])
        self.assertIs(self.state.messages(self.history, self.history), self.history)

    def test_generated_capture_and_user_turn_hook_when_available(self):
        generated = root / 'unmute-service/generated/unmute_handler.py'
        if not generated.exists():
            self.skipTest('Run prepare-backend.py for installed-backend integration')
        tree = ast.parse(generated.read_text())
        interrupt = next(n for n in ast.walk(tree) if isinstance(n, ast.AsyncFunctionDef) and n.name == 'interrupt_bot')
        body = [ast.unparse(n) for n in interrupt.body]
        capture = next(i for i, n in enumerate(body) if '_nodie_interruption.capture' in n)
        marker = next(i for i, n in enumerate(body) if 'add_chat_message_delta(INTERRUPTION_CHAR' in n)
        self.assertLess(capture, marker)
        namespace = dict(asyncio=asyncio, INTERRUPTION_CHAR='—', SAMPLE_RATE=24000,
                         SAMPLES_PER_FRAME=480, np=types.SimpleNamespace(zeros=lambda *a, **k: 0, float32=float),
                         ora=types.SimpleNamespace(UnmuteInterruptedByVAD=lambda: 'interrupted-event'))
        exec(compile(ast.Module(body=[interrupt], type_ignores=[]), 'generated-interrupt', 'exec'), namespace)
        removed = []
        async def remove(name):
            removed.append(name)
        async def delta(text, role):
            self.history[-1]['content'] += text
        handler = types.SimpleNamespace(_nodie_interruption=self.state,
                  chatbot=types.SimpleNamespace(chat_history=self.history, conversation_state=lambda: 'bot_speaking'),
                  add_chat_message_delta=delta, _clear_queue=None,
                  quest_manager=types.SimpleNamespace(remove=remove))
        asyncio.run(namespace['interrupt_bot'](handler))
        self.assertTrue(self.state.had_text)
        self.assertTrue(self.history[-1]['content'].endswith('—'))
        self.assertEqual(removed, ['tts', 'llm'])
        self.history[-1]['content'] = 'Ah, understood'
        response = next(n for n in ast.walk(tree) if isinstance(n, ast.AsyncFunctionDef) and n.name == '_generate_response_task')
        guard = next(n for n in response.body if isinstance(n, ast.If) and '_nodie_interruption.messages' in ast.unparse(n))
        self.assertEqual(ast.unparse(guard.test), 'not curiosity')
        self.interrupt()
        namespace = dict(self=types.SimpleNamespace(_nodie_interruption=self.state,
                         chatbot=types.SimpleNamespace(chat_history=self.history)),
                         messages=self.history, curiosity={'event': {}})
        code = compile(ast.Module(body=[guard], type_ignores=[]), 'generated-interruption', 'exec')
        exec(code, namespace)
        self.assertIs(namespace['messages'], self.history)
        namespace['curiosity'] = None
        exec(code, namespace)
        self.assertIn('Response delivery facts:', namespace['messages'][0]['content'])


if __name__ == '__main__':
    unittest.main()
