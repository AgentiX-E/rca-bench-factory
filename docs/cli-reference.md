# CLI reference (planned)

The `rca-bench` CLI is the planned thin wrapper over `@rca-bench-factory/core`.
This document is the contract the CLI will implement; the underlying functions
already exist in the core package.

> Status: the CLI package is a next-milestone deliverable. The core functions below
> are implemented and tested today; the CLI merely orchestrates them.

## Global flags

| Flag | Meaning |
| --- | --- |
| `--config <path>` | Load `rca-bench.config.*` (default: auto-discover) |
| `--verbose` | Emit per-record quarantine and gate detail |
| `--dry-run` | Execute without writing outputs |

## Commands

### `rca-bench init`

Scaffold a factory workspace.

```text
rca-bench init --target openrca1.0 --system demo
```

### `rca-bench source`

Register a data source and run tier detection.

```text
rca-bench source --path ./telemetry --detect auto
rca-bench source --path ./metrics.csv --layout '{"kind":"csv","tier":"t3"}'
```

Backed by the six-tier ingest model (see [user-guide.md](user-guide.md)).

### `rca-bench transform`

Apply rules over the full dataset via the deterministic engine.

```text
rca-bench transform --rules rules.yaml
```

Backed by `transformBatch` / `checkNoSilentLoss`. Reports `outputCount`,
`quarantineCount`, and every quarantine reason.

### `rca-bench case`

Define a fault case and its ground truth.

```text
rca-bench case --inject 2026-09-06T04:05:06Z --window 10m --category runtime
```

### `rca-bench gate`

Run the five quality gates.

```text
rca-bench gate --strict
```

Backed by `runAllGates`. `--strict` treats `quarantined` as non-admittable.

### `rca-bench export`

Emit a target-format dataset.

```text
rca-bench export --target rcaeval:re2 --out ./out
rca-bench export --target openrca1.0 --out ./out
```

Backed by `exportOpenRca` / `exportRcaEval`.

### `rca-bench score`

Verify an exported dataset against the Golden Master anchors.

```text
rca-bench score --golden-master ./out
```

### `rca-bench evolve`

Refine rules/gates from quarantine and rejection feedback (externally anchored).

```text
rca-bench evolve --feedback quarantine.jsonl --checkpoint h2
```

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Success (all gates passed, export verified) |
| 2 | Data errors (quarantine non-empty, gate rejected) — never an engine crash |
| 1 | Programmer/invocation error (bad flag, missing file) |
