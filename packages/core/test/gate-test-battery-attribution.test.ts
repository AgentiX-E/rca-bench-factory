import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The gate-test battery credited any red as a proof, and every gate in this
 * repository leans on it.
 *
 * ## The measurement
 *
 * `scripts/injection/gate-tests-battery.py` declares, for each of its twenty-five
 * injections, the test that the mutation has to break -- in prose, in the fifth
 * field of each row. The CAUGHT condition was:
 *
 *     if status != 0 and failed_count(output) > 0:
 *
 * so the prose was printed and never compared, and the verdict answered "the
 * suite went red" to a question that was "does *this test* disagree". The
 * difference is not academic. Prefixing `scripts/check-readme-sample.mjs` with a
 * line that is not JavaScript gives exit 1 and seven failing tests, and the
 * condition accepts it:
 *
 *     restored byte-exact: True
 *     exit status: 1 | failed: 7
 *     the battery's CAUGHT condition (status != 0 and failed > 0): True
 *
 * Nothing about the tests README 1 declares -- "the test that a good sample is
 * executed and the test that the marker is what selects it" -- was exercised by
 * that red. A row like that is a proof asserted rather than exhibited, which is
 * the class this campaign keeps finding: finding 152 (a sibling script crediting
 * a syntax error as `CAUGHT 51 red`), 153, and 155.
 *
 * ## What replaced it
 *
 * `EXPECTATIONS` states the same claim in a checkable form -- the substrings of
 * the runner's failing-test lines that must be present -- `attribute()` decides
 * from it, and an unrelated red is `UNATTRIBUTED`, which is a failure. The parse
 * guard is the other half: an injection that removes the script's ability to be
 * parsed makes every test in the file fail, so the verdict is `UNPARSEABLE`
 * before the suite is asked at all.
 *
 * The two end-to-end tests below drive `main()` with a one-row injection table, so
 * what is exercised is the wiring and not just the decision functions.
 */

const ROOT = resolve(import.meta.dirname, '..', '..', '..');
const BATTERY = resolve(ROOT, 'scripts', 'injection', 'gate-tests-battery.py');

const HARNESS = [
  'import contextlib, importlib.util, io, json, pathlib, sys',
  `spec = importlib.util.spec_from_file_location('gtb', ${JSON.stringify(BATTERY)})`,
  'module = importlib.util.module_from_spec(spec)',
  'spec.loader.exec_module(module)',
].join('\n');

/** Run a snippet against the battery module, so these tests exercise the shipped file. */
function python(code: string) {
  const argv = ['-c', `${HARNESS}\n${code}`];
  let result = spawnSync('python3', argv, { cwd: ROOT, encoding: 'utf8' });
  // A child that never started is not a verdict about the battery: `status` is
  // null and every assertion here reads `status` or its output, so the failure
  // would read as a complaint about the battery. The retry is limited to the two
  // kernel resource errors, because retrying a real red is masking it.
  const failure = (): string | undefined =>
    (result.error as NodeJS.ErrnoException | undefined)?.code;
  if (failure() === 'EAGAIN' || failure() === 'ENOMEM') {
    result = spawnSync('python3', argv, { cwd: ROOT, encoding: 'utf8' });
  }
  expect(result.error, `python3 could not be started: ${String(result.error)}`).toBeUndefined();
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
}

/**
 * Run a snippet that prints one JSON line as its last output line.
 *
 * The parse reads **stdout only**. It used to read `stdout + stderr`, so anything
 * Python wrote to the other stream after the JSON line -- a warning, a traceback
 * from a thread, the tail of a nested run -- became the "last line" and the
 * failure arrived as `SyntaxError: Unexpected token '_'` with no indication of
 * which stream carried it. Observed once, unreproduced: `"_witnesses"... is not
 * valid JSON` from a run in which every other assertion passed.
 *
 * Splitting the streams does not weaken the check: the subject is what the snippet
 * *printed*, and a line it wrote to stderr is not its output. Both streams stay in
 * the failure message, so a warning that was hiding a parse error is now visible
 * as itself.
 */
function pythonJson(code: string) {
  const result = python(code);
  const where = `stdout:\n${result.stdout}\nstderr:\n${result.stderr}`;
  expect(result.code, where).toBe(0);
  const last = result.stdout.trim().split('\n').at(-1) ?? 'null';
  // A JSON *document* is any parseable value, including a bare number: one of the
  // snippets below prints a count. `undefined` is the sentinel because no JSON
  // document parses to it.
  let parsed: unknown;
  try {
    parsed = JSON.parse(last);
  } catch {
    parsed = undefined;
  }
  expect(parsed, `the snippet printed no JSON line. Last line was: ${last}\n${where}`).not.toBeUndefined();
  return parsed;
}

/**
 * Replace the injection table with one synthetic row and let `main()` run.
 *
 * `run_tests` is replaced on the module rather than allowed to run vitest: the
 * point is which branch `main()` takes, and one of these tests asserts that the
 * branch is taken *before* any suite is invoked, which a real run could not show.
 * The report is written to `REPORT_PATH`, which the repository already ignores.
 */
function driveMain(row: string, expectations: string) {
  const code = `
${row}
module.INJECTIONS = [SYNTHETIC]
module.EXPECTATIONS = {SYNTHETIC[0]: ${expectations}}
module.EXPECTED_SURVIVORS = {}
module.ORIGINALS = {SYNTHETIC[1]: pathlib.Path(SYNTHETIC[1]).read_text()}
module.assert_vitest_is_callable = lambda: None
buffer = io.StringIO()
with contextlib.redirect_stdout(buffer):
    code = module.main()
printed = buffer.getvalue()
print(json.dumps([code, printed]))`;
  return pythonJson(code) as [number, string];
}

const UNPARSEABLE_ROW = `
SYNTHETIC = (
    'SYNTHETIC unparseable',
    'scripts/check-doc-counts.mjs',
    'check-doc-counts.test.ts',
    lambda text: 'this is not javascript at all\\n' + text,
    'nothing: the mutation is a syntax error',
)
module.run_tests = lambda test_file: (_ for _ in ()).throw(
    AssertionError('the suite was invoked for a mutation that does not parse'))`;

const UNATTRIBUTED_ROW = `
SYNTHETIC = (
    'SYNTHETIC unattributed',
    'scripts/check-doc-counts.mjs',
    'check-doc-counts.test.ts',
    lambda text: text.replace('const ', 'let ', 1),
    'a test that cannot be named',
)
module.run_tests = lambda test_file: (
    1, '× some other test entirely\\nTests  1 failed (2)\\n', 0.1)`;

describe('gate-test battery · a red is not a proof until it names the test', () => {
  // The condition that used to decide, driven with the exact shape a parse error
  // produces: the fixture is the defect rather than a description of it.
  it('refuses to credit a red whose failure does not name the declared test', () => {
    const [verdict, missing] = pythonJson(`
print(json.dumps(module.attribute(
    'README 1. the sample marker stops matching, so nothing is collected', module.EXPECTATIONS, 1, 7, ['failure in test/check-readme-sample.test.ts'])))`);
    expect(verdict).toBe('UNATTRIBUTED');
    expect(missing).toContain('executes a sample block and reports it by number');
  });

  it('credits a red only when every declared witness is named', () => {
    const [verdict, missing] = pythonJson(`
print(json.dumps(module.attribute(
    'README 1. the sample marker stops matching, so nothing is collected', module.EXPECTATIONS, 1, 12, [
        'scripts/check-readme-sample.mjs · what it asserts about a good sample > executes a sample block and reports it by number',
        'scripts/check-readme-sample.mjs · what it asserts about a good sample > picks the sample out by its import rather than by fence position'])))`);
    expect(verdict).toBe('CAUGHT');
    expect(missing).toEqual([]);

    // Half the claim is not the claim: with one of the two present the row is
    // still unattributed, which is what makes "every witness" a real condition
    // rather than a description of the first one.
    const [half, stillMissing] = pythonJson(`
print(json.dumps(module.attribute(
    'README 1. the sample marker stops matching, so nothing is collected', module.EXPECTATIONS, 1, 12, [
        'scripts/check-readme-sample.mjs · what it asserts about a good sample > executes a sample block and reports it by number'])))`);
    expect(half).toBe('UNATTRIBUTED');
    expect(stillMissing).toHaveLength(1);
  });

  it('separates "no red" from "a red that proves nothing"', () => {
    // A green run and a run whose failure list was not read are different
    // non-verdicts, and neither is a catch. Collapsing them would hide a runner
    // that decided nothing behind one that decided against the guard.
    expect(pythonJson(`print(json.dumps(module.attribute('any row', {}, 0, 0, [])))`)[0]).toBe('NO_RED');
    expect(pythonJson(`print(json.dumps(module.attribute('any row', {}, 1, 0, [])))`)[0]).toBe('NO_RED');
  });

  // The parse guard, driven through main(): the demonstration above's shape.
  it('reaches UNPARSEABLE without invoking the suite at all', () => {
    const [code, printed] = driveMain(UNPARSEABLE_ROW, '()');
    expect(printed).toContain('UNPARSEABLE SYNTHETIC unparseable');
    expect(printed).toContain('no longer parses');
    expect(printed).toContain('1 unparseable');
    // The suite was never asked: the stub raises if it is called, and the verdict
    // has to be reachable without it.
    expect(code).toBe(1);
  });

  it('reaches UNATTRIBUTED when the red names something else, and fails the run', () => {
    // The witness is a real title from the file the synthetic row points at --
    // otherwise the battery's own reconciliation refuses the row before main()
    // reaches the verdict, and this test would be measuring that instead.
    const [code, printed] = driveMain(
      UNATTRIBUTED_ROW,
      "('reads the newly supported shape where the shipped document uses it',)",
    );
    expect(printed).toContain('UNATTRIBUTED SYNTHETIC unattributed');
    expect(printed).toContain('missing: reads the newly supported shape where the shipped document uses it');
    expect(printed).toContain('1 unattributed');
    expect(code).toBe(1);
  });

  it('accepts a script that parses, so the guard is not simply always false', () => {
    const [loads] = pythonJson(`
import pathlib
source = pathlib.Path(module.INJECTIONS[0][1]).read_text()
print(json.dumps([module.parses(module.INJECTIONS[0][1], source)[0]]))`);
    expect(loads).toBe(true);
  });

  it('reconciles every injection with a witness, and the witnesses with their files', () => {
    const result = python("sys.exit(module.verify_expectations(probe=True))");
    // The battery prints its report to stdout; `stderr` is checked separately so a
    // half-finished line on the other stream cannot satisfy a `toContain`.
    expect(result.stdout).toContain('gate-tests-battery: OK');
    expect(result.stdout).toContain('with the comparator probed');
    expect(result.code).toBe(0);
  });

  // The table check moved into `scripts/injection/_witnesses.py`, which the four
  // batteries share; this test drives it through the battery's own import so a
  // battery that stopped delegating would fail here rather than silently keeping a
  // second copy of the condition.
  it('reports a witness that is not a test title in the file it points at', () => {
    const problems = pythonJson(`
print(json.dumps(module.W.witness_problems(
    {'row': ('a test title that cannot exist anywhere at all',)},
    {'row': module.TEST_DIR / 'check-doc-counts.test.ts'})))`);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('is not a test title in');
  });

  it('reports an injection that declares no witness at all', () => {
    // The state this round measured its way out of: a row with no expectation
    // accepts any red, and the completeness check is what makes that impossible.
    const [code, lines] = pythonJson(`
name = sorted(name for name, *_ in module.INJECTIONS)[0]
module.EXPECTATIONS = {k: v for k, v in module.EXPECTATIONS.items() if k != name}
buffer = io.StringIO()
with contextlib.redirect_stdout(buffer):
    code = module.verify_expectations()
print(json.dumps([code, [l for l in buffer.getvalue().splitlines() if 'no expectation declared' in l]]))`);
    expect(code).toBe(1);
    expect(lines).toHaveLength(1);
  });

  it('refuses to excuse an injection as a survivor and credit it as a witness', () => {
    const reported = pythonJson(`
name = sorted(module.EXPECTED_SURVIVORS)[0]
module.EXPECTATIONS = dict(module.EXPECTATIONS)
module.EXPECTATIONS[name] = ('counts the manifest in the file count it advertises',)
buffer = io.StringIO()
with contextlib.redirect_stdout(buffer):
    module.verify_expectations()
print(json.dumps([l for l in buffer.getvalue().splitlines() if 'expected survivor' in l]))`);
    expect(reported).toHaveLength(1);
  });

  it('covers every injection, which is the only thing that makes the rest non-vacuous', () => {
    // Every check above is about a table, and a table with two rows would satisfy
    // all of them.
    expect(pythonJson(`print(json.dumps(len(module.EXPECTATIONS)))`)).toBe(25);
    expect(pythonJson(`print(json.dumps(len(module.EXPECTATIONS)))`)).toBe(
      pythonJson(`print(json.dumps(len(module.INJECTIONS)))`),
    );
  });
});
