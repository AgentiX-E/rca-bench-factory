import { describe, expect, it } from 'vitest';
import type { FaultCase, IrBundle, TelemetrySignal } from '../src/ir/types.js';
import {
  G3_DEFAULTS,
  G3_GRID_AXES,
  checkG3Validity,
  describeG3ThresholdGrid,
  readG3ThresholdGrid,
} from '../src/gates/gates.js';
import { INJECT, T0, metricAt, validCase } from './fixtures.js';

/**
 * The two thresholds G3 admits a case by, read as a grid rather than as two numbers.
 *
 * `minAbsZ` and `minSustainedSamples` decide whether a case's telemetry contains an anomaly
 * strong enough to score. Both are parameters with defaults, and a default is a judgement: this
 * suite is where the judgement has to survive being moved.
 *
 * The property the grid is built to state is **monotonicity**: raising the |Z| line or demanding
 * more samples can only refuse more cases, so the grid is a surface and not sixteen unrelated
 * measurements. The property the default has to state is that it is not *on a slope* -- a cell
 * whose neighbours flip a large share of the corpus is a threshold doing arithmetic on its own
 * parameter rather than on the data.
 */

/** The baseline every fixture below shares: ten samples, mean 20, sd ~1.095. */
const BASELINE = [20, 21, 19, 20, 22, 18, 20, 21, 19, 20] as const;

const MEAN = 20;
/** `stddev` of the baseline above, to four places, so a `post` can be placed at a chosen z. */
const SD = 1.0954451150103321;

/** A post-onset value whose z-score against `BASELINE` is exactly `z`. */
function atZ(z: number): number {
  return Number((MEAN + z * SD).toFixed(6));
}

/** A case with `post` as its post-onset series, and the signals that carry it. */
function caseWith(
  caseId: string,
  post: number[],
  options: { service?: string; metric?: string } = {},
): { fc: FaultCase; signals: TelemetrySignal[] } {
  const service = options.service ?? 'order';
  const metric = options.metric ?? 'cpu_usage';
  const fc = validCase({ caseId });
  const signals: TelemetrySignal[] = [
    ...BASELINE.map((value, index) => metricAt(index * 30, metric, value, service)),
    ...post.map((value, index) => metricAt(600 + index * 30, metric, value, service)),
  ];
  return { fc, signals };
}

/**
 * A baseline whose sd is exactly one, so a post sample at `MEAN + z` scores exactly `z`.
 *
 * `BASELINE`'s sd is irrational, which puts every flip point a hair off an axis value -- and a line
 * a hair above `2` cannot tell `>` from `>=`. The boundary on the |Z| axis is only observable with a
 * z-score that lands on the axis exactly.
 */
const UNIT_BASELINE = [19, 21, 19, 21, 19, 21, 19, 21, 19, 21] as const;

/** A case whose three post-onset samples all sit exactly at |Z| = `z`. */
function caseOnTheLine(caseId: string, z: number): { fc: FaultCase; signals: TelemetrySignal[] } {
  const fc = validCase({ caseId });
  const signals: TelemetrySignal[] = [
    ...UNIT_BASELINE.map((value, index) => metricAt(index * 30, 'cpu_usage', value)),
    ...[0, 1, 2].map((index) => metricAt(600 + index * 30, 'cpu_usage', MEAN + z)),
  ];
  return { fc, signals };
}

function bundleOf(cases: Array<{ fc: FaultCase; signals: TelemetrySignal[] }>): IrBundle {
  const signals: Record<string, TelemetrySignal[]> = {};
  for (const one of cases) signals[one.fc.caseId] = one.signals;
  return {
    irVersion: '2.0',
    graph: { entities: [], edges: [] },
    cases: cases.map((one) => one.fc),
    signals,
  };
}

/** The cases `checkG3Validity` refuses for a weak signal, which is the only arm the grid models. */
function refusedByGate(bundle: IrBundle, minAbsZ: number, minSustainedSamples: number): string[] {
  return checkG3Validity(bundle, { minAbsZ, minSustainedSamples })
    .violations.filter((v) => v.code === 'WEAK_ANOMALY_SIGNAL')
    .map((v) => String(v.fieldPath).split('.')[0]);
}

describe('the grid the thresholds are read on', () => {
  it('is four by four, and the shipped defaults are one of its cells', () => {
    // A grid whose axes skip the default measures thresholds nobody ships. This is the assertion
    // that keeps `G3_DEFAULTS` and `G3_GRID_AXES` one definition rather than two.
    expect(G3_GRID_AXES.minAbsZ).toHaveLength(4);
    expect(G3_GRID_AXES.minSustainedSamples).toHaveLength(4);
    expect(G3_GRID_AXES.minAbsZ).toContain(G3_DEFAULTS.minAbsZ);
    expect(G3_GRID_AXES.minSustainedSamples).toContain(G3_DEFAULTS.minSustainedSamples);
    const reading = readG3ThresholdGrid(bundleOf([caseWith('a', [atZ(60), atZ(61), atZ(62)])]));
    expect(reading.cells).toHaveLength(16);
    expect(reading.defaultIsAxisPoint).toBe(true);
    expect(reading.defaultCell.minAbsZ).toBe(G3_DEFAULTS.minAbsZ);
    expect(reading.defaultCell.minSustainedSamples).toBe(G3_DEFAULTS.minSustainedSamples);
  });

  it('agrees with the gate in every one of its sixteen cells', () => {
    // The reading and the verdict are one computation, so a disagreement here is the defect this
    // test exists for: two readers of the same rule that can answer differently are two rules.
    const bundle = bundleOf([
      caseWith('strong', [atZ(60), atZ(61), atZ(62), atZ(63), atZ(64)]),
      caseWith('mid', [atZ(4), atZ(4.5), atZ(5), atZ(5.5), atZ(6)]),
      caseWith('weak', [atZ(1.2), atZ(1.4), atZ(1.6), atZ(1.8), atZ(1.9)]),
      caseWith('flat', [20, 20, 20, 20, 20]),
      // A case sitting exactly on the second |Z| line, so the two readers have to agree about the
      // inclusive side of it rather than about the interior of a cell.
      caseOnTheLine('on-the-line', 2),
    ]);
    const reading = readG3ThresholdGrid(bundle);
    for (const cell of reading.cells) {
      expect(
        [...cell.refusedCaseIds].sort(),
        `cell |Z| >= ${cell.minAbsZ}, ${cell.minSustainedSamples} sample(s)`,
      ).toEqual(refusedByGate(bundle, cell.minAbsZ, cell.minSustainedSamples).sort());
    }
    expect(reading.judged).toBe(5);
  });

  it('moves the verdict along the |Z| axis when a case sits between two lines', () => {
    // The synthetic arm of the slope rule: a case at |Z| = 5 is admitted at 2 and at 10^-1, and
    // refused at the cell whose line is 10. Without this the rule below could only ever be green.
    const bundle = bundleOf([
      caseWith('strong', [atZ(60), atZ(61), atZ(62), atZ(63), atZ(64)]),
      caseWith('borderline', [atZ(4.9), atZ(5), atZ(5.1), atZ(5.2), atZ(5.3)]),
    ]);
    const reading = readG3ThresholdGrid(bundle);
    const atTwo = reading.cells.find((c) => c.minAbsZ === 2 && c.minSustainedSamples === 3);
    const atTen = reading.cells.find((c) => c.minAbsZ === 10 && c.minSustainedSamples === 3);
    expect(atTwo?.refused).toBe(0);
    expect(atTen?.refusedCaseIds).toEqual(['borderline']);
  });

  it('moves the verdict along the sample axis when a run is too short', () => {
    const bundle = bundleOf([
      caseWith('three-run', [atZ(60), atZ(61), atZ(62), atZ(0.5), atZ(0.6)]),
    ]);
    const reading = readG3ThresholdGrid(bundle);
    expect(reading.cells.find((c) => c.minAbsZ === 2 && c.minSustainedSamples === 3)?.refused).toBe(0);
    expect(
      reading.cells.find((c) => c.minAbsZ === 2 && c.minSustainedSamples === 5)?.refusedCaseIds,
    ).toEqual(['three-run']);
  });

  it('admits a run that is exactly as long as the sample line', () => {
    // The boundary is `>=`, and the grid has to inherit it from the gate rather than from a
    // re-implementation: a run of three against a three-sample line is the shortest admissible
    // case, and an off-by-one here would silently refuse every case built at the default.
    const bundle = bundleOf([caseWith('exact', [atZ(60), atZ(61), atZ(62), atZ(0.2), atZ(0.3)])]);
    const reading = readG3ThresholdGrid(bundle);
    const cell = reading.cells.find((c) => c.minAbsZ === 2 && c.minSustainedSamples === 3);
    expect(cell?.admitted).toBe(1);
    expect(cell?.refused).toBe(0);
  });

  it('admits a case whose best window sits exactly on a |Z| line', () => {
    // A refusal on this axis is `minAbsZ > flipZ`, so a case exactly on the line still sustains it.
    // The shipped corpus cannot see this: its weakest flip is 126.85, and `>` and `>=` agree on
    // every line below that, which is why the boundary is planted with an exact z-score instead.
    const bundle = bundleOf([caseOnTheLine('exactly-two', 2)]);
    const reading = readG3ThresholdGrid(bundle);
    expect(reading.flips).toEqual([{ caseId: 'exactly-two', flipZ: 2 }]);
    expect(reading.cells.find((c) => c.minAbsZ === 2 && c.minSustainedSamples === 3)?.refused).toBe(0);
    expect(
      reading.cells.find((c) => c.minAbsZ === 10 && c.minSustainedSamples === 3)?.refusedCaseIds,
    ).toEqual(['exactly-two']);
    // And the gate says the same, which is the half the reading must not be able to decide alone.
    expect(refusedByGate(bundle, 2, 3)).toEqual([]);
  });

  it('takes a case-refusing count that never falls as either threshold rises', () => {
    const bundle = bundleOf([
      caseWith('strong', [atZ(60), atZ(61), atZ(62), atZ(63), atZ(64), atZ(9), atZ(9.5), atZ(11)]),
      caseWith('mid', [atZ(3), atZ(3.2), atZ(3.4), atZ(3.6), atZ(3.8), atZ(4), atZ(4.2), atZ(4.4)]),
      caseWith('weak', [atZ(0.9), atZ(1.1), atZ(1.3), atZ(1.5), atZ(1.7), atZ(1.9), atZ(2.1), atZ(2.3)]),
    ]);
    const reading = readG3ThresholdGrid(bundle);
    for (const z of G3_GRID_AXES.minAbsZ) {
      const row = reading.cells.filter((c) => c.minAbsZ === z);
      for (let i = 1; i < row.length; i += 1) {
        expect(row[i]!.refused, `|Z| >= ${z}: ${row[i]!.minSustainedSamples} sample(s)`).toBeGreaterThanOrEqual(
          row[i - 1]!.refused,
        );
      }
    }
    for (const k of G3_GRID_AXES.minSustainedSamples) {
      const column = reading.cells.filter((c) => c.minSustainedSamples === k);
      for (let i = 1; i < column.length; i += 1) {
        expect(
          column[i]!.refused,
          `${k} sample(s) at |Z| >= ${column[i]!.minAbsZ}`,
        ).toBeGreaterThanOrEqual(column[i - 1]!.refused);
      }
    }
  });

  it('reads a case’s flip point from the best window of consecutive samples', () => {
    // The flip is the largest |Z| line at which the case still sustains the default's three
    // samples, which is the best three-window's *smallest* z. A case whose strong run is broken by
    // one quiet sample must report the broken run and not the spike: the gate demands a streak.
    const bundle = bundleOf([
      caseWith('broken', [atZ(80), atZ(0.4), atZ(80), atZ(6), atZ(7), atZ(8)]),
    ]);
    const reading = readG3ThresholdGrid(bundle);
    expect(reading.flips).toHaveLength(1);
    expect(reading.flips[0]?.caseId).toBe('broken');
    // `atZ` rounds its input to six places, so the flip comes back within a hair of six rather
    // than at six. The reading keeps the computed number; the *printed* one is fixed at two places.
    expect(reading.flips[0]?.flipZ).toBeCloseTo(6, 5);
    expect(reading.weakest?.caseId).toBe('broken');
    expect(reading.margin).toBeCloseTo(3, 5);
  });

  it('reports a case that never sustains the line as a null flip rather than a zero', () => {
    // `0` is a line a case sits exactly on; `null` is a case with nothing to measure. The two are
    // different findings and a reading that folds them together reports a threshold of zero.
    const bundle = bundleOf([caseWith('quiet', [atZ(0.2), atZ(0.3)])]);
    const reading = readG3ThresholdGrid(bundle);
    expect(reading.flips).toEqual([{ caseId: 'quiet', flipZ: null }]);
    expect(reading.weakest).toBeNull();
    expect(reading.margin).toBeNull();
    expect(reading.defaultCell.refusedCaseIds).toEqual(['quiet']);
  });

  it('counts a case with no metric signal as unjudged, and names it', () => {
    // `checkG3Validity` skips a case with no metric signals, so the grid must too -- and say so,
    // because a denominator of 3 where the bundle holds 4 is the shape of a percentage built out
    // of nothing.
    const quiet = validCase({ caseId: 'no-metrics' });
    const bundle = bundleOf([
      caseWith('strong', [atZ(60), atZ(61), atZ(62)]),
      { fc: quiet, signals: [] },
    ]);
    const reading = readG3ThresholdGrid(bundle);
    expect(reading.judged).toBe(1);
    expect(reading.unmatched).toEqual(['no-metrics']);
    expect(reading.defaultCell.refusedCaseIds).toEqual([]);
  });

  it('treats a case with no signals entry at all as unjudged, not as a refusal', () => {
    // `signals` is a sparse map: a bundle may list a case it carries no telemetry for, and the
    // gate skips it. Reading the missing entry as "no metric sustains anything" would refuse a
    // case nobody asked about and report it in every one of the sixteen cells.
    const absent = validCase({ caseId: 'absent' });
    const bundle: IrBundle = {
      irVersion: '2.0',
      graph: { entities: [], edges: [] },
      cases: [caseWith('judged', [atZ(60), atZ(61), atZ(62)]).fc, absent],
      signals: { judged: caseWith('judged', [atZ(60), atZ(61), atZ(62)]).signals },
    };
    const reading = readG3ThresholdGrid(bundle);
    expect(reading.judged).toBe(1);
    expect(reading.unmatched).toEqual(['absent']);
    expect(reading.defaultCell.refused).toBe(0);
  });

  it('reports the longest run any case reaches, which is the ceiling the sample axis runs into', () => {
    const bundle = bundleOf([
      caseWith('long', [atZ(60), atZ(60), atZ(60), atZ(60), atZ(60), atZ(60)]),
      caseWith('short', [atZ(60), atZ(60)]),
    ]);
    const reading = readG3ThresholdGrid(bundle);
    expect(reading.ceiling).toBe(6);
  });

  it('names the neighbouring cells that move the refused set, and by how much', () => {
    const bundle = bundleOf([
      caseWith('strong', [atZ(60), atZ(61), atZ(62), atZ(63), atZ(64)]),
      caseWith('borderline', [atZ(9.5), atZ(9.5), atZ(9.5), atZ(9.5), atZ(9.5)]),
    ]);
    const reading = readG3ThresholdGrid(bundle);
    // Four orthogonal neighbours, not eight: a diagonal cell differs on both axes at once, so a
    // step there cannot be attributed to either threshold.
    expect(reading.neighbours.map((n) => `${n.minAbsZ}@${n.minSustainedSamples}:${n.delta}`)).toEqual([
      '1@3:0',
      '10@3:1',
      '2@1:0',
      '2@5:0',
    ]);
    expect(reading.maxNeighbourDelta).toBe(1);
  });

  it('refuses to invent a default cell when the axes do not contain the default', () => {
    // A caller may ask a narrower question. What it may not get is a `defaultCell` that is not a
    // cell: the reading says `false` and leaves the field on the nearest thing it measured.
    const reading = readG3ThresholdGrid(bundleOf([caseWith('a', [atZ(60), atZ(61), atZ(62)])]), {
      axes: { minAbsZ: [4, 5, 6, 7], minSustainedSamples: [1, 2, 4, 5] },
    });
    expect(reading.defaultIsAxisPoint).toBe(false);
    expect(reading.cells).toHaveLength(16);
    expect(reading.cells.every((c) => c.minAbsZ >= 4)).toBe(true);
  });

  it('prints the grid, the default, the weakest flip and the ceiling in one sentence', () => {
    const bundle = bundleOf([
      caseWith('strong', [atZ(60), atZ(61), atZ(62), atZ(63), atZ(64)]),
      caseWith('weakest-case', [atZ(3.3), atZ(3.35), atZ(3.4), atZ(3.45), atZ(3.5)]),
    ]);
    const reading = readG3ThresholdGrid(bundle);
    expect(describeG3ThresholdGrid(reading)).toBe(
      'g3 threshold grid: 2 case(s) judged over 4x4 cells (|Z| 1/2/10/100 x samples 1/3/5/8); '
        + 'the default (|Z| >= 2, 3 samples) admits 2 of 2 and 1 of its 4 neighbour(s) change that, '
        + 'by up to 1; '
        + "the weakest case 'weakest-case' stops sustaining 3 sample(s) at |Z| >= 3.40, "
        + '1.70x the default; the sample line refuses 0 / 0 / 0 / 2 case(s) at 1 / 3 / 5 / 8; '
        + 'the most post-onset samples any case offers is 5, '
        + 'which is the tallest sample line the grid can ask for',
    );
  });

  it('says which side of the grid the slope was on when a neighbour does move it', () => {
    const bundle = bundleOf([
      caseWith('strong', [atZ(60), atZ(61), atZ(62), atZ(63), atZ(64)]),
      caseWith('borderline', [atZ(9.5), atZ(9.5), atZ(9.5), atZ(9.5), atZ(9.5)]),
    ]);
    expect(describeG3ThresholdGrid(readG3ThresholdGrid(bundle))).toBe(
      'g3 threshold grid: 2 case(s) judged over 4x4 cells (|Z| 1/2/10/100 x samples 1/3/5/8); '
        + 'the default (|Z| >= 2, 3 samples) admits 2 of 2 and 1 of its 4 neighbour(s) change that, '
        + 'by up to 1; '
        + "the weakest case 'borderline' stops sustaining 3 sample(s) at |Z| >= 9.50, "
        + '4.75x the default; the sample line refuses 0 / 0 / 0 / 2 case(s) at 1 / 3 / 5 / 8; '
        + 'the most post-onset samples any case offers is 5, '
        + 'which is the tallest sample line the grid can ask for',
    );
  });

  it('says there is no flip to report when no case can sustain the default’s line', () => {
    // The sentence has to survive an empty reading: a corpus whose cases carry two samples each
    // has no flip point at three, and a printed `0.00x the default` would be a ratio of nothing.
    const reading = readG3ThresholdGrid(bundleOf([caseWith('quiet', [atZ(0.2), atZ(0.3)])]));
    expect(describeG3ThresholdGrid(reading)).toBe(
      'g3 threshold grid: 1 case(s) judged over 4x4 cells (|Z| 1/2/10/100 x samples 1/3/5/8); '
        + 'the default (|Z| >= 2, 3 samples) admits 0 of 1 and no neighbour changes that; '
        + 'no case sustains 3 sample(s) at any line, so there is no flip to report; '
        + 'the sample line refuses 1 / 1 / 1 / 1 case(s) at 1 / 3 / 5 / 8; '
        + 'the most post-onset samples any case offers is 2, '
        + 'which is the tallest sample line the grid can ask for',
    );
  });

  it('says when the default is not a cell of the grid it is printing', () => {
    // The grid may be asked a narrower question. Reading the default off a cell that is not there
    // would attribute the answer to a threshold the grid never measured, so the sentence says it.
    const reading = readG3ThresholdGrid(bundleOf([caseWith('a', [atZ(60), atZ(61), atZ(62)])]), {
      axes: { minAbsZ: [4, 5, 6, 7], minSustainedSamples: [1, 2, 4, 5] },
    });
    expect(describeG3ThresholdGrid(reading)).toBe(
      'g3 threshold grid: 1 case(s) judged over 4x4 cells (|Z| 4/5/6/7 x samples 1/2/4/5); '
        + 'the default (|Z| >= 2, 3 samples) admits 1 of 1 and no neighbour changes that '
        + '(the default cell is not on this grid); '
        + "the weakest case 'a' stops sustaining 3 sample(s) at |Z| >= 60.00, 30.00x the default; "
        + 'the sample line refuses 0 / 0 / 1 / 1 case(s) at 1 / 2 / 4 / 5; '
        + 'the most post-onset samples any case offers is 3, '
        + 'which is the tallest sample line the grid can ask for',
    );
  });

  it('states the same defaults the gate applies, rather than restating them', () => {
    // A case placed either side of the shipped |Z| line: the gate's verdict has to follow
    // `G3_DEFAULTS` at the boundary, so a constant that drifted from the code would be caught here
    // rather than by a corpus changing its answer.
    const above = bundleOf([caseWith('above', [atZ(2.05), atZ(2.06), atZ(2.07)])]);
    const below = bundleOf([caseWith('below', [atZ(1.95), atZ(1.96), atZ(1.97)])]);
    expect(refusedByGate(above, G3_DEFAULTS.minAbsZ, G3_DEFAULTS.minSustainedSamples)).toEqual([]);
    expect(refusedByGate(below, G3_DEFAULTS.minAbsZ, G3_DEFAULTS.minSustainedSamples)).toEqual(['below']);
  });

  it('rolls a case’s several metrics into the loudest run, not the first', () => {
    // The gate breaks out of the group loop on the first group that sustains, so the grid has to
    // ask every group: the first group is arbitrary -- it is insertion order -- and a reading that
    // kept only it would report a flip point that moves when the signals are reordered.
    const quiet = caseWith('multi', [atZ(0.2), atZ(0.3), atZ(0.4), atZ(0.5), atZ(0.6)], {
      metric: 'quiet_metric',
    });
    const loud = BASELINE.map((value, index) => metricAt(index * 30, 'loud_metric', value, 'order'))
      .concat([atZ(40), atZ(41), atZ(42), atZ(43), atZ(44)].map((value, index) =>
        metricAt(600 + index * 30, 'loud_metric', value, 'order')));
    const bundle = bundleOf([{ fc: quiet.fc, signals: [...quiet.signals, ...loud] }]);
    const reading = readG3ThresholdGrid(bundle);
    expect(reading.flips).toHaveLength(1);
    expect(reading.flips[0]?.flipZ).toBeCloseTo(42, 5);
    expect(reading.ceiling).toBe(5);
  });
});
