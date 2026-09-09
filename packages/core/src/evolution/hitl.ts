/**
 * Human-in-the-loop (HITL) checkpoints.
 *
 * The self-evolution loop never mutates production rules or ground truth
 * automatically: every evolution action maps onto one of the six HITL checkpoints
 * (H1..H6) and must be explicitly approved there before it can take effect.
 *
 * This module is IO-free: it models the checkpoint vocabulary and the
 * pending → approved/rejected decision state machine as pure functions.
 */

/** One of the six HITL checkpoints from the technical plan (§9.2). */
export type HitlGate = 'H1' | 'H2' | 'H3' | 'H4' | 'H5' | 'H6';

/** Lifecycle of a single HITL decision. */
export type HitlStatus = 'pending' | 'approved' | 'rejected';

/**
 * The kind of evolution action that produced a proposal. The kind determines the
 * HITL checkpoint: cold-start rules need a human review (H1), entity mapping needs
 * confirmation (H2), ground truth needs annotation sign-off (H3), any later
 * evolution needs approval (H4), quarantined samples need arbitration (H5) and
 * score anomalies need re-inspection (H6).
 */
export type EvolutionActionKind =
  | 'cold-start-rule'
  | 'entity-normalization'
  | 'ground-truth'
  | 'rule-evolution'
  | 'gt-evolution'
  | 'quarantine-arbitration'
  | 'score-anomaly';

const ACTION_TO_GATE: Record<EvolutionActionKind, HitlGate> = {
  'cold-start-rule': 'H1',
  'entity-normalization': 'H2',
  'ground-truth': 'H3',
  'rule-evolution': 'H4',
  'gt-evolution': 'H4',
  'quarantine-arbitration': 'H5',
  'score-anomaly': 'H6',
};

/** Map an evolution action onto its mandatory HITL checkpoint. */
export function hitlGateFor(action: EvolutionActionKind): HitlGate {
  return ACTION_TO_GATE[action];
}

export interface HitlDecision {
  gate: HitlGate;
  status: HitlStatus;
  /** Optional reviewer note attached on approval or rejection. */
  note?: string;
}

/** A fresh decision awaiting review. */
export function pendingDecision(gate: HitlGate): HitlDecision {
  return { gate, status: 'pending' };
}

/** Approve a decision, optionally with a reviewer note. */
export function approve(decision: HitlDecision, note?: string): HitlDecision {
  return { gate: decision.gate, status: 'approved', ...(note !== undefined ? { note } : {}) };
}

/** Reject a decision, optionally with a reviewer note. */
export function reject(decision: HitlDecision, note?: string): HitlDecision {
  return { gate: decision.gate, status: 'rejected', ...(note !== undefined ? { note } : {}) };
}

/** True only for an explicitly approved decision. */
export function isApproved(decision: HitlDecision): boolean {
  return decision.status === 'approved';
}
