import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { resolveEntityRef, indexGraph } from '../src/entity/graph.js';
import {
  assessFourLayer,
  describeUncitedEvidence,
  formatFourLayerReading,
} from '../src/fault/four-layer.js';
import { entityGraphSchema, faultCaseSchema } from '../src/ir/schema.js';
import type { FaultCase } from '../src/ir/types.js';

/**
 * M1's "GT four-layer annotation can all be filled", as a thing that can fail.
 *
 * The exit condition is about *can be filled*, and nothing in the tree could answer it: the
 * schema marks `causalChain` and `evidenceCheckpoints` optional, `rootCauseEntityId` is a string
 * that no code resolves, and every case in this repository carried a type and a component and
 * nothing else. A condition nobody can check is a condition that is met by definition.
 *
 * So the corpus carries one case annotated in all four layers, and this file is what says the
 * annotation is real: the case parses, every reference in it answers against the graph beside
 * it, and each layer that a hostile edit empties is reported as empty with a reason.
 *
 * The fixture is the sample, not a stub. It is the first case in `golden-master/fault-cases/`,
 * annotated from `resource-cpu-saturation-checkout` in the extraction key, so the numbers in
 * this file are about a real annotation rather than about a shape.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const CASES = resolve(ROOT, 'golden-master', 'fault-cases');

const rawCase = JSON.parse(readFileSync(resolve(CASES, 'history-checkout-cpu-saturation.json'), 'utf8')) as unknown;
const rawGraph = JSON.parse(readFileSync(resolve(CASES, 'synthetic-storefront-graph.json'), 'utf8')) as unknown;

const faultCase = faultCaseSchema.parse(rawCase) as unknown as FaultCase;
const graph = entityGraphSchema.parse(rawGraph);

/** A deep copy, so a hostile edit in one test cannot leak into the next. */
function copy(): FaultCase {
  return JSON.parse(JSON.stringify(rawCase)) as FaultCase;
}

describe('the corpus carries one case whose four layers are filled', () => {
  it('parses as a FaultCase, so the annotation is a case and not a document', () => {
    // The schema is the first gate and it is not a formality: `category` is a closed vocabulary
    // and `comparator` is a closed set, so a typo here is a case an evaluator cannot read.
    expect(() => faultCaseSchema.parse(rawCase)).not.toThrow();
    expect(faultCase.caseId).toBe('history-checkout-cpu-saturation');
    expect(faultCase.fault.injectionMethod).toBe('historical');
  });

  it('reads as complete, with every layer carrying something', () => {
    const reading = assessFourLayer({ case: faultCase, graph });
    expect(reading.layers.map((layer) => [layer.layer, layer.filled, layer.items])).toEqual([
      // The entity layer's item count is the graph's size, so it is read from the graph. The
      // literal 31 it replaced turned every added node into a failure of this test, which reports a
      // change in the fixture as a defect in the reading.
      ['entity', true, graph.entities.length],
      ['fault', true, 1],
      ['process', true, 2],
      ['evidence', true, 3],
    ]);
    expect(reading.unresolved).toEqual([]);
    expect(reading.danglingEvidence).toEqual([]);
    expect(reading.complete).toBe(true);
  });

  it('answers every reference in the case against the graph that ships beside it', () => {
    // Written out here rather than taken from the reading, so the module and this test are two
    // accounts of the same fact. A resolver that guessed would satisfy the module and fail here,
    // because this walks the case's own references.
    const index = indexGraph(graph);
    const truth = faultCase.groundTruth;
    const refs = [
      truth.rootCauseEntityId,
      ...(truth.causalChain ?? []).flatMap((step) => [step.fromEntityId, step.toEntityId]),
      ...(truth.evidenceCheckpoints ?? []).map((checkpoint) => checkpoint.entityRef),
    ];
    expect(refs).toHaveLength(8);
    for (const ref of refs) {
      expect(resolveEntityRef(ref, index), `${ref} does not resolve`).not.toBeNull();
    }
  });

  it('resolves an alias when the id is not given, and refuses an ambiguous one', () => {
    // The graph carries `the downstream payment service` as an alias, which is how the incident
    // text names that entity. Ambiguity is a refusal by construction -- guessing would make the
    // reference-answerable rate look better than it is.
    const index = indexGraph(graph);
    expect(resolveEntityRef('the downstream payment service', index)).toBe(
      'service:synthetic-storefront/payment-service',
    );
    const ambiguous = {
      entities: [
        { entityId: 'service:ns/a', kind: 'service' as const, name: 'a', aliases: ['shared'] },
        { entityId: 'service:ns/b', kind: 'service' as const, name: 'b', aliases: ['shared'] },
      ],
      edges: [],
    };
    expect(resolveEntityRef('shared', indexGraph(ambiguous))).toBeNull();
  });
});

describe('every annotated case reads as complete against the one graph', () => {
  it('covers three different fault shapes, each with its own chain and its own numbers', () => {
    // One case proves the layers can be filled for *this* corpus; three prove it for three
    // shapes that fail differently -- a resource limit inside one workload, a delay *between*
    // two workloads, and a consumer that is alive but too slow. The last two are the ones a
    // single annotation would not have tested: their chains run across a boundary, and their
    // evidence is a comparison rather than a threshold in one place.
    //
    // Read from the index rather than hard-coded, so adding a fourth case to the corpus is a
    // failure here until it has been read -- which is what "the guard holds whatever number is
    // reached" means at the level of the module.
    const index = JSON.parse(readFileSync(resolve(CASES, 'index.json'), 'utf8')) as {
      cases: Array<{ caseId: string; case: string; graph: string }>;
    };
    expect(index.cases.length).toBeGreaterThanOrEqual(3);
    const readings = index.cases.map((entry) => {
      const one = faultCaseSchema.parse(
        JSON.parse(readFileSync(resolve(CASES, entry.case), 'utf8')) as unknown,
      ) as unknown as FaultCase;
      const oneGraph = entityGraphSchema.parse(JSON.parse(readFileSync(resolve(CASES, entry.graph), 'utf8')) as unknown);
      return { caseId: entry.caseId, reading: assessFourLayer({ case: one, graph: oneGraph }) };
    });
    for (const { caseId, reading } of readings) {
      expect(reading.complete, `${caseId} is not complete: ${JSON.stringify(reading.layers)}`).toBe(true);
      // The chain length is the annotation's, not a shape: a delay between two services needs
      // one step where a throttled container needs two.
      expect(reading.layers.find((layer) => layer.layer === 'process')?.items).toBeGreaterThanOrEqual(1);
      expect(reading.layers.find((layer) => layer.layer === 'evidence')?.items).toBeGreaterThanOrEqual(2);
    }
    // All three share one graph, which is the property that makes them one system rather than
    // three files: the entity layer counts the graph, so equal counts mean one graph.
    const counts = new Set(readings.map(({ reading }) => reading.layers.find((layer) => layer.layer === 'entity')?.items));
    expect(counts.size).toBe(1);
  });
});

describe('an incomplete case says which layer is empty and why', () => {
  it('reports a missing causal chain as an empty process layer', () => {
    const edited = copy();
    delete edited.groundTruth.causalChain;
    const reading = assessFourLayer({ case: edited, graph });
    const process = reading.layers.find((layer) => layer.layer === 'process');
    expect(process).toEqual({
      layer: 'process',
      filled: false,
      items: 0,
      reason: 'groundTruth.causalChain is absent or empty',
    });
    expect(reading.complete).toBe(false);
  });

  it('reports missing checkpoints as an empty evidence layer', () => {
    const edited = copy();
    delete edited.groundTruth.evidenceCheckpoints;
    const reading = assessFourLayer({ case: edited, graph });
    expect(reading.layers.find((layer) => layer.layer === 'evidence')).toMatchObject({
      filled: false,
      items: 0,
      reason: 'groundTruth.evidenceCheckpoints is absent or empty',
    });
    expect(reading.complete).toBe(false);
  });

  it('reports a root cause the graph does not carry, and names the ref', () => {
    const edited = copy();
    edited.groundTruth.rootCauseEntityId = 'container:synthetic-storefront/unknown-app';
    const reading = assessFourLayer({ case: edited, graph });
    expect(reading.layers.find((layer) => layer.layer === 'entity')).toMatchObject({
      filled: false,
      items: 0,
    });
    expect(reading.unresolved).toEqual([
      {
        layer: 'entity',
        ref: 'container:synthetic-storefront/unknown-app',
        where: 'groundTruth.rootCauseEntityId',
      },
    ]);
  });

  it('reports a causal step whose far end the graph does not carry', () => {
    const edited = copy();
    const chain = edited.groundTruth.causalChain ?? [];
    chain[1] = { ...chain[1]!, toEntityId: 'service:synthetic-storefront/orders-api' };
    edited.groundTruth.causalChain = chain;
    const reading = assessFourLayer({ case: edited, graph });
    expect(reading.layers.find((layer) => layer.layer === 'process')).toMatchObject({ filled: false, items: 2 });
    expect(reading.unresolved.map((entry) => `${entry.layer}:${entry.ref}`)).toEqual([
      'process:service:synthetic-storefront/orders-api',
    ]);
    // The where clause is what a reader greps for, and the step number is in it.
    expect(reading.unresolved[0]?.where).toBe('groundTruth.causalChain[2].toEntityId');
  });

  it('reports a checkpoint that names an entity the graph does not carry', () => {
    const edited = copy();
    const checkpoints = edited.groundTruth.evidenceCheckpoints ?? [];
    checkpoints[0] = { ...checkpoints[0]!, entityRef: 'container:synthetic-storefront/other-app' };
    edited.groundTruth.evidenceCheckpoints = checkpoints;
    const reading = assessFourLayer({ case: edited, graph });
    expect(reading.layers.find((layer) => layer.layer === 'evidence')).toMatchObject({ filled: false, items: 3 });
    expect(reading.unresolved).toEqual([
      {
        layer: 'evidence',
        ref: 'container:synthetic-storefront/other-app',
        where: 'groundTruth.evidenceCheckpoints[cp-cpu-limit].entityRef',
      },
    ]);
  });

  it('reports a step that cites evidence the case does not state', () => {
    // Four layers filled and still not complete: the reference between two layers is broken, and
    // a step citing evidence the case does not carry reads as supported and is not.
    const edited = copy();
    const chain = edited.groundTruth.causalChain ?? [];
    chain[0] = { ...chain[0]!, evidenceRefs: ['cp-cpu-limit', 'cp-imaginary'] };
    edited.groundTruth.causalChain = chain;
    const reading = assessFourLayer({ case: edited, graph });
    expect(reading.layers.every((layer) => layer.filled)).toBe(true);
    expect(reading.danglingEvidence).toEqual([{ step: 1, ref: 'cp-imaginary' }]);
    expect(reading.complete).toBe(false);
  });

  it('treats an unknown category as the taxonomy declining to answer', () => {
    // `unknown` is a member of the vocabulary on purpose, so it parses. It is not an answer to
    // "which category is this", and a fault layer that counts it as filled would report a
    // complete case whose category the annotator declined to decide.
    const edited = copy();
    edited.fault.category = 'unknown';
    const reading = assessFourLayer({ case: edited, graph });
    expect(reading.layers.find((layer) => layer.layer === 'fault')).toMatchObject({
      filled: false,
      reason: expect.stringContaining("'unknown'"),
    } as never);
  });

  it('treats an empty type as an empty fault layer, with its own reason', () => {
    const edited = copy();
    edited.fault.type = '';
    const reading = assessFourLayer({ case: edited, graph });
    expect(reading.layers.find((layer) => layer.layer === 'fault')?.reason).toBe('fault.type is empty');
  });
});

describe('the reading is printable, because a verdict nobody can read is a badge', () => {
  it('prints one line per layer, the two reference counts, and the verdict', () => {
    const text = formatFourLayerReading(assessFourLayer({ case: faultCase, graph }));
    expect(text.split('\n')).toEqual([
      `  entity    filled ${String(graph.entities.length)} item(s)`,
      '  fault     filled  1 item(s)',
      '  process   filled  2 item(s)',
      '  evidence  filled  3 item(s)',
      '  unresolved refs: 0',
      '  dangling evidence refs: 0',
      '  uncited evidence: 0',
      '  four layers: COMPLETE',
    ]);
  });

  it('prints the reason beside the layer that has one', () => {
    const edited = copy();
    delete edited.groundTruth.causalChain;
    const text = formatFourLayerReading(assessFourLayer({ case: edited, graph }));
    expect(text).toContain('process   EMPTY   0 item(s)  -- groundTruth.causalChain is absent or empty');
    expect(text).toContain('four layers: INCOMPLETE');
  });
});

/**
 * The third member of the reference family.
 *
 * The module already reports both directions of a *broken* reference: an entity ref no graph
 * answers, and a step citing a checkpoint the case does not state. It said nothing about the
 * other direction -- a checkpoint no step cites -- and the corpus carried nine of them, in nine
 * cases, every one of which read as annotated. A fact stated for a step and cited by none of them
 * is not evidence for the chain, it is a sentence in a field no per-step evidence list reaches:
 * two of the three exports build `evidence[]` from `CausalStep.evidenceRefs` and drop it silently.
 *
 * The rule is not "cite something", it is "a checkpoint is a fact about a step, and a fact about
 * no step is not a checkpoint". There is no escape hatch, because every one of the nine had a
 * step it defended: six of them are the control that rules out the competing hypothesis.
 */
describe('a checkpoint no step cites is a fact the chain does not use', () => {
  it('reports nothing for the shipped annotation, where every checkpoint is cited', () => {
    expect(assessFourLayer({ case: faultCase, graph }).uncitedEvidence).toEqual([]);
  });

  it('reports a checkpoint that every step leaves behind, and refuses to call the case complete', () => {
    const edited = copy();
    const step = edited.groundTruth.causalChain![0]!;
    const dropped = step.evidenceRefs.pop()!;
    const reading = assessFourLayer({ case: edited, graph });
    expect(reading.uncitedEvidence).toEqual([
      { checkpointId: dropped, entityRef: expect.any(String) as unknown as string },
    ]);
    // The four layers are all still filled: the checkpoint is stated, its entity resolves, and the
    // step still cites two others. Only the fact that nothing uses it is wrong, which is exactly
    // the state the nine were in -- complete by every count that existed before this rule.
    expect(reading.layers.every((layer) => layer.filled)).toBe(true);
    expect(reading.layers.find((layer) => layer.layer === 'evidence')?.items).toBe(3);
    expect(reading.complete).toBe(false);
  });

  it('reports every checkpoint when the chain carries no steps at all', () => {
    const edited = copy();
    edited.groundTruth.causalChain = [];
    const reading = assessFourLayer({ case: edited, graph });
    expect(reading.uncitedEvidence).toHaveLength(3);
    expect(reading.uncitedEvidence.map((entry) => entry.checkpointId)).toEqual(
      (edited.groundTruth.evidenceCheckpoints ?? []).map((checkpoint) => checkpoint.checkpointId),
    );
  });

  it('counts a checkpoint two steps cite as cited once, not as an ambiguity', () => {
    const edited = copy();
    const [first, second] = edited.groundTruth.causalChain!;
    // The shipped case has two steps; give the second one the first's refs as well.
    second!.evidenceRefs = [...first!.evidenceRefs, ...(second!.evidenceRefs ?? [])];
    const reading = assessFourLayer({ case: edited, graph });
    expect(reading.uncitedEvidence).toEqual([]);
    expect(reading.complete).toBe(true);
  });

  it('names the entity beside the id, so the line can be found without the file', () => {
    const edited = copy();
    edited.groundTruth.causalChain![0]!.evidenceRefs = [];
    const reading = assessFourLayer({ case: edited, graph });
    const known = new Map(
      (edited.groundTruth.evidenceCheckpoints ?? []).map((checkpoint) => [checkpoint.checkpointId, checkpoint.entityRef]),
    );
    for (const entry of reading.uncitedEvidence) {
      expect(entry.entityRef).toBe(known.get(entry.checkpointId));
    }
  });

  it('prints the count, and states the repair in one sentence per entry', () => {
    const edited = copy();
    edited.groundTruth.causalChain![0]!.evidenceRefs = [];
    const reading = assessFourLayer({ case: edited, graph });
    // The shipped fixture's first step cites two of the three checkpoints, so emptying it leaves
    // two behind rather than three: the third is cited by the second step and stays used.
    expect(formatFourLayerReading(reading)).toContain('  uncited evidence: 2');
    const sentences = reading.uncitedEvidence.map((entry) => describeUncitedEvidence(entry, 'case-1'));
    expect(sentences).toHaveLength(2);
    for (const sentence of sentences) {
      expect(sentence.startsWith('case-1: ')).toBe(true);
      expect(sentence).toContain('is cited by no causal step');
      expect(sentence).toContain('no per-step evidence list carries it');
      expect(sentence).not.toContain('\n');
    }
    // Each names its own checkpoint once, so the two lines are two different repairs.
    expect(new Set(sentences).size).toBe(2);
  });
});
