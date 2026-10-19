import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * Two readers of one number, held against the same run.
 *
 * `docs/progress.md` publishes how many test files and tests the suite has, and
 * `golden-master/doc-counts.json` is the measurement those rows are checked
 * against. Until pass 57 that measurement was only ever taken by spawning the
 * suite three times -- **80 seconds** -- which is why CI never compared the
 * snapshot to anything: pass 54 wired a second `docs:counts:check` step into the
 * same job and the runner refused it with `[vitest-worker]: Timeout calling
 * "onTaskUpdate"` while every test passed.
 *
 * `--from` reads vitest's own JSON report instead, which the coverage step
 * already produces. That makes this file necessary rather than nice: counting
 * files and assertions from a report is a **second definition of "a passing
 * test"**, and this repository has twice shipped two green numbers that
 * disagreed. So both readers are held against one captured run.
 *
 * The fixtures are real captures, not hand-written JSON:
 *
 *   packages/core/test/fixtures/vitest-report-core-sample.json
 *     `npx vitest run test/time.test.ts --reporter=default --reporter=json`
 *     stdout: `Test Files  1 passed (1)` / `Tests  20 passed (20)`
 *   packages/core/test/fixtures/vitest-report-cli-sample.json
 *     `npx vitest run test/run.test.ts --reporter=default --reporter=json` in
 *     `packages/cli`; stdout: `Test Files  1 passed (1)` / `Tests  135 passed (135)`
 *
 * Their `testResults[].name` fields are the repository-relative paths, because a
 * fixture carrying this machine's absolute path would fail
 * `check-no-absolute-paths` and could not follow the repository anywhere. The
 * test makes them absolute again the way vitest does, in a scratch copy.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SCRIPT = resolve(ROOT, 'scripts', 'measure-doc-counts.mjs');
const FIXTURES = resolve(ROOT, 'packages', 'core', 'test', 'fixtures');
const scratch = mkdtempSync(join(tmpdir(), 'rca-bench-counts-readings-'));

interface Counts {
  files: number;
  tests: number;
}

/**
 * The script, loaded rather than imported as a module.
 *
 * Same shape as `battery-summary-survives-ci-output.test.ts` and for the same
 * reason: `scripts/*.mjs` are not part of any TypeScript program, so the import
 * is a runtime one with the surface declared here. `measure-doc-counts.mjs`
 * guards its work behind a direct-call check, so this neither spawns three
 * suites nor rewrites the committed measurement.
 */
const library = (await import(pathToFileURL(SCRIPT).href)) as {
  COUNT_UNAVAILABLE: string;
  countsFromReports: (paths: string[]) => Record<'core' | 'cli' | 'repo', Counts>;
  parseSummary: (out: string, scope: string) => Counts;
};
const { countsFromReports, parseSummary } = library;
const COUNT_UNAVAILABLE = library.COUNT_UNAVAILABLE;

afterAll(() => rmSync(scratch, { recursive: true, force: true }));

/** The summary lines the two captured runs printed, byte for byte. */
const CORE_SUMMARY = ' Test Files  1 passed (1)\n      Tests  20 passed (20)\n';
const CLI_SUMMARY = ' Test Files  1 passed (1)\n      Tests  135 passed (135)\n';

/**
 * The same run, failed -- in vitest's own layout.
 *
 * `failed` comes first on both lines, which is the whole reason the transcript
 * reader never counted a red run: its pattern is anchored on `passed`.
 */
const RED_SUMMARY = ' Test Files  1 failed (1)\n      Tests  2 failed | 19 passed (21)\n';

let counter = 0;

/**
 * A report on disk, with the fixture's relative names made absolute.
 *
 * `edit` may rewrite the parsed report, which is how the rules about skipped
 * assertions and failed files are driven: they are applied to a *real* capture
 * rather than to a shape invented for the test.
 */
/** Run something that must refuse, and return the refusal's own lines. */
function refuse(work: () => unknown): { name: string; lines: string[] } {
  try {
    work();
  } catch (error) {
    const refusal = error as { name?: string; lines?: string[] };
    return { name: String(refusal.name), lines: refusal.lines ?? [] };
  }
  throw new Error('expected a refusal, but the call returned a count');
}

function report(fixture: 'core' | 'cli', edit?: (report: Report) => void): string {
  counter += 1;
  const parsed = JSON.parse(
    readFileSync(resolve(FIXTURES, `vitest-report-${fixture}-sample.json`), 'utf8'),
  ) as Report;
  for (const result of parsed.testResults) result.name = resolve(ROOT, result.name);
  edit?.(parsed);
  const path = join(scratch, `report-${String(counter)}.json`);
  writeFileSync(path, JSON.stringify(parsed));
  return path;
}

interface Assertion {
  status: string;
  title?: string;
  fullName?: string;
}

interface Result {
  name: string;
  status: string;
  assertionResults?: Assertion[];
}

interface Report {
  testResults: Result[];
}

describe('the summary line and the report agree about one run', () => {
  it('reads the same file and test counts from the summary as from the report', () => {
    // Both halves come from the same captured run, so this is not two
    // measurements -- it is one measurement read two ways, which is exactly the
    // claim `--from` makes when it replaces the spawn in CI.
    expect(parseSummary(CORE_SUMMARY, 'core')).toEqual({ files: 1, tests: 20 });
    expect(parseSummary(CLI_SUMMARY, 'cli')).toEqual({ files: 1, tests: 135 });

    expect(countsFromReports([report('core'), report('cli')])).toEqual({
      core: { files: 1, tests: 20 },
      cli: { files: 1, tests: 135 },
      repo: { files: 2, tests: 155 },
    });
  });

  it('counts only what passed, which is what the summary line counts', () => {
    // `Tests N passed` prints the passed count and separates skipped ones, so a
    // reader that counted every assertion in the report would be reading a
    // different number under the same name.
    // The summary prints the passed count and reports skipped ones beside it;
    // the report records them as assertions with status `skipped`. A reader that
    // counted every assertion would be reading a larger number under the same
    // name.
    expect(parseSummary(' Test Files  1 passed (1)\n      Tests  19 passed | 1 skipped (20)\n', 'core')).toEqual({
      files: 1,
      tests: 19,
    });
  });

  it('does not count a skipped assertion as a pass', () => {
    const editSkipped = report('core', (parsed) => {
      (parsed.testResults[0]!.assertionResults ?? [])[0]!.status = 'skipped';
    });
    expect(countsFromReports([editSkipped, report('cli')]).core).toEqual({ files: 1, tests: 19 });
  });

  it('refuses a report of a red run instead of counting the half that passed', () => {
    // This file used to assert the opposite: a failed file was said to count as
    // zero *files* while its passing assertions still counted as *tests*, and
    // that number was published. It is neither of the two readings vitest prints
    // -- `N failed | M passed` is what a reader sees -- it is the passing half of
    // both, which nothing prints. The spawn path refuses such a run with
    // `COUNT_UNAVAILABLE`; the report path publishing a number for it made the
    // tool contradict itself in the one direction that writes to a document.
    const red = report('core', (parsed) => {
      parsed.testResults[0]!.status = 'failed';
    });
    const refusal = refuse(() => countsFromReports([red, report('cli')]));
    expect(refusal.lines.join('\n')).toContain('records a failure, so it is not a measurement');
    expect(refusal.lines.join('\n')).toContain('time.test.ts');
    expect(refusal.lines.join('\n')).toContain(COUNT_UNAVAILABLE);
  });

  it('refuses a failing assertion in a file that calls itself passed', () => {
    // The report format lets the two disagree, and only one of them is read by
    // anything else here. Checking the file status alone would call this report
    // green and publish the count of the assertions that survived.
    const red = report('core', (parsed) => {
      const assertions = parsed.testResults[0]!.assertionResults ?? [];
      assertions[0]!.status = 'failed';
      assertions[0]!.fullName = 'time.parse > reads an offset';
    });
    const refusal = refuse(() => countsFromReports([red, report('cli')]));
    expect(refusal.name).toBe('ReportRecordsFailures');
    expect(refusal.lines.join('\n')).toContain('time.test.ts > time.parse > reads an offset');
  });

  it('caps the list and names an assertion however the report spells it', () => {
    // Three spellings, all of which a vitest report can contain: `fullName` for a
    // nested test, `title` alone, and neither -- a collection error. Dropping the
    // last two would leave a line that says a file failed without saying where.
    // The cap is five, as in the run diagnosis, because the point is to name the
    // work rather than to reproduce the report.
    const red = report('core', (parsed) => {
      const assertions = parsed.testResults[0]!.assertionResults ?? [];
      assertions[0]!.status = 'failed';
      assertions[0]!.title = 'reads an offset';
      assertions[0]!.fullName = undefined;
      assertions[1]!.status = 'failed';
      assertions[1]!.title = undefined;
      assertions[1]!.fullName = undefined;
      for (let index = 2; index < 9; index += 1) {
        assertions[index]!.status = 'failed';
        assertions[index]!.fullName = `case ${String(index)}`;
      }
    });
    const lines = refuse(() => countsFromReports([red, report('cli')])).lines.join('\n');
    expect(lines).toContain('time.test.ts > reads an offset');
    expect(lines).toContain('time.test.ts > an unnamed assertion');
    expect(lines).toContain('case 2');
    expect(lines).not.toContain('case 7');
    expect(lines).toContain('… and 4 more');
  });

  it('names each failing file once, however many assertions failed in it', () => {
    // A collection error gives a file with no assertions at all; a normal failure
    // gives a file with several failing ones. Both have to produce one line per
    // file, because the file is what someone opens.
    const red = report('core', (parsed) => {
      parsed.testResults[0]!.status = 'failed';
      for (const assertion of parsed.testResults[0]!.assertionResults ?? []) {
        assertion.status = 'failed';
      }
    });
    const lines = refuse(() => countsFromReports([red, report('cli')])).lines.join('\n');
    expect(lines.match(/time\.test\.ts/g)).toHaveLength(1);
  });

  it('attributes each file to the package that owns it, and repo to all of them', () => {
    const both = countsFromReports([report('core'), report('cli')]);
    expect(both.core.tests + both.cli.tests).toBe(both.repo.tests);
    expect(both.repo.files).toBe(both.core.files + both.cli.files);
  });
});

describe('the transcript reading, held to the same verdict', () => {
  it('refuses a red summary instead of calling it an unreadable format', () => {
    // Before this, a red transcript fell through to the "could not read" branch and
    // was reported as a possible change to vitest's output format. The counts were
    // unreadable; the diagnosis was wrong, and it sent a reader to the wrong file.
    const refusal = refuse(() => parseSummary(RED_SUMMARY, 'core'));
    expect(refusal.name).toBe('TranscriptRecordsFailures');
    const text = refusal.lines.join('\n');
    expect(text).toContain('records a failing run');
    expect(text).toContain('1 test file(s) failed, 2 test(s) failed');
    expect(text).toContain(COUNT_UNAVAILABLE);
    expect(text).not.toContain('summary format');
  });

  it('refuses a green block that is followed by a red one, instead of returning the green half', () => {
    // The reachable shape: `pnpm test` is `core && cli`, so a transcript can hold
    // one block that passed and one that did not. The anchored pattern matched the
    // first and stopped, which returned 1 file and 20 tests for a run in which a
    // file failed -- the same silent dropping `--from` was doing, one format over.
    const mixed = `${CORE_SUMMARY} Test Files  1 failed (1)\n      Tests  2 failed | 3 passed (5)\n`;
    const refusal = refuse(() => parseSummary(mixed, 'repo'));
    expect(refusal.name).toBe('TranscriptRecordsFailures');
    expect(refusal.lines.join('\n')).toContain('1 test file(s) failed, 2 test(s) failed');
  });

  it('says the format may have changed only when there is no summary at all', () => {
    const refusal = refuse(() => parseSummary('nothing that looks like a summary\n', 'core'));
    expect(refusal.name).toBe('MeasurementUnavailable');
    expect(refusal.lines.join('\n')).toContain('vitest may have changed its summary format');
  });

  it('neither reader yields a count for a red record, and both say why in one sentence', () => {
    // Two mechanisms, one conclusion. The transcript reader cannot match a red
    // line; the report reader can, and has to refuse. The sentence is shared so
    // that a reader who meets either one recognises the other.
    const transcript = refuse(() => parseSummary(RED_SUMMARY, 'core'));
    const red = report('core', (parsed) => {
      parsed.testResults[0]!.status = 'failed';
    });
    const record = refuse(() => countsFromReports([red, report('cli')]));
    expect(transcript.lines).toContain(COUNT_UNAVAILABLE);
    expect(record.lines).toContain(COUNT_UNAVAILABLE);
    expect(transcript.name).not.toBe(record.name);
  });
});

describe('what --from refuses', () => {
  const run = (args: string[]): { status: number | null; stderr: string } => {
    const result = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
    return { status: result.status, stderr: result.stderr };
  };

  it('names a test file that belongs to no workspace package', () => {
    // A file nothing owns cannot be attributed, so the count would be short by
    // however many tests it holds -- and a short count is the defect this whole
    // path exists to catch.
    const stray = report('core', (parsed) => {
      parsed.testResults[0]!.name = resolve(ROOT, 'somewhere', 'else.test.ts');
    });
    const outcome = run(['--check', '--from', stray]);
    expect(outcome.status, outcome.stderr).not.toBe(0);
    expect(outcome.stderr).toContain('outside every workspace package');
    expect(outcome.stderr).toContain('else.test.ts');
  });

  it('names a package that declares tests and contributed none', () => {
    // The failure the spawn path cannot see: `pnpm test` runs whatever the root
    // script filters to, and that filter is a hand-written copy of the workspace
    // list. A third package would be counted by neither and noticed by nothing.
    const outcome = run(['--check', '--from', report('core')]);
    expect(outcome.status, outcome.stderr).not.toBe(0);
    expect(outcome.stderr).toContain('contributed no test file');
    expect(outcome.stderr).toContain('@rca-bench-factory/cli');
  });

  it('names a report that is missing rather than measuring around it', () => {
    const outcome = run(['--check', '--from', join(scratch, 'absent.json')]);
    expect(outcome.status, outcome.stderr).not.toBe(0);
    expect(outcome.stderr).toContain('no vitest report at');
  });

  it('refuses a report of a red run, and does not go on to compare it', () => {
    // The comparison is meaningless for a red run, so the message must be about
    // the run rather than about the committed snapshot being stale. Printing
    // "stale" here would send a reader to update a file with a number that does
    // not exist.
    const red = report('core', (parsed) => {
      parsed.testResults[0]!.status = 'failed';
    });
    const outcome = run(['--check', '--from', `${red},${report('cli')}`]);
    expect(outcome.status, outcome.stderr).not.toBe(0);
    expect(outcome.stderr).toContain('records a failure, so it is not a measurement');
    expect(outcome.stderr).toContain(COUNT_UNAVAILABLE);
    expect(outcome.stderr).not.toContain('is stale');
    expect(outcome.stderr).not.toContain('OK (');
  });

  it('refuses a file that is not a report at all', () => {
    const path = join(scratch, 'not-a-report.json');
    writeFileSync(path, '{"tests": 3}');
    const outcome = run(['--check', '--from', path]);
    expect(outcome.status, outcome.stderr).not.toBe(0);
    expect(outcome.stderr).toContain('has no testResults array');
  });
});
