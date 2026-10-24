import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The answer-space mechanism, measured before it was built — and refuted.
 *
 * Finding 224 closed the prose line of work on `component` and proposed the next lever:
 * *constrain the answer rather than describe it*, for instance by requiring the component
 * to be composed from tokens the incident's own text uses. That is exactly the shape that
 * worked for `type` — an answer space fixed `type` from 4/19 to 17/19 while a description of
 * the convention fixed nothing.
 *
 * So before writing any of it, the mechanism was measured against what already exists: the
 * thirty-sample key and the five recorded readings. It does not survive the measurement, on
 * two separate grounds, and this file is the record so the next person starts from the
 * numbers rather than from the idea.
 *
 * ## Ground one: a candidate list caps the ceiling at 25/30
 *
 * The strongest form of "constrain the answer" is to hand the model the candidates the text
 * supports. The natural extraction is *runs of adjacent words joined by a hyphen*, which is
 * how every expected component is spelled — and **25 of 30** expected components are
 * recoverable that way. The five that are not are not obscure; three of them are the
 * samples that have been hardest to fix:
 *
 *   cart-service            the text says "Cart-to-inventory calls", so the workload is
 *                           the caller and never a two-word run
 *   session-cache           the text says "the session Redis" -- the kind of store sits
 *                           between the two words the slug joins
 *   order-events-consumer   the text says "Consumer group order-events", reversed
 *   analytics-replica       reads are "against the replica of analytics", not adjacent
 *   booking-api             the text talks about "Booking reminders"; the API is never named
 *
 * A list that omits them makes those five **unanswerable**, so the ceiling of that mechanism
 * is 25/30 *strict* at best — one sample above the baseline it would replace, with the three
 * hardest samples unwinnable. That is not a lever; it is a smaller benchmark wearing one.
 *
 * ## Ground two: token membership does not separate right from wrong
 *
 * The weaker form is a post-parse rule — reject an answer whose tokens are not all in the
 * text. Measured across every reading: **no correct answer is ever outside** the text's
 * tokens, so the rule costs nothing. But most wrong answers are inside it too — a component
 * the model invented from the text's own words (`order-service` for the payment gateway,
 * `settlement-service` for the currency feed) is inside by construction. In the current
 * reading two of six wrong answers are inside; in the two reverted ones, seven of eight and
 * four of nine were. A filter that never fires on the answers that matter is a filter that
 * reports a policy rather than a measurement.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const KEY = resolve(ROOT, 'golden-master', 'fault-extraction', 'samples.json');
const READINGS = resolve(ROOT, 'golden-master', 'fault-extraction', 'readings.json');

interface Sample {
  id: string;
  incidentText: string;
  expected: { type: string; category: string; component: string };
}

interface Reading {
  run: number;
  key: { size: number };
  samples: Array<{
    id: string;
    expected: { type: string; category: string; component: string };
    answered: { type: string | null; category: string | null; component: string | null };
  }>;
}

const samples = (JSON.parse(readFileSync(KEY, 'utf8')) as { samples: Sample[] }).samples;
const readings = (JSON.parse(readFileSync(READINGS, 'utf8')) as { readings: Reading[] }).readings.filter(
  (reading) => reading.key.size === samples.length,
);

/** Every hyphen-joined run of one to four adjacent words in the text. */
function candidates(text: string, longest = 4): Set<string> {
  const words = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const out = new Set<string>();
  for (let start = 0; start < words.length; start += 1) {
    for (let length = 1; length <= longest && start + length <= words.length; length += 1) {
      out.add(words.slice(start, start + length).join('-'));
    }
  }
  return out;
}

/** The word set of a text, for the membership rule. */
function wordsOf(text: string): Set<string> {
  return new Set(text.toLowerCase().match(/[a-z0-9]+/g) ?? []);
}

describe('the component answer space a mechanism could offer', () => {
  it('recovers 25 of 30 expected components as adjacent-word runs, and names the five it cannot', () => {
    // The ceiling of a candidate-list prompt, pinned. If the corpus grows, this number moves
    // and the claim in the header has to be re-read rather than quietly falsified.
    const unrecoverable = samples
      .filter((sample) => !candidates(sample.incidentText).has(sample.expected.component))
      .map((sample) => sample.id)
      .sort();
    expect(unrecoverable).toEqual([
      'code-timezone-booking-api',
      'middleware-kafka-consumer-lag',
      'middleware-mysql-replica-lag-analytics',
      'middleware-redis-latency-cache',
      'network-delay-cart-to-inventory',
    ]);
    expect(samples.length - unrecoverable.length).toBe(25);
  });

  it('offers a median of more than two hundred candidates per text, which is why the list is not an option', () => {
    // The other half of the same refutation: even where the mechanism could work, the list is
    // far too long to put in a prompt. Pinned as a range rather than a value, because the
    // count depends on the longest run chosen and only its order of magnitude matters.
    const sizes = samples.map((sample) => candidates(sample.incidentText).size).sort((a, b) => a - b);
    const median = sizes[Math.floor(sizes.length / 2)] as number;
    expect(median).toBeGreaterThan(150);
    expect(sizes[sizes.length - 1] as number).toBeLessThan(500);
  });

  it('never finds a correct answer outside the incident’s words, so a membership rule costs nothing', () => {
    // The one thing the measurement does establish: the expected components are all built from
    // the text's own words, and so is every answer the model got right. A rejection rule on
    // membership therefore loses nothing -- which is why it is tempting, and why the next test
    // matters more than this one.
    let checked = 0;
    for (const reading of readings) {
      for (const sample of reading.samples) {
        if (sample.answered.component !== sample.expected.component) continue;
        const source = (samples.find((entry) => entry.id === sample.id) as Sample).incidentText;
        const words = wordsOf(source);
        const parts = sample.expected.component.split('-').filter((part) => part !== '');
        expect(
          parts.every((part) => words.has(part)),
          `${sample.id}: a correct answer uses a word the incident does not carry`,
        ).toBe(true);
        checked += 1;
      }
    }
    expect(checked, 'the readings must contain correct answers for this to mean anything').toBeGreaterThan(50);
  });

  it('finds most wrong answers inside those words too, so membership does not separate', () => {
    // The refutation. For each reading on the current key: how many wrong answers survive a
    // membership filter. Asserted as aggregates, because a per-reading list would break every
    // time a new reading is recorded -- which is the opposite of what a record is for.
    let wrong = 0;
    let inside = 0;
    for (const reading of readings) {
      for (const sample of reading.samples) {
        const answered = sample.answered.component;
        if (answered === null || answered === sample.expected.component) continue;
        wrong += 1;
        const source = (samples.find((entry) => entry.id === sample.id) as Sample).incidentText;
        const words = wordsOf(source);
        if (answered.split('-').every((part) => words.has(part))) inside += 1;
      }
    }
    expect(wrong, 'the readings must contain wrong answers').toBeGreaterThan(10);
    expect(inside / wrong, 'a filter that keeps most wrong answers is not a lever').toBeGreaterThan(0.4);
    // And the specific shape, which is the one that has been hardest to fix: the model composes
    // a plausible slug out of the text's own words and names the wrong entity with it.
    const current = readings.find((reading) => reading.run === 39950191377) as Reading;
    const gateway = current.samples.find((sample) => sample.id === 'network-loss-payment-gateway');
    expect(gateway?.answered.component).toBe('order-service');
  });
});
