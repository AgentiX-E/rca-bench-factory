import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

/**
 * What the two probe batteries pay, and what they charge it to.
 *
 * ## The defect this file is about
 *
 * `batteries-heavy` held the workflow's wall clock for a whole round -- 761 s of a
 * 771 s run -- and nothing on that job could say where its time went. The report
 * said `379 s` and `360 s`, which is the step's wall clock, and a total is not a
 * measurement (finding 657): two batteries, 157 runs and 114 compiles were
 * reported as two numbers.
 *
 * Instrumenting them found two things the totals had been hiding, and both are
 * *purchases of nothing* rather than slow work:
 *
 *   1. `backend-support` ran each mutation against its whole test file. The claim
 *      a row makes is about one named test, and 83 whole-file runs cost 379 s to
 *      measure 83 one-test claims (finding 658).
 *   2. `type-miss-probe` compiled `packages/core` twice per in-package injection --
 *      once to install the mutation and once to put the committed rule back -- and
 *      the next injection's build then overwrote the second one. 114 compiles for
 *      57 measurements, 360 s (finding 659).
 *
 * Both repairs are cheap to state and easy to undo by accident, which is what this
 * file holds: the argv each run uses, and the number of compiles a sequence of
 * injections costs. Neither assertion is about speed. They are about *what the run
 * asks the tool to do*, which is the part that can silently drift back.
 */
const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');

const pythonJson = (script: string): unknown =>
  JSON.parse(
    execFileSync('python3', ['-c', script], { cwd: REPO_ROOT, encoding: 'utf8' }),
  );

describe('a battery run asks for the claim it is making, and nothing else', () => {
  /**
   * The bracket name is the reason `re.escape` is load-bearing rather than tidy.
   *
   * `--testNamePattern` compiles its argument as a regular expression, and one of
   * the 83 names contains `[timestamp, line]` -- a character class. Unescaped, the
   * pattern requires one character from that class between `is not a ` and
   * ` pair,`, so it matches nothing, and a mutation that was caught perfectly well
   * would be reported MISATTRIBUTED. The assertion below measures both directions
   * on the real name rather than on a name invented for the test.
   */
  it('passes the named test as an escaped pattern, so a bracketed name still matches', () => {
    const measured = pythonJson(`
import importlib.util, json, re
spec = importlib.util.spec_from_file_location(
    'battery', ${JSON.stringify(resolve(REPO_ROOT, 'scripts/injection/backend-support.py'))})
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

name = ('quarantines a line that is not a [timestamp, line] pair, '
        'naming what the extra element would be')
calls = []
class Result:
    returncode = 0
    stdout = ''
    stderr = ''
m.subprocess.run = lambda argv, **kw: (calls.append(argv), Result())[1]
m.run_tests('test/clickhouse.test.ts', name)

argv = calls[0]
pattern = argv[argv.index('--testNamePattern') + 1]
print(json.dumps({
    'argv': argv,
    'pattern': pattern,
    'asksForTheFile': 'test/clickhouse.test.ts' in argv,
    'escapedMatches': re.search(pattern, name) is not None,
    'rawMatches': re.search(name, name) is not None,
}))
`);
    expect(measured).toMatchObject({
      asksForTheFile: true,
      escapedMatches: true,
      rawMatches: false,
    });
    // The escaped pattern is the name itself once the escaping is undone, which is
    // the statement that it is still *this* test being asked for.
    const { argv, pattern } = measured as { argv: string[]; pattern: string };
    expect(pattern).not.toBe(
      'quarantines a line that is not a [timestamp, line] pair, naming what the extra element would be',
    );
    expect(pattern.replace(/\\(.)/g, '$1')).toBe(
      'quarantines a line that is not a [timestamp, line] pair, naming what the extra element would be',
    );
    // One file, not the package: the filter is what keeps the run from becoming a
    // suite run and the battery from becoming a second `test:coverage`.
    expect(argv.filter((part) => part.endsWith('.test.ts'))).toHaveLength(1);
  });

  /**
   * Two in-package injections, two compiles.
   *
   * The restore compile is deferred rather than deleted: `dist` must reflect the
   * committed rule before anything reads it, and nothing reads it between two
   * injections that each compile their own mutation. The four numbers below are
   * the whole contract -- 1, 2, 3, 3 -- and the fourth is the one that matters
   * most: `flush_dist` on a clean tree must not compile, or `atexit` would pay for
   * a build at the end of every run that already paid it.
   *
   * Measured by replacing the two effects -- the compiler and the probe -- with
   * counters, so this asserts the *schedule* rather than the seconds. A battery
   * whose cost is asserted in seconds goes red on a slower runner; a battery whose
   * schedule is asserted here goes red on the commit that reintroduces the double
   * build.
   */
  it('compiles once per in-package injection, and once more when a reader needs the committed rule', () => {
    const measured = pythonJson(`
import importlib.util, json, pathlib, tempfile
spec = importlib.util.spec_from_file_location(
    'battery', ${JSON.stringify(resolve(REPO_ROOT, 'scripts/injection/type-miss-probe.py'))})
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

builds = []
m.build_core = lambda: builds.append(1)
class Report:
    returncode = 0
    stdout = '{"totals": {}}'
    stderr = ''
m._run_json_probe = lambda script: Report()

with tempfile.TemporaryDirectory() as tmp:
    # The battery's own inputs are pointed at the temporary directory for the same
    # reason the compiler and the probe are replaced: a test that wrote
    # scripts/probe-type-misses.mjs back over itself would be a test writing inside
    # the package it tests, which no-writes-in-package.test.ts refuses and is right
    # to.
    tmp = pathlib.Path(tmp)
    m.PROBE = tmp / 'probe.mjs'
    m.FIXTURE = tmp / 'fixture.json'
    m.PROBE.write_text('the probe')
    m.FIXTURE.write_text('the fixture')
    a = tmp / 'a.ts'
    b = tmp / 'b.ts'
    a.write_text('committed a')
    b.write_text('committed b')
    m.run_probe(in_package='mutated a', in_package_path=a)
    after_first = len(builds)
    m.run_probe(in_package='mutated b', in_package_path=b)
    after_second = len(builds)
    # A probe-only injection reads the package as committed, so the compile the
    # previous restore deferred is paid here rather than after it.
    m.run_probe()
    after_reader = len(builds)
    m.flush_dist()
    after_flush = len(builds)
    stale = m._STALE_DIST[0] is not None

print(json.dumps({
    'afterFirst': after_first,
    'afterSecond': after_second,
    'afterReader': after_reader,
    'afterFlush': after_flush,
    'stale': stale,
}))
`);
    expect(measured).toEqual({
      afterFirst: 1,
      afterSecond: 2,
      afterReader: 3,
      afterFlush: 3,
      stale: false,
    });
  });

  /**
   * The backstop, measured by letting a process die on it.
   *
   * `flush_dist` is called explicitly at the end of the battery, so the compile that
   * the deferral owes is normally paid before the restore check reads the tree. What
   * that call cannot cover is a run that never reaches it -- an injection raising, a
   * guard calling `sys.exit` -- and the state it leaves is the worst one available: a
   * `dist` compiled from a mutation, with no dossier of it anywhere, because
   * `_witnesses` journals the *source* files and not the build output.
   *
   * So the module registers the same function with `atexit`, and this case is the
   * proof that the registration is there: a child imports the battery, marks the
   * package stale, and exits *without* calling `flush_dist`. The marker the patched
   * compiler writes is the measurement. Remove the registration and the marker is
   * absent -- which is the only way this line can be shown to do anything, since on
   * every successful run it is a no-op by construction.
   */
  it('compiles on the way out of a process that never reached the end of the battery', () => {
    const marker = join(mkdtempSync(join(tmpdir(), 'flush-dist-')), 'compiled');
    const measured = pythonJson(`
import importlib.util, json, pathlib, sys
spec = importlib.util.spec_from_file_location(
    'battery', ${JSON.stringify(resolve(REPO_ROOT, 'scripts/injection/type-miss-probe.py'))})
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

marker = pathlib.Path(${JSON.stringify(marker)})
m.build_core = lambda: marker.write_text('compiled')
m._STALE_DIST[0] = pathlib.Path('a source that is not committed')
print(json.dumps({'exiting': True}))
# No flush: atexit is the only thing that can pay the compile from here.
sys.exit(0)
`);
    expect(measured).toEqual({ exiting: true });
    expect(existsSync(marker)).toBe(true);
    rmSync(dirname(marker), { recursive: true, force: true });
  });
});
