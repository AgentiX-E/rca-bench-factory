import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import type { ExtractionSamplePrediction, GoldenDataset } from '../src/fault/extraction-scoring.js';
import {
  assembleReading,
  compareReadingToArtefact,
  digestExpectedColumn,
} from '../src/fault/reading-record.js';

/**
 * The record is generated from the artefact, not transcribed from it.
 *
 * Every reading in `readings.json` was written by hand: somebody opened a workflow
 * artefact, read thirty rows of answers and typed them into a table beside the expected
 * values. The arithmetic is then checked by `m1-reading-is-reproducible.test.ts`, which
 * catches a total that disagrees with its own rows -- but **a row transcribed wrongly
 * makes a self-consistent record**. Nothing in the tree can tell a faithful transcript
 * from a plausible one, because the thing being described is a file on a blob host.
 *
 * Three of those transcripts were checked against their artefacts by hand while this
 * module was written, and all three were faithful. That is a fact about three files, not
 * a guarantee about the fourth: the step that produced them is the only step in the M1
 * sequence with no gate behind it, and it is the only step performed by memory.
 *
 * So the arithmetic moves into code. `assembleReading` takes the dataset, the artefact
 * and the run's metadata, and returns the record entry -- including `key.digest` and
 * `totals`, which the caller cannot supply because they are *derived from* what the
 * caller supplies. What a human still writes is the prose: `promptChange`, `status`, and
 * the digest of the text that was measured.
 *
 * ## The constraint this module makes explicit
 *
 * A record entry has no way to say "the denominator was smaller than the key": `totals`
 * counts hits, and every reader -- the test that recomputes them, the table a human
 * reads -- takes `samples.length` as the denominator. The scorer does not:
 * `buildExtractionReport` divides `strict` by the number of **graded** samples, so a run
 * with an unparseable response reports `strict 24/29` while the same answers recorded
 * as a reading recompute to `24/30`. The two agree only when every sample reached
 * `graded`, and that has been true of every reading taken so far, which is why the
 * discrepancy has never been visible.
 *
 * `assembleReading` therefore refuses a run that is not wholly graded, and says which
 * samples stopped it. The alternative -- writing the entry with `null` answers -- would
 * produce a record that disagrees with the report it claims to preserve, permanently and
 * silently. A run with unusable samples is a pipeline finding, and it belongs in the
 * report and in `pending`; it is not a reading.
 */

const DATASET: GoldenDataset = {
  schema: 'rca-bench-fault-golden/2',
  types: ['cpu-saturation', 'network-partition'],
  samples: [
    {
      id: 'alpha',
      incidentText: 'the checkout pod sat pinned at its CPU limit',
      expected: { type: 'cpu-saturation', category: 'resource', component: 'checkout-api' },
    },
    {
      id: 'bravo',
      incidentText: 'the search cluster split into two partitions',
      expected: { type: 'network-partition', category: 'network', component: 'search-cluster' },
    },
    {
      id: 'charlie',
      incidentText: 'the ledger writer fell behind its queue',
      expected: { type: 'network-partition', category: 'network', component: 'ledger-writer' },
    },
  ],
};

const META = {
  run: 42424242424,
  model: 'a-model-name',
  promptChange: 'the component rule names the owner of the fault',
  status: 'current' as const,
};

function prediction(
  sampleId: string,
  answered: { type?: string; category?: string; component?: string } | null,
): ExtractionSamplePrediction {
  if (answered === null) return { sampleId, parseOk: false, parseError: 'the response was not JSON' };
  return { sampleId, parseOk: true, validationValid: true, extracted: { ...answered } };
}

/**
 * The three answers this run produced: wholly graded, and one component wrong.
 *
 * The miss is in the fixture on purpose. A fixture where every answer is right makes
 * `strict` equal to the row count and `component` equal to `type`, so four of the five
 * totals would pass a broken implementation -- the same shape as the fixture that hid a
 * truncation defect three times before it was written with real ids.
 */
function answers(): ExtractionSamplePrediction[] {
  return [
    prediction('alpha', { type: 'cpu-saturation', category: 'resource', component: 'checkout-api' }),
    prediction('bravo', { type: 'network-partition', category: 'network', component: 'search-cluster' }),
    prediction('charlie', { type: 'network-partition', category: 'network', component: 'message-broker' }),
  ];
}

describe('a reading is derived from the artefact that produced it', () => {
  it('writes the rows in the key’s order, not in the order the run answered them', () => {
    // The artefact's order is the order requests were made in -- a fact about the run.
    // The record's order is the key's order -- a fact about the content. If the artefact's
    // order leaked through, re-running the same prompt against the same samples in a
    // different order would produce a diff in the record with no change behind it, and a
    // reader would have to diff thirty rows to learn that nothing happened.
    const reversed = answers().reverse();
    const reading = assembleReading({ ...META, dataset: DATASET, predictions: reversed });
    expect(reading.samples.map((sample) => sample.id)).toEqual(['alpha', 'bravo', 'charlie']);
  });

  it('carries the run’s metadata and derives the key digest and the totals itself', () => {
    // `key.digest` and `totals` are not parameters: they are the two numbers a
    // transcription could get wrong, and the only defence is that nobody types them.
    const reading = assembleReading({
      ...META,
      dataset: DATASET,
      predictions: answers(),
      promptDigest: 'a'.repeat(64),
    });
    expect(reading).toEqual({
      run: 42424242424,
      model: 'a-model-name',
      promptChange: 'the component rule names the owner of the fault',
      key: { size: 3, digest: digestExpectedColumn(DATASET) },
      totals: { type: 3, category: 3, component: 2, strict: 2 },
      status: 'current',
      promptDigest: 'a'.repeat(64),
      samples: [
        {
          id: 'alpha',
          expected: { type: 'cpu-saturation', category: 'resource', component: 'checkout-api' },
          answered: { type: 'cpu-saturation', category: 'resource', component: 'checkout-api' },
        },
        {
          id: 'bravo',
          expected: { type: 'network-partition', category: 'network', component: 'search-cluster' },
          answered: { type: 'network-partition', category: 'network', component: 'search-cluster' },
        },
        {
          id: 'charlie',
          expected: { type: 'network-partition', category: 'network', component: 'ledger-writer' },
          answered: { type: 'network-partition', category: 'network', component: 'message-broker' },
        },
      ],
    });
  });

  it('omits promptDigest entirely when no text was measured, rather than writing null', () => {
    // The two nineteen-sample readings predate the digest gate and carry no digest. A
    // `null` there would be a value claiming to be a digest, and the gate that compares
    // the tree's digest to a reading's would have to special-case it.
    const reading = assembleReading({ ...META, status: 'old-key', dataset: DATASET, predictions: answers() });
    expect('promptDigest' in reading).toBe(false);
    expect(reading.status).toBe('old-key');
  });

  it('is a pure function of its inputs, so the same artefact writes the same bytes twice', () => {
    const once = assembleReading({ ...META, dataset: DATASET, predictions: answers() });
    const twice = assembleReading({ ...META, dataset: DATASET, predictions: answers() });
    expect(twice).toEqual(once);
    expect(JSON.stringify(twice)).toBe(JSON.stringify(once));
  });

  it('refuses a run that is not wholly graded, and names the sample that stopped it', () => {
    // The scorer divides strict by the graded count; a record entry divides it by the row
    // count. Writing this one would produce `strict 2/3` beside a report saying `2/2`, and
    // nothing downstream could tell which was the measurement.
    const predictions = answers();
    predictions[1] = prediction('bravo', null);
    expect(() => assembleReading({ ...META, dataset: DATASET, predictions })).toThrow(
      /bravo.*unparseable|unparseable.*bravo/s,
    );
  });

  it('refuses an answer the pipeline validated but the validator rejected', () => {
    const predictions = answers();
    predictions[0] = { ...prediction('alpha', DATASET.samples[0]!.expected), validationValid: false };
    expect(() => assembleReading({ ...META, dataset: DATASET, predictions })).toThrow(/unvalidated/);
  });

  it('refuses an answer whose expected signal the corpus cannot check', () => {
    const predictions = answers();
    predictions[2] = { ...prediction('charlie', DATASET.samples[2]!.expected), verifiable: false };
    expect(() => assembleReading({ ...META, dataset: DATASET, predictions })).toThrow(/unverifiable/);
  });
});

describe('the record and the artefact must agree on which samples exist', () => {
  it('reports a sample the artefact never answered instead of writing a null row', () => {
    const predictions = answers().filter((p) => p.sampleId !== 'bravo');
    expect(() => assembleReading({ ...META, dataset: DATASET, predictions })).toThrow(/bravo/);
  });

  it('reports an answer for a sample the key does not carry', () => {
    // The key growing between a run and its transcription is the concrete way this
    // happens, and dropping the extra row would hide it.
    const predictions = [...answers(), prediction('delta', { type: 'cpu-saturation' })];
    expect(() => assembleReading({ ...META, dataset: DATASET, predictions })).toThrow(/delta/);
  });

  it('reports two answers for one sample', () => {
    const predictions = [...answers(), prediction('alpha', { type: 'cpu-saturation' })];
    expect(() => assembleReading({ ...META, dataset: DATASET, predictions })).toThrow(/alpha/);
  });

  it('reports a key sample that states no component, because a hit cannot be counted', () => {
    const partial: GoldenDataset = {
      ...DATASET,
      samples: [
        { id: 'alpha', incidentText: 'text', expected: { type: 'cpu-saturation', category: 'resource' } },
      ],
    };
    expect(() =>
      assembleReading({
        ...META,
        dataset: partial,
        predictions: [prediction('alpha', { type: 'cpu-saturation', category: 'resource' })],
      }),
    ).toThrow(/component/);
  });
});

describe('the key digest is the one the record already pins', () => {
  it('hashes id and the three expected fields, newline-terminated, sorted by id', () => {
    // Written out here rather than imported from the module under test: the point of a
    // digest is that a second implementation agrees with it. Two calls to the same
    // function would agree even if both were wrong.
    const lines = [...DATASET.samples]
      .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))
      .map((sample) => `${sample.id}|${sample.expected.type}|${sample.expected.category}|${sample.expected.component}`);
    const expected = createHash('sha256').update(`${lines.join('\n')}\n`).digest('hex');
    expect(digestExpectedColumn(DATASET)).toBe(expected);
    expect(digestExpectedColumn(DATASET)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('changes when one expected value changes, so a re-annotation cannot keep the old digest', () => {
    const edited: GoldenDataset = {
      ...DATASET,
      samples: [
        DATASET.samples[0]!,
        { ...DATASET.samples[1]!, expected: { ...DATASET.samples[1]!.expected, component: 'search-index' } },
        DATASET.samples[2]!,
      ],
    };
    expect(digestExpectedColumn(edited)).not.toBe(digestExpectedColumn(DATASET));
  });

  it('does not depend on the order the key lists its samples', () => {
    // The digest is of a set of annotations, and two files listing the same thirty
    // annotations in different orders describe the same key. This is also why the digest
    // can be compared across readings taken months apart.
    const shuffled: GoldenDataset = { ...DATASET, samples: [...DATASET.samples].reverse() };
    expect(digestExpectedColumn(shuffled)).toBe(digestExpectedColumn(DATASET));
  });
});

describe('a recorded reading can be checked against the artefact it came from', () => {
  const reading = assembleReading({ ...META, dataset: DATASET, predictions: answers() });

  it('finds nothing when the transcript is faithful', () => {
    expect(compareReadingToArtefact(reading, answers())).toEqual([]);
  });

  it('names the sample, the field and both values when one answer was transcribed wrongly', () => {
    // This is the failure the whole module exists for: a plausible transcription of a
    // real artefact. The message has to be readable without the artefact in front of you.
    const altered = answers();
    altered[2] = prediction('charlie', { type: 'network-partition', category: 'network', component: 'queue' });
    expect(compareReadingToArtefact(reading, altered)).toEqual([
      { kind: 'field', sampleId: 'charlie', field: 'component', recorded: 'message-broker', artefact: 'queue' },
    ]);
  });

  it('reports a row the artefact has no answer for', () => {
    const short = answers().slice(0, 2);
    expect(compareReadingToArtefact(reading, short)).toEqual([
      { kind: 'missing', sampleId: 'charlie', recorded: 'message-broker', artefact: null },
    ]);
  });

  it('reports an answer the reading has no row for', () => {
    const extra = [...answers(), prediction('delta', DATASET.samples[0]!.expected)];
    expect(compareReadingToArtefact(reading, extra)).toEqual([
      { kind: 'extra', sampleId: 'delta', recorded: null, artefact: 'cpu-saturation' },
    ]);
  });

  it('reports a total that its own rows do not produce', () => {
    // A total is the one field a transcript could carry that no row contradicts, and it is
    // the number everything downstream quotes.
    const wrong = { ...reading, totals: { ...reading.totals, component: 3 } };
    expect(compareReadingToArtefact(wrong, answers())).toEqual([
      { kind: 'total', field: 'component', recorded: '3', artefact: '2' },
    ]);
  });

  it('checks every total, not only the one that moved', () => {
    const wrong = { ...reading, totals: { type: 0, category: 0, component: 0, strict: 0 } };
    const differences = compareReadingToArtefact(wrong, answers());
    expect(differences.map((difference) => difference.field)).toEqual(['type', 'category', 'component', 'strict']);
  });
});

describe('a key that cannot be counted is refused, whichever field it omits', () => {
  // `digestExpectedColumn` and `assembleReading` each decide "is this sample complete" and each
  // names the missing field. Driving only the component case left two thirds of both decisions
  // unexecuted -- 97.5% statements and 88.7% branches on the module, which is the shape this
  // repository refuses: a threshold that hides the branch nobody ran.
  const cases: Array<[string, Record<string, string>]> = [
    ['type', { category: 'resource', component: 'checkout-api' }],
    ['category', { type: 'cpu-saturation', component: 'checkout-api' }],
    ['component', { type: 'cpu-saturation', category: 'resource' }],
  ];

  it.each(cases)('names %s when the digest cannot count it', (field, expected) => {
    const partial = {
      ...DATASET,
      samples: [{ id: 'alpha', incidentText: 'text', expected } as unknown as (typeof DATASET.samples)[number]],
    };
    expect(() => digestExpectedColumn(partial)).toThrow(new RegExp(`no ${field}`));
  });

  it.each(cases)('names %s when an entry cannot count it', (field, expected) => {
    const partial = {
      ...DATASET,
      samples: [{ id: 'alpha', incidentText: 'text', expected } as unknown as (typeof DATASET.samples)[number]],
    };
    expect(() =>
      assembleReading({
        ...META,
        dataset: partial,
        predictions: [prediction('alpha', { type: 'cpu-saturation', category: 'resource', component: 'checkout-api' })],
      }),
    ).toThrow(new RegExp(`no ${field}`));
  });
});

describe('an answer that states only some fields is recorded as it arrived', () => {
  it('writes null for a field the artefact omitted, so a partial answer is not credited', () => {
    // The comparison is `answered === expected`, and `undefined === undefined` would be a hit
    // against a key that also omitted the field. Writing `null` makes the row total.
    const partial = { ...DATASET, samples: [DATASET.samples[0]!] };
    const reading = assembleReading({
      ...META,
      dataset: partial,
      predictions: [{ sampleId: 'alpha', parseOk: true, validationValid: true, extracted: { type: 'cpu-saturation' } }],
    });
    expect(reading.samples[0]?.answered).toEqual({ type: 'cpu-saturation', category: null, component: null });
    expect(reading.totals).toEqual({ type: 1, category: 0, component: 0, strict: 0 });
  });

  it('falls back to whatever the row did answer when it reports a missing sample', () => {
    // A row with no component still has to be named in the message by something a reader can
    // search the artefact for.
    const entry = assembleReading({ ...META, dataset: DATASET, predictions: answers() });
    const fromType = {
      ...entry,
      samples: entry.samples.map((sample) =>
        sample.id === 'charlie' ? { ...sample, answered: { type: 'network-partition', category: null, component: null } } : sample,
      ),
    };
    const differences = compareReadingToArtefact(fromType, answers().slice(0, 2));
    const missing = differences.find((difference) => difference.kind === 'missing');
    expect(missing).toMatchObject({ sampleId: 'charlie', recorded: 'network-partition' });
  });

  it('names an extra sample that produced no answer at all, by its component', () => {
    const entry = assembleReading({ ...META, dataset: DATASET, predictions: answers() });
    const unparsed = { sampleId: 'delta', parseOk: false };
    const differences = compareReadingToArtefact(entry, [...answers(), unparsed]);
    expect(differences).toEqual([{ kind: 'extra', sampleId: 'delta', recorded: null, artefact: null }]);
  });
});

describe('a row that arrived without a type is written as an absence, not as a missing key', () => {
  it('normalises a missing type to null so every row has the same three keys', () => {
    // `ExtractionFields.type` is required by the scoring contract, so this is not a shape the
    // deriver produces -- it is the shape a hand-edited or truncated artefact produces, and a
    // record row with two keys is a row no reader can compare against the other five entries.
    const reading = assembleReading({
      ...META,
      dataset: { ...DATASET, samples: [DATASET.samples[0]!] },
      predictions: [{ sampleId: 'alpha', parseOk: true, validationValid: true, extracted: { type: undefined as unknown as string } }],
    });
    expect(reading.samples[0]?.answered).toEqual({ type: null, category: null, component: null });
    expect(reading.totals).toEqual({ type: 0, category: 0, component: 0, strict: 0 });
  });
});
