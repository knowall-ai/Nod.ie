#!/bin/bash
# Do not enable shell tracing: the inherited environment may contain credentials.
set -euo pipefail
export LD_LIBRARY_PATH="$(python3 -c 'import sysconfig; print(sysconfig.get_config_var("LIBDIR"))')${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
export HF_TOKEN="${HF_TOKEN:-${HUGGING_FACE_HUB_TOKEN:-}}"
if [ "${NODIE_TTS_VOICES:-0}" = 1 ]; then
    python3 /app/prepare-nodie-voices.py
fi
if [ ! -x /root/.cargo/bin/moshi-server ]; then
    CARGO_TARGET_DIR=/app/target CARGO_BUILD_JOBS=2 cargo install --locked --features cuda moshi-server@0.6.3
fi
exec /root/.cargo/bin/moshi-server "$@"
