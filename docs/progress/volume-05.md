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
| `core` test suite | **171 files, 4253 tests passed** (as of this commit) |
| `cli` test suite | **4 files, 187 tests passed** (as of this commit) |
| repo test suite | **175 files, 4440 tests passed** (as of this commit) |
| gate sites | **70** across 41 scripts |
| `typecheck` / `lint` / `docs:check` | green, by exit code |

### Left open

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

### Left open

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

### Left open

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

### Left open

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

### Left open

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

### Left open

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

### Left open

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

### Left open

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

### Left open

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

### Left open

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

### Left open

- **The index's `## Open` still answers "what is not done" while every round answers it too.**
  `[open: measured this round -- the rounds do not carry residuals forward (120 of 135 open
  entries never reappear), so the "last round is the answer" reading is false as well. One
  list has to be maintained by hand and the other declared a record; the guard can check only
  that each entry says which it is, so this is a decision about what the document is for, and
  it is the last structural item left]`

## v2.37 — a budget sized on a number nobody took on the runner

The run that carried finding 205 came back **`cancelled`**. Not failed: cancelled. The API
says which step, and the shape is unmistakable:

```
  6 Install the shells the suite cross-checks against  2.5m  success
 10 Test with coverage (core + cli)                    1.5m  success
 13 Install a backend this repository did not write   10.8m  cancelled
 14 A reader, against that backend                     0.0m  skipped
```

Steps 1–12 sum to **259 s**; step 13 — `apt-get install prometheus` — took **648 s** and was
cancelled at the job's `timeout-minutes: 15`. One budget, two commands forty times apart in
cost, and the one that lost was reported as *cancelled*, which reads like somebody stopped it.

The comment beside that step says what it was costed at:

> so the cost here is an `apt-get` and **nine seconds**.

Nine seconds is what it costs where the package cache is warm. A cold `ubuntu-latest` runner
pays for the index too. **Costed at nine, measured at 648, and nothing between the two ever
ran** — a budget is only tested when it is exhausted.

### The same sentence as finding 166, four rounds later

Finding 166 split one job into three, and wrote: *the fix is not a bigger number in one
bucket, it is three buckets whose wall clocks run beside each other.* That held for four
rounds. Then the verify bucket re-acquired a member with a different cost profile, and the
sentence came true again.

What is worth keeping: **a split is a property of the steps in the bucket at the time, not of
the workflow.** A bucket whose name lists five things will grow a sixth, and the sixth gets
costed by whoever adds it, from the machine they have.

### The change, and three mechanical consequences

A fourth job — `backend`, holding the install and the reader, `timeout-minutes: 20` against a
measured 648 s — and `verify` keeps its 15 minutes for the 259 s it actually does.

1. `STEP_PLAN` failed loudly before anything else could pass, which is exactly what its
   docstring promises: *"if a step is added to the workflow and not added here,
   `gate-steps.test.ts` fails — which is the moment a person is still thinking about what the
   step needs."*
2. `verify:local` now covers **38 of 45** run steps (was 36 of 43).
3. Four tests pinned `36` — the local step count — inside assertions whose subject was "no
   step overrides the shell, the directory or the environment". They failed for a reason that
   had nothing to do with that, so the count became `\d+` and the property stayed.

**Acceptance.** 5 jobs (15 / 20 / 30 / 15 / 20 minutes); `verify:local: OK — 31 command(s)
covering 38 of 45 run steps`; core **169 files / 4216 tests**, cli **4 / 187**, repo **173 /
4403**; coverage 99.97 / 99.74 / 100 / 99.97 and 100 ×4; 43 gates, 73 sites; audit log 5
volumes, findings 1–206.

### Left open

- **`docs/audit/volume-03.md` sits fourteen bytes under a bound that will never be tested
  again.** `[open: appending happens in the last volume, so volume-03 is closed and will never
  grow on its own -- but correcting one sentence inside it would take it over 280,000 and fail
  the guard, which is the wrong answer to a repair. The budget is doing its job for the volume
  that grows and standing in the way of the ones that do not; whether a closed volume should
  have a budget at all is the question, and answering it means deciding what the number was
  for]`
- **The index's `## Open` still answers "what is not done" while every round answers it too.**
  `[open: measured in v2.36 -- the rounds do not carry residuals forward (120 of 135 open entries
  never reappear), so "the last round is the answer" is false as well. One list has to be
  maintained by hand and the other declared a record; the guard can check only that each entry
  says which it is, so this is a decision about what the document is for, and it is the last
  structural item left]`

## v2.38 — fifty-eight answers to one question, and one of them current

Two headings were spelled `Open`: the index's list and the one every round closes with. A
reader who greps for what is not done got **fifty-eight answers**, and exactly one was current.

Two measurements made that a defect rather than a habit, and neither existed when the headings
were chosen:

- **the rounds do not carry residuals forward** — of 135 open entries, **120 never reappear** in
  the next round's list, so "read the last round" is not the answer either;
- **there is no derivation from the records to the live set** — an entry is closed by a sentence
  somebody writes, and nothing links the sentence to the entry.

Which leaves one workable arrangement: one list maintained by hand, and the rest declared
records. A list that must be derived cannot be; a list that is not derived must be maintained;
and a maintained list needs a name that says so.

`### Open` in the volumes became **`### Left open`** — 57 headings, mechanical. The index keeps
`## Open` and now opens with what it is: *this is the only live list; an entry arrives when the
round that raised it declined to close it, and is struck when something closes it.*

**Renaming rather than writing the rule down is the point.** A comment saying "`## Open` is live"
leaves fifty-seven headings that still say `Open`, and the reader who greps has been misled
before they reach the comment.

Two consequences in the guard, neither cosmetic:

1. **The duplicate rule is now scoped to one kind.** It was document-wide, so a live entry and
   the record that raised it would have been refused for "sharing a reason" — and a
   carried-forward item is *supposed* to appear in both. Within records, a shared sentence is
   still a copy-paste and still refused.
2. **A test asserts the old spelling is no longer read**, because a revert is the one thing that
   would silently undo finding 203's first half: the document would have no list the guard reads,
   and would say so.

**Acceptance.** 57 headings renamed, none left; the live list carries the standing limits plus
this round's question; **173 entries across 59 sections — 1 live, 58 records**; 148 open with a
reason; `audit-citations.test.ts` unchanged at 7 and green; core **169 files / 4218 tests**,
cli **4 / 187**, repo **173 / 4405**; coverage 99.97 / 99.74 / 100 / 99.97 and 100 ×4; audit log
5 volumes, findings 1–207.

### Left open

- **The closed-volume budget question is now in the index's live list, not here.** `[open: it
  moved because the live list is where a question that outlives its round belongs -- restating
  it here as well would be the second answer this round removed. The record is this sentence,
  and the entry to read is the last one under ## Open]`

## v2.39 — a bound that could only be obeyed by the file it was not about

The volumes have a 280,000-byte budget and every volume was judged against it. The number
exists to force one decision — *start the next volume* — and that decision is only available
to the volume that can still grow. Appends land in the last one; the others are closed.

So the rule could only be obeyed by a file it was not about:

```
docs/audit/volume-03.md   279,893 of 280,000      (107 bytes of room)
```

A repair that crossed 107 bytes would have been refused, and the refusal would have said
"start the next volume, move the newest round into it" — advice volume-03 cannot follow,
about a file that is not a pile.

### Three candidates, and the one that costs something

| rule | what it does | why not |
| --- | --- | --- |
| judge every volume | refuses repairs with impossible advice | the case above |
| a repair allowance for closed volumes | 280,000 to split, 282,000 to repair | two numbers, and the second exists only to undo the first |
| judge the growing volume | the number does what it was written for | a closed volume could be grown by an edit unnoticed |

The third, with its cost **stated rather than guarded**: every volume's size is printed on
each run —

```
sizes 102,903 / 92,355 / 127,029 / 169,431; index 73,625 of smallest volume 92,355
```

(the line as it stood when this round began; it moves every round)

— so a volume that doubled appears in the line a reader of a red build already reads. That is
weaker than a red gate, and it is the honest guarantee: the failure is somebody quietly
appending 100 KB to a closed volume, which nobody has done, and which no invariant would catch
even if built, because the closed volumes' contents are prose.

### Why this is a finding and not a footnote

Third round in a row where a number's **purpose** outlived its **formula**: a job budget
costed at nine seconds (finding 206), two lists both called `Open` (207), and now a split
trigger applied to files that cannot split. None of the numbers was wrong when written. Each
kept being applied after the thing it was about had changed — a job that grew a member, a
heading that was copied, a volume that closed.

**Acceptance.** The bound judges the last volume only; all four sizes printed; 2 tests (a
closed volume over the bound accepted *and* the last one refused, in one case; sizes printed
one per volume); volume-03 is now compliant by construction rather than by luck; core **169
files / 4220 tests**, cli **4 / 187**, repo **173 / 4407**; coverage 99.97 / 99.74 / 100 /
99.97 and 100 ×4; 43 gates; audit log 5 volumes, findings 1–208.

No residual, and that is worth writing down: this is the first round whose live-list entry was
closed in the same round it was picked up, and the index's `## Open` now holds only the six
standing limits — things this repository does not do, each with what would close it, none of
them waiting on a decision.

## v2.40 — M1's failure belongs to the model, and now that is measured

M1 is the milestone this repository is short of: a strict all-fields extraction rate at or
above 70%. Pass 15 recorded the first real reading — not met — and every round since worked on
the pipeline around it without asking the prior question: **does the metric grade its own
answer key at 100%?**

If it does not, every model number is uninterpretable. Finding 1 is that exact class —
*"the regression graded its own answer key"* — and it was found in the regression's path, not
in the extraction one.

Submitting the dataset's own `expected` values back as predictions, through the shipped
scorer:

```
  graded: 19/19   type 19/19   category 19/19   component 19/19
  strict all-fields: 19/19 (100.0%)      M1 exit condition: MET
  description : graded 0/0 (n/a)
```

**The instrument is sound**, which is the one result that lets "M1 is not met" be a statement
about an extractor.

### The control needs a control

100% is worthless if the metric says 100% to anything. Corrupting two predictions by hand:

| corrupted | type | category | component | strict |
| --- | --- | --- | --- | --- |
| one component, one type | 18/19 | 19/19 | 18/19 | **17/19** |

It discriminates. Both halves are now `answer-key.test.ts` (4 cases), with vacuity guards: at
least 19 samples, and every sample carrying a non-empty value for each scored field.

### A scope fact worth publishing

`description` has **no denominator** — `expected` carries three fields — so a run that never
emits a description still reaches 100% strict. The report already says `graded 0/0 (n/a)`; the
test now asserts it, because a reader of "M1 met" is entitled to know which fields the number
is over.

**Acceptance.** `answer-key.test.ts` **4 tests**; oracle 19/19 on three fields and on strict;
negative control 17/19; core **170 files / 4224 tests**, cli **4 / 187**, repo **174 / 4411**;
coverage 99.97 / 99.74 / 100 / 99.97 and 100 ×4; 43 gates; audit log 5 volumes, findings 1–209.

### Left open

- **M1 itself is next, and it needs a model this environment does not have.** `[open: the
  instrument is now checked, so the remaining work is the extractor -- prompts, vocabulary,
  the four fields the model is asked for -- and every one of those is measured by running a
  real model against the 19 samples, which needs the API key finding 53 recorded as invisible
  to this repository. The deterministic parts are already measured and refuted: finding 99's
  agreement reading was shown to be an artifact of the vocabulary by its own control
  (agreement-baseline.ts, 1 of 19 on the ground truth), so the next step is not another
  vocabulary pass]`

## v2.41 — the vocabulary experiment, run 140 findings late

The org secret was reachable, so M1 finally had a real model behind it. Two runs, one change
between them.

**Run 1** (unstated answer space): `type 4/19`, `category 11/19`, `component 14/19`,
**strict 2/19**. All 28 field-misses were `wrongValue` and none was omitted — the model always
answered, and its answers were the right fault under another name: `cpu-saturation →
cpu-throttling`, `memory-leak → unbounded-cache-growth`, `disk-full → disk-space-exhaustion`,
`pod-kill → kubelet-eviction`.

That diagnosis was already on file. **Finding 62** measured `type` at 26.3% and named the
cause — `category` is a stated seven-value vocabulary and scored 57.9%, while `type` was
"fault type (short)" and its answers appear in **0 of 19** incident texts. Finding 63 answered
the *shape* instead; finding 64 measured what that bought: **one sample**. The vocabulary
experiment was never run.

**Run 2** (the vocabulary in the dataset, required by the prompt):

| field | unstated | stated | Δ |
| --- | --- | --- | --- |
| type | 4/19 (21.1%) | **17/19 (89.5%)** | +13 |
| category | 11/19 (57.9%) | 13/19 (68.4%) | +2 |
| component | 14/19 (73.7%) | 14/19 (73.7%) | 0 |
| **strict** | 2/19 (10.5%) | **9/19 (47.4%)** | **+7** |

M1 is still not met, and the second number is **not comparable** to the first: `type` is now a
19-way classification, so no sample can be lost to a naming scheme. Both are kept for exactly
that reason.

### The shape of what is left

With `type` settled, thirteen misses remain and they are a different kind:

| field | misses |
| --- | --- |
| **category** (6) | `middleware → resource` ×2, `middleware → code`, `runtime → resource`, `runtime → dependency`, `code → runtime` |
| component (5) | the other side of a link (`cart-service → inventory-service`), a synonym (`session-cache → session-store`), one omission |
| type (2) | `container-crash → library-version-incompatibility`, `redis-latency → cpu-saturation` |

The category misses are **boundary** disagreements, not naming ones: the model knows the fault
and puts it in a different bucket. Finding 62 predicted `category` would become binding once
`type` was fixed; the first measurement after the fix confirms it and names which six
boundaries are in dispute.

**Acceptance.** Dataset `types` required (schema `/2`), 3 refusal tests; prompt vocabulary
required by signature, 5 tests including the empty-list refusal; core **170 files / 4230
tests**, cli **4 / 187**, repo **174 / 4417**; coverage 99.97 / 99.74 / 100 / 99.97 and
100 ×4; 43 gates, 73 sites; audit log 5 volumes, findings 1–210.

### Left open

- **`category` is the binding constraint now, and the six misses name the boundaries.**
  `[open: every one is a boundary disagreement -- middleware put under resource, runtime under
  resource or dependency, code under runtime -- and the prompt states the seven values without
  saying what any of them covers. The next experiment is the one finding 20 proposed for the
  semantic types and the vocabulary experiment just vindicated for type: state what each
  category means, then re-read. It is a prompt change measured the same way, and the six
  misses are the evidence for which definitions matter]`

## v2.42 — the category field says what its values own, and five of six boundaries move

v2.41 left six `category` misses and named them as boundary disagreements. This round states the
boundaries. Both halves of the change are descriptions of the taxonomy, not of the samples: a
definition per category saying what it owns, and a rule per disputed pair saying which fact
decides between the two. The vocabulary itself is now derived from `FAULT_CATEGORIES` instead of
being a hand-written second copy, and the definitions are a `Record` over the answerable union,
so a category without a definition does not compile.

One change, one run (`39880043431`), same model, same 19 samples:

| field | v2.41 | v2.42 | Δ |
| --- | --- | --- | --- |
| type | 17/19 | **19/19** | +2 |
| category | 13/19 | **17/19** | +4 |
| component | 14/19 | 15/19 | +1 |
| **strict** | 9/19 (47.4%) | **13/19 (68.4%)** | **+4** |

Five of the six disputes resolved: the saturated cache, the held connection pool and the evicted
pod came back to `middleware`/`middleware`/`runtime`; the segfault in a linked library to
`runtime`; the null dereference to `code`. Two did not behave as predicted:

- **consumer lag stayed `code`.** The rule says the shared layer wins "even when a code change is
  what loaded it", which is a *cause* test, and the model was reasoning about the cause. The
  discriminator between these two is where the *symptom* lands, not what produced it.
- **a WAF regex became `config`.** The `config` definition ("a deployed value ... read as
  written") is true of a rule, so defining a member can *enlarge* it. An unstated answer space
  cannot be enlarged by a definition; a stated one can, and this is the first time that cost has
  been paid.

A component answer also moved without its rule being touched: `network-delay-cart-to-inventory`
answered `inventory-service` in v2.41 and `cart-service` here. One sample of movement per run is
therefore available to a change that does not touch that field — which is the same size as the
gap to the milestone. M1 needs 14/19 and this is 13/19, so a single reading at 14/19 will not
settle it; the next round states its prediction and repeats the run.

**Acceptance.** 6 new tests in `fault-prompt-grammar.test.ts` (33 in the file): the vocabulary is
derived rather than restated, every value has a definition line, the header names the
discriminator, every recorded pair is stated with both sides, no pair twice, and no definition
copies a sample id, an expected component or eight words of an incident. The five batteries that
mutate this file all caught every injection. `typecheck`, `lint`, `docs:check` green; core 170
files / 4236 tests, cli 4 / 187, repo 174 / 4423; coverage 99.97 / 99.74 / 100 / 99.97 and
100 ×4; 43 gates, 73 sites; audit 5 volumes, findings 1–212.

### Left open

- **Two `category` samples, and both have the other two fields right.**
  `[open: consumer lag is `middleware` and answered `code`; the WAF regex is `code` and answered
  `config`. Resolving both reaches 15/19 and clears M1 without touching the component rule, so
  this is the next round. Each needs its boundary restated as a discriminator the model can apply
  -- symptom location for the first, executed-versus-read for the second -- and both pairs go into
  the recorded list with the miss that motivated them]`
- **Four `component` misses, and two of them are synonyms.**
  `[open: `session-cache` answered `session-store`, `tax-calculation` answered `tax-provider` --
  the model invents a plausible name instead of using the incident's; `storefront` answered
  `scheduled-job`, the actor rather than the workload; and `payment-gateway` answered
  `order-service`, the other end of a link. The first two look like one rule ("spell it as the
  incident spells it"), the third like another ("the workload that broke, not the actor"), and
  the fourth is the one that is not obviously answerable]`
- **The link-end annotation may itself be inconsistent.**
  `[open: the two link samples sit on opposite ends -- `network-delay` names the caller, and
  `network-loss` names the callee even though its own text puts the drop counter on the client's
  egress and says the gateway received fewer requests than were sent. A key no stated rule can
  produce is a key worth re-reading, and re-annotation is the one repair this project has used
  before (finding 75) -- but it must not be done in the round that would gain a point from it]`

## v2.43 — M1 is met, on a prediction committed before the run

v2.42 left two `category` misses and a priced ceiling: both samples had the other two fields
right, so resolving them reaches 15/19 and clears the exit condition without touching `component`
or any annotation. This round restates the two boundaries, and the prediction went into the commit
message before the run existed:

> category 19/19, strict 15/19 (78.9%), M1 met.

Run `39881192308`:

| field | v2.40 | v2.41 | v2.42 | v2.43 |
| --- | --- | --- | --- | --- |
| type | 4/19 | 17/19 | 19/19 | **19/19** |
| category | 11/19 | 13/19 | 17/19 | **19/19** |
| component | 14/19 | 14/19 | 15/19 | 15/19 |
| **strict** | 2/19 | 9/19 | 13/19 | **15/19 (78.9%)** |

`M1 exit condition: MET`. Both halves of the prediction were right, which is the first time a
prompt change in this sequence has been predicted rather than measured and then explained.

The two changes were both defects of wording rather than missing rules:

- **`middleware` vs `code`** was written as a test of the *cause* ("even when a code change is
  what loaded it"). That is the reasoning the model performed, invited and then denied in the same
  sentence. The separating fact is where the *symptom* lands.
- **`code` vs `config`** did not exist, and defining `config` as "read as written" is what created
  the need for it. Executed versus read returns the sample without weakening `config`, whose two
  other samples are both read values.

**What "met" is allowed to mean.** It is 15/19, not 19/19. The margin is one sample: one sample
down is 14/19 (73.7%), still above the threshold, and two down is 13/19 (68.4%), below it. The
instrument has been measured to drift by one sample per run, so this is "met with one sample of
margin", not "comfortably met". With 19 samples the quantum is 5.3 points and the threshold sits
between thirteen and fourteen.

The four remaining misses are all `component`: the other end of a link, the text's own name for
the cache, the actor rather than the workload, and — new in kind — `tax-calculation-service` for
`tax-calculation`, which is the same entity plus a role suffix. Widening the comparator to accept
it is the repair finding 61 refused and is refused again here: `session-store` would then match
`session`, and the field would stop distinguishing anything.

**Acceptance.** No test moved (33 in `fault-prompt-grammar.test.ts`), so no count moved; core
**170 / 4236**, cli **4 / 187**, repo **174 / 4423**; typecheck, lint and `docs:check` green;
coverage 99.97 / 99.74 / 100 / 99.97 and 100 ×4; audit 5 volumes, findings 1–214.

### Left open

- **Three `component` naming misses, and none is a `category` or `type` error.**
  `[open: `session-cache` answered `session-redis` (the text's own name for it),
  `storefront` answered `scheduled-job` (the actor, not the workload), and `payment-gateway`
  answered `order-service` (the other end of a link). The first two look like one rule -- use the
  name the incident uses and name the workload that broke -- and the third is the link pair, where
  the key may itself be inconsistent. The link pair must not be re-annotated in a round that would
  gain from it]`
- **`tax-calculation-service` is a scoring question, not a prompt one.**
  `[open: the model names the right entity with a role suffix. `sameValue` folds case and
  separators, not suffixes, and widening it to fold `-service` would also make `session-store`
  match `session`. The honest options are a stated naming rule in the prompt (no role suffix) or
  accepting the miss; widening the comparator is refused]`
- ~~**M1's reading rests on 19 samples.**~~
  ~~`[open: the quantum is 5.3 points and the margin is one sample, so the milestone is met on an
  instrument whose resolution is coarse relative to its threshold. Enlarging the key is the
  durable fix and is a data project, not a prompt one]`~~
  **Closed by finding 216**, which grew the key to 30 samples and re-read every figure derived
  from it. The reading itself is *not* closed: the 15/19 belongs to the old instrument, and the
  30-sample number cannot be taken while the provider returns 402.

## v2.44 — the component rule names the product and the actor, and the run that could not answer

M1 was met at 15/19 with four `component` misses left. Two of them are level errors the rule could
not catch, because the rule was a list of exclusions and both fell between its items:
`session-redis` (the product the cache runs on) and `scheduled-job` (the actor that flipped the
flag) are both deployed things, so excluding "a config object, a code symbol, an upstream
dependency or a UI element" excludes neither. The rule now says both: name the workload for what
it does rather than the product it runs, and name the workload whose behaviour broke rather than
the job, operator or script that triggered the change. Four tests, including the record of what
those two samples answered.

The prediction was committed before the run: **component 17/19, strict 17/19 (89.5%)**.

**It has not been measured.** Run `39901474902` came back `unparseable 19/19` in forty seconds,
and the artefact said only `parseOk: false`, nineteen times — which is what a rate limit, an
expired key, a truncated response and a malformed answer all look like from outside. That is
finding 215, and the repair is in this round: the artefact now carries the reason and the
beginning of the response, the shipped scorer passes them through (it re-declares the fields it
reads, and would have dropped them), and the report prints up to three.

The repair answered the question on its first use:

> `unparseable  DeepSeek API error 402: {"error":{"message":"Insufficient Balance …"}}`

**The provider account is out of credit.** Nothing about the prompt, the dataset or the scorer was
involved, and the 15/19 reading in v2.43 — taken 1h20m before the balance ran out — stands. The
v2.44 prediction stays untested until credit is restored or the provider is switched, and it is
recorded here as untested rather than as a result.

Reading that first output also found a defect in the report: `padEnd(20)` does nothing for a
28-character id, so every line read `…-checkoutunparseable`. The fixture had used `s1` and `s00` —
the only shape the defect does not affect.

**Acceptance.** 11 new tests (9 diagnostics, 2 shipped-script), core **171 / 4251**, cli 4 / 187,
repo **175 / 4438**; typecheck, lint, `docs:check` green; coverage 99.97 / 99.74 / 100 / 99.97 and
100 ×4; `gate-sites.json` re-derived with all 73 proofs carried; audit 5 volumes, findings 1–215.

### Left open

- **The provider account has no balance, and the milestone's re-measurement is blocked on it.**
  `[open: two consecutive dispatches returned `402 Insufficient Balance`. The 15/19 reading is
  valid -- it was taken before the balance ran out -- but nothing can be re-measured, including
  this round's prediction. The remedies are a top-up or a switch to another registered provider;
  both are billing decisions, not code. The instrument now names this in one line, which is the
  only part of it this repository can fix]`
- **v2.44's prediction is untested.**
  `[open: component 17/19 and strict 17/19 were committed in `5ea706f3` before any run. The run
  that would have tested them never reached the model. Whoever restores the balance should
  dispatch, read the number, and either confirm the prediction or record what it got wrong]`
- **Three `component` naming misses remain, two of them now addressed by the prompt and none
  measurable yet.**
  `[open: the link pair (`payment-gateway` answered `order-service`) is still the one with no rule
  that produces both of its annotations, and `tax-calculation-service` for `tax-calculation` is
  still a comparator question refused on purpose]`

## v2.45 — the corpus grows to 30, and fourteen figures move with it

M1 was met at 15/19, and the milestone was weaker than its own number: at 19 samples the strict
rate moves in 5.3-point steps, the threshold sits between thirteen and fourteen, and the margin
was one sample — the size of the drift the instrument has been measured to have. So the key grew:
**eleven new samples**, one to three per category, each obeying the three rules the file already
states (slug absent from its own text, category derived from the type, every component token
present in the incident). The vocabulary went from 19 types to 30.

A corpus here is not a data file. **Fourteen assertions across five test files and one number in a
workflow were functions of its size**, and each had to be re-read:

| where | 19-sample | 30-sample |
| --- | --- | --- |
| `category-derivation` A/B | 19 graded / conforming / defined | 30 |
| `category-derivation` F | 2 disagree (0.1053) | **4 (0.1333)**, still below the floor |
| `category-derivation` R | 4 distinct verdicts over 5040 orders | **8** |
| `category-derivation` O | 19 graded / inert | 30 |
| `denial-inventory` | 19 graded, partition sum 19 | 30 |
| `miss-distractor` | 19 graded | 30 |
| `agreement-baseline` | 1 supported, 0.0526 | 1 of 30, 0.0333 |
| `fault-extraction-accuracy.yml` | 60-row miss-detail cap | **128** |

Two are results rather than denominators: the alternative readings now disagree on 4 of 30 (still
at or below the floor, so "this reading cannot separate anyone" stands), and the row-order space
has eight verdicts instead of four because a new slug — `queue-disk-watermark` — is matched by
both the middleware and the resource rows.

**The cap is the one that would have gone quiet.** The workflow capped published miss detail at
60 rows and its comment said the truncation path existed "for the day the dataset grows". A
fully-missed run is now 90 rows, so that day arrived — and `workflow-provider.test.ts`, which
computes a saturated run and requires `cap >= rows`, failed rather than letting the annotation
truncate routinely.

**One sample was renamed rather than a control loosened.** `agreement-baseline` asserts that an
expected component never carries its own category term, because that would make "the component
supports the category" true by construction. The first draft called a cache service
`product-cache`; the control failed and named it. It is `product-index` now, with its incident
rewritten so both tokens appear. Loosening the assertion was the cheaper edit and the wrong one.

**One test was reading a global it did not own.** A full-suite run failed in `step-process` with
`verify-local-89229-1.sh` — a script written by another vitest worker in the same window, counted
because the assertion diffed the whole of `tmpdir()`. The runner names its files
`verify-local-<pid>-<n>.sh`; the test now filters by its own pid.

**Acceptance.** All 4251 core tests green; coverage 99.97 / 99.74 / 100 / 99.97 and 100 ×4; the six
batteries over this area all caught every injection; `probe-m1-ceiling` reads 30/30 recoverable
with a 100% ceiling and no headroom cost; audit 5 volumes, findings 1–216.

### Left open

- **The milestone has a number on the old instrument and none on the new one.**
  `[open: 15/19 was taken on the 19-sample key; the 30-sample key has not been measured because the
  provider returns 402 (finding 215). The next dispatch after a top-up should read all three fields
  and record the 30-sample strict rate as a *new* baseline rather than as a comparison with 15/19]`
- **The key is 30 samples, which is better and still small.**
  `[open: 3.3-point steps against a threshold between 20 and 21 samples; one sample of drift is now
  worth 3.3 points rather than 5.3, so the margin is narrower in absolute terms even though the
  resolution is finer. A hundred samples would make the milestone's number stable, and that is a
  data project with a review cost per sample]`
- **Three `component` naming misses are still unmeasured.**
  `[open: the v2.44 rule change (product, actor) was never exercised, and the link pair plus
  `tax-calculation-service` remain. All of it waits on the balance]`

## v2.46 — an open item's clause was two claims, and measuring one dissolved the other

The export enumeration has carried this sentence since pass 11: *"the enumeration asserts that a
name is mentioned rather than called"*. It reads as an accusation — the list over-claims tests —
and it is **two claims wearing one sentence**: a measurement nobody had taken, and an inference
drawn from it.

The measurement, taken:

**61 of the 506 names in `TESTED` are named by no test file at all.** The inference does not
follow. A rule requiring each listed export to be imported by a test would have produced 61
findings, and most are false in one way — the export is exercised through a caller:

| name | exercised by |
| --- | --- |
| `readOpenRcaGroundTruth`, `readOpenRcaSubmission` | `score/official.ts` |
| `getUnitDef` | `convertUnit` / `sameDimension` |
| the four CSV builders | `scripts/format-spec.mjs`, whose output a doc gate compares |
| `isVocabularyMember` | `scripts/check-official.mjs`, which has a test |

The rest are zod schemas composed by a tested module and constants whose behaviour is what a test
would assert. So the repair would have been an exemption table with 61 rows — an instrument talked
out of its own finding.

What actually answers "is this export exercised" is the **coverage gate**: `functions: 100`, per
function, over the real suite. The enumeration test now **reads that threshold out of the config
and asserts it**, so lowering it fails in the file whose claim depends on it (`functions: 95`
turns it red; restoring turns it green — checked by hand). A second test computes the 61 live and
requires it to stay **non-zero**: if the two criteria ever collapsed into one, the paragraph above
would become false, and that is worth a failing test rather than a sentence outliving its evidence.

The residual claim is **not** closed and the item was corrected in place rather than struck: no
instrument states *how* each export is exercised, and `index.ts` completeness still rests on
`pack-manifest-completeness` and the `exports` field.

**Acceptance.** 2 new tests (207 in the enumeration file), core **171 / 4253**, cli 4 / 187, repo
**175 / 4440**; typecheck, lint, `docs:check` green; coverage 99.97 / 99.74 / 100 / 99.97 and
100 ×4; audit 5 volumes, findings 1–217.

### Left open

- **No instrument states how each export is exercised.**
  `[open: the list proves existence, the coverage gate proves execution, and nothing in between
  records whether an export is called directly, called through a caller, or reached only through a
  composed schema. A per-symbol call-site map would be the instrument, and the 61-name measurement
  is the population it would have to cover]`
- **The milestone waits on the balance, and now on a new baseline.**
  `[open: M1's 15/19 belongs to the 19-sample key; the 30-sample key has never been measured
  because the provider returns 402. Two rounds of prompt changes (v2.43's boundaries, v2.44's
  component rules) are in the tree and only the first has a reading]`
## v2.47 — a test that edited the source it tests, and 191 failures that named nothing

CI run `39954894209` — v2.46's first push — failed with **191 tests** reporting
`(0 , assertExportableBundle) is not a function` across `official.test.ts` and `score.test.ts`.
The function exists, is exported, and the same commit passes locally three times over.

The mechanism was one test asserting the right property the wrong way: to prove its enumeration is
computed at run time rather than frozen at collection time, it **appended a probe line to
`src/export/guard.ts` and restored it in a `finally`**. `writeFileSync` truncates before it writes,
so for a few microseconds the module on disk is partial — and the suite runs 32 workers, two of
which import that module through the exporters. A worker that imported inside the window got a
module whose binding was missing, and 191 tests failed calling it.

**The failure scales with load, which is why only CI saw it**: the window is microseconds and the
probability another worker hits it rises with worker count and run length. Nothing in the message
pointed at the mutation, and the first reading of that run went back to the prompt and the dataset
before the test file was opened.

The repair does not narrow the window, it removes the write: `exportPairs` now takes a reader, and
the test varies what a module *says* between two calls. A module-level constant still returns the
first answer twice, so the property under test is unchanged — and nothing on disk is touched.
"Keep the write, make it faster" was refused because the window's width is not the property; the
write is.

A second spawn flake surfaced during the same investigation — three `check-doc-counts` cases where
the guard "exited" with no output at all. Its helper already retried `EAGAIN`/`ENOMEM`; it now also
retries a killed child (`status: null`) and asserts that **every exit prints**, which turns the
next occurrence into a message carrying status, signal, spawn error and the emptiness. **The cause
is not established and is not claimed**: what is established is that the next one names itself.

**Acceptance.** Three consecutive full runs at **4253 passed**; the `functions: 95` mutation is
still caught; core **171 / 4253**, cli 4 / 187, repo **175 / 4440**; typecheck, lint,
`docs:check` green; coverage 99.97 / 99.74 / 100 / 99.97 and 100 ×4; audit 5 volumes, findings
1–218.

### Left open

- **A spawn under load can return "no output, exit 0" and nothing explains it.**
  `[open: observed three times in one full-suite run of `check-doc-counts`, never in isolation and
  never in CI. Both known "never ran" shapes now retry and both are reported with details, but the
  cause of an empty success is unknown -- the guard has two exits and both print, so the state is
  not producible by the script as written]`
- **The race class has one member and no guard against new ones.**
  `[open: only `export-surface-enumerated.test.ts` wrote into the tree; nothing checks that no test
  does. A test asserting "no test file writes under packages/*/src" would be a static scan of test
  sources for a write call whose target resolves inside the package -- possible, not written, and
  the next such test would be found by a red CI instead of by that scan]`
