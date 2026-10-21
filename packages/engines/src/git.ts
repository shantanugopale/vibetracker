import path from "node:path"
import { captureSpawn, resolveExecutable } from "./gate.js"

export type GitResult = {
  code: number
  stdout: string
  stderr: string
}

export async function runGit(
  worktree: string,
  args: string[],
): Promise<GitResult> {
  const file = resolveExecutable("git")
  const { exitCode, stdout, stderr } = await captureSpawn(file, args, {
    cwd: worktree,
    timeoutMs: 30_000,
  })
  return { code: exitCode, stdout, stderr }
}
