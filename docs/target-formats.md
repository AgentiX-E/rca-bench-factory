# Target formats

This document lists the authoritative RCA benchmark formats the factory targets, the
data types each requires, and how the exporters produce them. The horizontal matrix
shows which **modalities** each benchmark consumes; the factory's job is to satisfy
exactly these contracts from whatever the enterprise actually has.

## Modality legend

- **M** metrics · **L** logs · **T** traces · **E** events · **A** alerts · **Topo** topology
- **Prof** profiles · **Conf** config / state snapshot · **CD** change / deploy events

## Horizontal matrix — authoritative benchmark × data type

| Benchmark | M | L | T | E | A | Topo | Prof | Conf | CD |
| --- | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: |
| OpenRCA 1.0 (Microsoft) | ● | ● | ● | – | – | – | – | – | – |
| OpenRCA 2.0 (PAVE) | ● | ● | ● | – | – | – | – | – | – |
| RCAEval RE1 (metric-only) | ● | – | – | – | – | – | – | – | – |
| RCAEval RE2 (multi-source) | ● | ● | ● | – | – | – | – | – | – |
| RCAEval RE3 (code-level) | ● | ● | ● | – | – | – | – | – | – |
| RCA100 / AgenticOpsEval | ● | ● | ● | ● | ● | ● | – | – | – |
| Cloud-OpsBench | ● | ● | ● | – | – | – | – | ● | – |
| AIOps2025 | ● | ● | ● | ● | ● | – | – | – | – |
| ITBench / AIOpsLab | ● | ● | ● | ● | – | – | – | – | ● |

Key quantitative facts that drive the design:

- **Metric marginal necessity is 92.8%** — metrics are the backbone of every target.
- Log (56.2%) and trace (43.0%) are the next most necessary.
- **19.4% of RCA100 root causes are only observable in Events** — so the Event
  modality is a first-class IR citizen, not an afterthought.

## OpenRCA 1.0

Layout (UTC+8 offset, `OPENRCA_OFFSET_MINUTES = 480`):

```
{case}/
├── query.csv        # task description + answer-key columns (kept separate from record.csv)
├── record.csv       # record-level metadata
└── telemetry/{DATE}/
    ├── metric/      # per-service metric files
    ├── log/         # per-service log files
    └── trace/       # per-service trace files
```

Exported by `exportOpenRca` → `buildMetricCsv` / `buildLogCsv` / `buildTraceCsv` /
`buildPredictionJson`, with `injectTimeUnixSeconds` handling the epoch convention.

## OpenRCA 2.0 (PAVE)

Adds step-wise **causal-path annotations** on top of the 1.0 telemetry layout. The
IR `GroundTruth.causalChain` (`CausalStep[]`) is the canonical form; the exporter
linearizes it into PAVE's step annotations.

## RCAEval (RE1 / RE2 / RE3)

| Suite | Modalities | Case count (upstream) | What it exercises |
| --- | --- | --- | --- |
| RE1 | metric-only | 375 | Single-signal root-cause localization |
| RE2 | multi-source | 270 | Cross-signal correlation |
| RE3 | code-level | 90 | Code-aware RCA (needs code/trace evidence) |

Exported by `exportRcaEval(suite)` → `buildMetricsJson` / `buildLogsCsv` /
`buildTracesCsv`, one directory per case via `caseDirName`.

## RCA100 / AgenticOpsEval

The richest contract: **six modalities** (M/L/T + events + alerts + topology) with a
`⟨comparator, value, unit⟩` evidence-checkpoint format and root-cause↔topology
alignment. The IR's `EvidenceCheckpoint` (which already carries `comparator`,
`value`, `unit`, `description`) maps one-to-one onto this contract.

The exporter (`src/export/rca100.ts`) emits the per-task slice and enforces RCA100's
single hard invariant — **full reference integrity** — before writing any file:

```
cases/{caseId}/metrics.json    entity-aligned long format (entity_id, entity_set, …)
cases/{caseId}/logs.json       SLS application-log schema
cases/{caseId}/traces.json     OpenTelemetry span schema
cases/{caseId}/events.json     K8s lifecycle signals
cases/{caseId}/alerts.json     entry-alert lifecycle
cases/{caseId}/task.json       agent-facing task contract (alert_title, window, entity)
cases/{caseId}/topology.json   UModel entity-relation snapshot (entities + edges + stats)
answer_key/{caseId}.gt.json    four-layer ground truth
```

- **topology.json** maps every IR `EntityKind` to a UModel type (`service`→`apm.service`,
  `pod`→`k8s.pod`, `node`/`host`→`k8s.node`, `db`→`apm.external.database`, …) and every
  IR `EntityRelation` (`contains|hosts|calls|same_as`) to a typed edge.
- **answer key** carries `root_cause_entities[]` (entity names), `root_cause_types[]`
  (fault types), and `raw_ground_truth` — a JSON-encoded fault chain whose
  `reasoning.steps[*]` are typed `cause|propagation|impact` (derived from step
  position) with per-step `⟨comparator, value, unit⟩` observability checkpoints.
- **Reference integrity is enforced, never repaired**: a case whose root-cause entity
  or any signal reference fails to resolve into `topology.json` is *skipped* with a
  reason (matching the official corpus's 100% no-dangling-edge guarantee).
- The official distribution serializes the five modality tables as **Parquet**; the
  exporter preserves the identical field contract as JSON so the tables stay diffable
  and byte-stable for Golden-Master verification.

## Cloud-OpsBench / AIOps2025 / ITBench

Declared targets (see `TARGET_REQUIREMENTS` in `src/coverage.ts`). Cloud-OpsBench
uses the **state-snapshot** paradigm (requires `Conf`); AIOps2025 needs multi-modality
(62.5% of its cases require ≥ 2 modalities); ITBench is agent-task oriented (requires
change/deploy events for `CD`).

## Degradation strategy

The factory degrades gracefully when a modality is missing: it emits the largest
subset the target still accepts and records the gap in the Observability Coverage
Report — it never fabricates a modality to "complete" a contract, because fabricated
signals would corrupt the benchmark (and are caught by G3/G5).
