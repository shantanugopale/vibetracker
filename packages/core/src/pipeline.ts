import type { CriterionState, CriterionStatus, Evidence, StateFile } from "./domain.js"
import { transition } from "./stateMachine.js"

export type GateOutcome = {
  gate: string
  passed: boolean
  exitCode: number
  ref?: string
}

export type TransitionEvent = {
  criterionId: string
  from: CriterionStatus
  to: CriterionStatus
  at: string
}

export type RejectedTransition = {
  criterionId: string
  from: CriterionStatus
  to: CriterionStatus
  reason: string
}

export type EvaluateInput = {
  scope: string[]
  previous: StateFile
  outcomes: GateOutcome[]
  at: string
}

export type EvaluateResult = {
  state: StateFile
  events: TransitionEvent[]
  rejected: RejectedTransition[]
}

function evidenceFrom(outcomes: GateOutcome[]): Evidence[] {
  return outcomes.map((o) => ({
    type: "gate" as const,
    gate: o.gate,
    code: o.exitCode,
    ...(o.ref === undefined ? {} : { ref: o.ref }),
    selfClaimed: false,
  }))
}

export function evaluate(input: EvaluateInput): EvaluateResult {
  const { scope, previous, outcomes, at } = input
  const events: TransitionEvent[] = []
  const rejected: RejectedTransition[] = []
  const criteria: Record<string, CriterionState> = structuredClone(previous.criteria)
  const failing = outcomes.filter((o) => !o.passed)
  const hasOutcomes = outcomes.length > 0

  for (const id of scope) {
    const existing = criteria[id]
    const current: CriterionStatus = existing?.status ?? "pending"
    let next: CriterionStatus | null = null

    if (current === "in_review" && hasOutcomes) {
      next = failing.length > 0 ? "failed" : "verified"
    } else if (current === "verified" && failing.length > 0) {
      next = "drift"
    }

    if (!next) continue

    const evidence = (failing.length > 0 ? failing : outcomes).flatMap((o) =>
      evidenceFrom([o]),
    )
    const result = transition(current, next, evidence)
    if (!result.ok) {
      rejected.push({ criterionId: id, from: current, to: next, reason: result.reason })
      continue
    }
    criteria[id] = {
      status: next,
      evidence,
      updatedAt: at,
      verifiedAt: next === "verified" ? at : (existing?.verifiedAt ?? null),
    }
    events.push({ criterionId: id, from: current, to: next, at })
  }

  return {
    state: {
      schemaVersion: previous.schemaVersion,
      updatedAt: at,
      criteria,
    },
    events,
    rejected,
  }
}
