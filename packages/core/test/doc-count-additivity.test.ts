import { describe, expect, it } from 'vitest';
import { ADDITIVE_SCOPES, checkCountAdditivity } from '../../../scripts/doc-count-additivity.mjs';

/**
 * `scripts/doc-count-additivity.mjs` -- the one relation between the three
 * published suite counts.
 *
 * ## The defect this exists for
 *
 * `golden-master/doc-counts.json` holds three measurements: `core`, `cli` and
 * `repo`, the last of which is every workspace. They are taken by three separate
 * runs, they are published side by side, and **nothing computed the relation that
 * has to hold between them**. On this round the committed file said
 *
 *   core 199 files, cli 4 files, repo 202 files
 *
 * and `199 + 4` is `203`. The number was typed rather than read -- the pass that
 * wrote it counted the files in a directory by hand one file too high -- and it
 * passed every guard that reads those numbers, because each of them compares a
 * *document* to the declaration. The only check that compares the declaration to
 * a run is `measure-doc-counts.mjs --check --from <report>`, which needs two
 * vitest reports and therefore only runs inside `verify:local`.
 *
 * So the published table was arithmetically inconsistent for a whole round while
 * `docs:check` was green, and `check-doc-counts` was green, and the finding that
 * closed the previous round was *about exactly this shape* one level up: two
 * counts, each true of its own scope, and no comparison between them.
 *
 * ## What is asserted, and what is not
 *
 * The assertions are about the rule, not about today's counts: the numbers are
 * written here, so the file does not fail every time a test is added. The real
 * file is checked by the guard that calls this function, which is driven from
 * `check-doc-counts.test.ts`.
 *
 * A **partial** measurement is not a claim and is not reported. `--measured`
 * exists so a caller can hand in the scope it wants to talk about, and several
 * tests in `check-doc-counts.test.ts` hand in one scope; requiring all three
 * would turn those into failures about a scope they never mentioned. A gap is
 * silence here for the same reason it is silence in `sample-coverage.ts`: before
 * the annotation is complete, a gap *is* the schedule.
 */

const measure = (core: [number, number], cli: [number, number], repo: [number, number]) => ({
  core: { files: core[0], tests: core[1] },
  cli: { files: cli[0], tests: cli[1] },
  repo: { files: repo[0], tests: repo[1] },
});

describe('checkCountAdditivity', () => {
  it('passes when the parts add up to the whole', () => {
    expect(checkCountAdditivity(measure([198, 4894], [4, 187], [202, 5081]))).toEqual([]);
  });

  // The exact defect, in the exact shape it was found: one file typed too many.
  it('reports a file count that was typed rather than measured', () => {
    const problems = checkCountAdditivity(measure([199, 4894], [4, 187], [202, 5081]));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('files');
    expect(problems[0]).toContain('203');
    expect(problems[0]).toContain('202');
  });

  it('reports a test count that does not add up, and only that unit', () => {
    const problems = checkCountAdditivity(measure([198, 4890], [4, 187], [202, 5081]));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('tests');
    expect(problems[0]).not.toContain('files');
  });

  it('reports both units when both are off, as two problems rather than one', () => {
    const problems = checkCountAdditivity(measure([199, 4880], [4, 187], [202, 5081]));
    expect(problems).toHaveLength(2);
    expect(problems.filter((one) => one.includes('tests'))).toHaveLength(1);
    expect(problems.filter((one) => one.includes('files'))).toHaveLength(1);
  });

  it('says how far off the whole is, because a sign says which side was typed', () => {
    // Sum below the whole: a part went missing rather than gaining a file.
    const problems = checkCountAdditivity(measure([190, 4894], [4, 187], [202, 5081]));
    expect(problems[0]).toContain('194');
    expect(problems[0]).toContain('+8');
    const over = checkCountAdditivity(measure([199, 4894], [4, 187], [202, 5081]));
    expect(over[0]).toContain('-1');
  });

  it('names every scope it summed, so the reader knows which numbers produced the total', () => {
    const problems = checkCountAdditivity(measure([199, 4894], [4, 187], [202, 5081]));
    for (const scope of [...ADDITIVE_SCOPES.parts, ADDITIVE_SCOPES.whole]) {
      expect(problems[0]).toContain(`'${scope}'`);
    }
  });

  it('stays silent on a partial measurement, because one scope is not a claim about the total', () => {
    expect(checkCountAdditivity({ core: { files: 198, tests: 4894 } })).toEqual([]);
    expect(
      checkCountAdditivity({
        core: { files: 198, tests: 4894 },
        repo: { files: 202, tests: 5081 },
      }),
    ).toEqual([]);
  });

  it('stays silent when a count is not a number, because a missing count is a gap and not a defect', () => {
    expect(
      checkCountAdditivity({
        core: { files: 198, tests: 4894 },
        cli: { files: 4, tests: 187 },
        repo: { files: '202', tests: 5081 },
      }),
    ).toEqual([]);
  });

  it('takes the relation as an argument, so a fourth scope can be added without editing the rule', () => {
    const problems = checkCountAdditivity(
      {
        core: { files: 198, tests: 4894 },
        cli: { files: 4, tests: 187 },
        docs: { files: 3, tests: 9 },
        repo: { files: 202, tests: 5081 },
      },
      { parts: ['core', 'cli', 'docs'], whole: 'repo' },
    );
    // 198 + 4 + 3 = 205 files, 4894 + 187 + 9 = 5090 tests: both off, and both named.
    expect(problems).toHaveLength(2);
    expect(problems.join('\n')).toContain("'docs'");
    expect(problems.join('\n')).toContain('205');
    expect(problems.join('\n')).toContain('5090');
  });

  it('refuses a relation with no parts instead of asserting that the whole is zero', () => {
    const problems = checkCountAdditivity(measure([198, 4894], [4, 187], [202, 5081]), {
      parts: [],
      whole: 'repo',
    });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('no parts');
  });
});
