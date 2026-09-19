import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { SCORE_TARGET_IDS } from '../src/score/score.js';

/**
 * The contract `golden-master/official-assets.json` publishes.
 *
 * The registry is the one place that answers two questions at once: *where* an
 * upstream corpus lives, and *whether* we may fetch it automatically. The second
 * question is the one that goes stale silently -- a target can be added to the
 * scorer without anyone revisiting the registry, and the round trip then covers
 * fewer targets than the anchor claims while every check stays green.
 *
 * So the assertions below are mostly about completeness, not shape: every score
 * target must appear, and every target that is *not* fetchable must say why.
 * Without that, "we fetch what we are allowed to fetch" is unfalsifiable.
 *
 * The registry also must contain no data. That is asserted here as well as in
 * `scripts/check-no-vendored-data.mjs`, because this file is the one a future
 * contributor is most tempted to paste a URL's contents into.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const REGISTRY = resolve(ROOT, 'golden-master', 'official-assets.json');

interface Asset {
  id: string;
  anchor: string | null;
  url: string;
  license: string;
  licenseSource: string;
  fetchable: boolean;
  sha256: string | null;
  bytes: number | null;
  extractsTo: string | null;
}

interface NotFetchable {
  id: string;
  anchor: string | null;
  license: string;
  reason: string;
  alternative: string | null;
}

interface Registry {
  schema: string;
  note: string;
  assets: Asset[];
  notFetchable: NotFetchable[];
}

const registry: Registry = JSON.parse(readFileSync(REGISTRY, 'utf8'));

describe('golden-master/official-assets.json · the registry contract', () => {
  it('declares its own schema so a reader can refuse an unknown one', () => {
    expect(registry.schema).toBe('rca-bench-official-assets/1');
  });

  // Completeness in both directions. Missing either half lets the registry
  // drift into describing a project that no longer matches the scorer.
  it('names every score target the scorer declares, in assets or in notFetchable', () => {
    const covered = new Set<string>();
    for (const a of registry.assets) if (a.anchor !== null) covered.add(a.anchor);
    for (const n of registry.notFetchable) if (n.anchor !== null) covered.add(n.anchor);
    for (const target of SCORE_TARGET_IDS) {
      expect(covered.has(target), `score target '${target}' is absent from the registry`).toBe(true);
    }
  });

  it('never anchors an asset to a target the scorer does not declare', () => {
    const known = new Set<string>(SCORE_TARGET_IDS);
    for (const a of [...registry.assets, ...registry.notFetchable]) {
      if (a.anchor === null) continue;
      expect(known.has(a.anchor), `'${a.id}' anchors to unknown target '${a.anchor}'`).toBe(true);
    }
  });

  // A target that is absent from `notFetchable` and has no fetchable asset would
  // silently drop out of the round trip. Saying "no" out loud is the point.
  it('gives a reason for every target it cannot fetch', () => {
    for (const n of registry.notFetchable) {
      expect(n.reason.length, `'${n.id}' gives no reason`).toBeGreaterThan(40);
      expect(n.license.length, `'${n.id}' names no licence`).toBeGreaterThan(0);
    }
  });

  it('fetches only over HTTPS, and every entry cites its licence', () => {
    for (const a of registry.assets) {
      expect(a.url.startsWith('https://'), `'${a.id}' is not HTTPS`).toBe(true);
      expect(a.license.length, `'${a.id}' names no licence`).toBeGreaterThan(0);
      expect(a.licenseSource.startsWith('https://'), `'${a.id}' cites no licence source`).toBe(true);
    }
  });

  it('carries an id that is unique across both lists', () => {
    const ids = [...registry.assets, ...registry.notFetchable].map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // The pin is either absent -- not yet measured -- or a real digest. A
  // placeholder that looks like a hash is worse than null, because it reads as
  // verified when nothing was.
  it('states a sha256 only as a full 64-hex digest', () => {
    for (const a of registry.assets) {
      if (a.sha256 === null) continue;
      expect(a.sha256, `'${a.id}' has a malformed digest`).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('states bytes only as a positive whole number', () => {
    for (const a of registry.assets) {
      if (a.bytes === null) continue;
      expect(Number.isInteger(a.bytes) && a.bytes > 0, `'${a.id}' has a malformed byte count`).toBe(true);
    }
  });

  // Metadata is small. Anything large here is data that was meant to be
  // fetched, and fetching it into a tracked file is the one thing the whole
  // anchor design exists to avoid.
  it('stays metadata-sized, so no corpus was pasted into it', () => {
    const raw = readFileSync(REGISTRY, 'utf8');
    expect(raw.length).toBeLessThan(20_000);
  });
});
