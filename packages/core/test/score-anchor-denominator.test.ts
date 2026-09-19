import { describe, expect, it } from 'vitest';
import { scoreExport, sha256 } from '../src/score/score.js';
import { exportOpenRca } from '../src/export/openrca.js';
import { validBundle } from './fixtures.js';

/**
 * An unanchored file has to lower the score, not just the verdict.
 *
 * `checksumRate` divided by `matched + mismatched + missing` -- the anchors the
 * caller supplied -- and left `extra` out. So the numerator and the denominator
 * were both about anchors, and a file the anchor set simply does not mention
 * was neither verified nor held against the rate.
 *
 * A comparison set is a statement about the whole export. One anchor out of
 * twenty-two produced `score: 100` beside `passed: false`, which is the worst
 * pair to hand an operator: the number says the export is perfect and the flag
 * says it is not, and the number is the one people read.
 *
 * The existing test asserted `passed` and `extra` -- not `score` -- which is
 * why this survived its own comment saying the problem "must be visible rather
 * than rounded away by an average".
 */

function openRcaFiles(): Record<string, string> {
  return exportOpenRca(validBundle()).files;
}

function anchorsFor(files: Record<string, string>, paths: string[]): Record<string, string> {
  return Object.fromEntries(paths.map((p) => [p, sha256(files[p]!)]));
}

describe('anchors · the rate divides by the export, not by the anchor set', () => {
  it('reports 100 only when every exported file was verified', () => {
    const files = openRcaFiles();
    const report = scoreExport('openrca-1.0', files, anchorsFor(files, Object.keys(files)));
    expect(report.passed).toBe(true);
    expect(report.score).toBe(100);
  });

  it('does not report 100 when most of the export is unanchored', () => {
    const files = openRcaFiles();
    const paths = Object.keys(files);
    expect(paths.length).toBeGreaterThan(1);
    const report = scoreExport('openrca-1.0', files, anchorsFor(files, [paths[0]!]));
    expect(report.passed).toBe(false);
    // The number and the flag have to agree; either both say the export is
    // sound or neither does.
    expect(report.score, `score ${report.score} with ${paths.length - 1} unanchored files`).toBeLessThan(100);
  });

  it('falls as the unanchored fraction grows', () => {
    const files = openRcaFiles();
    const paths = Object.keys(files);
    const half = scoreExport('openrca-1.0', files, anchorsFor(files, paths.slice(0, 2)));
    const most = scoreExport('openrca-1.0', files, anchorsFor(files, paths.slice(0, 4)));
    expect(most.score).toBeGreaterThan(half.score);
    expect(most.score).toBeLessThan(100);
  });

  it('reports 0, not 100, when there is nothing to divide by', () => {
    // `checksumRate` answers `total === 0 ? 0 : matched / total`, and the `0`
    // arm is a judgement, not a fallback: an empty denominator means no file was
    // verified, and "verified none" is not "verified all". It is the same rule
    // `rateOf` and `meanOfPresent` follow -- a term with no denominator has no
    // credit to give.
    //
    // The export below is empty, so `matched` is 0 and every other bucket is
    // empty too. Returning `1` here would put `score: 100` next to
    // `passed: false` again, on an export that does not exist.
    const report = scoreExport('openrca-1.0', {}, {});
    expect(report.checksum.matched).toBe(0);
    expect(report.checksum.extra).toEqual([]);
    expect(report.checksum.missing).toEqual([]);
    expect(report.checksum.mismatched).toEqual([]);
    expect(report.score).toBe(0);
    expect(report.passed).toBe(false);
  });
});
