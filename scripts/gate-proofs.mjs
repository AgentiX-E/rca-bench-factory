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


/**
 * The source with its comments removed, and its strings left alone.
 *
 * ## Why this is not `source.replace(/\/\/.*$/gm, '')`
 *
 * A naive stripper truncates a line at the first `//`, and this tree is full of
 * `https://` inside string literals -- so it would delete the half of the line that
 * matters and keep the half that does not. The scanner below tracks which of the
 * three quoting states it is in, and treats `//` and `/*` as syntax only outside
 * them. Escapes are honoured so that `'it\'s'` does not end a string early.
 *
 * It is not a parser and does not claim to be: a template literal with an embedded
 * `${}` containing a comment would be misread. Nothing in this tree writes one, and
 * the failure mode is a false "names it", which the caller already tolerates.
 */
export function stripComments(source) {
  let out = '';
  let i = 0;
  let quote = null;
  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];
    if (quote !== null) {
      out += ch;
      if (ch === '\\') {
        out += next ?? '';
        i += 2;
        continue;
      }
      if (ch === quote) quote = null;
      i += 1;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      out += ch;
      i += 1;
      continue;
    }
    if (ch === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') i += 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i += 1;
      i += 2;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
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
