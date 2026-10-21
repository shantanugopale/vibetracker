import { readFile, readdir, stat } from "node:fs/promises"
import path from "node:path"
import { Hono } from "hono"
import { streamSSE } from "hono/streaming"
import { serve } from "@hono/node-server"
import { emptyState, loadState, type AuditEntry } from "@vibetracker/core"
import { loadRoadmap, type StatusCounts } from "./status.js"

export type PhaseView = {
  number: number
  name: string
  verified: number
  total: number
  tasks: TaskView[]
}

export type TaskView = {
  id: string
  title: string
  criteria: CriterionView[]
}

export type CriterionView = {
  id: string
  text: string
  status: string
  verifiedAt: string | null
}

export type DashboardPayload = {
  counts: StatusCounts
  updatedAt: string | null
  phases: PhaseView[]
  parseErrors: string[]
}

const STATUS_KEYS = [
  "pending",
  "in_progress",
  "in_review",
  "verified",
  "failed",
  "drift",
  "blocked",
]

export async function collectDashboard(worktree: string): Promise<DashboardPayload> {
  const roadmapResult = await loadRoadmap(worktree)
  if (!roadmapResult.ok || !roadmapResult.roadmap) {
    return {
      counts: defaultCounts(),
      updatedAt: null,
      phases: [],
      parseErrors: roadmapResult.errors,
    }
  }
  const state = (await loadState(worktree)) ?? emptyState()
  const counts: StatusCounts = {}
  for (const key of STATUS_KEYS) counts[key] = 0
  let total = 0
  const phases: PhaseView[] = []
  for (const phase of roadmapResult.roadmap.phases) {
    let verified = 0
    let totalForPhase = 0
    const tasks: TaskView[] = []
    for (const task of phase.tasks) {
      const criteria: CriterionView[] = task.criteria.map((c) => {
        const status = state.criteria[c.id]?.status ?? "pending"
        total += 1
        totalForPhase += 1
        counts[status] = (counts[status] ?? 0) + 1
        if (status === "verified") verified += 1
        return {
          id: c.id,
          text: c.text,
          status,
          verifiedAt: state.criteria[c.id]?.verifiedAt ?? null,
        }
      })
      tasks.push({ id: task.id, title: task.title, criteria })
    }
    phases.push({
      number: phase.number,
      name: phase.name,
      verified,
      total: totalForPhase,
      tasks,
    })
  }
  counts.total = total
  return { counts, updatedAt: state.updatedAt, phases, parseErrors: [] }
}

function defaultCounts(): StatusCounts {
  const counts: StatusCounts = { total: 0 }
  for (const key of STATUS_KEYS) counts[key] = 0
  return counts
}

export async function readFeed(worktree: string, limit = 20): Promise<AuditEntry[]> {
  const dir = path.join(worktree, ".vibetracker", "audit")
  let files: string[] = []
  try {
    files = (await readdir(dir)).filter((f) => f.endsWith(".jsonl")).sort()
  } catch {
    return []
  }
  const entries: AuditEntry[] = []
  for (let i = files.length - 1; i >= 0 && entries.length < limit; i--) {
    const name = files[i]
    if (!name) continue
    const raw = await readFile(path.join(dir, name), "utf8").catch(() => "")
    const lines = raw.split("\n").filter((l) => l.trim()).reverse()
    for (const line of lines) {
      if (entries.length >= limit) break
      try {
        entries.push(JSON.parse(line) as AuditEntry)
      } catch {
        continue
      }
    }
  }
  return entries
}

function stateMtime(worktree: string): Promise<number | null> {
  return stat(path.join(worktree, ".vibetracker", "state.json"))
    .then((info) => info.mtimeMs)
    .catch(() => null)
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".ico": "image/x-icon",
  ".map": "application/json",
}

const PLACEHOLDER_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><title>VibeTracker</title></head>
<body><h1>VibeTracker</h1><p>Dashboard assets are not built yet.</p>
<p>Run: npm run build -w @vibetracker/dashboard</p></body></html>`

export function createDashboardApp(
  worktree: string,
  opts: { staticRoot?: string | null } = {},
): Hono {
  const app = new Hono()
  const staticRoot = opts.staticRoot !== undefined ? opts.staticRoot : resolveStaticRoot()

  app.get("/api/state", async (c) => c.json(await collectDashboard(worktree)))
  app.get("/api/feed", async (c) => c.json(await readFeed(worktree)))
  app.get("/api/events", (c) =>
    streamSSE(c, async (stream) => {
      let last = await stateMtime(worktree)
      while (true) {
        try {
          await stream.sleep(300)
          const current = await stateMtime(worktree)
          if (current !== null && current !== last) {
            last = current
            await stream.writeSSE({ data: "state", event: "state" })
          }
        } catch {
          break
        }
      }
    }),
  )
  app.get("*", async (c) => {
    const rel = c.req.path === "/" ? "index.html" : c.req.path.slice(1)
    if (rel.includes("..") || path.isAbsolute(rel)) {
      return c.text("not found", 404)
    }
    if (!staticRoot) {
      return c.body(PLACEHOLDER_HTML, 200, {
        "content-type": MIME[".html"] ?? "text/html",
      })
    }
    const abs = path.resolve(staticRoot, rel)
    if (!abs.startsWith(staticRoot + path.sep) && abs !== staticRoot) {
      return c.text("not found", 404)
    }
    const contents = await readFile(abs, "utf8").catch(() => null)
    if (contents === null) return c.text("not found", 404)
    const ext = path.extname(abs).toLowerCase()
    return c.body(contents, 200, {
      "content-type": MIME[ext] ?? "application/octet-stream",
    })
  })
  return app
}

function resolveStaticRoot(): string | null {
  const fromEnv = process.env.VT_WEB_ROOT
  if (fromEnv) return path.resolve(fromEnv)
  return path.resolve(import.meta.dirname ?? ".", "web")
}

export type DashboardServer = {
  port: number
  url: string
  stop: () => Promise<void>
}

export async function startDashboardServer(
  worktree: string,
  opts: { port?: number; staticRoot?: string | null } = {},
): Promise<DashboardServer> {
  const app = createDashboardApp(worktree, opts)
  const server = serve({
    fetch: app.fetch,
    port: opts.port ?? 4321,
    hostname: "127.0.0.1",
  })
  await new Promise<void>((resolve) => server.once("listening", resolve))
  const address = server.address()
  const port = typeof address === "object" && address !== null ? address.port : 4321
  return {
    port,
    url: `http://127.0.0.1:${port}`,
    stop: () =>
      new Promise<void>((resolve) => server.close(() => resolve())),
  }
}
