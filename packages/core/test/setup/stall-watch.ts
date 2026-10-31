import { afterAll } from 'vitest';

import {
  budgetFromEnvironment,
  recordStall,
  stallVerdict,
  startStallWatch,
  STALL_INTERVAL_MS,
} from '../support/event-loop-stall.js';

/**
 * The suite's own stopwatch, registered for every test file in this package.
 *
 * A test file that holds the event loop longer than the worker's RPC deadline
 * makes vitest exit non-zero **with every test passing**, which is the worst
 * shape a red can take: nothing in the report says which file did it, and the
 * obvious response -- re-run it -- passes. `support/event-loop-stall.ts` explains
 * the mechanism and `docs/audit/volume-09.md` (finding 290) records the
 * measurement; this file is the hook that turns it into a failure attributed to
 * the file that caused it.
 *
 * Deliberately a setup file rather than a test: a test that measured the *suite*
 * would have to run the suite, and a test that measured *itself* would measure the
 * one file that is not being asked about.
 */
const budgetMs = budgetFromEnvironment();
const watch = startStallWatch({ intervalMs: STALL_INTERVAL_MS });

afterAll((suite) => {
  const longestMs = watch.stop();
  // The report first, so a file that is over budget is still measured: the gate throws below, and a
  // throw before the write would lose the one reading a red run is worth having.
  recordStall({ file: 'filepath' in suite ? suite.filepath : suite.name, longestMs, budgetMs });
  const verdict = stallVerdict(longestMs, budgetMs);
  if (verdict !== undefined) throw new Error(verdict);
});
