import { open, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises"
import path from "node:path"
import {
  SCHEMA_VERSION,
  StateFileSchema,
  type CriterionState,
  type StateFile,
} from "./domain.js"

export class LockError extends Error {}

export class StateCorruptionError extends Error {}

export type AuditEntry = {
  at: string
  kind: string
  snapshot?: {
    schemaVersion: number
    updatedAt: string
    criteria: Record<string, CriterionState>
  }
}

const DIR = ".vibetracker"
const STATE_FILE = "state.json"
const AUDIT_DIR = "audit"
const LOCK_FILE = "state.lock"
const STALE_LOCK_MS = 10_000
const RENAME_RETRIES = 5
const RENAME_DELAY_MS = 50

function resolveInside(worktree: string, ...parts: string[]): string {
  const root = path.resolve(worktree)
  const resolved = path.resolve(root, ...parts)
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error("resolved path escapes the worktree (S-8)")
  }
  return resolved
}

function statePath(worktree: string): string {
  return resolveInside(worktree, DIR, STATE_FILE)
}

function lockPath(worktree: string): string {
  return resolveInside(worktree, DIR, LOCK_FILE)
}

function auditPath(worktree: string, stamp: string): string {
  return resolveInside(worktree, DIR, AUDIT_DIR, `${stamp}.jsonl`)
}

async function acquireLock(worktree: string): Promise<void> {
  const lock = lockPath(worktree)
  await mkdir(path.dirname(lock), { recursive: true })
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const handle = await open(lock, "wx")
      await handle.writeFile(`${process.pid} ${new Date().toISOString()}`)
      await handle.close()
      return
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (code !== "EEXIST") throw err
      const info = await stat(lock).catch(() => null)
      const age = info ? Date.now() - info.mtimeMs : Number.POSITIVE_INFINITY
      if (age > STALE_LOCK_MS) {
        await rm(lock, { force: true })
        continue
      }
      throw new LockError("another vibetracker process holds the state lock")
    }
  }
  throw new LockError("could not acquire the state lock after stale release")
}

async function releaseLock(worktree: string): Promise<void> {
  await rm(lockPath(worktree), { force: true })
}

async function writeFileAtomic(target: string, contents: string): Promise<void> {
  const tmp = `${target}.tmp-${process.pid}-${Math.random().toString(36).slice(2)}`
  await writeFile(tmp, contents, "utf8")
  for (let attempt = 0; attempt < RENAME_RETRIES; attempt++) {
    try {
      await rename(tmp, target)
      return
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (code !== "EPERM" && code !== "EBUSY") throw err
      await new Promise((resolve) => setTimeout(resolve, RENAME_DELAY_MS))
    }
  }
  await rename(tmp, target)
}

export async function loadState(worktree: string): Promise<StateFile | null> {
  const file = statePath(worktree)
  let raw: string
  try {
    raw = await readFile(file, "utf8")
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === "ENOENT") return null
    throw err
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new StateCorruptionError("state.json is not valid JSON")
  }
  const result = StateFileSchema.safeParse(parsed)
  if (!result.success) {
    throw new StateCorruptionError("state.json failed schema validation")
  }
  return result.data
}

export async function saveState(
  worktree: string,
  state: StateFile,
): Promise<void> {
  const validated = StateFileSchema.parse(state)
  await acquireLock(worktree)
  try {
    await mkdir(path.dirname(statePath(worktree)), { recursive: true })
    await writeFileAtomic(statePath(worktree), JSON.stringify(validated, null, 2))
  } finally {
    await releaseLock(worktree)
  }
}

export async function appendAudit(
  worktree: string,
  entry: AuditEntry,
): Promise<string> {
  const stamp = entry.at.slice(0, 10)
  const file = auditPath(worktree, stamp)
  await mkdir(path.dirname(file), { recursive: true })
  const handle = await open(file, "a")
  try {
    await handle.write(`${JSON.stringify(entry)}\n`)
  } finally {
    await handle.close()
  }
  return path.relative(path.resolve(worktree), file).split(path.sep).join("/")
}

export async function commit(
  worktree: string,
  state: StateFile,
): Promise<{ ref: string }> {
  const validated = StateFileSchema.parse(state)
  await acquireLock(worktree)
  try {
    const ref = await appendAudit(worktree, {
      at: validated.updatedAt,
      kind: "commit",
      snapshot: {
        schemaVersion: validated.schemaVersion,
        updatedAt: validated.updatedAt,
        criteria: validated.criteria,
      },
    })
    await mkdir(path.dirname(statePath(worktree)), { recursive: true })
    await writeFileAtomic(statePath(worktree), JSON.stringify(validated, null, 2))
    return { ref }
  } finally {
    await releaseLock(worktree)
  }
}

export async function recoverState(worktree: string): Promise<StateFile | null> {
  const dir = resolveInside(worktree, DIR, AUDIT_DIR)
  let names: string[] = []
  try {
    names = (await readdirSorted(dir)).filter((n) => n.endsWith(".jsonl"))
  } catch {
    return null
  }
  for (let i = names.length - 1; i >= 0; i--) {
    const name = names[i]
    if (!name) continue
    const raw = await readFile(path.join(dir, name), "utf8").catch(() => "")
    const lines = raw.split("\n").filter((l) => l.trim())
    for (let j = lines.length - 1; j >= 0; j--) {
      const entry = safeParseAudit(lines[j] ?? "")
      if (!entry?.snapshot) continue
      return {
        schemaVersion: entry.snapshot.schemaVersion,
        updatedAt: entry.snapshot.updatedAt,
        criteria: entry.snapshot.criteria,
      }
    }
  }
  return null
}

function safeParseAudit(line: string): AuditEntry | null {
  try {
    return JSON.parse(line) as AuditEntry
  } catch {
    return null
  }
}

async function readdirSorted(dir: string): Promise<string[]> {
  const { readdir } = await import("node:fs/promises")
  return (await readdir(dir)).sort()
}

export function emptyState(): StateFile {
  return {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    criteria: {},
  }
}
