# AIOps2025 — field contract

> **Two metadata artefacts.** `input.json` carries the tasks, `groundtruth.jsonl` carries
> the fault label *and* the per-modality key-evidence reasoning label.

| | |
| --- | --- |
| Vendor / venue | 2025 CCF AIOps Challenge |
| Contract version | `ccf2025` (`AIOPS2025_CONTRACT_VERSION`) |
| Emitter | [`src/export/aiops2025.ts`](../../packages/core/src/export/aiops2025.ts) |
| CLI target id | `aiops2025` |
| Modalities | metrics, logs, traces, events, alerts |
| Timezone | canonical UTC ISO-8601 in `start_time` / `end_time` |

## What is — and is not — produced

The benchmark ships **18 daily Parquet telemetry archives shared across cases**. That bulk
telemetry is day-based, not case-based, so it cannot be derived from a per-case IR. What
the factory produces is the *verifiable, agent-facing part* of the contract:

```text
input.json          # one entry per case: uuid, description, window
groundtruth.jsonl   # one compact JSON object per line: label + key observations
```

## Files

### `input.json`

<!-- fields: aiops2025/input.json -->
| Field | Type | Required | Source (IR) | Notes |
| --- | --- | --- | --- | --- |
| `uuid` | string | yes | `FaultCase.caseId` | Join key with groundtruth.jsonl. |
| `description` | string | yes | `FaultCase.query ?? GroundTruth.rootCauseReason` | Falls back to the reason when no query is authored. |
| `start_time` | string | yes | `FaultCase.window.start` |  |
| `end_time` | string | yes | `FaultCase.window.end` |  |
<!-- /fields -->

<!-- example: aiops2025/input.json -->
```json
[
  {
    "uuid": "case-001",
    "description": "The order service became slow at 08:10 UTC+8. Find the root cause.",
    "start_time": "2026-09-06T00:00:00.000Z",
    "end_time": "2026-09-06T00:20:00.000Z"
  }
]
```

### `groundtruth.jsonl`

One JSON object per line (JSON Lines, not a JSON array). `key_observations` splits the
reasoning label by modality; `key_metrics` is the flat metric-ref list used by the metric
grounding score.

<!-- fields: aiops2025/groundtruth.jsonl -->
| Field | Type | Required | Source (IR) | Notes |
| --- | --- | --- | --- | --- |
| `uuid` | string | yes | `FaultCase.caseId` |  |
| `fault_category` | string | yes | `AIOPS2025_CATEGORY[normalizeFaultType(type)] ?? fault.category` | network \| stress \| node \| pod \| jvm \| dns \| misconfiguration \| erroneous-change \| io. |
| `fault_type` | string | yes | `FaultCase.fault.type` | Raw fault type. |
| `instance_type` | string | yes | `instanceTypeOf(Entity.kind)` | service \| pod \| node; defaults to service when the entity is unknown. |
| `service` | string | yes | `GroundTruth.rootCauseComponent` |  |
| `instance` | string | yes | `Entity.name ?? rootCauseComponent` |  |
| `source` | string | no | `fault.parameters['source']` | Emitted only when present and a string. |
| `destination` | string | no | `fault.parameters['destination']` |  |
| `start_time` | string | yes | `FaultCase.window.start` |  |
| `end_time` | string | yes | `FaultCase.window.end` |  |
| `key_observations.log[]` | array | yes | `rootCauseIndicators where type='log'` | Each element is { ref, description }. |
| `key_observations.metric[]` | array | yes | `rootCauseIndicators where type='metric'` |  |
| `key_observations.trace[]` | array | yes | `rootCauseIndicators where type='trace'` |  |
| `key_metrics[]` | string[] | yes | `metric indicators -&gt; ref` | Flat list of metric refs; duplicates key_observations.metric. |
| `fault_description` | string | yes | `GroundTruth.rootCauseReason` |  |
<!-- /fields -->

<!-- example: aiops2025/groundtruth.jsonl -->
```json
{"uuid":"case-001","fault_category":"resource","fault_type":"cpu","instance_type":"service","service":"order","instance":"order","start_time":"2026-09-06T00:00:00.000Z","end_time":"2026-09-06T00:20:00.000Z","key_observations":{"log":[],"metric":[{"ref":"order|cpu_usage","description":"cpu_usage above 90%"}],"trace":[]},"key_metrics":["order|cpu_usage"],"fault_description":"CPU saturation on the order service"}
```

## Fault-category mapping

`fault_category` is derived from the **normalised** fault type; an unmapped type falls back
to the IR `fault.category` rather than to a guessed token.

| Normalised fault type | `fault_category` |
| --- | --- |
| `network-delay`, `network-loss`, `network-corrupt` | `network` |
| `cpu-stress`, `memory-stress` | `stress` |
| `node-cpu`, `node-disk`, `node-network-loss`, `node-network-delay` | `node` |
| `pod-failure`, `pod-kill` | `pod` |
| `jvm-exception`, `jvm-gc`, `jvm-latency`, `jvm-cpu-stress` | `jvm` |
| `dns-error` | `dns` |
| `target-port-misconfig` | `misconfiguration` |
| `erroneous-code` | `erroneous-change` |
| `io-fault` | `io` |

## Exporting

```bash
rca-bench export --target aiops2025 --input examples/order-prod/bundle.json --out-dir ./out
```

Cases with no telemetry are skipped with `no telemetry signals attached`, never silently
dropped — otherwise `input.json` and `groundtruth.jsonl` would fall out of alignment.

## Scoring

```bash
rca-bench score --target aiops2025 --dir ./out
```

| Check | What it proves |
| --- | --- |
| `input-present` | `input.json` exists and parses as an array |
| `groundtruth-present` | `groundtruth.jsonl` exists |
| `entries-present` | both artefacts contain at least one entry and one line |
| `input-shape` | every entry has `uuid`, `description`, `start_time`, `end_time` |
| `groundtruth-shape` | every line has `uuid`, `fault_category`, `fault_type`, `instance_type`, `service`, `instance`, `key_observations`, `key_metrics` |
| `key-observations-shape` | `key_observations` exposes the `log` / `metric` / `trace` arrays |
| `uuid-alignment` | the uuid sets of both artefacts are identical — no case is labelled without an input, and vice versa |

The structural check answers *is this well-formed*. Whether it is **scorable** is a
different question, and a different command:

```bash
rca-bench official --target aiops2025 --dir ./out
```

It runs the published AIOps2025 protocol (arXiv 2606.29193 §4.4):
`Final_A = (0.4·LA + 0.4·TA + 0.1·Exp. + 0.1·Eff.) × 100`. The exported answer key must
score 100; perturbing the localisation, the reason text, the cited observations or
inflating the agent trace length each lowers it.

## Failure modes

| Symptom | Cause | Fix |
| --- | --- | --- |
| `uuid-alignment` fails | a case was skipped or the two artefacts were exported from different bundles | re-export from one bundle |
| `key_observations` all empty | `groundTruth.rootCauseIndicators` absent | author indicators with `type: metric \| log \| trace` |
| `fault_category` is the raw IR category | the fault type is not in the mapping table | extend `AIOPS2025_CATEGORY`, or accept the documented fallback |

## Boundaries

- Bulk telemetry (the 18 Parquet archives) is out of scope: it is day-based and shared
  across cases.
- `source` / `destination` appear only when `fault.parameters` carries those string keys —
  network faults in practice.
- The category table is a best-effort projection of the challenge vocabulary.
