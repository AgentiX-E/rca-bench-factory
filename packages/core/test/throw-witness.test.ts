import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { instrumentThrows, load } from '../../../scripts/throw-witness.mjs';
import { hookFile, parseReached, parseThrows, witnessArmed } from '../../../scripts/site-proofs.mjs';

/**
 * The instrument that answers "did anything ever execute this `throw`".
 *
 * ## Why this file exists
 *
 * The inventory publishes 41 throw statements, and until v3.46 forty of them had no
 * evidence of ever having run -- `gate-sites-are-proven.test.ts` asked nothing about
 * them, and the one instrument that could see a throw, the `uncaughtException`
 * listener, only sees the ones that end a process. A census over the whole suite found
 * twenty of the forty unreached, and the first thing that had to be established was
 * that the *instrument* could see a throw at all: the first version of it reported
 * every throw as reached, because it attributed lines by `process.argv[1]`.
 *
 * ## What is asserted here, and why it is a function and not a child process
 *
 * The rewrite has to survive every position a `throw` can occupy -- as the unbraced
 * body of an `if`, in a `case`, after a label, as a `do`'s body -- because a rewrite
 * that is legal in nine of those positions and malformed in the tenth is a rewrite
 * that breaks the tree it measures. Asserting that through spawned children would cost
 * a node per position and still not say which position failed; `instrumentThrows` is
 * exported for exactly this, so the positions are a list.
 *
 * The rewrite is also required to preserve **line numbers** -- the inventory, the
 * stack traces and the exit hook's frame reader all name lines in the original file,
 * and a rewrite that shifted them would make every reading wrong in a way no test
 * could see -- so the strongest assertion here is that the instrumented module is
 * still accepted by the interpreter and still reports the same lines.
 *
 * ## The three failures this file was written after
 *
 * Three defects in this instrument were found by running it rather than by reading it,
 * and each has a test here:
 *
 *   - the loader reported success and instrumented nothing, because a file URL arrives
 *     as **bytes** and the guard asked `typeof source === 'string'`;
 *   - `--require` preloads run in the loader thread *and* the main thread, so the
 *     module was registered twice and every reached throw was reported twice;
 *   - attributing a throw by `process.argv[1]` named the importing gate, so three
 *     throws of `doc-counts-rows.mjs` were published as lines of
 *     `measure-doc-counts.mjs`, a file too short to hold them.
 */

const scratch = mkdtempSync(join(tmpdir(), 'rca-throw-witness-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

/**
 * The witness, resolved from this file rather than from the working directory.
 *
 * The first version of the run below used `process.cwd()`, which is the repository
 * root when one file is run from the root and `packages/core` when the suite is run
 * from the package -- so the same test passed alone and failed in the suite, with the
 * child reporting `witness on` and nothing else. A path that depends on where a reader
 * stood is the defect, not the reading: `import.meta.url` is the file's own address.
 */
const WITNESS = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'scripts', 'throw-witness.mjs');

/**
 * Every position a `throw` statement can occupy, one per line.
 *
 * One line each so the expected line number is the index, which keeps the list and the
 * assertion from drifting apart. A multi-line throw is the case below the list.
 */
const POSITIONS: { what: string; code: string }[] = [
  { what: 'the unbraced body of an if', code: "export function bareIf(f) { if (f) throw new Error('a'); }" },
  { what: 'a braced if body', code: "export function bracedIf(f) { if (f) { throw new Error('b'); } }" },
  {
    what: 'an else arm with no braces',
    code: "export function elseArm(f) { if (f) { return 0; } else throw new Error('c'); }",
  },
  {
    what: 'a for body with no braces',
    code: "export function forBody(n) { for (let i = 0; i < n; i += 1) throw new Error('d'); }",
  },
  {
    what: 'a while body with no braces',
    code: "export function whileBody(n) { let i = 0; while (i < n) throw new Error('e'); }",
  },
  {
    what: 'a do body with no braces',
    code: "export function doBody() { do throw new Error('f'); while (false); }",
  },
  {
    what: 'a case clause',
    code: "export function switchArm(k) { switch (k) { case 1: throw new Error('g'); default: return 0; } }",
  },
  { what: 'a labelled statement', code: "export function labelled() { spot: throw new Error('h'); }" },
  { what: 'the block body of an arrow', code: "export const arrow = () => { throw new Error('i'); };" },
  { what: 'a class method body', code: "export class Holder { run() { throw new Error('j'); } }" },
  {
    what: 'a catch clause',
    code: "export function catchArm() { try { JSON.parse('{'); } catch { throw new Error('k'); } }",
  },
  { what: 'a generator body', code: "export function* gen() { throw new Error('l'); }" },
  {
    what: 'a nested function expression',
    code: "export function nested() { const inner = function () { throw new Error('m'); }; return inner; }",
  },
  { what: 'an object method body', code: "export const obj = { run() { throw new Error('n'); } };" },
];

const MULTILINE = [
  'export function multiline() {',
  '  throw new TypeError(',
  "    'o',",
  '  );',
  '}',
];
/** Where `MULTILINE`'s throw sits, counted from the top of the combined module. */
const MULTILINE_THROW_LINE = POSITIONS.length + 2;

const POSITIONS_SOURCE = `${POSITIONS.map((one) => one.code).join('\n')}\n${MULTILINE.join('\n')}\n`;

/** Write a file and ask the interpreter to parse it, without running it. */
function parses(name: string, source: string): { ok: boolean; said: string } {
  const file = join(scratch, name);
  writeFileSync(file, source);
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  return { ok: result.status === 0, said: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}

describe('throw-witness · the rewrite, over every position a throw can occupy', () => {
  const { source, lines } = instrumentThrows('positions.mjs', POSITIONS_SOURCE);

  it('reports every throw statement, in line order, and no other line', () => {
    // The count is asserted as well as the numbers: a walk that stopped at the first
    // throw would satisfy a `toContain` assertion for every line in the list.
    expect(lines).toHaveLength(POSITIONS.length + 1);
    expect(lines).toEqual([...POSITIONS.map((_, i) => i + 1), MULTILINE_THROW_LINE].sort((a, b) => a - b));
    expect(POSITIONS).toHaveLength(14);
  });

  it('produces a module the interpreter still accepts, in all fifteen positions', () => {
    // The assertion that a rewrite in the wrong place cannot pass: `{ ... throw X; }`
    // is a statement, so it is legal as an unbraced `if` body, a `case`, a label and a
    // `do` body alike -- and if that were false for even one of them, this is where it
    // would show up as a syntax error rather than as a gate that mysteriously stopped
    // running.
    const { ok, said } = parses('positions.mjs', source);
    expect(said).toBe('');
    expect(ok).toBe(true);
  });

  it('keeps every original statement and every line in place', () => {
    // Line numbers are the coordinate system the inventory, the stack traces and the
    // exit hook all read. The rewrite adds a call and a pair of braces to a line and
    // never a newline, so the file has the same number of lines it had before -- and
    // the statement it wrapped survives character for character, which is what keeps
    // the message a gate prints from being a thing this instrument can change.
    expect(source.split('\n')).toHaveLength(POSITIONS_SOURCE.split('\n').length);
    for (const position of POSITIONS) {
      const from = position.code.indexOf('throw');
      const statement = position.code.slice(from, position.code.indexOf(';', from) + 1);
      expect(source).toContain(statement);
    }
    expect(source).toContain('throw new TypeError(');
  });

  it('announces the line before it throws, and names the file it is in', () => {
    // The file is passed rather than read from `process.argv[1]`, and that is the third
    // defect above: a gate that imports a module gets the gate's name if the recorder
    // asks the process. The literal is the fix, and it is visible in the rewrite.
    expect(source).toContain('__rcaThrow(1, "positions.mjs")');
    expect(source).toContain(`__rcaThrow(${String(MULTILINE_THROW_LINE)}, "positions.mjs")`);
    expect(source).not.toContain('process.argv');
  });

  it('guards the announcement on the recorder existing, so an unarmed import still throws', () => {
    // Without the guard, a module loaded by a process that never installed the
    // recorder dies on a `ReferenceError` before reaching the statement it was going
    // to throw -- a measurement that breaks the thing it measures. The behaviour is
    // asserted in a child below; here the shape is.
    expect(source).toContain('typeof __rcaThrow === \'function\' && __rcaThrow(');
  });

  it('is idempotent, because the preload runs in the loader thread and the main one', () => {
    // Measured before the guard: two `reached` lines per throw. A second registration
    // transforms the first registration's output, so an instrument without this guard
    // reports a tree that throws twice as often as it does.
    const twice = instrumentThrows('positions.mjs', source);
    expect(twice.source).toBe(source);
    expect(twice.lines).toEqual([]);
  });

  it('leaves a file with no throw in it untouched, including one that only says the word', () => {
    // Both halves matter: the lexical gate is what keeps `typescript` out of a process
    // that only wanted to read a file, and it must not be so eager that a comment about
    // throwing rewrites the file around it.
    const plain = "export const answer = 42;\n";
    expect(instrumentThrows('plain.mjs', plain)).toEqual({ source: plain, lines: [] });
    const mentioned = "// This function never throws; it returns the fallback.\nexport const f = () => 0;\n";
    expect(instrumentThrows('mentioned.mjs', mentioned)).toEqual({ source: mentioned, lines: [] });
  });
});

describe('throw-witness · the mutant, which removes one statement', () => {
  it('removes the throw it was aimed at, records the removal, and leaves the others alone', () => {
    // This is the arm `verify-sites-are-sensitive.mjs` uses: a throw that disappears is
    // a gate that stops refusing, and a suite that stays green is a suite that never
    // asserted the refusal. The hollowed line still announces itself -- with a third
    // argument, `hollowed` -- so a run can tell "the mutant arrived and nothing noticed"
    // from "the mutant never arrived", which are opposite findings.
    const site = 'scripts/aimed.mjs:2';
    const source = "export function f(x) {\n  if (x) throw new Error('one');\n  throw new Error('two');\n}\n";
    const aimed = instrumentThrows('aimed.mjs', source, site);
    expect(aimed.source).toContain("__rcaThrow(2, \"aimed.mjs\", true)");
    expect(aimed.source).not.toContain("new Error('one')");
    expect(aimed.source).toContain("throw new Error('two')");
    expect(aimed.source).toContain("__rcaThrow(3, \"aimed.mjs\")");
    // Both lines are still announced, which is why `lines` still holds both: the
    // removed statement is a statement this instrument can speak about.
    expect(aimed.lines).toEqual([2, 3]);
    expect(parses('aimed.mjs', aimed.source).ok).toBe(true);
  });

  it('is a no-op when aimed at a line of another file, which is a mutant that never arrives', () => {
    // A hollow aimed at the wrong file must leave the tree intact, because the reading
    // it produces -- a green suite -- is a reading about nothing. The comparison is of
    // the full site, `scripts/<name>.mjs:<line>`, so a shared line number cannot make
    // two files' mutants interchangeable.
    const source = "export function f() { throw new Error('only'); }\n";
    const elsewhere = instrumentThrows('here.mjs', source, 'scripts/there.mjs:1');
    expect(elsewhere.source).toContain("throw new Error('only')");
    expect(elsewhere.source).toContain('__rcaThrow(1, "here.mjs")');
  });
});

describe('throw-witness · the load hook, which is where the bytes were', () => {
  const url = 'file:///repo/scripts/target.mjs';
  const source = "export function f() { throw new Error('x'); }\n";

  /** Run the hook with the two environment variables a witness run sets, then clear them. */
  async function armedLoad(
    target: string,
    produced: { source?: string | Uint8Array; format?: string },
  ): Promise<{ source?: unknown }> {
    const before = { witness: process.env['RCA_THROW_WITNESS'], trace: process.env['RCA_SITE_TRACE'] };
    process.env['RCA_THROW_WITNESS'] = '/repo/scripts/throw-witness.mjs';
    process.env['RCA_SITE_TRACE'] = '/tmp/trace.log';
    try {
      return await load(target, {}, () => Promise.resolve(produced));
    } finally {
      for (const [key, value] of [
        ['RCA_THROW_WITNESS', before.witness],
        ['RCA_SITE_TRACE', before.trace],
      ] as const) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  }

  it('instruments a script whose source arrives as bytes, which is how a file URL arrives', async () => {
    // The defect that made the whole instrument a no-op while reporting success: the
    // guard asked `typeof result.source === 'string'`, every module arrived as a
    // `Uint8Array`, and every module was returned unchanged. The run looked exactly
    // like a tree with no throws in it, which is the reading this instrument exists to
    // distinguish itself from.
    const result = await armedLoad(url, { source: Buffer.from(source), format: 'module' });
    expect(String(result.source)).toContain('__rcaThrow(1, "target.mjs")');
  });

  it('instruments a script whose source arrives as a string', async () => {
    const result = await armedLoad(url, { source, format: 'module' });
    expect(String(result.source)).toContain('__rcaThrow(1, "target.mjs")');
  });

  it('leaves a module that is not a script of this tree alone', async () => {
    // `packages/*/src` is not measured and must not be rewritten: the rewrite is only
    // correct where the inventory has rows, and rewriting the rest would put a call to
    // a test-only global into the product's own modules.
    const result = await armedLoad('file:///repo/packages/core/src/index.ts', { source, format: 'module' });
    expect(result.source).toBe(source);
  });

  it('leaves a source of a shape it does not understand alone, rather than guessing', async () => {
    const result = await armedLoad(url, { format: 'module' });
    expect(result.source).toBeUndefined();
  });

  it('is inert when the run did not ask for a witness, or asked without a trace to write to', async () => {
    // Two conditions, not either. A run with the witness set and no trace path would
    // rewrite every module and then have nowhere to write, which reads as a tree that
    // never throws -- the same shape as the bytes defect, arrived at from the other side.
    const only = await load(url, {}, () => Promise.resolve({ source, format: 'module' }));
    expect(only.source).toBe(source);
    process.env['RCA_THROW_WITNESS'] = '/repo/scripts/throw-witness.mjs';
    try {
      const half = await load(url, {}, () => Promise.resolve({ source, format: 'module' }));
      expect(half.source).toBe(source);
    } finally {
      delete process.env['RCA_THROW_WITNESS'];
    }
  });
});

describe('throw-witness · the rewrite in a process, which is the only place it earns anything', () => {
  /** Import an instrumented module in a child, optionally with the recorder installed. */
  function runInChild(name: string, source: string, installRecorder: boolean): { reached: string[]; said: string } {
    const file = join(scratch, name);
    writeFileSync(file, instrumentThrows(name, source).source);
    const script = [
      installRecorder
        ? "const seen = []; globalThis.__rcaThrow = (line, file, hollowed) => { seen.push(`${file}:${String(line)}${hollowed === true ? ' (hollowed)' : ''}`); };"
        : '',
      `const m = await import(${JSON.stringify(pathToFileURL(file).href)});`,
      'const said = [];',
      'for (const key of Object.keys(m)) {',
      "  if (key !== 'run') continue;",
      '  try { m[key](); } catch (error) { said.push(error.message); }',
      '}',
      'process.stdout.write(JSON.stringify({ reached: installRecorder ? seen : [], said }));',
    ]
      .filter((line) => line !== '')
      .join('\n')
      .replace('installRecorder ? seen : []', installRecorder ? 'seen' : '[]');
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' });
    const parsed = JSON.parse(result.stdout) as { reached: string[]; said: string[] };
    return { reached: parsed.reached, said: parsed.said.join('|') };
  }

  const TWO = [
    'export function run() { throw new Error("the one that runs"); }',
    'export function skip() { throw new Error("the one that does not"); }',
    '',
  ].join('\n');

  it('records the throw that ran and says nothing about the one that did not', () => {
    // The distinction the whole round turns on, in one process: two throws in one file,
    // one executed, and the trace names only the executed line. A witness that recorded
    // both would have reported every throw in the tree as reached -- which is what the
    // first census did, and why it had to be thrown away.
    const outcome = runInChild('two-throws.mjs', TWO, true);
    expect(outcome.reached).toEqual(['two-throws.mjs:1']);
    expect(outcome.said).toBe('the one that runs');
  });

  it('does not change the error a process sees, or need the recorder to be there', () => {
    // A measurement may not change the thing it measures. The guarded call means a
    // module loaded with no recorder still throws what it always threw, rather than a
    // `ReferenceError` about a global that exists only in a proof run.
    const outcome = runInChild('two-throws-unarmed.mjs', TWO, false);
    expect(outcome.said).toBe('the one that runs');
    expect(outcome.reached).toEqual([]);
  });
});

describe('throw-witness · what the trace reader makes of it', () => {
  it('reads a reached line as its own fact, not as an exit and not as a death', () => {
    // Three writers, one file. `parseTrace` reads exits, `parseThrows` reads deaths,
    // `parseReached` reads announcements -- and a reader that confused the first two
    // would call a caught throw a gate that failed.
    const trace = [
      'witness on',
      'reached scripts/c.mjs:7',
      '/repo/scripts/c.mjs:11',
      'throw /repo/scripts/c.mjs:9',
      'reached scripts/c.mjs:7',
      'reached scripts/../outside.mjs:3',
      'hollowed scripts/c.mjs:9',
    ].join('\n');
    expect(parseReached(trace)).toEqual(['scripts/c.mjs:7']);
    expect(parseThrows(trace)).toEqual(['scripts/c.mjs:9']);
    expect(witnessArmed(trace)).toBe(true);
  });

  it('says the witness was not armed when the trace holds no installation record', () => {
    // Without this line, a run whose recorder never arrived reports every throw as
    // unreached -- the instrument's failure printed as the tree's defect.
    expect(witnessArmed('')).toBe(false);
    expect(witnessArmed('reached scripts/c.mjs:7')).toBe(false);
    expect(witnessArmed('witness armed')).toBe(false);
  });

  it('holds every throw that ended a process inside the set that was announced', () => {
    // `parseThrows ⊆ parseReached` is the containment that detects a rewrite which
    // arrived late or not at all: a process cannot die on a statement that never
    // announced itself, so a death without an announcement is a broken instrument
    // rather than a finding. It is asserted here over a real run -- the preload is the
    // one `site-proofs.mjs` installs, the loader is this file, and the child *is* a
    // script, so both writers fire on the same line.
    const tree = join(scratch, 'scripts');
    mkdirSync(tree, { recursive: true });
    const target = join(tree, 'probe.mjs');
    writeFileSync(
      target,
      ["export function unused() { throw new Error('never called'); }", "throw new Error('ends the process');", ''].join(
        '\n',
      ),
    );
    const trace = join(scratch, 'containment.log');
    const died = spawnSync(process.execPath, ['--require', hookFile(scratch), target], {
      encoding: 'utf8',
      env: {
        ...process.env,
        RCA_SITE_TRACE: trace,
        RCA_THROW_WITNESS: WITNESS,
      },
    });
    expect(died.status).toBe(1);
    const text = readFileSync(trace, 'utf8');
    expect(witnessArmed(text)).toBe(true);
    expect(parseThrows(text)).toEqual(['scripts/probe.mjs:2']);
    expect(parseReached(text)).toContain('scripts/probe.mjs:2');
    // The throw inside the function was not called, so nothing announces it -- and that
    // is the difference between "reached" and "present in the file", measured in one
    // process by one instrument.
    expect(parseReached(text)).not.toContain('scripts/probe.mjs:1');
    for (const site of parseThrows(text)) expect(parseReached(text)).toContain(site);
  });
});
