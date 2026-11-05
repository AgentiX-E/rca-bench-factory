import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The tally beside the site list is a partition, not a remainder.
 *
 * ## The defect
 *
 * `golden-master/gate-sites.json` publishes `excluded` beside `sites`, so a reader
 * can subtract: "112 sites, and 18 other exits went elsewhere for these reasons".
 * The two halves were computed by two different readings, and they disagreed --
 * the committed file said `{15 zero, 3 indirect}` where the tree holds
 * `{16 zero, 2 indirect}`.
 *
 * **The totals matched anyway.** One count had been lost and one invented, and the
 * two errors cancelled to 130. A number that is right for two wrong reasons is
 * harder to notice than a number that is wrong, which is why this file asserts the
 * partition rather than the total.
 *
 * The lost one is `if (officialDirArg === undefined) process.exit(0);` in
 * `check-official.mjs`: a success exit written on a line that does not *begin*
 * with `process.exit`. The site rule grew a fallback for exactly that shape in an
 * earlier round, because it was costing the inventory a site; the tally never got
 * the same fallback, and the shape fell through every branch.
 *
 * The invented one is a docstring line in `derive-gate-sites.mjs` whose text
 * contains `.map((x) => process.exit(1))`, counted because the comment stripper
 * desyncs in that file -- a quote inside a regex literal, the same character that
 * defeated the two scanners before it.
 *
 * ## What this file asserts instead
 *
 * One pass over the syntax tree puts every `process.exit(...)` call in exactly one
 * basket. So `sites.length + zero` **is** the number of calls, by construction, and
 * the cases at the bottom hold that against the real tree with an independent
 * traversal.
 *
 * ## The third basket, and why there are now two
 *
 * `indirect` held calls that were not in statement position, and it was the last
 * remainder in this table: the rule it qualified -- "a call outside a statement may
 * not run" -- is equally true of the calls the rule *includes*, and `condition`
 * is the column that says so. Measured, the basket held exactly two calls, and both
 * were `main().then((code) => process.exit(code))`: the sentence that decides the
 * script's status. `code` is `main()`'s return value, so the inventory published
 * each of those scripts as having one failure exit -- the `.catch` arm -- while the
 * one carrying every refusal `main()` reports was filed as "not a site". v3.44
 * deletes the basket and counts them.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SCRIPT = resolve(ROOT, 'scripts', 'derive-gate-sites.mjs');
const SCRIPTS = resolve(ROOT, 'scripts');

interface Read {
  sites: Array<{ line: number; condition?: string; diagnostic?: string }>;
  excluded: Record<string, number>;
}

const { exitsIn } = (await import(pathToFileURL(SCRIPT).href)) as {
  exitsIn: (name: string, source: string) => Read;
};

/** One fixture, classified. */
function classify(source: string): Read {
  return exitsIn('fixture.mjs', source);
}

/** The two counts a partition can report, in a fixed order. */
function counts(source: string): { sites: number; zero: number } {
  const read = classify(source);
  return {
    sites: read.sites.length,
    zero: read.excluded.zero ?? 0,
  };
}

describe('an exit is a site unless its argument is a known zero', () => {
  it('counts `process.exit(1)`', () => {
    expect(counts('process.exit(1);')).toEqual({ sites: 1, zero: 0 });
  });

  it('counts any non-zero status, which is a spelling of the same property', () => {
    expect(counts('process.exit(2);').sites).toBe(1);
    expect(counts('process.exit(cond ? 0 : 1);').sites).toBe(1);
    expect(counts('process.exit(main());').sites).toBe(1);
  });

  it('counts an exit that carries no argument as zero, because that is what it exits with', () => {
    // Until v3.44 this was a site. The rule asked "is the argument the literal
    // zero?", and an absent argument is not the literal zero -- which is a reading
    // of the sentence rather than of the statement. `process.exit()` exits 0, so
    // by the property the rule exists to publish it is a success exit.
    expect(counts('process.exit();')).toEqual({ sites: 0, zero: 1 });
  });

  it('counts the inline `if (!ok) process.exit(1);`', () => {
    expect(counts('if (!ok) process.exit(1);')).toEqual({ sites: 1, zero: 0 });
  });
});

describe('a success exit is counted as zero rather than dropped', () => {
  it('counts `process.exit(0)`', () => {
    expect(counts('process.exit(0);')).toEqual({ sites: 0, zero: 1 });
  });

  it('reads the literal zero as a number, so `0x0` and `0.0` are the same claim', () => {
    expect(counts('process.exit(0x0);').zero).toBe(1);
    expect(counts('process.exit(0.0);').zero).toBe(1);
  });

  it('counts the inline `if (arg === undefined) process.exit(0);`', () => {
    // The shape that was counted nowhere: not a site, because the argument is zero;
    // and not a tally, because the line does not begin with `process.exit`.
    // `check-official.mjs` writes it, and its absence made the tally read one lower
    // than the tree.
    expect(counts('if (officialDirArg === undefined) process.exit(0);')).toEqual({
      sites: 0,
      zero: 1,
    });
  });

  it('does not read a string argument as zero', () => {
    expect(counts("process.exit('0');").sites).toBe(1);
  });
});

describe('an exit is a site wherever the call sits', () => {
  // `indirect` used to hold these, on the argument that a call outside statement
  // position may not run. That is true of `if (x) process.exit(1)` too, and the
  // published `condition` column is what says so -- position in an expression does
  // not weaken an exit, because a call that runs ends the process wherever it is.
  it('counts an exit inside another call', () => {
    expect(counts('assert(process.exit(1));')).toEqual({ sites: 1, zero: 0 });
  });

  it('counts an exit as an arrow body', () => {
    expect(counts('const codes = list.map((x) => process.exit(x));')).toEqual({ sites: 1, zero: 0 });
  });

  it('counts the continuation that carries a gate verdict', () => {
    // The shape the deleted basket was hiding: `code` is `main()`'s return value,
    // so this call is where the script's status is decided. Both instances in
    // `scripts/` are this line.
    const read = classify('main()\n  .then((code) => process.exit(code))\n  .catch(() => process.exit(1));');
    expect(read.sites.map((site) => site.line)).toEqual([2, 3]);
  });

  it('counts an exit inside a template substitution', () => {
    expect(counts('const text = `${process.exit(1)}`;')).toEqual({ sites: 1, zero: 0 });
  });
});

describe('prose about an exit is not an exit', () => {
  it('ignores a line comment quoting one', () => {
    expect(counts('// `assert(process.exit(1))`, `.map((x) => process.exit(1))`')).toEqual({
      sites: 0,
      zero: 0,
    });
  });

  it('ignores a block comment quoting one', () => {
    // The shape that used to be counted: a docstring in `derive-gate-sites.mjs`
    // spells `.map((x) => process.exit(1))` while documenting why that shape is
    // excluded, and it entered the `indirect` tally through a lexer desync.
    expect(
      counts(`/**
 * Not counted: \`assert(process.exit(1))\`, \`.map((x) => process.exit(1))\`.
 */
const x = 1;`),
    ).toEqual({ sites: 0, zero: 0 });
  });

  it('ignores the text inside a string and inside a template', () => {
    expect(counts("const pattern = 'process.exit(1)';").sites).toBe(0);
    expect(counts('const pattern = `process.exit(1)`;').sites).toBe(0);
  });
});

describe('the line a site publishes is the line its call starts on', () => {
  it('points at `process.exit`, not at the argument', () => {
    const read = classify(`const code = main();
process.exit(
  code,
);`);
    expect(read.sites).toHaveLength(1);
    expect(read.sites[0].line).toBe(2);
  });
});

describe('the two baskets are a partition of the calls, not a remainder', () => {
  it('adds up on a fixture that exercises both', () => {
    const source = [
      'process.exit(1);',
      'process.exit(0);',
      "assert(process.exit('both'));",
      'if (!ok) process.exit(0);',
      '// process.exit(1) in prose is not a call',
    ].join('\n');
    const read = counts(source);
    expect(read).toEqual({ sites: 2, zero: 2 });
  });

  it('publishes exactly one tally, so a second cannot describe a situation that cannot occur', () => {
    // `multiline` used to sit here, always 0, for "an exit whose argument spans
    // lines"; under a tree reading a spanning call is an ordinary site. `indirect`
    // followed it in v3.44 for the same reason: a basket whose members turn out to
    // be sites is a basket that describes the reading rather than the tree.
    expect(Object.keys(classify('process.exit(1);').excluded)).toEqual(['zero']);
  });

  it('accounts for every call in every script, and names the two continuations', () => {
    // The independent reading: `getChildren()` rather than `forEachChild`, walked
    // recursively. Same tree, different traversal -- so a visitor that skipped a
    // corner of the grammar (a class field, a decorator, a default parameter) would
    // show up as a shortfall rather than as a quietly smaller number.
    const files = readdirSync(SCRIPTS)
      .filter((f) => f.endsWith('.mjs') && !f.startsWith('.'))
      .sort();
    const shortfalls: string[] = [];
    let calls = 0;
    let sites = 0;
    const continuationSites: string[] = [];
    for (const file of files) {
      const source = readFileSync(join(SCRIPTS, file), 'utf8');
      const read = exitsIn(file, source);
      sites += read.sites.length;
      const total = read.sites.length + (read.excluded.zero ?? 0);
      for (const line of read.sites.map((site) => site.line)) {
        const text = source.split('\n')[line - 1] ?? '';
        if (text.includes('.then((code) => process.exit(code))')) continuationSites.push(`${file}:${String(line)}`);
      }
      const counted = countExitsByChildren(source, file);
      calls += counted;
      if (total !== counted) shortfalls.push(`${file}: classified ${String(total)}, holds ${String(counted)}`);
    }
    expect(shortfalls).toEqual([]);
    // 140 = 123 failure sites + 17 zero exits. 121 -> 123 is v3.53's entry point: the
    // publish channel's two exits, which used to live outside the repository and therefore
    // outside every count in this file. The step from 130/114 is v3.51's gate:
    // six failure exits and one `--list` success exit, all in
    // `verify-claims-are-sensitive.mjs`; 137/120 -> 138/121 is v3.52's, which added one
    // refusal to `check-ci-budget.mjs` -- a declarations file that cannot be read. The two
    // numbers move together because the question is one -- does the classification account
    // for every call -- and a round that added calls without moving them would be the
    // drift this assertion is for.
    expect(calls).toBe(140);
    expect(sites).toBe(123);
    // Both were filed as `indirect` before v3.44: a real exit whose statement it is
    // not, and the one that carries `main()`'s verdict.
    expect(continuationSites).toEqual([
      'derive-fault-golden.mjs:252',
      'score-fault-extraction.mjs:153',
    ]);
  });
});

/**
 * Count `process.exit` calls by walking `getChildren()`, which yields tokens as
 * well as nodes -- a different traversal from `forEachChild`, over the same tree.
 *
 * Deliberately written out rather than shared with the module under test: a
 * reading that imports the reading is not independent. It also keys on the call's
 * own text rather than on its callee's shape, so a classifier that got the
 * `process.exit` test itself wrong would disagree here.
 */
function countExitsByChildren(source: string, name: string): number {
  const ts = loadTypeScript();
  const file = ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  let found = 0;
  interface NodeLike {
    kind: number;
    getChildren?: () => NodeLike[];
    getText?: () => string;
  }
  const walk = (node: NodeLike): void => {
    if (node.kind === ts.SyntaxKind.CallExpression) {
      const text = node.getText?.() ?? '';
      if (/^process\.exit\s*\(/.test(text)) found += 1;
    }
    for (const child of node.getChildren?.() ?? []) walk(child);
  };
  walk(file as unknown as NodeLike);
  return found;
}

/** The compiler, resolved from the repository rather than from this test's path. */
function loadTypeScript(): typeof import('typescript') {
  return createRequire(import.meta.url)('typescript') as typeof import('typescript');
}
