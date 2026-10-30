import { describe, expect, it } from 'vitest';

import { checkSampleCoverage } from '../src/fault/sample-coverage.js';

/**
 * The count that says "every sample is covered", and the one input that makes it false.
 *
 * `check-fault-cases` reports `n of m sample(s) carry a four-layer case`, and the numerator is the
 * number of entries in the index while the denominator is the number of samples. Nothing compared
 * the two sets, so the sentence was true only while nobody wrote the same `sampleId` twice -- and
 * at the moment the corpus reached its target, `n` and `m` are both thirty, so a duplicated sample
 * leaves one sample unannotated while the report says the set is complete.
 *
 * That the defect only becomes invisible at the goal is the point of these tests. At twenty-seven
 * of thirty a duplicate makes the numerator smaller than the denominator, which a reader sees; at
 * thirty of thirty the two numbers agree and the arithmetic has stopped meaning anything.
 *
 * The function is in `fault/` rather than in the guard for the same reason `answer-presence` is: the
 * rule has to be exercised by a test that can state the shapes, and a script's private `if` can only
 * be exercised by editing the corpus.
 */
const KNOWN = ['a', 'b', 'c'];

describe('checkSampleCoverage', () => {
  it('says nothing when every sample carries exactly one case', () => {
    expect(
      checkSampleCoverage({
        entries: [
          { caseId: 'one', sampleId: 'a' },
          { caseId: 'two', sampleId: 'b' },
          { caseId: 'three', sampleId: 'c' },
        ],
        knownSampleIds: KNOWN,
      }),
    ).toEqual([]);
  });

  it('names both cases when one sample is annotated twice', () => {
    // The shape a copy-paste produces: a new entry added under the sample before it. The sample set
    // is two long here rather than three, so the run has caught up with it and the duplicate is the
    // only thing wrong -- a gap and a duplicate are different defects and each has its own case.
    const problems = checkSampleCoverage({
      entries: [
        { caseId: 'one', sampleId: 'a' },
        { caseId: 'two', sampleId: 'b' },
        { caseId: 'two-again', sampleId: 'b' },
      ],
      knownSampleIds: ['a', 'b'],
    });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("'two' and 'two-again'");
    expect(problems[0]).toContain("sample 'b'");
  });

  it('names the sample that is left out when the index is as long as the sample set', () => {
    // This is the milestone case, and the reason the function exists: three entries, three samples,
    // one of them annotated twice -- so `3 of 3` is printed while nothing annotates `c`.
    const problems = checkSampleCoverage({
      entries: [
        { caseId: 'one', sampleId: 'a' },
        { caseId: 'two', sampleId: 'b' },
        { caseId: 'three', sampleId: 'b' },
      ],
      knownSampleIds: KNOWN,
    });
    expect(problems).toHaveLength(2);
    expect(problems[0]).toContain('covered twice');
    expect(problems[1]).toContain("sample 'c'");
    expect(problems[1]).toContain('no case annotates');
  });

  it('says nothing about a sample nobody has reached yet', () => {
    // Progress is not a defect. Before the corpus is as long as the sample set, a sample with no
    // case is the next round's work, and reporting it would make every round between now and the
    // target a failing one.
    expect(
      checkSampleCoverage({
        entries: [{ caseId: 'one', sampleId: 'a' }],
        knownSampleIds: KNOWN,
      }),
    ).toEqual([]);
  });

  it('names all three cases when a sample is annotated three times', () => {
    const problems = checkSampleCoverage({
      entries: [
        { caseId: 'one', sampleId: 'a' },
        { caseId: 'two', sampleId: 'a' },
        { caseId: 'three', sampleId: 'a' },
      ],
      knownSampleIds: ['a'],
    });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("'one', 'two' and 'three'");
  });

  it('says nothing when the index is exactly as long as the sample set and covers it', () => {
    // The state the corpus is in, and the one both arms have to be silent about: as many entries as
    // samples, none repeated, none missing. A rule that fired here would be firing on the goal.
    expect(
      checkSampleCoverage({
        entries: KNOWN.map((id, index) => ({ caseId: `case-${String(index)}`, sampleId: id })),
        knownSampleIds: KNOWN,
      }),
    ).toEqual([]);
  });

  it('names two missing samples in the plural, and both duplicates that caused them', () => {
    // Four entries, four samples, two of them annotated twice: the count is level and two samples are
    // unannotated. The sentence has to read as a sentence -- "samples 'c' and 'd'" rather than
    // "sample 'c' and 'd'" -- because the phrase is what a reader quotes when they go looking.
    const problems = checkSampleCoverage({
      entries: [
        { caseId: 'one', sampleId: 'a' },
        { caseId: 'two', sampleId: 'a' },
        { caseId: 'three', sampleId: 'b' },
        { caseId: 'four', sampleId: 'b' },
      ],
      knownSampleIds: ['a', 'b', 'c', 'd'],
    });
    expect(problems).toHaveLength(3);
    expect(problems[0]).toContain("'one' and 'two'");
    expect(problems[1]).toContain("'three' and 'four'");
    expect(problems[2]).toContain("samples 'c' and 'd'");
  });

  it('says nothing about an empty index', () => {
    expect(checkSampleCoverage({ entries: [], knownSampleIds: KNOWN })).toEqual([]);
  });

  it('counts a duplicate even when the index is longer than the sample set', () => {
    // `4 entries, 3 samples`: nobody is missing, and the duplicate is still a duplicate -- one
    // sample was annotated twice, which is a claim about the corpus rather than about progress.
    const problems = checkSampleCoverage({
      entries: [
        { caseId: 'one', sampleId: 'a' },
        { caseId: 'two', sampleId: 'b' },
        { caseId: 'three', sampleId: 'c' },
        { caseId: 'four', sampleId: 'c' },
      ],
      knownSampleIds: KNOWN,
    });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('covered twice');
  });
});
