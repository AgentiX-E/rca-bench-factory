import { describe, expect, it } from 'vitest';
import {
  describeReadingProblem,
  resolveReading,
  type ReadingCarrier,
  type ReadingRefusal,
} from '../src/fault/reading-reference.js';
import type { EntityGraph } from '../src/ir/types.js';

/**
 * A checkpoint names an entity and a metric. The guard read the metric.
 *
 * Measured over the shipped corpus before this rule existed: 73 series checkpoints, **13 of them
 * naming an entity that does not carry the reading**, and the guard accepting all 73. The mechanism
 * is one line -- a map keyed on the metric name -- and the reason it survived is that the corpus's
 * thirteen were all legitimate, so nothing ever disagreed. A rule that is right about the data it has
 * and blind to the data it could have is what these tests are about.
 *
 * The relation is not equality, and this file is where that is decided rather than assumed. A
 * container's memory figure filed under its service is one component at two resolutions; two replicas
 * of one service are **siblings**, and a reading on one is not a reading on the other. Both halves are
 * asserted, because the loose rule (any two names) and the strict rule (the same name) each get one
 * of them wrong.
 */

const NAMESPACE = 'storefront';

function entity(kind: string, name: string, aliases: string[] = []): EntityGraph['entities'][number] {
  return {
    entityId: `${kind}:${NAMESPACE}/${name}`,
    kind: kind as EntityGraph['entities'][number]['kind'],
    name,
    namespace: NAMESPACE,
    aliases,
  };
}

/**
 * One service with two replicas and a container, one cluster with two nodes, and a second service.
 *
 * `checkout-0` and `checkout-1` are siblings under `checkout` so the replica rule has something to
 * refuse; the two cluster nodes are siblings too, and they are the partition case's two halves --
 * one metric on two entities, which is the expressiveness finding 299 asked for.
 */
const GRAPH: EntityGraph = {
  entities: [
    entity('service', 'checkout'),
    entity('pod', 'checkout-0'),
    entity('container', 'checkout-app'),
    entity('pod', 'checkout-1'),
    entity('service', 'cluster'),
    entity('pod', 'node-1'),
    entity('pod', 'node-4'),
    entity('service', 'settlement'),
  ],
  edges: [
    { from: 'service:storefront/checkout', to: 'pod:storefront/checkout-0', relation: 'contains' },
    { from: 'pod:storefront/checkout-0', to: 'container:storefront/checkout-app', relation: 'contains' },
    { from: 'service:storefront/checkout', to: 'pod:storefront/checkout-1', relation: 'contains' },
    { from: 'service:storefront/cluster', to: 'pod:storefront/node-1', relation: 'contains' },
    { from: 'service:storefront/cluster', to: 'pod:storefront/node-4', relation: 'contains' },
  ],
};

function resolve(metric: string, entityRef: string, series: readonly ReadingCarrier[]) {
  return resolveReading({ metric, entityRef, series, graph: GRAPH });
}

describe('reading reference · the pair is the reference', () => {
  it('resolves a checkpoint that names the very entity carrying the reading', () => {
    const carried = { service: 'checkout', metric: 'request_rate' };
    expect(resolve('request_rate', 'service:storefront/checkout', [carried])).toEqual({
      kind: 'resolved',
      series: carried,
      via: 'entity',
    });
  });

  it('resolves a reading filed under a component the checkpoint is part of, and says it did', () => {
    // The corpus's thirteen: `container_memory_working_set_mebibytes` asserted about a container,
    // measured on the service, because the ranking a solver reads is per service. Refusing this
    // would refuse thirteen annotations; accepting it silently is what the guard used to do.
    const carried = { service: 'checkout', metric: 'container_memory_working_set_mebibytes' };
    expect(
      resolve('container_memory_working_set_mebibytes', 'container:storefront/checkout-app', [carried]),
    ).toEqual({ kind: 'resolved', series: carried, via: 'component' });
  });

  it('refuses a reading on the sibling replica, which is a different component', () => {
    // `checkout-0` and `checkout-1` are both under `checkout` and neither contains the other. A
    // walk that followed containment in both directions from either pod would reach the service and
    // then the other pod, and call two replicas one component -- which is a miss reported as a hit.
    const series = [{ service: 'checkout-1', metric: 'container_restarts_total' }];
    expect(resolve('container_restarts_total', 'pod:storefront/checkout-0', series)).toEqual({
      kind: 'otherComponent',
      metric: 'container_restarts_total',
      entityRef: 'pod:storefront/checkout-0',
      carriers: ['checkout-1'],
    });
  });

  it('refuses a reading carried by an unrelated service', () => {
    const series = [{ service: 'settlement', metric: 'request_rate' }];
    expect(resolve('request_rate', 'service:storefront/checkout', series)).toEqual({
      kind: 'otherComponent',
      metric: 'request_rate',
      entityRef: 'service:storefront/checkout',
      carriers: ['settlement'],
    });
  });

  it('names every series a case declares when the metric is not one of them', () => {
    const series = [
      { service: 'checkout', metric: 'request_rate' },
      { service: 'settlement', metric: 'settlement_lag_seconds' },
    ];
    expect(resolve('request_duration_p99_ms', 'service:storefront/checkout', series)).toEqual({
      kind: 'unknownMetric',
      metric: 'request_duration_p99_ms',
      declares: ['request_rate', 'settlement_lag_seconds'],
    });
  });

  it('drops a series with no metric from the list of what the file declares', () => {
    // A declaration with no metric names nothing, and printing it as an empty entry between two
    // commas is a message that lists three things where the file has two and a half. The field is
    // absent rather than written blank, because the caller hands in the JSON it read.
    const series: ReadingCarrier[] = [{ service: 'checkout', metric: 'request_rate' }, { service: 'checkout' }];
    expect(resolve('request_duration_p99_ms', 'service:storefront/checkout', series)).toEqual({
      kind: 'unknownMetric',
      metric: 'request_duration_p99_ms',
      declares: ['request_rate'],
    });
  });

  it('treats a series with no service as a carrier nothing can compare', () => {
    // `resolveEntityRef` answers `null` for the empty name, so an unattributed reading is neither
    // the entity the checkpoint names nor a component of it. It is listed as the blank it is: the
    // repair is in the signals file, and hiding the entry would send the author to the checkpoint.
    const series: ReadingCarrier[] = [{ metric: 'request_rate' }];
    expect(resolve('request_rate', 'service:storefront/checkout', series)).toEqual({
      kind: 'otherComponent',
      metric: 'request_rate',
      entityRef: 'service:storefront/checkout',
      carriers: [''],
    });
  });

  it('refuses to compare against an entity the graph does not hold', () => {
    const series = [{ service: 'checkout', metric: 'request_rate' }];
    expect(resolve('request_rate', 'pod:storefront/ghost', series)).toEqual({
      kind: 'unknownEntity',
      metric: 'request_rate',
      entityRef: 'pod:storefront/ghost',
    });
  });
});

describe('reading reference · one metric on two entities', () => {
  const SPLIT = [
    { service: 'node-1', metric: 'cluster_members_visible' },
    { service: 'node-4', metric: 'cluster_members_visible' },
  ];

  it('resolves to the half the checkpoint names', () => {
    // `toEqual` on the object, not on its name: the resolver returns the series it matched, and a
    // string would have to be looked up again -- two lookups of one answer is the defect one level
    // down.
    expect(resolve('cluster_members_visible', 'pod:storefront/node-4', SPLIT)).toEqual({
      kind: 'resolved',
      series: { service: 'node-4', metric: 'cluster_members_visible' },
      via: 'entity',
    });
  });

  it('refuses when the named entity is the cluster both halves are inside', () => {
    // The case that finding 299 wrote down as impossible: a partition's evidence is two
    // observations of one quantity that disagree, and a checkpoint about "the cluster" cannot say
    // which side it means. Naming both is the refusal; picking one would be a coin toss reported as
    // an answer.
    expect(resolve('cluster_members_visible', 'service:storefront/cluster', SPLIT)).toEqual({
      kind: 'ambiguous',
      metric: 'cluster_members_visible',
      entityRef: 'service:storefront/cluster',
      carriers: ['node-1', 'node-4'],
    });
  });

  it('reports a duplicate pair rather than resolving it to whichever came first', () => {
    const duplicated = [
      { service: 'node-1', metric: 'cluster_members_visible' },
      { service: 'node-1', metric: 'cluster_members_visible' },
    ];
    expect(resolve('cluster_members_visible', 'pod:storefront/node-1', duplicated)).toEqual({
      kind: 'ambiguous',
      metric: 'cluster_members_visible',
      entityRef: 'pod:storefront/node-1',
      carriers: ['node-1', 'node-1'],
    });
  });

  it('lists a carrier whose service the graph does not hold, rather than dropping it', () => {
    // Dropping it would leave "the metric is declared on nothing", which sends the author to the
    // checkpoint. The name that has no entity is the defect, so it is the name that is reported.
    const series = [{ service: 'node-9', metric: 'cluster_members_visible' }];
    expect(resolve('cluster_members_visible', 'pod:storefront/node-1', series)).toEqual({
      kind: 'otherComponent',
      metric: 'cluster_members_visible',
      entityRef: 'pod:storefront/node-1',
      carriers: ['node-9'],
    });
  });
});

describe('reading reference · the sentence each refusal gets', () => {
  const refusals: ReadingRefusal[] = [
    { kind: 'unknownMetric', metric: 'request_rate', declares: ['a', 'b'] },
    { kind: 'unknownMetric', metric: 'request_rate', declares: [] },
    { kind: 'unknownEntity', metric: 'request_rate', entityRef: 'pod:storefront/ghost' },
    { kind: 'otherComponent', metric: 'request_rate', entityRef: 'service:storefront/checkout', carriers: ['settlement'] },
    {
      kind: 'ambiguous',
      metric: 'cluster_members_visible',
      entityRef: 'service:storefront/cluster',
      carriers: ['node-1', 'node-4'],
    },
  ];

  it('names the metric and the entity in every refusal, so the sentence is a repair', () => {
    // Asserted over the list rather than one kind at a time: the first draft of the guard's messages
    // dropped the metric from two of them, and a reader sent to "the signals file" with no name in
    // hand is a reader sent to grep. The property is that both halves of the pair are quoted.
    for (const refusal of refusals) {
      const sentence = describeReadingProblem(refusal);
      expect(sentence).toContain(`'${refusal.metric}'`);
      if ('entityRef' in refusal) expect(sentence).toContain(`'${refusal.entityRef}'`);
      expect(sentence.startsWith('names ')).toBe(true);
    }
  });

  it('says "none" rather than printing an empty list when a case declares nothing', () => {
    expect(describeReadingProblem({ kind: 'unknownMetric', metric: 'request_rate', declares: [] })).toContain(
      '(it declares: none)',
    );
  });

  it('names both carriers when the entity cannot tell them apart', () => {
    expect(
      describeReadingProblem({
        kind: 'ambiguous',
        metric: 'cluster_members_visible',
        entityRef: 'service:storefront/cluster',
        carriers: ['node-1', 'node-4'],
      }),
    ).toContain('2 series carry it where that entity cannot tell them apart (node-1, node-4)');
  });
});
