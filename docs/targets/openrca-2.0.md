# OpenRCA 2.0 (PAVE) — field contract

> **Process supervision instead of outcome labels.** The PAVE protocol
> (*Path Annotation via Verified Effects*) annotates the verified propagation path from
> the intervention to the symptom, and every causal edge must satisfy three conjunctive gates.

| | |
| --- | --- |
| Vendor / venue | Microsoft, arXiv 2606.27154 |
| Contract version | `pave-v1` (`OPENRCA2_CONTRACT_VERSION`) |
| Emitter | [`src/export/openrca2.ts`](../../packages/core/src/export/openrca2.ts) |
| CLI target id | `openrca-2.0` |
| Modalities | metrics, logs, traces (+ causal path) |
| Timezone | UTC+8 telemetry layout of 1.0; `causal_path.json` itself is canonical UTC |

## The three gates

| Gate | Meaning | How the exporter computes it |
| --- | --- | --- |
| **structural** | the edge conforms to the dependency topology | both endpoints resolve into `EntityGraph` (`from_entity.name` and `to_entity.name` are non-null) |
| **statistical** | the downstream deviates significantly from baseline | the step carries at least one resolved evidence checkpoint |
| **temporal** | the effect onsets after its cause | `step` is strictly greater than the previous step's |

All three must be `true` for a step to be considered verified. The exporter never
fabricates a `true`: a dangling endpoint or a missing checkpoint produces `false` and the
case stays visible as unverified rather than being silently repaired.

## Directory layout

```text
cases/
└── {caseId}/
    └── causal_path.json
```

The telemetry tree of OpenRCA 1.0 is reused unchanged; `causal_path.json` is the
2.0-specific artefact.

## Files

### `cases/{caseId}/causal_path.json`

<!-- fields: openrca-2.0/cases/{caseId}/causal_path.json -->
| Field | Type | Required | Source (IR) | Notes |
| --- | --- | --- | --- | --- |
| `case_id` | string | yes | `FaultCase.caseId` |  |
| `system` | string | yes | `FaultCase.system` | System / namespace the case belongs to. |
| `root_cause.entity_id` | string | yes | `GroundTruth.rootCauseEntityId` | Must resolve into the topology. |
| `root_cause.component` | string | yes | `GroundTruth.rootCauseComponent` |  |
| `root_cause.fault_type` | string | yes | `FaultCase.fault.type` | Raw (non-normalised) fault type. |
| `causal_path[]` | array | yes | `GroundTruth.causalChain` | Ordered propagation edges; empty array when the case has no chain. |
| `causal_path[].step` | number | yes | `CausalStep.step` | Strictly increasing; drives the temporal gate. |
| `causal_path[].from_entity.entity_id` | string | yes | `CausalStep.fromEntityId` |  |
| `causal_path[].from_entity.name` | string \| null | yes | `index.byId(fromEntityId).name` | null when the endpoint is dangling (which fails the structural gate). |
| `causal_path[].to_entity.entity_id` | string | yes | `CausalStep.toEntityId` |  |
| `causal_path[].to_entity.name` | string \| null | yes | `index.byId(toEntityId).name` |  |
| `causal_path[].mechanism` | string | yes | `CausalStep.mechanism` | Human-readable propagation mechanism. |
| `causal_path[].verification.structural` | boolean | yes | `both endpoints resolve into topology` | Gate 1: the edge conforms to the dependency topology. |
| `causal_path[].verification.statistical` | boolean | yes | `evidence.length &gt; 0` | Gate 2: at least one evidence checkpoint supports the edge. |
| `causal_path[].verification.temporal` | boolean | yes | `step &gt; previous.step` | Gate 3: the effect onsets after its cause. |
| `causal_path[].evidence[]` | array | yes | `CausalStep.evidenceRefs -&gt; EvidenceCheckpoint` | Unresolvable refs are dropped from the array (and then fail gate 2). |
| `causal_path[].evidence[].signal_ref` | string \| null | yes | `EvidenceCheckpoint.signalRef ?? null` |  |
| `causal_path[].evidence[].comparator` | string | yes | `EvidenceCheckpoint.comparator` | One of &gt; &gt;= &lt; &lt;= == != contains matches. |
| `causal_path[].evidence[].value` | number \| string | yes | `EvidenceCheckpoint.value` |  |
| `causal_path[].evidence[].unit` | string \| null | yes | `EvidenceCheckpoint.unit ?? null` | UCUM-style unit. |
| `causal_path[].evidence[].description` | string | yes | `EvidenceCheckpoint.description` |  |
<!-- /fields -->

<!-- example: openrca-2.0/cases/case-001/causal_path.json -->
```json
{
  "case_id": "case-001",
  "system": "order-prod",
  "root_cause": {
    "entity_id": "service:default/order",
    "component": "order",
    "fault_type": "cpu"
  },
  "causal_path": [
    {
      "step": 1,
      "from_entity": {
        "entity_id": "service:default/order",
        "name": "order"
      },
      "to_entity": {
        "entity_id": "service:default/cart",
        "name": "cart"
      },
      "mechanism": "thread pool exhaustion propagated to the downstream cart service",
      "verification": {
        "structural": true,
        "statistical": true,
        "temporal": true
      },
      "evidence": [
        {
          "signal_ref": "order|cpu_usage",
          "comparator": ">",
          "value": 90,
          "unit": "%",
          "description": "CPU usage exceeds 90 percent"
        }
      ]
    }
  ]
}
```

## Exporting

```bash
rca-bench export --target openrca-2.0 --input examples/order-prod/bundle.json --out-dir ./out
```

Two invariants are enforced before any file is written:

1. the case has at least one telemetry signal → otherwise skipped with
   `no telemetry signals attached`;
2. `GroundTruth.rootCauseEntityId` resolves into the topology → otherwise skipped with
   `root-cause entity does not resolve into topology`.

## Scoring

```bash
rca-bench score --target openrca-2.0 --dir ./out
```

| Check | What it proves |
| --- | --- |
| `case-present` | at least one `causal_path.json` was emitted |
| `causal-path-shape` | `case_id`, `system`, `root_cause.{entity_id,component,fault_type}` are present and typed |
| (step gates) | each step's `verification` triple is re-evaluated by the scorer |

The structural check answers *is this well-formed*. Whether it is **scorable** is a
different question, and a different command:

```bash
rca-bench official --target openrca-2.0 --dir ./out
```

It scores the four facets the PAVE contract carries — root cause, fault type, causal
chain and evidence — against the exported answer key. The metric is labelled
**derived**, not `official`, because the OpenRCA 2.0 scorer is not open-sourced; the
label travels with every score so the distinction can never be lost.

## Failure modes

| Symptom | Cause | Fix |
| --- | --- | --- |
| `statistical: false` | `evidenceRefs` point at checkpoints that do not exist, or the case has no checkpoints | add `groundTruth.evidenceCheckpoints` and reference them from each `CausalStep` |
| `structural: false` | endpoint ids are not in `graph.entities` | add the entities (and their aliases) to the bundle graph |
| `temporal: false` | causal steps are not in increasing order | renumber `CausalStep.step` |

## Boundaries

- **The official OpenRCA 2.0 evaluation framework and scorer are not open-sourced.**
  This exporter emits a PAVE-semantic annotation contract, not a byte-compatible official
  file. The field names follow the PAVE description; the on-disk layout is ours.
- Cases without a causal chain are still exported, with `causal_path: []`. An empty chain
  is a statement about the data, not an error.
