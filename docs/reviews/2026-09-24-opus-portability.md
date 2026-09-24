# Independent review record

Requested model: `claude-opus-5-5`. Read-only source review; no tests executed by reviewer. Findings refer to the pre-fix baseline and pending recognition work. Some broad claims require validation; see the curated portability audit.

# Nodie portability review: can it serve any household on any machine?

**Verdict:** not yet. The security side is careful: loopback binding, allowlisted IPC senders, bounded inputs, checksum-pinned models, and memory/tool data labelled as untrusted. The product layer is the problem. It is built around one developer's setup: a Bitcoin/Lightning node, English speech, a UK timezone, one persona and author, a cat-owning family, a Qwen model alias, and a pre-existing `ai-stack` Docker environment. Several of these assumptions sit in the core conversation loop, so they are defaults that change behaviour for everyone, not optional extras.

The findings below are in the order I'd fix them. Each gives the evidence, the actual effect, and a remedy.

---

## High severity

### H1. Bitcoin/Lightning is built into the core conversation loop
- **Evidence:**
  - `lib/node-snapshot.js:12-15`: the keyword list includes `core`, `channels?` and `sats?`. A follow-up utterance also matches if the previous turn matched.
  - `lib/local-voice.js:108-114`: a match forces a node snapshot into every such turn. Otherwise `get_node_status` is offered on every turn.
  - `lib/node-snapshot.js:20-23`: runs `docker exec` against containers hard-coded as `lnd` and `bitcoind`, with a hard-coded **mainnet** macaroon path.
  - `main.js:23-24`: the snapshot publisher runs every 30 s on every install.
  - Unmute side: `unmute-service/node_context.py:9-10` does the same.
  - Prompts: `lib/assistant-context.js:9` says "our current Bitcoin/Lightning"; `SYSTEM-PROMPT.md:7` lists Bitcoin and Lightning as topics.
  - `security/monitor.js:9-15, 97, 103` contains BTCPay/CLN/LND-specific advisory logic. It starts unconditionally at `main.js:197-199`.
- **Effect:**
  - "What's on the TV channels tonight?" or "apple core" triggers Docker execs. A "Lightning unavailable" result is then injected as a forced tool result, which pushes the model toward node talk.
  - On every other machine the app runs Docker commands every 30 s and every 60 s (`lib/diagnostics.js:33`) against containers that don't exist.
  - For these features to work, the desktop user needs Docker-socket access, which is equivalent to root.
- **Remedy:** a capability/plugin registry. Bitcoin node status, container diagnostics and container updates each become a plugin that is off by default and enabled per install. A plugin contributes its tool, its prompt fragment and its background job only when enabled and healthy. Replace keyword triggers with model tool selection, which already exists. Make the container names, the network (mainnet/testnet/signet) and the macaroon path plugin config.

### H2. The speech pipeline and intent parsing are English-only
- **Evidence:**
  - `lib/local-voice.js:93` forces STT `language: 'en'` (default model `faster-whisper-tiny.en`). `:156` forces TTS `language: 'en'`.
  - `voice/server.py:36` allowlists four English female voices; `:78` picks the language from the voice-name prefix only (`en-gb`/`en-us`).
  - Deterministic regexes, all English:
    - device controls: `modules/spoken-controls.js:4-16`
    - journal triggers: `lib/event-journal.js:15-18`, duplicated in Python at `unmute-service/journal_context.py:9,12,16,19`
    - pronoun check: `unmute-service/person_recall.py:17`
    - English given-name stoplist and phonetic rules: `unmute-service/person-recall.cjs:3,6`
  - `lib/time-context.js:3` formats dates with `en-GB`.
- **Effect:**
  - Non-English speech is forced through English transcription.
  - Journal questions, spoken controls and pronoun-driven recall never fire in other languages.
  - The JS and Python copies of the journal regex will drift apart.
- **Valid limit, not a defect:** the Unmute STT/TTS models are en/fr only (`unmute-service/stt.toml:9-11`, `tts.toml:9`). That is an upstream model constraint, but it should be declared as a language capability, not left implicit.
- **Remedy:**
  - Add `NODIE_LOCALE`. Pass it to STT/TTS, or omit the language so it auto-detects. Build the TTS voice list from `voices-v1.0.bin`.
  - Route intents through the existing structured-output model check (`checkControlIntent`), or through per-locale grammar files.
  - Keep one implementation of each trigger instead of JS and Python copies.

### H3. The assistant's identity is hard-coded, and the `ASSISTANT_NAME` setting does nothing
- **Evidence:**
  - `ASSISTANT_NAME` is stored and editable (`lib/config-schema.js:2-3`, `settings.js:9,55`), but nothing reads it.
  - The name is hard-coded in the control regex (`modules/spoken-controls.js:4`: `nod.ie|nody|noddy|no dee`), in the model intent checker (`lib/local-voice.js:34`), and in the tool text (`:12` "her name", `:131`).
  - `SYSTEM-PROMPT.md:3,13` hard-code the author ("built by Ben Weeks"), the company and country, and the GetNod.ie T-shirt.
- **Effect:** a user who renames the assistant in Settings sees no change. Voice controls still only respond to "Nodie", and the persona still names the author.
- **Remedy:** make the system prompt a template (`{assistant_name}`, `{name_aliases}`, optional `{operator}`), with an override file in the user data directory. Feed the name and its aliases to both the regex path and the model intent path. Treat branding as a replaceable default "persona pack".

### H4. Assumptions about household shape and pets
- **Evidence:**
  - `SYSTEM-PROMPT.md:21` says "Their spouse and children are theirs"; `:19` talks about the "total number of children".
  - Structured vision only counts **cats** with a fixed English colour list (`lib/vision-analysis.js:19-20, 33-36`). The debug text reads "No person or cat detected" (`lib/journal-vision.js:5`).
  - The pet/coat-colour prompts at `unmute-service/person_recall.py:51,53` and `journal_context.py:37` assume a cat-owning family.
- **Effect:** dogs and other pets are never journalled. Single-person, flatmate or care households get prompts that presume a spouse and children. Colour words are English-only.
- **Remedy:** make observation categories configuration. Either take species from Reverie `Animal` nodes, or use a generic `{species, colour}` schema with a configurable species list. Rewrite the prompts to be relationship-neutral ("recorded relationships belong to the user").

### H5. Model and service assumptions produce silent failures
- **Evidence:**
  - **Vision model fallback:** vision uses `LOCAL_VISION_MODEL`, else `LLM_MODEL`, else `nodie-qwen3.5:9b` (`main.js:70,81`, `lib/web-server.js:10`, `lib/vision-analysis.js:3`).
    - `.env.example:33` sets `LLM_MODEL=llama3.2:3b`, a text-only model, and does not list `LOCAL_VISION_MODEL`. So the documented configuration sends camera frames to a model that can't see.
    - `nodie-qwen3.5:9b` is an alias that only exists if the user created it by hand (`docs/UNMUTE.adoc:24`).
  - **Thinking control:** `think:false` is only sent when the model name matches `/^qwen3\.5/` (`lib/local-voice.js:35,107`). The `nodie-qwen` alias and other reasoning models (qwen3, deepseek-r1, …) will still "think", adding latency.
  - **Realtime prompt claims** (`renderer.js:231`):
    - it says the transport is "Unmute with Qwen" whatever the configured model;
    - it says Reverie save/search tools are available even when `mcp-trial.json` is `{}`;
    - it embeds `new Date().toString()` once at connect time, so the date goes stale during long sessions.
  - **Backend patch:** `prepare-backend.py:13` always injects `"reasoning_effort": "none"`, a Qwen/Ollama-specific request field. `compose.override.yml:24` pins `KYUTAI_LLM_MODEL`.
- **Remedy:**
  - A model capability registry: probe Ollama `/api/show` capabilities (vision, thinking, tools) at startup.
  - Make `LOCAL_VISION_MODEL` required when vision is enabled.
  - Build the prompt's capability claims from what is actually connected.
  - Inject the time each turn on the server side.
  - This also brings the code in line with CLAUDE.md's own "no config fallbacks" rule (`CLAUDE.md:213-221`), which `main.js:70` breaks.

### H6. Recognition enrolment policy (main branch and the uncommitted worktree)
**Main branch:**
- Every unknown voice or face is enrolled silently (`lib/speaker-recognition.js:64`, `lib/face-recognition.js:37`). Once the 32-profile cap is reached, new people are **silently not enrolled**. Nothing evicts unnamed profiles except the 7-day expiry (`:21`, `:17`).
- The profile files are locked to the model hash. After any model upgrade, `p.model !== MODEL` (`speaker-recognition.js:18`; face `:16`) throws, and recognition stays "unavailable" until the user deletes all profiles. There is no migration or re-enrolment path.
- Faces only gain extra samples through a manual merge.

**Uncommitted worktree (`/tmp/nodie-recognition-conversation`):**
- `lib/live-speakers.js:12` switches live listening to `enrol: true`. Every ~4 s window now auto-enrols TV, radio, visitors, and the assistant's own voice if echo cancellation leaks. That fills the 32 slots quickly.
- **Name binding is by time, not by speaker:**
  - `recognition-names.js:5-6` names whichever single speaker was in the *last analysed window* within 15 s.
  - `recognition-session.js:13` re-runs the intent check against **every new observation** for 10 s. A later window (another person or the TV) can therefore receive the name.
  - The backend already computes per-word attribution (`recognition_context.py:23-38`), but naming doesn't use it.
- **Free-text capture:** the self-introduction regex (`recognition-session.js:16`) accepts any run of letters. "I'm going to the shop" proposes the name "going to the shop", and "I'm Ben's dad" proposes "Ben's dad". The only guard is a 10-word English stoplist. After that, anyone saying "yes" within 60 s confirms it (`:15`); the voice confirmation isn't tied to a speaker.
- **Two naming policies:** local mode still lets the model name a speaker directly without confirmation (`lib/local-voice.js:133-135`), while realtime mode requires confirmation.
- `prepare-recognition.py:31` uses an unchecked `str.replace`, unlike its guarded `patch()` helper.
- The name regex rejects curly apostrophes (’), which STT often outputs, and zero-width joiners, which Indic and Persian names need.

**Remedy:**
- Default to **explicit enrolment**, or require consent for auto-enrolment. Keep a separate bounded, least-recently-used pool of unnamed profiles.
- Bind a proposed name to the profile ID attributed to the introduction words, and require confirmation from that same profile or by clicking the UI.
- Put a version on the profile store with a re-enrolment/migration flow.
- Put the match thresholds in the model manifest JSON.
- Use one naming policy for both modes.

---

## Medium severity

### M1. Timezone defaults and inconsistency
- `Europe/London` is the default in `lib/event-journal.js:17,19`, `journal_context.py:14` and `compose.events.yml:5`.
- The Electron side reads `process.env` directly, so `NODIE_TIMEZONE` in `.env` is **ignored**. `config.js:6` merges `.env` into its own object, not into `process.env`.
- Meanwhile `lib/time-context.js:2` uses the system timezone.
- **Effect:** a user in New York at 21:00 asks "what happened today?" and gets the London calendar day, which has just started. Most of their own day is missing, while the model is told the local New York time.
- **Remedy:** resolve the timezone once in config (default: system timezone via `Intl`), pass it explicitly to the journal, and export it to the compose environment.

### M2. Data paths and platform assumptions
- `~/.config/nodie/...` is hard-coded in `main.js:18,19,23`, `speaker-recognition.js:81`, `face-recognition.js:56` and `web-server.js:7,130-133`.
- Logs and settings use `app.getPath('userData')` (`main.js:16`), so data is split across two roots. `XDG_CONFIG_HOME` and the Windows/macOS conventions are ignored.
- `face-recognition.js:48` runs a POSIX, repo-relative `.venv-face/bin/python`, which breaks on Windows and in packaged/asar builds.
- Linux-only pieces: `systemd-run` (`scripts/start-*-service.sh`) and `notify-send` (`web-server.js:130,132`).
- **Remedy:** a single data-directory resolver with an environment override; recognition helpers run as services with configurable URLs; platform notification adapters.

### M3. Endpoints and configuration gaps
- The speaker service is hard-wired to `127.0.0.1:8106` (`speaker-recognition.js:87`, `speaker_service.py:134`). By contrast, the TTS port can be configured.
- Settings exposes only a subset of the configuration; the `LOCAL_*` keys bypass the schema through `getConfig` defaults.
- `.env.example` is missing `LOCAL_VISION_MODEL` and `NODIE_TIMEZONE`, and still carries legacy MuseTalk/N8N keys.
- The web server does not reach feature parity: it has no journal wiring and no recognition bridge in `browser-bridge.js`.
- **Remedy:** one validated schema covering every key, with required/optional flags and per-capability groups.

### M4. Deployment is coupled to the developer's stack and a specific Unmute fork
- `compose.override.yml:1` says "apply after the existing ai-stack Compose file".
- `musetalk-service/docker-compose.yml:22-40` requires an external `ai-stack` network. Its `:10` publishes port `8765` on **all interfaces**, unlike `compose.neural.yml:9`, which binds to loopback.
- `prepare-*.py` patch exact source strings of one fork revision. They fail closed, which is good, but they're brittle.
- Everything assumes NVIDIA.
- **Remedy:** a self-contained reference compose with a pinned upstream commit, versioned patch files checked against that commit, and a documented CPU-only profile.

---

## Low severity

- **Developer paths and hostnames in tests and docs:**
  - `tests/run-all-tests.js:75-127` points at `/mnt/raid1/GitHub/Nod.ie` and **reads the real `.env`**.
  - `tests/check-services.js:72` and `tests/run-non-electron-tests.js:73` refer to `black-panther/ai-stack`.
  - Also `docs/FORK-*.md`, `UNMUTE-FORK-CHANGES.md:5,45`, and RTX 3090-specific sizing in docs.
- **Avatar is hard-coded:** asset paths in `index.html:25,30` and `modules/avatar-manager.js:122,126`; crop coordinates at `scripts/render-idle-avatar.py:19`; the default at `neural_api.py:36`. A custom avatar needs code edits. Fix: an avatar-pack manifest.
- **Misleading name:** `reverie-readonly.cjs` exposes `save_memory`, which misleads anyone auditing it.
- **Wasted work per frame:** face analysis re-hashes the model files on every frame (`face_frame.py:21-23`), and `FaceStore.load` writes to disk on every call (`face-recognition.js:20`).
- **Unmute token:** `stt.toml`/`tts.toml` use `authorized_ids = ["public_token"]`. That's acceptable only if the ports stay on loopback; I couldn't verify this, because the port bindings are in the external `ai-stack` compose.
- **Two device-control paths:** a regex path in the renderer and a model-plus-classifier path in main. In local mode the full LLM/TTS turn runs, and is saved to history, before the regex overrides it (`modules/local-voice-session.js:96`).

---

## Valid limits to keep (not product assumptions)
- **Size and time caps:** 512 KB JPEG, 5 MB / 30 s audio, 16 KB node snapshot, 3 MB / 6,000-event journal with 60 events per answer, 200-person index (it reports `indexTruncated`), and the lookup and HTTP deadlines.
- **Recognition bounds:** 32 profiles, 8 voice samples and 4 face samples per person, vector dimension and norm checks, 7/30/0-day retention, and the 1280×960 face-frame limit (the camera path scales frames to fit).
- **Integrity:** SHA-256 model pinning, `MAX_SATS` validation, and fixed read-only `lncli` commands. That last one is safe in design; the problem is only that it's on by default.
- **Access control:** loopback binding plus Host/Origin checks, IPC sender allowlisting, and framing all tool, memory and image data as untrusted.
- **Upstream constraint:** Kyutai's en/fr model limit (valid, but should be surfaced).

## Suggested order of work
1. Config foundation: locale, timezone, assistant name and aliases, persona file, and a data-directory resolver.
2. Capability/plugin registry: move Bitcoin, Docker diagnostics and container updates behind it, default off.
3. Model capability probing.
4. Recognition enrolment and naming redesign, before merging the worktree.
5. Localised intent layer.
6. Self-contained deployment.

## Inspection limits
- **No files were modified.**
- **Worktree changes:** I had no shell, so I couldn't run `git status` or `git diff` in either tree. I found the worktree's changes by looking for files that exist only there (`recognition-names.js`, `recognition-session.js`, `recognition_context.py`, `prepare-recognition.py`) and by reading the recognition-related files and call sites. Other edits in that worktree may exist that I didn't review.
- **Not run:** no tests were executed. Behavioural effects above come from reading the code, except the Llama 3.2 3B vision failure, which is inferred from the model being text-only.
- **Not read:**
  - `.env`, credentials, logs, recordings, `node_modules` (so `@knowall-ai/reverie` and upstream Unmute weren't inspected) and git internals.
  - The `generated/` adapter outputs.
  - Most of `docs/` (searched by keyword only), legacy MuseTalk and audio modules, root `test-*.js` scripts, and most of `settings.html`.
  - `security/monitor.js` was reviewed only through search hits.
- **Disclosure:** I read the committed `.env.example`, which is a template with no secrets. If you meant it to be excluded too, disregard the two findings that cite it.