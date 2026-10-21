# VibeTracker — End-to-End Build Plan

> Track your vibe-coding progress. Bring any AI — or none.
>
> Status: V1 in progress. This document is the single source of truth for the
> build. Product roadmap (machine-parseable) lives in `ROADMAP.md`.

---

## 1. Vision and positioning

VibeTracker is a local-first, open-source (MIT) tool for people who build
software with AI coding agents. The user plans work as a markdown roadmap of
phases, tasks, and acceptance criteria. Whatever tool builds the work —
Claude Code, OpenCode, Codex, Gemini CLI, Cursor, or the user typing code
manually — VibeTracker watches git, verifies each commit against the
acceptance criteria, marks state honestly, and streams live progress to a
local web dashboard.

**One-line gap statement:** existing products manage *which agents run*
(Vibe Kanban) or *which tasks exist* (Task Master, Atlas, goal-acceptance,
Taskr, Maestro) — for a single tool, usually Claude Code. Nothing verifies
*done-ness* consistently across every tool and every human. VibeTracker does.

### Competitor matrix (research done 2026-10)

| Product | Strength | Missing that VibeTracker covers |
|---|---|---|
| Vibe Kanban (BloopAI, 28k stars) | Kanban orchestration of many agents, worktrees, diff review | Hosted parts sunset Apr 2026; never verifies done-ness; agent-runner, not auditor |
| Claude Task Master | PRD -> dependency-ordered tasks via MCP | Claude-centric; no AI/diff verification; no dashboard |
| prd-taskmaster (Atlas) | Evidence-gated completion, graded PRDs | Claude-oriented, terminal-only, no web UI |
| goal-acceptance | Anti-self-grading, typed evidence, completion gate | Terminal-only; the anti-self-grading idea is adopted here |
| Taskr / Maestro | Markdown task files in repo + boards/local specs | No AI audit, no live dashboard |

### Borrowed ideas
- Task Master: roadmap parsing + dependency thinking.
- Atlas: evidence must precede "done"; deterministic gates.
- goal-acceptance: anti-self-grading (self-claims are `in_review`, never
  `verified` until independent evidence confirms); typed evidence.
- Taskr / Maestro: plain markdown + git-tracked state, human-editable.
- Vibe Kanban: dashboard polish bar.

---

## 2. Locked decisions

| Decision | Choice |
|---|---|
| Product model | Agent-agnostic core; per-tool integrations are thin adapters |
| Event bus | Git commits + working-tree diffs (works for every tool and manual work) |
| Source of truth | Git-tracked files: `ROADMAP.md` (human) + `.vibetracker/` (machine) |
| AI auditing | Hybrid engine registry: CLI adapters (opencode / claude / codex / gemini / ollama) AND direct-API engines (OpenAI / Anthropic), user-configurable |
| Release order | V1 = deterministic gates only (zero API keys needed). AI engines land in V2 behind the same `AuditorEngine` port |
| Distribution | Single npm package, `npx vibetracker`; GitHub repo, MIT license |
| Priorities | Security-first, hexagonal/SOLID architecture, enterprise-grade extensibility |

---

## 3. Architecture — hexagonal (ports and adapters)

```
+---------------------------------------------------------------------------+
|                        VibeTracker Core (pure TypeScript)                 |
|  Domain: Roadmap / Phase / Task / Criterion / Verdict / StateMachine       |
|  Pipeline: WatchEvent -> Gates -> Auditor registry -> StateStore -> Events|
|  Registry pattern: engines register by capability; core knows no vendors  |
+---------------------------------------------------------------------------+
```

### Ports (interfaces owned by core)

| Port | Purpose | V1 adapter | V2 drop-in adapters |
|---|---|---|---|
| `TaskSource` | Parse roadmap into domain model | markdown parser + `phases.json` importer | Jira/GitHub Projects import |
| `WatcherSource` | Emit work events | git commit watcher + tool shims | cloud webhooks |
| `QualityGate` | Deterministic pass/fail with evidence | lint, typecheck, test gates | custom script gates |
| `AuditorEngine` | Judge diff vs criteria, return verdict JSON | stub "echo" engine | opencode CLI, claude CLI, codex CLI, gemini CLI, ollama, OpenAI SDK, Anthropic SDK |
| `StateStore` | Durable, atomic state | atomic file store (state.json + audit JSONL) | SQLite if ever needed |
| `EventSink` | Broadcast events | SSE broadcaster | WebSocket bridge |
| `ReportSink` | Render reports | SVG badge, static HTML | hosted reports |

### Packages (npm workspaces monorepo)

```
packages/
  core/        domain + pipeline + contracts (deps: zod only)
  engines/     quality-gates (V1); cli-adapters + api-adapters (V2)
  cli/         vibetracker init|status|verify|watch|export-badge|serve|hooks
  mcp/         vibetracker MCP server (track_init, track_status, verify_now, flag_blocked)
  dashboard/   Svelte + Vite app served by local Hono server
  sdk/         typed client for programmatic use (later)
```

Key extensibility guarantee: every V2 feature is a new adapter implementing an
existing port, registered via config. The core never changes, so releases stay
semver-clean and non-breaking.

---

## 4. Data model

### ROADMAP.md grammar (human-editable, git-tracked)

```markdown
# Project Roadmap

## Phase 1: <name>
### Task 1.1: <title>
- Acceptance: <criterion text>
- Acceptance: <another criterion>
```

Parser maps: `## Phase N: name` -> phase, `### Task N.M: title` -> task with
id `tN.M`, each `- Acceptance:` line -> criterion with id `tN.M:c1..cn`.

### `.vibetracker/state.json` (schema-versioned)

```json
{
  "schemaVersion": 1,
  "updatedAt": "ISO8601",
  "criteria": {
    "t1.1:c1": {
      "status": "verified",
      "evidence": [{ "type": "gate", "gate": "test", "code": 0, "ref": "audit/000123.jsonl" }],
      "verifiedAt": "ISO8601"
    }
  }
}
```

Criterion status machine: `pending -> in_progress -> in_review -> verified`
with failure paths to `failed`, `drift`, `blocked`. Rules:
- A criterion reaches `verified` only with evidence (gate pass now; V2 adds
  AI verdict evidence).
- Self-claims (via MCP) max out at `in_review`.
- `drift` marks previously verified criteria whose evidence now fails.

### `.vibetracker/audit/*.jsonl` (append-only)

Every audit run appends one line: commit ref, gate results, verbatim verdict,
timestamp. Git-visible, diffable, recovery source for corrupted state.

---

## 5. Security requirements (each is testable)

1. S-1 Process spawning uses argv arrays only — never string-interpolated
   shell lines.
2. S-2 Gate commands come exclusively from the config allowlist
   (`.vibetracker/config.json`); nothing parsed from ROADMAP.md or state may
   run as a command.
3. S-3 All external input (state JSON, MCP payloads, engine verdicts) is
   zod-validated before touching domain state.
4. S-4 Atomic writes (temp file + rename) plus file locking; concurrent
   CLI/watcher/MCP writes can never corrupt state.
5. S-5 No secrets in state, logs, or audit files; redaction applied to
   anything echoed to engines.
6. S-6 Integrated agents (auditor shims) run read-only: file edits and write
   commands denied by their agent permission config.
7. S-7 Code leaves the machine only to the model provider the user configured;
   documented loudly in the README. Ollama = fully local mode.
8. S-8 Path traversal protection on any path sourced from state/config;
   Windows-first path handling (paths are resolved, normalized, and checked
   against the worktree root).
9. S-9 Anti-self-grading: agent self-reports cannot produce `verified`; only
   gate/engine evidence can.
10. S-10 Audit-first: every verdict is appended to the log before state
    updates (write-ahead ordering).

---

## 6. Stack

| Concern | Choice | Rationale |
|---|---|---|
| Language | TypeScript 5 (strict) | matches adapter ecosystems (opencode plugins, MCP SDKs) |
| Runtime | Node >= 20 (works on 22; Bun optional, never required) | zero-friction for vibecoders; user machine already has Node 22 |
| Monorepo | npm workspaces | no extra tooling required (bun absent on build machine, Windows PowerShell blocked global scripts) |
| HTTP + SSE | Hono | tiny, middleware-friendly, SSE native |
| Dashboard | Svelte + Vite + Tailwind + lucide | lighter than Next.js; no SSR complexity for a localhost tool |
| Validation | zod | one schema serves core, MCP, and engines |
| Tests | vitest | TS-native, fast |
| Lint/format | biome (added in P1) | single fast binary |
| Build | tsc project references | reliable on Windows; no bundler risk for core/cli/mcp |

---

## 7. Build phases and acceptance criteria

Machine-parseable version lives in `ROADMAP.md`; this table is the narrative.

| Phase | Deliverable | Acceptance criteria |
|---|---|---|
| P0 Scaffold | monorepo, toolchain, CI | npm install clean; all packages compile; vitest runs; CI matrix green on windows + ubuntu |
| P1 Core domain | parser, zod schemas, state machine, atomic store | golden-file parser tests; corrupted state.json recovers; write-ahead audit ordering enforced |
| P2 Gates | lint/typecheck/test engines + verdict logic | failing gate blocks `verified`; evidence IDs recorded; allowlist enforcement blocks unlisted commands |
| P3 Watcher + CLI | git watcher, full CLI, shim generator | manual-only commits trigger audits; `init` detects installed CLIs and writes only relevant shims; works in a fresh repo |
| P4 Dashboard | local web UI + SSE | progress ring, phase cards, criteria checklists, verbatim verdict feed; second tab updates < 1s |
| P5 MCP + shims | MCP server, opencode/Claude shims | opencode session-idle triggers audit; MCP self-report lands as `in_review` on the dashboard |
| P6 Polish + publish | badge/HTML export, GitHub Action, docs, npm publish | badge renders; dogfooding proof: VibeTracker's own scoreboard in its own README |

Dogfooding rule: from P3 onward, VibeTracker tracks its own construction via
its own `ROADMAP.md` and publishes its own scoreboard.

### V2 (AI engines, same `AuditorEngine` port, order fixed)

1. opencode CLI engine (`opencode run --agent vibetracker-auditor`)
2. Claude Code CLI engine (`claude -p`)
3. Codex CLI engine (`codex exec`)
4. Gemini CLI engine
5. Ollama engine (fully local)
6. OpenAI / Anthropic SDK engines (hybrid requirement)

Anti-self-grading in V2: AI verdicts are stamped `selfClaimed` when the engine
identity matches the builder identity; a second, different engine (or the
deterministic gates) must confirm before `verified`.

### Out of scope for V1/V2 (revisit later)
Team/cloud sync, multi-user boards, Jira import, telemetry/cost dashboards.

---

## 8. Testing and CI

- Unit: every port has a contract test; parser golden files; state machine
  transition table; atomic-write crash simulation.
- Integration: temp-dir repos (real git) exercising watcher + gates;
  MCP over stdio; dashboard SSE via fetch.
- CI: GitHub Actions matrix windows-latest + ubuntu-latest, Node 20 + 22 —
  `npm ci`, `npm run build`, `npm test`.
- Registry safety: publish from CI only, on tags, after matrix green.

---

## 9. Publishing and launch

1. GitHub repo: `github.com/shantanugopale/vibetracker` — MIT, README with GIF + badge, CONTRIBUTING, PLAN.md (this file).
2. npm: `@vibetracker/*` packages + `vibetracker` bin (publish on tag).
3. Launch channels: Hacker News (Show HN), r/vibecoding, X/Twitter, opencode
   Discord, GitHub Topics (vibe-coding, ai-agents).
4. Funnel: npx install -> opencode project onboarding -> GitHub star.

---

## 10. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Windows quirks (paths, processes) | Windows-first development; path guards (S-8); CI windows-latest |
| Concurrent writers corrupt state | atomic writes + lock + audit-log recovery (S-4, S-10) |
| Scope creep into AI early | AI is phase-gated: no engine code before P6 gates pass |
| Monorepo tool churn | boring tooling: tsc + vitest; no bundler dependency for V1 |
| LLM JSON fragility (V2) | strict zod verdict contract with bounded retries; invalid verdicts = `in_review` + logged |
| npm name collisions | check `@vibetracker` scope before publish; fallback names predefined |

---

## 11. Model recommendations (OpenCode)

| Role | Model class | Why |
|---|---|---|
| Building VibeTracker (day-to-day driver) | strong reasoning coder: GPT-5.x Codex class or Claude Sonnet class; budget fallback: Qwen3 Coder / GLM free tier | multi-file TS design; run `opencode models --refresh` to inspect available list |
| Auditor engines (V2 runtime) | cheap + fast: flash/mini class (Gemini Flash, GLM-Air, haiku class), user-overridable | audits run frequently; keep auditor model different from builder model to avoid self-confirmation bias |
| Fully local option | Ollama (qwen-coder class) | offline/private mode |

---

## 12. Audit verdict contract (V2, frozen now so V1 code compiles against it)

```json
{
  "taskId": "t1.1",
  "criterionId": "t1.1:c2",
  "status": "VERIFIED | FAILED | DRIFT",
  "confidence": 0.0,
  "evidence": [{ "type": "gate", "gate": "test", "code": 0 }],
  "selfClaimed": false,
  "reasoning": "string",
  "remainingGaps": ["string"]
}
```

---

## 13. Execution efficiency plan (how the build is sequenced and why)

Goal: minimum total rework, maximum parallelizable work, every phase shippable.
The plan is executed top-to-bottom; no phase starts before its entry condition.

### 13.1 Ordering rules

1. **Contracts before consumers.** Domain schemas + verdict contract are coded
   and tested first; every later package (cli, mcp, dashboard, engines)
   compiles against them. Schemas change only via schemaVersion migration.
2. **Risk-first vertical slices.** The riskiest core (parser, state machine,
   atomic store) is built and proven before any UI/UX work. Thin layers
   (dashboard, MCP) are never blocked behind unknowns.
3. **One pipeline slice end-to-end before breadth.** A single gate type
   (test) flows watcher -> gates -> verdict -> state -> audit log before the
   lint/typecheck gates are added; breadth is then mechanical.
4. **Windows-first.** All dev happens on Windows PowerShell; CI proves
   portability to Linux, never the reverse. This kills the classic
   "works on macOS only" rework loop.
5. **Security invariants are tests, not reviews.** Each S-rule (S-1..S-10)
   gets a named failing-first test the moment the related code lands.

### 13.2 Parallel tracks (safe because contracts are frozen)

After P1 lands, three tracks proceed independently against `@vibetracker/core`:

| Track | Package | Depends on |
|---|---|---|
| T-A pipeline | engines, cli watcher | QualityGate port, store |
| T-B surfaces | mcp, cli shim generator | core API + verdict contract |
| T-C dashboard | dashboard | SSE event schema only |

### 13.3 Definition of Done (every phase, no exceptions)

- `npm run build` clean on strict TypeScript
- `npm test` green, including the phase's ROADMAP.md acceptance criteria
  mapped 1:1 to test names (traceability: acceptance criterion == test)
- No security rule regressed (S-1..S-10 tests green)
- ROADMAP.md criteria for the phase marked done (dogfooded once P3 lands)

### 13.4 Publish checkpoints

- v0.1.0 after P4 (usable tracker + dashboard, deterministic only)
- v0.2.0 after P6 (MCP + shims + badge/Action) — first public launch
- v0.3.x V2 AI engines, one PR per engine, all behind AuditorEngine port

### 13.5 Tracking home

Repo: `github.com/shantanugopale/vibetracker` (MIT). Local git history is the
build log; ROADMAP.md is the scoreboard; releases are tags cut by CI.
