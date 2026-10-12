#!/usr/bin/env node
/**
 * Publish which T2 backends can be pulled from, derived from the registry.
 *
 * `packages/core/src/ingest/backends.ts` is the source: it names the six backends
 * and, for each, either the function that pulls from it or the reason it cannot
 * be pulled from. This script writes that as `golden-master/backend-support.json`,
 * which is what `docs/architecture.md`'s matrix is held to and what the cold-tree
 * job can read without a build.
 *
 * ## Why the snapshot exists at all, beside the test that already proves it current
 *
 * `packages/core/test/backend-support.test.ts` imports the registry and asserts
 * the committed JSON equals it, so the JSON cannot go stale without a red suite.
 * That test is in the *suite*, though, and `docs:check:cold` runs on a tree with
 * no `dist/` and no build step -- it cannot import a TypeScript module. The
 * snapshot is what lets the document be checked in a job that is not allowed to
 * build, which is the same split `measure-doc-counts.mjs` uses for the counts.
 *
 * ## Why `--check` instead of always writing
 *
 * A script that rewrites its own subject on every run reports success no matter
 * what the subject said, so the stale case has to be a distinct outcome. With
 * `--check` it exits non-zero and prints both sides.
 *
 *   node scripts/derive-backend-support.mjs            # write
 *   node scripts/derive-backend-support.mjs --check    # fail if stale
 *
 * Requires `packages/core/dist` because it imports the built module rather than
 * re-parsing the source: a source parse would be a second reader of the same
 * file, and the two would eventually disagree about what the table says.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const MODULE = resolve(ROOT, 'packages', 'core', 'dist', 'ingest', 'backends.js');

/**
 * Where the snapshot lives.
 *
 * Overridable so that the stale branch has a test: a script whose only reachable
 * outcome is success has no proof that it can fail, and `--check`'s whole purpose
 * is the failure. `packages/core/test/check-backend-support.test.ts` points this
 * at a corrupted copy in a temp directory rather than corrupting the committed
 * one, because the committed one is read by a cold-tree job that does not build.
 */
const SNAPSHOT = process.argv.includes('--snapshot')
  ? resolve(process.argv[process.argv.indexOf('--snapshot') + 1])
  : resolve(ROOT, 'golden-master', 'backend-support.json');

const RULE =
  'derived from packages/core/src/ingest/backends.ts; see scripts/derive-backend-support.mjs';

function fail(lines) {
  console.error('derive-backend-support: FAILED');
  for (const line of lines) console.error(`  ${line}`);
  process.exit(1);
}

async function derive() {
  let module;
  try {
    module = await import(pathToFileURL(MODULE).href);
  } catch (error) {
    fail([
      `cannot read the registry at ${MODULE}: ${error.message}`,
      'This script reads the built module rather than the source, because a second',
      'reader of the source is a second thing to disagree with. Run `pnpm build` first.',
    ]);
  }
  const backends = (module.T2_BACKENDS ?? []).map((backend) =>
    backend.status === 'implemented'
      ? { id: backend.id, status: backend.status, summary: backend.summary }
      : { id: backend.id, status: backend.status, reason: backend.reason },
  );
  if (backends.length === 0) {
    fail(['the registry is empty, so a snapshot of it would claim nothing is supported']);
  }
  return { rule: RULE, backends };
}

const derived = await derive();
const rendered = `${JSON.stringify(derived, null, 2)}\n`;
const check = process.argv.includes('--check');

if (!check) {
  writeFileSync(SNAPSHOT, rendered);
  console.log(`derive-backend-support: wrote ${derived.backends.length} backend(s) to ${SNAPSHOT}`);
  process.exit(0);
}

let committed;
try {
  committed = readFileSync(SNAPSHOT, 'utf8');
} catch (error) {
  fail([`no snapshot at ${SNAPSHOT}: ${error.message}`]);
}

if (committed !== rendered) {
  fail([
    `${SNAPSHOT} is stale.`,
    '',
    'Committed:',
    ...committed.split('\n').map((l) => `    ${l}`),
    '',
    'Derived:',
    ...rendered.split('\n').map((l) => `    ${l}`),
    '',
    'Run `node scripts/derive-backend-support.mjs` to take the new measurement.',
  ]);
}

console.log(`derive-backend-support: OK (${derived.backends.length} backend(s), snapshot current)`);
