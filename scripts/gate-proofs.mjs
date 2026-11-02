#!/usr/bin/env node
/**
 * Reading a hollowed run: which test files went red, and whether the inventory's
 * claims about them held.
 *
 * ## Why this is a module rather than part of the gate
 *
 * `verify-gates-are-testable.mjs` is a gate, and a gate is proved by being emptied
 * (`UNATTRIBUTED` otherwise) -- so no test may import it. The parsing below is the
 * part worth testing: it reads a reporter's output, and a first version of it
 * matched a path in the `×` line, found none in any gate, and reported "0 of 4
 * naming file(s)" for all 42 of them. A measurement that is wrong in the safe
 * direction is indistinguishable from a finding, which is exactly why it needs a
 * test with a canned transcript rather than a run of the real thing.
 *
 * ## What it does not decide
 *
 * Nothing. `classify` returns a verdict word and the facts behind it; the gate
 * decides what to do with them.
 */

import ts from 'typescript';


/**
 * The comment ranges in a text, as the compiler reports them.
 *
 * ## Why the parser and not a scanner
 *
 * This file carried a hand-written scanner -- quotes, escapes, `//` and block
 * markers, three states -- and documented its own limit ("a template literal with
 * an embedded `${}` containing a comment would be misread"). Measured, the limit is
 * wider than that: the scanner desyncs in **28 of the 219 test files**, and it
 * desyncs on the same character as the two scanners in `derive-gate-sites.mjs`: a
 * quote or a backtick spelled inside a **regex literal**, or a template holding a
 * substitution. Once the scanner thinks it is inside a string, every comment after
 * that point survives the strip.
 *
 * Where it survives, a sentence about a gate reads as a use of the gate -- which is
 * precisely the distinction `namesInCode` exists to draw. Measured against the
 * compiler, two published decisions changed: `apply-pins.mjs` and
 * `check-no-mock.mjs` were each credited to `gate-sites-are-proven.test.ts` by a
 * comment. Neither verdict moves today, because each gate has three or four other
 * files that name it in code; a defect that changes no answer today is the only
 * kind that survives long enough to change one later.
 *
 * ## Why the tokens, and then the gaps between them
 *
 * The compiler's own `getLeadingCommentRanges` is the obvious tool and it is not
 * usable here: asked at a token's full start it returns nothing for
 * `const a = 1; // x`, while `getTrailingCommentRanges` at the same offset returns
 * the comment. Whatever the intent of the pair, a reader built on it would silently
 * keep the comments it failed to see -- the same failure the scanner had.
 *
 * So the file is read for its **token boundaries**, and each gap between two
 * adjacent boundaries is scanned for trivia. That is exact rather than heuristic:
 * a string is a token, so no string can straddle a gap, and a gap holds only
 * whitespace and comments. A `//` inside a regex literal is inside a token, not in
 * a gap. Anything in a gap that is neither whitespace nor a comment stops the scan
 * of that gap instead of being guessed at -- blanking code would be a silent,
 * one-directional error, and this function's whole job is to be wrong in the other
 * direction if it is wrong at all.
 */
function commentRanges(text) {
  const file = ts.createSourceFile('source.ts', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const bounds = new Set([0, text.length]);
  const walk = (node) => {
    const start = node.getStart(file);
    if (start >= 0) bounds.add(start);
    if (node.end >= 0) bounds.add(node.end);
    for (const child of node.getChildren(file)) walk(child);
  };
  walk(file);

  // Between two adjacent tokens there is nothing but whitespace and comments: a
  // string is a token, so no string can straddle a gap. That is why this scan is
  // exact where a whole-file scan is not -- there is no quote here to misread.
  const sorted = [...bounds].sort((a, b) => a - b);
  const found = [];
  for (let i = 0; i + 1 < sorted.length; i += 1) {
    let at = sorted[i];
    const end = sorted[i + 1];
    for (;;) {
      while (at < end && /\s/.test(text[at])) at += 1;
      if (at >= end) break;
      if (text.startsWith('//', at)) {
        const stop = text.indexOf('\n', at);
        const until = stop === -1 || stop > end ? end : stop;
        found.push({ pos: at, end: until });
        at = until;
        continue;
      }
      if (text.startsWith('/*', at)) {
        const stop = text.indexOf('*/', at + 2);
        if (stop === -1 || stop + 2 > end) break;
        found.push({ pos: at, end: stop + 2 });
        at = stop + 2;
        continue;
      }
      // Anything else in a gap is not trivia this function understands. Stop
      // rather than guess: blanking code is the one error that deletes evidence.
      break;
    }
  }
  return found;
}


/**
 * Every source read with its comments replaced by spaces.
 *
 * Memoised because the caller asks the same question about the same file once per
 * gate: `verify-gates-are-testable.mjs` filters 219 test files for each of 75
 * gates, which is 16,425 calls over 219 distinct texts. Without the memo that is
 * 16,425 parses; with it, 219.
 */
const WITHOUT_COMMENTS = new Map();


/**
 * The source with its comments removed, and its strings left alone.
 *
 * ## Why this is not `source.replace(/\/\/.*$/gm, '')`
 *
 * A naive stripper truncates a line at the first `//`, and this tree is full of
 * `https://` inside string literals -- so it would delete the half of the line that
 * matters and keep the half that does not.
 *
 * Spaces rather than deletion, so every byte keeps its offset: the answer is read
 * with `includes`, and the test asserts that code on the far side of a comment
 * survives verbatim.
 */
export function stripComments(source) {
  const text = String(source);
  const memo = WITHOUT_COMMENTS.get(text);
  if (memo !== undefined) return memo;
  const out = text.split('');
  for (const range of commentRanges(text)) {
    for (let i = range.pos; i < range.end; i += 1) {
      if (out[i] !== '\n') out[i] = ' ';
    }
  }
  const stripped = out.join('');
  WITHOUT_COMMENTS.set(text, stripped);
  return stripped;
}


/**
 * The test file a gate's own name predicts, as the nested run spells it.
 *
 * ## Why this is the pair that matters
 *
 * Reading the ten files behind finding 201's twenty unexplained pairs shows that each
 * names two to four gates and drives one: `gen-rcaeval-cases.test.ts` spawns
 * `gen-rcaeval-cases.mjs` and also asserts that a *different* script's name appears in
 * some output; `spread-append-guard.test.ts` holds a table of `{ file: 'scripts/…' }`
 * rows. Those pairs are incidental -- a file mentions a gate it does not run -- and no
 * source scan can separate "mentions in order to run" from "mentions in order to assert
 * about", which is why finding 200 retired that ratio.
 *
 * But one pair is not incidental by construction: **a gate's own test file**. If
 * `check-no-mock.mjs` has a `check-no-mock.test.ts` and emptying the gate leaves that
 * file green, the file named after the gate does not exercise it. That is the defect
 * this function makes askable, and it is a property of the tree rather than of a
 * judgement about prose.
 */
export function namesakeOf(gate) {
  const base = gate.replace(/^scripts\//, '').replace(/\.mjs$/, '');
  return `test/${base}.test.ts`;
}

/**
 * Whether a test file names the gate **in code**, which is a much narrower claim
 * than "contains the string".
 *
 * ## The measurement this replaced
 *
 * The meta-gate's first denominator was `source.includes(gate)`, and it counted
 * prose. `check-official.mjs` came out as `4 of 10 naming file(s)`, and reading the
 * ten showed why: one file drives it seventeen times, and the other nine are a
 * register key, a `DRIVES`-style list, and seven sentences that *mention* the file --
 * including one in `gate-sites-are-proven.test.ts` that reads "A file that mentions
 * `check-official.mjs` in a [comment]". The repository already knew the distinction;
 * the number did not.
 *
 * A comment is prose about the gate. A string or an identifier is the gate being
 * used. `namesInCode` therefore strips comments and keeps strings.
 */
export function namesInCode(source, gate) {
  return stripComments(String(source)).includes(gate);
}

/**
 * The test files `golden-master/gate-sites.json` names as this gate's proofs.
 *
 * ## Why this is read rather than trusted
 *
 * The inventory carries a `provedBy` for every failure site, and until now nothing
 * compared that claim with what happens when the gate is emptied. `CAUGHT` is a
 * verdict over "at least one test named the gate", so a gate can be caught by one
 * file while another file the inventory names never runs -- and the claim would
 * stay green. Finding 199 is that measurement.
 */
export function claimedProofs(inventory, gate) {
  const paths = new Set();
  for (const site of inventory.sites) {
    if (site.script.replace(/^scripts\//, '') !== gate) continue;
    if (typeof site.provedBy === 'string') paths.add(site.provedBy);
  }
  return [...paths].sort();
}

/**
 * The test files in which the hollowed run named a failing test.
 *
 * `classify` has already attributed each `×` line to the `❯ <file>` header above it;
 * this only strips the path prefix the nested run uses, because the inventory writes
 * paths from the repository root and this is the one place that has both.
 */
export function redFiles(outcome) {
  return (outcome.red ?? []).map((one) => one.replace(/^packages\/core\//, ''));
}

/**
 * Remove the SGR escapes vitest emits when colour is on.
 *
 * This script was written, run green here, and failed on its first CI run with
 * `caught: 0, survived: 13` -- every gate reported as unguarded. The cause was its
 * own detector: it looked for a line whose first non-space character is `×`, and
 * on a runner vitest colourises, so the line is `\x1b[31m×\x1b[39m …` and begins
 * with an escape. That is precisely the defect class this audit exists to find,
 * in the audit, and it is the fourth time this campaign has recorded it (findings
 * 147, 148, and twice in the readers they repaired).
 *
 * It was caught rather than tolerated because a SURVIVED gate fails the run: the
 * failure mode of this script is loud by construction, which is the only reason
 * the divergence between here and the runner surfaced at all.
 */
export function stripAnsi(text) {
  // eslint-disable-next-line no-control-regex
  return String(text).replace(/\u001b\[[0-9;]*m/g, '');
}

/**
 * Whether the nested run shows a failure, and whether its status agrees.
 *
 * ## Why the exit status alone is not the verdict
 *
 * `npx vitest run <files>` exits non-zero both when a test fails and when there is
 * nothing to run -- a suite that was never collected, a path that does not exist, a
 * syntax error introduced by the hollowing itself. Crediting any of those as CAUGHT
 * would be reading a crash as a proof, which is the false-green idiom this
 * repository rejects everywhere else.
 *
 * So both halves are required: the status must be non-zero **and** the output must
 * name at least one failing test. A run that fails without naming one is its own
 * state, reported as its own word, and fails the audit -- because it cannot be
 * credited to the gate.
 *
 * ## Why two reporter shapes are read
 *
 * The nested run is started without `--reporter`, so it prints `❯ <file>` followed
 * by `× <test>` lines. CI's logs quote the same failures as `FAIL <file> > <suite>
 * > <test>`, one line each. A parser that knew only the first shape would be right
 * on this machine and wrong wherever a transcript is pasted from the runner -- and
 * the second shape carries the file *on the failure line*, so it is also the only
 * place a `FAIL` line can be counted as a failure rather than as a header.
 */
export function classify(files, result) {
  const out = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  const lines = stripAnsi(out).split('\n');
  const failures = [];
  // Which *files* those failures were in, tracked as the output is read.
  //
  // The `×` line carries the test's name and nothing else; the file is on the
  // `❯ <path>` header above it. A first attempt matched a path in the `×` line
  // itself, found none in any of the 42 gates, and reported "0 of 4 naming file(s)"
  // for every one of them -- a measurement that is wrong in the safe direction looks
  // exactly like a finding.
  const red = new Set();
  let current = null;
  for (const line of lines) {
    const ci = /^\s*(?:FAIL|FAILED)\s+(?:packages\/core\/)?(test\/[\w.-]+\.test\.ts)/.exec(line);
    if (ci !== null) {
      current = ci[1];
      red.add(ci[1]);
      failures.push(line);
      continue;
    }
    const header = /^\s*\u276f\s+(?:packages\/core\/)?(test\/[\w.-]+\.test\.ts)/.exec(line);
    if (header !== null) {
      current = header[1];
      continue;
    }
    if (line.trim().startsWith('\u00d7')) {
      failures.push(line);
      if (current !== null) red.add(current);
    }
  }
  const shaped = { failures, red: [...red].sort() };
  const status = result.status ?? -1;
  if (status !== 0 && failures.length > 0) return { verdict: 'CAUGHT', ...shaped };
  if (status === 0) return { verdict: 'SURVIVED', ...shaped };
  return { verdict: 'UNATTRIBUTED', ...shaped, status, files };
}
