## v2.06 — the corpus nobody in this repository wrote

### One thing a released artefact had, and this project had never opened

`microsoft/OpenRCA` publishes four CSVs under `rca/archive/`: what a baseline agent
submitted, the criteria the official evaluator marked passed and failed, and the score
it wrote down. 335 rows. They are the only real OpenRCA population in existence, and
until this pass the rule had been replayed against 25 cases composed here.

The derivation is `scripts/derive-openrca-archive.mjs`; the corpus is
`golden-master/openrca-archive.json`, 139 KB of `(roots, criteria, score)` triples with
the four file digests beside them.

### What a row gives away, and what it does not

`passed` and `failed` are newline-joined values, not lists — that is what pandas does to
a list written into one cell. Together they **are** the criterion set, because
`file_evaluate` writes `failing_criteria = set(components+reasons+times) - set(passing)`.
What the columns do not say is which *kind* each value belongs to.

That is decided by `task_index`. `task_1`..`task_3` declare one kind, so placement is
forced. `task_4`..`task_7` interleave three, and the flattening has lost which is which —
unless the row names one root, in which case the `groundtruth` cell names all three values
and the derivation *reads* the placement rather than guessing it, refusing any row whose
key is not exactly the recovered set.

| | rows | two-root |
| --- | --- | --- |
| `Bank` | 136 | 20 |
| `Market-cloudbed-1` | 70 | 26 |
| `Market-cloudbed-2` | 78 | 29 |
| `Telecom` | 51 | **0** |
| **all** | **335** | **75 (22.4%)** |

**Telecom has none**, and the three others run between 14.7% and 37.2%. The multi-root
branch is not a corner case that happens to exist; it is a third of two of the four
systems, and its absence from one of them is a fact about the 30-minute conflict window
`generate.py` uses to decide what "multi-response" means.

### The number the 25-case corpus could not produce

Of those 75, **33 are replayable** and 42 are not: a two-root key spread across three
criterion kinds leaves the second root's values with no kind, and inventing one would be a
rule written here. So they are excluded and counted, and the test asserts the count.

**33 against 2.** The hand-composed corpus named two multi-root cases; the released
population has thirty-three in the slice that can be reconstructed. Every previous claim
about the matching rule rested on the smaller number.

### Acceptance

| gate | result |
| --- | --- |
| corpus | **293 cases** replayed, 42 excluded and counted, 335 rows accounted for |
| agreement | **293 of 293** reproduce the score the official evaluator wrote |
| partial credit | 0 ×216 · 0.33 ×9 · 0.5 ×28 · 0.67 ×2 · 1 ×38 — five distinct values, not a boolean |
| multi-root | 33 replayed (1 full, 9 partial, 23 zero); **10 cases change score** when only the first root is kept |
| derivation tested | both refusal branches and both failure exits, on a synthetic archive built with `renderCsv` |
| `core` test suite | **157 files, 3917 tests passed** (as of `9f18c78`) |
| `cli` test suite | **4 files, 187 tests passed** (as of `9f18c78`) |
| repo test suite | **161 files, 4104 tests passed** (as of `9f18c78`) |
| coverage | core **99.97 / 99.73 / 100 / 99.97**, cli **100 × 4** |
| gate sites | 65 across 39 scripts, `--check` OK |
| `typecheck` / `lint` / `docs:check` | green |

### Free credit, and the second half of the same defect

The derivation was wrong on its first run in a way worth recording: it mapped a criterion
kind back to an answer-key field by stripping a plural `s`, which turns `times` into `time`
while the field is `datetime`. Every three-kind task failed the reconstruction, and the
failure read as *"the archive disagrees with this repository"* — 102 rows of it. The archive
agreed with nothing; the reader could not see a field.

That is the same shape as the finding this whole campaign keeps meeting: **a mismatch is
not evidence about the other side until the reader has been checked.** The fix was one
table instead of a string operation, and the 102 rows became replayable on the next run.

### Open

- **42 rows of the archive are outside the replay.** `[open: a two-root key across three
  criterion kinds needs the second root's `groundtruth` row, which the archive does not
  keep; recovering them would mean re-running upstream's `generate.py` over its own
  metadata, which needs the dataset the README points at Google Drive for]`
- **The corpus cannot be re-derived in CI.** `[open: its input is the four CSVs, which
  `check-no-vendored-data.mjs` refuses to keep; `--check` exists and is tested, but no job
  can supply the bytes, so the digests are the only thing tying the file to a tree]`
- **Four v2.05 items did not move this pass**: `pr` is a lower bound, `em` is one root
  cause wide, a quote cannot be checked mechanically, and three targets wait on decisions.
  `[open: each carries its own reason in the v2.05 section; restating them here would be a
  second copy of an argument, so this line only says they are still open]`

---

## v2.07 — the task file answered one of the three questions

### The column

`{system}/query.csv` has carried, since the format existed:

```
instruction_id,query,occurrence_datetime
case-001,The order service became slow at 08:10 UTC+8. Find the root cause.,2026-09-06 08:10:00
```

`occurrence_datetime = localTime(injectTime)`. The file's own documentation says *"Task
input. One row per case. Must never contain the root-cause answer"*, and the name of the
directory above the code says `# tasks (safe to hand to the agent)`.

`main/evaluate.py` scores three things: the component (string equality), the reason (string
equality) and the occurrence time (**within 60 seconds**). Every case this exporter emits
carries all three elements, so `openRcaTaskIndex` always selects `task_7`, so the time
criterion is scored on every case. **The task file stated it, to the second, in a column.**

### Why `answer-key-isolated` was green

The check greps the file for the literal tokens `root cause component`, `root cause reason`
and `root cause occurrence`. The leak was a *column named* `occurrence_datetime`. No token
matched, because the check was looking for a sentence and the defect was a field.

That is the third time in this campaign that a check has been right about the shape it was
written for and blind to the shape that arrived. It is the same failure as the reader that
could not see `datetime` (v2.06), one level up: **a predicate expressed in a vocabulary
cannot see a value expressed in another.**

### What upstream does, and where the sentence is

`generate.py` builds the solver-facing prompt from `main/task_specification.json`, whose
first input line is `time range: {time_period}`; `time_period` comes from
`timestamp2timeperiod`, which floors the wall clock to a half hour and renders
`"{start} to {end}"`. Both files are pinned here by digest (`af63c4d2…` and `113bf4b6…`),
fetched through the contents API at the commit the evaluator is pinned at.

So the question upstream asks inside a 30-minute window is *which second*, and the answer
is worth 60 seconds of tolerance. This repository asked it inside the same window and then
printed the answer beside it.

### The fix, and the check that would have caught it

The column is now `occurrence_window`, and its value is `openRcaTimePeriod(injectTime)` —
the same half-hour bucket, in the same `A to B` shape, in UTC+8.

`task-carries-no-scored-value` is new, and it is not a spelling rule. It reads the answer
key the export already carries, collects every value the scorer awards credit for
(component, reason, onset, across every root), and requires that **no cell of the task file
equals one of them**. Three choices are deliberate and stated in the code:

- **Whole cells only.** Whole-word matching in the prose would flag "the order service
  became slow" when the component is `order` — which is how every incident report a human
  writes reads. The leak this exists for is a field that holds the answer, not a sentence
  that mentions it.
- **Against the exported key, not a template.** A future exporter that writes the onset
  under a new name is followed without being told.
- **A task row with no key row is skipped.** `row-alignment` owns "these files describe the
  same cases"; a second, differently worded verdict on the same fact is how two checks
  start disagreeing.

The report names the column that leaked and never the value: a score report is a document
a solver may be shown.

### Acceptance

| gate | result |
| --- | --- |
| the task file | `occurrence_window`, `2026-09-06 08:00:00 to 2026-09-06 08:30:00` for an 08:10 onset |
| the check | `task-carries-no-scored-value`, 5 tests: the real export, an onset cell, a component cell, a reason cell, a row with no key |
| the blind spot | the onset-cell test asserts `answer-key-isolated` is **green** on the same input, so the two checks are provably not the same check |
| `openRcaTimePeriod` | 5 tests: floor, both boundaries, last second of a window, midnight rollover, and "never renders the instant" |
| `core` test suite | **157 files, 3927 tests passed** (as of `902edd5`) |
| `cli` test suite | **4 files, 187 tests passed** (as of `902edd5`) |
| repo test suite | **161 files, 4114 tests passed** (as of `902edd5`) |
| coverage | core **99.97 / 99.73 / 100 / 99.97**, cli **100 × 4** |
| gate sites | 65 across 39 scripts, `--check` OK |
| `typecheck` / `lint` / `docs:check` | green |

### Open

- **The example incident states its own answer.** `[open: `examples/order-prod/bundle.json`
  and three siblings carry `"The order service became slow at 08:10 UTC+8"` as the query
  text, which names the onset and the component of a fixture whose ground truth is those
  two values, and the OpenRCA export now prints a window beside a sentence that says the
  second. The check above compares cells, so it does not fire; fixing it is a fixture change
  across nine targets and is recorded rather than folded into a contract change]`
- **Upstream's own task format has the same shape, at 1 in 30.** `[open: a window whose
  start is within 60 seconds of the onset hands that case's time criterion to a solver who
  guesses the start. This repository may floor exactly as upstream does or may not; the
  choice is not derivable from any released artefact]`
- v2.06's two items, and v2.05's four, are unchanged.
  `[open: each carries its own reason in its own section]`

---

## v2.08 — the anchor was checked in one place, and half of it at all

### What CI said that the suite could not

v2.07 renamed a column. `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm docs:check`,
`pnpm official:check` and every example check were green locally. CI failed at one step:

```
Golden Master verification FAILED
  - files/order-prod/query.csv: expected aec9318e… got 469715c7…
```

`golden-master/verify.mjs` re-exports the committed fixture and compares every emitted
byte against `expected.json`. **Nothing in the suite ran it.** It was wired into CI and
nowhere else, so the one check that exists to prove byte stability was the one check a
local run could not fail — which is the precise drift every other guard in this
repository was built to prevent.

The anchor itself was right to fail. The export changed on purpose.

### Half of the anchor was never read

`expected.json` records `sha256` **and** `bytes` for every file. The verifier compared the
digest and ignored the count. A recorded field that is never read is worse than an absent
one: a reader takes it as checked, and the file it lives in is the one
`check-no-vendored-data.mjs` exempts from its size rule on the strength of being an index
rather than data — so the number is not decoration, it is how big the artefact is.

Both are compared now, and each has its own failure message, so deleting one cannot hide
behind the other.

### What changed

| | before | after |
| --- | --- | --- |
| who runs the verifier | CI only | CI **and** the suite, at the point a change is made |
| `sha256` | compared | compared |
| `bytes` | recorded, never read | compared, with its own message |
| the failure branch | unreachable outside a real regression | reachable, and observed by three tests |
| the anchor path | fixed to the shipped file | `--expected <path>`, defaulting to the shipped file |

The `--expected` flag exists for the same reason `derive-backend-support.mjs` has one: a
guard that is only ever seen passing is the defect finding 121 was written about. No CI
step changes, because the shipped path is the default.

### The anchor moved, deliberately

```
files/order-prod/query.csv
  sha256  aec9318e1a84ece2ec05b1035dcba5a9597bc3d57aacd164d221645016d3513d
       →  469715c78c325ae1ebf03d7907b8b01f0461edf9fdcaa9af2414a0c3dbc91d23
  bytes   137 → 158
```

Two changes in one file: the header column name, and an onset replaced by a 30-minute
window that is 21 bytes longer. It is exactly the diff v2.07 argued for, and it is now
also the first anchor move that a local run can catch.

### Acceptance

| gate | result |
| --- | --- |
| the suite runs the comparison | 8 tests: the shipped anchor, both empty-group guards, and five branch cases |
| digest vs byte count | separate assertions, separate messages |
| why not spawn the script | a spawned run reads `dist`, which other files mutate and rebuild; the export is computed from `src` instead |
| missing on either side | `<missing>` reported for a file the anchor omits and for one it invents |
| `core` test suite | **158 files, 3935 tests passed** (as of `7c830b7`) |
| `cli` test suite | **4 files, 187 tests passed** (as of `7c830b7`) |
| repo test suite | **162 files, 4122 tests passed** (as of `7c830b7`) |
| coverage | core **99.97 / 99.74 / 100 / 99.97**, cli **100 × 4** |
| gate sites | 65 across 39 scripts, `--check` OK |
| `typecheck` / `lint` / `docs:check` / `golden-master/verify.mjs` | green |

### Open

- **A moved anchor is still updated by hand.** `[open: `expected.json` has no writer, and
  giving it one would let a broken export re-anchor itself -- which is worse than the
  manual step. What the suite now guarantees is that the step cannot be *forgotten*; it
  cannot guarantee it was *justified*. The commit message is the only record of that, so
  every anchor move has to be stated in one]`
- **Eight earlier items are unchanged**: v2.07's two, v2.06's two, v2.05's four.
  `[open: nothing in this pass touched any of them -- it is a list of what is still
  owed, and the argument for each one lives where it was made rather than here]`

---

## v2.09 — the example answered the question it was asking

### The sentence

Every format doc renders the same case. The task text was

> The order service became slow at 08:10 UTC+8. Find the root cause.

against ground truth `component: order`, `reason: CPU saturation on the order service`,
injection at `2026-09-06 08:10:00` UTC+8. **Two of the three scored criteria are in the
sentence**, and since v2.07 the same export prints `occurrence_window = 08:00–08:30`
beside it — the window `main/evaluate.py` actually asks about, with the answer written
next to it.

### Why the fix is not in the exporter

v2.07 put `task-carries-no-scored-value` in the structural check, and that check compares
**cells**. It deliberately does not scan prose: a whole-word rule would flag "the order
service became slow" when the component is `order`, which is how every incident report a
human writes reads. **A caller's prose is the caller's business**, and a check that
punishes it would be a check people route around.

This file is the other half of that decision. The repository's own example is not a
caller's prose — it is the artefact every doc shows as the shape to copy. So the rule is
enforced where it can hold without a false positive: **on the fixtures this repository
ships.**

### The word boundary that was wrong

The first version of the guard used `\border\b`. It fired on

> A checkout request on order-prod failed.

`order-prod` is the **system name**, which a task legitimately carries, and `\b` puts a
boundary at every hyphen, so the system read as a leak of the component `order`.

The rule is "the component must not appear as a token of its own", and a token may contain
hyphens: `(?<![A-Za-z0-9_-])order(?![A-Za-z0-9_-])` matches `the order service` and
`order.` and does not match `order-prod`. The negative test above is the one that found
this, which is the reason it is in the file.

### What replaced it

Upstream's task text is template-shaped: `main/task_specification.json` asks for
`time range: {time_period}` and `number of failures: {num}`, and the answer is three
separate fields. The fixture now reads the same way:

> A failure was detected between 08:00 and 08:30 UTC+8. Identify the affected component,
> when it occurred within that window, and the reason.

No component, no onset, no reason, and no `root cause …` token — the last one asserted
too, because a fixture that tripped `answer-key-isolated` would show up as an export
failure rather than as a sentence somebody wrote.

### Two anchors moved, and the pass before this one named them

```
files/order-prod/query.csv         469715c7 → e1fbfec9   158 → 233 bytes
files/order-prod/groundtruth.csv   2d6c3334 → 1136f28a   334 → 409 bytes
```

`groundtruth.csv` moves because the `instruction` column carries the same sentence. The
verifier reported **both fields of both files** in one run — the byte count included, which
is the comparison v2.08 added. Without it the message would have said only "the digest
moved" for two files, and a reader would have had to work out what changed.

### A gap's recorded reason was about the wrong thing

v2.04 recorded, for OpenRCA 2.0, that F1 / Precision / Recall are not implemented because
*"this data model carries exactly one root cause"*. That sentence is false, and it points a
future reader at the wrong repair.

The model is not narrow — `contract` is. `causal_path.json` carries one `root_cause`
object, and every answer key in the corpus names one root. **A pair set of size one makes
the three equal to EM whether or not a field exists to hold more**, so widening the model
would change no number on any case here. What the 33 two-root rows in the OpenRCA 1.0
archive establish is that a *format* can be wider — not that this one is.

The reason now says that, and `openrca2-evaluator.test.ts` holds it to two words: it must
contain `contract` and must not contain the sentence that blamed the model. A recorded
reason is the only thing standing between a reader and the wrong repair, so it gets the
same treatment as a number.

### What this pass learned about the suite's own ordering

`typecheck-entrypoint.test.ts` copies the working tree by applying `git diff HEAD` to a
clean checkout. `git apply` cannot apply a binary diff without a full index line, so a
regenerated `site/assets/rca-bench-factory-examples.tar.gz` makes that test fail **until
the pack is committed**. The failure is not a defect in the test's subject; it is a
statement that a binary artefact has no representation in a text patch. Recorded as an
open item rather than worked around.

### Acceptance

| gate | result |
| --- | --- |
| the shipped example | three fixture files, every case, no component / onset / reason / answer-key token |
| the guard | 6 tests: three fixtures, the old sentence detected, two innocent sentences not |
| the trap | `order-prod` is not `order`; the negative test is what found that `\b` was wrong |
| anchors | two files, both fields, named by the verifier in one run |
| `core` test suite | **159 files, 3941 tests passed** (as of `2a6f872`) |
| `cli` test suite | **4 files, 187 tests passed** (as of `2a6f872`) |
| repo test suite | **163 files, 4128 tests passed** (as of `2a6f872`) |
| coverage | core **99.97 / 99.74 / 100 / 99.97**, cli **100 × 4** |
| gate sites | 65 across 39 scripts, `--check` OK |
| `typecheck` / `lint` / `docs:check` / 金标 / `official:check` | green |

### Open

- **A binary artefact cannot be represented in `git apply`.** `[open: regenerating
  `site/assets/rca-bench-factory-examples.tar.gz` makes `typecheck-entrypoint.test.ts` red
  until it is committed, because the test applies a text patch of the working tree. The
  honest options are to exclude the pack from that copy, to use `git diff --binary`, or to
  leave it as a documented ordering constraint -- and the third is what this pass chose,
  since the first two change what that test proves]`
- **Widening a format is a product decision nobody has made.** `[open: the pair-set
  metrics collapse for OpenRCA 2.0 because its contract carries one root, and the reason is
  now recorded that way. Whether to widen the contract so a case can name two roots is a
  separate question -- 75 of 335 released OpenRCA 1.0 submissions name two, so the failure
  mode is real -- and it would need a target that scores a set, which none of the nine does]`
- v2.07's two, v2.06's two, v2.05's four, and v2.08's one are unchanged.
  `[open: none of them moved; each carries its argument where it was made]`

---

## v2.10 — the copy step could not carry a binary, and the failure looked like the subject

### The error

`typecheck-entrypoint.test.ts` builds a cold worktree and replays the uncommitted working
tree onto it, so the assertion is about the revision a developer is looking at rather than
the one they last committed. That replay was two inline commands:

```
git diff HEAD | git apply --whitespace=nowarn -
```

Regenerating `site/assets/rca-bench-factory-examples.tar.gz` made it fail:

```
error: cannot apply binary patch to 'site/assets/rca-bench-factory-examples.tar.gz'
       without full index line
```

and the file stayed red **until the artefact was committed**. Nothing was wrong with the
subject — the cold-tree typecheck was fine. **The fixture could not describe its own
inputs**, and reported that as a verdict about the thing it measures.

### What the old command pair actually produced

`git diff` without `--binary` writes, for every binary file:

```
Binary files a/site/assets/…tar.gz and b/site/assets/…tar.gz differ
```

That is a *description of a change*, not a patch: no bytes, no index line. `git apply`
refuses it, correctly. Measured on this tree, one appended byte:

```
$ git diff HEAD --stat  -- site/assets/…tar.gz
  Bin 5951 -> 5952 bytes
$ git diff HEAD --binary -- site/assets/…tar.gz | head -4
  index 1a7fca73…..aeb3f81d… 100644
  GIT binary patch
  delta 9
```

The flag is the difference between a sentence about a change and the change.

### The fix is a function, and the test is in a throwaway repository

`carryUncommitted(source, destination)` now lives in `packages/core/test/uncommitted-carry.ts`
and passes `--binary` to both commands (`git apply --binary` is a documented no-op on
current git; passing it states the intent instead of hoping). `maxBuffer` is raised because
a diff of a large binary is bigger than the default, and the failure would be an opaque
`maxBuffer exceeded` rather than a statement about the copy.

The tests **do not touch this repository**. They build a throwaway one, write a text file
and a file with a NUL byte in it, commit, and replay. A test whose setup mutates the tree it
is measuring can leave that tree broken, which is the defect class this pass is about.

### The control is the point

One of the six tests runs the **old** command pair and requires it to fail, with `binary` in
its stderr, and requires the destination to be untouched — which is what made the original
failure silent: the copy simply lacked the change.

> A flag whose necessity nobody has observed is a flag the next edit can delete.

That test also caught a defect in itself first: without `encoding: 'utf8'` the thrown
error carries stderr as a `Uint8Array`, and `toContain('binary')` compared a string to bytes
and failed for a reason that had nothing to do with git.

### The end-to-end proof

The unit tests prove the mechanism in a small repository. The claim being made is about
*this* repository, so the heavy fixture was run once in the failing configuration: one byte
appended to the pack, then

```
Tests  4 passed (4)
```

and the byte removed. Before the fix that run failed at `collect`, with no tests.

### Acceptance

| gate | result |
| --- | --- |
| the carry function | 6 tests: text, binary, both, the control, an empty diff, an untracked file |
| the control | the old pair fails, names `binary`, and leaves the destination untouched |
| end-to-end | the heavy fixture passes with a modified binary in the working tree |
| `core` test suite | **160 files, 3947 tests passed** (as of `488d3b1`) |
| `cli` test suite | **4 files, 187 tests passed** (as of `488d3b1`) |
| repo test suite | **164 files, 4134 tests passed** (as of `488d3b1`) |
| coverage | core **99.97 / 99.74 / 100 / 99.97**, cli **100 × 4** |
| gate sites | 65 across 39 scripts, `--check` OK |
| `typecheck` / `lint` / `docs:check` / 金标 / `official:check` | green |

### Open

- **`measure-doc-counts` dies with a stack when the suite is red.** `[open: it spawns
  `pnpm test`, and an `execFileSync` that exits non-zero propagates as an unhandled error,
  so the tool prints a captured transcript and a Node stack instead of saying "the suite is
  red, counts cannot be measured". It is the one tool whose output a person reads while
  something else is already wrong]`
- **The counts snapshot can drift from the suite.** `[open: `check-doc-counts` compares the
  documented counts against `golden-master/doc-counts.json`, not against a run -- which is
  deliberate, because it must work in a cold tree. CI closes the loop with
  `measure-doc-counts --check --from <report>`; a local edit that adds tests and refreshes
  neither file stays green locally until that CI step. The two-step update is the cost of a
  guard that never runs the suite from inside the suite]`
- v2.09's three, v2.08's one, v2.07's two, v2.06's two, and v2.05's four are unchanged.
  `[open: none of them moved this pass; each carries its argument where it was made]`

---

## v2.11 — the tool that counts answered a failure with a stack trace

### What it printed

`measure-doc-counts.mjs` spawns `pnpm test` once per scope. The spawn had no `catch`, so a
red suite became an uncaught exception:

```
Error: Command failed: pnpm --filter @rca-bench-factory/core test

  ✓ test/agent-browser…  (thousands of lines)

    at checkChildProcessResult (node:internal/child_process:324:7)
```

Someone asked for three numbers and received a transcript with a stack attached. **The one
fact they needed — the suite is red, and a count of what passed does not exist for a failed
run — was the only sentence not printed.**

That is worse than an ugly message because of *when* this tool runs. It is what a person
reaches for **after** something else has already gone wrong. A tool that answers a second
failure with a third is how a debugging session loses its place.

### Three sentences instead

```
measure-doc-counts: FAILED
  the core suite is red, so its counts cannot be measured.
  A count is what passed; a failed run has no number to publish.
  first failing test(s):
    test/alpha.test.ts > keeps the invariant
  the full run is above; re-run it with `pnpm --filter @rca-bench-factory/core test`.
```

The transcript is not replayed: `stdio` already sends vitest's own output to the terminal,
so the full text is one scroll up. The list is capped at five and deduplicated, because the
point is to name the work, not to reproduce the log.

### The distinction that keeps a broken environment from looking like a broken test

`execFileSync` fails in two different ways and they want different repairs:

- **exited non-zero** — the suite ran and something in it failed
- **never started** — `ENOENT` for `pnpm`, a signal, a working directory that is not there

Reporting the second as the first sends a reader hunting for a failing test that does not
exist. They are separate branches, and both are asserted.

### Why the diagnosis is a function

`diagnoseRedRun(scope, error)` is pure: it takes the captured error and returns lines. The
branch that used to be unreachable is now driven five ways, and the *end-to-end* path is
proven by putting a fake `pnpm` on `PATH` that exits 1 with a vitest-shaped transcript —
which is the only way to show the text reaches a terminal. The negative assertion is the
one that matters: **`Error: Command failed` must not appear**.

`SuiteFailed` is thrown rather than calling `fail()` directly, for the same reason
`derive-backend-support.mjs` takes `--out`: a branch that can only be observed by exiting
the process is the shape finding 121 was written about.

### Acceptance

| gate | result |
| --- | --- |
| the diagnosis | 6 unit tests: red, no transcript, cap, dedupe, re-run hint, never-started |
| end to end | a fake `pnpm` on `PATH`; exit 1, the three sentences, no stack |
| the old behaviour | asserted absent by name (`Error: Command failed`) |
| `core` test suite | **161 files, 3954 tests passed** (as of `711185be2`) |
| `cli` test suite | **4 files, 187 tests passed** (as of `711185be2`) |
| repo test suite | **165 files, 4141 tests passed** (as of `711185be2`) |
| coverage | core **99.97 / 99.74 / 100 / 99.97**, cli **100 × 4** |
| gate sites | 65 across 39 scripts, `--check` OK |
| `typecheck` / `lint` / `docs:check` / 金标 / `official:check` | green |

### Open

- **The counts snapshot still updates in two steps.** `[open: `doc-counts.json` and the
  published row are both hand-refreshed, and doing one without the other is green locally
  until CI's `--check --from` step. Making it one command would mean the guard running the
  suite, which is what the split exists to avoid; the honest repair is a `--write-doc` mode
  that rewrites both from a single run, and it is a design decision rather than a fix]`
- **A red suite is still a red suite.** `[open: this pass made the *report* honest, not the
  failure. Nothing short-circuits the measurement when a scope fails; the first failing
  scope stops the run, which is correct, but the two scopes after it are simply not
  measured rather than reported as unmeasured]`
- **Twelve earlier items are still owed**: v2.10's two, v2.09's three, v2.08's one,
  v2.07's two, v2.06's two, v2.05's four. `[open: this pass narrowed to one tool's failure
  message and touched no contract, no exporter and no corpus, so every one of them is
  exactly where the previous section left it]`

---

## v2.12 — the counts were updated in two steps, and only one of them was a command

### The two steps

`doc-counts.json` was written by `pnpm docs:counts`. The row in `docs/progress.md` was
written by a hand `str.replace` on a 7000-line file. The guard compares the row against the
snapshot, so **doing one without the other is green locally** and red only at the CI step
that runs `measure-doc-counts --check --from <report>`.

The two steps are not equally obvious. One is a command with a name; the other is a
transformation a person performs in an editor, and every pass in this log that added tests
had to remember it. Three of the last six passes got it wrong the first time, which is what
"remember to" looks like when measured.

### One command, one measurement, both files

```
pnpm docs:counts:write
  core  162 files, 3967 tests
  cli   4 files, 187 tests
  repo  166 files, 4154 tests
  written to golden-master/doc-counts.json and docs/progress.md (2 row(s) updated)
```

That is a real run on this tree. The diff it produced was **two lines** — `core` and repo —
because the `cli` row already carried `4 files, 187 tests` and its digits did not move.
Reporting that as three updated rows would be reporting a change the tool did not make.

Nothing is written until both writes can succeed. A failure between them would leave
exactly the half-state the flag exists to remove, so the document is rewritten in memory
first and both files are written after.

### Which rows are "current" is now one predicate, read twice

`check-doc-counts.mjs` refuses a row that claims to describe this commit and does not match
the measurement. `measure-doc-counts.mjs` rewrites the rows that claim it. If the two
disagree, the failure is silent in one direction and destructive in the other: a writer
whose predicate is too wide **edits a dated record** — the numbers a past pass measured,
which are supposed to differ — and a writer whose predicate is too narrow reports success
over a stale number.

So `CURRENT_MARKERS` and `scopeOf` moved into `scripts/doc-counts-vocabulary.mjs`, a data
module with no `main` and nothing to prove, read by both.

The `scopeOf` move was not cosmetic. The checker reads the scope from a row's label cell;
the first writer matched on `` `core` `` with backticks and therefore **skipped the `repo`
row**, whose label in this document is written without them. That version would have
updated two rows of three and printed success.

### The first live run refused, correctly

Against the shipped document it reported five lines and wrote nothing:

```
line 837: a current-state row names no scope: false as a description of the workflow's current state: …
line 3980: a current-state row names no scope: | `check-doc-counts` | refused the change first: pass 39's
           and pass 40's `as of this commit` rows were dated …
```

The predicate was "a line containing a current-state phrase". The *document* uses that
phrase in prose, in blockquotes, and in a change-log table that quotes it. So the rule is
narrowed to what the checker actually reads — **a table row that either names a scope or
publishes the count shape** — and a row that only quotes the phrase is left alone. A writer
that cannot tell a claim from a sentence about a claim edits sentences.

That regression is now a test, and the case that found it is the fixture: a change-log row
quoting `as of this commit` must survive untouched.

### Acceptance

| gate | result |
| --- | --- |
| the rewrite | 10 unit tests: three rows, digits only, idempotent, four refusals, marker wording, a quoting row |
| end to end | synthetic vitest reports; snapshot and document both written from one measurement |
| the half-state | a document with no current row writes **neither** file, and says so |
| contradiction | `--check --write-doc` exits 1 rather than picking a verdict |
| a live run | `pnpm docs:counts:write` on this tree: 2 rows moved, `cli` correctly untouched |
| `core` test suite | **162 files, 3967 tests passed** (as of `4ebcec791`) |
| `cli` test suite | **4 files, 187 tests passed** (as of `4ebcec791`) |
| repo test suite | **166 files, 4154 tests passed** (as of `4ebcec791`) |
| coverage | core **99.97 / 99.74 / 100 / 99.97**, cli **100 × 4** |
| gate sites | 65 across 39 scripts, `--check` OK |
| `typecheck` / `lint` / `docs:check` / 金标 / `official:check` | green |

### Open

- **Starting a new pass still means dating the old rows by hand.** `[open: the writer
  maintains "the rows that say they are current", and a new pass turns the previous pass's
  rows into a dated record -- which is an edit no tool can infer, because it is a statement
  about what that pass measured. Two lines per pass, and getting them wrong is caught by
  `check-doc-counts` on the next run]`
- **A red suite still blocks the write.** `[open: `--write-doc` takes its measurement by
  running the suite, so a red suite means no measurement and no write. That is correct --
  a count of what passed is meaningless for a failed run -- but it means the tool cannot
  repair the document when the document is what made the suite red. Escaping that needs the
  write to accept `--from <reports>`, which it already does; the tool does not say so when
  it refuses]`
- v2.11's two, v2.10's two, v2.09's three, v2.08's one, v2.07's two, v2.06's two, and
  v2.05's four are unchanged. `[open: this pass touched the counting tool and nothing else;
  each argument is where it was made]`

---

## v2.13 — the report carried a verdict, and nothing read it

### Two paths, one verdict, one reader

The spawn path knows a run failed because `execFileSync` throws. The exit code **is** the
verdict, and `parseSummary` never sees the summary line of a red transcript.

A report has no exit code. The verdict is *in* the record — `status: 'failed'` on a file,
`status: 'failed'` on an assertion — and `countsFromReports` did not read either. It read
only two things: whether a file said `passed` (to count files) and whether an assertion
said `passed` (to count tests). Both are the *right* readings of a green run. On a red one
they compose into a number nothing prints:

```
Test Files  1 failed | 1 passed (2)      →  files: 1
     Tests  20 passed | 3 failed (23)    →  tests: 20
```

That is the passing half of both lines at once: the failing file dropped from the file
count, its passing assertions kept in the test count. A file count that says almost nothing
ran, beside a test count that says twenty did.

### The tool contradicted itself

v2.11 taught the spawn path to say, in one sentence, that a red run has no count:

> A count is what passed; a failed run has no number to publish.

The report path, in the same file, published one. **One rule, two implementations, and the
untested one was the one that writes into the document** — `--write-doc --from <red report>`
put that number into `docs/progress.md` and printed success.

### A test asserted the arithmetic and never asked whether the number should exist

`measure-doc-counts-readings.test.ts` had this:

```ts
const editFailed = report('core', (parsed) => { parsed.testResults[0]!.status = 'failed'; });
expect(countsFromReports([editFailed, report('cli')]).core.files).toBe(0);
```

It is named "does not count a skipped assertion or a failed file as a pass", and it checks
exactly what the name says: the failed file is not counted as a file. It never asks what the
count is *for*. The test was green for eleven passes while the number it endorsed was
unpublishable, which is the same shape as v2.06's reader that could not see a `datetime`
field: **a check is only as good as the question it was written to answer.**

### What the refusal says

```
measure-doc-counts: FAILED
  the report at …/core.json records a failure, so it is not a measurement:
    packages/core/test/beta.test.ts
  A count is what passed; a failed run has no number to publish.
  What this function would produce is the passing half of vitest's `N failed | M passed`
  line -- the failing file dropped from the file count, its passing assertions kept in
  the test count -- which is a number neither reading prints.
  Fix the failure and take the measurement from a run that passed.
```

Both halves of the record are read, because either alone leaves a report that a person would
call red and this function would call counted: a file can say `passed` while carrying a
failed assertion, and a file can say `failed` while carrying none at all (a collection
error). A failing file is named **once**, and its assertions are not repeated — the file is
what someone opens. Assertions are named only when the file claims to have passed, which is
the one case where the file name alone points at something that does not look broken.
Duplicates are removed and the list is capped at five, as in the run diagnosis.

`COUNT_UNAVAILABLE` is now one exported constant, said by both paths, because they refuse
the same fact. Two copies of that sentence would drift the way the two readings did.

### The refusal also had to say what the flag is for

v2.12's open list ended with: *"the tool does not say so when it refuses"*. It does now, and
it had to be worded carefully, because `--from` is **not** a way around a failure — a report
of *this* run is refused. What it saves is the second 80-second run when a green one already
wrote its report:

```
If a green coverage run already wrote its report, `--from <report>[,<report>]` reuses that run instead of a second one:
  --from packages/core/node_modules/.cache/vitest-report.json,packages/cli/node_modules/.cache/vitest-report.json
```

The word *green* is load-bearing: it is the difference between advice and a workaround.

### Acceptance

| gate | result |
| --- | --- |
| a red file in a report | refused; the file named once, `COUNT_UNAVAILABLE` present |
| a red assertion in a file that says `passed` | refused; `file > fullName` named |
| list shape | capped at five, deduplicated, `fullName` / `title` / neither all named |
| `--check --from <red>` | exits 1 and does **not** print `is stale` or `OK (` |
| `--write-doc --from <red>` | exits 1, writes **neither** file, prints no `row(s) updated` |
| the old assertion | replaced by the refusal it should have been; the arithmetic it endorsed is named in the test |
| the diagnosis | names `--from`, the word `green`, and both report paths |
| `core` test suite | **162 files, 3974 tests passed** (as of `e6709c32b`) |
| `cli` test suite | **4 files, 187 tests passed** (as of `e6709c32b`) |
| repo test suite | **166 files, 4161 tests passed** (as of `e6709c32b`) |
| coverage | core **99.97 / 99.74 / 100 / 99.97**, cli **100 × 4** |
| gate sites | 65 across 39 scripts, `--check` OK |
| `typecheck` / `lint` / `docs:check` / 金标 / `official:check` | green |

The two readings were held against each other once more, on this tree: `pnpm docs:counts:write`
took 162/3974 from a spawned `pnpm test`, and `--check --from` read 162/3974 from the coverage
run's report. **They agree**, which is the only reason either number may be published.

### Open

- **Starting a new pass still means dating the previous pass's rows by hand.** `[open: the
  writer maintains "the rows that say they are current"; turning yesterday's into a dated
  record is a statement about what that pass measured, and no tool can infer it. Two lines
  per pass, and getting them wrong is caught by `check-doc-counts` on the next run]`
- **A red suite still blocks the write, and that is correct.** `[open: `--write-doc` takes
  its measurement by running the suite, so a red suite means no measurement and no write.
  `--from` lets a green report stand in for the run; nothing lets a red one, which is the
  point of this pass]`
- **`diagnoseRedRun` and the report refusal are two diagnoses with one sentence.** `[open:
  they share `COUNT_UNAVAILABLE` and nothing else -- the run names tests from a terminal
  transcript, the report names files from a record, and neither can produce the other's
  evidence. That is two implementations of one *claim* rather than of one rule, but it is
  the shape this campaign keeps finding, so it is recorded rather than declared safe]`
- v2.12's first item, and the fourteen items before it, are unchanged. `[open: this pass
  touched one function's verdict and the sentence next to it; every argument is where it
  was made]`

---

## v2.14 — the transcript was being guarded by its own layout

### The rule nobody wrote

A red vitest summary line reads:

```
Test Files  1 failed (1)
      Tests  2 failed | 19 passed (21)
```

The pattern this repository reads a transcript with is anchored on `Test Files` followed by a
number and then `passed`. On a red line the first number is the **failed** count, so the
pattern cannot match. A red transcript was therefore never counted.

**Nobody had written that rule.** The layout of the line was doing the guarding, which is the
same thing as saying there was no guard: nobody could point at it, nobody had tested it, and
the next person to relax the pattern would not know they were removing one.

Two defects were living behind it.

### The diagnosis was about the wrong thing

A red transcript fell through to `could not read <scope> counts … vitest may have changed its
summary format`. The counts were indeed unreadable, and the sentence sent the reader to look
at a version bump rather than at a failing test. A message is a hypothesis, and this one was
usually false.

### It only held for a line that was entirely red

```
 Test Files  1 passed (1)          ← matched, summed
      Tests  20 passed (20)
 Test Files  1 failed (1)          ← matched by nothing, invisible
      Tests  2 failed | 3 passed (5)
```

This returned `{files: 1, tests: 20}`. A transcript with one green block and one red block is
exactly what `pnpm test` produces when the first workspace passes and the second does not —
and that is **the same silent dropping `--from` was doing in v2.13, one format over**.

### Reachability, stated honestly

`measure()` never sees a red transcript today: `execFileSync` throws on the exit code before
the summary is parsed. So the shape above is unreachable **through this script's only caller**.

It is not unreachable in principle, because the exit code is a claim about a process, not a
fact about the output: a wrapper script, a `|| true`, a reporter that swallows the status, or
a caller that feeds captured output from an earlier run all break it. `parseSummary` is
exported and documented as *the* reading of a transcript, and the program it lives in already
had two other readers with their own verdicts.

So the reader got one. The end-to-end test in `measure-doc-counts-red-run.test.ts` puts a fake
`pnpm` on `PATH` that prints

```
 Test Files  1 failed (1)
      Tests  2 failed | 3 passed (5)
```

and **exits 0**. The script exits 1 anyway, having read the transcript and disagreed with the
process:

```
measure-doc-counts: FAILED
  the core transcript records a failing run, so it is not a measurement:
    1 test file(s) failed, 2 test(s) failed
  A count is what passed; a failed run has no number to publish.
  Take the measurement from a run that passed.
```

**The exit code is not the record**, and the reader that exists to read the record needs its
own opinion of it.

### The branch that could only be observed by exiting

`parseSummary` reported both of its failures with `fail()`, which ends the process. A refusal
that can only be observed by exiting is the shape finding 121 was written about — and it is
why the "could not read" message had never been asserted anywhere. Both refusals are thrown
now (`TranscriptRecordsFailures`, `MeasurementUnavailable`) and are driven directly by four
tests, including one that asserts a *negative*: the format sentence must not appear when the
transcript clearly says what happened.

### Acceptance

| gate | result |
| --- | --- |
| a red summary | refused, with the failed counts on their own line, and no format diagnosis |
| green block then red block | refused — it used to return the green half (`{1, 20}`) |
| no summary at all | still says the format may have changed, because that is when it is true |
| exit code 0, transcript red | the script exits 1 on the reader's verdict, not the process's |
| the shared sentence | `COUNT_UNAVAILABLE` is said by all three refusals; the two readers are asserted to be different mechanisms |
| `core` test suite | **162 files, 3979 tests passed** (as of `7d980bf4c`) |
| `cli` test suite | **4 files, 187 tests passed** (as of `7d980bf4c`) |
| repo test suite | **166 files, 4166 tests passed** (as of `7d980bf4c`) |
| coverage | core **99.97 / 99.74 / 100 / 99.97**, cli **100 × 4** |
| gate sites | 65 across 39 scripts, `--check` OK |
| `typecheck` / `lint` / `docs:check` / 金标 / `official:check` | green |

### Open

- **Three readers, one sentence, three mechanisms.** `[open: an exit code, a `status` field
  and a summary line are three different kinds of evidence, so the three refusals cannot share
  a body -- only the sentence and the conclusion. Sharing the sentence is what makes them
  recognisable as one rule; it does not make them one implementation, and this campaign has
  already been wrong once about which of two copies was the tested one]`
- **`skipped` is still not a failure and still not a count.** `[open: a run whose files are
  all skipped prints no `N passed` line, so it is refused as unreadable rather than counted as
  zero. That is the same answer by a different route, and it is not asserted anywhere]`
- **The rest of the open list is untouched.** `[open: v2.13's three, v2.12's first, and the
  fourteen before them; this pass changed one function's two refusals and the sentence they
  say]`

---

## v2.15 — a skipped file was subtracted, and a skipped suite was called a format change

### Three shapes, captured

Every line below came from this vitest, on a scratch project, rather than from memory. The
exit code is beside each, because it decides whether the reader ever sees it.

| shape | summary lines | exit |
| --- | --- | --- |
| one file, all `it.skip` | `Test Files  1 skipped (1)` / `Tests  3 skipped (3)` | **0** |
| one passing file, one file all skipped | `Test Files  1 passed \| 1 skipped (2)` / `Tests  2 passed \| 2 skipped (4)` | **0** |
| one passing test, one `it.todo` | `Test Files  1 passed (1)` / `Tests  1 passed \| 1 todo (2)` | **0** |

All three exit 0, so none of them is caught by an exit code — and all three reached this
repository's readers.

### What the readers did with them

**The whole-suite case was misdiagnosed.** `Test Files  1 skipped (1)` contains no
`N passed`, so it fell through to *"could not read the counts … vitest may have changed its
summary format"*. That sentence was written for a shape nobody had seen; a quarantined suite
is not a shape change, it is a decision somebody made in a `describe.skip`, and the message
sent the reader to the wrong file.

**The partial case was silently subtracted.** `Test Files  1 passed | 1 skipped (2)` matched
the `1 passed`, summed it, and returned one file. The skipped file vanished from a count that
claims to say how much of the suite passes — the second file was simply not in the number, and
nothing said so. `--from` agreed, because it reads the same record and a skipped file has
`status: 'skipped'`, which is neither a pass nor a failure.

That agreement is what made it invisible: **two independent readers producing the same wrong
number look like a cross-check.**

### The rule, decided once

A skipped test is not a pass, so it does not belong in the published count — the row says how
many tests *passed*, and `1 passed | 1 skipped (2)` has to read as one file. The defect was
never the arithmetic; it was that the arithmetic had no voice.

So:

- **A run in which nothing passed is not a measurement.** Zero is what an empty suite, a
  quarantined one and a suite that failed to be collected all report, and a published row
  cannot tell those three apart. Refused, on both readers, in one body with one differing
  word: `run` for a summary line, `record` for a `status` field.
- **A run in which something passed is measured**, and the amount skipped travels beside the
  number:

```
core  162 files, 3985 tests  (1 file(s) and 2 test(s) skipped, not counted)
```

That line prints only when there is something to say, so a count that moves because six tests
were skipped now has its reason on the same line — which is the difference between a number a
person can check and a number they have to trust.

### Three things the snapshot must not learn

`doc-counts.json` is a committed contract read by `check-doc-counts.mjs`, `--check` and the
document rewrite. The reader now returns a third key, and `serialise` chooses `{files, tests}`
explicitly rather than copying whatever the reader returned — so a diagnostic cannot change
the file's shape as a side effect. The end-to-end test asserts the written file has exactly
those two keys, and that the note appears once per scope on the terminal.

### One parser, not eight regexes

The first version of this pass added two more `matchAll` calls to the four already there: one
per status, per line. That is how the two readings of "a passing test" got born in v2.13 — the
same record read by parallel copies of one idea. `tally()` now scans a summary line once for
`N (passed|failed|skipped|todo)` and sums into one object, and the parenthesised total is
deliberately not read: it is the sum of the four terms that are.

### Acceptance

| gate | result |
| --- | --- |
| a fully skipped suite | refused as *passed nothing*, with the skip counts, and **no** format diagnosis |
| a partially skipped run | counted as what passed, with the skip counts carried beside it |
| a `todo` | counted as skipped, never as a pass |
| the report reader | refuses the same fact, says `record` instead of `run` |
| the snapshot | `{files, tests}` and nothing else, asserted by key list |
| the terminal | one note per scope, only when non-zero |
| `core` test suite | **162 files, 3985 tests passed** (as of `d888e3cc1`) |
| `cli` test suite | **4 files, 187 tests passed** (as of `d888e3cc1`) |
| repo test suite | **166 files, 4172 tests passed** (as of `d888e3cc1`) |
| coverage | core **99.97 / 99.74 / 100 / 99.97**, cli **100 × 4** |
| gate sites | 65 across 39 scripts, `--check` OK |
| `typecheck` / `lint` / `docs:check` / 金标 / `official:check` | green |

### Open

- **A skip is now reported, not prevented.** `[open: nothing stops a passing test from
  becoming `it.skip` -- the count drops, the guard calls it stale, and the note explains why.
  Whether the guard should *refuse* a drop that is entirely explained by skips is a policy
  question about whether quarantine may change a published baseline, and this repository has
  no answer in any document]`
- **The `0 passed` rule is per scope, and `repo` is a scope.** `[open: a fully skipped `cli`
  refuses `cli` and therefore `repo`, so `--write-doc` cannot run; that is the intended
  consequence, and it has not been exercised against a real two-package tree with one package
  quarantined -- only against synthetic reports]`
- **v2.14's and v2.13's items, and the fourteen before them, are unchanged.** `[open: this
  pass touched the reader's arithmetic and its two printed forms]`

---

## v2.15, addendum — the gate I ran could not fail

CI failed this pass on `lint:cold`, at `check-no-mock.mjs`:

```
  …/measure-doc-counts-readings.test.ts:89  // `it.skip` x3 in one file -- exit 0.
  …/measure-doc-counts-readings.test.ts:320  // in a `describe.skip`.
```

The guard scans every `.ts` under `packages/*/test` line by line for the skip tokens and does
not distinguish a comment from code. Two comments that *documented measured behaviour* read as
the behaviour itself.

The comments are reworded. But the part worth recording is why they were committed at all.

### What I was actually running

For this pass and several before it, the local gate was:

```sh
pnpm lint 2>&1 | grep -c FAIL
```

It printed `0` every time. `check-no-mock` does not print the word `FAIL` — on failure it says
`Mock / skip usage is not allowed:` and exits 1, and `pnpm` appends `ELIFECYCLE`. So the
number was zero because the string never occurs, not because nothing failed. **The check could
not fail**, and it certified ten passes of lint that it never looked at.

The correct gate is one line longer and says something:

```sh
pnpm lint >/dev/null; echo $?
```

This is the same defect this whole campaign is about, one level up: a predicate expressed in a
vocabulary the record does not use. Every other guard in this repository was checked against
the thing it claims to measure; the check *on* those guards was a grep for a word, run by hand,
recorded as "green".

### What caught it

CI, which runs the exit code. That is the second time in ten passes that the remote job
reported something a local run had already "verified" — v2.08 was the first, and its
counterpart was a suite that never ran the verifier.

### Not fixed here

- **`check-no-mock` still reads comments as code.** `[open: the alternative is a comment
  stripper in front of the scan, and a commented-out skip is arguably dead code that the guard
  is right to refuse. What it costs is that a test cannot explain a skip in its own words --
  the explanation has to live somewhere the guard does not read, which is why the captured
  shapes are documented in the script instead]`
- **The verification recipe is still prose.** `[open: nothing in the repository states how to
  check a change locally, so each pass invents one -- this pass invented a broken one. A
  `verify:local` target would give one exit code and would also be a second copy of CI's step
  list, which is the kind of duplicate this log keeps finding; the honest form of it has not
  been designed yet]`

---

## v2.16 — how to check a change here is now a command, and it reads the workflow

### What the last pass left

F-82's second half: *"nothing in the repository states how to check a change locally, so each
pass invents one -- this pass invented a broken one."* The obvious repair, a `verify:local`
script listing the commands, is a **second copy of `ci.yml`**, and a copy drifts: the day a gate
is added to the workflow, the copy keeps saying green. That is the same defect one turn further
out.

So the commands are not written down anywhere. They are **read out of `ci.yml`**, and the only
hand-written thing is the one thing that cannot be derived:

```
verify:local — 36 of 43 run steps can run here

  local   verify / Build (core then cli; cli resolves core's dist)
  local   verify / Test with coverage (core + cli, ≥95% per dimension, 100% functions)
  …
  remote  verify / Install a backend this repository did not write
          installs prometheus through apt and binds a port
  remote  batteries / Publish the gate-test battery report
          writes to a GitHub artefact/annotation, which needs the run token
```

`pnpm verify:local` runs 31 distinct commands covering those 36 steps, in CI order, and stops at
the first failure with the step's name and its command. Commands that appear in several jobs —
`pnpm install`, `pnpm build` — run once; a second identical command on one machine proves nothing.

### The table is the artifact, and it is checked four ways

`scripts/gate-steps.mjs` holds `STEP_PLAN`: one entry per `run:` step, `local` or
`remoteOnly: "<reason>"`. `gate-steps.test.ts` holds it against the workflow:

| rule | what it prevents |
| --- | --- |
| every `run:` step has an entry | a gate added to CI and silently missing from the local plan |
| every entry has a step | a renamed step leaving the plan quietly |
| every `remoteOnly` reason is ≥ 40 characters | "needs a runner" as a reason |
| every `uses:` is one of four setup actions | a gate hidden in an action, which the plan cannot see |

The last one was not in the first draft and is the one worth keeping: **a `uses:` step is not
classified by the table, so an action that decided something would be invisible to it.** The
closed list of four — checkout, node, pnpm, artefact upload — is what makes "no gate is an
action" checkable rather than assumed.

### A closed list that closed itself

Writing the table by hand, five keys came out truncated — `…(no survivors, no inert, no
misattributed)` for a step whose name continues `mutations`. The validator reported all five as
a pair: *"no plan entry"* and *"in the plan, but no such step exists"* — the same wrong key seen
from both sides. That is exactly the class of error the table exists to catch, and it caught it
before the file was ever committed.

### The two exits that had no test

`verify-local.mjs` has three failures: the plan does not match, the filter selects nothing, and
a step fails. The second is easy. The other two need a workflow that differs from the shipped
one, and a test may not edit `ci.yml` to observe a branch.

`RCA_CI_WORKFLOW` is the answer, and it is not a testing hook: checking a workflow edit before
pushing is `RCA_CI_WORKFLOW=/tmp/ci.yml pnpm verify:local --list`. With it, both branches are
driven by **the shipped workflow with one thing changed** — a renamed step, and a command
replaced by `exit 3`. Same shape as `golden-master/verify.mjs --expected`.

### CI found the one thing this pass got wrong, and it was the shape of the fix

The first push failed at `Every gate can be shown to fail`:

```
UNATTRIBUTED  verify-local.mjs  exited 1 and named no failing test
```

That harness hollows each gate with `process.exit(0)` and requires a *named* failing test. The
gate was hollowed, `gate-steps.test.ts` failed -- but the test **imported** the hollowed module,
so the vitest worker died at import and vitest reported a crashed file, not a failing test.

The fix is a rule worth keeping: **a module that can be hollowed must not be a module a test
imports.** `runSteps` and `describePlan` moved to `gate-steps.mjs`, which has no exit and
therefore is never a subject of that harness; `verify-local.mjs` is now imported by nothing and
only spawned. Hollowed, the spawns return 0 where the tests require 1, and five tests fail by
name. Verified by doing exactly that to the file and restoring it byte-for-byte.

A crashed worker is not a verdict, and the harness was right to say so.

### Where the tool immediately paid for itself

Two spot runs, on this tree:

```
$ node scripts/verify-local.mjs --only "Documentation guards"
  … gate-sites.json is stale: scripts/verify-local.mjs:123 …
verify:local: FAILED at 1/2
  step:    artefacts / Documentation guards are satisfied
  command: pnpm docs:check
```

That is a real failure, in this pass's own files, found by a command rather than by a grep —
which is precisely what the previous pass did not have.

### Acceptance

| gate | result |
| --- | --- |
| the plan | 56 steps read, 43 with `run:`, 36 local, 7 remote-only, 0 errors |
| the commands | 31 distinct, in CI order, deduplicated |
| all four validator rules | driven by 29 tests, including a synthetic workflow per parser shape |
| the three exits | all driven: plan mismatch, empty selection, failing step |
| `verify:local --list` | prints every step and every reason |
| `gate-sites` | 68 sites across 40 scripts, 68 annotated, `--check` OK |
| `core` test suite | **163 files, 4014 tests passed** (as of `5647737e5`) |
| `cli` test suite | **4 files, 187 tests passed** (as of `5647737e5`) |
| repo test suite | **167 files, 4201 tests passed** (as of `5647737e5`) |
| coverage | core **99.97 / 99.74 / 100 / 99.97**, cli **100 × 4** |
| `typecheck` / `lint` / `docs:check` / 金标 / `official:check` | green, by exit code |

### Open

- **A green local run is not a green CI run, and the tool says so rather than fixing it.**
  `[open: seven steps need a runner, and no amount of local work will run them. The plan prints
  them every time, with reasons, which is the honest form -- but "verify:local passed" will
  still be quoted by someone as "CI will pass", and nothing in the output stops that reading]`
- **`remoteOnly` is checked for length, not for truth.** `[open: a 60-character reason that is
  wrong passes. The only defence is that seven entries are few enough to read, and the test
  asserts the count is stable at seven -- adding a step that "needs a runner" for a lazy reason
  would move that number and be visible in a diff]`
- **The plan covers the workflow, not the workflow's `if:` conditions.** `[open: no step in
  ci.yml is conditional today; the day one is, the plan will claim to run something CI skips,
  and the parser will not notice because it does not read `if:`]`
- **v2.15's four items and the fifteen before them are unchanged.** `[open: this pass added a
  tool and its table, and touched no guard, no exporter and no corpus]`

---

## v2.17 — the plan read three keys and stepped over seven

### What the previous pass could not see

`readWorkflow` looked for `run:` and `uses:` inside a step block and ignored every other key.
The shipped workflow has thirteen `with:`, two `if:` and one `env:` — and the reader noticed none
of them.

Two of those three matter, and one nearly did:

- `if: always()` on **Publish the gate-test battery report** and on **Upload** — both outside the
  local plan, so the ignore was harmless *by luck*.
- `env: GITHUB_TOKEN: …` on the publisher — also outside the plan.

The failure mode was one edit away. `if:` on a step marked local would have made `verify:local`
report `[4/31] verify / Something` for a step CI skips on most runs, and nothing in the output
would have said so. **A key that is not read is not absent; it is unchecked.**

### Read, tolerate, or refuse — and no fourth case

`STEP_KEYS` now states what this reader does with each key, and `LOCAL_INCOMPATIBLE` names the
ones that change *whether*, *where* or *with what* a command runs:

| key | on a local step |
| --- | --- |
| `if:` | refused — the condition decides whether the step runs at all |
| `env:` | refused — the runner does not reproduce the environment |
| `shell:` | refused — the runner always uses `sh -c` |
| `continue-on-error:` | refused — a failure that does not fail the job, read here as a failure |
| `working-directory:` | refused — the runner always uses the repository root |
| `with:` | refused on a `run:` step, which GitHub does not allow either |

The same keys are **tolerated on a step that does not run here**, because there they cannot make
the claim false — and the tolerance is now *printed*:

```
  2 step(s) outside the plan carry a key this runner does not reproduce:
    batteries / Publish the gate-test battery report — if, env
    batteries / Upload the gate-test battery report — if
```

Ignoring and tolerating look identical in a diff. One of them is a decision and the other is a
gap, so the plan says which.

Two keys are tolerated anywhere, for a stated reason: `id:` is a name, and `timeout-minutes:` is a
resource bound — a step that is slower on this machine still fails in the same way.

An unknown key is an error. `strategy:` today means a matrix, and a matrix would make "the plan"
mean several runs; the reader says it does not know rather than guessing it is harmless.

### The tolerance is used, which is how it was tested

A rule that permits something the tree never does is a rule nobody has exercised. The shipped
workflow carries `if:` twice, both outside the plan, so `gate-steps.test.ts` asserts exactly that:
those two keys, those two steps, and that neither appears among the local ones. If one of them
ever became local, the shipped-plan test fails before CI does — which is what a plan is for.

### Acceptance

| gate | result |
| --- | --- |
| the ten key rules | each driven both ways: refused on a local step, tolerated on a remote one |
| unknown key | refused, with the key named |
| `with:` on `run:` | refused; `with:` on `uses:` kept |
| the shipped plan | 0 errors, 2 tolerated conditionals named in `--list` |
| `gate-steps.test.ts` | **46 tests** |
| `core` test suite | **163 files, 4031 tests passed** (as of `079c4bf00`) |
| `cli` test suite | **4 files, 187 tests passed** (as of `079c4bf00`) |
| repo test suite | **167 files, 4218 tests passed** (as of `079c4bf00`) |
| coverage | core **99.97 / 99.74 / 100 / 99.97**, cli **100 × 4** |
| gate sites | 68 across 40 scripts, `--check` OK |
| `typecheck` / `lint` / `docs:check` / 金标 / `official:check` | green, by exit code |

### Open

- **A tolerated key is checked for presence, not for meaning.** `[open: `if: always()` and
  `if: github.ref == 'refs/heads/main'` are both "a condition", and both are refused on a local
  step -- but on a remote-only one the difference is invisible. That is acceptable while the only
  tolerated conditions are `always()`, and it stops being acceptable the first time one is not]`
- **The runner still cannot honour any of the five.** `[open: each refusal offers two repairs --
  make it remote-only, or teach the runner the key. Teaching it `working-directory` is a `cwd`
  per command and teaching it `shell` is a shell per command; neither is hard, and neither has a
  caller today. Building them before there is a step that needs them would be inventing a
  feature to satisfy a test]`
- **`timeout-minutes:` is tolerated without being enforced.** `[open: a step that hangs locally
  hangs for as long as the machine allows, where CI would kill it. The tolerance is about the
  verdict, not about the wall clock, and the distinction is now written down but not tested]`
- **v2.16's three items and the nineteen before them are unchanged.** `[open: this pass touched
  the reader's key handling and the plan's printed form]`

---

## v2.18 — the plan tolerated `if:` by its name, not by its value

### The gap the previous pass recorded

v2.17 ended with this open item, verbatim:

> **A tolerated key is checked for presence, not for meaning.** `if: always()` and
> `if: github.ref == 'refs/heads/main'` are both "a condition", and both are refused on a local
> step. On a remote-only step the difference is invisible.

That is a statement about the plan's *claim*, so it has an answer that is not a policy choice.

The plan says of every step it does not run: **"did not run: X — needs prometheus."** For that
sentence to be true, needing prometheus has to be *the* reason. A branch filter makes it part of
the reason: the step also does not run on a pull request. `always()` does not — it only widens
when a step runs ("even after a failure"), so it cannot make a reason incomplete.

So the rule is one line, and it is about direction: **a condition may be tolerated only if it
widens.** `always()` widens; `success()`, `failure()`, a branch filter and an event filter all
narrow.

### What changed

`readWorkflow` now records each key's inline value, not just its name — one string per key, and
the only key whose value is read is the one where it matters. `conditionOf` normalises the two
spellings GitHub accepts, `always()` and `${{ always() }}`, so the plan does not pass or fail on
whitespace.

A step outside the plan carrying `if:` is now accepted only when the value normalises to
`always()`; anything else is refused with the text quoted back:

```
verify / Gate: `if: github.ref == 'refs/heads/main'` is a condition this plan cannot describe.
Only `always()` can be tolerated on a step outside the plan, because it is the one condition
that widens when a step runs rather than narrowing it
```

A *local* step carrying `if:` is still refused, and by the other message — `runSteps` stops at
the first failure, so a step that runs regardless would not run at all. Two objections, two
messages, and a test asserts which one appears where.

The tolerated line in `--list` now shows the value rather than the key:

```
    batteries / Publish the gate-test battery report — if (always()), env
    batteries / Upload the gate-test battery report — if (always())
```

`if` alone would have said *that* something was tolerated. `if (always())` says what.

### Acceptance

| gate | result |
| --- | --- |
| `always()` and `${{ always() }}` | tolerated on a step outside the plan |
| any other condition | refused, quoted, on a run step and on an action |
| a block-scalar condition | refused — `\|` is not `always()` |
| `always()` on a local step | refused by the *local* rule, not the condition rule |
| the shipped workflow | two tolerated conditions, both `always()`, asserted by value |
| `gate-steps.test.ts` | **51 tests** |
| `core` test suite | **163 files, 4036 tests passed** (as of `1bcaa28`) |
| `cli` test suite | **4 files, 187 tests passed** (as of `1bcaa28`) |
| repo test suite | **167 files, 4223 tests passed** (as of `1bcaa28`) |
| coverage | core **99.97 / 99.74 / 100 / 99.97**, cli **100 × 4** |
| gate sites | 68 across 40 scripts, `--check` OK |
| `typecheck` / `lint` / `docs:check` / 金标 / `official:check` | green, by exit code |

### Open

- **`env:` is still tolerated by presence, and its value is a secret.** `[open: the publisher
  carries `GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}`, and the plan records only that `env:`
  exists. Reading it is not the point -- the point is that no `env` value can make "needs the
  run token" incomplete, and that argument is written in the code rather than tested]`
- **A condition on an action is refused, though an action is not a gate.** `[open: the same
  strictness is applied to `uses:` steps, where a narrowed condition cannot make any claim false
  -- upload-artefact runs conditionally today and the plan says so. The cost is that a future
  `if:` on an action needs a plan entry that does not exist, which will look like an obstacle]`
- **v2.17's other two items and the twenty-two before them are unchanged.** `[open: the runner
  still cannot honour `working-directory`, `shell`, `env`, `continue-on-error`; `timeout-minutes`
  is still unenforced]`

## v2.19 — the runner said `sh -c`, and the reader stopped at the command

### What the previous pass recorded

v2.18's Open list ended with this, and it had been carried unchanged for four passes:

> **v2.17's other two items and the twenty-two before them are unchanged.** `[open: the runner
> still cannot honour `working-directory`, `shell`, `env`, `continue-on-error`;
> `timeout-minutes` is still unenforced]`

The entry was accurate and the diagnosis inside it was not. It reads as a list of five
things the runner is too primitive to do. Two of them were not that at all — they were one
thing the runner did *wrong*, and one thing the reader could not see.

### The default the runner had been choosing

`verify-local.mjs` ran every step as `execFileSync('sh', ['-c', command])`, from a comment
that defended `-c` against re-parsing shell text — a correct argument for `-c` that
silently also chose `sh`. GitHub chooses neither: a `run:` body is written to a file and
given to `bash --noprofile --norc -eo pipefail {0}`. Where `/bin/sh` is dash — Debian,
Ubuntu, every GitHub runner — those are different programs. No `pipefail`, no `[[ ]]`, no
`$BASH_VERSION`.

So the plan's sentence about each local step, *"verify:local ran this step"*, was true of a
run that CI would have performed differently. Every shipped step happens to be
dash-compatible, which is why nothing ever failed; that is luck, and a default nobody states
is a default nobody can review. `--list` now prints it, with the number of steps that
override it:

```
verify:local — 36 of 43 run steps can run here
  each command runs from the repository root under `bash --noprofile --norc -eo pipefail {0}`; 0 of 36 override either
```

### The reader stopped at the command

`readWorkflow` collected a step's keys and `break`-ed on `run:` and on `uses:`. Anything
written below the command was invisible — and `working-directory:` is written below the
command in GitHub's documentation and in most workflows alive. So even a runner that *had*
honoured the key would have read nothing to honour: the value never reached `classify`.

This was found by writing the first end-to-end test for the new key and watching it fail for
the wrong reason. The fixture inserted `working-directory:` after `run:`, exactly as
documented, and the plan came back with no directory at all. The reader's silence had been
correct-by-accident for three passes because the shipped workflow writes `if:` and `env:`
*above* `run:`, and `with:` below `uses:` was likewise invisible.

Both `break`s are now `continue`. The body of a block scalar cannot be mistaken for a key —
it is indented ten spaces and the key pattern is anchored at exactly eight — and there is now
a test for that too, because it is the reason the loop may continue at all.

### What `shell:` and `working-directory:` mean now

Both are read, carried onto the step, and executed:

| `shell:` | meaning |
| --- | --- |
| absent | `bash --noprofile --norc -eo pipefail {0}` |
| `bash` / `sh` | GitHub's own mapping |
| a template of `bash`/`sh` with exactly one `{0}` | that argv, `{0}` replaced by the materialised script |
| `python {0}`, `pwsh …`, a `{0}` count ≠ 1 | refused, quoting the value, naming remote-only as the way out |

`{0}` is a path, so the body is written to a file (`mode 0o700`, removed in a `finally`) and
the interpreter is started on it. That is also what makes `$0` a path rather than `bash`, and
the test uses `$0` for exactly that reason.

`working-directory:` is normalised before it is checked — `packages/../../outside` and
`../outside` are the same directory and only one spelling looks like an escape — and an
absolute path is refused, because a directory this repository does not contain is a directory
the plan cannot describe.

### The bug the fix would have introduced

`localCommands` deduplicated by command text. With a directory in the entry, `pnpm lint` in
`packages/core` and `pnpm lint` in `packages/cli` are one entry: the second never runs and its
step is reported as done by the first. The identity is now `(cwd, shell, text)`, and three
tests hold it — different directories do not collapse, different interpreters do not
collapse, the same command in the same place still does.

### The defect the acceptance run found

The first full-suite run of this pass did not fail on any of the above. It failed in
`gate-test-battery-attribution.test.ts` with a Python traceback:

```
FileNotFoundError: 'scripts/.probe-figures-harness-type-miss.mjs'
  in guard -> left = [e["path"] for e in record["entries"] if _digest(...) != e["sha256"]]
```

`_witnesses.guard()` records whole subtrees, so a killed battery can be repaired, and digests
every recorded path at a normal exit. `type-miss-probe.test.ts` writes a harness with that name
into `scripts/` for the length of one probe and removes it in a `finally`; a battery that started
in that window recorded it, and the file was gone by the time the check ran. Two separate wrongs:

- **a vanished file is a difference, not an error.** The Node half of the same mechanism
  (`journal.mjs`) has always asked `existsSync` first — one rule, two implementations, and the one
  that reports was the one without the check. It now says `gone` or `changed`, and the message names
  the files with their reason (first five), because a count cannot be looked at and the two reasons
  have opposite repairs. The Node half was taught the same distinction;
- **a dotfile is not part of the tree.** Recording one means a kill-repair resurrects it and a
  normal exit calls its deletion a difference. `derive-gate-sites.mjs` adopted this rule first;
  the journal now says it too, on both sides.

Two tests, both failing before the fix: a recorded file that is deleted is reported by name with
no traceback, and `_guarded_files` over a tree containing `.hidden.mjs` and `.hidden-dir/inside.mjs`
returns only the visible file.

It is worth naming the shape: the thing that found the last two defects was **the run**, not the
reading, and this time the defect was in the machinery whose job is to explain a red run. A check
that assumes its own premise stops speaking exactly when the premise is false.

### The split that went red, and why the log keeps it

This pass landed as two commits: the journal guard first, then the runner and this document. The
first one is **red in CI**, at exactly one step -- `Published suite counts, read from that run
rather than taken again` -- and the reason is not a defect in what it changes. It adds two tests
and does not move the measurement: `golden-master/doc-counts.json` and the rows in this document
marked *as of this commit* are pinned to the tree that publishes them, so a commit that adds tests
without carrying the number is a commit whose own gate disagrees with it.

The second commit is green because it carries the numbers, and the log keeps the first one instead
of being rewritten. Two reasons. The history is the record, and rewriting it would delete the
evidence of a real invariant: **the measurement moves with the tests, in the same commit**. And the
invariant is satisfiable at every commit -- v2.18's rows were already converted to *as of
`1bcaa28`* in the second commit, which is what an intermediate commit would have had to do for
itself. The cheap way to be sure is one commit per pass, which is what every earlier pass did and
what this one did not.

### Acceptance

| gate | result |
| --- | --- |
| default interpreter | CI's own, stated in `--list`, asserted by value |
| `shell:` | named, templated, quoted; foreign interpreters and wrong `{0}` counts refused |
| `working-directory:` | inside the tree only; absolute and escaping paths refused |
| keys below the command | read; a block scalar's body is not |
| `LOCAL_INCOMPATIBLE` | **5 → 3**, and a test says which three and why |
| dedup identity | `(cwd, shell, text)`; three tests |
| proven by asking the process | `pwd`, `$BASH_VERSION`, `$0` — three end-to-end spawns |
| `gate-steps.test.ts` | **69 tests** (51 before) |
| journal guard | a vanished file is a named difference; dotfiles are not recorded (2 tests) |
| the split commit is red | yes, and recorded below: it adds tests without moving the measurement |
| `core` test suite | **163 files, 4056 tests passed** (as of `6d0900d`) |
| `cli` test suite | **4 files, 187 tests passed** (as of `6d0900d`) |
| repo test suite | **167 files, 4243 tests passed** (as of `6d0900d`) |
| gate sites | 68 across 40 scripts, `--check` OK (three line numbers moved) |
| `typecheck` / `lint` / `docs:check` | green, by exit code |

### Open

- **`env:` is still tolerated by presence, and its value is a secret.** `[open: the publisher
  carries `GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}` and the plan records only that `env:`
  exists; the argument that no env value can make "needs the run token" incomplete is written
  in the code and not tested, and the value is a secret this runner does not have]`
- **`continue-on-error:` is refused on a local step, which is the strictest reading.**
  `[open: a local step could be run and its failure reported as a note rather than a stop, and
  that is a small change to `runSteps`; it is not made here because no shipped step uses the
  key, and honouring it would give the runner a second notion of "failed" with nothing
  exercising it]`
- **`timeout-minutes:` is still tolerated and unenforced.** `[open: a step that hangs hangs
  here for as long as the terminal is patient, where CI would kill the job; enforcing it means
  a timer around a child process and a decision about what part of a step's output survives]`
- **`if:` on a local step is still refused rather than honoured.** `[open: `runSteps` stops at
  the first failure, so `always()` would have to change the loop's shape rather than its
  arguments; the shipped workflow has no such step, so the change would be exercised by its
  fixtures alone]`

## v2.20 — `env:` was a key-level refusal, and the values had never been read

### What the previous pass recorded

v2.19's Open list opened with this:

> **`env:` is still tolerated by presence, and its value is a secret.** `[open: the publisher carries
> `GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}` and the plan records only that `env:` exists; the
> argument that no env value can make "needs the run token" incomplete is written in the code and
> not tested]`

It is a good argument about the wrong question. It asks whether an environment value can make a
step's *reason for not running here* incomplete — a question about steps that do not run. `env:` was
also blocking steps that **could**: the key was in `LOCAL_INCOMPATIBLE`, so any step carrying it was
refused whatever it carried.

Two steps, same key, opposite answers:

| the step declares | the runner |
| --- | --- |
| `NODE_OPTIONS: --max-old-space-size=4096` | can pass it to the child exactly as written |
| `GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}` | has no secret and no run context to evaluate it |

**The difference is in the value.** The list was about keys.

### What the reader could not do yet

`env:` is the one key whose value is a **map**, so it is the only key not written on its own line.
The reader had to learn to collect it — and the block is ten spaces deep, which is exactly how deep
a `run:` body is. What separates them is **which key opened the block**, and there is a test that
puts `env:` immediately above `run: |` and checks that both survive.

A line at the block's depth that is not `NAME: value` is either the end of the block or an entry the
reader cannot name. Only the second is an error, and it is an error rather than a skip: a silently
dropped variable is a command that runs with an environment the workflow does not describe.

The flow spelling is refused rather than split on commas — `${{ join(x, ', ') }}` contains one:

```
verify / Gate: `env: {A: b}` is the flow spelling, which this reader does not parse: splitting it
on commas would cut an expression that contains one. Write it as a block, one `NAME: value` per line
```

### The list is now two, and both are about control flow

`LOCAL_INCOMPATIBLE` went five → three → **two** over two passes:

| key | why it cannot be carried |
| --- | --- |
| `if:` | decides *whether* the step runs, and `runSteps` stops at the first failure |
| `continue-on-error:` | means a failure is not a failure — the distinction the runner exists to report |

Interpreter, directory and environment all turned out to be **values** the runner either has or does
not, and all three left the list by being read. Each time the same sentence applied: the claim was
*incomplete*, not false.

### The identity, third time

`localCommands` deduplicated on `(cwd, shell, text)`. `pnpm test` under `NODE_ENV=test` and under
`NODE_ENV=production` are the same bytes and different runs, so the environment joined the tuple —
compared **sorted by name**, because two steps that declare the same pair in two orders are one run
and `JSON.stringify` of two differently-ordered objects is two strings.

Three identities in three passes, each one a fact that had been true-when-added and false-by-default:
text, then `(cwd, shell)`, now `(cwd, shell, env)`. The tuple is written out rather than grown field
by field because that is the shape the last two mistakes share.

### Proven by asking the child

The claim is about a child process's environment, so the child is asked. The fixture declares
`RCA_PROBE_GREETING: hello from the workflow` and runs `printf '%s' "$RCA_PROBE_GREETING" > <marker>`;
the marker is compared against the declared value. A runner that passed nothing would produce the
empty string, and the failure would name the value rather than a map.

### Acceptance

| gate | result |
| --- | --- |
| block `env:` | read; quoted scalars unwrapped |
| flow `env:` | recorded and refused, with the spelling that works |
| a literal value | carried onto the step, passed to the child, proven by the child |
| a `${{ … }}` value | refused on a local step, quoting the entry |
| outside the plan | tolerated, mentioned only when it is not reproducible |
| `LOCAL_INCOMPATIBLE` | **3 → 2**, both about control flow, asserted by name |
| dedup identity | `(cwd, shell, env-sorted, text)`; two tests |
| `--list` | `0 of 36 override the shell, the directory or the environment` |
| `gate-steps.test.ts` | **80 tests** (69 before) |
| `core` test suite | **163 files, 4067 tests passed** (as of `6808449`) |
| `cli` test suite | **4 files, 187 tests passed** (as of `6808449`) |
| repo test suite | **167 files, 4254 tests passed** (as of `6808449`) |
| gate sites | 68 across 40 scripts, `--check` OK (three line numbers moved again) |
| `typecheck` / `lint` / `docs:check` | green, by exit code |

### Open

- **`continue-on-error:` is still refused on a local step, which is the strictest reading.**
  `[open: a local step could run and report its failure as a note, which is a small change to
  `runSteps`; it is not made because no shipped step uses the key, so honouring it would give the
  runner a second notion of "failed" with nothing exercising it]`
- **`timeout-minutes:` is still tolerated and unenforced.** `[open: a step that hangs hangs here for
  as long as the terminal is patient, where CI would kill the job; enforcing it means a timer around
  a child process and a decision about what part of a step's output survives]`
- **`if:` on a local step is still refused rather than honoured.** `[open: `runSteps` stops at the
  first failure, so `always()` would change the loop's shape rather than its arguments; the shipped
  workflow has no such step, so the change would be exercised by its fixtures alone]`
- **A step may still declare an environment the *shell* overrides.** `[open: a literal `env:` entry
  is passed through, and a command that then runs `export FOO=bar` changes it for its own children
  only; that is the command's business, not the runner's, but nothing says so in the plan's output]`

## v2.21 — the budget was in the workflow and the runner could not be stopped

### What the previous pass recorded

v2.20's Open list carried this, unchanged since v2.16:

> **`timeout-minutes:` is still tolerated and unenforced.** `[open: a step that hangs hangs here
> for as long as the terminal is patient, where CI would kill the job; enforcing it means a timer
> around a child process and a decision about what part of a step's output survives]`

The entry was honest about the gap and wrong about where the bound was. It reads as though the
workflow says nothing and the runner would have to invent a budget. The workflow says it four
times — 15, 30, 15, 20 — and one of them carries its own reason:

```yaml
    # Not a performance assertion: a job that hangs has to be reported as a budget
    # being spent rather than six hours later.
    timeout-minutes: 15
```

`readWorkflow` had never looked at a job-level key. It read `  job:` to know which job it was in
and `- name:` to find steps; a key at four spaces was passed over in silence. **Third pass in a
row where the field was in the file and not in the reader**, after `working-directory:` below
`run:` and `env:`'s map.

### Job keys are classified now

| class | keys |
| --- | --- |
| read | `timeout-minutes` |
| tolerated | `name`, `runs-on`, `needs`, `permissions`, `steps` |
| refused | `strategy`, `defaults`, `env`, `container`, `services` |
| tolerated only as `always()` | `if` |

The five refusals are one argument: each changes *what* runs rather than *where*. A matrix
multiplies the job; `defaults.run` rewrites the shell and directory of every step; a job-level
environment applies to every step and is not collected; a container and a service are another
machine. An unknown job key is an error with the same message it gets at step level.

### What enforcing it costs

A `run:` body is not one process: `pnpm test` starts vitest, which starts workers. Killing the
process that was spawned would leave them running and the terminal busy — the failure the bound
exists to prevent. So the child is spawned `detached` (its own group), the bound expires into
`SIGTERM` to the group, and `SIGKILL` two seconds later.

`detached` hides the child from the terminal, so Ctrl-C no longer reached it. A runner that
swallowed the operator's interrupt would be worse than one with no bound, so `SIGINT`/`SIGTERM`
are forwarded to the group and an `exit` handler sweeps it. The loop had to become **async** for
that to be possible at all: a blocking `spawnSync` cannot forward a signal while it blocks.

### A third verdict

A step that ran past its bound is not a step that failed. The repair differs, so the difference
travels in the result (`timedOut`), and `failureReport` prints it:

```
verify:local: TIMED OUT at 3/31
  step:    batteries / Doc-count shape battery
  bound:   30m, set on batteries / Doc-count shape battery
  command: pnpm inject:doc-counts
```

`failureReport` is pure and lives in `gate-steps.mjs` because **the branch cannot be reached from
the CLI without waiting fifteen minutes**, and a branch reachable only by waiting is a branch
nobody exercises. The CLI calls the function; the test hands it the shape a timeout produces.

### The seam had to move

`runCommand` lived in `verify-local.mjs`, which `verify-gates-are-testable.mjs` hollows out — so
no test may import it, and the one piece of logic worth testing sat inside an untestable file.
The runner is now `scripts/step-process.mjs`, driven by `step-process.test.ts` against real
processes, and registered in `scripts-are-classified.test.ts` as a `data` module. The tests use a
**400-millisecond** bound: the conversion from minutes happens where the plan is built, so the
runner has one unit and no test waits a minute to check a kill.

### The bound does not join the identity

`localCommands` deduplicates on `(cwd, shell, env, text)`. Adding the budget would run `pnpm build`
four times — once per job — to save nothing, so the entry takes the **tighter** bound of the steps
it stands in for and records which step supplied it. That is also the correct bound: CI runs both,
and the one that fails first is the one the local run replaces.

### Acceptance

| gate | result |
| --- | --- |
| job-level keys | read; the five that change what runs are refused |
| `timeout-minutes` | inherited, narrowable, whole minutes only |
| a bound it cannot compute | refused on a local step, tolerated outside the plan |
| enforcement | the **group**: SIGTERM, then SIGKILL after 2s |
| the operator's interrupt | forwarded, because `detached` hides it |
| the verdict | `TIMED OUT` with bound and owner; `FAILED` without either |
| `--list` | `each command is bounded by timeout-minutes: — 15m to 30m here` |
| `gate-steps.test.ts` | **101 tests** (80 before) |
| `step-process.test.ts` | **8 tests**, against real processes -- one of them sends a signal |
| `core` test suite | **164 files, 4096 tests passed** (as of `efa8bd3`) |
| `cli` test suite | **4 files, 187 tests passed** (as of `efa8bd3`) |
| repo test suite | **168 files, 4283 tests passed** (as of `efa8bd3`) |
| gate sites | **69** across 40 scripts, `--check` OK |
| `typecheck` / `lint` / `docs:check` | green, by exit code |

### Open

- **A step can still be killed for the wrong reason.** `[open: the bound is the job's, and a job's
  bound is a budget for *all* its steps together -- `verify` has 15 minutes for build, types,
  lint, coverage and mutation. Applying 15 to each step locally is more generous than CI, so a
  local run can pass where CI would have spent the budget; modelling the job budget as a pool is a
  larger change than this pass, and no shipped step is near its bound]`
- **`continue-on-error:` is still refused on a local step.** `[open: a local step could run and
  report its failure as a note, which is a small change to the loop; it is not made because no
  shipped step uses the key, so honouring it would give the runner a second notion of "failed"
  with nothing exercising it]`
- **`if:` on a local step is still refused rather than honoured.** `[open: the loop stops at the
  first failure, so `always()` would change its shape rather than its arguments; no shipped step
  has one, so the change would be exercised by fixtures alone]`
- **One full-suite run died in a way this pass could not explain.** `[open: the first coverage run
  after the timeout work reported seven files failing at *collection* with `STACK_TRACE_ERROR` and
  no stack, which is what a killed worker looks like; five consecutive coverage runs and a full
  `verify:local` afterwards were clean, `/sys/fs/cgroup/memory.events` reports `oom_kill 0` and
  `max 0`, and `memory.peak` was 7.99 GB against an 8 GB ceiling. Two candidates remain and
  neither is proved: the cgroup headroom (vitest.config.ts already documents this signature for
  exactly that cause) and a signal this module sends. The measurement that would settle it is a
  loop of coverage runs recording `memory.events max` deltas per run, which is a pass of its own]`
- **A forwarded signal ends the runner, which no caller can recover from.** `[open: the handler
  removes itself and re-raises the signal, because installing it replaced the default action and a
  forwarder that did not die would be SIGKILLed later with its supervisor's queue; that is right
  for a CLI and wrong for a future caller that wanted to clean up around a delegated step. There is
  no such caller today, and inventing one to justify a returned value would be a fixture with no
  subject]`

## v2.22 — `continue-on-error` was impossible, and it was a fact about the loop

### What the list looked like

v2.21's Open list carried:

> **`continue-on-error:` is still refused on a local step.** `[open: a local step could run and report
> its failure as a note, which is a small change to the loop; it is not made because no shipped step
> uses the key, so honouring it would give the runner a second notion of "failed" with nothing
> exercising it]`

The reason for not doing it was honest and the phrasing was too generous: it called the change
"small" and the second notion of failure a liability. Both are true, and neither is a reason to
refuse a key whose meaning the runner can state exactly.

`LOCAL_INCOMPATIBLE` has now lost four entries in four passes — `shell:`/`working-directory:` in
v2.19, `env:` in v2.20, `timeout-minutes:` in v2.21, and this one. Every departure had the same
shape: the entry was not false, it was **incomplete**, and the completion is to carry the fact onto
the step instead of refusing the key.

### What the flag actually says

A step with `continue-on-error: true` runs, fails, is shown as failed, and the job still concludes
`success`. So the run does not stop — and the run's verdict is still a pass, which means "OK" alone
would be a lie:

```
verify:local: OK (1 command(s), 1 of the 36 local steps), with 1 tolerated failure(s)
  tolerated: verify / Type-check — the step exited 3; the workflow says that is a note
```

### Two decisions the key forced

**A step that spent the job's budget is never a note.** In CI the budget belongs to the job; a step
that used fifteen minutes has spent what the later steps needed, and the job is killed. The flag has
nothing left to continue to. Reproducing the note without the death would be the worse half of both.

**A merged command is a note only if every step merging into it is.** `localCommands` collapses two
identical commands into one run, so the flag merges as `and`. `or` would report a green run that CI
would have made red — the one direction a reproducing tool may not get wrong.

### The boolean is refused rather than guessed

`continue-on-error: yes` is `true` in YAML 1.1 and the string `"yes"` in 1.2. A reader that picked
the other version would disagree with the runner about whether a failure stops the job. So
`booleanOf` takes `true`/`false` in any case and quoted or not, and refuses the rest with the value
quoted — including `${{ … }}`, because a flag this machine cannot evaluate is one it cannot honour.

### The previous pass's open item, measured

v2.21 ended with a run that died with seven files failing at *collection*. Three candidates, three
measurements, all of them negative:

| candidate | measurement | verdict |
| --- | --- | --- |
| cgroup ceiling | five runs of the exact CI command: `memory.events max` delta `0` each time; `memory.peak` 8.394 GB vs a 8.590 GB limit | never touched |
| a signal reaching a recycled pid | `pid_max` = 4 194 304 with 43 processes alive | would need 4 million allocations |
| my own overlapping runners | killed a runner mid-suite and looked for survivors | none |

One structural change did come out of it: the signal handler now **re-raises** instead of swallowing
its listener, so a worker can no longer be left deaf to a supervisor's SIGTERM. The item stays open
— an event with no reproduction in thirteen runs is still an event — but what was eliminated is now
written next to it.

### Acceptance

| gate | result |
| --- | --- |
| `continue-on-error: true` | carried; failure recorded; run continues |
| `false` | carried as false, not as absent |
| `yes` / `1` / expression | refused, value quoted |
| the verdict | exit 0, tolerated count, each failure listed |
| a timeout | stops the run whatever the flag says |
| a merged entry | a note only when every step merging into it is |
| `LOCAL_INCOMPATIBLE` | **2 → 1**, survivor argued |
| `gate-steps.test.ts` | **111 tests** (101 before) |
| `core` test suite | **164 files, 4106 tests passed** (as of `b399ff1`) |
| `cli` test suite | **4 files, 187 tests passed** (as of `b399ff1`) |
| repo test suite | **168 files, 4293 tests passed** (as of `b399ff1`) |
| gate sites | **69** across 40 scripts, `--check` OK |
| `typecheck` / `lint` / `docs:check` | green, by exit code |

### Open

- **`if:` is the last key, and it is not a matter of effort.** `[open: a local step with `if:
  always()` should run even after a failure, but this runner stops at the first failure that is not
  a note -- "run regardless" would have to run after a stop, which is a different program from the
  one that reports the stop. Honouring it means the loop collects failures instead of returning at
  the first, which changes what `runSteps` returns and what every caller may assume]`
- **A tolerated failure has no owner in the plan's own output.** `[open: `--list` shows that a step
  carries `continue-on-error`, and the run lists what failed; nothing connects the two for a step
  that passed *because* the failure was noted -- which is the case a reader most wants named]`
- **The unexplained worker death is bounded, not explained.** `[open: thirteen runs since, three
  candidate causes measured and eliminated; the handler that could have left a worker deaf now
  re-raises. What would settle it is a loop of runs that records `memory.events max` *and* the
  worker's exit signal per run, which is a pass of its own]`

## v2.23 — the last key was the shape of the loop, and the table had two rows that lied

### What the previous pass recorded

v2.22's Open list opened with:

> **`if:` is the last key, and it is not a matter of effort.** `[open: a local step with
> `if: always()` should run even after a failure, but this runner stops at the first failure that is
> not a note -- "run regardless" would have to run after a stop, which is a different program from
> the one that reports the stop]`

That sentence is right about the work and wrong about what it implies. It reads as though the runner
and CI were two programs that could not be the same one. They can: what stood between them was not a
capability but a **shape** — the loop returned at the first failure, so "the steps after it" did not
exist to run.

`LOCAL_INCOMPATIBLE` is gone. It held five keys in v2.18 and lost one per pass: `shell:` and
`working-directory:` (v2.19), `env:` (v2.20), `timeout-minutes:` (v2.21), `continue-on-error:`
(v2.22), and now `if:`. **A list that shrinks by exactly one entry per pass is not a list of
impossibilities — it is a list of work not done, written in the grammar of a limitation.**

### What `if:` forced on the loop

Two facts the old loop could not represent:

- a step may run **because** something failed (`always()`, `failure()`);
- a step may be **skipped in a green run** (`failure()` with nothing failed yet).

So a run is now a sequence of outcomes, and the verdict is a view of them:

| status | meaning |
| --- | --- |
| `passed` | ran, exited zero |
| `noted` | ran, failed, and the workflow says that is a note |
| `failed` | ran, failed, and the job is now failing |
| `skipped` | did not run, with the reason |
| `timed-out` | spent the job's budget, which ends the job |

The loop keeps walking after a fatal failure, because a later step may declare `always()` and CI
would have run it; every step it then skips is recorded rather than omitted. The one place it still
returns is a timeout, because a spent budget ends the *job*: nothing after it runs, not even a step
that asked to run regardless. That asymmetry is why `failureReport` now prints how many steps a
timeout cost.

### Three conditions, and the boundary is the point

| written | runs when |
| --- | --- |
| absent | no earlier step has failed |
| `success()` | the same thing, said out loud |
| `failure()` | an earlier step has failed |
| `always()` | either way |

Everything else in GitHub's expression language asks about the branch, the event, the matrix or the
inputs — facts a local process does not have — and is refused with the value quoted. `cancelled()`
is refused too, and for a different reason worth stating: mapping it to "never runs" would be a claim
about the step, when the truth is a claim about this runner.

### The third default had to be stated too

```
  a step runs only after the ones before it have passed, which is GitHub's default; none of the 36 declares a condition
```

Three passes, three defaults: the interpreter, the budget, the condition. Each was invisible because
it was implicit, and this one is what turns a non-zero exit into a stopped job.

### The table had two rows that lied

Rewriting `STEP_KEYS` to describe `if:` properly turned this up:

```js
  'continue-on-error': 'read: `true` means a failure here is a note, and the run carries on',
  ...
  'continue-on-error': 'a failure that does not fail the job, which this runner reads as a failure',
```

An object literal keeps the **last** one, so for two passes the table described a key as unread after
the runner had been taught to read it — and nothing could see it, because by the time anything parses
the object the duplicate is gone. `env:` had the same pair.

The repair is a test that reads the literal as **text** and counts rows, plus one that holds each
description to the two classes the table claims. "Be careful" is not a repair.

### One rule, two readers, again

v2.22 left *"a tolerated failure has no owner in the plan's own output"*. The outcome list answers
it without a second field:

```js
export function notedFailures(outcomes) {
  return outcomes.filter((one) => one.status === 'noted');
}
```

`failureReport` and the CLI both call it. Two filters over the same status string would have been the
repository's oldest shape: one rule, two implementations, and the one that reports goes stale.

### Acceptance

| gate | result |
| --- | --- |
| `if:` on a local step | carried as one of three modes; anything else refused by value |
| `cancelled()` | refused, with the reason it is not "never runs" |
| the loop | collects outcomes; the verdict is derived from them |
| after a failure | widening steps run, the rest are skipped and recorded |
| a `failure()` step in a green run | skipped, counted, named in the verdict line |
| a timeout | stops everything, including `always()`, and counts what it cost |
| `--list` | states the default condition and the override count |
| `LOCAL_INCOMPATIBLE` | **deleted**; a sweep asserts every known key is carried locally |
| the table | no duplicate rows; every description classified |
| `gate-steps.test.ts` | **131 tests** (111 before) |
| `core` test suite | **164 files, 4126 tests passed** (as of `a20605dd0`) |
| `cli` test suite | **4 files, 187 tests passed** (as of `a20605dd0`) |
| repo test suite | **168 files, 4313 tests passed** (as of `a20605dd0`) |
| coverage | core **99.97 / 99.74 / 100 / 99.97**, cli **100 × 4** |
| gate sites | 69 across 40 scripts, `--check` OK (one line number moved) |
| `typecheck` / `lint` / `docs:check` | green, by exit code |

### Open

- **A condition on a step that does not run here is still only checked for widening.**
  `[open: a remote-only step with `if: failure()` is refused, because its absence from the plan would
  otherwise be explained twice -- "needs prometheus" and "only runs on failure". That refusal is
  right, and it means a workflow cannot narrow a remote step without also saying so in its reason.
  No shipped step does it, so the alternative -- folding the condition into the reason text -- has no
  subject]`
- **A `failure()` step that runs and passes leaves the run red, and that is correct but unstated.**
  `[open: the job status is a latch: once a step fails, a later `always()` step succeeding does not
  clear it, and CI would have concluded failure. The run says `FAILED at n` and lists what still ran;
  nothing says that a green `always()` step cannot turn that verdict back, and a reader who sees it
  pass may expect it to]`
- **`steps.<id>.outcome` cannot be expressed.** `[open: `if: steps.build.outcome == 'failure'` is a
  condition over a named step, which this reader refuses like any other expression -- and unlike the
  branch or the event, this one *could* be evaluated, because the runner has the outcomes. It is not
  done because it needs `id:` to become a lookup rather than a tolerated name, and no shipped step
  uses the form]`
- **The unexplained worker death is still bounded, not explained.** `[open: fourteen runs since, three
  candidate causes measured and eliminated; the handler that could have left a worker deaf re-raises.
  What would settle it is a loop of runs recording `memory.events max` and the worker's exit signal
  per run, which is a pass of its own]`

## v2.24 — the budget was a pool, and every step was told it was a limit

### What the previous pass recorded

v2.23's Open list closed with the same item v2.21 had opened, one level up:

> **A condition on a step that does not run here is still only checked for widening.** `[open: …]`

No — the item that mattered was older. v2.21 read `timeout-minutes:` off the job and v2.22 handed the
number to each step as its bound. Both were right about the number and wrong about the noun.

GitHub's `timeout-minutes` on a job is a budget for **the job**: `verify` has fifteen minutes for
build, types, lint, coverage and mutation *together*. Giving every step fifteen made this runner more
generous than CI in the one direction that matters — a local run could pass a plan CI would have
killed at the fourth step. That was the last known way *"`verify:local` ran this step"* was true here
and false on the runner, and it was never a key that went unread. It was arithmetic that was never
done.

### Pools, and who pays for a merged command

`localCommands` merges identical commands across jobs, so one local run can stand in for work in four
jobs. CI would have run it four times, each paying the full duration, so the charge is the full
duration to **each** pool. Charging once would overstate what every job has left, which is the
direction that lets the gate pass a plan CI would kill.

The bound a command gets is the tighter of its own `timeout-minutes` and what its jobs have left, and
the owner travels with the number:

| the tighter one | what a reader is told |
| --- | --- |
| the step declared it | `bound: 5m, set on verify / Type-check` |
| the job has that much left | `bound: the last 2m of job "verify"'s 15m budget (13m already spent)` |
| the job had nothing left | `bound: job "verify" spent its whole 15m budget before this step` |

The third is a new outcome, `exhausted`, and it is deliberately not a skip: a step that starts with
nothing left is a step CI would have killed at its first instruction, and calling that a skip would
say the run was fine.

### The clock had to become a parameter

Pool arithmetic asks how long something took. A test that answered by waiting fifteen minutes is a
test nobody runs; one that asserted on `Date.now()` differences would be the flakiest thing in the
suite. So `runSteps(commands, run, now = Date.now)`, and the tests advance a clock they own from
inside their own `run` callback:

```js
    const result = await runSteps(localCommands(shared('verify', 1, ['one', 'two', 'three'])), (step) => {
      seen.push(step.timeoutMs);
      t += 20_000;
    }, () => t);
    expect(seen).toEqual([60_000, 40_000, 20_000]);
```

Enforcement stays real, proven where it already was: `step-process.test.ts` kills a process group at
whatever `timeoutMs` says. Two tested halves rather than one untested whole.

### Enforcing a budget silently is the same mistake one level down

The first gate run with pools enforced passed, and said only `OK`. One minute to spare and fourteen
are the same verdict and different facts, and only one of them is about to break:

```
  budget:  verify 58s of 15m, batteries 17m of 30m, artefacts 19s of 15m, cold-tree 2s of 20m
```

It is also the only evidence that the pool code ran on the real gate at all, rather than being
skipped by an empty list.

### What the plan says now

```
  `timeout-minutes:` is a budget for the whole job, not for each step: verify 15m across 7 step(s),
  batteries 30m across 16 step(s), artefacts 15m across 9 step(s), cold-tree 20m across 4 step(s)
  — a run that spends one is killed at whatever step is running
```

Per job, because per step was the false statement: a line that printed `15m` beside every step of
`verify` was read — by anyone who read it — as fifteen minutes each.

### Acceptance

| gate | result |
| --- | --- |
| job budget | a pool; each command charged in full to every job that needs it |
| the bound | tighter of the step's own and what its jobs have left |
| a spent pool | `exhausted`: the run fails, the step does not start, the rest are skipped |
| the owner | named: step, remaining pool, or a pool that was already gone |
| the clock | injected; exact in tests, real in production |
| enforcement | unchanged, still tested against a real process |
| the verdict | `budget: verify 58s of 15m, batteries 17m of 30m, …` (the seconds vary by run) |
| `--list` | one line per job |
| `gate-steps.test.ts` | **144 tests** (131 before) |
| `core` test suite | **164 files, 4139 tests passed** (as of `879dd02d5`) |
| `cli` test suite | **4 files, 187 tests passed** (as of `879dd02d5`) |
| repo test suite | **168 files, 4326 tests passed** (as of `879dd02d5`) |
| the shipped gate | passes with the pools enforced: `batteries 17m of 30m` is the closest any job comes |
| `typecheck` / `lint` / `docs:check` | green, by exit code |

### Open

- **A failure in one job still skips the remaining steps of every job.** `[open: CI's jobs are
  independent -- `needs:` is the only ordering -- so a red `verify` would not stop `batteries`. This
  runner walks one sequence, so it stops. The direction is safe: fewer steps run than CI would run,
  never more, and every one of them is recorded as skipped with the reason. Modelling four
  independent sequences would mean four clocks and four failure latches, which is a different
  program from the one that reports a single verdict]`
- **The dedupe's one run is charged in full to each job, and the ordering is still sequential.**
  `[open: the arithmetic matches what each job would have paid, but the *interleaving* does not --
  CI runs the four jobs at once, so a slow step that would have overlapped with another job here
  blocks it. The totals are right; the wall clock is not]`
- **A loaded machine spends budget for reasons that are not the step's.** `[open: the pool is wall
  clock, so two builds at once on this laptop charge each other. That is also true of CI, which is
  why the runner is only as honest as its own load -- and the `budget:` line is what makes the
  difference visible rather than theoretical]`

## v2.25 — four jobs were walked as one sequence, and two endings shared one word

### The sequence that was not there

v2.24's Open list opened with this:

> **A failure in one job still skips the remaining steps of every job.** `[open: CI's jobs are
> independent -- `needs:` is the only ordering -- so a red `verify` would not stop `batteries`. This
> runner walks one sequence, so it stops. The direction is safe: fewer steps run than CI would run,
> never more, and every one of them is recorded as skipped with the reason.]`

The direction being safe is why it survived. But "skipped" reads like a decision, and this was a
shortfall: the plan's sentence is about what ran **here**, and a `batteries` step skipped because a
`verify` step failed is a sentence about the wrong job.

`runSteps` now keeps a failure latch *and* a cancellation **per job**, and evaluates each command
against the members it stands in for — the steps the dedupe merged, each with its own job, condition
and `continue-on-error`:

```js
    const wanted = members.filter((member) => {
      const job = jobOf(member);
      if (cancelledJobs.has(job)) return false;
      return runsGiven(member.condition ?? 'success', failedJobs.has(job));
    });
```

A command runs when **any** member wants it. That is the only rule that cannot skip work CI would
have done, and it also unwinds an earlier simplification: `continue-on-error` used to be merged to a
single `and` across jobs, so a command that was a note in `batteries` and fatal in `verify` was
treated as fatal for both. Now the failure is fatal only for the members that did not ask for a
note, and the two jobs diverge — which is what CI would have done with the same command twice.

The dedupe still forces one execution point, so the **ordering** between jobs is not CI's. The
outcomes, the latches and the budgets are. Stated, not silent.

### The word that covered two endings

Implementing that turned up something older. Since v2.21 the runner said *a timeout stops
everything*, and v2.24 kept it. Both are wrong, and differently:

| the bound that ran out | what CI does |
| --- | --- |
| the **step's** `timeout-minutes` | kills the process, fails the step, and the job carries on — its `always()` steps still run |
| the **job's** `timeout-minutes` | cancels the job; nothing more runs in it, not even `always()` |

One word, two endings, and the runner had been reporting the second for both — which is the same
mistake as a key-level refusal: **the noun was wrong, so the consequence was wrong.** `boundScope`
already existed, so the distinction was one branch:

```js
      for (const member of wanted) failedJobs.add(jobOf(member));
      if (scope === 'pool') cancelledJobs.set(jobOf(owner), 'budget');
```

### What the report gained, and lost

`also failed: batteries` — a run has four jobs and one verdict line, and naming only the first
failure sends a reader off to fix one thing while another is red. The `stopped: N step(s)` line is
gone: it counted steps the loop never reached, and the loop no longer returns at a timeout.

Skip reasons name the subject where there is one, and fall back to `an earlier step failed` for the
unnamed job the fixtures use — `job ""` is not a name.

### Acceptance

| gate | result |
| --- | --- |
| job independence | a failing step in one job leaves the other jobs running |
| per-job latches | the rest of the failed job is skipped, naming the job |
| per-member conditions | a merged command runs for every job that still wants it |
| per-member `continue-on-error` | a note in one job, fatal in another; the jobs diverge |
| a step bound | fails the step; the job continues and its `always()` steps run |
| a job budget | cancels the job; other jobs untouched |
| the report | `also failed: batteries`; no more `stopped:` |
| `gate-steps.test.ts` | **149 tests** (144 before) |
| `core` test suite | **164 files, 4144 tests passed** (as of `456b5c4b0`) |
| `cli` test suite | **4 files, 187 tests passed** (as of `456b5c4b0`) |
| repo test suite | **168 files, 4331 tests passed** (as of `456b5c4b0`) |
| the shipped gate | passes; the `budget:` line is unchanged in shape and per job |
| `typecheck` / `lint` / `docs:check` | green, by exit code |

### Open

- **The order between jobs is still the dedupe's, not CI's.** `[open: a command serving two jobs
  runs once, at the position the first of them gives it, so its cost is charged to the second job
  earlier than CI would have charged it. The outcomes, latches and budgets are exact; the interleaving
  is not. Fixing it means either running shared commands twice -- the dedupe's whole point gone -- or a
  scheduler that can hold a command until every job that wants it has reached it, which would make
  `batteries` wait for `verify` and be slower than CI in the other direction]`
- **`needs:` is still tolerated rather than modelled.** `[open: the reader says the key is a label it
  does not use, and the shipped workflow has no `needs:`. A workflow that used it would get the
  independent-jobs model anyway, which is right for a graph with no edges and wrong for one with
  them]`
- **A cancelled job's remaining steps are reported one line each.** `[open: after `verify` is
  cancelled, its five remaining steps print five `skipped` lines. They are true and they are noise;
  collapsing them into one line is a presentation change, and a count that hides a step is the thing
  this file exists to avoid]`

## v2.26 — one document, four heading forms, and a size that stopped it being a document

### The push that would not go

The previous pass ended with a fact and a recommendation: `docs/audit.md` was 1,100,900 bytes, and
the push of it failed twice with HTTP 400 on `POST /git/blobs`. The base64 body is 1.47 MB; the same
bytes as plain `utf-8` are 1.1 MB and went through. A document that cannot be delivered is not a
document, and the size had stopped being a matter of taste several passes earlier.

### What splitting it exposed

Reading the file to split it at finding boundaries turned up something larger than the size:

```
## 49 — Signal validity: …          the first sixty-four findings
## Finding 65: the miss diagnosis…  a colon
## Finding 75 -- The `component`…   two hyphens
## Finding 140. A worktree …        a full stop
```

**Four forms for the same thing, in one document.** A census that matched `## Finding <n> — `
reported **127** entries where the log had **191**, and said nothing about the difference. That is
this repository's oldest shape, met in a markdown file: a count answering a narrower question than
the one it was asked, and reporting its answer as the whole. It also explains why findings 1–64 had
always looked absent from `grep '^## Finding'`, and why nobody noticed: nothing was counting.

### The split

`docs/audit.md` is now an index — scope, summary, the volume table, method, retractions — and the
findings live in four volumes of at most 280,000 bytes. The split is by size rather than subject,
because a finding keeps its number and numbers are what the rest of the repository cites.

The migration was verified by re-parsing both sides: 191 findings before, 191 after, no duplicates,
no title changes, and exactly one body changed — finding 44's, because `## Method` and
`## Retractions` sat inside it and were lifted into the index.

### The guard, and the two defects it had itself

`scripts/check-audit-volumes.mjs` fails when a volume is over budget, when the volume names skip a
number, when a heading is one of the four old forms, when a number repeats or goes backwards, when a
volume holds no finding, or when a volume exists that the index does not name. Absent numbers are
**reported** rather than refused: the log has three (118, 132–133) and no record of why, and
inventing a reason would be worse than printing a hole.

Writing it produced two defects, both found by running it:

| when | what |
| --- | --- |
| first run against the real log | the finding that documents this defect quotes all four old headings in a fence, and the guard counted them — four errors against its own example. A fence flag fixed it: the guard was right about the text and wrong about the document |
| first append after the split | the index row carries a range and a count, and the append made both stale. The guard now reads the row and compares it with the file, so the number cannot rot |

The first index also printed each volume's byte count. That column is gone — it changes on every
append, and a number that must be retyped on every append is a number that will be wrong. The guard
prints the largest volume against the budget instead, which is a measurement rather than a copy.

### The check whose scope shrank

`blocker-claims.test.ts` scans the audit for unsupported blockers and read `docs/audit.md`. After the
split that file is 47 KB of an 1.08 MB corpus, so the rule would have kept returning "no unsupported
blocker" over a fifteenth of the evidence. **A check whose scope shrank while its verdict stayed
green is worse than no check, because it looks like one.** It now reads the index plus every volume,
and asserts the corpus is more than three times the index so a mistyped path fails rather than passes.

### Two existing guards caught this pass's own work

| guard | what it said |
| --- | --- |
| `bounded-spread.test.ts` | `push(...x)` twice, in the guard itself: a spread whose length is a function of the input |
| `cold-tree-job.test.ts` | `docs:check:cold` gained a member the measured set did not name |

The second was resolved by **measuring**: with `packages/core/dist` moved aside,
`node scripts/check-audit-volumes.mjs` printed `OK — 4 volume(s)` and exited 0, and the table row
records the command and its output. Both were fixed at the cause.

### Acceptance

| gate | result |
| --- | --- |
| the index | 47 KB; four rows, ranges and counts checked by the guard |
| the volumes | 4 files, ≤ 280,000 bytes, findings 1–195 |
| heading forms | one; the guard refuses the other four by name |
| absent numbers | 118, 132–133, printed in the OK line |
| the blocker scan | reads index **and** volumes; asserts corpus > 3× index |
| `audit-volumes.test.ts` | **16 tests**, two of them spawning the command |
| `core` test suite | **169 files, 4216 tests passed** (as of this commit) |
| `cli` test suite | **4 files, 187 tests passed** (as of this commit) |
| repo test suite | **173 files, 4403 tests passed** (as of this commit) |
| gate sites | **70** across 41 scripts |
| `typecheck` / `lint` / `docs:check` | green, by exit code |

### Open

- **`docs/progress.md` is 520 KB, and nothing splits it.** `[open: it is the same document as the
  audit was, one pass behind: append-only, one heading per pass, and 500 KB is where a reader stops
  reading. The audit's split is the recipe -- an index and volumes -- but the tracker's entries are
  read in order rather than by number, so the boundary rule has to be decided before it is mechanical]`
- **The volumes are split by size, not by subject.** `[open: finding 195 sits at the end of volume
  04 because that is where the bytes ran out, not because it belongs with 194. A reader looking for
  "the runner" finds findings in three volumes. Splitting by subject would break the invariant that
  a number never moves, which is what the rest of the repository cites]`
- **A finding's number is permanent and its file is not.** `[open: the split kept every number, and
  the guard refuses a duplicate or a decrease, but nothing binds a number to a file. Re-splitting at
  a different budget would move every finding above the boundary, and the guard would pass]`

## v2.27 — the red that named no reason, and the tree a killed run was holding

The audit split (v2.26) landed and the first full gate run after it went red at
`5/31` with a block that named the step, the directory and the command — and not the
reason. `pnpm test:coverage` exited `0` by hand. The next run went red at `13/31`
with `UNATTRIBUTED check-audit-volumes.mjs`. Neither red was the change under test,
and one of them was not even the code.

| red | what it was | how it was proved |
| --- | --- | --- |
| `UNATTRIBUTED check-audit-volumes.mjs` | the gate held its own reading, and the meta-gate proves a gate by emptying it; an emptied file that a test imports kills the worker and names no test | reading moved to `scripts/audit-volumes.mjs` (`data`), the gate kept the verdict → `CAUGHT (2 test(s) red)`, `OK (41 gate(s))` |
| four reds in the next run | a battery killed by SIGKILL left a **one-line** injection in `check-backend-support.mjs`; the restore lived in its `finally` | the meta-gate's own line: `repaired check-backend-support.mjs, left hollowed by a run that was killed` |
| `failureReport` had no `reason:` | three endings — exit 1, killed by a signal, `spawn ENOENT` — printed as one sentence | two tests, and a third asserting the line is absent on a timeout |
| `coverage-writes-are-drained` flagged the new test | the scan accepted two spellings of "joins its child"; `await once(child, 'exit')` is the third | pattern list extended, with the reason beside it |

The fix for the second one is a **preflight**: `scripts/tree-repair.mjs` asks the
injection batteries' shared module to put back what a dead run left, before the first
step of a session reads anything. A live battery is a refusal rather than a wait, and
a missing `python3` is reported as "cannot verify the batteries, and the tree is not
repaired either" rather than as a clean tree. The repair is driven with `python3 -c`
so that `_witnesses.py` keeps no entry point: a `__main__` there would make a shared
module a *battery*, and every battery must be invoked by a package script and a CI
workflow.

**Acceptance.** `verify:local: OK` — 31 commands covering 36 of the 43 run steps,
`verify 59s of 15m` and `batteries 17m of 30m`; core **166 files / 4168 tests**, cli
**4 / 187**, repo **170 / 4355**; core coverage 99.97 / 99.74 / 100 / 99.97 and cli
100 ×4; **71** proved failure sites across 41 scripts; the audit log is now **5**
volumes, findings 1–196.

### Open

- **`check-cli-reference.test.ts` runs 1.6–2.6 s per case, against a 5 s default
  bound nobody chose**, and one case went red once under a full-suite load and green
  standalone twice. `[open: the case that failed was reading a gate another process
  had mutated, and the mutation is reproduced rather than inferred -- but the second
  half is not: a test that spends a third of its bound on a quiet machine has no
  margin to name, and the next red will be read as a flake until the cases either
  get an explicit bound or stop spawning the CLI per assertion]`

## v2.28 — a document split by run order, and three readers that did not notice

`docs/progress.md` reached 519,758 bytes, which is the size at which `docs/audit.md`
stopped being a document (finding 195) -- one document later. The split looked like
the same job and was not: the audit log was divided **by size** because a finding is
cited by number, and a number does not care which volume holds it. A round is read in
sequence, so the boundary has to fall where a round ends.

| volume | rounds | bytes | first | last |
| --- | --- | --- | --- | --- |
| 01 | 20 | 102,903 | Pass 14 | Pass 34 |
| 02 | 16 | 92,309 | Pass 35 | Pass 48 |
| 03 | 16 | 126,949 | Pass 49 | Pass 64 |
| 04 | 24 | 133,091 | v2.06 | v2.28 |

The migration was **proved rather than asserted**: the script that moved the body
checked that the concatenation of the four files is the body, byte for byte
(`concat == body: True`), and `check-progress-volumes.mjs` now holds the consequence
-- a boundary between two `## ` headings, one order across the two naming eras, and
no round left behind in the index.

The interesting part was not the split. **Three guards read that one path**, and each
one's scope silently shrank to 13% of the corpus:

| reader | what it does | what the split did |
| --- | --- | --- |
| `check-doc-counts.mjs` | holds 179 published counts | went red -- "no counts found" |
| `measure-doc-counts.mjs --write-doc` | rewrites them | **would have printed `no row needed changing`**, over nothing |
| `check-open-list.mjs` | reads the `### Open` lists | would have seen 1 list of 47 |

The third is the one worth the sentence: a red gate catches a reader, and **nothing
catches a writer whose verdict is a sentence it prints itself**. All three now read
`scripts/docs-corpus.mjs` -- the index and every volume in reading order, because the
monotonicity rule over published counts only means something if the rows are read in
the order they were written.

**Acceptance.** `progress-volumes.test.ts` **22 tests**; core **167 files / 4190
tests**, cli **4 / 187**, repo **171 / 4377**; **72** proved sites across 42 scripts;
`check-progress-volumes: OK — 4 volume(s), 75 round(s); largest 130,230 of 200,000
bytes`; the audit log is 5 volumes, findings 1–197.

### Open

- **`docs/progress.md` front matter is still 69,216 bytes of live state**, and it
  grows with every coverage table and headline row. `[open: the split took the record
  and left the index, which is right -- but the index is now the largest single file
  in `docs/`, and the next round that adds a `### Open` entry or a coverage row makes
  it larger. Moving the historical parts of the front matter (the round-trip history
  and the L4 anchor detail) into a `volume-00` is not a size problem but a naming
  one: they are not rounds, so where they belong is a decision, not a measurement]`

## v2.29 — the rule was in prose, and the second violation proved it

Finding 196 wrote down that a gate may be spawned by a test but never imported: the
meta-gate proves a gate by emptying it, and an emptied file that a test imports kills
the worker before it can name a failing test -- `UNATTRIBUTED`, which the meta-gate
refuses.

The rule had no reader. The repository had a second violation the whole time, and only
the meta-gate could see it, in a line that is true and misleading at once:

```
CAUGHT      measure-doc-counts.mjs                         3 test(s) red
```

Three other files spawn the script and go red. Four tests in two files import it, and
when it is emptied those tests do not go red -- they disappear. `CAUGHT` is a verdict
over "at least one test named", so a partially imported gate passes it while half its
proof is invisible. **The proof's scope shrank and the verdict stayed green** -- the
same sentence this campaign has written about checks four times now, one level up.

`scripts-are-classified.test.ts` now holds the rule: no test file may import a file
whose register class is `gate` or `probe`. Under a second, against the meta-gate's two
and a half minutes, and it fails with the repair rather than the symptom.

The violation was worth more than the rule. `measure-doc-counts.mjs` was a library and
a CLI in one file, and **the library half called `fail()`** -- print to stderr and end
the process. A module that can end the process cannot be driven by a test at all, which
is how `fail()` came to be reachable from there: that half was written when it *was* the
whole program. Six sites became `refuse()`, throwing `MeasurementUnavailable`, a class
the gate already caught and printed. Same sentences, same exit code, now observable.

One gap is recorded rather than papered over: the rule reads **literal** import
specifiers, and `measure-doc-counts-readings.test.ts` imported the gate through a
variable (`await import(pathToFileURL(SCRIPT).href)`). It was found by running the
suite -- four failures with `expected '' to contain 'records a failure'` -- and the file
now imports the data module statically, keeping `SCRIPT` only for its spawns.

**Acceptance.** The rule and its negative control: **2 tests**, register **13 classes**
checked; the split: `scripts/doc-counts-rows.mjs` (`data`, 12 exports) and a gate that
is CLI, measurement loop and serialiser; core **167 files / 4192 tests**, repo **171 /
4379**; meta-gate `OK (42 gate(s))`; **72** proved sites across 42 scripts; audit log
5 volumes, findings 1–198.

### Open

- **`verify-gates-are-testable.mjs` cannot distinguish "a proof" from "one proof"**:
  `CAUGHT` says at least one test named the gate, and the meta-gate has no vocabulary
  for "some of this gate's tests are imports and therefore invisible". `[open: the
  register's `why` fields carry the argument instead, and the new import rule is what
  makes the import case impossible going forward -- but a gate whose *behavioural* tests
  were deleted, leaving one spawn, would still read CAUGHT. Measuring that needs the
  meta-gate to know which tests name which script, which is the inventory's job rather
  than the battery's]`

## v2.30 — the inventory's proofs were statements, and nothing measured them

`golden-master/gate-sites.json` says, for every failure site, which test proves it.
Two halves of that claim were checked: the file exists, and it names the script.
Neither half is the claim. **The claim is that the test goes red when the gate is
wrong**, and nothing had ever run it.

`verify-gates-are-testable.mjs` came closest and stopped one word short: `CAUGHT` means
*at least one* test failed, so a gate can be caught by one file while another file the
inventory names proves nothing, and the inventory stays green.

The meta-gate now compares the two sets. The first attempt reported `0 of 4 naming
file(s)` for **all 42 gates** — wrong in the safe direction, which is indistinguishable
from a finding: "no gate's proofs are unmeasured" is exactly what a parser that matches
nothing would say. The `×` line carries the test's name and nothing else; the file is
on the `❯ <path>` header above it. The corrected parse reads both reporter shapes, and
`gate-proofs.test.ts` (**8 tests**) holds it against canned transcripts, because a run
of the real thing cannot tell a wrong measurement from a clean one.

**What it found: nothing.** All 42 gates honour every claim, and a silent claim now
fails the run with the gate and the file named. That is the right result, and the
finding's subject is the *claim* rather than the proofs: an inventory that could have
been wrong would not have said so. What it produces besides is the distribution, which
no report had carried before:

```
CAUGHT      check-doc-counts.mjs                         18 test(s) red in 1 of 4 naming file(s)
CAUGHT      build-example-bundle.mjs                      9 test(s) red in 1 of 5 naming file(s)
```

"Naming" is a much weaker relation than "proving", and until this run the two were the
same number.

Two smaller things this round cost, both worth their sentence: the parse had to leave
the gate (v2.29's rule, applied to v2.30's code without being asked), and the
meta-gate's own sandbox then failed with `ERR_MODULE_NOT_FOUND` because it copied the
entry point and not the new dependency — a fixture is a tree the script could run in,
and a tree missing a dependency is not one.

**Acceptance.** `gate-proofs.test.ts` **8 tests**; meta-gate `OK (42 gate(s))` with
**0 silent claims**; core **168 files / 4200 tests**, repo **172 / 4387**; **72** sites
across 42 scripts; audit log 5 volumes, findings 1–199.

### Open

- **`in M of K naming file(s)` is printed and not judged.** A gate caught by 1 of 5
  naming files is proved; whether the other four *should* prove something is a question
  about the tests, not about the gate. `[open: the ratio is now a measurement without a
  threshold, and inventing one today would be a number chosen to fit the current
  distribution -- the honest next step is to look at the four gates with the widest gap
  and read why each naming file is silent, which is a pass of its own]`

## v2.31 — the denominator counted prose, and the ratio was retired to what it measures

Finding 199 added `in M of K naming file(s)`. The first run printed
`check-official.mjs 3 of 10`, and ten minus three reads like a shortfall: seven files that
name a gate and prove nothing.

Reading the ten says otherwise. One drives it seventeen times. Of the other nine, **seven
are prose** — sentences in comments, one of them reading *"A file that mentions
`check-official.mjs` in a comment"*. The remaining two are a register key and a `DRIVES`
list. The denominator was `source.includes(gate)`, and a string search cannot tell a
sentence about a gate from a use of it. **The repository already knew** — that comment is
the distinction, written by somebody who had hit it. What was missing was a reader.

`namesInCode` strips comments and keeps strings, with a scanner that tracks quoting
because the naive `replace(/\/\/.*$/gm, '')` truncates at the first `//` and this tree is
full of `https://` inside literals. Six tests, one per way that can go wrong.

| gate | before | after |
| --- | --- | --- |
| `check-official.mjs` | 3 of 10 | **3 of 4** |
| `check-no-mock.mjs` | 2 of 8 | **2 of 5** |
| `derive-gate-sites.mjs` | 2 of 7 | **2 of 5** |
| `inject-stability.mjs` | 3 of 8 | **3 of 6** |

`check-official.mjs` also went from 50 failing tests to **100**, because the nested run
now includes the files that drive it instead of three that mentioned it.

**And the ratio stops here.** After the correction, 75 files still name some gate in code
and do not go red: `scripts-are-classified.test.ts` names all 42 by design (a register key
is a string, and a proof *of the register*), `gate-sites-are-proven` asserts about the
inventory, `cold-tree-job` about a command list. No source-level scan separates "names it
in order to run it" from "names it in order to say something about it" — only the run can,
and the run's answer *is* M. A ratio whose denominator cannot be measured invites an
inference it cannot support, so the verdict line keeps `in M file(s)` and the residual is
printed once at the end.

The correction also broke 15 tests in `gates-are-testable-is-enumerated.test.ts`, all with
the wrong refusal: its sandbox wrote its subject into a test file as
`// names scripts/check-throwaway.mjs so the audit has a subject to run`. Under the new
rule the sandbox had **no test naming its subject**, so every case measured the `NO-TEST`
path instead of the one it was written for — a fixture relying on prose being counted, in
the file whose subject is "the audit of the audits".

**Acceptance.** `namesInCode`/`stripComments` **6 tests**; `gate-proofs.test.ts` **14**;
42 gates, 0 silent claims, **75** mentioners; fixture names its subject in code (22 tests);
core **168 / 4206**, repo **172 / 4393**; audit log 5 volumes, findings 1–200.

### Open

- **`named in code, not red: 75`** is the count of files that are proofs of something
  else, and it will grow with every register entry. `[open: a number that grows by design
  is a number a reader will eventually read as debt. The honest shape is probably to stop
  counting it and to name the three classes it is made of -- register, inventory,
  command list -- but that is a classification of the test suite rather than of the gates,
  and it should be decided with the suite in front of it]`

## v2.32 — a number that grows with the tree is read as debt

Finding 200 retired the `M of K` ratio and left one line: `named in code, not red: 77
file(s) across 42 gate(s)`. Honest and unusable — it grows by one per gate, because
`scripts-are-classified.test.ts` names all of them by design, and within two rounds a
reader sees a backlog where there is a register.

The fix is not to stop counting but to say what the count is **made of**, with the shape
this repository already uses for claims: a table a human types, each row carrying what it
is a proof of instead.

| role | proves instead | pairs |
| --- | --- | --- |
| `scripts-are-classified.test.ts` | the classification of every script | 42 |
| `cold-tree-job.test.ts` | where a gate runs, held to what was measured cold-safe | 15 |
| `gate-sites-are-proven.test.ts` | the inventory's own rules | **0** |

The third row explains nothing in this run and is kept: every gate it names also goes
red when emptied, because the deriver reads the hollowed file. Declaring it is a rule
about the future, not a snapshot of the present.

**The residue is named, not judged**: 20 pairs across ten files, printed by name.
Sampling them suggests a fourth class — `injection-target-routing` and
`spread-append-guard` hold tables of `{ file: 'scripts/…' }` rows — but two samples is
not a measurement, and a table that grows a row per unexplained file becomes a place to
put anything. Hence the assertion that matters more than the table:

```js
expect(MENTIONER_ROLES.length).toBeLessThan(6);
```

A role table that lists every file explains everything and means nothing — the same
failure as a check whose scope is "all of it".

`classifyMentioners` splits the pairs and the tests hold the arithmetic: parts add up to
the whole (a dropped pair cannot hide in a breakdown), every declared file exists (a
rename cannot leave the rule covering nothing), every `why` is longer than 80 characters
(the same floor the doc-count exemptions use).

**Acceptance.** `gate-proofs.test.ts` **17 tests** (three for the table); 42 gates, 0
silent claims, 77 pairs = 42 + 15 + 20; core **168 / 4209**, repo **172 / 4396**; audit
log 5 volumes, findings 1–201.

### Open

- **Twenty pairs across ten files are printed and not explained.** `[open: sampling says
  they are tables of scripts and contract assertions about scripts, which would be a
  fourth row -- but a row added on two samples is how the table stops meaning anything.
  The pass that closes this reads all ten files and either declares the pattern once or
  shows that each is one of the three. It is bounded work and it is not this round's]`

## v2.33 — the sample was a property of the whole corpus

Finding 201 left twenty unexplained pairs and a promise: read the ten files. Reading them
produced a better question.

**Each of the ten names two to four gates and drives one.** `gen-rcaeval-cases.test.ts`
spawns `gen-rcaeval-cases.mjs` and also asserts another script's name appears in some
output; `spread-append-guard.test.ts` holds a table of `{ file: 'scripts/…' }` rows. Those
pairs are mentions *about* a gate, not uses of it — and no source scan separates the two,
which is why finding 200 retired the ratio rather than tuning it.

So the twenty are not defects. But "they are incidental" is a reading, not a measurement.
The pair that is **not** incidental by construction is a gate's own test file: if
`check-no-mock.mjs` has a `check-no-mock.test.ts` and emptying the gate leaves that file
green, the file named after the gate does not exercise it. `namesakeOf(gate)` makes that
askable, and the answer on this tree is **zero**.

### The incident that produced the question

The pair count moved from 77 to 36 between two runs of the **same** meta-gate, with the
register's 42 pairs vanishing. The cause was two files away:

- `scripts-are-classified.test.ts` asserted `expect(undriven).toContain('serve-site.mjs')`;
- `gate-proofs.test.ts`, written this round, used `namesakeOf('serve-site.mjs')` as a sample.

A mention in *any* test file puts the name into the corpus, so `serve-site.mjs` stopped
being undriven, that assertion failed for **every gate at once**, the register file became
a red file for all 42, and the meta-gate reported no register pairs.

The comment above that assertion already recorded the **first** incident of exactly this
kind, and concluded that "pinning the exact set would report a coverage change where only
prose had changed". It then pinned one name anyway. **A pinned name is a property of the
whole corpus** — a sample that a sentence can retire is not a sample.

The assertion is gone; what stands in its place is the rule the same comment argued for:
the undriven set is whatever it is, every member must name a class with no verdict to
prove, and `serve-site.mjs` keeps one stable claim — it is a `tool`, and a tool has no exit
for a test to prove.

**Acceptance.** `namesakeOf` **2 tests** (`gate-proofs.test.ts` **19**); meta-gate 42
gates, **0 silent claims**, **0 namesake-silent**, 78 pairs = 42 + 15 + 21; core **168 /
4211**, repo **172 / 4398**; audit log 5 volumes, findings 1–202.

### Open

- **The 21 pairs still print.** They are now known to be mentions-about rather than uses,
  so the line is information rather than debt — but it is the third round spent on this
  number, and the honest end state is probably that it stops being printed at all.
  `[open: three rounds on one line is the signal. The rate at which it is read is zero
  unless something fails beside it, and the two questions it was introduced to answer --
  are the inventory's claims honoured, and does a gate's own test catch it -- are both
  answered by failures now. Removing it is a one-line change that should be made with the
  numbers in hand, not at the end of a round that has already spent its attention here]`

### And the nested run that inherited the lock

The same round's second defect arrived while proving the first. `verify:local` went red at
`5/31` — with finding 196's preflight doing exactly its job:

```
reason:  the step exited 1
  _witnesses: pid 213281 is running gate-tests-battery on this tree
```

A test spawns `verify:local.mjs` against a fixture workflow, and the child **inherited the
repository's battery cache**, so whenever a battery was in flight the nested run refused to
measure a tree "somebody else held". The step was fine; the refusal was about a lock two
processes away. `nestedEnv(workflow)` gives every fixture run a cache of its own, and the
ten spawn sites go through it.

**Third time in five rounds** that ambient state reached a process with no business seeing
it: a killed battery's mutations, a live battery's lock, and now a lock inherited by a
nested gate. The sentence is the same each time — **a child inherits an environment, and
the environment is a claim about the whole machine**.

## v2.34 — the open list had two spellings, and one of them had no reader

The guard that reads this document's open list exists because three entries had stopped
meaning anything while nothing read them. Its docstring, written in that round, draws the
conclusion: *"A document that gains a list must gain a reader for it, and the only way to
hold that is to read all of them."*

It then reads all sections with **one heading**:

```js
const DOCS = [{ path: 'docs/progress.md', heading: '### Open' }];
```

The index has an `## Open`. Nineteen thousand two hundred and eighty-five bytes, twelve
entries, zero `[open:` markers and zero closure citations — the volumes' 132 entries are
all marked, and the index's twelve were not, because nothing read them.

That is finding 195 one document later, and by the same hand: a census that knew four
heading forms counted 127 of 191, and the lesson recorded there was that the scan's
vocabulary is a claim about the document. Here the vocabulary was one string.

### What the twelve were, and why four were false

A v1-era residuals section. The clearest case:

> **Five gates are covered by CI running them, not by a test that forces them to fail.**
> ... `check-readme-sample.mjs`, `build-example-bundle.mjs` and `gen-examples.mjs` have no
> test naming them ...

The meta-gate now prints all five as `CAUGHT` with named failing tests (18, 14, 24, 32 and
38 of them), and each has a namesake file. So the naming half is closed and the branch
half is not — the meta-gate proves a gate is caught by **at least** one test, not that
every exit has one. That entry was **narrowed**, not struck.

Each of the twelve got a verdict from a measurement rather than from a reading: six
closed with an authority (`Pass 15` twice, the run's own stack trace, a scratch helper, the
workflow itself), six open with a reason that names what would close it. The closures are
the interesting half — two of them are closed by **rounds rather than findings**, which is
why the closure rule needed a vocabulary instead of a regex.

### The same guard's closure rule was prose

The docstring promises a closed entry is "struck through, with the finding that closed it
named". The regex was `/~~|Closed by finding \d+/`, which a strikethrough alone satisfies.
And the enforced half could not have worked on more than half the document: **eleven of
the twenty** shipped citations wrap (`**Closed by\nfinding 170.**`), and the pattern had
no `\s+` across the break.

A rule stated in prose and a rule enforced in code had drifted — which is this guard's own
subject, applied to itself.

It now needs one of three authorities: a finding, a round (`Pass N`), or explicitly not a
finding (`Closed without a finding: <sentence>`). Measured before tightening: **19 of 20**
already complied, and the twentieth says "Closed in this pass by the run itself: 15 s for
the install", which the third authority accepts verbatim. The stricter rule cost nothing
and made fourteen citations visible that the old one could not see.

### The third defect: the test held a copy of the rule

`check-open-list.test.ts` kept a copy of the two regexes and drove five tests against it.
Tightening the guard would have left the copy behind, and those five would have gone on
agreeing with an implementation that no longer existed — a suite reporting on its own
source. They are gone; every rule now spawns the script, so there is one vocabulary. Net
**13 → 12** tests in that file, and the five that left were measuring a copy.

### The nesting rule, which only two spellings make reachable

A `### Open` inside a `## Open` is two sections whose entries overlap, so the entry count
would depend on how the document is headed rather than on how much is open. It is
refused, with both line numbers named, rather than de-duplicated: a list inside a list has
no answer to "which list does this entry belong to".

**Acceptance.** `## Open` and `### Open` both read — the twelve were exposed at **164
entries across 54 sections** (was 152 / 53), and the document now prints **167 / 55** with
its own list included; the twelve all marked; the closure rule tightened at zero cost; the copy
gone; core **168 files / 4210 tests**, cli **4 / 187**, repo **172 / 4397**; coverage
99.97 / 99.74 / 100 / 99.97 and 100 ×4; audit log 5 volumes, findings 1–203.

### Open

- **`named in code, not red` is still printed, and this is the fourth round it appears.**
  `[open: it is now known to be a count of proofs-of-something-else, and the two questions
  it was introduced for -- are the inventory's claims honoured, and does a gate's own test
  catch it -- are both answered by failures rather than by this line. Removing it is one
  edit that should be made deliberately, with the numbers above in hand, and then that
  section of `verify-gates-are-testable.mjs` stops existing]`
- **The index's `## Open` is marked but not maintained, and that is one answer too many.**
  `[open: the twelve are all marked now, and six of them are history -- but a round's
  residuals go to its own `### Open`, so "what is not done" is answered in two places and
  the index's answer has not been appended to since v1. One of the two has to stop being
  the answer: either the index's section becomes a roll-up that each round rewrites, or it
  is retired to a volume and the index points at the last round instead. The guard cannot
  choose -- it can only check that each entry says which it is -- so this is a decision
  about what the document is for]`
- **The index is 71,000 bytes and 39,000 of them are two historical lists.**
  `[open: `## Audit passes` and `## Open` are append-only and neither is what an index is;
  a reader looking up this round finds it in `volume-04`, and the front matter is the part
  that grows with every round. Splitting it is a naming decision -- which of these are
  rounds and which are reference -- and it cannot be made by measuring bytes]`

## v2.35 — two counters reached forty-two, and they were not the same counter

The index carries a table of eleven audit passes with a `Defects` column; the audit log
carries findings 1–203; nothing had ever compared them. The comparison looked like a gift:

```
6 + 5 + 4 + 8 + 5 + 3 + 2 + 2 + 3 + 2 + 2 = 42
```

and there are exactly 42 findings numbered 1 through 42 — so `sum(defects)` was about to
become a guard, and it would have passed.

**It is a coincidence.** Finding 39 is the 2 GiB `readFileSync` defect, which is **pass 6's**
subject (`scripts/fetch-official.mjs`), numbered 39 because it was found during the
real-corpus runs. Finding 42 is "the corpus layout was assumed rather than read", same line
of work. Pass 11 is `src/fault/injector.ts`. Findings are numbered by when they were found,
passes by when they were run; the orders diverge and the totals meet by accident.

Worse than a wrong guard: it would have kept passing after an edit to any of the eleven
numbers, because the sum would still be a number that exists as a finding. **A check whose
assertion is true for a reason other than the one it names will approve the change it was
written to refuse.**

### The plan before that one died the same way

It was to delete `## Audit passes` as a copy of the audit log. Measured: of 79 prose
sentences longer than 60 characters, **zero** appear in `docs/audit/`. It is unique
synthesis — why each pass was chosen — and the finding-by-finding log does not carry it.
Two plans, both killed by measurement, neither by argument.

### What the round did

1. **`named in code, not red` retired**, after four rounds: 77 pairs, a role table
   explaining 57 of them, 21 residual pairs across ten files, then an assertion refusing
   the table's own growth. Every number was right; nothing read them. The two questions it
   existed for are answered by failures. `MENTIONER_ROLES` and `classifyMentioners` left
   with it.
2. **The index must be smaller than the smallest volume** — a relation, printed each run:
   `index 72,217 of smallest volume 92,309`. Twenty kilobytes of headroom, about six
   rounds, and then the split becomes an instruction instead of an opinion.
3. **A claim of mine corrected.** v2.28 says the index had become "the largest single file
   in `docs/`"; it is the **smallest** of the five progress files, and nothing had measured
   that for six rounds.

The relation reddened fifteen structural tests at once, all for a size reason they were not
written to exercise — their "volumes" were one heading. `volumesOf` now pads every fixture
body to 4,000 bytes: **a volume is tens of kilobytes, and a twenty-byte one is not a
volume.** The alternative was an option that turns the relation off, which is the seam that
lets a test measure nothing.

**Acceptance.** `named in code, not red` gone (−3 tests with the role table); the size
relation +2 tests (one red, one green); core **168 files / 4209 tests**, cli **4 / 187**,
repo **172 / 4396**; coverage unchanged at 99.97 / 99.74 / 100 / 99.97 and 100 ×4;
`check-progress-volumes: OK — 4 volume(s), 82 round(s); largest 155,536 of 200,000;
index 71,492 of smallest volume 92,309`; audit log 5 volumes, findings 1–204.

### Open

- **The index's `## Open` still answers "what is not done" for a project whose rounds each
  answer it too.** `[open: the twelve entries are marked, and the guard checks only that.
  One of the two answers has to stop being one -- a roll-up the last round rewrites, or a
  pointer at the last round -- and that is a decision about what the document is for, not a
  measurement]`

## v2.36 — a citation reads as well when it resolves to nothing

The audit log numbers its findings and cites them constantly — "closed by finding 170",
"finding 46's fix" — and every round of this log cites them too. Across both documents there
are hundreds of such citations and **nothing had ever checked that a cited number names
something**.

Three did not:

| citation | where | the sentence |
| --- | --- | --- |
| the number 118 | `audit/volume-03.md:773` | "the same reason ... names its own misdiagnosis" |
| the number 133 | `audit/volume-03.md:2383` | "a diagnostic pass while writing up ..." |
| the number 133 | `progress/volume-02.md:519` | "writing up ... turned into finding 134 and then finding 135" |

The third is also the explanation: **133 was a write-up that became 134 and 135.** The number
was consumed by work that split in two, and two sentences went on referring to it. The number
118 has no such story anywhere; the sentence citing it is the only trace.

### Why a gate, and what it can and cannot see

A citation that resolves to nothing reads exactly as convincingly as one that does — the
sentence is right and the number is wrong, so no amount of care at write time catches it.
Whether a number *exists* is precisely what a script can know, which is why this one is
mechanical where the rest of this campaign's checks needed judgements.

It cannot see whether the number is the **right** one: a sentence citing 41 when it meant 42
passes forever. So the three repairs are judgements and are recorded as judgements — the 118
sentence now cites **finding 46**, whose title is a correction of a wrong mechanism and is the
nearest true referent; the other two needed no number at all ("this finding", and the three
the table beneath actually lists).

Two outputs, only one an error: **absent** numbers (118, 132, 133) are printed, because a hole
nothing cites is invisible and renumbering 204 findings to close three would break every
citation that works today; **dangling** citations fail the run, with file, line and sentence.

The split is the one finding 196 established: `audit-citations.mjs` holds the reading
(headings, citations, sentence context, holes) and `check-citations.mjs` holds the verdict,
because a gate a test imports cannot be proved by emptying it. The meta-gate agrees:
`CAUGHT 3 test(s) red in 2 of 3 naming file(s)`.

**Acceptance.** 995 citations of 202 numbers across 11 files at this round's measurement;
3 citations of 2 numbers repaired by hand; `audit-citations.test.ts` **7 tests**; cold tree
measured with `packages/core/dist` moved aside (exit 0); 43 gates, **73** failure sites across
43 scripts; core **169 files / 4216 tests**, cli **4 / 187**, repo **173 / 4403**; coverage
99.97 / 99.74 / 100 / 99.97 and 100 ×4; audit log 5 volumes, findings 1–205.

### Open

- **`docs/audit/volume-03.md` sits fourteen bytes under a bound that will never be tested
  again.** `[open: appending happens in the last volume, so volume-03 is closed and will never
  grow on its own -- but correcting one sentence inside it would take it over 280,000 and fail
  the guard, which is the wrong answer to a repair. The budget is doing its job for the volume
  that grows and standing in the way of the ones that do not; whether a closed volume should
  have a budget at all is the question, and answering it means deciding what the number was
  for]`
- **The index's `## Open` still answers "what is not done" while every round answers it too.**
  `[open: measured this round -- the rounds do not carry residuals forward (120 of 135 open
  entries never reappear), so the "last round is the answer" reading is false as well. One
  list has to be maintained by hand and the other declared a record; the guard can check only
  that each entry says which it is, so this is a decision about what the document is for, and
  it is the last structural item left]`
