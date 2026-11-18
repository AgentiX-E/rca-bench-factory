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

**Every entry carries an id, and this file holds the higher half of the space.** The fifty-two
entries here are `O-028` to `O-079` in the order they stand; the live list holds `O-001` to
`O-027`. The two files are one space, it is dense -- 1..79 with nothing missing -- and
`check-open-list.mjs` recomputes both facts on every run (finding 570). The numbers were assigned
by backfill in the order the two files happened to hold on the day identity arrived, the live list
first, so they say **which entry a bullet is** and not when it closed. From this round on a closure
arrives carrying the id its live entry had, which is the id the entry was opened with: the order in
this file is the closing order, and the numbers inside it are not monotone. That is the same
divergence the paragraph above describes, now visible, and it is the reason an entry's id is worth
grepping for.

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

- O-053 · ~~**The corpus can afford to lose none of the four cases that earn its hardest level.**~~ The ratchet
  used to say one, and that unit was the case claiming `L4` over a single hop (findings 494 and 495).
  Read over the chains the gate now uses: four of thirty-three is 0.121 and three of thirty-two is 0.094,
  so the margin is `0.021` against a case worth `0.030`. A fifth earned `L4` -- a chain of three steps,
  not a relabel -- puts it at five of thirty-four (0.147), which is the first size where losing one holds.
  ~~`[open: annotate or add a case whose chain is three hops deep, and measure what the denominator should
  be rather than inheriting 0.1 from a corpus three times smaller]`~~ **Closed by v3.78**, which is the
  case and the measurement. `history-queue-duplicate-publish-ingest-writer`
  carries a three-step chain -- container, pod, service, and out to the topic -- so the earned count is
  **five of thirty-four (0.147)**; the denominator is measured rather than inherited, because the test
  derives the size at which the same numerator stops working (`floor(5 / 0.1) + 1 = 51`) instead of
  quoting the tenth, and asserts that any **one** earned case may be dropped (four of thirty-three, 0.121)
  while no two may (three of thirty-two, 0.094). The knife edge is the thing that closed: before it, a
  single edit shortening one chain put the corpus below the floor the corpus publishes.

- O-054 · ~~**The weekly job's sentence has still not been read, and v3.75 did not deliver it.**~~ The dispatch
  it was fixed for printed `shape=1` twice and nothing else: the sentence was built and pushed onto the
  epilogue's list, which that run never reached (finding 497). v3.76 put it on the case's own line.
  ~~`[open: the first `ROUNDTRIP FAIL … shape=` line that carries a check id]`~~ **Closed by v3.79**,
  which read two of them from run `42674673341`. The check id is `data-csv-time`: cases
  `2/270` and `14/270` (`checkoutservice_cpu/2` and `checkoutservice_mem/2`) fail with *"the table's
  first instant is '0' and the injection time is '1708475361', which have to be on the same clock"* --
  two cases out of 270, and a corpus shape rather than an export defect -- half right, and
  v3.85 measured which half (finding 523): the corpus does have rows with no clock (256 of them in
  `checkoutservice_cpu/2`), and the export filing them at 1970 was the reader's invention, not the
  corpus's shape. The other 168 failures carry
  the id `modalities` with no sentence after it, which is a second-order version of the same complaint:
  their reason is the `ROUNDTRIP MODALITY` line above, so the case line says *which* check failed and
  nothing about *why*. What the round did with the answer is finding 505's subject: the two readings
  that would have made the run legible were both written after the loop.

- O-055 · ~~**The heap this corpus needs is measured now, and the number was wrong.~~ Closed by a run that
  finished (finding 511's rewrite, and `ROUNDTRIP cost` from run `43085008634`).** The job was sized at
  7168 MB from 17 MB of heap per MB of CSV, taken on a synthetic case in the corpus's own shape. Run
  `42674673341` reached **6,960 MB of it (96%) at case 182** -- the first TrainTicket case, 1,433,140
  spans against SockShop's 95,000 -- and V8 killed it. The largest case before that was 4,100 MB at
  case 54, so the curve is flat at 4.1 GB for 180 cases and then leaves the budget in one step. v3.79
  raised the declaration to 12288 and moved the refusal to where it fires while the process is alive
  (finding 504). The dispatch of 2026-11-11 finished all 270 cases instead of dying at 182:
  `ROUNDTRIP cost 270 case(s) in 151.6 min; largest 8075 MB of
  the 12336 MB this run was given (65%) at RE2-TT/ts-route-service_mem/3; slowest 120.5 s at
  RE2-TT/ts-train-service_loss/1`. The peak the modality comparison needs is that 8,075 MB, and it is
  measured rather than extrapolated: v3.81's rewrite of the comparison (finding 511) took the pair of
  tables from 1,925 bytes a row to 98, so the 1,433,140-span case that used to end the run now fits
  with a third of the budget to spare.

- O-056 · ~~**`RE2-TT`'s tables and SockShop's log header are still unmeasured, and the reason was
  placement.~~ Closed by the same dispatch, and the answer was not the one the entry predicted
  (finding 521).** TrainTicket starts at case 182 and the one run that reached it died there, so the
  census line that would have said what TrainTicket ships was never printed -- it was written in the
  epilogue, after a loop that did not finish (finding 505). The line now prints before the first case,
  from the walk's file set, so the next dispatch reads it whether or not it survives TrainTicket.
  `ROUNDTRIP CENSUS modalities` reads `RE2-SS: logs 90/90, traces 0/90` and `RE2-TT: logs 90/90,
  traces 90/90`, and the *comparison* then failed 244 cases with `the corpus's logs table has no
  'cluster_id' column`. SockShop's "nine columns" was an inheritance from RE2-OB and it was false:
  `RE2-SS/carts_cpu/1` writes seven, and so do 64 of Online Boutique's 90 -- two directories of the
  same service eleven apart, one nine-column and one seven. A planned `not-carried` column the corpus
  does not have is a reading now, with its own field and a per-slice census line, and the entry's
  question is answered by the archive rather than by a run.

- O-057 · **~~The modality comparison holds two maps of every row's signature.~~ Closed at v3.81 by measuring
  it and replacing the shape (finding 511).** The two maps were the mechanism: 1,925 bytes per row on
  the same probe, 734.4 MB at 400,000 rows, and the comparison is what 168 of one run's 270 failures
  were about. It now walks both tables through one generator (`delimitedRows`, the same state machine
  `parseDelimited` wraps), keeps one sorted array of signatures per side, and drops every row: **37.2
  MB at 400,000 rows** (98 bytes/row) and **313.8 MB at the 1,433,140 rows of
  `RE2-TT/ts-auth-service_cpu/1`** -- the case the run died on. The old shape was not run at that
  size, because 19.7x per row is 2.76 GB and the machine has to stay usable; the extrapolation says
  so. The reading comes from `probe:modality-memory`, which names the module it measured and is
  driven by four tests. What remains is not this entry: it is the dispatch that would carry a
  TrainTicket case to the end of 270, which is the round trip's entry and not the comparison's.

- O-058 · ~~**The level a case claims still reaches both exports, and the note that defends it does not.**~~ The
  distribution gate stopped reading claims in v3.74, so a corpus can no longer meet its tenth by
  relabelling; `difficultyFor` still projects `FaultCase.difficulty`, so the case with a one-hop chain
  ships to `cloudopsbench` as `hard` and to `itbench` as `scenario_complexity: hard` beside three-hop
  chains. The note is deliberately not assembled into a bundle, because it is a paragraph of the answer
  -- which leaves the projection with no defence attached.
  ~~`[open: a projection that carries the floor beside the claim, or a consumer-facing field that says the
  level is a claim rather than a measurement]`~~
  **Closed by finding 553**, which is the first of the two alternatives: `difficulty_floor` beside
  `difficulty`, `scenario_complexity_floor` beside `scenario_complexity`, both from one
  `projectDifficulty` that takes the case *and the graph*, because a floor computed without one is `L1`
  for every case. The floor could travel where the note cannot, for a reason that is checkable rather
  than argued: the file it lands in already carries the answer. **Six of thirty-four** cases print two
  different words, and the example bundle is one of them, so the contract page shows the pair rather
  than describing it.

- O-059 · ~~**The worker count decides the stall verdict, and it was chosen by memory alone.**~~ **Closed by finding
  532, which measured it at four widths.** `workerCount()` reads the CPUs the process may use and a ceiling
  measured on the container's memory; nothing in it consulted the one measurement that turned the suite red.
  Measured then on a five-CPU box: **2 workers -> worst file 14,448 ms** and 153 s of wall clock; **4 workers
  -> 23,897 / 43,895 / 47,727 ms** and 91-99 s. v3.89 ran the whole suite at 2 / 4 / 6 / 8 workers, ten times
  over: the worst file held the loop **14.4 / 14.8 / 24.1 / 39.9 s -- 32 / 33 / 54 / 89%** of the 45,000 ms
  budget -- and the wall clock was **174 / 109 / 108 / 113 s**, so the count the formula produces here (3) is
  at a third of the budget and nothing above 4 buys a second. The ceiling of 8 is the memory's, and it is
  admissible because it is unreachable below nine CPUs; what was wrong was reading the allowance from one
  cgroup layout while using it on both, and 532 is that repair.


- O-060 · ~~**The timeout table cannot discover a row it does not have.**~~ **Closed by finding 538, which read the
  two numbers the pipeline was already holding.** `timeout-budget.test.ts` checked every row it held and
  could not find a new one: v3.89 found four files at 38-94% of a 5,000 ms default that had never declared
  a budget, by running the suite at four widths and reading vitest's JSON report -- two of them red at 6
  and 8 workers. The repair is not a better table. `test:coverage` already writes a per-test `duration`
  for all 6 545 tests and each file already states its budget in one of four spellings, so the reader
  needed no measurement, only a place where the two meet: `scripts/check-test-budgets.mjs` refuses a test
  past **half** the budget its file states, and a test at or above a fifth of the default when the file
  states none. Its first run named `gates-are-testable-is-enumerated.test.ts` -- slowest test 1 015 ms,
  no budget, the shape of all three rows that arrived by red run -- and the 216 files that state nothing
  have every test under 100 ms, which is what makes the floor a reading rather than a style.
  ~~`[open: a reader that takes each test's share of its own budget from a run's report and refuses one past
  half of it, in a place that runs the whole suite]`~~

- O-061 · ~~**The new step's bound is a promise, not a measurement.**~~ **Closed by finding 540, in the round
  that opened it and by the first run that carried it.** `Every test's cost against the budget it declares` ran on `815e739`
  and finished inside the second it started -- and failed, naming `build-example-bundle.test.ts` at
  1 128 ms, which no local run could see (the runner has 19 files with a test at or above 1 000 ms
  against this container's 12). The fixed tree went green on `72e46b8`, `measure-ci-baseline.mjs`
  recorded that run (**1 s** against a 3-minute floor), and `golden-master/ci-declarations.json` is
  deleted. Recording it also cost something: the same run measured the gate-test battery at **231 s**,
  past half of its 7-minute bound, so that bound is **8 minutes** now -- R10's worst-day rule doing the
  job it exists for, on the day it was handed a slower one.
  ~~`[open: read its duration from the next green run, record it with measure-ci-baseline.mjs, and delete
  golden-master/ci-declarations.json]`~~

- O-062 · ~~**The next-nearest file is at 71% of the stall budget.**~~ **Closed by finding 516, and the
  question it asked had the wrong subject.** `publish.test.ts` measured 28,183 ms without
  coverage and 31,855 ms under it in the four-worker runs, against 45,000 -- and its cost is `git`
  process starts, which is the shape the config's own comment calls the scheduler's job rather than the
  file's. It is under budget in every reading taken, which is the only reason it is not a finding.
  ~~`[open: whether a file whose cost is process starts has a cheaper shape at all, or whether the honest
  answer is that the budget's lower bound is the worst of these and the number should say so]`~~
  The budget is about **the event loop**, and this file's test time was never the number it was
  asking about: measured under coverage at v3.82, the file held the loop for **61,987 ms** while
  spending **1,740 ms** of CPU. Both figures are seconds of the same file, and the difference is
  not the scheduler's to fix -- every `git` call was `spawnSync`, so the loop stood still for the
  length of each child. Repaired by awaiting the spawns (`spawnSync` -> `runChild`): blocked time
  **61,987 -> 0 ms**, test time 12,182 -> 13,690 ms. The cheaper shape exists and it is not a
  cheaper process, it is a process the loop is not waiting inside; and the wall clock it costs
  rose 1.5 s rather than fell, which is the reading the entry's last clause asked for.



- O-063 · ~~**A claimant's budget is compared and the comparison refuses nothing.**~~ **Closed by finding 527.**
  The ceiling turned out to be a rule rather than a number, and finding 528 moved the number it was
  going to be read against. `verify-sites-are-sensitive.mjs`
  reads every claimant's own `{ timeout }` and prints how many declare one and which are below the
  battery's; what it did not do was make the two agree, and **nine** of the 61 claimants furnish
  30 000 ms where the battery furnishes 120 000. The direction that costs a claim is now refused: a
  mutant run a test budget stopped proves nothing, so the basket that used to be credited as a catch
  is now its own refusal, and no declaration may be the thing that ends a run whose whole product is
  a failure. The number the entry was looking for was not the answer -- measured per test, the widest
  single test in the estate is **5 227 ms of its 30 000 (17%)**, five times the headroom the previous
  round's *"29 590 ms of the 30000 ms it is given (99%)"* implied, because that quotient divided a
  file's wall clock by a per-test ceiling.


- O-064 · ~~**A stopped run was refused with the budget that ended it, and not with the test it was inside.**~~
  The per-test durations the margin prints come from vitest's own JSON report, written for the 61
  baseline runs, and the 220 runs that must fail are not asked for one because their verdict is the
  exit code -- so a mutant that hung was refused with the budget and nothing named the test.
  **Closed by finding 544.** The name was in the run's own captured output, under the sentence the gate
  already read: vitest prints the timeout inside the block that begins with a `FAIL` line naming the
  file and the test. `hungTests` scopes the sentence to its block, so a run with an assertion in one
  test and a kill in another answers with the second, and a run that named nobody is made to say so.
  The report the entry proposed buying would have been a second copy of a fact already in memory, at
  one file per mutant run across 220 runs.

- O-065 · ~~**The workflow that found the bucketing defect has not run since the repair.**~~ **Closed at v3.97 by
  the dispatch the entry asked for: run `43776772029`, on `56b9bbc`, whose step 13 came back green.**
  It reached step 13 at `02:40:14` and finished it at `02:43:51` -- **3 m 37 s** against the 2 m 13 s the same
  script takes locally -- with the census it exists to print: `OK (25 case(s) reproduced, 83742 cell(s)
  reduced from logs.csv and equal to the corpus's own logts.csv; ... 246 case(s) bounded, not reproduced:
  the marginals of logts.csv hold no more log cell(s) than logs.csv has rows for that container, 270445
  (container, bucket) pair(s), 0 spare row(s) at the tightest over 35462054 published cell(s) against
  40008239 log row(s))`. The 63 441 refusal lines finding 545 repaired printed as zero, on the runner, after
  the fetch and the 2.5-hour round trip -- which is the part a local read cannot say.


- O-066 · ~~**The inequality compares buckets without asking whether the table is on the grid.**~~ **Closed by
  finding 547, which asks it and refuses.** A published time was read as a bucket key and floored against
  nothing while the log side floors every instant to a window, so a table on another origin was reported
  as publishing cells the container never logged -- a true sentence about the wrong subject, the shape
  finding 545 was about one step upstream. Measured over the 271 directories: **0 of 26 116** published
  rows are off the 15-second grid, which is what made the refusal safe to write; a time that is not a
  multiple of fifteen is now recorded once and refused rather than counted ninety-seven times and reported
  as a breach. A second fixture keeps it honest -- a table one window away is on the grid, is compared,
  and fails on its numbers -- and the corpus line did not move: 25 reproduced, 246 bounded, 0 refused.


- O-067 · ~~**Three rounds in this log are prose in a language the rest of it is not written in.**~~ **Closed
  by finding 546, which translated them and built the reader that would have refused them.** `v3.69`,
  `v3.83` and `v3.84` were Chinese: 43, 40 and 33 lines, headings included. Every other round is
  English, the code comments are English, and no gate read a document's language -- so the three were
  unreadable to a reader of the other 241 rounds and invisible to eighteen `docs:check` steps that read
  their counts, their citations, their boundaries and their headings. The three were rewritten against
  the record -- every number, finding reference, heading level and ledger row unchanged, 1 429 bytes
  more of English across them -- and `check-docs-language.mjs` now refuses a run of eight Han characters
  of prose anywhere in the tree, with fences, code spans and block quotes read as the quotations they
  are. Measured before: **96 lines** of Han prose across five documents. After: **zero**.

- O-068 · ~~**The tree's comments are English and nothing reads them.**~~ **Closed at v3.98 by the reader this
  entry asked for, and the measurement is the reason it was asked for.** `scripts/comment-language.mjs`
  scans 462 files and reads **23 768** comments (19 838 line, 3 930 block); **0** carry a run of eight Han
  characters outside a code span. The four shapes the entry named as a line scan's failures are fixtures,
  three of them falsified by removing the scanner's state and watching the fixture fail: with string state
  removed, `'https://<ten Han characters>'` is refused as prose; with regex state removed, `/x\/*/` opens a
  block comment that never closes and the file reports **0 comments, 0 runs, and a refusal** -- the shape
  finding 528 named, right about what it read and silent about what it could not. The witness that the
  scanner distinguished is in the census rather than in a claim: **331** comment openers sit inside a
  string, a template or a regex, across **90** files, and none of them was read as prose. The threshold and
  the code-span rule are imported from the document reader rather than copied, so the two readers share one
  definition of a citation. Two boundaries are stated rather than hidden: the workflow files are not read,
  and a run broken by a line break evades both readers.

- O-069 · ~~**The workflow files' `#` comments are read by nothing.**~~ **Closed at v3.99 by the YAML scanner this
  entry asked for, and the scanner found twelve comments on its first run that its own author had counted as
  content.** `scripts/yaml-language.mjs` reads six files and **1 167** comments from **1 215** `#` characters
  (979 line, 188 block scalar); **0** carry a run of eight Han characters outside a code span. The entry's
  three shapes are fixtures, and three more were added: a `#` glued to a word, a row indented deeper than the
  block's first row, and a block that ends at a less-indented row. Six falsifications -- one removal each, one
  red fixture each -- and one of them is the round's honest failure: the fixture for "every quote opens a
  scalar" sat inside a block scalar, so the branch under test never ran and the test asserted nothing until it
  was moved to a plain scalar with an apostrophe in it. Two readings are taken over every file: every `#` is
  classified into one of four buckets whose counts must sum to the file's characters, and every row whose first
  non-blank character is a `#` must be recorded as a comment. The second is what found the twelve --
  `official-data.yml` rows 308-314 and 467-471, comments indented deeper than their block, counted as content
  and green because the file happens to be English. The parenthesis in this entry said 1 172 marks; that was a
  line count, and the character count is 1 215.

- O-070 · ~~**A run broken by a line break evades all three language readers.**~~ **Closed at v3.100 by the decision
  this entry said it needed: the unit is the paragraph.** Each surface says what one is -- a markdown paragraph
  ends at a blank row, a heading, a fence and a block quote; a comment's paragraph ends at a blank row, including
  the doc block's row that carries nothing but its ` *`; and two comments continue each other when they sit on
  consecutive rows in the same column of the same delimiter. Two rows of one paragraph are joined with nothing
  between them, which is the rule "a break between two Han characters is not a break" rather than an
  approximation of it, and a property test over 400 seeded sequences compares the two formulations. Measured
  before the rule was written, twice: **0** row breaks in this tree fall between two Han characters, stripped or
  raw, so the widening costs nothing today and its whole proof is in the fixtures. **68 891** breaks are held
  inside a paragraph and **0** of them is a crossing. Twelve falsifications, one red fixture each; one of the
  twelve came back green at first because the fixture put the block quote after a blank row, so the flush under
  test was unreachable -- rebuilt, and red. Three defects fell out of the fixtures: the space a `//` leaves at
  the break, `kind` meaning two different things in the two scanners (now an explicit `family` of delimiter and
  column), and a spread append the guard refused.

- O-071 · ~~**A hard break written as a trailing backslash is one paragraph to CommonMark and two to this reader.**~~
  **Closed at v3.101 by deciding it per surface, which is one more decision than the entry expected.** The
  backslash is punctuation to a renderer and text to a comment, so the same bytes mean opposite things: the
  document reader now drops a row's last backslash when it is exactly one and not itself escaped, and the two
  comment readers do not know the marker exists -- a `// …\` line ends in a backslash and that backslash stands
  between the rows. `\\` is a literal backslash and holds the rows apart, three or more leave a literal backslash
  behind, and `\ ` is not a break at all, which is why the marker is looked for before the row is trimmed. One
  row in this tree ends in a backslash and it is a fragment left by removing a span, so the rule costs nothing
  today; the proof is eight shapes in a table, each in both directions, and six falsifications. The round also
  found and closed the defect the fragment pointed at: a citation deleted outright joined the two halves of the
  word around it, so a removal now leaves a gap -- **965** spans in **873** rows have a word on both sides and
  **0** have Han on both sides.


- O-072 · ~~**The scanner's fidelity to the quote characters is a claim no test can prove.**~~ The item asked for a fixture
  or a census. The census came first and answered differently than either: the tree holds **0** files with a `/`
  immediately after a closed literal, and the reason the mutation survived is that nothing reads the emitted
  quotes at all -- v3.104 replaced the rescanning lookbehind with carried state, and from that commit on the
  characters were decoration. **Closed by finding 560**, which deletes the fidelity rather than testing it: the
  literal is blanked whole and the rule that a value cannot be followed by a pattern is now pinned by a fixture
  (`const ratio = "a" / 2;` above a budget, a file no compiler accepts and no lexer can misread).


- O-073 · ~~**`verify:local` can still print `OK` over a tree it no longer describes.**~~ The entry asked for a reader that
  fails the run without adding a site, and named the shape it would take: the failure report is already a pure
  function, so a reason can be printed where the others are, from the exit they use. **Closed by finding 563.**
  `treeMoved` is now one predicate with two readers, the decision states *which* kind of withholding it is
  (`starting-tree` / `subset` / `moved`) so the verdict is not a parse of a sentence, and `runVerdict` decides the
  word and the exit code together: a run whose tree moved prints `VOID` and exits **1** through the exit a failed step
  already uses, so the inventory gained no site. A dirty *start* is still `OK` -- that is a developer at work, and
  comparing states alone would fail every local run. Nine removals in the module are red (fifteen tests) and one in
  the gate is red (the exit becomes a zero and leaves the inventory).


- O-074 · ~~**No gate's *use of a pure decision* is proved.**~~ **Closed by finding 564.** `verify-local.mjs` gained
  `--rehearse <shape>`: the inputs a run would have produced come from a table in `gate-receipt.mjs`, and the gate
  then executes the same close-out it executes for real. `settle()` is that close-out, it computes its own
  `decision` -- a caller that computed it would leave the wiring outside the rehearsal's reach, and the wiring is
  the thing that was unobservable -- and both the rehearsal and the run call it. The expectations live in
  `gate-steps.test.ts`, so a rehearsal cannot agree with the implementation by construction, and the gate's refusal
  for an unknown name publishes the shape list so a table row added without a test is red. **Ten removals, 24 reds,
  no survivor**; the first row is the edit that was green in 207 tests four rounds ago and now costs four. One new
  site (143 -> 144, battery 228 -> 229), proved the ordinary way by the spawn that reaches it in under a second --
  finding 563's argument that a new exit is a new site was right, and it was about a branch no spawn could reach.


- O-075 · ~~**The export surface of `scripts/` is enumerated by symbol, and the reasons in its table are prose.**~~
  **Closed by finding 567.** v3.109 left nine rows whose reason was a paragraph, and this round read the nine
  bodies instead: eight never leave the process at all, and the ninth (`workflowPath`) reads `process.env` and is
  tested by setting it. All nine are taken by a test that imports them now -- four budget arms in their order, the
  modality expansion and its refusal, six rehearsal shapes and the merged pair, three workflow-path arms, the blob
  and revision readers at both layers, the pointer plan's empty commit list, six argv shapes, and the three ways a
  file reader can answer -- and the table holds **no rows**. The nine names are kept as a record the suite asserts
  against, so zero is a change with a date; and the prose was replaced by a rule the tree can read: **the body must
  cross the process boundary**, measured on the body with its comments blanked, calibrated against `workflowPath`
  (crosses) and `readBlob` (does not -- the row that stood here). `src/` and `scripts/` now answer the same
  question with the same kind of key.

- O-076 · ~~**The live list grows whatever the bound is.**~~ **Closed by finding 568**, which performed the split
  rather than estimating it again. The struck entries left `## Open` -- **48 of them, 65,544 bytes** -- and the
  index fell from **133,309 to 66,673** bytes, after which a volume could be born larger than it: twelve rounds
  moved to `volume-17.md`, **108,534 bytes** against an index of **67,407**. The closures are in
  [the record](closed.md), and the guard refuses a strike in the live list now, so this file cannot start
  carrying its own history again.

- O-077 · ~~**The heavy-fixture detector carries a second copy of the language scanner.**~~ **Closed by finding 569**,
  which measured the two scanners against each other before replacing one with the other: **219 of 248** test
  files blanked differently, every difference a template literal or a regex literal, and the heavy set was
  **unchanged** (`typecheck-entrypoint.test.ts:install` in both readings). The private four-regex version is
  gone, and four fixtures hold the shapes it got wrong.

- O-078 · ~~**The progress index has 772 bytes of room under its own volume, and the next round needs more.**~~
  **Closed by finding 568**, which moved the struck entries into a record: **48** of them, **65,544** bytes, so
  the index fell to **66,673** and a volume could be born at **108,534**. The repair is the one this entry named,
  performed as a round of its own rather than as a paragraph at the end of one.

- O-079 · ~~**An entry has no identity, so keeping the two lists apart is a rule about text.** The split's tiling --
  forty-eight closures plus twenty-eight open entries are the seventy-six the list held -- was checked once, by
  hashing each entry before and after the move, and that check is a measurement rather than a guard. A rule that
  compared the two files by identity was written and deleted in the same round because it could not be reached:
  a copy left in the live list is struck, and the live-strike refusal already catches it, so the only shape the
  copy rule could have seen was one the earlier rule had refused. What nothing catches is the accident that
  matters -- a closure pasted into the record while its live entry is edited into a different claim.
  ~~`[open: an id per entry would make the tiling a rule rather than a measurement, which is what the audit log already does with finding numbers; it is a change to every entry in both files, so it is a round of its own]`~~
  **Closed by finding 570.** Every entry of the two lists carries an id now -- `O-001` to `O-079`, three
  digits, right after the bullet -- and the two lists share one space that is dense, so a copy is one id in two
  places and a deletion is a hole in the set. The comparison this entry asks for is what the id supplies, and one
  sentence of the entry above is what the work corrected: **a copy is not caught by the live-strike refusal.** A
  document that is one residual in two places -- unstruck in the live list, struck in the record -- satisfies both
  of the split's refusals, and the guard as it stood at `176ec7b` printed `OK (2 entry(ies) ... 1 open with a
  reason, 1 closed by a finding)` over exactly that document. Measured rather than argued, and the same document
  is a fixture now. All seventy-nine entries were stamped in this round, and the tiling is a guard: the set is
  1..79 with none missing, recomputed on every run, and the next entry's number is the only number that keeps it
  that way.
