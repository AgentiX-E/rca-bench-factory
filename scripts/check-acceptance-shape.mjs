#!/usr/bin/env node
/**
 * The verdict for `docs/acceptance.md`: what each clause owes a reader, and the index.
 *
 * ## Why the reading is in another file
 *
 * `scripts/acceptance-shape.mjs` holds the parsing, the two clause rules and the index
 * comparison; this file holds the verdict, which is the exit code and the sentences a reader
 * needs to repair it. The split is not taste: a gate a test imports cannot be proved by being
 * emptied -- the emptied file kills the worker before it can name a failing test, and the
 * meta-gate reports `UNATTRIBUTED` -- so every gate in this tree that has logic at all keeps
 * it in a data module and leaves the refusal here.
 *
 * ## What it refuses
 *
 * See `scripts/acceptance-shape.mjs` for the three rules and the argument for each. This file
 * only decides the order: a clause with no address is reported before one with no round,
 * because the address is the half that makes a judgement checkable, and the index is compared
 * last, because an index that disagrees with a heading is a symptom of the edit above it.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { acceptanceErrors, acceptancePath, clausesOf, withIndex } from './acceptance-shape.mjs';

function fail(lines) {
  console.error(`check-acceptance-shape: FAILED — ${lines[0]}`);
  for (const line of lines.slice(1)) console.error(`  ${line}`);
  process.exit(1);
}

const invokedDirectly =
  process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (invokedDirectly) {
  const flag = process.argv[2];
  const text = readFileSync(acceptancePath(), 'utf8');
  if (flag === '--write') {
    const next = withIndex(text);
    writeFileSync(acceptancePath(), next);
    console.log(
      `check-acceptance-shape: wrote ${String(clausesOf(next).length)} row(s) into \`docs/acceptance.md\``,
    );
  } else if (flag !== undefined && flag !== '--check') {
    fail([`\`${flag}\` is not a flag: this gate writes with \`--write\` and reads with no flag`]);
  } else {
    const errors = acceptanceErrors(text);
    if (errors.length > 0) {
      fail([
        `${String(errors.length)} problem(s) in \`docs/acceptance.md\``,
        ...errors,
        'run `node scripts/check-acceptance-shape.mjs --write` for the index, and edit the headings it names',
      ]);
    }
    const clauses = clausesOf(text);
    const rounds = new Set(clauses.map((one) => one.round));
    // Sorted as numbers and not as strings, which is the defect the first run of this line
    // printed: `v3.116 to v3.79`, because `v3.116` sorts before `v3.79` character by character
    // and a version is two numbers. A sentence that states the span of a set has to state it in
    // the order the set is in, or it is describing the sort rather than the file.
    const sorted = [...rounds]
      .filter((one) => one !== null)
      .sort((left, right) => {
        const [leftMajor, leftMinor] = left.slice(1).split('.').map(Number);
        const [rightMajor, rightMinor] = right.slice(1).split('.').map(Number);
        return (leftMajor ?? 0) - (rightMajor ?? 0) || (leftMinor ?? 0) - (rightMinor ?? 0);
      });
    console.log(
      `check-acceptance-shape: OK — ${String(clauses.length)} clause(s) across ` +
        `${String(sorted.length)} round(s), ` +
        `${String(sorted[0] ?? 'none')} to ${String(sorted[sorted.length - 1] ?? 'none')}, ` +
        'each with an address and a round, and the index holding every one of them',
    );
  }
}
