import { describe, expect, it } from "vitest"
import { CRITERION_STATUSES, SELF_CLAIM_CEILING, VERSION } from "./index.js"

describe("p0 scaffold", () => {
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
})
