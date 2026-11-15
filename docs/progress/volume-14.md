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
| `core` test suite | **244 files, 6226 tests passed** (at v3.75) |
| `cli` test suite | **4 files, 187 tests passed** (at v3.75) |
| repo test suite | **248 files, 6413 tests passed** (at v3.75) |
| coverage | `core` **99.97 / 99.82 / 100 / 99.97** (statements / branches / functions / lines), `cli` **100 / 100 / 100 / 100**; `scripts/check-official.mjs` is outside the instrumented tree, and the branch this round fixed is covered by the suite's own assertion instead |
| new tests | **6225 -> 6226, +1**: the round trip's field-contract branch, driven by a corpus case whose log table is off-contract |
| mutations | **61 -> 62** injections, **73 -> 74** witnesses; 61 caught, 0 survived / inert / unattributed, 1 redundant as declared |
| the weekly job | red on 2026-11-02 and 2026-11-09 with the same `TypeError`; the fixed script prints `shape=2` and both check ids for the reproducing fixture |
| list | **23 -> 24** open: one entry for what the weekly job's sentence will say about the real case |

**The lesson.** A branch that only a failing input can reach is a branch that no green run has ever
executed, and its first execution is either a correct refusal or a crash — there is nothing in between
and nothing before. The way to know which is not to read it carefully; it is to write the failing input.

## v3.76 — a two-hour run that died with three sentences and no artifact

v3.75 fixed a crash so that the round trip could say which field a case gets wrong. The next dispatch
ran the fix, and it is the run that made this round:

```
ROUNDTRIP PASS   2/270 RE2-OB/checkoutservice_cpu/2   oracle=1.00 signals=317010
ROUNDTRIP FAIL   2/270 RE2-OB/checkoutservice_cpu/2   shape=1
...
ROUNDTRIP FAIL 180/270 RE2-SS/user_socket/3   reason=RE2 declares a traces table and traces.csv is not readable
FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory
```

84 minutes, 180 of 270 cases, and three things to show for it: two `shape=1` lines with no sentence, 90
identical failures over a table the benchmark never wrote, and a death at the first TrainTicket case.
The artifact uploaded from that run holds `pins.json` and `rcaeval-cases.json` and **no scores**.

So the round is not "fix the OOM". It is: a run that long has to surrender its findings even when it
dies, and the three findings it had are each a defect of their own.

### One — the sentence went to the epilogue (finding 497)

`shape=1` is a count. The sentence naming the failing check was pushed onto a list printed once, before
the exit, and the run never reached the exit. Both branches that report a per-case failure now print
their sentence on the case's own line; `scored !== 1` printed nothing at all before, and now prints the
score and the reason.

### Two — "written before every exit" does not cover an abort (finding 498)

`emitScoreReport` stood before each `process.exit`, and `process.exit` was never called. The report is
now written from a `finally` that wraps the loop body — one call site, nine ways out of a case — and the
test kills a live run with `SIGKILL` once the first record lands and asserts the file holds what the run
had measured. It also carries the two things an artifact written at case 40 can still say: what the
corpus ships per slice, and what the run had cost so far.

### Three — the heap was never declared, measured or reported (finding 499)

Node's default cap is 4 GB and nothing here said so. A case of `RE2-TT`'s size needs more than that; the
measurement is 17 MB of heap per MB of CSV, taken on a synthetic case in the corpus's own shape (122 MB
of tables costs 2 105 MB at the ingest boundary). The run now prints its heap and its budget before the
first case, samples the heap five times per case, prints a `ROUNDTRIP COST` line when a case is heavier
or slower than all of them, reports the total at the end, and **fails** at 90% of its budget with the
case named — because a run at 95% has one case left before it dies, and that death has no sentence in it.
The workflow declares `--max-old-space-size=7168` and `timeout-minutes: 300`, both with the arithmetic
that produced them: 35 s a case measured on Online Boutique, 270 cases, 40 minutes of fetch.

### Four — the plan spoke for a suite, the corpus ships per slice (finding 500)

90 of 270 cases failed on `RE2 declares a traces table`, and they were exactly cases 91–180: the whole
SockShop slice, which ships `logs.csv` and no `traces.csv`. `RE2` is four characters covering three
corpora. Three places stated the suite's rule and all three had to move: the plan (now
`SLICE_MODALITY_PLANS`, looked up by the case id's first component), the absence rule (now one refusal
per slice and table with the count, because "this slice has no spans" and "the download lost half of
them" are different facts), and the layout contract (`checkRcaEvalStructure` takes an
`ExpectedModalities`, defaulting to the suite rule, and the round trip states the case's own answer
because it has read the directory).

The parameter is an **equality**: a caller that says `traces: false` about an export that carries spans
fails. It can move the expectation onto what the case is; it cannot be used to stop looking, and a third
test holds that a target with no log/trace pair refuses the argument rather than ignoring it.

### Readings

> Ledger for `v3.76`.

| item | value |
| --- | --- |
| `core` test suite | **244 files, 6234 tests passed** (at v3.76) |
| `cli` test suite | **4 files, 187 tests passed** (at v3.76) |
| repo test suite | **248 files, 6421 tests passed** (at v3.76) |
| coverage | `core` **99.97 / 99.82 / 100 / 99.97** (statements / branches / functions / lines), `cli` **100 / 100 / 100 / 100**; `scripts/check-official.mjs` is outside the instrumented tree and is held by the round trip's own spawns |
| new tests | **6226 -> 6234, +8**: three for the report that survives a kill, the heap lines and the budget refusal; three for the per-case modality expectation (logs-only accepted, a table the export wrote refused, a non-RCAEval target refusing the argument); two more in the modalities file for a slice whose plan is its own and for a slice that carries a table on some cases only |
| mutations | **62** injections, **74** witnesses; 61 caught, 0 survived / inert / unattributed, 1 redundant as declared. `REPORT 1` was retargeted onto the line that now carries the sentence |
| the weekly job | 180 of 270 cases in 84 min, then `exit code 134`; 90 of those 180 failed on the SockShop traces claim, 2 on the layout contract, 88 passed |
| measurements | 17 MB of heap per MB of CSV; a 122 MB case costs 2 105 MB at the ingest boundary; 35 s a case on Online Boutique; the job's 90-minute bound held a ~200-minute round trip |
| volumes | `progress/volume-12.md` closed at v3.63 and `progress/volume-13.md` opened with v3.64 — forced by 432 bytes of headroom. The split left the live list 15 bytes under `volume-02.md`, a volume closed since v3.55, so the relation `progress-volumes.mjs` enforces has no room left and no repair (finding 501) |
| list | **24 -> 22** open: findings 497–500 close the three defects and the plan claim; the two entries about what the next dispatch must confirm replace them |

**The lesson.** A run of two hours is a measurement that has to be made durable before it is made
complete. Every writer in this repository was called "before every exit", and an abort is not an exit —
so the longest-running job in the tree was the one whose findings could vanish entirely, and it did, for
two consecutive weeks, in the same place. The repair is not a bigger heap; it is that the record is
written where the work is done, that a failure carries its sentence on its own line, and that the memory
a corpus needs is a number somebody wrote down.

## v3.77 — a bound that cannot move is a constant

`check-progress-volumes.mjs` required this index to be smaller than **every** volume, and the smallest one
is `volume-02.md`: 92,355 bytes, closed eleven volumes ago, with nothing permitted to append to it. So the
bound was not a budget a round could plan against. v3.76 opened with 955 bytes of headroom and closed with
15, and what it did to get green was shave three paragraphs of its own new entries until the arithmetic
fitted. That is the shape this audit keeps finding: a number that is checked, and a repair it names that
does not exist.

### The relation was right and the set was wrong (finding 501)

"Not bigger than the things it indexes" is a claim about what a reader needs, and the round that wrote it
was replacing a claim nobody had measured ("the largest single file in `docs/`"). The claim is still
right. The set is not: a volume that has been closed records a size it *had*, so comparing against it
constrains the future with a fact about the past, and the moment the smallest volume was closed the
relation stopped being a relation and became a constant wearing one's clothes.

The number the round would have had to find is now known, because the round found it: the index is
**92,927** bytes and `volume-02.md` is **92,355**. The first edit that made this round true -- a
paragraph of prose about splitting, and one new entry in the list -- put the index **572 bytes past the
volume it was being measured against**. Under the old rule this round is refused before any of its
subject can be written; that is not a prediction, it is what the arithmetic said when the change was
half made.

### The comparison is against the volume that is still open

`check` now names the subject: the last volume, the only one anything appends to. It prints it
(`index 92,927 of open volume 104,534` when the change was made), refuses with two repairs that both
exist, and the headroom is **11,607 bytes that grow** rather than 15 that do not -- the open volume gains
about 8,000 bytes a round (`volume-13.md` held thirteen rounds in 104,534) against the index's 1,100, so
the gap widens by roughly seven kilobytes a round instead of closing.

**Measured while this section was being written**: the open volume went 104,534 -> 110,580 as it was
drafted, so the gap moved 11,607 -> 17,653 against an index that had not changed at all. That is the
mechanism working on its first round rather than a projection about it, and it is the half of the old rule
that was missing -- a bound whose right-hand side grows while the round is writing.

Two things survive the change, and they are the reason it is a repair rather than a deletion:

- **The split instruction.** A new volume must be **born** larger than the index, or the relation is false
  the moment the boundary is drawn. That is the reason v2.47's split moved twenty-one rounds, and it is
  now the rule rather than a consequence of one.
- **A ceiling, by transitivity.** The index can never exceed `MAX_BYTES`, because the open volume it must
  stay under cannot. An index that reaches the volume budget has become a document, and the number it is
  measured against is a chosen one with a stated meaning rather than an accident of which volume closed
  smallest.

### What is given up is stated, and what it costs is an entry

The index may now be bigger than a closed volume, and it is -- by 572 bytes, today. That is accepted for
the reason the volume budget is judged only on the last volume (finding 208): a closed volume is a record.

What the rule does not do is stop the list from growing. A struck entry stays where it is struck, so
`## Open` gains bytes every round whatever the bound is, and the ceiling above is reachable. That is a
limit with no reader, so it is entry **27** in the live list rather than a sentence here: the round that
reaches the ceiling will have to move the closed part of the list into a volume, and nothing measures how
far away that is.

Three fixtures carry the change, and the pair matters more than any one of them: a closed volume the index
has **passed** is not a failure, and an open one it has passed **is** -- asserted together, because a rule
that only ever sees the second cannot tell the repair from a deletion.

### A record dated "this commit" is a claim about now (finding 502)

The rule above was half finished when `docs:check` refused: v3.76's ledger published `core 244 / 6234`
with `(as of this commit)`, this round added one test, and the guard read two rows of a **frozen** record
as a claim about the present -- correctly, because that is what the phrase means to it. The phrase is the
defect, and both spellings of it are wrong for a record: "this commit" names the tree only while it is the
tree being written, and the anchored `(as of `sha`)` names a commit the publishing pipeline rewrote, so no
reader can resolve it. Those three rows say `(at v3.76)` now -- a label that survives a push -- and the
newest ledger keeps the one claim about the present, which the round after this one will date.

### Readings

> Ledger for `v3.77`.

| item | value |
| --- | --- |
| `core` test suite | **244 files, 6235 tests passed** (at v3.77) |
| `cli` test suite | **4 files, 187 tests passed** (at v3.77) |
| repo test suite | **248 files, 6422 tests passed** (at v3.77) |
| coverage | `core` **99.97 / 99.82 / 100 / 99.97** (statements / branches / functions / lines), `cli` **100 / 100 / 100 / 100** |
| new tests | **6234 -> 6235, net +1**: the two relation cases became three -- a closed volume the index has passed (the defect, red before the change), an open one it has passed with the volume named and `smallest` absent from the sentence, and the printed pair |
| mutations | **63** injections, **75** witnesses; 62 caught, 0 survived / inert / unattributed, 1 redundant as declared. `VOLUME 1` restores the smallest-volume set and is caught by the fixture whose closed volume the index has passed -- the rule had three fixtures and no injection, which is how a rule is covered without being *proved* |
| the relation | index **92,927** of `volume-02.md`'s 92,355 -- **572 bytes past a volume it is no longer measured against** -- and of the open `volume-13.md`'s 104,534, which is 11,607 bytes of headroom that grows; drafting this section moved the open volume to 110,580 and the gap to 17,653 |
| the index's rate | 86,804 at v3.71 to 92,340 at v3.76: **1,107 bytes a round** over five rounds, so the old bound demanded about that much be deleted from every round's own write-up |
| the open volume's rate | `volume-13.md` holds thirteen rounds in 104,534 bytes, **8,041 a round**, so the gap widens by roughly seven kilobytes a round |
| the frozen ledger | v3.76's three rows carried `(as of this commit)` -- a claim about now, sitting in a record -- and say `(at v3.76)`; the newest ledger keeps the one present-tense claim (finding 502) |
| list | **26 -> 27** open: the repair closed a residual that lived only in v3.76's ledger row, and the limit the new rule leaves behind is the entry added |

**The lesson.** A relation is not a bound unless the thing on the right-hand side can move. The rule here
was written to replace a pinned number, and it became one -- not by being wrong about what an index is,
but by naming a set whose smallest member had been frozen eleven volumes earlier. The tell was not in the
rule; it was in the round that had to delete three paragraphs of its own evidence to satisfy it. When a
gate's refusal names a repair and the repair is not available, the gate is measuring the wrong object,
and the arithmetic of the next round is what says so.

## v3.78 — a case three hops deep, and two lists of the same names

The live list carried one item about a **knife edge** rather than a missing feature: four of thirty-three
earned `L4` is 0.121, three of thirty-two is 0.094, and the floor the corpus publishes is a tenth. So one
edit shortening one chain could put the corpus under its own claim, and the entry asked for two things at
once -- a case whose chain is three hops deep, and a denominator measured rather than inherited from a
corpus three times smaller. This round is both, and while it was being written a second hole came out of
the case it added: the prompt's vocabulary and the corpus's labels were two lists of the same names with
nothing comparing them (finding 503).

### The case the corpus was missing was the one at the hard end

`history-queue-duplicate-publish-ingest-writer` is annotated from the corpus's own incident text, and it
carries the chain the audit kept asking for: `container:ingest-writer-jvm -> pod:ingest-writer-0 ->
service:ingest-writer -> mq:ingest-queue`. Three hops, ending at a **queue** rather than a service or a
caller -- the first chain in the corpus that arrives somewhere whose *contents* are wrong rather than whose
latency is.

Two properties make it the case that was missing, and they are different properties:

- **The demanded reading is a ratio across two systems.** Records on the topic against documents in the
  bucket, `records_per_document = 4`. Every reading this pipeline took before it was an excursion *inside
  one series*, and an excursion is exactly the shape a duplicate does not have: nothing doubles, one
  number lags. A throughput graph shows a hole and the corpus's own method calls the publisher slow.
- **Its loudest series is a control.** Append p99 holds at 8ms, the disk watermark moves 35 -> 39 percent,
  and the container sits at 0.4 of its quota for the whole window. So ranking by magnitude returns the
  topic -- healthy, holding four copies of every document -- and the cause is a container that is *waiting*
  rather than saturated, which is the one thing its CPU reading can say and the one thing a magnitude rank
  never asks.

Writing it also cost four refusals from `check-fault-cases`, and each was a rule that had never been run
against this shape: `count/s` is not a unit the corpus knows, `4.02` cannot live in a `1`-dimensioned
series, `count` does not admit a fraction, and a case with no logs and no traces still has to say so in a
sentence. The corpus gate was right four times.

### The denominator is derived from the floor, not quoted from a smaller corpus

The entry's second half was the number `0.1`. Five of thirty-four is 0.147, which passes -- and the tenth
had been inherited from a corpus of nine, where it happened to be the same digit for a different reason.
`difficulty-floor.test.ts` now derives what the tenth *means*: the size at which the same numerator stops
satisfying it is `floor(5 / 0.1) + 1 = 51`, printed as a bound rather than assumed, so a reader can see how
much room the claim has instead of being told it has some.

The knife edge is now asserted from both sides in one test, because a ratchet that can lose one case and a
ratchet that can lose none differ by a single case and no fixture distinguishes them one at a time:

| | earned `L4` | corpus | share | against 0.1 |
| --- | --- | --- | --- | --- |
| as shipped | 5 | 34 | 0.147 | passes |
| lose any **one** | 4 | 33 | 0.121 | still passes |
| lose any **two** | 3 | 32 | 0.094 | fails |

So the corpus can afford exactly one, and the test says so by dropping each earned case in turn and then
each pair -- not by quoting 0.147 and trusting that dropping one leaves it above the line.

### Two lists of the same names, and nothing compared them (finding 503)

`samples.json` states the fault types twice: `types` is the **closed vocabulary the prompt offers**, and
each sample's `expected.type` is the **label the corpus gives it**. `fault-prompt-grammar` read the first
for shape -- no duplicates, a count the gate re-derives -- and `checkSampleCoverage` read the second for
coverage. Nothing compared them, so the vocabulary's content was unguarded in both directions: it could
name a type no case carries, and it could omit a type a case carries.

**The hole was proved before it was closed.** Adding this round's case meant adding its type, and deleting
`queue-duplicate-amplification` from `types` afterwards left `fault-prompt-grammar` and
`check-fault-cases` both green -- the corpus would have shipped a case whose answer the prompt declared
illegal and its own gate would have called that a pass. `checkSampleVocabulary` now returns one refusal per
direction (`asks for a type the prompt does not offer`, `no sample labels it`), `check-fault-cases` applies
it where the file is already open, and the export test enumerates it so the next rule cannot be added
without a name.

Six fixtures would have been the v3.77 shape again -- covered rather than proved -- so the round added a
**mutation** in the same breath: `VOCAB 1` empties the direction that refuses an unoffered label, and the
fixture that names one is the witness. The battery reads **64 injections, 76 witnesses**, one of each being
this rule.

### Readings

> Ledger for `v3.78`.

| item | value |
| --- | --- |
| `core` test suite | **244 files, 6244 tests passed** (at v3.78) |
| `cli` test suite | **4 files, 187 tests passed** (at v3.78) |
| repo test suite | **248 files, 6431 tests passed** (at v3.78) |
| coverage | `core` **99.97 / 99.82 / 100 / 99.97** (statements / branches / functions / lines), `cli` **100 / 100 / 100 / 100** |
| new tests | **6235 -> 6244, net +9**: six fixtures for the vocabulary rule (agreement, each direction, both in one refusal, a repeated type counted once, a key with no samples), two more for the two plurals -- the branch either side of `length === 1`, which the branch report called covered while no fixture had taken it -- and one for `check-fault-cases` applying the rule to a key whose `types` is one short |
| mutations | **64** injections, **76** witnesses; **63 caught**, 0 survived / inert / unattributed, **1 redundant as declared**. `VOCAB 1` empties the direction that refuses an unoffered label, and four fixtures go red with the one that names it |
| the corpus | **33 -> 34** cases; `34 of 34` answer the prompt; vocabulary **30 -> 31** types; `provenance.categoryRule` **33 of 33 -> 34 of 34** |
| the hardest level | claimed **6**, earned **5**, `5 of 34`; chain lengths are read from the graph, so the sixth claim is a label the gate refuses to count |
| the ratio | `records_per_document = 4` on the topic against the bucket -- the corpus's first reading that is a comparison between two systems rather than an excursion inside one |
| the knife edge | lose any one earned case: 4 of 33 = 0.121 (passes); lose any two: 3 of 32 = 0.094 (fails); the size at which five stops being enough is `floor(5 / 0.1) + 1 = 51` |
| list | **27 -> 26** open: the entry about the knife edge is closed by the case and the derivation, and the vocabulary hole it exposed was closed in this same round rather than filed |

**The lesson.** A gate is only as wide as the shape it has been run against. Three guards read
`samples.json` -- shape, coverage, and which type a sample may answer with -- and all three were green over
a file that could name a type no case carried, because each one read the half it was written for and the
sentence that would have joined them had never been needed. The case did not reveal this by being hard; it
revealed it by being the **first case added since the vocabulary became closed**, which is the general
form: a rule about a set is tested by the set growing, and nothing about a green suite says the last
addition was checked.


## v3.79 — two readings that were written after the loop

The dispatch this round was written for finished, and what it delivered was the opposite of a reading: the
three P0 items all came back **answered**, and every answer was a defect.

- The case line finally carried a check id: `data-csv-time`, for two cases of 270, with the sentence that
  names both clocks. Two of 270 is a corpus shape and needs no repair; the entry that had waited three
  rounds for it is closed.
- The heap question was answered by the run dying: **6,960 MB of a 7,216 MB budget, 96%, at case 182** --
  the first TrainTicket case, 1,433,140 spans against SockShop's 95,000 -- and the refusal that existed to
  warn before that moment fired **zero times**.
- The census question was answered by silence: `CENSUS modalities RE2-TT` never printed, on the only run
  that has ever reached TrainTicket.

Both silences have one cause, and it is the same one this corpus has now paid for three rounds running: a
sentence that is computed **after the loop** is a sentence that a run dying inside the loop never says.

### The refusal was on the far side of the loop (finding 504)

The heap guard was computed once, over the whole run, from the largest heap any case had been observed at.
A test drove it with `--heap-budget 1` and it passed. Its purpose is to say *"the next case of that size
will not fit"* **before** the process is killed, and it ran at the only moment when that can no longer be
true.

The refusal now lives in the per-case `finally`, where the number it reads is computed: at 90% of the
declared heap the run pushes the sentence, names the case and the share, records what it scored, and
**stops deliberately**. `declared 3, scored 1` is a subset that is stated -- the difference between a
partial run and a partial run standing in for the whole.

The declared heap was wrong as well, and in the direction that matters. 7168 was 3.4× the largest case
measured locally, on a synthetic case; the corpus's own largest is not that shape. The curve says so
plainly: **4,100 MB at case 54, then flat for 128 cases**, and then a step past 6,960 MB. A flat line
followed by a cliff is the one shape a "largest observed so far" statistic cannot warn about, which is
why the check is per case rather than over a summary, and why the workflow now declares **12288**.

### The census printed after a loop the interesting run did not finish (finding 505)

`ROUNDTRIP CENSUS modalities <slice>: logs n/m, traces n/m` is the line that says what a slice ships. It
was printed in the epilogue from a map filled inside the loop, so the one dispatch that reached
TrainTicket is the one that printed nothing about it -- one line after `PASS 181/270` and before the
`ROUNDTRIP MODALITY` line that would have described its tables.

Every number in that line is a fact about the corpus that is known when the walk ends: each declared case
either has `logs.csv` in the file set or does not. `takeCensus` now runs over the descriptors before the
loop and `printCensus` is called once, above the first case. A run stopped by its own budget refusal now
says what the **whole** slice ships, because the count is a property of the corpus rather than of the
cases that got as far as a comparison.

### The example in the audit was a measurement nobody took (finding 506)

Finding 499 published the shape of the line the repair would print -- `largest 3712 MB of the 7168 MB this
run was given (52%)`, `201.4 min`, `slowest 51.3 s` -- in a fenced block, in the position a reading goes.
No run produced it: it was 270 cases at Online Boutique's rate and 3.7 GB from 17 MB per MB. The first run
that reached the case named in it died there at 96% of the same budget, so the projection was wrong by a
factor of two **in the optimistic direction**, and it was indistinguishable from a number somebody had
measured.

The block is a projection now, labelled as one, with the two readings that replaced it beneath it. The
repair is not the arithmetic -- it is that a document must not print an output, because a reader has no
way to tell.

### Readings

> Ledger for `v3.79`.

| item | value |
| --- | --- |
| `core` test suite | **244 files, 6246 tests passed** (at v3.79) |
| `cli` test suite | **4 files, 187 tests passed** (at v3.79) |
| repo test suite | **248 files, 6433 tests passed** (at v3.79) |
| coverage | `core` **99.97 / 99.82 / 100 / 99.97** (statements / branches / functions / lines), `cli` **100 / 100 / 100 / 100** |
| new tests | **6244 -> 6246, net +2**: the three-case run under a 1 MB budget must stop after one case and still print the census for all three; and the census must appear before the first `ROUNDTRIP PASS` rather than after the last |
| mutations | **66** injections, **78** witnesses; **65 caught**, 0 survived / inert / unattributed, 1 redundant as declared. `HEAP 1` removes the guard and `CENSUS 1` moves the print back into the epilogue; both are placement mutations, because placement was the defect |
| the run | `42674673341`: **182 of 270 cases** in 90 minutes, then `FATAL ERROR: Reached heap limit` at 6,960 MB of 7,216 |
| the curve | 2,935 MB at case 1, **4,100 MB at case 54**, flat to case 181, **> 6,960 MB at case 182** |
| the check id | `data-csv-time`, 2 cases of 270 (`checkoutservice_cpu/2`, `checkoutservice_mem/2`); the other 168 failures carry `modalities` and no sentence, because their reason is the `MODALITY` line above |
| the heap | declared **7168 -> 12288**, and the number is now bounded by a sentence rather than by a projection: the refusal names the case and the share |
| list | **26 -> 26** open: the check-id entry is closed, the heap and census entries are rewritten with the readings and stay open, and the modality comparison's two signature maps are a new entry |

**The lesson.** A reading and a repair have the same requirement: they must exist on the path the failure
takes. This corpus has now moved four of them -- v3.75's sentence, v3.76's report, and this round's refusal
and census -- and each time the number was right and the position was wrong. The question that finds this
class before it costs a dispatch is not "is this measured" but **"is this measured somewhere the run is
still alive"**, and the cheap test is the one this round added twice: kill the run early, and assert that
the sentence a reader needs is already in the log.

## v3.80 — the instrument that named one quantity as another, eight numbers nothing read, and a proof of a throw that proved it exits

This round did not start from the plan. It started from the suite refusing to run: the first
`pnpm test:coverage` on the machine it was written on exited 1 with **6,246 of 6,246 tests
passing** and one file over the stall budget. Both of the round's other two findings came from
the same question -- *what does this number actually measure* -- asked of a document table and
of the inventory's own diagnostic.

### The gauge measured wall clock and named the file (finding 507)

`gate-sites-are-proven.test.ts`, one file, one revision, one command, four readings:

| reading | configuration |
| --- | --- |
| 11,905 ms | that file alone |
| 11,547 ms | that file alone, with coverage |
| 14,448 ms | full suite, `--maxWorkers=2` |
| 23,897 / 43,895 / **47,727** ms | full suite, four workers, three runs |

The budget is 45,000. The only variable across those four readings is what else was running, so
the verdict "this test file held the event loop" is a claim about the file that three of the
four readings do not support. The gauge exists to prevent a run that is red with nothing failing,
and on this box it produced one.

Two repairs, and the second is the one that makes the suite green. **The reading now carries both
quantities**: `stop()` returns `{ longestMs, cpuMs }`, the CPU figure is sampled per tick so it
belongs to the longest stall rather than to the run, and the verdict prints both without claiming
to know which cause it was -- a low CPU figure is also what a descheduled process looks like.
The budget stays on wall clock, because the deadline it guards is a wall clock.

**The file's cost was repairable, and the split is what said so.** Measured alone, 9,630 ms of
wall against **820 ms of CPU**: the work was I/O. Twenty-nine calls to `pointerRoot()` each copied
a 107-file fixture into `tmpdir()`, and every rule re-read and re-scanned the same ~60 test files.
The fixture is now copied once, reads are cached by `(path, size, mtime-ns)` -- `make`'s
invariant, so a rewritten file is seen and a file that appears later is seen -- and the two scans
are memoised by the body itself, which cannot be stale by construction. Alone: **11,905 -> 2,503
ms**, CPU 253 ms. At the multiplier that produced 47,727 ms, the same file now lands at about a
tenth of the budget.

`publish.test.ts` is the next-nearest and is named rather than left to be discovered: 28,183 ms
without coverage and 31,855 ms with it, 71% of the budget, in `git` process starts. That is a
measurement, not a repair, and it is on the open list.

### Eight numbers, eight wrong, and nothing reading any of them (finding 508)

`## Repository` publishes the size of this repository in eight rows. Measured against the tree:
commits `95` for 530, source files `45` for 97, source lines `13,483` for 33,706, test files `78
core` for 245, test lines `25,174` for 104,552, tests `2341` for 6,267, tracked files `208` for
633. `grep -rn 'Tracked files\|Source lines\|Source files\|Repository' scripts/` returns nothing,
and `check-doc-counts.mjs` reads 352 counts out of the same file without reading this table,
because its subject is rows carrying a count in one of the shapes it knows. The one table that
answers "how big is this" was the one table with no reader.

`scripts/check-repository-table.mjs` now performs all eight derivations and refuses a drifted
value, a label it cannot derive, a table that lost a row, a `Commits` cell whose dated revision
does not resolve, and a test-file count on which its glob and the suite's own measurement
disagree. `Commits` is *dated* -- the one row that cannot be current, because the commit that
writes it is the commit it would have to count. Twelve tests drive every refusal against a
**five-file repository** built in `tmpdir()`, which is what `--root` and `--doc` are for.

### The inventory recorded a success line as a failure's diagnostic (finding 509)

The deriver takes the nearest printed string above a site, and this round's own gate printed its
verdict before its failure branch -- so the inventory published `check-repository-table: OK (...)`
as what the site says when the table is **wrong**. Nothing could see it: the annotation was
carried, the proof resolved, the site was counted. The repair is one reordering, and the rule that
would have caught it is `violationsOf` rule 11, which refuses a diagnostic matching `:\s*OK\b` on
either population. Zero of 133 sites and zero of 99 throw rows carry one today, and it fails on
the corrupted inventory the battery builds, which is the only way to know a rule can fail.

### The proof of a throw row proved the gate exits (finding 510)

The full gate run failed at step 8 of 34, in the half of a proof that reachability does not answer:
`verify-sites-are-sensitive.mjs` hollows each exit and each `throw` in turn and asks whether some
test goes red. It named `scripts/check-repository-table.mjs:380`, the `throw` inside `rewrite()`
that refuses to repair a table containing a row it cannot derive.

The battery's own recommended experiment agreed with it: **delete that line and the file passes,
twelve of twelve**. The test meant to prove the row asserted three things -- exit status 1, the
sentence about the revision, and that the label was still in the document -- and all three survive
the deletion. The cell is written as `[object Object]`, the `--write` run re-reads its own output,
finds the same unresolvable revision there, prints the same sentence, and exits 1; the label
survives because a rewrite does not touch labels. **A rewrite that damages the document and then
reports the damage passes every one of those assertions.**

The comment above that test had the property right and the assertion had it weaker:

> it has to stop rather than write the other seven and leave the eighth as it was, which is a
> half-repaired table that reads as a repaired one

"Stop rather than write" is byte equality with what was there before, so that is what the test
asserts now, and the same deletion turns it red at the assertion that reads the file back. The
lesson is not about this one test: a property stated in prose agreed with the code for the whole
life of the defect, and the only thing that disagreed was the same property stated as an assertion.

### Readings

> Ledger for `v3.80`.

| item | value |
| --- | --- |
| `core` test suite | **245 files, 6267 tests passed** (at v3.80) |
| `cli` test suite | **4 files, 187 tests passed** (at v3.80) |
| repo test suite | **249 files, 6454 tests passed** (at v3.80) |
| coverage | `core` **99.97 / 99.82 / 100 / 99.97** (statements / branches / functions / lines), `cli` **100 / 100 / 100 / 100** |
| new tests | **6246 -> 6267, net +21**: twelve for `check-repository-table` (every refusal, `--write` idempotence, and a document it cannot read), five for the stall gauge (the CPU split, its attribution to the longest stall, and the verdict naming both numbers), and four for the fixture and the two caches in `gate-sites-are-proven.test.ts` |
| the four readings | one file, one revision: **11,905 / 11,547 / 14,448 / 23,897 · 43,895 · 47,727** ms for alone / alone+coverage / 2 workers / 4 workers |
| the repair | **11,905 -> 2,503 ms** alone, CPU **820 -> 253 ms**; 29 fixture copies -> 1; reads and scans memoised by identity and by body |
| the fingerprint | `check-repository-table.mjs:408` published its own success line as its failure diagnostic; reordered, and rule 11 now refuses the shape on both populations |
| the table | eight rows, eight wrong: **95/530 commits**, **45/97** source files, **13,483/33,706** lines, **78+3 / 245+4** test files, **2341+173 / 6267+187** tests, **208/633** tracked |
| list | **26 -> 28** open: two new entries -- the worker count that decides the stall verdict, and the next-nearest file at 71% of the budget |
| the battery | `verify-sites-are-sensitive` named **1 problem**: `check-repository-table.mjs:380`, which the file survived being deleted from -- **12 of 12 green** -- and which now fails the same experiment at the assertion that reads the document back |
| the table after the repair | `Test lines` **104,552 -> 104,560 core**: the eight lines the new assertion and its comment added, which `check-repository-table` caught before any reader did |

**The lesson.** A measurement is two things -- a number and the name of what it measures -- and
this round found four places where they had come apart: a stall labelled "this file blocked" that
was mostly a loaded box, a table labelled "at this revision" that was 120 revisions old, a
diagnostic labelled "what this site says when it fails" that was the sentence it prints when it
succeeds, and a proof labelled "this exit is needed" that held with the exit deleted. The fourth
is the one worth carrying: its property had been written down correctly, in prose, directly above
the assertion that failed to express it -- so what the round adds is not only the four repairs but
the observation that **a property in a comment is a claim, and a property in an assertion is the
only one that can disagree**.

## v3.81 — the comparison that decides 168 cases had never been measured, and it cost 1.9 KB per row

This round started from the dispatch that v3.79 left as the last P0. Run `42707814166` (`d179592`,
anchor `rcaeval-re2`) was the one that finally carried a TrainTicket case --
`RE2-TT/ts-auth-service_cpu/1`, `signals=1433140`, against SockShop's 95,000 -- through the case and
then died **59 seconds later**:

```
[2695:0x13b5e000] 3094531 ms: Mark-Compact 11992.8 (12322.8) -> 11990.2 (12320.6) MB, allocation failure
FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory
```

`NODE_OPTIONS="--max-old-space-size=12288"` was in that command, so the declaration v3.79 raised was
being spent: 12,005 MB of live heap against a 12,288 MB budget. What the round before it knew was
that the **ingest** peak was 4,100 MB and flat for 180 cases -- and that no run had ever carried one
of those cases to the end of the **modality comparison**, which is the function 168 of the 270
cases' failures were about.

### The number it had never had (finding 511)

`scripts/probe-modality-memory.mjs` builds a table in the corpus's shape and measures the peak heap
of one comparison. The same probe was run against the shape that shipped and against the shape this
round wrote, on the same 400,000 rows:

| rows | shape | peak heap | bytes/row | elapsed |
| --- | --- | --- | --- | --- |
| 400,000 | both tables materialised, one `Map<string, number>` of signatures a side | **734.4 MB** | 1,925 | 3,845 ms |
| 400,000 | both tables walked, one sorted signature array a side | **37.2 MB** | 98 | 2,104 ms |
| 1,433,140 | walked, an export that matches | **313.8 MB** | 230 | 6,245 ms |

The last row is the case the run died on. The old shape was **not** run at that size: 19.7x per row
is about 2.76 GB, and the machine has to stay usable while the suite runs, so that figure is an
extrapolation and is written as one. The mechanism was two maps of long strings on top of two
materialised tables -- a map entry costs roughly three times a slot in a sorted array, and the key
costs a string either way, so the map was the part that could go.

### One state machine, two entry points

`parseDelimited` is now a thin wrapper over a new `delimitedRows` generator. One parser, because a
second one would be a second answer to what a quoted field is, and this repository has paid for that
shape twice (findings 204, 316). The comparison walks both tables, keeps only each row's signature
and drops the row; a generator rather than a callback because a `derived` column is checked against
the same row of the *other* side, so the caller advances two walks independently.

The second half is a branch that is a theorem. A per-column multiset difference is a projection of
the row-level one, so when the two multisets of signatures agree, every `differ` is zero by
construction and the arrays behind it are never built; on a failing case they are built a column at
a time and released before the next. That is why the passing path is 40% faster than the failing one
on the same input, and it is written in the code because a reader who did not know the theorem would
read the missing measurement as an oversight.

### What holds the shape

A second implementation of the same specification, in the opposite shape -- materialise everything,
count with maps, index both sides by row number -- drives **60 generated tables** through both and
compares every field of the verdict. The two share the specification and no line of code. Setting
`needsDiffer: false`, which looks like an optimisation, makes it fail; that is the only way to know
the oracle is watching. Six tests hold the walker against the collecting entry point on the fixtures
the parser already had, and four hold the probe -- that it reaches the comparison on both paths, that
it names the module it measured, and that both of its refusals fire.

### A table that could not be parsed was reported as empty (finding 512)

Writing the walker's tests found the one table whose first `next()` returns no row: a text whose very
first character opens a quote. The state machine runs to the end without completing a row and returns
`unterminated quoted field`, so `openTable` saw `done` on its header step and read the **error list**
as "no rows": the corpus was reported as `is empty`, a claim about its content where the truth was a
claim about its syntax. The test that should have caught it asked `problems.length > 0`, which the
wrong sentence satisfies -- the same shape as findings 496, 504 and 509. `openTable` now carries the
first step's errors and `drain` returns them, and the assertion is two-sided: the syntax sentence must
be there and the empty one must not be.

### A check that could not run was reported as a column that agreed (finding 513)

A `derived` column needs four things to be checkable, and the walk tested three of them. The fourth,
the instant column's presence in the corpus, was not asked about -- and `cellOrEmpty(row, undefined)`
answers `''` by design, so the check read an absent column as an empty cell, skipped every row, and
returned `differ: 0`: **the reading a column that was compared and agreed gets**. With the source in
the plan but not in the corpus, another problem arrived and the case failed anyway; with the source
in neither, nothing raised anything and a case could pass carrying a column no reader had checked.
The source is one value now (`DerivedSource { from, unit }`), present exactly when the check can run,
and every way it can fail reports `differ: rowCount` with one of three sentences -- a plan that does
not truncate the column, a corpus that does not have it, and an export that came up short send a
reader to three different files. The 60-table oracle states the same rule in the opposite shape.

### Three positions, and not one of them had ever run (finding 514)

`modalities.ts` came out of the rewrite at `100 | 98.29 | 100 | 100`, and reading the three
positions was the work: two `=== undefined` tests that no input could reach (deleted -- `delimitedRows`
always returns its errors, so `headErrors` was `undefined` exactly when a header had been read, and a
column that reached the paired walk could always be read), and one arm that was **reachable and never
taken** -- `if (empty)` had no test, because no file of zero bytes had ever been through the
comparison. Two tests now say `is empty` for each side and pin the ordering, the two table sentences
ahead of the twelve missing columns an empty header cannot have. The same read found the composer's
`?? 0` fallbacks unexecuted: a record that omits a term had never been scored.

### Readings

> Ledger for `v3.81`.

| item | value |
| --- | --- |
| `core` test suite | **247 files, 6289 tests passed** (at v3.81) |
| `cli` test suite | **4 files, 187 tests passed** (at v3.81) |
| repo test suite | **251 files, 6476 tests passed** (at v3.81) |
| coverage | `core` **99.97 / 99.86 / 100 / 99.97** (statements / branches / functions / lines), `cli` **100 / 100 / 100 / 100** (per-file thresholds, no exemption) |
| `modalities.ts` | **100 / 100 / 100 / 100** (was 100 / 98.29 / 100 / 100: two dead positions deleted, one arm exercised, findings 513 and 514) |
| the residual | **3 statements, 9 branch positions** out of 6,438 (14 positions at the start of the round); `docs:check`'s table retaken rather than left on a figure the tool never printed |
| new tests | **6267 -> 6289, net +22**: six for the walker, five for the oracle, four for the probe, three from the built-module guard table, two for the empty table, one for the composer, one for a derived column with no source |
| the probe, old shape | **734.4 MB / 1,925 bytes per row** at 400,000 rows, 3,845 ms |
| the probe, new shape | **37.2 MB / 98 bytes per row** at 400,000 rows, 2,104 ms; **313.8 MB / 230 bytes per row** at the 1,433,140 rows of the case the run died on, 6,245 ms |
| the inventory | **135 sites across 62 script(s)** (133 / 61 at v3.80); `verify-site-proofs` **220 claims across 61 files** |
| list | **28 -> 27** open: the modality comparison's entry is closed by measurement, and what it leaves is the dispatch |

### Leftovers, in the order that reaches the goal

| priority | item | state | next step |
| --- | --- | --- | --- |
| P0 | a round trip that carries all 270 cases | **the reason it did not is measured and repaired**: the comparison's peak on that case was 2.76 GB by extrapolation and is 0.31 GB measured | dispatch `official-data.yml` at `re2` and read the `ROUNDTRIP cost ... largest ... MB` line |
| P1 | worker count decided by memory rather than by the stall reading | open since v3.80 | choose the cap from the stall measurement |
| P1 | the next-nearest file at 71% of the stall budget | open since v3.80 (`publish.test.ts`) | look for a cheaper shape for a file whose cost is process starts |
| P2 | a case record's `terms` is optional in the type and written by every producer | measured at v3.81: **seven of the residual's nine branch positions** | make `terms` required and delete the fallbacks rather than defending a shape the data cannot have |
| P2 | the index grows every round | unchanged | measure the distance to the ceiling first |
| P3 | coverage numbers have no reader that computes them | unchanged | teach `docs:check` to read a report |

The priority column is plain rather than bold, and that is not typography: `**P0**` in the first
cell of a row is what `check-open-list.mjs` reads as a *table-form record's row*, and this table is a
round's leftovers rather than the live list -- its items are the next steps of the round, and three
of the five already have an entry of their own in `docs/progress.md`. A bold cell here would be
counted by the arm that asks whether a record's rows quote a live entry, and the row that does not
quote one would be reported as a residual a reader of the list is not told about. Round `v3.80` wrote
the same table under the same heading with bold cells, which is how the difference was found: the
count of bold priority rows in the corpus stopped equalling the count the guard printed.


**The lesson.** This round's finding was not a wrong number -- it was a number **nobody had taken**.
The budget had a declared ceiling, a refusal that fires inside the loop, a per-case report and a
census; and the one function that decided 62% of the corpus's cases had no reading at all, so the
sentence recording it could only say "unmeasured". Measuring it took **four minutes** and changed the
answer by a factor of 8.8. A stage that is expensive is not the same as a stage that is hard to
measure, and a round willing to write "unmeasured" is one edit away from writing nothing at all.

## v3.82 — a verdict about the machine, filed as two verdicts about the code

The round before this one ended green and pushed; the receipt for its tree was not taken,
because the run that takes it was started over a dirty working tree and finished with
`receipt: none`. Taking it produced a red at step 10, and chasing that red produced two
findings that had nothing to do with the comparison v3.81 was about.

### The claimant that ran out of time was filed as a claimant that was red (finding 515)

`verify-sites-are-sensitive.mjs --shard 2/2` failed with

```
packages/core/test/gate-sites-are-proven.test.ts does not pass on its own (exit 1), so its
claims are unmeasured
  FAIL  … > rejects a sit…
  Error: Test timed out in 30000ms.
```

The file is green: 4,900 ms for 69 tests alone, its slowest test 2,370 ms. The same shard had
passed on its own twenty minutes earlier, 136 runs in 13.2 minutes. The difference was the
four claimants the battery runs at once -- each a vitest of its own -- so vitest's default
30,000 ms ceiling, which is a statement about a test on an idle box, was answering a question
about a machine running three other claimants and their `git` children.

The claimant run now gets `--testTimeout=120000`: 24x the file, so a test that hangs still
fails, twenty-four times later. And the baseline sentence separates the two findings it had
been merging -- a file that did not finish says so, and says the number, because "does not
pass" sends a reader to the test where the truth is the budget. The budget is read from the
run's own sentence (`Test timed out in (\d+)ms`) and not from the word `Timeout`: this
repository's other timeout is `[vitest-worker]: Timeout calling "onTaskUpdate"`, a run in
which every test passed and the worker died on an RPC deadline. The margin is printed on
every run now -- `slowest claimant <file> <n> ms, of N run 4 at a time (budget 120000 ms per
test)` -- because a budget nobody prints is a budget discovered by the next timeout.

### The file at 71% of the stall budget started blocking for 62 seconds (finding 516)

v3.80 wrote `publish.test.ts` down as a measurement and not a repair: 28,183 / 31,855 ms
against 45,000, cost is process starts. The first coverage run of this round made it a red:
`this test file held the event loop for 61987 ms … Of that, 1740 ms were this process's own
CPU time`. That ratio is the signature the gauge was rebuilt to print: the file is not
computing, it is waiting, **synchronously**, on about 300 `spawnSync('git', …)` calls.

Every child is awaited now (`runChild`, shaped like `spawnSync` so a hundred call sites and
their assertions stay as they were). The file alone went from 12,182 ms of test time to
13,690 -- 1.5 s of promise plumbing -- and its blocked-loop time from **61,987 ms to 0**,
which is the number the budget is about. Three mechanical slips in the conversion were each
caught by a different instrument and none by the compiler: a regex that prefixed `await`
inside two expected strings, `await git(...).split()` which asserts on two promises, and a
`Buffer` that became a string and made a fake server answer `POST /git/trees -> 500`. A
fourth was caught by neither: the helper's inline `Promise<{ … }>` return type is the first
`{` after its parameters, so rule 7's scanner read the body as `{}` and reported the file as
declaring `publish-cli.mjs` and never spawning it -- repaired with a named `ChildResult`.

### Readings

> Ledger for `v3.82`.

| item | value |
| --- | --- |
| `core` test suite | **247 files, 6293 tests passed** (at v3.82) |
| `cli` test suite | **4 files, 187 tests passed** (at v3.82) |
| repo test suite | **251 files, 6480 tests passed** (at v3.82) |
| coverage | `core` **99.97 / 99.86 / 100 / 99.97** (statements / branches / functions / lines), `cli` **100 / 100 / 100 / 100** (per-file thresholds, no exemption); unchanged, because neither repair added a branch without a test |
| new tests | **6289 -> 6293, net +4**: one for the budget reader, one for the flag, one for the sentence, one for the printed margin |
| the stall budget | `publish.test.ts` **61,987 ms blocked / 1,740 ms CPU** before; **0 ms blocked / 13,690 ms of test time alone** after |
| the claimant budget | **30,000 -> 120,000 ms** per test, with the slowest claimant (4,900 ms) printed on every run |
| the inventory | **135 sites across 62 script(s)**, line numbers re-derived (fingerprints unmoved) |
| list | **27 -> 26** open: the next-nearest file's entry is closed by the repair it was waiting for |

### Leftovers, in the order that reaches the goal

| priority | item | state | next step |
| --- | --- | --- | --- |
| P0 | a round trip that carries all 270 cases | unchanged since v3.81 | dispatch `official-data.yml` at `re2` and read `ROUNDTRIP cost ... largest ... MB` |
| P1 | worker count decided by memory rather than by the stall reading | open since v3.80 | choose the cap from the stall measurement |
| P2 | a case record's `terms` is optional in the type and written by every producer | open since v3.81: seven of the residual's nine branch positions | make `terms` required and delete the fallbacks |
| P2 | the index grows every round | unchanged | measure the distance to the ceiling first |
| P3 | coverage numbers have no reader that computes them | unchanged | teach `docs:check` to read a report |

**The lesson.** Both findings are one shape and it is not the shape of v3.81. A number was
measured against the wrong thing: the sites battery asked "does this file pass" and answered
"does it pass in thirty seconds on a box running three other claimants", and the stall gate
asked "does this file block the loop" and got a file that answered yes because it was
*designed* to block. Neither was a wrong number -- each was a right number about a different
subject, which is why neither could be found by re-reading the code. The instrument that
catches this class is not a sharper assertion; it is the sentence that names what was
measured, printed next to the number. That is what the two repairs are: not a longer timeout
and not an async helper, but a budget a reader can see and a verdict that says which of two
findings it found.

## v3.83 · seven positions were not one leftover, and the sentence that called them one named the wrong repair

v3.81's `## Coverage` left nine branch positions and one plan for seven of them: "a case
record's `terms` is optional in the type and written by every producer, so [seven positions]
all guard a shape the data cannot have. The repair is to make `terms` required and delete
them." This round read the seven, one at a time, and the plan was wrong for two of them --
because the sentence it was derived from was wrong in a way only a range can hide.

### 一 · 四个生产者，两个故意不写那个映射（finding 517）

那句话的第二个从句是假的。`OfficialCaseScore` 有四个构造函数，**两个不写 `terms`**：
`scoreFacetSubset`（三个 RCAEval 锚用的规则）与 `scoreCloudOpsBench` 都是对 facets 的集合
比较，没有可携带的命名项，而字段自己的文档就写着「when the target's rule has them」。所以
可选性不是遗留，它是**被用着的**，而且用它的两处都正确。

决定不因此反转，因为类型划出的那个区分**没有读者能看见**：`meanOfPresent` 对一个没有分母的
项一律丢弃，无论它是缺项还是空映射；而 `rca100Process` 里那条 `terms === undefined` 返回的
东西，与一行之后的空映射返回的完全相同。一个说「可能不存在」而实际只会「可能为空」的类型，
在每一次读取处买一个兜底、在每一处都买不到保证——聚合里十七处 `?.` 加那一条臂。于是
`terms` 改为必填、两个 facet 规则写 `{}`，空映射成为「没有命名项的规则」携带的形状。

然后那七个位置，逐个读，它们**不是一个遗留**：

| 位置 | 有输入能到吗 | 处置 |
| --- | --- | --- |
| `checkpointToken` 的 `typeof value === 'string'` 与 `: ''`（两处） | **能**：`value` 是 `unknown`，从案例文件里读出来，JSON 里数组和对象都是标注可能装的东西。一直没被走过，是因为每个夹具都传 `42` | 两条测试：字符串值原样携带（`order\|cpu\|>=\|high\|count/min`），对象什么都不贡献（`order\|cpu\|>=\|\|count/min`，而不是 `[object Object]`） |
| `reachesAny` 的 `targets.size === 0` | **不能**：唯一调用方外侧有 `gt.chain.length === 0`、内侧有 `componentMatches`，所以 `from` 非空，而 `targets` 是一条每个 token 都由两个非空名字构成的链的 `chainNodes` | 删掉，并把论证写进 doc comment：空目标集在循环里也答 `false`，空 `from` 也一样——一个答案等于它所守代码的守卫，只值一个分支位和一种「检查过了」的错觉 |
| `scoreFacetSubset` 的 `scored.length === 0` | **能**，且是通过读取器：`parseRcaEvalDirectory` 的 service 组是 `(.*)`，于是名为 `RE2--adservice_1` 的目录解析出空 service，那个案例从此是真实的、被计数的、值零分 | 一条测试，不是删除：这条守卫的另一面是 `0 / 0`，而 `NaN` 会污染它进入的每一个均值 |
| `rca100Process` 的 `terms === undefined` | **不能**（映射必填之后） | 由类型删除 |
| 池化聚合里的两个 `?? 0` | 一个能一个不能 | 见第二节 |

结果是 **9 → 3 个分支位**，分支覆盖 99.86 → **99.95**，语句、函数、行不动。剩下的三个
是：`never` 回退的三条语句与通向它的那个位置、CLI 的 `Number.isSafeInteger`（`acceptance.md`
§2.39 有论证的豁免），以及下面那一条兜底。

教训不是「先读代码再定计划」——写那个计划的轮次刚读过三个位置。它更窄、也更难受：
**一句关于七个位置的总结，是对这七个位置的主张，而它是在差异消失的高度上写的。**
「每个生产者都写」对其中五个为真、对两个为假，而那两个恰好是修法不同的两个。位置必须一个一个
读，而唯一说出这件事的，是那句话有一个范围。

### 二 · 五个字节之外的两个兜底，只有求和的那个改变答案（finding 518）

```ts
const em = cases.reduce((sum, c) => sum + (c.terms['evidenceHits'] ?? 0), 0);
…
.map((c, i) => ({ la: c.terms['la'] ?? 0, pred: predictions[i] }))
```

两处都未覆盖，看起来是同一个遗留：为一个从不缺席的项写的兜底。它们不是，而差别全在下游的
运算符：`em` 是**被加的**，所以缺席的计数必须贡献零，因为求和里的 `undefined` 就是 `NaN`，
而 `NaN` 是那十分之一的 Explainability 唯一撑不住的数字——它会在一份其余每个数都在 0..100
的报告里印成 `NaN`。`la` 是**被比较**的（`la === 1`），缺席与 `0` 早已答同一个 `false`。

所以一个是守卫，一个是习惯。习惯失去了兜底，守卫留着，而理由现在写在两者之间，而不是留给
下一个发现相邻两行不一致的读者去推断。这个不一致是刻意的，而且正是整理时会消失的那一类：
把这对改成一致，往任何一个方向都是要么请回一个 `NaN`，要么加一条没有输入能到的分支。

剩下的那一处是诚实的，而且只有一个位置：`Record<string, number>` 说不出「这条规则总是写这两个
键」。要关掉它，需要一张按目标区分的 `terms` 映射——九个形状而不是一个——那是结构变更，
不是一条兜底的工作量，因此进开放清单，而不是塞进一个覆盖率数字里。

### Readings

> Ledger for `v3.83`.

| item | value |
| --- | --- |
| `core` test suite | **248 files, 6299 tests passed** (at v3.83) |
| `cli` test suite | **4 files, 187 tests passed** (at v3.83) |
| repo test suite | **252 files, 6486 tests passed** (at v3.83) |
| coverage | `core` **99.97 / 99.95 / 100 / 99.97** (statements / branches / functions / lines), `cli` **100 / 100 / 100 / 100** (per-file thresholds, no exemption) |
| the residual | **3 statements, 3 branch positions** (9 at the start of the round): the `never` backstop and its position, the summed `?? 0`, and the CLI's exempt `Number.isSafeInteger` |
| new tests | **6293 -> 6299, net +6**: two for the checkpoint value, two for a case whose name parses to no component, two for the shape a record's terms map takes |
| the count the plan rested on | **four producers, two of which omit the map**: `scoreFacetSubset` and `scoreCloudOpsBench`, both because their rule has no named terms |
| the reads the type bought | **17 `?.` plus one `undefined` arm** removed by requiring the map, and one of the two `?? 0` fallbacks with them |
| the P0 | `official-data.yml` **fired at `5c1a8a9`** (run 43085008634, `rcaeval-re2`), still running when this was written; the reading it owes is `ROUNDTRIP cost ... largest ... MB` |
| list | **26 -> 27** open: the last coverage position is now an entry rather than a sentence in a record |

### Leftovers, in the order that reaches the goal

| priority | item | state | next step |
| --- | --- | --- | --- |
| P0 | a round trip that carries all 270 cases | **the instrument is in the shape it needs**: the comparison costs 98 bytes a row and the loop no longer stops for 62 s at a time | read run 43085008634's `ROUNDTRIP cost ... largest ... MB` and compare it with the 12,288 MB budget |
| P1 | worker count decided by memory rather than by the stall reading | open since v3.80; v3.82 made the nearest file cheap, which is a reason the question is now hypothetical rather than an answer | choose the cap from the stall measurement |
| P1 | the sensitivity shard's cost against its own bound | **new measurement**: locally the step took **14 min of its 26**, and v3.82 raised the per-test budget from 30,000 to 120,000 ms -- a bound that only pays out when a claimant hangs, so what grew is the worst case rather than the observed cost. `check-ci-budget` reads the recorded runs at 2.1x and is green | record the shard's own duration per run rather than per battery, so a slower runner is a number before it is a timeout |
| P2 | the index grows every round | unchanged | measure the distance to the ceiling first |
| P2 | a `terms` map per target, so the aggregate can say which keys a rule writes | **new**: the last position of the coverage residual | nine shapes instead of one, decided as a record change rather than a branch |
| P3 | coverage numbers have no reader that computes them | unchanged | teach `docs:check` to read a report |

**The lesson.** 这一轮的发现不在代码里，在两句话里，而两句话都是**关于范围的总结**：
「每个生产者都写」总结了四个生产者，「它们守着一个数据不可能有的形状」总结了七个位置。
两句都在差异消失的高度上写成，而差异在于处置：有的是补测试、有的是删、有的是换成类型、
还有一条必须留着并说明为什么。一个范围的声明，只有把范围内的每一个都读一遍才算数——
而读一遍的代价，这一轮是**六条测试和一次删改**。

