import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * A battery's parenthetical counts must be the ones it read, on every machine.
 *
 * ## The measurement that produced this file
 *
 * `scripts/inject-stability.mjs` runs in CI, as the step named "Scorer stability
 * battery". On CI at `f6f7522a` it printed, for all four injections:
 *
 *     CAUGHT  A. non-deterministic: embed a per-call counter in the report  (failed 1, passed 0)
 *     CAUGHT  B. mutates its input: sorts the samples in place             (failed 1, passed 0)
 *     CAUGHT  C. pairs by position instead of by id                        (failed 1, passed 0)
 *     CAUGHT  D. drops the denominator: omits a sample that missed         (failed 1, passed 0)
 *
 * Four mutations that break four different properties cannot fail the same number
 * of tests. Run here, the same battery at the same commit printed
 *
 *     (failed 2, passed 14) / (failed 2, passed 14) / (failed 1, passed 15) / (failed 1, passed 0)
 *
 * `(1, 0)` is the catch arm's default for a summary it could not read. CI leaves
 * colour on, so the summary arrives as
 * `\x1b[2m      Tests \x1b[22m \x1b[1m\x1b[32m21 passed\x1b[39m` and `Tests\s+`
 * walks into `\x1b[22m` instead of into the number. That is the defect finding
 * 147 fixed one file over, in `collected_count`; this file is the same defect in
 * the two batteries that print a count beside their verdict.
 *
 * ## Why the verdicts were still right, and why that is not reassuring
 *
 * The default in the catch arm (`failed: 1`) and the default in the success arm
 * (`failed: 0`) happen to coincide with what the exit status already said, so no
 * injection was ever mis-verdict on account of this. What was wrong is the
 * *evidence*: a number that reads as a measurement and was never measured. The
 * audit's own standard is the one being applied -- finding 147's commit message
 * says it for the Python reader, and the sentence applies unchanged here.
 *
 * ## Why the tests are behavioural, and what they are not
 *
 * The parse was two inline regexes inside an `execSync` wrapper, so nothing could
 * hold it against the bytes CI emits. Both readers now expose the parse, and the
 * assertions below feed them the real captured line rather than a paraphrase: a
 * paraphrase is written by the same person as the fix and tends to be the shape
 * the fix handles.
 *
 * What these tests do *not* do is run either battery. Both mutate a tracked
 * source file and run suites, and running them inside this suite would put a
 * rebuilt artefact under concurrent readers -- the hazard finding 145 was about.
 * The end-to-end check for this repair is the next CI run's own output, where the
 * four rows must stop agreeing with each other.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const STABILITY = resolve(ROOT, 'scripts', 'inject-stability.mjs');
const WORKFLOW_BATTERY = resolve(ROOT, 'scripts', 'injection', 'fault-extraction-workflow.py');
const PY_SOURCE = readFileSync(WORKFLOW_BATTERY, 'utf8');

const FIXTURE = JSON.parse(
  readFileSync(
    resolve(ROOT, 'packages', 'core', 'test', 'fixtures', 'gate-battery-ci-output.json'),
    'utf8',
  ),
) as { shapes: Record<string, string> };

/** The line a CI runner emitted, escapes and all, captured from its own report. */
const CI_SUMMARY = FIXTURE.shapes['REDUNDANT|0|tests_passed'] ?? '';

/** The batteries that walked `out.splitlines()` looking for the summary. */
const LINE_SCANNERS = [
  'scripts/injection/fault-extraction-scoring.py',
  'scripts/injection/fetch-official-retry.py',
] as const;

const scratch = mkdtempSync(join(tmpdir(), 'rca-bench-battery-summary-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

/** Lift a top-level Python function out of a script, by name. */
function extract(source: string, name: string): string {
  const start = source.indexOf(`def ${name}(`);
  // The reader moved into `scripts/injection/_witnesses.py`, which the four
  // batteries share; a name that is not in the script is looked up there, with the
  // module-level patterns it reads. A second copy in each battery is the state this
  // round measured its way out of.
  if (start < 0) {
    const shared = readFileSync(resolve(ROOT, 'scripts', 'injection', '_witnesses.py'), 'utf8');
    const fromShared = shared.indexOf(`def ${name}(`);
    if (fromShared < 0) throw new Error(`no definition of ${name} in either file`);
    const restShared = shared.slice(fromShared + 1);
    const nextShared = restShared.search(/\ndef /);
    const body = shared.slice(fromShared, nextShared < 0 ? undefined : fromShared + 1 + nextShared);
    const constants = shared
      .split('\n')
      .filter((line) => /^(ANSI|TRANSFORM_FAILURE)\b/.test(line))
      .join('\n');
    return `${constants}\n\n${body}`;
  }
  const rest = source.slice(start + 1);
  const next = rest.search(/\ndef /);
  return next < 0 ? source.slice(start) : source.slice(start, start + 1 + next);
}

/** Run the shipped Python helper against a text and return its stdout. */
function runPython(body: string, driver: string): string {
  const dir = mkdtempSync(join(scratch, 'run-'));
  const script = join(dir, 'check.py');
  writeFileSync(script, ['import re, json, sys', '', body, '', driver].join('\n'));
  const result = spawnSync('python3', [script], { encoding: 'utf8', timeout: 30_000 });
  if (result.status !== 0) {
    throw new Error(`python3 exited ${result.status}: ${result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
}

interface Summary {
  failed: number;
  passed: number;
  measured: boolean;
}

interface StabilityModule {
  stripAnsi: (text: string) => string;
  readSummary: (out: string) => { failed: number; passed: number } | null;
  describeOutcome: (result: Summary) => string;
}

async function stability(): Promise<StabilityModule> {
  // `scripts/inject-stability.mjs` guards its side effects behind a direct-call
  // check, so importing it here neither copies the backup nor touches the
  // scorer. Without that guard this import would run the whole battery.
  return (await import(pathToFileURL(STABILITY).href)) as StabilityModule;
}

describe('a battery reports the counts it measured, not its own default', () => {
  it('the captured line is the CI form and it carries an exact total', () => {
    // The premise. If someone "cleans up" the fixture the regression this file
    // guards becomes untestable while these tests stay green, so fidelity is
    // asserted before anything is parsed out of it.
    expect(CI_SUMMARY).toContain('\u001b[');
    expect(CI_SUMMARY).toContain('21 passed');
    // And it is genuinely not the terminal form: `Tests` is not followed by
    // whitespace then a digit.
    expect(/\bTests\s+\d/.test(CI_SUMMARY)).toBe(false);
  });

  it('the Node battery reads 21 out of it instead of falling back to its default', async () => {
    const { readSummary } = await stability();
    expect(readSummary(CI_SUMMARY)).toEqual({ failed: 0, passed: 21 });
  });

  it('the Python battery reads the same 21 out of the same bytes', () => {
    const out = runPython(
      extract(PY_SOURCE, 'parse_summary'),
      [
        `summary = ${JSON.stringify(CI_SUMMARY)}`,
        'print(json.dumps(parse_summary(summary)))',
      ].join('\n'),
    );
    // `[0, 21]`, not `null` and not a sentinel: the two readers must agree with
    // each other about one captured text, because they disagreeing is how this
    // went unnoticed in the first place.
    expect(JSON.parse(out)).toEqual([0, 21]);
  });

  it('every reader of this format agrees with every other, on one captured text', () => {
    // Three readers know this format, in two languages, and finding 147 fixed a
    // fourth. The assertion is deliberately cross-file: the same captured bytes
    // go through each of them and all of them must come back with 21, because a
    // reader that disagrees about one text is exactly the defect below -- and it
    // was invisible while each reader was only ever compared with itself.
    const gateBattery = readFileSync(
      resolve(ROOT, 'scripts', 'injection', 'gate-tests-battery.py'),
      'utf8',
    );
    const out = runPython(
      [extract(gateBattery, 'strip_ansi'), extract(gateBattery, 'collected_count')].join('\n\n'),
      [
        `summary = ${JSON.stringify(CI_SUMMARY)}`,
        'print(collected_count(summary))',
      ].join('\n'),
    );
    expect(Number(out)).toBe(21);
  });

  it('the form a terminal prints still reads, in both languages (control)', async () => {
    // The other direction, so the fix cannot be "strip everything and match
    // loosely". A terminal emits `      Tests  2 failed | 14 passed (16)`.
    const { readSummary } = await stability();
    expect(readSummary('      Tests  2 failed | 14 passed (16)')).toEqual({ failed: 2, passed: 14 });
    expect(readSummary('      Tests  21 passed (21)')).toEqual({ failed: 0, passed: 21 });

    const out = runPython(
      extract(PY_SOURCE, 'parse_summary'),
      [
        `plain = ${JSON.stringify('      Tests  2 failed | 14 passed (16)')}`,
        'print(json.dumps(parse_summary(plain)))',
      ].join('\n'),
    );
    expect(JSON.parse(out)).toEqual([2, 14]);
  });

  it('a summary that could not be read is named as unreadable, not printed as a count', async () => {
    // The defect stated positively. `(failed 1, passed 0)` is the shape a reader
    // takes for a measurement; the repair must not print a number it did not
    // read, whatever the verdict is.
    const { readSummary, describeOutcome } = await stability();
    expect(readSummary('no tests ran')).toBeNull();
    expect(readSummary('')).toBeNull();

    const unread = describeOutcome({ failed: 1, passed: 0, measured: false });
    expect(unread).toMatch(/no summary/i);
    expect(unread).not.toContain('failed 1');
    expect(unread).not.toContain('passed 0');

    // And when a summary was read, the parenthetical is the pair read.
    expect(describeOutcome({ failed: 2, passed: 14, measured: true })).toBe('(failed 2, passed 14)');
  });

  it('the two batteries that scan the summary line by hand read a failure count from it', () => {
    // These two did not use a regex at all. They walked `out.splitlines()` and
    // tested `stripped.startswith("Tests ")`, which is false when the line begins
    // with `\x1b[2m` -- so on CI the branch was never entered, `failed` stayed 0,
    // and 0 is those batteries' `SURVIVED` condition. Every injection would have
    // been reported as a hole in the suite, and nothing would have said so,
    // because neither file has a caller (see the sibling test file for that).
    //
    // The escapes used below are the captured ones and the assertion says so: the
    // `\x1b[22m` and `\x1b[32m` come from the fixture. Only the count is
    // substituted, because no *failing* summary was captured -- a terminal here
    // emits no escapes, and the CI runs that failed failed in the coverage step,
    // whose log holds no summary line. The substitution is stated rather than
    // hidden, and the escape sequences are checked to be the captured ones. A
    // second captured all-passing line adds no discriminating power, which is why
    // the fixture holds one shape per role rather than one per observation.
    const failing = CI_SUMMARY.replace('21 passed', '3 failed | 12 passed').replace(
      '(21)',
      ' (15)',
    );
    expect(failing).toContain('\u001b[22m');
    expect(failing).toContain('\u001b[32m');
    expect(failing).toContain('3 failed | 12 passed');

    for (const file of LINE_SCANNERS) {
      const source = readFileSync(resolve(ROOT, file), 'utf8');
      const helpers = [extract(source, 'strip_ansi'), extract(source, 'parse_failed_count')].join(
        '\n\n',
      );

      // The failing form reads 3. Pre-fix this returned 0, which the battery
      // prints as `SURVIVED`.
      const caught = runPython(
        helpers,
        [
          `text = ${JSON.stringify(failing)}`,
          'print(json.dumps(parse_failed_count(text)))',
        ].join('\n'),
      );
      expect(JSON.parse(caught), `${file} did not read the failure count`).toBe(3);

      // The captured passing form reads 0 -- a measurement, not a default.
      const green = runPython(
        helpers,
        [
          `text = ${JSON.stringify(CI_SUMMARY)}`,
          'print(json.dumps(parse_failed_count(text)))',
        ].join('\n'),
      );
      expect(JSON.parse(green), `${file} did not read the passing run as zero`).toBe(0);

      // And a run that printed no summary is `null`, not 0: the caller must not
      // read silence as a survivor.
      const silent = runPython(
        helpers,
        ['print(json.dumps(parse_failed_count("no summary in this text")))'].join('\n'),
      );
      expect(JSON.parse(silent), `${file} read silence as a count`).toBeNull();
    }
  });

  it('exactly one place in the Node battery knows the summary format', async () => {
    // Two inline copies of the regex is what produced two wrong call sites. The
    // count is taken over the *regex literal* -- `/Tests\s+` with its delimiter --
    // so prose about the pattern is not counted; a third copy added later is the
    // regression, and it would be added outside `readSummary`.
    const source = readFileSync(STABILITY, 'utf8');
    const readers = source.match(/\/Tests\\s\+/g) ?? [];
    expect(readers.length).toBe(1);
    expect(source).toContain('export function readSummary');
    // And the runner that used to hold the copies does not hold one now.
    const runSuite = source.slice(source.indexOf('function runSuite()'));
    expect(runSuite.slice(0, runSuite.indexOf('const injections'))).not.toContain('/Tests');
  });

  it('the escapes the fixture holds are the ones the stripper removes', async () => {
    // A guard on the stripper itself: the pattern must cover the SGR forms the
    // runner actually emits, including the `\x1b[22m` that sits between `Tests`
    // and the number, and it must leave the visible text untouched.
    const { stripAnsi } = await stability();
    expect(stripAnsi(CI_SUMMARY)).toContain('Tests  21 passed');
    expect(stripAnsi(CI_SUMMARY)).not.toContain('\u001b');
    expect(stripAnsi('plain text 1, 2; 3')).toBe('plain text 1, 2; 3');
  });
});
