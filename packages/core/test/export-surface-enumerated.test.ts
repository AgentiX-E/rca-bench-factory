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
 * The hand-written list. Read it as a claim about the product, not about the
 * tests: every name here is one a non-test module is expected to reference.
 */
const TESTED = [
  // ir/assembler.ts
  'assembleIrBundle',
  'AssembleOptions',
  // ir/guards.ts
  'assertEntityReferencesResolve',
  'isInferred',
  // ir/schema.ts
  'entitySchema',
  'entityGraphSchema',
  'faultCaseSchema',
  'irBundleSchema',
  'telemetrySignalSchema',
  // ir/types.ts -- the runtime half; the type half is DELIBERATELY_UNNAMED.
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
  'scoreTargetInvocation',
  // score/official.ts
  'scoreOfficialSubmission',
  // score/score.ts
  'sha256',
  'SCORE_TARGET_IDS',
  // score/targets.ts
  'SCORE_TARGETS',
  // export/guard.ts
  'guardExport',
  // export/*.ts -- one entry point each, named in score/dispatch.ts.
  'exportOpenRca',
  'exportOpenRca2',
  'exportRcaEval',
  'exportRca100',
  'exportAioPs2025',
  'exportCloudOpsBench',
  'exportItBench',
  // gates/gates.ts
  'runQualityGates',
];

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
    // The measured number, not a chosen one. I first wrote 30 here without
    // checking, the suite went red at 26, and the correction is to say what was
    // measured. A threshold set by feel in a file whose entire purpose is to
    // replace feel with enumeration would be a poor advertisement for itself.
    expect(declared.filter((n) => TESTED.includes(n)).length).toBe(26);
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
