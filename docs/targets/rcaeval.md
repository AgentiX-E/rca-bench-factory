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

### What we emit

```text
{suite}-{service}-{fault}_{instance}/
├── metrics.json        # { metricName: number[] }  (all suites)
├── inject_time.txt     # Unix seconds              (all suites)
├── logs.csv            # RE2 / RE3 only
└── traces.csv          # RE2 / RE3 only
```

The directory name is produced by `caseDirName`: hyphens are **kept**, and every other
non-alphanumeric character is stripped from the root-cause component and the fault type. Leading and
trailing hyphens are trimmed, and a field that sanitises away entirely becomes `unnamed`, so no
directory name ever carries an empty segment. `{instance}` is the 1-based index of the case in the
bundle.

Keeping hyphens is not a preference — it is what makes the name readable at all.
`parseRcaEvalDirectory` recovers the root-cause service from this name. Stripping hyphens would emit
`RE2-tsorderservice-cpu_1` and name a service that does not exist.

### What the corpus ships — and why it is a different shape

> **This is not the layout above, and the difference is a real mismatch that the round trip
> found.** Until the first successful download, this document described only our own output and
> implied the corpus matched it. It does not.

The upstream corpus is **nested**, and the suite is fused to the *system* rather than to a case:

```text
{suite}-{system}/{service}_{fault}/{run}/
├── metrics.csv                 # wide, per pod      (RE2 / RE3)
├── simple_metrics.csv          # wide, per service  (RE2 / RE3)
├── metrics.json                # { metricName: number[] }  (RE1)
├── data.csv                    # long, one row a sample    (RE1)
├── inject_time.txt             # Unix seconds
├── logs.csv                    # RE2 / RE3, raw log lines
├── traces.csv                  # RE2 / RE3, raw spans
├── logts.csv                   # RE2, pre-aggregated event counts
├── tracets_err.csv             # RE2 (OB and TT)
├── tracets_lat.csv             # RE2 (OB and TT)
├── cluster_info.json           # RE2, log templates per node
├── pod-node-{1,2}.csv          # RE2, placement
└── metrics.png, metrics_postprocess.log
```

**The file set is not the same in the two corpora that ship logs and traces**, and neither is the
schema of the two files whose *names* match ours. Measured from the archives (finding 266):

| file | RE2-OB | RE3-OB |
| --- | --- | --- |
| `traces.csv` | 11 columns, `time,traceID,spanID,serviceName,methodName,operationName,startTimeMillis,startTime,duration,statusCode,parentSpanID` | the same 11, identical |
| `logs.csv` | 9 columns, `time,timestamp,container_name,message,level,req_path,error,cluster_id,log_template` | 6 columns, `time,timestamp,container_name,message,pod_name,node_name` |
| units | `timestamp`/`startTime` are Unix **microseconds**; `duration` is microseconds; `time` is `HH:MM` UTC | the same |

So the trace table is one schema across both suites and the log table is two, which is why
`RCAEVAL_TRACES_COLUMNS` is a list and `RCAEVAL_LOGS_COLUMNS` is a map. The columns the IR does not
carry (`methodName`; RE2's `req_path`, `error`, `cluster_id`, `log_template`) are emitted empty and
named in `RCAEVAL_UNFILLED_COLUMNS` rather than filled with an invention.

So a corpus case reads `RE2-OB/checkoutservice_cpu/1/`, not `RE2-checkoutservice-cpu_1/`. Two
components carry labels that a single flat token cannot:

- **`{suite}-{system}`** is where the benchmark suite lives — `RE2-OB`, `RE2-SS`, `RE2-TT`. The
  suite is not attached to the case, so a per-directory-name parse cannot recover it from the leaf.
- **`{service}_{fault}`** splits the two fields at an underscore, and the **service keeps its
  hyphens**: Train Ticket ships `ts-order-service_cpu`.

`parseRcaEvalPath` reads this layout; `parseRcaEvalDirectory` reads ours. Both are presented to
`readOfficialGroundTruth`, which tries the nested parse first, so a file map holding the corpus and
our own export scores both.

#### Where the layout is stated upstream

Two independent statements, both in code rather than prose:

`main.py` locates the cases by globbing `**/data.csv` and then reads the labels back out of the path:

```python
data_dir = dirname(data_path)                                       # …/{service}_{fault}/{run}
service, metric = basename(dirname(dirname(data_path))).split("_")   # service, fault
case = basename(dirname(data_path))                                  # {run}
```

and `docs/TORAI.md` prints the tree for the RE2 conversion, which is the same corpus re-exported:

```text
data/torai-OB/{service}_{fault_type}/{run}/inject_time.txt
```

The upstream README's `{benchmark}_{service}_{fault}_{instance}` line describes the *Parquet/HF*
copy's case **identifier**, not a path on disk. Reading it as the on-disk layout is what produced
the flat assumption above.

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
| `time` | string | yes | `HH:MM of TelemetrySignal.timestamp, UTC` | Both suites. |
| `timestamp` | string | yes | `Date.parse(TelemetrySignal.timestamp) * 1000` | Unix microseconds, as the corpus writes it. |
| `container_name` | string | yes | `resource['service.name']` | Both suites. |
| `message` | string | yes | `LogPayload.body` | Both suites. |
| `level` | string | no | `LogPayload.severityText ?? ""` | RE2 only. |
| `req_path` | string | no | `(not carried)` | RE2 only. Empty; see RCAEVAL_UNFILLED_COLUMNS. |
| `error` | string | no | `(not carried)` | RE2 only. Empty. |
| `cluster_id` | string | no | `(not carried)` | RE2 only. Empty. |
| `log_template` | string | no | `(not carried)` | RE2 only. The corpus writes rendered template text; the IR carries an id. |
| `pod_name` | string | no | `resource['k8s.pod.name'] ?? ''` | RE3 only. |
| `node_name` | string | no | `resource['k8s.node.name'] ?? ''` | RE3 only. |
<!-- /fields -->

<!-- example: rcaeval-re2/RE2-order-cpu_1/logs.csv -->
```csv
time,timestamp,container_name,message,level,req_path,error,cluster_id,log_template
00:10,1788653410000000,order,Connection pool exhausted,ERROR,,,,
```

### `{suite}-{service}-{fault}_{n}/traces.csv` (RE2 / RE3)

<!-- fields: rcaeval/{suite}-{service}-{fault}_{n}/traces.csv -->
| Field | Type | Required | Source (IR) | Notes |
| --- | --- | --- | --- | --- |
| `time` | string | yes | `HH:MM of TelemetrySignal.timestamp, UTC` |  |
| `traceID` | string | yes | `TracePayload.traceId` |  |
| `spanID` | string | yes | `TracePayload.spanId` |  |
| `serviceName` | string | yes | `resource['service.name']` |  |
| `methodName` | string | no | `(not carried)` | The two corpora disagree about what it means; empty. |
| `operationName` | string | yes | `TracePayload.spanName` |  |
| `startTimeMillis` | string | yes | `Date.parse(TelemetrySignal.timestamp)` | Unix milliseconds. |
| `startTime` | string | yes | `Date.parse(TelemetrySignal.timestamp) * 1000` | Unix microseconds. |
| `duration` | string | yes | `round(TracePayload.durationMs * 1000)` | Microseconds; the IR carries milliseconds. |
| `statusCode` | string | no | `SPAN_STATUSES -&gt; 0/1/2` | OTel codes: unset/ok/error. Empty when the span has no status. |
| `parentSpanID` | string | no | `TracePayload.parentSpanId ?? ""` |  |
<!-- /fields -->

<!-- example: rcaeval-re2/RE2-order-cpu_1/traces.csv -->
```csv
time,traceID,spanID,serviceName,methodName,operationName,startTimeMillis,startTime,duration,statusCode,parentSpanID
00:10,tr-1,sp-1,order,,GET /checkout,1788653415000,1788653415000000,120000,1,
00:10,tr-1,sp-2,order,,GET /checkout,1788653416000,1788653416000000,120000,1,sp-1
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
