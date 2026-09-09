import { createHash } from 'node:crypto';
import type { RcaEvalSuite } from '../export/rcaeval.js';

/**
 * Score and verification module.
 *
 * Turns "the export looks right" into a quantitative, reproducible verdict:
 *   1. Structure checks verify the emitted dataset honours the target field
 *      contract (file layout, column headers, answer-key isolation, modality).
 *   2. Checksum verification proves the emitted bytes are byte-stable against
 *      committed Golden Master anchors (external grounding, never self-approved).
 *   3. `scoreExport` combines both into a 0-100 score.
 *
 * All checks are pure functions of the exported file map - no mocks, no IO.
 */

export type ScoreTargetId = 'openrca-1.0' | 'openrca-2.0' | 'rcaeval-re1' | 'rcaeval-re2' | 'rcaeval-re3' | 'rca100' | 'aiops2025' | 'cloud-opsbench' | 'itbench';

export interface ScoreCheck {
  id: string;
  passed: boolean;
  detail: string;
}

export interface StructureReport {
  target: ScoreTargetId;
  passed: boolean;
  checks: ScoreCheck[];
}

export interface ChecksumReport {
  passed: boolean;
  matched: number;
  mismatched: string[];
  missing: string[];
  extra: string[];
}

export interface ScoreReport {
  target: ScoreTargetId;
  passed: boolean;
  score: number;
  structure: StructureReport;
  checksum?: ChecksumReport;
}

const OPENRCA_QUERY_HEADER = 'instruction_id,query,occurrence_datetime';
const OPENRCA_RECORD_HEADER = 'instruction_id,prediction';
const OPENRCA_METRIC_HEADER = 'timestamp,cmdb_id,kpi_name,value';
const OPENRCA_LOG_HEADER = 'timestamp,cmdb_id,severity,message';
const OPENRCA_TRACE_HEADER = 'timestamp,trace_id,span_id,parent_span_id,cmdb_id,span_name,duration_ms,status';

const RCAEVAL_LOGS_HEADER = 'timestamp,service,severity,message';
const RCAEVAL_TRACES_HEADER = 'timestamp,trace_id,span_id,parent_span_id,service,span_name,duration_ms,status';

function rcaevalTarget(suite: RcaEvalSuite): ScoreTargetId {
  return `rcaeval-${suite.toLowerCase()}` as ScoreTargetId;
}

function check(id: string, passed: boolean, detail: string): ScoreCheck {
  return { id, passed, detail };
}

function pathsEndingWith(files: Record<string, string>, suffix: string): string[] {
  return Object.keys(files).filter((p) => p.endsWith(suffix));
}

function csvHeader(csv: string): string[] {
  // `split` always returns at least `['']`, so index 0 is never undefined.
  return csv.split('\n')[0]!.split(',');
}

function first(files: Record<string, string>, paths: string[]): string | undefined {
  const path = paths[0];
  return path === undefined ? undefined : files[path];
}

/** SHA-256 of a UTF-8 string, hex-encoded. */
export function sha256(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Verify an OpenRCA 1.0 export against the structural field contract.
 *
 * The answer key is required to stay physically separate: `query.csv` (tasks)
 * must never contain the root-cause component, which lives in `record.csv`.
 */
export function checkOpenRcaStructure(files: Record<string, string>): StructureReport {
  const checks: ScoreCheck[] = [];
  const queryFiles = pathsEndingWith(files, '/query.csv');
  const recordFiles = pathsEndingWith(files, '/record.csv');
  const metricFiles = Object.keys(files).filter((p) => p.includes('/telemetry/metric/'));
  const logFiles = Object.keys(files).filter((p) => p.includes('/telemetry/log/'));
  const traceFiles = Object.keys(files).filter((p) => p.includes('/telemetry/trace/'));

  checks.push(check('query-csv', queryFiles.length > 0, `found ${queryFiles.length} query.csv`));
  checks.push(check('record-csv', recordFiles.length > 0, `found ${recordFiles.length} record.csv`));

  const queryHeader = first(files, queryFiles);
  checks.push(
    check(
      'query-header',
      queryHeader !== undefined && csvHeader(queryHeader).join(',') === OPENRCA_QUERY_HEADER,
      `expected '${OPENRCA_QUERY_HEADER}'`,
    ),
  );

  const recordHeader = first(files, recordFiles);
  checks.push(
    check(
      'record-header',
      recordHeader !== undefined && csvHeader(recordHeader).join(',') === OPENRCA_RECORD_HEADER,
      `expected '${OPENRCA_RECORD_HEADER}'`,
    ),
  );

  const queryContent = queryFiles.map((p) => files[p]!).join('\n');
  // The answer key lives in record.csv as the `prediction` JSON with the
  // `root cause component` / `root cause reason` / `root cause occurrence
  // datetime` keys. A task description may legitimately say "find the root
  // cause", so only those concrete key names are treated as leakage.
  const isolated = !/root cause component|root cause reason|root cause occurrence/i.test(queryContent);
  checks.push(
    check('answer-key-isolated', isolated, isolated ? 'query.csv carries no answer key' : 'query.csv leaks the answer key'),
  );

  const hasTelemetry = metricFiles.length > 0 || logFiles.length > 0 || traceFiles.length > 0;
  checks.push(check('telemetry-present', hasTelemetry, `metric=${metricFiles.length} log=${logFiles.length} trace=${traceFiles.length}`));

  const metricHeader = first(files, metricFiles);
  checks.push(
    check(
      'metric-header',
      metricHeader !== undefined && csvHeader(metricHeader).join(',') === OPENRCA_METRIC_HEADER,
      `expected '${OPENRCA_METRIC_HEADER}'`,
    ),
  );

  // An empty log directory is legitimate (Telecom ships no logs).
  const logHeader = first(files, logFiles);
  checks.push(
    check(
      'log-header',
      logHeader === undefined || csvHeader(logHeader).join(',') === OPENRCA_LOG_HEADER,
      `expected '${OPENRCA_LOG_HEADER}'`,
    ),
  );

  const traceHeader = first(files, traceFiles);
  checks.push(
    check(
      'trace-header',
      traceHeader === undefined || csvHeader(traceHeader).join(',') === OPENRCA_TRACE_HEADER,
      `expected '${OPENRCA_TRACE_HEADER}'`,
    ),
  );

  return { target: 'openrca-1.0', passed: checks.every((c) => c.passed), checks };
}

/**
 * Verify an RCAEval export against the structural field contract for a suite.
 *
 * RE1 is metrics-only; RE2 and RE3 additionally require logs and traces, so the
 * modality set is itself a contract violation when it does not match the suite.
 */
export function checkRcaEvalStructure(files: Record<string, string>, suite: RcaEvalSuite): StructureReport {
  const checks: ScoreCheck[] = [];
  const metricsFiles = pathsEndingWith(files, '/metrics.json');
  const injectFiles = pathsEndingWith(files, '/inject_time.txt');
  const logFiles = pathsEndingWith(files, '/logs.csv');
  const traceFiles = pathsEndingWith(files, '/traces.csv');

  checks.push(check('metrics-json', metricsFiles.length > 0, `found ${metricsFiles.length} metrics.json`));
  checks.push(check('inject-time-exists', injectFiles.length > 0, `found ${injectFiles.length} inject_time.txt`));

  const injectTime = first(files, injectFiles)?.trim();
  checks.push(
    check(
      'inject-time-format',
      injectTime !== undefined && /^\d{10}$/.test(injectTime),
      `inject_time '${injectTime ?? '(missing)'}' is an integer Unix timestamp`,
    ),
  );

  const expectModalities = suite === 'RE2' || suite === 'RE3';
  const hasLogs = logFiles.length > 0;
  const hasTraces = traceFiles.length > 0;
  const modalityOk = expectModalities ? hasLogs && hasTraces : !hasLogs && !hasTraces;
  checks.push(
    check('modality-set', modalityOk, `${suite} expects logs/traces=${expectModalities}, found logs=${hasLogs} traces=${hasTraces}`),
  );

  const logHeader = first(files, logFiles);
  checks.push(
    check(
      'logs-header',
      logHeader === undefined ? !expectModalities : csvHeader(logHeader).join(',') === RCAEVAL_LOGS_HEADER,
      `expected '${RCAEVAL_LOGS_HEADER}'`,
    ),
  );

  const traceHeader = first(files, traceFiles);
  checks.push(
    check(
      'traces-header',
      traceHeader === undefined ? !expectModalities : csvHeader(traceHeader).join(',') === RCAEVAL_TRACES_HEADER,
      `expected '${RCAEVAL_TRACES_HEADER}'`,
    ),
  );

  return { target: rcaevalTarget(suite), passed: checks.every((c) => c.passed), checks };
}

const RCA100_MODALITY_FILES = ['metrics.json', 'logs.json', 'traces.json', 'events.json', 'alerts.json'] as const;
const RCA100_CASE_FILES = [...RCA100_MODALITY_FILES, 'task.json'] as const;

/** Extract a case id from a `cases/{id}/topology.json` path. */
function rca100CaseId(topoPath: string): string {
  return topoPath.slice('cases/'.length, topoPath.length - '/topology.json'.length);
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Verify an RCA100 export against its field contract.
 *
 * RCA100's hard, verifiable invariant is full reference integrity: every
 * `entity_id` in the modality tables and every root-cause entity name must
 * resolve into the task's `topology.json`. This check re-verifies that invariant
 * (not merely the file layout) so a dangling reference cannot slip through.
 */
export function checkRca100Structure(files: Record<string, string>): StructureReport {
  const checks: ScoreCheck[] = [];
  const topoPaths = pathsEndingWith(files, '/topology.json');
  checks.push(check('case-present', topoPaths.length > 0, `found ${topoPaths.length} case topology.json`));

  const caseIds = topoPaths.map(rca100CaseId);

  const missingFiles: string[] = [];
  for (const id of caseIds) {
    for (const name of RCA100_CASE_FILES) {
      if (files[`cases/${id}/${name}`] === undefined) missingFiles.push(`cases/${id}/${name}`);
    }
    if (files[`answer_key/${id}.gt.json`] === undefined) missingFiles.push(`answer_key/${id}.gt.json`);
  }
  checks.push(
    check(
      'case-files-complete',
      missingFiles.length === 0,
      missingFiles.length === 0 ? `all ${caseIds.length} case(s) complete` : `missing ${missingFiles.length} file(s)`,
    ),
  );

  let topologyOk = true;
  let refsResolve = true;
  let rootsResolve = true;
  let gtOk = true;

  for (const path of topoPaths) {
    const id = rca100CaseId(path);
    const topo = safeJson(files[path]!);
    if (!isRecord(topo)) {
      topologyOk = false;
      continue;
    }

    const entities = topo.entities;
    const edges = topo.edges;
    const stats = topo.stats;
    const entitiesOk = Array.isArray(entities) && entities.length > 0;
    const edgesOk = Array.isArray(edges);
    const statsOk = isRecord(stats) && typeof stats.entities_total === 'number' && typeof stats.edges_total === 'number';
    if (!entitiesOk || !edgesOk || !statsOk) topologyOk = false;
    else if (Array.isArray(entities) && Array.isArray(edges)) {
      const statsRec = stats as Record<string, unknown>;
      if (statsRec.entities_total !== entities.length || statsRec.edges_total !== edges.length) topologyOk = false;
    }

    const ids = new Set<string>();
    const names = new Set<string>();
    if (Array.isArray(entities)) {
      for (const e of entities) {
        if (isRecord(e)) {
          if (typeof e.id === 'string') ids.add(e.id);
          if (typeof e.name === 'string') names.add(e.name);
        }
      }
    }

    for (const name of RCA100_MODALITY_FILES) {
      const raw = files[`cases/${id}/${name}`];
      if (raw === undefined) continue;
      const rows = safeJson(raw);
      if (!Array.isArray(rows)) {
        // A modality table that does not parse cannot have verifiable refs.
        refsResolve = false;
        continue;
      }
      for (const row of rows) {
        if (isRecord(row) && typeof row.entity_id === 'string' && !ids.has(row.entity_id)) {
          refsResolve = false;
        }
      }
    }

    const gtRaw = files[`answer_key/${id}.gt.json`];
    if (gtRaw === undefined) {
      gtOk = false;
    } else {
      const gt = safeJson(gtRaw);
      if (!isRecord(gt)) {
        gtOk = false;
      } else {
        if (!Array.isArray(gt.root_cause_entities) || !Array.isArray(gt.root_cause_types) || typeof gt.raw_ground_truth !== 'string') {
          gtOk = false;
        }
        if (Array.isArray(gt.root_cause_entities)) {
          for (const rc of gt.root_cause_entities) {
            if (typeof rc === 'string' && !names.has(rc)) rootsResolve = false;
          }
        }
      }
    }
  }

  checks.push(check('topology-shape', topologyOk, 'entities (non-empty) and edges arrays with consistent stats'));
  checks.push(check('entity-refs-resolve', refsResolve, 'every entity_id resolves into the topology'));
  checks.push(check('root-cause-resolves', rootsResolve, 'every root-cause entity name resolves into the topology'));
  checks.push(check('gt-structure', gtOk, 'four-layer answer key (root_cause_entities/types + raw_ground_truth)'));

  return { target: 'rca100', passed: checks.every((c) => c.passed), checks };
}

const AIOPS2025_INSTANCE_TYPES: readonly string[] = ['service', 'pod', 'node'];

/**
 * Verify an AIOps2025 export against its field contract.
 *
 * AIOps2025's hard, verifiable invariant is uuid alignment: every case must
 * appear in both `input.json` (agent-facing tasks) and `groundtruth.jsonl`
 * (per-modality key-evidence labels) with a complete metadata shape, so a case
 * can never be silently dropped from one side. The check also re-verifies the
 * `key_observations` grouping (log/metric/trace) and the `instance_type`
 * vocabulary rather than only the file layout.
 */
export function checkAioPs2025Structure(files: Record<string, string>): StructureReport {
  const checks: ScoreCheck[] = [];
  const inputRaw = files['input.json'];
  const gtRaw = files['groundtruth.jsonl'];

  checks.push(check('input-present', inputRaw !== undefined, 'input.json present'));
  checks.push(check('groundtruth-present', gtRaw !== undefined, 'groundtruth.jsonl present'));

  const input = inputRaw === undefined ? undefined : safeJson(inputRaw);
  const inputEntries = Array.isArray(input) ? input : undefined;
  const entriesPresent = inputEntries !== undefined && inputEntries.length > 0;
  checks.push(check('entries-present', entriesPresent, 'at least one case'));

  const inputUuids = new Set<string>();
  let inputShapeOk = true;
  if (inputEntries === undefined) {
    inputShapeOk = false;
  } else {
    for (const entry of inputEntries) {
      if (
        !isRecord(entry) ||
        typeof entry.uuid !== 'string' ||
        typeof entry.description !== 'string' ||
        typeof entry.start_time !== 'string' ||
        typeof entry.end_time !== 'string'
      ) {
        inputShapeOk = false;
        continue;
      }
      inputUuids.add(entry.uuid);
    }
  }
  checks.push(check('input-shape', inputShapeOk, 'uuid/description/start_time/end_time strings'));

  const gtUuids = new Set<string>();
  let gtShapeOk = true;
  let observationsOk = true;
  if (gtRaw === undefined) {
    gtShapeOk = false;
    observationsOk = false;
  } else {
    for (const line of gtRaw.split('\n')) {
      const trimmed = line.trim();
      if (trimmed === '') continue;
      const obj = safeJson(trimmed);
      if (!isRecord(obj)) {
        gtShapeOk = false;
        continue;
      }
      if (
        typeof obj.uuid !== 'string' ||
        typeof obj.fault_category !== 'string' ||
        typeof obj.fault_type !== 'string' ||
        typeof obj.instance_type !== 'string' ||
        typeof obj.service !== 'string' ||
        typeof obj.instance !== 'string' ||
        typeof obj.start_time !== 'string' ||
        typeof obj.end_time !== 'string' ||
        typeof obj.fault_description !== 'string'
      ) {
        gtShapeOk = false;
        continue;
      }
      if (!AIOPS2025_INSTANCE_TYPES.includes(obj.instance_type)) {
        gtShapeOk = false;
      }
      if (!Array.isArray(obj.key_metrics)) {
        gtShapeOk = false;
      }
      const observations = obj.key_observations;
      if (
        !isRecord(observations) ||
        !Array.isArray(observations.log) ||
        !Array.isArray(observations.metric) ||
        !Array.isArray(observations.trace)
      ) {
        observationsOk = false;
      }
      gtUuids.add(obj.uuid);
    }
  }
  checks.push(check('groundtruth-shape', gtShapeOk, 'required string fields + instance_type + key_metrics'));
  checks.push(check('key-observations-shape', observationsOk, 'key_observations.log/metric/trace arrays'));

  const aligned = inputUuids.size === gtUuids.size && [...inputUuids].every((u) => gtUuids.has(u));
  checks.push(check('uuid-alignment', aligned, 'input and groundtruth uuid sets match'));

  return { target: 'aiops2025', passed: checks.every((c) => c.passed), checks };
}

/**
 * Verify a Cloud-OpsBench export against its `metadata.json` contract.
 *
 * The verifiable invariant is the outcome ground truth shape: every case must
 * carry a namespace, a natural-language query, an easy/medium/hard difficulty and
 * the ⟨fault_taxonomy, fault_object, root_cause⟩ result triple, all as strings.
 * The State Snapshot body (`tool_cache`, `k8s_states`, `code`) is intentionally
 * out of scope and is not asserted here.
 */
export function checkCloudOpsBenchStructure(files: Record<string, string>): StructureReport {
  const checks: ScoreCheck[] = [];
  const metadataPaths = pathsEndingWith(files, '/metadata.json');
  checks.push(check('case-present', metadataPaths.length > 0, `found ${metadataPaths.length} metadata.json`));

  let metadataOk = true;
  for (const path of metadataPaths) {
    const meta = safeJson(files[path]!);
    if (!isRecord(meta)) {
      metadataOk = false;
      continue;
    }
    const result = meta.result;
    if (
      typeof meta.namespace !== 'string' ||
      typeof meta.query !== 'string' ||
      typeof meta.difficulty !== 'string' ||
      !isRecord(result) ||
      typeof result.fault_taxonomy !== 'string' ||
      typeof result.fault_object !== 'string' ||
      typeof result.root_cause !== 'string'
    ) {
      metadataOk = false;
    }
  }
  checks.push(check('metadata-shape', metadataOk, 'namespace/query/difficulty + result triple strings'));

  return { target: 'cloud-opsbench', passed: checks.every((c) => c.passed), checks };
}

/**
 * Verify an ITBench export against its SRE scenario specification contract.
 *
 * Every scenario must carry the five metadata strings plus a diagnosis ground
 * truth whose three facets (chain entities, fault-propagation chain, fault
 * conditions) are arrays. This re-verifies the shape, not merely the file
 * layout, so a malformed scenario cannot slip through.
 */
export function checkItBenchStructure(files: Record<string, string>): StructureReport {
  const checks: ScoreCheck[] = [];
  const paths = pathsEndingWith(files, '/scenario.json');
  checks.push(check('case-present', paths.length > 0, `found ${paths.length} scenario.json`));

  let shapeOk = true;
  for (const path of paths) {
    const obj = safeJson(files[path]!);
    if (!isRecord(obj)) {
      shapeOk = false;
      continue;
    }
    if (
      typeof obj.scenario_name !== 'string' ||
      typeof obj.scenario_description !== 'string' ||
      typeof obj.scenario_domain !== 'string' ||
      typeof obj.scenario_class !== 'string' ||
      typeof obj.scenario_complexity !== 'string' ||
      !isRecord(obj.scenario_groundtruth)
    ) {
      shapeOk = false;
      continue;
    }
    const diagnosis = (obj.scenario_groundtruth as Record<string, unknown>).diagnosis;
    if (
      !isRecord(diagnosis) ||
      !Array.isArray(diagnosis.entities) ||
      !Array.isArray(diagnosis.fault_propagation_chain) ||
      !Array.isArray(diagnosis.fault_conditions)
    ) {
      shapeOk = false;
    }
  }
  checks.push(check('scenario-shape', shapeOk, 'scenario metadata + diagnosis ground truth shape'));

  return { target: 'itbench', passed: checks.every((c) => c.passed), checks };
}

/**
 * Verify an OpenRCA 2.0 export against its PAVE causal-path contract.
 *
 * Every case must carry a `root_cause` and an ordered `causal_path` array, and
 * each step must carry a three-gate verification verdict (structural /
 * statistical / temporal) plus an evidence array. This re-verifies the shape, not
 * merely the file layout, so a malformed step cannot slip through.
 */
export function checkOpenRca2Structure(files: Record<string, string>): StructureReport {
  const checks: ScoreCheck[] = [];
  const paths = pathsEndingWith(files, '/causal_path.json');
  checks.push(check('case-present', paths.length > 0, `found ${paths.length} causal_path.json`));

  let shapeOk = true;
  for (const path of paths) {
    const obj = safeJson(files[path]!);
    if (!isRecord(obj)) {
      shapeOk = false;
      continue;
    }

    const rootCause = obj.root_cause;
    if (
      !isRecord(rootCause) ||
      typeof rootCause.entity_id !== 'string' ||
      typeof rootCause.component !== 'string' ||
      typeof rootCause.fault_type !== 'string'
    ) {
      shapeOk = false;
    }

    const chain = obj.causal_path;
    if (!Array.isArray(chain)) {
      shapeOk = false;
      continue;
    }
    for (const step of chain) {
      if (!isRecord(step)) {
        shapeOk = false;
        continue;
      }
      const verification = step.verification;
      if (
        typeof step.step !== 'number' ||
        !isRecord(step.from_entity) ||
        !isRecord(step.to_entity) ||
        typeof step.mechanism !== 'string' ||
        !isRecord(verification) ||
        typeof verification.structural !== 'boolean' ||
        typeof verification.statistical !== 'boolean' ||
        typeof verification.temporal !== 'boolean' ||
        !Array.isArray(step.evidence)
      ) {
        shapeOk = false;
      }
    }
  }
  checks.push(check('causal-path-shape', shapeOk, 'root_cause + ordered causal path with three-gate verification'));

  return { target: 'openrca-2.0', passed: checks.every((c) => c.passed), checks };
}

/**
 * Verify exported files against committed SHA-256 anchors.
 *
 * `passed` requires the file sets to agree exactly: nothing mismatched, nothing
 * missing, nothing extra. Extra files are still reported so a contract drift is
 * visible even when the anchors themselves are unchanged.
 */
export function verifyChecksums(files: Record<string, string>, anchors: Record<string, string>): ChecksumReport {
  const mismatched: string[] = [];
  const missing: string[] = [];
  let matched = 0;

  for (const [path, expected] of Object.entries(anchors)) {
    const actual = files[path];
    if (actual === undefined) {
      missing.push(path);
    } else if (sha256(actual) === expected) {
      matched += 1;
    } else {
      mismatched.push(path);
    }
  }

  const anchorPaths = new Set(Object.keys(anchors));
  const extra = Object.keys(files).filter((p) => !anchorPaths.has(p));

  return {
    passed: mismatched.length === 0 && missing.length === 0 && extra.length === 0,
    matched,
    mismatched,
    missing,
    extra,
  };
}

function structureRate(structure: StructureReport): number {
  // Every structure report carries at least one check, so division is safe.
  return structure.checks.filter((c) => c.passed).length / structure.checks.length;
}

function checksumRate(report: ChecksumReport): number {
  // When checksum verification is requested, the anchor set is non-empty and
  // every anchor is counted as matched, mismatched or missing, so the total is
  // positive.
  const total = report.matched + report.mismatched.length + report.missing.length;
  return report.matched / total;
}

function structureFor(target: ScoreTargetId, files: Record<string, string>): StructureReport {
  switch (target) {
    case 'openrca-1.0':
      return checkOpenRcaStructure(files);
    case 'openrca-2.0':
      return checkOpenRca2Structure(files);
    case 'rcaeval-re1':
      return checkRcaEvalStructure(files, 'RE1');
    case 'rcaeval-re2':
      return checkRcaEvalStructure(files, 'RE2');
    case 'rcaeval-re3':
      return checkRcaEvalStructure(files, 'RE3');
    case 'rca100':
      return checkRca100Structure(files);
    case 'aiops2025':
      return checkAioPs2025Structure(files);
    case 'cloud-opsbench':
      return checkCloudOpsBenchStructure(files);
    case 'itbench':
      return checkItBenchStructure(files);
    default: {
      const never: never = target;
      throw new Error(`unknown score target '${String(never)}'`);
    }
  }
}

/**
 * Score an exported dataset against a target contract.
 *
 * Without anchors the score is the structural pass rate; with anchors it is the
 * average of the structural pass rate and the checksum match rate.
 */
export function scoreExport(
  target: ScoreTargetId,
  files: Record<string, string>,
  anchors?: Record<string, string>,
): ScoreReport {
  const structure = structureFor(target, files);
  if (anchors === undefined || Object.keys(anchors).length === 0) {
    return {
      target,
      passed: structure.passed,
      score: Math.round(structureRate(structure) * 100),
      structure,
    };
  }
  const checksum = verifyChecksums(files, anchors);
  const score = Math.round(((structureRate(structure) + checksumRate(checksum)) / 2) * 100);
  return {
    target,
    passed: structure.passed && checksum.passed,
    score,
    structure,
    checksum,
  };
}
