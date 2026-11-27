/**
 * A lane table quotes one reading; the runner keeps quoting other readings.
 *
 * The plan fixes the *shape* -- which battery sits in which lane -- from the seconds of one
 * named reading. Every later run spends different seconds on the same commands, so the
 * shape's cost drifts. This file is the instrument for that drift. It holds three rules:
 *
 *   1. a row's price comes from one shared matcher (`priceOf`), the same one `laneErrors`
 *      uses, so a plan and an observation cannot price the same row two ways;
 *   2. an observation keeps the table's shape and only re-prices it (`observeLoads`) --
 *      re-placing the batteries is a different question, and reading 65/66/67 show why it
 *      is not the one to ask (the LPT shape changes with the seconds);
 *   3. the drift that lives in the progress prose is derived from the readings ledger and
 *      pinned in `golden-master/lane-drift.json`, so a number nobody re-measures is a number
 *      nobody can cite.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  observeDrift,
  observeLoads,
  priceOf,
  shapeSignature,
} from '../../../scripts/lane-costs.mjs';
import { ROOT } from '../../../scripts/gate-steps.mjs';

const COMMIT = 'a'.repeat(40);

/** A reading step, as the ledger holds it. */
function step(name: string, command: string, seconds: number) {
  return { job: 'j', name, command, seconds };
}

describe('pricing one row from one reading', () => {
  const reading = [step('a', 'run:a', 10), step('b', 'run:b', 9), step('c', 'run:b', 1)];

  it('takes the step whose name matches the row', () => {
    expect(priceOf({ step: 'a', command: 'run:a' }, reading)).toEqual({
      found: true,
      ambiguous: false,
      seconds: 10,
      count: 1,
    });
  });

  it('falls back to the only step running that command', () => {
    // 'a' has a unique command, so even a row named something else has one price.
    expect(priceOf({ step: 'renamed', command: 'run:a' }, reading).seconds).toBe(10);
  });

  it('marks two steps under one command with no name match as ambiguous', () => {
    const priced = priceOf({ step: 'renamed', command: 'run:b' }, reading);
    expect(priced.found).toBe(true);
    expect(priced.ambiguous).toBe(true);
    expect(priced.seconds).toBeNull();
  });

  it('picks the named step out of a command that runs twice', () => {
    const priced = priceOf({ step: 'c', command: 'run:b' }, reading);
    expect(priced.ambiguous).toBe(false);
    expect(priced.seconds).toBe(1);
  });

  it('reports a command the reading never ran', () => {
    expect(priceOf({ step: 'a', command: 'run:elsewhere' }, reading)).toEqual({
      found: false,
      ambiguous: false,
      seconds: null,
      count: 0,
    });
  });
});

describe('observing a fixed shape under a different reading', () => {
  // Two lanes: a=10 on lane 0; b=9 and c=1 on lane 1. The table paid 10 / 10.
  const table = {
    steps: [
      { step: 'a', command: 'run:a', seconds: 10, lane: 0 },
      { step: 'b', command: 'run:b', seconds: 9, lane: 1 },
      { step: 'c', command: 'run:c', seconds: 1, lane: 1 },
    ],
  };

  it('sums the new seconds under the lane the table fixed, not a new placement', () => {
    // New reading: a=5, b=7, c=3. A re-placement would put b (7) on lane 0 and give 7 / 8;
    // the fixed shape gives 5 / 10. The observation must report the latter.
    const seen = observeLoads(table, [step('a', 'run:a', 5), step('b', 'run:b', 7), step('c', 'run:c', 3)]);
    expect(seen.loads).toEqual([5, 10]);
    expect(seen.head).toBe(10);
    expect(seen.spread).toBe(5);
    expect(seen.total).toBe(15);
    expect(seen.unpriced).toEqual([]);
    expect(seen.ambiguous).toEqual([]);
  });

  it('refuses to call an incomplete observation a measurement', () => {
    const seen = observeLoads(table, [step('a', 'run:a', 5), step('b', 'run:b', 7)]);
    expect(seen.unpriced).toEqual(['c']);
    expect(seen.complete).toBe(false);
  });

  it('names an ambiguous row instead of silently taking the first', () => {
    const doubled = {
      steps: [{ step: 'a', command: 'run:b', seconds: 10, lane: 0 }],
    };
    const seen = observeLoads(doubled, [step('x', 'run:b', 5), step('y', 'run:b', 7)]);
    expect(seen.ambiguous).toEqual(['a']);
    expect(seen.complete).toBe(false);
  });
});

describe('drift across the readings ledger', () => {
  const named = {
    reading: 2,
    run: 100,
    commit: COMMIT,
    steps: [
      { step: 'a', command: 'run:a', seconds: 10, lane: 0 },
      { step: 'b', command: 'run:b', seconds: 9, lane: 1 },
    ],
  };
  const ledger = [
    { run: 99, commit: 'b'.repeat(40), jobs: { j: { a: { command: 'run:a', seconds: 20 }, b: { command: 'run:b', seconds: 1 } } } },
    { run: 100, commit: COMMIT, jobs: { j: { a: { command: 'run:a', seconds: 10 }, b: { command: 'run:b', seconds: 9 } } } },
    { run: 101, commit: 'c'.repeat(40), jobs: { j: { a: { command: 'run:a', seconds: 4 }, b: { command: 'run:b', seconds: 12 } } } },
    { run: 102, commit: 'd'.repeat(40), jobs: { j: { only: { command: 'run:a', seconds: 7 } } } },
  ];

  it('takes the named reading as the prediction and measures every eligible one', () => {
    const drift = observeDrift(named, ledger);
    expect(drift.predicted).toMatchObject({ reading: 2, run: 100, loads: [10, 9], head: 10, spread: 1, headDrift: 0, spreadDrift: 0 });
    expect(drift.observed.map((one: { reading: number }) => one.reading)).toEqual([1, 2, 3]);
    // The fourth reading cannot price row b, so it is not an observation.
    expect(drift.eligible).toBe(3);
  });

  it('expresses drift as the difference from the prediction, not a fresh placement', () => {
    const drift = observeDrift(named, ledger);
    const later = drift.observed.find((one: { reading: number }) => one.reading === 3);
    expect(later.loads).toEqual([4, 12]);
    expect(later.headDrift).toBe(2); // 12 - 10
    expect(later.spreadDrift).toBe(7); // (12 - 4) - (10 - 9) = 8 - 1
  });
});

describe('why re-placing is not the fix', () => {
  const rows = [
    { step: 'x', command: 'run:x', seconds: 10 },
    { step: 'y', command: 'run:y', seconds: 9 },
    { step: 'z', command: 'run:z', seconds: 1 },
  ];

  it('changes the shape when the seconds change, even though the commands do not', () => {
    const before = shapeSignature(rows, 2);
    const after = shapeSignature(
      rows.map((one) => (one.step === 'x' ? { ...one, seconds: 1 } : one.step === 'z' ? { ...one, seconds: 10 } : one)),
      2,
    );
    expect(before).not.toBe(after);
  });

  it('is stable when the seconds are the same, whatever order the rows are written in', () => {
    expect(shapeSignature([...rows].reverse(), 2)).toBe(shapeSignature(rows, 2));
  });
});

describe('the shipped drift, read from the readings ledger', () => {
  const shipped = JSON.parse(readFileSync(join(ROOT, 'golden-master', 'battery-lanes.json'), 'utf8'));
  const ledger = JSON.parse(readFileSync(join(ROOT, 'golden-master', 'ci-readings.json'), 'utf8')).readings;
  const drift = observeDrift(shipped, ledger);

  it('prices every eligible reading and names the one the table quotes as the prediction', () => {
    // Eighteen readings (50..67) run every command the table prices. The table quotes
    // reading 65, so that reading's observation is the prediction and its drift is zero.
    expect(drift.eligible).toBe(18);
    expect(drift.predicted).not.toBeNull();
    expect(drift.predicted!.reading).toBe(65);
    expect(drift.predicted!.run).toBe(shipped.run);
    expect(drift.predicted!.headDrift).toBe(0);
    expect(drift.predicted!.spreadDrift).toBe(0);
  });

  it('reproduces the balance the table claims', () => {
    expect(drift.predicted!.loads).toEqual([263, 261, 260, 257, 258]);
    expect(drift.predicted!.head).toBe(263);
    expect(drift.predicted!.spread).toBe(6);
  });

  it('measures what the run that shipped the table actually paid for the same shape', () => {
    // Reading 66 is the run of the commit that added the table. Same shape, same commands,
    // different seconds: the head drifted 263 -> 285 and the spread 6 -> 97. These are the
    // numbers the progress volumes quote; before this instrument they lived only in prose,
    // where one volume wrote 286 (the job's wall clock) beside another's 285 (the sum).
    const shippedRun = drift.observed.find((one: { run: number }) => one.run === 46000370819);
    expect(shippedRun).toBeDefined();
    expect(shippedRun.loads).toEqual([188, 224, 242, 283, 285]);
    expect(shippedRun.head).toBe(285);
    expect(shippedRun.spread).toBe(97);
    expect(shippedRun.headDrift).toBe(22);
    expect(shippedRun.spreadDrift).toBe(91);
  });

  it('refuses to price a reading that cannot price every battery', () => {
    // The first 49 readings predate the ten-job tree and do not run every command; they are
    // skipped rather than reported as short measurements.
    expect(drift.observed.every((one: { reading: number }) => one.reading >= 50)).toBe(true);
    expect(drift.observed.length).toBe(drift.eligible);
  });

  it('shows why the placement is not re-derived each round: the shape moves with the seconds', () => {
    // O-150's open question asked whether to re-derive the placement from the run that ships
    // each round. The premise is false: the same 20 commands under the seconds of readings
    // 65, 66 and 67 derive three different shapes. Re-deriving is a new plan each round, not
    // a correction of one plan -- which is why the table fixes the shape and prints the drift.
    const shapes = [65, 66, 67].map((number) => {
      const reading = ledger[number - 1];
      const steps: Array<{ job: string; name: string; command: string; seconds: number }> = [];
      for (const [job, jobs] of Object.entries(reading.jobs as Record<string, Record<string, { command: string; seconds: number }>>)) {
        for (const [name, one] of Object.entries(jobs)) steps.push({ job, name, command: one.command, seconds: one.seconds });
      }
      const rows = shipped.steps.map((row: { step: string; command: string }) => priceOf(row, steps))
        .map((priced: { seconds: number | null }, index: number) => ({ step: shipped.steps[index].step, seconds: priced.seconds ?? 0 }));
      return shapeSignature(rows, shipped.jobs.length);
    });
    expect(new Set(shapes).size).toBe(3);
  });
});
