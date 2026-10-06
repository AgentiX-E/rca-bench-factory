import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
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
  'scripts/verify-scorer-stability.mjs',
];


/**
 * `scripts/verify-scorer-stability.mjs` -- six properties, and the fact that
 * nothing ran them.
 *
 * The script's own header says the four properties are "what `stable instrument`
 * means concretely" and that each one has a failure mode "that would produce a
 * plausible number that is not a true one". That is a gate, not a report. It was
 * referenced by `package.json`'s `verify:scorer-stability` script and by nothing
 * else: no workflow step, no lint chain, no test. The property it guards -- that
 * a rate is a measurement rather than a sample -- is exactly the one the audit
 * leans on when it reads a run's accuracy, so an unexecuted gate here means the
 * instrument could drift while every reported number still looked self-consistent.
 *
 * Two things are asserted, and they are different:
 *
 *   1. The gate is *reachable* -- some workflow step, or the lint chain, runs it.
 *      Checking the source text of the workflow rather than trusting a comment is
 *      deliberate: the comment explaining the scorer-stability *battery* sits
 *      directly above this file's absence, which is how it stayed invisible.
 *   2. The gate *refuses*. It is copied into a throwaway tree two levels down so
 *      its own location-derived `ROOT` resolves to that tree, and the tree is
 *      built to violate each property in turn. `packages/` and `node_modules/`
 *      are symlinked rather than copied: the gate imports the built `core`, which
 *      imports `zod`, and a copied `packages/` fails with a module-not-found that
 *      names neither the dataset nor the property under test.
 *
 * Property 4 is checked against the real dataset as shipped. The other three are
 * driven by overriding the dataset the gate reads, because they are properties of
 * the scorer, not of the fixture -- a tree whose dataset is already saturated is
 * the smallest thing that exercises them.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SCRIPT = 'verify-scorer-stability.mjs';
const HERE = dirname(fileURLToPath(import.meta.url));

interface Outcome {
  status: number;
  stdout: string;
  stderr: string;
}

function run(scriptPath: string): Outcome {
  try {
    const stdout = execFileSync(process.execPath, [scriptPath], {
      encoding: 'utf8',
      cwd: dirname(scriptPath),
    });
    return { status: 0, stdout, stderr: '' };
  } catch (error) {
    const e = error as { status?: number; stdout?: string; stderr?: string };
    return { status: e.status ?? -1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

let counter = 0;
const scratch = mkdtempSync(join(tmpdir(), 'verify-scorer-stability-'));

/**
 * A throwaway tree that the copied gate will read instead of the repository.
 *
 * `dataset` is written verbatim to the path the gate resolves from its own
 * location, so a test can hand it a dataset that violates a property.
 */
function treeWith(dataset: unknown): string {
  counter += 1;
  const tree = join(scratch, `tree-${counter}`);
  mkdirSync(join(tree, 'scripts'), { recursive: true });
  mkdirSync(join(tree, 'golden-master', 'fault-extraction'), { recursive: true });
  writeFileSync(
    join(tree, 'scripts', SCRIPT),
    readFileSync(resolve(ROOT, 'scripts', SCRIPT), 'utf8'),
  );
  writeFileSync(
    join(tree, 'golden-master', 'fault-extraction', 'samples.json'),
    JSON.stringify(dataset),
  );
  symlinkSync(resolve(ROOT, 'packages'), join(tree, 'packages'), 'dir');
  symlinkSync(resolve(ROOT, 'node_modules'), join(tree, 'node_modules'), 'dir');
  return join(tree, 'scripts', SCRIPT);
}

const DATASET = JSON.parse(
  readFileSync(resolve(ROOT, 'golden-master', 'fault-extraction', 'samples.json'), 'utf8'),
) as { samples: { id: string; expected: Record<string, unknown> }[] };

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

describe('scripts/verify-scorer-stability.mjs · it is reachable', () => {
  it('is run by a workflow step or the lint chain, not only by a package script', () => {
    const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts['verify:scorer-stability']).toContain(SCRIPT);

    const workflows = ['ci.yml']
      .map((f) => readFileSync(resolve(ROOT, '.github', 'workflows', f), 'utf8'))
      .join('\n');
    const reachable =
      workflows.includes(SCRIPT) || pkg.scripts.lint.includes(SCRIPT);
    expect(
      reachable,
      'the gate is named only by its own package script, so no job ever executes it',
    ).toBe(true);
  });

  it('is a real process that Node accepts', () => {
    const files = readFileSync(resolve(ROOT, 'scripts', SCRIPT), 'utf8');
    expect(files).toContain('process.exit(1)');
    const result = run(resolve(ROOT, 'scripts', SCRIPT));
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('ALL PROPERTIES HOLD');
  });
});

describe('scripts/verify-scorer-stability.mjs · it refuses a broken property', () => {
  it('reports every property on a healthy tree, so one check is not silently skipped', () => {
    const result = run(resolve(ROOT, 'scripts', SCRIPT));
    expect(result.status).toBe(0);
    const passes = result.stdout.split('\n').filter((l) => l.startsWith('PASS '));
    // Ten checks over three fixtures. The count is asserted rather than a subset,
    // because a fixture that stops being exercised shows up here as a shortage
    // rather than as a silent pass.
    expect(passes).toHaveLength(14);
    expect(result.stdout).toContain('determinism');
    expect(result.stdout).toContain('input purity');
    expect(result.stdout).toContain('order independence');
    expect(result.stdout).toContain('denominator');
    expect(result.stdout).toContain('omitted path');
    expect(result.stdout).toContain('mixed fixture');
  });

  it('exercises all three fixtures, so no property is checked over a constant', () => {
    const result = run(resolve(ROOT, 'scripts', SCRIPT));
    expect(result.status).toBe(0);
    // Each fixture reports its own line. A fixture that quietly stopped being built
    // would leave its property line unreachable and the count above would catch it,
    // but naming the runs here says which one is missing.
    expect(result.stdout).toMatch(/saturated run: graded=\d+ .* omitted=0/);
    expect(result.stdout).toMatch(/partial run: graded=\d+ .* omitted=[1-9]\d*/);
    expect(result.stdout).toMatch(/mixed run: graded=\d+ samplesWithMisses=\d+ distinctMissRecords=\d+/);
  });

  it('checks the omitted half of the classification over a fixture that can omit', () => {
    const source = readFileSync(resolve(ROOT, 'scripts', SCRIPT), 'utf8');
    // The saturated fixture answers every field, so its `omitted` is always 0 and
    // any check reading it there is unfalsifiable. The partial fixture is what makes
    // the omitted path observable.
    expect(source).toContain('partialPredictions');
    expect(source).toMatch(/omitted path: the partial fixture actually omits/);
  });

  it('takes the input-purity snapshot before the code under test has run', () => {
    // A snapshot taken after a prior scoring call cannot see an idempotent
    // mutation: `before` and `after` would already agree. This asserts the ordering
    // rather than the outcome, because the outcome is a pass either way.
    const source = readFileSync(resolve(ROOT, 'scripts', SCRIPT), 'utf8');
    const purityAt = source.indexOf('const before = JSON.stringify(samples);');
    const determinismAt = source.indexOf('const samplesForDeterminism');
    expect(purityAt).toBeGreaterThan(-1);
    expect(determinismAt).toBeGreaterThan(-1);
    expect(purityAt).toBeLessThan(determinismAt);
  });

  it('holds on a dataset whose samples carry only the one field the parser requires', () => {
    // This is a regression test with a history. Before the mixed fixture existed,
    // a dataset reduced to `{ type }` per sample made `samplesWithMisses` equal the
    // graded count for a reason the gate could not distinguish from correctness, and
    // the gate was reported as failing here. With the mixed fixture it holds, and the
    // reason is structural: the parser requires a non-blank `type` on every sample
    // and the mixed fixture answers the first sample's every expected field
    // correctly, so a clean sample always exists. The gate is therefore not broken by
    // a reduced dataset, and this asserts that rather than a refusal it no longer
    // produces.
    const reduced = structuredClone(DATASET);
    for (const s of reduced.samples) {
      s.expected = { type: s.expected.type as string };
    }
    const result = run(treeWith(reduced));
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('ALL PROPERTIES HOLD');
    expect(result.stdout).toMatch(/mixed fixture: samplesWithMisses is strictly below the graded count/);
  });

  it('refuses a dataset whose samples state no expectation the scorer can check', () => {
    // A dataset the scorer cannot grade must fail loudly. With every `expected` set
    // to a value-free object the parser throws before the first check, so the gate
    // never reports a property -- and crucially never reports ALL PROPERTIES HOLD.
    const empty = structuredClone(DATASET);
    for (const s of empty.samples) {
      s.expected = {};
    }
    const result = run(treeWith(empty));
    expect(result.status).toBe(1);
    expect(result.stdout).not.toContain('ALL PROPERTIES HOLD');
    expect(result.stdout).not.toMatch(/^PASS /m);
    expect(result.stderr).toContain('missing an expected');
  });

  it('names the property that failed rather than reporting only a count', () => {
    // The refusal is driven through a dataset rather than the source: one sample is
    // stripped of every field except `type`, and one is given a `type` that the
    // saturated predictor cannot match... which it already cannot. The observable
    // failure has to come from the count, so this uses the duplicate-id route, which
    // the runner refuses before the first check and reports by name.
    const dup = structuredClone(DATASET);
    dup.samples.push(structuredClone(dup.samples[0]!));
    const result = run(treeWith(dup));
    expect(result.status).toBe(1);
    expect(result.stdout).not.toContain('ALL PROPERTIES HOLD');
    expect(result.stderr).toContain('duplicate sample id');
  });

  it('still runs the checks before a broken property, so a failure does not hide the rest', () => {
    // The gate is arranged so a parse failure stops it before any property is
    // reported, and a property failure does not stop the remaining properties. This
    // asserts the second half over the healthy tree: all fourteen checks are reached
    // and reported, rather than the first failure ending the run.
    const result = run(resolve(ROOT, 'scripts', SCRIPT));
    expect(result.status).toBe(0);
    const lines = result.stdout.split('\n').filter((l) => /^(PASS|FAIL) /.test(l));
    expect(lines).toHaveLength(14);
    expect(lines.every((l) => l.startsWith('PASS '))).toBe(true);
  });

  it('refuses a dataset it cannot parse, rather than reporting the properties vacuously', () => {
    const dup = structuredClone(DATASET);
    dup.samples.push(structuredClone(dup.samples[0]!));
    const result = run(treeWith(dup));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('duplicate sample id');
    expect(result.stdout).not.toContain('ALL PROPERTIES HOLD');
  });

  it('writes no artefact, so running it cannot make a tree look checked', () => {
    const before = readFileSync(resolve(ROOT, 'scripts', SCRIPT), 'utf8');
    run(resolve(ROOT, 'scripts', SCRIPT));
    expect(readFileSync(resolve(ROOT, 'scripts', SCRIPT), 'utf8')).toBe(before);
    const source = readFileSync(resolve(ROOT, 'scripts', SCRIPT), 'utf8');
    expect(source).not.toMatch(/writeFileSync|createWriteStream/);
  });
});
