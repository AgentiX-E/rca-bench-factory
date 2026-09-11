# ITBench (SRE Diagnosis) — field contract

> **Scenario specification with a diagnosis ground truth.** Three things are recorded —
> the entities in the propagation chain, the chain itself, and the fault conditions — which
> map one-to-one onto the IR `GroundTruth` triple.

| | |
| --- | --- |
| Reference | IBM Research, arXiv 2502.05352 |
| Contract version | `v1` (`ITBENCH_CONTRACT_VERSION`) |
| Emitter | [`src/export/itbench.ts`](../../packages/core/src/export/itbench.ts) |
| CLI target id | `itbench` |
| Modalities | metrics, logs, traces, events, change / deploy events |
| Persona | `SRE` only (CISO and FinOps are out of scope) |

## Mapping

| ITBench ground truth | IR source |
| --- | --- |
| `diagnosis.entities[]` | `rootCauseEntityId` + every `CausalStep` endpoint (deduped, root cause first) |
| `diagnosis.fault_propagation_chain[]` | `GroundTruth.causalChain` |
| `diagnosis.fault_conditions[]` | `GroundTruth.evidenceCheckpoints` |

## Files

### `scenarios/{caseId}/scenario.json`

<!-- fields: itbench/scenarios/{caseId}/scenario.json -->
| Field | Type | Required | Source (IR) | Notes |
| --- | --- | --- | --- | --- |
| `scenario_name` | string | yes | `FaultCase.caseId` |  |
| `scenario_description` | string | yes | `FaultCase.query ?? GroundTruth.rootCauseReason` |  |
| `scenario_domain` | string | yes | `constant "SRE"` | Only the SRE persona is targeted. |
| `scenario_class` | string | yes | `CLASS_BY_CATEGORY[fault.category]` | HighCPU \| NetworkPartition \| CrashLoopBackOff \| ServiceDegradation \| CorruptImage \| Misconfiguration \| DependencyFailure \| Unknown. |
| `scenario_complexity` | string | yes | `complexityFor(FaultCase.difficulty)` | easy \| medium \| hard. |
| `scenario_groundtruth.diagnosis.entities[]` | string[] | yes | `rootCauseEntityId + chain endpoints` | Deduplicated, root cause first. |
| `scenario_groundtruth.diagnosis.fault_propagation_chain[]` | array | yes | `GroundTruth.causalChain` |  |
| `...chain[].step` | number | yes | `CausalStep.step` |  |
| `...chain[].from_entity` | string | yes | `CausalStep.fromEntityId` |  |
| `...chain[].to_entity` | string | yes | `CausalStep.toEntityId` |  |
| `...chain[].mechanism` | string | yes | `CausalStep.mechanism` |  |
| `scenario_groundtruth.diagnosis.fault_conditions[]` | array | yes | `GroundTruth.evidenceCheckpoints` |  |
| `...fault_conditions[].checkpoint_id` | string | yes | `EvidenceCheckpoint.checkpointId` |  |
| `...fault_conditions[].entity` | string | yes | `EvidenceCheckpoint.entityRef` |  |
| `...fault_conditions[].signal_ref` | string | no | `EvidenceCheckpoint.signalRef` | Omitted when absent. |
| `...fault_conditions[].comparator` | string | yes | `EvidenceCheckpoint.comparator` |  |
| `...fault_conditions[].value` | number \| string | yes | `EvidenceCheckpoint.value` |  |
| `...fault_conditions[].unit` | string | no | `EvidenceCheckpoint.unit` | Omitted when absent. |
| `...fault_conditions[].description` | string | yes | `EvidenceCheckpoint.description` |  |
<!-- /fields -->

<!-- example: itbench/scenarios/case-001/scenario.json -->
```json
{
  "scenario_name": "case-001",
  "scenario_description": "The order service became slow at 08:10 UTC+8. Find the root cause.",
  "scenario_domain": "SRE",
  "scenario_class": "HighCPU",
  "scenario_complexity": "medium",
  "scenario_groundtruth": {
    "diagnosis": {
      "entities": [
        "service:default/order",
        "service:default/cart"
      ],
      "fault_propagation_chain": [
        {
          "step": 1,
          "from_entity": "service:default/order",
          "to_entity": "service:default/cart",
          "mechanism": "thread pool exhaustion propagated to the downstream cart service"
        }
      ],
      "fault_conditions": [
        {
          "checkpoint_id": "cp-1",
          "entity": "service:default/order",
          "signal_ref": "order|cpu_usage",
          "comparator": ">",
          "value": 90,
          "unit": "%",
          "description": "CPU usage exceeds 90 percent"
        }
      ]
    }
  }
}
```

## Scenario classes

The IR category vocabulary is a mechanism taxonomy; ITBench scenario classes are concrete
incident groupings. The projection below is documented best-effort — the precise fault type
is always preserved verbatim inside `scenario_groundtruth`.

| IR `fault.category` | `scenario_class` |
| --- | --- |
| `resource` | `HighCPU` |
| `network` | `NetworkPartition` |
| `runtime` | `CrashLoopBackOff` |
| `middleware` | `ServiceDegradation` |
| `code` | `CorruptImage` |
| `config` | `Misconfiguration` |
| `dependency` | `DependencyFailure` |
| `unknown` | `Unknown` |

## Complexity mapping

| IR `difficulty` | `scenario_complexity` |
| --- | --- |
| `L1` | `easy` |
| `L2` | `medium` |
| `L3`, `L4` | `hard` |
| unset | `medium` |

## Exporting

```bash
rca-bench export --target itbench --input examples/order-prod/bundle.json --out-dir ./out
```

A case without `groundTruth.rootCauseComponent` is skipped with
`missing root-cause component`.

## Scoring

```bash
rca-bench score --target itbench --dir ./out
```

| Check | What it proves |
| --- | --- |
| `case-present` | at least one `scenario.json` was emitted |
| `scenario-shape` | `scenario_name`, `scenario_description`, `scenario_domain`, `scenario_class`, `scenario_complexity` and `scenario_groundtruth.diagnosis` are present |

The structural check answers *is this well-formed*. Whether it is **scorable** is a
different question, and a different command:

```bash
rca-bench official --target itbench --dir ./out
```

It scores the exported answer key with the ITBench diagnosis rule (arXiv 2502.05352
§4.2): the root-cause entities, the fault-propagation chain and the fault conditions all
have to match. The metric is labelled **derived**, not `official` — ITBench's NTAM closed
form is stated in Appendix C.6.3, which is not public, so the pass@1 form is used.

## Failure modes

| Symptom | Cause | Fix |
| --- | --- | --- |
| `entities` contains only the root cause | `causalChain` is empty | author `GroundTruth.causalChain` |
| `fault_conditions` is empty | `evidenceCheckpoints` is empty | author checkpoints with ⟨comparator, value, unit⟩ |
| `scenario_class` is `Unknown` | `fault.category` is `unknown` | set the category, or accept `Unknown` |

## Boundaries

- The **ITBench-Lite snapshot body** (`alerts/`, `metrics/`, `k8s_events_raw.tsv`,
  `k8s_objects_raw.tsv`, `otel_logs_raw.tsv`, `otel_traces_raw.tsv`) is a frozen Kubernetes
  snapshot, and the full harness is a live, perturbable cluster. Neither is producible from
  a static per-case IR.
- Only the SRE persona is targeted.
