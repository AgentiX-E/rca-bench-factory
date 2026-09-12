#!/usr/bin/env node
/**
 * Run the README usage sample, verbatim.
 *
 * The README's code block is extracted from the file itself and executed against
 * the built package, so the sample cannot drift from the real API. This exists
 * because it *had* drifted: the block once called `runAllGates(case, bundle)`
 * when the signature is `runAllGates(bundle, options, meta)`, and nothing caught
 * it. Eyeballing a code sample is not a check.
 *
 * Extraction, not duplication: the snippet under test is read out of README.md at
 * run time. A hand-maintained copy would reintroduce exactly the drift this guard
 * exists to prevent.
 *
 *   node scripts/check-readme-sample.mjs
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const README = resolve(ROOT, 'README.md');
const DIST = resolve(ROOT, 'packages/core/dist/index.js');

/**
 * Every ```ts block in the README that starts with the package import.
 *
 * The marker is the import itself rather than a fence index, so adding an
 * unrelated snippet above the sample cannot silently change what is checked.
 */
function sampleBlocks(markdown) {
  const blocks = [];
  const fence = /^```ts\n([\s\S]*?)^```$/gm;
  for (const match of markdown.matchAll(fence)) {
    const body = match[1];
    if (body.includes("from '@rca-bench-factory/core'")) blocks.push(body);
  }
  return blocks;
}

const markdown = readFileSync(README, 'utf8');
const blocks = sampleBlocks(markdown);

if (blocks.length === 0) {
  console.error('README sample check FAILED: no @rca-bench-factory/core sample found in README.md');
  console.error('If the sample was removed on purpose, delete this guard in the same change.');
  process.exit(1);
}

// The sample is written for a consumer that has the package installed, so the
// bare specifier has to be redirected at this repository's build output. The
// rewrite is the only edit made to the extracted text, and it is asserted so a
// change to the import specifier surfaces here instead of producing a confusing
// module-resolution error.
let failures = 0;
for (const [index, body] of blocks.entries()) {
  const rewritten = body.replace(
    /from '@rca-bench-factory\/core'/,
    `from ${JSON.stringify(pathToFileURL(DIST).href)}`,
  );
  if (rewritten === body) {
    console.error(`README sample ${index + 1}: could not rewrite the package specifier`);
    failures += 1;
    continue;
  }

  const form = `data:text/javascript;base64,${Buffer.from(rewritten).toString('base64')}`;
  try {
    // A dynamic import runs the sample's top-level code for real. `console.log`
    // and friends inside the sample are left alone: the sample is a usage
    // illustration, and silencing them would hide whether it reached the end.
    await import(form);
    console.log(`README sample ${index + 1}: OK`);
  } catch (err) {
    console.error(`README sample ${index + 1}: FAILED`);
    console.error(err instanceof Error ? err.stack : String(err));
    failures += 1;
  }
}

if (failures > 0) {
  console.error(`README sample check FAILED (${failures} of ${blocks.length})`);
  process.exit(1);
}
console.log(`README sample check PASSED (${blocks.length} sample executed)`);
