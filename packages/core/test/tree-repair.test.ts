import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { INJECTION, ROOT, repairAbandonedTree } from '../../../scripts/tree-repair.mjs';

/**
 * The preflight that puts back what a killed battery left.
 *
 * ## Why this is tested against a fixture cache
 *
 * The repair reads journals from `RCA_BENCH_BATTERY_CACHE`, so a test can write
 * the record it wants to see repaired instead of killing a battery to produce one.
 * That is the difference between a test of the rule and a test of the accident:
 * the accident -- a gate run killed mid-injection, four unrelated tests red
 * twenty-four minutes later -- is not reproducible on demand, and a check that
 * waits for it is a check that runs once.
 *
 * The journal schema is `_witnesses.py`'s, restated here on purpose: a record this
 * test writes is a *claim* about that format, and the assertion is that the repair
 * reads it. A field renamed on one side and not the other fails here.
 */

/**
 * The gates this file spawns, declared as well as spawned.
 *
 * `verify-local.mjs` is spawned once, for the refusal its preflight produces. The
 * inventory cross-checks the two accounts, so a test that spawns a gate must name
 * it here -- otherwise the site's proof rests on a path that can drift.
 */
export const DRIVES = ['scripts/verify-local.mjs'];

const SCRATCH = mkdtempSync(join(tmpdir(), 'rca-tree-repair-'));
afterAll(() => rmSync(SCRATCH, { recursive: true, force: true }));

/** A pid no process can hold: the kernel's limit is far below this. */
const DEAD_PID = 999_999;

/**
 * A journal naming one file and the bytes it held, plus the file already mutated.
 *
 * `pid` is a parameter because the two live cases -- a run that is gone and a run
 * that is not -- differ only in that number, and the decision the repair makes is
 * exactly the decision about that number.
 */
function abandoned({ pid = DEAD_PID, script = 'gate-tests-battery.py', label = 'gate-tests-battery' } = {}) {
  const cache = mkdtempSync(join(SCRATCH, 'cache-'));
  const tree = mkdtempSync(join(SCRATCH, 'tree-'));
  const subject = join(tree, 'check-fixture-gate.mjs');
  const original = 'if (bad) process.exit(1);\n';
  writeFileSync(subject, `${original}// an injected line that was never removed\n`);
  writeFileSync(
    join(cache, `battery-journal-${String(pid)}.json`),
    JSON.stringify({
      schema: 'rca-bench-battery-journal/2',
      pid,
      label,
      script,
      startedAt: '2026-01-01T00:00:00Z',
      entries: [
        {
          path: subject,
          sha256: createHash('sha256').update(original).digest('hex'),
          bytes: Buffer.from(original).toString('base64'),
        },
      ],
    }),
  );
  return { cache, subject, journal: join(cache, `battery-journal-${String(pid)}.json`), original };
}

describe('a tree a killed battery was holding', () => {
  it('is put back, and the journal is removed rather than left to be replayed', () => {
    // The defect: the restore lived in the killed run's `finally`. The bytes are
    // in the journal, so the repair is not a matter of opinion -- it writes them.
    const { cache, subject, journal, original } = abandoned();
    const result = repairAbandonedTree({ cache });

    expect(result.state).toBe('repaired');
    expect(result.ok).toBe(true);
    expect(readFileSync(subject, 'utf8')).toBe(original);
    expect(existsSync(journal)).toBe(false);
    expect(result.message).toContain('1 file(s) put back');
  });

  it('says so when there is nothing to repair, instead of reporting a clean tree', () => {
    // The other half of the same sentence. A preflight that printed nothing on a
    // clean tree would be indistinguishable from one that failed to run.
    const cache = mkdtempSync(join(SCRATCH, 'empty-'));
    const result = repairAbandonedTree({ cache });
    expect(result.state).toBe('repaired');
    expect(result.message).toContain('no abandoned journal');
  });

  it('refuses while a live battery holds the tree, and writes nothing under it', async () => {
    // A live number is not a leftover. The journal is checked against the process
    // itself -- `/proc/<pid>/cmdline` must name the script the record claims --
    // because pids are reused and the wrong answer overwrites a running mutation.
    const sleeper = spawn('sleep', ['30'], { stdio: 'ignore' });
    try {
      const { cache, subject, journal } = abandoned({ pid: sleeper.pid, script: 'sleep', label: 'a live battery' });
      writeFileSync(subject, 'mutated, and it stays mutated\n');

      const result = repairAbandonedTree({ cache });

      expect(result.state).toBe('held');
      expect(result.ok).toBe(false);
      expect(result.message).toContain('cannot measure one working tree');
      expect(readFileSync(subject, 'utf8')).toBe('mutated, and it stays mutated\n');
      expect(existsSync(journal)).toBe(true);
    } finally {
      // Joined, not killed and forgotten: `coverage-writes-are-drained.test.ts`
      // holds every test that spawns asynchronously to awaiting its child, and a
      // detached `sleep` left running is a process the suite never accounts for.
      sleeper.kill('SIGKILL');
      await once(sleeper, 'exit');
    }
  });

  it('reports a missing interpreter rather than a clean tree', () => {
    // `python3` is what the batteries run on. A gate session without it cannot
    // verify them, and it also cannot know whether the tree was repaired -- which
    // is a different statement from "the tree is clean", and the one that is true.
    const result = repairAbandonedTree({ python: 'python3-that-is-not-installed' });
    expect(result.state).toBe('unavailable');
    expect(result.status).toBe(null);
    expect(result.message).toContain('cannot verify them');
    expect(result.message).toContain('is not repaired either');
  });

  it('drives the repository\'s own module, which must stay a module', () => {
    // The four cases above exercise the decision. This one exercises the seam: a
    // program that imported a path that had drifted would pass all of them and
    // never repair anything.
    //
    // The second assertion is the one that keeps this honest. A file under
    // `scripts/injection/` with a `__main__` is a *battery* to
    // `batteries-reach-an-invoker.test.ts`, and every battery must be invoked by a
    // package script and a CI workflow. The repair is neither, so it is driven
    // with `python3 -c` and the module keeps no entry point. Adding one would not
    // fail here -- it would fail there, with a message about wiring, which is the
    // wrong place to learn it.
    const script = join(INJECTION, '_witnesses.py');
    expect(existsSync(script)).toBe(true);
    expect(readFileSync(script, 'utf8')).not.toContain('__main__');
  });

  it('stops the gate session before its first step, when the tree is not the repository\'s', async () => {
    // The site this proves is `verify-local.mjs`'s refusal. `repairAbandonedTree`
    // returning `held` is a value; the gate acting on it is a different claim, and
    // the site inventory is a list of exits rather than of decisions.
    const sleeper = spawn('sleep', ['30'], { stdio: 'ignore' });
    try {
      const { cache } = abandoned({ pid: sleeper.pid, script: 'sleep', label: 'a live battery' });
      const result = spawnSync(process.execPath, [join(ROOT, 'scripts', 'verify-local.mjs')], {
        cwd: ROOT,
        encoding: 'utf8',
        env: { ...process.env, RCA_BENCH_BATTERY_CACHE: cache },
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("the tree is not the repository's");
      expect(result.stderr).toContain('cannot measure one working tree');
      // Nothing ran: the refusal is before the first step, not after a step
      // discovered that the tree had been mutated under it.
      expect(result.stdout).not.toContain('[1/');
    } finally {
      sleeper.kill('SIGKILL');
      await once(sleeper, 'exit');
    }
  });
});
