#!/usr/bin/env node
/**
 * Injection battery for the M1-ceiling probe *tests*.
 *
 * `scripts/probe-m1-ceiling.mjs` has its own battery
 * (`scripts/injection/m1-ceiling-probe.py`), which drives the probe itself: it
 * mutates the ground truth and the probe's definitions and requires the published
 * number to move. That battery proves the *figure* is tied to its inputs.
 *
 * This one is the other half, and it exists because the two failures are
 * different. `m1-ceiling-probe.test.ts` asserts things *about* that figure, and
 * assertions about a number are exactly where this repository has repeatedly
 * written decoration: a literal compared to an identical literal (finding 75's
 * first draft), a count bounded by a `>=` that no mutation inside the range could
 * move (its second), and a distribution fact with no second consumer (its third).
 *
 * So each mutation below targets one assertion in the new test file and requires
 * that assertion to be the thing that fails. The mutations are of two kinds:
 *
 *   - TEST mutations change the assertion. These catch decoration: if relaxing an
 *     assertion to `toBeGreaterThanOrEqual(0)` leaves the suite green, the
 *     assertion was never load-bearing.
 *   - PROBE mutations change what the probe publishes, and the test must notice.
 *     These catch a test that recomputes the probe's own arithmetic instead of
 *     reading its output -- which is how the `538` figure in finding 54 came to be
 *     a "probe count, not a gate count".
 *
 * Three outcomes, and the third is not an outcome:
 *   CAUGHT    the suite failed because of the mutation  -- the point of the battery
 *   SURVIVED  the suite passed anyway                    -- the assertion is decoration
 *   INERT     the mutation never applied                 -- indistinguishable from
 *                                                           SURVIVED in the output,
 *                                                           so it is counted apart
 * Both non-CAUGHT outcomes exit non-zero.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const TEST = resolve(REPO, 'packages/core/test/m1-ceiling-probe.test.ts');
const PROBE = resolve(REPO, 'scripts/probe-m1-ceiling.mjs');
const GOLDEN = resolve(REPO, 'golden-master/fault-extraction/samples.json');

// Written inside the repository and read straight back, for the reason finding 77
// records: a fixed `/tmp` name passes on one machine and is fragile in a container
// that shares `/tmp` between jobs.
const REPORT = resolve(REPO, 'node_modules/.cache/m1-test-battery.json');
mkdirSync(dirname(REPORT), { recursive: true });

const testOriginal = readFileSync(TEST, 'utf8');
const probeOriginal = readFileSync(PROBE, 'utf8');
const goldenOriginal = readFileSync(GOLDEN, 'utf8');

/**
 * Run only the probe's test file; the battery is about these assertions.
 *
 * Returns `{ failed, passed, total }`. `total` is what makes a broken run
 * distinguishable from a surviving mutation: vitest writes `failed: 0, passed: 0`
 * when the test file throws during collection, which is not a suite that passed
 * -- it is a suite that did not run. The first version of this function reported
 * only the two counts and classified that case as SURVIVED, and injection G
 * (a probe mutation the file's top-level `runProbe()` call turns into a
 * module-load throw) is what exposed it. The sibling battery had the same gap in
 * a different form -- `-1 > 0` is false, so a missing report also read as
 * SURVIVED -- and both are fixed here.
 */
function runSuite() {
  const read = () => {
    const report = JSON.parse(readFileSync(REPORT, 'utf8'));
    return {
      failed: report.numFailedTests ?? 0,
      passed: report.numPassedTests ?? 0,
      total: report.numTotalTests ?? 0,
    };
  };
  try {
    execFileSync(
      'npx',
      ['vitest', 'run', 'packages/core/test/m1-ceiling-probe.test.ts', '--reporter=json', `--outputFile=${REPORT}`],
      { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    return read();
  } catch (err) {
    try {
      return read();
    } catch {
      return { failed: 0, passed: 0, total: 0, error: String(err).slice(0, 200) };
    }
  }
}

/**
 * Each injection names the files it mutates together.
 *
 * A single-sided mutation is not enough for the *test* injections. Relaxing an
 * assertion leaves the suite green whenever the subject still publishes a correct
 * value -- which is the normal state of the code -- so a test injection on its own
 * proves nothing and reads as SURVIVED. The first run of this battery had four
 * such injections and three of them survived for exactly that reason. Each one is
 * therefore paired with the probe mutation it is supposed to detect: the pair is
 * caught when the relaxed assertion lets the mutated probe through.
 */
const injections = [
  {
    name: 'A. test bounds the partition check, and the probe drops a sample from one half',
    edits: [
      {
        file: TEST,
        apply(text) {
          return text.replace(
            'expect(report.component.recoverableUnderTokenRule).toBe(fromDataset.recoverable);',
            'expect(report.component.recoverableUnderTokenRule).toBeGreaterThan(0);',
          );
        },
      },
      {
        file: PROBE,
        apply(text) {
          // Exclude the first sample from the recoverable half while the
          // unrecoverable half is still derived from the raw predicate, so the
          // halves overlap. The partition guard catches this on its own, so the
          // *pair* is what this injection tests: a bounded assertion would let the
          // counts drift without the comparison failing.
          //
          // The previous form of this injection exempted
          // `config-feature-flag-checkout` by name, which stopped being a mutation
          // at all once the round that stated the rule re-annotated that sample --
          // it is recoverable now, so the exemption changed nothing. Written
          // against index 0 the mutation does not depend on any sample's value.
          return text.replace(
            '  const unrecoverable = samples.filter((s) => !recoverable.includes(s));',
            '  const unrecoverable = samples.filter(\n' +
              '    (s) => !tokensAllPresent(s.expected.component, s.incidentText),\n' +
              '  );',
          ).replace(
            '  const recoverable = samples.filter((s) =>\n' +
              '    tokensAllPresent(s.expected.component, s.incidentText),\n' +
              '  );',
            '  const recoverable = samples.filter(\n' +
              '    (s, i) => tokensAllPresent(s.expected.component, s.incidentText) && i !== 0,\n' +
              '  );',
          );
        },
      },
    ],
  },
  {
    name: 'B. test drops every identity assertion, and the probe loses the sample it names',
    edits: [
      {
        file: TEST,
        apply(text) {
          // The identity claim -- *which* sample is unrecoverable, as opposed to
          // how many -- has three consumers in this file, and the first two runs
          // of this injection found them one at a time: relaxing the named
          // tripwire alone survived because the partition test derives the set
          // from the dataset, and relaxing that too survived because the
          // count-and-membership test still checked `toHaveLength` against the
          // derived length. Three assertions covering one fact is exactly what
          // finding 76 warns against, so this injection relaxes all three and
          // requires the identity to become unenforced.
          //
          // If this is ever caught again, the file has grown a fourth consumer of
          // the same fact and one of the four should be deleted rather than kept.
          //
          // The literal it relaxes is `[]` now, not the old one-sample set: the
          // round that stated the component rule closed the ceiling, so the
          // identity claim is "no sample is unrecoverable" rather than "this one
          // is". `toHaveLength(0)` is the relaxation of that, and it is exactly
          // what must fail to detect a dataset edit that reopens the gap.
          return text
            .replace(
              'expect(report.component.unrecoverableIds).toEqual([]);',
              'expect(report.component.unrecoverableIds).toHaveLength(0);',
            )
            .replace(
              'expect(report.component.unrecoverableIds).toEqual(fromDataset.unrecoverable);',
              'expect(report.component.unrecoverableIds).toHaveLength(fromDataset.unrecoverable.length);',
            )
            .replace(
              'expect(report.component.unrecoverableIds).toHaveLength(report.component.unrecoverableUnderTokenRule);',
              'expect(report.component.unrecoverableIds.length).toBeGreaterThanOrEqual(0);',
            );
        },
      },
      {
        file: GOLDEN,
        apply(text) {
          // A different sample becomes the unrecoverable one, so the count stays
          // at one and only the identity moves. Written against the *current*
          // annotation (`storefront`) plus a second plausible component, so the
          // mutation is a real edit to today's file rather than to yesterday's.
          return text
            .replace('"component": "storefront"', '"component": "storefront-ui"')
            .replace('"component": "cart-service"', '"component": "inventory-frontend"');
        },
      },
    ],
  },
  {
    name: 'C. test recomputes the rate from the dataset instead of reading the reported one',
    edits: [
      {
        file: TEST,
        apply(text) {
          // The `538` defect from finding 54: a test that re-derives the number it
          // is checking proves only that its own arithmetic agrees with itself.
          return text.replace(
            'expect(report.strictCeiling.rate).toBeCloseTo(fromDataset.recoverable / golden.samples.length, 12);',
            'expect(report.strictCeiling.rate).toBeCloseTo(18 / 19, 12);',
          );
        },
      },
      {
        file: PROBE,
        apply(text) {
          return text.replace('  const strictCeilingRate = strictCeiling / total;', '  const strictCeilingRate = strictCeiling / (total - 1);');
        },
      },
    ],
  },
  {
    name: 'D. test asserts the threshold against a literal, and the probe moves its own',
    edits: [
      {
        file: TEST,
        apply(text) {
          return text.replace(
            'expect(report.m1Threshold).toBe(M1_STRICT_THRESHOLD);',
            'expect(report.m1Threshold).toBe(0.7);',
          );
        },
      },
      {
        file: PROBE,
        apply(text) {
          return text.replace('const M1_STRICT_THRESHOLD = 0.7;', 'const M1_STRICT_THRESHOLD = 0.8;');
        },
      },
    ],
  },
  {
    name: 'E. probe publishes the relaxed ceiling as the strict one',
    edits: [
      {
        file: PROBE,
        apply(text) {
          // The closed-ceiling form. "Set strict to total" is now a no-op, since
          // stating the rule made `recoverable.length === total`; what is still
          // observable is a strict ceiling that does not equal the numerator it is
          // supposed to be. Subtracting one models a probe that silently drops a
          // sample, which the assertion `strictCeiling.samples === fromDataset
          // .recoverable` must catch.
          return text.replace(
            '  const strictCeiling = recoverable.length;',
            '  const strictCeiling = recoverable.length - 1;',
          );
        },
      },
    ],
  },
  {
    name: 'F. probe publishes the threshold as 0.0',
    edits: [
      {
        file: PROBE,
        apply(text) {
          return text.replace('const M1_STRICT_THRESHOLD = 0.7;', 'const M1_STRICT_THRESHOLD = 0.0;');
        },
      },
    ],
  },
  {
    name: 'G. probe derives its two halves independently, so they can disagree',
    edits: [
      {
        file: PROBE,
        apply(text) {
          // Reproduce the original defect rather than a plausible-looking edit:
          // `unrecoverable` becomes a second independent filter over the raw
          // predicate, and `recoverable` additionally drops the first sample, so
          // the two halves overlap and miss one. Both the guard and the
          // partition assertion must notice.
          //
          // The previous form exempted `config-feature-flag-checkout` by name,
          // which stopped being a mutation once that sample was re-annotated --
          // it is recoverable now, so the exemption was inert in effect while
          // still applying textually, which is the worst kind: it looked applied.
          return text
            .replace(
              '  const unrecoverable = samples.filter((s) => !recoverable.includes(s));',
              '  const unrecoverable = samples.filter(\n    (s) => !tokensAllPresent(s.expected.component, s.incidentText),\n  );',
            )
            .replace(
              '  const recoverable = samples.filter((s) =>\n' +
                '    tokensAllPresent(s.expected.component, s.incidentText),\n' +
                '  );',
              '  const recoverable = samples.filter(\n' +
                '    (s, i) => tokensAllPresent(s.expected.component, s.incidentText) && i !== 0,\n' +
                '  );',
            );
        },
      },
    ],
  },
  {
    name: 'H. dataset reopens the gap, so the closed-partition tripwire must break',
    edits: [
      {
        file: GOLDEN,
        apply(text) {
          // The end-to-end version of injection B: rather than editing the
          // assertion, edit the data the assertion is about. The round that
          // stated the component rule closed the ceiling by re-annotating
          // `config-feature-flag-checkout`, and this injection undoes that -- it
          // makes the annotated name unrecoverable again, which is the state the
          // probe's figure of 18/19 came from.
          //
          // Both the probe's test and the grammar test must fail when this is
          // made, or the round's central claim is unenforced.
          return text.replace('"component": "storefront"', '"component": "storefront-ui"');
        },
      },
    ],
  },
];

const ORIGINALS = {
  [TEST]: testOriginal,
  [PROBE]: probeOriginal,
  [GOLDEN]: goldenOriginal,
};

let survivors = 0;
let inert = 0;
let caught = 0;

console.log('M1-ceiling probe test battery\n');
for (const inj of injections) {
  const applied = [];
  let inertReason = null;
  for (const edit of inj.edits) {
    const original = ORIGINALS[edit.file];
    const mutated = edit.apply(original);
    if (mutated === original) {
      inertReason = `anchor did not match in ${edit.file.replace(`${REPO}/`, '')}`;
      break;
    }
    applied.push([edit.file, mutated]);
  }
  if (inertReason !== null) {
    console.log(`INERT    ${inj.name}`);
    console.log(`         -- ${inertReason}; the injection never applied`);
    inert += 1;
    continue;
  }

  for (const [file, mutated] of applied) writeFileSync(file, mutated);
  const result = runSuite();
  for (const [file] of applied) writeFileSync(file, ORIGINALS[file]);

  // Three degenerate outcomes, and none of them is a passing suite. This is the
  // part the first version got wrong: `failed > 0` is true only for a suite that
  // ran and failed, so a mutation that stopped the suite from running at all fell
  // through to SURVIVED and was counted as an assertion nobody could break.
  if (result.total === 0) {
    console.log(`CAUGHT   ${inj.name}`);
    console.log(
      `         (no test ran at all -- the mutation broke collection: ${result.error ?? 'zero tests reported'})`,
    );
    caught += 1;
  } else if (result.failed > 0) {
    console.log(`CAUGHT   ${inj.name}`);
    console.log(`         (failed ${result.failed}, passed ${result.passed})`);
    caught += 1;
  } else {
    console.log(`SURVIVED ${inj.name}`);
    console.log(
      `         -- ${result.total} test(s) ran and none detected this mutation${result.error ? ` (${result.error})` : ''}`,
    );
    survivors += 1;
  }
}

// Restore and prove restoration byte-for-byte.
writeFileSync(TEST, testOriginal);
writeFileSync(PROBE, probeOriginal);
writeFileSync(GOLDEN, goldenOriginal);
const restored =
  readFileSync(TEST, 'utf8') === testOriginal &&
  readFileSync(PROBE, 'utf8') === probeOriginal &&
  readFileSync(GOLDEN, 'utf8') === goldenOriginal;

console.log(`\nbattery: ${caught} caught, ${survivors} survived, ${inert} inert`);
console.log(`sources restored: ${restored ? 'identical to backup' : 'DIFFERS -- inspect before committing'}`);
process.exit(survivors === 0 && inert === 0 && restored ? 0 : 1);
