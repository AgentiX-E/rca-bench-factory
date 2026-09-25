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
  METRIC_SEMANTIC_TYPES,
  SPAN_STATUSES,
  ENTITY_KINDS,
  FAULT_CATEGORIES,
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
  ProfilePayload,
  ProvenanceSource,
  QualityGateReport,
  RootCauseIndicator,
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
  entityId,
  findAmbiguousAliases,
  findDanglingEdgeRefs,
  findInvalidRelations,
  indexGraph,
  normalizeAliases,
  resolveEntityRef,
} from './entity/graph.js';
export type { GraphIndex, ReferenceIssue } from './entity/graph.js';

export {
  DEFAULT_SENSITIVE_PATTERNS,
  caseFingerprint,
  checkG1Structural,
  checkG2Semantic,
  checkG3Validity,
  checkG4Solvability,
  checkG5AntiPollution,
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
  RCAEVAL_SUITES,
  RCAEVAL_TARGET_ID,
  buildLogsCsv,
  buildMetricsJson,
  buildTracesCsv,
  caseDirName,
  exportRcaEval,
} from './export/rcaeval.js';
export type { RcaEvalSuite } from './export/rcaeval.js';

export {
  RCA100_CONTRACT_VERSION,
  RCA100_TARGET_ID,
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
  AIOPS2025_CONTRACT_VERSION,
  AIOPS2025_TARGET_ID,
  buildAioPs2025GroundTruth,
  buildAioPs2025Input,
  exportAioPs2025,
} from './export/aiops2025.js';

export {
  CLOUD_OPSBENCH_CONTRACT_VERSION,
  CLOUD_OPSBENCH_TARGET_ID,
  buildCloudOpsBenchMetadata,
  exportCloudOpsBench,
} from './export/cloudopsbench.js';

export {
  OPENRCA2_CONTRACT_VERSION,
  OPENRCA2_TARGET_ID,
  buildCausalPathJson,
  exportOpenRca2,
} from './export/openrca2.js';

export {
  ITBENCH_CONTRACT_VERSION,
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
  convertUnit,
  dimensionOf,
  getUnitDef,
  isConvertible,
  knownUnits,
} from './util/unit.js';
export type { Dimension } from './util/unit.js';

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
} from './cli/args.js';
export type { CliCommand, CliParseResult, EvolveAction, ExportTarget } from './cli/args.js';

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
  FAULT_GOLDEN_SCHEMA,
  M1_STRICT_THRESHOLD,
  SCORED_FIELDS,
  buildExtractionReport,
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
} from './fault/extraction-scoring.js';

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
