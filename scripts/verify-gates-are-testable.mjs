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
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
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
 * The gate with its verdict removed.
 *
 * Placed after the last top-level `import` so the module still parses, and before
 * anything else so nothing observable happens first. ESM hoists imports, so the
 * position is about readability rather than semantics.
 */
function hollowed(source) {
  const lines = source.split('\n');
  let last = 0;
  lines.forEach((line, i) => {
    if (/^import\b/.test(line)) last = i;
  });
  return [...lines.slice(0, last + 1), '', 'process.exit(0);', ...lines.slice(last + 1)].join('\n');
}

function runTests(files) {
  const result = spawnSync(
    'npx',
    ['vitest', 'run', '--root', 'packages/core', ...files],
    { cwd: ROOT, encoding: 'utf8', timeout: 900_000 },
  );
  const out = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  return out.split('\n').filter((line) => line.trim().startsWith('\u00d7'));
}

const subjects = gates();
if (subjects.length === 0) {
  console.error('verify-gates-are-testable: FAILED');
  console.error('  no `check-*.mjs` gate was found, so this run would pass while measuring nothing.');
  process.exit(1);
}

const survived = [];
const unvisited = [];
const restored = [];

for (const gate of subjects) {
  const path = resolve(ROOT, 'scripts', gate);
  const original = readFileSync(path, 'utf8');
  const files = referencingTests(gate);

  if (files.length === 0) {
    console.log(`NO-TEST     ${gate.padEnd(44)} no test file names it`);
    unvisited.push(gate);
    continue;
  }

  writeFileSync(path, hollowed(original));
  let failed = [];
  try {
    failed = runTests(files);
  } finally {
    writeFileSync(path, original);
  }
  const back = readFileSync(path, 'utf8');
  if (back !== original) {
    console.error(`verify-gates-are-testable: FAILED -- could not restore ${gate}`);
    process.exit(1);
  }
  restored.push(gate);

  if (failed.length > 0) {
    console.log(`CAUGHT      ${gate.padEnd(44)} ${String(failed.length).padStart(2)} test(s) red`);
  } else {
    console.log(`SURVIVED    ${gate.padEnd(44)} emptied, and nothing failed across ${files.length} file(s)`);
    survived.push(gate);
  }
}

console.log('');
console.log(`gates: ${subjects.length}  caught: ${subjects.length - survived.length - unvisited.length}  survived: ${survived.length}  no-test: ${unvisited.length}`);
console.log(`restored byte-for-byte: ${restored.length} of ${subjects.length - unvisited.length}`);

if (survived.length > 0 || unvisited.length > 0) {
  console.error('');
  console.error('verify-gates-are-testable: FAILED');
  for (const gate of survived) console.error(`  ${gate} can be emptied with no test noticing`);
  for (const gate of unvisited) console.error(`  ${gate} is named by no test at all`);
  process.exit(1);
}
console.log(`verify-gates-are-testable: OK (${subjects.length} gate(s), each caught by at least one test)`);
