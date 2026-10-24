import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { M1_STRICT_THRESHOLD } from '../src/fault/extraction-scoring.js';

/**
 * M1's readings, recomputed from a file rather than quoted from a report.
 *
 * ## What was wrong with the numbers
 *
 * M1 was met at 15/19 and the figure lived in three places that could not check
 * each other: an audit finding, a progress round, and a workflow artefact on
 * GitHub that expires. The key then grew to thirty samples and one sample was
 * renamed, so when this file was written **no earlier reading could be
 * re-derived from this repository at all** — the scorer refuses a nineteen-sample
 * artefact against a thirty-sample key, the renamed id no longer exists, and the
 * artefact itself is a zip behind an API that deletes it.
 *
 * That is the shape this project keeps finding: a number with nothing behind it
 * that could disagree. The remedy is not a bigger claim, it is the evidence —
 * `golden-master/fault-extraction/readings.json` carries every sample as answered
 * beside the value it was scored against, and these tests recompute the totals
 * from that table. If a reading is edited, the totals and the arithmetic go out of
 * step in the same diff.
 *
 * ## What is *not* claimed here
 *
 * The readings are evidence of what happened, not a statement about the current
 * key. Three of the four were taken on nineteen samples; the fourth is the
 * thirty-sample baseline. A new dispatch produces a new reading; it does not make
 * these stale, and this file does not treat the last one as "now" — the test that
 * says so is named after the distinction.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const READINGS = resolve(ROOT, 'golden-master', 'fault-extraction', 'readings.json');
const KEY = resolve(ROOT, 'golden-master', 'fault-extraction', 'samples.json');

type Field = 'type' | 'category' | 'component';

interface Sample {
  id: string;
  expected: Record<Field, string>;
  answered: Record<Field, string | null>;
}

interface Reading {
  run: number;
  model: string;
  promptChange: string;
  key: { size: number; digest: string };
  totals: Record<Field, number> & { strict: number };
  samples: Sample[];
  /** `current` is the rule in the tree; `old-key` is a reading on a key that no longer exists. */
  status: 'old-key' | 'current' | 'reverted';
  /** Required when `reverted`: what the reading measured, and why it was not kept. */
  statusWhy?: string;
}

interface Readings {
  schema: string;
  why: string;
  fields: Field[];
  readings: Reading[];
  absent: Array<{ run: number; why: string }>;
  superseded: Array<{ id: string; renamedTo: string; why: string; finding: number }>;
  /**
   * A worse reading kept as the current one, with the reason it was kept.
   *
   * Absent, and asserted absent: nothing in this repository has ever argued that a
   * measured regression should stay. The field exists so that the argument -- if it is
   * ever made -- has to be written down in the same file as the number it defends.
   */
  acceptedRegression?: { run: number; delta: number; why: string };
}

const file = JSON.parse(readFileSync(READINGS, 'utf8')) as Readings;
const key = JSON.parse(readFileSync(KEY, 'utf8')) as {
  schema: string;
  samples: Array<{ id: string; expected: Record<Field, string> }>;
};

/** The expected values the current key publishes, by id. */
const CURRENT = new Map(key.samples.map((sample) => [sample.id, sample.expected]));

/** What a reading's `expected` column must hash to. */
function digestOf(expected: Map<string, Record<Field, string>>): string {
  const lines = [...expected.keys()]
    .sort()
    .map((id) => {
      const value = expected.get(id) as Record<Field, string>;
      return `${id}|${value.type}|${value.category}|${value.component}`;
    });
  return createHash('sha256').update(`${lines.join('\n')}\n`).digest('hex');
}

/** Every total a reading's own table implies. */
function recompute(reading: Reading): Record<Field, number> & { strict: number } {
  const totals = { type: 0, category: 0, component: 0, strict: 0 };
  for (const sample of reading.samples) {
    let all = true;
    for (const field of file.fields) {
      if (sample.answered[field] === sample.expected[field]) totals[field] += 1;
      else all = false;
    }
    if (all) totals.strict += 1;
  }
  return totals;
}

describe('M1’s readings are re-derivable from the repository', () => {
  it('recomputes every recorded total from the samples, so the numbers are arithmetic', () => {
    // The load-bearing test. A total is evidence only while it equals the table it
    // summarises; editing one answered field without editing the total fails here,
    // and editing both puts two changes in one diff where a reader sees them.
    for (const reading of file.readings) {
      expect(recompute(reading), `run ${String(reading.run)} disagrees with its own samples`).toEqual(
        reading.totals,
      );
      expect(reading.samples.length, `run ${String(reading.run)} has more rows than its key`).toBe(
        reading.key.size,
      );
    }
  });

  it('scores the thirty-sample reading against the published threshold rather than quoting it', () => {
    // `M1_STRICT_THRESHOLD` is imported, not restated: the milestone is met when a
    // reading clears the number the scorer publishes, and a change to that number
    // moves this assertion with it.
    //
    // The subject is the reading whose `status` is `current` -- the rule in the tree --
    // and not the last row. The last row is the experiment that lost, and a test that
    // read it would be scoring a rule the repository does not carry.
    const current = file.readings.filter((reading) => reading.status === 'current');
    expect(current, 'exactly one reading describes the rule in the tree').toHaveLength(1);
    const last = current[0] as Reading;
    expect(last.key.size).toBe(30);
    const rate = last.totals.strict / last.samples.length;
    expect(rate).toBeGreaterThanOrEqual(M1_STRICT_THRESHOLD);
    // And the margin is stated as samples, because that is the unit a reading moves
    // in: 70% of 30 is 21, so 24 is three samples clear -- ten points.
    const needed = Math.ceil(M1_STRICT_THRESHOLD * last.samples.length);
    expect(last.totals.strict - needed).toBe(3);
  });

  it('keeps every expected value equal to the key, or names the sample as superseded', () => {
    // The record cannot quietly drift from the key. A sample still in the key must
    // carry the key's own expected values -- so re-annotating a sample is caught
    // here rather than silently rescoring old answers against a new answer key --
    // and a sample that has left the key must be named in `superseded` with its
    // replacement, which is what the one rename in the corpus is.
    const superseded = new Map(file.superseded.map((entry) => [entry.id, entry]));
    for (const reading of file.readings) {
      for (const sample of reading.samples) {
        const current = CURRENT.get(sample.id);
        if (current !== undefined) {
          expect(sample.expected, `${sample.id} no longer matches the key in run ${String(reading.run)}`).toEqual({
            type: current.type,
            category: current.category,
            component: current.component,
          });
        } else {
          const entry = superseded.get(sample.id);
          expect(entry, `${sample.id} has left the key and is not named in superseded`).toBeDefined();
          expect(CURRENT.has(entry?.renamedTo ?? ''), `${String(entry?.renamedTo)} is not in the key`).toBe(true);
          expect((entry?.why.length ?? 0) > 40, `${sample.id} is superseded without a reason`).toBe(true);
        }
      }
    }
  });

  it('pins the expected column by digest, so the scoring side of every reading is fixed', () => {
    for (const reading of file.readings) {
      const expected = new Map(reading.samples.map((sample) => [sample.id, sample.expected]));
      expect(digestOf(expected), `run ${String(reading.run)}: the expected values moved`).toBe(reading.key.digest);
    }
  });

  it('records all seven readings in run order with the strict count each one produced', () => {
    // A record, not a formula: 2 -> 9 -> 13 -> 15 on nineteen samples, then 24 on thirty, is
    // the history the milestone rests on, and a change to it is an event rather than an edit.
    // Written as a list so an eighth reading is a deliberate addition to a visible sequence.
    //
    // The first entry arrived last. It sat in `absent` for five rounds with the reason "its
    // artefact was not retained", and GitHub had kept it all along (finding 229): the run is
    // three weeks old and retention is ninety days. `record-reading.mjs` downloaded it, derived
    // 2/19 from it, and agreed with the number this file had been quoting from memory.
    //
    // The last two entries are the experiments that lost: 22/30 against the 24 it replaced,
    // reverted rather than kept because its reasoning was better than its number (finding 223),
    // and 20/30 for the criterion alone with the milestone no longer met (finding 224). Both are
    // kept because a record that only held improvements would make every rule look like it
    // worked -- and because the second falsifies the first's diagnosis, which is the only reason
    // the pair is worth two dispatches.
    expect(file.readings.map((reading) => [reading.run, reading.key.size, reading.totals.strict])).toEqual([
      [39806875985, 19, 2],
      [39810137978, 19, 9],
      [39880043431, 19, 13],
      [39881192308, 19, 15],
      [39950191377, 30, 24],
      [40049467914, 30, 22],
      [40054484628, 30, 20],
    ]);
  });

  it('separates the reading that describes the rule in the tree from every other one', () => {
    // What a reader must not do: read 15/19 as a statement about today, or 22/30 as
    // a result the tree contains. Size cannot answer either question -- two readings
    // are now on the thirty-sample key and only one of them is the rule in the tree --
    // so each reading carries a status, and the assertions are on that.
    const current = file.readings.filter((reading) => reading.status === 'current');
    expect(current).toHaveLength(1);
    expect(current[0]?.key.size).toBe(key.samples.length);
    expect(file.readings.filter((reading) => reading.status === 'old-key')).toHaveLength(4);
    const reverted = file.readings.filter((reading) => reading.status === 'reverted');
    expect(reverted, 'the record must carry both experiments that lost').toHaveLength(2);
    for (const reading of reverted) {
      // A reverted reading is a measurement, not a preference: it has to say what it
      // measured and why it was not kept, or it is an opinion with a run id.
      expect(reading.statusWhy?.length ?? 0, `run ${String(reading.run)} is reverted without a reason`).toBeGreaterThan(
        80,
      );
      expect(reading.totals.strict).toBeLessThan(
        (current[0]?.totals.strict ?? 0) + 1,
        'a reverted reading that scored better than the current one is a revert to explain',
      );
    }
  });

  it('has no reading it cannot re-derive, having found the artefact it once called lost', () => {
    // This assertion used to be its own opposite: `absent.length > 0`, with run 39806875985
    // named as the reading whose artefact was gone. It was not gone. GitHub keeps a workflow
    // artefact for ninety days and the run was three weeks old, so `record-reading.mjs`
    // downloaded it in one command, derived 2/19 from it, and matched the figure the record had
    // been carrying as an unattributed number for five rounds (finding 229).
    //
    // The list stays in the schema rather than being removed with its last member:
    // `reconcile-readings.mjs` still accepts an `absent` entry as a way to account for a run,
    // and that route has to stay open for the run whose artefact really has expired. What this
    // asserts is that nothing is currently using it -- and because it is an equality on the whole
    // list, adding an entry fails here, which makes it a deliberate act rather than an edit
    // somebody makes while looking at something else.
    expect(file.absent, 'every run in scope can be re-derived from its artefact').toEqual([]);
  });

  it('keeps the best text any run has scored on this key, not merely a passing one', () => {
    // The anti-regression rule, and the answer to a question findings 223 and 224 left open:
    // *22/30 passed every gate and met the milestone, so what would have caught it?* This.
    //
    // The prompt in the tree carries one reading. Every other text on the same key is also in
    // the record, so "is the current prompt the best one measured" is arithmetic rather than
    // memory -- and a future round that measures 22/30 and marks it current fails here, before
    // anybody has to remember that 24 existed.
    const current = file.readings.filter((reading) => reading.status === 'current');
    expect(current, 'exactly one reading describes the rule in the tree').toHaveLength(1);
    const me = current[0] as Reading;
    const peers = file.readings.filter(
      (reading) => reading.key.size === me.key.size && reading.run !== me.run,
    );
    const best = Math.max(...peers.map((reading) => reading.totals.strict));
    // The escape hatch is a written argument, not a status: a worse reading stays only if the
    // record says which run it lost to, by how much, and why that was accepted.
    const accepted = file.acceptedRegression;
    if (accepted === undefined) {
      expect(
        me.totals.strict,
        `a text on this key scored better: the current reading is ${String(me.totals.strict)}/` +
          `${String(me.samples.length)} and the best other text scored ${String(best)}. Revert, or add an ` +
          '`acceptedRegression` entry naming this run, the delta and the reason.',
      ).toBeGreaterThanOrEqual(best);
    } else {
      expect(accepted.run, 'the accepted regression must be the run that is current').toBe(me.run);
      expect(accepted.delta, 'the accepted regression must state what it cost').toBe(me.totals.strict - best);
      expect(accepted.why.length, 'an accepted regression must say why it was accepted').toBeGreaterThan(80);
    }
  });

  it('has never accepted a regression, which is a state and not an omission', () => {
    // Asserted rather than left implicit, for the same reason the counts rows are: the moment
    // somebody adds the field, this fails and the diff shows a decision being made. If a future
    // round genuinely needs it, deleting this test is the record of the decision.
    expect(file.acceptedRegression).toBeUndefined();
  });

  it('is sensitive to one answer, so the arithmetic is a measurement and not a tautology', () => {
    // The control for the first test: a table plus a total could agree by both
    // being wrong in the same way. One corrected field must move the count by
    // exactly one, which is the smallest step this instrument has.
    const reading = file.readings[2] as Reading;
    const flip = {
      ...reading,
      samples: reading.samples.map((sample, index) =>
        index === 0
          ? { ...sample, answered: { ...sample.answered, component: `${sample.answered.component ?? ''}-probe` } }
          : sample,
      ),
    };
    const after = recompute(flip);
    expect(after.strict).toBe(reading.totals.strict - 1);
    expect(after.component).toBe(reading.totals.component - 1);
    expect(after.type).toBe(reading.totals.type);
    expect(after.category).toBe(reading.totals.category);
  });
});
