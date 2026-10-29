import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * The runner's only piece of machinery: start one step's script, and be able to
 * stop it.
 *
 * ## Why this is a module of its own
 *
 * `gate-steps.mjs` says of itself that it "has no business spawning anything" --
 * the runner is passed in as a parameter precisely so the plan can be driven by a
 * test. `verify-local.mjs` cannot be imported by a test, because
 * `verify-gates-are-testable.mjs` hollows it out with `process.exit(0)` and a test
 * that imported it would die at import and name nothing.
 *
 * So the seam that both need -- spawn with a bound, kill what the command started
 * -- lives here: importable by the suite, callable by the CLI.
 *
 * ## What is asserted, and why it is asserted against a process
 *
 * A timeout is a claim about a **process group**: `pnpm test` starts vitest, which
 * starts workers. Killing the process this module spawned would leave the workers
 * running and the terminal still busy, which is the failure the bound exists to
 * prevent. So the test starts a command that backgrounds a grandchild, writes its
 * pid to a file, and then hangs; after the bound expires the test asks whether the
 * grandchild is gone.
 */

const SCRATCH = mkdtempSync(join(tmpdir(), 'rca-step-process-'));
const ROOT = resolve(import.meta.dirname, '..', '..', '..');
const MODULE = resolve(ROOT, 'scripts', 'step-process.mjs');
afterAll(() => rmSync(SCRATCH, { recursive: true, force: true }));

import { runStep, StepTimeout } from '../../../scripts/step-process.mjs';

/** Whether a pid is still alive, asked without raising. */
function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/** What the kernel says about one pid. */
interface ProcessFacts {
  /** One letter: `R` running, `S` sleeping, `Z` a corpse awaiting its reaper. */
  state: string;
  /** Start time in clock ticks since boot: the half of a process's identity a pid does not carry. */
  started: string;
  /** Who would reap it: `1` means it was orphaned, which is what a survivor looks like. */
  parent: string;
  command: string;
}

/**
 * Whether this platform reports process facts at all.
 *
 * `/proc` is Linux-only, so the probe below has to have an answer for a host that
 * has none: it asks the signal question (`alive`) and nothing more, rather than
 * claiming an identity it never saw.
 */
const REPORTS_FACTS = existsSync('/proc/self/stat');

function factsOf(pid: number): ProcessFacts | null {
  if (!REPORTS_FACTS) return null;
  try {
    const stat = readFileSync(`/proc/${String(pid)}/stat`, 'utf8');
    // The command name is parenthesised and may itself contain spaces and
    // parentheses, so the fields are indexed from the *last* `)` rather than from
    // the start: field 3 (`state`) is index 0 there, field 22 (`starttime`) 19.
    const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
    return {
      state: fields[0] ?? '',
      started: fields[19] ?? '',
      parent: fields[1] ?? '',
      command: readFileSync(`/proc/${String(pid)}/cmdline`, 'utf8').replaceAll('\0', ' ').trim(),
    };
  } catch {
    return null;
  }
}

/** States that mean the process is over, corpse or not. */
const EXITED_STATES = new Set(['Z', 'X', 'x']);

/**
 * Whether the *same* process is still running.
 *
 * `alive` answers "is there a process with this number", which is not the
 * question the two group-kill tests ask. It says yes for a process that exited
 * and has not been reaped yet (a `Z` corpse still owns its pid) and for a number
 * the kernel has already handed to an unrelated process -- both are false
 * "the grandchild survived" reports, and the suite runs beside thousands of
 * spawns. So the start time is captured while the pid is known to be the
 * grandchild, and the question asked later is about that process: same start
 * time, and not in a state that means it is over.
 */
function stillRunning(pid: number, started: string | null): boolean {
  if (!alive(pid)) return false;
  // Nothing to compare against: either the platform reports no facts, or the
  // process was already gone when the pid was read. The signal answer stands.
  if (!REPORTS_FACTS || started === null) return true;
  const now = factsOf(pid);
  if (now === null) return false;
  return now.started === started && !EXITED_STATES.has(now.state);
}

/** What the pid looks like now, for the failure message of an assertion that waited on it. */
function explainPid(pid: number, started: string | null): string {
  if (!REPORTS_FACTS) return 'this platform reports no process state';
  const now = factsOf(pid);
  if (now === null) return 'the pid is gone now';
  if (started !== null && now.started !== started) {
    return `the pid now names a different process (${now.command === '' ? 'no command line' : now.command})`;
  }
  return (
    `it is in state '${now.state}' under parent ${now.parent}, running ` +
    `'${now.command === '' ? 'no command line' : now.command}'`
  );
}

/** Wait, without a timer, until `predicate` holds or the budget runs out. */
function until(predicate: () => boolean, budgetMs = 2000): boolean {
  const deadline = Date.now() + budgetMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
  }
  return predicate();
}

describe('one step, run as CI would run it', () => {
  it('runs the body from the step the plan produced and returns', async () => {
    const marker = join(SCRATCH, 'plain.txt');
    await runStep({ key: 'a / one', run: `printf '%s' one > ${marker}`, cwd: '.', shell: undefined, env: {} });
    expect(readFileSync(marker, 'utf8')).toBe('one');
  });

  it('fails loudly on a non-zero status, which is the whole reason a runner exists', async () => {
    await expect(runStep({ key: 'a / one', run: 'exit 3', cwd: '.' })).rejects.toThrow(/exited 3/);
  });

  it('kills the step when the bound is spent, and says so in a way the caller can branch on', async () => {
    // 400 milliseconds, not minutes: the conversion from `timeout-minutes` is a
    // number this module is handed, and testing the conversion by waiting a
    // minute would be a test nobody runs.
    const started = Date.now();
    let thrown: unknown = null;
    try {
      await runStep({ key: 'a / one', run: 'sleep 30', cwd: '.', timeoutMs: 400 });
    } catch (error) {
      thrown = error;
    }
    const elapsed = Date.now() - started;
    expect(thrown, 'a bounded step that hangs returned instead of throwing').toBeInstanceOf(StepTimeout);
    expect((thrown as StepTimeout).timedOut).toBe(true);
    expect(elapsed, 'the bound was not the bound').toBeLessThan(10_000);
  });

  it('kills what the step started, not just the process it spawned', async () => {
    // The claim the bound makes is about a **group**. `pnpm test` starts vitest,
    // which starts workers; killing the one process this module spawned would
    // leave them running and the terminal busy, which is the failure the bound
    // exists to prevent. The step backgrounds a `sleep`, records its pid, and hangs.
    const pidFile = join(SCRATCH, 'grandchild.pid');
    const body = `sleep 30 & echo $! > ${pidFile}\nsleep 30`;
    await expect(runStep({ key: 'a / one', run: body, cwd: '.', timeoutMs: 600 })).rejects.toBeInstanceOf(
      StepTimeout,
    );

    expect(existsSync(pidFile), 'the step did not get far enough to record its grandchild').toBe(true);
    const pid = Number(readFileSync(pidFile, 'utf8').trim());
    expect(Number.isInteger(pid) && pid > 0).toBe(true);
    // The bound has already fired, so this read is the last chance to learn which
    // process the number names: if it is still there, the start time is captured
    // and a recycled number cannot pass for a survivor. If it is already gone,
    // there is nothing to identify and the signal answer is all that is left --
    // which is also the answer that says "gone".
    const identity = factsOf(pid)?.started ?? null;
    expect(until(() => !stillRunning(pid, identity)), `the grandchild ${String(pid)} outlived the bound (${explainPid(pid, identity)})`).toBe(true);
  });

  it('never signals its own group when the step could not start', async () => {
    // `kill(-0, …)` signals the **caller's** process group, and a spawn that failed
    // has no pid. With a bound short enough to expire before the `error` event
    // arrives, the sweep would compute a group id out of nothing and kill the
    // runner -- and the terminal session -- with it. That is not hypothetical
    // arithmetic: negative pid semantics have a zero and zero means "us".
    await expect(
      runStep({ key: 'a / one', run: 'true', shell: 'nosuch-interpreter {0}', timeoutMs: 30 }),
    ).rejects.toThrow();
    // The proof is that this process is still here and still runs a step: had the
    // sweep fired, this worker would have been signalled and the file would have
    // died instead of asserting.
    await runStep({ key: 'a / two', run: 'true', cwd: '.' });
  });

  it('forwards a signal to the step, and then dies of it rather than swallowing it', async () => {
    // Installing a listener **replaces the default action**. A runner that only
    // forwarded would ignore the SIGTERM a supervisor sends and be killed with
    // SIGKILL later -- and every file that supervisor had queued behind it dies
    // with it. So the forwarding handler ends the process too, and the exit code is
    // the signal's.
    //
    // The process has to be a real one: a signal delivered to this test worker
    // would end the worker, which is the failure this test is about.
    const marker = join(SCRATCH, 'signal-started.txt');
    const pidFile = join(SCRATCH, 'signal-grandchild.pid');
    const runner = join(SCRATCH, 'runner.mjs');
    writeFileSync(
      runner,
      [
        `import { runStep } from ${JSON.stringify(MODULE)};`,
        'await runStep({',
        "  key: 'a / one',",
        `  run: ${JSON.stringify(`echo started > ${marker}\nsleep 30 & echo $! > ${pidFile}\nsleep 30`)},`,
        "  cwd: '.',",
        '});',
      ].join('\n'),
    );

    const child = spawn(process.execPath, [runner], { cwd: ROOT, stdio: 'ignore' });
    try {
      expect(until(() => existsSync(marker) && existsSync(pidFile), 15_000), 'the step never started').toBe(true);
      const pid = Number(readFileSync(pidFile, 'utf8').trim());
      expect(Number.isInteger(pid) && pid > 0).toBe(true);
      // Here the grandchild is known to be running, so its start time is captured
      // while the number certainly names it.
      const identity = factsOf(pid)?.started ?? null;

      child.kill('SIGTERM');
      const how = await new Promise<number | string>((done) => child.on('exit', (code, signal) => done(code ?? signal)));
      // `SIGTERM`, not `143`: the process dies *of* the signal it was sent, because
      // the handler re-raises it after removing itself. An exit code would be a
      // number standing in for a signal, and a supervisor can tell the difference.
      expect(how, 'the runner survived the signal a supervisor sent it').toBe('SIGTERM');
      expect(
        until(() => !stillRunning(pid, identity), 5_000),
        `the grandchild ${String(pid)} outlived the runner (${explainPid(pid, identity)})`,
      ).toBe(true);
    } finally {
      child.kill('SIGKILL');
    }
  });

  it('waits as long as the step needs when there is no bound', async () => {
    const marker = join(SCRATCH, 'unbounded.txt');
    await runStep({ key: 'a / one', run: `sleep 0.3; printf '%s' done > ${marker}`, cwd: '.', timeoutMs: null });
    expect(readFileSync(marker, 'utf8')).toBe('done');
  });

  it('does not leave the script it materialised behind, whether the step passes or not', async () => {
    // The runner writes the body to a file, because `{0}` is a path. A file left
    // behind is a scratch file in the temporary directory per step, per run.
    //
    // The filter is by *this process's* pid, and that is a repair rather than a
    // detail. The first version diffed the whole of `tmpdir()` before and after,
    // which made the assertion a function of every other process on the machine:
    // a full-suite run failed with `verify-local-89229-1.sh`, a file written by a
    // different vitest worker in the same window. The runner names its files
    // `verify-local-<pid>-<n>.sh` precisely so the two cases are distinguishable,
    // and a test that ignored the pid was reading a global it did not own.
    const mine = `verify-local-${String(process.pid)}-`;
    const left = () =>
      spawnSync('ls', [tmpdir()], { encoding: 'utf8' })
        .stdout.split('\n')
        .filter((name) => name.startsWith(mine));
    expect(left(), 'a previous test in this file leaked one').toEqual([]);
    await runStep({ key: 'a / one', run: 'true', cwd: '.' });
    await expect(runStep({ key: 'a / one', run: 'exit 1', cwd: '.' })).rejects.toThrow();
    expect(left(), 'the step scripts for this process were not removed').toEqual([]);
  });
});

describe('the liveness probe the two group-kill tests rest on', () => {
  it('answers about the process the number named, not about the number', () => {
    // The first version of both tests above asked `kill(pid, 0)`, which answers a
    // different question: a process that exited owns its number until it is
    // reaped, and a number the kernel has recycled belongs to someone else. Either
    // way the answer is "yes" and the report is "the grandchild survived". The
    // failure that prompted this said exactly that, once, in a full-suite run --
    // 21 replays (idle, under 16 busy loops, and under a process-churn loop) all
    // found the grandchild gone within 1 ms, so the probe's two false positives are
    // what could be repaired, and this pins the repair.
    const mine = factsOf(process.pid);
    expect(stillRunning(process.pid, mine?.started ?? null), 'this process is running as it asserts this').toBe(true);
    expect(alive(process.pid), 'the signal probe does answer about this process').toBe(true);
    // A number handed the wrong start time is a different process even though the
    // signal probe still says yes. Where the platform reports no start time there
    // is nothing to compare, and "still running" is the only defensible answer.
    const someoneElse = mine === null ? '0' : `${mine.started}0`;
    expect(stillRunning(process.pid, someoneElse), 'a pid carrying another start time is another process').toBe(
      mine === null,
    );
  });

  it('calls a number with no process under it gone', () => {
    expect(stillRunning(2_000_000_000, null)).toBe(false);
  });
});
