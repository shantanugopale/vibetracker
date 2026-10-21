import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { spawn } from "node:child_process"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { emptyState, loadState, saveState } from "@vibetracker/core"
import { runGit } from "@vibetracker/engines"
import { dispatch } from "./index.js"
import { initProject } from "./init.js"
import { buildReleaseReport } from "./release.js"
import { loadRoadmap, renderStatus } from "./status.js"

let worktree: string

beforeEach(async () => {
  worktree = await mkdtemp(path.join(tmpdir(), "vibetracker-cli-"))
})

afterEach(async () => {
  await rm(worktree, { recursive: true, force: true })
})

describe("CLI commands (task 3.2)", () => {
  it("init scaffolds ROADMAP.md and .vibetracker config (task 3.2)", async () => {
    const result = await dispatch(["init", "--skip-hooks"], worktree)
    expect(result).toBe(0)
    const roadmap = await readFile(path.join(worktree, "ROADMAP.md"), "utf8")
    expect(roadmap).toContain("## Phase 1: Foundation")
    const config = await readFile(
      path.join(worktree, ".vibetracker", "config.json"),
      "utf8",
    )
    expect(JSON.parse(config)).toMatchObject({ schemaVersion: 1 })
    const second = await initProject(worktree, { withHooks: false })
    expect(second.roadmapCreated).toBe(false)
    expect(second.configCreated).toBe(false)
  })

  it("init parses its own template roadmap", async () => {
    await dispatch(["init", "--skip-hooks"], worktree)
    const roadmap = await loadRoadmap(worktree)
    expect(roadmap.ok).toBe(true)
  })

  it("status prints pending scoreboard for a fresh project", async () => {
    await dispatch(["init", "--skip-hooks"], worktree)
    const roadmap = await loadRoadmap(worktree)
    const lines = renderStatus(roadmap.roadmap!, null)
    expect(lines[0]).toContain("Phase 1: Foundation (0/1)")
    expect(lines.at(-1)).toContain("Total: 0/1")
  })

  it("verify-now runs configured gates and verifies in_review criteria", async () => {
    await dispatch(["init", "--skip-hooks"], worktree)
    await writeFile(
      path.join(worktree, ".vibetracker", "config.json"),
      JSON.stringify({
        schemaVersion: 1,
        gates: {
          test: {
            command: process.execPath,
            args: ["-e", "process.exit(0)"],
          },
        },
      }),
      "utf8",
    )
    const parsed = await loadRoadmap(worktree)
    if (!parsed.roadmap) throw new Error("init roadmap failed to parse")
    const criterionId =
      parsed.roadmap.phases
        .flatMap((p) => p.tasks.flatMap((t) => t.criteria))[0]?.id ?? ""
    expect(criterionId).not.toBe("")
    const state = emptyState()
    state.criteria[criterionId] = {
      status: "in_review",
      evidence: [],
      updatedAt: new Date().toISOString(),
      verifiedAt: null,
    }
    await saveState(worktree, state)

    const exit = await dispatch(["verify-now"], worktree)
    expect(exit).toBe(0)

    const updated = await loadState(worktree)
    expect(updated?.criteria[criterionId]?.status).toBe("verified")
    expect(updated?.criteria[criterionId]?.evidence.some((e) => !e.selfClaimed)).toBe(true)
  })

  it("release writes a snapshot report", async () => {
    await dispatch(["init", "--skip-hooks"], worktree)
    const result = await dispatch(["release"], worktree)
    expect(result).toBe(0)
    const report = JSON.parse(
      await readFile(
        path.join(worktree, ".vibetracker", "report.json"),
        "utf8",
      ),
    ) as { counts: Record<string, number> }
    expect(report.counts.pending).toBe(1)
  })

  it("reports parse errors and fails cleanly", async () => {
    await writeFile(path.join(worktree, "ROADMAP.md"), "## Phase 1: broken\n", "utf8")
    const result = await dispatch(["status"], worktree)
    expect(result).toBe(1)
  })

  it("rejects unknown commands with usage", async () => {
    const result = await dispatch(["nonsense"], worktree)
    expect(result).toBe(1)
  })

  it("renders a release report from roadmap and state", async () => {
    await dispatch(["init", "--skip-hooks"], worktree)
    const roadmap = await loadRoadmap(worktree)
    const report = buildReleaseReport(roadmap.roadmap!, null)
    expect(report.phases[0]?.criteria).toBe(1)
    expect(report.counts.pending).toBe(1)
  })
})

describe("CLI integration (task 3.2 PowerShell parity)", () => {
  it("runs from the built dist on this machine's shell", async () => {
    const cli = path.resolve(__dirname, "../dist/index.js")
    const child = spawn(process.execPath, [cli, "--help"], {
      timeout: 30_000,
    })
    const code = await new Promise<number>((resolve, reject) => {
      child.on("exit", (code) => resolve(code ?? -1))
      child.on("error", reject)
    })
    expect(code).toBe(0)
  }, 40_000)

  it("end-to-end: init, external commit, verify-now in a git repo", async () => {
    const repo = await mkdtemp(path.join(tmpdir(), "vibetracker-e2e-"))
    try {
      await runGit(repo, ["init"])
      await runGit(repo, ["config", "user.email", "test@example.com"])
      await runGit(repo, ["config", "user.name", "test"])
      await dispatch(["init", "--skip-hooks"], repo)
      await writeFile(
        path.join(repo, ".vibetracker", "config.json"),
        JSON.stringify({
          schemaVersion: 1,
          gates: {
            test: {
              command: process.execPath,
              args: ["-e", "process.exit(0)"],
            },
          },
        }),
        "utf8",
      )
      const parsed = await loadRoadmap(repo)
      if (!parsed.roadmap) throw new Error("init roadmap failed to parse")
      const criterionId =
        parsed.roadmap.phases
          .flatMap((p) => p.tasks.flatMap((t) => t.criteria))[0]?.id ?? ""
      expect(criterionId).not.toBe("")
      const clonedState = emptyState()
      clonedState.criteria[criterionId] = {
        status: "in_review",
        evidence: [],
        updatedAt: new Date().toISOString(),
        verifiedAt: null,
      }
      await saveState(repo, clonedState)
      await writeFile(path.join(repo, "app.js"), "console.log(1)", "utf8")
      await runGit(repo, ["add", "."])
      await runGit(repo, ["commit", "-m", "external tool commit"])
      const exit = await dispatch(["verify-now"], repo)
      expect(exit).toBe(0)
      const state = await loadState(repo)
      expect(state?.criteria[criterionId]?.status).toBe("verified")
    } finally {
      await rm(repo, { recursive: true, force: true })
    }
  }, 60_000)
})
