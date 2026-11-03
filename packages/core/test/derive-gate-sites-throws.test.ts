/**
 * `throw` is the other half of "this gate says no".
 *
 * ## The sentence the inventory published, and the half it left out
 *
 * `derive-gate-sites.mjs` enumerates failure sites under one rule: a call to
 * `process.exit(...)` whose argument is not a known zero. A gate that refuses by
 * throwing is, to a shell, indistinguishable from one that calls `process.exit(1)` --
 * Node prints the stack and exits 1. Measured on this tree: **40 throw statements
 * across 15 scripts**, and the inventory published **none** of them.
 *
 * One of those forty is the shape that makes the omission a defect rather than a
 * scope note. `measure-ci-baseline.mjs` has two refusals: `process.exit(2)` when the
 * usage is wrong, and a **top-level** `throw` when the run holds no job named
 * `batteries`. The first is published and proved; the second was invisible to all
 * three questions the campaign asks -- is it reached, is it depended on, can the gate
 * be hollowed -- and `ci-budget.test.ts` drives only the usage arm. A refusal
 * nobody reaches and nobody counts is a refusal nobody would notice breaking.
 *
 * ## Four baskets, and why the boundary between them is not stylistic
 *
 * The question is one question -- does this statement end the process -- and the
 * syntax answers it three ways, plus one shape that is not a new verdict at all:
 *
 * | disposition | where | what it does |
 * | --- | --- | --- |
 * | `fatal` | not in a function, not in a `try` | ends the process, unconditionally |
 * | `unguarded` | in a function, not in a `try` | hands control to the caller; whether it ends the process is the caller's answer |
 * | `guarded` | in a `try` block | this frame catches it |
 * | `rethrow` | in a `catch`, rethrowing the caught value | forwards somebody else's failure; not a new verdict |
 *
 * The four add up to the number of throw statements, which is what makes the reading
 * checkable. `fatal` is an exit; `unguarded` is where the exit is decided somewhere
 * else, and the inventory says so instead of guessing; `guarded` and `rethrow` are
 * published so that a reader can see what the rule declined rather than having to
 * trust that something was declined.
 *
 * ## Why a `try` stops at a function boundary
 *
 * `try { const f = () => { throw x; }; }` does not guard `f`'s throw: `f` can be
 * called from anywhere, and at that moment the `try` above its definition is not on
 * the stack. So the reading resets `guarded` when it enters a function -- which is a
 * fact about the language, not a heuristic about layout, and the same reason
 * `condition` records the enclosing construct rather than the nearest `if` line.
 *
 * ## What a `catch` does and does not make of a throw
 *
 * `catch (error) { throw error; }` is a forward: the failure was decided above, and
 * this line only carries it. `catch (error) { throw new SuiteFailed(...); }` is not --
 * it turns somebody else's failure into this repository's verdict, and it escapes the
 * function like any other unguarded throw. Measured: three forwards and one new
 * verdict, which is why the disposition is read from the thrown expression rather
 * than from the fact that a `catch` encloses it.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SCRIPTS = join(ROOT, 'scripts');

/**
 * The reading under test, loaded through its path rather than by a static import.
 *
 * `scripts-are-classified.test.ts` forbids a static import of a gate, and the reason
 * is measured rather than stylistic: a gate is proved by being emptied, and an emptied
 * module that a test imported at load time takes the worker down before it can name a
 * failing test. The other readings in this directory are loaded the same way.
 */
const { throwsIn } = (await import(pathToFileURL(resolve(SCRIPTS, 'derive-gate-sites.mjs')).href)) as {
  throwsIn: (name: string, source: string) => {
    rows: { line: number; disposition: string; message: string }[];
    counts: Record<string, number>;
  };
};

/** The dispositions, in the order the inventory publishes them. */
const DISPOSITIONS = ['fatal', 'unguarded', 'guarded', 'rethrow'] as const;

type Disposition = (typeof DISPOSITIONS)[number];

function dispositionOf(source: string): Disposition[] {
  return throwsIn('fixture.mjs', source).rows.map((row) => row.disposition as Disposition);
}

function linesOf(source: string): number[] {
  return throwsIn('fixture.mjs', source).rows.map((row) => row.line);
}

/**
 * Every throw statement in a file, counted by a traversal that shares no code with
 * the reading under test.
 *
 * The point is the same one `derive-gate-sites-tally.test.ts` makes about exits: a
 * partition is worth nothing if both halves come from the same walk, because a corner
 * of the grammar that one visitor skips is skipped by the other too and the two agree
 * on a number that is wrong. This walk counts `ThrowStatement` nodes and nothing else.
 */
function countThrows(source: string, name: string): number {
  const file = ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  let total = 0;
  const walk = (node: ts.Node): void => {
    if (ts.isThrowStatement(node)) total += 1;
    node.getChildren(file).forEach(walk);
  };
  walk(file);
  return total;
}

describe('a throw is classified by what it ends, not by where it sits', () => {
  it('counts a top-level throw as fatal, because nothing can catch it', () => {
    expect(dispositionOf("throw new Error('no');")).toEqual(['fatal']);
  });

  it('counts a throw inside a function as unguarded, because the caller decides', () => {
    expect(dispositionOf("function f() { throw new Error('no'); }")).toEqual(['unguarded']);
  });

  it('counts a throw inside a try block as guarded', () => {
    expect(dispositionOf("try { throw new Error('no'); } catch { /* handled */ }")).toEqual([
      'guarded',
    ]);
  });

  it('counts a rethrow of the caught value as a forward rather than a verdict', () => {
    expect(dispositionOf('try { f(); } catch (error) { throw error; }')).toEqual(['rethrow']);
  });

  it('counts a new error built inside a catch as escaping its function', () => {
    // `measure-doc-counts.mjs` does exactly this: a red `pnpm` becomes a
    // `SuiteFailed`, which is this repository's answer rather than pnpm's. Writing it
    // at the top level makes it `fatal` for the same reason any other top-level throw
    // is -- the disposition is about the frame, not about the word `catch`.
    expect(dispositionOf("try { f(); } catch (error) { throw new Error('wrapped'); }")).toEqual([
      'fatal',
    ]);
    expect(
      dispositionOf("function g() { try { f(); } catch (error) { throw new Error('wrapped'); } }"),
    ).toEqual(['unguarded']);
  });

  it('counts a throw of a different value inside a catch as escaping its function', () => {
    // The rethrow test is the caught binding, not the presence of a `catch`: a body
    // that throws something else has made a decision of its own.
    expect(dispositionOf('function g() { try { f(); } catch (error) { throw OTHER; } }')).toEqual([
      'unguarded',
    ]);
  });

  it('counts a top-level catch that rethrows something else as fatal', () => {
    expect(dispositionOf('try { f(); } catch (error) { throw OTHER; }')).toEqual(['fatal']);
  });

  it('does not let a try guard a function defined inside it', () => {
    // The `try` is not on the stack when `f` runs from somewhere else, so the
    // boundary is the function rather than the block. Without this the reading would
    // call every throw in an arrow function defined anywhere under a `try` guarded.
    expect(dispositionOf('try { const f = () => { throw new Error("no"); }; } catch {}')).toEqual([
      'unguarded',
    ]);
  });

  it('does not let a catch forward out of a function defined inside it', () => {
    expect(
      dispositionOf('try { f(); } catch (error) { const g = () => { throw error; }; }'),
    ).toEqual(['unguarded']);
  });

  it('treats a finally block as neither guarded nor a forward', () => {
    // `finally` runs whether or not the try threw, and a throw there replaces any
    // in-flight failure. It is not the frame's catch, so it is not `guarded`.
    expect(dispositionOf('try { f(); } finally { throw new Error("no"); }')).toEqual(['fatal']);
  });

  it('reports a line for every statement, in source order', () => {
    const source = ['function a() {', "  throw new Error('one');", '}', "throw new Error('two');"].join(
      '\n',
    );
    expect(linesOf(source)).toEqual([2, 4]);
  });

  it('carries the message the throw will print, so a row is readable', () => {
    const read = throwsIn('fixture.mjs', "throw new Error('the run holds no job');");
    expect(read.rows[0].message).toContain('the run holds no job');
  });
});

describe('the four baskets are a partition of the throws, not a remainder', () => {
  it('adds up on a fixture that exercises all four', () => {
    const source = [
      "try { throw new Error('guarded'); } catch { /* handled */ }",
      'try { f(); } catch (error) { throw error; }',
      "function g() { throw new Error('unguarded'); }",
      "throw new Error('fatal');",
    ].join('\n');
    const read = throwsIn('fixture.mjs', source);
    expect(read.rows).toHaveLength(4);
    expect(read.counts).toEqual({ fatal: 1, unguarded: 1, guarded: 1, rethrow: 1 });
  });

  it('accounts for every throw in every script, by an independent traversal', () => {
    const files = readdirSync(SCRIPTS)
      .filter((f) => f.endsWith('.mjs') && !f.startsWith('.'))
      .sort();
    const shortfalls: string[] = [];
    let total = 0;
    for (const file of files) {
      const source = readFileSync(join(SCRIPTS, file), 'utf8');
      const read = throwsIn(file, source);
      const classified = read.rows.length;
      const counted = countThrows(source, file);
      total += counted;
      if (classified !== counted) {
        shortfalls.push(`${file}: classified ${String(classified)}, holds ${String(counted)}`);
      }
    }
    expect(shortfalls).toEqual([]);
    expect(total).toBe(41);
  });

  it('names every throw that ends a process without any of its own code running', () => {
    // The shape that made this round necessary: `measure-ci-baseline.mjs` refuses a
    // run whose jobs carry no `batteries`, on a line no test had ever executed. The
    // inventory published the script's `process.exit(2)` beside it and nothing else.
    //
    // v3.48 widened the reading of that script from one job to the workflow, and three
    // more of the same shape appeared with it: a workflow that does not parse, a
    // `--borrow` naming no job, and a step the job it borrowed from never ran. All four
    // are top-level in a script with no `main`, so all four end the process -- which is
    // the definition of the basket rather than a fact about this file.
    const files = readdirSync(SCRIPTS)
      .filter((f) => f.endsWith('.mjs') && !f.startsWith('.'))
      .sort();
    const fatal: string[] = [];
    const counts = { fatal: 0, unguarded: 0, guarded: 0, rethrow: 0 };
    for (const file of files) {
      const read = throwsIn(file, readFileSync(join(SCRIPTS, file), 'utf8'));
      for (const key of DISPOSITIONS) counts[key] += read.counts[key] ?? 0;
      fatal.push(...read.rows.filter((row) => row.disposition === 'fatal').map((row) => `${file}:${String(row.line)}`));
    }
    expect(fatal).toEqual([
      'measure-ci-baseline.mjs:132',
      'measure-ci-baseline.mjs:154',
      'measure-ci-baseline.mjs:157',
      'measure-ci-baseline.mjs:164',
    ]);
    expect(counts).toEqual({ fatal: 4, unguarded: 33, guarded: 1, rethrow: 3 });
  });

  it('refuses a file it cannot parse, rather than classifying part of it', () => {
    expect(() => throwsIn('broken.mjs', 'function (')).toThrow(/parser rejected/);
  });
});
