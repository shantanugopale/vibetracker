# VibeTracker

![progress](.vibetracker/badge.svg)

[![CI](https://github.com/shantanugopale/vibetracker/actions/workflows/ci.yml/badge.svg)](https://github.com/shantanugopale/vibetracker/actions/workflows/ci.yml)

Track your vibe-coding progress. Bring any AI — or none.

VibeTracker audits your git commits against a markdown roadmap of phases,
tasks, and acceptance criteria, and streams live progress to a local web
dashboard. It works with any AI coding agent — Claude Code, OpenCode, Codex,
Gemini CLI, Cursor — or plain manual coding. Git is the only event bus it
needs.

The badge above is **VibeTracker auditing itself** — this repo parses its own
ROADMAP.md, runs its own quality gates, and regenerates that SVG from the
result. Two criteria remain open on purpose: the GIF and the CI-driven npm
publish (next milestone).

- [PLAN.md](./PLAN.md) — end-to-end build plan (architecture, security, phases)
- [ROADMAP.md](./ROADMAP.md) — VibeTracker's own roadmap, in the format it parses

## Quick start

```bash
npm install
npm run build
npx vibetracker init        # scaffold ROADMAP.md + .vibetracker/config.json
npx vibetracker status      # print the scoreboard
npx vibetracker verify-now  # run configured gates, update state
npx vibetracker serve       # live dashboard at http://127.0.0.1:4321
npx vibetracker export      # badge.svg + report.html
```

Commands: `init`, `status`, `verify-now`, `watch`, `release`, `export`,
`serve`. Requires Node >= 20.

## How it works

1. `ROADMAP.md` declares phases (`## Phase N: Name`), tasks
   (`### Task N.M: Title`), and acceptance criteria (`- Acceptance:` lines).
2. `.vibetracker/state.json` tracks every criterion:
   `pending -> in_progress -> in_review -> verified`, with failure paths to
   `failed`, `drift`, and `blocked`.
3. Quality gates (lint / typecheck / test) run from
   `.vibetracker/config.json` on every new commit; passing gates with
   independent evidence move `in_review` criteria to `verified`, failing
   gates flag failures and re-verified drift.
4. Every audit appends an entry to `.vibetracker/audit/*.jsonl` before the
   state file is written (write-ahead, Git-visible, diffable).
5. AI agent self-reports cap out at `in_review` — only real gate evidence
   can reach `verified` (S-9).

## Agent integrations

`vibetracker init` detects installed agent CLIs and writes:

- an **opencode plugin** that runs `verify-now --quiet` on idle
- a **Claude Code stop hook** merged into `.claude/settings.json`
- a **read-only auditor agent** (`edit: deny`) so agents can report verdicts
  but never touch code or state

For MCP-capable tools register the stdio server:

```json
{ "command": "npx", "args": ["-y", "vibetracker-mcp"] }
```

Tools: `track_init`, `track_status`, `verify_now`, `flag_blocked`.

## Security

- **S-1** Processes spawn via argv arrays only; no shell string execution.
  On Windows, `.cmd`/`.bat` shims are refused outright
  ([batBadBut](https://cwe.mitre.org/cwe.html?cwe=77) defense) — call the
  underlying script with `node` directly, e.g.
  `{"command":"node","args":["node_modules/vitest/vitest.mjs","run"]}`.
- **S-2** Gate commands come exclusively from `.vibetracker/config.json`;
  nothing parsed from ROADMAP.md or state can execute.
- **S-3** All external input (state JSON, MCP payloads) is zod-validated.
- **S-4** Atomic writes (temp file + rename) with locking and stale-lock
  recovery.
- **S-6** The generated auditor agent runs read-only.
- **S-8** All filesystem paths are sanitized to stay inside the worktree.
- **S-10** Audit log append happens before every state write.

## Privacy

Everything is local: parsing, gate execution, state, the dashboard, and MCP
run on your machine against your own files. VibeTracker makes no network
requests — nothing is sent, phoned home, or recorded remotely.

## Development

```bash
npm install
npm run build
npm test
```

Requires Node >= 20. Works on Windows, macOS, and Linux.

## Roadmap

v0.1.0: parser, state machine, gates, watcher + CLI, live dashboard, MCP
server, badge/HTML export. Next: npm packaging + `npx vibetracker`,
AI auditor engines (V2), hosted status pages.

## License

MIT — see [LICENSE](./LICENSE).
