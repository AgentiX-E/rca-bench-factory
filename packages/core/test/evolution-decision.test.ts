import { describe, expect, it } from 'vitest';
import { approveProposal, rejectProposal, type EvolutionProposal } from '../src/evolution/proposal.js';
import { isProductionReady } from '../src/evolution/proposal.js';

/**
 * A HITL decision is irreversible, and must behave that way.
 *
 * The proposal document is the *only* record of a review: the CLI reads one
 * file, writes another, and the reviewer's note about why a change was allowed
 * (or refused) exists nowhere else. `approveProposal` / `rejectProposal` used to
 * write `status` and `note` unconditionally, so a second command silently
 * replaced the first decision and its justification:
 *
 *     approve --note "looks good"   -> status=approved, note="looks good"
 *     reject  --note "changed mind" -> status=rejected, note="changed mind"
 *
 * and nothing in the second document mentions that the proposal was ever
 * approved. Exit code 0 throughout. An approval that has been acted on - a rule
 * shipped, a dataset published - is then indistinguishable from one that was
 * never granted, which is the opposite of what an audit trail is for.
 *
 * These tests pin the decision as *sealing*: the first verdict is final, and a
 * second attempt is refused loudly rather than accepted quietly.
 */

const base = (overrides: Partial<EvolutionProposal> = {}): EvolutionProposal => ({
  id: 'prop-1',
  layer: 'L1',
  hitlGate: 'H4',
  trigger: { source: 'gate', violationCodes: ['MISSING_SIGNAL'] },
  changes: [{ ruleId: 'r1', kind: 'add', after: { id: 'r1', kind: 'time', from: 'ts', to: 'ts_utc', layout: 'iso8601' } }],
  regression: { baselineScore: 80, candidateScore: 90, passed: true },
  baseVersion: 'abc1234',
  status: 'pending',
  ...overrides,
}) as EvolutionProposal;

describe('a pending proposal can be decided once', () => {
  it('approves a pending proposal', () => {
    const decided = approveProposal(base(), 'ship it');
    expect(decided.status).toBe('approved');
    expect(decided.note).toBe('ship it');
  });

  it('rejects a pending proposal', () => {
    const decided = rejectProposal(base(), 'regression gap');
    expect(decided.status).toBe('rejected');
    expect(decided.note).toBe('regression gap');
  });

  it('decides a pending proposal with no note at all', () => {
    // The note is optional, so "no note" must stay a legitimate decision rather
    // than being caught by the same guard that protects an existing one.
    expect(approveProposal(base()).note).toBeUndefined();
    expect(rejectProposal(base()).note).toBeUndefined();
  });
});

describe('a decided proposal cannot be decided again', () => {
  it('refuses to reject an approved proposal', () => {
    // The reversal that matters most: an approved proposal may already have been
    // acted on, so flipping it to rejected would silently retract a granted
    // approval.
    const approved = approveProposal(base(), 'looks good');
    expect(() => rejectProposal(approved, 'changed my mind')).toThrow(/already approved/);
  });

  it('refuses to approve a rejected proposal', () => {
    const rejected = rejectProposal(base(), 'regression gap');
    expect(() => approveProposal(rejected, 'actually fine')).toThrow(/already rejected/);
  });

  it('refuses to approve an approved proposal a second time', () => {
    // Re-approving is not harmless: the second note replaces the first, so the
    // reviewer whose judgement actually allowed the change is erased from the
    // record while the status still reads "approved".
    const approved = approveProposal(base(), 'first reviewer');
    expect(() => approveProposal(approved, 'second reviewer')).toThrow(/already approved/);
  });

  it('refuses to reject a rejected proposal a second time', () => {
    const rejected = rejectProposal(base(), 'first reason');
    expect(() => rejectProposal(rejected, 'second reason')).toThrow(/already rejected/);
  });

  it('names the verdict that stands, not only the one requested', () => {
    // The message has to answer "what is the state, then?" - otherwise the
    // operator's next move is a guess.
    const approved = approveProposal(base());
    expect(() => rejectProposal(approved)).toThrow(/approved/);
    const rejected = rejectProposal(base());
    expect(() => approveProposal(rejected)).toThrow(/rejected/);
  });

  it('leaves the earlier decision untouched when it refuses', () => {
    // A refusal that still mutated the input would be worse than the overwrite
    // it replaced, because the caller holds a reference to the same object.
    const approved = approveProposal(base(), 'looks good');
    const snapshot = { ...approved };
    expect(() => rejectProposal(approved, 'changed my mind')).toThrow();
    expect(approved).toEqual(snapshot);
    expect(approved.status).toBe('approved');
    expect(approved.note).toBe('looks good');
  });
});

describe('sealing a decision preserves the rest of the proposal', () => {
  it('keeps the regression verdict, the changes and the base version', () => {
    // The guard must not become a rewrite. Everything the proposal says about
    // *what* is being changed and *whether* it is safe survives the decision.
    const before = base();
    const after = approveProposal(before, 'ship it');
    expect(after.regression).toEqual(before.regression);
    expect(after.changes).toEqual(before.changes);
    expect(after.baseVersion).toBe(before.baseVersion);
    expect(after.hitlGate).toBe(before.hitlGate);
    expect(after.trigger).toEqual(before.trigger);
  });

  it('does not mutate the proposal it was given', () => {
    const before = base();
    approveProposal(before, 'ship it');
    expect(before.status).toBe('pending');
    expect(before.note).toBeUndefined();
  });

  it('still reports production readiness from the sealed document', () => {
    // The decision is only meaningful if the downstream predicate reads it.
    const approved = approveProposal(base(), 'ship it');
    expect(isProductionReady(approved)).toBe(true);
    expect(isProductionReady(rejectProposal(base()))).toBe(false);
  });
});
