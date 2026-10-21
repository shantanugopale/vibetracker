import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { findExecutable } from "@vibetracker/engines"

export type AgentName = "opencode" | "claude" | "codex" | "gemini"

export type DetectedAgent = {
  name: AgentName
  executable: string | null
}

const AGENT_NAMES: readonly AgentName[] = ["opencode", "claude", "codex", "gemini"]

export function detectAgents(): DetectedAgent[] {
  return AGENT_NAMES.map((name) => ({
    name,
    executable: findExecutable(name),
  }))
}

export const HOOK_COMMAND =
  "npx -y vibetracker verify-now --quiet || node .vibetracker/bin/vibetracker.js verify-now --quiet"

const OPENCODE_PLUGIN = `import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"

const CANDIDATES = [
  ".vibetracker/bin/vibetracker.js",
  "node_modules/@vibetracker/cli/dist/index.js",
]

export const VibeTrackerIdleAudit = async () => {
  return {
    event: async ({ event }: { event: { type: string } }) => {
      if (event.type !== "session.idle") return
      const local = CANDIDATES.find((candidate) => existsSync(candidate))
      try {
        if (local) {
          spawnSync(process.execPath, [local, "verify-now", "--quiet"], {
            stdio: "ignore",
          })
        }
      } catch {
      }
    },
  }
}
`

const AUDITOR_AGENT = `---
description: VibeTracker auditor - verifies commits against roadmap acceptance criteria
mode: subagent
permission:
  edit: deny
  bash:
    "*": deny
    "git diff*": allow
    "git log*": allow
---
You are the VibeTracker auditor. You inspect git diffs and the roadmap, and you
report verdicts with evidence. You never modify files and never run
state-changing commands.
`

export async function installShims(
  worktree: string,
  agents: DetectedAgent[],
): Promise<string[]> {
  const written: string[] = []
  for (const agent of agents) {
    if (!agent.executable) continue
    if (agent.name === "opencode") {
      written.push(...(await writeOpencodeShims(worktree)))
    } else if (agent.name === "claude") {
      written.push(...(await writeClaudeShim(worktree, HOOK_COMMAND)))
    }
  }
  return written
}

async function writeOpencodeShims(worktree: string): Promise<string[]> {
  const pluginDir = path.join(worktree, ".opencode", "plugins")
  const agentDir = path.join(worktree, ".opencode", "agents")
  await mkdir(pluginDir, { recursive: true })
  await mkdir(agentDir, { recursive: true })
  const pluginFile = path.join(pluginDir, "vibetracker.ts")
  const agentFile = path.join(agentDir, "vibetracker-auditor.md")
  await writeFile(pluginFile, OPENCODE_PLUGIN, "utf8")
  await writeFile(agentFile, AUDITOR_AGENT, "utf8")
  return [".opencode/plugins/vibetracker.ts", ".opencode/agents/vibetracker-auditor.md"]
}

async function writeClaudeShim(
  worktree: string,
  command: string,
): Promise<string[]> {
  const settingsPath = path.join(worktree, ".claude", "settings.json")
  let settings: Record<string, unknown> = {}
  try {
    const raw = await readFile(settingsPath, "utf8")
    const parsed: unknown = JSON.parse(raw)
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      settings = parsed as Record<string, unknown>
    }
  } catch {
    settings = {}
  }
  const hooks = { ...(settings.hooks as Record<string, unknown> | undefined) }
  const stop = Array.isArray(hooks.Stop) ? [...(hooks.Stop as unknown[])] : []
  const entry = { hooks: [{ type: "command", command }] }
  if (!stop.some((e) => JSON.stringify(e) === JSON.stringify(entry))) {
    stop.push(entry)
  }
  hooks.Stop = stop
  settings.hooks = hooks
  await mkdir(path.dirname(settingsPath), { recursive: true })
  await writeFile(settingsPath, JSON.stringify(settings, null, 2), "utf8")
  return [".claude/settings.json"]
}
