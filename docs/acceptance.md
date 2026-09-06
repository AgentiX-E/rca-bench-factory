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

## L3 — Gate soundness (mutation testing)

A 15-mutation suite corrupts a known-good case and asserts the gates intercept
**100%** of mutations. The current matrix:

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

If **any** mutation slips through, the gates are broken and must be fixed before any
export is trusted. `QualityGateReport.mutationTestPassed` is `true` only when the
full suite passed.

## L4 — Official reproduction (Golden Master)

- `golden-master/fetch-and-verify.sh` downloads official data from its canonical
  source and checks it against shipped anchors (`expected.json` + checksums).
- Reproduced outputs must match within stated tolerances (byte-exact for CSV layout,
  value-tolerant for floating-point metrics).

## L5 — End-to-end scenarios and HITL budget

Ten scenarios E1–E10 exercise the full pipeline (T1–T6 ingest, each target format,
degradation, quarantine, evolution). HITL is budgeted at **12–22.5 person-days per
1,000 cases** (vs 55–110 manual) — roughly a 78% reduction.

## Definition of Done (per change and per release)

- [ ] All layers L0–L3 green locally and in CI.
- [ ] Golden Master verification passes (L4).
- [ ] No `continue-on-error`, no `|| true`, no skipped/`.only` tests, no mocks.
- [ ] Coverage ≥ 95% per dimension, 100% functions.
- [ ] Every LLM-produced field carries `FieldProvenance`.

## Honesty boundary

The factory **does not** claim a dataset is compliant if it fabricated a missing
modality. A target that requires an absent modality is reported as infeasible (or
exported as its largest valid subset with an explicit gap) — never silently "filled".
