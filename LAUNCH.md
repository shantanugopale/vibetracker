# Launch kit (v0.1.3) — ready to copy-paste

Everything below is final copy. Post order: Show HN first (weekday morning US
time), then Reddit/X a few hours later so threads don't cannibalize each other.

---

## Show HN

**Title:**
Show HN: VibeTracker – audit your AI's progress against a Markdown roadmap, no LLM in the loop

**Text:**

Hi HN! I built VibeTracker because my AI coding agents kept telling me "we're
basically done" — while the diff was a horror show.

VibeTracker is a progress tracker for a) Vibe coding, b) AI coding agents in general, that audits claims instead of trusting them:

- You keep a `ROADMAP.md` — phases, tasks, acceptance criteria, plain Markdown, same format agents already read.
- Every claim (`in_review`) must pass your quality gates (lint/typecheck/test) before it becomes `verified`. The gates are real commands from your repo — no API keys, no LLM judging itself.
- A write-ahead audit log records every state change, so you can always see who verified what and when.
- `git` is the only event bus. Works with Claude Code, OpenCode, Codex, Gemini CLI, or plain manual coding — agent shims trigger the audit automatically at session idle.

What you get locally: `npx vibetracker status` prints a scoreboard; `npx vibetracker serve` runs a live dashboard at 127.0.0.1:4321; `npx vibetracker export` gives you a badge.svg for your README.

The anti-self-grading design point: an AI verifying its own work tends to agree
with itself. V2 adds AI reviewer engines, but they're stamped `selfClaimed`
when the auditor matches the builder — a *different* engine (or deterministic
gates) has to confirm.

The repo has vetted its own product end to end — the live badge in the README is VibeTracker auditing itself, 44/44 criteria, and the npm release pipeline publishes via GitHub OIDC (no tokens):
https://github.com/shantanugopale/vibetracker

npm: `npx vibetracker init` · Config format: ROADMAP.md + a gates config, MIT licensed.

Happy to answer questions — especially skeptical ones about whether deterministic gates can carry a progress tracker without an LLM.

---

## Reddit r/vibecoding

**Title:**
I got tired of my agent claiming "done" — built a tracker that makes it prove it (free, open source, no API keys)

**Body:**

VibeTracker: `npx vibetracker init`

The loop: write your roadmap as markdown phases → agent marks a criterion "in review" → the CLI runs YOUR typecheck/test gates before anything is marked verified → every state change lands in a write-ahead audit log → live dashboard at 127.0.0.1:4321 + a README badge.

- Works with any agent (Claude Code, opencode, Codex, Gemini, Cursor, or no agent)
- No API keys. Gates are just commands your repo already runs.
- MCP server included so agents can talk to the tracker directly
- MIT licensed: https://github.com/shantanugopale/vibetracker

The repo tracks itself — badge in the README is its own scoreboard (44/44).

Roast me on the format or the idea, both welcome.

---

## X/Twitter thread (4 posts)

1/ My AI agents kept saying "we're basically done." So I built VibeTracker: a progress tracker that makes claims pass your real gates (typecheck/test) before they count. `npx vibetracker init`. MIT, no API keys.

2/ How it works: ROADMAP.md (phases → tasks → acceptance criteria) → git is the event bus → every claim must produce gate evidence → verified criteria can flip to "drift" the moment a gate fails again. Nothing self-graded.

3/ It works with any agent — shims hook the audit to opencode/Claude Code session idle. Plus an MCP server, a live dashboard on localhost, and a badge.svg for your README.

4/ It tracks itself: the badge in the repo README is its own scoreboard, 44/44 criteria, npm releases via OIDC with zero tokens. https://github.com/shantanugopale/vibetracker

---

## Checklist before posting

- [x] GIF renders in README (assets/demo.gif)
- [x] Badge live (44/44, 100%)
- [x] CI matrix green (win+ubuntu, node 20+22)
- [x] npm: 0.1.3 published via OIDC, provenance attached
- [x] Repo topics tagged
- [ ] Show HN posted (you)
- [ ] Reddit/X posts go up 2–3h after HN (you)
