import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  checkG5AntiPollution,
  describePairSimilarity,
  readPairSimilarity,
  TASK_TEXT_STOP_WORDS,
  tokeniseTaskText,
} from '../src/gates/gates.js';
import type { FaultCase, IrBundle } from '../src/ir/types.js';
import { T0, validBundle, validCase } from './fixtures.js';

/**
 * G5's fifth and sixth arms: two cases that are the same case, written twice.
 *
 * The gate had four arms and every one of them compared a case with something that is not another
 * case: a regular expression, a fingerprint from a public set, a declaration, a component name.
 * The one comparison the word *pollution* is actually about -- two cases in the same set that a
 * solver cannot tell apart, so that a set of thirty incidents is a set of twenty-two with eight of
 * them counted twice -- had no arm at all. `caseFingerprint` catches only the six-tuple
 * `system|type|injectTime|rootCauseEntityId|window.start|window.end`, so a re-typed incident with a
 * minute moved is a different case to it, and two prompts that say one thing in two spellings are
 * two prompts to it as well.
 *
 * ## Why the evidence is two fixtures and a reading
 *
 * The shipped corpus offers no witness: 435 pairs, none within a factor of two of either threshold.
 * That is exactly the situation this repository has learned to distrust -- a rule whose only
 * failure is synthetic is a rule nobody has seen work on the thing it protects. The answer here is
 * not to skip the rule but to make the rule *report what it measured*: `readPairSimilarity` returns
 * the closest pair and the most overlapping pair beside the thresholds they were compared with, so
 * a corpus drifting towards duplication announces itself as a rising maximum long before it turns
 * the rule red. The last two tests in this file read that number off the shipped corpus, which is
 * what makes the silence a measurement rather than an absence.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const CASES = resolve(ROOT, 'golden-master', 'fault-cases');

/** An instant `seconds` after the shared fixture epoch, in the canonical form the IR requires. */
function at(seconds: number): string {
  return new Date(Date.parse(T0) + seconds * 1000).toISOString();
}

function windowOf(fromSeconds: number, toSeconds: number): FaultCase['window'] {
  return { start: at(fromSeconds), end: at(toSeconds) };
}

/** A bundle whose only content is the cases: G5 reads nothing else. */
function bundleOf(cases: FaultCase[]): IrBundle {
  return { irVersion: '2.0', graph: { entities: [], edges: [] }, cases, signals: {} };
}

function codesOf(bundle: IrBundle): string[] {
  return checkG5AntiPollution(bundle).violations.map((v) => v.code);
}

describe('G5 · the vocabulary the comparison drops', () => {
  it('keeps the words that carry a subject and drops the ones that carry a sentence', () => {
    expect(tokeniseTaskText('The cache WAS slow after a deploy')).toEqual(['cache', 'slow', 'deploy']);
    expect(tokeniseTaskText('checkout-api p99 rose')).toEqual(['checkout', 'api', 'p99', 'rose']);
  });

  it('drops every word the published list names, so the list and the code are one definition', () => {
    // A list beside a filter is two definitions of the same thing, and the second one drifts first.
    for (const word of TASK_TEXT_STOP_WORDS) expect(tokeniseTaskText(word)).toEqual([]);
  });
});

describe('G5 · two prompts that say one thing', () => {
  it('refuses two prompts that differ only in their function words', () => {
    // The comparison drops function words before it counts, which is what makes this pair a
    // duplicate rather than a 0.93 near miss: `The`/`A` and `the`/`a` are the whole difference.
    const a = validCase({
      caseId: 'a',
      query: 'The checkout service became slow after the deploy. Find the root cause.',
      window: windowOf(0, 1000),
    });
    const b = validCase({
      caseId: 'b',
      query: 'A checkout service became slow after a deploy. Find the root cause.',
      window: windowOf(3600, 4600),
    });
    expect(readPairSimilarity(bundleOf([a, b])).nearDuplicates).toEqual([
      { a: 'a', b: 'b', jaccard: 1 },
    ]);
    expect(codesOf(bundleOf([a, b]))).toContain('NEAR_DUPLICATE_QUERY');
  });

  it('leaves two prompts alone that share their subject and nothing else', () => {
    // The shipped corpus's own worst pair is this shape -- 0.24 over a shared vocabulary of
    // `service`, `latency`, `error` -- and a rule that called it a duplicate would refuse the
    // corpus it was written for.
    const a = validCase({
      caseId: 'a',
      query: 'p99 latency on the checkout path rose from 180ms to 4.3s with no change in load.',
      window: windowOf(0, 1000),
    });
    const b = validCase({
      caseId: 'b',
      query: 'the invoice renderer raised a null dereference on every order after the release.',
      window: windowOf(3600, 4600),
    });
    const reading = readPairSimilarity(bundleOf([a, b]));
    expect(reading.nearDuplicates).toEqual([]);
    expect(reading.closestTaskText?.jaccard).toBeLessThan(0.9);
    expect(codesOf(bundleOf([a, b]))).not.toContain('NEAR_DUPLICATE_QUERY');
  });

  it('moves the verdict with the threshold rather than with a literal', () => {
    // A rule whose decision point cannot be moved is a rule with an unstated default. The pair here
    // is the shipped corpus's closest, quoted at its own length, so this also says the default sits
    // far above what a real corpus produces.
    const a = validCase({
      caseId: 'a',
      query:
        'Booking reminders went out an hour early for every appointment created after the daylight ' +
        'saving change. Which component is the root cause, and why is the scheduler not it?',
      window: windowOf(0, 1000),
    });
    const b = validCase({
      caseId: 'b',
      query:
        'Cache GETs went from 0.4ms to 55ms at 21:30 and stayed there while every write stayed fast. ' +
        'Which component is the root cause, and why are the clients not it?',
      window: windowOf(3600, 4600),
    });
    const at09 = readPairSimilarity(bundleOf([a, b]));
    const at02 = readPairSimilarity(bundleOf([a, b]), { maxTaskTextJaccard: 0.2 });
    expect(at09.closestTaskText?.jaccard).toBeCloseTo(0.25, 6);
    expect(at09.nearDuplicates).toEqual([]);
    expect(at02.nearDuplicates).toHaveLength(1);
    expect(at02.thresholds.taskTextJaccard).toBe(0.2);
  });

  it('does not compare cases from two systems with each other', () => {
    // One incident in two systems is two cases: the same prompt over two graphs asks two questions.
    const a = validCase({
      caseId: 'a',
      system: 'storefront',
      environment: { system: 'storefront', version: 'v1' },
      query: 'the cart service timed out',
      window: windowOf(0, 1000),
    });
    const b = validCase({
      caseId: 'b',
      system: 'billing',
      environment: { system: 'billing', version: 'v1' },
      query: 'the cart service timed out',
      window: windowOf(0, 1000),
    });
    const reading = readPairSimilarity(bundleOf([a, b]));
    expect(reading.nearDuplicates).toEqual([]);
    expect(reading.overlappingWindows).toEqual([]);
    expect(reading.skippedCrossSystem).toBe(1);
    expect(reading.judgedTaskText).toBe(0);
    expect(reading.judgedWindows).toBe(0);
  });

  it('declines a pair it cannot read a prompt from, and says how many', () => {
    const a = validCase({ caseId: 'a', query: 'the cart service timed out', window: windowOf(0, 1000) });
    const b = validCase({ caseId: 'b', query: undefined, window: windowOf(3600, 4600) });
    const reading = readPairSimilarity(bundleOf([a, b]));
    expect(reading.skippedNoQuery).toBe(1);
    expect(reading.judgedTaskText).toBe(0);
    expect(reading.nearDuplicates).toEqual([]);
  });

  it('reads a CJK prompt as tokens rather than as nothing', () => {
    // `[a-z0-9]+` alone would tokenise both of these to the empty set, and an empty set would then
    // have to be either a duplicate or a skip -- both wrong. A CJK character is a token.
    const a = validCase({ caseId: 'a', query: '订单服务变慢了，找出根本原因', window: windowOf(0, 1000) });
    const b = validCase({ caseId: 'b', query: '订单服务变慢了，找出根本原因', window: windowOf(3600, 4600) });
    const reading = readPairSimilarity(bundleOf([a, b]));
    expect(reading.judgedTaskText).toBe(1);
    expect(reading.skippedNoQuery).toBe(0);
    expect(reading.nearDuplicates).toEqual([{ a: 'a', b: 'b', jaccard: 1 }]);
  });
});

describe('G5 · two windows that cover one moment', () => {
  it('refuses two cases whose windows overlap by nine tenths', () => {
    // Two injections inside one window are two faults in one signal trace: neither case's
    // telemetry is attributable to its own injection.
    const a = validCase({ caseId: 'a', window: windowOf(0, 1000) });
    const b = validCase({ caseId: 'b', window: windowOf(50, 1050) });
    const reading = readPairSimilarity(bundleOf([a, b]));
    expect(reading.overlappingWindows).toHaveLength(1);
    expect(reading.overlappingWindows[0]).toEqual({
      a: 'a',
      b: 'b',
      iou: expect.closeTo(0.9047619, 6),
    });
    expect(codesOf(bundleOf([a, b]))).toContain('OVERLAPPING_WINDOW');
  });

  it('treats a window that ends where the next begins as disjoint', () => {
    // Half-open intervals: two incidents that follow one another share no instant, and a rule
    // that used `>=` on the endpoints would refuse every contiguous pair in a corpus built from
    // one day of telemetry.
    const a = validCase({ caseId: 'a', window: windowOf(0, 1000) });
    const b = validCase({ caseId: 'b', window: windowOf(1000, 2000) });
    const reading = readPairSimilarity(bundleOf([a, b]));
    expect(reading.mostOverlappingWindow?.iou).toBe(0);
    expect(reading.overlappingWindows).toEqual([]);
  });

  it('declines a degenerate window rather than calling every pair of them identical', () => {
    // A case whose window starts and ends on the same millisecond has no union. The alternative
    // to answering 0 is answering 0/0, and NaN compares false against every threshold, so the
    // pair would pass silent and unjudged while the reading claimed it had been compared.
    const degenerate: FaultCase['window'] = { start: at(600), end: at(600) };
    const a = validCase({ caseId: 'a', window: degenerate });
    const b = validCase({ caseId: 'b', window: degenerate });
    const reading = readPairSimilarity(bundleOf([a, b]));
    expect(reading.mostOverlappingWindow?.iou).toBe(0);
    expect(reading.judgedWindows).toBe(1);
    expect(reading.overlappingWindows).toEqual([]);
  });

  it('compares two cases that carry the same id as two cases', () => {
    // Nothing in the IR forbids a repeated `caseId`, and a set with one is exactly what
    // `DUPLICATE_CASE` exists to report. Tokenising by id would make the second case inherit the
    // first one's tokens, so a pair would be compared with itself and the reading would report a
    // duplicate that is an artefact of the lookup.
    const a = validCase({ caseId: 'same', query: 'the cart service timed out', window: windowOf(0, 1000) });
    const b = validCase({ caseId: 'same', query: 'the invoice renderer lost a field', window: windowOf(3600, 4600) });
    const reading = readPairSimilarity(bundleOf([a, b]));
    expect(reading.judgedTaskText).toBe(1);
    expect(reading.closestTaskText?.jaccard).toBeLessThan(0.5);
    expect(reading.nearDuplicates).toEqual([]);
  });

  it('moves the verdict with the threshold rather than with a literal', () => {
    const a = validCase({ caseId: 'a', window: windowOf(0, 1000) });
    const b = validCase({ caseId: 'b', window: windowOf(800, 1800) });
    expect(readPairSimilarity(bundleOf([a, b])).overlappingWindows).toEqual([]);
    expect(
      readPairSimilarity(bundleOf([a, b]), { maxWindowIou: 0.1 }).overlappingWindows,
    ).toHaveLength(1);
  });

  it('declines a window it cannot parse rather than throwing', () => {
    // A gate never throws -- `runAllGates` calls it on every set, and a bundle that G1 would
    // reject must still produce a gate report rather than an exception.
    const a = validCase({ caseId: 'a', window: windowOf(0, 1000) });
    const b = validCase({ caseId: 'b', window: { start: 'yesterday', end: T0 } });
    const reading = readPairSimilarity(bundleOf([a, b]));
    expect(reading.skippedMalformedWindow).toBe(1);
    expect(reading.judgedWindows).toBe(0);
    expect(() => checkG5AntiPollution(bundleOf([a, b]))).not.toThrow();
  });

  it('reports both arms for one pair, because they answer two questions', () => {
    const a = validCase({ caseId: 'a', query: 'the cart service timed out', window: windowOf(0, 1000) });
    const b = validCase({ caseId: 'b', query: 'the cart service timed out', window: windowOf(50, 1050) });
    const codes = codesOf(bundleOf([a, b]));
    expect(codes).toContain('NEAR_DUPLICATE_QUERY');
    expect(codes).toContain('OVERLAPPING_WINDOW');
  });
});

describe('G5 · the pairwise reading in one sentence', () => {
  it('names the closest pair, the widest overlap and both thresholds', () => {
    const a = validCase({
      caseId: 'a',
      query: 'The checkout service became slow after the deploy. Find the root cause.',
      window: windowOf(0, 1000),
    });
    const b = validCase({
      caseId: 'b',
      query: 'A checkout service became slow after a deploy. Find the root cause.',
      window: windowOf(50, 1050),
    });
    expect(describePairSimilarity(readPairSimilarity(bundleOf([a, b])))).toBe(
      'pairwise similarity: 1 of 1 pair(s) share a system, and 1 carry task text on both sides; ' +
        'closest task text 1.00 (a <-> b) against a 0.90 threshold, most overlapping window 0.90 ' +
        '(a <-> b) against 0.50; 1 near-duplicate(s) and 1 overlapping window(s)',
    );
  });

  it('says that a set of one case offered no pair at all', () => {
    // "0 near-duplicates" and "no pair to compare" are different claims, and the second one is
    // the one a one-case set supports.
    expect(describePairSimilarity(readPairSimilarity(validBundle()))).toBe(
      'pairwise similarity: no pair to compare in a set of 1 case(s)',
    );
  });

  it('says which side of the comparison was missing when nothing could be read', () => {
    const a = validCase({ caseId: 'a', query: undefined, window: windowOf(0, 1000) });
    const b = validCase({ caseId: 'b', query: undefined, window: windowOf(3600, 4600) });
    expect(describePairSimilarity(readPairSimilarity(bundleOf([a, b])))).toBe(
      'pairwise similarity: 1 of 1 pair(s) share a system, and 0 carry task text on both sides; ' +
        'no pair carried task text on both sides against a 0.90 threshold, most overlapping ' +
        'window 0.00 (a <-> b) against 0.50; 0 near-duplicate(s) and 0 overlapping window(s)',
    );
  });

  it('names the other missing half when the windows are the unreadable side', () => {
    // The two nulls are independent, and a sentence that assumed they arrive together would
    // report a maximum of zero for a comparison it never made. This is the mirror of the test
    // above: task text present, windows unreadable.
    const a = validCase({ caseId: 'a', query: 'the cart service timed out', window: { start: 'x', end: 'y' } });
    const b = validCase({ caseId: 'b', query: 'the cart service timed out', window: { start: 'x', end: 'y' } });
    expect(describePairSimilarity(readPairSimilarity(bundleOf([a, b])))).toBe(
      'pairwise similarity: 1 of 1 pair(s) share a system, and 1 carry task text on both sides; ' +
        'closest task text 1.00 (a <-> b) against a 0.90 threshold, no pair had two readable ' +
        'windows against 0.50; 1 near-duplicate(s) and 0 overlapping window(s)',
    );
  });
});

describe('G5 · the shipped corpus, read rather than assumed', () => {
  const index = JSON.parse(readFileSync(resolve(CASES, 'index.json'), 'utf8')) as {
    cases: Array<{ case: string }>;
  };
  const corpus = index.cases.map(
    (entry) => JSON.parse(readFileSync(resolve(CASES, entry.case), 'utf8')) as FaultCase,
  );

  it('compares every pair the set contains', () => {
    const reading = readPairSimilarity(bundleOf(corpus));
    // 33 in v3.72 (32 in v3.71, 31 in v3.70), so 33 * 32 / 2 = 528 pairs. The formula is written in the comment
    // rather than derived in the assertion, because the number is the thing being pinned: a set that
    // lost a case would compare 496 pairs and this would say so.
    expect(reading.cases).toBe(33);
    expect(reading.pairs).toBe(528);
    expect(reading.skippedCrossSystem).toBe(0);
    expect(reading.skippedNoQuery).toBe(0);
    expect(reading.skippedMalformedWindow).toBe(0);
    expect(reading.judgedTaskText).toBe(528);
    expect(reading.judgedWindows).toBe(528);
  });

  it('finds no duplicate and no overlap, and publishes the margin to the thresholds', () => {
    // The numbers are 2026-11-08 measurements and they are asserted rather than described: a
    // corpus that drifts towards duplication moves the maximum first, and this test is what makes
    // that movement visible before the rule turns red. Two earlier figures were replaced by these:
    // `progress.md` recorded a maximum task-text Jaccard of 0.308, and the first probe written this
    // round used a shorter stop-word list and reported 0.2414. Neither can be reproduced by the
    // rule's own normalisation, so both are replaced by the figures that can be -- 0.25 over the
    // closest pair and 1/6 over the most overlapping one.
    const reading = readPairSimilarity(bundleOf(corpus));
    expect(reading.closestTaskText?.jaccard).toBeCloseTo(0.25, 6);
    expect(reading.mostOverlappingWindow?.iou).toBeCloseTo(1 / 6, 6);
    expect(reading.nearDuplicates).toEqual([]);
    expect(reading.overlappingWindows).toEqual([]);
    // The asymmetry worth holding: a rule that sits one per mille above the corpus is a rule that
    // fires on the next case. Both defaults are at least twice the corpus's own maximum.
    expect(reading.thresholds.taskTextJaccard).toBeGreaterThan(
      (reading.closestTaskText?.jaccard ?? 0) * 2,
    );
    expect(reading.thresholds.windowIou).toBeGreaterThan(
      (reading.mostOverlappingWindow?.iou ?? 0) * 2,
    );
  });

  it('leaves the whole corpus clean on both new arms', () => {
    const codes = codesOf(bundleOf(corpus));
    expect(codes).not.toContain('NEAR_DUPLICATE_QUERY');
    expect(codes).not.toContain('OVERLAPPING_WINDOW');
  });
});
