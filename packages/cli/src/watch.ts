import { watchCommits } from "@vibetracker/engines"
import { runAuditReported } from "./verify.js"

let stopped = false

export function stopWatch(): void {
  stopped = true
}

export async function watchLoop(
  worktree: string,
  { intervalMs }: { intervalMs: number },
  onCommit: (head: string) => Promise<void>,
): Promise<number> {
  const controller = new AbortController()
  const signal = controller.signal
  for await (const head of watchCommits(worktree, {
    intervalMs,
    signal,
  })) {
    await onCommit(head)
    if (stopped) {
      controller.abort()
    }
  }
  return 0
}
