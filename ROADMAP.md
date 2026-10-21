# VibeTracker Roadmap

> This file is VibeTracker's own product roadmap, written in the exact
> grammar VibeTracker parses (dogfooding from day one).
> Grammar: `## Phase N: Name` -> phase; `### Task N.M: Title` -> task;
> every `- Acceptance:` line -> criterion.

## Phase 0: Project Scaffold

### Task 0.1: Initialize npm workspaces monorepo
- Acceptance: npm install completes cleanly on Node 20 and 22 without errors
- Acceptance: packages core, engines, cli, mcp, dashboard exist as workspaces
- Acceptance: build compiles every package that declares a build script

### Task 0.2: Configure TypeScript strict toolchain
- Acceptance: tsc project-reference build passes with strict type checking
- Acceptance: a vitest test in packages/core runs and passes from repo root

### Task 0.3: Set up repository hygiene
- Acceptance: .gitignore covers dist, node_modules, .vibetracker audit caches
- Acceptance: LICENSE is MIT and PLAN.md is committed as project plan
- Acceptance: GitHub Actions workflow exists for windows and ubuntu matrix

## Phase 1: Core Domain

### Task 1.1: Define domain model and zod contracts
- Acceptance: Phase, Task, Criterion, Verdict, CriterionStatus types exported
- Acceptance: state.json schema is zod-validated with schemaVersion 1

### Task 1.2: Implement ROADMAP.md parser
- Acceptance: parser maps the grammar in this file into the domain model
- Acceptance: golden-file tests pass on this repo's own ROADMAP.md
- Acceptance: malformed heading structure produces typed parse errors

### Task 1.3: Implement criterion state machine
- Acceptance: transition table enforced; invalid transitions rejected
- Acceptance: self-claimed progress cannot reach verified without evidence

### Task 1.4: Implement atomic state store with audit log
- Acceptance: writes are atomic temp-file plus rename with lock
- Acceptance: corrupted state.json recovers from audit JSONL
- Acceptance: audit append happens before state write (write-ahead)

## Phase 2: Quality Gate Engines

### Task 2.1: QualityGate port and gate runner
- Acceptance: gates execute via argv arrays with no shell string execution
- Acceptance: gate commands restricted to config allowlist
- Acceptance: evidence records carry gate name, exit code, and log reference

### Task 2.2: Built-in lint, typecheck, and test gates
- Acceptance: failing gate blocks criterion verification and reports evidence
- Acceptance: passing all gates moves criteria from in_review to verified

### Task 2.3: Verdict pipeline wiring
- Acceptance: pipeline emits events for every state transition
- Acceptance: drift detection flags previously verified criteria after gate failure

## Phase 3: Watcher and CLI

### Task 3.1: Git commit watcher
- Acceptance: watcher triggers audit on every new commit in any worktree
- Acceptance: audit completes for commits made by any external tool or manually

### Task 3.2: CLI commands
- Acceptance: init, status, verify-now, watch, and release commands work on Windows PowerShell
- Acceptance: init scaffolds ROADMAP.md template and .vibetracker config

### Task 3.3: Agent shim generator
- Acceptance: detects installed agent CLIs and writes only relevant shims
- Acceptance: generated shims run auditors read-only by agent permission config

## Phase 4: Dashboard

### Task 4.1: Hono server with SSE events
- Acceptance: serve command starts localhost server and streams state events
- Acceptance: concurrent second tab receives update within one second

### Task 4.2: Dashboard UI
- Acceptance: progress ring, phase cards, criteria checklists, verdict feed render
- Acceptance: Svelte build works on Windows and output is served statically by Hono

## Phase 5: MCP and Integrations

### Task 5.1: MCP server
- Acceptance: track_init, track_status, verify_now, and flag_blocked tools work over stdio
- Acceptance: MCP self-reports land as in_review, never verified (S-9)

### Task 5.2: opencode and Claude Code shims
- Acceptance: opencode session-idle event triggers verify-now through the plugin shim
- Acceptance: Claude Code hook shim performs the same trigger

## Phase 6: Polish and Publish

### Task 6.1: Reports and exports
- Acceptance: SVG progress badge renders correct percentage
- Acceptance: static HTML report exports full scoreboard

### Task 6.2: Documentation and publishing
- Acceptance: README includes GIF, badges, security and privacy disclosure
- Acceptance: npm packages publish from CI on tag after green matrix
- Acceptance: VibeTracker scoreboard visible in its own README (dogfooding)
