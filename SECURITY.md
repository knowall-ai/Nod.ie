# Security policy

Nod.ie handles microphone audio, private memory and privileged deployment operations. Please report vulnerabilities privately; **do not open a public GitHub issue** with exploit details or credentials.

## Responsible disclosure

| Channel | Contact |
| --- | --- |
| Email | [support@knowall.ai](mailto:support@knowall.ai), subject `Security: Nod.ie` |
| Encrypted Nostr DM — Ben Weeks | `npub1jutptdc2m8kgjmudtws095qk2tcale0eemvp4j2xnjnl4nh6669slrf04x` |
| Encrypted Nostr DM — KnowAll AI | `npub1kue7etfxtkxlv0s4u2xjf9epgxj7hssmlhc4x2k66tn8q8598zfqj322ar` |

For email, send an initial message saying you have a security report and request an encryption key. Send sensitive details only through the agreed encrypted channel. Use encrypted DMs, not public Nostr notes. GitHub private vulnerability reporting may also be used when enabled under **Security → Report a vulnerability**.

Include the affected version/commit, component, prerequisites, steps to reproduce, impact and a minimal proof of concept. Remove seeds, private keys, macaroons, tokens, personal memory and real recordings.

We aim to acknowledge reports within **three working days**, provide an initial assessment within **ten working days**, and prioritise confirmed high/critical issues. We will coordinate disclosure, keep you informed and credit you with your permission. No paid bounty is offered.

## Scope and safe harbour

In scope: this repository's application, web server, IPC, audio lifecycle, memory integration, update discovery, approval and execution. We particularly welcome reports of credential exposure, path traversal, command injection, cross-origin access, approval bypass, image substitution or prompt injection reaching privileged operations.

Test only systems you own or have permission to assess. Do not move funds, interrupt live nodes, alter another person's graph or access unrelated data. Report third-party defects upstream as well where appropriate. Good-faith research following this policy will not result in legal action from us; this cannot authorise testing of third parties.

## Supported versions

Security fixes target the current maintained source and next release. Older snapshots are not maintained separately. A matching container version or digest is not a guarantee that all vulnerabilities are patched.

## Operational boundaries

- Keep secrets in ignored local configuration; never in renderer code or logs.
- The local web server is loopback-only and offers no Docker administration endpoint.
- Container scans are read-only; application requires a reviewed, expiring plan and explicit desktop approval.
- Reverie recall is read-only in local voice mode; the model has no payment, shell or update tools.
- Do not automatically restore stale Lightning database snapshots. Follow the node's documented recovery process.
