# OpenRCA 1.0 — field contract

> **Outcome-labelled telemetry benchmark.** One directory tree per system-day, one
> `prediction` JSON per case. The agent sees `query.csv` + telemetry; the grader
> holds `record.csv`.

| | |
| --- | --- |
| Vendor / venue | Microsoft, ICLR'25 |
| Contract version | `ICLR2025` (`OPENRCA_CONTRACT_VERSION`) |
| Emitter | [`src/export/openrca.ts`](../../packages/core/src/export/openrca.ts) |
| CLI target id | `openrca-1.0` |
| Modalities | metrics, logs, traces |
| Timezone | **UTC+8** (`OPENRCA_OFFSET_MINUTES = 480`) |

## What makes this contract distinctive

1. **Everything is timestamped in UTC+8.** The factory stores canonical UTC in the IR and
   shifts by +480 minutes at export time (`isoUtcToOffsetIso`). A case recorded at
   `2026-09-06T00:10:00.000Z` is written as `2026-09-06 08:10:00`.
2. **Metrics are long-form, not wide.** Each row is `(timestamp, cmdb_id, kpi_name, value)`.
   There is no per-metric column matrix and no unit column.
3. **`cmdb_id` is the only entity handle.** There is no topology file, so the exporter
   resolves pod → host → service, most-specific first.
4. **The answer key is a nested JSON string**, not CSV columns: `record.csv.prediction`
   holds `{"1": {"root cause occurrence datetime": …, "root cause component": …, "root cause reason": …}}`.

## Directory layout

```text
{system}/
├── query.csv                          # tasks (safe to hand to the agent)
├── record.csv                         # answer key, in the official -p submission shape
├── groundtruth.csv                    # answer key, in the official -q scorer shape
└── {YYYY_MM_DD}/telemetry/
    ├── metric/{caseId}.csv
    ├── log/{caseId}.csv               # may be empty (Telecom ships no logs)
    └── trace/{caseId}.csv
```

`{YYYY_MM_DD}` is derived from the **injection** date in UTC+8, so a case that onsets
at 23:30 UTC+8 and is observed into the next day still lands in a single directory.

## Files

### `{system}/query.csv`

Task input. One row per case. Must never contain the root-cause answer — the
`answer-key-isolated` structural check rejects the export if any of the literal tokens
`root cause component`, `root cause reason` or `root cause occurrence` appear here.
(The phrase "find the root cause" is legitimate and does **not** trip the check.)

<!-- fields: openrca-1.0/{system}/query.csv -->
| Field | Type | Required | Source (IR) | Notes |
| --- | --- | --- | --- | --- |
| `instruction_id` | string | yes | `FaultCase.caseId` | Join key with `record.csv` and with the telemetry file basename. |
| `query` | string | yes | `FaultCase.query ?? ""` | Natural-language task description. Must not contain the root-cause answer (G5 / `answer-key-isolated`). |
| `occurrence_datetime` | string | yes | `isoUtcToOffsetIso(FaultCase.injectTime, 480)` | `YYYY-MM-DD HH:MM:SS` in UTC+8. Not the window start - it is the fault onset. |
<!-- /fields -->

<!-- example: openrca-1.0/order-prod/query.csv -->
```csv
instruction_id,query,occurrence_datetime
case-001,The order service became slow at 08:10 UTC+8. Find the root cause.,2026-09-06 08:10:00
```

### `{system}/record.csv`

Answer key. Kept physically separate from `query.csv` so a benchmark consumer can be
given the task without the label. `prediction` is RFC 4180-escaped JSON.

<!-- fields: openrca-1.0/{system}/record.csv -->
| Field | Type | Required | Source (IR) | Notes |
| --- | --- | --- | --- | --- |
| `instruction_id` | string | yes | `FaultCase.caseId` | Same join key as `query.csv`. |
| `prediction` | string (JSON) | yes | `buildPredictionJson(FaultCase)` | Escaped JSON object keyed by `"1"`. |
| `prediction["1"]["root cause occurrence datetime"]` | string | yes | `localTime(FaultCase.injectTime)` | UTC+8 `YYYY-MM-DD HH:MM:SS`; must equal `occurrence_datetime` in query.csv. |
| `prediction["1"]["root cause component"]` | string | yes | `GroundTruth.rootCauseComponent` | The scored component token, e.g. `order`. |
| `prediction["1"]["root cause reason"]` | string | yes | `GroundTruth.rootCauseReason` | Free-text reason; the official scorer is lenient about wording. |
<!-- /fields -->

<!-- example: openrca-1.0/order-prod/record.csv -->
```csv
instruction_id,prediction
case-001,"{""1"":{""root cause occurrence datetime"":""2026-09-06 08:10:00"",""root cause component"":""order"",""root cause reason"":""CPU saturation on the order service""}}"
```

### `{system}/groundtruth.csv`

The answer key in the shape `main/evaluate.py` actually consumes, so the published
scorer can be pointed at this export without a conversion step:

```bash
python -m main.evaluate -p order-prod/record.csv -q order-prod/groundtruth.csv -r report.csv
```

`scoring_points` is natural language, not a data structure: the official evaluator
recovers the three elements from it with regular expressions, so its wording is part
of the contract and is transcribed verbatim from `main/task_specification.json`.

<!-- fields: openrca-1.0/{system}/groundtruth.csv -->
| Field | Type | Required | Source (IR) | Notes |
| --- | --- | --- | --- | --- |
| `task_index` | string | yes | `openRcaTaskIndex({datetime, component, reason})` | One of `task_1`…`task_7` from `main/task_specification.json`. Derived, not chosen: a case carrying all three elements is `task_7`, one carrying only the component is `task_3`. |
| `instruction` | string | yes | `FaultCase.query ?? ""` | The same natural-language task text as `query.csv`; the evaluator only needs it to pair rows. |
| `scoring_points` | string | yes | `buildScoringPoints(taskIndex, elements)` | Multi-line natural-language block rendered from the official templates. Three regular expressions recover the component, reason and datetime from it, so the wording is part of the contract. |
<!-- /fields -->

<!-- example: openrca-1.0/order-prod/groundtruth.csv -->
```csv
task_index,instruction,scoring_points
task_7,The order service became slow at 08:10 UTC+8. Find the root cause.,"The only root cause occurrence time is within 1 minutes (i.e., <=1min) of 2026-09-06 08:10:00
The only predicted root cause component is order
The only predicted root cause reason is CPU saturation on the order service
"
```

### `{system}/{YYYY_MM_DD}/telemetry/metric/{caseId}.csv`

Long-form metric series sorted ascending by local timestamp.

<!-- fields: openrca-1.0/{system}/{YYYY_MM_DD}/telemetry/metric/{caseId}.csv -->
| Field | Type | Required | Source (IR) | Notes |
| --- | --- | --- | --- | --- |
| `timestamp` | string | yes | `localTime(TelemetrySignal.timestamp)` | UTC+8 `YYYY-MM-DD HH:MM:SS`. |
| `cmdb_id` | string | yes | `resource['k8s.pod.name'] ?? resource['host.name'] ?? resource['service.name']` | Most-specific-first CMDB identifier; this is the only entity handle the agent gets. |
| `kpi_name` | string | yes | `MetricPayload.name` | Metric name, e.g. `cpu_usage`. |
| `value` | number | yes | `MetricPayload.value` | Raw numeric value; units are not carried in this format. |
<!-- /fields -->

<!-- example: openrca-1.0/order-prod/2026_09_06/telemetry/metric/case-001.csv truncate=8 -->
```csv
timestamp,cmdb_id,kpi_name,value
2026-09-06 08:00:00,order-pod-1,cpu_usage,20
2026-09-06 08:00:30,order-pod-1,cpu_usage,21
2026-09-06 08:01:00,order-pod-1,cpu_usage,19
2026-09-06 08:01:30,order-pod-1,cpu_usage,20
2026-09-06 08:02:00,order-pod-1,cpu_usage,22
2026-09-06 08:02:30,order-pod-1,cpu_usage,18
2026-09-06 08:03:00,order-pod-1,cpu_usage,20
… 8 more lines
```

### `{system}/{YYYY_MM_DD}/telemetry/log/{caseId}.csv`

<!-- fields: openrca-1.0/{system}/{YYYY_MM_DD}/telemetry/log/{caseId}.csv -->
| Field | Type | Required | Source (IR) | Notes |
| --- | --- | --- | --- | --- |
| `timestamp` | string | yes | `localTime(TelemetrySignal.timestamp)` | UTC+8. |
| `cmdb_id` | string | yes | `cmdbId(signal)` | Same resolution rule as metrics. |
| `severity` | string | no | `LogPayload.severityText ?? ""` | TRACE\|DEBUG\|INFO\|WARN\|ERROR\|FATAL; empty when unknown. |
| `message` | string | yes | `LogPayload.body` | Raw message body; comma/newline/quote escaped per RFC 4180. |
<!-- /fields -->

<!-- example: openrca-1.0/order-prod/2026_09_06/telemetry/log/case-001.csv -->
```csv
timestamp,cmdb_id,severity,message
2026-09-06 08:10:10,order,ERROR,Connection pool exhausted
```

### `{system}/{YYYY_MM_DD}/telemetry/trace/{caseId}.csv`

Flat span list. The span tree is reconstructed from `parent_span_id`; an empty value
marks a root span.

<!-- fields: openrca-1.0/{system}/{YYYY_MM_DD}/telemetry/trace/{caseId}.csv -->
| Field | Type | Required | Source (IR) | Notes |
| --- | --- | --- | --- | --- |
| `timestamp` | string | yes | `localTime(TelemetrySignal.timestamp)` | UTC+8. |
| `trace_id` | string | yes | `TracePayload.traceId` |  |
| `span_id` | string | yes | `TracePayload.spanId` |  |
| `parent_span_id` | string | no | `TracePayload.parentSpanId ?? ""` | Empty for root spans. |
| `cmdb_id` | string | yes | `cmdbId(signal)` |  |
| `span_name` | string | yes | `TracePayload.spanName` |  |
| `duration_ms` | number | yes | `TracePayload.durationMs` | Milliseconds. |
| `status` | string | no | `TracePayload.status ?? ""` | OK\|ERROR\|UNSET; empty when unknown. |
<!-- /fields -->

<!-- example: openrca-1.0/order-prod/2026_09_06/telemetry/trace/case-001.csv -->
```csv
timestamp,trace_id,span_id,parent_span_id,cmdb_id,span_name,duration_ms,status
2026-09-06 08:10:15,tr-1,sp-1,,order,GET /checkout,120,OK
2026-09-06 08:10:16,tr-1,sp-2,sp-1,order,GET /checkout,120,OK
```

## Exporting

```bash
rca-bench export --target openrca-1.0 --input examples/order-prod/bundle.json --out-dir ./out
```

Every case needs at least one attached telemetry signal. A case without signals is
reported in `skipped` with `no telemetry signals attached` rather than being silently
dropped.

## Scoring

```bash
rca-bench score --target openrca-1.0 --dir ./out
```

| Check | What it proves |
| --- | --- |
| `query-csv` | at least one `query.csv` exists |
| `record-csv` | at least one `record.csv` exists |
| `query-header` | header is exactly `instruction_id,query,occurrence_datetime` |
| `record-header` | header is exactly `instruction_id,prediction` |
| `groundtruth-csv` | at least one `groundtruth.csv` (the official `-q` artefact) exists |
| `groundtruth-header` | header is exactly `task_index,instruction,scoring_points` |
| `scoring-points-present` | every row carries a `scoring_points` block the official regexes can read |
| `row-alignment` | `query.csv`, `record.csv` and `groundtruth.csv` have the same row count, which is what the official evaluator requires |
| `answer-key-isolated` | `query.csv` carries no answer-key tokens |
| `telemetry-present` | at least one metric / log / trace file |
| `metric-header` | header is exactly `timestamp,cmdb_id,kpi_name,value` |
| `log-header` | header is exactly `timestamp,cmdb_id,severity,message` (skipped when absent) |
| `trace-header` | header is exactly `timestamp,trace_id,span_id,parent_span_id,cmdb_id,span_name,duration_ms,status` (skipped when absent) |

Without `--anchors` the score is the structural pass rate; with anchors it is the mean of
the structural pass rate and the SHA-256 Golden-Master match rate. Exit code is `1` when
the report fails, so CI can gate on it.

The structural check answers *is this well-formed*. The question that matters is
*is it scorable*, and that is a different command:

```bash
rca-bench official --target openrca-1.0 --dir ./out
```

It runs the official rule (`microsoft/OpenRCA main/evaluate.py`) against the exported
answer key: a perfect answer must score 1.0, and perturbing the component, the reason
or the datetime must each lower the score to 2/3. The two artefacts are therefore also
runnable by the upstream evaluator itself:

```bash
python -m main.evaluate -p order-prod/record.csv -q order-prod/groundtruth.csv -r report.csv
```

## Failure modes

| Symptom | Cause | Fix |
| --- | --- | --- |
| `answer-key-isolated` fails | the authored `query` quotes the component or reason | rewrite `FaultCase.query`; keep the label in `groundTruth` only |
| Telemetry missing entirely | case has no signals in `bundle.signals[caseId]` | attach signals, or accept the documented skip |
| Timestamps off by 8 hours | a downstream reader assumed UTC | the file is UTC+8 by contract; convert on read |

## Boundaries

- Empty `log/` files are legitimate (the Telecom subsystem ships metrics and traces only).
- No topology, no events, no alerts: OpenRCA 1.0 consumes M/L/T only. Use
  [RCA100](rca100.md) if you need the event and alert modalities.
- Units are not carried by this contract; metric semantics live in `kpi_name`.
