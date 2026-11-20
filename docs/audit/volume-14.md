# Audit · volume 14

Findings 579–599, from the rounds recorded in `progress/volume-17.md` and `progress/volume-18.md` as `v3.115` through `v3.120`.

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

