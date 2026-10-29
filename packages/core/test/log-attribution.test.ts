import { describe, expect, it } from 'vitest';
import { checkLogAttribution, type LogLineAttribution } from '../src/fault/log-attribution.js';
import { isContainedIn, sameComponent } from '../src/entity/graph.js';
import type { EntityGraph, FaultCase } from '../src/ir/types.js';

/**
 * A log checkpoint states a phrase, the line it cites, and an entity. Nothing compared the last two.
 *
 * The guard has checked a log checkpoint's phrase against the body it cites since finding 286, and it
 * resolves the `entityRef` through the four-layer assessment. Between those two checks is a join
 * nothing made: **whose line is it**. A checkpoint naming the checkout pod can cite a line emitted by
 * the settlement parser and pass both -- the phrase is in the body, and the pod exists.
 *
 * The relation the rule states is not equality. A pod's checkpoint may cite a line its container
 * wrote, and a container's may cite a line the pod's replicas wrote, because those are one component
 * at two resolutions -- the same judgement `classifyDisplacement` makes about a ranking, and the
 * second caller of it is why the definition now lives in `entity/graph.ts` rather than inside
 * `fault/displacement.ts`.
 *
 * What it must not accept is the wrong *replica*: two pods of one service are siblings, not
 * ancestors, and a line from `checkout-1` is not a line from `checkout-0`.
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
 * Two components and one node, which is the whole of what these rules need.
 *
 * The settlement pieces are here so that "a line from the other service" is a real other service
 * rather than a name the graph does not hold, and the two checkout pods are siblings rather than
 * relatives so that the replica rule has something to refuse.
 */
const GRAPH: EntityGraph = {
  entities: [
    entity('service', 'checkout'),
    entity('pod', 'checkout-0'),
    entity('pod', 'checkout-1'),
    entity('service', 'settlement'),
    entity('pod', 'settlement-0'),
    entity('node', 'worker-3'),
  ],
  edges: [
    { from: 'service:storefront/checkout', to: 'pod:storefront/checkout-0', relation: 'contains' },
    { from: 'service:storefront/checkout', to: 'pod:storefront/checkout-1', relation: 'contains' },
    { from: 'service:storefront/settlement', to: 'pod:storefront/settlement-0', relation: 'contains' },
    { from: 'node:storefront/worker-3', to: 'pod:storefront/settlement-0', relation: 'hosts' },
  ],
};

function faultCase(
  checkpoints: NonNullable<FaultCase['groundTruth']['evidenceCheckpoints']>,
): FaultCase {
  return {
    caseId: 'history-test',
    system: 'storefront',
    injectTime: '2026-10-21T09:41:00.000Z',
    window: { start: '2026-10-21T09:21:00.000Z', end: '2026-10-21T10:09:00.000Z' },
    fault: { type: 'disk-full', category: 'resource' },
    groundTruth: {
      rootCauseEntityId: 'pod:storefront/checkout-0',
      rootCauseComponent: 'checkout',
      rootCauseReason: 'the pod never trims what it writes, so its volume is full',
      evidenceCheckpoints: checkpoints,
    },
  };
}

function logCheckpoint(entityRef: string, signalRef = 'agent-enospc'): FaultCase['groundTruth']['evidenceCheckpoints'] {
  return [
    {
      checkpointId: 'cp-log',
      entityRef,
      signalRef,
      signalKind: 'log',
      comparator: 'contains',
      value: 'no space left on device',
      description: 'the write fails in the component the checkpoint names',
    },
  ];
}

const LINE = [{ id: 'agent-enospc', service: 'checkout-0', body: 'write: no space left on device' }];

describe('a log checkpoint is joined to the entity it names', () => {
  it('accepts a checkpoint and a line attributed to the same entity', () => {
    expect(checkLogAttribution({ graph: GRAPH, case: faultCase(logCheckpoint('pod:storefront/checkout-0')), logs: LINE })).toEqual([]);
  });

  it('accepts a checkpoint one resolution coarser than the line, in both directions', () => {
    // The corpus has both shapes today: `code-null-dereference-reporting` names the container while
    // its line says the service, and this round's log line is written by a container under a pod
    // checkpoint. Equality would refuse three of the seven log checkpoints the corpus carries, and
    // the other four happen to agree on the name -- which is why equality looked right.
    expect(
      checkLogAttribution({
        graph: GRAPH,
        case: faultCase(logCheckpoint('service:storefront/checkout')),
        logs: [{ id: 'agent-enospc', service: 'checkout-0', body: 'write: no space left on device' }],
      }),
    ).toEqual([]);
    expect(
      checkLogAttribution({
        graph: GRAPH,
        case: faultCase(logCheckpoint('pod:storefront/checkout-0')),
        logs: [{ id: 'agent-enospc', service: 'checkout', body: 'write: no space left on device' }],
      }),
    ).toEqual([]);
  });

  it('refuses a line attributed to another component', () => {
    const problems = checkLogAttribution({
      graph: GRAPH,
      case: faultCase(logCheckpoint('pod:storefront/checkout-0')),
      logs: [{ id: 'agent-enospc', service: 'settlement', body: 'write: no space left on device' }],
    });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("checkpoint 'cp-log'");
    expect(problems[0]).toContain("names 'pod:storefront/checkout-0'");
    expect(problems[0]).toContain("attributed to 'settlement'");
    expect(problems[0]).toContain('a different component');
  });

  it('refuses the wrong replica, which is a sibling rather than a resolution', () => {
    // A sibling is not an ancestor: `classifyDisplacement` refuses the same move for a ranking, and
    // the reason is the same -- two pods of one service are two components, however alike.
    const problems = checkLogAttribution({
      graph: GRAPH,
      case: faultCase(logCheckpoint('pod:storefront/checkout-0')),
      logs: [{ id: 'agent-enospc', service: 'checkout-1', body: 'write: no space left on device' }],
    });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('a different component');
  });

  it('refuses a line attributed to a name no entity holds', () => {
    const problems = checkLogAttribution({
      graph: GRAPH,
      case: faultCase(logCheckpoint('pod:storefront/checkout-0')),
      logs: [{ id: 'agent-enospc', service: 'the collector', body: 'write: no space left on device' }],
    });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("attributed to 'the collector'");
    expect(problems[0]).toContain('no single entity');
  });

  it('resolves a line attributed by an alias, because an alias names the entity', () => {
    const graph: EntityGraph = {
      entities: [
        entity('pod', 'checkout-0'),
        entity('container', 'checkout-app', ['the checkout process']),
        entity('service', 'checkout'),
      ],
      edges: [
        { from: 'service:storefront/checkout', to: 'pod:storefront/checkout-0', relation: 'contains' },
        { from: 'pod:storefront/checkout-0', to: 'container:storefront/checkout-app', relation: 'contains' },
      ],
    };
    expect(
      checkLogAttribution({
        graph,
        case: faultCase(logCheckpoint('pod:storefront/checkout-0')),
        logs: [{ id: 'agent-enospc', service: 'the checkout process', body: 'write: no space left on device' }],
      }),
    ).toEqual([]);
  });

  it('says nothing about a series checkpoint, whose subject is a number rather than a line', () => {
    const checkpoints: FaultCase['groundTruth']['evidenceCheckpoints'] = [
      {
        checkpointId: 'cp-volume',
        entityRef: 'pod:storefront/checkout-0',
        signalRef: 'volume_percent',
        comparator: '==',
        value: 100,
        unit: '%',
        description: 'the volume is at its ceiling',
      },
    ];
    expect(
      checkLogAttribution({
        graph: GRAPH,
        case: faultCase(checkpoints),
        logs: [{ id: 'volume_percent', service: 'settlement', body: 'this is not a line anyone cites' }],
      }),
    ).toEqual([]);
  });

  it('leaves an unresolvable checkpoint entity and an unknown log id to the checks that own them', () => {
    // One defect, one message. The four-layer assessment refuses a checkpoint naming no entity, and
    // the guard refuses a checkpoint naming a log the signals file does not declare; repeating
    // either here would report the same repair twice under two names.
    expect(
      checkLogAttribution({
        graph: GRAPH,
        case: faultCase(logCheckpoint('pod:storefront/nowhere')),
        logs: LINE,
      }),
    ).toEqual([]);
    expect(
      checkLogAttribution({
        graph: GRAPH,
        case: faultCase(logCheckpoint('pod:storefront/checkout-0', 'not-declared')),
        logs: LINE,
      }),
    ).toEqual([]);
  });

  it('reads every log checkpoint, not the first', () => {
    const checkpoints: FaultCase['groundTruth']['evidenceCheckpoints'] = [
      ...(logCheckpoint('pod:storefront/checkout-0') ?? []),
      {
        checkpointId: 'cp-log-b',
        entityRef: 'pod:storefront/settlement-0',
        signalRef: 'agent-enospc',
        signalKind: 'log',
        comparator: 'contains',
        value: 'no space left on device',
        description: 'a second checkpoint over the same line',
      },
    ];
    const problems = checkLogAttribution({ graph: GRAPH, case: faultCase(checkpoints), logs: LINE });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("checkpoint 'cp-log-b'");
  });

  it('has nothing to say about a case with no checkpoints at all', () => {
    expect(checkLogAttribution({ graph: GRAPH, case: faultCase(undefined), logs: LINE })).toEqual([]);
  });

  it('skips log entries it could not be cited by, because they cannot be the join', () => {
    // The guard hands this rule the array it parsed out of the signals file with its own
    // `typeof` checks rather than through a schema, so an entry with no `id`, an empty `id`, or no
    // entry at all is a shape the rule has to survive. None of them can be cited by a `signalRef`,
    // so skipping is the whole of the correct behaviour -- and a throw here would take the run down
    // over a line no checkpoint names.
    const unusable = [
      { service: 'settlement', body: 'a line nobody can cite' },
      { id: '', service: 'settlement', body: 'an empty id cites nothing' },
      null,
    ] as unknown as LogLineAttribution[];
    expect(
      checkLogAttribution({
        graph: GRAPH,
        case: faultCase(logCheckpoint('pod:storefront/checkout-0')),
        logs: unusable,
      }),
    ).toEqual([]);
    // The usable entry beside them is still read: skipping is per entry, not per file.
    const problems = checkLogAttribution({
      graph: GRAPH,
      case: faultCase(logCheckpoint('pod:storefront/checkout-0')),
      logs: [...unusable, { id: 'agent-enospc', service: 'settlement', body: 'a real line' }],
    });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("attributed to 'settlement'");
    // And the empty id is not a name a checkpoint can reach. A checkpoint with no `signalRef`
    // resolves to `''`, so an entry registered under `''` would be *found* by it and joined against
    // -- the one input that makes the empty-id guard observable rather than merely present.
    const noReference: FaultCase['groundTruth']['evidenceCheckpoints'] = [
      {
        checkpointId: 'cp-log',
        entityRef: 'pod:storefront/checkout-0',
        signalKind: 'log',
        comparator: 'contains',
        value: 'no space left on device',
        description: 'a checkpoint that never says which line it means',
      },
    ];
    expect(
      checkLogAttribution({
        graph: GRAPH,
        case: faultCase(noReference),
        logs: [{ id: '', service: 'settlement', body: 'an empty id names no line' }],
      }),
    ).toEqual([]);
  });

  it('leaves a log checkpoint with no reference to the checks that resolve references', () => {
    // `signalRef` is optional, and a checkpoint that declares `signalKind: 'log'` without one names
    // no line at all. That is the reference-resolution check's defect, not this rule's: there is
    // nothing here to join, and reporting it twice would give one repair two names.
    const checkpoints: FaultCase['groundTruth']['evidenceCheckpoints'] = [
      {
        checkpointId: 'cp-log',
        entityRef: 'pod:storefront/checkout-0',
        signalKind: 'log',
        comparator: 'contains',
        value: 'no space left on device',
        description: 'a checkpoint that never says which line it means',
      },
    ];
    expect(checkLogAttribution({ graph: GRAPH, case: faultCase(checkpoints), logs: LINE })).toEqual([]);
  });

  it('refuses a line that names no author at all, rather than treating silence as agreement', () => {
    // The other direction of the same join: a checkpoint naming a real entity and citing a line
    // whose entry declares no `service`. Nothing can be compared, and skipping it would let the one
    // case this rule exists for -- a phrase taken from nowhere in particular -- pass by saying
    // nothing. The name in the message is empty because the file gave none, and that is the finding.
    const problems = checkLogAttribution({
      graph: GRAPH,
      case: faultCase(logCheckpoint('pod:storefront/checkout-0')),
      logs: [{ id: 'agent-enospc', body: 'write: no space left on device' }],
    });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("cites log 'agent-enospc'");
    expect(problems[0]).toContain('no single entity by that name');
  });
});

describe('the same-component judgement, which two callers now share', () => {
  it('is reflexive and follows containment in one direction only', () => {
    expect(sameComponent(GRAPH, 'pod:storefront/checkout-0', 'pod:storefront/checkout-0')).toBe(true);
    expect(sameComponent(GRAPH, 'service:storefront/checkout', 'pod:storefront/checkout-0')).toBe(true);
    expect(sameComponent(GRAPH, 'pod:storefront/checkout-0', 'service:storefront/checkout')).toBe(true);
    // A node reaches the pod it hosts, and the pod does not reach the node.
    expect(isContainedIn(GRAPH, 'node:storefront/worker-3', 'pod:storefront/settlement-0')).toBe(true);
    expect(isContainedIn(GRAPH, 'pod:storefront/settlement-0', 'node:storefront/worker-3')).toBe(false);
  });

  it('keeps siblings apart', () => {
    expect(sameComponent(GRAPH, 'pod:storefront/checkout-0', 'pod:storefront/checkout-1')).toBe(false);
    expect(sameComponent(GRAPH, 'service:storefront/checkout', 'service:storefront/settlement')).toBe(false);
  });

  it('terminates on a cycle rather than walking it forever', () => {
    // Containment is not a tree on a real graph: a shuffled duplicate edge, or a `same_as` merge,
    // can produce a cycle, and a walk that visits `a` twice would not return at all.
    const cyclic: EntityGraph = {
      entities: [entity('service', 'a'), entity('pod', 'a-0')],
      edges: [
        { from: 'service:storefront/a', to: 'pod:storefront/a-0', relation: 'contains' },
        { from: 'pod:storefront/a-0', to: 'service:storefront/a', relation: 'contains' },
      ],
    };
    expect(isContainedIn(cyclic, 'service:storefront/a', 'pod:storefront/a-0')).toBe(true);
    expect(isContainedIn(cyclic, 'pod:storefront/a-0', 'service:storefront/a')).toBe(true);
    expect(isContainedIn(cyclic, 'service:storefront/a', 'pod:storefront/absent')).toBe(false);
  });
});
