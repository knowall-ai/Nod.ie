#!/usr/bin/env bash
set -euo pipefail
root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
if systemctl --user is-active --quiet nodie-web.service; then
  systemctl --user restart nodie-web.service
else
  systemd-run --user --unit=nodie-web --collect --property="WorkingDirectory=$root" --property=Restart=on-failure "$(command -v node)" "$root/serve-web-with-env.js"
fi
