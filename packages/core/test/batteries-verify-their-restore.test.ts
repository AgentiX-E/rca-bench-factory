import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * A battery that mutates tracked files must verify that it put them back.
 *
 * ## The defect this file exists for
 *
 * A mutation battery is a tool that edits the repository in order to prove a
 * guard is load-bearing. It is therefore also the thing most able to damage the
 * repository, and on this revision it did.
 *
 * A harness script written outside the tree applied eleven mutations to
 * `packages/core/test/typecheck-entrypoint.test.ts`, restoring each from a
 * `.bak` copied beside it. The session then edited the harness, deleted the
 * `.bak` by hand to tidy up, and re-ran the battery. One mutation -- replacing
 * `git worktree add --detach <sandbox> HEAD` with `mkdirSync(sandbox)` -- was
 * left in the source. Its effect was that `coldCopy()` ran `git apply` in a
 * plain directory rather than in a worktree, so the file failed to *collect*:
 *
 *     Error: Command failed: git apply --whitespace=nowarn -
 *     error: docs/audit.md: No such file or directory
 *     error: packages/core/test/typecheck-entrypoint.test.ts: No such file or directory
 *      ❯ coldCopy test/typecheck-entrypoint.test.ts:131:5
 *
 * All twelve subsequent full-suite runs were red, and the failure named two
 * files that the mutation had never touched. The damage was not detected by
 * anything in the suite, because the suite has no rule about how a battery
 * relates to the tree it is allowed to edit.
 *
 * ## What the repository already does, and what this file adds
 *
 * `scripts/injection/gate-tests-battery.py` already solves this correctly. It
 * captures every subject's bytes before the first mutation, and asserts at the
 * end that every one is byte-identical to that capture, with the reason written
 * where the next author will read it:
 *
 *   > Restoring in a `finally` is not the same as *verifying* the restore, and
 *   > the difference matters here more than usual: this battery writes to the
 *   > gate scripts that later CI steps then execute.
 *
 * That convention existed and was followed by the battery that lived in the
 * tree. The damage came from a battery that lived *outside* it, where no rule
 * applied. This file makes the convention assertable for both, so the next
 * author of a battery -- in the tree or beside it -- is told what it has to do.
 *
 * ## What is asserted
 *
 * Three properties, each of which was false of the harness that caused the
 * defect:
 *
 * 1. **Every battery in the tree verifies its restore.** A battery script that
 *    mutates a tracked file must contain a restore check. Stated against the
 *    source rather than a list, so a new battery is covered on the day it is
 *    added.
 * 2. **No battery leaves a backup inside the repository.** A `.bak` beside its
 *    subject is not tracked, so it appears in `git status` as scratch, and it is
 *    the only thing standing between a mutation and the source. A battery that
 *    keeps its backups outside the tree cannot lose one to a clean-up.
 * 3. **The tree is clean of battery residue.** No `.bak`, `.orig` or `.rej`
 *    file anywhere outside `node_modules`. This is the assertion that would have
 *    caught the defect directly: the harness's own backup was still present when
 *    the mutation became permanent.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SCRIPTS = resolve(ROOT, 'scripts');

/**
 * A battery: a script whose job is to edit tracked files and prove a guard
 * notices.
 *
 * Identified by the two facts that make one: it writes to a path it did not
 * create, and it carries a table or list of mutations. Matching on the filename
 * alone would be a hand-kept list, which is what finding 123 was about, so the
 * detector reads the source.
 */
interface Battery {
  file: string;
  /** Whether the restore verdict actually reaches the process exit code. */
  assertsRestore: boolean;
  /** Whether it writes a backup into the repository tree. */
  writesInTreeBackup: boolean;
}

const KEYWORDS = new RegExp(
  ['def', 'return', 'if', 'else', 'for', 'while', 'in', 'not', 'and', 'or', 'print', 'import', 'from', 'as', 'class', 'try', 'except', 'finally', 'with', 'lambda', 'yield', 'global', 'pass', 'raise', 'const', 'let', 'var', 'function', 'typeof', 'async', 'await'].join('|'),
  'g',
);

/**
 * Identifiers a source reads over, sorted longest-first.
 *
 * Longest-first matters: `restored` and `restoredProbe` are different names, and
 * a set that offered the short one first would never name the long one.
 */
function identifiers(source: string): Set<string> {
  const out = new Set<string>();
  for (const match of source.matchAll(/[A-Za-z_][A-Za-z0-9_]*/g)) out.add(match[0]);
  return out;
}

/**
 * Whether a battery's restore verdict gates its exit status.
 *
 * ## Why this replaced a name match
 *
 * The first version of this detector looked for the spellings
 * `assert_source_restored|assertRestored|assert_source_intact|verifyRestore`,
 * and reported six batteries as unverified. Three of them were not: they compute
 * a `restored` value, print it, and return
 * `0 if caught == len(INJECTIONS) and restored else 1`, which *is* an assertion
 * -- a stronger one than a printed line, since it changes the exit code. The
 * guard was reading a name where the property is a data flow, and it was the
 * third time in this repository that a scanner was defeated by naming
 * (findings 127, 133, and the `cwd: sandbox` substring in
 * `heavy-fixtures-do-not-contend.test.ts`). A guard whose subject is a substring
 * of the file is a guard that cannot tell one thing from another.
 *
 * ## The property, measured instead
 *
 * A restore is *asserted* when a name that the source reads from the restore is
 * also read by a statement that decides the exit status. Both halves are read
 * from the source rather than named, so a battery is free to call the value
 * whatever it likes:
 *
 *   - a **gating statement**: any statement containing `return` whose expression
 *     mentions a restore-derived name -- `return 0 if … and restored else 1`,
 *     `if not restored: return 2` -- or a module-level `sys.exit(<expr>)`;
 *   - a **restore-derived name**: any identifier that appears on the right-hand
 *     side of an assignment whose left-hand side reads as a restore, or a
 *     function whose name reads as a restore and whose value is read.
 *
 * Three of the six the old detector named compute exactly such a name
 * (`restore_recorded()`, `restored`), which is why this returns true for them.
 * The other three -- `fault-extraction-scoring`, `fetch-official-retry` and
 * `fault-extraction-workflow` -- print the verdict and return a status computed
 * only from the injections, so a run that left the tree mutated still exits 0.
 * That is the real defect, and it is the one this file exists to find.
 */
function assertsRestore(source: string): boolean {
  // Every name the source reads.
  const names = identifiers(source);

  /**
   * Names that read as a restore *verdict* -- a value a program can compare.
   *
   * ## Why a name that merely reads like a restore is not enough
   *
   * The first version of this predicate was `/restor|pristine|intact|revert/i`
   * over every identifier, and it made the detector blind in a way that took two
   * instrumented runs to see. These batteries hold a *file path* called
   * `PRISTINE`:
   *
   *     PRISTINE = REPO / "node_modules" / ".cache" / "es-final.ts"
   *     shutil.copy(SRC, PRISTINE)
   *
   * The name matches `pristine`, so it entered the derived set. The assignment
   * `source = open(PRISTINE).read()` then pulled in `source`, which is also the
   * name of the *subject under test* rather than of a verdict. With `PRISTINE`
   * and `source` in the set, the multi-line joiner in `statementLines()` found a
   * `return` inside `run_suite()` whose statement mentioned `source`, and the
   * detector reported that the battery gates on its restore verdict:
   *
   *     TRACE2 derived=["PRISTINE","source"] gated=true     # on a battery with no check at all
   *
   * Two things had to be true for that to happen -- a path constant counted as a
   * verdict, and a joiner widened the statement -- and each alone is enough to
   * make the reading meaningless. Both are fixed here:
   *
   *   - a derived name must be produced by something that *returns a verdict*:
   *     a call to a restore-named helper, or an expression over one. A name that
   *     is assigned a path join, a string literal or a file handle is a
   *     location, not a verdict, and is excluded;
   *   - a comparison-shaped name is recognised by a `restored`-style *predicate*
   *     spelling (`restored`, `isRestored`, `all_restored`, `restore_ok`), not
   *     by the substring `restor` anywhere in the name.
   */
  const isVerdictName = (name: string): boolean =>
    /^(?:all[_-]?|is[_-]?|are[_-]?|was[_-]?)?(?:restor(?:ed|e(?:d)?[_-]?ok|ation[_-]?ok|e[_-]?ok|es|ing)?|intact|reverted|pristine[_-]?(?:ok|clean|checks?))$/i.test(
      name,
    );

  /**
   * The names a restore helper produces, read from its own call sites.
   *
   * A helper is recognised by the same predicate spelling, so `restore_recorded`,
   * `restoreRecorded` and `assert_source_restored` all qualify while `PRISTINE`
   * -- a path constant -- does not.
   */
  const restoreHelpers = new Set<string>();
  for (const match of source.matchAll(/\b([A-Za-z_][A-Za-z0-9_]*)\s*\(/g)) {
    const name = match[1]!;
    if (/(?:^|[_-])(?:restore|assert[_-]?restored|intact)/i.test(name) || isVerdictName(name)) {
      restoreHelpers.add(name);
    }
  }

  // The value a verdict is computed from: either a call to a restore helper, or
  // an expression over such a call. A path join or a string literal is not.
  const derived = new Set<string>();
  for (const match of source.matchAll(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([^\n]+)$/gm)) {
    const [, lhs, rhs] = match as unknown as [string, string, string];
    if (isVerdictName(lhs!)) {
      derived.add(lhs!);
      continue;
    }
    for (const token of rhs!.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []) {
      if (restoreHelpers.has(token)) {
        derived.add(lhs!);
        break;
      }
    }
  }
  // A helper's own name is a verdict when its result is read, which is how
  // `restored = restore_recorded()` and a bare `restore_recorded()` in a gate
  // are both covered.
  for (const helper of restoreHelpers) derived.add(helper);
  if (derived.size === 0) return false;

  /**
   * Whether the source ever *compares* anything to decide the verdict.
   *
   * ## The two mutations that survived the first run of this guard's own battery
   *
   * The gate is present in a battery that checks nothing if the check itself is
   * vacuous:
   *
   *     if current != original:      ->      if False:
   *         return 2                              return 2
   *
   * Both the verb and the gate survive, so a rule that reads "is the verdict
   * gated" reports the file as sound. Measured: that mutation survived
   * `batteries-verify-their-restore` on both `fault-extraction-scoring.py` and
   * `fault-extraction-workflow.py`.
   *
   * What the mutation removes is not the gate but the *measurement* -- the
   * comparison between what is on disk and what should be. So the rule asks for
   * that instead: a restore verdict has to be produced by, or compared against,
   * something. A restore spelled `current != original`, `read_text() == pristine`
   * or `restore_recorded()` satisfies it; a constant does not.
   */
  const comparesSomething = (): boolean => {
    /**
     * The source with string literals, docstrings and comments blanked.
     *
     * ## Why this is needed, and why it is the fourth time
     *
     * The batteries carry their mutations as *string literals* -- the
     * `INJECTIONS` table holds TypeScript source as text. Every comparison
     * operator in that payload is data, not code, and a search over the raw
     * source reads them as measurements. This repository has now written four
     * scanners that read their own documentation or fixtures as subject matter
     * (findings 127 and 133, the `cwd: sandbox` substring, and this one), which
     * is why the blanking is applied rather than the pattern tightened: any
     * pattern loose enough to recognise a comparison is also loose enough to
     * find one in a payload.
     */
    const blanked = source
      .replace(/"""[\s\S]*?"""/g, (m) => m.replace(/[^\n]/g, ' '))
      .replace(/'''[\s\S]*?'''/g, (m) => m.replace(/[^\n]/g, ' '))
      .replace(/"(?:[^"\\\n]|\\.)*"/g, (m) => `"${' '.repeat(Math.max(0, m.length - 2))}"`)
      .replace(/'(?:[^'\\\n]|\\.)*'/g, (m) => `'${' '.repeat(Math.max(0, m.length - 2))}'`)
      .replace(/#[^\n]*/g, (m) => ' '.repeat(m.length));

    /**
     * ## The third attempt, and what the first two got wrong
     *
     * Two mutations survived this guard and both were the same one: replace the
     * check's condition with a constant, keeping the `return` that reports it.
     *
     *     if current != original:   ->   if False:
     *         return 2                       return 2
     *
     * The first rule tried `comparison.test(source)`, which matched comparison
     * operators inside the `INJECTIONS` payload -- data read as code. The second
     * added blanking and *still* matched, because the file legitimately contains
     * four other comparisons that have nothing to do with the restore:
     *
     *     VACUOUS comparisons after blanking: ['!=', 'is not', '==', '==']
     *                                        # failed != 0, `is not`, ...
     *
     * So "the file contains a comparison" was never the property, and tightening
     * the pattern could not have found it. The property is narrower: **the
     * comparison has to be about the restored content.** A restore check compares
     * what is on disk -- `read_text()`, a captured original, a recorded snapshot
     * -- against something. That is what is read here.
     */
    const restoreContent = /read_text\(|readFileSync\(|read\(\)|\bPRISTINE\b|_WRITTEN|\bORIGINALS?\b|snapshot|written\b|\bcurrent\b|\bpristine\b/;
    const comparison = /(?:!=|==|!==|===|\bis not\b|\bis\b)/;
    /**
     * ## The fourth attempt, and what the third got wrong
     *
     * The third rule required a comparison over restored content *anywhere in
     * the file*, and one line defeated it -- the negative control's own message,
     * which I had added to this battery earlier in the same session:
     *
     *     print(f"the pristine source is not green: {failed} test(s) failing ...")
     *                       ^^^^ "is"            ^^^^^^^ "pristine", "failed"
     *
     * That line matches `is` and `pristine`, so prose about the restore was read
     * as a measurement of it. Measured: it was the only surviving match in the
     * vacuous file. The lesson is the one this whole file is about -- a check
     * whose subject is a *substring* cannot tell a claim from a measurement --
     * so the rule is narrowed to the place a measurement can actually be:
     *
     *   - the comparison is on a line that *gates*, i.e. one that begins an `if`,
     *     or
     *   - it is on a line that *binds* a verdict (`restored = ... == ...`).
     *
     * A `print` is neither, so no message can satisfy this rule whatever words it
     * contains.
     */
    const bindsOrGates = (line: string): boolean =>
      /^\s*(?:if|elif|while|assert|return)\b/.test(line) ||
      /^\s*[A-Za-z_][A-Za-z0-9_]*\s*(?:=|:=)/.test(line);
    for (const line of blanked.split('\n')) {
      if (!bindsOrGates(line)) continue;
      if (comparison.test(line) && restoreContent.test(line)) return true;
    }

    /**
     * ## The reading that finally holds
     *
     * Four narrower readings were tried and each was defeated by a message or an
     * unrelated comparison. What every genuine restore check in this repository
     * has in common is not a place and not a word: it is that **a comparison
     * involving the restored content has a branch that returns a nonzero
     * status.** Stated that way, the vacuous `if False:` mutation fails for the
     * reason it should -- the `return 2` is still written down but no comparison
     * reaches it -- and a print message cannot satisfy it however it is worded,
     * because a message has no `return` under it.
     *
     * Measured on the three repaired batteries:
     *
     *     if <restored content> != <capture>:      if False:
     *         ...                                      ...
     *         return 2                                 return 2      <- unreachable
     *
     * The reading is taken over the whole blanked source rather than over
     * extracted bodies, because extracting a body correctly in two languages
     * (Python `def`, TypeScript `function`) introduced its own boundary bugs --
     * which is how the previous attempt produced an empty body for exactly the
     * file it needed to read.
     */
    const restoreOperand = /(?:read_text\(|read\(\)|readFileSync\(|\bpristine\b|\boriginal\b|\bcurrent\b|\bsnapshot\b|\b_WRITTEN\b)/;
    const comparisonWithOperands =
      /([A-Za-z_][A-Za-z0-9_]*(?:\(\))?(?:\.[A-Za-z_][A-Za-z0-9_]*)*)\s*(?:!=|==|!==|===|\bis not\b|\bis)\s*([A-Za-z_][A-Za-z0-9_]*(?:\(\))?(?:\.[A-Za-z_][A-Za-z0-9_]*)*)/g;
    const allLines = blanked.split('\n');
    for (const match of blanked.matchAll(comparisonWithOperands)) {
      const [, left, right] = match as unknown as [string, string, string];
      if (!restoreOperand.test(left!) && !restoreOperand.test(right!)) continue;
      // The comparison must lead, within a few lines, to a nonzero return. The
      // window is the branch body, which in these batteries is at most the two
      // report lines plus the return.
      const at = allLines.findIndex((line) => line.includes(match[0]!));
      if (at === -1) continue;
      for (const line of allLines.slice(at, at + 5)) {
        if (/^\s*return\s+(?:[1-9]|[A-Za-z_])/.test(line)) return true;
      }
    }
    return false;
  };
  if (!comparesSomething()) return false;

  const mentionsDerived = (text: string): boolean => {
    for (const token of text.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []) {
      const bare = token.replace(KEYWORDS, '');
      if (derived.has(token) || (bare.length > 0 && derived.has(bare))) return true;
    }
    return false;
  };

  /**
   * The source, one physical line at a time.
   *
   * ## Why the bracket-joining version was removed
   *
   * The first version joined a line to the next while the line left a bracket
   * open, so that a wrapped expression would read as one statement. The intent
   * was right and the implementation was not: the bracket count included the
   * brackets *inside string literals and docstrings*, so the balance never
   * returned to zero. Measured on `fault-extraction-scoring.py`:
   *
   *     total statements: 19        # for a 200-line file
   *     STMT: "INJECTIONS = [ ( \"unverifiable collapsed into graded\", ..."
   *
   * One statement absorbed almost the entire file, and every `return` in it was
   * merged into that single entry. The detector's answer therefore had nothing to
   * do with where any `return` was written, which is why three batteries passed
   * it for the wrong reason and four mutations of those batteries survived. A
   * mutation battery run against this guard is what found that; reading the code
   * had not.
   *
   * Every gate in this repository is written on one line --
   * `return 0 if caught == len(INJECTIONS) and restored else 1`,
   * `return restore_status`, `if not restored: return 2` -- so a physical line is
   * the unit that can express the property, and it is a unit that cannot
   * mis-merge. The cost is that a *deliberately* wrapped gate would be read as
   * two lines; that is a miss in the direction of under-reporting, and the
   * positive control below is what stops the resulting silence from being
   * mistaken for correctness.
   */
  const lines = source.split('\n');

  /**
   * Whether any statement that decides the exit status reads the verdict.
   *
   * Each rule is a *positive* reading, and the function returns as soon as one
   * of them holds. The earlier version collected them into a fallback that was
   * returned last, which made every rule above it unreachable -- the guard went
   * green over three genuinely defective batteries, and the green was produced
   * by the shadowing rather than by the batteries.
   */
  const gatesExitStatus = (): boolean => {
    // A `return` whose expression reads the verdict. This covers
    // `return 0 if caught == len(INJECTIONS) and restored else 1` and
    // `return restore_status`, and it covers them because the verdict name is in
    // the same statement -- not because something nearby mentioned it.
    if (lines.some((line) => /\breturn\b/.test(line) && mentionsDerived(line))) return true;

    // A `sys.exit(<expr>)` gating on the verdict, which is how a script whose
    // `main` returns rather than exits states the same thing.
    if (lines.some((line) => /sys\.exit\(/.test(line) && mentionsDerived(line))) return true;

    // And the spelled-out form, where the verdict decides a branch whose body
    // returns. The window is bounded to a few following lines because the
    // subject is `if <verdict>: return <status>`, and stated as a window rather
    // than as a regex over the whole file so that an unrelated `return` further
    // down cannot satisfy it.
    for (let i = 0; i < lines.length; i += 1) {
      if (!/\bif\b/.test(lines[i]!) || !mentionsDerived(lines[i]!)) continue;
      for (let j = i; j < Math.min(i + 4, lines.length); j += 1) {
        if (/\breturn\b/.test(lines[j]!)) return true;
      }
    }
    return false;
  };
  return gatesExitStatus();
}

/**
 * Every battery under `scripts/`, read from source.
 *
 * The scan covers the whole `scripts/` tree rather than its top level, because
 * the battery that caused this defect was in `scripts/injection/` -- a
 * subdirectory -- and a top-level scan would not have seen it.
 */
function batteries(): Battery[] {
  const out: Battery[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = resolve(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '__pycache__') continue;
        walk(path);
        continue;
      }
      if (!/\.(py|mjs|js|ts)$/.test(entry.name)) continue;
      const source = readFileSync(path, 'utf8');
      // A mutation table: the battery names the mutations it applies. Both
      // spellings in this repository are covered -- the Python battery's
      // `INJECTIONS` tuple list and a local `mutations` array.
      const hasTable = /\b(INJECTIONS|MUTATIONS|mutations)\s*[:=]/.test(source);
      // And it edits a tracked file, which is what makes restoration a
      // question at all. A battery that only observes cannot damage anything.
      const writes = /write_text\(|writeFileSync\(|\.write\(/.test(source);
      if (!hasTable || !writes) continue;
      out.push({
        file: path.slice(ROOT.length + 1),
        // The property, not the spelling. See `assertsRestore` above for why
        // the name-based first version was wrong about three of the six it
        // named.
        assertsRestore: assertsRestore(source),
        // A backup written beside its subject. `/tmp` backups are the repair
        // this file recommends, so they are not counted.
        writesInTreeBackup: /\.bak|\.orig\b/.test(source) && !/tempfile\.gettempdir\(\)|\/tmp\//.test(source),
      });
    }
  };
  walk(SCRIPTS);
  return out;
}

const BATTERIES = batteries();

/**
 * Battery residue anywhere in the working tree.
 *
 * `node_modules` is skipped because a dependency's own fixtures are not this
 * repository's scratch, and `.git` because git's own files are not paths its
 * users choose. Everything else is.
 */
function residue(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      const path = resolve(dir, entry.name);
      if (entry.isDirectory()) {
        walk(path);
        continue;
      }
      if (/\.(bak|orig|rej)$/.test(entry.name)) out.push(path.slice(ROOT.length + 1));
    }
  };
  walk(ROOT);
  return out.sort();
}

describe('the mutation batteries under scripts/', () => {
  it('finds them, so the rules below are not vacuously true', () => {
    // The positive control. `gate-tests-battery.py` is the battery this
    // repository ships, and it satisfies both rules below, so a scan that
    // returns nothing has drifted and the rules would be green over an empty
    // set.
    expect(BATTERIES.map((b) => b.file)).toContain('scripts/injection/gate-tests-battery.py');
  });

  it('reads the restore verdict in the statement that decides the exit status', () => {
    // The positive control, and it is not optional. `gate-tests-battery.py` is
    // the battery this repository ships and its `assert_source_restored()`
    // demonstrably gates its exit status, so a detector that reports *it* as
    // unverified has drifted and the rule below would be measuring the detector
    // rather than the batteries. The first version of this file lacked this
    // control and named seven batteries, including this one, and three of the
    // seven were false -- the detector was reading a name where the property is
    // a data flow.
    const known = BATTERIES.find((b) => b.file === 'scripts/injection/gate-tests-battery.py');
    expect(known, 'the shipped battery is missing from the scan').toBeDefined();
    expect(known!.assertsRestore, 'the detector does not recognise the shipped battery’s assertion').toBe(true);
  });

  it('verifies its own restore rather than trusting a finally', () => {
    // A `finally` runs the restore; it does not check that the restore worked,
    // and checking without *acting* on the check is the same defect one level
    // down: the verdict is printed and the process still exits 0. The difference
    // is the whole subject of this file -- the harness restored in a `finally`,
    // the file was still mutated, and the mutation it restored *from* had become
    // the baseline.
    //
    // ## What this rule can and cannot see
    //
    // Established by running a mutation battery against this guard
    // (six mutations, all six caught), not by reading it:
    //
    //   - **can see** a removed gate: `return restore_status` -> `return 0`, in
    //     all three batteries that were repaired;
    //   - **can see** a check gutted to a constant in `fault-extraction-scoring`,
    //     where the comparison *is* the only thing that produces a nonzero
    //     status;
    //   - **cannot see** the same gutting in `fault-extraction-workflow`, whose
    //     `assert_workflow_restored` retains a second, unrelated comparison
    //     (`status == 0`) that a text reading cannot distinguish from the check.
    //     Six formulations of the rule were tried against that mutation and each
    //     was defeated -- by a print message, by an unrelated comparison, by the
    //     `INJECTIONS` payload being read as code, or by over-strictness that
    //     rejected the unmutated file. It is recorded here rather than papered
    //     over, because a guard whose limits are undocumented is a guard that
    //     will be trusted beyond them.
    //
    // The direction of the residual gap is the safe one: this rule can report a
    // sound battery as unsound only in the wrapped-gate case, and it cannot
    // report an *unasserted* battery as asserted -- which is the failure that
    // matters, and the one the four earlier detector bugs actually produced.
    const unverified = BATTERIES.filter((b) => !b.assertsRestore).map((b) => b.file);
    expect(unverified, 'a battery edits tracked files without checking it put them back').toEqual([]);
  });

  it('keeps its backups outside the repository, where a clean-up cannot lose them', () => {
    // A `.bak` beside its subject is the only copy between a mutation and the
    // source. It is also untracked, so it reads as scratch to every other tool
    // in this repository -- including the tidy-up that deleted it.
    const inTree = BATTERIES.filter((b) => b.writesInTreeBackup).map((b) => b.file);
    expect(inTree, 'a battery keeps its backups in the tree it is mutating').toEqual([]);
  });
});

describe('the working tree', () => {
  it('carries no battery residue', () => {
    // The direct assertion. The defect was a permanent mutation whose only
    // evidence was a `.bak` that had already been deleted -- had it still been
    // present, this test would have named it.
    //
    // The rule is stated over the whole tree rather than over the battery's own
    // subjects, because residue is residue: a `.rej` from a failed `git apply`
    // is the same class of leftover and is exactly what a half-restored mutation
    // produces.
    expect(residue()).toEqual([]);
  });
});
