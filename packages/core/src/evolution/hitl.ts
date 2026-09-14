/**
 * Human-in-the-loop (HITL) checkpoints.
 *
 * The self-evolution loop never mutates production rules or ground truth
 * automatically: every evolution action maps onto one of the six HITL checkpoints
 * (H1..H6) and must be explicitly approved there before it can take effect.
 *
 * This module owns the checkpoint *vocabulary* - the gates, the actions that
 * route to them, and the status a decision can hold. It deliberately does not own
 * the decision *machine*: `approve`/`reject`/`pendingDecision`/`isApproved` used
 * to live here over `HitlDecision`, duplicating what `proposal.ts` does over
 * `EvolutionProposal`.
 *
 * That duplicate was the same machine twice, and only the proposal copy carried
 * the guard that makes `pending -> approved/rejected` one-way. The gap survived
 * because nothing called the copy: its tests decided a `pending` decision, which
 * both machines do correctly, so they could not tell them apart - the difference
 * appears only on a *second* decision, which is precisely the case a review
 * record exists to protect.
 *
 * The copy was deleted rather than guarded. A second implementation of a guarded
 * rule is free to drift from the first, and only one of them can be the rule.
 * `proposal.ts` is the single `HitlStatus` state machine; this module supplies the
 * vocabulary it steps through.
 *
 * This module is IO-free.
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
