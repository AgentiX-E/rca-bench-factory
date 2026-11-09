#!/usr/bin/env node
/**
 * Enumerate the failure sites of every gate in `scripts/`, and write them to
 * `golden-master/gate-sites.json`.
 *
 * ## Why this exists
 *
 * The roadmap carries the gap as P1-6, and its worklist was a hand-written table
 * that said *25 sites across about 12 scripts*. Measured, the tree holds **37
 * sites across 23 scripts** before this script existed, and 38 across 24 once it
 * counts its own `fail()` -- the table had drifted the way every hand-counted
 * number in this repository has drifted, and the drift was invisible for the
 * same reason as always: nothing read it.
 *
 * The item it was counting is P1-6's own question -- *does a test prove this
 * gate fails when it should?* -- and that question cannot be asked of a list
 * that is wrong. So the list is derived by a program instead of remembered by a
 * person, and `packages/core/test/gate-sites-are-proven.test.ts` holds the
 * derived list and the committed one equal.
 *
 * ## What counts as a failure site
 *
 * The rule is deliberately narrow, and it is written here rather than left to
 * the reader because the count is the point:
 *
 *   - a call to `process.exit(...)` whose argument is not a known zero. In
 *     practice that covers `process.exit(1)`, `process.exit(2)`,
 *     `process.exit(cond ? 0 : 1)`, `process.exit(main())`, the one-line
 *     `if (!ok) process.exit(1);`, and the continuation
 *     `main().then((code) => process.exit(code))` -- because a gate is a
 *     **property** ("exits non-zero when unhappy") and each of those is a
 *     spelling of it.
 *
 * The rule used to be `argument === '1'`, which is a spelling rather than the
 * property and which dropped eight scripts out of the table. This file's own
 * summary kept reporting a smaller number than the tree held, and nothing compared
 * the two. Finding 172 records the change; the cost of having been narrow is now
 * legible, because `verify-gates-are-testable.mjs` takes its subjects from this
 * table: **21 scripts could have been emptied with nothing watching them.**
 *
 * ## The other half of "no", which this table did not publish until v3.45
 *
 * A gate refuses two ways. The first is a call. The second is a `throw` that nothing
 * catches: Node prints the stack and exits 1, which to a shell is the same refusal.
 * The tree holds **41 throw statements across 15 scripts** and the table published
 * none of them, so the campaign's three questions -- is it reached, is it depended on,
 * can the gate be hollowed -- were never asked about any of them.
 *
 * One made that a defect rather than a scope note. `measure-ci-baseline.mjs` refuses a
 * run whose jobs carry no `batteries` with a **top-level** `throw`; the script's
 * `process.exit(2)` for a usage error was published beside it and proved, while
 * `battery-budget.test.ts` drove only the usage arm. The refusal that runs when the
 * network answered had never executed.
 *
 * The throws are published as a second partition, `throws`, with four dispositions --
 * `fatal` ends the process and is proved like a site, `unguarded` hands control to its
 * caller, `guarded` is caught in the frame that holds it, `rethrow` forwards a decision
 * made above. `throwsIn` documents the boundaries; the short version is that a `try`
 * and a `catch` stop at a function boundary, because neither is on the stack when the
 * function runs somewhere else, and that a `catch` that builds a *new* failure has made
 * a decision of its own rather than forwarding one.
 *
 * Deliberately **not** counted as sites:
 *
 *   - a call whose argument is a known zero: the numeric literal `0` -- `0x0` and
 *     `0.0` read as numbers, so they are the same claim -- and **no argument at
 *     all**, because `process.exit()` exits 0. A success exit is not a failure
 *     site; `probe-category-derivation.mjs` ends with one because reaching the end
 *     is what success means there.
 *   - a reference to the exit family that is not a call. Those are **refused**
 *     rather than ignored; see "What the inventory refuses to publish" below.
 *
 * ## Why an exit is no longer required to be a statement
 *
 * Until v3.44 the rule also required the call to sit in statement position, and
 * everything else went into a basket named `indirect`. Measured, that basket held
 * exactly two calls -- and both are the sentence that decides the status of the
 * whole script:
 *
 * ```
 * derive-fault-golden.mjs:252     main().then((code) => process.exit(code))
 * score-fault-extraction.mjs:202  main().then((code) => process.exit(code))
 * ```
 *
 * `code` is `main()`'s return value, which is the verdict. The inventory published
 * each of those two scripts as having one failure exit (the `.catch` arm) and
 * excluded the one that carries every refusal `main()` was written to report:
 * `main()` prints "M1 exit condition NOT met", returns 2, and the arrow hands 2 to
 * `process.exit`. The campaign that proves every site is reached by a test had
 * never been asked about them.
 *
 * The exclusion was justified by "a call that is not in statement position may not
 * run", which is equally true of the sites the rule *includes*: `if (x)
 * process.exit(1)` may not run either, and that is what the published `condition`
 * column is for. **Position in an expression does not weaken an exit** -- a call
 * that runs ends the process wherever it stands -- so the basket is deleted rather
 * than narrowed, and the two calls are sites.
 *
 * ## The tally, and why it is two buckets rather than three
 *
 * The rule reports what it dropped, because "38 sites" is meaningful only next to
 * "and these others went elsewhere". It used to compute that second half with a
 * *separate*, line-shaped scan, and the two halves then disagreed: the committed
 * file said `{15 zero, 3 indirect}` where the tree holds `{16 zero, 2 indirect}`,
 * and **the totals matched anyway** -- one count had been lost and one invented,
 * and the two errors cancelled to 130.
 *
 * The lost one was `if (officialDirArg === undefined) process.exit(0);`: a success
 * exit written on a line that does not *start* with `process.exit`. The site rule
 * grew a fallback for exactly that shape in a previous round (it was costing the
 * inventory a site), and the tally never got the same treatment.
 *
 * The invented one was a docstring line in this file whose text contains
 * `.map((x) => process.exit(1))`, counted because the comment stripper desyncs in
 * this file. That is finding 364's defect a third time: a hand-written lexer, a
 * `/` that is not a division.
 *
 * So the classification is now one pass over the tree, and it is **total by
 * construction**: every `process.exit(...)` call is a site or a `zero`, and the
 * two add up to the number of calls. A tally that is the remainder of a
 * subtraction cannot be checked; one that is a partition can.
 *
 * ## What the inventory refuses to publish
 *
 * A site is proved by two instruments: a test that reaches its line, and a mutant
 * that replaces its argument with `0` from that frame. Both are written against a
 * call to `process.exit`, resolved at the line it happens on -- so a computed
 * `process['exit'](1)` is a site, and `process.exitCode = 1` is not: no hook here
 * can see a status set without a call. An alias (`const die = process.exit; die(1)`) and a
 * destructured binding are refused for a different reason: the reference exits
 * nothing, the call does, and a static reader cannot follow the value from one line
 * to the other -- it would publish a line the trace never reports.
 *
 * So the reading **throws** when it meets one, naming the line and the spelling.
 * Measured today: **zero** such references in `scripts/`. The alternative -- a
 * fourth basket called `uncounted` -- was written and rejected, because a
 * published basket reads as a measurement of the tree, and that one would measure
 * the instrument's reach instead.
 *
 * ## Why the snippet, and not just the line number
 *
 * A line number is destroyed by any edit above it, and the first iteration of
 * this repository's line-numbered tables was found to be two rows off for
 * exactly that reason (finding 122, finding 35). So each site also carries a
 * *fingerprint*: the condition that guards it when there is one, and the
 * diagnostic string it is about to print. Both are read from the source, and
 * both are stable under reindentation and reformatting.
 *
 * The fingerprint is what makes the committed file readable as a *statement*
 * rather than as coordinates. `check-official.mjs:564` says nothing to a reader;
 * `failures.length > 0` → `Official-metric regression FAILED` says which
 * refusal it is.
 *
 * The diagnostic is extracted from the **concatenated** first argument of the
 * nearest preceding `console.error(...)` or `process.stderr.write(...)`, not
 * from a single line. That distinction cost a round of debugging: the two
 * ROUNDTRIP diagnostics are built across three physical lines, and a
 * line-at-a-time scan reported *nothing* for the two exits that guard them --
 * which is the worst possible answer, because "no diagnostic found" and "no
 * diagnostic exists" are indistinguishable in the output.
 *
 * ## Comments and strings
 *
 * A comment is not a token. The tree never sees one, so a docstring that quotes
 * `process.exit(1)` -- and this repository is full of them, because the gates
 * document their own shapes -- cannot become a site. That used to be arranged by
 * stripping comments first, with a scanner that tracked string and template state
 * because a line-comment marker inside a URL and a block-comment terminator inside
 * a string both defeat the regex form. The scanner was itself defeated, in 12 of
 * the 75 scripts, by the same character as the two before it: a quote or a backtick
 * spelled inside a **regex literal** -- the one that matches a backtick, in
 * `check-backend-support.mjs`, is a single character wide and closed a string that
 * had never been opened -- or a template holding a substitution.
 * It is gone rather than repaired: nothing in this file needs a lexer now that the
 * classification is a walk over the tree.
 *
 * Nothing is stripped for the *fingerprint*, which is read from the raw text: the
 * diagnostic is a string literal and stripping would delete it.
 *
 * ## Usage
 *
 *   node scripts/derive-gate-sites.mjs            # write the file
 *   node scripts/derive-gate-sites.mjs --check    # fail if the file is stale
 *   node scripts/derive-gate-sites.mjs --stdout   # print without writing
 *
 * This script reads and writes text. It does not spawn the test suite, for the
 * reason `check-doc-counts.mjs` records at length: it runs both from the
 * `docs:check` aggregate and from inside the suite, and a suite spawn inside the
 * suite recurses.
 *
 * ## What this script owns, and what it does not
 *
 * The table carries four derived columns -- `script`, `line`, `condition`,
 * `diagnostic` -- and six hand-authored ones: `status`, `provedBy`, `statement`,
 * `heldBy`, `mutant`, `reason`, recording which test proves each site, what an
 * exemption claims, which test holds that claim, and which edit to the tree makes
 * the claim false. This script owns only the first four.
 *
 * `--check` therefore compares the derived columns alone, and a rewrite carries
 * the annotations across. Before both of those were true the two halves fought:
 * `--check` reported every annotated site as drifted, because the derived side
 * has no annotations to match, and a plain run overwrote the file and discarded
 * every proof record. Either one alone makes the table untrustworthy, and the
 * guard in `packages/core/test/gate-sites-are-proven.test.ts` is what reads it.
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

const SCRIPTS = resolve(ROOT, 'scripts');
const DEFAULT_OUT = resolve(ROOT, 'golden-master', 'gate-sites.json');

function fail(lines) {
  console.error('derive-gate-sites: FAILED');
  for (const line of lines) console.error(`  ${line}`);
  process.exit(1);
}

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i === -1 ? undefined : process.argv[i + 1];
}

/**
 * The lines of a statement that begins at `start`, joined.
 *
 * Walks forward while the parentheses opened on the way are still open, so a
 * call whose argument is built across several lines is read whole. Bounded by
 * `limit` because an unbalanced file should produce a truncated fingerprint
 * rather than an infinite walk.
 */
function joined(lines, start, limit = 12) {
  let depth = 0;
  let seen = false;
  const parts = [];
  for (let i = start; i < Math.min(lines.length, start + limit); i += 1) {
    const line = lines[i];
    parts.push(line);
    for (const ch of line) {
      if (ch === '(') {
        depth += 1;
        seen = true;
      } else if (ch === ')') {
        depth -= 1;
      }
    }
    if (seen && depth <= 0) break;
  }
  return parts.join('\n');
}

/**
 * The guard that encloses a site: the innermost construct that decides whether
 * the exit runs at all.
 *
 * ## What the column used to say
 *
 * It scanned *backwards for an `if` line* -- "the nearest `if` above this exit",
 * which is not the same question as "the block this exit is in". The two differ
 * whenever a block ends between the guard and the exit: the sibling `if` three
 * lines up, or the `if` whose block closed before the summary exit. And they
 * differ completely for a `catch`, where there is no predicate to find and the
 * scan walks *past* the `catch` to whatever `if` came before it.
 *
 * Measured against a parser, which is an independent reading of the same tree:
 * **13 of 112** sites published a condition that does not hold at the exit --
 * four named a guard that had already closed, four named an `if` where the exit
 * is inside a `catch`, five named an `if` where there is none -- and **two more**
 * published nothing where the guard could be named. Three of the thirteen said
 * `unknown.length > 0` or `workflow.errors.length > 0` about a refusal that
 * fires when something cannot be *read*, which is as wrong as a condition gets:
 * it names the opposite branch.
 *
 * ## Why the answer comes from the syntax tree
 *
 * Two hand-written attempts came first, and each was defeated by the same thing:
 * a `/` is not always a division, and a `{` is not always a block.
 *
 *   1. **Counting characters, skipping strings.** `check-no-absolute-paths.mjs`
 *      holds `/(['"`])(\/(?:Users|home)\/...)\1/g` -- the quote characters
 *      *inside the regex* opened a string that never closed, so the walk
 *      swallowed the rest of the file and the enclosing `if` was never pushed.
 *   2. **Tokenising.** TypeScript's raw scanner is not a standalone lexer: a
 *      template literal's `${...}` has to be rescanned by the parser, so after
 *      the first substitution the scanner reads prose as code and stops matching
 *      the file. Measured: every site in a file with a template lost its guard.
 *
 * The two failures are the same lesson this file has now recorded four times --
 * `stripComments` on a URL, the site rule on its own line 109, the tally below,
 * and these two. "What encloses this exit" is a question about a syntax tree, and
 * the tree answers it exactly: an `if` is an `IfStatement`, an `else` body is that
 * statement's `elseStatement`, a `catch` is a `CatchClause`, and nothing else can
 * pretend to be one.
 *
 * ## The vocabulary, and the two decisions in it
 *
 * The column is read by people, so it is small: an `if` publishes its predicate,
 * an `else` body publishes the negation of the `if` it closes, a loop publishes
 * its header, a `catch` and a `switch` publish the word.
 *
 * A **declaration is a barrier** and an inline closure is not; the walk below
 * says which and why. `undefined` is a real value, not a missing one.
 */
function guardOf(node, file) {
  let child = node;
  for (let parent = node.parent; parent !== undefined; child = parent, parent = parent.parent) {
    if (ts.isSourceFile(parent)) return undefined;
    // A **declaration** is a barrier, not a guard: it is hoisted and reachable by
    // name from anywhere, so an `if` around where it was written says nothing
    // about where it runs. `fail(...)` is the shape this is for -- its exits carry
    // no condition, and that absence is the informative answer: the condition
    // lives at the call site.
    //
    // An inline arrow or function *expression* is the opposite case and is walked
    // through. It is created where it appears, so everything enclosing its
    // creation is a precondition for reaching the exit inside it: the exit in
    // `verify-local.mjs` sits in `main().catch((error) => ...)`, inside the guard
    // that decides whether `main()` is called at all.
    if (
      ts.isFunctionDeclaration(parent) ||
      ts.isMethodDeclaration(parent) ||
      ts.isConstructorDeclaration(parent) ||
      ts.isGetAccessor(parent) ||
      ts.isSetAccessor(parent)
    ) {
      return undefined;
    }
    if (ts.isIfStatement(parent)) {
      // An `else` body runs exactly when the predicate did not hold, and an
      // `else if` chain means it runs when *none* of them held -- so the answer
      // is the whole chain negated, not the innermost link. `check-fault-cases.mjs`
      // is that shape: an exit in the final `else` of three tests. Publishing
      // `!(arg === '--help' || arg === '-h')` alone would be true and would read
      // as the complete condition, which is the defect this round is repairing.
      const chain = [];
      let link = parent;
      let branch = child;
      for (;;) {
        if (branch !== link.elseStatement) {
          chain.push(flat(link.expression, file));
          break;
        }
        chain.push(`!(${flat(link.expression, file)})`);
        const outer = link.parent;
        if (outer === undefined || !ts.isIfStatement(outer) || link !== outer.elseStatement) break;
        branch = link;
        link = outer;
      }
      return chain.reverse().join(' && ');
    }
    if (ts.isCatchClause(parent)) return 'catch';
    if (ts.isSwitchStatement(parent)) return 'switch';
    if (ts.isForStatement(parent)) {
      const init = parent.initializer === undefined ? '' : flat(parent.initializer, file);
      const test = parent.condition === undefined ? '' : flat(parent.condition, file);
      const step = parent.incrementor === undefined ? '' : flat(parent.incrementor, file);
      return `for (${init}; ${test}; ${step})`;
    }
    if (ts.isForOfStatement(parent) || ts.isForInStatement(parent)) {
      const of = ts.isForOfStatement(parent) ? 'of' : 'in';
      return `for (${flat(parent.initializer, file)} ${of} ${flat(parent.expression, file)})`;
    }
    if (ts.isWhileStatement(parent)) return `while (${flat(parent.expression, file)})`;
    if (ts.isDoStatement(parent)) return 'do';
    if (parent.parent === undefined) break;
  }
  return undefined;
}

/** One predicate or header, on one line, as published. */
function flat(node, file) {
  return node.getText(file).replace(/\s+/g, ' ').trim();
}

/**
 * Whether a node is a call to `process.exit`.
 *
 * `process` and `exit` are read as *names*, not as text: the callee is a property
 * access on an identifier called `process`, or an element access with a string
 * literal that names a status member. A call to `other.exit(...)` is not this, and
 * neither is a local function named `exit`.
 */
function isExitCall(node, file) {
  return ts.isCallExpression(node) && statusMemberOf(node.expression, file) === 'exit';
}

/**
 * The members of `process` that report a status, and the spelling a node uses to
 * reach one.
 *
 * `exit` is the one this tree writes; `exitCode` is the one it could write instead,
 * and the one no instrument here can hollow. Both are in the family so that the
 * second cannot enter the tree as an absence -- which is what it was until v3.44.
 */
const STATUS_MEMBERS = new Set(['exit', 'exitCode']);

/** `process.exit`, `process.exitCode`, `process['exit']` -- as a name, not as text. */
function statusMemberOf(node, file) {
  if (
    ts.isPropertyAccessExpression(node) &&
    node.expression.getText(file) === 'process' &&
    STATUS_MEMBERS.has(node.name.getText(file))
  ) {
    return node.name.getText(file);
  }
  if (
    ts.isElementAccessExpression(node) &&
    node.expression.getText(file) === 'process' &&
    node.argumentExpression !== undefined
  ) {
    const quoted = /^['"`]([A-Za-z]+)['"`]$/.exec(node.argumentExpression.getText(file));
    if (quoted !== null && STATUS_MEMBERS.has(quoted[1])) return quoted[1];
  }
  return undefined;
}

/**
 * The statement a node sits in, for a message a reader has to act on.
 *
 * `process.exit` on its own says where the reader should look; `const die =
 * process.exit;` says what to change. The walk stops at the child of a block, a
 * case clause or the file -- so an exit inside `if (!ok) ...` reports the whole
 * one-line `if`, which is the sentence the author wrote.
 */
function statementAround(node) {
  let current = node;
  while (current.parent !== undefined) {
    const parent = current.parent;
    if (ts.isBlock(parent) || ts.isSourceFile(parent) || ts.isCaseClause(parent) || ts.isModuleBlock(parent)) {
      return current;
    }
    current = parent;
  }
  return current;
}

/**
 * Every `process.exit` call in one file, partitioned two ways, and every other
 * reference to the exit family refused.
 *
 * The partition is the point. `sites` are the failure exits the inventory
 * publishes; `zero` is the one way a call is not one, and every call lands in
 * exactly one of the two -- so `sites.length + zero` is the number of calls in the
 * file, and a call that is silently absent from both is impossible rather than
 * merely unnoticed. Until v3.44 a third basket, `indirect`, held calls that were
 * not in statement position; it is gone, because a call that runs ends the process
 * wherever it stands, and both of its members were the `.then` continuation that
 * carries a gate's verdict. See the header.
 *
 * A reference that is not a call is not classified but **refused**: `process.exit`
 * read as a value, `process.exitCode` assigned, `process['exit']` computed,
 * `const { exit } = process` destructured. Each is an exit this inventory could
 * not prove, and a published site nothing can hollow is worse than a build that
 * stops.
 *
 * That was not true of the line-shaped reading this replaces. It classified by
 * matching a line, so `if (officialDirArg === undefined) process.exit(0);` --
 * where the exit is not the first thing on the line -- fell through every branch
 * and was counted nowhere: the tally reported one fewer success exit than the tree
 * holds, and the inventory reported one fewer `indirect` than the tree holds,
 * because a docstring in this file was counted instead. The two errors cancelled
 * and the total looked right.
 *
 * A file the parser cannot read is a file whose exits cannot be read, so it throws
 * rather than answering from a partial tree: an empty condition and "no guard"
 * are indistinguishable in the output, and that is the failure mode this campaign
 * keeps finding.
 */
export function exitsIn(name, source) {
  const file = ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  if (file.parseDiagnostics.length > 0) {
    throw new Error(
      `${name}: the parser rejected this file (${String(file.parseDiagnostics.length)} error(s)), ` +
        'so no exit can be classified in it',
    );
  }
  const rawLines = source.split('\n');
  const sites = [];
  const excluded = { zero: 0 };
  const refusals = [];
  const refuse = (node, what) => {
    const line = file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;
    refusals.push(`${name}:${line} ${what}: ${flat(statementAround(node), file).slice(0, 90)}`);
  };
  const visit = (node) => {
    if (isExitCall(node, file)) {
      const line = file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;
      const argument = node.arguments.length === 0 ? undefined : node.arguments[0];
      // A call with no argument exits 0, so it is a success exit by meaning and
      // not only by spelling. Until v3.44 it was published as a site, because the
      // rule asked whether the argument was the literal zero and absence is not
      // the literal zero.
      if (argument === undefined || (ts.isNumericLiteral(argument) && Number(argument.text) === 0)) {
        excluded.zero += 1;
      } else {
        const diagnostic = diagnosticOf(rawLines, node, file);
        const site = { line, condition: guardOf(node, file), diagnostic };
        // A site whose status is computed elsewhere has no message of its own: the
        // gate printed it inside the function that *returned* the code. Publishing
        // a bare coordinate would leave the row unreadable, so the expression whose
        // value becomes the status is published instead -- `process.exit(code)`
        // reads as `verdict: "code"`, which is exactly the thing a reader needs to
        // know about the two continuations that carry a gate's answer.
        if (diagnostic === undefined && !ts.isNumericLiteral(argument)) {
          site.verdict = flat(argument, file).slice(0, 90);
        }
        sites.push(site);
      }
    } else {
      const member = statusMemberOf(node, file);
      // A member reached through the object is a reference, not a site: the exit
      // happens at the line that calls whatever the reference holds, and a static
      // reader cannot follow it there. `exitCode` is refused even when it is
      // called, because no instrument here can see a status set without a call.
      const isCallee =
        node.parent !== undefined &&
        ts.isCallExpression(node.parent) &&
        node.parent.expression === node;
      if (member === 'exitCode') {
        refuse(node, 'is a status set by assignment');
      } else if (member === 'exit' && !isCallee) {
        refuse(node, 'is read without being called');
      }
      if (
        ts.isVariableDeclaration(node) &&
        ts.isObjectBindingPattern(node.name) &&
        node.initializer?.getText(file) === 'process'
      ) {
        for (const element of node.name.elements) {
          const key = (element.propertyName ?? element.name).getText(file);
          if (STATUS_MEMBERS.has(key)) refuse(node, `binds process.${key} to a local name`);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  // `forEachChild` visits in source order, so `sites` comes out in line order
  // without a sort -- and a sort would silently reorder two exits on one line.
  visit(file);
  if (refusals.length > 0) {
    throw new Error(
      `${name}: ${String(refusals.length)} reference(s) to the exit family that this inventory cannot ` +
        'classify:\n' +
        refusals.map((r) => `  ${r}`).join('\n') +
        '\nA site is proved by a test that reaches it and by a mutant that replaces its argument, so the ' +
        'inventory publishes only a `process.exit(...)` call. Write the refusal that way, or teach ' +
        '`derive-gate-sites.mjs` and `verify-sites-are-sensitive.mjs` the new spelling together -- a site no ' +
        'instrument can hollow would be published as proved and never be measured.',
    );
  }
  return { sites, excluded };
}

/**
 * The message a throw will print, read from the expression rather than from the
 * statement.
 *
 * `throw new Error('the run holds no job')` is readable as itself, but the same
 * statement written `throw new Error(\`run ${RUN} ...\`)` is a template whose text
 * carries a substitution, and publishing the whole expression twice over -- once as
 * the statement, once as its argument -- adds nothing. So a `new X(<literal>)` form
 * publishes the literal with its substitutions kept, and everything else publishes
 * the flattened expression.
 *
 * A row with no text at all would be a coordinate, which is what rule 5 of
 * `gate-sites-are-proven.test.ts` forbids for a site; the same reasoning applies
 * here, so this returns the statement's own text when the argument yields nothing.
 */
function throwMessage(node, file) {
  const expression = node.expression;
  if (ts.isNewExpression(expression) && expression.arguments !== undefined) {
    for (const argument of expression.arguments) {
      if (ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument)) {
        return argument.text.replace(/\s+/g, ' ').trim().slice(0, 120);
      }
      if (ts.isTemplateExpression(argument)) {
        return flat(argument, file).replace(/^`|`$/g, '').slice(0, 120);
      }
    }
  }
  return flat(expression, file).slice(0, 120);
}

/**
 * Every throw statement in one file, partitioned four ways.
 *
 * ## Why the inventory reads throws at all
 *
 * The published rule is about `process.exit(...)` calls, and a gate that refuses by
 * throwing is the same refusal to a shell: Node prints the stack and exits 1. The
 * tree holds **40 throw statements across 15 scripts**, and until v3.45 the
 * inventory published none of them.
 *
 * The one that made this a defect rather than a scope note is
 * `measure-ci-baseline.mjs:55`: a top-level `throw` refusing a run whose jobs carry
 * no `batteries`. The script's `process.exit(2)` is published and proved beside it,
 * while `battery-budget.test.ts` drives only the usage arm -- so the refusal that
 * runs when the network answered was reached by nothing, counted by nothing, and
 * could have broken without a word.
 *
 * ## The four baskets, and why the boundaries are facts about the language
 *
 * | disposition | where | what it does |
 * | --- | --- | --- |
 * | `fatal` | no enclosing function, no enclosing `try` | ends the process, unconditionally |
 * | `unguarded` | in a function, no enclosing `try` | hands control to the caller, which decides |
 * | `guarded` | in a `try` block | this frame catches it |
 * | `rethrow` | in a `catch`, rethrowing the caught binding | carries a decision made above |
 *
 * `guarded` and `rethrow` reset when the walk enters a function, because the `try`
 * above a function's *definition* is not on the stack when that function runs
 * somewhere else. That is a fact, not a heuristic: `try { const f = () => { throw x; }; }`
 * does not guard `f`.
 *
 * A `catch` does not make its body a forward: the test is whether the thrown
 * expression *is* the caught binding. `measure-doc-counts.mjs:182` throws a
 * `SuiteFailed` built from a red `pnpm`, which is this repository's verdict rather
 * than pnpm's, so it is `unguarded` like any other throw that leaves its function.
 *
 * `fatal` is an exit and is proved like one. `unguarded` is published with its
 * disposition because the answer is not in this file -- the caller's frame decides,
 * and a reading that guessed would publish a line the trace never reports. `guarded`
 * and `rethrow` are published so a reader can see what the rule declined.
 */
export function throwsIn(name, source) {
  const file = ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  if (file.parseDiagnostics.length > 0) {
    throw new Error(
      `${name}: the parser rejected this file (${String(file.parseDiagnostics.length)} error(s)), ` +
        'so no throw can be classified in it',
    );
  }
  const rows = [];
  const counts = { fatal: 0, unguarded: 0, guarded: 0, rethrow: 0 };
  const walk = (node, context) => {
    if (ts.isTryStatement(node)) {
      walk(node.tryBlock, { ...context, guarded: true });
      if (node.catchClause !== undefined) {
        const caught = node.catchClause.variableDeclaration?.name;
        walk(node.catchClause, {
          ...context,
          rethrowName: caught === undefined ? undefined : caught.getText(file),
        });
      }
      if (node.finallyBlock !== undefined) walk(node.finallyBlock, context);
      return;
    }
    if (ts.isThrowStatement(node)) {
      const expression = node.expression;
      const forwarded =
        context.rethrowName !== undefined
        && ts.isIdentifier(expression)
        && expression.text === context.rethrowName;
      const disposition = context.guarded
        ? 'guarded'
        : forwarded
          ? 'rethrow'
          : context.inFunction
            ? 'unguarded'
            : 'fatal';
      counts[disposition] += 1;
      rows.push({
        line: file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1,
        disposition,
        message: throwMessage(node, file),
      });
    }
    // A function is a boundary for both `guarded` and `rethrow`: neither the `try`
    // above its definition nor the `catch` around it is on the stack when it runs.
    const next = ts.isFunctionLike(node)
      ? { inFunction: true, guarded: false, rethrowName: undefined }
      : context;
    ts.forEachChild(node, (child) => walk(child, next));
  };
  // `forEachChild` visits in source order, so `rows` is in line order without a
  // sort -- and a sort would silently reorder two throws written on one line.
  walk(file, { inFunction: false, guarded: false, rethrowName: undefined });
  return { rows, counts };
}

/**
 * The diagnostic a site prints about itself: the longest string literal in the
 * first argument of the nearest preceding diagnostic call **in the same function**.
 *
 * Read from the raw lines rather than the stripped ones, because the answer *is*
 * a string literal. Note what this does **not** claim: proximity is not
 * enclosure. A message three lines above the exit in a block that already closed
 * is still what this returns, and the round that fixed `condition` measured the
 * alternative -- a block-scoped scan -- and declined it: the message frequently
 * sits inside the `for` loop just above (`check-doc-counts.mjs` prints its
 * summary, then loops over the detail, then exits), so scoping the scan to the
 * enclosing block lost 14 of 112 sites outright. A column that is right about
 * proximity and silent about which block it came from is worth more than one
 * that is absent for a seventh of the tree.
 *
 * ## Why the floor is a function rather than a distance
 *
 * The scan used to stop after 60 lines, and a distance can cross the boundary that
 * matters. `score-fault-extraction.mjs:202` is `process.exit(code)` in the `.then`
 * continuation; a few lines above it sits `console.log('\nM1 exit condition met.')`
 * -- the sentence printed on the *success* path -- so the exit that fires when M1
 * is **not** met would have been published with success's message as its
 * fingerprint. Measured over every call in `scripts/` (130 of them), moving the
 * floor to the enclosing function changes **4** rows: the two continuations lose a
 * diagnostic that belongs to another function, and two `process.exit(0)` calls
 * gain one that sat further than 60 lines away. No published site's diagnostic
 * changes.
 *
 * A function is a boundary in the language rather than a guess about layout: a
 * message outside the function that contains the exit is a message some caller
 * printed about something else.
 */
function diagnosticOf(rawLines, node, file) {
  const index = file.getLineAndCharacterOfPosition(node.getStart(file)).line;
  let floor = 0;
  for (let parent = node.parent; parent !== undefined; parent = parent.parent) {
    if (ts.isFunctionLike(parent)) {
      floor = file.getLineAndCharacterOfPosition(parent.getStart(file)).line;
      break;
    }
  }
  let diagnostic;
  for (let j = index - 1; j >= floor; j -= 1) {
    // `console.log` is included alongside the two error channels because one
    // gate in this tree reports through it: `verify-scorer-stability.mjs` prints
    // its FAILED summary with `console.log` because the whole script is a
    // report. Excluding it left that site with no fingerprint at all, which is
    // the least useful answer -- it reads identically to "the guard has no
    // diagnostic", which is a different and much stronger claim.
    // `verdict(...)` is `check-doc-counts.mjs`'s synchronous write helper: it exists because
    // `console.*` writes to a pipe asynchronously and `process.exit` does not wait for them, so a
    // verdict could be lost while its exit code survived. A diagnostic written through it is still
    // this gate's diagnostic, and excluding the call left the site with no fingerprint at all --
    // which reads identically to "this guard has no diagnostic", a much stronger claim.
    if (!/(console\.(?:error|log)|process\.stderr\.write|\bverdict)\s*\(/.test(rawLines[j])) continue;
    const call = joined(rawLines, j);
    // The first argument's text, before the closing paren of the call.
    const body = call.slice(call.indexOf('(') + 1);
    // Prefer a template literal, then a single-quoted string, then a
    // double-quoted one. Template literals come first because a multi-line
    // diagnostic in this tree is always one.
    const literal =
      /`([^`]{4,200})`/s.exec(body) ??
      /'([^']{4,200})'/s.exec(body) ??
      /"([^"]{4,200})"/s.exec(body);
    if (!literal) continue;
    const text = literal[1].replace(/\s+/g, ' ').trim();
    // A loop body's `console.error(`${line}`)` prints the *payload* the callers
    // already collected, so on its own it says nothing about which refusal it
    // is -- `check-doc-counts.mjs:99`, `check-l4-status.mjs:59` and four others
    // would all fingerprint identically. The information is one frame up, in
    // the message the collector built. So a literal that is nothing but a
    // single interpolation is rejected and the scan keeps walking, and only if
    // nothing informative exists in range does the bare form stand.
    if (/^\$\{[A-Za-z_$][\w$.]*\}$/.test(text)) {
      diagnostic ??= text;
      continue;
    }
    diagnostic = text;
    break;
  }

  return diagnostic;
}

/**
 * Every published script, which is every non-hidden `.mjs` in `scripts/`.
 *
 * ## Why dotfiles are excluded, and why this is a correctness fix rather than tidiness
 *
 * `type-miss-probe.test.ts` writes a temporary module at
 * `scripts/.probe-figures-harness.mjs` and removes it in a `finally`. It has to
 * live in `scripts/` because the probe it re-exports resolves its own imports
 * (`../packages/core/dist/...`) relative to its own path, so a harness elsewhere
 * makes every one of them unresolvable.
 *
 * The consequence was an intermittent failure of
 * `gate-sites-are-proven.test.ts`'s rule-1 assertion, at roughly one run in four:
 * this function counted the harness while it existed, and the count is a
 * *published* number (`scanned`) compared against the committed inventory. The
 * derivation saw 36 where the committed file says 35.
 *
 * Reproduced directly by creating the file and running `--stdout`: the count is
 * 36 with it present and 35 without, which is the failing assertion's exact text
 * (`expected 35 to be 36`).
 *
 * Two repairs were available. The test could stop writing into a shared directory,
 * or the derivation could stop counting files that are not part of the artefact it
 * describes. The second is the right one here, because **a dotfile is not a
 * published script**: it is not committed, it is not named by `pnpm lint`, and
 * nothing an operator runs will ever resolve it. The inventory is a statement
 * about the scripts that ship, and a transient scratch module was never one of
 * them.
 *
 * The test's window is still a real hazard -- it is why the harness is written
 * per call rather than once -- but it is no longer a hazard *this* file depends
 * on winning a race against.
 */
function scriptFiles() {
  return readdirSync(SCRIPTS)
    .filter((f) => f.endsWith('.mjs') && !f.startsWith('.'))
    .sort();
}

function derive() {
  const files = scriptFiles();

  const sites = [];
  const throws = [];
  // Accumulated by key rather than by naming each tally here. The set of tallies
  // lives in `exitsIn` alone, so adding one there cannot leave a zero here that
  // the report then prints as a measurement -- which is what happened when
  // `computed` and `numeric_other` stopped being exclusions: this side kept
  // adding `undefined` and the committed file read `"computed": null`.
  const excluded = {};
  const counts = { fatal: 0, unguarded: 0, guarded: 0, rethrow: 0 };
  for (const file of files) {
    const source = readFileSync(join(SCRIPTS, file), 'utf8');
    const read = exitsIn(file, source);
    for (const site of read.sites) sites.push({ script: `scripts/${file}`, ...site });
    for (const [kind, count] of Object.entries(read.excluded)) {
      excluded[kind] = (excluded[kind] ?? 0) + count;
    }
    const readThrows = throwsIn(file, source);
    for (const row of readThrows.rows) throws.push({ script: `scripts/${file}`, ...row });
    for (const [kind, count] of Object.entries(readThrows.counts)) counts[kind] += count;
  }

  return { sites, throws: { counts, rows: throws }, excluded, scanned: files.length };
}

/**
 * The committed shape.
 *
 * One entry per site, in `script` then `line` order, with absent fields omitted
 * rather than written as `null` -- so the file reads as the statement it is, and
 * a diff shows the fingerprint that changed rather than a wall of nulls.
 *
 * `status` is deliberately **not** written here. Whether a site is proven by a
 * test is a judgement about the suite, and a program that derived its own
 * answer to that question would be grading its own work -- the defect
 * `export-surface-enumerated.test.ts` names in its first design note. This
 * script writes the facts; the human-written columns live beside them in the
 * same file and the test reconciles the two.
 */
/**
 * Serialise the table.
 *
 * The four derived columns come first and in a fixed order, so a re-derivation
 * produces byte-identical text for an unchanged tree. The hand-authored columns
 * are appended after them when present, in their own fixed order -- `reason`
 * last, because it explains why the claim before it cannot be proved.
 *
 * Carrying the annotations through is the whole reason this function cannot
 * simply rebuild each entry from a schema. It used to do exactly that, and the
 * effect was that every plain run silently discarded the proof record: the merge
 * in `main()` restored the columns and this function then dropped them again.
 * The derived text looked perfect, which is why it took a round trip to notice.
 */
function serialise({ sites, excluded, scanned, throws }) {
  const payload = {
    rule:
      'a process.exit(...) call whose argument is not a known zero -- no argument at all is zero; ' +
      'sites and zero partition every process.exit call, whatever position the call sits in; ' +
      'a reference to the exit family that is not a call is refused rather than counted; ' +
      'see scripts/derive-gate-sites.mjs',
    scanned,
    excluded,
    sites: sites.map((s) => {
      const entry = { script: s.script, line: s.line };
      if (s.condition) entry.condition = s.condition;
      if (s.diagnostic) entry.diagnostic = s.diagnostic;
      if (s.verdict) entry.verdict = s.verdict;
      if (s.status) entry.status = s.status;
      if (s.provedBy) entry.provedBy = s.provedBy;
      if (s.reason) entry.reason = s.reason;
      return entry;
    }),
    throws: {
      rule:
        'every throw statement, partitioned four ways: `fatal` (no enclosing function, no enclosing try) ' +
        'ends the process and is proved like a site; `unguarded` (in a function, no enclosing try) hands ' +
        'control to its caller, which decides; `guarded` (in a try block) is caught here; `rethrow` (in a ' +
        'catch, rethrowing the caught binding) carries a decision made above. A try or a catch stops at a ' +
        'function boundary, because neither is on the stack when the function runs elsewhere. ' +
        'fatal + unguarded + guarded + rethrow is the number of throw statements; ' +
        'see scripts/derive-gate-sites.mjs',
      counts: throws.counts,
      rows: throws.rows.map((row) => {
        const entry = { script: row.script, line: row.line, disposition: row.disposition };
        if (row.message) entry.message = row.message;
        if (row.status) entry.status = row.status;
        if (row.provedBy) entry.provedBy = row.provedBy;
        if (row.statement) entry.statement = row.statement;
        if (row.heldBy) entry.heldBy = row.heldBy;
        if (row.mutant) entry.mutant = row.mutant;
        if (row.reason) entry.reason = row.reason;
        return entry;
      }),
    },
  };
  return `${JSON.stringify(payload, null, 2)}\n`;
}

/**
 * Carry the annotation columns across a rewrite -- by fingerprint, not by position.
 *
 * Re-deriving used to overwrite the whole file, which silently discarded every
 * `status`, `provedBy`, `statement`, `heldBy`, `mutant` and `reason` -- the columns
 * that are the only reason the table is more than a list.
 *
 * The first repair matched annotations by `script:line` and said so: "a moved
 * guard loses a stale proof rather than inheriting a wrong one". The second half
 * of that sentence is true and the first half is not what happens. **Any edit
 * above a site moves its line**, so the annotation is dropped for a site that
 * did not change at all, and the guard then fails on `main` with
 * `has status 'undefined'` -- a red that names a coordinate instead of a defect.
 * Measured twice: three sites in pass 56 and one in pass 57, when a docstring
 * above `measure-doc-counts.mjs`'s `fail()` grew.
 *
 * This file already computes the identifier that is stable under exactly that
 * edit -- the fingerprint, which its own header describes as "stable under
 * reindentation and reformatting". Carrying by line while fingerprinting for
 * `--check` was two answers to one question, and the coordinate one was wrong.
 *
 * A fingerprint is not always unique: two `process.exit(1)` calls with no
 * diagnostic above them produce the same string. When several prior sites share
 * one, the line is the only evidence left, so a candidate that has not moved is
 * preferred -- and if none of them is at that line the annotation is dropped
 * rather than guessed at. A wrong proof is worse than a missing one, which is
 * what the first version's sentence was trying to say.
 *
 * Exported so `derive-gate-sites-annotations.test.ts` can drive it with two
 * tables instead of moving a line in the real tree. The behaviour is otherwise
 * only observable by editing a script and re-deriving, which is precisely the
 * accident this fixes.
 */
export function carryAnnotations(sites, priorSites) {
  const result = carryColumns(sites, priorSites, (site) =>
    [site.script, site.condition ?? '', site.diagnostic ?? '', site.verdict ?? ''].join('\u0000'),
  );
  return {
    sites: result.rows,
    carried: result.carried,
    priorAnnotated: result.priorAnnotated,
    strays: result.strays,
  };
}

/**
 * The same carry, for the throw partition.
 *
 * A throw's fingerprint is its script, its disposition and the message it prints --
 * the three derived columns. Disposition belongs in it because the same message under
 * two dispositions is two different claims: a `throw new Error('usage')` that moves
 * out of a function changes from `fatal` to `unguarded`, and the proof written for the
 * first does not describe the second.
 */
export function carryThrowAnnotations(rows, priorRows) {
  const result = carryColumns(rows, priorRows, (row) =>
    [row.script, row.disposition ?? '', row.message ?? ''].join('\u0000'),
  );
  return {
    rows: result.rows,
    carried: result.carried,
    priorAnnotated: result.priorAnnotated,
    strays: result.strays,
  };
}

/**
 * Attach the hand-authored columns to the rows they describe, matching by
 * fingerprint and preferring a row that has not moved.
 *
 * Shared by sites and throws so that the two cannot drift apart in *how* they carry
 * a proof: the failure this fixes -- a moved line dropping a proof from a row that
 * did not change -- was found once and would otherwise have to be found again.
 */
/** The columns an annotation occupies, in the order a row carries them. */
const ANNOTATION_COLUMNS = ['status', 'provedBy', 'statement', 'heldBy', 'mutant', 'reason'];

/**
 * The annotation every carrier of one fingerprint holds, when they all hold the same one.
 *
 * The fingerprint is silent for the six `rethrow error` statements in `publish.mjs` and for
 * the two `the plan carries a blob` refusals in it: same script, same disposition, same
 * message. The line was the only evidence left, and any edit above them erased it -- which
 * is the accident the fingerprint was introduced to survive, still happening one degree
 * down. Eight annotations were dropped by a round that added one throw in the middle of that
 * file, and the gate then asked for eight proofs that already existed.
 *
 * When *every* prior carrier of a fingerprint holds the same annotation, the annotation is a
 * property of the fingerprint rather than of a coordinate, and carrying it is not a guess:
 * whichever occurrence this site is, the proof written for it is the same proof. When two
 * carriers disagree -- one proved, one exempt for its own reason -- no rule can choose, and
 * the site keeps nothing, because a wrong proof is worse than a missing one.
 */
function unanimous(candidates) {
  const annotated = candidates.filter((row) => row.status !== undefined);
  if (annotated.length === 0) return undefined;
  const [first] = annotated;
  const agrees = annotated.every((row) => ANNOTATION_COLUMNS.every((column) => row[column] === first[column]));
  return agrees ? first : undefined;
}

function carryColumns(rows, priorRows, fingerprint) {
  const pending = new Map();
  for (const row of priorRows) {
    const key = fingerprint(row);
    if (!pending.has(key)) pending.set(key, []);
    pending.get(key).push(row);
  }

  let carried = 0;
  const strays = [];
  const merged = rows.map((row) => {
    const candidates = pending.get(fingerprint(row)) ?? [];
    const before = candidates.length === 1
      ? candidates[0]
      : candidates.find((c) => c.line === row.line) ?? unanimous(candidates);
    if (before === undefined) {
      if (candidates.length > 0) strays.push(`${row.script}:${row.line}`);
      return row;
    }
    candidates.splice(candidates.indexOf(before), 1);
    const entry = { ...row };
    for (const column of ANNOTATION_COLUMNS) {
      if (before[column] !== undefined) entry[column] = before[column];
    }
    if (entry.status !== undefined) carried += 1;
    return entry;
  });

  return {
    rows: merged,
    carried,
    priorAnnotated: priorRows.filter((row) => row.status !== undefined).length,
    strays,
  };
}

function main() {
  const derived = derive();
  const text = serialise(derived);

  if (process.argv.includes('--stdout')) {
    process.stdout.write(text);
    return;
  }

  if (process.argv.includes('--check')) {
    const out = argValue('--out') ?? DEFAULT_OUT;
    if (!existsSync(out)) {
      fail([
        `no committed site table at ${out}.`,
        'Run `node scripts/derive-gate-sites.mjs` to write one.',
      ]);
    }
    const committed = JSON.parse(readFileSync(out, 'utf8'));
    const derivedSites = JSON.parse(text).sites;
    const derivedThrows = JSON.parse(text).throws;

    /**
     * Compare only the columns this script owns.
     *
     * The committed table carries hand-authored columns as well --
     * `status`, `provedBy`, `statement`, `heldBy`, `mutant` and `reason` -- recording
     * which test proves each site, what an exemption claims, which edit falsifies it,
     * and why the line itself cannot be reached. Comparing whole objects would report every
     * annotated site as "the guard's text changed", because the derived side has
     * no annotations to match. That is not drift; it is the annotation doing its
     * job, and a check that cannot tell the two apart fails on every correct
     * tree and then gets deleted.
     */
    const owned = (site) => {
      const entry = { script: site.script, line: site.line };
      if (site.condition !== undefined) entry.condition = site.condition;
      if (site.diagnostic !== undefined) entry.diagnostic = site.diagnostic;
      if (site.verdict !== undefined) entry.verdict = site.verdict;
      return entry;
    };
    const ownedThrow = (row) => ({ script: row.script, line: row.line, disposition: row.disposition, message: row.message });
    const same =
      JSON.stringify(committed.sites.map(owned)) === JSON.stringify(derivedSites.map(owned)) &&
      committed.scanned === derived.scanned &&
      JSON.stringify(committed.excluded) === JSON.stringify(derived.excluded) &&
      JSON.stringify((committed.throws?.rows ?? []).map(ownedThrow)) ===
        JSON.stringify(derivedThrows.rows.map(ownedThrow)) &&
      JSON.stringify(committed.throws?.counts) === JSON.stringify(derivedThrows.counts);

    if (!same) {
      const key = (s) => `${s.script}:${s.line}`;
      const have = new Set((committed.sites ?? []).map(key));
      const want = new Set(derivedSites.map(key));
      const added = derivedSites.filter((s) => !have.has(key(s))).map(key);
      const removed = (committed.sites ?? []).filter((s) => !want.has(key(s))).map(key);
      const moved = derivedSites
        .filter((s) => have.has(key(s)))
        .filter((s) => {
          const before = committed.sites.find((c) => key(c) === key(s));
          return JSON.stringify(owned(before)) !== JSON.stringify(owned(s));
        })
        .map((s) => `${key(s)} — the guard's text changed, so the fingerprint must move with it`);
      const priorThrows = (committed.throws?.rows ?? []).map(ownedThrow);
      const throwKey = (row) => `${row.script}:${row.line}`;
      const haveThrow = new Set(priorThrows.map(throwKey));
      const wantThrow = new Set(derivedThrows.rows.map(throwKey));
      const throwsAdded = derivedThrows.rows.filter((r) => !haveThrow.has(throwKey(r))).map(throwKey);
      const throwsRemoved = priorThrows.filter((r) => !wantThrow.has(throwKey(r))).map(throwKey);
      const throwsMoved = derivedThrows.rows
        .filter((r) => haveThrow.has(throwKey(r)))
        .filter((r) => {
          const before = priorThrows.find((c) => throwKey(c) === throwKey(r));
          return JSON.stringify(before) !== JSON.stringify(ownedThrow(r));
        })
        .map((r) => `${throwKey(r)} — the throw's disposition or message changed`);
      fail([
        `${out} is stale.`,
        ...(added.length ? ['', 'sites present in the tree and absent from the table:', ...added.map((k) => `  ${k}`)] : []),
        ...(removed.length ? ['', 'sites in the table and absent from the tree:', ...removed.map((k) => `  ${k}`)] : []),
        ...(moved.length ? ['', 'sites whose fingerprint no longer matches:', ...moved.map((k) => `  ${k}`)] : []),
        ...(throwsAdded.length ? ['', 'throws present in the tree and absent from the table:', ...throwsAdded.map((k) => `  ${k}`)] : []),
        ...(throwsRemoved.length ? ['', 'throws in the table and absent from the tree:', ...throwsRemoved.map((k) => `  ${k}`)] : []),
        ...(throwsMoved.length ? ['', 'throws whose classification no longer matches:', ...throwsMoved.map((k) => `  ${k}`)] : []),
        '',
        'Run `node scripts/derive-gate-sites.mjs` and add a `status` for any new fatal site.',
      ]);
    }
    console.log(
      `derive-gate-sites: OK (${derivedSites.length} failure site(s) across ` +
        `${new Set(derivedSites.map((s) => s.script)).size} script(s); ` +
        `throws: ${Object.entries(derivedThrows.counts)
          .map(([kind, n]) => `${n} ${kind}`)
          .join(', ')}; ` +
        `excluded: ${Object.entries(derived.excluded)
          .map(([kind, n]) => `${n} ${kind}`)
          .join(', ')})`,
    );
    return;
  }

  const out = argValue('--out') ?? DEFAULT_OUT;

  const prior = existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : { sites: [] };
  const carried = carryAnnotations(derived.sites, prior.sites ?? []);
  const carriedThrows = carryThrowAnnotations(derived.throws.rows, prior.throws?.rows ?? []);
  const merged = {
    ...derived,
    sites: carried.sites,
    throws: { counts: derived.throws.counts, rows: carriedThrows.rows },
  };

  writeFileSync(out, serialise(merged));
  console.log(
    `${derived.sites.length} failure site(s) across ` +
      `${new Set(derived.sites.map((s) => s.script)).size} of ${derived.scanned} script(s)`,
  );
  console.log(
    `throws: ${Object.entries(derived.throws.counts)
      .map(([kind, n]) => `${n} ${kind}`)
      .join(', ')} -- ${String(derived.throws.counts.fatal + derived.throws.counts.unguarded + derived.throws.counts.guarded + derived.throws.counts.rethrow)} statement(s) partitioned`,
  );
  console.log(
    `annotations: ${carried.carried} of ${carried.priorAnnotated} carried` +
      (carried.carried === carried.priorAnnotated
        ? ''
        : `, ${carried.priorAnnotated - carried.carried} dropped (their guard text changed, or ` +
          'their site is gone)' +
          (carried.strays.length > 0 ? `; ambiguous: ${carried.strays.join(', ')}` : '')),
  );
  console.log(
    `throw annotations: ${carriedThrows.carried} of ${carriedThrows.priorAnnotated} carried` +
      (carriedThrows.carried === carriedThrows.priorAnnotated
        ? ''
        : `, ${carriedThrows.priorAnnotated - carriedThrows.carried} dropped` +
          (carriedThrows.strays.length > 0 ? `; ambiguous: ${carriedThrows.strays.join(', ')}` : '')),
  );
  console.log(`written to ${out}`);
}

// Guarded so the annotation carry can be imported by a test without the import
// re-deriving the table and writing it. The guard is the same one
// `inject-stability.mjs` carries for the same reason: a module that does its
// work on import cannot be measured from a test, and one that cannot be measured
// from a test is held only by whoever last read it.
const invokedDirectly =
  process.argv[1] !== undefined
  && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (invokedDirectly) main();
