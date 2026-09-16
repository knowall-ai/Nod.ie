#!/usr/bin/env bash
set -euo pipefail
root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
if systemctl --user is-active --quiet nodie-voice.service; then
  systemctl --user restart nodie-voice.service
else
  systemd-run --user --unit=nodie-voice --collect --property="WorkingDirectory=$root" --property=Restart=on-failure --property=CPUQuota=200% --property=MemoryMax=1G "$root/.venv-voice/bin/python" "$root/voice/server.py"
fi
