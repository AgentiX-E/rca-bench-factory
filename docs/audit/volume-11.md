## Finding 480 — a measurement in a comment that the same round made false

`readPromptLeaks` argues for its normalisation with a reading:

> Measured on the shipped corpus, the substring form of this rule reported **3 of 30** and this form
> reports **19 of 30** -- the difference is entirely hyphen against space.

The sixteen cases in that gap are why the rule normalises separators, and the sentence was true when it
was written. It stopped being true in **the same round**, because v3.66's commit `b16892f` -- `a prompt
that cannot name its answer` -- rewrote the corpus's task texts so that none of them names its
component. Measured on the tree this round inherited, both forms report **0 of 30**:

| form | then | now |
| --- | --- | --- |
| substring over the normalised prompt | 3 of 30 | **0 of 30** |
| `promptNamePattern` over the normalised prompt | 19 of 30 | **0 of 30** |

The volume that records the repair says nineteen leaks were closed. The comment two directories away
says nineteen leaks exist, in the present tense. Neither is a lie; they are the same fact read at two
times, and only one of them has a reader that runs.

This is finding 477's shape one level down. There, a vendor was published twice and compared with
nothing; here, a reading is published twice -- once as history and once as a test that runs every
night -- and the copy with no reader is the one that went stale. The repair is not to delete the
numbers: they are the argument for the rule's shape, and a comment that says "measured" without a figure
is worth less than one that names what it measured. The comment now says which state each figure
describes, when, and that the current value is printed by `check-fault-cases.mjs` on every run:

```
check-fault-cases: prompt leakage: 0 of 30 case(s) name their root-cause component in the task text
```

**The general form, which this list has now paid for twice in two rounds.** A number in a document is
either a *reading* -- something a command prints every time it runs, in which case the document should
cite the command rather than restate the figure -- or it is *history*, in which case it must be dated and
must not be written in the present tense. The third thing, a figure that was a reading once and is
written as though it still were, is the one that goes false silently, and both findings this round are
that third thing at two different levels.

## Finding 481 — two coverage figures for one tree, and the one nobody recomputes

`docs/progress.md` opens with a `## Coverage` section whose table reads:

| Dimension | Result | Gate |
| --- | --- | --- |
| Statements | 99.96% | ≥ 95% |
| Branches | **99.93%** | ≥ 95% |
| Functions | 100% | ≥ 95% |
| Lines | 99.96% | ≥ 95% |

and the sentence above it says `Measured by vitest run --coverage (v8) over packages/core`. The
measurement taken on the tree this round inherited — and again on the tree it produced, twice, on two
different exclusion sets — is:

| Dimension | `progress.md` | measured at v3.66 | measured at v3.68 |
| --- | --- | --- | --- |
| Statements | 99.96 | **99.97** | **99.97** |
| Branches | **99.93** | **99.80** | **99.80** |
| Functions | 100 | 100 | 100 |
| Lines | 99.96 | **99.97** | **99.97** |

`99.93` is not a figure from an older tree. The ledgers in `docs/progress/volume-12.md` record
`99.96 / 99.75 / 100 / 99.96` for five consecutive rounds and `99.97 / 99.80 / 100 / 99.97` for the
last three; no round wrote 99.93, and no run produces it. It is a number that was typed rather than
taken, and the sentence above it -- "measured by" -- is what makes it read as the other thing.

The residual the section then decomposes ("two statements and four branches, all of them documented
backstops") is 0.03 statements and 0.20 branches of a 240-file package, which is consistent with
`99.97 / 99.80` and inconsistent with `99.96 / 99.93`. So the prose and the table were written from
two different measurements, and the table -- the part a reader scans -- is the one that is wrong.

**Why this is the same defect as finding 480, one level over.** There, a figure in a comment was a
reading that stopped being one; here, a figure in a table was never a reading at all. Both sit under a
sentence that claims measurement, both are the copy with no reader, and both survive because the copy
that *does* run lives somewhere else -- `check-doc-counts` compares the suite counts and nothing
compares the coverage table; the per-round figure in a `### Readings` ledger is written by the round
that measured it, and no rule says the section at the top of `progress.md` has to agree with it.

**What was changed, and what deliberately was not.** The four cells now carry the measured figures and
a date, and the sentence says the section is updated when the residual's *shape* changes rather than
every round -- because a table that must be retaken every round is a table whose number will be typed
again. A gate over it would need a coverage report during `docs:check`, which does not run the suite;
the honest statement is that this figure is a reading with one reader, and the ledger in volume twelve
is where each round's copy of it lives.

**The class this belongs to, stated once.** Three figures about this repository are published twice:
the suite counts (guarded -- `check-doc-counts` refuses a stale copy), the gate-site count (derived --
`derive-gate-sites --check`), and the coverage figure (unguarded -- and therefore the one that was
wrong). The rule that separates them is not "guard everything": it is that a number with two copies
needs one of the two copies to be *computed* rather than *remembered*.

## Finding 482 — two thresholds nothing had ever moved

`checkG3Validity` admits a case when some metric sustains `|Z| >= 2.0` for `3` consecutive post-onset
samples. Both numbers are parameters with defaults, both defaults were written inline in the
function, and nothing in the tree had ever asked what happens either side of them. The open-list
entry said so in one line -- "a 4x4 grid would say which cell the defaults sit in and whether the
admission rate moves with them" -- and the answer, once measured, is that **it does not move**:

| cell | admitted | cell | admitted |
| --- | --- | --- | --- |
| `\|Z\| >= 1`, 1 sample | 30 of 30 | `\|Z\| >= 10`, 1 sample | 30 of 30 |
| `\|Z\| >= 1`, 8 samples | 30 of 30 | `\|Z\| >= 100`, 8 samples | 30 of 30 |

Sixteen cells, one verdict. That is not a grid that passed; it is a corpus that cannot see the
thresholds, and the grid's job was to say which of the two it was. The reading that separates them
is each case's **flip point** -- the largest `|Z|` line at which it still sustains three samples,
which is the best three-window's smallest z-score and therefore a closed form rather than a search:

| quantity | value |
| --- | --- |
| cases judged | **30** |
| weakest flip point | **126.85** -- `history-resource-ephemeral-capacity-image-builder` |
| strongest flip point | **3.15e12** -- `history-kafka-consumer-lag` |
| margin over the shipped line | **63.42x** |
| most post-onset samples a case offers | **8** |

So the `|Z|` axis is inert across two orders of magnitude and the sample axis is inert up to the
number of samples the corpus gives each case. Both facts are consequences of the corpus's
construction rather than of the gate: a derived series steps from its baseline to its post value and
a counter's pre-window is exactly flat, so `stddev` is zero or a two-percent jitter and the z-score
is the ratio of the step to *that* -- 126 at the weakest and 3.15e12 at the strongest. A corpus built
that way cannot test a threshold, which is what `probe-z-floor` found about `epsilon` (finding 288)
one level down.

**What the grid can still defend, and what it cannot.** It defends the *ordering*: the refused count
never falls as either axis rises, asserted over all sixteen cells, so the surface is a surface and not
sixteen unrelated measurements. It cannot defend the *value*: any line from 1 to 100 produces the same
verdict on this corpus, so the default is a judgement the corpus is silent about. The reading does not
pretend otherwise -- `check-fault-cases.mjs` prints the margin beside the grid on both exits, and the
open-list entry is rewritten to say what the corpus cannot answer rather than what the grid failed to.

**The shape that made the answer trustworthy.** The grid and the verdict are one computation:
`metricGroups`, `absZScores` and `flipPoint` are shared with `checkG3Validity`, and a test compares
every cell's refused set against `checkG3Validity`'s own violations for that pair of lines. Sixteen
cells that agree with the gate are a reading of the gate; sixteen cells computed by a second
implementation would have been a second rule, and the round before this one paid for exactly that
(finding 479).

Two smaller things came out of writing it. `G3_DEFAULTS` now exists so the grid reads the numbers the
gate applies rather than restating them, and the first version of the reading computed its flip points
only for the sample lines *on the caller's axis* -- so a caller asking a narrower question was told
"no case sustains 3 sample(s)" about a case that sustains 62. A reading of the grid's shape presented
as a reading of the corpus, caught by the test that asked a narrower question on purpose.

## Finding 483 — a channel that exists as a library, and a table that exists twice

The open-list entry said: "`rulegen` has no refusal count and no agreement reading... nothing compares
its output with the thirty human annotations that already exist." Two of those three claims are wrong,
and the third is the one that matters.

**The thirty annotations belong to another channel.** `golden-master/fault-extraction/samples.json`
carries thirty hand-written incident texts with an expected `type`, `category` and `component`, and
`buildExtractionReport` compares a run against them: hits, misses, a layered rate, a miss
classification, a strict threshold. The `fault-extraction-accuracy` workflow calls it. So the
annotation set the entry points at is already read -- by the channel that extracts faults from text,
which is not `rulegen`.

**And `rulegen` has no caller at all.** `buildRulegenPrompt`, `parseRulegenResponseChecked` and
`validateGeneratedLayout` are exported from `packages/core/src/index.ts` and invoked from nowhere in
`src/` or `scripts/` except their own module and their tests. The path every ingested file takes is
`ingest/prime.ts`, which infers a layout from the header row through `detectFileLayout`'s alias table
and never asks a model. So "no refusal count" was not a missing measurement: it was the correct report
of a function nothing invokes, and an agreement rate over model output would have described a channel
that does not run.

**The table, which is the defect worth repairing.** `REQUIRED_FIELDS` -- the fields a layout must map
for its signal kind to be readable -- was written twice, byte for byte:

```ts
// packages/core/src/ingest/prime.ts
const REQUIRED_FIELDS: Record<FileSignalKind, ReadonlyArray<keyof FileLayout>> = { ... };
// packages/core/src/llm/rulegen.ts
const REQUIRED_FIELDS: Record<FileSignalKind, readonly (keyof FileLayout)[]> = { ... };
```

Two readers of one fact: `prime` decides whether `ingestFile` may be called, `rulegen` decides whether
a model's mapping is complete. Identical when the round began, and held together by nothing -- so a
divergence would have produced a layout the validator accepted and ingestion refused, with a sentence
naming a *missing column* rather than the disagreement between two tables. This is the same defect as
v3.67's `contractVersion` and v3.68's stop-word list, in its third costume: **one fact, two writers,
no rule.** The table now lives in `ingest/file.ts` -- which owns `FileLayout` and `FileSignalKind` --
and both modules import it, so divergence is not expressible.

### The answer set, and what it measures

Sixteen authored cases in `golden-master/rulegen-layouts.json`: a header row, two or three sample
records, the layout a careful human reader produces, and -- for the model side -- one whole candidate
response written the way a model gets it wrong. The reading reports two figures that are not the same
claim:

| channel | figure | what it measures |
| --- | --- | --- |
| the alias table | **14 of 16** specified layouts | what ships: it differs on the two cases whose value column is outside its vocabulary |
| the validator | **16 of 16** verdicts, 9 accepted / 7 refused | the guard over answers: misspelled field, absent column, empty cell, required field missing, wrong-kind field, invented enum value, confidence above one |
| the reasons | **7 of 7** | a refusal for the wrong reason is a wrong answer with the right exit code |
| the class it cannot see | **1** | an accepted answer that maps `metricValue` at `limit` where the answer set says `usage` |

That last row is the reading worth having. `validateGeneratedLayout` replays a layout against the
samples, so it refuses a column that is absent or empty -- a *structural* check. A mapping to a real,
populated column that means the wrong thing passes it. The validator is right about its own contract
and the channel is wrong about the data, and one number cannot carry both, which is why they are
counted apart.

**Kappa is absent, and the absence is the claim.** Cohen's kappa needs two independent annotators;
one author wrote these header rows, the specified layouts and the candidates. So the figure is
agreement with a *specified* answer -- weaker than agreement between annotators -- and every sentence
that prints it says which one it is. The alternative was to leave the number unqualified, which is how
a weaker claim gets read as a stronger one.

**The grid and the answer set are the same shape.** Both put a default's decision into a table, both
report what the table cannot decide beside what it can, and both refuse to let a figure be printed
without the sentence that says what it is a figure *of*. A single default and a single rate are the
same object: a number whose justification lives in whoever typed it.

**And the test that proves this gate's argument refusal proved the sentence, not the exit.**
`verify-sites-are-sensitive` hollowed `check-rulegen-agreement.mjs:68` -- the `process.exit(1)` in
the argument catch -- and the file stayed green, because the test asserted only that the message
appeared. A refusal that prints and then succeeds is a report, not a refusal, and the site this test
claims is the exit. Both statuses are asserted now. The gate said it before this round's own reading
did: *the witness reaches the exit. It does not depend on it, so it is not a proof of that exit -- it
is a proof that the gate ran.*

## Finding 484 — a specifier that resolved only when a loader chose to fall back

A full run in this round went red in twelve files. Eleven were child-process timeouts on a box still
loaded from the coverage run before it, and went green on a rerun without a change. The twelfth was
different:

```
Error: Cannot find module '../../scripts/format-spec.mjs'
imported from '.../packages/core/test/published-refusals.test.ts'
Caused by: Failed to load url ../../scripts/format-spec.mjs (resolved id: ../../scripts/format-spec.mjs)
```

The file is `packages/core/test/published-refusals.test.ts`, so `../../` names `packages/`, and
`packages/scripts/` has never existed. The path was wrong from the day it was written, and the same
specifier appears nowhere else: the other forty-one imports of `scripts/*.mjs` in the test tree spell
`../../../`. It ran anyway, because vite-node resolved the module against its own root before
externalising it, and on one run it did not: node resolved the specifier against the importing file,
which is what the error's second line reports.

**The green after the red is the trap.** Read alone, "red once, green twice on the same file" is a
description of a loaded machine, and the honest response would have been to note it and move on. The
thing that separates a defect from a hiccup is inside the error: the path it named was not a path
anyone had written. A module-not-found about a directory that does not exist is not a timeout about a
directory that does.

**Fixing the line is not the repair.** A specifier that resolves only inside one loader's fallback
will be written again by the next person who counts directories wrong, and it will be green on their
machine in exactly the same way. The test tree already had a reader of these specifiers --
`scripts-are-classified.test.ts` matches `from '…/scripts/x.mjs'` to refuse a test importing a gate --
so the regex was widened to capture the whole specifier beside the file name, and one more assertion
asks whether the specifier, resolved against the file that writes it, lands on a file.

Its first run reported two offenders, and both were prose: the guard's own doc comment spells the
pattern, and the control test quotes it. A guard that fails on its own documentation is a guard
somebody deletes, so the scan strips comments first (`//` must follow whitespace, so a URL inside a
string is not read as one), and the stripper's three cases are asserted in the control. The only
offender left was the real line. Putting the wrong specifier back makes the guard name it again:

```
published-refusals.test.ts spells '../../scripts/format-spec.mjs', which resolves to no file
```

| reading | value |
| --- | --- |
| `scripts/*.mjs` specifiers in the test tree | **42** |
| that land on a file, resolved from the writing file | **42** after the repair, **41** before |
| the directory the wrong one named | `packages/scripts/` -- absent from every commit |

## Finding 485 — five denominators behind one percentage, and no reader told which

`scoreExport` returned `score: number` and nothing else about how it was computed. The number
is `creditFor(structure) × 100` over `structure.checks`, and the seven checkers that produce
those checks declare between two and fourteen of them:

| target | checks | score on the shipped example |
| --- | --- | --- |
| `openrca-1.0` | 14 | 100 |
| `rca100` | 9 | 100 |
| `rcaeval-re1` / `re2` / `re3` | 8 | 100 / 100 / 0 |
| `aiops2025` | 7 | 100 |
| `openrca-2.0`, `cloud-opsbench`, `itbench` | 2 | 100 |

Nine targets, five denominators, and eight of the nine print `100` on the site and in the CLI
docs. Three consequences, none of them visible to a reader of the number:

1. **`100` is not one quantity.** Fourteen checks passing is a different amount of evidence
   from two, and the percentage is blind to the difference by construction.
2. **The structure term is all-or-nothing**, because `creditFor` is `structure.passed ? rate : 0`
   and `structure.passed` is `checks.every(...)`, so `rate` could only ever be 1 or 0. Without
   anchors the score therefore takes exactly two values. `docs/user-guide.md` said `0-100`,
   which is a promise about a scale that does not exist, and the division it advertised was
   dead arithmetic: `passed / length` where the numerator is either zero or the denominator.
3. **The docs' own claim was unpinned.** The open item said "different targets are not
   comparable" and asked for a test asserting that two targets' check counts differ. That test
   did not exist, so the sentence was the same kind of claim as the 105 the log had already
   refused.

The repair is in two parts, and the second is the one that matters. `ScoreReport` now carries
`terms: { structure: {passed, total}, checksum?: {passed, total} }` -- the counts each half of
the score was computed over -- and `describeScore(report)` renders `score 100 of 100 over 14
structure check(s)`. Every surface that printed the number now prints that sentence: the HTML
page, the CLI reference's example, the user guide, and the site, which takes the sentence from
the payload rather than composing one of its own. `creditFor` reads the counts instead of
dividing them, so the all-or-nothing rule is stated where it is applied rather than implied by
an identity.

| reading | value |
| --- | --- |
| score targets | **9** |
| distinct check counts | **5** (14, 9, 8, 7, 2) |
| `score` values without anchors | **2** (`0`, `100`) |
| the measurement the open item asked for | `score-denominators.test.ts`, nine tests over the shipped bundle |

## Finding 486 — a corpus that could not see its own threshold

v3.69 added a 4×4 grid over G3's two thresholds and the reading came back constant: thirty
cases, sixteen cells, 30 of 30 admitted in every one. The round recorded that as "the corpus
cannot see the threshold" and left the reason unexamined.

The reason is arithmetic. Every declared series is expanded by `expandSeries` with a fixed
jitter cycle of ±2 %, so the baseline's standard deviation is a **constant fraction of its
mean** -- about 1.34 % -- for every sampled series in the corpus. A stepped series therefore
has `z ≈ (post / baseline − 1) / 0.0133`, and the weakest case in the set still moved by 2.7×.
The flip point is not a property of the incidents; it is a property of the noise model. The
corpus could not move the axis because no case had ever been authored *near* the line.

A benchmark whose faults are all loud cannot test a detector: it can only confirm that one
runs. So this round added a case whose anomaly separates by about three baseline standard
deviations -- a quote-cache TTL written as 284 seconds where the runbook says 300, a refresh
rate from 1100 to 1164 calls per second, and a p99 from 240ms to 254ms that sat inside the
alert's noise band. Nothing failed, nothing restarted, and the traffic did not move; the only
signals are the two rates the shorter TTL changed and the control that says nothing else did.

The grid now moves for the first time:

```
31 case(s) judged over 4x4 cells (|Z| 1/2/10/100 x samples 1/3/5/8); the default
(|Z| >= 2, 3 samples) admits 31 of 31 and 1 of its 4 neighbour(s) change that, by up to 1;
the weakest case 'history-config-rate-cache-ttl-pricing' stops sustaining 3 sample(s) at
|Z| >= 3.38, 1.69x the default
```

That sentence is the difference between "the threshold was defended" and "the threshold was
never asked", and it took a case with a 1.69× margin to produce it.

**Growing the corpus has a price, and it is measured rather than paid silently.** The new case
needs an incident text (every case quotes its source), so the extraction key grew from 30
samples to 31. Two consequences the round had to face:

- **One sample no recorded run has answered.** `M1`'s current reading was taken over thirty
  samples, so the accuracy figure behind `M1_STRICT_THRESHOLD` is now a statement about 30 of
  31. `m1-reading-is-reproducible.test.ts` used to assert `key.size === samples.length`; it now
  pins `30` and names the one sample no run has answered, so a second unanswered sample cannot
  arrive in silence.
- **The type vocabulary stopped being injective.** The set had been authored one sample per
  type, and the assertion that the types are *distinct* was a proxy for "the vocabulary is not
  a small closed set". The new sample reuses `config-mismatch`, which is what the fault is, so
  the proxy broke while the property held. The assertion now states both numbers -- 30 types,
  31 samples -- rather than an equality that only a 1:1 set satisfies.

## Finding 487 — the limit of a check was documented in the reading and not in the check

`validateGeneratedLayout` replays a layout against samples: a field is refused when its column
is absent or empty in some sample. That is a structural contract, and it cannot refuse a mapping
to a real, populated column that means the wrong thing -- `metricValue` at `limit` when the
specification says `usage`.

v3.69 measured that gap (`misreads`, one answer in sixteen) and described it in
`llm/rulegen-agreement.ts`, which is the module that *reads* the two channels. The module that
*enforces* the rule said nothing about its reach, so a caller reading the guard's own doc
comment would have taken `valid: true` for "the mapping is right", which is the reading the
corpus's one misread answer disproves.

The limit is now stated where the rule lives, and -- because a caveat in a comment is a
sentence with no test -- the acceptance is pinned: `rulegen.test.ts` plants a layout pointing
`metricValue` at a populated `limit` column, asserts it is accepted, and asserts that the
correct mapping to `usage` is accepted by the same check, so the pair reads as "one verdict, two
meanings". If a later round adds a semantic reader, that test is the one that must be replaced
by its refusal.
