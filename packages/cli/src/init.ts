import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { defaultTrackerConfig } from "@vibetracker/core"
import { detectAgents, installShims } from "./shims.js"

export const ROADMAP_TEMPLATE = `# Project Roadmap

Describe the work in phases, tasks, and acceptance criteria.

## Phase 1: Foundation
### Task 1.1: First task
- Acceptance: replace me with a checkable criterion
`

export const CONFIG_TEMPLATE = JSON.stringify(
  {
    schemaVersion: 1,
    gates: {
      test: { command: "npm", args: ["test"] },
    },
  },
  null,
  2,
)

export type InitResult = {
  roadmapCreated: boolean
  configCreated: boolean
  agents: DetectedAgentName[]
  shims: string[]
}

export type DetectedAgentName = {
  name: string
  found: boolean
}

export function createConfigTemplate(): string {
  return CONFIG_TEMPLATE
}

export async function initProject(
  worktree: string,
  { withHooks }: { withHooks: boolean },
): Promise<InitResult> {
  let roadmapCreated = false
  let configCreated = false
  const roadmapFile = path.join(worktree, "ROADMAP.md")
  try {
    await readFile(roadmapFile, "utf8")
  } catch {
    await writeFile(roadmapFile, ROADMAP_TEMPLATE, "utf8")
    roadmapCreated = true
  }
  const configDir = path.join(worktree, ".vibetracker")
  const configFile = path.join(configDir, "config.json")
  try {
    await readFile(configFile, "utf8")
  } catch {
    await mkdir(configDir, { recursive: true })
    await writeFile(configFile, CONFIG_TEMPLATE, "utf8")
    configCreated = true
  }
  const detected = detectAgents()
  const agents = detected.map((a) => ({ name: a.name, found: a.executable !== null }))
  const shims = withHooks ? await installShims(worktree, detected) : []
  return { roadmapCreated, configCreated, agents, shims }
}
