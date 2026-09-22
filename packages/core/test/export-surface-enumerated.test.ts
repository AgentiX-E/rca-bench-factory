import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * A coverage threshold cannot see a module nobody imports.
 *
 * `vitest.config.ts` asks for 95% on four dimensions and the suite reports
 * 99.9x on all of them. That number describes the files v8 loaded. A source file
 * no test ever reaches is reported as 0% and drags the average down, which is the
 * one case a threshold catches. The case it does not catch is the opposite one --
 * and it is the one that actually happened in this repository's siblings: a
 * module that *is* reached, but whose exported symbols nobody calls. Statements
 * execute, branches get taken, the threshold is satisfied, and the symbol is
 * still dead.
 *
 * So this file asks a different question. Not "was this line executed" but
 * "does anything outside this module name this export". The two are not
 * extensions of each other; `check-no-mock.mjs` had 100% line coverage while
 * printing `check-no-mock: OK` on a tree full of mocks, because the *exit* was
 * unreachable, not the *lines*.
 *
 * ---
 *
 * Two design notes, because both are places where an earlier draft of this file
 * was wrong in the exact way it exists to catch.
 *
 * 1. `TESTED` below is hand-written and must stay hand-written. Generating it by
 *    scanning `test/` for `import { X }` and then asserting it equals what the
 *    tests import is a tautology: delete a test, the expectation shrinks with it,
 *    and the file stays green. It is the same defect recorded as finding 47 in
 *    `docs/audit.md`, one level down. An enumeration gate is only worth its name
 *    when its list is independent of the thing it enumerates.
 *
 * 2. The scan reads source text, not the module graph. That is deliberate:
 *    importing all 40 modules to check them would execute module top-level code
 *    for every one of them, which is a real side effect in a package that writes
 *    files. Text is the weaker mechanism, and the honest statement of what
 *    follows from it is "no non-test file names this symbol" -- not "nothing
 *    calls it". A symbol used only through a computed property would be a false
 *    positive here, so the failure message says what was actually observed.
 *
 * 3. The module list is a claim, so the list is asserted against the directory.
 *    The first draft named the 17 modules by hand and stopped there. Injecting a
 *    new export into `export/guard.ts` then left the suite at `Tests 153 passed`
 *    -- the injected symbol was invisible, because a module outside the written
 *    list is never scanned. That is finding 47's defect wearing a new hat: an
 *    expectation that cannot see the thing it is supposed to measure. The fix is
 *    `UNENUMERATED`, below, which walks `src/` and requires every module to be a
 *    deliberate member of the list or a deliberate exception.
 *
 * 4. The exception list turned out to be the same defect a third time, and the
 *    third time was the hardest to see. `UNENUMERATED` was keyed by *module*:
 *    "cli/args.ts is reached through the CLI command table". That reason is about
 *    one or two entry points. The scan it exempted covered the module's entire
 *    surface -- `namedExports` plus `bracedExports` -- so a symbol added to
 *    `cli/args.ts` next month would be exempted by a reason written about a
 *    different symbol. An exemption whose scope is wider than its argument is
 *    finding 47 again: the expectation (the reason) no longer covers the thing
 *    measured (every export of the module).
 *
 *    The repair is to key the exception by *symbol*, not by module:
 *    `ENUMERATED_MODULES` now holds all 43 modules, and `EXEMPT_EXPORTS` holds the
 *    individual names that genuinely have no consumer, each with its own reason.
 *    A module-wide exemption is now impossible to express.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(HERE, '..');
const SRC = join(PACKAGE_ROOT, 'src');

/**
 * The 43 modules `src/` contains, every one of them scanned.
 *
 * The list began as the four directories `09-推进进度追踪.md` names as needing an
 * enumeration rather than a threshold: `ir/`, `score/`, `export/` and `gates/`.
 * The other ten directories were exempted module by module in `UNENUMERATED`,
 * on arguments like "reached through the CLI command table" or "reached through
 * the provider registry".
 *
 * Those arguments were checked, and they held -- probing all 26 non-trivial
 * exempted modules found **zero** exports without a consumer outside `test/`.
 * So the exemptions were not hiding dead code. They were hiding the *question*:
 * each was a reason about one or two entry points standing in for a scan of
 * every export the module declares. Promoting the modules is therefore not a
 * repair of a hole; it converts 26 arguments into 26 assertions, and it is
 * measurable that it changed nothing else -- the export count is identical
 * before and after.
 *
 * The list is explicit rather than globbed so that adding a module is a visible
 * edit to this file. A glob would make a new module silently expected to be
 * covered -- or, worse, would make a *deleted* module silently stop being
 * expected, which is what `requiredConstructs()` in `gates-are-testable.test.ts`
 * exists to prevent for the gate scripts.
 */
const ENUMERATED_MODULES = [
  'coverage.ts',
  'index.ts',
  'ir/assembler.ts',
  'ir/guards.ts',
  'ir/schema.ts',
  'ir/types.ts',
  'score/dispatch.ts',
  'score/official.ts',
  'score/score.ts',
  'score/targets.ts',
  'export/aiops2025.ts',
  'export/cloudopsbench.ts',
  'export/guard.ts',
  'export/itbench.ts',
  'export/openrca.ts',
  'export/openrca2.ts',
  'export/rca100.ts',
  'export/rcaeval.ts',
  'gates/gates.ts',
  'gates/validity.ts',
  'cli/args.ts',
  'entity/graph.ts',
  'evolution/hitl.ts',
  'evolution/proposal.ts',
  'fault/collector.ts',
  'fault/importer.ts',
  'ingest/file.ts',
  'ingest/otlp.ts',
  'ingest/prime.ts',
  'llm/anthropic.ts',
  'llm/deepseek.ts',
  'llm/openai-compat.ts',
  'llm/openai.ts',
  'llm/provider.ts',
  'llm/rulegen.ts',
  'pack/archive.ts',
  'pack/example.ts',
  'report/html.ts',
  'transform/engine.ts',
  'transform/strategies.ts',
  'util/csv.ts',
  'util/hash.ts',
  'util/json.ts',
  'util/time.ts',
  'util/unit.ts',
];

/**
 * Individual exports that are deliberately not named outside `test/`, keyed by
 * `module::symbol` rather than by module.
 *
 * `UNENUMERATED`, which this replaces, was keyed by module and therefore exempted
 * every export the module would ever declare. Its reasons were true statements,
 * but each was about one entry point while the exemption covered the whole
 * surface -- an expectation narrower than the thing it measures. The promotion
 * probe showed the reasons had in fact held for every symbol present today, which
 * is exactly what made the defect survive: a defect that has not fired yet reads
 * as a design.
 *
 * Keying by symbol makes the scope of an exemption equal to its argument. There is
 * no way to write "this module is fine"; only "this name, for this reason".
 *
 * Every entry weakens the gate, so every one has to be argued. Two arguments are
 * admissible and no others:
 *
 *   - the symbol erases at runtime, so "some file names it" asserts only that
 *     some file mentions a word; or
 *   - the symbol is installed by the package manifest rather than by a call site,
 *     so no file *can* name it.
 *
 * "Inconvenient to consume" is not an argument, and neither is "reached through
 * the CLI table" -- the promotion probe showed those all have consumers, so the
 * honest entry is no entry at all.
 */
const EXEMPT_EXPORTS: Record<string, string> = {
  // `ir/types.ts` publishes the IR contract twice over: as `export type` aliases,
  // which erase, and as six `export const` runtime vocabularies, which do not.
  // Only the runtime half can be named by a consumer, and it is (`TESTED` carries
  // all eight). So the exemption is per symbol: the type aliases are excused one
  // line at a time rather than by a wildcard, because a wildcard here was wrong --
  // the "no runtime export" precondition for `*` failed the moment I wrote it, and
  // the check below is what said so.
  'ir/types.ts::SignalKind': 'type-only declaration; erases at runtime, so no consumer can name it',
  'ir/types.ts::LogSeverity': 'type-only declaration; erases at runtime, so no consumer can name it',
  'ir/types.ts::SpanStatus': 'type-only declaration; erases at runtime, so no consumer can name it',
  'ir/types.ts::ProvenanceSource': 'type-only declaration; erases at runtime, so no consumer can name it',
  'ir/types.ts::FieldProvenance': 'type-only declaration; erases at runtime, so no consumer can name it',
  'ir/types.ts::MetricSemanticType': 'type-only declaration; erases at runtime, so no consumer can name it',
  'ir/types.ts::MetricPayload': 'type-only declaration; erases at runtime, so no consumer can name it',
  'ir/types.ts::LogPayload': 'type-only declaration; erases at runtime, so no consumer can name it',
  'ir/types.ts::TracePayload': 'type-only declaration; erases at runtime, so no consumer can name it',
  'ir/types.ts::EventPayload': 'type-only declaration; erases at runtime, so no consumer can name it',
  'ir/types.ts::AlertPayload': 'type-only declaration; erases at runtime, so no consumer can name it',
  'ir/types.ts::ProfilePayload': 'type-only declaration; erases at runtime, so no consumer can name it',
  'ir/types.ts::SignalPayload': 'type-only declaration; erases at runtime, so no consumer can name it',
  'ir/types.ts::TelemetrySignal': 'type-only declaration; erases at runtime, so no consumer can name it',
  'ir/types.ts::EntityKind': 'type-only declaration; erases at runtime, so no consumer can name it',
  'ir/types.ts::Entity': 'type-only declaration; erases at runtime, so no consumer can name it',
  'ir/types.ts::EntityRelation': 'type-only declaration; erases at runtime, so no consumer can name it',
  'ir/types.ts::EntityEdge': 'type-only declaration; erases at runtime, so no consumer can name it',
  'ir/types.ts::EntityGraph': 'type-only declaration; erases at runtime, so no consumer can name it',
  'ir/types.ts::FaultCategory': 'type-only declaration; erases at runtime, so no consumer can name it',
  'ir/types.ts::Comparator': 'type-only declaration; erases at runtime, so no consumer can name it',
  'ir/types.ts::EvidenceCheckpoint': 'type-only declaration; erases at runtime, so no consumer can name it',
  'ir/types.ts::CausalStep': 'type-only declaration; erases at runtime, so no consumer can name it',
  'ir/types.ts::RootCauseIndicator': 'type-only declaration; erases at runtime, so no consumer can name it',
  'ir/types.ts::GroundTruth': 'type-only declaration; erases at runtime, so no consumer can name it',
  'ir/types.ts::FaultCase': 'type-only declaration; erases at runtime, so no consumer can name it',
  'ir/types.ts::GateId': 'type-only declaration; erases at runtime, so no consumer can name it',
  'ir/types.ts::GateStatus': 'type-only declaration; erases at runtime, so no consumer can name it',
  'ir/types.ts::GateViolation': 'type-only declaration; erases at runtime, so no consumer can name it',
  'ir/types.ts::GateResult': 'type-only declaration; erases at runtime, so no consumer can name it',
  'ir/types.ts::QualityGateReport': 'type-only declaration; erases at runtime, so no consumer can name it',
  'ir/types.ts::IrBundle': 'type-only declaration; erases at runtime, so no consumer can name it',
  'ir/types.ts::ValidityCheck': 'type-only declaration; erases at runtime, so no consumer can name it',
  'ir/types.ts::FaultValidityVerdict': 'type-only declaration; erases at runtime, so no consumer can name it',
  'ir/types.ts::FaultValidityReport': 'type-only declaration; erases at runtime, so no consumer can name it',
  // Ten `export type` lines and one interface, no runtime value among them. This
  // is the module `vitest.config.ts` excludes from coverage by name, for the same
  // reason: there is nothing in it to execute. The wildcard is admissible here and
  // only here, which is what the precondition check enforces.
  'llm/provider.ts::*': 'provider interfaces only; no runtime value to name',
  // A bare re-export. `src/index.ts` is the package entry point, and this line is
  // what `package.json`'s `exports` field resolves to; the manifest names it, so
  // no file inside `src/` does or should.
  'index.ts::assembleBundle': 'installed by the package manifest; no in-tree consumer can name it',
};

/**
 * `export type X` and `export interface X` -- names that exist in the source but
 * erase at runtime.
 *
 * Kept separate from `namedExports` on purpose. The two are counted differently:
 * a runtime export missing a consumer is a defect, and a type export is not
 * checkable by this mechanism at all. Merging them would let a module delete a
 * function and keep a same-named type, which reads as covered here.
 */
function typeExports(source: string): string[] {
  const names: string[] = [];
  const declaration = /^export\s+(?:type|interface)\s+([A-Za-z_$][\w$]*)/gm;
  for (const match of source.matchAll(declaration)) names.push(match[1]);
  return names;
}

/** `export function f`, `export const c`, `export class C` -- by name. */
function namedExports(source: string): string[] {
  const names: string[] = [];
  const declaration = /^export\s+(?:async\s+)?(?:function|const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm;
  for (const match of source.matchAll(declaration)) names.push(match[1]);
  return names;
}

/**
 * Every module under `src/`, as package-relative POSIX paths.
 *
 * This is the ground truth the hand-written `ENUMERATED_MODULES` is asserted
 * against, which is what makes that list a claim rather than a truism. Deleting a
 * directory would change this list, which is the signal.
 */
function allSourceModules(): string[] {
  return walk(SRC)
    .map((f) => relative(SRC, f).split('\\').join('/'))
    .sort();
}

/**
 * `export { a, b as c }` and `export { a } from './x.js'`.
 *
 * The local name is what a consumer writes, so for `b as c` it is `c`. Re-exports
 * count: `score/score.ts` republishes `sha256` and `SCORE_TARGET_IDS`, and a
 * consumer naming either is exercising the module even though it holds no
 * declaration.
 */
function bracedExports(source: string): string[] {
  const names: string[] = [];
  for (const match of source.matchAll(/^export\s*\{([^}]*)\}/gm)) {
    for (const piece of match[1].split(',')) {
      const alias = piece.split(/\s+as\s+/);
      const name = (alias[1] ?? alias[0]).trim();
      if (/^[A-Za-z_$][\w$]*$/.test(name)) names.push(name);
    }
  }
  return names;
}

/** Every `.ts` under `packages/core`, split into the tests and everything else. */
function walk(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) found.push(...walk(full));
    else if (entry.endsWith('.ts')) found.push(full);
  }
  return found;
}

const ALL_TS = walk(PACKAGE_ROOT);
const TEST_FILES = ALL_TS.filter((f) => f.includes(`${join('test', '')}`) || f.includes('/test/'));

/**
 * Text of every source file outside `test/`.
 *
 * `test/` is excluded because an export named only by its own test is exactly the
 * situation this gate is about -- the symbol has no consumer in the product. The
 * tests are the thing being counted *from*, not counted *as*.
 */
function nonTestSources(): Array<{ file: string; text: string }> {
  return ALL_TS.filter((f) => !TEST_FILES.includes(f)).map((f) => ({
    file: relative(PACKAGE_ROOT, f),
    text: readFileSync(f, 'utf8'),
  }));
}

/**
 * The hand-written list, corrected in the pass that added `gates/validity.ts`.
 *
 * **What was wrong before.** The first version held 32 entries, 7 of which do not
 * exist anywhere in `src/`: `assembleIrBundle`, `AssembleOptions`,
 * `assertEntityReferencesResolve`, `isInferred`, `scoreOfficialSubmission`,
 * `guardExport` and `runQualityGates`. The real names are `assembleBundle`, the
 * six `is*Signal` predicates, `scoreOfficial`, `assertExportableBundle` and
 * `runAllGates`. Two injections established the consequence: deleting the real
 * symbol `isVocabularyMember` turned the suite red, while replacing the *ghost*
 * `assembleIrBundle` with `totallyMadeUpNameThatCannotExist` left `64 passed`.
 * The list could not tell a real name from an invented one, and the only thing
 * that noticed a deletion was the `toBe(26)` count -- which measures how long the
 * list is, not whether its entries are real.
 *
 * That is finding 47's defect one more time, and worse than before. Findings 47
 * and 48 were both about an expectation that shrinks with the thing it measures;
 * this one was an expectation I fabricated. The names I invented happened to be
 * the ones P1-1 would later need, which is exactly how the error survived review:
 * it looked right, because I was already thinking about the next iteration.
 *
 * **What replaces it.** Two rules, both asserted below:
 *   1. Every name here is a real export of an enumerated module.
 *   2. Every real export is here, unless this exact `module::name` is in
 *      `EXEMPT_EXPORTS`.
 * So deleting a real name now fails on the *name*, and inventing one fails
 * immediately rather than being absorbed by a count. Rule 2 is a per-symbol
 * exemption rather than the per-module one it started as, which is the correction
 * recorded in the header: a module-wide exemption is wider than any single reason
 * that can be written for it.
 *
 * The claim this list makes is deliberately narrower than the name `TESTED`
 * suggests: "some module outside `test/` mentions this identifier". That is what
 * the checks below verify. It is not a claim about call sites.
 */
const TESTED = [
  // ir/assembler.ts
  'assembleBundle',
  // ir/guards.ts -- signal-narrowing predicates, one per payload kind.
  'isMetricSignal',
  'isLogSignal',
  'isTraceSignal',
  'isEventSignal',
  'isAlertSignal',
  'isProfileSignal',
  // ir/schema.ts
  'fieldProvenanceSchema',
  'metricPayloadSchema',
  'logPayloadSchema',
  'tracePayloadSchema',
  'eventPayloadSchema',
  'alertPayloadSchema',
  'profilePayloadSchema',
  'signalPayloadSchema',
  'telemetrySignalSchema',
  'entitySchema',
  'entityEdgeSchema',
  'entityGraphSchema',
  'evidenceCheckpointSchema',
  'causalStepSchema',
  'groundTruthSchema',
  'faultCaseSchema',
  'irBundleSchema',
  // ir/types.ts -- the runtime half; the type half is in EXEMPT_EXPORTS.
  'IR_VERSION',
  'SIGNAL_KINDS',
  'LOG_SEVERITIES',
  'SPAN_STATUSES',
  'ENTITY_KINDS',
  'FAULT_CATEGORIES',
  'METRIC_SEMANTIC_TYPES',
  'isVocabularyMember',
  // score/dispatch.ts
  'EXPORTERS',
  'exportForScoreTarget',
  'scoreTargetInvocation',
  // score/official.ts
  'OFFICIAL_FACETS',
  'OFFICIAL_METRICS',
  'officialMetric',
  'parseOpenRcaScoringPoints',
  'readOpenRcaGroundTruth',
  'parseOpenRcaPrediction',
  'readOpenRcaSubmission',
  'parseRcaEvalPath',
  'parseRcaEvalDirectory',
  'readOfficialGroundTruth',
  'oraclePrediction',
  'readOfficialSubmission',
  'openRcaTimeMatches',
  'scoreOfficial',
  'mutatePrediction',
  'officialCaseFailures',
  'runOfficialRegression',
  'runAllOfficialRegressions',
  // score/score.ts
  'checkOpenRcaStructure',
  'checkRcaEvalStructure',
  'checkRca100Structure',
  'AIOPS2025_INSTANCE_TYPES',
  'checkAioPs2025Structure',
  'checkCloudOpsBenchStructure',
  'checkItBenchStructure',
  'checkOpenRca2Structure',
  'verifyChecksums',
  'scoreExport',
  'sha256',
  // score/targets.ts
  'SCORE_TARGET_IDS',
  // export/guard.ts
  'assertExportableBundle',
  'STRUCTURAL_CODES',
  'CASE_LEVEL_CODES',
  // export/aiops2025.ts
  'AIOPS2025_TARGET_ID',
  'AIOPS2025_CONTRACT_VERSION',
  'buildAioPs2025GroundTruth',
  'buildAioPs2025Input',
  // export/cloudopsbench.ts
  'CLOUD_OPSBENCH_TARGET_ID',
  'CLOUD_OPSBENCH_CONTRACT_VERSION',
  'buildCloudOpsBenchMetadata',
  // export/itbench.ts
  'ITBENCH_TARGET_ID',
  'ITBENCH_CONTRACT_VERSION',
  'ITBENCH_SRE_DOMAIN',
  'buildItBenchScenarioSpec',
  // export/openrca.ts
  'OPENRCA_TARGET_ID',
  'OPENRCA_CONTRACT_VERSION',
  'OPENRCA_OFFSET_MINUTES',
  'OPENRCA_GROUNDTRUTH_HEADER',
  'OPENRCA_TASK_INDEXES',
  'OPENRCA_SCORING_TEMPLATES',
  'openRcaTaskIndex',
  'hasRootCauseElements',
  'buildScoringPoints',
  'buildGroundTruthCsv',
  'buildMetricCsv',
  'buildLogCsv',
  'buildTraceCsv',
  'buildPredictionJson',
  'injectTimeUnixSeconds',
  // export/openrca2.ts
  'OPENRCA2_TARGET_ID',
  'OPENRCA2_CONTRACT_VERSION',
  'buildCausalPathJson',
  // export/rca100.ts
  'RCA100_TARGET_ID',
  'RCA100_CONTRACT_VERSION',
  'buildEntityIndex',
  'resolveSignalEntity',
  'buildTopologyJson',
  'buildRca100Metrics',
  'buildRca100Logs',
  'buildRca100Traces',
  'buildRca100Events',
  'buildRca100Alerts',
  'buildTaskJson',
  'buildGroundTruthJson',
  // export/rcaeval.ts
  'RCAEVAL_TARGET_ID',
  'RCAEVAL_CONTRACT_VERSION',
  'RCAEVAL_SUITES',
  'caseDirName',
  'buildMetricsJson',
  'buildLogsCsv',
  'buildTracesCsv',
  // export/*.ts -- one entry point each, named in score/dispatch.ts.
  'exportOpenRca',
  'exportOpenRca2',
  'exportRcaEval',
  'exportRca100',
  'exportAioPs2025',
  'exportCloudOpsBench',
  'exportItBench',
  // gates/gates.ts
  'checkG1Structural',
  'checkG2Semantic',
  'checkG3Validity',
  'checkG4Solvability',
  'checkG5AntiPollution',
  'runAllGates',
  'zScore',
  'mean',
  'stddev',
  'sustainedAnomalySamples',
  'DEFAULT_SENSITIVE_PATTERNS',
  'caseFingerprint',
  // gates/validity.ts
  'FAULT_EXPECTATIONS',
  'expectedSignalsFor',
  'verifyFaultValidity',
  // --- promoted in P1-2: the ten directories that were exempted by module ---
  // coverage.ts
  'MODALITY_LOSS',
  'TARGET_REQUIREMENTS',
  'computeCoverage',
  'formatCoverageReport',
  // index.ts
  'ANTHROPIC_DEFAULT_BASE_URL',
  'ANTHROPIC_DEFAULT_MAX_TOKENS',
  'ANTHROPIC_DEFAULT_MODEL',
  'ANTHROPIC_MESSAGES_PATH',
  'ANTHROPIC_VERSION',
  'CLI_VERSION',
  'DEEPSEEK_CHAT_COMPLETIONS_PATH',
  'DEEPSEEK_DEFAULT_BASE_URL',
  'DEEPSEEK_DEFAULT_MODEL',
  'DEFAULT_FILE_MODE',
  'EVOLVE_ACTIONS',
  'EXAMPLE_PACK_PREFIX',
  'EXAMPLE_PACK_STEPS',
  'FILE_FORMATS',
  'HELP_TOPICS',
  'ISO_UTC_PATTERN',
  'MANIFEST_FILE_NAME',
  'MODALITY_LOSS',
  'OPENAI_CHAT_COMPLETIONS_PATH',
  'OPENAI_DEFAULT_BASE_URL',
  'OPENAI_DEFAULT_MODEL',
  'PRIME_DATASET_IDS',
  'TARGET_REQUIREMENTS',
  'TIME_LAYOUTS',
  'applyExpr',
  'applyLookup',
  'applyMap',
  'applyRegex',
  'applyRule',
  'applyTemplate',
  'applyTime',
  'applyUnit',
  'approveProposal',
  'buildAnthropicRequest',
  'buildDeepSeekRequest',
  'buildEvolutionProposal',
  'buildExamplePack',
  'buildFaultExtractionPrompt',
  'buildOpenAiRequest',
  'buildPackManifest',
  'buildRulegenPrompt',
  'checkNoSilentLoss',
  'computeCoverage',
  'computeRegression',
  'computeStaleCases',
  'convertUnit',
  'createAnthropicProvider',
  'createDeepSeekProvider',
  'createOpenAiProvider',
  'createTar',
  'createTarGzip',
  'csvCell',
  'csvColumn',
  'detectFileLayout',
  'dimensionOf',
  'entityId',
  'epochMsToIsoUtc',
  'escapeHtml',
  'evalExpr',
  'exampleTargetCommands',
  'findAmbiguousAliases',
  'findDanglingEdgeRefs',
  'findInvalidRelations',
  'formatCommandHelp',
  'formatCoverageReport',
  'formatHelp',
  'formatVersion',
  'getUnitDef',
  'hitlGateFor',
  'indexGraph',
  'inferFaultCategory',
  'ingestFile',
  'ingestOtlpLogs',
  'ingestOtlpMetrics',
  'ingestOtlpTraces',
  'ingestPrimeDataset',
  'isConvertible',
  'isProductionReady',
  'isRecord',
  'isSubmittable',
  'isValidRuleChange',
  'isWithinWindow',
  'isoUtcToEpochMs',
  'isoUtcToOffsetIso',
  'knownUnits',
  'normalizeAliases',
  'normalizeFaultType',
  'normalizePackEntries',
  'parseAnthropicResponse',
  'parseCliArgs',
  'parseCsvObjects',
  'parseCsvRows',
  'parseDeepSeekResponse',
  'parseDelimited',
  'parseFaultExtractionResponse',
  'parseFaultSpec',
  'parseJsonArray',
  'parseJsonl',
  'parseOpenAiResponse',
  'parseRulegenResponse',
  'parseRulegenResponseChecked',
  'parseTimestamp',
  'readString',
  'readStringArray',
  'readTar',
  'rejectProposal',
  'renderCoverage',
  'renderCsv',
  'renderEntityGraph',
  'renderExampleReadme',
  'renderExampleRunScript',
  'renderGates',
  'renderJson',
  'renderPackManifest',
  'renderPage',
  'renderScore',
  'resolveEntityRef',
  'rulegenLayoutFields',
  'safeJson',
  'sha256Bytes',
  'transformBatch',
  'transformTraceBatch',
  'triggerFromGateReport',
  'triggerFromScoreReport',
  'validateExtractedFault',
  'validateGeneratedLayout',
  'verifyPackManifest',
  // cli/args.ts
  'CLI_VERSION',
  'EVOLVE_ACTIONS',
  'EXPORT_TARGETS',
  'HELP_TOPICS',
  'formatCommandHelp',
  'formatHelp',
  'formatVersion',
  'parseCliArgs',
  // entity/graph.ts
  'VALID_RELATIONS',
  'entityId',
  'findAmbiguousAliases',
  'findDanglingEdgeRefs',
  'findInvalidRelations',
  'indexGraph',
  'normalizeAliases',
  'resolveEntityRef',
  // evolution/hitl.ts
  'hitlGateFor',
  // evolution/proposal.ts
  'approveProposal',
  'buildEvolutionProposal',
  'computeRegression',
  'computeStaleCases',
  'isProductionReady',
  'isSubmittable',
  'isValidRuleChange',
  'rejectProposal',
  'triggerFromGateReport',
  'triggerFromScoreReport',
  // fault/collector.ts
  'inferFaultCategory',
  'normalizeFaultType',
  'parseFaultSpec',
  // fault/importer.ts
  'buildFaultExtractionPrompt',
  'parseFaultExtractionResponse',
  'validateExtractedFault',
  // ingest/file.ts
  'FILE_FORMATS',
  'detectFileLayout',
  'ingestFile',
  'parseDelimited',
  'parseJsonArray',
  'parseJsonl',
  // ingest/otlp.ts
  'ingestOtlpLogs',
  'ingestOtlpMetrics',
  'ingestOtlpTraces',
  // ingest/prime.ts
  'PRIME_DATASET_IDS',
  'ingestPrimeDataset',
  // llm/anthropic.ts
  'ANTHROPIC_DEFAULT_BASE_URL',
  'ANTHROPIC_DEFAULT_MAX_TOKENS',
  'ANTHROPIC_DEFAULT_MODEL',
  'ANTHROPIC_MESSAGES_PATH',
  'ANTHROPIC_VERSION',
  'buildAnthropicRequest',
  'createAnthropicProvider',
  'parseAnthropicResponse',
  // llm/deepseek.ts
  'DEEPSEEK_CHAT_COMPLETIONS_PATH',
  'DEEPSEEK_DEFAULT_BASE_URL',
  'DEEPSEEK_DEFAULT_MODEL',
  'buildDeepSeekRequest',
  'createDeepSeekProvider',
  'parseDeepSeekResponse',
  // llm/openai-compat.ts
  'buildOpenAiCompatibleRequest',
  'createOpenAiCompatibleProvider',
  'parseOpenAiCompatibleResponse',
  // llm/openai.ts
  'OPENAI_CHAT_COMPLETIONS_PATH',
  'OPENAI_DEFAULT_BASE_URL',
  'OPENAI_DEFAULT_MODEL',
  'buildOpenAiRequest',
  'createOpenAiProvider',
  'parseOpenAiResponse',
  // llm/rulegen.ts
  'buildRulegenPrompt',
  'parseRulegenResponse',
  'parseRulegenResponseChecked',
  'rulegenLayoutFields',
  'validateGeneratedLayout',
  // pack/archive.ts
  'DEFAULT_FILE_MODE',
  'MANIFEST_FILE_NAME',
  'buildPackManifest',
  'createTar',
  'createTarGzip',
  'normalizePackEntries',
  'readTar',
  'renderPackManifest',
  'verifyPackManifest',
  // pack/example.ts
  'EXAMPLE_PACK_PREFIX',
  'EXAMPLE_PACK_STEPS',
  'buildExamplePack',
  'exampleTargetCommands',
  'renderExampleReadme',
  'renderExampleRunScript',
  // report/html.ts
  'escapeHtml',
  'renderCoverage',
  'renderEntityGraph',
  'renderGates',
  'renderPage',
  'renderScore',
  // transform/engine.ts
  'checkNoSilentLoss',
  'transformBatch',
  'transformTraceBatch',
  // transform/strategies.ts
  'applyExpr',
  'applyLookup',
  'applyMap',
  'applyRegex',
  'applyRule',
  'applyTemplate',
  'applyTime',
  'applyUnit',
  'evalExpr',
  // util/csv.ts
  'csvCell',
  'csvColumn',
  'parseCsvObjects',
  'parseCsvRows',
  'renderCsv',
  // util/hash.ts
  'sha256Bytes',
  // util/json.ts
  'isRecord',
  'readString',
  'readStringArray',
  'renderJson',
  'safeJson',
  // util/time.ts
  'ISO_UTC_PATTERN',
  'TIME_LAYOUTS',
  'TimeParseError',
  'epochMsToIsoUtc',
  'isWithinWindow',
  'isoUtcToEpochMs',
  'isoUtcToOffsetIso',
  'parseTimestamp',
  // util/unit.ts
  'UnitError',
  'convertUnit',
  'dimensionOf',
  'getUnitDef',
  'isConvertible',
  'knownUnits',
];

/**
 * Modules whose entire export surface is deliberately outside `TESTED`.
 *
 * `ir/types.ts` publishes the IR contract as type aliases and interfaces, which
 * erase at runtime; `ir/schema.ts` is the runtime half of that same contract and
 * is enumerated in full. Requiring the type aliases to be "named by a consumer"
 * would assert only that some file mentions the word.
 */
const DELIBERATELY_UNENUMERATED: Record<string, string> = {
  'ir/types.ts': 'the runtime vocabularies are enumerated; the type aliases erase at runtime',
};

/**
 * Whether a `module::name` exemption applies, including the module-wide `*` form.
 *
 * The `*` form exists only for the two modules that declare no runtime values at
 * all, and it is checked below: a `*` entry whose module declares a single
 * function or const is red. Without that check the wildcard would be a
 * module-wide exemption by the back door -- the exact shape this file exists to
 * remove.
 */
function isExempt(module: string, name: string): boolean {
  return EXEMPT_EXPORTS[`${module}::${name}`] !== undefined ||
    EXEMPT_EXPORTS[`${module}::*`] !== undefined;
}

describe('the enumerated list is a real list', () => {
  it('names at least one symbol per enumerated module', () => {
    // Guards against the degenerate fix: emptying TESTED would make every
    // assertion below vacuously true, which is how an enumeration gate is
    // hollowed out while still reporting a pass. A module whose whole surface is
    // exempt is the one legitimate way to declare nothing, and `EXEMPT_EXPORTS`
    // is where that is argued.
    const declaring = new Map<string, string[]>();
    for (const module of ENUMERATED_MODULES) {
      const text = readFileSync(join(SRC, module), 'utf8');
      const names = [...namedExports(text), ...bracedExports(text)];
      declaring.set(module, names);
      if (EXEMPT_EXPORTS[`${module}::*`] !== undefined) continue;
      expect(names.length, `${module} declares no exports at all`).toBeGreaterThan(0);
    }
    const declared = [...declaring.values()].flat();
    // A floor, and deliberately a loose one. It used to be `toBe(26)`, an exact
    // count, and that turned out to be the *only* thing in this file that noticed
    // a deletion -- which meant the count was load-bearing for a property it does
    // not describe. It measured how long `TESTED` was, not whether `TESTED` was
    // right, and it stayed perfectly happy while seven of its entries named exports
    // that do not exist. The two assertions below check the property directly, so
    // this one is free to be a floor against the degenerate case of an empty list.
    expect(declared.filter((n) => TESTED.includes(n)).length).toBeGreaterThan(50);
  });

  it('lists only names that exist as exports of an enumerated module', () => {
    // The assertion whose absence let seven invented names through. Injecting
    // `totallyMadeUpNameThatCannotExist` in place of a real entry used to leave
    // the suite at 64 passed, because nothing compared this list against the
    // source it claims to describe.
    const realExports = new Set(
      ENUMERATED_MODULES.flatMap((module) => {
        const text = readFileSync(join(SRC, module), 'utf8');
        return [...namedExports(text), ...bracedExports(text)];
      }),
    );
    const invented = TESTED.filter((name) => !realExports.has(name));
    expect(
      invented,
      `TESTED names ${invented.join(', ')}, which no enumerated module exports. ` +
        `A name here is a claim that the export exists; check the module.`,
    ).toEqual([]);
  });

  it('lists every real export, so a name cannot be dropped silently', () => {
    // The other direction, and the one the count was standing in for. Deleting a
    // real name from TESTED now fails and says which name, rather than failing on
    // an arithmetic mismatch that a reader has to reverse-engineer.
    //
    // Note what this does NOT exempt: a module-level exemption, which is what the
    // previous version used. `EXEMPT_EXPORTS` is keyed by symbol, so a symbol the
    // exemption does not name is red even when a sibling symbol in the same module
    // is excused. The failure message says `module::name`, which is the key the
    // contributor has to supply.
    const realExports = ENUMERATED_MODULES.flatMap((module) => {
      const text = readFileSync(join(SRC, module), 'utf8');
      return [...namedExports(text), ...bracedExports(text)].map((name) => ({ module, name }));
    });
    const unlisted = realExports.filter(
      ({ module, name }) => !TESTED.includes(name) && !isExempt(module, name),
    );
    expect(
      unlisted.map(({ module, name }) => `${module}::${name}`),
      `these exports exist but are not in TESTED. Add each one, or add ` +
        `'module::name' to EXEMPT_EXPORTS with a reason.`,
    ).toEqual([]);
  });

  it('names a real export it can compare against, so the check is not vacuous', () => {
    // Positive control for the two assertions above: if `namedExports` stopped
    // matching due to a formatting change, `realExports` would be empty and both
    // directions would pass while checking nothing.
    const realExports = ENUMERATED_MODULES.flatMap((module) =>
      namedExports(readFileSync(join(SRC, module), 'utf8')),
    );
    expect(realExports.length).toBeGreaterThan(50);
    expect(realExports).toContain('verifyFaultValidity');
  });

  it.each(ENUMERATED_MODULES)('%s still exists', (module) => {
    // A deleted module makes every assertion about it vacuous. The explicit list
    // is what turns "we no longer test it" into a failure.
    expect(() => readFileSync(join(SRC, module), 'utf8')).not.toThrow();
  });

  it('enumerates every module in src/, with no exception left to make', () => {
    // This is the assertion that the injection found. `ENUMERATED_MODULES` is
    // authored by hand, so without a cross-check a new module is silently outside
    // the gate -- it can export anything with no consumer and stay green forever.
    //
    // There is no longer an `UNENUMERATED` escape here, and the difference is
    // deliberate: a module added tomorrow is red until someone puts it in the
    // list. Exempting a module from *scanning* is no longer expressible, because
    // the probe showed every one of them had consumers, so the exemptions were
    // buying nothing except a smaller number in this file's own evidence.
    const enumerated = new Set(ENUMERATED_MODULES);
    const missing = allSourceModules().filter((module) => !enumerated.has(module));
    expect(
      missing,
      `these modules are not enumerated: ${missing.join(', ')}. ` +
        `Add each to ENUMERATED_MODULES. If one of its exports has no consumer, ` +
        `exempt that export in EXEMPT_EXPORTS -- not the module.`,
    ).toEqual([]);
  });

  it('has no stale entry in ENUMERATED_MODULES', () => {
    // The mirror image: a typo'd or deleted path would leave a permanent
    // exemption that reads like coverage. Both directions are needed, since
    // either one alone admits a list that has drifted from the tree.
    const present = new Set(allSourceModules());
    expect(ENUMERATED_MODULES.filter((m) => !present.has(m))).toEqual([]);
  });
});

describe('every enumerated export is named outside the tests', () => {
  /**
   * Read the exports at run time, not at collection time.
   *
   * This began as a `const cases = …` above `it.each`, which materialises the
   * list once. That made a newly added export invisible to the very test meant to
   * catch it: injecting `injectedDeadSymbol` into `export/guard.ts` left the
   * suite at `Tests 184 passed`. The module list had already been fixed to be
   * closed under additions; the *symbol* list had the same hole, one level down.
   *
   * Every reader of this file enumerates, so every reader of this file can grow a
   * blind spot where the enumeration is computed too early. Resolving the pairs
   * inside the assertion body is what makes the test read the current tree.
   */
  function exportPairs(): Array<readonly [string, string]> {
    return ENUMERATED_MODULES.flatMap((module) => {
      const text = readFileSync(join(SRC, module), 'utf8');
      const names = [...new Set([...namedExports(text), ...bracedExports(text)])];
      return names.map((name) => [module, name] as const);
    });
  }

  it('found exports to check', () => {
    // If the regexes silently stop matching -- a formatting change, a switch to
    // `export default` -- every case below stops existing and the suite stays
    // green. This is the one assertion that notices.
    expect(exportPairs().length).toBeGreaterThanOrEqual(40);
  });

  it('every enumeration here is read at run time, not frozen at collection time', () => {
    // The structural check for the defect described in `exportPairs`. If the
    // pairs were a module-level constant, appending an export to a scanned file
    // would not change the count; here it must.
    const before = exportPairs().length;
    const probe = `\nexport const runTimeProbe${Date.now()} = 1;\n`;
    const target = join(SRC, 'export', 'guard.ts');
    const original = readFileSync(target, 'utf8');
    try {
      writeFileSync(target, original + probe);
      expect(exportPairs().length).toBe(before + 1);
    } finally {
      writeFileSync(target, original);
    }
    expect(exportPairs().length).toBe(before);
  });

  it.each(ENUMERATED_MODULES)('%s names every export it declares from outside test/', (module) => {
    // One case per module, and it re-reads the file when it runs. A symbol added
    // tomorrow is checked tomorrow without anyone editing this list -- which is
    // the whole point, since editing this list is the failure mode.
    //
    // This is no longer limited to nine modules. It runs against all 43, which is
    // what promoting the exempted directories buys: the same question, asked of
    // five times as much surface, with no reason to ask it selectively. A module
    // that genuinely cannot satisfy it has to name the symbol in `EXEMPT_EXPORTS`
    // and argue for it -- and the whole-module form of that argument is checked
    // separately below.
    const text = readFileSync(join(SRC, module), 'utf8');
    const names = [...new Set([...namedExports(text), ...bracedExports(text)])];
    const sources = nonTestSources();
    const unnamed = names.filter((name) => {
      const naming = sources.filter(({ file, text: body }) => {
        if (file.endsWith(module)) return false;
        return new RegExp(`\\b${name}\\b`).test(body);
      });
      if (naming.length > 0) return false;
      // Only a per-symbol exemption excuses a symbol here. A `*` entry covers the
      // module, and the module-wide entries are separately restricted below.
      return EXEMPT_EXPORTS[`${module}::${name}`] === undefined;
    });
    expect(
      unnamed,
      `${module} exports ${unnamed.join(', ')}, which no file outside test/ names. ` +
        `Either give each a consumer, delete it, or add '${module}::<name>' to ` +
        `EXEMPT_EXPORTS with a reason.`,
    ).toEqual([]);
  });
});

describe('an exemption is narrower than the argument for it', () => {
  it('carries a reason for every entry', () => {
    for (const [key, reason] of Object.entries(EXEMPT_EXPORTS)) {
      expect(reason.length, `${key} is exempted without a reason`).toBeGreaterThan(30);
      expect(key, `${key} is not a module::symbol key`).toMatch(/^[\w/.+-]+::(\*|[\w$]+)$/);
    }
  });

  it('names a module that is in the enumerated list', () => {
    for (const key of Object.keys(EXEMPT_EXPORTS)) {
      expect(ENUMERATED_MODULES).toContain(key.split('::')[0]);
    }
  });

  it('names an export that exists, or is the deliberate wildcard', () => {
    // A stale exemption is worse than no exemption: it reads as an argued
    // position while covering nothing, and the symbol it was written about may
    // have been renamed away some time ago. The one wildcard form is allowed
    // here and constrained by the next test.
    //
    // **This assertion was wrong on its first run and the gate caught it.**
    // Checking `names` -- the runtime declarations -- against a type-only
    // exemption made `ir/types.ts::SignalKind` red for an export that *does*
    // exist, just not as a value. Two exemptions are admissible in this file and
    // they are checked against different declarations, so the check has to know
    // which kind it is looking at. A symbol that is neither is still red.
    for (const key of Object.keys(EXEMPT_EXPORTS)) {
      const [module, symbol] = key.split('::');
      if (symbol === '*') continue;
      const text = readFileSync(join(SRC, module), 'utf8');
      const declarations = new Set([
        ...namedExports(text),
        ...bracedExports(text),
        ...typeExports(text),
      ]);
      expect(
        declarations,
        `${key} exempts an export ${module} does not declare, at runtime or as a type`,
      ).toContain(symbol);
    }
  });

  it('grants the module-wide wildcard only to a module with no runtime export', () => {
    // The check that keeps `*` from becoming the module-wide exemption again. A
    // wildcard is admissible for a module of pure types, where "no file names it"
    // is not evidence of anything. If such a module ever gains a real export, this
    // goes red and forces the exemption back down to individual symbols.
    //
    // **This check was blind on its first version, and the injection matrix is what
    // found it.** It read `namedExports(text)` -- `export function`/`const`/`class`
    // only -- and `index.ts` is 41 `export { … } from` statements with zero named
    // declarations, so the array was empty and the assertion passed no matter what
    // was declared. Row 3 of the matrix (grant `index.ts` a wildcard) stayed green
    // when it should have been red. That is finding 47 for the fourth time in this
    // file: an expectation that cannot see the thing it is supposed to measure.
    //
    // The repair is to ask the runtime question rather than the syntactic one. A
    // re-export is a runtime export, so the check now compares the module's whole
    // *declared surface* -- named declarations, inline `export { a, b }`, and
    // `export { x } from './y.js'` -- against its type-only declarations. A module
    // qualifies for `*` only when every symbol it publishes erases.
    for (const key of Object.keys(EXEMPT_EXPORTS)) {
      const [module, symbol] = key.split('::');
      if (symbol !== '*') continue;
      const text = readFileSync(join(SRC, module), 'utf8');
      const runtime = new Set([...namedExports(text), ...bracedExports(text)]);
      const types = new Set(typeExports(text));
      const survived = [...runtime].filter((n) => !types.has(n));
      expect(
        survived,
        `${module} publishes ${survived.join(', ')} at runtime, so a module-wide ` +
          `exemption is too broad. Exempt those symbols individually, or give them ` +
          `a consumer.`,
      ).toEqual([]);
    }
  });

  it('exempts only modules that exist', () => {
    const present = new Set(allSourceModules());
    expect(Object.keys(EXEMPT_EXPORTS).filter((k) => !present.has(k.split('::')[0]))).toEqual([]);
  });
});

describe('a module with no importer would be dead code the table certified', () => {
  it.each(allSourceModules().filter((m) => m !== 'index.ts' && m !== 'coverage.ts'))(
    '%s is imported by at least one other module',
    (module) => {
      // Every exemption in the previous version of this file said "reached through
      // X". This checks the part that is still checkable after the exemptions are
      // gone: a module that nothing imports at all is dead, regardless of whether
      // its exports happen to be named. That is a different failure from the one
      // `namedExports` finds, and the two do not imply each other -- a dead module
      // can have its symbols mentioned in a comment, and a live module can export
      // an unused helper.
      //
      // `index.ts` is excluded because it is the package entry point: nothing
      // inside `src/` imports it, and `package.json` names it instead.
      // `coverage.ts` is excluded because it is the tsup entry point for the
      // coverage subpath export, and the same argument applies.
      //
      // The match is by bare specifier rather than by resolved path. My first
      // version compared `'./llm/openai-compat.js'` against the importer's text
      // and went red on a module that is imported twice -- because `file` is
      // package-relative (`src/llm/deepseek.ts`), so the specifier a sibling
      // actually writes is `'./openai-compat.js'`. Resolving paths would need a
      // second implementation of Node's resolution rules to be correct, and a
      // wrong one would fail open. A bare specifier cannot be wrong about the
      // thing being asked, which is whether the name appears in an import.
      const base = module.replace(/\.ts$/, '').split('/').pop() as string;
      const importers = nonTestSources().filter(({ file, text }) => {
        if (file.endsWith(module)) return false;
        return new RegExp(`from\\s+['"][^'"]*\\b${base}\\.js['"]`).test(text);
      });
      expect(
        importers.length,
        `${module} is enumerated but nothing imports it. Either it is dead code, ` +
          `or the comparison is wrong about the specifier a sibling writes.`,
      ).toBeGreaterThan(0);
    },
  );
});

describe('the gate can actually fail', () => {
  it('reports an export that nothing names', () => {
    // Positive control: the detector, pointed at a name that is deliberately
    // absent from the tree, must say so. Without this, a scan that matched
    // everything would look identical to a scan that found nothing wrong.
    const ghost = 'assembleIrBundleButTypoed';
    const naming = nonTestSources().filter(({ text }) =>
      new RegExp(`\\b${ghost}\\b`).test(text),
    );
    expect(naming).toHaveLength(0);
  });

  it('finds a name that is present, so an empty result is not the detector failing', () => {
    // Negative control, paired with the one above: the same mechanism, pointed
    // at a name known to be there, must find it. Together the two say the
    // detector discriminates rather than always answering the same way.
    const naming = nonTestSources().filter(({ text }) =>
      new RegExp(`\\bIR_VERSION\\b`).test(text),
    );
    expect(naming.length).toBeGreaterThan(0);
  });
});
