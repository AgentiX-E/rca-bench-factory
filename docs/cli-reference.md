# CLI reference

`rca-bench` is the runnable command-line entrypoint in `@rca-bench-factory/cli`.
It orchestrates the core library over real files: ingest a flat source, apply
transform rules, run the quality gates, export an IR bundle to a target contract,
and score an exported dataset.

## Implemented commands

| Command | What it does |
| --- | --- |
| `help` | Print usage |
| `version` | Print the semantic version |
| `source` | Ingest a flat file (CSV/TSV/JSONL/JSON) into IR signals |
| `transform` | Apply transform rules (the 7 strategies) to source records |
| `case` | Assemble an IR bundle from a case draft (normalises the fault) |
| `gate` | Run the G1–G5 quality gates on an IR bundle |
| `export` | Export an IR bundle (`bundle.json`) to OpenRCA / RCAEval / RCA100 / AIOps2025 |
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

### `rca-bench transform`

```text
rca-bench transform --input source.json --rules rules.json [--output out.json] [--id-field id]
```

- `--input` and `--rules` are JSON arrays of source records and `TransformRule`s.
- The result (`outputs`, `quarantined`, `counts`) is written to stdout or `--output`.
- `inputCount === outputCount + quarantineCount` is guaranteed by the engine.

### `rca-bench case`

```text
rca-bench case --input draft.json [--output bundle.json]
```

- `draft.json` is a loose authoring draft: `graph` + `case` (fault type as a free
  string, optional category) + `signals`.
- The fault type is normalised and its category inferred when absent; the finished
  bundle is validated against `irBundleSchema`.
- The assembled `IrBundle` is written to stdout or `--output`.

### `rca-bench gate`

```text
rca-bench gate --input bundle.json --target openrca-1.0 [--gate-run-id id]
```

- `--target` selects the G1 structural contract (required signal kinds + whether a
  natural-language query is required). Valid targets: `openrca-1.0`,
  `rcaeval-re1`/`re2`/`re3`, `rca100`.
- The five-gate report (`results` + `finalStatus`) is written to stdout.

### `rca-bench export`

```text
rca-bench export --target openrca-1.0 --input bundle.json --out-dir ./out
rca-bench export --target rcaeval --suite RE2 --input bundle.json --out-dir ./out
rca-bench export --target rca100 --input bundle.json --out-dir ./out
rca-bench export --target aiops2025 --input bundle.json --out-dir ./out
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

`init`/`evolve` (workspace scaffolding and self-evolution) are planned but not yet
wired into the CLI. The underlying core functions already exist: the LLM
rule-generation core and the fault collector. See
[architecture.md](architecture.md) for where they sit.
