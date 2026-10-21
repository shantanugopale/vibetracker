import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { parseRoadmap } from "./parser.js"

const SAMPLE = `# Sample Roadmap

Some intro text.

## Phase 1: Foundations
### Task 1.1: First task
- Acceptance: thing A works
- Acceptance: thing B works
### Task 1.2: Second task
- Acceptance: thing C works

## Phase 2: Delivery
### Task 2.1: Ship it
- Acceptance: released
`

describe("roadmap parser (task 1.2)", () => {
  it("parses the grammar into the domain model", () => {
    const result = parseRoadmap(SAMPLE)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.roadmap.title).toBe("Sample Roadmap")
    expect(result.roadmap.phases).toHaveLength(2)
    const phase1 = result.roadmap.phases[0]
    expect(phase1?.tasks).toHaveLength(2)
    const task11 = phase1?.tasks.find((t) => t.id === "t1.1")
    expect(task11?.criteria.map((c) => c.id)).toEqual(["t1.1:c1", "t1.1:c2"])
    expect(task11?.criteria[0]?.text).toBe("thing A works")
  })

  it("rejects a task that appears before any phase", () => {
    const result = parseRoadmap(
      "### Task 1.1: Orphan\n- Acceptance: nothing\n",
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.some((e) => e.code === "TASK_WITHOUT_PHASE")).toBe(true)
  })

  it("rejects task numbering that mismatches the enclosing phase", () => {
    const result = parseRoadmap(
      "## Phase 1: One\n### Task 2.1: Wrong number\n- Acceptance: x\n",
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.some((e) => e.code === "TASK_PHASE_MISMATCH")).toBe(true)
  })

  it("rejects acceptance criteria outside any task", () => {
    const result = parseRoadmap(
      "## Phase 1: One\n- Acceptance: floating\n",
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.some((e) => e.code === "ACCEPTANCE_WITHOUT_TASK")).toBe(true)
  })

  it("rejects duplicate task ids", () => {
    const result = parseRoadmap(
      "## Phase 1: One\n### Task 1.1: A\n- Acceptance: x\n### Task 1.1: B\n- Acceptance: y\n",
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.some((e) => e.code === "DUPLICATE_TASK_ID")).toBe(true)
  })

  it("rejects tasks without acceptance criteria", () => {
    const result = parseRoadmap(
      "## Phase 1: One\n### Task 1.1: Nothing to verify\n",
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.some((e) => e.code === "TASK_WITHOUT_CRITERIA")).toBe(true)
  })

  it("rejects phases without tasks", () => {
    const result = parseRoadmap("## Phase 1: Empty shell\n")
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.some((e) => e.code === "PHASE_WITHOUT_TASKS")).toBe(true)
  })

  it("parses this repository's own ROADMAP.md as a golden file", () => {
    const markdown = readFileSync(
      new URL("../../../ROADMAP.md", import.meta.url),
      "utf8",
    )
    const result = parseRoadmap(markdown)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.roadmap.phases).toHaveLength(7)
    const totalTasks = result.roadmap.phases.reduce(
      (sum, p) => sum + p.tasks.length,
      0,
    )
    expect(totalTasks).toBe(19)
    const totalCriteria = result.roadmap.phases.flatMap((p) => p.tasks).reduce(
      (sum, t) => sum + t.criteria.length,
      0,
    )
    expect(totalCriteria).toBeGreaterThan(30)
  })
})
