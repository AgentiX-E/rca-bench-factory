#!/usr/bin/env node
/**
 * The mutation batteries' journal, for the batteries written in JavaScript.
 *
 * ## Why this exists
 *
 * `_witnesses.py` records every file a battery may mutate before the first
 * mutation, so a run that is killed leaves a record the next run can repair
 * from. Three batteries are written in JavaScript -- `inject-stability.mjs`,
 * `inject-component-rule.mjs` and `inject-m1-ceiling-tests.mjs` -- and until
 * this module existed they had no such record. A kill during one of them left a
 * mutation with nothing to repair from, and pass 55 recorded that gap as a
 * sentence in `docs/progress.md` rather than as a failing test, because the
 * census that looks for the guard could not see the files either.
 *
 * ## One format, two writers
 *
 * The record is the same JSON `_witnesses.py` writes, in the same directory,
 * with the same name, so either side repairs what the other left. That is not
 * tidiness: the thirteen batteries run in one CI job, the killing is arbitrary,
 * and a journal only one implementation can read is a journal that repairs half
 * the crashes. `battery-journal-node.test.ts` drives both directions -- a Node
 * journal repaired by Python, a Python journal repaired by Node -- rather than
 * asserting that two implementations happen to agree.
 *
 * ## The two exits
 *
 * - **Killed**, by SIGKILL, SIGTERM, SIGINT or a closed laptop: nothing runs,
 *   the journal stays, and the next battery repairs the tree before it measures
 *   anything.
 * - **Finished**: the journal is dropped and **nothing is repaired**. Repairing
 *   on the way out would make every battery's own restore check pass no matter
 *   what it did, which is the vacuity `_witnesses.guard` records at length. A
 *   battery that leaves a file mutated says so through its own assertion and a
 *   nonzero exit; the journal is not a second opinion about that.
 *
 * ## Why there is no signal handler, measured
 *
 * Python restores on Ctrl-C without being asked, because its default SIGINT
 * raises `KeyboardInterrupt` inside the interpreter. Node's default handlers
 * simply end the process, so the equivalent has to be written. The first version
 * of this module wrote one, and then measured it:
 *
 *     process.on('SIGTERM', restore); execFileSync('sleep', ['5']);
 *     ---------------- SIGTERM sent here ----------------
 *     stderr: (nothing)          exit=0          handler never ran
 *
 * A Node signal callback is dispatched from the event loop, and a battery's
 * mutation window is spent **inside `execFileSync` waiting for the suite** --
 * the loop is blocked, so the callback is not deferred, it does not arrive at
 * all. The window in which such a handler would run is the window between
 * injections, which is the window that needs it least.
 *
 * That is worse than no handler. A module that restores on SIGTERM *between*
 * injections invites the reader to conclude the tree is safe on SIGTERM, when
 * the interval that matters -- the sixty seconds a suite takes -- is untouched.
 * So the guarantee is stated where it can be kept: the record on disk, and the
 * next run. `battery-journal-node.test.ts` asserts it by killing a blocked child
 * and requiring the next run to repair what it left.
 *
 * ## Why the record carries the script's own name
 *
 * A pid is not an identity: it is reused, and `_witnesses.py` learned that one
 * identifier down from finding 174's process groups. Python could get away with
 * asking "does this command line mention `injection`", because every Python
 * battery lives in that directory. `scripts/inject-stability.mjs` does not, so
 * the same heuristic would report a *live* JavaScript battery as a dead holder
 * and repair the tree out from under it -- the one thing the guard exists to
 * prevent. The record therefore carries the name of the script that wrote it,
 * and liveness is "the process's command line names that script". Readers that
 * predate the field fall back to the heuristic, so an older record still reads
 * rather than becoming a file somebody has to delete by hand.
 *
 * ## What this module does not do
 *
 * It does not mutate anything, run a suite, or know which files a battery uses.
 * The roots it records are the whole of the source the batteries touch -- a
 * hand-written subject list that forgets one file is the defect this closes, so
 * the record is deliberately larger than any battery needs. Measured at **272
 * files / 4.35 MB / 34 ms for the whole entry and exit** (capture, hash, a 5.8 MB
 * JSON write, and a second pass over the tree at the end to report what differs),
 * against batteries that spend 3 to 60 seconds running suites.
 */

import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import { basename, dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');

/**
 * Where the journals live.
 *
 * Overridable so a test can drive the mechanism against its own directory: a
 * test that writes into the real cache leaves residue that the next case -- or
 * the next real battery -- reads as a crash it has to repair. That happened on
 * the first run of `battery-journal.test.ts`, which is why the variable exists.
 */
export const CACHE = resolve(
  process.env.RCA_BENCH_BATTERY_CACHE ?? resolve(REPO, 'node_modules', '.cache'),
);

export const JOURNAL_PREFIX = 'battery-journal-';

/**
 * The schema this writer emits. Readers do not branch on it.
 *
 * The version is bumped because the format gained a field a reader has to know
 * about -- the writer's own script name -- and the reader tolerates its absence
 * instead of refusing the record. Refusing would turn an old journal into a file
 * a person has to delete by hand, which is the failure mode this mechanism
 * exists to remove.
 */
export const JOURNAL_SCHEMA = 'rca-bench-battery-journal/2';

/** The subtrees a battery may mutate, recorded whole rather than by name. */
const GUARDED_ROOTS = [
  'scripts',
  'packages/core/src',
  'packages/core/test',
  'packages/cli/src',
  'packages/cli/test',
  'golden-master',
];

/** What counts as a file the tree mutates. */
const GUARDED_SUFFIXES = new Set(['.ts', '.mjs', '.js', '.json', '.md', '.sh']);

const SKIP_DIRS = new Set(['node_modules', 'dist', '__pycache__', '.git', 'coverage']);

function digest(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function message(text) {
  writeSync(2, `${text}\n`);
}

/**
 * Every file under `roots` worth recording, sorted so two runs agree.
 *
 * Dotfiles are skipped, and the reason is not cosmetic: a test that needs a
 * module beside its subject writes scratch with a dot in front of it
 * (`scripts/.probe-figures-harness-*.mjs`), it exists for the length of one
 * probe, and a record that included it would resurrect it during a kill-repair
 * and call its deletion a difference. `derive-gate-sites.mjs` learned this rule
 * first, and this is the same rule: scratch belongs to whoever wrote it.
 */
function guardedFiles(roots) {
  const out = [];
  const walk = (path) => {
    if (statSync(path).isFile()) {
      out.push(path);
      return;
    }
    for (const name of readdirSync(path).sort()) {
      if (SKIP_DIRS.has(name) || name.startsWith('.')) continue;
      const child = resolve(path, name);
      if (statSync(child).isDirectory()) {
        walk(child);
        continue;
      }
      if (GUARDED_SUFFIXES.has(name.slice(name.lastIndexOf('.')))) out.push(child);
    }
  };
  for (const root of roots) {
    const path = resolve(root);
    if (existsSync(path)) walk(path);
  }
  return out.sort();
}

/** The name of the script that is running, or `null` when there is no file. */
function scriptName() {
  const invoked = process.argv[1];
  if (invoked === undefined || invoked.startsWith('-')) return null;
  return basename(invoked);
}

/**
 * Whether `pid` is still the run that wrote a record naming `script`.
 *
 * A recycled number must not block the tree forever, and a live stranger must
 * not be mistaken for a run in progress. When `/proc` is unavailable the
 * question cannot be asked, so a live pid is taken at its word rather than
 * repaired out from under: leaving a record alone costs a retry, and repairing
 * under a live run corrupts a file it is measuring.
 *
 * Exported for `scripts/staged-mutation.mjs`, which asks the same question about
 * a journal at the commit boundary and must not answer it a second way. The
 * answer changes what the refusal *says* rather than what it decides -- "a run is
 * measuring this tree now" and "a run died holding it" are different sentences,
 * and the repair for the first is to wait.
 */
export function isHolder(pid, script) {
  try {
    process.kill(pid, 0);
  } catch (error) {
    if (error.code === 'ESRCH') return false;
  }
  let cmdline;
  try {
    cmdline = readFileSync(`/proc/${String(pid)}/cmdline`, 'utf8');
  } catch {
    return true;
  }
  if (typeof script === 'string' && script.length > 0) return cmdline.includes(script);
  // A record written before the field existed. This is the heuristic the Python
  // reader used at that time, kept only so such a record still reads.
  return cmdline.includes('injection');
}

/**
 * Put back every recorded file that differs, verifying each write against the record.
 *
 * The verification is the point. Finding 173's `repairFromJournal` compared a
 * file against the bytes it had just written, which is true by construction; a
 * repair that reports success without checking what landed is one more assertion
 * that cannot fail.
 */
function restore(record) {
  let done = 0;
  for (const entry of record.entries) {
    if (existsSync(entry.path) && digest(readFileSync(entry.path)) === entry.sha256) continue;
    const raw = Buffer.from(entry.bytes, 'base64');
    mkdirSync(dirname(entry.path), { recursive: true });
    writeFileSync(entry.path, raw);
    if (digest(readFileSync(entry.path)) !== entry.sha256) {
      throw new Error(`wrote ${entry.path} back and its digest still does not match the record`);
    }
    done += 1;
  }
  return done;
}

/**
 * Undo what runs that are gone left behind, and report whether the tree is free.
 *
 * Returns `true` when the caller may proceed. The refusal is reported rather
 * than thrown so that the caller can turn it into a process status: an uncaught
 * exception would print a stack trace where the reader needs one sentence.
 */
export function repairAbandoned() {
  mkdirSync(CACHE, { recursive: true });
  let free = true;
  const journals = readdirSync(CACHE)
    .filter((name) => name.startsWith(JOURNAL_PREFIX) && name.endsWith('.json'))
    .sort();
  for (const name of journals) {
    const journal = resolve(CACHE, name);
    let record;
    try {
      record = JSON.parse(readFileSync(journal, 'utf8'));
    } catch {
      message(`journal: ${name} is unreadable; remove it and check the tree by hand`);
      free = false;
      continue;
    }
    const pid = Number(record.pid ?? -1);
    if (isHolder(pid, record.script)) {
      message(
        `journal: pid ${String(pid)} is running ${String(record.label)} on this tree; ` +
          'two batteries cannot measure one working tree',
      );
      free = false;
      continue;
    }
    try {
      const restored = restore(record);
      unlinkSync(journal);
      message(
        `journal: repaired ${String(record.label)} (pid ${String(pid)} is gone), ` +
          `${String(restored)} file(s) put back`,
      );
    } catch (error) {
      message(`journal: ${String(error.message)}`);
      free = false;
    }
  }
  return free;
}

/**
 * How a recorded file differs from the record, or `null` when it does not.
 *
 * A file can be **gone** by the end of the run, and that is a difference rather
 * than an error: the record covers whole subtrees, and other tests write to them
 * while a battery runs. The two answers are kept apart because their repairs are
 * opposite -- "gone" is somebody else's scratch, "changed" is this battery's own
 * leftovers -- and a message that said only "differing" would leave the reader to
 * guess which. The Python half carries the same distinction, for the same reason
 * and after the same failure.
 */
function difference(entry) {
  if (!existsSync(entry.path)) return 'gone';
  return digest(readFileSync(entry.path)) === entry.sha256 ? null : 'changed';
}

/**
 * Run `body` with every file it could mutate recorded on disk.
 *
 * `body` must return the battery's process status, and that status is what this
 * returns, because every caller is `process.exit(withJournal(...))`. When the
 * journal cannot start -- a live holder, an unreadable record -- the body does
 * not run and the status is 1, which is the outcome the Python guard produces by
 * raising `SystemExit`.
 */
export function withJournal(label, body, options = {}) {
  if (!repairAbandoned()) return 1;

  const roots = options.roots ?? GUARDED_ROOTS.map((root) => resolve(REPO, root));
  const subjects = guardedFiles(roots);
  if (subjects.length === 0) {
    message(`journal: ${label} was given ${String(roots.length)} root(s) and found no guarded file`);
    return 1;
  }

  const record = {
    schema: JOURNAL_SCHEMA,
    pid: process.pid,
    label,
    script: scriptName(),
    startedAt: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
    entries: subjects.map((subject) => {
      const bytes = readFileSync(subject);
      return { path: subject, sha256: digest(bytes), bytes: bytes.toString('base64') };
    }),
  };
  const journal = resolve(CACHE, `${JOURNAL_PREFIX}${String(process.pid)}.json`);
  writeFileSync(journal, JSON.stringify(record));

  let settled = false;

  /** The way out that does not restore: report what still differs, drop the record. */
  const settle = () => {
    if (settled) return;
    settled = true;
    process.removeListener('exit', settle);
    const left = record.entries
      .map((entry) => [entry, difference(entry)])
      .filter((pair) => pair[1] !== null);
    try {
      unlinkSync(journal);
    } catch {
      // The exception path settled first and already removed it.
    }
    if (left.length > 0) {
      // The record is dropped **even here**, and the reason is measured: pass 55
      // edited `golden-master/doc-counts.json` while a battery was running, and
      // the next run's repair wrote the old bytes back over the edit. A record
      // taken at start cannot tell a battery's mutation from a person's edit.
      // Named, five of them, for the reason the Python half gives: "1 file(s)" is a
      // count, and a count cannot be looked at. The reason travels with the name
      // because the two repairs are opposite: a file that is **gone** was somebody
      // else's scratch, and a file that **changed** is this battery's own leftovers.
      const named = left
        .slice(0, 5)
        .map(([entry, why]) => `${relative(REPO, entry.path)} (${why})`)
        .join(', ');
      message(
        `journal: ${label} left ${String(left.length)} file(s) differing from its record ` +
          `(${named}${left.length > 5 ? ', ...' : ''}); its own restore check decides whether that is a failure`,
      );
    }
  };

  // `process.exit()` inside the body ends the process without running a
  // `finally`. The callback covers that. It is also what separates "the battery
  // chose to exit" from "the battery was killed": the latter runs nothing.
  process.on('exit', settle);

  try {
    return body();
  } catch (error) {
    if (!settled) {
      settled = true;
      let restored = 0;
      try {
        restored = restore(record);
      } finally {
        try {
          unlinkSync(journal);
        } catch {
          // Nothing left to remove.
        }
      }
      message(`journal: ${label} threw; ${String(restored)} file(s) restored from the journal`);
    }
    throw error;
  } finally {
    settle();
  }
}
