import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * An exit the inventory cannot prove is refused rather than published.
 *
 * ## The defect
 *
 * Every published site is a claim with two instruments behind it: a test that
 * reaches its line (`verify-site-proofs.mjs`) and a mutant that replaces its
 * argument with `0` from that frame (`verify-sites-are-sensitive.mjs`). Both hooks
 * are installed on **`process.exit` the call**, so an exit written any other way
 * would be published as a site that nothing can hollow -- a proof-shaped column
 * beside a claim no experiment could ever contradict.
 *
 * The spellings are not exotic. `process.exitCode = 1` sets the status without
 * calling anything, so neither hook can see it; `const die = process.exit; die(1)`
 * and `const { exit } = process` put the exit on one line and the call on another,
 * so the trace would report a line the inventory never published. Measured today,
 * `scripts/` writes **none** of them -- 130 calls, all spelled `process.exit(...)`
 * -- which is exactly why the reading has to refuse: a spelling that is absent is
 * indistinguishable from a spelling the reader never looked for.
 *
 * The alternative was a fourth basket, `uncounted`, and it was rejected. A basket
 * is published beside `sites` and reads as a measurement of the tree; this one
 * would have measured the instrument's reach, and the next round would have had to
 * ask which of the two it was looking at.
 *
 * ## What the refusal buys
 *
 * The set of published sites is now a subset of the set the sensitivity pass can
 * hollow, by construction. That is the invariant that makes `0 survivors` mean
 * something about the inventory rather than about the catalogue of syntax the
 * mutant happens to know.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SCRIPT = resolve(ROOT, 'scripts', 'derive-gate-sites.mjs');

interface Read {
  sites: Array<{ line: number; condition?: string; diagnostic?: string; verdict?: string }>;
  excluded: Record<string, number>;
}

const { exitsIn } = (await import(pathToFileURL(SCRIPT).href)) as {
  exitsIn: (name: string, source: string) => Read;
};

/** The message `exitsIn` throws for a source it will not classify. */
function refusalOf(source: string): string {
  try {
    exitsIn('fixture.mjs', source);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error('the reading classified this source instead of refusing it');
}

describe('a reference to the exit family that is not a call is refused', () => {
  it('refuses `process.exitCode = 1`', () => {
    const message = refusalOf('if (!ok) process.exitCode = 1;');
    expect(message).toContain('fixture.mjs:1');
    expect(message).toContain('status set by assignment');
    expect(message).toContain('process.exitCode = 1');
  });

  it('refuses an alias of the function', () => {
    const message = refusalOf('const die = process.exit;\ndie(1);');
    expect(message).toContain('fixture.mjs:1');
    expect(message).toContain('read without being called');
    expect(message).toContain('const die = process.exit');
  });

  it('refuses destructuring the function out of `process`', () => {
    expect(refusalOf('const { exit } = process;')).toContain('binds process.exit to a local name');
    expect(refusalOf('const { exitCode } = process;')).toContain(
      'binds process.exitCode to a local name',
    );
  });

  it('names every refused reference, not only the first', () => {
    const message = refusalOf('process.exitCode = 1;\nconst die = process.exit;\ndie(2);');
    expect(message).toContain('2 reference(s)');
    expect(message).toContain('fixture.mjs:1');
    expect(message).toContain('fixture.mjs:2');
  });

  it('says what to do about it, because a refusal without a repair is a wall', () => {
    const message = refusalOf('process.exitCode = 1;');
    expect(message).toContain('process.exit(...)');
    expect(message).toContain('verify-sites-are-sensitive.mjs');
    expect(message).toContain('never be measured');
  });

  it('refuses a file it cannot parse, rather than answering from part of one', () => {
    // The arm that had never run. `throwsIn`'s twin at `:631` is asserted in
    // `derive-gate-sites-throws.test.ts`, and this one -- the same refusal in the
    // exit reader -- was not: every source the tests feed `exitsIn` is valid, so the
    // guard had only ever been read, never taken.
    //
    // What it prevents is the worst answer this file can give. A half-parsed source
    // yields an empty condition and "no guard", and the two are indistinguishable in
    // the published row -- so a tree the parser could not read would be reported as a
    // tree with sixteen unconditional exits.
    const message = refusalOf('function (');
    expect(message).toContain('parser rejected this file');
    expect(message).toContain('no exit can be classified in it');
  });
});

describe('a call is classified, never refused, however it is spelled', () => {
  it('accepts the ordinary call', () => {
    expect(exitsIn('fixture.mjs', 'process.exit(1);').sites).toHaveLength(1);
  });

  it('accepts an optional call, which is still a call', () => {
    // `process.exit?.(1)` runs the hook exactly like `process.exit(1)`, so the
    // mutant can hollow it and the refusal would be a false alarm.
    expect(exitsIn('fixture.mjs', 'process.exit?.(1);').sites).toHaveLength(1);
  });

  it('accepts a computed member, because the exit happens on that line', () => {
    // `process['exit'](1)` resolves the function at run time, so the hook sees it
    // and the mutant can hollow it; and the call is where the process ends, so the
    // line the trace reports is the line the inventory publishes. Refusing this
    // would be refusing an exit it can prove.
    expect(exitsIn('fixture.mjs', "process['exit'](1);").sites).toHaveLength(1);
    expect(exitsIn('fixture.mjs', 'process[`exit`](1);').sites).toHaveLength(1);
  });

  it('ignores the same members on another object', () => {
    const read = exitsIn('fixture.mjs', 'server.exitCode = 1;\nserver.exit(2);');
    expect(read.sites).toEqual([]);
    expect(read.excluded).toEqual({ zero: 0 });
  });

  it('ignores prose and strings, which are not references', () => {
    const read = exitsIn(
      'fixture.mjs',
      [
        '// process.exitCode = 1 is how this could be written',
        "const text = 'process.exitCode = 1';",
        'const pattern = /process\\.exit/;',
        'const { stdout } = process;',
      ].join('\n'),
    );
    expect(read.sites).toEqual([]);
  });
});

describe('the diagnostic a site publishes comes from its own function', () => {
  it('reads a message printed in the same function, however far above', () => {
    const filler = Array.from({ length: 70 }, (_, i) => `  const pad${String(i)} = ${String(i)};`);
    const source = [
      'function main() {',
      "  console.error('the table is stale');",
      ...filler,
      '  process.exit(1);',
      '}',
    ].join('\n');
    const read = exitsIn('fixture.mjs', source);
    expect(read.sites[0]?.diagnostic).toBe('the table is stale');
  });

  it('does not reach into the function that returned the status', () => {
    // The shape the 60-line window got wrong: `main()` prints the message and
    // returns the code; the continuation exits with it. The message belongs to the
    // function above, and publishing it here made the exit that fires when the
    // condition is **not** met read as `M1 exit condition met.`
    const source = [
      'function main() {',
      "  console.log('M1 exit condition met.');",
      '  return 0;',
      '}',
      'main().then((code) => process.exit(code));',
    ].join('\n');
    const read = exitsIn('fixture.mjs', source);
    expect(read.sites[0]?.diagnostic).toBeUndefined();
    expect(read.sites[0]?.verdict).toBe('code');
  });

  it('publishes the expression that decides the status when there is no message', () => {
    const read = exitsIn('fixture.mjs', 'main().then((code) => process.exit(code));');
    expect(read.sites[0]?.verdict).toBe('code');
  });

  it('publishes no verdict for a literal, which needs no explanation', () => {
    const read = exitsIn('fixture.mjs', "console.error('refused');\nprocess.exit(2);");
    expect(read.sites[0]?.verdict).toBeUndefined();
    expect(read.sites[0]?.diagnostic).toBe('refused');
  });
});
