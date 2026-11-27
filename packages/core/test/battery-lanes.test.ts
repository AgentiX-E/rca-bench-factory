/**
 * The lane plan: what a table of measured battery seconds places, and what the workflow
 * has to say for the plan to be the plan.
 *
 * The instrument is the shipped tree. `laneErrors` is handed `golden-master/battery-lanes.json`,
 * the steps of the five lane jobs as `ci.yml` writes them, and the run the table names, and
 * the first case asserts it finds nothing -- because a check that only ever runs on fixtures
 * is a check nobody has pointed at the thing it exists to guard.
 *
 * Every other case changes one thing about a small plan and requires the sentence that
 * names it. The fixtures are two lanes and three units, which is small enough that the
 * placement can be worked out on paper and still exercises the two rules that are not
 * obvious: the dearest unit goes first onto the emptiest lane, and the lanes are given the
 * ids that leave the most rows where they already are.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  laneErrors,
  laneLoads,
  laneOrderOf,
  lanePrefixOf,
  laneUnits,
  matchJobs,
  placeLanes,
  readLaneTable,
  unitKeyOf,
} from '../../../scripts/lane-costs.mjs';
import { ROOT, readWorkflow, workflowPath } from '../../../scripts/gate-steps.mjs';
import { commandOf, stepsOf } from '../../../scripts/ci-budget.mjs';

const COMMIT = 'a'.repeat(40);

/** A row of the shipped kind, with the fields a test cares about. */
function row(step: string, seconds: number, extra: Record<string, unknown> = {}) {
  return { step, command: `run:${step}`, seconds, ...extra };
}

/**
 * A plan over the given rows, its lanes named in the order the derivation gives them.
 *
 * The rows are written lane by lane, which is the only order the table is allowed to be in,
 * and the fixtures below rely on that: a case that wants a different order says so by
 * passing rows that disagree with their lanes.
 */
function table(rows: Array<Record<string, unknown>>, jobs = ['j1', 'j2']) {
  return {
    rule: 'golden-master/battery-lanes.json',
    reading: 1,
    run: 1,
    commit: COMMIT,
    measured: '2026-11-27',
    unit: 'seconds',
    jobs,
    // A row the case does not say otherwise about was read in the job its lane names, which
    // is the state after a round has settled: nothing is visiting, and the order is the plan's.
    steps: rows.map((one) => ({ from: jobs[Number(one.lane ?? 0)] ?? jobs[0], ...one })),
  };
}

/** One workflow, as `laneErrors` reads one: the steps of each lane job, prefix included. */
function workflowOf(byJob: Record<string, Array<Record<string, unknown>>>) {
  const prefix = [{ name: 'Check out', command: 'uses:actions/checkout@v4' }];
  const built: Record<string, Array<{ name: string; command: string }>> = {};
  for (const [id, steps] of Object.entries(byJob)) {
    built[id] = [...prefix, ...steps.map((one) => ({ name: String(one.step), command: String(one.command) }))];
  }
  return built;
}

/** The named run, as `laneErrors` reads one: every step of every job with its seconds. */
function readingOf(byJob: Record<string, Array<Record<string, unknown>>>) {
  const rows: Array<{ job: string; name: string; command: string; seconds: number }> = [];
  for (const [job, steps] of Object.entries(byJob)) {
    for (const one of steps) {
      rows.push({ job, name: String(one.step), command: String(one.command), seconds: Number(one.seconds) });
    }
  }
  return rows;
}

describe('the unit a lane is filled with', () => {
  it('is the group when a row names one, and the step otherwise', () => {
    expect(unitKeyOf({ step: 'a' })).toBe('a');
    expect(unitKeyOf({ step: 'a', group: 'g' })).toBe('g');
    expect(unitKeyOf({ step: 'a', group: '' })).toBe('a');
  });

  it('sums a group into one unit and keeps its rows in order', () => {
    const units = laneUnits([
      { step: 'publish', seconds: 4, group: 'report' },
      { step: 'upload', seconds: 2, group: 'report' },
      { step: 'alone', seconds: 9 },
    ]);
    expect(units.map((unit: { key: string; seconds: number }) => [unit.key, unit.seconds])).toEqual([
      ['report', 6],
      ['alone', 9],
    ]);
    expect(units[0].rows.map((one: { step: string }) => one.step)).toEqual(['publish', 'upload']);
  });
});

describe('the placement rule', () => {
  it('puts the dearest unit on an empty lane and the next onto the emptiest', () => {
    const { lanes } = placeLanes([row('a', 10), row('b', 9), row('c', 1)], 2);
    expect(lanes.map((lane: Array<{ step: string }>) => lane.map((one) => one.step))).toEqual([['a'], ['b', 'c']]);
    expect(laneLoads(lanes)).toEqual([10, 10]);
  });

  it('does not depend on the order the rows are written in', () => {
    const forwards = placeLanes([row('a', 10), row('b', 9), row('c', 1)], 2);
    const backwards = placeLanes([row('c', 1), row('b', 9), row('a', 10)], 2);
    expect(backwards.lanes).toEqual(forwards.lanes);
  });

  it('breaks a tie between equally dear units by key, not by position', () => {
    const left = placeLanes([row('z', 5), row('m', 5)], 2);
    const right = placeLanes([row('m', 5), row('z', 5)], 2);
    expect(left.lanes.map((lane: Array<{ step: string }>) => lane.map((one) => one.step))).toEqual([['m'], ['z']]);
    expect(right.lanes).toEqual(left.lanes);
  });

  it('places a group as one unit, and its steps stay together in table order', () => {
    const { lanes } = placeLanes(
      [row('battery', 90, { group: 'report' }), row('publish', 4, { group: 'report' }), row('other', 50)],
      2,
    );
    expect(lanes.map((lane: Array<{ step: string }>) => lane.map((one) => one.step))).toEqual([
      ['battery', 'publish'],
      ['other'],
    ]);
  });

  it('refuses a split into no lanes', () => {
    const { lanes, error } = placeLanes([row('a', 1)], 0);
    expect(lanes).toEqual([]);
    expect(error).toMatch(/not a split/);
  });
});

describe('the matching of lanes to job ids', () => {
  const lanes = [[row('a', 10)], [row('b', 9)]];

  it('keeps the assignment that leaves the most rows where they already are', () => {
    const here = (step: string) => (step === 'a' ? 'second' : 'first');
    const { jobs, stays } = matchJobs(lanes, here, ['first', 'second']);
    expect(jobs).toEqual(['second', 'first']);
    expect(stays).toBe(2);
  });

  it('breaks a tie by the ids in order, so the answer does not depend on the walk', () => {
    const nowhere = () => null;
    expect(matchJobs(lanes, nowhere, ['beta', 'alpha']).jobs).toEqual(['alpha', 'beta']);
  });

  it('refuses a lane count the workflow cannot address', () => {
    expect(matchJobs(lanes, () => null, ['only']).error).toMatch(/2 lane\(s\).*1 id/s);
  });
});

describe('reading a table', () => {
  it('accepts the shipped shape', () => {
    expect(readLaneTable(table([row('a', 1, { lane: 0 })])).errors).toEqual([]);
  });

  it('refuses a field no plan has, on the table and on a row', () => {
    const extra = { ...table([row('a', 1, { lane: 0 })]), seconds: 4 };
    expect(readLaneTable(extra).errors.join('\n')).toMatch(/carries `seconds`, which is not a field a plan has/);
    const onRow = table([row('a', 1, { lane: 0, measured: 'yesterday' })]);
    expect(readLaneTable(onRow).errors.join('\n')).toMatch(/carries `measured`, which is not a field a plan has/);
  });

  it('refuses a table with no address, no reading, no run, no commit and no date', () => {
    const parsed = readLaneTable({ jobs: [], steps: [] });
    const said = parsed.errors.join('\n');
    expect(said).toMatch(/names no job/);
    expect(said).toMatch(/names reading undefined/);
    expect(said).toMatch(/names run undefined/);
    expect(said).toMatch(/names no commit/);
    expect(said).toMatch(/no measurement date/);
    expect(said).toMatch(/places no step/);
  });

  it('refuses one step placed twice and a lane that is not one of the table\'s', () => {
    const twice = readLaneTable(table([row('a', 1, { lane: 0 }), row('a', 2, { lane: 1 })]));
    expect(twice.errors.join('\n')).toMatch(/places `a` a second time/);
    const offLane = readLaneTable(table([row('a', 1, { lane: 2 })]));
    expect(offLane.errors.join('\n')).toMatch(/lane 2, which is not one of the 2 lanes/);
  });

  it('refuses a price that is not a whole number of seconds', () => {
    expect(readLaneTable(table([row('a', 1.5, { lane: 0 })])).errors.join('\n')).toMatch(/a price is a whole number of seconds/);
  });
});

describe('the plan against the workflow', () => {
  const rows = [row('a', 10, { lane: 0 }), row('b', 9, { lane: 1 }), row('c', 1, { lane: 1 })];
  const shipped = table(rows);

  it('finds nothing when the two agree', () => {
    const { errors, derived } = laneErrors(shipped, workflowOf({ j1: [rows[0]], j2: [rows[1], rows[2]] }), readingOf({ j1: [rows[0]], j2: [rows[1], rows[2]] }));
    expect(errors).toEqual([]);
    expect(derived.loads).toEqual({ j1: 10, j2: 10 });
    expect(derived.head).toBe(10);
    expect(derived.prefix).toEqual(['Check out']);
  });

  it('refuses a battery the table does not price', () => {
    const { errors } = laneErrors(
      shipped,
      workflowOf({ j1: [rows[0], { step: 'new', command: 'run:new' }], j2: [rows[1], rows[2]] }),
      readingOf({ j1: [rows[0]], j2: [rows[1], rows[2]] }),
    );
    expect(errors.join('\n')).toMatch(/runs `new`, which the lane table does not place/);
  });

  it('refuses a row about a step no lane runs', () => {
    const { errors } = laneErrors(
      table([...rows, row('gone', 3, { lane: 1 })]),
      workflowOf({ j1: [rows[0]], j2: [rows[1], rows[2]] }),
      readingOf({ j1: [rows[0]], j2: [rows[1], rows[2]] }),
    );
    expect(errors.join('\n')).toMatch(/places `gone`, which no lane job of ci.yml runs/);
  });

  it('refuses a price of a command the workflow no longer runs', () => {
    const { errors } = laneErrors(
      table([{ ...rows[0], command: 'run:other' }, rows[1], rows[2]]),
      workflowOf({ j1: [rows[0]], j2: [rows[1], rows[2]] }),
      readingOf({ j1: [rows[0]], j2: [rows[1], rows[2]] }),
    );
    expect(errors.join('\n')).toMatch(/prices `a` at `run:other` and ci.yml runs `run:a`/);
  });

  it('refuses a step the workflow runs in a lane the table did not put it on', () => {
    const { errors } = laneErrors(
      shipped,
      workflowOf({ j1: [rows[0], rows[2]], j2: [rows[1]] }),
      readingOf({ j1: [rows[0]], j2: [rows[1], rows[2]] }),
    );
    expect(errors.join('\n')).toMatch(/puts `c` on lane 1 \(`j2`\) and ci.yml runs it in `j1`/);
  });

  it('refuses an order the plan does not have', () => {
    const { errors } = laneErrors(
      shipped,
      workflowOf({ j1: [rows[0]], j2: [rows[2], rows[1]] }),
      readingOf({ j1: [rows[0]], j2: [rows[1], rows[2]] }),
    );
    expect(errors.join('\n')).toMatch(/`j2` runs its batteries as \["c","b"\] and the lane table orders them \["b","c"\]/);
  });

  it('refuses a placement that its own rule does not derive', () => {
    // Three units of 10, 9 and 1 on two lanes derive a 10 / 10 split. Saying the second
    // lane holds 9 and the first holds 10 + 1 is what a hand-placed split looks like.
    const hand = table([row('a', 10, { lane: 0 }), row('c', 1, { lane: 0 }), row('b', 9, { lane: 1 })]);
    const { errors } = laneErrors(
      hand,
      workflowOf({ j1: [rows[0], rows[2]], j2: [rows[1]] }),
      readingOf({ j1: [rows[0]], j2: [rows[1], rows[2]] }),
    );
    expect(errors.join('\n')).toMatch(/its own rule derives `j2`|its own rule derives `j1`/);
  });

  it('refuses a group split across lanes', () => {
    const split = table([
      row('battery', 90, { lane: 0, group: 'report' }),
      row('other', 50, { lane: 1 }),
      row('publish', 4, { lane: 1, group: 'report' }),
    ]);
    const { errors } = laneErrors(
      split,
      workflowOf({ j1: [split.steps[0]], j2: [split.steps[1], split.steps[2]] }),
      readingOf({ j1: [split.steps[0]], j2: [split.steps[1], split.steps[2]] }),
    );
    expect(errors.join('\n')).toMatch(/group `report` is split across 2 lanes/);
  });

  it('refuses a price the named reading did not record', () => {
    const { errors } = laneErrors(
      shipped,
      workflowOf({ j1: [rows[0]], j2: [rows[1], rows[2]] }),
      [...readingOf({ j1: [rows[0]], j2: [rows[1], rows[2]] })].map((one) => (one.name === 'a' ? { ...one, seconds: 11 } : one)),
    );
    expect(errors.join('\n')).toMatch(/prices `a` at 10 s and the reading it names recorded 11 s/);
  });

  it('refuses a price for a command the named reading holds no step for', () => {
    const { errors } = laneErrors(
      table([{ ...rows[0], command: 'run:elsewhere' }, rows[1], rows[2]]),
      workflowOf({ j1: [{ ...rows[0], command: 'run:elsewhere' }], j2: [rows[1], rows[2]] }),
      readingOf({ j1: [rows[0]], j2: [rows[1], rows[2]] }),
    );
    expect(errors.join('\n')).toMatch(/holds no step running `run:elsewhere`/);
  });
});

describe('the order a lane is written in', () => {
  it('puts the steps the reading measured elsewhere last, and leaves the rest in table order', () => {
    // `R8`: a step the recording has not measured in its new job has to be the last of it, or
    // every bound behind it is argued from a sum with a hole. The table says which is which by
    // `from`, so the order is a property of the table rather than of the round that wrote it.
    const rows = [
      { step: 'a', from: 'j1', lane: 0 },
      { step: 'b', from: 'j2', lane: 0 },
      { step: 'c', from: 'j1', lane: 0 },
      { step: 'd', from: 'j2', lane: 1 },
    ];
    expect(laneOrderOf(rows, ['j1', 'j2'])).toEqual([['a', 'c', 'b'], ['d']]);
  });
});

describe('the lane prefix', () => {
  it('is the leading run every lane runs identically, name and command both', () => {
    expect(
      lanePrefixOf({
        one: [{ name: 'Check out', command: 'a' }, { name: 'Build', command: 'b' }, { name: 'Battery', command: 'c' }],
        two: [{ name: 'Check out', command: 'a' }, { name: 'Build', command: 'b' }, { name: 'Other', command: 'd' }],
      }),
    ).toEqual(['Check out', 'Build']);
  });

  it('stops where one lane runs a different command under the same name', () => {
    expect(
      lanePrefixOf({
        one: [{ name: 'Build', command: 'core' }, { name: 'Battery', command: 'c' }],
        two: [{ name: 'Build', command: 'all' }, { name: 'Battery', command: 'c' }],
      }),
    ).toEqual([]);
  });
});

describe('the shipped plan', () => {
  const shipped = JSON.parse(readFileSync(join(ROOT, 'golden-master', 'battery-lanes.json'), 'utf8'));
  const workflow = readWorkflow(readFileSync(workflowPath(), 'utf8'));
  const workflowSteps: Record<string, Array<{ name: string; command: string }>> = {};
  for (const id of shipped.jobs) {
    workflowSteps[id] = stepsOf(workflow, id).map((step) => ({ name: step.name, command: commandOf(step) }));
  }
  const readings = JSON.parse(readFileSync(join(ROOT, 'golden-master', 'ci-readings.json'), 'utf8')).readings;
  const named = readings.find((reading: { run: number }) => reading.run === shipped.run);
  const readingSteps: Array<{ job: string; name: string; command: string; seconds: number }> = [];
  for (const [job, steps] of Object.entries(named.jobs as Record<string, Record<string, { seconds: number; command: string }>>)) {
    for (const [name, one] of Object.entries(steps)) readingSteps.push({ job, name, command: one.command, seconds: one.seconds });
  }

  it('is the reading it names', () => {
    expect(named).toBeDefined();
    expect(shipped.reading).toBe(readings.indexOf(named) + 1);
    expect(shipped.commit).toBe(named.commit);
  });

  it('agrees with the workflow, step for step, lane for lane, in order', () => {
    const { errors } = laneErrors(shipped, workflowSteps, readingSteps);
    expect(errors).toEqual([]);
  });

  it('balances the five lanes to within a few seconds of each other', () => {
    const { derived } = laneErrors(shipped, workflowSteps, readingSteps);
    expect(derived.total).toBe(1299);
    expect(derived.loads).toEqual({
      'batteries-heavy': 263,
      'gates-audit': 261,
      'sensitivity-shard': 260,
      batteries: 257,
      sensitivity: 258,
    });
    expect(derived.head).toBe(263);
    // The claim the round makes: the lanes sit within 6 s of each other, against the 3.9x
    // spread the hand-placed tree had when the table was derived.
    expect(derived.head - Math.min(...Object.values(derived.loads))).toBe(6);
    expect(derived.spread / derived.head).toBeLessThan(0.03);
  });

  it('keeps the report publisher and its upload in the lane that runs the battery', () => {
    const lane = shipped.steps.filter((one: { group?: string }) => one.group === 'gate-tests-battery');
    expect(lane.map((one: { step: string }) => one.step)).toEqual([
      "Gate-test battery (each gate's test provably fails when its guard is removed)",
      'Publish the gate-test battery report',
      'Upload the gate-test battery report',
    ]);
    expect(new Set(lane.map((one: { lane: number }) => one.lane)).size).toBe(1);
  });

  it('names the five lane jobs the workflow has, and no other', () => {
    expect(shipped.jobs).toEqual(['batteries-heavy', 'gates-audit', 'sensitivity-shard', 'batteries', 'sensitivity']);
    expect(Object.keys(workflowSteps).every((id) => stepsOf(workflow, id).length > 0)).toBe(true);
  });
});

describe('the shipped table is not the only shape the reader accepts', () => {
  it('reads a plan whose lanes are in another order, and derives that order', () => {
    const rows = [row('a', 10, { lane: 0 }), row('b', 9, { lane: 1 }), row('c', 1, { lane: 1 })];
    const reordered = table(rows, ['j2', 'j1']);
    const { errors } = laneErrors(
      reordered,
      workflowOf({ j1: [rows[0]], j2: [rows[1], rows[2]] }),
      readingOf({ j1: [rows[0]], j2: [rows[1], rows[2]] }),
    );
    // A table whose labels disagree with the placement is refused by the same rule that
    // refuses a hand-placed split: the labels are half of what the derivation decides.
    expect(errors.join('\n')).toMatch(/its own rule derives/);
  });

  it('accepts the same plan when the workflow moved with it', () => {
    const rows = [row('a', 10, { lane: 0 }), row('b', 9, { lane: 1 }), row('c', 1, { lane: 1 })];
    const reordered = table(rows, ['j2', 'j1']);
    const { errors } = laneErrors(
      reordered,
      workflowOf({ j2: [rows[0]], j1: [rows[1], rows[2]] }),
      readingOf({ j2: [rows[0]], j1: [rows[1], rows[2]] }),
    );
    expect(errors).toEqual([]);
  });
});
