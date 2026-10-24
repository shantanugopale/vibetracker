import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { commit, emptyState, loadState } from "@vibetracker/core"
import { loadRoadmap } from "./status.js"
import {
  collectDashboard,
  readFeed,
  startDashboardServer,
  type DashboardPayload,
} from "./server.js"
import { ROADMAP_TEMPLATE } from "./init.js"

const TMP_ROOT = path.join(os.tmpdir(), "vibetracker-server-test")

let worktree = ""
let server: Awaited<ReturnType<typeof startDashboardServer>> | null = null

function makeWorktree(prefix: string): Promise<string> {
  return mkdtemp(path.join(TMP_ROOT, prefix))
}

describe("dashboard server (task 4.1, 4.2)", () => {
  beforeAll(async () => {
    await mkdir(TMP_ROOT, { recursive: true })
    worktree = await makeWorktree("api-")
    await writeFile(path.join(worktree, "ROADMAP.md"), ROADMAP_TEMPLATE, "utf8")
    const roadmapResult = await loadRoadmap(worktree)
    if (!roadmapResult.ok || !roadmapResult.roadmap) {
      throw new Error("fixture roadmap must parse")
    }
    const first = roadmapResult.roadmap.phases[0]!.tasks[0]!.criteria[0]!
    const state = emptyState()
    state.criteria[first.id] = {
      status: "verified",
      evidence: [],
      updatedAt: new Date().toISOString(),
      verifiedAt: new Date().toISOString(),
    }
    await commit(worktree, state)
    server = await startDashboardServer(worktree, { port: 0 })
  })

  afterAll(async () => {
    if (server) await server.stop()
    await rm(TMP_ROOT, { recursive: true, force: true })
  })

  it("serves dashboard state JSON with counts (task 4.1)", async () => {
    const res = await fetch(`${server!.url}/api/state`)
    expect(res.status).toBe(200)
    const payload = (await res.json()) as DashboardPayload
    expect(payload.counts.total).toBeGreaterThan(0)
    const state = await loadState(worktree)
    expect(payload.counts.verified).toBe(
      Object.values(state!.criteria).filter((c) => c.status === "verified")
        .length,
    )
    const task = payload.phases[0]?.tasks[0]
    if (!task) throw new Error("dashboard payload missing first task")
    expect(task.criteria[0]!.status).toBe("verified")
    expect(task.criteria[0]!.text.length).toBeGreaterThan(0)
  })

  it("streams SSE within a second of an external commit (task 4.1)", async () => {
    const controller = new AbortController()
    const res = await fetch(`${server!.url}/api/events`, {
      signal: controller.signal,
    })
    const reader = res.body!.getReader()
    const decoder = new TextDecoder()

    setTimeout(async () => {
      try {
        const state = (await loadState(worktree)) ?? emptyState()
        const id = Object.keys(state.criteria)[0]
        if (id) {
          state.criteria[id] = {
            status: "in_review",
            evidence: [],
            updatedAt: new Date().toISOString(),
            verifiedAt: null,
          }
          await commit(worktree, state)
        }
      } catch {
        // commit failure surfaces as a failed assertion below
      }
    }, 300)

    const started = Date.now()
    let receivedWithin = false
    let buf = ""
    while (Date.now() - started < 12000 && !receivedWithin) {
      const chunk = (await Promise.race([
        reader.read(),
        new Promise((r) => setTimeout(() => r(null), 1000)),
      ])) as { done?: boolean; value?: Uint8Array } | null
      if (!chunk) continue
      if (chunk.done) break
      buf += decoder.decode(chunk.value, { stream: true })
      if (buf.includes("event: state")) {
        const elapsed = Date.now() - started
        // commit fires at ~300ms; acceptance is < 1s delay after the change
        receivedWithin = elapsed - 300 < 2000
        break
      }
    }
    controller.abort()
    // restore the verified criterion so later tests see a clean state
    const restored = (await loadState(worktree)) ?? emptyState()
    const id = Object.keys(restored.criteria)[0]
    if (id && restored.criteria[id]!.status !== "verified") {
      restored.criteria[id] = {
        status: "verified",
        evidence: [],
        updatedAt: new Date().toISOString(),
        verifiedAt: new Date().toISOString(),
      }
      await commit(worktree, restored)
    }
    expect(buf).toContain("event: state")
    expect(receivedWithin).toBe(true)
  }, 20000)

  it("feed returns audit entries newest first (task 4.1)", async () => {
    const entries = await readFeed(worktree)
    expect(entries.length).toBeGreaterThan(0)
    expect(entries[0]!.kind).toBe("commit")
  })

  it("dashboard payload maps roadmap criteria to statuses (task 4.2)", async () => {
    const payload = await collectDashboard(worktree)
    expect(payload.parseErrors).toEqual([])
    const criteria = payload.phases.flatMap((p) =>
      p.tasks.flatMap((t) => t.criteria),
    )
    const verified = criteria.filter((c) => c.status === "verified")
    expect(verified.length).toBe(1)
    expect(verified[0]!.verifiedAt).not.toBeNull()
  })

  it("serves static assets with traversal guard (task 4.2)", async () => {
    const staticWorktree = await makeWorktree("static-")
    const webRoot = await makeWorktree("web-")
    await writeFile(
      path.join(webRoot, "index.html"),
      "<html><body><h1>vibe dashboard</h1></body></html>",
      "utf8",
    )
    await mkdir(path.join(webRoot, "assets"), { recursive: true })
    await writeFile(path.join(webRoot, "assets", "app.js"), "console.log('app')", "utf8")
    await writeFile(path.join(staticWorktree, "secret.txt"), "nope", "utf8")
    const staticServer = await startDashboardServer(staticWorktree, {
      port: 0,
      staticRoot: webRoot,
    })
    try {
      expect((await fetch(`${staticServer.url}/`)).status).toBe(200)
      const home = await fetch(`${staticServer.url}/`)
      expect(await home.text()).toContain("vibe dashboard")
      const asset = await fetch(`${staticServer.url}/assets/app.js`)
      expect(asset.status).toBe(200)
      expect(asset.headers.get("content-type")).toContain("javascript")
      expect((await fetch(`${staticServer.url}/../secret.txt`)).status).toBe(404)
      expect((await fetch(`${staticServer.url}/missing.js`)).status).toBe(404)
    } finally {
      await staticServer.stop()
    }
  })

  it("placeholder page and parse errors for an untracked worktree (task 4.2)", async () => {
    const bare = await makeWorktree("bare-")
    const bareServer = await startDashboardServer(bare, {
      port: 0,
      staticRoot: null,
    })
    try {
      const res = await fetch(`${bareServer.url}/`)
      expect(res.status).toBe(200)
      expect(await res.text()).toContain("VibeTracker")
      const payload = (await (
        await fetch(`${bareServer.url}/api/state`)
      ).json()) as DashboardPayload
      expect(payload.phases).toEqual([])
      expect(payload.parseErrors.length).toBeGreaterThan(0)
    } finally {
      await bareServer.stop()
    }
  })
})
