#!/usr/bin/env node
/**
 * Measure M1's strict-rate ceiling over the golden fault dataset.
 *
 * The `component` block in `fault-prompt-grammar.test.ts` ends with a tripwire:
 * "if the loosest defensible rule ever reaches 19/19, the field stops being
 * ungradeable". That is a claim about the benchmark's *ceiling*, and a claim
 * about a ceiling is a measurement, so it belongs in a script rather than in a
 * paragraph of `docs/`.
 *
 * What it computes, for each candidate disposition of the `component` field:
 *
 *   - the number of samples whose `component` is recoverable from its own text
 *     under a named rule;
 *   - the number of samples that would then be fully correct under the strict
 *     definition (every field the sample states must be right), which is the
 *     figure `M1_STRICT_THRESHOLD` is applied to;
 *   - the same figure with `component` dropped from the strict definition.
 *
 * The second and third are not alternatives; they are the two ends of the
 * decision that is open. Reporting both is the point -- a "ceiling" quoted
 * without the definition it is computed under is the class of number this
 * repository has had to retract three times.
 *
 * Usage:
 *   node scripts/probe-m1-ceiling.mjs [--dataset <path>] [--json]
 *
 * Exit codes:
 *   0  the probe ran
 *   1  the dataset could not be read
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const DEFAULT_DATASET = resolve(REPO, 'golden-master/fault-extraction/samples.json');

/** The M1 exit condition. Imported by value here because this is a script. */
const M1_STRICT_THRESHOLD = 0.7;

/**
 * Every hyphen-delimited token of `name` occurs in `text`, case-insensitively.
 *
 * This is the loosest of the three candidate `component` rules measured in
 * finding 75, and the only one that does not reject several legitimate names.
 * Duplicated from the test rather than imported, deliberately: the test pins
 * the rule the dataset is measured against and this script measures the
 * dataset. If the two drift, the test fails and this script reports a different
 * number -- which is the visible failure, and the alternative (a shared helper
 * that both call) would let a single edit move both together and hide it.
 */
function tokensAllPresent(name, text) {
  const low = text.toLowerCase();
  return name.split('-').every((t) => t.length > 0 && low.includes(t));
}

function parseArgs(argv) {
  const out = { dataset: DEFAULT_DATASET, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--dataset') {
      out.dataset = resolve(argv[i + 1] ?? '');
      i += 1;
    } else if (a === '--json') {
      out.json = true;
    } else if (a === '--help' || a === '-h') {
      out.help = true;
    } else {
      throw new Error(`unknown argument '${a}'`);
    }
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(
      'usage: node scripts/probe-m1-ceiling.mjs [--dataset <path>] [--json]\n' +
        'measures the strict-rate ceiling over the golden fault dataset',
    );
    return 0;
  }

  let parsed;
  try {
    parsed = JSON.parse(readFileSync(args.dataset, 'utf8'));
  } catch (error) {
    console.error(`error: cannot read dataset '${args.dataset}': ${error.message}`);
    return 1;
  }

  const samples = parsed.samples;
  const total = samples.length;

  // One measure of recoverability, and the partition derived from it.
  //
  // The first draft computed `componentRecoverable` and `componentUnrecoverable`
  // as two independent filters over the same predicate -- one positive, one
  // negated. An injection that exempted a single sample from the positive filter
  // left the negative one untouched, so the two figures disagreed and neither the
  // report nor the battery could say which was right. That is finding 76's defect
  // (two statements of one fact, neither load-bearing) one layer down, in the
  // probe rather than the test. Deriving the second list from the first makes the
  // disagreement unrepresentable: the partition is a partition by construction.
  const recoverable = samples.filter((s) =>
    tokensAllPresent(s.expected.component, s.incidentText),
  );
  const unrecoverable = samples.filter((s) => !recoverable.includes(s));
  if (recoverable.length + unrecoverable.length !== total) {
    // Belt and braces rather than a real possibility: `includes` over the same
    // objects is exact, so this cannot fire. It is here because the report's two
    // halves are quoted as a partition in `docs/`, and a number that is quoted as
    // a partition should be checked as one.
    throw new Error(
      `recoverability partition does not cover the dataset: ${recoverable.length} + ${unrecoverable.length} != ${total}`,
    );
  }

  // Under the strict definition, a sample can only be fully correct if *every*
  // field it states is recoverable from its text, so the number of samples whose
  // `component` is recoverable is a ceiling on the strict rate: it is an upper
  // bound reached only if the model also gets every other field right.
  //
  // `component` is today the binding field. `type` is the other open field and
  // it has no such structural ceiling -- all 19 expected types are distinct
  // slugs and `normalizeFaultType` leaves each unchanged, so a type answer is
  // constrained by the model's naming rather than by the input text. That is why
  // this probe measures one field's ceiling and not "the" ceiling.
  const strictCeiling = recoverable.length;
  const strictCeilingRate = strictCeiling / total;

  // The same definition with `component` dropped. Nothing else is relaxed --
  // in particular `description` is still required when the dataset states one,
  // because dropping the field with the most forgiving reading would be moving
  // the target rather than measuring it. Under this definition every sample is
  // structurally admissible, so the ceiling is the sample count itself and the
  // figure carries no information about the model. That is exactly why it is
  // reported beside the strict one rather than in place of it: the difference
  // between the two rows is what the decision costs.
  const relaxedCeiling = total;

  const report = {
    dataset: args.dataset,
    samples: total,
    m1Threshold: M1_STRICT_THRESHOLD,
    component: {
      recoverableUnderTokenRule: recoverable.length,
      unrecoverableUnderTokenRule: unrecoverable.length,
      unrecoverableIds: unrecoverable.map((s) => s.id),
    },
    strictCeiling: {
      samples: strictCeiling,
      rate: strictCeilingRate,
      clearsM1: strictCeilingRate >= M1_STRICT_THRESHOLD,
    },
    strictWithoutComponent: {
      samples: relaxedCeiling,
      rate: relaxedCeiling / total,
      clearsM1: relaxedCeiling / total >= M1_STRICT_THRESHOLD,
    },
  };

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
    return 0;
  }

  console.log(`dataset: ${args.dataset}`);
  console.log(`samples: ${total}`);
  console.log('');
  console.log('component, under the loosest defensible rule (all hyphen tokens present):');
  console.log(`  recoverable   ${recoverable.length}/${total}`);
  console.log(
    `  unrecoverable ${unrecoverable.length}/${total}` +
      (unrecoverable.length > 0 ? `  [${unrecoverable.map((s) => s.id).join(', ')}]` : ''),
  );
  console.log('');
  console.log(`M1 strict threshold: ${M1_STRICT_THRESHOLD}`);
  console.log('strict, every stated field required:');
  console.log(
    `  ceiling ${strictCeiling}/${total} = ${(strictCeilingRate * 100).toFixed(1)}%  ` +
      `${report.strictCeiling.clearsM1 ? 'CLEARS' : 'BELOW'} M1`,
  );
  console.log('strict, component excluded from the definition:');
  console.log(
    `  ceiling ${relaxedCeiling}/${total} = ${((relaxedCeiling / total) * 100).toFixed(1)}%  ` +
      `${report.strictWithoutComponent.clearsM1 ? 'CLEARS' : 'BELOW'} M1`,
  );
  console.log('');
  console.log(
    `the decision costs ${total - strictCeiling} sample(s) of headroom: ` +
      `${strictCeiling}/${total} strictly vs ${relaxedCeiling}/${total} without component.`,
  );

  return 0;
}

process.exit(main());
