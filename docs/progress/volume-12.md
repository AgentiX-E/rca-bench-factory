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
| `cli` test suite | **4 files, 187 tests passed** (at v3.55) |
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

### Six — the red that arrived two runs later, and the local pass that was not a refutation

The second CI run failed `Test with coverage` on `sensitivity-shards.test.ts`:
`expected [ …(193) ] to deeply equal [ …(183) ]`. Four calls, seconds apart, one inventory --
the unsharded `--list` printed 183 claim lines and the two sharded ones printed 193 between
them (finding 432).

The mechanism that fits is a discarded tail: the gate writes one line per claim to a pipe and
then calls `process.exit(0)`, and a pipe is asynchronous, so whatever is still buffered dies
with the process. The test of it was a **2 000-claim** plan -- 160 KB, past any pipe buffer --
and on this machine the count came back **whole**. That was written up as "the candidate is
excluded", which was a conclusion drawn from one machine's scheduler.

The next CI run ran the same case and answered **171 of 2 000**. So the candidate was right and
the local pass was not a refutation of it: it was a reading about a machine that happens to
drain the pipe faster than the process exits. The case that was written to *prove* the tail
would be lost is the case that lost it, one environment over -- and the environment that can
produce the shape is the one the workflow runs on.

The repair is one line of intent: `writeFileSync(1, plan)` -- the same bytes down the same
descriptor, with the caller waiting. A program about to exit owes its reader a flushed pipe, and
`console.log` in a loop has never owed anybody that.

Two lessons, and the second is the uncomfortable one. A test that holds a real invariant (the
shards tile the inventory) can still be green for the wrong reason, and the wrongness only shows
on the day something moves the file -- which is why the shard case now reads a trimmed copy of
fifty sites and asserts `50`. And a local pass on a timing hypothesis is a statement about local
timing: the only machine that could falsify it was the one that had already failed.

### Readings

> Ledger for `v3.56`.

| item | value |
| --- | --- |
| `core` test suite | **239 files, 5932 tests passed** (at v3.56) |
| `cli` test suite | **4 files, 187 tests passed** (at v3.56) |
| repo test suite | **243 files, 6119 tests passed** (at v3.56) |
| new tests | **42**: 41 in `publish-readings.test.ts` (17 on the shape rules, 5 on the summary, 4 on appending, 7 on what the transport hands the recorder, 5 on the reader a gate runs, 3 on the command line) and one in `verify-sites-are-sensitive.test.ts` -- a 2 000-claim plan, which is the case that excluded a lost stdout tail |
| coverage | `core` and `cli` unchanged in the dimensions the gate measures; `scripts/` is outside the coverage ceiling by construction -- its drivers are the site proofs |
| mutation | **10** substitutions, **10** red: an unanswered attempt not recorded, every row claiming attempt 1, a row with neither status nor error accepted, a retry not following its own first attempt, an append that replaces, a rate limit invented as zero, a retry counted as a row, `--record` allowed on a transport that makes no request, an unreadable file reported as empty, and a file that cannot be read saying nothing about why |
| failure sites | **126** across **59** of **84** scripts; throws **81** = 11 `fatal` + 62 `unguarded` + 1 `guarded` + 7 `rethrow` |
| site proofs | **193** claims across **58** files, every one driven |
| the history | `golden-master/publish-readings.json`: **65 rows** across the four pushes that carried this round -- 62 answered, **3 unanswered**, 3 retried, slowest `POST /git/blobs` **29 632 ms**. Every unanswered row is the same shape: a blob upload that hangs for twenty to thirty seconds and then closes, accepted on the next attempt in about a second |
| the runs | `42235367331` **8 of 8** (15.5 min) on the first commit; `42240087797` **red** on the shard case (183 / 193); `42248353576` **red** on the 2 000-claim case (171 / 2 000); `42255697807` **8 of 8** (14.8 min) with the plan flushed. The last one is the reading that settles the pair: the case that lost its tail on CI now returns all 2 000 |
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

## v3.57 — the file was five pushes deep and the reader could not count

v3.56 closed on the question it could not answer: a row says what one request did, and nothing
in the file says which push the request belonged to. The open list held the same gap twice, and
in two different words -- one entry said the history *begins at v3.56* and is **one round
deep**, the other said a push cannot be told from the requests that carried it.

They were one defect seen from two sides, and the first thing the repair did was contradict the
first entry. The file did not hold one push. It held **five**, written the same afternoon, and
nobody could say so because the unit they would have been counted in did not exist.

### One — an entry that described the file as shallower than it was (finding 433)

Five pushes, partitioned by the only rule that survived contact with the rows:

| push | rows | retried | unanswered | slowest request |
| --- | --- | --- | --- | --- |
| 1 | 3 | 0 | 0 | `GET /git/trees/ed3b1c254…` 5 044 ms |
| 2 | 25 | 2 | 2 | `POST /git/blobs` **28 385 ms** |
| 3 | 8 | 0 | 0 | `POST /git/blobs` 2 120 ms |
| 4 | 16 | 0 | 0 | `POST /git/blobs` 2 211 ms |
| 5 | 13 | 1 | 1 | `POST /git/blobs` **29 632 ms** |

The last two columns are the reason the unit had to exist. The slowest request of push 3 is
**2 120 ms** and of push 5 is **29 632 ms** -- a factor of fourteen, in one file, on one
afternoon, over one branch. A per-file average of 8 000 ms describes a channel no single push
ever met, which is `R10`'s finding (*a maximum taken over a sample of one*) arriving in the
subject that was written to fix a different one.

Push 1 is worth its own sentence. It is three reads and no writes: `--dry-run`. The file counts
it as a push because it made three requests, and the honest name for the unit is therefore a
**publish attempt** rather than a push -- a dry run is an attempt that created nothing, and it
is exactly the attempt whose latency a reader would otherwise have to guess at.

### Two — the boundary is a row, not a gap (finding 434)

The rows carry timestamps, so the obvious partition is a threshold: two requests more than *N*
milliseconds apart begin different pushes. The gaps in this file are 2 299 s, **30 s**, 1 875 s,
3 183 s, 2 781 s and **32 s** -- and the two short ones are inside a push, not between two: each
is the backoff before the retry of a blob upload that hung and closed.

A 20-second threshold answers **seven** pushes. A 60-second threshold answers **five**, which is
right, and right by luck: any threshold between 32 s and 1 875 s gives the true partition, and
the true partition is the one the head reads give. The 30-second retry gap is the refutation of
the whole approach -- the channel has already spent 28 seconds hanging on one socket, so a push
whose slowest request takes longer than the threshold is a push the threshold would cut in
half. A number that is right by accident is the shape `R10` was written about, so the boundary
had to come from the channel's own behaviour instead.

It does. `publish()` asks the remote for the branch before it decides anything, so the first
request of every attempt is `GET /git/ref/heads/<branch>`, and that row is where one attempt
ends and the next begins. The reader enforces it in both directions: an attempt that begins with
anything else is refused, and an attempt that reads the branch a *second* time is refused too --
because that is exactly what two attempts stored as one look like. A file of five attempts now
either states its boundary or fails its own gate.

`rev` is the commit the attempt carried, and it is `null` for all five: the rows never named a
tip, and a reader that filled one in would be inventing the fact it exists to report. The
summary prints `0 with a named tip`, so the gap is a number in the gate's own output and stays
one until the attempts that carry real tips replace it.

### Three — the exemption a rule has to carry (finding 435)

The second-read rule's first version refused this, and it is a legitimate attempt:

```
GET /git/ref/heads/main   attempt 1  status 500
GET /git/ref/heads/main   attempt 2  status 200
```

A `500` on the branch read is retried by the rule v3.51 added, so a channel that behaves
correctly produces the shape the new rule called a defect. The case asserting it was written
before the rule was, so the rule was caught in the minute after it was written -- which is the
argument for writing the case first, in the smallest possible form.

There are exactly two reasons this channel reads a branch twice, and neither is a hole:
`updateRef` answers a `422` by re-reading the branch to say what the remote moved to, and a
`500`/closed socket on the read itself is retried. Both are exempt -- the `422` by looking for
the refused `PATCH` above the read, the retry by `attempt > 1`, since a folded attempt always
begins at attempt 1 of its own read.

### Four — the writer refuses what the reader would have to

`appendReadings` now refuses an attempt with no rows, and `publish-cli` writes none when no
request was made. The reader refuses the same shape one function up, and the writer needs its
own copy for the reason every boundary does: a file holding an empty attempt passes its own gate
and states that the channel made a request it never made. A revision that does not resolve is
caught before the first request, so the only paths that reach the writer with rows are paths
that reached the API.

The tip is resolved *after* the attempt, in the `finally` that also writes the rows, so a
failure halfway through a push still names the commit it was trying to publish.

### Five — the instruments

Thirteen substitutions, one per claim, each run against the case that states it: the boundary
rule, the empty-attempt refusal, the SHA shape, the missing-`rev` refusal, the cross-attempt
order, the second-read rule, per-attempt retry continuity, the named-tip count, the per-attempt
lines, the append refusal, the flat-list refusal, the revision the channel records, and the
attempt that made no request. **13 of 13 red at the named case, and the tree restored green.**

The open list's `P13` (*a mutation is one substitution*) got measured instead of restated: every
**pair** of those thirteen substitutions was applied and restored together. **78 pairs, 78 red,
0 survived.** That is not a closure -- it is a statement about the thirteen substitutions this
battery has, not about the space of double edits -- but the entry no longer rests on a
suspicion.

### Six — the push, and the first attempt that names itself

The push that carried this round is attempt 6, and it is the first one whose `rev` is not
`null`:

```
push 6/6 master rev=e23e9e352: 25 request(s), 0 retried, 0 unanswered; slowest POST /git/blobs 1790 ms
```

Three commits, 611 files per tree, and **no retry and no unanswered attempt**. The two
attempts that did have them (2 and 5, same channel, same branch, same afternoon) each spent
28-29 seconds on one blob before the socket closed. The comparison is the first the file can
make that the anecdote could not: the same work, on the same day, over the same branch, is
**1 790 ms** when the connection holds -- so the twenty-eight seconds were the connection and
not the body, which v3.56 could only argue from a retry that succeeded in 1 343 ms.

It is also the reading that closes the question this round was opened for: the file says how
many attempts it holds, which of them named a tip, and what each one cost.

### Readings

> Ledger for `v3.57`.

| item | value |
| --- | --- |
| `core` test suite | **239 files, 5954 tests passed** (at v3.57) |
| `cli` test suite | **4 files, 187 tests passed** (at v3.57) |
| repo test suite | **243 files, 6141 tests passed** (at v3.57) |
| new tests | **22** in `publish-readings.test.ts` (41 → 63): 5 on the file of attempts, 6 on one attempt, 5 on the row inside it, **8 on the boundary** -- a missing first read, a first read of another branch, a first read at attempt 2, a retry of that read accepted, two attempts folded into one, the `422` exemption, an out-of-order attempt, two attempts back to back -- and one each on the named-tip count, the per-attempt lines and the empty-append refusal |
| coverage | `core` **99.96 / 99.75 / 100 / 99.96** (statements / branches / functions / lines), `cli` **100 / 100 / 100 / 100**: both unchanged, because the subject is `scripts/` and its drivers are the site proofs |
| mutation | **13** substitutions, **13** red at the named case, tree restored green: the boundary rule, the empty-attempt refusal, the SHA shape, the missing-`rev` refusal, cross-attempt order, the second-read rule, per-attempt retry continuity, the named-tip count, the per-attempt lines, the append refusal, the flat-list refusal, the revision the channel records, the attempt that made no request |
| mutation, pairwise | **78** two-edit mutants -- every pair of the thirteen -- **78 red, 0 survived**, tree restored green |
| failure sites | **126** across **59** of **85** scripts; throws **82** = 11 `fatal` + 63 `unguarded` + 1 `guarded` + 7 `rethrow` |
| site proofs | **193** claims across **58** files, every one driven |
| the history | `golden-master/publish-readings.json`: **90 rows** in **6 attempts** -- 3 / 25 / 8 / 16 / 13 / 25 -- 87 answered, **3 unanswered**, 3 retried. Slowest request per attempt: 5 044 / **28 385** / 2 120 / 2 211 / **29 632** / 1 790 ms. The first five carry `rev: null`; the sixth is `e23e9e352`, and the file prints `1 with a named tip` |
| the runs | `42269783832` **8 of 8** (15.5 min) on the first push of the round, with no red and no rerun: `build / typecheck / lint / coverage / mutation` 8 min, the two injection batteries 12 and 15 min, shard 1 of the sensitivity battery 5 min and shard 2 4 min |
| the boundary | the five migrated attempts begin at rows 0, 3, 28, 36 and 52, which are the five `GET /git/ref/heads/master` rows. The gaps at 30 s and 32 s are retries inside attempts 2 and 5, not boundaries: a 20-second threshold would have answered seven |



### Left open, in the order the goal is reached

| priority | item | state | next step |
| --- | --- | --- | --- |
| **P2** | the five attempts recorded before v3.57 name no tip, and the file is one attempt behind | **new**, and stated by the gate itself: `1 with a named tip` of 6 | every attempt from this round on carries its commit; the lag is structural, because an attempt appends its rows after it has moved the ref |
| **P2** | the history is six runs, four of them one afternoon | unchanged | record every green run; a bound's worst day is only as good as the worst day recorded |
| **P2** | P13: a mutation is one substitution | **measured**: 78 pairs of this round's thirteen, 78 red | a pair composing two changes neither of which is in the battery; or a mutation of the assertion |
| **P2** | a wrong `--branch` is read as an unborn branch | unchanged | refuse a `null` base on a non-empty repository unless `--new-branch` |
| **P2** | `backend`'s 16-minute install bound has never met a slow day | unchanged | the history will answer it the first time a slow mirror is recorded |
| **P3** | the shards are unbalanced by file cost, not by count | unchanged | time each claimant file once, cut where the seconds are |
| **P3** | P2 / P5 / P7 / P8 / P9 / P14 | unchanged | unchanged |

**The lesson, for the round after this one.** The open list said the file was one round deep and
it was five; the entry was not wrong about the rows, it was written about a file in which depth
was not a computable number. An instrument that cannot be counted gets described by its size, and
the description then reads as a measurement. The same shape as `R10`, one subject out: a maximum
over a sample of one, a depth over a unit that did not exist.

What is left is not another field. It is the lag that the field makes visible: an attempt writes
its rows after it has moved the ref, so the file that records a push is always one push behind
it, and the only way to close that is to record from the far side of the publish -- which is the
next question this channel has to answer, and the first one whose answer cannot come from inside
the push it describes.

## v3.58 — a `404` that meant two things, and a branch that could not be created

The open list's P2 was a sentence about a typo: *a mistyped `--branch` reads as an unborn
branch*. It was two defects, and only one of them was about typos.

### 一、A status that answers for two worlds (finding 436)

`head()` turns a `404` into `null` and `publish()` read `null` as *unborn*. A branch read answers
`404` in two different worlds -- one where the branch has never been created, one where its name
is misspelt -- and the plan is identical for both: replay the whole ancestry as a chain of new
commits. Only the write can tell them apart, and by then every blob is uploaded.

Measured once by hand, against this repository: `--branch main` where the branch is `master`.
The plan was "publish the whole history onto nothing". The merge refusal stopped it, and only
because the two histories had diverged -- on a linear history the same command creates `main`,
leaves `master` untouched, and exits with the code of a successful push.

The repair asks the one question that separates the two: **what does the repository hold?** The
listing is asked for only when the branch read answered `404`, so an ordinary push pays nothing
for a question it does not ask -- asserted by the shape of a normal push's requests, not by a
count. Four answers, four meanings:

| the listing answers | the channel reads it as |
| --- | --- |
| an empty list | the branch is unborn; replaying the history is the only thing a push can mean |
| any ref | the branch is **absent** -- a name that is wrong, not a branch that is new -- refused unless `--new-branch` |
| `409` | the API's other way of saying there is nothing to list, so the same fact as the empty list |
| `403`, or a body that is not a list | forwarded, because a listing this channel could not read is not a repository without refs |

The refusal names what it found, five names then a count, with branches and tags told apart: a
repository holding one tag and no branch is one where no push has ever landed, and "1 ref" would
leave the operator to guess which.

### 二、A branch cannot be moved into existence (finding 437)

With the decision made, `--new-branch` had to be honest. It was not. `updateRef` issued
`PATCH /git/refs/heads/<branch>`, which updates a reference that must already exist; on an absent
branch the API answers `422`, the code re-read the branch, and the push ended with:

```
the branch moved while the plan was being executed: it was null and is undefined.
Nothing was forced — re-read the branch and plan again
```

A sentence about a branch that never moved, carrying `undefined`, printed after every blob of a
history that was never going to be published had crossed the wire. Everything the real channel
could do with an unborn branch was build it, upload it, refuse it, and describe the refusal
wrongly -- while the local transport did the whole thing, because `git update-ref` creates what
is not there.

The repair is `POST /git/refs`, the call the API has for the state, and its own `422` -- the name
was taken while the commits were being made -- gets its own sentence. That sentence is built
**without** re-reading the branch, and the moved-ref refusal beside it does re-read, because the
two know different things: a SHA can be compared against what the branch is now and both halves
printed, while `null` says only that the branch was absent. A second read would also be a second
branch read inside one push, which the readings gate refuses without an exemption it would then
have to grow -- so the shape of the reading file decided the shape of the sentence.

### 三、The stand-in was kinder than the API (finding 438)

The unborn path had an end-to-end proof and it was green, because the server that stands where
the API stands created the branch on a `PATCH`: it passed `expected: null` to `local.updateRef`,
`git update-ref` created the ref, and the fixture answered `200` to a request the API answers
`422`. The suite's only proof of *publishes a whole history onto a branch that does not exist
yet* was a proof of a call that cannot work, and the leaf that made it green was the fixture's
permissiveness.

That is the failure mode of a stand-in written from the same reading of the API as the code: it
fails in the direction of yes, and the two agree about a world that does not exist. The repair is
two branches of the fixture -- a `PATCH` whose ref is absent answers `422`, a `POST /git/refs`
creates it -- and the order was kept: with the repaired fixture the old code fails the case and
the new one passes, which is the only order in which the case is worth having.

### 四、The survivor the battery reported (finding 439)

Eighteen substitutions, seventeen red at the named case and **one survivor**: `<=` replaced by
`<` in the sentence's cut. The case had two examples, three names and seven, chosen because they
are *short* and *long* -- the two categories a reader can name -- and the code does not branch on
those, it branches on a number. Three and seven answer identically under either comparison; the
one length that differs is five.

So the survivor was a statement about the case rather than about the code, which is what a
survivor always is. Two more examples -- exactly five and exactly six -- and the same
substitution dies. `R10`'s shape one subject out: a threshold described by two points chosen away
from it.

### Readings

> Ledger for `v3.58`.

| item | value |
| --- | --- |
| `core` test suite | **239 files, 5970 tests passed** (at v3.58) |
| `cli` test suite | **4 files, 187 tests passed** (at v3.58) |
| repo test suite | **243 files, 6157 tests passed** (at v3.58) |
| new tests | **16**: 3 on the sentence a refusal names refs with, 4 on the plan-level refusal (a mistyped branch, `--new-branch`, a branch that appeared, and a push that does not ask), 5 on the transport's shape (`404`+listing, `409`, `403` on the listing, a body that is not a list, a name taken first), 1 on the creation forwarding a status that is not its own, 2 on the command line, and 1 on the readings reader accepting the listing row |
| coverage | `core` **99.96 / 99.75 / 100 / 99.96**, `cli` **100 / 100 / 100 / 100** -- unchanged, because the subject is `scripts/` and its drivers are the site proofs |
| mutation | **18** substitutions; first pass **17 red at the named case, 1 survivor** (the boundary of the cut, finding 439); after two cases at exactly five and six, **18 of 18 red**, tree restored green |
| failure sites | **126** across **59** of **85** scripts; throws **87** = 11 `fatal` + 66 `unguarded` + 1 `guarded` + 9 `rethrow` |
| site proofs | **199** claims across **58** files, every one reached by the file that names it |
| the history | `golden-master/publish-readings.json`: **6 attempts**, 90 rows. This round's push is attempt 7 and carries no `/git/refs` row, because `master` exists -- the absence is the reading |

### Left open, in the order the goal is reached

| priority | item | state | next step |
| --- | --- | --- | --- |
| **P2** | the creation path has no real push behind it | **new**: `POST /git/refs` is proved by the suite's server and by the local transport | the first real push that creates a branch; until then the claim is about two stand-ins |
| **P2** | the listing is one page of a hundred | **new**: the decision needs one ref, the sentence needs five names | a repository with more than a hundred refs, and a `Link` header walk if a refusal ever has to name one past the page |
| **P2** | `--new-branch` says nothing when the branch does exist | **new**: the flag permits an absent base and does not require one | decide whether the flag should also refuse an existing branch, or be named for what it permits |
| **P2** | the five attempts recorded before v3.57 name no tip, and the file is one attempt behind | unchanged, and stated by the gate itself | every attempt from v3.57 on carries its commit; the lag is structural |
| **P2** | the history is six runs, four of them one afternoon | unchanged | record every green run |
| **P2** | P13: a mutation is one substitution | measured once: 78 pairs, 78 red | a pair composing two changes neither of which is in the battery |
| **P2** | `backend`'s install bound has never met a slow day | unchanged | the history answers it the first time a slow mirror is recorded |
| **P3** | the shards are unbalanced by file cost | unchanged | time each claimant file once, cut where the seconds are |

**The lesson, for the round after this one.** The entry this round closed had been carried for two
volumes as a sentence about a typo, and the typo was the smaller half: the same `404` that a
mistyped name produces is the one a first push produces, so a channel that cannot tell them apart
is one that cannot create a branch either. Two defects shared one status, and the list named only
the embarrassing one.

The other half is about the instrument. A stand-in that is written from the same reading of the
API as the code will fail in the direction of yes, and a green end-to-end case against it proves
that two files agree. What makes it a proof is the case the old code fails -- which means the
fixture has to be repaired *before* the code, and the repair has to be argued from the API rather
than from what the code needs to pass.

## v3.59 — the assertion that could not hold, and the sentence that named a cause it had not measured

The open list's P2s were about the creation path. This round did not start with them: it started
with a line the channel has printed after every push for months -- *"the tip's tree is the local
one and its SHA is not (the history it hangs on is not the local history)"* -- and asked the only
question that line had never been asked, which is whether it was true.

### 一、Two hundred and forty-six commits, and the two explanations that died

Walking the remote's `master` and the local `HEAD` and pairing them by subject is one loop over
two lists. It answers with numbers: of 483 commits on the remote, **236 share a name with the
local one and 247 do not**, and the newest commit that still shares a name is **246 commits back**.
So `identical` -- the flag the suite's strongest assertion is built on -- has been false for two
hundred and forty-six commits, and the CLI has said so every time in a sentence that reads like an
exception.

Two causes were plausible enough to name, and both were measured instead. A commit message's
trailing newline is the one byte `git log --format=%B` already destroys, and `git commit -m`
always writes it, so the API might be dropping it. And every commit in this repository carries
`+0800`, which the API might normalise to UTC. The measurement is one request per hypothesis:
create a commit through `POST /git/commits` with the exact fields, then hash every candidate byte
string with `git hash-object -t commit` and compare **the SHA the API returned** with each
candidate's. Four message shapes -- none, one newline, two, and a space then a newline -- each
matched the candidate containing the bytes that were sent, to the byte. The `+0800` candidate
matched the returned SHA exactly. The API keeps both, and two explanations cost two requests to
kill.

What is left is the parent line. `git cat-file -p` of the local commit and of its rebuilt twin
differ on one line: `parent cf6c575b…` against `parent dc9af862…`. A name is a hash over bytes
that include the parents' names, so the plan grounded on a twin renames everything above it. The
sentence was not wrong. It was an account of a cause that nothing in the repository had checked,
which is indistinguishable, to a reader, from a rebuild that lost a file.

### 二、The prediction, and the three things a rebuild can be

`predictRebuild` is the measurement the sentence was missing. It takes the local commit object as
git stores it, replaces its `parent` lines in order with the names the remote will use, and hashes
the result. A rebuilt commit then stands in exactly one of three relations to its original: the
same commit; the same commit with its parents renamed; or neither -- and only the third refuses.
The verdict is computed per commit as the plan executes, and a `differs` stops the push before the
ref moves, with a sentence that names what it can prove: the tree, the message, both identities and
the parent count are the ones that left.

Two properties make it a proof rather than a second opinion. It is its own oracle: given a commit's
own parents it returns that commit's name, because it is reconstructing the very bytes git hashed,
and the case that asserts the round trip includes the one commit shape with two parent lines -- a
merge -- so a rewrite that used the first parent twice dies there rather than surviving every
linear case. And it is held against an oracle it shares no line with: `git commit-tree` builds an
object from a tree, a parent, a message and two dates, and its output name is the answer.

### 三、Said before the first request, not after the last

A push whose base is a twin will rename its commits whatever it does; that is arithmetic, not a
decision. What is a decision is when the operator finds out. The plan announces it before the
first write -- and therefore in a dry run, which is the only place it can change what somebody
does -- and the result carries `identity: { state: 'parents', commits: n, base: 'tree' }`. The
command line prints the surviving bytes and the renamed names in that order, because that is the
order in which they matter: the tree, the message and both identities are local; the SHA cannot
be, and no push can rename the remote's past.

### 四、Two columns that could only hold `(n, 0)` and `(0, n)`

The first version of the verdict counted the exact commits and the renamed ones. The battery's
eleventh substitution -- `exact += 1` to `exact += 2` -- **survived**, and the reason was not a
gap in the cases: a push above a twin renames all of its commits, a push onto the same commit
renames none, so the pair could only ever be `(n, 0)` or `(0, n)`. Two columns shaped like
measurements that restated the state and the length. They are gone; `commits` states the one
number that can hold a third value.

The same battery found the redundancy one layer up. `identical`, the identity state and the
sentence were three independent re-derivations of `published.commit === tip`, while the per-commit
verdict that had already answered the question was used only to choose a log line -- so a
substitution of the verdict survived, because nothing a caller reads depended on it. The return
value now reads the tip's verdict once.

### 五、Eight proofs dropped by an edit in the middle of a file

Adding one `throw` in the middle of `publish.mjs` moved every line below it, and re-deriving
`golden-master/gate-sites.json` reported `throw annotations: 79 of 87 carried, 8 dropped`. The
eight were six `rethrow error` statements and two identical refusals: their fingerprints collide,
so the carry had nothing left but the line, and the line had moved. The gate then asked for eight
proofs that already existed -- in the file whose header says the fingerprint exists so that an edit
above a site does not lose the annotation. The accident had survived one degree down, in the
fallback.

The rule added is about what a fingerprint can carry: when every prior carrier of one fingerprint
holds the same annotation, the annotation belongs to the fingerprint and not to a coordinate, and
carrying it is not a guess. When two carriers disagree -- one proved, one exempt for its own
reason -- no rule can choose, and the site keeps nothing. Both halves are cases; the second one
already was.

### 六、A stand-in less kind than the API

`differs` is unreachable against an API that keeps what it is sent. A branch no case can reach is a
sentence that has never been printed, so the server that stands where the API stands is given one
behaviour it does not have: drop the message's final newline. The push must then refuse, naming the
commit -- and the case is labelled as a counterfactual, because finding 440's probe measured four
message shapes and the API stored every one. What it buys is the difference between a verdict that
is computed and one that is asserted, and in the battery the substitution that removes the refusal
turns it red.

### 七、第一次对着真实 API 的判决

The push is **attempt 8**, and it is the first one in this repository's history whose report is a
measurement rather than an explanation.

The announcement fired on the real channel before the first upload:

> `the remote's tip 4ec0623a3 carries the tree of 958b23782 and is not that commit: this plan hangs
> on the remote's names, so the commits above it will differ from the local ones in their parent
> lines and in nothing else`

and both commits came back as **`the same commit, hanging on the remote's name for its parent`**.
The prediction -- written from the local object's own bytes, against an API that had never been
asked the question -- held on the first attempt, which is the difference between a claim about two
stand-ins and a claim about the channel. The closing sentence then named both halves: the tree, the
message and both identities are the local ones; the names cannot be, and no push can rename the
remote's past.

24 requests, none retried, slowest `POST /git/blobs` 2 382 ms -- and CI **8 of 8 green on the
first push**, no rerun.

### 八、收尾那一脚踩空的地方，正好是清单自己说它看不见的

The close-out push -- two documentation lines and a readings file, no code -- came back red on
`Test with coverage`, at `publishing to a repository through the local transport > carries a
deletion and a mode change`, `Test timed out in 5000ms` (5 293 ms), with every other test in the
run passing. The same tree had been green an hour earlier, so what failed was not a decision the
diff made; it was the default being spent one test at a time.

`timeout-budget.test.ts` exists for this shape and says of itself that it *checks every row it has
and cannot discover a row it does not*. `publish.test.ts` was not a row: measured, it costs
**6.95 s** standalone (worst of three), so it had been running past the 5 000 ms default on every
green run. The repair is the table's own prescription -- the budget on the **suite**, five suites
at `30 000` ms, five times the worst reading and the same number the other rows carry -- and the
row's `measured` sentence now carries the CI run that found it. The push that carried the repair was
8 of 8 green. Finding 445.

### Readings

> Ledger for `v3.59`.

| item | value |
| --- | --- |
| `core` test suite | **239 files, 5978 tests passed** (at v3.59) |
| `cli` test suite | **4 files, 187 tests passed** (at v3.59) |
| repo test suite | **243 files, 6165 tests passed** (at v3.59) |
| new tests | **8**: 4 on the prediction (the round trip over a history with a merge, the `commit-tree` oracle, a parent count the commit does not have, a parent that is not a name), 2 on the twin (the verdict and the report of what survived, the announcement before the first request), 1 on the refusal of a lost byte, and 1 on the carry of a shared fingerprint |
| coverage | `core` **99.96 / 99.75 / 100 / 99.96**, `cli` **100 / 100 / 100 / 100** -- unchanged, because the subject is `scripts/` and its drivers are the site proofs |
| mutation | **21** substitutions; first pass **17 red, 3 survivors, 1 inert**; the survivors were two redundant columns and a sentence the case asserted only half of, the inert one a `from` that had moved; after the repair **21 of 21 red, 0 inert**, tree restored green |
| failure sites | **126** across **59** of **85** scripts; throws **89** = 11 `fatal` + 68 `unguarded` + 1 `guarded` + 9 `rethrow` |
| site proofs | **199** claims across **58** files, every one reached by the file that names it |
| the history | `golden-master/publish-readings.json`: **10 attempts**, 163 rows. Attempt 8 carried the round (24 requests, 0 retried, slowest `POST /git/blobs` 2 382 ms) and its verdict is the first computed one; attempt 9 carried the reading of it (8 requests, alone on a docs-only tree); attempt 10 carried the timeout repair (12 requests, 0 retried) and was **8 of 8 green**, the coverage job at 9.8 of its 18-minute budget |

### Left open, in the order the goal is reached

| priority | item | state | next step |
| --- | --- | --- | --- |
| **P1** | the remote's history shares no name with the local one above a boundary 246 commits old | **new**: measured, announced, and refused when a rebuild loses a byte | nothing converges it without rewriting the remote, which this channel refuses by design; the claim is now the isomorphism, and this entry stays open until the contract and the code agree on a name for it |
| **P2** | the creation path has no real push behind it | unchanged: `POST /git/refs` is proved by two stand-ins | the first real push that creates a branch; until then the claim is about two stand-ins |
| **P2** | a new branch replays the whole history even when the remote already holds the commit | **new**: the pointer path was designed and deferred to keep this round to one subject | `holds(sha)` on the transport and a single `POST /git/refs`, then the real creation push above becomes affordable |
| **P2** | the listing is one page of a hundred | unchanged | a repository with more than a hundred refs |
| **P2** | `--new-branch` says nothing when the branch does exist | unchanged | decide whether the flag should refuse an existing branch, or be named for what it permits |
| **P2** | the five attempts recorded before v3.57 name no tip, and the file is one attempt behind | unchanged, and stated by the gate itself | every attempt from v3.57 on carries its commit; the lag is structural |
| **P2** | P13: a mutation is one substitution | measured once: 78 pairs, 78 red | a pair composing two changes neither of which is in the battery |
| **P2** | `backend`'s install bound has never met a slow day | unchanged | the history answers it the first time a slow mirror is recorded |
| **P3** | the shards are unbalanced by file cost | unchanged | time each claimant file once, cut where the seconds are |

**The lesson, for the round after this one.** The channel had been reporting a fact and a cause in
one sentence, and only the fact was measured. That is the shape of every sentence in this
repository that begins *because*: a conjunction of a number somebody read and a reason somebody
believed, and the reader cannot tell which half is which. Two hypotheses died to two requests
each, and the surviving explanation was one `diff` away from the first one anybody would have run.

The other half is about redundancy. Three substitutions survived in one battery, and two of them
described the same defect: a column that cannot hold a second value, and a fact derived three
times from the same comparison. A survivor is a statement about the case, but a survivor that
cannot be killed by any case is a statement about the code.

## v3.60 — the flag that was read as permission, and the request a history was paying for

The left-open list had two entries that pointed at the same place: the creation path had never
met a real push, and a new branch replayed the whole history even when the remote already held
the commit. Both are about the one path in the channel that had never been paid for, and this
round went there. It found a defect one step earlier than either entry named.

### 一、A flag with two halves, and the channel asked one of them

`--new-branch` exists to exempt a `404` on the branch read from the refusal that a missing
branch on a repository with refs earns. That is a permission, and it was implemented as one:
the flag is consulted only inside `if (remote.head === null && !newBranch)`. What the same word
also says -- *this branch does not exist* -- was never read. A push passing the flag onto a
branch that **is** there published onto it, exactly as a plain push would.

The channel had, one call earlier, read the branch and learned that it exists. It then moved
the branch its author had just said they were creating, and on a linear history nothing
afterwards is wrong: the ref moves, the push reports success, and the branch that was meant to
be untouched carries somebody else's commits. This is v3.58's shape one layer up -- one status
answering for two states, then one flag carrying two statements -- and the repair is the same:
the two halves are one statement, so a false one is refused, and the refusal names the commit
it was found at, because that is the fact the caller was wrong about. Finding 446.

### 二、A commit is closed, so one question decides the whole push

`locateBase` compares the remote with the local ancestry, and an absent branch has nothing to
compare: `remote.head` is `null`, so the window was set to the entire ancestry and every commit
in it was rebuilt. That is right about content -- the remote has none of it -- and wrong about
cost whenever the objects are already there, which is the ordinary case for a branch made from
an existing one: **509 commits and their blobs, rebuilt to publish one reference**.

The question the path never asked is whether the remote already holds the tip. It settles the
whole push, and it is one request, because a commit is closed -- a remote cannot hold a commit
without holding its tree, its parents and every ancestor. So `200` on `GET /git/commits/<tip>`
means the history arrived with it and the push is one `POST /git/refs`. `holds(sha)` is that
question: the endpoint on the real channel, `cat-file -e <sha>^{commit}` on the local one -- the
peel matters, because a blob the remote happens to hold is not an answer to it, and the case
that checks it asks about a blob the remote does hold and expects `false`.

It is asked **only** where the branch read answered `404`, so the ordinary push pays nothing,
and only after the name-is-wrong refusal, so a typo is still refused before a commit is named.
Finding 447.

### 三、An empty plan that is a complete instruction

`planPublish` refuses an empty window: *"a plan with no commits would move a ref to where it
already is; publish nothing instead"*. A pointer push is the case that refusal's premise does
not cover -- the ref does not exist yet, so naming a commit that is there is a change, and it
is the only change the push makes. `pointerPlan` is that plan: no steps, and the tree it
publishes.

Three sentences follow from it, and each is the difference between a number and its meaning.
The plan's log line says *the remote already holds `<sha>`: naming it is the whole push, and no
commit is created*, and it says why the gate's tree is that tree -- a commit's bytes contain it,
so the assertion the rebuild path has to make after the fact is here an identity. A dry run
prints *nothing would be built; one request would create the branch*, because *"0 commit(s)
would be published"* is true of that plan and tells the reader the opposite of what would
happen. And the result is a third identity state, `held`, with `commits: 0` and no base: there
was no window, so there was nothing to locate.

`--no-gate` now announces itself for the same reason. A guard that is bypassed is a fact the
transcript owes its reader, and this round's real creation push uses it for a state in which the
receipt rule has nothing to say: the tree is already on the remote, so nothing is being published.

### 四、One status, two states, at the creation

`422` on `POST /git/refs` means the name was taken while the push was being made, **or** that
the commit the ref was to name is not there after all -- and the pointer path makes the second
reachable for the first time, since the question answered `200` a moment before and a remote is
free to collect an unreachable object in between. The sentence named the first state only, and
said *"while the commits were being created"*, which on a pointer push is work that never
happened. Both states are named now: the channel cannot tell them apart without a second read it
refuses to make, and a sentence that names one state and is sometimes wrong about it is worse
than one that names two. Finding 448.

### 五、Two stand-ins that could not express the question

The new question needed a `404`, and neither fixture could produce one.

The readings stand-in answered every route it did not know with `201 {sha: 'ccc…'}`. That is a
success for a question nobody had declared, and it became load-bearing the moment the channel
asked `GET /git/commits/<sha>`: `holds` read the `201` as *the remote has this commit*, and the
creation path created a branch naming a commit the stand-in did not hold -- so two readings cases
failed for a reason that had nothing to do with the channel. The catch-all answers `404` now, and
the three routes it had been silently covering are explicit.

The other fixture was believed to withhold objects and did not. `stage()` clones, and a clone
carries **every** object the source can reach, so *"none for the ones above it"* described a
fidelity the fixture never had: every case that said the blobs have to be uploaded had the blobs
already in the remote's store. The channel's end-to-end claim survives -- a wrong byte hashes to
a different blob and the last assertion compares trees -- but the fixture could not express the
state this round is about. `staged(name, upto)` pushes exactly the history it is given, so a
commit above `upto` is absent from the object store and `upto: null` is a repository with no refs
at all; the two cases that had been passing on a clone were moved onto it, where they now publish
something. Finding 449.

### 六、The boundary, asked as objects instead of as sentences

v3.59's boundary was measured by pairing two logs by **subject**: 236 of 483 commits shared a
name. A subject is a string two different commits can carry, so that number counted sentences
that looked alike. `holds` gives one answer per commit, so the same boundary was re-measured
object by object -- **509** local commits asked one at a time:

| question | answer |
| --- | --- |
| commits the remote holds by name | **237** |
| commits it does not | **272** |
| newest shared commit | `041ca04d1`, **272 commits back** |
| oldest missing | the very next commit in the local log |
| is the shared set a suffix? | **yes** -- the oldest 237 and nothing above them |

The suffix is what the pairing could not establish: the rename above the boundary is **total**,
every commit before it arrived byte-identical, and no commit above it ever did. And the boundary
is a moving point with a fixed coordinate -- it went from 246 to 272 while the local history went
from 483 to 509, so the 26 commits these rounds added are exactly the 26 the boundary moved by.
That is the arithmetic of a rename that never stops, and it is why the contract is isomorphism
rather than equality. Finding 450.

### 七、第一次创建的推送：三次请求，和一个活了十四秒的 ref

The entry that had been on the list since v3.58 -- *the creation path has no real push behind
it* -- is closed. Attempt 12 is the first push in this repository's history that created a
branch, and it is also the first one whose path was chosen by a measurement:

> `the remote already holds 041ca04d1: naming it is the whole push, and no commit is created --
> the tree this gate blessed is that commit's own tree, because a commit's bytes contain it`

> `v3.60-pointer is at 041ca04d1196baf030546e019a6f1ef70bbf41a5, which is the local commit, byte
> for byte, and the remote already held it: this push created the name and rebuilt nothing`

**Three requests, none retried, none unanswered** (`GET /git/ref/heads/v3.60-pointer` → `404`,
`GET /git/commits/041ca04d1` → `200`, `POST /git/refs` → `201`), against a replay that would have
been 509 commits and their blobs. The branch was then read back with an independent request,
outside the ledger because it is not a push: `refs/heads/v3.60-pointer` names exactly
`041ca04d1`, so the `201` is not the only evidence.

The branch names a commit **272 commits old**, and that is not a choice: it is the newest commit
the two histories agree on. A pointer push can only name a commit the local repository has and the
remote holds, and on this repository that set is the oldest 237 -- so the first real creation this
channel ever made had to hang off the far side of the rename boundary. The measurement of §六 and
the artifact of §七 are the same fact, read two ways.

The slowest request of the round is that `POST /git/refs`: **13 997 ms** for a call that carries
no object at all. A budget argued from "a ref write is cheap" would be wrong by an order of
magnitude, and this is the record that says so.

### 八、电池：一处锚点，和一次诚实的中止

Eleven substitutions on the new rules, each one edit, each restored in a `finally`. The first pass
reported **10 red and 1 SKIP**: the anchor for the `cat-file` mutation had been written against
`['cat-file', …]` while the argument list begins `['-C', remote, 'cat-file', …]`. The battery
reports an anchor that does not match as a skip rather than as a survivor, which is the difference
between "nothing holds this rule" and "this line was never asked", and the distinction is why the
skip is printed with the count it found. With the anchor corrected the second pass is **11 of 11
red, 0 survivors, 0 inert**.

The substitutions are the round's claims in the negative: the creation path replaying what it was
asked not to, a `404` read as a commit the remote holds, `--new-branch` ceasing to be a claim, a
pointer push reporting a commit it did not carry, a dry run creating the branch, `identical` going
false, the object store asked about an object rather than a commit, the not-held line dropped, the
command line reporting a pointer push as a verified rebuild, an empty plan called nothing to
publish, and the creation refusal naming one state where it carries two.

### Readings

> Ledger for `v3.60`.

| item | value |
| --- | --- |
| `core` test suite | **239 files, 5988 tests passed** (at v3.60) |
| `cli` test suite | **4 files, 187 tests passed** (at v3.60) |
| repo test suite | **243 files, 6175 tests passed** (at v3.60) |
| new tests | **10**: the pointer path 5 (the creation that builds nothing, the replay when the remote does not hold it, the flag refused for an existing branch, `holds` answering about a blob the store holds, the three requests and no object), the questions read from the stand-in 3 (a dry run of the pointer path, a `403` on the question forwarded, the two states of the creation's `422`), and the command line 2 (`--no-gate` announcing itself, an empty plan described as a name rather than no commits) |
| coverage | `core` **99.96 / 99.75 / 100 / 99.96**, `cli` **100 / 100 / 100 / 100** -- unchanged, because the subject is `scripts/` and its drivers are the site proofs |
| mutation | **11** substitutions; first pass **10 red, 1 skipped, 0 survivors** -- the skip was an anchor written against the wrong element of an argument list, corrected and re-run: **11 of 11 red, 0 survivors, 0 inert**, tree restored |
| failure sites | **126** across **59** of **85** scripts; throws **91** = 11 `fatal` + 69 `unguarded` + 1 `guarded` + 10 `rethrow` -- two new, both proved by `publish.test.ts` |
| site proofs | **203** proved sites across **66** test files (`verify-site-proofs.mjs --list`) |
| the boundary, asked as objects | **509** local commits asked one at a time, **237** held by name, **272** not; the shared set is exactly the oldest 237; newest shared `041ca04d1`, 272 back |
| the history | `golden-master/publish-readings.json`: **12 attempts**, 175 rows. Attempt 12 is the first creation path ever executed against the real API -- 3 requests, 0 retried, slowest `POST /git/refs` 13 997 ms -- and it built no object at all |

### Left open, in the order the goal is reached

| priority | item | state | next step |
| --- | --- | --- | --- |
| **P1** | the remote's history shares no name with the local one above a boundary 272 commits old | **refined**: the boundary is now measured as objects rather than as paired subjects, and it is a suffix -- 237 held, 272 not | nothing converges it without rewriting the remote, which this channel refuses by design; the contract is isomorphism, and it stays open until code and contract use one name for it |
| **P2** | the pointer path asks the gate for a receipt it does not need | **new**: a push that publishes no content cannot publish an unblessed tree, and today it says so by bypassing the rule with `--no-gate` | decide whether the gate should be asked after `holds` for this path -- the order "refuse before spending a request" is what keeps it where it is |
| **P2** | an empty repository still costs the question | **new**: `refs()` already answered that the repository holds nothing, which is also the answer to "does it hold this commit" | one request saved on every first push, at the price of trusting a listing that a repository with unreachable objects would not answer |
| **P2** | the listing is one page of a hundred | unchanged | a repository with more than a hundred refs |
| **P2** | P13: a mutation is one substitution | measured once: 78 pairs, 78 red | a pair composing two changes neither of which is in the battery |
| **P2** | `backend`'s install bound has never met a slow day | unchanged | the history answers it the first time a slow mirror is recorded |
| **P2** | the five attempts recorded before v3.57 name no tip, and the file is one attempt behind | unchanged, and stated by the gate itself | every attempt from v3.57 on carries its commit; the lag is structural |
| **P3** | the shards are unbalanced by file cost | unchanged | time each claimant file once, cut where the seconds are |
| **P3** | `volume-11.md` is at 178 746 of 200 000 bytes | **new**: measured by `check-progress-volumes` | the next round opens `volume-12.md`, which is the rule the check already enforces |

**The lesson, for the round after this one.** Two entries had sat on this list for two rounds
because both were described as missing *evidence* -- no real push, no cheaper path -- and neither
was. The first thing the round did was read the flag that guards the path, and the defect was in
the half of it nobody had read: a permission that also asserts something, honoured for the half
that lets the push proceed. One word, two statements, one of them false.

The other half is about what a fixture can say. Two stand-ins had to be repaired before the new
question could be asked at all, and both were repaired in the same direction: a fixture that
answers a question nobody declared, and a fixture that was believed to withhold objects it had
copied. A stand-in is a claim about the world, and an unexamined one is a claim the suite is
making on nobody's authority.
## v3.61 — a page called "the repository", and a rule that had nothing to say

v3.60's left-open list had three items that were all about the same habit: a claim written down
where nobody could contradict it. A listing read one page and was described as the repository; a
question was asked whose answer had just arrived; a gate was described as silent while it was
speaking. This round went at all three, and the mutation battery found a fourth rule with no test
behind it at all.

### 一、一页不是仓库

`refs()` 请求 `GET /git/refs?per_page=100`，把回来的东西当成"这个仓库的每一个 ref"，注释也这么写。API 是分页的。一个有 140 个分支的仓库因此答 100，而建立在这份列表上的那句拒绝——用来分辨"分支名写错了"和"分支是新的"的那句——印出了 **"it holds 100 branch(es)"**：一个读者有权据以行动的数字，差了四十，出现在一句全部目的就是说明仓库里有什么的句子里。

拒绝本身只需要"存在一个 ref"，所以这个计数对决策从来不是承重的——但它对**句子**是承重的，而句子正是人读的那部分。页走法是唯一一处"满"与"末"是两个事实的地方：100 既是页大小，也是"恰好有一百个 ref 的仓库"的大小，所以显而易见的实现（页不满就停）仍然要比显而易见的读法多问一次；一个在满页停下的走法，对在这里结束的仓库和没在这里结束的仓库都报 100。

走法在十页处封顶，因为它跑在一句拒绝里面，而拒绝不是读一千个分支的理由。碰到上界时句子说 **"at least"**：把读过的页数当成仓库持有的 ref 数印出来，正是这条走法要修的缺陷；把一个上界当成事实，只是同一个错误换了个更小的数字。

`refs()` 现在答 `{ names, complete }`，因为句子无法分辨"数完了"与"停在半路"，除非 transport 告诉它是哪一种。本地 transport 无条件答 `complete: true`——目录列举没有页大小——这是同一个接口的诚实形式，不是一个特例。

### 二、上一个答案已经答过的问题

创建路径在决定要不要重放历史之前会问 `holds(tip)`。在一个空仓库上，通道在**一次调用之前**刚读过列表，刚被告知"一个 ref 都没有"——然后还是问了：*远端持不持有这个提交？* 一个没有 ref 的仓库无法用任何名字提供某个提交，所以这个问题有已知答案，而这次请求在每一次首推上都没买到任何东西。

这件事的修法不是"列表为空就跳过这个问题"这种成本优化。它是：两个答案说的是不同的东西，而只有一个是关于对象库的——空列表是关于**名字**的陈述，而它所能许可的那条捷径，会是一个关于"没有任何名字可达的那个提交"的主张，在一个对象按构造即不可达、因而可被回收的仓库里。所以通道选了保守的那一侧，并且说出来：

> `the remote holds no refs, so there is no name a shortcut could carry: this push replays the history and the question about the tip is not asked`

接下来的重放无论对象库里有什么都是正确的。省下的是一次请求，位置在"列表已经付过账"的那条路径上——这也是为什么普通推送（分支存在）仍然什么都不问。

这句话还必须挤掉另一句。落到下面那个分支会打印 *"the remote does not hold `<sha>`: this push will build the commits that lead to it"*，那是一句关于对象库的断言；一条从没看过对象库的路径会把它印在"我没看过"之后。有一条用例断言这句话**不出现**，因为一条说了两件事的日志，不会因为第一件是真的就变得诚实。

### 三、那个"无话可说"的规则，说在第一次请求之前

v3.60 用自己的句子收尾了它唯一一次真实创建推送：`--no-gate` 被描述成对*"回执规则无话可说的状态"*是诚实的——树已经在远端了，什么都没被发布。

规则有话可说，而且已经说了：门禁跑的是 `requireReceipt({ tree: tipTree })`，位置在**读远端之前**。所以指针推送和别的推送一样被门禁覆盖——过线的是一个引用，而引用让它可达的是一棵树。绕过是真实发生的；解释是错的，而差别很重要，因为读者正是靠那句解释判断这次绕过是否安全。

套件里没有任何东西能抓住那句话，因为没有用例把门禁和指针路径放在一起：`stage()` 造的仓库没有 `scripts/verify-local.mjs`，于是 `requireReceipt` 答 `absent`，指针用例全都穿过了一道不存在的门。新增的用例造一个带门禁、且远端已持有 tip 的仓库，一次断言三件事——拒绝、分支**没有**被创建、执行器**零次** transport 调用——因为顺序就是主张本身：一道在 `GET /git/ref/heads/<branch>` 之后才开火的门，已经在问"这棵树有没有被祝福"之前先知道了远端的一件事。

v3.60 的那次推送保持原样：一个在被误述的绕过之下创建的分支。改变的是，那句误述现在是一条有测量的、且有一条会反驳它的用例的事实。

### 四、两个页、一把 key，和一个答不了"页"的替身

`publish.test.ts` 的 HTTP 替身记录的是 `key = method + pathname`，把 query 丢了。于是 `/git/refs` 的每一页都是同一把 key——即使通道真的走了一趟，用例也看不出来：记录会说"两次"是"一次"。key 现在带上 query，这也正是读数账本记的形状（`/git/refs?per_page=100`），于是一趟页走法在两份账里是同一个样子。

路由也答不了"页"——它对每个请求都回整份列表。这是 finding 449 的形状，同一个文件，四轮之后又来一次：一个替身回答了没人声明过的问题。它现在尊重 `per_page` 与 `page`，`refsCount` 伪造一个给定大小的仓库，于是一趟页走法可以在一台没有一百四十个分支的机器上被检验。

第一页的 `409` 也拿到了它的对照：`refsStatusAfter` 让第一页之后的页答一个给定状态码——这就是"第一页之后的 `409` 不是空仓库"这条规则变得可测的方式，而在那之前**不可测**：一个把它读成空仓库的变异（M10）活过了整个文件。

### 五、mutation 电池：一个存活，一个跳过

十处替换，第一次跑出 **8 红、1 存活、1 跳过**，而两个非红都是这一轮真正的收获：

- **M10 存活**：把"页 1 之后的 `409`"改成"任何页的 `409` 都读成空仓库"，整个文件仍然全绿。规则在代码里，注释在代码里，测试里没有。补的用例让替身在第二页答 `409`，并把"`-> 409` 被转发"与"分支未被创建"一起断言。
- **M8 跳过**：锚点写成八空格缩进，而那一行在 `if` 里面是四空格。电池把"锚点没匹配上"报成 skip 而不是 survivor，并打印它找到的命中数（0）——"没有东西守住这条规则"与"这一行根本没被问过"是两种失败。

改正锚点、补上用例之后：**10/10 变红、0 存活、0 惰性**。

### 六、一次真实的创建推送，带对象

v3.60 的遗留表上有一条：*"在 tip 上创建分支且必须上传对象"这条路径从未被真实付过账*。这一轮的第一件事是把它付掉——顺序不是随意的。远端 `master` 的 tip 是本地上一个提交的**改名孪生**（同一棵树、不同名字），所以在它上面创建分支会被"同一个提交改父名"的判决拒绝；而如果先推 `master`，新 tip 的树就到远端了，创建推送又会被"远端已经带有这棵树却不是你"的拒绝挡住。

于是顺序是：先创建 `v3.61-tip`（远端还没有这一轮的提交，窗口只有 1 个提交），再推 `master`。第一次真实创建带着对象、带着门禁、带着一个合法回执。

### Readings

> Ledger for `v3.61`.

| item | value |
| --- | --- |
| `core` test suite | **239 files, 5996 tests passed** (as of this commit) |
| `cli` test suite | **4 files, 187 tests passed** (as of this commit) |
| repo test suite | **243 files, 6183 tests passed** (as of this commit) |
| new tests | **8**: the page walk 4 (a hundred and forty refs, exactly a hundred, fourteen hundred, one short page), a `409` on a later page 1, an empty listing that answers the tip question 1, a gated pointer push 1, and the lower-bound sentence 1 |
| coverage | `core` **99.96 / 99.75 / 100 / 99.96**, `cli` **100 / 100 / 100 / 100** -- unchanged, because the subject is `scripts/` and its drivers are the site proofs |
| mutation | **10** substitutions; first pass **8 red, 1 survivor, 1 skipped** -- the survivor was a rule with no test (a `409` on a later page read as "no refs") and the skip an anchor written with the wrong indentation. Both repaired: **10 of 10 red, 0 survivors, 0 inert**, tree restored |
| failure sites | **126** across **59** of **85** scripts; throws **91** = 11 `fatal` + 69 `unguarded` + 1 `guarded` + 10 `rethrow`, and **91 of 91** carried annotations |
| site proofs | **203** proved sites across **66** test files (`verify-site-proofs.mjs --list`) |

The two pushes this round made are described in the next commit, which is also where their rows
enter `golden-master/publish-readings.json`: a push cannot record itself inside itself.

### Left open, in the order the goal is reached

| priority | item | state | next step |
| --- | --- | --- | --- |
| **P1** | the remote's history shares no name with the local one above a boundary 272 commits old | unchanged since v3.60, and re-measured by every creation push | nothing converges it without rewriting the remote, which this channel refuses by design; the contract is isomorphism |
| **P2** | a bounded ref count is a floor, not a count | **new**: the walk stops at ten pages and says "at least" | a repository with more than a thousand refs, if one ever exists here |
| **P2** | the pointer path asks for a receipt it may not have | **decided**: the gate runs before the wire, so the pointer path is gated; v3.60's sentence was wrong, not the code | nothing, until a push wants to name a tree this repository never verified |
| **P2** | P13: a mutation is one substitution | measured once: 78 pairs, 78 red | a pair composing two changes neither of which is in the battery |
| **P2** | `backend`'s install bound has never met a slow day | unchanged | the history answers it the first time a slow mirror is recorded |
| **P2** | the five attempts recorded before v3.57 name no tip, and the file is one attempt behind | unchanged, and stated by the gate itself | every attempt from v3.57 on carries its commit; the lag is structural |
| **P3** | the shards are unbalanced by file cost | unchanged | time each claimant file once, cut where the seconds are |

**The lesson, for the round after this one.** Three items on the list were described as missing
*behaviour* and were, in fact, missing *sentences*: a page was never called a page, a bypass was
never described as a bypass, and a log line was allowed to claim something the path had not
looked at. The fourth was found by the battery rather than by reading, and it was the only one
that could change a push's outcome: reading a `409` on a later page as "no refs" would publish a
whole history onto a name that is wrong, and nothing in the suite had a second page to say so.

A stand-in that answers a question nobody declared has now been found twice, four rounds apart,
in the same file. The rule that keeps producing these is worth stating once: **a fixture is a
claim about the world, and a claim nobody has contradicted is not the same as a true one.** The
day a fixture starts answering a new question is the day its old answers become load-bearing.
