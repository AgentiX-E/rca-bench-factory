import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  approveProposal,
  rejectProposal,
  type EvolutionProposal,
} from '../src/evolution/proposal.js';
import { hitlGateFor, type EvolutionActionKind } from '../src/evolution/hitl.js';

/**
 * There is one HITL decision machine, and this file exists to keep it that way.
 *
 * `hitl.ts` and `proposal.ts` both modelled `pending -> approved/rejected`:
 * `HitlDecision` with `approve`/`reject`, and `EvolutionProposal` with
 * `approveProposal`/`rejectProposal`. They were the same machine twice over the
 * same `HitlStatus`, and only the proposal copy carried the guard that makes the
 * transition one-way.
 *
 * The gap survived because nothing called the hitl copy. Its tests exercised
 * `approve(d)` and `reject(d)` only from `pending`, so they read as proof that
 * the transition worked while being unable to tell a guarded machine apart from
 * an unguarded one -- the difference only appears on a *second* decision.
 *
 * The fix was to delete the duplicate, not to guard it: a second implementation
 * of a guarded rule is free to drift from the first, which is exactly what
 * happened. `hitl.ts` now owns only the checkpoint vocabulary, and this file
 * asserts that boundary so the duplicate cannot come back.
 */

const base = (overrides: Partial<EvolutionProposal> = {}): EvolutionProposal =>
  ({
    id: 'prop-1',
    layer: 'L1',
    hitlGate: 'H4',
    trigger: { source: 'gate', violationCodes: ['MISSING_SIGNAL'] },
    changes: [{ ruleId: 'r1', kind: 'add', after: { id: 'r1' } }],
    regression: { baselineScore: 80, candidateScore: 90, passed: true },
    baseVersion: 'abc1234',
    status: 'pending',
    ...overrides,
  }) as EvolutionProposal;

const HITL_SOURCE = readFileSync(new URL('../src/evolution/hitl.ts', import.meta.url), 'utf8');

describe('hitl.ts owns the checkpoint vocabulary and nothing else', () => {
  it('still maps every action onto its checkpoint', () => {
    // The half that is genuinely hitl.ts's job, and the reason the module exists.
    const expected: [EvolutionActionKind, string][] = [
      ['cold-start-rule', 'H1'],
      ['entity-normalization', 'H2'],
      ['ground-truth', 'H3'],
      ['rule-evolution', 'H4'],
      ['gt-evolution', 'H4'],
      ['quarantine-arbitration', 'H5'],
      ['score-anomaly', 'H6'],
    ];
    for (const [action, gate] of expected) {
      expect(hitlGateFor(action)).toBe(gate);
    }
  });

  it('exports no second implementation of the decision machine', async () => {
    // The decisive assertion. Re-exporting a decision helper from hitl.ts - or
    // re-declaring one - is how the duplicate started, so the module's runtime
    // surface is pinned rather than merely reviewed.
    const hitl = (await import('../src/evolution/hitl.js')) as Record<string, unknown>;
    const runtimeExports = Object.keys(hitl).sort();
    expect(runtimeExports).toEqual(['hitlGateFor']);
  });

  it('declares no decision transition in its source', () => {
    // A named export check would miss a non-exported copy, and it is the copy
    // that drifts. The module may describe the status vocabulary - it owns the
    // type - but it may not implement a transition over it.
    for (const forbidden of ['function approve', 'function reject', 'assertUndecided', 'status:']) {
      expect(HITL_SOURCE).not.toContain(forbidden);
    }
  });

  it('keeps the checkpoint vocabulary the proposal layer builds on', () => {
    // `HitlStatus` and the gate union stay here: the proposal's state field is
    // typed by this module, so the vocabulary is shared while the machine is not.
    expect(HITL_SOURCE).toContain("export type HitlStatus = 'pending' | 'approved' | 'rejected'");
    expect(HITL_SOURCE).toContain("export type HitlGate = 'H1' | 'H2' | 'H3' | 'H4' | 'H5' | 'H6'");
  });
});

describe('the surviving machine is the guarded one', () => {
  it('refuses a second decision, which is what the deleted copy could not do', () => {
    // The property the duplicate lacked. Stated here as well as in
    // evolution-decision.test.ts because this is the reason for the deletion:
    // if the surviving copy ever loses its guard, this file says why that is
    // fatal rather than a regression in an unrelated helper.
    const approved = approveProposal(base(), 'looks good');
    expect(() => rejectProposal(approved, 'changed my mind')).toThrow(/already approved/);
    expect(() => approveProposal(approved, 'again')).toThrow(/already approved/);
  });

  it('seals every gate, not just the one the tests happen to use', () => {
    // H1..H6 all reach the same machine through hitlGateFor, so the guard is a
    // property of the transition rather than of a particular checkpoint.
    for (const action of [
      'cold-start-rule',
      'entity-normalization',
      'ground-truth',
      'rule-evolution',
      'gt-evolution',
      'quarantine-arbitration',
      'score-anomaly',
    ] as EvolutionActionKind[]) {
      const proposal = base({ hitlGate: hitlGateFor(action) });
      const decided = approveProposal(proposal);
      expect(decided.status).toBe('approved');
      expect(() => rejectProposal(decided)).toThrow(/already approved/);
    }
  });
});
