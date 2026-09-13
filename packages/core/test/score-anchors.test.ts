import { describe, expect, it } from 'vitest';
import { exportOpenRca } from '../src/export/openrca.js';
import { scoreExport, sha256, verifyChecksums } from '../src/score/score.js';
import { validBundle } from './fixtures.js';

/**
 * Anchors are the scorer's only external ground truth.
 *
 * Structure checks live entirely inside this repository: they compare the export
 * against a field contract that the same repository defines, so they can only
 * ever say "this is self-consistent". Checksum verification is what ties the
 * bytes to something committed and reviewed, which is why the project requires
 * Golden Master anchors before a dataset is called submittable.
 *
 * That makes the *presence* of an anchor set a claim, not a detail: passing
 * `--anchors` tells the reader "these bytes were verified against committed
 * hashes". The defect this file pins is that an empty anchor object made that
 * claim while verifying nothing, because `scoreExport` treated
 *
 *     anchors === undefined
 *
 * and
 *
 *     Object.keys(anchors).length === 0
 *
 * as the same condition. The honest caller (no flag, structure-only scoring) and
 * the contradictory caller (a flag asserting byte verification, with nothing to
 * verify against) produced a report that `cmp -s` could not tell apart.
 *
 * So the two callers are separated here by observable behaviour, not by reading
 * the source: the absent-flag report must be the structure-only report, and the
 * empty-object report must not be.
 */

function openrcaFiles(): Record<string, string> {
  return exportOpenRca(validBundle()).files;
}

describe('scoreExport · an empty anchor set is not the same as no anchor set', () => {
  it('produces a structure-only report when no anchors are supplied', () => {
    // The positive control for the pair below. If this ever grows a `checksum`
    // section, the honest path has changed and the distinction is meaningless.
    const report = scoreExport('openrca-1.0', openrcaFiles());
    expect(report.passed).toBe(true);
    expect(report.score).toBe(100);
    expect(report.checksum).toBeUndefined();
  });

  it('does not produce the structure-only report when the anchor set is empty', () => {
    // The defect, stated as an inequality rather than as a field lookup: the two
    // reports must be distinguishable, or a reader cannot tell a verified pass
    // from an unverified one.
    const withoutFlag = scoreExport('openrca-1.0', openrcaFiles());
    const withEmptySet = scoreExport('openrca-1.0', openrcaFiles(), {});
    expect(withEmptySet).not.toEqual(withoutFlag);
  });

  it('carries a checksum section once an anchor set has been supplied', () => {
    // The observable that makes the two distinguishable. A supplied anchor set
    // means checksum verification ran; the section records what it found.
    const report = scoreExport('openrca-1.0', openrcaFiles(), {});
    expect(report.checksum).toBeDefined();
  });

  it('does not pass an empty anchor set', () => {
    // "A guard that cannot fail is worth nothing." An anchor set that matches
    // nothing cannot admit a dataset: `verifyChecksums` reports every file as
    // extra, which is exactly the contract drift the check exists to catch.
    const files = openrcaFiles();
    const report = scoreExport('openrca-1.0', files, {});
    expect(report.passed).toBe(false);
    expect(report.checksum?.passed).toBe(false);
    expect(report.checksum?.extra).toEqual(Object.keys(files));
  });

  it('agrees with verifyChecksums about an empty anchor set', () => {
    // The two must not disagree: `scoreExport` is a wrapper over the same
    // question, so a divergence would mean one of them is answering a different
    // question than its name promises.
    const files = openrcaFiles();
    const direct = verifyChecksums(files, {});
    const report = scoreExport('openrca-1.0', files, {});
    expect(report.checksum).toEqual(direct);
  });
});

describe('scoreExport · a useful anchor set still behaves', () => {
  it('passes a complete, faithful anchor set', () => {
    // The regression guard for the fix: separating the two callers must not
    // disturb the case the feature exists for.
    const files = openrcaFiles();
    const anchors = Object.fromEntries(Object.entries(files).map(([p, c]) => [p, sha256(c)]));
    const report = scoreExport('openrca-1.0', files, anchors);
    expect(report.passed).toBe(true);
    expect(report.score).toBe(100);
    expect(report.checksum).toEqual({ passed: true, matched: Object.keys(files).length, mismatched: [], missing: [], extra: [] });
  });

  it('fails a partial anchor set, naming the unanchored files', () => {
    // A subset is a real, plausible operator error - copy/paste lost half the
    // anchors - and it must be visible rather than rounded away by an average.
    const files = openrcaFiles();
    const all = Object.fromEntries(Object.entries(files).map(([p, c]) => [p, sha256(c)]));
    const [firstPath, ...rest] = Object.keys(all);
    const partial = { [firstPath!]: all[firstPath!]! };
    const report = scoreExport('openrca-1.0', files, partial);
    expect(report.passed).toBe(false);
    expect(report.checksum?.extra).toEqual(rest);
  });
});
