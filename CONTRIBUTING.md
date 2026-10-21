# Contributing

Thanks for helping out. VibeTracker is a security-sensitive tool: it spawns
processes, writes files, and is used by AI agents. Please read
[PLAN.md](./PLAN.md) (§5 Security) before writing code.

## Setup

```bash
npm install
npm run build   # tsc -b + dashboard build + web-asset copy
npm test
```

## Ground rules

- Parse, don't patch: keep ROADMAP.md the single source of truth.
- Security rules S-1..S-10 in PLAN.md are enforced with named tests; if your
  change touches process spawning, filesystem writes, or external input, add
  the corresponding test first.
- Quality gates are the only path to `verified`. Agent/AI verdicts stop at
  `in_review` (S-9) — that includes contributions from coding agents.
- Every acceptance criterion in ROADMAP.md maps to a named test; keep the
  mapping 1:1.

## Pull requests

1. Fork, branch from `main`.
2. `npm run build && npm test` must be green (Windows and Linux both matter).
3. Regenerate `.vibetracker/badge.svg` if your change moves progress
   (`npx vibetracker export`).
4. Keep PRs reviewable — one feature per PR.

## Reporting security issues

Open a private security advisory on GitHub rather than a public issue if your
report could expose a real-world exploit.
