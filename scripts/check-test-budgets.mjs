#!/usr/bin/env node
/**
 * Every test's cost, read from a run, against the budget its file declares.
 *
 * ## The hole this fills
 *
 * `test/timeout-budget.test.ts` keeps a table of the files whose cost reaches
 * vitest's 5 000 ms default, and it says so itself, twice:
 *
 * > Found by a red run rather than by this table, which is the honest description
 * > of how the table is maintained: it can check every row it has and cannot
 * > discover a row it does not.
 *
 * Three of its rows arrived that way -- `reader-against-backend.test.ts`,
 * `publish.test.ts`, and `check-official-roundtrip.test.ts` before them -- and each
 * arrived as a red CI run on a commit that changed nothing relevant. A table that
 * grows only by failing is a table that has failed.
 *
 * The missing reader is the obvious one: a run already reports how long every test
 * took, and the file already states the budget it expects. Nothing compared them.
 *
 * ## What it reads, and what it refuses to guess
 *
 * The durations come from vitest's JSON report, written by `test:coverage` beside
 * its coverage output, so this costs one file read rather than a second suite. The
 * budget comes from the file's own source, in the four spellings vitest honours --
 * the same four `timeout-budget.test.ts` documents at length, including a name
 * resolved to its `const`, because a reader that knows fewer spellings than the
 * language fails in the direction of a false red and this repository has paid for
 * that three times.
 *
 * A file that states a budget is held to it: its slowest test may take at most
 * **half** it. Half rather than all of it, for a measured reason -- a file at 94%
 * of its budget was green by 282 milliseconds on the run before it went red -- and
 * half is the margin CI's own worst case needs, since the same bytes are up to
 * 3.1x slower under 32 workers than alone.
 *
 * ## The floor is decided by the box, so crossing it buys a declaration
 *
 * A test that spawns a process is charged by the scheduler far more than 3.1x. One
 * tree, three files, read alone and then inside the four-worker coverage run:
 * `fault-extraction-scripts` **202 -> 1 038 ms**, `gen-examples` **214 -> 1 820 ms**,
 * `docs-guards-need-history` **55 -> 1 487 ms**. The last one is 27x, and its true
 * cost is 55 ms -- a file that could never approach the default this floor protects.
 * The first full run after that reading named one file and the next named two others,
 * which is the same tree and the same floor: what moved was what else was running.
 * So the floor's false positives are answered here with a declaration on the file it
 * names, not with a lower floor -- a floor low enough to be quiet on a busy box would
 * be too low to catch the file the floor was built for -- and the declaration records
 * the two readings beside it, so the next reader can tell a spent allowance from a
 * real ceiling.
 *
 * A file that states **no** budget inherits vitest's default, and there the rule is
 * a floor: a test at or above a fifth of that default (1 000 ms) must have a
 * budget, because the default is what decided the verdict in every failure this
 * table has recorded. Below a fifth, the report's own numbers say the default is
 * nowhere near the decision (measured: 216 of 249 files state no budget and every
 * one of their tests is under 100 ms), and demanding a declaration there would be
 * demanding a number nobody needs.
 *
 * ### The denominator is the test's own budget, then its suite's, then the file's
 *
 * A file can state several numbers, and they are not all budgets for the clock that
 * decides a verdict: `typecheck-entrypoint.test.ts` states `RUN_TIMEOUT_MS =
 * 180_000`, which is how long it lets a spawned `pnpm` run -- not how long the test
 * may take. Taking the largest number in a file would give that test a 180-second
 * budget it does not have, and the rule would be measuring the wrong clock in the
 * flattering direction.
 *
 * So the number read is the one in force where the test is written: the timeout the
 * test states for itself, then the one its `describe` states (`suiteBudget`), then
 * the file's largest stated number, then nothing. `budgetInForce` returns the number
 * together with which of the four it was, because a reader who disagrees with a
 * verdict needs to know which declaration to go and argue with.
 *
 * The test's number comes first because that is the clock its verdict is decided by.
 * Until v3.104 the suite's came first unconditionally, and CI paid for it: run
 * 43944379177 reported `ingest-report.test.ts` at **15 199 ms against a stated
 * budget of 30 000 ms, which is 0.51 of it**, while the two tests that cost that
 * much each state `ROWS_TIMEOUT_MS = 120_000` on themselves -- 8x headroom, printed
 * as a 2x shortfall. A test that states a timeout does not run under its suite's,
 * so the denominator was a number the test had already replaced. That is the same
 * defect the four spellings above exist to avoid, one level up: the reader knew the
 * spelling for the *discovery* rule and not for the *fraction* rule.
 *
 * Reading the test's number first is stricter in the other direction, which is why
 * it is a repair rather than a relaxation: a test that states 10 000 inside a suite
 * that states 60 000 is now held to 10 000, and before it could spend 30 000 with
 * every run green.
 *
 *   node scripts/check-test-budgets.mjs --report <report.json>[,<report.json>]
 *   node scripts/check-test-budgets.mjs --report ... --floor 1000 --share 2
 */

import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';

/** vitest's default per-test timeout, the number an undeclared file inherits. */
export const VITEST_DEFAULT_MS = 5000;

function usage(message) {
  if (message !== undefined) console.error(`check-test-budgets: ${message}`);
  console.error('usage: check-test-budgets.mjs --report <path>[,<path>] [--floor <ms>] [--share <n>]');
  process.exit(1);
}

function args(argv) {
  const options = { reports: [], floor: Math.round(VITEST_DEFAULT_MS / 5), share: 2 };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--report') {
      const value = argv[(i += 1)];
      if (value === undefined) usage('--report requires a value');
      // A `for` loop rather than `push(...value.split(','))`: the spread passes one
      // argument per entry, and this file's own subject is a rule about costs that
      // arrive one at a time. `spread-append-guard.test.ts` would have asked anyway.
      for (const one of value.split(',')) {
        if (one !== '') options.reports.push(one);
      }
    } else if (flag === '--floor') {
      const value = Number(argv[(i += 1)]);
      if (!Number.isFinite(value) || value <= 0) usage('--floor requires a positive number of milliseconds');
      options.floor = value;
    } else if (flag === '--share') {
      const value = Number(argv[(i += 1)]);
      if (!Number.isFinite(value) || value <= 1) usage('--share requires a number greater than 1');
      options.share = value;
    } else usage(`unrecognised argument '${flag}'`);
  }
  if (options.reports.length === 0) usage('at least one --report is required');
  return options;
}

/**
 * The index just past the literal opened at `start` with `terminator`, or the end of
 * the source when it never closes.
 *
 * Unterminated is not a refusal here: this reader is pointed at files it does not own,
 * and a scanner that stopped would hide every budget below the last unbalanced quote.
 * What it must not do is take the quote it opened on for a closing one, which is why
 * the escape skip is inside the loop.
 */
function literalEnd(source, start, terminator) {
  let i = start + 1;
  while (i < source.length) {
    if (source[i] === '\\') {
      i += 2;
      continue;
    }
    if (source[i] === terminator) return i + 1;
    i += 1;
  }
  return source.length;
}

/**
 * Blank the comments, and the contents of the string and regex literals, so the
 * reader sees code -- at the same length as the source.
 *
 * The scanner is the one `test/timeout-budget.test.ts` documents: four modes, a regex
 * decided by the last significant character, and the keyword exceptions for
 * `return /re/`. It is here because this script runs without a build step, and the
 * alternative -- importing a `.ts` test helper -- would be a script that cannot run
 * where it is needed.
 *
 * ## Why blanked rather than removed, and why the quotes stay
 *
 * Removing is what this did until v3.104, and it is enough for a reader that only
 * matches patterns. It is not enough for a reader that has to find a *call* and then
 * read its title out of the original: an offset in the stripped text is not an offset
 * in the source once a comment is gone. Blanking keeps the two aligned, so a position
 * found here indexes the file it came from (`testBudgets`).
 *
 * The quote characters themselves are kept -- `""` and `/re/` became `"  "` and
 * `/  /` -- because the last-significant-character rule below reads them: a `/` after
 * a string is a division, and a scanner that had blanked the quotes too would see the
 * character before the string and read a regex. That is a false reading of the same
 * family as the four spellings this file already refuses to guess at.
 */
export function stripCommentsAndStrings(source) {
  const out = source.split('');
  const blank = (from, to) => {
    const end = Math.min(to, source.length);
    for (let k = Math.max(from, 0); k < end; k += 1) {
      if (source[k] !== '\n' && source[k] !== '\r') out[k] = ' ';
    }
  };
  const REGEX_AFTER_WORD = new Set([
    'return',
    'typeof',
    'instanceof',
    'in',
    'of',
    'new',
    'delete',
    'void',
    'case',
    'do',
    'else',
    'yield',
    'await',
    'throw',
  ]);
  // The last significant character, and the identifier that ends at it, carried
  // instead of recomputed: the previous version rescanned its own output at every
  // quote, which is quadratic in the size of the file and invisible until a file is
  // large. Both are left untouched by a blank, because a blank is whitespace.
  let last = '';
  let word = '';
  const note = (ch) => {
    if (/\s/.test(ch)) return;
    word = /[\w$]/.test(ch) ? `${word}${ch}` : '';
    last = ch;
  };
  const startsRegex = () => {
    if (last === '') return true;
    if (REGEX_AFTER_WORD.has(word)) return true;
    return '([{,;:=!&|?+-*%~^<>'.includes(last);
  };
  let i = 0;
  while (i < source.length) {
    const two = source.slice(i, i + 2);
    if (two === '//') {
      const nl = source.indexOf('\n', i);
      const end = nl === -1 ? source.length : nl;
      blank(i, end);
      i = end;
      continue;
    }
    if (two === '/*') {
      const close = source.indexOf('*/', i + 2);
      const end = close === -1 ? source.length : close + 2;
      blank(i, end);
      i = end;
      continue;
    }
    const ch = source[i];
    if (ch === '"' || ch === "'" || ch === '`') {
      const end = literalEnd(source, i, ch);
      blank(i + 1, end - 1);
      note(ch);
      i = end;
      continue;
    }
    if (ch === '/' && startsRegex()) {
      const end = literalEnd(source, i, '/');
      blank(i + 1, end - 1);
      note(ch);
      i = end;
      continue;
    }
    note(ch);
    i += 1;
  }
  return out.join('');
}

/** The number a named constant was declared with, or `undefined`. */
function constantValue(code, name) {
  const declared = new RegExp(`(?:const|let)\\s+${name}\\s*=\\s*([0-9][0-9_]*)`).exec(code);
  if (declared === null) return undefined;
  return Number(declared[1].replace(/_/g, ''));
}

/** Every budget the source states, in any of the four spellings vitest honours. */
export function statedBudgets(source) {
  const values = [];
  const code = stripCommentsAndStrings(source);
  for (const m of code.matchAll(/(?:const|let)\s+[A-Z_]*TIMEOUT_MS\s*=\s*([0-9_]+)/g)) {
    values.push(Number(m[1].replace(/_/g, '')));
  }
  for (const m of code.matchAll(/\{\s*timeout:\s*([A-Za-z_$][\w$]*|[0-9][0-9_]*)\s*\}/g)) {
    const raw = m[1];
    if (/^[0-9]/.test(raw)) values.push(Number(raw.replace(/_/g, '')));
    else {
      const resolved = constantValue(code, raw);
      if (resolved !== undefined) values.push(resolved);
    }
  }
  for (const m of code.matchAll(/,\s*([0-9][0-9_]*)\s*\)\s*;?/g)) {
    const value = Number(m[1].replace(/_/g, ''));
    if (value >= 1000) values.push(value);
  }
  return values;
}

/**
 * The budget a `describe` states, which is the one the test runs under.
 *
 * `undefined` when the file states none, rather than 0, because 0 is a budget and
 * this is the absence of one.
 */
export function suiteBudget(source) {
  const code = stripCommentsAndStrings(source);
  for (const m of code.matchAll(
    /\b(?:describe|suite)\s*\(\s*(?:""|[^,]+?)\s*,\s*\{\s*timeout\s*:\s*([A-Za-z_$][\w$]*|[0-9][0-9_]*)/g,
  )) {
    const raw = m[1];
    if (/^[0-9]/.test(raw)) return Number(raw.replace(/_/g, ''));
    const resolved = constantValue(code, raw);
    if (resolved !== undefined) return resolved;
  }
  return undefined;
}

/**
 * The budget the clock that decides a verdict is actually given, and where it is written.
 *
 * The test's own, if it states one, because a `it(name, fn, 120_000)` replaces the
 * suite's number for that test; then the suite's; then the file's largest stated
 * number, which is the best a reader without a resolver can do; then `none`, meaning
 * "inherits the default" and answering the discovery rule rather than the fraction
 * rule. Returning `statedBy` beside the number is what lets the report name the
 * declaration a reader would have to go and argue with.
 */
export function budgetInForce(source, testName) {
  const own = ownBudget(source, testName);
  if (own !== undefined) return { ms: own, statedBy: 'test' };
  const suite = suiteBudget(source);
  if (suite !== undefined) return { ms: suite, statedBy: 'suite' };
  const values = statedBudgets(source);
  if (values.length === 0) return { ms: 0, statedBy: 'none' };
  return { ms: Math.max(...values), statedBy: 'largest' };
}

/** How a report says where the number it measured against came from. */
const STATED_BY = {
  test: 'the one that test states',
  suite: 'the one its suite states',
  largest: 'the largest number the file states',
};

/** The budget one test states for itself, found by the title the report prints. */
function ownBudget(source, testName) {
  if (typeof testName !== 'string' || testName === '') return undefined;
  const budgets = testBudgets(source);
  if (budgets.size === 0) return undefined;
  const exact = budgets.get(testName);
  if (exact !== undefined) return exact;
  // The report prints a test as its ancestors and its title joined by spaces (`a
  // suite a test`), so the title is a suffix of it rather than a segment of its own.
  // The longest matching title wins, and a title that appears twice in a file is
  // already the smaller of its two numbers.
  let best;
  for (const [title, ms] of budgets) {
    if (!testName.endsWith(` ${title}`) && !testName.endsWith(` > ${title}`)) continue;
    if (best === undefined || title.length > best.title.length) best = { title, ms };
  }
  return best?.ms;
}

/** The characters that open and close a nested group inside an argument list. */
const OPENERS = '([{';
const CLOSERS = ')]}';

/** The argument slices of the call whose `(` sits at `open`, top level only. */
function callArguments(masked, open) {
  const args = [];
  let depth = 0;
  let start = open + 1;
  for (let i = open; i < masked.length; i += 1) {
    const ch = masked[i];
    if (OPENERS.includes(ch)) depth += 1;
    else if (CLOSERS.includes(ch)) {
      depth -= 1;
      if (depth === 0) {
        args.push([start, i]);
        return { args, close: i };
      }
    } else if (ch === ',' && depth === 1) {
      args.push([start, i]);
      start = i + 1;
    }
  }
  return { args, close: masked.length };
}

/**
 * The `(` positions of every `it`/`test` call, after any modifier it carries.
 *
 * `.each([...])` and `.skip` and `.concurrent` all sit between the name and the
 * argument list, and the argument list that follows them is the one that holds the
 * title. A sticky regex rather than `slice(i)` per attempt: the reader visits every
 * test in a file, and re-slicing the remainder of the source for each is quadratic in
 * a file that has four hundred of them.
 */
function testCallOpeners(masked) {
  const openers = [];
  const marker = /\b(?:it|test)\b/g;
  const DOT = /\s*\.\s*[A-Za-z_$][\w$]*/y;
  const PAREN = /\s*\(/y;
  let found;
  while ((found = marker.exec(masked)) !== null) {
    let i = found.index + found[0].length;
    for (;;) {
      DOT.lastIndex = i;
      const dot = DOT.exec(masked);
      if (dot === null) break;
      i += dot[0].length;
      PAREN.lastIndex = i;
      const group = PAREN.exec(masked);
      if (group === null) break;
      const open = i + group[0].length - 1;
      i = callArguments(masked, open).close + 1;
    }
    PAREN.lastIndex = i;
    const paren = PAREN.exec(masked);
    if (paren === null) continue;
    openers.push(i + paren[0].length - 1);
  }
  return openers;
}

/** The text a literal argument spells, or `null` when the argument is not a literal. */
function literalText(raw) {
  const text = raw.trim();
  const quote = text[0];
  if (quote !== '"' && quote !== "'" && quote !== '`') return null;
  let spelled = '';
  for (let i = 1; i < text.length; i += 1) {
    if (text[i] === '\\') {
      spelled += text[i + 1] ?? '';
      i += 1;
      continue;
    }
    if (text[i] === quote) return spelled;
    spelled += text[i];
  }
  return null;
}

/** The number an argument resolves to: a literal, or a name the file declares. */
function argumentNumber(masked, raw) {
  const text = raw.trim();
  if (/^[0-9][0-9_]*$/.test(text)) return Number(text.replace(/_/g, ''));
  if (/^[A-Za-z_$][\w$]*$/.test(text)) return constantValue(masked, text);
  return undefined;
}

/**
 * The budget each test states for itself, keyed by the title the report will print.
 *
 * ## The spelling this exists for
 *
 * `it('a test', () => {}, 120_000)` and `it('a test', { timeout: 120_000 }, fn)` both
 * give one test a clock of its own, and `ingest-report.test.ts` uses the first for the
 * two tests that read 130 000 rows. Its suite states 30 000 for everything else in the
 * file. The fraction rule read the suite's number for all four and reported the two
 * heavy ones as if they had 2x less room than they do -- which is finding 557.
 *
 * ## What it refuses to guess
 *
 * The options form is read only when the argument *starts* with `{`: a function body
 * that calls `spawnSync(cmd, args, { timeout: RUN_TIMEOUT_MS })` also holds
 * `timeout:`, and `typecheck-entrypoint.test.ts` is exactly that shape -- reading it
 * would hand a 180-second budget to a test that never asked for one, which is the
 * flattering direction this file refuses everywhere else.
 *
 * A title the report formats (`it.each([...])('rejects %s', ...)`) is not matched,
 * because the printed title is not the written one; such a test falls back to its
 * suite's budget. No file in the tree does both today, and the fallback is the strict
 * direction -- a suite number smaller than the test's own would be a false red, which
 * is loud, rather than a false green, which is what this whole file is against.
 */
export function testBudgets(source) {
  const masked = stripCommentsAndStrings(source);
  const budgets = new Map();
  for (const open of testCallOpeners(masked)) {
    const { args } = callArguments(masked, open);
    if (args.length < 2) continue;
    const title = literalText(source.slice(args[0][0], args[0][1]));
    if (title === null) continue;
    let stated;
    for (let a = 1; a < args.length; a += 1) {
      const raw = source.slice(args[a][0], args[a][1]);
      const option = /^\s*\{[\s\S]*\btimeout\s*:\s*([A-Za-z_$][\w$]*|[0-9][0-9_]*)/.exec(
        masked.slice(args[a][0], args[a][1]),
      );
      const value =
        option !== null
          ? argumentNumber(masked, option[1])
          : a === args.length - 1
            ? argumentNumber(masked, raw)
            : undefined;
      if (value === undefined) continue;
      stated = stated === undefined ? value : Math.min(stated, value);
    }
    if (stated === undefined) continue;
    const seen = budgets.get(title);
    budgets.set(title, seen === undefined ? stated : Math.min(seen, stated));
  }
  return budgets;
}

/** Every test in one report, flattened to the slowest per file. */
function slowestPerFile(report, problems) {
  const slowest = [];
  for (const result of report.testResults ?? []) {
    const path = result.name;
    if (typeof path !== 'string') {
      problems.push('a test result carries no file name, so its durations cannot be attributed');
      continue;
    }
    let worst = 0;
    let title = '';
    let count = 0;
    for (const assertion of result.assertionResults ?? []) {
      count += 1;
      const duration = Number(assertion.duration ?? 0);
      if (!Number.isFinite(duration)) {
        problems.push(`${path}: '${assertion.fullName ?? assertion.title}' reports a duration that is not a number`);
        continue;
      }
      if (duration > worst) {
        worst = duration;
        title = assertion.fullName ?? assertion.title ?? '';
      }
    }
    slowest.push({ path, worst, title, count });
  }
  return slowest;
}

function main() {
  const options = args(process.argv.slice(2));
  const problems = [];
  const files = [];
  let tests = 0;

  for (const report of options.reports) {
    const at = resolve(report);
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(at, 'utf8'));
    } catch (error) {
      // A missing report means the reading did not happen, and "no report" must not
      // print the same summary as "nothing over the line".
      problems.push(`${at}: ${error.message}`);
      continue;
    }
    for (const one of slowestPerFile(parsed, problems)) files.push(one);
  }

  let declared = 0;
  let onTheTest = 0;
  let nearDefault = 0;
  let closest = { path: '', share: 0, worst: 0, budget: 0 };

  for (const file of files) {
    tests += file.count;
    let source;
    try {
      source = readFileSync(file.path, 'utf8');
    } catch (error) {
      problems.push(`${file.path}: ${error.message}`);
      continue;
    }
    const inForce = budgetInForce(source, file.title);
    const budget = inForce.ms;
    const share = budget === 0 ? Infinity : file.worst / budget;
    if (budget > 0) declared += 1;
    if (inForce.statedBy === 'test') onTheTest += 1;
    if (file.worst >= options.floor) nearDefault += 1;

    if (inForce.statedBy === 'none') {
      if (file.worst >= options.floor) {
        problems.push(
          `${basename(file.path)}: its slowest test takes ${Math.round(file.worst)} ms and the file states no ` +
            `budget, so its verdict is decided by vitest's ${VITEST_DEFAULT_MS} ms default; state one on the ` +
            `suite -- '${file.title.slice(0, 80)}' is the test that will decide it`,
        );
      }
      continue;
    }

    if (share > closest.share) closest = { path: file.path, share, worst: file.worst, budget };
    if (file.worst * options.share > budget) {
      problems.push(
        `${basename(file.path)}: its slowest test takes ${Math.round(file.worst)} ms against a stated budget of ` +
          `${budget} ms, ${STATED_BY[inForce.statedBy]}, which is ${share.toFixed(2)} of it; the rule asks for ` +
          `${options.share}x -- '${file.title.slice(0, 80)}'`,
      );
    }
  }

  if (problems.length > 0) {
    for (const problem of problems) console.error(`check-test-budgets: ${problem}`);
    console.error(
      `check-test-budgets: FAILED (${problems.length} problem(s) across ${files.length} file(s); ` +
        `${declared} state a budget and ${nearDefault} have a test at or above ${options.floor} ms)`,
    );
    process.exit(1);
  }

  // "Nothing was over the line" and "nothing was read" print the same number of
  // failures, which is the shape this repository has repaired twice -- so an empty
  // reading is a failure of its own.
  if (files.length === 0 || tests === 0) {
    console.error(
      'check-test-budgets: FAILED (the report(s) named no test at all, so nothing was measured and this is ' +
        'not a pass)',
    );
    process.exit(1);
  }

  // "The closest to its budget" is a claim about a budget, so it is printed only
  // when some file states one. With none, the sentence would read "... at 0% of 0 ms"
  // -- a measurement of a clock no file was given, which is the shape of number this
  // repository keeps refusing to publish.
  const proximity =
    closest.budget === 0
      ? 'and no file states a budget, so nothing was measured against one'
      : `and the closest to its budget is ${basename(closest.path)} at ` +
        `${(closest.share * 100).toFixed(0)}% of ${closest.budget} ms`;
  console.log(
    `check-test-budgets: OK (${files.length} file(s), ${tests} test(s); ${declared} state a budget, ` +
      `${onTheTest} of them on the test that is slowest, ` +
      `${nearDefault} have a test at or above ${options.floor} ms, ${proximity})`,
  );
}

main();
