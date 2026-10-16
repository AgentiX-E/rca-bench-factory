import { spawn, spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * The audit that empties every gate has to be auditable too.
 *
 * ## What it is, and what the tracking row said about it
 *
 * `scripts/verify-gates-are-testable.mjs` inserts `process.exit(0)` into each
 * gate, runs the test files that name it, and fails if any gate survives or is
 * named by nothing. It exists because the tracking row for P1-6 read "partially
 * complete (3 of 8 gates)" for several rounds while the criterion -- *a gate with
 * no test is neither a threshold nor an enumeration* -- was measured and already
 * held for all thirteen. That count was of a **mechanism** (gates carrying a
 * dedicated block in `gates-are-testable.test.ts`), not of the property, which is
 * the shape this audit has now recorded at least five times.
 *
 * ## What its subject list is, and why it is no longer a filename prefix
 *
 * The first version read `readdirSync('scripts').filter(n => n.startsWith('check-'))`,
 * which made the derivation real but made it a derivation of a **spelling**. The
 * property is "exits non-zero when unhappy", and `golden-master/gate-sites.json`
 * enumerates exactly that -- 37 scripts against the prefix's 16, with none in the
 * prefix alone. So the audit now takes its subjects from the inventory, and the
 * tests below hold that reading in both directions against the real tree rather
 * than pattern-matching the source for a filename.
 *
 * ## Why it is not run here
 *
 * The audit mutates tracked files and runs other test files. Running it inside
 * this suite would put a hollowed gate under concurrent readers -- the hazard
 * finding 145 was about, where a gate rebuilt the tree beneath its own tests --
 * and it would nest vitest inside vitest. So the behaviour is asserted against a
 * **sandbox** instead: a throwaway tree with one gate, one test that names it, and
 * a stub `npx` whose exit status and output decide the audit's verdict. The real
 * tree is never touched, and the two controls below are the audit's own verdict
 * logic running for real.
 *
 * CI runs the audit against the shipped tree, which is where the tree-wide claim
 * is established; this file establishes that the verdict discriminates.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const AUDIT = 'verify-gates-are-testable.mjs';

/**
 * The script this file drives.
 *
 * Rule 7 of `gate-sites-are-proven.test.ts` reconciles this declaration against
 * what the spawn calls actually reach, and reports a disagreement in either
 * direction. The declaration is needed because the spawn below is handed a path
 * built at runtime -- a copy inside a sandbox -- so the script's name cannot be
 * inferred from the call's own argument list. The rule caught its absence here on
 * the first run, which is what the rule is for.
 */
const DRIVES = ['scripts/verify-gates-are-testable.mjs'];

const scratch = mkdtempSync(join(tmpdir(), 'rca-bench-gate-audit-'));

/**
 * Stand-ins for a nested suite, so nothing this file starts outlives it.
 *
 * Two tests below start a process group to play the part of a suite the audit
 * could not stop. They are tracked here and killed in `afterAll` for the same
 * reason the audit tracks its own: a test that leaks a process is a test that
 * makes the next one measure a machine it did not choose.
 */
const strays: number[] = [];

afterAll(() => {
  for (const pid of strays) {
    try {
      process.kill(-pid, 'SIGKILL');
    } catch {
      // Already gone, which is the outcome every one of these tests is about.
    }
  }
  rmSync(scratch, { recursive: true, force: true });
});

/** Whether any process still belongs to a group, asked of the kernel. */
function groupAlive(group: number): boolean {
  const out = spawnSync('ps', ['-A', '-o', 'pgid='], { encoding: 'utf8' });
  return (out.stdout ?? '')
    .split('\n')
    .map((line) => Number(line.trim()))
    .includes(group);
}

/** Wait for a condition, so a test waits on an event rather than on a duration. */
async function until(what: string, condition: () => boolean, ms = 10_000): Promise<void> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`timed out waiting for ${what}`);
}

let counter = 0;

interface Outcome {
  status: number;
  stdout: string;
  stderr: string;
}

/**
 * A throwaway tree holding the audit, one subject, and a test that names it.
 *
 * `stub` is what the audit's `npx` resolves to: a shell script that decides
 * whether the audit observes a failure. That is the whole experiment -- the audit
 * shells out for its evidence, so controlling the shell is controlling the
 * evidence.
 *
 * `subject` is the script the sandbox's inventory names, and it is a parameter
 * because the audit's subject list is now the inventory's rather than a directory
 * scan's: a sandbox has to say which script is a gate, and it can name one whose
 * filename the old prefix rule would not have selected. `null` is the vacuity
 * case -- an inventory that names nothing.
 */
function sandbox(stub: { body: string; status: number }, subject: string | null = 'check-throwaway.mjs'): string {
  counter += 1;
  const tree = join(scratch, `tree-${counter}`);
  mkdirSync(join(tree, 'scripts'), { recursive: true });
  mkdirSync(join(tree, 'packages', 'core', 'test'), { recursive: true });
  mkdirSync(join(tree, 'bin'), { recursive: true });
  mkdirSync(join(tree, 'golden-master'), { recursive: true });
  copyFileSync(resolve(ROOT, 'scripts', AUDIT), join(tree, 'scripts', AUDIT));
  if (subject !== null) {
    writeFileSync(join(tree, 'scripts', subject), 'process.exit(1);\n');
    writeFileSync(
      join(tree, 'packages', 'core', 'test', 'probe.test.ts'),
      `// names scripts/${subject} so the audit has a subject to run\n`,
    );
  }
  writeFileSync(
    join(tree, 'golden-master', 'gate-sites.json'),
    JSON.stringify({ sites: subject === null ? [] : [{ script: `scripts/${subject}` }] }),
  );
  const npx = join(tree, 'bin', 'npx');
  writeFileSync(npx, `#!/bin/sh\n${stub.body}\nexit ${stub.status}\n`);
  chmodSync(npx, 0o755);
  return tree;
}

/**
 * The audit's own subject list, asked for rather than reconstructed.
 *
 * `--list` prints the derivation the loop is handed and stops before any file is
 * touched, so comparing it against the inventory compares two real things. The
 * alternative -- asserting the source mentions `gate-sites.json` -- would be the
 * shape finding 168 recorded: a guard reading prose and calling it a check.
 */
function listedSubjects(): string[] {
  const result = spawnSync(process.execPath, [resolve(ROOT, 'scripts', AUDIT), '--list'], {
    encoding: 'utf8',
    cwd: ROOT,
    timeout: 120_000,
  });
  if (result.status !== 0) {
    throw new Error(`--list exited ${result.status}: ${result.stderr ?? ''}`);
  }
  return (result.stdout ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .sort();
}

function audit(tree: string): Outcome {
  const result = spawnSync(process.execPath, [join(tree, 'scripts', AUDIT)], {
    encoding: 'utf8',
    cwd: tree,
    env: { ...process.env, PATH: `${join(tree, 'bin')}:${process.env.PATH ?? ''}` },
    timeout: 120_000,
  });
  if (result.error !== undefined) {
    return { status: -1, stdout: result.stdout ?? '', stderr: result.error.message };
  }
  return { status: result.status ?? -1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

describe('scripts/verify-gates-are-testable.mjs · the audit of the audits', () => {
  it('takes its subjects from the inventory, in both directions', () => {
    // The rule the register in `scripts-are-classified.test.ts` states for itself:
    // a list that must be updated when a file is added is a check that cannot see
    // the file it is missing. The subject list is still derived -- `derive-gate-sites
    // --check` holds the inventory to the tree, and it runs in `docs:check` and in
    // the cold-tree job -- it is just derived one step upstream, from the property
    // rather than from a filename.
    //
    // Both directions, because one is satisfiable by a wrong rule: a subset would
    // pass `toContain`-style assertions while silently dropping subjects, and the
    // prefix rule did exactly that for 21 scripts.
    const inventory = JSON.parse(
      readFileSync(resolve(ROOT, 'golden-master', 'gate-sites.json'), 'utf8'),
    ) as { sites: { script: string }[] };
    const scripts = [...new Set(inventory.sites.map((site) => site.script.replace(/^scripts\//, '')))].sort();
    expect(listedSubjects()).toEqual(scripts);
    expect(scripts.length).toBeGreaterThan(0);
  });

  it('measures a subject the filename prefix would have missed, and skips a script with no exit at all', () => {
    // Two negatives that together pin the rule. "Every `.mjs` in scripts/" would
    // satisfy the first half alone, and the old `check-*` prefix would satisfy the
    // second half alone; only the property -- exits non-zero when unhappy -- gives
    // both.
    //
    // The second half is written as a **property of the sources** rather than as a
    // list of names, and that is not stylistic. Naming a script in a negative
    // assertion puts its name into the corpus that
    // `scripts-are-classified.test.ts` searches when it asks which scripts no test
    // mentions -- so an assertion that a script must *not* be a subject silently
    // deleted it from another guard's evidence. A mention is not a use, and a
    // negative mention is still a mention.
    const listed = listedSubjects();
    expect(listed).toContain('inject-stability.mjs');
    expect(listed).toContain('fetch-official.mjs');

    const withoutExit = readdirSync(resolve(ROOT, 'scripts'))
      .filter((name) => name.endsWith('.mjs'))
      .filter((name) => !/process\.exit\s*\(/.test(readFileSync(resolve(ROOT, 'scripts', name), 'utf8')));
    // Non-empty, or the loop below proves nothing.
    expect(withoutExit.length).toBeGreaterThan(0);
    for (const name of withoutExit) {
      expect(listed, `${name} never exits, so it is not a gate`).not.toContain(name);
    }
  });

  it('hollows a subject whose name is not `check-*`, because it is a gate all the same', () => {
    // The behavioural half. The two tests above compare the audit's list against a
    // file; this one puts a non-`check-*` subject in front of the audit and watches
    // it be measured. Under the prefix rule the sandbox held no gate at all and the
    // audit refused with "no `check-*.mjs` gate was found" -- which is the defect,
    // reproduced as an experiment rather than argued.
    const outcome = audit(
      sandbox({ body: "printf '\\303\\227 void\\n'", status: 1 }, 'gen-throwaway.mjs'),
    );
    expect(outcome.status).toBe(0);
    expect(outcome.stdout).toContain('gen-throwaway.mjs');
    expect(outcome.stdout).toContain('gates: 1  caught: 1  survived: 0  no-test: 0  unattributed: 0');
    expect(outcome.stdout).toContain('restored byte-for-byte: 1 of 1');
  });

  it('refuses a run whose subject list came back empty', () => {
    // A vacuity guard, proved rather than read. An audit that found no gates would
    // print a tidy summary and exit 0 while measuring nothing, which is the defect
    // this script exists to find; the sandbox below names no subject at all.
    const outcome = audit(sandbox({ body: 'true', status: 0 }, null));
    expect(outcome.status).toBe(1);
    expect(outcome.stderr).toContain('names no gate');
    expect(outcome.stdout.trim()).toBe('');
  });

  it('refuses a tree that is already hollowed, rather than measuring one', () => {
    // **The precondition, and it is here because its absence corrupted this
    // repository's working tree.**
    //
    // While the subject list was being widened, a test spawned the audit against the
    // real tree -- and that is a recursive act, because the audit measures
    // `scripts/verify-gates-are-testable.mjs` by running the very file that drives
    // it. Several runs overlapped on one tree and shared one journal; each read an
    // already hollowed file as its `original`, "restored" it, and added another
    // marker. Twelve scripts were left mutated, one of them carrying three markers,
    // and the repair path reported that it had repaired one of them.
    //
    // An audit cannot measure a tree that is not the shipped one, and the marker is
    // what says so. The sandbox gate is hollowed by hand and the audit must refuse
    // **before writing anything** -- so the bytes are compared afterwards.
    const tree = sandbox({ body: "printf '\\303\\227 void\\n'", status: 1 });
    const gate = join(tree, 'scripts', 'check-throwaway.mjs');
    const hollowedSource = '#!/usr/bin/env node\nprocess.exit(0);\nprocess.exit(1);\n';
    writeFileSync(gate, hollowedSource);

    const outcome = audit(tree);
    expect(outcome.status).toBe(1);
    expect(outcome.stderr).toContain('scripts/check-throwaway.mjs is already hollowed');
    expect(outcome.stdout).not.toContain('CAUGHT');
    expect(readFileSync(gate, 'utf8')).toBe(hollowedSource);
  });

  it('refuses while a live run holds the tree, and takes over from a dead one', () => {
    // The journal is empty between two subjects, so it cannot exclude a second run
    // on its own; the lock is what can, and `openSync(..., 'wx')` is what makes the
    // acquisition atomic rather than a stat followed by a write.
    //
    // The pid inside is the only thing that distinguishes a holder that is alive --
    // refuse, because two runs on one tree measure nothing -- from one that was
    // killed -- take over, which has to keep working or a killed run would make the
    // tree unmeasurable forever.
    const live = sandbox({ body: "printf '\\303\\227 void\\n'", status: 1 });
    mkdirSync(join(live, 'node_modules', '.cache'), { recursive: true });
    writeFileSync(
      join(live, 'node_modules', '.cache', 'verify-gates-are-testable.lock'),
      JSON.stringify({ pid: process.pid, gate: '1 subject(s)' }),
    );
    const refused = audit(live);
    expect(refused.status).toBe(1);
    expect(refused.stderr).toContain('another run holds this tree');
    expect(refused.stdout).not.toContain('CAUGHT');

    // A pid that has certainly exited: a child is spawned, waited for, and its number
    // used. Reading it from a live process would prove the opposite branch.
    const dead = spawnSync(process.execPath, ['-e', '']).pid;
    expect(typeof dead).toBe('number');
    const stale = sandbox({ body: "printf '\\303\\227 void\\n'", status: 1 });
    mkdirSync(join(stale, 'node_modules', '.cache'), { recursive: true });
    writeFileSync(
      join(stale, 'node_modules', '.cache', 'verify-gates-are-testable.lock'),
      JSON.stringify({ pid: dead, gate: '1 subject(s)' }),
    );
    const taken = audit(stale);
    expect(taken.status).toBe(0);
    expect(taken.stdout).toContain('CAUGHT');
  });

  it('refuses to repair a file a live process is holding', () => {
    // The other half of the liveness question, and the reason the journal records a
    // pid at all. Repairing a gate that a live run is holding makes that run read a
    // pristine gate through its nested suite and record SURVIVED -- a verdict about
    // nothing, from an audit that believes it measured something.
    //
    // The journal here names the pid of *this* process, which is certainly alive, and
    // the entry is written by hand so the branch is reached without racing a real
    // run. The file is deliberately left pristine: what is asserted is that nothing
    // was written, not that something was undone.
    const tree = sandbox({ body: "printf '\\303\\227 void\\n'", status: 1 });
    const gate = join(tree, 'scripts', 'check-throwaway.mjs');
    const original = readFileSync(gate, 'utf8');
    const journal = join(tree, 'node_modules', '.cache', 'verify-gates-are-testable.json');
    mkdirSync(dirname(journal), { recursive: true });
    writeFileSync(
      journal,
      JSON.stringify([{ path: gate, original: 'process.exit(1);\n', gate: 'check-throwaway.mjs', pid: process.pid }]),
    );

    const outcome = audit(tree);
    expect(outcome.status).toBe(1);
    expect(outcome.stderr).toContain('check-throwaway.mjs is held by pid');
    expect(outcome.stderr).toContain('which is still running');
    expect(outcome.stdout).not.toContain('CAUGHT');
    expect(readFileSync(gate, 'utf8')).toBe(original);
  });

  it('runs the nested suite in its own process group, so it can be stopped at all', () => {
    // **Measured, not assumed.** Finding 173 recorded five `node (vitest N)` processes still
    // rewriting the tree minutes after the run that started them had died, and the fix has to
    // start here: a process in the audit's own group cannot be stopped without stopping the
    // audit, and a `spawnSync` returns the child's pid only after the child has exited -- which
    // is the wrong moment to write it down.
    //
    // The stub reports its own group and its parent's. They must differ, and the file is a
    // measurement through the real code path rather than a reading of the source.
    const tree = sandbox({
      body: "ps -o pgid= -p $$ > pgids.txt\nps -o pgid= -p $PPID >> pgids.txt\nprintf '\\303\\227 void\\n'",
      status: 1,
    });
    const outcome = audit(tree);
    expect(outcome.status).toBe(0);
    expect(outcome.stdout).toContain('CAUGHT');

    const [suite, parent] = readFileSync(join(tree, 'pgids.txt'), 'utf8')
      .trim()
      .split('\n')
      .map((line) => line.trim());
    expect(Number(suite)).toBeGreaterThan(0);
    expect(
      Number(suite),
      'the suite shares the audit’s process group, so nothing can stop it once the audit is gone',
    ).not.toBe(Number(parent));
  });

  it('stops a nested suite that the run starting it did not get to stop', async () => {
    // The journal covers a run that was killed, and a run that was killed is exactly the one
    // whose suite is still going. So the entry now carries the group, and the next run stops it
    // before it repairs the file -- in that order, because stopping it last would let it keep
    // reading a gate that is being written back.
    const tree = sandbox({ body: "printf '\\303\\227 void\\n'", status: 1 });
    const gate = join(tree, 'scripts', 'check-throwaway.mjs');
    const original = readFileSync(gate, 'utf8');

    // The stand-in: a live process group whose command line names vitest, which is the only
    // thing the identity check is allowed to look at.
    const suite = join(tree, 'bin', 'vitest');
    writeFileSync(suite, '#!/bin/sh\nsleep 60\n');
    chmodSync(suite, 0o755);
    const orphan = spawn(suite, [], { detached: true, stdio: 'ignore' });
    strays.push(orphan.pid ?? 0);
    await until('the stand-in suite to start', () => groupAlive(orphan.pid ?? 0));

    const dead = spawnSync(process.execPath, ['-e', '']).pid;
    const journal = join(tree, 'node_modules', '.cache', 'verify-gates-are-testable.json');
    mkdirSync(dirname(journal), { recursive: true });
    writeFileSync(
      journal,
      JSON.stringify([
        { path: gate, original, gate: 'check-throwaway.mjs', pid: dead, suite: orphan.pid },
      ]),
    );

    const outcome = audit(tree);
    expect(outcome.stderr).toContain('stopped the nested suite');
    expect(outcome.status).toBe(0);
    await until('the orphaned suite to be gone', () => !groupAlive(orphan.pid ?? 0));
    expect(readFileSync(gate, 'utf8')).toBe(original);
  });

  it('leaves a group alone when its command line is not a suite, because an id is not an identity', async () => {
    // The negative control, and the reason the check reads what a group is running rather than
    // trusting a number. Group ids are reused, so a journal written an hour ago can name a group
    // that now belongs to somebody else -- and a script that kills whatever a stale record points
    // at is worse than one that leaves an orphan.
    const tree = sandbox({ body: "printf '\\303\\227 void\\n'", status: 1 });
    const gate = join(tree, 'scripts', 'check-throwaway.mjs');
    const original = readFileSync(gate, 'utf8');

    const decoy = spawn('sleep', ['60'], { detached: true, stdio: 'ignore' });
    strays.push(decoy.pid ?? 0);
    await until('the decoy to start', () => groupAlive(decoy.pid ?? 0));

    const dead = spawnSync(process.execPath, ['-e', '']).pid;
    const journal = join(tree, 'node_modules', '.cache', 'verify-gates-are-testable.json');
    mkdirSync(dirname(journal), { recursive: true });
    writeFileSync(
      journal,
      JSON.stringify([
        { path: gate, original, gate: 'check-throwaway.mjs', pid: dead, suite: decoy.pid },
      ]),
    );

    const outcome = audit(tree);
    expect(outcome.stderr).toContain('left group');
    expect(groupAlive(decoy.pid ?? 0), 'the decoy was killed').toBe(true);
    expect(outcome.status).toBe(0);
  });

  it('restores the gate and stops the suite when the run is signalled', async () => {
    // The other half of `JOURNAL`'s reasoning. Its header records that a signal handler was tried
    // and did not work, because `spawnSync` blocks the event loop and a handler cannot run until
    // the child it is waiting for has exited -- which is where the kill arrived. That is a fact
    // about **blocking**, not about signals: the nested run is awaited now, so the loop is free
    // while it runs and a handler can do what the journal can only do on the next run.
    //
    // Proved by killing the audit and watching what is left: the gate back to the shipped bytes,
    // and nothing in the suite's group.
    const tree = sandbox({ body: 'echo $$ > suite.pid\nsleep 60', status: 0 });
    const gate = join(tree, 'scripts', 'check-throwaway.mjs');
    const original = readFileSync(gate, 'utf8');

    const child = spawn(process.execPath, [join(tree, 'scripts', AUDIT)], {
      cwd: tree,
      env: { ...process.env, PATH: `${join(tree, 'bin')}:${process.env.PATH ?? ''}` },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let said = '';
    child.stderr?.on('data', (chunk) => {
      said += String(chunk);
    });
    await until('the nested suite to start', () => existsSync(join(tree, 'suite.pid')));
    const group = Number(
      (readFileSync(join(tree, 'suite.pid'), 'utf8') || '0').trim().split(/\s+/)[0],
    );
    strays.push(group);
    expect(groupAlive(group), 'the stub never started a group').toBe(true);

    child.kill('SIGTERM');
    const code = await new Promise((resolve) => child.on('close', resolve));
    expect(code, 'an interrupted run reported success').not.toBe(0);
    expect(said).toContain('FAILED -- interrupted by SIGTERM');
    expect(said).toContain('check-throwaway.mjs was put back');
    expect(readFileSync(gate, 'utf8'), 'the gate was left hollowed').toBe(original);
    await until('the suite to be gone', () => !groupAlive(group));
  });

  it('refuses to stop the group it is running in', async () => {
    // The catastrophic case, and the reason the guard is not "will this kill something". A group
    // id recorded in a journal can end up naming the group the audit itself belongs to -- and a
    // signal to that group takes down the shell, the runner and everything beside them. The
    // identity check cannot catch it: run under vitest, this process's own group is full of
    // things whose command line says `vitest`.
    //
    // The journal has to name the audit's *own* group before the audit reads it, and the audit's
    // group is only knowable once it is running. So a wrapper leads a group of its own, writes
    // the journal naming `$$`, and then becomes the audit. If the guard is missing the audit
    // signals the group it is in and dies without a word, which is a failure this test can see
    // without taking the test runner down with it.
    const tree = sandbox({ body: "printf '\\303\\227 void\\n'", status: 1 });
    const gate = join(tree, 'scripts', 'check-throwaway.mjs');
    const original = readFileSync(gate, 'utf8');
    const journal = join(tree, 'node_modules', '.cache', 'verify-gates-are-testable.json');
    mkdirSync(dirname(journal), { recursive: true });
    const template = join(tree, 'journal.template.json');
    writeFileSync(
      template,
      JSON.stringify([{ path: gate, original, gate: 'check-throwaway.mjs', pid: 0, suite: '__GROUP__' }])
        // Unquoted, so the substitution yields a number. Quoted it yields a string, and a
        // string is not a group id -- the first version of this test proved that the hard
        // way, by passing for the wrong reason.
        .replace('"__GROUP__"', '__GROUP__'),
    );
    const wrapper = join(tree, 'wrapper.sh');
    writeFileSync(
      wrapper,
      '#!/bin/sh\n' +
        `sed "s/__GROUP__/$$/" "${template}" > "${journal}"\n` +
        // A bystander in the same group, so "the group survived" is a statement with a subject:
        // the audit itself is the group's only other member, and it exits either way. Its stdio
        // is closed on purpose -- a bystander holding the audit's pipes open would keep
        // `close` from firing for as long as it lives, which is what the first version of this
        // test did, and it read as a timeout rather than as the thing being measured.
        'sleep 600 >/dev/null 2>&1 &\necho $! > bystander.pid\n' +
        `exec "${process.execPath}" "${join(tree, 'scripts', AUDIT)}"\n`,
    );
    chmodSync(wrapper, 0o755);

    const child = spawn(wrapper, [], {
      // `cwd` is the tree, because the wrapper writes two files by relative path.
      cwd: tree,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      // The stub has to be the `npx` the nested run finds. Without this the audit measures the
      // real vitest against a sandbox tree, which is a failure for a reason that has nothing to
      // do with the guard under test -- the same trap the other sandboxes avoid by construction.
      env: { ...process.env, PATH: `${join(tree, 'bin')}:${process.env.PATH ?? ''}` },
    });
    strays.push(child.pid ?? 0);
    let err = '';
    child.stderr?.on('data', (chunk) => {
      err += String(chunk);
    });
    const [code, signal] = await new Promise((resolve) =>
      child.on('close', (exitCode, exitSignal) => resolve([exitCode, exitSignal])),
    );

    await until('the audit to report the refusal', () => err.includes('own group'));
    expect(err).toContain('own group');
    expect(signal, 'the audit was signalled, which means it signalled the group it was in').toBeNull();
    expect(code).toBe(0);
    // The bystander is the measurement: a signal to the group would have taken it with it.
    const bystander = Number(readFileSync(join(tree, 'bystander.pid'), 'utf8').trim());
    expect(
      (() => {
        try {
          process.kill(bystander, 0);
          return true;
        } catch {
          return false;
        }
      })(),
      'the bystander was killed, so the group was signalled',
    ).toBe(true);
    expect(readFileSync(gate, 'utf8')).toBe(original);
  });

  it('reports a recorded group it cannot read as a group, rather than passing over it', () => {
    // The rule the sweep states about itself: every refusal is reported, because a sweep that
    // declines in silence cannot be told apart from one that found nothing. `null` is the single
    // exception and it is not a refusal -- it is the documented window between the journal entry
    // and the `spawn` that names the group, which is why it is written down in the entry rather
    // than defaulted.
    const tree = sandbox({ body: "printf '\\303\\227 void\\n'", status: 1 });
    const gate = join(tree, 'scripts', 'check-throwaway.mjs');
    const journal = join(tree, 'node_modules', '.cache', 'verify-gates-are-testable.json');
    mkdirSync(dirname(journal), { recursive: true });
    writeFileSync(
      journal,
      JSON.stringify([
        {
          path: gate,
          original: readFileSync(gate, 'utf8'),
          gate: 'check-throwaway.mjs',
          pid: 0,
          suite: 'not-a-group',
        },
      ]),
    );

    const outcome = audit(tree);
    expect(outcome.stderr).toContain('"not-a-group"');
    expect(outcome.stderr).toContain('not a group id');
    expect(outcome.status).toBe(0);
  });

  it('reads a failure the runner coloured, which is the only shape CI produces', () => {
    // **The defect this file was written after.** The audit looked for a line whose
    // first non-space character is `×`; it passed here and on CI reported
    // `caught: 0, survived: 13`, because a runner colourises and the line is
    // `\x1b[31m×\x1b[39m …`. That is the same defect class the audit exists to
    // find, in the audit, and the fourth time this campaign has recorded it.
    //
    // The escapes below are written as printf octal rather than as literal bytes so
    // the stub is readable; what matters is that an escape precedes the marker.
    const outcome = audit(sandbox({ body: "printf '\\033[31m\\303\\227\\033[39m void\\n'", status: 1 }));
    expect(outcome.status).toBe(0);
    expect(outcome.stdout).toContain('CAUGHT');
    expect(outcome.stdout).toContain('gates: 1  caught: 1  survived: 0  no-test: 0  unattributed: 0');
  });

  it('refuses to credit a failure that names no failing test', () => {
    // The other half of reading the verdict honestly. `npx vitest run <files>`
    // exits non-zero when a test fails **and** when there was nothing to run -- a
    // suite that never collected, a path that does not exist, a syntax error
    // introduced by the hollowing itself. Crediting those as CAUGHT would be
    // reading a crash as a proof, so the state is named rather than assumed and
    // the run fails: an unattributable failure cannot be credited to the gate.
    const outcome = audit(sandbox({ body: "printf 'No test files found\\n'", status: 1 }));
    expect(outcome.status).toBe(1);
    expect(outcome.stdout).toContain('UNATTRIBUTED');
    expect(outcome.stderr).toContain('without naming a failing test');
  });

  it('refuses to credit a mutation it could not make parse', () => {
    // The defect the first version actually had, and it was not theoretical.
    //
    // The hollowing inserted its line after the last line beginning with `import`,
    // which for `check-official.mjs` is the opening brace of a multi-line import.
    // The mutated gate was a **syntax error**, its tests failed for that reason,
    // and the row read CAUGHT with 51 failing tests -- a crash credited as proof
    // that the gate's tests notice its removal.
    //
    // So a mutation is parsed before it is trusted, and one that does not parse is
    // reported, not credited. The sandbox gate below is invalid on its own, which
    // is the simplest way to be sure the branch is reachable; the bytes must also
    // be left exactly as they were, because there is no reason to write a mutation
    // that will not be run.
    const tree = sandbox({ body: 'true', status: 0 });
    const gate = join(tree, 'scripts', 'check-throwaway.mjs');
    const invalid = 'process.exit(0\n';
    writeFileSync(gate, invalid);

    const outcome = audit(tree);
    expect(outcome.status).toBe(1);
    expect(outcome.stdout).toContain('UNPARSABLE');
    expect(outcome.stderr).toContain('could not be hollowed into valid JavaScript');
    expect(readFileSync(gate, 'utf8')).toBe(invalid);
  });

  it('repairs a gate an earlier run was killed while holding', () => {
    // **Measured, not imagined.** A run was killed while it held
    // `scripts/check-official.mjs` hollowed, and the next `git status` showed that
    // gate modified in the working tree. Every step after that would have read a
    // gate with its verdict removed as the shipped gate -- the failure finding 142
    // repaired in three batteries and 148 in the ones nothing invoked.
    //
    // The first repair was a signal handler and it does not cover the case: during
    // `spawnSync` the event loop is blocked, so a handler cannot run until the
    // child exits, and that is exactly where the kill arrived. SIGKILL cannot be
    // handled at all. So the repair is a journal written before the mutation and
    // consumed by the next run, which covers every way a run can end.
    //
    // The journal is laid down here by hand and the gate is left hollowed, so the
    // test asserts the repair itself rather than a signal's timing.
    const tree = sandbox({ body: "printf '\\303\\227 void\\n'", status: 1 });
    const gate = join(tree, 'scripts', 'check-throwaway.mjs');
    const original = readFileSync(gate, 'utf8');
    const journal = join(tree, 'node_modules', '.cache', 'verify-gates-are-testable.json');
    mkdirSync(dirname(journal), { recursive: true });
    writeFileSync(journal, JSON.stringify({ path: gate, original, gate: 'check-throwaway.mjs' }));
    writeFileSync(gate, 'process.exit(0);\n');

    const outcome = audit(tree);
    expect(readFileSync(gate, 'utf8'), 'the hollowed gate was measured instead of repaired').toBe(original);
    expect(existsSync(journal), 'the journal was left behind').toBe(false);
    expect(outcome.stderr).toContain('repaired check-throwaway.mjs');
    // And the run then proceeded normally, so the repair is a sweep rather than a
    // reason to stop.
    expect(outcome.status).toBe(0);
    expect(outcome.stdout).toContain('CAUGHT');
  });

  it('fails rather than continuing when the journal cannot put the gate back', () => {
    // The repair is a sweep, and a sweep that cannot restore has to stop. Continuing
    // would measure a gate it knows is not the shipped one, which is the reading
    // the journal exists to prevent -- so the failure is loud and the run ends.
    //
    // Proved by making the restore a no-op: the gate is a symlink to `/dev/null`, so
    // the repair's write is discarded and the read-back cannot match. The same
    // filesystem property the in-run restore test uses, applied one step earlier.
    const tree = sandbox({ body: "printf '\\303\\227 void\\n'", status: 1 });
    const gate = join(tree, 'scripts', 'check-throwaway.mjs');
    const original = readFileSync(gate, 'utf8');
    rmSync(gate);
    symlinkSync('/dev/null', gate);
    const journal = join(tree, 'node_modules', '.cache', 'verify-gates-are-testable.json');
    mkdirSync(dirname(journal), { recursive: true });
    writeFileSync(journal, JSON.stringify({ path: gate, original, gate: 'check-throwaway.mjs' }));

    const outcome = audit(tree);
    expect(outcome.status).toBe(1);
    expect(outcome.stderr).toContain('could not repair check-throwaway.mjs from the journal');
    // And it did not go on to measure anything.
    expect(outcome.stdout).not.toContain('CAUGHT');
  });

  it('fails when it cannot put a gate back, rather than reporting success', () => {
    // The restore is verified by reading the file back and comparing, because a
    // battery that leaves a tracked file mutated corrupts every later step. The
    // branch is proved by making the restore a no-op: the stub replaces the gate
    // with a symlink to `/dev/null` while the audit is between its write and its
    // read-back, so the write is discarded and the comparison must fail.
    //
    // A deterministic filesystem property rather than a mock, and confined to the
    // sandbox: the audit's own message is what is asserted, so a crash for any
    // other reason cannot satisfy this test.
    const tree = sandbox({
      body: `rm -f scripts/check-throwaway.mjs && ln -s /dev/null scripts/check-throwaway.mjs`,
      status: 1,
    });
    const outcome = audit(tree);
    expect(outcome.status).toBe(1);
    expect(outcome.stderr).toContain('FAILED -- could not restore check-throwaway.mjs');
  });

  it('fails when a gate survives being emptied', () => {
    // The stub exits 0 and prints no failure line, so the audit sees no test
    // going red: every gate must be reported SURVIVED and the run must fail.
    const outcome = audit(sandbox({ body: 'true', status: 0 }));
    expect(outcome.status).toBe(1);
    expect(outcome.stdout).toContain('SURVIVED');
    expect(outcome.stdout).toContain('check-throwaway.mjs');
    expect(outcome.stderr).toContain('can be emptied with no test noticing');
    expect(outcome.stdout).toContain('restored byte-for-byte: 1 of 1');
  });

  it('passes when a gate is caught, and says so (control)', () => {
    // The other direction, so the failure above cannot be satisfied by an audit
    // that fails on everything. The stub prints a vitest failure line and exits
    // non-zero, which is the observation the audit calls CAUGHT.
    const outcome = audit(sandbox({ body: "printf '\\303\\227 void\\n'", status: 1 }));
    expect(outcome.status).toBe(0);
    expect(outcome.stdout).toContain('CAUGHT');
    expect(outcome.stdout).toContain('gates: 1  caught: 1  survived: 0  no-test: 0  unattributed: 0');
    expect(outcome.stdout).toContain('OK (1 gate(s)');
  });

  it('is invoked by a package script and by a workflow, not only by hand', () => {
    // The defect finding 148 recorded at a scale of three: a battery that is
    // green when run by hand and that no job and no script names. Both halves are
    // asserted, because a package script nobody calls reproduces the same gap.
    const manifest = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>;
    };
    const commands = Object.values(manifest.scripts ?? {});
    expect(commands.some((command) => command.includes(AUDIT))).toBe(true);

    const workflows = readdirSync(resolve(ROOT, '.github', 'workflows'));
    const runLines = workflows.flatMap((name) =>
      readFileSync(resolve(ROOT, '.github', 'workflows', name), 'utf8')
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.startsWith('run:') || line.startsWith('- run:')),
    );
    expect(
      runLines.some((line) => line.includes(AUDIT)),
      'the audit is not reached by any workflow, so a merge is not decided by it',
    ).toBe(true);
  });
});
