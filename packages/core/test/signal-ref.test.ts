import { describe, expect, it } from 'vitest';
import { buildEntityIndex, type EntityIndex } from '../src/export/rca100.js';
import {
  SIGNAL_REF_SEPARATOR,
  SignalRefRefusedError,
  describeSignalRefFault,
  readSignalRef,
} from '../src/export/signal-ref.js';
import type { EntityGraph } from '../src/ir/types.js';

/**
 * The reference a checkpoint publishes, and the five ways it cannot be published.
 *
 * ## The defect this exists for
 *
 * `EvidenceCheckpoint` holds the two halves of a series identity in two fields -- `entityRef` names
 * the thing, `signalRef` names the reading taken on it -- which is the lesson `fault/reading-
 * reference.ts` already carries for the guard. The exporters copied `signalRef` into `signal_ref`
 * and stopped, so what reached the three targets was one half of the pair.
 *
 * What makes it a defect rather than a format choice is that all three of those contracts, and the
 * three documents that describe them, say the field holds both halves:
 *
 *     "signal_ref": "order|cpu_usage"          docs/targets/itbench.md, openrca-2.0.md, rca100.md
 *
 * The example was believed because nothing could contradict it: the golden-master fixture wrote
 * `"signalRef": "order|cpu_usage"` into the IR, the exporter copied it out, and the example was a
 * photograph of the input. The 30-case corpus, written against the resolution rule that
 * `reading-reference.ts` enforces, holds bare metric names -- so the corpus produced
 * `signal_ref: "cluster_members_visible"` while the documented output is `search-node-1|...`, and
 * two checkpoints of one case collapsed into two byte-identical evidence entries.
 *
 * ## Why five refusals rather than a fallback
 *
 * The qualifier is a name, and a name is not always an answer: the entity may not be in the graph,
 * may carry no name, or may share its name with a second entity -- in which case `twin|cpu_usage`
 * names two things and `rateOf` counts it as a hit against either. And the ref itself may already
 * carry a qualifier, which is what the fixture did. Five states, each one a different repair, so
 * each one gets its own sentence instead of one "invalid reference".
 */

const GRAPH: EntityGraph = {
  entities: [
    { entityId: 'service:acme/checkout', kind: 'service', name: 'checkout', aliases: ['checkout-svc'] },
    { entityId: 'pod:acme/checkout-0', kind: 'pod', name: 'checkout-0', aliases: [] },
    { entityId: 'pod:acme/search-1', kind: 'pod', name: 'search-1', aliases: [] },
    { entityId: 'pod:acme/search-4', kind: 'pod', name: 'search-4', aliases: [] },
    // Two entities that answer to one name: the qualifier would name both of them.
    { entityId: 'pod:acme/twin-a', kind: 'pod', name: 'twin', aliases: [] },
    { entityId: 'pod:acme/twin-b', kind: 'pod', name: 'twin', aliases: [] },
    // A name that is another entity's alias, which is the same ambiguity one level out: `byName`
    // answers it, so a reader resolving the exported string with this index lands on one entity and
    // a reader resolving it against the graph sees two.
    { entityId: 'service:acme/gateway', kind: 'service', name: 'gateway', aliases: [] },
    { entityId: 'service:acme/edge', kind: 'service', name: 'edge', aliases: ['gateway'] },
    // The graph schema refuses a blank name; the exporter is public API and does not validate.
    { entityId: 'pod:acme/blank', kind: 'pod', name: '', aliases: [] },
  ],
  edges: [],
};

const INDEX = buildEntityIndex(GRAPH);

function read(input: { entityRef: string; signalRef?: string }): ReturnType<typeof readSignalRef> {
  return readSignalRef({ checkpoint: input, index: INDEX });
}

describe('readSignalRef', () => {
  it('qualifies a series reference with the name of the entity it was read on', () => {
    expect(read({ entityRef: 'pod:acme/search-1', signalRef: 'cluster_members_visible' })).toEqual({
      fault: null,
      ref: 'search-1|cluster_members_visible',
    });
  });

  it('qualifies the other three kinds the same way, because the question is the same one', () => {
    // A configuration key and a log id are as much a property of the entity as a metric is: two
    // containers both declare `cpuLimit` and two services both log a `stack-trace`, so the half that
    // said *whose* is exactly the half that was missing for them too.
    const cases: Array<[string, string]> = [
      ['cpuLimit', 'checkout|cpuLimit'],
      ['stack-trace', 'checkout|stack-trace'],
      ['client_span_duration_ms', 'checkout|client_span_duration_ms'],
    ];
    for (const [signalRef, expected] of cases) {
      expect(read({ entityRef: 'service:acme/checkout', signalRef }).ref).toBe(expected);
    }
  });

  it('separates on one character, published so a reader does not have to infer it', () => {
    expect(SIGNAL_REF_SEPARATOR).toBe('|');
    expect(read({ entityRef: 'service:acme/checkout', signalRef: 'cpu' }).ref).toBe(
      `checkout${SIGNAL_REF_SEPARATOR}cpu`,
    );
  });

  it('answers with nothing for a checkpoint that names no reading, which is what derived means', () => {
    expect(read({ entityRef: 'service:acme/checkout' })).toEqual({ fault: null, ref: null });
  });

  it('refuses an empty ref, because the qualifier turns it into a string that looks like one', () => {
    // `checkout|` reads as a reference with an empty tail. It is the same defect the two-answers
    // rule keeps finding: a value that can be produced by accident and cannot be told from an answer.
    expect(read({ entityRef: 'service:acme/checkout', signalRef: '' })).toEqual({
      fault: { kind: 'emptyRef' },
      ref: null,
    });
  });

  it('refuses a ref that already carries a qualifier', () => {
    // This is the shipped fixture's own shape until this round, and the reason nothing could
    // contradict the documents: the input was written in the output's form.
    expect(read({ entityRef: 'service:acme/checkout', signalRef: 'checkout|cpu_usage' })).toEqual({
      fault: { kind: 'preQualified', ref: 'checkout|cpu_usage' },
      ref: null,
    });
  });

  it('refuses an entity the graph does not hold', () => {
    expect(read({ entityRef: 'pod:acme/ghost', signalRef: 'cpu' })).toEqual({
      fault: { kind: 'unresolved', entityRef: 'pod:acme/ghost' },
      ref: null,
    });
  });

  it('refuses an entity that carries no name to qualify with', () => {
    expect(read({ entityRef: 'pod:acme/blank', signalRef: 'cpu' })).toEqual({
      fault: { kind: 'unnamed', entityRef: 'pod:acme/blank' },
      ref: null,
    });
  });

  it('refuses a name two entities answer to, and names both', () => {
    expect(read({ entityRef: 'pod:acme/twin-a', signalRef: 'cpu' })).toEqual({
      fault: { kind: 'ambiguous', entityRef: 'pod:acme/twin-a', name: 'twin', candidates: ['pod:acme/twin-a', 'pod:acme/twin-b'] },
      ref: null,
    });
  });

  it('treats a name that is another entity alias as the same ambiguity', () => {
    // `gateway` is this entity's name and the other's alias, so `gateway|cpu` names two entities to
    // anyone resolving it through `byName` -- and `byName` is what every signal resolver uses.
    expect(read({ entityRef: 'service:acme/gateway', signalRef: 'cpu' })).toEqual({
      fault: { kind: 'ambiguous', entityRef: 'service:acme/gateway', name: 'gateway', candidates: ['service:acme/edge', 'service:acme/gateway'] },
      ref: null,
    });
  });

  it('does not call an entity ambiguous with itself when it has aliases', () => {
    // Two aliases of one entity are one answer. A rule that counted alias occurrences rather than
    // distinct entities would refuse every entity that was ever renamed.
    expect(read({ entityRef: 'service:acme/checkout', signalRef: 'cpu' }).fault).toBeNull();
  });

  it('reports the entity before the ref, because a ref cannot be qualified without one', () => {
    // Both are wrong here; the entity is the one the reader has to fix first, and a message that
    // started with the ref would send them to the wrong field.
    expect(read({ entityRef: 'pod:acme/ghost', signalRef: 'a|b' }).fault).toEqual({
      kind: 'unresolved',
      entityRef: 'pod:acme/ghost',
    });
  });
});

describe('describeSignalRefFault', () => {
  const sentences = (): string[] => [
    describeSignalRefFault({ kind: 'emptyRef' }, 'case-1', 'cp-1'),
    describeSignalRefFault({ kind: 'preQualified', ref: 'order|cpu_usage' }, 'case-1', 'cp-1'),
    describeSignalRefFault({ kind: 'unresolved', entityRef: 'pod:acme/ghost' }, 'case-1', 'cp-1'),
    describeSignalRefFault({ kind: 'unnamed', entityRef: 'pod:acme/blank' }, 'case-1', 'cp-1'),
    describeSignalRefFault(
      { kind: 'ambiguous', entityRef: 'pod:acme/twin-a', name: 'twin', candidates: ['pod:acme/twin-a', 'pod:acme/twin-b'] },
      'case-1',
      'cp-1',
    ),
  ];

  it('writes one sentence per refusal, each naming the case and the checkpoint', () => {
    for (const sentence of sentences()) {
      expect(sentence.startsWith('case-1')).toBe(true);
      expect(sentence).toContain('cp-1');
      expect(sentence).not.toContain('\n');
      expect(sentence.endsWith('.')).toBe(false);
    }
  });

  it('writes five different sentences, so the repair is not "fix the reference"', () => {
    expect(new Set(sentences()).size).toBe(5);
  });

  it('says where the owner of a pre-qualified ref belongs, quoting both fields', () => {
    expect(describeSignalRefFault({ kind: 'preQualified', ref: 'order|cpu_usage' }, 'case-1', 'cp-1')).toBe(
      "case-1: checkpoint 'cp-1' writes 'order|cpu_usage' in a field that holds the reading alone, " +
        'so the owner it carries would be written twice',
    );
  });

  it('names both candidates of an ambiguous name, so the reader can see the collision', () => {
    const sentence = describeSignalRefFault(
      { kind: 'ambiguous', entityRef: 'pod:acme/twin-a', name: 'twin', candidates: ['pod:acme/twin-b', 'pod:acme/twin-a'] },
      'case-1',
      'cp-1',
    );
    expect(sentence).toContain("'twin'");
    expect(sentence).toContain('pod:acme/twin-a');
    expect(sentence).toContain('pod:acme/twin-b');
  });

  it('says an empty ref produces a qualifier and nothing to qualify', () => {
    expect(describeSignalRefFault({ kind: 'emptyRef' }, 'case-1', 'cp-1')).toBe(
      "case-1: checkpoint 'cp-1' carries an empty signalRef, so the qualified form would read " +
        "'<entity>|' and name no reading",
    );
  });

  it('says an unresolved entity is missing from the topology rather than merely unknown', () => {
    expect(describeSignalRefFault({ kind: 'unresolved', entityRef: 'pod:acme/ghost' }, 'case-1', 'cp-1')).toBe(
      "case-1: checkpoint 'cp-1' names entity 'pod:acme/ghost', which the topology does not hold, " +
        'so there is no name to qualify its signal with',
    );
  });

  it('says an unnamed entity has nothing to qualify with, without inventing an id', () => {
    expect(describeSignalRefFault({ kind: 'unnamed', entityRef: 'pod:acme/blank' }, 'case-1', 'cp-1')).toBe(
      "case-1: checkpoint 'cp-1' names entity 'pod:acme/blank', which carries no name, " +
        'so there is nothing to qualify its signal with',
    );
  });
});

describe('SignalRefRefusedError', () => {
  it('carries the case, the checkpoint and the fault, and says all three in its message', () => {
    // An error that only said "cannot qualify" would send the reader into the corpus with no way to
    // know which of the 120 checkpoints refused, and the message is the one thing a `catch` at the
    // export boundary has to print.
    const fault = { kind: 'preQualified', ref: 'order|cpu_usage' } as const;
    const error = new SignalRefRefusedError('case-1', 'cp-1', fault);
    expect(error.name).toBe('SignalRefRefusedError');
    expect(error.message).toBe(describeSignalRefFault(fault, 'case-1', 'cp-1'));
    expect(error.fault).toEqual(fault);
    expect(error.caseId).toBe('case-1');
    expect(error.checkpointId).toBe('cp-1');
  });

  it('keeps the fault, so a caller that catches it does not have to parse the message', () => {
    const ambiguous = new SignalRefRefusedError('case-1', 'cp-1', {
      kind: 'ambiguous',
      entityRef: 'pod:acme/twin-a',
      name: 'twin',
      candidates: ['pod:acme/twin-a', 'pod:acme/twin-b'],
    });
    expect(ambiguous.fault.kind).toBe('ambiguous');
    expect(ambiguous.message).toContain('pod:acme/twin-b');
  });
});

describe('buildEntityIndex', () => {
  it('counts every entity that answers to a name or an alias, so a collision is visible', () => {
    // `byName` is a lookup and resolves a collision by writing last, which is the right answer for a
    // resolver and the wrong one for a publisher: a published qualifier that two entities answer to
    // must be refused, and a map that has already chosen cannot say so.
    expect(INDEX.idsByName.get('twin')).toEqual(['pod:acme/twin-a', 'pod:acme/twin-b']);
    expect(INDEX.idsByName.get('gateway')).toEqual(['service:acme/edge', 'service:acme/gateway']);
    expect(INDEX.idsByName.get('checkout')).toEqual(['service:acme/checkout']);
  });

  it('lists an entity once under a name it holds twice', () => {
    const twice: EntityGraph = {
      entities: [{ entityId: 'service:acme/one', kind: 'service', name: 'one', aliases: ['one', 'uno'] }],
      edges: [],
    };
    expect(buildEntityIndex(twice).idsByName.get('one')).toEqual(['service:acme/one']);
  });
});

describe('an index that was not built from the graph it is asked about', () => {
  it('reads an absent name entry as no other claimant, because the entity is the one it resolved', () => {
    // `buildEntityIndex` fills `idsByName` from the same entities `byId` holds, so this state cannot
    // come from it. It can come from a hand-built index, and the choice matters: a fallback to
    // "ambiguous" would refuse every reference such a caller asks about, and a fallback to
    // "qualified" is what the absent entry is evidence for -- that this index knows of no second
    // entity answering to the name.
    const partial: EntityIndex = { byId: INDEX.byId, byName: INDEX.byName, idsByName: new Map() };
    expect(readSignalRef({ checkpoint: { entityRef: 'pod:acme/twin-a', signalRef: 'cpu' }, index: partial })).toEqual({
      fault: null,
      ref: 'twin|cpu',
    });
  });
});
