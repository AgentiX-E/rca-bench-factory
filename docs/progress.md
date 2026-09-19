# Progress tracking

Status of the acceptance pyramid, with the evidence for each line. "Path
executable" and "number reproduced" are kept apart throughout: the first is
something CI can prove today, the second needs official data that is not
vendored.

## Headline

| Layer | Claim | Status | Evidence |
| --- | --- | --- | --- |
| L0 | Deterministic core correctness | **met** | `pnpm typecheck` clean; `pnpm lint` clean; 1724 core + 173 CLI tests pass |
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

`src/ingest/otlp.ts` is at **100% on all four dimensions** after pass 2. Pass 2
raised the aggregate branch figure from 99.89% to 99.96%: the exact-nanosecond
conversion introduced a negative-timestamp path that nothing exercised, and it
was covered with a real pre-epoch case rather than an ignore comment.

Two thresholds sit where they do on purpose. The gate is ≥ 95%, the measured
figure is ≈ 99.95%, and the one uncovered branch is a deliberate compile-time
backstop. An uncovered backstop is not coverage debt — it is the shape of the
guarantee, and deleting it to move the number is the one edit that would remove
the thing it exists to prove.

## Audit passes

| Pass | Scope | Defects | Guards added |
| --- | --- | --- | --- |
| 1 | `src/score/` | 6 | 37 tests across 5 new files |
| 2 | `src/ingest/otlp.ts` | 5 | 27 tests in 1 new file |

Pass 2 was chosen by measurement, not by guesswork: ranking modules by test
references per source line put `otlp.ts` at the top of the under-verified list
(403 lines, one test file) while also being the main real-world ingest path. Both
passes are recorded in full in [`audit.md`](./audit.md), with the observed number
for each finding.

### Injection matrix, pass 2

Five injections, each reintroducing one defect, plus two negative controls:

| Injection | Tests that fail |
| --- | --- |
| `asInt` accepts the quoted form only | 1 |
| nanoseconds scaled by `1e-6` | 4 |
| span status matched by number only | 4 |
| empty severity compared as a token | 1 |
| negative duration judged on truncated ms | 1 |
| NEGATIVE CONTROL — comment edit | 0 (stays green) |
| NEGATIVE CONTROL — comment edit, metric loop | 0 (stays green) |

Every injection was caught by a **test**, not by the compiler. Two were rewritten
during this pass for exactly that reason: as first written, `tsc` rejected them
for an unused symbol, which would have been recorded as "caught" while proving
nothing about the assertions.

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
| Commits | 66 |
| Packages | `@rca-bench-factory/core`, `@rca-bench-factory/cli` |
| Source files | 46 (`src/`, excluding tests and build output) |
| Source lines | ~12,700 |
| Test files | 67 |
| Test lines | ~19,600 |
| Tests | 1724 core + 173 CLI |

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
