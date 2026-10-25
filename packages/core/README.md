# @vibetracker/core

The parser and state machine behind [VibeTracker](https://github.com/shantanugopale/vibetracker) —
an open-source progress tracker that audits git commits against a `ROADMAP.md`
of phases, tasks, and acceptance criteria.

`@vibetracker/core` exports:

- `parseRoadmap(markdown)` — strict parser for the roadmap format (`{ ok, roadmap, errors }`)
- `loadState` / `saveState` / `commit` — write-ahead state store with lock + audit log
- `transition` and the state machine — the legal claim lifecycle
  (`pending → in_review → verified`, plus `failed`, `drift`, `blocked`)
- `evaluate` — flips `in_review` criteria to `verified`/`failed` from independent
  gate evidence, and flags `drift` on previously verified criteria when gates fail
- zod schemas for every artifact (roadmap, state, config, evidence)

Most users want the CLI instead:

```bash
npx vibetracker init
```

Docs: <https://github.com/shantanugopale/vibetracker> · License: MIT
