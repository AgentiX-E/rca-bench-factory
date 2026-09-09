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
  checkOpenRcaStructure,
  checkRca100Structure,
  checkRcaEvalStructure,
  scoreExport,
  sha256,
  verifyChecksums,
} from './score/score.js';
export type {
  ChecksumReport,
  ScoreCheck,
  ScoreReport,
  ScoreTargetId,
  StructureReport,
} from './score/score.js';

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
