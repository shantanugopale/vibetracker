import { z } from "zod"

export const SCHEMA_VERSION = 1

export const CRITERION_STATUSES = [
  "pending",
  "in_progress",
  "in_review",
  "verified",
  "failed",
  "drift",
  "blocked",
] as const

export type CriterionStatus = (typeof CRITERION_STATUSES)[number]

export const CriterionStatusSchema = z.enum(CRITERION_STATUSES)

export const GATE_TYPES = ["lint", "typecheck", "test"] as const

export type GateType = (typeof GATE_TYPES)[number]

export const EvidenceTypeSchema = z.enum(["gate", "engine", "manual"])

export type EvidenceType = z.infer<typeof EvidenceTypeSchema>

export const EvidenceSchema = z.object({
  type: EvidenceTypeSchema,
  gate: z.string().optional(),
  code: z.number().int().optional(),
  ref: z.string().optional(),
  selfClaimed: z.boolean().default(false),
})

export type Evidence = z.infer<typeof EvidenceSchema>

export type EvidenceInput = z.input<typeof EvidenceSchema>

export const CriterionStateSchema = z.object({
  status: CriterionStatusSchema,
  evidence: z.array(EvidenceSchema).default([]),
  updatedAt: z.string(),
  verifiedAt: z.string().nullable().default(null),
})

export type CriterionState = z.infer<typeof CriterionStateSchema>

export const StateFileSchema = z.object({
  schemaVersion: z.number().int().min(1),
  updatedAt: z.string(),
  criteria: z.record(z.string(), CriterionStateSchema),
})

export type StateFile = z.infer<typeof StateFileSchema>

export const CriterionSchema = z.object({
  id: z.string(),
  text: z.string(),
})

export type Criterion = z.infer<typeof CriterionSchema>

export const TaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  criteria: z.array(CriterionSchema).min(1),
})

export type Task = z.infer<typeof TaskSchema>

export const PhaseSchema = z.object({
  number: z.number().int(),
  name: z.string(),
  tasks: z.array(TaskSchema),
})

export type Phase = z.infer<typeof PhaseSchema>

export const RoadmapSchema = z.object({
  title: z.string().nullable(),
  phases: z.array(PhaseSchema),
})

export type Roadmap = z.infer<typeof RoadmapSchema>
