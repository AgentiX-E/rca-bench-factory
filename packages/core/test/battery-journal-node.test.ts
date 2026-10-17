import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * The journal for the batteries written in JavaScript, and the fact that both
 * implementations read one format.
 *
 * Pass 55 closed the journal gap for the ten Python batteries and recorded the
 * remaining three as an open item: `inject-stability.mjs`,
 * `inject-component-rule.mjs` and `inject-m1-ceiling-tests.mjs` mutate tracked
 * files with no record, so a kill during one of them left a mutation nothing
 * could repair from. They were also invisible to the census in
 * `batteries-verify-their-restore.test.ts`, which is why the gap was a paragraph
 * rather than a red test.
 *
 * ## What is asserted, and why each case is here
 *
 * - a dead holder's journal is repaired **before** the next run measures;
 * - a live holder makes the next run refuse, because repairing under it would
 *   make it read a file it did not mutate;
 * - a live pid that is **not** the recorded script is not a holder -- the record
 *   carries the writer's own name, because `scripts/inject-stability.mjs` is not
 *   under `scripts/injection/` and the Python heuristic would call a live run
 *   dead;
 * - a repair is verified against the recorded digest, so a write that does not
 *   land is a failure rather than a reported success;
 * - a thrown body restores on the way out;
 * - a **normal** exit neither repairs nor leaves a record;
 * - `process.exit()` inside the body still drops the record, because a
 *   `finally` does not run when a process ends that way;
 * - a run killed while it is **blocked in the suite** leaves the record, and the
 *   next run repairs it -- the property a signal handler cannot deliver, since a
 *   Node callback is dispatched from an event loop that `execFileSync` is not
 *   running;
 * - and the two writers read each other's records, in both directions. A journal
 *   only one implementation can read repairs half the crashes.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const JOURNAL = resolve(ROOT, 'scripts', 'injection', 'journal.mjs');
const INJECTION = resolve(ROOT, 'scripts', 'injection');
const JOURNAL_URL = pathToFileURL(JOURNAL).href;
const scratch = mkdtempSync(join(tmpdir(), 'rca-bench-battery-journal-node-'));

/**
 * The cache the mechanism is pointed at, and why it is not the real one.
 *
 * A test that writes journals into `node_modules/.cache` leaves residue: the
 * next case reads a journal another case wrote and repairs a subject that
 * belongs to a finished test. That is the same shape as the leak this mechanism
 * prevents -- a test's scratch escaping into the tree it measures.
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

/** A pid nobody is using: spawn something short-lived and wait for it to be reaped. */
function deadPid(): number {
  return spawnSync(process.execPath, ['-e', 'process.exit(0)']).pid ?? 999_999;
}

/**
 * A journal as a killed run would have left it.
 *
 * `digest` is overridable so the case that checks a verified repair can hand in a
 * record whose bytes and digest disagree -- the only way to reach the branch that
 * refuses to report a write it cannot confirm.
 */
function writeJournal(options: {
  pid: number;
  label: string;
  path: string;
  text: string;
  digest?: string;
  script?: string | null;
}): string {
  const journal = join(CACHE, `${JOURNAL_PREFIX}${String(options.pid)}.json`);
  const bytes = Buffer.from(options.text, 'utf8');
  writeFileSync(
    journal,
    JSON.stringify({
      schema: 'rca-bench-battery-journal/2',
      pid: options.pid,
      label: options.label,
      script: options.script === undefined ? 'some-battery.mjs' : options.script,
      startedAt: '2026-10-17T00:00:00Z',
      entries: [
        {
          path: options.path,
          sha256: options.digest ?? createHash('sha256').update(bytes).digest('hex'),
          bytes: bytes.toString('base64'),
        },
      ],
    }),
  );
  return journal;
}

/**
 * Run the Node guard in a subprocess, the way a battery does.
 *
 * `body` is the text of an arrow function, so a case can mutate a file, throw,
 * call `process.exit`, or block -- and every case goes through the same call a
 * battery makes.
 */
function runGuard(input: {
  roots: string[];
  label: string;
  body?: string;
  prelude?: string[];
}): {
  status: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
} {
  const source = [
    `const { withJournal } = await import(${JSON.stringify(JOURNAL_URL)});`,
    ...(input.prelude ?? []),
    `const status = withJournal(${JSON.stringify(input.label)}, () => {`,
    input.body ?? '  return 0;',
    `}, { roots: ${JSON.stringify(input.roots)} });`,
    'process.exit(status);',
  ].join('\n');
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', source], {
    encoding: 'utf8',
    env: { ...process.env, RCA_BENCH_BATTERY_CACHE: CACHE },
  });
  return { status: result.status, signal: result.signal, stdout: result.stdout, stderr: result.stderr };
}

/** The journals currently on disk, sorted, so a leftover is named rather than counted. */
function journals(): string[] {
  return readdirSync(CACHE)
    .filter((name) => name.startsWith(JOURNAL_PREFIX))
    .sort();
}

/**
 * Kill a holder and wait for it.
 *
 * The wait is not politeness: a child that outlives the file can push a write
 * after vitest has drained the reporter's queue, which is the signature
 * `coverage-writes-are-drained.test.ts` exists to keep out of this tree. The join
 * is by `exit` rather than `close` because these children hold no pipes to close.
 */
async function release(child: ChildProcess): Promise<void> {
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
  const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30000)'], { stdio: 'ignore' });
  spawned.push(child);
  return child;
}

/**
 * Something that is alive, is a battery, and says so in its command line.
 *
 * A real file rather than `-e`, because the identity being tested is the script
 * name in `/proc/<pid>/cmdline`: a battery that named no file could not be
 * distinguished from anything else.
 */
function liveBatteryFile(): { child: ChildProcess; script: string } {
  counter += 1;
  const script = `holder-${String(counter)}.mjs`;
  const path = join(scratch, script);
  writeFileSync(path, 'setTimeout(() => {}, 30000);\n');
  const child = spawn(process.execPath, [path], { stdio: 'ignore' });
  spawned.push(child);
  return { child, script };
}

/**
 * A guard that blocks, so a kill lands inside the window a battery actually
 * spends its time in.
 *
 * `Atomics.wait` blocks the main thread exactly as `execFileSync` does while a
 * suite runs -- which is the state that makes a signal handler useless here, and
 * the state this case has to reproduce to be about anything.
 */
function startBlockedGuard(input: { path: string; label: string; mutation: string }): ChildProcess {
  const source = [
    `const { writeFileSync, writeSync } = await import('node:fs');`,
    `const { withJournal } = await import(${JSON.stringify(JOURNAL_URL)});`,
    `withJournal(${JSON.stringify(input.label)}, () => {`,
    `  writeFileSync(${JSON.stringify(input.path)}, ${JSON.stringify(input.mutation)});`,
    `  writeSync(1, 'READY\\n');`,
    `  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 30000);`,
    '  return 0;',
    `}, { roots: ${JSON.stringify([input.path])} });`,
  ].join('\n');
  const child = spawn(process.execPath, ['--input-type=module', '-e', source], {
    env: { ...process.env, RCA_BENCH_BATTERY_CACHE: CACHE },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  spawned.push(child);
  return child;
}

/** Resolve when `child` has printed its ready marker, or reject with what it said. */
function whenReady(child: ChildProcess): Promise<void> {
  return new Promise((resolveReady, reject) => {
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => reject(new Error(`guard never became ready: ${stderr}`)), 20000);
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
      if (!stdout.includes('READY')) return;
      clearTimeout(timer);
      resolveReady();
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('exit', () => {
      clearTimeout(timer);
      reject(new Error(`guard exited before it was ready: ${stderr}`));
    });
  });
}

/** Resolve with how `child` ended, waiting for the process rather than polling. */
function whenExited(child: ChildProcess): Promise<{ status: number | null; signal: string | null }> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve({ status: child.exitCode, signal: child.signalCode });
  }
  return new Promise((resolveExit) => {
    child.on('exit', (status, signal) => resolveExit({ status, signal }));
  });
}

/** A guard run by Python, so a case can hand one implementation the other's record. */
function runPythonGuard(input: { roots: string[]; label: string }): {
  status: number | null;
  stderr: string;
} {
  const script = [
    'import pathlib, sys',
    `sys.path.insert(0, ${JSON.stringify(INJECTION)})`,
    'import _witnesses as W',
    `roots = [pathlib.Path(p) for p in ${JSON.stringify(input.roots)}]`,
    `with W.guard(${JSON.stringify(input.label)}, roots):`,
    '    pass',
  ].join('\n');
  const result = spawnSync('python3', ['-c', script], {
    encoding: 'utf8',
    env: { ...process.env, RCA_BENCH_BATTERY_CACHE: CACHE },
  });
  return { status: result.status, stderr: result.stderr };
}

describe('the JavaScript batteries’ journal', () => {
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
    const holder = liveBatteryFile();
    const journal = writeJournal({
      pid: holder.child.pid ?? 0,
      label: 'the-battery-that-is-still-running',
      path,
      text: 'bytes a live run is measuring\n',
      script: holder.script,
    });
    writeFileSync(path, 'a mutation the live run applied\n');

    const outcome = runGuard({ roots: [path], label: 'a-second-battery' });

    expect(outcome.status, 'a second run proceeded on a tree another run is measuring').toBe(1);
    expect(outcome.stderr).toContain('two batteries cannot measure one working tree');
    // And it did not "repair" the file out from under the live run.
    expect(readFileSync(path, 'utf8')).toBe('a mutation the live run applied\n');
    expect(existsSync(journal)).toBe(true);
    rmSync(journal, { force: true });
    await release(holder.child);
  });

  it('does not mistake a recycled pid for a holder', async () => {
    // A pid is not an identity. This one is alive and its command line does not
    // name the recorded script, so its journal is stale and must be repaired
    // rather than believed -- otherwise one kill plus one pid reuse would block
    // the tree forever.
    const path = subject('the bytes from before the crash\n');
    const stranger = liveStranger();
    const journal = writeJournal({
      pid: stranger.pid ?? 0,
      label: 'a-battery-that-died-long-ago',
      path,
      text: 'the bytes from before the crash\n',
      script: 'inject-something-that-is-not-running.mjs',
    });
    writeFileSync(path, 'still mutated\n');

    const outcome = runGuard({ roots: [path], label: 'next-battery' });

    expect(outcome.status, outcome.stderr).toBe(0);
    expect(readFileSync(path, 'utf8')).toBe('the bytes from before the crash\n');
    expect(existsSync(journal)).toBe(false);
    await release(stranger);
  });

  it('refuses to report a repair it could not verify', () => {
    // The record's bytes and digest disagree, which is what a corrupted journal
    // looks like. Writing the bytes back "succeeds" and the digest still does not
    // match, so the run has to fail rather than print a repair it cannot confirm
    // -- finding 173's `repairFromJournal` compared the file against the bytes it
    // had just written, which is true by construction.
    const path = subject('current\n');
    const journal = writeJournal({
      pid: deadPid(),
      label: 'a-corrupt-journal',
      path,
      text: 'recorded bytes\n',
      digest: '0'.repeat(64),
    });

    const outcome = runGuard({ roots: [path], label: 'next-battery' });

    expect(outcome.status).toBe(1);
    expect(outcome.stderr).toContain('digest still does not match the record');
    expect(existsSync(journal), 'a record it could not act on was deleted anyway').toBe(true);
    rmSync(journal, { force: true });
  });

  it('restores on an exception, so a battery that throws leaves nothing behind', () => {
    const path = subject('before the failure\n');
    const outcome = runGuard({
      roots: [path],
      label: 'a-battery-that-throws',
      prelude: [`const { writeFileSync } = await import('node:fs');`],
      body: [
        `  writeFileSync(${JSON.stringify(path)}, 'half-applied\\n');`,
        `  throw new Error('boom');`,
      ].join('\n'),
    });

    expect(outcome.status, 'a throwing battery exited zero').not.toBe(0);
    expect(outcome.stderr).toContain('restored from the journal');
    expect(readFileSync(path, 'utf8')).toBe('before the failure\n');
    expect(journals(), 'a record outlived the run that wrote it').toEqual([]);
  });

  it('does not repair on a normal exit, and does not leave a record that would', () => {
    // Two properties, and the second is the one that was learned by being bitten
    // on the Python side: a record taken at start cannot tell a battery's
    // mutation from a person's edit made in the same window, so it is dropped at
    // a normal exit and the battery's own restore check is what decides.
    const path = subject('before\n');
    const outcome = runGuard({
      roots: [path],
      label: 'a-battery-that-forgot',
      prelude: [`const { writeFileSync } = await import('node:fs');`],
      body: `  writeFileSync(${JSON.stringify(path)}, 'left mutated\\n');\n  return 0;`,
    });

    expect(outcome.status, outcome.stderr).toBe(0);
    expect(readFileSync(path, 'utf8'), 'a normal exit was repaired, excusing the battery').toBe(
      'left mutated\n',
    );
    expect(outcome.stderr).toContain('differing from its record');
    expect(journals(), 'a normal exit left a record that would overwrite an edit').toEqual([]);
  });

  it('drops the record when the body exits the process itself', () => {
    // `process.exit()` ends the process without unwinding the stack, so the
    // `finally` this module relies on does not run -- which is why the record is
    // also dropped from an `exit` listener. Without it, every battery that ends
    // this way (all three do, after the status is computed) would leave a journal
    // that the next run reads as a crash it has to repair: harmless when the tree
    // is clean, and a false repair when a person edited a file in that window.
    const path = subject('untouched\n');
    const outcome = runGuard({
      roots: [path],
      label: 'a-battery-that-exits',
      body: '  process.exit(7);',
    });

    expect(outcome.status).toBe(7);
    expect(journals(), 'process.exit left a journal that the next run would treat as a crash').toEqual(
      [],
    );
    expect(readFileSync(path, 'utf8')).toBe('untouched\n');
  });

  it('leaves the record when it is killed while blocked, and the next run repairs it', async () => {
    // The window that matters is the one spent waiting for a suite. A signal
    // handler cannot run there -- measured: with the main thread inside
    // `execFileSync`, a SIGTERM handler is never dispatched -- so the guarantee
    // has to come from the record on disk. SIGTERM is used rather than SIGKILL
    // because it is the one a CI runner actually sends when it gives up.
    const path = subject('the bytes before the suite\n');
    const child = startBlockedGuard({ path, label: 'killed-mid-suite', mutation: 'the mutation\n' });
    await whenReady(child);
    expect(readFileSync(path, 'utf8'), 'the mutation was never applied').toBe('the mutation\n');
    expect(journals().length, 'the record was not written before the mutation').toBe(1);

    child.kill('SIGTERM');
    const ending = await whenExited(child);
    expect(ending.signal, `the guard survived SIGTERM (status ${String(ending.status)})`).toBe(
      'SIGTERM',
    );
    expect(readFileSync(path, 'utf8'), 'a killed run restored itself, which no handler can do').toBe(
      'the mutation\n',
    );
    expect(journals()).toEqual([`${JOURNAL_PREFIX}${String(child.pid)}.json`]);

    const outcome = runGuard({ roots: [path], label: 'next-battery' });
    expect(outcome.status, outcome.stderr).toBe(0);
    expect(readFileSync(path, 'utf8')).toBe('the bytes before the suite\n');
    expect(outcome.stderr).toContain('repaired killed-mid-suite');
    expect(journals()).toEqual([]);
  });

  it('writes a record the Python guard repairs, and repairs the one Python writes', async () => {
    // The reason the format is shared rather than similar. The thirteen batteries
    // run in one job and the killing is arbitrary, so a journal only one
    // implementation can read repairs half the crashes. Each direction is driven
    // end to end: the writer is killed while blocked, the reader is the other
    // language.
    const nodeMutated = subject('node wrote this file\n');
    const nodeChild = startBlockedGuard({
      path: nodeMutated,
      label: 'a-node-battery',
      mutation: 'the node mutation\n',
    });
    await whenReady(nodeChild);
    nodeChild.kill('SIGKILL');
    await whenExited(nodeChild);
    expect(readFileSync(nodeMutated, 'utf8')).toBe('the node mutation\n');

    const byPython = runPythonGuard({ roots: [nodeMutated], label: 'a-python-battery' });
    expect(byPython.status, byPython.stderr).toBe(0);
    expect(readFileSync(nodeMutated, 'utf8'), 'Python could not read a Node record').toBe(
      'node wrote this file\n',
    );
    expect(byPython.stderr).toContain('repaired a-node-battery');
    expect(journals()).toEqual([]);

    const pythonMutated = subject('python wrote this file\n');
    const pythonChild = spawn(
      'python3',
      [
        '-c',
        [
          'import pathlib, sys, time',
          `sys.path.insert(0, ${JSON.stringify(INJECTION)})`,
          'import _witnesses as W',
          `root = [pathlib.Path(${JSON.stringify(pythonMutated)})]`,
          `with W.guard('a-python-battery-that-died', root):`,
          `    pathlib.Path(${JSON.stringify(pythonMutated)}).write_text('the python mutation\\n')`,
          '    sys.stdout.write("READY\\n"); sys.stdout.flush()',
          '    time.sleep(30)',
        ].join('\n'),
      ],
      { env: { ...process.env, RCA_BENCH_BATTERY_CACHE: CACHE }, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    spawned.push(pythonChild);
    await whenReady(pythonChild);
    pythonChild.kill('SIGKILL');
    await whenExited(pythonChild);
    expect(readFileSync(pythonMutated, 'utf8')).toBe('the python mutation\n');

    const byNode = runGuard({ roots: [pythonMutated], label: 'a-node-battery' });
    expect(byNode.status, byNode.stderr).toBe(0);
    expect(readFileSync(pythonMutated, 'utf8'), 'Node could not read a Python record').toBe(
      'python wrote this file\n',
    );
    expect(byNode.stderr).toContain('repaired a-python-battery-that-died');
    expect(journals()).toEqual([]);
  });
});
