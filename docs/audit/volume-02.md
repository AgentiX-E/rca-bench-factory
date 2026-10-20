# Audit · volume 02

Findings 83–112. The index, the scope and the retractions are in [`../audit.md`](../audit.md).

## Finding 83 — the stability gate was never run, and four of its properties could not fail

The previous finding closed on a claim that the *remaining* gates should be assumed to contain more
dead guards. Checking that claim turned up something the claim did not predict: a gate that was not in
the remainder, because nothing had ever executed it at all.

### The gate that no job ran

`scripts/verify-scorer-stability.mjs` opens with four properties and a rationale:

> Why this is worth a test rather than an assumption: the four live runs showed `strict` moving 0 -> 1
> -> 0 and `type` moving 5 -> 6 -> 4 on identical dataset, identical prompt and a nominally identical
> model. Reading that as "the model is noisy" is a conclusion about the model. It is only correct if
> the *instrument* is stable -- and the instrument had never been checked for that over the real data.

It answers exactly the question the M1 work depends on: whether a reported rate is a measurement or a
sample. Its status, checked by source rather than by reading the workflow's comments:

| question | answer |
| --- | --- |
| Named by `package.json` as `verify:scorer-stability`? | yes |
| Named by any workflow step? | **no** |
| In the `lint` chain with its four sibling static checks? | **no** |
| Named by any test file? | **no** |
| Executed by any CI job? | **no** |

Six properties, a documented rationale, a dedicated package script, and no job had ever run it. The
CI comment that reads "The scorer-stability battery is a gate, not a report" sits directly above the
step for `inject-stability.mjs` -- a *different* script whose name differs by three characters, which
is plausibly how the omission stayed invisible for two rounds. The distinction matters: the battery
asks whether the stability properties are *enforced*; this gate asks whether they *hold*, and neither
question subsumes the other, because the battery mutates the scorer while the gate is the thing doing
the asserting.

Running it by hand passes on the real dataset, which is the failure mode: a green gate that no job
executes is indistinguishable from a gate that does not exist.

### Four of the six properties could not fail

Being run is necessary and not sufficient. A property is enforced only if some mutation makes it fail,
so a probe was written (`scripts/injection/scorer-stability-probe.py`) that mutates the built scorer --
the gate dynamically imports `packages/core/dist`, never `src`, so mutating source would test the build
instead of the gate -- and requires the gate to exit non-zero **and name the property**.

The first run:

```
CAUGHT    determinism: stamp the report with the clock
SURVIVED  input purity: sort the caller's sample array in place
SURVIVED  order independence: pair predictions by position
SURVIVED  denominator: count every graded pair as having a miss
SURVIVED  denominator: drop the omitted half of the classification
```

Four survivors, each traced to a specific reason, and **three of the four were the gate's fault rather
than the mutation's**:

| survivor | diagnosis | whose fault |
| --- | --- | --- |
| `input purity` | the mutation sorted an *internal* array; the check snapshots the caller's `samples` as JSON, which an internal reorder cannot reach | mutation's -- corrected to write `s.scored = true` onto the caller's sample |
| `order independence` | a positional pairing is refused outright by `scoreExtractionSample`'s id-mismatch throw before any rate is computed | genuinely guarded upstream -- reclassified, not fixed |
| `denominator` (every pair counts as a miss) | both fixtures made *every* graded sample miss, so `samplesWithMisses` equalled the graded count with or without the guard | gate's -- needed a fixture with one fully correct sample |
| `denominator` (omitted) | the saturated fixture answers every field, so `omitted` was pinned at 0 and the counter was unfalsifiable | gate's -- needed a fixture that actually omits a field |

Two more defects surfaced while correcting those, and both are the same shape as the ones the previous
finding recorded -- **a check whose input cannot exhibit the failure it looks for**:

1. **`input purity` was checked on an already-scored dataset.** The determinism block ran
   `buildExtractionReport` twice *before* the purity snapshot was taken, so any idempotent mutation had
   already happened and `before` and `after` agreed. The check passed against a scorer that overwrote
   every sample's `incidentText` with `"MUT"`. The snapshot is now the first use of `samples`, and
   determinism runs on a separately re-read dataset so neither check is satisfied by the other's
   leftovers.

2. **`samplesWithMisses === graded` was true for the wrong reason.** With no clean sample in any
   fixture, the equality held whether or not the `detail.length > 0` guard existed. Dropping that guard
   entirely -- `if (true)` -- produced `ALL PROPERTIES HOLD`. A third fixture now answers the first
   sample correctly, which makes the two numbers differ (`18 of 19`) and is the only state in which
   that check can fail.

### A rejected mutation, recorded because it nearly became a false report

Changing `detail.length > 0` to `detail.length >= 0` looks like it breaks the same property and does
not: `detail` is built from an empty array and only ever grows by `push`, so it is never negative and
the two predicates are equivalent. That is an **equivalent mutant**. Scoring it as a survivor would have
produced a finding about the gate that was really an observation about a comparison operator, and it is
recorded in the probe with a note rather than quietly deleted.

The same discipline rejected the first determinism mutation. `Date.now()` returns the same millisecond
for two adjacent calls, so a clock-stamp mutation passes roughly as often as it fails -- a *flaky*
detector, which would have reported the property as enforced half the time and as a gap the other half.
The mutation is now a call counter with an explicit initialiser, which fails deterministically.

### Result

```
CAUGHT    determinism: stamp the report with a call counter
CAUGHT    input purity: write back onto the caller's sample
GUARDED   order independence: pair predictions by position
          refused upstream: scoreExtractionSample throws on an id mismatch before any rate is computed
CAUGHT    denominator: count every graded pair as having a miss
CAUGHT    denominator: stop counting the omitted half
battery: 4 caught, 1 guarded upstream, 0 survived, 0 inert
```

`GUARDED` is a third outcome alongside CAUGHT and SURVIVED: the property holds, for a reason the gate's
own check never observes. It is listed by name in `EXPECTED_GUARDED` so it stays visible, and the probe
*fails* if a labelled-guarded mutation ever stops being refused -- a label that silently rots is worse
than no label.

The gate went from 6 checks over 1 fixture to **14 checks over 3 fixtures**: saturated, partial
(`omitted=19, wrongValue=38`) and mixed (`samplesWithMisses=18 of 19`). Wiring it into the `lint` chain
rather than a step of its own is deliberate -- the five checks alongside it answer the same kind of
question, *is this tree in a state we are willing to measure*, and the chain is the one place a future
static check is already looked for.

### Verification

| check | result |
| --- | --- |
| scorer-stability probe | **4 caught, 1 guarded upstream, 0 survived, 0 inert** |
| `verify-scorer-stability.mjs` | ALL PROPERTIES HOLD, 14 checks, 3 fixtures |
| new test file | 12 passed |
| `pnpm lint` | 6 checks, all OK (the gate is now the sixth) |
| source restored after every probe run | identical to backup |

### What this changes for the audit's earlier claim

The previous finding said the uncovered remainder "should be assumed to contain more of the same, not
less". This finding is consistent with that and sharpens it: not only did the remainder contain more of
the same, the count of "the same" now includes a gate outside the remainder entirely, whose four green
properties were green because their inputs could not fail. The pattern across both findings is one
claim worth stating plainly:

> **A property that has never been shown to fail is a comment with a print statement.**

That applies to the five `process.exit(1)` sites this round added tests for, to the six properties of
this gate, and to any future check whose author has not asked what input would make it refuse. It is
also the reason the probe is now a CI step: the gate's green is only meaningful while something
independent keeps trying to break it.

---

## Finding 84 — the gate-test battery's own verdict was unreadable, and it did not check its restore

Finding 83 closed by wiring its probe into CI. The first run of that commit went red -- at step 16,
which is the **gate-test battery from the previous round**, not at any step this round added. Steps 8
(lint, now with the stability gate) and 9 (coverage, 2512 tests) both passed on the runner.

The battery passes locally every time, and the runner's job log could not be read from here: the
download redirects to a host the project's proxy blocks, which is finding 55. So the failure had no
readable cause. Two defects follow from that, and neither is the failure itself.

### The verdict was three verdicts

The battery reports `SURVIVED` for three states that need three different repairs:

| state | what it means | the repair |
| --- | --- | --- |
| the tests ran and stayed green | the guard is genuinely not guarded | add the test, or delete the guard |
| the runner died before running anything | the instrument is broken | fix the invocation |
| the runner ran but collected no tests | the filter matched nothing | fix the filter |

A single line, "the test file stayed green, so it does not guard this", covers all three. This is the
**third appearance** of exactly that conflation in this repository. Pass 5 found it in two other
batteries, where `-1 > 0` is false so a crashed runner counted as a *caught* mutation, and a collection
error reports `failed: 0, passed: 0` so "nothing was detected" read as "nothing to detect". The
distinguishing quantity is the **total the runner reports**, never the failure count: only a run that
collected tests can make a claim about a guard.

`_diagnose` now prints which of the three it saw, with the runner's own last lines when it collected
nothing. Verified against all three inputs rather than assumed:

```
-- the runner collected no tests, so this says nothing about the guard.
   The last lines it printed were:
     Error: Cannot find module 'vitest'
-- the 9 collected test(s) all passed with the guard removed.
-- the runner exited 137 after collecting 9 test(s), but reported
   no failing test. That is a crash or a timeout, not a guarded property.
```

### It never verified that it restored the gates

The battery mutates a gate script, runs that gate's tests, and restores the file in a `finally`. Every
other battery in this repository *prints* a restore check; this one had none -- neither a print nor an
assertion. That matters more here than elsewhere, because this battery writes to the scripts that
**later CI steps execute**. A run interrupted between `write_text(mutated)` and the `finally` would
leave a gate mutated, and every subsequent step would fail for a reason none of them could name. The
whole job would then be diagnosed as "the tests are broken" rather than "the battery did not clean up".

The restore is now asserted against bytes captured **before** any mutation, because re-reading the file
at the end would compare a mutation against itself.

### A preflight check, for the failure that already happened once

`inject-stability.mjs` shipped with an absolute path that passed locally and threw on the runner
*before its first injection*, so it reported a clean-looking run that had measured nothing (finding 77).
A callability probe now turns that state into one line instead of twenty-five rows that mean the
opposite of what they appear to say.

### What this does not claim

The underlying CI failure was **not** diagnosed. What changed is that the next run will name its own
cause: the battery now reports which injection failed, why the verdict was what it was, and whether it
left the tree mutated. Reporting that the cause is still unknown is the honest status, and it is the
reason the diagnosis was built rather than the failure being re-run and hoped over.

No assertion was weakened to make it pass: 24 caught, 0 survived, 0 inert, 1 redundant (expected), and
the restore assertion added 1 more way for the run to fail.

A one-line consequence, recorded because it is the same class: `scripts/injection/__pycache__/` was
committed by accident in the first attempt at this change, because `.gitignore` did not list it and
`injection-write-discipline.test.ts` runs `py_compile` over these batteries as a syntax check. Build
output is now ignored.

## Finding 85 — the preflight ran the whole suite, and the battery could not report its own cost

Finding 84 built an instrument for a step that was failing in CI without a readable cause, and named
what it had not done: the failure itself was never explained. This finding starts from that step's
measurements rather than from its verdicts, and it did explain the failure -- not the way it was
expected to.

### The measurement that framed it

Running CI steps 11-16 in order, locally, reproduces every verdict the battery prints. It does not
reproduce the wall clock:

| step | runner | local |
| --- | --- | --- |
| 11 scorer stability | 6s | 7s |
| 12 component rule | 10s | 11s |
| 13 M1-ceiling probe | 1s | 0s |
| 14 M1-ceiling tests | 10s | 11s |
| 15 type-miss probe | 0s | 1s |
| **16 gate-test battery** | **162s failure** | **107s exit 0** |

The four steps that bracket it agree to within a second. Step 16 is the only one that spawns a
process per injection -- 25 of them -- and the only one that diverges. The job used 271s of a 1200s
budget, so the step returned a verdict rather than being killed: `-1` is not what a timeout looks
like, and neither is a completed step with a failure conclusion and ten skipped successors.

That left two possibilities, and the battery could distinguish neither, because it printed no
duration. A run that is slow and a run that is unguarded produce the same bare exit code. **A quantity
the battery measures every time and never reports** is the same defect as a verdict with three
meanings, one level down.

### The preflight was not a preflight

`assert_vitest_is_callable()` -- added by finding 84 so that a broken runner becomes one line instead
of twenty-five misleading rows -- built its probe like this:

```python
VITEST = ["pnpm", "exec", "vitest", "run", "--root", "packages/core"]
subprocess.run([*VITEST, "--version"])
```

which is:

```
pnpm exec vitest run --root packages/core --version
```

`run --root packages/core` puts vitest into run mode, and the trailing `--version` is accepted and
ignored. So the probe **executed the entire core suite** -- 92 files, 2520 tests, 54s on the runner --
and returned the suite's exit status as if it were a version query. Measured both ways before
changing anything:

```
A: pnpm exec vitest --version                               rc=0 in 0.3s
B: pnpm exec vitest run --root packages/core --version      still running at 10.1s
```

The probe also had no `timeout=`. Unbounded dead time *before the first injection* is precisely the
shape of finding 77 -- a battery that never started, reporting as though it had -- re-created inside
the check written to catch it. A preflight that silently spends a minute is not a preflight; it is a
second copy of the problem.

Fixed: the command is spelled out, bounded at `PREFLIGHT_TIMEOUT_S = 30`, and a timeout is reported as
its own outcome with the command and the wait, because those are the two facts a reader needs.

**Measured effect: the battery went from 107s to 80.4s.** The 27s is the redundant suite run, and it
was being paid on every invocation of a step whose whole purpose is to avoid redundant work.

### What the preflight does and does not explain about CI

It does **not** explain the 162s failure, and saying so is the point. The preflight's ~54s sits
*inside* the measured 162s -- it is not a step prepended to a green run. So the arithmetic is: 162s of
runner time produced a non-zero verdict, and the preflight accounted for roughly a third of it before
the first injection. Whether the remaining 108s contains an injection that decided differently on a
slower machine is **not established**, and the fix is not a claim that it is.

What changed is that the next run will say. Each injection prints its own duration, the run prints its
total and its slowest entry, and a run that exceeds its bound prints `TIMEOUT` -- a fourth outcome,
reported separately from `SURVIVED`, and reaching the failure condition. The three earlier rounds that
paid for this distinction each paid because two opposite repairs printed the same word; this is the
same distinction applied to duration.

### The test that could not be written the obvious way

The TIMEOUT branch had to be shown to execute rather than merely written. The obvious approach --
lower `PER_INJECTION_TIMEOUT_S` in a copy of the battery and run it -- **does not work, and the reason
is worth recording**:

Running the battery from inside vitest means vitest spawning vitest, because `run_tests` invokes
`pnpm exec vitest run`. In that nested environment the inner runner **collects no tests**, and the
battery reports `README 1` as SURVIVED with its own diagnostic saying so:

```
-- the runner collected no tests, so this says nothing about the guard.
```

Run directly, the same battery is green in 81.1s. So the nested run measured the nesting, not the
battery -- **a false survivor created by the harness**, which is the exact class of defect this round
is about. The test file therefore does two separate things: it asserts the source-level properties
(the bound exists and is read; the accumulator reaches the print; `finally` wraps the timed call), and
it exercises the TIMEOUT branch on a **self-contained fake** that reproduces the control flow with a
sleeping command. Running the battery for real is CI's step 16: one process, no nesting.

### A source scan that read its own explanation

The assertion that the broken command is gone failed on first run, because the docstring quotes the
broken command in order to explain why it was wrong:

```
174:     The first version of this function ran `[*VITEST, "--version"]`, which is
```

A whole-file scan cannot tell "this call is made" from "this call is explained", and forbidding the
second pushes an author to delete the reason rather than the defect. This repository had already
settled that question in `injection-write-discipline.test.ts`, so the same answer is used here:
comments and string literals are stripped before the scan.

### Verification

| check | result |
| --- | --- |
| py_compile | clean |
| core suite | **2520 passed (91 files)**, +8 |
| core coverage | `src` `100 \| 100 \| 100 \| 100`; all files `99.96 \| 99.93 \| 100 \| 99.96` |
| cli coverage | 173 passed, `100 \| 100 \| 100 \| 100` |
| gate-test battery | **24 caught, 0 survived, 0 inert, 0 timed out, 1 redundant**; source restored |
| gate-test battery cost | **80.4s** (was 107s), slowest injection 7.5s |
| new test file | **8 passed in 1.06s** |
| lint | six checks OK, `ALL PROPERTIES HOLD` |
| typecheck | clean |

### The claim this does not make

Neither defect was shown to cause the CI failure, and finding 85 does not say they did. It says the
step's cost is now measurable, the preflight no longer runs 2520 tests to answer a version question,
and the next run will name the injection if one behaves differently on a slower machine. The previous
round closed on "a property that has never been shown to fail is a comment with a print statement";
this round adds the neighbouring case -- **a quantity that is computed every run and never printed is
the same comment, one line further down.**

---

## Finding 86 — the battery's wrong verdict came from a second copy of itself, and the CI log could not say so

Finding 85 closed on "the next run will name the injection if one behaves differently on a slower
machine". The next run did not have to. The failure turned out to be in neither the assertions nor the
machine, and the reason it took a fourth round to see is that **the only place the answer existed was
a log this environment cannot open.**

### What the step timings said, and what they ruled out

Three CI runs of the identical step, two of them on trees whose `scripts/` are byte-identical
(`bafbdd7` → `e022576` touches only `docs/audit.md`):

| run | sha | preflight | step 16 | local |
| --- | --- | --- | --- | --- |
| 36295105757 | `30ff920` | whole-suite | **162s** failure | 107s |
| 36325497975 | `bafbdd7` | fixed | **65s** failure | 80.4s |
| 36325967547 | `e022576` | fixed | **107s** failure | 80.4s |

Two identical trees gave 65s and 107s. The step's duration is therefore **not a function of the code**,
which retires finding 85's own slowness hypothesis: a 65s runner is *faster* than the 80.4s local run
that passes. Everything the previous round added -- the `TIMEOUT` outcome, the per-injection `[x.xs]`
lines, the fixed preflight -- was in place for all three runs, and step 16 still failed in all three.

What those additions produced was the **shape** of the failure, printed to the one channel that is not
readable here. `GET /actions/jobs/{id}/logs` returns a 302 to `productionresultssa16.blob.core.windows.net`,
and the proxy refuses the connection (`http=000`); the check-run annotation says only
`Process completed with exit code 1` at `.github:353`. That limitation is finding 55, and it had turned
every CI failure in this round into a verdict with no cause.

### The local run that went red with no explanation, and had one

A plain local battery run then failed:

```
23 caught, 0 survived, 1 inert, 0 timed out, 1 redundant (expected)
time: 97.8s across 24 injection(s); slowest 10.1s (CLIREF 1. ...)

the battery did not restore its own mutations:
  scripts/build-example-bundle.mjs
  scripts/gen-examples.mjs
  scripts/gen-rcaeval-cases.mjs
RC=2
```

Three causes were tested and eliminated, in this order:

1. **The loop's restore is correct.** `finally: path.write_text(original)` wraps the timed call, and a
   full instrumented trace -- re-reading every gate after every one of the 25 injections, comparing
   against the import-time `ORIGINALS` -- printed **zero DIRTY markers and zero INERT**, 25 restores,
   tree clean. The logic is not the defect.

2. **The tests are readers, not writers.** `build-example-bundle.test.ts:72` and
   `gen-examples.test.ts:62` copy the live gate *into* a scratch tree and run it there; the sources
   were hashed before and after a full run of all three gate test files and were unchanged.

3. **`ORIGINALS` is not stale.** Re-imported against the tree, all five entries matched disk exactly.

What is left is the one thing a single process cannot do to itself: **a second process.** The `INERT`
on `RCAEVAL 3` is the tell -- its anchor `return Object.entries(perSuite)\n    .sort(...)` is on a line
no other mutation touches, so the file it read had been changed by something else between two
injections. Two copies both read the same `original` and each writes it back over the other's mutation.

Reproduced on demand, two copies started three seconds apart:

```
22 caught, 1 survived, 2 inert, 0 timed out, 1 redundant (expected)
the battery did not restore its own mutations: ...
RC=2
```

**A survivor, from a guard that is in fact caught.** `SURVIVED` is the one verdict in this repository
that must never be manufactured -- it is read as "write a test" and sends the next reader to fix
something that was never broken. Two batteries sharing one working tree while both rewrite it produce
exactly that, and the corruption is invisible in the numbers: 22 caught still looks like a battery.

### The fix, and what it does not do

The battery takes an `O_EXCL` lock in the OS temp directory before its first mutation and refuses the
second run with exit 3, naming the lock path, without printing a summary line. Measured: two copies
4s apart -- the second exited 3 with the refusal and no verdict, the first finished **24 caught, 0
survived, 0 inert**, source restored, lock released.

Why a lock and not a per-run copy of the tree: this battery's claim is about the **shipped** gates, and
a verdict about a copy is a verdict about the copy. The resource that must not be shared is the working
tree being rewritten, and refusing is loud and names its cause, while a corrupted baseline is a wrong
number that reads as a finding. A stale lock after a SIGKILL is accepted deliberately -- the refusal
names the file, so the repair is one `rm`, and a staleness heuristic can decide a *running* battery is
dead and reintroduce the very corruption.

**This does not explain CI's failure.** CI runs its steps sequentially -- no two batteries overlap
there -- so the race fixed here is a local hazard, not the CI cause. What CI's failure is remains open,
and the honest statement is that it is still unreproduced after the preflight, slowness, coverage
artifacts, a broken CLI, missing generated files, the restore logic, the readers, and now concurrency
have each been eliminated.

### Closing the channel that kept the answer out of reach

Since the log cannot be read here and the artifact API can (`GET /actions/runs/{id}/artifacts` answers
cleanly, and `official-data.yml` already ships one), the battery now writes
`gate-tests-battery-report.json` on **every** exit path and CI uploads it `if: always()`. The report
carries each injection's verdict, the gate's test file, the seconds it took, the failing test names,
and the run summary. A failing CI run is now a file that can be fetched and read, instead of a bare
exit code -- which is the difference between a failure this environment can diagnose and one it can
only observe.

### Verification

| check | result |
| --- | --- |
| py_compile | all seven batteries clean |
| new test file | **7 passed** (`gate-test-battery-exclusion.test.ts`) |
| concurrency, before | 2 copies 3s apart → **1 survived, 2 inert, tree dirty, rc=2** |
| concurrency, after | 2 copies 4s apart → second **rc=3 refused**, first **24/0/0**, tree clean |
| core suite | **2527 passed (92 files)**, +7 |
| core coverage | `src` `100 \| 100 \| 100 \| 100`; all files `99.96 \| 99.93 \| 100 \| 99.96` |
| cli coverage | 173 passed, `100 \| 100 \| 100 \| 100` |
| gate-test battery | **24 caught, 0 survived, 0 inert, 0 timed out, 1 redundant**; 78.9s; source restored |
| CI steps 11-25 | **all pass locally in order, one uninterrupted chain** |
| lint | six checks OK, `ALL PROPERTIES HOLD` |
| typecheck | clean |

The sentence this round adds to finding 85's "a quantity that is computed every run and never printed
is the same comment, one line further down" is the next one along: **a verdict that is printed to a
channel nobody can open is not a measurement either.** The battery was right about every guard, in
every run, and the reason it looked wrong for three rounds is that it said so where no one was
listening.

### Addendum to finding 86: the artifact was listed and still could not be read

The report channel added above was `actions/upload-artifact`, chosen because
`GET /actions/runs/{id}/artifacts` answers cleanly from this environment. The next
CI run showed that reasoning was one step short. Step 16 failed at **72s**, and:

```
Upload the gate-test battery report    success   0s
ARTIFACTS: total: 1
 - gate-tests-battery-report 1152 id= 10934848175
```

The artifact exists, is listed, and has the size the report should have. Fetching
its content does not work from here:

```
GET /actions/artifacts/10934848175/zip  ->  302
  Location: productionresultssa17.blob.core.windows.net/...
direct GET                                                     http=000
```

So the upload **proved the report was produced and did not make it readable** --
metadata reachable, content not. Measured across every channel this project has:

| channel | metadata | content |
| --- | --- | --- |
| job log | n/a | blocked (finding 55) |
| artifact | **listed** | blocked (`blob.core.windows.net`) |
| check-run output | empty without `checks:write` | n/a |
| **git object** | reachable | **reachable** |

Git objects are the one channel that is both, because `api.github.com` serves them
itself: `GET /repos/{o}/{r}/contents/{path}?ref={branch}` returns the bytes
base64-encoded in the response. Verified end to end before wiring it in -- the new
`scripts/publish-battery-report.py` committed a report to a scratch `ci-reports`
branch and both `HEAD` and `gate-tests-battery-report.json` came back byte-exact
through the API **from inside this environment**, which is the only test that
matters for a channel whose purpose is to be readable here.

The branch is orphaned and never `master`: the report is CI output, it is
overwritten every run, and it must not land in the tree the other gates read. The
artifact upload stays, because it is what a human reading the run page wants.

**The generalisation, and it belongs beside finding 85's and this finding's closing
lines:** a channel can be reachable and still not carry content, so "I can list it"
is not the same as "I can read it". That is the fourth form of the same mistake in
this sequence -- a property never shown to fail, a quantity computed and never
printed, a verdict printed to a channel nobody can open, and now **a report
published to a channel that answers with a redirect**. Each one looked like the
thing it was meant to be.

---

## Finding 87 — the publish step reported success while publishing nothing

Finding 86's addendum ended by wiring the battery's report to the orphan
`ci-reports` branch, after verifying through `api.github.com` **from inside this
environment** that a git object is a channel that both is reachable and carries
content. The wiring used the workflow's own `GITHUB_TOKEN`. The next run closed
the loop, and the answer was no.

### The measurement

Run `36331975404` on `ab25e7357` -- the first run whose commit contains the
publish step:

```
 16 FAIL  Gate-test battery (...)
 17 ok    Publish the gate-test battery report
 18 ok    Upload the gate-test battery report
```

Step 17 says **`ok`**. The branch it was supposed to create:

```
GET /git/ref/heads/ci-reports           -> 404
GET /branches?per_page=50               -> gh-pages, master
```

**No branch. No report. No error visible anywhere.** A step that reports success
while publishing nothing is precisely the failure this sequence has been about
since finding 85, appearing one level up from where it was fixed.

### Two layers, and the second is the finding

**The first layer is an ordinary permission mistake.** The workflow declares

```yaml
permissions:
  contents: read
```

at the workflow level, so no `GITHUB_TOKEN` in the job can create a ref. The
publish answered `403`. The fix is one line: `contents: write`. The grant is
workflow-wide because that is the smallest unit GitHub offers, but only one step
uses it, and the branch it writes to is not `master`.

**The second layer is why it stayed invisible, and it was deliberate.**
`scripts/publish-battery-report.py` caught every error, printed it, and returned
0:

```python
except (urllib.error.URLError, urllib.error.HTTPError, KeyError, OSError) as exc:
    # Deliberately not fatal. This step is a diagnostic channel; failing the
    # job here would replace the battery's verdict with this one, which is
    # the mistake the battery itself was just repaired for.
    print(f"could not publish the report: {exc}")
    print("the battery's own exit code still carries the verdict")
return 0
```

**The reasoning was sound and the code was wrong.** The comment's claim is true:
a diagnostic channel that can fail the build does replace the verdict it carries.
But `return 0` does not avoid that -- it only hides the broken channel, and a
broken channel is *also* a false report. The observed outcome is the proof: the
run page said the report had been published, and no report existed.

The two properties are separable, and the code conflated them:

* Failing this step **cannot** flatter the battery. Step 16 has already run; its
  exit code is already recorded. Nothing this step returns can turn a red battery
  green.
* Failing this step **can** stop a broken channel from reporting success, which is
  the only thing it should ever have been trusted to do.

So the exit code is now three-valued, and the distinction is the point:

| outcome | exit | why |
| --- | --- | --- |
| published | 0 | the channel worked |
| nothing to publish (no report, or no token) | 0 | both are real reasons to do nothing |
| **publish attempted and failed** | **1** | this is not a verdict about the battery, it is a broken channel |

### The test that had to be reversed

`packages/core/test/publish-battery-report.test.ts` asserted the old behaviour:

```ts
it('a failed publish cannot change the verdict the battery reported', () => {
  // ... must still exit 0, and must say that the battery's own exit code
  // is what carries the verdict.
  expect(result.status).toBe(0);
  expect(result.output).toMatch(/exit code still carries the verdict/);
});
```

**This test passed while the bug shipped.** It encoded the wrong property in an
assertion, which is the fifth form of the same mistake: after a property never
shown to fail, a quantity computed and never printed, a verdict printed to a
channel nobody can open, and a report published to a channel that answers with a
redirect, the fifth is **a property asserted backwards so the test enforces the
defect**. The case is rewritten to require `status === 1` and
`/channel is broken/`, with the CI evidence in the comment so the reversal cannot
be read as a change of preference.

A sixth case asserts the shipped workflow carries `contents: write`, that the
grant does not reach `master`, and that the publish step is still `if: always()`.
That is asserted against the file that was actually wrong -- a permission lives in
YAML, not in the script, and a test of the script alone could not have caught it.

### Verification

| check | result |
| --- | --- |
| rejected token | **exit 1**, `could not publish` + `channel is broken` (was exit 0) |
| published, then read back | `ci-reports` at `6cf392896`; `HEAD` = 143-byte summary |
| `gate-tests-battery-report.json` | **13214 bytes, `cmp` clean -- byte-exact** |
| workflow YAML | parses; `permissions = {'contents': 'write'}`; 26 steps |
| publish test file | **6 passed** |
| core | **2533 passed (93 files)**; `src 100/100/100/100`; all files `99.96/99.93/100/99.96` |
| gate-test battery | **24 caught, 0 survived, 0 inert, 0 timed out, 1 redundant**; 80.2s; source restored |
| lint | `ALL PROPERTIES HOLD` |
| typecheck | clean |

### What this does and does not settle

**It settles the channel.** `ci-reports` now exists, holds a byte-exact copy of a
real report, and is readable from this environment. Whether CI's step 16 fails is
a separate question that the next failing run will finally answer in full.

**It does not explain CI's step-16 failure.** The publish bug is downstream of it
and independent: it affected whether the *result* could be read, never whether the
battery passed. That question is still open, now with a channel that works.

### The lesson

**A tolerant error handler is an untested error handler.** The handler ran on
every CI invocation, took the 403 branch on every CI invocation, and printed the
correct message every time -- and the step reported green every time, because
nothing ever asserted what it exited with. The line that was supposed to be
defensive was the line that made the defect unobservable, and the test that was
supposed to catch it asserted the defect instead.

---

## Finding 88 — the report could be read and still not be understood

Finding 87 fixed the channel. Run `36333833579` on `e188c8870` was therefore the
first CI run whose per-injection verdicts were readable from this environment, and
it closed the loop with an answer nobody expected:

```
HEAD: gate-test battery, run 36333833579 on e188c8870:
      0 caught, 24 survived, 0 inert, 0 timed out, 1 redundant (expected); 108.1s
```

**Every injection a survivor.** For a battery whose whole purpose is to prove the
guards are guarded, that is either the worst possible verdict or a battery that
could not speak, and the report could not distinguish them.

### First: the mechanism is sound

Before blaming CI, the same mutation was applied by hand and the **exact CI
command** run against it:

```
$ pnpm exec vitest run --root packages/core check-readme-sample.test.ts
 Test Files  1 failed (1)
      Tests  6 failed | 3 passed (9)
RC=1
```

So the injection reaches the test, the test fails, and the runner propagates the
failure. And the CI timings match a *working* run, not a crashed one:

| injection family | local (passing run) | CI (all "survived") |
| --- | --- | --- |
| README | 1.6s | **1.4s** |
| BUNDLE | 2.1s | **2.4s** |
| EXAMPLES | 2.5s | **2.9s** |
| CLIREF | 7.4s | **11.7s** |

vitest started in CI. It ran for about as long as it does here. It simply did not
fail -- or it did not collect the tests, and **the report had thrown away the
quantity that separates those two**.

### The discarded quantity

`_diagnose` already computes the collected test count, because two other batteries
in this repository were repaired for conflating exactly these cases:

```python
collected = re.search(r"Tests\s+(\d+) (?:failed|passed)", output)
...
if total == 0:
    return ("-- the runner collected no tests, so this says nothing about the guard.\n"
```

It then prints that, and **the print goes to the job log** -- the one channel this
project cannot read (finding 55). Meanwhile `write_report` stored `[]` for every
non-CAUGHT verdict:

```python
results.append((name, "SURVIVED", [], elapsed))
```

So "the runner started and found nothing" and "the tests ran and passed" produced
**byte-identical reports**, and they call for opposite repairs. One is a
configuration bug; the other is twenty-four genuine findings that would each need
a new test.

**This is finding 85's lesson one layer out.** Finding 85 was a quantity computed
and never printed. This is a quantity that *is* printed, to a place nobody can
read. The intermediate fix -- write it to a file -- does not help if the file
carries a subset of what the console got.

### The fix: three fields, all three arms

Every row now carries:

| field | meaning |
| --- | --- |
| `collected` | how many tests the runner itself says it ran |
| `exit_status` | what the runner exited with |
| `diagnosis` | `no_tests_collected` / `tests_passed` / `runner_error` |

`no_tests_collected` means the runner found nothing and the row says **nothing**
about the guard. `tests_passed` with `collected > 0` is a **real** survivor.
`runner_error` is a crash that reported no failing test. Three causes, three
repairs, and now one field.

They are wired into **all three verdict arms**, asserted by count in the test,
because a field wired into one arm answers the question only for the cases that
already had an answer.

### A bug in the helper, found while writing it

The first `collected_count` anchored the passed count on the pipe:

```python
passed = re.search(r"\|\s*(\d+) passed", output)
```

A fully-green run prints `Tests  9 passed (9)` with **no pipe**. That pattern
returns 0 for a run that collected nine tests, and `diagnosis` would then label it
`no_tests_collected` -- **the exact confusion this field exists to remove,
reproduced inside the fix for it.** It was caught by checking the helper against
shapes rather than against one example:

| output | expected | first version | fixed |
| --- | --- | --- | --- |
| `Tests  6 failed \| 3 passed (9)` | 9 | 9 | 9 |
| `Tests  9 passed (9)` | 9 | **0 -- MISMATCH** | 9 |
| `Tests  0 passed (0)` | 0 | 0 | 0 |
| `Tests  1 failed \| 8 passed (9)` | 9 | 9 | 9 |
| `Tests  3 failed (3)` | 3 | 3 | 3 |

The test now enumerates six summary shapes **and executes the helper through
`python3`** rather than reimplementing it in TypeScript, because a
reimplementation would pass while the shipped regex was wrong.

### One step further: a verdict without its evidence

A report that can be read may still not be understood -- `0 caught, 24 survived`
and then nothing, while the output that would explain it went to the console. So
every row also carries `output_tail`: the runner's last twelve non-blank lines,
where the assertion failure and the summary live.

**A verdict without its evidence is the same defect as a verdict without its
channel, one step further along.** The CAUGHT rows now ship the failing assertion
and its source line inside the report -- `expect(result.status).toBe(0)` at
`check-readme-sample.test.ts:353` -- so the next CI failure is diagnosable from the
report alone.

### Verification

| check | result |
| --- | --- |
| core | **2537 passed (93 files)**; `src 100/100/100/100`; all files `99.96/99.93/100/99.96` |
| gate-test battery | **24 caught, 0 survived, 0 inert, 0 timed out, 1 redundant**; 78.5s; source restored |
| REDUNDANT row | `collected: 21, exit_status: 0` -- 21 tests ran and passed, which is the distinction working |
| report size | 13214 -> **31678 bytes** |
| exclusion test file | **11 passed** |
| publish test file | **6 passed** |
| lint / typecheck / py_compile | `ALL PROPERTIES HOLD` / clean / clean |

### What this does and does not settle

**It settles the report's ability to answer its own question.** The next CI
failure's rows will say which of the three causes applied, and carry the runner's
own output, without needing the log.

**It does not explain the 24 CI survivors.** This round did not diagnose them; it
put the means of diagnosing them into the report. That question is still open, and
it is now the only open question about this gate.

### The lesson

**Evidence has to travel the whole way or it is not evidence.** Finding 85's
quantity was never printed. Finding 87's channel printed to nowhere readable. This
one printed to a place that was readable and carried less than the console did.
Each repair was correct and each was one step short, because "can I read it?" and
"can I understand it?" are different questions and only the first is answered by
having a channel at all.

---

## Finding 89 — the battery's failure path crashed before it could report

Finding 88 added fields to each verdict. Doing that changed the width of the tuple
the battery builds, and **one reader of that tuple was not updated**:

```python
# the builder, after finding 88
results.append((name, "SURVIVED", [], elapsed, {"collected": collected, ...}))

# the failure-listing loop, unchanged
for name, verdict, _, _ in results:
```

On CI that raises

```
ValueError: too many values to unpack (expected 4)
```

**after** the summary prints and **before** `write_report` on that path. So the
run printed its verdicts to the log, crashed, and wrote no report at all.

### How it was found

The symptom was not a crash message -- it was **silence with the shape of
success**. Run `36335878589` showed:

* step 16 `FAIL` (as always),
* step 17 `Publish the gate-test battery report` **`ok`**,
* step 18 `Upload the gate-test battery report` **`ok`**,
* `GET /actions/runs/36335878589/artifacts` -> **`total_count: 0`**,
* `ci-reports` still pointing at the *previous* run's commit `9eac31ce1`.

**Zero artifacts and a green upload step** is the contradiction that led to it.
The publish step reported success because it found no report and treated that as
"nothing to do" -- correct behaviour, and it is what made a crashed battery look
like a run that had simply not produced anything yet.

### The two facts that had to be kept apart

It would have been easy, and wrong, to read this as the explanation of the
24 survivors. It is not:

1. **The 24-survivor report was real.** It came from `e188c8870`, where the
   builder and the loop were both four-wide and consistent, so that run completed
   and genuinely reported every injection surviving. **That question is still
   open.**
2. **This crash is new and is mine**, introduced by finding 88's field addition,
   and it affected only whether *this* run's report existed.

### The fix, and how the failure path was proven

The loop now unpacks with a star:

```python
for name, verdict, *_ in results:
```

Proving it needed the failure path, which never runs on a green battery. It was
forced by emptying `EXPECTED_SURVIVORS` so `RCAEVAL 2` becomes a plain `SURVIVED`:

| before the fix | after the fix |
| --- | --- |
| summary printed, then `ValueError`, **no report** | `RC=1`, failure list printed, **report written (31676 bytes, 9 fields)** |

The test asserts the shape rather than the crash -- every `results.append((name,`
must build at least five fields, and no reader may use a fixed four-wide unpack --
so adding a sixth field cannot silently reintroduce this.

### An unrelated hazard, found while verifying

Running the battery and a plain test run **concurrently** corrupts the test run.
Six `check-readme-sample` failures appeared that way and vanished when the two were
run in sequence, and `git status` showed the gate itself clean, so the mutations
were restored and the *reader* was the casualty.

The `O_EXCL` lock from finding 86 excludes a second **battery**; it does not
exclude a plain `vitest` run, which is a reader and can read a gate mid-mutation.
Recorded rather than fixed here because the honest fix is a question -- whether a
reader should also take the lock, or whether the battery should mutate a copy and
the gate test should read the copy -- and the current behaviour is a **local
development hazard, not a CI one**, since CI's steps are sequential.

### The lesson

**A field added to a tuple is a change to every reader of it, and the compiler does
not say so in a dynamically typed language.** Python would have caught this at the
call site had the tuple been a dataclass or a `NamedTuple`; with a bare tuple the
only guard is a test that asserts the width. There is now one.

**And the failure was invisible for the third time in three rounds, each time for a
different reason**: finding 87's channel reported a success it had not achieved,
finding 88's report was readable and mute, and this one was a *step* reporting
`ok` about a file that did not exist -- while the artifact count, which nobody was
reading, said `0`.

## Finding 90 — the 24 survivors were a parse failure, and the parser was reading a terminal's output on CI

Finding 88 closed with the question still open, in these words:

> **The 24-survivor report was real.** It came from `e188c8870`, where the builder
> and the loop were both four-wide and consistent, so that run completed and
> genuinely reported every injection surviving. **That question is still open.**

Finding 88 also built the instrument that could answer it, and said so: the rows
would "say which of the three causes applied, and carry the runner's own output,
without needing the log." The next CI run produced that report. **It answered the
question, and the answer was that nothing had survived at all.**

### The evidence

Run `36337157149` on `d33b4e47a`, the first report to carry `collected`,
`exit_status`, `diagnosis` and `output_tail`:

```
summary: {'caught': 0, 'survived': 24, 'inert': 0, 'timed_out': 0, 'redundant': 1}
=== DIAGNOSIS COUNTS ===            no_tests_collected: 25
=== collected / exit_status ===     collected=0 exit_status=1: 24
                                    collected=0 exit_status=0:  1
```

Every row said the same thing: *the runner found nothing, so this row says nothing
about the guard.* And the row's own `output_tail` -- the field added for exactly
this -- said the opposite:

```
❯ test/check-readme-sample.test.ts:353:27
  353|     expect(result.status).toBe(0);
     |                           ^
```

That is an assertion failure in a test that ran. `repr()` on the captured text
settled the rest:

```
'\x1b[36m \x1b[2m❯\x1b[22m test/check-readme-sample.test.ts:...'
```

**The frames are wrapped in SGR colour codes.** CI is not a TTY and vitest emits
them anyway; a local run does not. Every regex in the battery that anchored on the
first visible character therefore matched in a terminal and missed in CI.

### Four defects, and the first fix only addressed one

`failed_count` searched for `Tests\s+(\d+) failed`, and vitest prints the summary
**below** the failure frames. The report keeps a twelve-line tail, which stops
inside the last frame. So the count was 0 -- and the CAUGHT condition is exactly

```python
if status != 0 and failed_count(output) > 0:
```

**Twenty-four injections that the runner had plainly caught fell through to
SURVIVED.** That is the whole of the 0-versus-24 discrepancy. It was never a
behavioural difference between the two machines; it was one machine's text being
read by a parser written for the other's.

Fixing that is not enough, and the three further defects are each invisible to the
others:

| # | defect | what it produced | why the previous fix missed it |
| --- | --- | --- | --- |
| 1 | summary absent from a tail | `failed_count` 0 → SURVIVED | the summary is below the frames by construction |
| 2 | ANSI between marker and name | same, on CI only | a terminal run has no escapes, so local stayed green |
| 3 | `collected_count` fell back to counting frames | a **lower bound printed as `collected`** | the fallback was written to make the count non-zero, and it did |
| 4 | `diagnosis` branched on that undercount first | twenty-four real failures labelled `runner_error` | the label looked right: status was 1 and no summary was seen |

Defect 4 is the one that would have cost the most time in the next round. Every one
of those rows carried `expect(result.status).toBe(0)` with the caret printed under
it, and was reported as *"the runner exited non-zero without reporting a failure"*
-- a crash. A reader following that would have gone looking for a crash in a run
that had reported its failure precisely.

Defect 3 is the same class as finding 88, one layer in: finding 88 was a quantity
computed and never printed; this is a quantity printed under a name that overstates
it. `collected: 1` on a row whose runner had reported six failures is not a wrong
number, it is a floor presented as a total, and the basis now travels beside it.

Defect 4's fix is an ordering, and the ordering is the point:

```python
if status != 0 and failed_count(output) > 0:
    return "tests_failed"
if collected == 0:
    return "no_tests_collected"
```

The failure evidence is consulted **first**, and it is consulted directly rather
than through a count derived from a slice of text.

### The field that carried the evidence was sized to exclude it

`output_tail` kept twelve lines. A vitest failure frame is nine lines -- the
`❯ file:line:col` header, the source excerpt with line numbers, the `^` caret, and
the blank separators -- and vitest prints *every* frame before the summary. Twelve
lines lands in the middle of the last frame and stops:

```
❯ test/check-readme-sample.test.ts:353:27
  353|     expect(result.status).toBe(0);
     |                           ^
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[6/6]⎯
```

That is a real captured tail of a row that failed **six tests**. The frame proves a
test ran; the summary is the count; twelve lines delivered the first and never the
second, so every parser that prefers the summary fell back to a floor. It keeps
forty now, which is the field finally being sized against the thing it has to
contain rather than against a wish for a small diff.

### Verified against the bytes, not against a paraphrase

The captured tails are committed verbatim, escapes intact, as
`packages/core/test/fixtures/gate-battery-ci-output.json`, and
`packages/core/test/gate-test-battery-ci-parsing.test.ts` replays them through the
shipped helpers by lifting the functions out of the file and executing them. A
fixture paraphrased into TypeScript string literals would have been written by the
same hand as the fix, and would tend to be the shape the fix handles.

Each of the four behavioural assertions was checked against the pre-fix parsers on
those bytes, and all four fail there:

| assertion | pre-fix | post-fix |
| --- | --- | --- |
| `failing_tests` finds an ANSI-wrapped frame | 0 names | 1 name |
| `failed_count` without a summary in the text | 0 | 1 |
| verdict on the exit-1 row | SURVIVED | CAUGHT |
| `diagnosis` of a real failure | `no_tests_collected` | `tests_failed` |

Replayed across all 25 captured rows, the pre-fix code reaches `caught 0` and the
hardened code reaches `caught 24` -- reproducing the CI report and then exceeding
it, on the same bytes.

### A test that broke, and what it was actually asserting

`gate-test-battery-exclusion.test.ts` lifted `collected_count` out of the file by
slicing between two neighbouring definitions:

```ts
const start = source.indexOf('def collected_count(');
const end = source.indexOf('\ndef diagnosis(');
```

That is a slice between two named neighbours, not a definition, and inserting
`collected_basis` between them made it swallow the new function whole -- and cut
`collected_count` off from `failing_tests`, which its new fallback calls. The
generated script raised `NameError`, printed nothing, and the assertion compared an
empty string. **An output-less subprocess reads as a wrong answer, not as a broken
harness**, which is why it took a moment to see. It extracts by name now, and lists
its dependencies rather than assuming them.

### The result

| | CI `d33b4e47a` | local, after |
| --- | --- | --- |
| caught | 0 | 24 |
| survived | 24 | 0 |
| redundant | 1 | 1 |
| `diagnosis` labels | `no_tests_collected` ×25 | `tests_failed` ×24, `tests_passed` ×1 |
| `collected_basis` | absent | `summary` ×25 |
| runner restore | — | asserted, `RC=0` |

The local run now reports `collected_basis: "summary"` on all twenty-five rows,
with exact counts, and `collected=9` for the README file that the CI tail could
only undercount as 1. That is the report doing what it was built to do: the field
that was added to make a verdict explicable is, two rounds later, the field that
made its own earlier value legible as a floor.

### The lesson

**A parser has to be written against the bytes the producing environment emits, and
"it works here" is not evidence about there.** The mechanism had been invisible for
three rounds for a different reason each time: the log could not be read, then the
report was readable and mute, then the report did not exist. This time the report
existed, was readable, and was believed -- and the belief was wrong because the
code had read a terminal's text on a machine that does not have one.

The narrower lesson is about fallbacks. **A fallback that turns 0 into a non-zero
number is not necessarily an improvement**: defect 1's fix produced defect 3, and
defect 3 produced defect 4. Each step made the number look more plausible while
moving it further from what it claimed to be. The repair was not a better fallback
but *labelling the evidence*, so that a floor is never read as a total.

## Finding 91 — two successful M1 runs were never read, and reading them settles four rounds of hypotheses

Four rounds -- findings 62, 64, 65 and 78 -- closed by proposing an experiment for the
next round. Findings 62 and 64 proposed prompt variants and measured them. Finding 65
built the `missClassification` instrument and named the question it would answer.
Finding 78 measured M1's ceiling and re-classified the blocker as model capability.

**Two of those runs had already happened and nobody read them.** Run `36240660455`
(`9932e766c`) and run `36242319547` (`567118aea`) both completed `success` on
2026-09-26, after `9c72a56` -- the revision finding 64 read -- and both carried the
full annotation set: headline, per-field, miss classification, and per-row miss detail.
`09-推进进度追踪.md` recorded `9c72a56` as the latest reading. The instrument finding 65
built was reporting from the moment it shipped, into a channel that is readable, and the
readings sat uncollected for two revisions.

### The three readings, side by side

| run | sha | `strict` | `type` | `category` | `component` | miss classification |
| --- | --- | --- | --- | --- | --- | --- |
| `36229820836` | `9c72a56` | 1/19 | 6/19 | **11/19** | 3/19 | not yet emitted |
| `36240660455` | `9932e766c` | 0/19 | 4/19 | **11/19** | 4/19 | wrong value 38, omitted 0 |
| `36242319547` | `567118aea` | 0/19 | 5/19 | **11/19** | 2/19 | wrong value 39, omitted 0 |

### What the two unread runs establish

**1. `category` is bit-stable and `type` is not.**

| field | three values | spread |
| --- | --- | --- |
| `type` | 6, 4, 5 | **2 samples (10.5 pp)** |
| `category` | 11, 11, 11 | **0** |
| `component` | 3, 4, 2 | **2 samples (10.5 pp)** |

`category` scored 11/19 three times, across three revisions of the prompt and the
pipeline. `type` and `component` each moved by two samples. The stability is not
"the model is consistent" -- it is that **the same eleven samples are being answered
correctly each time**, which is what makes the miss list worth reading rather than
re-running.

**2. The miss is never an omission.**

```
wrong value 38, omitted 0, samples with >= 1 miss 19      (9932e766c)
wrong value 39, omitted 0, samples with >= 1 miss 19      (567118aea)
```

Finding 65 built this distinction to separate "the model answered incorrectly" from
"the model declined to answer", because they have different repairs -- a shape rule for
the first, a required-fields instruction for the second. **Every one of the 39 misses is
a wrong value. Not one is an omission.** `samplesWithMisses` is 19 of 19, so the
required-fields instruction has nothing to fix.

### What the miss detail shows, and it is not what any prior round assumed

The per-row detail names both sides. Reading the 14 `type` misses in full:

| expected | the model answered | relationship |
| --- | --- | --- |
| `cpu-saturation` | `cpu-throttling` | the same fault, named by effect rather than by cause |
| `memory-leak` | `unbounded-session-cache-growth` | a leak, described by its mechanism |
| `disk-full` | `disk-space-exhaustion` | **exact synonym** |
| `network-loss` | `egress-interface-packet-loss` | **exact synonym, more specific** |
| `pod-kill` | `kubelet-eviction` | the event, named by its trigger |
| `container-crash` | `ffmpeg-native-segmentation-fault` | the crash, named by its cause |
| `redis-latency` | `redis-single-thread-cpu-saturation` | the latency, named by its cause |
| `kafka-consumer-lag` | `synchronous-outbound-call` | the lag, named by its cause |
| `database-connection-pool-exhaustion` | `connection-pool-deadlock` | same pool, cause versus state |
| `regex-catastrophic-backtracking` | `catastrophic-regex-backtracking` | **word order only** |
| `config-mismatch` | `stale-config-key` | the mismatch, named by its instance |
| `upstream-5xx` | `dependency-degradation` | the same event, a different abstraction level |
| `library-version-incompatibility` | `dependency-api-incompatibility` | the same incompatibility, another noun |
| `replica-lag` | `replication-apply-bottleneck` | the lag, named by its cause |

**Eight of the fourteen share at least one token with the expected value, and one is a
word-order permutation.** Not one is a different fault.

And the `category` misses show the same thing one level up:

| expected | the model answered | count |
| --- | --- | --- |
| `middleware` | `resource` | **4** |
| `resource` | `code` | 1 |
| `runtime` | `resource` | 1 |
| `runtime` | `dependency` | 1 |
| `code` | `config` | 1 |

`middleware` is the expected category four times and the model answered `resource` all
four times. The middleware samples are `redis-latency`, `kafka-consumer-lag`,
`database-connection-pool` and `mysql-replica-lag` -- all of which *do* manifest as host
resource pressure, which is exactly the observable the incident text describes. The
model classifies **where the symptom appeared**; the ground truth records **which tier
owns the fault**.

### Why this is a finding about the benchmark, not about the model

The two fields are scored by exact equality after `normalizeFaultType`, which folds case,
whitespace and separators -- and `extraction-scoring.ts` says in its own words that it
refuses a synonym table:

> A category is folded the same way, with no synonym table -- deciding that `net` means
> `network` is a judgement, and `importer.ts` deliberately leaves that judgement to the
> H3 reviewer.

That refusal is correct and should stay. **The finding is not "the comparator should
accept synonyms."** It is that the *ground truth's granularity* and the *model's
granularity* are different, and under exact equality that difference is scored as error
regardless of which one is right. The evidence is that the disagreement is systematic and
directional: the answer is consistently a **mechanism, a cause, or a more specific
instance** of the expected abstraction, and never a neighbouring fault.

That distinction decides what a fix would even be, and it rules out the two the recent
rounds were considering:

- **Not a prompt defect.** Findings 62 and 64 tried stating the format, and the format is
  not what differs -- the model produces a well-formed slug. It produces the *wrong
  altitude* of slug, and no prompt has told it which altitude the ground truth uses,
  because the ground truth does not state one.
- **Not a comparator defect in the sense of needing synonyms.** Accepting
  `disk-space-exhaustion` for `disk-full` is a judgement; the module is right to refuse
  it, and the judgement belongs to whoever owns the dataset.
- **It is a labelling-granularity question**, and unlike the two above it is answerable
  without another LLM run: the 39 miss rows are recorded, and each can be adjudicated
  as "the same fault at a different altitude" or "a genuinely different fault" by a rule
  that does not need the model in the loop.

### What this does not establish

- **That a coarser ground truth reaches 70%.** This is the same trap finding 78 was
  written to avoid. The 39 misses are *all* same-mechanism by inspection, but inspection
  is mine, and the adjudication has to be a rule over the recorded rows rather than a
  reading of them. Until that rule exists, "the labels are too fine" is a hypothesis with
  strong support, not a measurement.
- **How many samples the granularity actually costs.** 14 `type` misses is a count of
  misses, not a count of samples that would become `strict` hits. `strict` requires all
  three scored fields at once, and `category` at 11/19 caps it independently. The
  arithmetic has to be done over the per-sample cross-product, which the per-row detail
  now makes possible.
- **Whether the model or the ground truth is the one to change.** Both are defensible and
  it is a product decision. What is not defensible is continuing to treat it as a model
  capability gap, which is how finding 78 re-classified it.

### The process defect, which is the same one as finding 90 one level out

Finding 90 established that a parser must be written against the bytes the producing
environment emits. This is the adjacent failure: **an instrument can be correct,
readable, and reporting, and still not read.** Finding 65 built `missClassification` and
wired it to an annotation precisely so the question of *why* fields miss would be
answerable. Two runs emitted it. The gap was not the instrument, the channel, or the
format -- it was that no step in the loop reads back the annotations of runs that
already completed, so "what does the latest run say" was answered from a document
rather than from the runs.

The repair is not a code change. It is that **the reading is taken from the runs, not
from the last document that mentioned a run** -- and the first application of that rule
is this finding.

---

## Finding 92 — the two readings of the `type` misses disagreed, and the transcript was the wrong one

Finding 91 closed by naming a reconciliation it could not do from where it stood. The
`type` misses had been read twice and the two readings did not match:

- **The live annotation of run `567118aea`**, read directly: **14** `type` misses.
- **`scripts/probe-type-misses.mjs`**, whose output was quoted as the current figure:
  **15** `type` misses, and it printed `different-mechanism 6` where the first reading
  called all 14 the same mechanism at a different altitude.

Finding 91 recorded the discrepancy and refused to resolve it by preference, which was
right. What it could not say -- because it had not done it -- is **which of the two was
reading the run**, and the answer turns out to settle the question and expose a second
defect underneath it.

### The transcript was exact, against a different run

`probe-type-misses.mjs` carried `RECORDED_TYPE_MISSES`, fifteen rows, and its own
docstring named the run: *"the fifteen `type` misses from run `9932e766c`"*. That claim
is **true**. Re-derived from the annotation of `9932e766c`, the fifteen rows match the
transcription **byte for byte**, in order, with no difference in any field -- including
the awkward ones (`native-ffmpeg-segfault`, `synchronous-outbound-call-per-record`,
`replica-apply-thread-saturation`).

So nothing was mistranscribed. The defect is that the figure was **quoted as current**.
The two runs are one commit apart and both succeeded:

| run | sha | `type` | `category` | `component` | strict | `type` misses |
|---|---|---|---|---|---|---|
| `36240660455` | `9932e766c` | 4/19 | 11/19 | 4/19 | 0/19 | **15** |
| `36242319547` | `567118aea` | **5/19** | 11/19 | 2/19 | 0/19 | **14** |

The `type` set is not merely reworded between them. Three rows moved:

| sample | in `9932e766c` | in `567118aea` |
|---|---|---|
| `resource-memory-leak-recommendation.type` | *not a miss* | `memory-leak -> unbounded-session-cache-growth` |
| `code-null-dereference-reporting.type` | `null-dereference -> null-pointer-dereference` | *not a miss* |
| `code-unhandled-exception-export.type` | `unhandled-exception -> csv-writer-typeerror` | *not a miss* |

And eight of the rows present in both carry **different answers**:

| sample | `9932e766c` | `567118aea` |
|---|---|---|
| `network-loss-payment-gateway` | `egress-packet-drop` | `egress-interface-packet-loss` |
| `runtime-container-crash-loop-media` | `native-ffmpeg-segfault` | `ffmpeg-native-segmentation-fault` |
| `middleware-redis-latency-cache` | `redis-command-thread-saturation` | `redis-single-thread-cpu-saturation` |
| `middleware-kafka-consumer-lag` | `synchronous-outbound-call-per-record` | `synchronous-outbound-call` |
| `code-slow-regex-api-gateway` | `regex-backtracking` | `catastrophic-regex-backtracking` |
| `dependency-upstream-5xx-pricing` | `upstream-dependency-outage` | `dependency-degradation` |
| `dependency-version-incompatibility-shipping` | `breaking-dependency-api-change` | `dependency-api-incompatibility` |
| `middleware-mysql-replica-lag-analytics` | `replica-apply-thread-saturation` | `replication-apply-bottleneck` |

Five answers are stable across both runs (`cpu-throttling`, `disk-space-exhaustion`,
`kubelet-eviction`, `stale-config-key`, `connection-pool-deadlock`). Eight of thirteen
shared rows changed. That is not sampling noise on a fixed question; it is a different
question or a different prompt, and the answers moved with it.

**The conclusion finding 91 needs is therefore the one its own data supported.** The
`type` reading that matters is `567118aea`'s, and the `type` figure is **14, not 15**.

### The separator changed between the two runs, and both are in the record

Re-deriving the rows exposed a second defect, and it is why the reconciliation could not
be done by re-reading the annotation naively.

`9932e766c` joins its rows with **a space**. `567118aea` joins them with **U+001F**.
That change is finding 70's fix and the reasoning in the workflow is sound: values
contain spaces, so a space join cannot be split unambiguously, and a whitespace split
manufactured rows reading `order-service -> order-service` -- two cases of the scorer
apparently marking a correct answer wrong.

Measured on `9932e766c`'s recorded body: splitting on spaces yields **56 tokens** where
the run published **38 rows**. The 18 extra tokens are the tails of multi-word values --
`network`, `path`, `node`, `egress`, `interface`, `native`, `binding`, `Redis`,
`service`, `database`, `client`, `pool`, `writer`, `rule`, `ConfigMap`, `provider`,
`applier`, `thread`.

Both separators still have to be readable, because the space-separated runs are already
published and immutable and they are the only evidence of what the model said before the
change. The space form is recovered by an anchor rule rather than by a split: a row
begins with `<slug>.<field>:` where `field` is one of four known names, so a token that
matches the anchor starts a row and a token that does not is a continuation. Rejoined on
that rule, all 38 rows come back with the multi-word values intact --
`cart-to-inventory network path`, `billing service database client pool`,
`order-service ConfigMap`.

**The rule is decidable but not sound**, and the difference is stated in the module
rather than glossed. It fails on an `actual` that itself begins `<slug>.<field>:`. The
recorded run contains no such answer, so the limit does not bite on the evidence in
hand -- but the limit is the reason the separator was changed, so it is asserted rather
than commented.

### The classifier's partition is not the disputed one, but the *count* was

Re-running the classifier over the correct run:

| run | misses | `form-variant` | `shares-token` | `different-mechanism` | over-specified |
|---|---|---|---|---|---|
| `567118aea` (correct) | **14** | **0** | **8** | **6** | 7/14 |
| `9932e766c` (what was quoted) | 15 | 0 | 9 | 6 | 11/15 |

Two things follow, and they point in opposite directions from finding 91's framing.

**`form-variant 0` holds on both runs.** No answer was rejected that the normalizer
should have accepted. The scorer is not the defect. This is the one claim all three
readings agree on, and it is the claim that matters most, because a form variant would
be a bug in this repository.

**`different-mechanism 6` also holds on both runs**, and it is not in tension with
"all 14 are the same mechanism at a different altitude" -- it is a disagreement about
what the three classes mean. The classifier's `different-mechanism` means *shares no
token with the expected slug*; `pod-kill -> kubelet-eviction` shares nothing lexically
and is still the same incident at a different altitude. So the classifier's 6 does not
contradict finding 91's adjudication, and finding 91's adjudication does not overrule
the classifier's 6. They answer different questions:

- **The classifier** answers *can the normalizer reach this?* -- a lexical question, and
  the one this repository can act on.
- **Finding 91's adjudication** answers *is this the same fault?* -- a semantic question,
  and the one a ground-truth change would need.

Reporting either as the other is the error. The classifier's output must not be read as
a count of genuinely different faults, and finding 91's adjudication must not be read as
a normalizer verdict.

### The assertion that was pinning the defect

Fixing the reading turned up a test that was holding the old figure in place. In
`type-miss-probe.test.ts`:

```
expect(longer).toBeGreaterThan(classified.length / 2);
```

This holds for `9932e766c` (11 of 15) and **fails for `567118aea`** (7 of 14 -- exactly
half). It looked like a property of the model and was a coincidence of the run it was
read from. The claim that survives both runs is the *direction*: over-specification
outnumbers under-specification. That is now what is asserted, and it is asserted **per
run**, so a future run that inverts the direction fails rather than being explained away.

The same test required the probe's source line to contain the literal `9932e766c`. That
assertion was pinning the hard-coded run. It now requires the source line to name the run
that was **asked for**, which is the property that keeps a figure quotable.

### What was built, and what it does not claim

`packages/core/src/fault/miss-detail.ts` reads the annotation body into rows. It is the
first thing in this repository that *reads* the channel rather than describing it, and
the gap it closes is not cosmetic: the only previous consumer carried a copy of one run's
contents instead of a reader, because the channel lives in CI and reading it needs a
token, a run id, and a check-run lookup.

`scripts/probe-type-misses.mjs` no longer hard-codes its input. It reads the recorded
annotation through `parseMissDetail`, takes the run as a parameter (`--run`, default the
most recent), and names the run in its output. The two recorded runs are both readable
and both asserted.

`packages/core/test/fixtures/miss-detail-567118aea.txt` and
`miss-detail-9932e766c.txt` are the verbatim annotation bodies, escapes intact -- one
U+001F-joined, one space-joined. They are the evidence, and they are in the repository so
the reading can be re-derived without a token.

**It does not claim the adjudication rule finding 91 asked for.** That rule decides "the
same fault at a different altitude" versus "a genuinely different fault", and this
finding does not build it -- it establishes what the rule must be applied to, which is
14 rows from `567118aea` and not 15 from `9932e766c`. Building the rule over the wrong
row set would have adjudicated a run nobody is discussing.

**It does not claim the granularity costs anything.** 14 `type` misses is a count of
misses. `strict` needs all three scored fields on one sample, and `category` at 11/19
caps `strict` independently of `type`. The per-sample cross-product is now computable
from the recorded rows; computing it is the next step, not this one.

### The process rule, applied and now encoded

Finding 91 stated the rule and applied it once, by hand. This finding is the second
application and it is enforced:

- **The reading is taken from the runs, not from the last document that mentioned a
  run.** The transcription was exact and the figure was still wrong, because exactness
  is relative to a subject and the subject had moved.
- **A figure carries its run.** `recordedTypeMisses(run)` takes the run as an argument;
  the probe prints the run it read; the tests assert per run. A figure with no run
  attached cannot be checked, and one with the wrong run attached is worse than none.

The three-line version, for the next round: **when two readings disagree, do not
reconcile them by argument. Find which one is reading the thing, and delete the other.**

---

## Finding 93 — the battery's own injections went blind, and one of them had been blind all along

Finding 92 removed `RECORDED_TYPE_MISSES` from the probe. Seven injections in
`scripts/injection/type-miss-probe.py` were anchored on that array's rows, and an
injection whose anchor has been deleted does not fail -- it reports **INERT**, which the
battery counts as a run and does not count as a pass. CI failed on `95cb64e64` at step
15 with exit 1 and no report; the local run reproduced it exactly: `7 caught, 0 survived,
7 inert`, every INERT line reading `anchor not found: "  ['network-loss-payment-gateway',
'network-loss', 'egress-packet-drop`.

That is the battery behaving correctly. It is the same failure this project has now seen
three times in a row -- a figure outliving the thing it described -- and this time the
instrument caught itself.

### The data moved, so the injections followed it

The recorded misses now live in `packages/core/test/fixtures/miss-detail-567118aea.txt`,
which is the annotation body of a named run. `run_probe` therefore takes two inputs --
the probe source and the fixture -- and restores both in a `finally`, because the report
has to be readable during a run that exits non-zero.

Each paired injection now **declares** which file its second edit lands in:

```python
target = 'fixture' if len(entry) < 6 else entry[5]
```

Written down rather than inferred. An inferred target would be a guess, and this
battery's entire history is of injections that silently tested nothing because an anchor
moved; inferring the file would let a pair land in the wrong one and still look applied.
Four of the seven retargeted injections turned out to be pure-data -- K, L, and the
already-data J -- and those carry `mutate = None`. `main` had to stop calling
`mutate(probe_text)` unconditionally, and had to stop running the `mutated == probe_text`
early-exit for them: that guard asks whether the *rule* changed, which is the wrong
question for an injection whose whole edit is in the data. It would have reported INERT
on a correct injection.

### The third verdict: BLIND

Retargeting K is where this finding became worth writing. K edits the recorded answers.
The first anchor renamed `cpu-saturation>cpu-throttling` to `cpu-load>cpu-throttling` --
two strings that share `cpu`. The second renamed `disk-full>disk-space-exhaustion` to
`disk>disk-exhaustion` -- two strings that share `disk`. In both cases the edit landed on
a row that was **already in the class the edit was meant to move it out of**. The
partition stayed `0/8/6`, the requirement went False, the exit code was non-zero, and the
battery printed:

```
CAUGHT   K. data: ...
         (form-variant 0, shares-token 8, different-mechanism 6, total 14, ...)
```

`CAUGHT` with an identical partition. The requirement had been falsified by something
other than the mechanism under test, and the run looked like coverage it did not have.
This is the same defect as INERT, arriving by a different route, and the battery had no
name for it.

It does now:

```python
elif (
    data is not None
    and not edits_source
    and result["counts"] == BASELINE["counts"]
    and result["total"] == BASELINE["total"]
):
    print(f"BLIND    {name}")
    blind += 1
```

Scoped to data-only injections, because that is where "the partition must move" is the
whole point of the edit. A *paired* injection like B changes the classifier and the data
together; its requirement is about the classifier, and the partition is under no
obligation to move. B failed the first run of this check for exactly that reason, and
failing a correct injection is how a check gets deleted, so the scope is part of the fix.

Verified load-bearing rather than asserted: with K re-anchored to a value that cannot move
its class (`kubelet-eviction` -> `kubelet-oom-eviction`, still sharing no token with
`pod-kill`), the battery reports `13 caught, 0 survived, 0 inert, 1 blind` and **exits 1**.

### K watches the class the row leaves

A within-partition edit can only be observed in the class the row **left**, because the
three classes are a partition over the 14 rows: a row can only leave a class by arriving
in another, and the arriving class grows by exactly the one that left. So a single class
count cannot see a between-class move *in general*, and the only way a single-count
requirement works is if it is the losing class. K's first shape watched the gaining class
and reported SURVIVED, correctly -- the injection was wrong, not the probe.

K is now anchored on a row genuinely in the different-mechanism class.
`pod-kill` / `kubelet-eviction` share no token, so this is the real thing:

```python
lambda d: rename(
    d,
    "runtime-pod-kill-user-profile.type:pod-kill>kubelet-eviction",
    "runtime-pod-kill-user-profile.type:pod-kill>kubelet-pod-eviction",
),
```

and the requirement is the losing count: `different-mechanism == 6`. The run reports
`0/9/5` and the count moved. Both wrong attempts are recorded at the anchor rather than
deleted, because "this anchor was chosen by reading the two strings instead of the
classifier's output for them" is the reusable lesson and it is invisible in a diff that
only shows the final anchor.

The six real different-mechanism rows are `memory-leak`, `pod-kill`, `container-crash`,
`kafka-consumer-lag`, `upstream-5xx` and `replica-lag`, read from the classifier and not
inferred. That list is in the comment because the next person to write an injection here
will need it and will otherwise make attempt 2 again.

### What changed

| | before | after |
|---|---|---|
| injections green | 7 caught / 7 inert | **14 caught / 0 survived / 0 inert / 0 blind** |
| verdicts | CAUGHT, SURVIVED, INERT | CAUGHT, SURVIVED, INERT, **BLIND** |
| `run_probe` inputs | probe source | probe source + annotation fixture |
| pair target | implicit (source) | declared per entry |
| CI step name | no survivors, no inert | no survivors, no inert, **no blind** |

### What this does not claim

**It does not claim the other batteries have no blind injections.** The BLIND check was
added to this battery because this battery is where the defect was found. Whether
`inject-m1-ceiling.mjs`'s battery or the gate battery can report BLIND depends on whether
their injections are anchored on data that can be edited without moving the observable;
that is unmeasured, and the honest reading is that the other batteries are now suspect in
a way they were not before.

**It does not claim K's property was previously covered.** K reported SURVIVED for one
anchor and CAUGHT-for-nothing for two others. The property "a row that becomes reachable
leaves the unreachable class" had no passing injection before this commit.

**It does not claim the retargeting was mechanical.** Four of the seven kept their edit
verbatim and gained a `data` slot. K was rewritten, because its original property turned
out to be unsatisfiable in the form it was stated. Two were already data-only. The count
of injections is unchanged at 14, which is a coincidence and not a result.

## Finding 94 — the adjudication rule is a measurement now, and it says nine of fourteen rather than fourteen

Finding 91 declined to claim a result it had every reason to believe. Its own words:

> The 39 misses are all same-mechanism by inspection, but inspection is mine, and the
> adjudication has to be a rule over the recorded rows rather than a reading of them.
> Until that rule exists, "the labels are too fine" is a hypothesis with strong support,
> not a measurement.

This finding is that rule, built and run against the fourteen `type` misses of run
`567118aea` (the corrected rows, not the transcript). It was written to confirm 91. It
falsified part of it, and the falsified part is the more useful result.

### A rule over two strings cannot answer a semantic question, and pretending otherwise would have manufactured the figure

The first design returned a boolean: reachable or not. That design is wrong before it is
written, because `different-fault` is a **decision** and `same-fault-different-altitude` is
**permission**. Two strings that share a morpheme *may* be the same fault at a different
altitude; they are not thereby *proved* to be. A binary verdict turns "these look related"
into "these are the same fault", which is exactly the step 91 refused to make by hand.

So the verdict has three values:

| verdict | means |
|---|---|
| `different-fault` | a **proof** of difference -- the two descriptions cannot be the same fault |
| `same-fault-different-altitude` | a **permission** -- a shared morpheme licenses relabelling, it does not require it |
| `undecided` | neither; the honest third value |

`undecided` is not a failure mode. It is the value that lets the rule report a limit
instead of a verdict, and on this dataset it is deliberately the value the rule **cannot**
assign to a real pair -- see below.

### Three implementations, two of which were wrong in instructive ways

**Suffix matching.** The first rule looked for a shared suffix, on the reasoning that
inflections share their ends. It reported `replica-lag` / `replication-apply-bottleneck` as
`different-fault`, because `replica` is a **prefix** of `replication`. The reasoning was
backwards: English inflects at the end but compounds and truncations do not.

**Naive prefix matching.** Switched to prefixes, floor of 3 characters. That reported
`config-mismatch` / `container-crash` as `same-fault-different-altitude`, on `con`. Three
characters is not a morpheme.

**Prefix that consumes a whole token or is at least five characters.** This is the rule
that survived:

```ts
function sharesMorpheme(a: string, b: string): string | null {
  const limit = Math.min(a.length, b.length);
  for (let length = limit; length >= 3; length -= 1) {
    const prefix = a.slice(0, length);
    if (!b.startsWith(prefix)) continue;
    const consumesAToken = length === a.length || length === b.length;
    if (consumesAToken || length >= 5) return prefix;
  }
  return null;
}
```

`config`/`container` share `con` and neither consumes a token, so they are different.
`replica`/`replication` is reached because `replica` **consumes a whole token** -- not
because of the length floor. `exhausted`/`exception` share `ex` and are different.

### The measurement: nine of fourteen, and the five are the interesting part

Run against the fourteen recorded rows, the rule reaches **nine** and leaves **five**:

```
adjudication (finding 94): same-altitude 9 | unreached 5 | undecided 0
```

The nine bases are, in output order, `cpu`, `disk`, `loss`, `redis`, `connection`,
`regex`, `config`, `incompatibility`, `replica` -- a list the test asserts exactly, so a
change to the classifier that moves any row shows up as a changed basis rather than as a
changed count.

The five the rule could not reach:

| expected | recorded | why no morpheme exists |
|---|---|---|
| `memory-leak` | `unbounded-session-cache-growth` | a leak *is* unbounded growth; different words for one mechanism |
| `pod-kill` | `kubelet-eviction` | eviction is the kubelet killing the pod; the mechanism is named from the other end |
| `container-crash` | `ffmpeg-native-segmentation-fault` | the crash is the SIGSEGV; the cause is a native fault |
| `kafka-consumer-lag` | `synchronous-outbound-call` | the lag is the *symptom*; the cause is the call blocking the poll loop |
| `upstream-5xx` | `dependency-degradation` | an upstream 5xx is how a degraded dependency presents |

Not one of these five shares **any substring at any length**. Their relationship is
semantic and no function over the two strings will find it. This is what finding 91 was
looking at when it said "same-mechanism by inspection" -- accurate, and only inspection
could see it.

**So the lexical half of 91's claim is 9 of 14, not 14 of 14.** The claim is not wrong; it
is narrower than it was stated, and the narrowness is now a number.

`unreached` is deliberately **not** `different-fault`. A pair the rule cannot reach has not
been proved different -- it has been proved unreachable *by this rule*. Reporting the five
as `different-fault` would have produced a clean, wrong figure; reporting them as
`undecided` would have hidden five genuine same-mechanism pairs behind a non-answer.
They get their own name and their own list.

### The cross-product cost, and the binding field is not the one 91 named

`strict` scoring needs every scored field on one sample, so the **lowest** per-field count
caps it. Finding 91 named `category` at 11/19. The general form says the minimum, and the
minimum is `component` at **2/19**:

| field | samples with a miss |
|---|---|
| `component` | 2 / 19 |
| `category` | 11 / 19 |
| `type` | 14 / 19 |

`crossProduct` computes this rather than restating it, and skips any field with
`total === 0` -- `description` is optional, and an unscored field's `0` hits would become
the binding constraint and cap `strict` at zero. That skip is two lines and it was the only
uncovered region in the module; it now has two tests rather than an ignore comment.

Samples blocked by a miss the rule calls `different-fault` are counted separately and
cross-checked against the `unreached` set, so a sample cannot be reported as blocked for a
reason the rule did not actually establish.

### The battery, and the two ways this injection set was wrong before it was right

Three new injections (M, N, O) target the rule module. They are new because the module is
new, and a module with no injection is a module whose behaviour is asserted rather than
tested. The run is now:

```
battery: 17 caught, 0 survived, 0 inert, 0 blind
source restored: identical to backup (probe, fixture, rule)
```

**M's anchor was a line range, and it ate the wrong thing.** The first version addressed
`src_lines(t, 171, 181)`. A later edit moved the function by one line, so the range spanned
the `Adjudication` type declaration instead, the build failed, and the mutation was left on
disk with nothing to restore it -- because the write and the build both ran *before* the
`try`. `packages/core/src/fault/miss-adjudication.ts` was corrupt across a whole run, and
the corruption surfaced as `SyntaxError: Unexpected token '|'` inside the probe. Fixed in
three places: the anchor is now by **name** (`body_of(text, "function sharesMorpheme(")`),
every mutation and the build moved **inside** the `try`, and the restore **recompiles**
rather than writing back a saved `dist` -- a saved snapshot taken at entry faithfully
restores a tree that was already corrupt. Each file is then verified byte-for-byte, and the
run prints which of the three inputs it checked. This is finding 93's lesson generalised
from data anchors to source anchors: an anchor that moves must fail **at the anchor**.

**N was wrong twice, in the two ways that matter.** Its first version set the length floor
to 3 and **SURVIVED**. That survival is a real finding and it is kept: on these fourteen
rows the floor is **never the deciding factor**. `replica`/`replication` is reached by
consuming a whole token, and the five unreached rows share no prefix at any length, so
`length >= 3` and `length >= 5` produce identical output on this dataset. An injection
that changes it cannot be caught. The floor's effect is demonstrated where it can be --
the two constructed tests -- and the floor's weakness is recorded at the anchor rather than
papered over. N's replacement targets the branch those constructed tests *would* notice.

Its second version then reported **INERT** with:

```
-- the paired source edit did not apply: no function declaration starts with: 'function sharesMorpheme('
```

The entry was written as a five-tuple, so `main` defaulted its target to `'source'`, and a
lambda anchored on a function that exists only in the **rule** was applied to the probe
script. The printed name said "rule" and the edit went to the script.

The default was **kept** deliberately. Making the target mandatory is a one-line change
that removes the mistake and also removes the evidence that the battery reports it; every
`'rule'` and `'fixture'` entry now states itself, and the misroute is recorded at the
anchor. Both of N's failures were invisible in the injection's name, which is the property
the INERT accounting exists to make loud.

### What this changes for the next round

The `category` direction is now the live question, and it is a **systematic altitude
mismatch**: every `middleware` expected value is recorded as `resource`, 4 of 4. That is a
consistent off-by-one-altitude rather than fourteen independent adjudications, and it is
the next thing to measure with this rule rather than by reading rows.

### What this does not claim

**It does not claim the five unreached rows are different faults.** They are unreached by a
morpheme rule. Four of the five have a defensible same-mechanism reading and the fifth
(`container-crash` / native segmentation fault) is at minimum the same *event* at a
different altitude. The rule's output is `unreached`, which is a statement about the rule.

**It does not claim the nine are proved same-altitude.** The verdict is a permission. The
rule licenses relabelling; whether the relabelling *should* happen is a labelling decision
this finding does not take.

**It does not claim the length floor is tested.** It is not, on this dataset, and N's
survival is the evidence. The two constructed tests exercise it; the recorded rows do not.

**It does not claim the other batteries are safe.** Unchanged from finding 93: the BLIND
check and the name-based anchor exist in the type-miss battery, and whether
`inject-m1-ceiling.mjs`'s battery can report BLIND or can misroute a target is unmeasured.

## Finding 95 — a config fault classified as middleware, because `flag` contains `lag`

Finding 94 closed by naming the next live question and it was specific: the `category`
direction showed "a **systematic altitude mismatch** -- every `middleware` expected value is
recorded as `resource`, 4 of 4." That claim was pursued, and it is false. It is 3 of 4. The
fourth `middleware` sample is not recorded as `resource` at all.

Chasing the disproof is what led to a production defect, and the defect was not in the
transcription. It was in `inferFaultCategory`.

### The defect, stated as an input and an output

```ts
inferFaultCategory('feature-flag-misconfiguration')  // ->  'middleware'
```

The slug names a configuration fault. It contains `flag`, which contains `lag`, and `lag` is
a `middleware` keyword. The middleware row is tested before the config row, so the earlier
row won. The mechanism could not tell that `lag` was a *part of* `flag` rather than a word in
its own right, because it was not asking about words:

```ts
if (keywords.some((k) => normalized.includes(k))) {   // the whole slug, as a letter sequence
```

`String.includes` answers "does this sequence of characters appear anywhere in that sequence
of characters". That is a different question from "does this slug use this word", and the gap
between the two questions is the entire defect.

### The blast radius is not one row

The obvious reading is that this is a bug about `lag` and `flag`. It is not, and measuring it
is what establishes that. **32 of 40 adversarial English words produce a wrong category**:

| word | matches | wrong category | word | matches | wrong category |
| --- | --- | --- | --- | --- | --- |
| `planet` | `net` | network | `debugger` | `bug` | code |
| `magnet` | `net` | network | `ladybug` | `bug` | code |
| `cabinet` | `net` | network | `dropdown` | `drop` | network |
| `tenet` | `net` | network | `backdrop` | `drop` | network |
| `room` | `oom` | resource | `envelope` | `env` | config |
| `zoom` | `oom` | resource | `environment` | `env` | config |
| `bloom` | `oom` | resource | `adbc` | `db` | middleware |
| `member` | `mem` | resource | `dbnull` | `db` | middleware |
| `remember` | `mem` | resource | `skill` | `kill` | runtime |
| `aggregation` | `lag` | middleware | `flagship` | `lag` | middleware |

Any English word containing `net`, `oom`, `mem`, `lag`, `db`, `env`, `bug`, `drop` or `kill`
is classified, and most of the words that contain those trigrams have nothing to do with the
category they trigger.

The damage is not local, because `category` is not a display field. It selects the row of the
validity gate's mechanism table that decides **which telemetry would evidence a fault**, and
it is exported into the benchmark artefacts as `scenario_class`, `fault_taxonomy` and
`fault_category`. A misread category is a case verified against the wrong expectation.

### Four match forms, and why each one is there

The fix asks about words. A keyword has to sit on a word boundary, and four forms are
accepted -- each because a real fault type needs it, not because it seemed reasonable:

| form | example | why it cannot be dropped |
| --- | --- | --- |
| exact | `kafka-lag` → `lag` | the base case |
| plural | `dependencies` → `dependency` | `dependency`+`s`, and `dependency` is 10 characters |
| prefix | `eviction` → `evict` | `evict`+`ion`; `eviction` is not the plural of `evict` |
| negation infix | `misconfiguration` → `config` | `config` is **not** a prefix of `misconfiguration` |

The negation form is the one that had to be discovered rather than assumed. The first attempt
at the fix reasoned that `config` is a prefix of `misconfiguration` and therefore needed no
special case. It is not: `mis` precedes it. `startsWith` cannot see an infix, so the form
exists as an explicit clause over a closed list of prefixes (`mis`, `non`, `un`).

**`de` is deliberately not in that list**, even though it is a real English prefix, because
`de` + `bug` is `debugger` -- a false positive -- and no fault type in the corpus needs it. A
prefix list that is closed is only useful if every member earns its place.

### Both length floors are load-bearing, and the collisions are concrete

```ts
const MIN_PREFIX_LENGTH = 5;
const MIN_PLURAL_LENGTH = 4;
```

**The 5-character prefix floor** stops `mem`⊂`member`, `mem`⊂`remember`, `mem`⊂`memento`,
`oom`⊂`room`, `oom`⊂`zoom`, `oom`⊂`bloom`, and `net`⊂`planet`/`magnet`/`cabinet`/`tenet`. Five
is long enough for every collision above and short enough that `evict` still reaches
`eviction` and `config` still reaches `configuration`.

**The 4-character plural floor** stops `db`+`s` from matching an unrelated `dbs` while leaving
`dependencies` reachable from `dependency`.

There is a limit worth stating plainly: `memory` is six characters, so the prefix form still
reaches `memoryless` and classifies it `resource`. That is **correct** -- `memoryless-pool` is
a memory fault -- and it is the one adversarial survivor, which is why the fix reduced false
positives from 32 to **1** rather than to 0. A classifier that named no category for
`memoryless-pool` would be worse, not cleaner.

### Restoring the word boundary exposed a second defect, in the table's order

With the matcher fixed, `inferFaultCategory` agreed with the golden dataset on 16 of 19 types.
The two residual misses are separate defects, and neither was caused by the substring bug:

- **`regex-catastrophic-backtracking` → `unknown`.** The `code` row had no keyword this type
  could reach. `unknown` is the honest answer for a type the table has never seen and a false
  answer for a type it has, and it is not harmless: `expectedSignalsFor` reads `unknown` as
  **unverifiable**, so such a case is exempted from mechanistic checking rather than failing
  it. Fixed by adding `regex` and `backtracking` to the `code` row.
- **`redis-latency` → `network`.** This one is the interesting one. `latency` is a `network`
  keyword and the network row was tested before middleware, so the *mechanism* outranked the
  *subject*. The substring matcher had been returning `middleware` for this input by accident
  -- the slug contains `redis` -- so removing the accident revealed that the ordering had never
  been deliberate.

The ordering question is decided by the dataset, not by preference. `redis-latency` is
`middleware` and `network-delay` is `network`: the same mechanism, different categories. Keyword
presence alone cannot separate them, so the row holding the subjects is tested first. The
`middleware` row moved above `network`, and the same ordering that buries the symptom also
keeps `kafka-consumer-lag` and `replica-lag` out of the network row.

The final measurement: **19 of 19 golden types, 0 of 22 adversarial false positives.**

### The second defect: a docstring asserting a guard that did not exist

`packages/core/src/gates/validity.ts` claimed, of the mechanism table:

> The table is total over `FAULT_CATEGORIES` and both directions are asserted in the test
> suite, so adding a category to the IR without deciding what it moves is a red suite rather
> than a silent gap.

There was no such assertion. What existed, in `validity.test.ts`, was a cross-check between
`FAULT_EXPECTATIONS` and `FAULT_CATEGORIES` -- a **different pair**, proving the table is total
over the IR union. Nothing connected the table to the taxonomy in `fault/collector.ts`. The two
could disagree about which category a fault type belongs to and every suite in the repository
would stay green while a case built by the collector was verified against a row chosen for a
different category.

This is the class of defect finding 94 warned about from the other end: a comment describing a
property is not evidence the property holds. It is **fixed by making the claim true** rather
than by weakening the docstring. `validity.test.ts` now reads the golden dataset, runs every
type the dataset builds cases from through `inferFaultCategory`, and requires the answers to
land inside the table -- with a `unknown` check, because `unknown` is a legal answer and a dead
end for the gate.

### Nothing observed the classifier, which is why this shipped

The `category` defect could have shipped **any** answer. `probe-type-misses.mjs` reads a
recorded annotation's `type` field and never calls `inferFaultCategory`. The repository's
whole battery apparatus was pointed at the *transcription* and none of it was pointed at the
*classifier*.

So the observation point is new: `scripts/probe-category-inference.mjs` runs the classifier
across the 19 golden types -- read from `samples.json` rather than retyped, so the probe cannot
drift from the data -- plus 22 adversarial words each paired with the keyword it wrongly matched.
The adversarial table is the part that has teeth. The golden types establish that the classifier
still works; the adversarial rows establish that it works *for the right reason*.

Four injections were added to the type-miss battery against that probe. They were not written
blind, and three of them landed wrong before they landed right:

- **P** restores `normalized.includes(keyword)`, the exact defect. Its first version replaced the
  only call site of `keywordMatchesToken`, which left the function unreferenced and failed the
  build with `TS6133` -- caught, but caught at compile rather than at the requirement. The
  requirement was never evaluated, so the run said nothing about the adversarial table. Keeping
  the call behind `false &&` compiles and measures the defect. Measured: **21 of 22 adversarial
  false positives**.
- **Q** drops `MIN_PREFIX_LENGTH` to 0, and **R** empties the negation loop, and **S** moves the
  network row back above middleware. R and Q hit the same `TS6133` trap as P and needed the same
  treatment, which is now recorded at each anchor rather than rediscovered.
- **S** is the one that pins the *ordering* rather than the matcher, and it is caught by the
  golden agreement count because `redis-latency` is one of the 19.

P's requirement is deliberately on the adversarial count and not the golden count: the substring
matcher still gets 18 of 19 golden types right, so the golden figure **cannot separate the two
implementations**. An injection that only moved `goldenAgreements` would be measuring the part of
the classifier that was never broken.

Battery result: **21 caught, 0 survived, 0 inert, 0 blind**, exit 0, and now all **four** inputs
restored byte-for-byte -- the restore previously named three, and `collector.ts` would have been
a mutated source tree invisible to the check. The classifier baseline prints in the battery
header next to the transcription baseline, so both instruments are visible in the same run:

```
baseline: 14 misses -- form-variant 0, shares-token 8, different-mechanism 6, over-specified 7
classifier: 19 golden types -- 19 agree, 0 miss; 22 adversarial words -- 0 false positives
```

### Finding 51 predicted this, and it still stands

Finding 51 already rejected keyword-to-category inference as unsound in principle:

> `parseFaultSpec` infers a category from a fault type, and the inference is a keyword match, so
> `io-hang` is classified `resource` only because `io` is in the resource row -- a fault that
> jams a disk queue and a fault that burns CPU are not the same experiment.

**This fix does not answer that.** It makes the inference fire where a **word** is present
instead of where a **letter sequence** is, which is a strict improvement and not a justification.
The principled answer remains the one finding 51 implies: a fault type that does not name its
category should be required to state it. What this fix buys is that the inference is now wrong in
a way that can be seen and argued with, rather than wrong in a way that depends on spelling.

### Coverage

`packages/core/src/fault/collector.ts`: **100 / 100 / 100 / 100**. Every one of the four match
forms, both length floors, and the multi-token clause is exercised, so the floors asserted in
prose above are also asserted by the coverage measurement rather than only by the argument.
Package total: **99.96 / 99.94 / 100 / 99.96**. Repository suite: **2776 passed in 99 files**,
14 of them new. Lint reports `ALL PROPERTIES HOLD`; core and CLI typecheck clean.

### What this does not claim

**It does not claim the classifier is now correct.** It claims the classifier no longer names a
category because of a letter sequence, and that this is measurable. Finding 51's objection is
untouched.

**It does not claim 19 of 19 means the taxonomy is right.** The dataset and the classified table
now agree; that is agreement between two artefacts this repository maintains, not evidence that
either matches reality.

**It does not claim the eight recorded `category` misses are explained.** Those are misses in a
model transcript, and how a model labels a fault is a different question from how this classifier
does. Finding 94's instrument is what answers that question, and it has not yet been pointed at
these eight.

**It does not claim `score/official.ts` is clean.** `keywordHit` there is the same substring
shape in AIOps2025 scoring, and it still needs its own reading.

**It does not claim the other batteries are safe.** Unchanged from findings 93 and 94: whether
`inject-m1-ceiling.mjs`'s battery can report BLIND or misroute a target remains unmeasured.

---

## Finding 96 — the eight `category` misses follow a sentence that names a different category

Finding 95 closed by naming its own successor:

> Finding 94's instrument is what answers that question, and it has not yet been pointed at these
> eight.

This is that pointing. It produced a **new, measured finding**, and the finding is not the one I
expected to write.

### What was read

The eight recorded `category` misses were read from both annotations (`567118aea`, `9932e766c`)
and checked against `golden-master/fault-extraction/samples.json`:

| Sample id | Expected | Answered | Counter-evidence phrase in the text |
|---|---|---|---|
| `resource-memory-leak-recommendation` | resource | code | *(none)* |
| `runtime-pod-kill-user-profile` | runtime | resource | `well under the limit` |
| `runtime-container-crash-loop-media` | runtime | dependency | *(none)* |
| `middleware-redis-latency-cache` | middleware | resource | `not the bottleneck` |
| `middleware-kafka-consumer-lag` | middleware | code | `unchanged` |
| `middleware-database-connection-pool` | middleware | resource | `no long-running` |
| `code-slow-regex-api-gateway` | code | config | *(none)* |
| `middleware-mysql-replica-lag-analytics` | middleware | resource | `are current` |

Three properties were verified before the pattern was named. The eight misses are **identical in
both recorded runs**, so this is not run noise. **Every sample id resolves** in the golden dataset,
so nothing was read from a stale artefact. And the annotation's `expected.category` **matches the
dataset's own category 8 of 8**, so the ground truth is not two disagreeing sources.

### The finding

**Every missed incident contains a sentence naming a different category as the thing that is *not*
happening, and the model answers with that category.** `well under the limit` says the resource is
not the resource problem; the model answers `resource`. `not the bottleneck` says the middleware is
not the bottleneck; the model answers `resource`. The distractor is a *negation of a category*, and
the model reads the category and drops the negation.

Measured on the 19-sample golden dataset with a closed list of 10 phrases:

| Figure | Value |
|---|---|
| Samples carrying the phrase | 6 |
| Category misses reached by the phrase | **5 of 8** |
| **Precision** | **5/6** |
| **Recall** | **5/8** |

The confusion matrix, stated plainly, because it is what says the phrase carries signal:

```
has phrase & missed   5
has phrase & correct  1
no phrase & missed    3
no phrase & correct  10
```

### The confound, excluded by measurement rather than by argument

The obvious objection is that a longer incident text is harder, and longer texts are more likely to
contain any given phrase. That was tested rather than dismissed:

| Control | Result |
|---|---|
| Mean length with the phrase | 365 chars |
| Mean length without | 330 chars |
| Gap | 35 chars |
| Misses caught by a 400-char length threshold | **1 of 8** |

Text length is **not** the signal. A length threshold tuned to this very dataset reaches one of the
eight; the phrase reaches five. The gap in means is small enough that a length-based predictor
would have to be fitted to the eight to do anything, which is the definition of overfitting to the
outcome.

### It is recorded as a three-valued reading, for finding 94's reason

`assessCounterEvidence` returns `counter-evidence-present`, `counter-evidence-absent`, or
`not-assessable`. The third value exists for the same reason finding 94 introduced `undecided`: a
**missing input must not be reported as a clean reading**. Empty and whitespace-only text returns
`not-assessable`, and `counterEvidenceReport` counts such a sample in `gradedTotal` and on neither
side of the miss accounting -- it is not evidence either way, and counting it on one side would move
a figure on the strength of an input that was never read.

The phrase list is **closed**, 10 entries, and closed rather than a regex for the same reason
`NEGATION_PREFIXES` is closed: a pattern loose enough to catch prose catches prose.

### A correction to finding 94

Finding 94 recorded that the four `middleware` misses each answered `resource`. That is **false at
three of four**: `middleware-kafka-consumer-lag` was answered **`code`**. The correction is recorded
here because a finding that overstates its own regularity is how the next finding starts from a
wrong premise.

### Three injection lessons

The battery now carries 24 injections (A–V), all caught, **0 survived / 0 inert / 0 blind**. The
three new ones cost real mistakes before they worked, and each mistake is a distinct failure class:

**T — the compile-time trap, again.** The first version of the mutation renamed
`COUNTER_EVIDENCE_PHRASES` to `_UNUSED`. `tsc` rejected it three ways at once (`TS6133` on the
constant, the inferred parameter type it fed, and the `index.ts` re-export). It was **caught, but at
compile, with the requirement never evaluated** -- the same shape as finding 95's P/Q/R. The fix
empties the array in place, so the mutation is a legal program that the battery has to reason about.

**U — an unobservable branch cannot be defended.** Folding the third value into `absent` moved
**nothing**, because the baseline `notAssessable` was **0** on real data. The mutation would have
SURVIVED. It is now observable because the **probe itself** exercises the empty and whitespace
inputs, giving the baseline `notAssessable: 2`. This is finding 95's lesson N restated: a mutation
whose figure is never the deciding one tests the battery, not the code.

**V — requiring the wrong field.** The first requirement read `withPhrase` (6, unchanged) and would
have **SURVIVED**. Measured, the mutation moves `gradedTotal` 19 → 8. The requirement now names
`gradedTotal`. Same defect class as N, caught by measuring rather than by reading.

### A name collision the battery reported badly

`cat()` -- the classifier probe added in finding 95 -- and the probe's own `category` block, added
in this finding, both claimed the key `category`. The merge **silently overwrote** the block, and the
battery then failed with `KeyError: 'withPhrase'` rather than naming the collision. The classifier
merge is renamed `classifier`, with a comment at the merge site saying why. The battery should have
said "two writers, one key"; it said "missing key", and the difference cost a debugging cycle.

### Verification

`packages/core/src/fault/miss-distractor.ts`: **100 / 100 / 100 / 100** -- statements, branches,
functions, lines. Two branches reached only by the divide-by-zero guards (`withPhrase === 0`,
`missedTotal === 0`) were **uncovered at 90.5% branch** until tests were written for an empty
denominator; a `NaN` in a report compares false against every threshold a gate might use, so these
guards needed tests that assert a `NaN` is not produced, not merely that the code runs. Package
total: **99.96 / 99.94 / 100 / 99.96**. Repository suite: **2809 passed in 100 files**, 33 of them
new. Battery: **24 caught, 0 survived, 0 inert, 0 blind**, all five inputs restored byte-for-byte.
Lint: `ALL PROPERTIES HOLD`. Core and CLI typecheck clean. All injection scripts `py_compile` clean.

### What this does not claim

**It does not claim the phrase causes the miss.** The phrase is a **correlate** with measured
precision and recall, and the readings are named per row rather than asserted in bulk. The report
prints the phrase it actually matched -- for `middleware-redis-latency-cache` that is
`not the bottleneck`, not the `is normal` I had read by hand. The instrument names its own basis
rather than my reading of it.

**It does not claim the predictor is complete.** It reaches **5 of 8**. A report that rounded this
to "all eight" would be exactly the over-claim finding 91 refused to make by hand, and the
three unreached misses are printed by name rather than summarised away.

**It does not claim the dataset is fair to the model.** Whether writing a counter-evidence sentence
into the incident text and then grading a category is a well-posed task is a **labelling question**,
and it is not answered here. If it is unfair, the fix belongs in the dataset, not in the model.

**It does not claim anything about `inferFaultCategory`.** That was finding 95. This finding is about
a model transcript against a dataset, and the two must not be conflated: the classifier and the
model can both be wrong, and here they are wrong for unrelated reasons.

**`score/official.ts:900` is verified as a different case.** `keywordHit` there is the same substring
shape, but it is **correct use**: it is a *scoring* heuristic measuring lexical overlap between two
strings, and it makes no category claim, so a substring match is the intended semantics rather than a
defect. Checked in full at finding 95 and re-checked here.

**It does not claim the other batteries are safe.** Unchanged from findings 93, 94, and 95: whether
`inject-m1-ceiling.mjs`'s battery can report BLIND or misroute a target remains unmeasured.

---

## Finding 97 — the batteries wrote to files they never verified

### The open question, finally answered

Findings 93, 94, 95 and 96 each closed with the same unmeasured sentence:

> whether other batteries can report BLIND or misroute a target remains unmeasured.

v1.38 pointed at it. The answer is **yes, and worse than "misroute"**: a battery
**silently overwrites a file it does not restore**, and reports a clean run afterwards.

### The defect

`scripts/injection/m1-ceiling-probe.py`, before this finding:

```python
original = probe_text if target == PROBE else golden_text   # line 247
...
target.write_text(mutated)                                  # line 261
```

Any target that is not `PROBE` reads the **golden fixture's text** as its source, and the mutated
result is written to `target`. Only `PROBE` and `GOLDEN` are used today, so the two cases that
exist are exactly the two the expression handles. **It was never wrong in a run, and it is wrong
for every target added later.**

### The measurement

An eleventh injection targeting `docs/audit.md` was added to prove it rather than argue it:

```
CAUGHT   Z. misroute probe: target a third file, whose text is not the fixture
battery: 11 caught, 0 survived, 0 inert
files written and restored: 2
sources restored: identical to backup
```

**Exit 0. Green. And `docs/audit.md` -- 8098 lines of audit -- had been replaced by the golden
fixture JSON and truncated to 183 lines.** Restored with `git checkout -- docs/audit.md` and
verified back at 8098.

### Why it still said "restored"

```python
restored = PROBE.read_text() == probe_text and GOLDEN.read_text() == golden_text
```

The check names **the files it knows about**, not **the files it wrote**. That is the same defect
finding 92 fixed in `type-miss-probe.py` by naming four inputs -- fixed locally, and never
generalised. Five batteries share the shape:

| Battery | Verified | Written | Status |
|---|---|---|---|
| `injection/m1-ceiling-probe.py` | `PROBE`, `GOLDEN` | via `target` | **confirmed exploitable** |
| `injection/scorer-stability-probe.py` | `DIST` | `DIST` | latent -- one target |
| `inject-stability.mjs` | `SRC` | `SRC` | latent -- one target |
| `inject-m1-ceiling-tests.mjs` | `TEST`, `PROBE`, `GOLDEN` | via `applied` | latent |
| `inject-component-rule.mjs` | per-entry `inj.file` | via `inj.file` | latent, closest to correct |

Only the first is proven to have destroyed anything. The rest are reported as sharing the
**shape**, and that word is used deliberately: a check that is right because the current target
list is short is not a check.

### A second defect, found while fixing the first

The first fix routed every write through a recorder and derived the restore from it:

```python
restored = all(path.read_text() == original for path, original in _WRITTEN.items())
```

**`all(...)` over an empty mapping is `True`.** Measured by disabling the recorder:

```
battery: 10 caught, 1 survived, 0 inert
files written and restored: 0
sources restored: identical to backup
```

A battery that recorded nothing reported a clean restore **having verified nothing**. A vacuous
pass is worse than the hard-coded pair it replaced: the pair at least verified two real files.

This was caught by injection K, whose requirement reads the recorded set rather than a computed
figure -- and **K SURVIVED** on the sabotaged recorder, which is how the hole was found at all.
The guard is now explicit:

```python
if not _WRITTEN:
    return False
```

Re-measured with the recorder still disabled: `sources restored: DIFFERS -- inspect before
committing`, **exit 1**. Healthy run: 11 caught, `files written and restored: 2`, exit 0.

**The lesson is not "a recorder is better than a list".** It is that **the fix introduced the same
class of defect it removed** -- a check that passes for a reason other than the property it
asserts -- and the only thing that caught it was an injection written to falsify the fix itself.

### The fix

The restored set is derived from the writes, in all five batteries. Two properties are asserted:

1. **A target's own text is read from that path.** `original = target.read_text()`. No path maps
   implicitly onto a fixture, so an entry whose mutation cannot match its own file fails loudly as
   INERT rather than being silently substituted.
2. **The restore covers what was written, and refuses the empty set.** A recorder keeps prior
   bytes at the first write; the check reads the recorded set back and requires it to be non-empty.

Each battery now prints `files written and restored: N` beside its verdict, so the *scope* of the
restore is visible in the output rather than implied.

A new test file, `packages/core/test/injection-target-routing.test.ts` (7 tests), holds all five
batteries to both rules and **enumerates the batteries from the directory**, so a battery added
later fails the suite until it is brought under them. The two exempt batteries
(`gate-tests-battery.py`, `type-miss-probe.py`) are named with the reason, because an omission has
to be a decision rather than a default.

### What was verified, and how

Every battery was re-run after the fix, and every one reports `0 survived / 0 inert` with a
non-empty derived restore:

| Battery | Result |
|---|---|
| `injection/m1-ceiling-probe.py` | 11 caught, 0 survived, 0 inert; 2 files written and restored |
| `injection/scorer-stability-probe.py` | 4 caught, 1 guarded upstream, 0 survived, 0 inert; 1 file |
| `inject-stability.mjs` | 4 caught, 0 survived, 0 inert; 1 file |
| `inject-m1-ceiling-tests.mjs` | passes; set derived from `ORIGINALS` |
| `inject-component-rule.mjs` | 8 caught, 0 survived, 0 inert; 2 files |

`git status` after all five run shows exactly the five battery files and the new test -- no
residue. The fix was validated by re-running the third-target probe: `docs/audit.md` survives at
8098 lines with its own header, and the battery reports `files written and restored: 3`.

### Verification

Repository suite: **2816 passed in 101 files**, 7 of them new. Package coverage:
**99.96 / 99.94 / 100 / 99.96**. Lint: `ALL PROPERTIES HOLD`. Core and CLI typecheck clean. All
injection scripts `py_compile` clean.

### What this does not claim

**It does not claim the other four batteries destroyed anything.** Only the m1 battery's selector
is proven exploitable. The rest share the shape and are now fixed as a class, which is a claim
about the code and not about their history.

**It does not claim the batteries are now audited.** This fixes the *restore*. Whether a battery's
requirement can be satisfied by a mutation it does not follow is finding 95's lesson N and remains
a per-injection property -- and this very finding added one such lesson by shipping, briefly, a
mutation that survived the fix.

**It does not claim a derived restore is sufficient.** It removes one way for a check to be blind.
A recorder can still be bypassed by a write that does not go through it, which is why the
`write_recorded` routing is itself asserted and why the direct `.write_text(` count is checked in
`injection-write-discipline.test.ts`.

**It does not claim the third-target injection is the only unmeasured one.** It is the one that was
run. The rule now makes the *next* target safe by construction, which is a different and weaker
statement than "all paths are tested".

## Finding 98 — the misses were answered with a category the text does not carry

### The gap this closes

Finding 96 measured that the `category` misses follow a sentence naming a different
category as the thing that is *not* happening. It closed with an explicit gap:

> **It does not claim the dataset is fair to the model.** Whether writing a
> counter-evidence sentence into the incident text and then grading a category is a
> **well-posed task** is a labelling question, and it is not answered here.

That is a question about the dataset, not about the model, and this finding answers it from
the dataset side **without modifying the dataset**.

### The standard the dataset states for itself

`golden-master/fault-extraction/samples.json` carries its own authoring criteria in `provenance`:

> **note**: "Each incidentText is written to sound like a real support ticket or post-mortem
> while naming exactly one fault, so the expected record is **decidable from the text alone**."
>
> **authoringRule**: "The expected.type must be **derivable from the incident text** by a
> careful human reader. A sample whose answer needs context the text does not carry is a bad
> sample, not a hard one."

Those are the criteria this finding measures against, and a test asserts the quoted text is
what the dataset actually says, so the finding cannot drift from its own standard.

### The measurement, and the claim it falsified

The reading was written to support a claim I had already stated in the plan:

> "In five of five, the category the model answered is named in the text for the sole purpose
> of being ruled out."

**Measured, that is false.** The five misses finding 96's predictor reaches split **four to one**:

| Missed sample | Expected | Answered | The answered category in the text | Verdict |
|---|---|---|---|---|
| `middleware-database-connection-pool` | middleware | resource | **no term at all** | `absent` |
| `middleware-redis-latency-cache` | middleware | resource | **no term** -- the denial is about the *client pool* | `absent` |
| `middleware-mysql-replica-lag-analytics` | middleware | resource | **no term** -- the text says the primary `is healthy` | `absent` |
| `runtime-pod-kill-user-profile` | runtime | resource | `memory`, under `well under the limit` | `denied-only` |
| `middleware-kafka-consumer-lag` | middleware | code | **no term** -- the denial is about *broker throughput* | `absent` |

**In four of five the answered category has no term in the text whatsoever.** In the fifth the
only term sits inside a denial. **In none of the five does the text assert it.**

The corrected statement is stronger than the one it replaced: the model is not choosing among
hypotheses the text raises and inverting the one it rules out. It is producing a category the
text does not support at all. The 5-of-5 reading survives only as the superseded draft, because
the distance between it and the measurement *is* the finding.

Over the whole corpus the same reading is more emphatic still. Reading each of the eight
`category` misses against the category the model **answered**:

```
denial inventory (finding 98): 8 misses read against the category the model answered --
  7 absent, 1 denied-only, 8 unsupported in total
  absent          resource    -> answered code
  denied-only     runtime     -> answered resource   (via 'healthy', 'well under')
  absent          runtime     -> answered dependency
  absent          middleware  -> answered resource
  absent          middleware  -> answered code
  absent          middleware  -> answered resource
  absent          code        -> answered config
  absent          middleware  -> answered resource
```

**Eight of eight.** Every recorded `category` miss was answered with a category the incident
text does not carry as an assertion. The predictor that reaches 5 of 8 is a *weaker* instrument
than the one that reaches 8 of 8, and finding 96's block is retained beside this one precisely
because the two figures disagreeing is the evidence that they measure different things.

**The eight are not the five plus three more of the same kind.** The three the phrase predictor
does not reach -- `resource-memory-leak-recommendation` (→ `code`),
`runtime-container-crash-loop-media` (→ `dependency`), `code-slow-regex-api-gateway` (→ `config`)
-- read `absent` too, and they read `absent` *because* the text carries no term of the answered
category at all. The phrase predictor misses them for that reason: it looks for a sentence that
names a category in order to deny it, and there is no such sentence, because there is no term to
deny. So the phrase predictor is a **special case** of this reading, not a rival to it -- and the
three it misses are the cases where the absence is total rather than partial. That relation was
not visible before this reading existed, and it is the reason the two blocks are kept side by side
rather than the weaker one being retired.

### The control, which is what keeps the reading from being trivial

If a denial were enough to produce `denied-only`, the reading would flag everything and mean
nothing. The dataset carries exactly one sample that both contains a denial and was answered
correctly -- `resource-cpu-saturation-checkout`:

> "…the pod sat pinned at its 500m limit. **The load generator was unchanged** from the previous
> week."

Its denial denies **the load generator** -- an instrument, not a taxonomy category. It reads
`also-asserted`, and the probe prints it first and separately:

```
control resource-cpu-saturation-checkout: expected resource, read also-asserted
  (markers: none) -- a denial of a non-category does not read as denied-only
```

A denial of a *category* invites that category as an answer. A denial of a *non-category* does not.

### The reading is clause-scoped, and that is load-bearing

The five reached misses discuss the denied category in one clause and the real cause in another.
A document-level test -- "does the category appear outside any denial, anywhere" -- would call
every one of them `also-asserted` and find nothing. So the reading splits on `[.!?;]` and then on
`, `, and attributes a verdict per clause: `denied-only` only when **every** clause carrying a
term carries it inside a denial.

The three-valued verdict is finding 94's rule applied to a fourth instrument: `absent` and
`denied-only` are different observations, and collapsing them would let "the text never mentions
resource" and "the text says resource is fine" produce one figure. **That collapse is exactly the
mutation that would have made the superseded 5-of-5 claim pass**, which is why the values are
separate rather than a boolean.

### What was built

| File | Change |
|---|---|
| `packages/core/src/fault/denial-inventory.ts` | new: three-valued reading of whether a category is present, denied, or absent, plus the corpus partition |
| `packages/core/test/fault/denial-inventory.test.ts` | new: 31 tests, including the correction as an assertion |
| `scripts/probe-type-misses.mjs` | new `denial` block, beside the existing `category` block |
| `scripts/probe-denial-inventory.mjs` | new standalone reading, and `probe:denial-inventory` |
| `scripts/injection/type-miss-probe.py` | 3 new injections (W/X/Y) and a fourth in-package target |
| `packages/core/src/index.ts` | registers `DENIAL_MARKERS`, `assessCategoryDenial`, `buildDenialInventory` |
| `packages/core/test/export-surface-enumerated.test.ts` | enumerates the new module |

`DENIAL_MARKERS` is a closed list of ten entries and is deliberately **not** finding 96's phrase
list. That list detects counter-evidence in the text; this one detects the grammatical shape of a
negation. Conflating them would break the control, which carries `unchanged` -- a finding-96
phrase -- while denying a non-category.

`CATEGORY_TERMS` is duplicated from `fault/collector.ts` on purpose, and the duplication is the
point: the module must be able to *disagree* with the classifier. Importing the table would make
"the vocabulary says this word belongs to this category" and "the reading found this word here"
the same act, which is finding 95's lesson. A test asserts the two tables agree on every shared
category, so a change to one without the other fails rather than drifts.

### The batteries

Three injections land in the new module, all caught, with `0 survived / 0 inert / 0 blind`:

| | Mutation | Figure it must move |
|---|---|---|
| **W** | force every term-carrying clause to count as a denial | `counts.alsoAsserted` (14) |
| **X** | return `denied-only` where the reading returns `absent` | `counts.absent` (4) |
| **Y** | restrict the corpus to its long samples | `graded` (19) |

Each requirement reads a baseline captured from the unmutated run rather than a literal, so a
dataset edit moves the requirement with the data. X is the mutation that would restore the
superseded 5-of-5 claim as code, which is why the values are separate rather than folded.

The probe block is separately checked by four subprocess tests in the module's own test file,
which **run `scripts/probe-type-misses.mjs` and cross-check its figures against the module**. The
wiring is a separate claim from the reading: a block can call the right function on the right
texts and still print them against the wrong rows, which is finding 92's defect. Two falsification
checks were run by hand -- reversing the column the block reads (2 of 31 tests fail),
disconnecting the block from the payload (4 of 31 fail), and overlapping the reached/unreached
partition (1 of 31 fails) -- so the tests discriminate rather than agree.

Y's first draft filtered on a `missed` field that `InventorySample` does not carry, and the build
failed with TS2339: caught, but caught at compile with the requirement never evaluated. That is
the fourth occurrence of this trap in this battery and it is recorded here as a pattern: **a
mutation that cannot compile is a mutation that measured nothing.**

### Verification

Repository suite: **2850 passed in 102 files**, 5 of them new. `src/fault` coverage:
**100 / 100 / 100 / 100**; the new module alone is 77/77 lines, 77/77 statements, 3/3 functions,
32/32 branches. Lint: `ALL PROPERTIES HOLD`. Core and CLI typecheck clean. Injection battery:
**27 caught, 0 survived, 0 inert, 0 blind**, restore identical to backup across probe, fixture and
all four in-package targets.

### What this does not claim

**It does not claim the dataset is wrong.** It reports a criterion. Whether the criterion should
change is a separate decision with its own regression surface, and it is deliberately not taken
here. No sample text was edited.

**It does not claim the model would be right otherwise.** The answers are wrong. The finding is
that in eight of eight cases the text does not carry the answered category as an assertion, so
"the model chose a category the text supports" is not available as an explanation.

**It does not claim the reading is the only instrument that reaches these misses.** It is not a
*different* reading of the same five samples: it reaches **all eight**, including the three
finding 96's phrase predictor does not -- and all three read `absent`:

```
  absent        resource-memory-leak-recommendation   answered code
  absent        runtime-container-crash-loop-media    answered dependency
  absent        code-slow-regex-api-gateway           answered config
```

Those three carry no counter-evidence phrase, which is why the phrase predictor misses them; the
denial inventory does not need a phrase, because **the absence of a term needs nothing to detect
but the absence**. So the two instruments are not nested -- the phrase predictor is a *special
case* of the pattern, and the three it misses are the cases where the absence is total. That is a
correction to the framing this finding opened with: the claim is not about the five reached
misses, it is about all eight. An earlier draft of this paragraph said the three unreached misses
"are not claimed here", which was true of finding 96's instrument and false of this one.

**It does not claim every category miss has this shape for the same reason.** Four are `absent`
with no phrase at all, one is `denied-only`, and three are `absent` where finding 96's predictor
sees nothing. The shared property is the absence of an assertion, not a shared mechanism.

**It does not claim causation.** With n=19 this is a structural observation recorded with both
denominators. That the authoring and the failures coincide is measured; that one caused the other
is not.

**It was wrong once, and the correction is the finding.** The claim was "named only to deny it,
five of five". The measurement is four absent and one denied-only. A finding that records only its
conclusion and not the claim it replaced is a finding that cannot be re-checked when the question
changes, which is the reason the superseded reading is quoted above in full.

## Finding 99 — the misses named a component that does not carry the category they answered

> **Refuted by finding 100.** The measurement below is reproduced exactly, and every component
> it names is the component the model named. What is false is the reading's force: run against
> the dataset's **own** components -- right by construction -- the same reading fails 18 of 19,
> so `7 of 7` distinguishes the model from a correct answerer by nothing. `CATEGORY_TERMS` is the
> classifier's *slug* table and a `component` is a service name, so the reading asks a question
> neither side was written to answer.
>
> The finding is retained in full, and not rewritten, because the distance between what it
> claimed and what its own control shows is the finding. This is the second time in two findings
> that a claim made before measurement was corrected by measuring it -- the first being finding
> 98's own 5-of-5 draft. See finding 100.

### Why finding 98 was not yet a mechanism

Finding 98 measured that the answered category has no term in the **incident text**, in 8 of 8
`category` misses. That is a statement about the dataset's *input*, and on its own it admits two
explanations that produce the identical figure:

1. the model failed to read the incident, so it reached for a category the text does not raise;
2. the model read the incident correctly and mislabelled the category anyway.

A model that named the right mechanism and then emitted an unsupported category would look
exactly like a model that understood nothing. Finding 98 could not tell them apart, because it
only ever read one side of the exchange.

### The field that separates them

`component` is the model's **own** output. The `category` and the `component` come from the same
call over the same text. If the category were read off the mechanism the model itself identified,
the answered category's vocabulary would appear in the component it named.

Measured over the seven recorded `category` misses that carry a `component` row:

| sample | answered | component the model named | answered category's terms in it |
|---|---|---|---|
| `resource-memory-leak-recommendation` | code | "recommendation service session cache" | none |
| `runtime-pod-kill-user-profile` | resource | "kubelet" | none |
| `runtime-container-crash-loop-media` | dependency | "native ffmpeg binding" | none |
| `middleware-redis-latency-cache` | resource | "session Redis" | none |
| `middleware-database-connection-pool` | resource | "billing service connection pool" | none |
| `code-slow-regex-api-gateway` | config | "WAF rule" | none |
| `middleware-mysql-replica-lag-analytics` | resource | "replica applier thread" | none |

**7 of 7.**

> **And this is where the reading stops carrying the claim, which finding 100 measured.** `7 of 7`
> is a true count and a false instrument: the same reading fails 18 of the dataset's 19 correct
> components. The table above is reproducible and every cell is accurate; what does not follow is
> that the figure separates the model from a correct answerer.

And the components are *right*: `kubelet` is the correct component for `pod-kill`; `session Redis`
is the correct component for `redis-latency`; `WAF rule` is the correct component for
`regex-catastrophic-backtracking`. The model identifies the mechanism and then emits a category
that is not derivable from it.

> **That last sentence is the claim finding 100 refutes.** "Not derivable from it" is something the
> vocabulary cannot establish, because it is not derivable for most correct components either. What
> stands is the observation: the component and the category are not related by the vocabulary of
> the category.

**So the failure is in the relation between the two fields, not in reading the incident.** That
is a different claim from finding 98's, it points at a different fix, and it is the one finding
98's measurement could not reach.

### The denominator, and the row that is excluded rather than passed

`middleware-kafka-consumer-lag` is the eighth miss and it carries **no `component` row** -- because
the model answered the component *correctly* there. It named the mechanism right and still got the
category wrong.

That row is excluded from the denominator, not counted as a pass, and this is asserted rather than
trusted:

```
component agreement (finding 99): 7/7 misses named a component that carries no term of the
  category they answered -- 0 agree, 1 not assessable
  ...
Excluded, not passed: middleware-kafka-consumer-lag -- no component row was recorded because
  the component was answered *correctly* there. Counting it as an eighth pass would be the
  partial-join defect finding 92 records.
```

It is also the **counter-case**, and it is why this reading cannot be inverted. A category is
evidently not always derivable from a component: this row has a correct component and a wrong
category. So "the component determines the category" is false, and the finding is narrower -- that
in every case where both were recorded, they disagree.

### The extraction, and the new way to be wrong it created

`component-agreement.ts` needed the same category vocabulary `denial-inventory.ts` used, so the
table moved to `category-terms.ts`. The extraction is not a tidy-up: two readings each carrying
their own copy could disagree about what a word *means*, and that disagreement would present as a
difference between the **readings** rather than between their tables. One table, two readers.

The duplication with `fault/collector.ts` is deliberately retained -- the readings must be able to
disagree with the classifier (finding 95) -- and a test now asserts that every term the reading
table contains actually routes to that category through `inferFaultCategory`. A term that routed
elsewhere would make the reading and the classifier disagree about the **word** rather than about
the **answer**.

### The three injections, and the two defects they found before they shipped

All three were **written wrong first and SURVIVED**, and the diagnosis of each is the content:

| | Mutation | First requirement | Why it survived | Fixed by |
|---|---|---|---|---|
| **Z** | force `disagrees` on both return paths | `inventory.agrees` | the baseline is already **0**, so the branch the mutation removes was never exercised | exercising the `agrees` branch synthetically |
| **AA** | fold the blank component into `disagrees` | `inventory.notAssessable` | `buildAgreementInventory` filters `component === null` *before* calling the reading, so the reading's own blank branch is unreachable through the probe | exercising it synthetically |
| **AB** | empty the `middleware` row | `graded` in both blocks | `graded` did not move; `denial.counts.absent` moved **4 → 7** | requiring the field the mutation moves |

Z and AA are the same failure the battery has recorded twice before (finding 95's N, finding 96's
U): **a figure at its floor is a figure no mutation can move.** The first version of the probe's
`agreement` block could not distinguish support from its absence, because the recorded run contains
no supporting component and the blank case was filtered out upstream.

The repair is to probe both branches explicitly, reported apart from the inventory so the
denominator keeps describing the annotation:

```
synthetic: {"agrees": 1, "disagrees": 0, "notAssessable": 1}
  (empty component) -> not-assessable | (component supports it) -> agrees
```

AB is the third occurrence of the wrong-field defect (V, then N) and it is the only injection in
the battery whose requirement reads **two** blocks -- because it is the only mutation that edits a
file two blocks depend on, and a requirement reading one of them would report a partial effect as
the whole one.

Final battery: **30 caught, 0 survived, 0 inert, 0 blind**, restore identical across probe, fixture
and all **six** in-package targets.

### What was built

| File | Change |
|---|---|
| `packages/core/src/fault/component-agreement.ts` | new: read whether an answer's category is supported by the component that answer named |
| `packages/core/src/fault/category-terms.ts` | new: the vocabulary two readings now share |
| `packages/core/test/fault/component-agreement.test.ts` | new: 22 tests |
| `scripts/probe-type-misses.mjs` | `agreement` block, with the synthetic branch exercise |
| `scripts/injection/type-miss-probe.py` | 3 injections (Z/AA/AB), two new in-package targets, a fifth baseline |
| `packages/core/src/index.ts` | registers the reading and the shared table |
| `packages/core/test/export-surface-enumerated.test.ts` | enumerates both new modules |

### Verification

Repository suite: **2876 passed in 103 files**, against 2850 in 102 before this iteration. The
**26** new tests are 20 in the new reading's own file plus 6 added to the enumerated-surface test;
that package declared 20, and the number is stated here from the measured delta rather than from
the file count, because the two disagree and the file count is the one that would have been wrong.
`src/fault` coverage:
**100 / 100 / 100 / 100**; `component-agreement.ts` alone is 46/46 lines, 46/46 statements,
2/2 functions, 19/19 branches. Lint: `ALL PROPERTIES HOLD`. Core and CLI typecheck clean;
injection script `py_compile` clean. Battery: 30 caught, 0 survived, 0 inert, 0 blind.

### What this does not claim

**It does not claim the model misnames components.** In all seven the component is the mechanism
the incident describes. It is the category that is unsupported.

**It does not claim `component` is a reliable key.** It is a free-text field with no vocabulary, so
the reading is a term search and can only ever report `disagrees` -- "no term found" -- and never
`mislabels`, because there is no table for a component to violate. The bound is stated in the
module.

**It does not claim a category is derivable from a component.** `middleware-kafka-consumer-lag` has
a correct component and a wrong category. The reading cannot be inverted into "the component
determines the category", and that row is why.

**It does not claim causation.** Seven rows. The co-occurrence is measured; that one field caused
the other is not.

**And it does not claim finding 98 was wrong.** Finding 98 measured the text; this measures the
answer. They are two objects, and the second is the one that rules out "the model simply could not
read the incident" as the explanation.

---

## Finding 100 — finding 99 had no baseline, and with one it does not separate anything

Finding 99 closed with a falsification test proposed for it:

> finding 99 narrows the question to the two fields' relation, but it says nothing about
> *which* field the model derives from what. The decidable next step is a probe over the
> **correct** samples -- for all 11 that are both component- and category-correct, does the
> component carry a term of the category? If yes there, the 7-of-7 becomes a discriminating
> statistic rather than a co-occurrence; if the same 7-of-7 rate shows up on correct answers
> too, finding 99 is measuring nothing and I should say so.

**It is the second.** The reading fails almost every component known to be correct.

### The measurement

The agreement reading was applied to the dataset's **own** `expected.component` values, which
are right by construction:

```
expected components supporting their category:  1 of 19
predicted components supporting their category: 0 of 7
```

Eighteen of nineteen correct components carry no term of the category they are correctly
labelled with. A reading that fails 18 of 19 components that are correct cannot have
distinguished anything when it failed the seven. **Finding 99's `7 of 7` is an artifact of the
vocabulary, not a measurement of the model.**

The one that agrees is `session-cache` against `middleware`, because it contains `cache`. That
single coincidence is the whole of the 1.

### Why, and this is the durable part

`CATEGORY_TERMS` is the **classifier's** table. It maps a fault *slug* to category terms, and it
was built so `inferFaultCategory` can read slugs like `middleware-redis-latency-cache`. A
`component` is a **service name** -- `checkout-api`, `payment-gateway`, `billing-service` -- or,
when the model reaches past the service, an infrastructure noun like `kubelet` or `WAF rule`.
Neither is a slug. The table was never a vocabulary for components, and reading components with
it asks a question neither side was written to answer.

The reading itself is not wrong and is not repaired here. It answers "does this component carry
this category's vocabulary", and it answers correctly. What was wrong was the **inference from
its output to the model's behaviour**, which is why the deliverable is a control rather than a
fix.

### The defence, measured rather than argued

The natural rescue is that finding 99 measured the *answered* category, and the model answered
the wrong category, so of course the component does not support it. Read against the **expected**
category instead:

| sample | expected | component the model named | supports? |
|---|---|---|---|
| `resource-memory-leak-recommendation` | resource | `recommendation service session cache` | no |
| `runtime-pod-kill-user-profile` | runtime | `kubelet` | no |
| `runtime-container-crash-loop-media` | runtime | `native ffmpeg binding` | no |
| `middleware-redis-latency-cache` | middleware | `session Redis` | **yes, `redis`** |
| `middleware-database-connection-pool` | middleware | `billing service connection pool` | no |
| `code-slow-regex-api-gateway` | code | `WAF rule` | no |
| `middleware-mysql-replica-lag-analytics` | middleware | `replica applier thread` | no |

**1 of 7.** Against an expected-side baseline of 1 of 19. The rescue does not hold either.

### The column finding 99 overtook

Read against the **expected** category, finding 98 had already established these same components
are absent from the incident text 8 of 8. That is the measured column, and it is the one that
carries. Finding 99 described the answered-category column as "the mechanism 98 could not reach";
measured, the answered-category column is the one that says nothing.

### The comparison trap, which the first version of this shipped with

The control's first `separates` was `predicted.supportShare < expected.supportShare`. That is
`0.0 < 0.0526`, which is `true` -- a 1-of-19 baseline means the expected side's true rate is
indistinguishable from zero, so `0/7 < 1/19` is the difference between two estimates of zero and
not a separation. The probe printed `separates: true` directly above the sentence "the reading
does NOT separate them", both of which were written by me in the same file, and the contradiction
was found by reading the output rather than by a test.

This is the floor trap this audit has now recorded four times -- finding 95's N, finding 96's U,
finding 99's Z and AA -- arriving in a new form. In each of those the floor was a count no
mutation could move; here the floor is a *rate* that makes a comparison true for an arithmetic
reason rather than a statistical one. The repair is `separates = expected.supportShare >
BASELINE_FLOOR`, with the floor stated rather than buried, and injection AE pins the verdict so
the arithmetic cannot return.

### A real defect in the module, found by an injection

Injection AC -- "count every component as supporting" -- **SURVIVED**, and the survival is what
found it: `buildBaselineInventory` destructured `terms` and counted `terms.length > 0`, so the
verdict `readBaselineSupport` returned was read, put on the row, and then thrown away. The corpus
figure was a function of a **proxy** for the verdict rather than the verdict, so a change to the
support rule that did not also change the term list was invisible. Fixed to count
`reading.supports`, with a test asserting the coupling over both sides of the corpus, and AC then
caught.

This is the wrong-field family again (V, N, AB), and it is the first instance where the wrong
field was inside the module under test rather than in the injection.

### A latent harness defect that this finding exposed

`subprocess.run(..., capture_output=True)` truncates `probe-type-misses.mjs`'s output **in this
environment, non-deterministically**. Measured on the same command, read to EOF through a pipe:
16384 bytes once, 8192 on the next two runs. The probe's true output, redirected to a file, is a
stable 16396. `python3` and `bash` pass 20000 bytes through the identical pipe, so this is not a
sandbox cap; it is specific to how this node process's stdout is drained.

The battery ran for several findings without noticing, because the truncated payload stayed valid
JSON up to the cut until the `baseline` block pushed the output past the boundary. It then
surfaced as `JSONDecodeError: Unterminated string`, which names the symptom and not the cause --
the failure mode this audit keeps recording. `_run_json_probe` now routes stdout through a
temporary file, which is deterministic across repeated runs, and reports the byte count so a
genuine truncation stays distinguishable from a probe that correctly refused to report. Raising
`AssertionError` from that path also aborted the battery on injection N, which *intends* to
publish nothing; it raises `ValueError` so the caller's existing handling applies.

### What was built

| File | Change |
|---|---|
| `packages/core/src/fault/agreement-baseline.ts` | new: read the same agreement reading against components that are right by construction, and state whether the contrast is load-bearing |
| `packages/core/test/fault/agreement-baseline.test.ts` | new: 31 tests, including the defence and the arithmetic trap |
| `scripts/probe-agreement-baseline.mjs` | new: both sides, the contrast, and the floor, with a `dist` guard |
| `scripts/probe-type-misses.mjs` | `baseline` block, printed beside the claim it refutes |
| `scripts/injection/type-miss-probe.py` | 3 injections (AC/AD/AE), a seventh in-package target, a sixth baseline, a per-injection blind anchor, and the file-routed probe invocation |
| `packages/core/src/index.ts` | registers the control |
| `packages/core/test/export-surface-enumerated.test.ts` | enumerates the new module |

### Verification

Repository suite: **2910 passed in 104 files**, against 2876 in 103 before this iteration. `src/fault`
coverage: **100 / 100 / 100 / 100**, `agreement-baseline.ts` included. Lint: `ALL PROPERTIES HOLD`.
Core and CLI typecheck clean; injection script `py_compile` clean. Battery: **33 caught, 0 survived,
0 inert, 0 blind**, restore identical across all **nine** in-package targets.

### What this does not claim

**It does not claim finding 99's observations were false.** Every component it named is the
component the model named, and every one of those does lack the answered category's terms. What is
false is that the figure distinguishes the model from a correct answerer.

**It does not claim the vocabulary is wrong.** `CATEGORY_TERMS` does what it was built for. It was
applied to an object it does not describe.

**It does not claim a component *should* name its category.** Most correct components do not, and
that is not a defect in them -- it is the reason the reading cannot be used this way at all.

**It does not propose a replacement reading.** A reading of the component that would separate the
two sides is not in hand, and inventing one on this corpus is the move that produced finding 99.

**And it does not retract finding 98.** Finding 98 measured the text against the expected
category, is independent of this vocabulary, and stands. The two findings that fell to their own
measurement were 99 and, before it, the 5-of-5 claim inside 98's own draft.

---

## Finding 101 — the battery reported the version banner and threw away the guard's message

Found by reading the m1-ceiling battery's output rather than by a test, minutes after finishing
finding 100 — the same way finding 100's arithmetic contradiction was found, and for the same
reason: the output was on screen and it did not say what it claimed to say.

The battery line for injection J read:

```
CAUGHT   J. probe: let the two halves disagree, so the partition guard has to fire
         (the probe failed to run: Node.js v22.13.1)
```

J exists so that the recoverability-partition guard throws. The line reports a **node crash**, and
the version banner is all of it that survives. The crash path in `m1-ceiling-probe.py` was:

```python
if crashed is not None:
    # A probe that cannot run under the mutation counts as caught, but it
    # is reported apart from the requirement checks so a mutation which
    # breaks the script for an unrelated reason stays visible.
    print(f"CAUGHT   {name}")
    print(f"         (the probe failed to run: {crashed[-1] if crashed else 'no output'})")
```

`crashed[-1]` is the last non-empty line of stderr. For every node failure that is the version
banner, always. The comment immediately above says the separation exists so an unrelated break
"stays visible" — and the line under it guaranteed that it did not.

### What the message actually was

Reproducing J by hand, from the repository root:

```
Error: recoverability partition does not cover the dataset: 18 + 0 != 19
    at main (file:///.../scripts/probe-m1-ceiling.mjs:120:11)
```

**The guard fires, and always did.** J is a real injection and its subject works. My first reading
of that line — that J was a false green masking a parse error — was wrong, and the measuring run is
what corrected it. The finding is not that the injection is broken. The finding is that the report
made a working guard indistinguishable from a broken script:

| what happened | what the battery printed |
|---|---|
| the partition guard threw its own message | `(the probe failed to run: Node.js v22.13.1)` |
| the probe died on a syntax error | `(the probe failed to run: Node.js v22.13.1)` |

Those two rows are the same string. A battery whose crash path cannot tell a guard from a typo is a
battery that cannot report the thing it was built to report — and it is the third instance of the
*reported-field* family this campaign has produced, after finding 95's N and finding 100's own
`separates`, with the difference that here the discarded field was a human-readable message rather
than a number.

### The repair, and the part that makes it a check

`crash_reason(lines)` returns the first line beginning with `Error:`, falling back to the first
non-blank line so a non-node failure stays readable rather than collapsing to its last line. The
call site now prints `crash_reason(crashed)`.

That alone would have been a display fix. What makes it a check is the seventh slot:

```python
INJECTIONS: list[tuple[str, Path, Callable[[str], str], Callable[[dict], bool], str, str | None]] = [...]
```

J declares `"recoverability partition does not cover the dataset"`, and the runner fails the entry
as `SURVIVED` when a crash arrives without that text:

```python
reason = crash_reason(crashed)
if crash_contains is not None and crash_contains not in " ".join(crashed):
    print(f"SURVIVED {name}")
    print(f"         -- the probe crashed, but not with {crash_contains!r}: {reason}")
    survived += 1
    continue
```

Without the slot, `CAUGHT` on the crash path means only "the probe died", and an injection written
to make a guard fire is satisfied by a probe that dies for any reason. With it, J now fails if the
guard stops firing — whatever replaces it, including a typo. The other ten entries declare `None`
and are unaffected: their requirement reads a report, and they do not crash.

### Verification

The battery prints J's real message:

```
CAUGHT   J. probe: let the two halves disagree, so the partition guard has to fire
         (the probe failed to run: Error: recoverability partition does not cover the dataset: 18 + 0 != 19)
```

Battery `11 caught, 0 survived, 0 inert`, `files written and restored: 2`,
`sources restored: identical to backup`, exit 0 — unchanged, because the change is to what is
displayed and to what the entry requires, not to what the injections do.

Two tests added to `packages/core/test/injection-target-routing.test.ts`, 7 → 9 in that file:
one asserts the last line is no longer what is printed and that `crash_reason` prefers `Error:`;
one asserts the `crash_contains` wire and J's declaration. Both were confirmed falsifiable by
reverting the extraction by hand: the first goes red with
`(the probe failed to run: Node.js v22.13.1)` visible in its own failure output — the defect,
quoted by the test that rejects it — and the file restores byte-identical.

Writing the second test cost one iteration. Its first assertion was `not.toMatch(/crashed\[-1\]/)`,
which failed against correct code because my own comment above the new call site quoted the old
expression while explaining why it was wrong. Rewording the comment was the fix; loosening the
assertion would have been the wrong one, since the pattern is exactly what must not return. This is
the same trade as finding 100's `separates`: keep the strict form, fix the thing that trips it.

Suite 2912 passed in 104 files (was 2910/104); `src/fault` 100 / 100 / 100 / 100; package
99.96 / 99.94 / 100 / 99.96; lint `ALL PROPERTIES HOLD`; `py_compile` clean; CI 2/2 green on the
preceding factory sha `a20ff54ad`.

### What this does not establish

It does not establish that the crash path is exercised anywhere else — because there is nowhere
else for it to be. Swept rather than assumed: `[-1]` appears in no other battery
(`scorer-stability-probe.py`, `gate-tests-battery.py`, `type-miss-probe.py`, and the three
`inject-*.mjs` files), and `gate-tests-battery.py` has no `CalledProcessError` handler at all,
only `TimeoutExpired`, so the idiom had no second home to hide in. The only surviving occurrence of
the pattern in the tree is the docstring of `crash_reason` quoting what it replaced.

The sweep was prompted by finding 100's own history: the assertion that a defect is isolated is
itself a claim, and on this codebase the unmeasured version of that claim has been wrong more than
once. Here it held.

---

## Finding 102 — the labelling question has an answer, and it answers a different question than it was asked

Finding 101 closed with a decision deferred:

> The next step is not another reading of the component field; it is a decision about whether the
> fix belongs in the dataset's authoring rule or in the model's prompt, and that decision needs the
> labelling question answered first.

This finding answers the labelling question, and then measures whether the answer can be used.

### The question, asked precisely

`buildFaultExtractionPrompt` (`importer.ts:129-147`) gives the model three instructions. For `type`
it gives `FAULT_TYPE_SHAPE_RULE`. For `component` it gives `FAULT_COMPONENT_RULE`. For `category` it
gives only a closed vocabulary and a case rule:

```
`category` is matched case-insensitively against that list; any other value is rejected.
```

It never connects `type` to `category`. So the question is not what the prompt says — that is
readable and it says nothing — but **what rule the dataset was actually labelled under**. If the
labels obey a derivation from `type`, then that derivation is the dataset's authoring rule, and the
prompt's silence is a gap between the prompt and the data. If they do not, there is no rule for the
prompt to state.

### The answer, from the data

```
inferFaultCategory(expected.type) === expected.category       19 of 19
```

No residue, no near-miss, no case to argue. The dataset derives its own `category` from its own
`type`, and the derivation is total: all 19 labelled types land on a real category, with 0 falling
through to `unknown`.

So the derivation is the authoring rule. That is what the data says, and it is stated by the
data's own contents rather than by anyone's reading of the prompt.

### And then the measurement that governs it

A checked invariant produces figures, and figures get quoted. So the same module measures whether
the reading that reports the invariant can separate **the model** from **a correct answerer** —
which is the property a finding needs and which conformance does not have.

Two alternative readings were built, each one a defect this codebase has actually shipped:

| Reading | What it does | Differs on |
|---|---|---|
| `substring` | finding 95's matcher: keywords as letter sequences anywhere in the slug | `feature-flag-misconfiguration` (via `lag` ⊂ `flag`) |
| `row-shadowing` | ignores the table's ordering rule, reading subject and mechanism in table order | `redis-latency`, `feature-flag-misconfiguration` |

They differ on **different** types, so the union is the union and not the maximum:

```
differ: 2 of 19 (0.1053)   floor: 0.2   separates: false
```

**The reading cannot separate anyone.** It agrees with the label on 17 of 19 expected types, so a
miss count drawn from it is the difference between two estimates of nothing. This is finding 100's
result in a new place: there the reading was of the `component` field with a baseline of 1 of 19;
here it is the `category` field with a baseline of 2 of 19. Same floor, same verdict.

### The second measurement, which the first one needed

The one figure that would look like a result is the miss count: does the model's *own* answered
`type` derive the *own* answered category? Under the loose criterion — "is the answered category
derivable from *some* slug in the sample" — the answer is **8 of 8**, and that reading is vacuous,
because every legal vocabulary member is derivable from some slug.

The honest criterion reads the model's own two fields against each other, and it is **0 of 8** in
the current run. But that number is not stable either. Measured across both recorded runs:

```
per run: 567118aea = 0/8    9932e766c = 1/7
consistent in EVERY run: 0 of 8
consistent in AT LEAST ONE run: 1 of 8  (middleware-mysql-replica-lag-analytics)
```

The one consistent miss is consistent in `9932e766c` only, because that run answered
`replica-apply-thread-saturation` (which carries `saturation`, a `resource` term) where the current
run answers `replication-apply-bottleneck` (which carries nothing the table knows). **The figure is
a property of the run, not of the model**, and an earlier draft of this finding would have called it
a finding on the strength of one run.

### The excess check, and why its zero is a measurement

The rule is also read against 21 adversarial words extracted from `fault.test.ts`. It classifies
**0 of 21**. A zero from a reading that can only return zero is not a measurement — which is why the
same words are read a second time through the pre-finding-95 substring matcher, which classifies
**21 of 21**. The word list does provoke the defect the matcher was built to remove; the matcher is
what suppresses it.

### What was built

| File | Change |
|---|---|
| `packages/core/src/fault/category-derivation.ts` | new: the conformance check, the derivability and excess readings, the honest miss criterion, the run-stability reading, and the discriminating-power verdict printed first |
| `packages/core/test/fault/category-derivation.test.ts` | new: 72 tests in twelve groups, including the branch-reachability controls the battery's survivals forced |
| `scripts/probe-category-derivation.mjs` | new: verdict printed above every figure it governs, with the floor and the both-ways arithmetic |
| `scripts/probe-type-misses.mjs` | `derivation` block, plus its `controls` section; the block reads **every** recorded run, which no other block does |
| `scripts/injection/type-miss-probe.py` | 6 injections (AF–AK), an eighth in-package target, a seventh baseline, a `derivation` blind anchor |
| `packages/core/src/index.ts` | registers 2 constants, 6 functions, 10 types |
| `packages/core/test/export-surface-enumerated.test.ts` | enumerates the new module |

### The defect this iteration found in itself, twice

The first battery run reported **AF, AG and AI SURVIVED**, and the honest reading of that is not
"the module is defective" — it is "the entries were bad". Each mutation targeted a branch this
corpus cannot reach:

* nothing disagrees, so `assessDatasetConformance`'s disagreement branch is never entered;
* every type derives a real category, so `assessDerivability`'s `unknown` branch is never entered;
* `separates` is legitimately `false`, so hardcoding it false changes nothing.

A mutation to a branch no input reaches is a mutation the harness cannot observe, and reporting it
as SURVIVED is the harness working. The repair is the one finding 100 applied to the `baseline`
block and finding 96 applied to `notAssessable`: **construct the input that reaches the branch, and
report it.** A `controls` section now probes one sample that disagrees by construction, one type the
table does not know (paired with one it does, or the control is inert one level down), and one
reading whose alternatives disagree about everything — which is what makes a hardcoded `separates:
false` observable. With both ends pinned, the only implementation that passes is one whose verdict
is computed.

The second defect was AJ: its first version replaced `differ` with a `number[]` and the build
refused it (`TS2322`). A mutation the compiler rejects measures nothing, so it was rewritten to the
same defect in a well-typed shape — concatenating the per-reading lists instead of unioning them,
so the type both readings disagree about appears twice.

Both are recorded because both are the same lesson finding 97–101 keep re-teaching: **a battery's
survivals are a claim about the battery before they are a claim about the code.**

### Verification

Repository suite: **2814 passed in 102 files**, against 2790 in 102 before this iteration. `src/fault`
coverage: **100 / 100 / 100 / 100**, `category-derivation.ts` included — reached by adding the tests
the coverage report asked for rather than by an exemption, and the two branch gaps it named
(lines 164, 375) and the four line gaps (226-227) are now exercised. Lint: `ALL PROPERTIES HOLD`.
Core and CLI typecheck clean; injection script `py_compile` clean. Battery: **39 caught, 0 survived,
0 inert, 0 blind**, restore identical across all **ten** in-package targets.

### What this does not establish

**It does not establish that the prompt should state the derivation.** That is the decision finding
101 deferred, and this finding informs it rather than taking it. What it establishes is that the
decision has a subject: a rule exists, it is total, and it lives in the data rather than in the
prompt.

**It does not establish that the rule is right.** The dataset and the classifier were written by the
same hand, so conformance is self-consistency and a shared mistake would conform perfectly. The
module says so in its own `honesty` list rather than leaving a reader to infer it.

**It does not revive the miss count.** 0 of 8 is printed with the floor and the run-dependence
beside it, in the module, in the probe, and in the block — in the same style as finding 100's
contrast. A figure printed without its qualifier is the failure finding 99 recorded.

**And it does not retract finding 98.** That finding read the incident text and stands. This module
reads the labelled fields and says nothing about whether the text carries what the labels claim.

## Finding 103 — the module that checks a rule shipped a defect it could not check, and the check it needed had a subject

Finding 102 closed with the labelling question answered and a product decision deferred. This
finding is what happened when that module was read carefully enough to extend it, and it produced
three things: a structural defect in the module itself, a rule the dataset follows but never
stated, and the measurement that decides whether the deferred decision is available.

### The defect: a declaration, published twice

`category-derivation.ts` declared `export interface MissReading` **twice** — at line 261 and again
at line 326, roughly 65 lines apart. Typescript **merges** duplicate interface declarations, so:

* the build passed;
* `tsc --noEmit` passed;
* every test in the 72-test suite that imported `MissReading` passed;
* and the duplicate reached the **published** declaration file. `dist/fault/category-derivation.d.ts`
  carried `export interface MissReading` on line 155 and again on line 219.

Parsing both blocks, stripping comments and comparing them field by field: **identical**. So
**nothing observable changed, and no behavioural test was possible**. The defect was *structural*.
Any test written as though it had caught a behavioural bug would be claiming a stronger result than
the evidence supports, and that is stated here rather than dressed up.

**Why duplicate declarations warrant a reading at all**, given that this one changed nothing: the
consequence is asymmetric. When two merged declarations are identical, nothing observable changes.
When they **differ**, the merge silently produces the **union** of their fields — a source reader
sees one shape, a type reader another, and neither is wrong on its own terms. So the only signature
covering both cases is the **source text**, and the module now reads its own.

`duplicateTypeDeclarations(source)` is `export`ed and answers with the names declared more than
once. It deliberately uses the same form-recognition as `export-surface-enumerated.test.ts` — both
name `interface` and `type` after `export` and both anchor at the start of a line — so the two
checks agree about what a declaration is, and a test asserts the agreement rather than leaving it as
a comment.

### The defect found while fixing that one: a docstring naming a field that does not exist

`grep -n "stableAcrossRuns"` found exactly one occurrence, and it was in a docstring. The field it
named was never declared. The real carrier is `MissStability` / `report.missStability`, and the
interface's actual fields are `graded`, `consistent`, `consistentIds`, `rows`, `reachableLoosely`,
`noneConsistent`.

This is the **same class of defect as the duplicate**: invisible to the compiler, and wrong in a
direction a reader cannot check without opening the type. It is worth recording that the second
defect was found by grepping *after* the first — a defect hunt that found one rarely stops at one.

### The rule the dataset follows and never stated

Finding 102 established that the dataset's `category` is derivable from its `type`. That rule
appeared **nowhere**: not in `provenance`, not in the extraction prompt, not in a test. It was a
fact about the file that only the classifier's source recorded.

The deferred product decision is whether the **prompt** should state the rule, and this finding does
not take it. What it takes is the half that is a defect rather than a decision: a file that follows
a rule it does not state is a file whose rule the next person to add a sample will break, silently,
because nothing checks it.

So `golden-master/fault-extraction/samples.json` gains `provenance.categoryRule`, beside
`authoringRule` and `annotationRule` — the two rules already stated there, in the same voice. It
names `inferFaultCategory`, records the 19-of-19 result, says the check is asserted **over the whole
file**, records that the concordance is **self-consistency** rather than a result, and says the
product decision was **deliberately not taken** there.

New test group N makes the word "total" an assertion rather than an adjective: every sample's
`expected.type` must derive a member of `FAULT_CATEGORIES`; **no** sample may derive `unknown`
(the taxonomy's escape hatch staying unused rather than merely legal); and the conformance is
asserted as **nineteen individual equalities**, not one equality of two counts — a reading that
reported 19 of 19 while transposing two samples would pass the aggregate and fail this. Both
directions have controls, so neither claim can break silently.

### The measurement that decides whether the deferred decision is available

Finding 102 said its decision now had a subject. It did not ask the question that determines whether
the decision **exists**: **does anything downstream depend on `expected.category` being predicted
rather than derived?**

`category` is consumed in four places. **Only two of them branch:**

| Consumer | Branches | Why |
|---|---|---|
| `gates/validity.ts:148-155` | **yes** | looks the category up in `FAULT_EXPECTATIONS`; a miss returns `{semanticTypes: [], unverifiable: true}` |
| `export/rcaeval.ts:148` | **yes** | `if (suite === 'RE3' && fc.fault.category !== 'code')` skips the case before writing files |
| `export/itbench.ts:119` | no | indexes a total `Record<FaultCategory, string>` with **no guard** |
| `export/cloudopsbench.ts:79` | no | same shape, `TAXONOMY_BY_CATEGORY` |

The first draft of this section — and the plan agent that reviewed it — called all four "branch
points". Measured, the honest count is **two**, and the correction is recorded because it is the
exact overstatement the section exists to prevent: a two-consumer result published as a
four-consumer result.

`assessDownstreamAgreement(samples, consumers)` takes the four as `{name, branches, outcome}`
triples and compares each consumer's outcome under the label against its outcome under the
derivation. On this corpus no branching consumer moves on any sample: `inert: 19 of 19`,
`lossless: true`.

**And then the refutation, which is the point.** `separates` is measured against an **alternative
derivation** — the pre-finding-95 substring reading, kept in the module as a contrast precisely
because this codebase shipped it. Under it `feature-flag-misconfiguration` derives `middleware`
where the label says `config`, a different bucket in `validity.expectedSignalsFor`, so that consumer
moves:

```
1 of 19 = 0.0526   floor: 0.2   separates: false
```

So the reading **cannot** separate, and `lossless: true` is **self-consistency, not a result**.

The honest part, recorded rather than left for a reader to discover: the same alternative does
**not** move `rcaeval`'s RE3 filter, because `config` and `middleware` are both non-`code` and both
are skipped. **On this corpus the RE3 consumer contributes zero discriminating power**, and the
verdict rests on `validity` alone. A reader who assumed all four consumers were evidence would be
counting two projections and one inert filter as three more chances to disagree.

> **Corrected by finding 104.** Two claims above were too narrow, and neither correction changes the
> verdict.
>
> The census is **five** consumers, not four: `export/aiops2025.ts:76` reads the field through a
> `??` fallback the corpus reaches on 16 of 19 samples, and it was missing from both hand-written
> copies of the list. It is an independent opinion about the category rather than a projection, so
> the reading is over **three** chances to disagree, not two.
>
> And the single disagreement is not "the pre-finding-95 substring reading" alone. That matcher is
> finding 95's subject; the *row order* is a second, independent defect — `substringReading`
> iterates `Object.entries(CATEGORY_TERMS)`, and the shipped order happens to test `middleware`
> before `config`, which is what produces the disagreement. Moving `config` above `middleware`
> removes it without touching a matcher. The verdict is unmoved either way: the alternative still
> moves 1 of 19 (0.0526), still below the floor.

### Three more unreachable branches, and the same repair a fourth time

`assessDownstreamAgreement` adds a fourth reading with the same shape as the other three, and the
battery found the same trap in it. `moved` is empty, `lossless` is `true` and `separates` is `false`
on this corpus — three values a hardcode would reproduce exactly.

The repair is the one findings 96, 100 and 102 already applied, for the fourth time: **construct the
input that reaches the branch and publish it in `controls`.**

* `controls.sensitive` — one sample whose type derives `runtime` and whose label says `middleware`,
  read through a consumer whose outcome is the category itself. Honest: `moved: 1`,
  `lossless: false`. A mutation that makes the comparison agree by construction moves it to
  `moved: 0`, `lossless: true`.
* `controls.downstreamSeparating` — two samples the alternative reading moves throughout. Honest:
  `separates: true`, `2 of 2`. This is what makes a hardcoded `separates: false` observable.

With both ends pinned, the only implementation that passes is one whose verdict is computed.

The fourth reading also produced a **corrected expectation in the test suite rather than in the
code**, twice — both times because the code was right and the assertion was wrong:

1. I wrote a test asserting `separates: false` for the one sample the alternative moves, and the
   code disagreed. On a one-sample corpus that sample is `1 of 1 = 1.0`, **above** the floor. The
   share is a *fraction*, so the same sample contributes `1 of 19` to the corpus and `1 of 1` alone.
   Both figures are now asserted together, because either alone is compatible with a `separates`
   that ignores its denominator.
2. I wrote a test asserting the duplicate detector reports a declaration in an indented doc comment.
   It does not, and the regex is right: anchored with `^` under `m`, a declaration must begin at
   column zero, and prose in a doc comment is indented by ` * `. That accident is what keeps every
   docstring in this repository out of the reading, so it is now asserted rather than assumed.

And the detector itself had a **real defect the test caught**: `names.filter((n, i) => names.indexOf(n) !== i)`
returns a repeated name once per *extra* occurrence — three declarations yield `['Alpha', 'Alpha']`.
It looked right and is off by one in the direction a reader would not check. Fixed by a scan that
reports each offending name exactly once.

### What the deferral now rests on

The decision finding 101 deferred and finding 102 gave a subject is **available**, and this finding
is what makes it available: because no branching consumer moves, a producer could stop predicting
`category` on this corpus without a downstream change. That is a claim about **this corpus** and it
is not a claim that the derivation is right — the consumers branch on the same label the derivation
is checked against, and the dataset and the classifier share an author.

### Files

| File | Change |
|---|---|
| `packages/core/src/fault/category-derivation.ts` | retired the duplicate `MissReading` + corrected its docstring; new section (f) `assessDownstreamAgreement` + `DOWNSTREAM_FLOOR`; new section (g) `duplicateTypeDeclarations`; `downstream?` on the report + `downstreamCaveat` |
| `packages/core/src/index.ts` | registers `DOWNSTREAM_FLOOR`, `assessDownstreamAgreement`, `downstreamCaveat`, `duplicateTypeDeclarations`, and 5 types |
| `golden-master/fault-extraction/samples.json` | `provenance.categoryRule`, the third rule stated beside the other two |
| `packages/core/test/fault/category-derivation.test.ts` | 72 → **108 tests**; new groups M (the detector and the defect that motivated it), N (the stated rule, checked whole-file), O (downstream agreement), P (the report carries the verdict with its refutation) |
| `packages/core/test/export-surface-enumerated.test.ts` | enumerates the new module surface |
| `scripts/probe-category-derivation.mjs` | the four real consumers, the downstream verdict printed above its figures, `--json` block |
| `scripts/probe-type-misses.mjs` | `declarations` sub-block, `controls.sensitive`, `controls.downstreamSeparating`, `downstream.branching`, the downstream paragraph in the block |
| `scripts/injection/type-miss-probe.py` | 8 injections (AL–AS), incl. the duplicate re-injected and its renamed companion |

### Verification

Repository suite: **2850 passed in 102 files**. `src/fault` coverage: **100 / 100 / 100 / 100**,
`category-derivation.ts` at **108 tests**. The two gaps the report named were closed by adding the
tests it asked for rather than by an exemption: an unreachable `undefined` guard (removed — a
branch no input reaches cannot be covered, so the form was changed to one that has no branch) and
the `downstreamCaveat` separating direction (exported and tested directly, because the corpus is
lossless and only the other direction is reachable through the report).

Battery: **47 caught, 0 survived, 0 inert, 0 blind**, all twelve in-package targets restored
byte-for-byte.

#### The eight new injections took five battery runs, and four of the five failures were mine

The injections were written from a reading of the module rather than from its text, and the battery
found the difference each time. Recording them here because the pattern is the finding: every one
was caught by the mechanism the battery exists to be, and none of them would have been caught by
reading the entry list.

**Run 1 — the in-package slot.** AO, AP, AQ and AR reported `INERT` with `anchor not found`, and AS
raised `KeyError: 'downstream'`. AO/AP/AQ rewrite statements in `category-derivation.ts`, and I had
declared them with the default `'source'` target, so their edits were applied to the JS probe, where
those strings do not exist. The fix is the target slot, not a rewrite of the anchors — the anchors
were already exact.

**Run 2 — the same three, one level deeper.** They still reported `INERT`, because `main()` builds
the in-package edit from `also` alone:

```python
in_package = also(base) if also is not None else base
```

An entry whose target is `'derivation'` and whose `mutate` holds the edit has that edit applied to
the probe and the module left untouched. The shape a single in-package edit needs is `mutate = None`
with the edit in `also`, which is what AD and AK already used.

**Run 3 — AN, AO and AQ survived.** In each case the entry's *finding* is sound and its
*requirement* was not: it asserted a figure the mutation leaves alone. AO read
`conformance.conforming`, which is 19 before and after — every recorded row already agrees with its
label, so a by-construction criterion reports the same headline, while the figure that moves is
`misses.consistent` (0 → 8). **A SURVIVED is a bad test, not a bad claim.**

**Run 4 — AO caught, AN and AQ still survived.** Both are genuinely indistinguishable on this
corpus: the honest `duplicates` is `[]` and a hardcoded `[]` matches it byte for byte, and the
honest downstream verdict *is* `false`, so a hardcoded `false` reproduces every published figure.
My first reaction was to declare them INERT-shaped mirrors and move on. That was wrong, and the
precedent says so: **AI had survived against `discriminatingPower` for exactly this reason**, and
the repair was the `controls.separating` reading, which supplies an input where the constant is the
wrong answer. The same repair applies here — `controls.downstreamSeparating` for AQ, and for AN a
newly published positive control, since `duplicateTypeDeclarations` is pure over its source and a
source declaring one name twice can simply be handed to it.

**Run 5 — 47 caught.** The exit code demands every injection be caught
(`return 0 if caught == len(INJECTIONS) and restored else 1`), so an "intentionally INERT" entry
cannot be expressed at all: a mirror that does not survive is the only kind that can be stated.

The generalisable form: **when a mutation is indistinguishable on the corpus, the fix is to change
the input, not the verdict.** Declaring a survivor intentional is available and is usually wrong —
it was wrong here twice, and in both cases the control that catches it already existed for a
different reading.

### What this does not establish

**It does not establish that the derivation is correct.** The consumers branch on the same label the
derivation is checked against, and `separates` is false. An agreement that cannot be made to fail is
not evidence, and the module prints that above the figure rather than below it.

**It does not establish that the prompt should state the rule.** That is still the deferred product
decision, and `provenance.categoryRule` records that it was not taken here. What the rule's being
written down establishes is that adding a sample now fails a test instead of quietly breaking a rule
nobody had recorded.

**It does not establish that the RE3 consumer is inert in general.** It is inert *for this
disagreement*, because `config` and `middleware` are both non-`code`. A different mis-derivation
into or out of `code` would move it, and the reading would then have a second chance to disagree.

**And it does not upgrade the miss figure.** The 0-of-8 count remains below-floor and run-dependent,
printed with both qualifiers wherever it appears.

---

## Finding 104 — the consumer census was short by one, and the distinction it needed was not a boolean

Finding 103 closed the category rule and left the downstream reading with a four-consumer census, a
`lossless: true` verdict and a `separates: false` refutation. It also left a suggested next step —
wire the reading into `auto-tune`'s signal weights — which this iteration **refuted before acting on
it**: `grep -rn "autoTune\|auto-tune\|signalWeight" packages/core/src` returns nothing. There is no
auto-tune and no signal-weight machinery for the reading to be wired into, so the proposal had no
target module and was withdrawn. Auditing the premise first is cheaper than building against it.

Reading the modules that do exist (`score/`, `evolution/`) turned up no integration surface either:
`evolution/proposal.ts` is the HITL and red-line plumbing for self-evolution, not a weight
optimiser, and its `computeRegression` compares two scores rather than tuning anything.

So the reading was audited instead, and three defects came out of it.

### Defect 1: the census was written down twice, and both copies were missing the same consumer

`assessDownstreamAgreement` takes its consumers as an argument, and both probe scripts supplied
their own hand-written array of four. Neither contained
`packages/core/src/export/aiops2025.ts:76`:

```ts
const faultCategory = AIOPS2025_CATEGORY[normalizeFaultType(faultType)] ?? fc.fault.category;
```

This is a real consumer of the field, and it is not marginal. Measured on the corpus:

| quantity | value |
|---|---|
| samples where the `??` fallback is reached | **16 of 19** |
| samples where the emitted `fault_category` differs from `fc.fault.category` | **1 of 19** (`pod-kill`: emits `pod`, the IR says `runtime`) |
| table values outside the IR category vocabulary | **16 of 19 rows** (`stress`, `node`, `jvm`, `dns`, `misconfiguration`, `erroneous-change`, `io`) |
| samples whose emitted value moves if `fc.fault.category` changes | **14 of 19** |

The last row is the one that matters. The table is keyed by *type*, not by *category*, and falls
back to the category — so for 14 of 19 samples the category decides the emitted value. A consumer
reached on 16 of 19 samples was reported as absent, and the reason is purely structural: **a list
maintained in two places can be right in one and wrong in the other, and this one was wrong in
both.**

The repair is to own the census where the reading lives. `CATEGORY_CONSUMERS` is now exported from
`category-derivation.ts` and both probes import it, which is the same repair
`component-agreement.test.ts` already applies to `CATEGORY_TERMS`.

### Defect 2: `branches: boolean` could not express the consumer that was missing

`aiops2025` neither branches nor projects, and the two-valued flag had no way to say so:

* it does not **branch** the way `validity` and `rcaeval` do — there is no filter, no early return;
* it does not merely **project** the way `itbench` and `cloudopsbench` do — those index a total
  `Record<FaultCategory, string>` and emit whatever they are given, so they can never disagree.

`AIOPS2025_CATEGORY[type]` is an **independent opinion** about what the category should be, and the
`??` is an admission that the opinion is unknown. That is a third relation, and recording it as
either of the first two is wrong in a different direction — as `projects` it leaves the evidence
set, as `branches` it claims a control-flow branch that is not there.

So the flag is now a three-valued role:

| role | meaning | can reject a wrong category |
|---|---|---|
| `branches` | the category selects different behaviour | yes |
| `projects` | the category is interpolated into an emitted label | **no** |
| `verified` | the category is compared to an independent opinion | yes |

and the reading publishes `evidence` — the count of consumers that can reject — beside
`consumers`. On this repository that is **3 of 5**, and the caveat now prints both numbers
separately instead of describing the two interpolations as consumers that "read" the field.

That wording was itself the second half of the defect. Finding 103's correction changed "four branch
points" into "two of the four index a total map with no guard" — accurate about the *mechanism*, and
still inviting a reader to take the length as the size of the evidence. **A count that a reader will
quote has to be the honest one, in a field, where a test can move it.**

### Defect 3: the reading's row order is a load-bearing dependency, and nothing checked it

`category-terms.ts` is a deliberate copy of the classifier's table in `collector.ts`, with a real
test asserting the two agree term-by-term. What that test does not check is **row order** — and
`substringReading` iterates `Object.entries(CATEGORY_TERMS)`, so wherever two rows both match a slug
the iteration order decides the answer.

Measured exhaustively over all **5040** orders of the seven rows, on the 19 corpus types:

* the reading produces **4 distinct verdict vectors**, so its answer is not a function of the data;
* the shipped order is one of them; **3360 of 5040** permutations disagree with it;
* exactly two slugs are matched by two rows — `redis-latency` (`middleware/redis` **and**
  `network/latency`) and `feature-flag-misconfiguration` (`middleware/lag` **and** `config/config`).

The shipped order tests `middleware` before `config`, and that single decision is what makes
`substringReading('feature-flag-misconfiguration')` return `middleware` where the label says
`config`. It is the **only** disagreement the reading has with the corpus, it is the 1 of 19 that
`alternativeShare` is computed from, and it is what the `separates: false` refutation rests on.

**This corrects Finding 103's attribution.** That entry called the disagreement "the pre-finding-95
substring reading". The matcher is finding 95's subject; the *order* is not, and it is independent of
it: two matching rows are decided by iteration whatever the matcher is. Putting `config` above
`middleware` removes the disagreement without touching a single matcher, which is how the two
defects were separated. Group R now pins the order, names both ambiguous slugs, counts the
permutations that move and states the cost of the shipped one.

### The eight new injections, and one of them found a third thing

Six entries were planned (AT–AY) and the census edits also exposed a **stale accessor**: the probe's
`derivation.downstream` block still read `consumer.branches`, which is `undefined` since the flag
became a role, so `branching` was published as `0` for a census with two branching consumers. No
test would have caught it — the figure is published for a reader, not asserted — and it was found by
reading the probe's own output after the census changed. The block now publishes `branching`,
`verifying`, `projecting` and a recomputed `evidenceRecomputed`, so the partition is visible in the
published artefact rather than only inside the module.

The battery is at **53 entries**, all in-package sources restored byte-for-byte.

### What this does not establish

**It does not establish that the AIOps2025 table is correct.** It establishes that the table is an
independent opinion the census failed to count. Whether `pod-kill` should emit `pod` or `runtime` is
a product question, and the fact that `fault_category` leaves the IR vocabulary for 16 of 19 rows is
a separate finding with a separate subject — this iteration records it and does not act on it.

**It does not make `separates` true.** Widening the census raises the *opportunity* to separate, not
the measured separation. With `aiops2025` counted as evidence, the alternative derivation still
moves a consumer on 1 of 19 (0.0526), below `DOWNSTREAM_FLOOR` of 0.2, and the verdict stays
`false`. The reading is over three chances to disagree where it was over two — and it still does
not.

**It does not establish that the shipped row order is the right one.** It establishes that the order
is now checked, that the check can fail, and what the shipped order costs.

**And it does not close the deferred product decision.** The prompt may or may not state the
derivation; that remains open, and `provenance.categoryRule` still records that it was not taken
here.

### The four things the battery found about itself

Writing the six entries took **five battery runs**, and every non-green result was a defect in the
*entry*, not in the code under test. That is the v1.43 rule holding for the fifth iteration: a
SURVIVED is a bad test, not a bad claim. The four findings are recorded here because three of them
are structural rather than clerical.

**1. The entry contract has no shape check, so a transposed entry is indistinguishable from a no-op
edit.** The first version of all six entries omitted the `None` mutate slot, which slid every later
item one place left: the edit lambda landed where the description belongs and the target string
landed in `also`. `main` then took the in-package branch, read `also` as the string `"derivation"`,
compared `base` with `base` and printed *"the edit changed nothing"*. All six went INERT — against
anchors that were, in fact, exactly right. A reader's natural next move after INERT is to check the
anchor, and the anchor was fine, so the entry looked correct and fired at nothing. `INERT` collapses
three distinct conditions (no edit, no-op edit, misrouted edit) into one word. This is the same class
as the INERT misroute N produced in an earlier iteration, arriving again through a different door.

**2. `TS1117`: a duplicate object key is a compile error, not a silent overwrite.** The AW mutation
inserted a second `config` row above `middleware`, on the reasoning — written into the entry's own
comment — that a duplicate key is a silent JS overwrite whose *first* occurrence wins for
`Object.entries` order, which is the behaviour being mutated. `tsc` rejects it: *"An object literal
cannot have multiple properties with the same name."* The mutation was a compile error, so it
measured nothing, and `build_core` raised with the source still mutated. The repair is to **move** the
row rather than duplicate it. The general form: **a mutation must be a different *valid* program, or
it is not a measurement.** The same lesson arrived twice more, one slot over, in AY.

**3. `TS2741` and `TS2367`: the type system already prevents two of the defects the census was
written to guard against.** AY's first draft *deleted* the `role` lines, on the reasoning that a
census which stops carrying a role cannot tell a projection from a branch. `role` is required by
`CategoryConsumer`, so the edit is `TS2741` — **the boundary cannot be reached through the type at
all**, which is a stronger statement than the entry could make. The second draft collapsed the union
to `'branches' | 'branches' | 'verified'`; the narrowed type makes the accessor's
`role !== 'projects'` comparison statically impossible, so `tsc` refuses the program that would
misreport (`TS2367`). Both rejections *are* the finding: the roles are not merely checked by a test,
they are load-bearing in the type. AY's final form is the mutation that does compile and does
misreport — point the accessor at the wrong role — and it is caught.

**4. The wrong-field trap fired a fourth time, in its least obvious form.** AW's first requirement
read `discriminatingPower.differ`, the top-level figure. That figure is the **union across both
alternative readings**, and the second of them (`row-shadowing`) differs on `redis-latency` for a
reason an order change cannot repair. Moving `config` above `middleware` empties the *substring*
reading's list and leaves the union at two, so the requirement SURVIVED while the mutation was
working exactly as designed. The repair is to read the **named** reading rather than the union — the
figure the order actually governs. AY repeated the shape: its requirement read the role partition,
which an accessor edit does not move, so the requirement had to read `evidence` (3 → 2).

### The `in` that was not a membership test

The coverage-driven test group added for the five `outcome` closures found a **third defect in the
module**, and it is the sharpest one of the three.

```
outcome: (category) => (category in FAULT_EXPECTATION_KEYS ? 'checked' : 'unverifiable'),
```

`FAULT_EXPECTATION_KEYS` is a `Set`. The `in` operator tests **object property keys**, so on a `Set`
it is a string index into an object with none and is `false` for every input. The consumer
documented as *branching on whether the category is in the expectation table* **never branched at
all**: all eight real categories, and every nonsense value, reported `unverifiable`. The correct
operator is `.has`.

Nothing caught it, and the reason is worth recording. No test had ever asserted `'checked'` — the two
fixtures that mirror this closure build their category list inline as an array literal and are
therefore *correct*, so the reading agreed with itself while the shipped closure disagreed with both.
Group Q asserted the consumer's **role** (`branches`) and the evidence count derived from it; both
were true. Group U asserted what the closure **does**, and it failed immediately with
`resource must be checked: expected 'unverifiable' to be 'checked'`.

The defect's shape is the same as the stale `branching` accessor this iteration already recorded:
**a figure published for a reader, with nothing checking that it means what it says.** The census had
a `branches` lattice that could not fire. The module's own docstring asserted the totality of
`FAULT_EXPECTATIONS` and the totality was true — the closure that *reads* it was the broken part,
which is why the docstring being right was not protection.

Coverage is what surfaced it: `category-derivation.ts` reported **70.59% functions** with all five
`outcome` closures uninvoked. The gate is ≥95% per dimension, so the five closures required a test —
and writing the test was enough to expose the bug. The repair raises functions to **100%** for the
package and `src/fault` back to **100/100/100/100**.

## Finding 105 — the deferred note was three facts, and only two of them had a subject

Finding 104 closed with a deferral, recorded in its own words: *the fact that `fault_category`
leaves the IR vocabulary for 16 of 19 rows is a separate finding with a separate subject — this
iteration records it and does not act on it.* This iteration takes it up. The first thing it did was
refuse to accept the sentence.

### The premise audit, and the three facts it separated

The recorded sentence names one fact. Measurement separates three, and they do not have the same
subject.

**Fact 1 — not a defect.** `AIOPS2025_CATEGORY` has 19 rows, and 16 of them emit a word outside
`FAULT_CATEGORIES`: `stress`, `node`, `pod`, `jvm`, `dns`, `misconfiguration`, `erroneous-change`,
`io`. The recorded sentence treats that as an anomaly. It is not one.
`docs/targets/aiops2025.md:150` and `scripts/format-spec.mjs` both describe the table as *a
best-effort projection of the challenge vocabulary*. A projection emits the **target's** words, not
its input's. Demanding that the image of a fault-*type* to fault-*category* projection sit inside the
IR `FaultCategory` vocabulary is a category error: the emitter's job is to say what the challenge
says, and the challenge does not say `runtime` for a `pod-kill`. Nothing was changed for this fact.

That the same figure reads as a defect and as correct behaviour depending on which vocabulary you
measure it against is the iteration's first lesson: **a number is not a finding until its subject is
named.**

**Fact 2 — a real defect, and it is an asymmetry.** `checkAioPs2025Structure` scores two enumerated
fields side by side. One is checked:

```
score.ts:484   isVocabularyMember(AIOPS2025_INSTANCE_TYPES, obj.instance_type)
score.ts:472   typeof obj.fault_category !== 'string'
```

`instance_type` is validated against its declared vocabulary. `fault_category` is validated only for
being a string. Two fields of the same kind, in the same function, one held to its contract and one
not. The subject here is not the vocabulary — it is **the check that was never written**.

**Fact 3 — a real defect, and it is a promise narrower than reality.** The contract declared
`fault_category`'s domain as the 9 values in the table. The emitter's actual domain is 16. A consumer
reading the contract would write a validator that rejects seven legal payloads.

### The corpus measurement that decided which rows are reachable

`golden-master/fault-extraction/samples.json` has 19 samples. Only **3** normalise to a table key —
`network-delay`, `network-loss`, `pod-kill`. The other **16** take the `?? fc.fault.category`
fallback. Of the 3 hits, only `pod-kill` emits off-IR (`pod`, where the IR category is `runtime`).
The other 13 off-IR rows are **unreachable from this corpus**.

This matters because it bounds the blast radius of fact 3: the wide domain is reachable, but most of
its width is not exercised by the committed data. It also explains why the defect survived — the
table looks like the domain only if you read the table and never measure the emitter.

### The completeness argument, proved rather than asserted

The repair could have been a 16-element literal. That would have created a **third source of truth**
(the rule already recorded for `validity.test.ts`: a hard-coded vocabulary drifts silently). So the
derivation is composed from the two single sources:

```
emission(t) = AIOPS2025_CATEGORY[t]   if t ∈ table
              fc.fault.category        otherwise

fc.fault.category : FaultCategory      (compiler-enforced)

image(emission) ⊆ Object.values(AIOPS2025_CATEGORY) ∪ FAULT_CATEGORIES
```

and it is an **exact** image, not a superset — which is what makes the vocabulary checkable rather
than heuristic. Measured on the committed corpus: 16 distinct words. `network` sits in both halves,
so the IR tail is deduplicated against the table image; without that filter the composed list carries
a duplicate, and one test asserts the absence.

### The structural asymmetry, which explains why this file and no other

`itbench.ts:45` and `cloudopsbench.ts:41` are total `Record<FaultCategory, string>` with no `??` —
their domain is the IR vocabulary by construction. `rcaeval.ts:148` is a boolean. `aiops2025.ts:23`
is the **only** exporter keyed on fault *type*, which is why it is partial, and why the `??` exists
and is correct. The defect was in the check and the declaration, never in the emission; `:76` is
untouched.

### What was built

| Layer | Change |
| --- | --- |
| `export/aiops2025.ts` | `AIOPS2025_CATEGORY` exported (so the probe can measure the image); new derived `AIOPS2025_CATEGORIES` = table image ∪ `FAULT_CATEGORIES`, deduplicated |
| `score/score.ts` | `isVocabularyMember(AIOPS2025_CATEGORIES, obj.fault_category)` added; detail string names all four inputs |
| `test/aiops2025.test.ts` | three new groups: the vocabulary admits both sources and nothing else; the projection row by row (with `PROBE_CATEGORY = 'config'` so a broken lookup surfaces instead of coinciding); the vocabulary versus the golden corpus, asserting the 3/16 covered/fallback split as a contrast |
| `test/score.test.ts` | the ghost rejection **and** all 16 legal words accepted — both directions, the only new branch |
| `test/vocabulary-single-source.test.ts` | the documented vocabulary anchor: exact order, carries every IR category, table image is a prefix |
| battery | `categories` and `scorer` added as in-package targets; three entries (AZ drops the IR half, BA admits a ghost into the literal, BB unchecks the field) |
| docs | `format-spec.mjs` notes, `docs/targets/aiops2025.md` at five sites |

The two defects are covered by requirements that read **separate figures** — `admitted` for AZ and
`stray` for BA — because the defects they detect are opposite. One figure would have made one of the
two injections unobservable.

### The three compiler rejections, which are the measurement working

The battery took six runs. Every non-green result was a defect in the **entry**, not in the code
under test, and three of the six were the compiler refusing the mutation outright. A mutation has to
be a *different valid program* or it is not a measurement:

- AZ first deleted the only use of `FAULT_CATEGORIES` → `TS6133`. Repaired with
  `.filter(() => false)`, which keeps the reference live while removing its contribution.
- BB inverted the guard as `if (false && !isVocabularyMember(...))` → `TS18046: 'obj' is of type
  'unknown'`, because a constant condition makes the call dead and the type predicate stops narrowing
  `obj`. Repaired by **inverting the test** rather than the constant.
- Passing `[]` for the vocabulary → `TS6133` again, same class as the first.

And the slid-slot defect recurred: three new entries were written with the **description string
missing at slot 3**, so the edit lambda slid into `description` and the target string into `also`,
producing `TypeError: 'str' object is not callable`. AST inspection showed
`Constant, Constant, Lambda, Lambda, Constant` where the contract requires
`Constant, Constant, Lambda, Constant, Lambda, Constant`. This is verbatim the defect Finding 104
recorded. **It was recorded and not internalised** — the honest form of that lesson is that a
documented failure mode is not a fixed one.

### Verification

| Gate | Result |
| --- | --- |
| `vitest run --root packages/core` | 2901 passed / 102 files |
| coverage | `All files 99.96 / 99.94 / 100 / 99.96`; `aiops2025.ts` and `score.ts` both **100/100/100/100**; no file or dimension below 95% |
| battery | **56 caught, 0 survived, 0 inert, 0 blind**; all 12 in-package sources restored byte-for-byte |
| `pnpm typecheck` | clean (core + cli) |
| `pnpm lint` | ALL PROPERTIES HOLD |
| `pnpm docs:check` | PASSED (README sample, 11 commands / 13 documented) |
| `pnpm examples:check` | up to date |
| `pnpm official:check` | PASSED (8 targets scored, 1 skipped by contract) |

### What this does not establish

It does not establish that the wide domain is *right*. The challenge vocabulary is adopted as given,
because it is the target's; whether `erroneous-change` and `misconfiguration` should be one category
is a question about the challenge, not about this repository.

It does not establish that the corpus exercises the domain. It exercises 3 of 19 rows and 1 off-IR
emission. The other 13 off-IR rows are declared correct and measured by no sample.

And it does not establish that no other enumerated field is unchecked. `instance_type` and
`fault_category` were found by reading one function; the same reading has not been done for every
structure check in `score.ts`, and that is the iteration this finding hands forward.

## Finding 106 — the reading Finding 105 handed forward found a class, not an instance

Finding 105 closed by saying that `instance_type` and `fault_category` were found by reading one
function, that the same reading had not been done for the other structure checks in `score.ts`, and
that this was the iteration it handed forward. This is that iteration. The reading was done. It found
**five more enumerated fields checked with a bare `typeof`**, plus one duplicated rule, one
undocumented collapse, and one arm that looks dead and is not.

### The premise audit

`score.ts` has nine structure-check functions. Reading all nine in full:

| Check | Line | Enumerated fields it verifies | How |
| --- | --- | --- | --- |
| `checkOpenRcaStructure` | 102 | none | shape and cross-file alignment |
| `checkRcaEvalStructure` | 229 | none | shape |
| `checkRca100Structure` | 294 | none | shape |
| `checkAioPs2025Structure` | 422 | `instance_type`, `fault_category` | `isVocabularyMember` (v1.44, v1.45) |
| `checkCloudOpsBenchStructure` | 530 | `difficulty`, `result.fault_taxonomy` | **`typeof` only** |
| `checkItBenchStructure` | 568 | `scenario_domain`, `scenario_class`, `scenario_complexity` | **`typeof` only** |
| `checkOpenRca2Structure` | 614 | none | shape |
| `verifyChecksums` | 675 | none | digest |

Two of nine checks were doing the job. The two that were not are the two whose artefacts carry the
most enumerations — five fields between them, each declared in a `const` table elsewhere in the
package and each accepted by the scorer as any string at all.

### The vocabulary inventory

Every one of the five was already declared. None was reachable by a check.

| Field | Vocabulary | Where declared | Enforced before |
| --- | --- | --- | --- |
| `itbench.scenario_domain` | `ITBENCH_SRE_DOMAIN` = `'SRE'` | `export/itbench.ts:34` | no |
| `itbench.scenario_class` | image of `CLASS_BY_CATEGORY` | `export/itbench.ts:45` | no |
| `itbench.scenario_complexity` | image of `complexityFor` | `export/itbench.ts:57` | no |
| `cloud-opsbench.difficulty` | image of `difficultyFor` | `export/cloudopsbench.ts:53` | no |
| `cloud-opsbench.result.fault_taxonomy` | image of `TAXONOMY_BY_CATEGORY` | `export/cloudopsbench.ts:41` | no |

The measured images: `itbench.scenario_class` has **8 table rows and 8 distinct words** (no
collisions); `cloudopsbench.fault_taxonomy` has **8 table rows and 6 distinct words**, because
`middleware` and `dependency` both project to `Service_Fault`, and `runtime` and `unknown` both
project to `Runtime_Fault`. An earlier draft of the plan assumed both images were collapses. Only
one is, and the difference is now recorded rather than averaged away.

### The three facts this reading produced

**Fact C — an undocumented collapse, judged a documentation gap.** `instanceTypeOf`
(`export/aiops2025.ts:74`) maps the **nine** members of `ENTITY_KINDS` onto **three** words:

```
pod | container                                   -> 'pod'
node | host                                      -> 'node'
service | db | mq | cluster | external (default)  -> 'service'
```

`docs/targets/aiops2025.md` and `scripts/format-spec.mjs` both said only "defaults to service when
the entity is unknown". That is accurate and misleading at once: it presents as an edge case a path
that six of nine kinds take. A `db` reaches the scored artefact as a `service` and the field alone
does not show it. This is a lossy projection by construction, not a bug — so the fix is prose, not
code. The code is untouched and a dedicated *Instance-type projection* table now states the full
collapse.

**Fact D — a byte-identical duplicate.** `complexityFor` (`itbench.ts:57`) and `difficultyFor`
(`cloudopsbench.ts:53`) were character-for-character the same rule, each private, each mapping
`L1->easy, L2->medium, L3/L4->hard, unset->medium`. Two copies of one rule is exactly the
"third source of truth" defect `validity.test.ts` exists to name: they agree today by luck of
editing, and there was nothing that would have made them agree tomorrow. Extracted to a new leaf
module `src/export/difficulty.ts`:

```ts
export const DIFFICULTIES = ['easy', 'medium', 'hard'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export function difficultyFor(level: FaultCase['difficulty']): Difficulty {
  switch (level) {
    case 'L1': return 'easy';
    case 'L2': return 'medium';
    case 'L3':
    case 'L4': return 'hard';
    default: return 'medium';
  }
}
```

Both exporters now import it and both field names (`scenario_complexity`, `difficulty`) are two
projections of one word list — which is what `difficulty.test.ts`'s *one vocabulary, two
projections* case asserts directly.

**Fact E — an arm that looks dead and is not.** `FaultCase['difficulty']` is
`'L1' | 'L2' | 'L3' | 'L4' | undefined`. The `switch` has no `case undefined`, so the `default:` arm
is the only reachable path for `undefined` — it is the documented "unset -> medium" row, not dead
code. It is kept, and `undefined` appears explicitly in the `it.each` so the arm has measured
coverage rather than an argument. Deleting it as "unreachable" would silently change behaviour for
every case that omits the field.

### What was built

Five clauses across two checks, each reading a vocabulary derived from its own source table rather
than re-listed:

```ts
// checkItBenchStructure
if (!isVocabularyMember(ITBENCH_SCENARIO_DOMAINS, obj.scenario_domain)) { shapeOk = false; }
if (!isVocabularyMember(ITBENCH_SCENARIO_CLASSES,  obj.scenario_class))  { shapeOk = false; }
if (!isVocabularyMember(DIFFICULTIES,             obj.scenario_complexity)) { shapeOk = false; }

// checkCloudOpsBenchStructure
if (!isVocabularyMember(DIFFICULTIES,                    meta.difficulty))       { metadataOk = false; }
if (!isVocabularyMember(CLOUD_OPSBENCH_TAXONOMIES,       result.fault_taxonomy)) { metadataOk = false; }
```

The derived images, so that a removed table row and a stale word list cannot part company:

```ts
export const ITBENCH_SCENARIO_CLASSES = [...new Set(Object.values(CLASS_BY_CATEGORY))];
export const CLOUD_OPSBENCH_TAXONOMIES = [...new Set(Object.values(TAXONOMY_BY_CATEGORY))];
export const ITBENCH_SCENARIO_DOMAINS = [ITBENCH_SRE_DOMAIN];
```

`DIFFICULTIES` is declared first and `Difficulty` derived from it, so removing a word from the tuple
while an arm still returns it is a compile error rather than a silent widening.

### The compiler rejected three drafts

1. `const DIFFICULTIES = [...]` **and** `const DIFFICULTIES: readonly Difficulty[] = [...]` — both
   make `Difficulty` and `DIFFICULTIES` mutually dependent. The order above is the only one that
   resolves.
2. `ITBENCH_SCENARIO_CLASSES: readonly string[]` typed as `Difficulty[]` — `CLASS_BY_CATEGORY`'s
   image is scenario classes (`HighCPU`, ...), not difficulties. Caught by the annotation, which is
   why the annotation is there.
3. Re-declaring `AIOPS2025_CATEGORIES`' import at a second site produced
   `TS2300: Duplicate identifier`. The check is the point: the import already existed.

These are not incidental. Each is the type system refusing a version of this change that would have
been wrong in a way review might not catch.

### Verification

| Property | Figure |
| --- | --- |
| Full suite | 2960 passed / 103 files (v1.45: 2901 / 102) |
| `test/difficulty.test.ts` | 15 tests, new |
| `test/score.test.ts` | 146 tests (+16) |
| `test/vocabulary-single-source.test.ts` | 71 tests (+4 anchors, +4 describes) |
| `test/export-surface-enumerated.test.ts` | 184 tests (+7 names, +1 module) |
| TDD, by neutering | all five clauses rewritten to `false && ...` -> **exactly 7 failures** (5 ghosts + 2 wrong-field controls), then restored -> 146 passed |
| `pnpm typecheck` | clean |
| `pnpm lint` | ALL PROPERTIES HOLD |
| Battery | **61 caught / 0 survived / 0 inert / 0 blind**, 15 in-package sources restored byte-for-byte |
| Battery entries | 56 -> 61 (BC-BG) |
| 6-slot contract | AST-verified **before** running: all five new entries are `Constant, Constant, Lambda, Constant, Lambda, Constant` |

The battery's asymmetry is the finding's structural point. An exporter edit and a scorer edit fail
in different places, so **each target carries two figures**: a word count (moved only by changing the
projection table) and a ghost verdict (moved only by removing the check). One figure would let either
defect mask the other. This was proven rather than asserted — applying BC's mutation moved
`cloudOpsWords` 6 -> 1 and `cloudOpsDistinctWords` 6 -> 1 while `cloudOpsTaxonomyGhostRejected` stayed
1, and `itbenchWords` stayed 8.

### What this does not establish

It does not establish that five was the last of them. It establishes that the nine structure checks
in `score.ts` have now been read in full and that none of them still checks an enumerated field with
`typeof` alone. A field whose vocabulary is declared somewhere other than this package — or one
declared after this audit — is outside the reading.

It does not establish that the five clauses are the only consumers the vocabularies need. The
`vocabulary-single-source` anchors pin each vocabulary against its `format-spec` documentation
string; a consumer that reads the field without going through `isVocabularyMember` is still only
pinned by the emission census.

And it does not establish that the `default:` arm of `difficultyFor` is unreachable in practice. It
establishes the opposite: `undefined` reaches it, the arm is the documented behaviour, and it is now
covered by a named case rather than by inference.

## Finding 107 — the test that read the wrong table passed for two iterations

Finding 106 closed by handing forward its own deferral: *"the same reading has not been done for every
structure check in `score.ts`."* v1.41 through v1.46 had established that the emitted category
vocabulary is single-sourced, that each projection table's image is the documented image, and that
five enumerated fields are checked against their vocabularies rather than with a bare `typeof`. This
iteration asked the next question in that series — does the *key set* of each exhaustive projection
table still equal the IR enum it claims to be total over? — and the answer was no, in a way that no
existing test could have reported.

### The claim that was not being checked

`validity.ts:88-91` states of `FAULT_EXPECTATIONS`:

> "The table is total over `FAULT_CATEGORIES` and both directions are asserted in the test suite, so
> adding a category to the IR without deciding what it moves is a red suite rather than a silent gap."

That is a strong and correct promise. It was kept for **exactly one** of the four tables that make
such a claim.

| Table | Site | Rows | Key-set assertion before this iteration |
| --- | --- | --- | --- |
| `CLASS_BY_CATEGORY` | `itbench.ts:46` | 8 | none |
| `TAXONOMY_BY_CATEGORY` | `cloudopsbench.ts:42` | 8 | `.length === 8` only (`vocabulary-single-source.test.ts:531`) |
| `UMODEL_TYPE` | `rca100.ts:53` | 9 | none, and unreachable — the record is private |
| `FAULT_EXPECTATIONS` | `validity.ts:93` | 8 | asserted (`validity.test.ts:266`) |

The two directions fail differently, which is why a row count is not a substitute. A *missing* row is
caught by `tsc` as `TS2741`. An *extra* row requires widening the annotation, and the only guard
against that is the code review nobody performs on a one-line edit. A row count of eight is satisfied
by eight wrong rows.

### The four forms the type system refuses, each a measurement

Adding a ghost row to a `Record<FaultCategory, string>` is not a thing one can do quietly. Each
attempt was run, and each refused for a different reason:

| Attempt | Result |
| --- | --- |
| delete the annotation | `TS2741` — the literal is missing members of `FaultCategory` |
| rename a row key | `TS2353` — the literal cannot name a property the type lacks |
| add a row key | `TS2353` — same rejection |
| computed key `['ghostcategory']` | `TS2353` — a computed key does not evade it |
| widen the annotation | `TS6196` — `FaultCategory` becomes an unused import, then `TS2352` |

This is the type system working exactly as intended, and it is also why the defect survived: **the
annotation is a perfect guard against the only edit that a test would have caught, and no guard at
all against the edit it permits.** Every widening requires a deliberate change to the type, and the
tests were silent about whether such a change was ever *made*. The working form, found by
construction rather than by guess, splits the binding so the table stays total and the exported name
is widened:

```ts
const CLASS_BY_CATEGORY_TABLE: Record<FaultCategory, string> = { /* ... */ };
export const CLASS_BY_CATEGORY: Record<string, string> =
  Object.assign({}, CLASS_BY_CATEGORY_TABLE, { ghostcategory: 'X' });
```

`UMODEL_TYPE` needed the mirror-image treatment. Exporting it as `Record<string, string>` makes
indexing yield `string | undefined`, which is `TS2322` at `rca100.ts:154`; keeping the *exported*
type total is what works:

```ts
const UMODEL_TYPE_TABLE: Record<EntityKind, string> = { /* ... */ };
const UMODEL_TYPE: Record<EntityKind, string> =
  Object.assign({}, UMODEL_TYPE_TABLE, { ghostkind: 'apm.service' });
```

### The measurement that forced the source read

`UMODEL_TYPE` is private, so no test can name the object and `Object.keys` cannot see it. The
obvious alternative was behavioural: build a one-entity graph per IR kind through `buildTopologyJson`
and read the emitted `entities[].type`. That route was implemented, and then measured — and it
**cannot see the defect at all**:

> A ghost key added to `UMODEL_TYPE` changes **no emitted byte**, because every read is
> `UMODEL_TYPE[someEntityKind]` and only `ENTITY_KINDS` values are ever looked up.

Measured directly, with the ghost key present: `umodelRows` 9 (unchanged), `umodelDistinctWords` 7
(unchanged), `umodelKindsAnswered` 9 (unchanged). Three figures, all blind. The behavioural leg was
kept — it is a real second statement about the mapping's image — but it is *not* evidence about the
key set, and saying otherwise would have been the finding's own defect. The source-text reading is
the only mechanism that can reach this, which is why the test states it as the weaker of the two.

### The defect in the reader, which is the actual bug

Implementing that source read exposed a second bug, and it is the one worth recording.

`literalRows` — the helper added this iteration to parse a declaration out of the source text —
anchored on `source.indexOf('const UMODEL_TYPE')`. That is a **substring** match, and
`const UMODEL_TYPE` is a *prefix* of `const UMODEL_TYPE_TABLE`. Injection BL renames the literal to
`UMODEL_TYPE_TABLE` and rebinds `UMODEL_TYPE` to an `Object.assign` expression. Measured:

| Source | `indexOf('const UMODEL_TYPE')` | resolves to | rows returned |
| --- | --- | --- | --- |
| original | 2301 | the real literal | 9 |
| under BL's mutation | **2301** | `UMODEL_TYPE_TABLE` | 9 |

The position is **identical in both**, because the first occurrence of `const UMODEL_TYPE` is inside
`const UMODEL_TYPE_TABLE`. The helper therefore read the one table the mutation had deliberately
moved out of the way, returned a clean nine rows, and every assertion built on it passed.

The number that matters: **under BL's mutation the full suite was green — 118 of 118 tests in the two
affected files, 80 of them in the very file whose purpose is to assert that the projection tables'
key sets match the IR.** A test that reads the wrong table does not fail; it reports that the right
table is fine.

The probe's parser had the same defect in its other form — it re-resolved the name with a second
`indexOf` after matching it, so it could land on a declaration other than the one it had just matched.
Both were fixed the same way: match the name with a boundary (`(?![\w$])`) or use the matched offset
directly, never re-look-up a substring. After the fix, BL fails **exactly four tests**, the four UModel
assertions, with the message `UMODEL_TYPE has no literal body` — which is the truthful description of
what the mutation did.

### What changed

| File | Change |
| --- | --- |
| `test/vocabulary-single-source.test.ts` | 71 -> 83 tests: key-set assertions on all four tables, row-by-row documented comparison for three, three self-tests for the reader's boundary rule |
| `test/rca100.test.ts` | behavioural leg over `ENTITY_KINDS` through `buildTopologyJson` |
| `scripts/probe-type-misses.mjs` | `umodelDeclaredKeys`, `umodelDeclaredRows`, `umodelDeclaredKeySetMatchesIr`; four table figures; boundary-aware declaration matching |
| `scripts/injection/type-miss-probe.py` | 61 -> 67 entries (BH–BM); anchor tuple extended with ten figures |
| `docs/targets/rca100.md` | states totality over `ENTITY_KINDS` and that both directions are asserted |
| `scripts/format-spec.mjs` | names the seven-word image for `entities[].type` and `entity_set` |

### Verification

| Property | Figure |
| --- | --- |
| Full suite | 2973 passed / 103 files (v1.46: 2960 / 103) |
| `test/vocabulary-single-source.test.ts` | 83 tests (+12) |
| Coverage, lines | 99.96% |
| Coverage, branches | 99.94% |
| Coverage, functions | 100% |
| Coverage, statements | 99.96% |
| TDD, by neutering | 6 mutations, each confirmed to fail the intended assertion, source restored byte-for-byte |
| Reader self-tests | the prefix collision is reproduced as a test, so the fix is guarded rather than trusted |
| Battery | **67 caught / 0 survived / 0 inert / 0 blind**, 15 in-package sources restored byte-for-byte |
| Battery entries | 61 -> 67 (BH–BM) |
| 6-slot contract | AST-verified **before** running: all six new entries are `Constant, Constant, Lambda, Constant, Lambda, Constant` |
| `pnpm typecheck` | clean |
| `pnpm lint` | ALL PROPERTIES HOLD |

The one uncovered span in the package remains `official.ts:1098-1100`, the `const unhandled: never`
backstop, which is unreachable by construction and documented as such.

### What this does not establish

It does not establish that the four tables are the last of them. It establishes that the four
`Record<IRenum, word>` tables in this package now state their key sets in both directions, and that
the reader used to check the private one is tested against the rename that defeated it.

It does not establish that a key-set assertion is sufficient for a table's correctness. It asserts
which keys are present, not which word each key maps to; the row-by-row comparison against the
published documentation is the separate statement that covers the values, and the two are deliberately
not merged, because a swap of two values that leaves the key set intact is invisible to the first.

It does not establish that `literalRows` is a general-purpose declaration parser. It is a reader for
one narrow literal shape, used for exactly one private table, and the three self-tests state that
narrowness rather than hiding it. A future table whose declaration does not match that shape will make
the helper throw rather than return a wrong answer, which is the property the fix bought.

## Finding 108 — four fields project one table, and the structure check read none of them

Finding 107 closed by handing forward the image→rows direction of the four projection tables. It was
measured first, and the premise was false: all three image figures are `[...new Set(Object.values(TABLE))]`,
composed from the table rather than written out beside it, so there is no direction in which the image can
drift from its rows. That census would have been an assertion about a tautology.

The audit that replaced it found something larger. `UMODEL_TYPE` is read at **four** sites in
`export/rca100.ts`, and `checkRca100Structure` read **none** of them.

### The four projection sites

| Field | Site | Read by `checkRca100Structure` before this iteration |
| --- | --- | --- |
| `entities[].type` | `rca100.ts:113` | no — the check read `entities[].id` and `.name` and nothing else |
| `metrics.entity_set` | `rca100.ts:153` | no — and this write site was the **only** occurrence of the string in the whole package |
| `edges[].src_type` | `rca100.ts:128` | no — every edge field was untouched |
| `edges[].dst_type` | `rca100.ts:130` | no — same |

The table is the same in all four cases: `UMODEL_TYPE[Entity.kind]`, nine IR kinds projecting onto seven
words. One table, four fields, zero checks.

### Why this is a defect and not a design choice

The sibling target answers the question directly. `AIOps2025`'s `instanceTypeOf` (`aiops2025.ts:74-85`)
emits `instance_type` at `:109`, **and** `checkAioPs2025Structure` checks it — `score.ts:478` asserts the
shape and `:488` asserts `isVocabularyMember(AIOPS2025_INSTANCE_TYPES, ...)`. RCA100 received the *emit*
half of that pattern and none of the *check* half. A ghost `entities[].type`, a ghost `edges[].src_type`
and a ghost `metrics.entity_set` were all accepted, and the only reason a widening of the table was ever
caught was the key-set assertion Finding 107 added — which guards the table, not the four fields the
table is projected onto.

### The gap my own first check invented

The first `entity_set` clause required the field on **every** modality row. Four pre-existing tests went
red: `passes a well-formed RCA100 export`, `scoreExport > scores 100`, and two of the new ones. A
temporary diagnostic showed why — `logs`/`traces`/`events`/`alerts` all emit `entity_set: null`, and
`format-spec.mjs:362` declares the field **only for `metrics.json`**. The other four tables do not declare
it and the emitter correctly omits it.

> The emitter was right and my check was wrong. A check that invents a requirement is not a stricter
> check; it is a wrong one.

The clause is now scoped to `name === 'metrics.json' && typeof row.entity_id === 'string'`, and the test
that replaced the failure asserts the positive fact the failure taught: the four tables that do not
declare `entity_set` are accepted **without** it.

### The second gap, found by neutering rather than by reading

The `withEdgeType` helper moved `src_type` **and** `dst_type` together, so neutering either clause alone
produced **zero** failures — one test standing in for two claims. Splitting it into `'src'`, `'dst'` and a
non-string edge test moved the file from 155 to 157 tests, and the neutering run then produced **3 / 2 / 1 / 3**
distinct failures per clause. Both defects were found by measurement, and are recorded here as the
finding's substance rather than hidden as an implementation detail.

### Figures

| Figure | Value | Meaning |
| --- | --- | --- |
| `rca100UmodelVocabularyWords` | 7 | words in the published image |
| `rca100EntityTypeGhostRejected` | 1 | a ghost `entities[].type` is refused |
| `rca100EntitySetGhostRejected` | 1 | a ghost `metrics.entity_set` is refused |
| `rca100EdgeTypeGhostRejected` | 1 | a ghost `edges[].src_type`/`dst_type` is refused |
| `rca100TypesLegalAccepted` | 1 | the legal control, without which a check that rejected everything would satisfy the three above |

The ghost word is built as `ghost.${UMODEL_TYPES.join('|').length}` rather than written out, so adding a
genuine word to the table can never silently turn a ghost figure into a legal-value test that passes for
the wrong reason.

### Acceptance

| Gate | Result |
| --- | --- |
| `vitest run` | **2984 passed / 103 files** |
| Coverage, statements | 99.96% |
| Coverage, branches | 99.91% |
| Coverage, functions | 100% |
| Coverage, lines | 99.96% |
| every touched module | 100% on all four dimensions (`export/rca100.ts`, `score/score.ts`, `index.ts`) |
| TDD, by neutering | 4 mutations, 3/2/1/3 failures, source restored byte-for-byte |
| Battery | **72 caught / 0 survived / 0 inert / 0 blind**, 16 in-package sources restored byte-for-byte |
| Battery entries | 67 -> **72** (BN–BR) |
| 6-slot contract | AST-verified **before** running: all five new entries are `Constant, Constant, Lambda, Constant, Lambda, Constant` |
| `pnpm typecheck` | clean |
| `pnpm lint` | ALL PROPERTIES HOLD |
| `pnpm docs:check` | README sample executed; CLI reference 11 commands / 13 documented |
| `pnpm examples:gen` / `examples:check` | up to date |
| `pnpm official:check` | **8 scored / 1 skipped**, no metric movement |
| Export enumeration | `UMODEL_TYPES` / `RCA100_UMODEL_TYPES` added to `TESTED`, not exempted |

The only sub-100% span remains `official.ts:1098-1100`, the `const unhandled: never` backstop, plus
`score.ts:383` and `cli/args.ts:194`; all three predate this iteration.

### What this does not establish

It does not establish that four fields are all the projections of this table. It establishes that the
four the exporter actually reads are now held to the vocabulary, and that the check reads the field rather
than a string that happens to appear once.

It does not establish that the vocabulary is correct. It establishes that no export can carry a word
outside the seven, which is a different claim: a table that mapped every kind to `k8s.pod` would satisfy
every figure above.

It does not establish that `entity_set` is checked everywhere it is declared. It is checked on the one
table whose contract declares it, and the four that do not are asserted to be accepted without it — which
is the fact my first, wrong clause is the evidence for.

## Finding 109 — the instrument was blind to the defect it was built to measure

Finding 108 closed with three claims about what it did not establish. The second one was:

> It does not establish that the vocabulary is correct. It establishes that no export can carry a word
> outside the seven ... a table that mapped every kind to `k8s.pod` would satisfy every figure above.

The claim was measured first, and it is false in one direction and far worse in the other.

### The two mutations

Both keep every emitted word inside the seven-word vocabulary, so both are *different valid programs*
rather than errors.

| Mutation | Full suite | The six UModel probe figures | `official:check` |
| --- | --- | --- | --- |
| `SWAP` — `pod`↔`node`, a permutation inside the vocabulary | 4 failed / 2980 passed | **all six unchanged** | PASSED |
| `FLAT` — every kind → `apm.service` | 9 failed / 2975 passed | **all six unchanged** | PASSED |

### What the first row refutes

**The value direction was already guarded, and Finding 108 named a gap that does not exist.** Four tests
catch `SWAP`, including `vocabulary-single-source.test.ts > each projection table matches its published
rows, row by row > rca100: the UModel type column, one row per IR kind`, which compares every kind against
`DOCUMENTED_UMODEL_TABLE` position by position. That test predates Finding 108. The sentence above should
never have been written, and it is the second consecutive iteration whose closing paragraph asserted a
gap that measurement dissolved — Finding 107's deferral had the same shape.

### What the third column exposes

**The probe is blind to both mutations.** Six figures, two mutations, zero movement — and
`official:check` does not move either, because no project in the corpus exercises a permuted UModel type.

The figures were built as aggregate counts: `umodelRows` 9, `umodelDistinctWords` 7,
`umodelKindsAnswered` 9. Both mutations preserve every aggregate, because both preserve the row count,
the word count and the answered-kind count. **The figures measured the mapping's *shape* and were
documented as if they measured the mapping.** A figure that cannot move cannot report, and its presence
makes the reading look *covered* — the third-source defect `validity.test.ts` names.

### The fix

One figure, content-sensitive and order-free:

```js
umodelMappingDigest: umodelMappingDigestOf(umodelPairs),
```

carried as a SHA-256 hex digest rather than a count, because a count is exactly what was blind. It is
taken over the emitted pairs **sorted by kind**, so the order they arrive in is not part of the reading.

### The iteration then found three defects in its own work

**1. The sort was decorative, and my first order test proved nothing.** The first version of the
order-free test reordered the **source literal** and asserted the digest held. It passed — and it would
have passed *with the sort deleted*, because `umodelPairs` is built by `ENTITY_KINDS.map(...)`, so the
literal's order can never reach it. The neutering run reported this as N4 `0 failed`: a clause asserting
nothing.

Measured, the order the digest actually depends on is `ENTITY_KINDS`':

| digest | `ENTITY_KINDS` reversed | result |
| --- | --- | --- |
| sorted | `a678fbe7...` | unchanged |
| unsorted | `2cdca22f...` | **moved** |

So the sort *is* load-bearing, and the test was aimed at the wrong order. Rewritten against
`ENTITY_KINDS`, all four neutering variants now fail (N1 constant, N2 wrong source, N3 sorted by word,
N4 unsorted).

**2. The two battery entries asserted the inverse of every other entry.** `BS` and `BT` were written
`digest != baseline` — asserting the figure had moved — while this battery's convention is that the
requirement states the figure that must **hold**, printing `SURVIVED` when it does. Both entries came
back `SURVIVED` on the first run. **The battery was right and the requirement was backwards.** Recorded
rather than quietly fixed, because an entry that can never be caught is exactly what the battery exists
to make visible.

**3. The mutation test raced the suite, and atomic writes did not fix it.** The first version drove the
two mutations from the test body, rebuilding `packages/core` each time. `vocabulary-single-source.test.ts`
reads `src/export/rca100.ts` **at module load**, and vitest runs test *files* in parallel. Two full-suite
runs failed with two **different** victims (`check-cli-reference`, then `vocabulary-single-source`), both
green in isolation — the signature of a race, not a flake.

Routing the writes through an atomic helper — the discipline `injection-write-discipline.test.ts`
already states — was necessary but **not sufficient**: atomicity prevents a *partial* read, not a
*complete but mutated* one. The failure survived at roughly one run in three. The mutation proofs were
therefore moved to the battery, which owns snapshot, restore-verification and rebuild for exactly this,
and the suite keeps only what needs no shared state: the figure exists, it is a digest, it is not any of
the counts, and — via the extracted pure function `umodelMappingDigestOf` — it is order-free under
`reverse` and `rotate` while moving under a content change.

**Verified by five consecutive full-suite runs and three after the final refactor, all green.**

### Acceptance

| Gate | Result |
| --- | --- |
| `vitest run` | **2987 passed / 103 files** |
| Coverage, statements / branches / functions / lines | 99.96 / 99.91 / 100 / 99.96 |
| Every touched file | no file changed under `src/` this iteration |
| TDD, by neutering | 4 variants, each failing the intended assertion; sort removal fails exactly the order test; source restored byte-for-byte |
| Battery | **74 caught / 0 survived / 0 inert / 0 blind**, 16 in-package sources restored byte-for-byte |
| Battery entries | 72 -> **74** (BS, BT) |
| 6-slot contract | AST-verified **before** running: both new entries are `Constant, Constant, Lambda, Constant, Lambda, Constant` |
| `pnpm typecheck` / `lint` / `docs:check` / `examples:check` | clean |
| `pnpm official:check` | **8 scored / 1 skipped**, no metric movement |
| `python3 -m py_compile` | clean |

### What this does not establish

It does not establish that the digest is the last blind figure. It establishes that *this* class — a
change preserving every aggregate — is now visible for the UModel table, and that the blindness was
found by running the two mutations rather than by reading the figures.

It does not establish that the digest's value is meaningful. It is an identity, not a checksum of
correctness: it says *the mapping changed*, not *the mapping is right*, and the correctness claim lives
in the row-by-row test that was already there.

It does not establish that `official:check` is sensitive to this class of defect. Measured, it is not:
both mutations left it at 8 scored / 1 skipped, because no corpus project exercises a permuted UModel
type. That is a fact about the corpus, recorded here so the gate is not credited with a measurement it
does not make.


---

## Finding 110 — the battery's entry contract was a false statement about its own data, and 42 of 74 entries declared an anchor that could not observe them

*2026-10-04. Iteration v1.50. Files: `scripts/injection/type-miss-probe.py`,
`packages/core/test/type-miss-probe.test.ts`.*

### The premise I proposed, and what measuring it did to it

v1.50 was proposed on finding 109's own closing paragraph: that `umodelMappingDigest` "cannot tell
*mapping changed* from *mapping correct*", so nothing reported the correctness half. Two candidates were
proposed — extend the corpus so `official:check` meets a permuted type, or upgrade
`umodelMappingDigestOf` from an identity check to a content assertion against `DOCUMENTED_UMODEL_TABLE`.

**Both premises are false, and the measurement is unambiguous.**

`DOCUMENTED_UMODEL_TABLE` is not a mirror that agrees with the source. Editing one side only, then
running `test/vocabulary-single-source.test.ts`:

| state | result |
| --- | --- |
| M0 untouched | `rc=0`, 83 passed |
| M1 documented `service` → `k8s.pod` only | **`rc=1`, 2 failed** |
| M2 source `service` → `k8s.pod` only | **`rc=1`, 1 failed** |
| M3 both sides agree | **`rc=1`, 1 failed** (the `new Set(...).size === 7` figure) |

And the permutation is caught at suite level too. Full core suite, `service: 'apm.service'` →
`'k8s.node'`:

| state | result |
| --- | --- |
| S0 baseline | `rc=0`, 2987 passed |
| S1 source permuted | **`rc=1`, 5 failed / 2982 passed** — victims `rca100 · score · vocabulary-single-source` |
| S2 documented permuted | **`rc=1`, 3 failed / 2984 passed** — victims `fault-extraction-scripts · vocabulary-single-source` |

`DOCUMENTED_UMODEL_TABLE[ENTITY_KINDS.indexOf(kind)]` is a **positional** read of a table transcribed in
`ENTITY_KINDS` order, so it is sensitive to which kind maps to which word — the exact class v1.49 was
built to detect. **The suite already held that property.** This is the third consecutive iteration where a
closing paragraph named a gap that measurement dissolved (finding 107's deferral, finding 108's "what this
does not establish", now finding 109's).

The digest is nevertheless load-bearing — but **at the battery layer, not the suite layer**. It is read by
exactly two requirements (BS, BT) and by four suite assertions, and every other figure in its anchor tuple
is invariant under a permutation (`umodelRows` 9, `umodelDistinctWords` 7, `umodelKindsAnswered` 9,
`rca100UmodelVocabularyWords` 7, three ghost verdicts 1). It is the only figure a battery entry can move.
That is a different claim from the one finding 109 made.

### The defect the audit found instead

Chasing the above meant reading the battery's entry contract, and the contract was wrong in two ways.

**1. The declared type did not describe the data.** `INJECTIONS` was annotated
`list[tuple[str, Callable | None, Callable, str, Callable | None, str]]` — a fixed six slots. Measured,
the population is `{5: 7, 6: 66, 7: 1}`: three shapes.

| arity | shape | count |
| --- | --- | --- |
| 5 | `(name, in_package_edit, requirement, description, target)` | 7 |
| 6 | `(name, mutation, requirement, description, also, target)` | 66 |
| 7 | `(name, mutation, requirement, description, also, target, blind_anchor)` | 1 |

Runtime handled all three — `target = entry[5] if len(entry) > 5 else 'source'`,
`anchor = entry[6] if len(entry) > 6 else 'classifier'` — so nothing was broken. What was broken is that
the annotation is **the only place a contributor is told what an entry looks like**, and it actively
misled: the lone seven-slot entry `AD` carries the blind anchor the entire BLIND mechanism depends on.
A false type is how the next reader gets it wrong.

**2. Forty-two of seventy-four entries declared an anchor that structurally cannot observe them.** The
BLIND branch is guarded by a comparison of the classifier partition, and then compares
`blind_anchor(result, 'classifier')` against `blind_anchor(None, 'classifier')` — which is *the same two
values the guard just compared*, since `blind_anchor(r, 'classifier')` **is** `(r['total'], sorted(r['counts'].items()))`.
For a `classifier`-anchored entry the anchor conjunct is therefore a **tautology**: it is True exactly when
the guard already passed, and adds no information.

Measured distribution before the fix:

| requirement reads | declares `classifier` | should declare |
| --- | --- | --- |
| `derivation(...)` | 20 | `derivation` |
| `outcome_vocabulary(...)` | 18 | `outcomeVocabulary` |
| `baseline(...)` | 2 | `baseline` |
| `categories(...)` | 2 | `categories` |
| classifier partition (correct) | 31 | `classifier` |

So **42 entries were un-blindable**. Each could report CAUGHT on the strength of a partition number
unrelated to its edit, and — worse in the other direction — a future entry that *missed* its target would
report CAUGHT too, because the BLIND branch could never be reached. That is finding 109's defect one layer
up: **a reading that cannot move cannot report, and its presence makes the check look covered.** The
entries' own comments already asserted the opposite ("anchored here ... so that an entry aimed at them is
BLIND when it misses") — the intent was written down and the mechanism did not implement it.

### The fix

- `assert_entry_contract(entries)` — runs at the top of `main`, **before any file is mutated**. Refuses
  the whole run (not one entry) if any entry's arity is outside `{5, 6, 7}` or any slot's kind is wrong.
  All positional reads in the loop have silent fallbacks, so a malformed entry is not an error where it is
  misread — it is a plausible report about the wrong file. This is the only place that can catch it.
- `assert_anchor_is_reachable(entries)` — a requirement that reads one of the four block accessors must
  declare that block's anchor. The accessor is found by regex over the requirement lambda's own source
  span; an `ast.Lambda` has no `__code__`, which is why the first version of this check crashed.
- The annotation is now the real union, with the arity table in the docstring.
- 42 entries corrected by appending the anchor the new guard requires.
- `packages/core/test/type-miss-probe.test.ts` gained a describe restating both properties **independently
  of the battery's implementation** — a test that imports its subject's guard agrees with it by
  construction, and agreement by construction is not evidence.

### Three defects in my own repair, all caught by measurement rather than review

The automated edit was wrong three times, and each failure was found by running something rather than by
reading the diff.

**1. `AN` and `AS` were arity 5, not 6, and the automated edit fused `AO`'s opening line onto `AN`'s
closing line.** The first form of the damage was a syntax-level corruption: `"AO. derivation: ...",        None,`
on one line, which made `AO` lose its `mutate=None` slot and shift its `also` into slot 1. The battery ran
with `AO`'s requirement reading a different figure than intended.

**2. My repair for `AN`/`AS` put the anchor in the target slot.** I reasoned that arity 6 means
`entry[5]` is the target, so I set both slots to `'derivation'`. Measured, that routes those two entries
down the **in-package** path (`if target in IN_PACKAGE_TARGETS`), where `also` is applied to the *module* —
which their `mutate` never touches, since both edit the **probe**. Both reported `INERT`, and the battery
fell from `74 caught / 0 inert` to **`72 caught / 2 inert`**.

**3. The `HEAD` comparison that finally resolved it was itself reading the wrong slot.** My shape checker
compared `he.elts[5]` as the target, but `HEAD`'s arity-5 entries have no slot 5 at all — their last slot
is 4 and holds `None`. The checker therefore reported a target change for two entries that had never
declared a target. Dumping every slot of both entries against `HEAD` directly is what showed the truth:
`AN` and `AS` are `(name, mutate, requirement, description, None)` with `target` defaulting to `'source'`,
so the correct encoding is arity 7 with slot 5 = `'source'` and slot 6 = `'derivation'`.

The lesson is the same one the battery teaches: **the guard would have caught all three, and did — it was
the only thing that did.** `72 caught / 2 inert` was not a passing run and could not be reported as one.

### Acceptance

| gate | result |
| --- | --- |
| Entry contract | 74 entries, arities `{5: 5, 6: 26, 7: 43}`, all match a declared shape |
| Anchor reachability | every entry's anchor reads the block its requirement reads |
| Anchor distribution | `classifier` 31, `derivation` 20, `outcomeVocabulary` 18, `baseline` 3, `categories` 2 |
| Shape equivalence vs `HEAD` | every entry's first five slots byte-shape-identical to `HEAD`; the only slot changes are the 42 intended anchor additions plus `AN`/`AS`'s explicit `target='source'` |
| Deliberate breaks | **D1** arity → contract fires; **D2** wrong slot kind → contract fires; **D3** revert BS's anchor → reachability fires; **D4** new wrongly-anchored entry → reachability fires |
| Restore | battery byte-identical after every break |
| Battery | **74 caught / 0 survived / 0 inert / 0 blind**; 16 sources byte-identical |
| Suite | **2990 passed / 103 files** (v1.49: 2987) |
| Coverage | `All files 99.96 / 99.91 / 100 / 99.96` — unchanged, no `src/` touched |
| `typecheck` / `lint` / `docs:check` / `examples:check` | clean |
| `pnpm official:check` | **8 scored / 1 skipped**, no metric movement |
| `python3 -m py_compile` | clean |

### What this does not establish

It does not establish that the remaining 31 `classifier` anchors are all correct. They are correct for the
entries whose requirement reads the classifier partition, which is what the new guard tests — but the
guard is a rule about *accessor names*, and an entry that reaches another block through a helper the
accessor table does not list would still be missed. The table is deliberately closed at four entries and
its incompleteness is the honest statement of its reach.

It does not establish that the four shapes cover every future entry. A shape that needed an eighth slot
would fail `assert_entry_contract` loudly rather than being silently misread, which is the intended
behaviour, but it means the three-shape enumeration is a statement about today's battery rather than a
bound on what a battery may be.

---

## Finding 111 — every target had a clear status, and the guard's own summary line could not say so

*2026-10-04. Iteration v1.51. Files: `golden-master/official-assets.json`,
`scripts/check-official-registry.mjs`, `packages/core/test/official-assets.test.ts`,
`packages/core/test/check-official-registry.test.ts`.*

### The premise I was carrying, and what measuring it did to it

With P0-1 blocked on data I do not hold, I took the next item I could act on. P0-3 reads:

> **P0-3** — for each of the remaining 6 formats, either determine how to get the official
> data or explicitly declare it unfetchable. Exit condition: every format has a clear status
> in `official-assets.json`: `pinned` / `declared unfetchable` / `pending`.

**The premise is false. All nine targets already have a clear status**, and the split is
exactly the three states P0-3 asked for. Measured, reading `SCORE_TARGET_IDS` out of
`packages/core/src/score/targets.ts` the same way the guards read it:

| target | assets | pinned | notFetchable | status |
| --- | --- | --- | --- | --- |
| `openrca-1.0` | 0 | 0 | 1 | declared unfetchable |
| `openrca-2.0` | 0 | 0 | 1 | declared unfetchable |
| `rcaeval-re1` | 3 | 0 | 0 | pending |
| `rcaeval-re2` | 3 | **3** | 0 | pinned |
| `rcaeval-re3` | 5 | 0 | 0 | pending |
| `rca100` | 0 | 0 | 1 | declared unfetchable |
| `aiops2025` | 0 | 0 | 1 | declared unfetchable |
| `cloud-opsbench` | 0 | 0 | 1 | declared unfetchable |
| `itbench` | 0 | 0 | 1 | declared unfetchable |

All six targets P0-3 names as outstanding carry a `notFetchable` entry with a licence and a
reason over 40 characters. **This is the fourth consecutive iteration where a carried-forward
gap dissolved under measurement** — finding 107's deferral, finding 108's "what this does not
establish", finding 109's closing paragraph, and now a tracker item rather than a finding.

The reason is worth stating, because it is not an accident. P0-3 was written against a *plan*,
and the plan's work was done by a later iteration that closed a different item. The tracker
line kept its `—` dependency column empty and was never reread.

### The defect the audit found instead

**The registry states its status. The guard stated a count, and the count was not the claim.**

```
check-official-registry: OK (11 asset(s), 3 pinned, 7 declared unfetchable)
```

Three plus seven is ten. **The identity does not close**, and the missing term is the one
P0-3 cared about most.

| state | expressed in the schema | reported by the guard | nameable by a reader |
| --- | --- | --- | --- |
| pinned | `sha256 != null` | **counted** (3) | yes |
| declared unfetchable | its own list | **counted** (7) | yes |
| **pending** | **nothing** | **nothing** | **no** |

Measured: the string `pending` appeared **nowhere** — not in `official-assets.json`, not in
`check-official-registry.mjs`, not in `official-assets.test.ts`. (`pinned` was also absent
from the registry file; it existed only as a local variable in the guard.)

The eight fetchable-but-unpinned assets are `rcaeval-re1-{ob,ss,tt}`,
`rcaeval-re3-{ob,ss,tt}`, `rcaeval-baro-simple` and `rcaeval-multi-source`. From the guard's
line a reader could not tell *pending* from *forgotten* — and pending is the only one of the
three states with an action attached to it.

**This is the same defect shape the project has now named five times: a reading that cannot
report, whose presence makes the check look covered.** Finding 109 recorded it for a probe
figure, finding 110 for a battery anchor, and this is the same thing one layer up — in the
line a human reads, printed by a guard that had the information and summarised it away.

### The fix

**1. The summary line is now an identity that closes.** It names all three terms:

```
check-official-registry: OK (11 asset(s): 3 pinned, 8 pending, 7 declared unfetchable)
check-official-registry: pending (fetchable, no measured pin): rcaeval-re1-ob, rcaeval-re1-ss, rcaeval-re1-tt, rcaeval-re3-ob, rcaeval-re3-ss, rcaeval-re3-tt, rcaeval-baro-simple, rcaeval-multi-source
```

The pending assets are **named rather than counted**, because the count is what made the state
invisible.

**2. The partition is asserted, not described.** `pinnedAssets.length + pendingAssets.length`
must equal `registry.assets.length` or the guard fails with a message saying a fourth category
needs a home. If a future edit adds a state, the arithmetic stops closing rather than the line
quietly changing its meaning. And the two residues are asserted disjoint.

**3. A stranded pending asset is refused.** An asset that is unpinned *and* `fetchable: false`
can never be pinned: nothing will ever take that download, so it would sit in the state that
means "there is work left" while reading as work in progress. Measured, this is a real gap —
both fields existed and nothing compared them.

**4. The three states are declared in the registry's own `stateVocabulary`**, beside the
`note` that already explained what the file is. `pending` exists only as "the absence of the
other two", and a state a contributor cannot name is a state they will not know they can be
in. The definition also records **how the state closes**: `pending` is closed by a measured
`sha256`, not by editing prose, and a test asserts that the definition says so — a state
closable by editing a description would report progress the project did not make.

### Acceptance

| gate | result |
| --- | --- |
| Registry states | 9 of 9 targets classified; `3 pinned + 8 pending = 11 assets`, identity closes |
| Guard line | names all three terms and lists the pending ids |
| Deliberate breaks | **D1** remove `stateVocabulary` → `official-assets.test.ts` red; **D2** an unpinned+unfetchable asset → guard red with `can never be pinned`; **D3** partition test green at baseline; **D4** revert the summary line to the lossy one → guard test red; **D5** emit the pending count instead of the names → guard test red |
| Restore | all four files byte-identical after every break |
| Battery | **74 caught / 0 survived / 0 inert / 0 blind**; 16 sources byte-identical |
| Suite | **2999 passed / 103 files** (v1.50: 2990, +9) |
| Coverage | `All files 99.96 / 99.91 / 100 / 99.96`; no file×dimension below 95% |
| `typecheck` / `lint` / `docs:check` / `examples:check` | clean; `check-official-registry: OK (11 asset(s): 3 pinned, 8 pending, 7 declared unfetchable)` |
| `pnpm official:check` | **8 scored / 1 skipped**, no metric movement |
| `python3 -m py_compile` | clean |

### What this does not establish

It does not establish that the eight pending assets are fetchable from here. The sandbox
cannot reach `zenodo.org`, so `pending` is a statement about **the pin**, not a claim that a
fetch would succeed. That distinction is why the state is called `pending` and not
`fetchable`: the registry knows a URL exists; it does not know the URL works today.

It does not establish that pinning is the right way to close the remaining two RCAEval
suites. P0-1 is still blocked on a real download, and this finding changes nothing about it —
it makes visible what is waiting on it.

It does not establish that no fourth state is needed. It establishes that a fourth state
would have to be added to this guard's arithmetic and to the line it prints, rather than
appearing as a residue that no term accounts for. That is the property the old line lacked.

## Finding 112 — one column held two questions, and the answer it printed for six rows was impossible

*2026-10-04. Iteration v1.52. Files: `scripts/check-l4-status.mjs` (new),
`packages/core/test/check-l4-status.test.ts` (new), `docs/target-formats.md`, `package.json`.*

### The premise I was carrying, and what measuring it did to it

P0-4, verbatim from the tracker:

> **P0-4** — put the L4 fourth anchor's status into `08`, distinguishing per-format.
> Exit condition: `08` §3.1's L4 column has a status for each of the 9 formats.

I opened `08-实测现状基线.md` §3.1 expecting to find the column sparse, and to fill it in. **The
column is complete — all nine rows carry a value — and five of the nine values are false.**

| row | `08` §3.1 L4 cell | registry | verdict |
| --- | --- | --- | --- |
| OpenRCA 1.0 | `✅ 已实测回放（本轮实跑）` | **unfetchable** | **false** |
| OpenRCA 2.0 | `❌ 未测量` | unfetchable | **false** — "not measured yet" on a row that can never be measured |
| RCAEval RE1 | `⚠️ 见 §3.2` | **pending** | **false** — §3.2 does not carry a status |
| RCAEval RE2 | `⚠️ 见 §3.2` | **pinned** | **false** — a pinned anchor that has a reading, shown as indeterminate |
| RCAEval RE3 | `⚠️ 见 §3.2` | pending | **false** — same as RE1 |
| RCA100 | `❌ 无自动抓取` | unfetchable | ok |
| AIOps2025 | `❌ 无自动抓取` | unfetchable | ok |
| Cloud-OpsBench | `❌ 无自动抓取` | unfetchable | ok |
| ITBench | `❌ 无自动抓取` | unfetchable | ok |

**This is the fifth consecutive iteration where a carried-forward item dissolved under
measurement** — finding 107's deferral, finding 108's "what this does not establish", finding
109's closing paragraph, the P0-3 row in v1.51, and now P0-4. It is the **first where the
dissolution is a false claim rather than a missing one.** The first four cost nothing to
correct; this one means a document has been telling readers something untrue for fourteen days.

### The worst cell, and the three measurements that close it

OpenRCA 1.0 claimed `✅ 已实测回放（本轮实跑）` — *a replay was actually run this round*. The
registry lists that anchor as **not fetchable at all**; its telemetry lives behind a Google
Drive folder. A replay cannot have been run over data the pipeline has no way to obtain.

Three independent measurements, none of which needs the network:

| check | result |
| --- | --- |
| `.github/workflows/official-data.yml`'s `anchor` input | three options — `rcaeval-re1`, `rcaeval-re2`, `rcaeval-re3`. **`openrca-1.0` is not among them**, so no dispatch of that workflow can name it |
| `scripts/fetch-official.mjs --anchor openrca-1.0` | would refuse: it selects from `assets`, and `openrca-1.0` appears only in `notFetchable` |
| `/tmp/official` | does not exist — no fetch output on disk, and the workflow's own cache path is empty |

`git log -S` traces the string to `7dbe0aa` (2026-09-20), the docs repository's **first
commit**. It has never been re-derived, and no iteration after it has re-read the cell.

### The structural defect, which is not staleness

The L4 column was not out of date. **It fused two independent axes into one cell**, and a cell
that answers two questions can only hold one answer:

| axis | question | how many of the nine |
| --- | --- | --- |
| **can it ever be measured?** | does a fetchable asset exist? | 6 unfetchable → **never**; 3 fetchable → yes |
| **has it been measured?** | is there a `sha256` pin? | **1 pinned**; 2 pending |

Only a `pinned` target can have a reading — **one of nine.** The other eight are all "no
reading yet" for two reasons that require opposite actions:

- **unfetchable** (6): nothing to do. The channel does not exist, and three of them carry a
  documented `alternative` in the registry.
- **pending** (2): a 19 GB download that has not been taken. This is P0-1's work.

Because one cell could not hold both, the author filled the second axis with what *stage* each
format had reached — and that is precisely how `✅ 已实测回放` came to sit on a row that can
never be fetched. **The column was never a measurement. It was a stage label wearing a
measurement's clothes**, and a stage label has no reason to agree with a registry.

This is the same defect shape the project has now named six times — **a reading that cannot
report, whose presence makes the check look covered** — one layer up from findings 109–111: at
the *document* layer, where the cell that cannot distinguish two questions is being read as
though it answered both.

### The internal document already knew

`docs/progress.md` line 980 states the distinction correctly and rejects the wrong reading in
as many words:

> Anchor 4 is closed for the three RCAEval anchors only … the other six score targets … have no
> automated fetch

So the English internal doc got this right **before** the Chinese baseline did — and nothing
tied the two together. That asymmetry is why the fix below is a **check**, not a rewrite: prose
that is currently correct has no mechanism to stay correct, and the prose that was wrong was
correct once.

### The fix

**1. The column is split into its two axes.** `docs/target-formats.md` gains a
`## Fourth anchor (L4) status per target` table with `L4 可测性` (`pinned` / `pending` /
`unfetchable`) and `L4 读数` (the pin, or `—`), for all nine targets. A reader can now see that
OpenRCA 1.0's `—` means **never** while RE1's `—` means **not yet** — the distinction the single
column erased.

**2. The document's own rule is now enforced, not merely stated.** `08` declares "本文档只记录
实测值 … 未实测的数字一律写 `未测量`"; nothing checked it. `scripts/check-l4-status.mjs` holds
the published matrix to `golden-master/official-assets.json`, which is already the
machine-readable source of truth for exactly this axis:

- it finds its columns **by header name** (`/fetch|reachab|可测/i`, `/reading|number|读数/i`),
  never by index, so reordering the table cannot make it check the wrong cell;
- it refuses a table with no `reading` column at all, because **one column cannot hold both
  questions** — the guard states its own reason for existing;
- it derives the fetch state from the registry (an anchor in `notFetchable` is `unfetchable`;
  otherwise pinned iff some anchored asset carries a `sha256`) and the reading state **from the
  fetch state**, so there is no second source to drift;
- it asserts every one of the nine score targets has a row.

Live output:

```
check-l4-status: OK (9 row(s) agree with the registry; 1 pinned, 2 pending, 6 unfetchable -- 1 of 9 can have a reading)
```

**3. The claim is recorded as unsupported, not quietly relabelled.** The OpenRCA 1.0 row is
corrected to `unfetchable` / `—`, and the supporting section says the replay claim had no
execution behind it and names the three measurements. Relabelling it "未测量" would have
suggested an attempt was made and failed; no attempt was possible.

**4. The guard is wired into `pnpm docs:check`**, so the matrix is re-derived on every gate run
and a drift between the Chinese baseline and the registry fails the build rather than sitting
unread for fourteen days.

### Acceptance

| gate | result |
| --- | --- |
| Matrix | 9 of 9 rows carry both axes; every `L4 可测性` cell agrees with the registry |
| Guard | `check-l4-status: OK (9 row(s) agree …)`; run inside `pnpm docs:check`, which the CI job now calls |
| Deliberate breaks | **D1** OpenRCA 1.0 claims a reading → red; **D2** RE2 called unfetchable → red; **D3** RE1 called pinned → red; **D4** the ITBench row deleted → red; **D5** the registry drops its `rcaeval-re3` assets → red ; plus **D6–D10** on the CI wiring in the section below — all ten fire, byte-identical restore |
| Restore | `docs/target-formats.md`, `golden-master/official-assets.json` and `scripts/check-l4-status.mjs` byte-identical after every break |
| Battery | **74 caught / 0 survived / 0 inert / 0 blind**; 16 sources byte-identical |
| Suite | **3018 passed / 105 files** (v1.51: 2999 / 103, +19) |
| Coverage | `All files 99.96 / 99.91 / 100 / 99.96`; no file×dimension below 95%; no `src/` file touched |
| `typecheck` / `lint` / `docs:check` / `examples:check` | clean |
| `pnpm official:check` | **8 scored / 1 skipped**, no metric movement |
| `python3 -m py_compile` | clean |

### The guard was not in the pipeline, and the way it got there is the same defect again

The check above was green locally and **absent from CI**. Read the CI job: it invoked
`node scripts/check-readme-sample.mjs` and `node scripts/check-cli-reference.mjs` **by name**,
so `pnpm docs:check` was a local-only aggregate. Adding `check-l4-status.mjs` to that script ran
it on every developer machine and in no pipeline.

This is the defect shape of this iteration once more, now at the level of the pipeline itself: a
check that is present, green, tested, enforced locally, and **absent from the one place where a
merge is decided**. It is finding 111's summary line and finding 110's battery anchors, one layer
out -- a channel whose presence makes the check look covered.

The fix is one line: the job runs `pnpm docs:check` instead of listing its members. But a
one-line fix has the lifetime of the next edit, so the rule is asserted in
`packages/core/test/ci-reaches-doc-guards.test.ts`, which reads **both** sides -- the script list
out of `package.json` and the workflow body out of `.github/workflows/ci.yml`. Adding a guard to
the aggregate without routing it into the pipeline turns that file red.

**Five more deliberate breaks, and two of them survived the first version of the test.**

| break | first version | final version |
| --- | --- | --- |
| D1 the workflow re-lists its guards by hand | fired | fired |
| D2 the workflow duplicates the aggregate's list | fired | fired |
| D3 **the aggregate call is deleted outright** | **survived** | fired |
| D4 the L4 guard is dropped from `docs:check` | fired | fired |
| D5 **a guard is added where the workflow lists by hand** | **survived** | fired |

Two defects in my own test, both found by measurement rather than review:

**1. A disjunction over two routes cannot see which one is load-bearing.** The first version asked,
per guard, "is it reachable through the aggregate *or* named directly?" With the aggregate call
deleted and the guards still named by hand, every guard was reachable -- so the test said yes
while the pipeline had become exactly the hand-maintained list this iteration removed. Only one
route survives the next edit, and only that one is accepted now.

**2. A textual assertion can be satisfied by prose.** Even after narrowing to one route, D3 still
survived: `workflow.includes('pnpm docs:check')` was matching **the comment I had just written
above the step**. Deleting the step left its own explanation in place and the assertion passed.
The match is anchored to a `run:` line now -- the only place a command is executed. An assertion a
comment can satisfy is an assertion about prose.

D5 also had to be restated, and the restatement is the point: adding a guard to `docs:check` **is**
the wiring, because the aggregate carries it. What breaks is a guard added while the workflow has
gone back to listing by hand -- so the break applies both halves, which is what a contributor would
actually do.

### What this does not establish

It does not establish that the six unfetchable targets are permanently unreachable. It
establishes that **as of this commit** no fetchable asset exists for them, and that if one is
added to the registry the guard will require the matrix to change with it.

It does not establish that the two RCAEval `pending` suites are nearly done. They need a 19 GB
transfer; nothing in this iteration shortens it, and P0-1 remains blocked on data the sandbox
cannot reach.

It does not establish that `docs/target-formats.md` is the only place this two-axis confusion
appeared. It establishes that **this** matrix now cannot drift silently, and that the guard
refuses a table which tries to answer both questions in one column — which is the shape a
future occurrence would have to take.
