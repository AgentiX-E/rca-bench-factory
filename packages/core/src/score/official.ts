import type { ScoreTargetId } from './score.js';
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
 * Every rule records its provenance. `official` means the rule is transcribed
 * from a published source (paper or released evaluator) and the citation is
 * carried in `source`. `derived` means the benchmark publishes the weights or
 * the pillars but not the closed form, so this repository supplies an explicit,
 * documented aggregation instead of quietly inventing one.
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

export type OfficialProvenance = 'official' | 'derived';

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
  provenance: 'official',
  source: 'microsoft/OpenRCA main/evaluate.py',
  quote:
    'if perm[i][\'root cause component\'] == components[i]: current_score += 1 ... ' +
    'if time_difference(times[i], perm[i][\'root cause occurrence datetime\']): current_score += 1 ... ' +
    'final_score = scores_get / socres_num',
  facets: ['component', 'reason', 'occurredAt'],
};

const OPENRCA2_METRIC: OfficialMetricSpec = {
  id: 'openrca2-pave-verification',
  name: 'OpenRCA 2.0 PAVE causal-path verification',
  formula: 'score = matched facets / scored facets (root cause, fault type, causal chain, evidence)',
  provenance: 'derived',
  source: 'docs/targets/openrca-2.0.md — the official OpenRCA 2.0 scorer is not open-sourced',
  quote: 'The official OpenRCA 2.0 evaluation framework and scorer are not open-sourced.',
  facets: ['component', 'faultType', 'chain', 'evidence'],
};

function rcaevalMetric(suite: 'RE1' | 'RE2' | 'RE3'): OfficialMetricSpec {
  return {
    id: `rcaeval-${suite.toLowerCase()}-avg5`,
    name: `RCAEval ${suite} AC@k / Avg@5`,
    formula: 'AC@k = share of cases whose ground-truth service is in ranks[:k]; Avg@5 = mean(AC@1..AC@5)',
    provenance: 'official',
    source: 'cruiseresearchgroup/RCAEval RCAEval/benchmark/evaluation.py',
    quote: 'AC@k is the average of accuracy@k among cases ... Avg@k = sum_{j=1}^{k} AC@j / k',
    facets: ['ranks'],
  };
}

const RCA100_METRIC: OfficialMetricSpec = {
  id: 'rca100-final-b',
  name: 'RCA100 Final_B',
  formula: 'Final_B = (0.4 * Entity + 0.3 * Fault + 0.3 * Process) * 100',
  provenance: 'official',
  source: 'arXiv 2606.29193 section 5.4 (AIOps2025 / RCA100 scoring protocol)',
  quote: 'Final_B = (0.4 Entity + 0.3 Fault + 0.3 Process) * 100',
  facets: ['component', 'faultType', 'chain', 'evidence'],
};

const AIOPS2025_METRIC: OfficialMetricSpec = {
  id: 'aiops2025-final-a',
  name: 'AIOps2025 Final_A',
  formula: 'Final_A = (0.4 * LA + 0.4 * TA + 0.1 * Exp. + 0.1 * Eff.) * 100',
  provenance: 'official',
  source: 'arXiv 2606.29193 section 4.4 (AIOps2025 scoring protocol)',
  quote: 'Final_A = (0.4 LA + 0.4 TA + 0.1 Exp. + 0.1 Eff.) * 100',
  facets: ['component', 'reason', 'evidence', 'traceLength'],
};

const CLOUDOPSBENCH_METRIC: OfficialMetricSpec = {
  id: 'cloud-opsbench-jra',
  name: 'Cloud-OpsBench Joint RCA Accuracy (JRA)',
  formula: 'JRA = share of cases where the faulty component and the fault type both match',
  provenance: 'official',
  source: 'arXiv 2603.00468 section 4.1.1 (Cloud-OpsBench outcome correctness)',
  quote:
    'Our primary metric is Joint RCA Accuracy (JRA), the fraction of episodes for which ' +
    'R_hat_j = R*_j, equivalently, C_hat_j = C*_j and F_hat_j = F*_j.',
  facets: ['component', 'faultType'],
};

const ITBENCH_METRIC: OfficialMetricSpec = {
  id: 'itbench-pass-at-1',
  name: 'ITBench diagnosis pass@1 with chain and condition coverage',
  formula: 'pass@1 = share of cases whose entities, propagation chain and fault conditions all match',
  provenance: 'derived',
  source: 'arXiv 2502.05352 section 4.2 (ITBench SRE diagnosis metrics)',
  quote:
    'Diagnosis efficiency is measured using pass@1 (i.e., identifying the cause as mentioned in ' +
    'ground truth), NTAM (Normalized Topology-Aware Metric) for root cause and fault propagation chain',
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
      });
    });
  }

  return out;
}

/** Parse the JSON inside a `record.csv` `prediction` cell into a prediction. */
export function parseOpenRcaPrediction(raw: string): OfficialPrediction {
  const parsed = safeJson(raw);
  const first = isRecord(parsed) ? parsed['1'] : undefined;
  const triple = isRecord(first) ? first : isRecord(parsed) ? parsed : undefined;
  return {
    component: triple === undefined ? '' : readString(triple, 'root cause component'),
    faultType: '',
    reason: triple === undefined ? '' : readString(triple, 'root cause reason'),
    occurredAt: triple === undefined ? '' : readString(triple, 'root cause occurrence datetime'),
    ranks: [],
    chain: [],
    evidence: [],
    traceWords: 0,
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
    };
  });
}

/**
 * Split an RCAEval case directory name into its labelled parts.
 *
 * The official layout is `{suite}-{service}-{fault}_{instance}` and the
 * directory name is the only place the root-cause service is recorded, so the
 * parse is anchored at both ends: the leading suite token and the trailing
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
    const parsed = parseRcaEvalDirectory(dir);
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
          if (ref !== '') evidence.push(ref);
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

function rateOf(predicted: readonly string[], expected: readonly string[]): number {
  return expected.length === 0 ? 1 : intersectCount(predicted, expected) / expected.length;
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

function scoreRca100Case(pred: OfficialPrediction, gt: OfficialGroundTruth): OfficialCaseScore {
  const entity = pred.component === gt.component ? 1 : gt.adjacent.includes(pred.component) ? 0.5 : 0;
  const fault = pred.faultType === gt.faultType ? 1 : 0;
  const chainRate = rateOf(pred.chain, gt.chain);
  const checkpointRate = rateOf(pred.evidence, gt.evidence);
  const process = (chainRate + checkpointRate) / 2;
  const score = 0.4 * entity + 0.3 * fault + 0.3 * process;

  return {
    caseId: gt.caseId,
    facets: OFFICIAL_METRICS.rca100.facets
      .filter((facet) => gtHasFacet(gt, facet))
      .map((facet) => ({ facet, matched: facetMatched(facet, pred, gt) })),
    score,
    correct: score === 1,
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

function scoreAioPs2025Case(pred: OfficialPrediction, gt: OfficialGroundTruth): OfficialCaseScore {
  const la = pred.component === gt.component ? 1 : 0;
  const ta = keywordHit(pred.reason, gt.faultDescriptions) ? 1 : 0;
  // The protocol counts each cited observation by its first 20 characters.
  const cited = pred.evidence.map((e) => e.slice(0, 20));
  const exp = gt.evidence.length === 0 ? 1 : intersectCount(cited, gt.evidence) / gt.evidence.length;
  const eff = la === 1 ? Math.min(1, Math.exp(-(pred.traceWords - 5) / 5)) : 0;
  const score = 0.4 * la + 0.4 * ta + 0.1 * exp + 0.1 * eff;

  return {
    caseId: gt.caseId,
    facets: OFFICIAL_METRICS.aiops2025.facets
      .filter((facet) => facet === 'traceLength' || gtHasFacet(gt, facet))
      .map((facet) => ({ facet, matched: facetMatched(facet, pred, gt) })),
    score,
    correct: score === 1,
  };
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

function scoreOneCase(target: ScoreTargetId, pred: OfficialPrediction, gt: OfficialGroundTruth): OfficialCaseScore {
  switch (target) {
    case 'openrca-1.0':
      return scoreFacetSubset(pred, gt, OFFICIAL_METRICS['openrca-1.0'].facets, facetMatched);
    case 'openrca-2.0':
      return scoreFacetSubset(pred, gt, OFFICIAL_METRICS['openrca-2.0'].facets, facetMatched);
    case 'rcaeval-re1':
    case 'rcaeval-re2':
    case 'rcaeval-re3':
      return scoreFacetSubset(pred, gt, OFFICIAL_METRICS[target].facets, facetMatched);
    case 'rca100':
      return scoreRca100Case(pred, gt);
    case 'aiops2025':
      return scoreAioPs2025Case(pred, gt);
    case 'cloud-opsbench':
      return scoreFacetSubset(pred, gt, OFFICIAL_METRICS['cloud-opsbench'].facets, facetMatched);
    case 'itbench':
      return scoreFacetSubset(pred, gt, OFFICIAL_METRICS.itbench.facets, facetMatched);
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

  if (target === 'rcaeval-re1' || target === 'rcaeval-re2' || target === 'rcaeval-re3') {
    const ac: Record<string, number> = {};
    for (let k = 1; k <= 5; k += 1) {
      const hit = groundTruth.filter((gt, i) => {
        const ranks = predictions[i]?.ranks.slice(0, k) ?? [];
        return gt.component !== '' && ranks.includes(gt.component);
      }).length;
      ac[`ac${k}`] = round2(hit / Math.max(1, groundTruth.length));
    }
    const avg5 = round2(mean([1, 2, 3, 4, 5].map((k) => ac[`ac${k}`]!)));
    ac.avg5 = avg5;
    return { breakdown: ac, headline: avg5 * 100 };
  }

  if (target === 'rca100') {
    const entity = mean(
      groundTruth.map((gt, i) => {
        const pred = predictions[i]?.component ?? '';
        return pred === gt.component ? 1 : gt.adjacent.includes(pred) ? 0.5 : 0;
      }),
    );
    const fault = mean(groundTruth.map((gt, i) => ((predictions[i]?.faultType ?? '') === gt.faultType ? 1 : 0)));
    const chain = mean(groundTruth.map((gt, i) => rateOf(predictions[i]?.chain ?? [], gt.chain)));
    const checkpoints = mean(groundTruth.map((gt, i) => rateOf(predictions[i]?.evidence ?? [], gt.evidence)));
    const process = (chain + checkpoints) / 2;
    return {
      breakdown: {
        entity: round2(entity),
        fault: round2(fault),
        process: round2(process),
        chainNodeMatch: round2(chain),
        checkpointHit: round2(checkpoints),
      },
      headline: round2(100 * (0.4 * entity + 0.3 * fault + 0.3 * process)),
    };
  }

  if (target === 'aiops2025') {
    const la = mean(groundTruth.map((gt, i) => ((predictions[i]?.component ?? '') === gt.component ? 1 : 0)));
    const ta = mean(groundTruth.map((gt, i) => keywordHit(predictions[i]?.reason ?? '', gt.faultDescriptions) ? 1 : 0));
    const et = groundTruth.reduce((sum, gt) => sum + gt.evidence.length, 0);
    const em = groundTruth.reduce(
      (sum, gt, i) => sum + intersectCount((predictions[i]?.evidence ?? []).map((e) => e.slice(0, 20)), gt.evidence),
      0,
    );
    const correctTraces = groundTruth
      .map((gt, i) => ({ gt, pred: predictions[i] }))
      .filter(({ gt, pred }) => pred !== undefined && pred.component === gt.component)
      .map(({ pred }) => pred!.traceWords);
    const apl = mean(correctTraces);
    const eff = correctTraces.length === 0 ? 0 : Math.min(1, Math.exp(-(apl - 5) / 5));
    const explainability = et === 0 ? 1 : em / et;
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
    const ca = mean(groundTruth.map((gt, i) => ((predictions[i]?.component ?? '') === gt.component ? 1 : 0)));
    const fa = mean(groundTruth.map((gt, i) => ((predictions[i]?.faultType ?? '') === gt.faultType ? 1 : 0)));
    const jra = round2(strictRate);
    return { breakdown: { jra, ca: round2(ca), fa: round2(fa) }, headline: jra * 100 };
  }

  if (target === 'itbench') {
    return {
      breakdown: {
        passAt1: round2(strictRate),
        chainMatch: round2(mean(groundTruth.map((gt, i) => rateOf(predictions[i]?.chain ?? [], gt.chain)))),
        conditionMatch: round2(mean(groundTruth.map((gt, i) => rateOf(predictions[i]?.evidence ?? [], gt.evidence)))),
      },
      headline: round2(strictRate) * 100,
    };
  }

  const strict = round2(strictRate);
  return { breakdown: { strict }, headline: strict * 100 };
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

  const cases: OfficialRegressionCase[] = groundTruth.map((gt) => {
    const oracle = oraclePrediction(gt);
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
