#!/usr/bin/env node
/**
 * Whether the protocol's embedding-similarity fallback can be honoured by a model
 * this repository is allowed to ship.
 *
 * ## The clause
 *
 * AIOps2025's Type Accuracy is described in two steps:
 *
 * > Type Accuracy (TA) ... via two-step matching: keyword detection against the
 * > ground-truth fault descriptions, with embedding-similarity fallback for unhit
 * > cases.
 *
 * The first step is implemented in `packages/core/src/score/official.ts`. The
 * second has been recorded as a gap for twelve rounds, on the argument that the
 * paper names neither a model nor a threshold, so implementing it means choosing
 * both -- and a choice made to match the paper's reported TA would be fitting the
 * metric to its own result.
 *
 * That argument is sound and it is not an answer. It says *do not fit the number*;
 * it does not say *do not look*. This script looks: it asks whether **any** model
 * the repository is permitted to ship separates the case the fallback exists for
 * from the case it must refuse.
 *
 * ## What "permitted to ship" means here
 *
 * Four gates decide it, and all four are already in the tree: no network at gate
 * time, no vendored corpus (`check-no-vendored-data.mjs` refuses anything over
 * 1 MiB of data), no secrets (`check-no-secrets.mjs`), and the same input must
 * produce the same number on every machine (`verify-scorer-stability.mjs`). A
 * neural embedding needs weights of tens of megabytes and therefore fails the
 * second; a hosted embedding API fails the first and the third.
 *
 * What survives all four is a **surface model**: it is a function of the two
 * strings alone, has no weights, and is deterministic to the last bit. So the
 * question this probe can answer is: *is a surface model enough?* If it is, the
 * gap closes here. If it is not, the gap is not an omission that more work would
 * remove -- it is a boundary, and where the boundary lies is a measurement.
 *
 * ## The decision rule, fixed before the measurement
 *
 * A model ships only if a threshold exists that
 *
 *  1. admits **every** paraphrase -- a reason that names the same fault without
 *     using a single content word of its description -- and
 *  2. refuses **every** distractor -- a reason that names a *different* fault from
 *     the same table -- and
 *  3. leaves a margin of at least **0.05**, and
 *
 * the threshold would then be the midpoint of that margin, because the midpoint is
 * the only value that does not encode a preference between the two errors.
 *
 * The 0.05 is a judgement and it is stated as one: at three decimal places a
 * cosine whose classes sit 0.05 apart is separated by noise in the tokeniser -- an
 * added stop word, a plural, a hyphen -- rather than by meaning. A model that
 * needs a margin thinner than that is not measuring paraphrase, it is measuring
 * which of two sentences happens to share a syllable.
 *
 * ## The distractor class is derived, not listed
 *
 * Positives have to be written by hand: a paraphrase is the thing being tested
 * for. Negatives do not, and a hand-picked negative class is where a probe like
 * this one cheats -- it is trivial to find ten sentences that share nothing with a
 * description. So the negatives are the **cross product**: for each pair, every
 * *other* pair's paraphrase, scored against this pair's description. Ten pairs
 * give ninety distractor measurements, none of them chosen, and the rule "a reason
 * that describes fault A must not be credited to fault B" is exactly the rule the
 * fallback would have to honour.
 *
 * ## What it found
 *
 * Five surface models, none separates. The best of them misses by the width of a
 * whole class: its highest-scoring distractor sits **above** its lowest-scoring
 * paraphrase, so every threshold either refuses a paraphrase or credits a
 * description of a different fault. See `golden-master/ta-fallback.json` for the
 * numbers, and `docs/targets/aiops2025.md` for the consequence.
 *
 *   node scripts/probe-ta-fallback.mjs          # rewrite the measurements
 *
 * The script has no exit site and no throw: its verdict is data, and the reader
 * that decides whether the data is still true is
 * `packages/core/test/ta-fallback.test.ts`, which recomputes every number from the
 * pairs and fails when the file and the code disagree.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO = resolve(HERE, '..');
export const CORPUS = resolve(REPO, 'golden-master', 'ta-fallback.json');

/** A margin narrower than this is tokeniser noise rather than meaning. */
export const MINIMUM_MARGIN = 0.05;

/** The words either side of a comparison is cut into. */
function tokens(text) {
  return text.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token !== '');
}

/**
 * Character n-gram frequency vectors, compared by cosine.
 *
 * No function-word filter, deliberately: the scorer has a closed-class list and
 * this probe does not borrow it. Borrowing it would make the measurement depend on
 * a table that is itself under test, and dropping `the` is the single change most
 * likely to make two unrelated sentences look different from each other -- which is
 * the direction that flatters the model.
 */
function cosineOfGrams(a, b, n) {
  const grams = (text) => {
    const joined = ` ${tokens(text).join(' ')} `;
    const counts = new Map();
    for (let i = 0; i + n <= joined.length; i += 1) {
      const gram = joined.slice(i, i + n);
      counts.set(gram, (counts.get(gram) ?? 0) + 1);
    }
    return counts;
  };
  const left = grams(a);
  const right = grams(b);
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (const [gram, count] of left) {
    leftNorm += count * count;
    const other = right.get(gram);
    if (other !== undefined) dot += count * other;
  }
  for (const count of right.values()) rightNorm += count * count;
  const denominator = Math.sqrt(leftNorm * rightNorm);
  return denominator === 0 ? 0 : dot / denominator;
}

/** Dice over the sets of words, the one model that is not an n-gram model. */
function diceOfTokens(a, b) {
  const left = new Set(tokens(a));
  const right = new Set(tokens(b));
  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;
  return (2 * shared) / (left.size + right.size || 1);
}

/**
 * The models, named.
 *
 * `id` is what the corpus and the docs quote. The four n-gram widths are not four
 * guesses at a good number -- they are the whole family a surface model has, and
 * reporting four of them is what stops the finding from being "our one model was
 * badly chosen".
 */
export const MODELS = [
  { id: 'char-2gram-cosine', similarity: (a, b) => cosineOfGrams(a, b, 2) },
  { id: 'char-3gram-cosine', similarity: (a, b) => cosineOfGrams(a, b, 3) },
  { id: 'char-4gram-cosine', similarity: (a, b) => cosineOfGrams(a, b, 4) },
  { id: 'char-5gram-cosine', similarity: (a, b) => cosineOfGrams(a, b, 5) },
  { id: 'token-dice', similarity: diceOfTokens },
];

function round(value) {
  return Math.round(value * 1000) / 1000;
}

/** The three classes, as a list of measurements per class. */
export function classesOf(pairs, similarity) {
  const verbatim = pairs.map((pair) => similarity(pair.description, pair.description));
  const paraphrase = pairs.map((pair) => similarity(pair.description, pair.paraphrase));
  const distractor = [];
  for (const [i, pair] of pairs.entries()) {
    for (const [j, other] of pairs.entries()) {
      if (i === j) continue;
      distractor.push(similarity(pair.description, other.paraphrase));
    }
  }
  return { verbatim, paraphrase, distractor };
}

function spread(values) {
  return {
    count: values.length,
    min: round(Math.min(...values)),
    max: round(Math.max(...values)),
    mean: round(values.reduce((sum, value) => sum + value, 0) / values.length),
  };
}

/**
 * One model's row: the spread of each class, the gap between the two that decide,
 * and whether that gap clears `MINIMUM_MARGIN`.
 *
 * The gap is `min(paraphrase) - max(distractor)`, because a single threshold has to
 * sit above every distractor and below every paraphrase at once. A negative gap
 * means the two classes overlap and **no** threshold exists, which is a stronger
 * statement than "the model performed poorly".
 *
 * `fitted` is the same question asked the other way. Overlap proves no threshold is
 * correct, and it does not say how wrong the best one is -- so this sweeps every
 * threshold the data can distinguish and reports the least-bad one with its two
 * error counts. If a model were shippable-but-imperfect the number to argue about
 * would be this one, and reporting it is what keeps "no threshold separates" from
 * being a claim nobody can check against a cost.
 */
export function measure(pairs, model) {
  const classes = classesOf(pairs, model.similarity);
  const paraphrase = spread(classes.paraphrase);
  const distractor = spread(classes.distractor);
  const gap = round(paraphrase.min - distractor.max);
  return {
    id: model.id,
    verbatim: spread(classes.verbatim),
    paraphrase,
    distractor,
    gap,
    separates: gap >= MINIMUM_MARGIN,
    threshold: gap >= MINIMUM_MARGIN ? round((paraphrase.min + distractor.max) / 2) : null,
    fitted: leastBadThreshold(classes.paraphrase, classes.distractor),
    guard: round(model.similarity(pairs[0].description, 'unrelated-candidate')),
  };
}

/**
 * The threshold that minimises total errors, and what it costs on each side.
 *
 * Candidates are the observed values rather than a grid: a cosine takes finitely
 * many values on a finite table, and the only thresholds that differ in behaviour
 * are the ones that sit between two of them. `> =` decides the credit side, so a
 * candidate exactly equal to a paraphrase admits it.
 */
export function leastBadThreshold(paraphrase, distractor) {
  const candidates = [...new Set([...paraphrase, ...distractor])].sort((a, b) => a - b);
  let best = null;
  for (const candidate of candidates) {
    const falseRefusals = paraphrase.filter((value) => value < candidate).length;
    const falseCredits = distractor.filter((value) => value >= candidate).length;
    const errors = falseRefusals + falseCredits;
    if (best === null || errors < best.errors) {
      best = { threshold: round(candidate), errors, falseRefusals, falseCredits };
    }
  }
  return best;
}

/** The whole derived block, from the pairs in the corpus to the verdict. */
export function derive(corpus) {
  const pairs = corpus.pairs;
  const models = MODELS.map((model) => measure(pairs, model));
  const separating = models.filter((model) => model.separates);
  const best = models.reduce((champion, model) => (model.gap > champion.gap ? model : champion), models[0]);
  return {
    models,
    verdict: {
      shipped: separating.length > 0,
      separatingModels: separating.map((model) => model.id),
      bestModel: best.id,
      bestGap: best.gap,
      // How far the best surface model is from the bar, as a positive number: a
      // reader who assumes the shortfall is small can see that it is not.
      shortfall: round(MINIMUM_MARGIN - best.gap),
      reason:
        separating.length > 0
          ? `a threshold separates the classes for ${separating.map((model) => model.id).join(', ')}`
          : `no surface model separates the classes: the highest-scoring distractor for ${best.id} scores ${best.distractor.max}, above the lowest-scoring paraphrase at ${best.paraphrase.min}, so every threshold either refuses a paraphrase or credits a description of a different fault`,
    },
  };
}

/** The file as it would be written, with the derived block replaced. */
export function rewrite(corpus) {
  const derived = derive(corpus);
  return { ...corpus, models: derived.models, verdict: derived.verdict };
}

function readCorpus() {
  return JSON.parse(readFileSync(CORPUS, 'utf8'));
}

function main() {
  const corpus = readCorpus();
  const next = rewrite(corpus);
  writeFileSync(CORPUS, `${JSON.stringify(next, null, 2)}\n`);
  const { verdict, models } = next;
  for (const model of models) {
    process.stdout.write(
      `${model.id.padEnd(18)} verbatim ${model.verbatim.min.toFixed(3)}  ` +
        `paraphrase ${model.paraphrase.min.toFixed(3)}-${model.paraphrase.max.toFixed(3)}  ` +
        `distractor ${model.distractor.min.toFixed(3)}-${model.distractor.max.toFixed(3)}  ` +
        `gap ${model.gap.toFixed(3)}  ${model.separates ? 'SEPARATES' : 'overlap'}\n`,
    );
  }
  process.stdout.write(`verdict: shipped=${verdict.shipped} best=${verdict.bestModel} gap=${verdict.bestGap}\n`);
}

if (process.argv[1] !== undefined && import.meta.url.endsWith(process.argv[1].replace(`${REPO}/`, ''))) {
  main();
}

export { readCorpus, tokens };
