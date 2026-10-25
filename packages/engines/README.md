# @vibetracker/engines

Audit engines for [VibeTracker](https://github.com/shantanugopale/vibetracker).
V1 ships the deterministic engine: it runs the quality gates declared in
`.vibetracker/config.json` (lint / typecheck / test) in the user's worktree and
returns exit-code evidence — no API keys, no LLM in the loop.

Security hardening built in:

- `.cmd` / `.bat` gate commands are refused outright (batBadBut CVE-2024-27980)
- gate commands must be declared in the committed config, not interpolated

V2 will add AI auditor engines (opencode, Claude Code, Codex, Gemini CLI,
Ollama) behind the same `AuditorEngine` port.

Most users want the CLI instead:

```bash
npx vibetracker init
```

Docs: <https://github.com/shantanugopale/vibetracker> · License: MIT
