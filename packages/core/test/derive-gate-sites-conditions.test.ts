import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The `condition` column says what the guard is, not what is nearest above it.
 *
 * ## The defect
 *
 * `golden-master/gate-sites.json` publishes, for each of the 112 failure sites,
 * the guard that decides whether the exit runs. It was derived by scanning
 * *backwards for an `if` line*, which answers a different question:
 *
 *   > Which `if` is the closest one above this line?
 *
 * The two agree on most of the tree and disagree wherever a block ends between
 * the guard and the exit. Measured against a parser, 15 of 112 entries named a
 * guard that does not hold at the exit -- two of them said `unknown.length > 0`
 * about a refusal that fires when the inventory cannot be *read*, which names the
 * opposite branch.
 *
 * ## Why this file drives sources rather than the tree
 *
 * The defect has shapes, not instances. A test that asserted the fifteen fixed
 * strings would pass again the next time the deriver learns a sixteenth shape
 * wrong. So each case below is a *shape* -- a sibling `if`, a `catch`, an `else`,
 * an `if` with no braces, a function declaration, an arrow, a brace inside a
 * string -- and the expectation is the answer from the language rather than from
 * the current output.
 *
 * The two cases that matter most are the two the first two implementations got
 * wrong, and both are about a `/`:
 *
 *   - `/(['"`])\{/g` is a regex whose quotes are not string openers. A character
 *     walk read `'` as the start of a string and lost the rest of the file.
 *   - `` `\n${line}` `` is a template whose `${}` closes itself; a raw scan of
 *     tokens has to be driven by a parser to know that, which is why the answer
 *     now comes from the syntax tree at all.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SCRIPT = resolve(ROOT, 'scripts', 'derive-gate-sites.mjs');

interface Site {
  line: number;
  condition?: string;
  diagnostic?: string;
}

const { sitesIn } = (await import(pathToFileURL(SCRIPT).href)) as {
  sitesIn: (name: string, source: string) => Site[];
};

/** The single site in a source, as the deriver reads it. */
function only(source: string): Site {
  const sites = sitesIn('fixture.mjs', source);
  expect(sites).toHaveLength(1);
  return sites[0];
}

describe('the condition a site publishes', () => {
  it('is the predicate of the `if` the exit is in', () => {
    expect(
      only(`if (failures.length > 0) {
  process.exit(1);
}`).condition,
    ).toBe('failures.length > 0');
  });

  it('is the innermost `if`, not the first one', () => {
    expect(
      only(`if (outer) {
  if (inner) {
    process.exit(1);
  }
}`).condition,
    ).toBe('inner');
  });

  it('is nothing when the `if` above the exit has already closed', () => {
    // The shape the old scan got wrong: `problems.length > 0` governs the loop,
    // not the exit below it. Publishing it would tell a reader that the exit
    // fires when problems exist, when in fact it always fires.
    expect(
      only(`if (problems.length > 0) {
  for (const problem of problems) report(problem);
}
process.exit(1);`).condition,
    ).toBeUndefined();
  });

  it('is `catch` inside a catch clause, where there is no predicate to find', () => {
    expect(
      only(`try {
  parse(read());
} catch (error) {
  report(error);
  process.exit(1);
}`).condition,
    ).toBe('catch');
  });

  it('is the `if` when the `catch` is inside one, and the `catch` when the `if` is', () => {
    expect(
      only(`if (checkOnly) {
  try {
    process.exit(1);
  } catch {
    report();
  }
}`).condition,
    ).toBe('checkOnly');
    expect(
      only(`if (checkOnly) {
  try {
    parse();
  } catch {
    report();
    process.exit(1);
  }
}`).condition,
    ).toBe('catch');
  });

  it('is the negation of the `if` for an `else` body', () => {
    expect(
      only(`if (current === rendered) {
  report('current');
} else {
  process.exit(1);
}`).condition,
    ).toBe('!(current === rendered)');
  });

  it('is the whole chain negated for the tail of an `else if`', () => {
    // `check-fault-cases.mjs` is this shape. Publishing only the innermost link
    // would be true and would read as the complete condition.
    expect(
      only(`if (arg === '--cases') {
  parse(args);
} else if (arg === '--help') {
  usage();
} else {
  process.exit(1);
}`).condition,
    ).toBe("!(arg === '--cases') && !(arg === '--help')");
  });

  it('is read from the exit line itself when the `if` opens no block', () => {
    expect(only(`if (!ok) process.exit(1);`).condition).toBe('!ok');
  });

  it('is nothing inside a function declaration, which can be called from anywhere', () => {
    // The `if` decides whether `fail` is *called*, not whether the exit inside it
    // runs; the condition lives at the call site, and saying so is the answer.
    expect(
      only(`if (strict) {
  function fail() {
    process.exit(1);
  }
  fail();
}`).condition,
    ).toBeUndefined();
  });

  it('is the enclosing `if` for an arrow created inside it', () => {
    // Unlike a declaration, an arrow is created where it appears, so everything
    // enclosing its creation is a precondition for reaching the exit inside it.
    expect(
      only(`if (invokedDirectly) {
  main().catch((error) => {
    report(error);
    process.exit(1);
  });
}`).condition,
    ).toBe('invokedDirectly');
  });

  it('is the loop header when a loop is the innermost guard', () => {
    expect(
      only(`for (const line of lines) {
  process.exit(1);
}`).condition,
    ).toBe('for (const line of lines)');
  });

  it('is `switch` for a case body', () => {
    expect(
      only(`switch (kind) {
  case 'broken':
    process.exit(1);
}`).condition,
    ).toBe('switch');
  });

  it('is nothing at module level', () => {
    expect(only(`process.exit(main());`).condition).toBeUndefined();
  });

  it('is not confused by a brace inside a string', () => {
    expect(
      only(`if (strict) {
  report('}');
  process.exit(1);
}`).condition,
    ).toBe('strict');
  });

  it('is not confused by a regex literal holding quotes and braces', () => {
    // The shape that defeated the character walk: `check-no-absolute-paths.mjs`
    // holds exactly this, and its quote characters opened a string that never
    // closed, so the guard was never pushed.
    expect(
      only(`const ABSOLUTE_PATH = /(['"\`])(\\/Users\\/[^'"\`\\n]*)\\1/g;
if (strict) {
  process.exit(1);
}`).condition,
    ).toBe('strict');
  });

  it('is not confused by a template literal holding a substitution', () => {
    // The shape that defeated the raw token scan: after the first `${}` the
    // scanner has to be told to resume the template.
    expect(
      only(`if (strict) {
  const text = \`\\n\${line}\`;
  report(text);
  process.exit(1);
}`).condition,
    ).toBe('strict');
  });

  it('survives a block that closes and reopens on one line', () => {
    expect(
      only(`if (strict) {
  if (loose) {
    report();
  } else if (other) {
    report();
  }
  process.exit(1);
}`).condition,
    ).toBe('strict');
  });
});
