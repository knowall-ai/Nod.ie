# Contributing to Nod.ie

Thank you for contributing. Nod.ie is MIT-licensed; contributions are made under the same licence.

1. Open an issue describing the problem or proposed behaviour. For vulnerabilities, use [SECURITY.md](SECURITY.md) instead.
2. Branch from the maintained integration branch and make a focused change. Preserve local configuration and unrelated work.
3. Use Node.js 22+ and `npm ci`. Run `npm test` and `npm audit`; describe any live-service checks separately.
4. Keep desktop and browser audio paths shared. Validate configuration and IPC, release media resources on every exit path, and keep the renderer isolated from Node.js.
5. Add regression tests for security boundaries, concurrency and meaningful behaviour changes. Use mocked services and synthetic audio; never exercise real payments or destructive memory operations in CI.
6. Update the relevant `docs/*.adoc` section in the same change. Follow the T-Minus-15 documentation/generate-docs skills referenced by KnowAll AI's Claude plugins. Run `npm run docs`; review the generated PDF and do not commit it.
7. Open a pull request explaining the problem, changed behaviour, validation and limitations. Link the issue and include screenshots for UI changes where useful.

Never commit `.env`, MCP credentials, wallet data, recordings, private graph exports, generated PDFs or logs. Do not add arbitrary shell execution, automatic updates or ambient-voice approval for privileged operations.

See [installation](docs/INSTALLATION.adoc), [solution design](docs/SOLUTION_DESIGN.adoc) and [testing](docs/TESTING.adoc).

## Nod.ie chooses her own words

Keep conversational wording model-generated. Code determines reliable facts, event types, timing, permissions and delivery channels; Nod.ie chooses how to express those facts in her own voice. Do not implement fixed spoken scripts, stock greetings or prewritten announcement variants. Prompts may constrain length, tone and factual content without prescribing the exact utterance.

For example, an unfamiliar-face event should provide the observation, recognition uncertainty and notification intent—not a sentence for her to recite. Model output never authorises actions or turns uncertain recognition into a confirmed identity. If language generation is unavailable, use a factual on-screen status rather than substituting a canned spoken line. Stable button labels, accessibility text and technical error messages are appropriate exceptions.
