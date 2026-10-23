import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  M1_STRICT_THRESHOLD,
  buildExtractionReport,
  meetsM1ExitCondition,
  parseGoldenDataset,
} from '../src/fault/extraction-scoring.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const DATASET = resolve(ROOT, 'golden-master', 'fault-extraction', 'samples.json');

const dataset = parseGoldenDataset(JSON.parse(readFileSync(DATASET, 'utf8')));

/**
 * The dataset's own answers, submitted as predictions.
 *
 * This is the control the M1 reading has never had. The audit log's finding 1 is *"the
 * regression graded its own answer key"*: a metric that cannot score its own ground truth at
 * 100% is measuring something other than what it names, and every model number it produces
 * afterwards is uninterpretable.
 *
 * Measured on 2026-10-22: the three scored fields come back 19/19 and the strict rate 19/19,
 * so the instrument is sound and **M1's failure is the model's, not the metric's**. That is
 * worth a permanent test rather than a sentence, because the sentence would be about a
 * scorer that can change.
 */
function oracle() {
  return dataset.samples.map((sample) => ({
    sampleId: sample.id,
    parseOk: true,
    extracted: {
      type: sample.expected.type,
      category: sample.expected.category,
      component: sample.expected.component,
    },
    validationValid: true,
    verifiable: true,
  }));
}

describe('the extraction metric grades its own answer key at 100%', () => {
  it('scores every field it scores, on every sample', () => {
    const report = buildExtractionReport(dataset.samples, oracle());

    // Parse, validation and grading first: a field can only be 100% because the sample was
    // read, which is what makes the three rates below meaningful rather than vacuous.
    expect(report.layers.parse.rate).toBe(1);
    expect(report.layers.validation.rate).toBe(1);
    expect(report.layers.graded.rate).toBe(1);

    for (const field of ['type', 'category', 'component'] as const) {
      const rate = report.layers[field].graded;
      expect(rate.total, `${field} was scored on no sample, so its 100% would be vacuous`).toBe(
        dataset.samples.length,
      );
      expect(rate.rate, `${field} does not grade the answer key at 100%`).toBe(1);
    }
    expect(report.misses, 'the answer key produced a miss').toEqual([]);
  });

  it('clears M1 with its own answers, which is what makes M1 a claim about a model', () => {
    const report = buildExtractionReport(dataset.samples, oracle());
    expect(report.strict.rate).toBe(1);
    expect(meetsM1ExitCondition(report)).toBe(true);
    // And the threshold is not being met by an empty denominator: the strict rate has to be
    // over the whole dataset for the sentence "M1 is met by the answer key" to mean anything.
    expect(report.strict.total).toBe(dataset.samples.length);
    expect(M1_STRICT_THRESHOLD).toBeGreaterThan(0);
    expect(M1_STRICT_THRESHOLD).toBeLessThanOrEqual(1);
  });

  it('leaves description out of the strict rate, and says so by scoring nothing', () => {
    // `expected` carries three fields, so `description` has no denominator and the strict
    // rate is over the three. That is a scope fact a reader of an M1 number should know: a
    // run that never produced a description can still be at 100% strict.
    const report = buildExtractionReport(dataset.samples, oracle());
    expect(report.layers.description.graded.total).toBe(0);
    expect(report.layers.description.graded.rate).toBeNull();
  });

  it('has enough samples and fields for the control to mean something', () => {
    // The vacuity guard. An oracle test over one sample, or over samples that carry no
    // category, would pass while measuring nothing -- and the dataset is derived by a script
    // (`scripts/derive-fault-golden.mjs`), so its shape can change without this file.
    expect(dataset.samples.length).toBeGreaterThanOrEqual(30);
    for (const sample of dataset.samples) {
      for (const field of ['type', 'category', 'component'] as const) {
        expect(sample.expected[field], `${sample.id} has no ${field}`).toBeTypeOf('string');
        expect(sample.expected[field].length).toBeGreaterThan(0);
      }
    }
  });
});
