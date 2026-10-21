#!/usr/bin/env node
import { pathToFileURL } from "node:url"
import { parseArgs } from "node:util"
import { helpText } from "./help.js"
import { initProject } from "./init.js"
import { releaseProject } from "./release.js"
import { loadRoadmap, renderStatus } from "./status.js"
import { runAuditReported } from "./verify.js"
import { watchLoop } from "./watch.js"

export { loadRoadmap, renderStatus, statusCounts } from "./status.js"
export { initProject, ROADMAP_TEMPLATE } from "./init.js"
export { runAuditReported, type VerifyReport } from "./verify.js"

export async function dispatch(
  argv: string[],
  cwd = process.cwd(),
): Promise<number> {
  let parsed: ReturnType<typeof parseArgs>
  try {
    parsed = parseArgs({
      allowPositionals: true,
      args: argv,
      options: {
        quiet: { type: "boolean", default: false },
        interval: { type: "string", default: "2000" },
        "skip-hooks": { type: "boolean", default: false },
        port: { type: "string", default: "4321" },
        help: { type: "boolean", short: "h", default: false },
      },
    })
  } catch (err) {
    console.error(String((err as Error).message ?? err))
    console.log(helpText())
    return 1
  }
  const [command] = parsed.positionals
  switch (command) {
    case undefined:
    case "help":
    case "--help":
    case "-h":
      console.log(helpText())
      return 0
    case "init": {
      const result = await initProject(cwd, {
        withHooks: parsed.values["skip-hooks"] !== true,
      })
      console.log(
        [
          `${result.roadmapCreated ? "created" : "kept existing"} ROADMAP.md`,
          `${result.configCreated ? "created" : "kept existing"} .vibetracker/config.json`,
          result.agents
            .filter((a) => a.found)
            .map((a) => `agent detected: ${a.name}`),
          result.shims.map((s) => `shim written: ${s}`),
        ]
          .flat()
          .join("\n"),
      )
      return 0
    }
    case "status": {
      const roadmapResult = await loadRoadmap(cwd)
      if (!roadmapResult.ok || !roadmapResult.roadmap) {
        console.error(roadmapResult.errors.join("\n"))
        return 1
      }
      const { loadState } = await import("@vibetracker/core")
      const state = await loadState(cwd)
      console.log(renderStatus(roadmapResult.roadmap, state).join("\n"))
      return 0
    }
    case "verify-now": {
      const report = await runAuditReported(cwd)
      console.log(report.message)
      return report.ok ? 0 : 1
    }
    case "watch": {
      const intervalMs = Number(parsed.values.interval ?? 2000)
      if (!Number.isFinite(intervalMs) || intervalMs < 25) {
        console.error("--interval must be a number >= 25")
        return 1
      }
      console.log(`watching ${cwd} for commits (interval ${intervalMs}ms)`)
      return watchLoop(cwd, { intervalMs }, async (head) => {
        console.log(`commit ${head.slice(0, 12)}`)
        const report = await runAuditReported(cwd)
        console.log(report.message)
      })
    }
    case "release": {
      const result = await releaseProject(cwd)
      console.log(result.message)
      return result.ok ? 0 : 1
    }
    case "export": {
      const { exportBadge, exportHtmlReport } = await import("./badge.js")
      const badge = await exportBadge(cwd)
      if (!badge.ok) {
        console.error(badge.message)
        return 1
      }
      const html = await exportHtmlReport(cwd)
      if (!html.ok) {
        console.error(html.message)
        return 1
      }
      console.log(`${badge.message}\n${html.message}`)
      return 0
    }
    case "serve": {
      const port = Number(parsed.values.port ?? 4321)
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        console.error("--port must be an integer between 1 and 65535")
        return 1
      }
      const { startDashboardServer } = await import("./server.js")
      const server = await startDashboardServer(cwd, { port })
      console.log(`dashboard running at ${server.url}`)
      await new Promise(() => {})
      return 0
    }
    default:
      console.error(`unknown command: ${command}`)
      console.log(helpText())
      return 1
  }
}

const invoked = process.argv[1]
  ? pathToFileURL(process.argv[1]).href === import.meta.url
  : false

if (invoked) {
  dispatch(process.argv.slice(2), process.cwd())
    .then((code) => {
      if (code !== 0) process.exitCode = code
    })
    .catch((err) => {
      console.error(String((err as Error).message ?? err))
      process.exitCode = 1
    })
}
