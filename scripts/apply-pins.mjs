#!/usr/bin/env node
/**
 * Apply a pin report produced by `scripts/fetch-official.mjs --report-pins` to
 * the asset registry.
 *
 * ## Why this exists
 *
 * The registry is the thing a fetch verifies against. Its digest has to be the
 * digest that was measured, and until now it was not obtained that way: the fetch
 * printed `UNPINNED <id>: bytes=... sha256=...`, a human read the number out of a
 * CI log, and typed it into `official-assets.json`. A mistyped hex digit there
 * does not fail loudly -- it makes every subsequent run report a mismatch
 * against a perfectly good download, which is the most expensive kind of wrong
 * because the evidence points at the download.
 *
 * This tool is the missing half of that loop: it takes the report as data and
 * writes the two measured fields. Neither a human nor a model retypes a digest.
 *
 * ## What it will not do
 *
 * Only `sha256` and `bytes` are ever written. `url`, `license`, `licenseSource`,
 * `extractsTo`, `anchor` and `fetchable` are reviewed by hand and are left byte
 * for byte as they were. A tool able to rewrite the url would let a redirected
 * download change where the next run looks, with the change buried in a diff
 * that reads as a digest update.
 *
 * It also refuses, rather than repairs:
 *
 *   - an id the registry does not contain (the two files disagree; look at them,
 *     do not append an entry whose licence nobody chose);
 *   - a `sha256` that is not 64 lowercase hex characters, or a `bytes` that is
 *     not a positive safe integer -- a placeholder that looks like a hash is
 *     worse than `null`, because it reads as verified;
 *   - a report with no assets, because that is a fetch that measured nothing and
 *     a green result from it would be indistinguishable from a real one;
 *   - a report whose schema is not the one this tool understands;
 *   - a report whose url disagrees with the registry's for the same id, which is
 *     how a substituted artifact would be pinned under the old identity.
 *
 * ## Two modes
 *
 *   node scripts/apply-pins.mjs --report /tmp/pins.json
 *   node scripts/apply-pins.mjs --report /tmp/pins.json --check
 *
 * `--check` compares and writes nothing, so it is the form a workflow can run:
 * a drift becomes a failed step to reconcile rather than an edit made on a
 * runner that nobody reviews.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

const REGISTRY_SCHEMA = 'rca-bench-official-assets/1';
const REPORT_SCHEMA = 'rca-bench-official-pins/1';

function fail(message) {
  console.error(`error: ${message}`);
  process.exit(1);
}

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return undefined;
  const value = process.argv[index + 1];
  if (value === undefined || value.startsWith('--')) {
    fail(`${flag} requires a value`);
  }
  return value;
}

function readJson(path, what) {
  if (!existsSync(path)) {
    fail(`${what} '${path}' does not exist`);
  }
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    fail(`${what} '${path}' is not valid JSON: ${error.message}`);
  }
}

const reportPath = argValue('--report');
const registryPath = argValue('--registry') ?? resolve(ROOT, 'golden-master', 'official-assets.json');
const checkOnly = process.argv.includes('--check');

if (reportPath === undefined) {
  fail('--report is required: point it at the file fetch-official.mjs wrote with --report-pins');
}

const report = readJson(resolve(reportPath), 'report');
const registry = readJson(resolve(registryPath), 'registry');

if (report.schema !== REPORT_SCHEMA) {
  fail(`report schema is '${report.schema}', expected '${REPORT_SCHEMA}'`);
}
if (registry.schema !== REGISTRY_SCHEMA) {
  fail(`registry schema is '${registry.schema}', expected '${REGISTRY_SCHEMA}'`);
}
if (!Array.isArray(report.assets) || report.assets.length === 0) {
  fail(
    'the report contains no assets. A fetch that measured nothing is not a reason to report success -- ' +
      'check the fetch step for an upstream that was unreachable or an anchor that matched no asset.',
  );
}

const byId = new Map();
for (const asset of registry.assets) {
  byId.set(asset.id, asset);
}

const wanted = [];

for (const entry of report.assets) {
  const id = entry.id;
  const asset = byId.get(id);
  if (asset === undefined) {
    const known = [...byId.keys()].sort().join(', ');
    fail(
      `report names asset '${id}', which is not in the registry.\n` +
        `  registry ids: ${known}\n` +
        `  The two files disagree about what exists. Reconcile them by hand; this tool will not ` +
        `append an entry whose url, licence and extractsTo nobody chose.`,
    );
  }

  if (typeof entry.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(entry.sha256)) {
    fail(`'${id}': sha256 must be 64 lowercase hex characters, got ${JSON.stringify(entry.sha256)}`);
  }
  if (!Number.isSafeInteger(entry.bytes) || entry.bytes <= 0) {
    fail(`'${id}': bytes must be a positive whole number, got ${JSON.stringify(entry.bytes)}`);
  }
  if (entry.url !== asset.url) {
    fail(
      `'${id}': the report was measured against '${entry.url}' but the registry records ` +
        `'${asset.url}'.\n  A digest is only meaningful for the url it came from.`,
    );
  }

  wanted.push({ asset, sha256: entry.sha256, bytes: entry.bytes });
}

const changed = wanted.filter((w) => w.asset.sha256 !== w.sha256 || w.asset.bytes !== w.bytes);
const already = wanted.length - changed.length;

/**
 * Two different findings, two different responses.
 *
 * An asset with no digest recorded is the expected state before the first pin
 * lands: the fix is to merge the report, and there is nothing to investigate. An
 * asset whose recorded digest disagrees means upstream replaced the artifact or
 * the download was corrupted: merging the report would erase the evidence, so the
 * first move is to find out which happened.
 *
 * Reporting both as "pinned assets disagree" would be technically true and
 * operationally useless, and the operator who reads it once and sees it again
 * next week stops reading it at all.
 */
const unpinned = changed.filter((w) => w.asset.sha256 === null && w.asset.bytes === null);
const drifted = changed.filter((w) => !(w.asset.sha256 === null && w.asset.bytes === null));

if (checkOnly) {
  if (unpinned.length > 0) {
    console.error(`${unpinned.length} asset(s) are not yet pinned:`);
    for (const w of unpinned) {
      console.error(`  ${w.asset.id}: measured bytes=${w.bytes} sha256=${w.sha256}`);
    }
    console.error(
      '\nNothing is wrong with the download. Merge these into the registry so the next run ' +
        'verifies rather than records: node scripts/apply-pins.mjs --report <report>',
    );
  }
  if (drifted.length > 0) {
    console.error(`${drifted.length} asset(s) have drifted from the registry:`);
    for (const w of drifted) {
      console.error(
        `  ${w.asset.id}: registry sha256=${String(w.asset.sha256)} bytes=${String(w.asset.bytes)}`,
      );
      console.error(`  ${' '.repeat(w.asset.id.length)}  measured sha256=${w.sha256} bytes=${w.bytes}`);
    }
    console.error(
      '\nEither upstream replaced the artifact or the download was corrupted. Neither is fixed ' +
        'by editing the registry until the cause is known.',
    );
  }
  if (changed.length > 0) {
    process.exit(1);
  }
  console.log(`apply-pins: OK (${already} pin(s) agree with the report; nothing written)`);
  process.exit(0);
}

if (changed.length === 0) {
  console.log(`apply-pins: no change (${already} pin(s) already recorded)`);
  process.exit(0);
}

// Only the two measured fields are assigned. Everything else in the object is
// the same reference it was read as, so a field this tool does not know about
// is preserved rather than dropped.
for (const w of changed) {
  w.asset.sha256 = w.sha256;
  w.asset.bytes = w.bytes;
}

writeFileSync(resolve(registryPath), `${JSON.stringify(registry, null, 2)}\n`);

console.log(`apply-pins: wrote ${changed.length} pin(s) to ${registryPath}`);
for (const w of changed) {
  console.log(`  ${w.asset.id}: bytes=${w.bytes} sha256=${w.sha256}`);
}
