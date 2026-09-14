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
| `ingest` | Ingest a prime dataset slice (official benchmark data) into an IR bundle |
| `transform` | Apply transform rules (the 7 strategies) to source records |
| `case` | Assemble an IR bundle from a case draft (normalises the fault) |
| `gate` | Run the G1–G5 quality gates on an IR bundle |
| `export` | Export an IR bundle (`bundle.json`) to OpenRCA 1.0/2.0 / RCAEval / RCA100 / AIOps2025 / Cloud-OpsBench / ITBench |
| `score` | Score an exported directory against a target field contract |
| `official` | Run the published metric of a target against an export: oracle + mutation grid |
| `report` | Render coverage, gates and score into a self-contained HTML report |
| `pack` | Pack a directory into a byte-reproducible `tar.gz` with a SHA-256 manifest |
| `evolve` | Propose, approve, reject or roll back a self-evolution (HITL + red lines) |

## Getting help

Every command accepts `--help` (or `-h`), and `help <command>` is equivalent.
The per-command reference is generated from the same table the parser reads, so
it cannot list a flag the command rejects:

```bash
rca-bench ingest --help
rca-bench help gate
rca-bench export -h
```

Help is not a way past a bad command name: `rca-bench frobnicate --help` still
fails with `unknown command 'frobnicate'`, because a typo silently answered with
usage text teaches the caller nothing.

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
- Rejected records are named on stderr (`N of M record(s) rejected`, then one line
  per record with its 1-based source line and reason). Without this, a file with
  three data rows and one bad row produces a JSON document identical to one from a
  two-row clean file. A clean file prints nothing.

### `rca-bench ingest`

```text
rca-bench ingest --source ./official-data --target rcaeval --cases cases.json
                 [--system tt] [--output bundle.json]
                 [--entities '[...]'] [--edges '[...]']
                 [--lead-ms 600000] [--lag-ms 600000]
```

- The `ingest` half of the round trip: it turns an official dataset slice into an
  `IrBundle`, which `export` then turns back into the target's own layout and
  `official` scores with the published metric.
- Valid `--target` values: `rcaeval`, `openrca-1.0`, `openrca-2.0`, `rca100`,
  `aiops2025`, `cloud-opsbench`, `itbench`.
- `--cases` is a JSON array of case descriptors. Each carries `caseId`,
  `component`, `faultType` and `injectTime`, and may add `window`, `query`,
  `difficulty`, `pathPrefixes` and per-file `files` overrides:
  ```json
  [
    {
      "caseId": "RE2-ts-order-service-cpu_1",
      "component": "ts-order-service",
      "faultType": "cpu",
      "injectTime": "2025-03-01T00:10:00.000Z"
    }
  ]
  ```
- **Labels are never inferred.** The component, the fault type and the injection
  time are read from the descriptor and validated against the telemetry; a
  component that is neither observed in the data nor declared as an entity fails
  the run. This is what keeps the reproduction honest — a guessed label would
  make the round trip score against itself.
- `--entities` declares an entity the telemetry does not carry. A root-cause
  component that failed before the observation window opened leaves no trace in
  `service.name`, so no entity can be inferred for it and the run stops with
  `does not resolve to an entity in the graph`. Supplying the missing service
  resolves the case:
  ```bash
  rca-bench ingest --source ./official-data --target rcaeval --cases cases.json \
    --entities '[{"entityId":"service:rcaeval/ts-absent","kind":"service","name":"ts-absent","aliases":[]}]'
  ```
  The value is inline JSON, matching `--layout` and `--anchors`, and each entry
  is validated against the same entity contract the IR uses. An empty array is
  rejected: a declaration that declares nothing is a mistake, not a no-op.
- `--edges` adds topology edges the telemetry does not express, as inline JSON in
  the `{ "from", "to", "relation" }` shape, where `relation` is one of
  `contains`, `hosts`, `calls`, `same_as`. Endpoints must be entity ids that
  exist in the graph.
- Both flags are checked before the bundle is written, so an inconsistent
  declaration cannot leave an artefact behind. A declaration is inconsistent
  when it carries a blank `entityId`, `name`, `alias`, `from` or `to`; an
  out-of-contract `relation`; or an endpoint no entity in the finished graph
  matches. The last check runs against the **assembled** graph, not against the
  declarations alone, so an edge may point at an entity that telemetry proves
  without anyone having to declare it. The offending field is named in the
  error, and a dangling endpoint is reported in preference to a blank one when
  both are present, because it names the entity that is actually missing.
  Avoiding the check does not help: `rca-bench gate` raises the same defect as
  `G2/DANGLING_EDGE_REF`, but only after a bundle that violates it already
  exists on disk. Both sites call the same detector, so they cannot disagree
  about what "dangling" means.
- Files are routed to cases by `pathPrefixes`. A case without prefixes claims
  every file left over; a file claimed by no case is reported in `unclaimed`.
- The window defaults to ten minutes either side of `injectTime`; `--lead-ms`
  and `--lag-ms` override it, and `--lag-ms` defaults to the lead when only the
  lead is given. Both are non-negative integers.
- **Every rejected source row is reported on stderr, with its file, line and
  reason**, and the per-case total is printed first:
  ```text
  warning: case 'RE2-ts-order-service-cpu_1': 1 source row(s) rejected
    metrics/metrics.csv, line 3: metric value 'NOT_A_NUMBER' is not a finite number
  ```
  This is the `ingest` half of the same "zero silent loss" invariant the
  exporters honour: a source record becomes either a signal or a quarantine
  entry, and the quarantine entries are the only remaining record of what was
  dropped. A run that loses rows and says nothing produces a bundle that cannot
  be told apart from one built from a source that only ever had the rows that
  survived. **A clean source prints nothing.** A whole-file rejection (an
  unreadable header, an undeterminable format) is reported as `<file> (whole
  file)` rather than as a line number, since no line is responsible.
  At most ten rows are listed individually, with `... and N more` when the list
  is longer, so the count stays readable when a dataset is badly mis-specified.
- A case that could not be read at all is reported as a `hardErrors` entry on
  stderr without failing the run. Non-zero `hardErrors` must be treated as "that
  case was not reproduced".
- The bundle is written to `--output` or to stdout.

**Round trip.** The three commands compose into the L4 verification:

```bash
rca-bench ingest --source ./official-data --target rcaeval --cases cases.json --output bundle.json
rca-bench export --target rcaeval --suite RE2 --input bundle.json --out-dir ./roundtrip
rca-bench official --target rcaeval-re2 --dir ./roundtrip
```

### `rca-bench transform`

```text
rca-bench transform --input source.json --rules rules.json [--output out.json] [--id-field id]
```

- `--input` and `--rules` are JSON arrays of source records and `TransformRule`s.
- The result (`outputs`, `quarantined`, `counts`, `idFieldMisses`, `duplicateIds`)
  is written to stdout or `--output`.
- `inputCount === outputCount + quarantineCount` is guaranteed by the engine.
- Rejected records are named on stderr (`N of M record(s) rejected`, then one line
  per record with its id and error code). Without this, a bundle built from three
  rows with one rejection is byte-identical to one built from two rows.
- `--id-field <field>` names the column holding each record's stable id. If the
  field is missing from a record, that record falls back to a positional `row-N`
  id and a warning reports how many did so; a warning also lists any id value
  carried by more than one record, since a duplicated id no longer identifies a
  record. A clean run prints nothing.

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
  `openrca-2.0`, `rcaeval-re1`/`re2`/`re3`, `rca100`, `aiops2025`,
  `cloud-opsbench`, `itbench`.
- The five-gate report (`results` + `finalStatus`) is written to stdout.

### `rca-bench export`

```text
rca-bench export --target openrca-1.0 --input bundle.json --out-dir ./out
rca-bench export --target openrca-2.0 --input bundle.json --out-dir ./out
rca-bench export --target rcaeval --suite RE2 --input bundle.json --out-dir ./out
rca-bench export --target rca100 --input bundle.json --out-dir ./out
rca-bench export --target aiops2025 --input bundle.json --out-dir ./out
rca-bench export --target cloud-opsbench --input bundle.json --out-dir ./out
rca-bench export --target itbench --input bundle.json --out-dir ./out
```

- `bundle.json` is validated against `irBundleSchema` before export; a malformed
  or schema-invalid bundle fails with exit code 1.
- The bundle must also be **internally consistent**, which the schema cannot
  express. An edge naming an entity the file never declares, or a relation
  outside `contains|hosts|calls|same_as`, is rejected before anything is written,
  with exit code 1 and no output directory left behind:
  ```text
  error: bundle is not exportable: DANGLING_EDGE_REF: edge.to references 'service:tt/ghost' which is not an entity. Run `rca-bench gate` to see every violation.
  ```
  This matters most for `rca100`, whose `topology.json` types an unknown endpoint
  as `external`. Without the guard the invented endpoint is *labelled* as an
  observed external dependency, so a consumer cannot tell it from a real one.
- Every target runs the same check, including the four that never read `graph`
  (`openrca-1.0`, `rcaeval`, `cloud-opsbench`, `itbench`). A bundle describes one
  system, so target selection must not decide whether a contradiction is caught.
- Only **graph** inconsistency is fatal here. A case-level defect — a root cause
  that does not resolve, a signal naming a service outside the graph — is
  skipped per case and the remaining cases still export, matching how
  `rca-bench gate` *quarantines* rather than rejects such a bundle.
- Because a skip is a quarantine, it is **reported**: `export` names every case
  it could not express, and why, on stderr — the same treatment `ingest`,
  `source` and `transform` give the records they lose.

```text
warning: 1 of 2 case(s) skipped
  case-002: no telemetry signals attached
```

  A bundle of N cases that exports N−1 produces a *smaller benchmark*, and
  `score` then scores the remainder and reports a number that looks complete.
  The warning is what makes the two distinguishable. It is printed even when
  `--output` is used, and the total is never capped — only the per-case detail
  is, at 10 lines, stated as `... and N more`.
- Which condition triggers a skip depends on the target. `openrca-1.0`,
  `openrca-2.0`, `rcaeval`, `rca100` and `aiops2025` skip a case with no
  telemetry; `cloud-opsbench` and `itbench` skip only on an empty root-cause
  component, which the IR schema (`z.string().min(1)`) forbids, so through this
  command those two never skip and stay silent.

### `rca-bench score`

```text
rca-bench score --target openrca-1.0 --dir ./out [--anchors '{"path":"sha256"}']
rca-bench score --target openrca-2.0 --dir ./out
rca-bench score --target aiops2025 --dir ./out
rca-bench score --target cloud-opsbench --dir ./out
rca-bench score --target itbench --dir ./out
```

- `--dir` is read recursively into the exported-file map.
- `--anchors` (optional) adds SHA-256 Golden-Master verification. The value is an
  inline JSON object mapping a path inside `--dir` to the expected lowercase
  hex digest, for example
  `{"order-prod/query.csv":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"}`.
  **Supplying the flag is a claim about the bytes**, so the value must name at
  least one file: an empty object (`{}`) is rejected rather than downgraded to
  structure-only scoring, because the resulting report would otherwise be
  indistinguishable from one that never verified a hash. Omit the flag to score
  the field contract alone; the report then carries no `checksum` section.
  Checksum verification requires the file sets to agree exactly — a mismatched,
  missing or unanchored file fails the report.
- Exit code is 0 when the report passes, 1 when it fails (so CI can gate on it).

### `rca-bench official`

```text
rca-bench official --input bundle.json [--output official.json]
rca-bench official --target openrca-1.0 --dir ./out [--allow-empty-reason 'reason']
```

Runs the **published metric** of a target - not the field contract - against real
exporter output, in two disjoint modes:

- `--input <bundle.json>` exports the bundle for **all nine** score targets and
  runs the whole regression grid on each. This is the end-to-end guarantee.
- `--target <t> --dir <dir>` runs one target against an already exported
  directory, so a dataset produced elsewhere can still be verified.

Mixing the two modes is rejected rather than silently ignored.

Every report carries the oracle score, the per-facet mutation grid, the metric
provenance (`official` for a metric transcribed from the upstream scorer,
`derived` for one reconstructed from the paper) and any failures. Three
properties are asserted per case:

| Property | What it proves |
| --- | --- |
| `oraclePerfect` | Submitting the exported answer key scores 1.0 - a missing or malformed field breaks it immediately |
| `mutationsDegrade` | Perturbing a facet the rule scores lowers the score, so the metric is not vacuously returning 1 |
| `unscoredFacetsInert` | Perturbing a facet the rule ignores does nothing, so the declared facet list is exactly right |

A target that exports zero cases **fails** unless `--allow-empty-reason` states
why that is legitimate for this dataset, so a broken exporter cannot hide behind
a skip. Exit code is 0 when no target failed, 1 otherwise.

A target is allowed to drop a case it cannot represent, and a *partial* drop is
not a failure — the oracle over what survived is still perfect. It is reported
like the `export` skip it is, prefixed with the target that lost it, so "9
targets passed" cannot mean "nine complete benchmarks" when one of them scored
half of one:

```text
warning: rcaeval-re3: 1 of 2 case(s) skipped
  case-001: RE3 targets code-level faults only
```

Only the targets that lost a case are named; the eight that exported everything
stay silent.

### `rca-bench report`

```text
rca-bench report --input bundle.json [--title "Report"] [--target openrca-1.0] [--output report.html]
```

- Renders a self-contained HTML page with four sections: the entity graph
  (entities + edges + reference-integrity verdict), observability coverage,
  quality gates (G1–G5) and the score for `--target`.
- `--target` selects the score/gate contract (default `openrca-1.0`); the bundle
  is exported and scored for that target internally.
- `--title` defaults to `rca-bench report`; `--output` defaults to stdout.
- All user-controlled data (title, entity ids, case ids, violation messages,
  check details) is HTML-escaped before interpolation.
- The gates and the score **measure different things**, and the page states what
  each covers rather than leaving the reader to reconcile them:
  - the gates decide **admissibility** — whether the dataset may be published and
    evaluated at all (label correctness, solvability by a baseline, answer-key
    isolation);
  - the score judges the **field contract** of the exported bytes — file layout,
    column headers, modality coverage. It does not judge whether the labels are
    right.
- Because the two can legitimately disagree, a dataset the gates hold back is
  **never presented with a green score**. The number is still reported, in the
  muted class, with a line naming the gate verdict that held it back. When the
  gates report `admitted`, or when no gate section is rendered, the score is
  painted normally.
- With several gate sections on one page the **worst verdict governs**, so a
  page that happens to render a passing bundle first cannot present the score as
  though nothing were wrong.
- The score always states **its denominator**. The page exports the bundle
  internally, and an exporter may legally drop a case it cannot represent —
  `rcaeval-re3` admits code-level faults only, so a bundle of one code fault and
  two resource faults is scored over one case. `score 100` over a third of a
  benchmark and `score 100` over all of it are different claims, and only the
  denominator separates them:

  ```text
  target rcaeval-re3 — score 100
  Scored 1 of 3 case(s) — 2 could not be exported.
  ```

  The count is stated on every page, not only when cases were lost: showing it
  "only when something is wrong" is the silence being avoided. When cases were
  lost they are listed under *Cases not scored* with the reason each gave.
- The same loss is written to **stderr**, because `--output` makes the page the
  artefact while the terminal is where the operator is looking, and reporting in
  one and not the other is a fix at one of two call sites.

### `rca-bench pack`

```text
rca-bench pack --input <dir> --output <file.tar.gz> [--prefix <name>]
```

- Writes a **byte-reproducible** ustar archive: entries are sorted by path, and
  `mtime`, `uid` and `gid` are pinned to zero, so the same inputs always produce
  the same bytes (and therefore the same digest) on any machine.
- Adds `MANIFEST.json` at the pack root with the byte length and SHA-256 of every
  file, so a recipient can verify what they extracted without trusting the
  transport. The manifest's rows name **archive paths, prefix included**: it is
  written into the archive, so its rows must resolve there. (Stripping the prefix
  made a prefixed pack fail its own verification, with every file reported both
  missing and undeclared.)
- `--prefix` nests every file, manifest included, under one top-level directory.
  Unpack from the directory *containing* that directory, since the manifest's paths
  are relative to the archive root.
- Refuses an input directory that already contains `MANIFEST.json`, rather than
  silently overwriting it.
- `verifyPackManifest` excludes `MANIFEST.json` from the comparison. A recipient
  hands over everything they extracted, and the manifest is the document doing
  the declaring, so reporting it as undeclared would flag a faithful extraction
  as corrupt. Callers that pass only the content set keep working unchanged.
- Prints a summary on stdout and exits `0`:

```json
{
  "output": "pack.tar.gz",
  "fileCount": 2,
  "archiveFileCount": 3,
  "totalBytes": 17,
  "archiveBytes": 204,
  "sha256": "…"
}
```

- The two counts answer two different questions, because an archive and its
  manifest do not hold the same number of files. `fileCount` counts the content
  files the manifest lists — the manifest cannot list itself, since it cannot
  contain its own SHA-256. `archiveFileCount` counts every file a recipient
  extracts, the manifest included, and therefore equals `fileCount + 1`.
- The manifest inside the archive carries the same two fields, so whoever
  unpacks the download can check both numbers against the tree they hold
  instead of taking either on trust.

- `pnpm examples:bundle` uses the same machinery to build the downloadable
  example pack served by the site (`site/assets/rca-bench-factory-examples.tar.gz`),
  and `pnpm examples:bundle:check` fails CI when the committed artefact is stale.
- `pnpm examples:verify` (`scripts/verify-example-pack.mjs`) extracts that archive
  and hands the result to `verifyPackManifest`, refusing it if any file is
  missing, undeclared, a different size or a different digest — and if
  `archiveFileCount` disagrees with the tree. It delegates to the real verifier
  rather than reimplementing the rules: the check it replaced was an inline
  `node -e` block in the workflow, and when the manifest was corrected to name
  archive paths that copy kept resolving rows against the pack root, so CI failed
  on the commit that fixed the pack. It exits `0` on success and prints the file
  count it cross-checked against the extraction:

```text
9 packed files verified against rca-bench-factory-examples/MANIFEST.json
```

### `rca-bench evolve`

```text
rca-bench evolve propose --input draft.json [--output proposal.json]
rca-bench evolve approve --input proposal.json [--note "reason"] [--output approved.json]
rca-bench evolve reject  --input proposal.json [--note "reason"] [--output rejected.json]
rca-bench evolve stale   --input proposal.json --cases '["case-001", ...]'
```

- `propose` assembles a **pending** evolution proposal from a draft
  (`id`, `layer`, `action`, `trigger`, `changes`, `baselineScore`,
  `candidateScore`, `baseVersion`); the HITL gate (H1–H6) is derived from the
  action and the regression verdict from the score delta.
- `approve` / `reject` move a proposal through the HITL checkpoint; an optional
  reviewer note is attached.
- **A HITL decision is final.** The proposal document is the only record of the
  review, so `approve` and `reject` refuse a proposal that already carries a
  verdict, and exit 1 without writing anything:
  ```text
  error: proposal 'prop-001' is already approved; a HITL decision is final - submit a new proposal to supersede it
  ```
  Both a reversal (`approve` then `reject`) and a repeat (`approve` twice) are
  refused. A reversal silently retracts an approval that may already have been
  acted on, and a repeat replaces the reviewer note that actually decided the
  change — leaving a document that still reads `approved` but no longer says who
  allowed it. A proposal whose verdict was wrong is superseded by a **new**
  proposal, which keeps both decisions in the record. Re-deciding is not a repair
  path.
- `stale` returns the affected cases to re-run when a proposal failed its
  regression or was rejected (red line 3: rollback); an approved, passing
  proposal returns nothing to roll back.
- The three red lines are enforced as predicates in the core: a change must be
  diff-able and revertible, an unapproved proposal is never production-ready, and
  a failed/rejected proposal marks its affected cases stale.

## End-to-end example

Every command below runs against [`examples/order-prod/`](../examples/order-prod/) from the
repository root, after `pnpm install && pnpm build`.

```bash
# 1. Ingest an offset-less CSV export (auto-detected columns)
node packages/cli/dist/main.js source \
  --path examples/order-prod/metrics.csv \
  --signal-kind metric \
  --assume-offset-minutes 480

# 2. Normalise timestamps, map CMDB names, convert ratio -> percent
node packages/cli/dist/main.js transform \
  --input examples/order-prod/records.json \
  --rules examples/order-prod/rules.json

# 3. Assemble and validate a bundle (fault category is inferred)
node packages/cli/dist/main.js case \
  --input examples/order-prod/draft.json --output ./bundle.json

# 4. Run the quality gates for a target contract
node packages/cli/dist/main.js gate --input examples/order-prod/bundle.json --target rca100

# 5. Export, score and render
node packages/cli/dist/main.js export --target rca100 \
  --input examples/order-prod/bundle.json --out-dir ./out
node packages/cli/dist/main.js score --target rca100 --dir ./out
node packages/cli/dist/main.js report --input examples/order-prod/bundle.json \
  --target rca100 --output report.html

# 6. Self-evolution under human review
node packages/cli/dist/main.js evolve propose --input examples/order-prod/proposal-draft.json
```

The same lifecycle is walked through step by step, with real output, in the
[user guide](user-guide.md).

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Success |
| 1 | Invocation or data error (bad flag, missing file, invalid bundle, failing score) |

## Not yet implemented

`init` (workspace scaffolding) is planned but not yet wired into the CLI. See
[architecture.md](architecture.md) for where it sits.
