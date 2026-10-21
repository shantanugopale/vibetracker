import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { commit, emptyState, loadState } from "@vibetracker/core"
import { dispatch } from "./index.js"
import { ROADMAP_TEMPLATE } from "./init.js"
import {
  badgeColor,
  badgeProgress,
  renderBadgeSvg,
  renderReportHtml,
  type DashboardPayload,
} from "./badge.js"

const TMP_ROOT = path.join(os.tmpdir(), "vibetracker-export-test")
let worktree = ""

beforeAll(async () => {
  await rm(TMP_ROOT, { recursive: true, force: true })
  await mkdir(TMP_ROOT, { recursive: true })
  worktree = await mkdtemp(path.join(TMP_ROOT, "repo-"))
  await dispatch(["init", "--skip-hooks"], worktree)
})

afterAll(async () => {
  await rm(TMP_ROOT, { recursive: true, force: true })
})

const PAYLOAD = (
  counts: Record<string, number>,
): DashboardPayload => ({
  counts: { pending: 0, in_review: 2, verified: 1, failed: 0, drift: 0, blocked: 0, in_progress: 0, total: 3, ...counts },
  updatedAt: new Date().toISOString(),
  phases: [
    {
      number: 1,
      name: "Evil <name>",
      verified: 1,
      total: 1,
      tasks: [
        {
          id: "t1.1",
          title: "Hello <world> & friends",
          criteria: [
            {
              id: "t1.1:c1",
              text: 'criterion with <script>alert("x")</script>',
              status: "verified",
              verifiedAt: "2026-01-01T00:00:00.000Z",
            },
          ],
        },
      ],
    },
  ],
  parseErrors: [],
})

describe("SVG badge export (task 6.1)", () => {
  it("renders the correct percentage", () => {
    expect(badgeProgress(0, 2).label).toBe("0%")
    expect(badgeProgress(1, 2).label).toBe("50%")
    expect(badgeProgress(2, 2).label).toBe("100%")
    expect(badgeProgress(5, 0).label).toBe("0%")
  })

  it("colors the badge by progress thresholds", () => {
    expect(badgeColor(0)).toBe("#ff7885")
    expect(badgeColor(30)).toBe("#ffc861")
    expect(badgeColor(60)).toBe("#6fb3ff")
    expect(badgeColor(95)).toBe("#5ee08a")
  })

  it("renders a valid labelled SVG", () => {
    const svg = renderBadgeSvg(1, 2)
    expect(svg).toContain("<svg")
    expect(svg).toContain('aria-label="vibetracker progress: 50%"')
    expect(svg).toContain('fill="#6fb3ff"')
    expect(svg.trimEnd().endsWith("</svg>")).toBe(true)
  })

  it("export writes badge.svg matching tracked state", async () => {
    const parsed = await import("@vibetracker/core").then((core) =>
      core.parseRoadmap(ROADMAP_TEMPLATE),
    )
    if (!parsed.ok) throw new Error("template must parse")
    const id = parsed.roadmap.phases[0]!.tasks[0]!.criteria[0]!.id
    const state = emptyState()
    state.criteria[id] = {
      status: "verified",
      evidence: [{ type: "gate", gate: "test", code: 0, selfClaimed: false }],
      updatedAt: new Date().toISOString(),
      verifiedAt: new Date().toISOString(),
    }
    await commit(worktree, state)
    const exit = await dispatch(["export"], worktree)
    expect(exit).toBe(0)
    const badge = await readFile(path.join(worktree, ".vibetracker", "badge.svg"), "utf8")
    expect(badge).toContain('aria-label="vibetracker progress: 100%"')
    const stateReloaded = await loadState(worktree)
    expect(stateReloaded?.criteria[id]?.status).toBe("verified")
  })
})

describe("static HTML report (task 6.1)", () => {
  it("renders the full scoreboard with html escaped", () => {
    const html = renderReportHtml(PAYLOAD({}), new Date().toISOString())
    expect(html).toContain("<!doctype html>")
    expect(html).toContain("Phase 1: Evil &lt;name&gt;")
    expect(html).not.toContain("<script>alert")
    expect(html).not.toContain("Evil <name>")
    expect(html).toContain("t1.1:c1")
    expect(html).toContain('class="badge verified"')
    expect(html).toContain("1/3 criteria verified")
  })

  it("export writes report.html with the whole scoreboard", async () => {
    const exit = await dispatch(["export"], worktree)
    expect(exit).toBe(0)
    const html = await readFile(
      path.join(worktree, ".vibetracker", "report.html"),
      "utf8",
    )
    expect(html).toContain("<!doctype html>")
    expect(html).toContain("Phase 1:")
    expect(html).toContain("Task t1.1")
    expect(html).toContain("replace me with a checkable criterion")
  })
})
