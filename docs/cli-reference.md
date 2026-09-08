# CLI reference

`rca-bench` is the runnable command-line entrypoint in `@rca-bench-factory/cli`.
It orchestrates the core library over real files: ingest a flat source, export an
IR bundle to a target contract, and score an exported dataset.

## Implemented commands

| Command | What it does |
| --- | --- |
| `help` | Print usage |
| `version` | Print the semantic version |
| `source` | Ingest a flat file (CSV/TSV/JSONL/JSON) into IR signals |
| `export` | Export an IR bundle (`bundle.json`) to OpenRCA / RCAEval / RCA100 |
| `score` | Score an exported directory against a target field contract |

### `rca-bench source`

```text
rca-bench source --path telemetry.csv [--format csv] [--signal-kind metric]
                 [--layout '{"timestamp":"ts",...}'] [--output out.json]
                 [--time-layout iso8601] [--assume-offset-minutes 480]
                 [--delimiter ,] [--has-header] [--service-name order]
```

- `--layout` is optional: when omitted, the layout is auto-detected from the first
  record's column names.
- Without `--output`, the `{ signals, quarantine }` result is written to stdout.
- Every non-empty source record is either a signal or a quarantine entry — never
  silently dropped.

### `rca-bench export`

```text
rca-bench export --target openrca-1.0 --input bundle.json --out-dir ./out
rca-bench export --target rcaeval --suite RE2 --input bundle.json --out-dir ./out
rca-bench export --target rca100 --input bundle.json --out-dir ./out
```

- `bundle.json` is validated against `irBundleSchema` before export; a malformed
  or schema-invalid bundle fails with exit code 1.

### `rca-bench score`

```text
rca-bench score --target openrca-1.0 --dir ./out [--anchors '{"path":"sha256"}']
```

- `--dir` is read recursively into the exported-file map.
- `--anchors` (optional) adds SHA-256 Golden-Master verification.
- Exit code is 0 when the report passes, 1 when it fails (so CI can gate on it).

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Success |
| 1 | Invocation or data error (bad flag, missing file, invalid bundle, failing score) |

## Not yet implemented

The full dataset-authoring pipeline (`init`, `transform`, `case`, `gate`,
`evolve`) is planned but not yet wired into the CLI. The underlying core
functions already exist: `transformBatch`, `runAllGates`, the fault collector and
the LLM rule-generation core. See [architecture.md](architecture.md) for where
they sit.
