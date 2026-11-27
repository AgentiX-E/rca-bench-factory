import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * An injection pays for one test, not for the file that test lives in.
 *
 * ## The price this was written for
 *
 * `scripts/injection/gate-tests-battery.py` runs, for each of its 66 injections, the
 * **whole test file** the gate is tested by. Measured on this tree at v3.159, one
 * process at a time, that is **264 s** of child time -- and one file is 45% of it:
 * `check-cli-reference.test.ts` holds ten tests that each spawn the real CLI, so five
 * injections pay for eight tests apiece that are not theirs (`CLIREF 5` alone costs
 * 23.9 s to prove one guard).
 *
 * The sites battery had the same shape and paid it in v3.158: the report names the
 * test that failed, the cost table records it, and the next run is pointed at that one
 * test with `--testNamePattern`. This is the same device on the other battery, and the
 * asymmetry that makes it safe is the same too:
 *
 *   - a red aimed run **with the declared witnesses among the failures** is the same
 *     evidence the whole file would have given;
 *   - a green aimed run is evidence of **nothing** -- the tests the aim skipped were
 *     never run -- so the row is measured again against its whole file, and that run
 *     decides;
 *   - a red aimed run on some *other* test says the aim matched something and nothing
 *     about the guard, so it falls back the same way.
 *
 * ## What is driven here, and what is not
 *
 * The fallback is the whole of the design, so it is executed rather than read: the
 * driver below imports the shipped battery, replaces its runner with a stub, and runs
 * the **real** `_measure` over three rows that reach the three arms of the rule. One
 * test pretending to be another is not evidence, which is why the shipped module is
 * what runs and the stub is only its clock.
 *
 * The battery cannot be run for real from inside vitest -- vitest invoking the battery
 * invokes vitest, and in that nesting the inner runner collects no tests, so every
 * injection reports SURVIVED for a reason that has nothing to do with its guard. That
 * was measured in `gate-test-battery-timeout.test.ts` and is why this file stubs the
 * runner instead of racing it.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const BATTERY = resolve(ROOT, 'scripts', 'injection', 'gate-tests-battery.py');
const SOURCE = readFileSync(BATTERY, 'utf8');
const TABLE = resolve(ROOT, 'golden-master', 'gate-witnesses.json');

const scratch = mkdtempSync(join(tmpdir(), 'rca-bench-gate-aim-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

/** The executable part of a Python file: docstrings and `#` comments removed. */
function codeOf(source: string): string {
  return source
    .replace(/"""[\s\S]*?"""/g, '')
    .split('\n')
    .map((line) => line.replace(/#.*$/, ''))
    .join('\n');
}

interface Driven {
  calls: { arm: string; aim: string | null }[];
  writingCalls: { arm: string; aim: string | null }[];
  status: number;
  printed: string;
  table: unknown;
  escaped: {
    pattern: string;
    matchesTitle: boolean;
    matchesNeighbour: boolean;
    rawMatchesTitle: boolean;
    rawMatchesNeighbour: boolean;
  };
  named: string[];
  problems: Record<string, string[]>;
  cover: { fewest: string[]; unmatchable: string[] };
  patterns: { chain: string; plain: string };
}

/**
 * One driver, one process, every arm of the rule.
 *
 * The stub runner is a function of **what is on disk**: each row's mutation appends
 * `// arm=<name>` to a scratch gate, and the stub reads that marker to decide what its
 * run reports. That is what makes the three arms separable without three copies of the
 * loop -- the battery's own control flow (write, run, restore, decide, fall back) is
 * the subject, and only the child that would have been vitest is a stand-in.
 */
const DRIVER = `
import contextlib, importlib.util, io, json, os, pathlib, re, tempfile

BATTERY = ${JSON.stringify(BATTERY)}

spec = importlib.util.spec_from_file_location('gb', BATTERY)
gb = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gb)

work = pathlib.Path(tempfile.mkdtemp())
subject = work / 'gate.mjs'
subject.write_text('const guard = 1;\\n')

WITNESS = 'refuses a stale archive'
OTHER = 'reports every disagreement rather than stopping at the first'
EXTRA = 'refuses a reference that documents no flag at all'

def red(*titles):
    return '\\n'.join([f'\\u00d7 {t}' for t in titles] + [f'Tests  {len(titles)} failed | 1 passed (9)'])

ARMS = {
    # the aim decides the row: one run, and it is the aimed one
    'holds': {'aim': red(WITNESS), 'whole': red(WITNESS)},
    # the aim goes red on a test the row does not name: the whole file decides, and that
    # run fails on three titles of which the row's witnesses need two
    'other': {'aim': red(OTHER), 'whole': red(WITNESS, OTHER, EXTRA)},
    # the aim matches nothing (a renamed title): green, so the whole file decides
    'green': {'aim': 'Tests  3 skipped (3)', 'whole': red(WITNESS)},
}

ROWS = [
    (f'arm {arm}', str(subject), 'check-doc-counts.test.ts',
     (lambda marker: lambda text: text + '// arm=' + marker + '\\n')(arm),
     f'the guard arm {arm} removes')
    for arm in ARMS
]

CALLS = []

def fake_run_tests(test_file, aim=None):
    text = subject.read_text()
    arm = text.rsplit('arm=', 1)[1].split('\\n')[0]
    CALLS.append({'arm': arm, 'aim': aim})
    out = ARMS[arm]['aim' if aim is not None else 'whole']
    return (1 if 'failed' in out else 0), out, 0.01

gb.run_tests = fake_run_tests
gb.assert_vitest_is_callable = lambda: None
gb.verify_expectations = lambda probe=False, writing=False: 0
gb.write_report = lambda results, summary: None
gb.INJECTIONS = ROWS
# arm other declares **two** witnesses, so its whole-file run fails on two titles and
# the table has to keep both: aiming at one would leave the other missing and turn a real
# catch into UNATTRIBUTED. The other two rows declare one each.
gb.EXPECTATIONS = {
    name: ((WITNESS, OTHER) if name == 'arm other' else (WITNESS,))
    for name, *_ in ROWS
}
gb.EXPECTED_SURVIVORS = {}
gb.ORIGINALS = {str(subject): subject.read_text()}
gb.LOCK_PATH = work / 'lock'
gb.acquire_exclusive_lock = lambda: os.open(str(gb.LOCK_PATH), os.O_CREAT | os.O_WRONLY)
gb.WITNESSES_PATH = work / 'gate-witnesses.json'
gb.WITNESSES_PATH.write_text(json.dumps({'injections': {name: {'tests': [WITNESS]} for name, *_ in ROWS}}))

printed = io.StringIO()
with contextlib.redirect_stdout(printed):
    status = gb._measure()
aimed_run = list(CALLS)
aimed_printed = printed.getvalue()

# The writing mode: the aim is off, and the table is written from what failed.
CALLS.clear()
printed = io.StringIO()
with contextlib.redirect_stdout(printed):
    writing_status = gb._measure(write_witnesses=True)
writing_run = list(CALLS)
table = json.loads(gb.WITNESSES_PATH.read_text())

# The escaping, on a title that is a pattern if it is passed through.
TITLE = "a bound's margin (v3.157)"
NEIGHBOUR = "a bound's margin v3.157"
escaped = gb.escape_pattern(TITLE)

# What the aim may be aimed at: titles, never the runner's file-level frames.
named = gb.named_tests('\\n'.join([
    '\\u00d7 ' + WITNESS,
    '\\u00d7 ' + WITNESS,
    '\\u2717 ' + OTHER + '  12ms',
    '\\u276f test/check-doc-counts.test.ts:12:3',
    'Tests  2 failed | 1 passed (9)',
]))

# The three ways the table can be wrong, and the positive control beside them.
files = {'row a': pathlib.Path(${JSON.stringify(resolve(ROOT, 'packages/core/test/check-doc-counts.test.ts'))})}
problems = {
    'no row for an injection': gb.aim_problems({}, ['row a'], files, ()),
    'a key for no injection': gb.aim_problems({'row z': ['x']}, ['row a'], files, (), complete=False),
    'a title no test holds': gb.aim_problems({'row a': ['a title that cannot exist anywhere']}, ['row a'], files, (), complete=False),
    'control: a real title': gb.aim_problems({'row a': ['accepts a count that names its scope']}, ['row a'], files, ()),
    'writing accepts an empty table': gb.aim_problems({}, ['row a'], files, (), complete=False),
}

# The fewest titles a row's own witnesses need, and the honest fallback when one of
# them is not in any title at all.
MANY = '\\n'.join(['\\u00d7 a first test about the archive', '\\u00d7 a second test about the archive',
                   '\\u00d7 a third test about the metadata', 'Tests  3 failed (9)'])
gb.EXPECTATIONS['cover many'] = ('about the archive', 'about the metadata')
gb.EXPECTATIONS['cover none'] = ('a witness no title holds',)
cover = {
    'fewest': gb.witness_titles('cover many', MANY),
    'unmatchable': gb.witness_titles('cover none', MANY),
}

# The two spellings of one name: what the runner prints, and what -t matches.
patterns = {
    'chain': gb.aim_pattern(['suite · a > a title']),
    'plain': gb.aim_pattern(['a title']),
}

print(json.dumps({
    'calls': aimed_run,
    'status': status,
    'printed': aimed_printed,
    'writingCalls': writing_run,
    'writingStatus': writing_status,
    'table': table,
    'escaped': {
        'pattern': escaped,
        'matchesTitle': bool(re.search(escaped, TITLE)),
        'matchesNeighbour': bool(re.search(escaped, NEIGHBOUR)),
        'rawMatchesTitle': bool(re.search(TITLE, TITLE)),
        'rawMatchesNeighbour': bool(re.search(TITLE, NEIGHBOUR)),
    },
    'named': named,
    'problems': problems,
    'cover': cover,
    'patterns': patterns,
}))
`;

function drive(): Driven {
  const run = spawnSync('python3', ['-c', DRIVER], { cwd: ROOT, encoding: 'utf8' });
  const out = `${run.stdout}${run.stderr}`;
  expect(run.status, out).toBe(0);
  const payload = JSON.parse(out.trim().split('\n').at(-1) ?? 'null');
  return {
    calls: payload.calls,
    writingCalls: payload.writingCalls,
    status: payload.status,
    printed: payload.printed,
    table: payload.table,
    escaped: payload.escaped,
    named: payload.named,
    problems: payload.problems,
    cover: payload.cover,
    patterns: payload.patterns,
  } as Driven;
}

describe('scripts · an injection is aimed at the test that noticed it', () => {
  const driven = drive();

  it('a red aimed run on the named test decides the row in one run', () => {
    // `arm holds` is the case the aim exists for. One call, and it carries a pattern:
    // a second call would mean the row was never decided by its aim, and a call with
    // no pattern would mean the aim was never used.
    const holds = driven.calls.filter((call) => call.arm === 'holds');
    expect(holds).toHaveLength(1);
    expect(holds[0]?.aim, 'the aimed run was not aimed').not.toBeNull();
    expect(driven.status, 'the run did not pass').toBe(0);
  });

  it('a red aimed run on another test falls back to the whole file', () => {
    // The arm that makes the aim safe. The aimed run is red -- which the old battery
    // would have credited -- and the row is decided by a second run with no pattern.
    const other = driven.calls.filter((call) => call.arm === 'other');
    expect(other.map((call) => call.aim === null)).toEqual([false, true]);
  });

  it('a green aimed run falls back to the whole file', () => {
    // The other direction, and the one a reader is most likely to get wrong: a green
    // aimed run is not a survivor, because the tests the aim skipped never ran. It is
    // measured again, and the second run is what decides.
    const green = driven.calls.filter((call) => call.arm === 'green');
    expect(green.map((call) => call.aim === null)).toEqual([false, true]);
  });

  it('the run counts the aims that held and the aims that missed', () => {
    // A witness that has stopped existing looks exactly like a battery that got
    // slower. The two numbers are printed together for that reason, and the reason a
    // miss missed is printed beside them: `no_red` is a renamed title, `unattributed`
    // is a guard no longer pinned, and the repairs are opposite.
    //
    // Read from the driven run's own summary, not from the source: a line that prints
    // the counters is worth nothing if the counters were never incremented, and a
    // counter that is incremented is worth nothing if nothing prints it.
    expect(SOURCE).toContain('aimed_held += 1');
    expect(SOURCE).toContain('aimed_missed += 1');
    expect(SOURCE).toMatch(/aim: \{aimed_held\} held, \{aimed_missed\} missed/);
    expect(driven.printed).toContain('3 caught');
    expect(driven.printed).toContain('aim: 1 held, 2 missed');
    expect(driven.printed).toContain('no_red 1');
    expect(driven.printed).toContain('unattributed 1');
  });

  it('the writing mode aims nothing and records what actually failed', () => {
    // A table built from aimed runs would record its own aim, so a witness renamed
    // away could never be repaired: the run would aim at the stale title, fall back,
    // and write the stale title down again.
    const arms = driven.writingCalls.map((call) => call.aim);
    expect(arms).toHaveLength(3);
    expect(new Set(arms)).toEqual(new Set([null]));
    const table = driven.table as { injections: Record<string, { tests: string[] }> };
    expect(Object.keys(table.injections).sort()).toEqual(['arm green', 'arm holds', 'arm other']);
    // Exactly the two titles `arm other`'s witnesses need, out of the three its
    // whole-file run failed on: the aim has to run both, or the row would come back
    // UNATTRIBUTED for a witness it never gave the runner a chance to fail, and running
    // the third would be a test the verdict does not need.
    expect(table.injections['arm other']?.tests).toEqual([
      'refuses a stale archive',
      'reports every disagreement rather than stopping at the first',
    ]);
    expect(table.injections['arm holds']?.tests).toEqual(['refuses a stale archive']);
  });

  it('the printed name and the name `-t` matches are not the same string', () => {
    // The runner prints a failed test as `suite > suite > title` (`getTestName`, joined
    // with ` > `), and `-t` matches `getTaskFullName`, which joins the same segments with
    // a **space**. Measured on this tree at v3.160, on `check-readme-sample.test.ts`:
    //
    //   | `… good sample > executes a sample block…` | `1 skipped`, `9 skipped` |
    //   | `… good sample executes a sample block…`    | `1 passed | 8 skipped`  |
    //
    // The first table this battery wrote recorded the printed form, and every aim of it
    // missed for exactly that reason: 0 held, 65 missed, each row paying for a run that
    // collected nothing and then for its whole file. So the table keeps the printed form
    // -- it is what a reader greps the log for -- and the pattern drops the separators.
    expect(driven.patterns.chain).toBe('suite · a a title');
    expect(driven.patterns.plain).toBe('a title');
    // And the conversion is load-bearing on the shipped table: without a row whose title
    // carries a ` > `, this test would be about a shape the table never has.
    const table = JSON.parse(readFileSync(TABLE, 'utf8')) as {
      injections: Record<string, { tests: string[] }>;
    };
    const chained = Object.values(table.injections)
      .flatMap((row) => row.tests)
      .filter((title) => title.includes(' > '));
    expect(chained.length, 'no recorded title carries a suite chain, so nothing is converted').toBeGreaterThan(0);
  });

  it('a title is escaped before it becomes a pattern', () => {
    // `--testNamePattern` is a regular expression. Passed through, a title with a
    // parenthesis both misses itself and matches a neighbour that is not it -- which
    // is a filter that quietly widens, the one failure mode the aim must not have.
    expect(driven.escaped.matchesTitle, 'the escaped pattern does not match its own title').toBe(true);
    expect(driven.escaped.matchesNeighbour, 'the escaped pattern matches a different title').toBe(false);
    // And the same title unescaped, which is what the flag would have received: it
    // misses itself and matches its neighbour at once. Both halves are asserted
    // because only the pair shows that escaping is the difference and not the title.
    expect(driven.escaped.rawMatchesTitle, 'the unescaped title matches itself, so nothing was at stake').toBe(false);
    expect(driven.escaped.rawMatchesNeighbour, 'the unescaped title does not widen, so nothing was at stake').toBe(true);
  });

  it('the aim is a list of titles, never the runner’s file-level frames', () => {
    // `failing_tests` also returns `failure in <file>` for a frame whose title it could
    // not read. Aiming at that runs nothing, goes green, and costs a whole file to find
    // out -- so the frames are dropped and the titles are deduplicated.
    expect(driven.named).toEqual(['refuses a stale archive', 'reports every disagreement rather than stopping at the first']);
  });

  it('a row is aimed at as few titles as its own witnesses need', () => {
    // A removed guard often breaks a dozen tests, and recording all twelve would aim the
    // next run at twelve. The verdict needs one failing title per declared witness and
    // no more, so the table keeps that and drops the rest.
    expect(driven.cover.fewest).toEqual([
      'a first test about the archive',
      'a third test about the metadata',
    ]);
    // And the honest fallback: a witness no title contains cannot be reproduced by `-t`,
    // so the row records every failing title rather than a shorter list that could never
    // come back attributed. It costs the aim and not the verdict -- the row falls back to
    // its whole file, which decides it as it always did.
    expect(driven.cover.unmatchable).toHaveLength(3);
  });

  it('the table is reconciled in three ways, with the positive control beside them', () => {
    const problems = driven.problems as unknown as Record<string, string[]>;
    expect(problems['no row for an injection']).toHaveLength(1);
    expect(problems['no row for an injection']?.[0]).toContain('has no witness row');
    expect(problems['a key for no injection']).toHaveLength(1);
    expect(problems['a key for no injection']?.[0]).toContain('is not an injection');
    expect(problems['a title no test holds']).toHaveLength(1);
    expect(problems['a title no test holds']?.[0]).toContain('is not a test title in');
    // A comparator that never reports anything is indistinguishable from one that
    // finds nothing wrong: the real title has to come back clean.
    expect(problems['control: a real title']).toEqual([]);
    expect(problems['writing accepts an empty table']).toEqual([]);
  });
});

describe('scripts · the aim is a flag on the mutant run and nothing else', () => {
  it('the aimed and the whole run differ in exactly one argument', () => {
    // If the two runs differed in more than the pattern, the claim that the aim changes
    // only the price would be a claim about two commands rather than about one.
    const code = codeOf(SOURCE);
    expect(code).toMatch(/\[\*VITEST, test_file, \*\(\[\] if aim is None else \["-t", aim\]\)\]/);
  });

  it('the fallback is a second plan, not a second code path', () => {
    // One loop over `plans` is what keeps the aimed run and the whole run from drifting
    // into two readers of the same output. The list is the statement that an injection
    // with a witness costs two runs at most.
    const code = codeOf(SOURCE);
    expect(code).toMatch(/plans: list\["str \| None"\] = \[aim, None\] if aim is not None else \[None\]/);
    expect(code).toMatch(/if plan is not None and verdict != W\.CAUGHT:/);
  });

  it('the shipped table names a test for every injection but the excused one', () => {
    // The pin that makes the table's growth deliberate: a new injection is a new row,
    // and a row cannot be dropped without a reader deciding to drop it. 65 of the 66
    // injections are aimed; the one that is not is the expected survivor, which has no
    // run to aim at.
    const table = JSON.parse(readFileSync(TABLE, 'utf8')) as {
      injections: Record<string, { tests: string[]; wholeFileMs: number }>;
    };
    const rows = Object.entries(table.injections);
    expect(rows).toHaveLength(65);
    expect(rows.every(([, row]) => row.tests.length > 0)).toBe(true);
    expect(rows.every(([, row]) => typeof row.wholeFileMs === 'number' && row.wholeFileMs > 0)).toBe(true);
    // Every title is a title: a frame would be a row that can never be aimed at.
    expect(rows.flatMap(([, row]) => row.tests).filter((t) => t.startsWith('failure in '))).toEqual([]);
  });

  it('the shipped table reconciles against the shipped injections', () => {
    // The fixtures above drive the comparator; this drives the data. It is the only
    // check that can see a recorded title that a rename has taken away, and it is cheap
    // because the reconciliation never runs a test.
    const run = spawnSync('python3', [BATTERY, '--verify-expectations', '--probe'], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    const out = `${run.stdout}${run.stderr}`;
    expect(run.status, out).toBe(0);
    expect(out).toContain('gate-tests-battery: aim OK (65 injection(s) aimed at a recorded test)');
  });

  it('the table is written by the command that measures whole files', () => {
    // A second command would be a second order of operations; a flag keeps the
    // reconcile-then-measure order identical in both modes.
    expect(SOURCE).toContain('write_witnesses = "--witnesses" in sys.argv');
    expect(SOURCE).toMatch(/aim = None if write_witnesses else aims\.get\(name\)/);
  });
});

describe('scripts · the aim does not make a claim truer', () => {
  it('no verdict is read from a run whose aim skipped the other tests', () => {
    // The rule stated as an absence: the only word an aimed run can earn on its own is
    // CAUGHT. Every other verdict -- including NO_RED and UNATTRIBUTED -- sends the row
    // to its whole file, so an aim that misses cannot be mistaken for a survivor or a
    // stale witness.
    const loop = codeOf(SOURCE).slice(codeOf(SOURCE).indexOf('for plan in plans:'));
    const body = loop.slice(0, loop.indexOf('if decided is None:'));
    expect(body).toContain('if plan is not None and verdict != W.CAUGHT:');
    expect(body).toContain('continue');
  });

  it('every injection has a row, except the one that is excused in writing', () => {
    // The reconciliation is what makes the table's completeness a fact rather than a
    // hope, and the exemption is the same one the verdict table makes: an injection
    // declared to survive has no failing test to aim at.
    const table = JSON.parse(readFileSync(TABLE, 'utf8')) as { injections: Record<string, unknown> };
    const survivors = SOURCE.slice(SOURCE.indexOf('EXPECTED_SURVIVORS: dict[str, str] = {'));
    const excused = [...survivors.slice(0, survivors.indexOf('\n}')).matchAll(/^\s{4}"(.*?)": \(/gm)].map(
      (match) => match[1],
    );
    expect(excused).toHaveLength(1);
    for (const name of excused) {
      expect(Object.keys(table.injections)).not.toContain(name);
    }
  });
});
