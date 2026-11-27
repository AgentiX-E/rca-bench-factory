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

- O-091 · ~~**The summaries of the other gates name their nouns, and nothing compares them.**~~ The entry said
  the nine remaining guards "print counts under nouns no other guard shares". Measured by the gate it asked
  for, the first half is false: **9 nouns are printed by two or more gates** -- `file(s)` 4, `row(s)` 4,
  `run(s)` 4, `row break(s)` 3, `addendum(s)`, `comment(s)`, `reading(s)`, `round(s)` and `volume(s)` 2 each --
  and three of the four nouns the entry named are among them. The second half was the whole finding, and it is
  finding 607: `8 row(s)` is printed by `check-fault-cases` for a case's pre-injection window and by
  `check-repository-table` for the rows under `## Repository`, both right, four lines apart in one log and
  indistinguishable from one number printed twice.
  ~~`[open: the census stopped at the pair because those two printed the same word, and a rule over the others
  needs a vocabulary of units first -- no round has measured which of those nouns are ambiguous, and a rule
  invented before its measurement is the shape finding 585 repaired twice]`~~
  **Closed by finding 607**, and by finding 606 for the one relation that is arithmetic: `check-unit-nouns` is the reader the entry asked for -- it derives the
  census from the eighteen gates, prints the shared nouns and the coincidences, and holds the vocabulary in
  `golden-master/unit-nouns.json` with which two gates print one number, and no counts. The one noun whose
  relation is arithmetic got it (finding 606): `67 of the 474 file(s) the source walk reads`, with the
  denominator derived and rule 6 refusing to print an `of` whose inclusion has stopped holding. What the
  closure leaves behind is the relations the census names but does not compute, which is `O-096`.

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

- O-095 · ~~**The ceiling is twice the slowest day, and a day slower than that still dies unnamed.**~~
  `R12` refused a ceiling under twice a job's slowest recorded day, and said nothing about the space between twice
  that day and the sum of the bounds inside the job: `batteries` held **83** minutes of step bounds in a **34**-minute
  ceiling. The entry weighed two failures and refused both -- the job's death, which names nothing, and a ceiling
  inflated until it cannot fire, which names nothing either -- because v3.123 had already measured the sum and
  refused it on the ground that a ceiling which cannot fire is the same defect as a bound which cannot.
  **Closed by finding 619.** The symmetry does not hold, and the measurement is what breaks it: each bound is twice
  the slowest reading of **its own** step, taken from whichever day had it, so the bounds describe a composite day
  rather than any day -- **41.5** minutes for `batteries`, 1.22 times the ceiling meant to hold it. A bound that
  cannot fire has nothing behind it; a ceiling that cannot fire has every step's bound behind it, so the ceiling is
  the one number in a job whose job is not to name anything. `R13` is one comparison with two terms and a stated
  winner -- `max(2 x the slowest day, the bounds + 2 x the seconds no step spends)` -- the overhead is measured by
  the recorder rather than stated (`total`, **3-8** s per job, refused when absent), `R5` is deleted because
  `bound + prefix` is at most the sum, and the six ceilings move to **58 / 49 / 47 / 44 / 84 / 55**. Four mutations,
  **24** reds. What the closure leaves is the number the ceiling is now made of: **42** of `batteries`' 84 minutes
  are fourteen three-minute floors on steps that measure seconds, which is `O-100`.

- O-096 · ~~**The census names the populations; it computes almost none of the relations between them.**~~
  `check-unit-nouns` printed **53** unit nouns in **69** gate/noun pairs (the numbers of the round it was written
  in; the tree holds **54** and **70**, because a round was written between the measurement and the reading) and
  named the **9** that more than one gate prints, with the **3** counts that coincide. What it did not compute was
  whether those populations overlap: `file(s)` has an `of` only because `check-doc-counts` derives its
  denominator from `sourcesIn`, and `row(s)` -- four gates, the numbers **9**, **318**, **1**, **8** and **8** --
  had no relation at all. `volume(s)` was the sharpest case the census named without answering: **14** volumes in
  `check-audit-volumes` and **18** in `check-progress-volumes`, two lines apart in one log, disjoint by directory
  and nothing on the page saying so.
  **Closed by finding 609 and by finding 611**, which are the two halves of "the census named them and printed nothing":
  the summary printed `volume(s) by 2` -- the gates, never their numbers -- and it now prints a line per shared
  noun holding every gate's number with the qualifier that number carried, the fact that a count two gates print
  agrees, and the relation a person wrote. The relation is required of all nine rather than of the three whose
  counts happen to be equal, which is strictly stronger than what the entry asked for; `coincidences` left the
  inventory because the three were a special case of the nine. Two things the entry could not have known:
  `round(s)` -- one of its nine -- carried **no count at all** in either gate, because the qualifier finding 600's
  repair inserted is a wall the reader could not see past, so `219` against `219` was unreachable and became the
  census's **fourth** coincidence the moment it was read; and three uses whose number the reader could not see
  (`budget(s)`, `scope(s)`, `enum call(s)`) were dropped in silence, so the headline counted what it happened to
  read. What the closure leaves behind is the sentence itself: the relation is written by a person and the census
  holds no sets to contradict it, which is `O-097`.

- O-097 · ~~**The relation a shared noun carries is a sentence, and the census cannot contradict it.**~~
  Nine nouns are printed by more than one gate and each carried a `relation` a person wrote: `volume(s)` was two
  disjoint directories, `row(s)` four tables, `addendum(s)` one population read twice. Every one of those is a
  claim about a set, and the census held no sets -- it held summaries -- so a relation that had stopped being true
  stayed printed, and `--write` preserved it by design. `file(s)` was the sharpest case: four gates walking four
  corpora, one of which (`check-citations`) still reads its own directory rather than a data module, so `474` and
  `474` agreed by a shared reader and `37` and `6` agreed with nothing.
  **Closed by finding 616 and by finding 617**, which are the two halves of "a sentence is not something a run can
  hold". A noun's gates are now **partitioned into populations** -- a group of two is the claim that those two read
  one set -- and the census checks it, because such a claim has a consequence in numbers: the two must have a
  count in common or the run is refused. That is what the entry asked for and priced at four gates: `disjoint` is
  derived rather than asserted (a noun whose gates fall into more than one group is not one population), and a
  contradictory relation is refused, but the partition is a list of gate names rather than the sets themselves, so
  nothing holds 32 000 row breaks. Three of the nine nouns carry a group of two, so **three of the four coinciding
  counts are checked instead of assumed**; the fourth, `8 row(s)`, is printed as the corpus it is. The first
  partition written under the rule was refused by it -- `14 and 18 volume(s)` declared one set -- which is the
  round's own mistake caught by the round's own field. Two of the nine sentences turned out to be false in
  opposite directions: one claimed a shared reader (`populationsOf`) that `check-open-list` does not import, one
  denied the forcing it had just described, and both were conclusions the reader had to take on trust because the
  gate checked only that a sentence existed. What the closure leaves behind is the label of a population that
  holds one gate: nineteen of the twenty-two, where the partition says nothing the gate's name did not, and the
  sentence that would say it is the line the census throws away, which is `O-098`.

- O-098 · ~~**A population of one is a label nobody has to write, and the census throws the gate's own line away.**~~
  Twenty-two populations are declared over the nine shared nouns and nineteen of them hold a single gate, so the
  partition says nothing a reader could not read off the gate's name: what `check-l4-status`'s `9 row(s)` counts is
  in the sentence beside it, not in `populations`. And the census read the line the number came from and kept only
  the count and its qualifier, so the one sentence that says what a gate counts was the sentence it discarded.
  **Closed by finding 620**, which measured both homes the entry offered and found a third answer. The gate's line
  cannot be the label: behind the nineteen populations sit **20** uses, the words after the noun are **empty in 8**
  of them because the corpus writes `474 file(s), 21676 comment(s)`, and **2** are half a parenthesis (`(21676
  line`). A sentence per gate would be nineteen sentences restating what one already says, because **eight of the
  nine** relations name every population their noun is partitioned into and in the order the census prints them. So
  the label stays in the relation -- and the round's rule is the same rule from the other side: a relation may state
  a figure only when a gate printed it under that noun. That rule is what the round was actually about, because
  reading the sentences for numerals is how the entry's own neighbourhood turned out to hold a false one:
  `comment(s)` said the smaller corpus was **4.7 per cent** of the larger, and the two counts make **4.842**.
- O-099 · ~~**A gate joining a noun discards a sentence that is still true, and `round(s)` pays it twice a round.**~~
  `check-ci-budget` prints `N round(s)` while the ledger is behind and stops when it catches up, so the noun's gate
  set moves in and out inside one round: **69 -> 70 -> 69** gate/noun pairs across v3.127, and a judgement keyed by
  the noun **and its gates** was dropped and refused at each move. The rule behind the key was right -- a partition
  drawn around four gates says nothing about a fifth -- and it was applied to the wrong half of the judgement: a
  sentence saying why two gates share a word does not stop being true when a third starts printing it. The record
  was also stored on `shared`, which is derived, so a noun printed by one gate would have taken its sentence with it
  under any key; the key was only half of the repair.
  **Closed by finding 618.** The judgement is keyed by the noun alone and stored on the noun's entry in `nouns`, so
  a noun that leaves `shared` for a round keeps its sentence and the round it comes back is green without anybody
  retyping it. A gate that joins is refused as unplaced -- `round(s) (check-ci-budget is in no population)` -- while
  the sentence stands as written. And the six readers that had been asking the partition for the gates, and being
  answered out of `judgement.gates`, now take the set the census found through `stateOf`; that was the half that had
  been invisible since finding 616, because every reader was comparing the record with itself.
  What the closure leaves is the risk the entry named, and it is answered rather than removed: a sentence about four
  gates cannot silently cover five, because the fifth is refused -- but a sentence whose *wording* has stopped
  matching a partition that has grown is still found by reading rather than by running.

- O-100 · ~~**Half of every ceiling is the floor, not the work.**~~
  `R13` held a ceiling to the bounds inside the job, and the bounds were floored at three minutes each: `batteries`
  needed **84** minutes and **42** of them were fourteen steps bounded at the floor that measured seconds, while
  `verify` needed **58** and **24** of them the same floor counted six times over the preparation every job
  repeats. The floor is an argument about a cold package index, and it was written per step, so a job that repeated
  six preparation steps paid it six times and the ceiling inherited the sum. **Closed by finding 622**, which
  measured both figures rather than trusting them -- **48** of `batteries`' **84** and **27** of `verify`'s **58**,
  because two steps had been added since the entry was written -- and found the four steps of the floor to be the
  same four in every job: the checkout, the two setups and the install. The floor is now a property of the **job**,
  spent once as `PREFIX_MINUTES` over the prefix those four steps form, a work step is bounded by twice its own day,
  and a cold day is refused by the allowance, `R12`'s twice-the-day term and `R13`'s sum.
- O-101 · ~~**The live list states counts too, and the round that checked the census's sentences left its own
  list unread.**~~ `O-019` said `docs/acceptance.md` "is 96 KB and grows by clause per round" and the file was
  **165,067 bytes** -- so the entry arguing a document is too big was quoting a size too small, and thirty-odd
  entries state figures of their own with no reader. **Closed by finding 621**, which measured all nine figures
  in `## Open` that carry a unit a commit can take again: **six of the seven** the reader reaches are wrong, the
  worst being `O-019`'s own evidence -- the per-round clauses it leaned on are **897 lines** and **77,180 bytes**
  against the **139** and **11,139** it stated. The two costs the entry named were both wrong: the rule is not a
  reader per shape but **one** reader over the four units a commit can take again (`bytes`, `KB`, `MB`, `lines`),
  and it is not a rule that a limit states none but **say when, or be this tree's** -- a dated figure is a record,
  and a record does not age. `439 s` and `84 minutes` pass because no gate can take a run that is over, which is
  the boundary the module states rather than a gap it leaves.

- O-102 · ~~**The allowance is three minutes, and no recording says whether that is right.**~~
  Every ceiling holds one `PREFIX_MINUTES` for the job's prefix, and the number was the floor spent once:
  **3** minutes over **32** steps in **8** jobs at v3.132. The argument for it was the one the floor always
  had -- a cold package index, a missed cache, a first build -- and every recording it could be checked
  against was warm: run `45054272460` spent **5 s** on the four setup steps of `verify` and **12 s** on
  `sensitivity`'s. **Closed by finding 624**, which gave the argument the one thing it was missing: a floor
  the recordings can refuse. `R15` refuses an allowance under twice the slowest **whole** prefix any
  recording holds -- **14 s** in `backend` of run `45033355331`, so the three minutes are **12.9x** it and
  the rule binds at 90 seconds -- and a row that measured only part of the prefix is skipped rather than
  summed, because a sum with a hole in it is small, defensible and wrong. What the entry asked for and did
  not get is a measurement of the cold state: no run in this repository has recorded one, which is why the
  rule is a lower bound rather than a derivation and why the summary prints the multiple beside the number.


- O-103 · ~~**A snapshot taken mid-round is indistinguishable from one taken at the end.**~~
  `measure-doc-counts --write-doc` spawns the suite and writes what it finds, so the golden records
  the suite **as it stands** at that moment: v3.132 took the snapshot with eight of its nine new cases
  written and published **6,843** against a tree that ended at **6,844**, and v3.131 wrote its row
  before `git add` and published **672** tracked files against the checkout's **675**.
  ~~`[open: whether a write can know that it is the round's last act -- the ordering is a discipline
  today, and the reader that catches a violation is a full local run rather than a refusal at the
  moment of writing]`~~
  **Closed by finding 630**, which answers the question by denying its premise: *"the tree will not
  change after this"* is a claim about the future, so no writer can hold it, and what can be checked is
  the tree rather than the writer's clock. `measure-doc-counts --check` re-derives the three scopes --
  by spawning the suite, or from the coverage run's reports with `--from` -- and refuses a snapshot one
  test off; it is step **6** of `verify:local`, immediately after the step that writes the reports, and
  the same step in CI. The discipline is therefore *read after the last edit* rather than *write last*.
  The residual the entry did not name -- `docs:check` compares two files and is green on a stale pair --
  is `O-110`, and the round found the matching defect in a marker: a previous round's rows written
  `(as of this commit)` had to be dated, not renumbered.

- O-104 · ~~**`round(s)` has three readers and only two of them count a population.**~~ The third
  states how far the ledger's newest row sits from the newest round, and the partition had no word for
  a number that is not a count of its noun, so it was written `[["check-ci-budget"]]` -- a population of
  one reader, the same shape as a corpus. ~~`[open: whether a distance belongs in the census at all, and
  which sentence would decide it -- the noun's population is rounds, and the distance between two of
  them is not a member of it]`~~ **Closed by v3.135**, which answered both halves: a distance belongs in
  the census (dropping a number the reader read is finding 611), and not in a population. `separate` is
  the third placement -- a gate and the sentence that says what it measures instead -- and it is
  refused without the sentence, outside the noun, beside a population, or twice. The census's own line
  now reads `0 in check-ci-budget (declared separate: how far the ledger's newest row sits from the
  newest round ...)`, and its summary accounts for all **27** placements rather than only the 6 that
  sit in a population two gates read (finding 626).

- O-106 · ~~**Twenty of the census's 27 placements are a corpus one gate reads, and nothing asks whether
  two of them are one set.**~~ The three questions in that sentence had one answer between them, and it
  was not a refusal and not a fifth placement: `coincidencesOf` classified an equality by whether one
  declared population held the gates that print it, which is a partition of two, and the corpus has
  three facts -- held together by a population (a rule, and `disagreementsOf` checks it), held apart by
  declared ones (a **size**, and nothing is broken when it moves), and unplaced by any (the only
  equality that is evidence). ~~`[open: whether a coincidence between two populations of one is a fact
  the census can refuse or a judgement only a person can make, and whether the answer is a sentence in
  the record or a fifth placement]`~~ **Closed by v3.136**, which classified rather than refused: the
  shipped record's one `apart` coincidence is `8 row(s)` in two gates the record places in populations
  of their own, on a line whose own sentence says the two tables are four tables and one word, and the
  class that has no answer -- `unplaced`, printed as `0` -- is now its own number (finding 627). What
  the entry also asked, why the `22/22` of v3.134 went out at v3.135 with nothing refusing it, is
  answered by the same clause: a size is not a claim, so a run owes the reader the class rather than a
  refusal, and the class prints at zero. The parenthesis naming a count rather than a noun is `O-107`.

- O-107 · ~~**The marker names a noun's equality without naming the count, and a noun can carry two of
  them.**~~ v3.136 gave the coincidence three classes and printed all three counts, and the parenthesis
  stayed at one sentence per noun: `8` held by one population and `9` kept apart printed
  `(a count two gates print agrees, and the record places them in different sets)`, which is true of
  the `9` and false of the `8` beside it. ~~`[open: whether the parenthesis should name the count it is
  about -- eight characters per coincidence, and a list once a noun has three -- or whether a marker
  that speaks for the noun is the right granularity precisely because the numbers line has already
  spoken for each count]`~~
  **Closed by finding 629**, on the first half: the sentence opens with its count (`at 9, ...`), so it
  is the property of exactly one number, and a noun with three coincidences prints three sentences in
  the order of the counts they name. The second half was right about the numbers line and wrong about
  the parenthesis -- the numbers line marks a forced coincidence in place, and the parenthesis was
  speaking for a different number in the same words. **Eight mutations, 31 reds**, and the two the
  round bought -- sentences reversed, and only the first printed -- are caught by the new case and by
  nothing that existed at v3.136.

- O-109 · ~~**The lint readings are two populations and the bound is sized against the slower one.**~~
  Six readings -- **307** and **334** s against **501**, **503**, **507** and **521** -- and the
  18-minute bound is 2.07x the slowest and 3.2x the fastest. Nothing printed the dispersion, so a
  bound sized at 2.07x of a bimodal reading looked like a bound with 7% of margin and behaved like
  one with 60%. ~~`[open: whether a reading whose dispersion is two cache states is a reading a bound
  can be sized from at all, and whether the fix is to print the dispersion beside the multiple -- the
  gate prints one multiple and no spread -- or to measure the cold and warm paths as two readings
  with two bounds]`~~
  **Closed by finding 631**, and the second option is not available: a step carries one
  `timeout-minutes`, so a bound that fitted only the warm state would refuse the cold day for being
  slow, which is the failure the multiple exists to prevent. The gate now prints the range beside the
  multiple, read from the same function that produces the denominator, with the two degenerate series
  named (`read once`, `every reading is the same`). The entry's premise was also weaker than the
  tree: the history holds **27** readings of `pnpm lint`, **221 s** to **521 s**, and the widest
  series behind a bound is the install step's, **16 s** to **888 s** -- which is what `2.0x` was
  really being printed against. **Eleven mutations, 47 reds.** The residues are `O-113` (only the
  tightest bound prints its series) and `O-114` (a range over the history mixes the tree with the
  runner).

- O-110 · ~~**`docs:check` cannot see the tree, and its green is read as though it could.**~~
  `check-doc-counts` compares the document with the snapshot and never spawns the suite, so a
  snapshot and the rows that quote it can be wrong *together* -- measured at v3.137, one test off,
  exit **0** against exit **1** from the reader that re-derives. That reader exists (step 6 of
  `verify:local`), but a developer who runs the gate and stops has not run it, and nothing in its
  output said so. ~~`[open: whether `docs:check` should read a `--from` report when one is present --
  the reports are written by the coverage step, so a tree that has not run coverage has none, and a
  gate whose verdict depends on whether another command was run is a gate with two meanings]`~~
  **Closed by finding 634**, and the option the entry weighed is the one that was rejected: a
  verdict whose meaning depends on whether another command was run has two meanings, and the second
  one is "green because nobody measured". What the round changed is the *sentence*, not the verdict:
  the green line now names the file it read, says it is a snapshot rather than a run, says the gate
  does not spawn the suite, and names `node scripts/measure-doc-counts.mjs --check` as the reader
  that re-derives it. `--measured` is a different read path and gets a different sentence, so the
  wrong one cannot be printed for the right reason. **Three mutations, four reds**, and two of them
  survived the first battery because every fixture passed `--measured` -- the file path had no case
  of its own until the helper could express "do not hand the counts in". The residue is the truth of
  the snapshot, which stays with `measure-doc-counts --check`.
- O-111 · ~~**A current-state row is dated only when its number moves.**~~ v3.136's three suite rows
  were written `(as of this commit)` and were still marked current a round later; what caught them
  was v3.137 adding a test. A round that edits only documents moves no count, so the older rows stay
  marked current and a reader comparing two volumes finds two rounds each claiming to be now.
  ~~`[open: whether the guard should refuse a current-state row outside the newest round -- the round
  is a heading and the newest one is derivable, but the check would then depend on where a row sits
  rather than on what it says, and the same sentence would be refused in one volume and allowed in
  another]`~~
  **Closed by finding 632**, on the first half, and the second half was the objection rather than a
  reason not to: *where a row sits* is exactly what a claim about "now" is made of, because a corpus
  has one newest round and therefore one place where the claim can be true. The guard carries the
  round with each row from the same pass that reads it, compares rounds as numbers (`v3.9` is older
  than `v3.10`), refuses a current row under an older round with the repair in its sentence ("(at
  v3.10)"), and leaves a row under no round to rule 3 -- the tree's own tables describe the tree.
  **Nine mutations, 24 reds**, two of which survived the first battery until a fixture with a
  headingless current row beside a round was added. The residue is `O-115` (a dated row's date is
  never compared with its round), and the question this does *not* answer is `O-110`.

- O-112 · ~~**A noun is in the census only on the runs where a gate's branch prints it.**~~
  `budget(s)` appears in `check-ci-budget`'s summary only when a bound was widened since the reading,
  so v3.137 widened nothing, the noun stopped being printed, and `check-unit-nouns --write` deleted
  its entry from `golden-master/unit-nouns.json` -- while v3.139 widened five ceilings and the entry
  came back. Both runs were right, and the record was rewritten twice without a decision either way:
  the inventory is a measurement of the tree rather than a vocabulary, and a noun can leave by a
  branch not being taken. ~~`[open: whether an inventory that a conditional sentence can shrink is a
  vocabulary at all -- the alternative is a list of nouns the gates *may* print, which nothing derives
  and which would then need its own reader -- and whether a deletion should be refused the way a new
  noun is, so that a branch going untaken is a decision rather than a rewrite]`~~
  **Closed by finding 637**, on the second of the two questions: a deletion is refused the way a new
  noun is, and the instrument is a `silence` sentence in the judgement list rather than a second
  vocabulary. The first question is answered by what the record now says -- it holds the nouns this
  run printed, plus the ones a person wrote a reason about -- and neither half is derived from the
  gates' source, which was the objection to the alternative. Both doors refuse the same state: a
  green run says `row(s) is no longer printed`, `--write` says the noun has no sentence about when it
  can be silent, and a noun coming back with one is `printed again` rather than `new`. **Twelve
  mutations, 24 reds** across the data module and the gate, no survivors. Findings 637 and 638. The
  residue is `O-119`: nothing asks whether the sentence is still true.

- O-113 · ~~**Only the tightest bound prints the series under it.**~~ The budget gate's summary named
  one bound out of thirty-eight, and the clause added at v3.138 gave that one its spread; every other
  bound printed nothing, so the dispersion of `pnpm lint` -- **221 s** to **521 s** -- was a number a
  reader had to compute. ~~`[open: whether the summary should print the widest series rather than the
  widest multiple -- the two are different superlatives and the one that costs ceiling room is the
  second -- and whether a gate whose output grows a clause per question should print a second line at
  all]`~~
  **Closed by finding 633**, on the second of the two superlatives and for the reason the entry
  gives: a bound is sized from the worst day, so the *headroom* over the best day is where the
  `241 min` of bounds goes, and that is the number the gate now prints. It is printed in seconds
  rather than as a multiple because four of the thirty-eight bounds bound a command read at **0 s**,
  and `bound / 0` printed as `Infinity` is finding 121 in a new place. One bound may hold both ends,
  and the clause says "the same bound" rather than printing one name twice. **Eight mutations, 34
  reds**, no survivors. The residue is `O-116`: both clauses are extremes, and the median of the
  install command's 28 readings -- **21 s**, so the bound is 86x a typical day -- is printed by
  nothing.

- O-114 · ~~**A range over the history mixes the tree's growth with the runner's variance.**~~
  `pnpm lint` runs a build, so a reading from 2026-11-06 measured a smaller suite than today's, and
  the 221 s in the range is partly a tree that no longer exists. Only a re-run of one commit would
  separate the two causes, and the history holds no such pair: every reading is of a different
  commit, which is why the noise floor has never been measured.
  ~~`[open: whether a reading of one tree should be recorded as such -- the recorder could re-read a
  commit it has already measured, and the pair would be the noise floor the range cannot give -- and
  whether a duplicated reading is a second day or a second number]`~~
  **Closed by finding 640 and finding 641**, and the pair had to be taken rather than argued: run
  `45351350110` was re-run, both attempts were recorded, and one tree measured twice differs by up to
  **151 s** on one step (`batteries-heavy / Type-miss probe battery`, 356 s -> 507 s) and by **141 s**
  on `lint` itself -- **42%** of that step, against the 300 s between its fastest and slowest reading
  over thirty-one days. **28 of the 83 steps came back identical, the median difference is 1 s, and
  the sum of the absolute differences is 1,136 s.** The gate prints the widest difference and names
  both attempts, because the answer to "a second day or a second number" is neither: it is a second
  **measurement of one tree**, which stays in the series `R10` divides by and is printed as the floor.
  Taking the pair turned up the reason it could not have been written down before -- a re-run is
  attempt 2 of one run id, and the history keyed a reading by the id, so `readReadings` refused the
  pair, `mergeReading` replaced the first attempt with the second, and the recorder could only see the
  latest attempt. The identity is `(run, attempt)` now, and an absent `attempt` is 1, so the thirty-one
  readings already in the file are unchanged. **Eight mutations and 34 reds** for the floor, **seven
  and 14** for the attempt, no survivors. The residue is `O-121`: one pair on one tree is one
  afternoon, and the bounds are still sized without it. `O-122` is the ordering the recorder still
  allows.

- O-115 · ~~**A dated row's date is not checked against the round it sits under.**~~ `(at v3.200)`
  under `## v3.138` is impossible -- a round cannot record a measurement from a round that has not
  happened -- and nothing read the pair. A probe over the corpus found **0** such rows, which is why
  the entry was opened rather than fixed: the rule would be written against a state the tree has
  never been in. ~~`[open: whether the date and the round are a pair the guard should compare -- the
  numbers comparison rule 3b uses, one field over -- or whether a dated row is by definition a claim
  about another round and only the marker is the guard's business]`~~
  **Closed by finding 635**, and the population is what made it closable: **230** table rows carry a
  date, **227** sit under a round, **3** sit outside every heading, **0** name a round past the one
  they sit under. Two comparisons, because a dated row sits in one of two places -- against its
  heading, and against the corpus's newest round when there is no heading -- and both use rule 3b's
  pair of integers, because `v3.9` is older than `v3.10`. **Five mutations, 19 reds**; the "past
  every round" branch survived the first battery, since the three headingless dated rows in the
  corpus are all legal, and the case that closes it is one heading, one round and one date after it.
  The residue is `O-117`: the date is compared with the round, and with nothing the round measured.

- O-116 · ~~**The axis a bound is measured against is printed at its two ends, and a normal day is
  nowhere on it.**~~ v3.139 gave both superlatives a sentence -- the tightest bound at `2.0x` of the
  slowest reading of its command, and the one with the most headroom above the fastest -- and both are
  extremes. The install step is the extreme in both directions: `1,800 s` of bound against readings
  that run from **16 s** to **888 s**, whose median was **21 s** while the series had 29 readings, so
  the bound was **86x** the day the command usually has and no line printed a number near the
  middle. ~~`[open: whether a middle belongs
  in a line that already prints two ends -- a median is a third superlative, and the one a capacity
  question is actually about -- and whether a median over a series that mixes a tree's growth with a
  runner's variance is a typical day or a typical state, which is `O-114`'s question one level up]`~~
  **Closed by finding 636**, on the first question and with the second handed to `O-114`: the middle
  belongs because the multiple a reader is asked to interpret belongs to a series, and `2.0x of the
  slowest` without a middle reads as a bound with no room at all. The sentence prints the interval an
  even series has rather than a number no run spent, divides by its midpoint -- the median by
  definition -- and prints no multiple over a middle of **0 s**, because six of the 44 commands are
  read at 0 s and `bound / 0` is the `Infinity` this record refuses elsewhere. A probe recomputes the
  median from `readingsOfCommand`'s own rows and finds **0** of 44 commands where the middle and the
  ends disagree. **Eight mutations, 29 reds**, no survivors. The two recordings the round took moved
  the series across the boundary twice -- 29 readings printed `at 21 s` and `86x`, 30 printed
  `between 20 s and 21 s` and `88x`, 31 printed `at 21 s` and `86x` again -- so all three shapes of
  the clause were printed by the shipped tree, not only by the fixture. The residue is `O-118`:
  thirty-seven bounds still print no typical day.
- O-117 · ~~**A dated row's date is checked against its round, and not against what that round
  measured.**~~ Rule 3c refused `(at v3.200)` under `## v3.138`, so the two tokens could not
  contradict each other -- and beyond that the number beside a date was unverifiable by construction,
  because 227 of the 228 dated rows that carry a count were that round's own publication. The second
  witness was in the corpus all along: a round states its own size twice, in its three suite rows and
  in the span of its `new tests` row (`6,921 -> 6,946, +25`), and no rule read the second. Read, over
  **74** spans in **105** rows, five of them end nowhere near the count their round published beside
  them: v3.54, v3.69, v3.89, v3.117 and v3.131. Four are one mistake -- a number that belongs to a
  **later** round -- and the reachable history says when it arrived (`docs(v3.95)`, `fix(v3.118)`,
  `docs(v3.133)`, each a later round's commit while the span was written by the round it belongs to).
  The mechanism is the repair rule 3b asks for: a round finds a current-state row under an old
  heading, dates it `(at vN)` to stop rule 3 asking, and takes a fresh measurement in the same
  breath -- so the date makes the rule stop asking and the number that arrives with the date is
  today's. All five were repaired to the round's own span, and the gate now prints the split it
  found: **70** spans end at the round's `core` count and **1** at its `repo` count, which is the
  residual `O-123` carries. **Twelve mutations, 24 reds**, no survivors after five fixture holes
  became cases; the widening that made five of the spans comparable at all is finding 644's.
  **Closed by finding 642 and finding 643**, on the question the entry asked and on the mechanism it
  guessed at: provenance in the snapshot is *not* what closes it, because the recorder that knows the
  run it measured is not the one that takes the counts -- the counts come from a local `pnpm test`,
  and the corpus's independent account of what a round measured is its own span.
- O-118 · ~~**Thirty-seven bounds still print no typical day.**~~ v3.140 gave the middle of the series
  to the tightest bound's command, because that is the multiple a reader is asked to interpret: `2.0x
  of the slowest` beside `86x` the middle. Every other bound was still described by two ends, and
  several of them are the ones a capacity question is actually about -- `pnpm lint` runs from **221 s**
  to **521 s** with a median of **373 s**, and its 14-minute bound is `1.6x` the worst day and `2.3x`
  the middle one. ~~`[open: whether the middle belongs to the tightest bound alone -- the one whose
  multiple a reader is asked to read -- or to every bound, which would make the line a table rather
  than a sentence -- and whether a middle printed for one bound is a rule or an accident of which
  bound happens to be tightest this round]`~~
  **Closed by finding 639**, on both questions and with an answer the shipped tree gave: the middle
  belongs to every bound, because it is the same question asked of each of them, and which bound got
  one was an accident -- the bound nearest a **bad** day is `backend / Install a backend this
  repository did not write` at `2.0x` (1800 s over 888 s), and the bound nearest a **usual** day is
  `batteries-heavy / Backend-support battery` at `2.4x` (900 s over 382 s). Two different bounds, so a
  figure that followed the superlative moved when an unrelated bound moved. Thirty-six of the
  thirty-eight bounds have a command whose middle is above 0 s and two divide by a middle of 0 s,
  where no multiple exists; the population is printed as its two extremes with the bound that makes
  the least one, because thirty-six middles in a line that already carries twenty clauses is the table
  the question worried about. **Twelve mutations, 20 reds**, no survivors; the one that survived the
  first pass printed a *different* sentence from the one the fixture refused, which is why the fixture
  now names both. The residue is `O-120`: the individual middles are still printed by nothing.
- O-121 · ~~**The noise floor is one pair on one tree, and every bound is sized without it.**~~
  Attempts 1 and 2 of run `45351350110` differ by up to **151 s** on one step and **141 s** on
  `lint` itself, and `R10` asks for twice the slowest day with nothing in the arithmetic about the
  machine. The entry asked two questions, and the first is arithmetic: both readings of the pair are
  readings of one command, so `movement <= max(a, b) <= slowest`, and `R10`'s `bound >= 2 x slowest`
  makes `headroom >= slowest >= movement`. **A rule that refused a headroom narrower than the
  movement can never fire on any tree whose bounds `R10` holds**, so none was added -- the round says
  so in the code and in the audit rather than shipping a rule every reader learns to skip.
  What it added is what the question was reaching for: the headroom in the movement the step has
  itself shown. **38** bounds carry their own timeout, **38** have a second reading of their own tree,
  **8** did not move at all, **0** have no movement to measure -- and the narrowest margin is
  `sensitivity / Install the shells the suite cross-checks against`, **222 s** above its slowest day
  against **99 s** of movement, which is `2.2x`. The second question is answered no: one pair is a
  floor on the movement and not an estimate of it, so the figure is printed as "the widest difference
  one pair has shown" with the pair named. The measurement also refuted a word: the widest difference
  is not the runner's variance, because the two steps that move most are the two installs (9.9x and
  1.6x) -- a package store hit against a miss. The sentence now says so, and the bound sized in one
  mode of a bimodal step is `O-126`. **Fifteen mutations, 20 reds** in this subject, no survivors
  after two fixture holes became cases.
  **Closed by finding 645**, on both halves of the question: the refusal is impossible at twice the
  day, and the margin is now measured and printed.
- O-122 · ~~**The recorder will write an attempt older than the recording, which makes the history
  refuse the tree the recorder just wrote.**~~ `--attempt 1` after `--attempt 2` was allowed: it
  rewrote the recording with the earlier measurement, the history's tail stayed on the newer one
  because the file is sorted, and `R10` refused -- correctly, with "record that run as the recording
  rather than beside it", which is what the recorder had just been asked to do. ~~`[open: whether the
  recorder should refuse to write an attempt older than the recording's -- it is a legitimate repair
  when the latest attempt was red -- and whether the recording should hold the newest attempt by
  measurement time or by attempt number]`~~
  **Closed by finding 647**, on both questions and with the second dissolved. The order a recording
  may move in is fixed by what `R10` compares: the history's **tail**, which is a maximum over the
  file, so no write of one file can move it. Moving the recording back therefore cannot be a repair
  -- the newer row would have to leave the history, and the only way to remove a row is the hand edit
  both files refuse in the same words -- and the repair the entry was reaching for is the other
  relation: the older attempt's seconds belong in the **history**, where `R10`'s denominator reads
  them, while the recording stays on the newest measurement. By measurement time and by attempt
  number are the same order, because a re-run of one tree increments `run_attempt`. The same
  comparison had a second shape: `--seed --attempt 1` of the recorded run was refused as "the
  recording", so the one measurement that is a same-tree pair -- the pair every bound's margin is now
  measured against (finding 645) -- could not be appended at all, while the history already held one
  (`45351350110`, attempts 1 and 2, 356 s then 507 s). A third shape was in the same block: a
  recording that would not parse was overwritten in silence, and it is now refused in two shapes with
  the act that fixes it, which is what the history beside it had always done. One `orderOf` answers
  the two sorts, `R10` and the recorder's three refusals, and `coordinateOf` prints the recorder's
  two report lines as well, so a recording of attempt 2 says `from run … attempt 2`. **Sixteen
  mutations, 40 reds**, no survivors, measured on the green tree. The residue is `O-127`: the
  recorder still records a run that failed, and a step that expired spends exactly its bound.
- O-126 · ~~**A bound sized in one mode of a bimodal step.**~~ The entry asked whether a step whose cost is
  dominated by a cache state should **declare** the state, so that `R10`'s denominator could be read per mode
  rather than across them. **Closed by finding 654**, and the answer is the one the entry's second candidate
  guessed: the denominator is the worst mode **by construction**, so there is nothing to declare. A declaration
  would have been a promise about a state no recording holds, which is the shape `R15` already covers for the
  cold prefix and the shape this round refused for a step: `Install the shells` is bounded at 420 s, its worst
  day is 198 s, and 420 s is 2.1x that -- without any mode being named anywhere in `ci.yml`. The half of the
  entry that asked for a list of bounds whose movement exceeds half their reading is `O-140`, because the
  summary still prints one bound's share rather than the population's.
- O-127 · ~~**The recorder records a run that failed, and a step that expired spends exactly its bound.**~~
  Nothing asked whether the run being measured succeeded, so `--attempt 2` after a red re-run wrote that
  attempt as the recording, and a step that expired had spent *exactly* its own `timeout-minutes` --
  `R4` then compared the bound with the number it had just produced and demanded twice it, so recording a
  timed-out run asked for the bound to be doubled by the run that failed inside it. ~~`[open: whether the
  recorder should refuse a conclusion other than success, or record it and say so in the file -- the
  seconds are the machine's either way, and `R10`'s denominator is the worst day rather than the
  greenest one -- and whether a step whose seconds equal its bound exactly is a reading or the bound read
  back as one]`~~
  **Closed by finding 648**, both questions answered and the asymmetry argued rather than chosen. The
  recording is refused for any run whose conclusion is not `success`, because it **describes this
  workflow** and GitHub computes a run's conclusion from its steps: a green run is one in which every step
  that ran succeeded, so the per-step question would be a branch that cannot fire. A seed **is a day the
  commands ran**, so a red day is appended with the numbers of the steps that ended on their own --
  `failure` kept, because that is what a command that ran and returned non-zero reports, and `cancelled` /
  `skipped` / no-conclusion dropped and named in the report. The second question is arithmetic rather than
  judgement: a step that ends on its own ends *before* its bound, because the bound is when the runner
  kills it, so a number equal to it is the bound read back -- and the two shapes that produce it (a kill
  whose failure was allowed to pass, a step finishing inside the last second of its allowance) are one
  number apart from each other in the report, so the recorder refuses rather than guesses. The rule is
  deliberately not `>=`: a number *above* today's bound is a run measured before the bound was tightened,
  and that act belongs to `R4`. Two smaller shapes came out of the same predicate: a skipped step was
  refused as one the job does not have, which is false about the job, and a seeded job left with nothing
  said the tree had lost its steps whatever the reason. **Twelve mutations, 17 reds**, no survivors; **19**
  fatal throws in the recorder rather than 16, **107** partitioned statements, **239** proved claims. The
  population is why this was latent: **36** runs, every one `success`, **1,394** bounded step-seconds in the
  history with **0** equal to its bound and **0** within 6 s of it, and the recording's closest step at
  **531 of 1080 s**. The residue is `O-128`, a kill inside a red seed, which the report calls `failure`
  and which the recorder cannot separate from a duration because it reads today's workflow.
- O-128 · ~~**A step killed at its own bound in a red seed enters the history as the bound it was killed
  by.**~~ `O-127` refused the recording for a run that did not succeed and kept `failure` steps in a seed, on
  the argument that `failure` is what a command that ran and returned non-zero reports. That argument holds
  for one of the two shapes the conclusion covers, and the report does not say which: a step the runner
  stopped at its own `timeout-minutes` also reports `failure`, and its seconds are the bound that was in
  force that day -- so `R10`, which divides a bound by the slowest reading of its command, would divide by a
  bound and ask for a bound twice the number the run was killed by. The two routes the entry named were
  *read `ci.yml` at the seed's `head_sha`* and *keep only `success` steps*. ~~`[open: whether the recorder
  should fetch `.github/workflows/ci.yml` at the seed's `head_sha` and compare each step's number with the
  bound in force then -- one request per seed, and a workflow from before a syntax change may not parse --
  or whether a seed should keep only `success` steps, which would lose the slowest day of the command that
  failed]`~~
  **Closed by finding 649**: the first route, and the second refused because a seed exists to keep a red
  day's numbers -- `R10`'s denominator is the worst day, not the greenest one, so keeping only `success`
  steps would silently delete the days the rule was written for. The recorder reads that day's file with the
  same line reader the gate uses, and three answers follow: at or above the bound that day states, the
  number is that bound and the step is dropped with a line naming it; a step that day bounded nowhere is
  kept, because a job timeout cancels the running step and a cancelled step is already dropped; and a day
  whose file cannot be read, or which has no such job, cannot answer, so the seed is refused rather than
  appended with a number it cannot tell from a bound. The request is made only when the run holds a step the
  API called `failure`, which a green run never does, so the price lands on the days that need it. The same
  defect had a reachable mirror: the equality check of `O-127` held **seeds** to **today's** bound, and
  refused a 720-second reading of a step today's workflow bounds at 12 minutes even when that day allowed 30.
  **Ten mutations, 30 reds**, no survivors; **20** fatal throws in the recorder rather than 19, **109**
  partitioned statements, **241** proved claims. The population is why nothing shipped changes: **38**
  readings of **37** runs, every run `success`, **3,134** step entries, **0** of them from a run that holds a
  `failure` step. The residue is `O-130`: a seed whose commit predates a syntax this reader accepts is now
  unseedable, where it would have been appended with an unrecognised bound.
- O-130 · ~~**A seed whose commit predates a syntax this reader accepts can no longer be appended at all.**
  `workflowOfThatDay` walks that day's `ci.yml` with the same strict line reader the gate uses, and a shape it
  does not recognise is a refusal (`O-128`'s repair) -- so a day from before a syntax change is unseedable,
  where `v3.145` would have appended it with a bound nobody could read. The alternative is a second,
  permissive reader for that day alone, which is a bound decided by a rule no gate enforces.~~
  ~~`[open: whether a refused day should be appended with only its `success` steps -- the route `O-128`
  refused for a day it could read, and a different proposition for one it cannot -- or whether the reader
  should return the bounds it did recognise alongside its errors, so a day is refused for the steps it
  cannot place rather than as a whole]`~~
  **Closed by finding 652**, and the answer to the entry's own question is the second: the reader returns the
  bounds it did recognise alongside its errors, so a day is refused for the steps it cannot place. The first
  route -- append the day with only its `success` steps -- was already refused at `v3.145` for a day the reader
  *can* read, and it is refused here for the same reason: the steps a seed keeps are the ones it likes, and the
  slow steps of the day are exactly the ones it would drop.
  What the entry could not see from where it stood is that the second route needs a **floor** first. The reader
  walks two ways and both left the lines they did not recognise alone, so "no refusal for this job" did not mean
  "every line of this job was understood" -- it meant "this reader did not look". Measured on the shipped
  `ci.yml`: **38** steps declare a bound of their own, and moving one of those lines one space left left the
  reader reporting **37** and saying nothing. The floor now refuses any line inside the jobs block that no rule
  consumed, at a step's indent or above, and the same file answers with one sentence naming the line and the job.
  Every scope the reader hands out is worth exactly as much as that floor.
  Two callers, two answers, and the difference is how far the doubt spreads. A seed asks one question per
  number, and both halves of it -- the command and the bound that could have stopped it -- are facts about that
  step's own lines, so a job the reader could not finish costs that job's steps and nothing else: the day still
  lands, with a line naming the job and the reader's own complaint. A recording asks whether two trees are one,
  which is a question about both, so it is refused whole -- and that refusal is also a repair, because an
  unreadable job is *absent* from the day's map, which is exactly what a job the run did not report looks like,
  and `driftOf` tolerates that on purpose. The unreadable job was the one place a drift could sit unseen.
  The floor refuses no day this project has ever recorded: `--relabel-actions` re-read **39** trees across 40
  readings under it, found **0** lines it could not place, and rewrote **0 of 3,300** rows.
  **Ten mutations, 87 reds**, no survivors; the inventory is unchanged at **146** sites across 69 scripts,
  **22 fatal / 83 unguarded / 1 guarded / 10 rethrow**, **248** proved claims -- and the one row this round moved
  is worth naming: `workflowOfThatDay`'s throw changed its sentence, the carry matches a sentence, so its proof
  was dropped rather than carried, and it was re-declared against the test that reaches it and measured again.
  A proof carried by a sentence the round had rewritten would have been a pointer nobody checked. The boundary
  the floor makes visible is `O-134`: one spelling is what the reader reads, and it now says so instead of
  misreading the others.

- O-131 · ~~**A red day's bound is looked up by step name, and a step's identity in this file is its
  command.**~~ The entry's mechanism was wrong and the defect was one level up, which is why it is closed by a
  finding rather than by the repair it named: `boundsOfThatDay` and the report it compares against **both**
  come from that day, so the bound *was* the bound of the step whose seconds were being read, and a renamed
  step did not read as "that day gave no bound" -- it read as "did not run", because the report is matched by
  name too. What was wrong is the **attribution**: the entry writes `commandOf(step)` from **today's** workflow
  beside a number that day spent, so a step that kept its name through a change of its `run:` line put today's
  command in front of another command's seconds, and `R10` then divided today's bound by a day that command
  never had. ~~`[open: whether the lookup should key on the command, which is the identity the rest of this
  file uses, or keep the name and accept the gap -- a command match would also have to decide what two steps
  of one job that ran the same command mean, and a bound is one number while a command can be run twice]`~~
  **Closed by finding 650**, and the answer to the entry's own question is *neither*: the workflow of that day
  is read for every seed, the step is placed by name and then **held to the command that name ran**, and a step
  the day cannot place or places under another command is dropped with a line naming which fact it is. The
  double-command worry the entry carried turns out to be no worry at all: the comparison is one step against
  one step of the same name, and the two-steps-one-command case never enters it.
  The same defect had a second path, and the history proved it before the repair did: of **3,134** step rows,
  **3,132** carry the command their own commit's file states and **2** do not -- runs `42131836805` (`7484b1a`)
  and `42142175689` (`89775da`) hold the **unsharded** battery's 626 s and 633 s under `--shard 1/2`, so shard
  1's slowest day in the series `R10` divides read 633 s where the slowest day a shard 1 spent is 519 s. A
  recording took its commands from whatever was on disk, and the entry has no field saying which tree a
  command came from, so the two paths were indistinguishable from their output -- which is why both are closed:
  the disk is now held to the workflow at the run's commit, in both directions, and `--borrow` is carved out
  because its job exists only on disk by construction. Both rows are corrected to the command that spent them.
  **Ten mutations, 29 reds**, no survivors; **21** fatal throws in the recorder rather than 20, **110**
  partitioned statements rather than 109, **242** proved claims rather than 241. The residue is `O-132`: a step
  with no `run:` is identified by its name, so an action's version is invisible to the comparison.
- O-132 · ~~**A step with no `run:` is identified by its name, so an action's version is invisible to the
  comparison.** `commandOf` answers `step:<name>` for a `uses:` step, and that is the identity the history
  stores and the comparison this round added reads. So `actions/checkout@v3` and `actions/checkout@v4` under one
  step name are one command to this file, and a reading of the old action enters the new action's series. The
  steps this affects are the prefix steps, which carry no bound of their own -- so no `R10` multiple divides by
  them today -- and the identity claim is nonetheless weaker than the one the rest of the file makes.~~
  ~~`[open: whether a `uses:` step should be identified by its action and version, which would give the history
  a series per version and split one step's readings across two, or keep the name and say in the file that an
  action's version is not part of a reading's identity]`~~
  **Closed by finding 651**, and the answer to the entry's own question is the first, with the second half of
  its arithmetic removed: the identity is `uses:<action@reference>`, and the version does **not** split one
  step's readings, because the **name** is not part of the identity at all. The entry framed it as a choice
  between "a series per version" and "say the version does not count", and both of those keep the name --
  the first would have made a rename lose a series, which is losing the slow day `R10` divides by, and the
  second would have said that two programs are one command. What the entry could not see from where it stood
  is that the name was the thing doing the splitting: an action's reference survives a rename, so the series
  is *longer* than it was, not shorter.
  The history proved the defect latent before the repair did: of **994** rows that named a step, across 40
  readings on 39 trees, **994** ran the action today's tree states, read from each row's own commit -- so no
  day in this repository was ever spent by another version, and no bound divides by an action's series
  (`R14` forbids a prefix step a bound of its own). The rows are still rewritten, because the reason to
  rewrite them is not the bound that would have divided badly but the reader who asks what a checkout has
  cost and would otherwise be told about the newest days only: `--relabel-actions` read 39 trees and changed
  **994 of 3,300** rows, and a second run changed **0 of 3,300**, byte for byte identical.
  The same identity reaches two more places. `sharedPrefixOf` compared a name and an empty string for every
  action step while its own docstring said "name and command both", so two jobs at two versions of one action
  shared a prefix they did not share. And the recorder now holds the tree on disk to the action version: a
  run whose step used `@v3`, recorded against a tree at `@v4`, is drift, which nothing else in this
  repository could have seen -- the step keeps its name, its position and its inputs.
  **Ten mutations, 32 reds**, no survivors; the seven new claims in the inventory (one exit, six throws) are
  7 of 7 credited by the sensitivity battery; **248** proved claims rather than 242, **116** partitioned
  throw statements rather than 110, **22** fatal rather than 21 -- the flag's refusal at the top level, with
  the mode's five inside `relabelActions`, which is the `unguarded` basket. The mode's success exit is a
  `process.exit(0)`, which is a call and not a site: `165` calls became `166`, and the inventory stayed at
  **146**.



- O-135 · ~~**A reading cannot say whether it measured a slow program or a slow machine.**~~ The entry was
  raised on the sites battery's second shard, and its own two numbers were both wrong: the shard spent **881 s**
  and not 717, and the "fastest reading of it" was **519 s** of the *first* shard's step -- one command's slow
  day compared against another command's fast one, which is `R10`'s defect in prose. Read correctly, the series
  had 40 readings: 285 s at its fastest, 481 s in the middle, 881 s at its slowest, and `R4` plus `R10` would
  have taken the 881 s for the program's cost and asked for a thirty-minute bound on a step that does the work
  in ten. **Closed by finding 653**, which took the third of the entry's own three candidates -- *the same step
  measured twice on one tree* -- because it is the only one that answers the question rather than describing
  the box: the delivery run was re-run as attempt 2 of run `45595594712`, and the second shard repeated itself
  to **880 s** while its sibling shard moved from **501 s** to **418 s** in the same window. Two attempts whose
  bytes are identical cannot differ by the tree, so the pair was read as the work -- and the two trees this
  round delivered took that reading back: the same step spent **621 s** on one and **900 s** on the other, with
  three earlier readings at 629, 635 and 636. The step has **two modes** (five readings between 600 and 636,
  three between 880 and 900) and two trees land in each, so the pair's agreement was the machine's persistence
  across forty minutes rather than the program's cost: a re-run inside one mode reproduces the mode. What closed
  the entry is the arithmetic the question forced -- a bound is a multiple of one mode and at least the worst day
  already spent, which is clause 3, and the 30 minutes shipped here is exactly twice the slow mode. What did not
  close is stated in `O-139`: nothing in the file records that a step has modes. `R14` states the rule in three clauses: a tree measured twice costs the faster attempt;
  one attempt that ran a command in two jobs costs the slower job, because that is `R10`'s mirror-hit evidence
  and the pair is the only set the minimum is taken over; and a bound is also at least the worst day the
  command has already spent, which had been doing nothing while the multiple divided the slowest reading and
  starts to matter the moment it does not. The words moved with the arithmetic -- `R4`'s "measured 351 s"
  became "the tree spent 351 s on it", `R10`'s "took 361 s in" became "cost 361 s on the slowest tree that ran
  it", each printing the other attempt in the same sentence -- because a refusal that printed only the chosen
  number would leave a reader who has seen 881 s in the file believing the gate had ignored it. What the rule
  does to this tree: both sites bounds **22 -> 30 min**, `sensitivity`'s ceiling **35 -> 43**, its shard's
  **34 -> 42**, the file's bounds **247 -> 263 min** -- with the finding underneath the reading left open as
  `O-136` and `O-137`, since the +282 s the six `v3.148` claims cost is a difference between two afternoons
  rather than a measurement. What it does not do is in `O-138`: a tree measured once is still priced from one
  afternoon. **Ten mutations, 62 reds**, no survivor, measured on the green tree.
- O-137 · ~~**The battery publishes claims, runs and wall clock, and no per-run seconds.**~~ The entry's
  evidence was a number that could not be divided: `v3.150` charged six new claims **282 s**, which was the
  difference between two afternoons rather than a measurement of the six runs, because the battery printed one
  total and the recorder only ever saw the step's clock. **Closed by finding 657**: the gate now prints one row
  per claimant before its summary -- `packages/core/test/ci-budget.test.ts -- 30 claim(s) in 30 run(s), 541.8 s
  (slowest 21.0 s)` -- with the seconds measured around each child, and a total that says how many runs it is
  made of. The number is now divisible in the direction a round needs: a claim added to a file is charged to
  that file. The same instrument produced the round's other reading, a paired one -- the 32 claimants both runs
  could measure, 125 claims and 125 runs either side, **1382.7 s -> 577.1 s (-58.3%)** -- and the shard's wall
  clock, **6.4 -> 3.1 min**, which is the first change in this campaign that moves the step's reading rather
  than the prose around it. **Four mutations, 4 reds**, no survivor.
- O-138 · ~~**A tree measured once is still priced from one afternoon.**~~ The entry was a consequence of
  `R14`: if a tree costs the faster of its attempts, then a tree measured once has no cost at all and the
  recorder's single reading stands in for it, so a contended afternoon raised every future bound for a load no
  future run had to carry. **Closed by finding 654**, which retired the premise rather than the instrument: a
  bound divides the worst day, so a reading taken on a contended box is not a mispricing -- a contended box is a
  state a run lands in, which is what the bound is for. The population the entry wanted printed is printed: the
  summary counts the pairs the history holds (two, in 44 readings) and prints the share of the tightest
  command's range that the widest of them explains. What the entry offered as the alternative -- refusing a
  reading no second attempt corroborates -- is rejected: it would double the cost of every delivery run and of
  every seed to buy a corroboration the rule no longer needs.
- O-139 · ~~**A step with two modes is one series, and nothing in the file says which mode a bound is argued
  from.**~~ The entry was raised by the round that shipped `R14`, and it asked the question that rule had
  stepped over: the sites battery's second shard reads 600--636 s in one state and 880--900 s in the other, so
  which of the two a bound should be argued from is not a detail. **Closed by finding 654**, whose falsifier is
  one test: a reconstructed `R14` returns an empty error list for a 22-minute bound (1320 s) on a command whose
  slow state is 900 s -- above twice the 621 s attempt, above the 900 s day, and called unsafe in three
  documents the same round wrote -- and `R16` returns the refusal. The rule is now one clause, a bound divides
  **the worst day the command has spent**, and 22 minutes is refused. Finding 655 is the measurement under it:
  six trees of one afternoon, **146 sites at every one of them**, so the shard's work is identical; one tree
  read twice (**881 s**, then **880 s**, one second apart forty minutes apart) so a tree repeats its own state;
  and the 621 s and the 900 s are two different commits (`b3124638` and `8fb87bcb`), so "one tree in two
  states" never happened and `R14`'s denominator changed **0 of 38** verdicts while standing ready to halve one.
  What the round could not do is record the state itself: the instrument that would is the job log, and it is
  unreachable from here (`O-141`). What it did instead is print the share of a range that a pair explains --
  `two readings of one tree timed that step 141 s apart, 44% of the 319 s between its ends` for the tightest
  bound -- so a reader of a green run can see which part of a spread is measurement and which part is a state
  nobody read twice. **Twelve mutations, 54 reds**, no survivor, measured on the green tree.
- O-145 · ~~**The two shards of `verify-gates-are-testable` are divided by position, and read 97 s against 232 s.**~~
  The entry named the artifact the missing half needed: a table of **per-gate** seconds, which the audit already
  printed per subject since finding 669. **Closed by finding 675**, which is that table and the division it enables:
  `--costs` writes `golden-master/gate-costs.json` from a run that measured every gate (69 rows, **287.5 s** here,
  dearest `check-official.mjs` at **28.4 s**, **9.9%**), and `--shard i/n` divides it by longest-processing-time first
  through the `assignShards` the sites battery has used since v3.157 -- one placement rule, not two. The entry's own
  numbers were a reading of the runner and the three readings since say the same thing in different sizes: **118 / 198 s**
  (reading 59), **149 / 239 s** (reading 60) and **146 / 241 s** (reading 61), 40.4%, 37.7% and 39.4% apart, against a
  plan whose arithmetic says 0.0%. Divided by the shipped table the pair is **143.1 s / 144.4 s -- 0.89%**, 34 and 35
  gates. The entry asked whether the price should be a gate's whole run or the arithmetic above its own suite time; the
  answer is the whole run, because the child time is what the runner spends and the suite's own seconds are one of the
  two numbers the run prints rather than a different price. It also asked whether the table should be a new file or an
  arm of `gate-sites.json`: a new file, because `gate-sites.json` is an inventory of exits and their proofs and is
  re-derived on every round, while a table of seconds is a measurement with a day and a machine on it.
  What stays open is what the sites table has had since v3.157 and this one inherits -- a table measured on one machine's
  afternoon, whose staleness is caught for the gate set and the file counts and not for a file that grew under the same
  name (`O-146`).
- O-146 · ~~**The gates' table is one machine's afternoon, and nothing notices when it stops describing the tree.**~~
  The entry asked two questions and both were answered by measurement rather than by preference. **Closed by finding
  676.** A verdict on the table's age would have to be a verdict on the value of a number the tree cannot compare: the
  file count pins the *set* of naming files, and every round moves the tree inside that set, where a one-line comment
  and a threefold growth are the same event to `wc -l`. So the row now carries the count -- **69** gates, **282,873 ms**,
  **231,939** lines, **235** file executions over **95** distinct files, dearest `check-official.mjs` at **27,857 ms
  (9.8%)** -- and the **value is a reading**: every run that measured a gate prints the drift of the tree from the table
  and the price the table put on the gates it measured against the seconds they spent, whose first reading weighed the
  table v3.161 shipped against this tree at **287.5 s** priced and **282.9 s** spent, **-1.6%**. The re-measure the
  entry worried about is **282.9 s** here, which is why the round bought a reading and not a verdict: a gate that fires
  on the harmless case is a gate that gets re-measured by habit. What stayed a verdict is the shape, because a row with
  no `lines` would print a drift total that silently left a gate out. The second question -- whether a re-measure can be
  asked of CI -- is answered by the same instrument: the readings CI already prints are the per-gate seconds, so the
  table can be rebuilt from a run rather than from a laptop, and this round's own rebuild read a table against a tree
  before it changed either.
  What stays open is the queue: reading 62 made `verify` (**429 s**) the longest job, ahead of `gates-audit`
  (**417 s**), because `lint` (**186 s**) and `coverage` (**206 s**) share one job (`O-147`).
