import { spawn } from "node:child_process"
import { statSync } from "node:fs"
import path from "node:path"
import { saveLog } from "@vibetracker/core"
import type { GateType } from "@vibetracker/core"

export class BatchCommandError extends Error {
  constructor(command: string) {
    super(
      `gate command resolves to a .cmd/.bat shim: ${command} — batch files cannot be spawned without a shell (S-1, batBadBut CVE-2024-27980). Invoke the underlying script with node directly, e.g. {"command":"node","args":["node_modules/vitest/vitest.mjs","run"]}`,
    )
    this.name = "BatchCommandError"
  }
}

export type GateSpec = {
  type: GateType
  command: string
  args: string[]
  timeoutMs?: number
}

export type GateRunResult = {
  gate: GateType
  passed: boolean
  exitCode: number
  ref: string
  output: string
}

const DEFAULT_TIMEOUT_MS = 120_000
const MAX_OUTPUT = 1_000_000

export function findExecutable(
  name: string,
  extraDirs: string[] = [],
): string | null {
  if (path.isAbsolute(name)) {
    try {
      return statSync(name).isFile() ? name : null
    } catch {
      return null
    }
  }
  const exts =
    process.platform === "win32" ? [".exe", ".cmd", ".bat"] : [""]
  const pathEnv = process.env.PATH?.split(path.delimiter) ?? []
  for (const dir of [...extraDirs, ...pathEnv]) {
    for (const ext of exts) {
      const candidate = path.join(dir, name + ext)
      try {
        if (statSync(candidate).isFile()) return candidate
      } catch {
        continue
      }
    }
  }
  return null
}

export function resolveExecutable(
  command: string,
  extraDirs: string[] = [],
): string {
  if (path.isAbsolute(command)) return command
  if (path.extname(command)) return command
  return findExecutable(command, extraDirs) ?? command
}

export function captureSpawn(
  file: string,
  args: string[],
  opts: { cwd: string; timeoutMs: number },
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(file, args, {
      cwd: opts.cwd,
      shell: false,
      windowsHide: true,
    })
    let stdout = ""
    let stderr = ""
    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString()
    })
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString()
    })
    const timer = setTimeout(() => {
      child.kill()
    }, opts.timeoutMs)
    child.on("error", (err) => {
      clearTimeout(timer)
      resolve({ exitCode: -1, stdout, stderr: `${stderr}\n[spawn error] ${err.message}\n` })
    })
    child.on("close", (code) => {
      clearTimeout(timer)
      resolve({ exitCode: code ?? -1, stdout, stderr })
    })
  })
}

export async function runGate(
  worktree: string,
  spec: GateSpec,
): Promise<GateRunResult> {
  const file = resolveExecutable(spec.command, [
    path.join(worktree, "node_modules", ".bin"),
  ])
  if (/\.(cmd|bat)$/i.test(file)) {
    throw new BatchCommandError(spec.command)
  }
  const timeoutMs = spec.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const { exitCode, stdout, stderr } = await captureSpawn(file, spec.args, {
    cwd: worktree,
    timeoutMs,
  })
  const output = stdout + stderr
  const truncated =
    output.length > MAX_OUTPUT
      ? `${output.slice(0, MAX_OUTPUT)}\n[truncated]\n`
      : output
  const stamp = new Date().toISOString().replace(/[:.]/g, "-")
  const ref = await saveLog(worktree, `${stamp}-${spec.type}.log`, truncated)
  return {
    gate: spec.type,
    passed: exitCode === 0,
    exitCode,
    ref,
    output: truncated,
  }
}
