/**
 * A loader that records every `throw` statement a process **reaches**, whether or not
 * anything catches it.
 *
 * ## Why a loader, and why not the two instruments that already exist
 *
 * The inventory publishes 41 throw statements, and until now the only instrument that
 * could see one was the `uncaughtException` listener in `site-proofs.mjs`. That
 * instrument answers a narrower question than the row needs: it sees a throw that
 * **ended** a process, and says nothing about one a caller caught. Most of the 41 rows
 * live in functions -- `derive-gate-sites.mjs` throws when a file will not parse, and
 * its tests call it and expect the throw -- so the listener reported them as absent,
 * which reads as "no test reaches this line" when the truth is the opposite.
 *
 * V8 block coverage was tried first, and it does not work, for a reason worth writing
 * down: **a block that ends by throwing never increments its own counter.** Measured
 * on a three-function probe, a `throw` that ran and was caught and a `throw` that never
 * ran both report `count: 0` for the enclosing block. The instrument is blind on
 * exactly the statements it was asked about, so no reading of its output can separate
 * them.
 *
 * A loader can, because it runs before the module is evaluated and can rewrite the
 * statement itself. The rewrite adds no newline, so every line number the tree already
 * publishes -- in the inventory, in a stack trace, in the exit hook's frame reader --
 * keeps pointing at the line it named.
 *
 * ## The rewrite, and what it is careful about
 *
 * `throw X;` becomes `{ __rcaThrow(<line>, "<file>"); throw X; }`.
 *
 * A block is a statement, so the rewrite is legal in every position a throw can
 * occupy: the body of an `if` without braces, a `case`, a labelled statement, a loop
 * body, an arrow's block. `throw` declares nothing, so the new block introduces no
 * scope that could shadow or capture anything.
 *
 * The **file** is passed as well as the line, and that is not redundancy: the first
 * version of this instrument let the recorder read `process.argv[1]`, which is the
 * script the process was *started* to run. For a gate that imports a module and the
 * module throws, that names the importer and the line inside the imported file -- a
 * coordinate that exists in the wrong document. The first census showed it plainly:
 * `measure-doc-counts.mjs:271`, `:487` and `:534` were reported as reached, and that
 * file is under 270 lines. Those three are lines of `doc-counts-rows.mjs`, which the
 * gate imports.
 *
 * The line number comes from the **same parser and the same call** the inventory uses
 * (`derive-gate-sites.mjs` and this file both read `ts.createSourceFile` and
 * `getLineAndCharacterOfPosition`). That is not a coincidence to be maintained by
 * hand: it is why a line the inventory publishes is a line this instrument can name.
 *
 * ## The one thing it cannot do
 *
 * A module loaded from a **child that did not carry the hook** is not instrumented,
 * for the same reason its exits are invisible: the environment was dropped before the
 * process started. That is the blind spot the trace already reports as `spawn blind`,
 * and it is a fact about the measurement rather than about the gate.
 *
 * ## Usage
 *
 * This file is registered, never imported by hand. `site-proofs.mjs`'s preload calls
 * `module.register(this file)` when `RCA_THROW_WITNESS` is set, so a run that did not
 * ask for the witness pays nothing beyond the `register` call it does not make. When
 * it does ask, the witness writes `reached <script>:<line>` lines into
 * `RCA_SITE_TRACE` -- the same file the exit hook and the throw listener write, which
 * is what lets one run answer all three questions about one child.
 */

import { appendFileSync } from 'node:fs';
import { createRequire } from 'node:module';

/** `typescript`, resolved from this file so a scratch copy of the tree still finds it. */
const require = createRequire(import.meta.url);

/** The global the preload installs; the rewrite calls it, and does nothing if absent. */
const RECORD = '__rcaThrow';

let parser;

/**
 * The rewritten source, and the lines it will now be able to report.
 *
 * Exported so that the rewrite can be tested as a function rather than through a
 * child process: the interesting cases are all about *where* a throw can sit, and a
 * test that has to spawn a node to ask is a test that will not ask about twelve
 * positions.
 */
export function instrumentThrows(name, source, hollow = '') {
  // Idempotence, and it is not defensive coding. `--require` preloads are evaluated in
  // the loader thread as well as the main thread, so `site-proofs.mjs`'s preload runs
  // twice and registers this file twice; the second registration transforms the first
  // registration's output, and every reached throw is then reported twice. Measured
  // before the guard: two `reached` lines per throw and two `register` calls per
  // process. The marker is the instrument's own call, which nothing in the tree writes.
  if (source.includes(`${RECORD}(`)) return { source, lines: [] };
  // The cheapest possible gate on the expensive import: most of the tree has no
  // throw at all, and `typescript` is a 9 MB parser to load in a process that only
  // wanted to read a file.
  if (!/\bthrow\b/.test(source)) return { source, lines: [] };
  parser ??= require('typescript');
  const ts = parser;
  const file = ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const edits = [];
  const walk = (node) => {
    if (ts.isThrowStatement(node)) {
      const line = file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;
      edits.push({ start: node.getStart(file), end: node.end, line });
    }
    ts.forEachChild(node, walk);
  };
  walk(file);
  // Applied back to front so that an earlier edit does not move a later offset.
  edits.sort((a, b) => b.start - a.start);
  const label = name.split('/').pop();
  let out = source;
  for (const edit of edits) {
    const statement = out.slice(edit.start, edit.end);
    const site = `scripts/${String(label)}:${String(edit.line)}`;
    // The mutant, and it is the same idea as `RCA_HOLLOW_SITE` one instrument over: a
    // throw that disappears is a gate that stops refusing, and a witness that does not
    // notice is a witness that proves nothing about the line. Removing the statement
    // is the only way to simulate that -- a `throw` has no seam a caller can replace.
    if (hollow !== '' && site === hollow) {
      out = `${out.slice(0, edit.start)}{ typeof ${RECORD} === 'function' && ${RECORD}(${String(edit.line)}, ${JSON.stringify(label)}, true); }${out.slice(edit.end)}`;
      continue;
    }
    out =
      `${out.slice(0, edit.start)}{ typeof ${RECORD} === 'function' && ` +
      `${RECORD}(${String(edit.line)}, ${JSON.stringify(label)}); ${statement} }${out.slice(edit.end)}`;
  }
  return { source: out, lines: edits.map((edit) => edit.line).sort((a, b) => a - b) };
}

/**
 * Whether this process was asked to witness, and has somewhere to write.
 *
 * Both, not either. The rewrite is only correct when the recorder exists, and the
 * recorder only exists when a trace path was given; a run with one and not the other
 * would rewrite a module and then report nothing, which reads as a tree that never
 * throws. `RCA_SITE_TRACE` alone is the ordinary case -- every proof run sets it --
 * and it must cost nothing.
 */
function armed() {
  return (process.env['RCA_THROW_WITNESS'] ?? '') !== '' && (process.env['RCA_SITE_TRACE'] ?? '') !== '';
}

/** Whether a URL names a script this instrument covers. */
function isScript(url) {
  return /\/scripts\/[A-Za-z0-9._-]+\.mjs$/.test(url);
}

/**
 * The load hook.
 *
 * `nextLoad` runs first: a file this instrument does not cover must be returned
 * untouched, and a source that is neither a string nor bytes is a format this rewrite
 * does not understand, so it is returned as it came rather than guessed at.
 *
 * A file URL arrives with its source as **bytes**, not as a string -- which is why the
 * first version of this file instrumented nothing at all while reporting success: the
 * `typeof source === 'string'` guard was false for every module, so every module was
 * returned unchanged and the run looked like a tree with no throws in it. Byte sources
 * are decoded here, and a string is returned, which the loader accepts.
 */
export async function load(url, context, nextLoad) {
  const result = await nextLoad(url, context);
  if (!armed() || !isScript(url)) return result;
  let text;
  if (typeof result.source === 'string') text = result.source;
  else if (result.source instanceof Uint8Array) text = Buffer.from(result.source).toString('utf8');
  else return result;
  const hollow = process.env['RCA_HOLLOW_THROW'] ?? '';
  return { ...result, source: instrumentThrows(new URL(url).pathname, text, hollow).source };
}
