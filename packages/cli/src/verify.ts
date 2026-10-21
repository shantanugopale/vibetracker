import { runAudit } from "@vibetracker/engines"

export type VerifyReport = {
  ok: boolean
  message: string
}

export async function runAuditReported(
  worktree: string,
): Promise<VerifyReport> {
  try {
    const result = await runAudit(worktree)
    if (!result.ok) {
      const errors = result.parseErrors
        .map((e) => `${e.code} (line ${e.line}): ${e.message}`)
        .join("\n")
      return { ok: false, message: errors }
    }
    const lines: string[] = []
    for (const outcome of result.outcomes) {
      lines.push(
        `[${outcome.gate}] ${outcome.passed ? "passed" : "FAILED"} (exit ${outcome.exitCode}) evidence: ${outcome.ref ?? "n/a"}`,
      )
    }
    for (const event of result.events) {
      lines.push(
        `${event.criterionId}: ${event.from} -> ${event.to}`,
      )
    }
    for (const rejected of result.rejected) {
      lines.push(
        `rejected ${rejected.criterionId} ${rejected.from} -> ${rejected.to}: ${rejected.reason}`,
      )
    }
    if (result.committed) {
      lines.push(`state saved (audit ref ${result.ref})`)
    } else {
      lines.push("nothing to update")
    }
    return { ok: true, message: lines.join("\n") }
  } catch (err) {
    return { ok: false, message: String((err as Error).message ?? err) }
  }
}
