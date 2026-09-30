/**
 * The dataset states a category rule. This module checks it, and states its own power to
 * check anything.
 *
 * ## The rule, read off the data
 *
 * `expected.category` in `golden-master/fault-extraction/samples.json` is a pure function of
 * `expected.type`:
 *
 * ```
 * inferFaultCategory(expected.type) === expected.category   ->   19 of 19, no residue
 * ```
 *
 * The dataset's own `provenance.annotationRule` states the token rule for `component` and
 * backs it with a test. For `category` it states nothing, and `importer.ts`'
 * `buildFaultExtractionPrompt` never asks the model to choose a `type` whose derivation holds
 * -- it gives a closed vocabulary for `category`, a shape rule for `type`, and leaves the two
 * unconnected. The labeller applies a derivation the prompt does not state and the model is
 * not told to satisfy.
 *
 * This module exists because the rule was real and unchecked. `fault-prompt-grammar.test.ts`
 * is the precedent: it made the component token rule **checked** by asserting it over the real
 * dataset and adding constructed inputs so it could not be satisfied incidentally. The same is
 * done here for the category rule.
 *
 * ## And the part that matters more than the check
 *
 * Checking a rule produces figures, and figures get quoted. This module therefore measures, and
 * prints **first**, whether the reading it defines can distinguish anything at all.
 *
 * It cannot. Two independent alternative readings -- the substring reading that finding 95
 * removed, and a row-shadowing reading that ignores the table's order -- each differ from the
 * dataset's truth on **exactly 1 of the 19 expected types**, and they differ on *different*
 * types, so the union is **2 of 19 = 0.1053**, still below `ALT_READING_FLOOR`. A reading that
 * already disagrees with a tenth of the correct labels has essentially nothing left to disagree
 * *with*, so any miss figure drawn from it -- including the strict `0 of 7` this module computes
 * -- cannot distinguish the model from a correct answerer.
 *
 * This is finding 100 arriving in a new place. There the reading was of the *component* field
 * and its baseline was 1 of 19; here it is the *category* field and the baseline is 1 of 19
 * again. The lesson transfers and is why the verdict is the report's first field rather than a
 * footnote: in this campaign, a clean-looking count has twice been produced by an instrument
 * that could not have produced anything else.
 *
 * ## What the rule being total does and does not buy
 *
 * `inferFaultCategory` returns a real category for all 19 expected types and for all 22
 * adversarial words the recorded list contains, so on this corpus the rule is total and
 * silent. That is a genuine property of the current matcher -- finding 95's substring defect
 * made 32 of 40 words produce a category, and it now makes none. It is not evidence that the
 * rule is right, and `assessExcess` reports the substring reading on the same words so the 0 is
 * visibly a measurement of the matcher rather than of the word list.
 */

import { inferFaultCategory } from './collector.js';
import { CATEGORY_TERMS } from './category-terms.js';

/** One dataset sample, reduced to the two fields the rule is about. */
export interface DerivationSample {
  sampleId: string;
  /** The labelled fault type slug. */
  type: string;
  /** The labelled category, which the rule claims is derivable from `type`. */
  category: string;
}

/** One recorded model answer, with the type the model itself reported. */
export interface MissSample {
  sampleId: string;
  /** The `type` the model answered with -- the slug it chose before naming a category. */
  answeredType: string;
  /** The `category` it answered with. */
  answeredCategory: string;
  /** The category a correct answer would have carried. */
  expectedCategory: string;
}

// ---------------------------------------------------------------------------
// (a) Conformance -- does the dataset obey its own rule?
// ---------------------------------------------------------------------------

/** Whether the labelled category is what the labelled type derives. */
export interface ConformanceReading {
  /** Samples carrying both fields. The denominator. */
  graded: number;
  /** Samples where `category === inferFaultCategory(type)`. */
  conforming: number;
  /** The samples that break the rule, named so the figure is actionable rather than a count. */
  disagreements: { sampleId: string; type: string; labelled: string; derived: string }[];
  /** `conforming / graded`, or 0 when there is nothing to read. */
  share: number;
  /** Whether the dataset is free of disagreements. */
  conforms: boolean;
}

/**
 * Check every sample against the rule.
 *
 * A sample missing either field is excluded from `graded` rather than counted as
 * non-conforming, for the reason finding 94 established and `agreement-baseline.ts` repeats: a
 * field that was not present was not read, and letting an absent field push a figure is the
 * partial-join defect finding 92 records.
 */
export function assessDatasetConformance(samples: DerivationSample[]): ConformanceReading {
  const disagreements: ConformanceReading['disagreements'] = [];
  let graded = 0;
  let conforming = 0;

  for (const sample of samples) {
    if (sample.type.trim() === '' || sample.category.trim() === '') continue;
    graded += 1;
    const derived = inferFaultCategory(sample.type);
    if (derived === sample.category) {
      conforming += 1;
    } else {
      disagreements.push({
        sampleId: sample.sampleId,
        type: sample.type,
        labelled: sample.category,
        derived,
      });
    }
  }

  return {
    graded,
    conforming,
    disagreements,
    share: graded === 0 ? 0 : conforming / graded,
    conforms: disagreements.length === 0,
  };
}

// ---------------------------------------------------------------------------
// (b) Derivability -- is the rule total?
// ---------------------------------------------------------------------------

/** Whether every labelled type lands on a real category rather than the fallback. */
export interface DerivabilityReading {
  /** Samples carrying a type. The denominator. */
  graded: number;
  /** Samples whose type derives something other than `unknown`. */
  defined: number;
  /** The types that fall through to `unknown`, named. */
  undefinedTypes: string[];
  /** Whether every labelled type is derivable. */
  total: boolean;
}

/**
 * Check that the rule covers the corpus.
 *
 * `inferFaultCategory` falls back to `'unknown'`, which is a member of the published
 * vocabulary but not a category a sample is ever labelled with. A type that derives it means
 * the rule has no opinion about a case the dataset asserts an answer for -- a hole rather than
 * a disagreement, and a different defect from (a): a sample can conform and still be
 * undecidable if both its fields were `unknown`, so the two checks are separate.
 */
export function assessDerivability(samples: DerivationSample[]): DerivabilityReading {
  const undefinedTypes: string[] = [];
  let graded = 0;

  for (const sample of samples) {
    if (sample.type.trim() === '') continue;
    graded += 1;
    if (inferFaultCategory(sample.type) === 'unknown') {
      undefinedTypes.push(sample.type);
    }
  }

  return {
    graded,
    defined: graded - undefinedTypes.length,
    undefinedTypes,
    total: undefinedTypes.length === 0,
  };
}

// ---------------------------------------------------------------------------
// (c) Excess -- what the rule says about words it was not asked about
// ---------------------------------------------------------------------------

/** How many words the rule classifies that it should have nothing to say about. */
export interface ExcessReading {
  /** The words tested. The denominator. */
  tested: number;
  /** Words that derive a non-`unknown` category. */
  classified: number;
  /** The words and what they derived, named. */
  hits: { word: string; derived: string }[];
  /** `classified / tested`, or 0 when there is nothing to test. */
  share: number;
  /** Whether the excess is within `EXCESS_ALLOWANCE`. */
  within: boolean;
  /** The same words under the substring reading, so the 0 is shown to measure the matcher. */
  underSubstringReading: number;
}

/**
 * How many words the rule may classify before the figure stops being about the corpus.
 *
 * Zero, and it is measured rather than assumed: finding 95 made 32 of 40 adversarial words
 * produce a category through `String.includes`, and the word-boundary matcher that replaced it
 * makes 0 of the 22 recorded words produce one. Anything above zero would mean the rule is
 * answering questions the corpus never asks, and the corpus has no such case today.
 */
export const EXCESS_ALLOWANCE = 0;

/**
 * The pre-finding-95 reading, reproduced so its disagreement with the current one is visible.
 *
 * `String.includes` over the whole slug: a keyword counts if it appears anywhere, as letter
 * sequence. This is what made `planet` a `network` fault (via `net`) and `feature-flag-...` a
 * `middleware` one (via `lag`). It is kept here only as a contrast, never as the reported
 * reading, because a 0 from a reading that can only return 0 is not a measurement.
 */
function substringReading(slug: string): string {
  const normalized = slug
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
  for (const [category, terms] of Object.entries(CATEGORY_TERMS)) {
    if (terms.some((term) => normalized.includes(term))) return category;
  }
  return 'unknown';
}

/**
 * Read an adversarial word list through the rule.
 *
 * Each word is embedded in an otherwise neutral slug, so a hit can only come from the word:
 * `<word>-service` carries no keyword of its own.
 */
export function assessExcess(words: readonly string[]): ExcessReading {
  const hits: ExcessReading['hits'] = [];
  let underSubstringReading = 0;

  for (const word of words) {
    const slug = `${word}-service`;
    const derived = inferFaultCategory(slug);
    if (derived !== 'unknown') hits.push({ word, derived });
    if (substringReading(slug) !== 'unknown') underSubstringReading += 1;
  }

  return {
    tested: words.length,
    classified: hits.length,
    hits,
    share: words.length === 0 ? 0 : hits.length / words.length,
    within: hits.length <= EXCESS_ALLOWANCE,
    underSubstringReading,
  };
}

// ---------------------------------------------------------------------------
// (d) The miss test -- with its criterion stated as a choice
// ---------------------------------------------------------------------------

/** How many recorded misses are consistent with the rule the dataset uses. */
export interface MissReading {
  /** Misses carrying an answered type. The denominator. */
  graded: number;
  /**
   * Misses where the model's **own** answered type derives the category it answered.
   *
   * This is the honest criterion. A miss satisfies it when the model reported a slug and then
   * a category that slug actually implies -- i.e. it disagrees with the label coherently,
   * rather than failing to connect the two fields.
   */
  consistent: number;
  /** The misses that satisfy it, named. */
  consistentIds: string[];
  /** Per-miss detail, so a reader can check the criterion rather than trust the count. */
  rows: {
    sampleId: string;
    answeredType: string;
    derived: string;
    answeredCategory: string;
    expectedCategory: string;
    consistent: boolean;
  }[];
  /**
   * The same misses under the **loose** criterion: is the answered category derivable from
   * *some* slug at all?
   *
   * Reported beside `consistent` so the criterion's choice is visible as a choice. The loose
   * figure is worthless and the test suite asserts it is the larger of the two: every category
   * is reachable from its own bare keyword (`error` -> `code`), so every answered category is
   * trivially derivable and the loose count describes the vocabulary rather than the model.
   */
  reachableLoosely: number;
  /** Whether the honest criterion found nothing, which is the measured result. */
  noneConsistent: boolean;
}

/**
 * Test the recorded misses against the rule.
 *
 * ## The criterion, and the one it replaces
 *
 * The loose criterion -- is the answered category derivable from *some* slug at all -- is
 * worthless and is computed here only so the choice is visible: every category is reachable
 * from its own bare keyword (`error` -> `code`), so every answered category is trivially
 * derivable and the loose count describes the vocabulary rather than the model. A test asserts
 * it is the larger of the two figures.
 *
 * The honest criterion uses the model's **own reported type** for the same sample: a miss is
 * consistent when the slug the model wrote derives the category the model then answered. That
 * is a statement about the model's coherence rather than about the vocabulary.
 *
 * ## What it measures, across runs
 *
 * The first version of this module took the misses from a transcription. Reading them from the
 * recorded run fixtures instead showed the figure is **not a constant**: the current run
 * `567118aea` gives 0 of 8, and the earlier run `9932e766c` gives 1 of 8, because that run
 * reported `replica-apply-thread-saturation` for a sample the current run reports as
 * `replication-apply-bottleneck`. The single consistent case therefore exists in one run only,
 * and **0 of 8 is consistent in both**.
 *
 * So `consistent` is reported per run and `stableAcrossRuns` is reported beside it, because a
 * property that appears in one run and not the next is a different object from a property of
 * the model -- and reporting only the run that showed it would be choosing the flattering
 * number, which is the defect this module exists to prevent.
 */
export interface MissReading {
  /** Misses carrying an answered type. The denominator. */
  graded: number;
  /**
   * Misses where the model's **own** answered type derives the category it answered.
   *
   * A miss satisfies this when the model reported a slug and then a category that slug actually
   * implies -- i.e. it disagrees with the label coherently, rather than failing to connect the
   * two fields.
   */
  consistent: number;
  /** The misses that satisfy it, named. */
  consistentIds: string[];
  /** Per-miss detail, so a reader can check the criterion rather than trust the count. */
  rows: {
    sampleId: string;
    answeredType: string;
    derived: string;
    answeredCategory: string;
    expectedCategory: string;
    consistent: boolean;
  }[];
  /**
   * The same misses under the **loose** criterion: is the answered category derivable from
   * *some* slug at all?
   *
   * Computed from the vocabulary rather than declared, so the two figures stay comparable if the
   * vocabulary changes.
   */
  reachableLoosely: number;
  /** Whether the honest criterion found nothing in this run. */
  noneConsistent: boolean;
}

/**
 * Test one run's recorded misses against the rule.
 *
 * The loose criterion is computed from the vocabulary, not transcribed: a category is loosely
 * reachable when the vocabulary knows it, which is true of every category by construction.
 */
export function assessMissDerivability(misses: MissSample[]): MissReading {
  const rows: MissReading['rows'] = [];
  const consistentIds: string[] = [];
  let graded = 0;
  let reachableLoosely = 0;

  const knownCategories = new Set(Object.keys(CATEGORY_TERMS));

  for (const miss of misses) {
    if (miss.answeredType.trim() === '') continue;
    graded += 1;
    const derived = inferFaultCategory(miss.answeredType);
    const consistent = derived === miss.answeredCategory;
    rows.push({
      sampleId: miss.sampleId,
      answeredType: miss.answeredType,
      derived,
      answeredCategory: miss.answeredCategory,
      expectedCategory: miss.expectedCategory,
      consistent,
    });
    if (consistent) consistentIds.push(miss.sampleId);
    if (knownCategories.has(miss.answeredCategory)) reachableLoosely += 1;
  }

  return {
    graded,
    consistent: consistentIds.length,
    consistentIds,
    rows,
    reachableLoosely,
    noneConsistent: consistentIds.length === 0,
  };
}

/** One recorded run's misses, under a name. */
export interface RunMisses {
  /** The run's short sha. */
  run: string;
  misses: MissSample[];
}

/** Whether the consistency result survives the run change. */
export interface MissStability {
  /** One reading per run, each labelled. */
  perRun: { run: string; reading: MissReading }[];
  /** Samples consistent in **every** run. The figure a claim about the model would need. */
  stableIds: string[];
  /** Samples consistent in **at least one** run. */
  everIds: string[];
  /** How many samples are graded in every run. The denominator for the two lists. */
  graded: number;
  /**
   * Whether any sample is consistent in every run.
   *
   * False on the recorded runs. A property that holds in one run and not the next is a property
   * of the run, not of the model, and only this figure can tell them apart.
   */
  stable: boolean;
  /** Why `stable` has the value it has, in a sentence a report can print. */
  reason: string;
}

/**
 * Compare the consistency result across runs.
 *
 * Both recorded runs miss the same eight samples, so the denominator does not move and the
 * figures are comparable. A run missing a different set of samples would make the per-run
 * counts incomparable and is reported by the intersection rather than by the counts.
 */
export function assessMissStability(runs: RunMisses[]): MissStability {
  const perRun = runs.map((entry) => ({ run: entry.run, reading: assessMissDerivability(entry.misses) }));

  const first = perRun[0];
  const graded = first === undefined ? 0 : first.reading.graded;
  const everIds = new Set<string>();
  const countsPerSample = new Map<string, number>();

  for (const { reading } of perRun) {
    for (const row of reading.rows) {
      countsPerSample.set(row.sampleId, (countsPerSample.get(row.sampleId) ?? 0) + (row.consistent ? 1 : 0));
      if (row.consistent) everIds.add(row.sampleId);
    }
  }

  const stableIds = [...countsPerSample.entries()]
    .filter(([sampleId, count]) => count === perRun.length && perRun.length > 0 && everIds.has(sampleId))
    .map(([sampleId]) => sampleId);
  const stable = stableIds.length > 0;

  const reason = stable
    ? `${stableIds.length} of ${graded} samples are consistent in every recorded run, so the ` +
      `result survives the run change`
    : `no sample is consistent in every recorded run: ${everIds.size} of ${graded} is ` +
      `consistent in at least one and none in both, so the result is a property of the run ` +
      `rather than of the model`;

  return { perRun, stableIds, everIds: [...everIds], graded, stable, reason };
}

// ---------------------------------------------------------------------------
// (e) Discriminating power -- measured before any of the above is quoted
// ---------------------------------------------------------------------------

/**
 * The alternative readings, each one a defect this codebase has actually shipped.
 *
 * `substring` is finding 95's matcher: keywords as letter sequences, so any word containing a
 * keyword derives that keyword's category. `row-shadowing` ignores the table's order, so a
 * slug whose subject and mechanism sit in different rows is read as the first one rather than
 * by the ordering rule that exists to separate subject from mechanism.
 */
export type AlternativeReadingName = 'substring' | 'row-shadowing';

export interface AlternativeReading {
  name: AlternativeReadingName;
  /** The expected types this reading classifies differently from the label. */
  differ: string[];
}

/** Whether the rule can distinguish anything on this corpus. */
export interface PowerReading {
  /** The readings compared against the label, each named. */
  alternativeReadings: AlternativeReading[];
  /** The expected types at least one alternative reading disagrees about. */
  differ: string[];
  /** `differ.length / graded`. */
  share: number;
  /**
   * Whether the reading is **load-bearing** -- i.e. whether alternative readings disagree with
   * the label often enough that agreeing with it means something.
   *
   * This is deliberately not `differ.length > 0`. One disagreement is a disagreement; it is
   * not a discriminating instrument. On the recorded corpus the figure is 1 of 19, whose true
   * value is indistinguishable from zero, so a miss count reported from this reading is the
   * difference between two estimates of zero. That is the defect finding 100 shipped in its
   * first version by writing `predicted < expected`, and it is written the other way here so
   * the two statements cannot contradict.
   */
  separates: boolean;
  /** The share below which disagreements are accidents rather than a signal. */
  floor: number;
  /** Why `separates` has the value it has, in a sentence a report can print. */
  reason: string;
  /** Samples carrying a type. The denominator. */
  graded: number;
}

/**
 * The share of labelled types alternative readings must disagree about before a figure drawn
 * from this reading means anything.
 *
 * The same 0.2 as `BASELINE_FLOOR` in `agreement-baseline.ts`, for the same reason and reached
 * independently: this corpus has no labelled type whose classification is genuinely contested,
 * so the only disagreements available are accidents of the matcher. A reading that disagrees
 * with two of nineteen correct labels is not an instrument.
 *
 * It is a judgement, stated rather than buried, and it is not a significance test. It exists so
 * that "0 of 7 misses are consistent" cannot be printed as a result when the reading producing
 * it could only have disagreed with a tenth of the labels.
 */
export const ALT_READING_FLOOR = 0.2;

/** The ordered rows, with each category's keywords, for the shadowing reading. */
const ROWS: ReadonlyArray<{ category: string; keywords: readonly string[] }> = Object.entries(
  CATEGORY_TERMS,
).map(([category, keywords]) => ({ category, keywords }));

/**
 * The row-shadowing reading: ignore the order that separates subject from mechanism.
 *
 * The classifier's table is ordered so `middleware` is tested before `network`, which is what
 * lets `redis-latency` (middleware) and `network-delay` (network) both contain a latency
 * keyword and still land in different categories. This reading collects every row whose
 * keyword matches and, when more than one does, reports the disagreement rather than an
 * ordering. It is not a strawman: it is what the table looks like to anyone who reads the rows
 * as a set.
 */
function shadowingReading(slug: string): string {
  const normalized = slug
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
  const tokens = normalized.split('-').filter((token) => token !== '');
  const hits: string[] = [];
  for (const { category, keywords } of ROWS) {
    if (keywords.some((keyword) => tokens.includes(keyword))) hits.push(category);
  }
  const unique = [...new Set(hits)];
  return unique.length > 0 ? unique.join(',') : 'unknown';
}

/**
 * Measure whether the rule can distinguish anything, before any figure from it is quoted.
 *
 * Returns `separates: false` on the recorded corpus and says why.
 */
export function assessDiscriminatingPower(samples: DerivationSample[]): PowerReading {
  const readable = samples.filter((sample) => sample.type.trim() !== '');
  const substringDiffer: string[] = [];
  const shadowingDiffer: string[] = [];
  const differSet = new Set<string>();

  for (const sample of readable) {
    const labelled = sample.category;
    const bySubstring = substringReading(sample.type);
    const byShadowing = shadowingReading(sample.type);
    if (bySubstring !== labelled) {
      substringDiffer.push(sample.type);
      differSet.add(sample.type);
    }
    if (byShadowing !== labelled) {
      shadowingDiffer.push(sample.type);
      differSet.add(sample.type);
    }
  }

  const alternativeReadings: AlternativeReading[] = [
    { name: 'substring', differ: substringDiffer },
    { name: 'row-shadowing', differ: shadowingDiffer },
  ];

  const graded = readable.length;
  const differ = [...differSet];
  const share = graded === 0 ? 0 : differ.length / graded;
  const separates = share > ALT_READING_FLOOR;

  const reason = separates
    ? `alternative readings disagree with the label on ${differ.length} of ${graded} ` +
      `(${share.toFixed(4)}), above the floor of ${ALT_READING_FLOOR}, so agreeing with the ` +
      `label is a property the alternatives do not share`
    : `alternative readings disagree with the label on only ${differ.length} of ${graded} ` +
      `(${share.toFixed(4)}), at or below the floor of ${ALT_READING_FLOOR}, so the reading ` +
      `disagrees with almost nothing and no miss count drawn from it can be distinguished ` +
      `from the same nothing`;

  return {
    alternativeReadings,
    differ,
    share,
    separates,
    floor: ALT_READING_FLOOR,
    reason,
    graded,
  };
}

// ---------------------------------------------------------------------------
// The report -- verdict first
// ---------------------------------------------------------------------------

export interface CategoryDerivationReport {
  /**
   * The verdict, and the first field on purpose.
   *
   * Everything below this line is a figure drawn from a reading whose discriminating power is
   * recorded here. Put the figures first and the verdict last and a reader can quote the
   * figures without ever reaching it; that is the failure this ordering prevents, and a test
   * asserts the order.
   */
  discriminatingPower: PowerReading;
  conformance: ConformanceReading;
  derivability: DerivabilityReading;
  excess: ExcessReading;
  misses: MissReading;
  /** Whether the miss result survives the run change. A run-specific result is not a finding. */
  missStability: MissStability;
  /** What these figures do not show, in sentences. Non-empty by construction. */
  honesty: string[];
}

/**
 * Build the whole assessment, with the verdict first and the caveats attached.
 *
 * Pure: every field is a function of the arguments, so a caller cannot get figures that
 * disagree with the inputs they were shown beside.
 */
export function buildCategoryDerivationReport(input: {
  samples: DerivationSample[];
  misses: MissSample[];
  runs: RunMisses[];
  adversarialWords: readonly string[];
}): CategoryDerivationReport {
  const discriminatingPower = assessDiscriminatingPower(input.samples);
  const conformance = assessDatasetConformance(input.samples);
  const derivability = assessDerivability(input.samples);
  const excess = assessExcess(input.adversarialWords);
  const misses = assessMissDerivability(input.misses);
  const missStability = assessMissStability(input.runs);

  const honesty = [
    `The miss figure (${misses.consistent} of ${misses.graded} consistent) comes from a ` +
      `reading that disagrees with the label on ${discriminatingPower.differ.length} of ` +
      `${discriminatingPower.graded} expected types, below the floor of ` +
      `${ALT_READING_FLOOR}. It does not distinguish the model from a correct answerer and ` +
      `must not be quoted as a result.`,
    `The miss figure also does not survive the run change: ${missStability.everIds.length} of ` +
      `${missStability.graded} samples are consistent in at least one recorded run and ` +
      `${missStability.stableIds.length} in every one, so the result is a property of the run ` +
      `rather than of the model.`,
    `The excess figure (${excess.classified} of ${excess.tested}) is a property of the ` +
      `current matcher, not of the word list. Under the substring reading the same words give ` +
      `${excess.underSubstringReading}, so the word list does provoke the defect the matcher ` +
      `was built to remove.`,
    `Conformance (${conformance.conforming} of ${conformance.graded}) says the dataset obeys ` +
      `its own rule. It does not say the rule is right: the dataset and the classifier were ` +
      `written by the same hand, and a shared mistake would conform perfectly.`,
    `This module reads the labelled fields. It says nothing about whether the incident text ` +
      `carries what the labels claim -- that is finding 98's reading, which stands separately.`,
  ];

  return {
    discriminatingPower,
    conformance,
    derivability,
    excess,
    misses,
    missStability,
    honesty,
  };
}
