export const GATE_TYPES = ["lint", "typecheck", "test"] as const

export type GateType = (typeof GATE_TYPES)[number]
