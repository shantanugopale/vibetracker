import type { Criterion, Phase, Roadmap, Task } from "./domain.js"

export type ParseError = {
  line: number
  code: string
  message: string
}

export type ParseResult =
  | { ok: true; roadmap: Roadmap }
  | { ok: false; errors: ParseError[] }

const PHASE_RE = /^##\s+Phase\s+(\d+)\s*:\s*(.+?)\s*$/
const TASK_RE = /^###\s+Task\s+(\d+)\.(\d+)\s*:\s*(.+?)\s*$/
const ACCEPTANCE_RE = /^-\s+Acceptance:\s*(.+?)\s*$/
const H1_RE = /^#\s+(.+?)\s*$/

export function parseRoadmap(markdown: string): ParseResult {
  const lines = markdown.split(/\r?\n/)
  const errors: ParseError[] = []
  let title: string | null = null
  let phase: Phase | null = null
  let task: Task | null = null
  const phases: Phase[] = []
  const seenTaskIds = new Set<string>()
  const seenPhaseNumbers = new Set<number>()
  const tasksWithoutCriteria: string[] = []

  lines.forEach((raw, index) => {
    const line = raw.trimEnd()
    const lineNo = index + 1
    if (!line.trim()) return

    const h1 = H1_RE.exec(line)
    if (h1 && !title && phases.length === 0) {
      title = h1[1] ?? null
      return
    }

    const phaseMatch = PHASE_RE.exec(line)
    if (phaseMatch) {
      const number = Number.parseInt(phaseMatch[1] ?? "0", 10)
      const name = (phaseMatch[2] ?? "").trim()
      if (seenPhaseNumbers.has(number)) {
        errors.push({
          line: lineNo,
          code: "DUPLICATE_PHASE_NUMBER",
          message: `phase ${number} is declared more than once`,
        })
      }
      seenPhaseNumbers.add(number)
      phase = { number, name, tasks: [] }
      phases.push(phase)
      return
    }

    const taskMatch = TASK_RE.exec(line)
    if (taskMatch) {
      const phaseNumber = Number.parseInt(taskMatch[1] ?? "0", 10)
      const taskNumber = Number.parseInt(taskMatch[2] ?? "0", 10)
      const taskTitle = (taskMatch[3] ?? "").trim()
      if (!phase) {
        errors.push({
          line: lineNo,
          code: "TASK_WITHOUT_PHASE",
          message: `task ${taskTitle} appears before any phase heading`,
        })
        return
      }
      if (phase.number !== phaseNumber) {
        errors.push({
          line: lineNo,
          code: "TASK_PHASE_MISMATCH",
          message: `task ${phaseNumber}.${taskNumber} does not match enclosing phase ${phase.number}`,
        })
        return
      }
      const id = `t${phaseNumber}.${taskNumber}`
      if (seenTaskIds.has(id)) {
        errors.push({
          line: lineNo,
          code: "DUPLICATE_TASK_ID",
          message: `task id ${id} is declared more than once`,
        })
        return
      }
      seenTaskIds.add(id)
      task = { id, title: taskTitle, criteria: [] }
      phase.tasks.push(task)
      tasksWithoutCriteria.push(id)
      return
    }

    const acceptanceMatch = ACCEPTANCE_RE.exec(line)
    if (acceptanceMatch) {
      const text = (acceptanceMatch[1] ?? "").trim()
      if (!task) {
        errors.push({
          line: lineNo,
          code: "ACCEPTANCE_WITHOUT_TASK",
          message: "acceptance criterion appears before any task heading",
        })
        return
      }
      if (!text) {
        errors.push({
          line: lineNo,
          code: "EMPTY_ACCEPTANCE",
          message: "acceptance criterion text is empty",
        })
        return
      }
      const criterion: Criterion = {
        id: `${task.id}:c${task.criteria.length + 1}`,
        text,
      }
      task.criteria.push(criterion)
      return
    }
  })

  for (const taskId of tasksWithoutCriteria) {
    if (taskId) {
      const owner = phases.flatMap((p) => p.tasks).find((t) => t.id === taskId)
      if (owner && owner.criteria.length === 0) {
        errors.push({
          line: 0,
          code: "TASK_WITHOUT_CRITERIA",
          message: `task ${taskId} has no acceptance criteria`,
        })
      }
    }
  }

  for (const p of phases) {
    if (p.tasks.length === 0) {
      errors.push({
        line: 0,
        code: "PHASE_WITHOUT_TASKS",
        message: `phase ${p.number} (${p.name}) has no tasks`,
      })
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors }
  }

  return {
    ok: true,
    roadmap: {
      title,
      phases: phases.map((p) => ({
        number: p.number,
        name: p.name,
        tasks: p.tasks.map((t) => ({ ...t, criteria: [...t.criteria] })),
      })),
    },
  }
}
