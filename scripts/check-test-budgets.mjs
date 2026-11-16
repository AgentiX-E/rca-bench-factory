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
 * ### The denominator is the file's suite budget when it has one
 *
 * A file can state several numbers, and they are not all budgets for the clock that
 * decides a verdict: `typecheck-entrypoint.test.ts` states `RUN_TIMEOUT_MS =
 * 180_000`, which is how long it lets a spawned `pnpm` run -- not how long the test
 * may take. Taking the largest number in a file would give that test a 180-second
 * budget it does not have, and the rule would be measuring the wrong clock in the
 * flattering direction. So the applicable budget is the one a `describe` states,
 * which is what the test actually runs under (`suiteBudget`), and only when there is
 * none does the file's largest stated number stand in.
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
 * Strip comments, string literals and regex literals, so the reader sees code.
 *
 * The scanner is the one `test/timeout-budget.test.ts` documents: four modes, a
 * regex decided by the last significant character, and the keyword exceptions for
 * `return /re/`. It is here because this script runs without a build step, and the
 * alternative -- importing a `.ts` test helper -- would be a script that cannot run
 * where it is needed.
 */
export function stripCommentsAndStrings(source) {
  let out = '';
  let i = 0;
  const context = () => {
    const trimmed = out.replace(/\s+$/, '');
    return { ch: trimmed.slice(-1), word: /([A-Za-z_$][\w$]*)$/.exec(trimmed)?.[1] ?? '' };
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
  const startsRegex = () => {
    const { ch, word } = context();
    if (ch === '') return true;
    if (REGEX_AFTER_WORD.has(word)) return true;
    return '([{,;:=!&|?+-*%~^<>'.includes(ch);
  };
  while (i < source.length) {
    const two = source.slice(i, i + 2);
    if (two === '//') {
      const nl = source.indexOf('\n', i);
      i = nl === -1 ? source.length : nl;
      continue;
    }
    if (two === '/*') {
      const end = source.indexOf('*/', i + 2);
      i = end === -1 ? source.length : end + 2;
      continue;
    }
    const ch = source[i];
    if (ch === '"' || ch === "'" || ch === '`') {
      const quote = ch;
      i += 1;
      while (i < source.length) {
        if (source[i] === '\\') {
          i += 2;
          continue;
        }
        if (source[i] === quote) {
          i += 1;
          break;
        }
        i += 1;
      }
      out += '""';
      continue;
    }
    if (ch === '/' && startsRegex()) {
      i += 1;
      while (i < source.length) {
        if (source[i] === '\\') {
          i += 2;
          continue;
        }
        if (source[i] === '/') {
          i += 1;
          break;
        }
        i += 1;
      }
      out += '/re/';
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
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
 * The budget the clock that decides a verdict is actually given.
 *
 * The suite's, if it states one; otherwise the file's largest stated number, which
 * is the best a reader without a resolver can do; otherwise `0`, meaning "inherits
 * the default" and answering the discovery rule rather than the fraction rule.
 */
export function effectiveBudget(source) {
  const suite = suiteBudget(source);
  if (suite !== undefined) return suite;
  const values = statedBudgets(source);
  return values.length === 0 ? 0 : Math.max(...values);
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
    const budget = effectiveBudget(source);
    const share = budget === 0 ? Infinity : file.worst / budget;
    if (budget > 0) declared += 1;
    if (file.worst >= options.floor) nearDefault += 1;

    if (budget === 0) {
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
          `${budget} ms, which is ${share.toFixed(2)} of it; the rule asks for ${options.share}x -- ` +
          `'${file.title.slice(0, 80)}'`,
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
      `${nearDefault} have a test at or above ${options.floor} ms, ${proximity})`,
  );
}

main();
