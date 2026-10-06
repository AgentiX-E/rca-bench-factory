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
 *   - **computed-probe** -- a probe whose exit status is computed rather than
 *     literal, as `process.exit(main())`. The site inventory deliberately does
 *     not fingerprint these: the argument is not the constant `1`, so there is
 *     no threshold to enumerate and nothing for the deriver to point at. They
 *     are listed here so that the exclusion is a recorded decision rather than
 *     an omission -- the deriver reports the count under `excluded.computed`,
 *     and this class is the script-level account of the same fact.
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
type Klass = 'gate' | 'probe' | 'computed-probe' | 'tool' | 'harness' | 'data';

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

  // --- Gates: each has failure exits, all enumerated in gate-sites.json ---
  'apply-pins.mjs': { class: 'gate' },
  'build-example-bundle.mjs': { class: 'gate' },
  'check-cli-reference.mjs': { class: 'gate' },
  'check-doc-counts.mjs': { class: 'gate' },
  'check-l4-status.mjs': { class: 'gate' },
  'check-no-absolute-paths.mjs': { class: 'gate' },
  'check-no-mock.mjs': { class: 'gate' },
  'check-no-secrets.mjs': { class: 'gate' },
  'check-no-vendored-data.mjs': { class: 'gate' },
  'check-official-registry.mjs': { class: 'gate' },
  'check-official.mjs': { class: 'gate' },
  'check-readme-sample.mjs': { class: 'gate' },
  'derive-fault-golden.mjs': { class: 'gate' },
  'derive-gate-sites.mjs': { class: 'gate' },
  'fetch-official.mjs': { class: 'gate' },
  'gen-examples.mjs': { class: 'gate' },
  'gen-rcaeval-cases.mjs': { class: 'gate' },
  'measure-doc-counts.mjs': { class: 'gate' },
  'score-fault-extraction.mjs': { class: 'gate' },
  'verify-example-pack.mjs': { class: 'gate' },
  'verify-scorer-stability.mjs': { class: 'gate' },

  // --- Probes: a literal failure exit, enumerated in gate-sites.json ---
  'probe-agreement-baseline.mjs': { class: 'probe' },
  'probe-category-derivation.mjs': { class: 'probe' },
  'probe-denial-inventory.mjs': { class: 'probe' },

  // --- Probes whose exit status is computed, so the inventory cannot list them ---
  'probe-m1-ceiling.mjs': {
    class: 'computed-probe',
    why:
      'Ends with `process.exit(main())`, so the status is whatever the run computed rather than the ' +
      'literal 1. The deriver cannot fingerprint a threshold it cannot read, which is why this script is ' +
      'absent from gate-sites.json and counted under excluded.computed instead.',
  },
  'probe-type-misses.mjs': {
    class: 'computed-probe',
    why:
      'Also ends with `process.exit(main())`. The probe toggles a rule and re-scores, so its status is the ' +
      'outcome of that comparison; there is no single failure site to enumerate, and the battery that ' +
      'drives it is where the assertion lives.',
  },
  'probe-category-inference.mjs': {
    class: 'computed-probe',
    why:
      'Reports the category each sample infers and prints a table. It exits with no explicit status at ' +
      'all, so it is the degenerate case of the same class: there is no failure exit to enumerate, and ' +
      'its reading is a table rather than a verdict.',
  },

  // --- Harnesses: only meaningful while a battery drives them ---
  'inject-stability.mjs': {
    class: 'harness',
    why:
      'Rewrites the scorer to check that the stability properties catch the change. It has no verdict of ' +
      'its own; the battery that drives it owns the assertion, and running it alone would leave the tree ' +
      'mutated with nothing to restore it.',
  },
  'inject-component-rule.mjs': {
    class: 'harness',
    why:
      'Deletes a component rule to check that the derivation probe notices the absence. Its purpose is to ' +
      'make another script fail, so a failure exit of its own would be indistinguishable from the mutation ' +
      'it is supposed to perform.',
  },
  'inject-m1-ceiling-tests.mjs': {
    class: 'harness',
    why:
      'Injects the M1 ceiling cases into the suite for the probe to read. It edits test files rather than ' +
      'reporting on them, so there is no reading to assert and no defect of its own to exit on.',
  },

  // --- Tools: produce an artefact or serve one, with no verdict ---
  'serve-site.mjs': {
    class: 'tool',
    why:
      'An HTTP server for `site/`, run by hand and by `pnpm site:serve`. It has no exit path other than ' +
      'the signal that stops it, so there is no failure to enumerate and no reading to assert.',
  },
};

function scriptNames(): string[] {
  return readdirSync(SCRIPTS)
    .filter((name) => name.endsWith('.mjs'))
    .sort();
}

/** The scripts the inventory records a failure exit for. */
function inventoriedScripts(): Set<string> {
  const inventory = JSON.parse(readFileSync(resolve(ROOT, 'golden-master', 'gate-sites.json'), 'utf8'));
  return new Set<string>(inventory.sites.map((site: { script: string }) => site.script.replace(/^scripts\//, '')));
}

/** The scripts that contain a literal `process.exit(1)`, counted rather than assumed. */
function scriptsWithFailureExit(): Set<string> {
  const found = new Set<string>();
  for (const name of scriptNames()) {
    const source = readFileSync(resolve(SCRIPTS, name), 'utf8');
    // Statement-position check, matching the deriver's own predicate closely
    // enough for a membership question. A script that mentions the call only
    // inside a comment or a string is not counted, which is why the pattern
    // anchors on a preceding boundary and a trailing terminator.
    if (/(?:^|[;{}\s])process\.exit\(\s*1\s*\)\s*;?\s*$/m.test(source)) found.add(name);
  }
  return found;
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
      const allowed = new Set(['gate', 'probe', 'computed-probe', 'tool', 'harness', 'data']);
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

  describe('the two unproved scripts are stated, not merely absent', () => {
    it('gives a reason for every class that the inventory cannot corroborate', () => {
      // `tool` and `harness` are the classes with no failure exit to point at,
      // so the register's word is the only evidence. Each must therefore carry a
      // reason, and it must be long enough to be an argument.
      for (const [name, entry] of Object.entries(REGISTER)) {
        if (!['tool', 'harness', 'data', 'computed-probe'].includes(entry.class)) continue;
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

    it('names the two scripts that no test drives, and they are still the only two', () => {
      // The specific finding, pinned. `serve-site.mjs` and
      // `probe-category-inference.mjs` are in the tree and no test names either.
      // Asserting it here means the gap is a recorded fact rather than an
      // omission: if a third appears, the assertion below fails and the author
      // has to classify it.
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
      expect(undriven.sort()).toEqual(['probe-category-inference.mjs', 'serve-site.mjs']);
      // And both are stated in the register, so the fact is not left implicit.
      for (const name of undriven) {
        expect(REGISTER[name]?.why).toBeTypeOf('string');
      }
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
