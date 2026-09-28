/**
 * Adjudicate a miss: is the model's answer the same fault at a different
 * altitude, or a genuinely different fault?
 *
 * ## Why this module exists
 *
 * Finding 91 read the 14 `type` misses and called every one of them "the same
 * fault at a different altitude". Finding 92 then established that the reading
 * was taken from the right run. Neither finding could turn that judgement into a
 * measurement, and finding 91 said so in its own words:
 *
 * > The 39 misses are *all* same-mechanism by inspection, but inspection is mine,
 * > and the adjudication has to be a rule over the recorded rows rather than a
 * > reading of them. Until that rule exists, "the labels are too fine" is a
 * > hypothesis with strong support, not a measurement.
 *
 * This module is that rule.
 *
 * ## What the rule can and cannot decide
 *
 * The question the rule is asked is *semantic* -- "is `kubelet-eviction` the same
 * fault as `pod-kill`?" -- and no function over two strings decides a semantic
 * question. A module that claimed to would be the most dangerous thing in this
 * repository, because it would look like evidence and be a guess.
 *
 * What is decidable, and what this module decides, is a **necessary condition**:
 *
 * > If two slugs are the same fault at different altitudes, they must share a
 * > token after normalisation, or one must be a morphological variant of the
 * > other.
 *
 * That is a *one-sided* test, and the direction is the whole design:
 *
 * - **`unrelated`** is a decision. The test failing is proof of difference, under
 *   the assumption that the vocabulary composes from shared roots -- which is the
 *   assumption the rest of the pipeline already makes, including the workflow's
 *   own `shares-token` arm.
 * - **`same-stem`** is *not* a decision. The test passing is consistent with the
 *   same fault at a different altitude and it is equally consistent with two
 *   different faults that happen to share a word (`network-loss` and
 *   `network-delay` share `network` and are different faults).
 *
 * So the module reports three values, and the third one is the honest one:
 * `different-fault` (proved), `same-fault-different-altitude` (adjudicated by the
 * caller, with the shared token named as the reason it is *permissible*), and
 * `undecided` (no shared token, but the morphological gap is not closed either --
 * see `hasMorphologicalAffinity`). Reporting `undecided` rather than folding it
 * into either side is the entire point; a binary verdict would manufacture the
 * measurement finding 91 was careful not to claim.
 *
 * ## Why not a synonym table
 *
 * `extraction-scoring.ts` refuses one, and its reason is quoted in finding 91:
 *
 * > deciding that `net` means `network` is a judgement, and `importer.ts`
 * > deliberately leaves that judgement to the H3 reviewer.
 *
 * This module respects that refusal and does not carry one either. It registers no
 * pair. What it does is narrower: it *detects* a shared morpheme, which is a
 * property of the strings, not a stored judgement about their meanings. A table
 * would have to be maintained as the dataset grows and would silently encode
 * whatever the author believed; stemming cannot.
 *
 * ## The cross-product this feeds
 *
 * The second thing finding 91 left unbuilt: 14 `type` misses is a count of
 * misses, not a count of samples that would become `strict` hits. `strict`
 * needs all three scored fields on one sample, so the question is per-sample. See
 * `sampleAdjudication`, which is the arithmetic, and `crossProduct`, which is the
 * cost.
 */

import type { MissDetailRow } from './miss-detail.js';
import type { ScoredField } from './extraction-scoring.js';

/**
 * Fold a slug to its searchable form.
 *
 * Case, separators and non-alphanumerics are removed, matching the normalisation
 * the scorer uses, so that the tokens compared here are the tokens the pipeline
 * compares. The difference from the scorer is that this keeps the token
 * *boundaries* instead of collapsing them into one string -- the scorer wants to
 * know "are these equal", this wants to know "what do they have in common".
 */
export function tokenize(slug: string): string[] {
  return slug
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .split('-')
    .filter((token) => token !== '');
}

/**
 * Morphemes that carry no distinguishing information.
 *
 * Deliberately tiny, and deliberately not a stopword list. Each entry is a word
 * that appears so often in fault slugs that sharing it says nothing:
 * `exhaustion`, `failure`, `error` and friends describe *that something went
 * wrong*, which every sample is about. A shared `the` or `and` would not occur
 * because the slugs are hyphenated identifiers and those are not in them.
 *
 * The list is short on purpose. Every entry added weakens the `unrelated`
 * verdict, and `unrelated` is the only verdict this module is allowed to be
 * confident about, so the bias is toward leaving words in.
 */
const UNINFORMATIVE = new Set([
  'a',
  'an',
  'the',
  'of',
  'to',
  'in',
  'on',
  'at',
  'by',
  'and',
  'or',
  'error',
  'errors',
  'failure',
  'failures',
  'issue',
  'issues',
]);

/** Tokens that carry information, i.e. all of them minus the uninformative set. */
function informativeTokens(slug: string): string[] {
  return tokenize(slug).filter((token) => !UNINFORMATIVE.has(token));
}

/**
 * The morpheme two tokens share, when it is a morpheme rather than a coincidence.
 *
 * This exists for the pairs that share no *whole* token but are the same word
 * inflected or elided -- `lag` / `lags`, `replica` / `replication`, `apply` /
 * `applier`.
 *
 * ## Two versions of this function were wrong, and both failures are informative
 *
 * **Suffix matching** was the first. It is the shape English inflection takes, so
 * it looked right, and a test caught it: `replica` and `replication` share no
 * suffix -- one is a *prefix* of the other -- so `replica-lag` /
 * `replication-apply-bottleneck` came back `different-fault`, contradicting the
 * reading. Suffix matching only finds inflections that extend the stem in a
 * suffix-sharing way, and misses the whole class where one token is a truncation
 * of the other.
 *
 * **Naive prefix matching** was the second. It found `replica`, and it also paired
 * `config` with `container` on `con`, `upstream` with nothing useful, and
 * generally any two identifiers that happen to open with the same three letters.
 * In a vocabulary of hyphenated identifiers, three characters is not evidence.
 *
 * The rule that survives both is a prefix **that either consumes one of the two
 * tokens entirely or is at least five characters**. The first clause is what makes
 * `replica` / `replication` work: `replica` is the whole of one token, so it is a
 * stem, not a coincidence, at any length. The second clause is what makes
 * `connection` / `concurrent` work if it ever arises, and what refuses `con`. Both
 * clauses are needed; either alone reintroduces one of the two failures.
 *
 * Five characters because that is where the false positives in this dataset stop:
 * `config`/`container` collide at three, `exhaust`/`exception` at four, and at
 * five the collisions are morphemes. The floor is measured against the 14 recorded
 * rows and the slugs they are built from rather than picked from theory, and the
 * two constructed tests below are what keep it honest in both directions.
 *
 * It still deliberately does **not** try to be a stemmer. A real stemmer is a
 * stored linguistic model, which is the synonym table by another name. This is a
 * string property with a stated false-positive rate on a known vocabulary.
 */
function sharesMorpheme(a: string, b: string): string | null {
  const limit = Math.min(a.length, b.length);
  for (let length = limit; length >= 3; length -= 1) {
    const prefix = a.slice(0, length);
    if (!b.startsWith(prefix)) {
      continue;
    }
    const consumesAToken = length === a.length || length === b.length;
    if (consumesAToken || length >= 5) {
      return prefix;
    }
  }
  return null;
}

/** How a miss was adjudicated, and on what grounds. */
export type Adjudication =
  /** Proved different: the two slugs share no informative morpheme. */
  | 'different-fault'
  /** Consistent with the same fault at another altitude, sharing `basis`. */
  | 'same-fault-different-altitude'
  /** Neither proved different nor adjudicated the same. */
  | 'undecided';

/** One adjudicated miss, with the evidence that produced the verdict. */
export interface AdjudicatedMiss {
  sampleId: string;
  field: ScoredField;
  expected: string;
  actual: string;
  verdict: Adjudication;
  /**
   * The shared morpheme, when there is one.
   *
   * Present for `same-fault-different-altitude` and for an `undecided` row whose
   * tokens are informative on both sides but do not overlap -- the caller needs to
   * tell "no shared token and both sides say something" from "one side is a bare
   * noun that happens to be uninformative".
   */
  basis: string | null;
}

/**
 * Adjudicate one miss.
 *
 * `actual` is `string | null` on the row because an omission is a different
 * finding from a wrong answer. An omission cannot be adjudicated: there is no
 * answer to compare, and calling it `different-fault` would report a declined
 * answer as a disagreement. It is `undecided` with no basis.
 */
export function adjudicateMiss(row: MissDetailRow): AdjudicatedMiss {
  const base = {
    sampleId: row.sampleId,
    field: row.field,
    expected: row.expected,
    actual: row.actual ?? '',
  };
  if (row.actual === null) {
    return { ...base, verdict: 'undecided', basis: null };
  }

  const expectedTokens = informativeTokens(row.expected);
  const actualTokens = informativeTokens(row.actual);
  const actualSet = new Set(actualTokens);

  const shared = expectedTokens.find((token) => actualSet.has(token));
  if (shared !== undefined) {
    return { ...base, verdict: 'same-fault-different-altitude', basis: shared };
  }

  // No whole token in common. Try the morphological test before declaring the
  // two unrelated -- `replica-lag` / `replication-apply-bottleneck` shares no
  // token (`lag` vs `bottleneck`) but `replica` / `replication` share `replica`.
  for (const expectedToken of expectedTokens) {
    for (const actualToken of actualTokens) {
      const morpheme = sharesMorpheme(expectedToken, actualToken);
      if (morpheme !== null) {
        return { ...base, verdict: 'same-fault-different-altitude', basis: morpheme };
      }
    }
  }

  // Nothing shared. If either side is empty after the uninformative filter, the
  // absence of a shared token is not evidence of a different fault -- it is
  // evidence that there was nothing to share.
  if (expectedTokens.length === 0 || actualTokens.length === 0) {
    return { ...base, verdict: 'undecided', basis: null };
  }
  return { ...base, verdict: 'different-fault', basis: null };
}

/** The adjudicated misses, in the order they were read. */
export function adjudicateAll(rows: readonly MissDetailRow[]): AdjudicatedMiss[] {
  return rows.map((row) => adjudicateMiss(row));
}

/** Tally of the three verdicts over a set of misses. */
export interface AdjudicationCounts {
  'different-fault': number;
  'same-fault-different-altitude': number;
  undecided: number;
  total: number;
}

/** Count the verdicts. */
export function countAdjudications(misses: readonly AdjudicatedMiss[]): AdjudicationCounts {
  const counts: AdjudicationCounts = {
    'different-fault': 0,
    'same-fault-different-altitude': 0,
    undecided: 0,
    total: misses.length,
  };
  for (const miss of misses) {
    counts[miss.verdict] += 1;
  }
  return counts;
}

/** One sample's misses, grouped, so the per-sample cost can be computed. */
export interface SampleAdjudication {
  sampleId: string;
  /** Every miss this sample produced, in field order. */
  misses: AdjudicatedMiss[];
  /**
   * True when at least one miss on this sample is `different-fault`.
   *
   * A sample with a proved-different miss cannot become a `strict` hit by
   * coarsening the ground truth, because the disagreement is not about altitude.
   * A sample whose misses are all same-altitude or undecided is a *candidate* --
   * and the word candidate is load-bearing, because undecided is not a hit.
   */
  recoverable: boolean;
  /** How many fields this sample was scored on and got right plus missed. */
  missCount: number;
}

/**
 * Group misses by sample and mark the ones coarsening could plausibly recover.
 *
 * `recoverable` is `true` when no miss on the sample is `different-fault`. It is
 * **not** a prediction that the sample would score `strict` after relabelling:
 * relabelling changes what the model is compared against, and this function has
 * no model in it. It is the upper bound on that prediction, and the upper bound is
 * the thing worth computing first because it decides whether the relabelling
 * project is worth starting at all.
 */
export function sampleAdjudication(
  misses: readonly AdjudicatedMiss[],
): SampleAdjudication[] {
  const bySample = new Map<string, AdjudicatedMiss[]>();
  for (const miss of misses) {
    const bucket = bySample.get(miss.sampleId);
    if (bucket === undefined) {
      bySample.set(miss.sampleId, [miss]);
    } else {
      bucket.push(miss);
    }
  }
  return [...bySample.entries()].map(([sampleId, sampleMisses]) => ({
    sampleId,
    misses: sampleMisses,
    recoverable: !sampleMisses.some((miss) => miss.verdict === 'different-fault'),
    missCount: sampleMisses.length,
  }));
}

/** The per-field arithmetic the cross-product question needs. */
export interface CrossProduct {
  /**
   * Samples that missed at least one field and would not be blocked by a
   * proved-different disagreement.
   */
  recoverableSamples: number;
  /** Samples with at least one proved-different disagreement. */
  blockedSamples: number;
  /**
   * The field that limits `strict` first, and its hit count.
   *
   * `strict` requires every scored field on a sample, so the binding constraint is
   * the *lowest* per-field hit count, not the sum. Finding 91 named `category` at
   * 11/19 as the independent cap; this is the general form of that observation.
   */
  binding: { field: ScoredField; hits: number; total: number } | null;
  /** Per-field hits, for the table. */
  perField: Record<ScoredField, { hits: number; total: number }>;
}

/**
 * Compute the cross-product from per-field hit counts and the adjudication.
 *
 * The two inputs are separate because they answer different questions. The counts
 * are about how many samples each field got right; the adjudication is about
 * whether the misses are altitude disagreements. `strict` needs both -- the
 * lowest field count caps it, and a proved-different miss means that sample is
 * not recoverable no matter what the counts say.
 *
 * `total` is the graded sample count. A field with a different total (because the
 * sample did not state it) is normalised by taking the *rate*'s denominator as
 * given and reporting it, rather than silently averaging rates with different
 * denominators -- the mistake `extraction-scoring.ts` records in its own note on
 * empty cells.
 */
export function crossProduct(
  perField: Record<ScoredField, { hits: number; total: number }>,
  samples: readonly SampleAdjudication[],
): CrossProduct {
  const blocked = samples.filter((sample) => !sample.recoverable).length;
  const fields = Object.keys(perField) as ScoredField[];
  let binding: CrossProduct['binding'] = null;
  for (const field of fields) {
    const entry = perField[field];
    if (entry.total === 0) {
      continue;
    }
    if (binding === null || entry.hits < binding.hits) {
      binding = { field, hits: entry.hits, total: entry.total };
    }
  }
  return {
    recoverableSamples: samples.length - blocked,
    blockedSamples: blocked,
    binding,
    perField,
  };
}
