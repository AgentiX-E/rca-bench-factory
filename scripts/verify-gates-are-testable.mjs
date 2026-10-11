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
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const TESTS = resolve(ROOT, 'packages', 'core', 'test');

/** Every gate in the tree, read from the directory rather than from a list. */
function gates() {
  return readdirSync(resolve(ROOT, 'scripts'))
    .filter((name) => name.startsWith('check-') && name.endsWith('.mjs'))
    .sort();
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
  return [...lines.slice(0, at), 'process.exit(0);', ...lines.slice(at)].join('\n');
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

function runTests(files) {
  const result = spawnSync(
    'npx',
    ['vitest', 'run', '--root', 'packages/core', ...files],
    { cwd: ROOT, encoding: 'utf8', timeout: 900_000 },
  );
  return classify(files, result);
}

const subjects = gates();
if (subjects.length === 0) {
  console.error('verify-gates-are-testable: FAILED');
  console.error('  no `check-*.mjs` gate was found, so this run would pass while measuring nothing.');
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
 * tree. The first repair was a SIGINT/SIGTERM/SIGHUP handler, and it does not work
 * for the case that was actually observed. During `spawnSync` the event loop is
 * blocked, so a handler registered with `process.on` cannot run until the child
 * exits -- and the kill that caused the leak arrived exactly there. A SIGKILL
 * cannot be handled by any process at all.
 *
 * So the restore is not attempted at kill time. The bytes are written to a journal
 * **before** the mutation, and the next run repairs from it before doing anything
 * else. That covers every way a run can end: an exception, a signal, a blocked
 * event loop, or SIGKILL, all of which leave the same journal and the same repair.
 * The file lives in `node_modules/.cache`, which exists after any install and is
 * never committed, so the journal itself cannot become a stray tracked file.
 */
const JOURNAL = resolve(ROOT, 'node_modules', '.cache', 'verify-gates-are-testable.json');

function remember(entry) {
  mkdirSync(dirname(JOURNAL), { recursive: true });
  writeFileSync(JOURNAL, JSON.stringify(entry));
}

function forget() {
  rmSync(JOURNAL, { force: true });
}

/**
 * Undo a mutation an earlier run did not get to undo, before anything is measured.
 *
 * Reported rather than repaired in silence: a run that had to do this has lost the
 * previous run's output, and the reader needs to know that the gate they are about
 * to see measured is the shipped one.
 */
function repairFromJournal() {
  if (!existsSync(JOURNAL)) return;
  let entry;
  try {
    entry = JSON.parse(readFileSync(JOURNAL, 'utf8'));
  } catch {
    // A journal that cannot be read is not a reason to skip the sweep; it is a
    // reason to say so and continue, because leaving a gate hollowed is worse.
    console.error('verify-gates-are-testable: the journal is unreadable; check scripts/ by hand');
    rmSync(JOURNAL, { force: true });
    return;
  }
  writeFileSync(entry.path, entry.original);
  const back = readFileSync(entry.path, 'utf8');
  rmSync(JOURNAL, { force: true });
  console.error(
    back === entry.original
      ? `verify-gates-are-testable: repaired ${entry.gate}, left hollowed by a run that was killed`
      : `verify-gates-are-testable: FAILED -- could not repair ${entry.gate} from the journal`,
  );
  if (back !== entry.original) process.exit(1);
}

repairFromJournal();

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
  remember({ path, original, gate });
  try {
    writeFileSync(path, candidate);
    outcome = runTests(files);
  } finally {
    writeFileSync(path, original);
    forget();
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
  process.exit(1);
}
console.log(`verify-gates-are-testable: OK (${subjects.length} gate(s), each caught by at least one test)`);
