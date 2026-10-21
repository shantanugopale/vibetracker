import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { detectAgents, installShims, type DetectedAgent } from "./shims.js"

let worktree: string
let fakeBin: string
let originalPath: string | undefined

beforeEach(async () => {
  worktree = await mkdtemp(path.join(tmpdir(), "vibetracker-shims-"))
  fakeBin = await mkdtemp(path.join(tmpdir(), "vibetracker-fakebin-"))
  // both variants so the fixture works on Windows (.cmd) and POSIX (extensionless)
  await Promise.all([
    writeFile(path.join(fakeBin, "opencode.cmd"), "@echo off", "utf8"),
    writeFile(path.join(fakeBin, "opencode"), "#!/bin/sh\n", "utf8"),
    writeFile(path.join(fakeBin, "claude.cmd"), "@echo off", "utf8"),
    writeFile(path.join(fakeBin, "claude"), "#!/bin/sh\n", "utf8"),
  ])
  originalPath = process.env.PATH
  process.env.PATH = `${fakeBin}${path.delimiter}${originalPath ?? ""}`
})

afterEach(async () => {
  process.env.PATH = originalPath
  fakeBin = ""
  await rm(worktree, { recursive: true, force: true })
})

describe("agent shim generator (task 3.3)", () => {
  it("detects installed agent CLIs from PATH", () => {
    const detected = detectAgents()
    const found = detected.filter((a) => a.executable !== null)
    expect(found.map((a) => a.name)).toEqual(
      expect.arrayContaining(["opencode", "claude"]),
    )
    for (const agent of found) {
      expect(agent.executable?.startsWith(fakeBin)).toBe(true)
    }
  })

  it("writes only shims for detected agents", async () => {
    const written = await installShims(worktree, detectAgents())
    expect(written).toContain(".opencode/plugins/vibetracker.ts")
    expect(written).toContain(".opencode/agents/vibetracker-auditor.md")
    expect(written).toContain(".claude/settings.json")
    const plugin = await readFile(
      path.join(worktree, ".opencode", "plugins", "vibetracker.ts"),
      "utf8",
    )
    expect(plugin).toContain("session.idle")
  })

  it("generates the auditor agent read-only (S-6)", async () => {
    await installShims(worktree, detectAgents())
    const agent = await readFile(
      path.join(worktree, ".opencode", "agents", "vibetracker-auditor.md"),
      "utf8",
    )
    expect(agent).toContain("edit: deny")
    expect(agent).toContain('"*": deny')
  })

  it("merges the claude hook without clobbering existing settings", async () => {
    const claudeDir = path.join(worktree, ".claude")
    await mkdir(claudeDir, { recursive: true })
    await writeFile(
      path.join(claudeDir, "settings.json"),
      JSON.stringify({
        model: "sonnet",
        permission: { edit: "deny" },
        hooks: {
          Stop: [{ hooks: [{ type: "command", command: "echo prior" }] }],
        },
      }),
      "utf8",
    )
    await installShims(worktree, detectAgents())
    const settings = JSON.parse(
      await readFile(path.join(claudeDir, "settings.json"), "utf8"),
    ) as {
      model?: string
      hooks?: { Stop?: { hooks: { command: string }[] }[] }
    }
    expect(settings.model).toBe("sonnet")
    const commands = (settings.hooks?.Stop ?? []).flatMap((entry) =>
      entry.hooks.map((hook) => hook.command),
    )
    expect(commands).toContain("echo prior")
    expect(commands.some((command) => command.includes("verify-now"))).toBe(true)
  })

  it("is idempotent on the claude hook", async () => {
    await installShims(worktree, detectAgents())
    await installShims(worktree, detectAgents())
    const settings = JSON.parse(
      await readFile(
        path.join(worktree, ".claude", "settings.json"),
        "utf8",
      ),
    ) as { hooks: { Stop: unknown[] } }
    const hookEntries = settings.hooks.Stop.filter((entry) =>
      JSON.stringify(entry).includes("verify-now"),
    )
    expect(hookEntries).toHaveLength(1)
  })
})
