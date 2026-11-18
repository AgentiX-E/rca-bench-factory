## Closed

**Every entry the live list closed, in the order it stood there.** A closure is history, and
history is not work: `docs/progress.md` keeps what is still open, and this file keeps what is
not. The finding that closed each entry is still cited, `check-citations.mjs` still resolves
every one of those numbers -- it reads the whole of `docs/progress/` -- and the `~~` is kept so
that a reader can see at a glance which half of a sentence is the claim and which is the record.

**Why this is a file rather than a section.** An entry used to be struck in place, and a strike
is not free: by v3.110 the live list was **98,927 bytes**, of which **65,544** were forty-eight
struck entries. The index itself was **133,309 bytes**, and the rule that bounds it compares it
with the volume that is still open -- so the size of a list of closures was the reason the log
could not start a new volume, which is finding 568. The split moved the closures here whole and
in their own words, and the tiling was checked rather than asserted: the forty-eight entries
here and the twenty-eight still open are the seventy-six the list held, entry for entry.

**What a closure costs now.** One entry appended here, and one deleted from `## Open`. Striking
an entry in the live list is refused by `check-open-list.mjs` -- *the live list is what is not
done, and a strike in it is history filed as work* -- so a closure that is struck where it stood
turns the gate red instead of quietly making the index bigger. That refusal is what makes this
file append-only: the only thing that ever enters the live list is an entry that is open.

**The order is the live list's order, not the closing order.** These were struck in place over
many rounds, so the sequence records where each one stood rather than when it closed; a round
after v3.111 appends at the end, and the two orders diverge from here on. That is stated rather
than repaired, because imposing closure order on entries written before v3.111 would mean
inventing dates.

**Every entry carries an id, and the ids were a backfill.** Writing them was one edit in v3.112, and
the order it walked is the only thing their numbers record: the live list first, `O-001` to `O-027` as it
stood then, then this file in the order its entries stood, `O-028` to `O-079`. So a number here says **which
entry a bullet is**, not when it closed, and not which half of the space a file keeps -- the two files are one
space, it is dense (`1..N` with nothing missing, recomputed by `check-open-list.mjs` on every run, finding 570),
and a closure carries the id its live entry had. Because a closure **keeps its number and slots in at its
place** (v3.113), this file's numbers ascend and its range grows **downward**: `O-027` joined above `O-028` at
v3.113 and `O-026` joined above `O-027` here, each at the position its number had in the live list.
**Finding 576 is this paragraph.** Until v3.114 it said the order in this file was the *closing* order and that
the numbers inside it were not monotone -- which contradicted the paragraph above it, the entry three lines
below it, and the rule v3.113 had written in the same round that wrote the sentence: the file ascends, and
`check-open-list.mjs` refuses the first number that does not.

- O-026 · ~~**The row arm's cross-file population has never run on the shipped tree.** Since v3.111 a round's record
  may name a residual the round *closed*, and that entry is in `progress/closed.md` rather than in `## Open`,
  so the population the arm compares against is both files.~~
  **Closed by finding 573, finding 574, finding 575 and finding 577** -- four defects, all of them found
  on the way to the fixture this entry asked for, and all of them in the arm rather than in the fixture.
  (A fifth, finding 576, is the paragraph three lines above this entry.) The fixture exists now
  (`resolves a row naming a residual the round closed against the closure in the second file`): `closed.md`
  holds `O-002`, `closed-02.md` holds the `O-003` the round closed, the round's own `### Left open` names it,
  and neither the first file nor the live list mentions it -- so a green there is the second file being read
  by the arm that judges rows, which is the thing that had never happened. What the fixture found on the way
  is that the arm had no teeth to test. v3.113 fixed its selection, so it read the newest record whatever
  form it was written in; the form every round has written since v3.70 is a `### Left open` list, whose items
  **are** its entries, and the population was built by pushing every entry the walk read -- records included.
  The row and the entry it was compared with were the same bullet, so `every one of them quotes an entry` was
  true of a set with one member, and no record in that form could ever have been refused (finding 573). The
  repair narrows the population to the two lists, which is what the arm's own diagnostic had promised all
  along (`appears in no entry of ## Open or ## Closed`) and what a row means: a claim about an entry somewhere
  else. Narrowing it made the shipped v3.113 record go red **on a row that is right**, and that is finding 574:
  the comparison was published at twenty characters (finding 468) and implemented as the whole row, so a
  round's own account of a residual had to be identical to the list's account of it. No test could tell,
  because a self-witnessing row satisfies any ruler however strict; the first reading that could tell the two
  apart was the one after the narrowing. The third is the selection again, one level down: `find` took the
  first record whose owner was the newest round, so a round that wrote two would have one judged and the
  other passed in silence -- zero of 195 shipped rounds do it, and the refusal is a floor (finding 575) --
  and a record written **above** its round was found by nothing at all, which the three volumes of the
  `## Pass N` era made invisible, because they name no round and so cannot be told from a record written
  too high (finding 577).

- O-027 · ~~**The record is not split by size.** `docs/progress/closed.md` is **69,785** bytes after two rounds of
  closures, and nothing bounds it: it is a record, and records grow. The argument that produced the volume
  budget -- a document a reader cannot diff, and a push that carries all of it -- applies to this file at some
  size, and that size has not been measured.~~
  ~~`[open: the volume budget's argument applies to the record at some size, and the number that size is has not been measured; the first closure after the file passes it is where the question becomes a decision]`~~
  **Closed by finding 572.** The size was measured first, because the entry asked for a number and not for an
  opinion: **52** closures in **73,447** bytes is **1,412** bytes an entry, the v3.112 closure added **3,251**,
  and the volume budget of **200,000** is therefore **39** closures away. The budget is that number rather than a
  new one -- both are documents a round reads, and one number for "how big a document this log reads" is one
  number a reader has to hold -- and it is judged on the **last** file only, because the files above it are
  frozen records and a budget applied to a record is a budget applied to something nobody may edit.
  What turned a decision into a round was the accident the measurement exposed. The record was one path in
  `DOCS`, so a second file was not read at all: moving the last ten entries into `closed-02.md` -- the name a
  split would use -- left every verdict green, and the guard printed `69 entr(ies) with ids 1..69, and none is
  missing` while ten were missing. Finding 570's identity rule is dense **within the population it is given**, so
  no property of the numbers can notice a file that was never opened: the population has to be complete before
  the ids mean anything. The record is a **discovered set** now -- `closed.md`, then `closed-NN.md` from `02` up,
  contiguous -- with one refusal per way a set loses a member (a gap in the numbering, a name that is named like
  the record and is not one of its files, a second first file), a boundary rule for continuation files (the
  heading, then an entry: the preamble belongs to the first file), and the budget, which names the next file
  instead of leaving the round that crosses the line to invent it. The split itself is **25 + 27** and it is
  proven rather than asserted: the 52 entry lines were compared before and after, in order, and are identical.
  This round wrote and kept one more rule, and its first two drafts are the two defects that belong
  to it. **The ids ascend across the files**: a boundary can be placed anywhere, and one placed in front
  of the older half leaves the space dense while reversing the record's order -- density cannot see
  that, because the set is the same set. A closure **keeps its number** and slots in at its place, so
  the record is a run of numbers and the file boundary has to fall on that run. The scope is the record
  and not the corpus: a closure taken from the middle of the live list carries a number the live list
  has long passed, so a rule over the corpus in read order would refuse the first middle closure. The
  first draft of this entry appended itself to the end of `closed-02.md` -- the highest file, because
  that is where a new closure would go if the record were in arrival order -- and the order rule refused
  it: `the id O-027 comes after O-079`. The second draft of the guard assembled the closure's advice
  (`move it to ...`) during the walk, so the live list, read first, was told to file closures in the
  *first* file of a two-file record; the fixture that expects the last file caught it, and the address
  is read from the discovered set now.

- O-028 · ~~**The aggregate-table comparison has not been re-run against the corpus.** **Closed by finding 533 and finding
  534, which are what the re-run found.**~~ Run `43444874640` round-tripped `rcaeval-re2`
  **270 of 270 at `oracle=1.00`** in 2 h 40 m and then failed step 13 with
  `FATAL ERROR: Reached heap limit` and `Aborted (core dumped)` after ninety-six seconds of silence.
  The memory was not in the comparison v3.88 repaired: the reader parsed a 202 258 338-byte
  TrainTicket `logs.csv` into 274 621 records and *then* discovered the file has no `log_template`
  column, which is everything it needed to know and costs 64 KiB to learn. Reproduced locally at
  4 307 128 KB peak RSS and 29.72 s; after the repair, 92 300 KB and 0.53 s. The same reading found
  the larger defect behind it: the step counted every refusal as a failure, and **156 of the 181**
  case directories in `rcaeval-re2` are refusals, so the step could never have passed and had never
  reported a verdict on the 25 cases it can read.


- O-029 · ~~**The 246 cases with neither an id nor a rendered template have no exact check, and the only
  available statement is weaker than the gate's.**~~ **Closed by finding 542, which is the name and the
  gate the entry asked for, and by the fixtures that make the inequality fail.** The step now has a
  fourth outcome, `bounded`, and it is printed in its own clause with `not reproduced` in the sentence:
  the marginals of `logts.csv` hold no more log cells than `logs.csv` has rows for that container, per
  15-second bucket. It is checked on a breach (a table publishing 3 cells in a bucket of 2 rows fails
  with both numbers named), on a table whose column is not `<container>_<cluster key>`, and on a
  published table of zeros, which is refused rather than passed because "the claim held" and "there was
  no claim" print the same number of failures. `RE2-SS` and `RE2-TT` hold Drain's masked templates
  (`pageNum=<:NUM:>`) while their log rows carry only `message`, so the exact reduction cannot be
  applied -- three attempts at a rule are measured in finding 534, and the second one makes one row
  match three clusters at once. The count is 246 of the **271** case directories the last run walked
  (finding 541); the 25 that carry a cluster id or a rendered template are reproduced exactly and are
  no longer part of this entry.
  ~~`[open: decide whether a weaker claim gets its own name and its own gate, rather than being bolted onto a step whose sentence is "reproduced"]`~~
  What this closure does **not** contain is the corpus reading: the inequality has run on fixtures and
  not on the archive, and the number that will be quoted beside `bounded` is the one the next
  `official-data.yml` run prints.
  **That residual is closed by finding 545.** The run printed its number and the number was 246 refusals
  out of 246; the clock the log side read was the second a row fell on, and the table is keyed by the
  window that second starts. After the floor the archive reads 25 reproduced and 246 bounded, which is
  the partition this entry was written about.


- O-030 · ~~**The repaired aggregate step has not been run on the corpus.**~~ **Closed by finding 536 and
  finding 537, which is what the run found.** Run `43501279961` reached step 13 with
  **270 of 270** round-tripped and step 13 failed on four of the twenty-four case directories it can
  read -- all four `_loss`, by 37, 6, 3 and 12 cells of 4559, 3395, 7008 and 6305 -- because the rule
  matched `log_template` exactly and those four cases carry rows whose template is Drain-masked
  (`... product <:*:> ...`) while the `cluster_id` beside it names the right cluster. The rule now
  reads the id first, keeps the template as the fallback and as a second opinion, and fails on a row
  whose two columns disagree.


- O-031 · ~~**The repaired reduction has not been run over the corpus.**~~ **Closed by finding 541, which is what
  the run said.** Run `43706694417` on `81f0fd6` walked the whole corpus and passed: **25 of 271**
  directories reproduced, **83 742** cells equal, **4 073 602** rows counted by their own cluster id,
  **721** of them under a masked template, **575** named no cluster and **0** named two different
  clusters. The census was also the first thing to divide `25 + 246` and get `271`, which is how the
  corpus's 271st directory -- `RE2-OB/checkoutservice_cpu/multi-source-data`, the one whose last
  component is not a number -- was found, four rounds after every document had settled on 270. The run
  is recorded in `golden-master/roundtrip.json`.
  ~~`[open: dispatch official-data.yml on rcaeval-re2, read step 13's census, and record the run]`~~


- O-032 · ~~**The real-corpus runs are diagnosed, and the mechanism was named wrong twice
  before it was named right.**~~ **Closed without a finding: the third naming came from
  the run's own stack trace, quoted below, and that is what the entry was waiting for.**
  Five runs of the fourth anchor's path, each failing
  one step later than the last.

  "The failure has moved down the job three times" was true of those five runs and
  false as a description of the workflow's current state: by the time it was
  written the failure had stopped moving and was sitting still in one place. It was
  then replaced with a mechanism -- the derive step skipping a directory the
  scoring step still read -- that the log does not support. Finding 46 corrected it
  from the run artifact. The lesson is that adjacent log lines are not a causal
  chain, and the path named in the stack trace is.

  | run | revision | outcome | what it established |
  | --- | --- | --- | --- |
  | [#35480663989](https://github.com/AgentiX-E/rca-bench-factory/actions/runs/35480663989) | `98fdf601` | fetch failed after **12.35 min** | nothing — the diagnostics did not exist yet |
  | [#35482150957](https://github.com/AgentiX-E/rca-bench-factory/actions/runs/35482150957) | `07a0001f` | fetch failed after **12.26 min** | `ERR_FS_FILE_TOO_LARGE`, i.e. the *verifier* could not read 2.8 GB |
  | [#35483403527](https://github.com/AgentiX-E/rca-bench-factory/actions/runs/35483403527) | `c57fd7eb` | fetch **passed**, derive failed | 3 assets extracted, 3 pins measured; the reader did not know the corpus layout |
  | [#35486129312](https://github.com/AgentiX-E/rca-bench-factory/actions/runs/35486129312) | `307fb460` | derive **passed**, round trip failed | `270 case(s)` derived; the walk could not hold 32 GB in a 4 GB heap |
  | *(next)* | — | — | finding 46's fix; the first run that can reach a verdict |

  The second run answered it, and the answer was in neither of the two places this
  document had been looking. Both assets that come first measured clean:

  ```
  UNPINNED  rcaeval-re2-ob: bytes=1191025569 sha256=0605a36cdcad8a6ae0107f2357c9c91ecee2c4ab5d72579bffea0372d9747513
  UNPINNED  rcaeval-re2-ss: bytes=245629018  sha256=7aff9a3a0df7e2febbce4f75f0b7ba332da943aacadbffe6d5113a588ef6e295
  ```

  `RE2-TT.zip` is 2 801 345 134 bytes. `sha256Of` was `readFileSync`, and
  `readFileSync` throws above 2 GiB:

  ```
  RangeError [ERR_FS_FILE_TOO_LARGE]: File size (2801345134) is greater than 2 GiB
      at readFileSync (node:fs:455:14)
      at sha256Of (.../scripts/fetch-official.mjs:277:38)
  ```

  So the *download* worked and the *verification* of it did not, and the 12.35
  minutes of the first run was never evidence of unreachability — it was a large
  file transferring successfully and then being refused by its own verifier. The
  three candidates this document previously listed (Zenodo rate-limiting, disk
  exhaustion, `--max-time`) were all wrong, and none of them is retracted casually:
  the first run's 12.35 minutes was consistent with all three, which is why the
  fix was to make the next run report a reason rather than to guess one.

  **Fixed** in finding 39: the digest is taken off the stream in 8 MiB chunks, so
  the ceiling is structural rather than raised.

  Two things this run also settled:
  - The `Compare the measured pins` step ran with `if: always()` and printed
    exactly `no pin report was written; the fetch did not complete`. Findings 40
    and 41 came out of checking whether that meant what it appeared to mean.
  - The job log was readable this time. `GET /actions/jobs/{id}/logs` still answers
    302 to a host this session cannot reach, but the *token in the redirect URL* is
    a plain HTTPS host that `WebFetch` can read. The first run's log is therefore
    recoverable too, and the "unreadable log" claim in the previous version of this
    section was a limitation of the shell, not of the API.

  **The mechanism, from the artifact rather than the log.** The failing step's
  *descriptor* was recovered the same way (`GET /actions/artifacts/{id}/zip` also
  302s to the blob host), and it holds 270 RE2 cases under
  `checkoutservice_cpu/{1,2,3}` with real injection times and **zero** under
  `multi-source`. So the skipped directory and the crash are unrelated: the reader
  asked for `metrics.json` in a case directory that exists, because
  `metrics.json` is the name *our exporter* writes and the corpus writes
  `data.csv`. Finding 42's writer-versus-reader disagreement about a name, one
  layer down.

  The fix resolves the payload against a named set, reports a case carrying none of
  the names by listing the names tried and the names found, and continues rather
  than aborting at the first. Verified against a fixture in the official layout and
  against the artifact, and reproduced locally byte-for-byte -- so the step no
  longer costs a 90-minute dispatch to observe.

  What it is not: verified in CI. The honest status is *reproduced locally, not
  verified in CI*, and the remaining unknown is whether `data.csv` holds samples in
  a shape `assertRcaevalMetrics` accepts. The descriptor records no payload name, so
  that is not derivable from the artifact -- it is the first thing the next dispatch
  will say.

  **The re-run, with the fix, is [#35483403527](https://github.com/AgentiX-E/rca-bench-factory/actions/runs/35483403527)
  at `c57fd7eb`.** CI and Anchor round trip are both green on the same revision
  (`35483391864`, `35483391869`).

  **Outcome: the fetch passed and the failure moved one step downstream.** This is
  the first run in which the fourth anchor's download worked end to end:

  ```
  UNPINNED   rcaeval-re2-ob: ... bytes=1191025569
  UNPINNED   rcaeval-re2-ss: ... bytes=245629018
  UNPINNED   rcaeval-re2-tt: ... bytes=2801345134      <- the file that killed run 2
  EXTRACTED  rcaeval-re2-ob / -ss / -tt
  REPORT /tmp/pins.json: 3 pin(s) measured
  Fetched 3 asset(s)
  ```

  Finding 39's fix held: 2 801 345 134 bytes digested off the stream, all three
  assets extracted, and a report with three real pins written. Those pins are now
  in `golden-master/official-assets.json`, which is the first time the registry
  has held a measured digest rather than `null`.

  The job then failed at the **next** step, `derive the case descriptors`:

  ```
  error: no RCAEval case directories found under '/tmp/official'. Expected names of
  the form {RE1|RE2|RE3}-{service}-{fault}_{instance} each holding inject_time.txt.
  ```

  **Fixed** in finding 42, and it was not a small thing. The corpus's layout is
  nested — `{suite}-{system}/{service}_{fault}/{run}/` — so a case is three path
  components and the parser's flat pattern matched nothing at any level. The
  pattern had come from our own exporter, which is why reader, writer and unit
  tests all agreed while none of them described the corpus. `parseRcaEvalPath`
  now reads the real layout, `readRcaEvalGroundTruth` accepts both, and
  `gen-rcaeval-cases.mjs` locates cases by `inject_time.txt` rather than by
  directory name.

  The injection that matters: restoring the pre-fix reader left **107 of 107 tests
  green**, because every existing assertion fed the reader the flat name we write.
  Three reader tests were added; all three go red under that injection and nothing
  else does.

  Verified end to end on a corpus shaped like the download:

  ```
  108 case(s): RE1=0 RE2=108 RE3=0
  ROUNDTRIP PASS   1/2 RE2-OB/checkoutservice_cpu/1  target=rcaeval-re2  oracle=1.00 signals=3600
  ROUNDTRIP PASS   2/2 RE2-OB/checkoutservice_cpu/2  target=rcaeval-re2  oracle=1.00 signals=3600
  ROUNDTRIP PASSED (2 case(s) round-tripped through the official layout)
  ```
  A further run is required to record the real corpus's numbers; the local chain
  is what says the next run will reach the round trip rather than stopping on the
  layout.

  **Finding 43: the fix for 42 was correct and `anchor-roundtrip.yml` still failed
  on it.** The push carrying 42 went up as `307fb460`, and the fast workflow — the
  one that builds a synthetic corpus on every push — failed at the same step:

  ```
  error: no RCAEval case directories found under '/tmp/synthetic'.
  Expected names of the form {RE1|RE2|RE3}-{system}/{service}_{fault}/{run} ...
  ```

  The message now carried the *new* pattern, so the script had taken the fix. The
  corpus it was given had not. That workflow's fixture was a single flat directory
  named, verbatim:

  ```
  mkdir -p /tmp/synthetic/RE2-ts-order-service-cpu_1
  ```

  which is the layout the reader had assumed. The fixture had been confirming the
  assumption instead of testing it, so fixing the code left the certification
  intact — the same error one level up, in the instrument. The fixture is now the
  corpus's own shape (`/tmp/synthetic/RE2-TT/ts-order-service_cpu/1`) and the
  workflow also asserts the derived `caseId`, so a future drift fails naming the
  field rather than surfacing as a zero score. Verified locally on that fixture:

  ```
  ROUNDTRIP PASS   1/1 RE2-TT/ts-order-service_cpu/1  target=rcaeval-re2  oracle=1.00 signals=80
  ROUNDTRIP PASSED (1 case(s) round-tripped through the official layout)
  ```

  The dispatch is worth noting on its own: it returned **204 with a zero-byte body**
  and was deliberately not retried, and exactly one run was created
  (`total_count` 6, one entry after the dispatch). In the earlier session the same
  call was retried until it returned a non-empty body, which fired it four times —
  an empty 204 from a successful dispatch being indistinguishable, to a retry loop,
  from an empty response from a failed request. The helper now treats a
  non-idempotent POST as fire-once-and-verify-by-reading.


- O-033 · ~~**The dispatch was fired four times, and the cause is now fixed in the tooling.**~~
  **Closed without a finding: the fix was in a scratch API helper outside this tree, and
  the paragraphs below record both the repair and its confirmation.**
  `POST .../actions/workflows/{id}/dispatches` returns **204 No Content** on
  success, and the ad-hoc API helper this session used retried until it got a
  non-empty body. An empty 204 from a *successful* dispatch is indistinguishable
  from an empty response from a *failed* request, so the retry loop fired the
  workflow once per attempt. Three of the four runs were cancelled; the fourth was
  the first failure. Four concurrent jobs each pulling several gigabytes from Zenodo
  is itself a plausible cause of a rate-limited fetch, which makes this a bug that
  may have manufactured the failure it was then used to diagnose.

  Resolved rather than diagnosed-and-left. The dispatch is now issued exactly once
  and its effect is confirmed by reading the runs list, which is what a
  non-idempotent POST requires — the confirmation is a separate read, never a
  repeat of the write. The re-run above produced one run and returned 204 with an
  empty body, which is the correct behaviour for both the call and the caller.


- O-034 · ~~**The fourth anchor's fetch defect is fixed; whether that was *the* cause is not
  yet known.**~~ **Closed by Pass 15**, which is the first round to record a reading from
  a real-corpus run -- so the open question, "no run has happened since the fix", has an
  answer, and the fix was not the whole story either. The retry loop wrapped only `download()`, so a bad transfer had no
  second attempt and ended the job. That much is proved from the source and is
  recorded as finding 52. What is *not* known is whether truncations, a bad pin or
  both accounted for the twelve failures: no run has happened since the fix, and
  the whole reason the fix adds an exit code is that the log could not say. The
  honest status is *"the defect is fixed and the fix is verified in isolation; its
  effect on the anchor is unobserved."*

- O-035 · ~~**There is still no measured extraction accuracy.**~~ **Closed by Pass 15**, whose
  title is the answer: "the first real reading, and it says M1 is not met". The
  instrument produced a number; whether the number clears 70% is a different entry. The scorer, the 19-sample
  golden dataset, the two runner scripts and the workflow are all in place and
  verified locally against synthetic predictions. The workflow has now been
  **dispatched once** (run `36201115545`) and it **stopped at step 8,
  `Check the key is present`**: `secrets.RCA_BENCH_LLM_API_KEY` is not visible to
  this repository. Steps 1-7 were `success` -- including the dataset check, which
  reported 19 samples at schema `rca-bench-fault-golden/1` -- and steps 9-10 were
  skipped, so **no model call was made and M1's 70% strict threshold still has no
  reading behind it**. Finding 53 is the instrument, not the measurement.
  Two things this run did establish. First, the blocker is **credential
  visibility, not network**: `curl https://api.deepseek.com` from the sandbox
  returns `401`, which is the endpoint answering without a key, not a route that
  does not exist. Second, the instrument's failure was **legible** -- the step
  name *is* the cause, and the guard fired before any request was paid for.
  That is the difference between this run and the fourth anchor's twelve, which
  produced no diagnosis at all. The honest status is *"the instrument works and
  it named its own blocker; the number it exists to produce is still absent."*
  Two further limits on the instrument: `--verifiable` is produced by nothing
  today, so the `unverifiable` state is exercised only by hand-written
  predictions; and 19 samples means the strict rate moves in steps of 5.3
  percentage points, which is coarse at the granularity of the threshold itself.

- O-036 · ~~**Anchor 4** is closed by `official-data.yml`, which fetches the corpora on a
  runner.~~ **Closed without a finding: the closure is the workflow itself, and the two
  retractions it exists to record are in the audit rather than in a finding.** Two claims here were wrong and are retracted in the audit:
  - *"It needs official data mounted by the operator."* A GitHub runner has
    general internet access, and the RCAEval corpora are on Zenodo -- a plain
    HTTPS host with no interactive step. There was never anything to mount.
  - *"The licences prevent us from using the data."* RCAEval distributes its own
    code **and its datasets** under MIT. CC BY-NC-SA's NonCommercial clause
    binds *commercial advantage or monetary compensation*, which an internal,
    unpaid, unreleased CI run is not, and ShareAlike triggers on *distribution*,
    which we do not do. The one real constraint is repository hygiene -- do not
    commit the data -- and that is `check-no-vendored-data.mjs`.

- O-037 · ~~**Five gates are covered by CI running them, not by a test that forces them to
  fail.**~~ **Closed by finding 340**, and not by the fixtures this entry predicted.
  `gates-are-testable.test.ts` proves no gate can be hollowed out, which is a floor:
  it says a gate is caught by at least one test, not that every exit has one, and the
  ledger's `proved` was computed from a test that *names* the site. Measured instead
  of argued: block coverage for each of the 41 naming tests, run alone, with every
  site's line converted to a byte offset. **93 of 93 proved sites are reached by the
  test that proves them**, and 1 of the 6 exempt sites fires anywhere. The three
  scripts this entry named (`check-readme-sample.mjs`, `build-example-bundle.mjs`,
  `gen-examples.mjs`) all fire, as do both secondary exits — the fixtures it called
  "doable and not done" exist under other names. What remains is not a gap in the
  gates but a limit of the measurement: it establishes the line ran, not that the
  test asserted what it prints.

- O-038 · ~~**The reading that closed the caveat was sharp for only two thirds of the sites,
  and four sites survive being turned into a success.**~~ v3.32 asked whether the site's
  byte offset fell in a V8 range with a non-zero count; for **60** of the 93 proved
  sites that range is a branch block, and for **33** it is the module body -- a
  `process.exit(1)` inside a module-level `if` reads "reached" the moment the script
  starts. The falsifiable question needs no coverage: change the exit and run the test.
  Under `process.exit(44)` **88 of 93** are caught and under `process.exit(0)` **89**;
  the four that survive both are closed here by one case each in their naming tests
  (`check-citations.mjs:86`, `verify-example-pack.mjs:79`), found to be driven by a
  sibling test the ledger does not name (`check-cli-reference.mjs:51`), or left open
  with a diagnosis -- `check-official.mjs:1378` is reachable only by a case its target
  skips *by contract*, and the file's own skip paragraph says such a case "is not a
  pass and not a failure" while the enumeration gate counts it as an unnamed gap.
  See finding 342. ~~`[open: the enumeration gate and the skip paragraph disagree about
  whether a contract skip is a gap, and deciding that needs a fixture whose target
  refuses a case]`~~ — Closed by finding 343, which found that the runner could not
  produce a refusal at all: `suite === 'RE3'` stamped `code` on every case, so a CPU
  fault in the code-only slice round-tripped `oracle=1.00` (measured). The category a
  directory names now wins over the suite's default, the export's own `skipped` entry
  is what the gate reads, and `roundTripped + refused === declared` is printed on every
  run as `ROUNDTRIP ACCOUNTED`.

- O-039 · ~~**The RE3 slice's own fault categories have now been counted, and the count was worse than
  "uncounted".**~~ v3.34 found that the round trip would score a resource fault at 1.00 inside the
  one slice whose published rule admits code-level faults only, and fixed it by letting a
  directory's category win over the suite's default. The open item was that no reading here said
  what the cases' categories were. v3.35 took that reading over the nine published archives'
  central directories -- 1 190 358 bytes of 5 161 758 943, no telemetry downloaded -- and found
  **135 of 735 cases (18.4%) with no category at all**: 45 `socket` cases (the fourth *resource*
  fault, per the corpus's own paper) and 90 `f1`…`f5` cases (five distinct *code-level* faults,
  which this repository called one word, and only because a suite said so). Both families are now
  named by `fault/corpus-fault-taxonomy.ts`, which may only add to the classifier and never
  overrule it; the census reads `resource 405, network 240, code 90, unknown 0`. The same walk
  turned up the corpus's **736th** `inject_time.txt` --
  `RE2-OB/checkoutservice_cpu/multi-source-data/`, a hand-made bundle with a `.DS_Store` beside
  it -- which `parseRcaEvalPath` has always refused by requiring a numeric instance. See findings
  344 and 345.
  ~~`[open: nothing here groups the shipped corpus by fault category, so the refusal is correct
  and the population it acts on is unknown]`~~ — Closed by finding 344.

- O-040 · ~~**A closed volume's budget answers a repair with "start the next volume", which is advice a
  closed volume cannot take.**~~ **Closed by finding 208**, which applies the bound to the
  volume that can still grow and prints every size instead of judging the closed ones.


- O-041 · ~~**The publish readings begin at v3.56, and the history is one round deep.**~~
  **Closed by finding 433**, which found the file holding **five** pushes -- 65 rows, three
  retries, three unanswered attempts, written the same afternoon -- and no unit in which that
  could be said. The entry was not a lie about the file's contents but a sentence about a file
  whose depth could not be measured, which is why it read as one push. The attempt is now a thing
  in the file, and the reader prints how many it holds.

- O-042 · ~~**A push cannot be told from the requests that carried it.**~~ **Closed by finding 433**, which
  put the boundary at the caller: `publish()` asks the remote for the branch before it decides
  anything, so the first row of every attempt is `GET /git/ref/heads/<branch>`, and the reader
  refuses an attempt that begins with anything else as well as one that reads the branch a second
  time. The summary now names the attempts, each one's own slowest request, and how many named a
  tip -- and the two lines that showed the variance were enough to justify the unit: 2 120 ms on
  one attempt against 29 632 ms on another (finding 434).

- O-043 · ~~**A wrong `--branch` is read as an unborn branch.**~~ **Closed by finding 436**, which
  found the entry naming the smaller half of the defect. A `404` on the branch read answers for a
  branch that has never been created and for one whose name is wrong, and the plan is the same for
  both -- so the channel now asks what the repository holds, and refuses a name that is wrong
  unless the caller says `--new-branch`. The other half (finding 437) is that the branch could not
  be created at all: the ref update is a `PATCH` on a reference that must exist, so every real push
  onto an unborn branch ended in a `422` described as *"the branch moved ... it was null and is
  undefined"*. The creation is `POST /git/refs` now, with its own refusal for a name taken while
  the commits were being made.
  **The other half is closed by finding 455**, which paid for it: the push that created `v3.61-tip`
  carried three commits and twenty-one blobs and ended in one `POST /git/refs`, and the branch's tree is
  the one the gate had blessed (`546b38da`, read back from the branch's own bytes). What made it possible
  was not a cheaper rebuild but a different question: a creation hangs on a **tip the remote already
  has**, because a repository with refs has tips even when it does not have the branch. Before that the
  window was the whole ancestry, and on this history that was not expensive but impossible -- the replay
  reaches a merge, and a replayed merge is refused (finding 455's first attempt, two requests, no objects).

- O-044 · ~~**The listing that decides a `404` is one page of a hundred.**~~ **Closed by finding 451**, which made
  the listing walk pages instead of assuming the first hundred were the repository: 100 is both the page
  size and the size of a repository that holds exactly a hundred refs, so a full page is not a last page
  and the walk asks one more time. It stops at ten pages because it runs inside a refusal, and a walk that
  stopped at its bound says **"at least"** -- printing the pages it read as the number the repository holds
  is the defect the walk was added to fix, and printing a bound as a count is the same error with a smaller
  number. `refs()` answers `{ names, tips, complete }`, so the sentence a reader acts on can tell "counted"
  from "stopped counting". The old reason's other half is gone with it: nothing here walks a `Link` header,
  because the page size is a constant this channel sends.

- O-045 · ~~**`--new-branch` permits an absent base and does not require one.**~~ **Closed by finding 446**, which
  read the flag's second half: it is a statement about the remote -- *this branch does not exist* -- so a
  push carrying it onto a branch that does exist is refused and names the commit it found. What was open
  was whether a permission should also be a requirement, and the answer is that the two halves are one
  statement: the permission to create is not a licence to move the branch the caller said they were
  creating.

- O-046 · ~~**A record written as a table is counted, not judged.**~~ Since v3.45 a round's record is a
  table with a `state` column, and the nineteen of them hold **147** rows no gate reads: v3.64 made
  the guard check the header's four names, the rule under it, every row's cell count and a
  non-empty state cell, and corrected the count it printed from 185 to 147. See findings 464, 465.
  ~~`[open: judging a row needs a closed vocabulary for the state column, and the nineteen records
  predate one -- a gate that read the column today would have to accept whatever the last nineteen
  rounds happened to write, which is not a rule]`~~
  **Closed as a measured decision by finding 466**, which measured the column instead of planning a
  vocabulary for it: 147 readings, 78 distinct values, `unchanged` 38 times, a median of 75
  characters and a longest of 251. There is no vocabulary to close, because the column is prose --
  so what a gate can do about it is locate it, and that is now what the guard does.

- O-047 · ~~**The coverage figure has no reader that computes it.**~~ **Closed by finding 543, which is the reader
  and the instrument name.** `test:coverage` writes vitest's `json-summary` beside the reporters it
  already wrote, and `scripts/check-coverage-readings.mjs` compares the four published figures with
  `total.<dimension>.pct` at two decimals -- the precision the page publishes -- and prints the number
  with the instrument that produced it: `equal to the v8 counters in …coverage-summary.json`. It refuses
  a stale figure (naming the dimension, both numbers and the report), a missing `## Coverage` table, a
  dimension that is not one of the four, a dimension published twice, a result that is not `NN.NN%`, and
  a report without one of the four totals. CI runs it with `--require` in the step that already reads
  that run's reports; where there is no report at all it prints `UNCHECKED` rather than passing
  silently or failing a table that may be perfect. `docs/progress.md` publishes the four-dimension
  reading under a sentence beginning "Measured by `vitest run --coverage`", and the per-round copy of it
  lives in a `### Readings` ledger; `check-doc-counts` holds the suite counts to a run and
  `derive-gate-sites --check` holds the gate-site count to a derivation. Nothing held this one to
  anything, which is why it published **99.93** branches for at least eight rounds while every ledger
  read 99.80 (finding 481) -- and why the retaken figures could be 99.980 on one instrument and 99.97 on
  the other with the prose naming neither (finding 539).
  ~~`[open: the repair corrected the figure, not the gap -- a guard would need a coverage report during
  `docs:check`, which does not run the suite, so the honest state is that one of the two copies is
  remembered. Either a `docs:check` step reads a report when one exists, or the table says in a
  sentence that the ledger is the only computed copy and this one is a convenience]`~~

- O-048 · ~~**G3's two thresholds have no grid.**~~ `minAbsZ` (2.0) and `minSustainedSamples` (3) are
  parameters with no sensitivity reading, and `probe-z-floor` measures epsilon rather than either
  of them.
  **Closed by finding 482.** The grid exists: 4x4 over `|Z|` 1/2/10/100 and 1/3/5/8 samples, printed
  by `check-fault-cases.mjs` on both exits, with every cell's refused set asserted equal to
  `checkG3Validity`'s own violations. Its answer is that **the admission rate does not move** -- 30
  of 30 in every reachable cell -- and the reading that separates "the default is defended" from "the
  corpus cannot see the line" is each case's flip point: weakest **126.85**, **63.42x** the default.
  Both defaults are now `G3_DEFAULTS`, read by the gate and by the grid rather than written twice.
  What the grid could not do is defend the *value*, and that is the item opened below.

- O-049 · ~~**`rulegen` has no refusal count and no agreement reading.**~~ The module extracts a structured
  rule from an incident and validates it; it does not report how often validation refused, and
  nothing compares its output with the thirty human annotations that already exist.
  **Closed by finding 483, with two of its three premises corrected.** The thirty annotations are
  `fault-extraction`'s, and `buildExtractionReport` already reads them; and `rulegen` has **no
  production caller at all**, so a rate over model output would describe a channel that does not run.
  What was built is `golden-master/rulegen-layouts.json` (16 authored cases) plus
  `scripts/check-rulegen-agreement.mjs`: the alias table reproduces **14 of 16** specified layouts,
  the validator agrees on **16 of 16** verdicts (9 accepted, 7 refused) and **7 of 7** reasons, and
  **1** accepted answer maps a field to another real column -- the class a replay cannot refuse.
  Kappa is absent and the absence is stated where the figure is printed. The defect worth the round
  was neither of those: `REQUIRED_FIELDS` was written twice, byte for byte, and is now one constant
  in `ingest/file.ts` imported by both readers.
~~**The corpus cannot move the z-score axis.**~~ Every one of the then-thirty cases stopped
  sustaining three samples only above `|Z| >= 126.85`, so a grid over 1 to 100 had one answer in all
  sixteen cells (finding 482). The reason turned out to be arithmetic rather than annotation: the
  fixed ±2 % jitter cycle fixes every sampled series' spread at about 1.34 % of its mean, so a
  stepped series' z is `(post / baseline - 1) / 0.0133` and every authored incident moved by at
  least 2.7×. v3.70 added the corpus's first faint case -- a 284-second TTL where the runbook says
  300, 1100 to 1164 refreshes per second, p99 240ms to 254ms, nothing failed -- and the grid now
  reports `31 of 31 and 1 of its 4 neighbour(s) change that`, with the weakest flip point at
  `|Z| >= 3.38`, `1.69x` the default (finding 486).
~~**The layout validator cannot see a wrong-but-valid mapping.**~~ `validateGeneratedLayout` replays
  a layout against the samples, so it refuses a column that is absent or empty and accepts a mapping
  to a real, populated column that means the wrong thing (finding 483). The limit is now stated in
  the module that enforces the rule rather than only in the module that reads it, and it is pinned
  by a test: `rulegen.test.ts` plants `metricValue` at a populated `limit` column, asserts the
  layout is accepted, and asserts that the correct mapping to `usage` is accepted by the same
  check -- one verdict, two meanings, so the pair cannot be told apart by a replay (finding 487).
~~**`score` divides by a different denominator per target, and the documents did not say so.**~~
  Measured: nine targets over **five** check counts (14, 9, 8, 7, 2), and without anchors the
  number takes exactly **two** values (`0`, `100`) because the structure term is all-or-nothing --
  so `0-100` was a ceiling printed as a scale. `ScoreReport` now carries `terms` (the counts each
  half was computed over) and `describeScore` renders `score 100 of 100 over 14 structure check(s)`;
  every surface prints the sentence, and the site takes it from the payload rather than composing
  one (finding 485).
~~**The accuracy figure behind `M1_STRICT_THRESHOLD` is now over 30 of 31 samples.**~~
  Measured: the number now has a sentence that carries its denominator. `describeReadingCoverage`
  writes `the reading answers 30 of the 32 sample(s) the key holds; unanswered: …`,
  `score-fault-extraction.mjs --record` prints it beside the report, and
  `m1-reading-is-reproducible.test.ts` pins the whole line -- so the two denominators a reader used
  to have to choose between are one sentence with both numbers in it, and a new sample that no run
  answered lengthens the list rather than moving the figure (finding 489).
~~**The grid's sample axis is still constant.**~~ Measured: it was constant because the schema could
  only say "the whole post-window" or "exactly one sample" -- `spike` was a step whose *name* carried
  a duration, and the only duration it could carry was one. `hold` says the number, `spike` retired
  into `hold: 1`, and the corpus's merge-burst case returns after four samples: the default admits
  **32 of 32** and **2** of its four neighbours now change that, `|Z| >= 10` for being too weak and
  **5 samples** for being too short (finding 488).

- O-050 · ~~**The sample axis has one witness.**~~ **Closed by finding 490 and the case it was written
  beside.** A second self-clearing case exists — `history-queue-disk-watermark-batch-drain`, six
  samples at one minute each — and the two cases land in **different cells**: the 5-sample line
  refuses the four-sample case and admits the six-sample one, the 8-sample line refuses both.
  `Measured:` the neighbour count could not see it, because 8 is two steps from the default 3, so the
  reading now prints the axis itself — `the sample line refuses 0 / 0 / 1 / 2 case(s) at 1 / 3 / 5 / 8`
  — and `check-fault-cases.test.ts` pins the staircase rather than a count of neighbours.

- O-051 · ~~**The duration rule only fires when the parameter's number *is* the hold.**~~ **Closed by finding 492 and finding 493.** `readDurationRestatement` compares one
  sample's length with one unit of the parameter, and it is asked only about a parameter whose value
  equals the hold -- so `burstMinutes: 5` beside `hold: 4` in a window whose samples are 3.5 minutes
  long asserted fourteen minutes of plateau in five and nothing refused it. The entry asked for the file
  to say which parameters are the fault's own length, and `fault.durationParameter` is that field:
  `readDurationClaim` reads the named number against `hold x spacing` and found
  `history-dependency-upstream-5xx-pricing` claiming eighteen minutes over a thirty-minute post side
  and `history-dependency-schema-change-currency-feed` claiming a hundred and twenty over a hundred and
  fifty. Both windows moved to the time each file already named in its own prose.

- O-052 · ~~**A case can satisfy the length rule by deleting the field.**~~ `fault.durationParameter` is optional
  on purpose: nine of the corpus's fourteen time-valued parameters are knobs (`terminationGracePeriodSeconds`,
  `retentionGapHours`, `readyAfterSeconds`), and a rule that demanded a length would be a rule about the
  annotation's vocabulary. The cost is that a case which never names its length makes no claim and is
  refused by nothing -- so the rule is a statement about files that *do* claim one, and the run can only
  print how many do (`5 named as the length of their episode`).
  ~~`[open: a way to tell a knob from an episode without reading prose, which would make the field
  mandatory in the cases where it applies rather than in all of them]`~~
  **Closed by finding 556**, which is that way: the answer is written on the parameter it describes
  (`role: "episode"` or `role: "knob"`), so it is mandatory exactly where it applies -- a count and a share
  have no role to give, and a role written on one is refused rather than ignored -- and
  `fault.durationParameter` is gone rather than kept beside the word. A length that says neither is refused
  by name, which is what closes the deletion, and `check-fault-cases` refuses a residual field where a file
  still writes one. The entry's own counts were a count of cases (finding 555): the corpus writes
  **seventeen** time-valued parameters across **fifteen** cases, five of them episodes and twelve knobs.
