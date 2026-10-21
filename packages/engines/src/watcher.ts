import { runGit } from "./git.js"

export type WatchOptions = {
  intervalMs?: number
  signal?: AbortSignal
}

export async function resolveHead(worktree: string): Promise<string | null> {
  const result = await runGit(worktree, ["rev-parse", "HEAD"])
  if (result.code !== 0) return null
  const head = result.stdout.trim()
  return head ? head : null
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer)
        resolve()
      },
      { once: true },
    )
  })
}

export async function* watchCommits(
  worktree: string,
  { intervalMs = 2000, signal }: WatchOptions = {},
): AsyncGenerator<string> {
  let last: string | null = null
  let first = true
  while (!signal?.aborted) {
    const head = await resolveHead(worktree)
    if (head && (first || head !== last)) {
      last = head
      first = false
      yield head
    }
    await sleep(intervalMs, signal)
  }
}
