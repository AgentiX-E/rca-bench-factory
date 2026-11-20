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
| `core` test suite | **257 files, 6700 tests passed** (at v3.117) |
| `cli` test suite | **4 files, 187 tests passed** (at v3.117) |
| repo test suite | **261 files, 6887 tests passed** (at v3.117) |
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
| the lists | `## Open` **29 -> 31** (two opened, none closed), `## Closed` **56 -> 56**, one space of **87** ids with none missing |
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
- The local rehearsal's fourth step failed twice and passed three times, and nothing names why.
  `[open: pnpm lint alone is green in 4m20s and --only Lint is green in 4m18s, and CI's lint job is green on
  this tree, so the two reds are inside a seven-member aggregate that prints nothing when it exits 1 -- the
  step is printed and what it wrote is not, and a repeated run that captured each member's output would name
  the member in one pass]`

## v3.119 · A field named for a source answered no for two reasons, and the line read them as one

**Twenty-one of this tree's eighty-three CI steps are bounded by their job's budget. The gate's own
summary said they were not.**

The line it prints once per run had a clause that read `62 of 83 step(s) bounded`. Measured: **83 steps,
62 declaring a `timeout-minutes` of their own, 21 bounded by the job above them, 0 unbounded.** The
number was right and the noun was three times wider than it, so a reader who did the subtraction the
sentence invites -- 83 minus 62 -- was told that a quarter of the workflow runs with no ceiling at all.

### The value the noun inherited its defect from

Not the sentence. `stepsOf`, the reader that resolves every step's budget, wrote

```js
inheritedFrom: own === '' ? null : 'step',
```

for a field whose name is a **question about where a bound comes from** and whose two values answer a
narrower one -- *did the step write it?* The workflow has three answers and the value had two. A step the
job bounds and a step nothing bounds were the same `null`, so the summary could not print the second
number even if it had wanted to: the number did not exist anywhere downstream.

This is finding 588 one level down. There the noun was wider than the count; here the **value** is
narrower than its own name, and the count and the noun both inherited it.

### The second reader of the same value

`R4` refuses a job that bounds some of its steps and not the others, and it asked
`step.inheritedFrom === null`. Repairing the field alone would have silenced the rule: a mixed job's
inherited step would carry `'job'` and walk past a refusal written for `null`, with the rule still in the
file, still reached, still looking correct. The condition is `!== 'step'` now -- the rule's question is
*did this step declare one*, and the field answers *where did it come from*, two questions that were the
same expression only while the field had two values. `ci-budget.test.ts`'s mixed-job case is what holds
them apart, and it is the case that would have gone red.

### A superlative with no subject

The third defect was in the same clause one step further along, and it took a workflow this tree does not
have to see: one whose every step inherits its job's budget has no ratio to report, so `tightest.ratio`
stays `Infinity` and `tightest.name` stays `''`. The shipped module, run against a two-step fixture of
that shape, printed

```
check-ci-budget: OK — 1 job(s) recorded, 0 of 2 step(s) bounded, 2 min measured (as of run 41637098008);
bounds total 0 min; tightest  at unmeasuredx; no job leans on its own budget; ...
```

Two defects in one measured sentence, and the first is this round's subject seen from the other end:
`0 of 2 step(s) bounded` for a job that bounds both of them. The second is a superlative with an empty
subject and a unit with no number, which is the shape a reader skips -- and a clause a reader skips is a
clause that is not printed.

The branch that says so is written out now, because the state is reachable and is not an error:

```
no step carries a bound of its own, so nothing here is tight
```

### Three counts, because the reader's question has three answers

The clause publishes the partition rather than two of its terms, and all three are counted where the step
is seen rather than derived by subtraction (finding 588: a total summed from three counters cannot
disagree with them, and a total accumulated beside them can):

```
62 of 83 step(s) carry their own `timeout-minutes`, 21 are bounded by their jobs' budget, and 0 have none
```

What the repair does not change: `bounds total 305 min` still sums declared bounds only, because a job's
budget is not a bound any one step owns and counting it would charge the same twenty minutes once per
step; and the rules that size a bound against its measurement are untouched, because the population they
argue about is the sixty-two and always was.

### Falsifications

Seven edits to `scripts/ci-budget.mjs`, each a way the repair could have been written and not been one,
each followed by `test/ci-budget.test.ts` alone. The module was restored byte for byte after every run
(`git diff --stat` unchanged).

| the edit | reds |
| --- | --- |
| the field keeps two values, so a job-bounded step is filed with the unbounded ones | 2 |
| the field keeps two values the other way, so a step nothing reaches is called bounded | 1 |
| `R4` goes back to asking the field for `null`, which no inherited step carries now | 1 |
| the inherited population is counted as zero | 2 |
| the third number is assumed rather than counted | 1 |
| the empty-subject branch is removed, and the superlative prints with no noun again | 1 |
| the old clause comes back, counting one population under the noun of three | 5 |

**Thirteen reds across seven mutations.** The fifth is the one worth reading twice: it changes
`reached += 1` to `reached += 0`, which is the same shape as the defect -- a number that is stated rather
than measured -- and one case catches it, because that case counts the populations itself from the
workflow and compares the sentence against its own arithmetic.

### Readings

> Ledger for `v3.119`.

| item | value |
| --- | --- |
| `core` test suite | **257 files, 6704 tests passed** (at v3.119) |
| `cli` test suite | **4 files, 187 tests passed** (at v3.119) |
| repo test suite | **261 files, 6891 tests passed** (at v3.119) |
| coverage | `core` **99.98 / 99.95 / 100 / 99.98**, `cli` **100 / 100 / 100 / 100** -- unchanged: nothing under `src/` moved |
| new tests | **6700 -> 6704, +4**: the two populations of a bound, the step nothing reaches, the superlative with no subject, and the shipped workflow's partition counted on both sides |
| the rewritten cases | **2**: `stepsOf` reads an inherited bound as `'job'` rather than as none, and the cost line names both populations |
| the line | **8** job(s), **62** of **83** steps with their own bound, **21** on their job's, **0** with none, **305** min of bounds, **50** min measured, **7** reading(s) -- **5 of them** recomputed independently from `ci.yml` and `golden-master/ci-baseline.json` and agreeing, and the sixth (`62 of 83` under the old noun) being the defect |
| the lists | `## Open` **31 -> 31** (none opened, none closed), `## Closed` **56 -> 56**, one space of **87** ids with none missing |
| the records read | **222 -> 223** sections: **197 -> 198** under a round, **25** under none |
| the population | **213 -> 214** round(s) + **1** addendum(s), **17** of them wrote none |
| the number line | **212 -> 213** distinct numbers, dense: 94 in `v2`, 119 in `v3` (`v3.00`..`v3.119`) |
| the rehearsal | five runs of `install` / `build` / `typecheck` / `lint`: **three green** (lint **267**, **262**, **263** s) and **two red**, both on a tree carrying a deliberately red test, both attributed in **13** lines |
| the falsifications | seven edits, **thirteen** reds |
| gate sites / scripts / throws | **144** / **67 of 98** / **99** -- no new exit and no new script |
| the budgets | **37** files state one -- unchanged: no test file was added |
| LLM calls | **0** |

### A boundary found by the wrong anchor, in the writing of this section

The external tracker's round section was appended to `09-推进进度追踪.md` and then its trailing block was
replaced, and the replacement cut at `s.index('### 遗留')` -- **the first** `### 遗留` in a file whose every
round since v3.60 ends with one -- rather than at the last. The commit that carried it deleted 7,159 lines:
every section from `v3.112` to `v3.118`. The next commit restored the file from the previous revision and
re-applied the section, and the reading after the repair is **10** sections where the damaged file had **3**.

It belongs in this record and not in the audit log, because it is a defect in a script this round typed
rather than in the tree: the audit log's findings are about files the repository ships. What it shares with
them is the shape -- **a boundary found by the wrong anchor**, one occurrence instead of the last, which is
finding 590's subject (a citation window that ended at the wrong period) arriving in the written record of
the round that was about boundaries. The check is one line and neither script had it:
`assert '## v3.118' in out -- and the same assertion three paragraphs up would have caught this one.

### Left open

- The local rehearsal's fourth step failed twice at a settled tree, and five rehearsals of the same sequence
  have not produced a third. `[open: the aggregate has eight members and it is not mute -- a red in it named
  its claimant file, its test and its assertion in thirteen lines -- so what remains is the red that was not
  caused by a red tree, and the next one has to be read at the terminal, because `failureReport` names the
  step, the directory, the command and the exit code and nothing the step wrote]`
- The structural rule reads a table's first column, so a record that reorders its columns is a record to a
  reader and not to the guard. `[open: a record is found by the position of a cell rather than by the name in
  it, and 47 of 47 do not reorder -- a floor that a corpus of 555 tables could only be widened against by
  reading every one of them]`
- One volume writes its sections two ways. `[open: volume-17.md holds 44 headings spelled "### One ·" and 42
  spelled "### 1.", and the four volumes that came before it each chose a different separator; making the log
  agree with itself costs a renumbering of 86 headings and buys a form no reader in this tree keys on yet]`

## v3.120 · The second opinion had not been written for 65 rounds, and the rule that read it could not say so

**This tree's 215 round sections carry 12 closing readings. The newest is under `v3.54`, sixty-five rounds
behind the log's own end** -- and `R7`, the rule whose whole job is to compare the recording with the round
that reports it, was comparing it with that row.

### The measurement

`R7` refuses a recording older than the run the ledger's newest `| CI |` row reports. Its summary clause
printed, until this round:

```
the ledger's newest run is 42160224254; the recording (43720087959) is newer, 3 earlier row(s) name no run
```

Every number in that clause is true. The row is in `volume-11.md:1464`, under `## v3.54 — a job no run had
measured, and the budget only CI can spend`. Between that row and the end of the log there are **65 rounds**,
and **three CI runs** happened after the recording the clause calls "newer":

| | |
| --- | --- |
| round sections in `docs/progress/` | **215** |
| of them carrying a `| CI |` row | **12** |
| rows in total | **15** (3 name no run) |
| newest row | `volume-11.md:1464`, under `v3.54` |
| rounds after it | **65** (`v3.55` … `v3.119`) |
| CI runs newer than the recording | **3** (`44488303256`, `44513651597`, `44516888528`) |

So the rule was not wrong: it was reading a reference that had stopped moving. A recording from any run newer
than `42160224254` passed, however many runs had happened since -- and nothing in the tree could notice,
because the only thing `R7` looks at is the row, and a row that is never written is a row that never
disagrees.

### Why the row stopped

Not a decision. Volumes 12 through 18 contain **zero** closing readings, and volume 11 contains seven; the
convention was followed for a while and then quietly dropped, which is the shape every unread rule in this
repository has had: **a convention nothing reads is a convention that decays at whatever rate its author's
attention decays.** The row's own comment says what it is for -- "the ledger is where a round says which run
it ended on" -- and the reading of it here had no way to ask whether anybody still did.

### R11 -- the newest round ends on a closing reading of *this* workflow

Two clauses, both about the present rather than about the 203 rounds behind it. Backfilling those from memory
would be inventing provenance, which is the one thing a recording may never do, so the rule asks only what the
round being written can answer:

- **the newest round's section carries a `| CI |` row that names a run.** A ledger read with no row at all
  now refuses rather than returning early -- that early return is what made an empty ledger indistinguishable
  from an agreeing one.
- **that row states `**<n> of <m> jobs success**`**, with `m` equal to `ci.yml`'s job count and `n` equal to
  `m`.

The second clause is not decoration. This repository draws run ids from one sequence for **two** workflows,
and `ledger-runs.mjs` says so in a paragraph that was written precisely because it could not be enforced: "a
row labelled `CI` is assumed to cite runs of *this* workflow". Last round's report called
`44516888822` a CI run with "eight jobs". Measured:

```
44516888822  1 job    Round-trip a synthetic corpus in t...
44516888528  8 jobs   every proved exit can disappear wi..., injection batteries..., ...
```

One job, not eight, and it is the `Anchor round trip` workflow. The tally makes that mistake a refusal
instead of a paragraph: `**1 of 1 job success**` cannot pass a workflow that declares 8.

### The recording was not merely stale -- it was hiding three bounds

`measure-ci-baseline.mjs 44516888528` rewrote the recording, and the gate immediately refused **three**
steps:

| step | bound | newest day | ratio | what it was sized on |
| --- | --- | --- | --- | --- |
| `Install a backend this repository did not write` | 16 min | **888 s** | **1.08x** | a 648 s cold-runner day, when the slowest it had seen was 273 s |
| `Every gate can be shown to fail` | 9 min | **295 s** | **1.83x** | 254 s, three rounds ago |
| `Gate-test battery (…)` | 8 min | **250 s** | **1.92x** | 231 s, the run the recording held |

The multiple is two, and each of the three was under it. Nothing had changed in `ci.yml`; the day these bounds
were written against had simply been replaced by a slower one, and the recording was three runs behind the
tree. **A recording that is never refreshed is a set of bounds that are never asked the question**, and the
decayed ledger is what kept the question from being asked.

The repairs are the arithmetic the rules already demand:

- the install is a mirror step, and its spread is now **17 s to 888 s -- 52x**; a bound that cannot hold a bad
  network day reports slowness as a hang, so 16 minutes became **30** (2.0x the slowest day) and the
  `backend` job's ceiling moved **34 -> 48** (the floor's 15 + 30 + the reader's 3);
- `Every gate can be shown to fail`: **9 -> 10** minutes (2.03x);
- `Gate-test battery`: **8 -> 9** minutes (2.16x).

The rest of the workflow's bounds moved with the recording, and the summary's `bounds total` and `measured`
are recomputed from it rather than typed.

### Falsifications

Seven edits, each a way the repair could have been written and not been one, each followed by
`test/ci-budget.test.ts` and `test/ledger-runs.test.ts` alone, with the two modules restored byte for byte
after every run.

| the edit | reds |
| --- | --- |
| the newest round is allowed to end with no row, which is the state the log was in | 3 |
| a row that names no run counts as the round having ended | 1 |
| the tally is not required, so `**five jobs green**` closes a round | 1 |
| `m` is compared with nothing, so a one-job run passes a workflow with eight | 1 |
| `n` is not compared with `m`, so a red job passes beside the word success | 1 |
| the section index is dropped from the reader, so a row is read and its position is not | 10 |
| the empty ledger returns early again, which is the pre-repair shape | 1 |

**Eighteen reds across seven mutations.** The sixth is the one worth reading twice: it leaves every rule
intact and removes only the *index*, and ten cases catch it -- three in the reader's own file, seven where the
rules ask a log a question the log can no longer answer. "This log has rows" and "this round has one" are two
facts, and the second is the one the rule needs.

### Readings

> Ledger for `v3.120`.

| item | value |
| --- | --- |
| CI | run `44516888528` on `f733160b`: **8 of 8 jobs success** -- `every proved exit` **7.1**, `injection batteries (two probes)` **13.4**, `cold tree` **0.4**, `build / typecheck / lint / coverage / mutation` **7.8**, `every proved exit (shard 2)` **11.2**, `a backend this repository did not write` **15.3**, `golden master` **0.9**, `injection batteries (one step each)` **14.1** min; **15.3 min of wall clock** |
| `core` test suite | **257 files, 6715 tests passed** (at v3.120) |
| `cli` test suite | **4 files, 187 tests passed** (at v3.120) |
| repo test suite | **261 files, 6902 tests passed** (at v3.120) |
| coverage | `core` **99.98 / 99.95 / 100 / 99.98**, `cli` **100 / 100 / 100 / 100** -- unchanged: nothing under `src/` moved |
| new tests | **6704 -> 6715, +11**: three for the reader's section index, and eight for `R11` -- a round with no row, a row that names no run, a row with no tally, a tally counting the wrong number of jobs, a tally whose successes fall short, a caller with no sections, an empty ledger, and the gate driven end to end |
| the rewritten cases | **1**: the empty-directory shape now carries `sections: []` |
| the ledger | **15 rows -> 16**, the newest in the newest round; **12 -> 13** round sections with a reading; the **65** rounds behind it stated rather than backfilled |
| the recording | `43720087959` -> **`44516888528`**: **8** job(s), **83** step(s), **3** CI runs newer than the one it replaced |
| the bounds | 3 steps raised (**16->30**, **9->10**, **8->9** min), 1 job ceiling (**34->48**); the partition still **62 of 83 / 21 / 0** |
| the readings | **7 -> 8** day(s) in `ci-readings.json`; the slowest day of the install moved **273 -> 888 s** |
| the budgets | **37 -> 39** files state one -- `export-surface-enumerated.test.ts` (**1 049 ms**) and `gate-steps.test.ts` (**1 398 ms**), both at **4 000 ms** -- and one raised: `step-process.test.ts` **4 000 -> 6 000** ms, 2.1x the slowest of its three readings |
| falsifications | seven edits, **eighteen** reds |
| the number line | **213 -> 214** distinct numbers, dense: 94 in `v2`, 120 in `v3` (`v3.00`..`v3.120`) |
| LLM calls | **0** |

### The first rehearsal failed at step 8, and it was right

`verify:local` ran 35 commands over 1h 3m and came back `FAILED at 8/35`: `check-test-budgets` refused
two files, `export-surface-enumerated.test.ts` at **1 049 ms** and `gate-steps.test.ts` at **1 398 ms**,
neither of which states a budget -- so their verdicts were being decided by vitest's 5 000 ms default. The
second is this round's own doing: the case that reads the runner's plan grew a comment and a ceiling, and
the file crossed the 1 000 ms floor with it. The repair is the one the rule asks for and the one finding 578
established: a `SUITE_BUDGET_MS` of **4 000** on the suite (2.9x and 3.8x the two readings), stated on the
describe that holds the slow case rather than on the case, because a stall does not respect test boundaries.

The step was then run alone -- `verify:local --only "Every test's cost against the budget it declares"`
-- and came back `OK (1 command(s), 1 of the 48 local steps)`. The full rehearsal was run again.

It failed at step 27, and again on something this round had moved: `check-repository-table` said the
repository row held `113,595 core` test lines while the tree held **113,615**, because the count was taken
before the two `SUITE_BUDGET_MS` blocks added twenty lines. That is the shape finding 586 recorded -- *a
number derived before the change it describes* -- arriving in the round that keeps telling other rounds
about it. The count is taken from the tree now.

The third rehearsal ran **1h 2m** and failed at step 8 for a reason that had nothing to do with the tree:
`step-process.test.ts` measured **2 873 ms** against its 4 000 ms budget (0.72) and
`typecheck-entrypoint.test.ts` **15 376 ms** against 30 000 (0.51). The same tree had produced **1 635 ms**
for the first of them an hour earlier, and a re-taken report produced **2 091 ms** -- three readings of one
file, spanning 1.76x, on a box that is four cores inside a shared host (the load average was **6.9** while
the rehearsal ran, against 1.2 when the quiet reading was taken). The budget is **6 000** ms now, 2.1x the
slowest of the three and 6.4x the isolated one; the ratio rule that demanded it is `O-090`.

### Left open

- Two hundred and three rounds before this one carry no closing reading, and 12 of 215 do. `[open: the rows
  are the only place a round says which run it ended on, and backfilling them would name runs nobody
  recorded -- the rule is about the present, and the gap is a fact about the past that the summary now prints
  as a distance in rounds]`
- The budget rule divides by a reading the box decides, and this box is shared. `[open: one file measured
  1 635, 2 091 and 2 873 ms within an afternoon as the host's load average moved from 1.2 to 6.9, so a budget
  that satisfies 2x on a quiet box fails on a loaded one -- and the repair is a number that ratchets with the
  box rather than a property of the test]`
- The install step's spread is 52x and a bound can only sit above it. `[open: 17 s to 888 s is the mirror, not
  the step, and no `timeout-minutes` can tell a slow mirror from a hang -- the bound now covers the worst day
  seen, and the day that is slower than 888 s will raise it again]`

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
| CI | run `44752384940` on `8a7c9b68`: **8 of 8 jobs success** -- the newest run, and the one the recording is taken from |
| `core` test suite | **258 files, 6771 tests passed** (as of this commit) |
| `cli` test suite | **4 files, 187 tests passed** (as of this commit) |
| repo test suite | **262 files, 6958 tests passed** (as of this commit) |
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

