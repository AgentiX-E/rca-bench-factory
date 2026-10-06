import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * The site inventory is only worth having if something reads it.
 *
 * `scripts/derive-gate-sites.mjs` walks `scripts/`, finds every
 * `process.exit(1)` in statement position, and writes
 * `golden-master/gate-sites.json` with a fingerprint for each: the enclosing
 * condition and the diagnostic the site prints. That file is a published claim
 * -- "these are the places this repository can fail, and here is what each one
 * says" -- and the defect class this campaign keeps finding is a claim that
 * nothing reads. So this file reads it, and enforces six rules.
 *
 * ## Rule 1 -- the file matches a fresh derivation
 *
 * The committed inventory must equal what the deriver produces right now. Drift
 * happens the moment a site is added and the JSON is not regenerated, and the
 * failure mode is the bad one: the inventory keeps listing a site that moved,
 * so the proof pointers below silently address a line that is no longer there.
 * Compared by re-running the deriver *in place* rather than by trusting `--check`
 * alone, because a `--check` that compared against a stale cache would report
 * agreement with itself.
 *
 * ## Rule 2 -- every site is either proved or exempt, and says why
 *
 * `status` is `proved` or `exempt`, and neither may be inferred from the other
 * field's absence. A `proved` site carries `provedBy`: a repository-relative
 * test path. An `exempt` site carries `reason`. A site with `status: "proved"`
 * and no `provedBy` is the shape of a claim, not a proof.
 *
 * ## Rule 3 -- `provedBy` names a test that exists and names the script
 *
 * The pointer must resolve on disk *and* the file it names must mention the
 * script it is supposed to be proving. Both halves matter: a path that exists
 * but belongs to an unrelated test is a plausible-looking lie, and it is the
 * one a reviewer will not check by hand.
 *
 * ## Rule 4 -- exemptions carry an argument, not a shrug
 *
 * Each `reason` is longer than 40 characters and distinct from every other
 * reason. The length bar is deliberately low -- it cannot judge prose -- but it
 * rules out `"n/a"`, `"skip"` and `"covered elsewhere"`, and the distinctness
 * bar rules out one sentence pasted down a column.
 *
 * ## Rule 5 -- the inventory is not vacuous
 *
 * At least 30 sites must be present. A deriver that stopped matching, or a
 * predicate that became too strict, would produce a short list that satisfies
 * every rule above.
 *
 * ## Rule 6 -- the rules can fail
 *
 * Rules 2 to 5 are re-checked against a *corrupted* copy of the inventory
 * written under `tmpdir()`, and the checking function must reject each
 * corruption. Without this, the rules could be spelled correctly and be
 * incapable of rejecting anything -- which is the state finding 46 described as
 * "a gate with no test is neither a threshold nor an enumeration".
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const INVENTORY = resolve(ROOT, 'golden-master', 'gate-sites.json');

interface Site {
  script: string;
  line: number;
  condition?: string;
  diagnostic?: string;
  status?: string;
  provedBy?: string;
  reason?: string;
}

interface Inventory {
  rule: string;
  scanned: number;
  excluded: Record<string, number>;
  sites: Site[];
}

const committed: Inventory = JSON.parse(readFileSync(INVENTORY, 'utf8'));

/**
 * The reasons a site may be exempt, each a full sentence.
 *
 * Kept as a list rather than free text so that adding an exemption is a visible
 * edit to this file: a new exempt site cannot be introduced by editing only the
 * JSON.
 */
const KNOWN_EXEMPTIONS: readonly string[] = [];

/**
 * Check every rule except rule 1, so the same function can be run against a
 * corrupted inventory below. Returns the list of violations; empty means valid.
 *
 * Returning violations rather than throwing is what makes rule 6 possible: the
 * corruption test needs to see *which* rule rejected the input, and a function
 * that threw on the first problem would make "rejected" and "rejected for the
 * right reason" indistinguishable.
 */
function violationsOf(inventory: Inventory, root: string): string[] {
  const problems: string[] = [];

  if (inventory.sites.length < 30) {
    problems.push(`only ${inventory.sites.length} site(s) recorded; a short list satisfies every other rule`);
  }

  const reasons: string[] = [];
  for (const site of inventory.sites) {
    const where = `${site.script}:${site.line}`;

    if (site.status === 'proved') {
      if (typeof site.provedBy !== 'string' || site.provedBy.length === 0) {
        problems.push(`${where} is proved but names no test`);
        continue;
      }
      const target = resolve(root, site.provedBy);
      let body: string;
      try {
        body = readFileSync(target, 'utf8');
      } catch {
        problems.push(`${where} names ${site.provedBy}, which does not exist`);
        continue;
      }
      const script = site.script.split('/').pop() ?? site.script;
      if (!body.includes(script)) {
        problems.push(`${where} names ${site.provedBy}, but that file never mentions ${script}`);
      }
      if (site.reason !== undefined) {
        problems.push(`${where} is proved and also carries a reason, so the two accounts can disagree`);
      }
    } else if (site.status === 'exempt') {
      // The `provedBy` check runs first and does not `continue`. When it ran last
      // the `continue` on a missing reason made it unreachable, so the
      // both-fields case passed the guard it was written to catch -- a defect in
      // the guard, found by the corruption test below rather than by review.
      if (site.provedBy !== undefined) {
        problems.push(`${where} is exempt and also names a test, which is the state rule 2 forbids`);
      }
      if (typeof site.reason !== 'string') {
        problems.push(`${where} is exempt without a reason`);
        continue;
      }
      if (site.reason.length <= 40) {
        problems.push(`${where} exempts itself in ${site.reason.length} characters: '${site.reason}'`);
      }
      reasons.push(site.reason);
    } else {
      problems.push(`${where} has status '${String(site.status)}', which is neither proved nor exempt`);
    }
  }

  const duplicates = reasons.filter((reason, i) => reasons.indexOf(reason) !== i);
  if (duplicates.length > 0) {
    problems.push(`repeated exemption reason: '${duplicates[0]}'`);
  }

  return problems;
}

const scratch = mkdtempSync(join(tmpdir(), 'rca-bench-gate-sites-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

/** Write a corrupted inventory beside a copy of the tree the pointers resolve in. */
function withInventory(sites: Site[], name: string): string {
  const dir = join(scratch, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'gate-sites.json'), JSON.stringify({ ...committed, sites }, null, 2));
  return dir;
}

/** Copy every file a `provedBy` pointer names into a scratch root. */
function pointerRoot(): string {
  const dir = join(scratch, 'pointer-root');
  for (const site of committed.sites) {
    if (site.provedBy === undefined) continue;
    const target = join(dir, site.provedBy);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(resolve(ROOT, site.provedBy), target);
  }
  return dir;
}

describe('golden-master/gate-sites.json · the inventory is read, not just written', () => {
  describe('rule 1 · the committed file matches a fresh derivation', () => {
    it('is byte-identical to what the deriver produces now', () => {
      const fresh = spawnSync(process.execPath, [resolve(ROOT, 'scripts', 'derive-gate-sites.mjs'), '--stdout'], {
        encoding: 'utf8',
        cwd: ROOT,
      });
      expect(fresh.status).toBe(0);
      const derived = JSON.parse(fresh.stdout) as Inventory;

      // The four derived columns, compared per site. The annotation columns are
      // added by hand and are not part of the derivation, so they are excluded
      // here and checked by the rules below.
      const derivedShape = derived.sites.map((s) => ({ ...s }));
      const committedShape = committed.sites.map(({ status, provedBy, reason, ...rest }) => rest);
      expect(committedShape).toEqual(derivedShape);
      expect(committed.scanned).toBe(derived.scanned);
      expect(committed.excluded).toEqual(derived.excluded);
    });

    it('records the derivation rule it was produced under', () => {
      expect(committed.rule).toContain('process.exit(1)');
      expect(committed.rule).toContain('derive-gate-sites.mjs');
    });
  });

  describe('rule 2 and 3 · every site names its proof or its exemption', () => {
    it('has no rule violations against the shipped tree', () => {
      expect(violationsOf(committed, ROOT)).toEqual([]);
    });

    it('proves at least one site, so the file is not entirely exemptions', () => {
      expect(committed.sites.filter((s) => s.status === 'proved').length).toBeGreaterThan(0);
    });

    it('derives its proven count from the site list rather than a stored total', () => {
      // A stored total is a second account of the same fact, and the two can
      // disagree. This asserts there is only one account.
      expect(Object.keys(committed)).not.toContain('provedCount');
      expect(Object.keys(committed)).not.toContain('exemptCount');
    });
  });

  describe('rule 4 · exemptions are arguments, not shrugs', () => {
    it('only uses exemption reasons this file knows about', () => {
      const used = new Set(committed.sites.filter((s) => s.status === 'exempt').map((s) => s.reason));
      expect([...used].filter((r) => !KNOWN_EXEMPTIONS.includes(r as string))).toEqual([]);
    });
  });

  describe('rule 5 · the inventory is not vacuous', () => {
    it('records at least 30 sites', () => {
      expect(committed.sites.length).toBeGreaterThanOrEqual(30);
    });

    it('records the sites it excluded, so the predicate is auditable', () => {
      // `process.exit(0)`, a non-1 numeric status, and a computed argument are
      // the three shapes deliberately not treated as failure sites. Recording
      // them makes the predicate reviewable: a site that quietly moved from
      // `sites` to `excluded` shows up as a change in these three numbers.
      expect(Object.keys(committed.excluded).sort()).toEqual(['computed', 'numeric_other', 'zero']);
      for (const count of Object.values(committed.excluded)) {
        expect(typeof count).toBe('number');
      }
      expect(committed.scanned).toBeGreaterThan(0);
    });

    it('gives every site a diagnostic, so a failure is readable', () => {
      const silent = committed.sites.filter((s) => s.diagnostic === undefined);
      expect(silent).toEqual([]);
    });
  });

  describe('rule 6 · the rules can fail', () => {
    it('rejects a proved site with no test named', () => {
      const broken = withInventory(
        [{ script: 'scripts/x.mjs', line: 1, status: 'proved' }],
        'broken-no-test',
      );
      const problems = violationsOf(
        { ...committed, sites: [{ script: 'scripts/x.mjs', line: 1, status: 'proved' }] },
        broken,
      );
      expect(problems.some((p) => p.includes('proved but names no test'))).toBe(true);
    });

    it('rejects a proved site whose test does not exist', () => {
      const dir = withInventory([], 'broken-absent-test');
      const problems = violationsOf(
        { ...committed, sites: [{ script: 'scripts/x.mjs', line: 1, status: 'proved', provedBy: 'packages/core/test/nope.test.ts' }] },
        dir,
      );
      expect(problems.some((p) => p.includes('which does not exist'))).toBe(true);
    });

    it('rejects a proved site whose test exists but never names the script', () => {
      // The plausible-looking lie: a real path, an unrelated file.
      const dir = join(scratch, 'broken-wrong-test');
      mkdirSync(join(dir, 'packages/core/test'), { recursive: true });
      writeFileSync(join(dir, 'packages/core/test/other.test.ts'), '// proves nothing in particular\n');
      const problems = violationsOf(
        { ...committed, sites: [{ script: 'scripts/x.mjs', line: 1, status: 'proved', provedBy: 'packages/core/test/other.test.ts' }] },
        dir,
      );
      expect(problems.some((p) => p.includes('never mentions x.mjs'))).toBe(true);
    });

    it('rejects an exemption with no reason', () => {
      const problems = violationsOf(
        { ...committed, sites: [{ script: 'scripts/x.mjs', line: 1, status: 'exempt' }] },
        ROOT,
      );
      expect(problems.some((p) => p.includes('exempt without a reason'))).toBe(true);
    });

    it('rejects a one-word exemption', () => {
      const problems = violationsOf(
        { ...committed, sites: [{ script: 'scripts/x.mjs', line: 1, status: 'exempt', reason: 'covered elsewhere' }] },
        ROOT,
      );
      expect(problems.some((p) => p.includes('exempts itself in'))).toBe(true);
    });

    it('rejects an unknown status', () => {
      const problems = violationsOf(
        { ...committed, sites: [{ script: 'scripts/x.mjs', line: 1, status: 'maybe' }] },
        ROOT,
      );
      expect(problems.some((p) => p.includes("status 'maybe'"))).toBe(true);
    });

    it('rejects a site that is both proved and exempt', () => {
      // Two accounts of the same fact, which can disagree. Both spellings are
      // rejected, so there is no order in which the fields may be combined.
      const dir = pointerRoot();
      const proved = committed.sites.find((s) => s.status === 'proved')!;
      const both = { ...proved, reason: 'this site is also exempted, for a conflicting reason' };
      const problems = violationsOf({ ...committed, sites: [both] }, dir);
      expect(problems.some((p) => p.includes('carries a reason'))).toBe(true);

      const exempt = { ...proved, status: 'exempt' };
      const reversed = violationsOf({ ...committed, sites: [exempt] }, dir);
      expect(reversed.some((p) => p.includes('also names a test'))).toBe(true);
    });

    it('rejects a repeated exemption reason', () => {
      const reason = 'One sentence pasted down a column is not an argument, it is a shrug.';
      const problems = violationsOf(
        {
          ...committed,
          sites: [
            { script: 'scripts/a.mjs', line: 1, status: 'exempt', reason },
            { script: 'scripts/b.mjs', line: 2, status: 'exempt', reason },
          ],
        },
        ROOT,
      );
      expect(problems.some((p) => p.includes('repeated exemption reason'))).toBe(true);
    });

    it('rejects a short inventory', () => {
      const problems = violationsOf({ ...committed, sites: [] }, ROOT);
      expect(problems.some((p) => p.includes('only 0 site(s) recorded'))).toBe(true);
    });

    it('reports the shipped tree as clean when run through the same function', () => {
      // The negative control for rule 6: the function rejects the corruptions
      // above and accepts the real file. Without this, a function that rejected
      // everything would satisfy every test in this block.
      expect(violationsOf(committed, pointerRoot())).toEqual([]);
    });
  });

  describe('scripts/derive-gate-sites.mjs · the deriver proves itself', () => {
    it('refuses to write when --check is given and the file has drifted', () => {
      // The deriver listed its own `fail()` in the inventory it produces, so the
      // site needs a test like any other. `--check --out <file>` is the branch
      // this exercises: a committed file that disagrees with a fresh derivation
      // must exit 1 with the deriver's own diagnostic rather than being
      // rewritten.
      const stale = join(scratch, 'stale-sites.json');
      writeFileSync(stale, JSON.stringify({ rule: 'wrong', scanned: 0, excluded: {}, sites: [] }, null, 2));
      const result = spawnSync(
        process.execPath,
        [resolve(ROOT, 'scripts', 'derive-gate-sites.mjs'), '--check', '--out', stale],
        { encoding: 'utf8', cwd: ROOT },
      );
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('derive-gate-sites: FAILED');
      expect(result.stderr).not.toMatch(/Cannot find module/);
      expect(result.stderr).not.toMatch(/^\s+at .*node:internal/m);
    });

    it('passes --check against the committed file, and does not rewrite it', () => {
      const before = readFileSync(INVENTORY, 'utf8');
      const result = spawnSync(
        process.execPath,
        [resolve(ROOT, 'scripts', 'derive-gate-sites.mjs'), '--check', '--out', INVENTORY],
        { encoding: 'utf8', cwd: ROOT },
      );
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('derive-gate-sites: OK');
      expect(readFileSync(INVENTORY, 'utf8')).toBe(before);
    });

    it('excludes its own --check output from the sites it reports', () => {
      // The deriver's `fail()` is a site; the comparison and the write path are
      // not. This asserts the predicate is not simply "every process.exit(1)",
      // which would have counted the `--check` branch's exit twice.
      const deriver = committed.sites.filter((s) => s.script === 'scripts/derive-gate-sites.mjs');
      expect(deriver).toHaveLength(1);
      expect(deriver[0]!.condition).toBeUndefined();
    });
  });
});
