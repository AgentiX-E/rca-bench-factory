## v3.121 · Two gates printed one word for two populations, and one of the numbers was a heading count

**`pnpm docs:check` prints `268 round(s)` and `215 round(s)` forty lines apart, over one corpus**, and
neither line says what its word means. 268 is every `## ` heading the volumes hold; 215 is the distinct
`vX.YY` numbers. The gap is not drift and not rounding: it is one addendum, fifty `Pass` rounds of the log's
older era, and two sections that carry no number at all.

### The measurement

```
check-progress-volumes: OK — 18 volume(s), 268 round(s); largest volume-03.md at 127,029 of 200,000 bytes; …
check-open-list: 224 record(s): 199 under a round and 25 under none; 215 round(s) + 1 addendum(s), 17 of them wrote none
```

Both sentences are true of their own subject, which is why both survived every gate that reads them. What
the corpus actually holds, by kind:

| kind | count | what it is |
| --- | --- | --- |
| `vX.YY` round | **215** | the numbering this log calls a round, and the only one `check-open-list` looks an owner up by |
| `vX.YY, addendum` | **1** | `v2.15`'s second section -- a section **of** a round, which is why 585 counts it apart |
| `Pass N` round | **50** | the log's older era; a record in those volumes has no round to be owned by, which is the 25 in "under none" |
| no name at all | **2** | `## Finding 124` and `## Iteration — F-41 / F-42 / F-43` |
| **headings** | **268** | what `check-progress-volumes` walked, published as "round(s)" |

### Why the round that fixed this did not fix it

Finding 585 found exactly this error **inside `check-open-list`**: the population line subtracted a count of
round names from a count of round headings and published the difference as "18 rounds wrote none". The repair
counted the rounds and printed them apart from the addendum. What it did not do was look at the number in the
other gate's summary -- 268, `order.length`, every heading a volume holds -- because 585's subject was the arm
that had failed, and a summary is not part of any arm.

The lesson is about where the second opinion lives. 585 fixed the number whose two derivations disagreed
**inside one expression**; here the two derivations never meet, so nothing could disagree. Each gate was right
about its own subject and neither said what that subject was.

### The repairs

1. **The summary prints the partition** -- `268 heading(s): 215 vX.YY round(s), 1 addendum(s), 50 Pass
   round(s), 2 unnumbered` -- so the total can be added up on the page. The buckets are a partition of
   `labelOf`, which returns `Pass N`, `vX.YY`, `vX.YY, addendum`, or null: every entry lands in exactly one
   bucket, so the four numbers add up to the total by construction rather than by a rule that could disagree
   with them, and a heading of no known kind is counted as `unnumbered` rather than dropped.
2. **`check-open-list` names its era.** Its 215 is printed as the count of `vX.YY` rounds, which is what it
   counts; the word it was using was the whole corpus's.
3. **A heading shaped like a round that `progress-volumes` cannot label is refused.** `check-open-list`
   identifies a round with `\b` after the number; `VERSION` here needs a space and then a title. `## v3.62`
   followed by anything is a round to one reader and "unnumbered" to the other -- one heading, two counts,
   and the difference arriving as a word that reads like a rounding.
4. **The agreement is asserted, not printed.** The shipped-corpus case derives the version count through
   `readVolumes` and asserts that `check-open-list` prints it. A second literal would let one reader move
   while the other stayed green, which is the shape of the defect: two sentences, no comparison.

### The same defect was in the row that counts rounds by hand

While measuring the population, the ledger's own `| the number line |` row turned out to be one behind the
log -- and behind it for five rounds:

| ledger | row said | the corpus held |
| --- | --- | --- |
| `v3.116` | **210** | **211** |
| `v3.117` | **211** | **212** |
| `v3.118` | **212** | **213** |
| `v3.119` | **212 -> 213** | **214** |
| `v3.120` | **213 -> 214** | **215** |

Each was the count of the log **as it stood before that round's own heading**, quoted with a range ending at
the round before it. The row agreed with itself and not with the log it sits in -- finding 586's shape (a
number derived before the change it describes) surviving in the one row whose whole job is to be a count.
The `v3.120` row even prints its own contradiction: `94 in v2, 120 in v3 (v3.00..v3.120)`, and that range is
**121** numbers.

The repair is a rule rather than five corrections: **a row that says how many numbers this corpus has must
state the number it has**, derived through `populationsOf` rather than quoted. It is judged where the
coverage row is judged -- on the round that can still be written -- so the five rows stay the records they
are, and the rule fired on the shipped tree the moment it existed, which is how it was known to work
(finding 601).

### Falsifications

Nine edits, each a way the repair could have been written and not been one, each followed by
`test/progress-volumes.test.ts` and `test/check-open-list.test.ts` alone, with both modules restored byte for
byte after every run.

| the edit | reds |
| --- | --- |
| the addendum counted into the version bucket | 3 |
| a heading of no name counted as a `Pass` round | 3 |
| the shaped-like-a-round guard removed | 1 |
| the total printed as the version count | 4 |
| the era qualifier dropped from `check-open-list` | 7 |
| the `Pass` bucket named without its era | 4 |
| the heading count published as a round count | 1 |
| the number-line rule removed | 2 |
| the thousands separator left in the cell | 1 |

**Twenty-six reds across nine mutations.** The fifth is the loudest for a reason worth reading twice: dropping
one qualifier from one line reds **seven** cases, six of them fixtures that pin the line and one that derives
the two readers' agreement. A word carrying a population is not a cosmetic choice.

### The refresh found the two bounds the round before had just raised

Writing this round's `| CI |` row named run `44576264388`, and the recording was `44516888528` -- so the gate
refused before any test ran: *"a recording older than the round that reports it describes a tree nobody
shipped"*. That is `R7` doing exactly what v3.120 built it for, on the first round that had a new run to
report. The refresh then refused two steps, both of them bounds v3.120 had raised one round earlier:

| step | bound | newest day | ratio | what the bound was sized on |
| --- | --- | --- | --- | --- |
| `Every gate can be shown to fail` | 10 min | **368 s** | **1.63x** | 295 s, the run before |
| `Gate-test battery (…)` | 9 min | **336 s** | **1.61x** | 250 s, the run before |

Both were 2.0x+ the day they were written against, and the next run was 25% and 34% slower. Nothing changed in
the workflow: `verify-gates-are-testable` empties 67 scripts and the battery runs 64 injections, and how long
that takes depends on the box. **A bound is twice a day, and a day is not a property of the step** -- the
repair is the arithmetic again: **10 -> 13** minutes (2.12x) and **9 -> 12** minutes (2.14x).

The ceiling was the interesting part. It did not move, and the gate accepted that: the only rule about a job's
budget is `R6`, which refuses a **narrower** one, and nothing compares a ceiling with the sum of the bounds
inside it -- for `batteries` that sum is **108** minutes against a ceiling of **25**. The two heavy steps now
bound at **13 + 12 = 25**, which is the ceiling exactly: if either of them hangs for its whole allowance, the
job dies at the same instant its own bound expires, and the verdict says "the job timed out" -- the sentence
these bounds exist to replace. That is `O-093`, opened here because raising them is what made it exact.

### Readings

> Ledger for `v3.121`.

| item | value |
| --- | --- |
| CI | run `44576264388` on `9b8413f1e`: **8 of 8 jobs success**, **14 min** of wall clock |
| `core` test suite | **257 files, 6725 tests passed** (at v3.121) |
| `cli` test suite | **4 files, 187 tests passed** (at v3.121) |
| repo test suite | **261 files, 6912 tests passed** (at v3.121) |
| coverage | `core` **99.98 / 99.95 / 100 / 99.98**, `cli` **100 / 100 / 100 / 100** -- unchanged: nothing under `src/` moved |
| new tests | **6715 -> 6725, +10**: four for the population line (the four kinds beside their total, a heading of no name, the shaped-like-a-round refusal, the sum on the shipped log), five for the number line (a row counted before its round, the arrow's last number, a larger number, no row at all, a closed round's row), and one for the cut a long quote gets |
| the sentences moved | **7**: the six fixture cases that pin `check-open-list`'s population line, and the shipped-corpus sentence, which now states `215` as `vX.YY` rounds and derives the number the other gate prints |
| the rules | `check-progress-volumes` **+1** (the number line), `check-open-list` **+0** -- its repair is a qualifier and a test |
| the recording | `44516888528` -> **`44576264388`**: **8** job(s), **83** step(s), **9** reading(s) in the history, taken by the refresh this round's own CI row made necessary |
| the bounds | 2 steps raised -- `Every gate can be shown to fail` **10 -> 13** min (2.12x the 368 s day) and `Gate-test battery` **9 -> 12** min (2.14x the 336 s day); the `batteries` ceiling unmoved at **25**, which is the sum of the two heavy bounds exactly (`O-093`) |
| falsifications | nine edits, **twenty-six** reds |
| the number line | **215 -> 216** distinct numbers, dense: 94 in `v2` (`v2.06`..`v2.99`), 121 in `v3` (`v3.00`..`v3.120`); the row had said **213 -> 214** |
| the population | **268 heading(s): 215 / 1 / 50 / 2**, printed on every run |
| LLM calls | **0** |

### Left open

- The summaries of the other gates name their nouns and nothing compares them. `[open: the census here is two
  gates because those two printed one word; nine other gates print `finding(s)`, `citation(s)`, `entry(ies)`
  and `row(s)` and no reader asks what population each is about -- the repair would be a vocabulary of units,
  and no round has measured which of those nouns are ambiguous]`
- Five ledger rows state a count of the log that is one behind it, and the rule reads only the newest round.
  `[open: correcting `v3.116`..`v3.120` would be editing frozen records to satisfy a rule invented after them,
  which is the asymmetry the coverage row already lives with -- the five are stated here rather than rewritten,
  and a reader adding them up is told that they lag by one]`
- `batteries` holds **108** minutes of step bounds inside a **25** minute ceiling. `[open: no rule compares a
  ceiling with the sum of the bounds inside it -- `R6` refuses only a narrower one -- so most of those bounds
  can never fire before the job does, and the two heavy steps now bound at **13 + 12 = 25** make the job's
  death and their own expiry the same instant; the repair is another job split, which is what the arithmetic
  already said once when it moved the batteries from 30 to 25]`

## v3.122 · One line, three populations: `597 open` over a list that held 37

The round before this one measured a word printed by two gates and found two populations. It left a
sentence saying where to look next: *"one word inside one gate"*, and named the pair -- the summary's
`627 entry(ies)` and the id line's `93 entr(ies) with ids 1..93`. Measuring that pair found something
larger, forty lines above it.

### The measurement

`pnpm docs:check` printed, in one run:

```
check-open-list: OK (627 entry(ies) across 226 section(s) of docs/progress.md and its volumes: 597 open with a reason, 30 closed (29 by a finding, 0 by a round, 1 without one))
check-open-list: the live list was read at v3.121 and holds 37 open entr(ies), and the newest round this corpus names is v3.121
```

**597 and 37, two lines apart, both called "open", and both true.** 597 was every bullet in every list
section the walk read; 37 was the live list. The difference is not drift: it is 560 restatements, one per
round, of the same residuals -- the `### Left open` a round closes with, frozen in a volume and counted
again by the next round's summary. A reader who took 597 away believed 16 times what was true.

The population as v3.121 printed it, by the kind of section each entry sits in:

| kind | sections | entries | open | closed |
| --- | --- | --- | --- | --- |
| `live` -- the index's `## Open` | 1 | 37 | **37** | 0 |
| `record` -- a round's `### Left open` | 178 | 590 | **560** | **30** |
| `closed` -- the record of closures | 2 | 56 | 0 | **56** |
| **the line's own total** | **181** | **683** | | |

627 = 37 + 560 + 30, and the two lines that were published as one number were the first row and the sum
of the first two.

### Why the round that fixed this line did not fix it

Finding 589 found the same line mixing populations, and its subject was the **closed** half: the line was
the index *and its volumes*, the volumes' records close thirty, and the test that read it was asserting
`0 closed by a finding` off the last digit of that thirty. The repair was to read the line's arithmetic
instead of its words -- and the arithmetic held, because 597 = 37 + 560 is arithmetic too. **589 fixed the
half it had a failing test for.** The open half had no failing test, because both numbers were right.

That is finding 600's lesson at a smaller radius: there the two readers were two gates and the fix was to
make them compare; here the two readers are two lines of one gate, and they were already comparable --
`37` was printed twice -- and nobody compared them. A comparison that exists in the output is not a
comparison that exists.

### The repairs

1. **The population is a partition, summed from tallies rather than counted beside them.** `tallyOf(kind)`
   holds each kind's open count, closed count and the three closure authorities; the total in the
   parentheses is their sum, so the line's arithmetic is true by construction rather than by a rule that
   can disagree with its parts.
2. **Each clause names the population it counts.** `37 open in the live list`; `560 open restated in the
   log's records`; `30 closed in the log's records`; and for the record of closures, `56 closed in the
   record of closures`. `restated` is the word that carries the difference between work and the record of
   work at a moment.
3. **A clause appears only for a kind the document holds.** A document that is nothing but the record of
   closures printed `0 open in the live list` for eight rounds, over a section it does not have; the line
   now has one clause there and three in the index.
4. **The section count is split too.** `627 entry(ies) across 226 section(s)` was a division nobody asked
   for: 47 of those 226 are records in table form, holding 318 rows and no entries, and they are counted on
   their own line. The line says `179 of 226` -- the sections the entries were drawn from, and the walk's
   coverage, in that order.
5. **The id line names its two lists.** `94 entr(ies) with ids 1..94 (38 in the live list, 56 in the record
   of closures)` -- 94 is not a third population, it is those two added, and a reader can now add them
   because both numbers are on the page.
6. **The two lines are asserted to agree.** A shipped-corpus case reads the live bucket out of the summary
   and the count out of the stamp and holds them equal, so the pair that could disagree for eight rounds
   now cannot move separately.

### Falsifications

Eight edits, each followed by `test/check-open-list.test.ts` alone, with the module restored byte for byte
after every run.

| the edit | reds |
| --- | --- |
| the closed clause dropped from every bucket | 12 |
| the restatement bucket named the live list | 3 |
| the live list dropped from the partition | 12 |
| the total summed from the open states alone | 3 |
| the live list and the records pooled into one tally | 14 |
| a zero open state printed as a count | 7 |
| the id line's two populations swapped | 4 |
| the closing parenthesis of the summary moved inside the clause | 1 |

**Fifty-six reds across eight mutations.** The fifth is the round's thesis as a mutation: pooling the two
kinds back into one tally -- which is what the code did before this round, in one line -- reds fourteen
cases, the most of any edit here.

### Readings

> Ledger for `v3.122`.

| item | value |
| --- | --- |
| CI | run `44656781771` on `51fa6ff6`: **8 of 8 jobs success**, **14 min 38 s** of wall clock |
| `core` test suite | **257 files, 6728 tests passed** (at v3.122) |
| `cli` test suite | **4 files, 187 tests passed** (at v3.122) |
| repo test suite | **261 files, 6915 tests passed** (at v3.122) |
| coverage | `core` **99.98 / 99.95 / 100 / 99.98**, `cli` **100 / 100 / 100 / 100** -- unchanged: nothing under `src/` moved |
| new tests | **6725 -> 6728, +3**: the live bucket and the stamp asserted equal, a document with no live list printing no live clause, and the smallest corpus holding both kinds |
| the sentences moved | **11**: five fixtures pinning the composite line, the three that read `closed (`, the two that pinned `N entry(ies) across N section(s)`, and the shipped summary and id line |
| the rules | `check-open-list` **+0** -- its repair is a partition, and the partition is the same walk |
| falsifications | eight edits, **fifty-six** reds |
| the population | **630 entry(ies) across 180 of 227**: **38** open in the live list; **562** restated; **30** closed in the records; and **56** in the record of closures -- the reading taken after this round's own record, which is why it is two more than the measurement above |
| the ids | **93 -> 94** (`38 + 56`), printed as its two lists for the first time |
| the number line | **216 -> 217** distinct numbers, dense: 94 in `v2` (`v2.06`..`v2.99`), 123 in `v3` (`v3.00`..`v3.122`) |
| the recording | `44576264388` -> **`44656781771`**: 8 job(s), 83 step(s), 10 readings in the history; the bounds held, so no ceiling moved |
| open entries | **37 -> 38** (`O-094`) |
| LLM calls | **0** |

### Left open

- **Thirty closures live in rounds' records, and the record of closures does not hold them.** The split's
  two refusals are kind-scoped -- a strike in the live list, an unstruck bullet in the record of closures --
  and nothing refuses a strike inside a round's record. Thirty are there -- nine in `volume-02`, eleven in
  `volume-03`, ten across `volume-05` to `volume-09` -- and this round counted them for the first time
  because the line now says which list holds what.
  `[open: which home a closure has when the round that closes it also restates it is decided nowhere, and
  the answer decides whether thirty frozen records are corrected or the rule is scoped -- and the round that
  would decide is the one allowed to edit them, which is none]`
- **The summaries of the other gates name their nouns, and nothing compares them.** `finding(s)`,
  `citation(s)`, `entry(ies)`, `row(s)`, `section(s)` -- nine gates print counts whose nouns no other gate is
  asked about. `[open: this round closed the noun that had a second reader in the same file, and left the
  ones that have none; the repair is a declared unit per summary, and no round has measured which of the
  nine are ambiguous]`

## v3.123 · One noun over two lines, and the ceiling that had no multiple

The round before this one ended with a pair it had not measured: `226 record(s): 201 under a round and 25
under none` on one line, `47 record(s) in table form` on the next. Measuring that pair took one clause. The
same question asked of the CI budgets -- *what does this number have to be twice* -- took a rule and three
sized ceilings, and it found the ceiling had never been asked at all.

### The measurement

Three lines from one run of the shipped tree:

```
check-open-list: 226 record(s): 201 under a round and 25 under none; 217 `vX.YY` round(s) + 1 addendum(s), 17 of them wrote none
check-open-list: 47 record(s) in table form (318 row(s)); the v3.122 record's 2 row(s) were judged, ...
check-ci-budget: OK — 8 job(s) recorded, 62 of 83 step(s) carry their own `timeout-minutes`, ..., 51 min measured (as of run 44656781771); bounds total 327 min; tightest backend / Install a backend this repository did not write at 2.0x ...
```

**47 is inside 226, and neither line said so.** Both numbers were right, which is why no test could see it:
the corpus case already held 47 to the number of `priority` tables and 226 to the number of record sections,
and a subset that is counted correctly beside its whole is invisible to two assertions that each hold one
number to one population. That is finding 602 one line down and finding 600 one gate down: a reader holding
two lines has to derive a relation the page never states.

**And `bounds total 327 min` beside `51 min measured` is a division across eight different ceilings.** It was
defended in this log as a sum of one population -- the bounds steps declare -- and it is: the defect is that
the comparison a bound's life depends on (a job's bounds against the ceiling above them) was printed by no
line, while the workflow-wide pair invited exactly that division.

### The ceiling had no multiple

`R4` and `R10` ask a step bound for twice the slowest reading of its command. The job ceiling was asked only
`R6` -- not narrower than the recording's -- and measured against `ci-readings.json`:

| job | ceiling | slowest day | multiple | run |
| --- | --- | --- | --- | --- |
| `verify` | 18 min | 601 s | **1.80x** | `44656781771` |
| `batteries` | 25 min | 1012 s | **1.48x** | `44576264388` |
| `batteries-heavy` | 27 min | 921 s | **1.76x** | `44576264388` |
| `sensitivity` | 26 min | 675 s | 2.31x | `42142175689` |
| `sensitivity-shard` | 26 min | 669 s | 2.33x | `44516888528` |
| `backend` | 48 min | 910 s | 3.16x | `44516888528` |
| `artefacts` | 15 min | 179 s | 5.03x | `42172498744` |
| `cold-tree` | 20 min | 127 s | 9.45x | `42160224254` |

A day eleven per cent slower than one `verify` has already run reaches its ceiling with every step still
inside its own bound, and the verdict is `the job timed out`: the sentence eleven of its twelve bounds exist
to replace.

### The rule the entry asked for, measured and refused

`O-093` asked for the other rule -- a ceiling that holds the sum of the bounds inside it -- and said no round
had written it because every job would fail it. Both halves were right, and the second is why it should never
be written:

| job | ceiling | own bounds | sum / ceiling |
| --- | --- | --- | --- |
| `verify` | 18 | 53 min | 2.94 |
| `backend` | 48 | 48 min | 1.00 |
| `sensitivity` | 26 | 46 min | 1.77 |
| `sensitivity-shard` | 26 | 43 min | 1.65 |
| `batteries` | 25 | 83 min | 3.32 |
| `batteries-heavy` | 27 | 54 min | 2.00 |

The six preparation steps every job shares carry a three-minute floor each, so **no** ceiling could satisfy
that rule without becoming twenty times the day it bounds -- `artefacts` measures 46 s in a workflow-wide
minimum of 21 minutes of bounds. A ceiling that cannot fire is the same defect as a bound that cannot, one
level up. So the rule is the multiple, and the sum stays a printed number rather than a judge.

### The repairs

1. **The table-form line says how many it is a part of.** `47 of 227 record(s) are in table form`, with the
   denominator taken from `recordSections` -- the same variable the population line prints -- so the two lines
   cannot disagree while both are arithmetic. It read `47 of 226` before this round's own record section
   existed, and both numbers moved together when it appeared, which is the repair behaving as a relation.
2. **The sum gains its denominators, and the ceiling gains a superlative.**
   `bounds total 327 min in 8 ceiling(s); the closest ceiling batteries at 34 min over its slowest day of
   1012 s (2.0x, run 44576264388), and no job is under 2x`.
3. **`R12`: a ceiling holds twice its job's slowest recorded day.** The day comes from `jobDays`, which sums
   **one** reading; a reading that measured only some of the job's steps is skipped rather than summed,
   because a total with a hole in it is smaller than the day. Ties go to the newer run.
4. **The day is not a composite of slow days.** `R4`'s prefix sums each command's slowest reading because it
   is about a bound's position, where a mixture is the worst case; a ceiling is about a day, and a composite
   of ten days is a day no run ever produced.
5. **Three ceilings move**: `verify` 18 -> 21, `batteries` 25 -> 34, `batteries-heavy` 27 -> 31. `batteries`
   moves against v3.121's own reduction, and the comment at the job says so where the reduction was argued:
   that argument is the one finding 604 refuses.

### Falsifications

Each edit was followed by the one test file that owns it, with the module restored byte for byte.

| the edit | reds |
| --- | --- |
| the table-form denominator made `recordSections + 1` | 6 |
| the table-form denominator dropped, the line as it stood | 6 |
| `R12`'s comparison made `false` | 3 |
| the hole-skip removed from `jobDays` | 7 |
| the summary's ceiling clause dropped | 2 |
| `jobDays` restricted to the recording, ignoring the history | 2 |

**Twenty-six reds across six edits.** The second is this round's own defect restored verbatim, and it is the
edit no assertion in the tree could have caught before this round: both numbers stay right.

### Readings

> Ledger for `v3.123`.

| item | value |
| --- | --- |
| CI | run `44695923790` on `a1d983cd`: **8 of 8 jobs success**, **15 min 15 s** of wall clock |
| `core` test suite | **257 files, 6737 tests passed** (at v3.123) |
| `cli` test suite | **4 files, 187 tests passed** (at v3.123) |
| repo test suite | **261 files, 6924 tests passed** (at v3.123) |
| coverage | `core` **99.98 / 99.95 / 100 / 99.98**, `cli` **100 / 100 / 100 / 100** -- unchanged: nothing under `src/` moved |
| new tests | **6728 -> 6737, +9**: six for `R12` (the refusal, the exact multiple, the history's day, the hole, no ceiling, the summary's count) and three for `jobDays` |
| the sentences moved | **11**: five open-list fixtures, the shipped case's regex and the new equality, and four pins in `gate-steps.test.ts` -- `18m` -> `21m`, `25m` -> `34m`, `27m` -> `31m`, `of 18m` -> `of 21m` |
| the rules | `R12` in `ci-budget.mjs`, with `jobDays` as the reader it argues from |
| falsifications | six edits, **twenty-six** reds |
| the population | **47 of 227** record(s) in table form, against **318** rows -- and **227** is the record population on the line above it, not a second number |
| the ceilings | **21** / **34** / **31** minutes: 2.10x, 2.02x and 2.02x their jobs' slowest days |
| the recording | `44656781771` -> **`44695923790`**: 8 job(s), 83 step(s), **11** readings in the history; measured **54** min against 51, and every ceiling still holds its multiple |
| open entries | **38 -> 38**: `O-093` closed by finding 605, `O-095` opened for the day between twice the slowest and the sum |
| LLM calls | **0** |

### Left open

- **The ceiling is twice the slowest day, and a day slower than that still dies unnamed.** `batteries` holds
  **83** minutes of step bounds in a **34**-minute ceiling, so a 2 100 s day -- 2.08x its slowest recorded day
  -- reaches the ceiling with every step still inside its own bound, and the workflow-wide sum
  (`bounds total 327 min in 8 ceiling(s)`) is arithmetically right about a population no rule is about.
  `[open: the two failures a slow-but-not-hung day can produce name nothing either way -- the job's death, or
  a ceiling inflated until it cannot fire -- and the third answer, a split small enough that the sum fits,
  needs a shared setup job rather than six repeated ones]`

## v3.124 · The nouns the gates count in, and the number two of them print

`O-091` asked the question a round can act on: *what population does each unit noun cover, and has
anyone asked?* Its own answer was that the nouns were private -- "`finding(s)` in
`check-audit-volumes`, `citation(s)` in `check-citations`, `entry(ies)` in `check-open-list`, `row(s)`
in its table census -- and no reader asks". Measured, the first half of that is false and the second
half is the whole finding.

### The measurement

A census over the eighteen gates `docs:check` runs, reading every `N noun(s)` their summaries print:

| | |
| --- | --- |
| unit nouns | **53** |
| gate/noun pairs | **69** |
| nouns printed by more than one gate | **9** -- `file(s)` 4, `row(s)` 4, `run(s)` 4, `row break(s)` 3, `addendum(s)` 2, `comment(s)` 2, `reading(s)` 2, `round(s)` 2, `volume(s)` 2 |
| counts of 1 or more printed by two gates under one noun | **3** |

Three of the four nouns the entry named are shared. `row(s)` is printed by four gates --

| gate | the number | what it counts |
| --- | --- | --- |
| `check-l4-status` | 9 | rows of the L4 status table that agree with the registry |
| `check-open-list` | 318, and 1 | rows inside the record tables, and the newest record's rows judged |
| `check-fault-cases` | **8** | rows in a case's pre-injection window |
| `check-repository-table` | **8** | rows under `## Repository` |

-- and **two of them print the same number for unrelated tables.** Read four lines apart in a CI log,
`8 row(s)` twice is indistinguishable from one number printed twice. That is finding 600's shape one
level up: there, two gates printed *different* numbers for one word and a reader had to reconcile
them; here four print one word for four populations and the only question that matters -- do they
overlap? -- is asked by nothing.

### The subset that was already there

`file(s)` is the noun where the answer is arithmetic, and it was the second defect:

```
check-comments-language: OK — 474 file(s), 25443 comment(s) ...
check-citations: OK (2419 citation(s) of 602 number(s) across 37 file(s), ...)
check-doc-counts: OK (... 2 gate-site claim(s) agreeing with 230 claim(s) across 67 file(s))
check-workflow-language: OK — 6 file(s), 1236 '#' mark(s) ...
```

**Every one of the 67 is one of the 474**, and that was measured rather than assumed: the 67 are the
tests that prove a gate site, and the comment guard walks every source file, so the inclusion holds
`67 of 67`. No line said so. This is finding 603 a gate over -- one noun, two populations, a subset
printed as if it were a second whole -- and the repair is the same `of`, with the denominator
**derived from the walk** rather than written down, because a copied 474 would go stale the first
time a test file was added, which is every round.

The inclusion is a rule, not a coincidence of this tree, so the gate that prints the `of` is the gate
that refuses to print a false one: a gate site proved by a file the source walk does not read is a
red run, whose repair is to move the proof or teach the walk a new extension -- not to drop the `of`.

### The reader, and the judgement it cannot make

`check-unit-nouns` derives the census, prints it, and holds the vocabulary in
`golden-master/unit-nouns.json` the way `gate-sites.json` is held. The counts are **not** committed:
they move every round, and an inventory that went red for a reason its subject has nothing to do
with is the crying-wolf defect this campaign has recorded more than once. The committed file records
which gate prints which noun, and which two gates print one number.

That last part cannot be derived, and the first draft of the summary proved it by getting it wrong.
It said every coincidence was "one number over two populations and not one population counted
twice" -- and the first coincidence the census found is `1 addendum(s)` in `check-open-list` and
`check-progress-volumes`, which **is** one population counted twice: both take it from
`populationsOf`. A sentence that is right about `8 row(s)` and wrong about `1 addendum(s)` is the
constant this campaign keeps finding, so the judgement is written by a person, `--write` will not
invent one, and an unread coincidence is a failure:

```
check-unit-nouns: FAILED — 3 count(s) coincide across gates and no record says whether that is one
  population or two: 1 addendum(s) in check-open-list and check-progress-volumes; 474 file(s) in
  check-comments-language and check-doc-counts; 8 row(s) in check-fault-cases and
  check-repository-table
```

The judgement is keyed by the noun and the gate pair, never by the number: `473 file(s)` and
`474 file(s)` are the same coincidence, and a key that moved with the count would make every added
source file a red gate whose repair is to retype a sentence that had not stopped being true.

### The coincidence the repair created

The third coincidence did not exist before this round. `check-doc-counts` now prints
`67 of the 474 file(s)`, `check-comments-language` prints `474 file(s)`, and the two numbers are
equal **because they are the same walk**: the denominator is `sourcesIn(ROOT)`. So the census had to
say that, and it says it in the inventory:

> one population and one reader -- `check-doc-counts` takes its denominator from `sourcesIn` in
> `comment-language.mjs`, the same walk that produces the other, so the agreement is by construction
> rather than a coincidence of this week

Two gates printing one number is either agreement or an accident, and the output cannot tell them
apart. `1 addendum(s)` and `474 file(s)` are the first; `8 row(s)` is the second. The census names
all three, every run, with the sentence a person wrote for each.

### Falsifications

| the edit | reds |
| --- | --- |
| `FUNCTION_WORDS` emptied, so `the record(s)` is read as a noun | 1 |
| zero counted as a coincidence, so three quiet gates read as one number | 1 |
| one gate's two uses counted as a coincidence | 1 |
| `keyOf` keyed by the count instead of the gate pair | 2 |
| the inventory's `reading` accepted as absent rather than refused | 2 |
| `jobDays`-style denominator hardcoded in the summary instead of `sourcesIn` | 1 |
| the coincidences committed with their counts, so the file drifts every round | 1 |

### Readings

> Ledger for `v3.124`.

| item | value |
| --- | --- |
| CI | run `44698243645` on `4d253c91`: **8 of 8 jobs success**, **13 min 19 s** -- the run that verified the tree this round started from; this round's own run is taken on it and recorded here afterwards, which is how every round's row is written |
| `core` test suite | **258 files, 6754 tests passed** (at v3.124) |
| `cli` test suite | **4 files, 187 tests passed** (at v3.124) |
| repo test suite | **262 files, 6941 tests passed** (at v3.124) |
| coverage | `core` **99.98 / 99.95 / 100 / 99.98**, `cli` **100 / 100 / 100 / 100** -- unchanged: the new code is `scripts/`, which the `core` coverage run does not include |
| new tests | **6737 -> 6754, +17**: sixteen in `unit-nouns.test.ts` (eleven over the pure readers, one for the coincidences' judgement, four over the gate itself) and one in `check-doc-counts.test.ts` holding the denominator to the walk |
| the new gate | `check-unit-nouns.mjs`, 21st step of `docs:check`, reading the eighteen gates before it in **2.5 s** |
| the new vocabulary | `scripts/unit-nouns.mjs`: `nounsIn`, `censusOf`, `sharedNounsOf`, `coincidencesOf`, `keyOf`, `inventoryOf`, `summaryOf` |
| the inventory | `golden-master/unit-nouns.json`: **53** nouns, **9** shared, **3** coincidences, each with a written judgement and **no counts** |
| the census | **53 unit noun(s) in 69 gate/noun pair(s)**, 9 printed by more than one gate, 3 counts coinciding across gates |
| the subset | `67 of the 474 file(s) the source walk reads`, and the 67 are inside the 474 by construction, checked by rule 6 |
| falsifications | seven edits, **nine** reds |
| the bounds that moved | `Lint` **14 -> 16 min**, `Test with coverage` **6 -> 7**, the `verify` ceiling **21 -> 24**: the recording moved to run `44698243645`, where `Lint` measured 477 s and `verify`'s slowest day is 696 s, and `R10`/`R12` named the three numbers |
| open entries | **38 -> 38**: `O-091` closed by findings 606 and 607, `O-096` opened for the relations the census names but does not compute |
| LLM calls | **0** |

### Left open

- **The census names the populations; it computes almost none of the relations between them.**
  `file(s)` has an `of` because `check-doc-counts` derives its denominator. `row(s)` has four
  populations and no relation at all, and `volume(s)` -- 14 audit volumes and 18 progress volumes,
  printed two lines apart -- is disjoint by directory and nothing says so. A census that held the
  sets would answer that arithmetically; the four sets are not all reachable from a data module yet,
  and reaching them is a change to four gates rather than to this one.
  `[open: which of those four is worth a reader first is a measurement, not a decision -- the pair
  that a reader can act on is the one whose two numbers are equal, which is why `row(s)` came first]`

## v3.125 · The census printed which gates share a noun, and never what they counted

The round before this one built the census and left a sentence it could not answer: `volume(s)` is printed by
two gates, and the two numbers were printed forty lines apart. Measuring that sentence took one line per noun,
and the line exposed a wall the census had been standing behind since it was written -- a wall built by the
repair two rounds before it.

### The measurement

Three lines from one `docs:check`:

```
check-unit-nouns: OK — 54 unit noun(s) in 70 gate/noun pair(s); 9 of them are printed by more than one gate: file(s) by 4, row(s) by 4, run(s) by 4, row break(s) by 3, addendum(s) by 2, comment(s) by 2, reading(s) by 2, round(s) by 2, volume(s) by 2; and 3 count(s) coincide across gates: ...
check-audit-volumes: OK — 14 volume(s), 605 finding(s), 1–608; ...
check-progress-volumes: OK — 18 volume(s), 272 heading(s): 219 `vX.YY` round(s), 1 addendum(s), 50 `Pass` round(s), 2 unnumbered; ...
```

**`volume(s) by 2`.** The gate that exists to hold two populations of one word together printed the number of
gates and never the numbers. It is finding 603's defect one gate over, and the same defence is available and
has the same hole: both numbers are right, so no assertion about either could see it.

**And the census could not have printed one of them even if it had tried.** `round(s)` is one of the nine, and
the census recorded no count under it at all -- because both gates write `` 219 `vX.YY` round(s) `` and the
reader demanded the number at the end of the text in front of the noun. The qualifier that finding 600's repair
inserted to say *which* era a round belongs to is exactly the character the reader could not see past.

### Five defects

| # | the defect | the evidence |
| --- | --- | --- |
| **609** | the summary names the gates and not their numbers | `volume(s) by 2` against one gate's 14 and another's 18 |
| **610** | the qualifier finding 600 added is invisible to the reader finding 607 added | `round(s)` shared by two gates with `[]` under both, and `219`/`219` -- a real coincidence -- unreachable |
| **611** | three uses whose number the reader could not see were dropped in silence | `budget(s)`, `scope(s)`, `enum call(s)`; and `1248 '#' mark(s)` recovered by the same repair |
| **612** | the `verify` job ran a claimant against a one-commit checkout | `check-repository-table` refuses `Commits (at `e22e2de`) = 536` in a `--depth 1` clone; three CI runs lost to it |
| **613** | `outputTail` was written for the failure that then had no explanation, and imported by nobody | the CI log's four lines naming a file, an exit code, and nothing else |

### The repairs

1. **One line per shared noun**, holding every gate's number with the qualifier it carried, the fact that a count
   two gates print agrees, and the relation a person wrote.
2. **The relation is the judgement, and it is required of all nine.** The three coincidences were a special case
   of the nine, so `coincidences` left the inventory and the refusal moved from "a coincidence nobody has read"
   to "a shared noun nobody has related" -- strictly stronger, and one section shorter.
3. **The qualifier is captured and travels with the count**: parenthesised, backticked, quoted. `94 (38+56)
   character(s)` still reads 94, and `219 `vX.YY` round(s)` now reads 219 with its era attached.
4. **`unreadableOf` prints what the census could not size**, so the headline is a measurement rather than a floor.
5. **`fetch-depth: 0` on the `verify` job**, with the reason at the checkout and a test that holds the
   relationship: a job whose steps run a claimant or the documentation gate must fetch the history the claimant
   reads. Both directions asserted.
6. **`failureDetail`** chooses between a report and a labelled tail, so the next silent red explains itself.

### Falsifications

| the edit | reds |
| --- | --- |
| the line prints `N gate(s)` instead of the numbers | 4 |
| the relation ignored, every shared noun printed `unclassified` | 3 |
| the qualifier dropped rather than carried, the count still read | 1 |
| `BEFORE` as it stood, qualifiers reaching no number | 4 |
| the numbers sorted ascending instead of in the gate's order | 3 |
| the unreadable uses dropped again, as they were | 1 |
| `fetch-depth: 0` removed from `verify` | 1 |
| `fetch-depth: 0` added to `backend`, which runs no claimant | 1 |
| `failureDetail` returning `failureSummary` alone, as it was | 1 |
| the label dropped, so a tail reads as a report | 1 |

**Ten edits, twenty reds.** The fourth is the most interesting of them: the mutant is the reader as it stood for
one round, and it is red in four places while every one of its numbers was right.

### Readings

> Ledger for `v3.125`.

| item | value |
| --- | --- |
| CI | run `44698243645` on `4d253c91`: **8 of 8 jobs success** -- the newest run, and the one the recording is taken from |
| `core` test suite | **258 files, 6767 tests passed** (at v3.125) |
| `cli` test suite | **4 files, 187 tests passed** (at v3.125) |
| repo test suite | **262 files, 6954 tests passed** (at v3.125) |
| coverage | `core` **99.98 / 99.95 / 100 / 99.98**, `cli` **100 / 100 / 100 / 100** -- unchanged: nothing under `src/` moved |
| new tests | **6754 -> 6767, +13**: ten for the census (qualifier, quoted qualifier, three words away, order, relation lines, the agreeing mark, the gate with no number, unreadable uses, the stated count, the committed shape), one for `failureDetail`, two for the checkout rule |
| the sentences moved | **13**: the census's inventory and summary, the refusal, `--write`'s merge, and the two refusal tests rebuilt from a derivation of the fixture rather than from the shipped document |
| the rules | the relation replaces the coincidence as the unit of judgement; `checkout >= what the claimant reads` |
| falsifications | ten edits, **twenty** reds |
| the population | **47 of 228** record(s) in table form against **318** rows, unchanged by this round |
| the census | **54 unit noun(s) in 70 gate/noun pair(s)**, **9** shared and **9** relations, **4** coincidences -- `221 round(s)` and `1 addendum(s)` agreeing across the two readers of the log's population, and one pair fewer than v3.125 reported because `check-ci-budget` stopped printing `N round(s)` the moment its recording became the newest round's, which is the census's population moving with the corpus rather than with the tree |
| open entries | **38 -> 38**: `O-096` closed by findings 609 and 611, `O-097` opened for the relation that is written rather than derived |
| LLM calls | **0** |

### Left open

- **The relation a shared noun carries is a sentence, and the census cannot contradict it.** `volume(s)` is
  disjoint by directory and `row(s)` is four tables, and both are true statements about a corpus no data module
  exposes as a set. Holding the sets would answer `disjoint` arithmetically; reaching them is a change to four
  gates, and the census would then be able to refuse a relation the sets contradict -- the difference between a
  judgement and a claim. The clone finding 612 added to the `verify` job is one more thing in that job's day, and
  `R12` is the rule that will refuse the ceiling if it moves the day far enough.
  `[open: which of the four sets is worth a reader first is a measurement -- `file(s)` is the one whose two
  agreeing numbers come from one walk and whose two disagreeing ones come from two, so it is the noun whose
  relation a reader would act on if it were wrong]`

## v3.126 — the wall was one job narrow, and the failure was printed in the three healthiest lines

### What the round began with

The first run of v3.125 -- `44741826563` on `4195f2d7` -- finished **7 of 8**. The job that passed was `verify`,
the one v3.125 had just given the full history; the job that failed was `sensitivity`, on the file v3.124 had
taught to read every gate's number.

```
verify-sites-are-sensitive: some claimants could not be measured at all:
  packages/core/test/unit-nouns.test.ts does not pass on its own (exit 1), so its claims are unmeasured
    its own output ends:    Start at  13:10:56
    its own output ends:    Duration  5.05s (transform 168ms, setup 90ms, collect 97ms, tests 4.53s, ...)
    its own output ends: JSON report written to /tmp/rca-sensitive-PpPRVb/32.json
```

Two defects in one report, and neither of them is in the census. The file fails because its checkout is one commit
deep (**finding 614**): the three measurements finding 612 took are re-taken in `git clone --depth 1` and answer the
same way. And the reason it fails is not in the report because three of the four readers of a failed run were
written where a pipe is not a terminal (**finding 615**): the runner's own bytes carry `\x1b[2m   Start at \x1b[22m`,
which is why the quoted lines are the quiet ones.

### The two defects

| finding | the shape | the repair | falsified by |
| --- | --- | --- | --- |
| 614 | the rule "a job that runs a claimant fetches the history the claimant reads" was a hand-made list of four commands, and `verify-sites-are-sensitive` -- a script that runs 34 claimants of its own -- was not on it, so finding 612's repair moved the red one job over, unchanged | the safe answer is the default: every job fetches the history, and the one exemption (`backend`) is a job whose `run:` lines are read one at a time against the four commands it is exempt for | **3** edits, **4** reds |
| 615 | `failureSummary`, `outputTail` and `hungTests` anchor their patterns at the start of a line, and a coloured `FAIL` starts with an escape; the battery printed "the run printed no report" with the report three lines above it, in colour | one reader at the boundary (`decoloured`) called by the three; the fourth reader was measured not to need it and is left as it was | **4** edits, **8** reds |

### The measurements this round rests on

| reading | value |
| --- | --- |
| `node scripts/check-repository-table.mjs`, in `git clone --depth 1` | `the revision `e22e2de` does not resolve to a commit` |
| `node scripts/check-unit-nouns.mjs`, same clone | `FAILED -- check-repository-table exited 1, so its summary is not the one this tree reports` |
| `vitest run packages/core/test/unit-nouns.test.ts`, same clone | `Tests 1 failed | 25 passed (26)`, exit 1 |
| `git rev-list --count HEAD`, shallow against full | **1** against **650** |
| escapes in the coloured claimant run | **216**, and `failureSummary` empty on it |
| `Check out` on run `44741826563`, jobs with full history | **3.0** s |
| `Check out` on the same run, jobs without | **1.0-2.0** s |
| the history | 34 MB against 5.1 MB for one commit |
| the bounds the new reading moved | `verify`'s ceiling **24 -> 25** min (its slowest day is **722** s, 1.99x) and the `Lint` step **16 -> 17** min (**497** s, 1.92x) -- both fired on the first reading taken after this round's checkout change |

### Falsifications

| the edit | reds |
| --- | --- |
| `fetch-depth: 0` removed from `sensitivity` | 1 |
| a fifth `run:` line added to the exempt `backend` | 1 |
| `verify` added to the exemption list | 2 |
| `decoloured` removed from `failureSummary` and `hungTests` | 2 |
| `decoloured` removed from `outputTail` | 1 |
| `decoloured` removed from `exhaustedTestBudget` | 0 -- the reading that says the defect was never there |
| the strip written as `[` .. `m` rather than as the escape | 5 |

**Seven edits, twelve reds**, and the sixth is the one that decided a line of the repair: a reader whose pattern is
not anchored cannot be blinded by what precedes the word, so `exhaustedTestBudget` keeps `String(text)` and says why
at the call rather than joining an edit made uniform by its siblings.

### Readings

> Ledger for `v3.126`.

| item | value |
| --- | --- |
| CI | run `44756845473` on `2abd1da2`: **8 of 8 jobs success** -- the run of the commit this record is in, and the one the recording is taken from |
| `core` test suite | **258 files, 6771 tests passed** (at v3.126) |
| `cli` test suite | **4 files, 187 tests passed** (at v3.126) |
| repo test suite | **262 files, 6958 tests passed** (at v3.126) |
| coverage | `core` **99.98 / 99.95 / 100 / 99.98**, `cli` **100 / 100 / 100 / 100** -- unchanged: the round added one reader and three calls to it, every one of them taken |
| new tests | **6767 -> 6771, +4**: the coloured report, the coloured tail, the strip and its counter-case (`a [2m b` is prose), and the coloured hang |
| the sentences moved | **3**: the checkout note above `jobs:`, the exemption's justification in the test, and the comment at `exhaustedTestBudget` |
| the rules | every job fetches the history unless it is the named exemption; a reader of a run reads the run, not the pipe it came through |
| falsifications | seven edits, **twelve** reds |
| the population | **47 of 230** record(s) in table form against **318** rows |
| the census | **54 unit noun(s) in 71 gate/noun pair(s)**, **9** shared and **9** relations, **4** coincidences -- `221 round(s)` and `1 addendum(s)` agreeing across the two readers of the log's population, while `check-ci-budget` prints `2 round(s)` about the distance to this record |
| open entries | **38 -> 38**: no entry closed and none opened -- both defects were of the shape this campaign removes rather than of the kind it files |
| LLM calls | **0** |

### Left open

- **The ceiling is twice the slowest day, and a day slower than that still dies unnamed.** `batteries` holds **83**
  minutes of step bounds inside a **34**-minute ceiling, so a day of **2 100** s reaches the ceiling with every step
  still inside its own bound, and the rule that would cover it -- a ceiling at least the sum of the bounds --
  was measured and refused because six preparation steps carry a three-minute floor in every job. The third answer
  is the one the same arithmetic gave twice before: a job split small enough that the sum fits, which is a split
  that shares its setup rather than repeating it.
  `[open: which of the two failures a slow-but-not-hung day should produce -- the job's death, which names nothing,
  or a ceiling inflated until it cannot fire, which names nothing either]`
- **The relation a shared noun carries is a sentence, and the census cannot contradict it.** Nine nouns are printed
  by more than one gate and each carries a `relation` a person wrote; the census holds summaries, not sets, so
  `row(s)` being four tables is a claim it can print and not check. This round added a fourth thing to that
  sentence's neighbourhood -- a claimant whose output arrives coloured -- and did not touch the question.
  `[open: which of the four sets is worth a reader first is a measurement -- `file(s)` is the one whose two
  agreeing numbers come from one walk and whose two disagreeing ones come from two]`

## v3.127 — the judgement was a sentence, and the census checked only that one existed

### What the round began with

`O-097`: nine nouns are printed by more than one gate, each carries a `relation` a person wrote, and nothing in
the tree could contradict one. The entry asked for the two capabilities that would fix it -- `disjoint` derived
rather than asserted, and a contradictory relation refused -- and said the price was a change to four gates so the
census could hold sets.

This round took a cheaper road that gets both: **the partition of a noun's gates into populations**. A group of
two is the claim that those two gates read one set, and that claim has a consequence in numbers. A set of
thirty-odd thousand row breaks is not held; the claim that is worth that many members is the claim that two gates count
them at all.

### The measurement

The nine sentences were read against the gates, and two were wrong in opposite directions (**finding 617**):

| sentence | what the file says |
| --- | --- |
| `addendum(s)`: "both take it from `populationsOf` in `progress-volumes.mjs`" | `check-open-list` imports `node:fs`, `./docs-corpus.mjs`, `node:path`, `node:url` -- not `progress-volumes.mjs` |
| `round(s)`: "both taken from `populationsOf`" **and** "no arithmetic forces the two numbers to agree" | the same file: it is one claim denying the forcing it has just described |

Both conclusions -- one population, so the counts must agree -- were right. The census checked that a sentence
existed and never what it said.

### The two defects

| finding | the shape | the repair | falsified by |
| --- | --- | --- | --- |
| 616 | the judgement was prose, and the part of it a run can decide -- whether two gates read one set, whose consequence is that their counts must agree -- was not separated from the part it cannot | a noun's gates are partitioned into populations, stored beside the sentence; a group of two must have a count in common or the run is refused, and the summary says how many equalities are checked rather than how many sentences are written | **9** edits, **14** reds |
| 617 | two of the nine sentences were already false, one claiming a shared reader it did not have and one denying a forcing it had just described | both rewritten to say what the files say, and the checkable half moved into `populations` so the sentence keeps only what no run can decide | the readings above |

### What the partition changed in the output

```
row(s) — ... ; 8 in check-fault-cases; 9 in check-l4-status; 318, 2 in check-open-list; 8 in check-repository-table
  (a count two gates print agrees, and they are not in one population)
file(s) — 37 in check-citations; 474 in check-comments-language; 474 in check-doc-counts
  (one population at 474, and the count agrees); 6 in check-workflow-language
addendum(s) — 1 in check-open-list; 1 in check-progress-volumes (one population at 1, and the count agrees)
```

`22` populations over the `9` shared nouns, `3` of them read by more than one gate, and `3` of the `4` coinciding
counts are now checked instead of assumed, with the fourth printed as what it is. The fourth is printed as what it is: `8 row(s)` is the corpus.

### The first partition written under the rule was refused by the rule

`volume(s)` was written as one group of two -- the audit volumes and the progress volumes, which are two
directories with no file in common:

```
check-unit-nouns: FAILED — 1 population(s) the record declares one do not agree on a count:
  14 and 18 volume(s) in check-audit-volumes and check-progress-volumes
```

Fourteen and eighteen are not two readings of one set, and the arithmetic said so before a person did. The
mistake was real -- it was made while writing the inventory this round -- and it is the clearest evidence that the
field is a claim rather than a comment.

### The measurements this round rests on

| reading | value |
| --- | --- |
| `check-open-list`'s imports | `node:fs`, `./docs-corpus.mjs`, `node:path`, `node:url` |
| `check-progress-volumes`'s corpus | `INDEX`, `VOLUMES` from `progress-volumes.mjs`, labelled by `labelOf` |
| populations over the nine shared nouns | **22**, of which **3** hold more than one gate |
| coinciding counts, by attribution | **3** inside a declared population, **1** across two |
| `check-unit-nouns`, after the partition | `53 unit noun(s) in 69 gate/noun pair(s); ... 3 population(s) are read by more than one gate, and 3 of them agree on a count` |

### Falsifications

| the edit | reds |
| --- | --- |
| `volume(s)`'s partition written as one group of two | 1 -- the shipped gate refuses `14 and 18` |
| `agreementOf` comparing whole sets instead of their intersection | 2 |
| the "does not print this noun" rule removed | 1 |
| the "two populations" rule removed | 1 |
| `coincidencesOf` ceasing to read the partition | 3 |
| the groups left in the order the document wrote them | 2 |
| `--write` ceasing to refuse a population that no longer agrees | 1 |
| a group of two printing its numbers with no note | 2 |
| the flat-list guard removed | 1 |

**Nine edits, fourteen reds**, and the first is the one that is not a mutation: it is the mistake this round made
while writing the field, caught by the field.

### Readings

> Ledger for `v3.127`.

| item | value |
| --- | --- |
| CI | run `45018766872` on `9ad8702e`: **8 of 8 jobs success** -- the run the recording is taken from, one commit before this record's own, whose run is green as well; **48** min measured against the **63** of the run it replaced |
| `core` test suite | **258 files, 6784 tests passed** (at v3.127) |
| `cli` test suite | **4 files, 187 tests passed** (at v3.127) |
| repo test suite | **262 files, 6971 tests passed** (at v3.127) |
| coverage | `core` **99.98 / 99.95 / 100 / 99.98**, `cli` **100 / 100 / 100 / 100** -- unchanged: the round added readers and callers, every branch of them taken |
| new tests | **6771 -> 6784, +13**: the partition's five failure shapes, the flat-list shape, the common-count reading, the disagreement, the attribution, the summary's count of checked equalities, the two states, the shared formatter, and three gate refusals |
| the sentences rewritten | **2**: `addendum(s)` and `round(s)` |
| the rules | a shared noun carries a sentence and a partition; a population of two is checked against its own numbers; `--write` refuses a population that no longer agrees |
| falsifications | nine edits, **fourteen** reds |
| the population | **47 of 231** record(s) in table form against **318** rows |
| the census | **53 unit noun(s) in 69 gate/noun pair(s)**, **9** shared, **22** populations, **3** read by more than one gate, **4** coincidences -- `3` forced by a declared population and `1` across two |
| open entries | **38 -> 39**: `O-097` closed by findings 616 and 617; `O-098` and `O-099` opened, both found by doing the work |
| LLM calls | **0** |

### Left open

- **The ceiling is twice the slowest day, and a day slower than that still dies unnamed.** Nothing here touches it:
  `batteries` still holds **83** minutes of step bounds in a **34**-minute ceiling, and the day between twice its
  slowest reading and the sum of those bounds is still the one that would die at the ceiling with every step inside
  its own bound.
  `[open: what a slow-but-not-hung day should produce -- the job's death, which names nothing, or a ceiling
  inflated until it cannot fire, which names nothing either]`
- **A population of one is a label nobody has to write, and the census throws the gate's own line away.**
  Nineteen of the twenty-two populations hold a single gate, so the partition says nothing the gate's name did not;
  the sentence that would say what `check-l4-status`'s `9 row(s)` counts is the line the census reads and then
  discards, keeping the count and its qualifier.
  `[open: whether the label belongs in the inventory, where it rots like every sentence, or in the gate's line,
  which the census would have to keep -- a sentence per gate against a log line per noun]`
- **A gate joining a noun discards a sentence that is still true, and `round(s)` pays it twice in this round.**
  `check-ci-budget` prints `N round(s)` while the ledger is behind and stops when it catches up, so the noun's gate
  set moved twice here -- in, and then out again -- and a judgement keyed by the noun and its gates was dropped and
  rewritten each time. The rule is right, because a partition drawn around four gates says nothing about a fifth;
  the price is a sentence that was not wrong being retyped.
  `[open: whether the key should be the noun, with a newcomer refused until it is placed and the sentence left
  standing -- the risk being a sentence about four gates that silently covers five]`


## v3.128 — the judgement was keyed by the noun and its gates, and the gate set moves

### What the round began with

`O-099`, in its own words: `check-ci-budget` prints `N round(s)` while the ledger is behind and stops when it
catches up, so the noun's gate set moves in and out within one round, and a judgement keyed by the noun and its
gates is dropped and refused each time. The rule was right -- a partition drawn around four gates says nothing
about a fifth -- and the price was a sentence that was not wrong being retyped. The entry's open question named the
risk of the cheaper answer: a sentence about four gates that silently covers five.

### The measurement

`round(s)` paid it three times in v3.127: **69 -> 70 -> 69** gate/noun pairs, with the judgement dropped at each
move. What a person read was this gate's sentence about a noun nobody had written about:

```
check-unit-nouns: FAILED — 1 noun(s) are printed by more than one gate and no record says whether that is one
population or two: round(s) — 221 `vX.YY` in check-open-list; 221 `vX.YY`, 50 `Pass` in check-progress-volumes
```

Two more halves turned up while the first was being repaired, and neither is visible from that sentence:

| the half | what it cost |
| --- | --- |
| the record lived on `shared`, which is derived | a noun printed by one gate leaves `shared`, and the sentence went with it -- under any key |
| six readers asked `partitionProblems(judgement)` for the gates | the function answered out of `judgement.gates`, which is the record, so every reader compared the record with itself and a gate joining the noun changed nothing |

### The repair

Three decisions, and the third was found by a test written for the second.

**The key is the noun.** A judgement belongs to the word a person wrote about, and a gate joining the word is a
change to the partition rather than to the sentence. What the key still refuses is a judgement carrying over
between nouns: `row(s)` and `file(s)` are different populations, and their sentences are not interchangeable.

**The judgements are a list of their own.** `nouns` and `shared` are derived from the census, so a judgement on
either is deleted by the first `--write` in which its noun is silent. `budget(s)` is the proof: it is printed only
while a ceiling is being widened, so it is absent from most rounds. Measured on a fixture before the repair, a
`--write` in a round with no `budget(s)` removed the entry and its sentence, and the round the noun returned would
have been refused for a missing sentence. The list is copied rather than recomputed, and a judgement for a noun
this run did not print is kept and named:

```
check-unit-nouns: budget(s) carries a judgement and no gate printed it this run — kept
```

**The gates come from the census.** `partitionProblems(judgement, gates)` takes the set this run found, and
`stateOf(census, judgements, noun)` returns the gates, the record and `declared` together, so the six readers
cannot each hold a different idea of what to compare. The refusal a newcomer produces names the gate rather than
the key:

```
check-unit-nouns: FAILED — 1 noun(s) are printed by more than one gate and no record says which of them read one
population: round(s) (check-ci-budget is in no population)
```

### The measurements this round rests on

| reading | value |
| --- | --- |
| unit nouns / gate-noun pairs | **53** / **69** |
| shared nouns | **9**, each carrying a sentence and a partition |
| populations | **22**, of which **3** hold more than one gate |
| coinciding counts | **4** -- **3** inside a declared population, **1** across two |
| `round(s)`'s gate set across v3.127 | **69 -> 70 -> 69**, three moves in one round |
| `--write` with a silent `budget(s)` | before the repair: the entry and its sentence gone; after: kept |

### Falsifications

| the mutation | reds |
| --- | --- |
| `partitionProblems` not reporting a gate nobody placed | 1 |
| `judgementsIn` reading the derived `nouns` instead of the judgement list | 8 |
| `judgementsIn` reading `shared`, as it did before the round | 1 |
| `--write` dropping a judgement whose noun this run did not print | 1 |

**Four mutations, eleven reds**, and each red is a case that names the defect rather than the shape: the first is
"the sentence survives but the run does not say what it could not place", the second and third are "the record is
looked for where it no longer lives", and the fourth is the measured `budget(s)` deletion.

### Readings

> Ledger for `v3.128`.

| item | value |
| --- | --- |
| CI | run `45022458859` on `60069525`: **8 of 8 jobs success** -- the newest run recorded before this round's own, whose workflow this round does not change |
| `core` test suite | **258 files, 6791 tests passed** (at v3.128) |
| `cli` test suite | **4 files, 187 tests passed** (at v3.128) |
| repo test suite | **262 files, 6978 tests passed** (at v3.128) |
| coverage | `core` **99.98 / 99.95 / 100 / 99.98**, `cli` **100 / 100 / 100 / 100** -- unchanged: the round added readers and callers, every branch of them taken |
| new tests | **6784 -> 6791, +7**: the noun-shaped key, the four cases of a gate joining, the reading of the gates this run found, and the two end-to-end refusals that keep a sentence |
| the record's shape | `nouns` and `shared` derive from the census; `judgements` is the list a person writes and `--write` copies |
| falsifications | four mutations, **eleven** reds |
| the census | **53 unit noun(s) in 69 gate/noun pair(s)**, **9** shared, **22** populations, **3** read by more than one gate, **4** coincidences -- `3` forced by a declared population and `1` across two |
| open entries | **39 -> 38**: `O-099` closed by finding 618; no entry opened, because the half that was found while repairing it was repaired here |
| LLM calls | **0** |

### Left open

- **The ceiling is twice the slowest day, and a day slower than that still dies unnamed.** Nothing in this round
  touches `ci.yml`: `batteries` still holds **83** minutes of step bounds inside a **34**-minute ceiling, and the
  day between twice its slowest reading and the sum of those bounds is still the one that would die at the ceiling
  with every step inside its own bound. The third answer -- a job split small enough that the sum fits, sharing
  one setup rather than repeating six steps -- is now the only one of the three that has not been measured.
  `[open: which of the two failures a slow-but-not-hung day should produce is still undecided, and the split is
  the answer this file's own arithmetic has given twice]`
- **A population of one is a label nobody has to write, and the census throws the gate's own line away.** The
  judgement list makes the label affordable in a way it was not last round: nineteen of the twenty-two populations
  hold a single gate, and what each counts is in the line the census reads and then discards. Keeping the line
  would put the label where it cannot rot -- in the gate's own output -- and the cost would be a tail printed
  beside every single-gate number, which is what the round after this one has to measure before choosing it.
  `[open: the two costs are still a sentence per gate and a log line per noun, and neither has been measured]`

## v3.129 — the ceiling was sized from a day, and the bounds inside it are not a day

### What the round began with

`O-095`, in its own words: `R12` refuses a ceiling under twice a job's slowest recorded day, and says nothing about
what happens between twice that day and the sum of the bounds inside the job -- `batteries` held **83** minutes of
bounds in a **34**-minute ceiling. The entry left the choice open between the job's unnamed death and a ceiling
inflated until it cannot fire, and noted that splitting the job was the third answer.

### The measurement the entry was missing

Each bound is at least twice the slowest reading of **its own** step, so the bounds are sized from each step's worst
day, taken from whichever day had it -- a composite, not a day. The largest day the bounds describe is therefore the
sum of those worst days, and it is not a hypothetical:

| job | bounds | ceiling | slowest day | the day the bounds describe |
| --- | --- | --- | --- | --- |
| `verify` | 57 min | 25 | 722 s | 28.5 min |
| `backend` | 48 | 48 | 910 s | 24.0 |
| `sensitivity` | 46 | 26 | 675 s | 23.0 |
| `sensitivity-shard` | 43 | 26 | 669 s | 21.5 |
| `batteries` | 83 | 34 | 1 012 s | **41.5** |
| `batteries-heavy` | 54 | 31 | 921 s | 27.0 |

`batteries`' own bounds describe a day **1.22 times** the ceiling that was supposed to hold them. A runner ten per
cent slower than the recording slows both heavy batteries and the four half-minute ones together, which is the day
in the last column -- so the death the entry called hypothetical is the day the rule's own arithmetic names.

### The two failures, and why the symmetry does not hold

v3.123 refused the sum in `ci.yml`'s own words: a ceiling sized to hold the bounds "would be a ceiling that cannot
fire either -- the same defect as a bound that cannot". It is not the same. A **bound** that cannot fire has nothing
behind it: the ceiling kills the job and the verdict names no step. A **ceiling** that cannot fire has every step's
bound behind it, and each names its step. The ceiling is the one number in a job with nothing behind it, so it is the
one number whose job is not to name anything: it is the backstop for a bound that did not fire. The price of the
wider number is wall clock, not a verdict, and the `batteries` comment in `ci.yml` says so.

### The repair

One comparison, two terms, a stated winner:

```
need = max(2 x the slowest day, the bounds inside the job + 2 x the seconds no step spends)
```

**The first term** is the bounds, because every step dies at its own. **The second** is the overhead no bound covers
-- the runner's setup, its teardown, the `Post` half of each action -- and it is measured rather than stated:
`measure-ci-baseline.mjs` writes each job's own wall clock beside its steps, a recording without it is refused, and
it is doubled like every bound because a runner twice as slow sets up twice as slowly. Measured this round: **3-8**
seconds per job. **`R5` is deleted, not kept beside it**: `bound + prefix` is at most the sum, so a ceiling that
holds the sum holds every deadline, and two sentences for one defect is how a reader learns to trust neither.

The six ceilings the bounds now hold: **25 -> 58**, **48 -> 49**, **26 -> 47**, **26 -> 44**, **34 -> 84**,
**31 -> 55**. `backend` is the one that was already the sum to within the overhead, which is the evidence that the
sum was always the number: its comment derived 48 by adding the floor sum, the install bound and the reader's bound,
and v3.129's arithmetic adds only the 5 seconds no step spends.

### The measurements this round rests on

| reading | value |
| --- | --- |
| bounds inside the workflow | **331** min against **50** min measured |
| ceilings held by the bounds / by a day | **6 of 8** / **2** (`artefacts`, `cold-tree`, both `R3`-excused) |
| the least room above a day | `backend` at **3.2x** its slowest day |
| the overhead | **5, 5, 5, 8, 8, 3, 6, 3** s across the eight jobs |
| `batteries` | **84** min of ceiling, **42** of them fourteen steps at the floor |
| new tests | **+3** directly on the two numbers, and **+4** on the ceiling block's cases |

### Falsifications

| the mutation | reds |
| --- | --- |
| the overhead dropped from `ceilingNeedOf` | 4 |
| the day term alone -- `R12` restored | 11 |
| a recording with no `total` accepted | 1 |
| `boundsSecondsOf` counting inherited bounds | 8 |

**Four mutations, 24 reds**, each a case that names the defect: the first is "the ceiling holds the bounds but not
the seconds behind them", the second is "the round did not happen", the third is "the margin is a guess", and the
fourth is "a job's ceiling is asked to hold itself".

### Readings

> Ledger for `v3.129`.

| item | value |
| --- | --- |
| CI | run `45033355331` on `d3e43f64`: **8 of 8 jobs success** -- the run the recording is taken from, whose workflow this round changes only in its ceilings |
| `core` test suite | **258 files, 6798 tests passed** (at v3.129) |
| `cli` test suite | **4 files, 187 tests passed** (at v3.129) |
| repo test suite | **262 files, 6985 tests passed** (at v3.129) |
| coverage | `core` **99.98 / 99.95 / 100 / 99.98**, `cli` **100 / 100 / 100 / 100** (at v3.129) |
| new tests | **6791 -> 6798, +7**: the two numbers a ceiling is made of, the sum, the exactly-sum boundary, the day term for an unbounded job, GitHub's six hours, the overhead, the missing `total` |
| the recording's shape | a job entry is `name`, `timeoutMinutes`, `total`, `steps` -- the fourth field is the job's own wall clock |
| falsifications | four mutations, **twenty-four** reds |
| open entries | **38 -> 38**: `O-095` closed by finding 619; `O-100` opened, because half of every ceiling is the floor |
| LLM calls | **0** |

### Left open

- **Half of every ceiling is the floor, not the work.** `batteries` needs 84 minutes and **42** of them are fourteen
  steps bounded at three minutes that measure seconds; `verify` needs 58 and 24 of them are the same floor six times
  plus six more. The floor is a rule about a cold package index and it was written per step, so a job that repeats
  six preparation steps pays it six times. `[open: whether the floor should be a property of the job rather than of
  the step -- one allowance for everything before the first real step -- and what would then refuse a cold day]`
- **A population of one is a label nobody has to write, and the census throws the gate's own line away.** Unchanged
  from v3.128 and still the next round's first question: nineteen of twenty-two populations hold a single gate and
  what each counts is in the line the census reads and discards.
  `[open: the label belongs either in the inventory, where it rots like every sentence, or in the gate's own line,
  which the census would have to keep -- and neither cost has been measured]`

## v3.130 — the sentence states a count, and nothing read the sentence

`O-098` asked where the label for a population of one belongs, and named two costs: a sentence per gate in the
inventory, "where it rots like every sentence", or the gate's own line, which the census would have to keep. Neither
cost is the round.

Reading the nine relations for numerals is. `comment(s)`'s sentence said the smaller corpus was **4.7 per cent** of
the larger; this run's two gates print **1,252** and **25,855**, and their ratio is **4.842**. For 4.7 to hold, the
numerator would have to be 1,215 or the denominator 26,638. So the sentence was a copy of a pair of counts taken in
an earlier round, one of the pair moved, and the copy did not move with it -- and nothing noticed, because the census
reads the gates and never the sentences it carries.

That is the module's own argument used against it. `scripts/unit-nouns.mjs` keeps the counts out of the inventory on
one ground -- **they move every round** -- and a relation that states a count is a count in the record with none of
that argument's protection. Five of the nine sentences state a figure, eight figures in all, and one of the eight is
wrong. The round moved the same count again while it was being written (25,828 comments when the entry was read,
25,855 when the finding was), which is the argument rather than an accident.

### The repair

Two readers and a fourth refusal. `figuresOf` reads the numerals a sentence states; `unprintedFiguresOf` compares
each with the counts the census holds for that noun; the census refuses the ones that match nothing. It sits beside
the third refusal -- the population that has stopped agreeing -- and it goes through **both** doors for the same
reason: `--write` copies the sentences forward verbatim, so the one door that is supposed to leave the record
truthful would otherwise rewrite a false sentence into it.

The refusal names the figure and the counts: `comment(s) states 4.7 and the counts under it are 25,855 and 1,252`.
A message that said "a relation states a number" would send a person looking for which.

What the sentence says now is the relation and not the ratio: "with no member in common and the smaller a small
fraction of the larger, which the two counts above state and this sentence no longer copies". The four sentences that
quote a count keep it -- `file(s)`'s three walks, `row(s)`'s two eights, `run(s)`'s zero, `volume(s)`'s two
directories -- and their quotes are claims the run checks from now on.

A numeral **glued** to a letter, a hyphen, a dot or an underscore is a name rather than a count: `L4`,
`check-l4-status`, `v3.129`. The rule is lexical rather than a list of exemptions, because a list would be a list to
keep equal to the corpus. Removing the glue test reddens the shipped tree on `row(s) states 4`, which is the `L4` in
the only sentence that says what that gate reads.

### The label, measured

| what was counted | value |
| --- | --- |
| populations declared over the nine shared nouns | **22** |
| of those, holding a single gate | **19** |
| uses behind those nineteen | **20** -- one gate prints `row(s)` twice and one prints `run(s)` twice |
| words after the noun | **empty in 8 of 20**: the corpus writes `474 file(s), 21676 comment(s)`, so the count ends the clause |
| words that are half a parenthesis | **2**, both `comment(s)`: `(21676 line`, `(1064 line` |
| the gates' own lines, whole | **6,047** characters over the twenty uses |
| relations that name every population their noun declares, in the printed order | **8 of 9** |

Neither cost the entry named holds. A label lifted out of a gate's line is a fragment in two uses of twenty and
nothing at all in eight, and a fragment is worse than no label because it looks like a claim. A sentence per gate
would be nineteen sentences restating what one sentence already says. So the label stays in the relation, and the
rule this round adds is the same rule from the other side: **the sentence says which set, the gates say how many, and
neither copies the other.** That is why `comment(s)`'s sentence lost its ratio instead of having it corrected.

### What the round did not change

The nineteen populations of one stay: they are not claims (a group of one has no equality in it) but the record of a
gate having been placed, and deleting them would make `row(s)`'s four gates indistinguishable from four gates nobody
has considered. `run(s)`'s relation still lumps its three language gates into one clause while the partition holds
three populations -- it claims no equality between them, so nothing is unchecked. And the volume's own header, which
had said `579–599` and `v3.120` for nine rounds of appends while findings 600 to 619 were written under it, now says
`579–620` and `v3.130`: no gate reads a volume's description of itself, and the round found it while opening the
file to append to.

### The vocabulary moved and the sentence stayed

This round widened no ceiling, so `check-ci-budget` stopped printing `N budget(s) widened since the reading` and the
census's vocabulary fell from **54** nouns in **70** gate/noun pairs to **53** in **69**. Under the key `v3.128`
removed, that would have discarded `budget(s)`'s judgement with the noun; it survives, with the round's only
sentence about it untouched, and the round that widens a ceiling again will find it there.

The recording was retaken at run `45043602227` for a related reason -- a volume may not name a run newer than the
ledger's -- and it measures **57** minutes of steps against the previous reading's **50**, with no workflow, ceiling
or bound changed. The difference is the day.

### Falsifications

| the mutation | reds |
| --- | --- |
| `figuresOf` blind -- no numeral read at all | 4 |
| the glue test removed, so `L4` and `check-l4-status` count | 2 |
| the run's fourth refusal dropped | 1 |
| `--write`'s fourth refusal dropped | 1 |
| only the first unprinted figure reported | 1 |

**Five mutations, 9 reds**, and the second reddens the shipped tree as well as a case: the rule is about this
corpus rather than about a fixture.

### Readings

> Ledger for `v3.130`.

| item | value |
| --- | --- |
| CI | run `45043602227` on `1e2af30`: **8 of 8 jobs success** -- the run `v3.129` ended on, and the recording is retaken at it because a volume may not name a run newer than the ledger's |
| the recording | 8 job(s), 83 step(s), **57** min measured against the previous reading's **50**; no workflow, no ceiling and no bound moved, so the difference is the day rather than the tree |
| `core` test suite | **258 files, 6804 tests passed** (at v3.130) |
| `cli` test suite | **4 files, 187 tests passed** (at v3.130) |
| repo test suite | **262 files, 6991 tests passed** (at v3.130) |
| coverage | `core` **99.98 / 99.95 / 100 / 99.98**, `cli` **100 / 100 / 100 / 100** -- unchanged, because the round adds no line under `packages/core/src` |
| new tests | **6798 -> 6804, +6**: the figures a sentence states, a name's digits that are not figures, a sentence whose figures are counts, the figure no gate printed, every unprinted figure reported, a noun no gate printed |
| the record's shape | a relation may state a figure only when a gate printed it under that noun |
| falsifications | five mutations, **nine** reds |
| open entries | **38 -> 38**: `O-098` closed by finding 620; `O-100` carried; `O-101` opened, because the live list states counts too |
| LLM calls | **0** |

### Left open

- **Half of every ceiling is the floor, not the work.** Unchanged from v3.129: `batteries` needs 84 minutes and **42**
  of them are fourteen steps bounded at three minutes that measure seconds, and `verify` needs 58 with 24 of them the
  same floor six times. The floor is a rule about a cold package index written per step, so a job that repeats six
  preparation steps pays it six times. `[open: whether the floor should be a property of the job rather than of the
  step -- one allowance for everything before the first real step -- and what would then refuse a cold day]`
- **The live list states counts too, and this round left its own list unread.** `O-019` says `docs/acceptance.md`
  "is 96 KB and grows by clause per round", and the file is **165,067** bytes -- 161.2 KB. The entry that argues the
  file has grown too large is quoting a measurement from the round that wrote it, which is finding 620 in the one
  document the census does not reach. `[open: whether `check-open-list` can hold the numbers its entries state -- a
  file size is one a gate can measure, "284 lines" is one it can count, and the rest are as unbacked as 4.7 per cent
  was; the two costs are a reader per shape of figure and a rule that a limit states none]`

## v3.131 — the live list states a size, and nothing read it

`O-101` was opened by v3.130 in the same round its census learned to read a sentence, and it named its own
neighbourhood: the live list states counts too, and nothing reads them. It offered two costs -- "a reader per
shape of figure and a rule that a limit states none" -- and chose neither.

Neither is the round. The size is.

`O-019` argues that `docs/acceptance.md` has grown too large to keep growing, and it carried the argument in its
headline: `96 KB`. The file was **165,067 bytes** when the entry was read. So the entry that argues a document
is too big was the entry quoting a size **1.68 times** too small -- and the evidence it leans on had drifted
further, because thirty-four rounds have appended a clause each: "the per-round clauses are 139 lines and
11,139 bytes of history" is **897 lines** and **77,180 bytes**.

### The measurement

Every figure in `## Open` carrying a unit a commit can take again, beside the file each one names:

| where | the figure | what the tree has | |
| --- | --- | --- | --- |
| the `## Open` lead-in | `98,927 bytes` **by** v3.110 | -- | dated with a preposition the reader cannot read |
| `O-019` | `96 KB` | 165,067 bytes (161.2 KB) | **1.68x** too small |
| `O-019` | `284 lines` (L3) | L3 is **330** | 46 lines short |
| `O-019` | `139 lines`, `11,139 bytes` | **897 lines**, **77,180 bytes** | **6.5x** and **6.9x** |
| `O-021` | `962,086 bytes` (a paper) | not in this tree; pinned by sha256 | unmeasurable here |
| `O-101` | `165,067 bytes` | 165,067 | true, and quotes `O-019`'s 96 KB |

**Nine figures with a takeable unit, seven of them read** -- the other two sit inside a quotation -- **and six of
the seven are wrong.** The one that is right is the entry that reports the defect.

### The rule: say when, or be this tree's

    `161.2 KB at v3.131`   a record: the tree it was measured on is named, and a record does not age
    `165,067 bytes`        a claim about now, and accepted only while it is true
    `96 KB`                refused, and the refusal names the size the file has

Four units, and they are the four **a commit can take again**: `bytes`, `KB`, `MB`, `lines`. `439 s` and `84
minutes` measure a run that is over; no gate can take them, and a rule about them could be satisfied only by
guessing. That boundary is why `O-011`'s `439 s` and `O-090`'s `2 873 ms` pass while `O-019`'s `96 KB` does
not, and it is written in the module rather than left to be discovered.

**Why a date and not the current size.** The file grows in most rounds, so a rule demanding this commit's size
would be red on the round after every round that wrote one -- and a rule that is always red is one every reader
learns to skip, which is the argument the volume budget already makes for judging only the volume that can
still grow.

**Two refusals, because there are two repairs.** A sentence that names a file of this tree is told the size the
file has (`that file is 167,552 bytes at this commit (163.6 KB)`); a sentence that names nothing is told to name
the round (`868 lines at vX.YY`). One message saying "an entry states a size" would send a person looking for
which.

### Three things a pattern does not say

**A quotation is not the list's claim.** `O-101` could not report `O-019`'s 96 KB without quoting it, and a
reader that refused the quotation would refuse the report -- the one repair a guard may never demand. The
corpus has the precedent: `v2.26` quotes headings that are not headings, and the volume reader tracks fences
for it.

**A sentence ends at a full stop inside a bold mark.** `O-019` writes `round.** L3 is 284 lines`, so a boundary
pattern of a full stop and a space reads the two sentences as one -- which paired L3's length with the whole
document's, a refusal whose repair would have been wrong. Measured rather than assumed: drop the mark-up from
the boundary and the shipped tree is refused with `284 lines ... and that file is 2,051 lines`.

**The lead-in is the list's voice too.** The paragraph above the bullets held `65,544 of 98,927 bytes by
v3.110`. A rule scoped to bullets would have left the text above them unread, which is finding 162's shape one
level in. It is read now, and its `by` became `at`.

### What the round changed

`O-019` was re-measured rather than corrected in one figure: the headline says what grows instead of how big it
is, L3's length and the per-round clauses carry the round that took them, and the size that had aged is gone
rather than updated, because the argument does not need it. `O-021` lost `962,086 bytes`: the digest is the pin
-- "`openrca-2.0`, sha256 recorded" -- and the byte count was doing no work in a sentence about two other
targets having no pin at all.

**The rule's first counter-example was in the module.** The header of the reader said `docs/acceptance.md` was
`2,021 lines`: no round, the exact shape the round exists to refuse, sitting in the code that refuses it.
Nothing reads a source header -- the guard passes its own text -- so this one was caught only because the round
looked, and the header now says `2,051 lines at v3.131`.

**And the record and the entry disagreed about the number the rule is about.** Finding 621's table said the
per-round clauses were **897 lines** and **77,169 bytes**; the entry, the closure and this record say 77,180.
Measured again, the tail from `### The open list (v3.62)` to the end of the file is 897 lines and **77,180
bytes** -- 77,179 with the final newline dropped, which is not what any of the three statements means. The
finding was 11 bytes out, in the round whose subject is figures that nothing reads, and it is corrected in place
rather than annotated: a record that disagrees with the entry it is the authority for is the one disagreement
neither side can settle.

**And the index published a count of a tree that did not exist yet.** The repository table said **672** tracked
files in the commit that carried three new ones, so the commit a reader checks out holds **675**: `--write` ran
before `git add`, which is the case the guard's own header records having happened once already (v3.83, whose
`Tracked files` said 638 where the commit held 639). The gate was green in the round and red on the next
checkout of its own commit -- the one red this campaign treats as a root cause rather than a flake,
on content that had not been touched since.

### Falsifications

| the mutation | reds |
| --- | --- |
| every figure counts as dated | 8 |
| no figure is ever dated | 4 |
| quotations are read | 1 |
| a sentence ends only at a full stop and a space | 1 |
| exact match, no rounding | 2 |
| the nearest name pairs regardless of sentence | 1 |
| the lead-in is not read | 1 |
| every section kind is read, records and closures included | 1 |
| an empty text is one line long | 1 |
| a wrapped figure is quoted wrapped | 1 |
| a length compared with the file's bytes | 1 |

**Eleven mutations, 22 reds**, and the fourth reddens the shipped tree as well as a case.

### Readings

> Ledger for `v3.131`.

| item | value |
| --- | --- |
| CI | the run this round's commit starts, and the last one it inherited: `45054272460` on `b741a09` was **8 of 8 jobs success**, and this round moves no workflow, no ceiling and no bound |
| `core` test suite | **259 files, 6845 tests passed** (as of this commit) |
| `cli` test suite | **4 files, 187 tests passed** (as of this commit) |
| repo test suite | **263 files, 7032 tests passed** (as of this commit) |
| coverage | `core` **99.98 / 99.95 / 100 / 99.98**, `cli` **100 / 100 / 100 / 100** -- unchanged, because the round adds no line under `packages/core/src` |
| new tests | **6,804 -> 6,835, +31**: the reader's units, names, dates and quotations; the window and the rounding; which document a figure is the size of; the two refusals; and six gate-level cases |
| the live list's sizes | **5 figure(s): 5 name the round that took them** -- the rule reads nothing undated because nothing in the list is undated |
| falsifications | eleven mutations, **22** reds |
| open entries | **38 -> 37**: `O-101` closed by finding 621; `O-100` and `O-019` carried |
| LLM calls | **0** |

### Left open

- **Half of every ceiling is the floor, not the work.** Unchanged from v3.129: `batteries` needs 84 minutes and
  **42** of them are fourteen steps bounded at three minutes that measure seconds, and `verify` needs 58 with
  **24** of them the same floor six times. `[open: whether the floor should be a property of the job rather
  than of the step -- one allowance for everything before the first real step -- and what would then refuse a
  cold day]`
- **`docs/acceptance.md` grows by a clause per round**, and the split axis is still undecided: the per-round
  clauses are **897 lines at v3.131** of a document of **2,051 lines at v3.131**, while L0, L1, L2 and L5 are
  14, 7, 7 and 6 -- so the layer is the wrong axis and moving the clauses needs the measurement of how many
  sections match that shape before the index relation is re-checked. `[open: the measurement the move needs,
  which is a count of sections by shape -- the axis is "current rule" against "how it was reached"]`

## v3.132 — the floor is the job's, and a prefix is what every job shares

`O-100` has been open since v3.129 with a question rather than a defect: *"whether the floor should
be a property of the job rather than of the step -- one allowance for everything before the first
real step -- and what would then refuse a cold day"*. Both of the numbers it stated had aged, and
the shape had not.

### The measurement

Every step, its bound, and what it spent in run `45054272460`:

| job | steps | at the floor | their bounds | what they spent | ceiling |
| --- | --- | --- | --- | --- | --- |
| `verify` | 12 | 9 | 27 min | 25 s | 58 |
| `backend` | 7 | 6 | 18 min | 18 s | 49 |
| `sensitivity` | 8 | 6 | 18 min | 32 s | 47 |
| `sensitivity-shard` | 7 | 5 | 15 min | 8 s | 44 |
| `batteries` | 20 | 16 | **48** min | **165** s | 84 |
| `batteries-heavy` | 8 | 5 | 15 min | 17 s | 55 |

**47 of 62 bounds were the number three** and together they were **141 of the 331 minutes** the
bounds added up to, against **52 minutes** measured. On `batteries` the floor was more than half the
ceiling, not half of it.

### The rule

**The prefix is the leading run of steps every job of the workflow shares -- name and command both
-- and its allowance is the floor spent once.**

    Check out | Set up Node.js | Set up pnpm | Install dependencies     the prefix, four steps
    one allowance of 3 minutes, per job                                  what a cold runner costs

A prefix step declares no `timeout-minutes` of its own; one that does is refused, because it is the
same three minutes stated again. A work step is bounded by **twice its own day**. `R13`'s `bounds`
term is the step bounds **plus** the allowance. A job promise names only the steps that carry one.

After: **38** steps bound themselves (was 62), **32** are charged to their job's allowance, **13**
inherit their ceiling, **0** are reached by nothing; **216** minutes of bound plus **24** of
allowance where there were 331; ceilings of **275** where they added up to **372**.

### Why the floor was on the wrong object

A bound buys **attribution**, not slack: a step dies at its own bound and the verdict names it,
whichever number the bound is. The three minutes bought tolerance, and tolerance is spent where the
unpredictable thing is, which is at the start, once. A battery that measures 54 s and is bounded at
two minutes dies at two minutes naming itself; bounded at three it dies a minute later naming
itself. The one case the floor was for -- a step no run has measured -- still has it.

**What refuses a cold day**: the allowance (once per job), `R12`'s twice-the-day term, and `R13`'s
sum. A work step that is genuinely cache-sensitive argues a larger bound, which the gate permits and
`R10` checks against the slowest reading of the same command anywhere.

### Two rules the round's own numbers moved

**`R10` refused the round's first number.** The round-trip record battery was given 2 minutes from
its 54 s recording; the same command took **70 s** in run `44576264388`, and 120 is under twice 140.
The bound went back to 3 -- the only one left at the floor in the whole workflow.

**`R6`'s refusal of every narrower ceiling is deleted.** It demanded a re-measurement under the
tighter ceiling, and the number it was standing in for is already in the file: twice the slowest day
this repository has met plus twice the overhead, which `R12` asks with its own sentence. Six
ceilings narrowed that way -- 58->39, 49->36, 47->34, 44->33, 84->54, 55->44 -- each printed beside
every widening, and `artefacts` 15 with `cold-tree` 20 kept, because the day their recording holds
is the warm one and the job's subject is a cold tree.

### What the round did not change

The floor's number (three minutes, once per job). A declared step's floor. Any bound above twice its
day -- `Install a backend` keeps 30 minutes against 19 s, and `R10` still refuses a bound under twice
the slowest reading of the same command anywhere. And the two cold-tree jobs' ceilings.

### The run that spent the ceilings

The six ceilings this round wrote had never been spent when it wrote them. Run `45104479651` is the first
run that had to live under them, and it did: **8 of 8 jobs success**, **951 s** wall clock, the slowest job
`injection batteries, one step each` at **951 s** against **54** minutes -- the ceiling that was **84** when
the round started, and the job whose 48 minutes of floor this round deleted.

Recorded as the baseline, the same run is the first reading of the tree the bounds describe: **58** minutes
measured where the recording the bounds were sized from measured 52, and `R13` still holds -- 6 of the 8
ceilings hold the bounds inside them, 2 hold twice a day, the least room above a day is `backend` at 36
minutes and **2.4x** its slowest day of 910 s. The round moved a 331-minute sum and a 372-minute total down
to 240 and 275, and the day that had to fit under them came in **6** minutes heavier than the day it was
sized from.

### The round's own second error

`--write-doc` takes a snapshot, and a snapshot describes the suite as it stands at that moment. This round
took it after eight of its nine new cases existed: the golden recorded **6,843** core tests while the tree
ended with **6,844**, the ninth being the case that kills the mutation which survived the first run of the
table above. The repository table then derived 6,843 from the golden, and the sixth step of the gate refused
the tree -- a golden that describes a suite one case smaller than the one it is shipped with.

It was caught before the push, by `verify:local`, at step **6 of 35** -- the first time this campaign has
found one of its own numbers locally rather than in CI, and the reason it could: that step re-reads the
suite from the run it just watched, while the write had read the suite as it was ten minutes earlier. The
shape is v3.131's one act earlier in the round: there `--write` ran before `git add`, so the table described
a tree that did not exist yet; here it ran before the last case did. Both are a snapshot taken mid-round,
and nothing in either file says when the round ended.

**The first draft of this paragraph was wrong, and in the direction of blaming the tool.** It said
`--write-doc` reads the report the last run left in the cache. It does not: without `--from` it spawns the
three suites and counts what it finds (`measure()`), which is exactly why the number it wrote was honest. The
correction is in this section rather than in a finding, because there is no defect in the file -- there is a
rule about when to take the snapshot, and the gate is what enforces it.

### Falsifications

| the mutation | reds |
| --- | --- |
| the prefix is always empty | 4 |
| a prefix is matched by name and not by command | 7 |
| a workflow of one job has a prefix too | 33 |
| the allowance grows with the prefix | 3 |
| a prefix step may declare its own bound | 2 |
| the ceiling does not hold the allowance | 1 |
| a job promise names the prefix steps too | 4 |
| the summary hides the allowance | 1 |
| the narrower-ceiling refusal restored | 3 |

**Nine mutations, 58 reds.** The sixth survived the first run of this table; the case that kills it
is the only one in the suite that puts a ceiling eighteen seconds short of the allowance.

### Readings

> Ledger for `v3.132`.

| what | value |
| --- | --- |
| CI | run `45104479651` on `b7924f5` was **8 of 8 jobs success**, **951 s** wall clock (03:11:24 -> 03:27:15), slowest job `injection batteries, one step each` at **951 s** against the **54**-minute ceiling this round gave it -- the first run to spend the ceilings it wrote; the day it was sized from is `45054272460` on `b741a09`, also 8 of 8 |
| `pnpm run docs:check` | **22 steps, exit 0** |
| tests | core **259 files / 6844** (+9); cli 4 / 187; repo **263 / 7031** |
| coverage | core **99.98 / 99.95 / 100 / 99.98**, cli **100 / 100 / 100 / 100** -- no line under `packages/core/src` moved |
| the workflow | **83** steps: **38** own bounds, **32** in a 4-step prefix, **13** job-bounded, **0** none |
| the bounds | **216** min of step bounds + **24** of allowance, ceilings **275** (was 331 / 372) |
| the recording | moved to run `45104479651`: **58** min measured (was 52), bounds total **240** min, 6 ceilings hold their bounds and 2 hold twice a day -- `R13` holds under the run the ceilings were spent on |
| falsifications | **9 mutations / 58 reds** |
| open items | **37 -> 38**: `O-100` closed by finding 622; `O-102` and `O-103` opened |
| LLM calls | **0** |

### Left open

- `docs/acceptance.md` grows by a clause per round: the per-round clauses are **932 lines at v3.132**
  of a **2,086-line** document, and the layer split is still the wrong axis.
  `[open: the axis is "current rule" against "how it was reached", and the number the round needs is
  how many sections have that shape]`
- The allowance is three minutes, and no recording says whether that is right: every ceiling holds
  one, and the runs this repository has are warm. `[open: whether an allowance for a cold runner can
  be measured at all, or whether it is the one number in the file that has to be argued]`
- A snapshot taken mid-round is indistinguishable from one taken at the end: the golden recorded 6,843
  core tests against a tree that ended with 6,844, because the write ran before the ninth case existed.
  `[open: whether a write can know that it is the round's last act, rather than relying on a full local
  run to notice]`

## v3.133 — a distance of zero is a number, and the census reads numbers

The round that recorded run `45104479651` also caught the ledger up, and the sentence `check-ci-budget`
prints about the ledger changed shape when it did. Nothing in the tree had changed; one gate stopped
printing a noun, and the census refused the tree for it inside the same push.

### The measurement

The state before and after, from the same recording and the same log:

    the ledger's newest run is 45054272460 (the recording), 1 round(s) before `v3.132`      v3.132
    the ledger's newest run is 45104479651 (the recording), in the newest round             v3.133

`round(s)` is a population in `golden-master/unit-nouns.json`, recorded at v3.132 on the strength of
the left-hand sentence. The right-hand sentence has the same content and no number, so:

```
check-unit-nouns: FAILED — 1 noun(s) are printed by more than one gate and no record says which of
them read one population: round(s) (check-ci-budget is in a population and does not print this noun)
```

The two states are one recording apart, which is the ordinary life of this gate: every round that
records its own run moves it from the first state to the second, and the recording is what a round
does at its end.

### The rule

**A count that can be zero prints zero, in every state a green run can reach.**

`0 round(s) before \`v3.132\`` says what `in the newest round` said, and says it in the shape the census
reads. The three branches that still print nothing -- no sections, no round headings, a row whose home
is not a round -- are states in which no ledger row exists to place, and `R7` refuses those before this
sentence is written.

### Why the better sentence lost

It read better. A sentence about a distance reads as prose when the distance is zero, and this one
survived a round for that reason alone -- the round that added the noun to the census read it, liked
it, and recorded the gate under a phrase that would be gone by the next recording. Every other count
in this campaign has taken the other trade without hesitating: a fact a reader can use **and** a gate
can count beats a fact a reader can use. This is the first time the two came apart, and the cost was
one red gate on a tree nobody had touched.

### What finding 618 already decided

Finding 618 is this with the whole judgement as its subject: the census keyed a noun by the set of
gates printing it, the set moved whenever a gate went quiet, and six readers ended up comparing the
record with itself. Its repair keyed by noun, so the set is stable. Here the set did not move at all --
`check-ci-budget` was in the population before and after -- and what moved was whether one member
printed the noun. A population can hold a gate to a number only while the gate prints the number,
which is the same rule at a finer grain.

### Falsifications

| the mutation | reds |
| --- | --- |
| the prose branch restored | 3 |
| the distance always zero | 1 |
| the noun without its number | 2 |
| the round named is the one the row sits in, always | 1 |

**Four mutations, 7 reds.** The first reddens the two cases that read the sentence and the census case
that runs the real gate over the shipped tree -- the chain that made this a rule rather than a
preference. The fourth keeps both numbers and names the wrong round, which no assertion about counts
alone would see.

### The round's own errors

Three, and none of them was found by a round looking at its own work.

**The audit volume's header still said `579–621` and `v3.131`** two rounds after the last append. No
gate reads it -- the index is what `check-audit-volumes` counts -- and the previous round had already
corrected the same header once, which is what a number with no reader looks like from the inside:
`579–623` and `v3.133` now, and it is still the only line in the file a person has to remember.

**A snapshot taken mid-round describes a suite that is not the one being shipped.** Covered in v3.132's
record, because that is the round it happened in: the golden said 6,843 core tests where the tree holds
6,844, the repository table derived the stale number from it, and `verify:local` refused the tree at step
6 of 35 -- before the push, the first time this campaign has found one of its own numbers locally rather
than in CI. The first draft of that paragraph blamed a cache read the module does not do; `measure()`
spawns the suites, and the correction is in v3.132's record. It is `O-103`.

**And a suite that had never stated a budget crossed the gate's floor.** `measure-doc-counts-write-doc.test.ts`
took **1,035** ms for its slowest case on the second local run -- a file this round never touched -- so
`check-test-budgets` refused it. That is finding 578's shape arriving on its own schedule: a case judged
by the runner's 5,000 ms default is a verdict nobody chose. The file states **4,000** ms now, 3.9x its
reading and below the default, and the closest file in the suite sits at 26% of its budget.

### Readings

> Ledger for `v3.133`.

| what | value |
| --- | --- |
| CI | run `45104479651` on `b7924f5` was **8 of 8 jobs success**, **951 s** wall clock -- the recording this round inherited, and the first run to spend v3.132's ceilings |
| `pnpm run docs:check` | **22 steps, exit 0** |
| tests | core **259 files / 6845** (+1); cli 4 / 187; repo **263 / 7032** |
| coverage | core **99.98 / 99.95 / 100 / 99.98**, cli **100 / 100 / 100 / 100** -- no line under `packages/core/src` moved |
| the sentence | `round(s)` printed in both ledger states, `0` included |
| `docs/acceptance.md` | **2,114 lines / 172,716 bytes at v3.133**; the per-round clauses are **960 lines at v3.133**, and **35 of 37** of them hold both a rule and the way it was reached |
| falsifications | **4 mutations / 7 reds** |
| open items | **38 -> 39**: nothing closed; `O-104` opened on the distance the census reads |
| LLM calls | **0** |

### Left open

- A snapshot taken mid-round is indistinguishable from one taken at the end, and no file says when the
  round ended. `[open: whether a write can know that it is the round's last act, rather than relying on
  a full local run to notice]`
- `round(s)` has three readers and only two of them count a population. `[open: whether a distance
  belongs in the census at all, and which sentence would decide it]`
