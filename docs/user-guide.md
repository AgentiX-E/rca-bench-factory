# User guide

End-to-end walkthrough: from a non-standard enterprise export to a scored, contract-compliant
RCA benchmark set. Every command and every output block below is real — the inputs live in
[`examples/order-prod/`](../examples/order-prod/) and can be run verbatim from the repository root.

| File | What it is |
| --- | --- |
| `metrics.csv` | the "enterprise export": offset-less timestamps, CMDB names, ratio-valued CPU |
| `records.json` | the same rows as JSON records (input to `transform`) |
| `rules.json` | three transform rules: time normalisation, CMDB alias mapping, ratio → percent |
| `draft.json` | a loose case draft (fault category deliberately omitted, to show inference) |
| `bundle.json` | the assembled IR bundle used by every example in the format docs |
| `proposal-draft.json` | a self-evolution proposal draft (HITL demo) |

## 0. Where this sits in the SDLC

`rca-bench-factory` is used in the **evaluation-engineering** phase — after an observability
stack exists, before an RCA model or agent is evaluated. It never runs in the production
request path.

| SDLC stage | Who | What they do |
| --- | --- | --- |
| Observability build-out | SRE / platform engineer | Expose metrics / logs / traces (any format) |
| **Benchmark authoring** | **ML / ops engineer, RCA researcher** | **ingest → transform → gate → export → score** |
| Benchmark verification | QA / evaluation owner | Golden Master + mutation suite; sign off |
| RCA agent training / eval | RCA model developer | Consume the emitted dataset |

You do **not** need OpenTelemetry. OTel is an accelerator (T1), not a prerequisite —
flat files (T3) and LLM-assisted custom formats (T6) are first-class paths.

## 1. Ingest a flat file

```bash
node packages/cli/dist/main.js source \
  --path examples/order-prod/metrics.csv \
  --signal-kind metric \
  --assume-offset-minutes 480
```

Column names are auto-detected (`ts` → timestamp, `svc` → service, `kpi_name` → metric name,
`value` → metric value). The offset flag is mandatory here because the source timestamps
carry **no** UTC offset — without it the row is quarantined rather than guessed.

```json
{
  "irVersion": "2.0",
  "resource": { "service.name": "order-pod-1" },
  "timestamp": "2026-09-06T00:00:00.000Z",
  "rawOffsetMinutes": 480,
  "signal": "metric",
  "payload": { "kind": "metric", "name": "cpu_usage", "value": 0.2 }
}
```

`08:00:00` local (UTC+8) became `00:00:00.000Z` canonical UTC, and the assumed offset is
preserved in `rawOffsetMinutes` so the provenance is auditable.

> **Invariant:** every non-empty source record is either a signal or a quarantine entry.
> Nothing is silently dropped.

## 2. Transform (when the source needs real work)

Use `transform` when values need normalising before they can become IR — unit conversion,
CMDB aliasing, template extraction, or a restricted arithmetic expression.

```bash
node packages/cli/dist/main.js transform \
  --input examples/order-prod/records.json \
  --rules examples/order-prod/rules.json
```

```json
{
  "recordId": "row-0",
  "record": {
    "ts": "2026-09-06T08:00:00",
    "svc": "order-pod-1",
    "kpi_name": "cpu_usage",
    "value": 0.2,
    "ts_utc": "2026-09-06T00:00:00.000Z",
    "ts_offset_minutes": 480,
    "service_name": "order",
    "value_pct": 20
  },
  "provenance": {
    "ts_utc": { "source": "derived", "ruleId": "t-normalize" },
    "service_name": { "source": "derived", "ruleId": "t-cmdb-alias" },
    "value_pct": { "source": "derived", "ruleId": "t-ratio-to-percent" }
  }
}
```

Three things happened: the timestamp was normalised, the CMDB name was mapped to the APM
service name, and the ratio `0.2` became the percentage `20` through a **dimension-checked**
unit conversion (`1` → `%`). Each derived field carries the rule that produced it.

The seven strategies are `time`, `unit`, `map`, `regex`, `template`, `lookup` and `expr`
(`expr` is a restricted parser — no property access, no function calls, no I/O).
The engine guarantees `inputCount === outputCount + quarantineCount`.

## 3. Assemble a bundle

`case` turns a loose draft into a validated `IrBundle`: it normalises the fault type,
**infers the fault category when absent**, and schema-checks the result.

```bash
node packages/cli/dist/main.js case --input examples/order-prod/draft.json --output ./bundle.json
```

The draft's `fault` block is just `{"type": "cpu", "injectionMethod": "chaos-mesh", …}`;
the assembled case comes back with `"category": "resource"`. Nothing else is invented.

## 4. Run the quality gates

```bash
node packages/cli/dist/main.js gate --input examples/order-prod/bundle.json --target rca100
```

| Gate | Verdict | What it checks |
| --- | --- | --- |
| G1 structural | passed | required signal kinds for the target; a natural-language query is present |
| G2 semantic | passed | every reference resolves; causal hops exist in the topology (BFS) |
| G3 validity | passed | the anomaly is statistically real (Z ≥ 2.0) |
| G4 solvability | **failed** | baseline locators must rank the root cause within top-K |
| G5 anti-pollution | passed | the task text does not leak the answer key |

The demo bundle is deliberately tiny (2 entities, one metric), so G4 cannot demonstrate
top-K solvability and the case is **quarantined**, not rejected:

```json
{ "code": "UNSOLVABLE_CASE", "message": "only 0 baseline(s) locate the root cause within top-K", "fieldPath": "case-001" }
```

`finalStatus` is `quarantined`: export is still possible, but the case is flagged for human
review (checkpoint **H5**). A rejected case, by contrast, is never admitted.

## 5. Export to a target contract

```bash
node packages/cli/dist/main.js export --target rca100 \
  --input examples/order-prod/bundle.json --out-dir ./out
```

Nine target ids are available — `openrca-1.0`, `openrca-2.0`, `rcaeval` (with
`--suite RE1|RE2|RE3`), `rca100`, `aiops2025`, `cloud-opsbench`, `itbench`.
Every exporter returns `{ files, skipped }`; a case that cannot satisfy the contract is
reported in `skipped` **with a reason**, never silently repaired.

See [target-formats.md](target-formats.md) for the full field reference of each contract.

## 6. Score the export

```bash
node packages/cli/dist/main.js score --target rca100 --dir ./out
```

```json
{
  "target": "rca100",
  "passed": true,
  "score": 100,
  "structure": {
    "checks": [
      { "id": "case-present", "passed": true, "detail": "found 1 case topology.json" },
      { "id": "topology-shape", "passed": true, "detail": "entities (non-empty) and edges arrays with consistent stats" },
      { "id": "entity-refs-resolve", "passed": true, "detail": "every entity_id resolves into the topology" },
      { "id": "root-cause-resolves", "passed": true, "detail": "every root-cause entity name resolves into the topology" },
      { "id": "gt-structure", "passed": true, "detail": "four-layer answer key (root_cause_entities/types + raw_ground_truth)" }
    ]
  }
}
```

- **Without `--anchors`** the score is the structural pass rate.
- **With `--anchors '{"path":"sha256"}'`** it is the mean of the structural pass rate and the
  Golden-Master checksum match rate — external grounding, not self-certification.
- Exit code `1` on failure, so CI can gate on it.

## 7. Render a report

```bash
node packages/cli/dist/main.js report --input examples/order-prod/bundle.json \
  --target rca100 --title "order-prod demo" --output report.html
```

The self-contained HTML page has four sections — observability coverage, entity graph
(with a reference-integrity verdict), quality gates (G1–G5) and the score. All user-controlled
strings are HTML-escaped.

## 8. Self-evolution with human-in-the-loop checkpoints

The engine **proposes**; it never mutates production rules or ground truth on its own.

```bash
node packages/cli/dist/main.js evolve propose --input examples/order-prod/proposal-draft.json
```

```json
{
  "id": "prop-001",
  "layer": "L1",
  "regression": { "baselineScore": 96, "candidateScore": 93, "passed": false },
  "baseVersion": "c9d3266",
  "status": "pending"
}
```

The candidate regressed, so `regression.passed` is `false` and the proposal stays `pending`
— three red lines are enforced as predicates, not conventions:

1. every change is diff-able and revertible (it carries a `baseVersion` plus before/after rules);
2. an unapproved proposal is never production-ready;
3. a failed or rejected proposal marks its affected cases **stale** for re-run
   (`evolve stale --cases '["case-001"]'`).

Checkpoints: **H1** source schema · **H2** LLM-generated rules · **H3** ground-truth labels ·
**H4** quarantine disposition · **H5** gate overrides · **H6** final release.

## Verification, not vibes

Two mechanisms turn "looks right" into evidence:

1. **Golden Master** — `golden-master/fetch-and-verify.sh` downloads the official artefacts and
   checks them against shipped checksum anchors. The factory ships **verification anchors**, not
   licensed corpus data.
2. **Mutation testing** — the `MT-01 … MT-15` suite corrupts a known-good case and asserts the
   gates intercept **100%** of mutations. A mutation that slips through means the *gates* are
   broken and must be fixed before any export is trusted.

## Library use

The CLI is a thin wrapper; everything is available as a library:

```ts
import {
  assembleBundle,
  exportRca100,
  runAllGates,
  scoreExport,
  transformBatch,
} from '@rca-bench-factory/core';

const assembled = assembleBundle(draft);              // { ok: true, bundle } | { ok: false, error }
if (!assembled.ok) throw new Error(assembled.error);

const { files, skipped } = exportRca100(assembled.bundle);
const report = scoreExport('rca100', files);          // 0-100, plus the per-check detail
```

Note that exporters take the **bundle**, not `(case, signals)` — the topology and the
case-level signals are both needed to enforce reference integrity.

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| Every record is quarantined at ingest | offset-less timestamps without `--assume-offset-minutes` | pass the source offset |
| `root-cause entity does not resolve into topology` | `rootCauseEntityId` is not in `graph.entities` | align the id, or add the name to `Entity.aliases` |
| G4 fails with `UNSOLVABLE_CASE` | too few candidate entities / no baseline signal | enrich the case, or accept quarantine under H5 |
| `answer-key-isolated` fails | the authored `query` quotes the root cause | keep the label in `groundTruth` only |
| Score is below 100 but `passed` is true | anchors were omitted | add `--anchors` for the checksum half of the score |
