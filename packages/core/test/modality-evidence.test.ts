import { describe, expect, it } from 'vitest';

import type { EntityGraph } from '../src/ir/types.js';
import {
  ABSENCE_FIELDS,
  EVIDENCE_MODALITIES,
  callsAcrossChain,
  describeModalityFault,
  readModalityAnswer,
} from '../src/fault/modality-evidence.js';
import type { ModalityFault } from '../src/fault/modality-evidence.js';

/**
 * The two questions a case could not answer.
 *
 * `logs` and `traces` are lists, so "this case has no log line" and "nobody filled this in" were the
 * same bytes: 19 of the corpus's 30 cases had no `logs` and 25 had no `traces`, and the guard printed
 * those numbers as if they were facts about the incidents. This file is the field that separates the
 * two answers, and the four rules that make it readable.
 *
 * The sentence's truth is not checked here, and that is a decision rather than a gap: "does this
 * incident text describe a line a process would have written" is a judgement, and a keyword list that
 * pretended to make it would be wrong on the first case whose text says *no line was written*. Two of
 * the corpus's reasons are exactly that sentence.
 */
const ENTRY = { service: 'a', id: 'one', severity: 'error', body: 'a line', quote: 'q', why: 'w' };
const REASON = 'the text states a reading on one entity and no line any process wrote.';

describe('the answer a case gives about a modality', () => {
  it('reads a list of entries as the modality being shown', () => {
    const read = readModalityAnswer({ modality: 'log', declared: [ENTRY], reason: undefined });
    expect(read.fault).toBeNull();
    expect(read.answer).toEqual({ declared: 1, reason: null });
  });

  it('counts what it read rather than saying that it read something', () => {
    const read = readModalityAnswer({ modality: 'trace', declared: [{}, {}, {}], reason: undefined });
    expect(read.answer).toEqual({ declared: 3, reason: null });
  });

  it('reads a sentence as the absence, with the sentence kept', () => {
    const read = readModalityAnswer({ modality: 'log', declared: undefined, reason: REASON });
    expect(read.fault).toBeNull();
    expect(read.answer).toEqual({ declared: 0, reason: REASON });
  });

  it('refuses a case that shows a modality and also explains its absence', () => {
    const read = readModalityAnswer({ modality: 'log', declared: [ENTRY, ENTRY], reason: REASON });
    expect(read.fault).toEqual({ kind: 'both', modality: 'log', declared: 2 });
    expect(read.answer).toBeNull();
  });

  it('refuses a case that neither shows nor explains, because that is the shape of an omission', () => {
    const read = readModalityAnswer({ modality: 'trace', declared: undefined, reason: undefined });
    expect(read.fault).toEqual({ kind: 'missing', modality: 'trace' });
  });

  it('refuses an empty list even when a sentence stands beside it', () => {
    // One of the two spellings has to go, and it is the one that can also mean "nobody filled this
    // in". Accepting both would make a reader decide which the author meant, which is the question
    // the field exists to answer.
    const read = readModalityAnswer({ modality: 'log', declared: [], reason: REASON });
    expect(read.fault).toEqual({ kind: 'empty', modality: 'log' });
  });

  it('refuses an empty list without a sentence for the same reason', () => {
    const read = readModalityAnswer({ modality: 'trace', declared: [], reason: undefined });
    expect(read.fault).toEqual({ kind: 'empty', modality: 'trace' });
  });

  it('refuses a declaration that is not a list at all', () => {
    for (const declared of ['a line', 7, { one: ENTRY }, null]) {
      const read = readModalityAnswer({ modality: 'log', declared, reason: undefined });
      expect(read.fault).toEqual({ kind: 'unreadable', modality: 'log' });
    }
  });

  it('refuses a reason that is not text', () => {
    for (const reason of [7, { why: 'because' }, ['a', 'b'], true]) {
      const read = readModalityAnswer({ modality: 'trace', declared: undefined, reason });
      expect(read.fault).toEqual({ kind: 'notText', modality: 'trace', reason });
    }
  });

  it('refuses a reason that is a label rather than a sentence', () => {
    const read = readModalityAnswer({ modality: 'log', declared: undefined, reason: 'no log line' });
    expect(read.fault).toEqual({ kind: 'vague', modality: 'log', reason: 'no log line' });
  });

  it('measures the sentence with the rule the rest of the tree uses', () => {
    const forty = `${'x'.repeat(39)}.`;
    expect(forty).toHaveLength(40);
    expect(readModalityAnswer({ modality: 'log', declared: undefined, reason: forty }).fault).toBeNull();
    const thirtyNine = `${'x'.repeat(38)}.`;
    expect(thirtyNine).toHaveLength(39);
    expect(readModalityAnswer({ modality: 'log', declared: undefined, reason: thirtyNine }).fault).toEqual({
      kind: 'vague',
      modality: 'log',
      reason: thirtyNine,
    });
    const noFullStop = 'x'.repeat(40);
    expect(readModalityAnswer({ modality: 'log', declared: undefined, reason: noFullStop }).fault).toEqual({
      kind: 'vague',
      modality: 'log',
      reason: noFullStop,
    });
  });

  it('has one field name per modality, and no second spelling of either', () => {
    expect(ABSENCE_FIELDS).toEqual({ log: 'noLogs', trace: 'noTraces' });
    expect(EVIDENCE_MODALITIES).toEqual(['log', 'trace']);
  });
});

describe('the sentence a reader gets for one refusal', () => {
  const faults: ModalityFault[] = [
    { kind: 'unreadable', modality: 'log' },
    { kind: 'both', modality: 'log', declared: 1 },
    { kind: 'both', modality: 'trace', declared: 4 },
    { kind: 'empty', modality: 'log' },
    { kind: 'missing', modality: 'trace' },
    { kind: 'notText', modality: 'trace', reason: 7 },
    { kind: 'vague', modality: 'log', reason: 'no log line' },
    // The second half of the one ternary in the composer: `unreadable` names the list it is about,
    // and a message that said `logs` about a `traces` field would send the reader to the wrong line.
    { kind: 'unreadable', modality: 'trace' },
  ];
  const sentences = faults.map((fault) => describeModalityFault(fault, 'history-x'));

  it('names the field the repair is written into', () => {
    expect(sentences[0]).toContain("declares 'logs'");
    expect(sentences[1]).toContain("'noLogs'");
    expect(sentences[2]).toContain("'noTraces'");
    expect(sentences[3]).toContain("'noLogs'");
    expect(sentences[4]).toContain("'noTraces'");
  });

  it('counts the entries it refuses, and gets the singular right', () => {
    expect(sentences[1]).toContain('declares 1 log line entry');
    expect(sentences[2]).toContain('declares 4 span entries');
  });

  it('names the list the unreadable field is about, in either modality', () => {
    expect(sentences[0]).toContain("declares 'logs' as something that is not a list");
    expect(sentences[7]).toContain("declares 'traces' as something that is not a list");
  });

  it('says which value it could not read', () => {
    expect(sentences[5]).toContain('writes \'noTraces\' as 7');
    expect(sentences[6]).toContain("writes 'noLogs' as 'no log line'");
  });

  it('names the case in every one of them', () => {
    for (const sentence of sentences) expect(sentence.startsWith("'history-x' ")).toBe(true);
  });

  it('is one line each, and no two of them are the same', () => {
    expect(new Set(sentences).size).toBe(sentences.length);
    // The guard prints one refusal per line; a message carrying a newline would break the report
    // apart, which is why every refusal in this tree is a fragment rather than a paragraph.
    for (const sentence of sentences) expect(sentence.includes('\n')).toBe(false);
  });
});

/**
 * The graph the walk below is measured on: two services that call each other's side of one edge,
 * one ingress that routes to the first, and a container three ownership steps down.
 */
const N = 'synthetic-storefront';
function graph(): EntityGraph {
  return {
    entities: [
      { entityId: `service:${N}/a`, kind: 'service', name: 'a', aliases: [] },
      { entityId: `pod:${N}/a-0`, kind: 'pod', name: 'a-0', aliases: [] },
      { entityId: `container:${N}/a-app`, kind: 'container', name: 'a-app', aliases: [] },
      { entityId: `service:${N}/b`, kind: 'service', name: 'b', aliases: [] },
      { entityId: `pod:${N}/b-0`, kind: 'pod', name: 'b-0', aliases: [] },
      { entityId: `external:${N}/ingress`, kind: 'external', name: 'ingress', aliases: [] },
      { entityId: `container:${N}/orphan`, kind: 'container', name: 'orphan', aliases: [] },
    ],
    edges: [
      { from: `service:${N}/a`, to: `pod:${N}/a-0`, relation: 'contains' },
      { from: `pod:${N}/a-0`, to: `container:${N}/a-app`, relation: 'contains' },
      { from: `service:${N}/b`, to: `pod:${N}/b-0`, relation: 'contains' },
      { from: `service:${N}/a`, to: `service:${N}/b`, relation: 'calls' },
      { from: `external:${N}/ingress`, to: `service:${N}/a`, relation: 'routes' },
    ],
  };
}

const step = (from: string, to: string) => ({ fromEntityId: from, toEntityId: to });

describe('the calls a chain crosses, which is what a span pair would be made of', () => {
  it('finds the exchange when the chain walks it in the direction it was declared', () => {
    const calls = callsAcrossChain({
      steps: [step(`container:${N}/a-app`, `service:${N}/b`)],
      graph: graph(),
    });
    expect(calls).toEqual([{ from: 'a', to: 'b' }]);
  });

  it('finds it when the chain walks it backwards, because it is still the same exchange', () => {
    const calls = callsAcrossChain({
      steps: [step(`service:${N}/b`, `container:${N}/a-app`)],
      graph: graph(),
    });
    expect(calls).toEqual([{ from: 'b', to: 'a' }]);
  });

  it('reports nothing for a chain that stays inside one service', () => {
    const calls = callsAcrossChain({
      steps: [step(`container:${N}/a-app`, `pod:${N}/a-0`), step(`pod:${N}/a-0`, `service:${N}/a`)],
      graph: graph(),
    });
    expect(calls).toEqual([]);
  });

  it('does not read `routes` as ownership, so the ingress is nobody', () => {
    const calls = callsAcrossChain({
      steps: [step(`external:${N}/ingress`, `service:${N}/a`)],
      graph: graph(),
    });
    expect(calls).toEqual([]);
  });

  it('reports nothing when an endpoint is not in the graph', () => {
    const calls = callsAcrossChain({
      steps: [step(`container:${N}/nowhere`, `service:${N}/b`)],
      graph: graph(),
    });
    expect(calls).toEqual([]);
  });

  it('reports nothing for an entity no path leads to a service from', () => {
    const calls = callsAcrossChain({
      steps: [step(`container:${N}/orphan`, `service:${N}/b`)],
      graph: graph(),
    });
    expect(calls).toEqual([]);
  });

  it('reports an exchange once however many steps cross it', () => {
    const calls = callsAcrossChain({
      steps: [
        step(`container:${N}/a-app`, `service:${N}/b`),
        step(`pod:${N}/a-0`, `pod:${N}/b-0`),
      ],
      graph: graph(),
    });
    expect(calls).toEqual([{ from: 'a', to: 'b' }]);
  });

  it('reports nothing when two services are connected by no call', () => {
    const without = graph();
    without.edges = without.edges.filter((edge) => edge.relation !== 'calls');
    const calls = callsAcrossChain({ steps: [step(`service:${N}/a`, `service:${N}/b`)], graph: without });
    expect(calls).toEqual([]);
  });

  it('walk to the service when an entity is held by more than one holder', () => {
    // A container inside a pod that a service contains, and a node that hosts the pod: three
    // ownership edges into two entities, which is what a graph with a node layer looks like.
    const two = graph();
    two.entities.push({ entityId: `node:${N}/build-node-1`, kind: 'node', name: 'build-node-1', aliases: [] });
    two.edges.push({ from: `node:${N}/build-node-1`, to: `pod:${N}/a-0`, relation: 'hosts' });
    const calls = callsAcrossChain({ steps: [step(`container:${N}/a-app`, `service:${N}/b`)], graph: two });
    expect(calls).toEqual([{ from: 'a', to: 'b' }]);
  });

  it('stops at a cycle rather than walking it forever', () => {
    // Two entities that contain each other resolve to no service: the walk has to end, and the
    // answer to "which service is this" is then nothing rather than an arbitrary member.
    const looped = graph();
    looped.edges.push({ from: `container:${N}/a-app`, to: `pod:${N}/a-0`, relation: 'contains' });
    const calls = callsAcrossChain({ steps: [step(`container:${N}/a-app`, `service:${N}/b`)], graph: looped });
    expect(calls).toEqual([{ from: 'a', to: 'b' }]);
  });
});
