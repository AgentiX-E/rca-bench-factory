import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Four batteries decide whether a mutation was caught, and all four used to decide
 * it with `failed > 0`.
 *
 * That condition answers *the suite went red* to a question that is *the behaviour
 * this mutation changed is pinned by a test*. Two measurements of the difference
 * are in this repository already:
 *
 * - a mutated file that can no longer be **parsed** fails every test that imports
 *   it, so exit status and failure count are indistinguishable from a real catch
 *   (found in `verify-gates-are-testable.mjs`, finding 152, and again in the
 *   gate-test battery, finding 157);
 * - a mutation that breaks **something else** on the way is credited to the row it
 *   belongs to.
 *
 * `scripts/injection/_witnesses.py` holds the single implementation of the fix:
 * each row declares the substrings of the runner's failing-test lines that must be
 * present, an unrelated red is `UNATTRIBUTED`, and a transform failure is
 * `UNPARSEABLE`. Both are failures, and they are separate verdicts because the
 * repairs are opposite.
 *
 * The four batteries share the module rather than four copies of the condition,
 * because four copies is four places for the next one to drift -- and the last
 * drift in this area is the reason the module exists.
 */

const ROOT = resolve(import.meta.dirname, '..', '..', '..');
const MODULE = resolve(ROOT, 'scripts', 'injection', '_witnesses.py');

const HARNESS = [
  'import importlib.util, json, pathlib, sys',
  `spec = importlib.util.spec_from_file_location('w', ${JSON.stringify(MODULE)})`,
  'W = importlib.util.module_from_spec(spec)',
  'spec.loader.exec_module(W)',
].join('\n');

function python(code: string) {
  const result = spawnSync('python3', ['-c', `${HARNESS}\n${code}`], { cwd: ROOT, encoding: 'utf8' });
  return { code: result.status, out: `${result.stdout}${result.stderr}` };
}

function pythonJson(code: string) {
  const result = python(code);
  expect(result.code, result.out).toBe(0);
  return JSON.parse(result.out.trim().split('\n').at(-1) ?? 'null');
}

/** The real bytes CI produces for a transform failure, captured in finding 158. */
const TRANSFORM_OUTPUT = [
  'Error: Transform failed with 1 error:',
  '/tmp/x.ts:1:20: ERROR: Expected identifier but found ";"',
  'Test Files  1 failed (1)',
  'Tests  no tests',
].join('\n');

const REGULAR_RED = [
  '× grades a fully correct extraction as graded and all fields hit',
  'Tests  1 failed | 8 passed (9)',
].join('\n');

describe('injection batteries · a red is not a proof until it names the test', () => {
  it('separates "no red" from "a red that proves nothing"', () => {
    expect(pythonJson(`print(json.dumps(W.attribute('row', {}, 0, 0, [])))`)[0]).toBe('NO_RED');
    expect(pythonJson(`print(json.dumps(W.attribute('row', {}, 1, 0, [])))`)[0]).toBe('NO_RED');
  });

  it('credits a red only when every declared witness is named', () => {
    const [verdict, detail] = pythonJson(`
print(json.dumps(W.attribute('row', {'row': ('all fields hit', 'casing is not a miss')}, 1, 1,
    ['× grades a fully correct extraction as graded and all fields hit'])))`);
    expect(verdict).toBe('UNATTRIBUTED');
    // Half the claim is not the claim.
    expect(detail).toEqual(['casing is not a miss']);

    expect(
      pythonJson(`
print(json.dumps(W.attribute('row', {'row': ('all fields hit',)}, 1, 1,
    ['× grades a fully correct extraction as graded and all fields hit'])))`)[0],
    ).toBe('CAUGHT');
  });

  it('decides UNPARSEABLE before it looks at witnesses', () => {
    // The order is the point. A file that cannot be transformed fails every test
    // that imports it, so the declared witness **is** among the failures -- which
    // is exactly why a witness check on its own cannot see this case, and why the
    // transform check comes first.
    const [verdict, detail] = pythonJson(`
print(json.dumps(W.attribute(
    'row', {'row': ('grades a fully correct extraction',)}, 1, 9,
    ['× grades a fully correct extraction as graded and all fields hit'],
    W.transform_failure(${JSON.stringify(TRANSFORM_OUTPUT)}))))`);
    expect(verdict).toBe('UNPARSEABLE');
    expect(detail[0]).toContain('Transform failed');
  });

  it('reads the transform failure out of the bytes CI produced', () => {
    expect(pythonJson(`print(json.dumps(W.transform_failure(${JSON.stringify(TRANSFORM_OUTPUT)})))`)).toContain(
      'Transform failed',
    );
    expect(pythonJson(`print(json.dumps(W.transform_failure(${JSON.stringify(REGULAR_RED)})))`)).toBe('');
  });

  it('reads all three shapes the reporter uses, through the colour it adds', () => {
    const names = pythonJson(`
print(json.dumps(W.failing_tests(
    '\\x1b[31m×\\x1b[39m becomes a miss 12ms\\n'
    '\\x1b[31m✗\\x1b[39m second shape\\n'
    '  ❯ test/foo.test.ts:12:3\\n')))`);
    expect(names).toEqual(['becomes a miss', 'second shape', 'failure in test/foo.test.ts']);
  });

  it('reports a witness that is not a test title in the file it points at', () => {
    const problems = pythonJson(`
print(json.dumps(W.witness_problems(
    {'row': ('a test title that cannot exist anywhere at all',)},
    {'row': pathlib.Path(${JSON.stringify(resolve(ROOT, 'packages/core/test/check-doc-counts.test.ts'))})})))`);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('is not a test title in');
  });

  it('reports an injection with no witness and an expectation with no injection', () => {
    const [missing, extra] = pythonJson(`
module = {'a': (), 'b': ()}
problems = W.verify_witness_table.__wrapped__ if False else None
import io, contextlib
buffer = io.StringIO()
with contextlib.redirect_stdout(buffer):
    code = W.verify_witness_table(
        'probe', module, ['a', 'b', 'c'],
        {k: pathlib.Path(${JSON.stringify(resolve(ROOT, 'packages/core/test/check-doc-counts.test.ts'))}) for k in module},
        pathlib.Path(${JSON.stringify(resolve(ROOT, 'packages/core/test'))}), 'check-doc-counts.test.ts')
lines = [l for l in buffer.getvalue().splitlines() if 'no expectation declared' in l or 'do not exist' in l]
print(json.dumps([code, lines]))`);
    expect(missing).toBe(1);
    expect(extra).toHaveLength(1);
    expect(extra[0]).toContain('c');
  });

  it('refuses to excuse a row as a survivor and credit it as a witness', () => {
    const lines = pythonJson(`
import io, contextlib
buffer = io.StringIO()
with contextlib.redirect_stdout(buffer):
    W.verify_witness_table(
        'probe', {'a': ('x',)}, ['a'],
        {'a': pathlib.Path(${JSON.stringify(resolve(ROOT, 'packages/core/test/check-doc-counts.test.ts'))})},
        pathlib.Path(${JSON.stringify(resolve(ROOT, 'packages/core/test'))}), 'check-doc-counts.test.ts',
        survivors=('a',))
print(json.dumps([l for l in buffer.getvalue().splitlines() if 'expected survivor' in l]))`);
    expect(lines).toHaveLength(1);
  });

  /**
   * Batteries with no witness table to reconcile, and why.
   *
   * A witness is a substring of the **runner's** failing-test lines, so a battery
   * that never drives the runner has nothing for that reconciliation to compare
   * against: these three measure a standalone probe's own baseline and report *the
   * reading moved*, naming a property or a diagnosis rather than a test.
   *
   * The exemption is per file rather than a wildcard, and the check below measures
   * the argument it makes in both directions -- every entry here is required *not*
   * to mention the runner, and every battery that is not here is required to.
   */
  const NO_WITNESS_TABLE: Record<string, string> = {
    'm1-ceiling-probe.py':
      'its injections assert against a probe reading and name a diagnosis, not a test title, so there is no failing-test line for a witness to be a substring of',
    'scorer-stability-probe.py':
      'its injections name a property of the report (determinism, input purity) and the probe grades them itself, so no test title is declared and none could be checked',
    'type-miss-probe.py':
      'its injections carry a baseline predicate and a diagnosis for a standalone probe, so the reconciliation against a test file has nothing to compare',
  };

  // The six batteries, as shipped. Each reconciliation is driven from here so a
  // rename fails locally instead of on the runner.
  const batteries: [string, string, number][] = [
    ['scripts/injection/gate-tests-battery.py', 'gate-tests-battery', 28],
    ['scripts/injection/fault-extraction-scoring.py', 'fault-extraction-scoring', 12],
    ['scripts/injection/fetch-official-retry.py', 'fetch-official-retry', 5],
    ['scripts/injection/fault-extraction-workflow.py', 'fault-extraction-workflow', 9],
    // These two were missing from this list while they were missing the mode as
    // well: `--verify-expectations` was ignored and their whole mutation loop ran
    // instead. Finding 163 measures what that cost.
    ['scripts/injection/doc-counts-shapes.py', 'doc-counts-shapes', 12],
    ['scripts/injection/roundtrip-record.py', 'roundtrip-record', 25],
  ];

  it('finds the reconciliation mode in every battery that drives the runner', () => {
    // The defect this exists for: two of the six batteries did not implement
    // `--verify-expectations`, so asking them to reconcile their witnesses ran
    // their **whole mutation loop** instead -- twelve and twenty-five injections,
    // each editing a tracked gate script that other tests spawn. Two of those
    // tests went red for the interference and the failure read as a defect in the
    // guard they were spawning (finding 163). Measured, before the fix: the two
    // misread invocations took **16.7 s** and **34.6 s** against **54-120 ms** for
    // the four that had the mode.
    //
    // A mode that silently does something else is worse than a missing mode: the
    // expensive path looks like the cheap one from the outside, and the only
    // evidence is a duration nobody reads.
    const dir = resolve(ROOT, 'scripts', 'injection');
    const sources = new Map(
      readdirSync(dir)
        .filter((name) => name.endsWith('.py') && !name.startsWith('_'))
        .map((name) => [name, readFileSync(resolve(dir, name), 'utf8')]),
    );
    expect(sources.size, 'no batteries found, so this assertion has no subject').toBeGreaterThanOrEqual(6);

    const without = [...sources].filter(([, text]) => !text.includes('--verify-expectations')).map(([n]) => n);
    // Both directions. A battery that gained the mode must lose its exemption --
    // a stale exemption is a claim about a file that no longer matches it -- and a
    // battery that lost the mode must be red here rather than discovered later.
    expect(
      without.sort(),
      'these batteries do not implement `--verify-expectations`, so invoking that mode runs their ' +
        'whole mutation loop: add the mode, or record why there is no witness table to reconcile',
    ).toEqual(Object.keys(NO_WITNESS_TABLE).sort());

    for (const [name, text] of sources) {
      // The exemption's scope is its argument, and the argument is measured here:
      // a witness is a substring of the **runner's** failing-test lines, so a
      // battery that does not drive the runner has nothing to reconcile -- and a
      // battery that does cannot be excused on that ground.
      const drives = /vitest/.test(text);
      if (Object.prototype.hasOwnProperty.call(NO_WITNESS_TABLE, name)) {
        expect(drives, `${name} is excused as having no witness table, yet it drives the runner`).toBe(false);
      } else {
        expect(drives, `${name} implements no reconciliation and does not drive the runner either`).toBe(true);
      }
    }

    const reasons = Object.values(NO_WITNESS_TABLE);
    for (const [name, reason] of Object.entries(NO_WITNESS_TABLE)) {
      expect(reason.length, `${name}'s reason is too short to be one`).toBeGreaterThanOrEqual(40);
    }
    expect(new Set(reasons).size, 'two exemptions share a reason, so one was never argued').toBe(reasons.length);
  });

  it.each(batteries)('%s reconciles its witness table, with the comparator probed', (path, label, witnesses) => {
    const result = spawnSync('python3', [resolve(ROOT, path), '--verify-expectations', '--probe'], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    const out = `${result.stdout}${result.stderr}`;
    expect(out).toContain(`${label}: OK (${witnesses} witness(es)`);
    expect(out).toContain('with the comparator probed');
    expect(result.status, out).toBe(0);
  });

  it('is the only implementation of the condition', () => {
    // Six copies of a condition is six places for the next one to drift, and one of
    // them already had. Asserted by counting the call sites rather than by reading
    // them: every battery that decides a verdict asks this module -- including the
    // two that gained the reconciliation mode in finding 163, which is what makes
    // the count part of this assertion rather than a second list.
    const callers = batteries.filter(([path]) => {
      const r = spawnSync('python3', [
        '-c',
        'import pathlib,sys; print("import _witnesses" in pathlib.Path(sys.argv[1]).read_text())',
        resolve(ROOT, path),
      ], { encoding: 'utf8' });
      return r.stdout.trim() === 'True';
    });
    expect(callers).toHaveLength(batteries.length);
  });

  it('does not record the scratch another process keeps in the tree', () => {
    // A test that needs a module beside its subject writes it with a dot in front
    // of the name -- `scripts/.probe-figures-harness-type-miss.mjs` exists for the
    // length of one probe. The journal records whole subtrees, so it saw that file
    // and then digested it after the probe had removed it: one failure in one
    // full-suite run, in a `finally`, as a traceback.
    //
    // Skipping dotfiles is the rule `derive-gate-sites.mjs` adopted for the same
    // reason and after the same kind of failure: a file that is not committed, not
    // named by `pnpm lint` and never resolved by an operator is scratch, and
    // scratch belongs to whoever wrote it. The contents of a scratch *directory*
    // are scratch too, which is why the test has one.
    const listed = pythonJson(`
import tempfile
root = pathlib.Path(tempfile.mkdtemp())
(root / 'visible.mjs').write_text('x')
(root / 'visible.txt').write_text('x')
(root / '.hidden.mjs').write_text('x')
(root / '.hidden-dir').mkdir()
(root / '.hidden-dir' / 'inside.mjs').write_text('x')
print(json.dumps([p.name for p in W._guarded_files([root])]))`);
    expect(listed).toEqual(['visible.mjs']);
  });
});
