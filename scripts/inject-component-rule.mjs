#!/usr/bin/env node
/**
 * Injection battery for the `component` rule tests.
 *
 * Rationale: the tests added for finding 75 assert things about the golden
 * dataset and about the scored wrong answers. Assertions over a dataset are
 * especially easy to write in a way that cannot fail -- comparing a count to a
 * count, or re-deriving the number the test just computed. This battery mutates
 * the *inputs* those tests read and requires each mutation to be caught.
 *
 * Three outcomes, and the third is not an outcome:
 *   CAUGHT    a test failed because of the mutation   -- the point of the battery
 *   SURVIVED  the suite passed anyway                 -- the test is decoration
 *   INERT     the mutation never applied              -- indistinguishable from
 *                                                        SURVIVED in the output,
 *                                                        so it is counted apart
 * Both non-CAUGHT outcomes exit non-zero. Finding 74's battery found this defect
 * in itself; this script inherits the repair.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const SUITE = resolve(REPO, 'packages/core/test/fault-prompt-grammar.test.ts');
const GOLDEN = resolve(REPO, 'golden-master/fault-extraction/samples.json');

// The vitest report is written inside the repository and read straight back.
// The first version used a fixed `/tmp` name, which passes on one machine and is
// fragile in a container that shares `/tmp` between jobs. Resolving under the
// repository keeps the read and the write on the same filesystem by construction.
const REPORT = resolve(REPO, 'node_modules/.cache/grammar-battery.json');
mkdirSync(dirname(REPORT), { recursive: true });

const suiteOriginal = readFileSync(SUITE, 'utf8');
const goldenOriginal = readFileSync(GOLDEN, 'utf8');

/** Run only the grammar suite; the battery is about these assertions. */
function runSuite() {
  try {
    const out = execFileSync(
      'npx',
      ['vitest', 'run', 'packages/core/test/fault-prompt-grammar.test.ts', '--reporter=json', `--outputFile=${REPORT}`],
      { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    void out;
    const report = JSON.parse(readFileSync(REPORT, 'utf8'));
    return {
      failed: report.numFailedTests ?? 0,
      passed: report.numPassedTests ?? 0,
    };
  } catch (err) {
    // A non-zero exit means failures; the JSON is still written.
    try {
      const report = JSON.parse(readFileSync(REPORT, 'utf8'));
      return { failed: report.numFailedTests ?? 0, passed: report.numPassedTests ?? 0 };
    } catch {
      return { failed: -1, passed: 0, error: String(err).slice(0, 200) };
    }
  }
}

/**
 * Each injection returns the file contents to write, or the original unchanged.
 * Returning the original signals INERT.
 */
const injections = [
  {
    name: 'A. golden dataset: make a second component unrecoverable from its text',
    file: GOLDEN,
    original: goldenOriginal,
    apply(text) {
      // Rewriting `cart-service` to an invented name that shares no token with
      // the incident. The tripwire test asserts the rejected list is exactly
      // one sample; this must make it two.
      return text.replace('"component": "cart-service"', '"component": "inventory-frontend"');
    },
  },
  {
    name: 'B. golden dataset: reopen the gap the rule closed, so the tripwire must break',
    file: GOLDEN,
    original: goldenOriginal,
    apply(text) {
      // Undo the round's re-annotation: make the sample's component unrecoverable
      // from its text again. The suite now asserts the rule has *no* exception in
      // the data, so this must fail. The earlier form of this injection edited
      // `checkout-ui`, which no longer appears in the file -- it went inert rather
      // than failing, which is the outcome this battery exists to make impossible.
      return text.replace('"component": "storefront"', '"component": "storefront-ui"');
    },
  },
  {
    name: 'C. suite: break the contrast by accepting only right answers',
    file: SUITE,
    original: suiteOriginal,
    apply(text) {
      // The wrong-answer acceptance rate is the measurement. Flipping the
      // predicate to look for the *right* answer in the text collapses the
      // contrast: wrongRate would fall to ~0 while rightRate stays at 1, so the
      // asymmetry assertion breaks. This is the mutation that the earlier
      // `toBeGreaterThanOrEqual(10)` version of this test could not catch.
      return text.replace(
        "      tokensAllPresent((ANSWERED[s.id] as string).replace(/\\s+/g, '-'), s.incidentText);",
        "      tokensAllPresent((RIGHT_ANSWERS[s.id] ?? '').replace(/\\s+/g, '-'), s.incidentText);",
      );
    },
  },
  {
    name: 'D. suite: make the rule accept every sample, so nothing is rejected',
    file: SUITE,
    original: suiteOriginal,
    apply(text) {
      // `tokensAllPresent` is the shared primitive both the tripwire and the
      // discrimination test read, so a mutation that hollows it out has to be
      // caught by one of them. Making it always true means the tripwire sees
      // zero rejected samples and the discrimination rates both go to 1, which
      // the `wrongRate < rightRate` assertion detects.
      return text.replace(
        "return name.split('-').every((t) => t.length > 0 && low.includes(t));",
        'void low; return true;',
      );
    },
  },
  {
    name: 'E. suite: reopen the gap the tripwire closed',
    file: SUITE,
    original: suiteOriginal,
    apply(text) {
      // The assertion that keeps the rule honest: no expected component may be
      // absent from its own text. Relaxing it to "at most one is" models the
      // state the round before this one was in, and must fail against today's
      // data. The earlier form asserted the *opposite* relaxation (`toEqual([])`)
      // which, once the round closed the gap, became the correct value rather
      // than a mutation -- it stopped being an injection at all and went inert.
      return text.replace(
        "    expect(rejected, 'a stated rule must not have an exception in its own ground truth').toEqual([]);",
        "    expect(rejected, 'a stated rule must not have an exception in its own ground truth').toHaveLength(1);",
      );
    },
  },
  {
    name: 'F. suite: assert the right-answer rate is the ceiling it is not',
    file: SUITE,
    original: suiteOriginal,
    apply(text) {
      // The assertion that makes the contrast directional. Swapping it for the
      // direction an earlier draft wrongly asserted (rightRate <= wrongRate)
      // must fail, because the measured rightRate is 1 and the measured
      // wrongRate is below it. If this ever stops failing, the data has changed
      // in a way that makes finding 75's argument need restating.
      return text.replace(
        "    expect(rightRate, 'the rule accepts every right answer').toBe(1);",
        "    expect(rightRate, 'the rule accepts every right answer').toBeLessThanOrEqual(wrongRate);",
      );
    },
  },
  {
    name: 'G. suite: assert the accepted-versus-readable gap is closed (it is not)',
    file: SUITE,
    original: suiteOriginal,
    apply(text) {
      // What this injection tests is the *direction* of the gap assertion, not
      // the presence of a second consumer. The gap assertions record a
      // distribution fact -- seven of nine accepted wrong answers are accepted
      // on token co-occurrence alone -- and a distribution fact has no
      // structural consequence elsewhere in the suite, so removing it cannot
      // break another test. Asserting the opposite direction is therefore the
      // only mutation that says whether the assertion is load-bearing, and it
      // must fail.
      //
      // The count moved from eight to seven when the round stated the rule and
      // re-annotated one sample; the injection is written against the current
      // value so it keeps testing the assertion rather than the calendar.
      return text.replace(
        "    ).toBe(7);\n",
        '    ).toBe(0);\n',
      );
    },
  },
  {
    name: 'H. suite: drop the empty-token guard, so a hyphens-only name passes',
    file: SUITE,
    original: suiteOriginal,
    apply(text) {
      // `every` over an empty array is true, so without the guard a name made
      // only of hyphens would be accepted against any text. The constructed-input
      // test is what catches this; without that test the guard was unverified.
      return text.replace(
        "return name.split('-').every((t) => t.length > 0 && low.includes(t));",
        "return name.split('-').every((t) => low.includes(t));",
      );
    },
  },
];

let survivors = 0;
let inert = 0;

console.log('component rule battery\n');
for (const inj of injections) {
  const mutated = inj.apply(inj.original);
  if (mutated === inj.original) {
    console.log(`INERT    ${inj.name}`);
    console.log('         -- anchor did not match; the injection never applied');
    inert += 1;
    continue;
  }
  writeFileSync(inj.file, mutated);
  const result = runSuite();
  writeFileSync(inj.file, inj.original);
  // `failed === -1` means the run produced no JSON report at all -- the mutation
  // crashed the suite before any test ran. That is a caught mutation, and it must
  // not print the same word as a mutation nothing detected: `-1 > 0` is false, so
  // the original form of this branch classified a broken runner as SURVIVED. This
  // script's sibling (`inject-m1-ceiling-tests.mjs`) inherited the defect and had
  // it exposed by an injection that made the subject exit non-zero before writing
  // its report; the repair is applied here too rather than only where it was found.
  if (result.failed === -1) {
    console.log(`CAUGHT   ${inj.name}`);
    console.log(`         (the suite failed to run at all: ${result.error ?? 'no report written'})`);
  } else if (result.failed > 0) {
    console.log(`CAUGHT   ${inj.name}`);
    console.log(`         (failed ${result.failed}, passed ${result.passed})`);
  } else {
    console.log(`SURVIVED ${inj.name}`);
    console.log(`         -- no test detected this mutation${result.error ? ` (${result.error})` : ''}`);
    survivors += 1;
  }
}

// Restore and prove restoration byte-for-byte, derived from the injections
// rather than from two names repeated from the top of the file.
//
// Each entry already carries the file it targets and that file's original text,
// so the set to restore is a property of the entry list. Writing `SUITE` and
// `GOLDEN` back by name instead meant an injection added against a third file
// would be restored only if someone also added it here. Measured in
// `m1-ceiling-probe.py`: that battery reported `sources restored: identical to
// backup` while 8098 lines of `docs/audit.md` had been replaced by a fixture.
// Deriving the set means such an entry is covered by construction.
const targets = new Map();
for (const inj of injections) {
  if (!targets.has(inj.file)) targets.set(inj.file, inj.original);
}
for (const [file, text] of targets) writeFileSync(file, text);
const mismatched = [...targets].filter(([file, text]) => readFileSync(file, 'utf8') !== text);
const restored = mismatched.length === 0;

console.log(`\nbattery: ${injections.length - survivors - inert} caught, ${survivors} survived, ${inert} inert`);
console.log(`files written and restored: ${targets.size}`);
console.log(
  restored
    ? 'source restored: identical to backup'
    : `source restore DIFFERS for ${mismatched.map(([f]) => f).join(', ')} -- inspect before committing`,
);
process.exit(survivors === 0 && inert === 0 && restored ? 0 : 1);
