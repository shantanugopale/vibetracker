export const TOOL_NAMES = [
  "track_init",
  "track_status",
  "verify_now",
  "flag_blocked",
] as const

export type ToolName = (typeof TOOL_NAMES)[number]
