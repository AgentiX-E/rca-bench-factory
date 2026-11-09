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

### One — A status that answers for two worlds (finding 436)

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

### Two — A branch cannot be moved into existence (finding 437)

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

### Three — The stand-in was kinder than the API (finding 438)

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

### Four — The survivor the battery reported (finding 439)

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

### One — Two hundred and forty-six commits, and the two explanations that died

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

### Two — The prediction, and the three things a rebuild can be

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

### Three — Said before the first request, not after the last

A push whose base is a twin will rename its commits whatever it does; that is arithmetic, not a
decision. What is a decision is when the operator finds out. The plan announces it before the
first write -- and therefore in a dry run, which is the only place it can change what somebody
does -- and the result carries `identity: { state: 'parents', commits: n, base: 'tree' }`. The
command line prints the surviving bytes and the renamed names in that order, because that is the
order in which they matter: the tree, the message and both identities are local; the SHA cannot
be, and no push can rename the remote's past.

### Four — Two columns that could only hold `(n, 0)` and `(0, n)`

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

### Five — Eight proofs dropped by an edit in the middle of a file

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

### Six — A stand-in less kind than the API

`differs` is unreachable against an API that keeps what it is sent. A branch no case can reach is a
sentence that has never been printed, so the server that stands where the API stands is given one
behaviour it does not have: drop the message's final newline. The push must then refuse, naming the
commit -- and the case is labelled as a counterfactual, because finding 440's probe measured four
message shapes and the API stored every one. What it buys is the difference between a verdict that
is computed and one that is asserted, and in the battery the substitution that removes the refusal
turns it red.

### Seven — the first verdict taken against the real API

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

### Eight — the last step landed on nothing, exactly where the list says it cannot look

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

### One — A flag with two halves, and the channel asked one of them

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

### Two — A commit is closed, so one question decides the whole push

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

### Three — An empty plan that is a complete instruction

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

### Four — One status, two states, at the creation

`422` on `POST /git/refs` means the name was taken while the push was being made, **or** that
the commit the ref was to name is not there after all -- and the pointer path makes the second
reachable for the first time, since the question answered `200` a moment before and a remote is
free to collect an unreachable object in between. The sentence named the first state only, and
said *"while the commits were being created"*, which on a pointer push is work that never
happened. Both states are named now: the channel cannot tell them apart without a second read it
refuses to make, and a sentence that names one state and is sometimes wrong about it is worse
than one that names two. Finding 448.

### Five — Two stand-ins that could not express the question

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

### Six — The boundary, asked as objects instead of as sentences

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

### Seven — the first creation push: three requests, and a ref that lived fourteen seconds

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

### Eight — the battery: one anchor, and one honest stop

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
| site proofs | **203** proved sites across **58** test files (`verify-site-proofs.mjs --list`) |
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

### One — a page is not a repository

`refs()` asked for `GET /git/refs?per_page=100` and treated what came back as "every ref this
repository holds", which is what its comment said too. The API pages. A repository with a hundred
and forty branches therefore answered a hundred, and the refusal built on that list -- the one that
separates "the name is wrong" from "the name is new" -- printed **"it holds 100 branch(es)"**: a
number a reader may act on, short by forty, in a sentence whose only purpose is to say what the
repository has.

The decision never depended on the count, because the refusal needs one ref to exist. The **sentence**
did, and the sentence is the part a person reads. A page walk is the one place where "full" and
"last" are two facts: 100 is both the page size and the size of a repository with exactly a hundred
refs, so the obvious implementation -- stop at a page that is not full -- still has to ask one more
time than the obvious reading, and a walk that stopped on a full page would answer 100 for the
repository that ends there and for the one that does not.

The walk stops at ten pages, because it runs inside a refusal and a refusal is not a reason to read
a thousand branches. When it reaches that bound the sentence says **"at least"**: printing the pages
it read as the number the repository holds is the defect the walk exists to fix, and printing a
bound as a count is the same defect with a smaller number.

`refs()` answers `{ names, tips, complete }` now, because a sentence cannot tell "counted" from
"stopped counting" unless the transport says which it did. The local transport answers
`complete: true` unconditionally -- a directory listing has no page size -- which is the honest form
of the same interface rather than a special case. The cost is unchanged: a repository whose first
page is short, which is every repository this channel has pushed to, still asks once, and the cases
assert the exact request list rather than a count.

### Two — a question whose answer had already arrived

The creation path asks `holds(tip)` before deciding whether to replay history. On an empty
repository it had just read the listing **one call earlier** and had been told there is not one ref
-- and then asked anyway: *does the remote hold this commit?* A repository with no refs cannot offer
a commit under any name, so the question had a known answer, and the request bought nothing on every
first push.

The repair is not a cost optimisation of the "skip the question when the list is empty" kind. It is
that the two answers say different things and only one of them is about the object store: an empty
listing is a statement about **names**, and the shortcut it licenses would be a claim about a commit
no name can reach, in a repository where such objects are unreachable by construction and therefore
collectable. So the channel took the conservative side, and said so:

> `the remote holds no refs, so there is no name a shortcut could carry: this push replays the
> history and the question about the tip is not asked`

The replay that follows is correct whatever the object store holds. The request saved sits on the
path where the listing has already been paid for, which is also why an ordinary push -- one onto a
branch that exists -- still asks nothing.

That sentence also had to displace another one. Falling through to the next branch prints *"the
remote does not hold `<sha>`: this push will build the commits that lead to it"*, which is an
assertion about the object store, and a path that never looked at the object store would print it
after saying it had not looked. One case asserts the sentence **does not appear**, because a log
that says two things is not made honest by the first one being true.

### Three — the rule that had "nothing to say", said before the first request

v3.60 closed its only real creation push with a sentence that described `--no-gate` as honest about
*"a receipt rule that had nothing to say"*: the tree was already on the remote and nothing was
published.

The rule had something to say and had already said it: the gate runs `requireReceipt({ tree:
tipTree })`, and it runs **before the remote is read**. A pointer push is covered like any other,
because what crosses the wire is a reference and what a reference makes reachable is a tree. The
bypass happened; the explanation was wrong, and the difference matters, because that explanation is
what a reader uses to decide whether the bypass was safe.

Nothing in the suite could catch the sentence, because no case put the gate and the pointer path
together: the repositories `stage()` builds have no `scripts/verify-local.mjs`, so `requireReceipt`
answers `absent` and every pointer case walked through a gate that was not there. The new case
builds a repository that has a gate and a remote that already holds the tip, and asserts three things
at once -- the refusal, that the branch was **not** created, and that the executor made **zero**
transport calls -- because the order is the claim: a gate that fires after
`GET /git/ref/heads/<branch>` already knows something about the remote before it asks whether this
tree was blessed.

### Four — two pages, one key, and a stand-in that could not answer about pages

The HTTP stand-in in `publish.test.ts` recorded `key = method + pathname` and dropped the query, so
every page of `/git/refs` shared one key: even if the channel had walked, the record would have said
twice was once. The key carries the query now, which is also the shape the readings ledger records
(`/git/refs?per_page=100&page=1`), so one walk looks the same in both accounts.

The route could not answer about pages either -- it returned the whole list for every request. That
is finding 449's shape, in the same file, four rounds later: a stand-in answering a question nobody
declared. It now honours `per_page` and `page`, and `refsCount` forges a repository of a given size,
so a walk can be examined on a machine that does not have a hundred and forty branches.

The `409` on the first page got its control too: `refsStatusAfter` makes pages after the first answer
a given status, which is how "a `409` after the first page is not an empty repository" became
testable. Before that it was **not**: a mutation that read a `409` on any page as an empty repository
(M10) survived the whole file.

### Five — a stand-in is a claim about the world

Both halves of this round's fixture work are the same statement from two directions. One stand-in
answered a route nobody had declared, in the direction of "yes"; the other held objects it had copied
rather than withheld, in the direction of "already there". Neither is caught by reading the stand-in,
and both are caught the moment a stand-in starts answering a question it was never asked about.

### Six — the first real creation push, carrying objects

v3.60 left one item on the list: *the path that creates a branch at a tip and must upload objects has
never been paid for*. The round's first act was to pay it, and the order is not arbitrary. The
remote's `master` tip is a **twin** of the local commit one below the head -- the same tree under a
different name -- so creating a branch at it is refused by the "same commit, renamed parent" verdict;
and if `master` were pushed first, the new tip's tree would be on the remote and the creation would
be stopped by the refusal that says the remote already carries this tree without being this commit.

So the order is: create `v3.61-tip` first, while the remote still has nothing from this round and the
window is one commit, and push `master` after it. The first real creation carried objects, a gate and
a receipt that covers it -- and it failed the first time, which is the next section.

### Seven — two pushes: one refused by its own plan, one that created the branch with objects

The item had been on the list for four rounds, and the round settled it by **failing** at it first:

> `publish failed: 50a8ce30c has 2 parents, and a replayed commit is published on one: a merge carries a history in its second parent that the remote would not receive, so the SHA it receives would not be the SHA that was written`

Two requests and its own plan refused it (`GET /git/ref/heads/v3.61-tip` -> `404`,
`GET /git/commits/3a943836c` -> `404`), with no object written. That is finding 455's evidence: not
slow, impossible.

Once the base was chosen from the remote's tips rather than from the branch it does not have, the
same command succeeded:

> `v3.61-tip is at faa9bdb2fac5f4c8b5f1d2df3d1418202b122aae: the tree, the message and both identities are the local ones, and the SHA is not, because every one of the 3 commit(s) this push carried hangs on the remote's name for its parent`

**Thirty-five requests, nothing retried, nothing unanswered**, against a push that replays the whole
history -- 509 commits and their blobs in this repository. Taken apart it is the round's whole
argument:

| request | count | why |
| --- | --- | --- |
| `GET /git/ref/heads/v3.61-tip` | 1 | `404` -- the branch does not exist |
| `GET /git/commits/3a943836c` | 1 | `404` -- the remote does not hold this commit, so no shortcut |
| `GET /git/refs?per_page=100&page=1` | 1 | a repository with refs may have a base |
| `GET /git/commits/<three tips>` | 3 | three branch tips are not local commits (renamed twins), one read each |
| `GET /git/trees/b02eaf356...` | 1 | the chosen base's tree listing |
| `POST /git/blobs` | 21 | the real content of three commits |
| `POST /git/trees` / `commits` | 3 / 3 | three commits, with their trees |
| `POST /git/refs` | 1 | **created**, not moved |

`master` followed (attempt 16, 31 requests): the same window, the same three `parents` verdicts, one
`PATCH`. The two pushes shared their blobs because the second faced the same history.

The branch points at `faa9bdb2f` and its tree is **`546b38da`** -- the tree `verify:local` opened a
receipt for; its parent is `8de78aadc`, the remote's name for the commit below. So **the tree the
gate measured is the tree the remote now serves**, and that is not inferred from a log: it is
contained in the branch's bytes.

### Eight — the battery: one survivor, two skips, and then all red

Fifteen substitutions. The history is the part worth keeping:

- First pass: **8 red, 1 survivor, 1 skipped**. The survivor was **M10** -- read a `409` on any page
  as an empty repository -- a rule in the code and in the comments with no test behind it. The skip
  was **M8**, an anchor written with eight spaces of indentation where the line inside the `if` has
  four; the battery reported it as a skip and printed its hit count (0).
- With the case added and the anchor corrected: **13 of 13**. But `const base = null` (M11, the
  negation of the whole base search) was still in it, and it **forced finding 455**: it made "create a
  branch above a merge" fail, and the first real push met the same wall.
- After the base and the twin cases were added, five anchors had gone stale and were refreshed.
  Final: **15 of 15 red, 0 survivors, 0 inert**.

What the battery caught this round was not "the tests are not strict enough". It was **a rule with no
test** and **a world described by anchors that had moved**: the first would publish a whole history
onto a wrong name, and the second would keep the battery quiet exactly when it was needed.

### Readings

> Ledger for `v3.61`.

| item | value |
| --- | --- |
| `core` test suite | **239 files, 6001 tests passed** (at v3.61) |
| `cli` test suite | **4 files, 187 tests passed** (at v3.61) |
| repo test suite | **243 files, 6188 tests passed** (at v3.61) |
| new tests | **13**: the page walk 4 (a hundred and forty refs, exactly a hundred, fourteen hundred, one short page), a `409` on a later page 1, an empty listing that answers the tip question 1, a gated pointer push 1, the lower-bound sentence 1, and the creation base 4 (the nearest of two tips, a merge below the base, the same push onto nothing refused, an empty repository that still replays everything, and a branch created at a tip the remote holds under another name) |
| coverage | `core` **99.96 / 99.75 / 100 / 99.96**, `cli` **100 / 100 / 100 / 100** -- unchanged, because the subject is `scripts/` and its drivers are the site proofs |
| mutation | **15** substitutions; first pass **8 red, 1 survivor, 1 skipped**, and after the creation base was added, 5 anchors went stale and were refreshed. Final: **15 of 15 red, 0 survivors, 0 inert**, tree restored -- the survivor was a rule with no test (a `409` on a later page read as "no refs") and the skip an anchor written with the wrong indentation |
| failure sites | **126** across **59** of **85** scripts; throws **91** = 11 `fatal` + 69 `unguarded` + 1 `guarded` + 10 `rethrow`, and **91 of 91** carried annotations |
| site proofs | **203** proved sites across **58** test files (`verify-site-proofs.mjs --list`) |
| the history | `golden-master/publish-readings.json`: **16 attempts**, 269 rows. Attempt 14 is the creation that was refused by its own plan (2 requests, no object), 15 the creation that succeeded (35 requests, three commits, `POST /git/refs`), 16 the `master` push onto the same window (31 requests, one `PATCH`) |

The pushes this round made are described in §七. The row for the push that publishes *this*
commit cannot be in it -- a push cannot record itself inside itself -- so the ledger below is one
attempt behind by construction, which is the lag the gate prints rather than one it hides.

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

## v3.62 — a list that said "open" about three things three rounds had closed

The round started at the `## Open` list, because that list **is** the plan: every round reads its
leftovers there, and the previous round had closed three items without opening the file. Three
entries still said "open" about work that findings 446, 451 and 455 had finished, and a fourth
reason was parked inside an entry that had been struck through.

Counting them is what produced the round's second finding -- the count came out at thirteen and the
guard said eleven, and the difference was two entries neither of us could name. The third came from
reading one of the entries that survived: a cost that grows with the repository rather than with the
push, described nowhere.

### One — A list with a reader for its form, and none for its currency

The list is well guarded. An entry has to say which it is -- struck through with the finding that
closed it, or open with a reason long enough to be one -- and two entries may not share a reason. All
of that is about **shape**. None of it is about whether a living entry is still true, and the guard's
own docstring says so: *"It cannot check whether an entry is still true -- that needs the measurement
the entry is about."*

Three entries were in exactly that state. The page that decides a `404` had been made a page
(finding 451); the flag that said a branch was new was refused on a branch that existed (finding 446);
the creation path had been paid for by a real push of thirty-five requests, three commits and one
`POST /git/refs` (finding 455). And a fourth `[open: ...]` sat *inside* the entry that had been struck
when the branch could not be created at all -- the one place where neither a reader nor the guard
looks, because the guard read a strikethrough as the end of the story.

The repair is not another sentence about reading the list, which is what the previous three repairs
amounted to. It is a line at the top of it:

> `Checked at v3.62: **13** entries open.`

`check-open-list.mjs` now recomputes that number from the entries below it, refuses a number that is
not the count, and refuses a **round older than the newest round in the corpus**. A round that writes
itself up without opening the file therefore turns the build red -- which is the only part of this
that a gate can do, and it is the part that failed three times. What it still cannot do is read: a
round can satisfy the line by counting without thinking, and the docstring says that too.

### Two — A strikethrough anywhere made the whole entry history

The stamp's arithmetic is what exposed this. The guard counted thirteen open entries where the file
had fifteen, and the two it had lost were entries that quote a closure **inside themselves**: a
sub-item another round had struck, followed by the entry's own reason. `CLOSED.test(item)` looked for
a `~~` anywhere in the entry, so both were judged closed -- and their own reasons were never read, not
for length and not for being a copy of someone else's.

An entry is closed when its **headline** is struck. The first line is the claim; the rest of the
bullet is what the claim is about.

The same two entries then produced the second half. `item.match(OPEN)` takes the *first* marker, and
in such an entry the first marker belongs to the quoted sub-item -- fifteen characters of history
judged as if it were the reason a reader is being asked to act on. The entry's own reason comes after
it, because the quote is history and the reason is the claim, so the rule is now the **last** marker.
Both halves are covered by cases written against the shapes that exist in the shipped file, and the
shipped file's own summary is asserted against its headings, so a count that drifts from the document
is red rather than quiet.

### Three — A search that could not stop, and never said how far it had gone

The base search reads a commit per branch tip that is not a local commit, because a twin can only be
recognised by its tree. It had no stopping condition and no report.

No stopping condition is the sharper half, because the optimum is provable: a creation cannot replay
**fewer than one commit**. Zero would be a pointer push, and that question has already been answered
*no* -- it is what puts a push on this path at all. So index 0 (the remote's twin of this very tip)
and index 1 (its parent) both produce exactly one rebuilt commit, and once either is in hand nothing
can improve on it.

The walk knew none of that, and it showed twice. It read every tip that was not a local commit even
when `best` already held the optimum from the **free** pass -- a branch of the remote pointing at the
parent, four twins, and four requests spent to confirm an answer that could not move. And when it did
read, it never said how many tips that took, so the one number in this path that grows with the
repository instead of with the push was invisible.

Both are now facts in the log:

| repository | read | sentence |
| --- | --- | --- |
| a tip that is already a local commit, one below the head, plus two twins | **0** | `the base is <sha>: 0 of the 2 remote tip(s) that are not local commits were read` |
| the parent's twin first in ref order, then a twin that matches nothing | **1** | `… 1 of the 2 … were read, and the search stopped there because a creation cannot replay fewer than one commit` |
| only twins, none of them matching | **all** | `none of the 2 remote tip(s) … carries a tree in this ancestry, and all 2 were read: this push replays the whole history` |

The third row is the one that makes the other two honest: an optimisation nobody can see is
indistinguishable from a search that stopped early and got lucky. The window is still whatever the
base gives -- the early exit removes requests, not replays -- and correctness still does not depend on
the choice, because the executor asserts the tip tree it was asked for.

### Readings

> Ledger for `v3.62`.

| item | value |
| --- | --- |
| `core` test suite | **239 files, 6024 tests passed** (at v3.62) |
| `cli` test suite | **4 files, 187 tests passed** (at v3.62) |
| repo test suite | **243 files, 6211 tests passed** (at v3.62) |
| new tests | **15**: the base search 3 (a free optimum that must read nothing, a twin met first that must read one, a repository of twins that must read all), the currency stamp 8 (a correct stamp, a wrong count, a round that is old, no stamp, two stamps, a corpus with no round to compare against, a quoted closure counted as open, and its reason read from the last marker), and the per-call budget 4 (every measured file, a mixed fixture reported by line, a comment that does not count, a nested suite that is not required) |
| coverage | `core` **99.96 / 99.75 / 100 / 99.96**, `cli` **100 / 100 / 100 / 100** -- unchanged, because the subjects are `scripts/` and a test file whose drivers are the site proofs |
| mutation | **11** substitutions; **11 of 11 red, 0 survivors, 0 inert**, tree restored. Two probes, because the round changed two subjects: five on the base search (`publish.test.ts`) and six on the open-list guard and the budget rule |
| failure sites | **126** across **59** of **85** scripts; throws **91** = 11 `fatal` + 69 `unguarded` + 1 `guarded` + 10 `rethrow`, **91 of 91** carried annotations. The count did not move: what moved was every line number, which is why the derivation had to be refreshed |
| site proofs | **203** proved sites across **58** test files (`verify-site-proofs.mjs --list`; the three rows above read **66** until this round re-ran the gate: 203 claims is what it reports, and 58 is how many files name them) |
| the open list | **13** entries open, **12** closed, three of them struck this round with the findings that closed them; the currency line is recomputed by the guard |
| the history | `golden-master/publish-readings.json`: **17 attempts**, 284 rows. Attempt 17 carried the previous round's commits: 15 requests, nothing retried, nothing unanswered |

### Left open, in the order the goal is reached

| priority | item | state | next step |
| --- | --- | --- | --- |
| **P1** | the remote's history shares no name with the local one above a boundary 272 commits old | unchanged; re-measured by every creation push | nothing converges it without rewriting the remote, which this channel refuses by design; the contract is isomorphism |
| **P2** | a bounded ref count is a floor, not a count | unchanged | a repository with more than a thousand refs |
| **P2** | the base search is linear in the number of twin tips | **narrowed**: the common case is now one read and the count is printed, but a repository whose base is not among the tips it reads still pays per twin | take the first N tips by name or by time and print how many were looked at, or let the caller name the base |
| **P2** | the currency line proves a round counted, not that it read | **new**, and it is the one thing the guard cannot do | nothing in a file can check that a sentence is still true; the round that closes an entry writes what closed it |
| **P2** | P13: a mutation is one substitution | measured once: 78 pairs, 78 red | a pair composing two changes neither of which is in the battery |
| **P2** | `backend`'s install bound has never met a slow day | unchanged | the history answers it the first time a slow mirror is recorded |
| **P2** | the five attempts recorded before v3.57 name no tip, and the file is one attempt behind | unchanged, and stated by the gate itself | every attempt from v3.57 on carries its commit; the lag is structural |
| **P3** | the shards are unbalanced by file cost | unchanged | time each claimant file once, cut where the seconds are |

**The lesson, for the round after this one.** The plan is a document, and this round began by
finding three of its entries describing work that three rounds had finished. The repair that held was
not a fourth sentence about reading the list -- it was an arithmetic line the guard recomputes and a
round it compares. The stamp cannot make anyone read; it can make a round that did not read leave a
number behind.

And the number found the second defect by itself. Counting the entries disagreed with the file by
two, and the two were entries the guard had judged closed by a strikethrough in their bodies. A count
that must be recomputed found, in one line, what four rounds of reading the rule had not.

## v3.63 — a count that agreed with the rule it was defending, and a sentence that could not fail

This round began where the previous one said it must: at the `## Open` list. It found two entries whose
own last sentence names the finding that closed them, counted by the guard as work -- and the count the
previous round added to catch exactly this agreed with the guard, because the count is computed from it.

The second finding came from reading an entry that had never been measured: a split described as
differing "by seconds", whose two jobs differ by four minutes, in the opposite direction to the round
that made the split.

### 一、The count was computed from the rule it was defending

v3.62 shipped two halves in one commit. The first was a repair: a strikethrough anywhere in an entry
had closed two **live** entries, because each quotes a sub-item a later round closed, and the rule
became *the headline decides*. The second was a currency stamp -- which round read the list, and how
many entries it found open -- because a round had closed three entries without opening the file.

The stamp said **13**. The section held **11**.

Both of the missing two are closed, and they say so in the sentence a reader reaches last:

```
  ~~`[open: the enumeration gate and the skip paragraph disagree about whether a contract skip
  is a gap, and deciding that needs a fixture whose target refuses a case]`~~
  — Closed by finding 343, which found that the runner could not produce a refusal at all
```

The strike is on the **reason**. The headline above it was never struck. The rule reads the headline,
finds no strike, hands the bullet to the open branch, and judges the reason for its length and for
being a copy of another one -- and for nothing else. One fixture, three guards:

| guard | rule | those two entries | why |
| --- | --- | --- | --- |
| v3.61 | a strikethrough anywhere closes | `0 open, 2 closed` | **right by accident**: the same rule closed two live entries that quote a closure |
| v3.62 | the headline decides | `2 open, 0 closed` | wrong by two, in the direction the repair created |
| v3.63 | the headline and the reason must agree | both refused, by name | the bullet is judged rather than guessed |

The part worth keeping is why the arithmetic could not see it. `open` is incremented on the branch the
guard takes, so a guard that is wrong about an entry produces a count that is wrong about the same
entry, and the two agree. The number added to catch a stale list cannot catch a stale rule.

What saw it was the thing v3.62 said could not be mechanised: a reader. The file said eleven and the
guard said thirteen, and the difference was two bullets whose own text says "closed".

The repair was already in the log, sixty rounds old. Round v2.44 writes the whole shape:

```
- ~~**M1's reading rests on 19 samples.**~~
  ~~`[open: the quantum is 5.3 points ...]`~~
  **Closed by finding 216**, which grew the key to 30 samples and re-read every figure derived from it.
```

A struck headline, a struck reason, the closure after them. The two entries used **half** of it, and
half is what a rule keyed on one sentence cannot read. The repair strikes the two headlines and keeps
the struck reasons, because the reason is the record of what was open.

### 二、A sentence that cannot fail

The live list carried this about the sensitivity split:

> Both hold the same number of claimant files and their wall clocks differ by seconds.

"Differ by seconds" is true of a 1-second difference and of a 240-second one, so no run can contradict
it -- and the number the workflow's wall clock is actually set by is the one the phrase declines to give.
One line below, the same entry says the split is *unbalanced by duration*, which the phrase says cannot
be so.

Run `466` on `ad266e2ba`, the step that does the work in each job:

| reading | shard 1 | shard 2 | difference | slower |
| --- | --- | --- | --- | --- |
| v3.54, the round that split it | **248 s** | **387 s** | 139 s | shard 2 |
| run `466`, eight rounds later | **439 s** | **199 s** | 240 s | **shard 1** |

The difference has never been small, and the shard that is slower has changed. The two explanations a
reader would try both fail: equal file counts (25 and 25) predict 439 against 199, and near-equal claim
counts (55 and 64, 16% apart) predict a 121% difference. The cost is per-file suite cost -- a file with
five claims in a fast suite is cheaper than a file with three in a slow one -- and only the battery can
measure it, on the machine that pays it.

What the round could do was remove the unfalsifiable sentence. The entry now states both measurements,
the direction, and the two candidates that fail.

### 三、Nineteen records left the reader, and nothing said so

The third finding came from the guard's own output. It printed the number of sections it read --
`164` -- and the corpus has `183` headings that begin with one of the two names. The difference is
the whole story:

```
$ grep -c '^### Left open,' docs/progress/volume-*.md
docs/progress/volume-10.md:2
docs/progress/volume-11.md:7
docs/progress/volume-12.md:10
```

At v3.45 a round's record became a **table**, and its heading grew a suffix --
`### Left open, in the order the goal is reached`. `sections()` compared the heading with an exact
string, so from that round on nineteen records had no reader: nineteen rounds, v3.45 to v3.63.

Nothing was miscounted. A table has no entries, so no count moved -- and a number that does not move
is the only evidence a reader would have had. This is finding 162 arriving by a second door: the
guard was repaired to read *every* section with that heading, and then the heading changed.

The repair is three spellings and one refusal. `## Open` and `### Left open` are read as entries;
`### Left open, <suffix>` is read as rows, with a check that there *is* a table and that no entry
sits under it; and any other heading beginning with either name is refused, because a document that
renames a list must not be able to move it out of reach quietly. The summary now carries the third
number beside the two entry counts:

```
... 533 open with a reason, 44 closed by a finding, and 19 record(s) in table form (185 row(s))
whose rows were not judged
```

`185` is not the number of rows. It is the number of pipe lines -- the header and the rule of each
record counted as rows -- and the 147 that are rows is finding 464's measurement, one round later.

That last clause is the honest half. The guard counts a row and refuses an entry; it does not judge a
row's `state` column, and it says so every run rather than passing over nineteen records in silence.

### 四、What changed

Two rules in `check-open-list.mjs`, because a disagreement has two ends: a **closed** entry may not
carry an unstruck reason (history in the headline, work in the body), and an **open** entry's reason may
not be struck through (this finding). The reason is read **once** per entry from the last marker and
both branches use that one reading, so the rules cannot drift apart on which sentence is the entry's own.

The two entries are struck, one residual is raised, the count is 12, the stamp names this round, and the shard entry carries the
numbers instead of a phrase.

A third spelling for a record joins the two the guard already read, with a refusal for anything else;
the table-form records are counted and their rows are declared unjudged in every summary line.

### Readings

> Ledger for `v3.63`.

| item | value |
| --- | --- |
| `core` test suite | **239 files, 6024 tests passed** (at v3.63) |
| `cli` test suite | **4 files, 187 tests passed** (at v3.63) |
| repo test suite | **243 files, 6211 tests passed** (at v3.63) |
| new tests | **8**: the half-struck bullet refused by name, the same bullet accepted once its headline is struck, a closed entry refused for carrying a live reason, finding 458's fixture kept so the new rule cannot re-open the old defect, and four for the record spellings (a table-form record counted and declared unjudged, an entry under one refused, a suffix-form heading over prose refused, a third spelling refused) |
| sections read | **183** of 183 headings that begin with either name: 163 records of entries, 19 records in table form, and the live list. Before this round the guard read 164 and said so |
| mutation | **15** substitutions; **15 of 15 red, 0 survivors, 0 inert**, tree restored. Four new ones: `struckReason` made to answer `false` (both entries return to being counted as work), the closed branch's reason check deleted, `spellingOf` made to answer `null` for the table form (nineteen records vanish from the count), and the unknown-spelling refusal removed |
| failure sites | **126** across **59** of **85** scripts; throws **91** = 11 `fatal` + 69 `unguarded` + 1 `guarded` + 10 `rethrow`, **91 of 91** carried annotations. The count did not move: the new problems are raised at exits that already existed, and what moved was line numbers |
| the open list | **12** entries open, **14** closed; two struck this round, both naming the finding that closed them, and one raised -- the record rows nothing judges |
| the split, measured | shard 1 **439 s**, shard 2 **199 s** on run `466`; at v3.54 it was **248 s** and **387 s**, the other way round |
| the history | `golden-master/publish-readings.json`: **20 attempts**, 339 requests. Attempt 19 carried this round's two commits: 20 requests, nothing retried, nothing unanswered, slowest `POST /git/blobs` 2 960 ms. Attempt 20 was this round's own re-run -- it found the remote already holding the tree, made **three reads**, and published nothing, which the file records because the unit it counts is a publish attempt rather than a push |

### Left open, in the order the goal is reached

| priority | item | state | next step |
| --- | --- | --- | --- |
| **P1** | the remote's history shares no name with the local one above a boundary 272 commits old | unchanged | nothing converges it without rewriting the remote, which this channel refuses by design |
| **P2** | the currency line proves a round counted, not that it read | **sharpened**: this round is the demonstration, and the count could not see its own rule | the round that closes an entry writes what closed it, in the headline, where the guard reads |
| **P2** | the base search is linear in the number of twin tips | unchanged | take the first N tips by name or by time and print how many were looked at |
| **P2** | the split is expensive by 240 s of every run | **measured**, and the phrase that hid it is gone | a per-file recording made on a runner, published where a plan can read it, and a staleness rule |
| **P2** | a record written as a table is counted, not judged | **new**: nineteen rows per round carry a `state` column no gate reads | judge the column against a closed vocabulary, or require a record to be entries |
| **P2** | P13: a mutation is one substitution | unchanged | a pair composing two changes neither of which is in the battery |
| **P3** | a bounded ref count is a floor, not a count | unchanged | a repository with more than a thousand refs |

**The lesson, for the round after this one.** A number computed from a rule inherits that rule's
blindness, and the more exactly the two agree the less either can say. The stamp was not wrong because
it was stale -- it was wrong because it was faithful. What could disagree with it was a reader, and the
only thing that made the reader's disagreement cheap was that the entries said "closed" in words.

So the next thing to mechanise is not another count. It is the sentence the entry writes about itself
when a round closes it.

## v3.64 — three defects in the sentence that was written to be honest, and the corpus the stale readings were in

v3.63 ended with a rule: *the next thing to mechanise is the sentence the entry writes about itself
when a round closes it*. This round began there and found that the sentence it had just shipped --
`19 record(s) in table form (185 row(s)) whose rows were not judged` -- was the third defect in three
rounds of the same family: a number printed as evidence that is not the number it claims to be.

### 一、The rows nobody judged were counted as pipe lines

```js
const rows = section.lines.filter((line) => /^\s*\|/.test(line)).length;
```

A markdown table has two lines that are not rows -- the header and the rule -- so nineteen records of
**147** rows were reported as **185**. The 147 is derivable from the content (a record's first cell is
a bold priority) and the guard now arrives at it from the structure:

| reading | before | after |
| --- | --- | --- |
| rows reported for the nineteen records | **185** | **147** |
| what 185 is | 147 + 2 x 19 | the number of pipe lines |
| a record naming its columns and stopping | `OK`, `2 row(s)` | refused: `holds a header and no row` |

Worse than the arithmetic is what the number was also for. `rows === 0` was the test for `holds no
table`, and two pipe lines are never zero, so the refusal was **unreachable** for any table a person
would write -- a `=== 0` against a number that cannot be `1`, whose only case was the one it was
written for. And the test beside it asserted `3 row(s)` for a one-row table and passed: a test written
to match an output inherits the output's mistake.

### 二、The shape was said to be checked, and nothing about the shape was checked

The comment above the third spelling says *its rows are counted, its shape is checked*. The code
counted and checked nothing: not the header, not its names, not the rule, not one row's cells --
nineteen headers, 147 rows, zero checks, and zero is not the same as nothing to check.

The four names are the record's promise: priority, what the residual was, what became of it, the next
step. A record that renames `state` to `note` still parses, still counts, and moves the only column a
reader greps for out of reach -- finding 463's argument applied one level down, to a column instead of
a heading. So there are four arms now, and three of them are the ones an honest future record would
break by accident:

| arm | refused when |
| --- | --- |
| a rule under the header | the first row is indistinguishable from a second header |
| the four names | `names priority, item, note and next step, and not state` |
| cell count per row | `has 3 cell(s) under a header that names 4` |
| a non-empty `state` cell | the column exists and says nothing about the residual |

The last is the only judgement on a cell the guard says it does not judge, and locating a column is
not reading a value. Not one of the 147 is empty, so it is a floor stated as a floor.

### 三、The column is not a state, and the entry's premise was refuted by measuring it

The live list asked for a closed vocabulary for the `state` column. The measurement says there is
nothing to close:

| reading | value |
| --- | --- |
| rows | **147** |
| distinct values | **78** |
| most common | `unchanged`, **38** rows (26%) |
| median cell | **75** characters |
| longest | **251** |
| empty | **0** |

A column whose median cell is a sentence is a **reading**, written once per residual by the round that
paid for it -- `measured once: 78 pairs, 78 red`; `**248/387** then **189/440**, ratio 1.56 -> 2.33`.
No vocabulary accepts those and means anything, and requiring one would force nineteen frozen records
to be rewritten. So the entry is **closed as a measured decision**, the shape this log already uses
for a premise a measurement refutes: the rows are not judged because they are prose, and what a gate
can do about prose is make it locatable.

### Readings

> Ledger for `v3.64`.

| item | value |
| --- | --- |
| `core` test suite | **239 files, 6032 tests passed** (at v3.64) |
| `cli` test suite | **4 files, 187 tests passed** (at v3.64) |
| repo test suite | **243 files, 6219 tests passed** (at v3.64) |
| new tests | **8**: the row count read off the record (1 and 5 rows), a header-only record refused, a renamed column refused, a header with no rule refused, a short row refused, an empty `state` cell refused, and the shipped corpus held to 147 by an independent count |
| the count, corrected | **185 -> 147**; the `holds no table` refusal went from unreachable to reached |
| the shape, now checked | nineteen headers, 147 rows, four arms, 0 violations in the shipped corpus |
| mutation | **21** substitutions; **21 of 21 red, 0 survivors, 0 inert**, tree restored. Six new, one per arm: `tableShape` returning pipe lines (147 -> 185), the zero-row arm deleted, the cell-count arm deleted, the empty-`state` arm deleted, the four-name arm deleted, and the rule under the header made optional |
| the open list | **11** open, **15** closed; one struck this round, closed as a measured decision by finding 466 |
| the receipt | `verify:local` **OK** -- 34 command(s) covering 47 of 57 run steps, tree `188ca577c`; the ten that did not run need a runner, sudo or the run token, and each says which |
| the history | `golden-master/publish-readings.json`: **21 attempts**, 362 requests. Attempt 21 carried this round's two commits: 23 requests, none retried, none unanswered, slowest `POST /git/blobs` 2 360 ms. The remote tip is `47f2f7612`, whose tree is `188ca577c` -- the receipt's tree, and the local `HEAD^{tree}` |
| CI on that tree | `CI` **8/8** jobs and `Anchor round trip` **1/1**, both success (runs 468 and 394) |

### Left open, in the order the goal is reached

| priority | item | state | next step |
| --- | --- | --- | --- |
| **P1** | the remote's history shares no name with the local one above a boundary 272 commits old | unchanged | nothing converges it without rewriting the remote, which this channel refuses by design |
| **P2** | the currency line proves a round counted, not that it read | **sharpened again**: v3.63's own sentence was the first thing it could not see | the round that closes an entry writes what closed it, in the headline, where the guard reads |
| **P2** | the base search is linear in the number of twin tips | unchanged | take the first N tips by name or by time and print how many were looked at |
| **P2** | the split is expensive by 240 s of every run | unchanged since it was measured | a per-file recording made on a runner, published where a plan can read it, and a staleness rule |
| **P2** | a table-form record's rows are prose | **closed as a measured decision** (finding 466): 78 values over 147 rows, a 75-character median | nothing; a vocabulary would mean rewriting nineteen frozen records |
| **P2** | P13: a mutation is one substitution | unchanged | a pair composing two changes neither of which is in the battery |
| **P3** | a bounded ref count is a floor, not a count | unchanged | a repository with more than a thousand refs |

**The lesson, for the round after this one.** The last three rounds each found the same defect one
level deeper, and each time in the sentence the previous round had written to be safe: a stamp that
counted what the guard said, a guard that read the headline and not the reason, a sentence that said
"these rows were not judged" and named a number that was not the number of rows. The pattern is not
carelessness. It is that **a sentence about a number is checked by the number's own source**, so the
only sentences that can fail are the ones whose subject is somewhere else -- the record, the reader,
the pipe line that is not a row. What found all three was reading the sentence against its subject
rather than against the code that printed it.

So the next thing to mechanise is still not a count. It is the habit of asking, of every number a
round prints, **what would have to be true for this number to be wrong**, and then looking there.

## v3.65 — the only P1 that was not in the list, and two rulers that had never been laid against each other

v3.64 ended with an instruction rather than a count: *of every number a round prints, ask what would
have to be true for this number to be wrong, and then look there*. This round pointed that at the one
number it had printed without looking -- `Checked at v3.64: **11** entries open` -- and the number was
right about its own section and wrong about the log.

### 一、The only P1 in this document lived in a record, and the list never held it

The guard printed two counts in one line and had never compared them: **11** entries open, and **7
row(s)** in the newest round's record. They are not supposed to be the same set -- a record carries what
a round left undone, the list carries what is undone -- but they were not disjoint either, and nothing
said which rows had an entry behind them and which did not.

Measured by reading the seven rows of v3.64's record against the twenty-six entries of the list:

| row | what it was |
| --- | --- |
| `the remote's history shares no name with the local one above` | **no entry anywhere** -- the only **P1** in this log, carried for six rounds |
| `the currency line proves a round counted, not that it read` | **no entry anywhere** |
| `the base search is linear in the number of twin tips` | **no entry anywhere** |
| `a bounded ref count is a floor, not a count` | **no entry anywhere** |
| `the split is expensive by 240 s of every run` | the entry *"The sensitivity shards are cut by file count, not by cost"*, in other words |
| `a table-form record's rows are prose` | the entry *"A record written as a table is counted, not judged"*, in other words |
| `P13: a mutation is one substitution` | the entry, quoted |

So four residuals -- including the largest one outstanding -- were reachable only by a reader who read
the round that raised them, and the list that exists so a reader does not have to do that did not carry
them. **The stamp could not say so, and this is the part worth keeping**: its number is arithmetic over
the entries below it, computed by the guard that also counts them. A residual that is not an entry is
not a residual as far as the stamp is concerned, so the sentence "eleven open" was true, exact, and
about the wrong population -- finding 465's defect (a number that agrees with the rule it defends) one
document further out.

**Fixed** by adding the four as entries -- the list grows from 11 to 15, which is what a list that has
been under-reporting should do -- and by an arm that refuses the shape: the newest round's record may
not name a residual the live list does not hold.

### 二、A row is a paraphrase, and a paraphrase is a sentence with no second reader

The four rows above are why the arm exists; the two in italics are why it is a **quotation** rule rather
than a "does this resemble an entry" rule. Both describe entries that exist, in words that appear in
exactly one place in this corpus: the record. A reader who greps a row's text finds the row; a reader who
greps the entry finds the entry; neither finds the other, and the two are the same residual.

That is finding 463's argument -- *a title is an exact string, and a document that re-spells it has no
reader* -- applied to a cell instead of a heading. So a row's `item` must be the entry's own words:
after emphasis, quotes and whitespace are normalised away, at least twenty characters of the row have to
appear inside an entry. One of the seven rows satisfies that today.

The scope is the **newest record only**, for a reason the corpus states itself: a record is frozen, and
nothing appends to it. A rule that judged the older twenty would be a rule demanding a repair the corpus
forbids, so the arm reads the one record that can still be edited -- the same scope, and the same
argument, as the currency stamp's comparison with the newest round.

### 三、The rule this round added for a third defect was already there, and the corpus is what said so

The round also went looking for a fourth defect, on a reading that looked airtight: the guard requires
a closure to name what closed it, the requirement is a **pattern** -- `Closed|Narrowed|Retracted` within
one sentence of `finding <n>` -- and a pattern answers *does this say what closed it*, never *what does
it say*. A number is the one thing in that sentence a typo moves without disturbing the prose.

So an arm was written: read the audit's headings, extract the number, refuse a citation that names
nothing. It passed its own tests and the shipped corpus, and the round moved on to the write-up -- which
is where it died. The sentence written to illustrate the defect cited a number that does not exist, and
**`check-citations.mjs` refused the round's own paragraph**:

```
  docs/progress/volume-12.md:1852: cites finding <n>, which has no heading
check-citations: FAILED -- 1 citation(s) of 1 number(s)
```

That gate has resolved every `finding N` in this documentation since finding 205 -- both documents,
their indices, and every volume of each -- and it refuses a dangling one. The entry's premise was false,
the arm was a second ruler for a property that already had one, and the only reason the round found out
is that it wrote a wrong number into the prose it was using to describe wrong numbers.

The arm is **deleted in the same round**, with its three tests and its three mutations; what survives is
the reading it took on the way:

| reading | value |
| --- | --- |
| closure citations in the shipped open list | **39** |
| of those, naming a finding the audit holds | **39** |
| the guard that already held that | `check-citations.mjs`, since finding 205 |
| what it cannot do, in its own words | a citation of the *right* number for the *wrong* claim -- both numbers exist and the sentence is prose |

Two lessons, and the second is the one worth carrying. A rule is not missing because the sentence
describing its absence is convincing: **the audit is a corpus, and a claim about it can be refuted by
reading it**. And a new guard has to be justified against the guards that exist, which is a search this
round performed only by accident -- by breaking its own prose.

### 四、The twenty kilobytes of headroom ran out, and the instruction was to split the index

The four entries and the paragraph above are what pushed `docs/progress.md` from 90,886 to 93,828 bytes,
and `check-progress-volumes.mjs` has printed the relation since v2.35: `index N of smallest volume M`.
Eighty-nine rounds ago it printed `index 72,217 of smallest volume 92,309`, and the round wrote down what
the number was for -- *twenty kilobytes of headroom, about six rounds, and then the split becomes an
instruction instead of an opinion*. It survived far longer than six rounds because most rounds append to
a volume rather than to the index. This is the round that spent it.

| section of the index | bytes | what it is |
| --- | --- | --- |
| `## Open` | 40,456 | the live list and the rounds' commentary about it |
| `## Audit passes` | **20,447** | a table of passes, why each was chosen, and its injection matrix |
| `## L4 anchor status` | 8,970 | status |
| `## Coverage` | 7,479 | how coverage is measured |
| everything else | 16,476 | headline, round trip, repository, test strategy, the volume index |

`## Audit passes` is the only section there that is a **record** with no lookup in it, and the only one
whose subject belongs to another document -- the audit's own index opens with `## Scope`, a list of
passes. It could not be deleted: v2.35 measured that of **79** prose sentences longer than 60 characters
in it, **zero** appear in `docs/audit/`, so it is the only copy of why each pass was chosen. So it moved,
to `docs/audit/passes.md`, with the heading promoted one level because it is a document's title now.
Nothing in it was rewritten.

| reading | before | after |
| --- | --- | --- |
| the index | **93,828** bytes | **74,295** |
| the smallest volume it indexes | 92,355 | 92,355 |
| headroom | **-1,473** | **+18,060** |
| the passes | a section of the index | `docs/audit/passes.md`, 21,288 bytes, reachable from both indexes |

### Readings

> Ledger for `v3.65`.

| item | value |
| --- | --- |
| `core` test suite | **239 files, 6036 tests passed** (at v3.65) |
| `cli` test suite | **4 files, 187 tests passed** (at v3.65) |
| repo test suite | **243 files, 6223 tests passed** (at v3.65) |
| new tests | **4**: a row that quotes an entry accepted, a row that names nothing refused, a row too short to name anything refused, and an older record left alone because a frozen record cannot be repaired |
| the list | **11 -> 15** open, and the four added are the four that lived only in records |
| the record arm | v3.64's seven rows: **1** quotation, **2** paraphrases of real entries, **4** residuals with no entry at all |
| the arm that was deleted | **39** closure citations in the open list, **39** resolving -- by `check-citations.mjs`, which had done it since finding 205; the round's own arm and three tests removed |
| the index | **93,828 -> 74,295** bytes, against a smallest volume of 92,355: the relation v2.35 bought headroom with fired, and `## Audit passes` moved to `docs/audit/passes.md` (finding 470) |
| mutation | **24** substitutions; **24 of 24 red, 0 survivors, 0 inert**, tree restored. Three new: the record collector, the twenty-character floor, and the case fold. Three written for the citation arm left with it |
| the receipt | `verify:local` **OK** -- 34 command(s) covering 47 of the 57 run steps, tree `22f3141ac`; the ten that did not run need a runner, sudo or the run token, and each says which. The reading is of that tree, which is the content commit's; this table was written after it, so the tree it ships in has a second receipt and this row does not name it |
| the history | `golden-master/publish-readings.json`: **23 attempts**, 392 requests. Attempt 23 carried this round's two commits -- 20 requests, none retried, none unanswered, slowest `PATCH /git/refs/heads/master` 2 275 ms. The remote tip is `5177c8e38`, whose tree is `22f3141ac`: the receipt's tree. The ledger row was appended after the ref moved and is carried by the next push, which is the lag the file records about itself |
| CI on that tree | `CI` **8/8** jobs and `Anchor round trip` **1/1**, both success (runs 42434336635 and 42434336604) |

### Left open, in the order the goal is reached

| priority | item | state | next step |
| --- | --- | --- | --- |
| **P1** | the remote's history and the local one share no name above a boundary 272 commits old | **listed at last**: six rounds in records, one round in the list | nothing converges it without rewriting the remote, which this channel refuses by design |
| **P2** | the currency line proves a round counted the list, not that it read it | unchanged, and sharpened: the count was right about a population that was not the whole | the round that closes an entry writes what closed it in the headline, where the guard reads |
| **P2** | the base search reads one remote tip per branch this checkout does not have | **listed at last** | bounded by a reading of how many twin tips a real push meets; five refs here is not that reading |
| **P2** | the sensitivity shards are cut by file count, not by cost | unchanged since it was measured, and its row now has to quote it | a per-file recording made on a runner, published where a plan can read it, and a staleness rule |
| **P2** | P13: a mutation is one substitution | unchanged | a pair composing two changes neither of which is in the battery |
| **P3** | a bounded ref count is a floor, not a count | **listed at last**: five refs, and the walk has never stopped | a repository with more than a thousand refs |

**The lesson.** The three defects this round found were one defect read at three distances: a count over
a population that was not the one a reader cares about (**11** entries, and the only P1 outside them), a
cell that restates an entry in words no `grep` shares, and a citation that names a number nothing holds.
None of them is a lie. Each is a sentence that is true about its own source and silent about the thing a
reader uses it for. What found all three was the same move: take the sentence a reader acts on, and
**ask what its subject is** -- not what produced it. That is the move v3.64 asked for, one level out, and
the reason it keeps paying is that every document here is written to be checked against its own source.

## v3.66 — a number with a reader said 105, a set both baselines solve, and a hyphen that hid sixteen leaks

v3.65 ended with an instruction: *take the sentence a reader acts on, and ask what its subject is*. This
round pointed that at the sentences that **have** readers -- the ones an outside party quotes -- and at
two claims the gates made about their own coverage. All four defects are one defect at four distances: a
sentence that is true about its own source and silent about what a reader does with it.

The round began as a review of an external evaluation proposal. The proposal's coordinate system was
right -- this repository proves *export conformance* and has never proved *task effectiveness* -- and
its fact layer was wrong five times, twice by quoting our own documents. That is why the first repair is
about documents rather than gates.

### 一、The count that had a reader

`docs/acceptance.md` said `Measured at 105 of 105 in both halves`. The inventory held **204 proved
claims across 58 files** and **127 failure sites**, and had done for twenty-four rounds. Nothing read
the sentence; an **external review** did, and quoted the 105 as the current figure.

`check-doc-counts` exists for exactly this class and could not see it. Its four rules read table rows
carrying `N files, M tests` -- the suite's size -- and `docs/acceptance.md` is not in the progress
corpus at all. So the sentence was not skipped by a rule; it was never in front of a reader.

The rule added here reads three shapes (`N of N claim(s)`, `N claim(s) across M file(s)`, `N failure
site(s)`) from the documents that speak in the present, and compares them with
`golden-master/gate-sites.json` through the same `claimedSites` the two proof gates run. No second copy
of the numbers exists: the inventory is derived from the tree, and the counts are computed at the moment
they are compared.

The distinction it had to make first is the one the corpus already had a vocabulary for. The volumes
carry these numbers a dozen times and every one of them was true when written, so the subject is the
documents that speak in the present, and a line that dates itself (`at v3.41`) is a record. **The
missing thing was never the vocabulary; it was the decision that a specification is also a document that
goes stale** (finding 471).

### 二、A table that named the ids and described other mutations

The L3 matrix had been read back by `test/mutation.test.ts` for its **ids** only, under a comment
explaining that prose could not be validated mechanically. Measured, **thirteen of the eighteen rows
described a mutation other than the one their id runs** -- `MT-02` said "signal ≠ payload.kind" against
a code row that declares a bogus unit; `MT-05` said "unit mismatch on metric" against the answer-key
isolation mutation. The "Caught by" column had drifted with them.

The comment was true of a table written by hand and false of the table that existed, because that table
had a **field** behind it: every mutation carries a `description`, and every gate mutation an `expected`
list. The column was a hand-copied projection, which is the one kind of prose that can be checked and
therefore the kind whose drift is nobody's job to notice. Both columns are projections now, and both are
compared (finding 472).

### 三、Thirty of thirty, printed as evidence of health

G4 asks three questions and none of them is *is this set separable at all*. The corpus's success line
had been answering it for as long as the corpus has had telemetry:

```
check-fault-cases: OK (... 30 of 30 also carry telemetry ... which both the peak-z and the
  median-shift baselines place in their top-K ...)
```

Thirty of thirty, for both baselines. That sentence is the corpus's strongest evidence -- every case is
locatable, which is what makes it scoreable -- and its strongest objection, because a set both baselines
solve completely cannot separate methods. It was read as the first and never as the second.

`checkSaturation` reads the `BaselineOutcome[]` G4 already receives: per method, the share of the
**asked** cases located within top-K; the strongest method decides, not the mean; nothing is judged
below ten cases. And the set declares what it is for, because the rule would otherwise be red on every
run of a corpus doing its job:

```
check-fault-cases: set saturation: the strongest baseline ('median-shift-by-service') locates
  30 of 30 case(s) within top-3 (rate 1.000); purpose 'conformance', so this is a reading and
  not a verdict
```

Flip the one word in `index.json` to `benchmark` and the same run refuses, with the same numbers in the
sentence. That pair is a test, not a demonstration: the corpus is copied, the declaration changed, and
the refusal asserted. It is the only form of "the rule can be violated" that survives the round that
writes it (finding 473).

### 四、Three of thirty was a hyphen

The same review reported **3 of 30** task texts naming their own root-cause component. That number came
from `query.includes(component)` and was wrong in the safe direction:

| comparison | reading |
| --- | --- |
| substring, as reported | **3 of 30** |
| case + separator folded, word boundaries | **19 of 30** |

The sixteen-case gap is one character. The corpus writes `billing-service` in the field and `The billing
service began throwing` in the prompt, `media-transcoder` against `The media-transcoder container`. A
hyphen is not a boundary to a substring test and not a difference to a reader.

Nineteen task texts were rewritten -- the symptom, the window and the distractor stay; only the name
goes -- and the reading is **0 of 30**. The arm is `LEAK_IN_QUERY`, and it makes the case's
`answerKeyIsolated: true` an earned claim rather than an asserted one: all nineteen cases declared
themselves isolated while their prompts opened with their own answer (finding 474).

### 五、The ledger for the round had no coverage row

The four repairs above added two gate arms, one `purpose` vocabulary and a rule with four shapes. The
round's own ledger listed its tests, its mutations and its claims -- and carried **no coverage row at
all**. That is the same defect as 一、 one level up: a reading nobody publishes is a reading nobody
measures, and the thing it would have measured was this round's own code.

The omission is not this round's invention. Of the **54** `### Readings` blocks in this log, **24**
carry a coverage row and **30** do not, v3.64's and v3.65's among them -- so the row has been absent
from the place a reader looks for a round's cost for thirty rounds, and the two most recent are the
two that wrote the most code without it.

Measured after the four repairs and before the receipt:

| dimension | v3.65 | v3.66 as first written | after this section |
| --- | --- | --- | --- |
| statements | 99.96 | **99.95** | **99.97** |
| branches | 99.75 | **99.65** | **99.80** |
| functions | 100 | 100 | 100 |
| lines | 99.96 | **99.95** | **99.97** |

Nothing was red: the gate is per-file at 95 / 95 / 100 / 95, and the lowest file was 96.2. Six branch
sites in the new arms had no test, and two were branches no input could reach:

| site | why it was uncovered | repair |
| --- | --- | --- |
| `describeSaturation`'s benchmark-and-saturated sentence | the refusal asserted the violation's message; the log line that prints the same number was never read | assert the sentence in the refusal test |
| the reduce's *beats the best so far* arm | every fixture had one method or had the strongest first | a fixture whose stronger method sorts later, asserted order-independent |
| the reduce's *keep what it has* arm | the shipped corpus' stronger baseline sorts **first**, so it took the other arm | a fixture whose stronger method sorts first |
| `promptNamePattern('')` | only reachable through the public export, because the arm's floor refuses an empty name | call it: empty and punctuation-only names build no pattern |
| a case with no `query` | `query` is optional in the IR and no fixture omitted it | delete the field and assert the case is judged with no leak |
| `rootCauseComponent ?? ''` | **dead**: the IR requires the field, so the fallback answered a shape the schema refuses | delete the fallback rather than test it |

Two more branches were deleted on the same reasoning in `fault/corpus-census.ts`: `vocabularyOrder`
carried a `-1` fallback for a category that cannot arrive (every category comes from the vocabulary),
and the census renderings for a duplicate id and for empty totals were covered by their own tests
instead of being left as the file's only dark spots.

One **bug** came out of the restructure. `topK` was read as
`outcomes.filter((o) => byCase.has(o.caseId))`, and `byCase` is built *from* `outcomes`, so the
predicate was always true: a single outcome naming a case the set does not contain would enter the
minimum and narrow the whole set's reported top-K. The denominator already excluded it -- the rate
was right and the top-K beside it was wrong (finding 476).

The receipt is six tests and two deletions, and the ledger has the row it should have had first. Both
files it touched -- `gates/gates.ts` and `fault/corpus-census.ts` -- now read **100 in all four
dimensions**: `corpus-census.ts` was the package's lowest at 96.2 before this section, and `gates.ts`
stood at 99.4.

### Readings

> Ledger for `v3.66`.

| item | value |
| --- | --- |
| `core` test suite | **239 files, 6067 tests passed** (at v3.66) |
| `cli` test suite | **4 files, 187 tests passed** (at v3.66) |
| repo test suite | **243 files, 6254 tests passed** (at v3.66) |
| coverage | `core` **99.97 / 99.80 / 100 / 99.97**, `cli` **100 / 100 / 100 / 100** (statements / branches / functions / lines) -- the round's two arms first cost six branches and the receipt bought them back; `gates/gates.ts` and `fault/corpus-census.ts` are 100 in all four |
| new tests | **31** (6,036 -> 6,067): 16 in `gates.test.ts` (12 for the two arms -- 8 saturation, 4 leakage -- and 4 that close the branches the receipt found dark), 5 through `check-fault-cases`, 4 for rule 5 and its dated exemption, 4 in `mutation.test.ts` (the matrix's two column assertions, and MT-19/MT-20), and 2 for the census renderings |
| new mutations | **20** in `mutation.test.ts` (MT-19 the prompt leak, MT-20 the saturated benchmark set) and **14** in the `doc-counts-shapes` battery (a rule that accepts every gate-site count, and one that judges a dated sentence) |
| the count that had a reader | **105 -> 204** claim(s) across **58** file(s), **127** failure site(s), computed from `gate-sites.json` on every `docs:check` |
| the matrix | **13 of 18** rows named a different mutation than their id ran; both columns are projections now |
| the leak | **19 -> 0** of 30 task texts, measured after folding case and `-`/`_`/`.`/`/` |
| the set | **30 of 30** at rate 1.000, declared `conformance`; the same corpus declared `benchmark` is refused |
| the list | **15 -> 22** open: six the review left and one the coverage receipt left |
| the receipt | `verify:local` **OK**, and the two CI workflows on the pushed tree |

### Left open, in the order the goal is reached

| priority | item | state | next step |
| --- | --- | --- | --- |
| **P1** | the seven target contracts carry three copies of one version and no equation | new this round: the vendors row is the fourth field, and it has been wrong for six months | a guard that reads a constant, a markdown cell and a generator's field as one claim |
| **P1** | the newest round's ledger is not required to carry a coverage row | new this round: **30 of 54** `### Readings` blocks have none, and this round's arms left six branches dark | a rule over the newest section only, the way the size budget is judged only on the last volume |
| **P1** | G5 has no near-duplicate and no window-overlap arm | new this round: measured, 0 of 435 pairs overlap and the maximum task-text Jaccard is 0.308 | two fixtures, because the shipped corpus offers no witness |
| **P2** | G3's two thresholds have no grid | new this round: the defaults are a judgement nothing has defended | a 4x4 grid and a rule that refuses a default on a slope |
| **P2** | `rulegen` has no refusal count and no agreement reading | new this round: the thirty human annotations already exist and nothing compares against them | agreement with a fixed answer set, and the absence of kappa stated as a choice |
| **P2** | `score` divides by a different denominator per target | new this round: the sentence needs a measurement under it | a test asserting two targets' check counts differ |
| **P2** | `docs/acceptance.md` is 96 KB and grows by clause per round | new this round: L3 and L4 are 284 and 405 lines, the other four layers 14, 7, 7 and 6 | move the per-round clauses to a volume, after measuring how many sections match that shape |

**The lesson.** The four defects are one defect at four distances, and the distances are what changed:
a number no gate read (**105** against **203**), a table that read as prose because it had a field
behind it (**13 of 18**), a reading printed as evidence of health (**30 of 30**), and a measurement
that was wrong in the safe direction (**3 of 30** for **19 of 30**). Every one was found by asking a
sentence what a *reader* would do with it -- not what its source says. The review that started the
round found the first one by quoting it, which is the cost of a document nobody re-reads: it does not
decay, it gets cited.

## v3.67 — seven tables that restated a specification, and the gate that checked the site instead

The previous round ended with a list of four defects and a note that the next one was P1: seven
contract pages carried three copies of one version and no equation. Reading that entry closely, the
version was the least of it.

### 一、Six rows, seven pages, and nothing compared a row with the field it restated

Each page under `docs/targets/` opens with a table: vendor, venue, contract version, emitter, CLI
target id, modalities, timezone. Every row is a projection of `scripts/format-spec.mjs`. Measured
against the tree this round inherited, **41 rows across seven pages, and not one comparison**:

| row | what the page said | what the specification said |
| --- | --- | --- |
| `Vendor / venue` | `Microsoft, ICLR'25` on five pages; `Reference` on the other two | `vendor` and `venue`, two fields |
| `Contract version` | `` `pave-v1` (`OPENRCA2_CONTRACT_VERSION`) `` | a field **and** the exported constant |
| `Modalities` | `metrics, logs, traces (+ causal path)` | `['M','L','T']` |
| `Timezone` | `**UTC+8** (`OPENRCA_OFFSET_MINUTES = 480`)`, on five of seven pages | a sentence, on all seven |

Three different failures came out of the one missing equation.

**One value was false.** `openrca-2.0`'s vendor read `Microsoft`, which is 1.0's -- the line above it
in the same table -- and the PAVE paper's author block says `Affiliation: The Chinese University of
Hong Kong, Shenzhen`. Written 2026-09-10, corrected 2026-11-08. The same string sat in
`format-spec.mjs`, which the site renders as a badge: one unchecked sentence, published twice.

**Two rows were renamed to fit their values.** `cloud-opsbench` and `itbench` said `Reference` where
the others said `Vendor / venue`, because cloud-opsbench's `vendor` field held an arXiv id. That is a
citation standing where a publisher goes -- the question answered with the address of the question --
and the row was renamed rather than the field emptied, which is cheaper and leaves two pages whose row
means something different from the row in the same position on the other five.

**Thirteen cells were missing or said it differently.** Two pages had no `Timezone` row although the
specification has a sentence for all seven; rcaeval had no `Modalities` row. Of the five timezone cells
that existed, three differed from the specification's own sentence. The prose was not wrong. It was
unwitnessed, which is how `metrics, logs, traces` and `['M','L','T']` mean the same thing on Tuesday
and not on Wednesday.

The table is generated now, between `<!-- target: id -->` and `<!-- /target -->`, from the
specification and from the constant the exporters stamp. Four changes made it renderable:
`contractVersion` **left** `format-spec.mjs` (the constant is the only writer, and the generator reads
it out of the built package by the name `contractConstant` holds); `vendor`/`venue`/`reference` are
three fields, `null` printing as `*not established*`; `MODALITY_LABELS` turns the codes into the prose
the page prints, so one array is rendered twice; and the two rows no other page has (rcaeval's score
targets, itbench's persona) are declared instead of typed. The seven pages went from 41 rows to 54 --
thirteen of them rows the specification had and the page had dropped, or folded into a neighbour.

The vendor is the one claim here no gate can derive, so it is quoted: `golden-master/openrca2-evaluator.json`
gains `upstream.affiliation` with the paper's own line, the URL it was read from and the date, and a
test asserts the published vendor is a substring of it. An edit to either side is refused.

### 二、The generator wrote the documents; the gate checked the site

`gen-examples.mjs` owns three artefacts and, under `--check`, compared exactly one: `site/assets/data.js`.
`syncDocExamples` and `syncDocFields` ran only in write mode, so a hand-edited field table or a stale
example block passed `examples:check` -- the step CI runs in the docs job, named after the generator,
proving the site and saying nothing about the documents.

This was not unknown. It had been pinned as a test since 2026-09-27, asserting **green** on a document it
had just made wrong, under a comment calling it `audit.md`'s P2-4. A test that states a defect is worth
more than a comment about one; a test that stops stating it is how the defect gets closed, and this
round inverted that assertion rather than deleting it.

The repair is one code path for both modes: `planDocRewrites` computes all three rewrites in memory and
returns what would change, so `--check` is the *same* computation as the write instead of a second
opinion about it. It refuses on a non-empty plan and names the files. The first version of this
repair generated the metadata table and left the other two blocks alone -- half the artefacts checked
and the other half written, with no sentence saying which is which, which is finding 471 one level up.

`--check` still cannot see a **deleted** marker: a block that is not there is not compared. So the
enumeration is separate and explicit -- for every spec the page carries exactly one target block and one
field marker per documented file, thirty markers checked against the specification's own list.

### 三、The ledger owes the coverage row, and the rule is judged on the round being written

v3.66 found that 30 of the log's first 54 `### Readings` blocks carry no coverage row, and left the
rule in the list because a rule over history would have been red from the day it existed. This round
writes it: `readVolumes` refuses a newest round whose ledger carries no `| coverage |` row reporting
four numbers for `core` and four for `cli`. The asymmetry is asserted rather than described -- a test
builds a two-round volume where the older round has no row and the newest does, and requires silence --
because 30 of 54 is exactly the population that argument is about.

### 四、What the gates cost to retarget

Six injections in `gate-tests-battery.py` anchored on lines this round moved. All six were retargeted,
none deleted, and three were added for the guarantees that did not exist before (a `--check` that would
have passed a stale page, a metadata table nobody rewrites, a version printed instead of refused).
**25 injections became 28, witnesses 28 became 33, and the throws the reading partitions went from 91
to 93** -- the two new ones are `modalitiesProse` refusing a code it has no word for, and
`contractVersionOf` refusing a constant the package does not export.

### Readings

> Ledger for `v3.67`.

| item | value |
| --- | --- |
| `core` test suite | **239 files, 6082 tests passed** (at v3.67) |
| `cli` test suite | **4 files, 187 tests passed** (at v3.67) |
| repo test suite | **243 files, 6269 tests passed** (at v3.67) |
| coverage | `core` **99.97 / 99.80 / 100 / 99.97**, `cli` **100 / 100 / 100 / 100** (statements / branches / functions / lines) -- unmoved from v3.66, because this round's code is in `scripts/`, which the coverage gate does not measure; what measures it is the injection battery |
| new tests | **15** (6,067 -> 6,082): 9 in `gen-examples.test.ts` (the two refusals that replaced the pinning test, six for the metadata table including its two refusals, one enumerating the thirty markers), 4 for the coverage-row rule, 2 for the affiliation equation |
| new mutations | **3** injections in `gate-tests-battery.py` (EXAMPLES 8, 9, 10) and **6 retargeted**, because planning a rewrite is one decision for all three marker kinds |
| the table | **41 -> 54** rows across seven pages, generated; **41** of the old ones restated a field and **0** were compared |
| the vendor | `Microsoft` -> `The Chinese University of Hong Kong, Shenzhen`, quoted from the paper's author block; the same string was on the site badge |
| the gap | `--check` compared **1 of 3** artefacts; it compares 3 now, and the test that pinned the gap asserts the refusal |
| the claims | **204 -> 207** claim(s) across **58** file(s), **128** failure site(s), from `gate-sites.json` |
| the list | **22 -> 20** open: this round closed the two it was written for, and added two it found |

### Left open, in the order the goal is reached

| priority | item | state | next step |
| --- | --- | --- | --- |
| **P1** | G5 has no near-duplicate and no window-overlap arm | unchanged: measured, 0 of 435 pairs overlap and the maximum task-text Jaccard is 0.308 | two fixtures, because the shipped corpus offers no witness |
| **P2** | G3's two thresholds have no grid | unchanged: the defaults are a judgement nothing has defended | a 4x4 grid and a rule that refuses a default on a slope |
| **P2** | `rulegen` has no refusal count and no agreement reading | unchanged: the thirty human annotations already exist and nothing compares against them | agreement with a fixed answer set, and the absence of kappa stated as a choice |
| **P2** | `score` divides by a different denominator per target | unchanged: the sentence needs a measurement under it | a test asserting two targets' check counts differ |
| **P2** | `docs/acceptance.md` is 96 KB and grows by clause per round | unchanged: L3 and L4 are 284 and 405 lines, the other four layers 14, 7, 7 and 6 | move the per-round clauses to a volume, after measuring how many sections match that shape |
| **P2** | Cloud-OpsBench has no established vendor | new this round: the field held an arXiv id, the page renamed the row to `Reference`, and the field is `null` now | read the paper's author block, as `openrca-2.0`'s was read, and record the line the value comes from |
| **P2** | two prose targets cite a paper no digest pins | new this round: `itbench` and `cloud-opsbench` print an arXiv id beside the one the corpus pins | a sha256 and a byte count per paper, or a declaration saying the id is all this repository read |

**The lesson.** Both defects are the same sentence at two levels: *every cell in a table is either a
projection of something or a claim with one reader.* The metadata table had six cells that were
paraphrases, and the one that mattered was not the version everybody kept in step -- it was the vendor
nobody did, and it was wrong for two months while three copies of the version agreed perfectly. The
generator had a check for one of the three things it wrote, which is finding 471's 105-and-204 one level
down: the gate existed, was named after the work, and measured the artifact that never drifts.

## v3.68 — a pollution gate that compared a case with everything except another case

### 一、Four arms, and none of them read a case against a case

G5 is the anti-pollution gate. Its four arms read one case against a regular expression, a
fingerprint from a public benchmark, a boolean the case asserts about itself, and the component name
inside its own prompt. The comparison the word *pollution* is actually about -- two cases in one set
that are the same incident written twice, so that a set of thirty is a set of twenty-two with eight of
them counted twice -- had no arm at all (finding 479).

`caseFingerprint` cannot stand in for it, and the reason is the shape of the rule rather than its
implementation: it hashes `system|type|injectTime|rootCauseEntityId|window.start|window.end`, so
moving any of those six by a minute produces a different case. That is exactly right for
`PUBLIC_SET_CONTAMINATION`, which claims "this case **is** that published case". It is blind to "these
two cases are one incident", which is a statement about degrees.

Two arms were added, both restricted to pairs inside one system:

| arm | compares | code | default | corpus |
| --- | --- | --- | --- | --- |
| task text | set Jaccard over `query` tokens, function words dropped | `NEAR_DUPLICATE_QUERY` | 0.90 | closest **0.25** |
| window | IoU of two half-open `[start, end)` windows | `OVERLAPPING_WINDOW` | 0.50 | widest **1/6** |

Three details in that table are decisions rather than incidentals. The stop-word list is applied to
both sides, which is what pulls two prompts differing only in `The`/`A` from 0.77 to exactly 1.00 and
pushes a topical coincidence down -- the coincidence was carried by `after`, `while` and `at`. A CJK
character is a token of its own, because `[a-z0-9]+` alone tokenises `订单服务变慢了` to the empty set and
an empty set would then have to be reported as either a duplicate or a skip, and both are wrong. And a
bound `Date.parse` cannot read is **declined** rather than parsed: NaN propagates into the ratio, every
comparison against NaN is false, and the pair is reported clean over a window nobody read.

### 二、The corpus guard asked the gate one case at a time

`check-fault-cases.mjs` asks G5 of every case, and builds the bundle as `{ cases: [parsedCase] }`. For
the four arms above that shape is right. `DUPLICATE_CASE` compares a case with the ones before it, and
a bundle of one has none -- so it could not fire in that loop if the corpus held one incident ten
times, and neither could either new arm.

The proof was already in the tree, and this is the part worth recording: `check-fault-cases.test.ts`
builds ten carriers of a difficulty label by deep-copying one annotation and changing only `caseId`.
Same prompt, same `injectTime`, same window, ten times -- and **v3.67 was green on it**. The fixture
was not wrong about difficulty; it was answering a question about levels with a set that is also a
duplicate-detection specimen, and nothing was reading the second question. Adding the arms turned that
fixture red, which is the rule working, and the fixture now moves the prompt and the window with the
index because a copy is a carrier of one label and nothing else about it is under test.

The guard now also asks G5 of the whole corpus once, filtered to the three codes whose subject is a
pair (`DUPLICATE_CASE` included -- it had the same blindness for the same reason). The filter is a
statement about where each arm reads its subject, not a preference: the four per-case arms have
already been asked with a better subject line, and reporting them twice would report one defect under
two names.

### 三、With no witness in the corpus, the maximum is the evidence

435 pairs, all within one system, and the closest is 0.25 against a line at 0.90. A rule whose only
failure is synthetic is a rule this list has learned to distrust, so the repair was not to skip the
rule but to make it publish what it measured: `readPairSimilarity` returns both maxima beside both
thresholds, `describePairSimilarity` prints them, and `check-fault-cases.mjs` prints that sentence on
both exits --

```
pairwise similarity: 435 of 435 pair(s) share a system, and 435 carry task text on both sides;
closest task text 0.25 (...) against a 0.90 threshold, most overlapping window 0.17 (...) against
0.50; 0 near-duplicate(s) and 0 overlapping window(s)
```

-- so the two defaults stop being unstated judgements. A corpus drifting towards duplication raises
the maximum long before it crosses the line; the margin is a printed number (3.6x and 3.0x) that a
test asserts and refuses to let fall below 2x. Without that line the same rule would have said
`passed`, which is what a rule that never ran its body also says.

**Three figures, one name.** The arm's maximum had been published three times and no two agreed:
`progress.md` said **0.308**, the probe written before the implementation said **0.2414**, and the
rule itself says **0.25**. The first cannot be reproduced by any tokenisation in the tree; the second
came from a shorter stop-word list than the one that shipped. All three are far below 0.90, so the
conclusion never moved and the reading did, three times. The open-list entry now carries the figure
the rule computes, and a test asserts the number rather than a bound so the next drift is a red test.

### 四、Two numbers that were readings once

`readPromptLeaks` argues for its normalisation with `3 of 30` against `19 of 30`. Both were true when
written and both stopped being true in **the same round**: v3.66's `b16892f` rewrote the corpus's task
texts so that none names its component, and both forms now report `0 of 30`. The volume records the
repair; the comment, two directories away, described the defect in the present tense (finding 480).
The figures are kept and dated -- they are the argument for the rule's shape -- and the comment now
points at the line `check-fault-cases.mjs` prints on every run for the current value. `seventeen` in
that sentence was also wrong: 19 - 3 is sixteen.

The same shape turned up in `docs/progress.md`, in the `## Coverage` table, where it is worse.
`check-doc-counts` guards the suite counts and nothing guards the coverage figure, so the table
published `99.96 / 99.93 / 100 / 99.96` while every ledger for eight rounds read `99.96 / 99.75` and
then `99.97 / 99.80`. **99.93 was never a measurement** -- it was typed, under a sentence beginning
`Measured by` (finding 481). The table now carries the measured figures, the date, and the sentence
that says it is retaken when the residual's shape changes rather than every round.

Three figures about this repository are published twice: the suite counts (guarded), the gate-site
count (derived), and the coverage figure (neither, and therefore the one that was wrong). The rule is
not "guard everything". It is that a number with two copies needs one of them to be computed rather
than remembered.

### Five、What the gates cost to extend

Seven injections were added, one per guard the new arms carry, because a fixture is the whole evidence
here rather than a second opinion: **28 injections became 35, witnesses 33 became 41** (the stop-word
injection breaks two tests, the headline refusal and the one that holds the published list to the
filter). The battery's own pre-flight had to learn a distinction it had documented and never
implemented: its subject is now a `.ts` file, and `node --check` reads TypeScript as JavaScript, so
all seven rows came back `UNPARSEABLE` on the first run -- the instrument answering a question about
itself. The suffix decides which question is answerable now, and the runner's own transform failure
decides for the rows that have no answer from `node`.

Two uncovered branches were found by the coverage run and closed by tests rather than by exemptions:
the sentence's second null (`no pair had two readable windows`, the mirror of the first), and a
degenerate zero-length window. A third was a guard that could not be reached -- `jaccardOf`'s
empty-set test, which the caller already performs under `skippedNoQuery`, because "the two prompts
share nothing" and "one prompt was not there" are two findings. It was deleted with that sentence
written where it stood, which is how `gates/gates.ts` goes to **100 / 100 / 100 / 100**.

### Readings

> Ledger for `v3.68`.

| item | value |
| --- | --- |
| `core` test suite | **240 files, 6104 tests passed** (at v3.68) |
| `cli` test suite | **4 files, 187 tests passed** (at v3.68) |
| repo test suite | **244 files, 6291 tests passed** (at v3.68) |
| coverage | `core` **99.97 / 99.80 / 100 / 99.97**, `cli` **100 / 100 / 100 / 100** (statements / branches / functions / lines); `gates/gates.ts` is **100 / 100 / 100 / 100** |
| new tests | **22** (6,082 -> 6,104), all in `gate-pair-similarity.test.ts`: the two arms' refusals, the two sentence branches, the tokeniser and the stop-word list that uses it, the corpus readings, and four boundaries -- cross-system, absent prompt, unreadable bound, zero-length window -- plus the repeated-`caseId` pair. One fixture was edited in place: `check-fault-cases.test.ts`'s ten copies now vary their prompt and window, because a set of ten identical incidents is a duplicate-detection specimen |
| new mutations | **7** injections in `gate-tests-battery.py` (PAIRS 1-7); **28 -> 35** injections, **33 -> 41** witnesses, all 34 reachable rows CAUGHT and 1 redundant as declared |
| the arms | **2** new G5 codes; **435** pairs compared; closest task text **0.25**, most overlapping window **1/6**, **0** and **0** refused |
| the figures | **0.308 -> 0.2414 -> 0.25**: three readings of one maximum, the last one reproducible by the rule and asserted by a test |
| the gate | **4 of 6** arms compared a case with something that is not a case; the corpus guard fed it **1 case per bundle**, so the pairwise ones could not fire even on ten copies |
| the coverage table | `99.96 / 99.93 / 100 / 99.96` -> **99.97 / 99.80 / 100 / 99.97**; 99.93 was typed, not measured |
| the claims | **207** claim(s) across **58** file(s), **128** failure site(s) -- unchanged: this round's prose names no count in the shape the rule reads, and the two figures that moved are readings rather than claims |
| the list | **22 -> 22** open: this round closed the G5 item and opened one about the coverage table's missing reader |

### Left open, in the order the goal is reached

| priority | item | state | next step |
| --- | --- | --- | --- |
| **P2** | G3's two thresholds have no grid | unchanged: the defaults are a judgement nothing has defended | a 4x4 grid and a rule that refuses a default on a slope |
| **P2** | `rulegen` has no refusal count and no agreement reading | unchanged: the thirty human annotations already exist and nothing compares against them | agreement with a fixed answer set, and the absence of kappa stated as a choice |
| **P2** | `score` divides by a different denominator per target | unchanged: the sentence needs a measurement under it | a test asserting two targets' check counts differ |
| **P2** | `docs/acceptance.md` is 96 KB and grows by clause per round | worsened this round by six clauses: L3 and L4 are the two large layers | move the per-round clauses to a volume, after measuring how many sections match that shape |
| **P2** | Cloud-OpsBench has no established vendor | unchanged: the field is `null` and the page prints *not established* | read the paper's author block, as `openrca-2.0`'s was read, and record the line the value comes from |
| **P2** | two prose targets cite a paper no digest pins | unchanged: `itbench` and `cloud-opsbench` print an arXiv id beside the one the corpus pins | a sha256 and a byte count per paper, or a declaration saying the id is all this repository read |
| **P3** | the coverage figure has no reader that computes it | new this round: the table was wrong by 0.13 branches for at least eight rounds, and it is now correct by hand | a `docs:check` step that reads a coverage report when one exists, or a sentence saying the ledger is the only copy |

**The lesson.** Both of this round's first two findings are the same sentence: *a comparison needs a
second case.* G5 compared a case with a pattern, a fingerprint, a declaration and a name -- four
readers, all of them about one case -- and the one claim that needs two cases had none. The guard that
feeds it compared one case at a time, so the arm, once added, would still have been silent had it not
been asked again over the whole set. The third finding is the same sentence about documents: a figure
needs a second reader, and the copy that has one is the copy that stays true.

## v3.69 — 两条从没被人动过的阈值，和一个只存在于库里的通道

### 一、网格十六格一个答案，而那不是网格通过了

`checkG3Validity` 用「某个指标在注入后连续 3 个样本 `|Z| >= 2.0`」接纳一个案例。两个数都是带默认值的参数，两个默认值都内联在函数里，而树里没有任何东西问过它们两侧是什么样。网格的答案是：**什么都没变**。

| 单元 | 接纳 | 单元 | 接纳 |
| --- | --- | --- | --- |
| `\|Z\| >= 1`，1 样本 | 30 / 30 | `\|Z\| >= 10`，1 样本 | 30 / 30 |
| `\|Z\| >= 1`，8 样本 | 30 / 30 | `\|Z\| >= 100`，8 样本 | 30 / 30 |

十六格，一个判决。这不是网格通过了，是**语料看不见阈值**——而网格的职责正是分清这两件事。分开它们的是每个案例的**翻转点**：它仍能撑住 3 个样本的最大 `\|Z\|` 线，也就是最佳三窗里最小的那个 z（闭式，不用搜索）。

| 量 | 值 |
| --- | --- |
| 被判决的案例 | **30** |
| 最弱的翻转点 | **126.85** —— `history-resource-ephemeral-capacity-image-builder` |
| 最强的翻转点 | **3.15e12** —— `history-kafka-consumer-lag` |
| 相对默认线的余量 | **63.42 倍** |
| 单个案例能给的最多样本 | **8** |

原因是语料的构造而不是门禁：派生序列从基线一步跳到 post 值，计数器的前置窗口精确平坦，于是 `stddev` 是零或 2% 抖动，z 就成了步长与**那个**的比值——最弱 126，最强 3.15e12。这样造出来的语料测不了阈值，这正是 `probe-z-floor` 关于 `epsilon` 的发现（finding 288）低一层的样子。

**网格还能辩护什么。** 顺序：任一条轴抬高，被拒数不会下降，十六格全部断言过，所以这是一个曲面而不是十六次互不相干的测量。**不能辩护什么：**数值——1 到 100 之间任何一条线在这份语料上给出同一个判决，所以默认值是一个语料对它保持沉默的判断。读数不假装相反：`check-fault-cases.mjs` 在两个出口都把余量印在网格旁边，清单条目改写为「语料回答不了什么」而不是「网格没测出什么」。

**让答案可信的形状。**网格与判决是同一次计算：`metricGroups`、`absZScores`、`flipPoint` 与 `checkG3Validity` 共用，一条测试把每一格拒掉的集合与 `checkG3Validity` 自己的违规逐格比对。十六格与门禁一致，那是对门禁的读数；十六格由第二份实现算出，那是第二条规则——上一轮刚为这件事付过账（finding 479）。

写它的时候抓到两个小东西。`G3_DEFAULTS` 现在存在，网格读的是门禁应用的数而不是复述的；而这个读数的第一版**只给调用方轴上的样本线**算翻转点，于是问了个更窄问题的调用方被告知「没有任何案例撑住 3 个样本」——而那个案例撑住 62 个。把网格形状的读数当成语料的读数，被那条故意问窄问题的测试抓住。

### 二、一个只存在于库里的通道，和一张写了两遍的表

清单条目说：`rulegen` 没有拒绝计数、没有一致率，「没有任何东西把它和已经存在的三十条人工标注比对」。三句话里两句是错的，第三句才是要害。

**那三十条标注属于另一个通道。** `golden-master/fault-extraction/samples.json` 有三十条手写事故文本与期望的 `type`/`category`/`component`，`buildExtractionReport` 把一次运行与之比对：命中、miss、分层比率、miss 分类、严格阈值。`fault-extraction-accuracy` workflow 调用它。所以那条条目指向的标注集**早就被读了**——被从文本抽取故障的通道读，而那不是 `rulegen`。

**而 `rulegen` 根本没有调用方。**`buildRulegenPrompt`、`parseRulegenResponseChecked`、`validateGeneratedLayout` 从 `index.ts` 导出，在 `src/` 与 `scripts/` 里除了自己和测试之外无人调用。每个被摄取的文件走的是 `ingest/prime.ts` 的别名表。所以「没有拒绝计数」不是一个缺失的测量，而是一个无人调用的函数的正确报告；对模型输出报一个一致率，描述的是一个不运行的通道。

**表才是值得修的缺陷。**`REQUIRED_FIELDS`——一个布局必须映射哪些字段才算可读——被逐字节写了两遍：`ingest/prime.ts` 一份决定能否调用 `ingestFile`，`llm/rulegen.ts` 一份决定模型的映射是否完整。两者在本轮开始时完全相同，而没有任何东西把它们拴在一起；一旦分叉，就会出现「验证器接受的布局被摄取拒绝」，而那句报错会写**缺列**而不是两个表不一致。这与 v3.67 的 `contractVersion`、v3.68 的停用词表是同一个缺陷的第三件外衣：**一个事实，两个写者，没有规则。**表现在住在 `ingest/file.ts`（它拥有 `FileLayout` 与 `FileSignalKind`），两个模块都导入它，分叉不再可表达。

### 三、答案集量的是什么

`golden-master/rulegen-layouts.json` 里十六个手写案例：一个表头行、两三条样本、一个仔细的人类读者会给出的布局，以及——模型那一侧——整段候选回答，按模型出错的方式写。读数报两个**不是同一个断言**的数：

| 通道 | 数 | 量的是什么 |
| --- | --- | --- |
| 别名表 | **14 / 16** 个指定布局 | 发的是它：差在两个值列不在其词表里的案例 |
| 验证器 | **16 / 16** 个判决，9 接受 / 7 拒绝 | 对回答的守卫：拼错的字段、不存在的列、空格、缺必需字段、错模态字段、编造的枚举值、超过 1 的置信度 |
| 理由 | **7 / 7** | 理由错的拒绝等于答案错而退出码对 |
| 它看不见的那一类 | **1** | 一个被接受的回答把 `metricValue` 指到 `limit`，而答案集说 `usage` |

最后一行是值得有的那个读数。`validateGeneratedLayout` 把布局对样本重放，所以它拒绝的是缺失或空的列——一个**结构性**检查。指到一个真实、非空、含义错误的列，它能通过。验证器对自己的契约是对的，通道对数据是错的，一个数载不动两个断言。

**kappa 缺席，而缺席本身就是主张。**Cohen's kappa 需要两个独立标注者；这十六个表头、指定布局与候选回答出自同一个作者。所以这个数是与**指定答案**的一致——弱于标注者之间的一致——每一句印它的话都说明是哪一种。另一种做法是把数字不加限定地印出来，而那是弱主张被读成强主张的路径。

### 四、两轮之间格式上的一个共同点

网格与答案集是同一个形状：把默认值的一个决定放进一张表，把表**不能**决定的东西报在它**能**决定的东西旁边，并且拒绝让一个数被印出来而不带那句「它是关于什么的数」。一个默认值和一个比率是同一件东西：一个其辩护住在敲下它的人脑子里的数字。

### 五、一条只在别人的回退里成立的导入路径

全量跑在这一轮红了十二个文件，其中十一个是子进程超时——机器被上一次覆盖率跑压住了，重跑即绿。第十二个不是：`published-refusals.test.ts` 报 `ERR_MODULE_NOT_FOUND`，说 `../../scripts/format-spec.mjs` 找不到。

那个文件在 `packages/core/test/` 下，所以 `../../` 是 `packages/`，而 `packages/scripts/` 在树里不存在。路径**从来**就是错的。它一直能跑，是因为 vite-node 把树外模块当作外部依赖之前先按自己的根解析了一遍；当那次运行没有走那条回退（同一台机器、同一份文件、同一分钟，前一次红后一次绿），node 按 importer 解析，于是拿出一个没人写过的路径。

守卫不是把这一行改对就完事——**一条只在某个加载器的回退里成立的路径，下一轮会以同样方式再出现一次**。`scripts-are-classified.test.ts` 里已经有一个读 `from '…/scripts/x.mjs'` 的正则，用来禁止测试导入 gate；它被扩成同时读出整条 specifier，于是同一个读取器多出一个问题：这条 specifier 按写它的那个文件解析，落不落在一个真文件上。

守卫第一次运行就报了**两条**，两条都是散文：守卫自己的 doc comment 写出了那个形状，控制用例把形状引在字符串里。一条会因为自己的注释而红的守卫会被删掉，所以扫描前先去注释（`//` 必须紧跟在空白之后，这样字符串里的 `http://` 不会被读成注释开头），并把这三种情况写成控制断言。随后它报出的唯一一条 offender 就是真文件里那一行，而把那一行改回错的，它会再次点名报告。

| 读法 | 结果 |
| --- | --- |
| 全树 `scripts/*.mjs` specifier | **42** 条，全部落在一个真文件上 |
| 修之前 | 1 条落在 `packages/scripts/`——一个不存在的目录 |
| 同一条 specifier 的外部依赖路径 | node 按 importer 解析 → `ERR_MODULE_NOT_FOUND` |

这件事的形状值得记下来：**红一次、绿一次、同一份文件**，如果只看后来的绿，它就是「机器抖了一下」。可用的线索是错误自己说的那句话——它报的路径没人写过。一个真缺陷与一次抖动的区别，经常只是错误信息里那个路径存不存在。

### Readings

> Ledger for `v3.69`.

| item | value |
| --- | --- |
| `core` test suite | **243 files, 6191 tests passed** (at v3.69) |
| `cli` test suite | **4 files, 187 tests passed** (at v3.69) |
| repo test suite | **247 files, 6378 tests passed** (at v3.69) |
| coverage | `core` **99.97 / 99.80 / 100 / 99.97**, `cli` **100 / 100 / 100 / 100**; `gates/gates.ts` and `llm/rulegen-agreement.ts` are **100 / 100 / 100 / 100** |
| new tests | **56** (6,104 -> 6,160): **20** in the new `gate-threshold-grid.test.ts`, **27** in the new `rulegen-agreement.test.ts`, **2** in `check-fault-cases.test.ts` (the corpus reading and its refusal), **3** in `rulegen.test.ts` (the one-writer table), **1** in `scripts-are-classified.test.ts` (the depth guard over every script specifier), and **3** produced by the `it.each` tables that read the registers this round extended -- `export-surface-enumerated.test.ts` alone accounts for two, measured by running its previous revision beside it |
| new mutations | **7** injections in `gate-tests-battery.py` (GRID 1-3, LAYOUT 1-4); **35 -> 42** injections, **41 -> 51** witnesses. Two of the ten new witnesses are second tests on one injection: withdrawing the grid's inclusive boundary is seen by the sixteen-cell agreement test as well as by the boundary case, and withdrawing the wrong-column comparison is seen by the shipped reading as well as by the planted one. All 41 reachable rows CAUGHT, 1 redundant as declared, 0 survived, 0 inert, 0 unattributed |
| the grid | **4x4** cells over `\|Z\|` 1/2/10/100 and 1/3/5/8 samples; **30 of 30** admitted in every cell whose sample line is reachable; weakest flip **126.85**, margin **63.42x**; **8** samples is the tallest line the corpus can satisfy |
| the answer set | **16** authored cases; alias table **14 of 16**; validator **16 of 16** verdicts (9 / 7), reasons **7 of 7**; **1** accepted answer maps a field to another real column |
| the second writer | `REQUIRED_FIELDS` **2 -> 1**: moved to `ingest/file.ts` and imported by `prime.ts` and `rulegen.ts`; a test refuses a layout missing exactly one required field, for every field of every kind |
| the channel | `rulegen` has **0** production callers; the thirty extractions annotations the open-list entry cited belong to `fault-extraction`, which reads them through `buildExtractionReport` |
| the claims | **213** claim(s) across **59** file(s), **132** failure site(s), from `gate-sites.json` |
| the list | **22 -> 22** open: two closed (G3's grid, `rulegen`'s reading), two opened (the corpus cannot move the `\|Z\|` axis; the validator cannot see a wrong-but-valid mapping) |

### Left open, in the order the goal is reached

| priority | item | state | next step |
| --- | --- | --- | --- |
| **P2** | **The corpus cannot move the z-score axis** | new this round: every case's flip point is at least 63x the line, so the grid is a constant | a case whose separation sits near 2-4 sigma, so the threshold has something to decide; the flip-point reading is what a reader checks it against |
| **P2** | `score` divides by a different denominator per target | unchanged: the sentence needs a measurement under it | a test asserting two targets' check counts differ |
| **P2** | `docs/acceptance.md` is 96 KB and grows by clause per round | worsened this round by six clauses | move the per-round clauses to a volume, after measuring how many sections match that shape |
| **P2** | Cloud-OpsBench has no established vendor | unchanged: the field is `null` and the page prints *not established* | read the paper's author block and record the line the value comes from |
| **P2** | two prose targets cite a paper no digest pins | unchanged | a sha256 and a byte count per paper, or a declaration saying the id is all this repository read |
| **P3** | **The layout validator cannot see a wrong-but-valid mapping** | new this round: **1** of the 16 cases is accepted and misreads a column | a second reader for the model-side channel when it gets a caller, or a stated limit on what a replay can claim |
| **P3** | the coverage figure has no reader that computes it | unchanged | a `docs:check` step that reads a coverage report when one exists, or a sentence saying the ledger is the only copy |

**The lesson.** Both items this round were a number with nothing under it, and both times the repair was to compute what the number was *of*. The thresholds had no grid, so nobody could say whether 2.0 was defended or merely unexamined; the answer is that the corpus is silent about it, and only a flip point can say which. The channel had no rate, so the entry said the rate was missing; the answer is that the channel has no caller and the annotations belonged to a neighbour, and the thing actually worth repairing was one table written twice. **A default is a claim about a distribution, and a claim about a distribution needs the distribution to be able to disagree with it.**

## v3.70 — five denominators behind one percentage, and a corpus that could not see its own threshold

The score is a percentage over the checks a target declares: nine targets over **five** counts
(14, 9, 8, 7, 2), eight of them printing `100`, and without anchors only **two** values are
reachable because `creditFor` was `passed ? rate : 0` and `rate` could only be 0 or 1.
`ScoreReport.terms` carries the counts and `describeScore` prints
`score 100 of 100 over 14 structure check(s)` everywhere (finding 485).

The constant grid was arithmetic: the fixed ±2 % jitter fixes every sampled spread at about
1.34 % of its mean, so no authored incident could sit near the line. A faint case (TTL 284 where
the runbook says 300; **1100 -> 1164** rps; **240 -> 254** ms; no errors) separates by about
**3 sigma**, and a neighbour of the default now refuses it: flip **3.38**, `1.69x`, against
`126.85` / `63.42x` last round (finding 486).

Growing the corpus had a price, measured: the key is **31** samples over **30** types, **1** sample
has no recorded run (named by `m1-reading-is-reproducible.test.ts`), and the M1 ceiling moved from
25 of 30 to **26 of 31**. `validateGeneratedLayout`'s reach is stated where the rule lives and
pinned by an accepted misread the correct mapping also passes (finding 487).

### Readings

> Ledger for `v3.70`.

| item | value |
| --- | --- |
| suites | `core` **243 / 6174**, `cli` 4 / 187, repo **247 / 6361**, all green |
| coverage | `core` **99.97 / 99.82 / 100 / 99.97**, `cli` **100 / 100 / 100 / 100**; `score/score.ts` and `report/html.ts` **100** in all four |
| new tests | **14**: 9 `score-denominators`, 1 `rulegen`, 2 `html`, 1 `score`, and the count guards |
| mutations | **42 -> 45** injections, **51 -> 54** witnesses; 44 caught, 1 redundant, 0 survived / inert / unattributed |
| grid | **31 of 31** at default, **1 of 4** neighbours changes it, worst flip **3.38** (`1.69x`) |
| corpus | **31** cases / **31** samples / **30** types; **1** sample with no recorded run |
| list | **22 -> 21**: three closed, two opened |

**The lesson.** A number without its denominator is a label: a percentage over five populations, a
grid over a corpus that could not reach the line, and a validator's verdict read as meaning. Each
repair made the number *arguable* rather than different.
## v3.71 — a shape whose name carried a duration, and the denominator a reading never printed

The threshold grid had four sample lines and one verdict: 1, 3, 5 and 8 all admitted all
thirty-one cases, because `expandSeries` gave every post-onset sample the post value and
`longestRun` therefore counted to eight in every case. The vocabulary was the reason.
`SERIES_DERIVATIONS` held `step`, `counter` and `spike`, and `spike` was a step with a hold of one —
a **duration written into a shape's name**, and the only duration it could carry was one sample. A
schema that can say "the whole post-window" or "exactly one sample" and nothing between cannot
answer a question about how long an excursion has to last, and the sample axis is exactly that
question. `hold` says the number: `spike` retired into `hold: 1`, the vocabulary lost a word, and
the range it gained is what moved the axis (finding 488).

The corpus's first self-clearing case is what exercises it: merge threads at **0.12 -> 0.98** for
four post-onset samples, cluster lag **1.2s -> 84s**, catalog p99 **40 -> 300ms**, and an error
ratio that never moves. Four is derived rather than chosen — G4 accepts a case only when both
baselines place the answer, the robust baseline reads the post-window's **median**, and a median
over eight samples is the mean of the fourth and fifth: four elevated samples put it between the
levels, three leave it on the baseline. The grid now reports **2 of 4** neighbours changing the
verdict, and the two reasons are different — too weak on the `|Z|` axis (the v3.70 faint case,
flip **3.38**), too short on the sample axis.

The second reading had no denominator at all. `record.key.size` is the key **on the day the reading
was taken**, the tree's key is a different number, and a reader comparing a total with either was
choosing a denominator without being told which. `describeReadingCoverage` writes
`the reading answers 30 of the 32 sample(s) the key holds; unanswered: …`,
`score-fault-extraction.mjs --record` prints it beside the report, and the M1 test pins the whole
line — so the two numbers are one sentence instead of two facts a reader had to reconcile
(finding 489). The extra answers are a separate clause rather than folded into the count: a reading
that answers an id the key does not carry was taken against a different text, which is a different
defect from a smaller key.

### Readings

> Ledger for `v3.71`.

| item | value |
| --- | --- |
| suites | `core` **243 / 6186**, `cli` 4 / 187, repo **247 / 6373**, all green |
| coverage | `core` **99.97 / 99.82 / 100 / 99.97**, `cli` **100 / 100 / 100 / 100**; `derived-telemetry.ts` and `reading-record.ts` **100** in all four |
| new tests | **12**: 2 `hold`, 4 refusals, 4 coverage sentences, 2 script lines |
| mutations | **45 -> 48** injections, **54 -> 57** witnesses; 47 caught, 1 redundant, 0 survived / inert / unattributed |
| grid | **32 of 32** at the default, **2 of 4** neighbours change it — `|Z| >= 10` too weak, **5 samples** too short |
| corpus | **32** cases / **32** samples / **30** types; **2** samples with no recorded run |
| list | **21 -> 20**: two closed, one opened |

**The lesson.** A name can hide a number. `spike` read as a shape and was a duration of one, so the
axis that asked about duration could not be moved by any file the schema admitted. Naming the number
moved the axis; naming the denominator made the reading's own ratio printable. Both repairs are the
same move — take the quantity out of the word and put it where it can be measured.

## v3.72 — the duration a case stated and the one its telemetry held

`hold` was the whole of v3.71's repair, and it took one round to show that the field does not only
express a duration — it *checks* one. `history-resource-merge-burst-search-cluster` says its merge
"stayed there for four minutes", declares `burstMinutes: 4`, cites that parameter from a checkpoint,
and ships `hold: 4`. A hold counts samples, and a sample in that window was 3.5 minutes long, so the
plateau ran from 14:12 to 14:26 — **fourteen minutes of telemetry under a sentence that says four**.
The two numbers were the same number, which is exactly why nothing looked.

The class is older than the case. `history-network-partition-search-cluster` has said since it was
annotated that "the seventeen minutes are the gap between 03:02 and 03:19", in a window that ended at
03:40: its member count stayed halved for **thirty-eight** minutes. Before `hold` no case could state
an end at all, so a window was the only duration a case could have, and a window that outlives the
sentence was not a contradiction anyone could write down (finding 490).

Both repairs move the geometry rather than the sentence: the merge-burst window now ends at 14:20 and
the partition window at 03:19, so a sample is a minute in the first and the second ends where its own
text says the links came back. `readPostSampleSpacing` computes the number nobody wrote down —
`(windowEnd - onset) / SERIES_POINTS` — and `readDurationRestatement` asks the only question a file
can be held to: a parameter whose value **is** the hold is asserting that one sample is one unit of
that parameter, and the window either makes that true or it does not. It refused one case in the
shipped corpus before the repair and was silent about the other seven time-unit parameters, because
`splitDurationMinutes: 17` beside a hold of eight is a different quantity rather than a restatement.

The sample axis got its second witness the same round, because a grid that measures duration should
be able to tell two durations apart. `history-queue-disk-watermark-batch-drain` is a six-minute
burst at one sample a minute: the topic's disk climbs 35 % -> 92 %, append p99 8ms -> 240ms, consumer
lag 40s -> 900s, and the export's segments are reclaimed once the batch ends. At the 5-sample line the
four-sample case is refused and the six-sample one is not; at the 8-sample line both are — so the two
land in **different cells**, which is what a second witness is for. The neighbour count cannot show
it, because 8 is two steps from the default 3: the reading now prints the axis itself,
`the sample line refuses 0 / 0 / 1 / 2 case(s) at 1 / 3 / 5 / 8`, and the test pins the staircase.

The smaller finding came free with that case. `assessDiscriminatingPower` reports two alternative
readings, each with the types it disagrees with, beside a union of them. The union was a `Set` and the
two lists were arrays, so the fields disagreed about what they counted — and until this round no type
had two samples. With two `queue-disk-watermark` samples both disagreeing, the row-shadowing list came
back with five entries and four types, in a field documented as "the expected types this reading
classifies differently": a count of rows wearing a type's name (finding 491).

### Readings

> Ledger for `v3.72`.

| item | value |
| --- | --- |
| suites | `core` **243 / 6191**, `cli` 4 / 187, repo **247 / 6378**, all green |
| coverage | `core` **99.97 / 99.82 / 100 / 99.97**, `cli` **100 / 100 / 100 / 100** |
| new tests | **5**: the spacing reading, the refusal, the acceptance, the silence for a different quantity, the silence for a non-time unit |
| mutations | **48 -> 50** injections, **57 -> 59** witnesses; 49 caught, 1 redundant, 0 survived / inert / unattributed |
| grid | **33 of 33** at the default, **2 of 4** neighbours, and the axis prints **0 / 0 / 1 / 2** at 1 / 3 / 5 / 8 samples |
| corpus | **33** cases / **33** samples / **30** types; **3** samples with no recorded run; **528** pairs, 496 -> 528 |
| windows | merge-burst post **38 -> 8** minutes, partition post **38 -> 17** minutes, both to match their own prose |
| ratchet | the L4 slack **2 -> 1**: five of thirty-three is 0.152, four of thirty-two 0.125, three of thirty-one 0.097 |
| list | **20 -> 21**: one closed, two opened |

**The lesson.** A field that states a quantity also states what it is measured in, and a case that
writes the same number twice in two units has written one fact and broken it in one place. `spike`
hid a duration inside a name; `burstMinutes: 4` beside `hold: 4` hid the *unit* inside an
agreement — four of what, against four of what — and both were repaired the same way: compute the
number that sits between the two statements and refuse the file that cannot say it.

## v3.73 — which of a case's numbers is its own length

v3.72's rule compared a parameter with the *count*: `burstMinutes: 4` beside `hold: 4` was read as one
fact written twice, and refused when the window made a sample longer than a minute. The hole is one line
of arithmetic away. Write `burstMinutes: 5` beside `hold: 4` in a window whose samples are 3.5 minutes
apart, and the file says **five minutes** about an episode of **fourteen** — and the rule says nothing,
because five is not four. It was comparing two numbers instead of asking what the parameter is for.

The corpus says so itself, in the only place that can. It carries **fourteen** time-valued parameters and
five of them are the episode (`burstMinutes` twice, `splitDurationMinutes`, `durationMinutes` twice); the
other nine are knobs the fault ran under — `terminationGracePeriodSeconds: 30` is a kubelet setting,
`retentionGapHours: 31` is a gap the ticket measured, `readyAfterSeconds: 40` is how long a replacement
took to serve. No rule over the names separates the five from the nine: guessing would be right five
times and wrong nine, which is the shape `spike` had when a duration was hidden in a name. So the file
answers instead — `fault.durationParameter` names the one parameter that states how long this fault
lasted — and `readDurationClaim` reads that number against `hold x spacing`, in the parameter's own unit,
to the millisecond.

**It found two cases on its first run, both of them stating a length their own file contradicted twice.**

`history-dependency-upstream-5xx-pricing` declares `durationMinutes: 18` and its window ended at 09:42
from an onset of 09:12 — thirty minutes of post side at 3.75 minutes a sample, with no `hold`, which is
the declaration "elevated for all eight". Its own log line reads `degradation window 09:12-09:30 UTC`,
so the file held three statements of one span and the two a reader would trust most disagreed.
`history-dependency-schema-change-currency-feed` declares `durationMinutes: 120` and its window ended at
11:30 from 09:00 — a hundred and fifty minutes at 18.75 a sample — while a checkpoint description in the
same file said "the two hours between the deploy at 09:00 and the revert at 11:00" (findings 492, 493).

Both carried a note saying *"the readings are shares and carry no duration of their own"*. The note was
written to explain why no reading cites the parameter, and it answered a different question: a share that
is elevated from the onset to the window's edge is an episode with a length, and the length is the whole
post side. **The window moved, not the sentence** — 09:30 and 11:00, the two times each file already
named — so one sample is 2.25 minutes in the first and fifteen in the second, and eight of them are
exactly the eighteen and the hundred and twenty the parameters state.

The rule refuses four things, each with a different repair: a name the case does not declare, a value that
is not a quantity in a unit of time, a case whose series draw no excursion at all, and a number the
episode contradicts. A case that names nothing is **not** refused — it makes no claim — which is the
boundary `fault.parameterNotes` draws from the other side, and why the run prints the answer instead of
asserting it: `37 spoken for (34 percent: 36 cited by a reading, 5 named as the length of their episode,
4 of them both), 72 explained by a note`. Five declarations is a small number and it is the honest one;
the alternative was a rule about the annotation's vocabulary that would have refused nine legitimate
knobs.

The battery then found a test of mine that could not tell two readings apart. The injection that inverts
the flat-series skip was credited **UNATTRIBUTED**: twenty-two tests went red and the named witness was
not among them, because the fixture's control series held for the same four samples as its excursion, so
both readings produced 840,000 ms and the assertion passed either way. The control now holds for one
sample, and the same mutation fails the same test for the reason it was written for. That is the second
time this campaign has caught a witness that agreed with itself (finding 158 was the first), and the
first time the battery caught it before the round ended.

### Readings

> Ledger for `v3.73`.

| item | value |
| --- | --- |
| `core` test suite | **244 files, 6214 tests passed** (at v3.73) |
| `cli` test suite | **4 files, 187 tests passed** (at v3.73) |
| repo test suite | **248 files, 6401 tests passed** (at v3.73) |
| coverage | `core` **99.97 / 99.82 / 100 / 99.97** (statements / branches / functions / lines), `cli` **100 / 100 / 100 / 100**; `fault/duration-claim.ts` is **100 / 100 / 100 / 100** |
| new tests | **6191 -> 6214, +23**: sixteen in the new `duration-claim.test.ts` (six refusals, four episode readings, the tolerance, the corpus reading), four in `check-fault-cases.test.ts` for the wiring, and three from the `it.each` tables that read the registers this round extended -- `export-surface-enumerated.test.ts` runs two of them over the module list and one over every source file, so the new module is three tests |
| mutations | **50 -> 55** injections, **59 -> 65** witnesses; 54 caught, 0 survived / inert / unattributed, 1 redundant as declared |
| corpus | **33** cases unchanged; **5** name their own length; post windows **30 -> 18** and **150 -> 120** minutes |
| parameters | **37 of 109** spoken for, up from 36: one note became a checked number; notes 72 |
| grid | **33 of 33** at the default, **0 / 0 / 1 / 2** at 1 / 3 / 5 / 8 samples — unchanged, because a narrower window moves no value |
| list | **21 -> 22** open: one closed (the duration rule), two opened (the field can be deleted; a window can outlive a sentence) |

**The lesson.** A rule that fires on two numbers being *equal* is a rule about a coincidence, and the
coincidence is the author's, not the file's. The corpus could not say "this number is my length" in any
vocabulary it had — `hold` counts samples, `parameters` are open, and a note is prose — so the missing
field was the answer and the arithmetic came after it. What the declaration buys is narrow and real: a
case that states its length can now be wrong in exactly one way, and that way is refused with the sample,
the count and both spans in the sentence.

## v3.74 — the level a case claims, and the level its chain earns

`difficultyFloor` refuses a level *below* the structure and says nothing about a level far above it.
`docs/data-model.md` permitted the excess on purpose, and the reason is real: a case can be hard to
detect while being easy to trace. What the permission did not require was an account of the excess, and
a permission with no condition is how a label stops meaning anything.

The corpus shows the price. **Six of its thirty-three cases claim above their floor, and one of them
claims `L4`** — the level the other four reach with three causal steps — **over a chain of one**:
`pricing-service -> tax-calculation` (finding 494). The published hardest-level share was therefore two
numbers wearing one name:

| reading | value | a property of |
| --- | --- | --- |
| cases that state `L4` | 5 of 33 = 0.152 | the annotations |
| cases whose chains earn `L4` | **4 of 33 = 0.121** | the corpus |

Both exports project the first: `cloudopsbench` as `difficulty`, `itbench` as `scenario_complexity`. So
the one-hop case ships as `hard` beside three-hop chains, and a consumer reading the ladder cannot tell
which is which.

The repair is the condition, in the shape `fault.parameterNotes` already has. `fault.difficultyNote`
says what the floor cannot see; `readDifficultyClaim` refuses a claim above the floor that does not
answer it, and refuses a note **at** the floor — where the label already makes the weakest claim the
structure supports, so there is no gap to explain. Six cases claim above and six answer, and the six
sentences name six different reasons, which is the evidence that the field is not a synonym for "hard":

- a delay that exists only as the difference between two normal readings on two clocks;
- an absence, where every rate that normally carries a fault stayed flat;
- a move three baseline standard deviations inside the band the alert treats as noise;
- a mechanism that is a nightly job's schedule and not an entity in the graph at all;
- a retention raised days before the window, which no reading records;
- an exception that closed a connection instead of nacking the message, so a dead job looks finished.

The note does **not** travel into a bundle, and that omission is deliberate: it is the one field
`assembleBundle`'s whitelist leaves out, because three of those six sentences name a mechanism, and a
mechanism is what a solver is supposed to produce.

**The distribution gate now reads two different numbers at its two ends.** The easy ceiling reads the
levels cases *claim*, over the cases that claim one; the hard floor reads the levels their chains
*earn*, over every case in the bundle. Each end reads the count the corpus cannot inflate: a case can
only push the easy number up by calling itself easy, and one that does so with a long chain is refused
as a shortfall before any share is computed, while a corpus could meet the hard number by relabelling —
which is the one thing the gate exists to be unable to reward. The new test for it is ten copies of a
case with no chain at all, every one labelled `L4`: by claim that is a corpus of the hardest level, and
the gate fails it.

**And the ratchet's one unit of slack was the case that never earned the level** (finding 495). The
arithmetic was right and the reading was wrong, because it dropped *cases* rather than *levels*, and one
of the five it could drop was the one-hop claim:

| reading | drop the claimed case | drop one earned case |
| --- | --- | --- |
| by claim, as it was | 4 of 32 = 0.125, holds | 4 of 32 = 0.125, holds |
| by earned level, as it is | 4 of 32 = 0.125, holds | **3 of 32 = 0.094, fails** |

So the corpus can afford to lose none of the four that earn it, and the case whose deletion costs
nothing is the one the gate never counted. That is a worse number than the test claimed and it is the
one the arithmetic supports. It also cannot move by relabelling any more, which is the half the round
bought.

### Readings

> Ledger for `v3.74`.

| item | value |
| --- | --- |
| `core` test suite | **244 files, 6225 tests passed** (at v3.74) |
| `cli` test suite | **4 files, 187 tests passed** (at v3.74) |
| repo test suite | **248 files, 6412 tests passed** (at v3.74) |
| coverage | `core` **99.97 / 99.82 / 100 / 99.97** (statements / branches / functions / lines), `cli` **100 / 100 / 100 / 100**; `fault/difficulty.ts` and `gates/gates.ts` are **100 / 100 / 100 / 100** |
| new tests | **6214 -> 6225, +11**: eight for `readDifficultyClaim` (the five refusals and the three silences), one naming the corpus's six claims, one for the gate's immunity to relabelling, and one for the field the assembler leaves out |
| mutations | **55 -> 61** injections, **65 -> 73** witnesses; 60 caught, 0 survived / inert / unattributed, 1 redundant as declared |
| corpus | **33** cases unchanged; **5** state `L4`, **4** earn it; **6** claim above their floor and **6** say what the chain cannot see |
| gate | hard end reads `difficultyFloor`; easy end unchanged; `4 of 33 = 0.121`, so the corpus can afford to lose **0** earned cases |
| list | **22 -> 23** open: the ratchet rewritten as a fifth earned level, one new entry for the claim still reaching both exports |

**The lesson.** A field with a floor and no ceiling is a field with a comment box: the floor is
checkable, the excess is whatever the annotator believed that morning, and a published number computed
over it measures the annotator. The condition is what turns the excess back into a statement — not
because a guard can tell a good reason from a bad one, but because a corpus whose over-claims each carry
a sentence can be argued with, while one whose over-claims carry nothing can only be believed.

## v3.75 — the one sentence about which field a case got wrong had never been run

The weekly `Official data` job has been red since 2026-11-02, and its log ends in a crash rather than a
verdict:

```
ROUNDTRIP PASS   2/270 RE2-OB/checkoutservice_cpu/2   target=rcaeval-re2   oracle=1.00 signals=317010
TypeError: Cannot read properties of undefined (reading 'filter')
    at scripts/check-official.mjs:1282
```

Line 1282 is inside the block whose entire job is to name the field a case does not satisfy.
`scoreExport` answers with a `ScoreReport` — `{ target, passed, score, structure, terms }` — and the
checks live under `structure`; the reporter read `shape.checks`, the name from before the report grew
its terms, while `shape.passed` in the same `if` still existed, so the guard fired and the body threw.
One line of that block was updated when the report was restructured and the other was not.

**Why nothing caught it: no fixture in the suite can reach the branch.** Reaching it needs an export
that scores 1.00 *and* a layout the target's contract refuses. Every case in
`check-official-roundtrip.test.ts` either round-trips cleanly or fails before that point — empty
descriptor, absent case, empty read, a refusal the exporter named — so the only code in the round trip
that can say *which* field is wrong had never executed on any corpus since it was written (finding 496).

**It reproduces in one file, in thirty seconds.** A corpus case whose `logs.csv` header drops
`container_name` and `time`: the adapter carries the columns, RE2's reader still scores the case, the
metric table is intact, and the contract refuses the modality table. Against the unfixed script that
fixture produced the same `TypeError`, locally, on the first try. The repair is two field names and one
test; the test asserts no `TypeError`, a verdict line counting two failing checks, and both ids with
their own details on stderr — because `modality-set` and `logs-header` are two different repairs and a
count would leave the reader to find out which.

The battery got `REPORT 1` for it, and that mutation replaces both reads rather than one: a mutation
that leaves half a defect in place measures half a rule.

### Readings

> Ledger for `v3.75`.

| item | value |
| --- | --- |
| `core` test suite | **244 files, 6226 tests passed** (as of this commit) |
| `cli` test suite | **4 files, 187 tests passed** (as of this commit) |
| repo test suite | **248 files, 6413 tests passed** (as of this commit) |
| coverage | `core` **99.97 / 99.82 / 100 / 99.97** (statements / branches / functions / lines), `cli` **100 / 100 / 100 / 100**; `scripts/check-official.mjs` is outside the instrumented tree, and the branch this round fixed is covered by the suite's own assertion instead |
| new tests | **6225 -> 6226, +1**: the round trip's field-contract branch, driven by a corpus case whose log table is off-contract |
| mutations | **61 -> 62** injections, **73 -> 74** witnesses; 61 caught, 0 survived / inert / unattributed, 1 redundant as declared |
| the weekly job | red on 2026-11-02 and 2026-11-09 with the same `TypeError`; the fixed script prints `shape=2` and both check ids for the reproducing fixture |
| list | **23 -> 24** open: one entry for what the weekly job's sentence will say about the real case |

**The lesson.** A branch that only a failing input can reach is a branch that no green run has ever
executed, and its first execution is either a correct refusal or a crash — there is nothing in between
and nothing before. The way to know which is not to read it carefully; it is to write the failing input.
