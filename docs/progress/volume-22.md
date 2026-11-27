## v3.151 — a bound covers the state the command was read in

`v3.150` shipped a rule and three documents that called a bound unsafe, and the rule agreed with neither of them.
`R14` divided a tree's **faster** attempt; the sites battery's second shard had been read at 621 s and at 900 s;
a 22-minute bound is 1320 s, which is above twice 621 s (1242) and above the 900 s day itself, so **both** of
`R14`'s clauses passed it. The round's prose said 22 minutes was unsafe. The gate returned an empty list of
errors, and nothing in the tree could see the two disagree.

That is finding 654, and this round is the measurement it took plus the rule it forced: a bound divides the
worst day the command has spent, and the attempts of that day's own tree travel beside the number as evidence
rather than as a second candidate for it (`R16`).

### The falsifier, which is one assertion in one test

The claim "the gate accepted it" is checkable, so it was checked first. A workflow with one bounded step at 22
minutes, a recording of that step at 621 s, and a history holding 621 s and 900 s on one tree: under `R14` the
error list is `[]`, and under `R16` it is one refusal naming the 900 s day. The test is the falsifier, and it was
run against a reconstructed `R14` before the rule changed -- `expected '' to contain 'is bounded at 22 min'`,
which is the defect stated as an assertion rather than as a paragraph.

The reconstruction is four lines: `readingsOfCommand` reporting the worst tree's **cheapest** attempt instead of
its worst day. Nothing else about the measurement changes.

### What the history holds, read at the commit rather than at the round

`v3.150` read the step's series as two modes and, in the same round, took 621 s and 900 s for two states of one
tree. Both readings are in the file, and their commits are not the same one:

| tree | readings | seconds | sites at that commit |
| --- | --- | --- | --- |
| `36a299c8` | 1 | 635 | 146 |
| `3d69ada9` | 1 | 636 | 146 |
| `91806080` | 1 | 600 | 146 |
| `87d78d97` | 2 | 881, 880 | 146 |
| `b3124638` | 1 | 621 | 146 |
| `8fb87bcb` | 1 | 900 | 146 |
| `90303700` | 1 | 885 | 146 |

Seven trees of one afternoon, and **146 sites at every one of them** -- read from `golden-master/gate-sites.json`
at each commit through the API, not remembered from a round. The shard runs one test file per claim, so an
identical site list is an identical workload, and the 50% between 600 and 900 is not the suite's growth.

The other jobs of those runs say it is not a slow box either: the 900 s run reads **482 s** in the first shard
and **728 s** in `verify`, inside the 378--505 s and 537--769 s the same seven runs span.

The eighth measurement is the one this round took, and it is the tree `v3.150` shipped (`90303700`, run
`45626206585`): **885 s** in the second shard, **480 s** in the first and **518 s** in `verify`. So the slow
state is not two trees but four, and the bound's 1800 s is 2.03x the day the recording now holds.

And the one tree measured twice read **881 s** and **880 s** -- one second apart, forty minutes apart. So a tree
repeats its own state, and `R14`'s own evidence was the wrong half of its argument: two attempts of one commit
*cannot* differ by the tree, which is true, and *so the tree costs the fast one*, which does not follow. A state
a legitimate run lands in is part of what the command costs, and a bound sized from the fast state refuses the
slow one.

### `R16`: one clause where two were doing one job

| rule | the number a bound divides | the pair |
| --- | --- | --- |
| `R4` at `v3.150` | what the recording's tree costs, as its faster attempt | printed |
| `R10` at `v3.150` | twice the slowest tree's faster attempt, **and** the worst day already spent | printed |
| `R4`/`R10` at `v3.151` | **the worst day the command has spent** | printed |

The floor clause is gone as a clause because its subject became the multiple's: a rule that needs a second
clause to cover a day the first one was sized past is one rule that was reading the wrong number. What survives
of `R14` is the pair -- for the number, not instead of it -- on the reading that carries the worst day, and in
both sentences that print it.

Three sentences changed with the arithmetic, and each is a claim a reader can check:

- `R4`: "the tree spent 400 s on it (the same tree read 881 s on its other attempt): the bound is under 2 times
  what the command costs on that tree";
- `R10`: "spent 900 s on its worst day, in `sites / ...` in run 45595594712 attempt 2 (the same tree read 621 s
  on its other attempt)";
- the summary: "2.0x of the worst day its command has spent (540 s in ...)" beside "; the same tree was read
  again at 880 s (run 45595594712 attempt 1), 1 s apart".

### What the rule does to this tree: nothing moves

All 38 bounded work steps were replayed under both rules against the 44 readings, and **0 change verdict**:

| step | bound | worst day | the multiple | `R14` would divide |
| --- | --- | --- | --- | --- |
| `sensitivity-shard / ... (shard 2 of 2)` | 1800 s | 900 s | 2.0x | 900 s |
| `sensitivity / ...` | 1800 s | 519 s | 3.5x | 519 s |
| `backend / Install a backend ...` | 1800 s | 888 s | 2.03x | 888 s |
| `verify / Lint ...` | 1080 s | 540 s | 2.0x | 540 s |

That is not a coincidence and it is the round's other reading: the two rules agree **wherever no tree has been
read in two states**, which is everywhere in this history -- the one tree read twice read 881 s and 880 s. So the
change costs no bound, and what it buys is the case that has not happened yet: a tree read in both states would
have had its bound divided by the cheaper one.

### The sentence `O-139` asked for

`O-139` asked which mode a bound is argued from, and said a reader comparing 22 minutes with 621 s cannot know
that 900 s is what makes 22 unsafe. The rule now refuses 22 minutes, so the first half is answered by the verdict.
The second half is a sentence, because a reader of a green run has no refusal to read:

> ...across the history that command runs from 221 s to 540 s, with the middle of its 44 readings between 404 s and
> 411 s -- against which the bound is 3x; **two readings of one tree timed that step 141 s apart, 44% of the 319 s
> between its ends**...

For the sites battery the same clause reads `1 s apart, 0% of the 615 s between its ends` -- the widest
difference two readings of one tree have shown, as a share of the range it is being compared with. A share and
not an adjective: whether the rest of the range is growth or a state is not separable by arithmetic on the file,
and the sentence does not pretend to know. Three states, three sentences, and a step no tree has been read twice
on says *that* rather than printing a difference of zero it never measured.

### Its own defects

- **The numbers in the new test file's docblock will rot.** Six trees, six site counts, one pair -- copied from
  the history into a comment, which is finding 202's shape. The corpus dates such tables; a test file has no
  gate that reads one.
- **Two clauses name two different pairs, and the sentence does not say so.** `replicatedText` compares the
  attempts of the worst reading's tree; `movementText` reads `noiseOfSteps`, which is keyed by job **and** step.
  For a command that runs in five jobs -- `Install the shells` -- the two can be different readings of one tree,
  and one sentence prints both.
- **`R14` is retired and its volume is not annotated.** `volume-20` still carries the section that argued for it,
  in the present tense, and a reader who stops there has the old rule. The audit entry is the only pointer, and
  the log's convention is that a round is not rewritten.
- **The delta is measured by a script that is not committed.** "0 of 38 bounds move" came from a replay against a
  reconstruction of `R14`; the gate asserts the new rule and cannot assert the difference between the two.

### Not claimed

That the state is the **machine's**. The evidence is that the content is identical (146 sites) and that one tree
repeats itself to a second; nothing here reads the box, and the instrument that would -- a load average, a cgroup
throttling counter, the runner's own timestamps -- lives in the job log, which this sandbox cannot reach
(`O-141`).

Nor that the step has **two modes**. Seven readings on one afternoon are two clusters here because they are 40%
apart with nothing in between; a wide spread would look the same at this sample size, and the rule does not need
the shape -- only that a run can land in a state the bound must cover.

Nor that 900 s is the ceiling on that state: the fourth slow reading is 885 s, and nothing in the file says the
state cannot be slower.

### Readings

> Ledger for `v3.151`.

| item | value |
| --- | --- |
| CI | run `45626206585` on `90303700` -- the tree `v3.150` shipped: **8 of 8 jobs success**, 980 s, and the **forty-fifth reading** (885 s of second shard, 480 s of first); it is this round's recording, because the round before left the recording one run behind |
| `pnpm run docs:check` | **23 steps, exit 0** |
| `core` test suite | **260 files, 7052 tests passed** (at v3.151) |
| `cli` test suite | **4 files, 187 tests passed** (at v3.151) |
| repo test suite | **264 files, 7239 tests passed** (at v3.151) |
| the history | **45** readings over **43** commits, after the forty-fifth was recorded and the reading before it left untouched |
| new tests | **7,050 -> 7,052, +2**: twelve on the rule in place of ten (the falsifier at 22 minutes, a recording that landed in the fast state, the worst day of a tree with its attempts, one attempt's two jobs, the worst state over every tree, the pair beside the multiple, the pair in the refusal, the lookup, the control, and the three states of the range's share) less eight that asserted `R14`'s arithmetic |; and this half of the round adds four: the cost reader against a plain summary, against the runner's colourised one (the same number), against escapes wrapped the other way round, and against a transcript that must read `null` rather than `0` |
| coverage | core **99.98 / 99.95 / 100 / 99.98**, cli **100 / 100 / 100 / 100** -- unchanged: every line this round added is in `scripts/` |
| mutation | **12 groups, 54 red cases, 0 survivors**, each measured on the green tree and restored byte for byte |
| the rule's own falsifier | the 22-minute case returns `[]` under a reconstructed `R14` and one refusal under `R16` |
| the delta | **0 of 38** bounded steps change verdict; the worst day and `R14`'s faster attempt are the same reading in every one of them |

### Left open

`O-126`, `O-133`, `O-136`, `O-137`, `O-108` and `O-134` are unchanged. `O-139` is closed by finding 654, `O-138`
and `O-126` with it -- the first two because the rule no longer divides a tree's best attempt, the third because
the multiple now takes the worst mode by construction rather than per mode by declaration. Two entries come out
of the round:

- `O-140` · **The margin clause reports the workflow's narrowest bound, not the bounds whose own movement is
  more than half their reading.** Two of the 38 rest on a step that moved by more than half its own reading --
  `sites`' second shard among them -- and a reader who wanted the list has to assemble it from 38 sentences that
  are not printed.
  `[open: whether `budgetSummary` should print the count of bounds whose movement exceeds half their denominator,
  with the widest one named -- a number that is a share of the bound rather than of the range -- or whether the
  share printed for the tightest step is the whole of what a reader needs]`
- `O-141` · **A reading records no evidence of the machine's state, so the state is inferred from the series.**
  The sites battery's 600 s and 900 s readings are 146 identical sites apart, and the only statement the file can
  make about them is that one tree repeated itself to a second. The instrument that would say what the box was
  doing -- `/proc/loadavg`, the cgroup's throttling counters, the runner's own timestamps -- is printed by the job
  and reachable only through the job log, which this sandbox cannot fetch: the logs endpoint redirects to a blob
  host that resolves to `198.18.0.16` here.
  `[open: whether a measured step should print a machine line beside its own output, so the recorder can attach
  the box's state to the reading -- a step that measures the runner rather than the program, and one whose
  absence has to read as *not measured* rather than as a quiet machine -- or whether the pair and the site count
  are the whole of what a reader can be given from a file this repository can read]`

## v3.152 — the mode that judges refuses the tree the mode that repairs refuses

`v3.151` shipped and CI came back **four jobs red out of eight** (run `45643248364`; the anchor round trip
beside it, `45643248351`, green). One line, printed by four different steps:

```
  - ## Repository says '680' for Tracked files; the tree says '681'
check-repository-table: FAILED
```

The local gate had exited 0 on the same file minutes earlier, on the same bytes. The difference is one
untracked path: `docs/progress/volume-21.md` was written and not yet staged, so `git ls-files` held 680
entries and the document's `680` was true of the index. `git add -A` moved the index to 681, the same
command refused the same table, and the push carried a tree where the guard is right -- because a checkout
has no untracked files at all.

### The defect, stated as two populations

`check-repository-table` derives eight rows from two different places:

| row | read from | sees an unstaged file? |
| --- | --- | --- |
| `Tracked files` | `git ls-files` -- the **index** | no |
| `Source files`, `Source lines` | `readdirSync` over `packages/*/src` -- the **worktree** | yes |
| `Test files`, `Test lines` | `readdirSync` over `packages/*/test` | yes |
| `Tests` | `golden-master/doc-counts.json`, measured by a run | yes, one step later |
| `Commits`, `Packages` | `git rev-list`, `git ls-files` | no |

With one untracked file present the table is not stale, it is **about two trees**: one row counts the index
and five count the filesystem, and the arithmetic has no reason to agree. The guard knew this -- it wrote the
refusal in `v3.83`, after a round published `Tracked files 638` before `git add` and the next check read
`639` -- and put the refusal **inside `if (writing)`**, the branch only the repairing mode takes. So the mode
that publishes refused, and the mode that judges could not see the state the publication had been made in.

### The falsifier

Executed, not argued. A fixture tree committed and otherwise green, then one untracked `notes.md`:

```js
const fixture = makeTree('check-untracked');
withTable(fixture, defaultTable(fixture.rev));
expect(run(fixture).status).toBe(0);          // the table is right about the index

writeFileSync(join(fixture.root, 'notes.md'), 'A file the round has not staged yet.\n');
const rejected = run(fixture);
expect(rejected.status).toBe(1);              // v3.151: 0, and that is the bug
```

Under `v3.151` that third line reads `0`: the guard compares `8` against `8` and reports eight rows derived
from "the tree". Under `v3.152` it refuses and names the file, the rows, and the way out:

```
  - 1 file(s) exist and are not tracked (first: notes.md), so `Tracked files` would count the index and
    `Source files` and `Test files` count the worktree, which is one table describing two trees; stage them
    first (`git add -A`) or remove them
check-repository-table: FAILED
```

The second half is the boundary from the other side, because a refusal that persisted after staging would be
a guard nobody can satisfy and a refusal that went quiet would be the original defect with an extra step:
`git add -A`, then the same command, and the message **changes kind** -- refusal, then drift --
`says '8' for Tracked files; the tree says '9'`. `--write` then publishes 9 and the table is green again.

### What the round did to the documents' claims

| claim | before | after | why |
| --- | --- | --- | --- |
| failure sites in the inventory | 146 | **146** | the refusal moved out of one branch into two modes; the site at line 466 is the site at 483 |
| claims covered by `verify-site-proofs` | 248 | **248** | unchanged: the file that drives this guard is the same file |
| `core` tests | 7,052 | **7,054** | two fixtures for the two sides of the boundary |
| `core` test lines | 120,747 | **120,796** | the two fixtures and their comments |
| `Tracked files` | 680 | **681** | `docs/progress/volume-21.md`, the file whose staging started this |
| `Packages`, `Source files`, `Source lines`, `Test files` | -- | unchanged | no source or test file was added |

`golden-master/gate-sites.json` was re-derived rather than hand-edited, and its only diff is that one line
number -- which is the useful reading: **moving a guard's refusal between modes does not create a site**. The
site existed and was proved; what changed is which state reaches it.

### The four red jobs, and what each was reading

The same sentence appears in four steps because four steps read the table:

| job | step | why the number reached it |
| --- | --- | --- |
| `golden master / official metric / examples / documents` | 11, documentation guards | the guard is a step of `docs:check` |
| `cold tree / no build / every precondition declared` | 7, documentation guards that read no build artefact | the same step, run in a job that proves it needs no build |
| `build / typecheck / lint / coverage / mutation` | 9, lint | `verify-site-proofs` runs the test file that drives this guard, and a proof whose baseline is red proves nothing |
| `every proved exit can disappear without a word (shard 2 of 2)` | 8, the battery | same reason, from the sensitivity side: the whole file is the claim's witness |

That table is an inference from the steps' names and from what each one spawns, because the job logs are not
reachable from here -- the logs endpoint redirects to a blob host that resolves to `198.18.0.16` (finding
655's limit, unchanged, `O-141`). The evidence that the inference is right is that all four commands exit 0
on this tree after the number was repaired, and the round's own CI run is the confirmation rather than the
argument.

### Four things this round did wrong, written down

- **The gate was run on a tree that was not the tree the commit carried.** This is the process defect the
  code defect is a symptom of: `docs:check` exited 0 on a worktree holding an unstaged file, and the round
  read that as "the tree is green". Running the gate after `git add -A` would have caught it before the push,
  and nothing in the corpus said so.
- **The guard's own prose claimed the refusal it did not have.** The docblock's "What is not checked" section
  did not mention the index/worktree split at all, and the fixture comment in the test file said "the guard
  now refuses to derive over an untracked file" -- true of `--write`, false of the mode the corpus runs. This
  is finding 654's shape exactly, one round later: a rule and the sentence describing it, drifting apart in
  the direction that flatters the rule.
- **The first repair was in the wrong place.** `v3.83`'s refusal was written where the failure had been seen
  -- inside the rewrite -- and the round that followed it tested the rewrite. A refusal is a property of the
  *measurement*, not of the mode that stores it.
- **The counts were repaired before they were understood.** The first attempt set `Tests` to 7,054 in
  `docs/progress.md` alone, which the guard refused in the other direction (`the tree says '7,052'`): the row
  is cut from the snapshot, and the snapshot is cut from a run. The order that works is snapshot, then
  document, then gate -- and it is written here because the next round will meet it again.

### Not claimed

That `docs:check` cannot go green on a dirty tree. It can, and should: uncommitted *edits* to tracked files
are measured by the rows and refuse themselves through the numbers, which is the behaviour the docblock
describes. The refusal here is narrower -- a path that is **not in the index** -- and it is a refusal rather
than a measurement because there is no number that would be right.

Nor that the four CI jobs failed *only* because of this line. The steps were asked, and the shard's own count
of red cases is the reading that would have said otherwise; the round re-ran the battery locally and it is
green at the same 146 sites, which is the strongest statement available from here.

Nor that two fixtures are enough. They exercise the refusal's exit and the sentence that names the rows; the
message's *wording* is asserted by `toContain` on three fragments, and a rewrite that said the same three
things in a misleading order would pass.

### Readings

> Ledger for `v3.152`.

| item | value |
| --- | --- |
| CI | **8 of 8 jobs success** -- run `45626206585` on `90303700`, the newest green run and the one the recording was taken from; this round adds no reading, because the tree it reports first ran red (below) and a red run's step seconds are the seconds of a step that stopped |
| the run this round reports | run `45643248364` on `d4ae8d6` -- the tree `v3.151` shipped -- **4 of 8 jobs success**, the four named in the table above; `45643248351` (anchor round trip) was green on the same tree, so the breakage is inside `CI` and not in the tree's own content |
| `pnpm run docs:check` | **23 steps, exit 0**, after the number and the snapshot were retaken |
| `core` test suite | **260 files, 7054 tests passed** (at v3.152) |
| `cli` test suite | **4 files, 187 tests passed** (at v3.152) |
| repo test suite | **264 files, 7241 tests passed** (at v3.152) |
| the history | **45** readings over **43** commits -- unchanged: this round's CI run is the next reading, not this one |
| new tests | **7,052 -> 7,054, +2**: the refusal in the judging mode, and the same boundary from the other side after `git add` |
| `golden-master/gate-sites.json` | re-derived; **146 sites across 69 of 103 scripts**, one line number moved (466 -> 483), no site added or removed |
| coverage | core **99.98 / 99.95 / 100 / 99.98**, cli **100 / 100 / 100 / 100** -- unchanged: every line this round added is in `scripts/` |
| mutation | **3 groups, 6 red cases, 0 survivors**, each measured on the green tree and restored to an identical `md5`: the hoisted refusal deleted (**3** red -- the rewrite refusal, the judging refusal, and the boundary after staging), the two modes made to share one sentence (**1** red, the judging refusal's assertion that the rows are named), and the refusal narrowed back to `--write` (**2** red, which is the v3.151 bug put back) |

### Left open

`O-133`, `O-136`, `O-137`, `O-140`, `O-141`, `O-108` and `O-134` are unchanged. One entry comes out of the
round:

- `O-142` · **A round can run the whole gate on a tree the commit will not contain, and nothing says
  otherwise.** The refusal now covers the one state that made the number wrong here -- a path outside the
  index -- but the general case is unchanged: tracked files with uncommitted edits are measured *and*
  committed from different states, and the reading a round reports is the reading of the worktree. The
  corpus's own practice is to run `docs:check` before `git add`, which is the order that hides this.
  `[open: whether the gate should refuse to report a verdict at all while any tracked file is modified, which
  would make every mid-round run red, or whether the round's ledger should carry the worktree's own digest
  beside the numbers so a reader can tell which tree was measured -- a refusal that costs a round its
  feedback loop, against a digest that costs a reader one more number to compare]`

## v3.153 — the battery charges each run to the claimant that paid, and stops at the first red

`v3.150` added six claims to one file and charged them **282 s**. That number was not a measurement of the six
runs: it was the difference between two afternoons. The battery printed one total, the recorder only ever saw
the step's wall clock, and a total cannot be divided after the fact -- so the round that adds a claim cannot
say what the claim cost. Two entries came out of that observation, and this round closes one and sharpens the
other.

### The instrument first: one row per claimant, with its own claims and runs

The battery now prints one row per claimant after the credit line:

```
verify-sites-are-sensitive: packages/core/test/ci-budget.test.ts -- 30 claim(s) in 30 run(s), 541.8 s (slowest 21.0 s)
verify-sites-are-sensitive: 129 mutant run(s) cost 587.1 s of child time inside 3.1 min of wall clock,
  3.2x the clock with 4 at a time; the dearest claimant is packages/core/test/ci-budget.test.ts at 48% of that
```

Two facts follow that no earlier line could carry: **which claimant** paid, and **how many runs** the total is
made of. The seconds come from `elapsedMs` measured around each child, so they are that claimant's own time
rather than a share of the shard's.

### The pair: one tree, one claim set, an hour apart

The comparison is paired, because the last two rounds established that two afternoons are not a control (finding
655). Same tree, same box, same shard, two runs an hour apart, the only difference being one line of the gate.
The 32 claimants both runs could measure, and their 125 claims:

| claimant | without `--bail` | with it |
| --- | --- | --- |
| `ci-budget.test.ts` | 541.8 s | **282.3 s** |
| `fetch-official.test.ts` | 294.0 s | **89.5 s** |
| `check-fault-cases.test.ts` | 250.7 s | **40.1 s** |
| `gates-are-testable-is-enumerated.test.ts` | 54.1 s | **25.9 s** |
| `check-official-roundtrip.test.ts` | 49.0 s | **17.1 s** |
| `gen-examples.test.ts` | 45.2 s | **28.1 s** |
| **the 32, added up** | **1382.7 s** | **577.1 s** — **-58.3%** |

And the shard as a whole: **6.4 min -> 3.1 min** of wall clock with four runs at a time.

The one asymmetry is worth writing down rather than smoothing: the control run measured **125** claims and the
flagged run **129**, because the four claims of the battery's own test file cannot be measured while the flag is
absent -- the file asserts it. The flag's own proof is the one claim the control cannot run.

### Why the flag is sound, and not merely faster

The claim a mutant run proves is **"some test goes red"**. Once one does, the rest of the file adds nothing to
that sentence and is charged to the claim anyway. The two ways the flag could weaken the battery are both
closed by construction:

| run | verdict | what `--bail` would do to it |
| --- | --- | --- |
| a mutant | some test goes red | stops at the first red; the verdict is unchanged, and the mutant's record is written when the site executes, which is before the failure |
| a survivor | no test goes red | nothing: a survivor's verdict **is** the whole file staying green, and a file that never went red never bails |
| a baseline | the longest single test of this file | **refused the flag**: a run that stopped at the first red would report the longest test of a file it had not finished -- a number about a subset printed as a number about the file |

The third row is the one that had to be written as a test rather than as a comment, and it is: the mutant's
argv carries `--bail`, the baseline's does not, and the baseline case is taken from a run that never reaches a
mutant (a claimant that is red on its own).

### What CI said, which is less than the local pair and more useful

Reading 47 -- this round's own run, `45673244483` -- records the two shard steps at **231 s** and **460 s**,
against **488 s** and **596 s** in reading 46: **-257 s** and **-136 s**. The workflow fell from **969 s to
771 s** (-20%).

The local pair's 52% did not survive the move to a four-vCPU runner intact: the shard that the 900 s reading
came from kept **77%** of its time, where the box these were measured on kept 48%. That difference is the
useful part, because it says what the remaining seconds are: a runner pays more of a run before the first red
than a 32-vCPU box does -- more startup, more contention, fewer cores for the file's own tests -- and `--bail`
cannot shorten what it reaches late.

And the critical path is no longer this battery. `batteries-heavy` took **761 s** of the 771 s run, so the
workflow now waits for the two probe-rewrite batteries, which this round did not touch. The next round that
wants the wall clock has to look there, and the instrument for it is the one this round built: a probe battery
that prints per-step seconds the way the sites battery prints per-claimant ones.

### Four things this round did wrong

- **The first control was run on a tree that was not consistent.** The control run removed `--bail` from a tree whose
  own test asserts it, and separately the tree's counts were mid-edit, so three claimants failed on their own
  and two more could not be measured. The pair above is the second attempt, run after the counts were retaken
  and after the inventory was re-derived -- and the first attempt is written here because it is the third time
  in three rounds that a measurement was taken on a tree that was not ready to be measured.
- **The inventory was not re-derived after the script was edited.** `gate-sites.json` records line numbers; inserting fifty lines moved
  one of them and the battery then armed a mutant at the wrong statement, which surfaced as "passed with the
  exit hollowed but never recorded the mutant". The deriver is not part of the battery and nothing reminded me.
- **The flag's gain was measured twice in one day before the numbers matched.** The first flagged run reported 583.9 s against a control's
  1415.3 s, on different claim sets: a ratio of two shards, which is the arithmetic this whole campaign has
  been removing. The paired table is the repair.
- **`prometheus` was not in this sandbox.** `reader-against-backend` refused to run until it was installed, so the first
  green-looking shard was green over 33 of 34 claimants. The CI job installs it (step 6); this box did not, and
  the round had to install it to measure the shard it was changing.

### Mutations

| mutation | red |
| --- | --- |
| the flag removed from the mutant run | 1 |
| the flag given to the baseline as well | 1 |
| the per-claimant rows deleted | 1 |
| every row charged the whole inventory's claim count | 1 |

**4 groups, 4 red cases, 0 survivors**, each measured on the green tree and restored to an identical `md5`.

### Left open

`O-133`, `O-140`, `O-141`, `O-108`, `O-134` and `O-129` are unchanged, and `O-137` is closed by this round's
rows: the battery says what each claimant's runs cost, so a claim added to a file can be charged to it. One
entry moves, and it is sharpened rather than closed, because the measurement says its premise was half wrong:

- `O-136` · **A claim's run still pays the fixed cost of a run and every test before its first red, and the
  inventory names no test.** The price was never "claims times file": it was "claims times the file up to the
  first red", which is why one flag took **58.3%** of it. What is left is the run itself -- `ci-budget.test.ts`'s
  30 claims cost **282 s**, against the **0.6--0.8 s** a single-claim claimant pays -- and naming the test in the
  inventory would remove the second half at the price of an inventory every claim has to survive.
  `[open: whether `provedBy` should carry the test, which `derive-gate-sites` cannot derive statically because
  which test goes red is a fact about a mutation and has to be measured first, or whether nine seconds a run is
  a price worth paying for an inventory that is derived rather than recorded]`

### Readings

> Ledger for `v3.153`.

| item | value |
| --- | --- |
| CI | **8 of 8 jobs success** -- run `45673244483` on `e2bf2db`, **771 s**, and the **forty-seventh reading**: the two shard steps read **231 s** and **460 s**, against **488 s** and **596 s** in the reading before it |
| the run before it | run `45652928012` on `9269682` -- **8 of 8 jobs success**, 969 s, the **forty-sixth reading**, taken at the start of this round because the previous one shipped that tree and could not record it |
| `core` test suite | **260 files, 7057 tests passed** (at v3.153) |
| `cli` test suite | **4 files, 187 tests passed** (at v3.153) |
| repo test suite | **264 files, 7244 tests passed** (at v3.153) |
| coverage | core **99.98 / 99.95 / 100 / 99.98**, cli **100 / 100 / 100 / 100** -- unchanged: every line this round added is in `scripts/` |
| new tests | **7,054 -> 7,057, +3**: the per-claimant rows, the flag on the mutant's argv, and the baseline's refusal of it |
| the pair | **1382.7 s -> 577.1 s** over 32 claimants, 125 claims and 125 runs either side, an hour apart on one box; the shard **6.4 -> 3.1 min** |
| the battery, both shards | **129 claims in 3.1 min** and **119 claims in 2.0 min**, 0 survivors, 0 unrecorded, 0 truncated |
| mutation | **4 groups, 4 red cases, 0 survivors**, each measured on the green tree and restored to an identical `md5` |
| the inventory | **146** sites, one coordinate moved by the round's own insertions (768 -> 829), and the file re-derived rather than edited |

## v3.154 — a run pays for the claim it makes, and the compile nobody read

`v3.153`'s ledger ended with a sentence that named the next round's subject: the critical path was no
longer the sites battery, `batteries-heavy` had taken **761 s** of a 771 s run, and "the instrument for it
is the one this round built". This round pointed that instrument at both batteries, and both were buying
work nobody had asked for.

### The instrument, applied

`type-miss-probe` prints one row per **claimant** -- the file an injection edits -- with the injections it
holds, the compiles it paid for, and the seconds split between compiling and probing. `backend-support`
prints one row per **test file**, with its runs, its seconds and its slowest single run. Both end with a
total that names its own run count. The instrument had to come first: the two steps reported `360 s` and
`379 s`, and a total is not a measurement (finding 657), so neither could say which injection or which
file the time belonged to.

The first reading of the type-miss battery, on the box this round measured everything on:

| claimant | injections | builds | seconds | of which compiling |
| --- | --- | --- | --- | --- |
| `derivation` | 17 | 17 | 41.4 | 38.6 |
| `scorer` | 6 | 6 | 14.8 | 13.8 |
| `rca100` | 6 | 6 | 14.4 | 13.4 |
| `collector` | 4 | 4 | 9.6 | 9.0 |
| the other twelve | 41 | 27 | 67.4 | 53.4 |
| **74 injections** | | **60** | **147.7** | **130.1** |

Two numbers in that table are the round. Compiling is **88%** of the child time, and there are **60**
compiles for 57 in-package injections -- where there had been 114.

### Finding 658: a whole-file run is a superset of the claim it is run for

The 83 rows of `backend-support` are each a claim of the form *this mutation makes this named test fail*,
and each was measured by running the file the test lives in and looking for the name in the output. That
is **347 s** of child time to measure 83 claims about one test each.

`--testNamePattern` is the same claim asked directly, and it is not the weaker instrument: the verdict
still requires a non-zero exit **and** the name in the output, so a run that collected nothing and a run
whose named test passed stay distinguishable. What is no longer observed is the case "a different test
went red", which used to read MISATTRIBUTED and now reads SURVIVED -- the named test did not catch the
mutation, which is exactly what the row claims.

The change was measured before it was taken, on one tree, alternating the two forms row by row:

| | whole file | named test | |
| --- | --- | --- | --- |
| 83 runs, child time | 347.0 s | **53.2 s** | **-84.7%** |
| verdicts that agreed | 83 | 83 | **0** disagreements |

and the battery run alone, on its own: **83 caught, 0 survived, 0 inert, 0 misattributed, 54 s**.

The name is passed through `re.escape`, and that is the one place the care looks excessive.
`--testNamePattern` compiles its argument as a regular expression, and one of the 83 names contains
`[timestamp, line]`: unescaped, the class matches a single character and the pattern matches no test at
all, so a mutation that was caught perfectly well would be reported MISATTRIBUTED -- a battery blaming
its own suite for an escaping defect. The new test measures both directions on the real name rather than
on a name invented for it.

### Finding 659: the restore compiled the package back, and the next injection overwrote it

An in-package injection must compile; that compile **is** the measurement, and a mutation that does not
compile would otherwise run the previous build and report against a rule it did not install. What was
not a measurement was the second compile: the `finally` put the committed source back and compiled it,
and the next injection's build then wrote its own output over the same `dist`. 57 measurements, 114
compiles of a 260-file package, and half of them read by nothing.

The source is still restored immediately -- that is what the byte-for-byte check at the bottom of
`run_probe` reads -- and the **compile** is deferred to the first reader that needs the committed rule:
the next injection that edits only the probe or the fixture, or the end of the battery. `_STALE_DIST`
records which state `dist` is in, `flush_dist` is the one thing that compiles it back, and the same
function is registered with `atexit`, so a run that never reaches the end -- an injection raising, a
guard calling `sys.exit` -- still leaves a package that reflects the tree. That last path is a test, not
a promise: a child imports the battery, marks the package stale, and exits without calling `flush_dist`,
and the marker its patched compiler writes is the measurement.

| | before | after |
| --- | --- | --- |
| compiles of `packages/core` | 114 | **60** |
| wall clock, one tree, back to back | 269.1 s | **150.8 s** |
| battery verdict | 74 caught, 0 survived, 0 inert, 0 blind | the same |

Three alternatives were measured or reasoned and refused:

- **`--incremental`**: 2.27 s -> 0.77 s per compile, three times the saving this round took. Refused
  because tsc keys a file by modification time and size, and the whole job here is to compile a file that
  was just written twice. A size-preserving mutation, restored inside one tick, would be read as
  unchanged -- and a `dist` that keeps a mutation is the worst state this battery can leave, because
  `_witnesses` journals the source and not the build output.
- **mutating `dist` directly**: no compile at all, and 57 anchors restated against emitted JavaScript --
  a second table to maintain, coupled to what `tsc` emits, and it would lose the compile check.
- **reordering the injections** so the in-package ones are contiguous: 60 builds -> 58, at the price of a
  report whose order is chosen by cost. Two compiles are not worth that.

### What CI said, and the job that was not in this round

Reading 48 -- run `45692816682` on `47919682` -- is **8 of 8 jobs success**, and the step this round is
about fell from **761 s to 325 s**:

| step | reading 47 | reading 48 |
| --- | --- | --- |
| Type-miss probe battery | 360 s | **205 s** |
| Backend-support battery | 379 s | **90 s** |
| the job, both plus the prefix | 761 s | **325 s** |

The local pairs predicted the shapes and not the sizes, and the difference is the runner rather than the
repair: a filtered run costs **1.08 s** on a four-vCPU runner where it costs **0.64 s** on this box, so the
fixed part that `--testNamePattern` cannot remove is 69% of what is left -- which is why the runner keeps
**76%** of that battery's time where the box kept **85%**. The probe battery has no such gap (**-43.1%**
against the box's **-43.9%**), because its cost is compiles, and a compile is CPU work on either machine.

**And the run got slower.** It took **1046 s** against 771 s, because `batteries` -- a job this round did
not touch -- took **1036 s** against 659 s: every one of its steps moved by the same factor, `Every gate
can be shown to fail` 242 -> **374 s**, the gate-test battery 171 -> **306 s**, the doc-count battery
52 -> **88 s**, the round-trip record 37 -> **64 s**. On the same run `verify` fell from 732 s to
**544 s** and both sensitivity jobs held their time, so this is that job's own day and not the runner's.
The honest reading is the one finding 655 wrote down two rounds ago: **two runs of one tree are only a
control when they are an hour apart on one box**, and the workflow's wall clock cannot be attributed
across days at all. What this round can say about CI is its own job's numbers; what it cannot say is that
the workflow is 275 s slower than it was, because nothing here measured that job again.

So the critical path moves a second time, and to a job with three steps over 88 s:
`batteries` at **1036 s**, then `verify` at **544 s** (of which `Lint` is **378 s**), then
`sensitivity-shard` at **464 s**.

### A bound that could not fire, because the job had stopped reporting

The refresh run -- the one this ledger's row does *not* cite, since `R7` reads a recording against the run
that produced it -- exposed a limit of a different kind. Its `sensitivity-shard` job sat `in_progress` for
**45 minutes** while the run's own `updated_at` stayed frozen at second 4, past both the step's
**30**-minute bound and the job's **42**-minute ceiling, and neither one fired. The same shard, on this
box, passes in **3.1 min** over **129** claims in **34** files and **0** survivors -- so the bounds were
not set wrongly and the tree was not slow: the thing that evaluates a timeout had stopped reporting, and
a timeout is only a number when something is counting. `cancel` and `rerun` is the whole repair, and the
observation belongs here rather than in a finding because it is not a defect in this repository's
guards: a bound enforced by an agent that has stopped answering cannot be a third thing for the tree to
prove.

### Six things this round did wrong

- **The first version of the new test wrote the probe back over itself.** `run_probe` restores
  `scripts/probe-type-misses.mjs` on every path, including the ones with nothing to restore, so a test
  that drove it was a test writing inside the package it tests -- which
  `tests-do-not-write-inside-the-package.test.ts` refused. The fix is to point the battery's own two
  inputs at the temporary directory as well, and it is the right fix rather than an exemption: the case
  is about the *schedule* of compiles, and it has no business touching the shipped probe.
- **Backticks inside a `python3 -c` heredoc inside a template literal.** esbuild ended the template at the
  first backtick and reported `Expected ")" but found "scripts"`, which names the transformer and not the
  mistake. Third time in this campaign that a JavaScript diagnostic has cost a read.
- **The counts could not be measured before they were published.** `measure-doc-counts` runs the suite,
  and the suite holds the document to the counts it publishes, so the first move had to be arithmetic
  (`7,057 + 3` tests, `260 + 1` files) with the measurement confirming it afterwards. It confirmed first
  time, which is the fixed point being reached by luck rather than by method: the round wrote down what
  it expected and the run agreed, and a run that disagreed would have been the only evidence.
- **Dating v3.153's three `as of this commit` rows emptied the corpus's only current-state rows.**
  `check-doc-counts.test.ts`'s non-vacuity assertion caught it, and its message -- `no current-state rows
  found` -- is the one sentence in this campaign that says what the convention is: exactly one ledger,
  the newest, carries them. The volumes do not say it anywhere.
- **`golden-master/unit-nouns.json`'s `file(s)` relation still said 479**, which had been true since
  v3.136 because no round between had added a file. This one added one, and the gate refused a sentence
  quoting a corpus that had grown -- the first reading of a figure that had been right by not moving.
- **The paired run's output was buffered through `tail`**, so a 6 m 40 s measurement was unreadable until
  it ended. The numbers arrived; the round could not have noticed a hang.

### Mutations

| mutation | red |
| --- | --- |
| `backend-support` asks for the whole file again | 1 |
| `backend-support` passes the name unescaped | 1 |
| `type-miss` compiles the restore again | 1 |
| `type-miss` leaves a reader without the committed rule | 1 |
| `type-miss` drops the `atexit` backstop | 1 |

**5 groups, 5 red cases, 0 survivors**, each measured on the green tree and restored to an identical
`md5`.

### Left open

Nothing closes this round. The eight entries that were open are open, and the round's other result is that
the list's prices have moved:

- `O-136` · **A claim's run still pays the fixed cost of a run and every test before its first red, and the
  inventory names no test.** This round took the fixed cost out of a *battery's* arithmetic -- 83 runs of one
  test instead of 83 whole files -- and left this one's subject alone: a single claim still pays vitest's
  startup and the file's work up to its first red, and `golden-master/gate-sites.json` still names a file
  rather than a test.
  `[open: this round removed a battery's fixed cost and not a claim's -- one claim still pays vitest's startup
  plus its file up to the first red, and `provedBy` still names a file, so the decision the live entry holds is
  the same one it held before the round]`

`O-133`, `O-140`, `O-141`, `O-108`, `O-134`, `O-129` and `O-142` are unchanged. What moved is the critical
path, and the movement is the other half of this round's result: with both probe batteries at roughly a third
of what they were, `batteries-heavy` stops holding the workflow and the wall clock moves to `verify`
(**732 s**, of which `Lint` is **509 s**) and to `batteries` (**659 s**, of which `Every gate can be shown to
fail` is **242 s**). Reading 48 moved it again: `batteries` read **1036 s** on a day every one of its steps
ran 1.5--1.8x its previous time, so the workflow's critical path is that job now, and the two steps worth
looking at are `Every gate can be shown to fail` (**374 s**) and the gate-test battery (**306 s**).
`verify-site-proofs.mjs` is still the shape to look at next in `verify`: **273 s** on this box, one child
per file, serially, over 69 files.

### Readings

> Ledger for `v3.154`.

| item | value |
| --- | --- |
| CI | **8 of 8 jobs success** -- run `45692816682` on `47919682`, **1046 s**, and the **forty-eighth reading**: the two probe batteries read **205 s** and **90 s** against **360 s** and **379 s**, so the job this round repaired fell from **761 s to 325 s**. The run's own wall clock rose from 771 s, which is `batteries` taking **1036 s** against 659 s with every one of its steps 1.5--1.8x its reading-47 time, on a run where `verify` fell to 544 s |
| `core` test suite | **261 files, 7060 tests passed** (at v3.154) |
| `cli` test suite | **4 files, 187 tests passed** (at v3.154) |
| repo test suite | **265 files, 7247 tests passed** (at v3.154) |
| coverage | core **99.98 / 99.95 / 100 / 99.98**, cli **100 / 100 / 100 / 100** -- unchanged: every line this round added is in `scripts/` |
| new tests | **7,057 -> 7,060, +3**: the named-test argv and its escaping, the compile schedule, and the `atexit` backstop |
| the pair, `backend-support` | **347.0 s -> 53.2 s** over 83 runs measured both ways on one tree, **83 of 83** verdicts identical |
| the pair, `type-miss` | **269.1 s -> 150.8 s** on one tree, back to back; **114 -> 60** compiles |
| the batteries, as run | `type-miss` **74 caught, 0 survived, 0 inert, 0 blind**, 147.7 s of child time in 151 s; `backend-support` **83 caught, 0 survived, 0 inert, 0 misattributed**, 53.0 s in 54 s |
| mutation | **5 groups, 5 red cases, 0 survivors**, each measured on the green tree and restored to an identical `md5` |
| the inventory | **146** sites, unmoved: both repairs are in `scripts/injection/`, which `derive-gate-sites` does not scan |

## v3.155 — the price of an audit, and a rule that could not express a promise

v3.154 ended with a sentence about where the wall clock had gone: `batteries` at **1036 s**, and inside it
`Every gate can be shown to fail` at **374 s**. This round pointed the instrument there, and the instrument
answered a question nobody had asked: of 374 s, 87% is tests the step was told to run, the dearest of its 69
subjects is an eighth of the total, and there is no mispriced claim to repair. What there is, is a count --
and a count can only be answered in another process.

### Finding 660: an audit that reports sixty-nine verdicts and no price

The step was the only one in the workflow that stated no number about itself. It now prints one row per
subject, and a summary that separates the children's wall clock from what those children said their own tests
took. On this box: **69 runs, 218.8 s of child time in 223.1 s of wall clock, 190.9 s of it the suites' own
(87%), 27.9 s of process start at 0.40 s a run, 233 file executions over 93 distinct files**, median 1.5 s,
44 of 69 at or under 2 s, and the dearest -- `check-official.mjs` -- at **26.1 s, 12%**.

That is a *negative* result and it is the round's most useful one. A repair aimed at the dearest subject would
have taken 12%; the 88% is the audit doing what it says. The `--list` docblock had said *"104 seconds for the
37 subjects"* while the list returns **69** -- the third stale figure this file has carried about itself, and
the reason the number is now printed rather than written down.

### Finding 661: sixty-eight independent claimants, run one after another

`verify-site-proofs.mjs` grouped 68 files, sorted them for the report, and ran them in a `for` loop whose body
was `spawnSync`: serial because the call blocks, not because the files interact. A bounded pool of
`availableParallelism()` workers -- `spawn` and await, eight at most -- takes it from **283.0 s to 124.3 s**
on one tree, back to back, with the same verdicts. The case that keeps it honest reads the overlap out of the
fixture runner's own two marks rather than a clock: **1** child alive at a time under `--jobs 1`, **at least
2** under `--jobs 4`.

### What the wall clock does with that

`Lint` held this gate and read **559 s** on attempt 2 of run `45695988542` against **378 s** in run
`45692816682` an hour earlier -- the same commit. The repair takes about **160 s** out of that step on this
box's ratio, and the bound moves the other way: `R4` refuses 18 minutes against 559 s, so `Lint` is bounded at
**19** and `verify`'s ceiling follows it to **42**.

`batteries` is the other pole, and the step inside it is now two shards: `--shard i/n` over the inventory's
subject list, `--list --shard i/n` printing a slice so the partition is checkable as a set, and two refusals --
a spec that is not `i/n`, and a slice that selects no gate. The step stays in `batteries` as **shard 1 of 2**
with its name and its bound untouched, because `R2` pins the recording to the name; the second shard runs in
`gates-audit`, a ninth job that no run has measured.

### Finding 662: the rule that could not express the state the previous rule existed for

That job could not be published. `R11` compares the newest closing reading's tally with `ci.yml`'s job count,
so nine jobs against the newest run's `8 of 8` is a refusal -- and the only row that satisfies it is one from
a run that cannot happen until the commit is pushed. `R9`'s promise was written for exactly this gap and no
rule could describe it; v3.54 did not hit it because `R11` did not exist yet.

`R11` now subtracts the jobs a declaration is waiting to measure, and refuses the same difference when no
promise accounts for it -- `R9` already refuses a promise for a job the recording holds, so a promise cannot
excuse an old reading. The gap is printed twice: `1 job declaration(s) still awaiting their first run`, by the
gate and by the recorder.

### Fourteen things this round did wrong

- **The first parallel run's 16 problems were mine, and I read them as the pool's.** Two were files that
  failed because the inventory was stale -- I had added two `process.exit` sites and moved others, and
  `derive-gate-sites --check` is the reader that says so. The other fourteen were claims pointing at line
  numbers that had moved. A concurrency change is exactly the wrong moment to be uncertain whether a red is
  yours.
- **The step-move's first edit put the block back at the end of `batteries`** while the new job was written
  above it. The YAML parsed, the job had six steps, and the step was still in the old place: a structural
  mistake that a syntax check cannot see, found by reading the parsed job back.
- **Three pairing attempts measured a tree that was changing under them.** 2 m 06 s and 4 m 39 s of two
  runs whose verdicts were about my edits; the numbers only mean something once the tree is green, and the
  third attempt is the one quoted.
- **`gate-steps.test.ts` pinned `41m` in two assertions.** A ceiling moved by one minute and two cases that
  have nothing to do with wall clocks went red -- the same "a number in prose is a status column" one level
  down, in the file that exists to complain about it.
- **Two `ci-budget.test.ts` cases assumed every job in the workflow has a recording.** That is the assumption
  `R9` exists to relax, and the first job-level promise in the tree is what said so: the summary counts the
  steps a run has *measured*, so the cases now derive that population instead of the workflow's step count.
- **`check-repository-table` refused a file I had written into `scripts/`** for the pairing measurement -- an
  untracked copy of the old gate, which would have made the table describe the index and the worktree at
  once. The measurement moved to `/tmp`, where it belongs.
- **The busy fixture wrote its own evidence where it stood.** Its runner derived the journal from
  `import.meta.url`, which is the first clause `tests-do-not-write-inside-the-package` reads -- correctly,
  and about a string that is source for a child in a scratch tree. The repair is not an exemption: the
  caller passes the path, so the write lands in the tree the test owns, and a busy run without one is an
  error rather than a silent `/dev/null`.
- **Two guards read a sharded command as a foreign one, and one register had to be told about the new job.**
  `cold-tree-job`'s "not a battery script" pattern ended at `$`, so `--shard 1/2` made the step fail a check
  whose subject is *which script a step names*; its sibling twenty lines down already carried the comment
  explaining that defect. The same file's suite register did not hold `gates-audit`, which is the register
  working: a job that starts a suite is a job that needs `zsh`.
- **The round published `+3` and the suite counted `+4`.** Nothing compares a Readings row with the report
  it was derived from; the derivation itself did, one step later, when `--write-doc` printed 7,064 beside a
  sentence that said 7,063. The count was recomputed from the four cases the round actually added.
- **`check-repository-table` refused the tree twice, and the second refusal was the interesting one.** The
  first was a stale figure (121,347). The second came from the hand-set number being written while the file
  it counts was still being edited -- 121,385 against 121,387 -- which is the same lesson as the pairing
  runs: a number taken from a moving tree is a number about the movement.
- **The residual this round opened was written twice, in two different sentences.** `O-143` entered the live
  list as *"the workflow's critical path is a queue of eighteen steps"*, and the record below restated it as
  *"the shard moved the queue rather than the run"*, with no open reason at all -- which `check-open-list`
  refuses twice: a bullet that says neither that it is closed nor why it is open, and a residual whose first
  twenty characters appear in no entry of `## Open`. A record is a quotation of the list, not a second draft
  of it.
- **The pool I added came back red on CI, for two reasons that were both mine.** The witness was armed
  for the run rather than for the file, so 50 claimant files paid a module loader per spawned gate; and a
  child was several vitest processes, so the cap bounded something other than what it was chosen by.
  The section below is the reading; the round would have shipped a red lane if the suite's own stall
  budget had not been watching a file the workflow's 19-minute bound could not see.
- **A count of tracked files, measured before the deletion was staged.** `check-repository-table`
  reads `git ls-files`, so its row describes the *index*; `ci-declarations.json` was removed from the
  worktree and the gate was run before `git add`, which is the two-states-at-once shape `v3.151` recorded
  and which this time cost **four jobs**: the row itself in `cold-tree` and `artefacts`, and `verify` and
  `sensitivity-shard` behind `unit-nouns.test.ts`, which runs that gate and fails with it. The
  local gate was green on a tree the commit did not contain -- and the difference was one file whose
  absence the worktree knew about and the row did not.
- **This list of the round's own mistakes became a record of them.** One bullet quoted the open-reason marker
  verbatim, and `openEntriesInList` reads a section as a record when its body is nothing but bullets *and* at
  least one of them carries a reason a reader could act on -- so the round's mistakes were counted as
  residuals of `v3.155`, and `Mutations` became the round's second `###` section under one heading. The same
  shape as the file that has to exempt itself from the package-write scan: prose *about* a marker has the
  marker, and a reader that judges by shape cannot tell the description from the thing.

### The run came back red, and both costs were the pool's

CI run `45738320826` on `4be886d` reported **8 of 9 jobs green**. The ninth job -- `gates-audit`, the one
`ci-declarations.json` promised rather than recorded -- passed in **227 s**, the shard inside it in **202 s**.
The red was in `Lint`, and the sentence was not about a claim:

```
  packages/core/test/check-doc-counts.test.ts did not pass, so its claims are unmeasured
    Error: this test file held the event loop for 53800 ms, past the 45000 ms budget. Of that,
    374 ms were this process's own CPU time
    Tests  59 passed (59)
```

`59 of 59` passed; the **budget** failed. Two costs crossed it, and both were the pool's:

- **The throw witness was armed for a run, not for a file.** 18 of the 68 claimant files have a throw claim,
  so 50 paid for an instrument they never read -- and the witness is a module loader, so every gate those
  files spawn pays again. Measured on the file CI failed, alone on an idle box: **3.14 s** plain, **3.27 s**
  with the trace hook, **11.18 s** with the witness. Fifty-nine spawns at ~135 ms is the whole of the
  difference.
- **A child was `vitest run <file>`, and vitest brings its own pool.** The cap bounded *children*; the number
  it was chosen by is *test processes*, and on a runner with fewer cores than the cap a child is several of
  those.

`RCA_THROW_WITNESS` now follows each file's own claims, and each child is started with `--maxWorkers=1` --
which changes nothing about which tests run, because a child has one file. On one green tree, back to back:
**124.3 s -> 79.4 s** at the default eight, **151.6 s -> 92.5 s** under `taskset -c 0-3` where the gate takes
four at a time. The summary line ends `the throw witness armed for 18 of them`, because "how much of this run
was instrumented" is a question about cost that no verdict answers.

Two things this red taught that no local run could:

- **`Lint`'s 19-minute bound was never going to notice.** The step spent 301 s. What noticed was
  `stall-budget`, the suite's own instrument, one level down -- a gate can be inside its own budget and
  inside no budget at all.
- **The job log is readable from this box after all.** `GET /actions/jobs/<id>/logs` answered **200** with the
  transcript, and `GET /actions/runs/<id>/logs` answered with a 252 KB zip. `O-141` was filed on the sentence
  "the logs endpoint redirects to a blob host that resolves to `198.18.0.16` here", and that sentence is now
  false: what made this red legible in one request was reading it rather than inferring it from a step's
  name.

The next run (`45745150199`, on `6faece8`) answered the repair and found one more thing the round had never
declared. `Lint` was **green in 143 s**, from 301 s red -- the witness and the pool together. The red had moved
to `Every test's cost against the budget it declares`, one step further down, and it was mechanical:

```
check-test-budgets: site-proofs.test.ts: its slowest test takes 1958 ms and the file states no budget,
so its verdict is decided by vitest's 5000 ms default
```

A file within a fifth of the default has to state a number, and this file had never stated one because on this
box no test in it was near the floor: the concurrency case reads **1 561 ms** here and **1 958 ms** on the
runner. It now declares `SUITE_BUDGET_MS = 30_000` on all twelve of its suites -- the number nine other files
in this tree use, and 15x the worst reading rather than the 2x the rule asks for, because what the case spends
is other processes' start-up.

That step also turned its floor on `step-process.test.ts`, on this box only: **3 444 ms** against a declaration
of **6 000 ms** chosen as 2.1x the three readings the file had seen (1 635, 2 091, 2 873 ms). A fourth reading
is 1.74x, so the declaration was inside the rule's margin on the three it was sized from and outside it on a
fourth -- the shape the file's own comment predicted, one reading later. It is **8 000 ms** now, 2.3x of the
slowest, with the fourth reading written beside the other three.

### The promise, settled

`node scripts/measure-ci-baseline.mjs 45748356774` recorded **9 jobs and 90 steps** and printed the one
sentence the round was waiting for: *1 job declaration(s) are now measured and can be deleted*. What replaces
the numbers the promise carried is a multiple of a measurement, which is the only kind of number the rules
accept:

| | promised | measured | settled |
| --- | --- | --- | --- |
| `gates-audit` ceiling | 26 min | 264 s (the job) | **24 min** |
| its shard step | 13 min | 234 s | **10 min** |

10 is 2.6x this shard's own first day; 24 is what `R13` allows over the three bounds the job holds (7 + 3 + 10)
plus the prefix allowance, and `R13` asks for a ceiling the bounds fit *inside*, so the sum is the floor of the
number rather than the number. The file went with the promise: `ci-declarations.json` exists for one round --
the one that adds a job and cannot yet measure it -- and the gate says so in its own words when it is left
behind.

The reading is the **50th**, and the summary's own sentence moved with it: from `1 job(s) declared and awaiting
their first run` to `no job is declared unmeasured`, 50 readings from run 42131836805 to 45748356774, 41 steps
carrying a bound of their own.

### The fifty-first, and what it cost to get

Run `45748356774` was green on a tree the round had not finished writing: the fourteenth thing this round got
wrong was a file count taken while the deletion was still unstaged, so the next commit measured **683** tracked
files where the tree held **682** and four jobs went red for a number. The fix is one character -- the row says
682 -- and the run that measured it is the **51st**: `45754575653`, 9 of 9 jobs, 90 steps, recorded with
`node scripts/measure-ci-baseline.mjs 45754575653`. A reading is not a reward for a green run; it is the only
thing a bound may be sized from, and this round needed a second one because the first described a tree that
never existed as a commit.

### Mutations

| mutation | red |
| --- | --- |
| the audit's cost is a constant | 1 |
| the pool has one worker whatever `--jobs` says | 1 |
| every shard is the first slice | 1 |
| a slice that selects no gate is measured | 1 |
| `R11` accepts any gap | 1 |
| the witness is armed for every file again | 1 |
| a child is started without `--maxWorkers=1` | 1 |

**7 groups, 7 red cases, 0 survivors**, each measured on the green tree and restored to an identical `md5`.

### Left open

- `O-143` · **The workflow's critical path is a queue of eighteen steps, and sharding one of them moved the
  queue rather than the run.** The step this round split takes about half of its 374 s out of `batteries`,
  and that job still stands at roughly **850 s**, because the other eighteen steps in it add up to 662 s on
  their own. A job that runs nineteen independent things costs the sum of nineteen numbers, so the two
  members worth sharding next are the gate-test battery (**306 s**, which has no shard support and a
  published report that a shard would halve) and the fetch-official retry battery (**100 s**).
  `[open: whether the next cut is a second shard pair for the gate-test battery -- which needs the battery to
  partition both its injections and the artefact it publishes, so that the report is not half a measurement
  -- or whether the answer is moving the tail's own smallest members into the job that is now cheapest,
  which trades one queue for another and needs a reading rather than an argument]`

### Readings

> Ledger for `v3.155`.

| item | value |
| --- | --- |
| CI | run `45748356774` on `631fcb261`: **9 of 9 jobs success** -- the first run that measured the job this round added, and the one this round's recording (reading **50**) is taken from. Its two predecessors on the round's own commits came back 8 of 9, and the section above reads both: `Lint` 301 s red on a stall budget, then 143 s green with the red moved to a missing budget declaration. The ninth job's own first day is **264 s**, the shard inside it **234 s**. Its successor `45751356209` came back 4 of 9 on a tracked-file count, and the run after the one-character fix is reading **51**: `45754575653`, **9 of 9**, 90 steps, 51 readings from run 42131836805 to 45754575653 |
| `core` test suite | **261 files, 7065 tests passed** (at v3.155) |
| `cli` test suite | **4 files, 187 tests passed** (at v3.155) |
| repo test suite | **265 files, 7252 tests passed** (at v3.155) |
| coverage | core **99.98 / 99.95 / 100 / 99.98**, cli **100 / 100 / 100 / 100** |
| new tests | **7,060 -> 7,065, +5**: the audit's per-subject cost and the parts adding to the whole, the shard partition with its two refusals, the `--jobs` count it cannot honour, the pool's overlap measured from the marks its children write, and the witness armed per file with each child asked for one worker |
| the audit, as run | **69 runs**, 218.8 s of child time in 223.1 s of wall clock; **190.9 s** reported by the suites (69 of 69); **233** file executions over **93** distinct files; dearest `check-official.mjs` at **26.1 s (12%)** |
| the pair, `verify-site-proofs` | **283.0 s -> 124.3 s** on one tree, back to back, `--jobs 1` against the default; then, after finding 663, **124.3 s -> 79.4 s** at the default eight and **151.6 s -> 92.5 s** under `taskset -c 0-3`; 68 claimant files, the same verdicts every time, and the witness armed for **18** of them |
| mutation | **7 groups, 7 red cases, 0 survivors**, each restored to an identical `md5`; the second CI run's red is answered by a declaration rather than by a mutation, because it was a missing number and not a missing branch |
| the inventory | **149** sites, up 2: the shard spec and the empty slice, each proved by the case that drives it |

## v3.156 — a recording binds a step to a job, so a queue could not be rebalanced

The fifty-first reading put the four queues on one line: `batteries` **738 s**, `sensitivity-shard` **497 s**,
`verify` **375 s**, `gates-audit` **270 s**. A job's wall clock is the sum of its steps, and `batteries`' 738 s
is four batteries -- the audit's first shard **137 s**, fetch-official retry **118 s**, the gate-test battery
**264 s**, doc-count shapes **78 s** -- plus the round-trip record at **57 s**, four small ones under a minute,
and **25 s** of prefix. Four of those members are independent of each other and of everything else in the job,
so the repair is a move rather than a shard: **253 s** of batteries into the job that had 270 s to spare.

The move was refused, and the refusal is the finding.

### Finding 664: the recording is keyed by job, and a step can change jobs

```
the recording holds `Fetch-official retry battery (no survivors)` for `batteries`, which is not a step of
that job: a recording that outlives its step describes a tree that no longer exists
```

Both halves of that sentence are true and only one of them was ever a rule. The entry *is* evidence of a tree
that no longer exists; it is also the only measurement of that command the file holds, and the bound in the new
job has to be a multiple of something. `--borrow` exists for exactly this shape and refuses it for the reason
that makes it right -- *"the seconds describe the same commands, but a bound has to fit the job that will
enforce it, so a borrow is only a substitute for a measurement inside one budget"* -- because a move is defined
by the two jobs holding different ceilings.

So the state had no sentence, and the only road left was the one this repository does not take: land the move
in a commit whose gate is red, then re-record. `golden-master/ci-declarations.json` now carries a `moved` list,
which is `R9`'s promise one level down: it names the job that holds the step, the job whose recording measured
it, the bound, and why. It excuses the stale entry for one round, enters the new job's pending set so every
`R8` check applies unchanged, and expires the moment the job that holds the step has measured it there -- three
behaviours, no new rule, and each of the three is a case in `ci-budget.test.ts`.

### The arithmetic under the ceiling had the same blind spot

`R13` asks for `bounds + 2 x overhead`, and overhead is `total - the steps`. Three steps leave, `measured` falls
by 253 s, and `total` still holds them -- so the job that gave a step away reports the step's cost as **setup**
and argues a ceiling from seconds nothing will spend there again. `batteries` was refused at 45 minutes and
asked for **54**. The departed seconds come off both sides of that subtraction now, and the same tree asks for
**46**. It is finding 619's shape one level in: the number a ceiling is computed from has to be a number about
the job as it is, not as it was.

### The queue, after the move

| | reading 51 | predicted | reading 52 |
| --- | --- | --- | --- |
| `batteries` | 738 s (ceiling 56) | 485 s | **323 s** (ceiling 46) |
| `gates-audit` | 270 s (ceiling 24) | 523 s | **501 s** (ceiling 34) |

The measurement agrees with the shape and not with the size, and the difference is the day rather than the move:
every job in run `45765112261` came in below the one before it -- `verify` **319 s** against 375, `sensitivity-shard`
**465 s** against 497, `batteries-heavy` **275 s** against 366 -- so the two numbers to compare are inside that run,
where `batteries` would have been **576 s** with the three batteries still in it. What the move did is visible
where it happened: the destination spent **94 + 86 + 62 = 242 s** on the three, and the queue that was the run's
floor is now the second of the two.

### Five things this round did wrong

- **The first move script swallowed the step after each one.** The block boundary was "forward to the next
  `- name:`", which takes the *next* step's comment paragraph with it -- so the gate-test battery's rationale
  went with the doc-count battery. YAML parsed, the step count was right, and only a diff of the parsed jobs
  showed it. `git checkout` and a rule that a block ends at a blank line is the repair; the deletion was
  re-run against a clean file.
- **`--borrow` looked like the instrument and its refusal is the finding.** The reasoning "a step's cost does
  not depend on which job it sits in" is true and insufficient, and the recorder's own sentence says why better
  than the round did before it read it.
- **The overhead double-count was found by the gate, not by me.** The ceiling asked for 54 where 46 is right,
  and the 253 s it was charging as setup was the three steps the round had just moved.
- **A global replace of `timeout-minutes: 45` would have taken `batteries-heavy` with it.** The assertion that
  the string occurred once refused, and the edit became a line index.
- **The count measurement refuses a red run, and the run was red because the counts were stale.** The same
  loop `v3.154` recorded: arithmetic first (7,065 + 5), then the snapshot, then the measurement that confirms
  it. The suite's own `unit-nouns` case is what noticed, and it noticed by running `check-repository-table`.

### Mutations

| mutation | red |
| --- | --- |
| no excusal for a moved step | 3, and the gate refuses the shipped tree |
| every stale entry excused | 3 |
| departed seconds counted as overhead | 2, and the gate asks for 54 min |
| a move may name its own job | 1 |
| a moved step is not pending in its new job | 12, and the gate refuses the shipped tree |

**5 groups, 5 red, 0 survivors**, each restored to an identical `md5`.

### Left open

- `O-143` · **The workflow's critical path is a queue of steps, and this round moved the tail rather than splitting
  the head.** Reading 51 read the two queues at **738 s** and **270 s**; three batteries worth **253 s** went into
  the smaller one, and reading 52 measures **323 s** and **501 s**. The floor of the run moved to the job that
  received them, which is what a move does: nothing left the workflow, it was put where there was room. What is
  left is a partition problem rather than a queue problem -- `gates-audit`'s own audit shard at **239 s**, the
  gate-test battery at **173 s** (54% of `batteries`), and the widest imbalance in the workflow, the `sensitivity`
  pair reading **244 s** and **438 s** of one command.
  `[open: whether the next cut is that pair's partition -- 194 s of imbalance no queue can remove, only a better
  split of the same claims -- or a third job for the gate-test battery, which needs the report it publishes to be a
  report per shard, so that half a measurement is not published as one]`

### Readings

> Ledger for `v3.156`.

| item | value |
| --- | --- |
| CI | run `45765112261` on `a92304e4`: **9 of 9 jobs success**, 90 steps, reading **52** -- the first run that measured the move, and the one the three promises were settled by. Its predecessor `45754575653` (reading **51**) is where the arithmetic came from: 738 s of queue against 270 s. Between them sits `45756585961`, which is 9 of 9 and is not a reading -- it measured a tree whose only difference is the recording, and the recorder compares two trees in both directions |
| `core` test suite | **261 files, 7070 tests passed** (at v3.156) |
| `cli` test suite | **4 files, 187 tests passed** (at v3.156) |
| repo test suite | **265 files, 7257 tests passed** (at v3.156) |
| coverage | core **99.98 / 99.95 / 100 / 99.98**, cli **100 / 100 / 100 / 100** |
| new tests | **7,065 -> 7,070, +5**: the move that lets a step change jobs, the stale entry no move explains, a move into a job that does not hold the step and two that move nothing, a step promised twice with a move that has no argument or no number, and the move that expires when its new job has measured it |
| the queues, as measured | reading 51: `batteries` **738 s** (`Gate-test` 264, audit shard 1 137, fetch-official 118, doc-count 78, round-trip 57, prefix 25), `gates-audit` **270 s** (shard 2 at 250) |
| the move | **253 s** from `batteries` to `gates-audit`, at a cost of no new job, no second prefix and no new step name. Predicted 485 / 523; measured **323 / 501**, in a run where every job came in below the previous one -- so the comparison that means anything is inside reading 52, where `batteries` would have been **576 s** with the three still in it and the destination spent **94 + 86 + 62 = 242 s** on them |
| the ceilings | `batteries` **56 -> 46 min** (42 of bounds plus the 3-minute allowance, and the departed seconds no longer counted as overhead), `gates-audit` **24 -> 34 min** (30 plus the allowance) |
| mutation | **5 groups, 5 red, 0 survivors**, each restored to an identical `md5` |

## v3.157 — a split by position is a split by nothing

**The split was by position because nobody had priced the files.** `sensitivity` and `sensitivity-shard` divide
the sites battery between them, and reading 52 measured the two halves at **247 s** and **438 s** of the same
command: 44% apart, three minutes in which one runner worked and the other had finished. The corpus had already
written the repair down. The paragraph in `docs/acceptance.md` that refuses to claim the split balances anything
ends with *"if that shard approaches twice its own bound the shards should be re-partitioned from a measurement
rather than by position"*, and this round is that sentence, taken at the point the condition had been met twice.

**Why position was chosen, and which half of the argument was wrong.** The note on `shardClaims` said that a
split by measured seconds "would have to be re-derived after every run and would put the same file in different
shards on different machines", and that a plan in `ci.yml` and a plan checked by a test have to be the same
plan. Both halves are true of a split by **live** seconds. Neither is true of a split by a **committed table**:
the numbers are a file in the repository, so every machine divides identically, and the table is re-derived only
when the tree changes -- which is the condition the coverage verdict below refuses to let pass unnoticed. The
old argument was sound about readings and false about records.

**What the table is.** `golden-master/sensitivity-costs.json`, one row per claimant: `claims`, `runs`,
`baselineMs`, `mutantMs`. It is written by the instrument that spends the seconds -- `--costs <path>`, after a
run that measured every claimant -- and it refuses the two requests that would make it a table about something
else: `--shard` (which measured half an inventory) and `--list` (which measured none). Its provenance is
`measured`, `machine` and `source`, and `checkShardCosts` reads all three: a seconds figure with no day is a
figure about another tree, and a round that refreshes the table has to know which run to compare with.

**The division is longest-processing-time first.** The dearest claimant goes on the emptiest shard, then the
next dearest, ties broken by file name and by the lower shard index, and the result is a pure function of the
table and the inventory. It is not claimed to be optimal -- dividing indivisible files is bin packing, and LPT
is a 4/3-approximation -- but it is deterministic, and what it leaves is a fraction of the dearest file against
the 44% the positional rule left.

**What a table cannot be allowed to do is age.** `checkShardCosts` refuses it in both directions (a claimant
with no row, a row with no claimant), refuses a row whose claim count disagrees -- the count is part of the
cost's definition, one baseline plus one run per claim, so a file that gained a claim has seconds describing a
run that no longer exists -- refuses a row whose seconds are not positive integers, and reads the three
provenance fields. The gate calls it before it divides anything, so a claimant added in a later round turns
both jobs red with the one command that regenerates the table, rather than being silently dropped from one half.

**There is no positional fallback, deliberately.** `shardClaims` requires the costs: a shard run without a
readable table stops with the command that writes one. A fallback would be a second partition under one
name -- the halves `ci.yml` runs would stop being the halves a local `--shard` runs, in the one place nobody
would look for the difference.

**Measured on the tree this round publishes, twice.** The first table was written by `--costs` on the box this
round was built on (32 cores, the same four-way pool): **68** claimants, **1,670.9 s** of child time over 324
runs, divided **834.6 s** and **836.3 s** -- 0.2% apart, 33 files against 35, where position would have divided
the same seconds **674.5** and **996.4** (32% apart).

**And the runner disagreed twice, which is the round's real result.** Reading 53 measured the two jobs at **306 s**
and **362 s** -- 15.5% apart, not the 0.2% the local table predicted. Priced by the **runner's own** per-file rows
of that run, the partition that ran is **1,201 s** against **1,432 s**: **16.1%**, which is the 15.5% the jobs read.
So the partition transferred exactly as the runner's costs say, and the table was measured on the wrong machine --
32 cores and 4 vCPUs do not price a claimant proportionally, because contention scales with what a file does.

The repair was available because of the column this round added: the per-file row prints the **baseline** now, so a
table can be rebuilt from a run's own log instead of re-measured on a developer's box. Rebuilt from reading 53's
two shards it prices **2,632.1 s** of child time, divides **34** against **34**, **1,315.7 s** and **1,316.4 s**
(0.1% apart), and moves **13** files. It shipped in `b24cf16`, and reading 54 is what it cost: **427 s** against
**303 s**.

**That is the finding, and it is not the one the round set out to prove.** The same partition, priced by two
consecutive runs' own rows, is **0.1%** apart and then **30%** apart -- and the two runs are the same tree. The
per-file costs moved by up to **2.42x** between them (`gate-sites-are-proven.test.ts` 16.8 s then 40.6 s), the
total by 9%, and the sum of the absolute changes is **653 s**, a quarter of everything the battery spends. A
static table balances the seconds it was given; on an inventory where one claimant is **398-829 s** and four more
are over 90 s, the seconds it is given are not a stable quantity. So the honest summary is: **the split is now
derived from a measurement rather than from a name, and the residual imbalance is dominated by run-to-run
variance, not by the rule.** What would move it next is not another partition but the price of the claimants
themselves -- `ci-budget.test.ts` alone is 30 claims and up to 29% of the battery.

**Five things this round got wrong.**

1. **The table's own acceptance cases were put inside a claimant file, and that is a cycle.** The battery runs
   every file `gate-sites.json` names as a claimant; a case that reads the table would be run by the very
   instrument that writes it, so the run that produces the table would be red until the table existed. The first
   attempt failed exactly there -- *"`sensitivity-shards.test.ts` does not pass on its own, so its claims are
   unmeasured"* -- and the repair is structural rather than a tolerance: the cases that read the artifact moved
   to `sensitivity-costs.test.ts`, which spawns nothing and therefore is not a claimant. The cases about the
   *plan* stayed where they were and now price every file the same, so a case about shape is not red because a
   measurement it does not consult is missing.
2. **`--list` grew a sentence it had no business printing.** The predicted split was printed by the shard
   before the plan, and the case that requires a shard's `--list` to be the unsharded list byte for byte caught
   it at once: two extra lines in a 50-line plan. A plan is one line per claim and nothing else; the prediction
   is printed by a run.
3. **Changing a diagnostic's text un-proves its site, and the deriver said so.** Widening the usage string to
   mention `--costs` dropped the annotation on `verify-sites-are-sensitive.mjs`'s usage refusal --
   `annotations: 148 of 149 carried, 1 dropped` -- because a site is identified partly by what it says. Four new
   exits and two new throws arrived unannotated the same way, and `gate-sites-are-proven` refused the tree with
   six sentences before the battery would have.
4. **The table was measured on the wrong machine, and then the right machine disagreed with itself.** The first
   table came from this box -- 32 cores, four-way pool -- and divided the claimants 0.2% apart; the runner read
   **15.5%**, and priced by its own rows the partition that ran is **16.1%**, so the table was the thing measured
   in the wrong place. The repair is the column this round added, and it did what it was for: rebuilt from reading
   53's two shards, the table divided 34 against 34 at 0.1%. Reading 54, on the same tree, read **427 s / 303 s**
   and its own rows put the same partition **30%** apart. Per-file costs moved by up to **2.42x** between two runs
   of one tree, **653 s** of churn in all. The round predicted a balanced pair and cannot claim one: what it can
   claim is that the rule is now a measurement, and that the quantity a static table balances is not stable enough
   at this inventory to be tuned further.
5. **A guard with no test is the bound-that-cannot-fire one level down.** `assignShards` refuses a split into
   zero shards, and nothing reached it: `parseShard` refuses that count before the gate asks. It is proved now
   by the case that calls the function with zero, because an unreachable refusal is a line a reader is told to
   trust and cannot see work.

### Readings

> Ledger for `v3.157`.

| item | value |
| --- | --- |
| CI | run `45802469718` on `b24cf16`: **9 of 9 jobs success**, 90 steps, reading **54** -- the tree that ships the rebuilt table, and the last run of this round. Its predecessor `45799554098` (reading **53**) is the first run whose halves were measured rather than positioned. The three pairs are the round: 247 s / 438 s (reading 52, position), **306 s / 362 s** (reading 53, the local table), **427 s / 303 s** (reading 54, the runner's own table) |
| the two halves, as they were | reading 52: `sensitivity` **247 s** and `sensitivity-shard` **438 s** of `verify-sites-are-sensitive.mjs`, 44% apart, from a split by `position % count` over 44 sorted claimant files |
| the division the corpus asked for | `docs/acceptance.md`, written at v3.54: *"if that shard approaches twice its own bound the shards should be re-partitioned from a measurement rather than by position"* -- 438 s against a 30-minute bound had not reached twice, and the imbalance was paid for three minutes a run while it waited |
| `core` test suite | **262 files, 7082 tests passed** (at v3.157) |
| `cli` test suite | **4 files, 187 tests passed** (at v3.157) |
| repo test suite | **266 files, 7269 tests passed** (at v3.157) |
| coverage | core **99.98 / 99.95 / 100 / 99.98**, cli **100 / 100 / 100 / 100** |
| mutation | **8 groups, 8 red, 0 survivors** (the eighth is the provenance rule below): the coverage verdict silenced (3), the placement sorted by name instead of by cost (2), an unpriced claimant given one millisecond (1), the claim count not compared with the claims it prices (1), a table written by a shard (1), the prediction printed under `--list` (1), the baseline counted as a mutant run (1) -- each restored to an identical `md5`. The fifth was a survivor on its first shape, and the case is why: it would have passed on the gate's own "cannot read the table", so the fixture now carries a table the shard *could* use and the assertion is on the refusal's own sentence |
| new tests | **7,070 -> 7,082, +12**: the cost-based placement and its determinism, the refusal to place an unmeasured claimant, a split into no shards, the coverage verdict in both directions with its count and its provenance, a row that is not a measurement, the gate's `--costs` writer, its refusal of a shard, its refusal of a missing table and of a stale one, and the 15% budget the round commits to |

## v3.158 — a claim's price is the test that can see it

**The imbalance was never the partition.** v3.157 divided the sites battery by a committed cost table, and the
table was balanced to 0.1%; reading 53 read the two shards **306 s / 362 s** and reading 54, on the same tree,
**427 s / 303 s**. Priced by its own per-file rows, the same partition was 16.1% apart and then 30% apart. The
round's own conclusion was that a static table cannot balance a quantity that is not stable -- and the quantity
was the wrong one. It was not the partition that varied. It was **what a claim cost**.

**A claim cost a whole file.** A mutant run replaces one exit with success and asks whether anything notices; the
answer is the exit code, so the run is a run of the claimant, and its price is the claimant's runtime. A file
with thirty claims therefore cost thirty runs of itself, and a file's price was its own runtime multiplied by its
claim count. Measured in the table v3.157 shipped: 68 claimants, 2,632 s of child time, and two of them --
`ci-budget.test.ts` (30 claims, 620.8 s) and `publish.test.ts` (29 claims, 565.0 s) -- were **45%** of the whole
battery. A partition cannot make 45% smaller; it can only decide which half pays it.

**The report already knew which test it was.** A mutant run writes vitest's JSON report, and the report names the
test that failed. That name is the whole of the answer: the claim is "some test depends on this exit", and the
test that went red is the one that does. So the report is read for the failed test's title, the table records it
beside the claim, and the next run of that claim is pointed at that one test with `--testNamePattern`.

The principle is not new here: finding 658 applied it to the 83 rows of the backend-support battery and measured
**347.0 s -> 53.2 s** with 83 of 83 verdicts identical. What is new is *where the name comes from*. Those rows
carried the test's name, so the instrument could read it out of the row. A site does not carry one -- nothing in
`gate-sites.json` says which test would notice -- so the name has to be measured, recorded, and re-checked on
every run. That is the missing half, and it is the half the table is for.

**The aim can only make a run cheaper, never a claim truer.** Three verdicts, and the asymmetry between them is
the design:

- an aimed run that goes red **on the aimed test**, with the mutant recorded, is the evidence the whole run would
  have given -- one test depended on this exit;
- an aimed run that **passes** is not evidence of anything, because the file's other tests were never run, so the
  claim is measured again against the whole file;
- an aimed run that goes red **on some other test** is treated the same way: the aim matched something and the
  run failed, and neither fact says the witness noticed.

The fallback is the pre-v3.158 instrument, so a table that has gone stale -- a test renamed, a suite rewritten --
costs a whole-file run and never a wrong verdict. The summary prints the count, because a battery that got
slower and a table that went stale look identical from a green run:
`N of M claim(s) named a test that could see them, and K of those aims held; J aim(s) missed and were measured
against the whole file instead`.

**The escaping is load-bearing, and finding 658 had already said so.** `--testNamePattern` compiles its argument
as a regular expression, so a title passed through unchanged is a pattern: `a bound (v3.158) is twice the day`
opens a group and matches a family of names, and a red from one of them would be credited to this claim. The name
is escaped, and the case asserts both directions on a shipped-shaped name -- the escaped pattern matches it and
the raw one does not. The two instruments cannot share the function: the backend-support battery is Python
(`re.escape`) and this one is JavaScript, so the rule is written twice and neither copy can drift into the other.

**What the measurement says.** One tree, one box, four claimants at a time, alternating nothing but the table:

| | before the aim | with the aim |
| --- | --- | --- |
| 256 mutant runs, child time | **3,061.7 s** | **924.2 s** |
| wall clock at 8 at a time | **7.8 min** | **3.3 min** |
| dearest claimant's share | **29%** | **16%** |
| aims that held | -- | **256 of 256** |

And the table that is shipped, written by an aimed run (`--costs`): 68 claimants, 256 claims, **1,550.4 s** of
child time, the two halves dividing **775.2 s / 775.2 s** -- **0.0%** apart, which LPT only reaches when the
prices are the same size -- and the dearest claimant at **171.8 s, 11.1%** of the battery, where it was 23.6%.

A single claim, measured twice in the same process minutes apart (`measure-ci-baseline.mjs:1043`, claimed by
`ci-budget.test.ts`): **1,375 ms** aimed at its witness, **5,270 ms** against its whole file, **7,868 ms** for the
file's baseline.

**Six things this round got wrong.**

1. **A line number is an identity, so adding a function to a script moves sites.** `failedTests` went into
   `site-proofs.mjs`, which shifted every line below it; eleven claims in the two files that prove *this*
   instrument stopped being reached, and the battery refused the tree -- *"passed with the exit hollowed but
   never recorded the mutant"* -- twice, before the inventory was re-derived. The deriver carried all 152 site
   annotations and all 118 throw annotations by content, which is what it is for.
2. **The witness was first recorded as the full name, and no file contains a full name.** vitest joins the suite
   titles to the test's title with a space, so `scripts/apply-pins.mjs · pinning measured digests refuses to pin
   an id the registry does not contain` is a `describe` and an `it` on two different lines. The artifact's own
   case -- "the name is one the claimant contains" -- failed on **256 of 256** rows: a check that accuses a
   file it has just written. The reader now returns the **title**, which is the one string the source has.
3. **And then it failed on two more rows, for two different reasons.** A title with an apostrophe is written
   `it('… the repository\'s')`, so the literal differs from the report by the escape; and a title built from a
   template (`it(\`prints '${word}' …\`)`) appears nowhere in the source at all. The literal check is
   impossible for both, so it was removed rather than narrowed to the files it happens to work on, and the reason
   is written where the case would have been. Staleness is held by the run instead: a missed aim is measured
   against the whole file and counted.
4. **An assertion survived the world it described.** `loads[0] <= loads[1]` said "shard 1/2 is the cheaper half,
   because it also carries the 22 s claims battery". While the halves were 15% apart that was an instruction; at
   **775.2 / 775.2** it is LPT's tie-break, and it failed by 46 ms. The property is now stated on the two *jobs*
   -- the half holding the claims battery plus those 22 s against the other half -- which is the quantity the
   workflow actually spends.
5. **The fixture's witness name shared a line with the next flag.** The stand-in vitest reads a directive line,
   and `WITNESS a bound (v3.158) is twice the day ARGV` was read as a name ending in `ARGV`: the aim matched
   nothing, the run fell back, and the case read as a summary about a stale witness. The name now has a line of
   its own -- a name and a list of flags are different things and one line cannot hold both.
6. **A battery run refuses an untracked file before it measures anything.** Two of the four full runs died inside
   `unit-nouns.test.ts` because `check-repository-table` compares the tree with a `git` view of it, and the table
   the run was about to write was untracked. The same cascade ran through the published counts four times
   (122 064 -> 122 327 -> 122 338 -> 122 367) as cases were added, and each was fixed by arithmetic first and
   re-measurement second.

**The round's own numbers found a defect in the gate that reads them.** This ledger's suite rows were written
the way the corpus writes a five-digit count -- `7,091`, with a separator -- and the gate refused them:
`core tests fell from 7082 to 91`. The pair shapes were `(\d+)`, so `262 files, 7,091 tests passed` matched no
pair, fell through to the bare test count, and kept its last three digits; the file count went missing with the
separator, and the second sentence reads `null files / 91 tests`. Two of the guard's four readers already
accepted the separator -- the census `COUNT_PHRASE` and the `new tests` span, both `\d[\d,]*`, because that is how
this corpus writes these numbers -- and the two that decide its verdict did not. That is finding 667. The repair
is a normalisation and not a wider class, because `Number('7,091')` is `NaN`: every shape now reads its digits
through `countOf`, and the three cases state the rule rather than today's size -- a published count with
separators, a bare one (whose refusal must name the whole number, since a bare count cannot be a current-state
row), and two rows with separators where the suite grew and the old reader said it fell. The test file's own
third reader of the same rows had the same defect with the quieter failure: it matched nothing and reported
`no current-state rows found; the shape of the document changed`.

**Then CI found the aim's own blind spot, and it was not in the aim.** The first run of this round's tree
(run `45804184339`) came back red in `sensitivity-shard` (shard 2 of 2): `112 of 113` claims credited, and the
one refused was `scripts/fetch-official.mjs:1002`, claimed by `fetch-official.test.ts` -- the file the same run
had just recorded as holding the longest single test of any claimant at **8 483 ms** of its 30 000, and the file
that passed on its own and again on the next run of the same shard (`139 of 139`, `0 missed`). The battery's
sentence was true of that run and wrong about the claim: `--bail=1` ends a whole-file mutant run at its first
red, so a file whose first failure is an unrelated test never reaches the armed exit, records no mutant, and
lands in the basket written for a claimant that cannot be proved. The repair asks the question of a run that
finished -- a red claim that recorded nothing is measured once more against the whole file without `--bail` --
and it is not a second chance at a verdict: recorded-and-red credits, recorded-and-green is a survivor, and
unrecorded is the same refusal in the same words. That is finding 668, and the round would not have it without
the run: two fixtures prove the halves, and neither of them was written before CI went red.

**Falsification.** Seven mutation groups, seven red, no survivors, each restored to a byte-identical file
(`md5`): the aim passed unescaped; an aim trusted without asking whether *the aimed test* failed; the witness
read from `fullName`; the table written with no witnesses; the table read only by a shard; a missed aim not
counted; the aim not passed to the run at all. The first four are the ones that would have shipped a battery
that was cheap and wrong. The doc-counts gate has its own battery, and the separator earned it an entry:
restoring `Number(text)` in place of the normalisation makes the new cases red, **15 injections, 15 caught,
0 survived, 0 inert**, with the gate restored to a byte-identical file afterwards.

**The local readings.** `pnpm docs:check` 23 steps green; `typecheck` 0; `lint` 0 (`verify-site-proofs`: 256
claims across 68 files, every claim reached by the file that names it); core **262 files / 7,096 cases**, cli
**4 / 187**, repo **266 / 7,283**; 152 sites, 118 throws, 152 of 152 and 118 of 118 annotations carried.

**The seconds are a session's; the ordering is the tree's.** One battery, one tree, one box, three readings:
**3,061.7 s** before any claim carried a witness, **924.2 s** with every claim aimed in the session that wrote the
first table, and **417.7 s** and then **420.6 s** in two quiet runs at the default pool of four. The tables those runs
priced total **2,632.1 s**, **1,550.4 s**, **715.8 s** and **724.7 s**. A **2.2x** spread between two of them is larger than the effect
either was measuring, so this round claims the ratio it took *within* one session and the ordering it saw in all
three -- `ci-budget.test.ts` first, and **29% -> 16%** of the mutant time -- and refuses to claim the seconds. A
duration taken once, on a box whose load is not part of the record, is a price with an unstated denominator. The
division reads only the ordering, which is why the split survives it: the two halves are **0.0%** apart in all
three tables.

**What the round did not decide.** Whether the table should carry a witness for a claim it prices but never
measured: today a claim with no row is measured against its whole file, which is correct and slow, and the two
claims in that state after the first aimed run were fixed by the next one. Nor whether the aim is worth its
complexity at a *small* claimant: a file with one claim and a two-second runtime saves one run of two seconds,
and the two extra arguments it carries are worth more than that. The threshold is not written down, because the
mechanism costs nothing when it misses.

**Reading 55: the aim held on the shards, and the run did not get shorter.** The first run of this tree
(`45828223563` on `683bd91`) came back **9 of 9** and is the fifty-fifth reading. The two shard steps -- the same
command, in the same two jobs, with one table different -- read **131 s** and **113 s**, against **427 s** and
**303 s** in reading 54: shard 1 fell by **69%**, shard 2 by **63%**, and the pair from **730 s** to **244 s** of
the runner's own time. That is the ordering the local measurement promised, at a magnitude it did not promise and
this round does not claim.

The run's wall clock did not fall: **483 s -> 512 s**. In reading 54 the longest job was `sensitivity` at 473 s and
the run read 483 s; in reading 55 it is `gates-audit` at **502 s**, and the run reads 512 s. The 470 s the aim took
off the critical path was not the run's to keep, because the critical path moved to a job this round never touched
-- and moved in it by more than the noise floor: `gates-audit`'s audit shard read **171 s** in reading 54 and
**236 s** here, on a tree that changed nothing in it, while `verify` read 295 s and then 417 s and `backend` read
359 s and 36 s on the same two steps. That is the fact the four local readings gave at a smaller scale, and it is
why the ledger above quotes the shard pair rather than the run: a wall clock is the loudest number in the record and
the one least about the tree.

**What the reading says about the division, which is not a repair.** The shipped table divides **362.3 s / 362.4 s**
-- **0.0%** -- and the runner read its two work steps **152 s / 113 s**, **25.7%** apart, the heavier half being the
one that also pays the **21 s** exemption battery (`verify-claims-are-sensitive`) the placement charges to that job;
without it the two claim steps are **131 s** against **113 s**. The two *jobs*, which is the quantity
with a wall clock, read **179 s / 154 s**: **14.0%** apart, inside the 15% the round committed to -- and inside it
because shard 2's install step took **24 s** against **16 s**, which is a step this battery does not price. A
division made from one box's prices is exact in that box's units and approximate in the runner's; **30% -> 13.7%**
by the same arithmetic is the whole of what the aim bought on the halves, and the row that would finish it is a
table rebuilt from the runner's own per-file rows, which is the second history `checkShardCosts` already accepts.

**Reading 56: the same tree, read again, and every job moved.** The run of this round's own commit
(`45832206778` on `36610f7`, **9 of 9**, **536 s**) is the fifty-sixth reading, and the only thing the tree
changed under it is the two bounds a reading caused -- no command moved. The two shard steps read **109 s** and
**131 s**: **13.7%** apart in reading 55 with the first shard heavier, **16.8%** apart here with the second one
heavier. That is the answer to the question reading 55 left open, and readings 57 and 58 finish it: **124 / 180**
(**31.1%**) and **122 / 147** (**17.0%**), the second half heavier again. Four readings of nearly one tree, a gap
between **13.7%** and **31.1%** that changes sign, against a division the table makes **0.0%** apart -- so what is
left between the table and the runner is the runner's own price of each half, and no re-partitioning of the
table can close it. The row that would is the one `docs/acceptance.md` already names: a table rebuilt from the
runner's own per-file rows.

Every job moved with it, and by more than the aim had saved in any of them:

| job | reading 55 | reading 56 |
| --- | --- | --- |
| `batteries` | 376 s | **532 s** |
| `gates-audit` | 502 s | **400 s** |
| `verify` | 417 s | **281 s** |
| `batteries-heavy` | 285 s | 294 s |
| `sensitivity` + shard | 179 + 154 s | 173 + 154 s |
| `backend` | 36 s | 50 s |
| `artefacts`, `cold-tree` | 54 + 37 s | 47 + 39 s |

The gate-test battery inside those two jobs -- the same two shards, the same 69 gates -- read **197 + 236 s** in
reading 55 and **145 + 174 s** here. **A queue read from one run is a queue read from one session**: reading 55
said the head was `gates-audit`'s audit shard, and reading 56 says it is `batteries`' gate-test battery by
**132 s**. What survives both is the item, not its order: the gate-test battery is the largest single thing in the
workflow on either reading, and `verify`'s coverage step (**204 s** of its **281 s** here) is the second.

**Finding 669: the line that prices that battery was blind on the runner.** The battery prints its own cost in
two halves -- the child time it measures, and the suites' own time it reads out of the child's transcript -- and
the second half decides whether the next cut is fewer process starts or fewer tests. It printed **0.0 s of 97.2
(0 of 35)** and **0.0 s of 232.1 (0 of 34)** on the runner, in two readings, while the same shards run here read
**87.2 s of 107.6** (**35 of 35**) and **165.3 s of 185.0** (**34 of 34**). The cause is one escape: a runner's
vitest colourises, and the summary arrives as `\x1b[2m   Duration \x1b[22m 1.02s`, so `Duration\s+` crosses the
space, meets the escape and gives up. `classify` -- the reader of the same transcript, two dozen lines away -- had
been repaired for exactly this class twice; the reader beside it had not. The repair moves it into
`scripts/gate-proofs.mjs` as `suiteOwnMs`, strips **inside** it so no caller can forget, and deletes the gate's
own copy, because two readers of one transcript that keep their own patterns are two readers that can disagree.
Four cases hold the two spellings a runner produces, the `ms` unit, and a transcript that must read `null` rather
than `0`; restoring the raw read turns the two colour cases red (`expected null to be 1020`,
`expected null to be 2500`) and the file is restored byte-identical.

What the repair does not do is choose the next cut. The local halves already answer that: **81%** and **89%** of
the child time is the tests' own, so the lever is running **fewer tests per gate** -- the witness mechanism this
round built for the sites battery, applied to 69 gates that each run every test in the files that name them.

**Reading 57: the repair, read on the runner.** The run of the commit that ships it (`45837753166` on `ca27c0b`,
**9 of 9**, **467 s**) is the fifty-seventh reading, and the line it was for now reads
**80.1 s of 96.6** (`35 of 35`) and **177.1 s of 197.7** (`34 of 34`) where the two readings before it read
**0.0 s of 97.2** and **0.0 s of 232.1**. That is **83%** and **90%** of the child time in the tests themselves,
which is the same answer this box gave (**81%** and **89%**) and the first time the runner has given one at all:
the lever is fewer tests per gate, and the number that says so is no longer a zero.

The queue moved again, and the point is that it keeps moving: `gates-audit` **463 s**, `batteries` **351 s**,
`verify` **340 s**, `batteries-heavy` **275 s**, `sensitivity-shard` **203 s**. Three readings of one round now
put three different jobs first -- `gates-audit` (55), `batteries` (56), `gates-audit` (57) -- on trees whose
commands differ only by the repair of a reader. A queue is a reading of a session, and the only thing this
ledger will keep saying about it is which item is largest on every reading: the gate-test battery.

### Readings

> Ledger for `v3.158`.

| item | value |
| --- | --- |
| CI | run `45839530127` on `83fb818`: **9 of 9 jobs success**, 90 steps, reading **58**, **561 s** of wall clock -- the run of the commit that recorded reading 57, and the third reading of the repaired cost line. Its predecessors are the round: `45828223563` (reading **55**, the tree that shipped the witness), `45832206778` (reading **56**, that tree plus the two bound repairs), `45837753166` (reading **57**, the repair of finding 669). Each is 9 of 9 and each moved every job -- `batteries` **376 -> 532 -> 351 -> 558 s**, `gates-audit` **502 -> 400 -> 463 -> 513 s**, `verify` **417 -> 281 -> 340 -> 330 s** -- and the shard pair read **131 / 113**, **109 / 131**, **124 / 180** and **122 / 147 s**, which is **13.7%**, **16.8%**, **31.1%** and **17.0%** by the same arithmetic. The run after this row's commit is 9 of 9 and is not a reading: it measures a tree whose only difference is this recording |
| the aim, read on the runner | reading 54 -> 55, the same two jobs and the same command: `sensitivity` **427 s -> 131 s**, `sensitivity-shard` **303 s -> 113 s**; the pair **730 s -> 244 s** of the runner's time, where this box read **3,061.7 s -> 924.2 s** within one session and **420.6 s** alone |
| what the runner says about the division | the table divides **362.3 s / 362.4 s** (**0.0%**); the runner's work steps read **152 s / 113 s** (**25.7%**, the heavier one carrying the **21 s** exemption battery) and its two jobs read **179 s / 154 s** (**14.0%**, inside the 15% the round commits to, because shard 2's install took 24 s against 16 s). The same pair read **30%** in reading 54 by the same arithmetic |
| the same halves, read again | the claim step of each shard, readings 55 to 58: **131 / 113 s** (**13.7%**, first half heavier), **109 / 131 s** (**16.8%**), **124 / 180 s** (**31.1%**) and **122 / 147 s** (**17.0%**), the second half heavier in three of the four. One battery, one division the table makes **0.0%** apart, and a gap that changes sign and size between readings of nearly the same tree: what is left between the table and the runner is the runner's own price, and it is larger than any re-partitioning the table could do |
| the battery's own cost line | what the gate-test battery said its suites spent, here and on the runner: **87.2 s of 107.6** (`35 of 35`) and **165.3 s of 185.0** (`34 of 34`) measured on this box, against **0.0 s of 97.2** (`0 of 35`) and **0.0 s of 232.1** (`0 of 34`) on the runner in two readings -- finding 669, an escape between `Duration\s+` and the digits, and the half of the line that names the lever was unreadable where the lever is paid for |
| the repaired line, read on the runner | reading 57: **80.1 s of 96.6** (`35 of 35`) and **177.1 s of 197.7** (`34 of 34`) -- **83%** and **90%** of the child time inside the tests, against this box's **81%** and **89%**, and against **0.0 s** in the two readings before it. The lever the line exists to name is the tests, which is why the next cut is a witness per gate rather than a shard or a boot |
| the run's wall clock | **512 s**, 29 s more than reading 54's **483 s**: the longest job moved from `sensitivity` (**473 s -> 179 s**) to `gates-audit` (**399 s -> 502 s**). Every job in the pair moved by more than the aim saved -- `verify` 295 -> 417 s, `backend` 359 -> 36 s -- which is why the ledger quotes the shard pair and not the run |
| the queue, as two readings read it | reading 55 put `gates-audit` (**502 s**) first and reading 56 put `batteries` (**532 s**) first; what survives both is the item rather than the order -- the gate-test battery (**197 + 236 s** in reading 55, **145 + 174 s** in reading 56), then `verify`'s coverage step (**204 s** of its **281 s**), then the audit shard |
| the battery, before the aim | 256 mutant runs, **3,061.7 s** of child time inside **7.8 min** of wall clock; the dearest claimant **29%** of that |
| the battery, with the aim | 256 mutant runs, **924.2 s** inside **3.3 min** on the same session and the same pool; the dearest claimant **16%**; **256 of 256** aims held |
| the battery, alone at the default pool | 256 mutant runs, **420.6 s** inside **3.1 min** at four claimants at a time, 325 runs in all with the 68 baselines: the reading this table is written from, taken on an idle box |
| the table it wrote | 68 claimants, 256 claims, **724.7 s** of child time -- **420.6 s** of it the 256 mutant runs and **304.1 s** the 68 baselines; halves **362.3 s / 362.4 s** (**0.0%**, 34 claimants each); dearest `ci-budget.test.ts` at **66.4 s**, **15.8%** of the mutant time and **9.2%** of the whole, where the table v3.157 shipped had it at **23.6%** of the whole |
| the table this commit ships | rebuilt here because the battery's claim keys are `file:line` and this round moved ten of them: 68 claimants, 256 claims, **785.1 s** of child time (**481.4 s** of mutant runs inside **3.3 min**, the rest the 68 baselines), halves **392.5 s / 392.6 s** (**0.0%**, 34 each), dearest `gates-are-testable-is-enumerated.test.ts` at **95.9 s**, **12.2%** of the whole and **17%** of the mutant time. A table whose keys are line numbers is a measurement of a tree, not of an inventory: the same 256 claims, re-keyed, are the only way it can describe this commit |
| the same battery, four readings | before the aim **3,061.7 s**; aimed in the session that built the first table **924.2 s**; aimed and alone **417.7 s**, then **420.6 s** on the rebuild the table below ships from. The four tables those runs priced total **2,632.1 s**, **1,550.4 s**, **715.8 s** and **724.7 s** -- one tree, one instrument, a **2.2x** spread between the widest pair. What is stable is the ordering: `ci-budget.test.ts` first in all three, and **29% -> 16%** of the mutant time |
| one claim, two forms | `measure-ci-baseline.mjs:1043` claimed by `ci-budget.test.ts`: **1,375 ms** aimed at its witness, **5,270 ms** against its whole file, **7,868 ms** for the file's baseline |
| what the previous table priced | 68 claimants, **2,632.1 s** (**2,180.2 s** mutant, **451.9 s** baseline), of which `ci-budget.test.ts` (**620.8 s**, 30 claims) and `publish.test.ts` (**565.0 s**, 29 claims) were **45%** -- and readings 53/54 read the same partition 0.1% and then 30% apart |
| the declarations run 45841748590 asked for | **1 334 ms** and **1 026 ms** on the runner against **301 ms** and **133 ms** here -- **4.4x** and **7.7x**, the multiplier of a box shared with three other workers. `SUITE_BUDGET_MS = 10 000` is now stated on the **3** suites of `verify-sites-are-sensitive.test.ts` that spawn the shipped gate and on all **27** top-level suites of `ci-budget.test.ts`, because the gate holds a file to *half* its declaration and **27x** -- the largest multiplier this tree has measured for a process-spawning file -- is what turns 301 ms into 8 127 ms; Test lines **122,574 -> 122,621**, all of the difference a declaration |
| `core` test suite | **262 files, 7,100 tests passed** (at v3.158) |
| `cli` test suite | **4 files, 187 tests passed** (at v3.158) |
| repo test suite | **266 files, 7,287 tests passed** (at v3.158) |
| coverage | core **99.98 / 99.95 / 100 / 99.98**, cli **100 / 100 / 100 / 100** |
| mutation | **7 groups, 7 red, 0 survivors**: the aim passed unescaped, an aim trusted without asking whether *the aimed test* failed, the witness read from `fullName`, the table written with no witnesses, the table read only by a shard, a missed aim not counted, the aim not passed to the run -- each restored to an identical `md5` |
| new tests | **7,082 -> 7,100, +18**: the failed-test reader (the title, the pending tests after a bail, an empty name, a report it cannot parse), an aim that holds and the escaped pattern on its argv, an aim that misses and is measured against the whole file, the witness written into the table, and the two artifacts cases (a name for every claim; a name that belongs to the file that makes the claim), plus the three the round's own separator found: a published count written `7,094`, a bare count written the same way, and two rows with separators that grew where the digit-by-digit reader said they fell, and finding 668's two halves: a file that stops at an earlier red while bailing is credited from the whole-file run, and one that records nothing however it is run stays refused |

## v3.159 — a budget is read where the test is written

The round before this one ended with two declarations and the sentence `check-test-budgets` printed for a file that
states no budget. Reading that gate's reader against its own comment found two defects, both latent, both in the
question "what clock is this test given". `suiteBudget` was documented as *"the budget a `describe` states, which is
the one the test runs under"* and returned the **first** `describe` in the file -- so a test written in an unbudgeted
suite of a file whose first suite states 120 000 was measured against 120 000, and the floor rule could not fire on
it either, because the file "stated a budget". Two files in this tree are that shape: `gate-steps.test.ts` (21
top-level suites, one stating 4 000 ms, and its slowest test 212 ms in another) read `4 000 ms, the one its suite
states`, and `probe-built-module-guards.test.ts` (30 000 ms on two tests positionally, on no suite, slowest 317 ms)
read `30 000 ms, the largest number the file states`. Neither verdict was wrong; both sentences were.

The second defect is the module's own recurring one. Its header lists four spellings and says a reader that knows
fewer of them "fails in the direction of a false red and this repository has paid for that three times". There are
five: `vi.setConfig({ testTimeout: 15_000 })`, which `site-proofs.mjs::testBudgetDeclarations` has read since v3.155
because the gate-test battery has to price a claimant's budget. A file whose only declaration was that one priced at
15 000 ms to the battery and as *states no budget* to this gate -- a false red manufactured by two readers of one
question. No file uses the spelling today, which is what makes it a finding rather than a red run.

The repair resolves the position instead of guessing it -- `testOffset` by title and, where a title appears twice, by
the chain of `describe` titles a report prints in front of it; `suiteBudgetOf` innermost; `setConfigBudget` as an arm
of its own with its own sentence -- and the two sentences that were false are rewritten: the last arm now says
`neither the test nor the suite it is written in states a budget`, and the summary's counter counts files rather than
readings. **2 of 262** readings change on this tree and **0** verdicts. The cost table was rebuilt a fourth time
because its keys are `file:line` and this round moved three of them.

| | |
| --- | --- |
### Readings

> Ledger for `v3.159`.

| item | value |
| --- | --- |
| the reading before the repair | `4 000 ms, the one its suite states` for a **212 ms** test in `gate-steps.test.ts` -- 21 top-level suites, **1** stating a timeout -- and `30 000 ms, the largest number the file states` for a **317 ms** test in `probe-built-module-guards.test.ts`, whose two suites state neither |
| the reading after it | both `{ ms: 0, statedBy: 'none' }`: **2 of 262** readings change and **0** verdicts, because both tests are far under the 1 000 ms floor -- and the arm they now take is the one that asks for a declaration the next time one of them reaches it |
| the sentence and the counter that had to move with it | `the file states no budget` became `neither the test nor the suite it is written in states a budget`, because after the repair a file can state one on a sibling; `N state a budget` counted readings rather than files and now counts the source -- **44**, of which **20** hold a test at or above 1 000 ms |
| the fifth spelling | `vi.setConfig({ testTimeout })` was read by `site-proofs.mjs` and by nothing else, so a file declaring only that priced at **15 000 ms** to the gate-test battery and as *states no budget* here, which is the loud direction: the floor rule demanded the budget the file already stated. Latent -- no file in the tree uses it -- and now the `file` arm with its own sentence |
| the cost table, rebuilt | `--costs` twice, because a table keyed `file:line` moves when a line moves and this round moved ten: 68 claimants, 256 claims, **746.2 s** of child time (**439.7 s** of mutant runs inside **3.2 min**), dearest `ci-budget.test.ts` at **16%** |
| the tree, per file | `check-test-budgets` reads 262 files and 7,109 tests: **44** state a budget, **11** of them on the test that is slowest, **20** hold a test at or above 1 000 ms, and the closest to its budget is `step-process.test.ts` at **43%** of 8 000 ms |
| CI | run `45853859064` on `67ab0a5`: **9 of 9 jobs success**, **551 s** of wall clock -- the run of the commit that shipped this round's reader, and reading **60**. Longest job `batteries` **547 s**, then `gates-audit` **515 s**; inside `batteries` the gate-test battery alone cost **306 s** (**56%** of the job), and the divided pair read **111 / 129 s** (**16.2%**, the second half heavier) against a table that makes it 0.0% -- the sixth reading of that division, and the widest remains reading 59's **99 / 182 s** (**45.6%**) |
| the arm that judged another volume's record (672) | `check-open-list` found the newest round's record by line alone, and `v3.159`'s heading sits at the same index in `volume-22.md` as `v2.50`'s in `volume-05.md`: it printed two of `v2.50`'s residuals as this round's and never judged this round's record. The key is the pair (file, line); the shipped corpus is the falsification, and no fixture can build a collision because the volumes are read from the tree |
| `core` test suite | **262 files, 7,109 tests passed** (at v3.159) |
| `cli` test suite | **4 files, 187 tests passed** (at v3.159) |
| repo test suite | **266 files, 7,296 tests passed** (at v3.159) |
| coverage | core **99.98 / 99.95 / 100 / 99.98**, cli **100 / 100 / 100 / 100** |
| new tests | **7,100 -> 7,109, +9**: the sibling fixture and the nested inheritance with two tests of one title, the refusal to read a `timeout:` out of a suite's body, the `vi.setConfig` arm four ways, the unplaceable-title fallback, `suiteBudgetOf` on its own, and three in `check-test-budgets`: the unbudgeted sibling end to end, the child-timeout fixture, and the `describe.each` title no source spells |
| CI | run `45847128112` on `0394301`: **9 of 9 jobs success**, **455 s** of wall clock -- the round's first commit, the one that declared the two budgets run `45841748590` named, **8 of 9 -> 9 of 9**. Longest job `gates-audit` at **451 s**, then `batteries` **439 s**; the divided pair read **99 / 182 s** (**45.6%** apart, the first half lighter for the first time in five readings) against a table that makes it 0.0%, and the gate-test battery inside `batteries` cost **231 s** |

### Left open

- `O-144` · **A title is not an address: a formatted test title has no position, and the reader that needs one guesses
  the file.** v3.159 resolves the suite a test is written in by finding the call that holds it, and the only handle a
  report gives a reader is the printed title -- so `it.each([...])('rejects %s', ...)`, which prints `rejects 1`, is a
  position the reader cannot resolve, and `budgetInForce` falls back to the file's first suite budget and then to its
  largest stated number. The two guesses finding 670 removed for every other test are kept for the shape a formatted
  title makes, and no file in this tree both states a budget and holds one at or above the 1 000 ms floor, so the
  fallback is unused today.
  `[open: whether the reader should pair the nth `it.each` call with the nth printed name, or whether a file that uses
  a formatted title must state its clock on the suite -- the two answers a reader without a position can be given]`

## v3.160 — an injection is aimed at the test that noticed it

v3.159 closed with the queue read afresh and one item surviving every reading of it: the gate-test battery, 306 s of
the `batteries` job's 547 s on reading 60, and 197 + 236 s of runner time in reading 55. The ledger's own sentence
named the lever and priced it -- *81% and 89% of its child time is the tests' own, not the 69 process starts, so the
lever is running fewer tests per gate* -- and this round is that sentence, applied.

The battery proves each of its 66 injections by running **the whole test file** its gate is tested by, so an injection
is charged for its neighbours' runtime. Measured here, one process at a time and in the table's own order: **260.0 s**
across 65 injections, of which `check-cli-reference.test.ts` -- five injections, ten tests that each spawn the real
CLI -- is **120.6 s, 46.4%**, `gen-examples.test.ts` 42.7 s (16.4%), `check-official-roundtrip.test.ts` 33.7 s
(13.0%). `CLIREF 5` spends 24.4 s proving one guard, and 16 s of that belong to tests it never looks at.

The repair is the device v3.158 built for the sites battery, moved to this one: the report of a run already names the
test that failed, `--witnesses` writes those titles to `golden-master/gate-witnesses.json`, and every later run appends
`-t <pattern>`. The rule that makes it safe is the asymmetry the sites battery paid for: an aimed run decides a row
**only** when it goes red with the row's declared witnesses among the failures; a green aimed run and a red one on
another test both send the row to its whole file, which decides it exactly as before. So the aim can make a run
cheaper and can never make a claim truer, and the ways it can miss are counted and printed apart.

One failing title per declared witness is enough -- `attribute` asks whether each witness is among the failures -- so
the table keeps the first title containing each and drops the rest: **189 titles to 78**, which is exactly the number
of witnesses the 65 rows declare.

Then the run itself found the defect the first table had. The reporter prints a failed test as
`suite · name > title` (`getTestName` joins with ` > `) and `-t` matches `getTaskFullName`, which joins the same
segments with a **space** -- so every aim of the first table missed: **0 held, 65 missed (no_red 65)**, 77 s of
measurement turned into 150 s. Measured on `check-readme-sample.test.ts`: the printed form gives `1 skipped,
9 skipped`, the space-joined form gives `1 passed | 8 skipped`, and both exit 0. The same form, one layer over, made
the reconciliation accuse **65 of 65** rows of holding a title no test file contains -- the printed chain is never one
string in a source that writes `describe('a · b')` and `it('c')` separately.

The round's own run is where a claim of this size has to be read, and the first one closed nothing: **run `45927182692` on
`14d62769`** ran all nine jobs and returned **5 of 9**, because the record above was committed without the closing row
`R11` asks every round to end on. One missing line cost four jobs -- the guard refused the round, the three test files that
quote the guard's own summary went unmeasured behind it (**39** claims, in `ci-budget.test.ts`, `ci-readings.test.ts` and
`unit-nouns.test.ts`), and the site proofs will not call a claim proved by a file that did not pass, so both sensitivity
shards and the documents job went red with the guard.

That run did measure the claim, and it is the first of **two readings of one tree**: the gate-test battery's step spent
**87 s** there and **111 s** on the run that closes the round, twelve minutes later, with no line of a test or a script
differing between the two commits -- a **24 s** spread that is the machine's day rather than the tree's, and the reason
this row quotes both. Against reading 60's **306 s** the step is **2.76x** to **3.52x** cheaper, and **32%** of its job
where it was **56%**; the `batteries` job fell **547 s -> 344 s**, and the step's neighbours moved with the day too
(`Every gate can be shown to fail` read 149 s at reading 60, 116 s in the red run and 146 s in the green one). The gates
division read **146 / 241 s** in the green run against reading 60's **149 / 239 s**: the same pair, 39.4% and 37.7% apart
where the table makes it 0.0%, which is `O-145`'s number and not this round's to close.

### Readings

> Ledger for `v3.160`.

| item | value |
| --- | --- |
| the price of an injection before this round | **260.0 s** of child time for 65 injections, one process at a time: `check-cli-reference.test.ts` **120.6 s (46.4%)**, `gen-examples.test.ts` 42.7 s (16.4%), `check-official-roundtrip.test.ts` 33.7 s (13.0%), `build-example-bundle.test.ts` 17.1 s (6.6%), the other 14 files 45.9 s (17.6%) -- and the slowest single injection `CLIREF 5` at **24.4 s** |
| what the table holds now | **65 rows** (66 injections less the one declared to survive), **78 titles** -- one per declared witness, down from the **189** failing titles the first table recorded -- plus the whole-file milliseconds each row cost |
| the run after it | **260.5 s -> 77.4 s** on the same tree and machine, **3.37x**; **65 held, 0 missed**, 1 row without a witness; slowest injection **24.4 s -> 4.5 s** |
| the aim's four outcomes | red with the declared witnesses present -> the row, one run; green -> nothing, the whole file decides; red on another test -> nothing, the whole file decides; timeout -> `TIMEOUT`, unchanged. Only `CAUGHT` is ever read off an aimed run |
| the two spellings (674) | `getTestName(task, ' > ')` prints, `getTaskFullName` joins with a space and `-t` matches that: measured `1 skipped, 9 skipped` against `1 passed | 8 skipped`, both exit 0. The first table's aims were all misses (**0 held, 65 missed**), and its whole-title reconciliation reported **65 of 65** rows as holding a title no file has. The table keeps the printed form; `aim_pattern` substitutes; the check compares the last segment |
| falsification, nine mutations | `plans = [None]` **5** red; `if False:` for the aim rule **6**; `escape_pattern` returning the name **1**; no ` > ` -> space join **1**; the whole title compared **1** (the shipped-table case); `named_tests` at the write site **1**; the writing run aiming too **2**; the missing-row check removed **1**; `aimed_held += 1` removed **1**. Source restored byte-identical after each |
| what is left inside the battery | **77.4 s**, of which ~41 s is `CLIREF`'s five witness tests (1.4--4.5 s each) and the rest is 66 process starts at ~0.9 s: the floor is the **number of injections**, not the tests they run |
| `core` test suite | **263 files, 7,126 tests passed** (at v3.160) |
| `cli` test suite | **4 files, 187 tests passed** (at v3.160) |
| repo test suite | **267 files, 7,313 tests passed** (at v3.160) |
| coverage | core **99.98 / 99.95 / 100 / 99.98**, cli **100 / 100 / 100 / 100** |
| new tests | **7,109 -> 7,126, +17** in one new file (`gate-test-battery-aim.test.ts`): the three arms of the aim driven through the shipped `_measure` with a stub runner, the counters read from that run's own summary, the writing mode's table, the escaping pair, the two spellings, the minimal cover and its unmatchable fallback, the three reconciliation faults with their positive control, and the shipped table's own reconciliation |
| the tree, per file | `check-test-budgets` reads 263 files and 7,126 tests: the file this round adds declares its own clock (`SUITE_BUDGET_MS`), and the twenty files at or above the 1 000 ms floor are read on the box that measured them |
| `Tracked files` | **685 -> 687**: the witness table and the new test file -- both counted by `check-repository-table` only once staged, which is the check that refuses a table describing the index and the worktree at once |
| CI | run `45928458435` on `b0683508`: **9 of 9 jobs success**, **519 s** of wall clock, reading **61** -- the run of the commit that closes this round, and the one the numbers above are read from: the gate-test battery's step at **111 s** against reading 60's **306 s**, the `batteries` job **547 s -> 344 s**, the gates pair **146 / 241 s**, and the run that preceded it from the same tree at **87 s** and **5 of 9**, which is the row this one replaces |

### Left open

- `O-145` · **The two shards of `verify-gates-are-testable` are divided by position, and read 97 s against 232 s.** This round paid the first half (the battery), and the artifact it built is not the one that half
  needs: the battery's table prices **injections** in a test file, and the shard divides **gates** in the inventory.
  A table of per-gate seconds could be written by the same instrument -- it already prints each subject's own
  duration, and finding 669's `suiteOwnMs` made that line readable on the runner -- and divided by the LPT rule the
  sites battery uses for its 68 claimants. The pair reads **146 / 241 s** in this round's own run and **149 / 239 s**
  in reading 60: 39.4% and 37.7% apart, where the table makes the division 0.0%.
  `[open: whether the per-gate table should be a new file or an arm of `gate-sites.json`, and whether a gate's price is
  its whole run or the arithmetic above its own suite time -- the two numbers the run already prints]`

## v3.161 — the halves of the gate audit are divided by what the gates cost

v3.160 closed with `O-145` open and one sentence in it: the two shards of `verify-gates-are-testable` are divided by
position, and read **146 s against 241 s**. The reason for position was written down twice -- in the gate and in the
workflow -- and it is a good reason about the wrong thing: *a split by measured seconds would have to be re-derived
after every run and would put the same gate in different shards on different machines*, and a plan `ci.yml` runs and a
plan a test checks have to be the same plan. Both halves are true of **live** seconds. Neither is true of a committed
table, which is the argument v3.157 already made for the sites battery one directory over.

The cost is arithmetic about two runners. The workflow's wall clock is the **slower** of the two jobs, so every second
between them is a second one runner spends waiting -- and the three readings of this pair are 40%, 38% and 39% apart
against a plan whose own arithmetic says 0.0%:

| reading | shard 1 | shard 2 | apart |
| --- | --- | --- | --- |
| 59 (`45847128112`) | 118 s | 198 s | **40.4%** |
| 60 (`45853859064`) | 149 s | 239 s | **37.7%** |
| 61 (`45928458435`) | 146 s | 241 s | **39.4%** |

The repair is the sites battery's device, moved to the gates: `--costs <path>` writes
`golden-master/gate-costs.json` from a run that measured **every** gate -- one row per gate, the milliseconds its own
nested runs cost and how many test files it ran -- and `--shard i/n` divides that table by longest-processing-time
first through the same `assignShards`/`shardLoad` pair, which is why the placement rule has one spelling rather than
two. Position's own soundness argument survives: a gate is an independent experiment, so any partition is sound, and
the union of the slices is still checkable against `--list --shard`. What changed is which partition, and that it is
now derived from a number the tree carries.

Four refusals came with it, and none of them is a fallback: a shard with no table, a table with a gate the inventory
does not have (or a row whose file count disagrees, which is a table measured on a tree that moved), `--costs` beside
`--shard` or `--list`, and `--costs` on a run that did not measure every gate. A fallback to position would be a
second partition under one name, and the halves `ci.yml` runs would stop being the halves a local `--shard` runs.

The round's own instrument also found a defect in its tests, which is the part worth keeping: `verify-sites-are-sensitive`
ran the new file's six claims and reported that the refusal for a gate `gateShardPlan` cannot price **reaches** its
exit without **depending** on it -- the assertion matched `--costs`, and `assignShards` next door refuses the same gate
with a sentence that also ends in `--costs`. Replacing the throw with success left the test green. The assertion now
names this table's own file.

The run of the commit that ships the table is reading **62**, and it returns **9 of 9** in **429 s** of wall clock with
the pair at **133 s / 163 s** -- **18.4%** apart where the plan says 0.89%. That is the honest shape of this round, and
the record keeps both numbers. The ten positional readings of this pair run 16.7% to 60.7% with a mean of 42.4%, so one
reading at 18.4% is **inside** the old spread and does not by itself prove the partition better; a table read on one
machine balances a plan and not a day, which v3.157 measured twice on one tree (0.1%, then 30%). What did change is
where the numbers come from -- two machines now divide the same way, because the partition is a pure function of a file
in the tree -- and what the round cost: **296 s** of gates time against reading 61's **387 s** on the same 69 gates.
The reading also moved the queue: the longest job is now `verify` at **429 s**, with `gates-audit` at **417 s** behind
it and no longer the head.

### Readings

> Ledger for `v3.161`.

| item | value |
| --- | --- |
| the division before this round | by position: **106.0 s / 181.6 s** of the shipped table's **287.5 s** -- **41.6%** apart -- and **118 / 198**, **149 / 239**, **146 / 241 s** on the three readings above |
| what divides it now | `golden-master/gate-costs.json`: **69** gates, **287.5 s** of child time on this box, dearest `check-official.mjs` at **28.4 s (9.9%)**, mean **4.17 s**; the plan is **143.1 s / 144.4 s**, **0.89%** apart, 34 and 35 gates |
| the pair on the runner | reading **62** (`45935289140`, the run of the commit that ships this table): **133 s / 163 s**, **18.4%** apart, against the plan's 0.89% -- the table balanced a plan and the runner spent its own day. The ten positional readings of this pair (52 to 61) run **16.7%** to **60.7%**, mean **42.4%** and median **39.9%**, so one reading inside that spread proves nothing on its own; what it does show is the shape: **296 s** of gates time here against reading 61's **387 s**, on the same 69 gates |
| the four refusals | a shard with no table; a gate with no row; a row with no gate, or one whose file count disagrees with the tree; and `--costs` beside a shard or a list, or on a run that did not measure every gate |
| what `--costs` refuses to write | a table from a run that skipped a gate, because a table is a measurement of every subject or it is not a table -- and the sentence names the gates that were not measured |
| the partition | `--list --shard i/2` prints the slice this run would measure; the union of the slices is the inventory, no gate is in two, and neither is empty |
| falsification | eleven new tests: seven table verdicts one refusal at a time with a positive control, the LPT placement against a split that can be worked out on paper, purity and inventory order, the shipped partition and the claim that the plan is closer than position's split of the same numbers, and three spawned refusals; plus the one the sensitivity battery found in the test itself |
| `core` test suite | **264 files, 7,137 tests passed** (at v3.161) |
| coverage | core **99.98 / 99.95 / 100 / 99.98**, cli **100 / 100 / 100 / 100** -- unchanged by the round, which added a test file and no source line |
| `cli` test suite | **4 files, 187 tests passed** (at v3.161) |
| repo test suite | **268 files, 7,324 tests passed** (at v3.161) |
| new tests | **7,126 -> 7,137, +11** in one new file (`gate-costs.test.ts`) |
| the three counts that had to move with it | `calls / sites` in the inventory **172/152 -> 176/156** (four exits, two throws), the throw baskets **118 -> 120**, and the sites cost table rebuilt because the new file proves six sites and a claimant with no row cannot be divided |
| `Tracked files` | **687 -> 689**: the cost table and the new test file |
| CI | run `45935289140` on `ebedaba7`: **9 of 9 jobs success**, **429 s** of wall clock, reading **62** -- the run of the commit that ships this table, and the first run whose halves were placed by it. The pair read **133 s / 163 s**, and the longest job is now `verify` at **429 s** with `gates-audit` **417 s** behind it |

### Left open

- `O-146` · **The gates' table is one machine's afternoon, and nothing notices when it stops describing the tree.**
  `checkGateCosts` holds the gate set and each gate's file count, so a gate that arrives or loses a naming file is
  refused -- but a test file that grows under the same name leaves a table that is stale in the direction the verdict
  calls fine, and the plan then balances two halves by numbers from an older tree. The sites table has had the same
  hole since v3.157 and the same silence.
  `[open: whether the age of a table should be a verdict (`measured` older than N rounds is refused) or a printed
  reading the reviewer reads, and whether a re-measure can be asked of CI rather than of a person]`

---

## v3.162 — the table says which tree it priced, and every run reads its own half against it

v3.161 closed with `O-146` and one sentence: the table pins the **set** of test files that name each gate, and
every round moves the tree *inside* that set -- a file grows, a case is added, a fixture doubles -- so a gate whose
tests got twice as heavy under the same filename leaves a table that is stale in the direction the file count calls
fine. The round's own instrument then said how much that costs before this round touched anything: the `--costs` run
below printed **`half: the table prices the gate(s) this run measured at 287.5 s; they spent 282.9 s (-1.6%)`** --
the table v3.161 shipped, weighed against this afternoon's tree, in one line.

The shape of the repair is the one the open item asked for and the answer is the one it doubted: **a reading, not a
verdict**. A verdict on the line count would make every round that edits one gate's test file an order to re-measure
all 69 on a laptop (**282.9 s** here), and the tree cannot tell a one-line comment from a threefold growth -- so the
verdict would fire on the harmless case with the same force as the harmful one, and a gate that fires on the harmless
case is a gate that gets re-measured by habit. What is a verdict is the **shape**: a row without `lines` is refused,
because a run would otherwise print a total that silently left a gate out, and blank reads as zero. What the count
buys is two sentences printed by every run that measured anything -- the drift of the tree from the table, and the
seconds this half spent against the price the table put on it. The second one is the one that matters: v3.157 measured
a table balancing one tree at 0.1% and the next reading of it at 30%, and reading 62 measured a plan at 0.89% while
the runner read 18.4%. A plan is of a table; the seconds are of a machine. Now both are on screen.

The table was re-measured rather than patched, because the fingerprint has to describe the same tree as the
milliseconds: **69** gates, **282,873 ms** of child time, **231,939** lines across them (summed per gate, so a file
that names three gates counts three times), **235** file executions over 95 distinct files, dearest
`check-official.mjs` at **27,857 ms (9.8%)**. The plan is **140.8 s / 142.1 s**, **0.89%** apart; the same numbers
split by position are **102.7 / 180.1**, **43.0%** apart.

Two counting accidents came with the insertion, and both are the kind this log exists to notice. `gate-sites.json`
renumbered: 17 rows moved by the lines added above them, and **one annotation did not carry** -- the "no cost table"
exit, whose condition changed from `catch` to `table === undefined` when the parse moved into `costTable()`. It was
re-carried by identity and re-proved by the same test, which is why the spawn case for it is named in the record.
`sensitivity-costs.json` had **16** witness keys keyed by `script:line`: 15 renumbered by site identity (the
condition and the diagnostic are the identity; the line is an address) and 1 by the same identity change. The battery
then rebuilt the measured seconds itself, so the keys are derived rather than typed.

### Readings

> Ledger for `v3.162`.

| item | value |
| --- | --- |
| what a row carries now | `ms`, `files`, and `lines` -- the last being the fingerprint, the lines its naming files held when the table was written |
| the table this round ships | **69** gates, **282,873 ms** of child time on this box, **231,939** lines, **235** file executions over **95** distinct files; dearest `check-official.mjs` **27,857 ms (9.8%)** |
| the plan | **140.8 s / 142.1 s**, **0.89%** apart, 34 and 35 gates; the same numbers by position **102.7 / 180.1 s**, **43.0%** apart |
| the instrument's first reading | before this round changed anything, the `--costs` run weighed the shipped table against the tree: **287.5 s** priced, **282.9 s** spent, **-1.6%** |
| the drift reading | printed by every run that measured a gate: the table's lines against this tree's, as a total and as the widest gate, so a price that has stopped describing its files is visible without a re-measure |
| the half reading | printed beside it: the price the table put on the gates this run measured, against the seconds they spent. It is the number reading 62 could only be read by hand |
| the pair, second reading and third | readings **63** and **64** measure the partition v3.161 made on one tree: **196 / 195 s** (**0.5%**) and **193 / 195 s** (**1.0%**) against a plan that says **0.89%**, where reading **62** read **133 / 163 s** (**18.4%**). Three readings, one partition: the balance is a property of the plan, and the totals -- **296 s**, **391 s**, **388 s** of gates time -- are the machine's day |
| the three refusals | a row with no `lines`, a `lines` that is not a count, and a `lines` of zero -- the shape, not the value |
| what is deliberately not a verdict | the value of `lines`. A verdict there costs a 282.9 s re-measure per round that edits a test file and cannot tell a comment from a growth |
| falsification | two new tests and three new refusals: the drift arithmetic (150 lines to 350 is **+133%**, and the first version of the assertion said +100% -- the run caught the test, not the code), the ordering by size, the unread end (`to: null`) ranked by its whole size, `null` for nothing to compare, and a spawned shard run printing both sentences |
| `core` test suite | **264 files, 7,139 tests passed** (at v3.162) |
| coverage | core **99.98 / 99.95 / 100 / 99.98**, cli **100 / 100 / 100 / 100** -- statements, branches, functions and lines, read from `coverage/coverage-summary.json`; the round added tests and no source line, so the four figures are the ones v3.161 closed on |
| `cli` test suite | **4 files, 187 tests passed** (at v3.162) |
| repo test suite | **268 files, 7,326 tests passed** (at v3.162) |
| new tests | **7,137 -> 7,139, +2** in `gate-costs.test.ts` |
| test lines | **123,751 -> 123,859 core** |
| `Tracked files` | **689**, unchanged: the round added no file, and the two tables it rewrote were already tracked |
| CI | run `45940813606` on `7275eb38`: **9 of 9 jobs success**, **470 s** of wall clock (the longest job is `gates-audit` at **470 s**, `verify` **437 s** and `batteries-heavy` **399 s** behind it), reading **64** -- the run of the commit that ships this round, and the third reading of the partition v3.161 made |

### Left open

- `O-147` · **The workflow's longest job is now the one that runs two unrelated things in series.**
  Reading 62 put `verify` at **429 s** -- `typecheck` 10 s, `lint` **186 s**, `coverage` **206 s** in one job -- with
  `gates-audit` **417 s** behind it. The two halves are independent; run as two jobs they would cost one install and
  one build more (**~20 s**) and cut the workflow's wall clock by about **200 s**. What stops it being free is the
  ledger: the job count is what every `R11` row's denominator is written against, what the nine ceilings are counted
  in, and what `check-ci-budget` reconciles the bounds of. `[open: whether the wall clock should be bought by
  changing the shape of the queue -- and if so, which of the two jobs the shared prefix belongs to]`

## v3.163 — the head of the queue is a shape, and a request that did not state its ceiling

`O-147` asked whether the wall clock should be bought by changing the shape of the queue, and it
described the purchase from one reading: *"`verify` **429 s** -- `typecheck` 10 s, `lint` **186 s**,
`coverage` **206 s** in one job -- with `gates-audit` **417 s** behind it"*. The answer this round
gives is not yes and not no. It is that the entry priced one job and the thing to price is the
**shape six jobs share**, and that no single half of the purchase is worth making.

The ledger first. Every job's body, from reading 64 (`45940813606` on `7275eb38`), with the six
setup steps (checkout, Node, pnpm, install, shells, build) subtracted:

| job | total | prefix | body | steps in the body | heaviest step |
| --- | --- | --- | --- | --- | --- |
| `gates-audit` | **470 s** | 21 s | **443 s** | 4 | gate-fail shard 2 of 2, **195 s** |
| `verify` | 437 s | 20 s | 413 s | 6 | coverage, **211 s** |
| `batteries-heavy` | 399 s | 19 s | 376 s | 2 | type-miss probe, **261 s** |
| `batteries` | 394 s | 20 s | 371 s | 11 | gate-fail shard 1 of 2, **193 s** |
| `sensitivity` | 178 s | 37 s | 134 s | 2 | proved exits, **117 s** |
| `sensitivity-shard` | 150 s | 30 s | 115 s | 1 | proved exits shard 2 of 2, **115 s** |
| `artefacts` | 61 s | 21 s | 35 s | 7 | doc guards, 17 s |
| `backend` | 41 s | 11 s | 26 s | 2 | a foreign backend, 20 s |
| `cold-tree` | 22 s | 15 s | 3 s | 3 | doc guards, 2 s |

Five of those jobs are the same object: a **series of independent mutation batteries**, each
paying one prefix to run subjects that never read each other's results. Their bodies total
**1,439 s** across five lanes -- **443, 376, 371, 134, 115** -- and the workflow's wall clock is
the heaviest lane plus its prefix. So the entry's premise was a reading of a head that moves: of
the last eight readings, **five** put `gates-audit` first and **one** put `verify` first, and the
v3.162 record already said so in its own words (*"the queue's head moved twice across three
runs"*).

Three prices, each measurable from that table:

| move | new head | wall clock | bought |
| --- | --- | --- | --- |
| split `verify` into lint+typecheck and coverage, change nothing else | still `gates-audit` at **470 s** | **470 s** | **0 s** |
| rebalance the five battery lanes only, keep nine jobs | `verify` at **437 s** | **437 s** | **33 s** |
| both: lanes balanced to **1,439 / 5 = 288 s** + prefix, and `verify` cut to **235 s** | **309 s** | **309 s** | **161 s** |

The middle row is why the entry as written is refused: `verify` split alone buys nothing, because
the head was never `verify` on the tree the split would ship to. The bottom row is why it is not
closed as "no": the purchase exists, it costs one more install and build (**~20 s**, which is
already inside the 309 s) plus the ledger work of a tenth job, and it is worth **161 s** -- but
only as a pair, and only with the lanes rebalanced by a committed table rather than by hand,
because a hand-placed assignment is the second partition this repository keeps refusing
(`assignShards` exists so that there is one). `O-148` is that sentence with its numbers.

Two defects arrived in the same pass, both from auditing the calls this repository makes rather
than the files it ships.

**The adapters that own the token limit did not state one** (finding 677). `anthropic.ts` sends
`max_tokens` on every body; `buildOpenAiCompatibleRequest` -- the core behind DeepSeek and OpenAI,
so two of the three shipped adapters -- sent none, and `scripts/derive-fault-golden.mjs` justified
having no cap of its own by saying *"the concrete adapters own their own token limits"*. The
ceiling is now a required field of the request with `OPENAI_COMPATIBLE_DEFAULT_MAX_TOKENS = 4096`,
all three adapters and the registry accept and forward `maxTokens`, and the arc of a run is
computable in advance: **34** samples, **19,779** characters of prompt, **34 x 4096 = 139,264**
completion tokens at the ceiling.

**A percentage divided two populations** (finding 678). `gateDrift`'s `change` summed the tree's
lines over the gates it could count and divided by the table's lines over every row, so one unread
gate of three made the reading say the tree had fallen **6.7%** -- the exact arithmetic its own
`moved` list refuses with `to: null`. `readLines` is now the denominator, `read` and `unread` name
the split, and the printed sentence says which population the percentage is over. It was latent
from the day it was written: the one caller hands over a tree keyed exactly as the table, so the
branch could not be reached -- which is why it is written down here rather than left to the next
caller to discover.

The edits had their own counting consequences, and they were re-derived rather than trusted. Inserting the ceiling and
the population moved **17** rows of `golden-master/gate-sites.json`; re-running the deriver carried **156 of 156**
failure-site annotations and **120 of 120** throw annotations by identity, and the inventory did not move (**156** sites
across **69** of **103** scripts). `golden-master/sensitivity-costs.json` keys its witnesses by `script:line`, so every
key moved: **143** rows were renumbered by re-running the battery that writes the table (`--costs`, **69** claimants,
**262** claims, **734.4 s** of child time, **332** runs in **3.1 min**), which re-proved all **262** claims on its way
-- **149** exits hollowed and **113** throws removed, and a test goes red for every one of them.

### Readings

> Ledger for `v3.163`.

| item | value |
| --- | --- |
| the queue, by body | **1,439 s** of battery work across five lanes: `gates-audit` **443** (4 batteries), `batteries-heavy` **376** (2), `batteries` **371** (11), `sensitivity` **134** (2), `sensitivity-shard` **115** (1); `verify`'s body is **413 s** in 6 steps and is not a battery lane |
| the head, over eight readings | `gates-audit` first in **five** (`45837753166`, `45847128112`, `45928458435`, `45936208473`, `45940813606`), `batteries` first in **two**, `verify` first in **one** (`45935289140`, the reading `O-147` was written from) |
| the three prices | split alone **0 s** (head stays `gates-audit`); rebalance alone **33 s** (head becomes `verify`); both **161 s** (head **309 s**) |
| what the LLM body states now | `max_tokens`, defaulting to **4096**, on all three adapters; `LlmProviderOptions` carries it and `createLlmProvider` forwards it |
| what a run can be priced at | **34** requests x **4096** tokens = **139,264** completion tokens at the ceiling, over **19,779** characters of prompt in `golden-master/fault-extraction/samples.json`, paced at **250 ms** |
| what the LLM body still does not state | a timeout -- `O-149`, because a ceiling on tokens does not bound a wait |
| the drift reading, before and after | a tree that could count two of three gates read **-6.7%**; it now reads **0.0%** over the **2** gates both sides counted, with **1** named as uncounted |
| falsification | the two request bodies this tree already pinned went red the moment `max_tokens` arrived, and a third test reads the wire (`maxTokens: 512` must post **512**); the drift test now pins `read`, `unread`, `readLines` and `change` where it pinned only `moved` and `treeLines`, and the spawned shard run pins the sentence by its numbers |
| the edits' own counting consequences | `gate-sites.json` moved **17** rows and carried **156 / 156** site annotations and **120 / 120** throw annotations by identity (inventory unchanged: **156** sites, **69** scripts); `sensitivity-costs.json` renumbered **143** witness keys, re-derived by `--costs` (**69** claimants, **262** claims, **734.4 s**, **332** runs in **3.1 min**) and re-proved all **262** claims (**149** exits hollowed, **113** throws removed) |
| `core` test suite | **264 files, 7,143 tests passed** (as of this commit) |
| coverage | core **99.98 / 99.95 / 100 / 99.98**, cli **100 / 100 / 100 / 100** -- statements, branches, functions and lines, read from `coverage/coverage-summary.json` |
| `cli` test suite | **4 files, 187 tests passed** (as of this commit) |
| repo test suite | **268 files, 7,330 tests passed** (as of this commit) |
| new tests | **7,139 -> 7,143, +4**: one for the ceiling on the wire, one for each adapter passing it down, and one for the exported constant |
| test lines | **123,859 -> 123,970 core** |
| `Tracked files` | **689**, unchanged: the round added no file |
| CI | run `45940813606` on `7275eb38`: **9 of 9 jobs success**, **470 s** of wall clock, reading **64** -- the tree this round started from, and the reading the round's own run replaces in the commit after it, as v3.161's did |

### Left open

- `O-148` · **The queue's wall clock is bounded by a series of batteries, and the shape only pays as a pair.**
  Five jobs are series of independent mutation batteries -- `gates-audit` **443 s** in four,
  `batteries-heavy` **376 s** in two, `batteries` **371 s** in eleven, `sensitivity` **134 s** in two,
  `sensitivity-shard` **115 s** in one -- and the wall clock is the heaviest lane. Splitting `verify`
  alone buys **0 s**, rebalancing the lanes alone buys **33 s**, and both buy **161 s** by bringing the
  head to **309 s**. What is left to decide is the assignment's provenance: a committed table divided
  by `assignShards` (one placement rule, the sites and gates tables already do this) or a hand-placed
  split. `[open: whether the lane-to-battery assignment is derived from a committed cost table or placed by hand -- and whether the tenth job's ledger cost is paid before or with the split of verify]`
- `O-149` · **A call states its ceiling and not its patience.**
  Every adapter now sends `max_tokens`, and none sends a timeout: an endpoint that accepts the
  connection and never answers holds the step until the job's ceiling. `anthropic.ts`,
  `openai-compat.ts` and the derive script all await `fetch` with no `AbortSignal`, so the only
  bound on a hung request is the workflow. What makes this a decision rather than a patch is the
  number: a timeout short enough to fire on a legitimate slow generation is a gate that fails on
  the harmless case, and this repository has refused that shape twice. `[open: what timeout a generation may be given, and whether it is one number for every provider or one per adapter, given that no run in this repository has ever measured a slow-but-valid completion]`
