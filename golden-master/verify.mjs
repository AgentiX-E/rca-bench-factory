// Golden Master verifier.
//
// Re-exports the self-contained fixture through the current build of the core
// package and compares every emitted file against the committed SHA-256 anchors.
// This proves the exporters are deterministic and byte-stable across changes.
//
// Usage:  pnpm build && node golden-master/verify.mjs [--expected <path>]
//
// ## Two things this file used to get wrong
//
// **It ran in one place only.** The suite never invoked it; CI did. A change that
// moved an exported byte was therefore green on every machine that ran `pnpm test`
// and red on the one that did not, which is the local-pass/CI-fail drift the rest
// of this repository is built to prevent. `packages/core/test/golden-master-anchors.test.ts`
// now runs this file, so the anchor is checked where changes are made.
//
// **It recorded a byte count it never compared.** `expected.json` carries `bytes`
// beside every `sha256`, and only the digest was read. A field that is written and
// never checked is a field a reader will assume is checked -- and the same file is
// what `check-no-vendored-data.mjs` exempts from the size rule, so the number is
// not decoration, it is the record of how big the artefact is. Both are compared
// below, and a disagreement names which of the two moved.
//
// `--expected` exists so the failure branch can be observed: a guard that is only
// ever seen passing is the defect finding 121 was written about. The shipped path
// is the default, so no CI step has to change.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { exportOpenRca, exportRcaEval } from '../packages/core/dist/index.js';
import { compareAnchors } from './anchors.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const expectedIndex = argv.indexOf('--expected');
const expectedPath =
  expectedIndex < 0 ? join(here, 'expected.json') : argv[expectedIndex + 1];
const fixture = JSON.parse(readFileSync(join(here, 'fixture.json'), 'utf8'));
const expected = JSON.parse(readFileSync(expectedPath, 'utf8'));

const sha = (s) => createHash('sha256').update(String(s)).digest('hex');

const openrca = exportOpenRca(fixture);
const rcaevalRe2 = exportRcaEval(fixture, 'RE2');

const actual = {
  files: Object.fromEntries(Object.entries(openrca.files).map(([k, v]) => [k, { sha256: sha(v), bytes: String(v).length }])),
  rcaevalRe2Files: Object.fromEntries(Object.entries(rcaevalRe2.files).map(([k, v]) => [k, { sha256: sha(v), bytes: String(v).length }])),
};

// The comparison lives in `anchors.mjs` so the suite can drive every branch of it
// without importing `dist`; see that file's header for why that matters.
const failures = compareAnchors(
  { files: expected.files ?? {}, rcaevalRe2Files: expected.rcaevalRe2Files ?? {} },
  actual,
);

if (failures.length > 0) {
  console.error('Golden Master verification FAILED');
  for (const f of failures) console.error('  -', f);
  process.exit(1);
}

console.log(`Golden Master verification PASSED (${Object.keys(actual.files).length} OpenRCA + ${Object.keys(actual.rcaevalRe2Files).length} RCAEval files byte-stable)`);
