import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
  'scripts/measure-doc-counts.mjs',
  'scripts/probe-agreement-baseline.mjs',
  'scripts/probe-category-derivation.mjs',
  'scripts/probe-denial-inventory.mjs',
];


/**
 * Four `process.exit(1)` sites that the roadmap's gate inventory listed as
 * unproved, and which are proved here.
 *
 * `golden-master/gate-sites.json` enumerates every failure exit in `scripts/`.
 * Cross-referencing that list against the suite found four sites no test could
 * reach: the "built module is missing" guards in three probes
 * (`probe-category-derivation.mjs`, `probe-agreement-baseline.mjs`,
 * `probe-denial-inventory.mjs`) and the `fail()` helper in
 * `measure-doc-counts.mjs`. All four were correct. None was guarded, which is
 * the exact defect class this campaign keeps finding -- a claim that is
 * published and that nothing reads: the inventory said these sites existed and
 * nothing checked that they worked.
 *
 * ## Why they were hard to reach, and why that is not an excuse
 *
 * Each of the three probes refuses to run when `packages/core/dist/...` is
 * absent, because a probe that reads the built module rather than the source
 * would otherwise fail with a confusing import error. The guard is right. It was
 * untested because the repository *always has* a `dist/` once anything has been
 * built, so the branch never fired in any run -- a 100%-covered file by
 * accident, not by construction. Same story as the `functions` threshold in
 * `vitest.config.ts`.
 *
 * They are reachable because each script derives its repository root from its own
 * location (`const REPO = resolve(HERE, '..')`). Copying the script into a
 * throwaway tree that has a `scripts/` directory and no `packages/` is therefore
 * enough to make the guard fire -- no environment variables, no monkeypatching,
 * no edits to the shipped file.
 *
 * ## What each test asserts
 *
 * The exit code alone would be worthless here: a mistyped path would also exit
 * non-zero. So each assertion pins the *diagnostic* -- which file the probe says
 * is missing, and the remedy it prints -- and then the two anti-crash guards used
 * across this suite. The error text naming the exact `dist/` artifact is what
 * distinguishes "the guard fired" from "the probe crashed somewhere else".
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

interface Outcome {
  status: number;
  stdout: string;
  stderr: string;
}

const scratch = mkdtempSync(join(tmpdir(), 'rca-bench-probe-guards-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

let counter = 0;

/**
 * A throwaway tree holding a verbatim copy of one script and nothing else.
 *
 * The script's own source is copied rather than reimplemented, so the test
 * exercises the shipped guard and not a paraphrase of it. `node_modules` is
 * absent on purpose: these four guards run before any import of a built module
 * is attempted, so a probe that started importing a dependency at module scope
 * would fail loudly here rather than silently in production.
 */
function treeWith(script: string, present: readonly string[] = []): string {
  counter += 1;
  const dir = join(scratch, `tree-${counter}`);
  mkdirSync(join(dir, 'scripts'), { recursive: true });
  copyFileSync(resolve(ROOT, 'scripts', script), join(dir, 'scripts', script));
  for (const rel of present) {
    const full = join(dir, rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, 'export {};\n');
  }
  return dir;
}

function run(script: string, cwd: string, args: string[] = [], env: Record<string, string> = {}): Outcome {
  const result = spawnSync(process.execPath, [resolve(cwd, 'scripts', script), ...args], {
    encoding: 'utf8',
    cwd,
    env: { ...process.env, ...env },
  });
  if (result.error !== undefined) {
    return { status: -1, stdout: result.stdout ?? '', stderr: result.error.message };
  }
  return { status: result.status ?? -1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

/**
 * The explanation line each guard prints, read out of the guard itself.
 *
 * The first version of this file asserted one fixed sentence for all four
 * sites, and the `miss-detail.js` guard failed it -- its second line says
 * "reads the recorded runs through the built parser" rather than "reads the
 * built module, not the source". The guards are right and the assertion was
 * wrong. Rather than relax to a substring the sites happen to share, the
 * wording is extracted per site: the test then asserts that the guard printed
 * *its own* remedy, which is the property that matters and which a copy-pasted
 * diagnostic could not satisfy.
 *
 * If the extraction finds nothing, that is a failure rather than an empty
 * assertion -- the guard's message is its contract.
 */
function guardExplanation(script: string, missingBundle: string): string {
  const source = readFileSync(resolve(ROOT, 'scripts', script), 'utf8');
  // The guard writes the *variable*, not the resolved path, so the search is
  // for the interpolation. A guard that stopped interpolating would still print
  // something, and the assertion below would then be checking a constant.
  const variable = missingBundle.endsWith('miss-detail.js') ? '${MISS_DETAIL}' : '${BUNDLE}';
  const start = source.indexOf(`${variable} is missing.`);
  if (start < 0) throw new Error(`${script} declares no guard for ${variable}`);
  const rest = source.slice(start);
  const match = /\\n'\s*\+\s*\n?\s*'\s{2}([^']+)\\n'/.exec(rest);
  if (match === null) throw new Error(`${script} guard for '${missingBundle}' prints no explanation line`);
  return match[1];
}

/**
 * Assert the guard fired *for its own stated reason* rather than by crashing.
 */
function expectGuardFired(outcome: Outcome, script: string, missingBundle: string): void {
  expect(outcome.status).toBe(1);
  expect(outcome.stderr).toContain(`${missingBundle} is missing.`);
  expect(outcome.stderr).toContain(guardExplanation(script, missingBundle));
  expect(outcome.stderr).toContain('npx tsc -p packages/core/tsconfig.json');
  expect(outcome.stderr).not.toMatch(/Cannot find module/);
  expect(outcome.stderr).not.toMatch(/^\s+at .*node:internal/m);
}

/**
 * The probes that guard against a missing build, derived from
 * `golden-master/gate-sites.json`.
 *
 * `probe-category-derivation.mjs` has **two** guards, not one: it reads a second
 * bundle (`miss-detail.js`) after the first. The first draft of this file listed
 * only the `BUNDLE` guard of each probe, and mutation testing caught the
 * omission -- neutering `probe-category-derivation.mjs`'s *first* `process.exit(1)`
 * left this file green, because the scratch tree has no `dist/` at all and the
 * *second* guard fired in its place. The test was passing for a reason it did
 * not name.
 *
 * Both guards are therefore listed, and the `it.each` below pins which bundle
 * each one names. That pairing is what makes them independently required: with a
 * single generic assertion, one guard could be deleted and the other would
 * still satisfy it.
 */
const PROBES = [
  {
    script: 'probe-category-derivation.mjs',
    bundle: 'packages/core/dist/fault/category-derivation.js',
  },
  {
    script: 'probe-category-derivation.mjs',
    bundle: 'packages/core/dist/fault/miss-detail.js',
    // This guard sits behind the one above and cannot be reached without
    // satisfying it first. Stated as data rather than as a special case in the
    // tests, so the dependency is visible where the site is declared.
    prerequisite: 'packages/core/dist/fault/category-derivation.js',
  },
  {
    script: 'probe-agreement-baseline.mjs',
    bundle: 'packages/core/dist/fault/agreement-baseline.js',
  },
  {
    script: 'probe-denial-inventory.mjs',
    bundle: 'packages/core/dist/fault/denial-inventory.js',
  },
] as const;

describe('scripts · built-module guards', () => {
  it('covers every probe that declares the guard, so the list cannot silently shrink', () => {
    // Non-vacuity, and the anti-deletion clause. A probe added to `scripts/`
    // with the same guard text but left out of `PROBES` above would be an
    // unguarded site again; this test reads the directory and refuses.
    const candidates = spawnSync(
      'grep',
      ['-l', 'This probe reads the built module, not the source.', '-r', 'scripts', '--include', '*.mjs'],
      { encoding: 'utf8', cwd: ROOT },
    );
    expect(candidates.status).toBe(0);
    const found = candidates.stdout.trim().split('\n');
    const guardedScripts = [...new Set(found.map((line) => line.replace(/^scripts\//, '')))].sort();
    const coveredScripts = [...new Set(PROBES.map((p) => p.script))].sort();
    expect(guardedScripts).toEqual(coveredScripts);

    // And every published site in those scripts is covered, not merely every
    // script. This is the clause that caught the missing `miss-detail.js` guard:
    // it counts the guards the inventory publishes against the guards this file
    // exercises, so a second guard on the same script cannot slip by.
    const inventory = JSON.parse(readFileSync(resolve(ROOT, 'golden-master', 'gate-sites.json'), 'utf8'));
    const published = inventory.sites.filter((site: { script: string }) =>
      guardedScripts.includes(site.script.replace(/^scripts\//, '')),
    );
    expect(published).toHaveLength(PROBES.length);
    // Every site's diagnostic must name a bundle this file actually exercises,
    // and vice versa. Compared as multisets because the inventory is ordered by
    // line number and `PROBES` by guard sequence, and the pairing is what
    // matters -- not the order the two lists happen to be written in.
    const publishedBundles = published
      .map((site: { diagnostic: string }) => site.diagnostic.replace('error: ', '').replace(' is missing.\\n', ''))
      .sort();
    const expectedVariables = PROBES.map((p) =>
      p.bundle.endsWith('miss-detail.js') ? '${MISS_DETAIL}' : '${BUNDLE}',
    ).sort();
    expect(publishedBundles).toEqual(expectedVariables);
  });

  describe.each(PROBES)('$script · $bundle', ({ script, bundle, prerequisite }) => {
    /** The bundles that must exist before this guard is reachable. */
    const before: readonly string[] = prerequisite === undefined ? [] : [prerequisite];

    it('refuses to run when the built module is absent', () => {
      const outcome = run(script, treeWith(script, before));
      expectGuardFired(outcome, script, bundle);
    });

    it('names the bundle under the tree it was run from, not a hard-coded path', () => {
      // The point of the guard is portability: it must complain about the
      // caller's tree. A hard-coded absolute path here would pass the previous
      // test on the author's machine and fail everywhere else -- which is
      // literally the defect `check-no-absolute-paths.mjs` was written for.
      const dir = treeWith(script, before);
      const outcome = run(script, dir);
      expect(outcome.status).toBe(1);
      expect(outcome.stderr).toContain(join(dir, bundle));
      expect(outcome.stderr).not.toContain(ROOT);
    });

    it('does not report this guard when its bundle is present', () => {
      // The negative control, and the clause that makes each guard individually
      // required. Each guard's own bundle is created; if the guard for *this*
      // bundle is deleted, the process moves past it and either succeeds or
      // fails on the next one -- and the assertion below distinguishes those.
      //
      // `probe-category-derivation.mjs` is the case that matters: supplying only
      // `category-derivation.js` leaves `miss-detail.js` absent, so the second
      // guard must still fire. Supplying both must not.
      const dir = treeWith(script, [...before, bundle]);
      const target = join(dir, bundle);
      expect(existsSync(target)).toBe(true);
      const outcome = run(script, dir);
      expect(outcome.stderr).not.toContain(`${target} is missing.`);
      // And, for the chained probe, the guard *after* this one must still fire
      // -- proving this guard let execution through rather than the whole run
      // happening to pass.
      if (script === 'probe-category-derivation.mjs' && bundle.endsWith('category-derivation.js')) {
        expect(outcome.stderr).toContain(`${join(dir, 'packages/core/dist/fault/miss-detail.js')} is missing.`);
      }
    });
  });

  it('distinguishes the first chained guard from the second, so neither can stand in for the other', () => {
    // The case that mutation testing demanded. `probe-category-derivation.mjs`
    // guards two bundles in sequence, and a fixture with *no* `dist/` at all
    // cannot tell them apart: neuter the first guard and the second fires,
    // producing a message the assertions are happy with, so deleting the first
    // guard is invisible.
    //
    // Supplying `miss-detail.js` and withholding `category-derivation.js`
    // removes the ambiguity. The second guard cannot fire, because its bundle
    // is present; the only source of a failure is the first guard. Neutering it
    // now lets the process continue to the next statement and produce a
    // *different* diagnostic, which the assertion on the exact bundle rejects.
    const script = 'probe-category-derivation.mjs';
    const dir = treeWith(script, ['packages/core/dist/fault/miss-detail.js']);
    const first = join(dir, 'packages/core/dist/fault/category-derivation.js');
    const second = join(dir, 'packages/core/dist/fault/miss-detail.js');
    const outcome = run(script, dir);
    expect(outcome.status).toBe(1);
    expect(outcome.stderr).toContain(`${first} is missing.`);
    expect(outcome.stderr).not.toContain(`${second} is missing.`);
    expect(outcome.stderr).toMatch(/category-derivation\.js is missing/);
    expect(outcome.stderr).not.toMatch(/Cannot find module/);
    expect(outcome.stderr).not.toMatch(/^\s+at .*node:internal/m);
  });

  it('still refuses when only the first of the two chained bundles is present', () => {
    // Stated separately because it is the assertion that killed the first draft
    // of this file. Supplying the first bundle and withholding the second must
    // produce the *second* guard's message, which is only possible if the first
    // guard let execution through -- i.e. if the first guard exists and is
    // correct.
    const script = 'probe-category-derivation.mjs';
    const dir = treeWith(script);
    const first = join(dir, 'packages/core/dist/fault/category-derivation.js');
    const second = join(dir, 'packages/core/dist/fault/miss-detail.js');
    mkdirSync(dirname(first), { recursive: true });
    writeFileSync(first, 'export {};\n');
    const outcome = run(script, dir);
    expect(outcome.status).toBe(1);
    expect(outcome.stderr).toContain(`${second} is missing.`);
    expect(outcome.stderr).not.toContain(`${first} is missing.`);
    expect(outcome.stderr).not.toMatch(/Cannot find module/);
    expect(outcome.stderr).not.toMatch(/^\s+at .*node:internal/m);
  });
});

describe('scripts · measure-doc-counts.mjs fail()', () => {
  /**
   * This site was untestable until `main()` was reordered, and that is the
   * finding, not an aside.
   *
   * `measure()` shells out to three `pnpm test` invocations -- one of which is
   * the whole repository, this file included. The existence check ran *after*
   * the measurement, so reaching the `fail()` site meant spawning the suite,
   * which spawned this test, which spawned the suite. The guard was therefore
   * unreachable from the suite it protects, and had been since it was written.
   *
   * Moving the existence check in front of `measure()` fixes both the recursion
   * and a real inefficiency: `--check` against a missing file used to spend
   * roughly a minute of child processes and then announce that the file it was
   * going to compare against was not there. The comparison could not have
   * happened. The run is now 0.02s.
   *
   * `--out` is pointed outside the repository so the call cannot touch a
   * committed file. The alternative -- asserting against the default path --
   * would write into `golden-master/`, and a test that can dirty the working
   * tree is a test that will eventually be blamed for someone else's diff.
   */
  it('fails with a readable remedy when there is no committed measurement', () => {
    const absent = join(scratch, 'no-such-measurement.json');
    const outcome = run('measure-doc-counts.mjs', ROOT, ['--check', '--out', absent]);
    expect(outcome.status).toBe(1);
    expect(outcome.stderr).toContain('measure-doc-counts: FAILED');
    expect(outcome.stderr).toContain(`no committed measurement at ${absent}.`);
    expect(outcome.stderr).toContain('Run `node scripts/measure-doc-counts.mjs` to take one.');
    expect(outcome.stderr).not.toMatch(/Cannot find module/);
    expect(outcome.stderr).not.toMatch(/^\s+at .*node:internal/m);
  }, 30_000);

  it('does not create the file it reported missing', () => {
    // A guard that "helpfully" creates an empty measurement would turn the next
    // `--check` into a comparison against nothing, which reads as staleness
    // rather than as absence and is a much worse failure to debug.
    const absent = join(scratch, 'still-absent.json');
    run('measure-doc-counts.mjs', ROOT, ['--check', '--out', absent]);
    expect(() => readFileSync(absent, 'utf8')).toThrow();
  }, 30_000);
});
