#!/usr/bin/env python3
"""Attach delivery facts to the generated backend using checked AST anchors."""
import ast
from pathlib import Path

root = Path(__file__).resolve().parent / 'generated'
tree = ast.parse((root / 'unmute_handler.py').read_text(encoding='utf-8'))
classes = [n for n in tree.body if isinstance(n, ast.ClassDef) and n.name == 'UnmuteHandler']
if len(classes) != 1:
    raise SystemExit('Unsupported Unmute handler class')
cls = classes[0]


def method(name):
    found = [n for n in cls.body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name == name]
    if len(found) != 1:
        raise SystemExit('Unsupported Unmute method: ' + name)
    return found[0]


method('__init__').body[:0] = ast.parse('''
from unmute.interruption_context import InterruptionContext
self._nodie_interruption = InterruptionContext()
''').body
interrupt = method('interrupt_bot')
anchors = [i for i, n in enumerate(interrupt.body) if isinstance(n, ast.Expr) and
           isinstance(n.value, ast.Await) and
           ast.unparse(n.value.value) == "self.add_chat_message_delta(INTERRUPTION_CHAR, 'assistant')"]
if len(anchors) != 1:
    raise SystemExit('Unsupported interruption marker anchor')
interrupt.body[anchors[0]:anchors[0]] = ast.parse('self._nodie_interruption.capture(self.chatbot.chat_history)').body
response = method('_generate_response_task')
anchors = [i for i, n in enumerate(response.body) if isinstance(n, ast.Assign) and
           isinstance(n.value, ast.Call) and ast.unparse(n.value) == 'self.chatbot.preprocessed_messages()']
if len(anchors) != 1:
    raise SystemExit('Unsupported response context anchor')
response.body[anchors[0] + 1:anchors[0] + 1] = ast.parse('''
if not curiosity:
    messages = self._nodie_interruption.messages(messages, self.chatbot.chat_history)
''').body
ast.fix_missing_locations(tree)
(root / 'unmute_handler.py').write_text(ast.unparse(tree) + '\n', encoding='utf-8')
print('Prepared ephemeral interrupted-response facts.')
