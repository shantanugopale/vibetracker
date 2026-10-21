import { readFile } from "node:fs/promises"
import path from "node:path"
import {
  commit,
  emptyState,
  evaluate,
  loadState,
  loadTrackerConfig,
  parseRoadmap,
  type GateOutcome,
  type GateType,
  type ParseError,
  type RejectedTransition,
  type TransitionEvent,
} from "@vibetracker/core"
import { runGate } from "./gate.js"

export type AuditRunResult = {
  ok: boolean
  parseErrors: ParseError[]
  outcomes: GateOutcome[]
  events: TransitionEvent[]
  rejected: RejectedTransition[]
  committed: boolean
  ref: string | null
}

function emptyResult(): AuditRunResult {
  return {
    ok: true,
    parseErrors: [],
    outcomes: [],
    events: [],
    rejected: [],
    committed: false,
    ref: null,
  }
}

export async function runAudit(worktree: string): Promise<AuditRunResult> {
  let markdown: string
  try {
    markdown = await readFile(path.join(worktree, "ROADMAP.md"), "utf8")
  } catch {
    return {
      ...emptyResult(),
      ok: false,
      parseErrors: [
        {
          line: 0,
          code: "MISSING_ROADMAP",
          message: "ROADMAP.md not found - run `vibetracker init` first",
        },
      ],
    }
  }
  const parsed = parseRoadmap(markdown)
  if (!parsed.ok) {
    return { ...emptyResult(), ok: false, parseErrors: parsed.errors }
  }
  const config = await loadTrackerConfig(worktree)
  const outcomes: GateOutcome[] = []
  for (const type of ["lint", "typecheck", "test"] as const) {
    const gate = config.gates[type]
    if (!gate) continue
    const run = await runGate(worktree, {
      type,
      command: gate.command,
      args: gate.args,
    })
    outcomes.push({
      gate: run.gate,
      passed: run.passed,
      exitCode: run.exitCode,
      ref: run.ref,
    })
  }
  const scope = parsed.roadmap.phases.flatMap((phase) =>
    phase.tasks.flatMap((task) => task.criteria.map((c) => c.id)),
  )
  const previous = (await loadState(worktree)) ?? emptyState()
  const at = new Date().toISOString()
  const result = evaluate({ scope, previous, outcomes, at })
  let committed = false
  let ref: string | null = null
  if (outcomes.length > 0 || result.events.length > 0) {
    const saved = await commit(worktree, result.state)
    committed = true
    ref = saved.ref
  }
  return {
    ok: true,
    parseErrors: [],
    outcomes,
    events: result.events,
    rejected: result.rejected,
    committed,
    ref,
  }
}
