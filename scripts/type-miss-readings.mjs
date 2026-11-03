#!/usr/bin/env node
/**
 * The readings `probe-type-misses.mjs` prints, as functions rather than as a program.
 *
 * ## Why this is a second file
 *
 * Two rules meet here and the first one wins.
 *
 * `scripts-are-classified.test.ts` states the first: **a gate may be spawned by a
 * test, never imported by one.** The reason is mechanical rather than stylistic.
 * `verify-gates-are-testable.mjs` proves a gate by emptying it and requiring the
 * suite to go red *and to name a failing test*; a gate that a test imports is
 * emptied at the import, so the worker dies before vitest can attribute a failure
 * and the meta-gate reports `UNATTRIBUTED`. The repair named in that test's own
 * message is the one taken here -- *move the reading into a data module and leave
 * the verdict in the gate* -- and `ci-budget.mjs`, `format-spec.mjs`,
 * `staged-mutation.mjs` and `git-hooks.mjs` are the four earlier times it was taken.
 *
 * The second rule is the one that made the move worth doing rather than merely
 * legal. Three throws in `probe-type-misses.mjs` were published as `exempt` with
 * the same sentence: *the same check as a proved line above them, in a block that
 * runs later, so these cannot be the one that reports.* The sentence is true, and
 * it is a description of **duplicated code**:
 *
 *  - `recordedTypeMisses` and `recordedCategoryMisses` each held their own copy of
 *    "this run is not in the table" -- the same map, the same key, the same
 *    message;
 *  - `denialEvidence` and `derivationEvidence` each held their own copy of "this
 *    corpus carries no `samples` array" -- and they were copying it about **the
 *    same file**, since both resolve to `golden-master/fault-extraction/samples.json`
 *    (the second through `DATASET`, the first through a path built inline).
 *
 * So the row could not be proved because the refusal existed twice, and the copy in
 * front always fired first. Writing it once removes the row instead of proving it,
 * which is the honest repair: a guard nobody can reach is a guard that is not doing
 * any work, and the work it looked like it was doing was being done by its twin.
 *
 * ## What the guards became, and why they are now reachable
 *
 * | guard | before | after |
 * | --- | --- | --- |
 * | unknown run | two copies, one reachable | one `runBody`, one line |
 * | corpus without `samples` | two copies of one check on one file | one `readSamplesCorpus`, one line |
 *
 * Both are now reachable because both **take what they read**: `runBody(run)` takes
 * the run name, `readSamplesCorpus(path)` takes the path. A guard whose input is a
 * constant is a guard no test can hand a bad input to, and `probe-type-misses-refusals.test.ts`
 * hands each of them one.
 *
 * ## What stays in the probe
 *
 * Everything that prints. `main()` builds the report, formats it, and decides the
 * exit status; this module has no `main`, no exit and no verdict, which is what
 * makes it a `data` module in the register rather than a probe in disguise.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseMissDetail } from '../packages/core/dist/index.js';

const HERE = dirname(fileURLToPath(import.meta.url));

/** The checkout, from this file's own location -- not from the caller's cwd. */
export const REPO = resolve(HERE, '..');

/**
 * The `type` misses of a recorded run, read from the recorded annotation.
 *
 * Each fixture is the verbatim annotation body of the run it names, with escapes
 * intact. Reading them through `parseMissDetail` rather than carrying a
 * transcription is the repair for the defect this script caused: it used to hold a
 * copy of run `9932e766c`'s rows inline, exact against that run, and a later
 * reading quoted those rows as the answers of run `567118aea`. Eight of fourteen
 * rows disagreed with the annotation and two rows were attributed a `type` miss
 * that their run assigned to `component`.
 *
 * A figure that cannot be re-derived is worth less than one whose provenance is
 * stated -- so the provenance is stated, by deriving it.
 */
export const RUNS = {
  /** The current format: rows joined with U+001F. type=5/19. */
  '567118aea': 'miss-detail-567118aea.txt',
  /** Before finding 70 changed the separator: rows joined with a space. type=4/19. */
  '9932e766c': 'miss-detail-9932e766c.txt',
};

/** The run this script reads by default: the most recent recorded one. */
export const DEFAULT_RUN = '567118aea';

/**
 * Every row of one recorded run.
 *
 * The one place that decides what a run name has to be, so that "unknown run" is
 * reported once. It **throws rather than returning an empty set**: a run that is
 * not in the table has to stop a reading rather than silently become a reading of
 * nothing, which is what a `?? DEFAULT_RUN` would have done -- and what the defect
 * this probe replaced actually did.
 */
export function runBody(run) {
  const file = RUNS[run];
  if (file === undefined) {
    throw new Error(`unknown run '${run}'; recorded runs are ${Object.keys(RUNS).join(', ')}`);
  }
  return parseMissDetail(readFileSync(resolve(REPO, 'packages', 'core', 'test', 'fixtures', file), 'utf8'));
}

/** Read a recorded run's `type` misses. */
export function recordedTypeMisses(run) {
  return {
    run,
    rows: runBody(run)
      .filter((row) => row.field === 'type')
      .map((row) => [row.sampleId, row.expected, row.actual ?? '(omitted)']),
  };
}

/**
 * Read a recorded run's `category` misses.
 *
 * The same fixture as `recordedTypeMisses`, filtered on a different field. Both
 * fields are in one annotation body, so reading them through one parser is what
 * keeps the two blocks agreeing about which run they describe -- finding 92's
 * defect was a block quoting rows from a run it did not name.
 */
export function recordedCategoryMisses(run) {
  return runBody(run).filter((row) => row.field === 'category');
}

/**
 * A golden corpus, with the one property every reader of it requires.
 *
 * `path` is a parameter rather than a constant because the corpus this repository
 * ships always carries `samples`: a guard on a fixed path can only ever fire on a
 * file nobody has, which is why the same refusal was published twice as `exempt`
 * and never executed. Taking the path is also what lets the two callers share one
 * check instead of holding two copies of it over the same file.
 */
export function readSamplesCorpus(path) {
  const golden = JSON.parse(readFileSync(path, 'utf8'));
  if (!Array.isArray(golden.samples)) {
    throw new Error(`${path} carries no samples array`);
  }
  return golden;
}
