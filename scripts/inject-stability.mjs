#!/usr/bin/env node
/**
 * Injection battery for the four stability properties.
 *
 * Each injection mutates the SHIPPED scorer in a way that a reader could plausibly
 * write, then runs the new suite. A property that survives its own injection is
 * not a test -- it is a comment.
 */
import { execSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * Paths are resolved from this script's own location, never hard-coded.
 *
 * The first version of this file used the absolute path of the machine it was
 * written on. That passed locally on every run and failed the first time it ran
 * in CI -- `copyFileSync` on a path that does not exist there -- which is the
 * exact local-green/CI-red drift the repository's gates exist to prevent, and it
 * was introduced by a script whose whole purpose is catching that class of
 * problem. Resolving from `import.meta.url` is the only form that cannot drift:
 * a battery that only works on the author's checkout cannot gate anything.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const SRC = resolve(REPO, 'packages/core/src/fault/extraction-scoring.ts');
const BAK = resolve(REPO, 'node_modules/.cache/extraction-scoring.bak.ts');

/**
 * Remove the SGR escape sequences vitest emits when colour is on.
 *
 * CI leaves colour on even though the child's stdout is a pipe, so the runner's
 * summary arrives as
 *
 *     \x1b[2m      Tests \x1b[22m \x1b[1m\x1b[32m21 passed\x1b[39m ...
 *
 * where a terminal emits `      Tests  21 passed (21)`. The escape sits exactly
 * where a pattern needs whitespace, and `Tests\s+` therefore walks into
 * `\x1b[22m` and stops. Stripping first is what makes the two places agree.
 *
 * The bytes this is asserted against were captured from a CI run's own battery
 * report and are stored, escapes intact, in
 * `packages/core/test/fixtures/gate-battery-ci-output.json`.
 */
export function stripAnsi(text) {
  // eslint-disable-next-line no-control-regex
  return String(text).replace(/\u001b\[[0-9;]*m/g, '');
}

/**
 * The counts vitest printed for one run, or `null` when it printed none.
 *
 * ## Why this is a function rather than two inline regexes
 *
 * It was two inline regexes, one in each arm of `runSuite`'s try/catch, and on
 * CI neither ever matched: the escapes above sit between `Tests` and the number.
 * Both arms therefore fell through to their defaults, and the battery printed
 * the same fabricated pair for every injection. The measurement is in
 * `battery-summary-survives-ci-output.test.ts`; the reason the parse is extracted
 * here is that a regex which only ever runs inside `execSync` cannot be held
 * against the bytes CI actually produces.
 */
export function readSummary(out) {
  const m = /Tests\s+(?:(\d+) failed \| )?(\d+) passed/.exec(stripAnsi(out));
  return m === null ? null : { failed: m[1] ? Number(m[1]) : 0, passed: Number(m[2]) };
}

/**
 * The parenthetical this battery prints for one injection.
 *
 * A default that reads like a count is the defect this file was repaired for:
 * `(failed 1, passed 0)` was printed for mutations whose suite reported no
 * summary at all, and a reader takes `1` for a measurement. When nothing was
 * read the line says so instead. The verdict is unaffected either way -- it comes
 * from the child's exit status, which is why the verdicts stayed correct while
 * the evidence printed beside them was invented.
 */
export function describeOutcome(result) {
  return result.measured
    ? `(failed ${result.failed}, passed ${result.passed})`
    : '(no summary in its output; verdict taken from the exit status)';
}

/**
 * Run the suite once, and report both the verdict's input and what was measured.
 *
 * `measured: false` means no summary could be read. The `failed` default still
 * decides the verdict and is deliberately kept, because a non-zero exit means the
 * suite failed whatever its output looked like. What changed is that the default
 * is no longer *printed as though it had been read*.
 */
function runSuite() {
  const attempt = (out, failedIfUnread) => {
    const summary = readSummary(out);
    return summary === null
      ? { failed: failedIfUnread, passed: 0, measured: false }
      : { ...summary, measured: true };
  };
  try {
    const out = execSync(
      'pnpm exec vitest run --root packages/core extraction-miss-diagnosis.test.ts 2>&1',
      { cwd: REPO, encoding: 'utf8' },
    );
    return attempt(String(out), 0);
  } catch (e) {
    return attempt(String(e.stdout || '') + String(e.stderr || ''), 1);
  }
}

const injections = [
  {
    name: 'A. non-deterministic: embed a per-call counter in the report',
    apply(t) {
      // Plausible-looking: "tag each report with a run id". Breaks byte-identical
      // repeat calls, which is exactly what the determinism property asserts.
      //
      // Anchored on the real `return {` shape (verified against the source; the
      // first attempt at this injection silently did not apply, which the battery
      // reported as SURVIVED -- an inert injection is a false survivor, so the
      // script now prints SKIP when an anchor fails rather than reading as a pass).
      const patched = t
        .replace(
          'export function buildExtractionReport(',
          'let __reportSerial = 0;\nexport function buildExtractionReport(',
        )
        .replace(
          '\n  return {\n    total,\n    counts,',
          '\n  __reportSerial += 1;\n  return {\n    serial: __reportSerial,\n    total,\n    counts,',
        );
      return patched;
    },
  },
  {
    name: 'B. mutates its input: sorts the samples in place',
    apply(t) {
      return t.replace(
        /(\n\s*)(const paired = samples\.map)/,
        '$1samples.sort((a, b) => (a.id < b.id ? -1 : 1));$1$2',
      );
    },
  },
  {
    name: 'C. pairs by position instead of by id',
    apply(t) {
      // The classic bug this contract exists to prevent.
      return t.replace(
        /const p = byId\.get\(s\.id\);/,
        'const p = samples.indexOf(s) < predictions.length ? predictions[samples.indexOf(s)] : undefined;',
      );
    },
  },
  {
    name: 'D. drops the denominator: omits a sample that missed',
    apply(t) {
      return t.replace(
        /samplesWithMisses: /,
        'samplesWithMisses: 0 + ',
      );
    },
  },
];

/**
 * Run every injection and return the process status.
 *
 * Everything with a side effect lives inside this function rather than at module
 * scope, so that importing the file -- which the test that holds `readSummary`
 * against the captured CI bytes does -- cannot copy the backup, mutate the
 * scorer, or run four suites. The guard below is what makes the import safe. A
 * battery that fires when it is imported cannot be measured from a test, and one
 * that cannot be measured from a test is held only by whoever last read it.
 */
function main() {
  // The backup has to live somewhere writable that is not inside the tree being
  // graded. `node_modules/.cache` exists after any install and is never
  // committed, so a crashed run cannot leave a stray file that a later
  // `git status` would report as a source change.
  mkdirSync(dirname(BAK), { recursive: true });
  copyFileSync(SRC, BAK);
  const original = readFileSync(SRC, 'utf8');

  let survivors = 0;
  let inert = 0;

  /**
   * Every file this battery writes, mapped to the bytes it held beforehand.
   *
   * The restore below used to compare `SRC` against a backup taken at startup,
   * which verifies the one file the author remembered. `m1-ceiling-probe.py` was
   * measured doing exactly that while writing a third file it never restored:
   * 8098 lines of `docs/audit.md` replaced by a fixture, `sources restored:
   * identical to backup`, exit 0. The check was honest about what it knew and
   * blind to what it did not.
   *
   * Recording the writes makes the restored set a consequence of running, so a
   * file touched later is covered by construction rather than by someone
   * remembering to add it here.
   */
  const written = new Map();

  function writeRecorded(file, text) {
    if (!written.has(file)) written.set(file, readFileSync(file, 'utf8'));
    writeFileSync(file, text);
  }

  for (const inj of injections) {
    const mutated = inj.apply(original);
    if (mutated === original) {
      // An injection whose anchor no longer matches is NOT a survivor. Reporting
      // it as one would read as "the test has no teeth" when the truth is "the
      // mutation never happened" -- the same class of false reading as a test
      // that passes for the wrong reason. Counted separately and failed at the
      // end.
      console.log(`INERT ${inj.name}  -- anchor did not match; the injection never applied`);
      inert += 1;
      continue;
    }
    writeRecorded(SRC, mutated);
    const r = runSuite();
    writeRecorded(SRC, original);
    if (r.failed > 0) {
      console.log(`CAUGHT  ${inj.name}  ${describeOutcome(r)}`);
    } else {
      console.log(`SURVIVED ${inj.name}  -- no test detected this mutation`);
      survivors += 1;
    }
  }

  // Restore over the recorded set and verify all of it. The backup file is kept
  // for crash recovery, not as the thing that decides whether the restore worked.
  for (const [file, text] of written) writeFileSync(file, text);
  const mismatched = [...written].filter(([file, text]) => readFileSync(file, 'utf8') !== text);
  console.log('');
  console.log(`files written and restored: ${written.size}`);
  console.log(
    mismatched.length === 0
      ? 'source restored: identical to backup'
      : `source restore FAILED for ${mismatched.map(([f]) => f).join(', ')}`,
  );
  console.log(`battery: ${injections.length - survivors - inert} caught, ${survivors} survived, ${inert} inert`);
  return survivors === 0 && inert === 0 && mismatched.length === 0 ? 0 : 1;
}

const invokedDirectly =
  process.argv[1] !== undefined
  && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (invokedDirectly) {
  process.exit(main());
}
