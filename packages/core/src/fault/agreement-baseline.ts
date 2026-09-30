/**
 * What does the agreement reading say about components that are **known to be right**?
 *
 * Finding 99 measured that all seven recorded `category` misses name a component carrying
 * no term of the category they answered, and read that as the failure being in the
 * relation between the two fields. This module is the control that reading was missing,
 * and the control refutes it.
 *
 * The reading had no baseline, so `0 of 7` had nothing to be compared against. Run
 * against the dataset's **own** components -- the ground truth, which is right by
 * construction -- the same reading gives:
 *
 * ```
 * expected components supporting their category:  1 of 19
 * predicted components supporting their category: 0 of 7
 * ```
 *
 * A reading that fails almost every component known to be correct cannot have
 * distinguished anything when it failed the seven. **Finding 99's `7 of 7` is an
 * artifact of the vocabulary, not a measurement of the model.**
 *
 * ## Why, and this is the durable part
 *
 * `CATEGORY_TERMS` is the **classifier's** table. It maps a fault *slug* to category
 * terms, and it was built so `inferFaultCategory` can read slugs like
 * `middleware-redis-latency-cache`. A `component` is a **service name**
 * (`checkout-api`, `payment-gateway`, `billing-service`) or, when the model reaches for
 * something more specific, an infrastructure noun (`kubelet`, `WAF rule`, `native ffmpeg
 * binding`). Neither is a slug.
 *
 * Exactly one expected component in the dataset happens to contain its category's
 * vocabulary -- `session-cache` contains `cache` -- and that is the single agent that
 * makes the expected-side rate 1/19 rather than 0/19. The 1 is a coincidence of a service
 * being named after its mechanism, not evidence that agreement is expectable.
 *
 * The reading itself is not wrong and is not repaired here: it answers "does this
 * component carry this category's vocabulary", and it answers correctly. What was wrong
 * was the **inference** drawn from its output. That is why this module is the control
 * rather than a fix.
 *
 * ## The defence this control also refutes
 *
 * The natural rescue is "the finding was about the *answered* category, and the model
 * answered the wrong category, so of course the component does not support it". Measured
 * against the **expected** category instead, the seven predicted components give
 * **1 of 7** -- `middleware-redis-latency-cache` named `session Redis`, which does contain
 * `redis`. So even reading the misses charitably, 1 of 7 against an expected-side baseline
 * of 1 of 19 is not a contrast a claim can be built on.
 *
 * ## And the column finding 99 overtook
 *
 * Read against the **expected** category, finding 98 had already established these same
 * components are `absent` from the incident text 8 of 8. That is the measured column.
 * Finding 99 described the answered-category column as "the mechanism 98 could not reach";
 * measured, the answered-category column is the one that says nothing.
 */

import { CATEGORY_TERMS } from './category-terms.js';

/** One component with the category it is being read against. */
export interface BaselineSample {
  sampleId: string;
  category: string;
  component: string;
}

/** The reading, applied to one sample. */
export interface BaselineReading {
  /** The category's terms found in the component. Empty when it does not support it. */
  terms: string[];
  supports: boolean;
}

/**
 * Read one component against one category.
 *
 * This is deliberately the same term search `assessComponentAgreement` performs, exposed
 * here so the control can be stated as a corpus and so a test can assert the two agree
 * sample-by-sample. It is not a second implementation of the reading: if they ever
 * disagree, the control is measuring a different thing from the finding and both figures
 * are void. A test pins that.
 */
export function readBaselineSupport(input: {
  component: string;
  category: string;
}): BaselineReading {
  const { component, category } = input;
  if (component.trim() === '') {
    return { terms: [], supports: false };
  }

  const terms = CATEGORY_TERMS[category] ?? [];
  if (terms.length === 0) {
    return { terms: [], supports: false };
  }

  const lower = component.toLowerCase();
  const found = terms.filter((term) => lower.includes(term));
  return { terms: found, supports: found.length > 0 };
}

/** The corpus-level figures for one side of the comparison. */
export interface BaselineInventory {
  /** Samples that carry a component to read. The denominator. */
  graded: number;
  /** Components carrying at least one term of the category they are read against. */
  supporting: number;
  /** The ids of those components, so the figure is nameable rather than a bare count. */
  supportingIds: string[];
  /** Each component with the terms that made it support, or empty. */
  rows: { sampleId: string; category: string; component: string; terms: string[] }[];
  /** `supporting / graded`, or 0 when there is nothing to read. */
  supportShare: number;
}

/**
 * Read every sample and count the ones whose component supports its category.
 *
 * Samples with no component are excluded from `graded` rather than counted as
 * non-supporting, for the reason finding 94 established: a field that was not present was
 * not read, and letting an absent field push a figure is the partial-join defect finding
 * 92 records. `graded` counts what was actually read.
 */
export function buildBaselineInventory(samples: BaselineSample[]): BaselineInventory {
  const rows: BaselineInventory['rows'] = [];
  const supportingIds: string[] = [];
  let graded = 0;

  for (const sample of samples) {
    if (sample.component.trim() === '') continue;
    graded += 1;
    const reading = readBaselineSupport({
      component: sample.component,
      category: sample.category,
    });
    rows.push({
      sampleId: sample.sampleId,
      category: sample.category,
      component: sample.component,
      terms: reading.terms,
    });
    // `reading.supports`, not `reading.terms.length > 0`.
    //
    // The first version counted from `terms`, and that was a real defect rather than a style
    // preference: it made the corpus figure a function of a *proxy* for the verdict instead of
    // the verdict itself, so a change to the support rule that did not also change the term
    // list was invisible here. Injection AC -- "count every component as supporting" -- landed
    // exactly there and SURVIVED, and the survival is what found it. `terms` stays on the row
    // because the report needs to name the terms that made a component support; it is not the
    // decision.
    if (reading.supports) supportingIds.push(sample.sampleId);
  }

  return {
    graded,
    supporting: supportingIds.length,
    supportingIds,
    rows,
    supportShare: graded === 0 ? 0 : supportingIds.length / graded,
  };
}

/**
 * The comparison that finding 99 needed and did not run.
 *
 * Two rates and the question of whether their difference is anything. The finding's claim
 * is a *contrast* between the predicted side and the expected side, and reported as two
 * bare figures it cannot be checked.
 */
export interface AgreementContrast {
  expected: BaselineInventory;
  predicted: BaselineInventory;
  /** `expected.supportShare - predicted.supportShare`. */
  shareDelta: number;
  /**
   * Whether the contrast is **load-bearing** -- i.e. whether the expected side's rate is
   * high enough that the predicted side failing it means something.
   *
   * This is deliberately not `predicted.share < expected.share`. That comparison returns
   * `true` on the recorded data for an arithmetic reason rather than a statistical one:
   * the expected side is 1/19, so its true rate is indistinguishable from zero, and
   * `0/7 < 1/19` is the difference between two estimates of zero. Reporting that as
   * "the reading separates them" is how a floor gets mistaken for a signal -- the same
   * defect finding 95's N, 96's U and 99's Z each hit, arriving here as a comparison
   * instead of as a mutation.
   *
   * The first version of this module returned exactly that comparison, and the probe built
   * on it printed `separates: true` beside the sentence "the reading does NOT separate
   * them". Both were shipped to a build before the contradiction was read. The guard below
   * is what makes the two statements agree.
   */
  separates: boolean;
  /** The expected-side share below which the predicted side cannot be distinguished. */
  baselineFloor: number;
  /** Why `separates` has the value it has, in a sentence a report can print. */
  reason: string;
}

/**
 * The expected-side share below which a contrast is not load-bearing.
 *
 * A baseline that agrees on fewer than one sample in five is a baseline whose rate is
 * dominated by whatever accidents produce agreement -- here, a service happening to be
 * named after its mechanism. At 1/19 no failure rate on the other side is surprising:
 * a reading that fires on 18 of 19 correct components will fire on anything.
 *
 * 0.2 is a judgement, and it is stated rather than buried. It is not a significance test
 * and does not pretend to be one; it exists so that "the reading separates them" cannot be
 * printed on the strength of `0/7` against `1/19`. A real test needs a corpus whose
 * correct components agree at a rate well above it, and this corpus has none.
 */
export const BASELINE_FLOOR = 0.2;

/**
 * Build both sides and state whether the contrast is load-bearing.
 *
 * Returns `separates: false` on the recorded data, and says why, because the expected side
 * agrees on 1 of 19 -- below `BASELINE_FLOOR`. That is the finding.
 */
export function buildAgreementContrast(input: {
  expected: BaselineSample[];
  predicted: BaselineSample[];
}): AgreementContrast {
  const expected = buildBaselineInventory(input.expected);
  const predicted = buildBaselineInventory(input.predicted);
  const shareDelta = expected.supportShare - predicted.supportShare;
  const separates = expected.supportShare > BASELINE_FLOOR;

  const reason = separates
    ? `the expected side agrees at ${expected.supportShare.toFixed(4)}, above the ` +
      `floor of ${BASELINE_FLOOR}, so a lower rate on the predicted side would be a finding`
    : `the expected side agrees at only ${expected.supportShare.toFixed(4)} ` +
      `(${expected.supporting} of ${expected.graded}), at or below the floor of ` +
      `${BASELINE_FLOOR}, so its true rate is indistinguishable from zero and no failure ` +
      `rate on the predicted side can be distinguished from the same zero`;

  return { expected, predicted, shareDelta, separates, baselineFloor: BASELINE_FLOOR, reason };
}
