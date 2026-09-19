# MR turn-level recall — diagnosis, design, and status

Commit `db92e62` (control: `183a3cc`). Status: **implemented and committed; A/B not
yet dispatched because the sandbox lost GitHub egress.**

---

## 1. What was broken

`retrieveTopKSessions` represents a session by the **mean of its turn vectors**. A
question's evidence is usually one short turn inside a long session, so every
unrelated turn drags the centroid away from the query.

Measured on the 19 missed evidence sessions:

| quantity | value |
|---|---|
| turns per session | 11.1 |
| tokens per session | 1,582 |
| tokens in the answering turn | 90 |

Offline attribution (previous iteration) established the misses are **systematic,
not a top-k boundary**: only 1 of 14 partially-recalled questions flips across 8
runs, and 0 of 18 missed sessions reach the 25th percentile of lexical overlap of
the sessions that *were* recalled. So the fix had to be ranking, not capacity.

## 2. The claim I had to retract

I first reported a **3.22x lift** from turn-level scoring. That number came from a
bag-of-words cosine proxy, which is length-biased: cosine divides by `sqrt(|doc|)`,
so a short turn can out-score a long session on length alone. Before building on it
I ran a length control.

`mr_turn_length_control.py`, per missed session, four scores:

| score | definition | mean |
|---|---|---|
| `s_sess` | `cos(q, whole session)` | 0.0256 |
| `s_turn` | `max_i cos(q, turn_i)` | 0.0806 |
| `s_rand` | `cos(q, random window, same length as the best turn, drawn outside it)` | **0.0073** |
| `s_head` | `cos(q, first-turn-length window)` | 0.0616 |

**The length bias is refuted.** A length-matched random window scores 0.28x of the
whole session — far *below* it, not above. Shortness alone does not inflate the
score. The gain is from **locating the relevant span**: the best turn beats a
length-matched random window by **11.10x**.

Independent corroboration that the magnitude transfers to dense embeddings:
mean-pooling `n` mutually-orthogonal turns shrinks the centroid's projection by
about `1/sqrt(n)`. With `n = 11.1` that is **3.33x**, against the measured raw lift
of **3.15x**.

### A second correction

I had described the mechanism as *"an off-topic head dilutes the centroid."* The
data says otherwise: in 7 of the top 10 cases `s_head == s_turn` exactly, meaning
the answering turn **is** the first turn. The real mechanism is simply that a
~90-token span is lost inside a ~1,582-token session. Only a minority of cases
have a genuinely off-topic head. Same fix, different (and now correct) reason.

## 3. Feasibility of the parameters

`mr_turn_feasibility.py` — where a missed session would rank against the sessions
that *were* retrieved, if everything were scored by best turn:

```
competitive with retrieved (>= median best-turn): 18/19 (95%)
rank among retrieved: median 4.0   within top-3: 9/19   within top-5: 16/19 (84%)
```

Context budget (`turn_recall_ab.py` §3, 121 MR questions):

```
sessions/question : median 12   p90 17   max 33
chars/question    : median 13,001   max 18,168   (budget 20,000)
clipped by budget : 0/121
```

Worst-case headroom is 1,832 chars ≈ 1.9 sessions, median ≈ 7,000 chars ≈ 7
sessions. Three extra sessions fit everywhere but the most extreme question, where
a partial clip costs about one of the three.

## 4. Design

New primitive `retrieveSessionsByTurns` in `retrieval.ts`: index every turn under
an id that carries its owning session, search turns per query, attribute each hit
to its session, score each session by its **best** turn.

Four properties make it low risk:

| property | why it matters | how it is guaranteed |
|---|---|---|
| **Zero marginal embedding cost** | the change must not raise API spend | turn vectors are the same vectors `buildSessionIndex` already computes and mean-pools; both hit the shared cache — asserted by test |
| **Strictly additive** | cannot lose evidence the baseline had | sessions in hand are excluded *before* the cap, and results are appended, never re-sorted — asserted by test |
| **Abstention untouched** | `hits[0].score` *is* the abstention signal | turn cosines run higher than centroid cosines, so merging by score would promote an added session to `hits[0]`; appending keeps it — asserted by test with `sessionAbstainThreshold` between the two score bands |
| **Bounded** | context must not explode | at most `turnRecallSessions` (3) extra sessions |

Search depth is `turnRecallTurnsPerQuery = 50`. A search scores every indexed turn
regardless, so depth is **free**; it matters because the already-retrieved
sessions' turns occupy the top of the ranking, and a shallow search would return
only sessions already in hand. A test locks this in: at depth 5 the channel adds
nothing, at depth 6 it finds the target.

Defaults are on for the MR path only. `answerSessions` is routed to MR exclusively
(`benchmark.test.ts` asserts this), so IE / TR / KU / ABS are clean negative
controls. `turnRecallSessions: 0` disables the channel for the A/B.

## 5. Tests

14 new tests, all written before the implementation, each self-discriminating
(the `turnRecallSessions: 0` arm is the control inside the same test).

`retrieval.test.ts` — `retrieveSessionsByTurns`: recovers a diluted session;
attributes a repeated turn text to every session containing it; emits session ids
identical to centroid retrieval (so the channels dedupe); takes the max across
queries; caps results; skips excluded sessions *before* the cap; reaches new
sessions past already-retrieved ones; returns nothing for empty input; adds **zero**
embedding traffic once the haystack is cached.

`natural-language-memory.test.ts` — `answerSessions > turn-level recall`: recovers
a diluted session end to end; only ever adds, never drops; leaves the top-1 score
and abstention untouched; admits at most `turnRecallSessions` extras; adds no
embedding traffic.

New shared helper `src/__tests__/test-embedding.ts` supplies an explicit
text→vector table. Mean-pool dilution is a trigonometric fact, so the tests compute
cosines exactly instead of approximating them with `HashEmbedding`.

Local regression: **495 tests pass** (was 481). Coverage of `cortex-eval`
**99.74 stmts / 97.66 branch / 100 funcs / 99.74 lines**, all four dimensions above
95%. `pnpm check` (lint + typecheck + test + format) and `pnpm build` are clean.

## 6. A/B design — primary endpoint is deterministic

Whether an evidence session is retrieved is decided entirely by embedding cosine,
and the provider is verified deterministic at temperature 0 before every run. So
evidence recall carries **no sampling variance**: one run per arm measures it
exactly. Accuracy, by contrast, sits on a measured noise floor of roughly ±1.6pp at
run level and is reported as a descriptive estimate only.

- **Primary (deterministic):** questions with complete evidence recall, and the
  session-count recovered. McNemar on discordant pairs.
- **Secondary (noise-floored):** accuracy per capability, abstention, with exact
  permutation tests.
- **Guards:** additive-only (regressions vs. within-arm instability baseline, not
  zero — query expansion is LLM-generated and churns a few questions per run even
  at temperature 0); non-MR null effect; budget clipping.

`analysis/turn_recall_ab.py <root>` is ready and smoke-tested against `ab_deriv`,
where both arms lack the channel: it correctly reports 0 improved, 0 regressed
beyond baseline, and all guards PASS.

The smoke test also caught **three measurement bugs** in my own script (an
unclosed `{2` in the turn-prefix regex, sessions counted as turns, and per-session
truncation mistaken for aggregation truncation) — which is also how I found that my
earlier "0/121 at the budget cap" check was measuring the wrong thing (it inspected
the already-truncated output). The corrected check confirms the same conclusion for
the right reason.

## 7. Blocker — resolved

The sandbox had lost outbound network: DNS resolved `github.com` to the
`198.18.0.0/15` blackhole range, TLS handshakes terminated, and `pypi.org` /
`huggingface.co` were unreachable.

Root cause: `/etc/hosts` is **reset on every workspace restart**, and the GitHub
direct-IP mappings are only persisted in `~/.user_hosts`. The workspace had
restarted, so `/etc/hosts` reverted to the stock file and DNS fell through to the
blackhole. Re-appending the seven `github.com` / `*.githubusercontent.com`
entries from `~/.user_hosts` restored egress immediately (`api.github.com -> 200`).

This is a **recurring** failure mode: after any sandbox restart, re-append those
lines, or DNS silently returns blackhole addresses.

## 8. A/B dispatched

Both arms run the **full 500-question dataset** (`limit=0`). This matters: the
previous iteration's artifacts show `IE 150 / TR 127 / KU 72` in the
single-session diagnostics, i.e. the whole dataset, and `totalQuestions: 100`
appears only in the diagnostics file — that is `DIAGNOSTICS_LIMIT`, not the
sample. Using `limit=100` would have left only ~20 of the 121 MR questions in
the primary endpoint.

| Item | Value |
|---|---|
| control ref | `mr-turn-recall-control` (= `183a3cc`) |
| treatment ref | `master` (= `db92e62`) |
| inputs | `limit=0`, `runs=1`, `temperature=0`, `diagnostics_limit=100` |
| runs | 4 per arm, 8 total, dispatched alternately 3 s apart (same instant) |

Run ids live in `analysis/ab_turn/run_ids.tsv`; fetch with
`analysis/download_ab_turn.sh`, analyse with `python3 analysis/turn_recall_ab.py ab_turn`.

## 9. Measurement bug found and fixed (session counting)

`ctx_sessions` counted blocks separated by a blank line. But a session's own turns
contain blank lines — multi-paragraph assistant replies — so the count was
inflated. Measured on the previous iteration's control arm:

| | mean | max |
|---|---|---|
| naive block count | 18.62 | 157 |
| true session count | 3.41 | 13 |
| over-count | 15.21, on 349/470 records (74%) | |

A block now counts as a session only if its **first line carries a turn prefix**;
continuation blocks open with prose and are skipped. Post-fix the numbers agree
with `DEFAULT_SESSION_TOP_K = 10` (median 10, max 13), which the pre-fix numbers
did not.

The bug never touched the primary endpoint — evidence recall matches evidence
fingerprints against the retrieved string directly — only the context-size
descriptives. But the pre-fix numbers would have made "sessions added" read 5.5x
larger than reality.

## 10. Measurement bug found and fixed (silent run-name collision)

`DATA` is one flat dict keyed by **run directory name**, spanning both arms. Two
runs with the same name collapse into a single dataset, and the analysis then
compares a thing with itself — reporting a perfect null that is indistinguishable
from "the change did nothing". Found by the power check below (both synthetic arms
were called `run_1`). Now a hard `SystemExit` instead of a silent zero.

## 11. Power check — the endpoint is proven sensitive, not just correct

A null-effect smoke test only proves the script reads zero when nothing happened;
a broken endpoint that always reads zero would pass it too. `ab_power_check.py`
therefore injects a *known* effect: it takes a real control run, appends one
genuinely missing evidence session per affected MR question (using the same
fingerprint test the analysis uses — exact matching is wrong, since retrieved
sessions are already truncated and never appear verbatim), and checks the script
recovers exactly that number.

| variant | injected | detected | regressions |
|---|---|---|---|
| no 20k budget (endpoint sensitivity) | 15 | **15** | 0 |
| with `truncateText(.., 20_000)` (as shipped) | 15 | **15** | 0 |

15 improvements → 12 questions reach complete evidence, McNemar p=6.1e-05.

Two things fall out of this:

- **The 15 affected questions match** the 15 incomplete-evidence questions found
  independently in the earlier root-cause analysis — two different methods agree
  on the size of the prize.
- **The 20k aggregation budget costs nothing here.** Control contexts run a median
  of 13,001 chars, so one added session fits everywhere. (Three added sessions do
  not: the worst-case question has ~1,832 chars of headroom, so the real A/B can
  recover at most ~2 of the 3 slots there. The power check injects one session, so
  it deliberately does not stress that case.)

## 12. Routing verified, not assumed

`answerSessions` — the only caller of `retrieveSessionsForQuestion`, and therefore
the only path the turn channel touches — is reached from `benchmark.ts` **only when
`q.capability === 'MR'`**. Guard (b)'s "non-MR is a null by construction" is now
verified against the router rather than taken on faith.
