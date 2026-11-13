import { describe, expect, it } from 'vitest';
import {
  CPU_MAX_PATH,
  CPU_V1_PERIOD_PATH,
  CPU_V1_QUOTA_PATH,
  cpuAllowance,
  quotaFromCpuMax,
  quotaFromV1,
  readCpuMax,
  workerCount,
} from '../vitest.config.js';

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

  it('reaches the ceiling only on a machine that can feed it', () => {
    // The premise the v3.89 stall measurement rests on, stated as arithmetic: eight
    // workers requires nine usable CPUs, so the ceiling is never in force on a machine
    // with fewer CPUs than workers. Measured at 8 workers on a 4-CPU box -- 2x
    // oversubscription, the configuration this implication forbids -- the worst file held
    // the loop for 37.8-39.9 s of the 45 s budget, and the wall clock was the same as at
    // 4 workers (111 s against 108 s). Nothing about the count is affordable, and
    // nothing about it is a throughput buy.
    expect(workerCount(9, null)).toBe(8);
    expect(workerCount(8, null)).toBe(7);
    expect(workerCount(8, 8)).toBe(7);
  });
});

describe('the CPU allowance a cgroup v1 pair states', () => {
  // `cpu.cfs_quota_us` and `cpu.cfs_period_us`, which is the layout every container on a
  // pre-4.15 kernel uses and the one `availableParallelism()` cannot see.
  it('reads a quota in microseconds over its period', () => {
    expect(quotaFromV1('400000\n', '100000\n')).toBe(4);
    expect(quotaFromV1('200000', '100000')).toBe(2);
    expect(quotaFromV1('150000', '100000')).toBe(1);
  });

  it('reads -1 as no limit, which is the v1 spelling of "max"', () => {
    // Reading it as a number would make the allowance negative and the count 2; reading
    // it as zero would do the same. Both are wrong in the same direction.
    expect(quotaFromV1('-1', '100000')).toBeNull();
    expect(quotaFromV1('0', '100000')).toBeNull();
    expect(quotaFromV1('400000', '-1')).toBeNull();
    expect(quotaFromV1('400000', '0')).toBeNull();
  });

  it('refuses a reading it cannot use instead of guessing one', () => {
    expect(quotaFromV1('', '')).toBeNull();
    expect(quotaFromV1('many', '100000')).toBeNull();
    expect(quotaFromV1('400000', '')).toBeNull();
  });
});

describe('the allowance a machine states, whichever layout it uses', () => {
  /** A filesystem whose contents are given by name, so neither layout has to exist. */
  const reader = (files: Record<string, string>): ((path: string) => string) => (path) =>
    files[path] ?? '';

  it('prefers the v2 file, because its semantics are exact', () => {
    const allowance = cpuAllowance(
      reader({ [CPU_MAX_PATH]: '400000 100000\n', [CPU_V1_QUOTA_PATH]: '800000', [CPU_V1_PERIOD_PATH]: '100000' }),
    );
    expect(allowance).toBe(4);
  });

  it('falls back to v1 when the v2 file states no limit', () => {
    // The case the second reader exists for: a container with `cpu.max` reporting `max`
    // and a v1 quota that is real. Before this round the answer was `null`, the count fell
    // back to the host's 32, and the suite ran 8 workers on 4 CPUs.
    const allowance = cpuAllowance(
      reader({ [CPU_MAX_PATH]: 'max 100000', [CPU_V1_QUOTA_PATH]: '400000', [CPU_V1_PERIOD_PATH]: '100000' }),
    );
    expect(allowance).toBe(4);
    expect(workerCount(32, allowance)).toBe(3);
  });

  it('falls back to v1 when there is no v2 file at all', () => {
    const allowance = cpuAllowance(reader({ [CPU_V1_QUOTA_PATH]: '200000', [CPU_V1_PERIOD_PATH]: '100000' }));
    expect(allowance).toBe(2);
    expect(workerCount(32, allowance)).toBe(2);
  });

  it('says nothing when neither layout speaks, leaving the reported count in charge', () => {
    // macOS, an old v1 host whose files are elsewhere, a container that hides both: the
    // best available answer is the reported number, which is what `null` means here.
    expect(cpuAllowance(reader({}))).toBeNull();
    expect(workerCount(12, cpuAllowance(reader({})))).toBe(8);
  });

  it('reads this machine, and says so when there is nothing to read', () => {
    // Exercised rather than stubbed, on whichever layout the host has. The assertion is
    // the shape, not the number: a CI runner and a laptop disagree about the count.
    const allowance = cpuAllowance();
    const v2 = readCpuMax();
    if (allowance === null) {
      expect(quotaFromCpuMax(v2)).toBeNull();
    } else {
      expect(allowance).toBeGreaterThan(0);
      expect(workerCount(32, allowance)).toBe(Math.max(2, Math.min(8, allowance - 1)));
    }
  });
});
