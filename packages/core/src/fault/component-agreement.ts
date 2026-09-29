/**
 * Is the category an answer emitted derivable from the component that same answer named?
 *
 * Finding 98 measured that the recorded `category` misses were answered with a category
 * the **incident text** does not carry. That is a statement about the dataset's input,
 * and on its own it is not yet a statement about the model: a model that read the text
 * and named a mechanism the text supports, then mislabelled the category, would produce
 * the same figure.
 *
 * The `component` field removes that ambiguity, because it is the model's **own** output.
 * A `category` and a `component` are emitted from the same text, by the same call, and if
 * the category were read off the mechanism the model itself identified then the answered
 * category's vocabulary would appear in the component it named.
 *
 * Measured over the seven recorded `category` misses that carry a `component` row:
 *
 * | sample                                  | answered   | component the model named             |
 * |-----------------------------------------|------------|---------------------------------------|
 * | `resource-memory-leak-recommendation`   | code       | "recommendation service session cache"|
 * | `runtime-pod-kill-user-profile`         | resource   | "kubelet"                             |
 * | `runtime-container-crash-loop-media`    | dependency | "native ffmpeg binding"               |
 * | `middleware-redis-latency-cache`        | resource   | "session Redis"                       |
 * | `middleware-database-connection-pool`   | resource   | "billing service connection pool"     |
 * | `code-slow-regex-api-gateway`           | config     | "WAF rule"                            |
 * | `middleware-mysql-replica-lag-analytics`| resource   | "replica applier thread"              |
 *
 * **7 of 7 carry no term of the answered category.**
 *
 * ## Why this is the mechanism finding 98 could not reach
 *
 * Finding 98's reading says "the text does not carry this category". This one says "the
 * **answer** does not carry this category" -- and it needs nothing but the model's own
 * output to say it. `kubelet` is the right component for `pod-kill`; `session Redis` is
 * the right component for `redis-latency`. The model identifies the mechanism correctly
 * and then emits a category that is not derivable from it.
 *
 * So the failure is not that the model cannot read the incident. It is that the category
 * is produced **independently of the mechanism the model itself named** -- which points
 * the fix at the *relationship between the two fields* rather than at comprehension.
 *
 * ## The counter-case, which is why this is not the whole story
 *
 * `middleware-kafka-consumer-lag` is the eighth miss and it has **no `component` row**,
 * because the model answered the component **correctly**. It named the mechanism right and
 * the category wrong. So a category is not always derivable from a component, and this
 * reading cannot be inverted into "the component determines the category". The eighth row
 * is excluded from the denominator rather than counted as a pass, and it is named in the
 * report for finding 98's reason: a partial join reported as a total is how a confident
 * percentage gets built out of nothing.
 *
 * ## What this does not claim
 *
 * **Not that the model misnames components.** In every one of the seven the component is
 * the mechanism the incident describes. It is the category that is unsupported.
 *
 * **Not causation.** Seven rows, and the co-occurrence is measured rather than explained.
 *
 * **Not that `component` is a good key.** It is a free-text field with no vocabulary, so
 * this reading is a term search and not a lookup -- which is why it can only ever report
 * `disagrees` (no term found) and never `mislabels`, because there is no table to violate.
 */

import { CATEGORY_TERMS } from './category-terms.js';

/** What an answer's category amounts to, read against its own component. */
export type AgreementVerdict = 'agrees' | 'disagrees' | 'not-assessable';

/** The reading, with the terms that produced it. */
export interface AgreementReading {
  verdict: AgreementVerdict;
  /** The answered category's terms found in the component. Empty when `disagrees`. */
  terms: string[];
}

/**
 * Read whether `category` is supported by the `component` from the same answer.
 *
 * Term search rather than a membership test, because `component` has no vocabulary. That
 * bounds what this can report: `disagrees` means "none of this category's terms appear",
 * which is a positive finding, while the absence of a `disagrees` never proves the
 * category is right -- a component could contain a term by coincidence.
 *
 * `not-assessable` is the third value, for the reason finding 94 established and findings
 * 96 and 98 repeat: an answer with no component was not read, and counting it as agreeing
 * would let a missing field improve the figure. `middleware-kafka-consumer-lag` is the
 * real instance -- it has no `component` row because it was answered correctly there -- and
 * it must not be counted either way.
 */
export function assessComponentAgreement(input: {
  component: string;
  category: string;
}): AgreementReading {
  const { component, category } = input;
  if (component.trim() === '') {
    return { verdict: 'not-assessable', terms: [] };
  }

  const terms = CATEGORY_TERMS[category] ?? [];
  if (terms.length === 0) {
    // An unrecognised category is not an agreement. A vocabulary with no row for the
    // answer cannot support it, and returning `agrees` here would make every unknown
    // category look correct -- finding 98's unknown-category branch, with the opposite
    // verdict, for the same reason.
    return { verdict: 'disagrees', terms: [] };
  }

  const lower = component.toLowerCase();
  const found = terms.filter((term) => lower.includes(term));
  return found.length > 0
    ? { verdict: 'agrees', terms: found }
    : { verdict: 'disagrees', terms: [] };
}

/** One recorded miss, as the agreement reading wants it. */
export interface AgreementSample {
  sampleId: string;
  category: string;
  /** Absent when the run recorded no `component` row for this sample. */
  component: string | null;
}

/** The corpus-level figures. */
export interface AgreementInventory {
  /** Samples with a component to read. The denominator. */
  graded: number;
  agrees: number;
  disagrees: number;
  /** Samples with no component row, named rather than dropped. */
  notAssessable: number;
  unassessableIds: string[];
  disagreeShare: number;
}

/**
 * Read every sample and partition it.
 *
 * Samples with no component are counted in `notAssessable` and excluded from `graded`, and
 * their ids are returned so a report can name them. That is the difference between "the
 * denominator is 7 because one row was not recorded" and "the denominator is 8 and one of
 * them passed": the second is the partial-join defect finding 92 records.
 *
 * The share is zero rather than `NaN` when nothing is graded, the guard
 * `counterEvidenceReport` and `buildDenialInventory` both carry, because a `NaN` in a
 * report compares false against every threshold a gate might use.
 */
export function buildAgreementInventory(
  samples: readonly AgreementSample[],
): AgreementInventory {
  let agrees = 0;
  let disagrees = 0;
  const unassessableIds: string[] = [];

  for (const sample of samples) {
    if (sample.component === null) {
      unassessableIds.push(sample.sampleId);
      continue;
    }
    const reading = assessComponentAgreement({
      component: sample.component,
      category: sample.category,
    });
    if (reading.verdict === 'agrees') agrees += 1;
    else if (reading.verdict === 'disagrees') disagrees += 1;
    else unassessableIds.push(sample.sampleId);
  }

  const graded = agrees + disagrees;
  return {
    graded,
    agrees,
    disagrees,
    notAssessable: unassessableIds.length,
    unassessableIds,
    disagreeShare: graded === 0 ? 0 : disagrees / graded,
  };
}
