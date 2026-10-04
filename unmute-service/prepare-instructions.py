#!/usr/bin/env python3
"""Keep explicit constant instructions free of the inherited Unmute wrapper."""
import ast
from pathlib import Path


def prepare(source, default_prompt):
    tree = ast.parse(source)
    defaults = [n for n in tree.body if isinstance(n, ast.Assign) and
                any(isinstance(t, ast.Name) and t.id == '_DEFAULT_ADDITIONAL_INSTRUCTIONS' for t in n.targets)]
    classes = [n for n in tree.body if isinstance(n, ast.ClassDef) and n.name == 'ConstantInstructions']
    if len(defaults) != 1 or len(classes) != 1:
        raise ValueError('Unsupported Unmute instruction layout')
    methods = [n for n in classes[0].body if isinstance(n, ast.FunctionDef) and n.name == 'make_system_prompt']
    if len(methods) != 1 or ast.unparse(methods[0].args) != 'self':
        raise ValueError('Unsupported Unmute constant-instruction signature')
    fields = [n for n in classes[0].body if isinstance(n, ast.AnnAssign) and
              isinstance(n.target, ast.Name) and n.target.id == 'text' and
              isinstance(n.value, ast.Name) and n.value.id == '_DEFAULT_ADDITIONAL_INSTRUCTIONS']
    if len(fields) != 1:
        raise ValueError('Unsupported Unmute constant-instruction default')
    # Limit the new default to constant sessions. Other modes also use the
    # upstream default variable and must retain their explicitly selected policy.
    fields[0].value = ast.Constant(default_prompt)
    # No model-name lookup or duplicate tool descriptions. Tool schemas travel
    # separately through the model API; observations have their own adapters.
    methods[0].body = ast.parse('''
return self.text + "\\n\\n" + LANGUAGE_CODE_TO_INSTRUCTIONS[self.language]
''').body
    return ast.unparse(ast.fix_missing_locations(tree)) + '\n'


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('unmute_root', type=Path)
    args = parser.parse_args()
    root = Path(__file__).resolve().parent
    generated = root / 'generated'
    generated.mkdir(exist_ok=True)
    source = (args.unmute_root / 'unmute/llm/system_prompt.py').read_text(encoding='utf-8')
    prompt = (root.parent / 'SYSTEM-PROMPT.md').read_text(encoding='utf-8')
    (generated / 'system_prompt.py').write_text(prepare(source, prompt), encoding='utf-8')
    print('Prepared constant instructions without inherited conversation policy.')
