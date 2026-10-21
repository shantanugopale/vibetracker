import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { collectDashboard, type DashboardPayload } from "./server.js"

export type { DashboardPayload } from "./server.js"

export function badgeProgress(
  verified: number,
  total: number,
): { pct: number; label: string } {
  const pct =
    total <= 0 ? 0 : Math.min(100, Math.round((verified / total) * 100))
  return { pct, label: `${pct}%` }
}

export function badgeColor(pct: number): string {
  if (pct >= 90) return "#5ee08a"
  if (pct >= 50) return "#6fb3ff"
  if (pct >= 20) return "#ffc861"
  return "#ff7885"
}

export function renderBadgeSvg(verified: number, total: number): string {
  const left = "vibetracker"
  const { pct, label } = badgeProgress(verified, total)
  const color = badgeColor(pct)
  const leftWidth = Math.round(6.5 * left.length + 16)
  const rightText = pct === 100 ? `${label}` : `${label} verified`
  const rightWidth = Math.round(6.5 * rightText.length + 16)
  const width = leftWidth + rightWidth
  const height = 20
  const leftX = Math.round(leftWidth / 2)
  const rightX = leftWidth + Math.round(rightWidth / 2)
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" role="img" aria-label="vibetracker progress: ${pct}%">`,
    `  <title>vibetracker progress: ${pct}%</title>`,
    `  <clipPath id="r"><rect width="${width}" height="${height}" rx="3"/></clipPath>`,
    `  <g clip-path="url(#r)">`,
    `    <rect width="${leftWidth}" height="${height}" fill="#171a23"/>`,
    `    <rect x="${leftWidth}" width="${rightWidth}" height="${height}" fill="${color}"/>`,
    `  </g>`,
    `  <g fill="#ffffff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11" font-weight="600">`,
    `    <text x="${leftX}" y="14" fill="#e6e8ef">${left}</text>`,
    `    <text x="${rightX}" y="14" fill="#101319">${rightText}</text>`,
    `  </g>`,
    `</svg>`,
    ``,
  ].join("\n")
}

export async function exportBadge(
  worktree: string,
  outPath = path.join(worktree, ".vibetracker", "badge.svg"),
): Promise<{ ok: boolean; message: string }> {
  const payload = await collectDashboard(worktree)
  if (payload.phases.length === 0) {
    return { ok: false, message: payload.parseErrors.join("\n") }
  }
  const svg = renderBadgeSvg(payload.counts.verified ?? 0, payload.counts.total ?? 0)
  await mkdir(path.dirname(outPath), { recursive: true })
  await writeFile(outPath, svg, "utf8")
  return {
    ok: true,
    message: `badge written to ${path.relative(worktree, outPath)} (${badgeProgress(payload.counts.verified ?? 0, payload.counts.total ?? 0).label})`,
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

export function renderReportHtml(
  payload: DashboardPayload,
  generatedAt: string,
): string {
  const verified = payload.counts.verified ?? 0
  const total = payload.counts.total ?? 0
  const { pct } = badgeProgress(verified, total)
  const phaseSections = payload.phases
    .map((phase) => {
      const tasks = phase.tasks
        .map((task) => {
          const criteria = task.criteria
            .map(
              (c) =>
                `            <li><span class="badge ${c.status}">${c.status}</span> <span class="cid">${escapeHtml(c.id)}</span> ${escapeHtml(c.text)}</li>`,
            )
            .join("\n")
          return [
            `        <div class="task">`,
            `          <h3>Task ${escapeHtml(task.id)}: ${escapeHtml(task.title)}</h3>`,
            `          <ul>`,
            criteria,
            `          </ul>`,
            `        </div>`,
          ].join("\n")
        })
        .join("\n")
      return [
        `    <section class="card">`,
        `      <h2>Phase ${phase.number}: ${escapeHtml(phase.name)} <span class="score">${phase.verified}/${phase.total}</span></h2>`,
        tasks,
        `    </section>`,
      ].join("\n")
    })
    .join("\n")
  const errors =
    payload.parseErrors.length === 0
      ? ""
      : `    <section class="card">\n      <h2>ROADMAP parse errors</h2>\n      <ul class="errors">\n${payload.parseErrors
          .map((message) => `        <li>${escapeHtml(message)}</li>`)
          .join("\n")}\n      </ul>\n    </section>\n`
  return [
    `<!doctype html>`,
    `<html lang="en">`,
    `<head>`,
    `  <meta charset="utf-8">`,
    `  <meta name="viewport" content="width=device-width, initial-scale=1">`,
    `  <title>VibeTracker progress report</title>`,
    `  <style>`,
    `    body { margin:0; background:#0f1117; color:#e6e8ef; font-family:ui-monospace,'Cascadia Code',Consolas,monospace; }`,
    `    main { max-width:780px; margin:0 auto; padding:24px 16px 60px; }`,
    `    h1 { font-size:22px; letter-spacing:1px; }`,
    `    h2 { font-size:15px; margin:0 0 10px; }`,
    `    h3 { font-size:13px; color:#aeb4c4; margin:10px 0 4px; }`,
    `    .card { background:#171a23; border:1px solid #262b3a; border-radius:10px; padding:14px 16px; margin-bottom:14px; }`,
    `    ul { list-style:none; margin:0; padding:0; font-size:12px; }`,
    `    li { padding:3px 0; }`,
    `    .bar { height:10px; background:#262b3a; border-radius:5px; overflow:hidden; margin:10px 0; }`,
    `    .bar span { display:block; height:100%; background:#5ee08a; }`,
    `    .badge { display:inline-block; min-width:74px; text-align:center; border-radius:4px; font-size:10px; padding:1px 6px; background:#262b3a; color:#9aa1b2; }`,
    `    .badge.verified { background:#12351f; color:#5ee08a; }`,
    `    .badge.in_review { background:#14283f; color:#6fb3ff; }`,
    `    .badge.failed { background:#3b1518; color:#ff7885; }`,
    `    .badge.drift { background:#3b2c11; color:#ffc861; }`,
    `    .badge.blocked { background:#3b1113; color:#ff6b70; }`,
    `    .badge.in_progress { background:#243043; color:#93c7ff; }`,
    `    .cid { color:#7d8496; margin:0 6px; }`,
    `    .score { color:#7d8496; font-weight:normal; }`,
    `    .muted { color:#7d8496; font-size:11px; }`,
    `    .errors { color:#ff7885; }`,
    `  </style>`,
    `</head>`,
    `<body>`,
    `<main>`,
    `  <h1>VibeTracker</h1>`,
    `  <p>${verified}/${total} criteria verified &middot; ${pct}%</p>`,
    `  <div class="bar"><span style="width:${pct}%"></span></div>`,
    `  <p class="muted">generated ${escapeHtml(generatedAt)}</p>`,
    errors,
    phaseSections,
    `</main>`,
    `</body>`,
    `</html>`,
    ``,
  ]
    .filter((l) => l !== "")
    .join("\n")
}

export async function exportHtmlReport(
  worktree: string,
  outPath = path.join(worktree, ".vibetracker", "report.html"),
): Promise<{ ok: boolean; message: string }> {
  const payload = await collectDashboard(worktree)
  if (payload.phases.length === 0) {
    return { ok: false, message: payload.parseErrors.join("\n") }
  }
  const html = renderReportHtml(payload, new Date().toISOString())
  await mkdir(path.dirname(outPath), { recursive: true })
  await writeFile(outPath, html, "utf8")
  return {
    ok: true,
    message: `html report written to ${path.relative(worktree, outPath)}`,
  }
}
