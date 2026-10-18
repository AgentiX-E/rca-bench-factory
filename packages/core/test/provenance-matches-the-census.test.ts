import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { OFFICIAL_METRICS, type OfficialProvenance } from '../src/score/official.js';
import { SCORE_TARGET_IDS } from '../src/score/targets.js';

/**
 * The provenance label, held to the census that measures it.
 *
 * ## Why this file exists
 *
 * `OFFICIAL_METRICS[target].provenance` is the one field a consumer reads to
 * decide how much a number is worth, and until pass 62 it had two values:
 * `official` (transcribed from the upstream scorer *or* the paper's protocol) and
 * `derived`. Nothing asserted either one, and nothing read them -- the label
 * travelled to the report and stopped there.
 *
 * Two values could not say the thing that mattered. Findings 176 and 181 each
 * found a `source` string that had never been opened, and findings 182, 183 and
 * 184 each found a transcribed rule that disagreed with the artefact behind it
 * (10 of 25 cases, 9 of 22, 3 of 4). Every one of those rules was labelled
 * `official`, and the label was not false: it simply could not distinguish *a
 * rule somebody else's code computes* from *a rule only this repository
 * computes*. The first has been compared to a second implementation; the second
 * has not, and that is exactly the difference the whole campaign kept measuring.
 *
 * So the label is now three values, and this file derives each one from
 * `golden-master/oracle-census.json` rather than trusting the registry:
 *
 * | census class | derived label | why |
 * | --- | --- | --- |
 * | `code` | `replayed` | released code plus a corpus that runs it |
 * | `rubric` | `transcribed` | the rule is published as data, with no evaluator |
 * | `prose` | `transcribed` | a paper or a README describes it, nothing computes it |
 * | `absent` | `derived` | upstream publishes neither the rule nor its constants |
 *
 * The mapping is the test. A pass that downgrades a target's census row cannot
 * leave the registry claiming `replayed`, and a pass that promotes a row has to
 * say so in both places.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

interface Row {
  target: string;
  class: 'code' | 'rubric' | 'prose' | 'absent';
  corpus: string | null;
}

const CENSUS = JSON.parse(
  readFileSync(resolve(ROOT, 'golden-master', 'oracle-census.json'), 'utf8'),
) as { rows: Row[] };

const ROWS = new Map(CENSUS.rows.map((row) => [row.target, row]));

/** The one place the mapping is written, so a second copy cannot drift from it. */
const LABEL_FOR: Record<Row['class'], OfficialProvenance> = {
  code: 'replayed',
  rubric: 'transcribed',
  prose: 'transcribed',
  absent: 'derived',
};

const expected = (target: string): OfficialProvenance => {
  const row = ROWS.get(target);
  if (row === undefined) throw new Error(`no census row for ${target}`);
  return LABEL_FOR[row.class];
};

describe('the label says how far the rule is from somebody else’s code', () => {
  it('derives every target’s label from its census class, and nothing drifts', () => {
    const drifted = SCORE_TARGET_IDS.filter(
      (target) => OFFICIAL_METRICS[target].provenance !== expected(target),
    ).map(
      (target) =>
        `${target}: census class '${String(ROWS.get(target)?.class)}' implies '${expected(target)}', ` +
        `the registry says '${OFFICIAL_METRICS[target].provenance}'`,
    );
    expect(drifted, 'the registry claims more, or less, than the census supports').toEqual([]);
  });

  it('never calls a rule replayed without the corpus that replays it', () => {
    // `replayed` is the strong claim, so it is the one that needs evidence rather
    // than a mapping. The census test already requires a corpus for a `code` row;
    // this asserts the *label* depends on that file existing, so deleting the
    // corpus to make a failing replay go away cannot leave a green `replayed`.
    const unbacked = SCORE_TARGET_IDS.filter((target) => {
      if (OFFICIAL_METRICS[target].provenance !== 'replayed') return false;
      const row = ROWS.get(target)!;
      return row.corpus === null;
    }).map((target) => `${target} claims 'replayed' with no corpus`);
    expect(unbacked).toEqual([]);
  });

  it('uses all three values, so the third is not decoration', () => {
    // A three-valued label with two values in use is a two-valued label with a
    // comment. The counts are stated so a change to the split is a change here.
    const counted = (label: OfficialProvenance): number =>
      SCORE_TARGET_IDS.filter((target) => OFFICIAL_METRICS[target].provenance === label).length;
    expect(counted('replayed')).toBe(5);
    expect(counted('transcribed')).toBe(2);
    expect(counted('derived')).toBe(2);
  });

  it('does not let a target be transcribed and replayed at once', () => {
    // The inverse mapping: every `replayed` label must sit on a `code` row. Written
    // as a property rather than as a second table, because a second table is a
    // second thing to keep in step -- which is what the census exists to avoid.
    const mismatched = CENSUS.rows
      .filter((row) => OFFICIAL_METRICS[row.target]?.provenance === 'replayed')
      .filter((row) => row.class !== 'code')
      .map((row) => `${row.target} is labelled replayed on a '${row.class}' row`);
    expect(mismatched).toEqual([]);
  });
});
