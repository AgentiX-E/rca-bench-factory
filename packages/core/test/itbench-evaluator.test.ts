import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  OFFICIAL_METRICS,
  readOfficialGroundTruth,
  scoreOfficial,
  type OfficialPrediction,
} from '../src/score/official.js';

/**
 * ITBench's SRE diagnosis, replayed against the sentences of its protocol.
 *
 * ## Why this file exists
 *
 * The metric used to be called `itbench-pass-at-1`, and it was not pass@1.
 * arXiv 2502.05352 defines pass@1 in one parenthesis -- "identifying the cause as
 * mentioned in ground truth" -- and Table 3 lists it beside Fault Localization and
 * Fault Propagation Chain as **four separate metrics** for the diagnosis task. The
 * rule here required the cause *and* the propagation chain *and* the fault
 * conditions, so a submission that named the right cause and nothing else was
 * reported as a pass@1 failure.
 *
 * Measured on the eight cases in `golden-master/itbench-evaluator.json`: **three
 * disagreed, every one in the same direction** -- the paper calls them a pass and
 * the rule called them a failure. A one-directional error is the worse kind: it
 * does not cancel into noise, it makes every number this product reports for the
 * target an understatement that reads as a weak model. It is also the third time
 * the same defect has been found (Cloud-OpsBench in finding 182, AIOps2025's
 * endpoint in finding 184), which is why the corpus asserts the *direction* rather
 * than only the agreement.
 *
 * ## What cannot be replayed, and why that is a fact rather than a delay
 *
 * NTAM -- fault localisation and fault propagation chain -- is a topology-aware
 * distance whose components "have corresponding hyper-parameters that can be
 * tuned". The paper does not publish the values, so computing NTAM means choosing
 * them, and choosing them to reproduce a published table would fit the metric to
 * its own result. That is recorded in the corpus and on the census row; it is not
 * a task waiting for an implementer.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

interface Case {
  id: string;
  why: string;
  prediction: { component: string; chain: string[]; evidence: string[] };
  groundTruth: { component: string; chain: string[]; evidence: string[] };
  published: { passAt1: number };
  strict: number;
  oldRule: { passAt1: number };
  scoredFacets: string[];
}

interface Corpus {
  schema: string;
  target: string;
  takenAt: string;
  upstream: {
    kind: string;
    repository: string;
    version: string;
    url: string;
    bytes: number;
    sha256: string;
    retrievedAt: string;
    extraction: string;
    releasedCode: string;
  };
  clauses: Array<{ id: string; quote: string; why: string }>;
  metricSet: string[];
  implemented: string[];
  notImplemented: Array<{ metric: string; why: string }>;
  cases: Case[];
}

const CORPUS = JSON.parse(
  readFileSync(resolve(ROOT, 'golden-master', 'itbench-evaluator.json'), 'utf8'),
) as Corpus;

const clause = (id: string): string => {
  const found = CORPUS.clauses.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`the corpus lost the '${id}' clause`);
  return found.quote;
};

/** The answer key the reader consumes, built from one corpus case. */
function scenarioFile(entry: Case): string {
  const { component, chain, evidence } = entry.groundTruth;
  return JSON.stringify({
    scenario_name: entry.id,
    scenario_description: entry.why,
    scenario_domain: 'SRE',
    scenario_class: 'HighCPU',
    scenario_complexity: 'medium',
    scenario_groundtruth: {
      diagnosis: {
        entities: [component, ...chain.map((token) => token.split('->')[1]!)],
        fault_propagation_chain: chain.map((token, index) => ({
          step: index + 1,
          from_entity: token.split('->')[0]!,
          to_entity: token.split('->')[1]!,
          mechanism: 'propagated downstream',
        })),
        fault_conditions: evidence.map((signal, index) => ({
          checkpoint_id: `cp-${String(index + 1)}`,
          entity: component,
          signal_ref: signal,
          comparator: '>',
          value: 90,
          unit: '%',
          description: `${signal} above threshold`,
        })),
      },
    },
  });
}

function exportFiles(): Record<string, string> {
  const files: Record<string, string> = {};
  for (const entry of CORPUS.cases) {
    files[`scenarios/${entry.id}/scenario.json`] = scenarioFile(entry);
  }
  return files;
}

/** The corpus case a case id belongs to. */
function entryFor(caseId: string): Case {
  const found = CORPUS.cases.find((entry) => entry.id === caseId);
  if (found === undefined) throw new Error(`the export produced a case the corpus does not have: ${caseId}`);
  return found;
}

/**
 * The predictions, **in the order the reader produces the cases**.
 *
 * `readOfficialGroundTruth` walks the file map in sorted path order, so a
 * prediction array built in corpus order is paired with a different answer key --
 * and every case then scores against somebody else's ground truth. That is how
 * this test first failed: `wrong-cause-right-rest` came back at 0 because its
 * prediction had been matched with the case five rows away.
 */
function predictions(): { order: string[]; values: OfficialPrediction[] } {
  const groundTruth = readOfficialGroundTruth('itbench', exportFiles());
  const order = groundTruth.map((entry) => entry.caseId);
  const values = order.map((caseId) => {
    const entry = entryFor(caseId);
    return {
      component: entry.prediction.component,
      faultType: '',
      reason: '',
      occurredAt: '',
      ranks: [],
      chain: entry.prediction.chain,
      evidence: entry.prediction.evidence,
      traceWords: 0,
    } satisfies OfficialPrediction;
  });
  return { order, values };
}

const report = (): ReturnType<typeof scoreOfficial> => scoreOfficial('itbench', exportFiles(), predictions().values);

describe('the corpus is pinned to the paper, not to a memory of it', () => {
  it('names the artifact by digest, version and retrieval date', () => {
    expect(CORPUS.schema).toBe('rca-bench-prose-evaluator/1');
    expect(CORPUS.target).toBe('itbench');
    expect(CORPUS.upstream.repository).toBe('arXiv:2502.05352');
    expect(CORPUS.upstream.version).toBe('v1');
    expect(CORPUS.upstream.bytes).toBe(4_068_098);
    expect(CORPUS.upstream.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(CORPUS.upstream.retrievedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // The extraction method is part of the evidence: `-layout` reproduces the
    // two-column grid, so a sentence spanning the column break comes out
    // interleaved and the quotes stop being verbatim. Recording *how* the quotes
    // were taken is what lets the next reader reproduce them.
    expect(CORPUS.upstream.extraction).toContain('-layout');
    expect(CORPUS.upstream.releasedCode.length).toBeGreaterThan(60);
  });

  it('quotes six clauses, each with an argument, and the pass@1 one is the metric’s own quote', () => {
    expect(CORPUS.clauses).toHaveLength(6);
    for (const entry of CORPUS.clauses) {
      expect(entry.quote.length, `${entry.id} quotes nothing`).toBeGreaterThan(60);
      expect(entry.why.length, `${entry.id} argues nothing`).toBeGreaterThan(60);
    }
    // The registry's quote and the corpus's clause are one string, held together
    // here rather than by a habit: shortening the quote to the half that reads
    // like a single metric is what hid the three-metric sentence in the first
    // place.
    expect(OFFICIAL_METRICS.itbench.quote).toBe(clause('pass-at-1-is-the-cause'));
    expect(OFFICIAL_METRICS.itbench.quote).toContain('and time to diagnosis');
    expect(OFFICIAL_METRICS.itbench.quote).toContain('NTAM');
  });
});

describe('the metric names what it computes', () => {
  it('does not borrow the name of a published metric it does not implement', () => {
    // The four names the paper publishes for this task, from Table 3. This
    // repository's rule is a strict conjunction of the export's facets, which is
    // none of them: pass@1 is the cause alone, and FL and FPC are a distance the
    // paper leaves tunable. Renaming the metric back to any of them fails here.
    expect(CORPUS.metricSet).toEqual([
      'pass@1',
      'Fault Localization (NTAM)',
      'Fault Propagation Chain (NTAM)',
      'Mean Time to Diagnosis',
    ]);
    expect(CORPUS.implemented).toEqual(['pass@1']);
    expect(CORPUS.metricSet).not.toContain(OFFICIAL_METRICS.itbench.id);
    expect(OFFICIAL_METRICS.itbench.id).toBe('itbench-diagnosis-strict');
    // And the one it *does* implement is a separate, declared gap when absent.
    expect(CORPUS.notImplemented.map((entry) => entry.metric)).toEqual([
      'Fault Localization (NTAM)',
      'Fault Propagation Chain (NTAM)',
    ]);
    for (const entry of CORPUS.notImplemented) {
      expect(entry.why.length, `${entry.metric} has no reason`).toBeGreaterThan(40);
    }
  });

  it('carries the derived label, because the number it reports is nobody else’s', () => {
    expect(OFFICIAL_METRICS.itbench.provenance).toBe('derived');
    expect(OFFICIAL_METRICS.itbench.formula).toContain('pass@1 (root cause only) is reported beside it');
  });
});

describe('the eight cases replay, and the three the old rule got wrong stay named', () => {
  it('scores each case exactly as the corpus recorded it', () => {
    const scored = report();
    // By case id, never by position: the report's order is the reader's, and a
    // positional pairing hides a mis-alignment behind two errors that cancel.
    const observed = new Map(
      scored.cases.map((entry) => [
        entry.caseId,
        { passAt1: entry.terms?.['passAt1'], strict: Math.round(entry.score * 1e6) / 1e6 },
      ]),
    );
    expect([...observed.keys()].sort()).toEqual(CORPUS.cases.map((entry) => entry.id).sort());
    for (const entry of CORPUS.cases) {
      expect(observed.get(entry.id)?.passAt1, `${entry.id}: pass@1`).toBe(entry.published.passAt1);
      expect(observed.get(entry.id)?.strict, `${entry.id}: strict`).toBe(entry.strict);
      // A key that declares nothing scores nothing: `scoredFacets` is empty and
      // both numbers are 0. Every other case has to offer at least one facet, or
      // the strict ratio would be a division by a denominator nobody checked.
      if (entry.id === 'empty-key-empty-answer') {
        expect(entry.scoredFacets).toEqual([]);
        expect(entry.strict).toBe(0);
        continue;
      }
      expect(entry.scoredFacets.length, `${entry.id} scores no facet`).toBeGreaterThan(0);
    }
  });

  it('disagrees with the old rule on the three cases it named, and only those', () => {
    // The measurement, kept as data: the set of cases where the previous rule's
    // `passAt1` differed from the published one. A rule that starts failing the
    // cases the paper passes -- or starts passing the ones it fails -- changes
    // this set, and the set is also asserted to be one-directional.
    const disagreeing = CORPUS.cases
      .filter((entry) => entry.published.passAt1 !== entry.oldRule.passAt1)
      .map((entry) => entry.id);
    expect(disagreeing).toEqual(['cause-only', 'cause-and-chain', 'cause-right-chain-wrong']);

    const backwards = CORPUS.cases
      .filter((entry) => entry.oldRule.passAt1 > entry.published.passAt1)
      .map((entry) => entry.id);
    expect(
      backwards,
      'the old rule called a case a failure the paper calls a pass, or the reverse -- one of these ' +
        'is a widening, and this target has only ever been too strict',
    ).toEqual([]);
  });

  it('reports pass@1 and the strict conjunction as different numbers for the same run', () => {
    const scored = report();
    // Five of nine cases identify the cause; two reproduce every scored facet.
    // If these two were one number, the report would again be publishing one
    // quantity under another's name.
    expect(scored.breakdown['passAt1']).toBe(0.56);
    expect(scored.breakdown['strict']).toBe(0.22);
    expect(scored.final).toBe(22);
    expect(scored.cases.filter((entry) => entry.terms?.['passAt1'] === 1)).toHaveLength(5);
    expect(scored.cases.filter((entry) => entry.terms?.['allMatch'] === 1)).toHaveLength(2);
  });

  it('reads the cause from the head of the chain, and from the entity list when there is none', () => {
    // The reader's fallback is what makes `key-with-no-chain` scoreable at all: a
    // key with no propagation chain still names a root cause, and a submission
    // that names it correctly is a pass@1.
    const groundTruth = readOfficialGroundTruth('itbench', exportFiles());
    const withChain = groundTruth.find((entry) => entry.caseId === 'oracle')!;
    const withoutChain = groundTruth.find((entry) => entry.caseId === 'key-with-no-chain')!;
    expect(withChain.component).toBe('service:default/order');
    expect(withChain.chain).toEqual(['service:default/order->service:default/cart']);
    expect(withoutChain.chain).toEqual([]);
    expect(withoutChain.component).toBe('service:default/order');
  });

  it('gives no point to a key and an answer that both name nothing', () => {
    // Two empty strings are equal, which is how an export of empty answer keys can
    // report a perfect pass@1 -- the same defect Cloud-OpsBench's evaluator has,
    // and the one this repository *declares* as a difference rather than copying.
    // The guard is `gt.component !== ''`; without it this case scores 1.
    const scored = report().cases.find((entry) => entry.caseId === 'empty-key-empty-answer')!;
    expect(scored.terms?.['passAt1']).toBe(0);
    expect(scored.score).toBe(0);
    expect(scored.facets).toEqual([]);
  });

  it('keeps a wrong cause out of pass@1 however complete the rest of the answer is', () => {
    // `wrong-cause-right-rest` names the chain and the conditions correctly and the
    // cause wrongly. That is a pass on the conjunction's other two facets and a
    // failure of pass@1, and the two numbers have to separate -- otherwise this
    // target scores an answer that identified the wrong component as half right.
    const entry = CORPUS.cases.find((c) => c.id === 'wrong-cause-right-rest')!;
    const scored = report().cases.find((c) => c.caseId === entry.id)!;
    expect(scored.terms?.['passAt1']).toBe(0);
    expect(Math.round(scored.score * 1e6) / 1e6).toBe(entry.strict);
    expect(entry.strict).toBeGreaterThan(0.5);
  });
});
