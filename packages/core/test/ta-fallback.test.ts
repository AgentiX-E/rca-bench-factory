import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exportAioPs2025 } from '../src/export/aiops2025.js';
import { oraclePrediction, readOfficialGroundTruth, scoreOfficial } from '../src/score/official.js';
import type { OfficialPrediction } from '../src/score/official.js';
import { CORPUS, MODELS, MINIMUM_MARGIN, classesOf, derive, leastBadThreshold, tokens } from '../../../scripts/probe-ta-fallback.mjs';
import { validBundle } from './fixtures.js';

/**
 * The AIOps2025 Type Accuracy fallback, decided by measurement instead of by
 * assertion.
 *
 * ## The clause and the twelve rounds it went unread
 *
 * > Type Accuracy (TA) is calculated via two-step matching: keyword detection
 * > against the ground-truth fault descriptions, with embedding-similarity
 * > fallback for unhit cases.
 *
 * The first step is implemented. The second was recorded as a gap in v3.x and
 * deferred every round after, on this argument: the paper names neither a model
 * nor a threshold, so implementing it means choosing both, and a threshold chosen
 * to match the paper's reported TA would be fitting the metric to its own result.
 *
 * That argument is correct and it is not an answer. It says do not fit the number.
 * It does not say the question is undecidable. `scripts/probe-ta-fallback.mjs`
 * decides it, and this file holds the decision to the numbers: the classes are
 * recomputed from the corpus, the published measurements are compared against the
 * recomputation, and the verdict has to follow from the measurement rather than
 * from the sentence recording it.
 *
 * ## What the measurement is allowed to choose from
 *
 * Four gates narrow the candidate space before any similarity is computed, and all
 * four are already in this tree: no network at gate time, no vendored weights
 * (`check-no-vendored-data.mjs`), no secrets, and the same number on every machine
 * (`verify-scorer-stability.mjs`). A hosted embedding API fails the first and the
 * third, a neural embedding fails the second, and what is left is a surface model:
 * a deterministic function of the two strings with nothing to download.
 *
 * So the question is not "is our model good" but "is a surface model enough". Five
 * of them are measured, and the answer is no for all five.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

interface Pair {
  readonly id: string;
  readonly description: string;
  readonly paraphrase: string;
}

interface Spread {
  readonly count: number;
  readonly min: number;
  readonly max: number;
  readonly mean: number;
}

interface ModelRow {
  readonly id: string;
  readonly verbatim: Spread;
  readonly paraphrase: Spread;
  readonly distractor: Spread;
  readonly gap: number;
  readonly separates: boolean;
  readonly threshold: number | null;
  readonly fitted: { threshold: number; errors: number; falseRefusals: number; falseCredits: number };
  readonly guard: number;
}

interface Corpus {
  readonly schema: string;
  readonly takenAt: string;
  readonly question: string;
  readonly clause: string;
  readonly permitted: string;
  readonly decisionRule: string;
  readonly marginWhy: string;
  readonly distractorMethod: string;
  readonly pairs: readonly Pair[];
  readonly guard: { reason: string; note: string };
  readonly models: readonly ModelRow[];
  readonly verdict: {
    shipped: boolean;
    separatingModels: readonly string[];
    bestModel: string;
    bestGap: number;
    shortfall: number;
    reason: string;
  };
}

const CORPUS_FILE = JSON.parse(readFileSync(CORPUS, 'utf8')) as Corpus;

function row(id: string): ModelRow {
  const found = CORPUS_FILE.models.find((model) => model.id === id);
  if (found === undefined) throw new Error(`no model row '${id}'`);
  return found;
}

/** The probe's model list, typed once so the casts do not appear inside assertions. */
const MODEL_LIST = MODELS as { id: string; similarity: (a: string, b: string) => number }[];

function similarityOf(id: string): (a: string, b: string) => number {
  const found = MODEL_LIST.find((model) => model.id === id);
  if (found === undefined) throw new Error(`no model '${id}'`);
  return found.similarity;
}

/** An AIOps2025 export whose one case carries `description` as its fault description. */
function filesFor(description: string): Record<string, string> {
  const files = exportAioPs2025(validBundle()).files;
  const line = JSON.parse(files['groundtruth.jsonl']!.trim());
  files['groundtruth.jsonl'] = `${JSON.stringify({ ...line, fault_description: description })}\n`;
  return files;
}

function oracleFor(files: Record<string, string>): OfficialPrediction {
  return oraclePrediction(readOfficialGroundTruth('aiops2025', files)[0]!);
}

/** Type Accuracy for one reason against one key. */
function scoreOf(files: Record<string, string>, oracle: OfficialPrediction, reason: string): number {
  return scoreOfficial('aiops2025', files, [{ ...oracle, reason }]).breakdown.ta;
}

describe('the AIOps2025 embedding fallback', () => {
  it('names the five models it measured, so a sixth has to be argued for', () => {
    // The family, not a guess: four n-gram widths and one set-overlap model. The
    // ids are asserted in order because "we tried a model and it failed" is a
    // weaker finding than "the family fails", and the family is only a family if a
    // reader can see it whole.
    expect(CORPUS_FILE.models.map((model) => model.id)).toEqual([
      'char-2gram-cosine',
      'char-3gram-cosine',
      'char-4gram-cosine',
      'char-5gram-cosine',
      'token-dice',
    ]);
    expect(MODELS.map((model: { id: string }) => model.id)).toEqual(CORPUS_FILE.models.map((model) => model.id));
  });

  it('recomputes every published number from the pairs', () => {
    // The corpus is data in and numbers out; this is the derivation re-run. A
    // hand-edited figure, or a model whose implementation drifted from the one
    // that produced the file, disagrees here.
    const derived = derive(CORPUS_FILE);
    expect(derived.models).toEqual(CORPUS_FILE.models);
    expect(derived.verdict).toEqual(CORPUS_FILE.verdict);
  });

  it('keeps the positive class a paraphrase and not an echo', () => {
    // A paraphrase that reuses a word of its description is not the case the
    // fallback exists for -- keyword detection already pays that one -- so the
    // overlap is checked, and checked *behaviourally* rather than against a word
    // list: every word the two sentences share is fed to the shipped rule on its
    // own, and the rule has to refuse it. That way this assertion cannot drift from
    // the definition of a keyword, because it is the definition.
    for (const pair of CORPUS_FILE.pairs) {
      const files = filesFor(pair.description);
      const oracle = oracleFor(files);
      const description = new Set(tokens(pair.description));
      const shared = [...new Set<string>(tokens(pair.paraphrase).filter((token: string) => description.has(token)))];
      expect(shared, pair.id).not.toEqual([]);
      for (const word of shared) {
        expect(scoreOf(files, oracle, word), `${pair.id}: '${word}' is a keyword after all`).toBe(0);
      }
    }
  });

  it('takes its negatives from the cross product rather than from a list', () => {
    // Ninety measurements from ten pairs. The count is asserted because a
    // hand-picked negative class is where this kind of probe cheats: it is trivial
    // to find ten sentences that share nothing with a description, and impossible
    // to do it ninety times without covering the fault table.
    expect(CORPUS_FILE.pairs.length).toBe(10);
    for (const model of MODEL_LIST) {
      const classes = classesOf(CORPUS_FILE.pairs, model.similarity);
      expect(classes.distractor.length, model.id).toBe(90);
      expect(classes.verbatim.length, model.id).toBe(10);
      expect(classes.paraphrase.length, model.id).toBe(10);
    }
  });

  it('finds that no surface model separates the two classes', () => {
    // The verdict, and the reason it is not a matter of degree: a single threshold
    // has to sit above every distractor and below every paraphrase at once, and for
    // every model the highest distractor is above the lowest paraphrase. The gap is
    // negative, which is a stronger statement than "the model scored badly".
    expect(CORPUS_FILE.verdict.shipped).toBe(false);
    expect(CORPUS_FILE.verdict.separatingModels).toEqual([]);
    for (const model of CORPUS_FILE.models) {
      expect(model.separates, model.id).toBe(false);
      expect(model.gap, model.id).toBeLessThan(0);
      expect(model.threshold, model.id).toBeNull();
      // The lowest paraphrase is *below* the highest distractor, quoted as the two
      // numbers rather than as the sign of their difference.
      expect(model.paraphrase.min, model.id).toBeLessThan(model.distractor.max);
    }
  });

  it('reports what the least bad threshold costs, rather than only that it is wrong', () => {
    // Overlap proves no threshold is right. It does not say how wrong the best one
    // is, and the difference matters to a reader deciding whether to argue for a
    // better model or for a better rule. Every model misclassifies at least one
    // pair, and the errors come from both directions.
    for (const model of CORPUS_FILE.models) {
      const classes = classesOf(CORPUS_FILE.pairs, similarityOf(model.id));
      const recomputed = leastBadThreshold(classes.paraphrase, classes.distractor);
      expect(model.fitted, model.id).toEqual(recomputed);
      expect(model.fitted.errors, model.id).toBeGreaterThan(0);
      expect(model.fitted.falseRefusals + model.fitted.falseCredits, model.id).toBe(model.fitted.errors);
    }
    // The best of the five, stated as a number: ten of a hundred pairs wrong, eight
    // of them refusals of a true paraphrase.
    expect(row('token-dice').fitted).toEqual({ threshold: 0.267, errors: 10, falseRefusals: 8, falseCredits: 2 });
  });

  it('keeps the scorer susceptible to the mutation a fallback could hide', () => {
    // The guard is the string `mutatePrediction` substitutes for a reason. If a
    // model scored it highly, turning the fallback on would make Type Accuracy
    // unfailable -- and `runOfficialRegression` would then report that mutating
    // `reason` no longer lowers the score, which is the failure this probe has to
    // stay compatible with rather than route around.
    //
    // One model does clear the floor of its own paraphrases, and it is recorded
    // rather than excluded: the coarsest n-gram cannot tell the mutation from a
    // paraphrase, so shipping *it* would make the term unfailable. A reader who
    // later argues for a 2-gram fallback is arguing for that.
    const aboveFloor = CORPUS_FILE.models
      .filter((model) => model.guard >= model.paraphrase.min)
      .map((model) => model.id);
    expect(aboveFloor).toEqual(['char-2gram-cosine']);
    expect(row('char-2gram-cosine').guard).toBe(0.202);
    expect(CORPUS_FILE.guard.reason).toBe('unrelated-candidate');
  });

  it('states the rule it decided by, before the numbers', () => {
    // A decision rule that can be read after the measurement is not a rule. The
    // margin is a judgement -- 0.05 -- and it is published as one, with the reason
    // it is not smaller.
    expect(CORPUS_FILE.decisionRule).toContain('0.05');
    expect(CORPUS_FILE.marginWhy.length).toBeGreaterThan(80);
    expect(MINIMUM_MARGIN).toBe(0.05);
    // The shortfall is how far the best model is from the bar, as a positive
    // number, so a reader who assumes it is small can see that it is not.
    expect(CORPUS_FILE.verdict.shortfall).toBeGreaterThan(0.1);
  });

  /**
   * The cost of the gap, measured on the shipped rule rather than described.
   *
   * `paraphrase` is a reason that names the fault and shares none of its words.
   * The scorer pays it nothing, and the table above says no surface model would
   * have paid it either -- so this is not a defect the next round can fix, it is
   * the boundary of what a model with no weights can do. Pinned as a test because
   * a gap recorded only in prose cannot go red when someone closes it by accident.
   */
  it('scores a paraphrase at zero, which is the cost of the gap', () => {
    for (const pair of CORPUS_FILE.pairs) {
      const files = filesFor(pair.description);
      const oracle = oracleFor(files);
      expect(scoreOf(files, oracle, pair.paraphrase), pair.id).toBe(0);
      // Control: the description itself always hits, so the zero above is a fact
      // about the paraphrase and not about a key nothing could match.
      expect(scoreOf(files, oracle, pair.description), pair.id).toBe(1);
    }
  });

  it('records who measured it and when, so the verdict can be dated', () => {
    expect(CORPUS_FILE.schema).toBe('rca-bench-factory/ta-fallback@1');
    expect(CORPUS_FILE.takenAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(CORPUS_FILE.clause).toContain('embedding-similarity fallback');
    expect(CORPUS_FILE.permitted).toContain('check-no-vendored-data.mjs');
    expect(CORPUS_FILE.distractorMethod).toContain('cross product');
    // The reason is a sentence with the two numbers in it, not a shrug.
    expect(CORPUS_FILE.verdict.reason).toContain(String(row('char-5gram-cosine').distractor.max));
    expect(CORPUS_FILE.verdict.reason.length).toBeGreaterThan(200);
  });
});
