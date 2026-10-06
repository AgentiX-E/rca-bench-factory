import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * The scripts this file executes.
 *
 * Rule 7 of `gate-sites-are-proven.test.ts` reconciles this declaration against
 * the scripts the spawn calls below actually reach, and reports a disagreement
 * in either direction: declaring one that is never spawned is as much a
 * violation as spawning one that is not declared. The declaration is needed
 * because several of these files drive a gate through a local `run(script)`
 * helper or a data table, so the script name never appears in a spawn's own
 * argument list and cannot be inferred from one.
 */
const DRIVES = [
  'scripts/check-readme-sample.mjs',
];


/**
 * `scripts/check-readme-sample.mjs` executes the README's usage sample.
 *
 * The gate's own comment gives its reason: the block once called
 * `runAllGates(case, bundle)` when the signature is `runAllGates(bundle,
 * options, meta)`, and nothing caught it. The comment ends with the sentence
 * this file exists to make true -- *"eyeballing a code sample is not a check"*.
 *
 * ## Why a gate that is already green needs its own failures
 *
 * CI runs this gate against the real README on every push, so the happy path is
 * observed constantly. That observation proves the sample runs; it proves
 * nothing about whether the gate would *refuse* a sample that had drifted,
 * because the real README never drifts inside a green run. A guard whose
 * failure branch is never entered is a guard taken on trust, and this
 * repository's own rule (`progress.md`, P1-6) says a gate with no test is
 * neither a threshold nor an enumeration gate.
 *
 * ## How the failure is forced without touching the repository
 *
 * The gate resolves `README.md` and `packages/core/dist/index.js` from its own
 * location, so a copy of the script two levels inside a throwaway tree reads
 * *that* tree's README. `dist/` is symlinked rather than copied: the gate's
 * subject is the README, and a nine-megabyte copy per fixture would buy
 * nothing.
 *
 * The three negatives below are the three ways the README can be wrong, and
 * they are different findings: the sample can be gone, it can carry a
 * specifier the rewrite cannot reach, or it can call the API wrongly. Only the
 * last is the drift the gate was built for.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SCRIPT = 'check-readme-sample.mjs';
const README = resolve(ROOT, 'README.md');

interface Outcome {
  status: number;
  stdout: string;
  stderr: string;
}

const scratch = mkdtempSync(join(tmpdir(), 'rca-bench-readme-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

let counter = 0;

/**
 * A throwaway tree holding the gate, a README, and links to the real build.
 *
 * The copy is two levels down (`<tree>/scripts/…`) because that is the depth
 * the gate's own `resolve(…, '..')` expects. `packages/` and `node_modules/`
 * are **symlinked**, not copied, and both are needed: the gate imports the real
 * built package, and that package imports `zod`. Copying `packages/` alone
 * produced `ERR_MODULE_NOT_FOUND: Cannot find package 'zod'` on the first
 * fixture -- a failure that names neither the README nor the sample and would
 * have been misread as "the gate works" had the assertion been on the exit code
 * alone. The links keep the fixture honest: the sample runs against the shipped
 * build, so a wrong call fails for the real reason.
 */
function treeWith(readme: string): string {
  counter += 1;
  const tree = join(scratch, `tree-${counter}`);
  mkdirSync(join(tree, 'scripts'), { recursive: true });
  copyFileSync(resolve(ROOT, 'scripts', SCRIPT), join(tree, 'scripts', SCRIPT));
  writeFileSync(join(tree, 'README.md'), readme);
  symlinkSync(resolve(ROOT, 'packages'), join(tree, 'packages'), 'dir');
  symlinkSync(resolve(ROOT, 'node_modules'), join(tree, 'node_modules'), 'dir');
  return tree;
}

function run(tree: string): Outcome {
  const result = spawnSync(process.execPath, [join(tree, 'scripts', SCRIPT)], { encoding: 'utf8', cwd: tree });
  if (result.error !== undefined) {
    return { status: -1, stdout: result.stdout ?? '', stderr: result.error.message };
  }
  return { status: result.status ?? -1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

/** A README holding exactly one sample block, as the gate's marker requires. */
function readmeWithSample(body: string): string {
  return ['# Title', '', 'Prose.', '', '```ts', body, '```', ''].join('\n');
}

/**
 * The sample body the gate accepts, held here as *text*.
 *
 * Deliberately not imported from the README: this file's job is to assert that
 * the gate reaches a verdict on a body `it` supplies, and a body read from the
 * subject would make the fixture move whenever the README did -- the
 * self-referential weakness `gates-are-testable.test.ts` records.
 *
 * It is the smallest sample that exercises the three calls the README's own
 * comment names, so a rename in any of those signatures fails here too.
 *
 * The first version of this constant passed `{}` where `options` goes, and the
 * run produced `TypeError: Cannot read properties of undefined (reading
 * 'requiresQuery')` from inside `checkG1Structural`. The third call takes a
 * two-level options object (`{ g1: { … } }`) and an empty literal does not
 * satisfy it. That is the gate working: the failure named `gates.js:57` and
 * the sample's own line, which is the diagnosis the shipped sample lacked when
 * it called `runAllGates(case, bundle)` and nobody noticed.
 */
const GOOD_SAMPLE = [
  "import { assembleBundle, runAllGates } from '@rca-bench-factory/core';",
  '',
  'const assembled = assembleBundle({',
  "  graph: { entities: [], edges: [] },",
  '  case: {',
  "    caseId: 'c1',",
  "    system: 'shop',",
  "    injectTime: '2026-09-06T04:10:00.000Z',",
  "    window: { start: '2026-09-06T04:00:00.000Z', end: '2026-09-06T04:20:00.000Z' },",
  "    fault: { type: 'cpu', injectionMethod: 'manual' },",
  '    groundTruth: {',
  "      rootCauseEntityId: 'service:shop/checkout',",
  "      rootCauseComponent: 'checkout',",
  "      rootCauseReason: 'cpu contention',",
  '    },',
  '  },',
  '  signals: [],',
  '});',
  'if (!assembled.ok) throw new Error(assembled.error);',
  'runAllGates(',
  '  assembled.bundle,',
  '  { g1: { requiresQuery: false, requiredSignals: [] } },',
  "  { gateRunId: 'x', runAt: '2026-09-06T05:00:00.000Z' },",
  ');',
].join('\n');

/** The good call, so the drift below is expressed as an edit to it and not a restatement. */
const GOOD_CALL = [
  'runAllGates(',
  '  assembled.bundle,',
  '  { g1: { requiresQuery: false, requiredSignals: [] } },',
  "  { gateRunId: 'x', runAt: '2026-09-06T05:00:00.000Z' },",
  ');',
].join('\n');

/** The drifted call -- the shape that once shipped and was caught by nobody. */
function driftedSample(): string {
  const drifted = GOOD_SAMPLE.replace(GOOD_CALL, 'runAllGates({}, assembled.bundle);');
  // A fixture that silently failed to apply its own edit would make the test
  // below assert against an unchanged sample -- a green run proving nothing,
  // which is the failure mode this whole file exists to rule out.
  expect(drifted).not.toBe(GOOD_SAMPLE);
  return drifted;
}

describe('scripts/check-readme-sample.mjs · what it asserts about a good sample', () => {
  it('executes a sample block and reports it by number', () => {
    // The precondition for every negative below. A gate that failed everything
    // would satisfy them all and would also block every legitimate README edit.
    const result = run(treeWith(readmeWithSample(GOOD_SAMPLE)));

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('README sample 1: OK');
    // The count is the claim -- "one sample executed" -- not a decoration, so
    // a gate that silently stopped extracting would be visible here.
    expect(result.stdout).toContain('PASSED (1 sample executed)');
  });

  it('picks the sample out by its import rather than by fence position', () => {
    // The marker is the import line, so an unrelated `ts` block above the
    // sample must not change what is checked. This is what makes the gate
    // robust to README edits that are not about the sample.
    const readme = [
      '# Title',
      '',
      'An unrelated block first:',
      '',
      '```ts',
      'const unrelated = 1;',
      '```',
      '',
      '```ts',
      GOOD_SAMPLE,
      '```',
      '',
    ].join('\n');

    const result = run(treeWith(readme));

    expect(result.status).toBe(0);
    // `index + 1` is the block's position *within the extracted list*, not in
    // the file: the unrelated block is never collected, so the sample is still
    // sample 1. Asserting the wording here is what pins that reading.
    expect(result.stdout).toContain('README sample 1: OK');
    expect(result.stdout).toContain('PASSED (1 sample executed)');
  });
});

describe('scripts/check-readme-sample.mjs · the three ways a README can be wrong', () => {
  it('refuses a README with no sample block, and says what to do about it', () => {
    // The first exit. Its diagnostic has to be actionable in both directions:
    // re-add the sample, or delete the guard in the same change. A gate that
    // only said "FAILED" would leave an operator guessing which.
    const result = run(treeWith('# Title\n\nProse with no TypeScript block at all.\n'));

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('no @rca-bench-factory/core sample found');
    expect(result.stderr).toContain('delete this guard in the same change');
  });

  it('does not count a TypeScript block that never imports the package', () => {
    // The near miss the marker exists to reject: a `ts` block whose text
    // happens to mention the package path without importing it. A gate that
    // keyed on the fence or on a substring would accept this, execute nothing,
    // and report `PASSED (1 sample executed)` -- the false green this whole
    // file is built to rule out.
    const readme = readmeWithSample('// see @rca-bench-factory/core for the API');

    const result = run(treeWith(readme));

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('no @rca-bench-factory/core sample found');
  });

  it('fails the sample when the call does not match the real signature', () => {
    // **The drift this gate was built for.** `runAllGates` takes
    // `(bundle, options, meta)`; the sample that shipped once called
    // `runAllGates(case, bundle)`. Nothing caught it.
    //
    // The assertion names the failing call rather than only the exit code,
    // because "the sample broke" and "the gate crashed" are different findings
    // and a bare status cannot tell them apart.
    const drifted = driftedSample();

    const result = run(treeWith(readmeWithSample(drifted)));

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('README sample 1: FAILED');
    expect(result.stderr).toContain('FAILED (1 of 1)');
    // A real stack trace, not a module-resolution failure: the rewrite worked
    // and the sample reached the library.
    expect(result.stderr).not.toContain('Cannot find module');
  });

  it('reports a partial pass as partial, so one broken sample is not read as all-broken', () => {
    // Two samples, one correct. The summary line has to carry both numbers:
    // the count of failures alone would not say how much of the README ran.
    const readme = ['# Title', '', '```ts', GOOD_SAMPLE, '```', '', '```ts', driftedSample(), '```', ''].join('\n');

    const result = run(treeWith(readme));

    expect(result.status).toBe(1);
    expect(result.stdout).toContain('README sample 1: OK');
    expect(result.stderr).toContain('README sample 2: FAILED');
    expect(result.stderr).toContain('FAILED (1 of 2)');
  });

  it('carries a second exit that no input can reach, and this test says so', () => {
    // **A dead branch, found by trying to exercise it.**
    //
    // `check-readme-sample.mjs` has two exits. The second one fires when
    // `body.replace(/from '@rca-bench-factory\/core'/, …)` leaves the body
    // unchanged, and its comment explains that this "is asserted so a change to
    // the import specifier surfaces here instead of producing a confusing
    // module-resolution error".
    //
    // The block reaches the loop only if `body.includes("from
    // '@rca-bench-factory/core'")` was true. That predicate and the rewrite's
    // regex are **the same literal string**: `includes` is true exactly when the
    // literal occurs, and `replace` changes the text exactly when the regex
    // matches, which is exactly when the literal occurs. They cannot disagree on
    // any input, so the branch is unreachable and the diagnostic it guards can
    // never be printed.
    //
    // This was found by attempting to write the test that was supposed to cover
    // it. Three bodies were tried, and each failed for a reason worth recording:
    //
    //  - a double-quoted import matches **neither** predicate, so the gate exits
    //    one guard earlier -- asserted in the test above;
    //  - a line break inside the specifier matches **both** -- the marker is a
    //    substring test over the joined text and the regex does not care where
    //    the literal sits;
    //  - an escaped quote inside a string literal matches **neither**.
    //
    // The conclusion is not "the guard is wrong" -- it fails safe, and the
    // first exit already covers the case the comment worries about. The
    // conclusion is that the comment describes a reachable state and there is
    // none, so a reader would take a guarantee from it that the code does not
    // provide. The assertions below pin the equivalence, so the branch is
    // recorded as dead rather than left looking merely untested.
    const MARKER = "from '@rca-bench-factory/core'";
    const REWRITE = /from '@rca-bench-factory\/core'/;

    // The two predicates, over the inputs that could plausibly separate them.
    const probes = [
      MARKER,
      `x ${MARKER} y`,
      'from "@rca-bench-factory/core"',
      "from '@rca-bench-factory/core2'",
      "import { a }\n  from '@rca-bench-factory/core';",
      "import { a } from '@rca-bench-factory/core';",
      '',
    ];
    for (const probe of probes) {
      const collected = probe.includes(MARKER);
      const rewritten = probe.replace(REWRITE, 'X') !== probe;
      // No input distinguishes "collected" from "rewritable", which is precisely
      // why `rewritten === body` cannot hold after `blocks.push(body)`.
      expect(rewritten, `collected=${collected} for ${JSON.stringify(probe)}`).toBe(collected);
    }

    // And the source states both as the same literal, so the equivalence is
    // structural rather than a property of the probes above.
    //
    // **This half is weaker than it looks, and the battery found that.** An
    // injection that replaced the guard's body with `if (false)` -- deleting the
    // behaviour while leaving the text -- left this file green, so the `toContain`
    // checks below do *not* guard the branch. They guard something narrower and
    // worth stating exactly: that the collection predicate and the rewrite
    // pattern are still **the same literal**. If one were widened to a regex or
    // the other narrowed to a different spelling, the equivalence asserted above
    // would stop being structural and a reader would have no way to know.
    //
    // What guards the *behaviour* is the probe loop, and only over the inputs it
    // lists. No input can separate the two predicates, so no input can drive the
    // branch: there is nothing stronger to assert, and saying so is the finding
    // rather than a gap.
    const source = readFileSync(resolve(ROOT, 'scripts', SCRIPT), 'utf8');
    expect(source).toContain(`body.includes("${MARKER}")`);
    expect(source).toContain('/from \'@rca-bench-factory\\/core\'/');
    // The two must remain *the same string*, so neither can drift to a form the
    // other would not match. The pattern's source is the marker with the
    // metacharacter escaped and no other difference.
    const patternSource = "/from '@rca-bench-factory\\/core'/"
      .slice(1, -1)
      .replace(/\\\//g, '/');
    expect(patternSource).toBe(MARKER);
  });
});

describe('scripts/check-readme-sample.mjs · the repository it is shipped against', () => {
  it('passes on the committed README, so the negatives above are not the only state it can reach', () => {
    // The other half of the contrast. Every assertion above is `status === 1`;
    // without this one the file would be consistent with a gate that always
    // fails, which is exactly the shape `gates-are-testable.test.ts` warns
    // about when it says a gate that fails everything is not a gate.
    const result = spawnSync(process.execPath, [resolve(ROOT, 'scripts', SCRIPT)], {
      encoding: 'utf8',
      cwd: ROOT,
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/PASSED \(\d+ sample executed\)/);
  });

  it('reads the README it is pointed at, not a path baked into the script', () => {
    // Guards against the fixture's own blind spot: if the gate ever hard-coded
    // an absolute path, every `treeWith` case above would pass by testing the
    // real README twice, and the negatives would be measuring nothing.
    const readme = readFileSync(README, 'utf8');
    expect(readme).toContain("from '@rca-bench-factory/core'");
    // Same text, same tree: the script's constant is what makes the copy work.
    expect(readFileSync(resolve(ROOT, 'scripts', SCRIPT), 'utf8')).toContain(
      "const README = resolve(ROOT, 'README.md');",
    );
  });
});
