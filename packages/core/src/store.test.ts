import { mkdtemp, open, mkdir, readdir, readFile, rm, utimes, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { LockError, StateCorruptionError, commit, emptyState, loadState, recoverState, saveState } from "./store.js"

let worktree: string

beforeEach(async () => {
  worktree = await mkdtemp(path.join(tmpdir(), "vibetracker-store-"))
})

afterEach(async () => {
  await rm(worktree, { recursive: true, force: true })
})

function stateWith(criteria: Record<string, { status: string }>): {
  schemaVersion: number
  updatedAt: string
  criteria: Record<string, unknown>
} {
  return {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    criteria: Object.fromEntries(
      Object.entries(criteria).map(([id, v]) => [
        id,
        { ...v, updatedAt: new Date().toISOString(), evidence: [], verifiedAt: null },
      ]),
    ),
  }
}

describe("atomic state store (task 1.4)", () => {
  it("round-trips state through an atomic write and load", async () => {
    const state = stateWith({ "t1.1:c1": { status: "verified" } }) as never
    await saveState(worktree, state)
    const loaded = await loadState(worktree)
    expect(loaded?.schemaVersion).toBe(1)
    expect(loaded?.criteria["t1.1:c1"]?.status).toBe("verified")
  })

  it("returns null when no state file exists yet", async () => {
    expect(await loadState(worktree)).toBeNull()
  })

  it("writes an audit entry with snapshot before the state file (S-10)", async () => {
    const state = stateWith({ "t1.1:c1": { status: "in_review" } }) as never
    const { ref } = await commit(worktree, state)
    expect(ref).toContain("audit")
    const raw = await readAuditRecursively()
    expect(raw).toContain('"kind":"commit"')
    expect(raw).toContain('"snapshot"')
  })

  it("serializes sequential writers; last write wins", async () => {
    const first = stateWith({ "t1.1:c1": { status: "in_review" } }) as never
    const second = stateWith({ "t1.1:c1": { status: "verified" } }) as never
    await saveState(worktree, first)
    await saveState(worktree, second)
    const loaded = await loadState(worktree)
    expect(loaded?.criteria["t1.1:c1"]?.status).toBe("verified")
  })

  it("recovers state from the audit log after corruption", async () => {
    const first = stateWith({ "t1.1:c1": { status: "in_review" } }) as never
    await commit(worktree, first)
    const second = stateWith({
      "t1.1:c1": { status: "verified" },
      "t1.2:c1": { status: "in_progress" },
    }) as never
    await commit(worktree, second)

    await writeFile(
      path.join(worktree, ".vibetracker", "state.json"),
      "{corrupted json",
      "utf8",
    )
    await expect(loadState(worktree)).rejects.toBeInstanceOf(StateCorruptionError)

    const recovered = await recoverState(worktree)
    expect(recovered?.criteria["t1.1:c1"]?.status).toBe("verified")
    expect(recovered?.criteria["t1.2:c1"]?.status).toBe("in_progress")
  })

  it("prevents a second writer while the lock is held (S-4)", async () => {
    await mkdir(path.join(worktree, ".vibetracker"), { recursive: true })
    const handle = await open(
      path.join(worktree, ".vibetracker", "state.lock"),
      "wx",
    )
    try {
      await expect(saveState(worktree, emptyState())).rejects.toBeInstanceOf(LockError)
    } finally {
      await handle.close()
    }
  })

  it("breaks a stale lock older than the staleness window (S-4)", async () => {
    await mkdir(path.join(worktree, ".vibetracker"), { recursive: true })
    const handle = await open(
      path.join(worktree, ".vibetracker", "state.lock"),
      "wx",
    )
    await handle.close()
    const old = new Date(Date.now() - 60_000)
    await utimes(path.join(worktree, ".vibetracker", "state.lock"), old, old)
    await expect(saveState(worktree, emptyState())).resolves.toBeUndefined()
  })
})

async function readAuditRecursively(): Promise<string> {
  const dir = path.join(worktree, ".vibetracker", "audit")
  const files = await readdir(dir)
  let out = ""
  for (const f of files) {
    out += await readFile(path.join(dir, f), "utf8")
  }
  return out
}
