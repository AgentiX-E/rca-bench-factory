/**
 * @rca-bench-factory/core
 *
 * Public surface of the core package: IR types and schemas, the deterministic
 * transform engine, entity normalization, quality gates, exporters and the
 * observability coverage report.
 */

export { IR_VERSION } from './ir/types.js';
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
  MetricPayload,
  ProfilePayload,
  ProvenanceSource,
  QualityGateReport,
  RootCauseIndicator,
  SignalKind,
  SignalPayload,
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
export type { ExportedFiles, OpenRcaExportResult } from './export/openrca.js';

export {
  RCAEVAL_CONTRACT_VERSION,
  RCAEVAL_TARGET_ID,
  buildLogsCsv,
  buildMetricsJson,
  buildTracesCsv,
  caseDirName,
  exportRcaEval,
} from './export/rcaeval.js';
export type { RcaEvalExportResult, RcaEvalSuite } from './export/rcaeval.js';

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
export type { EntityIndex, Rca100ExportResult, Rca100ModalityTable } from './export/rca100.js';

export {
  AIOPS2025_CONTRACT_VERSION,
  AIOPS2025_TARGET_ID,
  buildAioPs2025GroundTruth,
  buildAioPs2025Input,
  exportAioPs2025,
} from './export/aiops2025.js';
export type { AioPs2025ExportResult } from './export/aiops2025.js';

export {
  CLOUD_OPSBENCH_CONTRACT_VERSION,
  CLOUD_OPSBENCH_TARGET_ID,
  buildCloudOpsBenchMetadata,
  exportCloudOpsBench,
} from './export/cloudopsbench.js';
export type { CloudOpsBenchExportResult } from './export/cloudopsbench.js';

export {
  OPENRCA2_CONTRACT_VERSION,
  OPENRCA2_TARGET_ID,
  buildCausalPathJson,
  exportOpenRca2,
} from './export/openrca2.js';
export type { OpenRca2ExportResult } from './export/openrca2.js';

export {
  ITBENCH_CONTRACT_VERSION,
  ITBENCH_SRE_DOMAIN,
  ITBENCH_TARGET_ID,
  buildItBenchScenarioSpec,
  exportItBench,
} from './export/itbench.js';
export type { ItBenchExportResult } from './export/itbench.js';

export {
  MODALITY_LOSS,
  TARGET_REQUIREMENTS,
  computeCoverage,
  formatCoverageReport,
} from './coverage.js';
export type { CoverageReport, TargetFeasibility, TargetId } from './coverage.js';

export {
  ISO_UTC_PATTERN,
  epochMsToIsoUtc,
  isWithinWindow,
  isoUtcToEpochMs,
  isoUtcToOffsetIso,
  parseTimestamp,
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

export {
  checkAioPs2025Structure,
  checkCloudOpsBenchStructure,
  checkItBenchStructure,
  checkOpenRcaStructure,
  checkOpenRca2Structure,
  checkRca100Structure,
  checkRcaEvalStructure,
  scoreExport,
  SCORE_TARGET_IDS,
  verifyChecksums,
} from './score/score.js';
export type {
  ChecksumReport,
  ScoreCheck,
  ScoreReport,
  ScoreTargetId,
  StructureReport,
} from './score/score.js';

export { sha256, sha256Bytes } from './util/hash.js';

export {
  DEFAULT_FILE_MODE,
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

export { CLI_VERSION, formatHelp, formatVersion, parseCliArgs } from './cli/args.js';
export type { CliCommand, CliParseResult, EvolveAction, ExportTarget } from './cli/args.js';

export {
  buildRulegenPrompt,
  parseRulegenResponse,
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
  approve,
  hitlGateFor,
  isApproved,
  pendingDecision,
  reject,
} from './evolution/hitl.js';
export type {
  EvolutionActionKind,
  HitlDecision,
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
