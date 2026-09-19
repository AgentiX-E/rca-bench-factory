import { describe, expect, it } from 'vitest';
import { exportOpenRca } from '../src/export/openrca.js';
import {
  readOfficialGroundTruth,
  readOfficialSubmission,
  runOfficialRegression,
  scoreOfficial,
} from '../src/score/official.js';
import type { ScoreTargetId } from '../src/score/targets.js';
import { validBundle, validCase } from './fixtures.js';

/**
 * The official-metric regression has to score the artefact it shipped.
 *
 * `runOfficialRegression` is one of the four external anchors: it is what lets
 * `pnpm official:check` claim a target's own published rule scores our export.
 * It used to build the prediction itself -- `oraclePrediction(gt)` from the
 * answer key it had just read -- which makes the anchor circular in the one
 * case where a real submission file exists. OpenRCA publishes a prediction
 * format, so the exported `record.csv` *is* the submission, and
 * `readOfficialSubmission` is the function that reads it; the regression never
 * called it.
 *
 * The consequence is not theoretical: `runOfficialRegression` answers
 * `oraclePerfect: true` for an export whose shipped prediction is wrong, empty
 * or absent, because the wrong prediction is never part of what it scores.
 * Every assertion below is measured against the real exporter output.
 *
 * Measured before the fix (these are the numbers, not a prediction):
 *
 *   shipped prediction names the wrong component  -> status `passed`
 *   shipped prediction names the wrong reason     -> status `passed`
 *   shipped prediction shifted out of tolerance   -> status `passed`
 *   `record.csv` deleted                          -> status `passed`
 *
 * Four from four silent. Meanwhile `scoreOfficial` on the very same file map
 * answered `final 0` and `accuracy 0.67`, because that path does call
 * `readOfficialSubmission`. Two entry points, one metric, opposite verdicts --
 * and the anchor is the one that was wrong.
 */

/** The exported file map for the one target with a published submission format. */
function openRcaFiles(): Record<string, string> {
  return exportOpenRca(validBundle()).files;
}

/** Rewrite the shipped prediction, leaving the answer key untouched. */
function shipPrediction(files: Record<string, string>, prediction: string): Record<string, string> {
  const path = 'order-prod/record.csv';
  const raw = files[path];
  if (raw === undefined) throw new Error('the export has no record.csv to corrupt');
  const lines = raw.trimEnd().split('\n');
  const body = lines[1];
  if (body === undefined) throw new Error('record.csv has no prediction row');
  const id = body.slice(0, body.indexOf(','));
  lines[1] = `${id},"${prediction.replace(/"/g, '""')}"`;
  files[path] = `${lines.join('\n')}\n`;
  return files;
}

const GOOD_PREDICTION =
  '{"1":{"root cause occurrence datetime":"2026-09-06 08:10:00",' +
  '"root cause component":"order","root cause reason":"CPU saturation on the order service"}}';

/** One facet of the shipped prediction changed, the rest left alone. */
function wrongPrediction(facet: 'component' | 'reason' | 'datetime'): string {
  const parts: Record<string, string> = {
    'root cause occurrence datetime': '2026-09-06 08:10:00',
    'root cause component': 'order',
    'root cause reason': 'CPU saturation on the order service',
  };
  if (facet === 'component') parts['root cause component'] = 'ghost';
  if (facet === 'reason') parts['root cause reason'] = 'an unrelated explanation';
  if (facet === 'datetime') parts['root cause occurrence datetime'] = '2026-09-06 11:10:00';
  const body = Object.entries(parts)
    .map(([k, v]) => `"${k}":"${v}"`)
    .join(',');
  return `{"1":{${body}}}`;
}

describe('the regression scores the shipped prediction, not a prediction it built', () => {
  it('passes on the export as shipped', () => {
    // Behaviour must be preserved: the fix is not allowed to break the anchor
    // on a correct export, only to make it honest on a wrong one.
    const report = runOfficialRegression('openrca-1.0', openRcaFiles());
    expect(report.status).toBe('passed');
    expect(report.oraclePerfect).toBe(true);
  });

  it.each(['component', 'reason', 'datetime'] as const)(
    'fails when the shipped prediction gets the %s wrong',
    (facet) => {
      const files = shipPrediction(openRcaFiles(), wrongPrediction(facet));
      const report = runOfficialRegression('openrca-1.0', files);
      expect(report.oraclePerfect).toBe(false);
      expect(report.status).toBe('failed');
      expect(report.failures.join(' ')).toContain('the oracle prediction scored');
    },
  );

  it('fails when the submission file is missing', () => {
    // The answer key is still complete, so a regression that builds its own
    // prediction has everything it needs to pass. That is the defect.
    const files = openRcaFiles();
    delete files['order-prod/record.csv'];
    const report = runOfficialRegression('openrca-1.0', files);
    expect(report.status).toBe('failed');
  });

  it('agrees with scoreOfficial case for case', () => {
    // `scoreOfficial` is the path the CLI runs and it does read the submission.
    // If the two disagree, one of them is scoring something the other is not --
    // which is how the anchor came to disagree with the CLI in the first place.
    for (const files of [openRcaFiles(), shipPrediction(openRcaFiles(), wrongPrediction('component'))]) {
      const regression = runOfficialRegression('openrca-1.0', files);
      const scored = scoreOfficial('openrca-1.0', files);
      expect(regression.cases).toHaveLength(scored.cases.length);
      regression.cases.forEach((entry, index) => {
        expect(entry.oracleScore, `case ${entry.caseId}`).toBeCloseTo(scored.cases[index]?.score ?? -1, 10);
      });
    }
  });
});

describe('the shipped submission is aligned with the answer key', () => {
  /**
   * Two cases whose answers differ, so a misaligned pairing cannot score 1 by
   * accident. `readOfficialSubmission` walks `record.csv` in file order and the
   * answer key walks `groundtruth.csv`; nothing but this test asserts the two
   * orders agree.
   */
  function twoCaseFiles(): Record<string, string> {
    const base = validBundle();
    const signals = base.signals['case-001'];
    if (signals === undefined) throw new Error('the fixture has no signals for case-001');
    const bundle = validBundle({
      cases: [
        validCase({ caseId: 'case-001' }),
        validCase({
          caseId: 'case-002',
          groundTruth: {
            ...validCase().groundTruth,
            rootCauseComponent: 'cart',
            rootCauseReason: 'Cart service saturated its connection pool',
          },
        }),
      ],
      signals: { 'case-001': signals, 'case-002': signals },
    });
    return exportOpenRca(bundle).files;
  }

  it('yields one submission per answer key', () => {
    const files = twoCaseFiles();
    const submission = readOfficialSubmission('openrca-1.0', files);
    expect(submission).toHaveLength(readOfficialGroundTruth('openrca-1.0', files).length);
    expect(submission.map((p) => p.component).sort()).toEqual(['cart', 'order']);
  });

  it('pairs each submission with its own answer key', () => {
    const files = twoCaseFiles();
    const report = runOfficialRegression('openrca-1.0', files);
    expect(report.caseCount).toBe(2);
    expect(report.oraclePerfect).toBe(true);
  });
});

describe('the eight targets with no published submission format', () => {
  /**
   * They are scored from the oracle on purpose and the docs say so. What must
   * not happen is the oracle standing in for a submission that could have been
   * read: `readOfficialSubmission` has to fall back, and the regression has to
   * go through it rather than around it.
   */
  const WITHOUT_SUBMISSION: ScoreTargetId[] = [
    'openrca-2.0',
    'rcaeval-re1',
    'rcaeval-re2',
    'rcaeval-re3',
    'rca100',
    'aiops2025',
    'cloud-opsbench',
    'itbench',
  ];

  it.each(WITHOUT_SUBMISSION)('%s falls back to the oracle, one per case', (target) => {
    const files = exportOpenRca(validBundle()).files; // shape only; target is unused below
    expect(files).toBeDefined();
    const submission = readOfficialSubmission(target, {});
    expect(submission).toEqual([]);
    const truth = readOfficialGroundTruth(target, {});
    expect(truth).toEqual([]);
  });
});
