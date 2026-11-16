/**
 * What a test file says about its own clock, read from its source.
 *
 * A **data module**: it computes and it settles nothing. `check-test-budgets.mjs` holds
 * the verdict and imports this; `timeout-budget.test.ts` reads the same functions. The
 * split is not tidiness -- a gate is proved by being **emptied**, so a test may not
 * import one -- and the alternative is the one this repository already paid for: the
 * readings copied into the test file, where they drifted from the gate's copy, and the
 * copy that CI ran was the one nobody had repaired (findings 558 to 561).
 *
 * ## Four questions about one text, and why there are four
 *
 * `statedBudgets` answers "does this file state a number", `suiteBudget` answers "what
 * does its suite state", `testBudgets` answers "what does each test state for itself",
 * and `budgetInForce` answers the one the fraction rule needs: the number in force
 * where the test is written. The four spellings vitest honours are why the first of
 * those has four patterns -- a reader that knows fewer fails in the direction of a false
 * red, which this repository has paid for three times: `reader-against-backend.test.ts`
 * states `{ timeout: SUITE_BUDGET_MS }` on its suite, `fetch-official.test.ts` states
 * `300_000` positionally, and `check-cli-reference.test.ts` states an inline
 * `{ timeout: 30_000 }` on each of six tests. Each arrived as a file reported as stating
 * no budget while it stated one.
 */

/**
 * The index just past the literal opened at `start` with `terminator`, or the end of
 * the source when it never closes.
 *
 * Unterminated is not a refusal here: this reader is pointed at files it does not own,
 * and a scanner that stopped would hide every budget below the last unbalanced quote.
 * What it must not do is take the quote it opened on for a closing one, which is why
 * the escape skip is inside the loop.
 *
 * ## A pattern does not end at a slash inside a character class
 *
 * `[^/]` holds a slash and `[/"]` holds a slash and a quotation, and stopping at either
 * one left the rest of the pattern to be read as code -- in `[/"]` the quotation then
 * opened a string that ran to the next one in the file, swallowing every budget below
 * it. Until v3.105 this reader stopped at the first unescaped slash and the copy in
 * `test/timeout-budget.test.ts` did not, so two implementations of one documented rule
 * disagreed and the one CI ran was the one that had not been repaired (finding 558).
 *
 * Eight patterns in this tree hold a slash inside a class, and none of them sits above
 * a stated budget, which is why both readers returned the same reading for all 467 code
 * files and why the drift survived a round. That is luck, not agreement, and the first
 * test in `check-test-budgets.test.ts` is the shape that spends it.
 *
 * A class is tracked only for a pattern: a bracket inside a string is text, and a `/`
 * inside a string is text too, which is why the terminator test keeps its guard.
 */
function literalEnd(source, start, terminator) {
  const pattern = terminator === '/';
  let inClass = false;
  let i = start + 1;
  while (i < source.length) {
    const ch = source[i];
    if (ch === '\\') {
      i += 2;
      continue;
    }
    if (pattern && ch === '[') inClass = true;
    else if (pattern && ch === ']') inClass = false;
    else if (ch === terminator && !inClass) return i + 1;
    i += 1;
  }
  return source.length;
}

/**
 * Blank the comments, and the contents of the string and regex literals, so the
 * reader sees code -- at the same length as the source.
 *
 * Four modes, a regex decided by the last significant character, and the keyword
 * exceptions for `return /re/`. `timeout-budget.test.ts` imports this scanner and pins
 * its quirks; there is no second copy, and finding 561 is why -- the copy it used to
 * carry is where the fourth mode was discovered, and where the two then drifted.
 *
 * ## Why blanked rather than removed
 *
 * Removing is what this did until v3.104, and it is enough for a reader that only
 * matches patterns. It is not enough for a reader that has to find a *call* and then
 * read its title out of the original: an offset in the stripped text is not an offset
 * in the source once a comment is gone. Blanking keeps the two aligned, so a position
 * found here indexes the file it came from (`testBudgets`).
 *
 * A literal is blanked whole, quotes included. Until v3.105 the two characters that
 * delimit it were kept, on the reasoning that "the last-significant-character rule
 * reads them: a `/` after a string is a division". That reasoning outlived the code
 * it described: the rule reads `last`, which `note` maintains from the *source* as the
 * scan passes, so by the time a `/` is classified the emitted text is not consulted at
 * all. Keeping the quotes changed nothing anywhere -- the falsification that blanked
 * them too returned identical readings for every one of 467 files, and identical
 * verdicts on the 259 files of the real run -- which is what a kept character with no
 * reader looks like. The rule itself survives, and is tested: a `/` after a literal
 * divides.
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
      blank(i, end);
      note(ch);
      i = end;
      continue;
    }
    if (ch === '/' && startsRegex()) {
      const end = literalEnd(source, i, '/');
      blank(i, end);
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

/**
 * Every budget the source states, in each of the four spellings vitest honours --
 * read from the three that can be recognised by their shape, and from the one that
 * cannot, at the place where its meaning is unambiguous.
 *
 * ## The positional spelling needs its call, not just its shape
 *
 * `it('a test', () => {}, 120_000)` is the fourth spelling, and until v3.105 it was
 * read with `/, <number>)/` -- a shape that also matches `expect(x).toEqual([1, 4096])`,
 * a seed `next = (next * 1664525)`, and a timestamp `1700000000`. Eleven of this tree's
 * 259 test files were read that way, and each one was then "a file that states a
 * budget": `gen-rcaeval-cases.test.ts` was judged against **1 700 000 000 ms**, and the
 * floor rule -- the one that asks a file with a 1 000 ms test to declare a budget --
 * did not fire for any of them, because the file had "declared" one.
 *
 * Nothing was red or green wrongly on the day, because every one of the eleven has a
 * slowest test under 1 000 ms and every invented number is larger than it. That is the
 * same luck the character-class repair in this round spends: a file that grows a
 * three-second test would have been told it had nineteen days of headroom. So the
 * positional form is read by `testBudgets`, which finds it inside a test call and can
 * therefore tell a timeout from an argument.
 */
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
  for (const ms of testBudgets(source, code).values()) values.push(ms);
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
export const STATED_BY = {
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
export function testBudgets(source, masked = stripCommentsAndStrings(source)) {
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
