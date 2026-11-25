# Audit · volume 15

Findings 651–652, from the rounds recorded in `progress/volume-20.md` as `v3.148` and `v3.149`.

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
