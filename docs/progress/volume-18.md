## v3.112 · an entry's name, and the copy that both refusals walk past

**The live list was carrying an entry that had already written down why it could not be closed by argument.**

> **An entry has no identity, so keeping the two lists apart is a rule about text.** The split's tiling --
> forty-eight closures plus twenty-eight open entries are the seventy-six the list held -- was checked once, by
> hashing each entry before and after the move, and that check is a measurement rather than a guard. ... What
> nothing catches is the accident that matters -- a closure pasted into the record while its live entry is
> edited into a different claim.

The entry asked for an id per entry, and one clause of it was wrong. It said the copy rule "could not be
reached", because a copy left in the live list is struck and the live-strike refusal has already refused that.
The clause is true of one shape and false of the shape a forgotten deletion produces: **unstruck in the live
list, struck in the record**. Run against a document of exactly that shape, the guard as it stood at `176ec7b`
printed `OK (2 entry(ies) across 2 section(s) ... 1 open with a reason, 1 closed by a finding)`. Measured, not
argued -- the script from that commit was checked out and run over the fixture. So the rule v3.111 wrote and
deleted was reachable all along; what it lacked was a comparison the text cannot make, because the two copies
differ by the strike by construction.

**The identity.** Every entry of the two lists now carries a token: `O-001`, three digits, right after the
bullet and outside every mark the headline carries -- `- O-001 · **The claim.**`. One space shared by both
files, and **dense**: the two files hold 1..N between them with nothing missing, recomputed on every run. That
buys three refusals, and the third is the one that stops a round inventing a number:

| the defect | what the guard says |
| --- | --- |
| a copy | `the id O-079 names two entries -- one here and one at docs/progress.md` |
| a deletion | `the two lists hold 78 entr(ies) and their ids run to 79, so the ids skip O-010` |
| an invented id | the same hole, from the other side: a number taken twice or a number skipped |

And the arithmetic replaces a convention: **a new entry takes one more than the highest id the two lists
hold**, because any other number leaves a hole. A round no longer has to remember the rule; it has to satisfy
the set.

**Two accidents, performed on the shipped tree rather than imagined.** Closing an entry and forgetting to
delete it -- the record copy struck, the live copy left -- produced two diagnostics: the stamp's count, which
is the one the old guard had, and `the id O-079 names two entries`, which is the one it could not have. Then
the deletion: `O-010` removed from the live list and nowhere else, and the stamp edited to **26** so that the
count agreed with the section. The old guard would have been green -- every other rule passed -- and the
only line that said anything was `the ids skip O-010`. That is the accident the tiling equation was measured
for and could not guard, and it is a guard now.

**Seven falsifications, sixteen reds.** Removing the no-id refusal: **1**. The duplicate-id refusal: **1** --
the fixture is the copy, and nothing else in the suite refuses it. The gap message while leaving the summary
line printing `1..N`: **1**, which is the shape of a summary that can be false. The width refusal: **1**. The
zero refusal: **1**, and it is the same defect one number further out -- `O-000` passes the width rule, every
number from 1 to the maximum is present beside it, and the summary prints `1..N` over a set that is not
`1..N`. The whole id block, check and summary together: **3**, the shipped lists among them. Asking the
**records** for ids as well: **8**, because the 558 entries of the frozen records have none and a rule that
wanted them would demand a repair of every round ever written.

**What the id cannot say, and why that is written down rather than implied.** It cannot say the text is the
same entry: a closure can arrive carrying the id of an entry whose words were rewritten, and no reading of two
files tells that from a closure -- the entry it replaced is gone. Nor can it see a rename. What it makes
impossible is the **silent** version of either, which is the version that loses work: the id is what a reader
greps, and a grep that finds it in the record leads to the sentence that closed it, in the round's own words.
The ceiling is 999 and the width is fixed, because `O-100` must not match the front of `O-1000`; an id that is
not three digits is refused with its own diagnostic rather than read as no id at all.

**The head this round started from was red, in a step no local run performs.** `63707bfd3` -- v3.111's
documentation commit -- failed CI at `Every test's cost against the budget it declares`:
`category-derivation.test.ts` measured **1 044 ms** on the runner and the file states no budget, so vitest's
inherited `5 000 ms` default was deciding a verdict nobody had written for it. Locally the whole file runs in
**493 ms**, which is why every local run was green; the suite had also just grown by the spawn-driven tests this round
added, which is the contention that put a corpus loop over the floor. The repair is a declaration, as the gate's own
message asks: **`R_BUDGET_MS = 3_000`** on suite `R`, 2.9x the runner's reading and the smallest round number
above the gate's 2x rule (finding 571). The count of files that state a budget moved **34 -> 35**.

**The closure is two edits, and the number is counted.** `O-027` left the live list in this round -- the entry
above, closed by finding 570 -- and its id went with it, which is why the live list holds `O-001`..`O-026` and
`O-028`, and why that hole is not a gap: `O-027` is in the record, struck, saying what closed it. The seventy-
nine entries were stamped by backfill in this round, the live list first and then the record in its own order,
and the two files' numbers were assigned together rather than argued about afterwards.

### Readings

> Ledger for `v3.112`.

| item | value |
| --- | --- |
| `core` test suite | **257 files, 6646 tests passed** (at v3.112) |
| `cli` test suite | **4 files, 187 tests passed** (at v3.112) |
| repo test suite | **261 files, 6833 tests passed** (at v3.112) |
| coverage | `core` **99.98 / 99.95 / 100 / 99.98**, `cli` **100 / 100 / 100 / 100** -- unchanged: nothing under `src/` moved |
| new tests | **6,637 -> 6,646, +9**: seven refusals (no id, a copy, a gap, a four-digit id, a one-digit id, a zero id, and the record's scope) and two readings (the space across two files, and the shipped lists as 1..79) |
| the lists | `## Open` **28 -> 27**, `## Closed` **51 -> 52**, one space of **79** ids with none missing |
| the index | **66,779 -> 66,861** bytes; the record **70,196 -> 73,447** over 52 entries |
| the volumes | **17**, and this round is the second in `volume-17.md` |
| the falsifications | seven edits, **16** reds; two accidents performed on the shipped tree |
| the budgets | **34 -> 35** files state one: `category-derivation.test.ts` at **1 044 ms** on the runner, declared at **3 000 ms** |
| gate sites / scripts / throws | **144** / **67 of 98** / **99** -- no new exit and no new script |
| the live list | **28 -> 27**: one closed, none opened |
| LLM calls | **0** |

### Left open

- **The row arm's cross-file population has never run on the shipped tree.** A fixture carries both sections
  in one file, so the two-file population is exercised only by a document that is not the shipped one.
  `[open: the first record that names a residual its own round closed exercises it, and until then the population is two files on fixtures only]`
- **The record is not split by size.** `docs/progress/closed.md` is **73,447** bytes after three rounds of
  closures, and nothing bounds it: it is a record, and records grow.
  `[open: the volume budget's argument -- a document a reader cannot diff -- applies to it at some size, and the size has not been measured]`

## v3.113 · the record became a set of files, and the file nobody read took ten entries with it

The last entry of the live list said why it could not be closed: the record had **no bound**, and the number
that would bound it had never been measured.

> **The record is not split by size.** `docs/progress/closed.md` is **69,785** bytes after two rounds of
> closures, and nothing bounds it: it is a record, and records grow. ... that size has not been measured.

This round measured it first, and the first thing the measurement produced was not a threshold. It was a hole.

### 1. The size, measured before anything was decided

| reading | value |
| --- | --- |
| the record | **52** closures in **73,447** bytes |
| per entry | **1,412** bytes |
| the v3.112 closure | **+3,251** bytes |
| the volume budget | **200,000** bytes |
| therefore | **39** closures of headroom |

So "how large is too large" has an answer: **the volume's own number**, because the two things are the same
thing -- a document a round reads -- and one limit a reader has to hold is better than two, for the reason the
index/volume ratio was argued for last round. It is judged on the **last** file only: the files above are frozen
records, and a budget applied to a record is a budget applied to something nobody may edit.

The threshold is not what this round is about. What it is about is that a document a reader cannot diff was read
by the guard as **one path**.

### 2. Ten entries left the corpus, and every verdict stayed green

Moving the last ten entries into `docs/progress/closed-02.md` -- the name a split would use -- and running the
guard:

```
check-open-list: OK (590 entry(ies) ... : 560 open with a reason, 30 closed by a finding)
check-open-list: OK (42 entry(ies) across 1 section(s) of docs/progress/closed.md: 0 open ..., 42 closed ...)
check-open-list: 69 entr(ies) with ids 1..69, and none is missing
exit 0
```

**Ten entries were gone, and "none is missing" was the guard's own sentence.** That is finding 570's edge: the
id space is dense **within the population it is given**, so no property of the numbers can notice a file that was
never opened. The identity rule means nothing until the population is complete -- which is finding 568's lesson
(an arm whose population was what it had read rather than what the list holds) with a set in place of a row.

### 3. The record is a discovered set

`closed.md`, then `closed-NN.md` from `02` up, contiguous. One refusal per way a set loses a member:

| defect | the line the guard prints |
| --- | --- |
| a gap in the numbering | `the record's files skip closed-02.md, so closed-03.md begin a numbering whose predecessor does not exist` |
| a name that is named like the record and is not one of its files | `this file is named like the record and is not one of its files` |
| a second first file | `closed-01.md is a second answer to "where does the record begin"` |

The second is deliberate. A glob would read `closed-copy.md` and let the ids catch the copy -- and would also read
`closed-old.md` and `closed.md.bak` as **the record itself**, at a position in the numbering that nothing chose.
Finding 463's principle, an unknown spelling refused rather than ignored, moved from headings to file names.

### 4. A boundary has two ways to be wrong

A continuation file must carry the `## Closed` heading, and its first content line must be an entry:

- **no heading**: `sections()` finds nothing in the file, the walk moves on, and **the corpus is quietly
  smaller**. That is the previous section's hole in its local form, and it was the one shape with no diagnostic
  at all;
- **prose before the first entry**: a boundary drawn through a sentence. The preamble belongs to the first file,
  because it says what the numbers mean; a continuation file starts at an entry.

### 5. The one rule only a set can get wrong

"The ids ascend across the files." A boundary can be placed anywhere, and one placed in front of the older half
leaves the space dense -- the set is the same set -- while the record's own order is reversed. Density cannot see
that, and every citation into the record ("the closure above", "the one before it") means the order.

The scope is the **record**, not the corpus: `O-002` can be closed while `O-003` is open, so the corpus in read
order is not a run of numbers, and a rule over it would refuse a document that is right. Thus the green side needs
a fixture of its own -- the live list holding 1, 4 and 5 while the record holds 2 and 3.

### 6. The split itself: 25 + 27, proven and not asserted

`closed.md` holds `O-028`..`O-052`, `closed-02.md` holds `O-053`..`O-079`, and the entry this round closes holds
`O-027` at the head of the record. The **52 entry lines were compared before and after, in order, and are
identical**; 42,558 and 30,899 bytes.

### 7. Three defects that are this round's own

1. **The closure's address was assembled during the walk.** `move it to ...` took "the last file of the record so
   far", and the live list -- the index -- is read first, so it was told to file closures in the **first** file of
   a two-file record. The fixture that expects the last file went red; the address comes from the discovered set
   now.
2. **The order rule was first written over the corpus**, and the "1, 4, 5 against 2, 3" shape refused it -- a
   document that is right. The scope moved to the record.
3. **This entry's own first draft took `O-080`**, the number after the highest, which left a hole at `O-027` and
   was refused: `the ids skip O-027`. That is the rule working -- a closure carries its number into the record and
   a number that was spent stays spent -- and it is the first execution of "a closure slots in at its place".
4. **This section was written in Chinese first**, and `check-docs-language` refused it with eleven diagnostics:
   this repository's documents are English, and the gate's jurisdiction is the tree rather than the diff. The
   section is a translation of itself now, which is why it is shorter than the round it describes.

### 8. Falsification

Twelve edits, **21** reds. Each deletes one judgement this round added, and the red has to be the fixture written
for it:

| edit | red |
| --- | --- |
| accept a file named like the record | 1 -- `refuses a file named like the record` |
| check only the top of the numbering | 1 -- `refuses a gap in the numbering` |
| accept a second first file | 1 -- `refuses a second first file` |
| read continuation files without a boundary | 2 -- both boundary fixtures |
| let a continuation file lose its heading | 1 -- `refuses a continuation with no heading` |
| let a continuation file open with prose | 1 -- `refuses a continuation that begins inside an entry` |
| drop the record's order rule | 1 -- `refuses a record whose files are not in the order its numbers are` |
| never judge the budget | 1 -- `refuses a last file over the budget` |
| judge every file against the budget | 2 -- the frozen-file fixture and the budget fixture |
| name the first file as where a closure goes | 1 -- `names the last file of the record` |
| **read only the first file of the record** | 8 -- **the accident itself**: five fixtures and three shipped readings |
| accept a budget that is not a number | 1 -- `refuses a budget that is not a number of bytes` |

### Readings

> Ledger for `v3.113`.

| item | value |
| --- | --- |
| `core` test suite | **257 files, 6658 tests passed** (at v3.113) |
| `cli` test suite | **4 files, 187 tests passed** (at v3.113) |
| repo test suite | **261 files, 6845 tests passed** (at v3.113) |
| coverage | `core` **99.98 / 99.95 / 100 / 99.98**, `cli` **100 / 100 / 100 / 100** -- unchanged: nothing under `src/` moved |
| new tests | **6,646 -> 6,658, +12**: eleven refusals and readings of the set, and one green fixture that pins the scope of the order rule |
| the lists | `## Open` **27 -> 27** (one closed, one opened), `## Closed` **52 -> 53**, one space of **80** ids with none missing |
| the index | **66,861 -> 67,565** bytes |
| the record | **73,447 -> 77,191** bytes over 53 entries, in **two** files (46,292 + 30,899) |
| the volumes | **17**, and this round is the third in `volume-17.md` (**134,310** bytes) |
| the falsifications | twelve edits, **21** reds; the accident performed on the shipped tree |
| gate sites / scripts / throws | **144** / **67 of 98** / **99** -- no new exit and no new script |
| the budgets | **34 -> 35** files state one: `category-derivation.test.ts` at **1 044 ms** on the runner, declared at **3 000 ms** |
| LLM calls | **0** |

### Left open

- **The row arm's cross-file population has never run on the shipped tree.** A fixture carries both sections in
  one file, so the two-file population is exercised only by a document that is not the shipped one.
  `[open: the gate has the second switch now -- RCA_RECORD_DIR -- so a fixture over a set is writable, and what no fixture can supply is the shipped record that makes it the tree's own path]`
- **The record's set is one directory deep, and a file moved below it is invisible.** `recordSet()` reads
  `docs/progress/` and nothing else, so the discovery rule has the limit the single path had, one level down.
  `[open: a recursive walk needs a statement about what a file one level down means -- an archive is not the record, and a record in two places is what the numbering refuses]`

## v3.114 · the arm compared a record with itself, and the ruler it published was not the one it used

The live list's last word about this guard was that one of its paths had never run:

> **The row arm's cross-file population has never run on the shipped tree.** ... The two-file path has
> therefore been built, argued for, and never executed where it matters.

Writing that fixture took one measurement, and the measurement found four defects -- three in the arm and
one in the record's own introduction -- before the fixture existed. A fifth came out of counting what the
fixture's neighbouring rule would exempt, and a sixth out of the verification that followed: a file whose
cost crosses the budget floor in the suite and not alone.

### 1. Both switches, on together

`--doc` names the index and `RCA_RECORD_DIR` names the record's directory. They were added a round apart --
the second by finding 572 -- and no test had ever used the two together, because the record was one path
when the cross-file fixture was written. The fixture is the shipped shape at fixture scale: `closed.md` holds
`O-002`, `closed-02.md` holds the `O-003` the round closed, the round's own `### Left open` names it, and the
live list holds `O-001` and nothing else. Green.

That green means something now, which is what the entry was about: the row's words appear nowhere in the
corpus except in the closure that `closed-02.md` holds, so a green is the second file being read by the arm
that judges rows. It closes `O-026`. It is not the interesting part of the round.

### 2. The measurement that came before it

The shortest way to ask whether an arm has teeth is to take away the witnesses it should not have. The
population was every entry the walk read, records included; the arm's own diagnostic names two lists --
*`appears in no entry of ## Open or ## Closed`*. So the population was narrowed to those two and the gate
ran on the shipped tree:

```
check-open-list: 25 record(s) in table form (188 row(s)); the v3.113 record's 1 row(s) were judged, and every one of them quotes an entry
  - docs/progress/volume-17.md: the v3.113 record names a residual the list does not hold -- "**The row arm's cross-file population has never run on the s" appears in no entry of `## Open` or `## Closed` -- ...
exit 1
```

**Two rows were reported as quoting an entry a moment earlier, and one of them was quoting itself.**

### 3. The green that was a set with one member (finding 573)

v3.113 fixed this arm's *selection*: it had been judging v3.69's table for forty-one rounds, because it
collected only the table form and the rounds stopped writing tables at v3.70 (finding 568). The fix collects
both forms, and the form every round since v3.70 writes is a `### Left open` list of **entries**. The
population was built by pushing every entry the walk read:

| the arm's subject | its rows | what a row was compared with |
| --- | --- | --- |
| a table (v3.65 to v3.112) | a `item` cell | entries -- a cell is not an entry, so a copy was impossible |
| a list of entries (v3.113) | an entry's headline | entries -- **the same bullet** |

```
witnesses.push(item)                                                   // every entry, records included
records.push({ items: items.map((item) => item.split('\n')[0] ...) })   // the same bullets
population.some((one) => one.includes(row))                            // true by construction
```

So the sentence `the v3.113 record's 2 row(s) were judged, and every one of them quotes an entry` was true
of a set with one member, and no record in that form could ever have been refused. The arm's subject became
right in v3.113 and its evidence became its subject in the same edit.

The repair is the exclusion at the push site, and it states the arm's subject rather than tightening it: a
row is a claim about an entry **somewhere else**. Both lists stay in the population, because a row may name
a residual the round *closed*, and from v3.111 that entry is in the record of closures.

### 4. The row that is right (finding 574)

With the population narrowed and the comparison untouched, the shipped v3.113 record went red -- on a row
that is right. Its first twenty characters are the live entry's; its tail is the round's own account of the
same residual. Finding 468 measured the corpus for exactly this and published the comparison:

> ... strip `**`, `~~` and backticks, normalise the quote and dash forms, collapse whitespace, drop the case
> and the trailing full stop -- and then require twenty characters of the row to appear inside an entry.

The code had required the **whole** row since v3.65, and forty-eight rounds could not tell. Until v3.113 the
subject was a table and no row could be a copy of its witness; from v3.113 the row was its own witness, and a
self-witnessing row satisfies any ruler however strict it is. The first reading that could separate the two
was the one after the population was narrowed, and it refused a document that is right -- which is the shape
this log treats as worse than a silence, because it is a rule that would make a correct file illegal.

`ROW_QUOTE` is the published ruler, implemented, and the count the arm prints now says which one it is:
`every one of them matches an entry on its first 20 characters`. The word *quotes* was a claim of verbatim
agreement that the ruler never made, and it is the same drift one line below the one being repaired.

Measured under the ruler at v3.114: the **80** entries of the two lists have **80** distinct first twenty
characters, so no row that opens with an entry's words can resolve against a different entry.

That refusal can no longer be reproduced, and the reason is the arm's own scope: this round's record is the
newest now, and the row the whole-row rule refused belongs to a record that is frozen from here on. The defect
had to be found in the round that fixed the population, or it would have become a green rule over a past
nobody may edit -- which is the whole reason the arm reads the newest record while it is still the newest.

### 5. Two records, one judged (finding 575)

The selection is "the first record whose owner is the newest round". Two records under one round is two
answers to *what did this round leave open*, and the arm would judge one and pass the other in silence --
finding 162's shape (`a document that gains a list must gain a reader for it`) applied to a section that was
supposed to be unique. The measurement, over the shipped corpus: **zero** of the 192 records the
shipped corpus holds have a round that wrote two. So the refusal costs nothing and closes the silence before it has a
tenant, which is the only kind of rule this log adds without a defect behind it.

### 6. The record's introduction said the opposite of its rule (finding 576)

Reading `docs/progress/closed.md` to place `O-026` found this, three paragraphs apart in the same file:

| where | what it says |
| --- | --- |
| the third paragraph | **The order is the live list's order, not the closing order.** |
| the fourth paragraph | The order in this file is the closing order; the numbers inside it are not monotone. |

and the entry between them, written by the same round: *a closure keeps its number and slots in at its
place, so the record is a run of numbers*. v3.113 wrote the ascending rule and left the introduction saying
the file is not monotone -- in the round that added the refusal for the first number that does not ascend.
The file's numbers read `O-027` to `O-052` then `O-053` to `O-079`, which is monotone, and the guard has
refused a non-ascending record since finding 572.

The paragraph is repaired rather than struck, because it is an introduction and not an entry: it now states
the rule, says the range grows **downward** as closures slot in above their successors, and names the two
that did (`O-027` at v3.113, `O-026` here). What no gate can do is catch the next one: a sentence about the
document that is not a count is read by nobody but a reader, and this is the second stale sentence found in
this introduction in two rounds. The repair is stated in the paragraph itself, where the next reader is.

### 7. A record above its round is judged by nothing (finding 577)

The other half of the selection. The arm finds a record by the round heading **above** it, so a record
written above the first heading in its file never reaches `records` -- its entries are still counted, and the
arm that judges rows never sees them. Nothing refused it, and the exemption that hid it was real: three
volumes were written before rounds had numbers and name their rounds `## Pass N`, so they carry no `## vX.Y`
heading at all.

The file answers the question the record cannot: **every volume since v3.45 begins with a round heading on
its first line** (measured: volumes 04 to 17, `firstRoundLine=1`), and volumes 01 to 03 name no round
anywhere. So the refusal is scoped to a file that names rounds, where a record above the first heading was
written too high rather than too early. The rule reads the file once per section and costs one comparison;
what it buys is that the arm's subject is *found* rather than assumed, which is what 575 says from the other
side.

### 8. A file whose cost crosses the floor in the suite and not alone (finding 578)

`verify:local` passed on the first tree this round published, and failed an hour later on a tree that differed by
documentation only:

```
check-test-budgets: step-process.test.ts: its slowest test takes 1635 ms and the file states no budget, so its
verdict is decided by vitest's 5000 ms default
```

Both runs measured the same suite. The reading belongs to the machine rather than to the file: every test in
`step-process.test.ts` spawns a child, and the slowest -- *does not leave the script it materialised behind* --
reads **940 ms** alone and **1 635 ms** inside the suite, where it shares four cores with 256 other files. The
floor is 1 000 ms, so the same test sits **6%** under it on a quiet box and **63%** over it on a busy one, and the
number that decided the difference was one the file never wrote.

| reading | value |
| --- | --- |
| alone, eleven tests | **940 ms** |
| inside the suite, four cores, 257 files | **1 635 ms** |
| two copies of the file at once | 783 / 820 ms -- a second copy is not what makes it expensive |
| the rule's floor | 1 000 ms |
| declared | **4 000 ms**: 2.4x the suite's reading, 4.3x the isolated one, below the default |

The declaration is the repair, and it tightens rather than relaxes: 4 000 is below the 5 000 the file used to
inherit, so a step that genuinely hangs is caught a second sooner, and this file's verdict is now decided by a
number somebody wrote. The gate reads **36** files stating a budget where it read **35**, and the closest to its
own is this one at **41%**.

**It also corrects the direction finding 571 taught.** That round sized a budget from the runner's reading,
because the local one was flattering by half; this one sizes it from the suite's, because the isolated one is. The
sentence is the same in both -- *the reading that matters is the one taken where the test runs* -- and neither is
the number a developer sees when they run the file by itself.

### 9. Four defects that are this round's own

1. **The constant's comment put the whole-row ruler at v3.66**, and the arm was built at v3.65 -- volume-13's
   ledger is where that number is written, and the comment was written from memory. Caught by reading the
   round that introduced the rule, which is the only place the answer exists.
2. **The rename left a stale reference.** `listed` became `witnesses` and one sentence three hundred lines
   away still said `for the same reason listed is`. Found by grepping the old name after the rename, which is
   the check last round's stale comment taught.
3. **The fixtures were written after the repair.** The measurement was the instrument that found the defect,
   so the order was measure, repair, then fixture -- and the guarantee a test-first round gets for free has
   to be obtained backwards. It was: each repair was removed in turn and the red had to be the fixture
   written for it, seven edits and **nine** reds. Stated rather than excused, because "the test came second"
   is only safe when it is checked, and the check is the table below.
4. **The population in this round's own sentences was the corpus's, not the records'.** Two of them said
   `zero of the 195 sections that are records`, and 195 is every list section the corpus holds -- one live
   list, two closed files and **192** records -- so the number named a population three times the size of the
   one that was measured. It survived the round's first commit and was found while restating the ledger's
   counts, which is where a number that was never counted goes to be counted; the comment that justified the
   same floor carried it too, and there it was deleted rather than corrected, because a count of a population
   that grows is a count that decays.

### 10. Falsification

Seven edits, **nine** reds. Each deletes one judgement this round added, and the red has to be the
fixture written for it:

| edit | red |
| --- | --- |
| accept a record as a witness of its own rows | 1 -- `refuses a record whose own bullet is the only entry it quotes` |
| require the whole row again | 2 -- the twenty-character fixture and the cross-file fixture |
| drop the too-short floor | 1 -- `refuses a row whose item is too short to name anything at all` |
| allow two records for a round | 1 -- `refuses a round that wrote two records` |
| judge the second record rather than refusing two | 1 -- the same fixture, from the other side |
| stop treating closures as witnesses | 2 -- the two-file closure fixture and its one-file predecessor |
| **let a record sit above its round** | 1 -- `refuses a record written above its round` |

### Readings

> Ledger for `v3.114`.

| item | value |
| --- | --- |
| `core` test suite | **257 files, 6663 tests passed** (at v3.114) |
| `cli` test suite | **4 files, 187 tests passed** (at v3.114) |
| repo test suite | **261 files, 6850 tests passed** (at v3.114) |
| coverage | `core` **99.98 / 99.95 / 100 / 99.98**, `cli` **100 / 100 / 100 / 100** -- unchanged: nothing under `src/` moved |
| new tests | **6,658 -> 6,663, +5**: the vacuity refusal, the twenty-character fixture, the two-record refusal, the record-above-its-round refusal, and the two-file closure fixture |
| the lists | `## Open` **27 -> 27** (one closed, one opened), `## Closed` **53 -> 54**, one space of **81** ids with none missing |
| the index | **67,565 -> 67,555** bytes |
| the record | **77,191 -> 80,444** bytes over 54 entries, in **two** files (49,545 + 30,899) |
| the volumes | **17**, and this round is the fourth in `volume-17.md` (**150,547** bytes) |
| the falsifications | seven edits, **nine** reds |
| gate sites / scripts / throws | **144** / **67 of 98** / **99** -- no new exit and no new script |
| the budgets | **35 -> 36** files state one: `step-process.test.ts` at **1 635 ms** in the suite, declared at **4 000 ms** |
| LLM calls | **0** |

### Left open

- **The record's set is one directory deep, and a file moved below it is invisible.** `recordSet()` reads
  `docs/progress/` and nothing else, so the discovery rule has the limit the single path had, one level down:
  `docs/progress/archive/closed.md` is a closure log to a reader and to no rule here.
  `[open: what a file one level down means has to be decided before a walker is written -- an archive is not the record, and a record in two places is what the numbering refuses -- so the widening waits on that sentence rather than on a recursion]`
- **Twenty-five records are judged by nothing, and the number has never been counted.** The three volumes of
  the `## Pass N` era name no round, so finding 577's refusal steps over them by asking the file; the count is
  what is missing, not the rule.
  `[open: the exemption is a reading of three file names, and a count would say what it covers; the repair is a report rather than a refusal because a record in those volumes can never be merged into a round]`

## v3.115 · the record had four names, and the guard read the two it had written down

The live list's last word about the arm was a count nobody had taken:

> **Twenty-five records are judged by nothing, and the number has never been counted.** The three volumes
> of the `## Pass N` era name no round, so finding 577's refusal steps over them by asking the file.

Counting them took one line and found something else. The plan for this round was a measurement of the
row arm's *pairing* -- whether one entry's first twenty characters can resolve two rows, or one row two
entries -- and that measurement answered **no**: of 567 record rows, 553 match no entry, 14 match exactly
one, and **0** match more than one, so the ambiguity the round went looking for is not in this corpus.
What the same walk showed is that the corpus holds **217** records and the guard was reading **195** of
them. The missing 22 had been written by rounds between `v3.81` and `v3.102` under names the guard's
spelling table did not carry, and no output of any run had ever said so.

### 1. Four names, and a table that carried two

`spellingOf` is the guard's whole idea of what a list is called. It held four entries: `## Open`,
`### Left open`, `### Left open, <anything>` and `## Closed`. The corpus had written two more:

| spelling | rounds | form | rows | read before this round |
| --- | --- | --- | --- | --- |
| `### Left open` | 145 | entries | -- | yes |
| `### Left open, in the order the goal is reached` | 25 | table | 188 | yes |
| `### Leftovers, in the order that reaches the goal` | 17 | table | 106 | **no** |
| `### What is left, in the order it has to happen` | 5 | table | 24 | **no** |

The property that makes the last two a record is not the name: it is a table whose first column is
`priority`. The corpus is unambiguous about that column -- of **555** tables in the progress corpus,
**47** begin with it, and every one of the 47 is a round's record. The guard counted 25 records and 188
rows; the corpus held 47 and 318 (finding 579).

### 2. The refusal existed, and it was written as a prefix of the two names that existed

v3.63 wrote the refusal this round is about, and it wrote it as one pattern:

```js
const NEARLY = /^#{2,3} (?:Open|Left open|Closed)\b/;
```

A regex built out of `Left open` matches a heading that **begins** with it, so the third spelling it was
written to catch is a spelling that shares a prefix with one of the first two -- which is exactly the
shape its own fixture drives (`### Left open (unfinished)`, refused, green). `Leftovers` begins with
`Left` and `What is left` begins with `What`, so both arrived, twenty-two times, and the rule printed
nothing.

### 3. What the silence cost, and the number inside the arm

The 22 records' rows were never counted, their columns were never compared with the vocabulary, and
every refusal written for a record's shape stood unreached over them -- which is section 5 and section 6.
The sharper cost is a number inside a rule. Finding 575 added "a round has one record" and measured it:

> Nothing shipped does this (zero of 195 rounds, measured at v3.114).

**195 was the number of records the arm could see.** The arm's `rounds` holds `## vX.Y` headings, and
there were **210** of them when the round started, over **217** record sections: 192 belonged to a
round, 25 did not, and **18 rounds wrote no record at all**. The claim survives at 210 -- no round owns two of the 217 -- and its
denominator was the arm's own population, which is the defect the arm exists to refuse, one level up.

Two numbers wear the word *round* in this corpus and neither document says so: the volume gate counts
**263** `##` entry headings -- 50 `## Pass N`, 211 numbered rounds, and two others -- while the arm
counts the 211 numbered ones, because a `## Pass N` heading carries no number and cannot be compared
with a stamp. The sentence above is about the second count. The first is right for its own subject:
the volume gate is asking how many rounds a file holds, and a `## Pass 7` round is a round.

### 4. The repair: the names join the table, and the refusal moves onto the body

Adding two names would have repaired this corpus and left the next rename invisible, so the round did
both. `spellingOf` reads four record names now, each with its count in the comment; and
`recordTableUnderUnknownHeading` asks the question a name cannot lie about -- is the first column
`priority`? -- of every table in the document. A table under a heading the spelling table does not read
is refused, with its row count in the sentence. On this corpus the rule fires 47 times with the names
taken out and 0 times with them in, and it has no false positive: no other table begins with that column.

Its first scope was wrong in the way this guard's scopes have been wrong before. The function took the
body a `##` heading *spans*, which is what `sections()` means by a span, and a round heading is `##`
while its record is `###` underneath -- so every round in the corpus was reported as an orphan and
thirteen tests said so on the first run. The scope is one line: a table belongs to the heading directly
above it, whatever the level.

The arm's population is printed now, on every run:

```
check-open-list: 217 record(s): 192 under a round and 25 under none; 210 round(s), 18 of them wrote none
```

That is `O-081`'s number, and the second pair is the correction to finding 575's denominator. It is a
report rather than a refusal for the reason the entry gave: a record in the `## Pass N` volumes can
never be merged into a round, and a round may legitimately leave nothing open. The line above is the
corpus as this round found it; a run after this record was written prints **218**, **193** and **211**,
because this round is the twenty-second record the guard could not see and is now one of the ones it can.

### 5. The two defects that stood in the unread half (finding 580)

A refusal nothing can reach is not a rule, and the 22 sections held two instances of refusals written
years of rounds earlier.

`volume-16.md:1210` is a row of a `What is left` table whose last cell names the YAML block scalar as
`` `run: |` ``. A pipe inside a Markdown table cell separates the cells, code span or not, so that row
renders as five cells under a four-column header -- the exact shape `tableShape` refuses, and a refusal
that has existed since v3.64. The row was written by `v3.98` and its section was one of the 22, so for
the seventeen rounds it existed no run reached it.

And the fourth column has two names: **42** records spell it `next step` and **5** spell it `next`, whose
294 and 24 rows are the whole of the 318. A vocabulary with one word for a column the corpus spells two
ways refuses five frozen records for a rename no round may repair, so the second spelling is published,
with both counts in the comment and both names in the diagnostic.

The same section moved the item read off a position and onto a name: the shape check asks whether the
header names the four columns, and the row arm then took `cellsOf(row)[COLUMNS.indexOf('item')]` -- so a
table that ordered its columns differently would pass the check and have its item read out of whatever
sat second. None of the 47 reorders, which makes this a floor; the fixture reorders the header and makes
the arm resolve a row against a live entry.

### 6. The remedy its own diagnostic asks for (finding 581)

`cellsOf` split a row on every pipe. The two `replace` calls in the same three lines show the author knew
a pipe can be escaped -- the last one refuses to strip a `\|` off the end of a line -- and the `split`
undoes it. So the refusal in section 5 asked for a repair it would refuse again: a cell cannot hold a
literal pipe except by escaping it, and an escaped pipe was counted as a separator.

The escape is not hypothetical in this tree. A three-column prose table in `v3.82` names
`order\|cpu\|>=\|high\|count/min`, six escaped pipes in one cell, and the old reader counted it as
**eleven** cells. Among the 318 record rows the count was **0** using the escape and **1** holding an
unescaped pipe -- the row of section 5 -- so both halves of that row were unreachable, the wrong one and
the repaired one. The split is on unescaped pipes now, the escape is undone inside the cell because a
cell's `state` is prose, and the guard's own row count is 318 rather than the 313 it printed while a
refused table was dropped from a census that adds after the refusal.

### 7. The round that explained the arm's row rule (finding 582)

`v3.81`'s record is a `Leftovers` table with a plain priority column, and its prose explains why -- with
four claims the corpus refutes. A bold first cell is not what the guard reads (it stopped reading cells
at v3.63); no cell of that table was counted, bold or plain, because the heading was one of the 22; the
`v3.80` it compares itself with wrote no record at all, which is true of 18 of the 210 rounds; and the
"count of bold priority rows" it says disagreed with the guard is a count the guard has never printed.

The fourth claim had readers, and that is why it matters. `acceptance.md` derives the table-form record's
row count "from the content (a record's first cell is a bold priority)", and the test named
`reads the shipped corpus as 147 rows` derives it the same way. Both agreed with a population 22 records
short, and a census keyed on the bold cell finds **188** rows where the structural one finds **318** --
because the 130 rows in the renamed records name a plain priority, which is what the paragraph itself
explains. The paragraph is rewritten to what the corpus says, the acceptance bullet keeps its dated
number beside the measurement that shows what the derivation covered, and the test derives the count
from the structure and holds the bold-cell census *below* it.

### 8. Five defects that are this round's own

Each was found by running the thing rather than by reading it, and each is here because the round that
writes "a count nobody took" has to take its own.

1. **The orphan rule refused all three known names.** It passed `spellingOf` the heading with the `### `
   stripped, so the spelling table did not recognise the spelling it had just matched. Twenty-five
   diagnostics on the first run.
2. **Its first scope reported every round in the corpus as an orphan**, because a round's record is a
   `###` inside the `##` span the function took as the section. Thirteen red tests.
3. **The population line counted `records.length`**, so a record refused for its shape was reported as
   "under none" -- 191 and 26 where the corpus holds 192 and 25. A true sentence about the array and a
   false one about the corpus, which is the defect this guard is about. The two halves are counted where
   the owner is resolved, before either form is read.
4. **A refused table is dropped from the census.** `tableShape` returning a problem made the row loop
   `return` before `tables` and `tableRows` were incremented, so the summary printed 46 and 313 over a
   corpus of 47 and 318. The refusal is about the shape; the count is about the corpus; one may not
   delete the other.
5. **`80` entries with `80` distinct first twenty characters** in the ruler's comment -- measured before
   the round that wrote it added `O-081`, which makes it 81 and 81. Re-derived rather than remembered,
   which is what the same paragraph says about every count in this repository.

### 9. Falsification

Eight edits, **forty** reds. Each takes one judgement away, and the red has to be the fixture written for
it -- the pairs that red more than one are the shipped-corpus readings, which is the point of deriving
them from the file:

| edit | red |
| --- | --- |
| the first name the corpus gave the record is taken away | 7 |
| the second name is taken away | 5 |
| the split goes back to every pipe, and the escape stays in the cell | 5 |
| the fourth column loses its second spelling | 5 |
| the refusal keyed on the body is taken away | 1 -- `refuses a record's table under a heading the guard does not read` |
| the item goes back to being read by position | 1 -- `reads the item from the column its header names` |
| the orphan rule loses its scope | 15 |
| a record with no round stops being counted | 1 -- `counts a record whose file names no round` |

### 10. Two things only the committed tree said

The gate ran twice over this round's content: once on the working tree, once on the commit. The first
said `OK (35 command(s) covering 48 of the 58 run steps)`. The second failed at 8 of 35. **Neither
failure was about the content**, which is why neither could appear on the first run, and both are
about a number this round wrote.

#### 583. The eight derived numbers were typed, not re-derived, and one of them was a count of the index

`docs/audit/volume-14.md` is new in this round, so the commit holds **667** tracked files; the
`## Repository` table published **666**, taken from the tree that did not yet contain it. The row is
`git ls-files`, and the check that reads it passed on the tree holding 666 and failed on the commit
holding 667:

```
  - ## Repository says '666' for Tracked files; the tree says '667'
```

The guard has a mode for exactly this -- `--write` refuses to publish while a file exists that the
index does not hold, and says so in a sentence -- and the round did not use it: it edited prose. The
repair is the guard's own output, re-derived rather than typed, and it moved a second row with it:
`Test lines` **112,719 → 112,744**, which is the 25 lines of the comment 584's repair added. A number
in a derived table is a reading; a number a hand wrote beside seven derived ones is a coincidence with
a deadline.

#### 584. A second file crossed the floor, and this time the run moved rather than the tree

`battery-witnesses.test.ts` holds 17 tests and every one of them spawns `python3`, so its cost is the
machine's: the slowest -- *reads the transform failure out of the bytes CI produced*, two spawns --
reads **150 ms** alone and **1,085 ms** inside the coverage suite, which is 7.2x for two process
launches. The rule's floor is 1,000 ms, and the file stated no budget, so its verdict fell to
vitest's 5,000 ms default:

```
check-test-budgets: battery-witnesses.test.ts: its slowest test takes 1085 ms and the file states no
budget, so its verdict is decided by vitest's 5000 ms default; state one on the suite
```

finding 578 wrote this sentence one round ago about `step-process.test.ts`, and the first run of this
round passed the gate with the same file under 1,000 ms. **The same bytes, two verdicts, and the thing
that moved was what else was running** -- which is the whole finding, arriving a second time in the
round that recorded it the first time.

The repair is the one finding 578 chose, and the number is chosen the same way: the suite's reading is
the reading, because a file measured alone would be sized for a machine it is never run on. **4,000
ms**, which the rule reads as "the slowest test may take 2,000" -- 1.8x the suite's reading, 13x the
isolated one, and below the default, so a spawn that genuinely hangs is caught sooner than it was.
Files that state a budget: **36 → 37**.

### Readings

> Ledger for `v3.115`.

| item | value |
| --- | --- |
| `core` test suite | **257 files, 6672 tests passed** (at v3.115) |
| `cli` test suite | **4 files, 187 tests passed** (at v3.115) |
| repo test suite | **261 files, 6859 tests passed** (at v3.115) |
| coverage | `core` **99.98 / 99.95 / 100 / 99.98**, `cli` **100 / 100 / 100 / 100** -- unchanged: nothing under `src/` moved |
| new tests | **6,663 -> 6,672, +9**: four names and the `next` spelling, the orphan refusal, the escaped and the unescaped pipe, the item read by name, and the two halves of the population line |
| the lists | `## Open` **27 -> 28** (one closed, two opened), `## Closed` **54 -> 55**, one space of **83** ids with none missing |
| the records read | **25 of 47** table-form records before, **47 of 47** after; **188 of 318** rows before, **318 of 318** after |
| the population | **218** record sections: **193** under a round and **25** under none; **211** rounds, **18** of them wrote none -- **217**, **192** and **210** when the round started, and the 22 records it found are in the 193 |
| the index | **67,555 -> 68,687** bytes |
| the record | **80,444 -> 82,170** bytes over 55 entries, in **two** files (49,545 + 32,625) |
| the volumes | **17**, and this round is the fifth in `volume-17.md` (**168,393** bytes) |
| the falsifications | eight edits, **forty** reds |
| gate sites / scripts / throws | **144** / **67 of 98** / **99** -- no new exit and no new script |
| the budgets | **36 -> 37** files state one: `battery-witnesses.test.ts` states **4,000** ms over a suite reading of 1,085 and an isolated one of 150 |
| the derived table | `Tracked files` **666 -> 667** (this round's audit volume) and `Test lines` **112,719 -> 112,744** (the comment that states the budget) -- both re-derived by the guard, not typed |
| LLM calls | **0** |

### Left open

- **The structural rule reads a table's first column, so a record that reorders its columns is a record to a
  reader and not to the guard.** Counted as `O-082`.
  `[open: a header that names the four columns in any order is a record by the same argument, and the price is a scan of every table in the corpus rather than of the tables whose first cell is already known to be a priority]`
- **Eighteen rounds wrote no record, and nothing can say whether that was a choice.** Counted as `O-083`.
  `[open: a round that leaves nothing open could say so in its own body, in one sentence, and then an absence would be a choice; nothing in the corpus writes one, so the rule would have to be written against the newest round and applied backwards]`

## v3.116 · a round is a number, and the record's fifth name was a list

The last thing v3.115 left on the open list was `O-083`: eighteen rounds wrote no record, and
nothing could say whether that was a choice. Reading the eighteen took an hour, and what it found
was two defects -- neither of them about the eighteen.

### 1. The number was a subtraction of two different units (finding 585)

The population line printed, every run:

```
check-open-list: 218 record(s): 193 under a round and 25 under none; 211 round(s), 18 of them wrote none
```

`218` and `193` and `25` are counts of record sections, and they add up. `211` is a count of
**headings**. `18` is `rounds.length - recordRounds.size` -- a count of headings minus a count of
distinct round **names** -- and `recordRounds` is a `Set` of names, so the corpus's one repeated
number was counted as a round that wrote nothing. Two operands, two units, and the difference
published as a fact about the corpus.

The two units differ by exactly one heading, and the corpus names it:

```
docs/progress/volume-04.md:1059: ## v2.15, addendum — the gate I ran could not fail
```

| what is counted | judgement | value |
| --- | --- | --- |
| headings matching `^## (v\d+\.\d+)\b` | `ROUND` | **211** |
| distinct round numbers | `new Set(rounds.map(r => r.round))` | **210** |
| names that wrote a record | `recordRounds.size` | **193** |
| names that wrote none, **counted** | `ascending.filter(r => !recordRounds.has(r.round))` | **17** |
| names that wrote none, **subtracted** | `rounds.length - recordRounds.size` | **18** |

An addendum is not a round: it is a second section of one, written when the round was interrupted
and resumed -- `v2.15`'s was written because the gate that round had just installed failed on it.
The corpus has exactly one, in volume-04, and it is the only place where a number is written twice.

### 2. The number line, and the count that does not need a heading

A count this project trusts is a count derived twice. The second derivation here needs no heading
at all: read the numbers as integers and the corpus is dense.

| era | numbers | slots | empty |
| --- | --- | --- | --- |
| `v2` | `v2.06` .. `v2.99` | 94 | 0 |
| `v3` | `v3.00` .. `v3.115` | 116 | 0 |

94 + 116 = **210**, which is what the headings say once the addendum is set aside, and the two
derivations agree. Three rules follow from it, and each is refused by the arm rather than trusted:

1. one number names one round (`v2.15` headed twice is refused, and the refusal names the addendum
   form);
2. inside an era the numbers are every increment (a gap is refused: in a log where every increment
   is a round, a missing number is a round the log lost or renumbered);
3. an era begins at `.00` and is the next one (`v9.99 -> v10.00` is consecutive; `v9.99 -> v10.01`
   is refused).

The third rule had to learn something about this corpus before it could be written: the minors do
not run `00`–`99`. `v3.99` is followed by `v3.100`, because `v3` passed its hundredth round, while
`v2` stopped at `v2.99` and was followed by a new era. A rule that assumed a fixed two-digit field
refused the corpus on its first run -- `the round numbers go from v3.99 to v3.100, so 0 number(s) in
between name no round` -- and that message is the shape of the mistake: a refusal about a gap that
reported zero missing.

### 3. The fifth name was in the other form (finding 586)

The eighteen were supposed to be rounds that left nothing open. One of them was not:

```
docs/progress/volume-04.md:1104: ### Not fixed here
```

Two entries, each a headline with a reason, under a name no table of names held -- and in **entries**
form, which is the half of the shape space the body rule of v3.115 never looked at. That rule asks
whether a table's first column is `priority`, and this section is not a table.

Almost every one of those sections is prose. **1,311** level-2 and level-3 sections are named
none of the five, and **202** of them hold a bullet carrying a reason -- the `### What the previous
pass recorded` sections paraphrase a closed entry, `### 一、The count was computed from the rule it
was defending` strikes the one it quotes, and the paragraphs around them are the round's account.
Asked the question the name cannot lie about -- *is this section nothing but entries?* -- one
answers yes:

| predicate over the progress corpus | sections |
| --- | --- |
| a level-2 or level-3 section whose name is none of the five | 1,311 |
| … holds an entry that carries a reason | 202 |
| … and holds no prose at column zero | **1** |
| … and at least one of those entries is unstruck | **1** (`### Not fixed here`, 2 entries) |

So the repair is not a sixth name -- finding 579 measured what a name table costs, and the corpus
has already renamed this list twice. It is the property: **a section whose body is nothing but
entries is a record, whatever its heading says.** The strike test is the corpus's own definition of
a closure (`CLOSED`, finding 458) and the reason is read with `reasonOf`, so this is one reader
being asked a second question rather than a second reader.

The round it belongs to is the one whose count was wrong: `### Not fixed here` sits under the
addendum, so `v2.15` was in the population line as a round that wrote nothing while its addendum
carried two promises. The addendum is in the owner table for exactly this reason -- a record looks
**up**, and a table that stopped at the plain headings would make this record ownerless.

### 4. The repair, in four rules and one line

```js
const ADDENDUM = /^## (v(\d+)\.(\d+)), addendum\b/;   // a section of a round, not a round
```

```js
// one number names one round, the numbers are every increment, an era begins at .00
const firstHead = new Map();          // the duplicate is refused and deduped, so the count is of rounds
const ascending = [...firstHead.values()].sort(...);
```

```js
// a section that holds nothing but entries is a record, whatever its heading says
if (line.trim() === '') continue;
if (/^- /.test(line)) { bullets += 1; continue; }
if (/^\s/.test(line) || /^---+\s*$/.test(line)) continue;
return 0;                              // everything else is prose -- a heading included
```

and the population line, counted rather than subtracted -- this is the corpus as the round found it,
before it wrote the record whose absence would have made it 211 rounds and 18:

```
check-open-list: 219 record(s): 194 under a round and 25 under none; 210 round(s) + 1 addendum(s), 17 of them wrote none
```

The one-record rule of finding 575 moved with it, from the round to the **heading**: keyed by number
it would refuse `v2.15` for using the form the corpus invented for a round that ran twice. Measured
at this commit, no heading holds two records -- so the rule is still a floor, and it is now a floor
over the right unit.

### 5. Where a body may be read and a name may not

The body rule and the rename refusal disagree about one heading, and the disagreement is worth
keeping. `### Open` is what the volumes called the record until finding 207 renamed it, and the arm
refuses it: *"the heading begins with one of the list names this guard reads and is none of them, so
a list written under it would have no reader"*. With a body rule, that heading **has** a reader.

The first version therefore adopted it, and the test that drives the rename went red with a
diagnostic that had become false. The resolution is not to soften the message: it is that a heading
which begins with a list name and is none of them is **refused, not read**. The rename exists so a
reader who greps for what is open finds one list (finding 207), and a body rule that quietly accepts
the old name would leave that rule enforced by nothing. So the body is asked only about headings the
name table neither knows nor almost-knows.

### 6. What the seventeen are (finding 587)

With the addendum out of the count and the fifth name read, seventeen rounds wrote no record. The
open list said their absence was undecidable. The rounds themselves disagree, in prose, in their own
ledgers:

| what the round's own ledger says | rounds | count |
| --- | --- | --- |
| it opened at least one entry -- so the record is missing, not empty | `v3.70`–`v3.77`, `v3.79`, `v3.80`, `v3.107` | **11** |
| it closed one and filed nothing, in its own words | `v3.78`: "the vocabulary hole it exposed was closed in this same round rather than filed" | **1** |
| it says nothing about the list at all | `v2.39`, `v3.103`–`v3.106` | **5** |

Eleven of seventeen rounds that "wrote none" **added an entry to the live list**. A round that
raises a residual has left something open by construction, so for those eleven the absence is not a
choice and the neutral reading the arm published was wrong. One round says it closed rather than
filed, and that is the only round in the corpus whose own words support "nothing was left open". The
remaining five are silent, and silence is what the arm cannot tell from a loss.

So `O-083` closes and its premise does not survive: the corpus *can* say, in one sentence per round,
and eleven of the seventeen say the opposite of what the line implied. What replaces it is narrower
and true: the arm cannot see what a round changed, because `## Open` holds the current list and the
diff is in git rather than in the corpus -- `O-084`.

### 7. This round's own four defects

1. **The body rule read a round as a record.** Allowing a heading inside the body made every round
   own a record, because a round's body holds its `### Left open`. The nested-section refusal said
   so thirteen times on the first run, which is the refusal doing its job one level above the
   defect it was written for.
2. **The printed count still used the headings.** The dedupe went into the rules and not into the
   line, so a corpus with `v9.9` headed twice printed `2 round(s)` while the refusal beside it said
   one number named two rounds. A count and a refusal about the same fact have to agree, and the
   test that holds them together is the one that failed.
3. **Two fixtures were wrong in the ways the guard refuses.** One gave every entry the same reason
   (refused: a shared reason is a placeholder), and one wrote a record whose items appear in no
   entry (refused: a residual a reader is not told about). Both are the arm working, on fixtures
   written by the round that was changing it.
4. **The first draft of this section's own census mixed units.** It said "14 sections hold a reason,
   4 hold no prose, 1 is a record" -- and 14 was a count of **heading names** while 4 was a count of
   **sections**. The round that repaired a subtraction of two units had published one, in the table
   it built to justify the repair. Taken again in one unit: 1,311 sections are named none of the
   five, 202 of them hold an entry with a reason, and 1 holds no prose at column zero.

### 8. Falsification

Nine edits, thirty-five reds, and the reds are the fixtures written for the judgement removed:

| edit | reds |
| --- | --- |
| the addendum is not recognised, so its number is a second round | 7 |
| the duplicate-number refusal is removed | 2 |
| the gap refusal is removed | 1 |
| the era boundary is read as a gap | 6 |
| the entries body rule returns nothing | 5 |
| the body accepts a heading, so every round is a record | 11 |
| the body rule adopts `### Open` | 1 -- `no longer reads the heading the volumes used to call Open` |
| the population is counted by heading again | 1 -- `counts a round that wrote nothing once, even when its number is headed twice` |
| the one-record rule is keyed by number again | 1 -- `reads an addendum's record as the round's, and not as a second round's` |

The arm was restored byte for byte (`diff -q` against the backup) and the file is 96 tests.

> The population line printed above is the corpus as this round found it -- 210 rounds, 219 records. With this
> round's own record written it reads **211 round(s) + 1 addendum(s), 17 of them wrote none** and **220 record(s):
> 195 under a round and 25 under none**, because the round that repaired the count is now a round the count has.

### Readings

> Ledger for `v3.116`.

| item | value |
| --- | --- |
| `core` test suite | **257 files, 6684 tests passed** (at v3.116) |
| `cli` test suite | **4 files, 187 tests passed** (at v3.116) |
| repo test suite | **261 files, 6871 tests passed** (at v3.116) |
| coverage | `core` **99.98 / 99.95 / 100 / 99.98**, `cli` **100 / 100 / 100 / 100** -- unchanged: nothing under `src/` moved |
| new tests | **6,672 -> 6,684, +12**: the addendum count, a number headed twice, a gap, the era boundary and an era that does not begin at `.00`, the addendum's record, and the entries body rule in five shapes |
| the lists | `## Open` **28 -> 28** (one closed, one opened), `## Closed` **55 -> 56**, one space of **84** ids with none missing |
| the records read | **219 -> 220** sections: **194 -> 195** under a round, **25** under none -- the one added is `### Not fixed here`, read by its body |
| the population | **211** round(s) + **1** addendum(s), **17** of them wrote none -- was `211 round(s), 18 of them wrote none`, a heading count minus a name count |
| the number line | **210** distinct numbers, dense: 94 in `v2` (`v2.06`..`v2.99`) and 116 in `v3` (`v3.00`..`v3.115`), one era boundary, one repeated number |
| the index | **68,687 -> 68,617** bytes -- one entry out, one in, and the new one is shorter |
| the record | **82,170 -> 84,152** bytes over 56 entries, in **two** files (49,545 + 34,607) |
| the volumes | **17**, and this round is the sixth in `volume-17.md` (**183,040** bytes) |
| the falsifications | nine edits, **thirty-five** reds |
| gate sites / scripts / throws | **144** / **67 of 98** / **99** -- no new exit and no new script |
| the budgets | **37** files state one -- unchanged: no test file was added |
| LLM calls | **0** |

### Left open

- The arm cannot see what a round changed, so a round that raises an entry writes no record and nothing says
  so. `[open: eleven of the seventeen rounds that wrote none added an entry by their own ledger, and the arm reads neither the row nor the diff -- an entry carrying the round that raised it is the format change that would make this a rule]`
- The structural rule reads a table's first column, so a record that reorders its columns is a record to a
  reader and not to the guard. `[open: none of the 47 records reorders its columns, so this is a floor -- the widening costs a scan of every table in the corpus rather than of the ones whose first cell is already a priority]`

## v3.117 · the line named one authority and counted three, and a sentence ended inside a version number

`O-084` asked for a cross-tab of what each round closed, which needs a closure's finding and a
finding's round. Reading the closures to build it found three defects, and none of them was the
cross-tab: the arm's summary line, the window it reads a citation through, and a test that had been
asserting a zero for forty rounds.

### 1. The counter stood for three authorities and the line printed one (finding 588)

The summary line, every run, one per document:

```
check-open-list: OK (601 entry(ies) across 221 section(s) of docs/progress.md and its volumes: 571 open with a reason, 30 closed by a finding)
check-open-list: OK (56 entry(ies) across 2 section(s) of docs/progress/closed.md and docs/progress/closed-02.md: 0 open with a reason, 56 closed by a finding)
```

`closed` is one counter and one branch, and that branch accepts **three** authorities -- the guard's
own docstring has said so since the round that tightened the closure rule:

| authority | how a closure says it | record | index and volumes |
| --- | --- | --- | --- |
| a finding | `**Closed by finding 573.**` | **43** | **29** |
| a round | `**Closed by v3.78**`, `**Closed by Pass 15**` | **10** | **0** |
| not a finding | `**Closed without a finding:** …` | **3** | **1** |
| | | **56** | **30** |

One pattern matched all three (`finding\s+\d+|Pass\s+\d+|v\d+\.\d+`), so the counter could only be the
count of the three together -- and the noun beside it was the name of one. The three denials are
`O-032`, `O-033` and `O-036`, whose own words are *closed without a finding*, and the line counted them
into "closed by a finding". Over both documents: **73 findings, 9 rounds, 4 denials**, published as
**86 closed by a finding**.

### 2. Why two numbers were checked and the noun was not

The suite held this line in two places, and both questions are the ones a wrong noun survives:
`entries` is asserted to be `open + closed`, which is arithmetic and is exactly what the line gets
right, and `closed` is asserted to be greater than zero, which is non-vacuity. A count can be
arithmetically perfect and published under the wrong name. Neither assertion can see a noun, which is
why the noun was the one thing in the line nothing asked about.

The repair decides the authority where the closure is accepted, in the order the docstring states it:
a **finding** outranks everything, because it is the only authority a reader can check against a
heading, and a round named in the same sentence (`Closed at v3.97 by finding 540`) is where the
finding was filed; a **denial** outranks a round, because it is the writer's explicit sentence and a
version in the sentence after it is not a closure. The total is the **sum** of the three rather than a
fourth count beside them, so a total that disagreed with its parts cannot be produced:

```
... 30 closed (29 by a finding, 0 by a round, 1 without one)
... 56 closed (44 by a finding, 9 by a round, 3 without one)
```

### 3. The sentence ended at the period in `v3.81` (finding 590)

The fixture that was written for the precedence above -- `Closed at v3.97 by finding 540` -- went red
on its first run, and for a reason the round was not looking for. The citation pattern was

```js
const CITED = /(?:Closed|Narrowed|Retracted)\b[^.]{0,120}?\b(?:finding\s+\d+|Pass\s+\d+|v\d+\.\d+)/;
```

and `[^.]` is not "one sentence", it is "no full stop", in a corpus whose nouns include version
numbers. `O-057` closes like this:

```
- O-057 · **~~The modality comparison holds two maps of every row's signature.~~ Closed at v3.81 by measuring
  it and replacing the shape (finding 511).**
```

**58** characters from the verb to the citation, half the window, and the window could not reach it:
the first `.` on the way is the one in `v3.81`. The arm read what it had, found no finding in it, and
filed the closure under the **round** it had read. Every bullet of the record, the index and the
seventeen volumes -- **797** of them -- was read twice, once with each window: exactly **one** reads
differently, and it is `O-057`.

The boundary is stated positively now -- a period **followed by whitespace** ends the sentence, and a
period between digits does not:

```js
const CLAUSE = String.raw`(?:(?!\.\s)[\s\S])`;
```

`[\s\S]` rather than `.` because a citation wraps (`**Closed by\nfinding 170**` is the shape eleven
entries use), and the lookahead is asserted at every position, so the lazy count may cross a version
and may not cross a full stop. The split moved **43 -> 44** findings and **10 -> 9** rounds.

### 4. The zero that was the last digit of thirty (finding 589)

The repair of the noun was refused by a test in this arm:

```ts
expect(index).toContain('0 closed by a finding');
```

under the comment *"every entry it holds is open … A zero here is the split"*. The line says **30
closed by a finding**, and `30 closed by a finding` contains `0 closed by a finding`. The assertion had
passed for every round since it was written; the noun was what exposed it, because the noun changed and
the substring vanished.

The comment was wrong twice: the line is the index **and its seventeen volumes**, not the live list,
and the volumes' records close thirty entries -- the count was never meant to be zero. So it was a
claim about the wrong subject, satisfied by the right number's tail. A count in a sentence is now read
as the digits between a delimiter and their label:

```ts
const found = new RegExp(`(?:^|[^\\d])(\\d+) ${escaped}`).exec(line);
```

which reads 30 out of ` 30 closed` and 130 out of ` 130 closed`, and can read neither as a zero.

### 5. This round's own three defects

1. **The second reading was copied from the defect it was meant to catch.** `authorityTally()` -- the
   corpus reading that holds the published split to the record's bullets -- was written with `[^.]`,
   the window section 3 removed. After the repair the test read **43 / 10 / 3** while the guard printed
   **44 / 9 / 3**, and went red on the shipped corpus: a second reading that copies the first one's
   rule agrees with it about its defects, which is the reason this file's header says there is no copy
   of the guard's regexes in it.
2. **A fixture written for one rule found another.** The precedence fixture (`Closed at v3.97 by finding
   540`) failed as a *finding* case and the round went looking for why. Section 3 is the answer, and it
   was found by a test that was not about it.
3. **The ad-hoc census read the wrong half of a bullet, twice.** The first classification pass counted
   **17** findings in the record against the **44** it holds, because it read each bullet's first line
   and the citations are on the continuation lines -- the same class of error as finding 590, one level
   up: a reading bounded by a line break. And the first `countIn` would have taken `closed (` as a
   regex group, which the round escaped before it was ever run.

### 6. Falsification

Nine edits, seventy-eight reds:

| edit | reds |
| --- | --- |
| the three authorities collapse into the first | 11 |
| a denial falls through to the round | 9 |
| a denial is read as a round, because the round is asked first | 7 |
| the window stops at any period again | 8 |
| the total is one authority's count again | 8 |
| a closure that names nothing is accepted | 9 |
| the line publishes the total and no split | 14 |
| a count is read as a substring again | 6 |
| the corpus reading keeps the old window | 6 |

Both files were restored byte for byte (`diff -q` against the backup), and the arm is **103** tests.

### Readings

> Ledger for `v3.117`.

| item | value |
| --- | --- |
| `core` test suite | **257 files, 6700 tests passed** (as of this commit) |
| `cli` test suite | **4 files, 187 tests passed** (as of this commit) |
| repo test suite | **261 files, 6887 tests passed** (as of this commit) |
| coverage | `core` **99.98 / 99.95 / 100 / 99.98**, `cli` **100 / 100 / 100 / 100** -- unchanged: nothing under `src/` moved |
| new tests | **6684 -> 6691, +7**: the three authorities in one document, a finding named beside a round, a denial named beside a round, a closure that names nothing, the shipped split against the record's bullets, a citation behind a version, and a citation in the sentence after the closure |
| the lists | `## Open` **28 -> 29** (one opened, none closed), `## Closed` **56 -> 56**, one space of **85** ids with none missing |
| the records read | **220 -> 221** sections: **195 -> 196** under a round, **25** under none |
| the population | **212** round(s) + **1** addendum(s), **17** of them wrote none |
| the number line | **211** distinct numbers, dense: 94 in `v2`, 117 in `v3` (`v3.00`..`v3.117`) |
| the split | **44 / 9 / 3** of 56 in the record, **29 / 0 / 1** of 30 in the index and volumes -- was `56` and `30`, both under one authority's name |
| the index | **68,617 -> 69,456** bytes -- one entry in, and the stamp of the round that raised it |
| the record | **84,152** bytes over 56 entries, in **two** files |
| the volumes | **17**, and this round is the seventh in `volume-17.md` (**193,493** bytes of 200,000) |
| the falsifications | nine edits, **seventy-eight** reds |
| gate sites / scripts / throws | **144** / **67 of 98** / **99** -- no new exit and no new script |
| the budgets | **37** files state one -- unchanged: no test file was added |
| LLM calls | **0** |

### Left open

- The arm cannot see what a round changed, so a round that raises an entry writes no record and nothing says
  so. `[open: the closure side of this log names a round; the opening side names nothing, so "which round raised this" is a question the format cannot be asked -- and eleven of seventeen rounds are the evidence that it is asked of a reader instead]`
- The structural rule reads a table's first column, so a record that reorders its columns is a record to a
  reader and not to the guard. `[open: a record is found by the position of a cell rather than by the name in it, and 47 of 47 do not reorder -- a floor that a corpus of 555 tables could only be widened against by reading every one of them]`
- The suite's substring assertions were never censused. `[open: 589 read the two this arm had, and the shape is a count quoted by a toContain that a larger number's tail satisfies -- the population is every assertion in the suite that quotes a number, and no one has counted it]`

## v3.118 · the rule measured a heading in the unit it measured a paragraph, and the census was 240

`v3.117` closed with two paths: the census `O-085` asked for, and the skeleton no language reader in
this tree can see. Both were taken. The census produced a population and no defect; the skeleton
produced three defects, and they are the eighth round in a row where the fault was **a number and its
unit written in two places**.

### 1. Twenty-eight headings, and a reader that was green about all of them (finding 591)

The language reader's unit was one line in one file:

```js
export const HAN_RUN = /\p{Script=Han}{8,}/u;
```

and its header defends the eight by naming what this log legitimately quotes: a file name, a section
number, a term from a table -- *all of them two to seven characters*. That is true of a **citation**.
A heading is not a citation; it is the document's own skeleton, and what a half-translated document
leaves at the front of a skeleton row is a number:

```
### 一、an absence and an omission are the same bytes
### Two: the five cases that looked like they had a line
```

The first row holds **one** Han character. The second holds none. Neither can be a run of eight, so
the reader written to refuse a fourth Chinese round was green about **28** headings:

| volume | numbered in Han | a Han numeral | an English numeral and a comma | the separator that volume uses |
| --- | --- | --- | --- | --- |
| `volume-09.md` | 3 | 3 | 0 | `### One: ` |
| `volume-12.md` | 4 | 4 | 0 | `### One — ` |
| `volume-13.md` | 21 | 20 | 1 | `### One · ` |
| | **28** | **27** | **1** | |

The reader *had* an ATX branch -- a heading flushes the paragraph and is judged alone -- and that
branch called `scanParagraph([row])`, which used the one unit the module exported. A branch that knows
a heading is a different **shape** and measures it with the paragraph's **unit** is the same defect as
a counter that admits three authorities under one noun (finding 588): the shape was recognised, and
the measure taken was the measure of something else.

The unit is a parameter of the scan now, and the position chooses it:

```js
function scanParagraph(rows, pattern = HAN_RUN_ALL) { ... }
...
for (const hit of scanParagraph([row], HEADING_PROSE_ALL)) hits.push(hit);
```

The join, the line mapping and the `pairs` witness are written once, because they belong to the
paragraph rather than to the unit.

### 2. The comma no character class contains (finding 592)

One of the 28 is not a Han numeral at all:

```
### Five、What the gates cost to extend
```

`volume-13.md`, line 689. The word is English and the separator is `、`, so `\p{Script=Han}` matches
**nothing** in that row: narrowing the unit from eight to one would still have left it green. It is
the only row of its kind, and it is the clearest evidence of how the accident happened -- a volume
translated one heading at a time, numbering moved first and punctuation left behind.

Narrowing the unit alone would also have made the error line lie, which is the part this round found
by writing the fixture before the repair:

```
docs/…:689: `、` -- 1 Han character(s) of prose: this repository's documents are written in English …
```

`、` is not a Han character. So three statements changed with the unit: `HEADING_PROSE` includes
`\u3001`; the error line says `N character(s) of prose`, which is what it counts in **both** positions
(a run of Han in a paragraph, a character or a mark in a heading); and the summary says `run(s) of
non-English prose`, because a heading can be refused for a mark that is in no script at all.

### 3. A test that proved a break with a number that cannot move (finding 593)

`check-docs-language.test.ts` has a test whose comment shows it was written after a real bug in its
own fixture:

```ts
const dir = treeOf({ 'docs/page.md': `# Page\n\n${HAN(4)}\n## ${HAN(4)}\n${HAN(4)}.\n` });
expect(run(dir).status).toBe(0);
```

The rule is that a heading flushes the paragraph. The assertion is that no run of eight was found --
and **that assertion is true whether the flush happens or not**: `## ` stands between the characters
on either side of it and `#` is not Han, so no run crosses a heading in either implementation. The
fixture is four, four and four characters against a threshold of eight.

The reader already publishes the number that can tell the two apart -- `pairs`, the breaks that fell
inside a paragraph and were crossed:

| implementation | paragraphs | `pairs` |
| --- | --- | --- |
| a heading flushes (the rule) | `[3]`, `[4]`, `[5]` | **0** |
| a heading does not flush | `[3, 4, 5]` | **2** |

The test asserted the one number that cannot move, beside the one that can, on every run. It reads
the witness now, and the second half of the same statement came free with the new unit -- the heading
is reported as itself, on its own line:

```ts
expect(report.pairs).toBe(0);
expect(report.hits).toEqual([{ line: 4, text: HAN(4), length: 4 }]);
```

### 4. The census was 240, and every one of them moves (finding 594)

`O-085` had a premise and no population. The population, measured over both test roots:

| | |
| --- | --- |
| test files | **268** |
| `toContain`/`toInclude` with a literal argument | **2,736** |
| ... whose literal begins with a digit | **249** |
| ... not under `.not.`, which is satisfied by absence | **240** |
| ... a digit run followed by a word, so a count and its label | **211** |

Each of the 240 was mutated in place -- a `9` before its first digit, so `1 open with a reason`
became `91 open with a reason` -- and its file was run: **240 red, 0 green**. No assertion in this
suite is satisfied by a number it does not read.

That is the answer to the question `O-085` asked, and it is not the whole question. A substitution
proves an assertion depends on its digits; it cannot prove the digits belong to the subject the
sentence names. Finding 589's assertion was `toContain('0 closed by a finding')` against a line that
said `30 closed by a finding`; mutated to `90 closed` it goes red, because the line does not contain
it -- and it was still wrong, because its subject was the live list and the line counts the index and
its volumes. So `O-085` is narrowed rather than closed, and the narrowing is the finding.

### 5. This round's own defects

1. **A `--dry-run` flag that nothing read.** The relabelling script was written with an argument for
   previewing, and the script parsed no arguments -- so the first invocation previewed by rewriting
   the three volumes. The output was correct and the repair is the one the preview would have shown,
   but the shape is this round's subject exactly: **a name written beside a mechanism that does not
   read it**. The preview printed every line it was about to change, which is why the round could
   check the result rather than trust it.
2. **The first heading unit reported one hit per character.** `HEADING_PROSE` was
   `[\p{Script=Han}\u3001]`, so `## 本文本本` was four runs of one character and the count in the
   report was four sentences. A run is the unit everywhere else in this file; the heading's was
   changed to `+` before any test was written for it, so no assertion had to be weakened.
3. **A default argument is not a guard against an argument that arrives.** `hanRunsIn` called
   `paragraphsOf(rows).flatMap(scanParagraph)`, and the second argument of a `flatMap` callback is
   the **index** -- so the unit was `0`, `1`, `2`, every paragraph was scanned for the literal `0`,
   and both comment readers went silent. Four tests said so, two of them in the comment reader's own
   file, before this line was written.
4. **The mutation harness counted 249 targets and could judge 240.** Nine were under `.not.`, where a
   prefixed digit is satisfied by absence. The script excludes them and the finding states the
   exclusion, because a population that silently drops nine members is the shape finding 585 was
   about.
5. **The volume was split twice, and the second split overwrote the first.** `volume-17.md` crossed
   its budget by 5,437 bytes, the record was moved to `volume-18.md`, and then the open volume was
   found to be smaller than the index -- so six more rounds were moved into it, in a script that
   wrote `volume-18.md` from a list that did not yet contain the record it had just been given. The
   record was rebuilt from the round's own text and the split was redone from a backup. The rule was
   right both times; the second script assumed a state instead of reading one.

### 6. Falsification

Eleven edits, twenty-eight reds:

| edit | reds |
| --- | --- |
| a heading is measured in the paragraph unit again | 4 |
| the ideographic comma leaves the heading unit | 3 |
| the heading unit is one character at a time again | 4 |
| a chapter mark is left alone | 1 |
| a chapter mark followed by an Arabic numeral is refused too | 3 |
| the line calls it a Han character again | 5 |
| the summary counts a script again | 1 |
| the heading test asserts a status again | 1 |
| `flatMap` hands the index to the unit again | 4 |
| the witness is asserted as the wrong number | 1 |
| the heading is asserted as reported nowhere | 1 |

Both files were restored byte for byte (`diff -q` against the backup). The two language test files
are **101** tests.

### Readings

> Ledger for `v3.118`.

| item | value |
| --- | --- |
| `core` test suite | **257 files, 6700 tests passed** (at v3.118) |
| `cli` test suite | **4 files, 187 tests passed** (at v3.118) |
| repo test suite | **261 files, 6887 tests passed** (at v3.118) |
| coverage | `core` **99.98 / 99.95 / 100 / 99.98**, `cli` **100 / 100 / 100 / 100** -- unchanged: nothing under `src/` moved |
| new tests | **6691 -> 6700, +9**: a Han-numbered heading, the ideographic comma, an English heading under three separators, a quoted file name in a heading, a chapter mark with a Han numeral, one with an Arabic numeral, two characters as a heading and not as a sentence, the three volumes read clean, and both units stated |
| the lists | `## Open` **29 -> 30** (one opened, none closed), `## Closed` **56 -> 56**, one space of **86** ids with none missing |
| the records read | **221 -> 222** sections: **196 -> 197** under a round, **25** under none |
| the population | **213** round(s) + **1** addendum(s), **17** of them wrote none |
| the number line | **212** distinct numbers, dense: 94 in `v2`, 118 in `v3` (`v3.00`..`v3.118`) |
| the heading repair | **28** headings in **3** volumes -- **27** a Han numeral, **1** an English numeral and an ideographic comma -- and **4** pointers relabelled with them (**3** `§` references, **1** `一、`) |
| the census | **268** files, **2,736** literals, **249** starting with a digit, **240** outside a negation, **240 red**, **0 green** |
| the language reading | `docs:check`: **53** document(s), **0** run(s) of non-English prose, **40,370** row break(s) held inside a paragraph |
| the index | **69,456 -> 70,753** bytes -- one entry in and one entry rewritten |
| the record | **84,152** bytes over 56 entries, in **two** files |
| the volumes | **18**, and this round is the first in `volume-18.md` -- `volume-17.md` closed at **116,877** bytes with **13** rounds, and the six rounds before this one moved with it so the open volume is born larger than the index |
| the falsifications | eleven edits, **twenty-eight** reds |
| gate sites / scripts / throws | **144** / **67 of 98** / **99** -- no new exit and no new script |
| the budgets | **37** files state one -- unchanged: no test file was added |
| LLM calls | **0** |

### Left open

- The arm cannot see what a round changed, so a round that raises an entry writes no record and nothing
  says so. `[open: the closure side of this log names a round; the opening side names nothing, so "which
  round raised this" is a question the format cannot be asked -- and eleven of seventeen rounds are the
  evidence that it is asked of a reader instead]`
- The structural rule reads a table's first column, so a record that reorders its columns is a record to
  a reader and not to the guard. `[open: a record is found by the position of a cell rather than by the
  name in it, and 47 of 47 do not reorder -- a floor that a corpus of 555 tables could only be widened
  against by reading every one of them]`
- The suite's counting assertions are censused, and none of them is empty, and the question a census
  cannot ask is whether the number belongs to the subject the sentence names.
  `[open: 240 assertions whose literal begins with a digit, all of them red when the digit moves;
  finding 589's assertion passed that test and was still wrong, because its subject was the live list
  and the line counts the index and its volumes -- one assertion at a time, and no substitution
  reaches it]`
- One volume writes its sections two ways. `[open: volume-17.md holds 44 headings spelled "### One ·"
  and 42 spelled "### 1.", and the four volumes that came before it each chose a different separator;
  making the log agree with itself costs a renumbering of 86 headings and buys a form no reader in this
  tree keys on yet]`
