## Closed

- O-053 · ~~**The corpus can afford to lose none of the four cases that earn its hardest level.**~~ The ratchet
  used to say one, and that unit was the case claiming `L4` over a single hop (findings 494 and 495).
  Read over the chains the gate now uses: four of thirty-three is 0.121 and three of thirty-two is 0.094,
  so the margin is `0.021` against a case worth `0.030`. A fifth earned `L4` -- a chain of three steps,
  not a relabel -- puts it at five of thirty-four (0.147), which is the first size where losing one holds.
  ~~`[open: annotate or add a case whose chain is three hops deep, and measure what the denominator should
  be rather than inheriting 0.1 from a corpus three times smaller]`~~ **Closed by v3.78**, which is the
  case and the measurement. `history-queue-duplicate-publish-ingest-writer`
  carries a three-step chain -- container, pod, service, and out to the topic -- so the earned count is
  **five of thirty-four (0.147)**; the denominator is measured rather than inherited, because the test
  derives the size at which the same numerator stops working (`floor(5 / 0.1) + 1 = 51`) instead of
  quoting the tenth, and asserts that any **one** earned case may be dropped (four of thirty-three, 0.121)
  while no two may (three of thirty-two, 0.094). The knife edge is the thing that closed: before it, a
  single edit shortening one chain put the corpus below the floor the corpus publishes.

- O-054 · ~~**The weekly job's sentence has still not been read, and v3.75 did not deliver it.**~~ The dispatch
  it was fixed for printed `shape=1` twice and nothing else: the sentence was built and pushed onto the
  epilogue's list, which that run never reached (finding 497). v3.76 put it on the case's own line.
  ~~`[open: the first `ROUNDTRIP FAIL … shape=` line that carries a check id]`~~ **Closed by v3.79**,
  which read two of them from run `42674673341`. The check id is `data-csv-time`: cases
  `2/270` and `14/270` (`checkoutservice_cpu/2` and `checkoutservice_mem/2`) fail with *"the table's
  first instant is '0' and the injection time is '1708475361', which have to be on the same clock"* --
  two cases out of 270, and a corpus shape rather than an export defect -- half right, and
  v3.85 measured which half (finding 523): the corpus does have rows with no clock (256 of them in
  `checkoutservice_cpu/2`), and the export filing them at 1970 was the reader's invention, not the
  corpus's shape. The other 168 failures carry
  the id `modalities` with no sentence after it, which is a second-order version of the same complaint:
  their reason is the `ROUNDTRIP MODALITY` line above, so the case line says *which* check failed and
  nothing about *why*. What the round did with the answer is finding 505's subject: the two readings
  that would have made the run legible were both written after the loop.

- O-055 · ~~**The heap this corpus needs is measured now, and the number was wrong.~~ Closed by a run that
  finished (finding 511's rewrite, and `ROUNDTRIP cost` from run `43085008634`).** The job was sized at
  7168 MB from 17 MB of heap per MB of CSV, taken on a synthetic case in the corpus's own shape. Run
  `42674673341` reached **6,960 MB of it (96%) at case 182** -- the first TrainTicket case, 1,433,140
  spans against SockShop's 95,000 -- and V8 killed it. The largest case before that was 4,100 MB at
  case 54, so the curve is flat at 4.1 GB for 180 cases and then leaves the budget in one step. v3.79
  raised the declaration to 12288 and moved the refusal to where it fires while the process is alive
  (finding 504). The dispatch of 2026-11-11 finished all 270 cases instead of dying at 182:
  `ROUNDTRIP cost 270 case(s) in 151.6 min; largest 8075 MB of
  the 12336 MB this run was given (65%) at RE2-TT/ts-route-service_mem/3; slowest 120.5 s at
  RE2-TT/ts-train-service_loss/1`. The peak the modality comparison needs is that 8,075 MB, and it is
  measured rather than extrapolated: v3.81's rewrite of the comparison (finding 511) took the pair of
  tables from 1,925 bytes a row to 98, so the 1,433,140-span case that used to end the run now fits
  with a third of the budget to spare.

- O-056 · ~~**`RE2-TT`'s tables and SockShop's log header are still unmeasured, and the reason was
  placement.~~ Closed by the same dispatch, and the answer was not the one the entry predicted
  (finding 521).** TrainTicket starts at case 182 and the one run that reached it died there, so the
  census line that would have said what TrainTicket ships was never printed -- it was written in the
  epilogue, after a loop that did not finish (finding 505). The line now prints before the first case,
  from the walk's file set, so the next dispatch reads it whether or not it survives TrainTicket.
  `ROUNDTRIP CENSUS modalities` reads `RE2-SS: logs 90/90, traces 0/90` and `RE2-TT: logs 90/90,
  traces 90/90`, and the *comparison* then failed 244 cases with `the corpus's logs table has no
  'cluster_id' column`. SockShop's "nine columns" was an inheritance from RE2-OB and it was false:
  `RE2-SS/carts_cpu/1` writes seven, and so do 64 of Online Boutique's 90 -- two directories of the
  same service eleven apart, one nine-column and one seven. A planned `not-carried` column the corpus
  does not have is a reading now, with its own field and a per-slice census line, and the entry's
  question is answered by the archive rather than by a run.

- O-057 · **~~The modality comparison holds two maps of every row's signature.~~ Closed at v3.81 by measuring
  it and replacing the shape (finding 511).** The two maps were the mechanism: 1,925 bytes per row on
  the same probe, 734.4 MB at 400,000 rows, and the comparison is what 168 of one run's 270 failures
  were about. It now walks both tables through one generator (`delimitedRows`, the same state machine
  `parseDelimited` wraps), keeps one sorted array of signatures per side, and drops every row: **37.2
  MB at 400,000 rows** (98 bytes/row) and **313.8 MB at the 1,433,140 rows of
  `RE2-TT/ts-auth-service_cpu/1`** -- the case the run died on. The old shape was not run at that
  size, because 19.7x per row is 2.76 GB and the machine has to stay usable; the extrapolation says
  so. The reading comes from `probe:modality-memory`, which names the module it measured and is
  driven by four tests. What remains is not this entry: it is the dispatch that would carry a
  TrainTicket case to the end of 270, which is the round trip's entry and not the comparison's.

- O-058 · ~~**The level a case claims still reaches both exports, and the note that defends it does not.**~~ The
  distribution gate stopped reading claims in v3.74, so a corpus can no longer meet its tenth by
  relabelling; `difficultyFor` still projects `FaultCase.difficulty`, so the case with a one-hop chain
  ships to `cloudopsbench` as `hard` and to `itbench` as `scenario_complexity: hard` beside three-hop
  chains. The note is deliberately not assembled into a bundle, because it is a paragraph of the answer
  -- which leaves the projection with no defence attached.
  ~~`[open: a projection that carries the floor beside the claim, or a consumer-facing field that says the
  level is a claim rather than a measurement]`~~
  **Closed by finding 553**, which is the first of the two alternatives: `difficulty_floor` beside
  `difficulty`, `scenario_complexity_floor` beside `scenario_complexity`, both from one
  `projectDifficulty` that takes the case *and the graph*, because a floor computed without one is `L1`
  for every case. The floor could travel where the note cannot, for a reason that is checkable rather
  than argued: the file it lands in already carries the answer. **Six of thirty-four** cases print two
  different words, and the example bundle is one of them, so the contract page shows the pair rather
  than describing it.

- O-059 · ~~**The worker count decides the stall verdict, and it was chosen by memory alone.**~~ **Closed by finding
  532, which measured it at four widths.** `workerCount()` reads the CPUs the process may use and a ceiling
  measured on the container's memory; nothing in it consulted the one measurement that turned the suite red.
  Measured then on a five-CPU box: **2 workers -> worst file 14,448 ms** and 153 s of wall clock; **4 workers
  -> 23,897 / 43,895 / 47,727 ms** and 91-99 s. v3.89 ran the whole suite at 2 / 4 / 6 / 8 workers, ten times
  over: the worst file held the loop **14.4 / 14.8 / 24.1 / 39.9 s -- 32 / 33 / 54 / 89%** of the 45,000 ms
  budget -- and the wall clock was **174 / 109 / 108 / 113 s**, so the count the formula produces here (3) is
  at a third of the budget and nothing above 4 buys a second. The ceiling of 8 is the memory's, and it is
  admissible because it is unreachable below nine CPUs; what was wrong was reading the allowance from one
  cgroup layout while using it on both, and 532 is that repair.


- O-060 · ~~**The timeout table cannot discover a row it does not have.**~~ **Closed by finding 538, which read the
  two numbers the pipeline was already holding.** `timeout-budget.test.ts` checked every row it held and
  could not find a new one: v3.89 found four files at 38-94% of a 5,000 ms default that had never declared
  a budget, by running the suite at four widths and reading vitest's JSON report -- two of them red at 6
  and 8 workers. The repair is not a better table. `test:coverage` already writes a per-test `duration`
  for all 6 545 tests and each file already states its budget in one of four spellings, so the reader
  needed no measurement, only a place where the two meet: `scripts/check-test-budgets.mjs` refuses a test
  past **half** the budget its file states, and a test at or above a fifth of the default when the file
  states none. Its first run named `gates-are-testable-is-enumerated.test.ts` -- slowest test 1 015 ms,
  no budget, the shape of all three rows that arrived by red run -- and the 216 files that state nothing
  have every test under 100 ms, which is what makes the floor a reading rather than a style.
  ~~`[open: a reader that takes each test's share of its own budget from a run's report and refuses one past
  half of it, in a place that runs the whole suite]`~~

- O-061 · ~~**The new step's bound is a promise, not a measurement.**~~ **Closed by finding 540, in the round
  that opened it and by the first run that carried it.** `Every test's cost against the budget it declares` ran on `815e739`
  and finished inside the second it started -- and failed, naming `build-example-bundle.test.ts` at
  1 128 ms, which no local run could see (the runner has 19 files with a test at or above 1 000 ms
  against this container's 12). The fixed tree went green on `72e46b8`, `measure-ci-baseline.mjs`
  recorded that run (**1 s** against a 3-minute floor), and `golden-master/ci-declarations.json` is
  deleted. Recording it also cost something: the same run measured the gate-test battery at **231 s**,
  past half of its 7-minute bound, so that bound is **8 minutes** now -- R10's worst-day rule doing the
  job it exists for, on the day it was handed a slower one.
  ~~`[open: read its duration from the next green run, record it with measure-ci-baseline.mjs, and delete
  golden-master/ci-declarations.json]`~~

- O-062 · ~~**The next-nearest file is at 71% of the stall budget.**~~ **Closed by finding 516, and the
  question it asked had the wrong subject.** `publish.test.ts` measured 28,183 ms without
  coverage and 31,855 ms under it in the four-worker runs, against 45,000 -- and its cost is `git`
  process starts, which is the shape the config's own comment calls the scheduler's job rather than the
  file's. It is under budget in every reading taken, which is the only reason it is not a finding.
  ~~`[open: whether a file whose cost is process starts has a cheaper shape at all, or whether the honest
  answer is that the budget's lower bound is the worst of these and the number should say so]`~~
  The budget is about **the event loop**, and this file's test time was never the number it was
  asking about: measured under coverage at v3.82, the file held the loop for **61,987 ms** while
  spending **1,740 ms** of CPU. Both figures are seconds of the same file, and the difference is
  not the scheduler's to fix -- every `git` call was `spawnSync`, so the loop stood still for the
  length of each child. Repaired by awaiting the spawns (`spawnSync` -> `runChild`): blocked time
  **61,987 -> 0 ms**, test time 12,182 -> 13,690 ms. The cheaper shape exists and it is not a
  cheaper process, it is a process the loop is not waiting inside; and the wall clock it costs
  rose 1.5 s rather than fell, which is the reading the entry's last clause asked for.



- O-063 · ~~**A claimant's budget is compared and the comparison refuses nothing.**~~ **Closed by finding 527.**
  The ceiling turned out to be a rule rather than a number, and finding 528 moved the number it was
  going to be read against. `verify-sites-are-sensitive.mjs`
  reads every claimant's own `{ timeout }` and prints how many declare one and which are below the
  battery's; what it did not do was make the two agree, and **nine** of the 61 claimants furnish
  30 000 ms where the battery furnishes 120 000. The direction that costs a claim is now refused: a
  mutant run a test budget stopped proves nothing, so the basket that used to be credited as a catch
  is now its own refusal, and no declaration may be the thing that ends a run whose whole product is
  a failure. The number the entry was looking for was not the answer -- measured per test, the widest
  single test in the estate is **5 227 ms of its 30 000 (17%)**, five times the headroom the previous
  round's *"29 590 ms of the 30000 ms it is given (99%)"* implied, because that quotient divided a
  file's wall clock by a per-test ceiling.


- O-064 · ~~**A stopped run was refused with the budget that ended it, and not with the test it was inside.**~~
  The per-test durations the margin prints come from vitest's own JSON report, written for the 61
  baseline runs, and the 220 runs that must fail are not asked for one because their verdict is the
  exit code -- so a mutant that hung was refused with the budget and nothing named the test.
  **Closed by finding 544.** The name was in the run's own captured output, under the sentence the gate
  already read: vitest prints the timeout inside the block that begins with a `FAIL` line naming the
  file and the test. `hungTests` scopes the sentence to its block, so a run with an assertion in one
  test and a kill in another answers with the second, and a run that named nobody is made to say so.
  The report the entry proposed buying would have been a second copy of a fact already in memory, at
  one file per mutant run across 220 runs.

- O-065 · ~~**The workflow that found the bucketing defect has not run since the repair.**~~ **Closed at v3.97 by
  the dispatch the entry asked for: run `43776772029`, on `56b9bbc`, whose step 13 came back green.**
  It reached step 13 at `02:40:14` and finished it at `02:43:51` -- **3 m 37 s** against the 2 m 13 s the same
  script takes locally -- with the census it exists to print: `OK (25 case(s) reproduced, 83742 cell(s)
  reduced from logs.csv and equal to the corpus's own logts.csv; ... 246 case(s) bounded, not reproduced:
  the marginals of logts.csv hold no more log cell(s) than logs.csv has rows for that container, 270445
  (container, bucket) pair(s), 0 spare row(s) at the tightest over 35462054 published cell(s) against
  40008239 log row(s))`. The 63 441 refusal lines finding 545 repaired printed as zero, on the runner, after
  the fetch and the 2.5-hour round trip -- which is the part a local read cannot say.


- O-066 · ~~**The inequality compares buckets without asking whether the table is on the grid.**~~ **Closed by
  finding 547, which asks it and refuses.** A published time was read as a bucket key and floored against
  nothing while the log side floors every instant to a window, so a table on another origin was reported
  as publishing cells the container never logged -- a true sentence about the wrong subject, the shape
  finding 545 was about one step upstream. Measured over the 271 directories: **0 of 26 116** published
  rows are off the 15-second grid, which is what made the refusal safe to write; a time that is not a
  multiple of fifteen is now recorded once and refused rather than counted ninety-seven times and reported
  as a breach. A second fixture keeps it honest -- a table one window away is on the grid, is compared,
  and fails on its numbers -- and the corpus line did not move: 25 reproduced, 246 bounded, 0 refused.


- O-067 · ~~**Three rounds in this log are prose in a language the rest of it is not written in.**~~ **Closed
  by finding 546, which translated them and built the reader that would have refused them.** `v3.69`,
  `v3.83` and `v3.84` were Chinese: 43, 40 and 33 lines, headings included. Every other round is
  English, the code comments are English, and no gate read a document's language -- so the three were
  unreadable to a reader of the other 241 rounds and invisible to eighteen `docs:check` steps that read
  their counts, their citations, their boundaries and their headings. The three were rewritten against
  the record -- every number, finding reference, heading level and ledger row unchanged, 1 429 bytes
  more of English across them -- and `check-docs-language.mjs` now refuses a run of eight Han characters
  of prose anywhere in the tree, with fences, code spans and block quotes read as the quotations they
  are. Measured before: **96 lines** of Han prose across five documents. After: **zero**.

- O-068 · ~~**The tree's comments are English and nothing reads them.**~~ **Closed at v3.98 by the reader this
  entry asked for, and the measurement is the reason it was asked for.** `scripts/comment-language.mjs`
  scans 462 files and reads **23 768** comments (19 838 line, 3 930 block); **0** carry a run of eight Han
  characters outside a code span. The four shapes the entry named as a line scan's failures are fixtures,
  three of them falsified by removing the scanner's state and watching the fixture fail: with string state
  removed, `'https://<ten Han characters>'` is refused as prose; with regex state removed, `/x\/*/` opens a
  block comment that never closes and the file reports **0 comments, 0 runs, and a refusal** -- the shape
  finding 528 named, right about what it read and silent about what it could not. The witness that the
  scanner distinguished is in the census rather than in a claim: **331** comment openers sit inside a
  string, a template or a regex, across **90** files, and none of them was read as prose. The threshold and
  the code-span rule are imported from the document reader rather than copied, so the two readers share one
  definition of a citation. Two boundaries are stated rather than hidden: the workflow files are not read,
  and a run broken by a line break evades both readers.

- O-069 · ~~**The workflow files' `#` comments are read by nothing.**~~ **Closed at v3.99 by the YAML scanner this
  entry asked for, and the scanner found twelve comments on its first run that its own author had counted as
  content.** `scripts/yaml-language.mjs` reads six files and **1 167** comments from **1 215** `#` characters
  (979 line, 188 block scalar); **0** carry a run of eight Han characters outside a code span. The entry's
  three shapes are fixtures, and three more were added: a `#` glued to a word, a row indented deeper than the
  block's first row, and a block that ends at a less-indented row. Six falsifications -- one removal each, one
  red fixture each -- and one of them is the round's honest failure: the fixture for "every quote opens a
  scalar" sat inside a block scalar, so the branch under test never ran and the test asserted nothing until it
  was moved to a plain scalar with an apostrophe in it. Two readings are taken over every file: every `#` is
  classified into one of four buckets whose counts must sum to the file's characters, and every row whose first
  non-blank character is a `#` must be recorded as a comment. The second is what found the twelve --
  `official-data.yml` rows 308-314 and 467-471, comments indented deeper than their block, counted as content
  and green because the file happens to be English. The parenthesis in this entry said 1 172 marks; that was a
  line count, and the character count is 1 215.

- O-070 · ~~**A run broken by a line break evades all three language readers.**~~ **Closed at v3.100 by the decision
  this entry said it needed: the unit is the paragraph.** Each surface says what one is -- a markdown paragraph
  ends at a blank row, a heading, a fence and a block quote; a comment's paragraph ends at a blank row, including
  the doc block's row that carries nothing but its ` *`; and two comments continue each other when they sit on
  consecutive rows in the same column of the same delimiter. Two rows of one paragraph are joined with nothing
  between them, which is the rule "a break between two Han characters is not a break" rather than an
  approximation of it, and a property test over 400 seeded sequences compares the two formulations. Measured
  before the rule was written, twice: **0** row breaks in this tree fall between two Han characters, stripped or
  raw, so the widening costs nothing today and its whole proof is in the fixtures. **68 891** breaks are held
  inside a paragraph and **0** of them is a crossing. Twelve falsifications, one red fixture each; one of the
  twelve came back green at first because the fixture put the block quote after a blank row, so the flush under
  test was unreachable -- rebuilt, and red. Three defects fell out of the fixtures: the space a `//` leaves at
  the break, `kind` meaning two different things in the two scanners (now an explicit `family` of delimiter and
  column), and a spread append the guard refused.

- O-071 · ~~**A hard break written as a trailing backslash is one paragraph to CommonMark and two to this reader.**~~
  **Closed at v3.101 by deciding it per surface, which is one more decision than the entry expected.** The
  backslash is punctuation to a renderer and text to a comment, so the same bytes mean opposite things: the
  document reader now drops a row's last backslash when it is exactly one and not itself escaped, and the two
  comment readers do not know the marker exists -- a `// …\` line ends in a backslash and that backslash stands
  between the rows. `\\` is a literal backslash and holds the rows apart, three or more leave a literal backslash
  behind, and `\ ` is not a break at all, which is why the marker is looked for before the row is trimmed. One
  row in this tree ends in a backslash and it is a fragment left by removing a span, so the rule costs nothing
  today; the proof is eight shapes in a table, each in both directions, and six falsifications. The round also
  found and closed the defect the fragment pointed at: a citation deleted outright joined the two halves of the
  word around it, so a removal now leaves a gap -- **965** spans in **873** rows have a word on both sides and
  **0** have Han on both sides.


- O-072 · ~~**The scanner's fidelity to the quote characters is a claim no test can prove.**~~ The item asked for a fixture
  or a census. The census came first and answered differently than either: the tree holds **0** files with a `/`
  immediately after a closed literal, and the reason the mutation survived is that nothing reads the emitted
  quotes at all -- v3.104 replaced the rescanning lookbehind with carried state, and from that commit on the
  characters were decoration. **Closed by finding 560**, which deletes the fidelity rather than testing it: the
  literal is blanked whole and the rule that a value cannot be followed by a pattern is now pinned by a fixture
  (`const ratio = "a" / 2;` above a budget, a file no compiler accepts and no lexer can misread).


- O-073 · ~~**`verify:local` can still print `OK` over a tree it no longer describes.**~~ The entry asked for a reader that
  fails the run without adding a site, and named the shape it would take: the failure report is already a pure
  function, so a reason can be printed where the others are, from the exit they use. **Closed by finding 563.**
  `treeMoved` is now one predicate with two readers, the decision states *which* kind of withholding it is
  (`starting-tree` / `subset` / `moved`) so the verdict is not a parse of a sentence, and `runVerdict` decides the
  word and the exit code together: a run whose tree moved prints `VOID` and exits **1** through the exit a failed step
  already uses, so the inventory gained no site. A dirty *start* is still `OK` -- that is a developer at work, and
  comparing states alone would fail every local run. Nine removals in the module are red (fifteen tests) and one in
  the gate is red (the exit becomes a zero and leaves the inventory).


- O-074 · ~~**No gate's *use of a pure decision* is proved.**~~ **Closed by finding 564.** `verify-local.mjs` gained
  `--rehearse <shape>`: the inputs a run would have produced come from a table in `gate-receipt.mjs`, and the gate
  then executes the same close-out it executes for real. `settle()` is that close-out, it computes its own
  `decision` -- a caller that computed it would leave the wiring outside the rehearsal's reach, and the wiring is
  the thing that was unobservable -- and both the rehearsal and the run call it. The expectations live in
  `gate-steps.test.ts`, so a rehearsal cannot agree with the implementation by construction, and the gate's refusal
  for an unknown name publishes the shape list so a table row added without a test is red. **Ten removals, 24 reds,
  no survivor**; the first row is the edit that was green in 207 tests four rounds ago and now costs four. One new
  site (143 -> 144, battery 228 -> 229), proved the ordinary way by the spawn that reaches it in under a second --
  finding 563's argument that a new exit is a new site was right, and it was about a branch no spawn could reach.


- O-075 · ~~**The export surface of `scripts/` is enumerated by symbol, and the reasons in its table are prose.**~~
  **Closed by finding 567.** v3.109 left nine rows whose reason was a paragraph, and this round read the nine
  bodies instead: eight never leave the process at all, and the ninth (`workflowPath`) reads `process.env` and is
  tested by setting it. All nine are taken by a test that imports them now -- four budget arms in their order, the
  modality expansion and its refusal, six rehearsal shapes and the merged pair, three workflow-path arms, the blob
  and revision readers at both layers, the pointer plan's empty commit list, six argv shapes, and the three ways a
  file reader can answer -- and the table holds **no rows**. The nine names are kept as a record the suite asserts
  against, so zero is a change with a date; and the prose was replaced by a rule the tree can read: **the body must
  cross the process boundary**, measured on the body with its comments blanked, calibrated against `workflowPath`
  (crosses) and `readBlob` (does not -- the row that stood here). `src/` and `scripts/` now answer the same
  question with the same kind of key.

- O-076 · ~~**The live list grows whatever the bound is.**~~ **Closed by finding 568**, which performed the split
  rather than estimating it again. The struck entries left `## Open` -- **48 of them, 65,544 bytes** -- and the
  index fell from **133,309 to 66,673** bytes, after which a volume could be born larger than it: twelve rounds
  moved to `volume-17.md`, **108,534 bytes** against an index of **67,407**. The closures are in
  [the record](closed.md), and the guard refuses a strike in the live list now, so this file cannot start
  carrying its own history again.

- O-077 · ~~**The heavy-fixture detector carries a second copy of the language scanner.**~~ **Closed by finding 569**,
  which measured the two scanners against each other before replacing one with the other: **219 of 248** test
  files blanked differently, every difference a template literal or a regex literal, and the heavy set was
  **unchanged** (`typecheck-entrypoint.test.ts:install` in both readings). The private four-regex version is
  gone, and four fixtures hold the shapes it got wrong.

- O-078 · ~~**The progress index has 772 bytes of room under its own volume, and the next round needs more.**~~
  **Closed by finding 568**, which moved the struck entries into a record: **48** of them, **65,544** bytes, so
  the index fell to **66,673** and a volume could be born at **108,534**. The repair is the one this entry named,
  performed as a round of its own rather than as a paragraph at the end of one.

- O-079 · ~~**An entry has no identity, so keeping the two lists apart is a rule about text.** The split's tiling --
  forty-eight closures plus twenty-eight open entries are the seventy-six the list held -- was checked once, by
  hashing each entry before and after the move, and that check is a measurement rather than a guard. A rule that
  compared the two files by identity was written and deleted in the same round because it could not be reached:
  a copy left in the live list is struck, and the live-strike refusal already catches it, so the only shape the
  copy rule could have seen was one the earlier rule had refused. What nothing catches is the accident that
  matters -- a closure pasted into the record while its live entry is edited into a different claim.
  ~~`[open: an id per entry would make the tiling a rule rather than a measurement, which is what the audit log already does with finding numbers; it is a change to every entry in both files, so it is a round of its own]`~~
  **Closed by finding 570.** Every entry of the two lists carries an id now -- `O-001` to `O-079`, three
  digits, right after the bullet -- and the two lists share one space that is dense, so a copy is one id in two
  places and a deletion is a hole in the set. The comparison this entry asks for is what the id supplies, and one
  sentence of the entry above is what the work corrected: **a copy is not caught by the live-strike refusal.** A
  document that is one residual in two places -- unstruck in the live list, struck in the record -- satisfies both
  of the split's refusals, and the guard as it stood at `176ec7b` printed `OK (2 entry(ies) ... 1 open with a
  reason, 1 closed by a finding)` over exactly that document. Measured rather than argued, and the same document
  is a fixture now. All seventy-nine entries were stamped in this round, and the tiling is a guard: the set is
  1..79 with none missing, recomputed on every run, and the next entry's number is the only number that keeps it
  that way.

- ~~O-081 · **Twenty-five records are judged by nothing, and the number has never been counted.** `roundAt` reads
  `## vX.Y` headings, and the three volumes written before rounds had numbers name their rounds `## Pass N`,
  so every `### Left open` in volumes 01 to 03 has no owner: `records` never holds it, and the arm that judges
  rows cannot reach it. They are frozen, so no round can repair them and no rule can require a repair -- which
  is why finding 577's refusal asks the **file** whether it names rounds instead of asking the record. What is
  missing is the count: the exemption is a reading of three file names, so a fourth volume of that era, or a
  record written above its round inside one of the three, would be exempt without a word.~~
  ~~`[open: an arm that reports how many records have no owner would turn the exemption into a number; it is a report rather than a refusal because the three volumes cannot be repaired]`~~
  **Closed by finding 579.** The count is printed on every run now: `217 record(s): 192 under a round and 25 under
  none; 210 round(s), 18 of them wrote none`. The first pair is this entry's number, and it is 25 -- the twenty-five
  `## Pass N` records, unchanged since the entry was written. The second pair is what the round found while
  printing it: the arm's own rule, "a round has one record", had been measured against **195**, the number of
  records the arm could see, rather than against the **210** rounds the corpus names -- and the answer held
  (no round owns two of the 217 sections) only after 22 records the guard could not read were added back. The
  exemption is still a reading of three file names and still cannot be repaired. What it is not is uncounted.

- O-083 · ~~**Eighteen rounds wrote no record, and nothing could say whether that was a choice.**
  The population line printed `210 round(s), 18 of them wrote none`, and the two shapes it covered were
  indistinguishable: `v3.70` to `v3.80` left no record for eleven consecutive rounds, `v3.103` to `v3.107` for five,
  and `v2.15` and `v2.39` for one each -- while `v3.81`, the round immediately after the eleven, wrote its record
  under a name the guard did not read. A round with nothing left open and a round whose record was filed somewhere
  else produced the same number, which is what made this a reading rather than a defect: the counting was the
  repair, and the deciding was what was left.~~
  ~~`[open: a round that leaves nothing open could say so in its own body, in one sentence, and then an absence would be a choice; nothing in the corpus writes one, so the rule would have to be written against the newest round and applied backwards]`~~
  **Closed by finding 587.** The eighteen were seventeen, and one of them was not a round that wrote nothing: the
  addendum's count was a subtraction of headings from names (finding 585), and `v2.15`'s addendum wrote
  `### Not fixed here` -- two entries with reasons, under a name the table did not hold and in the form the body
  rule of v3.115 did not read (finding 586). The entry's premise does not survive the seventeen: asked what their
  own ledgers say, **eleven** of them opened at least one entry in the live list, so the record is missing rather
  than empty; **one** (`v3.78`) says it closed a hole "in this same round rather than filed", which is the only
  sentence in the corpus that supports the neutral reading; and **five** say nothing about the list at all. The
  corpus can say, and eleven of seventeen say the opposite of what the line implied. What replaces the entry is
  narrower: the arm cannot see what a round **changed**, so the rule it would take is one the corpus cannot hold
  (`O-084`).

- O-093 · ~~**`batteries` holds 108 minutes of step bounds inside a 25 minute ceiling.**~~ `R6` was the only
  rule about a job's budget and it refused a **narrower** one, so nothing asked whether the bounds inside a
  ceiling could fire before the ceiling does -- and the entry's own answer, a comparison of a ceiling with the
  sum of the bounds inside it, was measured in v3.123 and refused: six preparation steps carry a three-minute
  floor each, so every job in the workflow holds at least **21** minutes of bounds, including the two whose
  whole day is under a minute, and a ceiling sized to hold them would be twenty times the day it bounds.
  ~~`[open: the repair is another job split, which is what the same arithmetic said once before when it moved
  the batteries from 30 minutes to 25 -- and the rule that would say so is a comparison of a ceiling with a
  sum, which no round has written because every existing job would fail it]`~~
  **Closed by finding 605**, which is the rule that can be written instead: a ceiling has to hold twice its
  job's slowest recorded **day**, the same multiple `R4` and `R10` already demand of a step bound, read from
  one reading rather than from a composite of ten -- `verify` **18** min over **601** s (**1.80x**),
  `batteries` **25** over **1 012** s (**1.48x**) and `batteries-heavy` **27** over **921** s (**1.76x**)
  were under it, and the three are **21** / **34** / **31** now. `batteries` is the one that moves against a
  recorded decision: v3.121 lowered it from 30 to 25 on the argument that a budget has to hold the bounds of
  its own steps, and that argument is the one finding 604 refuses. The sum is still printed, per job now
  (**finding 604**): `bounds total 327 min in 8 ceiling(s)`, the closest ceiling named with the day it was
  measured against. What the closure leaves behind is the day between twice the slowest and the sum, which is
  `O-095`.
