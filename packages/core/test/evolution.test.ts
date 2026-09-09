import { describe, expect, it } from 'vitest';
import {
  approve,
  hitlGateFor,
  isApproved,
  pendingDecision,
  reject,
} from '../src/evolution/hitl.js';
import type { EvolutionActionKind, HitlDecision } from '../src/evolution/hitl.js';
import {
  approveProposal,
  buildEvolutionProposal,
  computeRegression,
  computeStaleCases,
  isProductionReady,
  isSubmittable,
  isValidRuleChange,
  rejectProposal,
  triggerFromGateReport,
  triggerFromScoreReport,
} from '../src/evolution/proposal.js';
import type { EvolutionProposal, RuleChange } from '../src/evolution/proposal.js';
import type { MapRule } from '../src/transform/strategies.js';
import type { QualityGateReport } from '../src/ir/types.js';
import type { ScoreReport } from '../src/score/score.js';

/**
 * Evolution engine tests.
 *
 * The self-evolution loop is a governance layer, not a generator: it proves that
 * a rule change is diff-able, externally anchored (regression), HITL-approved and
 * rolled back (stale cases) on failure. Every fixture is a real hand-written IR
 * object - no mocks.
 */

const mapRule = (id: string, from = 'status'): MapRule => ({
  id,
  kind: 'map',
  from,
  to: 'status_norm',
  mapping: { ok: 'OK' },
});

const validProposal = (overrides: Partial<EvolutionProposal> = {}): EvolutionProposal => ({
  id: 'prop-1',
  layer: 'L1',
  hitlGate: 'H4',
  trigger: { source: 'gate', violationCodes: ['MISSING_SIGNAL'] },
  changes: [{ ruleId: 'r1', kind: 'update', before: mapRule('r1'), after: mapRule('r1') }],
  regression: { baselineScore: 80, candidateScore: 90, passed: true },
  baseVersion: 'abc1234',
  status: 'pending',
  ...overrides,
});

describe('hitlGateFor', () => {
  const cases: Array<[EvolutionActionKind, string]> = [
    ['cold-start-rule', 'H1'],
    ['entity-normalization', 'H2'],
    ['ground-truth', 'H3'],
    ['rule-evolution', 'H4'],
    ['gt-evolution', 'H4'],
    ['quarantine-arbitration', 'H5'],
    ['score-anomaly', 'H6'],
  ];

  it.each(cases)('maps %s to %s', (action, gate) => {
    expect(hitlGateFor(action)).toBe(gate);
  });
});

describe('HITL decision state machine', () => {
  it('starts a decision in the pending state', () => {
    expect(pendingDecision('H4')).toEqual({ gate: 'H4', status: 'pending' });
  });

  it('approves a decision without a note', () => {
    const d: HitlDecision = { gate: 'H1', status: 'pending' };
    expect(approve(d)).toEqual({ gate: 'H1', status: 'approved' });
  });

  it('approves a decision with a note', () => {
    const d: HitlDecision = { gate: 'H1', status: 'pending' };
    expect(approve(d, 'looks good')).toEqual({ gate: 'H1', status: 'approved', note: 'looks good' });
  });

  it('rejects a decision without a note', () => {
    const d: HitlDecision = { gate: 'H1', status: 'pending' };
    expect(reject(d)).toEqual({ gate: 'H1', status: 'rejected' });
  });

  it('rejects a decision with a note', () => {
    const d: HitlDecision = { gate: 'H1', status: 'pending' };
    expect(reject(d, 'needs a diff')).toEqual({ gate: 'H1', status: 'rejected', note: 'needs a diff' });
  });

  it('recognises only approved decisions', () => {
    expect(isApproved({ gate: 'H4', status: 'approved' })).toBe(true);
    expect(isApproved({ gate: 'H4', status: 'pending' })).toBe(false);
    expect(isApproved({ gate: 'H4', status: 'rejected' })).toBe(false);
  });
});

describe('computeRegression', () => {
  it('passes when the candidate improves on the baseline', () => {
    expect(computeRegression(80, 95).passed).toBe(true);
  });

  it('passes when the candidate ties the baseline', () => {
    expect(computeRegression(80, 80).passed).toBe(true);
  });

  it('fails when the candidate degrades the baseline', () => {
    expect(computeRegression(80, 70).passed).toBe(false);
  });
});

describe('isValidRuleChange', () => {
  it('accepts an add with only an after', () => {
    const change: RuleChange = { ruleId: 'r1', kind: 'add', after: mapRule('r1') };
    expect(isValidRuleChange(change)).toBe(true);
  });

  it('rejects an add that also carries a before', () => {
    const change: RuleChange = { ruleId: 'r1', kind: 'add', before: mapRule('r1'), after: mapRule('r1') };
    expect(isValidRuleChange(change)).toBe(false);
  });

  it('rejects an add without an after', () => {
    const change: RuleChange = { ruleId: 'r1', kind: 'add' };
    expect(isValidRuleChange(change)).toBe(false);
  });

  it('accepts a remove with only a before', () => {
    const change: RuleChange = { ruleId: 'r1', kind: 'remove', before: mapRule('r1') };
    expect(isValidRuleChange(change)).toBe(true);
  });

  it('rejects a remove without a before', () => {
    const change: RuleChange = { ruleId: 'r1', kind: 'remove' };
    expect(isValidRuleChange(change)).toBe(false);
  });

  it('rejects a remove that also carries an after', () => {
    const change: RuleChange = { ruleId: 'r1', kind: 'remove', before: mapRule('r1'), after: mapRule('r1') };
    expect(isValidRuleChange(change)).toBe(false);
  });

  it('accepts an update with matching before/after ids', () => {
    const change: RuleChange = { ruleId: 'r1', kind: 'update', before: mapRule('r1'), after: mapRule('r1') };
    expect(isValidRuleChange(change)).toBe(true);
  });

  it('rejects an update without a before', () => {
    const change: RuleChange = { ruleId: 'r1', kind: 'update', after: mapRule('r1') };
    expect(isValidRuleChange(change)).toBe(false);
  });

  it('rejects an update without an after', () => {
    const change: RuleChange = { ruleId: 'r1', kind: 'update', before: mapRule('r1') };
    expect(isValidRuleChange(change)).toBe(false);
  });

  it('rejects an update whose before/after ids diverge', () => {
    const change: RuleChange = { ruleId: 'r1', kind: 'update', before: mapRule('r1'), after: mapRule('r2') };
    expect(isValidRuleChange(change)).toBe(false);
  });
});

describe('buildEvolutionProposal', () => {
  it('assembles a pending proposal with a derived HITL gate and regression', () => {
    const proposal = buildEvolutionProposal({
      id: 'prop-1',
      layer: 'L1',
      action: 'rule-evolution',
      trigger: { source: 'gate', violationCodes: ['MISSING_SIGNAL'] },
      changes: [{ ruleId: 'r1', kind: 'update', before: mapRule('r1'), after: mapRule('r1') }],
      baselineScore: 80,
      candidateScore: 90,
      baseVersion: 'abc1234',
    });
    expect(proposal.hitlGate).toBe('H4');
    expect(proposal.status).toBe('pending');
    expect(proposal.regression).toEqual({ baselineScore: 80, candidateScore: 90, passed: true });
    expect(proposal.baseVersion).toBe('abc1234');
  });

  it('derives a failed regression when the candidate degrades', () => {
    const proposal = buildEvolutionProposal({
      id: 'prop-2',
      layer: 'L1',
      action: 'rule-evolution',
      trigger: { source: 'gate' },
      changes: [{ ruleId: 'r1', kind: 'add', after: mapRule('r1') }],
      baselineScore: 80,
      candidateScore: 70,
      baseVersion: 'abc1234',
    });
    expect(proposal.regression.passed).toBe(false);
  });
});

describe('triggerFromGateReport', () => {
  it('returns no codes when every gate passes', () => {
    const report: QualityGateReport = {
      caseId: 'case-001',
      irVersion: '2.0',
      gateRunId: 'run-1',
      runAt: '2026-09-09T00:00:00.000Z',
      results: [
        { gateId: 'G1', status: 'passed', violations: [] },
        { gateId: 'G2', status: 'passed', violations: [] },
      ],
      finalStatus: 'admitted',
    };
    expect(triggerFromGateReport(report)).toEqual({ source: 'gate', violationCodes: [] });
  });

  it('collects codes from failed and quarantined gates only', () => {
    const report: QualityGateReport = {
      caseId: 'case-001',
      irVersion: '2.0',
      gateRunId: 'run-1',
      runAt: '2026-09-09T00:00:00.000Z',
      results: [
        { gateId: 'G1', status: 'failed', violations: [{ code: 'MISSING_SIGNAL', message: 'x' }] },
        { gateId: 'G2', status: 'quarantined', violations: [{ code: 'DANGLING_EDGE', message: 'y' }] },
        { gateId: 'G3', status: 'passed', violations: [] },
      ],
      finalStatus: 'quarantined',
    };
    expect(triggerFromGateReport(report).violationCodes).toEqual(['MISSING_SIGNAL', 'DANGLING_EDGE']);
  });
});

describe('triggerFromScoreReport', () => {
  it('reports a positive delta when the score exceeds the baseline', () => {
    const report: ScoreReport = {
      target: 'aiops2025',
      passed: true,
      score: 92,
      structure: { target: 'aiops2025', passed: true, checks: [] },
    };
    expect(triggerFromScoreReport(report, 80)).toEqual({ source: 'score', scoreDelta: 12 });
  });

  it('reports a negative delta when the score regresses', () => {
    const report: ScoreReport = {
      target: 'rca100',
      passed: false,
      score: 70,
      structure: { target: 'rca100', passed: false, checks: [] },
    };
    expect(triggerFromScoreReport(report, 80)).toEqual({ source: 'score', scoreDelta: -10 });
  });
});

describe('isSubmittable', () => {
  it('accepts a well-formed, regression-passing proposal', () => {
    expect(isSubmittable(validProposal())).toBe(true);
  });

  it('rejects a proposal whose regression failed', () => {
    expect(isSubmittable(validProposal({ regression: { baselineScore: 80, candidateScore: 70, passed: false } }))).toBe(false);
  });

  it('rejects a proposal with an empty base version', () => {
    expect(isSubmittable(validProposal({ baseVersion: '' }))).toBe(false);
  });

  it('rejects a proposal with no changes', () => {
    expect(isSubmittable(validProposal({ changes: [] }))).toBe(false);
  });

  it('rejects a proposal with a malformed change', () => {
    const bad: RuleChange = { ruleId: 'r1', kind: 'update', before: mapRule('r1') };
    expect(isSubmittable(validProposal({ changes: [bad] }))).toBe(false);
  });
});

describe('isProductionReady', () => {
  it('is ready only for an approved, submittable proposal', () => {
    expect(isProductionReady(validProposal({ status: 'approved' }))).toBe(true);
  });

  it('is not ready while pending', () => {
    expect(isProductionReady(validProposal({ status: 'pending' }))).toBe(false);
  });

  it('is not ready when rejected', () => {
    expect(isProductionReady(validProposal({ status: 'rejected' }))).toBe(false);
  });

  it('is not ready when approved but not submittable', () => {
    expect(
      isProductionReady(validProposal({ status: 'approved', regression: { baselineScore: 80, candidateScore: 70, passed: false } })),
    ).toBe(false);
  });
});

describe('approveProposal / rejectProposal', () => {
  it('approves a proposal and attaches an optional note', () => {
    expect(approveProposal(validProposal())).toMatchObject({ status: 'approved' });
    expect(approveProposal(validProposal(), 'ship it')).toMatchObject({ status: 'approved', note: 'ship it' });
  });

  it('rejects a proposal and attaches an optional note', () => {
    expect(rejectProposal(validProposal())).toMatchObject({ status: 'rejected' });
    expect(rejectProposal(validProposal(), 'regression gap')).toMatchObject({ status: 'rejected', note: 'regression gap' });
  });
});

describe('computeStaleCases', () => {
  it('marks affected cases stale when the regression failed', () => {
    const proposal = validProposal({ regression: { baselineScore: 80, candidateScore: 70, passed: false } });
    expect(computeStaleCases(['case-001', 'case-002'], proposal)).toEqual(['case-001', 'case-002']);
  });

  it('marks affected cases stale when the proposal was rejected', () => {
    const proposal = validProposal({ status: 'rejected' });
    expect(computeStaleCases(['case-001'], proposal)).toEqual(['case-001']);
  });

  it('returns nothing to roll back for an approved, passing proposal', () => {
    const proposal = validProposal({ status: 'approved' });
    expect(computeStaleCases(['case-001'], proposal)).toEqual([]);
  });
});
