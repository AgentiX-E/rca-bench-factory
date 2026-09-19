# Analysis workspace — LongMemEval-S SOTA sprint

This directory is the evidence trail for the LongMemEval-S SOTA iterations on the
Cortex memory layer. It is **not** a git repository; the reproducible code and the
frozen baseline live in `/workspace/cortex` (see `SOTA-BASELINE.md` there).

## Layout

| Directory | Contents |
| --- | --- |
| `verdicts/` | Acceptance verdicts, root-cause audits, plans, and research notes (`*.md`) |
| `scripts/` | Reproducible analysis scripts (`*.py`, `*.mjs`) — they read downloaded run artifacts |
| `dispatch/` | A/B dispatch + artifact download scripts (`*.sh`) |
| `run-ids/` | GitHub Actions run ids (`*.tsv`) used to re-download artifacts |
| `logs/` | Cached script outputs (`*.txt`) — regenerable from the scripts |

## Re-downloading run artifacts

The downloaded `benchmark-*.json` artifacts (previously ~1 GB under `ab_*/` dirs)
were deleted as regenerable intermediates. To reproduce any analysis:

1. Pick the run ids from `run-ids/<experiment>_run_ids.tsv`.
2. Run the matching `dispatch/download_ab_<experiment>.sh` (edit the run-id source
   if needed) — it downloads each artifact and validates `questionCount == 500`.
3. Run the matching `scripts/ab_<experiment>_analysis.py`.

## Key verdicts (acceptance record, newest first)

| Document | Iteration | Outcome |
| --- | --- | --- |
| `longmemeval-sota-research.md` | SOTA landscape | Positioned 83.55% (above paper Oracle) |
| `mr-dcg-verdict.md` | DCG session scoring | **REJECT** (−3.9pp MR), reverted |
| `wronganswer-rootcause-verdict.md` | Wrong-answer root cause | Reader semantic ceiling, no eval bug |
| `mr-operand-expansion-verdict.md` | Derivation operand expansion | **ACCEPT** (Alex born 4/4) |
| `mr-duration-age-routing-verdict.md` | Duration/age derivation routing | **ACCEPT** (2× 4/4 abstain→correct) |
| `ku-no-qualifier-verdict.md` | KU no-qualifier selection rule | **ACCEPT** (−10.11pp abstain, +4.17pp) |
| `age-operand-retrieval-audit.md` | Age-operand retrieval failure | Root-caused (activity-vs-operand expansion) |
| `mr-aggregation-abstention-audit.md` | MR aggregation abstention | Root-caused (routing bug cluster) |
| `tr-two-event-verdict.md` | TR two-event temporal fix | ACCEPT |
| `embedding-cost-audit.md` | Embedding cost | P0/P1 landed, P2 partial (inert) |

See the per-document bodies for exact permutation-test p-values, per-run
separation, and attribution residuals.
