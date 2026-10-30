import { describe, expect, it } from 'vitest';
import { quotaFromCpuMax, readCpuMax, workerCount } from '../vitest.config.js';

/**
 * The worker count, and the number it is derived from.
 *
 * ## The defect these hold
 *
 * `maxWorkers` exists because a GitHub runner's wall time is twice this box's, and
 * eight workers on four vCPUs is 2x oversubscription: every file's time doubles,
 * and the files that pay are the synchronous ones -- whose whole duration is one
 * block, and which the stall gauge measures against a 45 s budget. Finding 297
 * removed the *host* count from that decision by moving it to
 * `availableParallelism()`.
 *
 * That was half a fix. On a container with a CPU quota, `availableParallelism()`
 * can still report the host's number, and here it did: **32 reported** against
 *
 *     cat /sys/fs/cgroup/cpu.max   ->  400000 100000      (4 CPUs)
 *
 * so the cap was 8 -- 2x over the quota, the exact shape finding 297 was written
 * about, one layer down. Measured before the fix, six runs of one revision: two
 * red with **no failing test**, `ingest-report.test.ts` holding the loop for
 * 56 358 ms and 65 578 ms against the 45 000 ms budget while 5039 of 5039 tests
 * passed; four green. `--maxWorkers=4` was green in 57 s. A verdict that depends
 * on which machine ran it is the thing to remove, not to re-run.
 *
 * ## What these tests can and cannot establish
 *
 * They establish the arithmetic: the quota caps the count, never raises it, and an
 * absent or unreadable quota leaves today's behaviour untouched -- which matters,
 * because the CI runner reports 4 and gets 3 either way. They cannot establish
 * that the suite is now green under load; that is the measurement above, and it is
 * why the change is a cap rather than a raised budget.
 */

describe('the CPU allowance a cgroup quota states', () => {
  it('reads a quota in microseconds over its period', () => {
    // The string this machine writes, and the answer the run measured.
    expect(quotaFromCpuMax('400000 100000\n')).toBe(4);
    expect(quotaFromCpuMax('200000 100000')).toBe(2);
    // A fractional CPU is rounded down: half a CPU is not half a worker.
    expect(quotaFromCpuMax('150000 100000')).toBe(1);
  });

  it('treats "max" as no quota at all, not as zero CPUs', () => {
    // `max` is what a host without a quota writes. Reading it as 0 would make the
    // floor the only reachable answer, and a machine with no limit would run two
    // workers.
    expect(quotaFromCpuMax('max 100000')).toBeNull();
  });

  it('refuses a reading it cannot use instead of guessing one', () => {
    // An absent file, a v1 host, a truncated write: every one of them must leave
    // the reported count in charge rather than become "this machine has no CPU".
    expect(quotaFromCpuMax('')).toBeNull();
    expect(quotaFromCpuMax('400000')).toBeNull();
    expect(quotaFromCpuMax('0 100000')).toBeNull();
    expect(quotaFromCpuMax('400000 0')).toBeNull();
    expect(quotaFromCpuMax('four 100000')).toBeNull();
  });

  it('reads this machine, and says so when there is nothing to read', () => {
    // The reader is exercised rather than stubbed: on Linux it returns the file's
    // text, and on a host without cgroup v2 it returns the empty string that
    // `quotaFromCpuMax` already handles.
    const text = readCpuMax();
    if (text === '') {
      expect(quotaFromCpuMax(text)).toBeNull();
    } else {
      expect(quotaFromCpuMax(text)).toBeTypeOf('number');
    }
  });
});

describe('the worker count that follows from it', () => {
  it('caps the reported count at the quota', () => {
    // The measurement in one line: 32 reported, 4 allowed, so 3 workers -- one CPU
    // left to the main process, which is what keeps the reporter responsive.
    expect(workerCount(32, 4)).toBe(3);
  });

  it('never raises the count above what was reported', () => {
    // A quota larger than the reported count is not a reason to start more
    // processes than the machine claims to have.
    expect(workerCount(4, 64)).toBe(3);
  });

  it('leaves a host without a quota exactly where finding 297 put it', () => {
    // The CI runner reports 4 and has no read of its own here, so this pair is the
    // no-regression claim: the same 3 workers as before the change.
    expect(workerCount(4, null)).toBe(3);
    expect(workerCount(32, null)).toBe(8);
  });

  it('keeps the floor and the ceiling', () => {
    // One CPU cannot be split; the floor is what stops a one-core container
    // serialising the suite into a timeout. The ceiling is the memory measurement
    // earlier in the config, and no machine size raises it.
    expect(workerCount(1, 1)).toBe(2);
    expect(workerCount(64, 64)).toBe(8);
  });
});
