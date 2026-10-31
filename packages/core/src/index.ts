/**
 * @rca-bench-factory/core
 *
 * Public surface of the core package: IR types and schemas, the deterministic
 * transform engine, entity normalization, quality gates, exporters and the
 * observability coverage report.
 */

export {
  IR_VERSION,
  LOG_SEVERITIES,
  LOG_SEVERITY_SPELLINGS,
  normaliseLogSeverity,
  METRIC_SEMANTIC_TYPES,
  MISSING_VALUE_TOKENS,
  SPAN_STATUSES,
  EDGE_RELATIONS,
  ENTITY_KINDS,
  FAULT_CATEGORIES,
  CHECKPOINT_REFERENCES,
  COMPARATORS,
  NUMERIC_COMPARATORS,
  SERIES_POINTS,
  SIGNAL_KINDS,
  isVocabularyMember,
} from './ir/types.js';
export type {
  AlertPayload,
  CausalStep,
  Comparator,
  Entity,
  EntityEdge,
  EntityGraph,
  EntityKind,
  EntityRelation,
  EventPayload,
  EvidenceCheckpoint,
  FaultCase,
  FaultCategory,
  FieldProvenance,
  GateId,
  GateResult,
  GateStatus,
  GateViolation,
  GroundTruth,
  IrBundle,
  LogPayload,
  LogSeverity,
  MetricPayload,
  MetricSemanticType,
  NumericComparator,
  ProfilePayload,
  ProvenanceSource,
  QualityGateReport,
  RootCauseIndicator,
  SeriesPoint,
  SignalKind,
  SignalPayload,
  SpanStatus,
  TelemetrySignal,
  TracePayload,
} from './ir/types.js';

export {
  entitySchema,
  entityGraphSchema,
  faultCaseSchema,
  irBundleSchema,
  telemetrySignalSchema,
} from './ir/schema.js';

// A quantity a case declares about itself, and the reader that decides whether a value is one. A
// configuration checkpoint cites these instead of prose, so "the quota is the one the case ran under"
// is a comparison rather than a reading (finding 247).
export { readDeclaredQuantity, readDeclaredReading } from './ir/parameters.js';
export type { ReadingResolution } from './ir/parameters.js';
export type { DeclaredQuantity } from './ir/types.js';

// The corpus's derived telemetry: a declaration's baseline and post reading, turned into the samples
// an exporter reads. It lived in `scripts/check-fault-cases.mjs` until finding 249 -- where the guard
// printed counts of what it produced and never the values, so a defect in the arithmetic survived
// three rounds and five annotations.
export {
  LOG_OFFSETS_MS,
  SERIES_DERIVATIONS,
  SERIES_JITTER,
  SERIES_NOISE,
  TRACE_OFFSET_MS,
  expandLog,
  expandSeries,
  expandTraces,
} from './fault/derived-telemetry.js';
export type {
  ExpansionTime,
  LogDeclaration,
  SeriesDeclaration,
  SeriesDerivation,
  SeriesNoise,
  TraceDeclaration,
} from './fault/derived-telemetry.js';

// A schema refusal with the field and the reason in it. `String(error.message).split('\n')[0]` is
// `[` for a zod issue list, so the guard that reports parse failures used to name the case and a
// bracket; the diagnosis was in the lines it dropped.
export { describeSchemaFailure } from './ir/schema-errors.js';

export { assembleBundle } from './ir/assembler.js';
export type { BundleAssemblyResult, BundleDraft, CaseDraft } from './ir/assembler.js';

export {
  applyExpr,
  applyLookup,
  applyMap,
  applyRegex,
  applyRule,
  applyTemplate,
  applyTime,
  applyUnit,
  evalExpr,
} from './transform/strategies.js';
export type {
  ExprRule,
  LookupRule,
  MapRule,
  RegexRule,
  SourceRecord,
  StrategyErrorCode,
  StrategyResult,
  TemplateRule,
  TimeRule,
  TransformRule,
  UnitRule,
} from './transform/strategies.js';

export {
  checkNoSilentLoss,
  transformBatch,
  transformTraceBatch,
} from './transform/engine.js';
export type {
  EngineOptions,
  QuarantineRecord,
  SpanRecord,
  TraceTransformResult,
  TransformResult,
} from './transform/engine.js';

export {
  RELATION_SIDES,
  entityId,
  findAmbiguousAliases,
  findDanglingEdgeRefs,
  findImplausibleEdgeDirections,
  findInvalidRelations,
  indexGraph,
  isContainedIn,
  normalizeAliases,
  resolveEntityRef,
  sameComponent,
} from './entity/graph.js';
export type { DirectionIssue, GraphIndex, ReferenceIssue } from './entity/graph.js';

export {
  DEFAULT_SENSITIVE_PATTERNS,
  caseFingerprint,
  checkCaseSemantics,
  checkDifficultyDistribution,
  checkDiscrimination,
  checkG1Structural,
  checkG2Semantic,
  checkG3Validity,
  checkG4Solvability,
  checkGraphContract,
  checkSolvability,
  checkG5AntiPollution,
  locatedRank,
  mean,
  runAllGates,
  stddev,
  sustainedAnomalySamples,
  zScore,
} from './gates/gates.js';
export type {
  AllGatesOptions,
  BaselineOutcome,
  G1Options,
  G3Options,
  G4Options,
  G5Options,
} from './gates/gates.js';

/**
 * Fault validity verification.
 *
 * Exported because it answers the question the product's D-10 claim rests on and
 * a caller may want it without running the full gate set -- for instance to
 * report on an existing corpus rather than to admit a new case. `FAULT_EXPECTATIONS`
 * is part of the surface on purpose: it is the table that says what each fault
 * category is expected to move, and a reader who wants to challenge that
 * assumption should not have to read the source to find it.
 */
export { FAULT_EXPECTATIONS, expectedSignalsFor, verifyFaultValidity } from './gates/validity.js';
export type { FaultExpectation, ValidityOptions } from './gates/validity.js';

export {
  OPENRCA_CONTRACT_VERSION,
  OPENRCA_OFFSET_MINUTES,
  OPENRCA_TARGET_ID,
  buildLogCsv,
  buildMetricCsv,
  buildPredictionJson,
  buildTraceCsv,
  exportOpenRca,
  injectTimeUnixSeconds,
} from './export/openrca.js';
export type { ExportOutcome, ExportedFiles, SkippedCase } from './export/openrca.js';

export {
  RCAEVAL_CONTRACT_VERSION,
  RCAEVAL_INSTANT_COLUMNS,
  RCAEVAL_LOGS_COLUMNS,
  RCAEVAL_SUITES,
  RCAEVAL_TARGET_ID,
  RCAEVAL_TRACES_COLUMNS,
  RCAEVAL_UNFILLED_COLUMNS,
  buildLogsCsv,
  buildDataCsv,
  buildTracesCsv,
  casePath,
  exportRcaEval,
} from './export/rcaeval.js';
export type { RcaEvalLogsSuite, RcaEvalSuite } from './export/rcaeval.js';

// The ranking declaration: which reading upstream should rank a case by. `readSliDeclaration` is what
// the corpus guard asks about the file, and `resolveSli` is what the exporter asks about the data;
// the two refusals are separate because a declaration that names another service is wrong whether or
// not the series it names exists (finding 331).
export { SLI_SUFFIX, describeSliFault, readSliDeclaration, resolveSli, sliColumn } from './export/sli.js';
export type { CaseSli, SliFault, SliPublication, SliRead } from './export/sli.js';

export { LOGTS_BUCKET_SECONDS, buildLogtsCsv } from './export/rcaeval-logts.js';
export type { LogCluster, LogRow, LogtsTable } from './export/rcaeval-logts.js';

export {
  RCA100_CONTRACT_VERSION,
  RCA100_TARGET_ID,
  UMODEL_TYPES,
  buildEntityIndex,
  buildGroundTruthJson,
  buildRca100Alerts,
  buildRca100Events,
  buildRca100Logs,
  buildRca100Metrics,
  buildRca100Traces,
  buildTaskJson,
  buildTopologyJson,
  exportRca100,
  resolveSignalEntity,
} from './export/rca100.js';
export type { EntityIndex, Rca100ModalityTable } from './export/rca100.js';

export {
  AIOPS2025_CATEGORIES,
  AIOPS2025_CATEGORY,
  AIOPS2025_CONTRACT_VERSION,
  AIOPS2025_TARGET_ID,
  buildAioPs2025GroundTruth,
  buildAioPs2025Input,
  exportAioPs2025,
} from './export/aiops2025.js';

export {
  CLOUD_OPSBENCH_CONTRACT_VERSION,
  CLOUD_OPSBENCH_TARGET_ID,
  CLOUD_OPSBENCH_TAXONOMIES,
  TAXONOMY_BY_CATEGORY,
  buildCloudOpsBenchMetadata,
  exportCloudOpsBench,
} from './export/cloudopsbench.js';

export {
  DIFFICULTIES,
  difficultyFor,
  type Difficulty,
} from './export/difficulty.js';

export {
  OPENRCA2_CONTRACT_VERSION,
  OPENRCA2_TARGET_ID,
  buildCausalPathJson,
  exportOpenRca2,
} from './export/openrca2.js';

export {
  CLASS_BY_CATEGORY,
  ITBENCH_CONTRACT_VERSION,
  ITBENCH_SCENARIO_CLASSES,
  ITBENCH_SRE_DOMAIN,
  ITBENCH_TARGET_ID,
  buildItBenchScenarioSpec,
  exportItBench,
} from './export/itbench.js';

export {
  MODALITY_LOSS,
  TARGET_REQUIREMENTS,
  computeCoverage,
  formatCoverageReport,
} from './coverage.js';
export type { CoverageReport, TargetFeasibility } from './coverage.js';

export {
  ISO_UTC_PATTERN,
  epochMsToIsoUtc,
  isWithinWindow,
  isoUtcToEpochMs,
  isoUtcToOffsetIso,
  parseTimestamp,
  TIME_LAYOUTS,
} from './util/time.js';
export type { ParsedTime, TimeLayout } from './util/time.js';

export {
  admitsFraction,
  clampToUnit,
  convertUnit,
  dimensionOf,
  getUnitDef,
  isConvertible,
  knownUnits,
  measurementBounds,
  resolutionOf,
} from './util/unit.js';
export type { Dimension, MeasurementBounds } from './util/unit.js';

export {
  detectFileLayout,
  FILE_FORMATS,
  ingestFile,
  parseDelimited,
  parseJsonArray,
  parseJsonl,
} from './ingest/file.js';
export type {
  DelimitedParseResult,
  FileFormat,
  FileIngestOptions,
  FileIngestResult,
  FileLayout,
  FileParseError,
  FileQuarantineRecord,
  FileSignalKind,
  JsonlParseResult,
} from './ingest/file.js';

export {
  backendEntry,
  findBackend,
  T2_BACKENDS,
  T2_BACKEND_IDS,
  T2_IMPLEMENTED_BACKEND_IDS,
} from './ingest/backends.js';
export type {
  T2Backend,
  T2BackendEntry,
  T2BackendId,
  T2BackendImplemented,
  T2BackendUnsupported,
} from './ingest/backends.js';

export { pullPrometheusMetrics, PROMETHEUS_DEFAULT_SERVICE_LABEL, PROMETHEUS_DEFAULT_TIMEOUT_MS, PROMETHEUS_QUERY_PATH } from './ingest/prometheus.js';
export type {
  PrometheusPullOptions,
  PrometheusPullResult,
  PrometheusQuarantineRecord,
} from './ingest/prometheus.js';

export {
  JAEGER_DEFAULT_TIMEOUT_MS,
  JAEGER_TRACES_PATH,
  pullJaegerTraces,
  type JaegerPullOptions,
  type JaegerPullResult,
  type JaegerQuarantineRecord,
} from './ingest/jaeger.js';

// The remaining four readers, re-exported by name.
//
// Until `pull` was added only Prometheus and Jaeger had a named re-export here,
// and the other four were reachable *only* through the registry's `entry` field.
// That was enough for a test and not enough for the CLI: `backendEntry(id)`'s
// return type is the union of six signatures, so a caller that has already
// narrowed `id` still has to narrow again to call it. Naming them is what lets
// `runPull` dispatch on the backend and hand each reader its own options.
export { LOKI_DIRECTIONS, LOKI_DEFAULT_TIMEOUT_MS, LOKI_QUERY_RANGE_PATH, pullLokiLogs } from './ingest/loki.js';
export type {
  LokiDirection,
  LokiPullOptions,
  LokiPullResult,
  LokiQuarantineRecord,
} from './ingest/loki.js';

export {
  ELASTICSEARCH_DEFAULT_TIMEOUT_MS,
  ELASTICSEARCH_SEARCH_PATH,
  ELASTICSEARCH_SORT_DIRECTIONS,
  ELASTICSEARCH_TIMESTAMP_FORMATS,
  pullElasticsearchLogs,
} from './ingest/elasticsearch.js';
export type {
  ElasticsearchFieldMapping,
  ElasticsearchPullOptions,
  ElasticsearchPullResult,
  ElasticsearchQuarantineRecord,
  ElasticsearchSortDirection,
  ElasticsearchTimestampFormat,
  ElasticsearchTotal,
} from './ingest/elasticsearch.js';

export {
  CLICKHOUSE_DEFAULT_TIMEOUT_MS,
  CLICKHOUSE_TIMESTAMP_UNITS,
  pullClickHouseLogs,
} from './ingest/clickhouse.js';
export type {
  ClickHousePage,
  ClickHousePullOptions,
  ClickHousePullResult,
  ClickHouseQuarantineRecord,
  ClickHouseTimestampUnit,
} from './ingest/clickhouse.js';

export {
  KUBERNETES_DEFAULT_TIMEOUT_MS,
  KUBERNETES_EVENTS_PATH,
  KUBERNETES_TIMESTAMP_FIELDS,
  pullKubernetesEvents,
} from './ingest/kubernetes.js';
export type {
  KubernetesPage,
  KubernetesPullOptions,
  KubernetesPullResult,
  KubernetesQuarantineRecord,
  KubernetesTimestampField,
} from './ingest/kubernetes.js';

export { ingestOtlpLogs, ingestOtlpMetrics, ingestOtlpTraces } from './ingest/otlp.js';
export type { OtlpIngestOptions, OtlpIngestResult, OtlpQuarantineRecord } from './ingest/otlp.js';

export { ingestPrimeDataset, PRIME_DATASET_IDS } from './ingest/prime.js';
export type {
  PrimeCaseReport,
  PrimeCaseSource,
  PrimeDatasetId,
  PrimeFileSpec,
  PrimeIngestDefaults,
  PrimeIngestOptions,
  PrimeIngestResult,
  PrimeIngestSuccess,
  PrimeQuarantineRecord,
} from './ingest/prime.js';

export {
  AIOPS2025_INSTANCE_TYPES,
  ITBENCH_SCENARIO_DOMAINS,
  RCA100_UMODEL_TYPES,
  checkAioPs2025Structure,
  checkCloudOpsBenchStructure,
  checkItBenchStructure,
  checkOpenRcaStructure,
  checkOpenRca2Structure,
  checkRca100Structure,
  checkRcaEvalStructure,
  scoreExport,
  verifyChecksums,
} from './score/score.js';
export type { ChecksumReport, ScoreCheck, ScoreReport, StructureReport } from './score/score.js';
export { SCORE_TARGET_IDS } from './score/targets.js';
export type { ScoreTargetId } from './score/targets.js';
export { exportForScoreTarget, EXPORTERS, scoreTargetInvocation } from './score/dispatch.js';

export {
  OFFICIAL_FACETS,
  OFFICIAL_METRICS,
  mutatePrediction,
  officialMetric,
  openRcaTimeMatches,
  oraclePrediction,
  parseOpenRcaPrediction,
  parseOpenRcaScoringPoints,
  parseRcaEvalDirectory,
  parseRcaEvalPath,
  readOfficialGroundTruth,
  readOfficialSubmission,
  runAllOfficialRegressions,
  runOfficialRegression,
  scoreOfficial,
} from './score/official.js';
export type {
  OfficialCaseScore,
  OfficialFacet,
  OfficialFacetVerdict,
  OfficialGroundTruth,
  OfficialMetricSpec,
  OfficialMutationResult,
  OfficialPrediction,
  OfficialProvenance,
  OfficialRegressionCase,
  OfficialRegressionOptions,
  OfficialRegressionReport,
  OfficialRegressionStatus,
  OfficialScoreReport,
  OpenRcaScoringPoints,
} from './score/official.js';

export {
  COLUMN_TRANSFORMS,
  MODALITY_TABLES,
  TRUNCATED_UNITS,
  compareModalityTables,
  describeModalityComparison,
} from './score/modalities.js';
export type {
  ColumnComparison,
  ColumnReading,
  ColumnTransform,
  ModalityComparison,
  ModalityTable,
  TruncatedUnit,
} from './score/modalities.js';

export {
  buildGroundTruthCsv,
  buildScoringPoints,
  hasRootCauseElements,
  openRcaTaskIndex,
  OPENRCA_GROUNDTRUTH_HEADER,
  OPENRCA_SCORING_TEMPLATES,
  OPENRCA_TASK_INDEXES,
} from './export/openrca.js';
export type { OpenRcaTaskIndex } from './export/openrca.js';

export { csvCell, csvColumn, parseCsvObjects, parseCsvRows, renderCsv } from './util/csv.js';
export { isRecord, readString, readStringArray, renderJson, safeJson } from './util/json.js';

export { sha256, sha256Bytes } from './util/hash.js';

export {
  DEFAULT_FILE_MODE,
  MANIFEST_FILE_NAME,
  buildPackManifest,
  createTar,
  createTarGzip,
  normalizePackEntries,
  readTar,
  renderPackManifest,
  verifyPackManifest,
} from './pack/archive.js';
export type {
  PackEntry,
  PackManifest,
  PackManifestEntry,
  PackVerifyResult,
} from './pack/archive.js';

export {
  EXAMPLE_PACK_PREFIX,
  EXAMPLE_PACK_STEPS,
  buildExamplePack,
  exampleTargetCommands,
  renderExampleReadme,
  renderExampleRunScript,
} from './pack/example.js';
export type { ExamplePackStep, ExampleTargetCommand } from './pack/example.js';

export {
  CLI_VERSION,
  EVOLVE_ACTIONS,
  formatCommandHelp,
  formatHelp,
  formatVersion,
  HELP_TOPICS,
  parseCliArgs,
  PULL_BACKEND_FLAGS,
  PULL_BACKEND_IDS,
} from './cli/args.js';
export type {
  CliCommand,
  CliParseResult,
  EvolveAction,
  ExportTarget,
  PullCommand,
} from './cli/args.js';

export {
  buildRulegenPrompt,
  parseRulegenResponse,
  parseRulegenResponseChecked,
  rulegenLayoutFields,
  validateGeneratedLayout,
} from './llm/rulegen.js';
export type {
  GeneratedLayout,
  LayoutValidation,
  RulegenParseResult,
  SampleRecord,
} from './llm/rulegen.js';
export type { LlmProvider } from './llm/provider.js';

export {
  DEEPSEEK_DEFAULT_BASE_URL,
  DEEPSEEK_DEFAULT_MODEL,
  DEEPSEEK_CHAT_COMPLETIONS_PATH,
  buildDeepSeekRequest,
  createDeepSeekProvider,
  parseDeepSeekResponse,
} from './llm/deepseek.js';
export type { DeepSeekOptions, DeepSeekRequest } from './llm/deepseek.js';

export {
  OPENAI_DEFAULT_BASE_URL,
  OPENAI_DEFAULT_MODEL,
  OPENAI_CHAT_COMPLETIONS_PATH,
  buildOpenAiRequest,
  createOpenAiProvider,
  parseOpenAiResponse,
} from './llm/openai.js';
export type { OpenAiOptions, OpenAiRequest } from './llm/openai.js';

export {
  ANTHROPIC_DEFAULT_BASE_URL,
  ANTHROPIC_DEFAULT_MAX_TOKENS,
  ANTHROPIC_DEFAULT_MODEL,
  ANTHROPIC_MESSAGES_PATH,
  ANTHROPIC_VERSION,
  buildAnthropicRequest,
  createAnthropicProvider,
  parseAnthropicResponse,
} from './llm/anthropic.js';
export type { AnthropicOptions, AnthropicRequest } from './llm/anthropic.js';

export {
  DEFAULT_LLM_PROVIDER,
  LLM_PROVIDER_ENV_VARS,
  LLM_PROVIDER_IDS,
  createLlmProvider,
  isLlmProviderId,
  resolveLlmProviderConfig,
} from './llm/registry.js';
export type {
  LlmProviderBuildResult,
  LlmProviderConfigResult,
  LlmProviderId,
  LlmProviderOptions,
} from './llm/registry.js';

export {
  inferFaultCategory,
  normalizeFaultType,
  parseFaultSpec,
} from './fault/collector.js';
export type {
  FaultSpec,
  FaultSpecParseResult,
  InjectionMethod,
} from './fault/collector.js';

export {
  buildFaultExtractionPrompt,
  parseFaultExtractionResponse,
  validateExtractedFault,
} from './fault/importer.js';
export type {
  ExtractedFault,
  FaultExtractionParseResult,
  FaultExtractionValidation,
} from './fault/importer.js';

export {
  CHAOS_MESH_FAULT_TYPES,
  planInjection,
  readInjectionStatus,
} from './fault/injector.js';
export type {
  ChaosMeshFaultType,
  InjectionPlan,
  InjectionPlanInput,
  InjectionPlanResult,
  InjectionStatusReading,
} from './fault/injector.js';

/**
 * Extraction-accuracy scoring for the historical-fault channel.
 *
 * Exported because it is the module the M1 exit condition is measured by, and a
 * reader who wants to challenge the figure should be able to recompute it from
 * the same inputs the CI workflow uses. `M1_STRICT_THRESHOLD` is part of the
 * surface on purpose -- it is the number the exit condition is written against,
 * and it should not have to be found by reading source.
 */
export {
  FAILURE_EXCERPT_LIMIT,
  FAULT_GOLDEN_SCHEMA,
  M1_STRICT_THRESHOLD,
  SCORED_FIELDS,
  buildExtractionReport,
  describeExtractionFailure,
  formatExtractionReport,
  meetsM1ExitCondition,
  parseGoldenDataset,
  scoreExtractionSample,
} from './fault/extraction-scoring.js';
export type {
  ExtractionReport,
  ExtractionSamplePrediction,
  FieldOutcome,
  GoldenDataset,
  GoldenSample,
  LayeredRate,
  LayerMetrics,
  SampleState,
  SampleVerdict,
  ScoredField,
  UnusableSample,
} from './fault/extraction-scoring.js';

// The record's transcription step, as code. `readings.json` was written by hand from a
// workflow artefact for six readings; a row typed wrongly is self-consistent, and the file
// it was copied from is on a blob host. Exported so `scripts/record-reading.mjs` derives the
// entry instead of composing it, and so the two derived fields -- `key.digest` and `totals` --
// have no path from a human's keyboard.
export {
  assembleReading,
  compareReadingToArtefact,
  digestExpectedColumn,
} from './fault/reading-record.js';
export type {
  AssembleReadingRequest,
  ReadingAnswer,
  ReadingDifference,
  ReadingEntry,
  ReadingField,
  ReadingSample,
  ReadingStatus,
  ReadingTotals,
} from './fault/reading-record.js';

// The baseline localiser G4 needs. Exported because G4 reads outcomes rather than signals, so a
// gate over the corpus is only as meaningful as the run behind it -- and a run nobody can call is
// a run nobody can reproduce.
export {
  PEAK_Z_METHOD,
  locateWithPeakZScore,
  rankServicesByPeakZScore,
} from './fault/baseline-localiser.js';
export type { LocalisationReading, ServiceRank } from './fault/baseline-localiser.js';

// The second baseline. G4 with one solver asks whether a method agrees with its own construction;
// with two that fail differently it asks whether the case carries a locatable structure at all.
export {
  ROBUST_SHIFT_METHOD,
  locateWithMedianShift,
  rankServicesByMedianShift,
} from './fault/robust-localiser.js';
export type { ShiftRank, ShiftReading } from './fault/robust-localiser.js';

// The arithmetic a `derived` checkpoint states. A derived checkpoint used to carry one `signalRef`
// and put the computation in its number, so the annotation stated a calculation nothing read and two
// checkpoints could name one series with different arithmetic and agree (finding 245). The grammar
// lives here rather than in the guard because the guard's message has to say where an expression
// stopped being arithmetic, and that is a function of the parse.
export {
  MAX_EXPRESSION_DEPTH,
  RELATIVE_TOLERANCE,
  compareExactly,
  describeExpressionProblem,
  evaluateExpression,
  holdsWithTolerance,
  isNumericComparator,
} from './fault/expression.js';
export type {
  ExpressionOutcome,
  ExpressionProblem,
  ExpressionReference,
  ExpressionSeries,
  ExpressionValue,
} from './fault/expression.js';

// M1's "GT four-layer annotation can all be filled", as a thing that can fail. The schema marks
// `causalChain` and `evidenceCheckpoints` optional and `rootCauseEntityId` is a string nothing
// resolves, so until this existed the condition was met by definition. Exported because the
// count over a corpus is the evidence for the corpus, and a reading only one test can take is a
// reading nobody can re-take against the next thirty samples.
export { assessFourLayer, formatFourLayerReading } from './fault/four-layer.js';

// The floor under a difficulty label. `FaultCase.difficulty` had no definition anywhere -- the
// corpus's five labels do not track structure and are not comparable with each other -- so this is
// the one property any definition must have: a case cannot claim less structure than its own chain
// carries. Weaker than a definition, and checkable, which the alternative was not.
export { difficultyFloor, findDifficultyShortfalls } from './fault/difficulty.js';
export type { DifficultyShortfall } from './fault/difficulty.js';

// The system's background telemetry: the series a case does not quote because they assert nothing
// about the incident, and the rules that keep them from being read as evidence.
export {
  BACKGROUND_SCHEMA,
  backgroundProblems,
  backgroundSeries,
  parseBackground,
} from './fault/background.js';
export type { BackgroundDeclaration, BackgroundSeries } from './fault/background.js';

// Why the answer is not at rank 1, when it is not: a louder component, a tie broken by name, or a
// candidate that is a part of the answer. Only the first is evidence a benchmark can rest on.
// Whose line it is: a log checkpoint names an entity, the line it cites was written by one, and
// nothing compared the two until the corpus's twenty-fourth case cited a line from a container.
export { checkLogAttribution } from './fault/log-attribution.js';
export type { LogLineAttribution } from './fault/log-attribution.js';

// Which series a checkpoint's `signalRef` names. A series is a reading taken on something, so its
// identity is `(entity, metric)` -- and the guard resolved the metric alone for as long as the file
// refused a repeated metric name. Finding 323 is the entity half of that join, and finding 299's
// repair (one metric on two entities) is what makes the ambiguity a case the resolver has to answer
// rather than a tie it may break.
export { describeReadingProblem, resolveReading } from './fault/reading-reference.js';
export { MIN_NOTE_LENGTH, checkParameterNotes, describeParameterNoteFault } from './fault/parameter-notes.js';
export type { ParameterNoteFault, ParameterNotesReport } from './fault/parameter-notes.js';
export type { ReadingCarrier, ReadingMatch, ReadingRefusal } from './fault/reading-reference.js';

// Whether the answer is a name the telemetry carries. A case whose readings are filed under its pod
// while the answer is the service is complete in every layer and impossible to score, and the gate
// that noticed said "no baseline can locate the root cause" -- a sentence about solvers.
export { checkAnswerPresence } from './fault/answer-presence.js';
export { checkSampleCoverage } from './fault/sample-coverage.js';

export { classifyDisplacement } from './fault/displacement.js';
export type { DisplacementKind, DisplacementReading, RankedCandidate } from './fault/displacement.js';
export type {
  DanglingEvidenceRef,
  FourLayerReading,
  LayerName,
  LayerReading,
  UnresolvedRef,
} from './fault/four-layer.js';

export {
  MISS_DETAIL_TITLE,
  isTruncated,
  parseMissDetail,
  readMissDetail,
} from './fault/miss-detail.js';
export type { MissDetailReading, MissDetailRow } from './fault/miss-detail.js';

export {
  adjudicateAll,
  adjudicateMiss,
  countAdjudications,
  crossProduct,
  sampleAdjudication,
  tokenize,
} from './fault/miss-adjudication.js';
export type {
  AdjudicatedMiss,
  Adjudication,
  AdjudicationCounts,
  CrossProduct,
  SampleAdjudication,
} from './fault/miss-adjudication.js';

export {
  COUNTER_EVIDENCE_PHRASES,
  assessCounterEvidence,
  countCounterEvidence,
  counterEvidenceReport,
} from './fault/miss-distractor.js';
export type {
  CounterEvidenceCounts,
  CounterEvidenceReading,
  CounterEvidenceReport,
  CounterEvidenceVerdict,
  GradedSample,
} from './fault/miss-distractor.js';

export {
  DENIAL_MARKERS,
  assessCategoryDenial,
  buildDenialInventory,
} from './fault/denial-inventory.js';
export type {
  DenialInventory,
  DenialReading,
  DenialVerdict,
  InventorySample,
} from './fault/denial-inventory.js';

// The shared category vocabulary, exported because two readings now read through it and
// the agreement test asserts it has not drifted from the classifier's. A table that only
// its own module can see cannot be cross-checked by anything else.
export { CATEGORY_TERMS } from './fault/category-terms.js';

export {
  assessComponentAgreement,
  buildAgreementInventory,
} from './fault/component-agreement.js';
export type {
  AgreementInventory,
  AgreementReading,
  AgreementSample,
  AgreementVerdict,
} from './fault/component-agreement.js';

// The control for finding 99. The agreement reading reported `7 of 7` with no baseline;
// run against the dataset's own components -- right by construction -- it fails 18 of 19,
// so the figure distinguishes nothing. Exported because a control that lives only in a
// test file is a control the next iteration cannot re-run against a new corpus.
export {
  BASELINE_FLOOR,
  buildAgreementContrast,
  buildBaselineInventory,
  readBaselineSupport,
} from './fault/agreement-baseline.js';
export type {
  AgreementContrast,
  BaselineInventory,
  BaselineReading,
  BaselineSample,
} from './fault/agreement-baseline.js';

// The category rule the dataset uses, checked, and measured for discriminating power before any
// figure drawn from it is quoted. See `fault/category-derivation.ts`.
export {
  ALT_READING_FLOOR,
  DOWNSTREAM_FLOOR,
  EXCESS_ALLOWANCE,
  assessDatasetConformance,
  assessDerivability,
  assessDownstreamAgreement,
  assessExcess,
  assessMissDerivability,
  assessMissStability,
  assessDiscriminatingPower,
  buildCategoryDerivationReport,
  CATEGORY_CONSUMERS,
  downstreamCaveat,
  duplicateTypeDeclarations,
} from './fault/category-derivation.js';
export type {
  AlternativeReading,
  AlternativeReadingName,
  CategoryConsumer,
  CategoryDerivationReport,
  CategoryRole,
  ConformanceReading,
  DerivabilityReading,
  DownstreamReading,
  DownstreamSampleReading,
  DerivationSample,
  ExcessReading,
  MissReading,
  MissSample,
  MissStability,
  PowerReading,
  RunMisses,
} from './fault/category-derivation.js';

export { hitlGateFor } from './evolution/hitl.js';
export type {
  EvolutionActionKind,
  HitlGate,
  HitlStatus,
} from './evolution/hitl.js';

export {
  approveProposal,
  buildEvolutionProposal,
  computeRegression,
  computeStaleCases,
  isProductionReady,
  isSubmittable,
  isValidRuleChange,
  rejectProposal,
  triggerFromGateReport,
  triggerFromScoreReport,
} from './evolution/proposal.js';
export type {
  BuildProposalInput,
  EvolutionLayer,
  EvolutionProposal,
  EvolutionTrigger,
  RegressionResult,
  RuleChange,
  RuleChangeKind,
} from './evolution/proposal.js';

export {
  escapeHtml,
  renderCoverage,
  renderEntityGraph,
  renderGates,
  renderPage,
  renderScore,
} from './report/html.js';
export type { HtmlReportInput } from './report/html.js';
