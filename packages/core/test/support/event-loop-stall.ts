import { performance } from 'node:perf_hooks';

/**
 * How long a test file may hold the event loop before the run is not a reading.
 *
 * ## The defect this measures
 *
 * Vitest runs each test file in a forked worker, and the worker and the main
 * process talk over a bridge (`birpc`) whose every call carries a deadline. That
 * deadline is **60 seconds**, hard-coded in the bridge as `DEFAULT_TIMEOUT` and
 * not configurable through any vitest option -- `RPC_DEADLINE_MS` below is
 * checked against the installed artifact rather than trusted, in
 * `stall-budget.test.ts`.
 *
 * The worker calls `onTaskUpdate` after every task and the main process answers
 * it. If the worker spends longer than the deadline inside one *synchronous*
 * stretch, its own event loop never reaches the timers phase, so it cannot read
 * the answer that has already arrived; when the loop finally turns, the first
 * thing it sees is an expired timer, and it throws
 *
 *     [vitest-worker]: Timeout calling "onTaskUpdate"
 *
 * Vitest treats that as an unhandled error: **every test passes and the run exits
 * non-zero**. That is what CI run `40886479390` reported on commit `76b8a02f4`,
 * with `Test Files 192 passed`, `Tests 4807 passed`, `Errors 1 error`, coverage
 * complete, and no failing test anywhere in the log.
 *
 * ## Why a gauge rather than a lint rule
 *
 * Whether a file blocks is a property of what it *does*, not of how it is spelled.
 * A file may spawn ten children asynchronously and still block by hashing two
 * gigabytes of bytes in a loop; another may spawn one child synchronously and be
 * harmless. The measurement below is the property itself: the longest stretch
 * during which the loop did not turn.
 *
 * `startStallWatch` samples on a fixed interval and records how late each sample
 * was. A sample that arrives 40 s late is a 40 s stall, and nothing but blocked
 * code can produce one.
 */

/**
 * The bridge's per-call deadline, in milliseconds.
 *
 * Read from `birpc`'s own source rather than copied from the error message, and
 * held equal to the installed value by `stall-budget.test.ts`. It is 60 000
 * because `createBirpc` destructures `timeout = DEFAULT_TIMEOUT` with
 * `DEFAULT_TIMEOUT = 6e4`, and vitest's forks pool passes no override -- which is
 * why the number is a fact about the dependency and not a knob this repository
 * chose.
 */
export const RPC_DEADLINE_MS = 60_000;

/**
 * How often the gauge samples, in milliseconds.
 *
 * Small enough that a stall's measurement error is a rounding error against the
 * 45 000 ms budget, and large enough that 192 files sampling it costs nothing.
 */
export const STALL_INTERVAL_MS = 50;

/**
 * The budget, at three quarters of the deadline.
 *
 * The margin is not tidiness. The deadline runs from the moment a call is posted,
 * so a file may enter its last stall immediately after posting one; a budget equal
 * to the deadline would leave a file that hits it exactly one call away from
 * failing. Three quarters keeps the largest legitimate blocking work in the suite
 * -- `typecheck-entrypoint.test.ts` at 36.7 s and `ingest-report.test.ts` at 33.6 s,
 * both CPU-bound rather than blocked children -- inside the budget while leaving
 * 15 s of headroom to the deadline.
 *
 * Measured on the run that produced this file: the two files above are the only
 * ones over 20 s, and the file that failed CI was at **61.2 s**.
 */
export const STALL_BUDGET_MS = 45_000;

/** Environment override, so a battery can lower the budget instead of waiting 45 s. */
export const STALL_BUDGET_ENV = 'RCA_BENCH_STALL_BUDGET_MS';

/** The budget in force for this process. */
export function budgetFromEnvironment(environment: NodeJS.ProcessEnv = process.env): number {
  const raw = environment[STALL_BUDGET_ENV];
  if (raw === undefined || raw === '') return STALL_BUDGET_MS;
  const parsed = Number(raw);
  // A malformed override is refused rather than read as zero: a budget of zero
  // fails every file, and the message would blame the suite for a typo.
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${STALL_BUDGET_ENV} must be a positive number of milliseconds, not '${raw}'`);
  }
  return parsed;
}

/** A running measurement. `stop` returns the longest stall it saw, in milliseconds. */
export interface StallWatch {
  stop(): number;
}

/**
 * Start sampling the event loop, and report the longest stretch it stayed blocked.
 *
 * The timer is `unref`'d so a gauge can never be the reason a process stays alive,
 * and `now` is injectable so the arithmetic can be tested without waiting for
 * wall-clock time -- the alternative is a test that takes 45 seconds to check a
 * subtraction.
 */
export function startStallWatch(
  options: {
    intervalMs?: number;
    now?: () => number;
    schedule?: (tick: () => void, intervalMs: number) => { cancel(): void };
  } = {},
): StallWatch {
  const now = options.now ?? (() => performance.now());
  const intervalMs = options.intervalMs ?? STALL_INTERVAL_MS;
  let due = now() + intervalMs;
  let longest = 0;

  const tick = (): void => {
    const at = now();
    longest = Math.max(longest, at - due);
    // The next sample is due one interval after *this* one actually ran, so the
    // measurement is per-stall rather than cumulative: a loop that is late by a
    // second once must not make every later sample count as late too.
    due = at + intervalMs;
  };

  const schedule =
    options.schedule ??
    ((sampler: () => void, every: number) => {
      const timer = setInterval(sampler, every);
      timer.unref();
      return { cancel: () => clearInterval(timer) };
    });

  const handle = schedule(tick, intervalMs);
  return {
    stop: () => {
      handle.cancel();
      // The stretch in progress when the file ended is a stall too, and it is
      // the one a test that blocks *last* produces. Without this line a file
      // whose only long block is its final statement reports zero: the sampler's
      // timer cannot fire while the loop is blocked, so the block is measured by
      // reading the clock at the moment the file asks for the number.
      longest = Math.max(longest, now() - due);
      return longest;
    },
  };
}

/**
 * What to say about a file that stayed blocked too long, or `undefined` if it did not.
 *
 * A function rather than an `if` at the one call site, because the message is the
 * only part of this instrument a reader ever sees and `stall-budget.test.ts`
 * asserts it names the budget, the deadline and the measured stall.
 */
export function stallVerdict(longestMs: number, budgetMs: number = STALL_BUDGET_MS): string | undefined {
  if (longestMs <= budgetMs) return undefined;
  return (
    `this test file held the event loop for ${Math.round(longestMs)} ms, past the ${budgetMs} ms budget. ` +
    `The worker's RPC to the main process has a ${RPC_DEADLINE_MS} ms deadline, and a file that blocks ` +
    'longer than it turns a green suite into a non-zero exit with no failing test: see ' +
    '`docs/audit/volume-09.md` and the controlled pair in `stall-budget.test.ts`. Await the child, ' +
    'or split the file.'
  );
}
