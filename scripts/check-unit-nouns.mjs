#!/usr/bin/env node
/**
 * Hold the unit nouns the gates count in to an inventory, and print the coincidences.
 *
 * ## The defect this gate is the reader for
 *
 * `O-091` asked what population each unit noun covers and no reader answered. The measure
 * is in `scripts/unit-nouns.mjs`: nine nouns are printed by more than one gate, and the
 * count `8` is printed as `row(s)` by **two** of them for two unrelated tables --
 * `check-fault-cases`'s pre-injection window and `check-repository-table`'s `## Repository`
 * rows. Both lines are right. Read in a CI log four lines apart, they are indistinguishable
 * from one number printed twice.
 *
 * Finding 600 was this shape across two gates printing *different* numbers for one word, and
 * its repair was a third reader that derived one number from the other and asserted they
 * agreed. Here the two numbers agree and the populations do not, so the repair is not an
 * assertion but a **reading**: one line per unit noun holding every gate's numbers and the
 * sentence a person wrote about what the gates count.
 *
 * ## What the first version of this gate got wrong
 *
 * It printed the gates' names and never their numbers -- `volume(s) by 2`, where one gate
 * prints `14 volume(s)` and the other `18` (finding 609) -- so a reader of this gate alone
 * could not see that the two numbers differ, let alone whether the two fourteens are the same
 * volumes. And it could not have seen the other pair even with the numbers printed, because it
 * demanded a number immediately before the noun and both gates write `` 219 `vX.YY` round(s) ``:
 * the qualifier finding 600's repair inserted is a wall this reader could not see past, so
 * `round(s)` was listed as shared by two gates with no count under it at all (finding 610).
 * Three nouns whose number the reader could not read were dropped without a word, which made
 * the headline a count of what it happened to read (finding 611).
 *
 * ## What is refused
 *
 * The inventory in `golden-master/unit-nouns.json` is derived from the gates and committed,
 * the way `golden-master/gate-sites.json` is. A gate that starts printing a noun another gate
 * already prints -- or stops -- changes the inventory, and the change is a diff a reviewer
 * reads rather than a fact nobody wrote down. `--write` regenerates the vocabulary and leaves
 * every `relation` where a person put it; running the gate with no flag is what `docs:check`
 * does, and it refuses rather than writes.
 *
 * The counts are deliberately **not** in the inventory. They move every round, and an
 * inventory that went red for a reason its subject has nothing to do with is the crying-wolf
 * defect this campaign has recorded more than once. What is committed is the vocabulary, which
 * nouns more than one gate prints, and the judgement about each of those.
 *
 * ## Why the gates are spawned rather than imported
 *
 * Every gate in `scripts/check-*.mjs` is a program, not a module: it prints and exits, and
 * importing one would run it. That separation is deliberate (`scripts-are-classified.test.ts`
 * files these as `gate`), so the census reads them the only way a reader can -- as programs,
 * one process each -- and the data modules underneath (`unit-nouns.mjs`) stay pure.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { UNSTATED, censusOf, inventoryOf, keyOf, relationsOf, summaryOf } from './unit-nouns.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const SELF = 'check-unit-nouns';

/**
 * The inventory file, which a battery can point elsewhere.
 *
 * The failure this gate exists for is a *difference* between two documents, so proving it fails
 * means handing it a document that differs -- and the committed one has to stay the one the tree
 * agrees with. `--inventory` is that affordance, and it is the same shape `check-doc-counts` takes
 * as `--present` and `--measured`.
 */
function inventoryPath(argv) {
  const at = argv.indexOf('--inventory');
  if (at === -1) return resolve(ROOT, 'golden-master', 'unit-nouns.json');
  const next = argv[at + 1];
  if (next === undefined || next.startsWith('--')) {
    // One exit, not two: a gate whose refusals leave by different doors is a gate whose inventory
    // entry describes one of them (`gate-sites.json` fingerprints the message, and a second
    // `process.exit` in the same file is a second site to prove).
    fail('--inventory needs a path', 'the flag takes the file to hold this tree to; omit it for golden-master/unit-nouns.json');
  }
  return resolve(next);
}

const INVENTORY = inventoryPath(process.argv);

/**
 * The gates whose summaries are the census's subject, read from the step that runs them.
 *
 * `docs:check` is the list, so a gate added to the documentation gate is in the census the
 * moment it runs -- no second list to keep equal to the first. The three `derive ... --check`
 * steps are left out: they verify a writer's own artefact and print the writer's sentence,
 * and their subject is that artefact rather than a population of the corpus.
 */
function gatesOf() {
  const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'));
  const script = String(pkg.scripts?.['docs:check'] ?? '');
  // `[a-z0-9-]`, not `[a-z-]`: `check-l4-status` carries a digit, and the first version of
  // this pattern dropped it from the list while reporting a full census -- a reader whose
  // scope is narrower than its name, which is finding 595. The count below is what turned
  // that into an error instead of a quiet omission.
  const steps = [...script.matchAll(/node\s+scripts\/(check-[a-z0-9-]+)\.mjs/g)].map((one) => one[1]);
  const names = [...new Set(steps)].filter((name) => name !== SELF).sort();
  const expected = new Set(steps).size - (steps.includes(SELF) ? 1 : 0);
  if (names.length !== expected) {
    fail(
      `the step names ${String(expected)} gate(s) and this reader made ${String(names.length)} of them`,
      'the two are the same list; a reader that drops one is a census of less than it claims',
    );
  }
  return names;
}

function fail(message, hint) {
  console.error(`check-unit-nouns: FAILED — ${message}`);
  if (hint !== undefined) console.error(`  ${hint}`);
  process.exit(1);
}

const gates = gatesOf();
if (gates.length === 0) {
  fail(
    'no gate names a unit noun, because no gate was found to read',
    'docs:check is where the list comes from; an empty one means this gate measured nothing',
  );
}

/**
 * One line per gate, in the shape the census reads.
 *
 * `--readings <file>` hands the census a recording instead of running eighteen processes, so a
 * battery can drive a refusal without paying for the census it refuses. It is the same door
 * `check-doc-counts` takes as `--present` and `--measured`: the flag says the input is a fixture,
 * and the shipped tree is read the only way a reader can read it.
 */
function readingsOf(argv) {
  const at = argv.indexOf('--readings');
  if (at === -1) return null;
  const next = argv[at + 1];
  if (next === undefined || next.startsWith('--')) {
    fail('--readings needs a path', 'the flag takes a JSON array of {gate, text} objects');
  }
  return JSON.parse(readFileSync(resolve(next), 'utf8'));
}

const recorded = readingsOf(process.argv);
const readings = [];
if (recorded === null) {
  for (const gate of gates) {
    const run = spawnSync(process.execPath, [resolve(ROOT, 'scripts', `${gate}.mjs`)], {
      encoding: 'utf8',
      cwd: ROOT,
    });
    if (run.status !== 0) {
      fail(
        `${gate} exited ${String(run.status)}, so its summary is not the one this tree reports`,
        'the census reads the gates as they run; a red gate is repaired before it is counted',
      );
    }
    readings.push({ gate, text: `${run.stdout ?? ''}${run.stderr ?? ''}` });
  }
} else {
  // A `for` loop rather than `readings.push(...recorded)`: `spread-append-guard.test.ts` refuses a
  // spread whose length is a function of the input, and a fixture with ten thousand readings would
  // overflow the argument limit on the one path a battery is most likely to drive.
  for (const one of recorded) readings.push(one);
}

const census = censusOf(readings);
if (census.size === 0) {
  fail(
    'none of the gates printed a count under a unit noun',
    'a census of nothing is not a census: the reader and the summaries have stopped agreeing',
  );
}

const derived = inventoryOf(census);

/**
 * The judgement the inventory carries and no derivation can produce: what a shared noun means.
 *
 * It is keyed by the noun and its gates, so a sentence written for `volume(s)` in one round is
 * still the sentence the next round reads, and a gate entering or leaving the list is a diff
 * rather than a silent re-use of somebody else's answer.
 */
function relationsIn(document) {
  const out = new Map();
  for (const one of document?.shared ?? []) {
    if (typeof one.relation === 'string' && one.relation !== '') {
      out.set(keyOf(one), one.relation);
    }
  }
  return out;
}

/**
 * The committed inventory, or `null` when there is none.
 *
 * A file that exists and does not parse is not the same absence as a file that is not there, and
 * neither is a throw: Node's stack names this reader rather than the document it could not read, so
 * the refusal goes through `fail` like every other one in this file.
 */
function readInventory(path) {
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    fail(`${path} could not be read: ${error.message}`, 'the inventory is a file this reader opens; a permissions error is not an empty vocabulary');
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    fail(`${path} is not JSON: ${error.message}`, 'a file that does not parse records no vocabulary, and reading it as one would report every noun as new');
  }
}

const committed = readInventory(INVENTORY);

if (process.argv.includes('--write')) {
  // The relations are merged rather than regenerated: two gates printing one noun are either
  // counting one population twice or two populations under one word, and which it is cannot be
  // derived from the output. `--write` therefore refreshes the vocabulary and leaves every
  // existing judgement where a person put it, so regenerating the inventory cannot quietly
  // answer a question.
  const relations = relationsIn(committed);
  const merged = {
    ...derived,
    shared: derived.shared.map((one) => {
      const relation = relations.get(keyOf(one));
      return relation === undefined ? { ...one, relation: null } : { ...one, relation };
    }),
  };
  // The merge keeps the relation and drops every count: the inventory records which gates share a
  // noun and what a person decided that means, and the numbers themselves are printed every run.
  writeFileSync(INVENTORY, `${JSON.stringify(merged, null, 2)}\n`);
  const stated = relationsIn(merged);
  console.log(`check-unit-nouns: wrote ${relative(ROOT, INVENTORY)} — ${summaryOf(census, stated)}`);
  for (const line of relationsOf(census, stated)) console.log(`check-unit-nouns: ${line}`);
  process.exit(0);
}

if (committed === null) {
  fail(
    `${relative(ROOT, INVENTORY)} is missing, so the vocabulary has no record`,
    'run `node scripts/check-unit-nouns.mjs --write` and read the diff it produces',
  );
}

const relations = relationsIn(committed);

// A shared noun nobody has read is the state this gate exists to end: two gates printing one noun
// are either counting one population twice or two populations under one word, and the output
// cannot say which. So the inventory records a relation per shared noun, `--write` will not invent
// one, and a new one is a failure until a person writes it.
//
// The refusal names the numbers, so they are read from the census rather than from the inventory:
// the inventory deliberately holds none (they move every round), and a sentence assembled from it
// said `undefined addendum(s)` until this line was changed.
const suffix = ` — ${UNSTATED}`;
const unread = relationsOf(census, relations).filter((line) => line.endsWith(suffix));
if (unread.length > 0) {
  fail(
    `${String(unread.length)} noun(s) are printed by more than one gate and no record says whether that is one population or two: ` +
      unread.map((line) => line.slice(0, line.length - suffix.length)).join('; '),
    'add a `relation` to that entry of golden-master/unit-nouns.json: the sentence is the judgement, and no derivation can make it',
  );
}

const stored = JSON.stringify({ ...committed, shared: (committed.shared ?? []).map(({ relation, ...rest }) => rest) });
const fresh = JSON.stringify(derived);
if (stored !== fresh) {
  // Said as a difference rather than as a comparison of two documents: the author needs to
  // know which noun moved and in which direction, and `not equal` over two hundred lines of
  // JSON says neither.
  const was = new Map((committed.nouns ?? []).map((one) => [one.noun, one.gates.join(',')]));
  const now = new Map(derived.nouns.map((one) => [one.noun, one.gates.join(',')]));
  const moved = [];
  for (const [noun, gatesAt] of now) {
    if (!was.has(noun)) moved.push(`${noun} is new, printed by ${gatesAt}`);
    else if (was.get(noun) !== gatesAt) moved.push(`${noun}: ${was.get(noun)} -> ${gatesAt}`);
  }
  for (const noun of was.keys()) if (!now.has(noun)) moved.push(`${noun} is no longer printed`);
  const wasShared = new Set((committed.shared ?? []).map((one) => keyOf(one)));
  const nowShared = new Set(derived.shared.map((one) => keyOf(one)));
  for (const one of nowShared) if (!wasShared.has(one)) moved.push(`${one} is now shared across gates, and no relation is recorded for it`);
  for (const one of wasShared) if (!nowShared.has(one)) moved.push(`${one} is no longer shared`);
  fail(
    `the unit-noun inventory disagrees with the gates: ${moved.length === 0 ? 'the documents differ where no noun did, so the shape changed' : moved.join('; ')}`,
    'run `node scripts/check-unit-nouns.mjs --write` and read the diff: a new shared noun is a population nobody has asked about yet',
  );
}

console.log(`check-unit-nouns: OK — ${summaryOf(census, relations)}`);
// One line per shared noun, because the sentence that had to be added is a sentence about a pair
// of numbers and nine of those inside one line is not a summary. This is finding 609's repair:
// the gate printed the gates' names and never what they counted.
for (const line of relationsOf(census, relations)) console.log(`check-unit-nouns: ${line}`);
