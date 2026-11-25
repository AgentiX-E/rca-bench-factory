# Acceptance plan and criteria

"Usable and 100% compliant" is a **provable** claim, not a marketing claim. The
acceptance model is a pyramid of six layers; each layer is a gate that must pass
before the layer above it is meaningful.

## What this file requires, and the round that asked for it

<!-- acceptance-index: begin -->
| Section | Round |
| --- | --- |
| The open list | v3.62 |
| The base of a created branch | v3.62 |
| The two sentences in one entry | v3.63 |
| A record's spelling | v3.63 |
| The rows of a table-form record | v3.64 |
| A round is a number | v3.116 |
| The authority a closure names, and the line that publishes it | v3.117 |
| A closure's sentence, and the period a version number carries | v3.117 |
| The unit a heading is judged in | v3.118 |
| A census prints the numbers, and a claimant gets the history it reads | v3.125 |
| The nouns the gates count in, and the reader that compares them | v3.124 |
| A subset is not a second population, and a ceiling is a bound | v3.123 |
| One line, one partition: an entry of the live list is not an entry of a record | v3.122 |
| A word that counts a population says which population | v3.121 |
| A closing reading is a row the newest round carries | v3.120 |
| A bound has three sources, and a count has one noun | v3.119 |
| A record may not be the only place a residual lives | v3.65 |
| A new rule is justified against the rules that exist | v3.65 |
| The index is smaller than the smallest volume it indexes | v3.65 |
| A number that speaks in the present is derived, not remembered | v3.66 |
| A table about a suite is a projection of it | v3.66 |
| A set declares what it is for, and a prompt does not name its answer | v3.66 |
| A table is a projection of a field, or it is a claim with one reader | v3.67 |
| The round that can still be written owes the coverage row | v3.67 |
| Pollution is a case compared with another case | v3.68 |
| A default is a claim about a distribution | v3.69 |
| A bound that cannot move is a constant | v3.77 |
| A set that grows is how a rule about a set gets tested | v3.78 |
| A reading that is computed after the loop does not exist on the path the failure takes | v3.79 |
| Every job fetches the history its claimants read, and a coloured run is still read | v3.126 |
| A judgement is a sentence and a partition, and the partition is what a run holds | v3.127 |
| A judgement belongs to a noun, and the vocabulary belongs to the tree | v3.128 |
| A ceiling holds the bounds inside it, and the seconds no step spends | v3.129 |
| A sentence may state a count only if a gate printed it | v3.130 |
| A size in the live list carries the round that took it | v3.131 |
| The floor belongs to the job, and a prefix is what every job shares | v3.132 |
| A count that can be zero prints zero | v3.133 |
| The allowance is argued, and what it owes the history is a floor | v3.134 |
| A clause owes an address, and the file owes an index | v3.134 |
| A number that is not a count of the noun is declared separate | v3.135 |
| A coincidence says which of three things it is | v3.136 |
| A bound's comment names the reading that last moved it | v3.136 |
| A marker names the count it is about | v3.137 |
| A snapshot is a claim about one tree, and the reader that can refuse it re-derives it | v3.137 |
| A multiple is printed with the spread of the series it was sized from | v3.138 |
| A claim about now sits under one round | v3.138 |
| A bound is printed at both ends of the series it was sized from | v3.139 |
| A green line names the two sides it joined | v3.139 |
| A date is not in the future of the round it is quoted in | v3.139 |
| A bound is printed with the day its command usually has | v3.140 |
| A noun may leave the vocabulary with a sentence saying when it can be silent | v3.140 |
| A population of middles is printed as its ends, and the class that has none is counted | v3.141 |
| The history's range carries the floor a second reading of one tree measures | v3.141 |
| A round's span ends where that round's own count ends | v3.142 |
| A mark has one reader, whichever way it is spelled | v3.142 |
| A bound's headroom is measured in the movement one tree has already shown | v3.143 |
| A reading is named by its run and its attempt | v3.143 |
| A measurement is written where it is the newest one | v3.144 |
| Only a number the run measured is a reading | v3.145 |
| A red day's number is read against the bound it enforced | v3.146 |
| A reading is a number beside the command that spent it | v3.147 |
| An action is identified by the action, not by the name of the step that uses it | v3.148 |
<!-- acceptance-index: end -->

## L0 — Deterministic core correctness

- `pnpm typecheck` clean under strict TypeScript, **from a cold check-out**.
  `packages/cli` reads `@rca-bench-factory/core` through core's published entry
  points, so the root script carries a `pretypecheck` hook that builds core
  first. Without it the script passed only on a tree where a build had already
  run, and failed on a fresh clone with errors in a file the operator had not
  touched. `test/typecheck-entrypoint.test.ts` runs the real script in a
  detached worktree with every `dist` removed.
- `pnpm lint` clean (no mocks, no secrets, no vendored corpus data, registry consistent).
- Unit tests pass with **≥ 95%** statements/lines/branches and **100%** functions.
  Measured at 99.95 / 99.93 / 100 / 99.95 on this revision; the residual is the
  documented backstops enumerated in [progress.md](progress.md), not gaps.

## L1 — Transform invariants

- **Idempotency** — applying a transform twice yields the same output.
- **Zero silent loss** — `inputCount === outputCount + quarantineCount` for every batch.
- **7-strategy matrix** — each of `time`/`unit`/`map`/`regex`/`template`/`lookup`/`expr`
  has a dedicated test, including error paths (a data problem becomes a result, never a throw).

## L2 — IR contract integrity

- **Structural** — `signal === payload.kind`; required fields present (G1).
- **Reference integrity** — every entity reference resolves; no dangling edges (G2).
- **Time consistency** — `injectTime` and `window` are canonical UTC ISO-8601 and
  ordered (`start ≤ injectTime ≤ end`).

## L3 — Gate and export soundness (mutation testing)

A 20-mutation suite of two halves: **MT-01…MT-15** and **MT-19…MT-20** corrupt a
known-good case or set and assert the gates intercept **100%** of them, and
**MT-16…MT-18** corrupt the *exported artefacts* and assert the official-metric
regression intercepts them.

> **20 is the count of mutations, not of assertions.** The file reports more passing
> tests than there are mutations, because each one is asserted from both directions --
> the mutated input must be intercepted, and the unmutated input must still pass, so
> that a suite that is red on everything is distinguishable from one that is
> sensitive. The two numbers describe the same suite at different resolutions and
> neither is a drift; a status line that quotes one while the other is expected is
> reading the runner's line count as the matrix's size.

The two columns below are **projections of the code, not prose about it**: the
mutation cell is `Mutation.description` and the verdict cell is `expected` (or, for
an export mutation, the target the official regression runs against). A test reads
this table out of this file and compares both columns with the arrays in
`test/mutation.test.ts`, so a row that stops describing what it names fails the
suite. Before v3.66 only the **ids** were compared, and measured at that revision
**thirteen of the eighteen rows named a mutation other than the one their id now
runs** -- the five that survived are MT-03, MT-12, MT-16, MT-17 and MT-18, and the
other thirteen had been paraphrased from an earlier set and never re-read, which is
what a document with no reader does.

| Id | Mutation | Caught by |
| --- | --- | --- |
| MT-01 | shift every timestamp by one hour | `SIGNAL_OUT_OF_WINDOW`, `WEAK_ANOMALY_SIGNAL` |
| MT-02 | declare a bogus unit on a numeric checkpoint | `UNKNOWN_UNIT` |
| MT-03 | rename service.name to serviceName | `SIGNAL_OUT_OF_WINDOW`, `WEAK_ANOMALY_SIGNAL`, `MISSING_SERVICE_NAME` |
| MT-04 | point the root cause at a non-existent entity | `UNRESOLVED_ROOT_CAUSE` |
| MT-05 | fail to isolate the answer key | `ANSWER_KEY_NOT_ISOLATED` |
| MT-06 | leave a raw IP and an email in the payload | `SENSITIVE_DATA_PRESENT` |
| MT-07 | delete the middle step of the causal chain | `CAUSAL_CHAIN_BREAK` |
| MT-08 | move the injection time outside the observation window | `INJECT_TIME_OUT_OF_WINDOW` |
| MT-09 | drop the metric series so the anomaly disappears | `MISSING_SIGNAL` |
| MT-10 | label every case as the easiest difficulty | `DIFFICULTY_SKEWED_EASY` |
| MT-11 | attach a numeric checkpoint with no unit at all | `NUMERIC_CHECKPOINT_WITHOUT_UNIT` |
| MT-12 | remove the topology edge that reaches the root cause | `CAUSAL_CHAIN_BREAK`, `UNRESOLVED_ROOT_CAUSE`, `CAUSAL_HOP_NOT_IN_TOPOLOGY` |
| MT-13 | duplicate a case inside the set | `DUPLICATE_CASE` |
| MT-14 | import a public benchmark case verbatim | `PUBLIC_SET_CONTAMINATION` |
| MT-15 | blank out the root cause entity | `EMPTY_ROOT_CAUSE`, `UNRESOLVED_ROOT_CAUSE` |
| MT-16 | reword the OpenRCA scoring_points so the official regexes recover nothing | official regression on `openrca-1.0` |
| MT-17 | drop the instance level from the RCAEval case path | official regression on `rcaeval-re2` |
| MT-18 | corrupt every AIOps2025 ground truth record so none of them parse | official regression on `aiops2025` |
| MT-19 | spell the root cause component into the task text | `LEAK_IN_QUERY` |
| MT-20 | publish a benchmark set both baselines already solve | `SATURATED_SET` |

If **any** mutation slips through, the gates are broken and must be fixed before any
export is trusted. `test/mutation.test.ts` asserts the suite results directly; the
`mutationTestPassed` field on `QualityGateReport` is carried through from `meta`
when the caller supplies it, and is **absent** from CLI output otherwise.

- **Every proved failure site is proved twice** (v3.41). `golden-master/gate-sites.json`
  carries a `provedBy` for each exit, and the claim has two halves. `pnpm lint` runs
  `verify-site-proofs.mjs`, which asks whether the named file **reaches** the exit;
  the `sensitivity` job runs `verify-sites-are-sensitive.mjs`, which asks whether that
  file **notices** the exit's absence -- one run per claim with that site's code
  replaced by success, and a baseline run per file so a red claimant cannot be
  credited with catching anything. Measured at **248 of 248** claim(s) across 68 file(s) -- two more
  than v3.140's 232, because an attempt that does not exist and an attempt with no job in it are two
  refusals `measure-ci-baseline.mjs` did not have before, and each carries a proof; two more again
  at v3.144, because a recording that cannot say which measurement is the newest and a measurement
  older than the one it would replace are two refusals the recorder did not have either; three
  more at v3.145, because a run that did not succeed, a step that never started, and a step whose
  number is its own bound are three shapes in which a number is not a duration; and two more at
  v3.146, because a red seed's day can fail to answer in two ways -- a workflow its reader cannot
  walk, and one the API will not return; one more at v3.147, because a recording whose tree on
  disk is not the tree that ran is a refusal the recorder did not have, and it is the fetch above it
  that answers which tree that is; and six more at v3.148, because a history written before an action
  had a name of its own needs six refusals to rewrite it safely -- and the usage check that gained the
  mode's clause is the same one site, so the exits did not move.
  The figure was 105 of 105 in both halves at v3.41, and it drifted for twenty-four rounds
  because nothing read the sentence -- an external reviewer quoted the 105 as the current
  state, which is what a number with no reader costs. `check-doc-counts` reads it now:
  it takes the counts from `golden-master/gate-sites.json` and refuses a present-tense
  claim that disagrees, so the only way to write an old figure is to date it. Both halves
  are mutation rather than reading, which is the only form this claim can take.
- **Every failure site publishes the guard that actually holds at it** (v3.42). Each
  entry carries a `condition`, and until v3.42 that column was read by scanning
  backwards for an `if` line -- which names the nearest `if` above the exit rather
  than the block the exit is in. Measured against a TypeScript parse of the same
  tree, 15 of 112 entries were wrong, three of them naming the opposite branch (a
  `catch` published as the argument check above it). The column now comes from the
  syntax tree, and `packages/core/test/derive-gate-sites-conditions.test.ts` holds
  one case per shape: a sibling `if` that already closed, a `catch`, an `else`, an
  `else if` chain, an `if` with no braces, a declaration, an inline closure, a loop,
  a `switch`, a brace inside a string, a regex literal holding quotes, and a
  template literal holding a substitution.
- **The site list and the exclusion tally partition every exit** (v3.43). Until
  v3.43 the two halves were computed by two different line-shaped readings, and
  they disagreed: the committed file said `{15 zero, 3 indirect}` where the tree
  holds `{16 zero, 2 indirect}`. The totals matched anyway, because one count had
  been lost (`if (officialDirArg === undefined) process.exit(0);`, an exit that
  does not begin its line) and one invented (a docstring in the deriver, counted
  because the comment stripper desyncs there). One pass over the syntax tree now
  puts every `process.exit(...)` call in exactly one of `sites`, `zero`,
  `indirect`, and `derive-gate-sites-tally.test.ts` holds that against an
  independent traversal of every script in `scripts/`. `multiline` is gone: a
  basket a tree reader cannot reach, which read 0 in every round it existed. (The
  `indirect` basket named in that sentence is gone too, in v3.44 -- see the next
  entry -- so the partition it describes now has two halves.)
- **A failure exit is counted by what the process exits with, not by the shape of
  the sentence** (v3.44). Three readings, one subject. (1) `process.exit()` with no
  argument exits 0 and was published as a failure site, because the rule asked
  whether the argument is *the literal zero* and absence is not the literal zero; a
  site with nothing to hollow would have been reported by the sensitivity pass as a
  witness that does not depend on it, which is an accusation against a test for a
  defect in the rule. (2) The `indirect` basket held exactly two calls, and both
  were `main().then((code) => process.exit(code))` -- `code` is `main()`'s return
  value, so that one sentence decides the script's status; the inventory published
  each script's `.catch` arm, which only fires on a crash, as its failure exit, and
  filed the verdict-carrying call as "not a site". A call that runs ends the process
  wherever it stands, which is what `condition` is for, so the basket is deleted:
  **112 sites -> 114**, `{16 zero}` beside them, 130 calls partitioned by
  `derive-gate-sites-tally.test.ts` against an independent traversal. Both new sites
  are proved by measurement: `fault-extraction-scripts.test.ts` drives `main()` to
  1, 2 and 3, and `verify-site-proofs.mjs` observes the exits at those two lines.
  (3) A reference the reading cannot resolve is **refused**, not skipped:
  `process.exitCode = 1` (a status no hook here can see), an alias, a destructured
  binding (the reference exits nothing, the call does, and the trace would report a
  line the inventory never published). Measured: 0 in `scripts/`. Clearance:
  `derive-gate-sites-refusals.test.ts` drives every refused spelling and every
  accepted one, so the published set is a subset of what the sensitivity pass can
  hollow by construction rather than by hope.
- **The diagnostic column stops at the function, not at a distance** (v3.44). The
  scan for a site's message had a floor of 60 lines, which crossed the boundary that
  matters: for `score-fault-extraction.mjs:153` it reached `M1 exit condition met.`,
  the sentence printed on the *success* path, five lines above the exit that fires
  when the condition is not met. Measured over all 130 calls, moving the floor to the
  enclosing function changes **4** rows and **no published site's diagnostic**. Where
  no message exists in scope the site publishes `verdict` -- the expression whose
  value becomes the status -- so no row is a bare coordinate.
- **A refusal is a throw as well as an exit, and both are inventoried** (v3.45). A
  gate that throws and lets the exception escape ends the process with status 1 --
  to a shell, the same refusal as `process.exit(1)`. The tree holds **41 throw
  statements across 15 scripts** and the inventory published none of them, so the
  campaign's three questions (is it reached, is it depended on, can the gate be
  hollowed) were never asked of any. The shape that made this a defect:
  `measure-ci-baseline.mjs` refuses a run whose jobs carry no `batteries` with a
  **top-level throw**, while the `process.exit(2)` for a usage error beside it was
  published and proved -- and the only test drove the usage arm, so the refusal that
  runs when the network answered had never executed. The inventory now publishes a
  second partition, `throws`, with four dispositions that add up to the number of
  statements: `fatal` (ends the process, proved like a site), `unguarded` (hands
  control to its caller), `guarded` (caught in this frame), `rethrow` (forwards a
  decision made above). Clearance, each a distinct check: the partition is recounted
  by an independent traversal of all 75 scripts; `gate-sites-are-proven.test.ts` rule
  8 refuses a `fatal` with no proof, a row that says neither proved nor exempt, a
  partition whose counts disagree with its rows, and an empty partition (the clause
  "a proof on any other disposition" was this round's and is corrected in v3.46
  below); `site-proofs.mjs`
  observes a fatal throw from the gate's own `uncaughtException` listener, kept in a
  separate trace from the exit hook so a crash cannot satisfy a claim about a refusal
  the gate chose. `verify-sites-are-sensitive.mjs` names the claims it does **not**
  mutate -- a throw has no seam a value-mutant can replace -- rather than leaving them
  out of a total that reads as complete. (v3.46 emptied that list: a throw's seam is
  its source, and all 32 are removed by the loader that records them.)
- **A throw row says whether a test reaches it, and the instrument can prove it** (v3.46).
  v3.45 published 41 dispositions and proved one, which left forty rows saying *what a
  throw is* and nothing about whether any test had ever executed the line. The census
  that answered it needed an instrument that did not exist: V8 coverage cannot answer,
  because a block ending in `throw` never increments its counter (measured on a
  three-function probe: caught throw, escaping throw, no throw -- all `count: 0`), so
  `scripts/throw-witness.mjs` rewrites `throw X;` into
  `{ record(line, file); throw X; }` at load time, in both roads into a process (the
  ESM loader for a spawned gate, a Vite plugin plus a worker setup file for an imported
  module). Measured: **21 of the 41 rows reached, 20 not**. Of the twenty, eleven are
  now driven -- ten by `published-refusals.test.ts`, one by
  `derive-gate-sites-refusals.test.ts`, and two by tests that named the file rather
  than the line -- and nine carry a sentence about the line they guard instead of the
  word "unreachable". Clearance, each a distinct check: `gate-sites-are-proven.test.ts`
  refuses a row that is neither proved nor exempt, a `proved` row with a reason, an
  `exempt` row with a `provedBy`, a short or repeated reason, and a `fatal` row with no
  proof; `verify-site-proofs.mjs` claims **all 32 proved throws** and honours each by
  the line having been **reached**, which is what the witness records and what a test
  that catches the throw still satisfies; `verify-sites-are-sensitive.mjs` removes each
  of the 32 statements and requires some test to go red -- **0 survivors in 190 runs**;
  and `throw-witness.test.ts` holds the rewrite over fourteen positions a `throw` can
  occupy, asserts the interpreter still accepts the result, asserts the line numbers
  are unchanged, and drives the two roads (a child that carries the preload, and an
  import through the plugin) so that "found zero" cannot mean "instrumented nothing".
- **A reader follows the binding nearest the write, not the first one in the file** (v3.46).
  `tests-do-not-write-inside-the-package.test.ts` follows a write's target through its `const`
  bindings and kept the first binding per name. `published-refusals.test.ts` binds `path` twice
  -- to a repository path and to one under a scratch directory -- so a test writing into `/tmp`
  was reported as racing every other worker. A false positive is the direction that gets a
  guard switched off, so the resolver is name-scoped: the nearest binding at or before the
  write, and a binding's expression resolved at its own line. Clearance: two controls, one per
  order (a scratch binding declared after a root binding is not flagged; a root binding
  declared after a scratch one is).
- **A comment is found by the token boundaries, not by a lexer** (v3.43). Both
  hand-written strippers desynced on a quote or a backtick inside a regex literal
  -- 12 of 75 scripts, 28 of 219 test files -- and the second one credited two
  gates to a file that mentions them in prose. Clearance: the token sequence of all
  295 files in `scripts/` and `packages/core/test/` is identical before and after
  the strip, so a comment that survived (a token gained) or code that was blanked
  (a token lost) both fail `gate-proofs.test.ts`.
- **A job either bounds its steps or it does not, and every job is asked** (v3.48). The
  step budgets were written for the one job that had timed out and the recording named that
  job, so no other job could be asked whether it bounded anything: `verify` spent **532 s
  across 11 steps** -- 341 of them in `lint` -- and named none of them, in the job next door
  to the one the rule came from. The recording now holds every job keyed by the workflow's
  own id, `readWorkflow` returns the jobs themselves (id, label, budget), and a job that
  costs more than the 3-minute floor across more than one step must bound every step. A job
  with exactly one step is excused -- the job's budget already names it -- and the exception
  is printed rather than assumed. Clearance: a fixture per road (a job with no bounds, a job
  with half its bounds, a job under the floor, a one-step job, a job the recording has never
  measured, a recording that outlives its job).
- **A bound is arithmetic, so the job budget has to hold the bounds it declares** (v3.48).
  Re-recording a green run three days newer than the baseline refused the shipped numbers
  five ways -- 12 min against 479 s, 5 against 221, 5 against 185, 13 against 416, and one
  bound expiring at **31 min inside a 30-minute job**. The arithmetic then said the job
  could not hold its own bounds at all (16 + 14 minutes for two steps that measure 479 s and
  416 s), so the batteries split into two jobs, 674 s beside 914 s; and `sensitivity`'s
  18-minute bound could not live in a 15-minute budget, so that job declares 20. Clearance:
  `check-ci-budget.mjs` is part of `pnpm docs:check`, and the deadline rule refuses a bound
  that the job would outlive.
- **A rule about jobs is an equality over jobs, not a list of the jobs that existed** (v3.48).
  The new battery job runs vitest through `backend-support.py`, so
  `cold-tree-job.test.ts` -- every job that runs the suite installs the shells its fixtures
  spawn -- asked it for `zsh` and got nothing back. The step is there now; the equality is
  what found it, one round after the job was written.
- **A recording is only as good as the tree it describes, and the ledger is the second
  opinion** (v3.49). Every rule in `ci-budget.mjs` read the recording's *contents*, and all
  five passed on a recording of a tree that had since run again: `41670923224` at
  `61dff700c` sizing the bounds of `91e320884`, whose run is `41677264353`. A recording does
  not age in any way its own numbers show, so `R7` compares it with the newest run the
  progress ledger reports -- a `| CI |` row is written after a green run, so the newest id in
  one is a run this repository has already read. Clearance: the gate's first red was the tree
  the rule was written in, and its repair is a command it prints (`measure-ci-baseline.mjs
  <run>`); a fixture per road (older than the ledger, newer than it, no ledger, a ledger that
  could not be read).
- **The bounds follow the measurement only if a new one is taken** (v3.49). Citing the round's
  own run and re-recording it left every bound valid; the run *after* it measured the same
  steps again and two had grown (494 -> 530 s, 418 -> 427 s), which put 17 minutes under twice
  530 and 14 under twice 427 by 40 s and 14 s. Both move to 18 and 15, and the deadlines still
  fit (18.4 and 24.2 of 25). Clearance: `R7` is what makes the re-record unavoidable, and the
  arithmetic is what turns a drifted measurement into a refused bound rather than a slow
  failure.
- **A closing reading that does not name its run is a row, not a measurement** (v3.49). The
  half of `R7` that makes the other half mean anything: the ledger's **newest** `| CI |` row
  must name a run id, because otherwise the recording is unopposed and the gate's silence
  reads as agreement with a round nobody compared it to. Three older rows in the shipped log
  name none; they are **counted and printed** rather than corrected, because deriving an id
  from a commit now would be inventing provenance -- two runs exist per push. Clearance: the
  summary line carries the count, and `ledger-runs.test.ts` holds a case per rejected shape
  (a nine-character commit, a thirteen-digit token, a named row followed by an unnamed one).

- **An exemption names the test that holds its statement** (v3.50). Six throw rows were exempt,
  and each exemption was a paragraph explaining why no test could reach the line. That is a rule
  about prose, and prose cannot fail: four of the six had a test measuring their claim and never
  said so, and two had none. Each row now carries a `statement` (the claim, falsifiable) and a
  `heldBy` (`{file, test}`, exact title), and rule 9 of `gate-sites-are-proven.test.ts` refuses a
  row without either, a file that does not exist, a file that is not a test, a title the file does
  not carry, two exemptions held by one test, two exemptions stating one claim, and a proved row
  that also carries an exemption's claim. Measured: renaming one title in the inventory turns the
  rule red with the row and the title in the message. The rule's limit is stated where it is
  implemented -- it checks that the title exists, not that the assertion inside it is the claim.
- **A statement test must be able to fail against the defect it describes** (v3.50). The two pack
  claims are measured on the shipped tree and on the committed index, not on a fixture: the pack
  must list each path once, and must carry every file in `examples/order-prod` plus
  `MANIFEST.json`. Writing them found `readExampleFiles()` walking one directory and skipping
  every non-file silently, so an example in a subdirectory would have vanished from the download
  with the index agreeing. Reproduced (`examples/order-prod/nested/extra.json`: 9 rows before, 10
  after), fixed by a recursive walk, and the committed artefacts did not move a byte.
- **A partition is closed by the classifier, not by two tallies agreeing** (v3.50). The type-miss
  counts were compared with three counts computed in the test, which agrees with itself for any
  number of kinds; a fourth kind would have incremented a key that does not exist and only the
  exempt guard would have noticed. `classify`'s return set is now measured against the **shipped**
  function over an adversarial table -- an empty pair, one that normalizes to nothing, one that
  differs by case, one sharing a single token, and every recorded miss of both runs.

- **An exemption carries the edit that makes its claim false** (v3.51). Rule 9 required a claim
  and the test that holds it; a title is an index, and nothing checked the body behind it. Every
  exempt throw now carries `mutant: {file, find, replace, defect}`, and
  `verify-claims-are-sensitive.mjs` applies it and requires the named test to go red: **7 claims,
  12 runs, 0 survivors**. Rule 10 refuses a `find` that no longer occurs exactly once, a
  replacement that is the edit's own text, a target that does not exist, a target that is a test,
  a `defect` nobody can review, two exemptions naming one edit, and a proved row that also names
  one.
- **A red run is not a caught claim** (v3.51). A mutation that does not parse fails every suite
  for a reason about the mutation, which is how a battery reports a red as proof of everything. The
  verdict scans the failure text first: `SyntaxError`, `Transform failed`, a module that will not
  load, and a TypeScript plugin error are reported as **unmeasured** with the failure quoted, and
  the summary separates a red on an assertion from a red on the code's own guard -- 6 and 1 on this
  tree, because the m1 partition's claim is enforced by the probe refusing to publish.
- **A check may not take both sides from the same reader** (v3.51). `--check` compared the example
  archive with an index written by the reader that produced it, so a reader that dropped a file
  produced three artefacts that agreed with each other (finding 398, one layer up). The build now
  compares the archive with a walk it does not share -- `opendirSync` handles descended by hand --
  and refuses in both directions: a tree file the pack does not carry, and an archive that is not
  exactly `README.md`, `run.sh` and `MANIFEST.json` larger than the tree. Both counts are
  published, so the page shows **9 rows against 6 files**.
- **A step may be bounded before it has been measured, for exactly one recording** (v3.52).
  `R2` refused every step the recording had never measured, and a recording cannot describe a step
  that has not run -- so no battery could arrive with a bound, and the previous round folded a
  second command into an existing step's line and left the name describing half of it (finding
  405). `golden-master/ci-declarations.json` now holds the sentences that break the ring, and `R8`
  refuses one unless: the step exists in that job, the bound is the workflow's own, the recording
  still does not measure it, the bound clears the floor, its expiry fits the job's budget, no
  measured step follows it, and it argues for itself in at least forty characters. The lifetime is
  one recording and it is structural -- the recorder will not write a reading that omits a step,
  `R7` forces a refresh on every round that cites a run, and the gate refuses the tree until the
  sentence is deleted. `R4`'s multiple is settled by that refresh rather than by the round that
  added the step, which is where the bet is placed and where it is paid.
- **A check may not compare a thing with itself, named per side** (v3.52). `--borrow` recorded a
  new job's steps from the job it was split out of, including that job's *budget* -- so `R6`
  compared the workflow with itself for a borrowed job and could never fire, while the deadline
  arithmetic used a ceiling the borrowed seconds had never been spent inside. The recorder now
  refuses a borrow across a budget and prints both numbers (finding 406): a step's cost is a
  property of the command, and a budget is not.

- **A published table is a derivation, or it is a table nobody reads** (v3.80). `## Repository`
  published eight measurements of this repository and `grep -rn` found no reader for any of them:
  commits `95` for 530, tests `2341` for 6,246, tracked files `208` for 633, every row wrong by a
  factor of two to six, in the document whose first principle is that a claim is only accepted
  when something produced it (finding 508). The repair is a rule rather than a retyping:
  `scripts/check-repository-table.mjs` performs each derivation and refuses a drifted value, a
  label it cannot derive, a row that has gone missing, and a `Commits` cell whose dated revision
  does not resolve. **The one row that cannot be current is dated** -- the commit that writes it
  is the commit it would have to count -- and the date is checked, so the number is verifiable
  against a checkout forever instead of true once.
- **A measurement carries the name of what it measured** (v3.80). The stall gauge failed a file
  at 47,727 ms against a 45,000 ms budget with **6,246 of 6,246 tests passing**; the same file on
  the same tree measured 11,905 ms alone, 11,547 ms alone under coverage, and 14,448 ms with two
  workers (finding 507). The number was wall clock and the sentence was about the file, and the
  difference is what a loaded box does. The reading now carries both quantities -- wall and CPU
  -- and the verdict names both without asserting which cause it was, because a low CPU figure is
  also what a descheduled process looks like. The budget itself does not move: the deadline it
  guards is a wall clock. What moves is the file's cost, and the split is what located it: 9,630
  ms of wall against 820 ms of CPU was twenty-nine copies of a fixture, not arithmetic.
- **A gate's diagnostic is the line it prints when it fails** (v3.80). The inventory fingerprints
  a failure site by the nearest printed string above it, so a gate that prints its verdict before
  branching on its problems has its *success* line published as what it says when it fails -- and
  nothing could see it, because the annotation was carried, the proof resolved and the site was
  counted (finding 509). `violationsOf` rule 11 refuses a diagnostic matching `:\s*OK\b` on both
  populations; zero of 133 sites and zero of 99 throw rows carry one, and it fails on the corrupted
  inventory the battery builds. It reads a token and not control flow, which is stated as the
  rule's limit rather than papered over.

## L4 — Official reproduction (Golden Master, official metrics and round trip)

- `golden-master/verify.mjs` re-runs every exporter against the self-contained
  fixture in `fixture.json` and checks the output against the committed anchors in
  `expected.json`, byte for byte (6 OpenRCA + 4 RCAEval files).
- `golden-master/fetch-and-verify.sh` runs that self-contained check, then prints
  the per-dataset instructions for repeating it against official data you have
  downloaded yourself. It performs **no network access**: fetching is left to the
  operator, who is responsible for the license terms in `THIRD-PARTY-NOTICES.md`.
  Treating the self-anchored check as if it validated external data would be a
  category error — it can only prove our output is stable, not that it is right.
- Reproduced outputs must match within stated tolerances (byte-exact for CSV layout,
  value-tolerant for floating-point metrics).
- **Official-metric regression** (`pnpm official:check`, and
  `rca-bench official` for any dataset): the answer key a target exports is
  submitted to that target's *published* metric and must score **1.0** under its
  own rule, on real exporter output. This is a strictly stronger claim than the
  field contract `score` makes: a dataset can be perfectly well-formed and still
  unscorable.
  - Every declared facet must be **sensitive** to perturbation (the metric is not
    vacuously returning 1) and every undeclared facet **inert** (the facet list is
    exactly right).
  - The regression must grade **the submission it publishes**, read back from the
    export through `readOfficialSubmission`. It may not build a prediction from
    the answer key: doing so makes the check self-referential, and a `record.csv`
    that has been corrupted or deleted then still reports `passed` because the
    only thing compared was the key against itself. Four corrupted-submission
    injections were silent before this was required.
  - A target that exports zero cases fails unless the caller states why
    (`--allow-empty-reason`), so no exporter can hide behind a skip.
  - **A term with no denominator has no credit to give.** Every rate in the
    scoring path answers `undefined` when the answer key declares nothing to
    match against, rather than `1`; the aggregate then averages only the terms
    that do have a denominator. An empty denominator is not a full score, and it
    is not a missing measurement either — it is the absence of the quantity
    being measured.
  - **A verdict of zero must produce a score of zero.** The structure rate is
    credited only when the structure report passes, because four of its checks
    are vacuously true on an export that does not exist ("query.csv carries no
    answer key" holds when there is no query.csv; both telemetry header checks
    explicitly accept an absent directory; zero rows align with zero rows). An
    empty export reported `score: 15` before this was required.
  - **The checksum rate divides by the export, not by the anchor set.** A file
    the anchors never mention is an unverified file, and the rate has to say so;
    otherwise one anchor out of twenty-two reads as `score: 100`.
  - **Every named target has an explicit aggregation branch, and an unnamed one
    stops the build.** The chain and the ground-truth reader both end in a
    `never` guard. A target that no branch names used to inherit the generic
    strict formula in silence, which is how `openrca-2.0` came to report strict
    accuracy while its own spec advertises `matched facets / scored facets`.
  - **Every metric is labelled by how far it is from somebody else's code, and the
    label is derived rather than declared.** Three values: `replayed` (a corpus in
    `golden-master/` runs the released artefact's rule case by case), `transcribed`
    (a published prose rule with no released code) and `derived` (upstream publishes
    neither the rule nor its constants). The two-value version this replaced could
    not separate the first two — which is the distinction every disagreement found in
    this repository turns on. `provenance-matches-the-census.test.ts` maps each census
    class to one label, so the registry cannot claim more than the census supports,
    and `rca-bench official` reports the split (`5 / 3 / 1`) beside the counts.
- **OTLP ingest reads the encodings exporters actually write**, not only the one
  form the spec documents first. Five defects were reproduced here; the
  requirements below each exist because a legal document produced a wrong number
  with no error.
  - **A field is accepted in every form its encoding admits.** `asInt` arrives as
    a quoted string and as a JSON number; the OTLP JSON mapping documents the
    first and protojson emits the second. A numeric `asInt` used to be quarantined
    as "no numeric value" while its own quarantine record plainly contained one.
  - **Time conversions are exact before they are narrowed.** Nanoseconds become
    milliseconds by integer division in `BigInt`; `n * 1e-6` reported a 1 ms span
    as `0.999755859375` and disagreed with exact division on 2500 of 4000
    consecutive millisecond pairs. A duration wrong by a fraction of a
    millisecond is undetectable downstream: it is finite, positive and plausible.
  - **A value that is present is never silently dropped, and never silently
    defaulted.** Span status arrives as an enum name (`"STATUS_CODE_ERROR"`) and
    as a number. The reader matched numbers only, so an error span ingested with
    no `status` at all and **no quarantine entry** — the defect could only ever
    make a corpus look better than it was. Both encodings are read, and a code
    that is present but unreadable is quarantined.
  - **"Absent" and "unreadable" are different claims.** `severityText: ''` is an
    exporter with nothing to say, not an exporter saying something
    unrecognisable; it was quarantined as `invalid severity ''`, adding an entry
    that blames a record which was never at fault.
  - **Negativity is judged on exact instants, not on truncated units.** A span
    whose end precedes its start by one nanosecond truncated to `durationMs: 0`
    and passed as a legal zero-length span. An inverted timestamp is the broken
    clock signature this corpus must never contain, and truncation hid every
    inversion smaller than a unit.
- **LLM transport reads every completion the server sent**, and a credential never
  appears in code or git. This module had no test file at all while being the
  shared transport under both the DeepSeek and OpenAI adapters.
  - **A leading unusable choice does not discard the answer behind it.** An
    OpenAI-compatible server returns a first choice with no text for a refusal or
    a content-filtered turn; reading only `choices[0]` threw while a usable
    completion sat at index 1. Choices are inspected in order.
  - **Every malformed shape produces this module's own named diagnostic.** A
    `null` choice leaked `TypeError: Cannot read properties of null (reading
    'message')`, which names a JavaScript operation rather than a response shape.
    A `TypeError` is not an acceptable error for a bad response.
  - **An empty completion is not a completion.** The declared return type is
    `string`, so accepting `''` made an empty answer indistinguishable from a real
    one. Whitespace is still accepted, because that is a real answer.
- **A prompt and the parser fed by it must agree on the contract.** This is the
  first requirement in this document that spans two functions, because the defect
  did: reading either file alone showed nothing wrong.
  - The prompt must state a vocabulary as a vocabulary — `one of: …`, with the
    match rule — not as a bare field placeholder that a model has to infer from.
  - A value whose only deviation is casing or surrounding whitespace must survive
    the pipeline. Measured before this requirement: a reply of `NETWORK` parsed as
    `ok: true` and then failed validation with `invalid fault category 'NETWORK'`,
    so a correctly-extracted fault was rejected and the H3 reviewer was told the
    **category** was wrong when it was the **casing**.
  - An out-of-vocabulary value is rejected where it is read, naming the offending
    string, rather than deferred to a validator that reports it as a category
    error.
  - A synonym (`net` for `network`) is still rejected: that is a judgement, not a
    normalisation, and H3 is where it belongs.
- **A generated layout is a claim about a contract, and the contract is closed.**
  The rule generator's whole output is a mapping whose keys name IR fields, so the
  field set is a closed vocabulary and a name outside it is an error, not a stray
  key.
  - **An unknown field name is rejected, not dropped.** Measured before this
    requirement: a layout keyed `timstamp` parsed as `ok: true`, producing a layout
    that declared nothing while the parser reported success, and the *next* stage
    then reported the field as missing. A name is either accepted or rejected; it
    is never silently discarded.
  - **The check is per signal kind.** `spanName` is a real IR field and is still
    not a metric field. A membership test against the union of all kinds would
    accept every name a model can borrow across kinds, which is exactly the class
    of name a model shown the whole contract family is most likely to produce.
  - **An enum-valued field is checked against its enum, where it is read.** The
    declared type is erased at runtime, so for input that arrives as JSON from a
    model a cast is not a check. Measured before this requirement:
    `"semanticType": "not-a-real-semantic-type"` reached the IR and the schema then
    rejected the whole signal, discarding an otherwise valid record and naming the
    payload rather than the field.
  - **The prompt names every vocabulary the parser enforces**, not just the field
    that carries it — and only for the signal kinds that have the field.
- **A validation that replays nothing reports nothing.** Where a check consists of
  replaying a claim against evidence, an empty evidence set is a **failure**, never
  a pass. Measured before this requirement: `validateGeneratedLayout(layout,
  'metric', [])` returned `{"valid": true}`. Reachable in practice, because a
  source whose sample window contains only blank rows yields no samples, and the
  signature then reads as a verified layout. The missing-evidence reason is
  reported after the structural reasons, so a caller iterating on the layout is
  told about the layout first.
- **A completion is every text the server sent, and a transport error names the
  response.** The Anthropic adapter reads an array of typed blocks, so both halves
  of this need stating.
  - **A leading block of another type does not discard the answer.** Measured
    before this requirement: a leading `tool_use` block threw while a usable text
    block sat behind it. A non-text block is skipped, because it is a legitimate
    part of a response that carries no completion.
  - **A completion split across blocks is joined, not truncated.** Measured before
    this requirement: two text blocks returned only the first, and because every
    prompt this module serves asks for JSON, the consequence surfaced downstream as
    "malformed JSON" — a diagnosis naming the model's formatting for a parser that
    dropped half its output.
  - **A blank completion is not a completion**, and surrounding whitespace on a
    non-blank one is preserved rather than trimmed.
  - **Every malformed shape produces this module's own named diagnostic**, and
    never a `TypeError`, which names a JavaScript operation rather than a response
    shape. The offending block's **position** is named, and a non-array `content`
    field is distinguished from an empty one.
- **Round trip** (`rca-bench ingest` → `rca-bench export` → `rca-bench official`):
  official dataset data is read into the IR, written back out in the target's own
  layout, and graded by the published metric. The three anchors above all begin
  from a bundle *we* authored, so they cannot detect a misunderstanding shared by
  our exporter and our scorer; the round trip begins from the dataset itself and
  therefore can.
  - Case labels (root-cause component, fault type, injection time) are supplied in
    the descriptor and **never inferred**; a reproduction scored against a guessed
    answer proves nothing.
  - A component that is neither observed in the telemetry nor declared as an entity
    fails the ingest, so the emitted bundle is reference-complete by construction.
  - Zero silent loss: every source record is a signal or a quarantine entry, and a
    file claimed by no case is reported, not dropped.
  - A case that was never actually read is reported in `hardErrors`; a reproduction
    with non-empty `hardErrors` does not count as complete for that case.
  - Licensed corpora are never vendored: they stay out of the repository, and
    `golden-master/` holds case descriptors and a fetch registry rather than checksum
    anchors for data we do not have. Two workflows run this anchor:
    `anchor-roundtrip.yml` on every push against a synthetic corpus in the official
    layout (no network, no upstream data), and `official-data.yml` on a runner against
    the real corpora, fetched to the runner's temp directory outside the working tree.
    §2.40 states what each one does and does not establish.

### 2.39 CLI argument contract (audit pass 5)

The parser is the boundary at which a malformed invocation becomes an internal
one. Every criterion below is a statement about *where* a failure is reported:
the caller must learn that a flag value is wrong from a message naming the flag
and the reason, not from a downstream exception.

- **`--cases` is an array.** A JSON value that parses but is not an array is
  refused by the parser. `{"not":"array"}` must not reach `readCases`, which
  would fail on `.map`.
- **`--anchors` entries are SHA-256.** Each entry is a non-blank file name paired
  with a 64-character hex string. `{"a.txt":123}`, `{"a.txt":"abc123"}` (wrong
  length) and `{"":""}` are each refused, and the message names the offending
  entry. An empty anchor object is refused too: it asserts "verify these bytes"
  while supplying nothing, and a green result from it is indistinguishable from a
  run that checked no hash. Omitting the flag is the honest way to score
  structure only.
- **An offset is a whole minute within the zones that exist.** `-720..840`
  minutes (UTC-12:00 to UTC+14:00), an integer, and the value must survive an
  exact round trip through `Number()` — `0x10` and `1e3` are rejected because
  they are not the offset that was typed. A negative offset is spelled
  `--assume-offset-minutes=-300`; a bare `-300` cannot be a separate token, and
  `node:parseArgs` reports it as ambiguous. That is standard CLI behaviour, and
  the `=` form is the spelling the parser must accept.
- **A window is a whole millisecond within a day.** `--lead-ms` and `--lag-ms`
  are `0..86400000`, integer, exact round trip. The upper bound is not
  cosmetic: a 21-digit literal used to become `1e20` ms — about three billion
  years — which parses, is used, and includes every signal in the slice without
  ever throwing.
- **A blank path is not a path.** Every path flag on every command rejects a
  whitespace-only value, and the message names the flag. Surrounding whitespace
  around a *meaningful* path is stripped rather than rejected, and an internal
  space is preserved.
- **Two exemption rules apply here, and both are measured rather than assumed.**

  1. `asNonBlank`'s `typeof value !== 'string'` branch is **not covered and not
     coverable** by any argv, because every flag read through it is declared
     `type: 'string'` and `parseArgs` refuses such a flag when no value follows.
     The branch is defence in depth for a future spec, and it does not count
     against the per-module branch floor — but the *invariant that keeps it
     unreachable* is guarded by a test that reads the flag table and fails if a
     flag read as a string is declared as anything else.
  2. `parseInteger`'s `Number.isSafeInteger` test is **redundant within every
     range the CLI declares**, for one of two reasons, and pass 47 had to say
     both. Where the bound is small — `0..86400000` for the windows,
     `-720..840` for the offsets — an unsafe integer is at least nine orders of
     magnitude outside it and the range test rejects it. Where the bound **is**
     `Number.MAX_SAFE_INTEGER` — `--limit`, `--size` and `--timeout-ms` — the two
     tests are the same test, because `n > 2^53 - 1` is exactly what
     `!Number.isSafeInteger(n)` means for an integer. The injection matrix
     records this as a **green** result on purpose; the check is kept because the
     redundancy is a property of today's bounds, not of the function.
     `pullInstant` is the case that shows the distinction is real: it has no
     range beside it, so `Number.isSafeInteger` is the whole of its bound and is
     load-bearing there.

Both exemptions are recorded in [`audit.md`](./audit.md) with the measurement
that established them. A module touched by an audit pass is normally required to
reach 100% on all four dimensions; `args.ts` carries exactly these two
documented exemptions against its branch dimension, and nothing else.

### 2.40 Official-data round trip (audit pass 6)

The fourth L4 anchor is the only check in this document whose subject is a path this
repository does not author. Everything below is therefore stated as a criterion about
**what a green result means**, because the failure mode of this anchor is not a wrong
number — it is a green run that established nothing.

- **The corpus is fetched, not stored.** `scripts/fetch-official.mjs` writes to a path
  outside the working tree and refuses a destination under the repository root. Only
  the anchor-4 workflow may call it, and it fetches to `${{ runner.temp }}/official`
  -- not `/tmp`, which is a 7.9 GiB tmpfs on the ubuntu-26.04 runner image and cannot
  hold the corpus (finding 261). `check-no-vendored-data.mjs`
  fails the build if telemetry-shaped data (`.json`, `.csv`, `.tsv`, `.jsonl`,
  `.ndjson`, `.parquet`, `.zip`, `.gz`, `.tar` over 1 MiB, inside a corpus directory
  segment) appears in the tracked tree. Both directions are tested: a committed corpus
  file is rejected, and `docs/RE2-OB-notes.md` is allowed because the match is on
  path *segments*, not substrings.
- **No label is transcribed, by a human or by a script.** The case descriptors the
  round trip consumes are derived from the extracted corpus itself —
  `component`, `faultType` and `injectTime` come from the directory name and
  `inject_time.txt`. `scripts/gen-rcaeval-cases.mjs` is the only producer, and its
  default output path does not exist until it has run, so a hand-written descriptor
  file cannot be substituted for a derivation. A test asserts that the default path
  being absent is an error which names the generator.
- **The oracle is upstream's rule, not ours.** `check-official.mjs --official-dir`
  ingests the corpus, exports it, and scores the export with RCAEval's published
  metric. The ingest path must resolve the root-cause component to a graph entity, and
  the entity id must be the graph-qualified form
  (`service:rcaeval/ts-order-service`): the bare id is ambiguous, and an ambiguous id
  that happens to resolve is not a pass. **As of finding 176 the claim has an oracle
  behind it**: the scorer is held to upstream's own `Evaluator`, run at
  `259ea4167160256a74ad30004aa3d96a998c846e` over 86 case sets, pinned in
  `golden-master/rcaeval-evaluator.json` and asserted by
  `packages/core/test/rcaeval-evaluator.test.ts`. Before that it was a transcription,
  and the transcription was wrong -- `avg5` averaged per-k rates that had already been
  rounded, by 0.01 in 29 of 317 generated sets, which no input this project had ever
  scored could have shown.
- **OpenRCA 1.0 is held to its evaluator the same way, and the rule changed when it
  was.** `golden-master/openrca-evaluator.json` pins `microsoft/OpenRCA`'s
  `main/evaluate.py` at `c121a483a5a91dbae50708e5942c42a6609098b2` (10,536 bytes,
  sha256 `9a1c2351…d53f1`), records 28 `(prediction, scoring_points)` pairs and the
  `(passing, failing, score)` triple the evaluator returns for each, and
  `packages/core/test/openrca-evaluator.test.ts` replays them through this
  repository's scorer. **25 agree; 2 are declared differences, each with its
  direction and its reason** — upstream truncates a reason at an embedded quote, and
  upstream finds a JSON block inside prose. Both are parser differences, and
  reproducing either would score a correct answer lower for being correct.
  Before this the rule was a transcription of "matched criteria / criteria" over
  **one** root cause: measured on the first 25 cases, **10 disagreed**, inflating a
  two-root key to 1.0 where upstream says 0.83 and scoring a correctly permuted
  two-root answer 0 where upstream says 1.0.
- **No metric may cite this repository as the source of its own rule.** OpenRCA 2.0's
  `source` was `docs/targets/openrca-2.0.md` and its `quote` was a sentence written there,
  so the claim's evidence was the document making the claim. `golden-master/openrca2-evaluator.json`
  pins the paper that actually defines the metrics (arXiv 2606.27154v2, 962,086 bytes,
  sha256 `2c8388aa…`), records five clauses verbatim, and notes the negative result that
  makes the old quote wrong: `open-sourced` occurs zero times in the paper and neither
  `2.0` nor `PAVE` occurs in `microsoft/OpenRCA`'s README. The rule is now four of the
  paper's nine quantities — EM (the headline), AnySvc, Node F1 and Edge F1 — with the other
  five declared absent and argued, and `evidence` no longer scored by a metric no published
  metric scores it. `openrca2-evaluator.test.ts` asserts the source is not a `docs/` path.
  **PR is implemented too, and the field it seemed to need was already there**: PAVE admits
  a path only if every node on it deviated beyond its baseline screen, so the annotated
  path's nodes *are* alarm nodes. The set used is a subset of the paper's, which makes the
  reported `pr` a **lower bound** — stated in the corpus under `alarmNodeBasis`, because a
  claim of parity would be the defect this whole campaign is about.
- **ITBench's pass@1 is the cause alone, and the metric that used to carry that name did
  not say so.** `golden-master/itbench-evaluator.json` pins arXiv 2502.05352v1 by digest
  (4,068,098 bytes, sha256 `da47aa02…`) and records six clauses; the rule is now two numbers
  — the published `passAt1` and this repository's own strict conjunction, reported as
  `itbench-diagnosis-strict`. Measured over nine cases: **three disagreed with the old
  pass@1, all in one direction** (right cause, missing chain, reported as a failure). The
  two NTAM metrics are declared unimplemented rather than transcribed, because their
  components "have corresponding hyper-parameters that can be tuned" and the weights are not
  published — replaying them would mean choosing them.
- **AIOps2025 is held to §4.4 the same way, and one of its clauses is a relaxation the
  rule had dropped.** `golden-master/aiops2025-evaluator.json` pins the same PDF (and the
  suite asserts the two corpora's digests are equal) plus the dataset README, which is
  where `source` and `destination` are described. "for network attacks, LA accepts a hit
  on either source or destination" — the reader discarded both fields, so an answer naming
  the far endpoint of an injected network fault scored zero where the protocol pays full
  credit. The relaxation is one field (`OfficialGroundTruth.alternatives`) and one
  disjunction, scoped by the key's own fields rather than by a fault-type list. The second
  step of TA — "embedding-similarity fallback for unhit cases" — is **not** implemented, and
  the boundary is now a measurement rather than an argument: five surface models
  (character 2–5-gram cosine and token Dice) were scored over ten paraphrases and the
  ninety distractors derived from them, and every one overlaps the two classes (gaps
  −0.359 to −0.127), so any threshold either refuses a true paraphrase or credits a
  description of a different fault. The probe that decided it is
  `scripts/probe-ta-fallback.mjs`, its numbers are `golden-master/ta-fallback.json`, and
  the bar a future candidate must beat — every paraphrase above every distractor, margin at
  least 0.05 — is published with them (finding 391).
- **RCA100 is held to the sentences of its protocol, quoted verbatim.**
  `golden-master/rca100-evaluator.json` pins `arXiv 2606.29193v1` by digest (2,958,887
  bytes, sha256 `b8b8de83…`) and records four clauses from §5.4 with the argument for
  each, and `packages/core/test/rca100-evaluator.test.ts` holds the rule to them. Three
  clauses had been dropped: the adjacent credit was **0.5** where the section says
  **0.40**; the checkpoint comparison kept the signal name and discarded the
  `⟨comparator, value, unit⟩` condition it is about; and the formula was implemented
  **twice**, so `accuracy` and `final` reported different numbers for one quantity. The
  dataset's own fault-type rubric (1.0 / 0.5 / 0.2 for an exact L3, a shared L2 and a
  shared L1) is recorded and **not** applied, with the reason: it is 25 KB of CC BY-NC
  data this project does not redistribute, so the gap is pinned rather than half-closed.
- **A hyphen is a word boundary in a fault description.** A slug-written key
  (`replica-apply-thread-saturation on the order service`) is one token under a pattern that
  keeps `-` inside words, so a reason that spelled the compound out in prose scored **0**
  Type Accuracy while `the order service is slow` scored **1**. Both spellings now score 1, a
  single part of the compound scores 1, and a reason naming a different fault still scores 0
  (finding 390).
- **A refusal is enumerated once.** Three throw rows were published as `exempt` because "the
  same check above them fires first" — a description of duplicated guards rather than of an
  unreachable line. The two unknown-run copies became `runBody(run)` and the three
  corpus-without-`samples` copies became `readSamplesCorpus(path)`, both in the `data` module
  `scripts/type-miss-readings.mjs`, which a test may import where a probe may not. The
  inventory went from 41 throw statements to 38, and no row now rests on a sentence
  (finding 392).
- **The case directory name preserves the hyphen.** Upstream publishes
  `dataset/ts-order-service-cpu_1/`; a component slugified to `tsorderservice` names a
  directory that does not exist. One case per system pins the exact name, and a
  further case pins that a genuinely illegal character is still removed — so the fix
  cannot be satisfied by deleting the check.
- **The registry decides how an asset is unpacked.** An entry with `extractsTo: null`
  is a file and is not passed to `unzip`; an entry with a value is an archive. A case
  drives both shapes against a real local server, and a registry-wide case asserts the
  rule holds for every entry. `sha256: null` means *not yet computed* and is never
  treated as "verified"; a recorded digest that does not match fails the fetch.
- **A check with nothing to check does not report success.** An empty corpus is an
  error naming the path, and the generator's per-case warnings are printed before the
  empty-result decision, so a corpus in which every case was skipped cannot produce a
  silent zero exit. Both are asserted, and both were audit finding 31.
- **The default verdict contract is unchanged.** Adding `--official-dir` does not
  alter the nine verdict lines `check-official` prints without it. A test compares the
  two runs line for line, so the new mode cannot be shipped by loosening the old one.
- **What a green `anchor-roundtrip.yml` proves, and what it does not.** It runs on
  every push against a synthetic corpus in the official layout — enough to prove the
  wiring works, that the label never enters the computation, and that the score is
  1.00 when it should be. It does **not** prove agreement with upstream on real
  telemetry; that requires `official-data.yml`, which downloads the corpora on a
  runner. The two claims are kept apart in [`progress.md`](./progress.md) and this
  anchor is recorded as *executable, not reproduced* until the second has run.
- **A real corpus can also be read directly, and the result is a different claim
  again.** Audit finding 121 fetched five members of `RE1-TT.zip` — one per faulted
  component — read each one's local header before its payload and verified the
  decompressed member's crc32, and round-tripped all five at `oracle=1.00`. That is
  stronger than the synthetic corpus and weaker than the anchor: it shows the path
  handles real upstream telemetry, and it says nothing about whether our score agrees
  with upstream's. Three distinct claims live here and none substitutes for another —
  *the wiring runs*, *the path consumes real telemetry*, and *the number matches
  upstream* — and only the last is the anchor's.
- **A fix is credited to the layer that carries it, and that is measured.** The
  adapter's skip of a declared absence and the reader's three-state outcome are two
  changes on two paths. Removing the reader's branch leaves the five real cases
  passing, because the adapter strips the token before the reader sees the row;
  removing the adapter's skip refuses all five. A battery that ran only the corpus
  would call the reader's change unnecessary, and one that ran only the unit tests
  would credit it for the round trip, so the battery runs both and names each layer's
  caller (audit finding 121).

## L5 — End-to-end scenarios and HITL budget

Ten scenarios E1–E10 exercise the full pipeline (T1–T6 ingest, each target format,
degradation, quarantine, evolution). HITL is budgeted at **12–22.5 person-days per
1,000 cases** (vs 55–110 manual) — roughly a 78% reduction.

## The publishing channel

The channel that carries every revision to the remote is a decision, an execution and an entry
point, and the boundary between the first two is the whole of what makes the third checkable.

- **A plan is data, and it is written before any object exists.** It names every commit to publish,
  the entries of each tree, and where each one hangs; the two names it cannot know -- the commit
  SHAs the API will assign -- are symbols, `remote` or the local commit whose rebuilt form precedes
  this one, and the executor resolves each exactly once and refuses a symbol it cannot resolve. A
  plan that carried `parent: null` for the executor to fill in would have a hole in the one field
  that decides the history.
- **A remote that holds neither the revision nor any tree of its ancestry is refused.** Publishing
  the tip alone is how finding 404 lost two of three commits: the tree arrives, the sentences do
  not, and every check about content is satisfied. A branch that does not exist is a different
  state -- there is nothing to locate, so the whole ancestry is the window -- and it is published.
- **A `404` on the branch read is two states, and the channel asks which** (v3.58). The same status
  answers for a branch that has never been created and for one whose name is wrong, and the plan
  is identical for both. So the read is followed by one question -- what does the repository hold
  -- and the answer decides the meaning: nothing listed means the branch is unborn; anything
  listed means the name is wrong, and the push is refused unless the caller says `--new-branch`,
  naming what it found. A `409` **on the first page** is read as the empty list rather than
  forwarded, because there the status carries the fact the decision turns on; on any later page it
  is forwarded (v3.61), since the first page of an empty repository is `[]` and a second page
  exists only because the first one was full. A `403`, or a body that is not a list, is
  forwarded: a listing this channel was not allowed to read is not a repository with no refs, and
  the difference is a push onto a branch that may already exist. The listing is asked for **only**
  on that path, and the case asserts it by the shape of an ordinary push's requests rather than by
  the count.
- **A branch is created, not moved into existence** (v3.58). The ref update is a `PATCH` on a
  reference that has to exist, so an absent branch is created with `POST /git/refs`; before this,
  every real push onto an unborn branch ended in a `422` described as *"the branch moved ... it
  was null and is undefined"*. A name taken while the commits were being made is the creation's
  own refusal, and it is built **without** re-reading the branch, unlike the moved-ref one: a SHA
  can be compared and both halves printed, an absence cannot, and a second read would be a second
  branch read inside one push -- which the readings gate refuses without an exemption it would
  then have to grow. The refusal names **both** states its `422` can carry (v3.60): the name was
  taken while this push was being made, **or** the commit the ref was to name is not there after
  all -- the pointer path makes the second reachable, and neither can be told from the other
  without the second read the channel refuses to make.
- **`--new-branch` is a claim about the remote, and a false claim is refused** (v3.60). The flag
  exempts a `404` from the name-is-wrong refusal, and the same word also asserts *this branch does
  not exist*. A push that passes it onto a branch that **is** there would otherwise publish onto it
  and move a branch its author believes they are creating, so the existing branch is refused, with
  the commit it was found at. The recovery is named in the sentence: drop the flag, or name the
  branch that is meant to be new.
- **A creation path asks whether the remote already holds the commit** (v3.60). A branch that does
  not exist has nothing to locate a base against, so the window used to be the whole ancestry --
  every commit rebuilt and every blob uploaded -- even when the remote held all of it. One question
  settles it: a commit is closed, so `200` on `GET /git/commits/<tip>` means the history is there
  and the push is one `POST /git/refs`. `holds(sha)` is that question on both transports, and on
  the local one it asks for `^{commit}`, so a blob the remote holds is not an answer. It is asked
  **only** where the branch read answered `404`, so the ordinary push pays nothing, and only after
  the name-is-wrong refusal, so a typo is still refused first.
- **A push that builds nothing says so, in three places** (v3.60). The plan is empty -- an empty
  plan is a complete instruction when the ref does not exist yet, which is why `planPublish`'s
  refusal of an empty window does not apply -- and the result carries `identity: { state: 'held',
  commits: 0 }` with no base, because there was no window to locate. The command line prints
  *"the remote already holds <sha>: naming it is the whole push, and no commit is created"*, and a
  dry run prints *"nothing would be built; one request would create the branch"* rather than
  *"0 commit(s) would be published"*, which is true of the plan and says the opposite of what would
  happen. `--no-gate` announces itself, because a guard that is bypassed is a fact the transcript
  owes the reader.
- **A ref listing is pages, and the count in a refusal is a count** (v3.61). `/git/refs` answers a
  hundred refs at a time; one page was read as *every ref in the repository*, so a repository with a
  hundred and forty branches was refused with *"100 branch(es)"* -- a number the reader is entitled
  to act on. The channel walks pages until one comes back short, and it asks **once more than the
  obvious implementation**: a full page is not the last page, because a hundred is both the page
  size and the size of a repository that has a hundred refs. The walk is bounded at ten pages
  because it runs inside a refusal, and when the bound is reached the sentence says **"at least"**:
  a count of the pages read, printed as the count of refs that exist, is the defect the walk fixes.
  `refs()` answers `{ names, complete }` so the sentence can tell a finished count from a stopped
  one; the local transport answers `complete: true` unconditionally, which is the honest form of the
  same interface. Cost: a repository whose first page is short -- every repository this channel
  pushes to -- is one request, asserted by the exact request list rather than by a count.
- **An empty listing answers the tip question as well** (v3.61). The creation path asks whether the
  remote holds the tip before deciding to replay; when the listing has just said the repository has
  no refs, that question has a known answer and asking it spent a request on every first push. It
  is not asked then, and the channel says which answer it is acting on rather than printing the
  sentence reserved for a push that looked:
  *"the remote holds no refs, so there is no name a shortcut could carry: this push replays the
  history and the question about the tip is not asked"*. The replay is correct whatever the object
  store holds, which is why this is the conservative direction: the shortcut would have named a
  commit the listing never mentioned, in a repository whose objects are unreachable.
- **A created branch hangs on a tip the remote has, not on the whole history** (v3.61). A branch
  that does not exist has no tip to locate against, and the window used to be the whole ancestry --
  which on this repository made the branch **impossible** to create, because the history contains a
  merge and a replayed merge is refused. The base is chosen from the refs the repository *does*
  have: a tip whose SHA the ancestry already carries costs **no request** (and its tree is the local
  commit's tree), a renamed tip costs one commit read and matches by tree, and the **nearest**
  match wins because the window is everything above it. Only an empty listing still means the whole
  ancestry, which is what a first push is. The branch is still created rather than moved, and the
  choice is a bound rather than a rule: a base further back replays more and produces the same tip
  tree, which the executor asserts.
- **A branch is created at a twin, because a branch that does not exist has no first commit**
  (v3.61). Every push leaves the remote's tip carrying the tree of the local tip without being that
  commit, and the channel refuses to replay in that state -- correctly, for a branch that exists,
  since it would put a second commit with the same message on top of a tree that is already there.
  A branch being created is the other case: there is no second commit because there is no first one
  under that name. The condition names the ref as well as the index, and the window is the tip
  itself -- one commit, its parent the remote's name for the twin, no blob at all.
- **The receipt rule runs before the first request, on the pointer path too** (v3.61). v3.60
  described `--no-gate` on its real creation push as honest for *"a state in which the receipt rule
  has nothing to say"*. The rule had something to say and had already said it: `requireReceipt` runs
  on the tip's tree **before** the remote is read, so a push that publishes no content is still
  gated, because what the reference makes reachable is a tree. The bypass was real and remains in
  the record; the explanation was wrong. The case asserts the refusal, that the branch was not
  created, and that the executor made **zero** transport calls -- the ordering is the claim.
- **A tree listing that reports itself truncated cannot decide what is deleted.** A path missing
  from a partial listing and a path that was never there are the same absence; the refusal arrives
  before the first upload rather than after it.
- **A replayed commit has exactly one parent.** A merge's second parent is a history the remote
  would not receive, so the SHA it receives would not be the SHA that was written -- refused at the
  plan, not discovered at the log. The root of a plan onto an unborn branch has none, and that
  exception is stated in the same condition rather than assumed by a caller.
- **The remote log equals the local log after a replay, compared line for line, and the remote's
  tip SHA equals the local one.** Trees were equal on the day finding 404 happened; comparing
  commits compares the thing the round wrote. This is proved against a bare repository and against
  a server that speaks the API's shapes over a socket and writes real git objects, with no token
  and no network.
- **A rebuild is measured against the bytes that were sent** (v3.59). `predictRebuild` takes the
  local commit's own bytes, replaces the `parent` lines with the names the remote will use, and
  hashes the result. A rebuilt commit then has exactly three possible relations to its original:
  the same commit, the same commit with its parents renamed, or neither -- and only the third is
  refused, before the ref moves. The prediction is its own proof (given a commit's own parents it
  returns that commit's name, over a history that includes the one shape with two parent lines),
  and it is held against `git commit-tree`, an oracle it shares no line with.
- **A push that will rename its commits says so before it asks anything** (v3.59). `locateBase`
  falls back from a commit match to a tree match, which is the only comparison a rebuilt commit
  allows, and the fallback means the base is a **twin**: a commit carrying the tree of a local
  ancestor and not that commit. Every commit above it is then renamed by construction, because a
  name is a hash over bytes that include the parent's name. The plan says so before the first
  write, in a dry run as well, and the result says so as `identity: { state: 'parents' }` rather
  than as a lost history.
- **The verdict is one fact with one source** (v3.59). `identical`, the identity state and the
  sentence the command line prints are all read from the tip's own verdict. There is no count of
  exact against renamed: a push above a twin renames all of its commits and a push onto the same
  commit renames none, so such a pair could only ever be `(n, 0)` or `(0, n)`, and a column that
  cannot hold a third value restates the state beside it. `identity.commits` is the number.
- **The refusal of a lost byte is reachable** (v3.59). The `differs` verdict cannot be produced by
  an API that keeps what it is sent, so the suite's server is made *less* kind than the API for one
  case -- it drops the message's final newline -- and the channel must refuse rather than describe.
  The counterfactual is labelled: the API was measured, four message shapes, and it stored the
  bytes it was given in every one.
- **The receipt is checked where the push can see it.** A repository with a `verify:local` is asked
  for a receipt keyed on the tip's tree and the push refuses without one; a repository without a
  gate is not asked, because a rule that refused every push there would be turned off rather than
  satisfied.
- **The receipt is taken on the committed tree, because two of its checks read the index** (v3.115).
  `## Repository`'s `Tracked files` row is `git ls-files` and its `Commits` row names a revision;
  both describe the commit rather than the working tree, so a round that adds a file has one tree
  that passes and one that fails on byte-identical content. Measured: v3.115 ran the gate over its
  working tree (35 commands, `OK`), committed, and the same content then failed at 8 of 35 -- the
  tracked count one short of the commit that held it, and a budget threshold nothing had moved
  under. The second failure was the run that told the truth: a green gate is a reading of the box
  as well as of the tree, so the tree a receipt is filed for has to be the tree that gets published.
- **What is not claimed.** In v3.53's close-out the channel was pointed at the real
  `api.github.com`: the read path answered 640 entries for this repository (598 files after 42
  tree entries are skipped, `truncated: false`), and the write path published two commits to the
  docs repository and four to this one, every tree equal and every commit present in order. A
  third push met `UND_ERR_SOCKET (other side closed)` on `POST /git/blobs` -- no answer at all,
  which no in-process server had produced -- and the retry now covers a broken connection as well
  as a 5xx, with a test that destroys a socket to prove it. What remains unmodelled is any **other**
  error shape the live API may return, and the retry budget: a connection that never answers is
  refused after three attempts with the ref unmoved. Also not claimed, and measured in v3.59: a
  real push's commit SHAs equal the local ones. Re-measured in v3.60 by asking the API about each
  commit -- a subject is a string two commits can share, so the pairing counted sentences -- the
  remote holds **237 of 509** local commits by name and not the other **272**; the newest shared
  commit is `041ca04d1`, **272 commits back**, and the shared set is exactly the oldest 237: a
  suffix, so the rename above the boundary is total and every commit below it arrived byte for
  byte. `identical` has been false across that whole span and the CLI has said so every time. The
  cause this paragraph used to name (UTC author dates written by the old channel) was tested and is
  wrong: the API stores the `+0800` offset these commits carry and it stores a message's trailing
  newline, both confirmed by hashing the candidate byte strings locally and comparing them with the
  SHA the API returned. What differs is the parent line, and it differs because a plan grounded on
  a twin must rename. The line-for-line log equality is a claim about the test, where both sides
  are local git objects; the real push claims that every commit arrived, that its tree, message
  and both identities are the local ones, and that the parent *lines* are the only difference.
  The **creation** path met its first real push in v3.60 -- attempt 12, three requests, no object
  created -- and what it therefore does not claim is a creation that had to upload anything: the
  branch it made names a commit the remote already held, which on this repository is any commit
  older than the boundary. A creation of a branch at the *current* tip would replay the window
  above the twin, because the remote's name for the tip is not the local one; that path is proved
  by the stand-ins and has not been paid for on the real channel.

## Definition of Done (per change and per release)

- [ ] All layers L0–L3 green locally and in CI.
- [ ] Golden Master verification and the official-metric regression pass, and the
      round trip passes on the synthetic corpus (L4). A real-corpus pass requires a
      run of `official-data.yml`, and its result is recorded rather than assumed.
- [ ] No `continue-on-error`, no `|| true`, no skipped/`.only` tests, no mocks.
- [ ] Coverage ≥ 95% per dimension, 100% functions.
- [ ] Every LLM-produced field carries `FieldProvenance`.
- [ ] No upstream corpus data in the tracked tree (`pnpm lint`).
- [ ] Every published table names its derivation and is checked by one
      (`pnpm docs:check`; `check-repository-table.mjs` for `## Repository`).

## Honesty boundary

The factory **does not** claim a dataset is compliant if it fabricated a missing
modality. A target that requires an absent modality is reported as infeasible (or
exported as its largest valid subset with an explicit gap) — never silently "filled".

## The job declaration and the split

A round that adds a job has to publish a tree in which the recording does not yet mention it,
and the gate has to be green on that tree before CI can run it. `R9` is the contract for that
one round.

- **A promise names only what its writer can know.** A `jobs` entry in
  `golden-master/ci-declarations.json` carries four keys and no others: the job id, the ceiling
  `ci.yml` declares, the bound on every step of that job in order, and an argument of at least
  forty characters. `seconds`, `run`, `commit`, `measured`, `ratio` and `derived` are refused by
  name at both the job and the step level. `budgetErrors` checks the ceiling, the complete ordered
  step relation, a bound of each step's own and the floor; `R2`'s gap is excused for this job
  only; and the promise is refused the moment the recording holds the job, because its first run
  is what it was waiting for.
- **No deadline is claimed.** `R5` argues one from the seconds measured in front of a bound, and
  a job that has never run has none. `R9` computes no deadline, says so, and leaves the numbers
  to the first green run, where `R4`/`R5` settle them in the commit that deletes the promise.
  A rule that printed an arithmetic expression over bounds would be claiming knowledge of a
  runner it has never watched.
- **A borrow is not a run.** `measure-ci-baseline.mjs` skips a declared job that a run does not
  report and keeps the gap in the recording; it refuses `--borrow` for a declared job; and the
  first run that reports it records it normally and says the promise can be deleted without
  erasing the sentence itself.
- **A split proves its union.** Two shards of the sites battery run in two different jobs.
  `checkShardPlan` reads the real workflow and the real inventory and refuses a missing shard, a
  duplicated one, two shards in one job, disagreeing counts, an empty shard, and any claim
  measured zero or two times. The shipped script refuses an empty shard before spawning a child.
  In v3.54 the two shards measured **87 and 96 claims across 28 files each**, and their combined
  `--list` output is byte-for-byte the unsharded list.
- **The promise's lifetime, measured.** The tree was published with the promise in it and
  `check-ci-budget` green, run `42160224254` measured `sensitivity-shard` at **387 s**, the
  recorder said the declaration could be deleted, and the deletion is in the round's last
  commit. The recording now reads **8 jobs / 82 steps / 54 bounded**, and `R4` accepted 25
  minutes at **3.9x** -- a number only that run could supply.
- **What is not claimed.** The promise did **not** establish that its budget was enough: it
  named no seconds, and the bound was settled by the run rather than by the file. Nor does the
  split balance wall-clock time -- position-based sharding measured **1.6 and 3.4** minutes
  locally and **248 and 387** seconds on the runner, so the slower shard, not the sum, bounds
  the workflow; if that shard approaches twice its own bound the shards should be
  re-partitioned from a measurement rather than by position. The 25-minute bound was
  deliberately not tightened in the round that split the command, because `R4` has to size a
  bound from a run of the command it will enforce: at 3.9x it is now the loosest bound in the
  workflow, and tightening it to 13 minutes is a change that needs its own run.

## The two directions of a budget change

`R6` compares the ceiling a recording was taken under with the ceiling `ci.yml` declares,
and only one direction invalidates the reading.

- **A narrower budget is refused.** A step bound that fitted inside the wider ceiling may
  expire after the job has already died at the tighter one, which is the defect the bound
  exists to remove. The sentence says the bounds and the budget have to be re-measured
  together, and the repair is a run under the new ceiling.
- **A wider budget is accepted, and named.** No step bound moves and `R5`'s deadline only
  gains room, so a reading taken inside 20 minutes still describes every command that will
  run inside 34. The summary prints `budget(s) widened since the reading: backend 20 -> 34`
  so the exception is visible rather than mistaken for the recording's own number. A job with
  no ceiling is the widest state of all, so removing one is accepted and adding one is
  refused.
- **`backend` is bounded now, at 34 minutes.** It measured 296 s in run `42165763231` against
  37 s in the run before it, both spent mostly in `apt-get install prometheus`. Over the
  three-minute floor every step needs its own bound, and seven steps at three minutes are 21,
  one more than the 20-minute ceiling it had. The install's step is bounded at **16** -- 1.5x
  the 648 s a cold runner measured and 3.5x this run's 273 s.
- **What is not claimed.** The install bound has never met a slow day since it was written.
  It is sized from a range rather than from one reading, and if a run does install from a
  mirror slower than 648 s the bound will fire and be re-sized from that run -- which is the
  only honest way to size a step whose cost belongs to somebody else's server.

- **A bound is a floor plus a reading, not a reading doubled.** `R4` asks for at least twice the
  measurement, and a bound placed exactly there is refused by the next run that is 5% slower:
  `Lint` measured 347 s when its 12-minute bound was chosen and 361 s three runs later, where
  twice is 722 against 720. The bound is 14 minutes now. The claim this repository makes is
  therefore only that every bound is at least twice its reading -- never that it is *enough*
  for a slower day, which is a number no reading can supply.

## A bound is twice the slowest recorded day of its command

`R4` used to ask for twice **the** measurement, and "the" was the single run
`ci-baseline.json` happened to hold. That is a maximum taken over a sample of one, and the
round that noticed spent three runs proving it: a 13-minute plan refused by a 440-second
reading, `backend` unbounded because it had never been slow in front of the recorder, `Lint`
refused by 361 s against 720 after being sized from 347.

- **What is claimed.** Every step bound is at least twice the slowest reading of the command
  it bounds, across every run in `golden-master/ci-readings.json` and every job that ran it.
  The summary names the reading: `tightest sensitivity / Every proved exit can disappear
  without a word at 2.1x of the slowest reading of its command (633 s in ..., run
  42142175689)`. A bound whose ratio cannot be traced to a run is the defect, not the claim.
- **A bound is keyed by the command, not by the step's name.** Two jobs that run the same
  script share one series, and an action step is keyed by its name because an action has no
  `run:` of its own and the download is what costs. A renamed step keeps its entry, because
  each reading stores the command its seconds were spent on rather than resolving one through
  today's tree.
- **The history outlives the workflow.** `--seed` appends a past run and never touches the
  recording, and a job or step that did not exist then is named rather than refused. Adding a
  job would otherwise reset every bound's evidence to the sample of one the rule exists to
  remove; the round that added `sensitivity-shard` refused two earlier runs for exactly that
  reason before the flag existed.
- **A deadline counts the prefix at its slowest day.** `R5` compares `bound + the steps in
  front of it` with the job's ceiling, and the prefix is each step's slowest recorded day, not
  the recording's. Two ceilings moved because of it -- `verify` 15 to **18**, `batteries-heavy`
  25 to **27** -- and neither had been touched by the round that found them. A ceiling
  validated against a fast prefix is a ceiling a slow morning overruns, and the job then dies
  naming no step.
- **A bound can be too wide to fit inside its own ceiling, and narrowing beats raising.**
  `sensitivity`'s 25-minute bound plus a 180-second prefix is 1680 s against a 1560 s ceiling.
  The bound is **22** minutes (2.09x the slowest day) and the ceiling stayed at 26, because a
  ceiling is a tolerance for imprecision and a bound is a claim about a command.
- **What is not claimed.** The history holds only the days this repository recorded. A day
  slower than every entry is still refused for being slow rather than accepted, which is the
  correct verdict and also the boundary: the rule guarantees a margin over the worst day
  **already measured**, never over the worst day that exists. The spread that matters is
  runner variance, and the only way to learn it is to keep recording; six runs is six runs.
  Nor does the rule say anything about a bound's *absolute* size -- 2.1x of a 633-second
  command is 22 minutes, and a workflow whose commands grow will keep growing its bounds
  until somebody measures the commands rather than the bounds.

## A push leaves a reading of what the API answered

Every repair to the publishing channel before v3.56 was argued from one afternoon: a socket
that closed, a `500` with an empty body that cleared on retry, a base64 body refused with `400`
and accepted as `utf-8`. Each was true and none was a measurement, so the next round started
from an anecdote again.

- **What is claimed.** `golden-master/publish-readings.json` holds one entry per **push** --
  `{ rev, branch, rows }` -- and `rows` holds one entry per **attempt** made by the GitHub
  transport: `at`, `method`, `path`, `attempt`, `status`, `ms`, `sent`, `received`, `remaining`
  when the API reported a rate limit, and `error` when the connection broke. `--record FILE`
  appends this push, and the summary names the number of pushes, how many of them have a named
  tip, the request and retry counts, the unanswered attempts, the slowest request and the
  status histogram -- followed by one line per push, because a channel's variance is a
  question about pushes and an average over the file answers it with a number no single push
  produced.
- **The boundary between two pushes is structural, not a threshold.** `publish()` asks the
  remote for the branch before it decides anything, so every push begins with
  `GET /git/ref/heads/<branch>` and that row *is* where one push ends. A file is refused when
  a push begins with any other request, when its first row reads a different branch, when it
  begins with attempt 2 of that read (its first attempt would be in a push the file does not
  hold), and when a later row reads the branch again with no `PATCH` above it refused as
  `422` -- that last shape is two pushes stored as one.
- **The two reasons the channel reads a branch twice are exempt.** A `422` on
  `PATCH /git/refs/heads/<branch>` makes `updateRef` re-read the branch to say what the remote
  moved to, and a `500` on the read is retried. The exemption is safe because a retry is
  `attempt > 1` and a folded push always begins at attempt 1 -- which is not a hole in the
  rule but the reason the file can be split at all.
- **`rev` is the commit the push carried, or `null`.** The five pushes recorded before v3.57
  are `null`: their rows never named a tip, and a reader that filled one in would be inventing
  the fact it exists to report. The summary prints how many pushes have a named tip, so the
  gap stays a number rather than a footnote.
- **A retry is visible as two rows.** `publish-readings-cli.mjs` refuses a row that says
  `attempt: 3` without attempt 2 of the same request above it, because a missing row makes the
  retry count a number the file cannot defend. It also refuses a row with both a status and an
  error, one with neither, a timestamp that runs backwards, a push that starts before the push
  above it ended, a push with no rows, and a file that holds no pushes at all -- a reading of
  nothing is not a reading.
- **The error's code is the field the retry reads.** One function, `failureCode`, answers both
  `isNetworkFailure` and the recorder, so a row cannot name a code the retry did not consider.
- **The file is required rather than optional.** A gate that skipped the comparison when the
  history was absent would print `OK` about a question it had not asked.
- **A plan that is printed is flushed before the process ends.** `--list` writes its whole
  plan with one `writeFileSync(1, ...)`, because `process.stdout.write` on a pipe is
  asynchronous and `process.exit(0)` discards what is still buffered. Measured twice: 193 lines
  from the sharded calls against 183 from the unsharded one in CI, and a 2 000-claim plan that
  answered 171. A local run of the same case returned all 2 000, which is a statement about
  local timing rather than a refutation -- the machine that can produce the shape is the one
  the workflow runs on.
- **What is not claimed.** The rows are not verified: a row that says `201` on an attempt that
  got `500` passes every check, and only the process that made the request knows otherwise.
  The boundary rule says where a push begins, not that the rows inside one are the rows the
  transport made. The history's depth is whatever this repository has pushed since v3.56 --
  six attempts at v3.57, the last of them (`e23e9e352`) the first to name its tip -- and the
  file in the tree is always one attempt behind, because an attempt appends its rows after it
  has moved the ref. That is the same limit the CI readings have: a
  worst day is only as good as the worst day recorded.

### The open list (v3.62)

- **The live list states when it was read, in a number the guard recomputes.** Its first line is
  `Checked at <round>: **N** entries open`. `check-open-list.mjs` requires exactly one such line in
  the `## Open` section, requires its `N` to equal the entries below it, and requires its round to be
  the **newest round in the corpus** -- so a round that writes itself up without opening this file is
  red. A corpus with no round heading (every fixture) enforces none of that, and the guard prints
  which rule it did not enforce instead of passing quietly.
- **An entry is closed when its headline is struck, not when it quotes a struck sentence.** Two
  entries of the shipped list carry a sub-item's `~~[open: ...]~~ Closed by finding N` inside their
  bodies; both are open, and both were counted as history until the stamp's arithmetic disagreed with
  them by two (finding 458).
- **An open entry's reason is its last marker.** In a quoting entry the first marker belongs to the
  quote; the entry's own reason comes after it, because the quote is history and the reason is the
  claim.
- **What is not claimed.** The stamp proves a round stood in front of the entries and counted. It does
  not prove the entries were read, and it cannot: whether an entry is still true needs the measurement
  the entry is about. Every repair to this list before v3.62 was a sentence about reading it, and all
  three of the entries this round struck were closed by rounds that had written themselves up.

### The base of a created branch (v3.62)

- **A creation cannot replay fewer than one commit, and the search stops there.** Zero would be a
  pointer push, and `holds(tip)` has already answered `no` -- it is what puts a push on this path.
  Index 0 (the remote's twin of this tip) and index 1 (its parent) both replay exactly one commit, so
  a base found at either distance is final: no tip beyond it can improve on it and none is read.
- **What the search cost is printed, because it is the only number here that grows with the
  repository.** `the base is <sha>: k of the n remote tip(s) that are not local commits were read`,
  and when the search ended because it could not be improved on, the sentence says that; when no tip
  matched, `none of the n ... carries a tree in this ancestry, and all n were read: this push replays
  the whole history`. Three cases in `publish.test.ts` hold the three shapes: **zero** reads when a
  local tip already sits at the optimum, **one** when a twin supplies it, **all** when none can.
- **What is not claimed.** Requests are still linear in the number of twin tips in the worst case. The
  round removed the wasted reads and reported the rest; it did not remove the worst case, and a
  repository with a hundred renamed branches is still a hundred reads when none of them is the parent.

### The two sentences in one entry (v3.63)

- **A bullet's headline and its own reason have to agree about whether it is closed.** A closed
  entry may not carry an unstruck `[open: ...]` -- history in the headline, work in the body -- and an
  open entry's reason may not be struck through. Both directions are refused by `check-open-list.mjs`
  and driven by `check-open-list.test.ts`, and the two use **one** reading of the reason (the last
  marker), so they cannot drift apart on which sentence is the entry's own.
- **The shape is not new.** Round v2.44 writes it: a struck headline, a struck reason, the closure
  after them. The two entries this round found used half of it, and half is what a rule keyed on one
  sentence cannot read -- the guard counted them as work while the entry's own last sentence named the
  finding that closed it.
- **What is not claimed.** The count and the rule share a source: `N open` is computed from the
  verdicts the guard takes, so a guard that is wrong about an entry produces a count that is wrong
  about the same entry, and the two agree. v3.63 is the demonstration -- the stamp said 13, the guard
  said 13, the file said 11 -- and the only thing that could disagree with both was a reader.

### A record's spelling (v3.63, widened at v3.115 and v3.116)

- **Every record name the corpus uses is read, and a `priority` table under any other heading is
  refused.** `## Open` is the live list read as entries; `### Left open` is a record read as
  entries; `### Left open, <suffix>`, `### Leftovers, <suffix>` and `### What is left, <suffix>` are
  records read as **rows**. Anything else beginning `## Open` or `### Left open` is a red build,
  because a document that renames a list must not be able to move it out of its reader's reach in
  silence -- which is what happened at v3.45, when the record's heading gained a comma and nineteen
  records stopped being read (finding 463).
- **The prefix refusal caught only a prefix, and the corpus renamed the record twice without one.**
  `NEARLY = /^#{2,3} (?:Open|Left open|Closed)\b/` fires on a third spelling that shares a prefix
  with one of the two names, which is the shape its own test drives. The corpus's next two renames
  shared none: `### Leftovers, in the order that reaches the goal` (17 rounds) and `### What is left,
  in the order it has to happen` (5). Twenty-two records of 217 were read by nothing for between
  twelve and thirty-four rounds, and the summary said `25 record(s) in table form (188 row(s))` over
  a corpus that held 47 and 318 (finding 579). The refusal is keyed on the body now: a table whose
  first column is `priority` is a record whatever its heading says, and 47 of this corpus's 555
  tables begin with that column while no other table does.
- **The fourth column has two names.** Five of the 47 records name it `next` and 42 name it
  `next step`; a vocabulary with one word for it refused five frozen records for a rename no round
  may repair, so both are published (finding 580).
- **A table-form record is counted and declared unjudged.** Every summary line states how many such
  records were read and how many rows they hold, and says the rows were not judged. A table-form
  record that holds no table, or that carries an entry, is refused: zero rows would let an empty
  record pass as a record, and an entry under a heading the guard reads as rows would have no judge.
- **The fifth name is a list, and the body rule reads both halves.** The rule added in v3.115 asks
  whether a table's first column is `priority` and therefore only ever sees tables. `### Not fixed
  here` -- `v2.15`'s addendum, two entries with reasons -- is a record in **entries** form, and a
  section whose body is nothing but top-level bullets and their continuation lines, at least one of
  them an open entry with an unstruck headline, is a record whatever its heading says (finding 586).
  Measured over the progress corpus: 1,311 level-2 and level-3 sections are named none of the
  five, 202 of them hold an entry with a reason, and **one** holds no prose at column zero --
  which is the one. A heading that begins with a list name and is none of them
  (`### Open`) is still **refused rather than read**, because the rename exists so that a reader who
  greps for what is open finds one list, and a body rule that adopted the old name would leave that
  enforced by nothing.
- **What is not claimed.** The rows are not judged. Their `state` column is the round's own account,
  and there is no vocabulary it must come from; that is the entry v3.63 raised and did not close.

### The rows of a table-form record (v3.64)

- **A row is a row, not a pipe line.** A record's number of rows is what remains after the header --
  which names the columns -- and the rule under it. The nineteen shipped records hold **147** rows;
  v3.63 printed **185**, which is 147 plus two per record, and the sentence that printed it was the
  one claiming those rows were not judged (finding 464).
- **The refusal for an empty record is reachable.** `holds no table` was a `=== 0` against a count
  that could not be `1`: a header and a rule are two pipe lines, so a record that named its columns
  and stopped passed. It is now refused by name, and a record whose header draws no rule is refused
  too, because without the rule the first row is indistinguishable from a second header.
- **The shape is what the comment said it was.** Four arms: a rule under the header, the four column
  names `priority` / `item` / `state` / `next step`, one cell count per row, and a non-empty `state`
  cell. Nineteen headers and 147 rows violate none of them; the arms exist for the twentieth record.
- **The number is derived twice.** `147` is computed here from the content (a record's first cell is a
  bold priority) and the guard computes it from the structure, and the test holds the two together --
  which is the check that would have caught 185 on the day it was printed. That derivation is 130 rows
  short of the corpus as it stands: the 22 records v3.115 found name a **plain** priority, which is the
  convention v3.81's prose explains, so a census keyed on the bold cell agreed with a population that
  was 22 records short (finding 582). The derivation in the test is the structure now.
- **What is not claimed.** The `state` column is not judged: 78 distinct values over 147 rows, a median
  of 75 characters. That is a reading, not a state, and a vocabulary for it would mean rewriting
  nineteen frozen records. Capturing a column is not judging a value.

### A round is a number (v3.116)

- **One number names one round, and an addendum is a section of one.** A `## vX.Y, addendum` heading
  repeats its round's number by design -- the corpus has one, `v2.15`'s, written when the gate that
  round had just installed failed on it -- and it is not a round. A second `## vX.Y` heading is
  refused: two sections under one number make "which record did this round write" a question about
  position.
- **The numbers are dense, and that is a second derivation of the count.** Inside an era every
  increment is a round: 94 numbers in `v2` (`v2.06`..`v2.99`) and 116 in `v3` (`v3.00`..`v3.115`),
  which is 210 with none empty. A gap is refused, because in this log a number nothing uses is a round
  that was lost or renumbered. An era begins at `.00` and is the next one, so `v9.99 -> v10.00` is
  consecutive and `v9.99 -> v10.01` is not; the minors are not a two-digit field, because `v3.99` is
  followed by `v3.100`.
- **The population line counts rounds and says which units it counted.** It reads `220 record(s): 195
  under a round and 25 under none; 211 round(s) + 1 addendum(s), 17 of them wrote none`. The last
  number was `rounds.length - recordRounds.size` -- a count of headings minus a count of distinct
  names -- and the corpus's one repeated number was therefore published as a round that wrote nothing
  (finding 585). It is counted from the rounds now, and the addendum is printed beside them so a
  reader who was told "211 rounds" by every earlier round can see where that number came from.
- **What is not claimed.** That the seventeen rounds which wrote no record chose to. Eleven of them
  opened at least one entry by their own ledger, one says it closed a hole "rather than filed", and
  five say nothing (finding 587); the arm reads none of that, because it sees the list as it stands and
  not what a round did to it.

### The authority a closure names, and the line that publishes it (v3.117)

- **A closure names one of three authorities, and the summary counts which.** A closure may cite a
  **finding** (`Closed by finding 573`), a **round** (`Closed by v3.78`, `Closed by Pass 15`, because
  this log names rounds in two eras), or say it was **not a finding** (`Closed without a finding: …`,
  `Closed in this pass …`). The line publishes the three and their total: `56 closed (44 by a finding,
  9 by a round, 3 without one)`. It used to publish one number under one authority's name, and
  thirteen of the record's fifty-six closures do not name a finding -- three of them say so in their
  own words (finding 588).
- **A finding outranks a round, and a denial outranks a round.** `Closed at v3.97 by finding 540` is
  one closure with two names in it: the round is where the finding was filed and the finding is what a
  reader can check against a heading, so it counts as a finding. `Closed without a finding: …` is the
  writer's explicit sentence, and a version number in the sentence that follows it is not a closure.
- **The total is the sum of the three.** Not a fourth counter beside them: a total accumulated
  separately can disagree with its parts, and a total summed from them cannot.
- **What is not claimed.** That the third authority is true. An entry that says no finding closed it
  is reporting on work outside this tree -- a workflow, a scratch helper, a run -- and nothing here can
  check that. What is claimed is that each number names the authority it counted.

### A closure's sentence, and the period a version number carries (v3.117)

- **The citation has to be in the closure's own sentence, and a sentence ends at a period followed by
  whitespace.** `O-057` closes `Closed at v3.81 by measuring it and replacing the shape (finding 511)`
  -- 58 characters, inside any window, and unreadable to the rule that excluded the character `v3.81`
  contains. The window stops at `\.\s` now, which is what "one sentence" was always meant to be, and it
  is measured over 797 bullets with exactly one reading differently (finding 590).
- **A count in a sentence is read with a boundary, in a gate and in a test.** `0 closed by a finding`
  is a substring of `30 closed by a finding`, and an assertion of the first passed for every round
  while the line said the second (finding 589). A number in prose is the digits between a delimiter and
  their label: `countIn(line, 'closed (')` reads the number that stands there, or fails.
- **What is not claimed.** That every test which reads a count out of a sentence has a boundary. v3.117
  fixed the two the arm had; v3.118 censused the shape and found the population is **240** `toContain`
  literals that begin with a digit, and that **all 240** fail when the digit is prefixed -- so no
  assertion in the suite is reading nothing, and the residue is the other half of the question: an
  assertion whose *subject* is wrong can still be satisfied, which no substitution can see (finding 593).

### The unit a heading is judged in (v3.118)

- **The documents are English, and a quotation is not prose.** A fenced block, a code span and a block
  quote carry another document's bytes verbatim, and the reader skips all three. Everything else is
  this repository's prose, and prose has to be English.
- **The unit is a property of the position, not of the document.** A paragraph is judged in runs of
  **eight** Han characters, because the things this log legitimately quotes are two to seven
  characters long (`金标`, `未测量`, a cited file name inside a code span). A heading is judged in
  **one** Han character, or one ideographic comma, because it is a skeleton row and there is no
  citation that could stand at the front of it. Twenty-eight headings -- `### 一、`, `### Five、` and
  twenty-six like them -- stood in three volumes of this log under a reader that was green about
  every one (finding 591, finding 592).
- **A chapter mark with a Han numeral is a pointer, not a term.** `§六` names a section of a document
  whose skeleton is supposed to be English, so it is read as prose in its own right; `§6.2` is the
  spelling and is left alone. The unit there is two characters and the number reported is one
  (finding 592).
- **The number the line prints is a character count, and the line says so.** The heading unit admits a
  mark, so a line that said `N Han character(s) of prose` would have been false for the one heading in
  the log that carries no Han character at all. The report says `character(s)`, and the summary says
  `run(s) of non-English prose` (finding 592).
- **What is not claimed.** That a paragraph of seven Han characters is caught. It is not, and that is
  the price of the eight-character unit rather than an oversight: the unit cannot tell a quoted term
  from a short sentence, and the corpus is what put the threshold where it is. The heading unit is
  the part of the rule that does not pay that price.

### A census prints the numbers, and a claimant gets the history it reads (v3.125)

- **`volume(s) by 2` named the gates and never their numbers.** One gate prints `14 volume(s)` and another
  `18`, forty lines apart in the same log, and the reader built to hold two populations of one word together
  held the names (finding 609).
- **The line is one per shared noun**, with every gate's number, the qualifier that number carried, the mark
  that two gates print an equal count, and the relation a person wrote.
- **The relation is required of all nine shared nouns**, not of the three whose counts happen to be equal:
  the coincidences were a special case and `coincidences` left the inventory. `--write` refreshes the
  vocabulary and preserves every relation; a shared noun without one is a refusal.
- **A qualifier is read and carried.** `219 `vX.YY` round(s)` carries no number under a pattern that allows
  only a parenthetical, so `round(s)` was shared by two gates with no count under it and `219` against `219`
  was invisible; the census's coincidences went **3 -> 4** when it was read (finding 610).
- **What the census could not size, it now names.** `budget(s)`, `scope(s)` and `enum call(s)` state no number
  this reader can read, and they are printed as such -- a headline that is a measurement rather than a floor
  (finding 611).
- **A job that runs a claimant fetches the history the claimant reads.** `check-repository-table` derives
  `Commits (at `e22e2de`) = 536` from `git rev-list`, and `actions/checkout` fetches one commit unless told
  otherwise: a `--depth 1` clone refuses the gate, the census goes red, and the claimant is reported as a file
  that did not pass. `verify` takes `fetch-depth: 0`, and a test holds the relationship in both directions
  (finding 612).
- **A failure that prints no report is quoted, not diagnosed.** `failureDetail` returns the report when there
  is one and the run's tail under a label when there is not; `outputTail` had been written for exactly that
  case and imported by nobody (finding 613).
- **What is not promised.** The relation is a sentence, and the census holds no sets to contradict it --
  `volume(s)` is disjoint by directory only because a person said so (`O-097`).

### The nouns the gates count in, and the reader that compares them (v3.124)

- **`67 file(s)` was one of the `474` and no line said so.** The 67 are the tests that prove a gate site, the
  474 are the files the comment guard reads, and the inclusion is `67 of 67` by construction; `37 file(s)` and
  `6 file(s)` are outside both. Four summaries, one noun, three relations, none stated (finding 606).
- **The `of` is derived, not written.** `67 of the 474 file(s) the source walk reads`, with the denominator
  from `sourcesIn(ROOT)` -- the same walk that produces the other number -- so a test file added tomorrow moves
  both; and rule 6 refuses the sentence while any gate site is proved by a file the walk does not read.
- **Nine unit nouns are printed by more than one gate**, and the count `8` is printed as `row(s)` by two of
  them for two unrelated tables -- a case's pre-injection window and the rows under `## Repository`
  (finding 607). Nothing in the tree asked, so `O-091`'s premise that the nouns were private was measured
  false: `finding(s)` and `citation(s)` are private, `row(s)` is printed by four gates.
- **`check-unit-nouns` is the reader.** It derives the census from the eighteen gates, prints the shared nouns
  and the coincidences, and holds the vocabulary in `golden-master/unit-nouns.json`: which gate prints which
  noun, which two print one number, and **no counts**, because they move every round.
- **A coincidence carries a sentence a person wrote.** One population read twice (`1 addendum(s)`, both from
  `populationsOf`) and two populations under one noun (`8 row(s)`) are not the same claim, and the output
  cannot tell them apart; `--write` will not invent a reading and an unread coincidence is a refusal
  (finding 608). The judgement is keyed by the noun and the gate pair, never by the count.
- **What is not promised.** The census names the populations but computes almost none of the relations
  between them: `volume(s)` -- 14 audit volumes and 18 progress volumes, two lines apart -- is disjoint by
  directory and nothing says so (`O-096`).

### A subset is not a second population, and a ceiling is a bound (v3.123)

- **`226 record(s)` on one line and `47 record(s) in table form` on the next** -- one noun over two
  populations, with no word on the page saying the 47 is inside the 226. Both numbers were right, which is
  why two assertions that each held one number to the corpus could not see it (finding 603).
- **The line says how many it is a part of.** `47 of 227 record(s) are in table form (318 row(s))`, with the
  denominator taken from the same variable the population line prints, so the two lines cannot disagree while
  both are arithmetic; the shipped-corpus case reads both out of one run and holds them equal.
- **`bounds total 327 min` beside `51 min measured` was a division across eight ceilings**, and the
  comparison that decides whether a bound can fire -- a job's bounds against the ceiling above them -- was
  printed by no line. The sum now says how many denominators it has (`in 8 ceiling(s)`) and the ceiling gets a
  superlative with the day it was measured against (finding 604).
- **The sum is not the rule, and it was measured before it was refused.** Six of eight jobs hold more bounds
  than their ceiling, and no ceiling could fix it: the six shared preparation steps carry a three-minute floor
  each, so every job holds at least 21 minutes of bounds -- 21 minutes in a job whose whole day is 46 seconds.
  A ceiling that cannot fire is the same defect as a bound that cannot (finding 604).
- **`R12`: a ceiling holds twice its job's slowest recorded day**, the multiple `R4` and `R10` already demand
  of a step bound. The day is one reading summed, not a composite of each command's slowest day; a reading
  with a step missing is skipped rather than summed, and ties go to the newer run (finding 605).
- **Three ceilings were under it and moved**: `verify` **18 -> 21** (1.80x), `batteries` **25 -> 34**
  (1.48x), `batteries-heavy` **27 -> 31** (1.76x). `batteries` moves against v3.121's own reduction, and the
  comment at the job says why: that reduction's argument is the one finding 604 refuses.
- **What is not promised.** A day between twice the slowest and the sum still reaches the ceiling with every
  step inside its own bound, and neither of the two failures it could produce names a step (`O-095`). The
  workflow-wide sum is still printed and still unjudged: it is arithmetically right about a population no rule
  is about.

### One line, one partition: an entry of the live list is not an entry of a record (v3.122)

- **`597 open with a reason` was printed over a live list that held 37**, forty lines above the stamp that
  printed the 37. 597 was every bullet in every list section; 37 was the live list; the difference is **560**
  restatements of the same residuals in rounds' records (finding 602). Both numbers were true and neither
  sentence said what its subject was.
- **The population is a partition of tallies, summed from its parts.** `630 entry(ies) across 180 of 227
  section(s) ...: 38 open in the live list; 562 open restated in the log's records, 30 closed in the log's
  records (29 by a finding, 0 by a round, 1 without one)`. The total is the sum of the clauses, so it cannot
  disagree with them.
- **Every clause names the population it counts** -- the live list, the log's records, the record of closures
  -- and a clause appears only for a kind the document holds: the record of closures printed
  `0 open in the live list` for eight rounds over a section it does not have.
- **The section count is split for the same reason.** `179 of 226`: **47** of those sections are records in
  table form, holding **318** rows and no entries, and they are counted on their own line.
- **The id line names its two lists.** `94 entr(ies) with ids 1..94 (38 in the live list, 56 in the record of
  closures)`; 94 is those two added, and both numbers are now on the page to be added.
- **The stamp and the summary are asserted to agree**, by a shipped-corpus case that reads both out of the
  output rather than from a literal -- the pair that could drift for eight rounds cannot drift silently.
- **What is not promised.** The other nine gates' nouns (`finding(s)`, `citation(s)`, `entry(ies)`, `row(s)`)
  still have no reader that asks what they cover (`O-091`). Thirty closures live in rounds' records and nothing
  decides which home a closure has when the round that closes it restates it (`O-094`). And a fourth kind added
  to `spellingOf` without a row in `WHERE` would throw rather than refuse, because no fixture has a fourth kind.

### A word that counts a population says which population (v3.121)

- **`268 round(s)` and `215 round(s)` were printed forty lines apart over one corpus.** `check-progress-volumes`
  printed `order.length` -- every `## ` heading its volumes hold -- and `check-open-list` printed the distinct
  `vX.YY` numbers. Both were true of their own subject and neither line said what that subject was
  (finding 600). The gap is **215** rounds, **1** addendum, **50** `Pass` rounds of the older era and **2**
  headings with no number.
- **The summary prints the partition, so the total can be added up on the page.** `268 heading(s): 215 vX.YY
  round(s), 1 addendum(s), 50 Pass round(s), 2 unnumbered`. The buckets are a partition of `labelOf`'s four
  outputs, so nothing can be dropped between the total and its parts; a heading of no known kind is counted as
  `unnumbered` rather than vanishing.
- **`check-open-list` names its era**, because 215 is one era and the word it used was the whole corpus's.
- **A heading one reader can name and the other cannot is refused.** `check-open-list` identifies a round by
  `\b` after the number; `progress-volumes`' `VERSION` needs a space and then a title. `## v3.62` followed by
  anything was a round to one and "unnumbered" to the other.
- **The agreement is asserted rather than printed.** The shipped-corpus case derives 215 through `readVolumes`
  and requires the other gate to print it; a second literal would let one reader move while the other stayed
  green, which is the shape the defect had.
- **The row that counts rounds by hand was one behind, five times.** `v3.116`..`v3.120` each stated the count
  of the log *before* their own heading: **210**, **211**, **212**, **212 -> 213**, **213 -> 214** against
  **211**..**215**, and `v3.120`'s row prints its own contradiction -- `94 in v2, 120 in v3 (v3.00..v3.120)`,
  a range of **121** numbers (finding 601).
- **A stated count must be the count the corpus has.** The number is derived through `populationsOf`, the
  matcher strips the separators a ledger writes and matches on both sides of the digits (so `3` is not found
  inside `3,150`), and the rule is judged only on the round that can still be written -- the five frozen rows
  stay what they said, recorded as `O-092`.
- **What is not claimed.** That every summary noun now names its population: nine other gates print
  `finding(s)`, `citation(s)`, `entry(ies)` and `row(s)`, and nothing compares them (`O-091`). And that the
  number-line row is read for meaning rather than for presence: a row that states the right number beside a
  wrong sentence is not seen, and no parser over free prose would see it.

### A closing reading is a row the newest round carries (v3.120)

- **The newest round ends on a closing reading.** Its `## ` section contains a `| CI |` row that names a run.
  Before this rule the log's newest row sat under `v3.54` for **65 rounds**, and `R7` -- the rule that compares
  the recording with that row -- went on agreeing with it: a recording from any run newer than
  `42160224254` passed, including one three CI runs behind the tree (finding 597).
- **A ledger read with no row at all is refused, not skipped.** `ledgerErrors` used to return early when the
  newest row was `null`, which made an empty ledger indistinguishable from an agreeing one. The round's
  reading is asked about before the tail now.
- **The row states `**<n> of <m> jobs success**`.** `m` is `ci.yml`'s job count and `n` is `m`. A run id says
  a run happened, not which workflow ran: this repository draws ids from one sequence for `CI` and for
  `Anchor round trip`, and the round that wrote this rule reported a one-job `Anchor round trip` run as a CI
  run with eight (finding 598).
- **The gap behind the rule is printed rather than backfilled.** **203** rounds carry no closing reading.
  Naming runs for them now would be inventing provenance, so the green line prints how many rounds back the
  row it compares against sits, and the log states the number.
- **A recording is refreshed from the newest CI run, and the refresh is where stale bounds are found.** Three
  bounds were under the multiple of their newest measured day -- **1.08x**, **1.83x**, **1.92x** -- and no
  rule had asked, because the recording was three runs old (finding 599). The refresh refused all three, and
  the repairs are the arithmetic: **16 -> 30**, **9 -> 10**, **8 -> 9** minutes and the `backend` ceiling
  **34 -> 48**.
- **What is not claimed.** That every bound is 2x the worst day it will ever see: the install step is a mirror
  whose spread is 17 s to 888 s, and no `timeout-minutes` can tell a slow mirror from a hang. The bound covers
  the worst day recorded, and the day that beats it will raise it again.

### A bound has three sources, and a count has one noun (v3.119)

- **A step's budget comes from the step, from its job, or from nowhere.** Three answers, so the field
  that says where it came from has three values: `'step'`, `'job'`, `null`. It had two for as long as
  the gate has existed, and `null` meant both of the last two -- so a step the job bounds and a step
  nothing bounds were the same value, and every reader downstream saw one population (finding 595).
- **A count's noun may not be wider than the count.** The summary said `62 of 83 step(s) bounded`, where
  62 counts declared bounds and the workflow has 83 steps of which **none** is unbounded: 21 are bounded
  by their job. The arithmetic the sentence invites -- 83 minus 62 -- answered a question with the wrong
  answer, which is worse than not asking it. The clause publishes all three numbers (finding 595).
- **The population a rule argues about is stated by the rule's own predicate.** `R4` refuses a job that
  bounds some of its steps and not the others, and its condition was `=== null` -- the field's old
  two-valued reading. Repairing the field alone would have silenced the rule with nothing in the source
  looking wrong; the condition is `!== 'step'`, which is the question the rule actually asks, and the
  mixed-job test is what holds the two apart (finding 595).
- **A superlative with no subject is not printed.** A workflow whose every step inherits its job's
  budget has no ratio to report, so the shipped line printed `tightest  at unmeasuredx`. The state is
  reachable and is not an error, so the branch that says `no step carries a bound of its own, so nothing
  here is tight` is written out rather than left to a reader to interpret (finding 596).
- **What is not claimed.** That the three numbers sum to the step count by construction: they are
  counted independently, and one case recomputes the partition from `ci.yml` and holds the sentence
  against its own arithmetic. A step added to the workflow moves both sides; a summary that stopped
  counting a population would disagree with the file rather than with a number written in a test.

### A record may not be the only place a residual lives (v3.65)

- **The newest round's record is read against the live list.** Every row's `item` cell must quote an
  entry: after emphasis, quote and dash normalisation, twenty characters of the row have to appear
  inside an entry that the live list holds. A row that names nothing is refused -- it is a residual a
  reader of the list is not told about -- and so is a row that names an entry in other words, because
  then the row's words and the entry's words are each reachable only in their own document (finding 468).
- **Why the count did not find it.** The currency stamp is arithmetic over the entries below it, so a
  residual that is not an entry is not a residual to the number. Four residuals, one of them the log's
  only **P1**, lived in six rounds' records and in no entry (finding 467). The list grew from 11 to 15
  rather than shrinking, which is the direction an under-reporting list should move.
- **Only the newest record is judged.** A record is frozen: nothing appends to it, and a round that has
  been written up cannot be repaired. The rule therefore reads the one record that can still be edited,
  which is the same scope, and the same argument, as the stamp's comparison with the newest round.
- **A row too short to name anything is refused as such.** `see above` would fail the quotation arm by
  coincidence; refusing it by name keeps the diagnostic about the rule rather than about the odds.
- **What is not claimed.** The record's rows are still not judged for content, and the older twenty are
  not read for their company at all. What is claimed is that no residual can live only in a record.

### A new rule is justified against the rules that exist (v3.65)

- **`Closed by finding N` was already resolved, by `check-citations.mjs`.** That gate covers both
  documents, their indices and every volume of each, and refuses a citation of a number with no heading
  -- 1835 citations of 466 numbers, all resolving. The arm v3.65 added for the same property was a
  second ruler and was deleted in the round that added it, with its three tests and three mutations
  (finding 469).
- **What refuted it was the corpus, not a review.** The round's own write-up cited a number with no
  heading as the illustration of the defect, and the existing gate refused the paragraph. A claim about
  what this repository does or does not check is checkable by reading what it does.
- **What is still not claimed.** A citation of the right number for the wrong claim passes: both numbers
  have headings and the sentence is prose. That is the limit `audit-citations.mjs` states for itself.
- **What the round kept.** The four mutations that test the record arm, and the reading the deleted arm
  produced on its way past: 39 closure citations in the open list, 39 resolving.

### The index is smaller than the smallest volume it indexes (v3.65, superseded at v3.77)

> The comparison set this section established was **every** volume. It is now the volume that is still
> open, for the reason in the section below it, and the reason is finding 501. The measurements here are
> that round's and are unchanged.

- **The relation is printed every run, and it fired.** `check-progress-volumes.mjs` prints
  `index N of smallest volume M`. At v3.65 the index reached **93,828** against a smallest volume of
  **92,355** -- the first time in eighty-nine rounds -- and the gate refused with the sentence it was
  built to say: *either the section that grew is a record and belongs in a volume, or the index is no
  longer an index* (finding 470).
- **The answer is a classification, not a trim.** `## Audit passes` is a record with no lookup in it,
  and it is the only copy: v2.35 measured that of 79 prose sentences longer than 60 characters in it,
  none appear in `docs/audit/`. It moved to `docs/audit/passes.md` with its heading promoted one level.
  Nothing in it was rewritten, and the reading after the move is **74,295** -- 18,060 bytes of headroom.
- **A record is not judged by its size but by its reader.** The rule does not say what to delete; it
  says how much room is left. Cutting the index by trimming three paragraphs would have satisfied the
  number and left the next round in the same place, which is why the section that moved is the one
  nothing in the index looks up.
- **What is not claimed.** The next section to grow will hit the same relation. It is a gate that fires
  and an answer that has to be given again, not a defect repaired once.

### A number that speaks in the present is derived, not remembered (v3.66)

- **A gate-site count in a present-tense document must equal the inventory.** `check-doc-counts` reads
  three shapes -- `N of N claim(s)`, `N claim(s) across M file(s)`, `N failure site(s)` -- from
  `docs/acceptance.md` and `README.md`, and compares each with `golden-master/gate-sites.json` through
  the same `claimedSites` the two proof gates run. The sentence this rule replaced said 105 of 105 and
  had said so for twenty-four rounds (finding 471); the count above this list is the one derived now,
  and this paragraph does not restate it -- restating it is the drift the rule exists to stop.
- **The number is read from the artefact, not copied into a second one.** `derive-gate-sites.mjs
  --check` already holds the inventory to the tree, and `claimedSites` already decides what the proof
  gates run. A copy in `doc-counts.json` would have been a second account of one fact, and the copy is
  always the one that goes stale -- which is the shape of every defect in this list.
- **A dated sentence is a record and is not judged.** The corpus's volumes carry these numbers a dozen
  times, each true when it was measured; a rule that read them would fail every round and be deleted
  within one. The vocabulary already exists: a line that says `at v3.41` is a record. This is why the
  sentence in `docs/acceptance.md` dates its own history rather than hiding it.
- **Why the existing rules could not see it.** Rules 1 to 4 read table rows carrying `N files, M
  tests`: they are about the *suite*'s size. This was a sentence about *failure sites*, in a document
  that is not in the progress corpus at all. A number with no reader is not a number the guard is
  failing to check -- it is a number the guard's subject never contained.
- **What is not claimed.** The rule does not check that a present-tense document *carries* such a
  count; a specification may stop publishing one. What it refuses is publishing one that is wrong.

### A table about a suite is a projection of it (v3.66)

- **The mutation matrix's two columns now come from the code.** The mutation cell is
  `Mutation.description` and the verdict cell is `expected` (or, for an export mutation, the official
  target). `test/mutation.test.ts` parses the table out of `docs/acceptance.md` and compares both
  columns, so a row that stops describing what it names fails the suite (finding 472).
- **The measurement that motivated it.** Until v3.66 only the *ids* were compared, with a paragraph
  explaining that prose could not be validated mechanically. The paragraph was true of a table written
  by hand and false of the one that existed: **thirteen of eighteen rows named a mutation other than
  the one their id ran.** `MT-02` read *"signal ≠ payload.kind"* against a code row that declares a
  bogus unit; `MT-05` read *"unit mismatch on metric"* against the answer-key isolation mutation.
- **The rule is about the column, not about the prose.** A reader who wants *why* a mutation is
  caught still reads the gate. What the table may not do is paraphrase the one field it claims to
  reproduce -- and the way to make that impossible is to make it a projection, which is how
  `<!-- fields: -->` blocks in `docs/target-formats.md` already work.
- **What is not claimed.** The matrix is not complete on its own: `test/mutation.test.ts` is the
  evidence, and the table is the index into it.

### A set declares what it is for, and a prompt does not name its answer (v3.66)

- **G4 has a third arm: saturation.** `checkSaturation` reads the `BaselineOutcome[]` G4 already
  receives, takes the share of the *asked* cases the strongest baseline locates within top-K, and
  refuses a set above `saturationCeiling` (0.95) once at least `saturationMinCases` (10) carry an
  outcome. Measured on the shipped corpus: **30 of 30 at rate 1.000**, for both baselines, which is
  the number its success line had been printing as evidence of health (finding 473).
- **The corpus declares `purpose`.** `golden-master/fault-cases/index.json` carries
  `"purpose": "conformance"` at schema `/3`, and `check-fault-cases` refuses an index that declares
  neither word. A `conformance` set prints the reading and passes -- exercising a converter and being
  separable are different jobs -- and a `benchmark` set is held to the ceiling. Without the
  declaration the rule would be red on every run of a corpus doing its job, and a rule that is always
  red is a rule everyone learns to skip.
- **G5 has a second arm: the prompt.** `LEAK_IN_QUERY` fires when `groundTruth.rootCauseComponent`
  appears in `query`, compared after folding case and the separators `-`, `_`, `.`, `/` to spaces.
  Measured at the revision that added it: **19 of 30** cases named their own answer, not the 3 a
  substring comparison had reported -- the gap is entirely `checkout-api` against `checkout api`
  (finding 474). All nineteen task texts were rewritten; the reading is **0 of 30**.
- **Why the declaration could not stand in for the measurement.** `answerKeyIsolated` is a boolean a
  case asserts about itself, and it was `true` on all nineteen. A claim is not a measurement, and the
  case that says so most clearly is one whose prompt opens with its own answer.
- **Why this is not the same rule as `score.ts`'s `answer-key-isolated`.** That check compares
  **whole cells** of the exported `query.csv` against the answer key, which catches a field holding
  the answer and deliberately does not flag a sentence that mentions the component. This arm judges
  the IR case's prompt, where a named component makes localisation a reading exercise. Different
  artefacts, different claims; the export rule is unchanged.
- **What is not claimed.** Saturation is a reading against the baselines that were run, not against
  SOTA; a set can be unsaturated here and still be easy. And a name shorter than six characters is
  not judged, because a two-letter service name is also an English word -- the count that is skipped
  is printed rather than hidden.

### A table is a projection of a field, or it is a claim with one reader (v3.67)

- **Every row of a contract page's metadata table is generated.** The seven tables at the top of
  `docs/targets/*.md` are rendered by `gen-examples.mjs` from `scripts/format-spec.mjs` and from the
  `*_CONTRACT_VERSION` constant the exporters stamp, between `<!-- target: id -->` and `<!-- /target -->`.
  `pnpm examples:check` refuses a page that disagrees with either. Measured at the revision that added
  it: **41 rows across seven pages, and not one had ever been compared** with the field it restated; the
  table is **54 rows** now, thirteen of them rows the specification carried and the page had dropped or
  folded into a neighbour (finding 477).
- **The version has one writer.** `contractVersion` left `format-spec.mjs`; the cell prints the constant's
  value and the constant's name, both read out of the built package through `contractConstant`. A
  specification naming a constant the package does not export stops the generator instead of rendering
  `undefined` into seven cells.
- **A field this repository has not established is `null`, and it prints as `*not established*`.**
  `cloud-opsbench`'s vendor was `arXiv 2603.00468` -- a citation where a publisher goes -- and its page
  answered the mismatch by renaming the row to `Reference`. `vendor`, `venue` and `reference` are three
  rows now, and `reference` is omitted when there is none rather than printed empty.
- **A claim about an external paper is a quotation with a URL and a date.** `openrca-2.0`'s vendor read
  `Microsoft` from 2026-09-10 to v3.67 -- 1.0's vendor, the line above it in the same table -- and the
  same string was rendered as a badge on the site. The value is
  `The Chinese University of Hong Kong, Shenzhen`, quoted from the paper's author block in
  `golden-master/openrca2-evaluator.json` under `upstream.affiliation`, and a test asserts the published
  vendor is a substring of that line. This is the one statement in the tree no gate can derive.
- **The generator's check covers everything the generator writes.** `planDocRewrites` computes the three
  rewrites in memory and both modes consume it, so `--check` is the same computation as the write rather
  than a second opinion about it. Until v3.67 it compared `site/assets/data.js` and nothing else, which
  meant a hand-edited field table passed the step CI runs in the docs job (finding 478).
- **A block that has been deleted is not a block that agrees.** `--check` compares the blocks that are
  present, so the enumeration is separate: for every specification the page carries exactly one target
  block and one field marker per documented file -- thirty markers, checked against the specification's
  own list rather than against the page.

### The round that can still be written owes the coverage row (v3.67)

- **The newest round's `### Readings` carries a `| coverage |` row, four dimensions for `core` and four
  for `cli`.** `readVolumes` refuses the newest round when the row is absent or reports fewer numbers
  than that, and quotes the cell it found; `progress-volumes.test.ts` drives the refusal, the silence
  for an older round, and the shape of the cell. The row is what a later reader looks for when asking
  what a round cost; v3.66 answered it only after measuring its own two new arms at six uncovered
  branches.
- **The rule is judged on the round being written, and only there.** Thirty of the log's first fifty-four
  ledgers carry no coverage row, spread in runs across volumes 05 to 07; a rule over history would have
  been red from the day it existed, and a rule that is always red is one every reader skips. The
  asymmetry is asserted: a test builds a two-round volume where the older round has no row and the newest
  does, and requires silence. Same shape as the volume budget, which is judged only on the volume that
  can still grow.
- **What this rule can see is that the row is there and well formed.** It cannot see that the numbers are
  true: the coverage report is a build artefact and `docs:check` runs without one. What makes the number
  true is that it is written by the round that measured it, in the commit that measured it -- which is
  the difference between this row and the gate-site count above, where an artefact exists to derive from.

### Pollution is a case compared with another case (v3.68)

- **G5 compares a case with its neighbours, and a set may not hold one incident twice.** Two arms, both
  restricted to pairs inside one system: `NEAR_DUPLICATE_QUERY` when two task texts share at least 0.90 of
  their vocabulary as a set Jaccard, `OVERLAPPING_WINDOW` when two `[start, end)` windows share at least
  0.50 of their union. The fingerprint stays what it was -- an identity rule for
  `PUBLIC_SET_CONTAMINATION` -- and is not asked to answer a question about degrees (finding 479).
- **The comparison drops function words from both sides and reads CJK one character at a time.** Dropping
  `The`/`A` is what makes two spellings of one prompt score 1.00 rather than 0.77, and it leaves a topical
  coincidence lower than it would otherwise be. `[a-z0-9]+` alone would tokenise `订单服务变慢了` to the
  empty set, and an empty set would have to be reported as either a duplicate or a skip; a CJK character
  is a token of its own. The published stop-word list and the filter that uses it are one definition: a
  test asks each listed word to tokenise to nothing.
- **A window bound that cannot be read is declined, not parsed.** `Date.parse` answers NaN for a bound
  that is not a timestamp, NaN propagates into the ratio, and every comparison against NaN is false --
  which is how a gate reports a clean overlap over a window it never read. Such a pair is counted under
  `skippedMalformedWindow` and G5 does not throw on it: `runAllGates` calls every gate on every set.
- **A rule with no witness in the corpus reports the maximum it measured.** The shipped corpus's closest
  pair scores 0.25 and its most overlapping pair 1/6, against 0.90 and 0.50 -- so silence is not evidence
  and `readPairSimilarity` returns both maxima beside both thresholds. `check-fault-cases.mjs` prints
  `describePairSimilarity` on both exits, a test asserts the two figures and refuses a default under twice
  the measured maximum, and the injections that withdraw each guard are the only place a near duplicate
  exists at all.
- **A gate a corpus guard feeds one case at a time cannot have a pairwise arm.** `check-fault-cases.mjs`
  built `{ cases: [parsedCase] }` for every case, which is right for the four arms that read one case and
  blind to `DUPLICATE_CASE` and both new arms: ten copies of one incident passed that loop. The corpus is
  now asked as one set as well, filtered to the three codes whose subject is a pair, because the four
  per-case arms have already been asked with a better subject line.
- **A figure that was a reading and is written in the present tense will go false.** `readPromptLeaks`
  argued for its normalisation with `3 of 30` against `19 of 30`; v3.66 rewrote the corpus's prompts in
  the same round and both forms now report `0 of 30` (finding 480). A number in a document is either a
  reading -- cite the command that prints it -- or history, dated and in the past tense. The third thing,
  history written as though it were a reading, is the one that goes false without anyone editing it.

### A default is a claim about a distribution (v3.69)

- **A threshold with a default is read as a grid, and the grid is the gate's own computation.** G3's
  `minAbsZ` (2.0) and `minSustainedSamples` (3) sit in `G3_DEFAULTS`, and `readG3ThresholdGrid` evaluates
  sixteen cells by the same `metricGroups` / `absZScores` / `flipPoint` the verdict uses. A test compares
  every cell's refused set against `checkG3Validity`'s violations for that pair of lines, because a grid
  computed by a second implementation would be a second rule (finding 482).
- **A grid whose cells all agree is a finding about the corpus, not a pass.** On the shipped corpus 30 of
  30 cases are admitted at every reachable cell, and the reading says why: the weakest case stops
  sustaining three samples only at `|Z| >= 126.85`, which is 63.42x the shipped line. The margin is
  printed on both exits of `check-fault-cases.mjs` and asserted by a test; a rule that reports `passed`
  without printing what it measured is indistinguishable from a rule that never ran.
- **What a flat grid defends is the ordering, not the value.** The refused count never falls as either
  axis rises, over all sixteen cells. The value is undefended wherever the corpus cannot see the line,
  and the open list says so rather than the grid implying otherwise.
- **One fact, one writer -- third time in three rounds.** `REQUIRED_FIELDS` existed byte for byte in
  `ingest/prime.ts` and `llm/rulegen.ts`, one deciding whether a file is readable and one whether a
  model's mapping is complete. It is now `LAYOUT_REQUIRED_FIELDS` in `ingest/file.ts`, imported by both,
  and a test refuses a layout missing exactly one required field for every field of every kind.
- **An agreement figure names what it is agreement with.** The layout answer set has one author, so
  Cohen's kappa does not exist and every sentence that prints the figure says it is agreement with a
  *specified* answer -- a weaker claim than agreement between annotators, stated rather than implied
  (finding 483).
- **A validator's reach is stated, not assumed.** `validateGeneratedLayout` replays a layout against the
  samples, so it refuses a column that is absent or empty and cannot refuse a mapping to a real column
  that means the wrong thing. The reading counts that class separately (`misreads`) instead of folding it
  into the rate: the validator being right about its contract and the channel being right about the data
  are two claims.

### A bound that cannot move is a constant (v3.77)

- **The relation fired, and this time the repair it named did not exist.** `check-progress-volumes.mjs`
  required the index to be smaller than **every** volume, so the bound was the smallest one --
  `volume-02.md` at 92,355 bytes, closed eleven volumes ago, with nothing permitted to append to it. v3.76
  began with 955 bytes of room and ended with 15, and what it did to get green was shave three paragraphs
  of its own new entries until the arithmetic fitted: a number that is checked, and a repair that is not
  available (finding 501).
- **The set was the defect, not the statistic.** "Not bigger than the things it indexes" is a claim about
  what a reader needs, and the only volume a comparison can *act on* is the one still being written. The
  rule names that volume, prints it -- `index 92,340 of open volume 104,534` -- and its refusal names two
  repairs that both exist.
- **Headroom that grows is the property that was missing.** 11,607 bytes now against 15 before, and the
  volume that is still open gains bytes every round, so the gap widens instead of standing still while
  the index walks toward it.
- **What survives is the split instruction.** A new volume must be **born** larger than the index, or the
  relation is false the moment the boundary is drawn -- the reason v2.47's split moved twenty-one rounds.
  The index's own ceiling follows by transitivity: it can never exceed `MAX_BYTES`, because the open
  volume it must stay under cannot, so an index that reaches the volume budget has become a document.
- **What is given up is stated rather than hidden.** The index may now be bigger than a closed volume,
  and it is. That is accepted for the reason the volume budget is judged only on the last volume (finding
  208): a closed volume records a size it had, and comparing against it constrains the future with a fact
  about the past. The three fixtures that carry the relation assert both halves -- the closed volume it
  has passed is not a failure, and the open one it has passed is.
- **The relation has an injection now.** `VOLUME 1` restores the smallest-volume set, and what catches it
  is the fixture whose closed volume the index has already passed. Until v3.77 the rule had three fixtures
  and no injection, which is a rule that has been *covered* and not *proved*: nothing showed that a
  mutation of it is seen by a test.
- **What is not claimed.** `## Open` still grows: a struck entry stays where it is struck, so the live
  list gains bytes every round whatever the bound. The rule bounds the index against the volume, not
  against history, and the round that reaches the ceiling will have to move the closed part of the list
  into a volume -- named here so it is not discovered under a red build.

### A set that grows is how a rule about a set gets tested (v3.78)

- **The corpus's ratchet had a knife edge, and the round closed it with a case rather than an argument.**
  Four of thirty-three earned `L4` is 0.121 against a published floor of 0.1, so one edit shortening one
  chain put the corpus under its own claim. `history-queue-duplicate-publish-ingest-writer` is the fifth
  earned case -- three hops, `container -> pod -> service -> mq` -- and the first chain in the corpus that
  ends at a queue, which is to say at a component whose *contents* are wrong rather than whose latency is.
- **The denominator is now derived instead of quoted.** The tenth came from a corpus of nine. The gate
  prints the size at which the same numerator stops satisfying it (`floor(5 / 0.1) + 1 = 51`) and asserts
  the knife edge from both sides: any **one** earned case may be lost (4 of 33, 0.121), no **two** may be
  (3 of 32, 0.094). A ratchet that tolerates one and a ratchet that tolerates none differ by a single case,
  and no single fixture can tell them apart.
- **The case demanded a reading the corpus had never asked for.** Records on the topic against documents in
  the bucket, `records_per_document = 4`: the first reading that is a comparison **between two systems**
  rather than an excursion inside one series. That distinction is the case's reason to exist -- an
  excursion is the one shape a duplicate does not have, and every method the corpus ships ranks by
  excursion.
- **Its loudest series is a control, by construction.** Append p99 flat at 8ms, disk watermark 35 -> 39
  percent, container CPU at 0.4 of quota. A magnitude rank returns the topic, which is healthy and holds
  four copies of every document; the cause is the container that is *waiting*, and waiting is what its CPU
  reading says and what a rank never asks.
- **The prompt's vocabulary and the corpus's labels were two lists of the same names, and nothing compared
  them (finding 503).** `types` is the closed set the prompt offers; `expected.type` is the label a case
  carries. Shape was checked, coverage was checked, and the *content* of the vocabulary was not: it could
  name a type no case carries, or omit a type a case carries.
- **The hole was proved rather than suspected.** Dropping `queue-duplicate-amplification` -- this round's
  own type -- from `types` left `fault-prompt-grammar` and `check-fault-cases` both **green**. The corpus
  would have shipped a case whose answer the prompt declared illegal, and its own gate would have called
  that a pass. `checkSampleVocabulary` refuses in one sentence per direction, because a reader repairing a
  mismatch needs to know which side moved: `asks for a type the prompt does not offer`, `no sample labels
  it`.
- **Six fixtures would have been the previous round's shape, so the rule has an injection.** `VOCAB 1`
  empties the direction that refuses an unoffered label; the witness is the fixture that names one. The
  battery reads 64 injections and 76 witnesses, one of each being this rule.
- **What is not claimed.** The rule cannot say which side wins: adding a fault type means editing both
  lists, and whether a type with no case behind it should be deleted or a case added stays a decision with
  a reason in a round -- which is what the `provenance.categoryRule` count is for. And the corpus still has
  a claim it cannot earn: **six** cases state `L4` and **five** earn it, because the level is read from the
  graph rather than from the label, and that gap is the gate's whole point rather than a defect to close.

### A reading that is computed after the loop does not exist on the path the failure takes (v3.79)

- **The heap refusal existed, was tested, and ran zero times on the run it was written for.** It was
  computed once, over the whole run, from the largest heap any case had been observed at; its purpose is
  to say *"the next case of that size will not fit"* **before** V8 ends the process, and it ran at the one
  moment when that can no longer be true. Dispatch `42674673341` reached **6,960 MB of a 7,216 MB budget
  (96%) at case 182 of 270** and was killed; the only sentence in the log names no case (finding 504).
- **The refusal is a per-case decision now, and it stops the run rather than warning it.** At 90% of the
  declared heap the sentence names the case and the share, the case is still recorded, and the loop ends
  deliberately: `declared 3, scored 1` is a subset that is stated, which is the difference between a
  partial run and a partial run standing in for the whole.
- **The declared heap was wrong in the optimistic direction.** 7168 was 3.4x the largest case measured
  locally, on a synthetic case. The corpus's own largest is not that shape: the peak was **4,100 MB at
  case 54**, flat for the next 128 cases, and then a step past 6,960 MB at the first TrainTicket case
  (1,433,140 spans against SockShop's 95,000). A flat line followed by a cliff is the one shape a
  "largest observed so far" statistic cannot warn about, which is why the check is per case and why the
  job now declares **12288**.
- **The census was printed after a loop the interesting run did not finish.** `ROUNDTRIP CENSUS modalities
  <slice>` is the line that says what a slice ships; it was written in the epilogue from a map filled
  inside the loop, so the only dispatch that ever reached TrainTicket printed nothing about it. Every
  number in it is a fact about the corpus that is known when the walk ends, so it now prints **before the
  first case** -- and a run stopped by its own budget refusal still says what the whole slice ships
  (finding 505).
- **The check id that three rounds waited for arrived, and it is `data-csv-time`.** Two cases of 270
  (`checkoutservice_cpu/2`, `checkoutservice_mem/2`) fail with *"the table's first instant is '0' and the
  injection time is '1708475361', which have to be on the same clock"*: a corpus shape, not an export
  defect, and no repair. The other 168 failures carry the id `modalities` and no sentence, because their
  reason is the `MODALITY` line above -- the same complaint one order smaller, and left stated.
- **The audit had printed a projection as if it were a reading.** Finding 499 published
  `largest 3712 MB … (52%)`, `201.4 min`, `slowest 51.3 s` in a fenced block, in the position an output
  goes. No run produced it, and the first run that reached the case it named died at 96% of the same
  budget -- wrong by a factor of two in the direction that hides the problem (finding 506). The block is
  labelled as a projection now, with the two readings that replaced it beside it.
- **Both repairs have a mutation, and both are placement mutations.** `HEAP 1` deletes the guard and
  `CENSUS 1` moves the print back into the epilogue; the fixtures that catch them fail on the placement
  and not on the arithmetic. `HEAP 1`'s first draft raised the threshold to `1.5`, which under a 1 MB
  budget is a share of 1,184% -- inert, reported as a survivor, and repaired by deleting the guard rather
  than narrowing it.
- **What is not claimed.** The modality comparison still holds two `Map<string, number>` of every row's
  signature, which is two maps of 1.4 million long strings on a TrainTicket case, and the heap samples
  are taken at five stage boundaries so a spike inside that function is invisible until V8 prints one.
  It is entry 27 in the live list, with the number that makes it a candidate for the next round: 168 of
  the run's failures were `modalities`, so the function that decides them is the busiest in the round trip
  and the only one whose memory has never been measured.

### Every job fetches the history its claimants read, and a coloured run is still read (v3.126)

- **The rule was a list of commands, and the list was the defect.** v3.125 repaired `verify` and wrote the rule
  as `docs:check|verify-site-proofs|pnpm test|test:coverage`. `sensitivity` runs
  `verify-sites-are-sensitive.mjs`, which spawns one vitest per claimant, and it was not on the list -- so the
  next run moved the same red one job over with nothing changed in between (finding 614). Measured in a
  `git clone --depth 1`: `check-repository-table` refuses `e22e2de`, the census goes red, and `unit-nouns.test.ts`
  fails 1 of its 26 cases.
- **The default is the safe answer now.** Every job fetches the full history; a job that does not is named in
  the test together with the commands that make it safe, and each of that job's `run:` lines is read against the
  list one at a time. A fifth command fails the test, which is the only way an exemption can be kept from growing
  quietly.
- **The cost is measured rather than argued.** On run `44741826563` the jobs with full history spent **3.0** s
  checking out and the ones without **1.0-2.0** s, and the history is 34 MB against 5.1 MB for one commit.
- **A reader of a failed run reads the run, not the pipe.** `failureSummary`, `outputTail` and `hungTests` anchor
  their patterns at the start of a line, and vitest writes `FAIL` through a terminal: the line begins with an
  escape, so all three matched nothing and the battery printed "the run printed no report" while the report sat
  three lines above it, in colour (finding 615).
- **The escapes are stripped at the boundary** -- `decoloured` -- rather than the patterns widened: a widened
  pattern is a pattern about terminals, and the next terminal writes a different sequence.
- **The one reader that did not need it is left alone.** `exhaustedTestBudget` is not anchored, so removing the
  strip from it reds no test; it keeps `String(text)` and says why at the call.
- **What is not promised.** A claimant's own JSON report is on disk -- the battery asks for it for the margin and
  never reads its `failureMessages` -- so a second route to the same evidence exists and is not taken here.

### A judgement is a sentence and a partition, and the partition is what a run holds (v3.127)

- **A sentence is not something a run can hold.** Nine nouns are printed by more than one gate and each carried a
  `relation` a person wrote; the gate refused one without a sentence and never asked whether the sentence was
  still true (finding 616). The part of a sentence a run **can** decide is whether a group of gates reads one set,
  and that has a consequence in numbers.
- **A noun's gates are partitioned into populations**, stored beside the sentence. A group of two is the claim
  that those two read one set, and the gate checks it: their counts must have something in common, or the run is
  refused. `disjoint` is therefore derived rather than asserted -- a noun whose gates fall into more than one group
  is not one population -- which is what `O-097` asked for, and it costs a list of gate names rather than the sets
  themselves.
- **The unit is the group, not the noun**, because `file(s)` has two gates on the source walk and two elsewhere:
  one flag per noun cannot say that, and one sentence had no way to.
- **The check refused the first partition written under it.** `volume(s)` was written as one group of two; the gate
  answered `14 and 18 volume(s)` in one population -- two directories are not two readings of one set.
- **A population the record declares one that disagrees is refused on both doors.** It is the only refusal that is
  a fact about the corpus rather than about the record being unfinished, so `--write` refuses it too: a document
  cannot be brought up to date while the tree it describes holds two counts for one set.
- **Two of the nine sentences were already false, in opposite directions** (finding 617): `addendum(s)` claimed a
  shared reader (`populationsOf` in `progress-volumes.mjs`) that `check-open-list` does not import, and `round(s)`
  denied the forcing it had just described. Both conclusions were right; the census could not tell which half of a
  sentence was which, and now the half it can check is not in the sentence.
- **What is still promised only by a person.** The `relation` says *why* two gates read one set and what the sets
  that are not shared are. That is prose, and the next sentence to go wrong will be found by reading.
- **What is not claimed.** A partition holds gate names, not members: nothing here holds thirty-odd thousand row breaks, so a
  relation about *which* files are in a set is still prose.


### A judgement belongs to a noun, and the vocabulary belongs to the tree (v3.128)

- **A rule about the partition was applied to the sentence.** A judgement was keyed by the noun **and its gates**,
  and the argument for the key -- a partition drawn around four gates says nothing about a fifth -- is about the
  partition. A sentence says why two gates share a word, and a fifth gate joining does not make that false.
  `check-ci-budget` prints `N round(s)` only while the ledger is behind, so the noun's gate set moved **69 -> 70 ->
  69** inside one round and the sentence was retyped at each move (finding 618).
- **The key is the noun**, and a judgement still refuses to carry over between nouns: `row(s)` and `file(s)` are
  different populations and their sentences are not interchangeable.
- **The judgements are a list of their own.** `nouns` and `shared` both derive from the census, so a judgement on
  either is deleted by the first `--write` in which its noun is silent. `budget(s)` is the case: printed only while
  a ceiling is widened, absent from most rounds. The list is copied rather than recomputed, and a judgement for a
  noun this run did not print is kept and named.
- **The gates come from the census, not from the record.** `partitionProblems(judgement, gates)` takes the set this
  run found, and `stateOf(census, judgements, noun)` returns the gates, the record and `declared` together. Six
  readers had each been asking the partition for the gates and being answered out of `judgement.gates`, so every one
  of them compared the record with itself -- a half that was invisible from finding 616 to here.
- **The refusal names the gate rather than the key**: `round(s) (check-ci-budget is in no population)`. That is the
  answer to the risk `O-099` recorded -- a sentence about four gates cannot silently cover a fifth, because the
  fifth is refused.
- **A mutation has to land on an assertion.** The four this round: the unplaced-gate rule removed (1 red -- the
  sentence survives but the run does not say what it could not place, which is not a repair), the record read from
  the derived vocabulary (8), the record read from `shared` (1), and `--write` dropping a judgement whose noun the
  run did not print (1).
- **What is still promised only by a person.** A sentence already written, and whether its wording still describes
  the partition the noun has grown. A new gate is refused; a stale sentence is not.

### A ceiling holds the bounds inside it, and the seconds no step spends (v3.129)

- **A ceiling sized from a day cannot hold bounds sized from a composite of days.** Each step's bound is twice the
  slowest reading of *that step*, taken from whichever day had it, so the largest day the bounds allow is their sum.
  `batteries` held **83** minutes of bounds in a **34**-minute ceiling, and the day its own bounds describe is
  **41.5** minutes -- 1.22x the number meant to hold it (finding 619).
- **The two cannot-fire shapes are not symmetric.** A bound that cannot fire leaves nothing behind it and the
  verdict names the job. A ceiling that cannot fire has every step's bound behind it, and each names its step -- so
  the ceiling is the one number in a job whose job is not to name anything: a backstop for a bound that did not
  fire. The price of the wider number is wall clock, not a verdict.
- **One comparison, two terms, a stated winner**: `max(2 x the slowest day, the bounds inside the job + 2 x the
  seconds no step spends)`. The day term survives for the jobs whose steps carry no bound at all.
- **The overhead is measured, not stated.** `measure-ci-baseline.mjs` writes each job's own wall clock (`total`)
  beside its steps; what no step accounts for is the difference, doubled like every bound because a runner twice as
  slow sets up twice as slowly. A recording without it is refused rather than defaulted -- a margin nobody measured
  is a margin nobody checked. Measured: **3-8** s per job.
- **`R5` is deleted, not kept beside it.** `bound + prefix` is at most the sum of the bounds, so a ceiling that holds
  the sum holds every deadline; two sentences for one defect is how a reader learns to trust neither. What `R5`
  printed was a weaker diagnosis of the same tree.
- **A job with no ceiling is held to GitHub's six hours**, because that is the number it will die at, and a silent
  rule is how a ceiling that cannot hold its bounds goes unnoticed.
- **A mutation has to land on an assertion.** The four this round: the overhead dropped (4 reds), the day term alone
  -- `R12` restored (11), a recording with no `total` accepted (1), the inherited bounds counted (8).

### A sentence may state a count only if a gate printed it (v3.130)

- **A count in prose is a count in the record.** `scripts/unit-nouns.mjs` keeps the counts out of the inventory
  because they move every round; a relation that states one had none of that argument's protection, because nothing
  compared it with anything. `comment(s)`'s sentence said the smaller corpus was **4.7 per cent** of the larger
  while the two gates printed **1,252** and **25,855**, whose ratio is **4.842** -- for 4.7 to hold, the numerator
  would have to be 1,215 or the denominator 26,638 (finding 620).
- **Five of the nine relations state a figure, eight figures in all, and one of them was wrong.** The other four
  quoted counts the gates print; they are claims the run now checks.
- **The refusal names the figure and the counts**: `comment(s) states 4.7 and the counts under it are 25,855 and
  1,252`. A message that said "a relation states a number" would send a person looking for which.
- **Both doors refuse it.** `--write` copies the sentences forward verbatim, so the one door meant to leave the
  record truthful would otherwise rewrite a false sentence into it.
- **A numeral glued to a letter, a hyphen, a dot or an underscore is a name, not a count**: `L4`,
  `check-l4-status`, `v3.129`. The rule is lexical rather than a list of exemptions, because a list of names is a
  list to keep equal to the corpus. Removing the glue test reddens the shipped tree on `row(s) states 4`.
- **A label lifted out of a gate's line is not a label.** Behind the nineteen single-gate populations sit **20**
  uses; the words after the noun are empty in **8** and are half a parenthesis in **2** (`(21676 line`), against
  **6,047** characters of the gates' own lines. The label stays in the relation, which already names every
  population of eight nouns out of nine and in the order the census prints them.
- **A mutation has to land on an assertion.** The five this round: `figuresOf` blinded (4 reds), the glue test
  removed (2), the run's refusal dropped (1), `--write`'s refusal dropped (1), only the first unprinted figure
  reported (1).
- **What is not refused**: a ceiling far *above* its need, when the job has no bounds inside it -- narrowing it
  would refuse a slow day and widening it only costs minutes, so there is no number to prefer.

### A size in the live list carries the round that took it (v3.131)

- **A figure whose unit a commit can take again -- `bytes`, `KB`, `MB`, `lines` -- says when it was
  taken, or is this tree's figure at this commit.** `O-019` argued that `docs/acceptance.md` has grown
  too large to keep growing and quoted **96 KB**; the file was **165,067 bytes at v3.130**, so the
  entry that argues a document is too big was the entry quoting a size too small (finding 621).
  Nothing read the sentence for nineteen rounds, because the guard that owns the list reads an
  entry's state -- open, closed, by which authority -- and never its numbers.
- **The escape is a date, not the current size.** The file grows in most rounds, so a rule demanding
  this commit's size would be red on the round after every round that wrote one, and a rule that is
  always red is one every reader learns to skip. `at v3.131` makes a measurement a record, and a
  record does not age.
- **The units are the ones a commit can take again.** `439 s` and `84 minutes` measure a run that is
  over; no gate can take them, and a rule about them could be satisfied only by guessing. What a
  guard may demand is bounded by what it can measure.
- **Two refusals, because there are two repairs.** A sentence that names a file of this tree is told
  the size the file has; a sentence that names nothing is told to name the round that took it.
- **A quotation is not the list's claim.** `O-101` could not report `O-019`'s 96 KB without quoting
  it, and a rule that refused the quotation would refuse the report.
- **The lead-in is read with the entries.** The paragraph above the bullets held `65,544 of 98,927
  bytes`, which is the same count-in-prose the entries are refused for.
- **Only the live list.** A record is frozen and a closure is history: their numbers were measured at
  the round that wrote them, and demanding dates of them would be demanding edits of the record.
- **The rounding is what the figure promises.** A stated size matches within half a unit in its last
  place: `161.2 KB` is 165,067 bytes, and `96 KB` is not.
- **A mutation has to land on an assertion.** The eleven this round: dated-always (8 reds),
  dated-never (4), quotations read (1), a sentence end without mark-up (1), exact match only (2), no
  sentence guard (1), the lead-in unread (1), every kind read (1), an empty text one line long (1), a
  wrapped figure kept wrapped (1), a length compared in bytes (1) -- **22 reds**.

### The floor belongs to the job, and a prefix is what every job shares (v3.132)

- **A step's bound is for that step; the cold runner is not.** The floor was asked of every
  bounded step on the argument that a measurement cannot see a cold package index or a missed
  cache. A runner is cold once. Four setup steps bounded at three minutes each do not describe
  four cold runners -- they describe one, and three guesses -- and `batteries` paid for sixteen of
  them (**48** of its **84** minutes) against **165 s** of work (finding 622).
- **The prefix is derived, not declared.** It is the leading run of steps every job of the
  workflow shares, **name and command both**. A step only one job runs is that job's work whatever
  its name says; a step all eight run identically is what a runner costs. A workflow of one job has
  no prefix, because there is nothing for its steps to be common with.
- **One allowance per job.** `PREFIX_MINUTES` is the floor spent once: a prefix step declares no
  `timeout-minutes` of its own, and one number answers for the whole prefix. A prefix step that
  declares one is refused, because it is the same three minutes stated again, once per step.
- **A work step is bounded by twice its own day.** The floor is no longer asked of a work step; the
  multiple is. A two-minute bound on a 46-second step is accepted, and a one-minute bound on the
  same step is refused for being under the multiple.
- **The ceiling holds the allowance.** `R13`'s `bounds` term is the step bounds **plus** the
  prefix's one allowance: a ceiling that holds every bound and not the allowance fires before the
  number it granted.
- **A narrowing is `R13`'s question, not a demand for a re-measurement.** The refusal of every
  narrower ceiling was deleted, because twice the slowest day this repository has met plus twice the
  seconds no step spends is the number it was standing in for, and `R12` asks it with its own
  sentence. Every narrowing is printed beside every widening.
- **A job promise names the steps that carry a bound.** A never-run job's promise is about the
  bounds the first run will enforce; the prefix has none to promise.
- **What refuses a cold day.** The allowance (once per job), `R12`'s twice-the-day term and `R13`'s
  sum. A work step that is genuinely cache-sensitive argues a larger bound, which the gate permits
  and `R10` checks against the slowest reading of the same command anywhere.
- **A mutation has to land on an assertion.** The nine this round: the prefix always empty (4
  reds), matched by name and not by command (7), a prefix in a workflow of one job (33), the
  allowance growing with the prefix (3), a prefix step allowed its own bound (2), the ceiling not
  holding the allowance (1), a job promise naming the prefix steps (4), the summary hiding the
  allowance (1), and the narrower-ceiling refusal restored (3) -- **58 reds**.

### A count that can be zero prints zero (v3.133)

- **A sentence a census reads is a number and a noun, in that order.** `check-ci-budget` states how
  far the ledger's newest row sits from the newest round. That is a distance, and a distance can be
  zero; `0 round(s) before \`v3.132\`` and `, in the newest round` say the same thing, and only the
  first is a sentence the census can read (finding 623).
- **Prose that is better is still not a measurement.** The phrase that was removed read better than
  the one that replaced it. It survived a round for exactly that reason, and it cost a tree the next
  time the ledger caught up -- which is the trade every count in this campaign has taken the other
  way: a fact a reader can use *and* a gate can count beats a fact a reader can use.
- **A population's member must print the noun in every state a green run reaches.** The census holds
  a gate to what it prints under `round(s)`; a gate that prints the noun only while the ledger is
  behind is a member in one round and a stranger in the next, and the census is right to refuse both
  times. The repair is in the sentence, not in the census.
- **The states that print nothing are states with no row to place.** No sections, no round headings,
  and a row whose home is not a round: `R7` refuses a log whose newest round carries no closing
  reading before this sentence is written, so a green run never reaches them, and `0 round(s)` is not
  printed about a row that does not exist.
- **This is finding 618 one level down.** Finding 618 keyed a judgement by the *set* of gates
  printing a noun, and that set moved; the repair keyed by noun. Here the set is stable and what moved
  was whether one member printed the noun at all -- the same question at a smaller scale, and the same
  answer: the number is the thing that has to be there.
- **A mutation has to land on an assertion.** The four this round: the prose branch restored (3
  reds), the distance always zero (1), the noun printed without its number (2), the round named as the
  one the row sits in rather than the newest (1) -- **7 reds**. The first reddens the census case as
  well as the two that read the sentence, which is the chain that made this a rule rather than a
  preference.

### The allowance is argued, and what it owes the history is a floor (v3.134)

- **The allowance is the one number in the budget no reading can derive.** `R4` sizes a step bound
  from the seconds that step spent; the allowance is a number for a state that has never been
  recorded -- a runner whose package index, cache and first compile are all cold. v3.132 moved it
  from each step to each job and left it at three minutes, and **`O-102` has said since then that
  nobody measured it**: every ceiling holds exactly one, and all 21 readings this repository holds
  are warm days (finding 624).
- **What the history owes an argued number is a floor it can refuse.** `R15` refuses an allowance
  under twice the slowest prefix any recording has timed whole -- the same multiple `R4` asks of a
  work step, for the same reason: a setup twice as slow as the slowest ever seen is refused for
  being slow rather than for hanging. Measured at v3.134: the slowest whole prefix is **14 s**
  (`backend`, run `45033355331`), so the three minutes are **12.9x** that, and the rule binds the
  day a prefix costs 90 seconds or more.
- **A row counts only when it measured every step of the prefix.** A history missing one setup step
  sums to less than the prefix cost, and a sum with a hole in it is the shape `jobDays` refuses one
  level up -- the number would be small, defensible and wrong (finding 624).
- **The summary prints the multiple beside the allowance**, because a reader of a green run should
  see how much of the three minutes is argument: `which is 12.9x the slowest prefix any recording
  holds (14 s in `backend` of run `45033355331`)`. A summary that printed only the number would
  make an argued value indistinguishable from a measured one.
- **What is not claimed.** That a cold prefix has been measured -- it has not, and `R15` is a lower
  bound rather than a derivation. The rule raises its own requirement the first time a slow prefix
  is recorded, which is exactly the day the argument would otherwise be wrong about, and until then
  the number is a claim whose size is visible.

### A clause owes an address, and the file owes an index (v3.134)

- **Every clause names something a reader can open**: a finding in the audit volumes, a table of
  falsifications, a workflow run, or a test file. The four are not decoration -- each one is the case
  the judgement was decided on -- and the rule exists because `O-019`'s own measurement said the
  opposite. v3.133 read the file with a heuristic that called a bullet carrying a finding number
  "provenance" and reported 125 rules against 92 recollections; the first clause it misread is
  `The two sentences in one entry (v3.63)`, whose **three bullets are all rules and all cite a
  finding** (finding 625). A judgement with no case is a preference, which is what finding 121
  refused in prose.
- **Every clause's heading names its round.** `(v3.62)` in a heading is what lets a reader ask what
  changed there and get an answer from the log; three clauses written before the log carried finding
  numbers were the ones with neither, and each now names the test file that drives it -- `publish.test.ts`
  for the base of a created branch, `check-open-list.test.ts` for the two sentences in one entry,
  `progress-volumes.test.ts` for the coverage row (finding 625).
- **The index is a projection of the headings, compared line by line.** One row per clause, the
  heading and its round, regenerated by `--write` and refused when a row is missing, extra, out of
  order, or says a heading the file no longer says. Line by line rather than by set, because an index
  holding every row in the wrong order is a different defect from one holding a row the file dropped.
- **The index carries no links.** A GitHub anchor is a slug this script would compute by guessing --
  punctuation deleted, Chinese kept, a space turned into a hyphen -- and a slug off by one character
  is a link that fails **silently**: the reader lands nowhere and concludes the file has no such
  section. That is the shape finding 621 refused when it refused to print a ratio nothing compared;
  a heading's own text cannot be wrong, because it is a copy checked by the gate that copies it.
- **The two `2.39`/`2.40` audit checklists are exempt**: they are a list of checks this file asks of
  an audit, not clauses of the log, and they carry a pass number where the log carries a round.
- **What is not claimed.** That the file is shorter. `O-019`'s complaint was **navigation**, not
  length: 2,100 lines is a legitimate size for 37 decisions, and a reader who wants to know what this
  file requires should not have to read it. The index is the repair, and the length is what it costs.

### A number that is not a count of the noun is declared separate (v3.135)

- **The census's unit is the population, and a distance is not a member of one.** `round(s)` is
  printed by four gates: two count `vX.YY` headings, `check-acceptance-shape` counts the distinct
  rounds its clause headings name, and `check-ci-budget` states **how far** the ledger's newest row
  sits from the newest round. The fourth is a measurement in rounds rather than a count of them, and
  the record had one word for both -- so the distance was written as `[["check-ci-budget"]]`, a
  population of one reader, which is the same shape as `check-workflow-language`'s six workflows and
  is a corpus (finding 626).
- **A declaration is a gate and the sentence that says what it measures.** `separate` is the third
  placement, beside a population of one and a population of two. It is refused unless the gate prints
  the noun, sits in no population, and carries a sentence -- because the two questions, *which number
  is not a count* and *what it measures instead*, are one question, and a schema that answered only
  the first would leave a reader holding a zero with no unit.
- **A declaration's figure must be one that gate printed.** The noun's relation is checked against
  every count the noun is printed with; a declaration is checked against its own gate's counts alone,
  because the number beside it is that gate's number. `check-ci-budget`'s sentence may state the `0`
  it prints and may not borrow the `50` that `check-progress-volumes` prints.
- **The summary accounts for every placement, not only for the populations.** A run prints
  `27 placement(s) of those nouns: 6 in populations two or more gates read, 20 in populations of one
  gate, 1 declared separate`, where the old clause stopped at `3 population(s)` -- a number that could
  not be told apart from a record of six placements or of twenty-seven (finding 626). The cases that
  hold it are `unit-nouns.test.ts`'s census case and the four that drive a declaration through the
  gate.
- **What is not claimed.** That a declaration is checked by a number. The sentence is a judgement and
  stays one; what a run holds is that the gate prints the noun, that no other gate's number is filed
  under it, and that the sentence states no figure its gate did not print.

### A coincidence says which of three things it is (v3.136)

- **An equal number under one noun is one of three facts, and the line printed two.** Two gates print
  `8 row(s)`; the record either holds them in one population (the equality is a rule), places them in
  populations of their own (the equality is a **size**), or has not placed one of them (the equality
  is the only evidence that they might be one set). The census's marker said `inside a population` and
  `across two`, so `8 row(s)` -- two tables the record has already declared apart, on a line whose own
  sentence says the two tables are four tables and one word -- was printed in the same words as an
  equality nobody had examined (finding 627).
- **A gate declared separate is a gate that has been placed.** Its number is not a count of the noun,
  so an equality it takes part in cannot be a shared set; the third placement counts as an answer, not
  as silence.
- **The three counts print whenever any coincidence exists, zeros included.** `1 where declared
  populations keep them apart, 0 where no population places them` is what keeps a coincidence from
  leaving the line by deleting a clause: `22 reading(s)` in two gates at v3.134 was `23` and `22` at
  v3.135, and the sentence that said the two agreed was simply absent rather than counted as lost.
- **The marker speaks only for what the numbers line has not already said.** A coincidence a declared
  population holds needs no marker -- the numbers line has printed `one population at 8, and the count
  agrees` -- and the two markers that remain are distinct sentences, because a warning repeated after
  its own proof is a warning a reader learns to skip.
- **What is not claimed.** That the census can refuse a coincidence that goes out. A size is not a
  claim, so there is nothing to violate; what a run owes the reader is that the class is always named,
  so the reader comparing two logs sees a number move rather than a sentence vanish.

### A bound's comment names the reading that last moved it (v3.136)

- **A bound is sized from a reading, and the number and its account live in the same place.** The
  `lint` step carried `timeout-minutes: 17` and a comment whose last paragraph said `16 from v3.124`:
  the 17 went in at v3.126, the arithmetic was in an audit volume, and the place a maintainer reads
  before changing the number named a smaller one. A reader checking the comment would have checked a
  different round (finding 628).
- **Six seconds of margin is not a margin.** The same 17 was set against a 507 s reading, where twice
  is 1,014 s and the bound was 1,020 s. Two rounds later a 521 s run put it under the multiple by
  22 s, and `R12` refused. The paragraph four lines above the number is the finding that says not to
  do this -- *a bound at exactly twice a reading is a bound that fires on a 5% slower day* -- so the
  repair states its own arithmetic: 1,080 s, 2.07x the slowest reading, 38 s above the multiple, and
  names the trend and the trigger at which a minute stops being the answer (`O-108`).
- **A ceiling pays for the bounds it holds, so a bound that moves takes its ceiling with it.** The
  verify ceiling moves 39 -> 40 because the bounds add up to 2,160 s, plus the 180 s prefix
  allowance, plus 8 s of doubled overhead, is 2,348 s. The step's own bound and the job's ceiling are
  one piece of arithmetic written in two places, and `R13` is what holds them together.
- **What is not claimed.** That the readings are a distribution. They are two populations -- 307 and
  334 s against 501, 503, 507 and 521 -- and a bound sized at 2.07x of the slower one is sized
  against the wrong half of a bimodal step whose cheaper half is a build cache (`O-109`).

### A marker names the count it is about (v3.137)

- **One sentence per coincidence, and the sentence opens with its count.** A noun can carry two
  equalities at once -- `8 row(s)` inside one population and `9 row(s)` from two populations of their
  own -- and the marker spoke for the noun: `(a count two gates print agrees, and the record places
  them in different sets)` was true of the `9` and false of the `8` beside it, which the numbers line
  had already marked as `one population at 8, and the count agrees` (finding 629).
- **A sentence is built from the coincidence it is printed for, not chosen for the noun.** The old
  form picked one sentence by precedence, and the argument that two classes could not co-occur -- an
  undeclared noun has no partition to place its gates, a declared one cannot leave a gate unplaced --
  was doing the work of a construction. A noun with three coincidences prints three sentences, in the
  order of the counts they name.
- **The class that needs no marker still gets none.** A coincidence a declared population holds is
  marked in the numbers line, and repeating it in the parenthesis would print a proof as a warning;
  what a reader has to act on is the sentence about a number nobody has placed.
- **What is not claimed.** That a sentence can be read without the numbers. The parenthesis names a
  count and does not restate what that count's line says: `at 9` is a pointer, not a summary.

### A snapshot is a claim about one tree, and the reader that can refuse it re-derives it (v3.137)

- **A write cannot know that it is the round's last act.** `measure-doc-counts --write-doc` measures
  the suite as it stands and writes what it found; whether the tree changes afterwards is a fact about
  the future. v3.132 took its snapshot with eight of nine new cases written and published **6,843**
  tests against a tree that ended at **6,844**; v3.131 wrote the row before `git add` and published
  **672** tracked files against the checkout's **675** (finding 630).
- **What can be checked is not the writer's timing but the reader's tree.** `measure-doc-counts
  --check` re-derives the same three scopes -- by spawning the suite, or from the coverage run's
  reports with `--from` -- and compares them with the golden. That reader is step **6** of
  `verify:local` and the step after `test:coverage` in the workflow, so the pipeline reads the tree
  after every edit a round makes.
- **`docs:check` is not that reader.** It compares the document with the golden and never spawns the
  suite, so its green says the two files agree and says nothing about the tree. A snapshot taken early
  is green locally and red at the counts step, and that ordering -- write whenever, read after the
  last edit -- is the discipline, not the writer's clock.
- **What is not claimed.** That a violation is refused at the moment of writing. The refusal is at the
  step that re-derives, and the evidence it needs -- a suite that runs -- is what a writer cannot take
  twice without measuring the tree it is still changing.

### A multiple is printed with the spread of the series it was sized from (v3.138)

- **A bound is twice the slowest reading of its command, so the multiple is a claim about one
  day.** `2.0x` on its own reads as the tightest bound the rule allows; the same `2.0x` against a command
  whose readings run from **16 s** to **888 s** is a bound sized from a tail, and the tail is what
  the `backend` job's ceiling pays for. The gate prints the slowest reading it divided by, and now
  prints the range beside it (`O-109`, finding 631).
- **The window of the spread is the command, not the job and not the workflow.** `R10` keys its
  series by the command, and the sentence's range is read from the same function that produces
  the denominator: a second account of "which readings belong to this command" is how the multiple
  and its explanation would come to be about different sets.
- **Two bounds for two cache states is not an available repair.** A step carries one
  `timeout-minutes`, and a bound that fit only the warm state would refuse the cold day for being
  slow -- the failure the multiple exists to prevent. The dispersion is therefore evidence printed
  rather than structure added, and the second half of `O-109`'s question is answered by the
  workflow's own shape rather than by a preference.
- **One reading is printed as `read once`, and equal readings as `every reading ... is the same`.**
  A range from a number to itself is a sentence that looks like evidence and carries none, and a
  bound argued from a single measurement is a different claim from one argued from a series.
- **What is not claimed.** That a range makes a multiple interpretable. It says the multiple is
  against an extreme of a series that wide; whether the next reading lands inside it is what the
  next recording answers, and `R12`'s rule is unchanged.

### A claim about now sits under one round (v3.138)

- **`current` is a claim about *this* tree, and a corpus has one newest round.** So there is one
  place in the documents where the claim can be true: the guard refuses a row marked
  `(as of this commit)` that sits under an older round, names both rounds, and prints the repair
  -- date the row, never renumber it (`O-111`, finding 632).
- **A round is compared as a number.** `v3.9` is older than `v3.10`, and the corpus spans two
  major series (`v2.12` and `v3.137`); a string comparison would make the older of two rounds the
  newer and refuse the row that is actually current.
- **A row under no round heading is left to the rule that holds it to the measurement.** The index
  file's tables describe the tree rather than a round, rule 3 already holds them to the snapshot,
  and the claim this rule is about is two **rounds** each saying "now". A heading that names no
  round (`## Repository`, `## Open`) therefore leaves its rows unattributed rather than giving
  them a round called `Repository`.
- **The repair is available in every state, and it is never a new number.** Dating the row is what
  stops rule 3 applying to it, because a dated record is supposed to differ from today; renumbering
  it to the live count would contradict the round's own `new tests` row.
- **What is not claimed.** That this makes the snapshot current. It refuses a contradiction inside
  the documents -- two rounds both saying "now" -- and says nothing about whether the snapshot
  matches the tree, which is `O-110` and is the counts step's question.

### A bound is printed at both ends of the series it was sized from (v3.139)

- **A bound is sized from the worst day a command has had, so on the best day it is pure
  headroom.** The gate prints both ends: the tightest bound against the slowest reading it divides
  by, and the bound that stands furthest above the fastest reading of its own command. One end tells
  a reader whether the bound can fire; the other tells them where the `246 min` of bounds went
  (`O-113`, finding 633).
- **The headroom is seconds, not a multiple.** `bound / fastest` does not exist for the four bounds
  whose command has been read at **0 s**, and a summary that divided would print `Infinity` there.
  Seconds subtract, so the number exists for every pair and it is in the same unit as the total it
  explains.
- **The two instruments are combined in the direction the question asks.** `R10`'s denominator is
  the worse of the recording and the slowest reading; the headroom is the better of the recording
  and the fastest reading, and the history wins a tie because it names a run a reader can open.
- **One bound may hold both ends, and the sentence says so.** Printing one step's name twice would
  read as two steps being compared; the shipped tree is that case, because the install command's
  28 readings span **16 s** to **888 s** and its 30-minute bound is tight at one end and `1,784 s`
  generous at the other.
- **What is not claimed.** That either clause describes a normal day. Both are extremes, and the
  install command's median of **21 s** -- `86x` under its bound -- is printed by nothing (`O-116`).

### A green line names the two sides it joined (v3.139)

- **A comparison between two files cannot see that both are wrong.** `check-doc-counts` joins the
  published counts to a snapshot and never spawns the suite, so a snapshot and the rows that quote it
  can be stale together: measured at v3.137, one test off, its exit **0** against exit **1** from the
  reader that re-derives (`O-110`, finding 634).
- **The repair is the sentence, not a second verdict.** Reading a report when one happens to be
  present would make the gate's meaning depend on whether another command was run -- green because
  the counts agree, or green because nobody measured -- so the green line instead names the file it
  read, says it is a snapshot rather than a run, says what the gate does not do, and names the
  command that re-derives it.
- **Handed-in counts are a different comparison and get a different sentence.** `--measured` is how
  the suite drives the guard; no file is opened, and a clause that called it a snapshot would
  describe a read that did not happen. Two constants rather than one string with a hole in it.
- **What is not claimed.** That the snapshot is current. This clause stops a green being misread;
  the step that can refuse a stale snapshot is `measure-doc-counts --check`, which spawns the suite
  and is therefore step 6 of `verify:local` rather than part of `docs:check`.

### A date is not in the future of the round it is quoted in (v3.139)

- **A round cannot record a measurement from a round that has not been written.** `(at v3.200)`
  under `## v3.138` is impossible, and the guard refuses it, naming both tokens (finding 635,
  `O-115`). The corpus's **230** dated rows are the population the rule is written over: **227**
  sit under a round and **3** outside every heading.
- **A dated row outside every heading is compared with the newest round in the corpus.** The index
  file's tables describe the tree rather than a round, and there is no heading to be out of order
  with -- so the newest round that publishes a count is the only token the date can be measured
  against.
- **The pair is compared as two numbers.** `v3.9` is older than `v3.10`, and a string comparison
  would pass the impossible row and refuse the correct record; the predicate that decides it is
  named once, because rule 3c asks it twice.
- **A date is read in one shape, and a row that dates itself any other way is not read.** The marker
  is `(at vX.YY)`; `at v3.54 it was 248 s` inside a claim is prose about a comparison rather than a
  marker on a record, and 27 table rows say it that way.
- **What is not claimed.** That the date is *true*. The corpus holds no independent account of what
  the named round measured -- 227 of the 228 dated rows that carry a count are that round's own
  publication -- so provenance in the snapshot is what would close it (`O-117`).

### A bound is printed with the day its command usually has (v3.140)

- **Two ends of a series do not say what the middle is.** The tightest bound is `2.0x` the slowest
  reading of its command and `1,784 s` above the fastest, and its 31 readings have a median of
  **21 s**: the bound is `86x` the day that command usually has. A reader given the ends alone can
  compute neither, so the middle is printed with the multiple it implies (`O-116`, finding 636).
- **The middle and the ends come from one reader.** `readingsOfCommand` returns the fastest, the
  slowest and the middle of the same set of readings, so the denominator `R10` refuses against and
  the number printed beside it cannot disagree about which readings belong to the command. A probe
  recomputes the median from the same rows and finds **0** of 44 commands inconsistent.
- **An even series prints the interval, and the multiple divides by its midpoint.** `between 20 s and
  21 s` rather than `20.5 s`, because 20.5 is a number no run spent; equal middle readings print as
  one number, because a range from a number to itself is the shape the every-reading-is-the-same
  branch refuses. The clause has three shapes and the shipped tree printed all three inside one
  round: 29 readings (`at 21 s`, `86x`), 30 (`between 20 s and 21 s`, `88x`) and 31 (`at 21 s`,
  `86x`). A branch whose condition is the length of a series is only known to be reachable by taking
  a recording on each side of the boundary, which is what the round did.
- **A middle of 0 s prints no multiple, and says so.** Six of the 44 commands are read at 0 s, and
  `bound / 0` is the `Infinity` the record refuses elsewhere. A clause that stopped at the middle
  would read as a division that came back blank.
- **What is not claimed.** That the middle describes a typical *state* rather than a typical day.
  The series mixes the tree's growth with the runner's variance, and which of the two a median
  measures is `O-114`'s question. Nor that every bound has one: only the tightest bound's command is
  printed, which is `O-118`.

### A noun may leave the vocabulary with a sentence saying when it can be silent (v3.140)

- **A noun a conditional sentence prints enters and leaves with the tree.** `check-ci-budget` prints
  `budget(s)` only in a round that widened a bound, so a round where nothing moved derives a smaller
  vocabulary -- and a writer that deleted the line left the next round to put it back, with nothing
  said in between (`O-112`, finding 637).
- **The repair is a sentence, not a list of permitted nouns.** Nothing derives a list of nouns a gate
  *may* print, and a hand-kept one would need its own reader to stay true. The judgement list carries
  a `silence` sentence per noun instead, saying why a round can print none.
- **Both doors refuse the same state.** A green run refuses a noun that vanished with no sentence;
  `--write` refuses it before writing anything; and a noun coming back with a sentence is reported as
  `printed again` rather than `new`, so the round that answers a question is not asked to answer it
  again.
- **The green line counts what the record keeps.** A noun with a sentence and no line this run is
  named on the summary, because a reader would otherwise see a vocabulary smaller than the document
  with no account of the difference.
- **A silence sentence is held to the figures a relation is held to.** A figure in one must be a
  count a gate printed under that noun, and the refusal names the field, because a noun can carry two
  sentences (finding 638).
- **What is not claimed.** That the sentence is still true. Nothing asks whether the branch has been
  deleted or the gate still exists, which is `O-119`.

### A population of middles is printed as its ends, and the class that has none is counted (v3.141)

- **A figure that follows a superlative moves when an unrelated member moves.** v3.140 printed the
  middle of the tightest bound's command, so which bound had a typical day was decided by which bound
  happened to be tight. The shipped tree separates the two questions: the bound nearest a bad day is
  `backend / Install a backend this repository did not write` at `2.0x` (1800 s over 888 s) and the
  bound nearest a usual day is `batteries-heavy / Backend-support battery` at `2.4x` (900 s over
  382 s) (`O-118`, finding 639).
- **Thirty-six middles in a line of twenty clauses is a table, so the population is printed as its two
  extremes.** The least multiple any bound makes over its own command's middle is printed with the
  bound that makes it, the greatest is printed beside it, and both are an extreme of one set rather
  than a choice. The ends carry different precisions because at `86x` a decimal is noise and at `2.4x`
  it is the difference between two bounds.
- **A bound with no multiple is counted rather than dropped.** Two of the thirty-eight bounds divide by
  a middle of `0 s`, where `bound / 0` is the `Infinity` this record refuses; a range over thirty-six
  bounds that said nothing about the other two would describe a population the line above had already
  counted.
- **A range of one end prints one number.** `from 2.4x to 2.4x` is a range from a number to itself,
  which is the shape the every-reading-is-the-same branch refuses one level down, so the single-end
  branch is written out and the case pins it.
- **What is not claimed.** That a reader who wants one bound's middle is served. The individual
  figures are derivable from `golden-master/ci-readings.json` and printed by nothing, which is `O-120`.

### The history's range carries the floor a second reading of one tree measures (v3.141)

- **A range over thirty-one trees answers two questions at once and separates neither.** `pnpm lint`
  runs a build, so its `221 s` reading measured a smaller suite than today's; the same step also moved
  `141 s` between two runs of one tree (`O-114`, finding 640).
- **The floor is taken, not argued.** Run `45351350110` was re-run and both attempts were recorded: the
  widest difference on any step is **151 s** (`batteries-heavy / Type-miss probe battery`, 356 s ->
  507 s), **28 of the 83 steps came back identical**, the median difference is **1 s**, and the sum of
  the absolute differences is **1,136 s**. The gate prints the widest one, names both attempts, and
  says what it is for.
- **Every pair of one tree is compared, not the neighbouring ones.** With one tree read three times the
  widest difference is between the first and the third, so a rule that compared neighbours would
  answer a question about append order. A step only one of the two readings timed has no difference to
  take.
- **An unmeasured floor is not a floor of zero.** `noiseFloorOf` returns `null` when no two readings
  share a tree, and the sentence then says in words that no tree has been read twice.
- **A duplicated reading is a second measurement of one tree.** It stays in the series `R10` divides by
  and in the middle, because a bound has to survive every measurement of it, and it is printed as the
  floor rather than counted as another tree.
- **A run id is not a measurement.** A re-run is attempt 2 of one run id, so a reading's identity is
  `(run, attempt)`: the reader refuses one attempt twice and refuses an attempt that is not a positive
  integer, the merge replaces one attempt and keeps the other, `R10`'s two directions compare the pair,
  and the recorder takes `--attempt <n>` and asks the API for `filter=all` only for that call. An
  absent `attempt` is `1`, which is what every recording written before the field was, so the thirty-one
  readings already in the file are unchanged (finding 641).
- **What is not claimed.** That one pair says what the machine does. `151 s` is one afternoon, and
  every bound in the workflow is still sized without it, which is `O-121`. Nor that the recorder
  prevents an attempt older than the recording from being written, which is `O-122`.

### A round's span ends where that round's own count ends (v3.142)

- **A round states its own size twice, and both statements are read.** The three suite rows say what
  the suite holds; the `new tests` row's span (`6,921 -> 6,946, +25`) says what it held before and
  after. The second was outside every rule, because it matches none of the count shapes and its label
  names no scope. It is the only place a round's own count appears twice, which is what makes a date
  checkable (finding 642).
- **The population is measured, and so is the disagreement.** **105** `new tests` rows, **74** spans,
  **67** of them stating a delta -- and all 67 hold, which is the expected result and still worth a
  reader, since a delta typed by hand is a subtraction somebody did in their head. **71** spans end
  where the round's own count ends (**70** in `core`, **1** in `repo`), **2** count one file, **31**
  publish no before-count, and **1** sits under no round.
- **The word "own" is the rule.** A round's section quotes other rounds' rows as records, so only two
  spellings count as this round's: `(as of this commit)` under it, and `(at vN)` where N is the round
  it sits under. A row that says neither is a number quoted from somewhere, and taking it as the
  round's own would let a copied record decide whether the round's span is true.
- **A span with a test file named before it is that file's, and it is counted not read.** `(18 -> 30)`
  beside `site-proofs.test.ts` counts that file; the position is what separates it, because a row
  describing its delta names test files all the time and those come after the span.
- **A shape the reader does not know is refused, not passed.** An arrow it cannot read as a span is
  rule 4's defect one unit over: a row written in an unknown shape is indistinguishable from a row
  with no count, and the arrow is the evidence that a span was meant.
- **What is not claimed.** That a span says which suite it is about: 70 of 72 are `core` and one is
  `repo`, and the corpus states it nowhere, which is `O-123`. Nor that a delta with no before-count
  can be checked, which is `O-124`; nor that the rule can say which of two contradicting numbers is
  the record, which is `O-125`.

### A mark has one reader, whichever way it is spelled (v3.142)

- **A date written as code is the same statement rendered.** volume-17 writes ``(at `v3.102`)``
  fifteen times across five rounds, and a pattern demanding the plain spelling read those rows as
  undated: rule 3c could not refuse a future date among them, and the round's own count could not be
  recognised, so five spans had nothing to compare with (finding 644).
- **One pattern with optional backticks, not a second pattern.** A second pattern is a second reader
  of one mark, and two readers of one mark is how this round's first defect -- a shape nobody had
  thought of as a count -- came about.
- **The measurement says the widening worked.** Spans with no count to compare against fell from
  **6** to **1**, and the one that remains sits under no round at all; the five that arrived end where
  their rounds say.

### A bound's headroom is measured in the movement one tree has already shown (v3.143)

- **A multiple of two is a claim about the tree, and the machine is a second term.** `R10` demands
  twice the slowest day. Two readings of one tree differ by up to **151 s** and by **42%** on `lint`,
  so the multiple is partly a statement about the runner -- and the quantity that separates the two is
  the headroom expressed in the movement the step itself has shown, not in seconds.
- **The refusal is impossible, and the code says so.** Both readings of the pair are readings of one
  command, so `movement = |a - b| <= max(a, b) <= slowest`; `bound >= 2 x slowest` therefore makes
  `headroom >= slowest >= movement`. A rule refusing a headroom narrower than the movement could
  never fire on a tree whose bounds `R10` holds, so none was added -- a rule that refuses nothing is
  the shape every reader learns to skip (finding 645).
- **The population is measured, and so is what it cannot divide.** **38** bounds carry their own
  timeout, **38** have a second reading of their own tree, **8** did not move at all, **0** have no
  movement to measure. The narrowest margin is `sensitivity / Install the shells the suite
  cross-checks against`, **222 s** above its slowest day against **99 s** of movement -- `2.2x`; the
  widest is the same command in `backend`, **912 s** against **4 s**.
- **The sentence no longer calls the difference variance.** The two steps that move most are the two
  installs, **9.9x** (109 s then 10 s) and **1.6x** (23 s then 9 s), which is a package store hit
  against a miss -- the tree's state and not the runner's speed -- and six steps came back identical.
  It says "the runner's variance and the cache's state together", which is what the pair measures.
- **One pair is a floor, not an estimate.** The second half of `O-121` is answered no: the figure is
  printed as the widest difference one pair has shown, with the pair named, and it rises the first
  time a second tree is read twice.
- **Not claimed.** That a bound sized in one mode of a bimodal step covers the other, which is
  `O-126`; and that any of the 38 bounds is near its own noise -- the narrowest has two movements to
  spare.

### A reading is named by its run and its attempt (v3.143)

- **A run id stopped naming one measurement at `v3.141`.** A re-run keeps the run id and increments
  `run_attempt`, so `run 100` is two measurements and a reader who opens it sees the latest. Six
  sentences printed the run: `R10`'s refusal, the tightest multiple, the widest headroom, the
  ceiling's slowest day, and the prefix allowance in both directions (finding 646).
- **The defect has four shapes.** A run printed where a reading belongs; a reader that builds the
  coordinate and drops the field (`readingsOfCommand`); a caller that rebuilds the object from two of
  its fields (the headroom's `fast`); and a tie rule that orders by half the coordinate (`jobDays`,
  `worstPrefixReading`), which leaves two equal days of one run with no order at all.
- **One function prints it.** `run N` for attempt 1, because that is what every reading written
  before the field existed was, and `run N attempt M` otherwise; the readers carry `attempt` in what
  they return, and every tie is decided by the whole pair.
- **The guard against noise is a case of its own.** 31 of the 35 rows in the history have no attempt
  at all, so a coordinate that always printed `attempt 1` would make the reader learn a word that
  means nothing; the case asserts `run 100:` and no `attempt 1`.
- **Not claimed.** That the defect is visible in today's output: the slowest reading of the only
  pair is attempt 2 of run `45351350110` (507 s) under a bound of 1080 s, so no sentence prints it.
  A latent defect is repaired where it is latent, not where a reading happens to fall.

### A measurement is written where it is the newest one (v3.144)

- **"Older" is a pair, because a re-run keeps the run id.** `--attempt 1` after `--attempt 2` was
  accepted, and it wrote a recording the history's tail is newer than: `R10` then refused the tree
  the recorder had just written, in a sentence naming the act the recorder had just been asked to take
  (finding 647).
- **A recording may only move forward, and that is arithmetic rather than policy.** `R10` compares the
  recording with the history's **tail**, which is a maximum over the file, so no write of
  `ci-baseline.json` alone can move it; the only way to remove a row is the hand edit both files
  refuse in the same words. An older attempt therefore cannot be the recording while the newer one is
  in the history.
- **The seconds are kept as a seed instead.** `--seed --attempt 1` of the recorded run appends the
  measurement to the history, where `R10`'s denominator reads it, and leaves the recording on the
  newest measurement of the tree. That pair is the one every bound's margin is measured against, and
  the history already held one: run `45351350110`, attempts 1 and 2, **356 s** then **507 s** on
  `batteries-heavy / Type-miss probe battery`.
- **A file that cannot say which day is the newest is not replaced.** Two shapes are refused -- a
  recording that does not parse, and one that parses into something naming no run -- each with the act
  that fixes it. The history beside it was already left alone and reported; the two files now behave
  alike.
- **One ordering, one name.** `orderOf` answers the two sorts, `R10` and the recorder's three
  refusals; `coordinateOf` prints the recorder's two report lines as well, so a recording of attempt 2
  says `from run … attempt 2` rather than `from run …`.
- **Not claimed.** That the recorder can withdraw a measurement: a red attempt recorded by mistake is
  replaced only by a newer one, and a step that expired spends exactly its bound, which makes `R4`
  demand the bound be doubled by the run that failed inside it -- `O-127`.

### Only a number the run measured is a reading (v3.145)

- **`R4`'s multiple needs a duration, and three shapes in the report are not one.** A step killed at
  its own `timeout-minutes` reports exactly that bound, so `R4` compared the bound with itself and
  advised doubling it -- which turns a hang into slack. A step stopped early reports a lower bound, and
  a step after a failure never ran at all (finding 648).
- **The recording is taken only from a run that succeeded.** A green run is one in which every step
  that ran succeeded, because GitHub computes the conclusion from the steps, so the recorder does not
  ask each step -- that branch could not fire. A red run's numbers may include a kill the report calls
  `failure`, indistinguishable from a genuine failure, and its later steps never started.
- **A seed is a day, not a description, so a red day is appended with the numbers that finished.**
  `failure` is kept -- a command that ran and returned non-zero spent that long -- and `cancelled`,
  `skipped` and a step whose report names no conclusion are dropped and named in the report, because
  "cannot say it finished" may not be read as "did". `R10`'s denominator is the worst day rather than
  the greenest one, which is the whole reason the two relations differ.
- **A number equal to its own bound is the bound read back.** A step that ends on its own ends *before*
  its bound, because the bound is when the runner kills it; the two shapes that produce the equality --
  a kill whose failure was allowed to pass, and a step finishing inside the last second of its
  allowance -- are one number apart in the report, so the recorder refuses with the act that fixes it
  (raise the bound by a minute so the number has room to move, or fix what hung).
- **The rule is not `>=`, and a borrowed number is not held to the target's bound.** A number above
  today's bound is a run measured before the bound was tightened, and the act that follows is `R4`'s;
  a borrow copies seconds from another job, whose kill -- or not -- happened under its own bound.
- **Not claimed.** That a red seed's kill can be told from a genuine failure: the report calls both
  `failure`, so a seed may append the bound that was in force that day -- `O-128`, whose route is
  reading `ci.yml` at the seed's commit.
- **Falsified by** 12 mutations, 17 reds, no survivor, measured on the green tree.

### A red day's number is read against the bound it enforced (v3.146)

- **`failure` is two shapes, and `R10` may divide by only one.** A command that ran to its end and returned
  non-zero spent a duration; a step the runner stopped at its own `timeout-minutes` spent that bound, and
  `R10`'s multiple would then ask for a bound twice the number the run was killed by. The report carries the
  same conclusion for both and no field separates them (finding 649).
- **The arithmetic of `O-127` needs the bound the runner was enforcing.** *A step that ends on its own ends
  before its bound, so a number at it is that bound* is an argument about **that day's** number. A seed's day
  is not today: `ci.yml` states today's bound, and widening or tightening a bound between the two days is the
  ordinary history of every bound in this file.
- **So a red seed costs one request, and the recorder reads that day's file.** `GET
  /contents/.github/workflows/ci.yml?ref=<head_sha>`, walked by the same line reader the gate uses on
  today's, and each `failure` step held to the bound the file states for it.
- **Three answers, and the third is a refusal rather than a guess.** At or above that day's bound: the
  number is the bound, and the step is dropped with a line naming `N` and *that day*. No bound of its own
  that day: the step is kept, because a job timeout **cancels** the running step and a cancelled step is
  already dropped -- no step bound can have stopped this one. A file that cannot be read, or a job that day
  does not have: the question is open, so the **seed is refused** rather than appended with a day whose slow
  steps are missing.
- **Keeping only `success` steps was refused, and it is the same argument.** A seed exists to keep a red
  day's numbers, because `R10`'s denominator is the worst day rather than the greenest one; dropping red
  days would delete the evidence the rule was written for, and would do it silently.
- **The request is made only where the question exists.** A green run holds no `failure` step, because
  GitHub computes a run's conclusion from its steps, so a seed of a green day costs what it always did. The
  price lands on the red days -- which are the days the rule is for.
- **The mirror image was reachable and is repaired.** `O-127`'s equality check held **seeds** to **today's**
  bound, and refused 720 s of a step today's workflow bounds at 12 minutes even when that day allowed 30.
  The check is the recording's alone now; a seed's version is the comparison above. Two relations, two
  bounds, one arithmetic.
- **Not claimed.** That a day whose `ci.yml` this reader cannot walk can be appended at all: it is refused as
  a whole, and the alternative -- a permissive second reader for that day -- would be a bound decided by a
  rule no gate enforces (`O-130`).
- **Falsified by** 10 mutations, 30 reds, no survivor, measured on the green tree.

### A reading is a number beside the command that spent it (v3.147)

- **`R10` divides a bound by the slowest reading of the command it bounds, so a reading is a pair.** The
  history stores the command with every number for exactly this reason, and the gate never reads it -- it only
  divides. The pair's correctness therefore rests on the recorder alone (finding 650).
- **Both paths took the two halves from different trees.** A seed took the number from that day's report and
  the command from **today's** `ci.yml`, by step **name**; a recording took the numbers from a run and the
  commands from **whatever was on disk**, never compared with the run's commit. A name is a label, and a label
  survives a change of the line under it.
- **The shipped history proves it rather than a hypothetical day.** Of **3,134** step rows, **3,132** carried
  the command their own commit's file states and **2** did not: runs `42131836805` and `42142175689` recorded
  the **unsharded** battery's 626 s and 633 s under `--shard 1/2`, giving shard 1 a slowest day of 633 s where
  the slowest day a shard 1 spent is 519 s. Both are corrected, and the file now reads **3,217 of 3,217** --
  the thirty-ninth reading brought its own 83 rows, all of them from the tree that ran.
- **One document, read at the run's commit, answers both questions.** `workflowOfThatDay` replaces a fetch that
  returned only bounds and was made only for a seed holding a stopped step; it is made for **every** seed and
  **every** recording.
- **A seed's step is asked three questions in order.** Placement (does that day's workflow have this job and
  this step name), command (does that name run the same command), bound (did that day's own bound stop a
  `failure`). The order is the rule: a number and a bound belonging to another command are not a pair to
  compare at all. A step that fails placement or the command is dropped with a line naming which fact it is.
- **A recording's disk is held to the tree that ran, in both directions.** A step the two trees have under two
  commands, a step only one of them has, and a job only the run has are all the same mistake -- the tree is
  not *at* the commit -- and all three refuse the recording before either file is written.
- **A `--borrow` is not drift.** The borrowed job exists only on disk by construction, and its seconds are
  another job's measurement of the same commands, which the entry states in `derived`.
- **The cost is two requests a round.** `v3.146` priced the request at the days holding a stopped step, which
  was the price of the bound question; the attribution question is asked of every step, so every seed pays it.
  A recording pays it once a round, against a run that costs ten minutes.
- **Not claimed at v3.147, and claimed from v3.148.** That a step with no `run:` can be told from the
  same step after its action's version changed: at v3.147 its identity in this file was its name
  (`step:<name>`), so a version bump was invisible to the comparison (`O-132`, closed at v3.148).
- **Falsified by** 10 mutations, 29 reds, no survivor, measured on the green tree.

### An action is identified by the action, not by the name of the step that uses it (v3.148)

- **`commandOf` decides which series `R10` divides by, and for a `uses:` step it named the step.** A step
  with a `run:` was keyed by its command from the beginning; a step with a `uses:` was keyed by
  `step:<name>`, so `actions/checkout@v3` and `actions/checkout@v4` -- two programs, one of which has
  replaced the other on every runner in the world at some point -- were one command. Two consequences, and
  the second is the one nobody would have noticed: an upgrade moved the program without moving the identity,
  and a **rename** lost the series, which is losing the slow day a bound is sized from.
- **The identity is `uses:<action@reference>`.** The version is which program ran; the name is a label, and a
  label survives a change of the line under it. The prefix rule now compares this identity too: its own
  docstring has said "name and command both" since it was written, while comparing the name and an empty
  string for every action step -- the one kind of step a workflow writes most often.
- **The shipped history is the evidence, and it says the defect was latent.** 994 of the history's 3,300
  rows named a step, across 40 readings on 39 trees, and the workflow at each row's own commit says every
  one of them ran the action today's tree states: **994 of 994**, so no reading in this repository was ever
  spent by another version. It is the shape `v3.146` met with `failure` steps and it is repaired for the
  same reason -- a rule that is right only because nothing has moved is a rule nobody has seen work.
- **The repair is a derivation, not a rewrite from memory.** `--relabel-actions` reads each row's own commit,
  rewrites only the rows whose stored command is a step name over a step the commit runs as an action, and
  refuses a row that contradicts its commit in either direction (another action, or a name where the commit
  runs a command). Measured on the shipped file: **994 of 3,300 rows rewritten, 39 trees read**; run again,
  **0 of 3,300**, byte for byte identical, which is what makes it safe to run against a file in git.
- **No bound moved, and that is the claim rather than a coincidence.** The action steps in this workflow are
  the prefix, `R14` forbids a prefix step a bound of its own, and no other `uses:` step carries one -- so
  `R10` divides by no action's series today, and the gate's whole summary is unchanged to the second: the
  same 36 bounds, the same multiples, the same middles. The identity is now true, which is the difference
  between a rule that works and a rule that is followed.
- **The recorder holds the tree on disk to the action version as well.** A run at a commit whose step used
  `actions/checkout@v3`, recorded against a tree at `@v4`, is drift: the step kept its name, its position and
  its inputs, so nothing else in this repository could have seen the difference.
- **Not claimed.** That an action's `with:` block is part of the identity: it is not, and the shipped
  workflow holds the pair this leaves pooled -- `backend / Check out` clones shallow and the other seven
  clone the full history, one series. The choice errs in `R10`'s direction, since pooling makes the
  denominator the slower of the two shapes. Nor is a local action (`uses: ./x`) separable from a change to
  its code: the workflow names a path and does not say what is behind it. Nothing here uses one.
- **Falsified by** 10 mutations, 32 reds, no survivor, measured on the green tree; and, for the seven new
  claims in the inventory (one exit, six throws; the exit is where the mode's clause lives), 7 mutant runs
  of which every one is credited -- 1 exit hollowed, 6 throws removed, 0 survivors.
