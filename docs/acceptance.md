# Acceptance plan and criteria

"Usable and 100% compliant" is a **provable** claim, not a marketing claim. The
acceptance model is a pyramid of six layers; each layer is a gate that must pass
before the layer above it is meaningful.

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
  credited with catching anything. Measured at **220 of 220** claim(s) across 61 file(s).
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
  the whole history`. Three cases hold the three shapes: **zero** reads when a local tip already sits
  at the optimum, **one** when a twin supplies it, **all** when none can.
- **What is not claimed.** Requests are still linear in the number of twin tips in the worst case. The
  round removed the wasted reads and reported the rest; it did not remove the worst case, and a
  repository with a hundred renamed branches is still a hundred reads when none of them is the parent.

### The two sentences in one entry (v3.63)

- **A bullet's headline and its own reason have to agree about whether it is closed.** A closed
  entry may not carry an unstruck `[open: ...]` -- history in the headline, work in the body -- and an
  open entry's reason may not be struck through. Both directions are refused by `check-open-list.mjs`,
  and the two use **one** reading of the reason (the last marker), so they cannot drift apart on which
  sentence is the entry's own.
- **The shape is not new.** Round v2.44 writes it: a struck headline, a struck reason, the closure
  after them. The two entries this round found used half of it, and half is what a rule keyed on one
  sentence cannot read -- the guard counted them as work while the entry's own last sentence named the
  finding that closed it.
- **What is not claimed.** The count and the rule share a source: `N open` is computed from the
  verdicts the guard takes, so a guard that is wrong about an entry produces a count that is wrong
  about the same entry, and the two agree. v3.63 is the demonstration -- the stamp said 13, the guard
  said 13, the file said 11 -- and the only thing that could disagree with both was a reader.

### A record's spelling (v3.63)

- **Three headings are read, and every other spelling beginning with either name is refused.**
  `## Open` is the live list read as entries; `### Left open` is a record read as entries;
  `### Left open, <suffix>` is a record read as **rows**. Anything else beginning `## Open` or
  `### Left open` is a red build, because a document that renames a list must not be able to move it
  out of its reader's reach in silence -- which is what happened at v3.45, when the record's heading
  gained a comma and nineteen records stopped being read (finding 463).
- **A table-form record is counted and declared unjudged.** Every summary line states how many such
  records were read and how many rows they hold, and says the rows were not judged. A table-form
  record that holds no table, or that carries an entry, is refused: zero rows would let an empty
  record pass as a record, and an entry under a heading the guard reads as rows would have no judge.
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
  which is the check that would have caught 185 on the day it was printed.
- **What is not claimed.** The `state` column is not judged: 78 distinct values over 147 rows, a median
  of 75 characters. That is a reading, not a state, and a vocabulary for it would mean rewriting
  nineteen frozen records. Capturing a column is not judging a value.

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
  than that, and quotes the cell it found. The row is what a later reader looks for when asking what a
  round cost; v3.66 answered it only after measuring its own two new arms at six uncovered branches.
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
