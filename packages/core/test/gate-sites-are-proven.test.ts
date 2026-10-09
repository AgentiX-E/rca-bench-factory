import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
 *
 * ## Rule 7 -- a proof that only spells the script is not a proof
 *
 * Rule 3 asks whether the named test file *contains* the script's name, and
 * that is all it asks. A file that mentions `check-official.mjs` in a comment
 * satisfies it. This was not hypothetical: `check-official.mjs`'s failure block
 * was published as `proved` on the strength of a test that regex-matched the
 * block's source text, while the block itself was unreachable at runtime -- the
 * only bundle the script could read was the shipped example, which passes by
 * construction. The inventory was right that the site existed and wrong that it
 * was proved, and rule 3 was structurally unable to tell the difference. That is
 * this campaign's recurring defect -- a published claim nothing reads -- found
 * inside the file written to catch it.
 *
 * So rule 7 requires evidence that the test *executes* the script, from **two**
 * signals that must agree:
 *
 *   1. **Declared.** The test file states which scripts it drives, in a
 *      `DRIVES` array of repository-relative script paths. This is a manual
 *      claim, like `status` and `provedBy` -- and, like them, one this file can
 *      now reject.
 *   2. **Inferred.** The test file contains a `spawnSync`/`execFileSync`/
 *      `execSync` call whose argument list names the script.
 *
 * Neither alone is sufficient, and the reason is measured rather than assumed.
 * Inference alone would reject four real proofs: `probe-built-module-guards.ts`
 * proves five sites across four scripts by *copying each probe into a scratch
 * tree* and spawning `resolve(cwd, 'scripts', script)`, so the script name is a
 * variable and no literal path appears. The declaration alone would be an
 * unbacked assertion. Together each covers the other's blind spot, and a
 * disagreement in either direction is reported as a violation rather than
 * resolved silently -- a value in one set and not the other is always visible.
 *
 * ## What rule 7 establishes, and what it does not
 *
 * It is a **file-level** claim, not a site-level one: it establishes that the
 * named test file has a path to executing the script, not that any particular
 * line inside the script is reached. Measured, by reverting the `--bundle` fix
 * and the executing test while leaving the rest of the file intact, the rule
 * still accepted the site -- because other tests in the same file do spawn
 * `check-official.mjs`, so the file-level signal was satisfied by them.
 *
 * That limit is stated rather than papered over, and it is why rule 7 was not
 * enough on its own: the `check-official.mjs` site needed the `--bundle` flag to
 * become reachable *and* the executing test to demonstrate it. Rule 7's job is
 * narrower and still worth having -- it refuses the shape where a file names a
 * script it never runs at all, which is what the old rule 3 accepted and what
 * the inventory published. A rule that reported site-level reachability would
 * have to execute every site, which is the coverage question, not this one.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/**
 * The budget for a test that spawns the deriver.
 *
 * Stated rather than inherited, because the two tests below run a real `node`
 * process and vitest's five-second default is not a measurement of anything.
 * Each spawn was measured standalone at well under a second (`derive-gate-sites`
 * is a directory walk plus one file write), so this is an order-of-magnitude
 * bound on a hang, not a near-miss tuning.
 *
 * This constant was **missing** on the first version of the dotfile test, which
 * passed the file as `timeout: RULE_TIMEOUT_MS` without declaring it. The suite
 * reported it as `ReferenceError: RULE_TIMEOUT_MS is not defined` at *collect*
 * time, so the whole `gate-sites-are-proven.test.ts` file failed as a suite and
 * took its other 28 tests with it -- the failure names one line and hides the
 * file. It was found by `measure-doc-counts.mjs`, which spawns `pnpm test` and
 * therefore ran the suite in a state a targeted `vitest run <file>` does not
 * reproduce. `timeout-budget.test.ts` reads this file too and did not catch it:
 * the reader scans for budgets, and a budget that is *missing* is not a value it
 * can see. That is a gap in the reader, recorded rather than fixed here.
 */
const RULE_TIMEOUT_MS = 30_000;
const INVENTORY = resolve(ROOT, 'golden-master', 'gate-sites.json');

/**
 * The scripts this file executes.
 *
 * Rule 7 reconciles this declaration against the scripts the spawn calls below
 * actually reach, and reports a disagreement in either direction. This file
 * proves `derive-gate-sites.mjs`'s own failure site by running the deriver, so
 * it has to satisfy the rule it enforces -- there is no exemption for the file
 * that defines the rule, because a rule its own author is exempt from is a rule
 * that will drift on the first edit.
 */
const DRIVES = ['scripts/derive-gate-sites.mjs'];

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
 * The scripts a test file declares that it *executes*.
 *
 * Read from the file's own `DRIVES` array, so the claim lives beside the test it
 * describes and cannot be edited in only one place. An absent declaration reads
 * as the empty set, which rule 7 then reconciles against the spawn evidence.
 */
function declaredDrives(body: string): string[] {
  const match = /const DRIVES\s*(?::[^=]+)?=\s*\[([^\]]*)\]/.exec(body);
  if (match === null) return [];
  return [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

/**
 * The scripts a test file executes, resolved through its own bindings.
 *
 * Two shapes carry evidence that a script is *run*, and both are in use here:
 *
 *   1. **The spawn's own argument list.** `spawnSync(node, [SCRIPT, ...])` with
 *      `const SCRIPT = resolve(ROOT, 'scripts', 'apply-pins.mjs')`, or the
 *      literal inline: `spawnSync(node, ['scripts/x.mjs', ...])`.
 *   2. **A call site that hands the script to a spawning helper.** Many files
 *      wrap the spawn in `run(script: string, ...)` and then call
 *      `run(DERIVE, ...)` or `run('check-no-mock.mjs', ...)`. At the spawn the
 *      parameter is a name and nothing can be resolved from it, but the call
 *      site names the script and the helper is what executes it.
 *
 * Evidence class 2 is why this is a *reconciliation* rather than a check on the
 * spawn alone. Restricting it to class 1 was measured and rejected: it reported
 * eight real proofs as false, every one of them a helper-driven run. Restricting
 * it to class 2 would miss the direct spawns. Requiring both would miss both.
 *
 * What is deliberately *not* evidence: the script's name appearing anywhere else
 * -- a comment, a `describe` title, an `expect` string. That is the "spelled, not
 * executed" case rule 7 exists to catch, and it is why the search is scoped to
 * call and spawn argument lists rather than to the file wholesale.
 *
 * The argument list of a call is delimited by paren scanning rather than a lazy
 * regex, because `spawnSync(node, [SCRIPT, ...args])` nests a call inside the
 * argument list and a lazy match would stop at the inner `)`.
 */
function inferredDrives(body: string): string[] {
  // Identifier -> script filename, from the file's own top-level declarations.
  const bindings = new Map<string, string>();
  for (const decl of body.matchAll(/const\s+([A-Za-z_$][\w$]*)\s*=\s*([^;\n]+)/g)) {
    const literal = /(?:scripts\/)?([a-z0-9-]+\.mjs)/.exec(decl[2]);
    if (literal !== null) bindings.set(decl[1], literal[1]);
  }

  const found = new Set<string>();
  const note = (name: string) => {
    // Normalise to a bare filename; the caller compares against both forms.
    found.add(name.includes('/') ? name.split('/').pop()! : name);
  };

  /** The text between a call's parentheses, found by paren scanning. */
  function argumentList(at: number): string {
    const open = body.indexOf('(', at);
    let depth = 0;
    let close = open;
    for (let i = open; i < body.length; i += 1) {
      if (body[i] === '(') depth += 1;
      else if (body[i] === ')') {
        depth -= 1;
        if (depth === 0) {
          close = i;
          break;
        }
      }
    }
    return body.slice(open + 1, close);
  }

  /**
   * The text of a function's body, found by brace scanning from its parameters.
   *
   * This has to be the body and not the parameter list. The first version asked
   * whether the *parameters* contained a spawn call, which is never true and so
   * classified no helper at all -- the seven helper-driven files kept reporting
   * "declares it but never spawns it". The parameters of `run(script: string,
   * cwd: string)` say nothing about what `run` does.
   */
  function functionBody(at: number): string {
    const params = argumentList(at);
    const afterParams = body.indexOf('(', at) + params.length + 2;
    const open = body.indexOf('{', afterParams);
    let depth = 0;
    let close = open;
    for (let i = open; i < body.length; i += 1) {
      if (body[i] === '{') depth += 1;
      else if (body[i] === '}') {
        depth -= 1;
        if (depth === 0) {
          close = i;
          break;
        }
      }
    }
    return body.slice(open, close + 1);
  }

  /**
   * Scripts reachable through a data table the file drives its helper with.
   *
   * `probe-built-module-guards.test.ts` holds its subjects in a `PROBES` array
   * and renders one suite per entry with `describe.each(PROBES)(… ({ script })
   * => run(script, …))`. The script name at the call site is a destructured
   * parameter, so no expression at the call site resolves to a filename and no
   * amount of call-site inference can recover it. The values are in the table a
   * few lines up, so the table is read instead.
   *
   * This is the case the declaration exists for, and reading the table is what
   * keeps the declaration from being an unbacked claim: the entry has to be
   * *there*, and it has to be a value the file's helper is actually called with.
   */
  function scriptsInTables(): string[] {
    const out: string[] = [];
    // Any array of object literals with a `script: '<name>.mjs'` field, which is
    // the shape `PROBES` uses and the only one this needs to cover. The closing
    // bracket is matched as `]` followed by anything up to the end of the
    // statement, because `PROBES` ends `] as const;` and requiring a bare `];`
    // silently matched nothing -- the same off-by-one-shape class of mistake as
    // the comment-stripping and line-number bugs this campaign keeps recording.
    for (const table of body.matchAll(/=\s*\[([\s\S]*?)\]\s*(?:as const)?;/g)) {
      for (const entry of table[1].matchAll(/script:\s*'([^']+\.mjs)'/g)) out.push(entry[1]);
    }
    return [...new Set(out)].sort();
  }

  /** Every script the given argument list reaches, by literal or by binding. */
  function scriptsIn(args: string): void {
    for (const path of args.matchAll(/scripts\/[a-z0-9-]+\.mjs/g)) note(path[0]);
    for (const bare of args.matchAll(/'([a-z0-9-]+\.mjs)'/g)) note(bare[1]);
    for (const id of args.matchAll(/\b[A-Za-z_$][\w$]*\b/g)) {
      const bound = bindings.get(id[0]);
      if (bound !== undefined) note(bound);
    }
  }

  // Class 1: the spawn call itself.
  for (const call of body.matchAll(/\b(?:spawnSync|execFileSync|execSync)\s*\(/g)) {
    scriptsIn(argumentList(call.index));
  }

  // Class 2: a call to a local helper that does the spawning. The helper is
  // recognised by its own *body* containing a spawn, so a call to something
  // unrelated cannot be read as a drive.
  const helpers = new Set<string>();
  for (const fn of body.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(/g)) {
    if (/\b(?:spawnSync|execFileSync|execSync)\s*\(/.test(functionBody(fn.index))) helpers.add(fn[1]);
  }
  for (const helper of helpers) {
    const calls = [...body.matchAll(new RegExp(`\\b${helper}\\s*\\(`, 'g'))];
    for (const call of calls) scriptsIn(argumentList(call.index));
    // If any call to this helper is table-driven, the table supplies the names.
    if (calls.length > 0) for (const fromTable of scriptsInTables()) note(fromTable);
  }

  return [...found].sort();
}

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
        continue;
      }
      // Rule 7. Rule 3 above is satisfied by a mention, and a mention is not an
      // execution -- see the header for the check-official.mjs site that was
      // published as proved on a source-text regex. Both signals are required,
      // and a disagreement between them is reported rather than resolved.
      //
      // The two sides are normalised to a bare filename before comparison.
      // `DRIVES` holds repository-relative paths (`scripts/apply-pins.mjs`) and
      // the inference resolves through the file's own bindings, while `script`
      // above is the basename the inventory records. Comparing the mixed forms
      // directly made every correctly-declared file read as undeclared -- a
      // defect in the rule, caught by running it against the declarations rather
      // than by reading it.
      const declared = declaredDrives(body);
      const inferred = inferredDrives(body);
      const declaredHere = declared.includes(script) || declared.includes(site.script);
      const inferredHere = inferred.includes(script) || inferred.includes(site.script);
      if (!declaredHere && !inferredHere) {
        problems.push(
          `${where}: ${site.provedBy} neither declares ${script} in DRIVES nor spawns it, ` +
            `so the site is named rather than executed`,
        );
      } else if (declaredHere !== inferredHere) {
        const side = declaredHere ? 'declares it but never spawns it' : 'spawns it but does not declare it';
        problems.push(`${where}: ${site.provedBy} ${side} (${script}), so the two accounts disagree`);
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

  describe('rule 7 · a proof that only spells the script is not a proof', () => {
    it('accepts the shipped tree, so the rule is not merely strict', () => {
      // The negative control. Every one of the 38 sites' proving files declares
      // what it drives and does so consistently, which is what makes the
      // rejections below meaningful rather than a sign the rule rejects all.
      const problems = violationsOf(committed, pointerRoot());
      expect(problems.filter((p) => p.includes('DRIVES') || p.includes('disagree'))).toEqual([]);
    });

    it('rejects a proved file that names the script but never reaches a spawn', () => {
      // The defect rule 7 was written for, reproduced as a fixture. The file
      // mentions the script -- so rule 3 accepts it -- and never executes it.
      // This is exactly the shape `check-official.mjs`'s failure site was
      // published under before this rule existed.
      const dir = join(scratch, 'spells-not-runs');
      mkdirSync(join(dir, 'packages/core/test'), { recursive: true });
      writeFileSync(
        join(dir, 'packages/core/test/speller.test.ts'),
        [
          "// This file is about scripts/dev-null.mjs.",
          "const DEV_NULL = 'scripts/dev-null.mjs';",
          'export const NOTE = `we read ${DEV_NULL} and think about it`;',
          '',
        ].join('\n'),
      );
      const problems = violationsOf(
        {
          ...committed,
          sites: [{ script: 'scripts/dev-null.mjs', line: 1, status: 'proved', provedBy: 'packages/core/test/speller.test.ts' }],
        },
        dir,
      );
      expect(problems.some((p) => p.includes('named rather than executed'))).toBe(true);
    });

    it('rejects a file that declares a script it never runs', () => {
      // A declaration with nothing behind it is the failure mode the two-signal
      // design exists to prevent: a hand-written claim that no spawn supports.
      const dir = join(scratch, 'declared-unrun');
      mkdirSync(join(dir, 'packages/core/test'), { recursive: true });
      writeFileSync(
        join(dir, 'packages/core/test/overclaimer.test.ts'),
        ["const DRIVES = ['scripts/dev-null.mjs'];", 'export const NOTE = 1;', ''].join('\n'),
      );
      const problems = violationsOf(
        {
          ...committed,
          sites: [{ script: 'scripts/dev-null.mjs', line: 1, status: 'proved', provedBy: 'packages/core/test/overclaimer.test.ts' }],
        },
        dir,
      );
      expect(problems.some((p) => p.includes('declares it but never spawns it'))).toBe(true);
    });

    it('rejects the mirrored disagreement: runs a script it never declares', () => {
      // The other direction, and the reason the reconciliation is two-sided. A
      // rule that only caught over-claiming would let a file quietly stop
      // declaring a script it still runs, and the declaration would decay into
      // a partial list that no longer describes the file.
      const dir = join(scratch, 'runs-undeclared');
      mkdirSync(join(dir, 'packages/core/test'), { recursive: true });
      writeFileSync(
        join(dir, 'packages/core/test/underclaimer.test.ts'),
        [
          "import { spawnSync } from 'node:child_process';",
          "const SCRIPT = 'scripts/dev-null.mjs';",
          'export const GO = () => spawnSync(process.execPath, [SCRIPT]);',
          "const DRIVES = ['scripts/other.mjs'];",
          '',
        ].join('\n'),
      );
      const problems = violationsOf(
        {
          ...committed,
          sites: [{ script: 'scripts/dev-null.mjs', line: 1, status: 'proved', provedBy: 'packages/core/test/underclaimer.test.ts' }],
        },
        dir,
      );
      expect(problems.some((p) => p.includes('spawns it but does not declare it'))).toBe(true);
    });

    it('resolves a script reached through a spawning helper at the call site', () => {
      // The helper shape, which is how most of these files drive a gate. The
      // spawn's own argument list holds a parameter, so evidence has to come
      // from the call site that hands the helper its path.
      const dir = join(scratch, 'via-helper');
      mkdirSync(join(dir, 'packages/core/test'), { recursive: true });
      writeFileSync(
        join(dir, 'packages/core/test/helper.test.ts'),
        [
          "import { spawnSync } from 'node:child_process';",
          "function run(path: string) { return spawnSync(process.execPath, [path]); }",
          "const DERIVE = 'scripts/dev-null.mjs';",
          "const DRIVES = ['scripts/dev-null.mjs'];",
          'export const GO = () => run(DERIVE);',
          '',
        ].join('\n'),
      );
      const problems = violationsOf(
        {
          ...committed,
          sites: [{ script: 'scripts/dev-null.mjs', line: 1, status: 'proved', provedBy: 'packages/core/test/helper.test.ts' }],
        },
        dir,
      );
      // Only the rule-7 messages are asserted empty: the one-site fixture trips
      // rule 5's >=30 guard, which is a different rule doing its job. Filtering
      // rather than padding the fixture keeps this test about what it names.
      expect(problems.filter((p) => p.includes('DRIVES') || p.includes('disagree'))).toEqual([]);
    });

    it('reads a table-driven suite, where no call site can name the script', () => {
      // The shape `probe-built-module-guards.test.ts` uses: a `PROBES` array and
      // a per-entry suite whose callback destructures `script`. No expression at
      // the call site resolves to a filename, so the table is the only place the
      // values exist -- and reading it is what keeps the declaration backed by
      // something rather than merely asserted.
      const dir = join(scratch, 'table-driven');
      mkdirSync(join(dir, 'packages/core/test'), { recursive: true });
      writeFileSync(
        join(dir, 'packages/core/test/table.test.ts'),
        [
          "import { spawnSync } from 'node:child_process';",
          'function run(script: string, cwd: string) { return spawnSync(process.execPath, [cwd, script]); }',
          'const PROBES = [',
          "  { script: 'dev-null.mjs', bundle: 'x' },",
          '] as const;',
          "const DRIVES = ['scripts/dev-null.mjs'];",
          'export const GO = PROBES.map((p) => run(p.script, "/"));',
          '',
        ].join('\n'),
      );
      const problems = violationsOf(
        {
          ...committed,
          sites: [{ script: 'scripts/dev-null.mjs', line: 1, status: 'proved', provedBy: 'packages/core/test/table.test.ts' }],
        },
        dir,
      );
      expect(problems.filter((p) => p.includes('DRIVES') || p.includes('disagree'))).toEqual([]);
    });
  });

  describe('scripts/derive-gate-sites.mjs · the deriver proves itself', () => {
    it('ignores a dotfile in scripts/, so a concurrent scratch module cannot move the count', {
      // The flake this pins, found by watching `scripts/` at high frequency while
      // the suite ran: a test writes a dotfile there and removes it in a
      // `finally`, and for the duration of that window the deriver counted 36
      // scripts where the committed inventory says 35. Rule 1's assertion then
      // failed with `expected 35 to be 36` in roughly one run in four.
      //
      // Reproduced directly rather than inferred: with such a file created, the
      // deriver reports `scanned: 36`; removed, `scanned: 35`.
      //
      // The test writes the file **itself** so the race is not required to
      // reproduce. A regression test that needs to lose a race to fire is not a
      // regression test.
      //
      // The name is this file's alone (finding 133). Sharing one path with
      // `type-miss-probe.test.ts` meant this test's setup asserted a property of
      // that file's progress, and it failed on its own premise when the two
      // overlapped under full-suite scheduling.
      timeout: RULE_TIMEOUT_MS,
    }, () => {
      // This file's own scratch module, with a name no other file uses.
      //
      // Finding 133. The precondition below -- "the harness must not exist" --
      // used to be a claim about *another test file's* progress, because
      // `type-miss-probe.test.ts` held the identical path
      // `scripts/.probe-figures-harness.mjs` for the duration of two of its
      // tests. vitest runs files in parallel, so when the two overlapped this
      // test failed on its own premise with `the harness must not exist before
      // this test: expected true to be false`. Zero races in 8 paired runs and
      // one in a full-suite run is the signature of a scheduling window rather
      // than a logic error, which is why it survived until now.
      //
      // The repair is not a wider assertion. A test whose setup asserts a
      // property of a file another test owns is measuring the scheduler; the
      // path is now exclusive to this file, which is why the precondition is
      // true by construction.
      const harness = resolve(ROOT, 'scripts', '.probe-figures-harness-gate-sites.mjs');
      expect(existsSync(harness), 'the harness must not exist before this test').toBe(false);
      writeFileSync(harness, '// scratch\n');
      try {
        const fresh = spawnSync(
          process.execPath,
          [resolve(ROOT, 'scripts', 'derive-gate-sites.mjs'), '--stdout'],
          { encoding: 'utf8', cwd: ROOT },
        );
        expect(fresh.status).toBe(0);
        const derived = JSON.parse(fresh.stdout) as Inventory;
        // The count is a published number and must not move for a file that is
        // not part of the artefact the inventory describes.
        expect(derived.scanned).toBe(committed.scanned);
        // And no site may name it: a dotfile is not a script that ships.
        expect(derived.sites.filter((s) => s.script.includes('.probe-figures'))).toEqual([]);
      } finally {
        rmSync(harness, { force: true });
      }
    });

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
