/**
 * The recorder the throw witness calls, installed inside the test worker.
 *
 * ## Why this file exists, given that `site-proofs.mjs` already installs one
 *
 * The suite reaches `scripts/*.mjs` two ways and the two run in different processes:
 *
 *   - a gate a test **spawns** is a node process, whose `--require` preload is the one
 *     in `site-proofs.mjs`; that preload registers the loader in
 *     `scripts/throw-witness.mjs` and defines the recorder the rewritten statement
 *     calls;
 *   - a module a test **imports** is compiled by Vite inside the worker, where the
 *     preload's registration does not reach -- measured, not assumed: with the plugin
 *     in `vitest.config.ts` rewriting the module and the preload's recorder in place,
 *     every test passed and the trace stayed empty, because the rewrite called a
 *     global that did not exist in that process and the guarded form swallowed it.
 *
 * So the same one-line contract is installed in both places, and this is the second
 * one. It is a setup file rather than a line in `stall-watch.ts` because the two have
 * nothing to do with each other: one measures the event loop, this one records a
 * statement, and a reader looking for either should not have to read the other.
 *
 * ## What it must not do
 *
 * - **Change a verdict.** Every write is inside `try`, and a failed write is an
 *   absent record rather than a failed test. A measurement may not become a verdict.
 * - **Record anything that is not a script.** The rewrite only covers `scripts/*.mjs`
 *   and the file name is validated here too, because the name arrives as a string
 *   from generated code and a recorder that trusted it would let a fixture write a
 *   line into the inventory's namespace.
 * - **Charge for being off.** With `RCA_THROW_WITNESS` unset nothing is defined, and
 *   the guarded call in the rewritten statement costs one `typeof`.
 */

import { appendFileSync } from 'node:fs';

const trace = process.env['RCA_SITE_TRACE'] ?? '';
const witness = process.env['RCA_THROW_WITNESS'] ?? '';

if (trace !== '' && witness !== '') {
  // The arming is written down, because "no row was reached" and "the recorder was
  // never installed" leave the same trace. The preload writes the same line in a
  // child, so a run can say which processes were watching.
  appendFileSync(trace, 'witness on\n');
  (globalThis as unknown as Record<string, unknown>)['__rcaThrow'] = (
    line: number,
    file: string,
    hollowed?: boolean,
  ): void => {
    try {
      if (typeof file !== 'string' || !/^[A-Za-z0-9._-]+\.mjs$/.test(file)) return;
      const site = `scripts/${file}:${String(line)}`;
      appendFileSync(trace, `reached ${site}\n`);
      if (hollowed === true) appendFileSync(trace, `hollowed ${site}\n`);
    } catch {
      // A record that cannot be written is a measurement that failed.
    }
  };
}
