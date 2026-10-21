import { readFile } from "node:fs/promises"
import path from "node:path"
import { z } from "zod"
import { GATE_TYPES } from "./domain.js"

export const GateCommandSchema = z.object({
  command: z.string().min(1),
  args: z.array(z.string()).default([]),
})

export type GateCommand = z.infer<typeof GateCommandSchema>

export const TrackerConfigSchema = z.object({
  schemaVersion: z.number().int().min(1),
  gates: z.strictObject({
    lint: GateCommandSchema.optional(),
    typecheck: GateCommandSchema.optional(),
    test: GateCommandSchema.optional(),
  }),
})

export type TrackerConfig = z.infer<typeof TrackerConfigSchema>

export class ConfigError extends Error {}

export function defaultTrackerConfig(): TrackerConfig {
  return { schemaVersion: 1, gates: {} }
}

export async function loadTrackerConfig(worktree: string): Promise<TrackerConfig> {
  const file = path.resolve(worktree, ".vibetracker", "config.json")
  let raw: string
  try {
    raw = await readFile(file, "utf8")
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === "ENOENT") return defaultTrackerConfig()
    throw new ConfigError("could not read .vibetracker/config.json")
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new ConfigError("config.json is not valid JSON")
  }
  const result = TrackerConfigSchema.safeParse(parsed)
  if (!result.success) {
    throw new ConfigError("config.json failed schema validation")
  }
  return result.data
}
