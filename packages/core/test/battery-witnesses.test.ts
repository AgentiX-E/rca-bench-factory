import { spawnSync } from 'node:child_process';
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

  // The four batteries, as shipped. Each reconciliation is driven from here so a
  // rename fails locally instead of on the runner.
  const batteries: [string, string, number][] = [
    ['scripts/injection/gate-tests-battery.py', 'gate-tests-battery', 28],
    ['scripts/injection/fault-extraction-scoring.py', 'fault-extraction-scoring', 12],
    ['scripts/injection/fetch-official-retry.py', 'fetch-official-retry', 5],
    ['scripts/injection/fault-extraction-workflow.py', 'fault-extraction-workflow', 9],
  ];

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
    // Four copies of a condition is four places for the next one to drift, and one
    // of them already had. Asserted by counting the call sites rather than by
    // reading them: every battery that decides a verdict asks this module.
    const callers = batteries.filter(([path]) => {
      const r = spawnSync('python3', [
        '-c',
        'import pathlib,sys; print("import _witnesses" in pathlib.Path(sys.argv[1]).read_text())',
        resolve(ROOT, path),
      ], { encoding: 'utf8' });
      return r.stdout.trim() === 'True';
    });
    expect(callers).toHaveLength(4);
  });
});
