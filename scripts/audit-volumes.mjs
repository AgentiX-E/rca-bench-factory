#!/usr/bin/env node
/**
 * What the audit log's split means, as functions and no verdict.
 *
 * ## Why this is not in the gate
 *
 * `check-audit-volumes.mjs` is a gate, and `verify-gates-are-testable.mjs` proves
 * a gate by hollowing it out -- replacing its body with `process.exit(0)` -- and
 * requiring the suite to go red. A suite that *imports* the hollowed file dies at
 * its first statement and reports "exited 1 and named no failing test", which is
 * the meta-gate's word for "unattributed". That is exactly what happened when
 * these functions lived in the gate: every one of their tests was in the same
 * import graph as the file being emptied.
 *
 * So the reading lives here and the verdict lives next door. The module has no
 * `main` and no exit; the suite imports it, and spawns the gate for the exit code.
 *
 * ## What the split is for
 *
 * `docs/audit.md` reached 1.1 MB, and a file that size stops being a document and
 * starts being a pile: a reader cannot find a finding without `grep`, and the
 * push that carries one new finding carries the whole thing. Worse, the size was
 * not the only cost -- the log had grown **two heading conventions** (`## 49 — …`
 * for the first sixty-four findings, `## Finding 49 — …` after that), so a census
 * that matched one of them under-counted by a third and said nothing about it.
 *
 * One index, four volumes, one heading convention.
 *
 * ## What is enforced
 *
 * 1. The volumes are `docs/audit/volume-NN.md`, numbered from `01`, contiguous.
 * 2. Each is under `MAX_BYTES`, so the next finding has room and the push that
 *    carries it stays small.
 * 3. Findings are numbered in one form and strictly increasing across the whole
 *    log -- a duplicate is two entries claiming one number, and a decrease is two
 *    volumes that disagree about the order.
 * 4. `docs/audit.md` names every volume exactly once, in a row whose range and
 *    entry count are the file's rather than the row's claim.
 *
 * A number that is **absent** is reported rather than refused. The log has three
 * (118, 132, 133) and no record of why; inventing a reason for a hole would be
 * worse than printing it.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const ROOT = resolve(import.meta.dirname, '..');
export const INDEX = join(ROOT, 'docs', 'audit.md');
export const VOLUMES = join(ROOT, 'docs', 'audit');
export const MAX_BYTES = 280_000;

/** `## Finding 12 — ...`, which is the only heading form the log may use. */
const HEADING = /^## Finding (\d+) — /;

/**
 * The four forms the log used before this check existed.
 *
 * All four were in one document, and a census that matched `## Finding N — ` found
 * 127 entries where there were 191. The check exists so that cannot happen again:
 * one form, and a red gate for the other four.
 */
const LEGACY = [/^## \d+ — /, /^## Finding \d+\s*:\s/, /^## Finding \d+\s*--\s/, /^## Finding \d+\.\s/];

/**
 * Read the volumes in order, and report everything wrong with them.
 *
 * Pure over the files it is given, so a test can drive it with a fixture directory
 * instead of the repository's own log.
 */
export function readVolumes(dir = VOLUMES) {
  let names;
  try {
    names = readdirSync(dir).filter((name) => /^volume-\d+\.md$/.test(name)).sort();
  } catch {
    return {
      volumes: [],
      errors: [
        `no \`${dir.replace(`${ROOT}/`, '')}/\` directory: the log is split into volumes, and an index ` +
          'with no volumes behind it is a table of contents for a book that is not there',
      ],
      numbers: [],
    };
  }

  const errors = [];
  const volumes = [];
  const numbers = [];

  names.forEach((name, position) => {
    const expected = `volume-${String(position + 1).padStart(2, '0')}.md`;
    if (name !== expected) {
      errors.push(
        `${name}: volumes are numbered from 01 without gaps, so this one should be \`${expected}\`. ` +
          'Renumbering is a rename plus one row in the index',
      );
    }
    const path = join(dir, name);
    const text = readFileSync(path, 'utf8');
    const bytes = statSync(path).size;
    if (bytes > MAX_BYTES) {
      errors.push(
        `${name} is ${String(bytes)} bytes, and the budget is ${String(MAX_BYTES)}: start \`${expected.replace('.md', '')}` +
          '\` as the next volume, move the newest finding into it, and add its row to docs/audit.md',
      );
    }

    const found = [];
    // A fence is tracked because a finding may **quote** the old heading forms --
    // the one that documents this defect does exactly that -- and a quoted heading
    // is not a heading. The guard's first run after that finding was written
    // reported four errors against its own example block, which is the guard being
    // right about the text and wrong about the document.
    let fenced = false;
    for (const line of text.split('\n')) {
      if (/^\s*(```|~~~)/.test(line)) {
        fenced = !fenced;
        continue;
      }
      if (fenced) continue;
      const modern = HEADING.exec(line);
      if (modern !== null) {
        found.push(Number(modern[1]));
        continue;
      }
      if (LEGACY.some((form) => form.test(line))) {
        errors.push(
          `${name}: \`${line.trim()}\` is one of the old heading forms. A finding is \`## Finding <n> — <title>\`, ` +
            'because four forms meant a census that matched one of them counted 127 of 191 entries',
        );
      }
    }
    if (found.length === 0) errors.push(`${name}: no \`## Finding <n> — \` heading, so it holds no findings`);
    volumes.push({ name, bytes, first: found[0] ?? null, last: found.at(-1) ?? null, count: found.length });
    // A loop rather than `numbers.push(...found)`: the length is a function of how
    // many findings the volume holds, and a spread of a growing array into a call
    // is the same defect the guard in `bounded-spread` exists to catch.
    for (const number of found) numbers.push(number);
  });

  if (volumes.length === 0 && errors.length === 0) errors.push('no volumes, so there is no log');

  for (let i = 1; i < numbers.length; i += 1) {
    if (numbers[i] === numbers[i - 1]) {
      errors.push(`finding ${String(numbers[i])} appears twice: two entries claiming one number`);
    } else if (numbers[i] < numbers[i - 1]) {
      errors.push(
        `finding ${String(numbers[i])} comes after ${String(numbers[i - 1])}: the log is ordered by number, ` +
          'and a volume that starts below the previous one ends has been moved or merged wrongly',
      );
    }
  }

  return { volumes, errors, numbers };
}

/** The numbers absent from a run of findings, as `118, 132–133`. */
export function absentNumbers(numbers) {
  if (numbers.length === 0) return '';
  const present = new Set(numbers);
  const [first] = numbers;
  const last = numbers.at(-1);
  const missing = [];
  for (let n = first; n <= last; n += 1) if (!present.has(n)) missing.push(n);
  const runs = [];
  for (const n of missing) {
    const run = runs.at(-1);
    if (run !== undefined && run[1] === n - 1) run[1] = n;
    else runs.push([n, n]);
  }
  return runs.map(([a, b]) => (a === b ? String(a) : `${String(a)}–${String(b)}`)).join(', ');
}

/**
 * Whether the index mentions each volume exactly once, and with the right numbers.
 *
 * The row's range and entry count are **checked** rather than trusted: a table of
 * contents that has drifted is worse than no table, because a reader picks a volume
 * by it. Every append to the last volume has to update one row, and this is what
 * says so when it does not.
 */
export function indexCovers(indexText, volumes) {
  const errors = [];
  const rows = new Map();
  for (const line of indexText.split('\n')) {
    const row = /^\| \[(volume-\d+\.md)\]\(audit\/volume-\d+\.md\) \| (\d+)–(\d+) \| (\d+) \|/.exec(line);
    if (row !== null) rows.set(row[1], { first: Number(row[2]), last: Number(row[3]), count: Number(row[4]) });
  }
  for (const volume of volumes) {
    const mentions = indexText.split(`audit/${volume.name}`).length - 1;
    if (mentions !== 1) {
      errors.push(
        `docs/audit.md mentions \`audit/${volume.name}\` ${String(mentions)} time(s); every volume needs exactly ` +
          'one row in the index, or a volume exists that a reader cannot reach',
      );
      continue;
    }
    const row = rows.get(volume.name);
    if (row === undefined) {
      errors.push(
        `docs/audit.md names \`audit/${volume.name}\` but not in a row this reader can read: the row is ` +
          '`| [volume-NN.md](audit/volume-NN.md) | first–last | entries | opening line |`',
      );
      continue;
    }
    if (row.first !== volume.first || row.last !== volume.last || row.count !== volume.count) {
      errors.push(
        `docs/audit.md says ${volume.name} holds ${String(row.first)}–${String(row.last)} ` +
          `(${String(row.count)} entries); the file holds ${String(volume.first)}–${String(volume.last)} ` +
          `(${String(volume.count)}). Update the row -- a table of contents that has drifted is worse than none`,
      );
    }
  }
  return errors;
}

/** Every reading this check takes, over files it is handed rather than the ones it ships with. */
export function check(indexText, dir = VOLUMES) {
  const { volumes, errors, numbers } = readVolumes(dir);
  // A loop, not `errors.push(...indexCovers(...))`: the array is one entry per
  // volume, and a spread into a call is the shape this repository's bounded-spread
  // guard exists to keep out -- including from the guard that has just been written.
  for (const problem of indexCovers(indexText, volumes)) errors.push(problem);
  return {
    ok: errors.length === 0,
    errors,
    volumes,
    numbers,
    summary:
      `check-audit-volumes: ${errors.length === 0 ? 'OK' : 'FAILED'} — ${String(volumes.length)} volume(s), ` +
      `${String(numbers.length)} finding(s)` +
      (numbers.length === 0 ? '' : `, ${String(numbers[0])}–${String(numbers.at(-1))}`) +
      (volumes.length === 0
        ? ''
        : `; largest ${Math.max(...volumes.map((one) => one.bytes)).toLocaleString('en-US')} of ` +
          `${MAX_BYTES.toLocaleString('en-US')} bytes`) +
      (absentNumbers(numbers) === '' ? '' : `; absent: ${absentNumbers(numbers)}`),
  };
}
