from pathlib import Path
import subprocess
root = Path(__file__).resolve().parents[1]
result = subprocess.run(['git', '-C', str(root), 'log', '-8', '--format=%h%x09%as%x09%s', '--', 'docs'], capture_output=True, text=True, check=True)
rows = ['// Generated from Git by scripts/document-history.py', '[cols="1,1,4",options="header"]', '|===', '|Commit |Date |Change']
for line in result.stdout.splitlines():
    columns = line.replace('|', '/').split('\t', 2)
    rows.append('|' + ' |'.join(columns))
rows += ['|Working tree |Unreleased |Security, voice, memory and documentation improvements; awaiting review.', '|===', '']
(root / 'docs/includes/document-history.adoc').write_text('\n'.join(rows))
