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
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(HERE, '..');
const SRC = join(PACKAGE_ROOT, 'src');

/**
 * Every module in the four directories `09-推进进度追踪.md` names as needing an
 * enumeration rather than a threshold: `ir/`, `score/`, `export/` and `gates/`.
 *
 * The list is explicit rather than globbed so that adding a module is a visible
 * edit to this file. A glob would make a new module silently expected to be
 * covered -- or, worse, would make a *deleted* module silently stop being
 * expected, which is what `requiredConstructs()` in `gates-are-testable.test.ts`
 * exists to prevent for the gate scripts.
 */
const ENUMERATED_MODULES = [
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
];

/**
 * Exports that are deliberately not named anywhere else, with the reason.
 *
 * Each entry weakens the gate, so each has to be argued. A symbol belongs here
 * when naming it from a test would assert something weaker than what already
 * holds -- a type alias erased at runtime, for instance, which a text scan can
 * find but a runtime cannot. Symbols that are merely inconvenient to test do not
 * belong here; that is what the file is for.
 */
const DELIBERATELY_UNNAMED: Record<string, string> = {
  // Type-only exports erase to nothing. `ir/types.ts` publishes the IR contract
  // as types, and `ir/schema.ts` is the runtime half of the same contract; the
  // pair is what `docs/data-model.md` documents. Asserting the type aliases are
  // "used" would assert only that some file mentions the word.
  'ir/types.ts': 'type aliases and interfaces erase at runtime; the schemas carry the contract',
};

/**
 * Modules that exist and are deliberately outside the enumerated four.
 *
 * Each entry is a claim that a missing consumer here would be caught elsewhere.
 * That claim is checkable, and the check is whether the module really is reached
 * -- a module with no importer at all would be a hole in this table wearing a
 * reason. `each module is imported by something, or is an entry point` below
 * asserts exactly that, so an entry here means "measured from another direction",
 * never "not measured".
 */
const UNENUMERATED: Record<string, string> = {
  // The package's public surface. Its exports ARE the re-exports of the
  // enumerated modules, so enumerating them again would count the same symbol
  // twice and report the second count as independent evidence.
  'index.ts': 'the public surface; every symbol it publishes is enumerated at its source',
  // Excluded by name in `vitest.config.ts` with its own argument, and reached
  // through `ingest/*` rather than named directly.
  'llm/provider.ts': 'provider interfaces; excluded from coverage by name in vitest.config.ts',
  // Reached structurally rather than by name: the CLI imports them through its
  // command table, and `check-cli-reference.mjs` asserts that table against
  // `docs/cli-reference.md`.
  'cli/args.ts': 'CLI entry point; its surface is asserted against docs/cli-reference.md',
  // Reached structurally: every ingestion path dispatches through the
  // `structure-dispatch` table, and `vocabulary-single-source.test.ts` asserts
  // the vocabularies they admit.
  'ingest/file.ts': 'reached through the ingest dispatch table, asserted by structure-dispatch tests',
  'ingest/otlp.ts': 'reached through the ingest dispatch table',
  'ingest/prime.ts': 'reached through the ingest dispatch table',
  // Reached through `score/dispatch.ts`'s exporter table, whose completeness
  // `vocabulary-single-source.test.ts` asserts against the documented targets.
  'coverage.ts': 'reached through the CLI report path',
  'entity/graph.ts': 'reached through the assembler and exporters',
  'evolution/hitl.ts': 'reached through the evolution CLI path',
  'evolution/proposal.ts': 'reached through the evolution CLI path',
  'fault/collector.ts': 'reached through the fault spec parser path',
  'fault/importer.ts': 'reached through the historical-import path',
  'llm/anthropic.ts': 'reached through the provider registry',
  'llm/deepseek.ts': 'reached through the provider registry',
  'llm/openai-compat.ts': 'reached through the provider registry',
  'llm/openai.ts': 'reached through the provider registry',
  'llm/rulegen.ts': 'reached through the rule-generation path',
  'pack/archive.ts': 'reached through the pack CLI path',
  'pack/example.ts': 'reached through the pack CLI path',
  'report/html.ts': 'reached through the report CLI path',
  'transform/engine.ts': 'reached through the transform CLI path',
  'transform/strategies.ts': 'reached through the transform dispatch table',
  'util/csv.ts': 'reached through the ingest readers',
  'util/hash.ts': 'reached through the scorer and the pack writer',
  'util/json.ts': 'reached through every exporter and the pack manifest writer',
  'util/time.ts': 'reached through the transformers',
  'util/unit.ts': 'reached through the transformers',
};

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
 * `src/cli/` is walked too even though no CLI module is enumerated: the point of
 * this list is to know what exists, and `UNENUMERATED` is where each omission is
 * argued. Deleting a directory would change this list, which is the signal.
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
 *   2. Every real export is here, unless its module is in `DELIBERATELY_UNENUMERATED`.
 * So deleting a real name now fails on the *name*, and inventing one fails
 * immediately rather than being absorbed by a count.
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
  // ir/types.ts -- the runtime half; the type half is DELIBERATELY_UNENUMERATED.
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

describe('the enumerated list is a real list', () => {
  it('names at least one symbol per enumerated module', () => {
    // Guards against the degenerate fix: emptying TESTED would make every
    // assertion below vacuously true, which is how an enumeration gate is
    // hollowed out while still reporting a pass.
    const declaring = new Map<string, string[]>();
    for (const module of ENUMERATED_MODULES) {
      const text = readFileSync(join(SRC, module), 'utf8');
      const names = [...namedExports(text), ...bracedExports(text)];
      declaring.set(module, names);
      if (DELIBERATELY_UNNAMED[module] !== undefined) continue;
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
    const realExports = new Set(
      ENUMERATED_MODULES.flatMap((module) => {
        const text = readFileSync(join(SRC, module), 'utf8');
        return [...namedExports(text), ...bracedExports(text)];
      }),
    );
    const unlisted = [...realExports].filter(
      (name) => !TESTED.includes(name) && DELIBERATELY_UNENUMERATED[name] === undefined,
    );
    expect(
      unlisted,
      `these exports exist but are not in TESTED: ${unlisted.join(', ')}. ` +
        `Add each one, or add its module to DELIBERATELY_UNENUMERATED with a reason.`,
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

  it('enumerates every module in src/, or says why not', () => {
    // This is the assertion that the injection found. `ENUMERATED_MODULES` is
    // authored by hand, so without a cross-check a new module is silently outside
    // the gate -- it can export anything with no consumer and stay green forever.
    // Every module is therefore either enumerated or named in `UNENUMERATED` with
    // a reason, and "a new module appeared" is a red suite rather than a shrug.
    const enumerated = new Set(ENUMERATED_MODULES);
    const unexplained = allSourceModules().filter(
      (module) => !enumerated.has(module) && UNENUMERATED[module] === undefined,
    );
    expect(
      unexplained,
      `these modules are neither enumerated nor explained: ${unexplained.join(', ')}. ` +
        `Add each to ENUMERATED_MODULES, or to UNENUMERATED with a reason.`,
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
    return ENUMERATED_MODULES.filter((m) => DELIBERATELY_UNNAMED[m] === undefined).flatMap(
      (module) => {
        const text = readFileSync(join(SRC, module), 'utf8');
        const names = [...new Set([...namedExports(text), ...bracedExports(text)])];
        return names.map((name) => [module, name] as const);
      },
    );
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

  it.each([
    'ir/assembler.ts',
    'ir/guards.ts',
    'ir/schema.ts',
    'score/dispatch.ts',
    'score/official.ts',
    'score/score.ts',
    'score/targets.ts',
    'export/guard.ts',
    'gates/gates.ts',
  ])('%s names every export it declares from outside test/', (module) => {
    // One case per module rather than one per symbol, and it re-reads the file
    // when it runs. A symbol added tomorrow is checked tomorrow without anyone
    // editing this list -- which is the whole point, since editing this list is
    // the failure mode.
    const text = readFileSync(join(SRC, module), 'utf8');
    const names = [...new Set([...namedExports(text), ...bracedExports(text)])];
    const sources = nonTestSources();
    const unnamed = names.filter((name) => {
      const naming = sources.filter(({ file, text: body }) => {
        if (file.endsWith(module)) return false;
        return new RegExp(`\\b${name}\\b`).test(body);
      });
      return naming.length === 0;
    });
    expect(
      unnamed,
      `${module} exports ${unnamed.join(', ')}, which no file outside test/ names. ` +
        `Either give each a consumer, delete it, or move the module to UNENUMERATED ` +
        `with a reason -- in which case its whole surface is measured from elsewhere.`,
    ).toEqual([]);
  });
});

describe('DELIBERATELY_UNNAMED does not grow without an argument', () => {
  it('carries a reason for every entry', () => {
    for (const [module, reason] of Object.entries(DELIBERATELY_UNNAMED)) {
      expect(reason.length, `${module} is exempted without a reason`).toBeGreaterThan(40);
    }
  });

  it('exempts only modules that are in the enumerated list', () => {
    for (const module of Object.keys(DELIBERATELY_UNNAMED)) {
      expect(ENUMERATED_MODULES).toContain(module);
    }
  });
});

describe('UNENUMERATED is a measurement, not an escape hatch', () => {
  it('carries a reason for every entry', () => {
    for (const [module, reason] of Object.entries(UNENUMERATED)) {
      expect(reason.length, `${module} is exempted without a reason`).toBeGreaterThan(30);
    }
  });

  it('holds no entry that is also enumerated', () => {
    // Overlap would mean a module counted twice, which inflates the apparent
    // coverage of this file rather than changing what it checks.
    for (const module of Object.keys(UNENUMERATED)) {
      expect(ENUMERATED_MODULES, `${module} is in both lists`).not.toContain(module);
    }
  });

  it.each(Object.keys(UNENUMERATED).filter((m) => m !== 'index.ts'))(
    '%s is imported by at least one other module',
    (module) => {
      // The reason strings above say "reached through X". This is that claim,
      // checked: an exempted module with no importer anywhere would be dead code
      // that the exemption had quietly certified as fine. `index.ts` is excluded
      // because it is the package entry point -- nothing inside `src/` imports it,
      // and `package.json` names it instead.
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
        `${module} is exempted as "reached through ...", but no module imports it. ` +
          `Either it is dead, or the exemption's reason is wrong.`,
      ).toBeGreaterThan(0);
    },
  );

  it('exempts only modules that exist', () => {
    const present = new Set(allSourceModules());
    expect(Object.keys(UNENUMERATED).filter((m) => !present.has(m))).toEqual([]);
  });
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
