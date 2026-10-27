import type { ScoreTargetId } from './score.js';
import type { RcaEvalSuite } from '../export/rcaeval.js';
import { csvColumn, parseCsvObjects } from '../util/csv.js';
import { isRecord, readString, readStringArray, safeJson } from '../util/json.js';

/**
 * Official-metric scoring.
 *
 * The structural checks in `score.ts` prove an export *looks* like the target
 * contract. They cannot prove the export is *scoreable*: an answer key that is
 * missing the one field the official evaluator parses still passes every
 * structural check. This module closes that gap by re-implementing each target's
 * published scoring rule and running it end to end:
 *
 *   1. `readOfficialGroundTruth` reads the answer key the way the official
 *      evaluator does (for OpenRCA, by parsing the `scoring_points` block with
 *      the evaluator's own regular expressions).
 *   2. `readOfficialSubmission` produces the prediction a solver would submit —
 *      for OpenRCA that is the exported `record.csv`, for the other targets the
 *      oracle prediction derived from the answer key.
 *   3. `scoreOfficial` applies the published rule and reports both the headline
 *      number and every sub-metric the benchmark publishes.
 *
 * Every rule records its provenance, and the value says **how far the rule is from
 * somebody else's code** -- three states, because there are three, and the
 * two-value version could not tell the first two apart.
 *
 * Findings 176 and 181 each found a `source` string that had never been opened,
 * and findings 182, 183 and 184 each found a rule that disagreed with the
 * artefact behind it -- 10 of 25 cases, 9 of 22, 3 of 4, every one of them under
 * a label that said `official`. The label was never wrong in the sense of being a
 * lie; it was wrong in the sense that a reader could not tell from it whether the
 * number had ever been compared to anything.
 *
 * Every switch over `ScoreTargetId` or `OfficialFacet` is exhaustive at compile
 * time: `noImplicitReturns` is on, so adding a target or a facet without
 * handling it is a type error rather than a silently skipped case. That is why
 * these switches carry no runtime `default` branch — there is nothing left to
 * default to, and an unreachable guard would only be untestable dead code.
 */

/** A facet of a diagnosis that an official rule can score. */
export type OfficialFacet = 'component' | 'faultType' | 'reason' | 'occurredAt' | 'ranks' | 'chain' | 'evidence' | 'traceLength';

/** Every facet, in canonical order, so a rule cannot score an undeclared one. */
export const OFFICIAL_FACETS: readonly OfficialFacet[] = [
  'component',
  'faultType',
  'reason',
  'occurredAt',
  'ranks',
  'chain',
  'evidence',
  'traceLength',
];

/**
 * How far a rule is from somebody else's code.
 *
 * - `replayed` -- a corpus in `golden-master/` runs the released artefact's rule
 *   case by case, and the suite replays it. This is the only value that has been
 *   checked against a second implementation.
 * - `transcribed` -- the benchmark publishes a prose rule (a protocol section, a
 *   dataset README) and no released code. The rule is a faithful reading, and
 *   nothing has ever disagreed with it because nothing else computes it.
 * - `derived` -- the benchmark publishes neither the rule nor the constants it
 *   would need, so this repository supplies an explicit aggregation and says so.
 *
 * The value is not authored here. `packages/core/test/provenance-matches-the-census.test.ts`
 * derives it from `golden-master/oracle-census.json` and fails when the two
 * disagree, so the registry cannot claim more than the census supports -- and a
 * target whose census row is downgraded cannot keep saying `replayed`.
 */
export type OfficialProvenance = 'replayed' | 'transcribed' | 'derived';

export interface OfficialMetricSpec {
  /** Short id used in reports. */
  readonly id: string;
  /** Metric name as published by the benchmark. */
  readonly name: string;
  /** The rule, in one line. */
  readonly formula: string;
  readonly provenance: OfficialProvenance;
  /** Where the rule comes from. */
  readonly source: string;
  /** Verbatim quote of the published rule, when one exists. */
  readonly quote: string;
  /** The facets this rule scores; anything absent is not part of the score. */
  readonly facets: readonly OfficialFacet[];
}

/** One case's answer key, normalised across all nine targets. */
export interface OfficialGroundTruth {
  readonly caseId: string;
  readonly component: string;
  readonly faultType: string;
  readonly reason: string;
  /** Root-cause occurrence time, rendered the way the target renders it. */
  readonly occurredAt: string;
  /** Entities that earn partial localisation credit (RCA100 topology neighbours). */
  readonly adjacent: readonly string[];
  /** Expected causal chain, as ordered node tokens. */
  readonly chain: readonly string[];
  /** Expected evidence points: the `E_t` denominator or the checkpoint refs. */
  readonly evidence: readonly string[];
  /** Ground-truth phrasings of the fault type (AIOps2025 Type Accuracy). */
  readonly faultDescriptions: readonly string[];
  /**
   * Other strings the protocol accepts as the *same* answer for this case.
   *
   * Not "similar" and not "adjacent": each entry is a value the published rule
   * says to score as a full hit. AIOps2025 is the only target that has any, and
   * it has them because §4.4 says so:
   *
   * > Two fault families need targeted relaxations: for network attacks, LA
   * > accepts a hit on either source or destination since evidence is prominent
   * > at both endpoints.
   *
   * The answer key names both endpoints in `source` and `destination`; this
   * carries whichever of them the reader found, so the LA comparison can accept
   * them without the reader deciding which one `service` happens to equal. Empty
   * for every other target, and empty for a case that declares no alternative --
   * an empty list cannot manufacture a match.
   */
  readonly alternatives: readonly string[];
  /**
   * The OpenRCA `scoring_points` block, carried **only when it declares more
   * than one root**.
   *
   * The flattened triple above is the first root cause and is what every other
   * target and every display reads. The rule's denominator, however, counts the
   * criteria of *every* root, and its numerator is an assignment over them -- so
   * a key with two roots cannot be described by the triple, and this carries the
   * block it came from.
   *
   * A one-root key is left absent on purpose: the scorer reconstructs the same
   * three lists from the triple, and a second copy of a fact that is already
   * here would be a second place to keep in step.
   */
  readonly scoringPoints?: OpenRcaScoringPoints;
}

/** A solver's answer for one case. */
export interface OfficialPrediction {
  readonly component: string;
  readonly faultType: string;
  readonly reason: string;
  readonly occurredAt: string;
  /** Ranked root-cause candidates, most confident first. */
  readonly ranks: readonly string[];
  readonly chain: readonly string[];
  readonly evidence: readonly string[];
  /** Length of the reasoning trace in words (AIOps2025 Efficiency). */
  readonly traceWords: number;
  /**
   * Root causes beyond the first, for OpenRCA 1.0.
   *
   * The flat fields above are root one -- the mutation harness perturbs them, so
   * a second copy here would let a mutation change the answer without changing
   * the score. This holds the rest, which only a multi-root submission has.
   */
  readonly extraRoots?: readonly OpenRcaRoot[];
}

export interface OfficialFacetVerdict {
  readonly facet: OfficialFacet;
  readonly matched: boolean;
}

export interface OfficialCaseScore {
  readonly caseId: string;
  readonly facets: readonly OfficialFacetVerdict[];
  /** 0..1 under the target's rule; for all-or-nothing rules this is 0 or 1. */
  readonly score: number;
  /** `score === 1`, i.e. the case is fully correct. */
  readonly correct: boolean;
  /**
   * The named terms `score` was computed from, when the target's rule has them.
   *
   * The aggregate averages **these** instead of recomputing the rule from the
   * predictions and the answer key. It used to recompute, and the two
   * implementations drifted: `RCA100_ADJACENT_CREDIT` moved from 0.5 to the
   * published 0.40 in the per-case rule, and the report then printed
   * `accuracy: 0.94` beside `final: 95` -- the same quantity, twice, disagreeing.
   * A term that is absent from a case (an answer key with no causal chain) is
   * left out of the record rather than set to zero, so the aggregate can keep the
   * "no denominator means no term" rule that `meanOfPresent` states.
   */
  readonly terms?: Readonly<Record<string, number>>;
}

export interface OfficialScoreReport {
  readonly target: ScoreTargetId;
  readonly metric: OfficialMetricSpec;
  readonly cases: readonly OfficialCaseScore[];
  readonly caseCount: number;
  /** Mean per-case score. */
  readonly accuracy: number;
  /** The benchmark's published headline number, on a 0..100 scale. */
  readonly final: number;
  /** Sub-metrics the benchmark additionally publishes. */
  readonly breakdown: Readonly<Record<string, number>>;
}

// ---------------------------------------------------------------------------
// Metric specifications
// ---------------------------------------------------------------------------

const OPENRCA_METRIC: OfficialMetricSpec = {
  id: 'openrca-strict-accuracy',
  name: 'OpenRCA strict accuracy (with per-criterion partial credit)',
  formula: 'score = matched criteria / criteria; strict accuracy = share of cases with score 1.0',
  provenance: 'replayed',
  source: 'microsoft/OpenRCA main/evaluate.py (pinned in golden-master/openrca-evaluator.json)',
  quote:
    'if perm[i][\'root cause component\'] == components[i]: current_score += 1 ... ' +
    'if time_difference(times[i], perm[i][\'root cause occurrence datetime\']): current_score += 1 ... ' +
    'final_score = scores_get / socres_num',
  facets: ['component', 'reason', 'occurredAt'],
};

/**
 * OpenRCA 2.0's outcome layer and its graph comparison.
 *
 * This spec used to cite **this repository's own documentation** --
 * `source: 'docs/targets/openrca-2.0.md'` -- and quote a sentence that appears
 * nowhere in the paper: "The official OpenRCA 2.0 evaluation framework and scorer
 * are not open-sourced." Checked at `arXiv:2606.27154v2`: the string
 * `open-sourced` does not occur in the paper, and neither `2.0` nor `PAVE` occurs
 * in `microsoft/OpenRCA`'s README at the pinned commit. A `quote` field whose
 * value is that it was not written here, holding a sentence written here, is a
 * citation closed on itself.
 *
 * The paper does define the metric set -- §3.2, with formal definitions in
 * Appendix G -- and four of its nine quantities are computable from this
 * contract:
 *
 *   EM      set equality over (service, fault_kind) pairs. One root cause here,
 *           so it is one pair and equality is an and.
 *   AnySvc  the service alone, ignoring the fault kind. The metric that makes an
 *           "ungrounded diagnosis" expressible at all.
 *   Node F1 / Edge F1
 *           the predicted causal graph against the annotated one under exact
 *           matching -- where partial credit belongs, rather than in a facet
 *           average that pays the root cause twice.
 *   PR      a correct root cause *and* a path from it, in the predicted graph, to
 *           an alarm node. Finding 187: the alarm nodes look like a missing field
 *           and are not one. PAVE verifies a path only if "every node along π
 *           exhibits a deviation beyond its baseline screen", so **every node of
 *           the annotated path is an alarm node by construction** -- the field was
 *           the chain all along. The set used here is G*'s nodes, which is a
 *           subset of the paper's alarm set, so this PR is a lower bound.
 *
 * Four are not, and are recorded as gaps in
 * `golden-master/openrca2-evaluator.json`: F1/Precision/Recall over a one-pair set
 * are three names for EM; SQL Exec needs queries this contract does not have; and
 * MTTD, which the paper reports beside these but which needs timestamps this
 * contract does not carry.
 *
 * `evidence` is no longer a scored facet: no published metric scores the
 * checkpoint references. They are validated by the structural, temporal and
 * statistical gates, which is where they belong -- and a rule that paid for them
 * was inventing a fourth term.
 */
const OPENRCA2_METRIC: OfficialMetricSpec = {
  id: 'openrca2-outcome-and-graph',
  name: 'OpenRCA 2.0 outcome layer (EM, AnySvc), path reachability and causal-graph F1',
  formula:
    'score = EM (root cause and fault kind both match); anySvc, pr, nodeF1 and edgeF1 are ' +
    'reported beside it because the paper reports the layers apart',
  provenance: 'transcribed',
  source: 'arXiv 2606.27154v2 section 3.2 (OpenRCA 2.0 outcome and process metrics)',
  quote:
    'Exact Match (EM) requires the predicted set to match ground truth exactly; F1, Precision, ' +
    'and Recall are mean fractional scores over the (service, fault_kind) pair set;',
  // The two facets `score` reads. The causal graph is *not* one of them, and that is the
  // paper's structure rather than an omission: EM is the outcome layer, the graph F1s are the
  // process layer, and the paper's own finding is that the two disagree -- a correct service
  // with no verified path. Folding the graph into `score` would reproduce exactly the
  // averaging that hides it, and declaring `chain` a facet of a score that ignores it would
  // make `mutationsDegrade` fail, which is the grid correctly objecting. The graph comparison
  // is asserted by `packages/core/test/openrca2-evaluator.test.ts`, case by case.
  facets: ['component', 'faultType'],
};

function rcaevalMetric(suite: RcaEvalSuite): OfficialMetricSpec {
  return {
    id: `rcaeval-${suite.toLowerCase()}-avg5`,
    name: `RCAEval ${suite} AC@k / Avg@5`,
    formula: 'AC@k = share of cases whose ground-truth service is in ranks[:k]; Avg@5 = mean(AC@1..AC@5)',
    provenance: 'replayed',
    // The corpus registry and the project's own README both point at `phamquiluan/RCAEval`;
    // this string named `cruiseresearchgroup/RCAEval`, a repository whose default branch is
    // `v2`, whose last push was 2026-02-17, and which has no `main` -- a citation nobody
    // followed, against an oracle that now exists at `golden-master/rcaeval-evaluator.json`.
    // Both copies of the evaluator compute the same arithmetic, so no number was ever wrong.
    source: 'phamquiluan/RCAEval RCAEval/benchmark/evaluation.py (pinned in golden-master/rcaeval-evaluator.json)',
    quote: 'AC@k is the average of accuracy@k among cases ... Avg@k = sum_{j=1}^{k} AC@j / k',
    facets: ['ranks'],
  };
}

const RCA100_METRIC: OfficialMetricSpec = {
  id: 'rca100-final-b',
  name: 'RCA100 Final_B',
  formula: 'Final_B = (0.4 * Entity + 0.3 * Fault + 0.3 * Process) * 100',
  provenance: 'transcribed',
  source: 'arXiv 2606.29193 section 5.4 (AIOps2025 / RCA100 scoring protocol)',
  quote: 'Final_B = (0.4 Entity + 0.3 Fault + 0.3 Process) * 100',
  facets: ['component', 'faultType', 'chain', 'evidence'],
};

const AIOPS2025_METRIC: OfficialMetricSpec = {
  id: 'aiops2025-final-a',
  name: 'AIOps2025 Final_A',
  formula: 'Final_A = (0.4 * LA + 0.4 * TA + 0.1 * Exp. + 0.1 * Eff.) * 100',
  provenance: 'transcribed',
  source: 'arXiv 2606.29193 section 4.4 (AIOps2025 scoring protocol)',
  quote: 'Final_A = (0.4 LA + 0.4 TA + 0.1 Exp. + 0.1 Eff.) * 100',
  facets: ['component', 'reason', 'evidence', 'traceLength'],
};

const CLOUDOPSBENCH_METRIC: OfficialMetricSpec = {
  id: 'cloud-opsbench-jra',
  name: 'Cloud-OpsBench Joint RCA Accuracy (JRA)',
  formula: 'JRA = share of cases where the faulty component and the fault type both match',
  provenance: 'replayed',
  // The rule is in released code, not only in the paper: `prediction_scores` in
  // the benchmark's own evaluation module, pinned by commit and digest in
  // `golden-master/cloud-opsbench-evaluator.json` and replayed by
  // `packages/core/test/cloud-opsbench-evaluator.test.ts`.
  source:
    'LLM4Ops/Cloud-OpsBench agents/cloudops_agent/evaluation.py :: prediction_scores ' +
    '(pinned in golden-master/cloud-opsbench-evaluator.json)',
  quote:
    'component_ok = normalize_text(pred.get("fault_object")) == gt_component',
  facets: ['component', 'faultType'],
};

/**
 * ITBench's SRE diagnosis, scored as this repository's own strict conjunction.
 *
 * The metric this used to be called was `itbench-pass-at-1`, and it was not
 * pass@1. arXiv 2502.05352 defines pass@1 in one parenthesis -- "identifying the
 * cause as mentioned in ground truth" -- and Table 3 lists it beside Fault
 * Localization and Fault Propagation Chain as one of four separate metrics. The
 * rule here required the cause *and* the propagation chain *and* the fault
 * conditions, so a case with the right cause and no chain scored 0 where the
 * published pass@1 scores 1: an undercount in one direction only, which is the
 * Cloud-OpsBench defect (finding 182) a third time.
 *
 * The two NTAM metrics cannot be transcribed. The paper says their components
 * "have corresponding hyper-parameters that can be tuned to adjust their
 * contributions", and does not publish the values, so computing them means
 * choosing weights. That is why this target is `derived`: the honest number
 * available here is a strict conjunction of what the export carries, named as
 * such, with the published pass@1 reported beside it.
 *
 * `golden-master/itbench-evaluator.json` pins the paper by digest, quotes the six
 * clauses this depends on, and records eight cases -- three of which the old rule
 * called a failure and the paper calls a pass.
 */
const ITBENCH_METRIC: OfficialMetricSpec = {
  id: 'itbench-diagnosis-strict',
  name: 'ITBench SRE diagnosis, strict (root cause and propagation chain and fault conditions)',
  formula:
    'strict = share of cases whose root cause, propagation chain and fault conditions all match; ' +
    'the published pass@1 (root cause only) is reported beside it',
  provenance: 'derived',
  source:
    'arXiv 2502.05352 section 4.2 and table 3 (ITBench SRE diagnosis metrics; NTAM weights are ' +
    'tunable and unpublished, so the strict conjunction is this repository\'s own)',
  quote:
    'Diagnosis efficiency is measured using pass@1(Chen et al., 2021) (i.e., identifying the cause ' +
    'as mentioned in ground truth), NTAM (Normalized Topology-Aware Metric) for root cause and ' +
    'fault propagation chain, and time to diagnosis',
  facets: ['component', 'chain', 'evidence'],
};

/** The published metric of every score target. */
export const OFFICIAL_METRICS: Readonly<Record<ScoreTargetId, OfficialMetricSpec>> = {
  'openrca-1.0': OPENRCA_METRIC,
  'openrca-2.0': OPENRCA2_METRIC,
  'rcaeval-re1': rcaevalMetric('RE1'),
  'rcaeval-re2': rcaevalMetric('RE2'),
  'rcaeval-re3': rcaevalMetric('RE3'),
  rca100: RCA100_METRIC,
  aiops2025: AIOPS2025_METRIC,
  'cloud-opsbench': CLOUDOPSBENCH_METRIC,
  itbench: ITBENCH_METRIC,
};

/** The published metric of one score target. */
export function officialMetric(target: ScoreTargetId): OfficialMetricSpec {
  return OFFICIAL_METRICS[target];
}

// ---------------------------------------------------------------------------
// Small shared helpers
// ---------------------------------------------------------------------------

function pathsEndingWith(files: Record<string, string>, suffix: string): string[] {
  return Object.keys(files)
    .filter((p) => p.endsWith(suffix))
    .sort();
}

function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
}

function intersectCount(predicted: readonly string[], expected: readonly string[]): number {
  const expectedSet = new Set(expected);
  return predicted.filter((p) => expectedSet.has(p)).length;
}

function firstWords(text: string, count: number): string {
  return text
    .split(/\s+/)
    .filter((w) => w !== '')
    .slice(0, count)
    .join(' ');
}

/** Round to two decimals so reports stay stable and comparable. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// ---------------------------------------------------------------------------
// Ground-truth readers
// ---------------------------------------------------------------------------

/**
 * The three regular expressions the official OpenRCA evaluator uses to recover
 * the ground truth from a `scoring_points` block. Transcribed verbatim from
 * `main/evaluate.py`, because the wording is the contract.
 */
const OPENRCA_COMPONENT_RE = /The (?:\d+-th|only) predicted root cause component is ([^\n]+)/g;
const OPENRCA_REASON_RE = /The (?:\d+-th|only) predicted root cause reason is ([^\n]+)/g;
const OPENRCA_TIME_RE = /The (?:\d+-th|only) root cause occurrence time is within 1 minutes \(i\.e\., <=1min\) of ([^\n]+)/g;

function matchAll(pattern: RegExp, text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(pattern)) {
    const value = m[1];
    if (value !== undefined) out.push(value.trim());
  }
  return out;
}

export interface OpenRcaScoringPoints {
  readonly components: readonly string[];
  readonly reasons: readonly string[];
  readonly times: readonly string[];
}

/** Recover the ground truth from an OpenRCA `scoring_points` block. */
export function parseOpenRcaScoringPoints(text: string): OpenRcaScoringPoints {
  return {
    components: matchAll(OPENRCA_COMPONENT_RE, text),
    reasons: matchAll(OPENRCA_REASON_RE, text),
    times: matchAll(OPENRCA_TIME_RE, text),
  };
}

/**
 * Read the OpenRCA 1.0 ground truth from `groundtruth.csv`.
 *
 * The official dataset carries no case id per row — `main/evaluate.py` aligns
 * predictions and ground truth by row position — so ids are taken from
 * `record.csv` positionally and fall back to `row-N` when the two files were
 * not exported together.
 */
export function readOpenRcaGroundTruth(files: Record<string, string>): OfficialGroundTruth[] {
  const gtPaths = pathsEndingWith(files, '/groundtruth.csv');
  const out: OfficialGroundTruth[] = [];

  for (const gtPath of gtPaths) {
    const systemDir = gtPath.slice(0, gtPath.length - '/groundtruth.csv'.length);
    const recordPath = `${systemDir}/record.csv`;
    const ids = files[recordPath] === undefined ? [] : csvColumn(files[recordPath]!, 'instruction_id');
    const rows = parseCsvObjects(files[gtPath]!);

    rows.forEach((row, index) => {
      const points = parseOpenRcaScoringPoints(row['scoring_points'] ?? '');
      out.push({
        caseId: ids[index] ?? `row-${index + 1}`,
        component: points.components[0] ?? '',
        faultType: '',
        reason: points.reasons[0] ?? '',
        occurredAt: points.times[0] ?? '',
        adjacent: [],
        chain: [],
        evidence: [],
        faultDescriptions: [],
        alternatives: [],
        // Only when the triple cannot stand for the key. A one-root block is
        // exactly the triple, and `declaredCriteria` rebuilds it.
        ...(openRcaRootCount(points) > 1 ? { scoringPoints: points } : {}),
      });
    });
  }

  return out;
}

/**
 * One root cause, as the published evaluator reads it.
 *
 * The three fields are exactly the three the evaluator's prediction regex
 * captures, in the order it captures them, because the scoring rule compares
 * them one for one against the `scoring_points` block.
 */
export interface OpenRcaRoot {
  readonly component: string;
  readonly reason: string;
  readonly occurredAt: string;
}

function readOpenRcaRoot(block: Record<string, unknown>): OpenRcaRoot {
  return {
    component: readString(block, 'root cause component'),
    reason: readString(block, 'root cause reason'),
    occurredAt: readString(block, 'root cause occurrence datetime'),
  };
}

/**
 * Every root cause a prediction cell declares, in the order the evaluator finds them.
 *
 * ## Why all of them, and not the first
 *
 * This read `parsed['1']` and nothing else, which made the whole rule a
 * single-root rule while the published evaluator is not. Measured against the
 * pinned evaluator on 25 cases (`golden-master/openrca-evaluator.json`):
 * a two-root answer submitted in the order the key does not use scored **0**
 * here and **1.0** there, because upstream assigns predictions to scoring points
 * and this compared them by position.
 *
 * A cell that is a numbered object (`{"1": {...}, "2": {...}}`) is read in
 * numeric order; a cell that is one flat object is one root. Anything that does
 * not parse as a JSON object declares no roots at all -- and that is a declared
 * difference rather than an oversight: upstream's regex can pull a block out of
 * prose, and this repository returns nothing for text it cannot parse. The
 * difference is recorded in the corpus with its reason.
 */
export function readOpenRcaRoots(raw: string): OpenRcaRoot[] {
  const parsed = safeJson(raw);
  if (!isRecord(parsed)) return [];
  const numbered = Object.keys(parsed).filter((key) => /^\d+$/.test(key) && isRecord(parsed[key]));
  if (numbered.length === 0) return [readOpenRcaRoot(parsed)];
  return numbered
    .sort((left, right) => Number(left) - Number(right))
    .map((key) => readOpenRcaRoot(parsed[key] as Record<string, unknown>));
}

/** Parse the JSON inside a `record.csv` `prediction` cell into a prediction. */
export function parseOpenRcaPrediction(raw: string): OfficialPrediction {
  const roots = readOpenRcaRoots(raw);
  const first = roots[0] ?? { component: '', reason: '', occurredAt: '' };
  return {
    component: first.component,
    faultType: '',
    reason: first.reason,
    occurredAt: first.occurredAt,
    ranks: [],
    chain: [],
    evidence: [],
    traceWords: 0,
    extraRoots: roots.slice(1),
  };
}

/** Read the exported `record.csv` as the prediction a solver submits. */
export function readOpenRcaSubmission(files: Record<string, string>): OfficialPrediction[] {
  return pathsEndingWith(files, '/record.csv').flatMap((path) =>
    csvColumn(files[path]!, 'prediction').map(parseOpenRcaPrediction),
  );
}

function chainToken(from: string, to: string): string {
  return `${from}->${to}`;
}

/**
 * One RCA100 observability checkpoint, as a comparable token.
 *
 * The published protocol is explicit that the numeric condition is the thing
 * being checked:
 *
 * > 99.5% carry a `⟨comparator, value, unit⟩` numeric constraint, so the agent
 * > must match the numeric condition, not merely mention the metric.
 * > -- arXiv 2606.29193v1 §5.4
 *
 * This repository compared only the signal name, so an answer that mentioned
 * `error_count` with a threshold two orders of magnitude wrong scored the
 * checkpoint. The token carries all four fields, and a hit requires all four to
 * agree: the same metric, the same direction, the same number, the same unit.
 *
 * **Exact equality on the value is the literal reading of "match the numeric
 * condition"**, and it is not forgiving: the dataset's own ground truth carries
 * values such as `0.4964574898785425`. A tolerance is a rule the paper does not
 * state, so inventing one here would be the same defect in the other direction.
 * The consequence is recorded as an open item rather than hidden by a fudge.
 *
 * A missing comparator or value reads as the empty string, which can never equal
 * a declared one -- an unparseable checkpoint is not a hit, it is an absent
 * claim.
 */
function checkpointToken(
  signal: string,
  comparator: string,
  value: unknown,
  unit: string,
): string {
  const valueText = typeof value === 'number' || typeof value === 'string' ? String(value) : '';
  return [signal, comparator, valueText, unit].join('|');
}

function readOpenRca2GroundTruth(files: Record<string, string>): OfficialGroundTruth[] {
  return pathsEndingWith(files, '/causal_path.json').map((path) => {
    const id = path.slice('cases/'.length, path.length - '/causal_path.json'.length);
    const obj = safeJson(files[path]!);
    const root = isRecord(obj) && isRecord(obj.root_cause) ? obj.root_cause : undefined;
    const steps = isRecord(obj) && Array.isArray(obj.causal_path) ? obj.causal_path : [];
    const chain: string[] = [];
    const evidence: string[] = [];
    for (const step of steps) {
      if (!isRecord(step)) continue;
      const from = isRecord(step.from_entity) ? readString(step.from_entity, 'name') : '';
      const to = isRecord(step.to_entity) ? readString(step.to_entity, 'name') : '';
      if (from !== '' && to !== '') chain.push(chainToken(from, to));
      if (!Array.isArray(step.evidence)) continue;
      for (const item of step.evidence) {
        if (isRecord(item)) {
          const ref = readString(item, 'signal_ref');
          if (ref !== '') evidence.push(ref);
        }
      }
    }
    return {
      caseId: id,
      component: root === undefined ? '' : readString(root, 'component'),
      faultType: root === undefined ? '' : readString(root, 'fault_type'),
      reason: '',
      occurredAt: '',
      adjacent: [],
      chain,
      evidence,
      faultDescriptions: [],
      alternatives: [],
    };
  });
}

/**
 * Split an RCAEval *case path* into its labelled parts, in the corpus's own
 * nested layout.
 *
 * ## Why this is not `parseRcaEvalDirectory`
 *
 * That function parses `RE2-order-cpu_1`, which is the name *our exporter*
 * writes, and the round trip used to read the corpus with it. The name is real
 * but it is not the corpus's, and validating a reader against the writer's
 * output is how the mismatch survived every in-repo check: both sides agreed,
 * and both were wrong about the data. The first real download made it visible --
 * `derive the case descriptors` found no case directories under a tree plainly
 * full of them.
 *
 * The real layout is stated twice by the upstream harness. `main.py` finds the
 * cases by globbing `**\/data.csv` and reads the labels back out of the path:
 *
 *     data_dir = dirname(data_path)                                      # …/{service}_{fault}/{run}
 *     service, metric = basename(dirname(dirname(data_path))).split("_")  # service, fault
 *     case = basename(dirname(data_path))                                 # {run}
 *
 * and `docs/TORAI.md` prints the tree for the RE2 conversion:
 *
 *     data/torai-OB/{service}_{fault_type}/{run}/inject_time.txt
 *
 * So a case is three path components -- `{suite}-{system}/{service}_{fault}/{run}`
 * -- and the *suite* is fused to the *system* in the first one. `RE2-OB` on its
 * own is neither a suite nor a case, and `checkoutservice_cpu` on its own carries
 * no run, which is why a per-component parse cannot see this layout at all.
 *
 * ## What each split is anchored on
 *
 * The service/fault split is taken at the **last** underscore, not the first.
 * Neither field is allowed to be ambiguous: `ts-order-service_cpu` must give
 * `ts-order-service` and `cpu`, and `frontend_net_cpu_node` must give the fault
 * `net_cpu_node` rather than a bare `cpu`. Taking the first underscore fails
 * both, one in each direction.
 *
 * The leading `{suite}-{system}` is split at the **first** hyphen, so `RE2-TT`
 * yields the suite `RE2` and the system `TT`. The suite is the part that matters
 * for routing: it is what says whether the corpus is RE1, RE2 or RE3, and three
 * datasets share one extraction directory.
 */
export function parseRcaEvalPath(path: string): {
  suite: string;
  system: string;
  service: string;
  fault: string;
  instance: string;
} | undefined {
  const parts = path.split('/').filter((p) => p !== '');
  if (parts.length !== 3) return undefined;
  const [head, labelled, instance] = parts as [string, string, string];

  const headMatch = /^(RE[123])-([A-Za-z0-9-]+)$/.exec(head);
  if (headMatch === null) return undefined;
  // The **first** underscore, and it was the last one until RE3 said otherwise.
  //
  // The corpus contains `RE3-TT/ts-route-service_f3_1/1`: one directory, out of 90,
  // whose fault label carries an underscore of its own. Splitting at the last one
  // read the service as `ts-route-service_f3` and the fault as `1` -- a service that
  // exists nowhere, which then failed the "the table names the case's component"
  // rule three times for a reason that looked like a data problem (finding 268).
  //
  // First-underscore is the reading the corpus supports, measured: of its 90 case
  // directories exactly one has two underscores, and every service token has none
  // (`adservice`, `frontend-external`, `ts-route-service`). Upstream cannot read
  // that one at all -- `service, metric = basename(...).split("_")` unpacks into two
  // names and raises on three -- so this parser is deliberately more capable than
  // the loader it reproduces, and the difference is one case.
  const underscore = labelled.indexOf('_');
  if (underscore <= 0 || underscore === labelled.length - 1) return undefined;
  if (!/^\d+$/.test(instance)) return undefined;

  return {
    suite: headMatch[1]!,
    system: headMatch[2]!,
    service: labelled.slice(0, underscore),
    fault: labelled.slice(underscore + 1),
    instance,
  };
}

/**
 * Split an RCAEval case directory name into its labelled parts.
 *
 * The layout here is `{suite}-{service}-{fault}_{instance}` -- a *flat* name. It is
 * **not** what this repository writes any more (finding 267 moved the exporter to
 * the corpus's three-level path); it is the shape some third-party RCAEval exports
 * use, kept as a reader so a flat bundle can still be scored. See
 * `parseRcaEvalPath` above for the corpus's nested layout and for why the two
 * have to be separate functions rather than one that guesses.
 *
 * The directory name is the only place the root-cause service is recorded, so
 * the parse is anchored at both ends: the leading suite token and the trailing
 * `_{instance}` index. The service is whatever remains, which keeps services
 * whose names contain hyphens (Train Ticket ships `ts-order-service`) intact.
 */
export function parseRcaEvalDirectory(name: string): {
  suite: string;
  service: string;
  fault: string;
  instance: string;
} | undefined {
  const match = /^(RE[123])-(.*)-([A-Za-z0-9]+)_(\d+)$/.exec(name);
  if (match === null) return undefined;
  return { suite: match[1]!, service: match[2]!, fault: match[3]!, instance: match[4]! };
}

function readRcaEvalGroundTruth(files: Record<string, string>): OfficialGroundTruth[] {
  const out: OfficialGroundTruth[] = [];
  for (const path of pathsEndingWith(files, '/inject_time.txt')) {
    const dir = path.slice(0, path.length - '/inject_time.txt'.length);
    // Both layouts, because both are read from one file map: the corpus's nested
    // paths and the bundle our own exporter produced. Reading only one of them
    // silently scored zero cases for the other, and "zero cases" is not an empty
    // answer -- it is a run that reported success over data it never looked at.
    const parsed = parseRcaEvalPath(dir) ?? parseRcaEvalDirectory(dir);
    if (parsed === undefined) continue;
    out.push({
      caseId: dir,
      component: parsed.service,
      faultType: parsed.fault,
      reason: '',
      occurredAt: files[path]!.trim(),
      adjacent: [],
      chain: [],
      evidence: [],
      faultDescriptions: [],
      alternatives: [],
    });
  }
  return out;
}

function readRca100GroundTruth(files: Record<string, string>): OfficialGroundTruth[] {
  return pathsEndingWith(files, '/topology.json').map((topoPath) => {
    const id = topoPath.slice('cases/'.length, topoPath.length - '/topology.json'.length);
    const topo = safeJson(files[topoPath]!);
    const entities = isRecord(topo) && Array.isArray(topo.entities) ? topo.entities : [];

    // The answer key names the root cause by entity *name* while the topology
    // edges carry entity *ids*, so localisation credit needs both maps.
    const idToName = new Map<string, string>();
    const nameToId = new Map<string, string>();
    for (const entity of entities) {
      if (!isRecord(entity)) continue;
      const entityId = readString(entity, 'id');
      const name = readString(entity, 'name');
      if (entityId !== '' && name !== '') {
        idToName.set(entityId, name);
        nameToId.set(name, entityId);
      }
    }

    const gtRaw = files[`answer_key/${id}.gt.json`];
    const gt = gtRaw === undefined ? undefined : safeJson(gtRaw);
    const rootCause = isRecord(gt) ? readStringArray(gt, 'root_cause_entities')[0] ?? '' : '';
    const faultType = isRecord(gt) ? readStringArray(gt, 'root_cause_types')[0] ?? '' : '';

    const neighbours = new Set<string>();
    const rootId = nameToId.get(rootCause);
    const edges = isRecord(topo) && Array.isArray(topo.edges) ? topo.edges : [];
    if (rootId !== undefined) {
      for (const edge of edges) {
        if (!isRecord(edge)) continue;
        const src = readString(edge, 'src');
        const dst = readString(edge, 'dst');
        // Topology adjacency is undirected for localisation credit: a neighbour
        // is any entity one hop away in either direction.
        const other = src === rootId ? dst : dst === rootId ? src : '';
        if (other === '') continue;
        const otherName = idToName.get(other);
        if (otherName !== undefined) neighbours.add(otherName);
      }
    }

    const raw = isRecord(gt) ? safeJson(readString(gt, 'raw_ground_truth')) : undefined;
    const reasoning = isRecord(raw) && isRecord(raw.reasoning) ? raw.reasoning : undefined;
    const steps = reasoning !== undefined && Array.isArray(reasoning.steps) ? reasoning.steps : [];
    const chain: string[] = [];
    const evidence: string[] = [];
    for (const step of steps) {
      if (!isRecord(step)) continue;
      const from = readString(step, 'from_entity');
      const to = readString(step, 'to_entity');
      if (from !== '' && to !== '') chain.push(chainToken(from, to));
      if (!Array.isArray(step.checkpoints)) continue;
      for (const checkpoint of step.checkpoints) {
        if (isRecord(checkpoint)) {
          const ref = readString(checkpoint, 'signal_ref');
          if (ref === '') continue;
          evidence.push(
            checkpointToken(
              ref,
              readString(checkpoint, 'comparator'),
              checkpoint['value'],
              readString(checkpoint, 'unit'),
            ),
          );
        }
      }
    }

    return {
      caseId: id,
      component: rootCause,
      faultType,
      reason: '',
      occurredAt: '',
      adjacent: [...neighbours],
      chain,
      evidence,
      faultDescriptions: [],
      alternatives: [],
    };
  });
}

function readAioPs2025GroundTruth(files: Record<string, string>): OfficialGroundTruth[] {
  const raw = files['groundtruth.jsonl'];
  if (raw === undefined) return [];
  const out: OfficialGroundTruth[] = [];

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '') continue;
    const obj = safeJson(trimmed);
    if (!isRecord(obj)) continue;

    // pod-level faults are scored on the pod identifier, everything else on the
    // service, exactly as the published protocol requires.
    const podLevel = readString(obj, 'instance_type') === 'pod';
    const component = podLevel ? readString(obj, 'instance') : readString(obj, 'service');

    const observations = isRecord(obj.key_observations) ? obj.key_observations : {};
    const evidence = new Set<string>();
    for (const key of ['log', 'metric', 'trace'] as const) {
      const rows = observations[key];
      if (!Array.isArray(rows)) continue;
      for (const row of rows) {
        if (isRecord(row)) {
          const ref = readString(row, 'ref');
          if (ref !== '') evidence.add(ref);
        }
      }
    }
    for (const metric of readStringArray(obj, 'key_metrics')) evidence.add(metric);

    out.push({
      caseId: readString(obj, 'uuid'),
      component,
      faultType: readString(obj, 'fault_type'),
      reason: readString(obj, 'fault_description'),
      occurredAt: readString(obj, 'start_time'),
      adjacent: [],
      chain: [],
      evidence: [...evidence],
      faultDescriptions: [readString(obj, 'fault_description')].filter((d) => d !== ''),
      // The answer key names both endpoints of a network fault, and §4.4 accepts
      // a hit on either. Duplicates and empties are dropped so the list is a set
      // of *other* accepted strings rather than a second copy of `component`.
      alternatives: [
        ...new Set(
          [readString(obj, 'source'), readString(obj, 'destination')].filter(
            (endpoint) => endpoint !== '' && endpoint !== component,
          ),
        ),
      ],
    });
  }

  return out;
}

function readCloudOpsBenchGroundTruth(files: Record<string, string>): OfficialGroundTruth[] {
  return pathsEndingWith(files, '/metadata.json').map((path) => {
    const id = path.slice('cases/'.length, path.length - '/metadata.json'.length);
    const obj = safeJson(files[path]!);
    const result = isRecord(obj) && isRecord(obj.result) ? obj.result : undefined;
    return {
      caseId: id,
      component: result === undefined ? '' : readString(result, 'fault_object'),
      faultType: result === undefined ? '' : readString(result, 'root_cause'),
      reason: '',
      occurredAt: '',
      adjacent: [],
      chain: [],
      evidence: [],
      faultDescriptions:
        result === undefined ? [] : [readString(result, 'fault_taxonomy')].filter((t) => t !== ''),
      alternatives: [],
    };
  });
}

function readItBenchGroundTruth(files: Record<string, string>): OfficialGroundTruth[] {
  return pathsEndingWith(files, '/scenario.json').map((path) => {
    const id = path.slice('scenarios/'.length, path.length - '/scenario.json'.length);
    const obj = safeJson(files[path]!);
    const groundTruth = isRecord(obj) && isRecord(obj.scenario_groundtruth) ? obj.scenario_groundtruth : undefined;
    const diagnosis = groundTruth !== undefined && isRecord(groundTruth.diagnosis) ? groundTruth.diagnosis : undefined;

    const steps = diagnosis !== undefined && Array.isArray(diagnosis.fault_propagation_chain) ? diagnosis.fault_propagation_chain : [];
    const chain: string[] = [];
    let root = '';
    for (const step of steps) {
      if (!isRecord(step)) continue;
      const from = readString(step, 'from_entity');
      const to = readString(step, 'to_entity');
      if (from !== '' && to !== '') {
        if (root === '') root = from;
        chain.push(chainToken(from, to));
      }
    }
    if (root === '' && diagnosis !== undefined) root = readStringArray(diagnosis, 'entities')[0] ?? '';

    const conditions = diagnosis !== undefined && Array.isArray(diagnosis.fault_conditions) ? diagnosis.fault_conditions : [];
    const evidence = conditions
      .filter(isRecord)
      .map((c) => readString(c, 'signal_ref'))
      .filter((ref) => ref !== '');

    return {
      caseId: id,
      component: root,
      faultType: isRecord(obj) ? readString(obj, 'scenario_class') : '',
      reason: '',
      occurredAt: '',
      adjacent: [],
      chain,
      evidence,
      faultDescriptions: [],
      alternatives: [],
    };
  });
}

/** Read one target's answer key from an exported file map. */
export function readOfficialGroundTruth(target: ScoreTargetId, files: Record<string, string>): OfficialGroundTruth[] {
  switch (target) {
    case 'openrca-1.0':
      return readOpenRcaGroundTruth(files);
    case 'openrca-2.0':
      return readOpenRca2GroundTruth(files);
    case 'rcaeval-re1':
    case 'rcaeval-re2':
    case 'rcaeval-re3':
      return readRcaEvalGroundTruth(files);
    case 'rca100':
      return readRca100GroundTruth(files);
    case 'aiops2025':
      return readAioPs2025GroundTruth(files);
    case 'cloud-opsbench':
      return readCloudOpsBenchGroundTruth(files);
    case 'itbench':
      return readItBenchGroundTruth(files);
  }
  // Same guard as `aggregateFor`, and for the same reason: without it a tenth
  // target added to `SCORE_TARGET_IDS` and forgotten here made this function
  // fall off the end and return `undefined`, typed `OfficialGroundTruth[]`. The
  // caller then crashed on `.map` with "Cannot read properties of undefined" --
  // a message that names neither the target nor the omission. Better to say so.
  const unhandled: never = target;
  throw new Error(`no ground-truth reader for score target '${String(unhandled)}'`);
}

// ---------------------------------------------------------------------------
// Oracle prediction
// ---------------------------------------------------------------------------

/**
 * The prediction a perfect solver submits.
 *
 * `traceWords` is the shortest trace the Efficiency term saturates at rather
 * than a realistic agent trace: the regression asks "can a perfect answer be
 * scored perfect", not "how verbose are real agents".
 */
export function oraclePrediction(gt: OfficialGroundTruth): OfficialPrediction {
  return {
    component: gt.component,
    faultType: gt.faultType,
    reason: gt.reason,
    occurredAt: gt.occurredAt,
    ranks: gt.component === '' ? [] : [gt.component],
    chain: [...gt.chain],
    evidence: [...gt.evidence],
    traceWords: 5,
  };
}

/**
 * Read the submission a solver would hand to the official evaluator.
 *
 * OpenRCA publishes a prediction file format, so the exported `record.csv` *is*
 * the submission. The other eight targets have no published submission file, so
 * the oracle prediction derived from the answer key is used instead.
 */
export function readOfficialSubmission(target: ScoreTargetId, files: Record<string, string>): OfficialPrediction[] {
  if (target === 'openrca-1.0') return readOpenRcaSubmission(files);
  return readOfficialGroundTruth(target, files).map(oraclePrediction);
}

// ---------------------------------------------------------------------------
// Case scorers
// ---------------------------------------------------------------------------

const OPENRCA_TIME_FORMAT = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/;

function wallClockToMs(parts: RegExpExecArray): number {
  return Date.UTC(
    Number(parts[1]),
    Number(parts[2]) - 1,
    Number(parts[3]),
    Number(parts[4]),
    Number(parts[5]),
    Number(parts[6]),
  );
}

/**
 * The official OpenRCA time criterion: both sides are parsed as
 * `%Y-%m-%d %H:%M:%S` wall-clock values and must be within 60 seconds.
 * A value that does not parse can never match.
 */
export function openRcaTimeMatches(predicted: string, expected: string): boolean {
  const p = OPENRCA_TIME_FORMAT.exec(predicted.trim());
  const e = OPENRCA_TIME_FORMAT.exec(expected.trim());
  if (p === null || e === null) return false;
  return Math.abs(wallClockToMs(p) - wallClockToMs(e)) <= 60_000;
}

/** The number of root causes a `scoring_points` block declares. */
export function openRcaRootCount(points: OpenRcaScoringPoints): number {
  return Math.max(points.components.length, points.reasons.length, points.times.length);
}

/**
 * The published OpenRCA score: the best assignment of predictions to criteria.
 *
 * `main/evaluate.py` at `microsoft/OpenRCA` (pinned by commit and digest in
 * `golden-master/openrca-evaluator.json`) does three things this repository did
 * not, and each one changes the number:
 *
 * 1. **The denominator is every declared criterion in every root.** A key with
 *    two roots declares up to six criteria; scoring it out of three reports a
 *    projection, not the metric.
 * 2. **A count mismatch scores zero** -- `if scoringpoints_length ==
 *    prediction_length`, else `scores_get` stays 0. An answer that names one
 *    root for a two-root case earns nothing, which is stricter than any
 *    per-criterion reading and is the rule.
 * 3. **The assignment is chosen, not assumed.** Upstream tries every permutation
 *    of the predictions and keeps the best; a two-root answer submitted in the
 *    other order scores 1.0, and comparing by position scored it 0.
 *
 * The maximisation is computed here as a bitmask DP rather than by enumerating
 * permutations. It is the same quantity -- maximum weight of a perfect matching
 * between predictions and scoring points -- and it is bounded by the key's root
 * count, because a prediction whose length differs returns before this runs.
 *
 * One quirk is reproduced deliberately: a criterion list whose length differs
 * from the root count is **not** scored, while its length still counts in the
 * denominator. A key that declares two components and one reason can therefore
 * never be fully earned, which is what upstream computes.
 */
export function scoreOpenRcaRoots(
  predicted: readonly OpenRcaRoot[],
  points: OpenRcaScoringPoints,
): number {
  const roots = openRcaRootCount(points);
  // `roots === 0` is the only empty case: the denominator is a sum of the three
  // list lengths, so it is zero exactly when the longest of them is.
  if (roots === 0) return 0;
  const denominator =
    points.components.length + points.reasons.length + points.times.length;
  if (predicted.length !== roots) return 0;

  const weight: number[][] = [];
  for (const pred of predicted) {
    const row: number[] = [];
    for (let index = 0; index < roots; index += 1) {
      let earned = 0;
      if (points.components.length === roots && pred.component === points.components[index]) earned += 1;
      if (points.reasons.length === roots && pred.reason === points.reasons[index]) earned += 1;
      if (points.times.length === roots && openRcaTimeMatches(pred.occurredAt, points.times[index]!)) {
        earned += 1;
      }
      row.push(earned);
    }
    weight.push(row);
  }

  const size = 1 << roots;
  const best = new Array<number>(size).fill(-1);
  best[0] = 0;
  // Every state is reachable: the weight matrix is complete, so any subset of
  // scoring points can be served by the predictions already used. That is why
  // there is no "unreachable state" guard here -- it could never be taken, and a
  // branch that cannot be taken is a claim nobody can check.
  for (let mask = 0; mask < size; mask += 1) {
    const assigned = popcount(mask);
    if (assigned >= roots) continue;
    for (let index = 0; index < roots; index += 1) {
      if ((mask & (1 << index)) !== 0) continue;
      const next = mask | (1 << index);
      const candidate = best[mask]! + weight[assigned]![index]!;
      if (candidate > best[next]!) best[next] = candidate;
    }
  }
  return best[size - 1]! / denominator;
}

function popcount(value: number): number {
  let count = 0;
  for (let rest = value; rest !== 0; rest &= rest - 1) count += 1;
  return count;
}

/**
 * OpenRCA 1.0, scored over every root the key and the answer declare.
 *
 * The facets reported beside the score describe **root one** -- that is what the
 * export format carries and what every other target reads -- while the score
 * itself is the official one over all of them. The two can therefore disagree
 * for a multi-root case, and the score is the number that matters.
 */
function declaredCriteria(component: string, reason: string, occurredAt: string): OpenRcaScoringPoints {
  return {
    components: component === '' ? [] : [component],
    reasons: reason === '' ? [] : [reason],
    times: occurredAt === '' ? [] : [occurredAt],
  };
}

function scoreOpenRcaCase(pred: OfficialPrediction, gt: OfficialGroundTruth): OfficialCaseScore {
  const points = gt.scoringPoints ?? declaredCriteria(gt.component, gt.reason, gt.occurredAt);
  const roots: OpenRcaRoot[] = [
    { component: pred.component, reason: pred.reason, occurredAt: pred.occurredAt },
    ...(pred.extraRoots ?? []),
  ];
  const score = scoreOpenRcaRoots(roots, points);
  return {
    caseId: gt.caseId,
    facets: OFFICIAL_METRICS['openrca-1.0'].facets
      .filter((facet) => gtHasFacet(gt, facet))
      .map((facet) => ({ facet, matched: facetMatched(facet, pred, gt) })),
    score,
    correct: score === 1,
  };
}

/**
 * The fraction of an expected list a prediction reproduced, or `undefined` when
 * the answer key declares no such list.
 *
 * `undefined` is not a detail of style. This used to answer `1` for an empty
 * `expected`, which made "the key asked nothing" and "the prediction answered
 * everything" the same number: an RCA100 key with no chain and no checkpoint
 * collected the full 0.3 process weight, identically to a key that declared
 * both and had them matched. A term with no denominator is not complete, it is
 * absent, and the aggregate has to be able to tell the difference.
 */
function rateOf(predicted: readonly string[], expected: readonly string[]): number | undefined {
  if (expected.length === 0) return undefined;
  return intersectCount(predicted, expected) / expected.length;
}

/**
 * The mean of the terms that have a denominator.
 *
 * When none of them do the answer is 0, not 1: the case defined no process to
 * reproduce, so no process credit was earned. Returning 1 here would put the
 * free denominator back one level up.
 */
function meanOfPresent(terms: ReadonlyArray<number | undefined>): number {
  const present = terms.filter((term): term is number => term !== undefined);
  if (present.length === 0) return 0;
  return present.reduce((sum, term) => sum + term, 0) / present.length;
}

/** Exact set F1, with `undefined` standing for "no denominator at all". */
function setF1(predicted: ReadonlySet<string>, expected: ReadonlySet<string>): number | undefined {
  if (predicted.size === 0 && expected.size === 0) return undefined;
  let hit = 0;
  for (const item of predicted) if (expected.has(item)) hit += 1;
  return (2 * hit) / (predicted.size + expected.size);
}

/**
 * Whether the predicted graph carries a path of **length at least one** from
 * `from` to any node in `targets`.
 *
 * Length at least one is what makes PR stronger than AnySvc: a root cause that
 * names itself and propagates nowhere has not grounded the diagnosis, which is the
 * paper's own distinction (`ungrounded diagnosis`). The start node is therefore
 * never a witness on its own -- it can only be reached again by an actual cycle.
 *
 * The walk is breadth-first over the edges the submission declares. It does not
 * consult the answer key's edges, because the question is whether *this* graph
 * connects the cause to an alarm node, not whether it reproduces G*.
 */
function reachesAny(
  predicted: readonly string[],
  from: string,
  targets: ReadonlySet<string>,
): boolean {
  if (from === '' || targets.size === 0) return false;
  const adjacency = new Map<string, string[]>();
  for (const token of predicted) {
    const [source, sink] = token.split('->');
    if (source === undefined || sink === undefined || source === '' || sink === '') continue;
    const out = adjacency.get(source) ?? [];
    out.push(sink);
    adjacency.set(source, out);
  }
  const seen = new Set<string>();
  const queue: string[] = [];
  const enqueue = (nodes: readonly string[]): void => {
    for (const node of nodes) queue.push(node);
  };
  enqueue(adjacency.get(from) ?? []);
  while (queue.length > 0) {
    const node = queue.shift()!;
    if (targets.has(node)) return true;
    if (seen.has(node)) continue;
    seen.add(node);
    // One `push` per successor rather than a spread: the successor list is the
    // submission's, so its length is not bounded by anything this file controls,
    // and a spread would put one argument per edge on the stack.
    for (const next of adjacency.get(node) ?? []) queue.push(next);
  }
  return false;
}

/** The endpoints a chain token names, as a set. */
function chainNodes(chain: readonly string[]): Set<string> {
  const out = new Set<string>();
  for (const token of chain) {
    const [from, to] = token.split('->');
    if (from !== undefined && from !== '') out.add(from);
    if (to !== undefined && to !== '') out.add(to);
  }
  return out;
}

/**
 * One OpenRCA 2.0 case: the outcome layer and the two graph F1s.
 *
 * Both layers are computed here and carried in `terms`, because the aggregate
 * reports both and a second computation is how findings 183 and 184 happened.
 *
 * `em` requires the answer key to *declare* a fault kind. Without that guard two
 * empty strings are equal and a case that asserts nothing would score a perfect
 * exact match -- the Cloud-OpsBench defect, third appearance.
 */
function scoreOpenRca2Case(pred: OfficialPrediction, gt: OfficialGroundTruth): OfficialCaseScore {
  const componentMatches = gt.component !== '' && pred.component === gt.component;
  const kindMatches = gt.faultType !== '' && pred.faultType === gt.faultType;
  const gtNodes = chainNodes(gt.chain);
  const node = setF1(chainNodes(pred.chain), gtNodes);
  const edge = setF1(new Set(pred.chain), new Set(gt.chain));
  const em = componentMatches && kindMatches ? 1 : 0;
  // Absent when the annotation declares no edge: a single-node ground truth has
  // nothing to reach, so PR has no denominator rather than a free point. The same
  // rule the empty evidence denominator follows.
  const pr = gt.chain.length === 0 ? undefined : componentMatches && reachesAny(pred.chain, gt.component, gtNodes) ? 1 : 0;

  return {
    caseId: gt.caseId,
    facets: OFFICIAL_METRICS['openrca-2.0'].facets
      .filter((facet) => gtHasFacet(gt, facet))
      .map((facet) => ({ facet, matched: facetMatched(facet, pred, gt) })),
    score: em,
    correct: em === 1,
    terms: {
      em,
      anySvc: componentMatches ? 1 : 0,
      ...(node === undefined ? {} : { nodeF1: node }),
      ...(edge === undefined ? {} : { edgeF1: edge }),
      ...(pr === undefined ? {} : { pr }),
    },
  };
}

/**
 * One ITBench case, scored as the strict conjunction and the published pass@1.
 *
 * Both numbers are computed here and carried in `terms`, because the aggregate
 * reports both. Computing either one a second time in the aggregate is the defect
 * findings 183 and 184 were written about, and this target is the third place the
 * shape would have appeared.
 *
 * `passAt1` is the published quantity: a single case either identified the cause
 * or it did not. It is deliberately **not** derived from the case's score -- that
 * is what the old rule did, and it turned a right answer into a wrong one
 * whenever the submission was less detailed than the answer key.
 */
function scoreItBenchCase(pred: OfficialPrediction, gt: OfficialGroundTruth): OfficialCaseScore {
  const scored = OFFICIAL_METRICS.itbench.facets.filter((facet) => gtHasFacet(gt, facet));
  const verdicts = scored.map((facet) => ({ facet, matched: facetMatched(facet, pred, gt) }));
  const strict = scored.length === 0 ? 0 : verdicts.filter((v) => v.matched).length / scored.length;
  const chain = rateOf(pred.chain, gt.chain);
  const conditions = rateOf(pred.evidence, gt.evidence);
  return {
    caseId: gt.caseId,
    facets: verdicts,
    score: strict,
    correct: strict === 1,
    terms: {
      // A key that names no cause cannot be identified, so it cannot be a pass
      // either -- the same rule `gtHasFacet` applies to the conjunction.
      passAt1: gt.component !== '' && pred.component === gt.component ? 1 : 0,
      allMatch: strict === 1 ? 1 : 0,
      ...(chain === undefined ? {} : { chain }),
      ...(conditions === undefined ? {} : { conditions }),
    },
  };
}

function scoreFacetSubset(
  pred: OfficialPrediction,
  gt: OfficialGroundTruth,
  facets: readonly OfficialFacet[],
  compare: (facet: OfficialFacet, pred: OfficialPrediction, gt: OfficialGroundTruth) => boolean,
): OfficialCaseScore {
  const scored = facets.filter((facet) => gtHasFacet(gt, facet));
  const verdicts = scored.map((facet) => ({ facet, matched: compare(facet, pred, gt) }));
  const score = scored.length === 0 ? 0 : verdicts.filter((v) => v.matched).length / scored.length;
  return { caseId: gt.caseId, facets: verdicts, score, correct: score === 1 };
}

function gtHasFacet(gt: OfficialGroundTruth, facet: OfficialFacet): boolean {
  switch (facet) {
    case 'component':
      return gt.component !== '';
    case 'faultType':
      return gt.faultType !== '';
    case 'reason':
      return gt.reason !== '';
    case 'occurredAt':
      return gt.occurredAt !== '';
    case 'ranks':
      return gt.component !== '';
    case 'chain':
      return gt.chain.length > 0;
    case 'evidence':
      return gt.evidence.length > 0;
    case 'traceLength':
      return true;
  }
}

/**
 * Cloud-OpsBench's text comparison, ported from the evaluator's `normalize_text`.
 *
 * ```python
 * def normalize_text(value: Any) -> str:
 *     return re.sub(r"\s+", " ", str(value or "").strip().lower())
 * ```
 *
 * Both sides of every comparison go through it, which means the published rule
 * is *case-insensitive and whitespace-collapsing*. This repository compared the
 * two strings with `===`, so `CheckoutService` did not match `checkoutservice`
 * and a trailing space was enough to lose the case. Measured on the pinned
 * evaluator over 22 recorded pairs: **9 of them disagreed, every one of them in
 * the same direction** -- an answer that the benchmark counts as correct was
 * scored wrong here.
 *
 * `\s` is the same set in JavaScript and in Python's `str` mode, so the port is
 * character-for-character; `\u00a0` is in both. The order of strip and collapse
 * does not matter -- collapsing cannot create leading or trailing whitespace,
 * only preserve it -- so the JavaScript reads in the order a reader expects.
 */
function cloudOpsBenchText(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * JRA, with the published comparison rather than an equality of strings.
 *
 * Written out instead of reusing `scoreFacetSubset` with a comparator: the
 * metric declares exactly two facets, and a comparator that delegated to
 * `facetMatched` for anything else would be a second, weaker rule sitting behind
 * the one this target actually applies. The other three per-target scorers are
 * explicit for the same reason.
 *
 * **Two upstream behaviours are deliberately not reproduced**, and both are
 * recorded in the corpus with their direction:
 *
 *  - a key that declares nothing scores 1.0 there, because `"" == ""`. Here a
 *    facet the key does not declare is not scored at all, so the case scores 0.
 *    A benchmark that hands out a point for an empty answer to an empty key is
 *    measuring its own bookkeeping.
 *  - a non-string value is stringified there (`str(8080)`); here the export
 *    contract types both fields as strings, so a number reads as absent. The
 *    difference is in the reader, not in this function.
 */
function scoreCloudOpsBenchCase(pred: OfficialPrediction, gt: OfficialGroundTruth): OfficialCaseScore {
  const verdicts: OfficialFacetVerdict[] = [];
  if (gt.component !== '') {
    verdicts.push({
      facet: 'component',
      matched: cloudOpsBenchText(pred.component) === cloudOpsBenchText(gt.component),
    });
  }
  if (gt.faultType !== '') {
    verdicts.push({
      facet: 'faultType',
      matched: cloudOpsBenchText(pred.faultType) === cloudOpsBenchText(gt.faultType),
    });
  }
  const score = verdicts.length === 0 ? 0 : verdicts.filter((v) => v.matched).length / verdicts.length;
  return { caseId: gt.caseId, facets: verdicts, score, correct: score === 1 };
}

/**
 * The credit for naming a *neighbour* of the root cause, as the protocol states it.
 *
 * > Localization via Entity Localization. A UModel entity-ID match with partial
 * > credit on topologically adjacent entities (0.40).
 * > -- arXiv 2606.29193v1 §5.4
 *
 * This repository paid **0.5**, a number with no source: the sentence above is
 * the only place the protocol quantifies an adjacent match. The alternative
 * reading -- that the parenthetical repeats the dimension's 0.40 weight, two
 * sentences after stating it -- leaves the adjacent credit undefined, which is
 * what 0.5 was. Either way the old number was unsourced, and 0.40 is the number
 * written down.
 */
export const RCA100_ADJACENT_CREDIT = 0.4;

/**
 * The three terms of Final_B for one case, and nothing else.
 *
 * One implementation, used by both the case scorer and the aggregate. They used
 * to be written twice, and the second copy is what made a change to the adjacent
 * credit move only half the report.
 *
 * A term with no denominator is **absent** rather than zero: `rateOf` returns
 * `undefined` for an answer key that declares no chain, and the record simply
 * does not carry the key. Setting it to 0 would punish an export for a thin
 * answer key by inventing a failure; setting it to 1 is the free-denominator
 * defect this repository has already written a finding about.
 */
export function rca100Terms(pred: OfficialPrediction, gt: OfficialGroundTruth): Record<string, number> {
  const entity =
    pred.component === gt.component
      ? 1
      : gt.adjacent.includes(pred.component)
        ? RCA100_ADJACENT_CREDIT
        : 0;
  const terms: Record<string, number> = {
    entity,
    fault: pred.faultType === gt.faultType ? 1 : 0,
  };
  const chain = rateOf(pred.chain, gt.chain);
  const checkpoints = rateOf(pred.evidence, gt.evidence);
  if (chain !== undefined) terms['chain'] = chain;
  if (checkpoints !== undefined) terms['checkpoints'] = checkpoints;
  return terms;
}

/** The Process pillar of one record: the mean of the terms it actually carries. */
function rca100Process(terms: Readonly<Record<string, number>> | undefined): number | undefined {
  if (terms === undefined) return undefined;
  const present = [terms['chain'], terms['checkpoints']].filter(
    (term): term is number => term !== undefined,
  );
  return present.length === 0 ? undefined : present.reduce((sum, term) => sum + term, 0) / present.length;
}

/** Final_B for one case, from its terms and nothing else. */
export function rca100Score(terms: Readonly<Record<string, number>>): number {
  return 0.4 * (terms['entity'] ?? 0) + 0.3 * (terms['fault'] ?? 0) + 0.3 * (rca100Process(terms) ?? 0);
}

function scoreRca100Case(pred: OfficialPrediction, gt: OfficialGroundTruth): OfficialCaseScore {
  const terms = rca100Terms(pred, gt);
  const score = rca100Score(terms);

  return {
    caseId: gt.caseId,
    facets: OFFICIAL_METRICS.rca100.facets
      .filter((facet) => gtHasFacet(gt, facet))
      .map((facet) => ({ facet, matched: facetMatched(facet, pred, gt) })),
    score,
    correct: score === 1,
    terms,
  };
}

function facetMatched(facet: OfficialFacet, pred: OfficialPrediction, gt: OfficialGroundTruth): boolean {
  switch (facet) {
    case 'component':
      return pred.component === gt.component;
    case 'faultType':
      return pred.faultType === gt.faultType;
    case 'reason':
      return pred.reason === gt.reason;
    case 'occurredAt':
      // The published rule is the 60-second tolerance alone. An exact string
      // match is not a rule the evaluator applies, and accepting one would
      // award credit to a timestamp it cannot parse.
      return openRcaTimeMatches(pred.occurredAt, gt.occurredAt);
    case 'ranks':
      // RCAEval scores a ranked candidate list and keeps only the first five
      // entries; the component must appear inside that window.
      return gt.component !== '' && pred.ranks.slice(0, 5).includes(gt.component);
    case 'chain':
      // `undefined` means the key declares no chain, so there is nothing to
      // match and the facet is not answered either way. `gtHasFacet` is what
      // decides whether this facet is scored at all.
      return rateOf(pred.chain, gt.chain) === 1;
    case 'evidence':
      return rateOf(pred.evidence, gt.evidence) === 1;
    case 'traceLength':
      return pred.traceWords <= 5;
  }
}

function keywordHit(reason: string, descriptions: readonly string[]): boolean {
  const head = firstWords(reason, 20).toLowerCase();
  return descriptions.some((description) => {
    const tokens = description.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
    return tokens.length > 0 && tokens.some((token) => head.includes(token));
  });
}

/**
 * Whether the answer named the accepted entity for this case.
 *
 * Strict equality, plus the one relaxation §4.4 grants:
 *
 * > Two fault families need targeted relaxations: for network attacks, LA accepts
 * > a hit on either source or destination since evidence is prominent at both
 * > endpoints.
 *
 * The alternatives come from the answer key's own `source` and `destination`
 * fields, so the relaxation is applied to the cases the dataset marks as network
 * faults and to no others. A case without them has an empty list, and an empty
 * list cannot manufacture a match.
 */
function aioPs2025Localised(pred: OfficialPrediction, gt: OfficialGroundTruth): boolean {
  return pred.component === gt.component || gt.alternatives.includes(pred.component);
}

function scoreAioPs2025Case(pred: OfficialPrediction, gt: OfficialGroundTruth): OfficialCaseScore {
  const la = aioPs2025Localised(pred, gt) ? 1 : 0;
  const ta = keywordHit(pred.reason, gt.faultDescriptions) ? 1 : 0;
  // The protocol counts each cited observation by its first 20 characters.
  const cited = pred.evidence.map((e) => e.slice(0, 20));
  // An answer key that declares no observation leaves this term with no
  // denominator, and the case record drops it rather than crediting it: `1` was
  // the free-denominator defect finding 159 was written about, and it survived
  // here because the aggregate had been fixed and this copy had not. The two
  // implementations are still separate for this target -- the report's Exp. is
  // pooled over the dataset while a case's is a rate, which is a real difference
  // in aggregation, not a drift -- so the fix has to be applied in both places.
  const hits = intersectCount(cited, gt.evidence);
  const exp = rateOf(cited, gt.evidence);
  const eff = la === 1 ? Math.min(1, Math.exp(-(pred.traceWords - 5) / 5)) : 0;
  const score = 0.4 * la + 0.4 * ta + 0.1 * (exp ?? 0) + 0.1 * eff;

  return {
    caseId: gt.caseId,
    facets: OFFICIAL_METRICS.aiops2025.facets
      .filter((facet) => facet === 'traceLength' || gtHasFacet(gt, facet))
      .map((facet) => ({ facet, matched: facetMatched(facet, pred, gt) })),
    score,
    correct: score === 1,
    // All four terms, so the record explains its own score. The aggregate reads
    // `la`, `ta` and `efficiency` from here and **recomputes** `explainability`,
    // because the report's Exp. is pooled over the dataset (`E_m / E_t` in §4.4)
    // while a case's is a rate, and pooling is not the mean of rates. That is the
    // one term this target legitimately computes twice, and the two are different
    // quantities rather than two answers to one question.
    terms: {
      la,
      ta,
      efficiency: eff,
      ...(exp === undefined ? {} : { explainability: exp }),
      // The count, not only the rate. The report's Exp. is pooled (`E_m / E_t`),
      // and pooling a set of rates needs the numerators back; recomputing them in
      // the aggregate meant a second copy of "which cited observation hit", and a
      // mutation that removed the 20-character cut from one copy left the other
      // standing. One count here, one sum there.
      evidenceHits: hits,
    },
  };
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

function scoreOneCase(target: ScoreTargetId, pred: OfficialPrediction, gt: OfficialGroundTruth): OfficialCaseScore {
  switch (target) {
    case 'openrca-1.0':
      return scoreOpenRcaCase(pred, gt);
    case 'openrca-2.0':
      return scoreOpenRca2Case(pred, gt);
    case 'rcaeval-re1':
    case 'rcaeval-re2':
    case 'rcaeval-re3':
      return scoreFacetSubset(pred, gt, OFFICIAL_METRICS[target].facets, facetMatched);
    case 'rca100':
      return scoreRca100Case(pred, gt);
    case 'aiops2025':
      return scoreAioPs2025Case(pred, gt);
    case 'cloud-opsbench':
      return scoreCloudOpsBenchCase(pred, gt);
    case 'itbench':
      return scoreItBenchCase(pred, gt);
  }
}

/**
 * Sub-metrics recomputed at corpus level, the way each benchmark publishes them,
 * together with the one headline number that benchmark reports.
 *
 * Both are computed here rather than in a second pass over a stringly-typed
 * lookup table: every term is a local variable at this point, so the headline
 * cannot silently fall back to zero for a key that was never set.
 */
function aggregateFor(
  target: ScoreTargetId,
  cases: readonly OfficialCaseScore[],
  predictions: readonly OfficialPrediction[],
  groundTruth: readonly OfficialGroundTruth[],
): { breakdown: Record<string, number>; headline: number } {
  const strictRate = cases.filter((c) => c.correct).length / Math.max(1, cases.length);

  if (target === 'openrca-1.0') {
    const strict = round2(strictRate);
    return {
      breakdown: { strict, partial: round2(mean(cases.map((c) => c.score))) },
      headline: strict * 100,
    };
  }

  if (target === 'openrca-2.0') {
    // Read from the case records, never recomputed. The headline is EM, the
    // strictest published outcome metric; the graph F1s are reported beside it
    // because the paper's own finding is that the two layers disagree -- a correct
    // service with no verified path is its headline failure, and an average over
    // four facets reports it as three quarters of a success.
    const em = meanOfPresent(cases.map((c) => c.terms?.['em']));
    const anySvc = meanOfPresent(cases.map((c) => c.terms?.['anySvc']));
    const nodeF1 = meanOfPresent(cases.map((c) => c.terms?.['nodeF1']));
    const edgeF1 = meanOfPresent(cases.map((c) => c.terms?.['edgeF1']));
    const pr = meanOfPresent(cases.map((c) => c.terms?.['pr']));
    return {
      breakdown: {
        em: round2(em),
        anySvc: round2(anySvc),
        // The paper's headline number is the gap between this and `anySvc`.
        pr: round2(pr),
        nodeF1: round2(nodeF1),
        edgeF1: round2(edgeF1),
      },
      headline: round2(em) * 100,
    };
  }

  if (target === 'rcaeval-re1' || target === 'rcaeval-re2' || target === 'rcaeval-re3') {
    // One set of rates, computed once and unrounded; both the per-k numbers and the mean come
    // from those. `avg5` used to be the mean of the *rounded* rates, which is a second number
    // computed out of an already-published one -- and 29 of the 317 case sets in
    // `golden-master/rcaeval-evaluator.json`'s search came out 0.01 away from upstream's own
    // `average(5)` because of it, in both directions.
    //
    // The rule was already written down in this repository: finding 156 says "a mean written
    // beside a distribution rather than computed from it is a second number that can drift",
    // and `check-roundtrip-record.mjs` asserts it of the score block. This was the one place
    // it was broken, and no input the project had ever scored could show it: an oracle export
    // is 1.00 at every k, so the two averages are equal there.
    const rates: number[] = [];
    for (let k = 1; k <= 5; k += 1) {
      const hit = groundTruth.filter((gt, i) => {
        const ranks = predictions[i]?.ranks.slice(0, k) ?? [];
        return gt.component !== '' && ranks.includes(gt.component);
      }).length;
      rates.push(hit / Math.max(1, groundTruth.length));
    }
    const ac: Record<string, number> = {};
    rates.forEach((rate, index) => {
      ac[`ac${String(index + 1)}`] = round2(rate);
    });
    const avg5 = round2(mean(rates));
    ac['avg5'] = avg5;
    return { breakdown: ac, headline: avg5 * 100 };
  }

  if (target === 'rca100') {
    // Read from the per-case terms, never recomputed. Recomputing is what let
    // this branch keep paying 0.5 for an adjacent entity after the case rule
    // moved to the published 0.40 -- and the report then carried two numbers for
    // one quantity, `accuracy` from the case rule and `final` from this branch.
    const entity = meanOfPresent(cases.map((c) => c.terms?.['entity']));
    const fault = meanOfPresent(cases.map((c) => c.terms?.['fault']));
    const chain = meanOfPresent(cases.map((c) => c.terms?.['chain']));
    const checkpoints = meanOfPresent(cases.map((c) => c.terms?.['checkpoints']));
    // The headline is the mean of the per-case scores, which is what `accuracy`
    // already reports. Final_B is a linear combination of the terms, so for a
    // target aggregated by mean the two are the same number -- and two numbers
    // describing one quantity have to agree.
    return {
      breakdown: {
        entity: round2(entity),
        fault: round2(fault),
        process: round2(meanOfPresent(cases.map((c) => rca100Process(c.terms)))),
        chainNodeMatch: round2(chain),
        checkpointHit: round2(checkpoints),
      },
      headline: round2(100 * mean(cases.map((c) => c.score))),
    };
  }

  if (target === 'aiops2025') {
    // Three of the four terms come from the case records; Exp. is pooled below.
    // The LA term used to be recomputed here with a bare equality, which is how a
    // relaxation added to the case rule would have moved only half the report --
    // the defect finding 183 fixed for rca100, avoided here before it happened.
    const la = meanOfPresent(cases.map((c) => c.terms?.['la']));
    const ta = meanOfPresent(cases.map((c) => c.terms?.['ta']));
    const et = groundTruth.reduce((sum, gt) => sum + gt.evidence.length, 0);
    // The numerator is the sum of the per-case counts, so the 20-character rule
    // and the intersection are computed once, in the case record.
    const em = cases.reduce((sum, c) => sum + (c.terms?.['evidenceHits'] ?? 0), 0);
    // "APL is the mean reasoning_trace length over LA-correct cases" (§4.4), and
    // LA-correct now includes the endpoint relaxation -- which is why this reads
    // the case record's `la` rather than repeating the comparison.
    const correctTraces = cases
      .map((c, i) => ({ la: c.terms?.['la'] ?? 0, pred: predictions[i] }))
      .filter(({ la, pred }) => la === 1 && pred !== undefined)
      .map(({ pred }) => pred!.traceWords);
    const apl = mean(correctTraces);
    const eff = correctTraces.length === 0 ? 0 : Math.min(1, Math.exp(-(apl - 5) / 5));
    // Same rule as `rateOf`: a term with no denominator is absent, and every
    // other term here already follows it (`la`, `ta` and `eff` all answer 0 when
    // they have nothing to average). Explainability answered 1, which handed an
    // export that declared no evidence at all a free tenth of the score -- a
    // zero-case AIOps2025 export scored 10 while the other eight targets
    // scored 0.
    const explainability = et === 0 ? 0 : em / et;
    return {
      breakdown: {
        la: round2(la),
        ta: round2(ta),
        explainability: round2(explainability),
        efficiency: round2(eff),
        evidencePoints: et,
        evidenceHits: em,
      },
      headline: round2(100 * (0.4 * la + 0.4 * ta + 0.1 * explainability + 0.1 * eff)),
    };
  }

  if (target === 'cloud-opsbench') {
    // CA and FA are the same two comparisons JRA makes, reported apart, so they
    // go through the same comparison. Reporting them with the exact-match rule
    // while JRA used the published one produced a breakdown whose parts could
    // not sum to its whole: `jra: 1` beside `ca: 0.96` is not a rounding
    // difference, it is two rules in one report.
    const matches = cases.map((c) => {
      const component = c.facets.find((f) => f.facet === 'component');
      const faultType = c.facets.find((f) => f.facet === 'faultType');
      return { component: component?.matched ?? false, faultType: faultType?.matched ?? false };
    });
    const ca = mean(matches.map((m) => (m.component ? 1 : 0)));
    const fa = mean(matches.map((m) => (m.faultType ? 1 : 0)));
    const jra = round2(strictRate);
    return { breakdown: { jra, ca: round2(ca), fa: round2(fa) }, headline: jra * 100 };
  }

  if (target === 'itbench') {
    // Both reported numbers are read from the case records, never recomputed.
    // `passAt1` used to be `strictRate` -- the share of cases where all three
    // facets matched -- under a name the paper defines as the cause alone, so a
    // submission that named the right cause and nothing else was reported as a
    // failure of pass@1.
    const passAt1 = meanOfPresent(cases.map((c) => c.terms?.['passAt1']));
    const strict = meanOfPresent(cases.map((c) => c.terms?.['allMatch']));
    return {
      breakdown: {
        passAt1: round2(passAt1),
        strict: round2(strict),
        chainMatch: round2(meanOfPresent(cases.map((c) => c.terms?.['chain']))),
        conditionMatch: round2(meanOfPresent(cases.map((c) => c.terms?.['conditions']))),
      },
      headline: round2(strict) * 100,
    };
  }

  // Nothing above matched. Every target is named, so this is `never` -- and the
  // line below is what keeps it that way: adding a tenth target to
  // `SCORE_TARGET_IDS` makes `target` non-`never` here and stops the build.
  //
  // Before this, the chain simply ended and the assignment `const unhandled:
  // never = target` did not exist, so an unnamed target inherited the generic
  // strict formula in silence. That is how `openrca-2.0` came to report strict
  // accuracy while its own spec advertises `matched facets / scored facets`.
  //
  // Two statements stay uncovered on purpose. Every member of the closed union
  // returns from a branch above, so no input reaches this line: the reader
  // rejects an unnamed target first, which the suite pins from both directions
  // (the rejection names the reader, and every named target passes through this
  // chain and returns). That makes this a compile-time backstop, not a runtime
  // branch, and an uncovered backstop is not a coverage debt -- it is the shape
  // of the guarantee. Deleting it to turn the number green would restore exactly
  // what it was added to stop.
  const unhandled: never = target;
  throw new Error(`no aggregation branch for score target '${String(unhandled)}'`);
}

/**
 * Score an exported dataset with the target's published metric.
 *
 * The export is read through the same artefacts the official evaluator consumes,
 * so this is a real end-to-end run of the published rule and not a restatement
 * of the structural checks.
 */
export function scoreOfficial(
  target: ScoreTargetId,
  files: Record<string, string>,
  predictions?: readonly OfficialPrediction[],
): OfficialScoreReport {
  const groundTruth = readOfficialGroundTruth(target, files);
  const submission = predictions ?? readOfficialSubmission(target, files);
  const cases = groundTruth.map((gt, index) => scoreOneCase(target, submission[index] ?? emptyPrediction(), gt));
  const { breakdown, headline } = aggregateFor(target, cases, submission, groundTruth);

  return {
    target,
    metric: OFFICIAL_METRICS[target],
    cases,
    caseCount: cases.length,
    accuracy: round2(mean(cases.map((c) => c.score))),
    final: round2(headline),
    breakdown,
  };
}

function emptyPrediction(): OfficialPrediction {
  return { component: '', faultType: '', reason: '', occurredAt: '', ranks: [], chain: [], evidence: [], traceWords: 0 };
}

// ---------------------------------------------------------------------------
// Oracle + mutation regression
// ---------------------------------------------------------------------------

const MUTATION_SUFFIX = 'unrelated-candidate';

function shiftHour(value: string): string {
  const match = OPENRCA_TIME_FORMAT.exec(value.trim());
  if (match === null) return `${value}-shifted`;
  const shifted = new Date(wallClockToMs(match) + 3_600_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())} ${pad(
    shifted.getUTCHours(),
  )}:${pad(shifted.getUTCMinutes())}:${pad(shifted.getUTCSeconds())}`;
}

/**
 * Perturb exactly one facet.
 *
 * Every mutation *replaces* its value instead of extending it. Extending would
 * be silently ineffective against the AIOps2025 Type Accuracy rule, which gives
 * full credit for a keyword hit anywhere in the first 20 words.
 */
export function mutatePrediction(pred: OfficialPrediction, facet: OfficialFacet): OfficialPrediction {
  switch (facet) {
    case 'component':
      return { ...pred, component: MUTATION_SUFFIX };
    case 'faultType':
      return { ...pred, faultType: MUTATION_SUFFIX };
    case 'reason':
      return { ...pred, reason: MUTATION_SUFFIX };
    case 'occurredAt':
      return { ...pred, occurredAt: shiftHour(pred.occurredAt) };
    case 'ranks':
      return { ...pred, ranks: [MUTATION_SUFFIX] };
    case 'chain':
      return { ...pred, chain: [MUTATION_SUFFIX] };
    case 'evidence':
      return { ...pred, evidence: [MUTATION_SUFFIX] };
    case 'traceLength':
      return { ...pred, traceWords: 500 };
  }
}

export interface OfficialMutationResult {
  readonly facet: OfficialFacet;
  /** `scored` when the target's rule uses this facet for this case. */
  readonly role: 'scored' | 'unscored';
  readonly score: number;
  /** For a scored facet, whether the mutation actually lowered the score. */
  readonly degraded: boolean;
}

export interface OfficialRegressionCase {
  readonly caseId: string;
  readonly oracleScore: number;
  readonly mutations: readonly OfficialMutationResult[];
}

/**
 * Judge one case's oracle score and mutation grid.
 *
 * This is the whole verdict, stated as a pure function so it can be read — and
 * tested — without building an export first. Two failures are possible for the
 * oracle, and two per mutation:
 *
 *  - the answer key itself does not score 1.0, so the rule reads the export
 *    differently from the way the exporter writes it;
 *  - a facet the rule declares **was** mutated without lowering the score, so
 *    the rule is not actually reading it;
 *  - a facet the rule declares it **ignores** lowered the score anyway, so the
 *    declared facet list is too narrow and the breakdown is misleading.
 *
 * The last one cannot be produced by a correct rule, which is exactly why it
 * has to be checked: it is the only guard against a future edit that adds a
 * facet to the scorer and forgets to declare it.
 */
export function officialCaseFailures(entry: OfficialRegressionCase): string[] {
  const failures: string[] = [];
  if (entry.oracleScore !== 1) {
    failures.push(`case ${entry.caseId}: the oracle prediction scored ${entry.oracleScore}, expected 1`);
  }
  for (const mutation of entry.mutations) {
    if (mutation.role === 'scored' && !mutation.degraded) {
      failures.push(
        `case ${entry.caseId}: mutating '${mutation.facet}' did not lower the score (${mutation.score})`,
      );
    }
    if (mutation.role === 'unscored' && mutation.degraded) {
      failures.push(`case ${entry.caseId}: mutating '${mutation.facet}' lowered the score but the rule ignores it`);
    }
  }
  return failures;
}

export type OfficialRegressionStatus = 'passed' | 'skipped' | 'failed';

export interface OfficialRegressionOptions {
  /**
   * Why this target may legitimately export zero cases for this dataset, for
   * example `RE3 targets code-level faults only`. Without a stated reason an
   * empty export is a failure, so a broken exporter cannot hide behind a skip.
   */
  readonly allowEmptyReason?: string;
}

export interface OfficialRegressionReport {
  readonly target: ScoreTargetId;
  readonly metric: OfficialMetricSpec;
  readonly caseCount: number;
  readonly status: OfficialRegressionStatus;
  /** Populated only when the target was skipped. */
  readonly skipReason?: string;
  readonly cases: readonly OfficialRegressionCase[];
  /** Every case scores 1.0 when the answer key is submitted as the prediction. */
  readonly oraclePerfect: boolean;
  /** Every facet the rule scores is sensitive to being perturbed. */
  readonly mutationsDegrade: boolean;
  /** Every facet the rule ignores is insensitive, proving the facet list is exact. */
  readonly unscoredFacetsInert: boolean;
  /** No case has an empty evidence denominator (which would make Exp. undefined). */
  readonly evidenceComplete: boolean;
  readonly passed: boolean;
  readonly failures: readonly string[];
}

/**
 * Run the official-metric regression for one target.
 *
 * Two properties make this more than a tautology:
 *
 *  - **Oracle.** Submitting the answer key itself must score 1.0. A missing or
 *    malformed field in the exported answer key breaks this immediately.
 *  - **Mutation grid.** Perturbing a facet the rule scores must lower the
 *    score, and perturbing a facet it ignores must not. The first half proves
 *    the metric is not vacuously returning 1; the second half proves the
 *    declared facet list is neither too wide nor too narrow.
 */
export function runOfficialRegression(
  target: ScoreTargetId,
  files: Record<string, string>,
  options: OfficialRegressionOptions = {},
): OfficialRegressionReport {
  const metric = OFFICIAL_METRICS[target];
  const groundTruth = readOfficialGroundTruth(target, files);
  const submission = readOfficialSubmission(target, files);
  const failures: string[] = [];

  // An empty export is a skip only when the caller states why it is legitimate;
  // otherwise it is a failed export, and the report says so.
  if (groundTruth.length === 0) {
    const reason = options.allowEmptyReason;
    if (reason !== undefined && reason !== '') {
      return {
        target,
        metric,
        caseCount: 0,
        status: 'skipped',
        skipReason: reason,
        cases: [],
        oraclePerfect: true,
        mutationsDegrade: true,
        unscoredFacetsInert: true,
        evidenceComplete: true,
        passed: true,
        failures: [],
      };
    }
    return {
      target,
      metric,
      caseCount: 0,
      status: 'failed',
      cases: [],
      oraclePerfect: false,
      mutationsDegrade: false,
      unscoredFacetsInert: true,
      evidenceComplete: true,
      passed: false,
      failures: ['no cases were exported, so the official metric cannot be exercised'],
    };
  }

  const cases: OfficialRegressionCase[] = groundTruth.map((gt, index) => {
    // Score what the export actually ships, not a prediction rebuilt from the
    // answer key. For the eight targets with no published submission format the
    // two are the same by construction, and `readOfficialSubmission` says so.
    // For OpenRCA 1.0 they are not: the shipped `record.csv` is the submission,
    // and reading the answer key instead made the anchor vacuously true -- it
    // answered `oraclePerfect: true` for an export whose prediction named the
    // wrong component, and for one with no `record.csv` at all.
    const oracle = submission[index] ?? emptyPrediction();
    const oracleScore = scoreOneCase(target, oracle, gt).score;

    const mutations: OfficialMutationResult[] = OFFICIAL_FACETS.map((facet) => {
      const scored = metric.facets.includes(facet) && gtHasFacet(gt, facet);
      const mutated = mutatePrediction(oracle, facet);
      const score = scoreOneCase(target, mutated, gt).score;
      return {
        facet,
        role: scored ? 'scored' : 'unscored',
        score,
        degraded: score < oracleScore,
      };
    });

    return { caseId: gt.caseId, oracleScore, mutations };
  });

  for (const entry of cases) {
    failures.push(...officialCaseFailures(entry));
  }

  const evidenceComplete = groundTruth.every(
    (gt) => !metric.facets.includes('evidence') || gt.evidence.length > 0,
  );
  if (!evidenceComplete) {
    failures.push('a case declares no evidence points, so the evidence coverage term has no denominator');
  }
  const oraclePerfect = cases.every((c) => c.oracleScore === 1);
  const mutationsDegrade = cases.every((c) => c.mutations.every((m) => m.role !== 'scored' || m.degraded));
  const unscoredFacetsInert = cases.every((c) => c.mutations.every((m) => m.role !== 'unscored' || !m.degraded));

  const status: OfficialRegressionStatus = failures.length === 0 ? 'passed' : 'failed';
  return {
    target,
    metric,
    caseCount: cases.length,
    status,
    cases,
    oraclePerfect,
    mutationsDegrade,
    unscoredFacetsInert,
    evidenceComplete,
    passed: status !== 'failed',
    failures,
  };
}

/** Run the regression for every target at once. */
export function runAllOfficialRegressions(
  exports: Readonly<Record<ScoreTargetId, Record<string, string>>>,
  options: OfficialRegressionOptions = {},
): OfficialRegressionReport[] {
  return (Object.keys(OFFICIAL_METRICS) as ScoreTargetId[]).map((target) =>
    runOfficialRegression(target, exports[target] ?? {}, options),
  );
}
