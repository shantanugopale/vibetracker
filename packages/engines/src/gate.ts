import { spawn } from "node:child_process"
import { existsSync, statSync } from "node:fs"
import path from "node:path"
import { saveLog } from "@vibetracker/core"
import type { GateType } from "@vibetracker/core"

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

export function resolveExecutable(
  command: string,
  extraDirs: string[] = [],
): string {
  if (path.isAbsolute(command)) return command
  if (path.extname(command)) return command
  const exts =
    process.platform === "win32" ? [".cmd", ".exe", ".bat", ""] : [""]
  const pathEnv = process.env.PATH?.split(path.delimiter) ?? []
  for (const dir of [...extraDirs, ...pathEnv]) {
    for (const ext of exts) {
      const candidate = path.join(dir, command + ext)
      try {
        if (statSync(candidate).isFile()) return candidate
      } catch {
        if (existsSync(candidate)) continue
      }
    }
  }
  return command
}

function execArgv(
  file: string,
  args: string[],
  opts: { cwd: string; timeoutMs: number },
): Promise<{ exitCode: number; output: string }> {
  return new Promise((resolve) => {
    const child = spawn(file, args, {
      cwd: opts.cwd,
      shell: false,
      windowsHide: true,
    })
    let output = ""
    child.stdout?.on("data", (chunk) => {
      output += chunk.toString()
    })
    child.stderr?.on("data", (chunk) => {
      output += chunk.toString()
    })
    const timer = setTimeout(() => {
      child.kill()
    }, opts.timeoutMs)
    child.on("error", (err) => {
      clearTimeout(timer)
      resolve({ exitCode: -1, output: `${output}\n[spawn error] ${err.message}\n` })
    })
    child.on("close", (code) => {
      clearTimeout(timer)
      resolve({ exitCode: code ?? -1, output })
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
  const timeoutMs = spec.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const { exitCode, output } = await execArgv(file, spec.args, {
    cwd: worktree,
    timeoutMs,
  })
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
