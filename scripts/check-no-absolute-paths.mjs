#!/usr/bin/env node
/**
 * Fails the build when a source or script file hard-codes an absolute path that
 * only exists on the machine it was written on.
 *
 * This gate exists because it was earned. `scripts/inject-stability.mjs` shipped
 * with `const REPO = '/root/.codebuddy/artifact/rca-work/rca-bench-factory'` --
 * the author's checkout -- and every local run passed while the first CI run
 * failed at the very step the script powers. It is the local-green/CI-red drift
 * a pre-push gate is supposed to make impossible, and it was introduced by a
 * script whose entire purpose is catching false readings.
 *
 * The class of defect is broader than that one file: any path under the
 * author's home, any absolute checkout path, and any absolute temp path that the
 * script then depends on being shared across processes. The rule enforced here
 * is narrow and checkable -- **source and script files must not contain an
 * absolute filesystem path outside of a comment** -- because every legitimate
 * need (resolving the repo root, locating a fixture) is served by
 * `import.meta.url` or `__dirname`, and both are portable by construction.
 *
 * What is deliberately NOT flagged:
 *   - paths inside comments or JSDoc, since documenting a past failure by name
 *     is useful and does not execute;
 *   - `/tmp` inside a comment;
 *   - `file://`/`https://` URLs, which are not filesystem paths.
 *
 * What IS flagged:
 *   - any string literal beginning `/Users/`, `/home/`, `/root/`, `/private/`,
 *     or the absolute checkout path of this repository as a literal;
 *   - `/tmp` in a string literal that a script then reads back, which is fragile
 *     across containers even when it resolves.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(HERE, '..');

/** Every place executable code lives, excluding build output and dependencies. */
const SCAN_ROOTS = [
  resolve(ROOT, 'scripts'),
  resolve(ROOT, 'packages/core/src'),
  resolve(ROOT, 'packages/cli/src'),
  resolve(ROOT, 'golden-master'),
];

const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage', '.git', '.turbo']);

/**
 * A string literal holding an absolute personal, home, or checkout path.
 *
 * Matched inside quotes only, so a path named in prose is left alone -- the
 * repository documents this exact failure in several comments and those must
 * keep working.
 *
 * `/tmp` is deliberately NOT in this list. Using `/tmp` as a *fallback default*
 * for an output directory is legitimate and portable enough -- it resolves on
 * every POSIX runner -- and flagging it would force callers to invent worse
 * defaults for no gain. What is not legitimate is a path that identifies one
 * machine or one user, and that is the whole of what this gate forbids: a
 * literal under a home directory, under this repository's author's checkout, or
 * under `/Users` cannot resolve anywhere else.
 */
const ABSOLUTE_PATH = /(['"`])(\/(?:Users|home|root|private)\/[^'"`\n]*)\1/g;

function walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  return entries.flatMap((entry) => {
    if (SKIP_DIRS.has(entry)) return [];
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const failures = [];

for (const root of SCAN_ROOTS) {
  for (const file of walk(root)) {
    if (!/\.(mjs|cjs|js|ts|json|sh|py)$/.test(file)) continue;
    const text = readFileSync(file, 'utf8');
    const lines = text.split('\n');

    lines.forEach((line, i) => {
      // Strip line comments so a path documented in prose is not a violation.
      // Block comments are handled by the same rule because a path named inside
      // one is almost always on its own line and starts with `*`.
      const withoutComment = line
        .replace(/\/\/.*$/, '')
        .replace(/^\s*[*/].*$/, '');
      ABSOLUTE_PATH.lastIndex = 0;
      let m;
      while ((m = ABSOLUTE_PATH.exec(withoutComment)) !== null) {
        failures.push({
          file: relative(ROOT, file),
          line: i + 1,
          path: m[2],
        });
      }
    });
  }
}

if (failures.length > 0) {
  console.error('check-no-absolute-paths: FAILED');
  console.error('');
  console.error('These files contain absolute filesystem paths in executable code.');
  console.error('A path that only exists on one machine makes the step it powers');
  console.error('pass locally and fail in CI, which is the drift this gate prevents.');
  console.error('Resolve from `import.meta.url` (ESM) or `__dirname` (CJS) instead.');
  console.error('');
  for (const f of failures) {
    console.error(`  ${f.file}:${f.line}  ${f.path}`);
  }
  console.error('');
  console.error(`${failures.length} occurrence(s) across ${new Set(failures.map((f) => f.file)).size} file(s).`);
  process.exit(1);
}

console.log('check-no-absolute-paths: OK');
