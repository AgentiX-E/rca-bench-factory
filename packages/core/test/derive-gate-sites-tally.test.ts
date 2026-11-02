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
 * basket. So `sites.length + zero + indirect` **is** the number of calls, by
 * construction, and the two cases at the bottom hold that against the real tree
 * with an independent traversal.
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

/** The three counts a partition can report, in a fixed order. */
function counts(source: string): { sites: number; zero: number; indirect: number } {
  const read = classify(source);
  return {
    sites: read.sites.length,
    zero: read.excluded.zero ?? 0,
    indirect: read.excluded.indirect ?? 0,
  };
}

describe('a statement-position exit is a site unless its argument is zero', () => {
  it('counts `process.exit(1)`', () => {
    expect(counts('process.exit(1);')).toEqual({ sites: 1, zero: 0, indirect: 0 });
  });

  it('counts any non-zero status, which is a spelling of the same property', () => {
    expect(counts('process.exit(2);').sites).toBe(1);
    expect(counts('process.exit(cond ? 0 : 1);').sites).toBe(1);
    expect(counts('process.exit(main());').sites).toBe(1);
  });

  it('counts an exit that carries no argument at all', () => {
    // `process.exit()` exits 0, which by the letter of the rule is not the literal
    // zero -- and by the property it is a success exit. It is a site here because
    // the rule is about the *spelling* of the argument, and this tree has none;
    // the case exists so that a future one is visible rather than silently either
    // way. See "Left open" in the progress log.
    expect(counts('process.exit();')).toEqual({ sites: 1, zero: 0, indirect: 0 });
  });

  it('counts the inline `if (!ok) process.exit(1);`', () => {
    expect(counts('if (!ok) process.exit(1);')).toEqual({ sites: 1, zero: 0, indirect: 0 });
  });
});

describe('a success exit is counted as zero rather than dropped', () => {
  it('counts `process.exit(0)`', () => {
    expect(counts('process.exit(0);')).toEqual({ sites: 0, zero: 1, indirect: 0 });
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
      indirect: 0,
    });
  });

  it('does not read a string argument as zero', () => {
    expect(counts("process.exit('0');").sites).toBe(1);
  });
});

describe('a call that is not a statement is reported as indirect', () => {
  it('counts an exit inside another call', () => {
    expect(counts('assert(process.exit(1));')).toEqual({ sites: 0, zero: 0, indirect: 1 });
  });

  it('counts an exit as an arrow body', () => {
    expect(counts('const codes = list.map((x) => process.exit(x));')).toEqual({
      sites: 0,
      zero: 0,
      indirect: 1,
    });
  });

  it('counts an exit inside a template substitution', () => {
    expect(counts('const text = `${process.exit(1)}`;')).toEqual({ sites: 0, zero: 0, indirect: 1 });
  });
});

describe('prose about an exit is not an exit', () => {
  it('ignores a line comment quoting one', () => {
    expect(counts('// `assert(process.exit(1))`, `.map((x) => process.exit(1))`')).toEqual({
      sites: 0,
      zero: 0,
      indirect: 0,
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
    ).toEqual({ sites: 0, zero: 0, indirect: 0 });
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

describe('the three baskets are a partition of the calls, not a remainder', () => {
  it('adds up on a fixture that exercises all three', () => {
    const source = [
      'process.exit(1);',
      'process.exit(0);',
      "assert(process.exit('both'));",
      'if (!ok) process.exit(0);',
      '// process.exit(1) in prose is not a call',
    ].join('\n');
    const read = counts(source);
    expect(read).toEqual({ sites: 1, zero: 2, indirect: 1 });
  });

  it('publishes exactly two tallies, so a third cannot describe a situation that cannot occur', () => {
    // `multiline` used to sit here, always 0, for "an exit whose argument spans
    // lines". Under a tree reading a spanning call is an ordinary site, so the
    // label described a state the reading can no longer reach -- and a tally that
    // is structurally always zero reads as a measurement.
    expect(Object.keys(classify('process.exit(1);').excluded).sort()).toEqual(['indirect', 'zero']);
  });

  it('accounts for every call in every script, and names the two indirect ones', () => {
    // The independent reading: `getChildren()` rather than `forEachChild`, walked
    // recursively. Same tree, different traversal -- so a visitor that skipped a
    // corner of the grammar (a class field, a decorator, a default parameter) would
    // show up as a shortfall rather than as a quietly smaller number.
    const files = readdirSync(SCRIPTS)
      .filter((f) => f.endsWith('.mjs') && !f.startsWith('.'))
      .sort();
    const shortfalls: string[] = [];
    const indirectFiles: string[] = [];
    let calls = 0;
    for (const file of files) {
      const source = readFileSync(join(SCRIPTS, file), 'utf8');
      const read = exitsIn(file, source);
      const total = read.sites.length + (read.excluded.zero ?? 0) + (read.excluded.indirect ?? 0);
      if ((read.excluded.indirect ?? 0) > 0) indirectFiles.push(file);
      const counted = countExitsByChildren(source, file);
      calls += counted;
      if (total !== counted) shortfalls.push(`${file}: classified ${String(total)}, holds ${String(counted)}`);
    }
    expect(shortfalls).toEqual([]);
    expect(calls).toBe(130);
    // Both are `.then((code) => process.exit(code))`: a real exit whose statement
    // it is not. The third used to be a docstring in the deriver itself.
    expect(indirectFiles).toEqual(['derive-fault-golden.mjs', 'score-fault-extraction.mjs']);
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
