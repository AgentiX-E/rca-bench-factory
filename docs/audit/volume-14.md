# Audit · volume 14

Findings 579–632, from the rounds recorded in `progress/volume-17.md`, `progress/volume-18.md` and
`progress/volume-19.md` as `v3.115` through `v3.138`.

## Finding 579 — the refusal for a third spelling was written as a prefix of the first two

v3.63 found that the record had gained a suffix at v3.45 and that nineteen tables had left the
guard's reach, and answered with two spellings, a reader for the table form, and a refusal for *any*
third spelling. The refusal is four lines in the shape of one:

```js
const NEARLY = /^#{2,3} (?:Open|Left open|Closed)\b/;
```

`Left open` is a string here, and a pattern built out of it matches a heading that **begins** with
it. The corpus's next two renames kept no prefix. `### Leftovers, in the order that reaches the goal`
begins with `Left`, which is not `Left open`, and `### What is left, in the order it has to happen`
begins with `What`. Both were written by rounds that believed they were writing the record. Neither
was refused, and neither was read.

### The measurement that makes it a defect rather than a name

| spelling | rounds | form | rows | read before v3.115 |
| --- | --- | --- | --- | --- |
| `### Left open` | 145 | entries | -- | yes |
| `### Left open, in the order the goal is reached` | 25 | table | 188 | yes |
| `### Leftovers, in the order that reaches the goal` | 17 | table | 106 | **no** |
| `### What is left, in the order it has to happen` | 5 | table | 24 | **no** |

The property that makes the last two a record is not the name. It is a table whose first column is
`priority`, and the corpus is unambiguous about it: of **555** tables in the progress corpus, **47**
begin with that column, and every one of the 47 is a round's record. The guard counted 25 records and
188 rows. The corpus held 47 and 318.

Twenty-two records of 217 were in the difference. The oldest of them was written by `v3.81` and the
newest by `v3.102`, so between those rounds the record of *the round being written* was, half the
time, a section the guard did not know existed.

### What the silence cost, beyond the count

Nothing in the output said a record was there. The 22 sections' rows were not counted, their columns
were never compared with the vocabulary, and every refusal written for a record's shape was
unreachable over them — which is how finding 580 and finding 581 came to be defects that stood in
the unread half for as long as it was unread.

The arm's population is the sharper cost, because a number in a rule is a claim. Finding 575 added
"a round has one record" and measured it as *"0 of 195 shipped rounds wrote two"*. **195 is the
number of records the arm could see.** The corpus names **210 rounds** and holds **217 record
sections**, of which 192 belong to a round and 25 do not, and **18 rounds wrote no record at all**.
The claim survives — no round owns two of the 217 — but its denominator was the arm's own
population, which is the defect the arm exists to refuse, one level up.

### The fix

Two things, and the second is what makes the first durable.

1. **The names the corpus used join the table.** All four are read, each with its count in the
   comment, because a name is a fact about the corpus rather than a convention the guard may grant
   itself.
2. **The refusal moves onto the body.** `recordTableUnderUnknownHeading` reads the document's
   tables and asks the one question a name cannot lie about: is the first column `priority`? A table
   under a heading `spellingOf` does not read is refused, with its row count in the sentence. On this
   corpus the rule fires 47 times with the names taken out of the table and 0 times with them in,
   and it has no false positive: no other table in the corpus begins with that column.

The first form of the rule took the body a `##` heading *spans*, which is what `sections()` means by
a span — and reported every round in the corpus as an orphan, because a round heading is `##` and its
record is `###` underneath it. Thirteen tests said so on the first run. The scope is one line and it
is the whole of the function: **a table belongs to the heading directly above it**, whatever the
level.

### What it does not claim

The rule reads `priority` as a table's **first** cell, so a record whose columns are reordered is a
record to a reader and not to this rule. None of the 47 reorders them, and the item is read from the
column its header names now rather than from the second position (finding 580), so the guard would
read such a record correctly if it saw one. What is missing is the seeing. It is entry 82 in the
live list.

## Finding 580 — the unread half held two defects the guard has diagnostics for

A refusal that cannot be reached is not a rule, and this is the pair that proves it over this corpus.

### The row with five cells in a four-column table

`progress/volume-16.md:1210` is a row of a `What is left` table whose last cell names the YAML block
scalar as `` `run: |` ``. A pipe inside a Markdown table cell separates the cells, including inside a
code span — GFM requires the escape — so that row renders as five cells under a four-column header,
and the text after the pipe lands in a column the table does not have. `tableShape` has a refusal for
exactly this:

```
has 5 cell(s) under a header that names 4, so every cell after the short one sits in the wrong column
```

The refusal has existed since v3.64, the row was written by `v3.98`, and the section it sits in was
one of the 22 that finding 579 made visible — so for the seventeen rounds the row existed, no run
over this corpus reached it. It is repaired by escaping the pipe, which is the form GFM asks for and
the form the reader had to learn: finding 581.

### The column with two names

| the fourth column | records | rows |
| --- | --- | --- |
| `next step` | 42 | 294 |
| `next` | 5 | 24 |

`COLUMNS` is the vocabulary a record's header is held to, and it had one word for that column. The
five records that spell it `next` were written by `v3.99` to `v3.102`, and a guard that read them
would have refused five frozen sections for a rename no round may repair. So the second spelling is
**published** rather than granted — one column, two names, with the counts above in the comment and
in the diagnostic, which now names both (`and not \`state\``, `\`next step\` or \`next\``).

### The noun that was checked and the position that was used

The shape check asks whether the header *names* the four columns, and the row arm then took the item
cell by **position**:

```js
items: (shape.rowLines ?? []).map((row) => cellsOf(row)[COLUMNS.indexOf('item')] ?? '')
```

A record that named its columns in another order passed the check — the names are all there — and had
its item read out of whatever sat second, which for a reordered table is the priority. Zero of the 47
records reorder them, so this is a floor and not a repair; it is the same defect the twenty-character
ruler was, one field over: a rule that asserts a name and then uses a position is asserting nothing.
The read is `shape.header.indexOf('item')` now, and the fixture that drives it reorders the header and
makes the arm resolve the row against a live entry.

## Finding 581 — the remedy its own diagnostic asks for was a form the reader could not read

`cellsOf` split a row on every pipe:

```js
line.trim().replace(/^\|/, '').replace(/(?<!\\)\|$/, '').split('|')
```

The two `replace` calls show the author knew a pipe can be escaped — the last one refuses to strip a
`\|` from the end of a line — and the `split` undoes that knowledge three characters later. The
consequence is a closed loop: a cell cannot hold a literal pipe except by escaping it, and an escaped
pipe was counted as a separator, so the refusal of finding 580 asked for a repair it would refuse
again. Both halves of `volume-16.md:1210` were unreachable, the unescaped row *and* the repaired one.

Measured before the repair: **0** of the corpus's 318 record rows used `\|` — and the escape is not a
hypothesis, because the tree writes it: a three-column prose table in `v3.82` names
`order\|cpu\|>=\|high\|count/min`, six escaped pipes in one cell, and the old reader counted it as
**eleven** cells. **1** record row held an unescaped pipe inside a code span, the row of finding 580.
So both halves of that one row were unreachable, the unescaped row *and* the repaired one, and the
prose table shows what would have happened to a record that was written correctly: eleven cells under
a three-column header, refused for being right.

Measured after: the repaired row holds `\|`, the escape is undone in the cell (a cell's `state` is
read as prose, and `\|` is how a pipe is written rather than what the sentence says), and the guard's
own count of record rows is 318 rather than 313 — the five rows of the refused table had been dropped
from the total, which is what a refused table does to a census that adds after the refusal.

The stated limit is a cell whose text genuinely ends in a backslash: that backslash is read as
escaping the pipe after it. No row in the corpus does, and Markdown has no spelling for it — `\\|`
separates the cells too.

## Finding 582 — the round that explained the arm's row rule explained it with a rule the arm had replaced, and the reason its own table was quiet was the name

The record of `v3.81` is a `Leftovers` table with a plain `priority` column, and it says why:

> The priority column is plain rather than bold, and that is not typography: `**P0**` in the first
> cell of a row is what `check-open-list.mjs` reads as a *table-form record's row* […] A bold cell
> here would be counted by the arm that asks whether a record's rows quote a live entry […] Round
> `v3.80` wrote the same table under the same heading with bold cells, which is how the difference
> was found: the count of bold priority rows in the corpus stopped equalling the count the guard
> printed.

Four claims, and the corpus refutes all four.

| the claim | the measurement |
| --- | --- |
| a bold first cell is what the guard reads as a row | the guard stopped reading cells at v3.63 and reads the section's heading and the pipe lines under it; `grep bold scripts/check-open-list.mjs` returns nothing |
| a bold cell there would have been counted by the arm | no cell of that table was counted, bold or plain: the heading is one of the 22 (finding 579) |
| `v3.80` wrote the same table under the same heading | `v3.80` wrote **no** record section, which is true of 18 of the corpus's 210 rounds |
| a count of bold priority rows stopped equalling what the guard printed | the guard has never printed that count, and a bold-cell census finds **188** rows where the structural one finds **318** |

The fourth row is the one that had readers. `acceptance.md` derives the table-form record's row count
"from the content (a record's first cell is a bold priority)" and holds it against the guard's
structural count; the test named `reads the shipped corpus as 147 rows` derives it the same way. Both
agreed with a population that was 22 records short, and the convention they were built on — a bold
first cell — is true of 188 of the corpus's 318 record rows, because the 130 rows in the renamed
records name a **plain** priority, which is exactly what the paragraph above explains.

### The repair

The paragraph is rewritten to what the corpus says: the guard reads no cell, so nothing about the
markup protected that table; what kept it quiet was its name; the guard has never printed a count of
bold rows; and `v3.80` wrote no record to compare with. The acceptance bullet keeps its dated number
and gains the measurement that shows what the derivation covered, and the test derives the count from
the structure — the rows under a table whose first column is `priority` — and holds the bold-cell
census *below* it, so the 130 rows stay a reading rather than a memory.

### What it does not claim

The paragraph's advice still holds for the table it is about: a record written with bold priorities
is read as a record's rows by the arm, once its heading is one the guard reads. What was wrong was
which of the two kept that table out of the arm's reach, and a round that explains the wrong cause
leaves the next round looking in the wrong place — this one looked for twelve rounds.

## Finding 583 — the eight derived numbers were typed beside a tree that did not hold the file they counted

`## Repository` is a table of eight numbers, and since v3.80 every one of them is derived by
`scripts/check-repository-table.mjs` and refused when it drifts. This round added a file --
`docs/audit/volume-14.md` -- and published the eight rows from the tree that did not yet contain it.

The row that could see the difference is `Tracked files`, which is `git ls-files`: **666** while the
file was untracked, **667** in the commit that holds it. So the guard passed on the working tree and
failed on the commit of byte-identical content:

```
  - ## Repository says '666' for Tracked files; the tree says '667'
```

The guard has a mode for this and its own comment says why it exists: `--write` refuses to publish
while a file exists that the index does not hold, because "the tree it was just rewritten from" has to
be the tree the commit will contain (v3.83, published 638 for 639). The round did not use it. It
edited prose by hand, which is the one thing a derived table cannot survive: seven of the eight
numbers were readings and the eighth was a memory.

### The repair is the guard's output, and it moved a second row

Re-derived, `Tracked files` is **667** and `Test lines` is **112,744** -- the 25 lines of the comment
that finding 584's repair added. The second number is the point: a hand edit repairs the row it was
made in and leaves the next reader to discover that the table was not derived.

### What it does not claim

That the row is wrong to count the index. It counts tracked files and its label says so, and the mode
that publishes it refuses until the index and the worktree agree; what was missing was the round's use
of that mode, not the guard's definition. The consequence is recorded in `acceptance.md`: a receipt is
filed for the committed tree, because two of these eight rows can only be checked after the commit.

## Finding 584 — a second file crossed the budget floor, and what moved between the two runs was not the tree

The same two runs, the other direction. `battery-witnesses.test.ts` holds 17 tests and every one of
them spawns `python3` and waits, so the cost is the machine's rather than the file's. The slowest --
*reads the transform failure out of the bytes CI produced*, two spawns -- reads **150 ms** alone and
**1,085 ms** inside the coverage suite, where it shares four cores with 260 other files: 7.2x for two
process launches.

The rule refuses a file with no declared budget whose slowest test reaches **1,000 ms**, because the
default that decided the verdict is vitest's 5,000 and the file never wrote it:

```
check-test-budgets: battery-witnesses.test.ts: its slowest test takes 1085 ms and the file states no
budget, so its verdict is decided by vitest's 5000 ms default; state one on the suite
```

The first run of this round's content passed this gate; the second failed it seventeen minutes later.
Nothing about the file changed -- a comment was added to a different file. **finding 578 recorded this
exact shape one round ago**, which is the finding's real content: a floor whose false positives are
answered by a declaration will keep naming files, one run at a time, because what crosses 1,000 ms on
a four-core box is decided by what else is running.

### The reading, and the number chosen from it

| reading | value |
| --- | --- |
| the file alone | **150 ms** |
| the same test in the coverage suite | **1,085 ms** |
| the rule's floor | 1,000 ms |
| vitest's default, which decided the verdict | 5,000 ms |
| stated | **4,000 ms** -- the rule reads it as "the slowest test may take 2,000": 1.8x the suite's reading, 13x the isolated one, and below the default |

Files that state a budget: **36 -> 37**.

### What it does not claim

That 4,000 is this file's cost. It is a number about a clock on a box, and what can refute it is a
reading above 2,000 ms inside the suite -- which would be a report to act on rather than a red to
retry. It also does not make the file cheaper: seventeen `python3` launches are what these tests are.

## Finding 585 — the population line subtracted a count of names from a count of headings

`check-open-list.mjs` prints, on every run, how many records the corpus holds and how many rounds
wrote none. The line read:

```
check-open-list: 218 record(s): 193 under a round and 25 under none; 211 round(s), 18 of them wrote none
```

Two of those five numbers are right by construction and add up (193 + 25 = 218). The fourth and the
fifth are not a pair at all:

```js
`${String(rounds.length)} round(s), ${String(rounds.length - recordRounds.size)} of them wrote none`
```

`rounds` holds one entry per **heading** matching `^## (v\d+\.\d+)\b`, and `recordRounds` is a `Set`
of round **names**. The corpus repeats one number:

```
docs/progress/volume-04.md:1059: ## v2.15, addendum — the gate I ran could not fail
```

so the subtraction counted the repetition as a round that wrote nothing, and the answer -- 18 -- is
neither the number of headings that wrote none nor the number of rounds that did:

| what is counted | judgement | value |
| --- | --- | --- |
| headings matching `ROUND` | `/^## (v(\d+)\.(\d+))\b/` | 211 |
| distinct round numbers | `new Set(...)` | 210 |
| names that wrote a record | `recordRounds.size` | 193 |
| names that wrote none, counted | `ascending.filter((r) => !recordRounds.has(r.round))` | 17 |
| names that wrote none, subtracted | `rounds.length - recordRounds.size` | 18 |

### The second derivation, which the corpus already had

A count this log trusts is one derived twice, and this one needs no heading: the numbers are dense.
`v2.06`..`v2.99` is 94 slots and `v3.00`..`v3.115` is 116, all occupied -- 210, which is what the
headings say once the addendum is set aside. The duplicate is therefore not a curiosity but a
counter-example, and it is the only one.

### The repair

An addendum is a section of its round (`ADDENDUM`), it is in the owner table so a record below it
finds its round, and it is not in `rounds`. Three rules then hold the number line: a number headed
twice is refused, a gap inside an era is refused, and an era must begin at `.00` and be the next one.
The population line counts instead of subtracting, and prints the addenda beside the rounds:
`211 round(s) + 1 addendum(s), 17 of them wrote none`.

The first version of the density rule assumed a two-digit minor field and refused the shipped corpus
on its first run -- `the round numbers go from v3.99 to v3.100, so 0 number(s) in between name no
round`. A refusal about a gap that reports zero missing numbers is the rule describing its own
mistake, and this corpus is where `v3` passed its hundredth round while `v2` stopped at `v2.99`.

### What it does not claim

That 211 was never a fact. It was a count of headings, which is what the volume gate asks for and what
its own table lists. What it was not is a count of rounds, and the line said rounds.

## Finding 586 — the record's fifth name was in the form the body rule did not read

`### Not fixed here` -- `docs/progress/volume-04.md:1104`, `v2.15`'s addendum -- holds two entries:

```
- **`check-no-mock` still reads comments as code.** `[open: the alternative is a comment stripper ...]`
- **The verification recipe is still prose.** `[open: nothing in the repository states how to check ...]`
```

It is a record to any reader. To the guard it was a heading no table of names held, in a document
whose body rule -- added one round earlier -- asks whether a table's first column is `priority`. A
record written as bullets has no first column, so that rule could not see it: the shape space has two
halves and v3.115 covered one.

Because the section sits under the addendum, the round it belongs to was in the population line as a
round that wrote nothing, while it wrote two promises -- the 18th of the eighteen `O-083` was opened
for.

### Measured before granted

The question "which sections hold a bullet with a reason" answers 202, and almost every one of them is
prose around an entry -- a paraphrase, a quotation, the round's own account. The question a name cannot
lie about is whether the section is **nothing but** entries:

| predicate over the progress corpus | sections |
| --- | --- |
| a level-2 or level-3 section whose name is none of the five | 1,311 |
| … holds an entry that carries a reason | 202 |
| … and holds no prose at column zero | 1 |
| … and at least one of those entries is unstruck | 1 (`### Not fixed here`) |

The strike test is the corpus's own definition of a closure (`CLOSED`, finding 458), so this is one
predicate asked a second question rather than a second predicate.

### The line between reading a body and refusing a name

`### Open` is the name the volumes used for the record until finding 207 renamed it, and `NEARLY`
refuses it. With a body rule, that heading *has* a reader, and the first version duly adopted it --
turning the diagnostic beside it into a false sentence ("a list written under it would have no
reader") and taking the rename rule's only enforcement with it. The resolution keeps the refusal: a
heading that begins with a list name and is none of them is refused, not read.

### What it does not claim

That the name table is now complete. It claims that a record written as a list is found by its shape,
whatever the next rename calls it, and that the shape is one section of this corpus wide.

## Finding 587 — eleven of the seventeen rounds that "wrote none" had opened an entry

`O-083` said the absence was undecidable: a round with nothing left open and a round whose record was
filed elsewhere produced the same number. Reading the seventeen, in their own ledgers, splits them
three ways:

| what the round's own ledger says | rounds | count |
| --- | --- | --- |
| it opened at least one entry | `v3.70`–`v3.77`, `v3.79`, `v3.80`, `v3.107` | 11 |
| it closed one and filed nothing | `v3.78` -- "closed in this same round rather than filed" | 1 |
| nothing about the list at all | `v2.39`, `v3.103`–`v3.106` | 5 |

Eleven rows like this one:

```
| list | **20 -> 21**: one closed, two opened |
```

A round that raises a residual has left something open by construction, so for eleven of seventeen the
record is **missing rather than empty**, and the neutral reading the line published was wrong for them.
The one that supports it says so in prose; the five that are silent are the only ones the arm genuinely
cannot judge.

### Why no rule came out of it

The signal is a **diff**, and the corpus holds a state: `## Open` is the list as it stands, and what a
round did to it exists in git. An entry carries an id and a reason and no round, while a closure
carries the finding that closed it -- so the owner of a residual is recorded at the moment it stops
being open, never at the moment it starts. That is `O-084`, and the format change it needs is not one
this round could take.

### What it does not claim

That the eleven are defects to repair. Their records are frozen and nothing may append to them. What it
claims is narrower and about the arm: the number it printed as a reading was, for eleven of seventeen,
a report of something absent that the round itself says was there.

## Finding 588 — the line said "by a finding" and counted three authorities

`check-open-list.mjs` closes every run with a population line, one per document it reads:

```
check-open-list: OK (601 entry(ies) across 221 section(s) of docs/progress.md and its volumes:
                  571 open with a reason, 30 closed by a finding)
check-open-list: OK (56 entry(ies) across 2 section(s) of docs/progress/closed.md and
                  docs/progress/closed-02.md: 0 open with a reason, 56 closed by a finding)
```

`closed` is a single counter, incremented by one branch, and that branch accepts **three** authorities.
The guard's own docstring has said so since the round that tightened the rule: a closure may name a
**finding** (`Closed by finding 170`), a **round** (`Closed by Pass 15`, `Closed by v3.78`, because this
log names rounds in two eras), or **explicitly not a finding** (`Closed without a finding: …`,
`Closed in this pass …`). One pattern matched all three -- `finding\s+\d+|Pass\s+\d+|v\d+\.\d+` -- so
the counter could only ever be the count of the three together, and the noun beside it was the name of
one.

Read over the record, the noun is false for **thirteen of fifty-six**:

| authority | how the record says it | closures |
| --- | --- | --- |
| a finding | `**Closed by finding 573.**` | **43** |
| a round | `**Closed by v3.78**`, `**Closed by Pass 15**` | **10** |
| not a finding | `**Closed without a finding:** the fix was in a scratch helper outside this tree` | **3** |
| | | **56** |

The three denials are `O-032`, `O-033` and `O-036`, and they are the clearest evidence: their own words
are *"closed without a finding"*, and the line counted them into "closed by a finding". The index's
line has the same shape and one instance -- `Closed in this pass by the run itself` in `volume-03.md` --
so the whole corpus is **73 findings, 9 rounds and 4 denials**, published as **86 closed by a finding**.

### Why nothing went red

Two numbers were held to the corpus by the suite, and neither question is about a noun. `entries` is
asserted to be `open + closed` -- arithmetic, which is exactly what the line gets right -- and `closed`
is asserted to be greater than zero, which is non-vacuity. A count can be arithmetically perfect and
still be published under the wrong name; that is the defect, and the test was asked the two questions
that cannot see it.

### The repair

The three authorities are decided where the closure is accepted, in the order the docstring states them,
and the caller counts which one answered. **A finding outranks everything**, because it is the only
authority a reader can check against a heading -- a round named in the same sentence (`Closed at v3.97
by finding 540`) is where it was filed, not what closed it. **A denial outranks a round**, because it is
the writer's explicit sentence and a version number in the sentence that follows it is not a closure.
The total is now the **sum** of the three rather than a fourth count beside them, so a total that
disagreed with its parts cannot be produced, and the parentheses publish the split:

```
... 571 open with a reason, 30 closed (29 by a finding, 0 by a round, 1 without one)
... 0 open with a reason, 56 closed (44 by a finding, 9 by a round, 3 without one)
```

The forty-four is finding 590's; it was forty-three until a window was repaired in the same round.

### What it does not claim

That a closure's third authority is true. An entry that says no finding closed it is reporting on work
outside this tree -- a workflow, a scratch helper -- and no reader of this corpus can check that. What
is claimed is the property the line publishes about itself: that each number names the authority it
counted, and that the total is those numbers added up.

## Finding 589 — an assertion of zero that was the last digit of thirty

In `check-open-list.test.ts`, in the test that reads the shipped record and the live list as one corpus:

```ts
const index = shipped.stdout.split('\n').find((one) => one.includes('of docs/progress.md and its volumes:'));
expect(index).toContain('0 closed by a finding');
```

The comment above it read *"every entry it holds is open, because a struck one is refused above. A zero
here is the split, stated where a reader of the gate's output sees it"*. The line it read says **30
closed by a finding**. `30 closed by a finding` contains `0 closed by a finding`, so the assertion
passed -- and passed for every round since it was written, because a substring cannot tell a number from
the last digit of a larger one.

The comment was wrong twice. The line is the index **and its seventeen volumes**, not the live list, and
the volumes' records close thirty entries: the count was never meant to be zero. So the assertion was a
claim about the wrong subject that happened to be satisfied by the right number's tail. Finding 588's
repair is what exposed it -- the noun changed, the substring vanished, and the test went red for the
first time.

### The repair

A count in a sentence is the number between a delimiter and its label, so the suite reads one that way:

```ts
function countIn(line: string, label: string): number {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const found = new RegExp(`(?:^|[^\\d])(\\d+) ${escaped}`).exec(line);
  expect(found, `no count stands in front of "${label}" in: ${line}`).not.toBeNull();
  return Number((found ?? [])[1]);
}
```

It reads 30 out of ` 30 closed`, 130 out of ` 130 closed`, and it cannot read a zero out of either. Two
places use it now: the record's line is held to the bullets the record holds, and the index's line is
held to its own arithmetic -- `entry(ies) = open with a reason + closed` -- which is the one property
that line publishes and the one the old assertion was standing in front of.

### What it does not claim

That this was the only substring assertion of its kind. It is the one this arm had; the same shape --
`toContain('0 …')` satisfied by a number ending in zero -- is possible wherever a test reads a count out
of a sentence, and this round did not census the suite for it.

## Finding 590 — a sentence ended at the period in `v3.81`

The citation pattern was

```js
const CITED = /(?:Closed|Narrowed|Retracted)\b[^.]{0,120}?\b(?:finding\s+\d+|Pass\s+\d+|v\d+\.\d+)/;
```

and `[^.]` is not "one sentence": it is "no full stop", in a corpus whose nouns include version numbers.
`O-057` closes like this:

```
- O-057 · **~~The modality comparison holds two maps of every row's signature.~~ Closed at v3.81 by measuring
  it and replacing the shape (finding 511).**
```

From the verb to the citation is **58 characters** -- half the window -- and the window could not reach
it, because the first `.` on the way is the one in `v3.81`. The pattern stopped there, found no citation
in what it had, and the arm filed the closure under the **round** it had read: `Closed at v3.81`. The
entry names its finding, and the line said it named a round.

### Measured over the corpus

Every bullet of the record, the index and the seventeen volumes -- **797** of them -- read twice: once
with the window that stops at any period, once with a window that stops at a period **followed by
whitespace**. Exactly one bullet reads differently, and it is `O-057`. That is the whole population
today: a version number followed by a citation is a shape this log had used once, and the count of it
was zero for as long as nothing could see it.

### The repair

The boundary is stated positively, which is what `[^.]` was reaching for:

```js
const CLAUSE = String.raw`(?:(?!\.\s)[\s\S])`;
```

A period followed by whitespace ends the sentence; a period between digits does not. `[\s\S]` rather
than `.` because a citation wraps -- `**Closed by\nfinding 170**` is the shape eleven entries use -- and
the lookahead is asserted at **every** position, so the lazy count may cross a version and may not cross
a full stop. Two fixtures hold the two sides: a closure whose finding arrives after `v3.81` is a
finding, and `**Closed by the workflow.** Finding 150 later found something else` is still refused as a
closure that names nothing.

The shipped split moved **43 → 44** findings and **10 → 9** rounds. Finding 588's line is where the
correction shows.

## Finding 591 — the rule measured a paragraph in runs of eight and a heading in the same unit

`docs-language.mjs` reads the tree's documents and refuses the ones that are not English. Its unit
was one number, stated once:

```js
export const HAN_RUN = /\p{Script=Han}{8,}/u;
```

and the file's header defends the eight: *the things this repository legitimately carries in Chinese
are short -- a cited file name, a section number, a term quoted from a table. All of them are two to
seven characters.* That is a statement about **citations**, and it is true. A heading is not a
citation. It is the document's own skeleton, and what a half-translated document leaves at the front
of a skeleton row is a number:

```
### 一、an absence and an omission are the same bytes
### Two: the five cases that looked like they had a line
```

The first row holds **one** Han character. The second holds none. Neither can ever be a run of
eight, so the reader that was written to refuse a fourth Chinese round was green about **28**
headings across **three** volumes:

| volume | headings numbered in Han | of which a Han numeral | of which an English numeral and an ideographic comma |
| --- | --- | --- | --- |
| `volume-09.md` | 3 | 3 | 0 |
| `volume-12.md` | 4 | 4 | 0 |
| `volume-13.md` | 21 | 20 | 1 |
| | **28** | **27** | **1** |

### Why nothing went red

The rule was never asked about a heading. `proseReport` did have an ATX branch -- a heading flushes
the paragraph and is judged alone -- and that branch called `scanParagraph([row])`, which used the
one unit the file exported. A branch that knows a heading is a different *shape* and applies the
paragraph's *unit* to it is the same defect as a counter that admits three authorities under one
noun (finding 588): the shape was recognised, and the measure taken was the measure of something
else.

### The repair

The unit is a parameter of the scan, and the position chooses it:

```js
function scanParagraph(rows, pattern = HAN_RUN_ALL) { ... }
...
for (const hit of scanParagraph([row], HEADING_PROSE_ALL)) hits.push(hit);
```

with `HEADING_PROSE = /[\p{Script=Han}\u3001]+/u` -- one or more of a Han character or the
ideographic comma, which is finding 592's half of the same rule. The join, the line mapping and the
`pairs` witness are written once and shared, because they are properties of the paragraph rather
than of the unit; only the pattern differs.

The corpus was repaired in the direction each volume already pointed: `volume-09.md` writes
`### One: `, `volume-12.md` writes `### One — `, `volume-13.md` writes `### One · `, so each of the
28 headings was relabelled in its **own** volume's separator. No heading level, no number and no
finding was touched; the three `§六`/`§七` pointers in `volume-12.md` and the one `一、` pointer in
`volume-13.md` were relabelled with them, because a pointer into a skeleton that has been renamed is
a pointer at nothing.

### What it does not claim

That a paragraph is now measured correctly. It is measured exactly as before -- runs of eight -- and
a seven-character Chinese sentence in a paragraph is still invisible. That is the price the threshold
pays for not refusing `金标` and `未测量`, and it is stated in the file's header rather than
discovered. What changed is the position that does not pay it.

## Finding 592 — a heading's separator was a mark no character class contains, and the line called it a Han character

One of the 28 headings that finding 591 counts is not a Chinese numeral at all:

```
### Five、What the gates cost to extend
```

`volume-13.md`, line 689. The word is English and the separator is `、`, so `\p{Script=Han}` matches
**nothing** in that row: narrowing the heading's unit from eight characters to one would still have
left it green. It is the only row of its kind in the tree, and it is the clearest evidence of what
happened -- a volume that was being translated into English one heading at a time, with the
numbering moved first and the punctuation left behind.

### The line the repair would have produced

Narrowing the unit alone turns `### 一、` into a report of one character and `### Five、` into a
report of none, and the error line was

```
docs/…:689: `…` -- 1 Han character(s) of prose: this repository's documents are written in English …
```

`、` is not a Han character. The sentence would have been false in the one place a reader goes to
learn what was refused, and the summary (`N run(s) of Han prose`) would have been false for the same
reason. This is the third appearance in three rounds of one shape -- the noun beside a number names
one thing and the number counts another -- and it was caught the way the other two were: by writing
the fixture for the neighbouring rule and reading what the line actually said.

### The repair

Three statements, each narrow:

- `HEADING_PROSE` includes `\u3001`, because a heading writes `,` or `—` and the ideographic comma
  is a trace of the numbering it was copied from rather than a mark this repository chose.
- the error line says `N character(s) of prose`, which is what it counts in both positions: a run of
  Han in a paragraph, a single Han character or a mark in a heading.
- the summary says `run(s) of non-English prose`, because a heading can be refused for a mark that
  is not in any script.

### What it does not claim

That every punctuation mark outside ASCII is a defect. Only this one is read, and only in a heading
or after a chapter mark. A `—` and a `·` are separators three volumes chose deliberately and are
left alone; the fixture asserts all three separators pass.

## Finding 593 — a test proved a break by asserting a status that no implementation could raise

`check-docs-language.test.ts` had this test, and its comment shows it was written to catch a real
bug in its own fixture:

```ts
it('does not let a heading continue the row above it', () => {
  const dir = treeOf({ 'docs/page.md': `# Page\n\n${HAN(4)}\n## ${HAN(4)}\n${HAN(4)}.\n` });
  expect(run(dir).status).toBe(0);
});
```

The rule under test is that a heading flushes the paragraph, so nothing joins across it. The
assertion is that no run of eight was found. **That assertion is true whether the flush happens or
not**: `## ` stands between the characters before it and the characters after it, and `#` is not
Han, so no run can cross a heading in either implementation. The fixture is four characters, four
characters and four characters, and eight is the threshold.

### The reading that can fail

The reader already publishes the witness for exactly this: `pairs`, the number of row breaks that
fell inside a paragraph and were crossed by the join. Measured on the fixture:

| implementation | paragraphs | `pairs` |
| --- | --- | --- |
| a heading flushes (the rule) | `[line 3]`, `[line 4]`, `[line 5]` | **0** |
| a heading does not flush | `[line 3, line 4, line 5]` | **2** |

So the test asserted the one number that cannot tell the two apart, and the number that can was
printed beside it on every run.

### The repair

The test reads the witness, and the second half of the same statement comes free from finding 591's
unit -- the heading is reported as itself, on its own line, four characters:

```ts
const report = proseReport(text);
expect(report.pairs).toBe(0);
expect(report.hits).toEqual([{ line: 4, text: HAN(4), length: 4 }]);
```

Under the old unit the second assertion would have been `[]`, which is why the first version of this
test could not be written this way: the rule and its witness were both invisible, and `status` was
the only number left.

### What it does not claim

That this was the only test in the suite whose assertion is satisfied by every implementation. It is
the one a repaired reader exposed, on the round that changed the unit it reads in. Finding 594 is
the census of the neighbouring shape and finds a different answer.

## Finding 594 — the census of counting assertions is 240, and every one of them moves with its digit

`O-085` was opened by finding 589 with a premise and no population: *the shape is a `toContain` of a
count that a larger number's tail satisfies, and it is possible wherever a test reads a number out of
a sentence -- the population is unknown.* This round measured it.

### The population

Every `toContain`/`toInclude` in `packages/core/test` and `packages/cli/test` whose literal argument
begins with a digit, excluding the ones under `.not.` (a negation is satisfied by absence and cannot
be tested this way):

| | |
| --- | --- |
| test files | **268** |
| `toContain`/`toInclude` with a literal argument | **2,736** |
| ... whose literal begins with a digit | **249** |
| ... not under `.not.` | **240** |
| ... of those, a digit run followed by a word (a count and its label) | **211** |

### The measurement

Each of the 240 was mutated in place -- a `9` inserted before its first digit, so `1 open with a
reason` became `91 open with a reason` -- and the test file was run. **240 red, 0 green.** No
assertion in the suite is satisfied by a number it does not read: every one of them fails when the
digits move.

### What this does not answer, and why the entry stays open

A substitution proves the assertion depends on its digits. It cannot prove the digits are the ones
that belong there. Finding 589's assertion was `toContain('0 closed by a finding')` against a line
that said `30 closed by a finding`; mutate it to `90 closed` and it goes red, because the line does
not contain it -- and the assertion was still wrong, because its **subject** was the live list and
the line counts the index and its volumes. That is a semantic question about one assertion at a
time, and no substitution reaches it.

So `O-085` is narrowed rather than closed: the population is known, none of it is empty, and what
remains is the part a reader has to do. The structural repair -- reading a count as a number
(`countIn`) rather than as a substring -- is what makes the shape impossible, and it is applied in
the two places finding 589 repaired.

## Finding 595 — the field named "inherited from" answered no for two different reasons

The budget gate prints one line per run, and one clause of it read `62 of 83 step(s) bounded`.
This tree has **eighty-three steps, sixty-two of which declare a `timeout-minutes` of their own,
twenty-one of which are bounded by their job's budget, and none of which is unbounded**. The
clause published the first number under a noun that covers all three, so a reader who subtracted
-- the arithmetic the sentence invites -- was told that twenty-one steps run with no bound at all.

### Where the two populations became one

Not in the sentence. In `stepsOf`, the reader that resolves every step's budget:

```js
inheritedFrom: own === '' ? null : 'step',
```

The field is named for **where the bound comes from**, and it answered a narrower question -- *did
the step write one?* -- with two values where the workflow has three answers. A step the job
bounds and a step nothing bounds were the same `null`, so every reader downstream saw one
population. The summary could not have printed the second number: the number did not exist.

That is finding 588's shape one level down. There the noun was wider than the count; here the
**value** is narrower than its own name, and the noun inherited the defect from it.

### The second reader of the same value, which the repair had to keep

`R4` refuses a job that bounds some of its steps and not the others, and it asked
`step.inheritedFrom === null`. Fixing the field without touching that condition would have
silenced the rule -- a mixed job's inherited step would have carried `'job'` and slipped past a
refusal written for `null`. Nothing in the source would have looked wrong: the rule would still
be there, still be reached by its own test... except that the test would have gone red, which is
the only reason the change is safe to make. The condition is `!== 'step'` now, because the
question the rule asks is *does this step declare one*, and the field answers where a bound comes
from. Two questions, two predicates, and the test at `ci-budget.test.ts` that fires `R4` is what
holds them apart.

### The three numbers, and why there are three

A reader's question is *is anything unbounded here*, and the arithmetic that answers it is the
work the line exists to save. So the clause publishes the partition and not two of its terms:

```
62 of 83 step(s) carry their own `timeout-minutes`, 21 are bounded by their jobs' budget, and 0 have none
```

All three are counted where the step is seen, never derived by subtraction (finding 588: a total
computed from three counters cannot disagree with them; a total accumulated beside them can).

### What the repair does not change

`bounds total 305 min` still sums the bounds steps declare, because a job's budget is not a bound
any one step owns and adding it would count the same twenty minutes once per step. The rules that
size a bound against its measurement (`R4`, `R5`, `R10`) are about declared bounds and are
untouched: the population they argue about is the sixty-two, and it always was.

## Finding 596 — a workflow with no declared bound printed a superlative with no subject

The same line carries the tightest ratio, and the ratio is `Infinity` when no step declares a
bound -- the initial value, never replaced. The sentence did not check:

```js
`${tightest.name} at ${Number.isFinite(tightest.ratio) ? ... : 'unmeasured'}x`
```

Run against a two-step job whose steps inherit its budget, the shipped module printed:

```
check-ci-budget: OK — 1 job(s) recorded, 0 of 2 step(s) bounded, 2 min measured (as of run 41637098008);
bounds total 0 min; tightest  at unmeasuredx; no job leans on its own budget; ...
```

Two defects in one clause, and the first is finding 595 seen from the other end: **`0 of 2 step(s)
bounded`** for a job that bounds both of them. The second is the empty subject -- `tightest  at
unmeasuredx`, a superlative with no noun and a unit with no number. A reader skips it, which is
the same as not printing it.

The branch that says so is now written out, because the state is reachable and is not an error:
a workflow whose every step inherits its job's budget is a workflow with no ratio to report.

```
no step carries a bound of its own, so nothing here is tight
```

The fixture is the one that produced the string above, and it is a test now, asserting both that
the sentence appears and that `unmeasuredx` does not.

## Finding 597 — the rule compared the recording with a row the log had stopped writing

`R7`'s whole content is a comparison: the recording's run must not be older than the run the ledger's
newest closing reading reports. The gate printed that comparison on every green run, and it read

```
the ledger's newest run is 42160224254; the recording (43720087959) is newer, 3 earlier row(s) name no run
```

Measured, in the same tree:

| | |
| --- | --- |
| round sections in `docs/progress/` | **215** |
| of them carrying a `| CI |` row | **12** |
| rows in total | **15** (3 name no run) |
| the newest row | `volume-11.md:1464`, under `## v3.54` |
| rounds after it | **65** (`v3.55` … `v3.119`) |
| CI runs newer than the recording | **3** |

The rule was correct and its reference was dead. A recording from any run newer than
`42160224254` passed -- including the one in the tree, which was three CI runs behind -- and nothing could
notice, because the only thing `R7` reads is the row, and a row that is never written never disagrees with
anything.

### The shape

Every unread rule in this repository has had this shape, but here it is one level down: the rule *is* read,
and the thing it reads is written by hand, by a convention, with nothing counting whether the convention still
holds. A convention that nothing measures decays at the rate its author's attention decays, and this one
decayed to zero for 65 rounds while the gate kept printing agreement.

### The repair, and what it does not do

`R11` is about the present: **the newest round's section carries a `| CI |` row that names a run and states
`**<n> of <m> jobs success**`**, with `m` equal to `ci.yml`'s job count and `n` equal to `m`. A ledger read
with no row at all now refuses instead of returning early -- that early return is what made an empty ledger
indistinguishable from an agreeing one.

It does not backfill the **203** rounds that carry none. Naming runs for them now would be inventing
provenance, which is the one thing a recording may never do, and the log states the gap instead: the green
line prints how many rounds back the row it is comparing against sits (`65 round(s) before 'v3.119'`), so the
distance is visible on the same line a reader already looks at.

## Finding 598 — a run id is not a CI run id, and nothing in the ledger could tell

This repository runs two workflows, `CI` and `Anchor round trip`, and their run ids are drawn from **one**
sequence. `ledger-runs.mjs` says so in a paragraph that also says it cannot be enforced -- "a row labelled
`CI` is assumed to cite runs of *this* workflow" -- and last round's report did exactly what the paragraph
warns about:

```
44516888822  1 job    Round-trip a synthetic corpus in t...
44516888528  8 jobs   every proved exit can disappear wi..., injection batteries..., ...
```

`44516888822` was reported as a CI run with eight jobs. It has one job and it is the other workflow. No gate
objected, because the row said `CI` and the row is the evidence.

The tally in `R11` makes that mistake a refusal: `**1 of 1 job success**` cannot pass a workflow that declares
8, and the refusal names the sequence rather than the row.

## Finding 599 — three bounds were under the multiple, and the stale recording was why nobody asked

Refreshing the recording from the newest CI run (`44516888528`) produced three refusals, none of which had
anything to do with the refresh:

| step | bound | newest day | ratio | what the bound was sized on |
| --- | --- | --- | --- | --- |
| `Install a backend this repository did not write` | 16 min | **888 s** | **1.08x** | a 648 s cold-runner day |
| `Every gate can be shown to fail` | 9 min | **295 s** | **1.83x** | 254 s, three rounds before |
| `Gate-test battery (…)` | 8 min | **250 s** | **1.92x** | 231 s, the day the recording held |

The multiple is two. Each of the three was under it, and each was written against a day that a slower one had
since replaced. `ci.yml` had not changed; the recording had, and the recording was three runs behind the tree
-- which is finding 597's consequence arriving in the arithmetic: **a recording that is never refreshed is a
set of bounds that are never asked the question.**

The repairs are the arithmetic the rules demand, and the installation's is the interesting one: `apt-get
install prometheus` is a mirror, its spread is now **17 s to 888 s (52x)**, and no `timeout-minutes` can tell a
slow mirror from a hang. 16 minutes became **30** (2.0x the slowest day) and the `backend` job's ceiling moved
**34 -> 48** (the floor's 15 + 30 + the reader's 3). `Every gate can be shown to fail` moved **9 -> 10**
(2.03x) and `Gate-test battery` **8 -> 9** (2.16x).

## Finding 600 — two gates printed one word for two populations, and neither line said which

`pnpm docs:check` prints, six lines apart in one log:

```
check-progress-volumes: OK — 18 volume(s), 268 round(s); largest volume-03.md at 127,029 of 200,000 bytes; …
check-open-list: 224 record(s): 199 under a round and 25 under none; 215 round(s) + 1 addendum(s), 17 of them wrote none
```

268 rounds and 215 rounds, over one corpus. Both numbers are right and neither is about the thing the
other is about. 268 is `order.length`: **every** `## ` heading the volumes hold. 215 is `firstHead.size`:
the distinct `vX.YY` numbers. The difference is not rounding, and it is not four rounds' worth of drift:

| kind | count | what it is |
| --- | --- | --- |
| `vX.YY` round | **215** | one number, one round |
| `vX.YY, addendum` | **1** | a second section of `v2.15` |
| `Pass N` round | **50** | the log's older era, a numbering the other gate does not look up |
| no name at all | **2** | `## Finding 124` and `## Iteration — F-41 / F-42 / F-43` |
| **total headings** | **268** | what `check-progress-volumes` walked |

This is **finding 585's error**, in the file next door: a count of headings published as a count of rounds.
585 found it inside `check-open-list` and repaired the thing that was wrong there -- `rounds.length -
recordRounds.size`, a heading count minus a name count, published as "18 rounds wrote none". It printed the
population from `firstHead.size` and left the subtraction alone. **The same mixture was one file away and
the round did not look**, because the defect and its repair were both described in terms of the arm that had
failed, and the summary is not part of any arm.

What made it survive 585 is worth naming, because it is the general form: 585's subject was *a number two
readers can derive differently*, and it fixed the number whose two derivations disagreed **inside one
expression**. Two files each deriving one number correctly is not a disagreement a reader can see -- it is
two sentences that are each true, printed 40 lines apart in the same log, one of them using "round" for
something the other would not call a round.

The repairs, in the order the reader meets them:

1. **The summary prints the partition, not a word for it**, so the total can be added up on the page:

   ```
   check-progress-volumes: OK — 18 volume(s), 268 heading(s): 215 `vX.YY` round(s), 1 addendum(s),
     50 `Pass` round(s), 2 unnumbered; largest volume-03.md at 127,029 of 200,000 bytes; …
   ```

   The buckets are a partition of `labelOf`, which returns
   `Pass N`, `vX.YY`, `vX.YY, addendum`, or null -- every entry lands in exactly one, so the four numbers add
   up to the total by construction rather than by a rule that could disagree with them.
2. **`check-open-list` names its era**: `215` is printed as the count of `vX.YY` rounds, which is what it
   counts -- one era, not the corpus. The word it used was the whole corpus's.
3. **A heading shaped like a round that `this` module cannot label is refused.** `check-open-list` identifies
   a round with `\b` after the number and this module's `VERSION` requires a space and then a title, so
   `## v3.62` followed by anything is a round to one reader and "unnumbered" to the other -- one heading, two
   counts, and the difference arriving as a word that reads like a rounding. Nothing shipped does this; the
   refusal is for the heading the next round writes in a hurry.
4. **The agreement is asserted, not printed.** The shipped-corpus test derives the version count through
   `readVolumes` and asserts that `check-open-list` prints it. A second literal would have let one reader move
   while the other stayed green, which is the shape of the defect: two sentences, no comparison.

Seven edits were made to prove the new reading is not decorative -- addendum into the version bucket,
unnumbered into `Pass`, the shape guard removed, the total printed as the version count, the era qualifier
dropped from either line, and the heading count published as a number count -- and **all seven turned the
suite red**.

What this does not cover, stated rather than implied: there is no rule that a summary's noun must name its
unit. The census here is two gates because those two printed the same word; nine other gates print counts
whose nouns are unshared (`finding(s)`, `citation(s)`, `entry(ies)`, `row(s)`) and nothing compares them. The
class is "a noun in a summary is a claim about a population", and it has no reader -- only this round's pair.

## Finding 601 — the row that counts the rounds was counted before the round that wrote it

Every recent ledger carries a row stating how many `vX.YY` numbers the log holds. Five of them were one
behind the log they sit in:

| ledger | the row said | the corpus held | what the row's own range names |
| --- | --- | --- | --- |
| `v3.116` | **210** | **211** | `v3.00..v3.115` -- the round **before** it |
| `v3.117` | **211** | **212** | `v3.00..v3.117` |
| `v3.118` | **212** | **213** | `v3.00..v3.118` |
| `v3.119` | **212 -> 213** | **214** | `v3.00..v3.119` |
| `v3.120` | **213 -> 214** | **215** | `v3.00..v3.120` -- **121** numbers for a count of 120 |

Each number is the count of the log **as it stood before that round's own heading existed**, and each row is
internally consistent with the range it quotes: 94 + 120 = 214. What it is not consistent with is the log,
which holds one more, because the round writing the row is in it.

That is finding 586's shape -- **a number derived before the change it describes** -- surviving in the one row
whose whole job is to be a count. 586 was found in a test-file count taken before two budget blocks were added;
this is the same mistake with the same mechanism, five times, in prose that is checked by nothing. The row was
written after the round's body and before its own heading, which is the natural order of writing and the wrong
order of counting.

The repair is a rule rather than five corrections, because five corrections would leave the sixth round free to
make the same mistake:

> A ledger row that states a count of this corpus must state the count the corpus has.

`NUMBER_LINE_ROW` reads the row where a round writes one; `populationsOf` derives the number, so it is the
corpus's rather than a literal that rots; and `statesNumber` matches the count on both sides of the digits
after stripping the separators a ledger writes, so `3` is not found inside `3,150`. The rule is judged on the
round that can still be written, for the reason the coverage row is (finding 475): thirty of the log's first
fifty-four ledgers carry no coverage row, a rule over history would have been red from the day it existed, and
a rule that is always red is a rule every reader skips.

It fired on the shipped tree the moment it existed, quoting `v3.120`'s row and the 215 the corpus holds --
which is how it was known to work before any fixture was written for it.

Two limits, stated rather than implied. The five rows stay as they were written: correcting a frozen record to
satisfy a rule invented after it is the thing the coverage row already refuses to do, and the five are
recorded in `O-092` instead. And the rule reads a row's **presence** of the number, not its meaning: a round
that writes `215 -> 216` passes because 216 is the count, which is the intended reading -- a round that has
just moved the number states both -- but a round that writes a correct number beside an incorrect sentence is
not seen, and no parser over free prose would see it.

## Finding 602 — one gate printed 597 open over a list that held 37, two lines apart

`pnpm docs:check` printed, in one run and from one walk:

```
check-open-list: OK (627 entry(ies) across 226 section(s) of docs/progress.md and its volumes: 597 open with a reason, 30 closed (29 by a finding, 0 by a round, 1 without one))
check-open-list: the live list was read at v3.121 and holds 37 open entr(ies), and the newest round this corpus names is v3.121
```

**597 and 37, both labelled "open", forty lines apart, and both true.** 597 was every bullet in every
list section the walk read; 37 was the live list. The difference is 560 restatements -- one per round, of
the same residuals, in the `### Left open` a round closes with and a volume freezes. A reader who took 597
away believed sixteen times what was true, and nothing in either sentence said which population it meant.

| kind (`spellingOf`) | sections | entries | open | closed |
| --- | --- | --- | --- | --- |
| `live` -- the index's `## Open` | 1 | 37 | **37** | 0 |
| `record` -- a round's `### Left open` | 178 | 590 | **560** | **30** |
| `closed` -- the record of closures | 2 | 56 | 0 | **56** |

The line's `627` was the first two rows added; its `597` was their open states added. Neither number was
wrong, and the walk had known which kind it was reading all along -- `spellingOf` returns it and the kind
is used for every refusal below. The summary threw the kind away at the one place a reader reads.

### Finding 589 saw this line and fixed the half it had a failing test for

589's subject was the same line: it is the index **and its volumes**, the volumes' records close thirty,
and a test that read `0 closed by a finding` was matching the last digit of that thirty. The repair was
to stop reading the line's words and read its arithmetic.

The arithmetic held. `597 = 37 + 560` is arithmetic, and `627 = 37 + 560 + 30` is arithmetic, so the
test 589 left behind was green for eight rounds over a sentence that published sixteen times the truth.
**The half that was repaired was the half that had a failing test**, and the open half had none because
both of its numbers were correct about their own subject.

That is finding 600 at a smaller radius. There the two readers were two gates and the repair was to make
them compare; here the two readers are two lines of one gate, the smaller number was **already printed
twice**, and nobody compared them. A comparison that exists in the output is not a comparison that exists.

### The repairs

1. **The population is a partition summed from its parts, not a total counted beside them.** `tallyOf(kind)`
   holds each kind's open count, closed count and the three closure authorities (finding 588); the number in
   the parentheses is their sum, so the line's arithmetic is true by construction.
2. **Each clause names the population it counts** -- `37 open in the live list`, `560 open restated in the
   log's records`, `30 closed in the log's records`, `56 closed in the record of closures`. `restated` is
   the word that separates work from the record of work as it stood at a round.
3. **A clause appears only for a kind the document holds.** The record of closures printed
   `0 open in the live list` for eight rounds over a section it does not have.
4. **The section count is split for the same reason.** `627 entry(ies) across 226 section(s)` was a
   division nobody asked for: **47** of those sections are records in table form, holding **318** rows and no
   entries, and they are counted on their own line. The line reads `179 of 226` -- the sections the entries
   came from, then the walk's coverage.
5. **The id line names its two lists.** `94 entr(ies) with ids 1..94 (38 in the live list, 56 in the record
   of closures)`; 94 is not a third population, it is those two added, and now both are on the page.
6. **The two lines are asserted to agree.** A shipped-corpus case reads the live bucket out of the summary
   and the count out of the stamp and holds them equal -- so the pair that could drift for eight rounds
   cannot drift silently again.

### Falsifications

Eight edits, each followed by `test/check-open-list.test.ts` alone and a byte-for-byte restore:

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

**Fifty-six reds.** The fifth is this finding as a mutation: restoring the pooling is one line, and it reds
fourteen cases -- the most of any edit here.

### What this does not cover

- **The vocabulary is still two gates wide.** `finding(s)`, `citation(s)`, `entry(ies)`, `row(s)` are printed
  by nine gates and no other gate is asked what each means; this round closed the noun that had a second
  reader in the same file (`O-091`).
- **Thirty closures sit in rounds' records** -- nine in `volume-02`, eleven in `volume-03`, ten across
  `volume-05` to `volume-09`, all before the split at v3.111: the split's two refusals are kind-scoped and
  nothing refuses a strike inside a round's record. The line counted them for the first time here, which
  is why they are now a number; which home a closure has when the round that closes it also restates it is
  decided nowhere (`O-094`).
- **A clause's wording is not guarded.** A bucket named `in the log's records` where it meant the live list
  reds tests, because the fixtures pin the sentences; but a *fourth* kind added to `spellingOf` without a row
  in `WHERE` would throw inside `phraseOf` -- a crash rather than a refusal with a sentence, and no fixture
  reaches it, because there is no fixture with a fourth kind. The table is total over three kinds by the
  corpus's arithmetic and by nothing that reads it.

## Finding 603 — the second line counted a subset with the noun of the whole

The two lines the round before this one left standing, printed in one run:

```
check-open-list: 226 record(s): 201 under a round and 25 under none; 217 `vX.YY` round(s) + 1 addendum(s), 17 of them wrote none
check-open-list: 47 record(s) in table form (318 row(s)); the v3.122 record's 2 row(s) were judged, and every one of them matches an entry on its first 20 characters
```

**One noun, two populations, two lines apart.** 226 is every record the walk read; 47 is the ones written as
tables. There is no arithmetic that puts 47 beside 226 -- 47 + 226 is not a number of anything, and 226 - 47
is not printed -- so a reader holding both lines has to decide, unaided, whether a table-form record **is** a
record or is a fourth kind of object the first line did not count. It is a record: `spellingOf` gives it
`kind: 'record'` and `form: 'table'`, the `recordSections += 1` arm runs for it, and so does `tables += 1`.
The containment is by construction -- `form: 'table'` is only ever produced together with `kind: 'record'` --
and nothing on the page said so.

This is finding 602's shape at the smallest possible radius, and finding 600's shape one line below it. There
the two readers were two gates printing `215` and `268`; here they are two lines of one gate printing `226`
and `47`. The defect is not that either number is wrong -- both are right -- it is that a **subset was
printed with the noun of the whole**, which reads as a second population.

### The repair

The line says how many it is a part of:

```
check-open-list: 47 of 226 record(s) are in table form (318 row(s)); the v3.122 record's 2 row(s) were judged, ...
```

The denominator is `recordSections` -- the same variable the line above prints -- so the two lines cannot
disagree while both are arithmetic. That is the difference between a repair and a second number: a
denominator computed here and there would be a pair a reader has to hold equal, which is the pair finding 600
exists about.

### What the test can now assert, and could not before

`rowSections` was already held to the corpus (`47`), and the record population was already held to it (`226`),
and **neither assertion could see the defect**, because both numbers were right. The shipped-corpus case now
reads both lines out of one run of the guard and holds the denominator to the population printed above it:

```js
const counted = /(\d+) of (\d+) record\(s\) are in table form \((\d+) row\(s\)\)/.exec(shipped.stdout);
const recordLine = /(\d+) record\(s\): \d+ under a round and \d+ under none/.exec(shipped.stdout);
expect(Number(counted?.[2])).toBe(Number(recordLine?.[1]));
```

plus a non-vacuity case -- the numerator is *less* than the denominator, so a corpus in which every record
were a table could not pass the `of` as a constant.

### Falsifications

| the edit | reds |
| --- | --- |
| the denominator made `recordSections + 1` | 6 |
| the denominator dropped entirely, the line as it was | 6 |

**Twelve reds across two edits**, both rest on the six fixtures and the shipped-corpus case that pin the
sentence -- and the second is the round's own defect restored verbatim: the line as it stood for one round.

## Finding 604 — `bounds total 327 min` beside `51 min measured`, and the comparison that decides nothing

`check-ci-budget` printed, on the shipped tree:

```
check-ci-budget: OK — 8 job(s) recorded, 62 of 83 step(s) carry their own `timeout-minutes`, 21 are bounded by their jobs' budget, and 0 have none, 51 min measured (as of run 44656781771); bounds total 327 min; tightest ...
```

Two numbers a reader can divide, and the division is meaningless: **327 minutes of declared bounds over 51
minutes of measured time, across eight jobs with eight different ceilings.** A bound is arithmetic inside one
job -- it has to expire before *that* ceiling -- and the workflow-wide sum is a number about nothing that ran.
It was defended, correctly, as a sum of one population (the bounds steps declare) rather than of a mixed one
(finding 596's "what the repair does not change"), and that defence is why the defect survived: the number is
right and the question it invites is not answerable.

What was printed by no line is the comparison that decides whether a bound can fire at all: **a job's bounds
against the ceiling above them.** `R4` asks it of each bound (`bound + prefix-measured <= ceiling`), and the
summary asked it of nothing.

### The repair

The sum keeps its population and gains its denominators; the ceiling gets a superlative of its own, with the
day it was measured against:

```
... bounds total 327 min in 8 ceiling(s); the closest ceiling batteries at 34 min over its slowest day of 1012 s (2.0x, run 44576264388), and no job is under 2x; tightest ...
```

`in 8 ceiling(s)` is what says the workflow-wide division has eight denominators rather than one, and
`no job is under 2x` is a claim about **every** job -- checkable, because `R12` (finding 605) refuses the
first one that is.

### Why the sum is not the rule

The obvious repair is a rule that a job's ceiling must hold the sum of its bounds. It was measured before it
was written and refused:

| job | ceiling | own bounds | sum / ceiling |
| --- | --- | --- | --- |
| `verify` | 18 | 53 min | 2.94 |
| `backend` | 48 | 48 min | 1.00 |
| `sensitivity` | 26 | 46 min | 1.77 |
| `sensitivity-shard` | 26 | 43 min | 1.65 |
| `batteries` | 25 | 83 min | 3.32 |
| `batteries-heavy` | 27 | 54 min | 2.00 |
| `artefacts` | 15 | 0 min (13 steps inherit) | 0.00 |
| `cold-tree` | 20 | 0 min (8 steps inherit) | 0.00 |

Six of eight jobs hold more bounds than any ceiling they have, and **no ceiling could fix it**: the six
preparation steps every job shares carry a three-minute floor each, so the sum of bounds is at least 21
minutes in *every* job, including the two whose whole day is under a minute. A rule that made those sums fit
would demand ceilings of 21 minutes for a 46-second job and 83 for one that takes 15 -- ceilings twenty times
the day they bound, which is the same defect as a bound that cannot fire, one level up: **a ceiling that
cannot fire is not a bound either.** The floor exists because a measurement cannot see a cold package index,
so the sum it produces is not a claim about a day; the day is, and the rule belongs on the day.

## Finding 605 — the ceiling had no multiple, and three jobs were under twice their own slowest day

`R4` and `R10` demand that a step's bound be at least twice the slowest reading of its command, on the
argument that a runner twice as slow must still finish rather than be refused for being slow. Nothing asked
it of the job ceiling. Measured against `ci-readings.json`, on the shipped workflow:

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

A day eleven per cent slower than one `verify` has already run reaches the ceiling with every step still
inside its own bound, and the verdict is `the job timed out` -- the sentence every bound in `ci-budget.mjs`
exists to replace, in the job where eleven of twelve steps carry one.

### The rule

`R12`: a job's ceiling must be at least twice its slowest recorded day. The day comes from `jobDays`, which
sums **one reading**; a reading that measured only some of the job's steps is skipped rather than summed,
because a total with a hole in it is smaller than the day, and a ceiling argued from it would be argued from
a fast day. Ties go to the newer run, the rule `worstReadingFor` already follows.

The sum of each command's slowest reading -- the composite `R4`'s prefix uses -- is deliberately **not** the
number here. `R4` asks where a bound sits in a job, and there a mixture of slow days is the worst case. A
ceiling is a claim about a day, and a composite of ten days is a day no run ever produced: a number a reader
cannot go and look at, which is the one thing every other number in that file can be.

### The repair

| job | was | now | multiple of its slowest day |
| --- | --- | --- | --- |
| `verify` | 18 min | **21** | 2.10x |
| `batteries` | 25 min | **34** | 2.02x |
| `batteries-heavy` | 27 min | **31** | 2.02x |

`batteries` is the one that moves against a recorded decision, and the record says so where it stood: v3.121
lowered it from 30 to 25 because *a job's budget has to hold the bounds of its own steps* -- the argument
finding 604 refuses above. The two heavy bounds still add up to more than the ceiling, and that is now a
stated property rather than a hidden one; the numbers a hang is charged to are the two 13/12-minute step
bounds, and those fire long before 34 minutes.

### Falsifications

| the edit | reds |
| --- | --- |
| `R12`'s comparison made `false` | 3 |
| the hole-skip removed from `jobDays` | 7 |
| the summary's ceiling clause dropped | 2 |
| `jobDays` restricted to the recording, ignoring the history | 2 |

**Fourteen reds across four edits.** The second is the one that would have passed for the wrong reason: with
the skip removed, a reading with a step missing is summed as if the step took nothing, so every ceiling in
the file is argued from a fast day -- and the three cases that name the day go red.

## Finding 606 — `67 file(s)` was one of the `474`, and no line said so

Four summaries from one run of `docs:check`, in the order they print:

```
check-comments-language: OK — 474 file(s), 25443 comment(s) (21317 line, 4126 block), 0 run(s) of Han prose ...
check-citations: OK (2419 citation(s) of 602 number(s) across 37 file(s), ...)
check-doc-counts: OK (... 2 gate-site claim(s) agreeing with 230 claim(s) across 67 file(s) ...)
check-workflow-language: OK — 6 file(s), 1236 '#' mark(s): 1188 comment(s) ...
```

**One noun, four populations, and one of them is inside another.** The 67 are the test files that prove a
gate site; the 474 are the files the comment guard reads; every source file the comment guard reads includes
every test file, so the 67 are `67 of 67` inside the 474 -- measured, not assumed:

```
gate-site files 66, source files 471
of the gate-site files, inside the source walk: 66, outside: 0
```

(66 and 471 on the tree that measured it; 67 and 474 once this round's gate and its test existed.) The 37 are
`docs/*.md` and the 6 are workflow YAML, so neither is inside the 474 either. **Three relations, stated
nowhere**: one inclusion and two exclusions, across four lines that share one noun.

This is finding 603 one gate over. There, `226 record(s)` and `47 record(s) in table form` were two
populations inside one gate and the repair was an `of`; here the same pair is two gates apart, and the
`of` has to be computed from a walk that a different gate owns. The repair keeps the shape:

```
... 230 claim(s) across 67 of the 474 file(s) the source walk reads ...
```

The denominator is `sourcesIn(ROOT).length` -- the same function that produces the other 474 -- so the two
lines cannot disagree while both are arithmetic, and a test file added tomorrow moves both. A copied 474
would have been a number that goes stale every round, which is the reason `O-092`'s five frozen ledger rows
are a decision rather than a repair.

### The inclusion is a rule, and rule 6 is what makes it one

`of` is a claim about two populations, and the claim is only true while every gate site is proved by a file
the source walk reads. That is not an accident of this tree -- it follows from the sites being proved by
tests -- but a rule that is not checked is a coincidence with a longer half-life. `check-doc-counts` gained
rule 6: a site proved by a file outside the walk is a refusal, and its message names what would repair it
(move the proof, or teach the walk the extension) rather than telling the author to delete the `of`.

### Falsifications

| the edit | reds |
| --- | --- |
| the denominator taken from the numerator's own set, so it reads `67 of the 67` | 1 |
| the summary's `of the N file(s)` dropped, back to `across 67 file(s)` | 1 |

Both rest on the new assertion in `check-doc-counts.test.ts`, which reads the denominator out of one run and
holds it to `sourcesIn(ROOT).length`; the second is this round's defect restored verbatim.

## Finding 607 — nine nouns cross gates, and two of them print the same number

`O-091` asked what population each unit noun covers and said, in as many words, that the guards "print
counts under nouns no other guard shares -- `finding(s)` in `check-audit-volumes`, `citation(s)` in
`check-citations`, `entry(ies)` in `check-open-list`'s two lists, `row(s)` in its table census".

Measured by the gate the entry asked for -- a census over the eighteen steps `docs:check` runs:

| | |
| --- | --- |
| unit nouns printed | **53** |
| gate/noun pairs | **69** |
| printed by more than one gate | **9** |
| count of 1 or more printed by two gates under one noun | **3** |

`finding(s)` and `citation(s)` are private. `entry(ies)` is private to `check-open-list`. **`row(s)` is not:**
it is printed by four gates, and two of them print **8**:

| gate | number | what it counts |
| --- | --- | --- |
| `check-l4-status` | 9 | rows of the L4 status table agreeing with the registry |
| `check-open-list` | 318 and 1 | rows inside the record tables, and the newest record's rows judged |
| `check-fault-cases` | **8** | rows in a case's pre-injection window |
| `check-repository-table` | **8** | rows under `## Repository` |

Both eights are right. Four lines apart in a CI log they are indistinguishable from one number printed
twice, and every guard's own sentence names its subject well enough that no local rule could see it. This is
finding 600 one level up: there, two gates printed *different* numbers for one word and a reader had to
reconcile them; here four print one word for four populations and the only question that matters -- do they
overlap? -- was asked by nothing.

### The repair is a reader, not a rule

No rule over the texts can answer it: what makes the two eights different is a fact about the tables, not
about the sentences. So `check-unit-nouns` derives the census by running the eighteen gates, prints the
shared nouns and the coincidences, and holds the vocabulary in `golden-master/unit-nouns.json` the way
`gate-sites.json` is held -- which gate prints which noun, which two print one number, and **no counts**.

The counts are left out on purpose. They move every round -- 471, 473, 474 source files within one round of
work -- and an inventory that went red for a reason its subject has nothing to do with is the crying-wolf
defect this campaign has recorded more than once. The vocabulary is the part that changes when a gate starts
printing a noun another gate already prints, which is the moment a person should look.

### Falsifications

| the edit | reds |
| --- | --- |
| zero counted as a coincidence, so three quiet gates read as one number | 1 |
| one gate's two uses counted as a coincidence, so two clauses read as two populations | 1 |
| the coincidences committed with their counts, so the file drifts every round | 1 |

## Finding 608 — the census's own sentence was the constant it exists to refuse

The first version of the summary ended:

> and 2 count(s) coincide across gates, **which is one number over two populations and not one population
> counted twice**: `1 addendum(s)` in `check-open-list` and `check-progress-volumes`; `8 row(s)` in
> `check-fault-cases` and `check-repository-table`

The clause was written after looking at `8 row(s)`, and it is false about the first coincidence it then
printed. `1 addendum(s)` **is** one population counted twice: both gates take it from `populationsOf` in
`progress-volumes.mjs`, and the agreement is the agreement the campaign wants -- two readers of one table.
A sentence that is right about one of two cases and wrong about the other, printed as a description of both,
is finding 595's shape: **the value is narrower than the name**.

### The repair: the judgement is written, and the file will not invent one

`golden-master/unit-nouns.json` carries a `reading` per coincidence, and the three in the shipped tree are
not the same kind of thing:

| coincidence | reading |
| --- | --- |
| `1 addendum(s)` in `check-open-list` and `check-progress-volumes` | one population and one reader -- both take it from `populationsOf` in `progress-volumes.mjs`, so the number is shared rather than merely equal |
| `474 file(s)` in `check-comments-language` and `check-doc-counts` | one population and one reader -- `check-doc-counts` takes its denominator from `sourcesIn` in `comment-language.mjs`, the same walk that produces the other, so the agreement is by construction rather than a coincidence of this week |
| `8 row(s)` in `check-fault-cases` and `check-repository-table` | two tables and one noun -- the rows of a fault case's pre-injection window and the rows under `## Repository`, which no arithmetic relates |

The second one **did not exist before this round**: finding 606 gave `check-doc-counts` a denominator drawn
from `sourcesIn`, and the census immediately reported that two gates now print `474`. The repair created a
coincidence, and the census is what noticed -- which is the strongest evidence available that the reader is
doing the job the entry asked for.

`--write` regenerates the vocabulary and leaves every existing reading where a person put it; a coincidence
with no reading is refused:

```
check-unit-nouns: FAILED — 1 count(s) coincide across gates and no record says whether that is one
  population or two: 8 row(s) in check-fault-cases and check-repository-table
  add a `reading` to that entry of golden-master/unit-nouns.json: the sentence is the judgement, and no
  derivation can make it
```

### The judgement is keyed by the gate pair, never by the number

`473 file(s)` and `474 file(s)` are the same coincidence: two gates print one number for two populations,
and the disagreement is about what each means. Keying the judgement by the count made the first draft red
the moment a source file was added -- a gate whose repair is to retype a sentence that had not stopped being
true. `keyOf` keys on the noun and the gate pair, and the counts stay out of the file entirely.

### Falsifications

| the edit | reds |
| --- | --- |
| `keyOf` keyed by the count instead of the gate pair | 2 |
| a coincidence's missing `reading` accepted rather than refused | 2 |
| `FUNCTION_WORDS` emptied, so `the record(s)` is read as a noun called `the record(s)` | 1 |

The third is the census committing its own defect: a function word read as part of a noun puts one population
in the census twice under two names, which is what the census exists to find.

## Finding 609 — the census printed which gates share a noun and never what they counted

One run of the shipped tree, three lines:

```
check-unit-nouns: OK — 54 unit noun(s) in 70 gate/noun pair(s); 9 of them are printed by more than one gate: file(s) by 4, row(s) by 4, run(s) by 4, row break(s) by 3, addendum(s) by 2, comment(s) by 2, reading(s) by 2, round(s) by 2, volume(s) by 2; ...
check-audit-volumes: OK — 14 volume(s), 605 finding(s), 1–608; largest volume-03.md at 279,893 of 280,000 bytes
check-progress-volumes: OK — 18 volume(s), 272 heading(s): 219 `vX.YY` round(s), 1 addendum(s), 50 `Pass` round(s), 2 unnumbered
```

**`volume(s) by 2`.** The gate whose whole purpose is to hold two populations of one word together printed the
number of gates and never the numbers. `14` and `18` are printed by the two gates, forty lines apart in the same
log, and the reader that exists to put them on one line put `by 2` there instead.

This is finding 603's defect one gate over, with the same defence available and the same reason it is not a
defence: both numbers were right. It is also the sharpest case `O-096` names, and the reason it was invisible is
arithmetic rather than editorial -- the summary's shape was `noun by N`, a sentence about the vocabulary, and no
line in it was ever a sentence about a count.

### The repair

One line per shared noun, holding every gate's number and the qualifier that number carried:

```
check-unit-nouns: volume(s) — 14 in check-audit-volumes; 18 in check-progress-volumes — two disjoint directories of volumes -- `docs/audit` holds 14 and `docs/progress` 18, and no file is in both
check-unit-nouns: row(s) — 8 in check-fault-cases; 9 in check-l4-status; 318, 1 in check-open-list; 8 in check-repository-table (a count two gates print agrees) — four tables and one word -- ...
```

The relation is the sentence a person writes, and the inventory now demands one per shared noun rather than one per
coincidence: the three coincidences were a special case of the nine, and a noun whose two numbers differ is exactly
the case a reader is left to guess about. `coincidences` therefore leaves the inventory -- which counts happen to
be equal is derived every run, and printing the nine made the three redundant -- and the gate refuses a shared noun
with no relation instead of a coincidence with no reading, which is strictly stronger.

### Falsifications

| the edit | reds |
| --- | --- |
| the line prints `N gate(s)` instead of the numbers | 4 |
| the relation ignored, every shared noun printed `unclassified` | 3 |

## Finding 610 — the qualifier that finding 600's repair inserted is a wall this reader could not see past

Finding 600 made `check-open-list` and `check-progress-volumes` say which era a round is:
`219 `vX.YY` round(s)` beside `50 `Pass` round(s)`. Finding 607's census read the noun and the number, and
`BEFORE` demanded the number at the end of the text in front of the noun, modulo a parenthetical:

```js
const BEFORE = /(\d[\d,]*)\s*(?:\([^)]*\)\s*)?$/;
```

`219 `vX.YY` round(s)` therefore had **no number at all**. Measured on the shipped tree:

```
round(s) :: check-open-list [] | check-progress-volumes []
```

`round(s)` is one of the nine shared nouns, printed by two gates, and **no count under it had ever reached the
census**. The coincidence `219`/`219` -- the same number of rounds from the log's records and from the volumes'
headings, which is the one pair of numbers in this census a reader would most want compared -- was invisible to the
reader built to find exactly that.

The qualifier is not decoration. It is the word that says **which** population the number counts, which is why
finding 600 put it there, and a reader that reached past it while dropping it would have restored finding 600's
defect inside the census's own line. So the qualifier is captured and travels with the count:

```js
const BEFORE = /(\d[\d,]*)((?:\s*(?:\([^)]*\)|`[^`]*`|'[^']*'))*)\s*$/;
```

and the printed line is `219 `vX.YY`, 50 `Pass` in check-progress-volumes` -- the numbers with the words that make
them numbers of something.

### What the repair changed in the census's own answer

`3 count(s) coincide across gates` became **4**: `219 round(s)` joins `1 addendum(s)`, `474 file(s)` and
`8 row(s)`. The fourth was there all along and unreadable.

### Falsifications

| the edit | reds |
| --- | --- |
| the qualifier dropped rather than carried, the count still read | 1 |
| `BEFORE` as it stood, qualifiers reaching no number | 4 |
| the numbers sorted ascending instead of in the gate's order | 3 |

## Finding 611 — three uses whose number the reader could not see were dropped in silence

`censusOf` pushed a count only when it had one. The uses it could not size were dropped without a word, so the
headline `54 unit noun(s) in 70 gate/noun pair(s)` was a count of what happened to be readable, with nothing in the
sentence to say how much was not:

```
budget(s)                  "…21 are bounded by their jobs' budget, and 0 have none"
scope(s)                   "484 published count(s), each naming its scope; scope(s) covered: core, cli, repo"
enum call(s)               "8 inline z.enum call(s) remain in schema.ts"
mark(s)                    "1248 '#' mark(s)"          <- readable once a quoted qualifier counted
```

`mark(s)` is the one finding 610's repair recovered: `'#'` is the same shape as `` `vX.YY` ``, a qualifier between a
number and its noun. The other three state no number at all, or state one with three words in between -- `8 inline
z.enum call(s)` -- and guessing which number in a line belongs to which noun is the defect, not the repair.

### The repair

`unreadableOf` reports them by noun and gate, and the summary names them:

```
... and 3 noun(s) are printed somewhere with no number this reader can read: budget(s) in check-ci-budget; enum call(s) in check-data-model-vocabularies; scope(s) in check-doc-counts
```

A census that says what it could not read is a census whose headline is a measurement rather than a floor.

### Falsification

| the edit | reds |
| --- | --- |
| the unreadable uses dropped again, as they were | 1 |

## Finding 612 — the job that runs a claimant checked out one commit

`verify-site-proofs` runs each claimant file alone. One of them, `unit-nouns.test.ts`, spawns the census, which
spawns eighteen gates, one of which is `check-repository-table`. That gate derives eight rows from the tree and
reads the history out of git:

```
check-repository-table: OK (8 row(s) under ## Repository, every one derived from the tree: Commits (at `e22e2de`) = 536, ...)
```

`actions/checkout` fetches **one commit** unless it is told otherwise. The `verify` job never told it, so in CI the
gate refused -- and the sentence it printed is the one a reader needs:

```
  - ## Repository 'Commits': the revision `e22e2de` does not resolve to a commit
check-repository-table: FAILED
```

Measured in a `git clone --depth 1` of this repository before anything was changed here. The census then reported
`check-repository-table exited 1`, the claimant was filed as a file that did not pass, the `Lint` step failed, and
every later step in `verify` -- including the coverage run -- was skipped. Three CI runs were spent on it: run
`44712270443`, run `44720657722` and run `44726319839`, the last of which is the one whose log says which file.

### The repair

`fetch-depth: 0` on the `verify` job's checkout, with the reason written where the next reader will look, and a test
that holds the relationship rather than the line: **a job whose steps run a claimant or the documentation gate must
check out the history the claimant reads.** Both directions are asserted -- a job that reaches a gate and does not
fetch must fail, and a job that only builds must not be made to -- because "every job fetches everything" is a rule
nobody could defend and "every job fetches one commit" is the defect.

The two jobs that already had it are the documentation job and `cold-tree`, each for its own stated reason; the
rule is what says the third one needed it too.

### Falsifications

| the edit | reds |
| --- | --- |
| `fetch-depth: 0` removed from `verify` | 1 |
| `fetch-depth: 0` added to `backend`, which runs no claimant | 1 |

## Finding 613 — the function written for exactly this failure was called by nobody

Finding 612 could not be diagnosed from the log, and that is a second defect. The log said:

```
verify-site-proofs: some claims could not be measured at all:
  packages/core/test/unit-nouns.test.ts did not pass, so its claims are unmeasured
    run it alone: node ... run packages/core/test/unit-nouns.test.ts --reporter=dot
verify-site-proofs: FAILED -- 2 problem(s)
```

No test named, no error line, no totals. `failureSummary` yields nothing for output carrying none of the three, and
it says so in its own comment -- right above `outputTail`, whose comment ends:

> The caller then had a file, an exit code, and nothing else.

`outputTail` was written for that case, documented for that case, and **`verify-site-proofs.mjs` never imported it**.
The repair that the tree had already reasoned its way to was one `import` away from the path it was written for,
which is the shape this campaign files most often: present, green, and absent from the place it matters.

### The repair

`failureDetail` -- a pure reader in `site-proofs.mjs` -- chooses between the two:

```js
export function failureDetail(output) {
  const summary = failureSummary(output);
  if (summary.length > 0) return summary;
  return ['(the run printed no report; its last lines were)', ...outputTail(output)];
}
```

The label is the point. A report and a tail are not the same claim, and printing them in the same voice would be
this campaign's oldest defect in the other direction: a sentence that reads like a diagnosis and is a quotation.

### Falsifications

| the edit | reds |
| --- | --- |
| `failureDetail` returning `failureSummary` alone, as it was | 1 |
| the label dropped, so a tail reads as a report | 1 |

## Finding 614 — the rule was a list of the commands somebody thought of, and the next command was not on it

### What the tree said

Run `44741826563` (the first run of v3.125) finished **7 of 8 jobs**, and the job that failed was `sensitivity`, at
shard 1 of 2:

```
verify-sites-are-sensitive: some claimants could not be measured at all:
  packages/core/test/unit-nouns.test.ts does not pass on its own (exit 1), so its claims are unmeasured
    its own output ends:    Start at  13:10:56
    its own output ends:    Duration  5.05s (transform 168ms, setup 90ms, collect 97ms, tests 4.53s, ...)
    its own output ends: JSON report written to /tmp/rca-sensitive-PpPRVb/32.json
```

The three quoted lines are the healthiest lines in the run. `verify` -- the job v3.125 had just repaired -- passed.

### Measured, in a depth-1 clone

The same three facts as finding 612, re-measured rather than assumed, because the failing file was the same file:

| command, in `git clone --depth 1` | result |
| --- | --- |
| `node scripts/check-repository-table.mjs` | `the revision `e22e2de` does not resolve to a commit` |
| `node scripts/check-unit-nouns.mjs` | `FAILED — check-repository-table exited 1, so its summary is not the one this tree reports` |
| `vitest run packages/core/test/unit-nouns.test.ts` | `Tests 1 failed \| 25 passed (26)`, exit 1 |

`git rev-list --count HEAD` answers `1` in that clone and `650` in the full one.

### Why the previous repair did not hold

Finding 612's repair was a test, and its subjects were the jobs whose steps run "a claimant or the documentation
gates", written as a hand-made list:

```js
const reaching = /(docs:check|verify-site-proofs|pnpm test|test:coverage)/;
```

The `sensitivity` job's step is `node scripts/verify-sites-are-sensitive.mjs --shard 1/2`. It is not in the list,
and it runs claimants: it spawns one vitest per claimant, which is how `unit-nouns.test.ts` came to be there at all.
So the repair was correct about the job in front of it and blind to the next job over, and the red moved from
`verify` to `sensitivity` with **nothing changed in between**. Two versions of one rule, each a list of the commands
somebody thought of; the list is the defect.

### The repair

The safe answer is the default now. Every job checks out the full history, and a job that does not is named in the
test with the commands that make it safe:

```yaml
jobs:
  # Every job checks out the full history, except `backend`. ... (findings 612 and 614)
```

`backend` installs prometheus and reads it through a reader of this repository's own; it spawns no test file. Its
exemption is held by the second case, which reads its `run:` lines one at a time and requires each to be one of the
four it is exempt for -- so a fifth command fails the test and forces the decision, which is the only way an
exemption can be kept from growing quietly.

### What it costs, measured rather than argued

| reading | value |
| --- | --- |
| `Check out` on the jobs that had full history, run `44741826563` | 3.0 s |
| `Check out` on the jobs that did not | 1.0-2.0 s |
| the repository's history | 34 MB, against 5.1 MB for one commit (5.1 MB / 1.13 s for `--depth 1` locally) |

The four jobs that gained the history are `sensitivity`, `sensitivity-shard`, `batteries` and `batteries-heavy`, and
the other three (`verify`, `artefacts`, `cold-tree`) already had it for the reasons their own comments give.

The first reading taken after the four jobs gained the history is run `44752384940`, and the two rules that size
bounds fired on it: `verify`'s ceiling **24 -> 25** min (its slowest day **722** s, **1.99x**) and the `Lint` step
**16 -> 17** min (**497** s, **1.92x**). Neither number is argued down here -- a bound under twice its reading is a
bound that fires on a slow runner rather than on a hung one -- and `Lint`, which runs the 34 claimants through
`verify-site-proofs`, is where the day sits.

### Falsifications

| the edit | reds |
| --- | --- |
| `fetch-depth: 0` removed from `sensitivity` | 1 -- `sensitivity runs claimants and checks out one commit` |
| a fifth `run:` line added to the exempt `backend` | 1 -- `backend is exempt but runs `node scripts/verify-site-proofs.mjs`` |
| `verify` added to the exemption list | 2 -- an exempt job that already has the history, and one whose commands are not on the list |

## Finding 615 — the reader of failures was written where the output has no colour

### What the tree said

The same run, the same claimant, and the reason it was invisible. `failureSummary` looks for three shapes:

```js
.filter((line) => /^\s*FAIL\s+\S/.test(line))
/^(AssertionError|Error|TypeError|RangeError|ReferenceError|SyntaxError|UnhandledPromiseRejection)\b/
lines.find((line) => /^\s*Tests\s+\d/.test(line))
```

In the CI log none of them matched, and the battery fell back to the tail -- which is why the three healthiest lines
of the run were printed as evidence. The reason is in the log itself: the tail it quoted carries escapes.

```
    its own output ends: \x1b[2m   Start at \x1b[22m 13:10:56
```

Vitest writes its failure block through a terminal, and a terminal carries more than the words:

```
\x1b[41m\x1b[1m FAIL \x1b[22m\x1b[49m packages/core/test/unit-nouns.test.ts\x1b[2m > \x1b[22mthe gate holds ...
\x1b[31m\x1b[1mAssertionError\x1b[22m: check-unit-nouns: FAILED -- check-repository-table exited 1, ...
\x1b[2m      Tests \x1b[22m \x1b[1m\x1b[31m1 failed\x1b[39m\x1b[22m\x1b[2m | \x1b[22m\x1b[1m\x1b[32m25 passed\x1b[39m\x1b[22m\x1b[90m (26)\x1b[39m
```

Every anchor sees an escape where the word should be. The run below is the same command with `FORCE_COLOR=1`:
216 escapes, `failureSummary` empty, `hungTests` empty, `exhaustedTestBudget` `null`.

### Why nothing caught it

All four readers are tested against output that has no colour, and locally it never does: a pipe is not a terminal,
so the suite's own children print plain text. The tests were green and the gate was blind in the one place it runs.
This is finding 613 one level up -- there the function was written and never imported; here it is imported and
cannot see.

### The repair

One reader, at the boundary, and the four functions call it:

```js
export function decoloured(text) {
  return String(text).replace(/\u001b\[[0-9;]*[A-Za-z]/g, '');
}
```

The escapes are removed rather than the patterns widened, because the patterns are about vitest's words and the
escapes are about the pipe this process happens to be attached to. A widened pattern would be a pattern about
terminals, and the next terminal would write a different sequence.

`hungTests` matters most: its clause is what tells "ran out of time" from "is wrong", and it reads the same `FAIL`
line. In CI that clause was being fed a coloured line and answering with nothing.

One reader was measured and **left alone**. `exhaustedTestBudget` looks for `Test timed out in 30000ms` with no
anchor, so the escape in front of the sentence sits between characters the pattern does not constrain. Removing
`decoloured` from that call reds no test, which is the reading that says the defect was never there; the reason is
written at the call rather than a uniform edit applied because three siblings needed one.

### Falsifications

| the edit | reds |
| --- | --- |
| `decoloured` removed from `failureSummary` and `hungTests` | 2 -- the coloured report and the coloured hang |
| `decoloured` removed from `outputTail` | 1 |
| `decoloured` removed from `exhaustedTestBudget` | 0 -- measured, and the reason it keeps `String` |
| the strip written as `[` .. `m` rather than as the escape | 5 -- `a [2m b` is prose, and four readings follow it |

### What is not claimed

The claimant's own JSON report is on disk -- the battery asks for `--reporter=json` for the margin and never reads
its `failureMessages` -- so a second route to the same evidence exists and is not taken here. The text is what the
battery already has, and it is now readable.

## Finding 616 — the judgement was a sentence, and a sentence is not something a run can hold

### What the tree said

Nine nouns are printed by more than one gate. Each carries a `relation` a person wrote, and the gate refuses a
shared noun without one. What the gate never did was ask whether the sentence was still true: `--write` preserves
every relation by design, the inventory holds no sets, and the census holds summaries. `O-097` named the shape and
the one measurement that would decide what to do about it.

### The measurement

The nine sentences were read against the gates they describe, and two of them were wrong in opposite directions
(finding 617). The general form is not "a sentence can be false" -- any prose can -- but that **the part of a
sentence a run could check was not separated from the part it could not**:

| the sentence | what a run can decide |
| --- | --- |
| `addendum(s)`: "both take it from `populationsOf`" | nothing -- the claim is about code |
| `addendum(s)`: "so the number is shared rather than merely equal" | the two numbers, which are equal |
| `volume(s)`: "two disjoint directories" | nothing -- it is about which files exist |
| `row(s)`: "that `8` appears twice is the corpus rather than a count two gates share" | nothing -- it is about what a row is |

Every line in the right column is a claim that two gates read one set, and every one of those has a consequence
in numbers: if two gates read one set, their counts must agree. That consequence is one field, and it was sitting
inside prose.

### The repair

A noun's gates are partitioned into **populations**, stored beside the sentence:

```json
{ "noun": "file(s)",
  "gates": ["check-citations", "check-comments-language", "check-doc-counts", "check-workflow-language"],
  "populations": [["check-citations"], ["check-comments-language", "check-doc-counts"], ["check-workflow-language"]],
  "relation": "four walks over three sets -- ..." }
```

A group of two is a claim that those two gates read one set, and the gate checks it: their numbers must have
something in common, or the run is refused. The partition is what makes `disjoint` derivable rather than asserted
-- a noun whose gates fall into more than one group is not one population -- and it is why the unit is the group
and not the noun: `file(s)` has two gates on the source walk and two elsewhere, and one flag per noun cannot say
that.

Three of the nine nouns carry a group of two, so **three of the four coinciding counts are now checked instead of
assumed**, and the fourth -- `8 row(s)` -- is printed as what it is:

```
row(s) — ...; 8 in check-fault-cases; 9 in check-l4-status; 318, 2 in check-open-list; 8 in check-repository-table
  (a count two gates print agrees, and they are not in one population)
file(s) — 37 in check-citations; 474 in check-comments-language; 474 in check-doc-counts
  (one population at 474, and the count agrees); 6 in check-workflow-language
```

The summary says how much is checked rather than how much is written: `3 population(s) are read by more than one
gate, and 3 of them agree on a count`.

### The check refused the first partition written under it

`volume(s)` was written as one group of two -- the audit volumes and the progress volumes, which are two
directories. The gate answered:

```
check-unit-nouns: FAILED — 1 population(s) the record declares one do not agree on a count:
  14 and 18 volume(s) in check-audit-volumes and check-progress-volumes
```

Fourteen and eighteen are not two readings of one set, and the arithmetic said so before any person did. That is
the whole gain: the rule that a partition is a claim now has a reader.

### What the repair also removed

The gate recognised the unwritten-sentence state by comparing the line it had just printed against `UNSTATED` --
a constant matched against a string the same file produced (`line.endsWith(' — ' + UNSTATED)`). Two readers
replaced it: `unstatedOf` and `unpartitionedOf` answer the two states from the document, and the refusal quotes
the numbers through the same formatter the green line uses (`numbersOfNoun`), so a refusal cannot drift from the
line it refuses to print.

### Falsifications

| the edit | reds |
| --- | --- |
| `volume(s)`'s partition written as one group of two | 1 -- the shipped gate refuses `14 and 18` |
| `agreementOf` comparing whole sets instead of their intersection | 2 -- `round(s)` holds `221` and `221, 50` |
| the "does not print this noun" rule removed | 1 |
| the "two populations" rule removed | 1 |
| `coincidencesOf` ceasing to read the partition | 3 -- the attribution, the summary's count, and a tree line |
| the groups left in the order the document wrote them | 2 |
| `--write` ceasing to refuse a population that no longer agrees | 1 |
| a group of two printing its numbers with no note | 2 |

**Eight edits, thirteen reds.**

## Finding 617 — two of the nine sentences were wrong, in opposite directions

### What the tree said

`addendum(s)` carried:

> one population and one reader -- both take it from `populationsOf` in `progress-volumes.mjs`, so the number is
> shared rather than merely equal

`round(s)` carried:

> both taken from `populationsOf` in `progress-volumes.mjs`; ... and no arithmetic forces the two numbers to
> agree, which is why the equality is printed rather than assumed

### The measurement

`check-open-list` imports `node:fs`, `./docs-corpus.mjs`, `node:path`, `node:url` -- and not
`progress-volumes.mjs`. It counts `## vX.YY` headings with its own `ROUND` and `ADDENDUM` patterns over the files
`progressCorpus()` names; `check-progress-volumes` labels the same headings through `labelOf` and buckets them with
`populationsOf`. **Two readers of one set of headings**, not one reader quoted twice.

So the first sentence claimed a shared reader it did not have, and the second claimed that no arithmetic forces an
equality it had just explained the forcing of. Both conclusions -- one population, so the counts must agree --
were right. A sentence can be wrong in the direction of claiming more, and in the direction of claiming less, and
the census could see neither: it checked that a sentence existed.

### The repair

Both sentences were rewritten to say what the files say, and the part that had been wrong -- *how* the two gates
reach one set -- is no longer where the claim lives. The checkable half moved into `populations`, where a run
holds it. The sentences kept the part no run can decide:

> one set of headings read twice -- both walk the volumes and count the `## vX.YY, addendum` sections,
> `check-open-list` with its own pattern and `check-progress-volumes` through `labelOf` and `populationsOf`, so
> the two numbers are two readers of one population rather than one reader quoted twice

> one set of headings read twice -- `check-open-list` counts the distinct `vX.YY` labels among them and
> `check-progress-volumes` counts the sections that carry one; that the two agree is a rule rather than a
> coincidence, because no round may be headed twice, and the second gate prints the `Pass` rounds it also counts
> beside them

### What is not claimed

The nine sentences were read once, by one person, in one round. Nothing here says the other seven are true: it
says which of them could be checked and are, and that the two that were wrong are now the two whose checkable
part is under a rule. A sentence about *why* remains a sentence, and the next one to go wrong will be found by
reading rather than by running.


## Finding 618 — the judgement was keyed by the noun and its gates, and the gate set moves

### What the tree said

Finding 616 moved the checkable half of each sentence into `populations` and keyed the judgement by
`` `${noun}::${gates.join('+')}` ``. The argument for the key was stated and it was right: a partition drawn around
four gates says nothing about a fifth, so a gate joining a noun must not inherit somebody else's answer.

The argument is about the **partition**. The key applied it to the **sentence** as well, and the two do not have the
same lifetime. A sentence says why two gates share a word; a new gate does not make that false. Under the key, a gate
joining or leaving the noun discarded both halves, and the refusal a person then read was:

```
check-unit-nouns: FAILED — 1 noun(s) are printed by more than one gate and no record says whether that is one
population or two: round(s) — 221 `vX.YY` in check-open-list; 221 `vX.YY`, 50 `Pass` in check-progress-volumes
```

which is what the gate says about a noun nobody has written about.

### The measurement

`round(s)` is the noun that pays it. `check-ci-budget` prints `N round(s)` while the ledger is behind and stops when
it catches up, so the noun's gate set moves in and out inside one round: **69 -> 70 -> 69** gate/noun pairs across
v3.127, with the judgement dropped and rewritten at each move, three times in a round that had two gates for most of
it.

The second half is worse and the key alone does not fix it. The judgement lived on the entry in `shared`, and
`shared` is **derived**: a noun printed by one gate is not in it. So a round in which `check-ci-budget` stays silent
would have removed the entry, and with it the sentence -- under any key. Storing the sentence on the noun's entry in
`nouns` is the half that makes it survive.

The third half is the one that had been invisible since finding 616. Six readers asked `partitionProblems(judgement)`
for the gates, and the function read them from `judgement.gates` -- the record. So every reader compared the record
with itself: a gate joining the noun changed nothing, `declared` stayed true, and the partition silently covered a set
it had never been drawn around. The tree was never consulted.

### The repair

Three changes, one sentence each.

**The key is the noun.** A judgement belongs to the word a person wrote about, and a gate joining the word is a
change to the partition rather than to the sentence. What the key still refuses is a judgement carrying over between
nouns: `row(s)` and `file(s)` are different populations, and their sentences are not interchangeable.

**The record lives on the noun.** `nouns` is derived and every noun is in it; `shared` is derived and only the shared
ones are. Storing the judgement on the `nouns` entry means a noun that leaves `shared` for a round keeps its
sentence, and the round it comes back is green without a person retyping anything.

**The readers take the gates from the census.** `partitionProblems(judgement, gates)` takes the set this run found,
and `stateOf(census, judgements, noun)` returns the gates, the record and `declared` together so that the six readers
cannot each hold a different idea of what to compare. The refusal a new gate now produces names the gate:

```
check-unit-nouns: FAILED — 1 noun(s) are printed by more than one gate and no record says which of them read one
population: round(s) (check-ci-budget is in no population)
```

### What the round measured

| reading | value |
| --- | --- |
| unit nouns / gate-noun pairs | **53** / **69** |
| shared nouns | **9**, each carrying a sentence and a partition |
| populations | **22**, of which **3** hold more than one gate |
| coinciding counts | **4** -- **3** inside a declared population, **1** across two |
| `round(s)`'s gate set across v3.127 | **69 -> 70 -> 69** |

### The falsifications

Two mutations, each aimed at one of the two halves of the repair, and each killed by a case that names the defect
rather than the shape:

| the mutation | the case that went red |
| --- | --- |
| `partitionProblems` not reporting a gate nobody placed | "keeps the sentence when a third gate arrives, and names the gate nobody placed" |
| `judgementsIn` reading `shared` instead of `nouns` | "keeps a judgement through a round in which its noun is not shared" |

The first is the assertion `O-099` is about: the sentence surviving is worth nothing if the run does not also say
what it could not place. The second is the half a noun-shaped key alone would not buy, and it is the one the round
would have shipped without if the record had stayed on the derived list.

## Finding 619 — the ceiling was sized from a day, and the bounds inside it are not a day

### What the entry said

`O-095`: `R12` refuses a ceiling under twice a job's slowest recorded day, and what the rule does not say is what
happens between twice that day and the sum of the bounds inside the job. `batteries` held **83** minutes of step
bounds in a **34**-minute ceiling, so a slow-but-not-hung day reached the ceiling with every step still inside its
own bound and the verdict named the job. The entry left the choice open: which of the two failures such a day should
produce -- the job's death, which names nothing, or a ceiling inflated until it cannot fire, which names nothing
either -- and noted that the third answer, a job split small enough that the sum fits, was what the same arithmetic
had said twice before.

### The measurement

Every job of the workflow, from the recording of run `45033355331`:

| job | bounds inside it | ceiling | slowest day | the day the bounds describe |
| --- | --- | --- | --- | --- |
| `verify` | **57** min | 25 | 722 s | 28.5 min |
| `backend` | **48** min | 48 | 910 s | 24.0 min |
| `sensitivity` | **46** min | 26 | 675 s | 23.0 min |
| `sensitivity-shard` | **43** min | 26 | 669 s | 21.5 min |
| `batteries` | **83** min | 34 | 1 012 s | **41.5 min** |
| `batteries-heavy` | **54** min | 31 | 921 s | 27.0 min |

The last column is the number the entry did not have. Each bound is at least twice the slowest reading of its own
step, so the bounds are sized from **each step's worst day, taken from whichever day had it** -- a composite, not a
day. A day on which every step runs at the worst it has ever been is therefore a day the bounds themselves describe,
and it is **41.5** minutes for `batteries`: 1.22 times the ceiling that was meant to hold it. Nothing about that day
is exotic. The two heavy batteries are 700 s of deterministic work, so a slow runner slows both, and the four
half-minute batteries slow with them.

That is the defect, stated without a hypothetical: **the ceiling answered for one day while the bounds were sized
from a composite of six**, and the composite is larger than twice any single day by construction.

### Why the sum was refused in v3.123 and is the answer now

`ci.yml` carries the refusal in its own words, in the comment above `batteries`: a ceiling sized to hold the bounds
"would be a ceiling that cannot fire either -- the same defect as a bound that cannot". The symmetry is the thing to
check, and it does not hold. A **bound** that cannot fire has nothing behind it: the ceiling kills the job and the
verdict names no step, which is the sentence every bound in `ci-budget.mjs` exists to replace. A **ceiling** that
cannot fire has every step's bound behind it, and each of those names its step. The ceiling is the only number in a
job with nothing behind it, so it is the one number whose job is not to name anything: it is the backstop for the
case where a bound does not fire -- an action that ignores its timeout, a step whose bound was removed in a window
this gate has not seen yet.

So the two shapes are not symmetric, and the price of the wider ceiling is wall clock rather than a verdict: a hang
no bound catches now burns up to 84 minutes instead of 34. The `batteries` comment says which of the two was paid.

### The repair

`R13` replaces `R12` and subsumes `R5`. One comparison, with two terms and a stated winner:

```
need = max(2 x slowest day, the bounds inside the job + 2 x the seconds no step spends)
```

- **the bounds plus the seconds no step spends**: every step dies at its own bound, so a job whose every step is
  bounded cannot outlive the sum of them. The overhead is the part no step accounts for -- the runner's own setup,
  its teardown, and the `Post` half of every action -- and it is measured rather than stated: `measure-ci-baseline.mjs`
  now writes each job's own wall clock beside its steps (`total`), and a recording that does not hold it is refused
  rather than defaulted. It is doubled for the same reason every bound is: a runner twice as slow also sets up twice
  as slowly. Measured this round: **3 to 8 seconds per job**.
- **twice the slowest day** is `R12`, kept for the jobs whose steps carry no bound at all -- `artefacts` and
  `cold-tree`, which `R3` excuses because their whole day is under the floor.

`R5` is deleted rather than kept beside it. It asked whether a bound expires before the job does, one bound at a
time, from the seconds measured in front of it -- and that question is a special case of the sum: `bound + prefix` is
at most the sum of the bounds, so a ceiling that holds the sum holds every deadline. Keeping both would mean two
sentences for one defect, and the one `R5` printed (`its bound expires at 33 min -- past the job's 30`) is a weaker
diagnosis of the same tree.

The ceilings, and the two clauses each one's comment now carries:

| job | was | now | the number |
| --- | --- | --- | --- |
| `verify` | 25 | **58** | 3 420 s of bounds + 10 s of overhead |
| `backend` | 48 | **49** | 2 880 + 10 -- the one ceiling that was already the sum |
| `sensitivity` | 26 | **47** | 2 760 + 10 |
| `sensitivity-shard` | 26 | **44** | 2 580 + 16 |
| `batteries` | 34 | **84** | 4 980 + 16 |
| `batteries-heavy` | 31 | **55** | 3 240 + 6 |

### What the round measured

| reading | value |
| --- | --- |
| bounds inside the workflow | **331** min, against **50** min measured |
| ceilings whose number is the bounds | **6 of 8**; the other two are twice a day |
| the least room above a day | `backend` at **3.2x** its slowest day |
| the largest single ceiling | `batteries` at **84** min, 4 of its 20 bounds being floors |
| the overhead the recorder measured | **3-8** s per job, across 8 jobs |
| the refusal a newcomer sees | the sum, the count of bounds, and the two repairs |

The green line prints which of the two terms holds each ceiling, because a reader of `84 min` on a job that takes 12
has to be able to see that the number is not a preference:

```
6 of 8 ceiling(s) hold the bounds inside them and 2 hold twice a day; the least room above a day is
backend at 49 min, 3.2x its slowest day of 910 s (run 44516888528)
```

### The falsifications

Four mutations, each aimed at one clause, and the count of reds each produced:

| the mutation | reds |
| --- | --- |
| the overhead dropped from `ceilingNeedOf` | 4 |
| the day term alone -- `R12` restored | 11 |
| a recording with no `total` accepted | 1 |
| `boundsSecondsOf` counting the steps that inherit the job's budget | 8 |

**Four mutations, 24 reds.** The second is the round in one line: restoring the rule this round replaced turns
eleven cases red, which is what it cost to have it.

### What the round did not change

The floor. `batteries`' ceiling is 84 minutes and **42** of them are fourteen steps bounded at three minutes that
measure seconds -- the floor is a rule about a cold package index, and it is now half of every ceiling in the
workflow. `O-100` is that observation: the number a ceiling has to hold is dominated by the floor rather than by
work, and the next round that asks whether the floor should be per job rather than per step has this finding's
arithmetic to answer to.

## Finding 620 — the sentence states a count, and nothing read the sentence

### What the entry said

`O-098`: twenty-two populations are declared over the nine shared nouns and nineteen of them hold a single gate, so
the partition says nothing a reader could not read off the gate's name -- what `check-l4-status`'s `9 row(s)` counts
is in the sentence beside it, not in `populations`. And the census reads the line the number came from and keeps
only the count and its qualifier, so the one sentence that says what a gate counts is the sentence the census
discards. The entry left the label's home open -- the inventory, "where it rots like every sentence", or the gate's
own line, which the census would have to keep -- and said the two costs had not been measured.

Neither of those costs is the finding. Reading the sentences for **figures** is.

### The measurement

The nine relations were read for every numeral in them, with the counts each gate prints under that noun beside them:

| noun | the figures its relation states | the counts the gates print | |
| --- | --- | --- | --- |
| `comment(s)` | **4.7** | 25,855 and 1,252 | the ratio is **4.842**, so 4.7 is neither count and not their quotient |
| `file(s)` | 37, 474, 6 | 37, 474, 6 | every one printed |
| `row(s)` | 8 | 8, 9, 318, 2 | printed |
| `run(s)` | 0 | 0, 6 | printed |
| `volume(s)` | 14, 18 | 14, 18 | printed |
| `addendum(s)`, `reading(s)`, `round(s)`, `row break(s)` | none | -- | -- |

**Five of the nine sentences state a figure -- eight figures in all -- and one of them is wrong.**

### Why the wrong one is the finding

`comment(s)`'s relation said "the smaller is 4.7 per cent of the larger". For 4.7 to hold this run, the numerator
would have to be **1,215** or the denominator **26,638**; the two gates print 1,252 and 25,855. So the sentence was a
copy of a pair of counts taken in an earlier round, one of the pair moved, and the copy did not move with it -- and
nothing said so, because nothing read the sentence.

That is the module's own argument turned on itself. `scripts/unit-nouns.mjs` keeps the counts out of the inventory on
one ground: **they move every round**, and a record that held them would go red for a reason its subject has nothing
to do with. A relation stating a count is a count in the record, and it has none of that argument's protection,
because there is nothing to compare it with. The round moved that count again while it was being worked on -- the
source walk counted 25,828 comments when the entry was written and 25,855 when this finding was, the difference being
this round's own comments -- which is the argument rather than an accident.

### The repair: a figure must be a count a gate printed under that noun

`figuresOf` reads the numerals a sentence states; `unprintedFiguresOf` compares each with the counts the census holds
for that noun, and the census refuses the two that do not match. It is the **fourth refusal**, beside the third, and
it goes through both doors for the same reason the third does: `--write` copies the sentences forward verbatim, so the
one door that is supposed to leave the record truthful would otherwise rewrite a false sentence into it. The refusal
names the figure and the counts, because a person reading `comment(s) states 4.7 and the counts under it are 25,855
and 1,252` knows in one line that the sentence is a copy of a pair that has moved, and a message that said "a relation
states a number" would send them looking for which.

What is left in `comment(s)`'s relation states the relation and not the ratio: "with no member in common and the
smaller a small fraction of the larger, which the two counts above state and this sentence no longer copies". The
four sentences that quote a count keep it, and their quotes are now claims the run checks -- `file(s)`'s three walks,
`row(s)`'s two eights, `run(s)`'s zero, `volume(s)`'s two directories.

### A numeral glued to a letter is a name, and that is not a nicety

`row(s)`'s relation names "the L4 registry", and `check-l4-status` is the gate that prints it. A reader that counted
every digit would read `4` in both and refuse the one sentence that had to name them. So the rule is lexical rather
than a list of exemptions: a numeral **glued** to a letter, a hyphen, a dot or an underscore belongs to a name --
`L4`, `check-l4-status`, `v3.129` -- and a numeral that stands alone is a count. A list of names to exempt would be a
list to keep equal to the corpus, which is the defect this campaign keeps finding; the glue is a property of the
token.

Measured rather than asserted: with the glue test removed, the shipped tree goes red on `row(s) states 4` -- the `L4`
in the only sentence that says what that gate reads.

### The label, measured (which is what `O-098` asked for)

The nineteen populations of one are backed by **20** uses: one gate prints `row(s)` twice (`318` table rows, `2` rows
of the newest record judged) and one prints `run(s)` twice.

| what was counted | value |
| --- | --- |
| words after the noun | **empty in 8 of 20** -- the corpus writes `474 file(s), 21676 comment(s)`, so the count ends the clause |
| words that are half a parenthesis | **2**, and they are the two `comment(s)` uses: `(21676 line` and `(1064 line` |
| the gates' own lines, whole | **6,047** characters over those 20 uses |

So neither cost the entry named is the right one. A label lifted out of the gate's line is a fragment in two uses of
twenty and nothing at all in eight, and a fragment is worse than no label because it looks like a claim. And a
sentence per gate would be nineteen sentences restating what one sentence already says: **eight of the nine**
relations name every population their noun is partitioned into, and in the order the census prints them.

The label therefore stays where it is -- in the relation, one sentence per noun -- and the rule this finding adds is
the same rule from the other side: **the sentence says which set, the gates say how many, and neither copies the
other.** That is why `comment(s)`'s sentence had to lose its ratio rather than have it corrected.

### What the round did not change

- **The nineteen populations of one.** They are not claims, and the census does not check them (a group of one has
  no equality in it); they are the record of a gate having been placed. Deleting them would make `row(s)`'s four
  gates indistinguishable from four gates nobody has considered.
- **`run(s)`'s relation**, which lumps its three language gates into one clause while the partition holds three
  populations. It claims no equality between them, so nothing is unchecked; the nine-gate sentence is accurate and
  one clause shorter for it.
- **`1,252` of `25,855`** is not restated anywhere. The counts these sentences quote are checked, and a ratio of two
  of them is not one of the things the record states.

### Falsifications

| the mutation | reds |
| --- | --- |
| `figuresOf` blind -- no numeral read at all | 4 |
| the glue test removed, so `L4` and `check-l4-status` count | 2 |
| the run's fourth refusal dropped | 1 |
| `--write`'s fourth refusal dropped | 1 |
| only the first unprinted figure reported | 1 |

**Five mutations, 9 reds.** The second reddens the shipped tree as well as a case, which is the one of the five that
says the rule is about this corpus rather than about a fixture.

### What this finding is an instance of

Finding 602's form: **a comparison present in the output is not a comparison anyone made.** Here the comparison was
absent as well -- one number printed by two gates and a third copy in prose, with no reader holding any two of them
together. The census held the first two from v3.125 and the third from nothing at all.

## Finding 621 — the live list states a size, and nothing read it

### What the entry said

`O-101`, opened by v3.130 in the same round its census learned to read a sentence: *"the live list
states counts too, and the round that checked the census's sentences left its own list unread."* It
named the evidence -- `O-019` says `docs/acceptance.md` "is 96 KB" -- and it named two costs, "a
reader per shape of figure and a rule that a limit states none", and it chose neither.

Neither cost is the round. The size is.

### The measurement

Every figure in `## Open` carrying a unit a commit can take again -- `bytes`, `KB`, `MB`, `lines` --
read beside the file each one names:

| where | the figure | what the tree has | |
| --- | --- | --- | --- |
| the `## Open` lead-in | `98,927 bytes` **by** v3.110 | -- | dated with a preposition the reader cannot read |
| `O-019` | `96 KB` | **165,067 bytes** (161.2 KB) | **1.68x** too small |
| `O-019` | `284 lines` (L3) | L3 is **330** lines | 46 lines short |
| `O-019` | `139 lines` and `11,139 bytes` (the per-round clauses) | **897 lines** and **77,180 bytes** | **6.5x** and **6.9x** |
| `O-021` | `962,086 bytes` (a paper) | not in this tree; pinned by sha256 | unmeasurable here |
| `O-101` | `165,067 bytes` | 165,067 | true, and quotes `O-019`'s 96 KB |

**Nine figures with a takeable unit, seven of them read** -- the other two sit inside a quotation --
**and six of the seven are wrong.** The one that is right is the entry that reports the defect.

### Why `O-019` is the finding and not the anecdote

`O-019` argues that `docs/acceptance.md` has grown too large to keep growing, and it supported the
argument with its size. The file is 1.68 times the figure. And the evidence the entry actually leans
on -- "the per-round clauses are 139 lines and 11,139 bytes of history sitting in a specification" --
is now 897 lines and 77,180 bytes, because thirty-four rounds have appended a clause each. The entry
that argues the history has outgrown the specification was quoting the history at a sixth of its
size.

That is the shape finding 620 found one document over, in the census: a number in a sentence that
nothing read, drifing while the thing it measured moved. The census answered it with **a figure must
be a count a gate printed**. That answer cannot be transferred as written, because a live entry's
numbers are not counts of the vocabulary -- they are measurements of a round, and no gate prints
`77,180`. So the question `O-101` left open is not "which shapes can a reader read" but **what makes
a measurement in prose safe**.

### The rule: say when, or be this tree's

A figure whose unit a commit can take again must carry the round that took it, or be the size the
tree has at this commit:

    `161.2 KB at v3.131`   a record -- the tree it was measured on is named, and a record does not age
    `165,067 bytes`        a claim about now, and accepted only while it is true
    `96 KB`                refused, and the refusal names the size the file has

The units are the four **a commit can take again**: `bytes`, `KB`, `MB`, `lines`. `439 s` and `84
minutes` measure a run that is over; no gate can take them, and a rule about them could be satisfied
only by guessing. That boundary is the whole reason `O-011`'s `439 s` and `O-090`'s `2 873 ms` pass
while `O-019`'s `96 KB` does not, and it is written in the module rather than left to be discovered.

**Why a date and not the current size.** The file grows in most rounds, so a rule demanding this
commit's size would be red on the round after every round that wrote one -- and a rule that is always
red is the crying-wolf defect this campaign has recorded more than once, and the argument the volume
budget already makes for judging only the volume that can still grow. A date is what turns a
measurement into a **record**, and the live list is where a work item's evidence lives.

**The two refusals are two repairs.** A sentence that names a file of this tree is told the size the
file has (`that file is 165,067 bytes at this commit (161.2 KB)`); a sentence that names nothing is
told to name the round (`868 lines at vX.YY`). A single message -- "an entry states a size" -- would
send a person looking for which, and a message that named only the rule would send them looking for
how.

### Three things the reader has to know that a pattern does not say

**A quotation is not the list's claim.** `O-101` could not report `O-019`'s 96 KB without quoting it.
A reader that refused the quotation would refuse the report, which is the one repair a guard may
never demand -- and the corpus has the precedent: `v2.26` quotes headings that are not headings and
the volume reader tracks fences for it.

**A sentence ends at a full stop inside a bold mark.** `O-019` writes `round.** L3 is 284 lines`, and
a boundary pattern of a full stop and a space reads the two sentences as one -- which paired L3's
length with the whole document's and produced a refusal whose repair would have been wrong: `284
lines` is a section, and the file is 2,051. Measured rather than assumed: with the mark-up dropped
from the boundary, the shipped tree is refused with `284 lines ... and that file is 2,051 lines`.

**The lead-in is the list's voice too.** The paragraph above the bullets -- the one that says what the
split cost -- held `65,544 of 98,927 bytes by v3.110`. A rule scoped to bullets would have left the
text above them unread, which is finding 162's shape (a document that gains a text must gain a reader
for it) one level in. It is read now, and it is dated `at v3.110` rather than `by`.

### What the round changed in the entries

- `O-019` was re-measured rather than corrected in one figure: 96 KB became nothing, because the
  file's size is not what the argument needs; L3's length and the per-round clauses are stated with
  the round that took them; and the headline says what grows instead of how big it is.
- `O-021` lost `962,086 bytes`. The digest is the pin -- "`openrca-2.0`, sha256 recorded" -- and the
  byte count was doing no work in a sentence about two other targets having no pin at all. A figure
  that comes back must come back dated.
- The lead-in's `by v3.110` became `at v3.110`: one word, and the figure became a record.

### What the round did not change

- **Every record and every closure.** A `### Left open` row and a struck entry are frozen: their
  numbers were measured at the round that wrote them, and a rule demanding dates of them would be
  demanding an edit of the record. The gate reads the live list and no other kind.
- **`check-doc-counts`'s subject.** The counts in the index's tables have had a reader since finding
  123, and that reader is stricter than this one: it demands the scope as well as the number.
- **The census's rule.** `figuresOf` and `unprintedFiguresOf` are unchanged, and the two rules are not
  in conflict: a census sentence describes the vocabulary **now**, so a figure in it must be a count a
  gate prints; a live entry describes a defect **at a round**, so its figures are measurements, and
  the thing a measurement needs is a date. One document, two subjects, two rules -- and the difference
  is written in both modules rather than left to whichever reader arrives first.
- **A date cannot make a figure true.** `96 KB at v3.131` would pass while being wrong, exactly as a
  ledger's `(as of `sha`)` marker passes while naming a tree it was not measured on (finding 309). The
  guard's subject is the accident -- a measurement that aged while the thing it measured moved -- and
  not the lie.

### The round's own text, twice

- **The reader's header stated the length of the file it reads, without a round.** It said
  `docs/acceptance.md` was `2,021 lines` -- the exact shape this finding refuses, in the module that
  refuses it. No gate reads a source header, so the round's own look is the only reader there is; the
  header says `2,051 lines at v3.131` now.
- **This finding's table said `77,169` bytes where the entry, the closure and the round's record say
  `77,180`.** Measured again, the tail from `### The open list (v3.62)` to the end of the file is 897
  lines and **77,180 bytes** -- 77,179 with the final newline dropped, which is not what any of the
  three statements means. Eleven bytes, in the round whose subject is figures that nothing reads; the
  repair is in place rather than annotated, because a record that disagrees with the entry it is the
  authority for is the one disagreement neither side can settle.
- **The index published a count of a tree that did not exist yet.** Its repository table said **672**
  tracked files in the commit that carried three new ones, so the commit a reader checks out holds
  **675**. `--write` was run before `git add`, which is the case this guard's own header records
  having happened once already -- v3.83 published `Tracked files 638` where its commit held 639 -- and
  the reprimand is in the same place it was then: a gate green in the round and red on the next
  checkout of its own commit, on content nothing had touched. The row is re-derived from the commit
  rather than from the tree that was about to become one.

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

**Eleven mutations, 22 reds.** The fourth reddens the shipped tree as well as a case, which is the one
of the eleven that says the rule is about this corpus rather than about a fixture.

### What this finding is an instance of

Finding 309's ledger rule -- **one ledger describes one tree, and it says which** -- applied where
nobody had applied it: prose. A ledger's `(as of `sha`)` and a live entry's `at v3.131` answer the same
question, and until this round only the ledger was asked.

## Finding 622 — the floor is a property of the job, and a prefix is what every job shares

### What the entry said

`O-100`, open since v3.129: *"Half of every ceiling is the floor, not the work. `batteries` needs
84 minutes and **42** of them are fourteen steps bounded at three minutes that measure seconds,
and `verify` needs 58 with **24** of them the same floor six times."* And the question it left:

> `[open: whether the floor should be a property of the job rather than of the step -- one
> allowance for everything before the first real step -- and what would then refuse a cold day]`

Neither number survived re-measurement, and the shape did.

### The measurement

Every step of the workflow, its bound, and what it spent in run `45054272460`:

| job | steps | bounded at the floor | their bounds | what they spent | ceiling |
| --- | --- | --- | --- | --- | --- |
| `verify` | 12 | 9 | 27 min | 25 s | 58 |
| `backend` | 7 | 6 | 18 min | 18 s | 49 |
| `sensitivity` | 8 | 6 | 18 min | 32 s | 47 |
| `sensitivity-shard` | 7 | 5 | 15 min | 8 s | 44 |
| `batteries` | 20 | 16 | **48** min | **165** s | 84 |
| `batteries-heavy` | 8 | 5 | 15 min | 17 s | 55 |
| `artefacts` / `cold-tree` | 21 | 0 | -- | -- | 15 / 20 |

**47 of the workflow's 62 bounds are the number three**, and together they are **141 of the 331
minutes** the bounds add up to. The workflow's ceilings add up to **372** minutes and the steps
measured **52**. The floor is not half of every ceiling; on `batteries` it is more than half.

Four of every job's floor steps are the same four: the checkout, the two setups, and the install.
They are also the four steps every job of the workflow runs **identically**, which is the fact the
rule is built on rather than a coincidence the rule notices.

### The rule

**The prefix is the leading run of steps every job of the workflow shares, name and command both,
and its allowance is the floor spent once.**

    Check out | Set up Node.js | Set up pnpm | Install dependencies     the prefix, 4 steps
    one allowance of 3 minutes, per job                                  what a cold runner costs

- A prefix step declares **no** `timeout-minutes` of its own. One that does is refused: it is the
  same three minutes stated again, once per step, until the ceiling is paying for cold runners
  that cannot happen.
- A **work** step is bounded by twice its own day. The floor is no longer asked of it.
- `R13`'s `bounds` term is the step bounds **plus** the prefix's allowance, so the ceiling still
  holds every number a step can spend.
- A job promise names the steps that carry a bound: the prefix has none to promise.

The workflow after the round: **38** steps bound themselves (was 62), **32** are charged to their
job's allowance, **13** inherit their job's ceiling, **0** are reached by nothing. The bounds add up
to **216** minutes plus **24** of allowance, where they added up to 331, and the ceilings to
**275** where they added up to 372.

### Why the floor was on the wrong object

A bound does not buy slack; it buys **attribution**. A step that hangs dies at its own bound and the
verdict names it, whatever the number is. The three minutes bought nothing but tolerance -- and
tolerance is spent where the unpredictable thing happens, which is at the start, once. A mutation
battery that measures 54 s and is bounded at two minutes dies at two minutes if a cold runner makes
it slower, and the message names the battery; the same battery bounded at three minutes dies one
minute later and names the same battery.

The one case the floor was genuinely for -- a step nothing has ever measured -- is unchanged: a
declared step is still refused below the floor, because a step with no day has no other number to
argue from.

### The first thing the round's own numbers refused

Lowering the floor's work steps to twice their day, the round wrote `2` minutes for the round-trip
record battery, whose recording says 54 s. **`R10` refused it**: the same command took **70 s** in
run `44576264388`, and 120 is under twice 140. The bound went back to 3 -- one of the 47 surviving,
and the only one left at the floor in the whole workflow. A rule about the day this tree is running
today would have shipped a bound that refuses a day this tree has already met.

### The rule that asked for evidence the recording already held

`R6` refused every ceiling narrower than the recording's, on the argument that a step bound which
fits inside the wider ceiling may expire after the job has died at the tighter one. That argument is
`R13`'s question -- the ceiling holds every bound plus twice the seconds no step spends, or the gate
names the number -- and what was left of `R6` was a demand for a re-measurement. **The number the
demand was standing in for is already in the file**: twice the slowest day this repository has met,
plus twice the overhead. So the refusal is deleted rather than kept beside `R13`, `R12` refuses a
ceiling under twice the day with its own sentence, and every narrowing is printed beside every
widening, because a ceiling that moves is a claim a reader has to see.

**Six ceilings were narrowed under the recording this way**: `verify` 58 -> 39, `backend` 49 -> 36,
`sensitivity` 47 -> 34, `sensitivity-shard` 44 -> 33, `batteries` 84 -> 54, `batteries-heavy`
55 -> 44. `artefacts` 15 and `cold-tree` 20 were kept, and the exception is stated in the workflow
rather than derived: their bounds term is the allowance and nothing else, so twice the day decides,
and the day their recording holds is the **warm** one -- a ceiling sized from a warm day for the job
whose subject is a cold tree would be the one number in the file measuring the wrong day.

### Three things the rule has to know that the table does not say

**A name is not a claim.** Two jobs can both call a step `Check out` and run different commands.
The prefix compares the command as well as the name, or a job would be handed an allowance for work
it does not share.

**One divergent job caps the prefix for every job.** `backend` has no `Install the shells` step, so
the shared prefix stops at four for all eight jobs, not five for seven of them. What every job runs
identically ends where any of them stops running it -- and the shipped workflow's four is a
measurement of these eight jobs rather than a constant.

**A workflow of one job has no prefix.** There is nothing for its steps to be common *with*, and a
prefix of "every step" would excuse every single-job workflow from bounding anything -- the
degenerate case that would turn this rule into a hole.

### What the round did not change

- **The floor's number.** Three minutes, once per job. The argument for it -- a cold package index,
  a missed cache, a first build -- is the argument for one of them, not for fourteen.
- **A declared step's floor.** A step no run has measured is still refused below three minutes.
- **A bound above twice the day.** The gate permits any larger number, because a step whose cost
  really does depend on the network argues it (`Install a backend` at 30 minutes against 19 s), and
  `R10` still refuses a bound under twice the slowest reading of the same command anywhere.
- **`artefacts` and `cold-tree`'s ceilings.** Stated above rather than derived.

### What the round changed in the plan a person reads

`verify:local --list` used to print `backend bounds all 2 of its step(s) on its own (largest 3m of
the job's 49m) ... a hang there names the step rather than the job`. **No job of this workflow is
that shape any more**, so the clause is empty for all eight and the pool line is what a reader gets:
`verify 39m across 8 step(s)`. The sentence is still owed to a workflow of one job, which is exactly
that shape, and it is driven by a case rather than left to the tree it no longer describes.

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

**Nine mutations, 58 reds.** The sixth survived the first run of this table, and the case that kills
it -- a ceiling eighteen seconds short of the allowance -- is the only case in the suite that puts a
ceiling exactly on the sum.

### What this finding is an instance of

Finding 619's rule -- **a ceiling holds the bounds inside it** -- asked of the bounds themselves:
`R13` made the ceiling answer for the numbers a step can spend, and this round made the numbers
answer for what a runner actually costs. The floor was a per-step copy of a per-job fact, which is
finding 604's shape (one number, two populations) with the population being "cold runners".

## Finding 623 — a distance that is zero is a number, and the census reads numbers

v3.132 recorded run `45104479651` as the recording, and in doing so caught the ledger up: the row
`R7` compares against now sits in the newest round, and `ledgerWhere` printed `, in the newest round`
where it had printed `, 1 round(s) before \`v3.132\``.

That sentence is a census key. `golden-master/unit-nouns.json` lists which gates print `round(s)` and
what each one counts under it, and v3.132 added `check-ci-budget` to that noun on the strength of the
sentence it printed while the ledger was behind. One recording later the sentence changed shape:

```
$ node scripts/check-unit-nouns.mjs
check-unit-nouns: FAILED — 1 noun(s) are printed by more than one gate and no record says which of
them read one population: round(s) (check-ci-budget is in a population and does not print this noun)
```

Nothing in the tree had changed its mind. `round(s)` was printed in the state where the ledger was
behind and withheld in the state where it was current, and the two states are one recording apart —
which is the ordinary life of this gate, since every round that records its own run moves it from the
first state to the second.

### Why the phrase was wrong rather than the census

`in the newest round` says the same thing as `0 round(s) before \`vX.YY\``, and says it better: a
sentence about a distance reads as prose when the distance is zero. What it does not say is the
**number**, and a census reads numbers. The choice is not between two phrasings of one fact; it is
between a fact a reader can use and a fact a reader can use *and a gate can count*, and this
campaign has taken the second every time it had to choose (finding 604, finding 620, finding 621) —
the difference here is only that the prose was the *better* text, which is why it survived a round.

### The same defect as finding 618, one level down

Finding 618 was this with the whole judgement as its subject: the census keyed a noun by the **set**
of gates printing it, and that set moved whenever a gate stopped printing, so six readers compared
the record with itself and a sentence that had not stopped being true was retyped three times. The
repair keyed by noun and moved the judgement into its own table, so the set is stable now.

This is the smaller half of the same shape. The set did not move: `check-ci-budget` was in the
population before and after. What moved was whether one of its members **printed the noun at all**,
and a population that holds a gate to a number can only do so while the gate prints the number. The
census was right both times — it refused a tree in which the record said a gate prints a noun it no
longer prints — and the repair is not in the census but in the sentence, because a count that can be
zero has no business being spelled in words.

### The three states that print nothing, and why they are not this defect

`ledgerWhere` returns early in three places: no sections, no round headings among them, and a newest
row whose home section is not a round. All three are states in which there is no row to place, which
is `R7`'s subject and not this one's: a log whose newest round carries no closing reading is refused
before this sentence is written, so a green run never reaches them. They are left as they are rather
than papered over with `0 round(s)` in a sentence about a row that does not exist.

### Falsifications

| the mutation | reds |
| --- | --- |
| the prose branch restored | 3 |
| the distance always zero | 1 |
| the noun without its number | 2 |
| the round named is the one the row sits in, always | 1 |

**Four mutations, 7 reds.** The first is the defect itself, and it reddens three cases: the two that
read the sentence in this test file and the census case, which runs the real gate over the shipped
tree and refuses it for the reason above. The third is the shape the census actually catches -- a
noun that is printed and cannot be compared -- and the fourth names the wrong round while keeping
both numbers, which no assertion about counts alone would see.

### What this does not settle

Whether a *distance* belongs in a census at all. `round(s)` now has three readers and only two of them
count a population; the third states how far the ledger sits from the newest round, its number is
compared with nothing, and it moves every round the log does not close. That it must now print `0`
makes the census quieter, not the noun more coherent, and the sentence that would decide it -- that a
noun in the census counts members of one population -- has not been written.

## Finding 624 — the allowance is the one number the budget argues, and it owes the history a floor

`O-102` opened at v3.132 with a sentence that has not been answered since: three minutes is the
only number in the budget that nobody measured. Every ceiling in `ci.yml` holds exactly one
allowance, and the state the allowance exists for -- a runner whose package index, cache and first
compile are cold -- has never been recorded, because every run this repository holds is a warm day.

v3.132 moved the floor from each step to each job (finding 622) and left the number alone. That was
the right unit and an unexamined magnitude, and the difference matters: `R4` sizes a step bound from
the seconds that step spent, so a step bound that is wrong is wrong about a reading; the allowance is
wrong about a *state*.

### The measurement

Every reading this history holds, summed over the steps of each job's prefix:

| job | slowest whole prefix | run |
| --- | --- | --- |
| `backend` | **14 s** | `45033355331` |
| `sensitivity` | 14 s | `44576264388` |
| `artefacts` | 13 s | `44698243645` |
| `cold-tree` | 13 s | `45104479651` |
| `batteries-heavy` | 13 s | `45054272460` |
| `sensitivity-shard` | 13 s | `44656781771` |
| `verify` | 12 s | `44656781771` |
| `batteries` | 12 s | `45018766872` |

**21** readings, **8** jobs, and the slowest prefix any of them timed costs **14 seconds**. The
allowance is **12.9** times that.

### What the rule can be, and what it cannot

It cannot be "size the allowance from a reading", because the reading that would size it is the one
state the history has never recorded. A rule written that way would be red from the day it existed
until a cold day happened to be caught -- and a rule that is always red is a rule every reader learns
to skip, which is the argument the volume budget already makes for judging only the volume that can
still grow.

What the history can do is refuse a number it already contradicts, and that is `R15`: an allowance
under twice the slowest *whole* prefix any recording holds is a day the budget has already refused
for being slow. Twice, because it is the same multiple `R4` asks of a work step, and for the same
reason -- a runner twice as slow as the slowest ever seen must finish rather than be refused for
being slow.

The rule binds at 90 seconds: a prefix that cost 90 s makes the three minutes exactly twice it, and
one that cost 91 s raises the requirement to four minutes. That number is the point. The allowance
is a claim, and what a claim owes is a visible size and a line past which it becomes false.

### The sum that would be small and wrong

A row counts only when it measured **every** step of the prefix. A history missing one setup step
sums to less than the prefix cost, and a sum with a hole in it is the shape `jobDays` refuses one
level up: the number would be small, defensible and wrong. Ties go to the newer run, for the reason
`worstReadingFor` gives -- the answer has to be a function of the file rather than of the order
somebody appended in.

### What the green line says

    ... 32 run before the job's first real step and are bounded by one 3-minute allowance for the
    prefix, which is 12.9x the slowest prefix any recording holds (14 s in `backend` of run
    45033355331), 53 min measured ...

A summary that printed only `one 3-minute allowance` would make an argued value indistinguishable
from a measured one, which is finding 588's complaint one line over.

### Falsifications

| the mutation | reds |
| --- | --- |
| `R15` does not refuse at all | 1 |
| `R15` accepts equality only | 1 |
| a prefix row may be partial | 1 |
| the summary divides by twice the prefix | 2 |
| the summary keeps the least slow prefix | 1 |

**Five mutations, 6 reds.** The first three are the rule's three inputs. The fifth survived the first
run of this table: the summary took the slowest prefix across jobs with `>`, and a fixture with one
job cannot tell `>` from `<` -- the case that kills it is a second job whose prefix is four times
slower, and its absence was the fixture's shape rather than an oversight in the rule.

### What this does not settle

Whether three minutes is right. `R15` is a lower bound, and a lower bound can be satisfied by a
number that is far too large; 180 seconds against 14 is a ratio no reading defends. The honest
statement is that the number is a claim with a visible size, the size is checked against the only
evidence that exists, and the first cold day recorded will move the requirement on its own.

## Finding 625 — the axis was a regular expression's opinion, and what the file actually owes

`O-019` has argued since v3.62 that `docs/acceptance.md` grows by a clause per round and that the
clauses are nearly half of it. v3.133 measured the file to decide the move and produced the number
the entry had been asking for: **35** of **37** per-round clauses hold both a current rule and the
way it was reached, so the section is the wrong unit and moving the clauses would carry 431 lines of
rule into the history with 414 of provenance.

That number was wrong, and the way it was wrong is the finding.

### The census described its own regex

The measurement classified a bullet as "provenance" when it matched one of seven patterns -- a
finding number, a mutation count, a run id, a version arrow, a narrative verb, a test delta. A bullet
that matched none of them was a "rule". Read over the shipped file it reported **125** rules against
**92** recollections.

The first section it misread is the one that settles it:

    ### The two sentences in one entry (v3.63)

    - **A bullet's headline and its own reason have to agree about whether it is closed.** ...
      Both directions are refused by `check-open-list.mjs`, and the two use **one** reading ...
    - **The shape is not new.** Round v2.44 writes it: ...
    - **What is not claimed.** The count and the rule share a source ...

Three bullets, **all three of them rules**, and all three cite something. A real reader of this file
would call them judgements; the heuristic called all three recollections and left the section empty.
A section with no rule in it is not a section that has been read -- it is a section that has been
counted.

### What the file is

Not "rules plus a chronicle". It is **case law**: every clause is a judgement and the case it was
decided on, and the case is the half that makes the judgement checkable. `v3.63`'s three bullets are
the shape in miniature -- a rule, the round it was written in, and what it does not claim.

What that shape owes a reader is therefore not a shorter file. It owes **an address** (something that
can be opened and read: a finding in these volumes, a table of falsifications, a workflow run, or a
test file) and **a round** in the heading. Three clauses failed both, and they are the three written
before this log carried finding numbers:

| clause | what it was missing | what it now names |
| --- | --- | --- |
| `The base of a created branch (v3.62)` | an address | `publish.test.ts`, the three cases of zero, one and all reads |
| `The two sentences in one entry (v3.63)` | an address | `check-open-list.test.ts`, which drives both directions |
| `The round that can still be written owes the coverage row (v3.67)` | an address | `progress-volumes.test.ts`, the refusal and the silence for an older round |

A test file counts as an address because it *is* the case: a reader who opens it sees the two
directions the clause describes. The rule that admitted it was `R15`'s sibling in spirit -- what a
gate may demand is bounded by what a reader can actually go and read.

### The index, and why it carries no links

The complaint behind `O-019` is real and it is about **navigation**: 2,200 lines is a legitimate size
for 39 decisions, and a reader who wants to know what this file requires should not have to read it.
The repair is an index -- one row per clause, the heading and its round -- regenerated by `--write`
and compared **line by line**, because an index holding every row in the wrong order is a different
defect from one holding a row the file dropped, and a set comparison reports both as "stale".

It carries no links, and that is the one decision in this gate worth arguing. A GitHub anchor is a
slug this script would compute by guessing: punctuation deleted, Chinese kept, a space turned into a
hyphen. A slug off by one character is a link that fails **silently** -- the reader lands nowhere and
concludes the file has no such section. That is the shape finding 621 refused when it refused to
print a ratio nothing compared, and the repair is the same: use the thing that cannot be wrong. A
heading's own text is a copy, and the gate that copies it is the gate that checks it.

### The gate's own first sentence was false

The first run of `check-acceptance-shape.mjs` printed:

    OK — 37 clause(s) across 29 round(s), v3.116 to v3.79, each with an address and a round

`v3.116 to v3.79` is a span that runs backwards, because the versions were sorted as strings and
`v3.116` sorts before `v3.79` character by character. A version is two numbers, and a sentence that
states the span of a set has to state it in the order the set is in or it is describing the sort
rather than the file. It prints `v3.62 to v3.134` now, and a case asserts the absence of that exact
sentence: a phrase that has been wrong once is worth a test that says so.

### Falsifications

| the mutation | reds |
| --- | --- |
| only a finding is an address | 3 |
| a test file is not an address | 3 |
| a heading need not name a round | 1 |
| every index row is accepted | 4 |
| the writer appends a fresh table every time | 1 |
| a moved cell is not reported | 1 |
| the third difference is not the last | 1 |

**Seven mutations, 14 reds.** The two address mutations redden three cases each because two of the
shipped clauses name only a test file -- drop that address and the real file is refused, which is
the chain that makes a rule a rule. `every index row is accepted` reddens four: the missing row, the
extra row, the moved cell and the truncation.

### What this does not settle

Whether the clause is the right unit at all. The index makes 39 clauses navigable; it does not make
them fewer, and a reader who wants the file to *be* the rules -- one page, no cases -- is asking for
a different document, not a reordering of this one. `[open: whether the acceptance file should be
two files -- the rules, and the case law -- with each rule naming the case that decided it]` is the
question v3.134 leaves, and it is a question about the reader rather than about the gate.

## Finding 626 — the census had one word for a count and one for a measurement, and it used it for both

`O-104` was opened by v3.133 with a sentence about `round(s)`: four gates print the noun and two of them
count a population. The third, `check-ci-budget`, prints **how far** the ledger's newest row sits from
the newest round -- a distance in the noun's unit and not a count of its members. The fourth,
`check-acceptance-shape`, counts a set of its own, which is a corpus and not a defect.

The record had no way to tell the first three apart from the fourth. A partition is a list of gate
groups, so a number that is not a count of the noun had to be written as a group of one -- and a group
of one is exactly what `check-workflow-language`'s six workflows are: a corpus one gate reads. Written
`[["check-ci-budget"]]`, the record said a distance was a count of rounds, and the census's own green
line said it too, in the same breath as the two `vX.YY` counts it sits beside.

### The measurement

| noun | gates | in a population of two or more | in a population of one | declared separate |
| --- | --- | --- | --- | --- |
| `addendum(s)` | 2 | 2 | -- | -- |
| `file(s)` | 4 | 2 | 2 | -- |
| `round(s)` | 4 | 2 | 1 | **1** |
| `row(s)` | 4 | -- | 4 | -- |
| `run(s)` | 4 | -- | 4 | -- |
| `row break(s)` | 3 | -- | 3 | -- |
| `comment(s)` | 2 | -- | 2 | -- |
| `reading(s)` | 2 | -- | 2 | -- |
| `volume(s)` | 2 | -- | 2 | -- |

**27** placements, **6** in populations two or more gates read, **20** in populations of one gate,
**1** that is not a count of its noun. The census now prints all four numbers on the green line; before
this round it printed `3 population(s)`, which is a count of the populations that hold an equality and
says nothing about the 21 placements that do not.

### Three answers that were possible, and the one taken

**Drop the distance from the census.** It is the cheapest answer and it is finding 611's defect: a
reader that silently stops counting a number it read, so the headline becomes a count of what the
reader happened to see. The census exists to hold every number the gates print.

**Rename what `check-ci-budget` prints** -- `lag(s)`, or a noun of its own -- so the census never sees
a distance under `round(s)`. That fixes one printer, and it fixes it by making the corpus's vocabulary
carry a word invented for a reader. The next gate that states a distance would have to invent another.

**Give the record a third placement.** `separate` is a gate and the sentence that says what it measures
instead, refused without the sentence, outside the noun, beside a population, or twice. It answers the
entry's second half as well -- *which sentence would decide it* -- because the sentence is a field
rather than a paragraph in the noun's relation, and a relation about a population would otherwise have
to say two things at once. This is the one taken.

### What a declaration is held to

The relation is checked against every count the noun is printed with, because a relation is about the
noun. A declaration is about one gate's number, so it is checked against that gate's counts alone:
`check-ci-budget`'s sentence may state the `0` it prints and may not state the `50` that
`check-progress-volumes` prints. That is finding 620's rule with one more hop between the figure and
the reader: a sentence beside a number is the most likely place for a stale copy of it.

### The line that now says which is which

    round(s) — 30 in check-acceptance-shape; 229 `vX.YY` in check-open-list; 229 `vX.YY`, 50 `Pass`
    in check-progress-volumes (one population at 229, and the count agrees); 0 in check-ci-budget
    (declared separate: how far the ledger's newest row sits from the newest round -- a distance, so
    its number is compared with nothing and moves every round the log does not close) — ...

The declaration is printed after the populations, not in gate order. In gate order the zero leads the
line, looking like a count; after the populations it is what it is, and a reader who wants the counts
can stop before it.

### Falsifications

| the mutation | reds |
| --- | --- |
| the declaration is read as an empty list | 7 |
| coverage counts a declared gate as unplaced | 6 |
| a gate may sit in a population and a declaration | 1 |
| a gate may be declared twice | 1 |
| a declaration need not say what it measures | 2 |
| a declaration is held to the noun's figures rather than its gate's | 1 |
| no declaration is held to its figures at all | 1 |
| a declaration is printed without saying what it measures | 3 |
| the ledger files a declaration as a population of one | 2 |
| a record whose only field is `separate` is refused as unfilled | 2 |
| the writer drops the declaration | 1 |
| the reader drops the declaration | 2 |

**Twelve mutations, 29 reds.** The tenth survived the first run: every fixture that declared a gate
separate also carried `populations: []`, so nothing distinguished a missing array from an empty one --
and a record carrying only declarations is the shape a noun of three unrelated corpora has. The
fixture was the hole.

### What this does not settle

Whether a *population of one* is a claim the census can check at all. Twenty of the 27 placements are a
corpus one gate reads. At v3.134 two of them printed the same number -- `22 reading(s)` in
`check-ci-budget` and in `check-fault-cases` -- which the record called the corpus on the strength of a
sentence; the recording this round retook moved one of them to `23`, and the coincidence left the
census's list with nothing refusing it, because a census prints the agreements it finds and not the
ones it loses. A coincidence between two populations of one is therefore the one agreement the census
prints without checking, and whether that is a fifth placement, a refusal, or a judgement only a
person can make is `O-106`.

## Finding 627 — the marker had two classes and the corpus has three facts

`O-106` was opened by v3.135 with a sentence about the twenty placements that are a corpus one gate
reads: `reading(s)` was printed by `check-ci-budget` and by `check-fault-cases` at `22` in both, and
nothing compared the two sets. The entry asked whether a coincidence between two populations of one is
a fact the census can refuse, or a judgement only a person can make, and whether the answer is a
sentence in the record or a fifth placement.

The answer is none of the three, and the defect is one line: **`coincidencesOf` classified a
coincidence by whether one declared population held the gates that print it, which is a partition of
two, and the corpus has three facts.**

| what the record has said about the gates that print the count | the equality is | could a run refuse it? |
| --- | --- | --- |
| one population holds every one of them | a rule, and `disagreementsOf` checks it | yes, and it does |
| every gate is placed, and no population holds them all | a **size** between sets the record says differ | no: a size is not a claim |
| at least one gate nobody has placed | the only evidence that they might be one set | no: the question is still open |

The second and the third were printed in the same words -- `across two` -- so the census presented an
answered question as an open one. The shipped record has exactly one of each kind of evidence and one
of the second: `8 row(s)` is printed by `check-fault-cases` and by `check-repository-table`, the record
places each in a population of its own, and `row(s)`'s own sentence says the two tables are *four tables
and one word*. The marker was therefore printing a question the line beneath it had already answered,
in the same words it used for the question `reading(s)` had left open -- which is how a marker stops
being read as a marker.

### The measurement

| class | count at v3.136 | which |
| --- | --- | --- |
| `together` -- one declared population holds every gate | **3** | `1 addendum(s)`, `479 file(s)`, `230 round(s)` |
| `apart` -- every gate placed, no population holds them all | **1** | `8 row(s)` |
| `unplaced` -- at least one gate nobody has placed | **0** | -- |

The line before this round read `4 count(s) coincide across gates -- 3 inside a declared population and
1 across two`, and the `1 across two` was the `8 row(s)`. The `0` in the third class is printed rather
than omitted, because it is the number that says the census examined every equality and none of them is
a question.

### Three answers that were possible, and the one taken

**Refuse a coincidence between two populations of one.** It reads as the strict answer and it is the
wrong one: the populations are a person's claim about sets, and the coincidence is arithmetic. A rule
that refused arithmetic would fire on the first round where two unrelated tables happened to hold the
same number of rows, and the repair would be to change a table.

**Drop the `apart` ones from the list.** Cheapest, and it is finding 611: a reader that stops counting a
number it read, so a reader of the next log cannot tell a coincidence that went out from a census that
stopped looking.

**Classify, and print all three counts.** This is the one taken. The classification costs one string
per coincidence and the three counts cost one clause; what they buy is that the only equality that is
evidence is named as evidence, and the two that are answers are named as answers.

### The branch that could not be reached

The first draft of `markerOf` built a list of sentences and joined them, on the theory that one noun
could carry an `apart` coincidence and an `unplaced` one. It cannot: `unplaced` is what an **undeclared**
noun's coincidences are, and `apart` is what a declared one's are, because `partitionProblems` refuses a
document that leaves a gate unplaced. The two are mutually exclusive by construction, so the branch was
dead before it ran once. The function returns one sentence and says why in its own comment; the fixture
that proved it -- `populations: [['a'], ['b']]` over three gates -- is a refusal in the test file.

What *can* happen under one noun is a forced coincidence and an apart one at once: `a` and `b` share a
population and print `8`, `c` and `d` sit in populations of their own and print `9`. The numbers line
marks the forced one in place (`one population at 8, and the count agrees`) and the parenthesis speaks
for what is left, which is why the sentence does not name a count. Whether it should is `O-107`.

### Falsifications

| the mutation | reds |
| --- | --- |
| a coincidence is `together` when every gate is in *some* population | 5 |
| a coincidence no population holds is `together` rather than `apart` | 8 |
| a coincidence nobody placed is `apart` rather than `unplaced` | 8 |
| a gate declared separate is not a gate that has been placed | 2 |
| every coincidence is reported as `together` | 8 |
| the summary reports the unplaced count as zero | 2 |
| the summary reports the apart count as the rest | 2 |
| the summary names two classes where there are three | 3 |
| the marker for an `apart` equality says nobody has placed them | 2 |
| the marker for an `unplaced` equality says the record places them apart | 4 |
| the marker is printed for every coincidence, forced ones included | 4 |
| an `unplaced` equality gets no marker | 4 |

**Twelve mutations, 52 reds.** The first is the defect this round reproduced in its own first draft --
`groups.some((group) => gates.every(...))` written as `gates.every((gate) => groups.some(...))`, which
says *every gate is placed* and calls it *one population holds them all*. It survived nothing: the
`apart` fixtures are the two populations of one the round exists for.

### The table was taken on this round's own round, and two rows were wrong

The first table was measured while the round's documents were still being written, so it also counted
the two tests that read the tree -- and a red gate makes the tree test red for a reason that has nothing
to do with the mutation. Two rows came back with `1` red each and the rest with one or two more than
they should have. Re-run against a green tree, two of the twelve **survived**:

| the mutation | first table | on a green tree |
| --- | --- | --- |
| the summary reports the unplaced count as zero | 1 | **0** |
| the summary reports the apart count as the rest | 1 | **0** |

Both survived for the same reason, and it is v3.135's tenth mutation one file over: the shipped record
has `0` unplaced and `1` apart, and the fixtures that reached the summary had nothing in either class,
so a summary that printed `0` for the first and "everything not together" for the second printed the
shipped line word for word. The hole was the fixture. The repair is one census with a number in each
class -- `a` and `b` sharing a population at `8`, `c` and `d` in populations of their own at `9`, `e`
and `f` at `7` under a noun nobody has placed -- and the two rows then cost **2** reds each.

The lesson is the one this campaign keeps relearning: **a table measured on a tree that is not green
measures the tree.**

### What this does not settle

The marker names a noun's equality without naming the count, and a noun can carry two. `row(s)` has one
`apart` coincidence today, so the ambiguity is hypothetical; the fixture above makes it real, and the
repair -- naming the count inside the parenthesis -- is `O-107`.

## Finding 628 — a bound that was inside the multiple by six seconds, and a comment a round behind it

The recording this round took is its own run, `45192493234`, which is what `R7` requires. The gate
refused it:

```
check-ci-budget: `Lint (no mock / no secrets / no vendored data / registry / absolute paths /
scorer stability / site proofs)` is bounded at 17 min and measured 521 s: the bound is under 2
times the measurement, so a runner twice as slow is refused for being slow rather than for hanging
```

`R12` is the rule, and it is right. What it caught is not a slow run but a bound that had been wrong
for two rounds and could not say so.

### The six readings, and the four that are one population

| run | lint | note |
| --- | --- | --- |
| `45116975788` | 307 s | a cached install; the fastest on record |
| `45134409934` | 503 s | |
| `45136514702` | 501 s | |
| `45155655608` | 334 s | the second fast one, and the reason the bound survived |
| `45158647017` | 507 s | v3.135's closing reading: twice is 1,014 s, inside 1,020 s by **6 s** |
| `45192493234` | 521 s | this round: twice is 1,042 s, and 17 minutes is 1,020 s |

The bound went to 17 minutes at v3.126 against a 507 s reading. Six seconds of margin is not a
margin, and the comment in the workflow says so four lines above the number: finding 422's sentence,
*"a bound at exactly twice a reading is a bound that fires on a 5% slower day"*. The step was inside
the multiple by 0.6% and the paragraph that warns about it was two paragraphs up.

### The comment that stopped a round behind

The workflow's narration of this step ended at `16 from v3.124`, while the number had been **17** since
v3.126 -- a commit that moved this bound and the job's ceiling and recorded the move in the audit
volume, without extending the comment. So the step carried a bound whose own account of itself named a
smaller number, and a reader checking the arithmetic against the comment would have found the
arithmetic of a different round.

That is the defect this project calls *a number that nobody argued*, one level down: the argument
existed, in an audit volume, and the place a maintainer reads before changing the number did not carry
it. The repair is one paragraph, and the paragraph is the finding.

### The repair, and what it is not

`18` minutes is 1,080 s, which is 2.07x the slowest reading on record and 38 s above the multiple.
The verify ceiling moves 39 -> 40 for the reason its own comment states: the bounds add up to
2,160 s, plus the 180 s prefix allowance, plus 8 s of doubled overhead, is 2,348 s.

Both are arithmetic, and neither is the structural answer. **This step is twice the size of its
siblings because two of its seven members spawn their own copy of the tree and run a suite in each**
-- `verify-scorer-stability` and `verify-site-proofs`, the same two that made `lint` the one aggregate
whose cost is not a static scan. Splitting them out of `lint` is `O-108`, and the trigger it should be
opened against is a number: at the +2.6% a round these readings show, 521 s reaches the 2.0x boundary
of an 18-minute bound in about four rounds.

### Falsifications

| the mutation | reds |
| --- | --- |
| the lint bound goes back under twice its reading | 3 |
| the verify ceiling no longer holds the bounds it holds | 3 |

**Two mutations, 6 reds**, both against the shipped tree rather than a fixture: the gate that reads the
workflow and the recording is the one that refuses, and `ci-readings.test.ts` is the second opinion
that the recording is the run the ledger names.

### What this does not settle

Whether a bound should be sized by the slowest reading at all, when the readings are two populations
(307 and 334 against 501, 503, 507 and 521). Twice the *slowest* is the rule; twice the *fastest* would
be 668 s and would refuse every real run. The rule is right and the spread is the interesting number --
but nothing prints it, and a bound sized at 2.07x a bimodal distribution is a bound sized against the
wrong half. `O-109`.

## Finding 629 — the marker spoke for the noun, and the noun carries two numbers

v3.136 gave a coincidence its three classes and made the census print all three counts. It left the
parenthesis at one sentence per **noun**, and a noun is not a coincidence:

```
row(s) — 8 in check-fault-cases; 9 in check-l4-status; 318, 3 in check-open-list; 8 in
check-repository-table (a count two gates print agrees, and the record places them in different sets)
```

The `row(s)` line in the shipped tree carries one coincidence, so the sentence is unambiguous today.
The state that makes it wrong is two coincidences under one noun, and the census's own numbers line
supplies it: `8` printed by `a` and `b` inside one declared population, `9` printed by `c` and `d`
from populations of their own. The old marker printed

```
(a count two gates print agrees, and the record places them in different sets)
```

once for that noun -- true of the `9`, false of the `8`, which the numbers line beside it had already
marked as `one population at 8, and the count agrees`. A reader who acted on the marker acted on the
number it was not about.

### Why the old shape could not be repaired by precedence

The v3.136 form had three branches and returned the first that matched, with a comment proving that
two of them could never co-occur: `unplaced` is what an **undeclared** noun's coincidences are, and a
declared noun cannot leave a gate unplaced because `partitionProblems` refuses that document. The
argument is true, and it was doing the work of a construction: a sentence was correct only because a
state had been proved unreachable, not because the sentence was about the thing it named. Adding a
fourth class, or a second coincidence of the same class, would have required a new proof rather than a
new sentence.

The repair builds one sentence per coincidence, from that coincidence:

```js
const what =
  one.placement === 'unplaced'
    ? 'a count two gates print agrees, and no population places them'
    : one.placement === 'apart'
      ? 'a count two gates print agrees, and the record places them in different sets'
      : null;
if (what !== null) said.push(`at ${String(one.count)}, ${what}`);
```

A noun with three coincidences prints three sentences, in the order of the counts they name, and the
class that needs no marker -- a coincidence a declared population holds -- still contributes none. The
fixture above now reads:

```
row(s) — 8 in a; 8 in b (one population at 8, and the count agrees); 9 in c; 9 in d
(at 9, a count two gates print agrees, and the record places them in different sets) — four tables
```

One sentence, about the `9`, and the `8` is marked where it was already marked.

`O-107` asked whether naming the count cost more than it bought; the cost is four words per sentence
and the buying is that a sentence is now the property of exactly one number.

### Falsifications

| the mutation | reds |
| --- | --- |
| the sentence drops the count it is about | 5 |
| `apart` and `unplaced` share one sentence | 3 |
| `unplaced` is printed as `apart` | 3 |
| a coincidence inside a population is marked too | 4 |
| the sentences are joined with a comma rather than a semicolon | 9 |
| the sentences are printed newest count first | 1 |
| the parenthetical loses its brackets | 5 |
| the marker is printed once, whatever the noun carries | 1 |

**Eight mutations, 31 reds**, measured on the green tree at the round's tip. The last two are the
ones the round bought: reversing the order and truncating to the first sentence are both invisible to
every assertion that existed before this round, and the case that catches them is the new one -- three
counts under one noun, two of them equal.

### What this does not settle

Whether a sentence should restate what its count's numbers say. `at 9` is a pointer: a reader who
wants to know which gates print the `9` reads the numbers line, and the parenthesis does not repeat
it. That is the same division v3.136 drew between the numbers and the marker, one level down.

## Finding 630 — a snapshot is a claim about one tree, and only a re-deriving reader can refuse it

`measure-doc-counts --write-doc` spawns the three scopes and writes what it found. v3.132 took that
snapshot with eight of its nine new cases written, so `golden-master/doc-counts.json` said **6,843**
against a tree that ended at **6,844**, and the repository table derived its test count from the
snapshot. v3.131's error is the same act one step earlier: `check-repository-table --write` ran before
`git add`, and `Tracked files` published **672** against the checkout's **675**.

`O-103` asked whether a write can know that it is the round's last act. It cannot, and the reason is
not a missing mechanism: *"the tree will not change after this"* is a claim about the future, and a
program that runs before the future has no evidence for it. Every attempt to give the writer that
knowledge would be the writer inspecting a clock it does not own.

### The three readers, and what each one compares

| reader | compares | spawns the suite | verdict on a snapshot one test off |
| --- | --- | --- | --- |
| `check-doc-counts` (in `docs:check`) | the document against the snapshot | no | **OK** |
| `measure-doc-counts --check` | the snapshot against the tree | yes, three scopes | stale |
| `measure-doc-counts --check --from` | the snapshot against the coverage run's reports | no | stale |

The first row is the defect. `docs:check` is the gate a round runs most often, and it cannot see the
tree: it compares two files, so a snapshot and the rows that quote it can be wrong **together** and
the gate is green. Measured this round, on a tree one test past the committed snapshot:

```
node scripts/check-doc-counts.mjs                     -> exit 0
  check-doc-counts: OK (514 published count(s), each naming its scope; ...)
node scripts/measure-doc-counts.mjs --check --from ... -> exit 1
  measure-doc-counts: FAILED
    golden-master/doc-counts.json is stale.  committed: core 6882  measured: core 6883
```

Both readings are of one tree, one command apart. The second is the reader, and the discipline is
therefore not *"write last"* but **"read after the last edit"** -- a weaker rule that a person can
keep and a machine can check.

### Where the re-deriving reader sits

`scripts/gate-steps.mjs` classifies the workflow's counts step as local, and the plan it produces puts
it at position **6** of the 48 steps `verify:local` runs -- immediately after `test:coverage`, whose
reports it reads. In CI it is the same step. So the pipeline reads the tree after every edit a round
makes, and the only way to be green with a stale snapshot is to skip that step.

### The marker that said "now" about a past tree

The first `docs:check` of this round refused three rows in `progress/volume-19.md`:

```
declares the current state of 'core' as 260 files / 6883 tests, but the suite has 260 / 6884
```

v3.136's ledger had written its three suite rows as `(as of this commit)`, which is the marker the
guard reads as *the current state* -- and every other round in that volume writes `(at v3.121)`. The
marker was true when it was written and false the moment this round added a test, and the repair is
not to change the number: `6,880 -> 6,883` is what that round measured, and editing it to `6,884`
would make the ledger's own `new tests` row contradict the row above it. The repair is to date the
rows `(at v3.136)`, which is what the neighbouring rounds already do, and to leave the number alone.

That is finding 630's rule applied to a marker: `current` is a claim about *this* tree, `dated` is a
claim about *that* one, and a round that has moved the tree owes the older row a date rather than a
new number.

### Falsifications

| the experiment | verdict |
| --- | --- |
| a snapshot one test behind the tree, read by `check-doc-counts` | exit **0** -- the gate cannot see it |
| the same snapshot, read by `measure-doc-counts --check --from` | exit **1**, naming committed 6,882 and measured 6,883 |
| v3.136's suite rows left as `(as of this commit)` | **3** refusals in `docs:check`, one per scope |

**Two readers and three rows**, and the pair is the finding: the same wrong snapshot is green under
the gate a round runs on every edit and red under the step that re-derives. No mutation is recorded
here because the round adds no code to either reader; what it adds is the ordering the two readers
enforce, and the experiment is the falsification.

### What this does not settle

Whether `docs:check` should say what it does not compare. It prints what it read and what it found,
and neither sentence says *"the snapshot is not held to the tree here"*; a reader who takes its green
as a statement about the suite is making the inference v3.132 made. The clause in `docs/acceptance.md`
is where that inference is now written down, and putting it in the gate's output would mean printing a
negative on every run -- a sentence about what a check does not do, in the log of one that did.

## Finding 631 — the multiple was printed without the series it was taken from

`R12` sizes a bound as twice the slowest reading of the command a step runs, and the summary
printed the multiple and the reading it divided by:

```
tightest backend / Install a backend this repository did not write at 2.0x of the slowest reading
of its command (888 s in `backend / Install a backend this repository did not write`, run 44516888528)
```

`2.0x` is the smallest multiple the rule accepts, so this line reads as the tightest bound in the
workflow with no room at all. It is the widest. The same command's readings, from the file the line
was computed from:

```
888, 556, 273, 91, 40, 38, 31, 28, 27, 26, 23, 21, 21, 20, 20, 19, 19, 19, 18, 18, 18, 17, 16 ...
```

Twenty-five of twenty-seven days at or under 91 s, and three in the hundreds. The bound is
**1,800 s** -- thirty minutes -- against a step whose typical cost is twenty seconds. `2.0x` and
`89x` are the same number described from two ends, and the summary printed only the first, so the
`backend` job's thirty-six-minute ceiling looked like a ceiling with 2.4x of room over its day
(run 44516888528, 910 s) when fifteen of those minutes exist for one install that went wrong once.

`O-109` asked whether a bound can be sized from a reading whose dispersion is two cache states, and
whether the repair is a printed dispersion or two measurements with two bounds. The second option
is not available: a step carries **one** `timeout-minutes`, and a bound that fits only the warm
state refuses the cold day for being slow -- which is the failure the multiple exists to prevent.
So the question is not how to bound two states but how to say which state a bound was sized from,
and that is the first option.

### The repair, and the window it is taken over

`readingsOfCommand` is the single reader of "which readings belong to this command": the slowest
one is `R10`'s denominator and the fastest is printed beside it, from one walk rather than two. A
second account of that set is how a multiple and its explanation come to be about different
readings -- the defect `measure-doc-counts` had with three readers of one predicate.

```
tightest backend / Install a backend this repository did not write at 2.0x of the slowest reading
of its command (888 s in `...`, run 44516888528); across the history that command runs from 16 s to 888 s
```

Two more states, and both are printed rather than left to the reader's imagination: a command with
one reading says `that command has been read once` (a bound argued from a single measurement is a
different claim from one argued from a series), and a series that never moved says `every reading of
that command is the same` (a range from a number to itself looks like evidence and carries none).

The tie rules are decided by run rather than by file order, in both directions: the slowest goes to
the newer run, because that is the run a refusal names, and the fastest to the older one. Without
that, the printed range would depend on the order somebody appended the days in.

### Falsifications

| the mutation | reds |
| --- | --- |
| the spread clause is never printed | 5 |
| one reading is printed as a range from itself to itself | 1 |
| equal readings are printed as a range | 1 |
| the fastest reading is the slowest one | 4 |
| a tie on the fastest reading goes to the newer run | 1 |
| a tie on the slowest reading goes to the file order | 1 |
| the count is never incremented, so every command looks unread | 7 |
| the range is printed slowest first | 2 |
| the range names the fastest reading twice | 2 |
| a command's readings are read from one job only | 5 |
| the spread is looked up in a history that was never read | 18 |

**Eleven mutations, 47 reds**, measured on the green tree at the round's tip. The last row is the
guard the `historyKnown` check is: without it the summary throws on a tree with no readings, and
eighteen cases say so.

### What this does not settle

Whether a range makes a multiple interpretable. It says the multiple is against one end of a series
that wide; whether the next reading lands inside it is what the next recording answers, and `R12`'s
rule is unchanged by anything printed here. `O-089` -- "the step is an external install, and no
arithmetic can bound a network" -- is the same fact from the other side, and the range printed here
is the evidence it was opened on.

## Finding 632 — two rounds each said "now", and nothing read both of them

v3.137 dated v3.136's three suite rows and wrote down why: `(as of this commit)` is the phrase the
guard reads as *the current state*, the rows were true when written and false a round later, and the
event that caught them was the next round adding a test. `O-111` is the residue of that sentence --
a round that moves no count moves no event, so the older rows stay marked current and two rounds
each claim to be now.

The corpus at v3.137 held exactly three current-state rows, all under the newest round:

```
$ grep -c '(as of this commit)' docs/progress/volume-19.md | the three suite rows
```

That is a fact about discipline, not a rule, and the repair v3.137 made was mechanical: date the
rows. The rule this round adds is that the discipline is checkable, because the contradiction is
inside the documents and needs no measurement:

```
$ node scripts/check-doc-counts.mjs --doc /tmp/two-rounds.md
check-doc-counts: FAILED
  ../../tmp/two-rounds.md:7: a row marked as the current state sits under v3.10, and the newest
  round that publishes a count is v3.11. "Now" is one round: date this row ("(at v3.10)") so a
  reader can tell a record from the state of the tree, or move it under v3.11 if it is this
  round's measurement.
```

### Three decisions the rule has to make, and why each one is not a preference

**The row's round is a property of where it sits.** `readCounts` now carries the `## ` heading a row
under, in the same pass that reads the row: a round is opened by a heading carrying a `vX.YY` token,
and a heading that names none (`## Repository`, `## Headline`) opens a place where a row is under no
round at all. The alternative -- finding the round from the line number -- is the same answer
computed twice.

**Rounds are compared as numbers.** `v3.9` is older than `v3.10` and a string comparison says the
opposite, and the corpus spans two major series (`v2.12` to `v3.137`), so the comparison is a pair
of integers.

**A row under no round is not this rule's business.** `docs/progress.md`'s tables describe the tree
rather than a round, rule 3 already holds every one of them to the snapshot, and the claim this rule
is about is two *rounds* each saying "now". Refusing the headingless row would be a false refusal on
the index file the moment one appeared -- and the mutation battery found exactly that hole in the
first draft of the fixtures rather than in the rule: two mutations survived (a headingless row
refused, and any heading opening a round) because no case had a headingless current row *beside* a
round. One case -- `## v3.10` then `## Repository` -- kills both, at one red each.

### Falsifications

| the mutation | reds |
| --- | --- |
| the rule is never applied | 2 |
| a row's round is never tracked, so every row sits under none | 2 |
| rounds are compared as strings, so `v3.9` is newer than `v3.10` | 3 |
| the newest round is the first one seen rather than the last | 5 |
| a row under no round heading is refused as though it were under an older one | 1 |
| any heading opens a round, so `## Repository` is one | 1 |
| a dated row is refused too, so every row must be the newest | 3 |
| the rule only fires when the numbers are wrong as well | 2 |
| the oldest round is taken as the newest, by keeping the last match | 5 |

**Nine mutations, 24 reds**, after the fixture the battery asked for. The two rows at one red each
are the ones that were **zero** on the first run: a surviving mutation is a hole in the fixtures,
and the case that closes it is the pair of headings rather than a new rule.

### What this does not settle

Whether the snapshot is current. This rule refuses a contradiction between two rounds; whether the
snapshot the newest round quotes was taken from the tree that exists is `O-110`, and it is the
counts step's question, not `docs:check`'s.
