#!/usr/bin/env node
/**
 * Every `finding N` the documentation writes must name a finding that exists.
 *
 * ## Why this is a gate and not a paragraph
 *
 * The audit log cites itself constantly -- "closed by finding 170", "finding 46's fix" --
 * and so does every round of the progress log. A citation that does not resolve reads
 * exactly as convincingly as one that does, which is the property that makes it worth
 * checking mechanically: no amount of care while writing catches it, because the failure
 * is that a number is wrong, and the sentence around it is right.
 *
 * Measured on the first run: 203 distinct numbers cited, **two** of them naming nothing
 * (118 and 133). Both were repaired; see finding 205.
 *
 * ## What it prints, and what each half means
 *
 * - `absent` -- numbers skipped in the sequence. Printed, not refused: a hole with no
 *   citation is invisible, and renumbering 204 findings to close three would break every
 *   citation that resolves today.
 * - `dangling` -- a citation of a number that has no heading. Refused. This is the half
 *   that a reader feels.
 *
 * The reading lives in `scripts/audit-citations.mjs`, because a gate that a test imports
 * cannot be proved by emptying it (finding 196) and this parse is what needs tests.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { absentNumbers, citationsIn, dangling, headingsOf } from './audit-citations.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

/**
 * The corpus: both documents, their indices, and every volume of each.
 *
 * Deliberately "everything under the two doc roots" rather than a list: a citation is
 * written where the writer happened to be, and a guard that knew only the files that
 * existed when it was written would stop covering the corpus the first time a volume was
 * added -- the defect `blocker-claims.test.ts` was repaired for after the audit split.
 */
function corpus() {
  const files = [];
  const add = (path, label) => {
    try {
      files.push({ label, text: readFileSync(path, 'utf8') });
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  };
  add(resolve(ROOT, 'docs', 'audit.md'), 'docs/audit.md');
  add(resolve(ROOT, 'docs', 'progress.md'), 'docs/progress.md');
  for (const [dir, prefix] of [['audit', 'docs/audit'], ['progress', 'docs/progress']]) {
    let names = [];
    try {
      names = readdirSync(resolve(ROOT, 'docs', dir)).filter((one) => one.endsWith('.md')).sort();
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    for (const name of names) add(resolve(ROOT, 'docs', dir, name), `${prefix}/${name}`);
  }
  return files;
}

const files = corpus();
const headings = headingsOf(files);
const citations = files.flatMap((file) => citationsIn(file));
const { dangling: broken, numbers } = dangling(citations, headings);
const absent = absentNumbers(headings);

if (broken.length > 0) {
  for (const one of broken) {
    console.error(`  ${one.where}: cites finding ${String(one.number)}, which has no heading`);
    console.error(`    ${one.sentence}`);
  }
  console.error(`check-citations: FAILED — ${String(broken.length)} citation(s) of ${String(numbers.length)} number(s)`);
  console.error(
    '  A citation that resolves to nothing reads exactly as well as one that resolves. Repair the',
  );
  console.error(
    '  sentence to name a finding that exists; do not renumber, because every citation that works',
  );
  console.error('  today would move with the numbers.');
  process.exit(1);
}

console.log(
  `check-citations: OK (${String(citations.length)} citation(s) of ${String(new Set(citations.map((one) => one.number)).size)} ` +
    `number(s) across ${String(files.length)} file(s), each naming a finding that exists; ` +
    `absent from the sequence: ${absent.length === 0 ? 'none' : absent.join(', ')})`,
);
