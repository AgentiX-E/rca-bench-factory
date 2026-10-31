/**
 * What makes a string a sentence rather than a label.
 *
 * Two guards ask an author for prose -- a note on a parameter nothing cites
 * (finding 326) and a case's reason for having no ranking reading -- and both
 * need the same answer to "is this a sentence or a noun phrase with a full stop
 * bolted on". The answer lives here so the two cannot disagree about it, which
 * is the failure this repository keeps finding in the other direction: one
 * sentence in two files, drifting one edit at a time.
 *
 * The two properties are crude on purpose. A guard can check that prose is long
 * enough to contain a claim and ends where a claim ends; it cannot check that the
 * claim is true. Anything finer -- sentiment, grammar, a model's opinion -- would
 * be a judgement reported as a measurement.
 */

/**
 * How short a piece of authored prose may be before it is a label.
 *
 * Not a measure of quality. It is the length below which a string cannot say
 * *what* a thing is for *and* why nothing else speaks for it: `the container` and
 * `config` are the shapes this floor refuses, and every sentence the shipped
 * corpus carries clears it by a factor of two.
 */
export const MIN_SENTENCE_LENGTH = 40;

/** Whether `value` has the two properties a guard can check about a sentence. */
export function looksLikeSentence(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length >= MIN_SENTENCE_LENGTH && trimmed.endsWith('.');
}
