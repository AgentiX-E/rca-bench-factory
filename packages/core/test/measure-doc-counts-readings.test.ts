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
  countsFromReports: (paths: string[]) => Record<'core' | 'cli' | 'repo', Counts>;
  parseSummary: (out: string, scope: string) => Counts;
};
const { countsFromReports, parseSummary } = library;

afterAll(() => rmSync(scratch, { recursive: true, force: true }));

/** The summary lines the two captured runs printed, byte for byte. */
const CORE_SUMMARY = ' Test Files  1 passed (1)\n      Tests  20 passed (20)\n';
const CLI_SUMMARY = ' Test Files  1 passed (1)\n      Tests  135 passed (135)\n';

let counter = 0;

/**
 * A report on disk, with the fixture's relative names made absolute.
 *
 * `edit` may rewrite the parsed report, which is how the rules about skipped
 * assertions and failed files are driven: they are applied to a *real* capture
 * rather than to a shape invented for the test.
 */
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

  it('does not count a skipped assertion or a failed file as a pass', () => {
    const editSkipped = report('core', (parsed) => {
      (parsed.testResults[0]!.assertionResults ?? [])[0]!.status = 'skipped';
    });
    expect(countsFromReports([editSkipped, report('cli')]).core).toEqual({ files: 1, tests: 19 });

    const editFailed = report('core', (parsed) => {
      parsed.testResults[0]!.status = 'failed';
    });
    expect(countsFromReports([editFailed, report('cli')]).core.files).toBe(0);
  });

  it('attributes each file to the package that owns it, and repo to all of them', () => {
    const both = countsFromReports([report('core'), report('cli')]);
    expect(both.core.tests + both.cli.tests).toBe(both.repo.tests);
    expect(both.repo.files).toBe(both.core.files + both.cli.files);
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

  it('refuses a file that is not a report at all', () => {
    const path = join(scratch, 'not-a-report.json');
    writeFileSync(path, '{"tests": 3}');
    const outcome = run(['--check', '--from', path]);
    expect(outcome.status, outcome.stderr).not.toBe(0);
    expect(outcome.stderr).toContain('has no testResults array');
  });
});
