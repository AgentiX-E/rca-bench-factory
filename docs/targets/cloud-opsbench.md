# Cloud-OpsBench — field contract

> **Agentic State-Snapshot benchmark.** The scored artefact is `metadata.json`, whose
> `result` triple is the outcome ground truth
> **⟨Stage, Component, Root Cause⟩ = ⟨fault_taxonomy, fault_object, root_cause⟩**.

| | |
| --- | --- |
| Reference | arXiv 2603.00468 |
| Contract version | `v1` (`CLOUD_OPSBENCH_CONTRACT_VERSION`) |
| Emitter | [`src/export/cloudopsbench.ts`](../../packages/core/src/export/cloudopsbench.ts) |
| CLI target id | `cloud-opsbench` |
| Modalities | metrics, logs, traces, config / state snapshot |

## Full upstream layout vs. what the factory emits

```text
benchmark/{system}/{fault_category}/{case_id}/
├── metadata.json        # ✅ emitted — fault label + namespace + query + outcome ground truth
├── tool_cache.json      # ⛔ Digital Twin: pre-rendered tool responses (live cluster)
├── code/                # ⛔ trimmed source (Online Boutique only)
└── raw_data/
    ├── alert.json       # ⛔ alert + anomaly evidence
    ├── k8s_states.json  # ⛔ Kubernetes object snapshots
    ├── logs.json        # ⛔ service/container logs
    └── metrics.csv      # ⛔ time-series metrics (absent for early-lifecycle faults)
```

`tool_cache.json`, `k8s_states.json` and `code/` require a **live Kubernetes snapshot**;
`process-label/` and `golden-trajectory/` require **expert annotation**. Neither is
derivable from a static per-case IR, and the factory does not pretend otherwise.

## Files

### `cases/{caseId}/metadata.json`

<!-- fields: cloud-opsbench/cases/{caseId}/metadata.json -->
| Field | Type | Required | Source (IR) | Notes |
| --- | --- | --- | --- | --- |
| `namespace` | string | yes | `FaultCase.system` | The k8s namespace / system under test. |
| `query` | string | yes | `FaultCase.query ?? GroundTruth.rootCauseReason` |  |
| `difficulty` | string | yes | `difficultyFor(FaultCase.difficulty)` | L1-&gt;easy, L2-&gt;medium, L3/L4-&gt;hard, unset-&gt;medium. |
| `result.fault_taxonomy` | string | yes | `TAXONOMY_BY_CATEGORY[fault.category]` | Performance_Fault \| Infrastructure_Fault \| Runtime_Fault \| Service_Fault \| Code_Fault \| Startup_Fault. |
| `result.fault_object` | string | yes | `GroundTruth.rootCauseComponent` | The scored component. |
| `result.root_cause` | string | yes | `normalizeFaultType(fault.type).replace(/-/g, "_")` | snake_case root-cause token, e.g. `cpu_stress`. |
<!-- /fields -->

<!-- example: cloud-opsbench/cases/case-001/metadata.json -->
```json
{
  "namespace": "order-prod",
  "query": "The order service became slow at 08:10 UTC+8. Find the root cause.",
  "difficulty": "medium",
  "result": {
    "fault_taxonomy": "Performance_Fault",
    "fault_object": "order",
    "root_cause": "cpu"
  }
}
```

## Lifecycle-stage taxonomy

The IR fault categories are a **mechanism** taxonomy while the benchmark's taxonomy is a
**lifecycle-stage** taxonomy. The mapping below is a documented best-effort projection,
not a claimed equivalence.

| IR `fault.category` | `result.fault_taxonomy` |
| --- | --- |
| `resource` | `Performance_Fault` |
| `network` | `Infrastructure_Fault` |
| `runtime` | `Runtime_Fault` |
| `middleware`, `dependency` | `Service_Fault` |
| `code` | `Code_Fault` |
| `config` | `Startup_Fault` |
| `unknown` | `Runtime_Fault` |

## Difficulty mapping

| IR `difficulty` | `difficulty` |
| --- | --- |
| `L1` | `easy` |
| `L2` | `medium` |
| `L3`, `L4` | `hard` |
| unset | `medium` |

## Exporting

```bash
rca-bench export --target cloud-opsbench --input examples/order-prod/bundle.json --out-dir ./out
```

A case without `groundTruth.rootCauseComponent` is skipped with
`missing root-cause component` — the outcome ground truth would be unanswerable without it.

## Scoring

```bash
rca-bench score --target cloud-opsbench --dir ./out
```

| Check | What it proves |
| --- | --- |
| `case-present` | at least one `metadata.json` was emitted |
| `metadata-shape` | `namespace`, `query`, `difficulty` and the `result` triple are present and typed |

The structural check answers *is this well-formed*. Whether it is **scorable** is a
different question, and a different command:

```bash
rca-bench official --target cloud-opsbench --dir ./out
```

It runs the published Cloud-OpsBench outcome metric (arXiv 2603.00468 §4.1.1): Joint
RCA Accuracy, the share of episodes where the faulty component **and** the fault type
both match. The exported answer key must score 1.0, and perturbing either half of the
pair drops the episode.

## Failure modes

| Symptom | Cause | Fix |
| --- | --- | --- |
| `missing root-cause component` | `groundTruth.rootCauseComponent` is `''` | author the component |
| `root_cause` has dashes | normalisation did not fire | the exporter snake-cases the *normalised* type; check `normalizeFaultType` coverage |

## Boundaries

- Only the static, verifiable part of the contract is produced.
- No timestamps: `metadata.json` is an outcome label, not a time-series container.
