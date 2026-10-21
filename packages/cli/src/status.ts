import { readFile } from "node:fs/promises"
import path from "node:path"
import { parseRoadmap, type Roadmap, type StateFile } from "@vibetracker/core"

export type StatusCounts = Record<string, number>

export function renderStatus(
  roadmap: Roadmap,
  state: StateFile | null,
): string[] {
  const lines: string[] = []
  let totalVerified = 0
  let totalCriteria = 0
  for (const phase of roadmap.phases) {
    let phaseVerified = 0
    let phaseCriteria = 0
    const taskLines: string[] = []
    for (const task of phase.tasks) {
      taskLines.push(
        `  Task ${task.id}: ${task.title}`,
      )
      for (const criterion of task.criteria) {
        const status = state?.criteria[criterion.id]?.status ?? "pending"
        if (status === "verified") phaseVerified += 1
        phaseCriteria += 1
        taskLines.push(`    [${status}] ${criterion.id} ${criterion.text}`)
      }
      taskLines[taskLines.length - 1] += ` (${task.criteria.filter((c) => (state?.criteria[c.id]?.status ?? "pending") === "verified").length}/${task.criteria.length})`
    }
    totalVerified += phaseVerified
    totalCriteria += phaseCriteria
    lines.push(
      `Phase ${phase.number}: ${phase.name} (${phaseVerified}/${phaseCriteria})`,
      ...taskLines,
    )
  }
  lines.push(`Total: ${totalVerified}/${totalCriteria} criteria verified`)
  return lines
}

export function statusCounts(
  roadmap: Roadmap,
  state: StateFile | null,
): StatusCounts {
  const counts: StatusCounts = {}
  for (const task of roadmap.phases.flatMap((p) => p.tasks)) {
    for (const criterion of task.criteria) {
      const status = state?.criteria[criterion.id]?.status ?? "pending"
      counts[status] = (counts[status] ?? 0) + 1
    }
  }
  return counts
}

export async function loadRoadmap(
  worktree: string,
): Promise<{ ok: boolean; roadmap: Roadmap | null; errors: string[] }> {
  let markdown: string
  try {
    markdown = await readFile(path.join(worktree, "ROADMAP.md"), "utf8")
  } catch {
    return {
      ok: false,
      roadmap: null,
      errors: ["ROADMAP.md not found - run `vibetracker init` first"],
    }
  }
  const parsed = parseRoadmap(markdown)
  if (!parsed.ok) {
    return {
      ok: false,
      roadmap: null,
      errors: parsed.errors.map(
        (e) => `${e.code} at line ${e.line}: ${e.message}`,
      ),
    }
  }
  return { ok: true, roadmap: parsed.roadmap, errors: [] }
}
