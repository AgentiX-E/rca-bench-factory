import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The scratch-prefix rule, which finding 128 was written to earn.
 *
 * ## The defect
 *
 * Two "product flakes" in this repository were manufactured by clean-up that ran
 * while a suite was in flight, and both had the same shape: a fixture had created
 * a real tree under a **fixed `/tmp` prefix**, and something issued a wildcard
 * deletion over that prefix mid-run.
 *
 * Measured. A `rm -rf /tmp/rca-bench-typecheck-*` issued at 03:29 deleted the live
 * cold worktree of a run that started at 03:29, and `tsc` then reported
 *
 *     src/export/aiops2025.ts(4,40): error TS2306: File '.../guard.ts' is not a module
 *
 * seven times. That names a real file and a real mistake, which is why it read as
 * a defect in the export guard. The repository copy was intact at 4950 bytes
 * throughout. The same session's `git worktree prune` produced an
 * `expected 35 to be 36` that was first attributed to a race in the deriver.
 *
 * ## What this file can and cannot enforce
 *
 * It **cannot** stop anyone from typing a wildcard deletion. No test can. What it
 * can do is make the two facts that make the hazard real into assertions, so that
 * the next person choosing a prefix, or reaching for `rm -rf`, has them in front of
 * them:
 *
 * 1. **Every fixture tree lives under a prefix that another fixture's wildcard
 *    could match.** If two fixtures shared a prefix, a targeted clean-up would be
 *    exactly the destructive command finding 128 describes even when it names one
 *    of them, and `rm -rf /tmp/rca-bench-fetch-*` would also take
 *    `rca-bench-fetch-out-*`'s siblings. Disjointness is what makes a prefix a
 *    name rather than a category.
 *
 * 2. **The two fixtures that create git worktrees are the ones a stray
 *    `git worktree prune` can deregister.** `git worktree prune` removes a
 *    registration whose directory is gone, which is a destructive act one command
 *    away from the clean-up above and was the second half of the defect. This file
 *    pins which fixtures those are, so a third one is a deliberate addition rather
 *    than a surprise.
 *
 * The rule is stated for `mkdtempSync(join(tmpdir(), '<prefix>'))` because that is
 * the one spelling this suite uses; the argument-list scan below resolves it from
 * the source rather than from a list somebody maintains by hand.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const TEST_DIR = resolve(ROOT, 'packages', 'core', 'test');

/**
 * The source with comments blanked, so the scan reads code and not prose.
 *
 * This is not a nicety. The first version of this file scanned raw text and
 * reported **three** worktree fixtures where there is one, because the doc comment
 * above quotes the spelling it searches for. A scanner that matches its own
 * documentation is the defect this repository keeps rediscovering -- finding 127's
 * shape rule and finding 125's vocabulary scan both read text that included the
 * prose describing the rule.
 *
 * The blanking preserves byte offsets, so a match position still points at the
 * line it came from, and it handles the two forms that matter: `//` to end of line
 * and `/* ... *​/` across lines. A `//` inside a string literal would be blanked
 * too, which is wrong in general and harmless here: no fixture spells a
 * `mkdtempSync` prefix inside a string containing `//`.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length));
}

/** A fixture tree: the file that declares it, and the prefix it uses. */
interface Site {
  file: string;
  prefix: string;
  /** Whether the tree this prefix names is a git worktree. */
  worktree: boolean;
}

/**
 * Every `mkdtempSync(join(tmpdir(), '<prefix>'))` in the suite, read from source.
 *
 * The scan is over the file text rather than over a list in this file, so a new
 * fixture cannot be invisible to it. A hand-kept list would be the same defect as
 * finding 123's two counts under one label: a claim about the suite that the suite
 * is not required to satisfy.
 */
function sites(): Site[] {
  const out: Site[] = [];
  for (const file of readdirSync(TEST_DIR).filter((f) => f.endsWith('.test.ts')).sort()) {
    const source = stripComments(readFileSync(resolve(TEST_DIR, file), 'utf8'));
    for (const m of source.matchAll(/mkdtempSync\(\s*join\(\s*tmpdir\(\)\s*,\s*'([^']+)'/g)) {
      const prefix = m[1]!;
      out.push({
        file,
        prefix,
        worktree:
          source.includes("['worktree', 'add'") || source.includes("'worktree', 'add'"),
      });
    }
  }
  return out;
}

const SITES = sites();

/**
 * Every scratch file the suite writes *inside the repository*, read from source.
 *
 * `/tmp` is not the only place a fixture leaves something behind. A module that
 * has to be `import`ed rather than spawned is written next to the code that reads
 * it, so it is named by a path in the tree -- and that path is shared state
 * between every test file that uses it, because vitest runs files in parallel.
 *
 * Finding 133 is the first defect of this kind: `type-miss-probe.test.ts` and
 * `gate-sites-are-proven.test.ts` both held
 * `scripts/.probe-figures-harness.mjs`, and the second one's *setup* asserted
 * that the path did not exist. That is an assertion about the first file's
 * progress, so it failed on its own premise when the two overlapped:
 *
 *     the harness must not exist before this test: expected true to be false
 *
 * The dotfile convention makes such a file invisible to `derive-gate-sites`, and
 * that is deliberate -- but invisibility to the deriver is not exclusivity, and
 * the two were conflated. This scan states the property that was missing.
 */
/**
 * The in-tree scratch paths one source text names.
 *
 * Separate from the walk so the scan can be given a source it did not read from disk:
 * the population of this defect is now empty, and a control has to prove the *detector*
 * still works when the tree has nothing for it to find.
 */
function scratchPathsIn(source: string): string[] {
  // Both spellings the suite uses, because the first cut of this scan knew only one of
  // them and therefore passed while the shared path it was written to catch was restored --
  // a guard that reads one shape as "no defect" is the finding it exists for, one level in.
  //
  //   resolve(REPO_ROOT, 'scripts/.probe-figures-harness.mjs')   -- joined
  //   resolve(ROOT, 'scripts', '.probe-figures-harness.mjs')     -- segmented
  const found: string[] = [];
  for (const m of stripComments(source).matchAll(
    /resolve\(\s*(?:REPO_ROOT|ROOT)\s*,\s*'([^']*)'\s*(?:,\s*'([^']+)'\s*)?\)/g,
  )) {
    const path = m[2] === undefined ? m[1]! : `${m[1]}/${m[2]}`;
    // Only a dot-prefixed *filename* is scratch. `scripts/` alone is not.
    if (path.split('/').pop()?.startsWith('.') !== true) continue;
    // And nothing under `node_modules` is a fixture. `coverage-writes-are-drained.test.ts`
    // reads `node_modules/.pnpm` to find the coverage provider's own source, which is a
    // *read* of the installed store -- the opposite of a scratch file, and the kind of entry
    // that would have put a directory read under a rule about writes. The store is not the
    // suite's to write, so nothing there can be a shared fixture path either.
    if (path.split('/').includes('node_modules')) continue;
    found.push(path);
  }
  return found;
}

function inTreeScratch(): Map<string, string[]> {
  const byPath = new Map<string, string[]>();
  // This file is skipped, and the reason is not convenience: its controls spell both
  // `resolve(ROOT, 'scripts', '.probe-harness.mjs')` forms as **string literals**, so a scan
  // that reads code would report the specimen as the disease. It is one exemption, stated
  // here, and the controls below run the same scan over those literals -- which is what makes
  // skipping the file safe rather than blind.
  const self = 'scratch-prefixes-are-disjoint.test.ts';
  for (const file of readdirSync(TEST_DIR).filter((f) => f.endsWith('.test.ts') && f !== self).sort()) {
    for (const path of scratchPathsIn(readFileSync(resolve(TEST_DIR, file), 'utf8'))) {
      const files = byPath.get(path) ?? [];
      if (!files.includes(file)) files.push(file);
      byPath.set(path, files);
    }
  }
  return byPath;
}

const IN_TREE = inTreeScratch();

describe('the suite’s in-tree scratch files', () => {
  it('finds none today, and the scan still finds one when it is shown one', () => {
    // The population is **empty**, and that is the measurement rather than an omission.
    //
    // Two writers held a harness in `scripts/` when this file was written. Both are gone:
    // v2.48 moved `gate-sites-are-proven`'s into a copy of `scripts/` in a temp directory, and
    // v2.49 deleted `type-miss-probe`'s by exporting the one name it needed (finding 220).
    // So the exclusivity rule below now runs over an empty map -- which is safe in the way
    // that matters, because it fires the moment a path is added back.
    //
    // The positive control therefore moved from the tree to the **scan**. That is the
    // stronger place for it: the defect this scan once had was a spelling, not a path -- it
    // knew `resolve(REPO_ROOT, 'scripts/x.mjs')` and read `resolve(ROOT, 'scripts', 'x.mjs')`
    // as "no defect", which is how it passed while the shared path it was written to catch
    // was restored. A control pinned to a path in the tree would have gone red for the *right*
    // reason here and then been deleted; a control on both spellings cannot be.
    expect(IN_TREE, 'the suite writes no scratch file inside the tree').toEqual(new Map());
    expect(scratchPathsIn("const p = resolve(REPO_ROOT, 'scripts/.probe-harness.mjs');")).toEqual([
      'scripts/.probe-harness.mjs',
    ]);
    expect(scratchPathsIn("const p = resolve(ROOT, 'scripts', '.probe-harness.mjs');")).toEqual([
      'scripts/.probe-harness.mjs',
    ]);
    // And a path that is not a dot-prefixed filename is not scratch, which is the rule the
    // control above would otherwise be satisfied by matching anything at all.
    expect(scratchPathsIn("const p = resolve(ROOT, 'scripts', 'probe.mjs');")).toEqual([]);
  });

  it('gives each scratch path exactly one owning test file, so no two can race', () => {
    // The exclusivity rule. A path named by two files means one file's fixture
    // lifetime overlaps another's, and any assertion either makes about that
    // path -- absent before, present during, content equal -- is a statement
    // about the scheduler rather than about the code under test.
    const shared = [...IN_TREE.entries()]
      .filter(([, files]) => files.length > 1)
      .map(([path, files]) => `${path} is written by ${files.join(' and ')}`);
    expect(shared).toEqual([]);
  });
});

describe('the suite’s scratch prefixes', () => {
  it('finds the fixtures, so the rules below are not vacuously true', () => {
    expect(SITES.length).toBeGreaterThan(20);
    // A positive control on the scan itself: a prefix known to exist must be in
    // the result. If the regex drifts, this fails before the rules below read as
    // green over an empty list.
    expect(SITES.map((s) => s.prefix)).toContain('rca-bench-typecheck-');
  });

  it('gives every fixture its own prefix, so a wildcard clean-up is never targeted', () => {
    const byPrefix = new Map<string, string[]>();
    for (const site of SITES) {
      const files = byPrefix.get(site.prefix) ?? [];
      files.push(site.file);
      byPrefix.set(site.prefix, files);
    }
    // The defect finding 128 describes needs two things: a wildcard, and a prefix
    // that more than one fixture shares. This asserts the second is absent for
    // fixtures in *different* files. Two prefixes in one file are one fixture and
    // are fine, which is why the value is a set of files rather than a count.
    const shared = [...byPrefix.entries()].filter(([, files]) => new Set(files).size > 1);
    expect(shared).toEqual([]);
  });

  it('states which fixtures a stray `git worktree prune` can deregister', () => {
    const worktrees = SITES.filter((s) => s.worktree).map((s) => `${s.file}:${s.prefix}`);
    // Pinned rather than bounded: `git worktree prune` removes a registration
    // whose directory is missing, and the fixture that owns it will not be told.
    // Naming them means a third one is a decision, and the message says what the
    // decision costs.
    expect(worktrees).toEqual([
      'typecheck-entrypoint.test.ts:rca-bench-typecheck-',
    ]);
  });

  it('leaves no fixture tree under a prefix so broad that it names a category', () => {
    // `/tmp/rca-bench-` itself is the category. A fixture using it would make every
    // other fixture's tree collateral of any clean-up that mentioned it.
    const tooBroad = SITES.filter((s) => s.prefix === 'rca-bench-' || s.prefix.length < 8);
    expect(tooBroad).toEqual([]);
  });

  it('removes every git worktree it creates, so a killed run is the only leak', () => {
    // The leak finding 128 measured -- 64 orphaned trees -- is a property of killed
    // runs, and this cannot fix it. What it can assert is that a run which *does*
    // finish cleans up, because a fixture that never removes its own tree leaks on
    // every invocation rather than only on a kill.
    for (const site of SITES.filter((s) => s.worktree)) {
      const source = readFileSync(resolve(TEST_DIR, site.file), 'utf8');
      expect(
        source.includes("'worktree', 'remove'"),
        `${site.file} creates a worktree but never removes one`,
      ).toBe(true);
    }
  });
});
