# Data model — the Intermediate Representation (IR)

The IR is the canonical form every source is transformed into and every exporter is
generated from. Version is tracked by `IR_VERSION` (currently `2.0`); any breaking
change bumps it.

## Two hard invariants

Enforced by `zod` schemas and type guards, not by convention:

1. **Reference integrity** — every entity reference (`entityRef`, `fromEntityId`,
   `rootCauseEntityId`, …) MUST resolve against the `EntityGraph`.
2. **Provenance safety** — a field whose `provenance.source === 'inferred'` MUST NOT
   back a ground-truth key field (root cause entity, injection time, causal chain).

## Layer 1 — `TelemetrySignal`

A single observed fact. `signal` must equal `payload.kind` (checked in the schema).

```ts
interface TelemetrySignal {
  irVersion: string;
  resource: { 'service.name': string; [k: string]: string | undefined };
  timestamp: string;          // canonical UTC ISO-8601
  rawOffsetMinutes?: number;  // offset of the source value, minutes east of UTC
  signal: SignalKind;         // 'metric' | 'log' | 'trace' | 'event' | 'alert' | 'profile'
  payload: SignalPayload;
  provenance?: Record<string, FieldProvenance>; // per-field origin tracking
}
```

`SignalPayload` is a discriminated union over the six signal kinds (`metric`, `log`,
`trace`, `event`, `alert`, `profile`), each carrying only the fields that kind needs.

## Layer 2 — `EntityGraph`

The topology. `Entity.id` is globally unique as `${kind}:${namespace}/${name}`.
Aliases are merged with union-find over `same_as` edges.

```ts
interface Entity { entityId: string; kind: EntityKind; name: string; aliases: string[]; }
interface EntityEdge { from: string; to: string; relation: 'contains'|'hosts'|'calls'|'same_as'; }
interface EntityGraph { entities: Entity[]; edges: EntityEdge[]; }
```

## Layer 3 — `FaultCase`

One failure plus everything a benchmark needs to evaluate it.

```ts
interface FaultCase {
  caseId: string;
  system: string;
  environment: { system: string; version?: string; deployRef?: string; checksums?: Record<string,string> };
  injectTime: string;                 // canonical UTC ISO-8601 onset
  window: { start: string; end: string };
  fault: { type: string; category: FaultCategory; injectionMethod?: ...; parameters?: ... };
  groundTruth: GroundTruth;
  query?: string;                     // natural-language task description
  difficulty?: 'L1'|'L2'|'L3'|'L4';
  quality?: QualityGateReport;
  answerKeyIsolated?: boolean;        // true when answer key is stored separately
}
```

`GroundTruth` carries the answer key: `rootCauseEntityId`, `rootCauseComponent`,
`rootCauseReason`, optional `rootCauseIndicators`, a step-wise `causalChain`
(`CausalStep[]`), `evidenceCheckpoints` (`EvidenceCheckpoint[]`) and `remediation`.

## Layer 4 — `QualityGateReport`

The evidence the case is usable. Produced by `runAllGates`.

```ts
interface QualityGateReport {
  caseId: string;
  irVersion: string;
  results: GateResult[];                       // G1…G5
  finalStatus: 'admitted' | 'quarantined' | 'rejected';
  mutationTestPassed?: boolean;                // true only when the mutation suite passed
}
```

## Field provenance

Every transform can record where a value came from, making generated rules auditable
and reproducible.

```ts
interface FieldProvenance {
  source: 'direct' | 'derived' | 'inferred' | 'defaulted';
  ruleId?: string;
  modelId?: string;        // LLM model, when rule was generated
  promptVersion?: string;
  confidence?: number;     // 0..1
}
```
