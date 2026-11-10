## v3.64 — three defects in the sentence that was written to be honest, and the corpus the stale readings were in

v3.63 ended with a rule: *the next thing to mechanise is the sentence the entry writes about itself
when a round closes it*. This round began there and found that the sentence it had just shipped --
`19 record(s) in table form (185 row(s)) whose rows were not judged` -- was the third defect in three
rounds of the same family: a number printed as evidence that is not the number it claims to be.

### 一、The rows nobody judged were counted as pipe lines

```js
const rows = section.lines.filter((line) => /^\s*\|/.test(line)).length;
```

A markdown table has two lines that are not rows -- the header and the rule -- so nineteen records of
**147** rows were reported as **185**. The 147 is derivable from the content (a record's first cell is
a bold priority) and the guard now arrives at it from the structure:

| reading | before | after |
| --- | --- | --- |
| rows reported for the nineteen records | **185** | **147** |
| what 185 is | 147 + 2 x 19 | the number of pipe lines |
| a record naming its columns and stopping | `OK`, `2 row(s)` | refused: `holds a header and no row` |

Worse than the arithmetic is what the number was also for. `rows === 0` was the test for `holds no
table`, and two pipe lines are never zero, so the refusal was **unreachable** for any table a person
would write -- a `=== 0` against a number that cannot be `1`, whose only case was the one it was
written for. And the test beside it asserted `3 row(s)` for a one-row table and passed: a test written
to match an output inherits the output's mistake.

### 二、The shape was said to be checked, and nothing about the shape was checked

The comment above the third spelling says *its rows are counted, its shape is checked*. The code
counted and checked nothing: not the header, not its names, not the rule, not one row's cells --
nineteen headers, 147 rows, zero checks, and zero is not the same as nothing to check.

The four names are the record's promise: priority, what the residual was, what became of it, the next
step. A record that renames `state` to `note` still parses, still counts, and moves the only column a
reader greps for out of reach -- finding 463's argument applied one level down, to a column instead of
a heading. So there are four arms now, and three of them are the ones an honest future record would
break by accident:

| arm | refused when |
| --- | --- |
| a rule under the header | the first row is indistinguishable from a second header |
| the four names | `names priority, item, note and next step, and not state` |
| cell count per row | `has 3 cell(s) under a header that names 4` |
| a non-empty `state` cell | the column exists and says nothing about the residual |

The last is the only judgement on a cell the guard says it does not judge, and locating a column is
not reading a value. Not one of the 147 is empty, so it is a floor stated as a floor.

### 三、The column is not a state, and the entry's premise was refuted by measuring it

The live list asked for a closed vocabulary for the `state` column. The measurement says there is
nothing to close:

| reading | value |
| --- | --- |
| rows | **147** |
| distinct values | **78** |
| most common | `unchanged`, **38** rows (26%) |
| median cell | **75** characters |
| longest | **251** |
| empty | **0** |

A column whose median cell is a sentence is a **reading**, written once per residual by the round that
paid for it -- `measured once: 78 pairs, 78 red`; `**248/387** then **189/440**, ratio 1.56 -> 2.33`.
No vocabulary accepts those and means anything, and requiring one would force nineteen frozen records
to be rewritten. So the entry is **closed as a measured decision**, the shape this log already uses
for a premise a measurement refutes: the rows are not judged because they are prose, and what a gate
can do about prose is make it locatable.

### Readings

> Ledger for `v3.64`.

| item | value |
| --- | --- |
| `core` test suite | **239 files, 6032 tests passed** (at v3.64) |
| `cli` test suite | **4 files, 187 tests passed** (at v3.64) |
| repo test suite | **243 files, 6219 tests passed** (at v3.64) |
| new tests | **8**: the row count read off the record (1 and 5 rows), a header-only record refused, a renamed column refused, a header with no rule refused, a short row refused, an empty `state` cell refused, and the shipped corpus held to 147 by an independent count |
| the count, corrected | **185 -> 147**; the `holds no table` refusal went from unreachable to reached |
| the shape, now checked | nineteen headers, 147 rows, four arms, 0 violations in the shipped corpus |
| mutation | **21** substitutions; **21 of 21 red, 0 survivors, 0 inert**, tree restored. Six new, one per arm: `tableShape` returning pipe lines (147 -> 185), the zero-row arm deleted, the cell-count arm deleted, the empty-`state` arm deleted, the four-name arm deleted, and the rule under the header made optional |
| the open list | **11** open, **15** closed; one struck this round, closed as a measured decision by finding 466 |
| the receipt | `verify:local` **OK** -- 34 command(s) covering 47 of 57 run steps, tree `188ca577c`; the ten that did not run need a runner, sudo or the run token, and each says which |
| the history | `golden-master/publish-readings.json`: **21 attempts**, 362 requests. Attempt 21 carried this round's two commits: 23 requests, none retried, none unanswered, slowest `POST /git/blobs` 2 360 ms. The remote tip is `47f2f7612`, whose tree is `188ca577c` -- the receipt's tree, and the local `HEAD^{tree}` |
| CI on that tree | `CI` **8/8** jobs and `Anchor round trip` **1/1**, both success (runs 468 and 394) |

### Left open, in the order the goal is reached

| priority | item | state | next step |
| --- | --- | --- | --- |
| **P1** | the remote's history shares no name with the local one above a boundary 272 commits old | unchanged | nothing converges it without rewriting the remote, which this channel refuses by design |
| **P2** | the currency line proves a round counted, not that it read | **sharpened again**: v3.63's own sentence was the first thing it could not see | the round that closes an entry writes what closed it, in the headline, where the guard reads |
| **P2** | the base search is linear in the number of twin tips | unchanged | take the first N tips by name or by time and print how many were looked at |
| **P2** | the split is expensive by 240 s of every run | unchanged since it was measured | a per-file recording made on a runner, published where a plan can read it, and a staleness rule |
| **P2** | a table-form record's rows are prose | **closed as a measured decision** (finding 466): 78 values over 147 rows, a 75-character median | nothing; a vocabulary would mean rewriting nineteen frozen records |
| **P2** | P13: a mutation is one substitution | unchanged | a pair composing two changes neither of which is in the battery |
| **P3** | a bounded ref count is a floor, not a count | unchanged | a repository with more than a thousand refs |

**The lesson, for the round after this one.** The last three rounds each found the same defect one
level deeper, and each time in the sentence the previous round had written to be safe: a stamp that
counted what the guard said, a guard that read the headline and not the reason, a sentence that said
"these rows were not judged" and named a number that was not the number of rows. The pattern is not
carelessness. It is that **a sentence about a number is checked by the number's own source**, so the
only sentences that can fail are the ones whose subject is somewhere else -- the record, the reader,
the pipe line that is not a row. What found all three was reading the sentence against its subject
rather than against the code that printed it.

So the next thing to mechanise is still not a count. It is the habit of asking, of every number a
round prints, **what would have to be true for this number to be wrong**, and then looking there.

## v3.65 — the only P1 that was not in the list, and two rulers that had never been laid against each other

v3.64 ended with an instruction rather than a count: *of every number a round prints, ask what would
have to be true for this number to be wrong, and then look there*. This round pointed that at the one
number it had printed without looking -- `Checked at v3.64: **11** entries open` -- and the number was
right about its own section and wrong about the log.

### 一、The only P1 in this document lived in a record, and the list never held it

The guard printed two counts in one line and had never compared them: **11** entries open, and **7
row(s)** in the newest round's record. They are not supposed to be the same set -- a record carries what
a round left undone, the list carries what is undone -- but they were not disjoint either, and nothing
said which rows had an entry behind them and which did not.

Measured by reading the seven rows of v3.64's record against the twenty-six entries of the list:

| row | what it was |
| --- | --- |
| `the remote's history shares no name with the local one above` | **no entry anywhere** -- the only **P1** in this log, carried for six rounds |
| `the currency line proves a round counted, not that it read` | **no entry anywhere** |
| `the base search is linear in the number of twin tips` | **no entry anywhere** |
| `a bounded ref count is a floor, not a count` | **no entry anywhere** |
| `the split is expensive by 240 s of every run` | the entry *"The sensitivity shards are cut by file count, not by cost"*, in other words |
| `a table-form record's rows are prose` | the entry *"A record written as a table is counted, not judged"*, in other words |
| `P13: a mutation is one substitution` | the entry, quoted |

So four residuals -- including the largest one outstanding -- were reachable only by a reader who read
the round that raised them, and the list that exists so a reader does not have to do that did not carry
them. **The stamp could not say so, and this is the part worth keeping**: its number is arithmetic over
the entries below it, computed by the guard that also counts them. A residual that is not an entry is
not a residual as far as the stamp is concerned, so the sentence "eleven open" was true, exact, and
about the wrong population -- finding 465's defect (a number that agrees with the rule it defends) one
document further out.

**Fixed** by adding the four as entries -- the list grows from 11 to 15, which is what a list that has
been under-reporting should do -- and by an arm that refuses the shape: the newest round's record may
not name a residual the live list does not hold.

### 二、A row is a paraphrase, and a paraphrase is a sentence with no second reader

The four rows above are why the arm exists; the two in italics are why it is a **quotation** rule rather
than a "does this resemble an entry" rule. Both describe entries that exist, in words that appear in
exactly one place in this corpus: the record. A reader who greps a row's text finds the row; a reader who
greps the entry finds the entry; neither finds the other, and the two are the same residual.

That is finding 463's argument -- *a title is an exact string, and a document that re-spells it has no
reader* -- applied to a cell instead of a heading. So a row's `item` must be the entry's own words:
after emphasis, quotes and whitespace are normalised away, at least twenty characters of the row have to
appear inside an entry. One of the seven rows satisfies that today.

The scope is the **newest record only**, for a reason the corpus states itself: a record is frozen, and
nothing appends to it. A rule that judged the older twenty would be a rule demanding a repair the corpus
forbids, so the arm reads the one record that can still be edited -- the same scope, and the same
argument, as the currency stamp's comparison with the newest round.

### 三、The rule this round added for a third defect was already there, and the corpus is what said so

The round also went looking for a fourth defect, on a reading that looked airtight: the guard requires
a closure to name what closed it, the requirement is a **pattern** -- `Closed|Narrowed|Retracted` within
one sentence of `finding <n>` -- and a pattern answers *does this say what closed it*, never *what does
it say*. A number is the one thing in that sentence a typo moves without disturbing the prose.

So an arm was written: read the audit's headings, extract the number, refuse a citation that names
nothing. It passed its own tests and the shipped corpus, and the round moved on to the write-up -- which
is where it died. The sentence written to illustrate the defect cited a number that does not exist, and
**`check-citations.mjs` refused the round's own paragraph**:

```
  docs/progress/volume-12.md:1852: cites finding <n>, which has no heading
check-citations: FAILED -- 1 citation(s) of 1 number(s)
```

That gate has resolved every `finding N` in this documentation since finding 205 -- both documents,
their indices, and every volume of each -- and it refuses a dangling one. The entry's premise was false,
the arm was a second ruler for a property that already had one, and the only reason the round found out
is that it wrote a wrong number into the prose it was using to describe wrong numbers.

The arm is **deleted in the same round**, with its three tests and its three mutations; what survives is
the reading it took on the way:

| reading | value |
| --- | --- |
| closure citations in the shipped open list | **39** |
| of those, naming a finding the audit holds | **39** |
| the guard that already held that | `check-citations.mjs`, since finding 205 |
| what it cannot do, in its own words | a citation of the *right* number for the *wrong* claim -- both numbers exist and the sentence is prose |

Two lessons, and the second is the one worth carrying. A rule is not missing because the sentence
describing its absence is convincing: **the audit is a corpus, and a claim about it can be refuted by
reading it**. And a new guard has to be justified against the guards that exist, which is a search this
round performed only by accident -- by breaking its own prose.

### 四、The twenty kilobytes of headroom ran out, and the instruction was to split the index

The four entries and the paragraph above are what pushed `docs/progress.md` from 90,886 to 93,828 bytes,
and `check-progress-volumes.mjs` has printed the relation since v2.35: `index N of smallest volume M`.
Eighty-nine rounds ago it printed `index 72,217 of smallest volume 92,309`, and the round wrote down what
the number was for -- *twenty kilobytes of headroom, about six rounds, and then the split becomes an
instruction instead of an opinion*. It survived far longer than six rounds because most rounds append to
a volume rather than to the index. This is the round that spent it.

| section of the index | bytes | what it is |
| --- | --- | --- |
| `## Open` | 40,456 | the live list and the rounds' commentary about it |
| `## Audit passes` | **20,447** | a table of passes, why each was chosen, and its injection matrix |
| `## L4 anchor status` | 8,970 | status |
| `## Coverage` | 7,479 | how coverage is measured |
| everything else | 16,476 | headline, round trip, repository, test strategy, the volume index |

`## Audit passes` is the only section there that is a **record** with no lookup in it, and the only one
whose subject belongs to another document -- the audit's own index opens with `## Scope`, a list of
passes. It could not be deleted: v2.35 measured that of **79** prose sentences longer than 60 characters
in it, **zero** appear in `docs/audit/`, so it is the only copy of why each pass was chosen. So it moved,
to `docs/audit/passes.md`, with the heading promoted one level because it is a document's title now.
Nothing in it was rewritten.

| reading | before | after |
| --- | --- | --- |
| the index | **93,828** bytes | **74,295** |
| the smallest volume it indexes | 92,355 | 92,355 |
| headroom | **-1,473** | **+18,060** |
| the passes | a section of the index | `docs/audit/passes.md`, 21,288 bytes, reachable from both indexes |

### Readings

> Ledger for `v3.65`.

| item | value |
| --- | --- |
| `core` test suite | **239 files, 6036 tests passed** (at v3.65) |
| `cli` test suite | **4 files, 187 tests passed** (at v3.65) |
| repo test suite | **243 files, 6223 tests passed** (at v3.65) |
| new tests | **4**: a row that quotes an entry accepted, a row that names nothing refused, a row too short to name anything refused, and an older record left alone because a frozen record cannot be repaired |
| the list | **11 -> 15** open, and the four added are the four that lived only in records |
| the record arm | v3.64's seven rows: **1** quotation, **2** paraphrases of real entries, **4** residuals with no entry at all |
| the arm that was deleted | **39** closure citations in the open list, **39** resolving -- by `check-citations.mjs`, which had done it since finding 205; the round's own arm and three tests removed |
| the index | **93,828 -> 74,295** bytes, against a smallest volume of 92,355: the relation v2.35 bought headroom with fired, and `## Audit passes` moved to `docs/audit/passes.md` (finding 470) |
| mutation | **24** substitutions; **24 of 24 red, 0 survivors, 0 inert**, tree restored. Three new: the record collector, the twenty-character floor, and the case fold. Three written for the citation arm left with it |
| the receipt | `verify:local` **OK** -- 34 command(s) covering 47 of the 57 run steps, tree `22f3141ac`; the ten that did not run need a runner, sudo or the run token, and each says which. The reading is of that tree, which is the content commit's; this table was written after it, so the tree it ships in has a second receipt and this row does not name it |
| the history | `golden-master/publish-readings.json`: **23 attempts**, 392 requests. Attempt 23 carried this round's two commits -- 20 requests, none retried, none unanswered, slowest `PATCH /git/refs/heads/master` 2 275 ms. The remote tip is `5177c8e38`, whose tree is `22f3141ac`: the receipt's tree. The ledger row was appended after the ref moved and is carried by the next push, which is the lag the file records about itself |
| CI on that tree | `CI` **8/8** jobs and `Anchor round trip` **1/1**, both success (runs 42434336635 and 42434336604) |

### Left open, in the order the goal is reached

| priority | item | state | next step |
| --- | --- | --- | --- |
| **P1** | the remote's history and the local one share no name above a boundary 272 commits old | **listed at last**: six rounds in records, one round in the list | nothing converges it without rewriting the remote, which this channel refuses by design |
| **P2** | the currency line proves a round counted the list, not that it read it | unchanged, and sharpened: the count was right about a population that was not the whole | the round that closes an entry writes what closed it in the headline, where the guard reads |
| **P2** | the base search reads one remote tip per branch this checkout does not have | **listed at last** | bounded by a reading of how many twin tips a real push meets; five refs here is not that reading |
| **P2** | the sensitivity shards are cut by file count, not by cost | unchanged since it was measured, and its row now has to quote it | a per-file recording made on a runner, published where a plan can read it, and a staleness rule |
| **P2** | P13: a mutation is one substitution | unchanged | a pair composing two changes neither of which is in the battery |
| **P3** | a bounded ref count is a floor, not a count | **listed at last**: five refs, and the walk has never stopped | a repository with more than a thousand refs |

**The lesson.** The three defects this round found were one defect read at three distances: a count over
a population that was not the one a reader cares about (**11** entries, and the only P1 outside them), a
cell that restates an entry in words no `grep` shares, and a citation that names a number nothing holds.
None of them is a lie. Each is a sentence that is true about its own source and silent about the thing a
reader uses it for. What found all three was the same move: take the sentence a reader acts on, and
**ask what its subject is** -- not what produced it. That is the move v3.64 asked for, one level out, and
the reason it keeps paying is that every document here is written to be checked against its own source.

## v3.66 — a number with a reader said 105, a set both baselines solve, and a hyphen that hid sixteen leaks

v3.65 ended with an instruction: *take the sentence a reader acts on, and ask what its subject is*. This
round pointed that at the sentences that **have** readers -- the ones an outside party quotes -- and at
two claims the gates made about their own coverage. All four defects are one defect at four distances: a
sentence that is true about its own source and silent about what a reader does with it.

The round began as a review of an external evaluation proposal. The proposal's coordinate system was
right -- this repository proves *export conformance* and has never proved *task effectiveness* -- and
its fact layer was wrong five times, twice by quoting our own documents. That is why the first repair is
about documents rather than gates.

### 一、The count that had a reader

`docs/acceptance.md` said `Measured at 105 of 105 in both halves`. The inventory held **204 proved
claims across 58 files** and **127 failure sites**, and had done for twenty-four rounds. Nothing read
the sentence; an **external review** did, and quoted the 105 as the current figure.

`check-doc-counts` exists for exactly this class and could not see it. Its four rules read table rows
carrying `N files, M tests` -- the suite's size -- and `docs/acceptance.md` is not in the progress
corpus at all. So the sentence was not skipped by a rule; it was never in front of a reader.

The rule added here reads three shapes (`N of N claim(s)`, `N claim(s) across M file(s)`, `N failure
site(s)`) from the documents that speak in the present, and compares them with
`golden-master/gate-sites.json` through the same `claimedSites` the two proof gates run. No second copy
of the numbers exists: the inventory is derived from the tree, and the counts are computed at the moment
they are compared.

The distinction it had to make first is the one the corpus already had a vocabulary for. The volumes
carry these numbers a dozen times and every one of them was true when written, so the subject is the
documents that speak in the present, and a line that dates itself (`at v3.41`) is a record. **The
missing thing was never the vocabulary; it was the decision that a specification is also a document that
goes stale** (finding 471).

### 二、A table that named the ids and described other mutations

The L3 matrix had been read back by `test/mutation.test.ts` for its **ids** only, under a comment
explaining that prose could not be validated mechanically. Measured, **thirteen of the eighteen rows
described a mutation other than the one their id runs** -- `MT-02` said "signal ≠ payload.kind" against
a code row that declares a bogus unit; `MT-05` said "unit mismatch on metric" against the answer-key
isolation mutation. The "Caught by" column had drifted with them.

The comment was true of a table written by hand and false of the table that existed, because that table
had a **field** behind it: every mutation carries a `description`, and every gate mutation an `expected`
list. The column was a hand-copied projection, which is the one kind of prose that can be checked and
therefore the kind whose drift is nobody's job to notice. Both columns are projections now, and both are
compared (finding 472).

### 三、Thirty of thirty, printed as evidence of health

G4 asks three questions and none of them is *is this set separable at all*. The corpus's success line
had been answering it for as long as the corpus has had telemetry:

```
check-fault-cases: OK (... 30 of 30 also carry telemetry ... which both the peak-z and the
  median-shift baselines place in their top-K ...)
```

Thirty of thirty, for both baselines. That sentence is the corpus's strongest evidence -- every case is
locatable, which is what makes it scoreable -- and its strongest objection, because a set both baselines
solve completely cannot separate methods. It was read as the first and never as the second.

`checkSaturation` reads the `BaselineOutcome[]` G4 already receives: per method, the share of the
**asked** cases located within top-K; the strongest method decides, not the mean; nothing is judged
below ten cases. And the set declares what it is for, because the rule would otherwise be red on every
run of a corpus doing its job:

```
check-fault-cases: set saturation: the strongest baseline ('median-shift-by-service') locates
  30 of 30 case(s) within top-3 (rate 1.000); purpose 'conformance', so this is a reading and
  not a verdict
```

Flip the one word in `index.json` to `benchmark` and the same run refuses, with the same numbers in the
sentence. That pair is a test, not a demonstration: the corpus is copied, the declaration changed, and
the refusal asserted. It is the only form of "the rule can be violated" that survives the round that
writes it (finding 473).

### 四、Three of thirty was a hyphen

The same review reported **3 of 30** task texts naming their own root-cause component. That number came
from `query.includes(component)` and was wrong in the safe direction:

| comparison | reading |
| --- | --- |
| substring, as reported | **3 of 30** |
| case + separator folded, word boundaries | **19 of 30** |

The sixteen-case gap is one character. The corpus writes `billing-service` in the field and `The billing
service began throwing` in the prompt, `media-transcoder` against `The media-transcoder container`. A
hyphen is not a boundary to a substring test and not a difference to a reader.

Nineteen task texts were rewritten -- the symptom, the window and the distractor stay; only the name
goes -- and the reading is **0 of 30**. The arm is `LEAK_IN_QUERY`, and it makes the case's
`answerKeyIsolated: true` an earned claim rather than an asserted one: all nineteen cases declared
themselves isolated while their prompts opened with their own answer (finding 474).

### 五、The ledger for the round had no coverage row

The four repairs above added two gate arms, one `purpose` vocabulary and a rule with four shapes. The
round's own ledger listed its tests, its mutations and its claims -- and carried **no coverage row at
all**. That is the same defect as 一、 one level up: a reading nobody publishes is a reading nobody
measures, and the thing it would have measured was this round's own code.

The omission is not this round's invention. Of the **54** `### Readings` blocks in this log, **24**
carry a coverage row and **30** do not, v3.64's and v3.65's among them -- so the row has been absent
from the place a reader looks for a round's cost for thirty rounds, and the two most recent are the
two that wrote the most code without it.

Measured after the four repairs and before the receipt:

| dimension | v3.65 | v3.66 as first written | after this section |
| --- | --- | --- | --- |
| statements | 99.96 | **99.95** | **99.97** |
| branches | 99.75 | **99.65** | **99.80** |
| functions | 100 | 100 | 100 |
| lines | 99.96 | **99.95** | **99.97** |

Nothing was red: the gate is per-file at 95 / 95 / 100 / 95, and the lowest file was 96.2. Six branch
sites in the new arms had no test, and two were branches no input could reach:

| site | why it was uncovered | repair |
| --- | --- | --- |
| `describeSaturation`'s benchmark-and-saturated sentence | the refusal asserted the violation's message; the log line that prints the same number was never read | assert the sentence in the refusal test |
| the reduce's *beats the best so far* arm | every fixture had one method or had the strongest first | a fixture whose stronger method sorts later, asserted order-independent |
| the reduce's *keep what it has* arm | the shipped corpus' stronger baseline sorts **first**, so it took the other arm | a fixture whose stronger method sorts first |
| `promptNamePattern('')` | only reachable through the public export, because the arm's floor refuses an empty name | call it: empty and punctuation-only names build no pattern |
| a case with no `query` | `query` is optional in the IR and no fixture omitted it | delete the field and assert the case is judged with no leak |
| `rootCauseComponent ?? ''` | **dead**: the IR requires the field, so the fallback answered a shape the schema refuses | delete the fallback rather than test it |

Two more branches were deleted on the same reasoning in `fault/corpus-census.ts`: `vocabularyOrder`
carried a `-1` fallback for a category that cannot arrive (every category comes from the vocabulary),
and the census renderings for a duplicate id and for empty totals were covered by their own tests
instead of being left as the file's only dark spots.

One **bug** came out of the restructure. `topK` was read as
`outcomes.filter((o) => byCase.has(o.caseId))`, and `byCase` is built *from* `outcomes`, so the
predicate was always true: a single outcome naming a case the set does not contain would enter the
minimum and narrow the whole set's reported top-K. The denominator already excluded it -- the rate
was right and the top-K beside it was wrong (finding 476).

The receipt is six tests and two deletions, and the ledger has the row it should have had first. Both
files it touched -- `gates/gates.ts` and `fault/corpus-census.ts` -- now read **100 in all four
dimensions**: `corpus-census.ts` was the package's lowest at 96.2 before this section, and `gates.ts`
stood at 99.4.

### Readings

> Ledger for `v3.66`.

| item | value |
| --- | --- |
| `core` test suite | **239 files, 6067 tests passed** (at v3.66) |
| `cli` test suite | **4 files, 187 tests passed** (at v3.66) |
| repo test suite | **243 files, 6254 tests passed** (at v3.66) |
| coverage | `core` **99.97 / 99.80 / 100 / 99.97**, `cli` **100 / 100 / 100 / 100** (statements / branches / functions / lines) -- the round's two arms first cost six branches and the receipt bought them back; `gates/gates.ts` and `fault/corpus-census.ts` are 100 in all four |
| new tests | **31** (6,036 -> 6,067): 16 in `gates.test.ts` (12 for the two arms -- 8 saturation, 4 leakage -- and 4 that close the branches the receipt found dark), 5 through `check-fault-cases`, 4 for rule 5 and its dated exemption, 4 in `mutation.test.ts` (the matrix's two column assertions, and MT-19/MT-20), and 2 for the census renderings |
| new mutations | **20** in `mutation.test.ts` (MT-19 the prompt leak, MT-20 the saturated benchmark set) and **14** in the `doc-counts-shapes` battery (a rule that accepts every gate-site count, and one that judges a dated sentence) |
| the count that had a reader | **105 -> 204** claim(s) across **58** file(s), **127** failure site(s), computed from `gate-sites.json` on every `docs:check` |
| the matrix | **13 of 18** rows named a different mutation than their id ran; both columns are projections now |
| the leak | **19 -> 0** of 30 task texts, measured after folding case and `-`/`_`/`.`/`/` |
| the set | **30 of 30** at rate 1.000, declared `conformance`; the same corpus declared `benchmark` is refused |
| the list | **15 -> 22** open: six the review left and one the coverage receipt left |
| the receipt | `verify:local` **OK**, and the two CI workflows on the pushed tree |

### Left open, in the order the goal is reached

| priority | item | state | next step |
| --- | --- | --- | --- |
| **P1** | the seven target contracts carry three copies of one version and no equation | new this round: the vendors row is the fourth field, and it has been wrong for six months | a guard that reads a constant, a markdown cell and a generator's field as one claim |
| **P1** | the newest round's ledger is not required to carry a coverage row | new this round: **30 of 54** `### Readings` blocks have none, and this round's arms left six branches dark | a rule over the newest section only, the way the size budget is judged only on the last volume |
| **P1** | G5 has no near-duplicate and no window-overlap arm | new this round: measured, 0 of 435 pairs overlap and the maximum task-text Jaccard is 0.308 | two fixtures, because the shipped corpus offers no witness |
| **P2** | G3's two thresholds have no grid | new this round: the defaults are a judgement nothing has defended | a 4x4 grid and a rule that refuses a default on a slope |
| **P2** | `rulegen` has no refusal count and no agreement reading | new this round: the thirty human annotations already exist and nothing compares against them | agreement with a fixed answer set, and the absence of kappa stated as a choice |
| **P2** | `score` divides by a different denominator per target | new this round: the sentence needs a measurement under it | a test asserting two targets' check counts differ |
| **P2** | `docs/acceptance.md` is 96 KB and grows by clause per round | new this round: L3 and L4 are 284 and 405 lines, the other four layers 14, 7, 7 and 6 | move the per-round clauses to a volume, after measuring how many sections match that shape |

**The lesson.** The four defects are one defect at four distances, and the distances are what changed:
a number no gate read (**105** against **203**), a table that read as prose because it had a field
behind it (**13 of 18**), a reading printed as evidence of health (**30 of 30**), and a measurement
that was wrong in the safe direction (**3 of 30** for **19 of 30**). Every one was found by asking a
sentence what a *reader* would do with it -- not what its source says. The review that started the
round found the first one by quoting it, which is the cost of a document nobody re-reads: it does not
decay, it gets cited.

## v3.67 — seven tables that restated a specification, and the gate that checked the site instead

The previous round ended with a list of four defects and a note that the next one was P1: seven
contract pages carried three copies of one version and no equation. Reading that entry closely, the
version was the least of it.

### 一、Six rows, seven pages, and nothing compared a row with the field it restated

Each page under `docs/targets/` opens with a table: vendor, venue, contract version, emitter, CLI
target id, modalities, timezone. Every row is a projection of `scripts/format-spec.mjs`. Measured
against the tree this round inherited, **41 rows across seven pages, and not one comparison**:

| row | what the page said | what the specification said |
| --- | --- | --- |
| `Vendor / venue` | `Microsoft, ICLR'25` on five pages; `Reference` on the other two | `vendor` and `venue`, two fields |
| `Contract version` | `` `pave-v1` (`OPENRCA2_CONTRACT_VERSION`) `` | a field **and** the exported constant |
| `Modalities` | `metrics, logs, traces (+ causal path)` | `['M','L','T']` |
| `Timezone` | `**UTC+8** (`OPENRCA_OFFSET_MINUTES = 480`)`, on five of seven pages | a sentence, on all seven |

Three different failures came out of the one missing equation.

**One value was false.** `openrca-2.0`'s vendor read `Microsoft`, which is 1.0's -- the line above it
in the same table -- and the PAVE paper's author block says `Affiliation: The Chinese University of
Hong Kong, Shenzhen`. Written 2026-09-10, corrected 2026-11-08. The same string sat in
`format-spec.mjs`, which the site renders as a badge: one unchecked sentence, published twice.

**Two rows were renamed to fit their values.** `cloud-opsbench` and `itbench` said `Reference` where
the others said `Vendor / venue`, because cloud-opsbench's `vendor` field held an arXiv id. That is a
citation standing where a publisher goes -- the question answered with the address of the question --
and the row was renamed rather than the field emptied, which is cheaper and leaves two pages whose row
means something different from the row in the same position on the other five.

**Thirteen cells were missing or said it differently.** Two pages had no `Timezone` row although the
specification has a sentence for all seven; rcaeval had no `Modalities` row. Of the five timezone cells
that existed, three differed from the specification's own sentence. The prose was not wrong. It was
unwitnessed, which is how `metrics, logs, traces` and `['M','L','T']` mean the same thing on Tuesday
and not on Wednesday.

The table is generated now, between `<!-- target: id -->` and `<!-- /target -->`, from the
specification and from the constant the exporters stamp. Four changes made it renderable:
`contractVersion` **left** `format-spec.mjs` (the constant is the only writer, and the generator reads
it out of the built package by the name `contractConstant` holds); `vendor`/`venue`/`reference` are
three fields, `null` printing as `*not established*`; `MODALITY_LABELS` turns the codes into the prose
the page prints, so one array is rendered twice; and the two rows no other page has (rcaeval's score
targets, itbench's persona) are declared instead of typed. The seven pages went from 41 rows to 54 --
thirteen of them rows the specification had and the page had dropped, or folded into a neighbour.

The vendor is the one claim here no gate can derive, so it is quoted: `golden-master/openrca2-evaluator.json`
gains `upstream.affiliation` with the paper's own line, the URL it was read from and the date, and a
test asserts the published vendor is a substring of it. An edit to either side is refused.

### 二、The generator wrote the documents; the gate checked the site

`gen-examples.mjs` owns three artefacts and, under `--check`, compared exactly one: `site/assets/data.js`.
`syncDocExamples` and `syncDocFields` ran only in write mode, so a hand-edited field table or a stale
example block passed `examples:check` -- the step CI runs in the docs job, named after the generator,
proving the site and saying nothing about the documents.

This was not unknown. It had been pinned as a test since 2026-09-27, asserting **green** on a document it
had just made wrong, under a comment calling it `audit.md`'s P2-4. A test that states a defect is worth
more than a comment about one; a test that stops stating it is how the defect gets closed, and this
round inverted that assertion rather than deleting it.

The repair is one code path for both modes: `planDocRewrites` computes all three rewrites in memory and
returns what would change, so `--check` is the *same* computation as the write instead of a second
opinion about it. It refuses on a non-empty plan and names the files. The first version of this
repair generated the metadata table and left the other two blocks alone -- half the artefacts checked
and the other half written, with no sentence saying which is which, which is finding 471 one level up.

`--check` still cannot see a **deleted** marker: a block that is not there is not compared. So the
enumeration is separate and explicit -- for every spec the page carries exactly one target block and one
field marker per documented file, thirty markers checked against the specification's own list.

### 三、The ledger owes the coverage row, and the rule is judged on the round being written

v3.66 found that 30 of the log's first 54 `### Readings` blocks carry no coverage row, and left the
rule in the list because a rule over history would have been red from the day it existed. This round
writes it: `readVolumes` refuses a newest round whose ledger carries no `| coverage |` row reporting
four numbers for `core` and four for `cli`. The asymmetry is asserted rather than described -- a test
builds a two-round volume where the older round has no row and the newest does, and requires silence --
because 30 of 54 is exactly the population that argument is about.

### 四、What the gates cost to retarget

Six injections in `gate-tests-battery.py` anchored on lines this round moved. All six were retargeted,
none deleted, and three were added for the guarantees that did not exist before (a `--check` that would
have passed a stale page, a metadata table nobody rewrites, a version printed instead of refused).
**25 injections became 28, witnesses 28 became 33, and the throws the reading partitions went from 91
to 93** -- the two new ones are `modalitiesProse` refusing a code it has no word for, and
`contractVersionOf` refusing a constant the package does not export.

### Readings

> Ledger for `v3.67`.

| item | value |
| --- | --- |
| `core` test suite | **239 files, 6082 tests passed** (at v3.67) |
| `cli` test suite | **4 files, 187 tests passed** (at v3.67) |
| repo test suite | **243 files, 6269 tests passed** (at v3.67) |
| coverage | `core` **99.97 / 99.80 / 100 / 99.97**, `cli` **100 / 100 / 100 / 100** (statements / branches / functions / lines) -- unmoved from v3.66, because this round's code is in `scripts/`, which the coverage gate does not measure; what measures it is the injection battery |
| new tests | **15** (6,067 -> 6,082): 9 in `gen-examples.test.ts` (the two refusals that replaced the pinning test, six for the metadata table including its two refusals, one enumerating the thirty markers), 4 for the coverage-row rule, 2 for the affiliation equation |
| new mutations | **3** injections in `gate-tests-battery.py` (EXAMPLES 8, 9, 10) and **6 retargeted**, because planning a rewrite is one decision for all three marker kinds |
| the table | **41 -> 54** rows across seven pages, generated; **41** of the old ones restated a field and **0** were compared |
| the vendor | `Microsoft` -> `The Chinese University of Hong Kong, Shenzhen`, quoted from the paper's author block; the same string was on the site badge |
| the gap | `--check` compared **1 of 3** artefacts; it compares 3 now, and the test that pinned the gap asserts the refusal |
| the claims | **204 -> 207** claim(s) across **58** file(s), **128** failure site(s), from `gate-sites.json` |
| the list | **22 -> 20** open: this round closed the two it was written for, and added two it found |

### Left open, in the order the goal is reached

| priority | item | state | next step |
| --- | --- | --- | --- |
| **P1** | G5 has no near-duplicate and no window-overlap arm | unchanged: measured, 0 of 435 pairs overlap and the maximum task-text Jaccard is 0.308 | two fixtures, because the shipped corpus offers no witness |
| **P2** | G3's two thresholds have no grid | unchanged: the defaults are a judgement nothing has defended | a 4x4 grid and a rule that refuses a default on a slope |
| **P2** | `rulegen` has no refusal count and no agreement reading | unchanged: the thirty human annotations already exist and nothing compares against them | agreement with a fixed answer set, and the absence of kappa stated as a choice |
| **P2** | `score` divides by a different denominator per target | unchanged: the sentence needs a measurement under it | a test asserting two targets' check counts differ |
| **P2** | `docs/acceptance.md` is 96 KB and grows by clause per round | unchanged: L3 and L4 are 284 and 405 lines, the other four layers 14, 7, 7 and 6 | move the per-round clauses to a volume, after measuring how many sections match that shape |
| **P2** | Cloud-OpsBench has no established vendor | new this round: the field held an arXiv id, the page renamed the row to `Reference`, and the field is `null` now | read the paper's author block, as `openrca-2.0`'s was read, and record the line the value comes from |
| **P2** | two prose targets cite a paper no digest pins | new this round: `itbench` and `cloud-opsbench` print an arXiv id beside the one the corpus pins | a sha256 and a byte count per paper, or a declaration saying the id is all this repository read |

**The lesson.** Both defects are the same sentence at two levels: *every cell in a table is either a
projection of something or a claim with one reader.* The metadata table had six cells that were
paraphrases, and the one that mattered was not the version everybody kept in step -- it was the vendor
nobody did, and it was wrong for two months while three copies of the version agreed perfectly. The
generator had a check for one of the three things it wrote, which is finding 471's 105-and-204 one level
down: the gate existed, was named after the work, and measured the artifact that never drifts.

## v3.68 — a pollution gate that compared a case with everything except another case

### 一、Four arms, and none of them read a case against a case

G5 is the anti-pollution gate. Its four arms read one case against a regular expression, a
fingerprint from a public benchmark, a boolean the case asserts about itself, and the component name
inside its own prompt. The comparison the word *pollution* is actually about -- two cases in one set
that are the same incident written twice, so that a set of thirty is a set of twenty-two with eight of
them counted twice -- had no arm at all (finding 479).

`caseFingerprint` cannot stand in for it, and the reason is the shape of the rule rather than its
implementation: it hashes `system|type|injectTime|rootCauseEntityId|window.start|window.end`, so
moving any of those six by a minute produces a different case. That is exactly right for
`PUBLIC_SET_CONTAMINATION`, which claims "this case **is** that published case". It is blind to "these
two cases are one incident", which is a statement about degrees.

Two arms were added, both restricted to pairs inside one system:

| arm | compares | code | default | corpus |
| --- | --- | --- | --- | --- |
| task text | set Jaccard over `query` tokens, function words dropped | `NEAR_DUPLICATE_QUERY` | 0.90 | closest **0.25** |
| window | IoU of two half-open `[start, end)` windows | `OVERLAPPING_WINDOW` | 0.50 | widest **1/6** |

Three details in that table are decisions rather than incidentals. The stop-word list is applied to
both sides, which is what pulls two prompts differing only in `The`/`A` from 0.77 to exactly 1.00 and
pushes a topical coincidence down -- the coincidence was carried by `after`, `while` and `at`. A CJK
character is a token of its own, because `[a-z0-9]+` alone tokenises `订单服务变慢了` to the empty set and
an empty set would then have to be reported as either a duplicate or a skip, and both are wrong. And a
bound `Date.parse` cannot read is **declined** rather than parsed: NaN propagates into the ratio, every
comparison against NaN is false, and the pair is reported clean over a window nobody read.

### 二、The corpus guard asked the gate one case at a time

`check-fault-cases.mjs` asks G5 of every case, and builds the bundle as `{ cases: [parsedCase] }`. For
the four arms above that shape is right. `DUPLICATE_CASE` compares a case with the ones before it, and
a bundle of one has none -- so it could not fire in that loop if the corpus held one incident ten
times, and neither could either new arm.

The proof was already in the tree, and this is the part worth recording: `check-fault-cases.test.ts`
builds ten carriers of a difficulty label by deep-copying one annotation and changing only `caseId`.
Same prompt, same `injectTime`, same window, ten times -- and **v3.67 was green on it**. The fixture
was not wrong about difficulty; it was answering a question about levels with a set that is also a
duplicate-detection specimen, and nothing was reading the second question. Adding the arms turned that
fixture red, which is the rule working, and the fixture now moves the prompt and the window with the
index because a copy is a carrier of one label and nothing else about it is under test.

The guard now also asks G5 of the whole corpus once, filtered to the three codes whose subject is a
pair (`DUPLICATE_CASE` included -- it had the same blindness for the same reason). The filter is a
statement about where each arm reads its subject, not a preference: the four per-case arms have
already been asked with a better subject line, and reporting them twice would report one defect under
two names.

### 三、With no witness in the corpus, the maximum is the evidence

435 pairs, all within one system, and the closest is 0.25 against a line at 0.90. A rule whose only
failure is synthetic is a rule this list has learned to distrust, so the repair was not to skip the
rule but to make it publish what it measured: `readPairSimilarity` returns both maxima beside both
thresholds, `describePairSimilarity` prints them, and `check-fault-cases.mjs` prints that sentence on
both exits --

```
pairwise similarity: 435 of 435 pair(s) share a system, and 435 carry task text on both sides;
closest task text 0.25 (...) against a 0.90 threshold, most overlapping window 0.17 (...) against
0.50; 0 near-duplicate(s) and 0 overlapping window(s)
```

-- so the two defaults stop being unstated judgements. A corpus drifting towards duplication raises
the maximum long before it crosses the line; the margin is a printed number (3.6x and 3.0x) that a
test asserts and refuses to let fall below 2x. Without that line the same rule would have said
`passed`, which is what a rule that never ran its body also says.

**Three figures, one name.** The arm's maximum had been published three times and no two agreed:
`progress.md` said **0.308**, the probe written before the implementation said **0.2414**, and the
rule itself says **0.25**. The first cannot be reproduced by any tokenisation in the tree; the second
came from a shorter stop-word list than the one that shipped. All three are far below 0.90, so the
conclusion never moved and the reading did, three times. The open-list entry now carries the figure
the rule computes, and a test asserts the number rather than a bound so the next drift is a red test.

### 四、Two numbers that were readings once

`readPromptLeaks` argues for its normalisation with `3 of 30` against `19 of 30`. Both were true when
written and both stopped being true in **the same round**: v3.66's `b16892f` rewrote the corpus's task
texts so that none names its component, and both forms now report `0 of 30`. The volume records the
repair; the comment, two directories away, described the defect in the present tense (finding 480).
The figures are kept and dated -- they are the argument for the rule's shape -- and the comment now
points at the line `check-fault-cases.mjs` prints on every run for the current value. `seventeen` in
that sentence was also wrong: 19 - 3 is sixteen.

The same shape turned up in `docs/progress.md`, in the `## Coverage` table, where it is worse.
`check-doc-counts` guards the suite counts and nothing guards the coverage figure, so the table
published `99.96 / 99.93 / 100 / 99.96` while every ledger for eight rounds read `99.96 / 99.75` and
then `99.97 / 99.80`. **99.93 was never a measurement** -- it was typed, under a sentence beginning
`Measured by` (finding 481). The table now carries the measured figures, the date, and the sentence
that says it is retaken when the residual's shape changes rather than every round.

Three figures about this repository are published twice: the suite counts (guarded), the gate-site
count (derived), and the coverage figure (neither, and therefore the one that was wrong). The rule is
not "guard everything". It is that a number with two copies needs one of them to be computed rather
than remembered.

### Five、What the gates cost to extend

Seven injections were added, one per guard the new arms carry, because a fixture is the whole evidence
here rather than a second opinion: **28 injections became 35, witnesses 33 became 41** (the stop-word
injection breaks two tests, the headline refusal and the one that holds the published list to the
filter). The battery's own pre-flight had to learn a distinction it had documented and never
implemented: its subject is now a `.ts` file, and `node --check` reads TypeScript as JavaScript, so
all seven rows came back `UNPARSEABLE` on the first run -- the instrument answering a question about
itself. The suffix decides which question is answerable now, and the runner's own transform failure
decides for the rows that have no answer from `node`.

Two uncovered branches were found by the coverage run and closed by tests rather than by exemptions:
the sentence's second null (`no pair had two readable windows`, the mirror of the first), and a
degenerate zero-length window. A third was a guard that could not be reached -- `jaccardOf`'s
empty-set test, which the caller already performs under `skippedNoQuery`, because "the two prompts
share nothing" and "one prompt was not there" are two findings. It was deleted with that sentence
written where it stood, which is how `gates/gates.ts` goes to **100 / 100 / 100 / 100**.

### Readings

> Ledger for `v3.68`.

| item | value |
| --- | --- |
| `core` test suite | **240 files, 6104 tests passed** (at v3.68) |
| `cli` test suite | **4 files, 187 tests passed** (at v3.68) |
| repo test suite | **244 files, 6291 tests passed** (at v3.68) |
| coverage | `core` **99.97 / 99.80 / 100 / 99.97**, `cli` **100 / 100 / 100 / 100** (statements / branches / functions / lines); `gates/gates.ts` is **100 / 100 / 100 / 100** |
| new tests | **22** (6,082 -> 6,104), all in `gate-pair-similarity.test.ts`: the two arms' refusals, the two sentence branches, the tokeniser and the stop-word list that uses it, the corpus readings, and four boundaries -- cross-system, absent prompt, unreadable bound, zero-length window -- plus the repeated-`caseId` pair. One fixture was edited in place: `check-fault-cases.test.ts`'s ten copies now vary their prompt and window, because a set of ten identical incidents is a duplicate-detection specimen |
| new mutations | **7** injections in `gate-tests-battery.py` (PAIRS 1-7); **28 -> 35** injections, **33 -> 41** witnesses, all 34 reachable rows CAUGHT and 1 redundant as declared |
| the arms | **2** new G5 codes; **435** pairs compared; closest task text **0.25**, most overlapping window **1/6**, **0** and **0** refused |
| the figures | **0.308 -> 0.2414 -> 0.25**: three readings of one maximum, the last one reproducible by the rule and asserted by a test |
| the gate | **4 of 6** arms compared a case with something that is not a case; the corpus guard fed it **1 case per bundle**, so the pairwise ones could not fire even on ten copies |
| the coverage table | `99.96 / 99.93 / 100 / 99.96` -> **99.97 / 99.80 / 100 / 99.97**; 99.93 was typed, not measured |
| the claims | **207** claim(s) across **58** file(s), **128** failure site(s) -- unchanged: this round's prose names no count in the shape the rule reads, and the two figures that moved are readings rather than claims |
| the list | **22 -> 22** open: this round closed the G5 item and opened one about the coverage table's missing reader |

### Left open, in the order the goal is reached

| priority | item | state | next step |
| --- | --- | --- | --- |
| **P2** | G3's two thresholds have no grid | unchanged: the defaults are a judgement nothing has defended | a 4x4 grid and a rule that refuses a default on a slope |
| **P2** | `rulegen` has no refusal count and no agreement reading | unchanged: the thirty human annotations already exist and nothing compares against them | agreement with a fixed answer set, and the absence of kappa stated as a choice |
| **P2** | `score` divides by a different denominator per target | unchanged: the sentence needs a measurement under it | a test asserting two targets' check counts differ |
| **P2** | `docs/acceptance.md` is 96 KB and grows by clause per round | worsened this round by six clauses: L3 and L4 are the two large layers | move the per-round clauses to a volume, after measuring how many sections match that shape |
| **P2** | Cloud-OpsBench has no established vendor | unchanged: the field is `null` and the page prints *not established* | read the paper's author block, as `openrca-2.0`'s was read, and record the line the value comes from |
| **P2** | two prose targets cite a paper no digest pins | unchanged: `itbench` and `cloud-opsbench` print an arXiv id beside the one the corpus pins | a sha256 and a byte count per paper, or a declaration saying the id is all this repository read |
| **P3** | the coverage figure has no reader that computes it | new this round: the table was wrong by 0.13 branches for at least eight rounds, and it is now correct by hand | a `docs:check` step that reads a coverage report when one exists, or a sentence saying the ledger is the only copy |

**The lesson.** Both of this round's first two findings are the same sentence: *a comparison needs a
second case.* G5 compared a case with a pattern, a fingerprint, a declaration and a name -- four
readers, all of them about one case -- and the one claim that needs two cases had none. The guard that
feeds it compared one case at a time, so the arm, once added, would still have been silent had it not
been asked again over the whole set. The third finding is the same sentence about documents: a figure
needs a second reader, and the copy that has one is the copy that stays true.

## v3.69 — 两条从没被人动过的阈值，和一个只存在于库里的通道

### 一、网格十六格一个答案，而那不是网格通过了

`checkG3Validity` 用「某个指标在注入后连续 3 个样本 `|Z| >= 2.0`」接纳一个案例。两个数都是带默认值的参数，两个默认值都内联在函数里，而树里没有任何东西问过它们两侧是什么样。网格的答案是：**什么都没变**。

| 单元 | 接纳 | 单元 | 接纳 |
| --- | --- | --- | --- |
| `\|Z\| >= 1`，1 样本 | 30 / 30 | `\|Z\| >= 10`，1 样本 | 30 / 30 |
| `\|Z\| >= 1`，8 样本 | 30 / 30 | `\|Z\| >= 100`，8 样本 | 30 / 30 |

十六格，一个判决。这不是网格通过了，是**语料看不见阈值**——而网格的职责正是分清这两件事。分开它们的是每个案例的**翻转点**：它仍能撑住 3 个样本的最大 `\|Z\|` 线，也就是最佳三窗里最小的那个 z（闭式，不用搜索）。

| 量 | 值 |
| --- | --- |
| 被判决的案例 | **30** |
| 最弱的翻转点 | **126.85** —— `history-resource-ephemeral-capacity-image-builder` |
| 最强的翻转点 | **3.15e12** —— `history-kafka-consumer-lag` |
| 相对默认线的余量 | **63.42 倍** |
| 单个案例能给的最多样本 | **8** |

原因是语料的构造而不是门禁：派生序列从基线一步跳到 post 值，计数器的前置窗口精确平坦，于是 `stddev` 是零或 2% 抖动，z 就成了步长与**那个**的比值——最弱 126，最强 3.15e12。这样造出来的语料测不了阈值，这正是 `probe-z-floor` 关于 `epsilon` 的发现（finding 288）低一层的样子。

**网格还能辩护什么。** 顺序：任一条轴抬高，被拒数不会下降，十六格全部断言过，所以这是一个曲面而不是十六次互不相干的测量。**不能辩护什么：**数值——1 到 100 之间任何一条线在这份语料上给出同一个判决，所以默认值是一个语料对它保持沉默的判断。读数不假装相反：`check-fault-cases.mjs` 在两个出口都把余量印在网格旁边，清单条目改写为「语料回答不了什么」而不是「网格没测出什么」。

**让答案可信的形状。**网格与判决是同一次计算：`metricGroups`、`absZScores`、`flipPoint` 与 `checkG3Validity` 共用，一条测试把每一格拒掉的集合与 `checkG3Validity` 自己的违规逐格比对。十六格与门禁一致，那是对门禁的读数；十六格由第二份实现算出，那是第二条规则——上一轮刚为这件事付过账（finding 479）。

写它的时候抓到两个小东西。`G3_DEFAULTS` 现在存在，网格读的是门禁应用的数而不是复述的；而这个读数的第一版**只给调用方轴上的样本线**算翻转点，于是问了个更窄问题的调用方被告知「没有任何案例撑住 3 个样本」——而那个案例撑住 62 个。把网格形状的读数当成语料的读数，被那条故意问窄问题的测试抓住。

### 二、一个只存在于库里的通道，和一张写了两遍的表

清单条目说：`rulegen` 没有拒绝计数、没有一致率，「没有任何东西把它和已经存在的三十条人工标注比对」。三句话里两句是错的，第三句才是要害。

**那三十条标注属于另一个通道。** `golden-master/fault-extraction/samples.json` 有三十条手写事故文本与期望的 `type`/`category`/`component`，`buildExtractionReport` 把一次运行与之比对：命中、miss、分层比率、miss 分类、严格阈值。`fault-extraction-accuracy` workflow 调用它。所以那条条目指向的标注集**早就被读了**——被从文本抽取故障的通道读，而那不是 `rulegen`。

**而 `rulegen` 根本没有调用方。**`buildRulegenPrompt`、`parseRulegenResponseChecked`、`validateGeneratedLayout` 从 `index.ts` 导出，在 `src/` 与 `scripts/` 里除了自己和测试之外无人调用。每个被摄取的文件走的是 `ingest/prime.ts` 的别名表。所以「没有拒绝计数」不是一个缺失的测量，而是一个无人调用的函数的正确报告；对模型输出报一个一致率，描述的是一个不运行的通道。

**表才是值得修的缺陷。**`REQUIRED_FIELDS`——一个布局必须映射哪些字段才算可读——被逐字节写了两遍：`ingest/prime.ts` 一份决定能否调用 `ingestFile`，`llm/rulegen.ts` 一份决定模型的映射是否完整。两者在本轮开始时完全相同，而没有任何东西把它们拴在一起；一旦分叉，就会出现「验证器接受的布局被摄取拒绝」，而那句报错会写**缺列**而不是两个表不一致。这与 v3.67 的 `contractVersion`、v3.68 的停用词表是同一个缺陷的第三件外衣：**一个事实，两个写者，没有规则。**表现在住在 `ingest/file.ts`（它拥有 `FileLayout` 与 `FileSignalKind`），两个模块都导入它，分叉不再可表达。

### 三、答案集量的是什么

`golden-master/rulegen-layouts.json` 里十六个手写案例：一个表头行、两三条样本、一个仔细的人类读者会给出的布局，以及——模型那一侧——整段候选回答，按模型出错的方式写。读数报两个**不是同一个断言**的数：

| 通道 | 数 | 量的是什么 |
| --- | --- | --- |
| 别名表 | **14 / 16** 个指定布局 | 发的是它：差在两个值列不在其词表里的案例 |
| 验证器 | **16 / 16** 个判决，9 接受 / 7 拒绝 | 对回答的守卫：拼错的字段、不存在的列、空格、缺必需字段、错模态字段、编造的枚举值、超过 1 的置信度 |
| 理由 | **7 / 7** | 理由错的拒绝等于答案错而退出码对 |
| 它看不见的那一类 | **1** | 一个被接受的回答把 `metricValue` 指到 `limit`，而答案集说 `usage` |

最后一行是值得有的那个读数。`validateGeneratedLayout` 把布局对样本重放，所以它拒绝的是缺失或空的列——一个**结构性**检查。指到一个真实、非空、含义错误的列，它能通过。验证器对自己的契约是对的，通道对数据是错的，一个数载不动两个断言。

**kappa 缺席，而缺席本身就是主张。**Cohen's kappa 需要两个独立标注者；这十六个表头、指定布局与候选回答出自同一个作者。所以这个数是与**指定答案**的一致——弱于标注者之间的一致——每一句印它的话都说明是哪一种。另一种做法是把数字不加限定地印出来，而那是弱主张被读成强主张的路径。

### 四、两轮之间格式上的一个共同点

网格与答案集是同一个形状：把默认值的一个决定放进一张表，把表**不能**决定的东西报在它**能**决定的东西旁边，并且拒绝让一个数被印出来而不带那句「它是关于什么的数」。一个默认值和一个比率是同一件东西：一个其辩护住在敲下它的人脑子里的数字。

### 五、一条只在别人的回退里成立的导入路径

全量跑在这一轮红了十二个文件，其中十一个是子进程超时——机器被上一次覆盖率跑压住了，重跑即绿。第十二个不是：`published-refusals.test.ts` 报 `ERR_MODULE_NOT_FOUND`，说 `../../scripts/format-spec.mjs` 找不到。

那个文件在 `packages/core/test/` 下，所以 `../../` 是 `packages/`，而 `packages/scripts/` 在树里不存在。路径**从来**就是错的。它一直能跑，是因为 vite-node 把树外模块当作外部依赖之前先按自己的根解析了一遍；当那次运行没有走那条回退（同一台机器、同一份文件、同一分钟，前一次红后一次绿），node 按 importer 解析，于是拿出一个没人写过的路径。

守卫不是把这一行改对就完事——**一条只在某个加载器的回退里成立的路径，下一轮会以同样方式再出现一次**。`scripts-are-classified.test.ts` 里已经有一个读 `from '…/scripts/x.mjs'` 的正则，用来禁止测试导入 gate；它被扩成同时读出整条 specifier，于是同一个读取器多出一个问题：这条 specifier 按写它的那个文件解析，落不落在一个真文件上。

守卫第一次运行就报了**两条**，两条都是散文：守卫自己的 doc comment 写出了那个形状，控制用例把形状引在字符串里。一条会因为自己的注释而红的守卫会被删掉，所以扫描前先去注释（`//` 必须紧跟在空白之后，这样字符串里的 `http://` 不会被读成注释开头），并把这三种情况写成控制断言。随后它报出的唯一一条 offender 就是真文件里那一行，而把那一行改回错的，它会再次点名报告。

| 读法 | 结果 |
| --- | --- |
| 全树 `scripts/*.mjs` specifier | **42** 条，全部落在一个真文件上 |
| 修之前 | 1 条落在 `packages/scripts/`——一个不存在的目录 |
| 同一条 specifier 的外部依赖路径 | node 按 importer 解析 → `ERR_MODULE_NOT_FOUND` |

这件事的形状值得记下来：**红一次、绿一次、同一份文件**，如果只看后来的绿，它就是「机器抖了一下」。可用的线索是错误自己说的那句话——它报的路径没人写过。一个真缺陷与一次抖动的区别，经常只是错误信息里那个路径存不存在。

### Readings

> Ledger for `v3.69`.

| item | value |
| --- | --- |
| `core` test suite | **243 files, 6191 tests passed** (at v3.69) |
| `cli` test suite | **4 files, 187 tests passed** (at v3.69) |
| repo test suite | **247 files, 6378 tests passed** (at v3.69) |
| coverage | `core` **99.97 / 99.80 / 100 / 99.97**, `cli` **100 / 100 / 100 / 100**; `gates/gates.ts` and `llm/rulegen-agreement.ts` are **100 / 100 / 100 / 100** |
| new tests | **56** (6,104 -> 6,160): **20** in the new `gate-threshold-grid.test.ts`, **27** in the new `rulegen-agreement.test.ts`, **2** in `check-fault-cases.test.ts` (the corpus reading and its refusal), **3** in `rulegen.test.ts` (the one-writer table), **1** in `scripts-are-classified.test.ts` (the depth guard over every script specifier), and **3** produced by the `it.each` tables that read the registers this round extended -- `export-surface-enumerated.test.ts` alone accounts for two, measured by running its previous revision beside it |
| new mutations | **7** injections in `gate-tests-battery.py` (GRID 1-3, LAYOUT 1-4); **35 -> 42** injections, **41 -> 51** witnesses. Two of the ten new witnesses are second tests on one injection: withdrawing the grid's inclusive boundary is seen by the sixteen-cell agreement test as well as by the boundary case, and withdrawing the wrong-column comparison is seen by the shipped reading as well as by the planted one. All 41 reachable rows CAUGHT, 1 redundant as declared, 0 survived, 0 inert, 0 unattributed |
| the grid | **4x4** cells over `\|Z\|` 1/2/10/100 and 1/3/5/8 samples; **30 of 30** admitted in every cell whose sample line is reachable; weakest flip **126.85**, margin **63.42x**; **8** samples is the tallest line the corpus can satisfy |
| the answer set | **16** authored cases; alias table **14 of 16**; validator **16 of 16** verdicts (9 / 7), reasons **7 of 7**; **1** accepted answer maps a field to another real column |
| the second writer | `REQUIRED_FIELDS` **2 -> 1**: moved to `ingest/file.ts` and imported by `prime.ts` and `rulegen.ts`; a test refuses a layout missing exactly one required field, for every field of every kind |
| the channel | `rulegen` has **0** production callers; the thirty extractions annotations the open-list entry cited belong to `fault-extraction`, which reads them through `buildExtractionReport` |
| the claims | **213** claim(s) across **59** file(s), **132** failure site(s), from `gate-sites.json` |
| the list | **22 -> 22** open: two closed (G3's grid, `rulegen`'s reading), two opened (the corpus cannot move the `\|Z\|` axis; the validator cannot see a wrong-but-valid mapping) |

### Left open, in the order the goal is reached

| priority | item | state | next step |
| --- | --- | --- | --- |
| **P2** | **The corpus cannot move the z-score axis** | new this round: every case's flip point is at least 63x the line, so the grid is a constant | a case whose separation sits near 2-4 sigma, so the threshold has something to decide; the flip-point reading is what a reader checks it against |
| **P2** | `score` divides by a different denominator per target | unchanged: the sentence needs a measurement under it | a test asserting two targets' check counts differ |
| **P2** | `docs/acceptance.md` is 96 KB and grows by clause per round | worsened this round by six clauses | move the per-round clauses to a volume, after measuring how many sections match that shape |
| **P2** | Cloud-OpsBench has no established vendor | unchanged: the field is `null` and the page prints *not established* | read the paper's author block and record the line the value comes from |
| **P2** | two prose targets cite a paper no digest pins | unchanged | a sha256 and a byte count per paper, or a declaration saying the id is all this repository read |
| **P3** | **The layout validator cannot see a wrong-but-valid mapping** | new this round: **1** of the 16 cases is accepted and misreads a column | a second reader for the model-side channel when it gets a caller, or a stated limit on what a replay can claim |
| **P3** | the coverage figure has no reader that computes it | unchanged | a `docs:check` step that reads a coverage report when one exists, or a sentence saying the ledger is the only copy |

**The lesson.** Both items this round were a number with nothing under it, and both times the repair was to compute what the number was *of*. The thresholds had no grid, so nobody could say whether 2.0 was defended or merely unexamined; the answer is that the corpus is silent about it, and only a flip point can say which. The channel had no rate, so the entry said the rate was missing; the answer is that the channel has no caller and the annotations belonged to a neighbour, and the thing actually worth repairing was one table written twice. **A default is a claim about a distribution, and a claim about a distribution needs the distribution to be able to disagree with it.**

## v3.70 — five denominators behind one percentage, and a corpus that could not see its own threshold

The score is a percentage over the checks a target declares: nine targets over **five** counts
(14, 9, 8, 7, 2), eight of them printing `100`, and without anchors only **two** values are
reachable because `creditFor` was `passed ? rate : 0` and `rate` could only be 0 or 1.
`ScoreReport.terms` carries the counts and `describeScore` prints
`score 100 of 100 over 14 structure check(s)` everywhere (finding 485).

The constant grid was arithmetic: the fixed ±2 % jitter fixes every sampled spread at about
1.34 % of its mean, so no authored incident could sit near the line. A faint case (TTL 284 where
the runbook says 300; **1100 -> 1164** rps; **240 -> 254** ms; no errors) separates by about
**3 sigma**, and a neighbour of the default now refuses it: flip **3.38**, `1.69x`, against
`126.85` / `63.42x` last round (finding 486).

Growing the corpus had a price, measured: the key is **31** samples over **30** types, **1** sample
has no recorded run (named by `m1-reading-is-reproducible.test.ts`), and the M1 ceiling moved from
25 of 30 to **26 of 31**. `validateGeneratedLayout`'s reach is stated where the rule lives and
pinned by an accepted misread the correct mapping also passes (finding 487).

### Readings

> Ledger for `v3.70`.

| item | value |
| --- | --- |
| suites | `core` **243 / 6174**, `cli` 4 / 187, repo **247 / 6361**, all green |
| coverage | `core` **99.97 / 99.82 / 100 / 99.97**, `cli` **100 / 100 / 100 / 100**; `score/score.ts` and `report/html.ts` **100** in all four |
| new tests | **14**: 9 `score-denominators`, 1 `rulegen`, 2 `html`, 1 `score`, and the count guards |
| mutations | **42 -> 45** injections, **51 -> 54** witnesses; 44 caught, 1 redundant, 0 survived / inert / unattributed |
| grid | **31 of 31** at default, **1 of 4** neighbours changes it, worst flip **3.38** (`1.69x`) |
| corpus | **31** cases / **31** samples / **30** types; **1** sample with no recorded run |
| list | **22 -> 21**: three closed, two opened |

**The lesson.** A number without its denominator is a label: a percentage over five populations, a
grid over a corpus that could not reach the line, and a validator's verdict read as meaning. Each
repair made the number *arguable* rather than different.
## v3.71 — a shape whose name carried a duration, and the denominator a reading never printed

The threshold grid had four sample lines and one verdict: 1, 3, 5 and 8 all admitted all
thirty-one cases, because `expandSeries` gave every post-onset sample the post value and
`longestRun` therefore counted to eight in every case. The vocabulary was the reason.
`SERIES_DERIVATIONS` held `step`, `counter` and `spike`, and `spike` was a step with a hold of one —
a **duration written into a shape's name**, and the only duration it could carry was one sample. A
schema that can say "the whole post-window" or "exactly one sample" and nothing between cannot
answer a question about how long an excursion has to last, and the sample axis is exactly that
question. `hold` says the number: `spike` retired into `hold: 1`, the vocabulary lost a word, and
the range it gained is what moved the axis (finding 488).

The corpus's first self-clearing case is what exercises it: merge threads at **0.12 -> 0.98** for
four post-onset samples, cluster lag **1.2s -> 84s**, catalog p99 **40 -> 300ms**, and an error
ratio that never moves. Four is derived rather than chosen — G4 accepts a case only when both
baselines place the answer, the robust baseline reads the post-window's **median**, and a median
over eight samples is the mean of the fourth and fifth: four elevated samples put it between the
levels, three leave it on the baseline. The grid now reports **2 of 4** neighbours changing the
verdict, and the two reasons are different — too weak on the `|Z|` axis (the v3.70 faint case,
flip **3.38**), too short on the sample axis.

The second reading had no denominator at all. `record.key.size` is the key **on the day the reading
was taken**, the tree's key is a different number, and a reader comparing a total with either was
choosing a denominator without being told which. `describeReadingCoverage` writes
`the reading answers 30 of the 32 sample(s) the key holds; unanswered: …`,
`score-fault-extraction.mjs --record` prints it beside the report, and the M1 test pins the whole
line — so the two numbers are one sentence instead of two facts a reader had to reconcile
(finding 489). The extra answers are a separate clause rather than folded into the count: a reading
that answers an id the key does not carry was taken against a different text, which is a different
defect from a smaller key.

### Readings

> Ledger for `v3.71`.

| item | value |
| --- | --- |
| suites | `core` **243 / 6186**, `cli` 4 / 187, repo **247 / 6373**, all green |
| coverage | `core` **99.97 / 99.82 / 100 / 99.97**, `cli` **100 / 100 / 100 / 100**; `derived-telemetry.ts` and `reading-record.ts` **100** in all four |
| new tests | **12**: 2 `hold`, 4 refusals, 4 coverage sentences, 2 script lines |
| mutations | **45 -> 48** injections, **54 -> 57** witnesses; 47 caught, 1 redundant, 0 survived / inert / unattributed |
| grid | **32 of 32** at the default, **2 of 4** neighbours change it — `|Z| >= 10` too weak, **5 samples** too short |
| corpus | **32** cases / **32** samples / **30** types; **2** samples with no recorded run |
| list | **21 -> 20**: two closed, one opened |

**The lesson.** A name can hide a number. `spike` read as a shape and was a duration of one, so the
axis that asked about duration could not be moved by any file the schema admitted. Naming the number
moved the axis; naming the denominator made the reading's own ratio printable. Both repairs are the
same move — take the quantity out of the word and put it where it can be measured.

## v3.72 — the duration a case stated and the one its telemetry held

`hold` was the whole of v3.71's repair, and it took one round to show that the field does not only
express a duration — it *checks* one. `history-resource-merge-burst-search-cluster` says its merge
"stayed there for four minutes", declares `burstMinutes: 4`, cites that parameter from a checkpoint,
and ships `hold: 4`. A hold counts samples, and a sample in that window was 3.5 minutes long, so the
plateau ran from 14:12 to 14:26 — **fourteen minutes of telemetry under a sentence that says four**.
The two numbers were the same number, which is exactly why nothing looked.

The class is older than the case. `history-network-partition-search-cluster` has said since it was
annotated that "the seventeen minutes are the gap between 03:02 and 03:19", in a window that ended at
03:40: its member count stayed halved for **thirty-eight** minutes. Before `hold` no case could state
an end at all, so a window was the only duration a case could have, and a window that outlives the
sentence was not a contradiction anyone could write down (finding 490).

Both repairs move the geometry rather than the sentence: the merge-burst window now ends at 14:20 and
the partition window at 03:19, so a sample is a minute in the first and the second ends where its own
text says the links came back. `readPostSampleSpacing` computes the number nobody wrote down —
`(windowEnd - onset) / SERIES_POINTS` — and `readDurationRestatement` asks the only question a file
can be held to: a parameter whose value **is** the hold is asserting that one sample is one unit of
that parameter, and the window either makes that true or it does not. It refused one case in the
shipped corpus before the repair and was silent about the other seven time-unit parameters, because
`splitDurationMinutes: 17` beside a hold of eight is a different quantity rather than a restatement.

The sample axis got its second witness the same round, because a grid that measures duration should
be able to tell two durations apart. `history-queue-disk-watermark-batch-drain` is a six-minute
burst at one sample a minute: the topic's disk climbs 35 % -> 92 %, append p99 8ms -> 240ms, consumer
lag 40s -> 900s, and the export's segments are reclaimed once the batch ends. At the 5-sample line the
four-sample case is refused and the six-sample one is not; at the 8-sample line both are — so the two
land in **different cells**, which is what a second witness is for. The neighbour count cannot show
it, because 8 is two steps from the default 3: the reading now prints the axis itself,
`the sample line refuses 0 / 0 / 1 / 2 case(s) at 1 / 3 / 5 / 8`, and the test pins the staircase.

The smaller finding came free with that case. `assessDiscriminatingPower` reports two alternative
readings, each with the types it disagrees with, beside a union of them. The union was a `Set` and the
two lists were arrays, so the fields disagreed about what they counted — and until this round no type
had two samples. With two `queue-disk-watermark` samples both disagreeing, the row-shadowing list came
back with five entries and four types, in a field documented as "the expected types this reading
classifies differently": a count of rows wearing a type's name (finding 491).

### Readings

> Ledger for `v3.72`.

| item | value |
| --- | --- |
| suites | `core` **243 / 6191**, `cli` 4 / 187, repo **247 / 6378**, all green |
| coverage | `core` **99.97 / 99.82 / 100 / 99.97**, `cli` **100 / 100 / 100 / 100** |
| new tests | **5**: the spacing reading, the refusal, the acceptance, the silence for a different quantity, the silence for a non-time unit |
| mutations | **48 -> 50** injections, **57 -> 59** witnesses; 49 caught, 1 redundant, 0 survived / inert / unattributed |
| grid | **33 of 33** at the default, **2 of 4** neighbours, and the axis prints **0 / 0 / 1 / 2** at 1 / 3 / 5 / 8 samples |
| corpus | **33** cases / **33** samples / **30** types; **3** samples with no recorded run; **528** pairs, 496 -> 528 |
| windows | merge-burst post **38 -> 8** minutes, partition post **38 -> 17** minutes, both to match their own prose |
| ratchet | the L4 slack **2 -> 1**: five of thirty-three is 0.152, four of thirty-two 0.125, three of thirty-one 0.097 |
| list | **20 -> 21**: one closed, two opened |

**The lesson.** A field that states a quantity also states what it is measured in, and a case that
writes the same number twice in two units has written one fact and broken it in one place. `spike`
hid a duration inside a name; `burstMinutes: 4` beside `hold: 4` hid the *unit* inside an
agreement — four of what, against four of what — and both were repaired the same way: compute the
number that sits between the two statements and refuse the file that cannot say it.

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
| `core` test suite | **245 files, 6267 tests passed** (as of this commit) |
| `cli` test suite | **4 files, 187 tests passed** (as of this commit) |
| repo test suite | **249 files, 6454 tests passed** (as of this commit) |
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
