# Acceptance plan and criteria

"Usable and 100% compliant" is a **provable** claim, not a marketing claim. The
acceptance model is a pyramid of six layers; each layer is a gate that must pass
before the layer above it is meaningful.

## L0 — Deterministic core correctness

- `pnpm typecheck` clean under strict TypeScript.
- `pnpm lint` clean (no mocks, no secrets).
- Unit tests pass with **≥ 95%** statements/lines/branches and **100%** functions.

## L1 — Transform invariants

- **Idempotency** — applying a transform twice yields the same output.
- **Zero silent loss** — `inputCount === outputCount + quarantineCount` for every batch.
- **7-strategy matrix** — each of `time`/`unit`/`map`/`regex`/`template`/`lookup`/`expr`
  has a dedicated test, including error paths (a data problem becomes a result, never a throw).

## L2 — IR contract integrity

- **Structural** — `signal === payload.kind`; required fields present (G1).
- **Reference integrity** — every entity reference resolves; no dangling edges (G2).
- **Time consistency** — `injectTime` and `window` are canonical UTC ISO-8601 and
  ordered (`start ≤ injectTime ≤ end`).

## L3 — Gate and export soundness (mutation testing)

An 18-mutation suite of two halves: **MT-01…MT-15** corrupt a known-good case and
assert the gates intercept **100%** of them, and **MT-16…MT-18** corrupt the
*exported artefacts* and assert the official-metric regression intercepts them.
The current matrix:

| Id | Mutation | Caught by |
| --- | --- | --- |
| MT-01 | Drop required field | G1 |
| MT-02 | `signal` ≠ `payload.kind` | schema / G1 |
| MT-03 | Rename/remove `service.name` | G1 `MISSING_SERVICE_NAME` |
| MT-04 | Non-UTC timestamp | time parser / G1 |
| MT-05 | Unit mismatch on metric | unit converter / G2 |
| MT-06 | Unresolved entity reference | G2 |
| MT-07 | Ambiguous entity alias | G2 |
| MT-08 | Broken causal hop (unreachable) | G2 `CAUSAL_HOP_NOT_IN_TOPOLOGY` |
| MT-09 | Flat baseline (no anomaly) | G3 (Z-score < 2.0) |
| MT-10 | Unsustained spike | G3 (sustained < 3) |
| MT-11 | Trivially solvable case | G4 |
| MT-12 | Remove topology edge | G2 `CAUSAL_HOP_NOT_IN_TOPOLOGY` |
| MT-13 | PII in log body | G5 |
| MT-14 | Duplicate case | G5 (fingerprint) |
| MT-15 | Inferred field backing ground truth | provenance guard / G5 |
| MT-16 | Reword the OpenRCA `scoring_points` template | official regression (oracle cannot score 1.0) |
| MT-17 | Drop the instance index from an RCAEval directory | official regression (no ground truth read) |
| MT-18 | Corrupt every AIOps2025 ground-truth record | official regression (no ground truth read) |

If **any** mutation slips through, the gates are broken and must be fixed before any
export is trusted. `test/mutation.test.ts` asserts the suite results directly; the
`mutationTestPassed` field on `QualityGateReport` is carried through from `meta`
when the caller supplies it, and is **absent** from CLI output otherwise.

## L4 — Official reproduction (Golden Master, official metrics and round trip)

- `golden-master/verify.mjs` re-runs every exporter against the self-contained
  fixture in `fixture.json` and checks the output against the committed anchors in
  `expected.json`, byte for byte (6 OpenRCA + 4 RCAEval files).
- `golden-master/fetch-and-verify.sh` runs that self-contained check, then prints
  the per-dataset instructions for repeating it against official data you have
  downloaded yourself. It performs **no network access**: fetching is left to the
  operator, who is responsible for the license terms in `THIRD-PARTY-NOTICES.md`.
  Treating the self-anchored check as if it validated external data would be a
  category error — it can only prove our output is stable, not that it is right.
- Reproduced outputs must match within stated tolerances (byte-exact for CSV layout,
  value-tolerant for floating-point metrics).
- **Official-metric regression** (`pnpm official:check`, and
  `rca-bench official` for any dataset): the answer key a target exports is
  submitted to that target's *published* metric and must score **1.0** under its
  own rule, on real exporter output. This is a strictly stronger claim than the
  field contract `score` makes: a dataset can be perfectly well-formed and still
  unscorable.
  - Every declared facet must be **sensitive** to perturbation (the metric is not
    vacuously returning 1) and every undeclared facet **inert** (the facet list is
    exactly right).
  - A target that exports zero cases fails unless the caller states why
    (`--allow-empty-reason`), so no exporter can hide behind a skip.
  - Metrics are labelled `official` (transcribed from the upstream scorer or the
    paper's protocol) or `derived` (reconstructed because the upstream scorer is
    not public); the label travels with every score.
- **Round trip** (`rca-bench ingest` → `rca-bench export` → `rca-bench official`):
  official dataset data is read into the IR, written back out in the target's own
  layout, and graded by the published metric. The three anchors above all begin
  from a bundle *we* authored, so they cannot detect a misunderstanding shared by
  our exporter and our scorer; the round trip begins from the dataset itself and
  therefore can.
  - Case labels (root-cause component, fault type, injection time) are supplied in
    the descriptor and **never inferred**; a reproduction scored against a guessed
    answer proves nothing.
  - A component that is neither observed in the telemetry nor declared as an entity
    fails the ingest, so the emitted bundle is reference-complete by construction.
  - Zero silent loss: every source record is a signal or a quarantine entry, and a
    file claimed by no case is reported, not dropped.
  - A case that was never actually read is reported in `hardErrors`; a reproduction
    with non-empty `hardErrors` does not count as complete for that case.
  - Licensed corpora are never vendored: they stay out of the repository and
    `golden-master/` keeps checksum anchors only. Nothing in the default CI path
    downloads them, so the round trip is exercised against the operator's own copy.

## L5 — End-to-end scenarios and HITL budget

Ten scenarios E1–E10 exercise the full pipeline (T1–T6 ingest, each target format,
degradation, quarantine, evolution). HITL is budgeted at **12–22.5 person-days per
1,000 cases** (vs 55–110 manual) — roughly a 78% reduction.

## Definition of Done (per change and per release)

- [ ] All layers L0–L3 green locally and in CI.
- [ ] Golden Master verification, the official-metric regression and the round trip pass (L4).
- [ ] No `continue-on-error`, no `|| true`, no skipped/`.only` tests, no mocks.
- [ ] Coverage ≥ 95% per dimension, 100% functions.
- [ ] Every LLM-produced field carries `FieldProvenance`.

## Honesty boundary

The factory **does not** claim a dataset is compliant if it fabricated a missing
modality. A target that requires an absent modality is reported as infeasible (or
exported as its largest valid subset with an explicit gap) — never silently "filled".
