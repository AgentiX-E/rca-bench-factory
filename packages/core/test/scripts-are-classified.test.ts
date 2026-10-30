import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Every script in `scripts/` is classified, and the classification is checked.
 *
 * ## The gap this closes
 *
 * `gates-are-testable.test.ts` proves that four specific gates can fail. It does
 * so with four hand-written `describe` blocks, and that is the whole of its
 * enumeration: nothing asks whether the list is complete. Adding a new gate to
 * `scripts/` therefore adds an unproved gate, and no test notices -- which is
 * exactly the shape `docs/progress.md` names when it says a gate with no test is
 * neither a threshold nor an enumeration.
 *
 * `golden-master/gate-sites.json` closes half of it: every `process.exit(1)` in
 * the tree is enumerated and, by `gate-sites-are-proven.test.ts`, must name the
 * test that proves it. What that leaves open is the *other* half -- a script
 * with no failure exit at all is absent from the inventory, and absence is
 * reported as nothing. `serve-site.mjs` and `probe-category-inference.mjs` are
 * in the tree right now with no test naming either, and until this file existed
 * their status was indistinguishable from a gate someone forgot to write down.
 *
 * ## The register
 *
 * Every `scripts/*.mjs` falls into one of four classes, and the class is stated
 * here rather than inferred:
 *
 *   - **gate** -- exits non-zero on a defect. Named by `gate-sites.json`, and
 *     each of its sites must be proved there. The two lists must agree.
 *   - **probe** -- reports a reading and exits non-zero when it cannot take one.
 *     Listed in the inventory like a gate when it has a failure exit.
 *   - **tool** -- runs forever or produces an artefact; no verdict to assert.
 *   - **harness** -- exists only to be driven by a battery.
 *   - **data** -- a module under `scripts/` that exports a table and has no
 *     `main`. It is imported rather than run, so it has no exit and no verdict.
 *   - ~~**computed-probe** -- a probe whose exit is computed rather than literal,
 *     so the inventory cannot fingerprint it.~~ **Removed**: the class existed
 *     because the deriver read `process.exit(1)` and dropped everything else into
 *     `excluded.computed`, and its members were listed here as "a recorded
 *     decision rather than an omission". The deriver now treats **any** statement
 *     position exit whose argument is not the literal `0` as a failure site, so
 *     every member of this class is in the inventory and none of them is an
 *     exclusion. A class whose reason has gone is a class that has to go with it,
 *     and nothing but a reading of that reason would have removed it.
 *
 * The check is an equality, not a subset: a script that appears in `scripts/`
 * without an entry here fails this test, and an entry here naming a script that
 * no longer exists fails it too. That is what makes the register a gate rather
 * than a comment.
 *
 * ## Why the register is written down instead of derived
 *
 * A derived classification would be `has a process.exit(1)` -- and that is
 * precisely the predicate that cannot tell a missing test from a script with
 * nothing to test. The value of writing it down is that a human has to say which
 * it is, and a reviewer sees the claim. Every class beyond `gate` is a claim
 * this file can only check for *consistency* with the inventory, and the
 * consistency check is what stops the register from drifting into decoration.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SCRIPTS = resolve(ROOT, 'scripts');

/**
 * What each script is, and why.
 *
 * The `why` clause is required for the two classes that have no failure exit,
 * because those are the ones a reader cannot verify by looking at the inventory.
 * For a `gate` or `probe` the inventory already proves the claim, so the reason
 * is optional there and present only where it adds something the inventory does
 * not carry.
 */
type Klass = 'gate' | 'probe' | 'tool' | 'harness' | 'data';

interface Entry {
  class: Klass;
  why?: string;
}

const REGISTER: Record<string, Entry> = {
  // --- Data: imported by other scripts, never run directly ---
  'format-spec.mjs': {
    class: 'data',
    why:
      'The field-contract table shared by gen-examples.mjs and the docs generator. It exports a constant ' +
      'and has no main, so there is no exit to enumerate and no reading to assert; the scripts that ' +
      'consume it are what carry the verdicts.',
  },

  'reconcile-readings.mjs': {
    class: 'gate',
    why:
      'It exits 3 when a successful accuracy run is absent from the record and 2 when the run list or ' +
      'the record cannot be read, so it is a gate by the inventory rule. Both sites are proved by ' +
      '`readings-reconcile.test.ts`, which drives it over a saved API payload -- the only test in the ' +
      'tree that spawns it, because the live form needs a token and a network.',
  },

  'check-fault-cases.mjs': {
    class: 'gate',
    why:
      'It exits 2 when a four-layer case is incomplete, unindexed or below the floor, and 1 when ' +
      'the index or a case cannot be read, so it is a gate by the inventory rule. ' +
      '`check-fault-cases.test.ts` spawns it for every exit it owns. The floor it reports is the ' +
      'only number in this repository that moves as annotation proceeds, which is why it is ' +
      'printed on every run rather than being a threshold nobody reads.',
  },

  'record-reading.mjs': {
    class: 'gate',
    why:
      'It exits 3 when a run cannot be recorded as it stands, 2 when a recorded reading disagrees with ' +
      'the artefact it names, and 1 when it cannot read its inputs, so it is a gate by the inventory ' +
      'rule. `record-reading.test.ts` spawns it for every exit it owns. It is also the only script that ' +
      'writes `readings.json`, which is why its refusals matter more than its successes: a second entry ' +
      'for one run, or an entry for a run the file calls unreadable, would leave the evidence the M1 ' +
      'milestone rests on disagreeing with itself.',
  },

  // --- Gates: each has failure exits, all enumerated in gate-sites.json ---
  'apply-pins.mjs': { class: 'gate' },
  'build-example-bundle.mjs': { class: 'gate' },
  'check-backend-support.mjs': { class: 'gate' },
  'check-cli-reference.mjs': { class: 'gate' },
  'check-data-model-vocabularies.mjs': { class: 'gate' },
  'check-doc-counts.mjs': { class: 'gate' },
  'check-l4-status.mjs': { class: 'gate' },
  'check-no-absolute-paths.mjs': { class: 'gate' },
  'check-no-mock.mjs': { class: 'gate' },
  'check-no-secrets.mjs': { class: 'gate' },
  'check-no-unsafe-shell.mjs': { class: 'gate' },
  'check-no-vendored-data.mjs': { class: 'gate' },
  'check-audit-volumes.mjs': {
    class: 'gate',
    why:
      'The audit log is one index and four volumes, and this is what holds the split: one heading form, ' +
      'one numbering, one size budget per volume, and an index that names every volume. It is also the ' +
      'reason the log cannot drift back into four heading forms, which is how a census of it came to ' +
      'report 127 entries where there were 191.',
  },
  'audit-volumes.mjs': {
    class: 'data',
    why:
      'What the audit log split means, as functions: contiguous volume numbering, a byte budget per ' +
      'volume, one heading form, and an index row per volume whose range and count are read from the ' +
      'file. It has no main and no exit because the verdict is check-audit-volumes.mjs -- and the ' +
      'reading had to leave that gate, because verify-gates-are-testable.mjs proves a gate by emptying ' +
      'it, and a test that imports the emptied file dies at its first statement: the meta-gate reported ' +
      'exactly that ("exited 1 and named no failing test") until the two halves were separated.',
  },
  'progress-volumes.mjs': {
    class: 'data',
    why:
      'What the progress log split means: contiguous volume numbering, a byte budget, a volume that ' +
      'begins at a round, one order across two naming eras, and an index row whose count and labels are ' +
      'the file\'s. No main and no exit -- check-progress-volumes.mjs holds the verdict and is spawned, ' +
      'because a gate that a test imports cannot be proved by emptying it.',
  },
  'gate-proofs.mjs': {
    class: 'data',
    why:
      'Reading a hollowed run: which test files went red, and what the inventory claims about them. ' +
      'It is here because the meta-gate is a gate, so a test may not import it -- and the parsing is ' +
      'the part that was wrong once in the safe direction ("0 of 4 naming file(s)" for all 42 gates), ' +
      'which is a thing only a canned transcript can catch.',
  },
  'doc-counts-rows.mjs': {
    class: 'data',
    why:
      'What a published count row is and how it is rewritten, plus how a red run is reported. It ' +
      'lives outside measure-doc-counts.mjs because two tests import it and that file is a gate -- ' +
      'a gate a test imports cannot be proved by emptying it (finding 196), and this is the second ' +
      'time the rule was learned by running the meta-gate instead of by reading a check.',
  },
  'docs-corpus.mjs': {
    class: 'data',
    why:
      'The progress log as a corpus -- the index and every volume in reading order -- for the three ' +
      'guards that read published counts and open lists out of it. It exists because the split silently ' +
      'shrank their scope to 69 KB of 521 KB; a reader that names one path cannot see a document that ' +
      'became four files.',
  },
  'check-progress-volumes.mjs': {
    class: 'gate',
    why:
      'The verdict for the progress log\'s split: volume numbering, byte budget, a boundary between two ' +
      'rounds rather than inside one, the order across the Pass and v2 eras, the index row, and no round ' +
      'left behind in the index.',
  },
  'audit-citations.mjs': {
    class: 'data',
    why:
      'Reading citations of findings out of the documentation: which numbers have a heading, which ' +
      'sentences cite them, and which citations resolve to nothing. It holds no verdict, because the ' +
      'gate that does is hollowed by the meta-gate and a test may not import it (finding 196).',
  },
  'check-citations.mjs': {
    class: 'gate',
    why:
      'The verdict for the audit log\'s own cross-references: every `finding N` the documentation writes ' +
      'must name a heading that exists. Measured on the first run: 977 citations of 201 numbers, two of ' +
      'them naming nothing.',
  },
  'check-open-list.mjs': { class: 'gate' },
  'check-official-registry.mjs': { class: 'gate' },
  'check-official.mjs': { class: 'gate' },
  'check-readme-sample.mjs': { class: 'gate' },
  'check-roundtrip-record.mjs': { class: 'gate' },
  'check-user-guide.mjs': { class: 'gate' },
  'derive-backend-support.mjs': { class: 'gate' },
  'derive-fault-golden.mjs': { class: 'gate' },
  'derive-gate-sites.mjs': { class: 'gate' },
  'tree-repair.mjs': {
    class: 'data',
    why:
      'The gate session\'s preflight: run the injection batteries\' repair before the first step reads ' +
      'anything, so a tree a killed battery was holding is put back rather than measured. No main and ' +
      'no exit -- verify-local.mjs decides what to do with the three states, and it is a gate, so the ' +
      'decision lives here where tree-repair.test.ts can drive it against a fixture cache.',
  },
  'gate-receipt.mjs': {
    class: 'data',
    why:
      'What a green gate run leaves behind: a file under .git/rca-bench-verified keyed on the tree SHA-1 ' +
      'it verified, so a push can ask whether this content passed the gate instead of assuming it did. ' +
      'No main and no exit -- verify-local.mjs prints the decision and writes the file, and the decision ' +
      'is a pure function here because that file is a gate and no test may import it. Measured on the ' +
      'round that wrote it: the first of three pushed revisions was red on three of six jobs, over a ' +
      'tree the local gate rejects in under a minute, because the push speaks the Git Data API and a ' +
      'hook is a property of a command this repository does not use to publish.',
  },
  'gate-steps.mjs': {
    class: 'data',
    why:
      'A reader for .github/workflows/ci.yml plus the one table that cannot be derived from it: ' +
      'which of its steps need a runner. No main, no exit code, no verdict of its own -- ' +
      'verify-local.mjs runs the result and gate-steps.test.ts holds the table against the workflow. ' +
      'The alternative was a second list of commands, and a copy of the workflow keeps saying green ' +
      'on the day a gate is added to it.',
  },
  'step-process.mjs': {
    class: 'data',
    why:
      'The runner: spawn one step under its own shell, directory, environment and budget, and kill ' +
      'the group it started when the budget is spent. Imported by verify-local.mjs and by the suite, ' +
      'never run directly, so there is no exit of its own to enumerate. It lives here rather than ' +
      'inside verify-local.mjs because that file is a gate -- hollowed out by ' +
      'verify-gates-are-testable.mjs, so no test may import it -- and the one piece of logic worth ' +
      'testing was inside it. step-process.test.ts drives this module against real processes: a ' +
      'step that hangs, a step that backgrounds a grandchild, and a step that exits non-zero.',
  },
  'doc-count-additivity.mjs': {
    class: 'data',
    why:
      'The one relation between the three published suite counts: core and cli are parts of repo, ' +
      'and nothing computed it. check-doc-counts.mjs holds documents to the declaration and never ' +
      'held the declaration to arithmetic, so a part typed rather than measured survived every ' +
      'guard that reads those numbers -- the committed file said 199 + 4 = 202 through a whole ' +
      'green docs:check. No main and no exit: the rule is a pure function so a test can hand it ' +
      'three numbers, and the guard only adds its problems to its own list. Plain JavaScript ' +
      'because the guard runs in the cold-tree job, which has no build.',
  },
  'doc-counts-vocabulary.mjs': {
    class: 'data',
    why:
      'One exported array, read by two scripts that face the same predicate from opposite sides: ' +
      'check-doc-counts.mjs refuses a row that claims to describe this commit, and ' +
      'measure-doc-counts.mjs rewrites exactly those rows. A writer and a checker that disagree ' +
      'about which rows are current are wrong in opposite, silent directions -- one edits a dated ' +
      'record, the other reports success over a stale number. There is no main and no exit.',
  },
  // A gate that cannot run in CI, like `fetch-official.mjs`: its input is the
  // four CSVs upstream publishes under `rca/archive/`, which this repository
  // refuses to vendor. `--check` compares the committed corpus against a fresh
  // derivation and exits non-zero when they differ, so the verdict exists and is
  // enumerable; what does not exist is a CI job that could supply the bytes.
  'derive-openrca-archive.mjs': { class: 'gate' },
  'fetch-official.mjs': { class: 'gate' },
  'gen-examples.mjs': { class: 'gate' },
  'gen-rcaeval-cases.mjs': { class: 'gate' },
  'measure-doc-counts.mjs': { class: 'gate' },
  'score-fault-extraction.mjs': { class: 'gate' },
  'verify-example-pack.mjs': { class: 'gate' },
  'verify-scorer-stability.mjs': { class: 'gate' },
  'verify-reader-against-backend.mjs': { class: 'gate' },
  // A gate whose subject is other gates: it empties each `check-*.mjs` and fails
  // if any of them can be emptied with no test noticing. Found by measurement
  // rather than by reading, and recorded because the tracking row for it said
  // "3 of 8 gates" while all thirteen were already caught -- the row was counting
  // the mechanism rather than the property.
  'verify-gates-are-testable.mjs': { class: 'gate' },

  // --- Probes: a literal failure exit, enumerated in gate-sites.json ---
  'probe-agreement-baseline.mjs': { class: 'probe' },
  'probe-category-derivation.mjs': { class: 'probe' },
  'probe-denial-inventory.mjs': { class: 'probe' },

  // --- Probes whose verdict is computed rather than literal ---
  //
  // These were `computed-probe`, a class that existed so that "the deriver cannot
  // fingerprint this" was a recorded decision. The deriver can fingerprint them
  // now, so they are ordinary probes with ordinary sites -- and the fact that this
  // move had to be made by hand is the point: nothing in the tree tied the class's
  // *existence* to the reason it was created.
  'probe-m1-ceiling.mjs': { class: 'probe' },
  'probe-type-misses.mjs': { class: 'probe' },
  'probe-z-floor.mjs': {
    class: 'probe',
    why:
      'It ranks the corpus twice -- under the shipped z-score floor and under a relative one -- and ' +
      'exits 1 when it cannot read a case, which is the one thing it refuses rather than reports. The ' +
      'reading it prints is a *number of cases whose order depends on the floor*, and that number must ' +
      'not be a failure: both floors answer different questions, so a case that ranks differently ' +
      'between them is a fact about the case rather than a defect in the corpus.',
  },
  'probe-category-inference.mjs': {
    class: 'tool',
    why:
      'A probe in name only, and the register says so: it prints the category each sample infers and exits ' +
      'with no explicit status, so there is nothing for the inventory to list and no verdict to prove. ' +
      'Filed as `tool` rather than `probe` because this file checks that the two classes with a failure ' +
      'exit -- gate and probe -- are exactly the scripts the inventory names, and a probe with no exit ' +
      'would break that correspondence rather than describe a gap in it.',
  },

  // --- Gates that used to be filed as harnesses ---
  //
  // Each of these was `harness` on the stated ground that it "has no verdict of
  // its own". Measured, each ends in `process.exit(main())` and `main()` returns
  // non-zero when its own checks fail -- a survivor, an inert anchor, a failed
  // restore. The harness framing was a consequence of the deriver not reading a
  // computed exit: with no site to point at, "no verdict" and "no enumerable
  // verdict" were indistinguishable, and the register recorded the second as the
  // first.
  'inject-stability.mjs': { class: 'gate' },
  'inject-component-rule.mjs': { class: 'gate' },
  'inject-m1-ceiling-tests.mjs': { class: 'gate' },

  // --- Tools: produce an artefact or serve one, with no verdict ---
  // The aggregate gate: it decides nothing about the tree, and it fails when a
  // gate the workflow runs fails. It is filed as a gate rather than a tool
  // because that is what its three exits are -- and because a script with
  // `process.exit(1)` may not be filed as a tool, which is the rule that keeps
  // the register from being a place to hide a gate.
  'verify-local.mjs': { class: 'gate' },
  'serve-site.mjs': {
    class: 'tool',
    why:
      'An HTTP server for `site/`, run by hand and by `pnpm site:serve`. It has no exit path other than ' +
      'the signal that stops it, so there is no failure to enumerate and no reading to assert.',
  },
};

function scriptNames(): string[] {
  // Dotfiles are not scripts.
  //
  // `derive-gate-sites.mjs` learned this first, for the same reason: a test writes
  // `scripts/.probe-figures-harness-type-miss.mjs` for the duration of one probe,
  // and any reader of `scripts/` that does not skip it sees a file that was never
  // committed, never named by `pnpm lint`, and never resolved by an operator.
  // This reader did not skip it, so a full-suite run failed with one file too many
  // -- and a run whose worker was killed before its `finally` left the harness on
  // disk, which made the next run fail too. **The second reader of a directory is
  // the one that does not know what the first one learned.**
  return readdirSync(SCRIPTS)
    .filter((name) => name.endsWith('.mjs') && !name.startsWith('.'))
    .sort();
}

/** The scripts the inventory records a failure exit for. */
function inventoriedScripts(): Set<string> {
  const inventory = JSON.parse(readFileSync(resolve(ROOT, 'golden-master', 'gate-sites.json'), 'utf8'));
  return new Set<string>(inventory.sites.map((site: { script: string }) => site.script.replace(/^scripts\//, '')));
}

/** The scripts that contain a literal `process.exit(1)`, counted rather than assumed. */
function scriptsWithFailureExit(): Set<string> {
  // Read from the inventory, not guessed from the source. This function used to
  // scan each script with a regex of its own -- **a second account of the
  // predicate `derive-gate-sites.mjs` already applies**, which is the defect this
  // file exists to catch elsewhere. It cost nothing until the deriver learned to
  // read a computed status: the inventory grew by seven sites, this regex did not
  // move, and five scripts were reported as "declared a gate or probe without a
  // failure exit" when each of them has one.
  //
  // The inventory is the deriver's own output, and `gate-sites-are-proven.test.ts`
  // holds it to a fresh derivation -- so reading it here is reading the
  // measurement rather than a restatement of it.
  const inventory = JSON.parse(readFileSync(resolve(ROOT, 'golden-master', 'gate-sites.json'), 'utf8'));
  return new Set(
    (inventory.sites as { script: string }[]).map((site) => site.script.replace(/^scripts\//, '')),
  );
}

describe('scripts/ · every script is classified, and the class is checked', () => {
  describe('the register covers the tree exactly', () => {
    it('names every script and no script that is absent', () => {
      // An equality in both directions. A subset check would let a new script
      // in without a class, which is the hole this file exists to close.
      expect(Object.keys(REGISTER).sort()).toEqual(scriptNames());
    });

    it('finds a non-empty tree, so the equality above cannot pass on nothing', () => {
      expect(scriptNames().length).toBeGreaterThan(20);
    });

    it('uses only the four declared classes', () => {
      const allowed = new Set(['gate', 'probe', 'tool', 'harness', 'data']);
      for (const [name, entry] of Object.entries(REGISTER)) {
        expect(allowed.has(entry.class), `${name} has class '${entry.class}'`).toBe(true);
      }
    });
  });

  describe('the register agrees with the site inventory', () => {
    it('classifies as gate or probe exactly the scripts that have a failure exit', () => {
      // The consistency rule that keeps the register honest. A script with a
      // `process.exit(1)` must be a gate or a probe, and a script classified as
      // one of those two must have such an exit. Without this, a script could be
      // filed under `tool` to escape the requirement to prove its sites.
      const withExit = scriptsWithFailureExit();
      const declared = new Set(
        Object.entries(REGISTER)
          .filter(([, entry]) => entry.class === 'gate' || entry.class === 'probe')
          .map(([name]) => name),
      );
      const misclassified = [...withExit].filter((name) => !declared.has(name));
      const overstated = [...declared].filter((name) => !withExit.has(name));
      expect(misclassified).toEqual([]);
      expect(overstated).toEqual([]);
    });

    it('records every gate and probe in gate-sites.json', () => {
      const inventoried = inventoriedScripts();
      const declared = Object.entries(REGISTER)
        .filter(([, entry]) => entry.class === 'gate' || entry.class === 'probe')
        .map(([name]) => name);
      const missing = declared.filter((name) => !inventoried.has(name));
      // A `probe` with a failure exit is inventoried like a gate, so this is an
      // equality over the two classes combined rather than over gates alone.
      expect(missing).toEqual([]);
    });

    it('does not file a script as tool or harness while the inventory lists it', () => {
      // The other direction, and the one that would otherwise be silent: moving
      // a script from `gate` to `tool` in this file would drop it from the
      // inventory's obligations without any other test noticing.
      const inventoried = inventoriedScripts();
      const claimed = Object.entries(REGISTER)
        .filter(([, entry]) => entry.class === 'tool' || entry.class === 'harness')
        .map(([name]) => name);
      expect(claimed.filter((name) => inventoried.has(name))).toEqual([]);
    });
  });

  describe('the scripts the inventory cannot corroborate are stated, not merely absent', () => {
    it('gives a reason for every class that the inventory cannot corroborate', () => {
      // `tool` and `harness` are the classes with no failure exit to point at,
      // so the register's word is the only evidence. Each must therefore carry a
      // reason, and it must be long enough to be an argument.
      for (const [name, entry] of Object.entries(REGISTER)) {
        if (!['tool', 'harness', 'data'].includes(entry.class)) continue;
        expect(typeof entry.why, `${name} is ${entry.class} without a reason`).toBe('string');
        expect((entry.why ?? '').length, `${name}'s reason is too short to be one`).toBeGreaterThan(80);
      }
    });

    it('gives reasons that are distinct, so one sentence is not doing all the work', () => {
      const reasons = Object.values(REGISTER)
        .map((entry) => entry.why)
        .filter((why): why is string => why !== undefined);
      expect(new Set(reasons).size).toBe(reasons.length);
    });

    it('names the scripts that no test file mentions, and none of them is a gate or a probe', () => {
      // The claim is deliberately about **mentions**, because a test file's text is
      // what this can read, and a mention is not a drive. The exact set moved once
      // already and the cause is worth recording: a *negative* assertion in another
      // test -- `expect(listed).not.toContain('serve-site.mjs')` -- put that name
      // into the corpus, so an assertion that a script must not be a subject deleted
      // it from this list. Pinning the exact set would therefore report a coverage
      // change where only prose had changed.
      //
      // What the set is evidence for is stated instead: a script no test file even
      // mentions cannot have a verdict proved by one, so it must be a class with no
      // verdict to prove. `serve-site.mjs` is named explicitly because it is the one
      // that must stay unnamed -- it is an HTTP server whose only exit is the signal
      // that stops it, and nothing should ever be driving it.
      //
      // Read the test directory directly. An earlier version shelled out to
      // `grep -l '' --include '*.ts'`, and an empty pattern matches every file
      // including the register itself -- so the corpus contained all 32 script
      // names and `undriven` came back empty. The test then asserted that the
      // two known-undriven scripts *were* undriven and failed, which is the
      // right outcome from a wrong instrument.
      const testFiles = readdirSync(resolve(ROOT, 'packages/core/test'))
        .filter((name) => name.endsWith('.ts'))
        // This file is excluded, and that exclusion is load-bearing. The REGISTER
        // above names all 32 scripts, so leaving it in the corpus would make
        // `corpus.includes(name)` true for every one of them and `undriven` would
        // come back empty -- the test would have been asserting its own list
        // rather than the tree's coverage. It is the self-reference trap
        // `export-surface-enumerated.test.ts` names: an enumeration gate is only
        // worth its name when its list is independent of the thing it enumerates.
        .filter((name) => name !== 'scripts-are-classified.test.ts')
        .map((name) => resolve(ROOT, 'packages/core/test', name));
      expect(testFiles.length).toBeGreaterThan(50);
      const corpus = testFiles.map((file) => readFileSync(file, 'utf8')).join('\n');

      const undriven = scriptNames().filter((name) => !corpus.includes(name));

      /**
       * No name is pinned here, and the reason is the second incident of the same kind.
       *
       * This assertion used to read `expect(undriven).toContain('serve-site.mjs')`, and
       * the two rounds that broke it were both prose: a negative assertion in another
       * file put that name into the corpus once, and `gate-proofs.test.ts` put it there
       * again by using it as a sample (`namesakeOf('serve-site.mjs')`). A pinned name is
       * a property of the **whole corpus**, so any new sentence about the script retires
       * it -- and when it retires, `undriven` shrinks and every gate in the meta-gate
       * loses its register pair at once, which is how this was noticed: the run printed
       * `42 the script register` one round and nothing the next.
       *
       * What replaces it is the rule the comment above already argued for: the set is
       * whatever it is, and every member of it must name a class with no verdict to
       * prove. That is checkable without a sample. Vacuity is guarded from the other
       * side instead -- the corpus is the whole test directory, and its size is asserted
       * above -- and `serve-site.mjs` keeps one stable claim below: it is a `tool`, and
       * a tool has no exit for a test to prove.
       */
      expect(scriptNames().length).toBeGreaterThan(0);
      expect(REGISTER['serve-site.mjs']?.class).toBe('tool');
      expect(REGISTER['serve-site.mjs']?.why).toBeTypeOf('string');
      for (const name of undriven) {
        // A `gate` or a `probe` here would be the P1-6 defect stated in the register's
        // own vocabulary: a script with a failure exit that no test names, so nothing
        // could notice it being emptied.
        expect(['tool', 'data'], `${name} is a ${REGISTER[name]?.class} that no test names`).toContain(
          REGISTER[name]?.class,
        );
        expect(REGISTER[name]?.why, `${name} is unnamed and unexplained`).toBeTypeOf('string');
      }
      expect(undriven.length).toBeLessThan(scriptNames().length / 4);
    });

    it('does not claim a driven script is undriven, nor the reverse', () => {
      // The negative control for the assertion above: a script the corpus does
      // name must not appear in `undriven`. Stated separately because a mistake
      // in the string search -- say, an empty pattern matching everything --
      // would make the previous test pass while the register said nothing true.
      const corpus = readFileSync(resolve(ROOT, 'packages/core/test/gates-are-testable.test.ts'), 'utf8');
      expect(corpus).toContain('check-no-mock.mjs');
      expect(REGISTER['serve-site.mjs']?.why).not.toContain('check-no-mock');
    });
  });
});

/**
 * A gate may be spawned by a test, never imported by one.
 *
 * ## The defect this closes, stated as a rule
 *
 * `verify-gates-are-testable.mjs` proves a gate by **emptying it** and requiring
 * the suite to go red *and to name a failing test*. Those are one requirement: a
 * worker that dies at its first statement reports `UNATTRIBUTED`, which is
 * indistinguishable from a broken test file, and the meta-gate refuses it.
 *
 * That means a gate which a test imports **cannot be proved at all** -- the proof
 * is self-defeating. It was found twice by running the meta-gate and reading its
 * output (`check-audit-volumes.mjs` in finding 196, `measure-doc-counts.mjs` in
 * finding 198), and both times the repair was the same: move the reading into a
 * `data` module and leave the verdict in the gate.
 *
 * Twice is a pattern, and the rule was only in prose. This is the same rule with a
 * reader: any import of `scripts/<name>.mjs` in any test file whose register class
 * is `gate` or `probe` fails here, in under a second, instead of two minutes later
 * in the meta-gate's `UNATTRIBUTED` line.
 */
describe('a gate is proved by being emptied, so no test may import one', () => {
  /** `from '../../../scripts/x.mjs'` and dynamic `import('…/scripts/x.mjs')`. */
  const IMPORT = /(?:from\s+|import\s*\(\s*)'[^']*?\/([\w.-]+\.mjs)'/g;

  it('no test file imports a file the register calls a gate or a probe', () => {
    const offenders: string[] = [];
    const testDir = resolve(ROOT, 'packages/core', 'test');
    for (const name of readdirSync(testDir).filter((entry) => entry.endsWith('.test.ts'))) {
      const source = readFileSync(resolve(testDir, name), 'utf8');
      for (const match of source.matchAll(IMPORT)) {
        const script = match[1]!;
        const klass = REGISTER[script]?.class;
        if (klass === 'gate' || klass === 'probe') {
          offenders.push(`${name} imports ${script}, which is a ${klass}`);
        }
      }
    }
    expect(
      offenders,
      'a gate that a test imports cannot be proved by emptying it: the emptied file kills ' +
        'the worker before it names a failing test, and the meta-gate reports UNATTRIBUTED. ' +
        'Move the reading into a data module and leave the verdict in the gate',
    ).toEqual([]);
  });

  it('reads imports at all, which is the half that a broken pattern would skip', () => {
    // The negative control. An `IMPORT` regex that matched nothing would make the
    // assertion above pass over every file, and the failure would only appear the
    // next time somebody imported a gate -- which is the day it was written for.
    const sample = "import { check } from '../../../scripts/audit-volumes.mjs';";
    const names = [...sample.matchAll(IMPORT)].map((match) => match[1]);
    expect(names).toEqual(['audit-volumes.mjs']);
    // And the register must actually distinguish the two classes, or the filter
    // above is a filter over one value.
    expect(REGISTER['audit-volumes.mjs']?.class).toBe('data');
    expect(REGISTER['check-audit-volumes.mjs']?.class).toBe('gate');
  });
});
