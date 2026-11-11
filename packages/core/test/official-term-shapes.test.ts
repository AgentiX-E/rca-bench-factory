import { describe, expect, it } from 'vitest';
import { scoreOfficial, readOfficialGroundTruth } from '../src/score/official.js';

/**
 * The shapes a case record's `terms` map and its evidence tokens can take.
 *
 * Three of the seven branch positions v3.81's coverage read left open were about
 * the *shape* of the two structures this file is named for, and each one had the
 * same story: a type that admits a value no producer writes, and a fallback that
 * therefore never runs. The question a position like that has to answer is not
 * "is it covered" but "can an input reach it at all", and the only way to answer
 * it is to build the input and look.
 *
 *  1. `checkpointToken` renders a checkpoint's `value` as text, and keeps the
 *     empty string for a value that is neither a number nor a string. The two
 *     arms sat open because every fixture passed `value: 42`. The value comes
 *     from the case file, i.e. from JSON, where an array or an object is a thing
 *     an annotation can contain -- so these are reachable, and the test is what
 *     says what the token looks like when they happen.
 *  2. `scoreFacetSubset` answers 0 for an answer key that declares none of the
 *     facets its rule scores. The guard was open because every fixture names a
 *     component. It is reachable through the *reader*, not through a hand-built
 *     record: `parseRcaEvalDirectory`'s service segment is `(.*)`, so a directory
 *     named `RE2--adservice_1` parses with an empty service, and the case is then
 *     real, counted, and worth nothing. The alternative to the guard is
 *     `0 / 0`, which is `NaN` -- a number that poisons every mean it enters.
 *  3. A record's `terms` is required now, and empty rather than absent for the
 *     rules that have no named terms. That is what let the aggregate drop
 *     seventeen `?.` reads and an `undefined` arm; the last test here holds the
 *     two shapes that replaced them, so a producer that starts omitting the map
 *     again fails on the type and a producer that writes nothing fails here.
 */

const rca100Key = (value: unknown): Record<string, string> => ({
  'cases/case-1/topology.json': JSON.stringify({ entities: [{ id: 'svc:order', name: 'order' }], edges: [] }),
  'answer_key/case-1.gt.json': JSON.stringify({
    root_cause_entities: ['order'],
    root_cause_types: ['cpu'],
    raw_ground_truth: JSON.stringify({
      reasoning: {
        steps: [
          {
            from_entity: 'order',
            to_entity: 'cart',
            checkpoints: [{ signal_ref: 'order|cpu', comparator: '>=', value, unit: 'count/min' }],
          },
        ],
      },
    }),
  }),
});

describe('a checkpoint value that is not a number', () => {
  it('carries a string value verbatim', () => {
    const gt = readOfficialGroundTruth('rca100', rca100Key('high'))[0]!;
    // The token is what the submission's evidence has to reproduce, so the text
    // is the whole point: `order|cpu|>=|high|count/min` is comparable and
    // `order|cpu|>=||count/min` is not.
    expect(gt.evidence).toEqual(['order|cpu|>=|high|count/min']);
  });

  it('leaves the value empty rather than printing the object', () => {
    const gt = readOfficialGroundTruth('rca100', rca100Key({ unit: 'count/min' }))[0]!;
    // `String({...})` would be `[object Object]`, which is a value no annotation
    // declares and one a submission could match by writing the same nonsense.
    expect(gt.evidence).toEqual(['order|cpu|>=||count/min']);
  });
});

describe('an answer key that declares none of the facets its rule scores', () => {
  /**
   * One case directory whose service segment is empty.
   *
   * `parseRcaEvalDirectory` reads `RE2-<system>-<service>_<instance>`, and the
   * service group is `(.*)` -- so this name is not a malformed name, it is a name
   * that parses to `''`. That is the shortest honest route to a ground truth with
   * no component, which is the only state in which `ranks` is absent and the
   * facet list scores nothing.
   */
  const files = (): Record<string, string> => ({
    'RE2--adservice_1/inject_time.txt': '2026-01-01 00:00:00\n',
  });

  it('scores it zero, and not the NaN that `0 / 0` would give', () => {
    const report = scoreOfficial('rcaeval-re2', files());
    expect(report.caseCount, 'the case was not read at all').toBe(1);
    expect(report.cases[0]!.score).toBe(0);
    expect(Number.isNaN(report.cases[0]!.score)).toBe(false);
    expect(Number.isNaN(report.accuracy)).toBe(false);
    expect(report.cases[0]!.correct).toBe(false);
  });

  it('reads the empty service out of the name, so the case is the one intended', () => {
    const gt = readOfficialGroundTruth('rcaeval-re2', files())[0]!;
    expect(gt.component).toBe('');
    expect(gt.faultType).toBe('adservice');
    // No facet survives the `gtHasFacet` filter, which is the state under test.
    expect(report0Facets(files())).toEqual([]);
  });
});

/** The facets the report kept for the single case in `files()`. */
function report0Facets(files: Record<string, string>): readonly string[] {
  return scoreOfficial('rcaeval-re2', files).cases[0]!.facets.map((v) => v.facet);
}

describe('the terms map every record carries', () => {
  it('is empty for a rule whose terms are its facets', () => {
    const report = scoreOfficial('rcaeval-re2', {
      'RE2-OB/frontend_cpu/1/inject_time.txt': '2026-01-01 00:00:00\n',
    });
    expect(report.caseCount).toBe(1);
    expect(report.cases[0]!.terms).toEqual({});
  });

  it('carries the weighted terms for a rule that has them', () => {
    const report = scoreOfficial('rca100', rca100Key(42));
    const terms = report.cases[0]!.terms;
    expect(Object.keys(terms).sort()).toEqual(['chain', 'checkpoints', 'entity', 'fault']);
    // The map is what the aggregate averages, so a number per key is the contract
    // and not a decoration.
    for (const value of Object.values(terms)) expect(typeof value).toBe('number');
  });
});
