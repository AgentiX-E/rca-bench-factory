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
