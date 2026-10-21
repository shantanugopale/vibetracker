#!/usr/bin/env node
import { pathToFileURL } from "node:url"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { z } from "zod"
import { commit, emptyState, loadState, canTransition } from "@vibetracker/core"
import {
  initProject,
  loadRoadmap,
  renderStatus,
  runAuditReported,
} from "@vibetracker/cli"
import { captureConsole } from "./capture.js"
import { TOOL_NAMES } from "./tools.js"

export { TOOL_NAMES } from "./tools.js"
export type { ToolName } from "./tools.js"

function text(content: string, isError = false) {
  return {
    content: [{ type: "text" as const, text: content }],
    isError,
  }
}

export function createVibetrackerMcpServer(cwd = process.cwd()): McpServer {
  const server = new McpServer({
    name: "vibetracker",
    version: "0.1.0",
  })

  server.registerTool(
    "track_init",
    {
      title: "Track init",
      description:
        "Scaffold ROADMAP.md and .vibetracker/config.json in the project root. Pass with_hooks=true to also install agent shims (opencode idle plugin, read-only auditor agent, claude stop hook).",
      inputSchema: { with_hooks: z.boolean().optional() },
      annotations: { openWorldHint: false },
    },
    async ({ with_hooks }) => {
      const captured = await captureConsole(() =>
        initProject(cwd, { withHooks: with_hooks === true }),
      )
      const result = captured.value
      const lines = [
        `${result.roadmapCreated ? "created" : "kept existing"} ROADMAP.md`,
        `${result.configCreated ? "created" : "kept existing"} .vibetracker/config.json`,
        ...result.agents
          .filter((a) => a.found)
          .map((a) => `agent detected: ${a.name}`),
        ...result.shims.map((s) => `shim written: ${s}`),
      ]
      if (captured.errors.length > 0) {
        lines.push(...captured.errors.map((e) => `warning: ${e}`))
      }
      return text(lines.join("\n"))
    },
  )

  server.registerTool(
    "track_status",
    {
      title: "Track status",
      description:
        "Show the roadmap scoreboard: every phase/task/criterion with its tracked status (pending, in_review, verified, failed, drift, blocked).",
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => {
      const roadmapResult = await loadRoadmap(cwd)
      if (!roadmapResult.ok || !roadmapResult.roadmap) {
        return text(roadmapResult.errors.join("\n"), true)
      }
      const state = await loadState(cwd)
      return text(renderStatus(roadmapResult.roadmap, state).join("\n"))
    },
  )

  server.registerTool(
    "verify_now",
    {
      title: "Verify now",
      description:
        "Run the configured quality gates (lint/typecheck/test) for the current worktree and update tracked criteria: in_review criteria with passing independent gate evidence become verified; failing gates mark failures/drift.",
      annotations: { openWorldHint: false },
    },
    async () => {
      const captured = await captureConsole(() => runAuditReported(cwd))
      const out = [
        ...captured.logs,
        captured.value.message,
        ...captured.errors.map((e) => `warning: ${e}`),
      ]
      return text(out.filter((l) => l.length > 0).join("\n"), !captured.value.ok)
    },
  )

  server.registerTool(
    "flag_blocked",
    {
      title: "Flag blocked",
      description:
        "Flag one tracked criterion as blocked (e.g. dependency missing, decisions needed). Provide the criterion id exactly as shown by track_status and a short reason that is stored as evidence.",
      inputSchema: {
        criterion_id: z
          .string()
          .describe("criterion id from track_status, e.g. t1.1:c1"),
        reason: z.string().min(1).describe("why this is blocked"),
      },
      annotations: { openWorldHint: false },
    },
    async ({ criterion_id, reason }) => {
      const roadmapResult = await loadRoadmap(cwd)
      if (!roadmapResult.ok || !roadmapResult.roadmap) {
        return text(roadmapResult.errors.join("\n"), true)
      }
      const known = roadmapResult.roadmap.phases
        .flatMap((p) => p.tasks.flatMap((t) => t.criteria))
      const criterion = known.find((c) => c.id === criterion_id)
      if (!criterion) {
        return text(
          `unknown criterion ${criterion_id}; known ids: ${known.map((c) => c.id).join(", ")}`,
          true,
        )
      }
      const state = (await loadState(cwd)) ?? emptyState()
      const previous = state.criteria[criterion_id]?.status ?? "pending"
      if (previous === "blocked") {
        return text(`criterion ${criterion_id} is already blocked`)
      }
      if (!canTransition(previous, "blocked")) {
        return text(
          `criterion ${criterion_id} cannot move ${previous} -> blocked`,
          true,
        )
      }
      state.criteria[criterion_id] = {
        status: "blocked",
        evidence: [
          ...(state.criteria[criterion_id]?.evidence ?? []),
          { type: "manual" as const, ref: `blocked: ${reason}`, selfClaimed: false },
        ],
        updatedAt: new Date().toISOString(),
        verifiedAt: state.criteria[criterion_id]?.verifiedAt ?? null,
      }
      await commit(cwd, state)
      return text(
        `criterion ${criterion_id}: ${previous} -> blocked (${reason})\nstate saved`,
      )
    },
  )

  return server
}

export async function runStdioServer(
  cwd = process.cwd(),
): Promise<void> {
  const server = createVibetrackerMcpServer(cwd)
  await server.connect(new StdioServerTransport())
}

const invoked = process.argv[1]
  ? pathToFileURL(process.argv[1]).href === import.meta.url
  : false

if (invoked) {
  runStdioServer().catch((err) => {
    console.error(String((err as Error).message ?? err))
    process.exitCode = 1
  })
}
