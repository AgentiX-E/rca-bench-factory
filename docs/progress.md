# Progress tracking

Status of the acceptance pyramid, with the evidence for each line. "Path
executable" and "number reproduced" are kept apart throughout: the first is
something CI can prove today, the second needs official data that is not
vendored.

## Headline

| Layer | Claim | Status | Evidence |
| --- | --- | --- | --- |
| L0 | Deterministic core correctness | **met** | `pnpm typecheck` clean; `pnpm lint` clean; 1697 core + 173 CLI tests pass |
| L1 | Transform invariants | **met** | 7-strategy matrix, idempotency and zero-silent-loss suites |
| L2 | IR contract integrity | **met** | G1/G2/G3 gates, reference integrity, time consistency |
| L3 | Gate and export soundness | **met** | 18-mutation suite, 100% intercepted |
| L4 | Official reproduction | **3 of 4 anchors met** | see below |
| L5 | End-to-end scenarios | **met** | CLI scenarios and HITL budget suites |

## Coverage

Measured by `vitest run --coverage` (v8) over `packages/core`, the only package
with a coverage gate.

| Dimension | Result | Gate |
| --- | --- | --- |
| Statements | 99.95% | ≥ 95% |
| Branches | 99.96% | ≥ 95% |
| Functions | 100% | ≥ 95% |
| Lines | 99.95% | ≥ 95% |

The residual is two statements and one branch: the `never` guard at the end of
`aggregateFor`. Every member of `ScoreTargetId` returns from a branch above it,
so no input reaches it — it is a compile-time backstop. The comment on the line
records why it is not deleted to turn the number green.

## L4 anchor status

Four anchors, each strictly stronger than the one before:

| # | Anchor | Status |
| --- | --- | --- |
| 1 | Golden Master — exporters byte-stable against committed anchors | **met** (`pnpm golden-master` / 6 OpenRCA + 4 RCAEval files) |
| 2 | Mutation suite — declared facets sensitive, undeclared inert | **met** (`pnpm mutation`, 26 cases) |
| 3 | Official-metric regression — `oraclePerfect ∧ mutationsDegrade ∧ unscoredFacetsInert` | **met** (`pnpm official:check`, 8 targets scored, 1 skipped by contract) |
| 4 | Official-data round trip — ingest → export → official, label-blind | **not met** — needs official data |

Anchor 4 is the one that would detect a misunderstanding shared by our exporter
and our scorer. Anchors 1–3 all begin from a bundle this repository authored, so
agreement between them proves internal consistency, not correctness against the
upstream rule. The test exists and the path is executable; the number has not
been reproduced. `golden-master/fetch-and-verify.sh` prints the operator
instructions and performs no network access, because the corpora carry licences
that forbid vendoring.

## Repository

| Metric | Value |
| --- | --- |
| Commits | 64 |
| Packages | `@rca-bench-factory/core`, `@rca-bench-factory/cli` |
| Source files | 94 |
| Source lines | ~18,400 |
| Test files | 64 |
| Test lines | ~19,200 |
| Tests | 1697 core + 173 CLI |

## Test strategy

- **TDD**: the test that fails without the fix is written first, and the failure
  is recorded in the commit message. A fix whose test would pass before the fix
  is not a fix.
- **No mocks**: `pnpm lint` runs `check-no-mock`, which fails the build on any
  mocking construct. Every test exercises the real code path.
- **Injection matrix**: for each defect, a source injection that reintroduces it
  and must be caught, plus negative controls that must stay green. A matrix that
  is red on everything proves nothing, so both directions are recorded.

## Open

- **Anchor 4** cannot be closed from inside this repository. It needs official
  data mounted by the operator.
- **`glm-embedding-3` benchmark scheduling** is out of scope for this package;
  the LLM-dependent paths here are behind a provider-agnostic abstraction.
