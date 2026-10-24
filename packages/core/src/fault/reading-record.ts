import { sha256 } from '../util/hash.js';
import type {
  ExtractionSamplePrediction,
  GoldenDataset,
  GoldenSample,
  SampleState,
} from './extraction-scoring.js';
import { scoreExtractionSample } from './extraction-scoring.js';

/**
 * The extraction record, generated from the artefact rather than transcribed from it.
 *
 * `golden-master/fault-extraction/readings.json` is the evidence the M1 milestone rests
 * on: every sample as it was answered, beside the value it was scored against, so the
 * arithmetic can be repeated from the repository alone. It was written by hand from a
 * workflow artefact for six readings, and the arithmetic was checked by a test while the
 * *transcription* was not -- a row typed wrongly is self-consistent, and the file it was
 * copied from is on a blob host.
 *
 * This module is the transcription, as code. It answers one question: given the dataset,
 * the artefact and the run's metadata, what is the record entry? Two of the entry's fields
 * are derived and cannot be supplied -- `key.digest` and `totals` -- because they are the
 * two numbers a human could get wrong and the only defence is that nobody types them.
 *
 * ## What is deliberately not derived
 *
 * `promptDigest` is the digest of the text that was *measured*, and that is a historical
 * fact: the tree may have moved on since. A tool that computed it from the current tree
 * would record what is true now under the name of what was true then, which is the exact
 * failure the digest gate exists to catch. So the caller supplies it, and the caller is
 * the person who read the artefact.
 *
 * `promptChange` is prose and `status` is a judgement. Both stay human.
 *
 * ## The constraint this module enforces
 *
 * An entry has no field that says "the denominator was smaller than the key": `totals`
 * counts hits and every reader takes `samples.length` as the denominator. The scorer does
 * not -- `buildExtractionReport` divides strict by the **graded** count -- so a run with
 * one unparseable response reports `strict 24/29` while the same answers recorded as a
 * reading recompute to `24/30`. Both are true statements about different things, and the
 * record can only hold the second. Every reading taken so far has been wholly graded,
 * which is why the two have never disagreed in public.
 *
 * A run that is not wholly graded is therefore refused, with the samples named. It is a
 * pipeline finding -- it belongs in the report and in `pending`, not in a reading that
 * would disagree with the report it claims to preserve.
 */

const FIELDS = ['type', 'category', 'component'] as const;

export type ReadingField = (typeof FIELDS)[number];

/**
 * `current` is the rule in the tree; `reverted` and `old-key` are history.
 *
 * A status is a claim about the *tree*, not about the number, which is why it is a
 * parameter: the tool cannot know whether the text it recorded is still the text that
 * runs.
 */
export type ReadingStatus = 'current' | 'reverted' | 'old-key';

/** One answer as the artefact recorded it; `null` where no answer is possible. */
export interface ReadingAnswer {
  type: string | null;
  category: string | null;
  component: string | null;
}

export interface ReadingSample {
  id: string;
  expected: ReadingAnswer;
  answered: ReadingAnswer;
}

/** How many samples got each field right, and how many got all three. */
export interface ReadingTotals {
  type: number;
  category: number;
  component: number;
  strict: number;
}

export interface ReadingEntry {
  run: number;
  model: string;
  promptChange: string;
  key: { size: number; digest: string };
  totals: ReadingTotals;
  status: ReadingStatus;
  promptDigest?: string;
  samples: ReadingSample[];
}

export interface AssembleReadingRequest {
  run: number;
  model: string;
  promptChange: string;
  status: ReadingStatus;
  dataset: GoldenDataset;
  predictions: readonly ExtractionSamplePrediction[];
  /** The digest of the prompt the run measured. Absent for readings that predate the gate. */
  promptDigest?: string;
}

/**
 * The digest a reading pins its expected column to.
 *
 * One line per sample, `id|type|category|component`, sorted by id and newline-terminated.
 * Sorting is what makes the digest a property of the *annotations* rather than of the
 * order a file happens to list them in -- and a re-annotation of one sample changes it,
 * which is the property the record relies on to keep old answers from being rescored
 * against a new answer key.
 */
export function digestExpectedColumn(dataset: GoldenDataset): string {
  const lines = dataset.samples
    .map((sample) => {
      const { type, category, component } = sample.expected;
      if (type === undefined || category === undefined || component === undefined) {
        throw new Error(
          `sample '${sample.id}' states no ${type === undefined ? 'type' : category === undefined ? 'category' : 'component'};` +
            ' a key the record pins must name all three, because a field with no expectation cannot be counted',
        );
      }
      return `${sample.id}|${type}|${category}|${component}`;
    })
    .sort()
    .join('\n');
  return sha256(`${lines}\n`);
}

/**
 * One answer field as the record stores it.
 *
 * `ExtractionFields.type` is required by the scoring contract, so the left of `??` is always
 * taken for a well-formed artefact -- but the artefact is JSON read off a blob host, and a row
 * that arrived without a `type` has to be written as an absence rather than as a missing key.
 * The three fields go through one function so the record cannot hold a row with two of them
 * normalised and one of them absent from the object.
 */
function orNull(value: string | undefined): string | null {
  return value ?? null;
}

/** The three answers an artefact row carries, or all nulls when it carries none. */
function answersOf(prediction: ExtractionSamplePrediction): ReadingAnswer {
  const extracted = prediction.extracted;
  if (!prediction.parseOk || extracted === undefined) {
    return { type: null, category: null, component: null };
  }
  return {
    type: orNull(extracted.type),
    category: orNull(extracted.category),
    component: orNull(extracted.component),
  };
}

/**
 * Build the record entry for one run.
 *
 * Throws rather than degrading: every condition below is a disagreement between the
 * record and the run, and a record that hedges is worse than one that refuses, because
 * the hedge is what a later reader quotes.
 */
export function assembleReading(request: AssembleReadingRequest): ReadingEntry {
  const { dataset, predictions } = request;

  const byId = new Map<string, ExtractionSamplePrediction>();
  for (const prediction of predictions) {
    const existing = byId.get(prediction.sampleId);
    if (existing !== undefined) {
      throw new Error(
        `the artefact answers sample '${prediction.sampleId}' twice; ` +
          'a record with two rows for one sample would double-count it in every total',
      );
    }
    byId.set(prediction.sampleId, prediction);
  }

  const known = new Set(dataset.samples.map((sample) => sample.id));
  for (const prediction of predictions) {
    if (!known.has(prediction.sampleId)) {
      throw new Error(
        `the artefact answers sample '${prediction.sampleId}', which the key does not carry; ` +
          'the key and the run disagree, and dropping the row would hide it',
      );
    }
  }

  const samples: ReadingSample[] = [];
  const totals: ReadingTotals = { type: 0, category: 0, component: 0, strict: 0 };
  const unusable: string[] = [];

  for (const sample of dataset.samples) {
    const prediction = byId.get(sample.id);
    if (prediction === undefined) {
      throw new Error(
        `the artefact has no answer for sample '${sample.id}'; every sample in the key must have ` +
          'exactly one answer, and a missing row would shrink the denominator without saying so',
      );
    }

    const state = stateOf(sample, prediction);
    if (state !== 'graded') {
      unusable.push(`${sample.id} (${state})`);
    }

    const answered = answersOf(prediction);
    const expected = expectedOf(sample);
    for (const field of FIELDS) {
      if (answered[field] === expected[field]) totals[field] += 1;
    }
    if (FIELDS.every((field) => answered[field] === expected[field])) totals.strict += 1;

    samples.push({ id: sample.id, expected, answered });
  }

  if (unusable.length > 0) {
    throw new Error(
      `this run is not a reading: ${unusable.join(', ')} did not reach a scoreable answer. ` +
        'The scorer divides strict by the graded count and a record entry divides it by the row ' +
        'count, so writing this one would produce a total that disagrees with the report it ' +
        'preserves. Fix the pipeline, or record the run in `pending` with its digest.',
    );
  }

  return {
    run: request.run,
    model: request.model,
    promptChange: request.promptChange,
    key: { size: dataset.samples.length, digest: digestExpectedColumn(dataset) },
    totals,
    status: request.status,
    ...(request.promptDigest === undefined ? {} : { promptDigest: request.promptDigest }),
    samples,
  };
}

/** The sample's three expected values, checked rather than assumed. */
function expectedOf(sample: GoldenSample): ReadingAnswer {
  const { type, category, component } = sample.expected;
  if (type === undefined || category === undefined || component === undefined) {
    throw new Error(`sample '${sample.id}' states no ${type === undefined ? 'type' : category === undefined ? 'category' : 'component'}`);
  }
  return { type, category, component };
}

/**
 * The sample's verdict state, from the scorer itself.
 *
 * Reusing `scoreExtractionSample` rather than re-deciding "scoreable" here is what keeps
 * the refusal above honest: if the definition of `graded` changes, this module's threshold
 * moves with it, and a second copy of the rule could not.
 */
function stateOf(sample: GoldenSample, prediction: ExtractionSamplePrediction): SampleState {
  return scoreExtractionSample(sample, prediction).state;
}

/** One disagreement between a recorded reading and the artefact it came from. */
export interface ReadingDifference {
  kind: 'field' | 'missing' | 'extra' | 'total';
  /** Absent for a total, which is about the whole table rather than one row. */
  sampleId?: string;
  /** The field a difference is about; for a `total` it names the total that moved. */
  field?: ReadingField | 'strict';
  recorded: string | null;
  artefact: string | null;
}

/**
 * Compare a recorded entry to the artefact, field by field.
 *
 * The entry supplies the expected column and the totals -- that is the record talking
 * about itself -- and the artefact supplies only what was answered. So this can check a
 * nineteen-sample reading from a key that no longer exists, which is the case the older
 * two entries are.
 *
 * A total is compared against the total its own rows produce, not against the artefact:
 * the artefact does not have totals, and a transcript's totals are the thing most likely
 * to be wrong in a way no single row contradicts.
 */
export function compareReadingToArtefact(
  entry: ReadingEntry,
  predictions: readonly ExtractionSamplePrediction[],
): ReadingDifference[] {
  const differences: ReadingDifference[] = [];
  const byId = new Map(predictions.map((prediction) => [prediction.sampleId, prediction]));

  for (const sample of entry.samples) {
    const prediction = byId.get(sample.id);
    if (prediction === undefined) {
      differences.push({
        kind: 'missing',
        sampleId: sample.id,
        recorded: sample.answered.component ?? sample.answered.type,
        artefact: null,
      });
      continue;
    }
    const answered = answersOf(prediction);
    for (const field of FIELDS) {
      if (answered[field] !== sample.answered[field]) {
        differences.push({
          kind: 'field',
          sampleId: sample.id,
          field,
          recorded: sample.answered[field],
          artefact: answered[field],
        });
      }
    }
  }

  const recorded = new Set(entry.samples.map((sample) => sample.id));
  for (const prediction of predictions) {
    if (!recorded.has(prediction.sampleId)) {
      const answered = answersOf(prediction);
      differences.push({
        kind: 'extra',
        sampleId: prediction.sampleId,
        recorded: null,
        artefact: answered.type ?? answered.component,
      });
    }
  }

  const implied = impliedTotals(entry);
  for (const field of [...FIELDS, 'strict'] as const) {
    if (implied[field] !== entry.totals[field]) {
      differences.push({
        kind: 'total',
        field,
        recorded: String(entry.totals[field]),
        artefact: String(implied[field]),
      });
    }
  }

  return differences;
}

/** The totals a recorded table produces on its own terms. */
function impliedTotals(entry: ReadingEntry): ReadingTotals {
  const totals: ReadingTotals = { type: 0, category: 0, component: 0, strict: 0 };
  for (const sample of entry.samples) {
    for (const field of FIELDS) {
      if (sample.answered[field] === sample.expected[field]) totals[field] += 1;
    }
    if (FIELDS.every((field) => sample.answered[field] === sample.expected[field])) totals.strict += 1;
  }
  return totals;
}
