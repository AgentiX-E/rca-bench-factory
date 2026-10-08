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
 *   - a call to `process.exit(...)` whose argument *is* the literal `1`.
 *
 * Deliberately **not** counted:
 *
 *   - `process.exit(0)` -- a success exit is not a failure site.
 *   - `process.exit(2)` -- used by `score-fault-extraction.mjs` for "the
 *     measurement ran and missed the threshold", which is a different claim
 *     from "the gate refused", and is pinned by its own test.
 *   - `process.exit(cond ? 0 : 1)` -- a *computed* exit. The gate's judgement
 *     and the process status are the same expression, so there is no separate
 *     branch to falsify; the condition is what carries the meaning, and the
 *     enumeration would be counting syntax rather than guards.
 *
 * Every one of those exclusions is a claim about this tree, so the script prints
 * the tally it excluded alongside the tally it kept. A rule that only reports
 * what it kept cannot be checked against what it dropped.
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
 * The scan strips comments before looking for exits. `check-readme-sample.mjs`
 * explains its own dead branch in a comment that quotes the code shape, and
 * `gates-are-testable.test.ts` quotes several gates verbatim; a naive grep
 * counts those. Comments are removed with a scanner that tracks string and
 * template state rather than a regex, because a line-comment marker inside a URL
 * and a block-comment terminator inside a string both defeat the regex form --
 * and this repository has both. (Naming either marker literally in this comment
 * would terminate it, which is the same trap in miniature.)
 *
 * Nothing is stripped for the *fingerprint*, which is read from the raw text:
 * the diagnostic is a string literal and stripping would delete it.
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
 * `diagnostic` -- and three hand-authored ones: `status`, `provedBy`, `reason`,
 * recording which test proves each site. This script owns only the first four.
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
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

const SCRIPTS = resolve(ROOT, 'scripts');
const DEFAULT_OUT = resolve(ROOT, 'golden-master', 'gate-sites.json');

/**
 * The literal that marks a failure exit. Present as a constant so the rule above
 * and the code below cannot drift apart.
 */
const FAILURE_EXIT = '1';

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
 * Source with comments replaced by spaces, preserving offsets and line breaks.
 *
 * A character scanner rather than a regex, and the reason is not fastidiousness:
 * the tree contains `'http://...'` (a `//` inside a string) and this very file
 * contains `'/\\*'` (a comment opener inside a string). A regex gets one of them
 * wrong and the failure is silent -- a comment that survives the strip is a
 * phantom site, and a string that gets eaten is a missing one.
 *
 * Spaces rather than deletion so every byte keeps its offset, which is what
 * makes line numbers from the stripped text valid against the original.
 */
function stripComments(source) {
  const out = source.split('');
  const blank = (i) => {
    if (out[i] !== '\n') out[i] = ' ';
  };
  let state = 'code';
  let quote = '';
  for (let i = 0; i < source.length; i += 1) {
    const c = source[i];
    const next = source[i + 1];
    if (state === 'code') {
      if (c === '/' && next === '/') {
        state = 'line-comment';
        blank(i);
        blank(i + 1);
        i += 1;
        continue;
      }
      if (c === '/' && next === '*') {
        state = 'block-comment';
        blank(i);
        blank(i + 1);
        i += 1;
        continue;
      }
      if (c === '"' || c === "'" || c === '`') {
        state = 'string';
        quote = c;
        continue;
      }
      continue;
    }
    if (state === 'line-comment') {
      if (c === '\n') {
        state = 'code';
        continue;
      }
      blank(i);
      continue;
    }
    if (state === 'block-comment') {
      if (c === '*' && next === '/') {
        blank(i);
        blank(i + 1);
        i += 1;
        state = 'code';
        continue;
      }
      blank(i);
      continue;
    }
    // state === 'string'
    if (c === '\\') {
      i += 1; // Skip the escaped character so `\'` does not close the string.
      continue;
    }
    if (c === quote) state = 'code';
  }
  return out.join('');
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
 * A printable fingerprint for a site, read from the raw source.
 *
 * Two halves, either of which may be absent:
 *
 *   - `condition`: the predicate of the nearest enclosing `if`, scanning
 *     backwards. A gate that exits from inside `fail(...)` has none, and that
 *     absence is itself informative -- it means the condition lives at the call
 *     site rather than next to the exit.
 *   - `diagnostic`: the longest string literal in the nearest preceding
 *     diagnostic call's first argument.
 */
function fingerprint(rawLines, index) {
  let condition;
  for (let j = index - 1; j >= 0 && j > index - 60; j -= 1) {
    const match = /^\s*\}?\s*if\s*\((.*)\)\s*\{\s*$/.exec(rawLines[j]);
    if (match) {
      condition = match[1].trim();
      break;
    }
    // A `throw` or a bare statement at column 0 ends the enclosing block; the
    // exit is not inside an `if` at all, which is the case for `fail(...)`.
    if (/^[^\s}].*;\s*$/.test(rawLines[j]) && !/^\s*(const|let|var|return|await)\b/.test(rawLines[j])) {
      break;
    }
  }

  let diagnostic;
  for (let j = index - 1; j >= 0 && j > index - 60; j -= 1) {
    // `console.log` is included alongside the two error channels because one
    // gate in this tree reports through it: `verify-scorer-stability.mjs` prints
    // its FAILED summary with `console.log` because the whole script is a
    // report. Excluding it left that site with no fingerprint at all, which is
    // the least useful answer -- it reads identically to "the guard has no
    // diagnostic", which is a different and much stronger claim.
    if (!/(console\.(?:error|log)|process\.stderr\.write)\s*\(/.test(rawLines[j])) continue;
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

  return { condition, diagnostic };
}

/**
 * Every failure site in one script, in line order.
 *
 * The line is a 1-based index into the *original* text, which the offset-
 * preserving strip preserves.
 */
/**
 * Whether a stripped line is a *statement* calling `process.exit` with the
 * failure argument.
 *
 * Three shapes must not count, and each was found by this script reporting a
 * site in itself:
 *
 *   1. The call appearing as part of a longer expression --
 *      `process.exit(${FAILURE_EXIT})` inside a template literal used to build a
 *      diagnostic string. That was this script's own line 109.
 *   2. The call inside a *predicate* rather than a statement, e.g.
 *      `if (!line.includes('process.exit(1)'))`. That was its line 282: the
 *      pattern being searched for, not a site.
 *   3. A definition or a comparison rather than a call.
 *
 * The rule that separates them: the match must be a *call statement* -- the
 * first thing on its line (possibly after `}` and/or `else`), so what follows is
 * the rest of a statement. That is stricter than "contains", and it is the
 * difference between counting guards and counting mentions of guards.
 */
function isFailureExitStatement(line) {
  const pattern = new RegExp(
    `(?:^|[;{}\\s])process\\.exit\\(\\s*${FAILURE_EXIT}\\s*\\)\\s*;?\\s*$`,
  );
  if (!pattern.test(line)) return false;
  // Reject a match that is an argument to, or the subject of, something else --
  // `assert(process.exit(1))`, `.map((x) => process.exit(1))`. The statement
  // rule above already excludes the ones in this tree; this is the belt.
  const head = line.slice(0, line.indexOf('process.exit'));
  return !/[.(?=&|]\s*$/.test(head) || /[;{})\s]$/.test(head);
}

function sitesIn(name, source) {
  void name;
  const rawLines = source.split('\n');
  const stripped = stripComments(source).split('\n');
  const sites = [];
  stripped.forEach((line, i) => {
    if (!isFailureExitStatement(line)) return;
    const { condition, diagnostic } = fingerprint(rawLines, i);
    sites.push({ line: i + 1, condition, diagnostic });
  });
  return sites;
}

/**
 * Classify a statement-position `process.exit(...)` by its argument.
 *
 * The argument is extracted by **balanced parentheses**, not by a `[^)]*`
 * character class. That class stops at the first `)` it meets, so
 * `process.exit(main())` and `process.exit(a ? b() : c)` were both read as the
 * argument `main(` and `a ? b(` -- and because the extraction was inside a
 * `matchAll` loop, the remainder of the line was then re-scanned and produced
 * *additional* phantom entries. Measured, the tally came out thirty-seven
 * `numeric_other` against a hand count of one, which is the kind of wrong
 * number that reads as a finding.
 *
 * Returns `undefined` when the line has no statement-position exit at all.
 */
function exitArgument(line) {
  const head = /^\s*\}?\s*(?:else\s+)?process\.exit\s*\(/.exec(line);
  if (!head) return undefined;
  const open = line.indexOf('(', head.index) + 1;
  let depth = 1;
  for (let i = open; i < line.length; i += 1) {
    if (line[i] === '(') depth += 1;
    else if (line[i] === ')') {
      depth -= 1;
      if (depth === 0) return line.slice(open, i).trim();
    }
  }
  // An unclosed call spans lines. This tree has none, and reporting it as its
  // own class means a future one is visible rather than silently dropped.
  return undefined;
}

/**
 * The exits the rule deliberately drops, so the dropped set is reported.
 *
 * An enumeration gate that only prints what it kept cannot be checked against
 * what it threw away: "38 sites" is only meaningful next to "and these others
 * were excluded for these reasons". Reporting the kept tally alone is how the
 * roadmap's hand-written table came to say 25.
 *
 * The counts are therefore *disjoint* from `sitesIn` and the two add up to every
 * statement-position exit in the tree. The first version of this function did
 * not subtract the failure sites, so it reported `numeric_other: 38` -- which is
 * the number of `process.exit(1)` calls, read back under a label that means
 * "some other numeric status". A tally that double-counts what it exists to
 * complement is worse than no tally, because it looks like corroboration.
 */
function excludedIn(source) {
  const stripped = stripComments(source).split('\n');
  const counts = { zero: 0, numeric_other: 0, computed: 0, multiline: 0 };
  for (const line of stripped) {
    // Only a *statement* exit is a candidate at all. A call that appears inside
    // a string, a predicate or another expression is neither counted nor
    // excluded -- it is not an exit, so putting it in either tally would make
    // both wrong. The first run of this script counted its own pattern-matching
    // lines as sites for exactly this reason.
    if (!/process\.exit\s*\(/.test(line)) continue;
    const arg = exitArgument(line);
    if (arg === undefined) {
      if (/^\s*\}?\s*(?:else\s+)?process\.exit\s*\(/.test(line)) counts.multiline += 1;
      continue;
    }
    if (arg === FAILURE_EXIT) continue; // Kept by `sitesIn`; not an exclusion.
    if (arg === '0') counts.zero += 1;
    else if (/^\d+$/.test(arg)) counts.numeric_other += 1;
    else counts.computed += 1;
  }
  return counts;
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
  const excluded = { zero: 0, numeric_other: 0, computed: 0 };
  for (const file of files) {
    const source = readFileSync(join(SCRIPTS, file), 'utf8');
    for (const site of sitesIn(file, source)) sites.push({ script: `scripts/${file}`, ...site });
    const dropped = excludedIn(source);
    excluded.zero += dropped.zero;
    excluded.numeric_other += dropped.numeric_other;
    excluded.computed += dropped.computed;
  }

  return { sites, excluded, scanned: files.length };
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
 * produces byte-identical text for an unchanged tree. The three hand-authored
 * columns are appended after them when present, in their own fixed order.
 *
 * Carrying the annotations through is the whole reason this function cannot
 * simply rebuild each entry from a schema. It used to do exactly that, and the
 * effect was that every plain run silently discarded the proof record: the merge
 * in `main()` restored the columns and this function then dropped them again.
 * The derived text looked perfect, which is why it took a round trip to notice.
 */
function serialise({ sites, excluded, scanned }) {
  const payload = {
    rule: 'process.exit(1) with a literal argument; see scripts/derive-gate-sites.mjs',
    scanned,
    excluded,
    sites: sites.map((s) => {
      const entry = { script: s.script, line: s.line };
      if (s.condition) entry.condition = s.condition;
      if (s.diagnostic) entry.diagnostic = s.diagnostic;
      if (s.status) entry.status = s.status;
      if (s.provedBy) entry.provedBy = s.provedBy;
      if (s.reason) entry.reason = s.reason;
      return entry;
    }),
  };
  return `${JSON.stringify(payload, null, 2)}\n`;
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

    /**
     * Compare only the columns this script owns.
     *
     * The committed table carries three hand-authored columns as well --
     * `status`, `provedBy` and `reason` -- recording which test proves each site
     * and why any site is exempt. Comparing whole objects would report every
     * annotated site as "the guard's text changed", because the derived side has
     * no annotations to match. That is not drift; it is the annotation doing its
     * job, and a check that cannot tell the two apart fails on every correct
     * tree and then gets deleted.
     */
    const owned = (site) => {
      const entry = { script: site.script, line: site.line };
      if (site.condition !== undefined) entry.condition = site.condition;
      if (site.diagnostic !== undefined) entry.diagnostic = site.diagnostic;
      return entry;
    };
    const same =
      JSON.stringify(committed.sites.map(owned)) === JSON.stringify(derivedSites.map(owned)) &&
      committed.scanned === derived.scanned &&
      JSON.stringify(committed.excluded) === JSON.stringify(derived.excluded);

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
      fail([
        `${out} is stale.`,
        ...(added.length ? ['', 'sites present in the tree and absent from the table:', ...added.map((k) => `  ${k}`)] : []),
        ...(removed.length ? ['', 'sites in the table and absent from the tree:', ...removed.map((k) => `  ${k}`)] : []),
        ...(moved.length ? ['', 'sites whose fingerprint no longer matches:', ...moved.map((k) => `  ${k}`)] : []),
        '',
        'Run `node scripts/derive-gate-sites.mjs` and add a `status` for any new site.',
      ]);
    }
    console.log(
      `derive-gate-sites: OK (${derivedSites.length} failure site(s) across ` +
        `${new Set(derivedSites.map((s) => s.script)).size} script(s); ` +
        `${derived.excluded.zero} success exit(s), ${derived.excluded.numeric_other} other ` +
        `numeric exit(s), ${derived.excluded.computed} computed exit(s) excluded)`,
    );
    return;
  }

  const out = argValue('--out') ?? DEFAULT_OUT;

  /**
   * Carry the annotation columns across a rewrite.
   *
   * Re-deriving used to overwrite the whole file, which silently discarded
   * every `status`, `provedBy` and `reason` -- the three columns that are the
   * only reason the table is more than a list. The operator's next commit would
   * then delete the proof record, and the guard in
   * `packages/core/test/gate-sites-are-proven.test.ts` would fail on `main` with
   * no indication that the cause was this script rather than a real gap.
   *
   * Annotations are matched by `script:line` and dropped for a site that no
   * longer exists, so a moved guard loses a stale proof rather than inheriting a
   * wrong one. The new site comes back unannotated, and the guard fails until
   * someone adds a `status` -- which is the intended pressure.
   */
  const prior = existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : { sites: [] };
  const annotations = new Map(
    (prior.sites ?? []).map((s) => [`${s.script}:${s.line}`, s]),
  );
  const merged = {
    ...derived,
    sites: derived.sites.map((site) => {
      const before = annotations.get(`${site.script}:${site.line}`);
      if (before === undefined) return site;
      const entry = { ...site };
      for (const column of ['status', 'provedBy', 'reason']) {
        if (before[column] !== undefined) entry[column] = before[column];
      }
      return entry;
    }),
  };

  writeFileSync(out, serialise(merged));
  console.log(
    `${derived.sites.length} failure site(s) across ` +
      `${new Set(derived.sites.map((s) => s.script)).size} of ${derived.scanned} script(s)`,
  );
  console.log(`written to ${out}`);
}

main();
