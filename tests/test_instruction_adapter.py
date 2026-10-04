"""Test the generated instruction method without importing optional backend services."""
import ast
import importlib.util
from pathlib import Path
import types
import unittest

root = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('prepare_instructions', root / 'unmute-service/prepare-instructions.py')
adapter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(adapter)
SOURCE = '''
_DEFAULT_ADDITIONAL_INSTRUCTIONS = 'Ask follow-up questions and save personal details automatically.'
LANGUAGE_CODE_TO_INSTRUCTIONS = {None: 'Speak English only.', 'fr': 'Speak French.'}
class ConstantInstructions:
    text: str = _DEFAULT_ADDITIONAL_INSTRUCTIONS
    language = None
    def make_system_prompt(self):
        return 'Guess unfinished speech. ' + self.text + ' Think aloud about tools.'
class OtherInstructions:
    def make_system_prompt(self):
        return _DEFAULT_ADDITIONAL_INSTRUCTIONS
'''


class InstructionsTest(unittest.TestCase):
    def setUp(self):
        self.namespace = {}
        exec(adapter.prepare(SOURCE, 'Synthetic default policy'), self.namespace)

    def test_explicit_policy_is_not_wrapped_or_repeated(self):
        obj = self.namespace['ConstantInstructions']()
        obj.text = 'Use only confirmed results. Do not guess unfinished speech.'
        self.assertEqual(obj.make_system_prompt(), obj.text + '\n\nSpeak English only.')

    def test_default_uses_application_policy(self):
        self.assertEqual(self.namespace['ConstantInstructions']().make_system_prompt(),
                         'Synthetic default policy\n\nSpeak English only.')

    def test_language_option_and_other_modes_preserved(self):
        obj = self.namespace['ConstantInstructions']()
        obj.language = 'fr'
        self.assertTrue(obj.make_system_prompt().endswith('Speak French.'))
        self.assertEqual(self.namespace['OtherInstructions']().make_system_prompt(),
                         'Ask follow-up questions and save personal details automatically.')

    def test_upstream_layout_change_fails_closed(self):
        for changed in [SOURCE.replace('ConstantInstructions', 'Renamed'),
                        SOURCE.replace('def make_system_prompt(self):', 'def make_system_prompt(self, extra):'),
                        SOURCE.replace('_DEFAULT_ADDITIONAL_INSTRUCTIONS =', 'RENAMED_DEFAULT ='),
                        SOURCE.replace('text: str = _DEFAULT_ADDITIONAL_INSTRUCTIONS', 'text: str = "Changed"')]:
            with self.assertRaises(ValueError):
                adapter.prepare(changed, 'Policy')

    def test_actual_generated_method_when_available(self):
        generated = root / 'unmute-service/generated/system_prompt.py'
        if not generated.exists():
            self.skipTest('Run prepare-backend.py for installed-backend integration')
        tree = ast.parse(generated.read_text())
        cls = next(n for n in tree.body if isinstance(n, ast.ClassDef) and n.name == 'ConstantInstructions')
        method = next(n for n in cls.body if isinstance(n, ast.FunctionDef) and n.name == 'make_system_prompt')
        namespace = {'LANGUAGE_CODE_TO_INSTRUCTIONS': {None: 'Speak English only.'}}
        exec(compile(ast.Module(body=[method], type_ignores=[]), 'generated-instructions', 'exec'), namespace)
        prompt = (root / 'SYSTEM-PROMPT.md').read_text()
        self.assertEqual(namespace['make_system_prompt'](types.SimpleNamespace(text=prompt, language=None)),
                         prompt + '\n\nSpeak English only.')


if __name__ == '__main__':
    unittest.main()
