import { spawnSync } from 'node:child_process';
import { execFile } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, describe, expect, it } from 'vitest';

import {
  budgetFromEnvironment,
  RPC_DEADLINE_MS,
  STALL_BUDGET_ENV,
  STALL_BUDGET_MS,
  STALL_INTERVAL_MS,
  stallVerdict,
  startStallWatch,
} from './support/event-loop-stall.js';
import { installedSetupFiles } from './support/installed-setup-files.js';

/**
 * The stopwatch the suite runs under, and the proof that it can fail.
 *
 * ## What this file is for
 *
 * CI run `40886479390` (commit `76b8a02f4`) printed
 *
 *     Test Files  192 passed (192)
 *          Tests  4807 passed (4807)
 *         Errors  1 error
 *     Error: [vitest-worker]: Timeout calling "onTaskUpdate"
 *
 * and exited non-zero. Nothing failed; the run is not a reading. The cause is not
 * traffic and not a per-test timeout: the bridge between the worker and the main
 * process gives every call 60 seconds, the timer that measures that deadline runs
 * *in the worker*, and a test file that blocks the worker's event loop for longer
 * than the deadline cannot reach the timers phase to see that the answer arrived.
 * When it finally turns, the first thing it reads is an expired timer.
 *
 * `support/event-loop-stall.ts` is the gauge that measures the blocking, and
 * `setup/stall-watch.ts` is the hook that fails the file which caused it. This
 * file establishes three things about that pair:
 *
 * 1. the gauge measures blocking rather than duration -- a child that is *waited
 *    for* costs the same wall time and produces no stall;
 * 2. the deadline it is calibrated against is the installed bridge's own constant,
 *    read from the dependency rather than copied from an error message;
 * 3. the hook can fail, which is the only property that makes a green suite mean
 *    anything. Point 3 is what the battery at the end of this file does: it runs a
 *    real vitest over a two-case project with a lowered budget and asserts the
 *    verdict arrives on the blocking case and not on the awaited one.
 *
 * The battery installs the file `packages/core/vitest.config.ts` installs, read
 * from that config rather than spelled here, so its proof is about this suite's
 * installation and not about a path it happens to name. The other half of that
 * link -- one entry, it exists, and it throws -- is
 * `stall-watch-is-installed.test.ts`.
 *
 * ## Why the pair below is the whole finding
 *
 * The two experiments differ in one token each -- `spawnSync` versus a promise
 * over `execFile` -- and take the same wall-clock time to the millisecond, because
 * seven seconds of `sleep` is seven seconds either way. Only one of them leaves
 * the loop blocked, and only that one fails. Anything that explains the CI red as
 * "the file is slow" or "the machine is slower" predicts that both fail.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

describe('event loop · the gauge measures blocking, not duration', () => {
  it('reports a blocked stretch and not the time that passed', () => {
    const watch = startStallWatch({ intervalMs: 20 });
    // 500 ms of synchronous child, which is 500 ms during which the sampler
    // cannot run. The bound is loose on purpose: a slow runner can only make the
    // measured stall larger, and an assertion pinned to 500 would fail there.
    spawnSync('sleep', ['0.5']);
    const longest = watch.stop();

    expect(longest).toBeGreaterThanOrEqual(400);
    // And it is not simply "the time that passed": the gauge reports the stall,
    // which is bounded above by the block plus one interval of scheduling.
    expect(longest).toBeLessThan(2_000);
  });

  it('reports no stall when the same wall time is awaited', async () => {
    const watch = startStallWatch({ intervalMs: 20 });
    await new Promise<void>((settle) => {
      execFile('sleep', ['0.5'], () => {
        settle();
      });
    });
    const longest = watch.stop();

    // The same half second, spent waiting rather than blocking. 150 ms is three
    // intervals of slack for a loaded runner; a blocked loop reports 500.
    expect(longest).toBeLessThan(150);
  });

  it('measures each stall rather than accumulating lateness', () => {
    // An injected clock, because the arithmetic is the subject: a sampler that
    // set its next deadline from the *scheduled* time would report the sum of all
    // previous lateness, so one 200 ms stall would make every later sample late
    // by 200 ms and a one-second block would report a minute.
    let clock = 0;
    const ticks: Array<() => void> = [];
    const watch = startStallWatch({
      intervalMs: 100,
      now: () => clock,
      schedule: (tick) => {
        ticks.push(tick);
        return {
          cancel: () => {
            ticks.length = 0;
          },
        };
      },
    });

    clock = 300; // 200 ms late against a 100 ms cadence
    ticks[0]!();
    clock = 400; // exactly on time again
    ticks[0]!();
    clock = 450; // 50 ms late
    ticks[0]!();

    expect(watch.stop()).toBe(200);
  });
});

describe('event loop · the numbers the gauge is calibrated against', () => {
  it('reads the bridge deadline out of the installed dependency', () => {
    // The claim "the deadline is 60 s" is a claim about `birpc` as installed, and
    // it is checked rather than restated: a vitest bump that changed it would
    // otherwise leave this repository's budget pointing at a deadline that no
    // longer exists, which is the shape of every number that was copied instead
    // of derived.
    const pnpm = resolve(ROOT, 'node_modules', '.pnpm');
    const chunks = readdirSync(pnpm)
      .filter((name) => name.startsWith('vitest@'))
      .map((name) => resolve(pnpm, name, 'node_modules', 'vitest', 'dist', 'chunks'))
      .filter((dir) => {
        try {
          return readdirSync(dir).length > 0;
        } catch {
          return false;
        }
      });

    const sources = chunks.flatMap((dir) =>
      readdirSync(dir)
        .filter((name) => name.endsWith('.js'))
        .map((name) => readFileSync(join(dir, name), 'utf8')),
    );
    const declaration = sources
      .map((source) => /const DEFAULT_TIMEOUT = ([0-9e.]+);/.exec(source))
      .find((match) => match !== null);

    expect(declaration, 'no vitest chunk declares DEFAULT_TIMEOUT; the bridge moved').toBeDefined();
    expect(Number(declaration![1])).toBe(RPC_DEADLINE_MS);
  });

  it('keeps the budget under the deadline, with the margin stated', () => {
    expect(STALL_BUDGET_MS).toBeLessThan(RPC_DEADLINE_MS);
    // Three quarters. Stated as a fact rather than recomputed, so a change to
    // either number has to be written down here as well as in the module.
    expect(STALL_BUDGET_MS).toBe(RPC_DEADLINE_MS * 0.75);
    // A budget at or below the interval would report every file.
    expect(STALL_BUDGET_MS).toBeGreaterThan(STALL_INTERVAL_MS * 100);
  });

  it('fails only what is over budget, and says what to do about it', () => {
    expect(stallVerdict(STALL_BUDGET_MS, STALL_BUDGET_MS)).toBeUndefined();
    const verdict = stallVerdict(STALL_BUDGET_MS + 1, STALL_BUDGET_MS);

    expect(verdict).toBeDefined();
    expect(verdict).toContain(String(STALL_BUDGET_MS));
    expect(verdict).toContain(String(RPC_DEADLINE_MS));
    // The message has to name the remedy: a red that says only "too slow" invites
    // raising the budget, which is the mistake this file exists to stop.
    expect(verdict).toContain('Await the child');
  });

  it('takes a budget from the environment, and refuses a malformed one', () => {
    expect(budgetFromEnvironment({})).toBe(STALL_BUDGET_MS);
    expect(budgetFromEnvironment({ [STALL_BUDGET_ENV]: '1500' })).toBe(1_500);
    // An override of zero would fail every file and blame the suite, so a value
    // that is not a positive finite number is an error rather than a budget.
    expect(() => budgetFromEnvironment({ [STALL_BUDGET_ENV]: '0' })).toThrow(/positive number/);
    expect(() => budgetFromEnvironment({ [STALL_BUDGET_ENV]: 'soon' })).toThrow(/positive number/);
  });
});

describe('event loop · the hook fails the file that blocked it', () => {
  const scratch = mkdtempSync(join(tmpdir(), 'rca-bench-stall-'));
  afterAll(() => rmSync(scratch, { recursive: true, force: true }));

  /**
   * The setup file this package installs, or a failure that says so.
   *
   * A battery that cannot find a hook has to fail loudly rather than install an
   * empty list: the empty list is the defect it is meant to detect, and a battery
   * that shrugged at it would pass while the suite had no gauge.
   */
  function installedHook(): string {
    const scan = installedSetupFiles(resolve(ROOT, 'packages', 'core', 'vitest.config.ts'));
    const hook = scan.resolved[0];
    if (hook === undefined) {
      throw new Error(
        'the core vitest config installs no setup file, so there is no hook to test: ' + scan.problems.join('; '),
      );
    }
    return hook;
  }

  /**
   * A one-case project that runs this repository's own setup file.
   *
   * The hook is pointed at rather than copied: a copy would be a second
   * implementation, and the battery would then assert that *the copy* can fail.
   *
   * It is also the hook the core config *installs*, read from that config rather
   * than spelled here. The first version of this battery wrote the path itself,
   * which made its two cases a proof about a file it happened to name: deleting
   * `setupFiles` from `packages/core/vitest.config.ts` left the battery green and
   * the suite without a gauge. Now a deleted entry makes both cases fail, one for
   * having no hook to install and one for the blocking case passing without it.
   */
  function project(name: string, caseSource: string): string {
    const dir = join(scratch, name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'vitest.config.ts'),
      [
        "import { defineConfig } from 'vitest/config';",
        'export default defineConfig({',
        '  test: {',
        "    include: ['case.test.ts'],",
        `    setupFiles: [${JSON.stringify(installedHook())}],`,
        '  },',
        '});',
        '',
      ].join('\n'),
    );
    writeFileSync(join(dir, 'case.test.ts'), caseSource);
    // The case imports `vitest`, and this project has no installed tree of its
    // own. The link is the repository's, which is what makes the version under
    // test the version the suite runs on.
    symlinkSync(resolve(ROOT, 'node_modules'), join(dir, 'node_modules'), 'dir');
    return dir;
  }

  /** Run vitest over one of those projects with a budget this battery can reach. */
  function runSuite(dir: string, budgetMs: number): Promise<{ status: number; output: string }> {
    return new Promise((settle) => {
      execFile(
        process.execPath,
        [resolve(ROOT, 'node_modules', 'vitest', 'vitest.mjs'), 'run', '--root', dir, '--config', 'vitest.config.ts'],
        {
          cwd: ROOT,
          env: { ...process.env, [STALL_BUDGET_ENV]: String(budgetMs) },
          timeout: 120_000,
          encoding: 'utf8',
        },
        (error, stdout, stderr) => {
          settle({ status: error === null ? 0 : ((error as { code?: number }).code ?? -1), output: `${stdout}\n${stderr}` });
        },
      );
    });
  }

  it('fails a suite whose child blocks the loop, with every test passing', async () => {
    // 1.2 s of synchronous child against a 300 ms budget. The budget is small so
    // the battery costs seconds rather than the minute the real deadline needs --
    // the property under test is the comparison, not the size of the number.
    const dir = project(
      'blocking',
      [
        "import { spawnSync } from 'node:child_process';",
        "import { expect, it } from 'vitest';",
        '',
        "it('blocks for 1.2 seconds', () => {",
        "  spawnSync('sleep', ['1.2']);",
        '  expect(1).toBe(1);',
        '});',
        '',
      ].join('\n'),
    );

    const run = await runSuite(dir, 300);

    // The test itself passed and the file still failed, which is exactly the CI
    // signature this instrument exists to attribute.
    expect(run.output).toContain('1 passed');
    expect(run.status).not.toBe(0);
    expect(run.output).toContain('held the event loop');
    expect(run.output).toContain('300 ms budget');
  });

  it('passes the same wall time when the child is awaited', async () => {
    // The control. Identical duration, identical budget, one token different:
    // a promise over `execFile` instead of a blocking spawn.
    const dir = project(
      'awaiting',
      [
        "import { execFile } from 'node:child_process';",
        "import { expect, it } from 'vitest';",
        '',
        "it('waits for 1.2 seconds', async () => {",
        '  await new Promise<void>((settle) => {',
        "    execFile('sleep', ['1.2'], () => {",
        '      settle();',
        '    });',
        '  });',
        '  expect(1).toBe(1);',
        '});',
        '',
      ].join('\n'),
    );

    const run = await runSuite(dir, 300);

    expect(run.output).toContain('1 passed');
    expect(run.status).toBe(0);
    expect(run.output).not.toContain('held the event loop');
  });
});
