import { appendFile, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { runGit } from "./git.js"
import { resolveHead, watchCommits } from "./watcher.js"

let repo: string

beforeEach(async () => {
  repo = await mkdtemp(path.join(tmpdir(), "vibetracker-watch-"))
  await runGit(repo, ["init"])
  await runGit(repo, ["config", "user.email", "test@example.com"])
  await runGit(repo, ["config", "user.name", "test"])
  await writeFile(path.join(repo, "file.txt"), "one", "utf8")
  await runGit(repo, ["add", "."])
  await runGit(repo, ["commit", "-m", "initial"])
})

afterEach(async () => {
  await rm(repo, { recursive: true, force: true })
})

describe("git commit watcher (task 3.1)", () => {
  it("resolves HEAD of a repo with commits", async () => {
    const head = await resolveHead(repo)
    expect(head).toMatch(/^[0-9a-f]{40}$/)
  })

  it("returns null HEAD for a fresh repo without commits", async () => {
    const fresh = await mkdtemp(path.join(tmpdir(), "vibetracker-fresh-"))
    try {
      await runGit(fresh, ["init"])
      expect(await resolveHead(fresh)).toBeNull()
    } finally {
      await rm(fresh, { recursive: true, force: true })
    }
  })

  it("yields on start and on commits made by external tools (task 3.1)", async () => {
    const hashes: string[] = []
    const iterator = watchCommits(repo, { intervalMs: 50 })
    const timeout = setTimeout(() => {
      throw new Error("watcher test timed out")
    }, 15_000)
    try {
      for await (const head of iterator) {
        hashes.push(head)
        if (hashes.length === 1) {
          await endOfSecondCommit()
        }
        if (hashes.length === 2) break
      }
    } finally {
      clearTimeout(timeout)
    }
    expect(hashes[0]).toMatch(/^[0-9a-f]{40}$/)
    expect(hashes[1]).not.toBe(hashes[0])
  })

  it("does not yield for unchanged HEAD across polls", async () => {
    const controller = new AbortController()
    setTimeout(() => controller.abort(), 300)
    const seen: string[] = []
    const iterator = watchCommits(repo, {
      intervalMs: 50,
      signal: controller.signal,
    })
    for await (const head of iterator) {
      seen.push(head)
    }
    expect(seen).toHaveLength(1)
  })

  async function endOfSecondCommit(): Promise<void> {
    await appendFile(path.join(repo, "file.txt"), "\ntwo", "utf8")
    await runGit(repo, ["add", "."])
    const result = await runGit(repo, ["commit", "-m", "second"])
    expect(result.code).toBe(0)
  }
})
