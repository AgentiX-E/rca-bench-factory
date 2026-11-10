import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
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
 *      `execSync`/`spawn`/`execFile`/`exec` call whose argument list names the
 *      script.
 *
 * The asynchronous spellings were added in v3.12, and the reason is not tidiness.
 * Until then a file could only be inferred as driving a script if it spawned it
 * **synchronously** -- and the corpus's slowest proof files were exactly the ones
 * that did, because a synchronous spawn is a blocked event loop. Converting
 * `check-cli-reference.test.ts` to `execFile` therefore made rule 7 report the
 * site as `declares it but never spawns it`, so the rule quietly required the
 * defect that `docs/audit/volume-09.md` records: a test file whose children total
 * more than 60 seconds of blocked loop, after which vitest exits non-zero with
 * every test passing. A rule about *evidence* had become a rule about *blocking*.
 * The set of spellings is one value (`SPAWN_CALL`) so the two places that read it
 * cannot drift apart again.
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
 *
 * ## Rules 8, 9 and 10, added later and stated here for the same reason
 *
 * Rule 8 (v3.45) is the **throw partition**: every `throw` statement, classified
 * four ways, proved or exempt, with the four counts reconciled against the rows.
 * Its long-form account sits above the code that implements it.
 *
 * Rule 9 (v3.50) is the **held statement**: an exempt throw must state the claim
 * its exemption rests on and name the test that measures it, because a `reason`
 * is prose and prose cannot fail. Its account sits above the block that tests it,
 * and its limit is stated there too -- the rule checks that the title exists, not
 * that the assertion inside it is the claim.
 *
 * Rule 10 (v3.51) is the **falsifier**: an exempt throw must name an edit that makes
 * its claim false, and `verify-claims-are-sensitive.mjs` applies that edit and requires
 * the named test to go red. Rule 9 made the exemption point at a title; this makes the
 * title point at a change. What it still cannot do is read the assertion -- a test that
 * goes red for the wrong reason passes -- which is why the battery distinguishes a red
 * on an assertion, a red on the code's own guard, and a run that broke the tree.
 *
 * ## Rule 11 -- a failure site does not print its success line
 *
 * The last rule here is about the instrument rather than about the tree, and it was written
 * because the gate this round added recorded the wrong diagnostic for its own failure site.
 * `derive-gate-sites.mjs` takes the nearest printed string above a site, which is a lexical
 * answer to a question about control flow: a gate that prints `<script>: OK (...)` before
 * branching on its problems gets that line recorded as what it says when it *fails*.
 *
 * The rule is narrow because the evidence is: every gate in this directory announces success
 * as `<script>: OK (` and failure as `<script>: FAILED`, so a colon followed by `OK` is a
 * success line. It cannot judge an assembled message and it would miss the word "OK" in the
 * middle of a sentence; what it catches is the shape this repository writes.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/**
 * The budget for this file, applied once to the suite below.
 *
 * Stated rather than inherited, because vitest's five-second default is not a
 * measurement of anything. Each spawn was measured standalone at well under a
 * second (`derive-gate-sites` is a directory walk plus one file write), so this
 * is an order-of-magnitude bound on a hang, not a near-miss tuning.
 *
 * ## Why it is now applied to the suite and not to the test that needed it
 *
 * It used to be passed by hand at the one test that spawns the deriver, which
 * left the file's other thirty-two tests on the default. CI run `40796343743`
 * (commit `700f1cdd4`) reported three of them as `Test timed out in 5000ms`:
 *
 *     rule 6 · rejects a site that is both proved and exempt
 *     rule 6 · reports the shipped tree as clean when run through the same function
 *     rule 7 · accepts the shipped tree, so the rule is not merely strict
 *
 * Those three are exactly the ones that call `pointerRoot()` and validate all 89
 * sites against it, and measured under v8 coverage they take 4 ms, 50 ms and
 * 44 ms -- the whole file is 476 ms of test time. The next run of the same bytes
 * (`29b4987d9`, documentation only) was green. A test that costs 50 ms and is
 * reported at 5000 ms was not working for five seconds; the process it ran in was
 * not being scheduled. That distinction is the whole argument: a stall belongs to
 * the process, so a budget claimed per test is a budget claimed for the one test
 * where the stall was noticed, and the next test written inherits the default.
 *
 * `timeout-budget.test.ts` now holds this row (`SUITE_BUDGET_MS`) and fails if
 * this file goes back to per-test budgets, so the decision is asserted rather
 * than remembered.
 *
 * ## The earlier defect this constant already carried
 *
 * It was **missing** on the first version of the dotfile test, which passed the
 * file as `timeout: RULE_TIMEOUT_MS` without declaring it. The suite reported it
 * as `ReferenceError: RULE_TIMEOUT_MS is not defined` at *collect* time, so the
 * whole file failed as a suite and took its other 28 tests with it -- the failure
 * names one line and hides the file. It was found by `measure-doc-counts.mjs`,
 * which spawns `pnpm test` and therefore ran the suite in a state a targeted
 * `vitest run <file>` does not reproduce. `timeout-budget.test.ts` reads this
 * file too and did not catch it: the reader scans for budgets, and a budget that
 * is *missing* is not a value it can see. That half of the gap is still open --
 * a missing declaration is invisible to a reader that looks for declarations,
 * and only a second input (the suite run itself) can see it.
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
  verdict?: string;
  status?: string;
  provedBy?: string;
  reason?: string;
  /** Named here only so a site that carries them can be rejected; see rules 9 and 10. */
  statement?: string;
  heldBy?: HeldBy;
  mutant?: Mutant;
}

/**
 * The test that holds an exemption's statement.
 *
 * A throw exemption says "no test can reach this line, because X"; that sentence
 * is the reason, and prose cannot fail. Rule 9 requires the row to state a claim
 * a test could check and to name the test that checks it, so deleting that test
 * reds the gate instead of leaving a sentence standing.
 */
interface HeldBy {
  file: string;
  test: string;
}

/** One throw statement, with the disposition the derivation gave it. */
interface Throw {
  script: string;
  line: number;
  disposition: 'fatal' | 'unguarded' | 'guarded' | 'rethrow';
  message?: string;
  status?: string;
  provedBy?: string;
  /** What the exemption claims, in one sentence a test can falsify. */
  statement?: string;
  /** The test that holds the statement; see rule 9. */
  heldBy?: HeldBy;
  /** The edit that makes the statement false; see rule 10. */
  mutant?: Mutant;
  reason?: string;
}

/**
 * The edit that makes an exemption's claim false.
 *
 * `defect` is what a reader meets first: a substitution whose purpose has to be inferred
 * is a substitution nobody will maintain, and the battery's failure message quotes it.
 */
interface Mutant {
  file: string;
  find: string;
  replace: string;
  defect: string;
}

interface Inventory {
  rule: string;
  scanned: number;
  excluded: Record<string, number>;
  sites: Site[];
  throws?: { rule: string; counts: Record<string, number>; rows: Throw[] };
}

const committed: Inventory = JSON.parse(readFileSync(INVENTORY, 'utf8'));

/**
 * The reasons a site may be exempt, each a full sentence.
 *
 * Kept as a list rather than free text so that adding an exemption is a visible
 * edit to this file: a new exempt site cannot be introduced by editing only the
 * JSON.
 */
const KNOWN_EXEMPTIONS: readonly string[] = [
  "`process.exit(withJournal('inject-component-rule', main))`, where `main()` returns non-zero when an injected rule survives, when an anchor is inert, or when a restore fails. No test executes the battery -- it spends a suite run mutating tracked files -- so nothing can be aimed at this line; emptying it is caught only as inventory drift by the deriver check, which is a static claim rather than a test driving the status.",
  "The same computed shape over the test file it targets: `main()` fails on a survivor, an inert anchor, a restore mismatch, or a suite that reported no test at all. Listed apart from its siblings because those four conditions are different ones, and one sentence covering the three batteries would claim they fail for the same reason when they do not. Exempt for the same structural reason: no test executes it.",
  "The oldest battery in the tree, and its `main()` reports four properties rather than a single count. It now runs inside the journal, which is why the line's condition reads `invokedDirectly` like its siblings' -- and why the exemption stands: the status is computed from a suite run four times over, so no test can drive this line, and emptying it would surface only as the deriver reporting a site that no longer exists.",
  'A probe rather than a gate: `main()` exits non-zero when the built modules deny fewer paths than the inventory expects. `probe-built-module-guards.test.ts` runs it and asserts on the inventory it prints, which is the stronger statement -- the exit is computed from the very numbers that test then reads.',
  '`process.exit(main())`, where `main()` decides from the ceiling it measured. `m1-ceiling-probe.test.ts` drives the probe and asserts on the number it publishes; asserting on this line instead would restate the condition the probe has already evaluated.',
  'The largest probe in the tree, and its exit aggregates several per-type counts. `type-miss-probe.test.ts` runs it and reads those counts directly, so a test pinning this line would be checking a summary of facts the test already holds.',
  "`scripts/check-official.mjs`'s enumeration gate: it exits only when a declared case is neither round-tripped, nor refused by the target's own contract, nor recorded as a failure -- and every path that drops a case records a failure first, which is the invariant the line states. So no input can be aimed at it: a run that reaches it means a path was added that drops a case silently, and there is nothing to write a fixture for. What can be tested is the arithmetic, and it is -- `roundtrip-account.test.ts` holds `accountRoundTrip` to seven cases, and the same equality is printed as `ROUNDTRIP ACCOUNTED` on every run, which is where the passing path evaluates it.",
];

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
/**
 * Every spelling of "a child process was started" this repository uses.
 *
 * `exec` and `execFile` are here for the reason the header states: rule 7 infers
 * what a file *runs*, and an asynchronous call runs the same script as the
 * synchronous one. The negative lookbehind keeps `someRegExp.exec(...)` out --
 * without it the helper scan classifies any function that matches a pattern as a
 * spawning helper and then reads the arguments of every call to it as evidence.
 */
const SPAWN_CALL = /(?<![.\w])(?:spawnSync|execFileSync|execSync|spawn|execFile|exec)\s*\(/;

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
  const calls = new RegExp(SPAWN_CALL.source, 'g');
  for (const call of body.matchAll(calls)) {
    scriptsIn(argumentList(call.index));
  }

  // Class 2: a call to a local helper that does the spawning. The helper is
  // recognised by its own *body* containing a spawn, so a call to something
  // unrelated cannot be read as a drive.
  const helpers = new Set<string>();
  for (const fn of body.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(/g)) {
    if (SPAWN_CALL.test(functionBody(fn.index))) helpers.add(fn[1]);
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
 * Whether a test file names a script in an `import` sentence.
 *
 * Static or dynamic, and both spellings are in use: `format-spec.mjs` is reached by a
 * dynamic import inside a test body, `gate-receipt.mjs` by a static one at the top.
 * The path is matched loosely -- anything ending in `scripts/<name>` -- because a
 * test file lives at a depth this rule should not have to know.
 */
function importsScript(body: string, script: string): boolean {
  const escaped = script.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Two spellings, and the second is the one this tree writes. A path that ends in
  // `scripts/<name>` is the obvious form, and it is what `published-refusals.test.ts`
  // uses for `format-spec.mjs`. A file that reaches a script through
  // `pathToFileURL(resolve(ROOT, 'scripts', '<name>'))` -- which is how the deriver's
  // own tests import it, deliberately, because a static import of a script trips
  // `scripts-are-classified` -- names the file and the directory as two string
  // literals and never as one path.
  //
  // So the second form is: the file names this script, and it loads from `scripts/`.
  // That is weaker than a path match and still not a bare mention -- a file that
  // quotes a script's name without an import sentence is rejected, which is the
  // defect rule 3 recorded.
  const direct = new RegExp(`(?:from\\s*|import\\s*\\(\\s*)['"][^'"]*scripts/${escaped}['"]`);
  if (direct.test(body)) return true;
  const names = new RegExp(`['"\`]${escaped}['"\`]`);
  return names.test(body) && /import\s*\(/.test(body) && /['"]scripts['"]/.test(body);
}

/**
 * The text of a file, read once per identity, and the two scans over it, memoised.
 *
 * ## Why this exists -- it is a cost fix, and the cost was the defect
 *
 * Every rule in this file reads a test file and scans it twice: once for the `DRIVES`
 * table (`declaredDrives`) and once for the spawn calls and the bindings that name a
 * script (`inferredDrives`, which resolves arguments by scanning parentheses). There are
 * 107 pointers in the shipped inventory, and about forty of the sixty-three tests below
 * call `violationsOf`, so one run of this file performed roughly **four thousand** reads
 * and **eight thousand** regex scans over files whose bytes had not changed since the
 * previous test.
 *
 * That did not show up as a slow test file until the suite ran under load. Measured on a
 * five-CPU box, this file -- one revision, one command -- cost:
 *
 *     alone, with coverage            11,547 ms
 *     full suite, 2 workers           14,448 ms
 *     full suite, 4 workers           23,897 / 43,895 / 47,727 ms
 *
 * The last reading is past `STALL_BUDGET_MS` (45,000) with **6,246 of 6,246 tests
 * passing**, which is the red-about-nothing that the stall gauge was built to catch: a
 * file whose own work is 11.5 s becomes a 47.7 s event-loop stall when three other
 * workers share the box, and the suite exits non-zero with nothing failing. The gauge is
 * right to fail it -- the worker's bridge deadline is a wall clock -- so the repair has
 * to be to make the file cheap enough that a loaded runner cannot push it over.
 *
 * ## Two caches, and why each one is correct rather than merely faster
 *
 * `READS` is keyed by the file's **identity**, not by its path: a hit is only served
 * when `statSync` reports the same size and the same nanosecond mtime the entry was
 * written with. That is the invariant `make` has used for fifty years, and it means this
 * cache cannot serve bytes that are not the bytes on disk -- a test that writes a file
 * and reads it back gets the new content, because the write changes the identity. The
 * stat is a few microseconds against a read of tens of kilobytes.
 *
 * `SCANS` is keyed by the **text itself**. `declaredDrives` and `inferredDrives` are pure
 * functions of their argument, so a memo keyed by the argument cannot be stale by
 * construction: the same text has the same scans, and different text is a different key.
 *
 * Neither cache is a place where a defect can hide, which is the test this file applies to
 * every other claim in it: `analysisIsCached` below drives both and asserts that a
 * rewritten file is seen, so the identity key is exercised rather than asserted.
 */
const READS = new Map<string, { size: number; mtimeNs: number; text: string }>();
const SCANS = new Map<string, { declared: string[]; inferred: string[] }>();

/**
 * How many files have been written into the fixture root, over the whole run.
 *
 * The property that matters is "the tree is copied once", and a count is the only way to
 * observe it: a second copy of an unchanged tree leaves no trace in the tree. Exported to
 * this file's own tests below, where a regression -- deleting the early return in
 * `pointerRoot` -- doubles it.
 */
let fixtureCopies = 0;

/** The text of `path`, or `undefined` when it cannot be read as a file. */
function readSource(path: string): string | undefined {
  let size: number;
  let mtimeNs: number;
  try {
    const stats = statSync(path, { bigint: true });
    size = Number(stats.size);
    mtimeNs = Number(stats.mtimeNs);
  } catch {
    return undefined;
  }
  const cached = READS.get(path);
  if (cached !== undefined && cached.size === size && cached.mtimeNs === mtimeNs) return cached.text;
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    // A directory stats cleanly and cannot be read. It is not a source file, and an
    // entry that cached this failure would hide the file appearing later.
    return undefined;
  }
  READS.set(path, { size, mtimeNs, text });
  return text;
}

/** The two scans over one body, computed once per distinct body. */
function scansOf(body: string): { declared: string[]; inferred: string[] } {
  const cached = SCANS.get(body);
  if (cached !== undefined) return cached;
  const scans = { declared: declaredDrives(body), inferred: inferredDrives(body) };
  SCANS.set(body, scans);
  return scans;
}

/**
 * What is wrong with one `provedBy` pointer, given the script it claims to prove.
 *
 * Shared by the site list and the throw partition, because the two claims have the
 * same shape -- "this file makes this line happen" -- and a second, weaker copy of
 * the check for throws would repeat the defect rule 3 already records: a mention is
 * not an execution. Two accounts are read from the file (the declared `DRIVES` table
 * and the scripts the spawn calls actually name) and a disagreement in either
 * direction is reported rather than resolved.
 */
function proofProblems(
  where: string,
  provedBy: string,
  scriptPath: string,
  root: string,
  kind: 'exit' | 'throw' = 'exit',
): string[] {
  const problems: string[] = [];
  const script = scriptPath.split('/').pop() ?? scriptPath;
  const body = readSource(resolve(root, provedBy));
  if (body === undefined) {
    return [`${where} names ${provedBy}, which does not exist`];
  }
  if (!body.includes(script)) {
    return [`${where} names ${provedBy}, but that file never mentions ${script}`];
  }
  // Rule 7. Rule 3 above is satisfied by a mention, and a mention is not an
  // execution -- see the header for the check-official.mjs site that was
  // published as proved on a source-text regex. Both signals are required, and a
  // disagreement between them is reported rather than resolved.
  //
  // The two sides are normalised to a bare filename before comparison. `DRIVES`
  // holds repository-relative paths (`scripts/apply-pins.mjs`) and the inference
  // resolves through the file's own bindings, while `script` above is the basename
  // the inventory records. Comparing the mixed forms directly made every
  // correctly-declared file read as undeclared -- a defect in the rule, caught by
  // running it against the declarations rather than by reading it.
  const { declared, inferred } = scansOf(body);
  const declaredHere = declared.includes(script) || declared.includes(scriptPath);
  const inferredHere = inferred.includes(script) || inferred.includes(scriptPath);
  // A `throw` has a second way into a process, and it is the commoner one: a module
  // that a test **imports** and calls. `derive-gate-sites-refusals.test.ts` reaches
  // the deriver's refusals by importing `exitsIn` and handing it a broken source --
  // there is no child, no spawn and no `DRIVES` entry, and the claim is still true.
  //
  // So an import sentence is evidence for a throw and not for an exit. It is not a
  // weaker check: `verify-site-proofs.mjs` measures the same claim with a loader that
  // rewrites the statement, in whichever of the two ways the file reaches it.
  if (kind === 'throw' && !declaredHere && !inferredHere && importsScript(body, script)) {
    return problems;
  }
  if (!declaredHere && !inferredHere) {
    problems.push(
      `${where}: ${provedBy} neither declares ${script} in DRIVES nor spawns it, ` +
        `so the site is named rather than executed`,
    );
  } else if (declaredHere !== inferredHere) {
    const side = declaredHere ? 'declares it but never spawns it' : 'spawns it but does not declare it';
    problems.push(`${where}: ${provedBy} ${side} (${script}), so the two accounts disagree`);
  }
  return problems;
}

/**
 * Rule 9 -- does the named test exist, and does it carry that title?
 *
 * An exemption is a sentence about why no test can reach a line, and a sentence
 * cannot fail. So every exempt throw must also state a **claim** and name the
 * test that measures it. This function checks the part a machine can: the file
 * resolves, it is a test file, and it carries a test with exactly that title.
 * Whether the assertion inside it really holds the claim is not decidable here,
 * and is stated as the rule's limit rather than papered over.
 *
 * Deliberately *not* required: that the test file mentions the script. The claim
 * an exemption makes is about the code's invariant -- the pack's paths are
 * unique, the classifier's return set is closed -- and the honest test often
 * lives where the function lives rather than where the script lives. Rule 3's
 * mention test would reject every such proof, so heldBy asks a different
 * question: does this title exist, in a real test file, and does no other
 * exemption claim the same one (checked once over the whole table).
 */
function holdProblems(where: string, heldBy: HeldBy, root: string): string[] {
  const problems: string[] = [];
  if (typeof heldBy.file !== 'string' || heldBy.file.length === 0) {
    return [`${where} names no file to hold its statement`];
  }
  if (typeof heldBy.test !== 'string' || heldBy.test.trim().length === 0) {
    return [`${where} names no test to hold its statement`];
  }
  if (!heldBy.file.endsWith('.test.ts')) {
    problems.push(`${where} is held by ${heldBy.file}, which is not a test file`);
  }
  const body = readSource(resolve(root, heldBy.file));
  if (body === undefined) {
    return [...problems, `${where} is held by ${heldBy.file}, which does not exist`];
  }
  // The title must be a test's own name, not a phrase in a comment. All three
  // quote styles occur in this suite, and `it(` is often followed by a newline and
  // an indented title, so the match allows whitespace and requires the closing
  // quote to be the one that opened: the delimiter is what makes "the string
  // appears somewhere" into "a test is called this".
  const escaped = heldBy.test.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const named = new RegExp(`(?:^|[^\\w.])(?:it|test)\\(\\s*(['"\`])${escaped}\\1`).test(body);
  if (!named) {
    problems.push(`${where} is held by ${heldBy.file}, which carries no test titled '${heldBy.test}'`);
  }
  return problems;
}

/**
 * Rule 10 -- is the named mutation still an edit this tree can make?
 *
 * Rule 9 establishes that a test with the right title exists. It cannot establish that
 * the assertion inside it is the claim, and no reader can: semantics are not decidable
 * from an inventory. What *can* be established is the other end of the same sentence --
 * that a **change to the code the claim is about** makes it false. That is what
 * `verify-claims-are-sensitive.mjs` runs, and this function is the half that needs no
 * child process: the substitution has to still apply.
 *
 * Three ways it stops applying, and they are the three this refuses. The file is gone;
 * the `find` text no longer occurs, or occurs more than once (a mutant that fires in two
 * places measures two claims and reports one); the `find` and `replace` are the same, so
 * the "mutation" leaves the tree alone and the claim can never be falsified. The `defect`
 * clause is required for a reason the other rules also use: a mutation whose purpose has
 * to be guessed is a mutation the next round deletes.
 *
 * Deliberately *not* required: that the mutant lives in the script that contains the
 * throw. For the pack's two claims the throw is in the build script and the defect is in
 * the function it calls, which is where the claim lives.
 */
function mutantProblems(where: string, mutant: Mutant, root: string): string[] {
  const problems: string[] = [];
  if (typeof mutant.file !== 'string' || mutant.file.length === 0) {
    return [`${where} names no file to mutate`];
  }
  if (typeof mutant.find !== 'string' || mutant.find.length === 0) {
    return [`${where} names no text to replace, so its mutation would change nothing`];
  }
  if (typeof mutant.replace !== 'string' || mutant.replace === mutant.find) {
    return [`${where} mutates text into itself, so the tree it measures is the tree it read`];
  }
  if (typeof mutant.defect !== 'string' || mutant.defect.trim().length <= 40) {
    problems.push(
      `${where} names a mutation whose defect is unexplained in ${String(mutant.defect ?? '').length} ` +
        'characters, so the edit and its purpose cannot be reviewed together',
    );
  }
  if (mutant.file.endsWith('.test.ts')) {
    problems.push(`${where} mutates ${mutant.file}, a test, so the red run would be about the test file`);
  }
  const body = readSource(resolve(root, mutant.file));
  if (body === undefined) {
    return [...problems, `${where} mutates ${mutant.file}, which does not exist`];
  }
  const occurrences = body.split(mutant.find).length - 1;
  if (occurrences !== 1) {
    problems.push(
      `${where} mutates '${mutant.find.split('\n')[0]}' in ${mutant.file}, which occurs ` +
        `${String(occurrences)} time(s) there: a mutation has to land on exactly one site`,
    );
  }
  return problems;
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
      const pointerProblems = proofProblems(where, site.provedBy, site.script, root);
      if (pointerProblems.length > 0) {
        problems.push(...pointerProblems);
        continue;
      }
      if (site.reason !== undefined) {
        problems.push(`${where} is proved and also carries a reason, so the two accounts can disagree`);
      }
    } else if (site.status === 'exempt') {
      // Rule 9 is about throw exemptions: a site's exemption says a *process*
      // cannot be entered from a test, which is a different claim from an
      // invariant a test can hold. The columns are refused here rather than
      // ignored, so half-applying the convention is visible instead of inert.
      if (site.statement !== undefined || site.heldBy !== undefined || site.mutant !== undefined) {
        problems.push(`${where} is an exit site carrying the throw partition's exemption columns`);
      }
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

  // Rule 8 -- the throw partition.
  //
  // A throw is the other way a gate says no: Node prints the stack and exits 1, which
  // to a shell is the same refusal as `process.exit(1)`. The tree holds 41 of them and
  // the inventory published none before v3.45, so this rule is what keeps the second
  // half of the table from going stale in silence.
  //
  // Every row is proved or exempt, and which of the two is a claim the row states.
  //
  // v3.45 published these rows with a disposition and nothing else, and forty of the
  // forty-one read as "fine" while meaning "no test has ever executed this line". A
  // census over the suite found **twenty** of them unreached. Twelve of those could be
  // aimed at and now are (`published-refusals.test.ts`, `derive-gate-sites-refusals.
  // test.ts`, `build-example-bundle.test.ts`); nine cannot be, and each carries the
  // sentence saying why; one was reachable only through a *defect* and is now a
  // diagnosis instead.
  //
  // Only `fatal` still has to be proved: the other three dispositions do not end a
  // process, so proving one is a claim that a test reaches the line, not that the line
  // refuses. That is the claim `verify-site-proofs.mjs` measures for both.
  const throwRows = inventory.throws?.rows ?? [];
  const tally: Record<string, number> = { fatal: 0, unguarded: 0, guarded: 0, rethrow: 0 };
  const statements: string[] = [];
  const holdings: string[] = [];
  const mutants: string[] = [];
  for (const row of throwRows) {
    const where = `${row.script}:${row.line}`;
    if (!(row.disposition in tally)) {
      problems.push(`${where} has disposition '${String(row.disposition)}', which is none of the four`);
      continue;
    }
    tally[row.disposition] += 1;
    if (row.message === undefined || row.message.length === 0) {
      problems.push(`${where} is a throw with no message, so the row is a bare coordinate`);
    }
    if (row.disposition === 'fatal' && row.status !== 'proved') {
      problems.push(`${where} is a fatal throw with status '${String(row.status)}', so nothing proves it`);
      continue;
    }
    if (row.status === 'proved') {
      if (typeof row.provedBy !== 'string' || row.provedBy.length === 0) {
        problems.push(`${where} is proved but names no test`);
        continue;
      }
      problems.push(...proofProblems(where, row.provedBy, row.script, root, 'throw'));
      if (row.reason !== undefined) {
        problems.push(`${where} is proved and also carries a reason, so the two accounts can disagree`);
      }
      if (row.statement !== undefined || row.heldBy !== undefined) {
        problems.push(
          `${where} is proved and also carries an exemption's claim, so the row says a test arrives ` +
            'and that none can',
        );
      }
      if (row.mutant !== undefined) {
        problems.push(
          `${where} is proved and also names a mutation, so the row says a test reaches the exit ` +
            'and that the exit is only an exemption',
        );
      }
    } else if (row.status === 'exempt') {
      if (row.provedBy !== undefined) {
        problems.push(`${where} is exempt and also names a test, which is the state rule 2 forbids`);
      }
      if (typeof row.reason !== 'string') {
        problems.push(`${where} is exempt without a reason`);
        continue;
      }
      if (row.reason.length <= 40) {
        problems.push(`${where} exempts itself in ${row.reason.length} characters: '${row.reason}'`);
      }
      // Rule 9 -- the exemption names the test that holds its statement.
      if (typeof row.statement !== 'string' || row.statement.trim().length <= 20) {
        problems.push(
          `${where} is exempt without stating a claim a test could hold, so the reason is the only account`,
        );
      } else {
        statements.push(row.statement);
      }
      if (row.heldBy === undefined) {
        problems.push(`${where} is exempt without naming the test that holds its statement`);
      } else {
        problems.push(...holdProblems(where, row.heldBy, root));
        holdings.push(`${row.heldBy.file}\u0000${row.heldBy.test}`);
      }
      // Rule 10 -- the claim has an edit that makes it false.
      if (row.mutant === undefined) {
        problems.push(
          `${where} is exempt without naming a mutation that would make its claim false, so the ` +
            'claim is a sentence a title points at rather than a measurement',
        );
      } else {
        problems.push(...mutantProblems(where, row.mutant, root));
        mutants.push(`${row.mutant.file}\u0000${row.mutant.find}`);
      }
    } else {
      problems.push(
        `${where} is a ${row.disposition} throw with status '${String(row.status)}', which is neither ` +
          'proved nor exempt -- so the row says nothing about whether a test reaches it',
      );
    }
  }
  if (throwRows.length === 0) {
    problems.push('the throw partition is empty, so every throw in the tree is outside the inventory');
  }
  if (JSON.stringify(tally) !== JSON.stringify(inventory.throws?.counts)) {
    problems.push(
      `the throw partition does not add up: counts say ${JSON.stringify(inventory.throws?.counts)}, ` +
        `the rows hold ${JSON.stringify(tally)}`,
    );
  }

  // Rule 9's second half: one claim, one holding test. Two exemptions pointing at
  // the same test means one of them is held by a test written for the other --
  // which is exactly the state a pasted-down column produces, one layer out from
  // the repeated-`reason` check below.
  const repeatedStatement = statements.filter((text, i) => statements.indexOf(text) !== i);
  if (repeatedStatement.length > 0) {
    problems.push(`repeated exemption statement: '${repeatedStatement[0]}'`);
  }
  const repeatedHold = holdings.filter((key, i) => holdings.indexOf(key) !== i);
  if (repeatedHold.length > 0) {
    problems.push(
      `two throw exemptions are held by the same test (${String(repeatedHold[0]).split('\u0000').join(' · ')}), ` +
        'so one claim is measured by a test written for the other',
    );
  }

  const duplicates = reasons.filter((reason, i) => reasons.indexOf(reason) !== i);
  if (duplicates.length > 0) {
    problems.push(`repeated exemption reason: '${duplicates[0]}'`);
  }

  // Rule 10's second half: one claim, one falsifier. Two rows naming the same edit mean
  // one substitution is counted as the falsifier of two sentences -- the pasted-down
  // column shape one layer out -- and the battery would apply one mutation and credit
  // two claims with noticing it.
  const repeatedMutant = mutants.filter((key, i) => mutants.indexOf(key) !== i);
  if (repeatedMutant.length > 0) {
    problems.push(
      `two throw exemptions name the same mutation (${String(repeatedMutant[0]).split('\u0000').join(' \u00b7 ')}), ` +
        'so one edit is counted as falsifying two claims',
    );
  }

  // Rule 11 -- a failure site's diagnostic is not a success line.
  //
  // The inventory records, for every site, the string the site prints. The deriver finds
  // that string by walking backwards to the nearest printed literal, which is a lexical
  // answer to a question that is about control flow: a gate whose failure branch sits
  // *after* its success branch gets its success line recorded. Measured on the gate this
  // rule was written beside, the deriver wrote
  //
  //     scripts/check-repository-table.mjs:408  check-repository-table: OK (${...}
  //
  // as the diagnostic of a site that only executes when the table is wrong -- so the
  // inventory would have published "this is where the repository says its table is right"
  // as "this is where it fails". Nothing could see it: the annotation was carried, the
  // proof resolved, and the site was counted.
  //
  // The test is narrow on purpose. Every gate in this directory announces success as
  // `<script>: OK (` and failure as `<script>: FAILED`, so a colon followed by `OK` is a
  // success line. That would miss a diagnostic reading "OK" in the middle of a sentence and
  // it cannot tell a hand-written message from an assembled one; what it catches is the
  // shape this repository actually writes, which is the only shape it can be wrong about.
  for (const [where, rows] of [
    ['site', inventory.sites.map((site) => ({ at: `${site.script}:${String(site.line)}`, text: site.diagnostic }))],
    [
      'throw row',
      (inventory.throws?.rows ?? []).map((row) => ({ at: `${row.script}:${String(row.line)}`, text: row.message })),
    ],
  ] as const) {
    for (const row of rows) {
      if (row.text === undefined) continue;
      if (!/:\s*OK\b/.test(row.text)) continue;
      problems.push(
        `${row.at} (${where}) records '${row.text}' as its diagnostic, which is a success line: the ` +
          'deriver takes the nearest printed string above a site, so a failure branch written after ' +
          'the success branch publishes the success line as what the site says when it fails',
      );
    }
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

/** Write an inventory whose throw partition is replaced, leaving the sites alone. */
function withThrows(rows: Throw[], counts: Record<string, number>, name: string): string {
  const dir = join(scratch, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'gate-sites.json'),
    JSON.stringify({ ...committed, throws: { rule: committed.throws?.rule ?? '', counts, rows } }, null, 2),
  );
  return dir;
}

/**
 * The scratch root every pointer resolves in, copied once.
 *
 * Copying it is the file's largest single cost and it was paid twenty-nine times. Measured
 * on the tree this cache was added to, one copy is about a hundred and ten files and the
 * twenty-nine calls are the whole of the gap between this file's 9.6 s and the under-a-
 * second reading its CPU time (820 ms) says it should have: the copies are I/O, and I/O
 * is what a loaded box multiplies. Twenty-nine copies of an unchanged tree is twenty-eight
 * of them wasted.
 *
 * Correct because the input cannot change: these are copies of tracked source files, and
 * nothing in this suite writes to the repository. A test that needs a *different* file
 * writes its own under its own directory (`withInventory`, `withThrows`), which is why
 * this root can be a singleton while those cannot.
 */
function pointerRoot(): string {
  const dir = join(scratch, 'pointer-root');
  if (existsSync(dir)) return dir;
  const pointers = [
    ...committed.sites.map((site) => site.provedBy),
    ...(committed.throws?.rows ?? []).map((row) => row.provedBy),
    // A holding test is read by rule 9 the same way a proof is read by rules 3
    // and 7, so the fixture root has to carry those files too -- otherwise every
    // exemption reads as "held by a file that does not exist" against the copy.
    ...(committed.throws?.rows ?? []).map((row) => row.heldBy?.file),
    // Rule 10 reads the mutant's target the same way, so the copy carries those too.
    ...(committed.throws?.rows ?? []).map((row) => row.mutant?.file),
  ];
  for (const provedBy of pointers) {
    if (provedBy === undefined) continue;
    const target = join(dir, provedBy);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(resolve(ROOT, provedBy), target);
    fixtureCopies += 1;
  }
  return dir;
}

/** The fixture's copy count, for the test that holds "once per run" rather than asserting it. */
export function fixtureCopyCount(): number {
  return fixtureCopies;
}

// The options object is spelled on its own lines rather than in the tidy
// `describe(name, { timeout }, fn)` one-liner, because the one-liner moves the
// closing paren and every one of this suite's 480 lines one level to the right.
// A diff that reindents the file to add a number is a diff nobody can read, and
// the decision being recorded here is the number, not the layout.
describe('golden-master/gate-sites.json · the inventory is read, not just written', {
  timeout: RULE_TIMEOUT_MS,
}, () => {
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
      const committedShape = committed.sites.map(
        ({ status, provedBy, statement, heldBy, mutant, reason, ...rest }) => rest,
      );
      expect(committedShape).toEqual(derivedShape);
      expect(committed.scanned).toBe(derived.scanned);
      expect(committed.excluded).toEqual(derived.excluded);

      // The throw partition is a second half of the same table, and it drifted in
      // exactly the same way before it existed: the tree held 41 throw statements and
      // the inventory published none of them. Comparing only `sites` here would let
      // the new half go stale in silence, which is the defect this rule exists for.
      const bare = (row: Throw) => ({
        script: row.script,
        line: row.line,
        disposition: row.disposition,
        message: row.message,
      });
      expect((committed.throws?.rows ?? []).map(bare)).toEqual((derived.throws?.rows ?? []).map(bare));
      expect(committed.throws?.counts).toEqual(derived.throws?.counts);
    });

    it('records the derivation rule it was produced under', () => {
      expect(committed.rule).toContain('process.exit');
      // v3.44 replaced "not the literal zero" with "not a known zero": the rule
      // stopped asking how the argument is spelled and started asking what the
      // process exits with, which is also why a call with no argument at all is a
      // success exit rather than a site.
      expect(committed.rule).toContain('not a known zero');
      expect(committed.rule).toContain('no argument at all is zero');
      // The partition is part of the rule, not a detail of the implementation: a
      // reader who subtracts the tallies from the tree is relying on it.
      expect(committed.rule).toContain('partition');
      // And so is the refusal: a reader who sees no `exitCode` row is entitled to
      // know that the deriver would have stopped rather than skipped it.
      expect(committed.rule).toContain('refused');
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

  /**
   * The rule the deriver reads was written as `process.exit(1)` -- a **literal** --
   * and everything else went into `excluded`. So the scripts that report their
   * verdict by *computing* it were outside the site list, and the site list is the
   * only mechanism in this repository that asks whether a failure exit is proved.
   *
   * The set is not hypothetical. `process.exit(main())` is how every battery here
   * reports, and `process.exit(cond ? 0 : 1)` is how the two `inject-*` gates do;
   * measured, **eight scripts fail with a status the deriver could not see**, and
   * three of them are batteries the pipeline runs on every push.
   *
   * > **"A gate" is a property -- it exits non-zero when it is unhappy -- and the
   * > enumeration was reading a spelling instead.** That is the same defect as a
   * > guard whose subject is the document where it says "section" (finding 168),
   * > one level up: this time the subject was the *file* the guard was about.
   */
  describe('rule 4 · a failure exit is a failure exit however its status is spelled', () => {
    it('gives a computed or non-1 exit a site rather than an exclusion', () => {
      const scripts = new Set(committed.sites.map((s) => s.script));
      for (const script of [
        'scripts/inject-stability.mjs',
        'scripts/inject-component-rule.mjs',
        'scripts/inject-m1-ceiling-tests.mjs',
        'scripts/probe-m1-ceiling.mjs',
        'scripts/fetch-official.mjs',
      ]) {
        expect(scripts.has(script), `${script} exits non-zero and has no site`).toBe(true);
      }
    });

    it('keeps a zero exit out of the site list, which is what makes the rule a rule', () => {
      // The subject is "exits that mean failure", not "every exit". A deriver that
      // collected `process.exit(0)` too would make every script a gate and the
      // inventory would stop distinguishing anything.
      expect(committed.excluded.zero).toBeGreaterThan(0);
      expect(committed.sites.length).toBeGreaterThan(0);
      expect(committed.excluded.zero).toBeLessThan(committed.scanned);
    });

    it('no longer reports a computed tally, because nothing is dropped for being computed', () => {
      expect(committed.excluded.computed).toBeUndefined();
    });

    it('accounts for every statement-position exit as a site or as an exclusion', () => {
      // The two tallies must stay disjoint and their sum must be the whole: an
      // enumeration that prints only what it kept cannot be checked against what
      // it threw away, which is the defect `excludedIn` exists to prevent.
      const excludedTotal = Object.values(committed.excluded).reduce((a, b) => a + b, 0);
      expect(committed.scanned).toBeGreaterThan(0);
      expect(committed.sites.length + excludedTotal).toBeGreaterThan(committed.scanned);
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
      // The two shapes that are deliberately **not** failure sites: a success
      // exit, and one an indirect call makes. A computed argument and a non-`1`
      // numeric status used to be here as well; they are sites now, which is why
      // this list is asserted **by name** rather than by total -- a shape moving
      // out of `excluded` and into `sites` is exactly the change worth seeing, and
      // a count would have hidden it.
      //
      // `multiline` was the third and is gone. It counted "an exit whose argument
      // spans lines", which a line-shaped reader could not parse and a tree reader
      // cannot even express: a spanning call is an ordinary site. It read 0 for
      // every round it existed, and a tally that is structurally always zero is a
      // measurement only of the reader's own limitation.
      expect(Object.keys(committed.excluded)).toEqual(['zero']);
      for (const count of Object.values(committed.excluded)) {
        expect(typeof count).toBe('number');
      }
      expect(committed.scanned).toBeGreaterThan(0);
    });

    it('gives every site a diagnostic or the expression that decides its status', () => {
      // A bare coordinate is unreadable, which is why this rule exists. The two
      // sites added in v3.44 have no message of their own -- `main()` printed it,
      // in the function that returned the code -- so they carry `verdict` instead:
      // the expression whose value becomes the status.
      const unreadable = committed.sites.filter(
        (s) => s.diagnostic === undefined && s.verdict === undefined,
      );
      expect(unreadable).toEqual([]);
    });

    it('publishes a verdict only where a diagnostic is missing, and both are stable text', () => {
      const both = committed.sites.filter(
        (s) => s.diagnostic !== undefined && s.verdict !== undefined,
      );
      expect(both).toEqual([]);
      const verdicts = committed.sites.filter((s) => s.verdict !== undefined);
      expect(verdicts.length).toBeGreaterThan(0);
      for (const site of verdicts) {
        expect(site.verdict).not.toBe('');
        expect(site.verdict).not.toMatch(/\s{2,}/);
      }
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

    it('rejects a fatal throw with nothing proving it', () => {
      // The one shape the partition published in v3.45 has to earn: a top-level throw
      // ends the process, so it is proved like a site. Stripping the proof must be
      // reported rather than accepted.
      const rows = (committed.throws?.rows ?? []).map((row) =>
        row.disposition === 'fatal' ? { ...row, status: undefined, provedBy: undefined } : row,
      );
      const dir = withThrows(rows, committed.throws?.counts ?? {}, 'throw-unproved');
      expect(violationsOf(JSON.parse(readFileSync(join(dir, 'gate-sites.json'), 'utf8')), pointerRoot())).toContainEqual(
        expect.stringContaining('fatal throw with status'),
      );
    });

    it('rejects an exemption that also names a test, which is two accounts of one line', () => {
      // v3.45 published the throw partition with a disposition and nothing else, and
      // this corruption is what that looked like once the rows had to say something:
      // an `exempt` row keeps its sentence and grows a `provedBy`, so the row claims
      // both "no test can reach this" and "this test reaches it". Rule 2 forbids the
      // pair, and the same guard has to cover both partitions.
      const rows = (committed.throws?.rows ?? []).map((row) =>
        row.status === 'exempt'
          ? { ...row, provedBy: 'packages/core/test/ci-budget.test.ts' }
          : row,
      );
      const dir = withThrows(rows, committed.throws?.counts ?? {}, 'throw-exempt-proved');
      expect(violationsOf(JSON.parse(readFileSync(join(dir, 'gate-sites.json'), 'utf8')), pointerRoot())).toContainEqual(
        expect.stringContaining('is exempt and also names a test'),
      );
    });

    it('rejects a proved throw that also carries a reason', () => {
      // A `provedBy` and a `reason` are opposite claims about the same line: one says
      // a test arrives, the other says why none can. A row carrying both would pass
      // either check on its own, so the pair is rejected rather than resolved.
      const rows = (committed.throws?.rows ?? []).map((row) =>
        row.status === 'proved'
          ? { ...row, reason: 'This sentence is long enough to satisfy the exemption length guard.' }
          : row,
      );
      const dir = withThrows(rows, committed.throws?.counts ?? {}, 'throw-proved-reason');
      expect(violationsOf(JSON.parse(readFileSync(join(dir, 'gate-sites.json'), 'utf8')), pointerRoot())).toContainEqual(
        expect.stringContaining('is proved and also carries a reason'),
      );
    });

    it('rejects a throw row that says neither proved nor exempt', () => {
      // This is the state all forty-one rows shipped in before v3.46. Publishing a
      // disposition is not a statement about execution, so a row without a status is
      // the silence the rule exists to refuse -- and it has to be refused even when
      // the row is a `rethrow`, which no rule ever obliges to be proved.
      const rows = (committed.throws?.rows ?? []).map((row): Throw => {
        if (row.disposition !== 'rethrow') return row;
        const bare: Record<string, unknown> = { ...row };
        delete bare.status;
        delete bare.provedBy;
        delete bare.reason;
        return bare as unknown as Throw;
      });
      const dir = withThrows(rows, committed.throws?.counts ?? {}, 'throw-silent');
      expect(violationsOf(JSON.parse(readFileSync(join(dir, 'gate-sites.json'), 'utf8')), pointerRoot())).toContainEqual(
        expect.stringContaining('so the row says nothing about whether a test reaches it'),
      );
    });

    it('rejects a partition whose counts do not add up to its rows', () => {
      // The whole point of publishing `counts` beside `rows` is that the two can
      // disagree. If nothing compares them, `counts` is decoration.
      const counts = { ...(committed.throws?.counts ?? {}), unguarded: 0 };
      const dir = withThrows(committed.throws?.rows ?? [], counts, 'throw-counts');
      expect(violationsOf(JSON.parse(readFileSync(join(dir, 'gate-sites.json'), 'utf8')), pointerRoot())).toContainEqual(
        expect.stringContaining('does not add up'),
      );
    });

    it('rejects an empty partition, which is the state the inventory was in before v3.45', () => {
      const dir = withThrows([], { fatal: 0, unguarded: 0, guarded: 0, rethrow: 0 }, 'throw-empty');
      expect(violationsOf(JSON.parse(readFileSync(join(dir, 'gate-sites.json'), 'utf8')), pointerRoot())).toContainEqual(
        expect.stringContaining('throw partition is empty'),
      );
    });

    it('rejects a throw with no message, because a coordinate is not a claim', () => {
      const rows = (committed.throws?.rows ?? []).map((row) =>
        row.disposition === 'rethrow' ? { ...row, message: undefined } : row,
      );
      const dir = withThrows(rows, committed.throws?.counts ?? {}, 'throw-silent');
      expect(violationsOf(JSON.parse(readFileSync(join(dir, 'gate-sites.json'), 'utf8')), pointerRoot())).toContainEqual(
        expect.stringContaining('bare coordinate'),
      );
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
      // The harness goes into a **copy** of `scripts/`, not into `scripts/`.
      //
      // Finding 219. This test used to write `scripts/.probe-figures-harness-gate-sites.mjs`
      // and remove it in a `finally`, and finding 133's repair had already given it a name
      // no other test used. That fix addressed a collision between two tests' *premises*
      // and not the interference that matters: `derive-gate-sites.mjs` and every other scan
      // of `scripts/` read that directory while the file exists, so the inventory's
      // `scanned` count moves -- this test's own comment says so ("with such a file
      // created, the deriver reports `scanned: 36`; removed, `scanned: 35`"). A file that
      // changes a concurrent reader's reading is a race whether or not its name is unique.
      // The copy is byte-identical, so the count below is still the committed one.
      const tree = mkdtempSync(join(tmpdir(), 'gate-sites-harness-'));
      try {
        cpSync(resolve(ROOT, 'scripts'), join(tree, 'scripts'), { recursive: true });
        // The deriver reads the syntax tree, so the copy has to be able to reach
        // the compiler. A copy of `scripts/` with no `node_modules` above it is
        // not a tree that script can run -- the first version of this round's
        // change failed here with `Cannot find package 'typescript'`, which is a
        // fact about the copy rather than about the dotfile being measured.
        symlinkSync(resolve(ROOT, 'node_modules'), join(tree, 'node_modules'), 'dir');
        const harness = join(tree, 'scripts', '.probe-figures-harness-gate-sites.mjs');
        expect(existsSync(harness), 'the harness must not exist before this test').toBe(false);
        writeFileSync(harness, '// scratch\n');
        const fresh = spawnSync(
          process.execPath,
          [join(tree, 'scripts', 'derive-gate-sites.mjs'), '--stdout'],
          { encoding: 'utf8', cwd: tree },
        );
        expect(fresh.status).toBe(0);
        const derived = JSON.parse(fresh.stdout) as Inventory;
        // The count is a published number and must not move for a file that is
        // not part of the artefact the inventory describes.
        expect(derived.scanned).toBe(committed.scanned);
        // And no site may name it: a dotfile is not a script that ships.
        expect(derived.sites.filter((s) => s.script.includes('.probe-figures'))).toEqual([]);
      } finally {
        rmSync(tree, { recursive: true, force: true });
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

/**
 * Rule 9 -- an exemption names the test that holds its statement.
 *
 * ## The defect this rule answers
 *
 * Rule 4 asks an exemption to be longer than forty characters and distinct from
 * its neighbours. That is a rule about **prose**, and prose cannot fail: the six
 * throw exemptions shipped through v3.49 each carried a paragraph explaining why
 * no test could reach the line, and none of them named the test that measures the
 * claim the paragraph makes. `probe-m1-ceiling.mjs:118`'s reason said "`includes`
 * over the same objects is exact, so the partition cannot fail to cover the
 * dataset" -- and a test in `m1-ceiling-probe.test.ts` had been asserting exactly
 * that for four rounds. The inventory simply did not say so.
 *
 * So the rule is not "an exemption needs a better sentence". It is: **state the
 * claim, and name the test that measures it**. Where a claim was already held,
 * naming it costs one line of JSON; where it was not, writing the test found the
 * gaps this round closed (`build-example-bundle.test.ts` measured neither the
 * uniqueness of the pack's paths nor that the example tree is flat, so a nested
 * example file would have vanished from the download without a word;
 * `type-miss-probe.test.ts` compared three counts against three recomputed counts
 * without ever asserting that `classify` is total).
 *
 * ## What it can and cannot establish
 *
 * It establishes that the file resolves, that it is a test file, that a test with
 * exactly that title exists, and that no two exemptions name the same test. It
 * does **not** establish that the assertions inside that test really hold the
 * claim -- that is not decidable from the inventory, and it is stated as the
 * rule's limit rather than papered over. What it does establish is that deleting
 * the test, renaming it, or pointing two claims at one test reds this gate, which
 * is the difference between a sentence and a commitment.
 *
 * Unlike rule 3, `heldBy` does not require the file to mention the script. The
 * claim is about an invariant, and the honest test often lives where the function
 * lives -- `score.test.ts` holds the four published checks for a probe it never
 * spawns, and that is the right place for it.
 */
describe('rule 9 · an exemption names the test that holds its statement', {
  timeout: RULE_TIMEOUT_MS,
}, () => {
  const exempt = (): Throw[] => (committed.throws?.rows ?? []).filter((row) => row.status === 'exempt');

  it('accepts the shipped tree, so the rule is not merely strict', () => {
    // The negative control, and the reason this block is worth reading: every one
    // of the six exemptions resolves, carries a statement, and names a test that
    // exists under that exact title.
    const problems = violationsOf(committed, ROOT).filter(
      (problem) => problem.includes('holds its statement') || problem.includes('carries no test titled')
        || problem.includes('claim a test could hold') || problem.includes('held by'),
    );
    expect(problems).toEqual([]);
    expect(exempt().length).toBeGreaterThan(0);
  });

  it('states a claim for every exemption, rather than leaning on its reason', () => {
    // A reason explains why the line cannot be reached; a statement is what a test
    // can falsify. A row with only the first is the state this rule replaced, so
    // the field is required rather than optional -- and it is stored in the table
    // so a reader meets the claim before the explanation.
    for (const row of exempt()) {
      expect(typeof row.statement, `${row.script}:${String(row.line)}`).toBe('string');
      expect(row.heldBy, `${row.script}:${String(row.line)}`).toBeDefined();
    }
  });

  it('rejects an exemption that states no claim', () => {
    const rows = (committed.throws?.rows ?? []).map((row) =>
      row.status === 'exempt' ? { ...row, statement: undefined } : row,
    );
    const dir = withThrows(rows, committed.throws?.counts ?? {}, 'throw-no-statement');
    expect(violationsOf(JSON.parse(readFileSync(join(dir, 'gate-sites.json'), 'utf8')), pointerRoot())).toContainEqual(
      expect.stringContaining('claim a test could hold'),
    );
  });

  it('rejects an exemption that names no test at all', () => {
    // The exact shape all six shipped in: a reason, and nothing that can fail.
    const rows = (committed.throws?.rows ?? []).map((row) =>
      row.status === 'exempt' ? { ...row, heldBy: undefined } : row,
    );
    const dir = withThrows(rows, committed.throws?.counts ?? {}, 'throw-no-heldby');
    expect(violationsOf(JSON.parse(readFileSync(join(dir, 'gate-sites.json'), 'utf8')), pointerRoot())).toContainEqual(
      expect.stringContaining('without naming the test that holds its statement'),
    );
  });

  it('rejects a holding test file that does not exist', () => {
    const rows = (committed.throws?.rows ?? []).map((row) =>
      row.status === 'exempt'
        ? { ...row, heldBy: { file: 'packages/core/test/not-a-test.test.ts', test: row.heldBy?.test ?? '' } }
        : row,
    );
    const dir = withThrows(rows, committed.throws?.counts ?? {}, 'throw-heldby-missing');
    expect(violationsOf(JSON.parse(readFileSync(join(dir, 'gate-sites.json'), 'utf8')), pointerRoot())).toContainEqual(
      expect.stringContaining('which does not exist'),
    );
  });

  it('rejects a holding file that carries no test under that title', () => {
    // The half that makes the pointer a claim rather than a path: a file can exist,
    // mention the right things, and have had the test renamed out from under it.
    const rows = (committed.throws?.rows ?? []).map((row) =>
      row.status === 'exempt' && row.heldBy !== undefined
        ? { ...row, heldBy: { ...row.heldBy, test: 'a test title this repository does not carry' } }
        : row,
    );
    const dir = withThrows(rows, committed.throws?.counts ?? {}, 'throw-heldby-title');
    expect(violationsOf(JSON.parse(readFileSync(join(dir, 'gate-sites.json'), 'utf8')), pointerRoot())).toContainEqual(
      expect.stringContaining('carries no test titled'),
    );
  });

  it('rejects a holding file that is not a test file', () => {
    const rows = (committed.throws?.rows ?? []).map((row) =>
      row.status === 'exempt' && row.heldBy !== undefined
        ? { ...row, heldBy: { ...row.heldBy, file: row.script } }
        : row,
    );
    const dir = withThrows(rows, committed.throws?.counts ?? {}, 'throw-heldby-not-a-test');
    expect(violationsOf(JSON.parse(readFileSync(join(dir, 'gate-sites.json'), 'utf8')), pointerRoot())).toContainEqual(
      expect.stringContaining('which is not a test file'),
    );
  });

  it('rejects two exemptions held by the same test', () => {
    // One claim, one test. Two rows pointing at one title means one of them is
    // measured by a test written for the other -- the pasted-down column rule 4
    // catches for `reason`, one layer out. The reasons stay distinct here, so the
    // rejection can only come from rule 9.
    const held = exempt().find((row) => row.heldBy !== undefined)?.heldBy;
    expect(held).toBeDefined();
    const rows = (committed.throws?.rows ?? []).map((row) =>
      row.status === 'exempt' ? { ...row, heldBy: held } : row,
    );
    const dir = withThrows(rows, committed.throws?.counts ?? {}, 'throw-heldby-shared');
    expect(violationsOf(JSON.parse(readFileSync(join(dir, 'gate-sites.json'), 'utf8')), pointerRoot())).toContainEqual(
      expect.stringContaining('held by the same test'),
    );
  });

  it('rejects two exemptions that state the same claim', () => {
    const statement = 'The same sentence pasted down a column states nothing about either line.';
    const rows = (committed.throws?.rows ?? []).map((row) =>
      row.status === 'exempt' ? { ...row, statement } : row,
    );
    const dir = withThrows(rows, committed.throws?.counts ?? {}, 'throw-statement-repeated');
    expect(violationsOf(JSON.parse(readFileSync(join(dir, 'gate-sites.json'), 'utf8')), pointerRoot())).toContainEqual(
      expect.stringContaining('repeated exemption statement'),
    );
  });

  it('rejects a proved throw that also carries an exemption claim', () => {
    // A proved row says a test arrives; a statement-and-heldBy pair says none can
    // reach it and instead measures a claim about the code. Both in one row is two
    // accounts of the line, so the pair is refused rather than resolved.
    const rows = (committed.throws?.rows ?? []).map((row) =>
      row.status === 'proved'
        ? {
            ...row,
            statement: 'This row is proved and also states a claim no test can reach it, which cannot both hold.',
            heldBy: { file: 'packages/core/test/score.test.ts', test: 'publishes the four vocabulary checks the probe requires, one per field' },
          }
        : row,
    );
    const dir = withThrows(rows, committed.throws?.counts ?? {}, 'throw-proved-heldby');
    expect(violationsOf(JSON.parse(readFileSync(join(dir, 'gate-sites.json'), 'utf8')), pointerRoot())).toContainEqual(
      expect.stringContaining("carries an exemption's claim"),
    );
  });

  it('rejects an exit site that carries the throw partition\'s exemption columns', () => {
    // Rule 9 is scoped to throws on purpose: an exit site's exemption says a
    // *process* cannot be entered from a test, which is a different claim from an
    // invariant a test can hold. The columns are refused rather than ignored, so
    // half-applying the convention is visible instead of inert.
    const exemptSite = committed.sites.find((site) => site.status === 'exempt');
    expect(exemptSite).toBeDefined();
    const problems = violationsOf(
      {
        ...committed,
        sites: [
          {
            ...exemptSite,
            statement: 'A claim attached to a site exemption, which rule 9 does not read there.',
            heldBy: { file: 'packages/core/test/score.test.ts', test: 'publishes the four vocabulary checks the probe requires, one per field' },
          } as Site,
        ],
      },
      ROOT,
    );
    expect(problems).toContainEqual(expect.stringContaining("the throw partition's exemption columns"));
  });
});

/**
 * Rule 10 -- an exemption names the edit that makes its claim false.
 *
 * ## The defect this rule answers
 *
 * Rule 9 was a real step: the six exemptions went from paragraphs to claims with a named
 * test. It is also an **index of an index**. The row says "the test called X measures
 * this claim", and nothing checks that X's body still does -- a rename is caught, a
 * hollowed assertion is not. That gap cannot be closed by reading; the only instrument
 * that answers it is a mutation, which is why the edit is published in the row and run by
 * `verify-claims-are-sensitive.mjs`.
 *
 * ## What it checks here, and what it hands to the battery
 *
 * The half that needs no child process: the target exists, the `find` text occurs exactly
 * once, the substitution is not a no-op, the target is not a test, and the defect is
 * explained. That is enough to make a drifted mutant a red gate instead of a silent
 * no-op, which is the failure mode a table of edits actually has -- the tree moves, the
 * string does not.
 *
 * The battery is the other half: apply it and require the named test to red. Its limit is
 * stated there and repeated here because it matters: a test that goes red for the wrong
 * reason passes this rule. What the rule establishes is that the claim *can* be made
 * false and that something notices when it is.
 */
describe('rule 10 · an exemption names the edit that falsifies its claim', {
  timeout: RULE_TIMEOUT_MS,
}, () => {
  const exempt = (): Throw[] => (committed.throws?.rows ?? []).filter((row) => row.status === 'exempt');

  it('accepts the shipped tree, so the rule is not merely strict', () => {
    const problems = violationsOf(committed, ROOT).filter(
      (problem) =>
        problem.includes('makes its claim false') ||
        problem.includes('mutation') ||
        problem.includes('mutates') ||
        problem.includes('text to replace'),
    );
    expect(problems).toEqual([]);
    expect(exempt().length).toBeGreaterThan(0);
  });

  it('states a mutation for every exemption, with the four parts a reader needs', () => {
    for (const row of exempt()) {
      const mutant = row.mutant;
      expect(mutant, `${row.script}:${String(row.line)}`).toBeDefined();
      expect(typeof mutant?.file).toBe('string');
      expect(typeof mutant?.find).toBe('string');
      expect(typeof mutant?.replace).toBe('string');
      expect(mutant?.defect.length ?? 0).toBeGreaterThan(40);
    }
  });

  it('rejects an exemption with no mutation at all', () => {
    const rows = (committed.throws?.rows ?? []).map((row) =>
      row.status === 'exempt' ? { ...row, mutant: undefined } : row,
    );
    const dir = withThrows(rows, committed.throws?.counts ?? {}, 'throw-no-mutant');
    expect(
      violationsOf(JSON.parse(readFileSync(join(dir, 'gate-sites.json'), 'utf8')), pointerRoot()),
    ).toContainEqual(expect.stringContaining('without naming a mutation'));
  });

  it('rejects a mutation whose text has drifted out of the tree', () => {
    // The failure mode a table of edits has: the tree moves, the string does not, and a
    // battery that applied nothing would report the claim as held.
    const rows = (committed.throws?.rows ?? []).map((row) =>
      row.status === 'exempt' && row.mutant !== undefined
        ? { ...row, mutant: { ...row.mutant, find: 'a line this repository does not carry' } }
        : row,
    );
    const dir = withThrows(rows, committed.throws?.counts ?? {}, 'throw-mutant-drifted');
    const problems = violationsOf(JSON.parse(readFileSync(join(dir, 'gate-sites.json'), 'utf8')), pointerRoot());
    expect(problems).toContainEqual(expect.stringContaining('occurs'));
    expect(problems).toContainEqual(expect.stringContaining('exactly one site'));
  });

  it('rejects a mutation whose text lands on more than one site', () => {
    // A mutant that fires in two places measures two claims and reports one, which is the
    // direction that always looks green.
    const rows = (committed.throws?.rows ?? []).map((row) =>
      row.status === 'exempt' && row.mutant !== undefined
        ? { ...row, mutant: { ...row.mutant, find: 'const' } }
        : row,
    );
    const dir = withThrows(rows, committed.throws?.counts ?? {}, 'throw-mutant-ambiguous');
    expect(
      violationsOf(JSON.parse(readFileSync(join(dir, 'gate-sites.json'), 'utf8')), pointerRoot()),
    ).toContainEqual(expect.stringContaining('exactly one site'));
  });

  it('rejects a mutation that replaces text with itself', () => {
    const rows = (committed.throws?.rows ?? []).map((row) =>
      row.status === 'exempt' && row.mutant !== undefined
        ? { ...row, mutant: { ...row.mutant, replace: row.mutant.find } }
        : row,
    );
    const dir = withThrows(rows, committed.throws?.counts ?? {}, 'throw-mutant-noop');
    expect(
      violationsOf(JSON.parse(readFileSync(join(dir, 'gate-sites.json'), 'utf8')), pointerRoot()),
    ).toContainEqual(expect.stringContaining('into itself'));
  });

  it('rejects a mutation of a file that does not exist', () => {
    const rows = (committed.throws?.rows ?? []).map((row) =>
      row.status === 'exempt' && row.mutant !== undefined
        ? { ...row, mutant: { ...row.mutant, file: 'packages/core/src/not-a-module.ts' } }
        : row,
    );
    const dir = withThrows(rows, committed.throws?.counts ?? {}, 'throw-mutant-missing');
    expect(
      violationsOf(JSON.parse(readFileSync(join(dir, 'gate-sites.json'), 'utf8')), pointerRoot()),
    ).toContainEqual(expect.stringContaining('which does not exist'));
  });

  it('rejects a mutation whose defect nobody can review', () => {
    const rows = (committed.throws?.rows ?? []).map((row) =>
      row.status === 'exempt' && row.mutant !== undefined
        ? { ...row, mutant: { ...row.mutant, defect: 'breaks it' } }
        : row,
    );
    const dir = withThrows(rows, committed.throws?.counts ?? {}, 'throw-mutant-vague');
    expect(
      violationsOf(JSON.parse(readFileSync(join(dir, 'gate-sites.json'), 'utf8')), pointerRoot()),
    ).toContainEqual(expect.stringContaining('unexplained'));
  });

  it('rejects a mutation of a test file, which would make the red run about the test', () => {
    const rows = (committed.throws?.rows ?? []).map((row) =>
      row.status === 'exempt' && row.mutant !== undefined
        ? { ...row, mutant: { ...row.mutant, file: 'packages/core/test/score.test.ts' } }
        : row,
    );
    const dir = withThrows(rows, committed.throws?.counts ?? {}, 'throw-mutant-targets-test');
    expect(
      violationsOf(JSON.parse(readFileSync(join(dir, 'gate-sites.json'), 'utf8')), pointerRoot()),
    ).toContainEqual(expect.stringContaining('a test, so the red run would be about the test file'));
  });

  it('rejects two exemptions naming one mutation', () => {
    // One edit, two claims: the battery would apply it once and credit both. The reasons
    // and statements stay distinct here, so the rejection can only come from rule 10.
    const first = exempt().find((row) => row.mutant !== undefined)?.mutant;
    expect(first).toBeDefined();
    const rows = (committed.throws?.rows ?? []).map((row) =>
      row.status === 'exempt' ? { ...row, mutant: first } : row,
    );
    const dir = withThrows(rows, committed.throws?.counts ?? {}, 'throw-mutant-shared');
    expect(
      violationsOf(JSON.parse(readFileSync(join(dir, 'gate-sites.json'), 'utf8')), pointerRoot()),
    ).toContainEqual(expect.stringContaining('name the same mutation'));
  });

  it('rejects a site whose diagnostic is the success line the deriver walked past', () => {
    // Rule 11, and the reading it was written from: the deriver takes the nearest printed
    // string above a site, so a gate that prints its verdict before its failure branch is
    // published as failing *with the sentence it prints when it succeeds*. The corruption has
    // to be a real site, not a fabricated one: the rule reads the shipped inventory.
    const sites = committed.sites.map((site, i) =>
      i === 0 ? { ...site, diagnostic: `${site.script.split('/').pop() ?? ''}: OK (${String(site.line)} row(s))` } : site,
    );
    const dir = withInventory(sites, 'success-line-diagnostic');
    expect(
      violationsOf(JSON.parse(readFileSync(join(dir, 'gate-sites.json'), 'utf8')), pointerRoot()),
    ).toContainEqual(expect.stringContaining('which is a success line'));
  });

  it('rejects a throw row whose message is a success line', () => {
    // The same rule on the partition, because the two halves are published by the same
    // deriver and a rule applied to one of them is the omission this file has found before.
    const rows = (committed.throws?.rows ?? []).map((row, i) =>
      i === 0 ? { ...row, message: `${row.script.split('/').pop() ?? ''}: OK (${String(row.line)})` } : row,
    );
    const dir = withThrows(rows, committed.throws?.counts ?? {}, 'throw-success-line');
    expect(
      violationsOf(JSON.parse(readFileSync(join(dir, 'gate-sites.json'), 'utf8')), pointerRoot()),
    ).toContainEqual(expect.stringContaining('which is a success line'));
  });

  it('rejects a proved throw that also names a mutation', () => {
    const rows = (committed.throws?.rows ?? []).map((row) =>
      row.status === 'proved' && row.mutant === undefined
        ? {
            ...row,
            mutant: {
              file: 'packages/core/src/pack/example.ts',
              find: 'const manifestPath',
              replace: 'const manifestPathUnused',
              defect: 'a row that says a test reaches this exit and that the exit is an exemption',
            },
          }
        : row,
    );
    const dir = withThrows(rows, committed.throws?.counts ?? {}, 'throw-proved-mutant');
    expect(
      violationsOf(JSON.parse(readFileSync(join(dir, 'gate-sites.json'), 'utf8')), pointerRoot()),
    ).toContainEqual(expect.stringContaining('and also names a mutation'));
  });
});

/**
 * The fixture and the two caches, held to what their comments claim.
 *
 * The caches exist because this file's cost was the defect: twenty-nine copies of a
 * hundred-and-ten-file tree, and four thousand reads of files that had not changed, took
 * 11.9 s of wall clock and 253 ms of CPU -- and a loaded box multiplied the wall clock by
 * four, which put the file past the 45,000 ms stall budget with every test passing. A cost
 * fix with no test is a cost that comes back, and these four are the properties that made
 * the fix correct rather than merely faster.
 */
describe('the fixture and the two caches · correctness, not just speed', () => {
  it('copies the pointer tree once per run', () => {
    // The count, not the timing: a second copy of an unchanged tree leaves no trace in the
    // tree, so the only observable is how many files were written. Deleting the early return
    // in `pointerRoot` doubles this number, which is why it is exported rather than inferred
    // from the absence of a difference.
    const first = pointerRoot();
    const after = fixtureCopyCount();
    expect(after).toBeGreaterThan(100);
    expect(pointerRoot()).toBe(first);
    expect(fixtureCopyCount()).toBe(after);
  });

  it('does not cache a file it could not read, so a file that appears later is seen', () => {
    // A negative result is the one a cache must never keep: `proofProblems` reads
    // "undefined" as "does not exist", and an entry recording that would make a file written
    // a moment later invisible for the rest of the run.
    const file = join(scratch, 'appears-later.ts');
    expect(readSource(file)).toBeUndefined();
    writeFileSync(file, 'now here\n');
    expect(readSource(file)).toBe('now here\n');
  });

  it('re-reads a file whose size changed, and one whose mtime changed', () => {
    // The identity is (path, size, mtime-ns), the invariant `make` uses. Both arms are
    // exercised because either one alone would leave the other unmeasured: a rewrite that
    // changes the length and one that does not are different cases, and the mtime is set
    // explicitly in the second so the assertion does not depend on the filesystem's
    // timestamp granularity.
    const file = join(scratch, 'identity.ts');
    writeFileSync(file, 'first\n');
    expect(readSource(file)).toBe('first\n');

    writeFileSync(file, 'second, longer\n');
    expect(readSource(file)).toBe('second, longer\n');

    writeFileSync(file, 'THIRD\n');
    const later = new Date(Date.now() + 1_000);
    utimesSync(file, later, later);
    expect(readSource(file)).toBe('THIRD\n');
  });

  it('scans a body once, keyed by the body itself rather than by the path', () => {
    // Identity equality is the whole assertion: the scan is a pure function of the text, so a
    // memo keyed by the text cannot be stale by construction, and a caller that reads the same
    // bytes through a different path still gets the memo. Keying by path instead would have
    // been the faster-looking choice and the wrong one: it needs the identity check that
    // `readSource` already performs, and it fails for the same body reached two ways.
    // A script name this file does not otherwise name: `gate-proofs.test.ts` asserts that this
    // file mentions no gate outside a comment, and a fixture that spelled a real one would be a
    // mention in code. The scan does not care which name it is.
    const body = "const DRIVES = ['a-fixture-script.mjs'];\nrun(DRIVES[0]);\n";
    expect(scansOf(body)).toBe(scansOf(body));
    expect(scansOf(body).declared).toEqual(['a-fixture-script.mjs']);
    expect(scansOf(`${body}\n// different\n`)).not.toBe(scansOf(body));
  });
});
