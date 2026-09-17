#!/usr/bin/env bash
# One-time Ubuntu 24.04+ setup. Keeps Chromium's sandbox enabled; permits user namespaces only for this Electron executable.
set -euo pipefail
root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
executable="$root/node_modules/electron/dist/electron"
[[ -x "$executable" ]] || { echo 'Install dependencies first.' >&2; exit 1; }
[[ "$executable" != *'"'* && "$executable" != *$'\n'* ]] || { echo 'Unsupported path' >&2; exit 1; }
profile="$(mktemp)"
trap 'rm -f "$profile"' EXIT
cat > "$profile" <<PROFILE
abi <abi/4.0>,
include <tunables/global>
profile nodie "$executable" flags=(unconfined) {
  userns,
}
PROFILE
cat "$profile"
sudo install -o root -g root -m 0644 "$profile" /etc/apparmor.d/nodie
sudo apparmor_parser -r /etc/apparmor.d/nodie
