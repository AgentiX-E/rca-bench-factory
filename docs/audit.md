# Audit report

Findings from the scoring-path, OTLP-ingest and LLM-layer audits, with the
measurement that established each one. Every entry follows the same shape: the
defect, the command that demonstrated it, the observed number, the fix, and the
guard that now fails without the fix.

A finding is only listed here after being reproduced locally. A finding that only
appeared in a review, without a failing measurement, is not a finding.

## Scope

Seven passes so far:

- **Pass 1** — `packages/core/src/score/`: the official-metric scoring path. This
  is the code that decides whether an export is scorable and what number it
  earns, so a defect here silently mislabels a dataset rather than crashing.
- **Pass 2** — `packages/core/src/ingest/otlp.ts`: the OTLP JSON ingest. It is the
  largest under-verified surface in the package (403 source lines, one test file)
  and the main real-world entry point for exporter output, so a defect here
  distorts every downstream number.
- **Pass 3** — `packages/core/src/llm/openai-compat.ts` and
  `packages/core/src/fault/importer.ts`: the shared LLM transport and the
  historical-fault importer. Both were at the top of the under-verified list.
- **Pass 4** — `packages/core/src/llm/rulegen.ts` and
  `packages/core/src/llm/anthropic.ts`: the LLM rule-generation core and the
  second transport adapter. With pass 3 this covers the whole `llm/` directory,
  which is where the provider-agnostic abstraction lives and therefore where a
  vendor-shaped assumption costs the most.
- **Pass 5** — `packages/core/src/cli/args.ts`: the argument parser in front of
  every command. It is the boundary at which a malformed invocation becomes an
  internal one, and the file the whole CLI's error contract is written in. A
  validation gap here does not mislabel a number the way pass 1 can; it moves a
  failure from "the parser refused this and said why" to "some later stage
  threw", and the caller cannot tell the two apart from the exit code.
- **Pass 6** — the official-data round trip: `scripts/fetch-official.mjs`,
  `packages/core/src/export/rcaeval.ts`, the `--official-dir` branch of
  `scripts/check-official.mjs`, and the two guard scripts
  (`check-no-vendored-data.mjs`, `gen-rcaeval-cases.mjs`). Every other pass audited
  a path whose correctness the suite could decide on its own. This one audits the
  path that takes the repository *outside* its own fixtures, which makes the test
  harness itself part of the subject: a fixture that cannot express the upstream
  layout produces a green suite that establishes nothing, and three of this pass's
  four findings are exactly that.
- **Pass 7** — two measurement surfaces rather than two modules: the root
  `typecheck` entry point, and the branch positions the coverage figure was not
  counting. Both are the same class of defect as each other and as pass 6's — the
  instrument agreed with the thing it was measuring. `pnpm typecheck` was green
  because a previous step had built the tree, and the branch figure was stable
  because the positions it missed were missed in the same way on every run. Neither
  could be found by reading the code under test; both were found by asking what the
  measurement would look like if it were wrong.

## Volumes

The table of every pass -- what each audited, the defects it found, the guards it added, and the
injection matrix for each -- is [passes.md](audit/passes.md). It moved there from `docs/progress.md`
at v3.65, when that index grew past the smallest volume it indexes: a record of passes is not what an
index is, and this document is the one that keeps records of passes. Nothing was rewritten in the
move; the heading was promoted one level because it is now that file's title.

The findings live in one file per size budget, because one 1.1 MB document is a pile
rather than a document: a reader cannot find an entry without `grep`, and the push that
carries one new finding carries all of them. The split is by size, not by subject --
a finding that belonged to a theme keeps its number, and numbers are what the rest
of the repository cites. (This sentence said "6 files" while there were seven: a count
in prose is a number that goes stale on the next split, and the table below is the one
that is checked.)

| file | findings | entries | opens with |
| --- | --- | --- | --- |
| [volume-01.md](audit/volume-01.md) | 1–82 | 82 | The regression graded its own answer key |
| [volume-02.md](audit/volume-02.md) | 83–112 | 30 | the stability gate was never run, and four of its properties ... |
| [volume-03.md](audit/volume-03.md) | 113–159 | 44 | the anchor workflow cited a helper that does not exist, and t... |
| [volume-04.md](audit/volume-04.md) | 160–195 | 36 | the second backend was declared unimplementable, and the decl... |
| [volume-05.md](audit/volume-05.md) | 196–254 | 59 | the gate that could not be proved, and the reference with four meanings |
| [volume-06.md](audit/volume-06.md) | 255–266 | 12 | the corpus is two documents joined by one string, and nothing read both |
| [volume-07.md](audit/volume-07.md) | 267–275 | 9 | the layout we wrote is not the layout the loader reads |
| [volume-08.md](audit/volume-08.md) | 276–289 | 14 | the loudest series is not the answer, a reading sits on its unit's grid, and a spread of zero is a step of the declaration |
| [volume-09.md](audit/volume-09.md) | 290–350 | 61 | every test passed and the run was not green, one 500 turned a channel red without naming a call, the slice that exists for logs and traces carried neither, a worker cap read a number the container overstates, a spec change was published without the artefact derived from it, two tables that were never read turned out to hold the two things the reader would have refused, the exporter wrote both modality tables for every case, the anchor's RE2 case turned out to be RE1 in content, the entity in a reference was decoration, one metric on two entities was a name the file refused, the rule's first run found a lag asserted on the wrong end, sixty-nine facts nothing read had to answer for themselves, writing those answers found five numbers stated twice, the stall budget was a ratio while the five-second wait was a feeling, a ledger that says which round measured it, and a batteries job whose twenty-two steps stopped sharing one budget, the ranking reading the path had been choosing, and twenty-three cases that have nothing to say in a one-word vocabulary, and eighty-six assertions that could not say why the guard refused, a modality that is absent reading the same as one nobody looked at, nine checkpoints that were evidence for a step which never cited them, a published reference that was half of the pair its own document prints, the half that was completed without the file being asked to carry it, and four lines of the loader nobody had ever run on a file we wrote, a pool kept wide for a reason nobody had priced, and a failure site "proved" by a test that need not have reached it, a range that says a line ran when it says the file started, and four sites a gate could stop failing without any test noticing, and an RE3 resource fault that scored 1.00 in the slice that admits code-level faults only, eleven fault types of which this repository could name six, a corpus censused from 0.023% of its own bytes, an ingest path that said `unknown` for every label the corpus had to teach it, a Type Accuracy term that the word `the` satisfied, a case record that said miss where its own score said 0.4, a budget table that could not see the file it should have and then could not read it, and a fault taxonomy whose names no target wants because the corpus's own metric scores ranks alone |
| [volume-10.md](audit/volume-10.md) | 351–479 | 129 | a keyword that was a substring, an Exp. clause that said both sides are cut while one was, one evidence point cited five times scoring 140, an empty component matching an empty key, the one red that left no message leaving it in the arm that formats the failure, a writer that said nothing was written after writing, an inventory whose proofs were mentions rather than drives, a property-failure arm that had never run, a child whose dropped environment read as an exit that was never reached, a claimant that did not pass reported with no reason, a proof that proved only that the gate ran, a green mutant that was described as a survivor, a guard column that named the nearest `if` above rather than the block the exit is in, two hand-written scanners beaten by a regex and by a template, a column that was measured against the same idea and declined, a tally that counts a line the parser says is a comment, a list and a tally that added up to the right total for two wrong reasons, a fallback written into one of two readings of the same shape, a third hand-written lexer that desyncs in 12 of 75 scripts, and the same lexer's second copy crediting two comments as uses, an exit with no argument published as a failure, the basket that held the sentence deciding the status, a reference the reading could not resolve counted nowhere, and a diagnostic floor that was a distance rather than a scope, an inventory that counted one spelling of "no" where the language has two, the refusal that guarded every battery bound and had never executed, a `try` that was read as guarding a function defined inside it, a `catch` read as a forward when the value it threw was a new verdict, a mutant that could not reach a throw leaving it out of the total instead of naming it, a coverage counter that never increments a block ending in a throw, a witness that named the process instead of the file it threw from, a loader that instrumented nothing and reported success and preloaded twice, the import road a loader cannot see, forty throw rows that said nothing about whether any test ran them, a gate that said a throw could not be mutated and the loader that removed it, a claim read off the disposition that left thirty-one proved throws unmeasured, a quote inside a regex that swallowed the rest of a file, a rule that said one setup file answered rather than deleted, and a guard that resolved a name to its first binding instead of the nearest one, a tokeniser that kept the hyphen so the best answer to a slug-written key scored zero, the fallback the protocol describes decided by measuring five surface models against ninety derived distractors and refused on the number, three exemptions that were one duplicated guard written three times, a budget whose rules were written for the job that failed so no other job was asked whether it bounded anything, bounds that could not survive a fresh reading of a run three days newer, a job that ran the suite without installing the shells it spawns, a recording whose every number was checked by a rule that never said which tree they described, six exemptions that were sentences whose length was measured, a pack reader that walked one directory while the download promised a tree, counts checked against counts rather than against the classifier's closure, an index of the archive written by the reader it was meant to check, a rule that made an exemption point at a title and left the title unmeasured, a table of edits that rots in the one way the table cannot see, a CI step whose own measurement sits behind the gate that demands it, a channel that publishes a tree while dropping the commits in between, a step nobody could add and the name that described half of its command, a borrowed measurement that carried a budget it never spent, a publishing channel outside the tree with one assertion about content, a fallback that republished the incident it was written to repair, a partial listing that decided what to delete, a merge republished with one parent, a harness whose alternate object directory let it answer its own question, and a closed socket on the first real push that the status-based retry could not see, a job that has never run having no place in the budget rules, a promise that would forge the one number only CI can spend, a deadline computed from measurements that do not exist, a borrow that would settle a declaration without a run, a split that silently measures a subset of itself, an empty shard that passes while measuring nothing, and one flag that made an entire job invisible to the shell guard, a job that is never over the floor never being asked for a bound until the round it is, and `R6` refusing the safe direction of a budget change as hard as the dangerous one, a bound placed at exactly twice a reading firing on a five per cent slower day, every bound in the workflow argued from the last day rather than from the worst day, a history that demanded today's workflow shape and would have deleted the days a bound needs, a deadline that summed the recording rather than the slowest day and left two ceilings validated against a fast morning, a shell install whose three-minute bound was under twice its own 153-second day, a bound too wide to fit inside its own ceiling, and an instrument that could say a claimant was red and nothing about why, a publishing channel that carried every push and could not say what the API answered, a record keyed by the attempt rather than by the push, and an inventory that published `OK` as the diagnostic of a refusal, a file of five pushes described as one round deep because a row had no push to belong to, a boundary read off a gap in the timestamps that answered the right number by accident, and a rule that refused the retry it had been written next to, a 404 on a branch read that the channel read as one state where the world has two, a channel that could not create a branch and described the refusal as one that had moved, and a stand-in server kinder than the API that made the suite prove a call that cannot work, and a mutation that survived because the case tested both sides of a boundary and neither side was the boundary, the strongest assertion in the suite unable to hold for two hundred and forty-six commits, two plausible causes killed by measuring the bytes the API stores, a cause that was a sentence rather than a measurement, two columns that could only hold (n, 0) and (0, n), three derivations of one fact, eight proofs dropped by an edit in the middle of a file, a stand-in that loses a byte so that a refusal is not a rubber stamp, and a test file that had been running past the default on every green run, discovered by the one push that changed nothing, a flag read as permission while it was a statement, a creation path that rebuilt a history to publish a name, a creation refusal that named one of the two states its status carries, two stand-ins that between them could not express the question -- one answering a route nobody had declared, one withholding objects a clone had copied -- the shared names asked as objects instead of as sentences, where the boundary turns out to be a suffix, a ref listing that read one page and called it the repository, a question asked again of a listing that had already answered it, a gate described as having nothing to say while it was saying it before the first request, and a recording that dropped the query so two pages shared one key, and a creation path that insisted on the whole history -- refusing to create a branch at all on a history that contains a merge, and a twin refusal that kept protecting a branch that did not exist, a live list that said "open" about three things three rounds had closed while its guard checked only its form, a strikethrough looked for anywhere in an entry closing the two entries that quoted one, a base search with no stopping condition that never said how many tips it had read, and a file budgeted on one test of forty-three that timed out on a loaded machine, an entry whose own reason said "closed" while its headline said open, counted as work by the rule that reads headlines, and a split described as differing "by seconds" whose two jobs differ by four minutes in the opposite direction to the round that split them, nineteen records that left the guard's reach when their heading gained a comma, a count of the rows nobody judged that counted their headers and rules, a shape the guard said it checked and never did, and a column named `state` whose median cell is a 75-character sentence, a residual that lived in a record while the list that exists so nobody has to read the record never held it, a row that restates an entry in words no search will share, and a rule that had existed for two hundred and sixty findings, an index that outgrew the volumes it indexes, a closure that cited a number nothing held, a gate-site count that said 105 while the inventory held 203, a mutation matrix that described thirteen mutations it did not run, a set both baselines solve reported as evidence of health, a leak count that was three because the comparison could not see a hyphen, a round whose own ledger carried no coverage row while its two new arms left six branches dark, and a top-K read through a filter that could not fail, seven contract pages whose metadata table restated a specification nothing compared -- and a vendor that was the line above it, a generator that wrote the documents while its gate checked the site, a pollution gate that compared a case with everything except another case -- and a corpus the gate was asked one case at a time could hold ten copies of one incident |
| [volume-11.md](audit/volume-11.md) | 480–489 | 10 | a reading in a comment that the same round made false, two coverage figures for one tree -- the one nobody recomputes being the one in the table, two thresholds no grid had ever moved, a channel that exists as a library plus a table that exists twice, a specifier that resolved only when a loader chose to fall back, five denominators behind one unlabelled percentage, a corpus whose noise model fixed its own z axis, the reach of a check documented everywhere but in the check, a shape whose name carried a duration and the axis that could not move because of it, and a reading that answers 30 of 32 and never said so |
| [volume-12.md](audit/volume-12.md) | 490–541 | 52 | a case that stated a duration its own telemetry contradicted twice over -- a four-minute burst shipped as fourteen minutes, and a seventeen-minute partition that never ended in the data -- a list of types that named one type twice, a two-hour run that died with three sentences and 180 case lines to show for it, none of which reached the artifact, and then the instrument that measures all of this reporting one quantity under the name of another: a stall of 47,727 ms that was 11.5 s of work, a table of eight repository numbers that nothing read and that were all wrong, an inventory that recorded a gate's success line as the diagnostic of its failure, and the proof of a `throw` row that proved the gate exits rather than that it stops before writing -- a rewrite that damages the document and then reports the damage passing all three assertions, and a comparison that decides 168 of 270 cases and had never been measured paying 1.9 KB per row for two maps of long strings, a table that could not be parsed reported as a table with nothing in it, a check that could not run reported as a column that agreed on every row, and a coverage residual of which three parts had never been executed at all, a claimant that ran out of time filed as a claimant that was red -- a verdict about the machine, at a ceiling vitest assumes for an idle box -- and the file at 71% of the stall budget blocking the event loop for 62 seconds because three hundred `spawnSync('git')` calls are three hundred stops -- a coverage plan that said "written by every producer" about seven positions of which it was true of five, and the repair that sentence named was the wrong one for two of them, and two `?? 0` fallbacks five lines apart of which only the summed one changes an answer -- a battery whose per-test flag set a default and therefore never reached the one claimant that declares its own budget -- below a stall this repository had already measured -- and a count of tracked files derived before `git add`, publishing a number the commit contradicted the moment it was made, in a guard whose own fixture had been reproducing that measurement -- a log table the plan stated as one table and the corpus writes as two, in 244 of 270 cases, measured from the archive that shows two case directories eleven apart with different headers -- 1,572 rows of one SockShop case refused as a missing column because the reader folded an empty cell into an absent one, while three other readers in the same package had been emitting an empty body all along -- an empty time cell filed at 1970 by `Number('')` in the second module to need the sentence "an empty cell is not the epoch", 256 rows of it -- and a round trip that could not testify to the one thing it is the witness for, because the values an export writes into a column it declares empty were counted and not gated -- and a battery that published one budget for sixty-one claimants while nine of them state a tighter one of their own, through a reader whose first reading was a fixture inside its own test file -- and a battery that credited every non-zero exit with a catch, which is a fact about the file standing in for a fact about the mutation: a claimant that crashes whenever a mutant is armed was credited with every claim it makes, and a run a test budget stopped was credited too -- and the margin that battery printed, a file's wall clock divided by a per-test ceiling, 99% of a number nothing was near, which is a percentage of the wrong denominator and names a repair for a ceiling the tests were nowhere close to -- and a round trip that finished 270 of 270 at oracle=1.00 in 154.4 minutes, in the largest anchor this repository had ever read end to end, where the step after it died of a four-gigabyte heap holding the same table four times -- and a documentation guard that requires the revision it names to resolve, run by two jobs that checked out one commit each: green on every machine that had the history, red on the runner for four rounds -- and a suite whose verdict was decided by a 5 000 ms per-test timeout that nobody in this repository set, two and a half times below the suite's own slowest legitimate test, where a file at 94% of it was green by 282 milliseconds on the run before it went red -- and a CPU allowance read from the cgroup v2 layout alone while the v1 layout was equally in use, so a container with a 4-CPU quota ran eight workers and spent 89% of the stall budget and 93% of the memory limit to be slower than four would have been -- and a gate whose name promised two outcomes and implemented one, which parsed two hundred megabytes to answer a question sixty-four kilobytes would answer and then died of a 4 GB heap, concealing that it could never have passed: 156 of the corpus's 181 aggregate tables are keyed on a template column the file does not have -- and the twenty-four it could read, four of which failed the run: a rule that matched rendered template text against a column the corpus sometimes writes masked, 58 cells of 21 267 across the four `_loss` cases, while the `cluster_id` column beside it named the right cluster on every row -- and a failure line that counted sentences capped at five cells per case, so 58 differing cells were reported as `21 problem(s)` -- a table of budgets for the tests closest to vitest's default, which says of itself that it cannot discover a row it does not have and had proved that three times: the reader that compares a run's own durations against the budget each file declares, which on its first run named one file the table did not have -- a coverage percentage in a ledger row that no run produces, because the corpus has two instruments for that number and only one of them is what the step prints -- a recording that answered a promise about a three-minute bound by measuring one second, and handed another step a slower day than its own bound could carry -- and a corpus that has 271 case directories where every document said 270, because the two counts were of different sets and neither said so |
| [volume-13.md](audit/volume-13.md) | 542–578 | 37 | a gate that walked 271 case directories and printed three outcomes, where the third — `refused`, 246 of them — was a fact about this repository printed where a fact about the corpus belongs: a table that cannot name a cluster still cannot summarize more lines than the container emitted, so the inequality became an outcome with its own name, its own clause and a failure path a fixture drives; and a coverage table whose four figures had a reader that compared them with the ledger and with nothing else, published 99.93 branches for eight rounds and then 99.980 and 99.97 on two instruments with the prose naming neither, until the run's own `json-summary` became the number and the instrument entered the sentence; and a refusal for a stopped run that named the budget it was given and not the test the run was inside, where the name had been in the captured output all along -- the report the leftover proposed buying would have been a second copy of it; and a `bounded` claim whose first corpus run refused **246 of 246** directories because the log side of its inequality was keyed by the second a row fell on while the table is keyed by the fifteen-second window that second starts, a mismatch no fixture could show because every fixture wrote its rows on the boundary -- 63 441 refusals across RE2-SS, zero after the floor; and three rounds of a 244-round log written in a language the other 241 are not in, which eighteen document gates read for their counts, citations, boundaries and headings without asking what language a sentence is -- the three rewritten against the record with every number intact, and a reader added that refuses a run of eight Han characters of prose while reading a fence, a code span and a block quote as the quotations they are -- and a time column read as a bucket key rather than as a claim, where the published side took the file's own number while the log side floors, so a table bucketing on another origin would have been answered with a breach of the log file's own count: true clauses about a comparison that never happened, one line per published row -- **0 of 26 116** published rows are off the fifteen-second grid, which is what makes the refusal a sentence for the next corpus rather than for this one -- and a reader for comment bodies, where the sentence is right and the region it describes was invented by the scanner: a URL's authority read as prose, and a regex holding the two characters that open a block comment read as an opener that walked to the end of the file, so a file that is fine reported **zero comments, zero runs, and a refusal** -- **331** comment openers across **90 of 462 files** sit inside a string, a template or a regex, and **23 768** comments carry **0** runs of Han prose once the scanner knows where a string ends; and the last prose surface in this tree -- five workflow files whose `#` comments are the record of why each step exists -- which the language axis had left to reviewers because a `#` in YAML is four grammars rather than one: a scanner over plain, single-quoted, double-quoted and block scalars, **1 215** marks and **1 167** comments with **0** runs of Han prose, and a census that found the reader counting twelve of the tree's own comments as content because it measured the `#` from its block's column instead of its row's, on a green run, in a file that happens to be English; and the last shared boundary of the language axis -- three readers that judged a row, so a sentence wrapped in a narrow column was two citations and a `#` comment continued on the next row was two comments: the unit is now the paragraph, decided where each surface is legible, with rows joined by nothing between them because a run of eight Han characters cannot cross a break that is not Han on both sides, and **68 891** breaks held with **0** of them a crossing because this tree wraps no Han at all -- the proof is twelve falsifications, one of which came back green until its fixture stopped testing a path it could not take; and two spellings of one break, where a trailing backslash is punctuation to a renderer and text to a comment, so the same bytes joined two rows in the document reader and held them apart in the two comment readers -- the marker looked for before the trim, because trimming turns a backslash and a space into a backslash -- with the escaped pair, the three- and four-backslash forms and the trailing-space form each a fixture that must stay green, and **six** falsifications; and a citation deleted outright, which let the two halves of a word around it meet and reported eight characters nobody wrote, repaired by leaving a gap where the span was -- **965** spans in **873** rows have a non-whitespace byte on both sides and **0** of them have Han on both sides, so both rules cost nothing today and the whole proof is **22** red fixtures across **22** falsifications; and two exported contracts that published the level a case *claims* and never the floor under it, so six of thirty-four cases shipped a judgement in a field every reader takes as a measurement -- one key beside each claim, from one projection that takes the graph because a floor computed without one is `L1` for every case, with the two words readable only because a level below its floor is refused before anything is exported, **8** falsifications and **125** red, and the structure checks holding a present word to the vocabulary while never demanding the key, since a file the benchmark itself wrote carries none; and a published count restated in the one paragraph that argues against restating it, found because this round added an export and the sentence went on saying 538 while every gate stayed green -- the sentence now points at the list, and the exemption count beside it is the same number of the same kind, left because it has not moved; and a count that defended a length rule while counting the wrong unit — **fourteen** time-valued parameters where the corpus writes **seventeen** across **fifteen** cases, because fourteen was the number of cases and the sentence's own arithmetic only worked if its subject was parameters, with the three it lost in one case's two time-valued parameters and another case's single one; and the field that count defended, which was a name one parameter carried and any case could withdraw by deleting it — the run printed the five that answered and never the twelve that said nothing — so the answer moved onto the number it describes: `knob` or `episode` on every parameter written in a unit of time, refused by name where it is absent, refused on a count or a share where no such distinction exists, with the name-shaped refusals gone because a name is no longer written and `readDurationClaim` taking the one declaration the role reader produces, the field deleted from all five cases that used it and refused where a file still writes one, and the run printing the two answers beside the number of lengths they must partition — **7** falsifications, **13** red; and a gate that compared every test's cost with a budget it read from the wrong place — the suite's number, even where the test states one of its own — so CI measured a test at **15 199 ms against 30 000** while that test states **120 000** on itself, printing 7.9x of headroom as a 2x shortfall and failing the build on it: the denominator is now the number in force where the test is written (the test's, then its suite's, then the file's largest), the failure sentence names which declaration it read, and the repair is stricter in the other direction — a test stating 10 000 inside a suite stating 60 000 was invisible at 0.10 and is refused at 0.60 — **6** new tests, **13 of 250** files stating a budget on a test (**52** tests) of which the run names how many were judged by one — **11 of 44** — and **0** differences over **250** files for the two readers that existed before; and two implementations of one documented rule — the gate's scanner ended a pattern at the first slash even inside a character class, so `/[/"]/` left its quotation to open a string that swallowed every budget below it, while the copy in `timeout-budget.test.ts` had tracked brackets for two rounds: **eight** patterns in the tree hold such a slash and none sits above a budget, so both scanners returned the same three readings for all **467** code files and the drift was one added pattern away from a false red the document had already been repaired for — and the fourth spelling read by shape rather than by place, where `, 8192)` in `buildAnthropicRequest('p', 'claude-3-opus-latest', 8192)` and `, 1664525)` in `Math.imul` became budgets: **ten** of **259** test files declared one they never wrote, `gen-rcaeval-cases.test.ts` was held to **1 700 000 000 ms**, the floor rule never fired for the ten, and the test that named the right rule pinned a fixture the `>= 1000` filter had already excluded — the positional form is now read inside a test call, the count fell **44 → 34**, and **10 of 259** verdicts changed, all from a number the file never wrote to none — and the quote characters kept in v3.104's scanner by a paragraph arguing that the last-significant-character rule reads them, which stopped being true when the same round made that rule carry its own state: identical readings over **467** files and identical verdicts over **259** for the mutation that blanks them, so that round's survivor proved nothing anywhere and the census finds **0** files with a `/` after a closed literal — the fidelity is deleted rather than tested — and the copy itself, deleted into **scripts/budget-readings.mjs** because a gate is proved by being emptied and so may not be imported, a rule the meta-gate stated in under a second with the remedy in its message: **179** lines left the test file, **none** restated, the site inventory moved **96 → 97** scripts with **143** sites and **99** throw statements unchanged, and **6** falsifications across the three repairs, all red; and a receipt that named the tree its run **began** on because the name is resolved before the first step — so a run that started on one tree and ended on another blessed neither: this round's own documentation commit carried a gate with `process.exit(0)` on its second line, `verify:local` printed `OK` with a receipt, the site inventory caught it only because the marker is a **line** that moved six exits by one, and the suite catches it at **68** red tests measured — the decision now takes the tree read after the steps and withholds the receipt when it moved, name or dirtiness, and it deliberately does not turn the run red because a new exit is a new site and the only test that could reach this one is the thing being refused: **3** new tests, **2** falsifications, **2** red and **1** red; and a verdict that said `OK` on exit 0 over a tree the receipt had just refused -- the refusal was on the second line and the word was on the first, and a pusher reads the first: the comparison moved into `treeMoved`, the decision gained the kind of withholding it was (`starting-tree` / `subset` / `moved`) so the verdict is not a parse of a sentence, and `runVerdict` now decides the word and the code together, so a void run prints `VOID` and exits 1 through the exit a failed step already uses -- a dirty *start* is not a move and a subset run is not either, because comparing states alone would fail every local run a developer makes; **13** new tests, **9** removals in the module (**15** red) plus **1** in the gate (the inventory, when the exit becomes a zero), and the one removal that is green everywhere is the wiring itself -- 207 tests and a clean inventory against a gate told to ignore the decision it computed, which is the shape no local reader can reach because reaching it means rewriting the tree underneath a running gate; and a gate that computed a verdict nothing could ask whether it **obeyed** — the survivor v3.106 reported rather than explained away: `runVerdict({ result, decision: { state: 'issue' } })` in `verify-local.mjs` green in **207** tests with the inventory unchanged, because the inventory proves an exit exists and is reached while hollowing proves a gate runs, and neither asks whether the value the gate computed is the value it obeyed — the branch that consumes it is reached by a tree moving under a running gate, which is the thing that branch refuses, so the observation could not be bought with a better spawn: the close-out became one `settle()` that computes its own decision, `--rehearse <shape>` supplies from a table the inputs a run would have produced, and the expectations live in the test so a rehearsal cannot agree with the implementation by construction — `passed`, `subset`, `moved`, `dirty-end` and `failed`, the last carrying both a failed step and a moved tree because `FAILED` has to outrank `VOID`, with a dirty *start* deliberately absent because it is a state a developer is in all day and `--only` already drives it through the real path — **10** removals and **24** reds with **no survivor**, the first row being the edit that was green four rounds ago and now costs four tests; one new site (**143 → 144**, battery **228 → 229**) proved the ordinary way by the spawn that reaches it in under a second, and **11** new tests; and the vocabulary that decides which published numbers are true, filed as `data` -- "exports a table" -- while exporting the four-branch classifier that answers which suite a row is about, with no test in the tree importing the module at all: deleting one of its four branches was green in **255 files / 6,560 tests** and green in `check-doc-counts` over **433** published counts, and the deleted branch was a guess nothing should have made -- its name, `every workspace`, is not the word the vocabulary declares, and it had been copied out of a string in the checker that only `Object.keys` ever read -- while `\b` answered `core` for `core / cli / repo` (three published rows) and `cli` for `` `scripts/publish-cli.mjs` ``: the words are now one exported list, the classifier is a function of it answering one name or `null`, and `null` is a refusal because rule 1 refuses a count that names no scope; the writer's table is keyed by the vocabulary, the four notes reach a refusal and are asserted there, and the register gained the rule that a `data` module may export a function only where a test imports it -- **27** such modules, this one the only one nobody imported, **7** edits and **13** reds with **1** equivalent stated as equivalent, **16** new tests, and the gate side of the same question measured for the next round: **20 of 59** gates consume a function-exporting module over **31** edges, **1** drivable; and the rule that closed that finding, which was keyed by *module* -- and three hundred lines away the instrument for `src/` carries the design note saying why that key is the defect: a module ten tests import satisfies a module-wide rule for every symbol it will ever grow -- so the key is the symbol now, and over **27** modules and **162** exported functions it found **7** taken by nothing outside their own module and **10** taken only by a script the suite spawns: two of the seven were the same helper written twice, `spawnSync('git', args, { cwd: root })` in `gate-receipt.mjs` and `spawnSync('git', ['-C', root, ...args])` in `git-hooks.mjs`, both exported, neither consumed by anything but itself, and one of the two had a test -- the module that had a test looked proved -- so the runner is one module with a contract test and an equivalence test (`-C` against `cwd` on the same five argument lists), and **13** new tests; the six exports with no consumer lost the keyword, the nine whose only reader is a spawn are recorded with a reason refused when it is short, shared, stale or names nothing a script takes, and the stale direction is what catches the regression: keying the reader by module again leaves the first rule green and turns that one red -- **11** falsifications and **16** reds, plus the one edit that was green because the `error` arm of the runner could not change an answer (`spawnSync` reports `status: null` for a child that never started), which is why the shipped form is a single comparison; and a written exemption table whose nine sentences each said a spawn was the only route, where eight of the nine bodies never leave the process -- `budgetInForce` takes a source and a title, `modalitiesProse` a list of codes, `rehearsal` a shape and a plan, `pointerPlan` a tree, `parseArgs` an argv array, `inspect` a path, and `readBlob`/`readRev` reach git through `runGit`, a helper call rather than a boundary of their own -- so the table was keyed by a **symbol** and argued about a **gate**: the nine are taken by **37** tests that import them now (four budget arms in their order including the largest-not-first fallback and the suffix match on a report's title, `T, M` against `M, T`, the six rehearsal shapes and the merged pair's `also`, the `||` that makes an empty `RCA_CI_WORKFLOW` mean the shipped workflow, a blob asserted as a `Buffer` beside its bytes, the layer that refuses an unresolvable revision, the pointer plan's empty commit list, six argv shapes with the `index += 1` that reads the flag after a value, and a file reader's three answers), the table holds **0** rows with the nine kept as `FORMERLY_EXCUSED` and each asserted to be taken by a test, and a fifth rule replaced the prose -- **the body must cross the process boundary** (`process.argv`, `process.env`, a standard stream, `process.exit`, a direct spawn), with `console` excluded because a test can spy on it and the body blanked before it is searched -- calibrated on two real bodies (`workflowPath` crosses, `readBlob` does not, which is the row that stood here), six synthetic rows one per fault, and **5** reds across four falsifications; and two findings the repair was not looking for: a sentence table with three keys for four arms, safe only because the gate answers `none` before indexing and now asserted as a pair by reading the gate's own source, and a heavy-fixture detector that searched a whole file for `'install'` and so called a rehearsal **label** a package-manager run -- naming, in an assertion about the suite's memory ceiling, a file that runs none -- repaired by slicing a spawn's argument list and calibrated four ways; and an index that could not grow because two thirds of it was a list of things that were done — `## Open` at **98 927** bytes of which **65 544** were **48** struck entries, so a volume holding one round (born at about 9 KB) could never be larger than the **133 309**-byte index the bound compares it with — the closures moved whole into `docs/progress/closed.md` under a `## Closed` spelling the guard reads with the same citation rule, the tiling checked by hashing all **76** entries before and after the move (**28 + 48**), the index down to **66 673** and a volume born at **108 534** from twelve moved rounds; two refusals keep the split apart (a strike in the live list, an unstruck bullet in the record), and the move exposed an arm that had been judging **v3.69** for forty-one rounds because it selected "the newest record" by *form* — the rounds stopped writing tables at v3.70 — which went red only when the population narrowed, because a wrong subject looks right for as long as its lucky accident holds: the selection is by owner now, both forms are collected, the population is both files, and the arm runs after the walk so no ordering can flip it, while the cross-file copy rule written for the same round was deleted as unreachable (the live-strike refusal preempts it) — **6** falsifications, **19** reds, and the gap stated instead: an entry has no identity, so the tiling is a measurement rather than a guard; and the same scanner twice — a four-regex copy deciding which files are heavy while `budget-readings.mjs` had a state machine: **219 of 248** files blanked differently, every difference a template literal or a regex literal, and the heavy set identical (`typecheck-entrypoint.test.ts:install`), which is exactly how a duplicate survives — replaced by the import, with four fixtures holding what the copy got wrong (a URL in a string eating the rest of its line, a template holding an apostrophe, a regex holding a quote, and a template piece that is not a command), **2** falsifications and **7** reds, one of them the pre-existing set assertion because the new fixture's own URL made the test file look heavy; and a split held apart by two refusals that each read **one bullet**, and the copy that satisfies both of them — a closure appended to the record struck with its live entry left unstruck, where the only shape the deleted copy rule could have seen was the one the live-strike refusal had already refused, measured by checking out the guard at `176ec7b` and running it over exactly that document: `OK (2 entry(ies) ... 1 open with a reason, 1 closed by a finding)`, exit 0 — so the rule was reachable and what it lacked was a comparison text cannot make, the two copies differing by the strike by construction: every entry of the two lists carries `O-001`, three digits, right after the bullet, one space shared by both files and **dense** (1..N between them, recomputed every run), which refuses a copy as one id in two places, a deletion as a hole in the set and an invented id from the other side, and makes `max + 1` the only number a new entry can take — proved by two accidents performed on the shipped tree (the copy: two diagnostics, one of them the duplicate the old guard could not print; the deletion of `O-010` with the stamp edited to match: **one** diagnostic, every other rule green, which is the accident the tiling equation was measured for and could not guard) and **7** falsifications, **16** reds, the records' **558** ids-free entries kept out of scope because a frozen record moves nothing; and the budget rule meeting its first file that crossed the floor without a declaration — `category-derivation.test.ts` at **1 044 ms** on the runner against **493 ms** locally, on a head pushed as green, because seven new spawn-driven tests were the contention and no local run takes that reading: suite `R` now declares **3 000 ms** (2.9x the reading, above the gate's 2x rule) and the count of files stating a budget moved **34 → 35**; and finding 572 taking the record's size from an unmeasured question to a budget (**73,447** bytes, **1,412** an entry, **39** closures of headroom) and finding that the record was **one path** in `DOCS` — ten closures moved into `closed-02.md` left every verdict green, including `69 entr(ies) with ids 1..69, and none is missing` — so the record is a discovered set now (`closed.md`, then `closed-NN.md` from `02`) with three refusals for the three ways a set loses a member, two boundary rules for a continuation file, an order rule scoped to the record (the corpus is not a run of numbers: a closure keeps its number), a budget judged on the last file, and a split of **25 + 27** whose 52 entry lines were compared before and after and are identical; and an arm that judged a round's record and compared each row with itself -- the population it drew witnesses from was every entry the walk read, records included, so for the form every round has written since v3.70 the row and the entry it was compared with were one bullet: **2** rows reported as quoting an entry, **1** of them quoting nothing but itself, and no record in that form could ever have been refused -- narrowed to the two lists, which is what the arm's own diagnostic had said all along; and the comparison the same arm published at twenty characters (finding 468) and implemented as the whole row, invisible for forty-eight rounds because a self-witnessing row satisfies any ruler however strict, and visible the moment the population narrowed: the shipped v3.113 record went red on a row that is right, its first twenty characters the live entry's and its tail the round's own account -- **80** entries with **80** distinct first twenty characters, the ruler implemented, and the arm's sentence changed from `quotes an entry` to `matches an entry on its first 20 characters`; and a round's second record, which the selection passed in silence (**0** of 195 shipped rounds wrote two), and a record written above the first round heading in its file, found by nothing because the arm looks up for its owner -- every volume since v3.45 begins with a round heading on its first line while volumes 01 to 03 name no round at all, so the refusal asks the file and the **25** legacy records it leaves unjudged are stated as a count nobody has; and the record's own introduction, which said the order here was the closing order and the numbers were not monotone, three paragraphs below the sentence saying the opposite and one entry above the rule that made it false; and a budget rule meeting a file that crosses its 1 000 ms floor in the suite and not alone -- `step-process.test.ts` reads **940 ms** on its own and **1 635 ms** sharing four cores with 256 other files, so `verify:local` passed one tree and failed another that differed by documentation only, and the number deciding the difference was vitest's 5 000 ms default which the file never wrote: the suite states **4 000 ms** (2.4x the suite's reading, 4.3x the isolated one, below the default), the count of files stating a budget moves **35 → 36**, and two copies of the file at once read 783 and 820 ms, which is how the contention was attributed to the suite rather than to the test |
| [volume-14.md](audit/volume-14.md) | 579–649 | 71 | a refusal for a third spelling was written as a prefix of the two names that existed, so `### Leftovers, in the order that reaches the goal` (17 rounds) and `### What is left, in the order it has to happen` (5) matched neither name and were read by nothing: **47** of the progress corpus's **555** tables begin with a `priority` column and every one of them is a round's record, where the guard counted **25** records and **188** rows of the 47 and **318** the corpus holds, and the arm's own denominator -- "0 of 195 shipped rounds wrote two" -- was the number of records it could see rather than the **210** rounds the corpus names (**217** record sections, **192** owned, **25** under none, **18** rounds with none); the refusal asks the body now, because a table whose first column is `priority` is a record whatever its heading says, and its first scope -- the body a `##` heading spans -- reported every round in the corpus as an orphan because a round's record is a `###` underneath it, which thirteen tests said on the first run; and the defects that stood in the unread half, both of them shapes the guard has a diagnostic for -- a record row `v3.98` wrote whose last cell names `` `run: |` `` and renders as five cells under a four-column header, refused by `tableShape` since v3.64 and reached by nothing for the seventeen rounds the row existed, and a fourth column that five records spell `next` where the vocabulary says `next step` (**42** records and **294** rows against **5** and **24**), so the second spelling is published rather than five frozen records edited; and the noun that was checked against the position that was used, where the shape check asked whether the header *names* the four columns and the row arm then took the item by `COLUMNS.indexOf('item')`, reading the priority out of a table that orders its columns differently -- none of the 47 does, and the fixture drives the order now; and the remedy the cell-count refusal asks for, which was a form the reader could not read: `cellsOf` split on every pipe, so a cell repaired with the `\|` GFM requires was still a separator, measured on a three-column prose table in `v3.82` that six escaped pipes turned into eleven cells, with **0** of the 318 record rows using the escape before the repair and the guard's row count **313** rather than 318 because a refused table is dropped from a census that adds after the refusal; and the round that explained the arm's row rule with a rule the arm had replaced nineteen rounds earlier -- a bold first cell the guard stopped reading at v3.63, a table no cell of which was counted because its heading was one of the 22, a comparison with a `v3.80` that wrote no record at all, and a "count of bold priority rows" the guard has never printed, where a bold-cell census finds **188** rows against the structural 318 and both the acceptance bullet and the test that derived **147** from that convention had been agreeing with a population 22 records short; and, in the two runs the round took over its own content, a derived table whose `Tracked files` row was **666** on the working tree and **667** in the commit that added the audit volume -- every one of the eight rows is derived by the guard and the round edited prose instead of running `--write`, which refuses until the index and the worktree agree, so the same content passed one run and failed the next; and a second file at the budget floor, `battery-witnesses.test.ts` at **1,085** ms inside the suite against **150** ms alone (7.2x for two `python3` launches) stating no budget, whose verdict therefore fell to vitest's 5,000 ms default -- passed by the first run and failed by the second seventeen minutes later, on content that had not moved, which is finding 578's shape arriving in the round that recorded it, and answered the same way: **4,000** ms on the suite, 1.8x the reading, below the default, files stating a budget **36** -> **37**; and the arm's population line, which subtracted a count of round **names** from a count of round **headings** and published the difference as rounds that wrote none -- the corpus repeats one number (`## v2.15, addendum`), so `211 - 193 = 18` was neither the 211 headings nor the **210** rounds the number line holds dense (94 in `v2`, 116 in `v3`) nor the **17** that wrote none, and an addendum is a section of its round rather than a round, with a number headed twice and a gap inside an era now refused; and the record's fifth name, `### Not fixed here`, which is `v2.15`'s addendum and holds two entries with reasons -- read by nothing because the body rule of v3.115 asks whether a table's first column is `priority` and this is the other half of the shape space, a section whose body is **nothing but** entries (14 sections of the corpus hold a bullet with a reason, 4 hold no prose at column zero, 1 is a record), which put its round among the rounds that wrote nothing while it wrote two promises; and the sentence that premise rested on, which the seventeen say in their own ledgers: **eleven** opened at least one entry, **one** says it closed a hole "rather than filed", and **five** say nothing, so the absence is a missing record for eleven and a choice for one and unjudged for five -- the arm sees the list as it stands and never the diff; and a population line that published one counter under **one** authority's name while the rule accepted three: **86** closures over the two documents were **73 findings, 9 rounds and 4 denials** -- the record's ten `Closed by v3.78`/`Closed by Pass 15` and its three that say `Closed without a finding` in their own words, which the line counted into "closed by a finding", with the suite asking only the two questions that cannot see a noun (arithmetic over the parts, and a count greater than zero), so the three are decided where the closure is accepted, a finding outranks a round and a denial outranks a round, and the total is the sum of the three with the split in parentheses; and, in the same test file, an assertion of zero that was the last digit of thirty -- `toContain('0 closed by a finding')` satisfied by `30 closed by a finding` for every round since it was written, under a comment that said the live list closes nothing when the line counts the index **and its volumes**, exposed only when the noun beside it changed, and replaced by a reader that takes a count as the number between a delimiter and its label; and the window between a closure's verb and its citation, which excluded the character `v3.81` contains, so `O-057`'s **58** characters from `Closed at v3.81` to `(finding 511)` were behind a full stop that is not one -- the boundary is now a period followed by whitespace, measured over **797** bullets of the record, the index and the seventeen volumes with exactly **1** reading differently, which moved the split **43 → 44** findings and **10 → 9** rounds; and a language rule that measured a **paragraph** in runs of **eight** Han characters and applied the same unit to a **heading**, where the traces of the document that was being translated live in the number: **28** headings across **three** volumes were invisible, **27** of them a Han numeral and **one** an English numeral followed by the ideographic comma, which `\p{Script=Han}` does not contain at all and which the error line would have called a Han character; the unit is a property of the position now, the error line counts **characters** rather than Han characters and the summary says **non-English** prose; and, in the same test file, a test that proved a heading flushes the paragraph by asserting `status === 0`, which every implementation produces because `## ` stands between the characters on either side of it -- the witness that can tell the two apart is `pairs`, `0` against `2` on the fixture, and the test reads it now; and the census `O-085` asked for, taken by prefixing a `9` to the first digit of every `toContain` literal that begins with one: **268** files, **2,736** literals, **249** starting with a digit, **240** outside a negation, and **240 red** -- no assertion in the suite is satisfied by a number it does not read, and the question a substitution cannot reach is stated instead of closed; and a field named for where a bound comes from, answering with two values for three sources -- `null` for a step the job bounds and for a step nothing bounds alike, so the gate's own line said `62 of 83 step(s) bounded` over a workflow with **0** unbounded, and the rule that refuses a partly-bounded job asked that field for `null` and would have gone silent in the round that repaired it (**62** of **83** carry their own bound, **21** are bounded by their job's, **0** have none); and the superlative beside it, printed as `tightest  at unmeasuredx` on a workflow whose every step inherits its job's budget -- an empty subject and a unit with no number, reachable, not an error, and now a sentence of its own; and the rule that compared the recording with the ledger's newest row, where the log had stopped writing that row **65 rounds** ago -- **215** round sections hold **12** closing readings, the newest under `v3.54`, so a recording from any run newer than `42160224254` passed and the one in the tree was **3** CI runs behind -- repaired as a rule about the present (the newest round must carry a row that names a run and states `**n of m jobs success**`, `m` against `ci.yml`'s **8**) rather than by inventing **203** rows, with the distance printed on the green line; and a run id that was not a CI run id, where `44516888822` -- **one** job, `Anchor round trip` -- was reported as a CI run with eight, the two workflows drawing from one sequence; and three bounds the stale recording had kept from being asked, **1.08x** (`Install a backend`, 16 min against **888** s), **1.83x** (`Every gate can be shown to fail`, 9 min against **295** s) and **1.92x** (`Gate-test battery`, 8 min against **250** s) against a multiple of two, raised to **30** / **10** / **9** min with the `backend` ceiling **34 -> 48**; and two gates that printed one word for two populations -- `check-progress-volumes` said `268 round(s)` for every `## ` heading its volumes hold while `check-open-list` said `215 round(s)` for the numbers -- with **215** `vX.YY` rounds, **1** addendum, **50** `Pass` rounds and **2** unnamed headings adding up to the 268 on the page, the partition printed on every run and the two readers agreeing through a derived assertion rather than a second literal, and a heading shaped like a round that one reader can name and the other cannot now refused; and the ledger row that counts the numbers by hand, one behind the log for five rounds (**210**, **211**, **212**, **212 -> 213**, **213 -> 214** against **211**..**215**, the newest printing its own contradiction `94 in v2, 120 in v3 (v3.00..v3.120)`), now a rule that a stated count must be the count the corpus has; and one gate's population line publishing **597 open with a reason** over a live list that held **37**, forty lines above the stamp that printed the 37 -- the walk knew each section's kind all along and the summary threw it away, so **560** restatements of the same residuals in rounds' records were counted as work: the line is a partition of tallies now (**37** open in the live list; **560** restated in the log's records with **30** closed there; **56** closed in the record of closures), summed from its parts rather than counted beside them, with the section count split the same way (**180 of 227** -- **47** sections hold **318** rows and no entries) and the id line naming its two lists (**94 = 38 + 56**), the stamp and the summary held equal by a derived assertion, and **8** falsifications over **56** reds; and the line below it, which counted a subset with the noun of the whole -- `226 record(s)` on one line and `47 record(s) in table form` on the next, one noun over two populations with no word saying the 47 is inside the 226, repaired as `47 of 226` with the denominator taken from the same variable the population is printed from and the two lines held equal by an assertion that could not see the defect while both numbers were right (**6 + 6** reds over two edits); and a workflow-wide `bounds total 327 min` beside `51 min measured`, a division across **eight** different ceilings that no bound in the file is argued from, where the comparison that decides whether a bound can fire -- a job's bounds against the ceiling above them -- was printed by no line, and the sum rule that would have made it asked for ceilings of **21** minutes over a **46**-second job and **83** over one that takes 15 because six preparation steps carry a three-minute floor in every job, so the rule written instead is the ceiling's own multiple; and the ceiling, which had none: `verify` at **18** min over a **601** s day (**1.80x**), `batteries` at **25** over **1012** s (**1.48x**) and `batteries-heavy` at **27** over **921** s (**1.76x**) against a multiple of two that every *step* bound already had, repaired to **21** / **34** / **31** min -- `batteries` moving against v3.121's own reduction, whose argument finding 604 refuses -- with the day taken from one reading rather than from a composite of ten and a reading with a step missing skipped rather than summed (**4** edits, **14** reds) | and **9** nouns that cross gates, printed by one reader for the first time -- `row(s)` in four, and `8 row(s)` twice for two unrelated tables (**3** edits, **3** reds); and the subset that was a subset: `67 file(s)` inside the `474` the comment guard reads, unstated across four summaries, repaired as `67 of the 474` with the denominator derived from the walk and a sixth rule refusing an `of` whose inclusion has stopped holding (**2** edits, **2** reds); and the census whose first sentence called every coincidence 'one number over two populations' while the first one it printed was one population read twice, so the judgement is written per gate pair and `--write` will not invent one (**3** edits, **5** reds); and the same census printing which gates share a noun and never what they counted -- `volume(s) by 2` over one gate's **14** and another's **18**, forty lines apart in one log, repaired to a line per shared noun holding every gate's number and the relation a person writes, the nine shared nouns now each carrying one and the refusal moving from the three coincidences to all nine (**2** edits, **7** reds); and the qualifier that the repair of finding 600 inserted, which the reader that finding 607 added could not see past: `219 `vX.YY` round(s)` carries no number at all under the pattern that allowed only a parenthetical, so `round(s)` was shared by two gates with no count under it and `219` against `219` -- the one coincidence in this census a reader would most want compared -- was invisible, the census's own count going **3 -> 4** when it was repaired (**3** edits, **8** reds); and three noun uses whose number the reader could not see, dropped in silence so that a count of what was read was published as a count of what is there -- `budget(s)`, `scope(s)` and `enum call(s)`, with `1248 '#' mark(s)` recovered by the same repair that reads a backticked era (**1** edit, **1** red); and a job that ran a claimant against a one-commit checkout, where `check-repository-table` reads `Commits (at `e22e2de`) = 536` out of `git rev-list` and a `git clone --depth 1` answers that the revision does not resolve, which made the census red, the claimant a file that did not pass, and cost **three** CI runs before it was measured in a shallow clone and repaired -- with a test holding the relationship rather than the line, in both directions (**2** edits, **2** reds); and the failure that could not be read, where `outputTail` was written for a run that printed no report, documented as "the caller then had a file, an exit code, and nothing else", and imported by nobody, so `failureDetail` is the path and the label that keeps a tail from reading as a report (**2** edits, **2** reds) and the rule that a job which runs a claimant checks out the history the claimant reads, which was written as a list of four commands -- `docs:check`, `verify-site-proofs`, `pnpm test`, `test:coverage` -- and did not hold `verify-sites-are-sensitive`, which runs claimants of its own, so the next run moved the same red from `verify` to `sensitivity` with nothing changed in between, in a depth-1 clone measured three ways (`check-repository-table` refusing the revision, the census red, **1** of **26** cases failing): the default is the full history now and the one exemption is a job whose `run:` lines are read one at a time against the four commands it is exempt for, with the checkout cost measured at **3.0** s against **1.0-2.0** s and the history at 34 MB against 5.1 MB (**3** edits, **4** reds); and the four readers of a failed run, three of which were written where a pipe is not a terminal: through a terminal vitest wraps `FAIL`, the error line and the totals in escapes, so every anchored pattern missed and the battery printed "the run printed no report" while the report was three lines above it in colour -- **216** escapes in the run that was measured, and the fourth reader measured not to need the repair because its pattern is unanchored (**4** edits, **8** reds); and the census's judgement, which was a sentence and nothing else: the part of it a run can decide -- whether a group of gates reads one set, whose consequence is that their counts must agree -- now lives in a partition of the noun's gates rather than inside the prose, so `disjoint` is derived instead of asserted and a population of two whose numbers diverge is refused, **3** of the **4** coinciding counts being checked rather than assumed after it, and the first partition written under the rule refused by the arithmetic itself (`14 and 18 volume(s)`) before any person read it (**8** edits, **13** reds); and the two of the nine sentences that were already wrong, in opposite directions -- one claiming a shared reader (`populationsOf`) that `check-open-list` does not import, one denying a forcing it had just described -- because the census checked that a sentence existed and never what it said; and the judgement that finding 616 keyed by the noun *and its gates*, where the argument for the key was about the partition and the key applied it to the sentence as well -- `check-ci-budget` prints `N round(s)` while the ledger is behind and stops when it catches up, so the noun moved **69 -> 70 -> 69** gate/noun pairs inside one round and a sentence that had not stopped being true was retyped three times; the record lived on `shared`, which is derived, so a noun printed by one gate would have taken its sentence with it under any key, and it lives on the noun's entry in `nouns` now; and six readers that asked the partition for the gates and were answered out of `judgement.gates` -- the record -- so every one of them compared the record with itself and a gate joining the noun changed nothing, repaired as `partitionProblems(judgement, gates)` over the set the census found, with `stateOf` returning the three answers together so no reader holds its own; the refusal a newcomer produces names the gate (`round(s) (check-ci-budget is in no population)`) rather than the key, and **2** mutations -- the unplaced-gate rule removed, and the record read from `shared` -- are killed by one case each; and the ceiling of every CI job, which `R12` sized from **one day** while the bounds inside the job are sized from **each step's worst day** -- a composite, not a day -- so `batteries` held **83** minutes of bounds in **34** and the day its own bounds describe is **41.5** minutes, 1.22x the ceiling that was meant to hold it: v3.123 had refused the sum on the ground that a ceiling which cannot fire is the same defect as a bound which cannot, and the symmetry does not hold, because a bound that cannot fire has nothing behind it while a ceiling has every step bound behind it, so the ceiling is the one number in a job whose job is not to name anything -- a backstop for a bound that did not fire -- and the price of the wider number is wall clock rather than a verdict; `R13` is one comparison with two terms and a stated winner (`max(2 x the slowest day, the bounds + 2 x the seconds no step spends)`), `R5` is deleted rather than kept beside it because `bound + prefix` is at most the sum, the overhead is **measured** rather than stated (the recorder writes each job's own wall clock, refused when absent, doubling what it holds: **3-8** s per job), and the six ceilings the bounds hold move **25 -> 58**, **48 -> 49**, **26 -> 47**, **26 -> 44**, **34 -> 84** and **31 -> 55** against **331** minutes of bounds and **50** measured, with the green line printing which term holds each one; **4** mutations -- the overhead dropped, the day term alone, a missing `total` accepted, the inherited bounds counted -- are killed by **24** reds; and **a sentence in the record states a figure no gate prints** -- `comment(s)`'s relation said the smaller corpus was 4.7 per cent of the larger, this run's two counts make it 4.842 and for 4.7 to hold the numerator would be **1,215** or the denominator **26,638**, so the sentence was a copy of a pair one of which had moved, which is the one count in a record that keeps counts out on the ground that they move; **five** of the nine relations state **eight** figures and one is wrong, both doors read them now (`figuresOf`, `unprintedFiguresOf`) and refuse a figure that is not a count a gate printed under that noun -- `--write` too, because it copies sentences forward verbatim -- with a numeral glued to a letter, a hyphen, a dot or an underscore counted as a name (`L4`, `check-l4-status`, `v3.129`) rather than as a number, measured by removing the glue test, which reddens the shipped tree on `row(s) states 4`; and the label a population of one was said to need turns out to be the relation's -- **20** uses behind the **19** single-gate populations, their words after the noun empty in **8** and a broken parenthesis in **2** (`(21676 line`) against **6,047** characters of the gates' own lines, while **eight of nine** relations already name every population they partition; **5** mutations -- the reader blinded, the glue test removed, the run's check dropped, `--write`'s check dropped, only the first figure reported -- are killed by **9** reds; and the volume's own header had said `579–599` and `v3.120` for nine rounds of appends, which no gate reads and which the round corrected; and **a size stated in the live list, and nothing read it** -- `O-019` argued that `docs/acceptance.md` is too big to keep growing and quoted **96 KB** while the file was **165,067 bytes**, `L3` was 46 lines longer than the entry said, and the per-round clauses it leaned on were **897 lines** and **77,180 bytes** against the **139** and **11,139** it stated -- so the entry that argues the history has outgrown the specification was quoting the history at a sixth of its size, and **nine** figures in `## Open` carry a unit a commit can take again while **six of the seven** the reader reaches are wrong; the rule is **say when, or be this tree's** -- `161.2 KB at v3.131` is a record, `165,067 bytes` is a claim that holds only while true, and the four units are the ones a commit can take again (`439 s` and `84 minutes` measure a run that is over, and no gate can take them) -- which is why the census's rule one document over is the **same claim for the other subject**: a census sentence describes the vocabulary now, so a figure in it must be a count a gate prints, and a live entry describes a defect at a round, so its figures are measurements and the thing a measurement needs is a date; three things a pattern does not say are read rather than assumed -- a **quotation** is not the list's claim (`O-101` could not report the 96 KB without quoting it, and a rule that refused the quotation would refuse the report), a sentence **ends at a full stop inside a bold mark** (`round.** L3 is 284 lines` paired a section's length with the document's when it did not), and the **lead-in** of the section is the list's voice too, which held `65,544 of 98,927 bytes` **by** v3.110 and is read now; **eleven** mutations -- dated-always, dated-never, quotations read, a plain sentence end, exact match only, no sentence guard, the lead-in unread, every kind read, an empty text one line long, a wrapped figure kept wrapped, a length compared in bytes -- are killed by **22** reds; and **the floor, spent once per job rather than once per step** -- **47** of the workflow's **62** bounds were the number three, together **141** of the **331** minutes the bounds added up to, against **52** minutes measured, and `batteries` alone carried **48** of its **84** in sixteen steps that spent **165** s; the **prefix** is the leading run of steps every job shares, name **and command** both, and its allowance is the floor spent once (`PREFIX_MINUTES`), so a prefix step may not declare a bound of its own, a work step is bounded by twice its own day, `R13`'s `bounds` term holds the allowance, and a job promise names only the steps that carry one -- **38** steps bound themselves after it, **32** are charged to their job's allowance, **13** inherit their ceiling and **0** are reached by nothing, with **216** minutes of bound plus **24** of allowance where there were **331** and ceilings of **275** where there were **372**; the floor was on the wrong object because a bound buys **attribution** rather than slack -- a step dies at its own bound and names itself, whichever number it is -- and the one case it was for, a step no run has measured, still has it; **`R10` refused the round's own first number**, a 2-minute bound on a battery whose recording says 54 s and whose slowest day is **70 s** in run `44576264388`, which is the only bound left at the floor in the whole workflow; **`R6`'s refusal of every narrower ceiling is deleted** rather than kept beside `R13`, because the number it was demanding a re-measurement for is twice the slowest day plus twice the overhead, which `R12` asks with its own sentence -- **six** ceilings narrowed that way (58->39, 49->36, 47->34, 44->33, 84->54, 55->44) and printed beside every widening, while `artefacts` 15 and `cold-tree` 20 are **kept** because the day their recording holds is the warm one and the job's subject is a cold tree; one divergent job caps the prefix for every job (`backend` has no shells step, so the shared prefix is four for all eight), a workflow of one job has none because nothing is common with nothing, and `verify:local --list` lost the sentence it printed for a job that bounds every step -- no job does any more -- which a case now drives directly; **nine** mutations -- the prefix always empty, name without command, a prefix in a one-job workflow, the allowance growing with the prefix, a prefix step allowed its own bound, the ceiling not holding the allowance, a promise naming the prefix, the summary hiding the allowance, the narrower-ceiling refusal restored -- are killed by **58** reds, the sixth surviving the first run of the table until a case put a ceiling eighteen seconds short of the allowance; and **a distance of zero, spelled in words** -- the ledger sentence printed `, in the newest round` when the ledger's newest row sat in it and `, N round(s) before \`vX.YY\`` when it did not, so `check-ci-budget` printed `round(s)` in one state and withheld it in the other: one recording apart, and the census that v3.132 had just recorded the gate under refused the tree one round later (`check-ci-budget is in a population and does not print this noun`), which is finding 618 one level down -- the set of gates did not move, whether one member printed the noun did -- repaired by printing the number in both states (`0 round(s) before \`v3.132\``), **4** mutations over **7** reds; and **the one number in the budget that no reading can derive**, where the three-minute allowance is held by every ceiling this workflow has and the cold runner it exists for has never been recorded: **21** readings and **8** jobs, the slowest prefix any of them timed is **14 s** (`backend`, run `45033355331`) and the allowance is **12.9x** it, so `R15` refuses an allowance under twice the slowest **whole** prefix -- a row missing one setup step sums to less than the prefix cost and is skipped rather than summed -- and the summary prints the multiple beside the number, **5** mutations over **6** reds, the fifth surviving a one-job fixture and killed by a second job four times slower; and **an axis that was a regular expression's opinion**, where `O-019`'s census called a bullet with a finding number provenance and reported **125** rules against **92** recollections while the first section it misread -- `The two sentences in one entry (v3.63)` -- is **three** bullets, **three** rules and **three** citations: the file is case law, so it owes an **address** (finding, falsification table, run, test file) and a round in the heading, the **3** clauses written before this log carried finding numbers gained the test file that drives each, and the **39** clauses across **30** rounds now sit behind an index of headings and rounds compared line by line and carrying no links, because a GitHub anchor is a slug that fails silently when it is one character off (finding 621's shape) -- **7** mutations over **14** reds, and the gate's own first sentence printed `v3.116 to v3.79` until the sort was made numeric; and **a census with one word for a count and one for a measurement**, where `round(s)` is printed by four gates and one of them states a distance -- `O-104`'s question since v3.133; the record had one word for a gate group, so the distance was written as a population of one reader, the same shape as a corpus, and the census's own line repeated it: **27** placements, **6** in populations two or more gates read, **20** in populations of one gate and **1** that is not a count of its noun; a third placement (`separate`: a gate and the sentence that says what it measures, refused without it, outside the noun, beside a population, or twice) and a sentence held to that gate's own figures -- `check-ci-budget` may state the `0` it prints and not the `50` that `check-progress-volumes` prints -- with the green line printing the declaration after the populations rather than in gate order, where the zero led the line looking like a count, and the summary accounting for all **27** placements rather than only the **3** populations -- **12** mutations over **29** reds, the tenth surviving until a record carrying only declarations was written; and **a marker with two classes over a corpus of three facts**, where `8 row(s)` -- two tables the record places in populations of their own -- was printed in the same words as an equality nobody had examined, because `coincidencesOf` asked whether one population held the gates and a partition of two cannot hold three answers: **3** `together`, **1** `apart`, **0** `unplaced` at v3.136, with the three counts printed whenever any coincidence exists so a size that moves is a number that moves rather than a clause that vanishes; the first draft's `markerOf` built a list of sentences for a state that cannot exist -- `unplaced` is what an undeclared noun's coincidences are and `apart` what a declared one's are, because a partition that leaves a gate unplaced is refused -- so the branch was dead before it ran once -- **12** mutations over **52** reds, the first being this round's own `gates.every(... groups.some(...))` written the other way round, and two rows of the table surviving the first run because it was measured on a tree whose documents were still being written -- the summary printing `0` for the unplaced count and computing the apart count as the rest, both invisible while no fixture put a number in either class; and **a bound that was inside the multiple by six seconds**, whose own comment named a smaller number than the one it carried -- the `lint` bound went to 17 minutes at v3.126 against a 507 s reading (twice is 1,014 s, inside 1,020 s by six) and the workflow's narration stopped at `16 from v3.124`, so the round that took its own recording -- which `R7` requires -- was refused by `R12` at 521 s; the repair is a paragraph and a minute (18, which is 2.07x, 38 s above the multiple), the verify ceiling 39 -> 40 for the arithmetic its own comment states (2,160 + 180 + 8 = 2,348 s), and the six readings are two populations rather than one distribution -- 307 and 334 against 501, 503, 507 and 521, a warm and a cold `prelint` -- so the minute is arithmetic and the structure is `O-108` (two of the step's seven members spawn the tree and run a suite in each) and the dispersion is `O-109`; and the middle of a bound's axis, printed for whichever bound happened to be tightest while the bound nearest a usual day was a different one (`2.4x` for `batteries-heavy / Backend-support battery` against `2.0x` for `backend / Install`, and `2` of the `38` bounds dividing by a middle of `0 s`), now a range over the population; and a range over the history that mixed the tree's growth with the runner's variance, which one tree read twice separates -- attempts 1 and 2 of run `45351350110` differ by up to **151 s** on one step and by **141 s** on `lint` itself, with 28 of 83 steps identical and 1,136 s of absolute difference; and a run id that was the identity of a reading, so a re-run's second measurement could not be written down at all -- `readReadings` refused it, `mergeReading` replaced the first attempt with it, and the recorder could see only the latest attempt, which is why the identity is `(run, attempt)` now; and the span a round publishes about its own size, which was the one count in the corpus that no rule read -- **105** `new tests` rows, **74** spans, and **5** of them ending nowhere near the count the round had published beside them, four of them because a later round dated a fresh measurement to an earlier round (**70** of the spans are about `core` and **1** about `repo`, and the corpus says which nowhere); and the two spellings of a date, one of which read as no date at all -- fifteen rows in five rounds that rule 3c could not refuse a future date among, and five spans that had no count to compare with until one pattern took the backticks as optional; and the bound's headroom measured in the movement one tree has already shown, which turned `O-121` into a negative -- at twice the day a movement can never exceed the headroom, so no refusal is possible, and what the round could do instead is say that the narrowest margin is **2.2x** a movement (`sensitivity / Install`, 222 s over 99 s) while **8** bounds rest on a step that did not move at all; and the seven sentences that named a run where a reading belongs, since a re-run made one run two measurements -- the same defect in four shapes, latent today because the slowest reading of the history's only pair is an attempt 2 whose bound is 1080 s; and the recorder's own ordering, which decided older, newer and the same on the run id alone, so `--attempt 1` after `--attempt 2` wrote a recording the history's tail is newer than -- `R10` refusing the tree the recorder had just written, with advice the recorder had just been asked to take -- while `--seed --attempt 1` of the recorded run was refused as "the recording" and the pair a bound's margin is measured against could not be appended at all, and a recording that would not parse was overwritten in a silence the history beside it does not permit: one `orderOf` answers all four callers now, and **16** mutations red **40** tests with no survivor; and the recorder wrote numbers that were never durations -- a step that expires spends exactly its bound, so `R4` compared a bound with itself and advised doubling it, which turns a hang into slack -- while a step stopped four seconds in recorded four seconds; the recording is now taken only from a run that succeeded and a number equal to its own bound is refused, a red seed keeps only the steps that ended on their own (**1 394** bounded step-seconds in the history, **0** at or within 6 s of their bound, so the refusals fire on the next red run rather than on any shipped row), and **12** mutations red **17** tests with no survivor; and the arithmetic that separates a duration from a bound was done with today's bound -- a seed's day wrote its own, so the recorder reads `ci.yml` at the seed's `head_sha` and holds each `failure` step to the bound that day enforced: at or above it the number is that bound and the step is dropped, a step that day gave no bound of its own is kept because a job timeout cancels rather than fails, and a day whose workflow cannot be read refuses the seed rather than appending a number it cannot tell from a bound; a seed is no longer held to today's bound at all, which refused a duration a wider day had allowed, and the request is made only when the run holds a step the API called `failure` -- **38 readings of 37 `success` runs, 0 of 3,134 step entries reachable** -- and **10** mutations red **30** tests with no survivor. |

**Where a new finding goes.** Append to the last volume. When it would grow past
280,000 bytes, start the next volume -- one number higher than the last, holding the
new finding and nothing else -- and add its row above with the first and last number
it holds. The name is not written down here: a next-volume name in prose is a number
that has to be retyped on every split, which is the defect the byte column had. The sizes are not printed here because they
change on every append and a table of stale numbers is worse than no table;
`node scripts/check-audit-volumes.mjs` prints the largest volume against the budget,
and fails if a volume is over budget, if the numbering gaps, or if a volume exists
that this table does not name.

**Two sections sit between findings 44 and 45** -- [Method](#method) and
[Retractions](#retractions) -- and they are here rather than in a volume because
they are about the log rather than about one entry.

## Summary

### Pass 1 — scoring path

| # | Defect | Reproduced as | Status |
| --- | --- | --- | --- |
| 1 | The official-metric regression graded its own answer key | 4 of 4 corruptions silent | fixed |
| 2 | `rateOf` scored an empty denominator as a perfect match | `{"process":1,"chainNodeMatch":1}` → 100 | fixed |
| 3 | `checksumRate` divided by the anchor set, not the export | 1 anchor, 22 files → `score: 100` | fixed |
| 4 | `aggregateFor` had no branch for `openrca-2.0` | `final: 0` beside `accuracy: 0.75` | fixed |
| 5 | AIOps2025 `explainability` scored an empty corpus 1 | empty export → `final: 10` | fixed |
| 6 | A vacuous structure report earned half the score | empty export → `score: 15` | fixed |

Finding 6 was not in the original audit. It surfaced while building the guard for
finding 2 and is recorded because it is the same error one level up.

### Pass 2 — OTLP ingest

| # | Defect | Reproduced as | Status |
| --- | --- | --- | --- |
| 7 | `asInt: 42` (numeric form) lost the data point | legal document → 1 quarantine, 0 signals | fixed |
| 8 | Nanoseconds scaled by the float `1e-6` | 1 ms span → `0.999755859375` ms | fixed |
| 9 | Span status delivered by enum name was dropped in silence | error span → no `status`, no quarantine | fixed |
| 10 | `severityText: ''` quarantined as an invalid severity | 1 signal → 1 quarantine entry | fixed |
| 11 | A sub-millisecond inverted span truncated to a legal 0 ms | `-1 ns` span → `durationMs: 0` | fixed |

Finding 11 surfaced while building the guard for finding 8: once durations were
exact, the negativity check was revealed to be reading the truncated value. It is
recorded separately because the fix is a different one.

### Pass 3 — LLM transport and fault importer

| # | Defect | Reproduced as | Status |
| --- | --- | --- | --- |
| 12 | Only `choices[0]` was read, discarding a usable answer | 2 choices, 2nd usable → threw | fixed |
| 13 | A null choice leaked a raw `TypeError` | `choices: [null]` → `Cannot read properties of null` | fixed |
| 14 | `''` accepted as a completion | empty answer indistinguishable from a real one | fixed |
| 15 | Category read verbatim against a case-sensitive vocabulary | `NETWORK` → parsed `ok`, then `valid: false` | fixed |

Finding 15 is the only one in this report where the defect spans **two functions**
rather than sitting inside one: the prompt never stated the rule the parser
enforced. Reading either file alone shows nothing wrong.

### Pass 4 — LLM rule generation and the Anthropic adapter

| # | Defect | Reproduced as | Status |
| --- | --- | --- | --- |
| 16 | A layout field outside the contract was dropped, not rejected | `{"timstamp": "time"}` → parsed `ok: true` | fixed |
| 17 | A cross-kind field name passed the membership check | `spanName` in a metric layout → accepted | fixed |
| 18 | `semanticType` was cast, not checked against its enum | `"not-a-real-semantic-type"` → reached the IR | fixed |
| 19 | An empty sample set validated as a pass | `validate(layout, 'metric', [])` → `valid: true` | fixed |
| 20 | The prompt never named the semantic-type vocabulary | prompt printed the field, not its values | fixed |
| 21 | Only `content[0]` was read | leading `tool_use` block → threw, answer discarded | fixed |
| 22 | A completion split across text blocks was truncated | 2 text blocks → returned the first only | fixed |
| 23 | A null content block leaked a raw `TypeError` | `{"content":[null]}` → `Cannot read properties of null` | fixed |

Findings 17 and 20 surfaced while building the guard for finding 16, and 22 while
building it for 21. They are listed separately because each has its own fix: the
membership check had to become per-kind, the prompt had to name a vocabulary it
had only ever named as a field, and reading every block is a different change from
reading more than one.

### Pass 5 — CLI argument parsing

| # | Defect | Reproduced as | Status |
| --- | --- | --- | --- |
| 24 | `evolve stale --cases` was checked for JSON-ness, not for the array its consumer needs | `'{"not":"array"}'` → parse `ok: true`, then threw mid-command | fixed |
| 25 | `--anchors` checked the outer object, not its entries | `{"a.txt":123}` → parse `ok: true` | fixed |
| 26 | `--assume-offset-minutes` was any finite number | `1e21` → core `RangeError: Invalid time value` | fixed |
| 27 | The window flags used `/^\d+$/` and `Number()` | 21-digit literal → `1e20`, silently | fixed |
| 28 | A path flag rejected `''` but not `'   '` | `--path "   "` → parse `ok: true`, then ENOENT | fixed |

All five are the same error at five sites: a check that establishes less than its
consumer requires, so the parser reports success and a later stage reports
failure. They divide into two lessons.

**Findings 24 and 25 — "is JSON" is not a contract.** `JSON.parse` succeeding
says the text is well-formed; it says nothing about what the value is.
`evolve stale --cases` feeds `runEvolveStale`, which calls `.map` on it, and
`--anchors` feeds a hash comparison, which can only ever compare strings. Both
were accepted as any JSON at all. The fix is that each flag names the shape its
consumer needs, at the boundary, so the caller learns the shape was wrong from a
message that says so.

Note which flag was *not* changed: `ingest --cases` carries a file **path**, not
JSON, and a path may be any string at all. Sharing a flag name across two
commands is not the same as sharing a contract, and finding 24 exists because the
first draft of this report conflated them. The acceptance criteria are now stated
per command, and a test pins the `ingest` side so nobody "fixes" it later.

**Findings 26 and 27 — `Number()` is not a parser.** `Number.isFinite` and
`Number.isSafeInteger` describe a value; they do not describe the text that
produced it. `Number('0x10')` is 16, `Number('1e3')` is 1000, and a 21-digit
literal is a double that is no longer the literal. Finding 26's `1e21` reached
`Date.toISOString()` and threw `RangeError: Invalid time value`, which is a core
exception surfaced to a CLI caller as though the command were broken; finding
27's window *did not throw at all*, which is worse — a lead window of `1e20` ms
is roughly three billion years, it parses, and nothing downstream ever notices.
The fix is one `parseInteger` used by every integer flag: a decimal-integer
pattern, an exact round trip through `String(n) === text` to make precision loss
observable, then a range the flag's own meaning supplies.

**Finding 28 — blankness is a value, not a length.** `''` was rejected and
`'   '` was not, so the same mistake typed with spaces opened a file named three
spaces. The fix tests blankness after trimming, on every path flag, and returns a
distinct `null` for blank versus `undefined` for absent — because "the flag was
not given" and "the flag was given something unusable" are different errors with
different messages.

### Pass 6 — the official-data round trip

| # | Defect | Reproduced as | Status |
| --- | --- | --- | --- |
| 29 | `caseDirName` deleted hyphens from the component, so the round trip read a path that does not exist | `ts-order-service` → `dataset/tsorderservice/…` | fixed |
| 30 | `unzip` was invoked unconditionally, including on assets that are not archives | a `.csv` asset → `unzip: cannot find zipfile` naming no asset | fixed |
| 31 | The case-descriptor generator dropped its warnings when every case was skipped | empty result, empty stderr, exit 0 | fixed |
| 32 | The archive fixture in the fetch test was malformed in the way the *script* was suspected of being | `unzip`: `End-of-central-directory signature not found` | fixed |
| 33 | A byte count was pinned with no digest beside it, and the fetch enforces the byte count | `rcaeval-baro-simple`: `bytes: 570409`, `sha256: null` | fixed |
| 34 | The registry named a cross-repository cache read that cannot work | six shards, `total_count: 0`; scope is per-repository | fixed |
| 35 | *(withdrawn)* The backoff guard was blamed for a 9-second delay it did not cause | restoring the guard left the time unchanged: 9.074s → 9.075s | no defect |
| 36 | `--retry-connrefused` and the attempt loop both retried; the elapsed time measured curl's retries | refused connection in 0 ms reported as `after 3.0s`; removal: 9.075s → 0.067s | fixed |
| 37 | `--fail` collapses 4xx and 5xx onto exit 22, so the classifier could not tell a 404 from a 500 | 404, 500, 503 all exit 22; only the message differs | fixed |
| 38 | The corpus summary counted directories under the word "file" | `found N file(s)` where N included directories | fixed |
| 39 | A 2.8 GB download was verified with `readFileSync`, which cannot read above 2 GiB | `ERR_FS_FILE_TOO_LARGE` on `RE2-TT.zip` after two assets had measured clean | fixed |
| 40 | *(withdrawn)* The partial run was said to discard its measurements on a non-zero exit | the report **is** written before the exit code: exit 1, report present, 1 pin | no defect |
| 41 | Every fixture was under one digest chunk, so a prefix-only digest passed the suite | `break` after the first `hash.update`: 30/30 green, digest changed | fixed |
| 42 | The corpus reader assumed our exporter's flat layout; the corpus is nested three deep | `derive the case descriptors` found no cases under a tree full of them | fixed |
| 43 | The CI fixture that exercised finding 42 was itself written in the old flat layout | the fix passed locally and `anchor-roundtrip.yml` still failed on `RE2-ts-order-service-cpu_1` | fixed |
| 44 | `official-data.yml` had no concurrency group, so a second dispatch cancelled the first | two runs of 2026-09-20 both `cancelled`, neither producing a measurement | fixed |
| 45 | The corpus walk read every file in the tree into one `Record<string, string>` | exit 134 on the real corpus: `heap out of memory` at 4182 MB, no `ROUNDTRIP` line | fixed |

Findings 31 and 32 are not defects in shipped code. They are defects in the
*instruments* — the generator's diagnostics and the test fixture — and they are
listed because each one produced a green result that would have been read as
evidence. A warning that is swallowed and a fixture that cannot be parsed both make
a test pass for a reason that is not the reason the test exists.

Findings 33 and 34 came from building the guard and then running it against the
shipped registry, which is worth recording as a method note: both were *in the file
this pass was writing about*, and neither was visible from reading it. 33 is a
number that looks like a measurement and is not; 34 is a mechanism that sounds like
a mechanism and is not. Reading the registry would have found neither, and the
second one had been repeated in the workflow comment and in the progress document
before it was measured.

Findings 35 through 37 came from *timing* the failing path instead of reading it, and
that is the method note for this pass — together with its counterexample. The fetch
had already failed once on a real runner, and the only thing that failure report
established was that it took twelve minutes, which is not what a missing URL looks
like. Reproducing it locally against a loopback server that refuses in microseconds
turned "it failed" into three separate observations, of which **two were real defects
in code this pass had just written** — a second retry mechanism that corrupted the one
measurement on the line, and a classifier keyed on a number that `--fail` overwrites —
and one was a defect in the *audit* itself.

Finding 35 is the counterexample and it is the more useful half. The number was
measured honestly and the cause was then attributed to the nearest suspicious-looking
code, which is a reading of the source that borrows the probe's authority. The check
that separates measurement from attribution costs one command — remove the suspected
cause and see whether the number returns — and it was skipped once, in a pass whose
whole argument is that it should not be. Findings 36 and 37 were then confirmed by
that check, and 36's fix is justified by a removal table rather than by a claim.

Findings 39 through 41 close the pass on the first run of the path this whole
document is about, and they divide cleanly into the three kinds of thing an audit
finds. Finding 39 is a real defect, in code written for this pass, on the first
input large enough to expose it — the two assets that came first were both under
2 GiB, so the ceiling could not have been visible earlier in the same run. Finding
40 is a *withdrawal*: the mechanism was inferred from two log lines rather than
measured, and the measurement contradicts it. Finding 41 is a gap in the tests
that only an injection could reveal, and it is the one to read if you read only
one: the suite was green, the codepath was wrong, and the reason was that no
fixture was ever large enough to tell the two implementations apart.

### Pass 7 — the corpus's layout, twice

Findings 42 and 43 are one defect found twice, and the second time is the more
instructive of the two.

**Finding 42.** The third real run fetched all three assets and then failed at
`derive the case descriptors`:

```
error: no RCAEval case directories found under '/tmp/official'.
Expected names of the form {RE1|RE2|RE3}-{service}-{fault}_{instance} each holding inject_time.txt.
```

The pattern in that message is the defect stated plainly. `RE2-order-cpu_1` is
the name *our exporter* writes. The corpus does not contain it, at any level,
because the corpus is nested:

```
RE2-OB/checkoutservice_cpu/1/inject_time.txt
```

The upstream harness says so twice. `main.py` finds the cases by globbing
`**/data.csv` and reads the labels back out of the path —

```python
data_dir = dirname(data_path)                                      # …/{service}_{fault}/{run}
service, metric = basename(dirname(dirname(data_path))).split("_")  # service, fault
case = basename(dirname(data_path))                                 # {run}
```

— and `docs/TORAI.md` prints the tree for the RE2 conversion:

```
data/torai-OB/{service}_{fault_type}/{run}/inject_time.txt
```

So a case is three components with the suite fused to the *system* in the first
one. `RE2-OB` alone is neither a suite nor a case; `checkoutservice_cpu` alone
carries no run. No single directory name can carry the case, which is why a
per-component parse reported nothing over a tree full of cases.

The reason this survived every in-repo check is worth stating separately, because
it is a general failure mode rather than a slip. The reader, the writer and the
unit tests all agreed — the tests asserted `RE2-order-cpu_1` because that is what
`caseDirName` produces, and the reader was validated against what the writer
emitted. **A reader tested only against the writer describes neither the corpus
nor the writer's correctness; it describes their agreement.** Finding 29 had the
same shape and was fixed by widening the character allow-list, which made the
agreement more exact without making either side right.

The fix keeps the two layouts in separate functions rather than teaching one
function to guess between them. `parseRcaEvalPath` reads the corpus;
`parseRcaEvalDirectory` reads what we emit; `readRcaEvalGroundTruth` accepts
either. A single function that tried both would have hidden this mismatch and
would hide the next one, and the two layouts are not interchangeable — one places
the suite in a path component, the other inside a directory name.

**Finding 43.** The fix for 42 passed its unit tests, passed `pnpm test`, and
`anchor-roundtrip.yml` still failed on the same error. That workflow builds a
synthetic corpus and derives descriptors from it on every push, and the corpus it
built was one flat directory named — verbatim — `RE2-ts-order-service-cpu_1`:

```
mkdir -p /tmp/synthetic/RE2-ts-order-service-cpu_1
```

The fixture was written in the layout the reader assumed, so it had been
confirming the assumption rather than testing it. This is finding 42 one level
up and in the *instrument*: the code was wrong, and so was the thing that
certified it. Fixing the code alone left the certification intact.

The corrected fixture is the corpus's own shape, and the workflow now also
asserts the derived `caseId`, so a future drift in the path parse fails naming
the field rather than surfacing as a zero score:

```
CASE=/tmp/synthetic/RE2-TT/ts-order-service_cpu/1
```

Verified end to end after the fix, locally, on that fixture:

```
ROUNDTRIP PASS   1/1 RE2-TT/ts-order-service_cpu/1  target=rcaeval-re2  oracle=1.00 signals=80
ROUNDTRIP PASSED (1 case(s) round-tripped through the official layout)
```

**The method note for this pass** is that both findings are the same error —
*testing a thing against a copy of itself* — and that the second one was only
found because the first was fixed and the fix was then run against something that
was not the fix. Finding 41 was a fixture too small to distinguish two
implementations; finding 43 is a fixture too similar to the implementation to
distinguish two layouts. Both were green. Neither was evidence. The check that
finds them is not reading the test but asking what the test would do if the code
were wrong, and in 43's case the answer was *pass*, because the fixture had been
written from the code.

**Finding 44** is in this pass because this pass caused it. Three dispatches of
`official-data.yml` were issued at `307fb460` inside two minutes, and two of them
were cancelled by hand to stop them competing:

| run | revision | status | what it produced |
| --- | --- | --- | --- |
| [#35485498167](https://github.com/AgentiX-E/rca-bench-factory/actions/runs/35485498167) | `307fb460` | left running | the measurement |
| [#35485506741](https://github.com/AgentiX-E/rca-bench-factory/actions/runs/35485506741) | `307fb460` | `cancelled` during `Fetch the corpus` | nothing |
| [#35485547947](https://github.com/AgentiX-E/rca-bench-factory/actions/runs/35485547947) | `307fb460` | `cancelled` during `Fetch the corpus` | nothing |

The cancellations were deliberate and the reason for them was correct — three
concurrent jobs each pulling several gigabytes from a host we do not control is a
self-inflicted rate-limit. What the workflow lacked was any way to reach that state
without a human noticing, so the guard added here is the ordinary one: group by
anchor, `cancel-in-progress: false`. The `false` is the load-bearing part. A job
whose only product is a measurement should not discard a twelve-minute download to
start an identical one; a queued second dispatch is the correct outcome, and it is
also what makes a third concurrent fetch unreachable.

**The first version of this entry stated the cause wrongly, and the correction is
the more useful record.** It said the two runs "were cancelled by each other" and
that the dispatches had been "issued while the first was still fetching". The run
timestamps say otherwise. `35485506741` was created at 03:01:41 and recorded
`cancelled` at 03:02:40 — the same second `35485547947` was created, because that
is when the cancel request was issued. `35485547947` was cancelled at 03:03:34,
also by request. GitHub reports a manual cancellation and a concurrency
displacement identically, so the count of `cancelled` runs was consistent with both
stories, and the story that got written first was the one that did not require
checking the timestamps.

This is finding 40's lesson arriving again, in the same session: a measured
observation (two runs, both `cancelled`) with a mechanism attached to it that was
never probed. What distinguishes the two here is only that this time the
correction was cheap — `created_at` and `updated_at` on the two runs settle it in
one call — which is an argument for making that call before writing the sentence,
not after someone reads it.

The guard is worth having on its merits, and that is the claim this entry now
makes. It is not a claim about what happened on 2026-09-20.

**One consequence of the guard is recorded here, and it is the guard's own
counterexample.** The first run to fetch on the fixed revision,
[#35485498167](https://github.com/AgentiX-E/rca-bench-factory/actions/runs/35485498167),
was `cancelled` at 03:17:00, seven minutes into the fetch, and
[#35486129312](https://github.com/AgentiX-E/rca-bench-factory/actions/runs/35486129312)
continued on `eb4dae64` — a revision that carries the layout fix, where the
displaced run's `307fb460` did not.

The mechanism was **not** the concurrency group, and the timing rules it out
rather than merely failing to support it. `35486129312` was *created and started*
at 03:16:03, which is 57 seconds **before** the run it is supposed to have
displaced was cancelled at 03:17:00. A group that displaces runs cannot cause a
cancellation that predates the displacing run's own start. Two further
observations agree: both runs report `event: workflow_dispatch` with
`triggering_actor: Lambertyan`, and at the time of writing `35486129312` is
`in_progress` while nothing else occupies the group — so a second run in the
group did **not** displace anything, it ran alongside the first. That was the
open question this note originally posed, and the answer is *does not displace*.

**What cancelled `35485498167` is still not established, and is no longer
claimed.** An earlier revision of this note said it was a `POST
/actions/runs/35485498167/cancel` issued from this session. That is consistent
with the timestamps and it may well be what happened, but no request log was
kept for it and the claim cannot be checked, so it is withdrawn rather than left
standing on plausibility. All that is measured is the ordering: the cancellation
lands at 03:17:00, 57 seconds after `35486129312` started at 03:16:03, and that
ordering is what rules the group out.

The method note survives the withdrawal, because it does not depend on the
mechanism — and the withdrawal is a second instance of the same thing. A
plausible mechanism (the new group) was written up as the cause before the
timestamps were read; the timestamps falsified it in one comparison; and the
replacement sentence was written the same way, from what was plausible rather
than from what was recorded. That is now four times in this pass — 40, 35, and
twice here — and the second of the two is the one worth noticing, because it
happened *while* the lesson was being written down.

This is the same class of self-inflicted diagnosis as the four-concurrent-runs
episode recorded earlier in this section, and it is recorded again rather than
folded into it because the mechanism differs: that one was a retry loop inventing
requests, this one is a human sequencing them wrong against a job that takes
fifteen minutes. Both produce a run history that misrepresents upstream, and both
are fixed on the caller's side.

The common thread with 35 is that all three were found by *running* something and
reading a number, and the one that went wrong (40) went wrong at exactly the step
where a number was replaced by an inference. The method note is the same one, and
it has now been earned twice: measure, then check the attribution by removing the
suspected cause, and do not spend the probe's authority on a mechanism that was
never probed.

Findings 36 and 37 were both in code this pass had just added and both were
documented as working. That is the fourth time in six passes that the defect was in
the newest code rather than the oldest, which is worth stating plainly: an audit that
only reads what has been there a while would have missed the majority of what this
document records.

Two further instrument defects were found and fixed in the same pass, and are
recorded here rather than in the table because neither is reachable from the
shipped code:

- **`execFileSync` cannot see a successful run's stderr.** Its return value is
  stdout alone; stderr arrives only on the exception object, which a zero exit never
  produces. Every assertion about diagnostic output was therefore asserting against
  `''` and passing whenever the message was absent — the exact failure the
  assertions existed to catch. `spawnSync` returns both streams unconditionally.
- **A test fixture that never ran `git add`.** The "catches a vendored corpus"
  cases in `check-no-vendored-data.test.ts` built a repository with `git init`, wrote
  files, and checked that the guard rejected them. Without `git add` the guard's
  `git ls-files` is empty, so it found nothing to reject — and the guard reporting
  nothing to reject is indistinguishable from the guard being broken. Four tests
  passed against a fixture that could not fail.

### A guard that is unreachable on purpose

`asNonBlank` narrows `string | boolean | undefined` down to a string and treats
anything else as blank. That narrowing is sound only if nothing boolean can reach
it, and the measurement says nothing can: every flag read through it is declared
`type: 'string'` in every spec that declares it, and `parseArgs` under
`strict: true` refuses a string flag with no value rather than returning a
placeholder. The table's one boolean flag, `has-header`, is read with
`Boolean(v['has-header'])` and never reaches the reader.

This was established by instrumenting `String.prototype.trim` and counting
non-string receivers across the suite — zero — and by enumerating the declared
types of every flag name the reader is called with. So the branch has no test
that takes it, and it never will. That is not a coverage debt to be closed by
inventing an input; it is the shape of a guarantee. What is guarded instead is
the invariant that keeps it unreachable: a test reads the flag table and fails if
any flag read as a string is declared as anything else. Injecting
`rules: { type: 'boolean' }` turns it red with
`flag 'rules' is read as a string but declared as boolean`. See
`docs/acceptance.md` §2.39 for why the branch is exempt from the ≥95% branch
floor rather than counted against it.

### A check the matrix proved is redundant, kept on purpose

The injection matrix produced one **green** result, and it is worth more than the
nine red ones. Removing `Number.isSafeInteger` from `parseInteger` — defect 27's
second half — was caught by nothing.

The check is not weak; it is *redundant within every range currently declared*.
The rule is a decimal-integer pattern, then `Number()`, then a safe-integer test,
then a range test. Where the range is `0..86400000` (a window) or `-720..840` (an
offset), every value that fails the safe-integer test is at least nine orders of
magnitude outside the range and is rejected by the range test instead. The
verdict is identical on every input, so no test can distinguish the two
implementations:

```
99999999999999999999   => 1e20    not a safe integer,   also > 86400000
9007199254740993       => 9007199254740992  not safe,   also > 86400000
9007199254740991       => 9007199254740991  safe,       also > 86400000
```

It is kept, and the injection is kept in the matrix as the evidence for why. The
reason is that the redundancy is a property of the current bounds, not of the
function. `parseInteger` is the shared integer reader for the whole CLI, and a
future flag with a range near `2^53` — a nanosecond timestamp, a byte count —
would make the check load-bearing again, at which point the round trip
`String(n) === text` is what stops a 17-digit literal from becoming a different
number. Removing it now because a test cannot see it would be optimising for the
metric rather than for the guarantee.

For the same reason the round trip is *not* the only defence: the decimal pattern
is what rejects `0x10` and `1e3`, and the range test is what rejects the
magnitudes. Three checks, one verdict each, and only the union is under test.

## Method
Each finding was reproduced before being fixed, by running the affected path
against a fixture and reading the number. Each fix is accompanied by a test that
fails without it: the injection matrix in `test/` reintroduces each defect and
records whether the suite catches it, and negative controls must stay green so
the matrix is not red on everything.

### Reading the numbers instead of assuming them

Pass 2's five defects were found by writing probes against the **shipped build**
before writing any test, and each probe printed its result rather than asserting
it. `asInt: 42`, a 1 ms span, `code: 'STATUS_CODE_ERROR'`, `severityText: ''` and
a `-1 ns` span each went in as a document and came back with an observed value.
The distinction matters: reading `nanoToEpochMs` tells you it multiplies by
`1e-6`; it does not tell you that 2500 of 4000 real millisecond pairs disagree, or
which ones. Only the second fact is actionable.

Two candidate defects from the same reading did **not** survive measurement and
are therefore not listed: `anyValueToString` already handles a numeric
`doubleValue` correctly, and the trace path's canonical timestamp already matched
the metric path's to the millisecond. They are recorded here as deliberate
non-findings, because "I read the code and it looks wrong" is not evidence.

### The instrument needs its own errors tracked

The parser that reads the suite's own counts had two defects of its own, both
fixed: it read `Tests <n> passed` off a fixed shape, which reports 0 on every
failing run because vitest prints `Tests 1 failed | 54 passed`, and it matched
`Test Files 56 passed` first, which reports the file count as the test count.

The injection harness needed the same treatment in this pass: two injections were
first rejected by `tsc` for an unused symbol rather than by a test, which would
have been logged as "caught" while proving nothing about the tests. Both were
rewritten to compile, and re-run so that the **tests** were what failed.

Pass 3 hit this a third time — the "drop the choice-shape guard" injection was
again rejected by `tsc` — and it was caught only because the rule from pass 2 was
already written down. **This is why the rule is a rule and not a note:** an
injection that never reaches the test run has not been tested, and a matrix that
counts it as caught is measuring the compiler. Across the first three passes, 4 of
26 injections were mis-rejected this way; all four were rewritten and re-run, and
on re-run every one was caught by the tests instead.

Pass 4 is the first pass with **no** mis-rejection: all 10 real injections compiled
and reached the test run, and all 10 were caught by tests. The reason is not that
this pass wrote better injections — it is that the rule was written down in pass 2
and applied before the matrix ran, so the `void symbol;` form was used from the
start wherever a guard was being removed rather than replaced. A rule that gets
applied is worth more than one that gets rediscovered.

### What fixed the long-standing test wording

Pass 3 changed a function that two legacy tests in `deepseek.test.ts` already
covered:

```ts
expect(() => parseDeepSeekResponse('{"choices":[{"message":{"role":"assistant"}}]}')).toThrow(/content/i);
```

The rewording to `no usable completion text` broke both. Rather than edit
assertions to chase the implementation, the parser keeps its existing wording for
the single-choice case: with one choice a count adds nothing to the diagnosis, and
the long-standing wording is what operators already grep for. The ranked message
appears only when position is genuinely ambiguous. **Two assertions that were
there first and pass on their own merits are not the thing to change.**

### The assertion that pinned the defect

Pass 4 met the mirror image of that case, and it is worth recording separately
because the right answer is the opposite one:

```ts
it('accepts an empty sample set for a structurally complete layout', () => {
  const result = validateGeneratedLayout(metricLayout, 'metric', []);
  expect(result.valid).toBe(true);   // this is finding 19
});
```

That assertion was not there first and passing on its own merits; it was there
first and **passing because it encoded the bug**. It is the exact behaviour finding
19 describes, written down as the expected result. It was corrected rather than
deleted — the case stays covered, and the corrected expectation is the one the new
suite states in full — with both the change and the reason recorded in the test
file, because a future reader diffing that line deserves to know which of the two
rules applied.

The distinction between pass 3's case and pass 4's is not "old assertion versus new
one". It is whether the assertion is *right*: pass 3's two tests were asserting
something true that the implementation had stopped honouring, and pass 4's test was
asserting something false that the implementation happened to do. Only the second
should be changed, and only the first is evidence of a regression.

## Retractions
This report's rule is that a finding needs a measurement. The corollary is that a
*claim* needs one too, and three claims in this repository did not have one. They are
recorded here rather than quietly deleted, because a wrong constraint is not harmless:
it gets obeyed, and it gets re-derived by the next reader.

**Retracted: "Anchor 4 needs official data mounted by the operator."** Written when
the round trip was a manual procedure, and it framed a hand-off as a requirement. The
RCAEval corpora are on Zenodo — a plain HTTPS host with a stable URL and no
interactive confirmation. A GitHub runner has general internet access. There was never
anything an operator had to mount; there was only a fetch step that had not been
written. `scripts/fetch-official.mjs` is that step.

**Retracted: "The licences prevent us from using the data."** This was the reason
given for anchor 4 being out of reach, and it was wrong in both directions.

- *RCAEval is not restrictively licensed.* Its README states that the code the
  authors implemented **and their datasets** are distributed under MIT.
  `THIRD-PARTY-NOTICES.md` recorded it as Apache-2.0 code-only, which understated the
  grant, and `golden-master/official-assets.json` carries `"license": "MIT"` per asset
  with the licence source recorded beside it.
- *CC BY-NC-SA 4.0 does not block this use.* NonCommercial is defined in §1(11) as
  use "not primarily intended for or directed towards commercial advantage or monetary
  compensation". This is internal, unreleased research; nothing is sold and nothing is
  charged for. ShareAlike is defined in §1(12) as providing material "to the public",
  and we provide none — we redistribute nothing and we host nothing.

The constraint that does exist is not legal but hygienic, and conflating the two is
what made the wrong claim look plausible: upstream corpora must not be committed to
git. That is a repository-hygiene rule with a technical reason (a 19 GB tree in
history is unremovable and makes every clone pay for it) and it is enforced by
`scripts/check-no-vendored-data.mjs` and by `fetch-official.mjs` refusing an output
path inside the working tree. A licence was never the reason, and dressing a hygiene
rule as a licence rule made the rule harder to satisfy than it is.

The one licence claim that survives is the narrowest one: CausalRCA and RUN ship no
licence, which reserves all rights. We do not fetch them, we do not vendor them, and
we do not need to — they are baselines rather than targets, and the schema shape this
repository defines is its own.

**Retracted: "`fetch-and-verify.sh` downloads and verifies the official data."** The
script prints instructions; the comment at its top always said it "does not fetch
official data for you". `THIRD-PARTY-NOTICES.md` described it as downloading, and the
prose around it followed that description. The script was right and the documents were
wrong. It is retained unchanged — the Golden Master verifies it byte-for-byte, and
rewriting a correct script to match an incorrect description is the wrong repair.

### What this pass did not establish

The four anchors now have a path for the fourth one, and the path is exercised on
every push against a synthetic corpus in the official layout, scoring 1.00. That is
what `anchor-roundtrip.yml` proves: the wiring works and the label never enters the
computation.

It is **not** a run against real telemetry. The corpora total roughly 19 GB and this
session's sandbox has no route to Zenodo (`zenodo.org` fails at the TLS handshake
while `api.github.com` resolves, which is an egress allowlist rather than a property
of either host). The digest and byte-count fields in `golden-master/official-assets.json`
are therefore all `null`: they are filled in by a fetch that has actually run, and a
digest that was never computed is not evidence. `official-data.yml` is the
`workflow_dispatch` job that produces them on a runner.

So the honest statement of anchor 4's state is *executable, not reproduced*. Those are
different claims and this report keeps them apart on purpose — the whole difficulty of
passes 1 through 5 was code that reported success without establishing anything, and
"the CI job is green" would be the same mistake one level up if it were allowed to
stand in for "the number agrees with upstream".

### Pass 8 — the corpus, all of it, in a 4 GB heap

Finding 42 was the layout. Fixing it moved the real run past `derive the case
descriptors` for the first time — `270 case(s): RE1=0 RE2=270 RE3=0`, with
`RE2-OB/checkoutservice_cpu/multi-source-data` correctly skipped — and then the job
died one step later:

```
ok  Fetch the corpus outside the working tree | success
ok  Compare the measured pins against the registry | success
ok  Derive the case descriptors from what was downloaded | success
>>> Round-trip the corpus and score it with the official rule | failure
    FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory
    [2670:0x42b1f000]  Mark-Compact (reduce) 4113.7 (4116.9) -> 4113.7 (4116.9) MB
```

The heap died at 4182 MB with no `ROUNDTRIP` line printed — the process did not
reach its first verdict. The step that was supposed to *check* the corpus could not
fit the corpus into memory.

**Sizes, from the run's own log rather than estimated.** The three assets measure
`bytes=1191025569`, `bytes=245629018`, `bytes=2801345134`: **4.24 GB of archives.**
Free disk went from `86G` to `54G` across the fetch, so the extraction is on the
order of **32 GB** — the archives are compressed and the telemetry inside them is
not. None of that was in the repository, the registry, or any document; it is
recoverable only from a run that got far enough to print it.

**The defect.** The walk did this:

```js
const bytes = readFileSync(path);
if (bytes.includes(0)) continue;
files[relative] = bytes.toString('utf8');   // <- every file, whole corpus
```

So the reader materialised the entire corpus as strings before scoring anything
against a 4 GB heap. And of the three things that then read the map, **none needed
a body**:

| Read site | What it asks | What it needs |
|---|---|---|
| `files[`${caseId}/inject_time.txt`] === undefined` (×2) | does this case hold the file? | a `stat`, or a set |
| `Object.keys(files).length` | how many files arrived? | a count |
| `adaptCase` | one `metrics.json` | **it already re-read that file from disk** |

The third row is why this is a clean removal rather than a trade: the adapter never
consulted the map, so the corpus-wide map contributed a count and two membership
tests, and cost 32 GB to hold.

**The fix.** The walk answers the two questions and keeps nothing else. Bodies are
not opened, so its cost does not scale with bytes either: membership is decided by
the file's extension (`json`, `csv`, `txt`, `log`, `md`) rather than by decoding
every candidate to look for a NUL, and the NUL check moves to `adaptCase`, which is
now the only place a payload is opened and was going to read those bytes anyway.
`files` becomes a `Map<path, null>` — a set whose values say outright that no body
was kept, so a future reader cannot quietly come to depend on one.

**Controlled comparison, same corpus and same heap cap.** A 31 GB corpus in the
corpus's own layout — 270 cases, each with the three metrics and 1200 samples the
real CPU cases carry, plus the bulk telemetry the adapter never reads:

| Implementation | Exit | Heap at death | Result |
|---|---|---|---|
| pre-fix (`readFileSync` into the map) | **134** | 4182.7 MB | `FATAL ERROR: heap out of memory`, no `ROUNDTRIP` line |
| fixed | **0** | 166 MB peak RSS | `ROUNDTRIP PASSED (270 case(s) round-tripped through the official layout)` |

The pre-fix column reproduces the CI failure exactly, down to the
`Official-metric regression PASSED` line appearing *before* the crash — which is the
signature that the corpus-reading branch, not the scoring, is what died. Peak RSS is
now **flat**: 166 MB for 31 GB, because memory follows the largest case rather than
the size of the corpus.

**Why the fixture could not have caught this, and what changed.** Every existing
round-trip fixture is a few hundred bytes per case, so the whole corpus fits in any
heap and the accumulator is invisible — the fixture certified the assumption, which
is finding 43's mistake in a different medium. The new test lowers the child's heap
(`--max-old-space-size=128`) and gives it ~300 MB of corpus, so holding the corpus
violates the cap at any size and the failure is a verdict rather than a coincidence
of how much RAM the machine had. Injection-verified: restoring body retention turns
**exactly one** test red, with the same `heap out of memory` abort; restoring the
pre-fix counting rule turns a different one red, via the `.DS_Store` the fixture now
carries, because the count is a decision under test rather than an accident of the
fixture holding only payload names.

Two consequences worth stating plainly:

- the count's rule changed. The old walk counted non-binary files; the new one
  counts payload names. These agree on the real corpus (packaging is binary *and*
  non-payload) and diverge on a binary `metrics.json`, which the new walk counts and
  which then fails by name in `adaptCase`. That is the right direction — a
  present-but-broken payload is a corpus defect to report, not a file to drop — and
  it is covered by a test of its own.
- the `--max-old-space-size` in the test is load-bearing. Without it the test would
  pass on a large machine and fail on a small one, which is this same defect wearing
  a green tick.

---
