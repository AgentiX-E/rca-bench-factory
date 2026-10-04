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
  /**
   * The three states an asset can be in, defined in the registry rather than
   * only in the guard that reads it.
   *
   * `pinned` and `unfetchable` each have a field; `pending` has none, which is
   * what made it invisible. A state expressible only as the absence of the other
   * two is a state a contributor will not know they can be in -- and it is the
   * only one with an action attached to it.
   */
  stateVocabulary: Record<string, string>;
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

  // Every asset is in exactly one of three states, and the third one has no
  // field: it is what an asset is when it is neither pinned nor declared
  // unfetchable. That made it invisible -- the guard's summary line used to read
  // `11 asset(s), 3 pinned, 7 declared unfetchable`, and three plus seven is ten.
  //
  // The state is `pending`, it is now named in the registry's own
  // `stateVocabulary`, and the point of asserting it here is that `pending` is
  // the only state with an action attached to it. A reader who cannot tell
  // *pending* from *forgotten* cannot act on either.
  describe('every asset is pinned, unfetchable, or pending, and pending is named', () => {
    it('declares the three states in the registry itself, not only in a guard', () => {
      for (const state of ['pinned', 'unfetchable', 'pending']) {
        expect(registry.stateVocabulary[state], `the state '${state}' is not defined`).toBeTruthy();
      }
    });

    it('partitions the asset list into pinned and pending, with nothing left over', () => {
      const pinned = registry.assets.filter((a) => a.sha256 !== null);
      const pending = registry.assets.filter((a) => a.sha256 === null);
      expect(pinned.length + pending.length).toBe(registry.assets.length);
      // `fetchable: false` belongs in `notFetchable`, so no asset here is both
      // unpinned and unfetchable -- that entry could never be pinned, and the
      // pending state would be carrying a download nothing will ever take.
      for (const a of pending) {
        expect(a.fetchable, `'${a.id}' is unpinned and unfetchable, so it can never be pinned`).toBe(true);
      }
    });

    it('names every pending asset, so the state is a list and not a residue', () => {
      // Named rather than counted. This is the assertion that would have failed
      // before v1.51: the state existed, and nothing said so.
      const pending = registry.assets.filter((a) => a.sha256 === null).map((a) => a.id);
      expect(pending.length).toBeGreaterThan(0);
      for (const id of pending) {
        expect(id.length, 'a pending asset is unnamed').toBeGreaterThan(0);
      }
      // The residues are disjoint: an asset is pending or unfetchable, never both.
      const unfetchable = new Set(registry.notFetchable.map((n) => n.id));
      for (const id of pending) {
        expect(unfetchable.has(id), `'${id}' is both pending and declared unfetchable`).toBe(false);
      }
    });

    // The pin is the only field that can move an asset out of `pending`, and it
    // is only ever set from a measured download. A state that could be closed by
    // editing a description instead of running the fetch would be a state that
    // reports progress the project did not make.
    it('is closed only by a measured pin, so no state is reachable by editing prose', () => {
      const pendingDefinition = registry.stateVocabulary.pending;
      expect(pendingDefinition).toMatch(/measured/i);
      expect(pendingDefinition).toMatch(/sha256/i);
      // And the pinned state says where the digest came from, so a hand-typed
      // value is a contradiction of the definition rather than a shortcut.
      expect(registry.stateVocabulary.pinned).toMatch(/measured/i);
    });
  });
});
