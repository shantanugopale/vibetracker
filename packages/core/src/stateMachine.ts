import type { CriterionStatus, EvidenceInput } from "./domain.js"

export const SELF_CLAIM_CEILING: CriterionStatus = "in_review"

export const VERIFIED: CriterionStatus = "verified"

const ALLOWED: Record<CriterionStatus, readonly CriterionStatus[]> = {
  pending: ["in_progress", "blocked"],
  in_progress: ["in_review", "blocked", "failed"],
  in_review: ["verified", "failed", "in_progress", "blocked"],
  verified: ["drift", "blocked", "in_progress"],
  failed: ["in_progress", "blocked"],
  drift: ["in_progress", "verified", "blocked"],
  blocked: ["in_progress", "pending"],
}

export type TransitionResult =
  | { ok: true; status: CriterionStatus }
  | { ok: false; reason: string }

export function transition(
  current: CriterionStatus,
  next: CriterionStatus,
  evidence: EvidenceInput[] = [],
): TransitionResult {
  const allowed = ALLOWED[current]
  if (!allowed.includes(next)) {
    return {
      ok: false,
      reason: `transition ${current} -> ${next} is not allowed`,
    }
  }
  if (next === VERIFIED) {
    if (evidence.length === 0) {
      return { ok: false, reason: "verification requires evidence" }
    }
    const independent = evidence.some((e) => !e.selfClaimed)
    if (!independent) {
      return {
        ok: false,
        reason: "self-claimed evidence cannot verify a criterion (S-9)",
      }
    }
  }
  return { ok: true, status: next }
}

export function canTransition(
  current: CriterionStatus,
  next: CriterionStatus,
): boolean {
  return ALLOWED[current].includes(next)
}
