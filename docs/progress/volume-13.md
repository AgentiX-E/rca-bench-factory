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

## v3.69 — two thresholds nobody had ever moved, and a channel that exists only in the library

### One · sixteen cells, one answer, and that is not the grid passing

`checkG3Validity` admits a case on "some metric holds `|Z| >= 2.0` for 3 consecutive samples after the
injection". Both numbers are parameters with defaults, both defaults are inline in the function, and
nothing in the tree had ever asked what either side of them looks like. The grid's answer: **nothing
changed**.

| cell | admitted | cell | admitted |
| --- | --- | --- | --- |
| `\|Z\| >= 1`, 1 sample | 30 / 30 | `\|Z\| >= 10`, 1 sample | 30 / 30 |
| `\|Z\| >= 1`, 8 samples | 30 / 30 | `\|Z\| >= 100`, 8 samples | 30 / 30 |

Sixteen cells, one verdict. This is not the grid passing; it is **the corpus being unable to see the
threshold** -- and telling those two apart is exactly the grid's job. What separates them is each
case's **flip point**: the largest `\|Z\|` line it can still hold 3 samples above, which is the smallest
z among the best three windows (closed form, no search).

| quantity | value |
| --- | --- |
| cases judged | **30** |
| weakest flip point | **126.85** -- `history-resource-ephemeral-capacity-image-builder` |
| strongest flip point | **3.15e12** -- `history-kafka-consumer-lag` |
| margin over the default line | **63.42x** |
| most samples one case can offer | **8** |

The cause is the corpus's construction rather than the gate: the derived series steps from the baseline
to the post value in one step and the counter's pre-window is exactly flat, so `stddev` is zero or a 2%
jitter and z becomes the step divided by **that** -- 126 at the weakest, 3.15e12 at the strongest. A
corpus built that way cannot test a threshold, which is finding 288's discovery about `epsilon` one
level down.

**What the grid can still defend.** Order: raising either axis never lowers the number rejected, and all
sixteen cells are asserted, so this is a surface rather than sixteen unrelated measurements. **What it
cannot defend:** the numbers -- any line between 1 and 100 gives the same verdict on this corpus, so the
default is a judgment the corpus is silent about. The reading does not pretend otherwise:
`check-fault-cases.mjs` prints the margin beside the grid at both exits, and the list entry was rewritten
as "what the corpus cannot answer" rather than "what the grid failed to find".

**The shape that makes the answer trustworthy.** The grid and the verdict are one computation:
`metricGroups`, `absZScores` and `flipPoint` are shared with `checkG3Validity`, and one test compares
each cell's rejected set with `checkG3Validity`'s own violations, cell by cell. Sixteen cells agreeing
with the gate is a reading *of the gate*; sixteen cells computed by a second implementation is a second
rule -- a thing the previous round had just paid for (finding 479).

Two small things were caught while writing it. `G3_DEFAULTS` now exists, and the grid reads the numbers
the gate applies rather than restating them; and the first version of this reading computed flip points
**only** along the sample line of the axis its caller asked about, so a caller asking a narrower
question was told "no case holds 3 samples" -- while that case holds 62. Taking a grid-shaped reading for
a corpus reading is what the deliberately narrow test caught.

### Two · a channel that exists only in the library, and a table written twice

The list entry said: `rulegen` has no refusal count, no agreement rate, and "nothing compares it with
the thirty human annotations that already exist". Two of those three sentences are wrong, and the third
is the point.

**The thirty annotations belong to another channel.** `golden-master/fault-extraction/samples.json`
holds thirty hand-written incident texts with their expected `type`/`category`/`component`, and
`buildExtractionReport` compares one run against them: hits, misses, stratified rates, miss classes,
strict threshold. The `fault-extraction-accuracy` workflow calls it. So the annotation set the entry
pointed at **had long been read** -- read by the channel that extracts a fault from text, which is not
`rulegen`.

**And `rulegen` has no caller at all.** `buildRulegenPrompt`, `parseRulegenResponseChecked` and
`validateGeneratedLayout` are exported from `index.ts` and, outside themselves and their tests, are
called by nothing in `src/` or `scripts/`. Every ingested file goes through the alias table in
`ingest/prime.ts`. So "no refusal count" is not a missing measurement; it is a correct report about a
function nobody calls, and an agreement rate over model output would describe a channel that does not
run.

**The table was the defect worth repairing.** `REQUIRED_FIELDS` -- which fields a layout must map before
it is readable -- was written twice, byte for byte: one copy in `ingest/prime.ts` deciding whether
`ingestFile` may be called, one in `llm/rulegen.ts` deciding whether the model's mapping is complete. The
two were identical when the round began and nothing bound them together; once they diverged, a layout
the validator accepted would be refused by the ingest, and the error would name a **missing column**
rather than two tables disagreeing. This is the third coat of the defect v3.67 found in `contractVersion`
and v3.68 in the stop-word list: **one fact, two writers, no rule.** The table now lives in
`ingest/file.ts` (which owns `FileLayout` and `FileSignalKind`), both modules import it, and the
divergence is no longer expressible.

### Three · what the answer set measures

`golden-master/rulegen-layouts.json` holds sixteen hand-written cases: a header row, two or three
samples, the layout a careful human reader would give, and -- on the model's side -- a whole candidate
reply, written the way models get it wrong. The reading reports two numbers that are **not the same
assertion**:

| channel | number | what it measures |
| --- | --- | --- |
| alias table | **14 / 16** layouts named | it issued the answer: the two it misses are cases whose value columns are not in its vocabulary |
| validator | **16 / 16** verdicts, 9 accepted / 7 refused | the guard over replies: misspelled fields, columns that do not exist, blank cells, missing required fields, wrong-modality fields, invented enum values, confidences above 1 |
| reasons | **7 / 7** | a refusal whose reason is wrong is a wrong answer with a right exit code |
| the class it cannot see | **1** | an accepted reply points `metricValue` at `limit` while the key says `usage` |

The last row is the number worth having. `validateGeneratedLayout` replays a layout against the samples,
so what it refuses is a missing or empty column -- a **structural** check. Pointing at a real, non-empty,
wrong-in-meaning column passes. The validator is right about its own contract, the channel is wrong about
the data, and one number cannot carry two assertions.

**kappa is absent, and the absence is itself a claim.** Cohen's kappa needs two independent annotators;
these sixteen headers, laid-out answers and candidate replies come from one author. So the number is
agreement with the **authored answer** -- weaker than agreement between annotators -- and every sentence
that prints it says which of the two it is. The alternative was to print the number unqualified, and that
is the path along which a weak claim gets read as a strong one.

### Four · what the two rounds have in common in shape

The grid and the answer set are one shape: put one decision about a default into a table, report what the
table **cannot** decide beside what it **can**, and refuse to let a number be printed without the
sentence saying what it is a number *of*. A default and a rate are the same thing: a number whose defence
lives in the head of the person who typed it.

### Five · an import path that only resolved inside someone else's fallback

The full run went red on twelve files this round, eleven of them subprocess timeouts -- the machine was
still pressed by the previous coverage run, and a re-run was green. The twelfth was not:
`published-refusals.test.ts` reported `ERR_MODULE_NOT_FOUND` for `../../scripts/format-spec.mjs`.

That file sits in `packages/core/test/`, so `../../` is `packages/`, and `packages/scripts/` does not
exist in the tree. The path was **always** wrong. It had always run because vite-node resolved a module
outside the tree against its own root before treating it as external; when that run did not take the
fallback (same machine, same file, same minute, red then green), node resolved by the importer and
produced a path nobody had ever written.

The repair is not to correct that one line -- **a path that only resolves inside some loader's fallback
will come back the same way next round**. `scripts-are-classified.test.ts` already had a regular
expression reading `from '…/scripts/x.mjs'` to keep tests from importing a gate; it was widened to read
the whole specifier, so the same reader gained a second question: does this specifier, resolved against
the file that writes it, land on a real file.

Its first run reported **two**, and both were prose: the guard's own doc comment spells the shape out,
and a control case quotes it inside a string. A guard that goes red on its own comment gets deleted, so
the scan strips comments first (`//` must follow whitespace, so `http://` inside a string is not read as
a comment opening), and those three cases are written as control assertions. The single offender it then
reported was the line in the real file, and putting that line back to the wrong spelling makes it name it
again.

| reading | result |
| --- | --- |
| every `scripts/*.mjs` specifier in the tree | **42**, all landing on a real file |
| before the repair | 1 landing in `packages/scripts/` -- a directory that does not exist |
| the same specifier as an external dependency | node resolves by importer → `ERR_MODULE_NOT_FOUND` |

The shape of this is worth recording: **red once, green once, same file**. Read only through the later
green, it is "the machine stuttered". The usable clue was the sentence the error printed -- it named a
path nobody had written. The difference between a real defect and a stutter is often just whether the
path in the error message exists.

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
