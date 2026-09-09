import type { QualityGateReport } from '../ir/types.js';
import type { ScoreReport } from '../score/score.js';
import type { TransformRule } from '../transform/strategies.js';
import { hitlGateFor, type EvolutionActionKind, type HitlGate, type HitlStatus } from './hitl.js';

/**
 * Self-evolution proposal core.
 *
 * The engine never mutates production rules or ground truth automatically. It
 * only *proposes* a change, requires an external regression anchor and an HITL
 * approval, and rolls back (marking affected cases stale) when the regression or
 * the review fails. The three non-negotiable red lines from the technical plan
 * (§9.3) are modelled here as pure, testable predicates:
 *   1. every change carries a diff-able base version and before/after rule pair;
 *   2. an unapproved proposal is never production-ready;
 *   3. a failed/rejected proposal marks its affected cases stale for re-run.
 */

/** Evolution layers. L4 (agent rewriting itself) is explicitly out of scope. */
export type EvolutionLayer = 'L1' | 'L2' | 'L3';

export type RuleChangeKind = 'add' | 'update' | 'remove';

export interface RuleChange {
  ruleId: string;
  kind: RuleChangeKind;
  /** Present for `update` and `remove`. */
  before?: TransformRule;
  /** Present for `add` and `update`. */
  after?: TransformRule;
}

export interface EvolutionTrigger {
  source: 'gate' | 'score';
  /** Violation codes that triggered the proposal (gate source). */
  violationCodes?: string[];
  /** Score delta vs baseline (score source). */
  scoreDelta?: number;
}

export interface RegressionResult {
  baselineScore: number;
  candidateScore: number;
  passed: boolean;
}

export interface EvolutionProposal {
  id: string;
  layer: EvolutionLayer;
  hitlGate: HitlGate;
  trigger: EvolutionTrigger;
  changes: RuleChange[];
  regression: RegressionResult;
  /** Git base the proposal was derived from (red line 1: diff-able, revertible). */
  baseVersion: string;
  status: HitlStatus;
  /** Optional reviewer note. */
  note?: string;
}

export interface BuildProposalInput {
  id: string;
  layer: EvolutionLayer;
  action: EvolutionActionKind;
  trigger: EvolutionTrigger;
  changes: RuleChange[];
  baselineScore: number;
  candidateScore: number;
  baseVersion: string;
}

/**
 * Derive a regression verdict from the external anchor scores. `passed` requires
 * the candidate to be no worse than the baseline - the engine may not degrade
 * production quality behind a "reasonable" excuse.
 */
export function computeRegression(baselineScore: number, candidateScore: number): RegressionResult {
  return { baselineScore, candidateScore, passed: candidateScore >= baselineScore };
}

/**
 * A change is structurally diff-able only when its before/after pair matches its
 * kind: `add` has only an after, `remove` has only a before, and `update` has
 * both pointing at the same rule id.
 */
export function isValidRuleChange(change: RuleChange): boolean {
  if (change.kind === 'add') {
    return change.before === undefined && change.after !== undefined;
  }
  if (change.kind === 'remove') {
    return change.before !== undefined && change.after === undefined;
  }
  // 'update'
  return change.before !== undefined && change.after !== undefined && change.before.id === change.after.id;
}

/** Assemble a pending proposal; its HITL gate is derived from the action kind. */
export function buildEvolutionProposal(input: BuildProposalInput): EvolutionProposal {
  return {
    id: input.id,
    layer: input.layer,
    hitlGate: hitlGateFor(input.action),
    trigger: input.trigger,
    changes: input.changes,
    regression: computeRegression(input.baselineScore, input.candidateScore),
    baseVersion: input.baseVersion,
    status: 'pending',
  };
}

/** Extract the evolution trigger from a quality-gate report (failed/quarantined gates only). */
export function triggerFromGateReport(report: QualityGateReport): EvolutionTrigger {
  const violationCodes = report.results
    .filter((r) => r.status !== 'passed')
    .flatMap((r) => r.violations.map((v) => v.code));
  return { source: 'gate', violationCodes };
}

/** Extract the evolution trigger from a score report, as a delta vs a baseline score. */
export function triggerFromScoreReport(report: ScoreReport, baselineScore: number): EvolutionTrigger {
  return { source: 'score', scoreDelta: report.score - baselineScore };
}

/**
 * A proposal is submittable for review only when its regression passed, it carries
 * a non-empty base version and at least one well-formed change. Regression is the
 * external anchor - a proposal that degrades quality cannot even reach review.
 */
export function isSubmittable(proposal: EvolutionProposal): boolean {
  return (
    proposal.regression.passed &&
    proposal.baseVersion !== '' &&
    proposal.changes.length > 0 &&
    proposal.changes.every(isValidRuleChange)
  );
}

/**
 * Red line 2: a proposal is production-ready only when it is approved AND
 * submittable. An unapproved (or regression-failing) proposal must never drive a
 * production export - this is enforced by a predicate, not a convention.
 */
export function isProductionReady(proposal: EvolutionProposal): boolean {
  return proposal.status === 'approved' && isSubmittable(proposal);
}

/** Approve a proposal, optionally with a reviewer note. */
export function approveProposal(proposal: EvolutionProposal, note?: string): EvolutionProposal {
  return { ...proposal, status: 'approved', ...(note !== undefined ? { note } : {}) };
}

/** Reject a proposal, optionally with a reviewer note. */
export function rejectProposal(proposal: EvolutionProposal, note?: string): EvolutionProposal {
  return { ...proposal, status: 'rejected', ...(note !== undefined ? { note } : {}) };
}

/**
 * Red line 3: when an evolution fails (regression did not pass) or is rejected,
 * every affected case is marked stale and forced to re-run. A successful approved
 * proposal returns nothing to roll back.
 */
export function computeStaleCases(affectedCases: string[], proposal: EvolutionProposal): string[] {
  const rolledBack = !proposal.regression.passed || proposal.status === 'rejected';
  return rolledBack ? affectedCases : [];
}
