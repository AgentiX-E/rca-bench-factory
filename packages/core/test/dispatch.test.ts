import { describe, expect, it } from 'vitest';

import { exportForScoreTarget, EXPORTERS, scoreTargetInvocation } from '../src/score/dispatch.js';
import { SCORE_TARGET_IDS } from '../src/score/score.js';
import { exportRcaEval } from '../src/export/rcaeval.js';
import { validBundle, validCase } from './fixtures.js';

/**
 * The one dispatch from a score target to the exporter that answers it.
 *
 * `scripts/check-official.mjs` and `packages/cli/src/run.ts` used to carry one
 * hand-written mapping each - the script a nine-entry catalogue of its own, the
 * CLI its own `EXPORTERS` table. The two disagreed about nothing observable,
 * which is exactly what made the script's copy dangerous: a wrong suite there is
 * *silent*.
 *
 * RE1 emits only `metrics.json` and `inject_time.txt`; RE2 and RE3 add
 * `logs.csv` and `traces.csv`. Feeding `rcaeval-re1` the RE2 files therefore
 * still scores, because `rcaeval-re1-avg5`'s structural check describes RE1's
 * file set and the scorer - not the script - is the thing that notices. The
 * script exits 1 either way, so its own copy was never load-bearing until the
 * day it was wrong in a way the scorer could not see: RE2 against RE3 files.
 *
 * These tests assert the mapping itself, so a wrong suite fails here rather than
 * depending on a downstream check that happens to overlap.
 */

/** The file names an export emitted, with the case-directory prefix stripped. */
function fileNames(files: Record<string, string>): string[] {
  return Object.keys(files)
    .map((p) => p.slice(p.indexOf('/') + 1))
    .sort();
}

describe('exportForScoreTarget · every declared target is dispatchable', () => {
  // RE3 admits code-level faults only, and the shared fixture is a CPU
  // saturation case, so RE3 answers with an empty export and a named skip. That
  // empty result is the correct answer, not a missing one - which is why the
  // assertion is "the exporter ran", not "it produced files".
  it.each(SCORE_TARGET_IDS)('answers %s with an export result', (target) => {
    const outcome = exportForScoreTarget(validBundle(), target);
    expect(Array.isArray(outcome.skipped)).toBe(true);
    expect(Object.keys(outcome.files).length + outcome.skipped.length).toBeGreaterThan(0);
  });

  it('covers the nine targets the scorer declares, and no more', () => {
    expect(SCORE_TARGET_IDS).toHaveLength(9);
  });
});

describe('scoreTargetInvocation · which exporter and which suite a target means', () => {
  it('maps rcaeval-re1 onto the rcaeval exporter with the RE1 suite', () => {
    expect(scoreTargetInvocation('rcaeval-re1')).toEqual({ id: 'rcaeval', suite: 'RE1' });
  });

  it('maps rcaeval-re2 onto the rcaeval exporter with the RE2 suite', () => {
    expect(scoreTargetInvocation('rcaeval-re2')).toEqual({ id: 'rcaeval', suite: 'RE2' });
  });

  it('maps rcaeval-re3 onto the rcaeval exporter with the RE3 suite', () => {
    expect(scoreTargetInvocation('rcaeval-re3')).toEqual({ id: 'rcaeval', suite: 'RE3' });
  });

  // The fallthrough branch: every target that is not an RCAEval suite names its
  // exporter directly, and the suite it carries is inert. Asserted so the branch
  // is not merely reached but pinned.
  it.each(['openrca-1.0', 'openrca-2.0', 'rca100', 'aiops2025', 'cloud-opsbench', 'itbench'] as const)(
    'maps %s onto an exporter of the same name, with an inert suite',
    (target) => {
      expect(scoreTargetInvocation(target)).toEqual({ id: target, suite: 'RE2' });
    },
  );
});

/**
 * RE1 against RE2 - the half of the drift a structural check would still catch,
 * asserted here so the mapping itself carries the fact rather than borrowing it.
 */
describe('the RE1 and RE2 exports are not interchangeable', () => {
  it('RE1 emits only metrics and inject_time, so a suite swap is detectable', () => {
    const re1 = exportRcaEval(validBundle(), 'RE1');
    expect(fileNames(re1.files)).toEqual(['inject_time.txt', 'metrics.json']);
  });

  it('RE2 adds the logs and traces RE1 omits', () => {
    const re2 = exportRcaEval(validBundle(), 'RE2');
    expect(fileNames(re2.files)).toEqual(['inject_time.txt', 'logs.csv', 'metrics.json', 'traces.csv']);
  });

  it('dispatch honours the suite, rather than collapsing the three onto one', () => {
    // Asserted as "differs from", which was the original intent. Written as
    // `.not.toEqual(...)` on the two file-name arrays, so an implementation that
    // routed every rcaeval target through one suite fails here.
    const re1 = fileNames(exportForScoreTarget(validBundle(), 'rcaeval-re1').files);
    const re2 = fileNames(exportForScoreTarget(validBundle(), 'rcaeval-re2').files);
    expect(re1).not.toEqual(re2);
  });
});

/**
 * RE2 against RE3 - the half that was silent.
 *
 * File names alone cannot separate them, so the only thing that does is which
 * cases each admits. That makes the skip set the load-bearing observable, and it
 * is the observable the script's hand-written copy could get wrong with nothing
 * to notice.
 */
describe('the RE2 and RE3 exports differ only in which cases they admit', () => {
  const resourceBundle = validBundle();

  const codeBundle = validBundle({
    cases: [
      validCase({
        fault: {
          type: 'code-bug',
          category: 'code',
          injectionMethod: 'feature-flag',
          parameters: {},
        },
      }),
    ],
  });

  it('separate on a resource fault by emitting nothing, which is itself observable', () => {
    // A first draft asserted the opposite - that the two are indistinguishable by
    // file name - and was wrong. RE3 refuses the resource case *before* writing
    // anything, so an empty file map is the sign. The premise it was reaching for
    // is real but narrower: the two share a *shape* (the same four names) whenever
    // both admit the case, which is what the code-fault test below covers.
    const re2 = exportForScoreTarget(resourceBundle, 'rcaeval-re2');
    const re3 = exportForScoreTarget(resourceBundle, 'rcaeval-re3');
    expect(fileNames(re2.files)).toEqual(['inject_time.txt', 'logs.csv', 'metrics.json', 'traces.csv']);
    expect(fileNames(re3.files)).toEqual([]);
  });

  it('RE2 admits a resource fault that RE3 refuses', () => {
    expect(exportForScoreTarget(resourceBundle, 'rcaeval-re2').skipped).toEqual([]);
    const re3 = exportForScoreTarget(resourceBundle, 'rcaeval-re3');
    expect(re3.skipped).toHaveLength(1);
    expect(re3.skipped[0]?.reason).toMatch(/code-level faults only/);
  });

  it('RE3 admits a code fault that RE2 also admits', () => {
    expect(exportForScoreTarget(codeBundle, 'rcaeval-re2').skipped).toEqual([]);
    expect(exportForScoreTarget(codeBundle, 'rcaeval-re3').skipped).toEqual([]);
  });

  // A code fault is the only input on which all three suites write files, so it
  // is the only input that can separate RE1 from RE3's payloads. Without it a
  // single-valued `suite === 'RE2'` branch is invisible: RE3 would attach the
  // declared RE3 directory name to RE1's two-file and RE2's four-file payloads.
  it('RE3 gives a code fault the full RE2-shaped payload, under its own directory', () => {
    const re3 = exportForScoreTarget(codeBundle, 'rcaeval-re3');
    expect(fileNames(re3.files)).toEqual(['inject_time.txt', 'logs.csv', 'metrics.json', 'traces.csv']);
    expect(Object.keys(re3.files).every((p) => p.startsWith('RE3-'))).toBe(true);
  });

  it('RE1 gives the same code fault only its two files', () => {
    const re1 = exportForScoreTarget(codeBundle, 'rcaeval-re1');
    expect(fileNames(re1.files)).toEqual(['inject_time.txt', 'metrics.json']);
  });

  it('a RE3 skip is still visible after dispatch, not discarded', () => {
    // A dispatch that forwarded only `.files` would erase the one fact that
    // separates RE2 from RE3.
    expect(exportForScoreTarget(resourceBundle, 'rcaeval-re3').skipped.length).toBeGreaterThan(0);
  });
});

describe('EXPORTERS · the table itself', () => {
  it('names one exporter per export target', () => {
    expect(Object.keys(EXPORTERS).sort()).toEqual([
      'aiops2025',
      'cloud-opsbench',
      'itbench',
      'openrca-1.0',
      'openrca-2.0',
      'rca100',
      'rcaeval',
    ]);
  });

  it('routes every score target onto a real exporter entry', () => {
    for (const target of SCORE_TARGET_IDS) {
      expect(EXPORTERS[scoreTargetInvocation(target).id]).toBeTypeOf('function');
    }
  });
});
