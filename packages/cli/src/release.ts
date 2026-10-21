import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { loadState } from "@vibetracker/core"
import { loadRoadmap, statusCounts } from "./status.js"

export type ReleaseReport = {
  generatedAt: string
  schemaVersion: number | null
  counts: Record<string, number>
  phases: { number: number; name: string; tasks: number; criteria: number }[]
}

export function buildReleaseReport(
  roadmap: NonNullable<Awaited<ReturnType<typeof loadRoadmap>>["roadmap"]>,
  state: Awaited<ReturnType<typeof loadState>>,
): ReleaseReport {
  return {
    generatedAt: new Date().toISOString(),
    schemaVersion: state?.schemaVersion ?? null,
    counts: statusCounts(roadmap, state),
    phases: roadmap.phases.map((phase) => ({
      number: phase.number,
      name: phase.name,
      tasks: phase.tasks.length,
      criteria: phase.tasks.reduce((sum, t) => sum + t.criteria.length, 0),
    })),
  }
}

export async function releaseProject(
  worktree: string,
): Promise<{ ok: boolean; message: string }> {
  const roadmapResult = await loadRoadmap(worktree)
  if (!roadmapResult.ok || !roadmapResult.roadmap) {
    return { ok: false, message: roadmapResult.errors.join("\n") }
  }
  const state = await loadState(worktree)
  const report = buildReleaseReport(roadmapResult.roadmap, state)
  const reportPath = path.join(worktree, ".vibetracker", "report.json")
  await mkdir(path.dirname(reportPath), { recursive: true })
  await writeFile(reportPath, JSON.stringify(report, null, 2), "utf8")
  return {
    ok: true,
    message: `release snapshot written to .vibetracker/report.json\n${JSON.stringify(report.counts)}`,
  }
}
