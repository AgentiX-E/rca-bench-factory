import { describe, expect, it } from 'vitest';
import { scoreOfficial } from '../src/score/official.js';
import { readOfficialGroundTruth } from '../src/score/official.js';

/**
 * An empty denominator is not a perfect score.
 *
 * `rateOf(predicted, expected)` answered `1` when `expected` was empty, on the
 * reading that "there was nothing to match, so nothing failed". That is a
 * subtracted denominator wearing a friendly face: a case whose answer key
 * carries no causal chain and no checkpoint collects the whole process term
 * because it asked nothing of the prediction.
 *
 * Measured on this repo's own RCA100 reader before the fix:
 *
 *   chain: []                    -> chainNodeMatch 1
 *   chain: ['a->b']              -> chainNodeMatch 1 with the same prediction
 *
 * The published RCA100 rule weights `process` at 0.3, and `process` is the mean
 * of the chain term and the checkpoint term. So an answer key with no process
 * gave a third of the score away, and gave the same third to a prediction that
 * said nothing and one that said the right thing.
 *
 * The fix is not "score zero when empty" either -- that would punish an export
 * for a thin answer key by inventing a failure. A term with no denominator has
 * to leave the mean, not enter it as a free 1.
 */

const rca100 = (gt: unknown): Record<string, string> => ({
  'cases/case-1/topology.json': JSON.stringify({ entities: [{ id: 'svc:order', name: 'order' }], edges: [] }),
  'answer_key/case-1.gt.json': JSON.stringify(gt),
});

/** An answer key with a root cause and optionally a reasoning chain. */
function key(options: { steps?: unknown[] } = {}): unknown {
  const steps = options.steps ?? [];
  return {
    root_cause_entities: ['order'],
    root_cause_types: ['cpu'],
    raw_ground_truth: JSON.stringify({ reasoning: { steps } }),
  };
}

/** One reasoning step carrying `to_entity` and one checkpoint. */
function step(to: string, signalRef: string): unknown {
  return { from_entity: 'order', to_entity: to, checkpoints: [{ signal_ref: signalRef }] };
}

describe('a term with no denominator leaves the mean instead of counting as complete', () => {
  it('does not credit a chain the answer key never declares', () => {
    const report = scoreOfficial('rca100', rca100(key()));
    expect(report.breakdown.chainNodeMatch, JSON.stringify(report.breakdown)).toBe(0);
    expect(report.breakdown.checkpointHit).toBe(0);
  });

  it('separates a key with no process from a key that declares one', () => {
    const empty = scoreOfficial('rca100', rca100(key()));
    const full = scoreOfficial('rca100', rca100(key({ steps: [step('cart', 'order|cpu')] })));
    expect(full.final).toBe(100);
    expect(empty.final, `${empty.final} vs ${full.final}`).toBeLessThan(full.final);
  });

  it('reads the chain and the checkpoints out of the answer key at all', () => {
    // Without this the two assertions above could pass because the reader
    // returns nothing for every key, which would be a different bug.
    const gt = readOfficialGroundTruth('rca100', rca100(key({ steps: [step('cart', 'order|cpu')] })))[0]!;
    expect(gt.chain).toEqual(['order->cart']);
    expect(gt.evidence).toEqual(['order|cpu']);
  });
});
