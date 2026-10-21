import { mkdtemp, rm, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { runGate, resolveExecutable, BatchCommandError, type GateSpec } from "./gate.js"

let worktree: string

beforeEach(async () => {
  worktree = await mkdtemp(path.join(tmpdir(), "vibetracker-gates-"))
})

afterEach(async () => {
  await rm(worktree, { recursive: true, force: true })
})

function spec(
  type: GateSpec["type"],
  script: string,
  timeoutMs?: number,
): GateSpec {
  return {
    type,
    command: process.execPath,
    args: ["-e", script],
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
  }
}

describe("gate runner (task 2.1, 2.2)", () => {
  it("runs commands as argv arrays only (S-1)", async () => {
    const result = await runGate(
      worktree,
      spec("test", "console.log('marker-ok'); process.exit(0)"),
    )
    expect(result.passed).toBe(true)
    expect(result.exitCode).toBe(0)
    expect(result.output).toContain("marker-ok")
  })

  it("never shell-executes command strings with metacharacters (S-1)", async () => {
    const result = await runGate(worktree, {
      type: "test",
      command: "nonexistent-cmd && echo pwned",
      args: [],
      timeoutMs: 5000,
    })
    expect(result.passed).toBe(false)
    expect(result.output).toContain("[spawn error]")
    expect(result.output).toContain("ENOENT")
    const actuallyExecuted = result.output.split("[spawn error]")[0] ?? ""
    expect(actuallyExecuted).not.toContain("pwned")
  })

  it("refuses .cmd/.bat shim commands instead of raw EINVAL (S-1, batBadBut)", { skip: process.platform !== "win32" }, async () => {
    await expect(
      runGate(worktree, {
        type: "test",
        command: "npm",
        args: ["--version"],
        timeoutMs: 5000,
      }),
    ).rejects.toThrow(/\.cmd/)
    await expect(() =>
      runGate(worktree, {
        type: "test",
        command: "npm",
        args: ["--version"],
        timeoutMs: 5000,
      }),
    ).rejects.toBeInstanceOf(BatchCommandError)
  })

  it("reports failing gates with exit code evidence (task 2.2)", async () => {
    const result = await runGate(
      worktree,
      spec("test", "console.error('boom'); process.exit(1)"),
    )
    expect(result.passed).toBe(false)
    expect(result.exitCode).toBe(1)
    expect(result.output).toContain("boom")
  })

  it("persists captured output as a log reference (S-2 evidence, task 2.1)", async () => {
    const result = await runGate(
      worktree,
      spec("lint", "console.log('lint-marker')"),
    )
    expect(result.ref).toMatch(/logs[/\\/].+-lint\.log$/)
    const persisted = await readFile(
      path.join(worktree, result.ref.replace(/\//g, path.sep)),
      "utf8",
    )
    expect(persisted).toContain("lint-marker")
  })

  it("times out long-running gates as failures", async () => {
    const result = await runGate(
      worktree,
      spec("test", "setTimeout(() => {}, 10000)", 300),
    )
    expect(result.passed).toBe(false)
    expect(result.exitCode).toBe(-1)
  })

  it("resolves executables from local node_modules/.bin first", () => {
    const resolved = resolveExecutable("made-up-binary-xyz", [
      path.join(worktree, "node_modules", ".bin"),
    ])
    expect(resolved).toBe("made-up-binary-xyz")
  })

  it("resolves extensionless commands to platform executables", () => {
    const resolved = resolveExecutable(process.execPath, [])
    expect(resolved.toLowerCase()).toContain(
      process.platform === "win32" ? "node.exe" : "node",
    )
  })
})
