import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { buildFaultExtractionPrompt } from '../src/fault/importer.js';

/**
 * A prompt change with no reading behind it is a red build.
 *
 * Three rounds changed the extraction prompt and learned afterwards what the change cost:
 * 22/30 for a bundle of three (finding 223), 20/30 for the criterion alone (finding 224), and
 * the milestone below its threshold for the first time. Each of those rounds had a *revert* to
 * fall back on only because somebody remembered what the previous text was. The lesson each
 * one wrote down — *one change, one reading* — was a habit, and habits are not gates.
 *
 * This is the gate. The prompt is a value: rendering it with a fixed placeholder incident and a
 * fixed vocabulary produces a string, and that string has a digest. Every reading that describes
 * the tree carries the digest of the text it measured, and **the tree's digest must equal the
 * digest of a reading**. Edit one character of the prompt and this fails, naming the two digests
 * and the two ways out:
 *
 *   1. measure it — dispatch `fault-extraction-accuracy.yml`, add the reading with
 *      `status: "current"` and its `promptDigest`;
 *   2. or record it as `pending` with a reason, which is a statement that a change is in the tree
 *      unmeasured and known to be.
 *
 * The second option is what makes the gate usable rather than merely strict: a change can land
 * before its run finishes, as long as the document says so. What it cannot do is land *silently*.
 *
 * ## Why a digest of the rendered prompt and not of the source
 *
 * Because the source is not what the model sees. `FAULT_COMPONENT_RULE` is one of several
 * fragments the function assembles, and a change to the assembly is as much a prompt change as a
 * change to a sentence. Hashing the rendered string with fixed arguments covers every fragment and
 * the order they arrive in, and it needs no maintenance when a fragment is added.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const READINGS = resolve(ROOT, 'golden-master', 'fault-extraction', 'readings.json');

/** The rendering the digest is taken of. Any fixed pair would do; these are the smallest. */
const PLACEHOLDER = 'placeholder incident text';
const VOCABULARY = ['cpu-saturation'];

interface Reading {
  run: number;
  status: 'old-key' | 'current' | 'reverted';
  promptDigest?: string;
  promptDigestNote?: string;
}

interface Pending {
  promptDigest: string;
  why: string;
}

interface Record {
  readings: Reading[];
  pending: Pending[];
}

const record = JSON.parse(readFileSync(READINGS, 'utf8')) as Record;

/** What the tree renders to, today. */
function treeDigest(): string {
  return createHash('sha256').update(buildFaultExtractionPrompt(PLACEHOLDER, VOCABULARY)).digest('hex');
}

describe('every prompt in the tree has a reading behind it', () => {
  it('matches the digest of the reading that produced the current number', () => {
    // The load-bearing assertion. Its failure message is the instruction, because the next person
    // to hit it will be mid-change and will not want to read this file.
    const current = record.readings.filter((reading) => reading.status === 'current');
    expect(current, 'exactly one reading describes the rule in the tree').toHaveLength(1);
    const measured = current[0]?.promptDigest;
    expect(
      measured,
      'the current reading carries no promptDigest, so nothing can say which text produced its number',
    ).toBeDefined();
    expect(
      treeDigest(),
      'the prompt in the tree is not the prompt that was measured. Either dispatch ' +
        'fault-extraction-accuracy.yml, read the numbers and add the reading with status ' +
        '"current" and this digest, or add a `pending` entry with this digest and a reason. ' +
        'One change, one reading -- findings 223 and 224 each cost a dispatch to learn that.',
    ).toBe(measured);
  });

  it('keeps the digests of reverted readings, so a reverted text is recognisable if it returns', () => {
    // Not every text that was measured still exists, and that is the point of the record: a
    // reverted reading without a digest is a number whose text nobody can reconstruct. The two
    // experiments here are the exception, and the exception is stated rather than implied -- they
    // were reverted before this gate existed.
    const reverted = record.readings.filter((reading) => reading.status === 'reverted');
    expect(reverted.length).toBeGreaterThan(0);
    for (const reading of reverted) {
      expect(reading.promptDigest, `run ${String(reading.run)} has no digest and no note`).toBeUndefined();
    }
  });

  it('lets a change land unmeasured, but not silently', () => {
    // The escape hatch, and its two rules: a pending entry must say why, and it must not describe
    // the text that is in the tree -- if it does, the run has happened (move it to a reading) or
    // the entry is stale (delete it). Both are states a reader can act on.
    for (const entry of record.pending) {
      expect(entry.why.length, 'a pending prompt change must say why it is unmeasured').toBeGreaterThan(40);
      expect(
        entry.promptDigest,
        'a pending entry describes the text that is in the tree, so either the run has happened ' +
          'or the entry is stale',
      ).not.toBe(treeDigest());
    }
  });

  it('distinguishes two prompts that differ by one argument, so the digest is sensitive', () => {
    // The control. A digest function that returned a constant would satisfy every assertion above
    // while saying nothing, so it is shown to move when the prompt moves -- here by changing the
    // vocabulary the function is handed, which is one of its inputs.
    const one = createHash('sha256').update(buildFaultExtractionPrompt(PLACEHOLDER, ['cpu-saturation'])).digest('hex');
    const two = createHash('sha256')
      .update(buildFaultExtractionPrompt(PLACEHOLDER, ['cpu-saturation', 'network-delay']))
      .digest('hex');
    expect(one).not.toBe(two);
    // And it is a function of the incident text too, which is why the placeholder is fixed.
    const three = createHash('sha256').update(buildFaultExtractionPrompt('another incident', VOCABULARY)).digest('hex');
    expect(three).not.toBe(one);
  });
});
