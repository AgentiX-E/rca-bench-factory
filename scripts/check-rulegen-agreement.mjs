#!/usr/bin/env node
/**
 * What the two layout channels do with one fixed answer set.
 *
 * `llm/rulegen.ts` prompts a model for a column mapping, parses the answer and validates it, and
 * nothing in this repository calls it: the path every file takes is `ingest/prime.ts`'s alias table.
 * So there is no accuracy over model output to report, and reporting one would describe a channel
 * that does not run. What can be reported is what the answer set in `golden-master/` decides:
 *
 *   - the alias table, against the layout a careful human reader produces from the header row;
 *   - the validator, against answers written the way a model gets them wrong.
 *
 * The exit status follows only the second. A verdict the answer set contradicts is a defect in the
 * contract -- an answer the set says is acceptable and the validator refuses, or the reverse -- and
 * that is what a gate can hold. The alias table's coverage is a *reading*: it is allowed to be
 * conservative, because a column name outside its vocabulary is what the model-side channel exists
 * for, and a check that failed on the count would demand that a heuristic know every vendor's
 * spelling.
 *
 * The absence of Cohen's kappa is stated at the point the figure is printed rather than left to the
 * reader: one author wrote the cases and the answers, so there is no inter-annotator agreement to
 * compute, and the number is agreement with a specified answer.
 *
 * Usage:
 *   node scripts/check-rulegen-agreement.mjs [--golden <path>] [--quiet]
 *
 * Exit codes:
 *   0  every verdict is the verdict the answer set specifies
 *   1  the file could not be read, or a verdict disagrees with the answer set
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { describeRulegenAgreement, parseRulegenLayoutGolden, readRulegenAgreement } = await import(
  resolve(ROOT, 'packages/core/dist/llm/rulegen-agreement.js')
);

function parseArgs(argv) {
  const args = { golden: resolve(ROOT, 'golden-master/rulegen-layouts.json'), quiet: false };
  for (let i = 0; i < argv.length; i += 1) {
    const one = argv[i];
    if (one === '--quiet') {
      args.quiet = true;
      continue;
    }
    if (one === '--golden') {
      const value = argv[i + 1];
      if (value === undefined) {
        throw new Error('--golden needs a path');
      }
      args.golden = resolve(process.cwd(), value);
      i += 1;
      continue;
    }
    throw new Error(`unknown argument '${one}'`);
  }
  return args;
}

let args;
try {
  args = parseArgs(process.argv.slice(2));
} catch (error) {
  console.error(`check-rulegen-agreement: ${String(error.message)}`);
  process.exit(1);
}

let reading;
try {
  const raw = JSON.parse(readFileSync(args.golden, 'utf8'));
  reading = readRulegenAgreement(parseRulegenLayoutGolden(raw));
} catch (error) {
  console.error(`check-rulegen-agreement: FAILED — ${String(error.message)}`);
  process.exit(1);
}

if (!args.quiet) console.log(`check-rulegen-agreement: ${describeRulegenAgreement(reading)}`);

if (reading.verdicts.disagreements.length > 0) {
  for (const row of reading.cases) {
    if (row.verdictAgrees) continue;
    console.error(
      `check-rulegen-agreement: FAILED — '${row.id}' is ${row.verdict} and the answer set says `
        + `otherwise${row.reason === null ? '' : ` (${row.reason})`}`,
    );
  }
  console.error(
    `check-rulegen-agreement: FAILED — ${String(reading.verdicts.disagreements.length)} of `
      + `${String(reading.total)} verdict(s) disagree with the answer set`,
  );
  process.exit(1);
}

if (reading.reasons.agreements !== reading.reasons.checked) {
  // A refusal for the wrong reason is a wrong answer with the right exit code, so it is refused
  // here rather than left to the reading: the reason is what a caller acts on.
  for (const row of reading.cases) {
    if (row.reasonAgrees !== false) continue;
    console.error(
      `check-rulegen-agreement: FAILED — '${row.id}' was refused for a reason the answer set does `
        + `not name: ${String(row.reason)}`,
    );
  }
  process.exit(1);
}

if (!args.quiet) {
  console.log(
    `check-rulegen-agreement: OK (${String(reading.total)} case(s); `
      + `${String(reading.deterministic.agreements)} read by the alias table, `
      + `${String(reading.refused)} refused by the validator, `
      + `${String(reading.misreads.length)} accepted answer(s) the replay cannot check)`,
  );
}
