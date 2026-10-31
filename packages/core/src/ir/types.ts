/**
 * Intermediate Representation (IR) type definitions.
 *
 * The IR is deliberately layered:
 *   Layer 1  TelemetrySignal  - a single observed fact
 *   Layer 2  EntityGraph      - the topology every reference must resolve against
 *   Layer 3  FaultCase        - one failure plus its ground truth
 *   Layer 4  QualityGateReport- the evidence that proves the case is usable
 *
 * Two invariants are enforced everywhere, not by convention:
 *   1. Every entity reference MUST resolve against the EntityGraph.
 *   2. Fields whose provenance is `inferred` MUST NOT be used for ground-truth
 *      key fields (root cause entity, injection time, causal chain).
 */

/** Current IR contract version. Bump on any breaking change. */
export const IR_VERSION = '2.0';

/**
 * Observability signal kinds supported by the IR.
 *
 * The type is derived from the tuple so the values and the type cannot
 * disagree, and every consumer that needs the list at runtime -- the coverage
 * computation, the HTML report's modality rows, and the CLI's `--signal-kind`
 * set -- reads this rather than restating it. Two consumers previously kept
 * their own copy under a different name, and dropping a member from the
 * report's copy silently removed a modality row from the rendered evidence.
 */
export const SIGNAL_KINDS = ['metric', 'log', 'trace', 'event', 'alert', 'profile'] as const;

export type SignalKind = (typeof SIGNAL_KINDS)[number];

/**
 * Answer the question "does this string belong to that vocabulary?" without
 * the compiler being told to trust a cast.
 *
 * `readonly ['A', 'B'].includes(someString)` does not compile -- a tuple's
 * `includes` only accepts its own members, which is exactly the guarantee worth
 * having and exactly the reason the six consumers of these vocabularies used to
 * restate each tuple as a `readonly string[]` instead. This one helper is what
 * lets them drop the restatement: the answer is derived from the tuple, and the
 * narrows to the tuple's member type.
 */
export function isVocabularyMember<V extends string>(
  vocabulary: readonly V[],
  value: string,
): value is V {
  return vocabulary.some((candidate) => candidate === value);
}

/**
 * `LogPayload.severityText`, declared once.
 *
 * The union used to sit inside the interface while `ingest/file.ts` kept a
 * hand-written `readonly string[]` beside it. Adding a member to the copy was
 * silent and removing one was silent, because `string` contains everything and
 * the copy is what actually decided which severities reach the IR.
 */
export const LOG_SEVERITIES = ['TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'] as const;

/** A log severity. Derived from `LOG_SEVERITIES`. */
export type LogSeverity = (typeof LOG_SEVERITIES)[number];

/**
 * Spellings a corpus uses for a severity, and the vocabulary member each one means.
 *
 * `LOG_SEVERITIES` is OpenTelemetry's vocabulary and it says `WARN`, not `WARNING`.
 * RE2-OB's `level` column says `warning`: 4 742 rows across the 91 `logs.csv` files
 * in that archive, out of 15 224 545 rows. Upper-casing the cell and then consulting
 * the vocabulary rejects every one of them, and nothing about those rows is
 * malformed -- their instant, container and body are as good as the rows beside
 * them. The corpus spelled a level the way its own log library does.
 *
 * The table is short on purpose, and every entry is a count rather than a guess.
 * `warning` is here because it was measured. `err` is not, because those same
 * 15 224 545 rows contain no such value -- and a spelling that is in neither the
 * vocabulary nor this table stays a rejection, which is how an unseen one remains
 * visible instead of being folded into its nearest neighbour.
 *
 * It is a lookup and not a `ColumnTransform` of its own because two readers need the
 * same answer: the ingest when it builds a signal, and `score/modalities.ts` when it
 * decides whether the exported cell reproduces the corpus's. Two implementations of
 * one normalisation is the shape of finding 316 (a conversion that agreed with
 * itself in two places and with the corpus in neither).
 */
export const LOG_SEVERITY_SPELLINGS: Readonly<Record<string, LogSeverity>> = { warning: 'WARN' };

/**
 * The severity a cell means, or `undefined` when the spelling is not one this IR
 * recognises.
 *
 * Upper-casing first is what admits `info` and `INFO` as one severity -- RE2-OB
 * writes both in the same column of the same case, 6 202 823 and 2 138 278 rows
 * respectively, because two services in one cluster use two log libraries. A cell
 * that is empty is not passed here at all: the caller treats an absent severity as
 * "the source declared none", which is what `severityText` being optional means.
 */
export function normaliseLogSeverity(raw: string): LogSeverity | undefined {
  const upper = raw.toUpperCase();
  if (isVocabularyMember(LOG_SEVERITIES, upper)) return upper;
  return LOG_SEVERITY_SPELLINGS[upper.toLowerCase()];
}

/**
 * `TracePayload.status`, declared once, for the same reason. `UNSET` is a real
 * member of the vocabulary -- a span with no status -- not a default applied
 * when parsing fails.
 */
export const SPAN_STATUSES = ['OK', 'ERROR', 'UNSET'] as const;

/** A span status. Derived from `SPAN_STATUSES`. */
export type SpanStatus = (typeof SPAN_STATUSES)[number];

/**
 * The spellings a corpus uses to declare that a metric has no reading.
 *
 * `NaN` is what RE1-TT actually ships. Finding 120 decompressed one of its
 * `data.csv` files and measured the shape: eight `_istio-*` percentile columns
 * of `ts-preserve-other-service` hold the literal text `NaN` from row 193 to the
 * end of the file, at one shared onset, while that same service's other eighteen
 * columns stay populated across those rows and `NaN` is the file's only
 * non-numeric token.
 *
 * That is the corpus stating an absence, not a file we failed to read, and the
 * two want opposite handling: an absence makes a row shorter and is worth
 * keeping, an unreadable cell makes a row untrustworthy and is worth
 * quarantining. The distinction is drawn on the token rather than on
 * `Number.isFinite`, because widening the check to accept any non-finite result
 * would also accept `oops` -- `packages/core/test/ingest-report.test.ts` pins
 * both directions.
 *
 * The list is deliberately one member long. Only this spelling has been measured
 * in a corpus the project scores against; `nan`, `NAN`, `nan.0`, `Infinity`,
 * `NA` and an empty cell are each separately pinned to a refusal, so accepting
 * one is an addition someone has to make on purpose with a measurement behind
 * it rather than a tolerance nobody chose.
 */
export const MISSING_VALUE_TOKENS = ['NaN'] as const;

/** A declared missing value. Derived from `MISSING_VALUE_TOKENS`. */
export type MissingValueToken = (typeof MISSING_VALUE_TOKENS)[number];

/**
 * Where a field value came from, declared once.
 *
 * Published in `docs/data-model.md`, so it is a tuple rather than a bare union
 * for the same reason the payload vocabularies are: the schema that *admits* a
 * provenance record must read this list rather than restate it. It was a bare
 * union while `ir/schema.ts` carried its own copy of the four literals -- the
 * union and the admission list, stated twice, agreeing only by luck.
 */
export const PROVENANCE_SOURCES = ['direct', 'derived', 'inferred', 'defaulted'] as const;

/** Where a field value came from. Derived from `PROVENANCE_SOURCES`. */
export type ProvenanceSource = (typeof PROVENANCE_SOURCES)[number];

export interface FieldProvenance {
  source: ProvenanceSource;
  /** Id of the rule that produced this field. */
  ruleId?: string;
  /** Model identifier when the rule was generated by an LLM. */
  modelId?: string;
  /** Prompt version, so a generated rule stays reproducible. */
  promptVersion?: string;
  /** 0..1 confidence reported by the generator. */
  confidence?: number;
}

/**
 * `MetricPayload.semanticType`, declared once, for the same reason.
 *
 * This was an inline union in the interface, which meant no consumer could read
 * the vocabulary at runtime, and the one consumer that actually needed to --
 * the LLM rule generator, which has to tell a model which values are legal --
 * could only advertise the field name and reject the model's answer later,
 * downstream, as a schema failure on the whole record.
 */
export const METRIC_SEMANTIC_TYPES = [
  'latency', 'error_rate', 'throughput', 'saturation', 'availability', 'other',
] as const;

/** A metric semantic class. Derived from `METRIC_SEMANTIC_TYPES`. */
export type MetricSemanticType = (typeof METRIC_SEMANTIC_TYPES)[number];

export interface MetricPayload {
  kind: 'metric';
  /** Metric name, e.g. `container_cpu_usage_seconds_total`. */
  name: string;
  value: number;
  /** UCUM-style unit, e.g. `s`, `By`, `%`. */
  unit?: string;
  /** Semantic class used by downstream exporters and gates. */
  semanticType?: MetricSemanticType;
  tags?: Record<string, string>;
}

export interface LogPayload {
  kind: 'log';
  body: string;
  severityText?: LogSeverity;
  /** Drain-style template id, e.g. `L007`. */
  templateId?: string;
  /** Parameters extracted by the template, keyed by placeholder name. */
  params?: Record<string, string>;
}

export interface TracePayload {
  kind: 'trace';
  traceId: string;
  spanId: string;
  /** Absent for root spans. */
  parentSpanId?: string;
  spanName: string;
  /** Span duration in milliseconds. */
  durationMs: number;
  status?: SpanStatus;
  attributes?: Record<string, string>;
}

export interface EventPayload {
  kind: 'event';
  /** Kubernetes reason, e.g. `OOMKilled`, or a platform-specific reason code. */
  reason: string;
  message?: string;
  type?: 'Normal' | 'Warning';
  count?: number;
  /** Sub-type used for deployment / configuration changes. */
  changeType?: 'deploy' | 'config' | 'scale' | 'rollback';
  involvedObject?: { kind: string; name: string };
}

export interface AlertPayload {
  kind: 'alert';
  alertName: string;
  severity?: 'critical' | 'warning' | 'info';
  state?: 'firing' | 'resolved';
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
}

export interface ProfilePayload {
  kind: 'profile';
  profileType: 'cpu' | 'heap' | 'goroutine' | 'flamegraph';
  /** Reference to the out-of-band payload; profiles never live in the main table. */
  payloadRef: string;
  samplePeriodMs?: number;
}

export type SignalPayload =
  | MetricPayload
  | LogPayload
  | TracePayload
  | EventPayload
  | AlertPayload
  | ProfilePayload;

export interface TelemetrySignal {
  irVersion: string;
  /** OpenTelemetry semantic-convention core subset. */
  resource: {
    'service.name': string;
    'service.namespace'?: string;
    'service.version'?: string;
    'k8s.pod.name'?: string;
    'k8s.node.name'?: string;
    'host.name'?: string;
    [key: string]: string | undefined;
  };
  /** Canonical UTC ISO-8601, e.g. `2026-09-06T04:05:06.000Z`. */
  timestamp: string;
  /** Offset carried by (or assumed for) the source value, in minutes east of UTC. */
  rawOffsetMinutes?: number;
  signal: SignalKind;
  payload: SignalPayload;
  /** Per-field origin tracking, keyed by dotted field path. */
  provenance?: Record<string, FieldProvenance>;
}

/**
 * Entity kinds, declared once.
 *
 * Several exporters key a `Record<EntityKind, …>` off this union, so the
 * compiler already refuses to let a member disappear. The vocabulary is now a
 * tuple rather than a bare union so that the runtime consumers -- AIOps2025's
 * `instance_type` set among them -- narrow it instead of copying it.
 */
/**
 * How one entity relates to another.
 *
 * Declared once, as a tuple, and read by the schema's `z.enum` -- the same arrangement the other
 * published vocabularies use, after this set spent its whole life as an inline enum in the schema
 * beside a second copy in `docs/data-model.md` (finding 260).
 *
 * - `contains`: a service has a pod, a pod has a container -- part-of, inside.
 * - `hosts`: a node runs a pod -- where it lives.
 * - `calls`: one service invokes another, or a service uses a datastore or a broker.
 * - `same_as`: two names are one entity; merged with union-find over aliases.
 * - `routes`: traffic for the target passes through the source -- a router, a switch, a load
 *   balancer. Added because a network fault's evidence had an owner and the graph had no word for
 *   it: the MTU case cites a path's MTU and, without this, the device that reports it could not be
 *   an entity without an edge that lied about the direction.
 */
export const EDGE_RELATIONS = ['contains', 'hosts', 'calls', 'same_as', 'routes'] as const;

export const ENTITY_KINDS = [
  'service',
  'pod',
  'node',
  'container',
  'db',
  'mq',
  'host',
  'cluster',
  'external',
] as const;

/** An entity kind. Derived from `ENTITY_KINDS`. */
export type EntityKind = (typeof ENTITY_KINDS)[number];

export interface Entity {
  /** Globally unique id, formatted `${kind}:${namespace}/${name}`. */
  entityId: string;
  kind: EntityKind;
  name: string;
  namespace?: string;
  /** Names used for the same entity in APM / Kubernetes / CMDB. */
  aliases: string[];
  attributes?: Record<string, string>;
}

/**
 * A relation between two entities. Derived from `EDGE_RELATIONS`.
 *
 * The name `EntityRelation` predates the tuple and is the one the tree uses; `EdgeRelation` was a
 * second name introduced beside it and is gone, because two names for one type is the same defect as
 * two lists for one vocabulary, one step earlier (finding 260).
 */
export type EntityRelation = (typeof EDGE_RELATIONS)[number];

export interface EntityEdge {
  from: string;
  to: string;
  relation: EntityRelation;
  attributes?: Record<string, string>;
}

export interface EntityGraph {
  entities: Entity[];
  edges: EntityEdge[];
}

/**
 * Fault categories, declared once and in the order they are published in
 * `docs/data-model.md`.
 *
 * `unknown` is a member of the contract, not a fallback applied when inference
 * fails; the inference table returns it explicitly for a type it cannot place.
 */
export const FAULT_CATEGORIES = [
  'resource',
  'network',
  'runtime',
  'middleware',
  'code',
  'config',
  'dependency',
  'unknown',
] as const;

/** A fault category. Derived from `FAULT_CATEGORIES`. */
export type FaultCategory = (typeof FAULT_CATEGORIES)[number];

/**
 * The comparators that order two numbers.
 *
 * Declared as a tuple because two places decide whether an assertion is *comparable* -- the schema's
 * admitted set and the corpus guard's `if this comparator has a number on both sides` -- and the
 * guard kept the list by hand while omitting `!=`, which the schema admits. A `!=` checkpoint was
 * therefore neither compared nor counted, and nothing said so. The subset and the union are stated
 * once here so a comparator is numeric in exactly one place.
 */
export const NUMERIC_COMPARATORS = ['>', '>=', '<', '<=', '==', '!='] as const;

/** A comparator that orders two numbers. Derived from `NUMERIC_COMPARATORS`. */
export type NumericComparator = (typeof NUMERIC_COMPARATORS)[number];

/**
 * Every comparator, in one tuple, so the union and the schema's admission list cannot disagree.
 *
 * The textual two are spelled here rather than in the union, because a union stated separately from
 * the tuple is a second list: `Comparator` used to be a literal union while `schema.ts` admitted its
 * own literal list, and a comparator added to one would be rejected by the other with nothing to say
 * which was right.
 */
export const COMPARATORS = [...NUMERIC_COMPARATORS, 'contains', 'matches'] as const;

/** Every comparator, numeric or textual. Derived from `COMPARATORS`. */
export type Comparator = (typeof COMPARATORS)[number];

/**
 * The points of a series that an expression may read.
 *
 * A `derived` checkpoint states arithmetic over one or more series, and arithmetic has to say *which
 * reading* of a series it means: the value before the onset or the value at it. That is this tuple,
 * and `fault/expression.ts` parses the suffix of a reference against it -- so the grammar has no
 * second list of point names, and adding a member here is enough to make the parser accept it. The
 * parser then reads the series through the same name, so the tuple describes the data as well as the
 * grammar; an `if (suffix === 'post')` in the parser would describe only the grammar.
 */
export const SERIES_POINTS = ['baseline', 'post'] as const;

/** A point of a series. Derived from `SERIES_POINTS`. */
export type SeriesPoint = (typeof SERIES_POINTS)[number];

/**
 * What a checkpoint's `signalRef` is a reference *to*.
 *
 * One optional string used to carry four different things, and nothing resolved it: of the eleven
 * checkpoints in the corpus, eight named a series that did not exist (finding 243). The four cases
 * are genuinely different and a rule that treats them alike is wrong in one direction or the other:
 *
 * - `series`: the value is a threshold on a metric the bundle declares, so it can be evaluated
 *   against that series' post value;
 * - `derived`: the value is computed from one or more series (a ratio of two durations), so it
 *   carries an `expression` instead of a `signalRef`; the reference is the set of series the
 *   arithmetic reads. Until finding 245 it carried one `signalRef` and the arithmetic lived only in
 *   the number, so two derived checkpoints could name the same series with different arithmetic and
 *   nothing would disagree;
 * - `configuration`: the value is a fact about how the system was configured (a CPU quota), which no
 *   telemetry carries, and naming a series by the same name is a modelling error;
 * - `log`: the value is a property of a declared log line, referenced by the line's id.
 */
export const CHECKPOINT_REFERENCES = ['series', 'derived', 'configuration', 'log'] as const;

/** What a checkpoint's signal reference points at. Derived from `CHECKPOINT_REFERENCES`. */
export type CheckpointReference = (typeof CHECKPOINT_REFERENCES)[number];

export interface EvidenceCheckpoint {
  checkpointId: string;
  /** Must resolve against the EntityGraph. */
  entityRef: string;
  /** Optional pointer to the concrete metric / log / trace. */
  signalRef?: string;
  /** What `signalRef` names. Absent means `series`, which is what every checkpoint meant by default. */
  signalKind?: CheckpointReference;
  /**
   * The arithmetic a `derived` checkpoint states, over references of the form `<metric>.<point>`.
   *
   * Present if and only if `signalKind` is `derived`: for that kind it *is* the reference, and
   * `signalRef` is forbidden beside it, because a derived checkpoint that named one series and
   * computed over another would be two statements of which one is silently not the one being checked.
   */
  expression?: string;
  comparator: Comparator;
  value: number | string;
  /** UCUM-style unit. Required whenever `value` is numeric. */
  unit?: string;
  description: string;
}

/**
 * A numeric fact a case declares about itself, with the unit it is in.
 *
 * `FaultCase.fault.parameters` holds the injector's knobs, and a knob that a checkpoint wants to cite
 * has to carry its unit -- otherwise the checkpoint's unit is a claim about a number that says
 * nothing about it, which is what finding 247 found behind `cp-cpu-limit`. A bare number is still
 * allowed (a container name, a replica count) and reads as a quantity with no unit; a checkpoint that
 * cites one may not state a unit either.
 */
export interface DeclaredQuantity {
  value: number;
  unit?: string;
}

export interface CausalStep {
  step: number;
  fromEntityId: string;
  toEntityId: string;
  mechanism: string;
  /** References to `EvidenceCheckpoint.checkpointId`. */
  evidenceRefs: string[];
}

export interface RootCauseIndicator {
  type: 'metric' | 'log' | 'trace';
  ref: string;
  description: string;
}

export interface GroundTruth {
  /** Must resolve against the EntityGraph. */
  rootCauseEntityId: string;
  rootCauseComponent: string;
  rootCauseReason: string;
  rootCauseIndicators?: RootCauseIndicator[];
  causalChain?: CausalStep[];
  evidenceCheckpoints?: EvidenceCheckpoint[];
  remediation?: Array<{ step: number; action: string; target: string }>;
}

export interface FaultCase {
  caseId: string;
  system: string;
  environment: {
    system: string;
    version?: string;
    deployRef?: string;
    reproducerRef?: string;
    checksums?: Record<string, string>;
  };
  /** Canonical UTC ISO-8601 injection / onset time. */
  injectTime: string;
  window: { start: string; end: string };
  fault: {
    type: string;
    category: FaultCategory;
    injectionMethod?: 'chaos-mesh' | 'litmus' | 'chaosblade' | 'historical' | 'manual';
    parameters?: Record<string, unknown>;
    /**
     * One sentence per parameter nothing cites, saying what the fact is for.
     *
     * A parameter a reading cites needs no note: the citation is the statement, and a note beside it
     * would be a second one that can drift. What this answers is the question only the author can
     * answer -- why a fact is in the file when no reading of the telemetry speaks for it -- which is
     * the question finding 300 could not put to a rule (`fault/parameter-notes.ts`).
     */
    parameterNotes?: Record<string, string>;
  };
  groundTruth: GroundTruth;
  /**
   * Which reading ranks this case, or a sentence saying why none can.
   *
   * `main.py` decides the ranking series from the *path*: it recognises a corpus token and then looks
   * for a column named `{service}_latency`. So a case that wants to be rankable by that harness has to
   * name a duration its own component carries, and a case whose symptom is a share or a count has to
   * say so rather than have a ratio published under a name that means latency
   * (`export/sli.ts`).
   *
   * Typed as `unknown` on purpose. The shape is either `{ service, metric }` or `{ none }` with a
   * sentence, and one module reads it; a schema that validated it would refuse the second half of a
   * malformed declaration with `Invalid input` instead of naming which half is missing.
   */
  sli?: unknown;
  /** Natural-language task description required by OpenRCA-style benchmarks. */
  query?: string;
  difficulty?: 'L1' | 'L2' | 'L3' | 'L4';
  quality?: QualityGateReport;
  /** True when the answer key is stored physically separate from the task. */
  answerKeyIsolated?: boolean;
}

export type GateId = 'G1' | 'G2' | 'G3' | 'G4' | 'G5';

export type GateStatus = 'passed' | 'quarantined' | 'failed';

export interface GateViolation {
  code: string;
  message: string;
  /** Dotted path of the offending field, when applicable. */
  fieldPath?: string;
}

export interface GateResult {
  gateId: GateId;
  status: GateStatus;
  violations: GateViolation[];
}

export interface QualityGateReport {
  caseId: string;
  irVersion: string;
  gateRunId: string;
  runAt: string;
  results: GateResult[];
  finalStatus: 'admitted' | 'quarantined' | 'rejected';
  /** True only when the mutation suite proved the gates themselves still work. */
  mutationTestPassed?: boolean;
}

/** A complete bundle: signals, topology, cases. */
export interface IrBundle {
  irVersion: string;
  graph: EntityGraph;
  cases: FaultCase[];
  /** Signals grouped by case id. */
  signals: Record<string, TelemetrySignal[]>;
}

/**
 * One assertion inside a fault-validity report.
 *
 * Same shape as `ScoreCheck` in `score/score.ts` -- `{id, passed, detail}` with a
 * flat array and an aggregate verdict -- because the two reports answer the same
 * kind of question ("is this artifact what it claims to be") and a reader should
 * not have to learn two formats for it.
 */
export interface ValidityCheck {
  id: string;
  passed: boolean;
  detail: string;
}

/**
 * The verdict on whether a declared fault actually happened.
 *
 * Three values, and `unverifiable` is not a softer `invalid`. When the telemetry
 * carries nothing the fault's mechanism could have moved, the honest answer is
 * that the evidence cannot decide -- not that the fault failed. Collapsing the two
 * would turn an absence of data into a finding, which is the overclaim that
 * fault-validity verification exists to prevent.
 */
export type FaultValidityVerdict = 'valid' | 'invalid' | 'unverifiable';

/** The report `verifyFaultValidity` returns. */
export interface FaultValidityReport {
  caseId: string;
  verdict: FaultValidityVerdict;
  checks: ValidityCheck[];
  /** The entity the case names as root cause, and the service it resolved to. */
  target: { entityId: string | null; service: string | null };
  /** What the telemetry actually showed, as opposed to what was declared. */
  observed: { affectedSeries: string[]; onsetOffsetSeconds: number | null };
}
