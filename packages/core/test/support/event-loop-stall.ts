import { appendFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
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
 * The budget: the largest value the deadline admits, and above every legitimate file measured.
 *
 * It used to be described as "three quarters of the deadline", which is a ratio rather than a
 * reading. Two measurements now bound it, and both are held by `stall-budget.test.ts`:
 *
 * - **below**, the worst legitimate stall observed on the slowest runner this suite runs on: a
 *   four-CPU CI runner, where `typecheck-entrypoint.test.ts` held the loop for 36.7 s and
 *   `ingest-report.test.ts` for 33.6 s, both CPU-bound work rather than blocked children. A budget
 *   at or under those would fail files that are doing exactly what they are for;
 * - **above**, 15 s below the deadline. The deadline runs from the moment a call is posted, so a
 *   file may enter its last stall immediately after posting one; a budget equal to the deadline
 *   would leave a file that hits it exactly one call away from failing.
 *
 * The two bounds are 44,040 ms and 45,000 ms, which is why the number is a ceiling and not a round
 * figure. What the suite actually spends is measured rather than assumed: with
 * `RCA_BENCH_STALL_REPORT=<path>` the hook writes one line per file -- 211 files on a 32-core box,
 * median 4 ms, 95th percentile 1,583 ms, max 7,250 ms, seventeen files over a second and two over
 * five -- so the headroom this budget leaves is a number a reader can reproduce instead of a
 * margin somebody chose.
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

/**
 * The longest stall a file produced, in **two** quantities.
 *
 * `longestMs` is the one the budget is applied to, because the deadline it guards
 * is a wall clock: a worker that is not running when its bridge deadline expires
 * misses it just as surely as one that is running its own code. `cpuMs` is the
 * processor time this process actually spent inside that same window, and the two
 * are not the same number.
 *
 * ## Why both, measured rather than argued
 *
 * On a five-CPU box, `gate-sites-are-proven.test.ts` -- one file, one revision, one
 * command -- produced all of these:
 *
 *     alone, with coverage            11,547 ms
 *     full suite, 2 workers           14,448 ms
 *     full suite, 4 workers           23,897 / 43,895 / 47,727 ms
 *
 * The last of those is past the 45,000 ms budget, with 6,246 of 6,246 tests
 * passing, and the only thing that changed between the readings is what else was
 * running. The gauge was calling all four of them "this file held the event loop",
 * which is a statement about the *file*; three of the four readings are mostly a
 * statement about the *machine*. Splitting the number is what lets a reader tell
 * them apart: a stall whose `cpuMs` is close to its `longestMs` is code that ran
 * without turning the loop; a stall whose `cpuMs` is a fraction of it is a process
 * that was not being scheduled.
 *
 * What the split does **not** do is change the verdict. The failure mode is
 * wall-clock, so the budget stays on wall-clock time; the CPU figure is what makes
 * a red legible instead of mysterious.
 */
export interface StallMeasurement {
  /** The longest stretch during which the loop did not turn, in milliseconds. */
  readonly longestMs: number;
  /**
   * The CPU time this process consumed during that same stretch, in milliseconds.
   *
   * Every thread the process owns, which is `process.cpuUsage()`'s definition: a block that
   * spends its wall time in a thread pool or in GC can report **more** CPU than wall, and
   * `ingest-report.test.ts` did (11,586 ms of CPU inside a 9,814 ms stall). So this is not
   * "the CPU of the blocked statement" -- it is the processor time the window contains, and
   * the reading is used the other way round: a CPU figure far *below* the wall figure says
   * the process spent the window not running its own code, which is the case that matters
   * for the two remedies.
   */
  readonly cpuMs: number;
}

/** A running measurement. `stop` returns the longest stall it saw, in both quantities. */
export interface StallWatch {
  stop(): StallMeasurement;
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
    cpuNow?: () => number;
    schedule?: (tick: () => void, intervalMs: number) => { cancel(): void };
  } = {},
): StallWatch {
  const now = options.now ?? (() => performance.now());
  const cpuNow =
    options.cpuNow ??
    (() => {
      const usage = process.cpuUsage();
      return (usage.user + usage.system) / 1000;
    });
  const intervalMs = options.intervalMs ?? STALL_INTERVAL_MS;
  let due = now() + intervalMs;
  let longest = 0;
  let longestCpu = 0;
  // CPU time is cumulative, so it cannot be read as "the cost of that block". It is
  // sampled at every tick instead, and the delta belongs to the window that just
  // ended -- which is the interval the sample was due at plus whatever the sample
  // was late by. So `cpuMs` overstates the block by at most one interval: against a
  // budget of 45,000 ms that is a rounding error, and it is stated here rather than
  // left for a reader to discover.
  let cpuAtLast = cpuNow();

  const tick = (): void => {
    const at = now();
    const cpu = cpuNow();
    const late = at - due;
    if (late > longest) {
      longest = late;
      longestCpu = Math.max(0, cpu - cpuAtLast);
    }
    // The next sample is due one interval after *this* one actually ran, so the
    // measurement is per-stall rather than cumulative: a loop that is late by a
    // second once must not make every later sample count as late too.
    due = at + intervalMs;
    cpuAtLast = cpu;
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
      const at = now();
      const cpu = cpuNow();
      const late = at - due;
      if (late > longest) {
        longest = late;
        longestCpu = Math.max(0, cpu - cpuAtLast);
      }
      return { longestMs: longest, cpuMs: longestCpu };
    },
  };
}

/**
 * What to say about a file that stayed blocked too long, or `undefined` if it did not.
 *
 * A function rather than an `if` at the one call site, because the message is the
 * only part of this instrument a reader ever sees and `stall-budget.test.ts`
 * asserts it names the budget, the deadline and the measured stall.
 *
 * The message names the CPU time as well as the wall time, because the two together are
 * the difference between the two causes of a red here, and the sentence this replaces
 * gave one piece of advice -- "await the child" -- for both. A file that spends its
 * stall running its own code (`cpuMs` close to `longestMs`) has to be made cheaper or
 * split; a file that spends it waiting synchronously on a child (`cpuMs` a fraction of
 * `longestMs`) has to await that child. It does not classify the reading for the
 * reader: a low CPU figure is also what a process that was not being scheduled looks
 * like, and this instrument cannot tell those apart, so it prints both numbers and the
 * two ways to read them instead of asserting which one it was.
 */
export function stallVerdict(
  measurement: StallMeasurement | number,
  budgetMs: number = STALL_BUDGET_MS,
): string | undefined {
  // A bare number is still accepted so that a caller which has only the wall clock
  // -- an old battery, a shell -- cannot silently be read as "zero CPU". The
  // sentence then says the split was not measured instead of printing a zero.
  const longestMs = typeof measurement === 'number' ? measurement : measurement.longestMs;
  if (longestMs <= budgetMs) return undefined;
  const split =
    typeof measurement === 'number'
      ? 'This reading did not measure how much of it was CPU time.'
      : `Of that, ${Math.round(measurement.cpuMs)} ms were this process's own CPU time: a stall that is ` +
        'nearly all CPU is this file running its own code, and one that is mostly not is a child it ' +
        'waited for synchronously or a machine that was not scheduling it.';
  return (
    `this test file held the event loop for ${Math.round(longestMs)} ms, past the ${budgetMs} ms budget. ` +
    `${split} The worker's RPC to the main process has a ${RPC_DEADLINE_MS} ms deadline, and a file that ` +
    'blocks longer than it turns a green suite into a non-zero exit with no failing test: see ' +
    '`docs/audit/volume-09.md` and the controlled pair in `stall-budget.test.ts`. Await the child, ' +
    'or split the file.'
  );
}

/** Where the suite writes the stall it measured per file, when anything asks it to. */
export const STALL_REPORT_ENV = 'RCA_BENCH_STALL_REPORT';

/** One file's measurement, as the report records it. */
export interface StallEntry {
  /** The test file, relative to the repository root: a path that survives a different checkout. */
  readonly file: string;
  /** The longest stretch the loop did not turn, in milliseconds. */
  readonly longestMs: number;
  /** The CPU time this process spent inside that stretch, in milliseconds. */
  readonly cpuMs: number;
  readonly budgetMs: number;
}

/**
 * One line of the report: the file, how long it held the loop, and the budget in force.
 *
 * A line per file rather than a summary, because the summary is the one thing the gate already
 * produces (it fails the file that was over) and the distribution is what nothing could see: which
 * files are near the budget, how near, and whether the worst of them is the same file every run.
 * JSONL so that a reader can sort it without a parser and a shell can `grep` it.
 *
 * `cpuMs` is on the line for the reason it is in the verdict: a distribution of wall-clock stalls
 * cannot tell the files that block apart from the hours when the box was busy, and sorting by the
 * difference between the two is what answers "is this reading about my code or about the runner".
 */
export function stallReportLine(entry: StallEntry, root: string): string {
  return `${JSON.stringify({
    file: relative(root, resolve(entry.file)),
    longestMs: Math.round(entry.longestMs),
    cpuMs: Math.round(entry.cpuMs),
    budgetMs: entry.budgetMs,
  })}\n`;
}

/**
 * Append this file's measurement to the report the environment names, and do nothing otherwise.
 *
 * Reading the environment rather than taking a flag keeps the call site one line: the hook runs for
 * every file in the suite, and a hook that had to decide whether it was asked would be a second
 * place for the answer to differ from the report's. `append` is injectable so the line and the path
 * can be asserted without writing to a file the test then has to find.
 */
export function recordStall(
  entry: StallEntry,
  options: {
    environment?: NodeJS.ProcessEnv;
    root?: string;
    append?: (path: string, line: string) => void;
  } = {},
): void {
  const environment = options.environment ?? process.env;
  const path = environment[STALL_REPORT_ENV];
  if (path === undefined || path === '') return;
  const root = options.root ?? process.cwd();
  const append = options.append ?? ((where: string, line: string) => appendFileSync(where, line));
  append(path, stallReportLine(entry, root));
}
