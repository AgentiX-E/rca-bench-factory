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

import { FAULT_CATEGORIES } from '../ir/types.js';
import { inferFaultCategory } from './collector.js';
import { CATEGORY_TERMS } from './category-terms.js';

/**
 * The category names `gates/validity.ts` holds expectations for, read from `FAULT_CATEGORIES`
 * rather than listed again.
 *
 * `FAULT_EXPECTATIONS` is a total `Record<FaultCategory, FaultExpectation>`, so membership in it
 * is membership in the IR vocabulary, and restating the eight names here would be a second copy of
 * a fact this module can read. It is a set because the consumer's outcome is a membership test.
 */
const FAULT_EXPECTATION_KEYS: ReadonlySet<string> = new Set(FAULT_CATEGORIES);

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
 * So `consistent` is reported per run and the stability result is reported beside it as
 * `MissStability`, because a property that appears in one run and not the next is a different
 * object from a property of the model -- and reporting only the run that showed it would be
 * choosing the flattering number, which is the defect this module exists to prevent.
 *
 * (This docstring named a `stableAcrossRuns` field until group M's review of the module. No
 * such field was ever declared: the stability reading lives in `MissStability` and reaches a
 * reader through `CategoryDerivationReport.missStability`. A doc that names a field which does
 * not exist is the same class of defect as the duplicated declaration below -- invisible to
 * the compiler, and wrong in the direction a reader cannot check without opening the type.)
 *
 * ## Declared once, and why that is stated here
 *
 * This interface was declared **twice** when the module first shipped, and Typescript merged
 * the two declarations silently: the build passed, every test passed, and the duplicate
 * reached the published `dist/fault/category-derivation.d.ts` as two `export interface`
 * declarations of the same name.
 *
 * The two bodies were field-for-field identical, so **no behaviour changed** -- which is
 * exactly why nothing caught it, and why the honest description of the defect is *structural*
 * rather than a correctness bug. It is recorded here because the failure mode is durable: a
 * duplicated declaration is invisible to `tsc`, invisible to every test that imports the type,
 * and visible only by reading the source or the emitted `.d.ts`. `category-derivation.test.ts`
 * group M now asserts the source declares each exported type once; the emitted file is checked
 * by injection AL, which rebuilds and reads it.
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
// (f) Downstream agreement -- what depends on the field the rule would replace
// ---------------------------------------------------------------------------

/**
 * What a consumer of `category` can *do* with it -- which is a different question from whether it
 * reads the field, and the difference is the whole of this section's subject.
 *
 * A three-way role rather than the `branches: boolean` this replaced, because the two-valued flag
 * could not express `verified` and so recorded it as nothing at all:
 *
 *   - **`branches`** -- the category selects different behaviour. `gates/validity.ts:148-155` looks
 *     it up in `FAULT_EXPECTATIONS` and returns `{semanticTypes: [], unverifiable: true}` on a
 *     miss, so a category outside the table silently removes the fault's verifiability.
 *     `export/rcaeval.ts:148` skips a case unless the category is `code`. **Both can reject a
 *     wrong category**, so both are evidence.
 *   - **`projects`** -- the category is interpolated into an emitted label through a total
 *     `Record<FaultCategory, string>` with no guard: `export/itbench.ts:119`,
 *     `export/cloudopsbench.ts:79`. A changed category changes the label and nothing else, and
 *     **every** category produces a label, so neither can reject anything. They are consumers, and
 *     they are not evidence, and conflating the two is how a one-consumer result gets reported as
 *     a three-consumer result.
 *   - **`verified`** -- the consumer holds an **independent opinion** about what the category
 *     should be and falls back to the IR field when it has none:
 *     `export/aiops2025.ts:76`, `AIOPS2025_CATEGORY[normalizeFaultType(type)] ?? fc.fault.category`.
 *     The table is keyed by *type*, not by category, so where it has an entry it is a second
 *     opinion that can disagree with the IR -- and where it does not, the `??` admits the opinion
 *     is unknown. Measured on the corpus: the fallback is reached on **16 of 19** samples and the
 *     emitted value would move on **14 of 19** if the category changed, which is what makes this a
 *     real consumer rather than a formality. It is evidence, and it does not branch -- which is
 *     exactly the case the old boolean had no way to record.
 *
 * This entry is why the census moved into this module. It was absent from both hand-written probe
 * copies of the consumer list, and a list maintained in two places was wrong in both.
 */
export type CategoryRole = 'branches' | 'projects' | 'verified';

/**
 * One consumer of `category`, named, roled, and reduced to the outcome it derives.
 *
 * `role` is declared rather than inferred, because the distinction it draws is exactly the one
 * this section is most likely to get wrong -- and it was got wrong: the first draft called all four
 * consumers "branch points", and its correction called the two projections consumers that "read"
 * the field, which counts them as evidence by another route.
 */
export interface CategoryConsumer {
  /** Where the consumer lives, so a figure can be traced to a file. */
  name: string;
  /** What the consumer can do with the category. See `CategoryRole`. */
  role: CategoryRole;
  /**
   * The outcome this consumer derives from a category.
   *
   * A function rather than a key set, because the consumers are not all membership tests:
   * `validity` returns `unverifiable` for a category outside its table, `rcaeval`'s RE3 filter
   * returns a boolean, and the two projections return interpolated labels. Handing the comparison
   * a function keeps `assessDownstreamAgreement` from having to know which shape each has.
   */
  outcome: (category: string) => string;
}

/**
 * Every consumer of `category`, owned here rather than restated by each caller.
 *
 * The census lived in two probe scripts as two hand-written arrays of four, and
 * `export/aiops2025.ts:76` was in neither. A list maintained in two places is a list that can be
 * right in one and wrong in the other; it was wrong in both, and the `evidence` count below was
 * short by one consumer that the corpus reaches on 16 of 19 samples.
 *
 * The outcomes are simulations of what each call site derives, kept deliberately coarse: this
 * module does not import the export or gate packages and should not start, because whether a
 * consumer branches is a fact about that consumer's source while the *consequence* of the branch is
 * what this module measures. Keeping them apart is what lets section (f) be checked by supplying a
 * consumer whose answer is known.
 */
export const CATEGORY_CONSUMERS: readonly CategoryConsumer[] = [
  {
    name: 'gates/validity.ts:148',
    role: 'branches',
    // A miss in `FAULT_EXPECTATIONS` returns `unverifiable`, so a category outside the table
    // silently removes the fault's verifiability. The table is total over `FaultCategory`, so this
    // can only fire on a value the type system already excludes -- which is why it is a branch
    // worth having rather than a formality.
    //
    // `.has`, not `in`. The first version of this closure wrote `category in FAULT_EXPECTATION_KEYS`
    // and the set is a `Set`, so `in` tested the object's *property keys* rather than its contents:
    // it is a string index into an object with none, and it is false for every input. The branch
    // therefore never fired, and every category -- including all eight real ones -- reported
    // `unverifiable`. Nothing caught it, because the two fixtures that mirror this closure were
    // written with the same operator, so the reading agreed with itself. Group U found it: the
    // consumer documented as branching on the expectation table was not branching on anything.
    outcome: (category) => (FAULT_EXPECTATION_KEYS.has(category) ? 'checked' : 'unverifiable'),
  },
  {
    name: 'export/rcaeval.ts:148',
    role: 'branches',
    outcome: (category) => (category === 'code' ? 'kept' : 'skipped'),
  },
  { name: 'export/itbench.ts:119', role: 'projects', outcome: (category) => `label:${category}` },
  {
    name: 'export/cloudopsbench.ts:79',
    role: 'projects',
    outcome: (category) => `taxonomy:${category}`,
  },
  {
    name: 'export/aiops2025.ts:76',
    role: 'verified',
    // The exporter's own table is keyed by *type* and falls back to the IR category. Simulated at
    // the same granularity the other entries use: what this records is that the consumer holds a
    // second opinion and admits when it has none, not what that opinion is for each slug. The
    // per-slug reachability is a corpus measurement and lives in the test that makes it.
    outcome: (category) => `table-or-ir:${category}`,
  },
];

/** One sample, read under its label and under its derivation. */
export interface DownstreamSampleReading {
  sampleId: string;
  type: string;
  labelled: string;
  derived: string;
  /** Consumers whose outcome differs between the label and the derivation. */
  moved: string[];
  /** True when no consumer moves -- the field is derivable away for this sample. */
  inert: boolean;
}

/** Whether deriving the field away would change any downstream outcome. */
export interface DownstreamReading {
  /** The consumers compared, each named and roled. */
  consumers: { name: string; role: CategoryRole }[];
  /**
   * How many of those consumers could reject a wrong category -- `branches` plus `verified`.
   *
   * The figure a reader will quote, and the one this field exists to make checkable. It is not
   * `consumers.length`: the `projects` entries interpolate the category into a label and cannot
   * reject anything, so counting them as evidence reports a three-consumer result as a
   * five-consumer result. That overstatement was made twice in this section's prose before it was
   * made an assertion, which is why it now has a field and a test rather than a sentence.
   */
  evidence: number;
  /** Samples carrying both fields. The denominator. */
  graded: number;
  /** Samples no consumer moves on. */
  inert: number;
  /** The samples a consumer does move on, named, with the consumers that moved. */
  moved: DownstreamSampleReading[];
  /** `inert / graded`, or 0 when nothing is graded. */
  share: number;
  /**
   * The verdict: does the derivation replace the field without moving a consumer?
   *
   * True on this corpus. Note what it is *not*: it is not a statement that the derivation is
   * correct, and not a statement that no consumer could ever move. It says the derivation and the
   * labels agree everywhere the consumers look, so **on this corpus** a producer could stop
   * predicting the field without a downstream change -- which is a different claim from "should".
   */
  lossless: boolean;
  /**
   * Whether the reading can tell a right category from a wrong one.
   *
   * False on this corpus, and for a reason worth stating: the consumers branch on the *same
   * label* the derivation is checked against, and the dataset and the classifier share an author.
   * Agreement between them is self-consistency. A reading that cannot be made to fail cannot
   * report a result, which is why this verdict is printed above every figure it governs -- the
   * discipline findings 100 and 102 established for their own readings.
   */
  separates: boolean;
  /** The share below which agreement is self-consistency rather than a signal. */
  floor: number;
  /** Why `separates` has the value it has, in a sentence a report can print. */
  reason: string;
}

/**
 * The floor below which downstream agreement is self-consistency.
 *
 * The same value as `ALT_READING_FLOOR`, and deliberately a separate constant: the two readings
 * have the same arithmetic but different subjects, and sharing one name would make a change to
 * one silently move the other. The comparison trap finding 100 recorded -- a `separates` that was
 * true for arithmetic reasons -- is the reason both are stated rather than inlined.
 */
export const DOWNSTREAM_FLOOR = 0.2;

/**
 * Compare what each consumer would derive from the label against what it would derive from the
 * rule's output, sample by sample.
 *
 * ## Why this exists
 *
 * Finding 102 established that `expected.category` is derivable from `expected.type` on 19 of 19
 * samples, and closed by saying the decision it informs -- dataset rule or model prompt -- now has
 * a subject. It did not ask the question that decides whether that decision is even available:
 * **does anything downstream depend on the field being predicted rather than derived?**
 *
 * `category` is consumed in five places, three of which can reject a wrong value. If the
 * derivation agreed with the label only mostly, deriving would move a sample's verifiability,
 * drop it from an RE3 export, or contradict the AIOps2025 exporter's own table -- silently, because
 * none of the three is exercised by the extraction suite. The other two interpolate the category
 * into a label and cannot reject anything, which is why the honest evidence count is 3 and not 5.
 *
 * `CATEGORY_CONSUMERS` above is that census. It used to live in the two probe scripts as two
 * hand-written arrays of four, and the entry that was in neither was `export/aiops2025.ts:76`.
 *
 * ## The two readings it compares
 *
 * `labelled` is the dataset's own `expected.category`; `derived` is `inferFaultCategory`'s answer
 * for the same sample's `expected.type`. They agree on 19 of 19, so `moved` is empty and the
 * verdict is `lossless: true`.
 *
 * ## And the refutation, which is the point
 *
 * `separates` is measured against an **alternative derivation** -- the pre-finding-95 substring
 * reading, kept in this module as a contrast precisely because this codebase shipped it. Under it
 * `feature-flag-misconfiguration` derives `middleware` where the label says `config`, which is a
 * different bucket in `validity.expectedSignalsFor`, so that consumer moves and the reading
 * demonstrably *can* separate.
 *
 * **Why that slug and not another:** the substring reading inherits its row order from
 * `CATEGORY_TERMS`, and exactly two corpus slugs are matched by two rows. Putting `config` before
 * `middleware` in that table would make the disagreement vanish without touching the matcher --
 * which is how Finding 104 established that the disagreement is a *second* defect and not a
 * restatement of finding 95's. The order is a dependency of this reading, and group R is what
 * pins it.
 *
 * The honest part, recorded here rather than left for a reader to discover: the same alternative
 * does **not** move `rcaeval`'s RE3 filter, because `config` and `middleware` are both non-`code`
 * and both are skipped. On this corpus the RE3 consumer therefore contributes **zero**
 * discriminating power, and the verdict rests on `validity` alone. A reader who assumed all four
 * consumers were evidence would be counting two projections and one inert filter as though they
 * were three more chances to disagree.
 */
export function assessDownstreamAgreement(
  samples: DerivationSample[],
  consumers: readonly CategoryConsumer[],
): DownstreamReading {
  const readable = samples.filter(
    (sample) => sample.type.trim() !== '' && sample.category.trim() !== '',
  );

  const moved: DownstreamSampleReading[] = [];
  for (const sample of readable) {
    const derived = inferFaultCategory(sample.type);
    const shifted = consumers
      .filter(
        (consumer) => consumer.outcome(sample.category) !== consumer.outcome(derived),
      )
      .map((consumer) => consumer.name);
    if (shifted.length > 0) {
      moved.push({
        sampleId: sample.sampleId,
        type: sample.type,
        labelled: sample.category,
        derived,
        moved: shifted,
        inert: false,
      });
    }
  }

  const graded = readable.length;

  // The refutation, measured rather than asserted: run the same comparison with the derivation
  // replaced by the alternative reading, and ask whether ANY consumer moves. If none does, the
  // reading cannot separate anything and `separates` is false for a statistical reason rather
  // than by fiat. A test pins both ends, so neither a hardcoded true nor a hardcoded false passes.
  let alternativeMoves = 0;
  for (const sample of readable) {
    const alternative = substringReading(sample.type);
    const differs = consumers.some(
      (consumer) => consumer.outcome(sample.category) !== consumer.outcome(alternative),
    );
    if (differs) alternativeMoves += 1;
  }

  const share = graded === 0 ? 0 : (graded - moved.length) / graded;
  const alternativeShare = graded === 0 ? 0 : alternativeMoves / graded;
  const separates = alternativeShare > DOWNSTREAM_FLOOR;

  const reason = separates
    ? `an alternative derivation moves a consumer on ${alternativeMoves} of ${graded} ` +
      `(${alternativeShare.toFixed(4)}), above the floor of ${DOWNSTREAM_FLOOR}, so the reading ` +
      `can tell a derived category from a mis-derived one`
    : `an alternative derivation moves a consumer on only ${alternativeMoves} of ${graded} ` +
      `(${alternativeShare.toFixed(4)}), at or below the floor of ${DOWNSTREAM_FLOOR}, so the ` +
      `reading cannot tell a derived category from a mis-derived one`;

  return {
    consumers: consumers.map((consumer) => ({
      name: consumer.name,
      role: consumer.role,
    })),
    // The honest count, recomputed from the roles rather than passed in: a caller cannot make the
    // evidence figure disagree with the census it was shown beside.
    evidence: consumers.filter((consumer) => consumer.role !== 'projects').length,
    graded,
    inert: graded - moved.length,
    moved,
    share,
    lossless: moved.length === 0,
    separates,
    floor: DOWNSTREAM_FLOOR,
    reason,
  };
}

// ---------------------------------------------------------------------------
// (g) The module's own declarations -- one name, one declaration
// ---------------------------------------------------------------------------

/**
 * The exported type names a source file declares more than once.
 *
 * ## Why this is a reading rather than a lint rule
 *
 * Typescript **merges** duplicate `interface` declarations of the same name. The build passes,
 * every test that imports the type passes, and the only place the duplication surfaces is the
 * emitted `.d.ts`, which carries the declaration twice. This module shipped that way: see the
 * note on `MissReading`.
 *
 * The consequence is asymmetric and is what makes this worth a function rather than a habit.
 * When two merged declarations are **field-for-field identical** -- which is the case here --
 * nothing observable changes, so no test can be written against the behaviour. When they
 * **differ**, the merge silently produces a *union* of their fields: a reader of the source sees
 * one shape, a reader of the type sees another, and neither is wrong on its own terms.
 *
 * So the only signature that covers both cases is the source text itself. That is what this
 * reads, and it is deliberately the same regex `export-surface-enumerated.test.ts` uses for
 * `export interface X`, so the two checks agree about what a declaration is.
 *
 * Not to be confused with a *value* redeclaration, which Typescript rejects at compile time and
 * therefore needs no reading: this covers `interface` and `type` aliases only, which are the two
 * forms a compiler accepts twice.
 *
 * Each offending name is reported **once**, however many times it is declared. A three-fold
 * duplicate is one defect rather than two, and a count that grew with the repetition would make
 * the figure a function of how badly a file went wrong rather than of whether it did. The
 * implementation is a scan rather than a filter over occurrence indexes precisely because
 * `names.filter((n, i) => names.indexOf(n) !== i)` looks right and is wrong -- it returns the
 * name once per *extra* occurrence, which is off by one in the direction a reader would not
 * check. A control in group M pins it.
 */
export function duplicateTypeDeclarations(source: string): string[] {
  const declaration = /^export\s+(?:type|interface)\s+([A-Za-z_$][\w$]*)/gm;
  const seen = new Set<string>();
  const reported: string[] = [];
  for (const match of source.matchAll(declaration)) {
    // `match[1]` is a string in fact -- the capture group is non-optional in the pattern -- but
    // `string | undefined` to the compiler under `noUncheckedIndexedAccess`. The cast below
    // states that, and it is the honest form here rather than a shortcut:
    //
    //   * `if (name === undefined) continue;` is a branch the pattern makes unreachable, so the
    //     module cannot report honest 100% branch coverage -- the line would need an exemption,
    //     which is the defect this module exists to remove.
    //   * `match[1] ?? ''` has the same problem in smaller print: the fallback is itself a
    //     branch, and it is equally unreachable.
    //
    // A cast that the pattern justifies is narrower than a line that cannot be covered, and the
    // positive/negative controls in group M would catch the cast being wrong: a pattern that
    // stopped capturing would make every control return `['']`-shaped nonsense rather than pass.
    const name = match[1] as string;
    if (seen.has(name)) {
      if (!reported.includes(name)) reported.push(name);
      continue;
    }
    seen.add(name);
  }
  return reported;
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
  /**
   * Whether deriving the field away would move any consumer that branches on it.
   *
   * Absent only when the caller supplies no consumer list. It is present in the probe and in the
   * tests, which read the real consumer set; a caller that has no consumers is not asserting
   * anything, so the field is optional rather than defaulted to a vacuous agreement.
   */
  downstream?: DownstreamReading;
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
  /**
   * The consumers of the field the rule would replace, supplied by the caller.
   *
   * Not derived here: this module does not import the export or gate packages, and it should not
   * start. Whether a consumer branches is a fact about that consumer's source, which the caller
   * reads; this module measures what the consequence of the branch is. Keeping the two apart is
   * what lets section (f) be checked by supplying a consumer whose answer is known.
   *
   * Optional so that an existing caller is not forced to invent a consumer list, but the probe
   * and the tests both supply the real one -- and the honesty list says so when it is absent.
   */
  consumers?: readonly CategoryConsumer[];
}): CategoryDerivationReport {
  const discriminatingPower = assessDiscriminatingPower(input.samples);
  const conformance = assessDatasetConformance(input.samples);
  const derivability = assessDerivability(input.samples);
  const excess = assessExcess(input.adversarialWords);
  const misses = assessMissDerivability(input.misses);
  const missStability = assessMissStability(input.runs);
  const downstream =
    input.consumers === undefined
      ? undefined
      : assessDownstreamAgreement(input.samples, input.consumers);

  const honesty = [
    `Conformance (${conformance.conforming} of ${conformance.graded}) says the dataset obeys ` +
      `its own rule. It says nothing about whether the consumers of the field would agree with ` +
      `the rule: the dataset and the classifier were written by the same hand, so a shared ` +
      `mistake would conform perfectly.` +
      (downstream === undefined
        ? ` This report was built without a consumer list, so the question of downstream ` +
          `agreement was not asked at all -- which is not the same as asking it and getting a yes.`
        : ` The downstream reading below asks that question directly and is the reason this ` +
          `figure must not be quoted on its own.`),
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
    `This module reads the labelled fields. It says nothing about whether the incident text ` +
      `carries what the labels claim -- that is finding 98's reading, which stands separately.`,
    ...(downstream === undefined ? [] : downstreamCaveat(downstream)),
  ];

  return {
    discriminatingPower,
    conformance,
    derivability,
    excess,
    misses,
    missStability,
    downstream,
    honesty,
  };
}

/**
 * The downstream caveat, stated in the direction the reading actually measured.
 *
 * A helper rather than an inline template because the two verdicts need opposite sentences and
 * the difference between them is the whole point of section (f): a lossless reading means the
 * field is decorative, and a separating one means the field is load-bearing. Writing one
 * sentence and parameterising the numbers would let the affirmative case be printed under a
 * refutation, which is exactly the defect this module exists to prevent.
 *
 * Exported, and that is a coverage decision rather than an API one. Both directions are reachable
 * through `assessDownstreamAgreement` in principle, but on this corpus only the lossless one is:
 * no consumer moves on any sample, so the separating sentence is unreachable through the report
 * builder and would otherwise be an uncovered branch in a module that reports its coverage. A
 * test supplies a constructed reading for each direction instead, which is the same repair group
 * J applies to the other uncovered branches.
 */
export function downstreamCaveat(downstream: DownstreamReading): string[] {
  const names = downstream.consumers.map((consumer) => consumer.name).join(', ');
  const projections = downstream.consumers.filter((consumer) => consumer.role === 'projects');
  const projectionNames = projections.map((consumer) => consumer.name).join(', ');
  const branching = downstream.consumers.filter((consumer) => consumer.role === 'branches');
  const branchingNames = branching.map((consumer) => consumer.name).join(', ');
  const verifying = downstream.consumers.filter((consumer) => consumer.role === 'verified');
  const verifyingNames = verifying.map((consumer) => consumer.name).join(', ');
  const base =
    `Downstream agreement: ${downstream.inert} of ${downstream.graded} samples keep the same ` +
    `treatment under the ${downstream.evidence} consumer(s) that can reject a wrong category ` +
    `(${branchingNames}${verifying.length > 0 ? `, ${verifyingNames}` : ''}), out of ` +
    `${downstream.consumers.length} that read it (${names}).`;

  if (downstream.lossless) {
    return [
      base +
        ` Deriving the field away would therefore change nothing observable for those ` +
        `consumers, so a derivation that passes their check has been tested against nothing.`,
      `The consumers that cannot reject a wrong category are not evidence of agreement and are ` +
        `counted as such: ${projections.length} of ${downstream.consumers.length} interpolate ` +
        `the category into an emitted label with no guard (${projectionNames}), so no category ` +
        `can change their control flow and they cannot distinguish a right derivation from a ` +
        `wrong one.`,
    ];
  }

  return [
    base +
      ` Under the alternative reading, ${downstream.moved.length} samples move, so this reading ` +
      `does separate and the verdict rests on it rather than on the figures above.`,
    `Separating is not the same as agreeing: a consumer can reject the derivation for the right ` +
      `reason or the wrong one, and this reading records only that its treatment changed.`,
  ];
}
