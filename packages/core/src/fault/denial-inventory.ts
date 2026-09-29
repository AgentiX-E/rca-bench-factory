/**
 * Is the category the model answered present in the text, or only denied by it?
 *
 * Finding 96 measured that the recorded `category` misses follow a
 * counter-evidence sentence, and closed with an explicit gap: whether writing
 * such a sentence and then grading a category is a **well-posed task** is a
 * labelling question, and it was not answered there.
 *
 * This module answers it, from the dataset side, and it does not modify the
 * dataset.
 *
 * ## The standard being measured against
 *
 * `golden-master/fault-extraction/samples.json` states its own authoring rule:
 *
 * > **note**: "Each incidentText is written to sound like a real support ticket or
 * > post-mortem while naming exactly one fault, so the expected record is
 * > **decidable from the text alone**."
 * >
 * > **authoringRule**: "The expected.type must be **derivable from the incident
 * > text** by a careful human reader. A sample whose answer needs context the text
 * > does not carry is a bad sample, not a hard one."
 *
 * Those are the criteria this reading holds samples to.
 *
 * ## The observation, and the correction that produced it
 *
 * The expected form of this finding was "the text names the answered category only
 * to deny it". **Measured, that is false in four of five cases**, and the first
 * draft of this module asserted it and was caught by its own test.
 *
 * What is true is narrower and is what the reading now reports:
 *
 * | sample                          | answered | does the text mention the answered category? |
 * |---------------------------------|----------|--------------------------------------------|
 * | `database-connection-pool`      | resource | **no -- no term appears at all**            |
 * | `redis-latency`                 | resource | **no** -- the denial is about the *client pool* |
 * | `mysql-replica-lag`             | resource | **no** -- it says the primary "is healthy"  |
 * | `pod-kill`                      | resource | `memory`, under "**well under the limit**"  |
 * | `kafka-consumer-lag`            | code     | **no** -- the denial is about *broker throughput* |
 *
 * **In four of five the answered category has no term in the text whatsoever**,
 * and in the fifth the only term sits inside a denial. So the model is not choosing
 * among hypotheses the text raises. It is producing a category the text does not
 * support -- which is a stronger statement than the one I set out to make, and it
 * required the measurement to correct me.
 *
 * That correction is the reason this module exists as code rather than as a
 * paragraph: the claim I would have written by hand is wrong, and it is wrong in
 * the direction of being *too tidy*.
 *
 * ## What keeps this from being trivial
 *
 * If any denial predicted a miss the reading would be worthless, and the control is
 * in the dataset: `resource-cpu-saturation-checkout` is the only sample that both
 * carries a denial and was answered correctly:
 *
 * > "**The load generator was unchanged** from the previous week."
 *
 * Its denial denies a non-category, and the sample is graded `also-asserted` rather
 * than `denied-only`, so the reading does not simply flag every denial.
 *
 * ## What this does not claim
 *
 * **Not that the dataset is wrong.** This reports a criterion. Whether the
 * criterion should change is a separate decision with its own regression surface.
 * No sample text is edited.
 *
 * **Not that the model is right.** The model's answer is still wrong. The finding is
 * about what the text does and does not carry.
 *
 * **Not a complete account.** Measured over the five reached misses. The three
 * misses finding 96's predictor does not reach are not claimed.
 *
 * **Not causation.** With n=19 this is a structural observation recorded with both
 * denominators.
 */

/**
 * The denial markers, as a closed list.
 *
 * Closed rather than a regex, for the reason `NEGATION_PREFIXES` and
 * `COUNTER_EVIDENCE_PHRASES` are closed: a pattern loose enough to catch prose
 * catches prose. Each entry was observed in the corpus.
 *
 * These are the words that turn the sentence containing them into a denial. They
 * are deliberately *not* the finding-96 phrase list: that list detects
 * counter-evidence, while this one detects the grammatical shape of a negation, and
 * conflating the two would make the control fail -- the correct carrier says
 * "unchanged", which is a finding-96 phrase, and its subject is not a category.
 */
export const DENIAL_MARKERS = [
  'no ',
  'not ',
  'never ',
  'unchanged',
  'normal',
  'healthy',
  'current',
  'well under',
  'absent',
  'zero ',
] as const;

/** What a category's textual presence amounts to. */
export type DenialVerdict =
  | 'denied-only'
  | 'also-asserted'
  | 'absent'
  | 'not-assessable';

/** The reading, with the markers that produced it. */
export interface DenialReading {
  verdict: DenialVerdict;
  markers: string[];
}

/**
 * The category keyword rows, shared with the agreement reading.
 *
 * They moved to `category-terms.ts` when `component-agreement.ts` needed the same table,
 * and the move is the point: two readings each carrying their own copy of the vocabulary
 * could disagree about what a word means, and the disagreement would look like a
 * difference between the *readings*. One table, two readers.
 *
 * The duplication with `fault/collector.ts` is still deliberate -- see `category-terms.ts`
 * for why the readings must be able to disagree with the classifier -- and still checked
 * by a test that requires the two tables to agree on every category they share.
 */
export { CATEGORY_TERMS } from './category-terms.js';
import { CATEGORY_TERMS } from './category-terms.js';

/** Split on sentence and clause boundaries, so a denial is scoped to its clause. */
function clauses(text: string): string[] {
  return text
    .split(/(?<=[.!?;])\s+/)
    .flatMap((sentence) => sentence.split(/,\s+/))
    .map((part) => part.trim())
    .filter((part) => part !== '');
}

/**
 * Read whether `category` is asserted or only denied in `text`.
 *
 * Scoped per clause rather than per document. A document-level test would call
 * every sample `also-asserted` as soon as the category appeared anywhere outside a
 * denial, including in an unrelated clause -- and the five reached misses all
 * discuss the denied category in one clause and the real cause in another, so a
 * document-level reading would find nothing.
 */
export function assessCategoryDenial(input: { text: string; category: string }): DenialReading {
  const { text, category } = input;
  if (text.trim() === '') {
    return { verdict: 'not-assessable', markers: [] };
  }

  const terms = CATEGORY_TERMS[category] ?? [];
  const lower = text.toLowerCase();
  if (terms.length === 0 || !terms.some((term) => lower.includes(term))) {
    return { verdict: 'absent', markers: [] };
  }

  const markers: string[] = [];
  let affirmative = false;

  for (const clause of clauses(text)) {
    const low = clause.toLowerCase();
    if (!terms.some((term) => low.includes(term))) continue;
    const found = DENIAL_MARKERS.filter((marker) => low.includes(marker));
    if (found.length > 0) {
      markers.push(...found);
    } else {
      affirmative = true;
    }
  }

  if (affirmative) {
    return { verdict: 'also-asserted', markers };
  }
  return { verdict: 'denied-only', markers };
}

/** One sample, as the inventory reads it. */
export interface InventorySample {
  sampleId: string;
  text: string;
  category: string;
}

/** The corpus-level figures. */
export interface DenialInventory {
  graded: number;
  deniedOnly: number;
  alsoAsserted: number;
  absent: number;
  notAssessable: number;
  deniedOnlyShare: number;
}

/**
 * Read every sample and partition it.
 *
 * A sample with no text is counted in `notAssessable` and excluded from `graded`,
 * so a blank input cannot move the share. The share is zero rather than `NaN` when
 * nothing is graded -- a `NaN` in a report compares false against every threshold a
 * gate might use, which is the guard `counterEvidenceReport` carries for the same
 * reason.
 */
export function buildDenialInventory(samples: readonly InventorySample[]): DenialInventory {
  let deniedOnly = 0;
  let alsoAsserted = 0;
  let absent = 0;
  let notAssessable = 0;

  for (const sample of samples) {
    const reading = assessCategoryDenial({ text: sample.text, category: sample.category });
    if (reading.verdict === 'denied-only') deniedOnly += 1;
    else if (reading.verdict === 'also-asserted') alsoAsserted += 1;
    else if (reading.verdict === 'absent') absent += 1;
    else notAssessable += 1;
  }

  const graded = deniedOnly + alsoAsserted + absent;
  return {
    graded,
    deniedOnly,
    alsoAsserted,
    absent,
    notAssessable,
    deniedOnlyShare: graded === 0 ? 0 : deniedOnly / graded,
  };
}
