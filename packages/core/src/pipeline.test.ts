import { describe, expect, it } from "vitest"
import { emptyState } from "./store.js"
import { evaluate, type GateOutcome } from "./pipeline.js"

function outcome(gate: string, passed: boolean, exitCode = 0): GateOutcome {
  return { gate, passed, exitCode, ref: `audit/log-${gate}` }
}

const AT = "2026-10-21T12:00:00.000Z"

describe("verdict pipeline (tasks 2.2, 2.3)", () => {
  it("moves in_review criteria to verified when all gates pass", () => {
    const previous = emptyState()
    previous.criteria["t1.1:c1"] = {
      status: "in_review",
      evidence: [],
      updatedAt: AT,
      verifiedAt: null,
    }
    const result = evaluate({
      scope: ["t1.1:c1"],
      previous,
      outcomes: [outcome("lint", true), outcome("test", true)],
      at: AT,
    })
    const criterion = result.state.criteria["t1.1:c1"]
    expect(criterion?.status).toBe("verified")
    expect(criterion?.verifiedAt).toBe(AT)
    expect(criterion?.evidence.some((e) => !e.selfClaimed)).toBe(true)
    expect(criterion?.evidence.every((e) => e.type === "gate")).toBe(true)
  })

  it("blocks verification when a gate fails and records failing evidence", () => {
    const previous = emptyState()
    previous.criteria["t1.1:c1"] = {
      status: "in_review",
      evidence: [],
      updatedAt: AT,
      verifiedAt: null,
    }
    const result = evaluate({
      scope: ["t1.1:c1"],
      previous,
      outcomes: [outcome("lint", true), outcome("test", false, 1)],
      at: AT,
    })
    const criterion = result.state.criteria["t1.1:c1"]
    expect(criterion?.status).toBe("failed")
    expect(criterion?.evidence).toHaveLength(1)
    expect(criterion?.evidence[0]?.gate).toBe("test")
    expect(criterion?.evidence[0]?.code).toBe(1)
    expect(criterion?.evidence[0]?.ref).toBe("audit/log-test")
  })

  it("flags drift on previously verified criteria after gate failure (task 2.3)", () => {
    const previous = emptyState()
    previous.criteria["t1.1:c1"] = {
      status: "verified",
      evidence: [],
      updatedAt: AT,
      verifiedAt: AT,
    }
    const result = evaluate({
      scope: ["t1.1:c1"],
      previous,
      outcomes: [outcome("test", false, 2)],
      at: AT,
    })
    expect(result.state.criteria["t1.1:c1"]?.status).toBe("drift")
    expect(result.state.criteria["t1.1:c1"]?.verifiedAt).toBe(AT)
  })

  it("leaves pending and in_progress criteria untouched", () => {
    const previous = emptyState()
    previous.criteria["t1.1:c1"] = {
      status: "pending",
      evidence: [],
      updatedAt: AT,
      verifiedAt: null,
    }
    previous.criteria["t1.2:c1"] = {
      status: "in_progress",
      evidence: [],
      updatedAt: AT,
      verifiedAt: null,
    }
    const result = evaluate({
      scope: ["t1.1:c1", "t1.2:c1"],
      previous,
      outcomes: [outcome("test", true)],
      at: AT,
    })
    expect(result.state.criteria["t1.1:c1"]?.status).toBe("pending")
    expect(result.state.criteria["t1.2:c1"]?.status).toBe("in_progress")
    expect(result.events).toHaveLength(0)
  })

  it("emits exactly one event per actual state transition (task 2.3)", () => {
    const previous = emptyState()
    previous.criteria["t1.1:c1"] = {
      status: "in_review",
      evidence: [],
      updatedAt: AT,
      verifiedAt: null,
    }
    previous.criteria["t1.2:c1"] = {
      status: "verified",
      evidence: [],
      updatedAt: AT,
      verifiedAt: AT,
    }
    const result = evaluate({
      scope: ["t1.1:c1", "t1.2:c1"],
      previous,
      outcomes: [outcome("test", false, 1)],
      at: AT,
    })
    expect(result.events).toHaveLength(2)
    const t11 = result.events.find((e) => e.criterionId === "t1.1:c1")
    const t12 = result.events.find((e) => e.criterionId === "t1.2:c1")
    expect(t11).toMatchObject({ from: "in_review", to: "failed", at: AT })
    expect(t12).toMatchObject({ from: "verified", to: "drift", at: AT })
  })

  it("performs no transitions when no gate outcomes exist", () => {
    const previous = emptyState()
    previous.criteria["t1.1:c1"] = {
      status: "in_review",
      evidence: [],
      updatedAt: AT,
      verifiedAt: null,
    }
    const result = evaluate({
      scope: ["t1.1:c1"],
      previous,
      outcomes: [],
      at: AT,
    })
    expect(result.state.criteria["t1.1:c1"]?.status).toBe("in_review")
    expect(result.events).toHaveLength(0)
  })

  it("records rejected transitions with reasons", () => {
    const previous = emptyState()
    previous.criteria["t1.1:c1"] = {
      status: "in_review",
      evidence: [],
      updatedAt: AT,
      verifiedAt: null,
    }
    const result = evaluate({
      scope: ["t1.1:c1"],
      previous,
      outcomes: [outcome("test", true)],
      at: AT,
    })
    expect(result.events).toHaveLength(1)
    expect(result.rejected).toHaveLength(0)
  })
})
