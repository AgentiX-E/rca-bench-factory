# Audit · volume 14

Findings 579–584, from the round recorded in `progress/volume-17.md` as `v3.115`.

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
