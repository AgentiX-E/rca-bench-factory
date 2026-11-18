## v3.99 · a `#` in YAML is four grammars, and twelve of the tree's own comments were read as content

The Open list got this entry one round ago, written by the reader that could not read it: *the workflow files'
`#` comments are read by nothing*, with three fixtures named and a measurement beside them -- five files, 1 172
`#` marks, none of them carrying a Han character. The entry was right about the count and wrong about the
grammar: there are four, and the fourth is where most of the marks live.

### One · what the parenthesis got right, and the number it counted

The count was a line count and the rule needed a character count. Measured this round: **1 215** `#`
characters across **1 172** rows, of which **1 167** rows begin with one. The five that do not are the whole of
the tree's in-row marks, and each is worth naming because each is a shape a reader gets wrong:

```
fault-extraction-accuracy.yml:202   echo "provider=${PROVIDER} has a key present (${#selected} characters…"
fault-extraction-accuracy.yml:231   echo "### Fault extraction accuracy"
official-data.yml:270               echo "### Fetch outcome"
official-data.yml:454               echo "### No pin report" >> "$GITHUB_STEP_SUMMARY"
official-data.yml:460               echo "### Measured pins"
```

All five are inside a `run: |` block, all five are inside a double-quoted shell string, and none of them is a
comment. Three quoted scalars reach the top level at all: `default: ''` and two `cron:` schedules. That is the
measurement that made the rule safe to write -- a tree where the only in-row `#` is shell text is a tree where
a reader that confuses the two prints a sentence nobody can act on.

### Two · six falsifications, and the fixture that had to be thrown away

The scanner's state was removed one piece at a time and the fixture that holds that piece was watched. Every
run restored the file afterwards, and `cmp` against the saved copy is what says so.

| removed | what it is for | tests that went red |
| --- | --- | --- |
| quote state | a `#` inside a quoted scalar is text | **4** -- the quoted-scalar fixture, the `''` escape, the unterminated-scalar refusal, the four-bucket census |
| block state | a `run: |` row is content, not YAML | **5** -- the English fixture's own count, the quote inside a block, the census, the real tree, the row predicate |
| the row's own indentation | `body.slice(lead)` became `body.slice(block.indent)` | **3** -- the deeper-comment fixture, the real tree, the row predicate |
| the block's end | a block never ends at a less-indented row | **2** -- the end fixture, the census |
| the doubled quote | `''` no longer closes and reopens | **1** -- the single-quote fixture |
| the token boundary | every quote opens a scalar | **3** -- see below |

**The sixth one is the round's honest failure.** It was written as a fixture holding `'"'"'` -- the real shape
`anchor-roundtrip.yml` uses to carry an apostrophe through a single-quoted shell string -- and the claim beside
it was that a reader which opened a scalar at every quote would never close it and would lose the comment on
the next row. With `opensScalar` made unconditional, that fixture **passed**. The fixture sat inside a
`run: |` block, so the block branch had already taken the row and the quote logic never ran: the test was
asserting something about a path it could not reach, which is the shape this log keeps finding in gates.

It was replaced rather than patched. The new fixture is a plain scalar with an apostrophe glued to a word --
`- name: the runner's cache  # …`, taken from `anchor-roundtrip.yml`'s `Build (the round trip reads core's
dist)` -- and it is the row a reader without the token boundary swallows. It goes red under the mutation, and
it is the row that makes the real tree go red too, because `core's` appears in prose the scanner would
otherwise read as the start of a string.

### Three · the census found a bug in the reader that wrote it

Two readings are taken over every file. The first is per character: every `#` is classified into exactly one
of four buckets -- it opened a comment, it sat inside a quoted scalar, it sat in a block scalar's row, or it was
glued to a word -- and the four counts must sum to the number of `#` characters in the file. The second is per
row: **every row whose first non-blank character is a `#` must be recorded as a comment on that row**, so the
number of such rows and the number of comments have to agree.

The first run of the finished scanner reported `1 155 comment(s) (979 line, 176 block)` and **25** marks in
block rows. There are 13 such marks in the tree. The difference was twelve comments -- seven in
`official-data.yml` at rows 308 to 314, five at rows 467 to 471 -- sitting inside a `run: |` block, indented
**deeper** than the block's first row, and counted as content because the reader measured the `#` from the
block's column rather than the row's:

```
      # No cause is named here on purpose. Every status the script documents
```

That is a comment. It is one of the twelve the first run reported as `25 inside a block scalar's own row`, and
the gate was green over it -- the file is English, so nothing was violated, and the reading that would have
noticed a Chinese comment in that position was the reading that was broken. The repair is one column, and the
row predicate above is what found it: with the fix the two readings agree at **1 167** comments and **13**
marks, and the numbers add up for the first time.

The summary after the repair:

```
check-workflow-language: OK — 6 file(s), 1215 '#' mark(s): 1167 comment(s) (979 line, 188 block scalar),
0 inside a quoted scalar, 13 inside a block scalar's own row, 0 glued to a word; 0 run(s) of Han prose
```

### Four · what this reader does not read

**A `#` in the middle of a block scalar's row.** It could be a shell comment (`echo hi  # why`) or a `#` inside
a shell string (`echo "a # b"`), and telling those apart needs to know which language the block holds, which
YAML does not record. The row-leading `#` is the one shape that is a comment in shell, in Python, in Ruby and
in make alike, so that is the shape this reader takes -- and the 13 marks it declines are exactly the five rows
above plus their duplicates.

**A `"` inside a plain scalar opens a flow scalar.** `say "hi"` is legal YAML and the approximation enters the
quote rather than ignoring it. The cost is a `#` between two such quotes counted as text; the direction is
chosen because the other one -- reading a quotation as prose -- makes a gate red on a file that is fine.

**An explicit indentation indicator is measured from the header row.** `|2` means two columns past the parent
node, and the parent is taken to be the row the header sits on. Exact for a mapping key and for a sequence
item, which is what these six files contain.

**A header whose `|` is followed by a comment.** `run: |  # why` is read, and the comment is YAML's; a `|` in
the middle of a scalar is a character, which is why the header pattern requires the indicator to end the row.

### Five · what the gate is worth

One more exit and two more scripts, and `derive-gate-sites` re-derives to **143 failure sites across 67 of 96
scripts**. The battery moves to **228 claims across 66 files** because a claim is a site credited to the
proving test file, and `docs:check` is **twenty-one steps**.

Twenty-three tests: nineteen drive the gate over a throwaway tree and four read the real one. The floors are
taken below this round's readings -- `files` is exactly six (the tree has six YAML files and the lock file is
excluded by name), `comments > 1 000`, `marks > 1 200` -- so a reader that stopped walking fails a test rather
than publishing a smaller number as a pass. The row predicate is the second instrument, and §Three is what it
bought.

### Six · the step before the push, where the machine measured again

`verify-local` went red at step 8. `check-test-budgets` named
`gate-test-battery-attribution.test.ts`: its slowest test takes **1 040 ms** and the file states no budget,
so vitest's 5 000 ms default decides its verdict. Run alone, that test takes **149 ms** -- seven times
less, inside the 5x-to-27x population finding 538 recorded when this gate first ran, and the same lesson
that round paid for: **the gate measures the box**.

The repair has one shape and this round did not invent a second. A budget is declared on the suite, both
readings go into the comment beside it (**149 ms** alone, **1 040 ms** under four workers), and the floor
stays at 1 000 ms -- a floor set under the box's worst day is a threshold nobody can fail, which is the
defect the floor exists to avoid rather than to create. Declared files move **43 -> 44**, and the file
closest to its own budget is `typecheck-entrypoint.test.ts` at 32% of 30 000 ms.

What makes this worth a section rather than a line: the round had already run the suite green twice, and
the reading that failed is not about this round's code at all. It is finding 538's shape one round on --
a threshold whose subject is a machine, reported against a file that has nothing wrong with it.

### Readings

> Ledger for `v3.99`.

| item | value |
| --- | --- |
| `core` test suite | **254 files, 6446 tests passed** (at v3.99) |
| `cli` test suite | **4 files, 187 tests passed** (at v3.99) |
| repo test suite | **258 files, 6633 tests passed** (at v3.99) |
| coverage | `core` **99.97 / 99.95 / 100 / 99.97**, `cli` **100 / 100 / 100 / 100** -- unchanged: the new code is two files under `scripts/`, which the four dimensions do not measure |
| new tests | **6423 -> 6446, +23**: nineteen fixtures through the gate, four over the reading and the real tree |
| the workflow comments | **6 file(s), 1 215 `#` mark(s), 1 167 comment(s) (979 line, 188 block scalar), 0 run(s) of Han prose**; **13** marks inside a block scalar's row, **0** inside a quoted scalar, **0** glued to a word |
| the census, before the repair | **1 155** comments and **25** block-row marks, i.e. twelve comments counted as content -- rows 308-314 and 467-471 of `official-data.yml` |
| the row predicate | **1 167** rows begin with a `#`, **1 167** comments read, **0** lost |
| the falsifications | six removals, six red fixtures; the first attempt at the sixth proved nothing and was replaced |
| the push | **run 43822783339, 8 of 8 job(s) green in 12 m 30 s**, first attempt |
| budget declarations | **43 -> 44**: one file named at 1 040 ms under four workers and 149 ms alone; the floor stays at 1 000 ms |
| the YAML measurement | **1 172** rows carry a `#`; **1 215** `#` characters; five in-row marks, all shell strings inside `run: |` |
| gate sites | **143 / 67 of 96 scripts** (was 142 / 66 of 94); the call tally **161** |
| the battery | **228 claims across 66 files** (was 227 / 65) |
| `docs:check` | **20 -> 21 steps** |
| list | **26 -> 26**: the workflow entry closed, the paragraph-boundary entry left open |

### What is left, in the order it has to happen

| priority | item | state | next |
| --- | --- | --- | --- |
| P2 | the ceiling of 8 workers has never been measured where it is not oversubscription | unchanged: every reading is on a four-CPU quota, so 8 is 2x | one full run on a box with nine or more available CPUs |
| P2 | how close a **failing** run comes to its ceiling | unchanged | one run whose artefact is a failure, read per test |
| P2 | a record's `terms` is a map, so nothing can say which keys a rule writes | unchanged: priced at v3.94, waiting on its trigger | the trigger, or nothing |
| P3 | a run broken by a line break evades all three language readers | **unchanged and now wider**: the third reader has the same boundary, and a YAML comment wrapped in a narrow column is the same case | decide whether a paragraph is a unit, which changes three readers at once |
| P3 | an in-row `#` inside a block scalar is read by nothing | **new**: 13 marks, all shell strings, and telling one from a shell comment needs the block's language | nothing until a block holds a language whose comments are not row-leading |

**Where this leaves the campaign.** The language axis now covers every surface in this repository that carries
prose: the documents, the code, and the five workflow files whose comments are the record of why each step
exists. The three P2 items still wait on something outside this sandbox, and the two P3 items are boundaries
rather than defects -- both stated in the readers' headers, both with the repair each would need. The corpus
figure, the coverage table and the battery's per-claim witness are where v3.98 left them.

## v3.100 · the unit is the paragraph, and two of the walls turn out to be one wall

The Open list has carried this one since v3.98 in the words of the reader that could not cross it: *a run broken
by a line break still evades all three language readers*. Three readers judged a row at a time, so a comment
wrapped in a narrow column, a Chinese paragraph hard-wrapped at eighty characters, and a `#` comment continued on
the next row were all one sentence to their author and two citations to the rule. The entry said the cost was a
decision rather than a line of code -- what a *paragraph* is -- so the decision comes first and the code is what
is left of it.

### One · measured before the rule was written

The first question is not what a paragraph is but whether this tree has any: a widening that changes the verdict
on the real tree would need a decision about each instance. Measured twice.

The first pass walked all three surfaces and stripped each row the way the readers strip it -- code spans
removed, block quotes and fences skipped -- and counted row breaks whose left character and right character are
both Han. **Zero.** The second pass asked the same question of the raw bytes, with no stripping at all, in case
the material was hiding inside a citation: **zero again**, and the longest run that could have been built across
any break in the tree is zero characters. Every Han character in this repository is a short citation inside
backticks, and not one of them is wrapped.

So the rule costs nothing today, and that is worth writing down rather than around: **the whole proof of this
round is in the fixtures**, because the tree cannot carry it. What the tree carries is the other number -- the
breaks the rule was *allowed* to cross and did not need to:

```
check-docs-language: OK — 48 document(s), 0 run(s) of Han prose outside a quotation,
37537 row break(s) held inside a paragraph

check-comments-language: OK — 465 file(s), 23924 comment(s) (19957 line, 3967 block),
0 run(s) of Han prose outside a code span; 30389 row break(s) held inside a paragraph,
350 comment opener(s) skipped inside a string, a template or a regex

check-workflow-language: OK — 6 file(s), 1215 '#' mark(s): 1167 comment(s) (979 line, 188 block scalar),
0 inside a quoted scalar, 13 inside a block scalar's own row, 0 glued to a word;
0 run(s) of Han prose, 808 row break(s) held inside a paragraph
```

68 891 breaks held, **0** of them between two Han characters. The count is reported because a grouper that
flushed at every row would find the same runs and cross nothing, which reads exactly like a tree with nothing to
cross -- so each of the three readers carries a floor under it, and three mutations below take it to zero.

### Two · the decision, and why the join inserts nothing

A paragraph is what the surface says it is, because the surface is the only thing that knows:

| surface | a paragraph is | what ends it |
| --- | --- | --- |
| documents | consecutive prose rows | a blank row, a heading, a fence and its contents, a block quote |
| one comment | its own rows | a blank row -- which in a doc block is a row carrying nothing but its ` *` |
| a file's comments | `//` rows on consecutive rows, in the same column | a gap, a different delimiter, a different column |
| workflow comments | `#` rows on consecutive rows, in the same column | the same three |

And the join between two rows of a paragraph inserts **nothing**. That is not an approximation of "a break
between two Han characters is not a break" -- it *is* it: a run of eight Han characters needs Han on both sides
of every break it crosses, so a break with anything else on either side cannot be crossed by either formulation.
The header states the argument and `check-comments-language.test.ts` states it as an experiment: 400 sequences of
one to six rows drawn from Han runs and Latin fragments by a seeded LCG, the runs this reader finds compared
against a reference that decides each break on its own and inserts a separator everywhere it is not between two
Han characters. Same runs, all 400, and the test asserts that **at least 50** of the runs it compared actually
crossed a break -- a property that never met the case it is about would pass while saying nothing.

### Three · three defects, and each was found by the fixture for the rule beside it

**The space after `//`.** The first version of the join put the doc block's case and the line comment's case in
one function and they are not the same: a doc block's decoration (` * `) is stripped whole, so its rows join
cleanly, and a `//` comment's text keeps the space after the delimiter, so `// 文档说明` and `// 第二行` join as
`说明 第二行` -- one space in the middle of the break, and the rule never fires in a line comment at all. The
fixture went red and named it, and the repair is the general one: both ends of every row are trimmed, because
layout is not text. The same trim is what a hard break written as two trailing spaces and a CRLF file's carriage
return needed, and both now have a fixture.

**`kind` means two different things in the two scanners.** The shared grouper first asked "are these two the same
kind of comment", which is a wall for the source scanner (a `//` row does not continue a doc block: the
terminator that ended the block is between them) and nonsense for the workflow scanner, where `kind` records
*where the `#` was found* rather than what it is. The block-scalar fixture went red and said so: two `#` rows in
a `run: |`, adjacent, one paragraph to their author, refused. The repair is a field with one meaning -- the
comment's **family**: its delimiter and the column it opens at, stated by the scanner that can see both. A `//`
row continues the `//` row above it, does not continue a doc block, and does not continue a row at another
indentation; the workflow scanner says `#` and the column, so a `#` row inside a block scalar continues the `#`
row under it and cannot continue a `#` row at column zero that happened to end the block.

**The spread the guard refused.** `hits.push(...scanParagraph(part))` passed through the whole suite until
`spread-append-guard` named it: the argument count is a function of the paragraph's length, and a paragraph is a
function of the input. Four sites, all now `for` loops. The guard is a previous round's instrument doing its job
on this round's code, which is the cheapest kind of review there is.

### Four · twelve falsifications, one of which proved nothing

Each piece of the new state was removed and the fixtures that hold it were watched. Every run restored the files
afterwards; `cmp` against the saved copies is what says so.

| removed | what it is for | tests that went red |
| --- | --- | --- |
| the join (`''` became `'\n'`) | a run crosses a row break | **9** -- four document fixtures, four comment fixtures, the property |
| the left-hand trim | `// ` leaves a space in the middle of a break | **4** |
| the whole trim | CRLF and the `//` space together | **4** |
| the blank row's flush | a blank row ends a markdown paragraph | **2** |
| a heading being its own paragraph | nothing continues a heading | **1** |
| the block quote's flush | prose does not continue across a quote | **1** |
| the fence's flush | nor across a fence | **1** |
| joining two comments at all | two line comments are one paragraph | **6** |
| the family test | a terminator, a gap and a column are walls | **6** |
| the blank row inside a block comment | its ` *` row ends the paragraph | **1** |
| the source family's column | a wrap does not move | **3** |
| the workflow family's column | nor inside a block scalar | **1** |

**The block quote's flush came back green at first, and the fixture was wrong, not the code.** It read

```
${HAN(4)}
> quoted

Back to English.
```

and the blank row between the quote and the row after it ended the paragraph by another rule, so the flush under
test was unreachable -- the same shape as v3.99's sixth falsification: an assertion about a path it cannot take.
The fixture is now two prose rows with the quote between them and no blank row anywhere, and the mutation goes
red. While rebuilding it, one more thing surfaced: a heading was being *pushed into* the paragraph and flushed
afterwards, which let it join backwards -- not a run this tree can produce, because `## ` is not Han, so the
markers are their own wall, but the `pairs` count was carrying a break no run could ever cross. A heading is now
judged as a paragraph of one, and the witness counts only breaks that can be crossed.

### Five · what this still does not read

**A hard break written as a trailing backslash.** `行末的\` and the row after it are one paragraph to CommonMark
and two to this reader, because the backslash sits between the two characters. Trimming it would be a markdown
rule applied to comments as well, and the two-space form -- the one an editor inserts -- is handled. The cost is
stated rather than paid.

**A code span or a fence broken across rows.** Both are stripped per row, so a span that opens on one row and
closes on the next leaves its contents in "prose". The direction is a false positive rather than a silence, and a
broken span is itself a defect worth a red gate.

**The two P3 and three P2 items are where v3.99 left them**, with one change: the language axis no longer has a
shared boundary to argue about, so the remaining paragraph question is per-surface rather than one decision in
three readers. The list stays at 27 -- the paragraph entry closes and the backslash entry opens, which is the
arithmetic a list of boundaries has.

### Readings

> Ledger for `v3.100`.

| item | value |
| --- | --- |
| `core` test suite | **254 files, 6468 tests passed** (at v3.100) |
| `cli` test suite | **4 files, 187 tests passed** (at v3.100) |
| repo test suite | **258 files, 6655 tests passed** (at v3.100) |
| coverage | `core` **99.97 / 99.95 / 100 / 99.97**, `cli` **100 / 100 / 100 / 100** -- unchanged: the new code is in `scripts/`, which the four dimensions do not measure |
| new tests | **6446 -> 6468, +22**: five document fixtures, ten comment fixtures and the property, seven workflow fixtures |
| the measurement before the rule | **0** row breaks between two Han characters, stripped and raw, across all three surfaces; longest crossing run **0** |
| the breaks held | **37 694** documents, **30 389** comments, **808** workflow, **68 891** total, of which **0** fall between two Han characters |
| the comment census | 465 files, **23 924** comments (19 957 line, 3 967 block), **350** openers skipped |
| the property | 400 seeded sequences, one to six rows, **>= 50** crossing runs compared, same runs as the pairwise reader |
| the falsifications | twelve removals, twelve red; the block quote's fixture had to be rebuilt before its mutation could be observed |
| gate sites | **143 / 67 of 96 scripts**, call tally **161** -- unchanged: no new gate |
| the battery | **228 claims across 66 files** -- unchanged |
| `docs:check` | **21 steps** -- unchanged |
| list | **27 -> 27**: the paragraph entry closed, the trailing-backslash entry opened |

### What is left, in the order it has to happen

| priority | item | state | next |
| --- | --- | --- | --- |
| P2 | the ceiling of 8 workers has never been measured where it is not oversubscription | unchanged: every reading is on a four-CPU quota, so 8 is 2x | one full run on a box with nine or more available CPUs |
| P2 | how close a **failing** run comes to its ceiling | unchanged | one run whose artefact is a failure, read per test |
| P2 | a record's `terms` is a map, so nothing can say which keys a rule writes | unchanged: priced at v3.94, waiting on its trigger | the trigger, or nothing |
| P3 | an in-row `#` inside a block scalar is read by nothing | unchanged: 13 marks, all shell strings | nothing until a block holds a language whose comments are not row-leading |
| P3 | a hard break written as a trailing backslash | **new**: one paragraph to CommonMark, two to this reader | decide whether the backslash is punctuation or text, in one place |

**Where this leaves the campaign.** The language axis now reads the same unit on three surfaces: what a paragraph
is, decided where the surface is legible, and one rule about what a break does to a run. The three P2 items still
wait on something outside this sandbox. The two P3 items are boundaries with a stated cost each -- one about a
language YAML does not name, one about a markdown rule that would have to be applied to comments as well. The
corpus figure, the coverage table and the battery's per-claim witness are where v3.99 left them.

## v3.101 · a deletion is either a hole or a marker, and the two surfaces disagree about which

The Open list carried one decision and three readers: *decide whether a trailing backslash is punctuation or text --
one decision, three readers, and a fixture on each side*. The answer is that it is both, and which one depends on
whether a renderer stands between the bytes and the reader. That is one decision more than the entry priced, and
the extra one is the finding.

The same round carried a second question with the same shape, found while measuring the first: a code span is
deleted outright, and deleting text that is not text lets the two words on its sides touch. Both defects are about
what a removal leaves behind -- nothing, because a marker occupies no position, or a hole, because a quotation is
not a word.

### One · the marker, measured before the rule

Markdown has two spellings for a break that does not end a paragraph. The two-space form was already handled, and by
accident: every row is trimmed at both ends, so the spaces were gone before anything was joined. The backslash form
was joined as `…\…`, and a backslash between two rows is a character no run crosses.

Measured on the tree before the rule: **one** row ends in a backslash, at `docs/progress/volume-10.md:1098`, and it
is not a marker -- it is a fragment left behind by removing a code span from the middle of the row, which is the
second defect below. **Zero** rows are a hard break. So the rule costs nothing today and its whole proof is in the
fixtures, the same conclusion v3.100 reached for the paragraph and for the same reason: a tree written in English
cannot carry a rule about breaks inside Chinese prose.

That fragment is also where the two repairs of this round meet, and it is why the order of two operations is part of
the rule rather than an implementation detail. With the gap the second repair leaves, the byte after the fragment is
a space, so the marker pattern -- looked for before the trim -- does not match and the row keeps a backslash that is
text. Without the gap the fragment is the row's last byte, the byte before it is `)`, and the same pattern would
consume it as punctuation. Both halves are asserted, in a fixture each.

### Two · one decision per surface, which is one more than the entry asked for

The entry assumed one answer for three readers. There are two answers, and the split is at the renderer.

- **The document surface.** A trailing backslash is punctuation. The renderer consumes it and breaks the line, so
  the two rows join with nothing between them and a run crosses -- which is what the two-space spelling already did.
  The rule lives in a `markdownRowOf` that only `proseReport` calls.
- **The comment surfaces.** A trailing backslash is text. JavaScript, shell and YAML have no renderer between the
  bytes and the reader, so `// …\` ends in a backslash and that backslash stands between the two rows exactly as
  any other character does. `textRowOf` is what both comment readers call and it does not know the marker exists.

The two readers therefore disagree about identical bytes, on purpose, and each has a fixture in the direction that
costs something: the markdown one must go red without the rule, and the two comment ones must go red *with* it.

### Three · how narrow the marker is, and why trimming first would invent one

Exactly one backslash, and not itself escaped. The three conditions are asserted as a table rather than described,
because a rule about a run length is a rule with four cases and a prose paragraph about it is a rule with one:

| trailing run | what it renders as | the two rows |
| --- | --- | --- |
| `\` | a break, marker consumed | joined |
| `\\` | one literal backslash | held apart |
| `\\\` | a break and one literal backslash | held apart |
| `\\\\` | two literal backslashes | held apart |
| `\` + one space | a backslash and a space | held apart |

The last row is the one that fixes the order of operations: the marker is looked for **before** the row is trimmed,
because trimming first turns `\ ` into `\` and reads a break nobody wrote. Every approximation in these readers is
chosen towards a break rather than across one, and this is that principle applied to a question about order rather
than about membership.

A backslash anywhere else in a row needs no rule, and that is an argument rather than an omission. An escape removes
one backslash and leaves the character it escaped: `\*` renders as `*`, and `*` stands between two Han runs exactly
as `\*` did. Only a row's last backslash has nothing after it, so only that one is a question about punctuation.

### Four · the defect the marker's only instance pointed at

The one row that ends in a backslash is a fragment: `withoutCodeSpans` deletes a code span, and in
`docs/progress/volume-10.md:1098` the span ended mid-row leaving a stray backslash at the end. Chasing why it was
there turned up the reader's second fabricated join.

`withoutCodeSpans` deleted a span and returned what was left. That is what its name says, and it was right until
the span stopped being at the edge of a row: four Han characters, a citation, four more is two citations, and
deleting the citation outright left eight characters in succession, which the search read as one run of prose.
Nothing in that row is written in Chinese; the join was invented by the reader.

The repair is that a removal leaves a gap -- a quotation is not a word, so it does not let the words on its two
sides meet, which is the paragraph rule stated from the other end. The gap is inserted only where the byte before
the span is not already whitespace, so `a `b` c` returns the two spaces it returned before this rule existed, and a
row holding nothing but a span still comes back blank, because a blank row is how all three surfaces say "new
paragraph" and a citation must not turn a boundary into a line.

**965** spans in **873** rows of this tree have a non-whitespace byte on both sides and **0** of them have Han on
both sides. The number says the shape is ordinary -- the neighbours are `(`, `)`, `[`, `]`, `/`, `,` -- which is why
the condition is stated on whitespace rather than on Han: a rule keyed to the character the reader is looking for
would only work on the language it was written for.

### Five · six falsifications, and one of the seven attempts that proved nothing

| mutation | red |
| --- | --- |
| the strip removed | 5 |
| a strip that ignores the preceding byte (`/\\+$/`) | 4 |
| the strip placed after the trim | 5 |
| the markdown rule moved into `textRowOf` | 2 |
| no gap where a span was removed | 4 |
| a gap after every span | 2 |

Twenty-two red fixtures across six removals. The first attempt at the second mutation replaced with `'$1'` a
pattern that has no capture group, so the row became `…$1` and the tests went red for a reason that had nothing to
do with the rule -- the seventh attempt, and it proved nothing. Replaced with `/\\+$`, which is the wrong reader a
person would actually write, and the four that should fail do.

### Readings

> Ledger for `v3.101`.

| item | value |
| --- | --- |
| `core` test suite | **254 files, 6484 tests passed** (at v3.101) |
| `cli` test suite | **4 files, 187 tests passed** (at v3.101) |
| repo test suite | **258 files, 6671 tests passed** (at v3.101) |
| coverage | `core` **99.97 / 99.95 / 100 / 99.97**, `cli` **100 / 100 / 100 / 100** -- unchanged: both rules are in `scripts/`, which the four dimensions do not measure |
| new tests | **6468 -> 6484, +16**: thirteen document fixtures, two comment fixtures, one workflow fixture |
| the measurement before the rule | **1** row ends in a backslash and **0** are markers; **965** spans in **873** rows sit between two non-whitespace bytes and **0** sit between two Han characters |
| the breaks held | **37 839** documents, **30 453** comments, **808** workflow, **69 090** total, of which **0** fall between two Han characters |
| the falsifications | six removals, twenty-two red; a seventh attempt replaced with a literal `$1` and proved nothing |
| gate sites | **143 / 67 of 96 scripts**, call tally **161** -- unchanged: no new gate |
| the battery | **228 claims across 66 files** -- unchanged |
| `docs:check` | **21 steps** -- unchanged |
| list | **27 -> 26**: the trailing-backslash entry closed, nothing opened in its place |

### What is left, in the order it has to happen

| priority | item | state | next |
| --- | --- | --- | --- |
| P2 | the ceiling of 8 workers has never been measured where it is not oversubscription | unchanged: every reading is on a four-CPU quota | one full run on a box with nine or more available CPUs |
| P2 | how close a **failing** run comes to its ceiling | unchanged | one run whose artefact is a failure, read per test |
| P2 | a record's `terms` is a map, so nothing can say which keys a rule writes | unchanged: priced at v3.94 | the trigger, or nothing |
| P3 | an in-row `#` inside a block scalar is read by nothing | unchanged: 13 marks, all shell strings | nothing until a block holds a language whose comments are not row-leading |

**Where this leaves the campaign.** The language axis has no open question left about what a break does: the unit is
the paragraph, the marker is punctuation on the one surface that has a renderer, and a removal leaves a hole. The
three P2 items wait on something outside this sandbox. The one P3 item is about a language YAML does not name. What
the last two rounds bought is not a change in the verdict -- the tree was green before and after -- but the
disappearance of three ways the rule could have been wrong without anything saying so.

## v3.102 · the artifact published a judgement in a field every reader takes as a measurement

Two contracts publish an easy/medium/hard word for a case's level, and both published the level the
*author* wrote. The floor under it stayed in the repository, so six of thirty-four cases shipped an
opinion beside twenty-eight measurements and nothing in the file said which was which.

### One · measured before the rule was written

`cloud-opsbench` calls the field `difficulty`, `itbench` calls it `scenario_complexity`, and both were
`difficultyFor(FaultCase.difficulty)`. `docs/data-model.md` has said what that field is since the round
that gave it a definition: a **claim**, allowed above the structural floor because a case can be hard to
*detect* while easy to trace, and refused above it unless the case says what the floor cannot see.

Thirty-four shipped cases, the level each states against the floor its own chain supports:

| declared | floor | cases |
| --- | --- | --- |
| `L1` | `L1` | 2 |
| `L2` | `L1` | 2 |
| `L2` | `L2` | 8 |
| `L3` | `L2` | 3 |
| `L3` | `L3` | 13 |
| `L4` | `L2` | 1 |
| `L4` | `L4` | 5 |

**Six** pairs differ, **zero** cases claim below their floor, **zero** state no level. The one `L4` over an
`L2` floor is `history-config-rate-cache-ttl-pricing`: the artifact says `hard` for a case whose structure
supports `medium`, over a chain of a single step. Both exporters were self-consistent, which is why reading
either file could not find this -- every field in each file agreed with every other field in it.

### Two · the floor can travel where the note cannot, for a reason that is checkable

`assembleBundle` drops `difficultyNote` deliberately: it names what the chain cannot see -- a setting
changed days earlier, an exception that closed a connection instead of nacking the message -- and that is a
paragraph of the answer. The floor is not that. It is a lower bound derived from the causal chain, and the
file it lands in already carries the answer: `metadata.json` holds the `result` triple, `scenario.json`
holds `scenario_groundtruth.diagnosis`. In a valid corpus the floor can only *lower* what the claim
suggests, because a level below its floor is refused as a shortfall before anything is exported.

### Three · one projection, and a graph that is not optional

`projectDifficulty({ case, graph })` returns both words and each exporter reads the pair off one object.
Pairing a claim with a floor by hand in `cloudopsbench.ts` and `itbench.ts` would be the third-source
defect `export/difficulty.ts` was created to remove, one level up: two files that have to agree and no
reader that compares them.

The graph is required rather than optional, which is the smaller half of the design: `difficultyFloor` resolves
entity kinds through the graph's index, so a floor computed over an empty graph is `L1` for every case -- a
wrong answer wearing the shape of a conservative one. The module's header called it a leaf for as long as it
read only the type of the level it was given; it is not one any more, and the header says so.

### Four · eight falsifications, one hundred and twenty-five red

| mutation | red |
| --- | --- |
| the floor taken from the claim instead of the chain | 13 |
| the floor read through an empty graph rather than the one passed in | 5 |
| the two words swapped | 28 |
| `cloud-opsbench` drops the key | 7 |
| `itbench` drops the key | 5 |
| the IR level published instead of a projected word | 40 |
| the claim replaced by the floor in both exporters | 25 |
| the structure checks accept any present floor word | 2 |

No mutation survived. The last one is why the field is not merely emitted: a word outside the three is
refused wherever it appears, and neither direction of that check is decoration -- the words the emitter can
produce pass, and a word it cannot produce does not.

### Five · the asymmetry the checks carry, and what this does not fix

`difficulty_floor` and `scenario_complexity_floor` are extensions to two upstream contracts, so the structure
checks hold a present word to the vocabulary and **do not demand the key**. That is not leniency about this
repository's own exports: it is the difference between a statement about validity and a statement about
provenance, since a `metadata.json` the benchmark itself produced carries no such key and a check that
demanded one would score the reference corpus as malformed. What it costs is stated: the shape check cannot
notice an exporter that stopped emitting the pair, so the emission is pinned by the exporters' own tests and
by the generated contract page instead.

**A second finding.** The export count this round moved was also stated in the one paragraph that argues against
restating a count, and it stayed stale while every gate went green (finding 554); the sentence now points at the list.

**What it does not fix.** A case that states no level publishes the documented `unset -> medium` row beside a
floor that may outrank it -- a three-step chain with no label prints `medium` beside `hard` -- and nothing
refuses that pair. The corpus offers no witness (0 of 34), so the repair would be a rule whose only failure
is synthetic; it is an open entry rather than a rule.

### Readings

> Ledger for `v3.102`.

| item | value |
| --- | --- |
| `core` test suite | **254 files, 6509 tests passed** (at `v3.102`) |
| `cli` test suite | **4 files, 187 tests passed** (at `v3.102`) |
| repo test suite | **258 files, 6696 tests passed** (at `v3.102`) |
| coverage | `core` **99.98 / 99.95 / 100 / 99.98** (+0.01 on statements and lines: the one new function is covered), `cli` **100 / 100 / 100 / 100** |
| new tests | **6484 -> 6509, +25**: six in `cloudopsbench`, five in `itbench`, four on the projection, one on the shipped corpus, nine in the two structure checks |
| the measurement before the rule | **34** cases: six pairs differ, zero shortfalls, zero unlabelled; the example bundle carries the same shape |
| the falsifications | eight removals, **125** red, no survivor |
| gate sites | **143 / 67 of 96 scripts**, call tally **161** -- unchanged: no new gate; one `throw` in `format-spec.mjs` moved from line 758 to 760 |
| the battery | **228 claims across 66 files** -- unchanged |
| `docs:check` | **21 steps** -- unchanged |
| list | **26 -> 26**: the projection entry closed by finding 553, and the unset-claim pair opened in its place |

### What is left, in the order it has to happen

| priority | item | state | next |
| --- | --- | --- | --- |
| P2 | the ceiling of 8 workers has never been measured where it is not oversubscription | unchanged: every reading is on a four-CPU quota | one full run on a box with nine or more available CPUs |
| P2 | how close a **failing** run comes to its ceiling | unchanged | one run whose artefact is a failure, read per test |
| P2 | a record's `terms` is a map, so nothing can say which keys a rule writes | unchanged: priced at v3.94 | the trigger, or nothing |
| P3 | an in-row `#` inside a block scalar is read by nothing | unchanged: 13 marks, all shell strings | nothing until a block holds a language whose comments are not row-leading |
| P3 | a case that states no level prints a default beside a floor that may outrank it | new: 0 of 34 have the shape | a corpus with one, or one of the three spellings chosen |

**Where this leaves the campaign.** This round left the language axis, and the defect it found points the other
way: what the artifact says about a corpus rather than what the repository says about its own prose. Six of
thirty-four is a number any later round can recompute from the corpus without trusting a sentence here. The
three P2 items wait on something outside this sandbox; both P3 items wait on a witness this corpus does not
carry.

## v3.103 · the length said which it was, and the count defending the rule was counting cases

`fault.parameters` writes seventeen of the corpus's numbers in a unit of time, and exactly one of them is
how long the fault lasted. Which one was answered by a field naming a single parameter -- optional, so a
case could answer the length rule by deleting it, and the run printed the five that had answered and never
the twelve that had said nothing. The field is gone; the word is written on the parameter.

### One · the count was of cases, and it was three short (finding 555)

The rule's defence in `docs/data-model.md` was a count: *the corpus carries **fourteen** time-valued
parameters and **five** of them are the episode -- the other nine are knobs*. Read with the reader this
round writes, the corpus holds **seventeen** parameters in a unit of time, across **fifteen** cases, of
which **five** state the episode and **twelve** name a knob:

| reading | value |
| --- | --- |
| parameters the case declares | **112** across 34 cases |
| lengths among them (`isConvertible(unit, 's')`) | **17** across 15 cases |
| lengths that state the episode | **5** |
| lengths that name a knob | **12** |

Fourteen is the number of **cases**, and nine was fourteen minus five -- the sentence's own arithmetic only
works if its subject is parameters. The three it lost are one case's two time-valued parameters and another
case's one: `history-config-ingress-timeout-partner-portal` declares `upstreamReadTimeout` and
`previousUpstreamReadTimeout`, and `history-runtime-pod-shutdown-webhook-dispatcher` declares the grace
period and the drain. Nothing read the sentence, and the number the guard printed on every run counted
cases, so the two numbers could never meet.

### Two · the answer moved onto the number it describes (finding 556)

A quantity written in a unit of time now carries one of two words:

| `role` | what the parameter is |
| --- | --- |
| `knob` | a setting the case ran under -- a grace period, a retention gap, a timeout |
| `episode` | how long the fault itself lasted, which the samples are then held to |

The field that used to name one of them is gone rather than kept beside it, for the reason
`readDeclaredReading` removed a reading that carried both a value and a parameter: two statements of one
fact are two that can drift. And the word is mandatory exactly where it applies -- a count, a share and a
byte count have no role to give, and a role written on one is refused rather than ignored, because neither
word could describe it. A case whose parameters hold no length at all is still not refused: it makes no
claim, and the run prints `lengths 0 time-valued parameter(s)` so a case that lost its lengths entirely is
visible rather than silent.

Fifteen case files moved, seventeen words were written and five fields were deleted. The corpus is the
migration's own proof: every one of the seventeen answers, and the five episodes still draw exactly the
minutes their parameters state (4, 6, 17, 18, 120).

### Three · four refusals became three plus one

The refusals that belonged to a *name* -- not a name at all, a name the case does not declare, a name whose
value is not a time -- are gone with the name: there is nothing left to spell wrongly. `readDurationClaim`
now takes the one declaration `readParameterRoles` produces, so its input cannot be a count or a typo, and
three refusals remain: no excursion, two lengths, a number the samples contradict. The one that arrived is
`role-without-time`, which no name field could make.

`check-fault-cases` reads the roles once, refuses every fault they report, refuses a residual
`durationParameter` by name where a file still writes one, and prints the two answers beside the number of
lengths they must partition -- `17 time-valued parameter(s): 5 state the episode, 12 name a knob, 0 say
neither` -- so the third number is counted rather than assumed to be zero.

### Readings

> Ledger for `v3.103`.

| item | value |
| --- | --- |
| `core` test suite | **255 files, 6523 tests passed** (at `v3.103`) |
| `cli` test suite | **4 files, 187 tests passed** (at `v3.103`) |
| repo test suite | **259 files, 6710 tests passed** (at `v3.103`) |
| coverage | `core` **99.98 / 99.95 / 100 / 99.98**, `cli` **100 / 100 / 100 / 100** |
| new tests | **6509 -> 6523, +14**: twelve on the vocabulary and its four faults, one on the guard's refusal of a length that answers neither, one on the partition the run prints, and three the enumeration suite writes for the new module -- it is in three lists there, and `it.each` writes one test per entry |
| the corpus the rule is measured on | **17** lengths across **15** cases: **5** episodes, **12** knobs, **0** silent |
| the migration | **15** case files, **17** words, **5** `durationParameter` fields deleted |
| the falsifications | seven removals, **13** red, no survivor |
| gate sites | **143 / 67 of 96 scripts**, call tally **161** -- unchanged: no new gate; four `throw` sites in `check-fault-cases.mjs` moved with the insert |

## v3.104 · the budget the gate compared against was one the test had already replaced

The round before this one ended with a single red step in CI, and the step was right about the cost and wrong
about the clock it held that cost to. The reader knew the spelling -- it counted it for the discovery rule --
and read a different number for the fraction.

### One · the denominator was a number the test had replaced (finding 557)

`check-test-budgets` asks every file one question: how long did your slowest test take, against what did you
declare? The declaration it read was the one a `describe` states. `ingest-report.test.ts` states 30 000 on its
four suites and writes `}, ROWS_TIMEOUT_MS);` on the two tests that ingest 130 000 rows, with
`ROWS_TIMEOUT_MS = 120_000` above them. In vitest a test-level timeout replaces the suite's, so those two
tests never ran under 30 000 at all -- and the run said otherwise:

    ingest-report.test.ts: its slowest test takes 15199 ms against a stated budget of 30000 ms, which is
    0.51 of it; the rule asks for 2x

8x of headroom, printed as a 2x shortfall, on a commit that changed documentation. Nothing about the
measurement was wrong; the denominator was a number the test had already replaced. This file's four spellings
exist because "a reader that knows fewer spellings than the language fails in the direction of a false red",
and the reader knew this spelling for *discovery* and not for *fraction*: the same defect one level up.

Reproduced without CI by writing 15 199 into that assertion's duration in the report of the local coverage
run -- one problem before, `OK` after -- and the repair is not a relaxation in the other direction either. A
test that states 10 000 inside a suite that states 60 000 used to be measured against 60 000: 6 000 ms read
as 0.10 of the wrong clock, invisible. It is 0.60 of the one it runs under, and that is now the first thing
the rule sees. Six tests were added for the pair, and either half of the pair going away turns the other red.

### Two · to read a position, the reader had to stop deleting

The scanner blanked rather than removed: comments and the bodies of string and regex literals become spaces
at the same length, with the quote characters kept. It had to, because a title is read out of the *file* --
`it('…', fn, 120_000)` is associated with the name the report prints, which is the test's ancestors and its
title joined by spaces -- and an offset in a text whose comments are gone is not an offset in the source.
Keeping the quotes keeps the last-significant-character rule exactly as it was: a `/` after a string is still
a division, and that rule is why the old scanner emitted `""` and `/re/` instead of nothing.

Two measurements say this moved offsets and nothing else. The two readers that existed before were compared
against the pre-round scanner over **250** test files: **0** differences in suite budgets, **0** in stated
budgets. And the one mutation that blanks the quotes too -- the fidelity this paragraph spends words on --
changed **nothing** on **440** files (every test, every script, every source file), for all three readings.
That survivor is below, unimproved.

### Three · six falsifications, eleven red, one that proved nothing

| removal | red |
| --- | --- |
| the suite's number first, as before v3.104 | **4** |
| a repeated title keeps the larger of its two numbers | **1** |
| an options object is read anywhere in the argument list | **1** |
| the title must match exactly, with no suffix | **4** |
| the argument list is split on every comma | **1** |
| the quotes are blanked with the literals | **0** |

The fourth is the largest: with no suffix match, `a suite the slow one` finds no title and every fixture falls
back to the suite's number, which is the defect itself. The third is the flattering direction --
`typecheck-entrypoint.test.ts` calls `spawnSync(cmd, args, { timeout: RUN_TIMEOUT_MS })` inside a test body,
and a reader that took the first `timeout:` it found would hand that test 180 seconds it never asked for --
so the anchor `^\{` is load-bearing and its fixture is that exact shape. The sixth proves nothing on this
tree, and says so in the finding rather than in a comment: whether the quote characters survive changes no
reading, because no file in it divides by a string.

### Readings

> Ledger for `v3.104`.

| item | value |
| --- | --- |
| `core` test suite | **255 files, 6529 tests passed** (at `v3.104`) |
| `cli` test suite | **4 files, 187 tests passed** (at `v3.104`) |
| repo test suite | **259 files, 6716 tests passed** (at `v3.104`) |
| coverage | `core` **99.98 / 99.95 / 100 / 99.98**, `cli` **100 / 100 / 100 / 100** -- unchanged: nothing under `src/` moved |
| new tests | **6523 -> 6529, +6**: the test's own number preferred to its suite's, a tighter test number that was invisible before, the options form past comments, a `timeout:` in the test's body refused, the file's largest number when neither states one, and a title that appears twice |
| the CI reading this round repairs | `15199 ms against a stated budget of 30000 ms, which is 0.51 of it` -- the test states **120 000**, so **0.13**, and the step is green |
| budgets on a test, in the tree | **13 of 250** test files state one, **52** tests in all; the run names how many budgeted files were judged by one -- **11 of 44** this run, **12** the run before it, because which test is slowest moves with the load |
| the reader's own equivalence | **0** differences over **250** files for the two older readers, **0** over **440** for the quote-keeping |
| the falsifications | six removals, **11** red, **1** survivor |
| gate sites | **143 / 67 of 96 scripts**, call tally **161** -- unchanged: no new gate, no new exit; three lines moved in `check-test-budgets.mjs` (85 -> 104, 361 -> 592, 372 -> 603) and the inventory was re-derived |

## v3.105 · the gate read the shape of a budget, and the copy that knew the rule was the one nobody ran

The last round closed with one survivor and one open item: a mutation that changed nothing, explained as "no
file in this tree divides by a string". Both were wrong in the same direction -- the mutation changed nothing
because *nothing read what it changed* -- and looking for the reason turned up two readers of one rule that
disagreed about what the rule was.

### One · a pattern does not end at a slash inside a class (finding 558)

The header of `check-test-budgets.mjs` says the scanner is the one `test/timeout-budget.test.ts` documents. The
document's scanner has tracked **character classes** since the repair that added its fourth mode -- `/['"]/`
holds a quotation, and reading that quotation as the start of a string swallowed the rest of the file. The
gate's `literalEnd` took the first unescaped `/` whatever came before it, so `/[/"]/` ended inside the brackets
and the `"]/` after it was read as code; the quotation there opened a string that ran to the next quotation in
the file, and every budget below it disappeared. A source in the shape the document names:

    const EITHER = /[/'"]/;
    const SUITE_BUDGET_MS = 30_000;
    describe('a suite', { timeout: SUITE_BUDGET_MS }, () => { it('a test', () => {}); });

was reported as `its slowest test takes 16500 ms and the file states no budget, so its verdict is decided by
vitest's 5000 ms default; state one on the suite` -- a false red, in the sentence, telling a file that declared
30 000 ms to declare a budget.

**Why nobody saw it.** A census over the **467** tracked code files finds **eight** patterns holding a slash
inside a class -- `[^/]` in `test/run.test.ts`, `[-_./]` in `src/gates/gates.ts`, a star-and-slash class in
`check-no-absolute-paths.mjs`, and five more -- and **not one of them sits above a stated budget**, so both
scanners returned the same three readings for every file. The tree never combines the shape with the thing the
reading is for; the repair changes **0 of 467** readings, which is what a repair to a latent defect should do.

### Two · a number in an argument list is not a budget (finding 559)

The fourth spelling is positional -- `it('a test', () => {}, 120_000)` -- and it was read with `/, <number>)/`,
a shape that also matches an ordinary call. `buildAnthropicRequest('p', 'claude-3-opus-latest', 8192)`,
`Math.imul(state, 1664525)` and a timestamp written `1700000000` all matched, and only numbers under a thousand
were dropped, so the four-digit arguments were the ones it invented budgets from.

| file | what the reader said it declared | what it writes |
| --- | --- | --- |
| `gen-rcaeval-cases.test.ts` | **1 700 000 000 ms** (19 days) | nothing |
| `modality-comparison-shape.test.ts` | 1 664 525 ms | nothing |
| `battery-journal-node.test.ts` | 20 000 ms | nothing |
| eight more | 1 024 – 15 000 ms | nothing |

Ten of the 259 test files declared a budget they never wrote, and the **floor rule did not fire for any of
them** -- a file that "declares" a budget is not asked to declare one. Nothing was green or red wrongly on the
day: every invented number is larger than the slowest test beside it and all ten are under 1 000 ms. One
three-second test in any of them would have been read as hours of headroom.

The stronger half is that this file's own test named the right rule and pinned the wrong fixture: *does not
mistake an ordinary numeric argument for a budget* asserted `f(x, 2)` and `slice(a, 3)`, both already excluded
by the `>= 1000` filter, so it passed for a reason it did not state. `8192` and `1664525` turned it red.

**The repair.** The positional form is read by `testBudgets`, which finds it **inside a test call** and can
therefore tell a timeout from an argument; `statedBudgets` composes that instead of matching the shape. Files
that state a budget fell **44 → 34**, and the verdict changed for **10 of 259** files, every one from a number
the file never wrote to none. Nine more keep their real declaration and lose only the invented extras.

### Three · the kept quotes had no reader, so last round's survivor proved nothing anywhere (finding 560)

v3.104 blanked the bodies of literals and kept the two characters that delimit them, with a paragraph
explaining why: the last-significant-character rule reads them. The same round replaced that rule's
implementation -- it now carries `last` and `word` while scanning instead of rescanning its output -- and the
new form reads the **source**, not the emitted text. From that commit on, nothing read the quotes. The
paragraph described the previous scanner.

The mutation that blanked them too returned identical readings for **467** files and identical verdicts on the
**259** files of the real run, because the emitted quotes feed no reader at all. v3.104 read that as "this tree
has no such shape" and opened an item about a fidelity no test could prove; the census agrees there are **0**
files with a `/` after a closed literal, but that is the second reason, not the first. The literal is now
blanked whole, the paragraph is replaced by the rule as implemented, and the rule has the test it lacked: the
file is never compiled -- it is input to a lexer, and at the token level `"a" / 2` is a division -- so the
fixture is `const ratio = "a" / 2;` with a budget below it.

### Four · one rule, two copies, and a meta-gate that says the copy cannot be the gate (finding 561)

Three findings, one defect: the rule for "what a file states about its own clock" lived in `scripts/` and in
`test/`, agreed on every file in the tree, and disagreed on what the rule *was*. The copy existed because a
gate may not be imported: `verify-gates-are-testable.mjs` proves a gate by emptying it and requiring the suite
to go red **and to name a failing test**, which an imported gate makes impossible. The first attempt at this
repair was the obvious one -- import the gate -- and `scripts-are-classified.test.ts` refused it in under a
second with the remedy in the message: *move the reading into a data module and leave the verdict in the gate*.

`scripts/budget-readings.mjs` is that module: the scanner, the four spellings, `budgetInForce`, and the
sentences that name a declaration. The gate imports it and keeps the verdict; `timeout-budget.test.ts` imports
it and keeps the rule; **179 lines** left the test file and **none** were restated. The gate's `main()` also
gained the `invokedDirectly` guard the deriver and the doc-counter already carry, without which an import runs
a gate over the test runner's own arguments. The register gained a row for the module, the site inventory moved
from **96 to 97** scripts, and sites (**143**) and throw statements (**99**) did not move.

### Six · a hollow gate rode into a commit, and the receipt blessed the tree the run began on (finding 562)

This round's own documentation commit published `scripts/check-official.mjs` with `process.exit(0);` on its
second line. The marker is the meta-gate's hollow form, a battery had left it behind, and `git add -A` took it
along while a long run was still rewriting the tree. Three readers disagreed:

| reader | verdict |
| --- | --- |
| `verify:local` | `OK (35 command(s) covering 48 of the 58 run steps)`, with a receipt |
| `derive-gate-sites` | **FAILED** -- six of that file's exit sites had moved by one line |
| the suite | **68 tests fail** against the hollow form, measured by re-hollowing it |

The inventory caught it by arithmetic: the marker is a line, and the inventory fingerprints exits by line. A
marker that did not shift a line would have passed every local reader. The receipt was no help at all, and
that is finding 562: `HEAD^{tree}` is resolved **before** the first step, deliberately, so a step that
rewrites the tree cannot move the name the receipt is filed under -- which makes the name right and the
question half-asked. A run that starts on one tree and ends on another has measured neither, and its verdict
names the first.

`receiptDecision` now takes the tree read **after** the steps and withholds the receipt when it moved, name or
dirtiness; the run's last line becomes `receipt: none — the tree moved while the gate ran`. It does **not**
turn the run red, and the finding says why: a new exit is a new site, and a site is proved by a test that
reaches it -- the only way to reach this one is to rewrite the tree underneath a running gate, which is the
thing being refused. Two falsifications hold the branch: dropping the comparison turns both withhold tests
red, and keeping the dirtiness check while dropping the name turns one red.

### Five · six falsifications, all red

| removal | red |
| --- | --- |
| classes tracked for strings too | **1** |
| a class never closes | **1** |
| a pattern ends at the first slash, as before v3.105 | **1** |
| a literal's delimiter is not noted | **1** |
| the positional spelling read by shape, as before v3.105 | **1** |
| the positional spelling read in a call of any name | **1** |

The first is the guard that keeps a bracket inside a string from opening a class it never closes; the second
is the closing bracket; the third is finding 558 itself; the fourth is the rule that a value cannot be followed
by a pattern. The last two are the two ways to be wrong about the positional form: by shape (finding 559) and
by callee (any call, which is the same defect with a narrower net).

### Readings

> Ledger for `v3.105`.

| item | value |
| --- | --- |
| `core` test suite | **255 files, 6536 tests passed** (at `v3.105`) |
| `cli` test suite | **4 files, 187 tests passed** (at `v3.105`) |
| repo test suite | **259 files, 6723 tests passed** (at `v3.105`) |
| coverage | `core` **99.98 / 99.95 / 100 / 99.98**, `cli` **100 / 100 / 100 / 100** -- unchanged: nothing under `src/` moved |
| new tests | **6529 -> 6536, +7**: a pattern holding a slash inside a class with a budget below it, a division that follows a literal, a string holding a bracket, an argument that is not a budget, and the three outcomes of a tree that moved while the gate ran |
| tests strengthened | **1**: `does not mistake an ordinary numeric argument for a budget` pinned two numbers the `>= 1000` filter had already excluded |
| the census | **467** code files scanned; **8** patterns hold a slash inside a class; **0** files hold a `/` after a closed literal |
| what the repair changed | **0 of 467** readings for the class fix; **10 of 259** verdicts for the positional one, all from a number never written to none; files that state a budget **44 -> 34** |
| the copy, deleted | `timeout-budget.test.ts` **888 -> 709** lines; `scripts/budget-readings.mjs` **458** lines new; the gate **622 -> 272** |
| gate sites / scripts / throws | **143** sites, **97** scripts (was 96), **99** throw statements -- all three re-derived and proved |
| the falsifications | eight removals, **8** red, **0** survivors (six across the three repairs, two on the receipt's new branch) |
| gate sites, proved | **143** failure sites across **67 of 97** scripts, and `verify-site-proofs` **PASSED (228 claim(s) across 66 file(s))** -- both re-derived after the move |

## v3.106 · the receipt was refused and the verdict still said OK

The round before this one ended with a finding whose "what it does not fix" was a sentence about the sentence: the
receipt withheld on a moved tree, the verdict still printed `OK`, and the run still exited 0. That sentence is this
round's subject, and the argument it made -- a red run needs a new exit, a new exit is a new site, a site is proved
by a test that reaches it -- was sound about new exits and silent about the one already there.

### One · the word, the code and the file said three things (finding 563)

`receiptDecision` decides whether a run may name a tree. After finding 562 it also knew when the tree had moved.
`verify-local.mjs` read that decision, wrote the receipt when it said `issue`, and then printed a **literal**:

    `verify:local: OK (${coverage})${notes}`

so a run that began on one tree and ended on another printed `OK`, exited **0**, and put the refusal on the second
line -- `receipt: none — the tree moved while the gate ran …` -- where a pusher who has just read `OK` does not look.
Two of the three facts about that run were wrong, and both of them were the ones a script reads.

The measurement is the previous round's own incident, which is why this is not a hypothetical: v3.105's
documentation commit carried `process.exit(0);` on the second line of `check-official.mjs`, `verify:local` printed
`OK` with a receipt, the inventory caught it only because a line moved six exits by one, and **68** tests fail
against the hollow form.

### Two · one predicate, one decision, two readers

Three pieces, each in `scripts/gate-receipt.mjs` because that is the module a test may import:

| piece | shape | the defect it removes |
| --- | --- | --- |
| `treeMoved({ started, ended })` | `null` or the sentence | the comparison had two readers the moment the verdict needed it, and a second copy of a rule is finding 561 |
| `because` on the decision | `'starting-tree'` / `'subset'` / `'moved'` | `runVerdict` cannot parse the sentence: a wording change would become a behaviour change |
| `runVerdict({ result, decision })` | `{ word, exit }` | the word and the code are one claim, and deciding them apart is how they came to disagree |

The gate now reads one value twice -- the word on the green path, the branch on the rest -- so the printed word and
the exit code cannot disagree without contradicting the same variable. `voidReport` prints the block, from the exit a
failed step already uses, which is why the inventory did not gain a site.

### Three · four boundaries, each a wrong answer that looks right

| shape | verdict | why |
| --- | --- | --- |
| starts clean, ends clean on another tree | **VOID**, exit 1 | a commit landed mid-run |
| starts clean, ends dirty | **VOID**, exit 1 | a step wrote to the tree while the gate ran |
| starts dirty, ends dirty | **OK**, exit 0, no receipt | that is a developer at work; comparing `state` alone fails every local run |
| a subset run | **OK**, exit 0, no receipt | it proves the steps it ran, and the verdict line already says which |
| a step failed **and** the tree moved | **FAILED**, exit 1 | the failing step is the actionable fact; the move is its consequence |

The block a reader now gets instead of `OK`:

    verify:local: VOID — the tree moved while the gate ran
      started: 6592c7b (clean)
      ended:   c29138f (clean)
      measured: 35 command(s) covering 48 of the 58 run steps in ci.yml; the other 10 need a runner
      reason:  the tree moved while the gate ran -- it started on 6592c7b and ended on c29138f, so the verdict
               names a tree that no longer exists
      receipt: none — the steps passed over content this tree no longer is, so no revision here may be published
      next:    run it again on the tree you mean to publish

### Four · nine removals red, one survivor measured rather than argued

| removal | red |
| --- | --- |
| the `VOID` branch in `runVerdict` | **1** |
| a dirty start is not a move | **2** |
| the run wrote to the tree | **2** |
| the tree could not be read afterwards | **1** |
| the receipt quotes `treeMoved` rather than restating it | **3** |
| the kind of withholding the verdict reads | **3** |
| the verdict word | **1** |
| what the run covered | **1** |
| the sentence the void report quotes | **1** -- the first attempt was **green**, and the assertion added for it is this row |
| the gate's exit code (`process.exit(verdict.exit)` to `process.exit(0)`) | `derive-gate-sites --check` **FAILED** -- the exit becomes a zero and leaves the inventory |

The survivor is the one that matters and it is stated, not concealed: replacing the gate's
`runVerdict({ result, decision })` with `runVerdict({ result, decision: { state: 'issue' } })` is **green
everywhere** -- **207** tests in the three files that touch this gate, and `derive-gate-sites --check` unchanged,
because the exit is still reached by the failing-step spawn. The cause is structural: the gate may not be imported,
so nothing it *does with* a pure result is observable except through a spawn, and the spawn that would reach this
branch has to rewrite the tree underneath a running gate. What the round buys is that the rule now has one home with
nine removals behind it and the exit has a proof (`scripts/verify-local.mjs:177`, re-signed after the move and
re-measured: **228** claims across **66** files).

### Five · the inventory moved and the proof was re-taken

The exit moved from line 134 to 177 as the block above it grew, and its guard text changed twice on the way
(`!result.ok`, then `!result.ok || moved !== null`, then `verdict.exit !== 0`). `derive-gate-sites` keys the
hand-written columns on that text, so the site's `provedBy` was **dropped** on both re-derivations and restored by
hand -- and then measured rather than assumed: `verify-site-proofs` re-runs the named file with a hook on
`process.exit` and reports that the exit arrived. Sites **143**, scripts **97**, throw statements **99** -- all three
unchanged; the other four `verify-local.mjs` sites moved with the lines above them (80 -> 87, 97 -> 104, 107 -> 114,
209 -> 235) and carried their annotations.

### Readings

> Ledger for `v3.106`.

| item | value |
| --- | --- |
| `core` test suite | **255 files, 6549 tests passed** (at `v3.106`) |
| `cli` test suite | **4 files, 187 tests passed** (at `v3.106`) |
| repo test suite | **259 files, 6736 tests passed** (at `v3.106`) |
| coverage | `core` **99.98 / 99.95 / 100 / 99.98**, `cli` **100 / 100 / 100 / 100** -- unchanged: nothing under `src/` moved |
| new tests | **6536 -> 6549, +13**: seven shapes of `treeMoved`, four of `runVerdict`, two of `voidReport` |
| the falsifications | nine removals in the module, **15** red; one in the gate, the inventory; **one survivor**, measured |
| the survivor's measurement | **207** tests green and `derive-gate-sites --check` OK against a gate told to ignore the decision it computed |
| gate sites / scripts / throws | **143** / **97** / **99** -- unchanged; the exit moved 134 -> 177 and its proof was re-signed and re-measured |
| `verify-site-proofs` | **PASSED (228 claim(s) across 66 file(s))** |
| what the gate prints now | `OK` on the green path, `VOID` + exit 1 when the tree moved, `FAILED` + exit 1 when a step did |
| a real subset run | `verify:local --only scripts` -> `OK (1 command(s), 1 of the 48 local steps)` and `receipt: none — the working tree differs from 6592c7b` -- the dirty start is OK by design |

## v3.107 · a gate computed a verdict, and nothing could ask whether it obeyed it

The round before this one ended on a number instead of a claim. Finding 563 repaired the verdict, then measured
what it had not fixed: a gate told to ignore the decision it computed -- `runVerdict({ result, decision: { state:
'issue' } })` -- was green in **207** tests, with `derive-gate-sites --check` unchanged. That sentence went onto
the Open list. This round is what it took to close it.

### One · two instruments, and the fact between them

The tree holds two proofs about gates and they cover two different questions.

`golden-master/gate-sites.json` proves that a `process.exit(...)` **exists** and that a named file **reaches**
it -- `verify-site-proofs` re-runs that file with a hook on `process.exit` and reports whether the exit arrived.
`verify-gates-are-testable.mjs` proves that a gate is **executed** at all, by hollowing it and requiring a failing
test to be *named*. That second requirement is also why a gate may not be imported: a module hollowed at import
time kills the worker, names no test, and the harness reports `UNATTRIBUTED` -- correctly, because a crashed
worker is not a verdict.

Between "an exit exists" and "the gate runs" sits the third fact:

> the value the gate computed is the value it obeyed.

### Two · why a better spawn could not buy it

The only real run that prints `VOID` is one whose tree moved while the gate ran. Producing that from a test means
rewriting the working tree underneath a running gate, which is exactly what that branch exists to refuse. So the
observation was not for sale at any price in spawns. The gate had to stop needing a tree.

### Three · a second source of inputs, and no second close-out

`verify-local.mjs` gained `--rehearse <shape>`. A shape names a `result`, a pair of trees and whether the run was
full; the gate reads those from a table instead of from a fifteen-minute run, and then executes **the same** lines
it executes for real.

| part | before | after | why it is load-bearing |
| --- | --- | --- | --- |
| the close-out | 90 lines inside `main()` | one `settle()` | a test can drive it, and `main()` keeps no copy to drift from it |
| `decision` | computed in `main()`, passed down | computed **inside** `settle()` | a caller that computed it would leave the wiring outside the rehearsal's reach -- and the wiring is the thing measured to be unobservable |
| `root` | `ROOT` throughout | a parameter | a rehearsal must not file a receipt for a tree that does not exist in this repository's `.git` |
| the shapes | -- | `REHEARSAL_SHAPES` + `rehearsal()` in `gate-receipt.mjs` | it is the enumeration of that module's own branches, so it sits beside the rule and moves when the rule moves |

Five shapes: `passed`, `subset`, `moved`, `dirty-end`, `failed`. The last carries **both** a failed step and a
moved tree, because `FAILED` has to outrank `VOID` and this is the only place where one run is both. A dirty
*start* is deliberately absent: it is the state a developer is in all day, its verdict is `OK` with no receipt,
and `--only` already drives it through the real path.

The block `moved` prints, which nothing had ever read end to end before a test did:

    verify:local: VOID — the tree moved while the gate ran
      started: 1f4a0c9 (clean)
      ended:   9c2b7d4 (clean)
      measured: 0 command(s) covering 48 of the 58 run steps in ci.yml; the other 10 need a runner
      reason:  the tree moved while the gate ran -- it started on 1f4a0c9 and ended on 9c2b7d4, …
      receipt: none — the steps passed over content this tree no longer is, …
      next:    run it again on the tree you mean to publish

### Four · the expectation cannot come from the implementation

A rehearsal that computed its own expected word would agree with the gate by construction. The table of
`(shape, word, exit, stream)` lives in `gate-steps.test.ts`; the gate supplies the behaviour. The other direction
is closed too: the refusal for an unknown name publishes the list of shapes it has, and a test compares that list
to its own table sorted -- so a shape added to the gate and not to the test is red rather than silent.

That refusal is also the round's own near-miss, recorded because it is the reason the branch exists. The tests
were written first, and a gate that had never heard of `--rehearse` treated it as a step filter it could ignore:
one `it` started the full thirty-five-step plan. The run was killed after twenty-two minutes, on a tree that was
still clean, and the branch under it had answered the question the test was asking -- by taking a quarter of an
hour to say one word.

### Five · ten removals, twenty-four reds, no survivor

| removal | red |
| --- | --- |
| the gate ignores the decision it computed (the v3.106 survivor) | **4** |
| the gate decides for itself whether the run was a subset | **1** |
| the void branch is never chosen (`VOID` compared against `FAILED`) | **6** |
| the exit code ignores the verdict | **3** |
| the receipt is filed for every run (`issue` inverted) | **3** |
| the moved shape is the same tree twice | **2** |
| an unknown shape falls through to a green rehearsal | **1** |
| the refusal exits zero | **1** |
| a shape is published that has no sample | **1** |
| the failing shape stops outranking the move | **2** |

The first row is the subject of the round: the edit that was green in every instrument this tree had, four rounds
ago, now costs four tests.

### Six · one site, and this one a spawn can reach

The refusal is a new `process.exit(1)`, so the inventory moves **143 -> 144** and the battery **228 -> 229 claims
across 66 files**. Finding 563 argued that a new exit is a new site and a site needs a test that reaches it, and
declined to add one. That argument was about a branch no spawn could reach. This branch is reached in under a
second by the test that types a name the table does not have -- so it is paid for the ordinary way, and the two
sentences are not in tension: the cost of a site is real, and the question is whether it can be proved.

`derive-gate-sites-tally.test.ts` pins the pair and now carries a paragraph for this round, because the pair has
moved thirteen times and this is the first time for a reason none of the twelve had: every round before added a
*reader* -- a gate that reads a figure, a sentence, a comment, a workflow's prose. This one adds no reader. It
makes an existing gate's consumption of a value falsifiable.

### Readings

> Ledger for `v3.107`.

| item | value |
| --- | --- |
| `core` test suite | **255 files, 6560 tests passed** (at v3.107) |
| `cli` test suite | **4 files, 187 tests passed** (at v3.107) |
| repo test suite | **259 files, 6747 tests passed** (at v3.107) |
| coverage | `core` **99.98 / 99.95 / 100 / 99.98**, `cli` **100 / 100 / 100 / 100** -- unchanged: nothing under `src/` moved |
| new tests | **6549 -> 6560, +11**: five shapes rehearsed, plus the void block's four lines, the dirty ending, the subset withholding, the receipt filed, `FAILED` outranking `VOID`, and the refusal that publishes the table |
| the falsifications | ten removals, **24** reds, **no survivor** |
| the survivor's fate | `runVerdict({ result, decision: { state: 'issue' } })` was green in 207 tests last round; it is **4 red** now |
| gate sites / scripts / throws | **144** / **97** / **99** -- one new exit, no new script |
| `verify-site-proofs` | **PASSED (229 claim(s) across 66 file(s))** |
| what a rehearsal costs | **0.4 s** for the eleven tests together; the plan it replaces costs fifteen minutes |
| the live list | **26 -> 26**: closed "no gate's use of a pure decision is proved" (finding 564), opened "the rehearsal pattern is one gate's, not an instrument" |

## v3.108 · the classifier that decides which numbers are true was filed as a table

**Two sentences, and both were about the thing beside the function.** `scripts-are-classified.test.ts` files
`doc-counts-vocabulary.mjs` as `data` -- "a module under `scripts/` that exports a table and has no `main`. It is
imported rather than run, so it has no exit and no verdict." The module's own header said the same thing in the
first person: "it is a plain data module: no `main`, no exit, nothing to prove." Neither sentence was about
`scopeOf`.

`scopeOf` decides **which published count belongs to which suite**, and therefore which numbers a guard may hold
to a measurement and which row a writer may rewrite. It had four branches, no test in the tree imported the
module to call it, and its only proof was two spawned gates over fixtures -- which is the route this same file
describes elsewhere as "a spawn, which cannot name the branch you broke". A branch of the classifier that decides
which numbers are true could be deleted, and nothing would notice.

**Three shapes the corpus writes that the chain answered wrongly or unasked.**

| label, as a document writes it | what `scopeOf` answered | what the label is |
| --- | --- | --- |
| `core / cli / repo` (three rows, `volume-08`) | `core` | one row publishing three suites; the first word won |
| `` `scripts/publish-cli.mjs` `` | `cli` | a file's name, not a claim about a suite -- `\b` splits at `-` |
| `every workspace` | `repo` | an alias no document uses, and the word `repo` is not in it |
| `packages/core` | `core` | a path |

The first is the worse one: a label naming three suites is *more* ambiguous than the bare `test suite` the
module was created to refuse, and it was answered rather than refused. None of the four is reachable in the
corpus today by a count shape -- which is luck, not a rule, and the row one `N files, M tests` away from being
checked against the wrong suite is what makes it a defect rather than a curiosity.

**The survivor, measured rather than argued.** Deleting the `every workspace` alternative left **255 files /
6,560 tests** green and `check-doc-counts` green over **433** published counts. That is the round: one of the
four branches had no reader anywhere -- not a test, not a fixture, not a document.

**Where the alias came from.** The checker kept its own `SCOPES`:

    const SCOPES = { core: 'packages/core', cli: 'packages/cli', repo: 'every workspace, i.e. `pnpm test`' };

and printed `Object.keys(SCOPES).join(', ')` -- twice, and never a value. Three strings sat in a guard looking
like operator-facing text that no operator had ever seen, and the `repo` one had already been copied into the
classifier as a matching alternative. A dead string is not inert: it reads as a specification.

**The repair: the list is the source, and the classifier is a function of it.**

| part | before | after |
| --- | --- | --- |
| the words | the union of what a chain of `if`s tested | `SCOPES = ['core', 'cli', 'repo']`, exported |
| `scopeOf` | first branch that matched, anywhere in the label | every name that stands alone; one name or `null` |
| `null` | a bare `test suite` | a bare label, a compound label, a path, and an unknown word alike |
| the notes | private to the checker, never printed | beside the words, and printed in the rule-1 refusal |
| the writer's `SCOPES` | three literals beside the vocabulary | `VOCABULARY.map((name) => ({ name, ...MEASUREMENTS[name] }))` |
| the vocabulary's own proof | none | `doc-counts-vocabulary.test.ts`: 12 tests, the only importer |

`null` is not a soft answer, and that is what makes the deletions safe: rule 1 of `check-doc-counts.mjs` refuses
a published count whose scope is `null`, so `every workspace` -- had a document ever used it -- becomes a
sentence an author can act on ("say which one it measured, with what each one covers") instead of a guess made
on their behalf. The alias was not a safety net; it was the failure the module exists to prevent, one spelling
over.

The four values in the refusal are the only place the vocabulary reaches a reader, so a test now asserts the
message contains all three notes. A note no message prints is a note that gets believed and not read -- which is
exactly how `every workspace` became a branch.

**Seven edits, thirteen reds, one equivalent.**

| edit | red |
| --- | --- |
| the classifier answers with the first word again | **1** |
| the delimiters are `\b` again | **1** |
| a fourth scope is added to the vocabulary | **7** |
| the refusal stops printing the notes | **1** |
| a scope arrives with no argv to run | **2** |
| the writer's list is written by hand again | **0** -- equivalent |
| the vocabulary's test is deleted | **1**, naming `doc-counts-vocabulary.mjs exports scopeOf and no test imports it` |

The sixth row is honest about what a value test can and cannot say. A hand-written list that *agrees* with the
vocabulary is the same behaviour today; what the new test buys is that the day the two disagree -- the only day
that matters -- it is red. The seventh is the class rule proving itself, and it names the module and the
function rather than a file count.

**The class rule, and what it is worth.** `data` is the class that excuses a script from every other instrument
in the tree: no exit for the inventory, and hollowing cannot reach a module nothing spawns. So "exports a table
and has no `main`" was the whole of its proof, and the word *table* was doing the work. The register now carries
the rule with a reader: **a `data` module may export functions only if some test file imports it** -- 27 data
modules export functions, and this one was the only one nobody imported.

**What this does not establish.** The rule is over modules, not over the edges that consume them. Measured at
this round, **20 of 59** gates import a module that exports functions, over **31** edges, and **one** of those
edges has an entry point that supplies inputs a run did not produce (`verify-local.mjs`, through `--rehearse`,
finding 564). The other nineteen compute a verdict from a module and can only be run over the tree they are
looking at. That is the half this round did not buy, and it is now a stated item with a count rather than a
paragraph.

### Readings

> Ledger for `v3.108`.

| item | value |
| --- | --- |
| `core` test suite | **256 files, 6576 tests passed** (at v3.108) |
| `cli` test suite | **4 files, 187 tests passed** (at v3.108) |
| repo test suite | **260 files, 6763 tests passed** (at v3.108) |
| coverage | `core` **99.98 / 99.95 / 100 / 99.98**, `cli` **100 / 100 / 100 / 100** -- unchanged: nothing under `src/` moved |
| new tests | **6560 -> 6576, +16**: twelve in the vocabulary's first importing test, the refusal naming its three notes, and three that make the class rule a reader |
| the falsifications | seven edits, **13** reds, **one equivalent** and it is named as one |
| the survivor's fate | deleting the `every workspace` alternative was green in **255 files / 6,560 tests**; the word no longer exists, and its absence is pinned as `null` with rule 1 behind it |
| gate sites / scripts / throws | **144** / **97** / **99** -- no new exit, no new script; six line numbers moved in `doc-counts-rows.mjs` and carried their proofs |
| `verify-site-proofs` | **PASSED (229 claim(s) across 66 file(s))** |
| the vocabulary's three homes | one list, one derived classifier, one writer table keyed by it, and a test that compares all three |
| gates importing a decision module | **20 of 59**, over **31** edges, **1** drivable |
| the live list | **26 -> 26**: the rehearsal item narrowed to the gate side, with the census written into it |

### Left open

- **Nothing asks a gate whether the decision it consumed could have been driven.** The module half is closed
  here.
  `[open: the edge half needs a reader over the gate -> module edges, and the measurement it would start from is in the live list -- 20 of 59 gates, 31 edges, 1 drivable]`
- **`scopeOf` reads a label, so it cannot see a row that names its suite somewhere else.** A row whose label
  names no scope and whose value cell names one is refused by rule 1 rather than read.
  `[open: the refusal is the right direction and it costs a re-read of the row, which no round has needed yet; the reading that would settle it is a corpus row of that shape]`

## v3.109 · the rule was keyed by module, which is the key the `src/` instrument had already rejected

**Finding 566 is a rule that was one level too coarse, and the tree already knew.** v3.108 gave the `data` class
its first reader: *a `data` module may export functions only if some test file imports **the module***. Three
hundred lines away, `export-surface-enumerated.test.ts` -- the instrument for `src/` -- carries a design note
that says exactly why that key is the defect:

> `UNENHANCED` was keyed by *module* ... a symbol added to `cli/args.ts` next month would be exempted by a reason
> written about a different symbol. An exemption whose scope is wider than its argument is finding 47 again.

A module ten tests import satisfies the module-wide rule for every symbol it will ever grow. Measured at this
round: **28** `data` modules export **155** functions, and the module-wide rule sees one bit about each of them.
The symbol does not need a different instrument; it needs the key the `src/` side had already settled on.

**What the symbol key found, on the tree v3.108 left green.**

| population, before v3.109 | count | what it was |
| --- | --- | --- |
| exported and taken by a test | **145** | the reader existed |
| exported and taken by nothing outside the module | **7** | the keyword was a claim with no consumer |
| exported and taken only by a script the suite spawns | **10** | the branches are reached by a process, never by an import |
| total | **162** | across 27 modules |

The seven are not a rounding error; they are the *reason* the module-wide rule could not see them. `largestVolume`
is called once, in the function that returns the verdict it feeds. `testBudgets`, `narrowed`, `entriesOf`,
`closingSectionsIn` and `ledgerOf` are each called inside their own module and nowhere else. And `gitIn` was
**two of the seven at once**: `gate-receipt.mjs` and `git-hooks.mjs` each define a runner for `git`, one written
`spawnSync('git', args, { cwd: root })` and the other `spawnSync('git', ['-C', root, ...args])`. One of the two
copies had been taken by a test since it was written, which is the whole of why the duplication survived: *the
module that had a test looked proved*.

**Three ways the two spellings could have differed, and one way they did.**

| shape | `cwd: root` | `-C root` | same answer |
| --- | --- | --- | --- |
| a command that works | stdout | stdout | yes |
| a revision that does not resolve | status 128 | status 128 | yes |
| a root that is not a directory | spawn error, `status: null` | status 128 | yes, both `null` |
| a root that does not exist | spawn error, `status: null` | status 128 | yes, both `null` |

Equivalent on every shape, which is why nothing caught it -- and also why the duplication was harmless and still
wrong: the next caller copies whichever copy it reads first, and "what a git failure looks like here" gets a
second author. The consolidation moved it to `scripts/git-in.mjs`, imported by both, with `git-in.test.ts` holding
the contract and the equivalence (`git -C` vs `cwd`, side by side, on the same five argument lists).

**And the equivalence test found a dead condition in the code it was written to protect.** The first draft of the
shared runner carried both copies' guard:

    if (result.error !== undefined || result.status !== 0) return null;

Deleting the `error` arm left **all six tests green**. `spawnSync` pairs every way of not starting a child with
`status: null`, and a child killed by a signal also reports `status: null` -- so `null !== 0` already answers
`null` for both, and the first arm could not change an answer. The shipped form is one comparison:

    return result.status === 0 ? result.stdout : null;

That is the round's eleventh falsification, and it is reported as an equivalent mutant rather than as a survivor:
the code changed because of it, and the test that reaches the shape (git taken off `PATH` for one call) is in the
file.

**The rule, and the two directions that keep its table honest.** The exemption table is where a spawned-only
symbol is decided, and it is validated four ways:

| the table entry | refused when |
| --- | --- |
| `SPAWN_ONLY` names a symbol | the symbol is not one a `data` module exports |
| the symbol is reachable | a test takes it (**stale**, and the table can only shrink by work) |
| a spawn is the only route | no script takes it (**it must be made private instead**) |
| the reason says why | it is under 120 characters, or shares its text with another entry |

The second row is the one that pays: widening the reader back to a module-wide key leaves the first rule green,
because every symbol of an imported module becomes "taken" -- and the **stale** rule goes red, because
`gate-receipt.mjs#rehearsal` is a name no test takes. The table's own direction catches the regression the rule
was written against.

**Eleven falsifications, sixteen reds, one equivalent.**

| edit | red |
| --- | --- |
| the reader stops seeing a computed dynamic import | **2** |
| an exemption is dropped | **2** |
| an exemption is added for a symbol a test takes | **2** |
| a reason is three characters long | **1** |
| two exemptions share one reason | **1** |
| an export nobody consumes comes back | **1** |
| the export detector matches nothing | **1** -- the floors, not the rule |
| the reader is keyed by module again | **1** -- the stale direction |
| the runner judges by `error` instead of `status` | **3** |
| the runner strips the newline git prints | **2** |
| the plural arm of the hung-test sentence is folded into the singular | **1** |
| the `error` arm of the runner is removed | **0** -- equivalent, and the arm is gone |

**The fourth import form, and why the reader had to learn it.** `measure-doc-counts-readings.test.ts` takes
`parseSummary` and `countsFromReports` with

    const { … } = (await import(pathToFileURL(resolve(ROOT, 'scripts', 'doc-counts-rows.mjs')).href)) as { … };

so the specifier is not a literal and a reader keyed on `from '…/x.mjs'` calls both unread. A census that had
missed them would have asked for two exemptions for functions a test pins branch by branch -- the instrument
demanding bookkeeping for work already done, which is how an instrument gets deleted. The control test names both
names, so a reader that loses the form goes red rather than quiet.

**What this does not establish.** The reasons in `SPAWN_ONLY` are prose, and no reader can check that a spawn is
*really* the only route: the three tests that follow the table check that the symbol is spawned, that no test
takes it, and that the sentence is a sentence. A gate that could be driven tomorrow would still be excused by
today's paragraph -- the table's only defence is the stale direction, which fires when a test takes the name and
never when a flag makes it driveable. That is one item, and it is stated rather than implied.

### Readings

> Ledger for `v3.109`.

| item | value |
| --- | --- |
| `core` test suite | **257 files, 6589 tests passed** (at v3.109) |
| `cli` test suite | **4 files, 187 tests passed** (at v3.109) |
| repo test suite | **261 files, 6776 tests passed** (at v3.109) |
| coverage | `core` **99.98 / 99.95 / 100 / 99.98**, `cli` **100 / 100 / 100 / 100** -- unchanged: nothing under `src/` moved |
| new tests | **6576 -> 6589, +13**: seven for the symbol rule, six for the shared runner, four for the hung-test sentence, minus the one the runner's old home carried |
| the exports | **162 -> 155** across **27 -> 28** modules; test-taken **145 -> 146**; excused in writing **0 -> 9**; with no consumer **7 -> 0** |
| the falsifications | twelve rows, **16** reds, **one equivalent** that changed the code |
| gate sites / scripts / throws | **144** / **67 of 98** / **99** -- no new exit; the inventory's scan grew by one script (`git-in.mjs`) |
| `verify-site-proofs` | **PASSED (229 claim(s) across 66 file(s))** |
| the class rule | keyed by symbol, with a table validated in four directions and a control for the dynamic import |
| the live list | **26 -> 26**: the rehearsal item's edge half is replaced by the export-surface item, which is closed for `scripts/` and named for the reasons it cannot be |

### Left open

- **A reason is prose, and nothing can check that a spawn is the only route.** The table's stale direction is
  the only falsification available to it.
  `[open: the reading that would replace the prose is a census of the inputs each gate takes from outside -- a flag it parses, an env name it reads, a script copied into a fixture tree -- and the route each of those inputs reaches]`
- **`src/` has the same instrument and `scripts/` now has a second one.** They agree in shape and not in code: two
  readers, two tables, two floors.
  `[open: one reader over both directories would need a class for test files and a rule for which exports are entry points, which is a design question rather than a measurement]`

## v3.110 · nine exemptions, and the eight bodies a test could call

**v3.109 left one item it could not check, and closing it took reading nine function bodies.** The table said
`SPAWN_ONLY`, and the reason each row carried was a paragraph. Four checks stood behind the table -- exported,
not taken by a test, taken by a script, reason at least 120 characters and not shared -- and all four ask whether
a route **exists**. None asks whether it is the **only** one. So this round resolved each row to the source of its
function and asked the body whether it can run inside the test process at all.

**The marker, and the eight answers.** The body of an `export function` declaration, with braces matched in the
comment-and-string-blanked form of the file so a `}` inside a literal cannot end it early, searched for
`process.argv`, `process.env`, one of the three standard streams, `process.exit`, `process.exitCode`, or a direct
`spawn`/`exec`. Eight of the nine bodies have none of them:

| symbol | what the body actually takes | boundary |
| --- | --- | --- |
| `budget-readings.mjs#budgetInForce` | a source string and a title; answers one of four arms | none |
| `format-spec.mjs#modalitiesProse` | a list of modality codes; answers a joined string | none |
| `gate-receipt.mjs#rehearsal` | a shape name and a plan; answers one of six shapes | none |
| `gate-steps.mjs#workflowPath` | `process.env['RCA_CI_WORKFLOW']` | **environment** |
| `publish-plan.mjs#readBlob` | `{ root, sha }`, then `runGit(root, ['cat-file', …])` | a helper call |
| `publish-plan.mjs#readRev` | `{ root, rev }`, then `runGit(root, ['rev-parse', …])` | a helper call |
| `publish-plan.mjs#pointerPlan` | `{ tree }`; answers `{ commits: [], tipTree }` | none |
| `publish-readings.mjs#parseArgs` | an argv array; answers options or a refusal | none |
| `publish-readings.mjs#inspect` | a path; reads it and judges what it parsed | file read |

**Two of them were excused by the strongest-sounding sentence in the table.** `readBlob`'s reason said the
end-to-end push "is the only place its output is judged", and `readRev`'s said a revision "is resolved against a
real checkout, and both callers are driven over one". Both statements are true, and both are about
`publish.mjs` -- the caller, not the symbol. A row keyed by a **symbol** and argued about a **gate** cannot be
falsified by anything the gate does, which is what a prose key buys: the sentence points at a route, the row
points at a name, and nothing compares the two.

**What the eight bodies were hiding, one decision each.** Which of four budgets is in force and in what order,
including the suffix match on a report's title and the fact that the fallback is the **largest** number rather
than the first (`budgetInForce`). Whether an expansion keeps the order the list gives or the order the vocabulary
declares -- `T, M` and `M, T` differ on every page that lists two modalities (`modalitiesProse`). What a
rehearsal ends on when the tree moved, when the working directory is dirty, and when both a step failed and the
tree moved (`rehearsal`, whose `moved` and `dirty-end` shapes differ in one field, and whose `failed` arm has to
carry the moved tree or `FAILED` cannot outrank `VOID`). Whether an empty `RCA_CI_WORKFLOW` means the shipped
workflow or the repository root -- the branch is `||`, not `??` (`workflowPath`). Whether a blob is bytes or a
decoded string, and which layer refuses a name that is not a SHA (`readBlob`). Which layer refuses a revision git
cannot resolve: git's own sentence, not a shape `TypeError` (`readRev`). Whether a pointer plan carries a commit
(`pointerPlan`). Which of six argv shapes is accepted, including the `index += 1` that makes `--file x --check`
read the flag rather than the value (`parseArgs`). And whether a file that parses into the wrong shape is a read
failure or a shape failure -- two sentences the CLI prints differently (`inspect`).

**Thirty-seven tests, in the six files that already import the module.** No new file: `timeout-budget.test.ts`,
`gen-examples.test.ts`, `gate-receipt.test.ts`, `gate-steps.test.ts`, `publish-plan.test.ts` and
`publish-readings.test.ts` each already took other names from the same module, and each gained the arm it was
missing. The reading that mattered most was the one the table had called impossible: `readBlob` returns a
`Buffer`, and a decoded string is the shape a `utf8` default would produce -- asserted as `Buffer.isBuffer` beside
the bytes rather than instead of them.

**The table is empty, and the emptiness is a record.** `SPAWN_ONLY` holds no rows; the nine names live in
`FORMERLY_EXCUSED`, and a test asserts every one of them is taken by a test now. A symbol that leaves the table
without a test fails that record rather than disappearing, so zero is a change with a date rather than an absence.
The four checks stay, because a future row must pass them, and one fifth was added:

> **the body must cross the process boundary** -- `process.argv`, `process.env`, a standard stream,
> `process.exit`, or a direct `spawn`/`exec` -- or a test can call it and the row is an excuse.

`console` is deliberately not a marker: vitest can spy on it, so printing is the one thing a test can capture. The
body is blanked before it is searched, because the comments in this tree quote `process.env` constantly.

**The rule is calibrated while it has no rows to check.** Six synthetic rows, one per fault (callable body, stale,
unconsumed, placeholder reason, a name the module does not define, and two rows sharing a reason), each asserted
by its own sentence. And three calibrations of the predicate itself: `workflowPath`'s real body crosses;
`readBlob`'s real body does **not**, which is the exemption that stood here judged by the rule that replaced it;
a printer does not cross; and a comment that says `process.env` does not count as a read.

**Two findings fell out of the repair, and neither was the subject.**

The first is `STATED_BY`: the table that turns an arm into the sentence a report prints has three keys, and
`budgetInForce` answers four ways. The fourth (`none`) is safe only because `check-test-budgets.mjs` answers it
before indexing, in a branch of its own that ends in `continue`. That pairing had never been written down, so the
test now asserts both halves -- the three keys, and the gate branch that makes the fourth one safe -- and it reads
the gate's source to do it, because a reader of the rule alone cannot see the consumer.

The second is the heavy-fixture detector. `heavy-fixtures-do-not-contend.test.ts` looked for `'install'` anywhere
in a file that also spawned something, so a rehearsal plan whose first step is **labelled** `install` -- a label
never passed to a child -- made `gate-receipt.test.ts` look like a file that runs a package manager. An assertion
about the suite's memory ceiling went red naming a file that runs none, and the repair is the distinction the file
already states twice in its own comments: a guard whose subject is a substring of the file cannot tell a call
site from a label. The verb is now searched inside a spawn's **argument list**, sliced by matching the
parenthesis in the blanked source, with four calibrations holding it: a label is not a command, a call in a
comment is not a call, a real argument list is, and the one heavy file in the tree still is.

**Four falsifications, five reds.** `pointerPlan` put back into the empty table: **1** red, carrying both the stale
fault and the body fault, which is the shape the nine rows had. The predicate with `process.env` removed: **2**
reds -- the row calibration and the body calibration. The heavy detector returned to the whole-file reading: **2**
reds -- its own calibration and the set assertion naming `gate-receipt.test.ts`.

**What this does not establish.** `crossesProcessBoundary` is a proxy, not a proof that a function cannot be
called. A body that reads `process.env` can be called from a test that sets the variable, and `workflowPath` is
now tested exactly that way -- three arms, with the environment restored in a `finally`. What the predicate
answers is narrower and checkable: *this function takes an input the test does not hold*. That is weaker than the
sentence the table used to write, and the honest consequence is that a symbol which genuinely cannot be called
from this process may not exist in this tree at all.

### Readings

> Ledger for `v3.110`.

| item | value |
| --- | --- |
| `core` test suite | **257 files, 6626 tests passed** (at v3.110) |
| `cli` test suite | **4 files, 187 tests passed** (at v3.110) |
| repo test suite | **261 files, 6813 tests passed** (at v3.110) |
| coverage | `core` **99.98 / 99.95 / 100 / 99.98**, `cli` **100 / 100 / 100 / 100** -- unchanged: nothing under `src/` moved |
| new tests | **6589 -> 6626, +37**: six for the four budget arms and the sentence table, three for the modality expansion and its refusal, seven for the six rehearsal shapes and the merged pair, three for the three workflow-path arms, six for the blob/revision/pointer readers, eleven for the argv and file readers, and one for the heavy detector's repair |
| the exports | **155** across **28** modules; test-taken **146 -> 155**; excused in writing **9 -> 0**; with no consumer **0** |
| `SPAWN_ONLY` | **9 -> 0** rows, the nine names kept as `FORMERLY_EXCUSED` and each asserted to be taken by a test |
| the new rule | a body must cross the process boundary, calibrated against two real bodies and four shapes |
| the falsifications | four edits, **5** reds |
| gate sites / scripts / throws | **144** / **67 of 98** / **99** -- no new exit, no new script |
| `verify-site-proofs` | **PASSED (229 claim(s) across 66 file(s))** |
| the live list | **26 -> 27**: the prose-exemption item closes, and the heavy detector's second copy of the language scanner opens |

### Left open

- **The heavy-fixture detector carries its own copy of the comment-and-string scanner.** It is four regular
  expressions where `scripts/budget-readings.mjs` has a state machine, so the two disagree about a template
  literal and about a regex literal -- and the copy is the one that decides which files are heavy.
  `[open: replacing it with the imported scanner would change what the detector sees for the files that hold an escaped
  character or a template with braces in an argument list, which is a measurement before it is a repair]`
- **`crossesProcessBoundary` answers "does this body take an input the test does not hold", not "can this function
  be called".** The gap is stated rather than closed, and `workflowPath` is the demonstration: it reads the
  environment and is still tested by setting it.
  `[open: a symbol that is genuinely uncallable would need a stronger predicate than a marker in the body -- an
  exit that ends the worker, or an input no test can construct -- and no such symbol is in this tree today]`

## v3.111 · the index was two thirds history, and the arm that read a record forty rounds old

**v3.110 left two things it could not fit, and they turned out to be one.** `docs/progress.md` was **133,309
bytes** and the volume still open was **199,228 of 200,000**, so the next round's record did not fit -- and
`MAX_BYTES` was not what bound first. The index is bounded by the volume that is **still open**, a relation
rather than a number (finding 202, finding 501), and a volume holding one round is born at about 9 KB. A new
volume could not be born at all, because it would have been smaller than the index it is compared with. So the
blocking item was not analysis but layout, and the layout had a cause that had been written down for seventeen
rounds:

> **The live list grows whatever the bound is.** A struck entry stays where it is struck, so `## Open` gains
> bytes every round...

Measured this round: `## Open` was **98,927 bytes**, of which **65,544** were **forty-eight struck entries**.

**The split, and the identity that makes it a split.** The forty-eight closures moved whole, in their own
words, to `docs/progress/closed.md` under `## Closed`; the live list kept the twenty-eight entries that are
open. The tiling was verified rather than asserted: every entry hashed before and after the move, **76 in, 76
out, 28 + 48**, no entry lost and none duplicated. The index fell to **66,673** bytes. Then a volume could be
born larger than it: twelve rounds (`v3.99`--`v3.110`, **108,534** bytes) moved to `volume-17.md`, leaving
`volume-16.md` at **90,693** with `v3.91`--`v3.98`. The index now reads **67,407** against an open volume of
**108,534** -- about thirty rounds of headroom, which is the first time this log has had any.

**What keeps it split: two refusals, one per side.** `check-open-list.mjs` gained a third spelling -- `## Closed`
-- rather than a new gate, because it is the same list at an earlier time, and the closure-citation rule, the
struck-reason rule and the placeholder rule apply to it unchanged. What is new is that each side refuses the
other's shape:

| the file | refuses | because |
| --- | --- | --- |
| `## Open` | a struck entry | history filed as work: a reader who greps for what is left finds it, and the index pays for it in bytes forever |
| `## Closed` | an unstruck entry | work filed as history: the only list anyone consults for work is the live one, so nobody does it and nobody sees it undone |

**Two defects fell out of the move, and neither was the subject.**

*The arm was reading a record that had been frozen for forty-one rounds.* Finding 465's rule is that a round's
record may not be the only place a residual lives, and its scope is "the newest record, because older ones
cannot be edited". The selection was `records.reduce(newest)` over records **in table form** -- and the rounds
stopped writing tables at `v3.70`. So "the newest record" was **v3.69**, and the arm spent forty-one rounds
comparing three rows from `v3.69` while every round since wrote a bullet record it could not read at all. It
stayed green because those three rows happened to quote entries the list still carried. It went red the moment
the closures moved: a wrong subject looks right for exactly as long as its lucky accident holds.

*The population had to become two files.* A record row may name a residual the round **closed** -- that is what
closing it meant -- and while closures were struck in place, the row resolved against the live list. Moving them
narrowed the population to what is still open, and the arm refused rows that had been right for forty rounds.
Both forms of record are collected now (a record written as a list of entries is a record, and its item is the
sentence the round wrote), the record judged is the one the **newest round** wrote, found by owner rather than
by shape, and the population is every entry the list holds in either file -- read by running the arm **after**
the walk, so the answer cannot depend on which document was read first.

**A rule written and then deleted.** The obvious cross-file check is "no entry is in both files", and it cannot
be reached: a copy left in the live list is struck by definition, so the live-strike refusal has already
refused it before any comparison runs. A rule whose only input is what the previous rule rejected is a rule
nobody has seen work. It is gone, and the gap it would have covered is in the live list instead.

**Six falsifications, nineteen reds.** Disabling the live-strike refusal: **1**. The record-strike refusal:
**1**. Collecting table-form records only, again: **1** -- the fixture the last forty rounds would have written.
Narrowing the population to the entries that are not struck: **1**. Removing `## Closed` from the guard's
vocabulary: **12**, because the record becomes invisible and every fixture that relies on it fails. Handing
every document the `--doc` fixture instead of only the first: **3**, because the sections get counted twice.
The last two are the calibration that the new spelling is load-bearing rather than decorative.

**The same scanner, twice, and the copy decided which files are heavy.** The second subject of the round, and
the entry v3.110 left: `heavy-fixtures-do-not-contend.test.ts` carried four regular expressions where
`scripts/budget-readings.mjs` has a state machine. Measured on the suite's own **248** files, with the quote
characters normalised on both sides: **219** blanked differently, every difference a template literal or a regex
literal, and the heavy set **identical** (`typecheck-entrypoint.test.ts:install`). That is how a duplicate
survives -- it is right about today's answer, so no assertion moves. The copy is gone, four fixtures hold what
it got wrong (a URL in a string eating the rest of its line, a template holding an apostrophe, a regex holding a
quote, and a template piece that is not a command), and the falsification is the copy put back: **4** red, one
of them the pre-existing set assertion, because the new fixture's own URL made the test file look heavy.

### Readings

> Ledger for `v3.111`.

| item | value |
| --- | --- |
| `core` test suite | **257 files, 6637 tests passed** (at v3.111) |
| `cli` test suite | **4 files, 187 tests passed** (at v3.111) |
| repo test suite | **261 files, 6824 tests passed** (at v3.111) |
| coverage | `core` **99.98 / 99.95 / 100 / 99.98**, `cli` **100 / 100 / 100 / 100** -- unchanged: nothing under `src/` moved |
| new tests | **6,626 -> 6,637, +11**: seven for the split (two refusals, the suffix refusal, the two-file population, the shipped record, the index's pointer to it, and the owner selection) and four for the scanner |
| the index | **133,309 -> 66,673** bytes; `## Open` **98,927 -> 32,177**; the record **0 -> 71,572** over 51 entries |
| the volumes | **16 -> 17**: `volume-16.md` **90,693** (8 rounds), `volume-17.md` **108,534** (12 rounds) before this one |
| the lists | `## Open` **28** open, `## Closed` **51** closed, both read by one guard over three spellings |
| the falsifications | ten edits, **26** reds; two of them in the subagent's half |
| gate sites / scripts / throws | **144** / **67 of 98** / **99** -- no new exit, no new script, one moved line |
| `verify-site-proofs` | **PASSED (229 claim(s) across 66 file(s))** |
| the live list | **28 -> 28**: three closed, three opened |
| LLM calls | **0** |

### Left open

- **The row arm's cross-file population has never run on the shipped tree.** A fixture is one file with both
  sections in it; no shipped record names a residual its own round closed.
  `[open: the first round whose record names a residual it closed will exercise the path, and nothing before then will]`
- **An entry has no identity, so keeping the two lists apart is a rule about text.** The tiling was a
  measurement, not a guard, and the copy rule that would have made it one could not be reached.
  `[open: an id per entry would make the tiling a rule rather than a measurement, which is what the audit log already does with finding numbers]`
- **The record is not split by size.** It is 69,785 bytes after two rounds of closures and nothing bounds it,
  because it is a record and records grow.
  `[open: the volume budget's argument -- a document a reader cannot diff -- applies to it at some size, and the number that size is has not been measured]`

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

### Readings

> Ledger for `v3.115`.

| item | value |
| --- | --- |
| `core` test suite | **257 files, 6672 tests passed** (as of this commit) |
| `cli` test suite | **4 files, 187 tests passed** (as of this commit) |
| repo test suite | **261 files, 6859 tests passed** (as of this commit) |
| coverage | `core` **99.98 / 99.95 / 100 / 99.98**, `cli` **100 / 100 / 100 / 100** -- unchanged: nothing under `src/` moved |
| new tests | **6,663 -> 6,672, +9**: four names and the `next` spelling, the orphan refusal, the escaped and the unescaped pipe, the item read by name, and the two halves of the population line |
| the lists | `## Open` **27 -> 28** (one closed, two opened), `## Closed` **54 -> 55**, one space of **83** ids with none missing |
| the records read | **25 of 47** table-form records before, **47 of 47** after; **188 of 318** rows before, **318 of 318** after |
| the population | **218** record sections: **193** under a round and **25** under none; **211** rounds, **18** of them wrote none -- **217**, **192** and **210** when the round started, and the 22 records it found are in the 193 |
| the index | **67,555 -> 68,687** bytes |
| the record | **80,444 -> 82,170** bytes over 55 entries, in **two** files (49,545 + 32,625) |
| the volumes | **17**, and this round is the fifth in `volume-17.md` (**165,220** bytes) |
| the falsifications | eight edits, **forty** reds |
| gate sites / scripts / throws | **144** / **67 of 98** / **99** -- no new exit and no new script |
| the budgets | **36** files state one -- unchanged: no test file was added |
| LLM calls | **0** |

### Left open

- **The structural rule reads a table's first column, so a record that reorders its columns is a record to a
  reader and not to the guard.** Counted as `O-082`.
  `[open: a header that names the four columns in any order is a record by the same argument, and the price is a scan of every table in the corpus rather than of the tables whose first cell is already known to be a priority]`
- **Eighteen rounds wrote no record, and nothing can say whether that was a choice.** Counted as `O-083`.
  `[open: a round that leaves nothing open could say so in its own body, in one sentence, and then an absence would be a choice; nothing in the corpus writes one, so the rule would have to be written against the newest round and applied backwards]`
