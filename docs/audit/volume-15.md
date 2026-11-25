# Audit · volume 15

Findings 651–655, from the rounds recorded in `progress/volume-20.md` as `v3.148`, `v3.149` and `v3.150`, and
in `progress/volume-21.md` as `v3.151`.

## Finding 651 — an action is identified by the action, not by the name of the step that uses it

`commandOf` answers one question -- *what did this step run* -- and every number in
`golden-master/ci-readings.json` is filed under its answer. For a step with a `run:` block the answer was
the command's own text. For a step with a `uses:` line it was `` `step:<name>` ``, and that is not a command.
It is the label above one.

Two failures follow, and they point in opposite directions:

| what moved | what the identity saw | what `R10` then divided |
| --- | --- | --- |
| `actions/checkout@v3` → `@v4` under one step name | the same command | the new program's bound by the old program's days |
| `Check out` → `Check out the tree`, same action | two commands | the newest day alone -- the sample of one the rule exists to remove |

The first is the shape the entry (`O-132`) named. The second is the one it did not: the entry framed the
choice as "a series per version" against "say the version is not part of the identity", and both of those
keep the name, so both would have left a rename costing a series. The name was the thing doing the damage.

### The measurement, taken before the repair

Every reading records its commit, so the file at each commit can be asked what the step actually ran. One
request per tree, 39 trees, 40 readings:

| fact | value |
| --- | --- |
| step rows in the history | **3,300** |
| rows whose command is a step name | **994** |
| trees those rows were measured on | **39** |
| of the 994, rows whose own commit runs another action | **0** |

and by the action they ran:

| the action | rows |
| --- | --- |
| `actions/checkout@v4` | 318 |
| `actions/setup-node@v4` | 318 |
| `pnpm/action-setup@v4` | 318 |
| `actions/upload-artifact@v4` | 40 |

So the defect was **latent**: no reading in this repository was ever spent by a version other than the one
the tree now states, and no bound divides by any of these rows -- the first three are the prefix, which `R14`
forbids a bound of its own, and the fourth carries none. That is the same distinction `v3.146` drew about
`failure` steps: a rule that is right only because nothing has moved is a rule nobody has seen work, and the
day an action is upgraded it would be wrong with nothing to say so.

### The repair

| the question | the answer |
| --- | --- |
| what is a `uses:` step's identity | `` `uses:<owner/repo@reference>` `` -- the program, not the label |
| what happens to the rows already written | they are given the action their own commit states |
| what if a row disagrees with its commit | refused, in either direction, and nothing is written |
| what if the commit's workflow cannot be read | refused, naming the run that records that tree |

`--relabel-actions` is the mode that does the third and fourth. It is not a re-recording: the numbers stay
where they are, and only the command beside each one is replaced, from the document that has been answering
this question since `v3.147` -- the workflow at the row's own commit. Measured on the shipped file: **994 of
3,300** rows rewritten, **39** trees read. Run a second time: **0 of 3,300**, byte for byte identical, which
is the property that makes it safe to run against a file in git.

The identity reaches two places besides `R10`.

**The prefix.** `sharedPrefixOf` compares the steps every job shares, and its own docstring has said "name and
command both" since it was written -- while comparing the name and an empty string for every action step,
because it read `run:` and an action has none. The one kind of step a workflow writes most often was the one
kind whose command that rule never read. Two jobs at two versions of one action are two things, and the
prefix now stops there.

**The recorder.** A recording writes the command beside each number, and `v3.147` held the tree on disk to the
tree the run used. With the version in the identity that comparison reaches actions: a run whose step used
`@v3`, recorded against a tree at `@v4`, is drift. Nothing else in this repository could have seen it -- the
step keeps its name, its position and its inputs.

### What it does not claim

An action's `with:` block is not part of the identity, and this workflow holds the pair that leaves pooled:
`backend / Check out` clones shallow while the other seven clone the full history, and they are one series.
The choice errs in `R10`'s direction -- pooling makes the denominator the slower of the two shapes, where
splitting would let the faster shape justify a smaller bound -- and it is the same answer the file already
gave for `env:` blocks on `run:` steps. A local action (`uses: ./x`) is the residual no reading of the
workflow can close: it names a path, and the bytes behind it are not in the file. Nothing here uses one.

### What it costs

**39 requests, once.** The mode reads one document per tree rather than one per reading, because two attempts
of one run are two readings of one commit. A round that records normally pays nothing new: the identity is
computed from a file the recorder already fetches.

### The round's own defects

- **A mutation survived the test written to kill it.** "The file is written even when nothing was relabelled"
  left the suite green, because the idempotence case wrote its fixture with the same 2-space layout the mode
  writes: *left alone* and *rewritten identically* were the same bytes. The fixture is now written **compact**,
  which is a layout the mode never emits, and the mutation dies.
- **A refusal with an unreachable half.** The first draft refused a row when `row.command !== `step:<name>`
  **or** when the commit's command was itself a step name -- and the second clause could not be reached,
  because a commit's step name is the name the row is keyed by, so the equality test above had already
  continued. The condition it needed was `!theirs.command.startsWith('uses:')`: the case to refuse is a row
  that names a step where its commit runs a **command**, which no recorder in this tree ever wrote.

### Falsifications

| the mutation | reds |
| --- | --- |
| an action step is identified by its name again, so a version bump is invisible | 8 |
| the prefix compares a name and an empty string for every action step | 1 |
| the action a step uses is not carried out of the reader | 6 |
| the history is rewritten without asking what each row's commit states | 2 |
| a row that names a step where the commit runs a command is rewritten instead of refused | 1 |
| the file is written even when nothing was relabelled | 1 |
| a row no tree can place is carried rather than refused | 1 |
| a tree whose workflow cannot be read is walked as an empty tree | 4 |
| the mode is not a mode: the flag is parsed and never branches | 7 |
| the mode takes a measurement and ignores it | 1 |

**10 mutations, 32 reds**, measured on the green tree, no survivors. The seven new claims in the inventory --
one exit, which is the usage check that gained the mode's clause, and six throws -- are 7 of 7 credited by
`verify-sites-are-sensitive.mjs` (1 exit hollowed, 6 throws removed, 0 survivors). The mode's success path
ends on `process.exit(0)`, which is a call and not a site: **165** calls and **146** sites became **166** and
**146**, the first time in eleven rounds the pair has moved apart.

## Finding 652 — a day is refused for the steps it cannot place, and the floor that makes that sayable

`O-130` was opened by `v3.146`'s repair: a day whose `ci.yml` the reader could not walk became unseedable **in
full**, where `v3.145` would have appended it with a bound nobody could read. The entry offered two answers --
keep only the day's `success` steps, or let the reader return the bounds it recognised so a day is refused for
the steps it cannot place -- and the first was already refused for a *readable* day: a seed that keeps the
steps it likes deletes the slow steps of the day, and those are the denominator.

The second answer is right, and it is unsound without a floor. The reader walks two ways -- a job-and-step scan,
then a key-and-block scan per step -- and both left the lines they did not recognise **alone**. So "no refusal
for this job" did not mean "every line of this job was understood"; it meant "this reader did not look". A
bound written one space off was the shape that matters, and it was measurable on the shipped file:

| the file | steps declaring their own bound | what the reader said |
| --- | --- | --- |
| `.github/workflows/ci.yml` | **38** | nothing |
| the same file, one bound one space left | **37** | nothing |

One bound left the reading in silence. A seed built on that reading would take a step the runner killed at
that bound for a duration the command spent, which is `O-127` reached by a route nobody was watching.

The repair is two halves that only work together.

**The floor.** Every line a rule consumed is recorded; every line inside the jobs block that no rule consumed
is refused, at a step's indent or above. Ten spaces and deeper is block body -- `run:` bodies, `env:` entries,
the values of `with:` -- because no bound can be written there, and the block a body belongs to is a key the
floor has already judged. The same file now answers with one sentence naming the line, the job, and the
spelling the reader reads.

**The scopes.** The sentences are unchanged -- `errors` is what every caller prints -- and beside them each
refusal names what it poisons:

| scope | the shapes | what a caller may still use |
| --- | --- | --- |
| `file` | no `jobs:`, a step before any job, zero steps | nothing |
| `job` | unknown key at four spaces, refused key, job `if:` that narrows, a `- ` with no `name:` | every other job |
| `step` | neither `run:` nor `uses:`, a `run:` block with no body, an `env:` entry with no name | the step's neighbours |

A name-less step poisons its **job** rather than itself, and that is not a detail: the invisible step may hold
a bound for a step the report names, so the doubt is the job's list.

**Two callers, two answers, and the difference is the spread of the doubt.** A seed asks, per number, which
command spent it and what bound could have stopped it; both are facts about that step's own lines. So a job the
reader could not finish costs that job's steps, and the day still lands with a line naming the job, quoting the
reader's own sentence, and saying that no step of it can be placed -- which is a different sentence from "that
day has no job `x`", because the acts that follow differ. A recording asks whether **two trees are one**, so a
job this reader could not describe is refused whole.

That second refusal is also a repair, and it is the round's own find. An unreadable job is *absent* from the
day's map, and an absent job is exactly what a job the run did not report looks like -- a state `driftOf`
tolerates on purpose, because a declared job waiting for its first run is a state the gate is green in. So the
one job the reader could not describe was the one place a drift could sit unseen. It is now the first thing the
comparison returns, before any pair it would otherwise have compared.

**What the floor says about this repository: nothing.** The mode that reads every tree the history names was
run again under it -- 40 readings on 39 commits -- and found **0** lines it could not place, **0 of 3,300** rows
to rewrite, and wrote nothing. The floor refuses no day this project has ever recorded, and the scopes cost no
reading its numbers.

**What it does not claim.** That the reader reads any spelling. It reads one -- a step at six spaces, its keys
at eight, a body at ten -- and the floor converts the others from a misreading into a refusal. Whether that
boundary should be removed by an indentation-aware parser is `O-134`, and it is a rewrite of the reader every
gate but one depends on. Nor that a day with no `jobs:` block can be seeded: with no job there is no command a
number could be placed on.

**The round's own defects.** A body consumed only for the keys that were tolerated: `strategy:` -- refused --
had its `fail-fast:` body read as a step, so the job answered with two refusals where the rule is one, and the
case that pins *one* refusal found it. And a mutation harness that measured its own environment: it passed a
hand-built environment instead of inheriting one, and under it a dozen tests in a different file reported red
for every mutation of the recorder, including ones they do not touch. The same mutation with the parent's
environment gives one red. The published counts are the second measurement.

**Falsifications.** 10 mutations, **87** reds, measured on the green tree, no survivors: a job refusal reaching
the whole file (9), a step refusal reaching its job (3), the floor gone (3), the floor refusing block bodies
(26), a job key's body read as steps (31), the sentences detached from the refusals (6), a day refused whole
again (5), a refused job placed anyway (2), the comparison ignoring what it could not read (1), and the mode's
refusal without its reason (1).

**The inventory.** Nothing moved: 146 sites across 69 scripts, throws 22 fatal / 83 unguarded / 1 guarded / 10
rethrow -- 116 partitioned, 248 proved claims, 166 exit calls of which 20 are zero. One row did move:
`workflowOfThatDay`'s throw changed its sentence, the carry matches a sentence, so its proof was dropped rather
than carried, and it was re-declared against the test that reaches it and measured again.

## Finding 653 — a tree costs the faster of its attempts

`O-135` asked whether a reading can say that it measured a slow **program** or a slow **machine**, and it asked
it about one number: the sites battery's second shard, **881 s** on a shared runner at load 5.6 with a
four-CPU quota. Read by `R4` and `R10`, that number is a requirement of thirty minutes against a bound of
twenty-two, so recording the day would have raised a bound for a reason that is not the program's. The entry
offered three instruments -- the runner's own timestamps, a load average read beside the job, and *the same
step measured twice on one tree* -- and named the third as the only form of the question the file already
knows how to ask. This round took it.

**The entry's own arithmetic was wrong, and wrong in the way the campaign is against.** `v3.149` wrote "717 s
where the fastest reading of it is 519 s". The shard spent 881 s; 519 s is a reading of the *first* shard's
step, in another run. One command's slow day was compared with another command's fast one -- `R10`'s defect,
in prose rather than in arithmetic -- and it made a 47% gap look like a 38% one. The series the bound is
actually sized from held 40 readings before this round: **285 s** fastest, **481 s** middle, **881 s**
slowest.

**The measurement.** The delivery run was re-run, which GitHub numbers as attempt 2 of the same run id, and
the recorder gained `--attempt`:

| | attempt 1 | attempt 2 | the two attempts |
| --- | --- | --- | --- |
| the second shard | 881 s | **880 s** | 0.1% apart |
| the first shard | 501 s | **418 s** | 17% apart |

The same bytes cannot differ by the tree, so the pair was read as the work -- and the two trees this round
delivered took that reading back:

| the second shard | run | tree | seconds |
| --- | --- | --- | --- |
| attempt 1 | 45595594712 | `87d78d97` | 881 |
| attempt 2 | 45595594712 | `87d78d97` | 880 |
| the first delivery run | 45615317655 | `b3124638` | **621** |
| the second delivery run | 45621022185 | `8fb87bcb` | **900** |
| three earlier readings | 44516888528, 45518129185, 45531664638 | three trees | 629, 635, 636 |

The step has **two modes** -- five readings between 600 and 636 s, three between 880 and 900 -- and neither is
the tree: two trees land in each, and the two delivery trees differ only in documentation. So the pair's
agreement was the machine's **persistence** across forty minutes, not the program's cost: a re-run inside one
mode reproduces the mode. The defect is in `R14`'s premise, and the consequence is `O-139`.

**`R14`, and the three clauses it needs.** The rule is one sentence -- a bound is a multiple of what a tree
costs, not of what a day spent -- and each clause below is a way to get it wrong. The premise is weaker than it
looked when the rule was written: what a repeated attempt proves is that a bound is not sized from one
afternoon's slow reading, not that the faster attempt is the program's cost.

1. **A tree measured more than once costs the faster attempt.** The minimum is taken over the attempts of one
   commit, never over the history: two trees are two programs, and the file's other days are other trees.
2. **One attempt that ran the command in two jobs costs the slower job.** This is `R10`'s original evidence --
   the install step at 153 s in one job and 8 s in another, because its cost belongs to a package mirror -- and
   it is not the same minimum: the pair is a set of *attempts*, and one attempt's jobs are one day.
3. **A bound is also at least the worst day the command has already spent.** The clause had been doing nothing
   while the multiple divided the slowest reading, and it starts to matter the moment the multiple stops: a
   command with two modes -- a package store hit at 10 s, a miss at 109 s (`O-126`) -- has a faster attempt
   that is the cheap mode, and twice a cheap mode is not a bound on the expensive one. Twenty rounds of entries
   called this clause unexercised, because no command in the shipped file was believed to have modes; the sites
   battery does, and the 30-minute bound this round ships is exactly twice its slow mode.

The words moved with the arithmetic, because a refusal is read by somebody holding the file. `R4` said
"measured 351 s" and says "the tree spent 351 s on it"; `R10` said "took 361 s in" and says "cost 361 s on the
slowest tree that ran it, in", and both now print the other attempt of that commit in the same sentence. A
refusal that printed only the chosen number would leave a reader who has seen 881 s in the history believing
the gate had ignored it -- and `budgetSummary` had the same duty: the ratio it prints divides the number the
refusal divides, and prints the slower attempt beside it as a second fact.

**What it does to this tree.**

| | before | after |
| --- | --- | --- |
| the sites battery's bound, both shards | 22 min | **30 min** |
| `sensitivity`'s ceiling | 35 min | **43 min** |
| `sensitivity-shard`'s ceiling | 34 min | **42 min** |
| bound-minutes declared in the file | 247 | **263** |

The forty-first reading is run `45595594712` attempt 2 -- 8 of 8 jobs success -- with attempt 1 seeded beside it;
the forty-second is the first delivery tree, run `45615317655`, and the forty-third is the tree this round ships,
run `45621022185`: **44** readings over **42** commits, four of which are two pairs -- two trees measured twice
each.

**What that costs, and what it turned out to buy.** The 30-minute bound is exactly twice the slow mode's 900 s
and 2.9x the fast mode's 621, so the room the round noticed is not slack: it is clause 3 doing its work. Without
it the multiple alone would have asked for 22 minutes, and every slow-mode run -- three of the eight samples
here -- would be refused for being slow rather than for hanging. The clause had been described as unexercised in
twenty rounds of entries; this round shipped it on a command that has modes without knowing it did.

**Why the battery costs 621 s in its fast mode, which is the finding under the reading.** Both shards were
compared across runs in the same mode: the second shard went from 123 claims and 157 runs to 129 claims and 163
runs -- 4% more work -- and its wall clock from 600 s to 621 s, so the six throws `v3.148` added cost **3.5 s
each**, an average claim's price. `v3.149` read a +282 s difference between two afternoons as those six claims;
both later measurements say it was the mode. The price is still worth naming
for a different reason: a claim runs **its whole test file** -- `verify-sites-are-sensitive.mjs` spawns
`vitest run <file> --maxWorkers=1`, and no claim names a test, because `provedBy` is a file --
`ci-budget.test.ts` holds 30 of the 248 claims, and thirty-one runs of it are **372 s of the shard's 621 s**
(`O-136`, with `O-137` naming the instrument that would charge a claim to itself).

**What it does not claim.** That a repeated reading separates the program from the machine: the round claimed
it, and then the fourth measurement took it back. What survives is narrower -- a bound is not sized from one
afternoon's slow reading and left there -- and what does not survive is the sentence this round had already
written into three documents. Nor that a tree measured once is priced correctly: it is priced from one afternoon
(`O-138`). The floor clause was believed to be unexercised -- "no command here has two modes" -- and the sites
battery has two, so its fixture is now a simplification of a shipped case rather than a hypothetical.

**The round's own defects.** `budgetSummary`'s denominator was first written as a `Math.max` over three
candidate numbers with a ternary that then had to work out which of them it had taken; it named a reading
whenever the recording's own number happened to lose, so the printed ratio and the refusal could divide
different numbers on the same step. It is now one lookup of the tree's cost and a `null` when the denominator
is the recording's own -- the same defect `R14` removes from `R4`, one level up. And `v3.149`'s `717 / 519`
above: a round quoting numbers it had not read from the file it was describing.

**Falsifications.** 10 mutations, **62** reds, measured on the green tree, no survivors: a tree priced by its
**slowest** attempt, so replication buys nothing (**9** reds); the fastest tree rather than the slowest (**8**);
one attempt's two jobs taken at the faster (**4**); the cost forgetting the attempts it was measured on (**3**);
`R4` dividing the recording's number (**1**); the "worst day already spent" clause deleted (**1**); `R10` dividing
the slowest reading again (**32**); `costOfStep` answering for a tree that is not the recording's (**1**); the
summary not printing the other attempt (**1**); and a step the history does not hold answering **0** rather than
nothing (**2**).

**The inventory.** Unchanged: 146 sites across 69 scripts; throws 22 fatal / 83 unguarded / 1 guarded / 10
rethrow -- 116 partitioned, 248 proved claims; 166 exit calls of which 20 are zero. The round adds no `throw`
and no `exit`, and every line it added is in `scripts/` -- which is why the coverage figures do not move.

## Finding 654 — a bound the round called unsafe, which the gate accepted

`v3.150` shipped `R14` and, in the same round, three documents that said a **22-minute** bound on the sites
battery was unsafe: the shard's slow state is 900 s, and 22 minutes is 1320 s. The gate did not agree.
`budgetErrors` returned an empty list.

The arithmetic is short enough to check by hand, and it is the whole finding. `R4` and `R10` asked for twice the
**tree's** cost, where a tree cost its faster attempt, and `R14`'s third clause floored that at the worst day
the command had already spent:

| clause | what it asked of a 1320 s bound | verdict |
| --- | --- | --- |
| the multiple, divided by the 621 s attempt | 1242 s | passes |
| the floor, at the 900 s day | 900 s | passes |

So the bound the round's prose called unsafe was the bound the round's own rule accepted, and no line of the
tree could see the two disagree -- `docs:check` was green, the summary printed `2.0x`, and the sentence named
the tree's cost as 621 s.

**The measurement.** A workflow with one bounded step at 22 minutes, a recording of that step at 621 s, and a
history holding 621 s and 900 s. Under a reconstruction of `R14` -- `readingsOfCommand` reporting the worst
tree's **cheapest** attempt -- `budgetErrors` returns `[]`. Under the rule this finding leaves behind it returns
one refusal, naming the 900 s day and the attempt of its own tree that read 621 s. The test is the falsifier and
it runs on both shapes: `expected '' to contain 'is bounded at 22 min'`.

**Why the clause that was supposed to catch it could not.** `R14`'s floor was written as *a bound under a day
already spent is not a bound*, which is true and weaker than the multiple: it covers the day, not the command.
A 1320 s bound covers a 900 s day with 420 s to spare and is still not twice the state the command can be in.
Two clauses were doing one job, and the one doing it was the one nobody had measured.

**The fix.** `R16`: a bound divides the **worst day the command has spent**, and the attempts of that day's own
tree travel beside the number as evidence rather than as a second candidate for it. One clause, one comparison,
and the floor is its subject rather than its neighbour. `R4` says "the tree spent 900 s on it (the same tree
read 621 s on its other attempt)"; `R10` says "spent 900 s on its worst day, in `sites / ...` in run
`45595594712` attempt 2"; and the summary says "2.0x of the worst day its command has spent".

**What it does to the shipped tree: nothing.** All **38** bounded work steps were replayed under both rules
against the **44** readings, and **0** change verdict -- because the two rules agree wherever no tree has been
read in two states, which is everywhere in this history (the one tree read twice read 881 s and 880 s). The
change is therefore free, and what it buys is the day that has not happened: a tree read in both states would
have had its bound divided by the cheaper one.

**Falsifications.** 12 mutations, **54** reds, no survivor, measured on the green tree and restored byte for
byte: the worst reading reported as the tree's best attempt (**10** reds); the worst day chosen by the fastest
comparison (**27**); one attempt's two jobs read as the faster job (**1**); the worst day forgetting its
attempts (**4**); `R4` dividing the recording's number (**1**); `R10` dividing the fastest attempt again (**3**);
`costOfStep` answering with the cheapest attempt (**2**); the lookup answering for any tree (**2**); the summary
not printing the other attempt (**1**); the summary printing the pair without the distance (**1**); the summary
saying nothing about a range's share (**1**); and the share printed as seconds rather than as a percentage
(**1**).

## Finding 655 — a rule read from a pair that never straddled the states

`R14`'s whole argument was one sentence: *two attempts of one commit cannot differ by the tree, so the
difference is the machine, and a bound is a multiple of the program.* The first clause is a fact. The second is
an assumption about what the machine does, and the round's own history refutes it.

**The measurement.** The second shard of the sites battery, on 2026-11-25, six trees, read from
`golden-master/gate-sites.json` at each commit through the API:

| tree | readings | seconds | sites at that commit |
| --- | --- | --- | --- |
| `36a299c8` | 1 | 635 | 146 |
| `3d69ada9` | 1 | 636 | 146 |
| `91806080` | 1 | 600 | 146 |
| `87d78d97` | 2 | 881, 880 | 146 |
| `b3124638` | 1 | 621 | 146 |
| `8fb87bcb` | 1 | 900 | 146 |

Three facts follow, and each one is a number rather than a reading of a number:

- **the workload is identical.** A shard runs one test file per claim, so 146 sites at every commit is 146
  files' worth of work, and a 50% difference between 600 s and 900 s is not the suite's growth;
- **the tree repeats its own state.** The one tree read twice read 881 s and 880 s -- one second apart, forty
  minutes apart, which is the interval a re-run takes;
- **no tree was read in both states.** The 621 s and the 900 s are two different commits (`b3124638` and
  `8fb87bcb`), so "one tree at 880 s and at 600 s" never happened. The pair that justified the rule is the pair
  that agrees with itself.

And the runs around it say the box was not uniformly slow: the 900 s run reads **482 s** in the first shard and
**728 s** in `verify`, inside the 378--505 s and 537--769 s the same seven runs span.

**The defect.** A state a legitimate run lands in is part of what the command costs, so a bound sized from the
fast state refuses the slow one -- which is finding 654's arithmetic, arrived at from the other end. The rule's
saving grace was its own floor clause, and the floor asked for one day rather than twice it.

**What survives of the instrument.** The pair. It is the only thing in the file that can say whether a slow day
is a tree that repeats itself or a state the file has seen once, and it is now printed for that: *the same tree
was read again at 880 s (run `45595594712` attempt 1), 1 s apart*, and, for the tightest bound's command, *two
readings of one tree timed that step 141 s apart, 44% of the 319 s between its ends*. A share rather than an
adjective, because whether the rest of the range is growth or a state is not separable by arithmetic on the file
-- which is `O-141`, and the instrument it would need (the runner's own load and throttling counters) lives in
the job log that this sandbox cannot fetch.

**What is not claimed.** That the state is the machine's, rather than the tree's in some way the site count does
not see. Nor that the step has two modes: seven readings are two clusters here because they are 40% apart with
nothing between them, and a wide spread would look the same at this sample size. The rule needs neither claim --
only that a run can land in a state the bound must cover.
