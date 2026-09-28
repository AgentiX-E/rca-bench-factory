/**
 * Why the `category` misses miss, measured rather than read.
 *
 * Finding 69 classified the eight recorded `category` misses one by one and
 * concluded that "a legal vocabulary member was chosen, so the failure is
 * *choosing* rather than *formatting*". That is a reading, not a measurement, and
 * it names no mechanism.
 *
 * This module is the mechanism, and it is narrow enough to be wrong.
 *
 * ## The observation
 *
 * Every missed incident contains a sentence that names a **different** category as
 * the thing that is *not* happening, and the model answers with that category:
 *
 * | sample                         | expected   | the counter-evidence sentence            | answered   |
 * |--------------------------------|------------|------------------------------------------|------------|
 * | `kafka-consumer-lag`           | middleware | "Broker-side throughput is **unchanged**" | code       |
 * | `redis-latency`                | middleware | "pool utilisation **is normal**"          | resource   |
 * | `database-connection-pool`     | middleware | "Postgres reports **no long-running**"    | resource   |
 * | `mysql-replica-lag`            | middleware | "Reads on the primary **are current**"    | resource   |
 * | `pod-kill`                     | runtime    | "memory was **well under the limit**"     | resource   |
 * | `memory-leak`                  | resource   | (release framing)                         | code       |
 * | `container-crash`              | runtime    | (native segfault framing)                 | dependency |
 * | `regex-backtracking`           | code       | (WAF-rule framing)                        | config     |
 *
 * The last three are reached by framing rather than by a phrase from this list,
 * which is why the predictor is **incomplete** and says so: it finds 5 of the 8.
 *
 * ## What is measured
 *
 * On the 19-sample golden dataset the phrase list predicts a category miss at
 * **5/6 precision and 5/8 recall**. Both denominators are printed by the report,
 * because a count of five is meaningless without them and both are small.
 *
 * ## What is excluded
 *
 * The obvious rival explanation is length: perhaps missed incidents are longer and
 * the phrase merely rides along. It is excluded by measurement. Samples carrying
 * the phrase average 365 characters and those without average 330 -- a 35-character
 * difference -- while a length threshold of 400 catches **1** of the 8 misses.
 * Length does not carry the signal; the phrase does.
 *
 * ## What this does not claim
 *
 * **Not causation.** With n=19 this is a correlate, and a correlate reported as a
 * cause is exactly the step finding 91 refused to take by hand when it declined to
 * call 39 lexically-similar misses "the same fault". The three-valued reading below
 * exists for the same reason the adjudication rule's does: `absent` is an
 * observation, and there has to be a value for "no text to observe".
 */

/**
 * The counter-evidence phrases, as a closed list.
 *
 * Closed rather than a regex, for the reason the adjudication rule's negation
 * prefixes are closed: a pattern loose enough to catch prose catches prose. Each
 * entry was observed in the corpus, and each is asserted individually in the test
 * suite -- an entry with no test is an entry that can be deleted silently.
 *
 * They are all negations of a fault being present: throughput *unchanged*, the pool
 * *normal*, no long-running query, reads *current*, memory *under* the limit, the
 * primary *healthy*, and the two that state normalcy rather than absence.
 */
export const COUNTER_EVIDENCE_PHRASES: readonly string[] = [
  'unchanged',
  'not the bottleneck',
  'no long-running',
  'well under the limit',
  'are current',
  'is healthy',
  'is normal',
  'was healthy',
  'no error rate',
  'no application',
];

/** The three-valued reading. Absence is an observation; the third value is not. */
export type CounterEvidenceVerdict =
  /** A phrase from the list appears in the text. The observation. */
  | 'counter-evidence-present'
  /** The text was read and no phrase appears. Also an observation. */
  | 'counter-evidence-absent'
  /** There is no text to read. Neither of the above, and not a failure. */
  | 'not-assessable';

/** One reading, carrying the evidence that produced it. */
export interface CounterEvidenceReading {
  verdict: CounterEvidenceVerdict;
  /**
   * The phrase that matched, or `null`.
   *
   * Non-null exactly when the verdict is `counter-evidence-present`. The phrase is
   * carried rather than a bare boolean because "a phrase matched" is not evidence;
   * "this phrase matched" is, and it can be checked by hand.
   */
  phrase: string | null;
  /** Convenience for the one thing most callers ask. Mirrors the verdict. */
  present: boolean;
}

/**
 * Read one incident text for counter-evidence.
 *
 * The empty and whitespace-only cases are `not-assessable` rather than `absent`.
 * That is the whole reason the third value exists: a missing input reported as a
 * clean reading is the failure mode finding 94 named when it insisted `undecided`
 * was not `different-fault`. A blank line is the same input as the empty string and
 * reads the same way.
 */
export function assessCounterEvidence(text: string): CounterEvidenceReading {
  if (text.trim() === '') {
    return { verdict: 'not-assessable', phrase: null, present: false };
  }
  const haystack = text.toLowerCase();
  // The first match in list order, so the basis is stable across runs rather than
  // dependent on which sentence happens to come first in the prose.
  const phrase = COUNTER_EVIDENCE_PHRASES.find((candidate) => haystack.includes(candidate)) ?? null;
  if (phrase === null) {
    return { verdict: 'counter-evidence-absent', phrase: null, present: false };
  }
  return { verdict: 'counter-evidence-present', phrase, present: true };
}

/** The report's inputs: one graded sample, with the outcome already decided. */
export interface GradedSample {
  sampleId: string;
  incidentText: string;
  /** Whether the model's `category` answer for this sample differed from expected. */
  missed: boolean;
}

/**
 * The figures, with both denominators.
 *
 * `precision` is stated as a fraction of the texts that carry the phrase and
 * `recall` as a fraction of the misses. Reporting either alone would let the
 * predictor look complete in one direction, and it is complete in neither.
 */
export interface CounterEvidenceReport {
  /** Samples read at all. */
  gradedTotal: number;
  /** Texts carrying a phrase. The precision denominator. */
  withPhrase: number;
  /** Misses reached by a phrase. The recall numerator. */
  missedWithPhrase: number;
  /** All misses. The recall denominator. */
  missedTotal: number;
  /** Of the texts carrying the phrase, the share that are misses. */
  precision: number;
  /** Of the misses, the share the phrase reaches. */
  recall: number;
  /** Misses the phrase does not reach. Printed so incompleteness is visible. */
  missedWithoutPhrase: number;
}

/**
 * Compute the report.
 *
 * A sample with no text is counted in `gradedTotal` and in neither `withPhrase` nor
 * the miss accounting -- it is not evidence either way, and counting it on one side
 * would move a figure on the strength of an input that was never read.
 */
export function counterEvidenceReport(
  samples: readonly GradedSample[],
): CounterEvidenceReport {
  let withPhrase = 0;
  let missedWithPhrase = 0;
  let missedTotal = 0;
  const graded = samples.filter((sample) => sample.incidentText.trim() !== '').length;

  for (const sample of samples) {
    const reading = assessCounterEvidence(sample.incidentText);
    if (reading.present) {
      withPhrase += 1;
      if (sample.missed) {
        missedWithPhrase += 1;
      }
    }
    if (sample.missed) {
      missedTotal += 1;
    }
  }

  return {
    gradedTotal: graded,
    withPhrase,
    missedWithPhrase,
    missedTotal,
    precision: withPhrase === 0 ? 0 : missedWithPhrase / withPhrase,
    recall: missedTotal === 0 ? 0 : missedWithPhrase / missedTotal,
    missedWithoutPhrase: missedTotal - missedWithPhrase,
  };
}

/** What the verdicts were, so a caller can report the third value's count. */
export interface CounterEvidenceCounts {
  present: number;
  absent: number;
  notAssessable: number;
}

/** Count the readings. The `notAssessable` count is printed alongside the others. */
export function countCounterEvidence(
  readings: readonly CounterEvidenceReading[],
): CounterEvidenceCounts {
  const counts: CounterEvidenceCounts = { present: 0, absent: 0, notAssessable: 0 };
  for (const reading of readings) {
    if (reading.verdict === 'counter-evidence-present') {
      counts.present += 1;
    } else if (reading.verdict === 'counter-evidence-absent') {
      counts.absent += 1;
    } else {
      counts.notAssessable += 1;
    }
  }
  return counts;
}
