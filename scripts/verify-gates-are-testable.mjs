#!/usr/bin/env node
/**
 * Every gate can be hollowed out, or this says which one cannot be caught.
 *
 * ## What this establishes, and why it is a mutation rather than a reading
 *
 * `docs/progress.md` states the rule in three clauses: a threshold gate prevents
 * regression, an enumeration gate discovers omission, and **a gate with no test is
 * neither**. The property P1-6 asks for is the third clause stated as an
 * experiment -- *delete it and some test goes red* -- and an experiment is the
 * only form of it that cannot be satisfied by reading.
 *
 * The tracking row for that item read "partially complete (3 of 8 gates)" for
 * several rounds. That number was counting a **mechanism**: the gates that carry
 * a dedicated "runs clean here, fails on a synthesised violation" block in
 * `gates-are-testable.test.ts`. The criterion is broader, and measured as written
 * it already holds for every gate in the tree -- so the row was reporting the
 * instrument rather than the property, which is the shape this audit has now
 * recorded at least five times.
 *
 * ## The mutation
 *
 * Each gate is hollowed by inserting `process.exit(0)` after its import block, so
 * it reports success unconditionally, and the test files that name it are run.
 * Those are the only files that could notice; running the whole suite per gate
 * would take an hour and cannot produce a different verdict, because a file that
 * does not name the gate cannot be the proof of it.
 *
 * A gate that survives is reported with the word SURVIVED and fails the run. A
 * gate no test names at all is reported NO-TEST and fails it too. Zero injected
 * gates is a failure as well: a run whose subject list came back empty would
 * otherwise pass while measuring nothing, which is the defect this script exists
 * to find.
 *
 * ## What this does *not* establish
 *
 * It hollows the **whole gate**. A narrower edit -- gutting one rule inside a gate
 * while the rest still works -- is not caught by this script, and finding 46 is
 * precisely that case: the enumeration inside `check-official.mjs` was deleted
 * while cases were diverted past the count, and the file stayed green. The
 * rule-level property has its own mechanism, `golden-master/gate-sites.json`,
 * where every failure exit is enumerated with a pointer to the test that proves
 * it, checked by `gate-sites-are-proven.test.ts`. The two are complements: this
 * one says a gate cannot be emptied unnoticed, that one says each of its failure
 * exits is proved.
 *
 * ## Restoration
 *
 * Every gate is written back from the bytes read before the mutation, and the
 * write is read back and compared. A battery that leaves a tracked file mutated
 * would corrupt every later step, so a failed restore is a failure of this script
 * rather than a warning.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const TESTS = resolve(ROOT, 'packages', 'core', 'test');
const INVENTORY = resolve(ROOT, 'golden-master', 'gate-sites.json');

/**
 * Every gate in the tree: the scripts `golden-master/gate-sites.json` says exit
 * non-zero when unhappy.
 *
 * ## Why the inventory rather than a directory scan
 *
 * This read `readdirSync('scripts').filter(n => n.startsWith('check-') && n.endsWith('.mjs'))`
 * for seven passes. The derivation was real -- a list that must be updated when a
 * file is added cannot see the file it is missing -- but it derived a **spelling**.
 * The property is "exits non-zero when unhappy", and the prefix is one spelling of
 * it: `process.exit(main())` is how every battery here reports, `process.exit(2)`
 * is how `fetch-official.mjs` says the pin does not match, and three of the
 * batteries the pipeline runs on every push were outside the subject list for that
 * reason alone.
 *
 * The inventory enumerates the property: 37 scripts against the prefix's 16, with
 * none in the prefix alone. It is itself derived (`derive-gate-sites.mjs`) and held
 * to the tree by `--check`, which runs in `docs:check` and in the cold-tree job --
 * so the subjects are still discovered rather than listed, one step upstream.
 *
 * ## Why this reading is verified in both directions rather than by pattern
 *
 * `gates-are-testable-is-enumerated.test.ts` asks this script for its list with
 * `--list` and compares it against the inventory, and pins two members a wrong rule
 * would get wrong: a subject whose name is not `check-*` must be in it, and a script
 * that never exits non-zero must not be. Asserting that the source *mentions* the
 * inventory would have been finding 168's shape -- a check reading prose.
 */
function gates() {
  const inventory = JSON.parse(readFileSync(INVENTORY, 'utf8'));
  return [...new Set(inventory.sites.map((site) => site.script.replace(/^scripts\//, '')))].sort();
}

/** The test files that name this gate -- the only ones that could notice. */
function referencingTests(gate) {
  return readdirSync(TESTS)
    .filter((name) => name.endsWith('.test.ts'))
    .filter((name) => readFileSync(resolve(TESTS, name), 'utf8').includes(gate))
    .map((name) => `test/${name}`)
    .sort();
}

/**
 * The one line every mutation inserts, and the test for whether it is already there.
 *
 * ## Why the marker is shared between the two directions
 *
 * The mutation and the precondition have to agree about what "hollowed" means, byte
 * for byte, or the precondition checks a different string than the one the mutation
 * writes. So both are written from this constant.
 *
 * ## What the precondition is for
 *
 * **Measured, not imagined.** While this script's subject list was being widened, a
 * test spawned it against the real tree, and that is a recursive act: the audit
 * measures `scripts/verify-gates-are-testable.mjs` by running the test file that
 * drives it, which spawns the audit again. Several runs overlapped on one tree,
 * sharing one journal. Each read an *already hollowed* file as its `original`, so
 * each "restored" a hollowed file and added one more marker, and the journal's
 * repair record was itself hollowed. The run ended with **twelve scripts left
 * mutated, eight of them carrying two or three markers**, and the repair path
 * faithfully reported that it had repaired one of them.
 *
 * The missing fact was a precondition: **an audit cannot measure a tree that is
 * already mutated.** Stating it makes the cascade impossible, because a second run
 * refuses instead of compounding the first, and it makes the journal's `original`
 * provably not a mutation -- a mutation would have been refused -- so a repair can
 * no longer be a no-op reported as a repair.
 *
 * ## The orphan grandchildren, which the precondition does not fix on its own
 *
 * Killing a run does not kill its nested suite. **`spawnSync`'s `timeout` kills its
 * direct child and nothing below it**, so a killed audit leaves `npx vitest`
 * running, and that suite keeps driving this script. Five such orphans were
 * observed still rewriting the tree minutes after the run they belonged to had
 * died. The precondition is what makes a surviving orphan harmless: it refuses to
 * measure, so the worst it can do is fail. That is also why the tests below ask for
 * `--list` rather than running this script for real.
 */
const HOLLOW_LINE = 'process.exit(0);';

/** Whether a source already carries the marker as a statement of its own. */
function isHollowed(source) {
  const lines = source.split('\n');
  const at = lines[0]?.startsWith('#!') ? 1 : 0;
  return (lines[at] ?? '').trim() === HOLLOW_LINE;
}

/**
 * The gate with its verdict removed: `process.exit(0)` as the first statement.
 *
 * ## Why the top of the file, and not after the imports
 *
 * The first version inserted the line after the last line beginning with
 * `import`. That is wrong for any file whose last import is **multi-line**:
 * `check-official.mjs` has
 *
 *     import {
 *       exportForScoreTarget,
 *       ...
 *     } from '...';
 *
 * so the insertion landed between the brace and the first name, and the mutated
 * gate was a **syntax error**. Its row then read CAUGHT with 51 failing tests --
 * a crash, credited as proof that the gate's tests notice its removal. That is
 * this repository's oldest defect shape, committed by the script that exists to
 * find it, and it is why every mutation is now checked for parseability below
 * rather than assumed to be well-formed.
 *
 * ESM hoists imports, so a statement placed above them still runs after the
 * imports are evaluated but before anything the module itself does -- which is
 * exactly the hollowing wanted, and it cannot break the grammar. The shebang is
 * skipped because it must remain the first line.
 */
function hollowed(source) {
  const lines = source.split('\n');
  const at = lines[0]?.startsWith('#!') ? 1 : 0;
  return [...lines.slice(0, at), HOLLOW_LINE, ...lines.slice(at)].join('\n');
}

/**
 * Whether the mutated source is still valid JavaScript.
 *
 * A mutation that does not parse fails the suite for a reason that has nothing to
 * do with the gate, and a failing suite is what this script reads as proof. So the
 * mutation is parsed first. This is the guard the first version lacked, and its
 * absence was not theoretical -- see `hollowed` above.
 */
function parses(source) {
  const dir = mkdtempSync(join(tmpdir(), 'rca-bench-hollow-'));
  try {
    const file = join(dir, 'candidate.mjs');
    writeFileSync(file, source);
    return spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' }).status === 0;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Remove the SGR escapes vitest emits when colour is on.
 *
 * This script was written, run green here, and failed on its first CI run with
 * `caught: 0, survived: 13` -- every gate reported as unguarded. The cause was its
 * own detector: it looked for a line whose first non-space character is `×`, and
 * on a runner vitest colourises, so the line is `\x1b[31m×\x1b[39m …` and begins
 * with an escape. That is precisely the defect class this audit exists to find,
 * in the audit, and it is the fourth time this campaign has recorded it (findings
 * 147, 148, and twice in the readers they repaired).
 *
 * It was caught rather than tolerated because a SURVIVED gate fails the run: the
 * failure mode of this script is loud by construction, which is the only reason
 * the divergence between here and the runner surfaced at all.
 */
function stripAnsi(text) {
  // eslint-disable-next-line no-control-regex
  return String(text).replace(/\u001b\[[0-9;]*m/g, '');
}

/**
 * Whether the nested run shows a failure, and whether its status agrees.
 *
 * ## Why the exit status alone is not the verdict
 *
 * `npx vitest run <files>` exits non-zero both when a test fails and when there
 * is nothing to run -- a suite that was never collected, a path that does not
 * exist, a syntax error introduced by the hollowing itself. Crediting any of
 * those as CAUGHT would be reading a crash as a proof, which is the false-green
 * idiom this repository rejects everywhere else.
 *
 * So both halves are required: the status must be non-zero **and** the output must
 * name at least one failing test. A run that fails without naming one is its own
 * state, reported as its own word, and fails the audit -- because it cannot be
 * credited to the gate.
 */
function classify(files, result) {
  const out = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  const failures = stripAnsi(out)
    .split('\n')
    .filter((line) => line.trim().startsWith('\u00d7'));
  const status = result.status ?? -1;
  if (status !== 0 && failures.length > 0) return { verdict: 'CAUGHT', failures };
  if (status === 0) return { verdict: 'SURVIVED', failures };
  return { verdict: 'UNATTRIBUTED', failures, status, files };
}

/**
 * The suite this run is waiting for, as a process group, while it is running.
 *
 * ## Why this is in memory *and* in the journal
 *
 * The two are for two different deaths, and finding 173 is what made the difference
 * matter. A killed run leaves two things behind: a hollowed file, which the journal
 * covers, and the nested suite, which was still rewriting the tree minutes after the
 * run that started it had died. A run that is **signalled** can clean up itself --
 * the handler below does, and it can only do so because this handle is here. A run
 * that is **SIGKILLed** cannot, and for it the group is written into the journal
 * before the file is mutated, so the next run can stop it.
 *
 * ## Why the group needs finding, and cannot simply be remembered
 *
 * `process.kill(-group, …)` reaches every member, and that is the point: the group a
 * nested run leads contains `npx`, vitest, and vitest's workers, and stopping the
 * leader alone leaves the rest -- measured on the first experiment with this
 * mechanism, whose group held a `sleep` that a pid-only kill would have left behind.
 *
 * A group id is not an identity, though. Ids are reused, so the recorded number is
 * checked against what the group is actually running before anything is signalled,
 * and the check refuses more often than it kills. See `stopSuite`.
 */
let inFlight = null;

/**
 * The word every command line of the nested run contains.
 *
 * `spawn('npx', ['vitest', …])` puts `vitest` in the argv of the shell that runs
 * `npx`, of `npx` itself, and of the runner, so the marker survives the layer in
 * between without this script having to know how many layers there are.
 */
const SUITE_MARK = 'vitest';

/** The process group this script is running in, asked of the kernel. */
function ownGroup() {
  const out = spawnSync('ps', ['-o', 'pgid=', '-p', String(process.pid)], {
    encoding: 'utf8',
    timeout: 10_000,
  });
  const value = Number((out.stdout ?? '').trim());
  return Number.isInteger(value) && value > 0 ? value : null;
}

/**
 * What is running in a process group, or `null` when that cannot be read.
 *
 * The three answers are kept apart on purpose: an empty list means the group is gone
 * and there is nothing to do, `null` means the question could not be answered, and
 * neither is permission to signal anything. `ps` is POSIX and this repository's
 * runners are Linux, but a machine without it must not be read as a machine with an
 * idle group.
 */
function processesIn(group) {
  const out = spawnSync('ps', ['-A', '-o', 'pgid=,args='], { encoding: 'utf8', timeout: 10_000 });
  if (out.error !== undefined || out.status !== 0 || typeof out.stdout !== 'string') return null;
  return out.stdout
    .split('\n')
    .map((line) => /^\s*(\d+)\s+(.*)$/.exec(line))
    .filter((match) => match !== null)
    .map((match) => ({ pgid: Number(match[1]), args: match[2] }))
    .filter((row) => row.pgid === group);
}

/**
 * Stop a nested suite that outlived the run that started it, or say why not.
 *
 * Every refusal is reported, because a sweep that silently declines is
 * indistinguishable from a sweep that found nothing -- and the two mean different
 * things to whoever is reading the output.
 */
function stopSuite(group, report) {
  // `null` is the documented window -- the entry goes down before the mutation and the
  // group a few milliseconds later -- so it is the one value that means "nothing to
  // report", and it is the only one. Everything else that is not a usable group is
  // something a reader wrote, and a sweep that declines in silence is
  // indistinguishable from a sweep that found nothing.
  if (group === null || group === undefined) return false;
  if (!Number.isInteger(group) || group <= 0) {
    report(`verify-gates-are-testable: left group ${JSON.stringify(group)} alone -- it is not a group id`);
    return false;
  }
  if (group === process.pid || group === ownGroup()) {
    // Catastrophic if it happened: a signal to this group takes down the shell, the
    // runner and everything beside them.
    report(`verify-gates-are-testable: left group ${group} alone -- it is this run's own group`);
    return false;
  }

  const members = processesIn(group);
  if (members === null) {
    report(`verify-gates-are-testable: left group ${group} alone -- nothing here can say what is in it`);
    return false;
  }
  if (members.length === 0) return false;
  if (!members.some((member) => member.args.includes(SUITE_MARK))) {
    report(
      `verify-gates-are-testable: left group ${group} alone -- its members are not a ${SUITE_MARK} run, ` +
        'and a group id is not an identity',
    );
    return false;
  }

  try {
    process.kill(-group, 'SIGTERM');
  } catch (error) {
    report(`verify-gates-are-testable: could not stop group ${group}: ${error.code ?? error.message}`);
    return false;
  }
  report(
    `verify-gates-are-testable: stopped the nested suite left by the run that was killed ` +
      `(group ${group}, ${members.length} process(es))`,
  );
  return true;
}

/**
 * Run the test files that could notice, and report what they said.
 *
 * ## Why this is `spawn` and awaited, where it was `spawnSync`
 *
 * A `spawnSync` returns the child's pid only after the child has **exited**, which is
 * the wrong moment to write it down: the whole reason to write it down is a run that
 * does not reach its own cleanup. Awaiting the child instead means the group is known
 * while it runs, so the journal can name it, and -- the second gain -- the event loop
 * is free for the whole nested run, which is what lets the signal handler below do
 * anything at all. `JOURNAL`'s own header records a signal handler being tried and
 * abandoned for the opposite reason.
 *
 * `detached` puts the child in a group of its own, so the same group can be signalled
 * later without touching this process.
 */
async function runTests(files) {
  const child = spawn('npx', ['vitest', 'run', '--root', 'packages/core', ...files], {
    cwd: ROOT,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  inFlight = { group: child.pid };
  rememberSuite(child.pid);

  let out = '';
  child.stdout?.on('data', (chunk) => {
    out += String(chunk);
  });
  child.stderr?.on('data', (chunk) => {
    out += String(chunk);
  });
  const status = await new Promise((resolve) => child.on('close', (code) => resolve(code ?? -1)));
  inFlight = null;
  return classify(files, { status, stdout: out, stderr: '' });
}

const subjects = gates();

/**
 * Report the subject list and stop, touching nothing.
 *
 * A query rather than a verdict, which is why it exits 0 on an empty list: its
 * answer is the list, and a caller comparing that answer against the inventory
 * wants to see an empty one rather than a refusal. It exists because the only other
 * way to ask this script what it measures is to run it -- 104 seconds for the 37
 * subjects this list returns, on the real tree, which is the hazard `HOLLOW_LINE`
 * describes. (It was 51 seconds for 16 before pass 50 widened the subjects to the
 * inventory, and that sentence said `51 seconds for 16` until it was corrected
 * here: a number in prose is a status column, and this pass's own finding is about
 * one of those going stale for a round.)
 * `gates-are-testable-is-enumerated.test.ts` asks with this flag and never runs the
 * audit for real.
 *
 * It is placed before the sweep and the lock because a query must not repair, must
 * not refuse because somebody else is measuring, and must not take the tree.
 */
if (process.argv.includes('--list')) {
  for (const gate of subjects) console.log(gate);
  process.exit(0);
}

if (subjects.length === 0) {
  console.error('verify-gates-are-testable: FAILED');
  console.error('  golden-master/gate-sites.json names no gate, so this run would pass while measuring nothing.');
  process.exit(1);
}

const survived = [];
const unvisited = [];
const unattributed = [];
const unparsable = [];
const restored = [];

/**
 * The file currently mutated, recorded on disk so a later run can undo it.
 *
 * ## Why a journal rather than a signal handler
 *
 * The leak was measured: a run was killed while it held `scripts/check-official.mjs`
 * hollowed, and the next `git status` showed that gate modified in the working
 * tree. The first repair was a SIGINT/SIGTERM/SIGHUP handler, and it did not work
 * for the case that was actually observed. During `spawnSync` the event loop is
 * blocked, so a handler registered with `process.on` cannot run until the child
 * exits -- and the kill that caused the leak arrived exactly there. A SIGKILL
 * cannot be handled by any process at all.
 *
 * The second sentence of that was read as a fact about signals for two passes. It is
 * a fact about **blocking**: the nested run is awaited now, so the loop is free and
 * `interrupted` below does the same sweep at signal time. The journal is still the
 * mechanism for a SIGKILL and for a crash, and the three are complements -- a signal
 * is cleaned up by the handler, a kill by the next run, and a survivor of either is
 * made harmless by the precondition on the tree.
 *
 * So the restore is not attempted at kill time. The bytes are written to a journal
 * **before** the mutation, and the next run repairs from it before doing anything
 * else. That covers every way a run can end: an exception, a signal, a blocked
 * event loop, or SIGKILL, all of which leave the same journal and the same repair.
 * The file lives in `node_modules/.cache`, which exists after any install and is
 * never committed, so the journal itself cannot become a stray tracked file.
 *
 * ## Why it is a list, and why each entry carries a pid
 *
 * It was a single object, and that shape lost records: two kills in one session
 * overwrite each other, so the first leak is repaired and the second is not. A list
 * keeps every record, and the repair drains all of them.
 *
 * The pid is what lets a run tell **a run that died** from **a run that is in
 * flight**. Without it, a second run repairs the file a live run is holding, and
 * that live run then measures a pristine gate through its own nested suite and
 * records SURVIVED -- a verdict about nothing.
 */
const JOURNAL = resolve(ROOT, 'node_modules', '.cache', 'verify-gates-are-testable.json');

/**
 * The exclusion that the journal cannot provide on its own.
 *
 * The journal is empty between two subjects, so the window in which two runs can
 * both pass their startup check and then mutate the same tree is real -- it is
 * small, and this session found it by widening the subject list while a test drove
 * the script. `openSync(..., 'wx')` is atomic on the filesystem, so the acquisition
 * cannot race; the pid inside is what distinguishes a holder that is alive from one
 * that was killed, which is the only case in which taking it over is right.
 */
const LOCK = resolve(ROOT, 'node_modules', '.cache', 'verify-gates-are-testable.lock');

function journalRead() {
  if (!existsSync(JOURNAL)) return [];
  try {
    const parsed = JSON.parse(readFileSync(JOURNAL, 'utf8'));
    // The earlier shape was a single object. Read rather than rejected, so a tree
    // carrying one from an older checkout is swept by this run.
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return null;
  }
}

function journalWrite(entries) {
  if (entries.length === 0) {
    rmSync(JOURNAL, { force: true });
    return;
  }
  mkdirSync(dirname(JOURNAL), { recursive: true });
  writeFileSync(JOURNAL, JSON.stringify(entries));
}

/**
 * Record the nested suite's group against the entry for the file being mutated.
 *
 * The entry is written before the mutation and completed here, a few milliseconds
 * later, because a `spawn` hands back its pid and a `spawnSync` does not. A kill
 * inside that window leaves a file the next run repairs and a suite it cannot name;
 * that is a smaller hole than the one this closes, and it is written down rather than
 * left to be discovered.
 */
function rememberSuite(group) {
  const entries = journalRead();
  const mine = entries.find((entry) => entry.pid === process.pid && entry.suite === null);
  if (mine === undefined) return;
  mine.suite = group;
  journalWrite(entries);
}

/**
 * Whether a recorded pid names a process that is still running.
 *
 * `process.kill(pid, 0)` sends no signal and reports only whether the process
 * exists. EPERM means it exists and belongs to somebody else, which counts as
 * alive; anything else means it is gone. A non-positive or non-integer value is
 * never a pid this script wrote, so it is treated as dead rather than handed to
 * `kill`, where `0` and `-1` mean *every process in the group*.
 */
function isAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

function holderOf(path) {
  if (!existsSync(path)) return null;
  try {
    const held = JSON.parse(readFileSync(path, 'utf8'));
    return { pid: held.pid, gate: held.gate };
  } catch {
    // An unreadable lock is a lock whose holder cannot be named, and assuming it is
    // dead would mean two runs on one tree. So it is treated as held by nobody and
    // taken over -- the alternative is a tree that can never be measured again.
    return { pid: undefined, gate: 'an unreadable lock' };
  }
}

/**
 * Take the tree, or refuse because somebody else has it.
 *
 * Called after the journal has been drained, so a lock left by a killed run is
 * taken over rather than obeyed. The lock is not removed on failure paths; a
 * process that exits has its lock read as dead by the next run, which is the same
 * mechanism as the journal's.
 */
function acquireLock(subjectCount) {
  const held = holderOf(LOCK);
  if (held !== null && isAlive(held.pid)) {
    console.error('verify-gates-are-testable: FAILED');
    console.error(`  another run holds this tree (pid ${held.pid}, measuring ${held.gate})`);
    console.error('  two runs cannot measure one tree at the same time');
    process.exit(1);
  }
  mkdirSync(dirname(LOCK), { recursive: true });
  writeFileSync(LOCK, JSON.stringify({ pid: process.pid, gate: `${subjectCount} subject(s)` }));
}

function releaseLock() {
  rmSync(LOCK, { force: true });
}

/**
 * Undo any mutation an earlier run did not get to undo, before anything is measured.
 *
 * Reported rather than repaired in silence: a run that had to do this has lost the
 * previous run's output, and the reader needs to know that the gate they are about
 * to see measured is the shipped one.
 */
function repairFromJournal() {
  const entries = journalRead();
  if (entries === null) {
    // A journal that cannot be read is not a reason to skip the sweep; it is a
    // reason to say so and continue, because leaving a gate hollowed is worse.
    console.error('verify-gates-are-testable: the journal is unreadable; check scripts/ by hand');
    rmSync(JOURNAL, { force: true });
    return;
  }
  if (entries.length === 0) return;

  const inFlight = entries.filter((entry) => isAlive(entry.pid));
  if (inFlight.length > 0) {
    // Not repaired, and not repaired by a race either: writing the original back
    // while the holder is mid-measurement would make its nested suite read a
    // pristine gate and report SURVIVED.
    console.error('verify-gates-are-testable: FAILED');
    for (const entry of inFlight) {
      console.error(`  ${entry.gate} is held by pid ${entry.pid}, which is still running`);
    }
    console.error('  two runs cannot measure one tree at the same time');
    process.exit(1);
  }

  const unrestored = [];
  for (const entry of entries) {
    // The suite first, the file second, and the order is not cosmetic: the suite is a
    // process reading the file this loop is about to write, and it is a process nobody
    // is waiting for. Stopping it afterwards would restore a file underneath a reader
    // whose verdict no run will ever collect.
    stopSuite(entry.suite, (line) => console.error(line));
    writeFileSync(entry.path, entry.original);
    if (readFileSync(entry.path, 'utf8') !== entry.original) unrestored.push(entry.gate);
  }
  journalWrite([]);
  for (const entry of entries) {
    console.error(`verify-gates-are-testable: repaired ${entry.gate}, left hollowed by a run that was killed`);
  }
  if (unrestored.length > 0) {
    console.error('verify-gates-are-testable: FAILED');
    for (const gate of unrestored) {
      console.error(`  could not repair ${gate} from the journal`);
    }
    process.exit(1);
  }
}

repairFromJournal();

/**
 * Refuse to measure a tree that is not the shipped one.
 *
 * Stated once, before anything is written, so a bad tree produces one refusal
 * instead of a cascade. `HOLLOW_LINE` records the run that motivated it.
 */
const alreadyHollowed = subjects.filter((gate) => isHollowed(readFileSync(resolve(ROOT, 'scripts', gate), 'utf8')));
if (alreadyHollowed.length > 0) {
  console.error('verify-gates-are-testable: FAILED');
  for (const gate of alreadyHollowed) {
    console.error(`  scripts/${gate} is already hollowed, so this tree is not the shipped one`);
  }
  console.error('  restore it first: a measurement of a mutated tree is a measurement of nothing');
  process.exit(1);
}

acquireLock(subjects.length);

/**
 * Put the tree back on the way out, for the deaths that arrive as a signal.
 *
 * `JOURNAL`'s header records this being tried and abandoned, and the reason it gives
 * is exact: during a `spawnSync` the event loop is blocked, so a handler cannot run
 * until the child it is waiting for has exited, and the kill that leaked a file
 * arrived precisely there. That is a fact about **blocking**, not about signals --
 * the nested run is awaited now, so the loop is free and this can do what the journal
 * can only do on the next run.
 *
 * It is not a replacement for the journal. SIGKILL cannot be handled by any process,
 * and a handler is not run for a crash. So there are three mechanisms and each covers
 * what the others cannot: this one for a signal, the journal for a kill, and
 * `HOLLOW_LINE`'s precondition so that a survivor of either is harmless.
 */
function interrupted(signal) {
  const mine = journalRead().find((entry) => entry.pid === process.pid);
  const group = inFlight?.group ?? mine?.suite ?? null;
  if (group !== null) stopSuite(group, (line) => console.error(line));

  if (mine !== undefined) {
    writeFileSync(mine.path, mine.original);
    journalWrite(journalRead().filter((entry) => entry.gate !== mine.gate));
  }
  console.error(
    `verify-gates-are-testable: FAILED -- interrupted by ${signal}; ` +
      (mine === undefined ? 'nothing had been written' : `${mine.gate} was put back`),
  );
  releaseLock();
  process.exit(1);
}

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => interrupted(signal));
}

for (const gate of subjects) {
  const path = resolve(ROOT, 'scripts', gate);
  const original = readFileSync(path, 'utf8');
  const files = referencingTests(gate);

  if (files.length === 0) {
    console.log(`NO-TEST     ${gate.padEnd(44)} no test file names it`);
    unvisited.push(gate);
    continue;
  }

  const candidate = hollowed(original);
  if (!parses(candidate)) {
    // Not written at all: a mutation that does not parse would fail the suite for
    // a reason unrelated to the gate, and a failing suite is what this script
    // reads as proof. Reported as its own state rather than credited.
    console.log(`UNPARSABLE  ${gate.padEnd(43)} the hollowed source is not valid JavaScript`);
    unparsable.push(gate);
    continue;
  }

  let outcome;
  // The record goes down **before** the mutation, so a kill at any point after this
  // leaves a repair. `pid` is what the next run uses to tell this run's death from
  // its life; `suite` is filled in the moment the nested run starts -- it cannot be
  // known earlier, and the window between the two is the one thing here that is not
  // covered. See `JOURNAL` and `inFlight`.
  journalWrite([...journalRead(), { path, original, gate, pid: process.pid, suite: null }]);
  try {
    writeFileSync(path, candidate);
    outcome = await runTests(files);
  } finally {
    writeFileSync(path, original);
    journalWrite(journalRead().filter((entry) => entry.gate !== gate));
  }
  const back = readFileSync(path, 'utf8');
  if (back !== original) {
    console.error(`verify-gates-are-testable: FAILED -- could not restore ${gate}`);
    process.exit(1);
  }
  restored.push(gate);

  if (outcome.verdict === 'CAUGHT') {
    console.log(`CAUGHT      ${gate.padEnd(44)} ${String(outcome.failures.length).padStart(2)} test(s) red`);
  } else if (outcome.verdict === 'SURVIVED') {
    console.log(`SURVIVED    ${gate.padEnd(44)} emptied, and nothing failed across ${files.length} file(s)`);
    survived.push(gate);
  } else {
    console.log(`UNATTRIBUTED ${gate.padEnd(43)} exited ${outcome.status} and named no failing test`);
    unattributed.push(gate);
  }
}

console.log('');
console.log(
  `gates: ${subjects.length}  caught: ${subjects.length - survived.length - unvisited.length - unattributed.length - unparsable.length}  `
  + `survived: ${survived.length}  no-test: ${unvisited.length}  `
  + `unattributed: ${unattributed.length}  unparsable: ${unparsable.length}`,
);
console.log(`restored byte-for-byte: ${restored.length} of ${subjects.length - unvisited.length - unparsable.length}`);

const failed = survived.length + unvisited.length + unattributed.length + unparsable.length;
if (failed > 0) {
  console.error('');
  console.error('verify-gates-are-testable: FAILED');
  for (const gate of survived) console.error(`  ${gate} can be emptied with no test noticing`);
  for (const gate of unvisited) console.error(`  ${gate} is named by no test at all`);
  for (const gate of unattributed) {
    console.error(`  ${gate} failed without naming a failing test, which cannot be credited to the gate`);
  }
  for (const gate of unparsable) {
    console.error(`  ${gate} could not be hollowed into valid JavaScript, so it was not measured at all`);
  }
  // Released before the verdict, so the exclusion covers the measurement and not
  // the reporting: a second run started while this one prints its summary would
  // otherwise be refused by a run that has already finished measuring.
  releaseLock();
  process.exit(1);
}
releaseLock();
console.log(`verify-gates-are-testable: OK (${subjects.length} gate(s), each caught by at least one test)`);
