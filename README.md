# Nod.ie

Nod.ie is KnowAll AI's local voice assistant. It offers an Electron overlay and a loopback browser interface, with either an Unmute realtime backend or push-to-talk transcription, Ollama and speech synthesis. Optional Reverie integration provides read-only memory recall.

## Get started

Requires Node.js 22 or later and separately configured voice services.

```bash
npm ci
cp .env.example .env
# Set your voice mode and service endpoints in .env.
npm test
npm run web
```

Open http://127.0.0.1:8095 on the same computer. In local mode, click the avatar to record and again to send; click during processing or playback to cancel. Use `npm start` for the desktop overlay. Ubuntu may require the application-specific sandbox setup described in [installation](docs/INSTALLATION.adoc).

The optional CPU voice uses Kokoro and two inference threads. Run `bash scripts/setup-cpu-voice.sh`, then `bash scripts/start-voice-service.sh`; configure `LOCAL_TTS_URL=http://127.0.0.1:8104`. No large speech services are started automatically. Voice quality and latency depend on the selected services and available resources.

## Updates and security

Docker monitoring checks running containers at startup and every six hours while Nod.ie runs. It reports available releases, image changes and selected security advisories. Unknown or unreachable sources are reported explicitly; this is not a comprehensive vulnerability scanner. Desktop settings provide review and confirmation before supported Compose updates. Version migrations and managed stacks require their official update procedure.

```bash
npm run security:scan
```

Nod.ie does not expose Docker administration through the browser or execute payments, shell commands, or memory writes through conversation. See [responsible disclosure](SECURITY.md) and [update monitoring](docs/SECURITY_UPDATES.adoc).

## Diagnostics

Health/activity monitoring samples container state and host resource pressure every minute. Settings shows alerts and bounded application logs; local voice can explain a read-only diagnostic snapshot. See [monitoring scope and logging](docs/DIAGNOSTICS.adoc). These signals are not proof of an intrusion.

## Documentation and contributions

Canonical documentation is in [`docs/*.adoc`](docs/TECHNICAL_SOLUTION_DOCUMENT.adoc). Install the gems in `docs/Gemfile`, then run `npm run docs` to build the branded technical solution PDF. Generated PDFs are not committed.

See [contributing](CONTRIBUTE.md), [testing](docs/TESTING.adoc), [memory](docs/MEMORY.adoc), and [troubleshooting](docs/TROUBLESHOOTING.adoc). Older Markdown design notes describe historical implementations.

Public repository: https://github.com/KnowAll-AI/Nod.ie. Licensed under [MIT](LICENSE).
