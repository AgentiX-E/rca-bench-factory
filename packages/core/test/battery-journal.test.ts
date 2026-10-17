import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * The batteries' journal: a kill must not leave a mutation, and the next run must not
 * adopt one as pristine.
 *
 * Twice in this campaign a battery run died mid-loop and left a tracked source file
 * mutated -- twelve files in finding 173, one file in pass 54 -- and both times the only
 * thing that noticed was `git status`. The second time showed the sharper half: each
 * battery captures its backup **at start** with `shutil.copy(SRC, PRISTINE)`, so a run
 * that begins before somebody reverts copies the mutated file into the pristine slot and
 * then certifies `source restored: identical to the pristine capture`. The check is true
 * and worthless.
 *
 * These cases drive the real module in a real subprocess. Nothing is mocked: the journal
 * is a file on disk, the holder is a real pid, and the "dead" case is a pid that was
 * never alive.
 *
 * What is asserted, and what is deliberately not:
 *
 * - a dead holder's journal is repaired **before** the next run measures anything;
 * - a live holder makes the next run refuse, because repairing under it would make it
 *   read a file it did not mutate;
 * - a live pid that is **not** a battery is not a holder -- a pid is reused, and finding
 *   174's lesson about group ids applies one identifier down;
 * - a repair is verified against the recorded digest, so a write that does not land is a
 *   failure rather than a reported success;
 * - a **normal** exit does not repair. That is the property that keeps each battery's own
 *   `assert_source_restored` meaningful instead of vacuous -- the journal only decides
 *   whether the record can be dropped. It is asserted here in the direction that matters:
 *   a battery that leaves a file mutated keeps its journal, and the next run fixes it.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const INJECTION = resolve(ROOT, 'scripts', 'injection');
const scratch = mkdtempSync(join(tmpdir(), 'rca-bench-battery-journal-'));

/**
 * The cache the mechanism is pointed at, and why it is not the real one.
 *
 * A test that writes journals into `node_modules/.cache` leaves residue: the next case
 * reads a journal another case wrote, and repair runs against a subject that belongs to
 * a finished test. That happened on the first run of this file, and it is the same shape
 * as the leak this file exists to prevent -- a test's scratch escaping into the tree it
 * measures. `RCA_BENCH_BATTERY_CACHE` exists so the answer is a directory of its own.
 */
const CACHE = join(scratch, 'cache');
const JOURNAL_PREFIX = 'battery-journal-';
mkdirSync(CACHE, { recursive: true });
const spawned: ChildProcess[] = [];

afterAll(async () => {
  for (const child of spawned) await release(child);
  rmSync(scratch, { recursive: true, force: true });
});

let counter = 0;

/** A fresh subject file, so a repair has something to put back and a digest to check. */
function subject(text: string): string {
  counter += 1;
  const path = join(scratch, `subject-${String(counter)}.txt`);
  writeFileSync(path, text);
  return path;
}

/** The journal path a given pid would own, whether or not that process ever existed. */
function journalFor(pid: number): string {
  return join(CACHE, `${JOURNAL_PREFIX}${String(pid)}.json`);
}

/** A pid nobody is using: spawn something short-lived and wait for it to be reaped. */
function deadPid(): number {
  const child = spawnSync(process.execPath, ['-e', 'process.exit(0)']);
  return child.pid ?? 999_999;
}

/**
 * Write a journal as a killed run would have left it.
 *
 * `digest` is overridable so the case that checks a verified repair can hand in a record
 * whose bytes and digest disagree -- the only way to reach the branch that refuses to
 * report a write it cannot confirm.
 */
function writeJournal(options: {
  pid: number;
  label: string;
  path: string;
  text: string;
  digest?: string;
}): string {
  const journal = journalFor(options.pid);
  const bytes = Buffer.from(options.text, 'utf8');
  const sha256 = options.digest ?? createHash(bytes);
  writeFileSync(
    journal,
    JSON.stringify({
      // The current schema, and `script` is null because this helper stands in
      // for a battery driven by `python3 -c` -- the one case that has no file to
      // name. A record without a name is read with the directory heuristic, which
      // is what the cases below arrange for; naming a script here would test a
      // path the real batteries take and this helper does not.
      schema: 'rca-bench-battery-journal/2',
      pid: options.pid,
      label: options.label,
      script: null,
      startedAt: '2026-10-17T00:00:00Z',
      entries: [{ path: options.path, sha256, bytes: bytes.toString('base64') }],
    }),
  );
  return journal;
}

function createHash(bytes: Buffer): string {
  return spawnSync(process.execPath, [
    '-e',
    `process.stdout.write(require('node:crypto').createHash('sha256').update(Buffer.from(process.argv[1],'base64')).digest('hex'))`,
    bytes.toString('base64'),
  ])
    .stdout.toString()
    .trim();
}

/**
 * Run one of the module's entry points in a subprocess, the way a battery would.
 *
 * The snippet is given a body that runs inside `guard(...)`, so the two halves of the
 * contract -- repair before measuring, and what happens on the way out -- are exercised
 * through the same call a battery makes.
 */
function runGuard(input: {
  roots: string[];
  label: string;
  body?: string;
}): { status: number | null; stdout: string; stderr: string } {
  const script = [
    'import pathlib, sys',
    `sys.path.insert(0, ${JSON.stringify(INJECTION)})`,
    'import _witnesses as W',
    `roots = [pathlib.Path(p) for p in ${JSON.stringify(input.roots)}]`,
    `with W.guard(${JSON.stringify(input.label)}, roots):`,
    input.body ?? '    pass',
  ].join('\n');
  const result = spawnSync('python3', ['-c', script], {
    encoding: 'utf8',
    env: { ...process.env, RCA_BENCH_BATTERY_CACHE: CACHE },
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

/**
 * Kill a holder and wait for it.
 *
 * The wait is not politeness: a child that outlives the file can push a coverage write
 * after vitest has drained the reporter's queue, which is the signature
 * `coverage-writes-are-drained.test.ts` exists to keep out of this tree. The join is by
 * `exit` rather than `close` because these children hold no pipes to close.
 */
async function release(child: ChildProcess): Promise<void> {
  // Already gone: `exit` fired before this call, so waiting for it again would hang the
  // hook rather than the child. Node records the outcome in these two fields.
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise<void>((resolveExit) => {
    child.on('exit', () => resolveExit());
  });
  try {
    child.kill('SIGKILL');
  } catch {
    // Already gone, which is the outcome every caller arranges for.
  }
  await exited;
}

/** Something that is alive and whose command line says nothing about injection. */
function liveStranger(): ChildProcess {
  const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30000)'], {
    stdio: 'ignore',
  });
  spawned.push(child);
  return child;
}

/** Something that is alive and whose command line does name the injection directory. */
function liveBattery(): ChildProcess {
  const child = spawn('python3', ['-c', 'import time; time.sleep(30)', INJECTION], {
    stdio: 'ignore',
  });
  spawned.push(child);
  return child;
}

describe('a killed battery is repaired by the next one, and a live one is left alone', () => {
  it('puts back what a run that is gone left mutated, before measuring anything', () => {
    const path = subject('the pristine bytes\n');
    const journal = writeJournal({
      pid: deadPid(),
      label: 'some-interrupted-battery',
      path,
      text: 'the pristine bytes\n',
    });
    writeFileSync(path, 'the mutation\n');

    const outcome = runGuard({ roots: [path], label: 'next-battery' });

    expect(outcome.status, outcome.stderr).toBe(0);
    expect(readFileSync(path, 'utf8'), 'the mutation survived the next run').toBe(
      'the pristine bytes\n',
    );
    expect(existsSync(journal), 'the repaired journal was left behind').toBe(false);
    expect(outcome.stderr).toContain('repaired some-interrupted-battery');
  });

  it('refuses to start while a battery is still running on the same tree', async () => {
    const path = subject('bytes a live run is measuring\n');
    const holder = liveBattery();
    const journal = writeJournal({
      pid: holder.pid ?? 0,
      label: 'the-battery-that-is-still-running',
      path,
      text: 'bytes a live run is measuring\n',
    });
    writeFileSync(path, 'a mutation the live run applied\n');

    const outcome = runGuard({ roots: [path], label: 'a-second-battery' });

    expect(outcome.status, 'a second run proceeded on a tree another run is measuring').not.toBe(0);
    expect(outcome.stderr).toContain('two batteries cannot measure one working tree');
    // And it did not "repair" the file out from under the live run.
    expect(readFileSync(path, 'utf8')).toBe('a mutation the live run applied\n');
    expect(existsSync(journal)).toBe(true);
    rmSync(journal, { force: true });
    await release(holder);
  });

  it('does not mistake a recycled pid for a holder', async () => {
    // A pid is not an identity. This one is alive and is not a battery, so its journal is
    // stale and must be repaired rather than believed -- otherwise one kill plus one pid
    // reuse would block the tree forever.
    const path = subject('the bytes from before the crash\n');
    const stranger = liveStranger();
    const journal = writeJournal({
      pid: stranger.pid ?? 0,
      label: 'a-battery-that-died-long-ago',
      path,
      text: 'the bytes from before the crash\n',
    });
    writeFileSync(path, 'still mutated\n');

    const outcome = runGuard({ roots: [path], label: 'next-battery' });

    expect(outcome.status, outcome.stderr).toBe(0);
    expect(readFileSync(path, 'utf8')).toBe('the bytes from before the crash\n');
    expect(existsSync(journal)).toBe(false);
    await release(stranger);
  });

  it('takes over a lock whose owner is gone, and refuses one whose owner is alive', () => {
    // The battery that rewrites the gate scripts keeps a lock of its own, and it is taken
    // *inside* `_measure` -- after the journal, and outside anything the journal records: it
    // lives in `tmpdir`. So a kill leaves two things, and this pass found the second one the
    // hard way: a SIGKILLed run left `/tmp/rca-bench-factory-gate-tests-battery.lock` holding
    // its own pid, and every later run refused with exit 3 -- which in CI is a retried job
    // failing on a lock left by the job it is retrying.
    //
    // The lock already wrote the pid into the file, so the question "is the owner still a
    // battery?" is answerable with the same identity check the journal uses.
    const script = (lockPid: number): string => [
      'import importlib.util, pathlib, sys',
      `spec = importlib.util.spec_from_file_location("gate_tests", ${JSON.stringify(join(INJECTION, 'gate-tests-battery.py'))})`,
      'mod = importlib.util.module_from_spec(spec)',
      'spec.loader.exec_module(mod)',
      `mod.LOCK_PATH.write_text(${JSON.stringify(String(lockPid))})`,
      'try:',
      '    fd = mod.acquire_exclusive_lock()',
      '    import os; os.close(fd)',
      '    print("took")',
      'except SystemExit as exit_code:',
      '    print(f"refused {exit_code.code}")',
      'finally:',
      '    mod.LOCK_PATH.unlink(missing_ok=True)',
    ].join('\n');

    const stale = spawnSync('python3', ['-c', script(deadPid())], { encoding: 'utf8' });
    expect(stale.stderr + stale.stdout).toContain('which is gone');
    expect(stale.stdout).toContain('took');

    const holder = liveBattery();
    try {
      const held = spawnSync('python3', ['-c', script(holder.pid ?? 0)], { encoding: 'utf8' });
      expect(held.stdout).toContain('refused 3');
    } finally {
      // `release` is async and this case is sync; kill without waiting, then let the
      // `afterAll` join it.
      try {
        holder.kill('SIGKILL');
      } catch {
        // Already gone.
      }
    }
  });

  it('refuses to report a repair it could not verify', () => {
    // The record's bytes and digest disagree, which is what a corrupted journal looks like.
    // Writing the bytes back "succeeds" and the digest still does not match, so the run has
    // to fail rather than print a repair it cannot confirm -- finding 173's `repairFromJournal`
    // compared the file against the bytes it had just written, which is true by construction.
    const path = subject('current\n');
    const journal = writeJournal({
      pid: deadPid(),
      label: 'a-corrupt-journal',
      path,
      text: 'recorded bytes\n',
      digest: '0'.repeat(64),
    });

    const outcome = runGuard({ roots: [path], label: 'next-battery' });

    expect(outcome.status).not.toBe(0);
    expect(outcome.stderr).toContain('digest still does not match the record');
    expect(existsSync(journal)).toBe(true);
    rmSync(journal, { force: true });
  });

  it('restores on an exception, so an interrupted run leaves nothing behind', () => {
    const path = subject('before the failure\n');
    const outcome = runGuard({
      roots: [path],
      label: 'a-battery-that-raises',
      body: `    path = pathlib.Path(${JSON.stringify(path)})\n    path.write_text('half-applied\\n')\n    raise RuntimeError('boom')`,
    });

    expect(outcome.status).not.toBe(0);
    expect(outcome.stderr).toContain('restored from the journal');
    expect(readFileSync(path, 'utf8')).toBe('before the failure\n');
    expect(readdirSync(CACHE).filter((name) => name.startsWith(JOURNAL_PREFIX))).toEqual([]);
  });

  it('does not repair on a normal exit, and does not leave a record that would', () => {
    // Two properties, and the second was learned by being bitten.
    //
    // **It must not repair.** If `guard` restored on the way out, every battery's
    // `assert_source_restored` would pass no matter what it did, and the check this
    // repository spent a finding on would become vacuous.
    //
    // **And it must not leave a record.** The first version kept the journal so the next run
    // could repair a battery that forgot -- which meant a journal also outlived a run whose
    // subject had been edited by a *person* while it ran. That happened during this pass:
    // `golden-master/doc-counts.json` was edited mid-run, and the next battery's repair put
    // the old bytes back over the edit. A record taken at start cannot tell the two apart, so
    // it is dropped at a normal exit; a battery whose restore failed says so through its own
    // assertion and a non-zero exit.
    const path = subject('before\n');
    const outcome = runGuard({
      roots: [path],
      label: 'a-battery-that-forgot',
      body: `    pathlib.Path(${JSON.stringify(path)}).write_text('left mutated\\n')`,
    });

    expect(outcome.status, outcome.stderr).toBe(0);
    expect(readFileSync(path, 'utf8'), 'a normal exit was repaired, excusing the battery').toBe(
      'left mutated\n',
    );
    expect(outcome.stderr).toContain('differing from its record');
    expect(
      readdirSync(CACHE).filter((name) => name.startsWith(JOURNAL_PREFIX)),
      'a normal exit left a record that the next run would use to overwrite somebody’s edit',
    ).toEqual([]);
  });
});
