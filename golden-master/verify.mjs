// Golden Master verifier.
//
// Re-exports the self-contained fixture through the current build of the core
// package and compares every emitted file against the committed SHA-256 anchors.
// This proves the exporters are deterministic and byte-stable across changes.
//
// Usage:  pnpm build && node golden-master/verify.mjs
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { exportOpenRca, exportRcaEval } from '../packages/core/dist/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(readFileSync(join(here, 'fixture.json'), 'utf8'));
const expected = JSON.parse(readFileSync(join(here, 'expected.json'), 'utf8'));

const sha = (s) => createHash('sha256').update(String(s)).digest('hex');

const openrca = exportOpenRca(fixture);
const rcaevalRe2 = exportRcaEval(fixture, 'RE2');

const actual = {
  files: Object.fromEntries(Object.entries(openrca.files).map(([k, v]) => [k, { sha256: sha(v), bytes: String(v).length }])),
  rcaevalRe2Files: Object.fromEntries(Object.entries(rcaevalRe2.files).map(([k, v]) => [k, { sha256: sha(v), bytes: String(v).length }])),
};

const failures = [];
for (const group of ['files', 'rcaevalRe2Files']) {
  const exp = expected[group] ?? {};
  const act = actual[group] ?? {};
  const keys = new Set([...Object.keys(exp), ...Object.keys(act)]);
  for (const k of keys) {
    if (exp[k]?.sha256 !== act[k]?.sha256) {
      failures.push(`${group}/${k}: expected ${exp[k]?.sha256 ?? '<missing>'} got ${act[k]?.sha256 ?? '<missing>'}`);
    }
  }
}

if (failures.length > 0) {
  console.error('Golden Master verification FAILED');
  for (const f of failures) console.error('  -', f);
  process.exit(1);
}

console.log(`Golden Master verification PASSED (${Object.keys(actual.files).length} OpenRCA + ${Object.keys(actual.rcaevalRe2Files).length} RCAEval files byte-stable)`);
