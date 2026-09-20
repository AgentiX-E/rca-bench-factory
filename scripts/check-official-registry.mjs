#!/usr/bin/env node
/**
 * Fails the build when the asset registry contradicts itself.
 *
 * ## What this adds that the other guards do not
 *
 * The registry is covered from three angles already, and none of them is this
 * one:
 *
 *  - `packages/core/test/official-assets.test.ts` asserts the registry's shape
 *    and completeness. It reads the file, so it cannot see the *other* files the
 *    registry refers to.
 *  - `scripts/check-no-vendored-data.mjs` asserts no corpus is committed. It
 *    looks at tracked paths, not at what the registry claims about them.
 *  - `official-data.yml` compares the registry against a real download -- on a
 *    schedule, one anchor at a time. A pin edited on a Tuesday is not compared
 *    against anything until the following Monday, and a pin whose entry is
 *    malformed is never compared at all, because the fetch fails first.
 *
 * What remains is internal consistency: facts decidable from the working tree
 * alone, which is where a hand-edit actually goes wrong. A digest recorded for
 * one of a pair and not the other. A `fetchable: false` entry that still carries
 * a url, inviting a future reader to fetch what we decided not to. Two assets
 * claiming one extraction directory, so the second silently wins. A `pathPrefix`
 * pointing at a corpus tree, which would put this guard in direct disagreement
 * with the exemption in `check-no-vendored-data.mjs`.
 *
 * This runs as part of `pnpm lint`, so every push checks it.
 *
 *   node scripts/check-official-registry.mjs
 *   node scripts/check-official-registry.mjs --registry path/to/official-assets.json
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

const SCHEMA = 'rca-bench-official-assets/1';

/**
 * The only path a descriptor may claim.
 *
 * `check-no-vendored-data.mjs` exempts `golden-master/rcaeval-cases.json` from
 * the vendored-data rule precisely because the descriptors are a derived index --
 * case ids and injection instants, no samples. A registry entry pointing anywhere
 * else would be claiming a corpus tree is a descriptor file, and the two guards
 * would then disagree about whether that tree may be committed, with the
 * exemption winning because it is evaluated independently.
 */
const DESCRIPTOR_PATH = 'golden-master/rcaeval-cases.json';

function fail(lines) {
  console.error('check-official-registry: FAILED');
  for (const line of lines) console.error(`  ${line}`);
  process.exit(1);
}

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return undefined;
  const value = process.argv[index + 1];
  if (value === undefined || value.startsWith('--')) {
    fail([`${flag} requires a value`]);
  }
  return value;
}

const registryPath = resolve(
  argValue('--registry') ?? resolve(ROOT, 'golden-master', 'official-assets.json'),
);

if (!existsSync(registryPath)) {
  fail([`registry '${registryPath}' does not exist`]);
}

let registry;
try {
  registry = JSON.parse(readFileSync(registryPath, 'utf8'));
} catch (error) {
  // A registry that cannot be read must fail rather than pass. A guard that
  // returns 0 on an unparseable file is a guard that stops guarding the moment
  // someone adds a trailing comma.
  fail([`registry '${registryPath}' is not valid JSON: ${error.message}`]);
}

if (registry.schema !== SCHEMA) {
  fail([`registry schema is '${registry.schema}', expected '${SCHEMA}'`]);
}

const problems = [];

// The scorer's target list is the authority on which anchors are real. Imported
// from the built package would make `pnpm lint` depend on a build, so the list is
// read from source -- and from the module that *declares* it, not the one that
// re-exports it. `score.ts` re-exports `SCORE_TARGET_IDS` from `targets.ts`, so
// reading `score.ts` finds the identifier and none of the values, which presents
// as "the declaration moved" rather than "you are looking in the wrong file".
const TARGETS_SOURCE = resolve(ROOT, 'packages', 'core', 'src', 'score', 'targets.ts');
const targetsSource = readFileSync(TARGETS_SOURCE, 'utf8');
const targetMatch = /SCORE_TARGET_IDS\s*=\s*\[([^\]]+)\]/.exec(targetsSource);
if (targetMatch === null) {
  fail([
    `could not read the SCORE_TARGET_IDS declaration from ${relative(ROOT, TARGETS_SOURCE)}.`,
    `The declaration is an 'export const SCORE_TARGET_IDS = [...]' array literal. If it moved, ` +
      `point this check at its new home rather than removing the check.`,
  ]);
}
const declaredTargets = new Set(
  [...targetMatch[1].matchAll(/'([^']+)'/g)].map((m) => m[1]),
);

const extractionDirs = new Map();

for (const asset of registry.assets) {
  const where = `asset '${asset.id}'`;

  // A digest and a byte count describe the same download. Recording one and not
  // the other is not a partial pin, it is an ambiguous one: a reader cannot tell
  // whether the missing half was never measured or was measured and discarded.
  const hasDigest = asset.sha256 !== null && asset.sha256 !== undefined;
  const hasBytes = asset.bytes !== null && asset.bytes !== undefined;
  if (hasDigest !== hasBytes) {
    const missing = hasDigest ? 'bytes' : 'sha256';
    problems.push(
      `${where} records ${hasDigest ? 'sha256' : 'bytes'} without ${missing}. ` +
        `A digest and a byte count describe one download; record both or neither.`,
    );
  }

  if (asset.fetchable === true && (asset.url === undefined || asset.url === null || asset.url === '')) {
    problems.push(`${where} is marked fetchable but carries no url`);
  }
  if (asset.fetchable === false && asset.url !== undefined && asset.url !== null && asset.url !== '') {
    problems.push(
      `${where} is marked not fetchable but still carries a url. An entry that is not fetched ` +
        `must not look fetchable, or the next reader will fetch it.`,
    );
  }

  if (asset.anchor !== null && asset.anchor !== undefined && !declaredTargets.has(asset.anchor)) {
    problems.push(
      `${where} anchors to '${asset.anchor}', which the scorer does not declare. ` +
        `The round trip would silently cover nothing for it.`,
    );
  }

  if (asset.pathPrefix !== undefined && asset.pathPrefix !== null && asset.pathPrefix !== DESCRIPTOR_PATH) {
    problems.push(
      `${where} declares pathPrefix '${asset.pathPrefix}', but the only derived descriptor file is ` +
        `'${DESCRIPTOR_PATH}'. Any other value claims a corpus tree is a descriptor list.`,
    );
  }

  if (typeof asset.extractsTo === 'string' && asset.extractsTo !== '') {
    const previous = extractionDirs.get(asset.extractsTo);
    if (previous !== undefined) {
      problems.push(
        `'${asset.id}' and '${previous}' both extract into '${asset.extractsTo}'. The second to ` +
          `unpack would overwrite the first, and nothing would report it.`,
      );
    }
    extractionDirs.set(asset.extractsTo, asset.id);
  }
}

for (const entry of registry.notFetchable) {
  const where = `notFetchable entry '${entry.id}'`;
  if (typeof entry.reason !== 'string' || entry.reason.length <= 40) {
    problems.push(
      `${where} gives no reason (or one under 40 characters). 'We cannot fetch this' is a claim ` +
        `that has to say why, or it is indistinguishable from 'nobody looked'.`,
    );
  }
  if (entry.anchor !== null && entry.anchor !== undefined && !declaredTargets.has(entry.anchor)) {
    problems.push(`${where} anchors to '${entry.anchor}', which the scorer does not declare`);
  }
}

if (problems.length > 0) {
  fail(problems);
}

const pinned = registry.assets.filter((a) => a.sha256 !== null && a.sha256 !== undefined).length;
console.log(
  `check-official-registry: OK (${registry.assets.length} asset(s), ${pinned} pinned, ` +
    `${registry.notFetchable.length} declared unfetchable)`,
);
