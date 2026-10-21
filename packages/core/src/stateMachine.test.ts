import { describe, expect, it } from "vitest"
import { transition } from "./stateMachine.js"

describe("criterion state machine (task 1.3)", () => {
  it("allows the happy path pending -> in_progress -> in_review -> verified", () => {
    expect(transition("pending", "in_progress")).toEqual({
      ok: true,
      status: "in_progress",
    })
    expect(
      transition("in_progress", "in_review"),
    ).toEqual({ ok: true, status: "in_review" })
    expect(
      transition("in_review", "verified", [
        { type: "gate", gate: "test", code: 0, selfClaimed: false },
      ]),
    ).toEqual({ ok: true, status: "verified" })
  })

  it("rejects undefined transitions", () => {
    expect(transition("pending", "verified", [{ type: "gate", code: 0 }]).ok).toBe(false)
    expect(transition("pending", "drift").ok).toBe(false)
    expect(transition("drift", "pending").ok).toBe(false)
  })

  it("blocks verification without evidence", () => {
    const result = transition("in_review", "verified")
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toContain("evidence")
  })

  it("blocks verification from purely self-claimed evidence (S-9)", () => {
    const result = transition("in_review", "verified", [
      { type: "engine", selfClaimed: true },
    ])
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toContain("S-9")
  })

  it("verifies when at least one evidence item is independent", () => {
    const result = transition("in_review", "verified", [
      { type: "engine", selfClaimed: true },
      { type: "gate", gate: "test", code: 0, selfClaimed: false },
    ])
    expect(result.ok).toBe(true)
  })

  it("supports drift from verified and recovery back to verified", () => {
    expect(transition("verified", "drift")).toEqual({ ok: true, status: "drift" })
    expect(
      transition("drift", "verified", [{ type: "gate", gate: "test", code: 0 }]),
    ).toEqual({ ok: true, status: "verified" })
  })

  it("supports block and unblock flows", () => {
    expect(transition("in_progress", "blocked")).toEqual({
      ok: true,
      status: "blocked",
    })
    expect(transition("blocked", "pending")).toEqual({
      ok: true,
      status: "pending",
    })
  })

  it("supports failure and rework flows", () => {
    expect(
      transition("in_review", "failed", [{ type: "gate", gate: "test", code: 1 }]),
    ).toEqual({ ok: true, status: "failed" })
    expect(transition("failed", "in_progress")).toEqual({
      ok: true,
      status: "in_progress",
    })
  })
})
