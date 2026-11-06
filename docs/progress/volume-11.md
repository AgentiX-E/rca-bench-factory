## v3.47 — a word boundary the tokeniser did not know, and a fallback decided by measuring it

v3.46 closed with a ruler rather than a result: *when a census finds zero, prove the instrument can find one
before you believe it.* It had just instrumented every `throw` in the tree and asked, of each, whether any test
had ever run the line. Twenty had not, eleven were driven, and nine were published as `exempt` with a sentence
apiece.

This round opened on the three oldest open items rather than on the instrument, and the first two turned out to
be the same defect wearing different clothes: **a rule that was written down where it could not be read** -- a
tokeniser whose boundary list was missing a character, and a fallback whose parameters were missing from the
paper.

### One — the hyphen, and an inversion that made the best answer score zero

Type Accuracy asks whether a keyword of the fault description appears in the reason. Both sides are cut into
words by one function, and its pattern kept `-` inside a token. Nothing tested it, and the comment above it
explained the split without mentioning the hyphen, so the choice had never been argued.

It matters because the two sides are written differently: a description is often a **slug**, a reason is prose.
Measured on `replica-apply-thread-saturation on the order service`:

| reason | Type Accuracy |
| --- | --- |
| `saturation in the replica apply thread` | **0** |
| `saturation` | **0** |
| `the order service is slow` | **1** |

The description was one token. A reason that spelled the compound out shared nothing with it, while a reason
that named only the component was paid in full, because `order` and `service` had always been separate tokens on
both sides. The term was measuring spelling, and it preferred the worse answer.

The pattern is `[^a-z0-9]+` now, on the argument that already justified stripping the full stop: splitting can
only turn a dead token into a live one, and the parts are words the description's author chose. The test states
the property rather than the implementation -- both spellings score 1, a single part scores 1, a different fault
still scores 0.

### Two — the fallback the protocol describes, decided by measuring five models instead of arguing

AIOps2025's Type Accuracy is two steps, and only the first is implemented:

> keyword detection against the ground-truth fault descriptions, with embedding-similarity fallback for unhit
> cases.

Twelve rounds recorded that as a gap, on a correct argument: the paper names neither a model nor a threshold, and
choosing one to match the paper's reported TA would be fitting the metric to its own result. That argument says
*do not fit the number*. It does not say the question is undecidable.

What decides it is which models this repository is **allowed** to ship, and four existing gates already answer
that: no network at gate time, no vendored weights, no secrets, and the same number on every machine. A hosted
embedding API fails the first and the third; a neural embedding fails the second. What is left is a surface
model -- a deterministic function of two strings with nothing to download.

So the question became measurable: *is a surface model enough?* `scripts/probe-ta-fallback.mjs` scores the whole
family -- character 2-, 3-, 4- and 5-gram cosine, and token Dice -- over three classes. **Verbatim** is the
description against itself, a scale check. **Paraphrase** is a reason naming the same fault with none of its
description's content words; ten of those had to be written. **Distractor** is every *other* pair's paraphrase
against this pair's description -- ninety measurements, none of them chosen, because the negatives are the cross
product rather than a list.

The decision rule was fixed before the numbers were taken: a model ships only if one threshold admits every
paraphrase, refuses every distractor, and leaves a margin of at least 0.05, with the threshold at the midpoint --
the only value that encodes no preference between a false credit and a false refusal.

| model | paraphrase (min–max) | distractor (min–max) | gap |
| --- | --- | --- | --- |
| `char-2gram-cosine` | 0.180 – 0.460 | 0.164 – 0.539 | **−0.359** |
| `char-3gram-cosine` | 0.059 – 0.276 | 0.000 – 0.360 | **−0.301** |
| `char-4gram-cosine` | 0.041 – 0.139 | 0.000 – 0.246 | **−0.205** |
| `char-5gram-cosine` | 0.021 – 0.106 | 0.000 – 0.148 | **−0.127** |
| `token-dice` | 0.111 – 0.267 | 0.000 – 0.286 | **−0.175** |

Every gap is negative, which says more than "the model did badly": one threshold would have to sit above every
distractor and below every paraphrase at once, and for every model the highest distractor is above the lowest
paraphrase. The best of the five misses the bar by **0.177**.

The probe also reports what the least bad threshold costs, because overlap proves no threshold is right and does
not say how wrong the best one is: `token-dice` at 0.267 misclassifies **10 of 100** pairs -- 8 true paraphrases
refused, 2 descriptions of other faults credited. Wrong in both directions, on the model that overlaps least.

One row is its own finding. `char-2gram-cosine` scores the scorer's own mutation string at **0.202**, above the
floor of its own paraphrases at 0.180: shipping that model would make Type Accuracy unfailable, and
`runOfficialRegression` would report it as *mutating `reason` did not lower the score*. The mutation grid is the
guard earlier rounds did not have, and it is why this question could be asked at all -- a fallback is now a
change the existing regression can refuse.

**So the gap closes as a decision rather than as code.** It is not work not yet done; it is outside what a model
with no weights can do, and the boundary has a number on it. `golden-master/ta-fallback.json` publishes the
classes, the measurements and the bar a future candidate must beat, and `ta-fallback.test.ts` recomputes every
number from the pairs, so the file cannot drift from the code that produced it.

### Three — three exemptions were one duplicated guard, written three times

v3.46's nine exemptions included three whose reasons were the same sentence: *the same check as a proved line
above them, in a block that runs later, so these cannot be the one that reports.*

True, and the sentence was doing more work than it looked. A check that another check always fires first is a
check that was written **twice**. Measured:

- `recordedTypeMisses` and `recordedCategoryMisses` each held their own copy of *this run is not in the table* --
  same map, same key, same message;
- `categoryEvidence`, `denialEvidence` and `derivationEvidence` each held their own copy of *this corpus carries
  no `samples` array* -- **on the same file**, since all three resolve to
  `golden-master/fault-extraction/samples.json`, two through inline paths and one through `DATASET`.

The repair was therefore not a test that reaches the copy behind the first one. It was deleting the copies: three
duplicate guards became two, and the inventory went from **41 throw statements to 38**.

Both survivors are reachable now because both **take what they read** -- `runBody(run)` takes the run name,
`readSamplesCorpus(path)` takes the path -- and both live in `scripts/type-miss-readings.mjs`. Where they live is
not taste: a test may not import a probe, because `verify-gates-are-testable.mjs` proves a probe by emptying it
and the import kills the worker before vitest can name a failure. The rule's own message names the repair --
*move the reading into a data module and leave the verdict in the gate* -- and this is its fifth instance.

The split cost one thing, recorded because a split always costs it: the fixture tree in `published-refusals.test.ts`
copies the probe into a scratch checkout. One file became two, the copy took one, and the refusal it drives failed
with an ESM resolution error instead of the message it asserts. The fixture copies both now.

### Four — the census, after the dedupe

| | v3.46 | now |
| --- | --- | --- |
| throw statements | 41 | **38** |
| proved | 32 | **32** |
| exempt | 9 | **6** |
| rows resting on a sentence | 9 | **6** |

Two rows were removed as duplicate statements and two were added in the module that took their place, so the
proved count is unchanged while the inventory is smaller. The six sentences left are not of the kind this round
deleted: three assert something about a table the same function just produced (`probe-m1-ceiling.mjs:118`,
`probe-type-misses.mjs:269` and `:1268`), two guard the **pack contract** rather than an input
(`build-example-bundle.mjs:57`, `:60` -- `normalizePackEntries` refuses a duplicate path first, and example files
carry an `examples/order-prod/` prefix, so the two rows cannot collide), and one was reachable only through a
**defect** that has since become a diagnosis (`measure-doc-counts.mjs:267`, a missing `pnpm-workspace.yaml`). None
of them is a copy of a guard standing in front of another.

### Readings

> Ledger for `v3.47`.

| item | value |
| --- | --- |
| `core` test suite | **232 files, 5666 tests passed** (as of v3.47) |
| `cli` test suite | **4 files, 187 tests passed** (as of v3.47) |
| repo test suite | **236 files, 5853 tests passed** (as of v3.47) |
| throw partition | **38 statements**: 1 `fatal`, 33 `unguarded`, 1 `guarded`, 3 `rethrow`; **32 proved, 6 exempt** |
| the dedupe | 41 statements to 38: two unknown-run copies became `runBody`, three corpus-guard copies became `readSamplesCorpus` |
| failure sites | **114** across 56 of 78 scripts, unchanged; `excluded` `{16 zero}` unchanged |
| the fallback probe | five surface models, ten pairs, **90 derived distractors**; every gap negative, best **−0.127**; least-bad threshold wrong on 10 of 100 pairs |
| new tests | **13**: 10 in `ta-fallback.test.ts` and 3 in `probe-type-misses-refusals.test.ts` |
| new modules | `scripts/probe-ta-fallback.mjs` (a `tool`: writes the corpus, has no verdict) and `scripts/type-miss-readings.mjs` (a `data` module: the readings, so a test may reach them) |
| proof plan | `verify-site-proofs`: **139 claim(s)** across **52** files, including all 32 throw claims -- PASSED |
| sensitivity | `verify-sites-are-sensitive`: **139 claim(s)**, 191 runs, **0 survivors**, 4.2 min; 107 exits hollowed, 32 throws removed, and no claim left unmutated |
| `docs:check` | green: 389 findings / 1–392, 10 volumes / 195 rounds, 1624 citations naming 389 numbers, 568 open entries with 529 carrying a reason, and the counts re-derived from three measured suites |

### Six — the job that had never crossed the line

The second run's refresh failed the budget gate on a job this round had not touched.
`backend` measured **296 s** across seven steps and declared no `timeout-minutes` on any of
them, which `R4` refuses above three minutes -- and it had measured **37 s** in the run
before it. `apt-get install prometheus` is the variable half, and the comment in `ci.yml`
had said so for ten rounds without the rule ever firing, because the rule is silent under
the floor and the job had never been over it.

The interesting part is what happens once it is over: the floor applies to **every** step of
a job that bounds one, seven steps at three minutes are **21**, and the job's ceiling was
**20**. A job slightly too slow to leave unbounded and slightly too small to bound the
ordinary way. The ceiling moved to **34** -- five setup steps at 3, the install at **16**
(1.5x the 648 s a cold runner measured for that step, 3.5x this run's 273 s), the reader at
3 -- and every step now has a bound of its own. 16 rather than 10 is the whole argument of
`R4`: a bound that fits the fast day fires on the slow day.

That change then hit `R6`, which compared the recording's ceiling with `ci.yml`'s and
refused any difference. The refusal was right in one direction and wrong in the other. A
*smaller* ceiling invalidates the reading, because a bound that fitted inside the wider one
may expire after the job has already died at the tighter one. A *larger* ceiling moves no
step bound and only gives `R5`'s deadline more room, so a reading taken inside 20 minutes
still describes every command that will run inside 34. Refusing the wider direction also
closed the same circle `R9` exists to open -- a ceiling could only be widened by a run, and a
run happens after the push this gate has to pass -- so `narrowed()` is now four lines and the
summary names the widening: `backend 20 -> 34`.

### Seven — what the two runs said about the split

The first run's shards measured **248** and **387** seconds; the second's, **189** and
**440**. The sum barely moved (**635 -> 629**) and the ratio did not: **1.56 -> 2.33**. The
claim counts differ by ten (87 against 96), so the imbalance is not a count, it is a
handful of expensive files landing in one shard by position. That is what position-based
sharding buys and what it costs: a plan any machine can recompute, at the price of a wall
clock that depends on which files the sort put together.

The honest next step is therefore not a tighter bound but a measured partition -- time each
claimant file once, then cut where the seconds are -- and it has to come with its own
reading, because the bound can only be tightened after a run of the rearranged command.

### Eight — the bound that was two seconds short

Refreshing the recording to the third run failed the gate on `Lint`, which this round had not
touched: **361 s** against a **12-minute** bound. Twice 361 is 722; the bound was 720. It had
been sized in v3.53 from **347 s**, where twice is 694 -- inside by 26 seconds. Nothing about
the step changed except the machine, which is the one thing a measurement of a machine always
has.

`R4`'s multiple is a floor on the margin, and a bound sitting exactly on a floor has no room
for the measurement's own spread: 347 to 361 is 4%, and 4% is enough. The repair is **14**
minutes, 2.33x, which fits the job without moving the ceiling (840 + 27 s of setup = 867 of
900). The round therefore produced the same demonstration three times in three runs -- the
shards' 13-minute plan refused at 440 s, `backend` never bounded because 37 s never crossed
the line, and this one refused by 361 s -- and all three are the same sentence: a bound sized
from one reading is sized from the wrong statistic.

### Left open, in the order the goal is reached

| priority | item | state | next step |
| --- | --- | --- | --- |
| **P1** | ~~TA's embedding fallback~~ | **closed as a measured decision**: five surface models overlap the classes, so no threshold exists; a model this repository may ship cannot stand in for the step | the bar for any future candidate is published in `golden-master/ta-fallback.json` |
| **P2** | a key whose description carries no keyword scores 0 | the protocol is silent; this repository takes 0 | record it as a gap; do not invent a redistribution |
| **P3** | the sensitivity gate's cost grows linearly with claims | 139 claims, 191 runs, 4.2 min locally (9.4 on the runner at the same claim count) | the 15-minute budget holds about 300 runs at this rate; shard by file before then |
| **P4** | six throw rows rest on a sentence rather than a measurement | three assert something about a table the same function produced, two guard the pack contract rather than an input, one was reachable only through a defect | the duplicated three were deleted this round; what is left needs the function to disagree with itself, which is a property rather than a test |
| **P5** | the witness is invisible to a child that drops the environment | a script loaded without `NODE_OPTIONS` is not rewritten, exactly as its exits are not recorded | unchanged; the same one-level blind spot as P7 |
| **P7** | the blind spot still sees only one level | a wrapper that does not inherit hides its own child | unchanged this round |
| **P8** | the compiler is a runtime dependency of four readers | `derive-gate-sites.mjs`, `gate-proofs.mjs`, the witness and the Vite plugin all use `typescript` | "a gate with no dependencies" still needs a third correct reading |
| **P9** | the batteries job sits 3 to 11 minutes from its ceiling | eight readings against a 30-minute budget span **19.2 to 27.3** | take a fresh baseline before adding a step |

**The lesson, for the round after this one.** Both defects this round were found by asking what the *other*
spelling is. The tokeniser knew a full stop as a boundary and did not know a hyphen; the exemptions knew a check
as a thing that runs and did not know it as a thing that was written twice. Neither was visible from the
behaviour anyone was measuring -- Type Accuracy looked correct on every fixture, and every exemption had a true
sentence beside it. So the next ruler is: **when a rule has a list in it, count the list against the language
rather than against the fixtures** -- a boundary set, a closed class, a table of kinds all fail the same way, by
being one member short and by looking right on everything that was tried.

## v3.48 — a budget aimed at the job that failed, and arithmetic that asked for a second job

v3.47 closed with a ruler instead of a result: *when a rule has a list in it, count the list
against the language rather than against the fixtures.* It had just found a tokeniser that
kept the hyphen and an exemption clause that described a duplicated guard.

The budget gate was written four rounds earlier for the job that had timed out, and read as
finished ever since -- it was green, it printed a reading, and its own note explained the
arithmetic of a bound. What it had never been asked is whether the question it poses applies
to a set. It does, the set is the workflow, and asking it of the set refused the shipped tree
three times over.

### One — the rules were about the job that failed (finding 393)

`ci-budget.mjs` reads `baseline.job`, a single string. `R3` says *a step that inherits the
job's budget declares no bound of its own*, which can only be evaluated for a job the
recording describes. So the gate could answer its question about `batteries` and about
nothing else. Measured on the tree:

| job | measured | steps | steps declaring a bound |
| --- | --- | --- | --- |
| `verify` | 532 s | 11 | **0** |
| `sensitivity` | 564 s | 7 | **0** |
| `batteries` | 1575 s | 22 | 20 |
| `backend` | 39 s | 7 | 0 |
| `artefacts` | 57 s | 13 | 0 |
| `cold-tree` | 19 s | 8 | 0 |

`verify` spends nine of its fifteen minutes -- six of them in `lint` -- and a hang there was
reported as *the job timed out*, which is the sentence the step bounds were introduced to
replace. The budget was not too small. It was aimed at one bucket.

The repair is not another number. `readWorkflow` now returns the jobs it read, because a
walk over steps cannot answer *does this job bound anything*: a job whose steps were all
renamed still exists, and a job with no `timeout-minutes` has no budget to inherit. The
recording holds `jobs`, keyed by the workflow's id and carrying the label, because a run
reports its jobs under the label and a recording keyed by id has to know which name to look
for. `R3` asks every job over the floor with more than one step. Two exceptions are stated
rather than assumed -- one step (the job's budget already names it) and under the floor
(there is nothing to spend) -- and `budgetSummary` prints them, because an exception nobody
wrote down is indistinguishable from an oversight.

### Two — the recording was three days old, and the bounds could not survive it (finding 394)

`golden-master/ci-baseline.json` was run `41180476384`, dated 2026-10-31, and sized every
bound at exactly twice its measurement. Re-recording the green run `41637098008` refused the
shipped numbers five times:

```
`Type-miss probe battery` is bounded at 12 min and measured 479 s
`Every gate can be shown to fail` is bounded at 5 min and measured 221 s
`Gate-test battery` is bounded at 5 min and measured 185 s
`Backend-support battery` is bounded at 13 min and measured 416 s
`Backend-support battery` is bounded at 13 min and the steps before it measured 18 min,
  so its bound expires at 31 min -- past the job's 30
```

The gate was right and the recording was old: the same steps measured 1230 s three days ago
and 1575 s now. Nothing in the tree can tell that a recording has aged -- a gate in CI
cannot fetch a run -- and a rule about recency would fail the first tree with no run at all.
What the gate has is the arithmetic, and the arithmetic is what makes the ageing visible the
moment somebody measures again: a bound under twice the measurement is refused, and a bound
that outlives the job is refused. Both fired.

### Three — which the arithmetic answered with a second job (finding 394, continued)

The second refusal cannot be repaired by a number. The job has 30 minutes; its two longest
steps measure 479 s and 416 s, so their bounds alone are 16 + 14 = 30 minutes before any of
the other twelve steps is counted. A bigger bucket is the response the module's own note
calls dishonest -- *a bound that cannot expire before the job does is a number with no
effect* -- so the reading is that one job is doing too much for one budget.

| | `batteries` | `batteries-heavy` |
| --- | --- | --- |
| holds | the 14 steps that measure ≤ 221 s, and the report | the type-miss and backend-support batteries |
| measured | 674 s (11.2 min) | 914 s (15.2 min) |
| bounds | largest 8 min | 16 min and 14 min |
| budget | **25** (was 30) | 25 |
| wall clock | the longer of the two, not their sum | |

`sensitivity` is the same arithmetic one job over: one step measures 536 s, so its bound is
18 minutes, and a budget of 15 cannot hold 18 plus the 23 s that ran before it. The job
declares **20** -- what the bound needs rather than what the measurement needs, which is
9.4 minutes of work in a 20-minute bucket and a bound that names the step two minutes before
the job would.

The split is the one moment the arithmetic cannot wait for a measurement: the two jobs exist
only after the change, and the recording has to exist before CI will accept the change. So
the recorder can record a job that has never run **from the job that ran its steps** --
`--borrow <new>=<ran>` -- and the file says which job the seconds came from, with a note that
the run behind them predates the job. The next green run replaces both, and that replacement
is the first thing the round after this one does.

### Four — the equality asked the new job for shells (finding 395)

`cold-tree-job.test.ts` requires every job that runs the suite to install the shells its
fixtures spawn, and it is an equality over jobs rather than a list of the jobs that existed
when it was written: it follows the `node`/`python3` scripts a step names one level deep and
requires any job whose body or scripts mention `vitest` to install `zsh`. The new job runs
`backend-support.py`, which invokes `pnpm exec vitest run --root packages/core`. So the
equality asked, and the job had no such step. Nothing failed -- the battery runs targeted
tests that spawn no shell -- and the guard said so anyway, which is the whole point of
writing it over a set.

### Five -- the successor run moved two measurements past the line

The split landed on `00b76ac83` (run `41658872002`) and the recording was refreshed from it. The
next run, `41670923224` on the docs commit, measured the same steps again, and two of them had
moved:

```
`Every gate can be shown to fail` is bounded at 8 min and measured 251 s
`Type-miss probe battery` is bounded at 16 min and measured 487 s
```

Both are the same 2x rule, and both had drifted rather than jumped: 221 s to 251 s, 479 s to
487 s. The second one is the interesting one, because 16 minutes is 960 s and twice 487 is 974 --
a bound that is now *under* the multiple by fourteen seconds, which is a bound that would kill a
legitimate run on a slow runner and report it as a hang. So the bounds moved to 9 and 17 minutes,
and the job's arithmetic still fits: 17 + the 8.4 minutes that ran before it is 25.4 against a
budget of 25, so the two are indistinguishable at this precision and the recording is the run
that produced them.

That is the module's own instruction carried one step further than the round expected: *a bound
that has to be raised after it fires was wrong, and the honest response is to measure again rather
than to add slack.* Here it was raised before it fired, because the measurement that justified it
had moved -- which is only possible because the recording is a run and the run is recent.

### Readings

> Ledger for `v3.48`.

| item | value |
| --- | --- |
| `core` test suite | **232 files, 5675 tests passed** (as of v3.48) |
| `cli` test suite | **4 files, 187 tests passed** (as of v3.48) |
| repo test suite | **236 files, 5862 tests passed** (as of v3.48) |
| jobs recorded | **7** of 7, **74** steps, **46** of them bounded; 45 min measured, and the recording is the newest green run rather than the one a job borrowed from |
| the two budget jobs | `batteries` 674 s against 25 min; `batteries-heavy` 914 s against 25; the run waits for the longer |
| the bounds that refused | five, on a recording three days newer: 12/479, 5/221, 5/185, 13/416, and one expiring at 31 min in a 30-minute job |
| throw partition | **41 statements**: 4 `fatal`, 33 `unguarded`, 1 `guarded`, 3 `rethrow`; **35 proved, 6 exempt** |
| the recorder's refusals | four, all `fatal`: a workflow that does not parse, a `--borrow` naming no job, a run holding no job of that name, a step the borrowed job never ran -- each reached by a test |
| failure sites | **114** across 56 of 78 scripts, unchanged; `excluded` `{16 zero}` unchanged |
| proof plan | `verify-site-proofs`: **142 claim(s)** across 52 files -- PASSED |
| sensitivity | `verify-sites-are-sensitive`: **142 claim(s)**, 194 runs, **0 survivors**, 4.0 min; 107 exits hollowed, 35 throws removed |
| new tests | **9**: 8 in `ci-budget.test.ts` (rewritten for the job), 1 in `gate-steps.test.ts` |
| `docs:check` | green: 392 findings / 1–395, 10 volumes / 196 rounds, 1631 citations naming 392 numbers, 568 open entries with 529 carrying a reason, and the counts re-derived from three measured suites |
| CI | the split landed on `00b76ac83`, run `41658872002`: **7 of 7 jobs success** -- batteries-heavy **12.9**, build 8.9, batteries **8.4**, sensitivity 7.9, golden master 1.3, backend 1.0, cold-tree 0.5 min; **13.3 min of wall clock** where the one job took 26.3. The recording refresh on `8afd38940`, run `41664998423`: **7 of 7**, batteries-heavy 13.5, wall 13.6. The bounds moved on `61dff700c`, run `41670923224`: **7 of 7**, batteries-heavy 15.6, batteries 12.8, sensitivity 8.2, build 7.2, golden master 1.0, backend 0.7, cold-tree 0.6, **wall 15.8 min** |

### Left open, in the order the goal is reached

| priority | item | state | next step |
| --- | --- | --- | --- |
| **P0** | ~~the recording carried a borrowed job~~ | **closed**: the recording is the newest green run (`41670923224`), `derived` and `note` are gone, and the two bounds that run moved are at 9 and 17 minutes | -- |
| **P2** | a key whose description carries no keyword scores 0 | the protocol is silent; this repository takes 0 | record it as a gap; do not invent a redistribution |
| **P3** | the sensitivity gate's cost grows linearly with claims | 142 claims, 194 runs, 4.0 min locally and 9.4 on the runner at 139 claims | the 15-minute budget holds about 300 runs at this rate; shard by file before then |
| **P4** | six throw rows rest on a sentence rather than a measurement | three assert something about a table the same function produced, two guard the pack contract, one was reachable only through a defect | the duplicated three were deleted in v3.47; what is left needs the function to disagree with itself, which is a property rather than a test |
| **P5/P7** | the witness sees one level | a script loaded without `NODE_OPTIONS` is not rewritten, and a wrapper that does not inherit hides its child | unchanged; needs a second observation channel |
| **P8** | the compiler is a runtime dependency of four readers | `derive-gate-sites.mjs`, `gate-proofs.mjs`, the witness and the Vite plugin all use `typescript` | "a gate with no dependencies" still needs a third correct reading |
| **P9** | the batteries job sat 4 minutes from its ceiling | 26.2 of 30 measured; now 11.2 and 15.2 against 25 each | a fresh baseline before adding another battery, which is a step the arithmetic now makes cheap |

**The lesson, for the round after this one.** All three defects were the same shape: a rule
that answered a question about **the member that failed** rather than about the set it
belongs to. The budget was written after one job timed out and ruled on that job; the
recording described the job the budget described; and the shell rule, once written as an
equality, immediately found a job that a list would have missed. So the next ruler is: **when
a rule is written because something failed, ask which set that thing is a member of, and
write the rule over the set** -- because a rule shaped by one member is a rule that will be
satisfied by the next member being different, and the difference is invisible from inside.

## v3.49 — the recording's every number was checked, and none of them said which tree

v3.48 closed with a ruler rather than a result: *when a rule is written because something
failed, ask which set that thing is a member of, and write the rule over the set.* It had
just split the batteries in two because the arithmetic said one job was doing too much for
one budget.

This round asks the same question of the whole budget gate, one level up. Every rule in
`ci-budget.mjs` is a relation between the recording, the workflow and the arithmetic -- and
together they can all pass on a recording of a tree that is no longer shipping. The gap was
not in the arithmetic. It was that **the recording does not know when it has aged**, and
nothing else in the tree was asked.

### One — the recording was one run behind, and all five rules agreed (finding 396)

The shipped recording was run `41670923224` at `61dff700c`, 7 jobs and 74 steps, 45 minutes
measured. The shipped tree was `91e320884`, whose run is `41677264353`:

| | recording | the tree that shipped |
| --- | --- | --- |
| commit | `61dff700c` | `91e320884` |
| run | `41670923224` | `41677264353` |
| jobs / steps | 7 / 74 | 7 / 74 |
| measured | 45 min | 46 min |

Every second in the file is a real measurement, taken by the only script that may write it.
The one thing that had moved is *which tree*. That is the shape of the defect: a recording
cannot age in any way its own contents show, so the rules that read its contents cannot see
it -- and the tree was full of gates that would have refused a wrong number and did not
notice an old one.

### Two — the second opinion was already written, as prose

The ledger's `| CI |` row reports the jobs' wall clock, and it is written after the run
comes back green -- so the newest run in such a row is a run this repository has already
looked at. Nothing read it. `check-citations.mjs` verifies finding numbers; no gate looked
at a run id at all. That row was the only sentence in the tree that knew the current run
and the only one that could disagree with the recording, and it was prose.

So `R7` is a comparison rather than a number: the recording may not be older than the
newest run the ledger reports. And its second half is what makes the first mean anything --
**the ledger's newest row must name its run**, because a row that reports a wall clock
without naming the run leaves the recording unopposed, and the gate's silence would read as
agreement with a round it never compared itself to. A rule that only compared ids would
pass on a log that had stopped naming them, which is the same defect one layer out.

### Three — the reader, and the three rows that name no run

`ledger-runs.mjs` is the reading: which rows are closing readings, which numbers in them
are run ids, and which rows name none. A run id is **ten to twelve digits and nothing
else**; the rows cite commits a few characters away in the same backticks, and this
repository writes those as nine characters, so the two cannot be confused by length. The
bound is checked on both sides so a thirteen-digit token is not read as its first twelve --
a reader that returned a slightly wrong id would refuse the tree for a run that never ran.

It found three `| CI |` rows in the shipped log with no run id:

```
volume-03.md:1174   the new step reads the reports in 0.056 s
volume-08.md:835    five jobs green on the fourth push
volume-10.md:882    a sixth job, `sensitivity`, 15-minute budget
```

They report what a job looked like rather than what a run measured, and they predate the
convention. They are **counted, not corrected**: naming a run for them now means deriving
the id from a commit in git history and guessing which of that push's two runs is meant, and
an invented provenance is worse than a stated gap. The reader returns them as `unnamed`, the
summary prints how many, and the rule asks only that the **newest** row name one.

### Four — the gate's first red was the tree it was written in

The rule was written after the defect, and the defect was still there. With this round's
ledger row citing `41677264353`, the gate refused the shipped recording:

```
check-ci-budget: the recording is from run 41670923224 and `volume-10.md:2173` reports
run 41677264353: a recording older than the round that reports it describes a tree nobody
shipped, so its seconds size the bounds of a workflow that has since run -- take a new
reading with `node scripts/measure-ci-baseline.mjs 41677264353`
check-ci-budget: FAILED — 1 problem(s)
```

The repair is one command, and the summary then reads `the ledger's newest run is
41677264353 (the recording)`. A gate whose first red is the tree it was written in has been
observed rather than described -- and no bound moved, because the new measurement was within
the bounds the old one had produced: the tightest is `batteries-heavy / Backend-support
battery` at 2.0x, and the longest bound still expires inside its job's budget.

### Five — and the successor run pushed two bounds under the multiple

Citing the round's own run is one thing; the run after it is another. `41749989956` measured the
same steps as `41677264353` and two of them had grown:

```
`Type-miss probe battery` is bounded at 17 min and measured 530 s        (was 494 s)
`Backend-support battery` is bounded at 14 min and measured 427 s       (was 418 s)
```

17 minutes is 1020 s and twice 530 is 1060; 14 minutes is 840 s and twice 427 is 854. Both
bounds were under the multiple, by 40 s and 14 s -- bounds that kill a legitimate run on a slow
runner and report it as a hang. So they move to **18** and **15** minutes, and the job's
arithmetic still holds: the type-miss bound expires at 18.4 min and the backend-support bound at
24.2 of the job's 25.

That is the drift v3.48 predicted, now with a number on it: the type-miss battery went 479 -> 494
-> 530 s across three consecutive runs, about +5% a run, and the two bounds that size it have
followed 16 -> 17 -> 18. **The prediction is arithmetic from here**: at +5% a round the second
bound expires past the job's budget in two or three rounds, and the batteries-heavy job splits
again for the same reason the batteries did -- which is why P9 says *re-take the baseline before
adding a battery*, and why `R7` now makes forgetting to impossible.

The convention that keeps this stable is worth stating, because it looks like an omission: **a
refresh commit's run is not a closing reading.** The recording is taken *from* the run a round
cites, so the commit carrying the new recording cannot cite the run that verifies it -- that run
would be newer than the recording, and `R7` would refuse it, and its repair too, for ever. This
round cites `41749989956`; the runs of `4e78ef8`, `75f2de650`, `f62b962` and `012b81af9` -- every
commit after it -- verify it and stay uncited, and the summary reads `the recording is newer`
because that is what a refresh looks like from inside.

### Readings

> Ledger for `v3.49`.

| item | value |
| --- | --- |
| `core` test suite | **234 files, 5740 tests passed** |
| `cli` test suite | **4 files, 187 tests passed** |
| repo test suite | **238 files, 5927 tests passed** |
| new tests | **20**: 13 in `ledger-runs.test.ts` (the reader), 7 in `ci-budget.test.ts` (`R7` and its gate paths) |
| the recording | **run 41749989956** at `75f2de650`, 7 jobs / 74 steps / **46 bounded**, 43 min measured; before this round it was `41670923224` at `61dff700c`, one run and one commit behind the tree |
| the comparison | the ledger's newest row names run `41749989956`, which is the recording -- `(the recording)`, not one run behind; **3 older rows name no run** and are counted |
| the gate's first red | `the recording is from run 41670923224 and volume-10.md:2173 reports run 41677264353` -- on the tree the rule was written in |
| the bounds that moved | **two**: type-miss 17 -> **18** (530 s) and backend-support 14 -> **15** (427 s), both under the multiple on the successor run |
| throw partition | **41 statements**: 4 `fatal`, 33 `unguarded`, 1 `guarded`, 3 `rethrow`; 35 proved, 6 exempt -- unchanged |
| failure sites | **114** across 56 of **79** scripts; `excluded` `{16 zero}` unchanged |
| proof plan | `verify-site-proofs`: **142 claim(s)** across 52 file(s) -- PASSED, unchanged |
| coverage | core **99.96 / 99.75 / 100 / 99.96**, cli **100 / 100 / 100 / 100** |
| `docs:check` | green: **393 findings / 1–396**, 10 volumes / 197 rounds, **1633 citations** of 393 numbers, 568 open entries with 529 carrying a reason |
| CI | run `41749989956` on `75f2de650`: **7 of 7 jobs success** -- batteries-heavy **16.4**, batteries **11.6**, build 6.9, sensitivity 6.8, backend 1.0, golden master 0.7, cold-tree 0.3 min; **16.4 min of wall clock**. The run before it, `41677264353` on `91e320884`, was 7 of 7 in 15.9 |

### Left open, in the order the goal is reached

| priority | item | state | next step |
| --- | --- | --- | --- |
| **P2** | a key whose description carries no keyword scores 0 | the protocol is silent; this repository takes 0 | record it as a gap; do not invent a redistribution |
| **P3** | the sensitivity gate's cost grows linearly with claims | 142 claims, 194 runs, 4.0 min locally and **9.0** on the runner; its bound moved 18 -> 19 this round | the 20-minute job budget holds it, and the bound expires at 19.3 of 20; shard by file before the claims outgrow the job rather than the step |
| **P4** | six throw rows rest on a sentence rather than a measurement | three assert something about a table the same function produced, two guard the pack contract, one was reachable only through a defect | a test of the *statement* rather than of the line: for `pack`, the shipped example tree must yield unique paths and a manifest; for the partitions, the classifier's return set must stay closed. Both are falsifiable by the code change the guard is for, which is why they are not inputs |
| **P5/P7** | the witness sees one level | a script loaded without `NODE_OPTIONS` is not rewritten, and a wrapper that does not inherit hides its child | unchanged; needs a second observation channel |
| **P8** | the compiler is a runtime dependency of four readers | `derive-gate-sites.mjs`, `gate-proofs.mjs`, the witness and the Vite plugin | "a gate with no dependencies" still needs a third correct reading |
| **P9** | the batteries jobs sit inside their budgets | 11.9 and 15.8 measured against 25 each; the longest bound expires at 22.8 | a fresh baseline before adding another battery -- and `R7` now makes forgetting it impossible |
| **P10** | ~~the measurement drifts and nothing notices~~ | **closed**: `R7` refuses a recording older than the newest run the ledger reports, and the ledger's newest row must name its run | -- |

**The lesson, for the round after this one.** The recording had five rules and all five read
its **contents**; the one thing wrong with it was not in its contents. So the ruler is:
**when every check on an artefact passes, ask what the artefact is an index of, and check
that the index still points at the thing** -- a commit, a run, a version, a corpus. The
numbers were all true; they were true of a tree that had already run again.

## v3.50 — six exemptions stood on sentences, and four of the sentences were already paid for

Everything in this round starts from one line of the previous round's table: **P4 — six throw
rows rest on a sentence rather than a measurement.** The rule that read them (rule 4) asked
whether the sentence was longer than forty characters and distinct from its neighbours. It did
not ask whether anything measured what the sentence claimed, and for two of the six nothing
did.

### One — the rule was about prose, and prose cannot fail (finding 397)

An exemption says *no test can reach this line, because X*. That is a claim about the code, and
claims about code can be checked. The six shipped rows each carried a paragraph, and the
paragraphs were good: they explained the mechanism, named the guard, and said why an input could
not produce the state. What none of them carried was the name of a test.

The measurement that made the gap legible was reading the six against the suite. Four of them
had a test that held their claim and did not say so:

```
probe-m1-ceiling.mjs:118     "includes over the same objects is exact"   held since v3.45, unnamed
probe-type-misses.mjs:269    "publishes four named checks"              held across several assertions
measure-doc-counts.mjs:267   "every state of the tree is diagnosed"     held for one of three states
build-example-bundle.mjs:60  "the pack always appends MANIFEST.json"    held on a fixture, not the shipped pack
```

and two had nothing at all:

```
build-example-bundle.mjs:57  "the pack cannot contain a repeated path"  nothing asserted uniqueness
probe-type-misses.mjs:1268   "classify returns one of three kinds"      the counts were checked against counts
```

That distribution is the finding. A prose exemption does not distinguish *held and unnamed* from
*not held*, and a reader cannot tell the two apart either -- which is why the four were invisible
for four rounds and would have stayed invisible.

### Two — rule 9 asks for the claim and the test that holds it

`gate-sites.json` grows two columns on the throw partition, and only there:

| column | what it is |
| --- | --- |
| `statement` | the claim the exemption rests on, in one sentence a test could falsify |
| `heldBy` | `{file, test}` -- the test that measures that claim, by exact title |

Rule 9 refuses an exempt row without either, a file that does not exist, a file that is not a
test, a title the file does not carry, two exemptions held by one test, two exemptions stating
one claim, and a **proved** row that also carries an exemption's claim. The columns are refused
on exit sites rather than ignored, so half-applying the convention is visible instead of inert.

The rule's limit is stated where it is implemented: it checks that the title exists, not that the
assertion inside that test is the claim. What it does establish is that deleting the test,
renaming it, or pointing two claims at one test **reds the gate**. Measured twice on this tree:
renaming the m1 title in the JSON turned rule 9 red with the row and the title in the message,
and restoring it turned it green -- the rule is not a rule that cannot fail.

### Three — writing the pack's statement found a reader that walks one directory (finding 398)

The first statement -- *the shipped example tree produces a pack in which no archive path appears
twice* -- could not be written against a fixture. `treeWithExamples()` copies six files into a
scratch tree and the existing tests read the pack it produces; the claim is about the tree that
**ships**, so the test builds from `examples/order-prod` and reads the committed index beside it.

Building from the real tree is what exposed `readExampleFiles()`:

```js
for (const name of readdirSync(EXAMPLE_DIR).sort()) {
  const full = resolve(EXAMPLE_DIR, name);
  if (!statSync(full).isFile()) continue;      // a directory is skipped, silently
```

The tree is flat, so the archive was correct. The defect is that nothing could say it was: the
index is written by the same reader as the archive, `--check` compares the archive with itself,
and the download would have been one directory short the first time somebody put an example in a
folder. Reproduced in a fixture -- `examples/order-prod/nested/extra.json`, nine rows before and
ten after -- and fixed in the reader rather than pinned by an assertion:
`readdirSync(dir, { recursive: true })`, with the relative path preserved so a nested file lands
on its own pack row. The committed artefacts did not move a byte: the tree is still flat.

This is the round's sharpest lesson, and it is not the one the round set out to learn. **A
sentence about "the example tree" had been satisfied by a reader about "the example directory",
and the difference is invisible while the tree happens to be one level deep.**

### Four — the counts were checked against counts (finding 399)

`probe-type-misses.mjs:1268` refuses when the three classification counts do not add up to the
rows. The existing test compared the probe's three counts with three computed in the test by
filtering on `kind`, and they agreed on both recorded runs. That is a check between two readings
of one classification: a fourth kind would have incremented a key that does not exist, both sides
would have agreed at a lower total, and the only reader that would have noticed is the guard the
exemption says no test can reach.

The closure is now measured against the shipped `classify` -- not this file's copy -- over a
table built to be adversarial: an empty pair, a pair that normalizes to nothing, one that differs
only by case, one that shares exactly one token, and every recorded miss of both runs. The
remaining three statements are the same shape one layer in: `checkRca100Structure` must publish
each of four checks exactly once; the measurement's diagnoses must all be a
`MeasurementUnavailable` (the parent, not merely a `name`); and the m1 partition was already
held, which is why its row only needed naming.

### Five — the round's own readings

`gate-sites.json`: 41 throws, **6 exempt and 6 held**, 114 exit sites across 56 of 79 scripts,
`excluded {16 zero}`. Rule 9's block is 11 tests: the negative control, the two required columns,
and one rejection per road (no statement, no held test, a missing file, a wrong title, a
non-test file, a shared test, a repeated statement, a proved row carrying a claim, an exit site
carrying the columns).

The four statement tests are the round's product, and each is falsifiable against the defect it
describes:

| claim | test | the defect that reds it |
| --- | --- | --- |
| the shipped pack lists each path once | `build-example-bundle.test.ts` | a duplicate row in `paths` |
| the pack carries the whole tree and the manifest | same file | a file the reader drops (measured: nested dir) |
| every diagnosis is a `MeasurementUnavailable` | `measure-doc-counts-readings.test.ts` | a refusal that stops inheriting |
| four vocabulary checks are published | `score.test.ts` | a check renamed or dropped |
| `classify`'s return set is closed | `type-miss-probe.test.ts` | a fourth kind the counts do not hold |
| the m1 partition covers its dataset | `m1-ceiling-probe.test.ts` | two halves that overlap or leave a row out |

### Six — the run, and the recording taken from it

`41785707854` on `de4242299`: **7 of 7 jobs success**, and the fastest wall clock this
repository has recorded -- **12.6 minutes**, against 15.3 the round before and 16.4 two rounds
back.

| job | minutes |
| --- | --- |
| injection batteries, the two that rewrite a probe a hundred times | **12.6** |
| injection batteries, one step each | 9.6 |
| build / typecheck / lint / coverage / mutation | 8.9 |
| every proved exit can disappear without a word | 8.9 |
| golden master / official metric / examples / documents | 0.9 |
| a backend this repository did not write | 0.7 |
| cold tree / no build / every precondition declared | 0.3 |

The step that forced the bound to 19 minutes measured **510 s** here, and the two batteries
that were 7.9 and 7.0 minutes four hours earlier measured **5.8** and **6.3**. Nothing in the
tree explains that spread; the runner does. It is the reason the bounds are twice the
measurement and not a tenth above it: a bound tight to the last reading would have moved twice
this round and been wrong both times, and a 19-minute bound with a 510 s measurement has 2.2x
of room in it.

Recording re-taken from this run, as `R7` requires: the ledger's newest row is this section, and
a recording older than the run the round reports describes a tree nobody shipped. The tightest
bound after the re-record is `verify / Lint` at 2.1x.

### Readings

> Ledger for `v3.50`.

| item | value |
| --- | --- |
| `core` test suite | **234 files, 5740 tests passed** |
| `cli` test suite | **4 files, 187 tests passed** |
| repo test suite | **238 files, 5927 tests passed** |
| new tests | **17**: 11 rule-9 cases in `gate-sites-are-proven.test.ts`, 3 in `build-example-bundle.test.ts` (two statements and the nested-directory case), 1 in `measure-doc-counts-readings.test.ts`, 1 in `score.test.ts`, 1 in `type-miss-probe.test.ts` |
| throw partition | **41 statements**: 4 `fatal`, 33 `unguarded`, 1 `guarded`, 3 `rethrow`; 35 proved; **6 exempt, 6 of them now holding a named test** |
| the six claims | pack uniqueness, pack manifests and counts it, every diagnosis is a `MeasurementUnavailable`, four vocabulary checks published, `classify`'s return set closed, the m1 partition covers its dataset -- **4 already held and unnamed, 2 not held at all** |
| failure sites | **114** across 56 of **79** scripts; `excluded` `{16 zero}` unchanged |
| proof plan | `verify-site-proofs`: **142 claim(s)** across 52 file(s) -- PASSED, unchanged |
| coverage | core **99.96 / 99.75 / 100 / 99.96**, cli **100 / 100 / 100 / 100** |
| `docs:check` | green: **396 findings / 1–399**, 10 volumes / 198 rounds, **1639 citations** of 396 numbers, 568 open entries with 529 carrying a reason |
| the bound that moved | **one**: the site-proofs step in `sensitivity` 18 -> **19** minutes, because the fresh recording measured it at **542 s** and twice that is 1084 s -- 4 s past 18 minutes. The job still holds: 19 minutes plus its 0.3 minute of setup inside a 20-minute budget |
| the defect the round found | `readExampleFiles()` walked one directory and skipped every non-file silently; reproduced with `examples/order-prod/nested/extra.json` (9 rows before, 10 after), fixed by a recursive walk |
| the rule, measured failing | renaming one `heldBy.test` in the inventory turned rule 9 red on `scripts/probe-m1-ceiling.mjs:118`; restoring it turned the block green |
| the recording | **run 41785707854** at `de4242299`, 7 jobs / 74 steps / **46 bounded**, 41 min measured; taken from the run this round's ledger row names, which is `R7` working on the round that reports it |
| CI | run `41785707854` on `de4242299`: **7 of 7 jobs success** -- batteries-heavy **12.6**, batteries **9.6**, build 8.9, sensitivity 8.9, golden master 0.9, backend 0.7, cold tree 0.3 min; **12.6 min of wall clock**, the fastest recorded. The run before the round, `41762557378` on `38f138cc0`, was 7 of 7 in 15.3 |

### Left open, in the order the goal is reached

| priority | item | state | next step |
| --- | --- | --- | --- |
| **P2** | a key whose description carries no keyword scores 0 | the protocol is silent; this repository takes 0 | record it as a gap; do not invent a redistribution |
| **P3** | the sensitivity gate's cost grows linearly with claims | 142 claims, 194 runs, 4.0 min locally and 9.4 on the runner | the 15-minute budget holds about 300 runs at this rate; shard by file before then |
| **P4** | ~~six throw rows rest on a sentence rather than a measurement~~ | **closed**: every exempt throw states its claim and names the test that holds it, and rule 9 refuses a row that does neither | -- |
| **P5/P7** | the witness sees one level | a script loaded without `NODE_OPTIONS` is not rewritten, and a wrapper that does not inherit hides its child | unchanged; needs a second observation channel |
| **P8** | the compiler is a runtime dependency of four readers | `derive-gate-sites.mjs`, `gate-proofs.mjs`, the witness and the Vite plugin | "a gate with no dependencies" still needs a third correct reading |
| **P9** | the batteries jobs sit inside their budgets | 11.1 and 15.2 measured against 25 each; the longest bound expires at 24.2 of 25 | a fresh baseline before adding another battery -- and `R7` now makes forgetting it impossible |
| **P11** | a `heldBy` title is an index of an assertion | rule 9 checks that the title exists, not that the body still measures the claim | the `sensitivity` battery already knows how to hollow a claim; extending it to `heldBy` is the honest next move |
| **P12** | the pack's index is written by the reader that writes the archive | the two agree by construction, so the **tree** is the only third opinion | `build-example-bundle.test.ts` reads the tree now; a `--check` that also compared the archive against a fresh recursive listing would close it in the tool rather than in a test |

**The lesson, for the round after this one.** The six exemptions were not wrong -- every one of
them was true. What was missing was the difference between *a claim that is true* and *a claim
something measures*, and the inventory could not tell those apart because it recorded the claim
in the one form that cannot fail. So the ruler is: **when a table records a judgement, ask what
would have to change for that judgement to be wrong, and check that the answer is written down
next to it** -- a test name, a run id, a command. The four claims that were already paid for had
been paid for in a place the table did not point at.

## v3.51 — the exemption pointed at a title, and the title pointed at nothing

Last round ended with a table of six claims and one sentence under it: *when a table records a
judgement, ask what would have to change for that judgement to be wrong, and check that the
answer is written down next to it.* Four of the six had an answer written down -- the test that
holds the claim. What the table did not have was the other half of that answer: **what change
would make the claim false.** This round supplies it, runs it, and in doing so finds that the
pack's own check was comparing a list with itself.

### One — the tool agreed with the reader it was supposed to check (finding 400)

`site/assets/example-pack.json` is the page's index of the download, and `--check` compares the
archive against it. Both are produced by `readExampleFiles()`. That is finding 398's shape kept
alive one layer up: 398 was fixed in the reader, and the tool that should have caught 398 could
not, because it reads the reader's own output on both sides.

Writing the third opinion is what exposed it. The first version was

```js
const inTree = treeListing(EXAMPLE_DIR);
const missing = orphansInTree(EXAMPLE_DIR, inTree);   // the listing, compared with itself
```

which is empty for every tree, including one the reader had lost a file from. It printed
`example pack is up to date`. The line was read before it was run, which is the only reason the
round did not ship a check that cannot fail -- and it is the second time in two rounds that the
defect was in the instrument rather than in what the instrument measures.

The fix is a walk that shares nothing with the reader's recursion: `opendirSync` handles
descended by hand, against `readdirSync(..., { recursive: true })`. Two refusals follow from it,
and both are published numbers rather than assertions:

| direction | what it refuses | what it prints |
| --- | --- | --- |
| a tree file the pack does not carry | a short download with an agreeing index | the file names |
| the archive is not the tree plus three | a row nobody can account for | both counts, `10` and `6` |
| a symlink, where the readings disagree | the pack depending on which reading you take | both counts |

The symlink case is real rather than invented: `statSync` follows a link and `Dirent.isFile()`
does not, so a linked example is carried and not listed. The build refuses instead of choosing,
and the message carries both numbers so a person can decide.

### Two — a title is an index too (finding 401)

Rule 9 asks an exemption to name the test that holds its claim. It checks that the file exists,
that it is a test file, and that a test with that title exists. That is the most a rule can do
without reading an assertion -- and reading an assertion is not a thing a checker can do.

What a checker *can* do is the other end of the sentence: change the code so the claim is false,
and require the named test to go red. So each exempt row carries a fifth column:

| column | what it is | what reads it |
| --- | --- | --- |
| `statement` | the claim, one falsifiable sentence | rule 9 (shape), a person (meaning) |
| `heldBy` | `{file, test}`: the test that measures it, by exact title | rule 9 |
| `mutant` | `{file, find, replace, defect}`: the edit that makes it false | rule 10, and the battery |

`verify-claims-are-sensitive.mjs` applies each edit and runs the named file. **7 claims, 12 runs,
12 seconds.** Six go red on an assertion and one on the code's own guard -- the m1 partition's
claim is enforced by the probe's own refusal, so the test reds because the measurement refused
rather than because an assertion failed. A battery that credited any non-zero exit would call
that one an assertion; one that demanded `AssertionError` would call it unmeasured. Neither is
true, so the verdict has four answers:

```
red, with an assertion           the test measures the claim
red, on the code's own guard    the claim is enforced where it lives, and the test notices
green                            the title points at nothing
red, but the tree did not load  unmeasured: the mutation broke the subject, not the claim
```

The fourth is the one that matters. Every "the gate caught it" claim in this repository rests on
a run that failed, and a mutation that does not parse fails every suite for a reason about the
mutation. `BROKEN` is matched before the verdict is given, and a run that matches is reported as
unmeasured with the failure quoted -- which is finding 173's shape avoided, not asserted against.

### Three — the table of edits rots in the way the table cannot see (finding 402)

A mutation is a substring, so it is an index of the tree, and the tree moves. Rule 10 refuses an
edit whose `find` does not occur exactly once, and the battery refuses a file with uncommitted
changes before it writes to it. Both were exercised on this round's own tree:

- moving one `find` string out of the tree turned rule 10 red, naming the count and the file;
- running the battery mid-round refused with *"`scripts/build-example-bundle.mjs` has uncommitted
  changes, so a mutation would overwrite work this run cannot restore"*.

The second is the more useful of the two: the gate failing on the round that wrote it is the only
evidence that a precondition is doing anything.

### Four — what the battery cannot establish

It establishes that one specific edit makes the claim false and that the test notices. It does
not establish that the test's assertion *is* the claim: a test that goes red for an unrelated
reason passes. Two of the seven are caught by a refusal rather than an assertion, which is a
weaker notice than an assertion and is reported as such. And the edit is a **substitution**: a
claim can be falsified by an edit the table does not name, and the table will not know.

These are stated because the alternative is a green run that reads stronger than it is. What the
round adds is that a false claim now has a published way of being false, and a red run that
follows it -- where before there was a sentence and a title.

### Five — the round's own instruments

`gate-sites.json`: **120 failure sites across 57 of 80 scripts**, `excluded {17 zero}`, and **43
throw statements** -- 4 `fatal`, 35 `unguarded`, 1 `guarded`, 3 `rethrow` -- of which 36 are
proved and 7 are exempt, every exemption carrying a claim, a holding test and a falsifying edit.

### Six — the step that could not be added (finding 403)

The battery was written as its own CI step, bounded at three minutes against twelve seconds of
measurement, and then could not be published. The loop has four links: `R2` refuses a step the
recording has never measured; the recording comes from a run; a run comes from a push; the push
needs a green `verify:local`, which runs `docs:check`, which runs `R2` — and is red because the
step has no measurement. **The step's own measurement is on the far side of the gate that
demands it.**

`--borrow` is the same shape for jobs -- a new job's seconds are a neighbour's, with the
derivation written down -- and there is no equivalent for a step, because a job's cost does not
depend on which job it sits in and a step's cost is the thing being measured. So the round folds
the battery into the neighbouring step's command: one `&&`, one bound, the same runner. The price
is the name. A reader who trusts *"Every proved exit can disappear without a word"* is now reading
a summary that is no longer complete, and that is written in the workflow rather than absorbed.
The fix -- a third derivation in the recording, for a step that is new or newly named -- is
P15, and it is not this round's work.

### Seven — the run, and the push that carried one commit of four (finding 404)

| CI | run `41809961840` on `b323263a0`: **7 of 7 jobs success** -- batteries-heavy **15.6**,
batteries **8.2**, build 9.1, sensitivity **10.0**, golden master 0.6, backend 0.6, cold tree
0.4 min; **15.6 min of wall clock**. The run before the round, `41785707854` on `de4242299`, was
7 of 7 in 12.6 |

The recording was re-taken from that run, as `R7` requires: the ledger's newest row is now this
one, and a recording older than the run the round reports describes a tree nobody shipped. The
tightest bound after the re-record is `verify / Lint` at 2.0x.

The ceiling moved with it, and the number is derived rather than picked. The one expensive step
of `sensitivity` measured **542 s** in the previous run and **578 s** in this one -- the claims
battery is the 36 s between them. Twice 578 is 1156 s, so its bound is 20 minutes; the 19 s of
setup in front of it puts the bound's expiry at 1219 s; a 20-minute ceiling would kill the job 19
seconds before the step's own bound could fire, which is exactly the defect step bounds exist to
remove (`R5`). So the ceiling goes 20 -> **21**, which is `ceil(1219 / 60)`. The bound moved first
and the ceiling followed, in that order, because a ceiling is a backstop and the bound is the
number that names a hang.

#### Finding 404 — the push sends the head revision, so a round of commits arrives as one

Four commits were made for this round: `10ef7dd` (the claim's falsifying edit), `b7ae319` (the
docs), `091650a` (the step that could not be added), `35645c4` (the two defects the local gate
found). The remote holds **one**, `b323263a0`, whose message is the last of them.

The mechanism is the publishing channel and it is written down in it: the API takes a message and
a set of files, so every push rebuilds its commit object; when the local parent is the remote tip
the rebuild lands on the same sha, and when an earlier push already rebuilt one, the tip is posted
**on the remote tip** and the commits in between are never sent. The tree survives -- every push
ends by comparing the published tree with the local one and refuses to move the ref if they
differ -- and the messages do not.

Nothing in this repository could have noticed. The receipt gate asks about a **tree**. `docs:check`
reads files. CI checks out a tree. The audit's own questions are about what the tree can
demonstrate. A log is the one artefact no gate reads, so a push that quietly rewrites it is a push
that passes everything.

The fix is to replay rather than hop: walk back from the revision being published to the newest
commit whose **tree** the remote already holds -- a tree is the only thing the two repositories can
honestly be compared on, since the shas of rebuilt commits differ -- and post each commit after it
in order, each one on the one before. A round is three or four commits, so a replay is three or
four tree diffs. `PUSH_PLAN_ONLY=1` prints the plan and creates nothing, which is how the decision
was read before it was published.

This close-out commit is the first use: it is published as its own commit rather than folded into
the last, which is the property the fix is for. The limit is stated rather than hidden: the
publishing channel is not in this repository, so no test in this suite covers the replay, and the
next round that touches it will be reading it rather than running it (P16).

### Readings

> Ledger for `v3.51`.

| item | value |
| --- | --- |
| `core` test suite | **234 files, 5740 tests passed** |
| `cli` test suite | **4 files, 187 tests passed** |
| repo test suite | **238 files, 5927 tests passed** |
| new tests | **27**: 12 in `claims-are-sensitive.test.ts` (every verdict and every refusal of the new battery), 11 rule-10 cases in `gate-sites-are-proven.test.ts`, 4 in `build-example-bundle.test.ts` (two third-opinion cases, the published counts, and the symlink that makes the two readings disagree) |
| throw partition | **43 statements**: 4 `fatal`, 35 `unguarded`, 1 `guarded`, 3 `rethrow`; 36 proved; **7 exempt, every one carrying a claim, a holding test and a falsifying edit** |
| failure sites | **120** across 57 of **80** scripts; `excluded` `{17 zero}` |
| the claims battery | **7 claims, 12 runs, 12 s** -- 6 red on an assertion, 1 on the code's own guard, **0 survivors, 0 unmeasured** |
| coverage | core **99.96 / 99.75 / 100 / 99.96**, cli **100 / 100 / 100 / 100** |
| the pack's two readings | archive **10 rows**, tree **6 files**, three generated files apart; a symlinked example is carried by the reader and invisible to the listing, so the build refuses and prints both counts |
| the defect in the instrument | the first version of the orphan check compared the listing with itself, which is empty for every tree and printed `up to date` |
| the recording | **run 41809961840** at `b323263a0`, 7 jobs / 74 steps / **46 bounded**, 44 min measured; taken from the run this round's ledger row names, which is `R7` working on the round that reports it |
| the bound and the ceiling it needs | the sensitivity step 19 -> **20** minutes (578 s measured; twice is 1156 s) and the job 20 -> **21**, which is `ceil((1200 + 19) / 60)` -- a 20-minute ceiling would have killed the job 19 s before the step's bound could fire |
| the log | **four local commits, one remote commit** until this close-out (finding 404); the push now replays the ancestry and publishes each commit as itself |

### Left open, in the order the goal is reached

| priority | item | state | next step |
| --- | --- | --- | --- |
| **P2** | a key whose description carries no keyword scores 0 | the protocol is silent; this repository takes 0 | record it as a gap; do not invent a redistribution |
| **P3** | the sensitivity gate's cost grows linearly with claims | 142 claims, 194 runs, 10.0 min on the runner; the claims battery adds 12 runs and 36 s | shard by file before the claims outgrow the job rather than the step -- the ceiling has 1 minute of headroom left after this round |
| **P5/P7** | the witness sees one level | a script loaded without `NODE_OPTIONS` is not rewritten, and a wrapper that does not inherit hides its child | unchanged; needs a second observation channel |
| **P8** | the compiler is a runtime dependency of four readers | `derive-gate-sites.mjs`, `gate-proofs.mjs`, the witness and the Vite plugin | "a gate with no dependencies" still needs a third correct reading |
| **P9** | the batteries jobs sit inside their budgets | 15.6 and 8.2 measured against 25 each; the longest bound expires at 24.2 of 25 | a fresh baseline before adding another battery -- `R7` makes forgetting impossible, `R2` makes adding a step visible |
| **P13** | a mutation is one substitution | a claim can be false in ways the table does not name, and the table cannot tell | the next honest step is a second mutant per claim, or a battery that mutates the *assertion* rather than the code |
| **P14** | one of the seven notices is a refusal, not an assertion | the m1 partition's claim is enforced by the probe refusing to publish | a claim whose only notice is a refusal is weaker than one a test asserts; say so per row rather than in a summary |
| **P15** | a CI step cannot be added or renamed, and its name can therefore go stale | the step's own measurement is behind `R2`, a run, a push and the receipt (finding 403) | a third derivation in the recording, the way `--borrow` is for jobs; until then a new battery shares a step name that no longer describes it |
| **P16** | the publishing channel is outside the repository and has no test | the replay that fixes finding 404 lives in the push script, which this suite never loads | move the plan computation into a module the suite can import, the way `ci-budget.mjs` was moved out of the gate |

**The lesson, for the round after this one.** Two rounds in a row, the defect was in the
instrument rather than in the thing it measures: last round a pack reader that walked one
directory, this round a check that compared a list with itself. Both were written by somebody
who had just read the code they were checking. So the ruler is: **for every check, name the two
things it compares and where each of them comes from** -- and if they come from the same place,
the check is a restatement, however green it is.

The close-out added a third, and it is the same ruler turned on the *output* rather than on a
check: a tree is what every gate reads, and a **log** is what none of them reads, so a channel
that carries trees can drop messages through a green run. Name, for every artefact a round
publishes, which gate reads it -- and treat "nothing reads this" as a position on the map rather
than a reassurance.

## v3.52 — a step nobody could add, and the name it left behind

Last round ended with a step that ran two batteries under one name, and with the sentence that
explained it: *a step cannot be added, and a measurement cannot happen without the step.* The
explanation was correct and it was also an admission -- the repository had a class of change it
could not make, and every future battery would inherit the same compromise. This round closes the
class.

### One — a name narrower than its command (finding 405)

`ci.yml` carried

```yaml
      - name: Every proved exit can disappear without a word
        timeout-minutes: 20
        run: node scripts/verify-sites-are-sensitive.mjs && node scripts/verify-claims-are-sensitive.mjs
```

The name describes the first command. The second asks a different question -- *can an exemption's
claim be made false* -- and a reader who trusts the name is reading a green line about a battery
that did not run. That is the defect a step bound exists to remove, one level down: the verdict
names something that is not the one that hung.

The four rings that made it unavoidable were each correct on their own:

1. `R2` refuses a step the recording has never measured, because a bound sized from no measurement
   is a number somebody typed;
2. `measure-ci-baseline.mjs` refuses to write a reading that omits any step of the workflow, because
   a partial recording describes a tree that never ran;
3. `verify:local` runs `docs:check`, which runs that gate, so the tree cannot be pushed while the
   step is unmeasured;
4. the run that would measure the step exists only after the push.

A closed loop of four correct rules. The previous round's answer was to stop needing the step.

### Two — what a tree can still say when it has no number (finding 405)

The rings are all about *measurement*. A round that adds a step cannot supply a measurement and can
supply several other things: the step exists, its bound is written in the workflow, the job's budget
is declared, and every step in front of it has been measured. So the missing number is isolated in a
file of its own rather than let into the recording:

```json
{
  "declared": [
    {
      "job": "sensitivity",
      "step": "Every exemption's claim can be made false",
      "minutes": 3,
      "why": "The claims battery shared the sites step for one round because a step could not be measured before it existed (findings 403 and 405). It runs its own command from this round on, and the first run that measures it deletes this sentence."
    }
  ]
}
```

`R8` is the arithmetic over that list, and every clause is a refusal a reader can act on:

| the clause | what it refuses |
| --- | --- |
| the step exists in the job it names | a promise about a step that was renamed or removed |
| the bound is the workflow's own | two numbers, and a reader deciding which one kills the run |
| the recording does not measure it | a promise that outlived its measurement -- the bound nobody checked |
| the bound clears the floor | a step that has not run is exactly the case the floor is for |
| the bound expires inside the job | an arithmetic that skips a hole, computed from the measurements in front |
| it is the last unmeasured step of its job | a bound after it argued from a sum with an unknown in it |
| it argues for itself in forty characters | a claim about unwatched work with no words behind it |
| an empty list is refused | the file becoming furniture |

The lifetime is one recording, and the mechanism is structural rather than promised: the recorder
cannot write a reading that omits the step, `R7` forces a refresh on every round that cites a run,
and `R8` refuses the tree until the sentence is gone. So a declaration is a promise that is kept or
the round does not close.

### Three — what the declaration cannot do

`R4` -- the bound is at least twice the measurement -- is the one rule with nothing to stand on
before the measurement exists. That is not an oversight, it is where the bet is placed: the round
that adds the step guesses a number and the round that refreshes finds out. If the guess is too
small, the refresh is refused with a bound, a measurement and a ratio, which is a sentence somebody
can act on; the alternative was the standing refusal of every new step, which produced the name this
round deletes.

A whole **job** is still out of reach, and the file says so rather than leaving the gap to be
discovered: a new job's budget is part of what `R6` compares, so a job that has never run is covered
by `--borrow` (which copies seconds) and nothing else. The next round that needs a new job will find
that out from the gate rather than from this paragraph, which is the correct order.

### Four — a borrowed measurement carried a budget it never spent (finding 406)

The recorder writes `timeoutMinutes` from the workflow it has just read. For a job recorded with
`--borrow`, that is the *target's* budget, so `R6` compared the workflow with itself and could never
fire for that job -- while the deadline arithmetic was argued from a ceiling the borrowed seconds had
never been spent inside.

The fix is a refusal in the recorder, where the source job is still known:

```
--borrow batteries-heavy=batteries crosses a budget: `batteries-heavy` declares 40 minutes and
`batteries` declares 25 minutes. The seconds describe the same commands, but a bound has to fit the
job that will enforce it, so a borrow is only a substitute for a measurement inside one budget
```

A step's cost is a property of the command. A budget is not, and the check that could not tell them
apart was comparing one thing with itself -- the third round in a row where that was the defect.

### Five — the round's own instruments

| instrument | what it says now |
| --- | --- |
| `ci.yml` | **75 steps** in 7 jobs, **47 bounded**; bounds total **208 min** against 43 min measured |
| the declaration | **1** step, `sensitivity / Every exemption's claim can be made false`, 3 min, awaiting the run that measures it |
| `gate-sites.json` | **121 failure sites** across 57 of 80 scripts, `excluded {17 zero}`; **44 throws** -- 5 `fatal`, 35 `unguarded`, 1 `guarded`, 3 `rethrow` |
| the step count the plan prints | `sensitivity bounds all 4 of its step(s) on its own`, and the largest is still 20m of the job's 21m |

### Six — the run, and the sentence it deleted

| CI | run `41835348742` on `12010eb76`: **7 of 7 jobs success** -- batteries-heavy **12.0**, batteries **11.6**, build 9.4, sensitivity **8.8**, golden master 0.7, backend 0.7, cold tree 0.6 min; **13.1 min of wall clock**. The split step ran **20 s** against its three-minute bound and the sites battery **482 s** against twenty |

The recording was re-taken from that run, as `R7` requires, and the declaration was consumed
by it: the recorder printed `1 declaration(s) are now measured and can be deleted`, the file was
deleted in the same commit as the recording, and `R8` had been refusing the tree until it was.
That is the whole lifecycle of a promise in one round -- written by the round that added the step,
measured by the run that round closes on, deleted by the close-out.

The number the declaration guessed is 20 s against 180 s of bound: nine times, where `R4` asks
for two. The sites battery is 482 s against 1200 s, which is 2.5 times. Both bounds were sized
before this run existed; one of them was a guess and the guess was generous.

### Readings

> Ledger for `v3.52`.

| item | value |
| --- | --- |
| `core` test suite | **234 files, 5756 tests passed** |
| `cli` test suite | **4 files, 187 tests passed** |
| repo test suite | **238 files, 5943 tests passed** |
| new tests | **16**, all in `ci-budget.test.ts`: every clause of `R8` (seven refusals and the pair that shows the declaration doing the work), the reading it prints, the shipped pair, the malformed file through the gate, the recorder's "now measured" line, and the borrow across a budget |
| throw partition | **44 statements**: 5 `fatal`, 35 `unguarded`, 1 `guarded`, 3 `rethrow`; 37 proved; 7 exempt |
| failure sites | **121** across 57 of **80** scripts; `excluded` `{17 zero}` |
| the new refusal | `check-ci-budget.mjs` gains one site (a declarations file that cannot be read) and `measure-ci-baseline.mjs` one throw (a borrow across a budget) -- both proved by the same test file |
| the declaration | **1** entry when the round was pushed, and green *because* of it -- the same tree without the file is refused, which is the pair the round's first case asserts. The run measured the step at **20 s** against a 180 s bound, and the entry is deleted in this close-out: `no step is declared unmeasured` |
| the step | `sensitivity` now bounds **4** steps; the sites battery keeps 20 min (578 s recorded, 542 s real) and the claims battery gets the 3-minute floor |

One correction to the tables above, and it is about the tables themselves. (This round's own
table carried the marker while it was the newest one; the next round retires it, as this
paragraph describes.) A count marked `as of this commit` has to equal the live measurement, so every round that adds tests
rewrites the marked rows of the rounds before it -- v3.49, v3.50 and v3.51 all now read
`5740 / 5927`, and none of them measured that. This round drops the marker from those three
tables and leaves their numbers where they are: they become **records of the state at the close
of v3.51**, which is what they can honestly be. The marker stays on this round's table, so there
is always exactly one row that claims to be now.

### Left open, in the order the goal is reached

| priority | item | state | next step |
| --- | --- | --- | --- |
| **P3** | the sensitivity gate's cost grows linearly with claims | 142 claims, 194 runs, 10.0 min on the runner, and the two batteries now have separate bounds | shard by file when either battery approaches twice its measurement; the split means growth in one no longer spends the other's margin |
| **P17** | a job that has never run can only be recorded by `--borrow` | a new job's budget is part of `R6`'s comparison, so there is nothing to compare | a declaration for a job, which would have to state its budget and every step's bound -- the same shape one level up |
| **P13** | a mutation is one substitution | a claim can be false in ways the table does not name | unchanged this round |
| **P14** | one of the seven notices is a refusal, not an assertion | the m1 partition's claim is enforced by the probe refusing to publish | unchanged this round |
| **P16** | the publishing channel is outside the repository and has no test | the replay that fixes finding 404 lives in the push script | unchanged this round |
| **P2** | a key whose description carries no keyword scores 0 | the protocol is silent | unchanged |
| **P5/P7** | the witness sees one level | a script loaded without `NODE_OPTIONS` is not rewritten | unchanged |
| **P8** | the compiler is a runtime dependency of four readers | unchanged | unchanged |
| **P9** | the batteries jobs sit inside their budgets | 15.6 and 8.2 measured against 25 each | a fresh baseline before adding another battery |

**The lesson, for the round after this one.** The previous round's ruler was *name the two things a
check compares and where each comes from.* This round's is the same ruler applied to a **file**: for
every file a tool writes, name the fields the tool cannot know, and see whether the tree has another
place to put them. `ci-baseline.json` is written by one script and holds measurements; a round that
needed a fact the script could not measure had been writing it as a longer command line, and the name
of the step paid for it. A file with one writer and one kind of content is a file whose gaps are
visible; a file with two kinds of content is one where a promise can hide inside a measurement.

## v3.53 — the channel that carries every finding had never been run by a test

The previous round closed with a sentence deleted by the run that measured it, and a ruler for
the next one: *for every file a tool writes, name the fields the tool cannot know, and see whether
the tree has another place to put them.* Applying it took one minute, and the answer was not a
file the tree writes at all. It was the file that publishes the tree.

Every finding in this repository reached the remote through `push_incremental.py`: 362 lines of
Python in a scratch directory outside both repositories, with no test, no review, no CI, and one
assertion. That was defensible while the only thing it could get wrong was bytes, because a wrong
byte is caught at the end -- the rebuilt tree is compared with the local one and the ref does not
move if they differ. It stopped being defensible in v3.51, when the script was wrong about *which
commits to publish*: three went up and one arrived, every tree was byte-identical, and the round's
account of itself had lost two thirds of its sentences. The repair was a replay, and the replay had
been executed exactly once -- in the incident it repaired.

### One — a decision and an effect, one of which was tested (finding 407)

A push is two things. The first is a decision: which commits the remote does not hold, in what
order they are published, and on what each one hangs. The second is an effect: four API calls per
commit. The first is where finding 404 lived, and it was not a separate thing anywhere -- it was a
function inside the same Python file that immediately performed the effect, so the only way to look
at a plan was `PUSH_PLAN_ONLY=1`, on a script that must not be run against a branch it might move,
and nothing read the result.

The round splits the three concerns into three files and gives each one the instrument it can
carry:

| file | what it is | how it is held |
| --- | --- | --- |
| `scripts/publish-plan.mjs` | the decision, as a function of data | `publish-plan.test.ts`, 26 cases against real repositories |
| `scripts/publish.mjs` | executing a plan, and two transports | `publish.test.ts`, 36 cases, one of them end to end over HTTP |
| `scripts/publish-cli.mjs` | the entry point, and the only gate | spawned for both exits; hollowing it turns the suite red |

The plan says everything except two fields, and the exception is the point. It is written before
any object exists, so it cannot name the commits it will create -- those SHAs are the API's answer.
What it names instead is where each object hangs: `parent` and `base` are symbolic, either the
remote tip or the local commit whose rebuilt form precedes this one, and the executor resolves each
symbol exactly once and refuses one it cannot resolve. A plan that emitted `parent: null` for the
executor to fill in would be a plan with a hole in the one field that decides the history.

### Two — when the remote holds nothing of the ancestry, the old channel published the tip alone (finding 408)

`replay_plan` walked back to the newest commit whose tree the remote held and returned everything
after it. When no commit matched -- a rewritten history, a rebase, the wrong branch -- it returned
`None`, and the caller did this:

```python
if plan is None:
    print("the remote holds no tree of this revision's ancestry -- publishing the tip alone")
    plan = [REV]
```

That is finding 404 exactly: the tip's content arrives, the ancestry does not, the trees match and
the sentences are lost. The repair added the replay and **kept the fallback**, with one printed line
standing between "the remote is behind" and "the remote is on a different history". After the
repair, both states ended in `VERIFIED`.

The refusal replaces it, and it names the finding because a reader who meets it will otherwise
re-derive it:

```
the remote holds neither 4a1c9ff02 nor any tree of its ancestry: its tip is 7c3e1ab88
(tree 91f0d2c4e) and no local commit has that tree. Publishing the tip alone is how
finding 404 lost two of three commits — the tree arrives and the sentences do not.
Rebase onto the remote, or publish the branch that produced that tip
```

A branch that does not exist is still publishable, and it is a different state rather than a
fallback: `head: null` means there is nothing to locate, so the whole ancestry is the window and
the root commit legitimately has no parent. The case is exercised against a bare repository with
its ref deleted, and the result is the same equality every other case asserts.

### Three — a listing that says it is partial was used to decide what to delete (finding 409)

`GET /git/trees/{sha}?recursive=1` truncates at 100 000 entries or seven megabytes and says so with
`truncated: true`. The channel computed its deletions as *every path in the remote listing that the
local revision does not have*, so a path missing from a partial listing is indistinguishable from a
path that was never there -- in the direction that leaves files on the remote that the local
revision removed.

The assertion at the end does catch the result. It catches it after every blob of the round has
been uploaded, with a sentence about two trees and no cause. The refusal now arrives first and
names the listing; the case that proves it also asserts that no `POST /git/trees` and no
`POST /git/blobs` was made, which is the difference between a channel that refuses and a channel
that refuses late.

### Four — a merge was replayed with one parent (finding 410)

`parents: [head]`, always, one line. A merge inside the replayed window is published as a commit
with one parent, so the remote receives a history with the second side missing and a SHA that is
not the SHA that was written. This repository's history is linear, which is why the line survived
four hundred rounds: the defect is latent, and latent is not the same as absent -- the same sentence
would be true of every repository this channel is pointed at next.

The planner refuses it and says what the second parent is:

```
a merge carries a history in its second parent that the remote would not receive,
so the SHA it receives would not be the SHA that was written
```

The case builds a real merge -- two branches, `--no-ff` -- and the assertion is on the refusal, not
on a hand-made record. The root commit is the one exception, and it is stated as one: zero parents
is allowed exactly when the plan is publishing onto a branch that does not exist yet.

### Five — the harness could see the answer, so it proved nothing (finding 411)

The first version of the local transport pointed `GIT_ALTERNATE_OBJECT_DIRECTORIES` at the source
repository, so that a rebuilt commit could find its parent. The whole suite was green. It was green
because `git commit-tree` **does not write an object it can already reach**: the rebuilt commit was
byte-identical to the local one because it *was* the local one, found across a wire that was not
there. Nothing had crossed the boundary and the equality held.

The failure surfaced from a direction nobody was looking at: the ref update refused to move the
branch backwards, because `git -C remote cat-file -t <rebuilt>` answered `could not get object
info`. The object existed -- in the repository the harness had let the "server" see.

Removing the alternates fixed it and made the test stronger than it was designed to be: the remote
now holds only what was uploaded, so any object the plan references without sending it fails
loudly, and the equality of commit SHAs is a statement about what crossed the socket. It is the
round's own ruler turned on the instrument rather than on the tree: *for every assertion, name the
observable that would be absent if the code did nothing* -- and if the answer is "nothing", the
assertion is measuring the harness.

### Six — the instruments

| instrument | what it says now |
| --- | --- |
| the channel | three modules, 1 100 lines of decision and execution where there were 362 lines outside the tree with none |
| the suite | **62 new cases** in two files; `publish-plan.test.ts` 26, `publish.test.ts` 36 |
| the end-to-end assertion | after a replay, `git -C remote rev-parse main` equals `git -C local rev-parse HEAD` and the two logs are equal line for line -- measured over HTTP against a server that writes real git objects, and against a bare repository directly |
| the mutation | narrowing the window back to `[ancestry[0]]` -- the old behaviour -- turns **8 of the file's 36 cases** red, the first of them the log comparison |
| `gate-sites.json` | **123 failure sites** across 58 of **83** scripts; **73 throws** -- 5 `fatal`, 60 `unguarded`, 1 `guarded`, 7 `rethrow`; 66 proved, 7 exempt |
| the sensitivity batteries | `verify-sites-are-sensitive`: **182 claims / 55 files / 237 runs / 4.8 min** (116 exits hollowed, 66 throws removed), 0 survivors; `verify-claims-are-sensitive`: **7 claims / 12 runs / 0.2 min**, 0 survivors -- both measured on this tree, not quoted from the previous round |
| the register | three new entries: two `data`, one `gate`; the gate is the only one of the three that exits |

### Readings

> Ledger for `v3.53`.

| item | value |
| --- | --- |
| `core` test suite | **236 files, 5819 tests passed** |
| `cli` test suite | **4 files, 187 tests passed** |
| repo test suite | **240 files, 6006 tests passed** |
| new tests | **62**: 26 in `publish-plan.test.ts` (base location, message bytes, the file table from both sources, the entries diff, six plan refusals, the symbols) and 36 in `publish.test.ts` (local transport end to end, dry run, unborn branch, receipt, four refusals a broken transport produces, ten HTTP cases, five CLI cases, and the closed socket) |
| throw partition | **73 statements**: 5 `fatal`, 60 `unguarded`, 1 `guarded`, 7 `rethrow`; 66 proved; 7 exempt |
| failure sites | **123** across 58 of **83** scripts; `excluded` `{17 zero}` |
| the new sites | 31, every one proved by the same two files: 29 throws, the CLI's two exits, and the close-out's rethrow |
| the assertion that would have caught finding 404 | `expect(log(remote,'main')).toBe(log(source,'HEAD'))` -- the trees were equal on the day, and the logs were not |

### Seven — the first real push, and the sixth finding

After the chapter was written, the channel was pointed at `api.github.com` for the first time. The
docs repository went first as the smallest subject there is -- ten files, two commits, no gate --
and both commits arrived with the right trees, the right parents and the right messages. This
repository followed with four commits, all four present on the remote in order, tip tree
`9532bb83b` equal to `HEAD^{tree}`. The read path was measured too: 640 entries from
`?recursive=1`, 598 files after 42 `tree` entries are skipped, `truncated: false`.

Then a third push, one commit changing two prose files, failed twice with `publish failed: fetch
failed`. The cause was `UND_ERR_SOCKET: other side closed` on `POST /git/blobs` -- **no answer at
all**, not a status the 5xx retry could compare. `curl` to the same endpoint with the same body
answered 201, and Node's own `fetch` of the same 2.2 MB body answered 201 on its first try. The
in-process server in the suite answers every request it is given; it cannot disappear between the
request and the answer, because the same process is both sides. The acceptance contract had said
one round earlier that an unmodelled *answer* might exist. What arrived was sharper: no answer.

`isNetworkFailure` now names only the codes a broken connection carries, and `call` retries such a
failure with the same backoff as a 5xx. Four cases hold it: a destroyed socket answers on the retry
and the push ends at the local tip; a socket destroyed every time spends exactly its budget and
then refuses with the ref unmoved; an ordinary error is called once and not retried; and the
classifier is driven against both shapes. Removing the branch turns the first two red. The
round's own ruler -- *name the observable that would be absent if the code did nothing* -- had to
be applied one level out again: a test whose two sides are the same process cannot produce the
failure where one side is gone.

| CI | run `42131836805` on `7484b1acc`: **7 of 7 jobs success** -- batteries-heavy **15.3**, batteries **12.0**, sensitivity **11.3**, build **7.0**, golden master **0.9**, backend **0.7**, cold tree **0.3** min; **15.3 min of wall clock**. The sites battery ran **626 s** against its 20-minute bound and the claims battery **24 s** against three |

The recording was re-taken from that run, as `R7` requires. `R4` refused the reading first: 626 s
needs 1252 s of bound, and the step had 1200. So the bound moved 20 -> 25 and the ceiling 21 -> 26
by `R5`'s arithmetic (`ceil((1500 + 22) / 60)`), and the recording now says 26 minutes for both
itself and the workflow -- a measurement from the run, a budget from the tree that cites it.
`bounds total` reads **213 min** against **47 min measured**, and the tightest bound is now
`batteries / Every gate can be shown to fail` at 2.1x.

One state is worth naming because it looks like a failed end-to-end assertion and is not one. The
real push reports `the tip's tree is the local one and its SHA is not (the history it hangs on is
not the local history)`: the old channel rebuilt the remote lineage with UTC author dates, so its
commit SHAs were never the local ones and each round appends to that lineage. The suite's
line-for-line log equality holds where both sides are local git objects and the parent is the same
object; the real push proves that every commit arrived and every tree is equal. Neither stands in
for the other, and the CLI says which one it is claiming.

One smaller repair belongs to the same refresh. `ci-budget.test.ts` named a "future" run
(`41999999999`) to make `R7` refuse; the recording now says `42131836805` and overtook it, so the
case that has to fail began to pass, and `verify-site-proofs` reported twelve unmeasured claims
whose claimant was red. A red claimant is not a proof of anything -- the battery refuses to
credit it, which is what made the defect visible in twelve places at once. The fixture now reads
the shipped recording and adds one, because the refusal is about the *order* of two runs and not
about either number. A test with a hard-coded date is a test the next recording breaks.

### Left open, in the order the goal is reached

| priority | item | state | next step |
| --- | --- | --- | --- |
| **P3** | the sensitivity gate's cost grows linearly with claims | **182 claims, 237 runs, 4.8 min** locally and **626 s on the runner**; the bound moved 20 -> 25 and the ceiling 21 -> 26 by `R4`/`R5` after the refresh, so the margin is bought by the rule again; the claims battery adds 7 claims and 12 runs in 0.2 min | shard by file when either battery approaches twice its measurement -- 626 s against 1200 s was 52 s short, which is the closest this has come |
| **P17** | a job that has never run can only be recorded by `--borrow` | a new job's budget is part of `R6`'s comparison, so there is nothing to compare | a declaration for a job, which would have to state its budget and every step's bound |
| **P13** | a mutation is one substitution | a claim can be false in ways the table does not name | unchanged |
| **P14** | one of the seven notices is a refusal, not an assertion | unchanged | unchanged |
| **P2** | a key whose description carries no keyword scores 0 | the protocol is silent | unchanged |
| **P5/P7** | the witness sees one level | a script loaded without `NODE_OPTIONS` is not rewritten | unchanged |
| **P8** | the compiler is a runtime dependency of four readers | unchanged | unchanged |
| **P9** | the batteries jobs sit inside their budgets | 15.6 and 8.2 measured against 25 each | a fresh baseline before adding another battery |

**The lesson, for the round after this one.** The previous ruler was about a file: name the fields
its writer cannot know. This round's is about a test, and it is the same ruler one level out: *name
the observable that would be absent if the code did nothing.* The alternates line made every
assertion in the file pass while the channel uploaded nothing, and no amount of reading the
assertions would have said so -- because the assertion compared two things that were the same
object. A test whose two sides can be the same object is a test of the harness. The next place to
apply it is the one item on this list that has never been measured at all: P17's job declaration,
where the artifact under test would be a budget that only CI can spend.

## v3.54 — a job no run had measured, and the budget only CI can spend

The previous round ended with a ruler: *for every test, name the failure shape it cannot
produce.* It also named the one item on the open list that had never been measured at all:
P17's job declaration, whose subject is a budget that only CI can spend. This round takes
both at once, and takes P3 with them, because a declaration no real job ever uses is a
mechanism with the same defect as the channel in v3.53.

### One — the same shape one level up (P17)

`R8` let a tree declare a **step** the recording had not measured, and every field it wrote
was already in `ci.yml`. A whole **job** is that shape one level up, with a difference that
is not a detail: the job's ceiling is part of `R6`'s comparison, so a job no run has
measured has nothing to be compared with, and `--borrow` was refused across a budget in
v3.52. `R9` is the answer. A job promise names four things and no others: the job id, the
ceiling written in `ci.yml`, the bound on **every** step of that job, and an argument of at
least forty characters. `budgetErrors` checks each of them against the workflow, exempts
the job from `R2`'s gap, and refuses the promise the moment the recording holds that job --
because its first run is the thing it was waiting for.

### Two — a whitelist, because the ruler is about what a writer cannot know

A local apparatus cannot spend a runner's budget. It can, however, catch someone writing
down the seconds that only a run could have produced. `JOB_PROMISE_KEYS` and
`STEP_PROMISE_KEYS` are whitelists rather than a documented convention: an extra key --
`seconds`, `run`, `commit`, `measured`, `ratio`, `derived` -- is refused by name as a
measurement its writer has not watched happen. `R9` deliberately computes **no deadline**:
`R5` needs the seconds measured in front of a bound, and every step of a job that has never
run is unmeasured, so the sum has no terms. The first green run supplies them and `R4`/`R5`
settle the numbers in the commit that deletes the promise. Nineteen cases in
`ci-budget.test.ts` hold these rules, and each says in a comment which failure shape its
fixture cannot produce; a twentieth reads the block and refuses a case added without that
sentence. The mark is assembled and matched only on comment lines so the case does not
count its own pattern.

### Three — a real job, so the promise is used rather than merely tested (P3)

The sites battery measured **626 s** on the runner against a bound `R4` put at 1252 s --
52 s was the closest this campaign has come to refusing a legitimate run. v3.53 bought the
margin back with a rule (20 -> 25, ceiling 21 -> 26); this round spends less instead. The
sorted claimant files are divided by position across `sensitivity` and a new job
`sensitivity-shard`, each running one half against the same 25-minute bound, so the wall
clock is the slower shard rather than their sum. `checkShardPlan` reads the real `ci.yml`
and the real inventory and refuses a plan that omits a shard, calls one twice, puts two in
one job, disagrees on the count, or measures one claim twice or not at all. The shipped
script refuses a shard with no claimant, because two green jobs one of which measured
nothing is a shape a single job cannot produce.

The bound is **not** tightened in the round that splits: its measurement is of the
unsharded command, and `R4` has to size a bound from a run of the command it will enforce.
The step's name is unchanged for the same reason -- `R2` pins the recording to it, so a
recording taken from the unsharded run still names a step that exists.

### Four — a guard that stopped seeing a command with arguments

Registering the new job found a defect that had nothing to do with budgets.
`cold-tree-job.test.ts` decides which jobs run the suite by following each `run:` command
to the script it names. Its pattern ended in `$`, so
`node scripts/verify-sites-are-sensitive.mjs --shard 1/2` did not match and the guard
answered "this job runs no suite" about a job that does nothing else. Adding a flag made a
whole job invisible to the shell check. The `$` is gone, `sensitivity-shard` is registered
in `SUITE_JOB_IDS`, and the six jobs that run the suite are named again.

### Five — the recorder keeps the gap open

`measure-ci-baseline.mjs` now knows a job promise. A declared job a run never reported is
skipped, not filled with a borrowed or invented number: the recording keeps the hole, and
`R9` reads the same promise and the same recording, so the gap is a state the gate can be
green in. A `--borrow` of a declared job is refused, because a borrow is not a first run --
it would put the id in the recording against seconds from a different job. The first run
that reports the job records it normally, says the promise can be deleted, and leaves the
sentence for the round rather than erasing the only account of why the job exists.

### Readings

> Ledger for `v3.54`.

| item | value |
| --- | --- |
| `core` test suite | **237 files, 5849 tests passed** (at v3.54) |
| `cli` test suite | **4 files, 187 tests passed** (at v3.54) |
| repo test suite | **241 files, 6036 tests passed** (at v3.54) |
| new tests | **30**: 19 for `R9` (the whitelist, the whole-step relation, the lifetime, the summary and the self-check), 8 for the split (the grammar, the partition, the shipped workflow's plan, and the two refusals), and 4 for `R6`'s asymmetry (a narrower budget refused, a missing one refused, a wider one accepted and named, a removed one accepted) with one existing case rewritten from the wider direction to the narrower |
| throw partition | **74 statements**: 6 `fatal`, 60 `unguarded`, 1 `guarded`, 7 `rethrow` |
| failure sites | **123** across 58 of **83** scripts; two re-annotated after their guard text changed |
| the recording | run `42172498744`, **8 jobs / 82 steps / 61 bounded**, 45 min measured; bounds total **292 min**, tightest `verify / Test with coverage` at **2.3x**. Before the settlement it was run `42131836805`, 7 jobs / 75 steps, with one declared job deliberately absent |
| the bound that was two seconds short | `Lint` measured **361 s** in `42172498744` and **347 s** in v3.53's reading; twice 361 is **722**, and its bound was **720**. `R4` refused a step that had done nothing but run on a slightly slower machine. It is **14** minutes now -- 2.33x -- and 840 plus the 27 s measured in front of it is 867, inside the 15-minute ceiling, so no ceiling moved and `R6` had nothing to excuse |
| the third run | `42172498744`: **8 of 8 jobs success**, batteries-heavy **11.4**, build **9.2**, batteries **8.7**, sensitivity-shard **6.6**, sensitivity **5.2**, golden master **3.1**, backend **0.8**, cold tree **0.5** min; **12.2 min of wall clock**. The installed backend took **50 s** this time -- a mirror having a good day |
| the job that had never been bounded | `backend` measured **296 s** in `42165763231` against **37 s** in the run before it -- `apt-get install prometheus` on a bad and a good day. Over three minutes the floor applies to every step of the job, and seven steps at three minutes are 21, one more than the 20-minute ceiling it had, so the job could not be bounded at all until the ceiling moved. It is **34** now: five setup steps at 3, the install at **16** (1.5x the 648 s a cold runner measured, 3.5x the 273 s of the install step in this run), the reader at 3 |
| `R6`, split in two | a budget *narrower* than the one the reading was taken under is still refused, because a bound that fit the wider ceiling may expire after the job has already died; a *wider* one is accepted and named in the summary (`backend 20 -> 34`), because no step bound moves and `R5`'s deadline only gains room. Refusing that direction closed the same circle `R9` opens: a ceiling could then only be widened by a run, and a run happens after the push this gate has to pass |
| the split, measured | shard 1 **248 s**, shard 2 **387 s** -- **635 s** together against **626 s** unsharded; the wall clock is the slower shard, **7.0 of 12.5 min**, where the battery used to be the longest job at 11.3 |
| the promise, settled | the first green run measured `sensitivity-shard` at **387 s** against a 25-minute bound: **3.9x**, `R4` green, `R5`'s sum inside a 26-minute ceiling. The promise was deleted in this commit, which is the lifetime it declared -- one real run, not a borrow |
| CI | run `42160224254` on `b054d7f9a`: **8 of 8 jobs success** -- batteries-heavy **12.5**, batteries **11.7**, sensitivity-shard **7.0**, build **6.0**, sensitivity **4.9**, cold tree **2.2**, golden master **1.0**, backend **0.6** min; **12.5 min of wall clock** |

### Left open, in the order the goal is reached

| priority | item | state | next step |
| --- | --- | --- | --- |
| **P1** | real network shapes beyond a closed socket | local servers drive 5xx, 400 and 422 | keep a reading of what the API actually answered on every real push |
| **P2** | a mistyped `--branch` reads as an unborn branch | `publish-cli --branch main` on a `master` repository found no ref, so the plan was "publish the whole history onto nothing"; only the merge refusal stopped it. A linear history would have created a second branch silently | refuse a plan whose base is `null` on a repository that is not empty, unless the caller says `--new-branch` |
| **P2** | P13: a mutation is one substitution | unchanged | a second mutation, or an assertion about mutations |
| **P2** | P2 / P5 / P7 / P8 | unchanged | unchanged |
| **P3** | P9 / P14 | unchanged | unchanged |
| **P3** | the shards are unbalanced by file cost, not by count | **248/387** then **189/440**, ratio 1.56 -> 2.33 while the counts differ by ten | time each claimant file once, cut where the seconds are, then settle the bound with a run of the rearranged command |
| **P3** | `backend`'s 16-minute install bound has never met a slow day | sized from 648 s on a cold runner and 273 s in this run; 13 minutes was refused by `R4` at 440 s, which is the same arithmetic | a run that installs from a slow mirror, and the bound re-sized from it if 16 proves short |

**The lesson, for the round after this one.** The previous ruler was about a test: name the
failure shape it cannot produce. Applied to P17 it produced a whitelist rather than a
simulation -- the local suite cannot spend a budget, but it can refuse a promise that
claims to have measured one. The honest boundary is therefore written into the rule and
the tests instead of being discovered later: `R9` says nothing about a deadline, and the
first CI run is where the numbers are settled. A mechanism that has never been used by a
real job is a mechanism nobody has tested, so this round also gives it one.

### The promise's whole life, in one round

The tree was published with the promise in it -- `sensitivity-shard` declared, no run
having measured it, `check-ci-budget` green in that state because `R9` reads the same
promise and the same recording and the gap is a state both agree on. The run that followed
was the first one that could answer it, and it answered with a number the promise was
forbidden to write: the recorder measured the job at **387 s**, printed that one declaration
was now measured and could be deleted, and the deletion is part of this round's last commit.
`check-ci-budget` then read **8 jobs / 82 steps / 54 bounded**, and `R4` accepted 25 minutes
against 387 s at **3.9x** -- a bound sized by a run of the command it enforces, which is the
thing a declaration cannot do.

The next round was supposed to ask whether **13** minutes (2.0x of 387 s) would hold the
slower shard. The run after this one answered it before anybody could ask: the same shard
measured **440 s**, 13.7% slower, and 13 minutes is 780 s, which is under `R4`'s required
twice the measurement (880 s). The suggestion was refused by its own arithmetic one run
later. The lesson is not that 25 minutes is tight -- it is that a bound sized from a single
reading of a variable step is a bound that expires the first time the runner has a
different day, and the two shards' drift (**248 -> 189**, **387 -> 440**, sum **635 ->
629**) is the measurement of how variable that day is.

The split also moved the critical path. The sites battery was the longest job at 11.3 min in
run `42131836805`; in `42160224254` it is **4.9** and **7.0** in parallel, and
`batteries-heavy` at **12.5** now sets the wall clock. P3's subject -- a gate whose cost grows
with its claims -- is therefore no longer the thing that lengthens a run, which is a
different statement from "the shards are balanced": shard 2 is **1.6x** shard 1, exactly the
imbalance the local reading predicted.

## v3.55 — the statistic a bound was always supposed to be taken from

v3.54 closed with a sentence it had earned three times in three runs: *a bound sized from a
single reading of a variable step is a bound that expires the first time the runner has a
different day.* The open list then recorded the honest version of it -- every bound's number
should say which reading it came from and what a slower day is expected to cost. This round
is the one that answers it, and the answer is not a margin. It is a different statistic.

### One — the maximum was being taken over a sample of one (finding 423, `R10`)

`R4` asks for twice **the** measurement. "The" was one run: the one in
`golden-master/ci-baseline.json`. A bound needs a maximum over days, and a recording is one
day by construction, so the rule was exact about the wrong quantity and green while being
wrong -- a bound could satisfy it and still fire on a day this repository had already
measured.

`R10` closes the gap. `golden-master/ci-readings.json` holds one entry per run the recorder
has ever measured; each step in it carries its seconds **and the command those seconds were
spent on**. A bound must be at least twice the slowest reading of *its command*, from
whichever job and whichever run. The command is stored rather than resolved through today's
tree because a renamed step would otherwise lose its series, and losing a series is losing
the slow day that justified a bound. Two shapes fall out of keying by command: the same
script in two jobs is one series (`sensitivity` and `sensitivity-shard` now share theirs),
and an action step keys by its name, because an action has no `run:` of its own and the
download is what costs.

The file is required rather than optional. A gate that skipped the comparison whenever the
history was absent would print `OK` about a question it had not asked, which is the silence
`R10` exists to remove; the refusal names the path it looked for.

### Two — the history has to outlive the workflow it describes (finding 424, `--seed`)

The first version demanded of a reading what `R2` demands of the recording: every job of
today's workflow, every step of every job. That is right for the recording -- a bound with
no reading is the gap `R2` refuses -- and wrong for a history, because `42131836805` ran
seven jobs and today's workflow has eight. The recorder refused it, and a rule that insists
will refuse every run from before the last structural change: adding a job silently resets
every bound's evidence to the sample of one the rule was written to remove.

So the two files answer different questions and now have different rules. The **recording**
is what CI will spend and must describe the workflow as it stands. A **seed** is evidence
about a command on a day: it is appended to the history, never to the recording, and what
did not exist then is printed rather than thrown --
`seeded run 42131836805 with 7 of 8 job(s) and 75 step(s); 1 item(s) did not exist then`.
A seed may not be newer than the recording, may not be the recording (one day entered twice
is one day weighted twice), and may not be combined with `--borrow` (borrowed seconds are not
a day anything ran).

The result is a six-run history where there had been four consecutive runs of one afternoon,
and the difference is not cosmetic: the gate immediately refused a `sensitivity` bound of 20
minutes against a seeded **633 s** day.

### Three — a deadline summed the recording rather than the slowest day (finding 425)

`R5` says a bound must expire before its job does: `bound + the steps in front of it` fits
inside the ceiling. The prefix was the recording's seconds. Under `R10` that is no longer the
right sum -- if a step may legitimately take twice its recorded time, so may everything in
front of it -- and a ceiling validated against a fast prefix is a ceiling a slow morning
overruns, after which the job dies and names no step, which is the defect step bounds exist
to remove.

Two ceilings moved and neither had been touched by this round: `verify` from 15 to **18**
(`Lint`'s 14-minute bound plus 1019 s of prefix, 164 s of which is the shell install at 153 s
rather than 9, and `Test with coverage` was the second one out at 902), and `batteries-heavy`
from 25 to **27** (the 15-minute backend-support bound plus 1532 s, which does not fit in
1500).

### Four — the bound that was under twice its own slow day (finding 426)

`Install the shells the suite cross-checks against` was bounded at 3 minutes in all five jobs
that run it, against a 9-second reading, and green for ten rounds. The history holds **153 s**
for the same command: an `apt-get update` against a slow mirror. Twice that is 306, which
does not fit in 180. It is **6** minutes everywhere now. Nothing about the step changed --
what changed is that a day exists on which it took seventeen times longer, and until this
round nothing in the tree could see that day.

### Five — a bound too wide for its own ceiling, and why narrowing beat raising (finding 427)

`sensitivity`'s bound was 25 minutes, and the seeded 633 s day still fits inside twice it.
`R5` did not: 1500 s of bound plus 180 s of prefix is **1680**, against a **1560** ceiling.
Two repairs, not equal. Raising the ceiling to 29 keeps a bound that is looser than the
evidence requires; narrowing to **22** minutes (1320 s, 2.09x) puts the deadline at 1500 s
inside a ceiling that does not move, and reports a hang seven minutes sooner. A ceiling is a
tolerance for imprecision and a bound is a claim about a command, so the claim was corrected
and the tolerance left alone.

### Six — the instrument that could not say why (finding 428)

The first CI run of this round failed the sites battery's shard 2, and what it printed was a
file, a verdict, and an instruction to re-run the file by hand. The same shard passes locally
in 2.9 minutes with 92 claims and 120 runs, so the reader had no exit code and not one line of
output to think with.

`failureSummary` is right and is not the defect: it quotes at most four lines of a failed run
and returns **nothing** when the run names no failing test, because a summary it invented
would be a sentence about a failure nobody described. The case that arrived here is the one it
cannot describe -- vitest exiting non-zero **with every test passing** when a worker's RPC
deadline expires -- so the summary was empty and the gate printed an empty detail. `outputTail`
quotes the last three lines the run did print, under `its own output ends:`, which is evidence
rather than a diagnosis; the sentence also carries the exit code now, because a red test and a
dead runner are different findings.

The other half is a hypothesis the next run tests, and it is finding 297's shape one layer out:
the battery runs four claimants at a time, each a `vitest` of its own, and every child sized
its pool from the machine -- four claimants on a four-vCPU runner ask for **sixteen** workers.
`--maxWorkers=1` costs nothing for a one-file run and removes the oversubscription by
construction.

### Seven — the instruments

The mutation set is the new rules' failure shapes, one substitution each: a tie in the
slowest-reading lookup going to the older run, a duplicate day admitted, the age check
inverted, the deadline falling back to the recorded day, an action step keying an empty
command, a seed demanding every job, a seed writing the recording, and a seed allowed to be
newer than it. Eight red. Each of those eight is a number that would have looked plausible
on the summary line, which is the same lesson this repository keeps relearning. Three more
hold the instrument's two repairs.

### Readings

> Ledger for `v3.55`.

| item | value |
| --- | --- |
| `core` test suite | **238 files, 5890 tests passed** (at v3.55) |
| `cli` test suite | **4 files, 187 tests passed** (as of this commit) |
| repo test suite | **242 files, 6077 tests passed** (at v3.55) |
| `core` suite | **238 files, 5890 tests passed**; **41** of them new this round -- 38 in `ci-readings.test.ts` (six for `--seed`), one for `outputTail`, two for the instrument's red-baseline report |
| coverage | `core` **99.96 / 99.75 / 100 / 99.96**, `cli` **100 / 100 / 100 / 100** |
| mutation | **11** substitutions, **11** red: eight on the new rules (restored green at 115 cases) and three on the instrument. The third of those **survived** on its first case -- the fixture held exactly three lines, so "the tail" and "the head" were the same three -- and the case was what needed fixing |
| failure sites | **124** across **58** of **83** scripts; throws **79** = 11 `fatal` + 60 `unguarded` + 1 `guarded` + 7 `rethrow` |
| site proofs | **189** claims across **57** files, every one driven |
| the gate's own summary | 8 jobs recorded, **61 of 82** steps bounded, 49 min measured, bounds total **301** min, **6** readings of the workflow |
| the run | `42205959904`: **8 of 8 jobs success**, **15.0** min wall clock -- batteries-heavy 15.0, batteries 11.7, build 7.7, sensitivity-shard **6.8**, sensitivity 5.3, golden master 0.8, backend 0.7, cold tree 0.3. The shard that failed the run before it passes with the same claims and the same mutants; the only change is `--maxWorkers=1` |


### Left open, in the order the goal is reached

| priority | item | state | next step |
| --- | --- | --- | --- |
| **P1** | real network shapes beyond a closed socket | unchanged | keep a reading of what the API answered on every real push |
| **P2** | the history is six runs, four of them one afternoon | seeded from `42131836805` and `42142175689` plus this round's runs | record every green run; a bound's worst day is only as good as the worst day recorded |
| **P2** | P13: a mutation is one substitution | unchanged | a second mutation, or an assertion about mutations |
| **P2** | `backend`'s 16-minute install bound has never met a slow day | unchanged, and `R10` now divides it by the 648 s cold day | the history will answer it the first time a slow mirror is recorded |
| **P3** | the shards are unbalanced by file cost, not by count | unchanged | time each claimant file once, cut where the seconds are |
| **P3** | P2 / P5 / P7 / P8 / P9 / P14 | unchanged | unchanged |

### Eight — the run, and the shard that went green

Run `42205959904` is **8 of 8 jobs success** in **15.0 minutes** of wall clock, which is
`batteries-heavy` and nothing else: batteries 11.7, build 7.7, sensitivity-shard **6.8**,
sensitivity **5.3**, golden master 0.8, backend 0.7, cold tree 0.3.

The shard is the reading that matters. It is the one that failed the previous run, and it
passes now with the same claims, the same files and the same mutations -- the only difference
being `--maxWorkers=1` on each claimant run. That is one measurement, not a proof, and it is
the measurement the hypothesis predicted: four claimants each sizing their pool from a
four-vCPU runner is sixteen workers for four files, and the file that paid was the one whose
duration is a single synchronous block. Nothing about the battery's own arithmetic changed.

The four bounds this round moved all survived their first real day: `sensitivity` at 22
minutes against a 5.3-minute job, `batteries-heavy` at 27 against 15.0, `verify` at 18 against
7.7, and the shell install at 6 minutes in all five jobs. None of them was close, which is
what a bound sized from the slowest recorded day rather than from the last one looks like on
an ordinary day.

**The lesson, for the round after this one.** A rule that divides by a number should say
which number, and the file that holds the numbers should be able to grow backwards. Both
halves were needed: `R10` without `--seed` would have divided by an afternoon, and `--seed`
without `R10` would have recorded days nothing read. The next round's version of this
question is the one on the open list -- a margin is a claim about the *next* day, and no
maximum over recorded days can make it. Six runs is six runs.

## v3.56 — the channel that carried every push left no reading of what it answered

v3.55 closed with a sentence about a maximum taken over a sample of one, and the round after
it found the same shape one layer out. Every repair to the publishing channel since v3.51 was
argued from a single afternoon: finding 412's closed socket, v3.51's `500` with an empty body
that cleared on the next attempt, v3.53's base64 body refused with `400 malformed request` and
accepted as `utf-8`. Three sentences, all true, none of them a measurement -- the channel
printed a plan and one verdict, and the twenty to forty requests underneath them left nothing.

The open list's first entry had said what to do since v3.53: *keep a reading of what the API
answered on every real push.* This round is that file, the recorder that writes it, and the
reader that refuses it when it stops describing a transport.

### One — the verdict and the plan, and nothing about the requests (finding 429)

A push is not a unit the API sees. The unit is one request, and all three failures above
arrived on one of them. So the row is one **attempt**: `at`, `method`, `path`, `attempt`,
`status`, `ms`, `sent`, `received`, and `remaining` when the API reports a rate limit.

`at` is the attempt's start rather than its end, because that is the order the requests were
made in and the reader checks the file for exactly that. `sent` is the JSON body's byte length,
which is the number v3.53's defect was about. `received` is the response text's length, so a
`500` with an empty body (v3.51) is distinguishable from a `500` that explained itself.

### Two — the error field is the one the retry already reads (finding 430)

`fetch` answers a closed socket by throwing, so there is no status to record. The row keeps
`status: null` and an `error` beside it, and the two are the halves of one fact: the reader
refuses a row that has both, and refuses one that has neither, because an attempt that neither
answered nor failed is not a thing that happens. `null` is required rather than permitted as an
absence -- a writer that forgot the field would otherwise look the same as a request that got
no answer.

The error's `code` is read from `failureCode`, extracted from `isNetworkFailure` in this round
so that one function serves both. Two expressions reading the same event would be two
instruments disagreeing about one failure, which is finding 428's shape one file over: a row
that named `UND_ERR_SOCKET` on an attempt the retry did not consider would be the record
contradicting the decision it exists to explain.

`remaining` is written only when `x-ratelimit-remaining` is present. A synthetic `0` would read
as an exhausted quota on a server that never mentioned one, and that is the number an operator
acts on.

### Three — the reader, and the one inference it makes (finding 431)

`scripts/publish-readings.mjs` holds the rules and `scripts/publish-readings-cli.mjs` holds the
exit, the same pair `publish.mjs` and `publish-cli.mjs` make: a gate is proved by being emptied,
so a test may not import one. The rules check shape, order and continuity, and the third is the
only place they infer anything -- a row that says `attempt: 3` must follow attempt 2 of the same
request, because a missing row makes the retry count a number the file cannot defend.

What they cannot check is stated in the module rather than left to look like more than it is: a
row that says `201` on an attempt that actually got `500` passes every one of them, and only
the process that made the request knows otherwise.

The file is required. A gate that skipped the comparison when the history was absent would
print `OK` about a question it had not asked -- the silence `R10` removed from the budget one
round earlier, in a different subject.

### Four — the inventory published `OK` as the diagnostic of a refusal

The first derivation attributed the new gate's failure site to the nearest `console.log` above
its exit, and that line was `publish-readings: OK (...)` -- the passing sentence, recorded as
the diagnostic of the failing branch. `process.exit(main(...))` is what makes that possible: a
computed exit whose diagnostic lives inside the function it calls, which the deriver cannot
follow.

The repair is `check-open-list.mjs`'s shape, a literal `process.exit(1)` below the failure's
own sentence, and the shape is worth naming because it reads tidy and publishes a lie. The same
round removed a `catch` in `publish-cli.mjs` that only re-raised: nothing could reach it, and
the row it left in the inventory claimed a forward that no test ever took.

### Five — the push, and the two rows finding 412 was written for

The first push that carried this round needed 25 requests for one commit of 611 files. Two of
them are the reason the file exists:

```
POST /git/blobs  attempt 1  status null      28 385 ms  sent 63 102  UND_ERR_SOCKET
POST /git/blobs  attempt 2  status null      10 289 ms  sent 63 102  UND_ERR_SOCKET
POST /git/blobs  attempt 3  status 201        1 343 ms  sent 63 102
```

Three facts, none of which any earlier round could have stated. The failure is **not** an
immediate refusal: the first attempt hung for twenty-eight seconds before the socket closed,
so the channel's elapsed time would have read as "a slow upload" and not as "a broken
connection" -- which is exactly the confusion `--max-time` and the elapsed-time diagnostic were
added for. The retry carried the push: without finding 412's rule, the second row would not
exist and the third would never have been made. And the third attempt took 1 343 ms for the
same bytes, which is the measurement that says the failure was the connection rather than the
body.

Two rows out of twenty-five, and they are worth more than every prose description of the
incident in this volume.

### Readings

> Ledger for `v3.56`.

| item | value |
| --- | --- |
| `core` test suite | **239 files, 5931 tests passed** (as of this commit) |
| `cli` test suite | **4 files, 187 tests passed** (as of this commit) |
| repo test suite | **243 files, 6118 tests passed** (as of this commit) |
| new tests | **41** in `publish-readings.test.ts`: 17 on the shape rules, 5 on the summary, 4 on appending, 7 on what the transport hands the recorder, 5 on the reader a gate runs, 3 on the command line |
| coverage | `core` and `cli` unchanged in the dimensions the gate measures; `scripts/` is outside the coverage ceiling by construction -- its drivers are the site proofs |
| mutation | **10** substitutions, **10** red: an unanswered attempt not recorded, every row claiming attempt 1, a row with neither status nor error accepted, a retry not following its own first attempt, an append that replaces, a rate limit invented as zero, a retry counted as a row, `--record` allowed on a transport that makes no request, an unreadable file reported as empty, and a file that cannot be read saying nothing about why |
| failure sites | **126** across **59** of **84** scripts; throws **81** = 11 `fatal` + 62 `unguarded` + 1 `guarded` + 7 `rethrow` |
| site proofs | **193** claims across **58** files, every one driven |
| the history | `golden-master/publish-readings.json`: **36 rows** after the two pushes that carried this commit -- 34 answered, **2 unanswered**, 2 retried, slowest `POST /git/blobs` **28 385 ms**. The file lags the push that carries it by one, by construction: the rows for a push are written after it lands |
| the push | 25 request(s) for one commit of 611 file(s): **17** changed, **0** removed, one `POST /git/blobs` of 63 102 bytes that closed twice -- **28 385 ms** then **10 289 ms** -- and was accepted on the third attempt in **1 343 ms**. The retry that finding 412 added is what carried the push, and the two rows that say so are the ones no earlier round could have produced |


### Left open, in the order the goal is reached

| priority | item | state | next step |
| --- | --- | --- | --- |
| **P2** | the history is six runs, four of them one afternoon | unchanged | record every green run; a bound's worst day is only as good as the worst day recorded |
| **P2** | P13: a mutation is one substitution | unchanged | a second mutation, or an assertion about mutations |
| **P2** | `backend`'s 16-minute install bound has never met a slow day | unchanged, and `R10` divides it by the 648 s cold day | the history will answer it the first time a slow mirror is recorded |
| **P3** | the shards are unbalanced by file cost, not by count | unchanged | time each claimant file once, cut where the seconds are |
| **P3** | P2 / P5 / P7 / P8 / P9 / P14 | unchanged | unchanged |

**The lesson, for the round after this one.** A reading is only a reading if something reads
it, and the file that holds it must be written by the thing it describes. This round had to add
a recorder to the transport, a file to the tree, and a gate to the document check before any of
the three was worth having -- and the first version of the gate published its own `OK` line as
the reason it refused. The next question this channel will have to answer is not in this file:
it is whether a *push* can be told apart from the requests that carried it, and the rows have
no field for that yet.
