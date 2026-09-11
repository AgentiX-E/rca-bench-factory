# RCAEval (RE1 / RE2 / RE3) — field contract

> **Per-case directory benchmark.** One directory per fault instance, with metric vectors
> keyed by name, a Unix-second injection timestamp, and — for RE2/RE3 — log and trace tables.

| | |
| --- | --- |
| Vendor / venue | RMIT, ASE'24 / WWW'25 |
| Contract version | `www25` (`RCAEVAL_CONTRACT_VERSION`) |
| Emitter | [`src/export/rcaeval.ts`](../../packages/core/src/export/rcaeval.ts) |
| CLI target id | `rcaeval` with `--suite RE1|RE2|RE3` |
| Score target ids | `rcaeval-re1`, `rcaeval-re2`, `rcaeval-re3` |
| Timezone | canonical UTC ISO-8601 in CSVs; Unix seconds in `inject_time.txt` |

## Suites

| Suite | Modalities | Upstream cases | What it exercises |
| --- | --- | --- | --- |
| **RE1** | metrics only | 375 | single-signal root-cause localisation |
| **RE2** | metrics + logs + traces | 270 | cross-signal correlation |
| **RE3** | metrics + logs + traces | 90 | code-level RCA (fault category must be `code`) |

The layout is identical across suites; only the **modality set** differs, and the
modality set is itself part of the contract — `checkRcaEvalStructure` fails an RE2 export
that is missing `traces.csv`.

## Directory layout

```text
{suite}-{service}-{fault}_{instance}/
├── metrics.json        # { metricName: number[] }  (all suites)
├── inject_time.txt     # Unix seconds              (all suites)
├── logs.csv            # RE2 / RE3 only
└── traces.csv          # RE2 / RE3 only
```

The directory name is produced by `caseDirName`: non-alphanumeric characters are stripped
from the root-cause component and the fault type, and `{instance}` is the 1-based index of
the case in the bundle.

## Files

### `{suite}-{service}-{fault}_{n}/metrics.json`

A mapping from metric name to an array of values **ordered by time**. Timestamps are not
carried — only ordering — which is exactly what the upstream baselines consume.

<!-- fields: rcaeval/{suite}-{service}-{fault}_{n}/metrics.json -->
| Field | Type | Required | Source (IR) | Notes |
| --- | --- | --- | --- | --- |
| `&lt;metric_name&gt;` | number[] | yes | `MetricPayload.name -&gt; [MetricPayload.value]` | Points sorted ascending by parsed timestamp; the array is the time series. |
<!-- /fields -->

<!-- example: rcaeval-re2/RE2-order-cpu_1/metrics.json -->
```json
{"cpu_usage":[20,21,19,20,22,18,20,21,19,20,95,96,97,98,99]}```

### `{suite}-{service}-{fault}_{n}/inject_time.txt`

The fault-injection instant, used by the baselines to split the normal window from the
anomalous window. Unix seconds, no trailing newline.

<!-- fields: rcaeval/{suite}-{service}-{fault}_{n}/inject_time.txt -->
| Field | Type | Required | Source (IR) | Notes |
| --- | --- | --- | --- | --- |
| `(body)` | number | yes | `floor(Date.parse(FaultCase.injectTime) / 1000)` | Unix seconds, no trailing newline. |
<!-- /fields -->

<!-- example: rcaeval-re2/RE2-order-cpu_1/inject_time.txt -->
```text
1788653400```

### `{suite}-{service}-{fault}_{n}/logs.csv` (RE2 / RE3)

<!-- fields: rcaeval/{suite}-{service}-{fault}_{n}/logs.csv -->
| Field | Type | Required | Source (IR) | Notes |
| --- | --- | --- | --- | --- |
| `timestamp` | string | yes | `TelemetrySignal.timestamp` | Canonical UTC ISO-8601 (not offset-shifted). |
| `service` | string | yes | `resource['service.name']` |  |
| `severity` | string | no | `LogPayload.severityText ?? ""` |  |
| `message` | string | yes | `LogPayload.body` |  |
<!-- /fields -->

<!-- example: rcaeval-re2/RE2-order-cpu_1/logs.csv -->
```csv
timestamp,service,severity,message
2026-09-06T00:10:10.000Z,order,ERROR,Connection pool exhausted
```

### `{suite}-{service}-{fault}_{n}/traces.csv` (RE2 / RE3)

<!-- fields: rcaeval/{suite}-{service}-{fault}_{n}/traces.csv -->
| Field | Type | Required | Source (IR) | Notes |
| --- | --- | --- | --- | --- |
| `timestamp` | string | yes | `TelemetrySignal.timestamp` | Canonical UTC ISO-8601. |
| `trace_id` | string | yes | `TracePayload.traceId` |  |
| `span_id` | string | yes | `TracePayload.spanId` |  |
| `parent_span_id` | string | no | `TracePayload.parentSpanId ?? ""` |  |
| `service` | string | yes | `resource['service.name']` |  |
| `span_name` | string | yes | `TracePayload.spanName` |  |
| `duration_ms` | number | yes | `TracePayload.durationMs` |  |
| `status` | string | no | `TracePayload.status ?? ""` |  |
<!-- /fields -->

<!-- example: rcaeval-re2/RE2-order-cpu_1/traces.csv -->
```csv
timestamp,trace_id,span_id,parent_span_id,service,span_name,duration_ms,status
2026-09-06T00:10:15.000Z,tr-1,sp-1,,order,GET /checkout,120,OK
2026-09-06T00:10:16.000Z,tr-1,sp-2,sp-1,order,GET /checkout,120,OK
```

## Exporting

```bash
rca-bench export --target rcaeval --suite RE2 --input examples/order-prod/bundle.json --out-dir ./out
```

Skip policy:

| Reason | Meaning |
| --- | --- |
| `no telemetry signals attached` | `bundle.signals[caseId]` is empty |
| `RE3 targets code-level faults only` | suite is RE3 and `fault.category !== 'code'` |

A skipped case emits **no files**: the RE3 code-level check runs before anything is
written, so a consumer reading the output directory never sees a case the exporter itself
declared unusable. The demo bundle (`examples/order-prod/bundle.json`) carries a
`resource` fault, so `--suite RE3` legitimately exports nothing and reports one skip.

## Scoring

```bash
rca-bench score --target rcaeval-re2 --dir ./out
```

| Check | What it proves |
| --- | --- |
| `metrics-json` | at least one `metrics.json` exists and parses to a name → `number[]` map |
| `inject-time-exists` | every case directory carries `inject_time.txt` |
| `modality-set` | the emitted modalities match the suite (RE1: metrics only; RE2/RE3: + logs + traces) |

The structural check answers *is this well-formed*. Whether it is **scorable** is a
different question, and a different command:

```bash
rca-bench official --target rcaeval-re2 --dir ./out
```

It runs the official RCAEval metric (`RCAEval/benchmark/evaluation.py`) against the
export: the ground-truth service must appear in the ranked candidate list, so AC@1
through AC@5 — and therefore Avg@5 — are all 1, and replacing the ranked list must drop
every AC@k to 0.

## Failure modes

| Symptom | Cause | Fix |
| --- | --- | --- |
| `metrics-json` fails | the metric payload values are strings, not numbers | coerce in the transform stage (the `cast` strategy) |
| `modality-set` fails | exporting RE1 but expecting logs | choose RE2 / RE3, or accept metrics-only |
| Two cases collide in one directory | identical service + fault + index | make `caseId` / component unique per case |

## Boundaries

- Timestamps are dropped from `metrics.json` by design; if your evaluation needs the
  sampling grid, use [OpenRCA 1.0](openrca-1.0.md) or [RCA100](rca100.md).
- No topology: the entity is expressed only through the `service` column and the directory
  name.
