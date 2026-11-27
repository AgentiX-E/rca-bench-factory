# Audit · volume 15

Findings 651–663, from the rounds recorded in `progress/volume-20.md` as `v3.148`, `v3.149` and `v3.150`, and
in `progress/volume-21.md` as `v3.151`, `v3.152`, `v3.153`, `v3.154` and `v3.155`.

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

## Finding 656 — a refusal that only the repairing mode can reach

`check-repository-table` exists because the `## Repository` table published eight numbers and nothing read any
of them (finding 195's class). Its rows are not cut from one place: `Tracked files` is `git ls-files`, while
`Source files`, `Source lines`, `Test files` and `Test lines` are `readdirSync` over `packages/*/{src,test}`.
So an untracked path is counted by five rows and not by the sixth, and with one present the table is not
stale -- it is about two trees.

The guard has known this since `v3.83`, when a round published `Tracked files 638` before `git add` and the
next check read `639`. The refusal it wrote lives **inside `if (writing)`**: the branch only the repairing
mode takes. The mode that publishes refuses the state; the mode that judges cannot see it.

**The measurement, as a CI run.** `v3.151` added `docs/progress/volume-21.md`, ran `docs:check` while the file
was untracked, and got exit 0 with `| Tracked files | 680 |`. The index held 680, so the row was true of the
index and the five filesystem rows were true of a directory that held one more file. `git add -A` made the
same command on the same bytes report

```
  - ## Repository says '680' for Tracked files; the tree says '681'
check-repository-table: FAILED
```

and the push carried a tree where the guard is right, because a checkout has no untracked files. CI run
`45643248364` came back with **four jobs of eight red** -- the documents job, the cold-tree job, the lint job
and the second sensitivity shard -- each of them the same line, reached through a different spawner:
`docs:check` runs the guard, `lint`'s site proofs run the test file that drives it, and the battery runs whole
test files as one claim's witness.

**The falsifier.** A committed fixture tree with a correct table, then one untracked `notes.md`:

| mode | `v3.151` | `v3.152` |
| --- | --- | --- |
| `node scripts/check-repository-table.mjs` | exit 0, "8 row(s), every one derived from the tree" | exit 1, names `notes.md` and the two populations |
| the same after `git add -A` | exit 1, `says '8' ... the tree says '9'` | the same -- the message changes kind, it does not persist |
| `--write` with the file untracked | exit 1 | exit 1 (unchanged) |

**The defect.** A refusal is a property of the measurement, not of the mode that stores its result. Written
where the failure was first seen -- inside the rewrite -- it covered the write and left the read, which is the
mode the corpus runs on every round and in four CI jobs. And the guard's own prose had already claimed the
general rule: the docblock's "What is not checked" section never mentioned the index/worktree split, and the
fixture comment in the test file said *the guard now refuses to derive over an untracked file* -- true of
`--write`, false of `check`. That is finding 654's shape one round later: the sentence describing a rule
drifting from the rule in the direction that flatters it.

**The repair.** The refusal is hoisted above the mode split and both modes take it, with the sentence carrying
what the *mode* is doing: a rewrite is told the counts it would publish are counts the commit will contradict,
and a check is told which rows disagree -- `` `Tracked files` would count the index and `Source files` and
`Test files` count the worktree, which is one table describing two trees ``. The inventory moved by nothing but
a line number (146 sites, the refusal's exit at 466 now at 483), which is the reading that says the round
added no claim: the site existed and was proved; what changed is which state reaches it.

**What is not claimed.** That a green `docs:check` means the tree a commit carries is the tree that was
measured. It does not: a tracked file with uncommitted edits is measured and committed from two states, and the
corpus's own order -- `docs:check` before `git add` -- is the order that hides it. That is `O-142`, and it is
open because the refusal that would close it (any modified tracked file) costs a round its feedback loop.

## Finding 657 — a total is not a measurement, and a shard is not a claim

`verify-sites-are-sensitive` prints one summary line, and the recorder sees one step's seconds. That is enough
to know the battery is slow and not enough to know what anything costs: `v3.150` added six claims to
`ci-budget.test.ts` and the round after it charged them **282 s**, a number that is the difference between two
afternoons and is printed as if it were six runs.

**The instrument.** One row per claimant, printed before the summary, with the seconds measured around that
claimant's own children:

```
verify-sites-are-sensitive: packages/core/test/ci-budget.test.ts -- 30 claim(s) in 30 run(s), 541.8 s (slowest 21.0 s)
verify-sites-are-sensitive: 129 mutant run(s) cost 587.1 s of child time inside 3.1 min of wall clock,
  3.2x the clock with 4 at a time; the dearest claimant is packages/core/test/ci-budget.test.ts at 48% of that
```

Two facts the total could not carry: **who** paid, and **how many runs** the total is made of.

**The defect the instrument found.** With the rows in place, the same shard was run twice an hour apart on the
same tree, differing in one line of the gate. The 32 claimants both runs could measure, and their 125 claims:

| claimant | without the flag | with it |
| --- | --- | --- |
| `ci-budget.test.ts` | 541.8 s | 282.3 s |
| `fetch-official.test.ts` | 294.0 s | 89.5 s |
| `check-fault-cases.test.ts` | 250.7 s | 40.1 s |
| `gates-are-testable-is-enumerated.test.ts` | 54.1 s | 25.9 s |
| `check-official-roundtrip.test.ts` | 49.0 s | 17.1 s |
| `gen-examples.test.ts` | 45.2 s | 28.1 s |
| **all 32** | **1382.7 s** | **577.1 s** |

The shard's wall clock went from **6.4 min to 3.1 min**. The price of a claim was never "claims times file":
it was "claims times the file up to the first red", and the entry that said otherwise (`O-136`) had the right
complaint and the wrong mechanism.

**Why one flag is the whole of it.** A mutant is proved by *a* test going red; the rest of the file adds
nothing to that sentence and is charged to the claim anyway. The two ways the flag could weaken the battery
close by construction: a survivor's verdict is the whole file staying green, so a file that never goes red
never bails; and a baseline is **refused** the flag, because its verdict is the longest single test of a file
it would not have finished. The mutant's record is written when the site executes, which is before the
failure, so the "recorded its mutant" clause is unaffected -- 129 of 129 runs are still credited.

**What CI did with it, which is less than the local ratio.** Reading 47 -- the round's own run,
`45673244483` -- records the two shard steps at **231 s** and **460 s**, against **488 s** and **596 s** in
reading 46, and the workflow at **771 s** against **969 s**. The shard the 900 s reading came from kept **77%**
of its time, where the box the pair was measured on kept 48%: a runner pays more of a run before the first red
-- more startup, more contention, fewer cores -- and a flag that stops at the first red cannot shorten what it
reaches late. What it also did is move the critical path: `batteries-heavy` took **761 s** of the 771 s run, so
the workflow now waits for the two probe-rewrite batteries, which this round did not touch.

**The measurement's own defects, since a paired run has more ways to be wrong than a single one.** The first
control was run on a tree whose own test asserts the flag, and separately while the counts were mid-edit, so
three claimants failed on their own; the first flagged run was compared to it as a ratio of two shards, which
is the arithmetic this campaign exists to remove. The table above is the third attempt, taken after the counts
were retaken and the inventory re-derived -- and `prometheus` had to be installed first, because
`reader-against-backend` refuses to run without it and the first "green" shard was green over 33 of 34
claimants.

## Finding 658 — a whole-file run is a superset of the claim it is run for

`backend-support` holds 83 rows, and each row is a claim of one shape: *this mutation makes this named test
fail*. The battery measured each one by running the whole file the test lives in and looking for the name in
the output. On the runner the step cost **379 s**, and on the box this finding was measured on the 83 runs
cost **347.0 s** of child time -- for 83 sentences about a single test each.

**The claim, asked directly.** `--testNamePattern` runs the one test the row names. It is not a weaker
instrument, and the argument is the verdict rather than the seconds: the battery calls a row CAUGHT only when
the run exits non-zero **and** the expected name appears in its output, so a run that collects nothing and a
run whose named test passed stay distinguishable. What the instrument loses is one diagnosis -- "a different
test went red" -- which used to be reported MISATTRIBUTED and is now SURVIVED, because the named test really
did not catch the mutation. That is the row's claim stated truthfully, and the vocabulary entry was rewritten
rather than left to describe a branch that can no longer be reached.

**The pair.** One tree, one box, the same process, alternating the two forms row by row -- so no number here is
read across two afternoons:

| | whole file | named test |
| --- | --- | --- |
| 83 runs, child time | 347.0 s | **53.2 s** |
| verdicts that agreed | 83 | 83 |

**The escaping that is load-bearing rather than tidy.** `--testNamePattern` compiles its argument as a regular
expression, and one of the 83 names is `quarantines a line that is not a [timestamp, line] pair, naming what the
extra element would be`. Unescaped, `[timestamp, line]` is a character class, so the pattern requires a single
character from that set where the name has eleven, and matches no test at all -- the mutation would be caught
perfectly well and the row would report MISATTRIBUTED, a battery blaming its suite for an escaping defect. The
test asserts both directions on the shipped name: the escaped pattern matches it, the raw one does not.

**What was not done.** The file filter is kept (`test/clickhouse.test.ts` is still one argument), because a
suite-wide run would answer a different question; and the table still names the file as well as the test, which
is what `--verify-expectations` reconciles against. The repair removes a superset, not the subject.

## Finding 659 — the restore compiled the package, and the next injection overwrote it

`type-miss-probe` mutates `packages/core` for 57 of its 74 injections and must compile the package for each,
because the probe reads `dist` and a mutation that does not compile would run the previous build. That compile
is the measurement. The second one was not: the `finally` put the committed source back and compiled it, and the
next injection's own build then wrote its output over the same `dist`. **114 compiles of a 260-file package for
57 measurements**, and the step cost **360 s** on the runner.

**The instrument first, because the totals could not be divided** (finding 657). One row per claimant -- the
file an injection edits -- with the injections it holds, the compiles it paid for, and the seconds split:

```
type-miss-probe: derivation -- 17 injection(s), 17 build(s), 41.4 s (38.6 s compiling, 2.8 s probing)
type-miss-probe: scorer -- 6 injection(s), 6 build(s), 14.8 s (13.8 s compiling, 1.0 s probing)
type-miss-probe: 74 injection(s) cost 147.7 s of child time inside 151 s of wall clock, 60 build(s) and
  148 probe run(s); the unmutated baseline cost 0.3 s more (0 build(s), 2 probe run(s))
```

Compiling is **88%** of the child time, which is the fact the repair needed and the reason the probes are not
worth a second thought: a probe is 0.15 s and a compile is 2.3 s.

**The repair.** The source is still restored immediately -- that is what the byte-for-byte check at the bottom
of `run_probe` reads -- and the *compile* is deferred to the first reader that needs the committed rule. There
are exactly two such readers: an injection that edits only the probe or the fixture, and the end of the battery.
`_STALE_DIST` records that `dist` currently reflects a mutation; `flush_dist` is the only thing that compiles it
back, and it is also registered with `atexit`, so a run that never reaches the end still leaves a package that
reflects the tree. The restore check reads *source*, so what it asserts is unaffected by the deferral; what
changes is when the derived artefact catches up.

| | before | after |
| --- | --- | --- |
| compiles | 114 | **60** |
| wall clock, one tree, back to back | 269.1 s | **150.8 s** |
| verdicts | 74 caught, 0 survived, 0 inert, 0 blind | the same |

The 60 is arithmetic rather than a coincidence: 57 in-package injections, two probe-only injections that follow
one of them and therefore pay a restore compile, and the final flush.

**Three alternatives, and why the second-best one lost.** `--incremental` was measured at **0.77 s** against
2.27 s -- three times this round's saving -- and refused, because tsc keys a file by modification time and size
and the deferral exists to compile a file that was just written twice: a size-preserving mutation restored
inside one tick would be read as unchanged, and a `dist` that keeps a mutation is the worst state this battery
can leave, since `_witnesses` journals the source and not the build output. Mutating `dist` directly would
remove every compile and double the table into emitted JavaScript while losing the compile check. Reordering
the injections so the in-package ones are contiguous buys two compiles for a report whose order is chosen by
cost.

## Finding 660 — an audit that reports sixty-nine verdicts and no price

`verify-gates-are-testable.mjs` is the second-most expensive step in the workflow. Run `45692816682` read it
at **374 s**, and attempt 2 of `45695988542` -- the same tree, an hour later, every step of its job reading
the same number twice -- read it at **374 s** again. What it printed, for all 69 subjects, was one line each:
`CAUGHT <gate> <n> test(s) red in <k> of <m> naming file(s)`. Nothing said what any of them cost, and the
step was the only one in the workflow that stated no number about itself at all.

That matters because the number was the only thing anybody wanted. v3.154 had taken 84.7% off another battery
by finding that 83 rows paid for whole files; the same question here -- *is this step paying for what it
claims* -- could not be asked without knowing which of 69 subjects wanted the 374 s.

**The instrument.** Each subject now carries its child's wall clock, measured around the mutation rather than
around the loop, and the summary separates two quantities the total cannot separate: the sum of the children's
wall clocks, and what those children said their own tests took (`Duration`, which vitest prints). The
difference between them is process start, config load, plugin setup and worker pool -- once per subject.

**The reading, on the development box** (69 subjects, 218.8 s):

| | value |
| --- | --- |
| runs | **69**, one `npx vitest run` each |
| child time | **218.8 s** in 223.1 s of wall clock |
| what the suites said they spent | **190.9 s** of it, **87%** |
| process start | **27.9 s**, **0.40 s** a run |
| file executions | **233** over **93** distinct files |
| dearest subject | `check-official.mjs`, **26.1 s**, **12%** of the total |
| distribution | median **1.5 s**; 44 of 69 runs at or under 2 s; 7 over 8 s |

**So there was no hot spot, and that is the finding.** The step is not paying for a claim it does not make:
87% of its cost is tests it was asked to run, the dearest of 69 subjects is an eighth of the total, and
amortising every cold start would recover 28 s of 219. A round that had "optimised" this step by trimming the
dearest subject would have taken 12% and left the other 88% where it was. The cost is the *count* -- 69
mutations, each needing its own suite -- which is a property of what the audit is, and the only lever on a
count is to run it in more than one place at once.

The instrument also corrected a number in prose that had gone stale twice: the `--list` docblock said
*"104 seconds for the 37 subjects"* while the list returns **69**. That is the third time this file has
carried a stale figure about itself, and it is now printed by the run rather than written into a comment.

## Finding 661 — sixty-eight independent claimants, run one after another

`verify-site-proofs.mjs` asks one question per claim -- *did this file make this exit fire* -- and the answer
requires running the file, because it installs a hook that records `process.exit`'s caller. The files are
grouped by claim (`byFile()`), sorted for the report, and then run in a `for` loop whose body was a
`spawnSync`. Each is a separate `vitest run`; none reads another's state; the only shared thing is a counter,
incremented on this side of the process boundary before a child exists.

So the loop was serial for a reason that had nothing to do with its subjects: `spawnSync` blocks. On the
development box that is **283.0 s** for 68 files -- 4.2 s each, of which a `vitest` run of one file is about
1.5 s.

**The repair** is the shape the loop already wanted: `spawn` and await, so the event loop is free, and a fixed
set of workers pulling from a cursor so that `limit` is a number rather than a comment. The limit is
`availableParallelism()`, capped at eight -- a child is a node process plus vitest's worker pool, and past
eight the children contend for memory bandwidth while a 32-core developer box starts 32 of them at 300 MB
each.

| | serial (`--jobs 1`) | pooled (default) |
| --- | --- | --- |
| wall clock, one tree, back to back | **283.0 s** | **124.3 s** |
| claimant files | 68 | 68 |
| verdicts | one unmeasured claim, from a document gate that was red in both runs | the same |

**Why the case does not time it.** A test that asserted "the pooled run is faster" would be a test of the
machine, and it would pass on a gate whose pool was a loop. The case instead gives the fixture's stand-in
runner a busy wait and two marks, one either side of it, and reads the overlap out of the marks: **1** child
alive at a time under `--jobs 1`, **at least 2** (and at most 4, on four files) under `--jobs 4`, with the
same status and the same stderr from both runs. That is the property the pool is for, and a serial
implementation cannot satisfy it however fast the machine is.

`--jobs` stays in the interface because the paired measurement is the only thing that can say the verdicts did
not move with the repair, and the next runner will want the same experiment.


## Finding 662 — the rule that could not express the state the previous rule existed for

`R9` was written so a job could be declared before any run measured it. v3.155 is the first round since to
need that, and the round could not be published at all:

- `ci.yml` declares the new job, so `jobsOf(workflow).length` is 9.
- The newest reading in the ledger is a run of the 8-job workflow, so its tally is `8 of 8`.
- `R11` refuses any closing reading whose tally disagrees with the workflow's job count.
- The only row that would satisfy `R11` is one from a run that has not happened -- and the run cannot happen
  until the commit is pushed.

The round that added `sensitivity-shard` in v3.54 did not hit this because `R11` did not exist yet: the log's
newest row had been stale for 65 rounds, and the rule was written afterwards to stop exactly that. So the
rule set had, in the two rounds that followed, become unable to describe the state its own `R9` creates.

**The repair is one term.** `R11` now subtracts the jobs `golden-master/ci-declarations.json` is waiting to
measure, and refuses the same difference when no promise accounts for it -- so a promise cannot be used to
excuse an old reading, because `R9` already refuses a promise for a job the recording holds. The gap is not
silent: the summary prints `N job declaration(s) still awaiting their first run`, and the recorder prints the
same sentence when it writes.

**Falsified by** two cases in `ci-budget.test.ts`: a two-job workflow whose newest reading is `1 of 1` is
accepted with a promise and refused without one.

## Finding 663 — a pool of eight is eight processes only if a child is one process

CI run `45738320826` came back **8 of 9 jobs green and `Lint` red**, on the round's own change. The sentence
the step printed was not about a claim:

```
  packages/core/test/check-doc-counts.test.ts did not pass, so its claims are unmeasured
    Error: this test file held the event loop for 53800 ms, past the 45000 ms budget. Of that,
    374 ms were this process's own CPU time
    Tests  59 passed (59)
```

Fifty-nine of fifty-nine tests passed. What failed was the **budget** those tests are run under, and the two
costs that crossed it were both introduced by the pool the same round added:

- **The throw witness was armed for the whole run if any claim anywhere was a throw.** The comment beside it
  said the opposite -- "asked for only by a run that has a throw claim to settle" -- and a *run* is 68 files:
  18 of them have throw claims, so **50 paid for an instrument they never read**. The witness is a module
  loader, so every gate the file spawns pays again: measured on the one file that failed, alone on an idle
  box, **3.14 s** plain, **3.27 s** with the trace hook, **11.18 s** with the witness registered. Fifty-nine
  spawned gates at ~135 ms each is the whole of the difference.
- **Each child was started as `vitest run <file>`, and vitest brings its own pool.** The cap bounds the number
  of *children*; the number the cap was chosen by is the number of test *processes*, and on a runner with
  fewer cores than the cap a child is several of those. The pool's name was larger than what it bounded.

The repair is two lines and a derivation: `RCA_THROW_WITNESS` is set for the files whose claims include a
throw (from `claimsByFile`, the same grouping the plan uses), and each child is started with
`--maxWorkers=1`, which changes nothing about which tests run -- a child has one file -- and everything about
how many processes are alive at once. The summary line now ends `the throw witness armed for 18 of them`,
because "how much of this run was instrumented" is a question about cost that no verdict answers.

**Measured on one green tree, back to back:** **124.3 s -> 79.4 s** at the default eight on this box, and
**151.6 s -> 92.5 s** under `taskset -c 0-3`, where the gate takes four at a time. The second pair is the one
that matters: it is the shape of a runner, and the file that failed on CI is one of the 50 that no longer pays
for the witness.

**The instrument that noticed was the suite's, not the workflow's.** `Lint` has a 19-minute bound and spent
301 s, so nothing in `ci.yml` was ever going to say this; what said it was `stall-budget`, which exists for a
file whose loop is blocked, one level down from a job whose budget is not. A gate can be inside its own
budget and inside no budget at all.

## Finding 664 — a recording binds a step to a job, so a queue cannot be rebalanced

`v3.155` ended with an arithmetic rather than an opinion: `batteries` spent **738 s** and `gates-audit`
**270 s** on one tree, and a job's wall clock is the sum of its steps. Three of `batteries`' batteries are
independent of everything else in it -- fetch-official retry (**118 s**), doc-count shapes (**78 s**),
round-trip record (**57 s**) -- and moving them leaves **485 s** against **523 s**. The move is 253 s off the
run's critical path for a cost of zero: no new job, no second prefix, no new step, the same three commands.

`check-ci-budget` refuses it, and the sentence is the recording's:

```
the recording holds `Fetch-official retry battery (no survivors)` for `batteries`, which is not a step of
that job: a recording that outlives its step describes a tree that no longer exists
```

That sentence is right about the shape and wrong about the state. A recording is keyed by **job**, and the
entry a step leaves behind when it moves is both (a) evidence of a tree that no longer exists and (b) the only
measurement of that command the file holds. The rule has no word for the second half, so the only way to
rebalance two jobs was to land the move in a commit whose gate is red and re-record after the run that
measures it -- which is the one thing this repository does not do, and it is the same defect `v3.155`'s
finding 662 fixed one level up.

**`--borrow` is not the way out, and its refusal is the reason.** The recorder will record a job's steps from
another job's seconds, and it refuses when the two jobs hold different ceilings -- *"the seconds describe the
same commands, but a bound has to fit the job that will enforce it, so a borrow is only a substitute for a
measurement inside one budget"*. Two jobs that hold different ceilings is exactly the case a move creates, so
the instrument that exists for "the steps are the same commands" is unavailable for "the step is the same
command". The two facts are both true and the second one is the one that matters: a step that moves lands in a
budget it has never been spent inside.

**The repair is a promise of `R9`'s kind.** `golden-master/ci-declarations.json` gains a `moved` list: one
entry per step, naming the job that holds it now, the job whose recording measured it, the bound, and why. The
entry then does three things, and each of them is a check that already existed rather than a new one:

| what the move does | which rule it satisfies | which rule still refuses |
| --- | --- | --- |
| excuses the stale entry in the job the step left, for that one round | `R2`'s second half | every other stale entry, including the same job's (`still refuses a stale recording entry that no move explains`) |
| enters the new job's pending set | `R8`: the step must exist there, its bound must be the one `ci.yml` enforces | a move into a job that does not hold the step, a move from a job to itself, a move from a job that is not in the workflow |
| expires when the job that holds the step has measured it | `R8`: *"was measured at 118 s and the declarations file still says it has not been"* | a move that outlives its measurement, which is a bound standing on the wrong job's seconds |

**The arithmetic under the ceiling needed the same sentence, and it failed silently.** `R13` demands a ceiling
of `bounds + 2 x overhead`, where `overhead = total - the steps` is what no step accounts for. Three steps
leave, `measured` falls by 253 s, and `total` still holds them -- so the job that gave a step away reports the
step's cost as **setup**, and its ceiling is argued from 253 s no step will ever spend there again: `batteries`
was refused at 45 minutes and asked for **54**. The departed seconds are subtracted from both sides now, and
the same tree asks for **46**.

**Measured on the shipped tree, by the gate that refused it:** `batteries` **56 -> 46 min** (the bounds it
still holds, 42, plus its prefix allowance), `gates-audit` **24 -> 34 min** (30 plus the allowance), and the
sum of the two queues is unchanged at 1 008 s. The reading that follows this commit is what says whether the
move did what the arithmetic says; this round can only state the arithmetic, which is why the ceiling numbers
move with a run rather than with a preference.

**The table was measured on the wrong machine, and the row is why that is now fixable.** The first table came from
the box this round was written on: 32 cores, the same four-way pool, and a partition the table says is 0.2%
apart. Reading 53 measured the two jobs **306 s** and **362 s** -- 15.5% apart. The partition is not the cause:
priced by the runner's own per-file rows, the halves that ran are **1,201 s** against **1,432 s**, which is
**16.1%**. Per-claimant seconds are not proportional between a 32-core box and a 4-vCPU runner, because contention
scales with what a file does rather than with how long it takes. The repair is the row: as of this round the
per-file line prints the **baseline** as well as the mutants, so a table can be rebuilt from a run's own log
rather than re-measured on a developer's machine. Rebuilt from reading 53's two shards it prices **2,632.1 s** of
child time, divides **34** against **34**, **1,315.7 s** and **1,316.4 s** (0.1% apart), and moves **13** files.
The provenance rule widened to match: `source` names the command that wrote the table or the run it was read
from, and a sentence naming neither is refused.

**And the second run refused the claim the first one suggested.** The rebuilt table shipped, and reading 54 --
same tree, 9 of 9 -- read **427 s** against **303 s**, while its own per-file rows put that same partition **30%**
apart. Two consecutive runs of one tree, pricing one partition: **0.1%** and then **30%**. Per-file costs moved by
up to **2.42x** between them (`gate-sites-are-proven.test.ts` 16.8 s then 40.6 s), the total by 9%, and the sum of
the absolute changes is **653 s** -- a quarter of everything the battery spends. A static table balances the
seconds it was given; on this inventory, where one claimant is 398-829 s and four more are over 90 s, the seconds
it is given are not a stable quantity. The honest result is therefore narrower than the round's title: the split
is derived from a measurement instead of from a name, and the residual is run-to-run variance rather than the
rule. What would move it next is the price of the claimants -- `ci-budget.test.ts` is 30 claims and up to 29% of
the battery on its own -- not another partition.

**What the round did not decide.** A move is available to exactly one round and to one step at a time -- the
list is a list, but every entry is a promise nobody has measured, and three at once is already the largest
number this file has carried. It does not decide whether a step may move *twice*: the second move would leave
two stale entries behind it, and the excusal is keyed by the step's name, not by its history.

## Finding 665 — a split by position is a split by nothing

The sites battery is divided across two jobs, and reading 52 priced the division: `sensitivity` spent **247 s**
and `sensitivity-shard` **438 s** on the same command, in the same run, on the same runner image. 44% apart. One
runner worked for three minutes while the other had finished, and the workflow's wall clock is the slower shard,
so every one of those seconds was paid by the run.

The rule that produced it was `position % count` over the sorted claimant file list, and it was argued for:

> Position rather than file size, deliberately. A split by measured seconds would have to be re-derived after
> every run and would put the same file in different shards on different machines; a split by sorted position is
> a pure function of the inventory, so a plan written in `ci.yml` and a plan checked by a test are the same plan.

Both halves of that are true of a split by **live** seconds, and neither is true of a split by a **committed
table**. The objection was not to measurement; it was to a reading taken on whichever machine happened to be
running. A table in git is not a reading: every machine reads the same file and derives the same halves.

**What the table holds, and who writes it.** `golden-master/sensitivity-costs.json` carries one row per
claimant -- `claims`, `runs`, `baselineMs`, `mutantMs` -- and is written by the instrument that spends those
seconds: `verify-sites-are-sensitive.mjs --costs <path>`, after a run that measured every claimant. Two
requests are refused, and each for its own reason:

| request | what the run measured | why the table it would write is not one |
| --- | --- | --- |
| `--costs … --shard 1/2` | half the inventory | it would name half the claimants and omit the rest, and the next run would divide the inventory by it |
| `--costs … --list` | nothing | a table of zeros looks more like a measurement than an empty file does |

**Why a table has to be refused rather than trusted.** A table is a measurement *of a tree*, and the tree moves:
a claimant file is added, a claim is added to a file that already had some, a file stops making claims.
`checkShardCosts` therefore refuses a claimant with no row and a row with no claimant, refuses a row whose
`claims` disagrees with the inventory (the count is part of the cost's definition -- one baseline plus one run
per claim -- so a file that gained a claim carries seconds for a run that no longer exists), refuses a row whose
seconds are not positive integers, and reads the three provenance fields (`measured`, `machine`, `source`)
because a seconds figure with no day is a figure about another tree. The gate calls it before it divides
anything.

**The division itself is longest-processing-time first.** Dearest claimant onto the emptiest shard, ties by file
name and lower shard index. It is not optimal -- dividing indivisible files is bin packing, and LPT is a
4/3-approximation -- but it is a pure function of the table and the inventory, which is the property the old rule
was chosen for. Measured on the tree that publishes it: **68** claimants priced at **1,670.9 s** of child time
over **324** runs, divided **834.6 s** and **836.3 s** -- 0.2% apart, 33 files against 35. The same seconds
divided by position read **674.5** and **996.4**, 32% apart, which is the composition of the 247 s and 438 s
reading 52 measured.

**There is no positional fallback, and the reason is not symmetry.** A shard run without a readable table stops
with the command that regenerates it. A fallback would be a second partition under one name: the halves
`ci.yml` runs would stop being the halves a local `--shard` runs, and the difference would appear in the one
place nobody would look -- a green job that measured a set the plan did not describe.

**The instrument refused the round's first shape, and the shape was wrong.** The cases that read the table were
written inside `sensitivity-shards.test.ts`, which is a claimant: the battery runs it, and the battery is what
writes the table. The run that would have produced the table was red until the table existed --
*"`sensitivity-shards.test.ts` does not pass on its own, so its claims are unmeasured"* -- which is the
observation that decided the structure. The cases about the artifact moved to
`packages/core/test/sensitivity-costs.test.ts`, a file that spawns nothing and therefore is not a claimant; the
cases about the *plan* stayed and price every claimant the same, so a case about shape cannot be red because a
measurement it does not consult is missing. An artifact whose own acceptance cases live in the file its producer
runs is an artifact that can never first exist.

**What the round did not decide.** Whether two shards are the right number: the pair is balanced now, and a
third job would cost another 27 s prefix to save the tail of the slower half. Nor does the table carry the 22 s
`verify-claims-are-sensitive` step that shares shard 1's job -- the reading charges it to that job, and the
partition prices claimants, not jobs. And the acceptance is a prediction until the run that follows this commit
measures it: a table written on a 32-core box prices child seconds, and the runner's ratio between two claimants
is the thing the division actually depends on.

## Finding 666 — a claim was priced by the file it lives in

The sites battery asks, for each of 256 claims, whether some test notices an exit stop failing. The answer is an
exit code, so the run is a run of the claimant, and the claim was charged for the whole of it. A file with thirty
claims therefore cost thirty runs of itself: the price of a claim was its neighbours' runtime, and a file's price
was its own runtime multiplied by its claim count. Measured in the table v3.157 shipped, two claimants of
sixty-eight -- `ci-budget.test.ts` (30 claims, 620.8 s) and `publish.test.ts` (29 claims, 565.0 s) -- were **45%**
of a 2 632 s battery, and no partition can make 45% smaller.

That is why the round before this one could not balance the pair. Its table divided the claimants 0.1% apart and
the next run read 30% apart, and the conclusion recorded was that a static table cannot balance a quantity that
is not stable. The quantity was stable. It was the wrong quantity: what varied was not the partition but the
price of a claim, because a claim's price was "everything in the file up to whichever test noticed".

**The report already named the test.** A mutant run writes vitest's JSON report and the report marks the
assertion that failed. That title is the answer to the battery's question -- "some test depends on this exit" --
so the table now records it beside the claim, and the next run of that claim is aimed at one test with
`--testNamePattern`. Finding 658 measured the principle on the backend-support battery (83 rows, **347.0 s ->
53.2 s**, 83 of 83 verdicts identical), where the row already carried the name; the difference here is that a
site carries none, so the name has to be measured, stored in a committed table, and re-checked on every run.

**The aim can only make a run cheaper.** An aimed run is credited only when it exits non-zero, records the
mutant, **and** the report names the aimed test as failed. A green aimed run is not evidence -- the file's other
tests were never run -- and a red on some other test is not evidence either, so both are measured again against
the whole file. A stale table therefore costs a whole-file run and never a wrong verdict, and the summary counts
the misses rather than leaving a battery that got slower looking like a battery that is fine.

**The escaping is not tidiness.** `--testNamePattern` compiles its argument as a regular expression. A title like
`a bound (v3.158) is twice the day` unescaped opens a group and matches a family of names, and a red from one of
them would be credited to this claim. The pattern is escaped, and the case measures both directions on a
shipped-shaped name.

**Measured, one tree, one box, four claimants at a time:**

| | before | after |
| --- | --- | --- |
| 256 mutant runs, child time | 3 061.7 s | **924.2 s** |
| wall clock | 7.8 min | **3.3 min** |
| dearest claimant's share | 29% | **16%** |
| aims that held | -- | **256 of 256** |

The shipped table (68 claimants, 256 claims) was written by a third run, taken alone at the default pool of four:
**420.6 s** of mutant child time inside **3.1 min**, **724.7 s** with the 68 baselines, the two halves dividing
**362.3 s / 362.4 s** -- **0.0%** apart, 34 claimants each -- and the dearest claimant at **66.4 s**, **15.8%** of
the mutant time where v3.157's table had it at 23.6%. One claim, aimed and whole, in the same process minutes
apart: **1 375 ms** against **5 270 ms**.

**The seconds do not survive a session; the ordering does.** Three readings of one battery on one tree, on one box:
**3 061.7 s** with no witness recorded, **924.2 s** aimed in the session that wrote the first table, **417.7 s** and
then **420.6 s** aimed and alone; the four tables those runs priced total **2 632.1 s**, **1 550.4 s**, **715.8 s** and
**724.7 s**. A **2.2x**
spread between two of them is larger than the effect either was measuring, so the claim is the within-session
ratio and the ordering -- `ci-budget.test.ts` first in all three -- and not the seconds. A duration taken once on a
box whose load is not part of the record is a price with an unstated denominator; the division reads only the
ordering, and it divides **0.0%** apart in all three tables.

**What the artifact cannot check about itself, stated rather than approximated.** The obvious case for the table
is "each witness names a test the claimant contains", and it is impossible for two shapes in this tree: a title
with an apostrophe is written with an escape, so the literal differs from the report, and a title built from a
template appears nowhere in the source at all. Measured on the first version of that case: 256 of 256 rows
failed, then 2 of 256 after the reader was changed to the title. So the artifact asserts what is statically true
-- a name for every claim, and a name that belongs to the file making the claim -- and staleness is held where it
is observable: the aim misses, the claim is measured whole, and the run prints how many missed.

**What this does not decide.** Whether a claimant with one claim and two seconds of runtime is worth the two
extra arguments: the mechanism costs nothing when it misses, and a threshold would be a number nothing measures.
Nor whether the table should carry a witness for a claim it prices but never measured -- today that claim is
measured against its whole file, which is correct and slow.

## Finding 667 — a count written with a separator was read as its last three digits

`check-doc-counts.mjs` reads published counts in four places, and two of the four accepted a thousands
separator while the two that decide the verdict did not. `COUNT_PHRASE` -- the census that finds a number
nothing read -- and `SPAN_SHAPES` -- the `7,070 -> 7,082` row -- are both written `\d[\d,]*`, because this
corpus writes five-digit counts with a comma. `PAIR_SHAPES` and `BARE_TESTS` were written `(\d+)`.

So a row reading `**262 files, 7,091 tests passed**` matched no pair, fell through to the bare test count, and
was read as **91 tests with no file count**. The round shipped such a row -- it wrote its own suite counts in
the separator style the prose two rows away uses -- and the gate answered:

```
docs/progress/volume-21.md:2696: core tests fell from 7082 (…:2560) to 91. A suite that lost tests is
  a regression or a mislabelled scope; either way it should not pass unremarked.
docs/progress/volume-21.md:2696: declares the current state of 'core' as null files / 91 tests, but the
  suite has 262 / 7091.
```

Both sentences are refusals of a true row, and both name numbers the document does not contain: `91` and
`null files`. A guard that refuses an honest row with a fabricated diagnosis teaches its reader to rewrite the
row until the gate stops complaining, which is the one habit a gate exists to prevent.

**Three readers of one line, and two of them failed differently.** The guard has the two shapes above; the test
file holds a third pattern of its own, in the case that holds the shipped document to the committed
measurement. That one was `(\d+)` as well, and its failure mode was silence rather than arithmetic: with the row
written `7,091 tests passed`, the pattern matched nothing, the case found no current-state rows at all, and it
failed with `no current-state rows found; the shape of the document changed` -- a sentence about the document's
structure, produced by a number the pattern could not read. A reader that goes quiet is worse than one that is
wrong, because the sentence it prints sends the next reader to the wrong file.

**The repair is a normalisation, not a wider character class.** Widening the classes is the half that makes the
match happen; `Number('7,091')` is `NaN`, so the separator also has to be removed where the number becomes one.
`countOf(text)` -- `Number(text.replaceAll(',', ''))` -- is called by every shape and by the bare count, and the
three new cases state the rule rather than today's size: a published count written with separators, a bare
count written the same way (whose refusal must name the whole number, since a bare count cannot be a
current-state row), and two rows with separators where the suite grew -- which the digit-by-digit reader
reported as a fall.

**Falsification.** One new injection in `doc-counts-shapes` restores `Number(text)` in place of the
normalisation; the battery is **15 injections, 15 caught, 0 survived, 0 inert**, and the new one is caught by
exactly the case written for it. `md5`-identical restoration of the gate after the battery, as the battery
requires.

## Finding 668 — the run stopped before it reached the mutant, and the claim was blamed for it

`--bail=1` rides on every mutant run, and it was added for what it costs: a survivor's verdict is the whole
file staying green, so the flag cannot hide one, and a red claimant can stop at its first failure. What no rule
said is that a file's **first red need not be the claim**. A claimant whose first failing test is an unrelated
one -- a probe that timed out, a case that depends on an earlier one, a budget that fired on a different test --
ends the run before the armed exit is ever reached, and the child exits non-zero having recorded no mutant.

The reader was already strict about that state, and correctly: a red without a recorded mutant is a statement
about the file, not about the mutation, so it is refused in its own basket. It was correct about the run and
wrong about the claim, because the claim had never been measured: the file stopped first. The sentence it prints
-- *"which exited 1 with the exit hollowed but never recorded the mutant, so the failure was not the mutant's and
this claim is not proved by it"* -- is true of the run and sends the reader to the wrong repair.

**Found by CI, on the round that shipped the aim.** Run `45804184339`, `sensitivity-shard` (shard 2 of 2):
`112 of 113` claims credited, and the one refused was `scripts/fetch-official.mjs:1002`, claimed by
`fetch-official.test.ts` -- the file the same run had just recorded as holding the longest single test of any
claimant (8 483 ms of its 30 000 ms), and the file that passed on its own and again on the next run of the same
shard (`139 of 139` credited, `0 missed`). One flaky red in a file of 43 tests was enough to turn a claim into a
gate failure, because the run that was supposed to prove it never got far enough to try.

**The repair asks the question of a run that finished.** Claims whose decided run is red and recorded nothing are
measured once more against the whole file **without** `--bail`, and what decides them is that run: recorded and
red is a credit, recorded and green is a survivor, unrecorded is the same refusal in the same words. The extra run
is not a second chance at a verdict -- it is the same question asked of a run that reached the end -- and it costs
one run in the rare case and nothing otherwise.

**Falsification.** Two cases, and they are the two halves: a fixture that stops at an earlier red while bailing
is credited from the whole-file run (`1 claim(s) in 2 run(s)`, `3 run(s)` in the pass line), and a fixture that
records nothing however it is run stays refused with `never recorded the mutant`. Without the second case the
repair would be a device for turning an unproved claim into a proved one.

## Finding 669 — the cost line read the raw transcript, and a runner's transcript is coloured

The gate-test battery prints the price of its own run in two halves, and the second half is the one that decides
what to do next: `cost: 35 run(s), 97.2 s of child time inside 100.3 s of wall clock; 0.0 s of that the suites
reported as their own (0 of 35)`. The comment above that line states the purpose in the instrument's own words --
*"if the sum of those durations is most of the child time, the cost is in the files and the only lever is running
fewer of them; if it is a small part, the cost is 69 cold starts and the lever is amortising them"* -- so the two
numbers are the whole of the evidence for choosing a change.

The second number was zero, on every gate, in every reading. Two consecutive readings of one tree:

| | child time | the suites' own | reported |
| --- | --- | --- | --- |
| reading 54, shard 1 | 101.2 s | **0.0 s** | **0 of 35** |
| reading 54, shard 2 | 167.6 s | **0.0 s** | **0 of 34** |
| reading 55, shard 1 | 97.2 s | **0.0 s** | **0 of 35** |
| reading 55, shard 2 | 232.1 s | **0.0 s** | **0 of 34** |

and the same two shards run here, on the same tree, minutes later: **87.2 s of 107.6** (`35 of 35`) and
**165.3 s of 185.0** (`34 of 34`). One reader, two answers, and the answer that says "unmeasured" is the one the
runner printed.

**The cause is one escape, two dozen lines from a repair that had already been made.** On this machine vitest is
piped and prints `   Duration  1.02s`; on a runner it colourises, and the summary arrives as
`\x1b[2m   Duration \x1b[22m 1.02s\x1b[2m (transform 57ms, …)\x1b[22m`. The dim wraps the **label**, not the
value, so the sequence is `Duration` then a space then `\x1b[22m` then the digits: `Duration\s+([\d.]+)` steps over
the space, meets the escape and gives up. `classify` -- the reader of the same transcript, in the same file -- had
been repaired for exactly this class twice (findings 147 and 148: a `×` line that begins with an escape), and it
calls `stripAnsi`. The function that reads the summary did its own matching on the raw text and never did.

**The repair moves the reader and strips inside it.** `suiteOwnMs` lives in `scripts/gate-proofs.mjs` beside
`classify`, and it strips for itself rather than asking its caller to -- the defect was a caller that forgot, so the
shape that cannot be forgotten is the one to ship. The gate's own copy is deleted, which is the second half of the
fix: two readers of one transcript that keep their own patterns are two readers that can disagree, and this file
had already recorded where that ends.

**Falsification.** Four cases, and two of them are the runner's shape: the dim on the label, and the escapes the
other way round (`Duration  \x1b[1m2.5s\x1b[22m`), because a reader written against one terminal's spelling is a
reader for one machine. The other two hold the ends that must not be confused with a reading: `985ms` is read as
**985** rather than assumed seconds, and a transcript with no summary is **`null`** rather than `0`, so silence
cannot be averaged in as a fast suite. Restoring the raw read turns exactly the two colour cases red --
`expected null to be 1020` and `expected null to be 2500` -- and the file is restored byte-identical (`md5`).

**What this does not claim.** Not that the number was needed to choose the next cut: the local readings already say
**81%** and **89%** of the child time is the suites' own, so the lever is fewer tests rather than fewer process
starts, and that conclusion did not wait for the runner. What is claimed is narrower and worse: the half of the
line that exists to name the lever printed `0.0 s` in place of `unmeasured` for two readings, and a summary that
prints a zero where it means "could not read it" is the same defect as a gate that passes on a number it never
measured -- a sentence true of the file and silent about the tree.

## Finding 670 — the suite a test is written in was read as the first suite in the file

`check-test-budgets` compares a file's slowest test with the budget **in force where the test is written**, and its
reader put four numbers in order: the test's own, its suite's, the file's largest stated number, and nothing. The
second of those was `suiteBudget(source)`, whose doc comment read *"The budget a `describe` states, which is the one
the test runs under"* and whose body returned **the first `describe` in the file**, in document order, with no
knowledge of where the test is. That sentence was true of the tests in the first suite and of no others.

Two files in this tree are the shape, and neither was red:

| file | top-level suites | suites stating a clock | its slowest test | the reading before | what decides that test's verdict |
| --- | --- | --- | --- | --- | --- |
| `gate-steps.test.ts` | 21 | 1 (4 000 ms) | 212 ms | `4 000 ms, the one its suite states` | vitest's 5 000 ms default -- the suite it is written in states nothing |
| `probe-built-module-guards.test.ts` | 2 | 0 | 317 ms | `30 000 ms, the largest number the file states` | the default -- the 30 000 ms is two tests' own positional budget |

Both verdicts are unchanged by the repair, because both tests are far under the 1 000 ms floor. What was wrong is
the reading and the sentence: a number no test runs under, printed as "the one its suite states". The direction that
matters is the other one, and it is the one this gate exists for: a file whose **first** suite states 120 000 and
whose second states nothing had every test in the second measured against 120 000 -- so a 1 026 ms test read
`0.01 of 120 000` and passed, and the floor rule could not fire either, because the file "states a budget". That is
exactly the shape `ci-budget.test.ts` was in when this gate named it on run `45841748590`, and the declaration that
answered the run was then read file-wide by the same defect.

**The repair resolves the position instead of guessing it.** `testOffset` finds the `it`/`test` call a report means,
`suiteBudgetOf` returns the **innermost** enclosing `describe` that states a number -- the one vitest's inheritance
would give the test, since a nested suite without a number is not a boundary -- and `budgetInForce` asks those two
before it asks the file. Two details are load-bearing because a title is not an address: a file that writes
`it('a test')` twice has two positions the title cannot tell apart, so a candidate is confirmed only when the
`describe` titles a report prints in front of it spell the same prefix; and a suite titled with a template literal
(`describe(`` `scripts/${GATE} · …` ``)`, the shape `reader-against-backend.test.ts` uses) cannot confirm anything,
so a candidate is taken when it is the **only** one, which is the honest limit of what the reader can know.

**The sentence changed with the reading.** The last arm printed `the file states no budget`, which is false about a
file that states one on a sibling suite -- and after the repair that file answers `none`. It prints
`neither the test nor the suite it is written in states a budget`, which is true in both shapes. The summary's own
counter moved with it: `N state a budget` counted *readings* rather than files, so a file that states four numbers
would have been counted as zero. On this tree the repair changes the reading of **2 of 262** files and the verdict
of none, and the counter reads **44** files stating a budget, of which **20** hold a test at or above 1 000 ms.

**Falsification.** The `SIBLINGS` fixture in `timeout-budget.test.ts` is the smallest file that exhibits the defect
-- one suite stating 120 000, a sibling stating nothing, one test in each -- and under the old line its second
assertion reads `{ ms: 120_000, statedBy: 'suite' }` where it now reads `{ ms: 0, statedBy: 'none' }`. Two more
cases fall with it: the nested one, where a `describe` that states nothing must not become a boundary, and the
end-to-end one in `check-test-budgets.test.ts`, where a fixture with a budgeted first suite and a 1 026 ms test in
an unbudgeted second is **green** under the old reader and red under this one. Restoring the old line turns those
three red; the file is restored byte-identical (`md5`).

**What this does not claim.** That any file was mis-verdicted. No test in this tree sits in the guilty shape with a
cost near the floor -- the two files that do sit in it are 212 and 317 ms -- so this is a hole found by reading the
code against its own comment, not by a red run. What is claimed is narrower: the number the gate published as the
clock of a test was, for 2 of 262 files, a number that test never ran under, and the rule that would have caught the
next such file could not fire because the file stated a budget somewhere else.

## Finding 671 — two readers of one question, and the fifth spelling only one of them knew

`budget-readings.mjs` opens with a paragraph about spellings: a reader that knows fewer of them "fails in the
direction of a false red and this repository has paid for that three times", naming `reader-against-backend.test.ts`
(`{ timeout: SUITE_BUDGET_MS }`), `fetch-official.test.ts` (`300_000` positionally) and `check-cli-reference.test.ts`
(an inline object on each of six tests). It then lists four spellings. There are five: `vi.setConfig({ testTimeout:
15_000 })` gives every test in a file a clock without naming a suite, and `site-proofs.mjs::testBudgetDeclarations` --
the reader that prices a claimant's own budget for the gate-test battery -- has read it since v3.155.

So the tree held two readers of one question. A file whose only declaration is that one read as **15 000 ms** to the
battery and as **"states no budget"** to `check-test-budgets`, and the second reading is the loud one: the floor
rule fires on a file with a test at 1 000 ms, demands a budget, and the budget it demands is already there. No file
in this tree uses the spelling today -- the case that pins it drives a one-line fixture -- which makes this a latent
defect of exactly the kind the module's own header records three times.

**The repair is the fifth arm.** `setConfigBudget` reads `setConfig({ testTimeout: … })`, resolving a name against
the file's `const` the way the other four do, and `budgetInForce` consults it between the suite and the fallbacks.
It is its own arm rather than a value folded into `statedBudgets`, because the number a file sets this way is not a
bound on one test or one suite -- it is the file's own clock, and `STATED_BY` now has a fourth sentence for it:
*the suite-wide default the file sets through `vi.setConfig`*. The gate's `STATED_BY` set assertion is what keeps
that honest: it compares the arm set as a set, so an arm with no sentence fails a test rather than printing
`undefined ms, undefined, which is 0.94 of it`.

**Falsification.** Four cases: the spelling read as a literal, read as a name, a name the file does not declare
(which must answer `undefined`, not `0`), and a file that sets 15 000 while one test states 60 000 -- where the
answer must stay 15 000, because 60 000 was never the clock of anything but that test. Deleting the arm turns
that case red -- `expected { ms: 0, statedBy: 'none' } to deeply equal { ms: 15_000, statedBy: 'file' }` -- and deleting
its sentence from `STATED_BY` turns the arm-set case red instead (`expected [ 'largest', 'suite', 'test' ] to deeply
equal [ 'file', 'largest', 'suite', 'test' ]`). The pair is what keeps an arm and the sentence it prints together: the
gate indexes that table without a guard, so an arm with no sentence prints `undefined ms, undefined, which is 0.94 of
it`, and an arm whose test was deleted is the way that happens.

## Finding 672 — a heading's line number is not its file, so the newest round judged another volume's record

`check-open-list` decides which record is the **newest round's** by taking the highest round it can see and then
keeping the records whose owner is that round:

```js
const sameHeading = records.filter((one) => one.owner.line === newestRound.line);
```

`owner` is the round heading a `### Left open` sits under, and `line` is its index **within its own file** -- the
corpus is one document read across 261 files, so every file has a line 1,461. `v3.159`'s heading is at line 1,461 of
`volume-22.md` and `v2.50`'s is at line 1,461 of `volume-05.md`, and the filter -- which compared the line and
nothing else -- handed this arm `v2.50`'s record.

The verdict was two problems that no round had written:

```
docs/progress/volume-05.md: the v2.50 record names a residual the list does not hold -- "**A path built by one module
and passed to another is still " appears in no entry of `## Open` or `## Closed` ...
```

and the round whose record the arm was asked about was never judged at all -- its own line, `the v3.159 record's 1
row(s) were judged`, was replaced by `the v2.50 record's 0 row(s) were judged`. Both statements are about a document,
and the document they were about was the wrong one.

**The repair is the file in the key.** `records.filter((one) => one.label === newestRound.label && one.owner.line ===
newestRound.line)`, where both labels are the file the heading was read from -- the round object has carried `label`
since it was built, and the filter simply did not ask for it. The corpus went from two problems and a wrong subject to
`the v3.159 record's 1 row(s) were judged, and every one of them matches an entry on its first 20 characters`.

**Falsification, and the gap it names.** Restoring the line-only filter reproduces both messages on the shipped tree,
which is the state this round found: that is the falsification, and it is not a fixture. A case cannot hold it,
because a collision needs two files with a heading at one index and this guard reads its volumes from the shipped tree
-- a fixture would need a switch for the volume directory that no case in `check-open-list.test.ts` has. So the line is
covered by the shipped-corpus case and the *collision* is not, which is stated here rather than counted as covered.

**What this does not claim.** That a reader of the gate would have noticed from the numbers: the sentence it printed
named `v2.50` and the round it was judging was `v3.159`, and the only reason this was caught is that the round writing
itself up was the round whose heading made the collision true.

## Finding 673 — an injection paid for the whole file its witness lives in

`gate-tests-battery.py` proves each of its 66 injections by running **the whole test file** the gate is tested by.
That file's other tests are not evidence about the guard, and their runtime is charged to it all the same. Measured
on this tree at v3.159, one process at a time, in the table's own order:

| file | injections | whole file | charged | share |
| --- | --- | --- | --- | --- |
| `check-cli-reference.test.ts` | 5 | 23.9 s | **120.6 s** | **46.4%** |
| `gen-examples.test.ts` | 10 | 4.3 s | 42.7 s | 16.4% |
| `check-official-roundtrip.test.ts` | 3 | 11.3 s | 33.7 s | 13.0% |
| `build-example-bundle.test.ts` | 5 | 3.5 s | 17.1 s | 6.6% |
| the other 14 files | 42 | <= 2.8 s each | 45.9 s | 17.6% |
| **total** | **65** | | **260.0 s** | |

The first row is 46% because its ten tests each spawn the real CLI, so `CLIREF 5` spends 24.4 s proving one guard and
8 s of that belong to tests it never looks at. This is the same shape the sites battery had until v3.158, and this is
the same device on it: the report of a run already names the test that failed, the table records it, and the next run
is aimed at that test with `--testNamePattern`.

**The rule, which is the whole of the design.** An injection with a recorded witness costs at most two runs:

| the aimed run did | what it decides |
| --- | --- |
| went red, with the row's declared witnesses among the failures | the row -- one test depends on the guard |
| stayed green | nothing: the tests the aim skipped never ran, so the **whole file** decides |
| went red on another test | nothing: the aim matched something, which is not a claim about the guard |

Only `CAUGHT` can be read off an aimed run, and the two ways it can miss are counted and printed separately
(`aim: 65 held, 0 missed, 1 without a witness`). The one row without a witness is the injection declared to survive,
which has no failing test to aim at.

**Why the table records the fewest titles.** The first table recorded every failing title -- **189** across the 65
rows -- and a removed guard often breaks a dozen tests (`README 1` breaks 12). `attribute` asks whether each declared
witness appears among the failures, so one failing title per witness is enough: `witness_titles` keeps the first title
containing each, and the table drops from 189 titles to **78**, which is exactly the number of witnesses the rows
declare. Where a witness matches no failing title the row records every title instead, because a title `-t` cannot
match would make the row miss on every run.

**Measured, the same machine, the same tree, one process at a time:**

| run | child time | slowest injection |
| --- | --- | --- |
| whole files (`--witnesses`, v3.159 tree) | **260.5 s** | 24.4 s (`CLIREF 2`) |
| aimed (v3.160) | **77.4 s** | 4.5 s (`CLIREF 1`) |

**3.37x**, 65 of 65 aims held, 0 missed. The first 41 s of what is left is `CLIREF`'s five witness tests
(1.4--4.5 s each, all of them spawning the CLI); the rest is 66 process starts at ~0.9 s.

**Falsification, nine mutations, each caught by the test that names it:**

| mutation | red |
| --- | --- |
| `plans = [None]` -- never aim | 5 tests, including both fallback arms |
| `if False:` -- any aimed verdict decides | 6 tests |
| `escape_pattern` returns the name | the escaping case |
| no ` > ` -> space join | the two-spellings case |
| the whole title compared in the reconciliation | the shipped-table case |
| `named_tests` instead of `witness_titles` | the writing-mode case |
| the writing run aims too | 2 tests |
| the missing-row check removed | the reconciliation case |
| `aimed_held += 1` removed | the counter case |

**What this does not claim.** That the floor is now the tests: it is the **number of injections**, one process start
each, and the only lever under it is fewer injections or a runner that can be aimed at several files at once -- which
this battery cannot be, because every injection needs the tree to itself. Nor that the two shards of
`verify-gates-are-testable` are balanced: they are still positional and still read 97 s against 232 s, and a table of
per-gate seconds is what would divide them, exactly as this table divides nothing.

## Finding 674 — a test's printed name is not the name `-t` matches

The battery's first table recorded the failing titles **as the runner printed them**, and every aim built from it
missed: `0 held, 65 missed (no_red 65)`, each row paying for an aimed run that collected nothing and then for its
whole file -- 77 s of measurement turned into 150 s.

The cause is two joins of the same segments. The reporter prints a failure with `getTestName(task, ' > ')`, which
joins the enclosing suites with ` > `; the filter matches `getTaskFullName`, which joins them with a **space**:

```js
function getTaskFullName(task) {
  return `${task.suite ? `${getTaskFullName(task.suite)} ` : ""}${task.name}`;
}
```

Measured on this tree, `check-readme-sample.test.ts`, same commit, one after the other:

| `-t` pattern | result |
| --- | --- |
| `… · what it asserts about a good sample > executes a sample block and reports it by number` | `1 skipped`, `9 skipped` |
| `… · what it asserts about a good sample executes a sample block and reports it by number` | `1 passed | 8 skipped` |

Both exit 0. The first is the whole of the defect: a pattern that matches nothing is indistinguishable from a run
whose tests all passed, and the battery's own fallback then paid for the file twice.

**The repair is one substitution in one place.** The table keeps the printed form -- it is the string a reader greps
the log for, and the string the reconciliation can hold against a test file -- and `aim_pattern` replaces ` > ` with a
space before escaping. A title that itself contains ` > ` is mangled by that substitution; the pattern then matches
nothing, the row falls back, and the cost is one run. No title in this tree contains one.

**The same defect in the reconciliation, one layer over.** `aim_problems` compared each recorded title against the
test file's **source**, and the printed form never appears there: `describe('scripts/build-example-bundle.mjs · what it
refuses')` and `it('refuses a stale archive')` are two statements, and `… > refuses a stale archive` is one string the
file does not contain. The first run after the table was written reported **65 of 65** rows as holding a title no test
file has -- a reader accusing every row of the table it had just been handed. The check now compares the last segment,
which is the test's own title; a stale *chain* is caught by the run rather than by the reader, because the aim then
matches nothing and the row falls back as a counted miss.

**Falsification.** Deleting the join turns the two-spellings case red; restoring the whole-title comparison turns the
shipped-table case red with `'scripts/… > refuses a stale archive' is not a test title in
build-example-bundle.test.ts`.

**What this does not claim.** That `-t` is an address: two tests with one title in different suites are one pattern,
and `attribute` cannot tell them apart either -- it asks whether the declared witnesses appear among the failures, and
a duplicate title makes both appear. The aim inherits that limit rather than creating it.

## Finding 675 — a division by position is a division by nothing

`verify-gates-are-testable.mjs` runs 69 gates, each by emptying one script and running the test files that name it.
Since v3.154 the two jobs that run it have been divided **by position**: gate `i` goes to shard `i mod n`. The reason
was written down twice, in the gate and in the workflow: *a split by measured seconds would have to be re-derived
after every run and would put the same gate in different shards on different machines*, and a plan in `ci.yml` and a
plan a test checks have to be the same plan.

Both halves are true of **live** seconds and neither is true of a **committed table** -- which is the argument
v3.157 already made for the sites battery, one directory over, and the same device it used: a file in the repository,
read by every machine, re-derived only when the tree changes, with a verdict that refuses it when the tree has moved.

**What position cost, measured on the runner.** The two steps are `Every gate can be shown to fail` (inside
`batteries`) and its shard 2 (inside `gates-audit`), and the workflow's wall clock is the slower of the two:

| reading | shard 1 | shard 2 | apart | the plan's arithmetic |
| --- | --- | --- | --- | --- |
| 59 (`45847128112`) | 118 s | 198 s | **40.4%** | 0.0% |
| 60 (`45853859064`) | 149 s | 239 s | **37.7%** | 0.0% |
| 61 (`45928458435`) | 146 s | 241 s | **39.4%** | 0.0% |

Three readings, three signs of the same thing: the ordering knows nothing about price, so the two halves differ by
two to three minutes and the job that finishes first waits. The bound on each step is sized from the slower one, which
is the bound the faster job never needed.

**The repair is two halves of one device.** `--costs <path>` writes `golden-master/gate-costs.json` from a run that
measured **every** gate -- one row per gate, the milliseconds its own nested runs cost and how many test files it ran --
and `--shard i/n` divides that table by longest-processing-time first, through the `assignShards` the sites battery has
used since v3.157. No second placement rule: the price is checked in the gates' module first so a missing row names
`gate-costs.json` rather than the sites table, and the partition itself is one function.

| | |
| --- | --- |
| the table this round ships | 69 gates, **287.5 s** of child time on this box, dearest `check-official.mjs` at **28.4 s (9.9%)**, mean **4.17 s** |
| what position leaves | **106.0 s / 181.6 s**, **41.6%** apart |
| what the table leaves | **143.1 s / 144.4 s**, **0.89%** apart, 34 and 35 gates |
| the four refusals | no table; a table with no row for a gate; a table with a row for a gate the inventory does not have (and a file count that disagrees); `--costs` beside `--shard` or `--list`, or on a run that did not measure every gate |

**What it does not claim.** Not optimality: dividing indivisible subjects is bin packing, and LPT is a 4/3
approximation. Not portability of the seconds: the table is one machine's afternoon, which is why the plan is a pure
function of the file rather than of a run. And not that a stale table is caught in general -- the check holds the gate
set and each gate's file count, so a test file that grows under the same name leaves a table that is stale in the
direction the verdict calls fine, and only a re-measure finds it. That hole is stated in the module rather than
guarded, because a check that claimed to cover it would be reading something adjacent and calling it the property.

**Falsification.** `gate-costs.test.ts` divides the shipped table with both rules and asserts the plan's gap is
smaller than position's on the same numbers -- the one claim that would make the round pointless if it were false.
Deleting the table read turns the missing-table case red; making the placement positional again turns the
`--list --shard` case red against the plan; dropping a row from a fixture table turns the stale-table case red with the
gate's own name. And `verify-sites-are-sensitive` falsified the new claim once on its own: the refusal for a gate
`gateShardPlan` cannot price was asserted loosely enough to accept `assignShards`' sentence next door, so replacing
that throw with success left the test green -- `scripts/gate-proofs.mjs:498 ... the file passes with that exit replaced
by success`. The assertion now names this table's own sentence.

## Finding 676 — a fingerprint of the set is not a fingerprint of the files

**Defect.** `golden-master/gate-costs.json` pins, per gate, how many test files name it. The set is the part that
moves when a gate arrives or loses a naming file, and `checkGateCosts` refuses the table when it moves (§ Finding 675).
The part that moves *inside* the set moves every round and nothing looked at it: a test file keeps its name and grows,
a `describe` gains a case, a fixture doubles, and the table goes on balancing two halves by numbers measured on a tree
that no longer exists -- stale in the direction the file count calls fine. `O-146` was that sentence, and it had been
true of `sensitivity-costs.json` since v3.157 with the same silence.

**Reproduction, and the first number the repair printed.** The row was written as a reading before it was written as
code. Re-measuring the gates' table with the instrument the round added, against the tree that shipped it:

```
half: the table prices the gate(s) this run measured at 287.5 s; they spent 282.9 s (-1.6%)
```

The table v3.161 shipped was **1.6%** heavy on this afternoon's tree -- small, and unreadable before this round: the
ledger could say what the table claimed (287.5 s) and what the runner spent (reading 62: shard 1 133 s, shard 2
163 s), and nothing could say what the *table* would say about *this* tree, because no row carried anything about its
own inputs except a count of files.

**Fix.** Every row carries `lines` -- what its naming files held when the milliseconds were measured -- written by the
same pass that measured them: **69** gates, **282,873 ms**, **231,939** lines, **235** file executions over **95**
distinct files, dearest `check-official.mjs` at **27,857 ms (9.8%)**. The plan is **140.8 / 142.1 s** (**0.89%**)
against **102.7 / 180.1 s** (**43.0%**) for the same numbers split by position. Two sentences are printed by every run
that measured a gate: the **drift** of the tree from the table (total change, and the widest gate by name), and the
**half** -- the price the table put on the gates this run measured, against the seconds they spent.

**What was deliberately not built.** A verdict on `lines`. It would fire on the harmless case with the same force as
the harmful one -- the tree cannot tell a one-line comment from a threefold growth -- and it would make every round
that edits one gate's test file an order to re-measure all 69 on a laptop (**282.9 s** here). A gate that fires on the
harmless case is a gate that gets re-measured by habit, and a habit is what the ledger's own history warns about. What
*is* a verdict is the shape: a row with no `lines`, a `lines` that is not a count, and a `lines` of zero are refused,
because a run would otherwise print a drift total that silently left a gate out -- blank reads as zero.

**Falsification.** Two new tests and three new refusals. The drift arithmetic, which the round got wrong first: the
assertion said one gate tripling (+200 of 150) is `+100%`, and the run answered `133.33333333333331` -- the defect was
in the test, and it is recorded here because the numbers in this file are the ones a reader checks. Then the ordering
(50 lines of growth outranks 10 even when it sorts later), the unread end (`to: null` ranked by its whole size rather
than by `0 - from`, which would have ranked the largest unknown last), `null` for nothing to compare, and a spawned
shard run whose two sentences are asserted by their numbers (`40 line(s)`, `this tree holds 2 (-95.0%)`,
`40 -> 2 line(s)`, `at 10.0 s`).

**Two counting accidents, and what they say about addresses.** Inserting the reader moved **17** rows of
`gate-sites.json`, and exactly one annotation did not carry -- the "no cost table" exit, whose condition changed from
`catch` to `table === undefined` when the parse moved into `costTable()`. `sensitivity-costs.json` had **16** witness
keys keyed by `script:line`: 15 renumbered by site identity (condition and diagnostic), 1 by that same identity
change; the battery then re-measured the seconds itself. An address is not an identity, and this round had to use the
identity to move the addresses -- which is `O-146`'s own lesson one level down.
