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
 * OpenRCA 2.0, held to the sentences of §3.2.
 *
 * ## What this target used to be
 *
 * Its spec cited **this repository's own documentation** --
 * `source: 'docs/targets/openrca-2.0.md'` -- and carried as its `quote` the
 * sentence "The official OpenRCA 2.0 evaluation framework and scorer are not
 * open-sourced." That sentence is in `docs/targets/openrca-2.0.md:157`. It is not
 * in the paper: `open-sourced` occurs zero times in arXiv 2606.27154v2, and
 * neither `2.0` nor `PAVE` occurs in `microsoft/OpenRCA`'s README at the commit
 * the 1.0 evaluator is pinned to. **A `quote` field whose entire value is that it
 * was not written here, holding a sentence written here.**
 *
 * The paper does define the metric set -- §3.2, nine quantities across an outcome
 * and a process layer -- and four of them are computable from this contract. The
 * rule that was there scored `matched facets / scored facets` over four facets,
 * which is none of the nine: it paid a quarter of a case for the checkpoint
 * references (no published metric reads them), and it reported a correct service
 * with no verified path as three quarters of a success, which is the exact
 * failure the paper was written to expose.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

interface Case {
  id: string;
  why: string;
  prediction: { component: string; faultType: string; chain: string[] };
  groundTruth: { component: string; faultType: string; chain: string[] };
  expected: { em: number; anySvc: number; nodeF1: number | null; edgeF1: number | null };
}

interface Corpus {
  schema: string;
  target: string;
  takenAt: string;
  upstream: {
    kind: string;
    repository: string;
    title: string;
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
  readFileSync(resolve(ROOT, 'golden-master', 'openrca2-evaluator.json'), 'utf8'),
) as Corpus;

const clause = (id: string): string => {
  const found = CORPUS.clauses.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`the corpus lost the '${id}' clause`);
  return found.quote;
};

/** The annotation the reader consumes, built from one corpus case. */
function causalPathFile(entry: Case): string {
  const { component, faultType, chain } = entry.groundTruth;
  return JSON.stringify({
    case_id: entry.id,
    system: 'order-prod',
    root_cause: { entity_id: `service:default/${component}`, component, fault_type: faultType },
    causal_path: chain.map((token, index) => ({
      step: index + 1,
      from_entity: { name: token.split('->')[0]! },
      to_entity: { name: token.split('->')[1]! },
      evidence: [],
    })),
  });
}

function exportFiles(): Record<string, string> {
  const files: Record<string, string> = {};
  for (const entry of CORPUS.cases) {
    files[`cases/${entry.id}/causal_path.json`] = causalPathFile(entry);
  }
  return files;
}

/** The predictions, in the order the reader produces the cases. */
function predictions(): OfficialPrediction[] {
  const groundTruth = readOfficialGroundTruth('openrca-2.0', exportFiles());
  return groundTruth.map((entry) => {
    const source = CORPUS.cases.find((c) => c.id === entry.caseId);
    if (source === undefined) throw new Error(`the export produced a case the corpus does not have: ${entry.caseId}`);
    return {
      component: source.prediction.component,
      faultType: source.prediction.faultType,
      reason: '',
      occurredAt: '',
      ranks: [],
      chain: source.prediction.chain,
      evidence: [],
      traceWords: 0,
    } satisfies OfficialPrediction;
  });
}

const report = (): ReturnType<typeof scoreOfficial> =>
  scoreOfficial('openrca-2.0', exportFiles(), predictions());

describe('the corpus is pinned to the paper that defines the metrics', () => {
  it('names the artifact by digest, version and retrieval date', () => {
    expect(CORPUS.schema).toBe('rca-bench-prose-evaluator/1');
    expect(CORPUS.target).toBe('openrca-2.0');
    expect(CORPUS.upstream.repository).toBe('arXiv:2606.27154');
    expect(CORPUS.upstream.version).toBe('v2');
    expect(CORPUS.upstream.bytes).toBe(962_086);
    expect(CORPUS.upstream.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(CORPUS.upstream.retrievedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(CORPUS.upstream.extraction).toContain('-layout');
  });

  it('records that the claim "not open-sourced" is not in the artifact it was attributed to', () => {
    // The whole reason this file exists. The sentence the metric used to quote is
    // written in this repository, so the corpus says where the search was made and
    // what came back -- a negative result that can be re-run, rather than a
    // citation of ourselves.
    expect(CORPUS.upstream.releasedCode).toContain("'open-sourced' appears nowhere");
    expect(CORPUS.upstream.releasedCode.length).toBeGreaterThan(120);
    for (const entry of CORPUS.clauses) {
      expect(entry.quote, `${entry.id} quotes the sentence this repository wrote`).not.toContain('not open-sourced');
    }
  });

  it('quotes five clauses, and the metric’s own quote is one of them', () => {
    expect(CORPUS.clauses).toHaveLength(5);
    for (const entry of CORPUS.clauses) {
      expect(entry.quote.length, `${entry.id} quotes nothing`).toBeGreaterThan(60);
      expect(entry.why.length, `${entry.id} argues nothing`).toBeGreaterThan(60);
    }
    expect(OFFICIAL_METRICS['openrca-2.0'].quote).toBe(clause('outcome-layer'));
  });

  it('does not cite this repository as the source of its own rule', () => {
    // The defect, as an assertion. `source` pointed at `docs/targets/openrca-2.0.md`,
    // so the claim's evidence was the document making the claim.
    expect(OFFICIAL_METRICS['openrca-2.0'].source).not.toContain('docs/');
    expect(OFFICIAL_METRICS['openrca-2.0'].source).toContain('arXiv 2606.27154');
  });
});

describe('the metric names the published quantities it implements, and only those', () => {
  it('reports four of the paper’s nine, and says why the other five are absent', () => {
    expect(CORPUS.metricSet).toHaveLength(9);
    expect(CORPUS.implemented).toEqual(['EM', 'AnySvc', 'Node F1', 'Edge F1']);
    expect(CORPUS.notImplemented.map((entry) => entry.metric)).toEqual([
      'Path Reachability (PR)',
      'F1 / Precision / Recall',
      'SQL Exec',
    ]);
    for (const entry of CORPUS.notImplemented) {
      expect(entry.why.length, `${entry.metric} has no reason`).toBeGreaterThan(40);
    }
    // The id is not one of the published names, because the rule is not one of the
    // published metrics: it is EM, reported beside two graph F1s.
    expect(CORPUS.metricSet).not.toContain(OFFICIAL_METRICS['openrca-2.0'].id);
  });

  it('declares only the facets the score reads', () => {
    // `em` reads the service and the fault kind. The causal graph is a *different*
    // published layer, and asking the mutation grid to prove that a facet the score
    // ignores moves the score is the grid objecting correctly -- which is how this
    // list was found: `chain` was in it, and `mutationsDegrade` failed.
    expect(OFFICIAL_METRICS['openrca-2.0'].facets).toEqual(['component', 'faultType']);
    expect(OFFICIAL_METRICS['openrca-2.0'].provenance).toBe('transcribed');
  });
});

describe('the seven cases replay, and the layers are reported apart', () => {
  it('scores each case exactly as the corpus recorded it', () => {
    const scored = report();
    const observed = new Map(
      scored.cases.map((entry) => [
        entry.caseId,
        {
          em: entry.terms?.['em'],
          anySvc: entry.terms?.['anySvc'],
          nodeF1: entry.terms?.['nodeF1'],
          edgeF1: entry.terms?.['edgeF1'],
        },
      ]),
    );
    expect([...observed.keys()].sort()).toEqual(CORPUS.cases.map((entry) => entry.id).sort());
    for (const entry of CORPUS.cases) {
      const here = observed.get(entry.id)!;
      expect(here.em, `${entry.id}: em`).toBe(entry.expected.em);
      expect(here.anySvc, `${entry.id}: anySvc`).toBe(entry.expected.anySvc);
      // A term with no denominator is **absent**, not 1 and not 0: a key and an
      // answer that both carry no graph have nothing to compare, and the case record
      // must not invent a perfect match for it.
      expect(here.nodeF1, `${entry.id}: nodeF1`).toBe(entry.expected.nodeF1 ?? undefined);
      expect(here.edgeF1, `${entry.id}: edgeF1`).toBe(entry.expected.edgeF1 ?? undefined);
    }
  });

  it('reports the layers as different numbers for the same run', () => {
    const scored = report();
    expect(scored.breakdown).toEqual({ em: 0.57, anySvc: 0.71, nodeF1: 0.78, edgeF1: 0.74 });
    expect(scored.final).toBe(57);
    // AnySvc is the lenient layer and EM the strict one, and the gap is the point:
    // the paper's own headline is that a correct service named without a verified
    // path is the common failure, and one averaged number cannot say it.
    expect(scored.breakdown['anySvc']).toBeGreaterThan(scored.breakdown['em']!);
  });

  it('separates a right service from a right diagnosis', () => {
    // `right-service-wrong-kind` is `anySvc: 1, em: 0`; `right-service-no-path` is
    // `em: 1, nodeF1: 0`. Neither can be expressed by a facet average, and both are
    // named cases rather than incidental fixtures.
    const byId = new Map(report().cases.map((entry) => [entry.caseId, entry.terms]));
    expect(byId.get('right-service-wrong-kind')).toMatchObject({ em: 0, anySvc: 1 });
    expect(byId.get('right-service-no-path')).toMatchObject({ em: 1, anySvc: 1, nodeF1: 0, edgeF1: 0 });
    expect(byId.get('wrong-service-right-path')).toMatchObject({ em: 0, anySvc: 0, nodeF1: 1, edgeF1: 1 });
  });

  it('gives no point to a key and an answer that both name nothing', () => {
    // Two empty strings are equal. `em` requires the key to declare a fault kind,
    // and `anySvc` requires it to declare a service; without those guards an export
    // of empty keys reports a perfect exact match. Same defect as Cloud-OpsBench's,
    // declared there and refused here.
    const scored = report().cases.find((entry) => entry.caseId === 'empty-key-empty-answer')!;
    expect(scored.terms).toEqual({ em: 0, anySvc: 0 });
    expect(scored.score).toBe(0);
  });
});
