import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { commit, emptyState, loadState } from "@vibetracker/core"
import { createVibetrackerMcpServer, TOOL_NAMES } from "./index.js"
import { ROADMAP_TEMPLATE } from "@vibetracker/cli"

const TMP_ROOT = path.join(os.tmpdir(), "vibetracker-mcp-test")

async function makeWorktree(prefix: string): Promise<string> {
  worktrees.push(await mkdtemp(path.join(TMP_ROOT, prefix)))
  return worktrees[worktrees.length - 1]!
}

const worktrees: string[] = []

type TextResult = { content: Array<{ type: string; text: string }>; isError?: boolean }

describe("vibetracker MCP server (task 5.1)", () => {
  beforeAll(async () => {
    await mkdir(TMP_ROOT, { recursive: true })
  })

  it("registers exactly the four tracking tools", async () => {
    const server = createVibetrackerMcpServer()
    const client = new Client({ name: "test", version: "0.0.0" })
    const pair = InMemoryTransport.createLinkedPair()
    await Promise.all([server.connect(pair[0]), client.connect(pair[1])])
    const tools = await client.listTools()
    expect(tools.tools.map((t) => t.name).sort()).toEqual(
      [...TOOL_NAMES].sort(),
    )
    await Promise.all([client.close(), server.close()])
  })

  it("track_status renders the scoreboard (task 5.1)", async () => {
    const worktree = await makeWorktree("status-")
    await writeFile(path.join(worktree, "ROADMAP.md"), ROADMAP_TEMPLATE, "utf8")
    const server = createVibetrackerMcpServer(worktree)
    const client = new Client({ name: "test", version: "0.0.0" })
    const pair = InMemoryTransport.createLinkedPair()
    await Promise.all([server.connect(pair[0]), client.connect(pair[1])])
    const result = (await client.callTool({
      name: "track_status",
      arguments: {},
    })) as TextResult
    expect(result.isError).toBeFalsy()
    expect(result.content[0]!.text).toContain("Phase 1:")
    expect(result.content[0]!.text).toContain("[pending]")
    await Promise.all([client.close(), server.close()])
  })

  it("track_init scaffolds without hooks by default (task 5.1)", async () => {
    const worktree = await makeWorktree("init-")
    const server = createVibetrackerMcpServer(worktree)
    const client = new Client({ name: "test", version: "0.0.0" })
    const pair = InMemoryTransport.createLinkedPair()
    await Promise.all([server.connect(pair[0]), client.connect(pair[1])])
    const result = (await client.callTool({
      name: "track_init",
      arguments: {},
    })) as TextResult
    expect(result.isError).toBeFalsy()
    expect(result.content[0]!.text).toContain("created ROADMAP.md")
    expect(
      await readFile(path.join(worktree, "ROADMAP.md"), "utf8"),
    ).toContain("Project Roadmap")
    const settings = await readFile(
      path.join(worktree, ".claude", "settings.json"),
      "utf8",
    ).catch(() => null)
    expect(settings).toBeNull()
    await Promise.all([client.close(), server.close()])
  })

  it("verify_now runs gates and verifies in_review criteria (task 5.1)", async () => {
    const worktree = await makeWorktree("verify-")
    await writeFile(path.join(worktree, "ROADMAP.md"), ROADMAP_TEMPLATE, "utf8")
    await mkdir(path.join(worktree, ".vibetracker"), { recursive: true })
    await writeFile(
      path.join(worktree, ".vibetracker", "config.json"),
      JSON.stringify({
        schemaVersion: 1,
        gates: {
          test: {
            command: process.execPath,
            args: ["-e", "process.exit(0)"],
          },
        },
      }),
      "utf8",
    )
    const parsed = await import("@vibetracker/core").then((core) =>
      core.parseRoadmap(ROADMAP_TEMPLATE),
    )
    if (!parsed.ok) throw new Error("template roadmap must parse")
    const criterionId = parsed.roadmap.phases[0]!.tasks[0]!.criteria[0]!.id
    const state = emptyState()
    state.criteria[criterionId] = {
      status: "in_review",
      evidence: [],
      updatedAt: new Date().toISOString(),
      verifiedAt: null,
    }
    await commit(worktree, state)
    const server = createVibetrackerMcpServer(worktree)
    const client = new Client({ name: "test", version: "0.0.0" })
    const pair = InMemoryTransport.createLinkedPair()
    await Promise.all([server.connect(pair[0]), client.connect(pair[1])])
    const result = (await client.callTool({
      name: "verify_now",
      arguments: {},
    })) as TextResult
    expect(result.isError).toBeFalsy()
    expect(result.content[0]!.text).toContain("[test] passed")
    expect(result.content[0]!.text).toContain("in_review -> verified")
    const updated = await loadState(worktree)
    expect(updated?.criteria[criterionId]?.status).toBe("verified")
    await Promise.all([client.close(), server.close()])
  })

  it("flag_blocked marks a criterion blocked with the reason as evidence (task 5.1)", async () => {
    const worktree = await makeWorktree("blocked-")
    await writeFile(path.join(worktree, "ROADMAP.md"), ROADMAP_TEMPLATE, "utf8")
    const server = createVibetrackerMcpServer(worktree)
    const client = new Client({ name: "test", version: "0.0.0" })
    const pair = InMemoryTransport.createLinkedPair()
    await Promise.all([server.connect(pair[0]), client.connect(pair[1])])
    const result = (await client.callTool({
      name: "flag_blocked",
      arguments: { criterion_id: "t1.1:c1", reason: "waiting on API access" },
    })) as TextResult
    expect(result.isError).toBeFalsy()
    expect(result.content[0]!.text).toContain("-> blocked")
    expect(result.content[0]!.text).toContain("waiting on API access")
    const state = await loadState(worktree)
    expect(state?.criteria["t1.1:c1"]?.status).toBe("blocked")
    expect(
      state?.criteria["t1.1:c1"]?.evidence.some((e) =>
        e.ref?.includes("waiting on API access"),
      ),
    ).toBe(true)
    await Promise.all([client.close(), server.close()])
  })

  it("rejects unknown criterion ids and duplicate blocking (task 5.1)", async () => {
    const worktree = await makeWorktree("reject-")
    await writeFile(path.join(worktree, "ROADMAP.md"), ROADMAP_TEMPLATE, "utf8")
    const server = createVibetrackerMcpServer(worktree)
    const client = new Client({ name: "test", version: "0.0.0" })
    const pair = InMemoryTransport.createLinkedPair()
    await Promise.all([server.connect(pair[0]), client.connect(pair[1])])
    const unknown = (await client.callTool({
      name: "flag_blocked",
      arguments: { criterion_id: "nope", reason: "x" },
    })) as TextResult
    expect(unknown.isError).toBe(true)
    expect(unknown.content[0]!.text).toContain("unknown criterion nope")
    const first = await client.callTool({
      name: "flag_blocked",
      arguments: { criterion_id: "t1.1:c1", reason: "a" },
    })
    expect((first as TextResult).isError).toBeFalsy()
    const second = (await client.callTool({
      name: "flag_blocked",
      arguments: { criterion_id: "t1.1:c1", reason: "b" },
    })) as TextResult
    expect(second.isError).toBeFalsy()
    expect(second.content[0]!.text).toContain("already blocked")
    await Promise.all([client.close(), server.close()])
  })
})

afterAll(async () => {
  await rm(TMP_ROOT, { recursive: true, force: true })
})

