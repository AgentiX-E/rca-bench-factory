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
| `scenario_domain` | string | yes | `constant "SRE"` | Only the SRE persona is targeted; CISO and FinOps are real ITBench personas this converter does not emit. Declared as ITBENCH_SCENARIO_DOMAINS. |
| `scenario_class` | string | yes | `CLASS_BY_CATEGORY[fault.category]` | HighCPU \| NetworkPartition \| CrashLoopBackOff \| ServiceDegradation \| CorruptImage \| Misconfiguration \| DependencyFailure \| Unknown. Declared as ITBENCH_SCENARIO_CLASSES, the projection table's deduplicated image. |
| `scenario_complexity` | string | yes | `difficultyFor(FaultCase.difficulty)` | easy \| medium \| hard. Declared as DIFFICULTIES, shared with cloud-opsbench's difficulty -- one rule, two field names. |
| `scenario_groundtruth.diagnosis.entities[]` | string[] | yes | `rootCauseEntityId + chain endpoints` | Deduplicated, root cause first. |
| `scenario_groundtruth.diagnosis.fault_propagation_chain[]` | array | yes | `GroundTruth.causalChain` |  |
| `...chain[].step` | number | yes | `CausalStep.step` |  |
| `...chain[].from_entity` | string | yes | `CausalStep.fromEntityId` |  |
| `...chain[].to_entity` | string | yes | `CausalStep.toEntityId` |  |
| `...chain[].mechanism` | string | yes | `CausalStep.mechanism` |  |
| `scenario_groundtruth.diagnosis.fault_conditions[]` | array | yes | `GroundTruth.evidenceCheckpoints` |  |
| `...fault_conditions[].checkpoint_id` | string | yes | `EvidenceCheckpoint.checkpointId` |  |
| `...fault_conditions[].entity` | string | yes | `EvidenceCheckpoint.entityRef` |  |
| `...fault_conditions[].signal_ref` | string | no | `assertSignalRef -- &lt;entity name&gt;\|&lt;signalRef&gt;` | Omitted when the checkpoint is derived and names no single reading. `entity` beside it is the id, which is a different question and is why both are published. |
| `...fault_conditions[].comparator` | string | yes | `EvidenceCheckpoint.comparator` |  |
| `...fault_conditions[].value` | number \| string | yes | `EvidenceCheckpoint.value` |  |
| `...fault_conditions[].unit` | string | no | `EvidenceCheckpoint.unit` | Omitted when absent. |
| `...fault_conditions[].description` | string | yes | `EvidenceCheckpoint.description` |  |
<!-- /fields -->

<!-- example: itbench/scenarios/case-001/scenario.json -->
```json
{
  "scenario_name": "case-001",
  "scenario_description": "A failure was detected between 08:00 and 08:30 UTC+8. Identify the affected component, when it occurred within that window, and the reason.",
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
| `scenario-shape` | `scenario_name`, `scenario_description`, `scenario_domain`, `scenario_class`, `scenario_complexity` and `scenario_groundtruth.diagnosis` are present, and all three of `scenario_domain`, `scenario_class` and `scenario_complexity` are in their vocabularies |

The structural check answers *is this well-formed*. Whether it is **scorable** is a
different question, and a different command:

```bash
rca-bench official --target itbench --dir ./out
```

It reports two numbers, and the difference between them is the point.

| Number | Rule | Where it comes from |
| --- | --- | --- |
| `passAt1` | the predicted root cause equals the key's | arXiv 2502.05352 §4.2: "pass@1 ... (i.e., identifying the cause as mentioned in ground truth)" |
| `strict` | the root cause **and** the propagation chain **and** the fault conditions all match | this repository's own conjunction of the three facets the export carries |

`strict` is the target's headline, and it is **not** a published metric: Table 3 of the
paper lists four separate SRE diagnosis metrics and this is none of them. Its id is
`itbench-diagnosis-strict` for that reason.

The paper's `pass@1` is the first number, and it is what the metric used to be called
while computing the second — so a submission that named the right cause and nothing else
was reported as a pass@1 failure. Measured over the nine cases in
`golden-master/itbench-evaluator.json`: **three disagreed, all in that one direction**.

The two NTAM metrics (fault localisation and fault propagation chain) are **not
implemented**, and not because the formula is missing — §4.2 describes it. They are not
implemented because the paper says their components "have corresponding hyper-parameters
that can be tuned to adjust their contributions", and does not publish the values: a
replay would have to choose weights. That is recorded as a gap on census row `itbench`
and in the corpus, with the direction it costs. Hence the label **derived**.

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
