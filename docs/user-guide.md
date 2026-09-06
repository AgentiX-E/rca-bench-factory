# User guide

This guide walks through the complete lifecycle of turning enterprise telemetry into
a compliant RCA benchmark set. It assumes you have followed the [quick start](../README.md#quick-start)
and can import `@rca-bench-factory/core`.

## 0. Where you are in the SDLC

`rca-bench-factory` is used in the **evaluation-engineering** phase of the SDLC —
after an observability stack exists, but before an RCA model/agent is trained or
evaluated. It does **not** run in the production request path.

| SDLC stage | Who uses it | What they do |
| --- | --- | --- |
| Observability build-out | SRE / platform engineer | Expose metrics/logs/traces (any format) |
| **Benchmark authoring** | **ML/Ops engineer, RCA researcher** | **Run this tool: ingest → transform → gate → export** |
| Benchmark verification | QA / evaluation owner | Run Golden Master + mutation suite; sign off |
| RCA agent training/eval | RCA model developer | Consume the emitted dataset |

## 1. Ingest a data source

There are six access tiers. You do **not** need OpenTelemetry — OTel is an
accelerator, not a prerequisite.

| Tier | When to use | Notes |
| --- | --- | --- |
| T1 OTel | You already emit OTLP | Fastest path; semconv already applied |
| T2 Vendor adapters | Prometheus, ELK, Datadog, … | Connector maps vendor schema to IR |
| T3 Flat files | CSVs, JSONL, log files | `--source` with a declared layout |
| T4 Scrape | Prometheus/HTTP API available | Pull endpoint → normalized signals |
| T5 Snapshot | Kubernetes state / config snapshot | For state-snapshot paradigms (Cloud-OpsBench) |
| T6 LLM-assisted custom | Proprietary / unknown format | LLM proposes rules; engine executes; gates verify |

Every tier produces an **Observability Coverage Report** (see `computeCoverage`)
that tells you which target benchmarks are feasible given your modalities — for
example, RE1 (metric-only) is always reachable, RE3 (code-level) is not if you have
no code/trace signal.

## 2. Transform into the IR

Declare transform rules (deterministically, or LLM-proposed for T6). Each rule is a
discriminated result — data problems are quarantined, never silently dropped.

```ts
import { transformBatch, checkNoSilentLoss } from '@rca-bench-factory/core';

const result = transformBatch(rawSignals, rules);
// Guaranteed: result.outputCount + result.quarantineCount === rawSignals.length
checkNoSilentLoss(result);
for (const q of result.quarantine) {
  console.warn(q.reason, q.record);
}
```

## 3. Build the entity graph

Normalize entity aliases so every reference resolves. Ambiguous aliases are left
unresolved — the system never guesses.

```ts
import { indexGraph, normalizeAliases, findDanglingEdgeRefs } from '@rca-bench-factory/core';

const idx = indexGraph(graph);
const { graph: merged, mapping } = normalizeAliases(graph); // union-find over `same_as`
const dangling = findDanglingEdgeRefs(graph, idx);
```

## 4. Run the quality gates

Admit a case only when all five gates pass.

```ts
import { runAllGates } from '@rca-bench-factory/core';

const report = runAllGates(faultCase, { graph, signals });
if (report.finalStatus !== 'admitted') {
  for (const r of report.results) {
    if (r.status !== 'passed') console.error(r.gateId, r.violations);
  }
}
```

## 5. Export to a target benchmark

```ts
import { exportOpenRca, exportRcaEval } from '@rca-bench-factory/core';

const openrca = exportOpenRca(faultCase, signals);      // query.csv, record.csv, telemetry/…
const rcaeval = exportRcaEval(faultCase, signals, 'RE2'); // metrics.json, logs.csv, traces.csv
```

## 6. Verify the output is compliant

Compliance is **proven**, not assumed, through two mechanisms:

1. **Golden Master** — `golden-master/fetch-and-verify.sh` downloads official data
   and checks it against shipped anchors (`expected.json` + checksums). This is
   external grounding, never self-certification.
2. **Mutation testing** — the 15-mutation suite (`MT-01` … `MT-15`) corrupts a known
   good case and asserts the gates intercept 100% of the mutations. If a mutation
   slips through, the *gates* are broken and must be fixed before any export is trusted.

## 7. Human-in-the-loop checkpoints

Approve the risky transitions:

- **H1** source schema · **H2** LLM rules · **H3** ground-truth labels ·
  **H4** quarantine disposition · **H5** gate overrides · **H6** final release.

## 8. CLI (planned)

```text
rca-bench init --target openrca1.0 --system demo
rca-bench source --path ./telemetry --detect auto
rca-bench transform --rules rules.yaml
rca-bench case --inject 2026-09-06T04:05:06Z --window 10m
rca-bench gate --strict
rca-bench export --target rcaeval:re2 --out ./out
rca-bench score --golden-master ./out
rca-bench evolve --feedback quarantine.jsonl
```

See [cli-reference.md](cli-reference.md) for the full command surface.
