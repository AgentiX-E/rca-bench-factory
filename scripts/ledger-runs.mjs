#!/usr/bin/env node
/**
 * The workflow runs the progress ledger reports, read as data.
 *
 * ## Why a recording needs this
 *
 * `golden-master/ci-baseline.json` sizes every step bound in `ci.yml`, and it holds one
 * run: the run somebody measured. The gate that reads it can check the bounds against
 * the numbers, check the numbers against the workflow, and check that the job budgets
 * can hold the bounds -- and still be blind to the one thing that makes all of it
 * describe the shipped tree, which is **whether the recording is the run the round
 * reported**.
 *
 * That blindness has a shape, and it was observed rather than imagined: on the round
 * that introduced the recording's job coverage, the tree shipped at `91e320884`, the
 * progress ledger gained a CI row citing run `41677264353`, and the recording stayed
 * at run `41670923224` -- one commit and one run behind. Nothing refused it. A stale
 * recording does not look stale from inside: every number in it is a real measurement
 * of a real tree, and the only thing that has moved is which tree.
 *
 * ## Why the ledger is the right second opinion
 *
 * The ledger is where a round says which run it ended on, in a row that starts `| CI |`

 * One caveat, stated because the rule cannot check it: a row labelled `CI` is assumed to
 * cite runs of **this** workflow. The repository runs a second workflow (`Anchor round
 * trip`) whose run ids sit in the same sequence, so a row that quoted one of those would
 * make `R7` demand a recording from a run whose jobs are not in `ci.yml` -- and
 * `measure-ci-baseline.mjs` would then refuse with "holds no job named ...", which is the
 * right answer to the wrong question. The convention is what keeps the two apart, and it
 * is written here rather than enforced because the only evidence is the row's own label.
 * and reports the jobs' wall clock. Those rows are written after the run is green,
 * because a row that reports a red run's timings is not a closing reading. So the
 * newest run in a CI row is a run this repository has already looked at, and the
 * recording has no business being older than it.
 *
 * ## What a run id is, and what it is not
 *
 * Ten to twelve digits, bounded by non-digits. The rows also cite commits, in this
 * repository's nine-character convention, so a commit cannot be read as a run by
 * length; a *full* forty-character hash would contain such a run of digits about one
 * time in ten thousand, and it is excluded by the trailing-digit boundary rather than
 * by hope -- a forty-character hash written between backticks is not a bare number, and
 * the ledger's own convention is the short form. The pattern is stated here, in one
 * place, because both the reader and its tests have to agree about it.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
export const VOLUMES = join(ROOT, 'docs', 'progress');

/** The ledger's closing reading for a round: a table row whose first cell is `CI`. */
export const CI_ROW = /^\|\s*CI\s*\|/;

/** A workflow run id: ten to twelve digits and nothing else. */
export const RUN_ID = /\d{10,12}/;

/** Every run id on one line, in the order they are written. */
export function runsIn(line) {
  const runs = [];
  let rest = line;
  for (;;) {
    const match = RUN_ID.exec(rest);
    if (match === null) break;
    const before = rest[match.index - 1];
    const after = rest[match.index + match[0].length];
    const boundedBefore = before === undefined || !/\d/.test(before);
    const boundedAfter = after === undefined || !/\d/.test(after);
    if (boundedBefore && boundedAfter) runs.push(Number(match[0]));
    rest = rest.slice(match.index + match[0].length);
  }
  return runs;
}

/**
 * The CI rows of one volume, with the runs each cites.
 *
 * A row that names no run is kept as `unnamed` rather than refused. Three rows in this
 * log predate the convention -- they report what a job looked like rather than what a
 * run measured -- and naming a run for them now would be inventing provenance from
 * memory, which is the one thing a recording may never do. What the rule needs from
 * them is not a number: it needs the **newest** row to name one, because that is the row
 * the recording is compared against.
 */
export function ledgerRows(name, text) {
  const rows = [];
  const unnamed = [];
  const lines = text.split('\n');
  let tail = null;
  lines.forEach((line, index) => {
    if (!CI_ROW.test(line)) return;
    const runs = runsIn(line);
    const row = { file: name, line: index + 1, runs };
    tail = row;
    if (runs.length === 0) unnamed.push(row);
    else rows.push(row);
  });
  return { rows, unnamed, tail };
}

/** The newest run cited by any row: run ids increase with the run, so the maximum is the last. */
export function newestOf(rows) {
  let newest = null;
  for (const row of rows) {
    for (const run of row.runs) {
      if (newest === null || run > newest.run) newest = { run, file: row.file, line: row.line };
    }
  }
  return newest;
}

/**
 * Every volume, with the runs the ledger cites and the rows that cite none.
 *
 * `read` is false only when there is no volume directory at all. It is carried rather
 * than collapsed into "no citations", because the two are different facts: a tree with
 * no ledger has nothing to be stale against, and a tree whose ledger could not be read
 * has a question nobody asked.
 */
export function readLedger(dir = VOLUMES) {
  let names;
  try {
    names = readdirSync(dir)
      .filter((name) => /^volume-\d+\.md$/.test(name))
      .sort();
  } catch {
    return { read: false, rows: [], unnamed: [], newest: null, tail: null };
  }

  const rows = [];
  const unnamed = [];
  let tail = null;
  for (const name of names) {
    const one = ledgerRows(name, readFileSync(join(dir, name), 'utf8'));
    // Copied one row at a time rather than spread: a ledger's length is a function of how
    // long the log is, and a spread is an argument list. `no-size-dependent-spread` refuses
    // the shape, and the refusal is right -- the argument limit is reached silently.
    for (const row of one.rows) rows.push(row);
    for (const row of one.unnamed) unnamed.push(row);
    // The last volume that carries a CI row holds the newest one: volumes are ordered by
    // the rounds they hold, and a round cannot report a run before the round before it.
    tail = one.tail ?? tail;
  }
  // Rows arrive in volume order and, inside a volume, in the order they were written,
  // so the last one is the round's own closing reading. `newest` is the maximum run id
  // rather than the last row's, because a round may report an older run after a newer
  // one -- a correction reads that way -- and the comparison has to use the newest.
  return {
    read: true,
    rows,
    unnamed,
    newest: newestOf(rows),
    tail,
  };
}
