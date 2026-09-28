import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  COUNTER_EVIDENCE_PHRASES,
  assessCounterEvidence,
  countCounterEvidence,
  counterEvidenceReport,
  type CounterEvidenceReading,
} from '../../src/fault/miss-distractor.js';
import { parseMissDetail } from '../../src/fault/miss-detail.js';

/**
 * The `category` misses, and the counter-evidence sentence they follow.
 *
 * Finding 69 read the eight recorded `category` misses by eye and concluded that
 * "a legal vocabulary member was chosen, so the failure is *choosing* rather than
 * *formatting*". That is an unfalsified reading. This module is the measurement.
 *
 * The claim under test is narrow: **every missed incident contains a sentence
 * naming a different category as the thing that is not happening, and the model
 * follows it.** The incident text is the variable; the miss is the outcome.
 *
 * Two properties matter more than the counts and both are asserted below. First,
 * the predictor is *incomplete* -- it reaches 5 of the 8 misses -- and a report
 * that rounded that to "all eight" would be the over-claim finding 91 refused to
 * make by hand. Second, the obvious confound is text length, and it is excluded
 * by measurement rather than by argument.
 */

const HERE = dirname(fileURLToPath(import.meta.url));

interface GoldenSample {
  id: string;
  incidentText: string;
  expected: { type: string; category: string };
}

function goldenSamples(): GoldenSample[] {
  // Four levels up: this file is at `packages/core/test/fault/`, and the dataset is
  // at the repository root. `validity.test.ts` sits one level higher and needs only
  // three, which is the kind of difference that reads as a typo and fails as an
  // ENOENT.
  const path = resolve(
    HERE,
    '..',
    '..',
    '..',
    '..',
    'golden-master',
    'fault-extraction',
    'samples.json',
  );
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as { samples?: unknown };
  if (!Array.isArray(parsed.samples)) {
    throw new Error('golden-master/fault-extraction/samples.json carries no samples array');
  }
  return parsed.samples as GoldenSample[];
}

/** The eight `category` misses of run `567118aea`, read from the annotation. */
function categoryMisses(): { sampleId: string; expected: string; actual: string }[] {
  const body = readFileSync(
    resolve(HERE, '..', 'fixtures', 'miss-detail-567118aea.txt'),
    'utf8',
  );
  return parseMissDetail(body)
    .filter((row) => row.field === 'category')
    .map((row) => ({ sampleId: row.sampleId, expected: row.expected, actual: row.actual ?? '' }));
}

describe('the counter-evidence phrase list', () => {
  it('is closed and non-empty', () => {
    // A list is what is shipped rather than a regex over prose, for the same
    // reason the morpheme rule's negation prefixes are closed: a pattern loose
    // enough to catch prose catches prose.
    expect(COUNTER_EVIDENCE_PHRASES.length).toBeGreaterThan(0);
    expect(new Set(COUNTER_EVIDENCE_PHRASES).size).toBe(COUNTER_EVIDENCE_PHRASES.length);
  });

  it.each(COUNTER_EVIDENCE_PHRASES)('matches %s case-insensitively', (phrase) => {
    // Each entry is asserted individually. An entry with no test is an entry that
    // can be deleted silently, and the whole point of a closed list is that every
    // member is load-bearing.
    const reading = assessCounterEvidence(`Some preamble. ${phrase.toUpperCase()} here.`);
    expect(reading.present).toBe(true);
    expect(reading.phrase).toBe(phrase);
  });

  it('reports the phrase it matched, not merely that one matched', () => {
    // The basis is what makes the observation checkable. "A phrase matched" is
    // not evidence; "this phrase matched, here" is.
    const reading = assessCounterEvidence('Broker-side throughput is unchanged and the topic has spare partitions.');
    expect(reading.phrase).toBe('unchanged');
  });
});

describe('the reading is three-valued, and the third value is reachable', () => {
  it('reports absence when there is text and no phrase', () => {
    const reading = assessCounterEvidence('CPU saturated at the limit for eleven minutes.');
    expect(reading.verdict).toBe('counter-evidence-absent');
    expect(reading.phrase).toBeNull();
  });

  it('reports not-assessable when there is no text at all', () => {
    // The distinction that matters. Absence is an observation about a text;
    // not-assessable is the statement that there is no text to observe. Folding
    // the second into the first would report a missing input as a clean reading,
    // which is the failure mode finding 94 named for `undecided`.
    const reading = assessCounterEvidence('');
    expect(reading.verdict).toBe('not-assessable');
    expect(reading.phrase).toBeNull();
  });

  it('treats whitespace-only text as not-assessable, not as absent', () => {
    // A blank line is not a text that happens to lack the phrase. It is the same
    // input as the empty string and must read the same way.
    expect(assessCounterEvidence('   \n\t ').verdict).toBe('not-assessable');
  });

  it('never reports absence for a text it could not read', () => {
    for (const text of ['', ' ', '\n']) {
      expect(assessCounterEvidence(text).verdict).not.toBe('counter-evidence-absent');
    }
  });
});

describe('the misses follow counter-evidence, and the figure is stated with its bases', () => {
  const misses = categoryMisses();
  const byId = new Map(goldenSamples().map((s) => [s.id, s]));

  it('reads all eight recorded category misses', () => {
    // A guard on the fixture rather than on the module: if the annotation moves,
    // every figure below changes and the run has to say so.
    expect(misses.length).toBe(8);
  });

  it('resolves every missed sample id in the golden dataset', () => {
    // The expected side is read off the annotation; this proves it is not a
    // transcription artefact by resolving the id against the dataset's own
    // category. Eight of eight, so the join is exact.
    const unresolved = misses.filter((m) => byId.get(m.sampleId) === undefined);
    expect(unresolved, `unresolved ids: ${unresolved.map((m) => m.sampleId).join(', ')}`).toEqual([]);
    const disagreeing = misses.filter((m) => byId.get(m.sampleId)!.expected.category !== m.expected);
    expect(disagreeing, `annotation and dataset disagree: ${disagreeing.map((m) => m.sampleId).join(', ')}`).toEqual([]);
  });

  it('finds counter-evidence in five of the eight', () => {
    const readings = misses.map((m) => assessCounterEvidence(byId.get(m.sampleId)!.incidentText));
    const present = readings.filter((r) => r.verdict === 'counter-evidence-present');
    // Asserted as a number because it is the measured figure, and a change to it
    // is a real change to the finding rather than a refactor.
    expect(present.length).toBe(5);
  });

  it('states precision and recall with both denominators named', () => {
    const report = counterEvidenceReport(
      goldenSamples().map((s) => ({
        sampleId: s.id,
        incidentText: s.incidentText,
        missed: misses.some((m) => m.sampleId === s.id),
      })),
    );
    // 5 of the 6 texts carrying the phrase are misses; 5 of the 8 misses carry it.
    expect(report.withPhrase).toBe(6);
    expect(report.missedWithPhrase).toBe(5);
    expect(report.missedTotal).toBe(8);
    expect(report.gradedTotal).toBe(19);
    expect(report.precision).toBeCloseTo(5 / 6, 10);
    expect(report.recall).toBeCloseTo(5 / 8, 10);
  });

  it('does not report the predictor as complete', () => {
    // The honest part. Three of the eight misses are not reached, and a report
    // that said "eight of eight" would be an over-claim.
    const report = counterEvidenceReport(
      goldenSamples().map((s) => ({
        sampleId: s.id,
        incidentText: s.incidentText,
        missed: misses.some((m) => m.sampleId === s.id),
      })),
    );
    expect(report.recall).toBeLessThan(1);
    expect(report.missedTotal - report.missedWithPhrase).toBe(3);
  });
});

describe('the text-length confound is excluded by measurement, not by argument', () => {
  const misses = categoryMisses();
  const samples = goldenSamples();

  it('does not separate the classes by length', () => {
    // The obvious rival explanation is that missed incidents are simply longer and
    // the phrase rides along. Measured: the two groups' mean lengths differ by 35
    // characters, and a length threshold is a far worse predictor than the phrase.
    const withPhrase = samples.filter((s) => assessCounterEvidence(s.incidentText).present);
    const withoutPhrase = samples.filter((s) => !assessCounterEvidence(s.incidentText).present);
    const mean = (list: GoldenSample[]) =>
      list.reduce((sum, s) => sum + s.incidentText.length, 0) / list.length;
    expect(Math.abs(mean(withPhrase) - mean(withoutPhrase))).toBeLessThan(100);
  });

  it('is beaten by the phrase as a predictor', () => {
    // A length threshold tuned to the set catches one of the eight misses. If the
    // phrase were merely tracking length, its recall would be comparable.
    const threshold = 400;
    const byLength = misses.filter((m) => {
      const s = samples.find((x) => x.id === m.sampleId)!;
      return s.incidentText.length >= threshold;
    });
    expect(byLength.length).toBe(1);
  });
});

describe('the reading is a correlate, and the type says so', () => {
  it('exposes a phrase only when one matched', () => {
    // `phrase` is the evidence, so it is non-null exactly when the observation is
    // positive. A reading that carried a phrase and reported absence would be
    // self-contradictory.
    const positive: CounterEvidenceReading = assessCounterEvidence('the primary is healthy');
    expect(positive.present).toBe(true);
    expect(positive.phrase).not.toBeNull();
    const negative = assessCounterEvidence('nothing to see here');
    expect(negative.present).toBe(false);
    expect(negative.phrase).toBeNull();
  });
});

describe('the three values are counted, not collapsed', () => {
  it('counts each verdict into its own bucket', () => {
    // The counter exists so the third value has a number attached to it. If it
    // folded `not-assessable` into `absent` the count would look cleaner and the
    // observation would be lost -- which is precisely the mutation U guards.
    const counts = countCounterEvidence([
      assessCounterEvidence('the primary is healthy'),
      assessCounterEvidence('no error rate degradation seen'),
      assessCounterEvidence('nothing to see here'),
      assessCounterEvidence('still nothing here'),
      assessCounterEvidence(''),
      assessCounterEvidence('   \n\t '),
    ]);
    expect(counts).toEqual({ present: 2, absent: 2, notAssessable: 2 });
  });

  it('returns zeros for an empty reading list', () => {
    // The degenerate input. A counter that read `readings[0].verdict` to seed
    // itself would throw here; one that starts from zeros returns zeros, which is
    // the honest answer for "no readings were taken".
    expect(countCounterEvidence([])).toEqual({ present: 0, absent: 0, notAssessable: 0 });
  });

  it('agrees with the report on the same corpus', () => {
    // Two functions, one corpus, and the figures must reconcile. `counts.present`
    // counts readings and `withPhrase` counts samples that carry a phrase; on a
    // corpus with no empty text these are the same number, and this asserts the
    // two paths to it do not drift.
    const samples = goldenSamples();
    const readings = samples.map((s) => assessCounterEvidence(s.incidentText));
    const counts = countCounterEvidence(readings);
    const report = counterEvidenceReport(
      samples.map((s) => ({ incidentText: s.incidentText, missed: true })),
    );
    expect(counts.present).toBe(report.withPhrase);
    expect(counts.present + counts.absent + counts.notAssessable).toBe(samples.length);
  });
});

describe('an empty denominator is a zero, not a NaN', () => {
  it('reports zero precision when no sample carries a phrase', () => {
    // The corpus where nothing is positive. Division by a zero denominator would
    // put `NaN` into a report, and `NaN` compares false against every threshold a
    // gate might use -- so a gate reading `precision >= 0.5` would fail open or
    // closed depending on the comparison, and either way silently. Zero is the
    // stated answer for "there was nothing to be precise about".
    const report = counterEvidenceReport([
      { incidentText: 'nothing to see here', missed: true },
      { incidentText: 'still nothing here', missed: false },
    ]);
    expect(report.withPhrase).toBe(0);
    expect(report.precision).toBe(0);
    expect(Number.isNaN(report.precision)).toBe(false);
  });

  it('reports zero recall when no sample was missed', () => {
    // The complementary corpus: a phrase is present, but nothing missed, so the
    // recall denominator is zero. Same reasoning as precision above, and the same
    // reason both guards exist.
    const report = counterEvidenceReport([
      { incidentText: 'the primary is healthy', missed: false },
      { incidentText: 'no error rate degradation', missed: false },
    ]);
    expect(report.withPhrase).toBe(2);
    expect(report.missedTotal).toBe(0);
    expect(report.recall).toBe(0);
    expect(Number.isNaN(report.recall)).toBe(false);
  });

  it('leaves the miss accounting at zero when the corpus is empty', () => {
    // The fully degenerate input. Every figure is zero and no guard has fired to
    // produce a NaN, which is the property the two tests above establish from
    // either side.
    const report = counterEvidenceReport([]);
    expect(report).toEqual({
      gradedTotal: 0,
      withPhrase: 0,
      missedWithPhrase: 0,
      missedTotal: 0,
      precision: 0,
      recall: 0,
      missedWithoutPhrase: 0,
    });
  });
});
