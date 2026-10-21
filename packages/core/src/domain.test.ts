import { describe, expect, it } from "vitest"
import { SELF_CLAIM_CEILING, VERSION } from "./index.js"
import {
  CRITERION_STATUSES,
  CriterionStateSchema,
  EvidenceSchema,
  StateFileSchema,
} from "./domain.js"

describe("domain contracts (task 1.1)", () => {
  it("exposes a valid package version", () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it("defines the criterion status set", () => {
    expect(CRITERION_STATUSES).toContain("verified")
    expect(CRITERION_STATUSES).toContain("in_review")
    expect(CRITERION_STATUSES).toContain("drift")
  })

  it("caps self-claims below verified (S-9)", () => {
    expect(CRITERION_STATUSES.indexOf(SELF_CLAIM_CEILING)).toBeLessThan(
      CRITERION_STATUSES.indexOf("verified"),
    )
  })

  it("validates a minimal state file", () => {
    const state = StateFileSchema.parse({
      schemaVersion: 1,
      updatedAt: "2026-10-21T00:00:00.000Z",
      criteria: {
        "t1.1:c1": {
          status: "verified",
          updatedAt: "2026-10-21T00:00:00.000Z",
        },
      },
    })
    expect(state.criteria["t1.1:c1"]?.evidence).toEqual([])
    expect(state.criteria["t1.1:c1"]?.verifiedAt).toBeNull()
  })

  it("rejects an unknown criterion status", () => {
    const result = CriterionStateSchema.safeParse({
      status: "shipped",
      updatedAt: "2026-10-21T00:00:00.000Z",
    })
    expect(result.success).toBe(false)
  })

  it("defaults selfClaimed to false on evidence", () => {
    const evidence = EvidenceSchema.parse({ type: "gate", gate: "test", code: 0 })
    expect(evidence.selfClaimed).toBe(false)
  })

  it("rejects a state file with schemaVersion zero", () => {
    const result = StateFileSchema.safeParse({
      schemaVersion: 0,
      updatedAt: "2026-10-21T00:00:00.000Z",
      criteria: {},
    })
    expect(result.success).toBe(false)
  })
})
