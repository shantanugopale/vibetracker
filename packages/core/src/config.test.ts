import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { ConfigError, loadTrackerConfig, saveLog } from "./index.js"

let worktree: string

beforeEach(async () => {
  worktree = await mkdtemp(path.join(tmpdir(), "vibetracker-config-"))
  await mkdir(path.join(worktree, ".vibetracker"), { recursive: true })
})

afterEach(async () => {
  await rm(worktree, { recursive: true, force: true })
})

describe("tracker config (task 2.1)", () => {
  it("returns defaults when no config file exists", async () => {
    const config = await loadTrackerConfig(worktree)
    expect(config.schemaVersion).toBe(1)
    expect(Object.keys(config.gates)).toHaveLength(0)
  })

  it("rejects malformed JSON (S-3)", async () => {
    await writeFile(
      path.join(worktree, ".vibetracker", "config.json"),
      "{broken",
      "utf8",
    )
    await expect(loadTrackerConfig(worktree)).rejects.toBeInstanceOf(ConfigError)
  })

  it("rejects unknown gate types, keeping the allowlist strict (S-2)", async () => {
    await writeFile(
      path.join(worktree, ".vibetracker", "config.json"),
      JSON.stringify({
        schemaVersion: 1,
        gates: {
          shell: { command: "powershell", args: ["-c", "evil"] },
        },
      }),
      "utf8",
    )
    await expect(loadTrackerConfig(worktree)).rejects.toBeInstanceOf(ConfigError)
  })

  it("accepts a valid config with allowlisted gates", async () => {
    await writeFile(
      path.join(worktree, ".vibetracker", "config.json"),
      JSON.stringify({
        schemaVersion: 1,
        gates: {
          test: { command: "npm", args: ["test"] },
        },
      }),
      "utf8",
    )
    const config = await loadTrackerConfig(worktree)
    expect(config.gates.test?.args).toEqual(["test"])
  })

  it("stores gate logs with flat safe refs (S-8)", async () => {
    const ref = await saveLog(worktree, "run-test.log", "all green")
    expect(ref).toMatch(/\.vibetracker\/logs\/run-test\.log$/)
    const content = await readFile(
      path.join(worktree, ".vibetracker", "logs", "run-test.log"),
      "utf8",
    )
    expect(content).toBe("all green")
  })

  it("sanitizes log names that attempt directory escape (S-8)", async () => {
    const ref = await saveLog(worktree, "..\\evil.txt", "payload")
    expect(ref).not.toContain("..")
    expect(ref).toMatch(/logs\\evil\.txt$|logs\/evil\.txt$/)
  })
})
