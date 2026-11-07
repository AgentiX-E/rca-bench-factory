## Finding 351 — a keyword was a substring, and `parameter` paid for `ram`

Finding 347 made a keyword a **content** word: `FUNCTION_WORDS` filters the closed class out, and the
description is split on punctuation as well as whitespace. It left the other half of "what is a keyword"
untouched — *how the token is looked for in the reason* — and the answer in the shipped code was
`String.prototype.includes`:

```ts
return tokens.some((token) => head.includes(token));
```

A substring test. It reads as a containment check and it is a letter check, so a token of three or four
letters finds itself inside words that have nothing to do with the fault.

### The measurement

A key whose `fault_description` is `ram pressure on the order service`. Its content tokens are `ram`,
`pressure`, `order`, `service`. The submission's reason is `the parameter changed` — a sentence that names no
component of the fault:

| reason | TA before | TA after | Final_A before | Final_A after |
| --- | --- | --- | --- | --- |
| `ram stayed above 90%` | 1 | 1 | 100 | 100 |
| `the parameter changed` | **1** | **0** | **100** | **60** |
| `a program reconfiguration` | 1 | **0** | **100** | **60** |

`parameter` contains `ram` at positions 3–5, and `program` contains it at 5–7. Neither sentence claims the
fault, and both collected the 0.4 that a correct reason collects. The predicate was measured against a
one-sentence fixture (`CPU saturation on the order service`) whose tokens happen not to sit inside any word
of the reasons the suite uses, which is why two passes over this term did not see it.

### The fix

Both sides are tokenised by the same function, and the comparison is set membership:

```ts
function reasonWords(reason: string): ReadonlySet<string> {
  return new Set(descriptionWords(firstWords(reason, 20)));
}
```

The direction is the one finding 347 argued: a membership test can only remove credit that the fault did not
put into the description, because it accepts a strict subset of what `includes` accepted. The control in the
same test asserts the other direction — a reason that says `ram stayed above 90%` is still credited — so the
repair cannot be "refuse everything" wearing a narrowing's clothes.

`descriptionWords` is shared by both sides deliberately. A comparison that tokenises one operand and
substrings the other is not a comparison, and that asymmetry is exactly what the defect was.

## Finding 352 — the Exp. clause said both sides are cut to twenty characters, and only one was

`golden-master/aiops2025-evaluator.json` carries the clause, quoted from §4.4:

> each observation contributes only its first 20 characters, again to suppress keyword stuffing

and its `why` said, in the shipped file:

> Both sides are cut to 20 characters, so two observations that agree on the first 20 and differ afterwards
> count as the same evidence point.

The code cut one side:

```ts
const cited = pred.evidence.map((e) => e.slice(0, 20));
const exp = rateOf(cited, gt.evidence);
```

`gt.evidence` is the answer key's own strings, whole. When a key's observation is longer than twenty
characters, the comparison is twenty characters against twenty-three, and no submission can match it — not
even one that copies the key's text exactly.

### The measurement

A key declaring one observation, `order|cpu_usage|1234XYZ` (23 characters), and a submission citing that
string:

| submission | Exp. before | Exp. after |
| --- | --- | --- |
| `order|cpu_usage|1234XYZ` (the key's own text) | **0** | **1** |
| `order|cpu_usage|1234XYZand more` | **0** | **1** |
| `order|cpu_usage|9999XXX` | 0 | 0 |

The middle row is the clause working as published: the first twenty characters agree, so the tail is not
compared. The first row is the defect: the answer key's own words, unreadable to the reader.

### Why the existing test could not see it

`an evidence point is its first twenty characters` pins both directions and passes on the old code, because
its key is **exactly** twenty characters (`order|cpu_usage|1234`) — the one length at which cutting one side
and cutting both sides are the same comparison. That is the general hazard of a boundary test: it must sit on
the boundary, and a boundary chosen by the length of the fixture tests the fixture.

The new case is twenty-three characters, and the second assertion in it re-states the published rule so the
fix cannot become "compare the whole string".

### The disposition

Both sides are cut, and the two cuts live one line apart so a future edit to the constant has one place to
land. `E_t` is still the number of observations the key declares — the cut is a comparison rule, not a count.

## Finding 353 — `E_m` counted citations, so one evidence point cited five times scored 140

The same clause defines both quantities:

> E_m / E_t, where E_t is the total expected evidence points (the union of the GT's key metrics and key
> observations) and E_m the count hit in any of the agent's trace observations

`E_t` counts **points**. `E_m` was computed by counting the agent's **citations**, and the two are the same
number only when an agent cites each point once.

### The measurement

A key declaring one observation, and a submission citing it five times:

```
key        observations = ['order|cpu_usage']
submission evidence     = ['order|cpu_usage' × 5]

Exp. before     5        (five citations, one point)
Exp. after      1
Final_A before  140      ← above the metric's own ceiling
Final_A after   100
```

140 is not a rounding artefact. Three of the four terms are rates in `[0, 1]`; this one was a ratio whose
numerator had no upper bound, so the headline could exceed the maximum the formula is defined by, and nothing
in the report refused it. A submission that has nothing to say could therefore beat a correct one by
repeating a single line.

### The fix, and what it is not

`intersectCount` now returns the size of the **distinct** hit set. Not a clamp: clamping would print `1` for
the same submission while leaving the numerator counting citations and the denominator counting points — a
report whose two halves are different quantities, which is the defect finding 348 recorded one field over.
Counting distinct points makes the numerator the thing the denominator is a count of.

The three other callers of `rateOf` (`openrca-2.0`'s chain and conditions, `rca100`'s chain and checkpoints,
and the `chain`/`evidence` facets) divide by a count of expected items in exactly the same way, so they get
the same guarantee from the same change: a coverage rate is at most one. No published reading moved, because
no shipped prediction cites one point twice — which is the reason this was invisible and not a reason to
leave it.

## Finding 354 — an empty component matched an empty key, and LA paid for two absences

`LA` is strict equality, with one relaxation:

```ts
return pred.component === gt.component || gt.alternatives.includes(pred.component);
```

`'' === ''` is true. A `groundtruth.jsonl` line whose `service` is missing — or, on a pod-level line, whose
`instance` is missing — produces an empty component, and a submission whose component is also empty compares
equal. The relaxation cannot admit the empty string: `alternatives` drops empty endpoints when the key is
read, and `readAioPs2025GroundTruth` filters `endpoint !== ''`.

### The measurement

| key `service` | submission component | LA before | LA after |
| --- | --- | --- | --- |
| `''` | `''` | **1** | **0** |
| `order` | `''` | 0 | 0 |
| `order` | `order` | 1 | 1 |

The empty submission is what `emptyPrediction()` produces for a case the submission does not answer — a
shorter submission, a submission exported from a different bundle — so the defect pays 0.4 of Final_A for
naming nothing against a key that names nothing. This is the free-denominator family (findings 2, 5, 6, 159)
in its narrowest form: the denominator exists, and it is empty of content.

### The fix

An unnamed key names nothing, and nothing matches it:

```ts
if (gt.component === '') return false;
```

The third row of the table is asserted in the same test, so the change cannot be read as "localisation got
stricter in general".

## Finding 355 — the one red that left no message left it in the arm that formats the failure

The open list carried this line since v3.36: one full run reported
`battery-summary-survives-ci-output.test.ts` red, the dot reporter did not keep a message, and three
subsequent runs of the same bytes were green at 5 658 tests. It was recorded rather than explained.

Part of that is the reporter. Part of it was the file's own failure arm, and that part is fixable:

```ts
const result = spawnSync('python3', [script], { encoding: 'utf8', timeout: 30_000 });
if (result.status !== 0) {
  throw new Error(`python3 exited ${result.status}: ${result.stderr || result.stdout}`);
}
```

`spawnSync` reports a child that was never started and a child that was killed as `status: null` with
`stdout` and `stderr` both `null`. The arm above formats that as `python3 exited null: ` followed by nothing,
so the assertion failure that follows carries no reason at all — the shape the open list described as "message
not preserved".

### The measurement

The same arm, driven by an interpreter that does not exist:

| interpreter | message before | message after |
| --- | --- | --- |
| `python3` | — | — |
| `/nonexistent/python3` | `/nonexistent/python3 exited null: undefined` | `/nonexistent/python3 did not run: spawnSync /nonexistent/python3 ENOENT` |

The mutation that produced the middle column is the regression guard: the new test was run against a copy of
the file with the new arm disabled (`result.error === undefined && result.status === null`), it failed with
that exact message, and the file was restored byte for byte (sha256 compared before and after).

### What this does not explain, and says so

It does not identify why the child did not run in that one full-suite run. `packages/core/vitest.config.ts`
records the mechanism that produces exactly this signature — a child killed mid-allocation "exits 1, which the
assertion under it reports as a broken subject" — and the worker cap of 8 is headroom bought against it, not
a proven repair. What this finding establishes is narrower and worth having: the next occurrence will arrive
with its reason attached, because the arm that swallowed it is gone.

The interpreter is a parameter of `runPython` for that reason: a branch about a process that cannot start is
only testable by asking it to start one that cannot.

## Finding 356 — the writer said `nothing was written`, and it had already written

`measure-doc-counts.mjs --write-doc` exists to move two files at once — the snapshot
`golden-master/doc-counts.json` and the published rows in `docs/progress/` — because a refusal
between the two writes leaves a snapshot that advanced and a document that did not. Its own header
says so:

> Both computations before either write. A failure between the two writes would leave the snapshot
> advanced and the document stale -- the exact half-state this flag exists to remove.

The order in the code was: rewrite each document and **write it**, then check whether the corpus was
complete, then refuse. The refusal message is `the published rows cannot be rewritten, so nothing was
written`.

### The measurement

A document with three rewritable current-state rows and one duplicate:

```
before  | `core` test suite | **160 files, 3947 tests passed** (as of this commit) |
        | `cli`  test suite | **4 files, 187 tests passed**     (as of this commit) |
        | repo   test suite | **164 files, 4134 tests passed**  (as of this commit) |
        | `core` test suite | **1 files, 1 tests passed**       (as of this commit) |   ← duplicate

run     node scripts/measure-doc-counts.mjs --write-doc --doc <that file> --from <two reports>
exit    1
stderr  the published rows cannot be rewritten, so nothing was written:
          <file>: line 18: a second current-state row for 'core'

after   | `core` test suite | **1 files, 5 tests passed**        (as of this commit) |   ← rewritten
        | `cli`  test suite | **1 files, 2 tests passed**        (as of this commit) |   ← rewritten
        | repo   test suite | **2 files, 7 tests passed**        (as of this commit) |   ← rewritten
        | `core` test suite | **1 files, 1 tests passed**        (as of this commit) |   ← duplicate, kept
```

The snapshot was not written. So the run produced exactly the half-state the flag was built to
prevent, and reported that it had produced nothing — a writer that lies in the direction that matters,
because the reader's next action is to fix the duplicate and re-run, from a document that has already
moved.

### Why the existing test could not see it

`writes neither file when the document cannot be rewritten` uses `# no rows at all`: a document with no
rows is one the rewriter does not change, so `nothing was written` was true there **for a reason that
has nothing to do with the refusal** — the write it would have made was empty. The half-state needs a
document that *is* rewritable and *is* refused, which is the case above.

### The fix

The rewritten text is collected in a list and written only after every file has been accepted:

```ts
for (const one of pending) writeFileSync(one.path, one.text);
writeFileSync(out, text);
```

The message stays word for word, because the message was right and the code was not. The new test
asserts the claim rather than the message: the document is compared byte for byte against what it was
before the run, and the snapshot is asserted absent.

## Finding 357 — `provedBy` named a file that never reached the exit

`golden-master/gate-sites.json` records, for each of its failure sites, the test file that proves
it. Three rules in `gate-sites-are-proven.test.ts` read that column:

- rule 3 asks whether the named file **mentions** the script;
- rule 7 asks whether the named file **executes** it, at file level;
- rule 2 asks whether a status was given at all.

None of them is site level, and the inventory's own sentence is site level: *this test makes this
exit fire*. A file that runs a gate fifteen times for one exit satisfies all three while never
reaching a sixteenth.

### The measurement

`process.exit` is the one point every failure site passes through, so the question is answerable by
observation rather than by reading. A `--require` hook replaces `process.exit` in every descendant,
records the innermost frame that is a script under `scripts/`, and then calls the original:

```
NODE_OPTIONS=--require=<hook> RCA_SITE_TRACE=<log> node <vitest> run test/<claimant>.test.ts
```

One child per claimant file, because pooling the files answers "was this exit reached by somebody",
which is not the claim. Run against the tree that prompted it: **96 claims, 43 files, 119 s**.
Two were false.

| site | published witness | what the hook saw |
| --- | --- | --- |
| `scripts/check-cli-reference.mjs:51` | `check-cli-reference.test.ts` | `…:301` only — the empty-table exit was reached in `gates-are-testable.test.ts` |
| `scripts/verify-scorer-stability.mjs:306` | `verify-scorer-stability-script.test.ts` | no `scripts/verify-scorer-stability.mjs` line at all |

The first is a pointer one branch off. The second is worse: the file was named, the file drove that
script, and not one of its fifteen exits was the one claimed.

### The repair, and why it is not an edit to the pointer

Re-pointing the first claim at `gates-are-testable.test.ts` would have made the inventory true and
the file's own header false -- `check-cli-reference.test.ts` said, in a paragraph written when it was
first drafted, that *"`gates-are-testable.test.ts` already covers this gate's first exit"*. Both were
true in different senses: the exit was reached somewhere and nothing in that file reached it. So the
witness was made real instead: the file now has a case that writes a reference with no command table
and asserts the refusal, and the header says the duplication is deliberate -- one file proves the gate
is testable, the inventory names a witness for the exit.

`check-cli-reference.test.ts` now fires line 51. That is the difference between an inventory and a
claim: it was fixed by producing the evidence rather than by moving the label.

### The gate

`scripts/verify-site-proofs.mjs` runs the measurement above for every claim and fails naming the site
and the file. It is wired into `pnpm lint`, which the `verify` job runs, so the next false pointer
fails a build. Its four verdicts -- a missing inventory, an inventory with no claim, a claim that did
not fire, a claimant that could not be run -- are each driven by `site-proofs.test.ts` through
`RCA_SITE_PROOFS_*` environment variables, since none of the four can be produced against the shipped
tree.

The three static rules stay. They are a pre-check that costs milliseconds; this is the experiment that
costs two minutes. A gate that has to run the suite to answer a question is not a replacement for one
that reads the file, and the reading was never wrong -- it was answering a smaller question than its
sentence.

## Finding 358 — the arm that reports a failed property had never executed

`scripts/verify-scorer-stability.mjs` ends with

```js
if (failures.length > 0) {
  console.log(`FAILED: ${failures.length} propert(y/ies)`);
  process.exit(1);
}
```

and `verify-scorer-stability-script.test.ts` has six cases whose names all say *refuses*: an
unparseable dataset, an empty expectation, a duplicate id. Every one of them drives the gate through
`parseGoldenDataset`, which throws before the first `check()` runs. The gate's refusals were all
**parser** refusals, and the property-failure arm -- the one that says *the scorer broke a property*,
which is a different repair -- had never run in any test, any job, or any local invocation.

The two arms are not interchangeable. A parser refusal means the dataset is unusable; a property
failure means the instrument is broken. Reading the first as evidence for the second is the shape this
volume opened with.

### The case that reaches it

One sample. The mixed fixture answers the first sample's every expected field correctly, so
`samplesWithMisses` is 0 while the graded count is 1, and the check that requires the two to differ has
nothing to differ with:

```
before:  six "refuses" cases, all of them parser refusals; line 306 unexecuted
after:   13 cases, one of which reaches the property arm
```

The gate is right to refuse that dataset: a fixture that cannot exhibit the failure it looks for proves
nothing, which is the same judgement its own header makes about the saturated fixture. The new case
asserts the *distinction* rather than the count -- exit 1 with `FAILED: N propert(y/ies)`, at least one
`PASS` line before it, and no `ALL PROPERTIES HOLD` -- and it was proved by mutation: with
`failures.push` disabled the case fails on `expected +0 to be 1`, and the gate was restored byte for
byte.

## Finding 359 — a child that drops `NODE_OPTIONS` read as an exit that was never reached

The gate's instrument is installed through `NODE_OPTIONS`, and the module's header said what that
buys: "descendants inherit it, so nothing in the tree needs to know it is being measured." Every
claim the gate has ever honoured rests on that sentence, and nothing had ever tested it.

The assumption has two halves, and only one of them is true unconditionally.

| what a claimant does | what the child gets | what the trace holds |
| --- | --- | --- |
| `spawnSync(node, [gate])` with no `env` | the parent's environment | the exit, at its line |
| `env: { ...process.env, X: 1 }` | the parent's environment plus one key | the exit, at its line |
| `env: { PATH }` -- a curated environment | no `NODE_OPTIONS`, so no hook | **nothing** |

Measured on a scratch tree with a helper between the test and the gate: the helper spawned the gate
with `env: { PATH: process.env.PATH }`, the gate ran and exited 7 -- the helper printed the status --
and the trace file did not exist afterwards. The third row is not a gate that failed to reach an exit;
it is a measurement that could not see one, and the gate printed it as the first.

That is the same defect this volume opened with, inverted. Finding 357 was a pointer that was true in
the inventory and false in the world; this is a pointer that may be true in the world and is reported
false by the instrument.

### The repair is in the parent, because the child has nothing left to report through

Everything a child could report through *is* the environment that was dropped, so the observation has
to happen one level up, where the process is still instrumented at the moment it calls `spawn`. The
hook now wraps `spawn`, `spawnSync`, `fork`, `execFile`, `execFileSync` and `exec`, and for every child
whose arguments name a script under `scripts/` it appends one line saying whether that child's
environment carries the hook:

```
spawn traced scripts/check-cli-reference.mjs
spawn blind  scripts/fake-gate.mjs
```

The wrappers call the original and return its result, so a spawn that cannot be noted is still a
spawn, and the child's verdict is still the child's. `parseSpawns` counts the two kinds separately and
`blindScripts` keeps the scripts whose every recorded spawn was blind -- one sighted child is enough to
have seen a script, so a mixed record is not a blind one.

`unprovenClaims` then has three sentences instead of two, because there are three states and three
repairs:

| trace of a claimed script | what the gate says | what the repair is |
| --- | --- | --- |
| an exit at the claimed line | nothing | -- |
| started in sight, no such exit | "runs X and never reaches this exit" | the pointer or the test is wrong |
| started out of sight, no such exit | "started X in a child that did not carry the hook, so this run cannot say" | nothing in the inventory; the measurement is short |

### Was the assumption true where it mattered?

Measured over the 44 claimant files, with the same hook and no other change:

| | count |
| --- | --- |
| claimant files run | 44 |
| spawns of a `scripts/*.mjs` child recorded | 905 |
| of those, seen through a child that carried the hook | **901** |
| of those, blind | **4** |
| files holding a blind spawn | **1**, `site-proofs.test.ts`, and all four are the fixtures this round added |

So the inherited environment held for every claimant in the tree, and the one file that produces
blindness is the one built to produce it. The assumption was true and untested; it is now true and
measured, and the state that would have been silent is now a sentence.

## Finding 360 — a claimant that did not pass was reported with no reason

`verify-site-proofs.mjs` treats a red claimant as unmeasured, which is right: a file whose own tests
fail is not evidence about anybody's proof, and crediting it would make a red suite look like a
measurement. What it printed was:

```
packages/core/test/x.test.ts did not pass, so its claims are unmeasured
```

and that is the whole of it. The reader's next step is to run the file -- which the gate has just
done, and whose output it has just thrown away. The cost is not the reading; it is that a red claimant
hides a false pointer for a round, and the round is spent on the redness instead of on the pointer.

Vitest's dot reporter prints three things that decide the repair, and all three were already in the
captured output:

```
 FAIL  packages/core/test/x.test.ts > adds up
AssertionError: expected 2 to be 3 // Object.is equality
      Tests  1 failed | 1 passed (2)
```

`failureSummary` reads the first two `FAIL` lines, the first error line and the totals, capped at four
lines, and invents nothing when the run died before printing a report -- a runner killed by a signal
leaves output with none of those shapes, and a summary of it has to be empty rather than a sentence
about a failure nobody described. The gate prints them under the refusal, with the command that
reproduces it:

```
  packages/core/test/x.test.ts did not pass, so its claims are unmeasured
    FAIL  packages/core/test/x.test.ts > adds up
    AssertionError: expected 2 to be 3 // Object.is equality
    Tests  1 failed | 1 passed (2)
    run it alone: node node_modules/.pnpm/vitest@3.2.4/node_modules/vitest/vitest.mjs run packages/core/test/x.test.ts --reporter=dot
```

The distinction being kept is the same one this volume keeps making: *unmeasured* is a statement about
the run, and it is only useful if it says what about the run.

## Finding 361 — `provedBy` was a claim about reach, and reach is half a proof

Three rounds have now taken this column apart from three sides. Finding 357 found pointers that named a
file which *mentioned* the script; v3.39 found pointers that named a file which *executed* it but at file
level; `verify-site-proofs.mjs` closed both by running each claimant once and reading whether the exit
arrived. What every one of those measurements still assumed is that arriving is what a proof is.

It is not. Take the smallest witness this repository could write:

```ts
spawnSync(process.execPath, [gate], { encoding: 'utf8' });
expect(failures.length).toBeGreaterThan(0);
```

That file reaches every failure exit the gate has, on every run, and the trace will say so. It would also
pass if `process.exit(1)` became `process.exit(0)` at every site at once -- because it never reads the
status. The sentence the inventory publishes is that this test *proves* the site, and the only thing it
proves is that the gate was executed. A `provedBy` pointer is a claim with two parts, and the instrument
measured the first.

### The property had been measured once, by hand, in a way that could not be repeated

v3.33 did it: 93 sub-runs, 6 min 28 s, each one an edit of a gate's exit code followed by a run of the
named test. It found 88 of 93 caught at `process.exit(44)` and 89 of 93 at `process.exit(0)`, added two
cases for the two that no test drove at all, and left the pass out of CI because a third of the batteries
budget was not affordable. Since then the ledger has been checked by eye at each revision, which is the
same sentence as "not checked": the claim count has gone from 93 to 105.

The hand method also carried a cost that has nothing to do with minutes. `verify-gates-are-testable.mjs`
hollows gates on disk for a living, and it needs a journal, a precondition that refuses to measure an
already-mutated tree, a process-group kill for the nested suite, and a read-back comparison after every
restore -- because an edited tree stays edited. One measured accident there left **twelve scripts carrying
the mutation marker at once**, eight of them carrying two or three.

### The mutant is a value

The hook already computes the innermost `scripts/*.mjs` frame of every `process.exit`, because that is
what deciding reach requires. Replacing the code is one branch on top of that computation:

```js
if (hollow !== "" && frame !== null && frame.endsWith("/" + hollow)) {
  if (out) fs.appendFileSync(out, "hollow " + hollow + "\n");
  return original(0);
}
```

`RCA_HOLLOW_SITE=scripts/check-cli-reference.mjs:51` and every `process.exit` from that line returns
success instead. Nothing is written to the tree, so the journal, the precondition, the restore and the
kill are not needed -- what was never edited cannot be left behind. That is the difference between
mutating a **file** and mutating a **call**.

The one property that had to be checked rather than assumed is aim. A wrapper that hollowed whatever it
was told would turn every failure in the child into success, and every claimant would look sensitive to
everything; so the frame is compared before the code is replaced, and the control case (a mutant aimed at
an exit this run does not take) is a test.

### What the pass costs, measured twice

The unit is one baseline per file plus one run per claim, and the baseline is not optional: a claimant
that is red on its own **catches** every mutant applied to it, so skipping the baseline would read a
broken suite as a hundred percent sensitive.

| run | claims | files | runs | wall clock |
| --- | --- | --- | --- | --- |
| serial probe, before the gate existed | 100 | 44 | 144 | **8 min 54 s** |
| four at a time, after | 105 | 45 | 150 | **3 min 20 s** |

Per site and not per file, deliberately. A file sensitive to one of its exits says nothing about the other
nine, and pooling would answer "somebody noticed something" -- the same substitution `verify-site-proofs`
refused when it declined to pool the files.

### The reading

**105 claims, 45 files, 150 runs, 0 survivors.** Every exit the inventory calls proved can be replaced by
success and some test goes red. The number is not the interesting part -- the number existing is, because
until this run the claim had been checked once, by hand, at a claim count fourteen lower.

The pass is now a CI job of its own, beside the batteries rather than behind them, so the workflow's wall
clock does not move; the 15-minute budget is twice the measured pass plus an install.

## Finding 362 — a green mutant run means three things, and only one of them is "survived"

The first version of the gate read `status === 0` as SURVIVED and `status !== 0` as CAUGHT, which is the
shape every mutation harness has. It is wrong here for a reason this volume has already recorded once, in
a different place: a child that drops the environment drops the **mutant** together with the hook.

Measured with a fixture: the claimant spawns the gate with `env: { PATH: process.env.PATH }`. The mutant
never arrives, the gate fails as it always did, the claimant (which asserts nothing about the status)
passes -- and the first version reported that as a survivor. The witness was fine. The measurement was
blind.

So the hook writes the fact that it applied the mutant, at the moment it applies it:

```
/repo/scripts/gate.mjs:3        <- the exit was reached
hollow scripts/gate.mjs:3        <- and this site's code was replaced
```

and the gate has three verdicts instead of two:

| that run | what it means | the repair |
| --- | --- | --- |
| went red | the witness depends on this exit | none |
| green, and `hollow` is in the trace | survived: reached it, does not depend on it | add the assertion, or move the pointer |
| green, and `hollow` is absent | the mutant never reached the child that mattered | fix the measurement |

The third is the same lesson as finding 359 -- *a green run is not evidence about a mutant that never
arrived* -- asked one question over. The first time it was an exit that looked unreached because the hook
was missing; this time it is a witness that looks insensitive because the mutant was missing. In both
cases the honest reading names the instrument, and in both cases the dishonest one is a sentence accusing
the tree of the tool's own fault.

The marker is written **before** the code is replaced rather than after, because a run that dies between
the two would otherwise record a mutant it did not apply.

## Finding 363 — the `condition` column names the nearest `if` above, not the block the exit is in

`golden-master/gate-sites.json` publishes, for every failure site, the guard that decides whether the exit
runs. The deriver read it by scanning **backwards for an `if` line**:

```
for (let j = index - 1; j >= 0 && j > index - 60; j -= 1) {
  const match = /^\s*\}?\s*if\s*\((.*)\)\s*\{\s*$/.exec(rawLines[j]);
```

That answers *which `if` is the closest one above this line*, which is a different question from *which
block this exit is in*. The two agree on most of the tree, and on the rest the column said something a
reader would act on and that is not true:

| site | published | what actually guards it |
| --- | --- | --- |
| `verify-site-proofs.mjs:109` | `unknown.length > 0` | `catch` — the refusal fires when the inventory cannot be *read* |
| `verify-sites-are-sensitive.mjs:132` | `!Number.isInteger(CONCURRENCY) \|\| CONCURRENCY < 1` | `catch` |
| `check-battery-budget.mjs:41` | `workflow.errors.length > 0` | `catch` |
| `verify-site-proofs.mjs:242` | `problems.length > 0` | `failures > 0` |
| `verify-sites-are-sensitive.mjs:332` | `unmeasured.length > 0` | `failures > 0` |
| `build-example-bundle.mjs:103` | `!current.equals(expected)` | `!ok` — the `if` opens no block, so it was never seen |
| `check-staged-mutation.mjs:143` | `verdict.differing.length > 0` | `problems.length > 0` |
| `probe-m1-ceiling.mjs:202` | `args.json` | nothing — `process.exit(main())` at module level |

The first three are the worst class: they name the *other* branch. A reader asking "when does this gate
refuse to read its inventory" is told "when the arguments are unrecognised".

Measured against a parser, which reads the same tree independently: **13 of 112** entries published a
condition that does not hold at the exit -- four named a guard that had already closed, four named an `if`
where the exit is inside a `catch`, five named an `if` where there is none -- and **two more** published
nothing where the guard could be named (a `catch` and an `else` chain). Fifteen rows in total changed.

The repair is not a better scan. `condition` is a question about a syntax tree -- an `if` **is** an
`IfStatement`, an `else` body **is** that statement's `elseStatement`, a `catch` **is** a `CatchClause` --
and it is now answered by asking the tree. The vocabulary is unchanged for the 97 entries that were
right: an `if` publishes its predicate, an `else` body publishes the chain negated, a loop publishes its
header, and `catch` and `switch` publish the word. Two rules were added that the old scan could not
express: an `else if` chain publishes **every** link negated (`check-fault-cases.mjs` would otherwise
publish the innermost one, which is true and reads as complete), and a **declaration** is a barrier while
an **inline closure** is not -- `verify-local.mjs`'s exit sits in `main().catch((error) => ...)` inside the
guard that decides whether `main()` is ever called, so the guard is published.

## Finding 364 — two hand-written scanners, beaten by the same character

The first two attempts at finding the enclosing block by hand are worth recording, because the file they
live in had already recorded the same lesson three times and neither attempt applied it.

**Attempt one, counting characters and skipping strings.** `check-no-absolute-paths.mjs` holds

```
const ABSOLUTE_PATH = /(['"`])(\/(?:Users|home|root|private)\/[^'"`\n]*)\1/g;
```

The quote characters *inside the regex* opened a string that never closed. The walk swallowed the rest of
the file, so the `if` around the site was never pushed and the site published no condition at all. In
`check-open-list.mjs` the same desync left a `for` on the stack twenty lines after it had closed, and that
loop became the guard of a module-level exit.

**Attempt two, tokenising.** TypeScript's raw scanner is not a standalone lexer: the `${...}` of a template
literal has to be rescanned by the parser, and without one the scanner reads the prose after the first
substitution as code and stops matching the file. Measured: **80 of 112** sites lost their guard, every one
of them in a file with a template literal.

Both failures have the same shape as the ones already in this file's comments -- `stripComments` documents
the URL case, the site rule documents its own line 109 -- and the conclusion is the one those comments
keep reaching for and then stepping back from: *a claim about structure should be read from the structure*.
The third attempt asks the parser, and the same parser is what measured the defect in the first place.

The dependency is a real cost, paid deliberately: `derive-gate-sites.mjs` now imports the compiler the
build already uses. The alternative was a third heuristic. A gate that runs on every push and publishes a
number should not have to be re-audited every time the tree contains a regex.

## Finding 365 — the column next door was measured against the same idea and declined

The obvious next move is to apply the same reasoning to `diagnostic`: a message printed three lines above
the exit in a block that closed is not this exit's message either.

It was implemented and measured, and it lost. A block-scoped scan -- the nearest preceding statement in the
same block, walking outward one block at a time -- changes 20 of 112 entries, and 14 of those become
**absent**, because the message frequently sits inside the `for` loop just above: `check-doc-counts.mjs`
prints its summary, then loops over the detail, then exits, and the loop is the last statement before the
exit. Scoping to the enclosing block throws the message away.

So the column keeps its rule and gains a sentence about what the rule does not claim. Proximity is not
enclosure, and an absent column for a seventh of the tree is not an improvement over one that is right
about proximity and silent about which block it came from.

This is a measurement that decided *against* a change, which is the only kind that can be trusted to have
been made for the right reason.

## Finding 366 — the dropped tally counts a line the parser says is a comment

With a parser available, the enumeration was measured rather than assumed: `scripts/` holds **112**
statement-position `process.exit(...)` calls whose argument is not the literal `0`, and the inventory lists
**112**. Complete, for the fourth round in a row.

The tallies beside it are not. The committed `excluded` says `15 zero, 3 indirect`; the parser says
`16 zero, 2 non-statement`. The totals agree -- 130 either way -- and the split does not. The third
`indirect` is a **docstring line** in `derive-gate-sites.mjs` itself:

```
// `assert(process.exit(1))`, `.map((x) => process.exit(1))`. The statement
```

It is counted because `stripComments` desyncs in that file: nine comment lines survive the strip. The
desync is old -- it predates this round -- and it is currently harmless for the *sites*, which the line
rule rejects a second time on statement position. It is not harmless for the tallies, whose whole purpose
is to be the accounting a reader can subtract from the total.

Recorded rather than fixed: replacing the tallies with the parser's own classification changes what the
inventory's `excluded` object means, and that is a round of its own rather than an edit at the end of this
one. The number is published, so it is now also named.

## Finding 367 — the list and the tally added up to the right total for two wrong reasons

The inventory publishes `excluded` beside `sites` so a reader can subtract: *112 sites, and the other
exits went elsewhere for these reasons*. The two halves were computed by two different readings of the
same tree -- the sites by a line pattern, the exclusions by a second line pattern -- and they disagreed:

| tally | committed file | the tree |
| --- | --- | --- |
| `zero` | 15 | **16** |
| `indirect` | 3 | **2** |
| total | 130 | 130 |

**The total matched.** One count had been lost and one invented, and the two errors cancelled. A number
that is right for two wrong reasons is harder to notice than a number that is wrong, because the check
anyone would write -- *do the halves add up?* -- passes.

The lost one is `check-official.mjs:995`:

```
if (officialDirArg === undefined) process.exit(0);
```

A success exit written on a line that does not *begin* with `process.exit`. `exitArgument` anchors at the
start of a line, so it returned `undefined`; the multiline branch did not match; the indirect branch did
not match; and the call fell through every branch. It is counted nowhere. See finding 368.

The invented one is a line of this repository's own prose, in `scripts/derive-gate-sites.mjs`:

```
// `assert(process.exit(1))`, `.map((x) => process.exit(1))`. The statement
```

It was counted as an `indirect` exit because the comment stripper desyncs in that file. See finding 369.

The repair is not two arithmetic fixes. A remainder cannot be checked -- it is whatever the subtraction
leaves -- so the classification became a **partition**: one pass over the tree puts every
`process.exit(...)` call in exactly one of `sites`, `zero`, `indirect`, and `sites.length + zero +
indirect` is the number of calls. `multiline` was the fourth basket and is gone: it counted "an exit whose
argument spans lines", which a line reader could not parse and a tree reader cannot even express. It read
0 for every round it existed, and a tally that is structurally always zero measures the reader's
limitation rather than the tree.

## Finding 368 — the fallback was written into one of the two readings and never the other

`isFailureExitStatement` carries this, with the story attached:

```
// The exit is not the first thing on the line: `if (!ok) process.exit(1);`.
// ... Dropping the fallback took `build-example-bundle.mjs`'s only failure exit out of the
// inventory -- `scripts-are-classified.test.ts` caught it on the same run.
```

The lesson was learned, written down, and applied to the reading that publishes sites. The reading that
publishes *tallies* had the same anchored-at-the-start assumption and no fallback, and no test caught it,
because the two readings were never compared with each other -- only with the tree, and the tree was asked
about sites.

That is the shape worth recording: **a repair made because a test caught it does not generalise on its
own.** It generalises when the *other* reader of the same shape is named, and here the other reader was
three functions below in the same file.

The two shapes are now one classifier, so the question cannot be asked twice: `if (!ok) process.exit(1);`
and `if (!ok) process.exit(0);` differ in the argument, not in whether they are seen.

## Finding 369 — the third hand-written lexer, in the file that documents the first two

`derive-gate-sites.mjs` stripped comments before looking for exits, with a character scanner that tracked
quote state and documented its own reason for not being a regex (a `//` inside a URL, a block-comment
opener inside a string). Measured against the parser, it desyncs in **12 of the 75 scripts**:

| script | comment bytes that survived the strip | first at line |
| --- | --- | --- |
| `check-no-unsafe-shell.mjs` | 6,107 | 290 |
| `derive-gate-sites.mjs` | 5,653 | 440 |
| `check-data-model-vocabularies.mjs` | 3,917 | 104 |
| `check-doc-counts.mjs` | 3,399 | 285 |
| `progress-volumes.mjs` | 2,803 | 121 |
| `check-official-registry.mjs` | 1,543 | 120 |
| `check-l4-status.mjs` | 1,162 | 103 |
| `check-open-list.mjs` | 717 | 303 |
| `check-backend-support.mjs` | 339 | 63 |
| `gate-steps.mjs` | 336 | 1,316 |
| `check-no-absolute-paths.mjs` | 206 | 120 |
| `measure-ci-baseline.mjs` | 97 | 79 |

Every one is one of two characters. The measured culprits, from the line immediately above the first
surviving comment:

```
check-backend-support.mjs:60    return cell.replace(/`/g, '').trim();
check-no-absolute-paths.mjs:95  const ABSOLUTE_PATH = /(['"`])(\/...)\1/g;
check-l4-status.mjs:101         const declaredTargets = [...targetMatch[1].matchAll(/'([^']+)'/g)].map(...)
```

A quote or a backtick **inside a regex literal** is a quote to a scanner, and the scanner opens a string it
will never close. That is the identical character that defeated the two scanners finding 364 recorded, one
function over, in the same file -- and the file had already written the lesson down four times.

It is deleted rather than repaired, and that is the honest answer this time: once the classification is a
walk over the tree, nothing in the file needs to know what a comment is. A repaired lexer would be a
fourth heuristic with no caller.

## Finding 370 — the same lexer's second copy, in the instrument that decides a gate was named

`scripts/gate-proofs.mjs` carried its own copy of the same idea, and uses it for the sharpest distinction
in the audit: *a comment is prose about the gate, a string or an identifier is the gate being used.*
`namesInCode` is what stops "a file that mentions `check-official.mjs`" from counting as a file that drives
it.

Measured against the compiler, it desyncs in **28 of the 219 test files**, and the desync costs two
published decisions: `apply-pins.mjs` and `check-no-mock.mjs` were each credited to
`gate-sites-are-proven.test.ts`, by a sentence in a comment.

Neither verdict moves today. Each gate has three or four other files that name it in code
(`apply-pins.mjs`: `apply-pins.test.ts`, `official-data-destination.test.ts`, `scripts-are-classified.test.ts`),
so the extra file inflates a printed list without changing a CAUGHT. That is precisely why it survived:
**a defect that changes no answer today changes one later, and it is invisible until then.**

The repair is exact, and the mechanism is worth stating because the obvious tool does not work. TypeScript's
`getLeadingCommentRanges` returns nothing at a token's full start where `getTrailingCommentRanges` at the
same offset returns the comment:

```
const text = 'const a = 1; // x\nconst b = 2;\n';
getLeadingCommentRanges(text, 12)   -> undefined
getTrailingCommentRanges(text, 12)  -> [{ pos: 13, end: 17 }]
```

So the file is read for its **token boundaries** and each gap between two adjacent boundaries is scanned
for trivia. That is exact rather than clever: a string is a token, so no string can straddle a gap, and a
gap holds only whitespace and comments. A `//` inside a regex literal is inside a token, not in a gap.

Verified by the invariant rather than by inspection: blanking comments changes no token, so the token
sequence of all 295 files in `scripts/` and `packages/core/test/` is identical before and after the strip
-- 0 mismatches. A token gained would mean a comment survived; a token lost would mean code was blanked.

## Finding 371 — `process.exit()` with no argument was published as a failure exit

The rule reads:

> a statement-position call to `process.exit(...)` whose argument is not the literal zero.

An absent argument is not the literal zero, so a call written `process.exit()` fell into `sites`. It exits
**0**. The inventory was publishing a success exit as a failure exit, and the consequence is not cosmetic:
every published site is a claim that a test reaches it *and* that a mutant replacing its argument with `0`
makes some test go red. For this one there is nothing to hollow -- `process.exit()` and
`process.exit(0)` are the same instruction -- so the sensitivity pass would have reported a **survivor**,
which is printed as *the witness reaches the exit and does not depend on it*. The accusation would have
landed on the test for an exit that has no failure to depend on.

Measured: **0 instances** in `scripts/`, so no published number moves today. The rule now reads the value
rather than the spelling -- the numeric literal zero (so `0x0` and `0.0` are the same claim) and absence,
which is the same number. `derive-gate-sites-tally.test.ts` drives both.

## Finding 372 — the basket that held the sentence deciding the status

`excluded` carried a second tally, `indirect`: *a call that is not in statement position -- inside an
argument, a predicate, an arrow body, a template substitution.* Measured, it held exactly two calls:

```
derive-fault-golden.mjs:252     main().then((code) => process.exit(code))
score-fault-extraction.mjs:153  main().then((code) => process.exit(code))
```

`code` is `main()`'s **return value**. `main()` returns 2 when its condition is not met and 1 on a usage
error, printing the diagnostic before it does; the arrow hands that number to `process.exit`. So this one
sentence is where the whole script's status is decided, and the inventory filed it as *not a site* --
while publishing the `.catch` arm below it, which only fires on a crash, as each script's failure exit.

The campaign takes its subjects from this table: `verify-gate-proofs` asks whether a named test reaches
each site, `verify-sites-are-sensitive` whether it would notice the site's absence, and
`verify-gates-are-testable` takes the scripts to hollow from the same list. Both scripts had their
refusals outside all three questions.

The exclusion's own justification is what defeated it. *A call that is not in statement position may not
run* is equally true of the sites the rule **includes** -- `if (!ok) process.exit(1)` may not run either --
and that is exactly what the published `condition` column records. Position in an expression does not
weaken an exit: a call that runs ends the process wherever it stands. So the basket is **deleted** rather
than narrowed. `sites` 112 → **114**, `excluded` `{16 zero, 2 indirect}` → `{16 zero}`, and the 130 calls
still partition: `derive-gate-sites-tally.test.ts` recounts them with an independent traversal and names
the two continuations by line.

Both new sites were then proved by measurement rather than by reading:
`fault-extraction-scripts.test.ts` drives `main()` to 1, 2 and 3 and asserts the process status, so
`verify-site-proofs.mjs` observes the exits at those two lines and no other claim moves.

## Finding 373 — a reference the reading could not resolve was counted nowhere

The tally is a partition of **calls**, and the rule says so. That leaves a shape outside its subject
altogether: a reference to the exit family that is not a call.

```
process.exitCode = 1;                 // sets the status without calling anything
const die = process.exit; die(1);     // the reference exits nothing; the call does
const { exit } = process;             // same, one binding further out
```

None of these was a site, a `zero`, or an `indirect`; they were invisible. Measured: **0** in `scripts/`
-- 130 calls, all spelled `process.exit(...)` -- which is precisely why the reading has to refuse them
rather than trust the measurement: an absent spelling is indistinguishable from a spelling nobody looked
for. The two hooks here are installed on `process.exit`, so `process.exitCode = 1` is invisible to both; an
alias and a destructured binding put the exit on one line and the call on another, so the trace would
report a line the inventory never published.

The reading now **throws**, naming the file, the line, the spelling and the statement to change:

```
scripts/x.mjs: 1 reference(s) to the exit family that this inventory cannot classify:
  scripts/x.mjs:41 is a status set by assignment: if (skip === true) process.exitCode = 1
```

`derive-gate-sites-refusals.test.ts` drives each refused spelling, and the boundary it draws is exact
rather than stylistic: `process['exit'](1)` is **classified**, because the member resolves at run time, the
hook sees it, the mutant can hollow it, and the call is on the line the trace reports. The question is not
"does this look unusual" but "can this be resolved to the line the instrument will report".

A fourth basket, `uncounted`, was written and rejected. A basket is published beside `sites` and reads as a
measurement of the tree; that one would have measured the instrument's reach, and the next round would have
had to ask which of the two it was reading.

## Finding 374 — the diagnostic column stopped at 60 lines, and a distance is not a scope

`diagnostic` is the message a site prints about itself, taken from the nearest preceding
`console.error`/`console.log`/`process.stderr.write`/`verdict(...)`. The scan had a floor of 60 lines,
which is a distance, and a distance can cross the boundary that matters. With the two continuations now
published, the column would have read:

| site | value under a 60-line floor |
| --- | --- |
| `derive-fault-golden.mjs:252` | `\n${unusable} of ${predictions.length} sample(s) did not produce a usable extraction.` |
| `score-fault-extraction.mjs:153` | `\nM1 exit condition met.` |

The second is the message printed on the **success** path, five lines above the exit that fires when the
condition is not met. That is not a missing fingerprint; it is a wrong one, and wrong-but-plausible is the
only kind that survives review.

The floor is now the **enclosing function**, which is a boundary in the language rather than a guess about
layout: a message outside the function that contains the exit is a message some caller printed about
something else. Measured over all 130 calls, the change moves **4** rows and **no published site's
diagnostic**: the two continuations lose a message that is not theirs, and two `process.exit(0)` calls gain
one that sat further than 60 lines away (both are in the `zero` basket and publish nothing).

The block-scoped alternative stays declined for the reason v3.42 measured: ``check-doc-counts.mjs`` prints
its summary, then loops over the detail, then exits, so scoping to the enclosing block lost 14 of 112
sites outright.

Two rows now have no message at all, and a bare coordinate is what rule 5 forbids. They publish `verdict`
instead -- the expression whose value becomes the status, here `code` -- so the row still says what the
site is about:

```
{ "script": "scripts/score-fault-extraction.mjs", "line": 153, "verdict": "code",
  "status": "proved", "provedBy": "packages/core/test/fault-extraction-scripts.test.ts" }
```

## Finding 375 — the inventory counted one spelling of "no", and the language has two

The published rule named a syntax:

> a `process.exit(...)` call whose argument is not a known zero.

A gate refuses two ways, and the second is not a call. A `throw` that nothing catches ends the process with
status 1 and prints the stack -- to a shell, `process.exit(1)` and an escaping `throw` are the same refusal,
and every consumer of this inventory is a shell. Measured: **41 throw statements across 15 scripts**, and the
table published **none** of them.

The cost is not a missing count. This inventory is the single source of three questions the campaign asks
about every refusal -- does a test reach it (`verify-site-proofs.mjs`), would the suite notice if it stopped
refusing (`verify-sites-are-sensitive.mjs`), can the whole gate be emptied (`verify-gates-are-testable.mjs`,
whose subjects are `inventory.sites.map(script)`) -- so a refusal outside the table is outside all three, and
`gate-sites-are-proven.test.ts` cannot even report it as unproved.

Four scripts hold throws and **no** published site: `doc-counts-rows.mjs`, `format-spec.mjs`,
`gate-receipt.mjs`, `serve-site.mjs`. Three are libraries and one is a server, which is why the omission had
not been noticed: none of them is a gate, so "which exit does a test reach" was never asked of the script at
all -- the question was asked of the *sites*, and there were none.

The inventory now publishes a second partition, `throws`, with four dispositions that add up to the number
of statements: `fatal` (no enclosing function, no enclosing `try` -- ends the process), `unguarded` (in a
function, no `try` -- hands control to the caller), `guarded` (in a `try` block), and `rethrow` (in a
`catch`, rethrowing the caught binding). Measured: **1 / 36 / 1 / 3**.

Only `fatal` is proved. The other three are not exits -- `unguarded` decides its exit in a caller's frame,
and `guarded` / `rethrow` do not end a process at all -- and a `provedBy` on one of them would claim that a
test reaches a line *and that the line ends the process*, which is false by construction.

> **Corrected by finding 384.** The paragraph above states the rule v3.45 shipped, and both halves of it were
> wrong. "Only `fatal` is proved" left **forty rows** with no statement about whether any test had ever
> executed them, and a census found **twenty** that no test reached. The argument for it confused two
> questions: a row needs `proved` to say *a test reaches this line*, which is true of a `throw` a caller
> catches, and only the narrower sentence "the line ends the process" is confined to `fatal`.
>
> The rule now is: every row is `proved` or `exempt`, a `fatal` row must be proved, `proved` names the test
> that reaches the line, and `exempt` carries a sentence about that line -- not the word "unreachable".
> Measured: **32 proved, 9 exempt**.

## Finding 376 — the refusal that guarded every battery bound had never executed

`measure-ci-baseline.mjs` records how long each CI step took, and every `timeout-minutes` in the batteries
job is a multiple of that measurement. It refuses twice:

```js
if (TOKEN === '' || !/^\d+$/.test(RUN)) {
  process.stderr.write('usage: …');
  process.exit(2);                                    // published as a site, proved
}

const job = jobs.jobs.find((one) => one.name.toLowerCase().includes(JOB));
if (job === undefined) throw new Error(`run ${RUN} holds no job matching "${JOB}"`);   // published nowhere
```

`battery-budget.test.ts` drove the first arm -- an empty token, and a run id that is not a number -- and
asserted `status === 2` for both. The second arm needs an API answer of 200 carrying a job list without the
job, which nothing in the suite could produce, so that line had never run. The read it guards is the one
that turns a run into the numbers every bound is a multiple of: a wrong job matched here would size every
bound from the wrong steps, and the gate that reads the file (`check-battery-budget.mjs`) would still pass,
because it checks relations against the file rather than the file against GitHub.

Repair: two environment seams on the script (`RCA_GITHUB_API`, `RCA_CI_OUT`), read only by the test, which
answers from a **real local HTTP server**. Nothing stubs `fetch`. Three paths that had never executed are
now driven: a 500 from the API (`:62`), a run whose jobs carry no `batteries` (`:69`), and the success path
that writes the file -- the last asserting the written shape, including that the runner's own bookkeeping
steps are dropped rather than given a bound they never had.

Measured after the repair: `verify-site-proofs` observes the exit at `:69` in the run of
`battery-budget.test.ts` and reports **108 claims across 45 files**, all reached.

## Finding 377 — a `try` and a `catch` stop at a function boundary, not at a line

The first reading of throws carried its context down the whole subtree, so
`try { const f = () => { throw x; }; }` called `f`'s throw **guarded**. It is not: the `try` sits above the
function's *definition*, and at the moment `f` runs from somewhere else that `try` is not on the stack.

This is the same defect as reading `condition` from the nearest `if` line above an exit (finding 358), one
construct over: a layout scan answering a scope question. The fix is the boundary the language actually has,
so the walk resets both `guarded` and `rethrow` when it enters a function.

Both directions are driven by fixtures: a `try` around a function definition does not guard its throw, and a
`catch` around one does not make it a forward.

Measured on the tree: **0 instances** of either shape today, which is why the reading could have been wrong
without a symptom -- and why the fixtures exist rather than the measurement.

## Finding 378 — a `catch` does not make its body a forward, the thrown value does

The classification keyed on the word `catch`, which put four statements in `rethrow`. One of them is not a
forward:

```js
} catch (error) {
  throw new SuiteFailed(scope.name, diagnoseRedRun(scope.name, error));   // measure-doc-counts.mjs:182
}
```

A red `pnpm` becomes this repository's own verdict, with a diagnosis attached. That is a decision made
*here*, and it escapes the function exactly like any other `unguarded` throw. The three that are forwards
(`check-citations.mjs:50`, `:60`, `measure-doc-counts.mjs:267`) all rethrow the caught binding itself.

So the test is whether the thrown expression **is** the caught binding, not whether a `catch` encloses it.
Measured after the change: **3 rethrow, 36 unguarded**; the one that moved is the one that was making a
decision.

## Finding 379 — an instrument that cannot mutate a claim must say so, not leave it out of the total

`verify-sites-are-sensitive.mjs` hollows a site by replacing its exit code with zero from the calling frame.
The mutant is a **value**, which is why it needs no journal and no restore path. A `throw` has no such seam:
the language offers nothing between the statement and the unwind, so nothing the hook installs can catch it
and return zero instead.

The first version of the gate therefore asked `claimedSites` for every claim, got 108 including the fatal
throw, and would have reported that one as a **survivor** -- printed as *the witness reaches the exit and does
not depend on it*, which is an accusation against a test for a limit of the instrument. That is finding 359's
mistake one instrument over.

The gate now separates what it can mutate from what it cannot, and prints the second list under the summary:

```
verify-sites-are-sensitive: PASSED (107 claim(s) across 45 file(s), 152 run(s), 3.3 min, …)
verify-sites-are-sensitive: 1 claim(s) are not mutated here -- a throw has no seam this gate can replace:
  scripts/measure-ci-baseline.mjs:69 <- packages/core/test/battery-budget.test.ts
```

A summary that read "108 claims, all proved" while one of them was never asked is the exact shape this gate
was written to refuse.

> **Corrected by finding 385.** A throw *does* have a seam, and it is not in the running process: it is in
> the source, before the module is evaluated. `scripts/throw-witness.mjs` rewrites `throw X;` into
> `{ record(line); throw X; }`, and the same loader that records the statement can delete it instead. So the
> gate mutates a throw by removing the statement rather than by replacing a value, and the sentence above --
> "there is no seam to replace" -- was a statement about the hook rather than about the language.
>
> Measured after the change: **139 claims, 190 runs, 4.0 min, 107 exits hollowed and 32 throws removed, and
> some test goes red for every one of them.** The list of claims that cannot be mutated is now empty.

## Finding 380 — a block that ends in a `throw` never increments its own counter

The first instrument tried for this question was the one that already existed: V8 block coverage. Run the
suite under it, read the counter on the block that holds each `throw`, and a zero means the line never ran.

That reading is worthless, and the way it fails is worth recording because it is silent. Measured on a
three-function probe -- one that throws and is caught, one that throws and is not, one that does not throw --
the enclosing block reports `count: 0` in **all three** cases. A block that ends by throwing never completes,
so the counter is never incremented: the instrument is blind on exactly the statements it was asked about.

This is not a threshold that needs lowering. A `throw` unwinds out of its block before the increment, so no
run of the suite, however complete, can produce a non-zero reading. Had this been believed, the census would
have reported **41 of 41 throws unexecuted**, and the campaign would have spent a round writing tests for
lines that were already covered.

The question "was this statement executed" therefore has to be answered by changing the program rather than
by counting: rewrite the statement so that it announces itself, which is finding 381.

## Finding 381 — the witness named the process instead of the file

The rewrite was `throw X;` → `{ __rcaThrow(<line>); throw X; }`, and the recorder took the file name from
`process.argv[1]` -- the script the process was started to run. For a gate that throws in its own frame that
is correct. For a gate that **imports** a module and the module throws, it names the importer, and pairs it
with a line inside the imported file.

The first census made this visible by publishing coordinates that cannot exist:

```
reached  scripts/measure-doc-counts.mjs:271
reached  scripts/measure-doc-counts.mjs:487
reached  scripts/measure-doc-counts.mjs:534
```

`measure-doc-counts.mjs` is under 270 lines. All three lines belong to `scripts/doc-counts-rows.mjs`, which
that gate imports; the numbers were right and the file beside them was wrong, which is the more dangerous of
the two errors because a reader can check a line number against a table and cannot check a file name against
a stack they do not have.

The file is now passed as a literal from the rewrite, computed at transform time from the module's own
address. The line comes from the same parser and the same call the inventory uses (`ts.createSourceFile` and
`getLineAndCharacterOfPosition`), which is not a coincidence to be maintained by hand -- it is why a line the
inventory publishes is a line this instrument can name.

## Finding 382 — the loader instrumented nothing and reported success, twice over

Two defects in the same file, both of which produced the reading "this tree has no throws in it".

**The source arrives as bytes.** A `load` hook receives `result.source` as a `Uint8Array`, not a string, for
every module loaded from a file URL. The guard was `typeof result.source === 'string'`, which was false for
every module, so every module was returned unchanged -- and the run looked exactly like a measurement that
had found nothing to measure. The fix is one branch, and the reason it went unnoticed is the reason this
campaign keeps finding: an instrument that declines to act and an input that has nothing to act on produce
the same output.

**The preload runs twice.** `--require` preloads are evaluated in the loader thread as well as the main
thread, so the registration happens twice and the second registration transforms the first registration's
output. Measured before the guard: **two `reached` lines per throw**, which would have doubled every count in
the census. The guard is the instrument's own call -- if the source already contains `__rcaThrow(`, it has
been instrumented -- because nothing in the tree writes that name.

## Finding 383 — a module a test imports never passes through the loader

With the loader working, one class of throw was still invisible. `derive-gate-sites.mjs:631` refuses a file
it cannot parse, `derive-gate-sites-throws.test.ts` drives exactly that refusal -- and the trace reported
nothing, which reads as a row no test reaches.

The reason is that the suite reaches `scripts/*.mjs` two ways. A gate a test **spawns** is a node process, and
the loader sees it. A module a test **imports** is compiled by Vite inside a vitest worker and never touches
node's ESM loader at all. So the instrument was armed on one of the two roads and silent on the other, and
the silence was indistinguishable from an absence.

Repair, and both halves were needed:

- a Vite plugin in `packages/core/vitest.config.ts` calling the **same** exported `instrumentThrows`, so there
  is one implementation with two ways into a process rather than two implementations to keep in step;
- `test/setup/throw-witness.ts`, a worker-local recorder, because the preload's `globalThis.__rcaThrow` does
  not exist in the worker. Measured before it: every test passed and the trace stayed empty, because the
  rewrite called a global that was not there and the guarded form swallowed the failure -- which is what the
  guard is for, and also why the guard alone could not report the problem.

The `typeof` guard stays, and it earns its place in the second direction too: a module instrumented by the
plugin and imported by a process with no recorder still throws the error it always threw, rather than a
`ReferenceError` about a proof run's global.

## Finding 384 — forty of forty-one throw rows had never been executed, and the table called them fine

v3.45 published the throw partition with a disposition and nothing else. A row reading
`unguarded · derive-gate-sites.mjs:631` looks like a classification; what it actually said was *nobody has
asked whether this line runs*.

The census over the suite -- loader armed, witness recording, attribution fixed by finding 381 -- found:

| | count | what it meant |
| --- | --- | --- |
| reached | **21** | a test executes the line today |
| not reached | **20** | no test has ever executed it |

Twenty refusals in a tree whose whole argument is that every refusal is enumerated and proved. Of those
twenty, **eleven** could be aimed at and now are: `published-refusals.test.ts` drives ten (two `EISDIR` /
`ENOTDIR` shapes through `check-citations.mjs`, a fixture without `samples` through four `probe-type-misses`
arms, a missing workspace file through `score-fault-extraction.mjs`, a malformed spec through `format-spec.mjs`
in-process, a 404 and a 200 through `serve-site.mjs`), `derive-gate-sites-refusals.test.ts` drives one, and
two more came with the tests that already existed and were pointed at the line rather than at the file.

**Nine cannot be reached**, and each carries a sentence about *that line* rather than the word "unreachable":

| site | why no input arrives |
| --- | --- |
| `build-example-bundle.mjs:57`, `:60` | guards on the pack contract, not on an input: `normalizePackEntries` refuses a duplicate path first, and example files carry an `examples/order-prod/` prefix so the two rows cannot collide -- `build-example-bundle.test.ts` measures that the two rows differ |
| `measure-doc-counts.mjs:267` | was reachable only through a **defect** -- a missing `pnpm-workspace.yaml` raised `ENOENT` out of `workspacePackages`; that is now a diagnosis, so the rethrow is a guard against a broken reader rather than a state of the tree |
| `probe-m1-ceiling.mjs:118` | `includes` over the same objects is exact, so the partition cannot fail to cover the dataset; the guard exists because the two halves are quoted as a partition in `docs/` |
| `probe-type-misses.mjs:255` | a guard on the function that publishes four named checks firing only if it loses one of them |
| `probe-type-misses.mjs:550`, `:665`, `:931` | the same check as a proved line above them, in a block that runs later: the first block that reads the file refuses it, so these cannot be the one that reports the state |
| `probe-type-misses.mjs:1319` | the classification partition: `classify` returns one of three kinds for every row it is handed |

The rule in `gate-sites-are-proven.test.ts` is now three clauses, and the third is the one that matters:
`fatal` must be proved; a `proved` row must name a test that **reaches the line** and must not also carry a
reason; an `exempt` row must carry a reason longer than 40 characters, must not name a test, and reasons may
not repeat. A row that says neither is reported as *"so the row says nothing about whether a test reaches
it"*, which is what all forty-one rows said before this round.

## Finding 385 — the gate said a throw could not be mutated, and it could

Finding 379 concluded that `verify-sites-are-sensitive.mjs` could not simulate a `throw` disappearing, on the
argument that the language offers no seam between the statement and the unwind. That argument is true about
the running process and false about the source.

The loader that records a throw can also delete it:

```js
// RCA_HOLLOW_THROW=scripts/x.mjs:12
{ typeof __rcaThrow === 'function' && __rcaThrow(12, "x.mjs", true); }
```

The statement is gone, the line number is the same, and the mutant is delivered by the same plugin and the
same loader that deliver the witness -- so a run asked for a throw mutant arms the recorder in the same
environment rather than in a second one. The recorder writes `hollowed <site>` when the third argument is
true, which separates the two readings that look identical from outside: *the mutant arrived and the suite did
not notice* from *the mutant never arrived*. That is finding 359's distinction, one instrument over.

Measured on the shipped tree:

```
verify-sites-are-sensitive: PASSED (139 claim(s) across 51 file(s), 190 run(s), 4.0 min --
  107 exit(s) hollowed, 32 throw(s) removed -- and some test goes red for every one of them)
```

**Zero survivors**, and the summary counts the two mutants apart because a run that emptied every exit and
removed no throw would otherwise read like a complete one. The list of claims this gate cannot mutate is now
empty, which is a stronger statement than v3.45's.

## Finding 386 — the claim was read off the disposition, so thirty-one proved throws were never measured

`claimedSites` -- the function both proof gates use to decide what to run -- admitted `throws` rows only when
`disposition === 'fatal'`, with the comment that the other three "are not claims". Finding 384 made every
row state a claim; this function kept reading the old one.

The consequence was exact and silent: v3.46's inventory publishes **32 proved throws**, and `verify-site-proofs`
measured **one** of them. The other thirty-one were reached by tests, said so, and were never checked -- a
proof plan that had been narrowed to the one disposition that ends a process while the table claimed the
rest.

The condition is now `status === 'proved'`, and the comparison uses the right fact: a throw claim is honoured
by **reaching** the line (the witness's `reached` set, which includes a throw a caller caught), falling back
to the deaths the hook recorded when the witness did not arm. Measured after the change: **139 claims across
51 files, all reached** -- so all thirty-one had been true all along, and being true is not the same as being
measured.

## Finding 387 — a quote inside a regex swallowed the rest of a file

`timeout-budget.test.ts` decides which test files must state a suite budget, and it reads them through a
character scanner that strips comments and string literals so the reader sees code rather than prose. The
scanner knew strings, template literals, line comments and block comments. It did not know **regex literals**.

This round added `/['"]/` to `gate-sites-are-proven.test.ts` -- a pattern that accepts either kind of
quotation -- and the scanner read the `'` inside it as the start of a string. Everything from there to the
next matching quote was swallowed, including the file's top-level `describe`, and the gate reported:

```
gate-sites-are-proven.test.ts states no suite budget, only per-test ones: expected 0 to be greater than 5000
```

The file states `timeout: RULE_TIMEOUT_MS`. This is the fourth false red from a reader that knew fewer
spellings than the language has, and the third this file has recorded, which is why it is written down rather
than fixed quietly: the failure mode of a lexical shortcut is always a *plausible* answer.

The scanner now has a fourth mode, and distinguishing a pattern from division needs one token of lookbehind:
the last significant character emitted. An operator or an opening bracket means a value is expected, so `/`
starts a pattern; a name, a number or a closing bracket means one just ended, so `/` divides. A trailing
keyword is the exception, checked only when the keyword is the last whole token -- `return /re/` starts a
pattern and `return a / b` does not. Three controls hold it: the pattern with a quote in it, a division, and
a pattern after `return`.

## Finding 388 — a rule that said "exactly one setup file" was answered rather than deleted

`stall-watch-is-installed.test.ts` asserted that the suite installs **one** setup file, and the comment gave
the reason: a second setup file is a second place the suite's behaviour is altered, so the list is spelled
out rather than checked with `toContain`, and a third entry has to be justified.

Finding 383 added a second one. The assertion is now the two entries, in order, plus a second test that holds
the property that makes the addition safe: the witness defines nothing unless `RCA_SITE_TRACE` and
`RCA_THROW_WITNESS` are both set, so the setup file that runs in every worker of every run costs nothing in
the runs that did not ask -- and a recorder that armed itself would write into whatever trace path it
inherited.

Deleting the assertion would have been the cheap repair and would have lost the rule. The distinction being
recorded is between a guard whose *number* changed and a guard whose *claim* changed: this one is the first,
and the claim is now "two, and here is what the second may not do".

## Finding 389 — the guard resolved a name to its first binding, not to the nearest one

`tests-do-not-write-inside-the-package.test.ts` flags a write whose target reaches a repository root,
following the target's `const` binding up to four levels. It kept **the first binding per name in the file**.

That is invisible as long as no file binds one name twice, and this round produced a file that does:
`published-refusals.test.ts` binds `path` in `run()` to `resolve(ROOT, 'scripts', target)` and again in
`fixture()` to `join(SCRATCH, name)`. Every write in `fixture()` was therefore read against `run()`'s value,
and the guard reported:

```
packages/core/test/published-refusals.test.ts:77  mkdirSync(dirname(path), { recursive: true });
packages/core/test/published-refusals.test.ts:78  writeFileSync(path, contents);
```

Both lines write into `/tmp`. The test that writes into a scratch directory was reported as a test that races
every other worker.

The direction matters more than the instance. This guard's documented false negatives (a path returned by a
helper, one imported from another module) are harmless; a **false positive** here accuses a test of the race
the file exists to prevent, which is how a guard gets switched off rather than repaired. A name-scoped
resolver -- the nearest binding at or before the write, and a binding's own expression resolved at its own
line -- is what "one binding per name" was standing in for.

Two controls hold both directions: a write after a scratch binding that follows a root binding is not
flagged, and a write after a root binding that follows a scratch one is.

## Finding 390 — the tokeniser kept the hyphen, so the best answer scored zero

Type Accuracy asks whether a keyword of `fault_description` appears in the reason. Both sides are cut into
words by `descriptionWords`, and the pattern that splits them was `[^a-z0-9-]+` -- which keeps `-` **inside**
a token. The comment justified splitting on non-alphanumeric runs and never mentioned the hyphen, and no test
covered it, so the choice survived unexamined.

It matters because the two sides are written differently. A description is often a **slug** -- this
repository's fault types are slugs, and the ground truth carries them verbatim. A reason is prose. Measured on
the key `replica-apply-thread-saturation on the order service`:

| reason | Type Accuracy |
| --- | --- |
| `saturation in the replica apply thread` | **0** |
| `saturation` | **0** |
| `the order service is slow` | **1** |

The order is inverted. The description was one token, `replica-apply-thread-saturation`; a reason that spelled
the same compound out in prose shared no token with it, while a reason that named nothing but the component
was paid in full because `order` and `service` had always been their own tokens on both sides. A term that
pays the weaker answer and refuses the stronger one is measuring spelling rather than content.

The pattern is now `[^a-z0-9]+`. The argument is the one that already justified stripping the full stop:
splitting can only turn a dead token into a live one, and the parts are words the description's author chose.
The test asserts the property rather than the implementation -- both spellings of one fault score 1, a single
part of the compound scores 1, and a reason naming a *different* fault still scores 0, because a split adds
boundaries rather than credit.

## Finding 391 — the fallback the protocol describes was decided by measurement, not by prose

AIOps2025's Type Accuracy is two steps: *"keyword detection against the ground-truth fault descriptions, with
embedding-similarity fallback for unhit cases"*. The first step is implemented. The second had been recorded
as a gap for twelve rounds, on an argument that is correct and was never tested: the paper names neither a
model nor a threshold, and a threshold chosen to match the paper's reported TA would be fitting the metric to
its own result.

That argument says *do not fit the number*. It does not say the question is undecidable. What decides it is
which models this repository is **allowed** to ship, and four existing gates answer that before any similarity
is computed: no network at gate time, no vendored weights (1 MiB limit, `check-no-vendored-data.mjs`), no
secrets, and the same number on every machine. A hosted embedding API fails the first and the third; a neural
embedding fails the second. What survives is a surface model.

`scripts/probe-ta-fallback.mjs` measures the whole surface family -- character 2-, 3-, 4- and 5-gram cosine,
plus token Dice -- against three classes: **verbatim** (the description against itself, a scale check),
**paraphrase** (a reason naming the same fault with none of its description's content words), and
**distractor** (every *other* pair's paraphrase against this pair's description). The positives had to be
written; the negatives did not, and deriving them as the cross product of ten pairs gives ninety measurements
none of which was chosen.

The decision rule was fixed before the numbers: a model ships only if one threshold admits every paraphrase,
refuses every distractor, and leaves a margin of at least 0.05 -- with the threshold at the midpoint, the only
value that encodes no preference between the two errors.

Measured, no model comes close:

| model | paraphrase (min–max) | distractor (min–max) | gap |
| --- | --- | --- | --- |
| `char-2gram-cosine` | 0.180 – 0.460 | 0.164 – 0.539 | **−0.359** |
| `char-3gram-cosine` | 0.059 – 0.276 | 0.000 – 0.360 | **−0.301** |
| `char-4gram-cosine` | 0.041 – 0.139 | 0.000 – 0.246 | **−0.205** |
| `char-5gram-cosine` | 0.021 – 0.106 | 0.000 – 0.148 | **−0.127** |
| `token-dice` | 0.111 – 0.267 | 0.000 – 0.286 | **−0.175** |

Every gap is negative, which is stronger than "the model did badly": a single threshold would have to sit
above every distractor and below every paraphrase at once, and for every model the highest distractor is above
the lowest paraphrase. The best of the five misses the bar by 0.177.

The probe also reports what the least bad threshold *costs*, because overlap proves no threshold is right and
says nothing about how wrong the best one is. `token-dice` at 0.267 misclassifies 10 of 100 pairs: 8 true
paraphrases refused, 2 descriptions of other faults credited. Wrong in both directions, on the model whose
distributions overlap least.

One row is worth its own sentence. `char-2gram-cosine` scores the scorer's own mutation string
(`unrelated-candidate`) at **0.202**, above the floor of its own paraphrases (0.180). Shipping that model would
make Type Accuracy unfailable, which `runOfficialRegression` would then report as *mutating `reason` did not
lower the score*. The mutation grid is what makes the fallback safe to reason about at all: it is the guard
the earlier rounds did not have, and it is why this round could ask the question.

**Conclusion, recorded rather than implemented.** The fallback is not a piece of work this repository has not
got round to. It is outside what a model with no weights can do, and the boundary has a number on it. The gap
row in `docs/targets/aiops2025.md` now carries the measurement and the bar a future candidate must beat: every
paraphrase above every distractor, margin at least 0.05.

## Finding 392 — three exemptions were one duplicated guard, written three times

v3.46's census published nine throw rows as `exempt`, and three of them carried the same sentence: *the same
check as a proved line above them, in a block that runs later, so these cannot be the one that reports.*

The sentence was true, and reading it as an excuse hid what it described. A check that another check always
fires first is a check that was written twice:

- `recordedTypeMisses` and `recordedCategoryMisses` each held their own copy of *this run is not in the table*
  -- the same map, the same key, the same message;
- `categoryEvidence`, `denialEvidence` and `derivationEvidence` each held their own copy of *this corpus
  carries no `samples` array* -- **on the same file**, since all three resolve to
  `golden-master/fault-extraction/samples.json`, two through paths built inline and one through `DATASET`.

So the honest repair was not a test that reaches the copy behind the first one. It was to delete the copies:
three duplicate guards became two, and the inventory went from **41 throw statements to 38**.

Two structural facts had to be settled to make the remaining two reachable, and both are the same fact:

| guard | why it could not fire | what it takes now |
| --- | --- | --- |
| unknown run | the only caller passed a name it had already validated | `runBody(run)` takes the run name |
| corpus without `samples` | the path was a constant inside the body, and the shipped file always has the array | `readSamplesCorpus(path)` takes the path |

They live in `scripts/type-miss-readings.mjs`, and where they live is not a matter of taste. A test may not
import a **probe**: `verify-gates-are-testable.mjs` proves a probe by emptying it, an import is resolved when
the file is loaded, and the worker dies before vitest can attribute a failure -- the meta-gate then reports
`UNATTRIBUTED`, which is indistinguishable from a broken test. The rule's own message names the repair, and
this is its fifth instance: *move the reading into a data module and leave the verdict in the gate.*

The split cost one thing worth recording, because it is the kind of thing a split always costs: the fixture
tree in `published-refusals.test.ts` copies the probe into a scratch checkout and symlinks `packages/` and
`node_modules/` beside it. One file became two, the copy took one, and the refusal it drives failed with an
ESM resolution error rather than the message it asserts. The fixture now copies both, which is the whole price
of the split and is stated in the test where the next reader will need it.

## Finding 393 — the budget rules were written for the job that failed, and no other job was asked

`ci-budget.mjs` was built after the batteries job timed out, and every rule in it is about
one job: `R1` reads `baseline.job`, `R2` compares that job's steps against the recording's
`steps` map, and `R3` says *a step that inherits the job budget declares no bound of its
own*. The gate was green, and the rules were answering a question about the only job the
recording described.

The question the module exists to pose is *will a hang here name the step it hung in*, and
it is a question about a **job**. Measured on the tree as it stood:

| job | measured | steps | steps declaring a bound |
| --- | --- | --- | --- |
| `verify` | 532 s (8.9 min) | 11 | **0** |
| `sensitivity` | 564 s (9.4 min) | 7 | **0** |
| `batteries` | 1575 s (26.2 min) | 22 | 20 |
| `backend` | 39 s | 7 | 0 |
| `artefacts` | 57 s | 13 | 0 |
| `cold-tree` | 19 s | 8 | 0 |

`verify` spends nine minutes -- six of them in `lint` -- and a hang in it was still reported
as *the job timed out*, which is the exact sentence the step bounds were introduced to
replace. The budget was not too small; it was **aimed at one bucket**. Three days of
`verify` hangs would have produced three verdicts naming eleven steps and no culprit, in a
tree whose gate said the budgets were fine.

The repair is structural rather than a number. `readWorkflow` now returns the jobs it read
-- id, label and budget -- because a walk over steps cannot answer *does this job bound
anything*: a job whose steps were all renamed still exists, and a job with no
`timeout-minutes` has no budget to inherit. The recording holds `jobs`, keyed by the
workflow's own id, and the label is kept beside it because a run reports its jobs under the
label, so a file keyed by id has to know which name to look for. `R3` asks every job whose
steps cost more than the floor across more than one step. Two exceptions are stated rather
than assumed: one step is excused, because the job's budget already names exactly that
step -- which is the whole thing a step bound buys -- and a job under the floor is excused
because there is nothing to spend. `budgetSummary` prints the excused jobs so a reader sees
the exception being taken instead of an omission.

## Finding 394 — the bounds could not survive a fresh reading, and the arithmetic asked for a second job

The baseline was run `41180476384`, measured on 2026-10-31 with the tree at `85f7b1e`:
twenty-two steps, 1230 s, bounds sized at exactly twice each measurement. Re-recording the
green run `41637098008` three days later refused the shipped numbers **five times**:

```
`Type-miss probe battery` is bounded at 12 min and measured 479 s
`Every gate can be shown to fail` is bounded at 5 min and measured 221 s
`Gate-test battery` is bounded at 5 min and measured 185 s
`Backend-support battery` is bounded at 13 min and measured 416 s
`Backend-support battery` is bounded at 13 min and the steps before it measured 18 min,
  so its bound expires at 31 min -- past the job's 30
```

Nothing was wrong with the gate. The recording was old, the suite had grown, and the same
steps now cost 1575 s where they had cost 1230 -- the bounds were sized against a run in
which the batteries were a third faster. That gap is structural: a gate that runs in CI
cannot fetch a workflow run, so nothing in the tree can tell that a recording is stale, and
a *recency* rule would fail the first tree that had no run at all. What the gate does have
is the arithmetic, and the arithmetic is what makes the staleness visible the moment
somebody measures again: a bound under twice the measurement is refused, and a bound that
expires after the job is refused.

The second refusal is the interesting one, because it cannot be repaired by a number. The
job has 30 minutes; its two longest steps measure 479 s and 416 s, so their bounds alone are
16 + 14 = 30 minutes before any other step is counted. Raising the job's budget is the
response the module's own note calls dishonest -- *a bound that cannot expire before the job
does is a number with no effect* -- so the honest reading is that one job is doing too much
for one budget. The batteries split in two:

| | `batteries` | `batteries-heavy` |
| --- | --- | --- |
| steps | 14 that measure ≤ 221 s | the type-miss and backend-support batteries |
| measured | 674 s (11.2 min) | 914 s (15.2 min) |
| bounds | largest 8 min | 16 min and 14 min |
| budget | 25 min (was 30) | 25 min |
| wall clock | the longer of the two, not their sum | |

Two runs later the same rule fired again, on a different pair, and the pair is worth naming
because it shows the rule working rather than the tree being wrong: `every gate can be shown to
fail` moved from 221 s to 251 s and `type-miss probe battery` from 479 s to 487 s. The second is
the sharper one -- 16 minutes is 960 s and twice 487 is 974 -- so the bound was under the multiple
by fourteen seconds, and would have killed a legitimate run on a slow runner while reporting it as
a hang. Both bounds moved (9 and 17 minutes), and the job's arithmetic still fits the 25-minute
budget. A bound raised *before* it fires is the only kind the module's own note allows: the
alternative is slack.

`sensitivity` is the same arithmetic one job over. One step measures 536 s, so its bound is
18 minutes; a 15-minute budget cannot hold an 18-minute bound plus the 23 s that ran before
it. The job declares **20** now, which is what the bound needs rather than what the
measurement needs -- 9.4 minutes of work in a 20-minute bucket, and a bound that names the
step two minutes before the job would.

## Finding 395 — a job that runs the suite did not install the shells it spawns

`cold-tree-job.test.ts` requires every job that runs the suite to install the shells the
suite's fixtures spawn, and the requirement is an **equality over jobs** rather than a list
of the jobs that existed when it was written: it reads each job's body, follows the
`node`/`python3` scripts its steps name one level deep, and requires any job whose body or
scripts mention `vitest` to install `zsh`.

The new job runs `python3 scripts/injection/backend-support.py`, which invokes
`pnpm exec vitest run --root packages/core`. So the equality asked the job for `zsh`, and
the job had no such step. Nothing failed -- the batteries run targeted tests that do not
spawn a shell -- and the guard is what said so before a fixture grew a shell and made the
question load-bearing. The step is in the new job now, and the register beside the equality
names the job, so the next one cannot be added without a shell either.

## The shape the three share

Each was a rule that answered a question about **the member that failed** rather than about
the set it belongs to: a budget for the job that timed out, a recording of the job the
budget described, a shell check that listed jobs instead of asking them. The set was in the
workflow the whole time, and the reader that could have walked it -- `gate-steps.mjs` -- was
already parsing every job, using the job ids to key its plan, and returning only the steps.

## Finding 396 — every number in the recording was checked, and none of them said which tree

`ci-budget.mjs` had five rules and all five compared the recording against the workflow or
against itself: the run and commit and date are present (`R1`), the jobs and steps match
the workflow in both directions (`R2`), a job that costs minutes bounds its steps (`R3`),
a bound is at least twice its measurement and at least the floor (`R4`), and a bound
expires before the job does (`R5`). The gate was green, and the recording it read was
run `41670923224` taken at `61dff700c`.

The shipped tree at that moment was `91e320884`, and its run was `41677264353`. The
recording was one run and one commit behind, and **nothing in the tree could have said
so**: every second in the file is a real measurement of a real tree, taken by the only
script that may write it, and the one thing that had moved was *which tree*. A recording
does not age in any way its own contents can show.

The gap is not the arithmetic; it is the missing second opinion. The repository does
write down which run a round ended on -- the `| CI |` row of the round's ledger, which
reports the jobs' wall clock after the run comes back green -- and nothing read it. It
was prose: `check-citations.mjs` verifies finding numbers, no gate looked at a run id, and
the newest row was the only sentence in the tree that knew the current run and the only
one that could disagree with the recording.

### What the rule reads, and why the row rather than the log

A `| CI |` row is the round's closing reading, and it is written **after** the run is
green, because a row reporting a red run's timings is not a closing reading. So the newest
run in such a row is a run this repository has already looked at, and the recording has no
business being older than it. That is `R7`: a comparison, not a number.

Two halves, and the second is what makes the first mean anything. The recording may not be
older than the newest cited run; and **the ledger's newest row must name its run**, because
a row that reports a wall clock without naming the run leaves the recording unopposed --
the gate's silence would then read as agreement with a round it never compared itself to.
A rule that only compared numbers would pass on a log that stopped naming runs, which is
the same defect one layer out.

### The three rows that name no run

`runsIn` found three `| CI |` rows in the shipped log with no run id: `volume-03.md:1174`,
`volume-08.md:835`, `volume-10.md:882`. They report what a job looked like rather than
what a run measured ("the new step reads the reports in 0.056 s", "five jobs green on the
fourth push"), and they predate the convention.

They are **counted, not corrected**. Naming a run for them now would mean deriving the id
from a commit in git history and guessing which of that commit's runs is meant -- two
runs exist per push here (the workflow and the anchor round trip) -- and an invented
provenance is worse than a stated gap. So the reader returns them as `unnamed`, the
summary prints how many there are, and the rule needs only that the **newest** row names
one. The count is in the reading line rather than in a comment, because a gap nobody sees
is a gap nobody closes.

### Why the ids cannot be confused with the commits beside them

The rows cite both, in the same backticks, a few characters apart: `run `41677264353` on
`91e320884``. A run id is ten to twelve digits; a commit here is written as nine
characters. The pattern is stated once, in `ledger-runs.mjs`, and the reading is bounded on
both sides so a thirteen-digit token is not read as its first twelve -- a reader that
returned a slightly wrong run id would refuse the tree for a run that never ran, which is
the failure mode worse than silence.

### The round it caught

This is the part worth writing down: the rule was written **after** the defect, and the
defect was still there. The round's row then cited `41677264353`, and with that row in place
the gate refused the shipped recording:

```
check-ci-budget: the recording is from run 41670923224 and `volume-10.md:2173` reports run
41677264353: a recording older than the round that reports it describes a tree nobody
shipped, so its seconds size the bounds of a workflow that has since run -- take a new
reading with `node scripts/measure-ci-baseline.mjs 41677264353`
check-ci-budget: FAILED — 1 problem(s)
```

The file is `docs/progress/volume-10.md` and the line is the one it printed then: the row
moves as the ledger grows, which is why the message names the file and not only the row. The
repair was one command, and the summary then read `the ledger's newest run is 41677264353
(the recording)`.

Two bounds moved anyway, and not because of that repair: the run after it measured the same
steps again and both heavy batteries had grown -- 494 s to 530 s, 418 s to 427 s -- so 17
minutes was under twice 530 and 14 was under twice 427, by 40 s and 14 s. They move to 18 and
15, and the deadlines still fit: 18.4 min and 24.2 min inside a 25-minute job. What is left is
a prediction rather than a defect -- at this rate the second bound expires past the job's
budget in two or three rounds and the heavy job splits the way `batteries` did. The bounds only
follow the measurement if somebody takes a new one, which is what `R7` is for.

A gate whose first red is the tree it was written in is a gate that has been **observed**
rather than described.

## Finding 397 — six exemptions were sentences, and the rule measured the sentence's length

`golden-master/gate-sites.json` publishes 41 `throw` statements, six of them `exempt`. The
rule that reads them asks two things: that the row carry a `reason`, and that the reason be
longer than forty characters and distinct from its neighbours. That is a rule about **prose**.
Prose cannot fail.

What the six reasons actually claimed was checkable, and two of the claims had never been
checked at all:

| row | what the reason claimed | whether a test measured it |
| --- | --- | --- |
| `build-example-bundle.mjs:57` | the pack cannot contain a repeated path | no -- nothing asserted the shipped pack's paths are unique |
| `build-example-bundle.mjs:60` | the pack always appends `MANIFEST.json` | partly -- one fixture test read the manifest out of a *fixture* pack, never the shipped one |
| `measure-doc-counts.mjs:267` | every state of the tree is diagnosed before this line | one of the three states (a missing workspace list) |
| `probe-m1-ceiling.mjs:118` | `includes` over the same objects is exact | **yes** -- and had been for four rounds, unnamed |
| `probe-type-misses.mjs:269` | `checkRca100Structure` publishes four named checks | spread across several assertions, stated by none |
| `probe-type-misses.mjs:1268` | `classify` returns one of three kinds for every row | no -- the counts were compared with three recomputed counts |

The fourth row is the one that makes the defect legible: a test in `m1-ceiling-probe.test.ts`
had been asserting "the two halves of the component partition are a partition" since the probe
was written, and the inventory never said so. **The claim was held; the row did not know.**
An inventory that publishes a proof as prose is an inventory whose proofs a reader has to
re-derive, and the re-derivation is exactly what nobody does on the fifth round.

## Finding 398 — the pack's reader walked one directory, and the download is promised as a tree

Writing the first row's statement -- *the shipped example tree produces a pack in which no
archive path appears twice* -- required building the pack from the real tree instead of from a
fixture, and that exposed the reader:

```js
for (const name of readdirSync(EXAMPLE_DIR).sort()) {
  const full = resolve(EXAMPLE_DIR, name);
  if (!statSync(full).isFile()) continue;      // a directory is skipped, silently
```

The tree is flat today (`examples/order-prod` holds six files), so nothing was wrong yet. What
was wrong was that **nothing could say so**: the pack's index is written by the same reader, so
the index agreed with the archive, `--check` compared the archive with itself, and the download
would simply have been one directory short the first time anyone organised an example into a
folder. Measured, by adding `examples/order-prod/nested/extra.json` to a fixture tree: the old
reader's pack listed 9 rows and the new one lists 10, and the path
`examples/order-prod/nested/extra.json` is present only in the second.

The fix is the reader, not a guard: `readdirSync(dir, { recursive: true })`, with the relative
path preserved so a nested file lands on a distinct pack row. The statement test is what found
it, which is the point -- a sentence about "the example tree" had been satisfied by a reader
about "the example directory", and the difference is invisible while the tree happens to be one
level deep.

## Finding 399 — the counts were checked against counts, and never against the classifier

`probe-type-misses.mjs:1268` refuses when the three classification counts do not add up to the
number of rows, and the inventory exempts it because `classify` is total: every pair comes back
as one of exactly three strings. The existing test compared the probe's three counts with three
counts computed here by filtering `c.kind === k`, and the two agreed for every recorded run.

That comparison is a check between two readings of one classification, and it is blind in the
one place the guard is about. A fourth kind would make `counts[kind]` increment a key that does
not exist, and both sides would go on agreeing at a lower total -- unless the guard fired, and
the guard is the line the exemption says no test can reach. The claim ("the return set is
closed") had no test; the figure that depends on it had two.

The closure is now measured against the shipped `classify` rather than this file's copy, over a
table built to be adversarial: an empty pair, a pair that normalizes to nothing, one that
differs only by case, one that shares exactly one token, and every recorded miss of both runs.
All of them land inside the three kinds, which is what makes the three counts a partition rather
than three tallies that happen to sum.

## Finding 400 — the download's index was written by the reader it was supposed to check

`site/assets/example-pack.json` lists every path in the archive, and `--check` compares the
archive against it. Both sides come from `readExampleFiles()`. A reader that drops a file
therefore produces an archive, an index and a **passing check** that agree with one another
and disagree with the tree — which is finding 398 exactly, one round later, still in the
tree, because 398 was fixed in the reader and nobody asked what the *tool* would have said.

The measurement that made it visible was writing the check:

```js
const inTree = treeListing(EXAMPLE_DIR);
const missing = orphansInTree(EXAMPLE_DIR, inTree);   // the listing, compared with itself
```

That is the first version, and it is a tautology: `inTree.filter((p) => !inTree.includes(p))`
is empty for every tree, including one the reader had lost a file from. It printed
`example pack is up to date` and would have kept printing it. The defect was found by
reading the line while wiring it, not by a test — and it is the same shape as 398: a check
whose two sides share a source can only ever agree.

The fix is a third reading and an arithmetic. `treeListing()` descends with `opendirSync`
handles instead of `readdirSync(..., { recursive: true })`, so the recursion strategy — where
398's defect lived — is not shared. The build then refuses in two directions: a tree file the
pack does not carry, and an archive that is not exactly the three generated files
(`README.md`, `run.sh`, `MANIFEST.json`) larger than the tree. Both counts are published, so a
reader of the download page can compare them without building anything: **9 rows against 6
files**.

The two readings also disagree about one real thing, and the disagreement is informative
rather than noise: `statSync` follows a symlink and `Dirent.isFile()` does not, so a symlinked
example is carried by the reader and invisible to the listing. The build refuses and names both
counts. That is the honest answer until somebody decides which of the two readings the pack
means; a check that silently picked one would be the defect this finding is about.

## Finding 401 — rule 9 made an exemption point at a title, and a title is an index too

v3.50 closed six exemptions that were prose by requiring each to state a claim and name the
test that holds it. The rule checks that the file resolves, that it is a test file, and that a
test with exactly that title exists. What it cannot check is the thing the sentence is about:
whether the body of that test still measures the claim.

That gap is not hypothetical at the scale this repository works at. The six claims are four
different kinds of statement — a uniqueness property, a presence property, a class, a
partition, a closure — and each is one edit away from being false. Nothing had ever *made* one
false. The inventory said "held", and "held" meant "a title exists".

So the exemption now carries a fifth column, `mutant`: `{file, find, replace, defect}`. The
edit is published beside the claim it falsifies, and `verify-claims-are-sensitive.mjs` applies
it and requires the named test to go red. Measured on this tree: **7 claims, 12 runs, 12
seconds, 6 red on an assertion and 1 on the code's own guard, no survivors.**

The distribution is the finding. One of the seven is caught by the *code refusing*, not by an
assertion: the m1 partition's claim is enforced by the guard the exemption is about, and
mutating the derivation makes the probe throw before it can publish anything — so the test reds
because the measurement refused. A battery that treated any non-zero exit as "caught" would
report that red as an assertion; one that demanded an `AssertionError` would report it as
unmeasured. Both are wrong, so the verdict distinguishes "the tree broke" (`SyntaxError`,
`Transform failed`, a module that will not load — reported as unmeasured, never as caught)
from "something noticed" — and says which of the two notice-paths fired.

The sixth assertion was the seventh claim, added late in the round: the pack's "no orphan"
claim is caught because the comparison returns an empty list and the test asserts a name. So
the split moved from 5 and 2 to **6 and 1** when the seventh claim arrived, which is the point
of reporting the split at all — it is a reading, not a description of the design.

## Finding 402 — a table of edits rots in the one way the table cannot see

A mutation is a substring replacement, so it is an index of the tree. The tree moves. Rule 10
therefore refuses a `find` that does not occur exactly once, and the battery refuses a file
with uncommitted changes before it writes to it — the second because a restore would otherwise
put back somebody else's edit, and because a run that starts on a dirty file cannot distinguish
its own mutation from what it found.

Both refusals were exercised rather than assumed. Moving one `find` string out of the tree
turned rule 10 red with the count and the file; and the
battery, run against the working tree while this round was still being written, refused with
"`scripts/build-example-bundle.mjs` has uncommitted changes, so a mutation would overwrite work
this run cannot restore" — the gate failing on the round that wrote it, which is the only
evidence that a precondition is a precondition.

## Finding 403 — a step cannot be added, because its measurement is behind the gate that wants it

The round wrote the battery as its own CI step, gave it a three-minute bound against twelve
seconds of measurement, and then could not publish it. The loop is four links long and every
link is a rule this repository added deliberately:

1. `check-ci-budget`'s `R2` refuses a step of `ci.yml` that the recording has never measured:
   *a bound for it would be a guess*.
2. The recording comes from `measure-ci-baseline.mjs <run-id>`, so the run has to contain the
   step.
3. A run happens after a push, and the pusher refuses a tree with no `verify:local` receipt.
4. `verify:local` runs `docs:check`, which runs `check-ci-budget`, which is red — because of (1).

So the step's own measurement is on the far side of the gate that demands it. `--borrow` exists
for exactly this shape and only for **jobs**: `--borrow batteries-heavy=batteries` records a new
job's seconds as the neighbouring job's, with the derivation written down. There is no
equivalent for a step, and the reason is visible in the code: a job is a unit whose cost does
not depend on which job it sits in, and a step is a unit whose cost is the thing being measured.

The round's answer was to fold the battery into the neighbouring step's command — the same
runner, one `&&`, one bound — which works and costs something worth naming: the step is called
*"Every proved exit can disappear without a word"* and now runs two batteries. **The name is
narrower than the command, and a reader who trusts the name is reading a summary that is no
longer complete.** That is the price, and it is recorded here rather than absorbed.

The fix is a third derivation in the recording, the one `--borrow` already is for jobs: a step
that is new or newly named takes its seconds from a step that ran, says which, and says which
run it came from. That is not this round's work, and pretending the loop is not there — by
naming the step after both commands, which is the same loop with a longer name — would leave the
next round to hit it again with less context.

## Finding 404 — the push carries a tree, so the log it publishes can lose commits

The round made four commits and the remote received one. `10ef7dd` (the falsifying edit),
`b7ae319` (the documents), `091650a` (the step that could not be added) and `35645c4` (the two
defects the local gate found on the way) arrived as `b323263a0`, whose message is the last of
them. Every tree was byte-identical at every step, the receipt gate passed, `verify:local` was
green over 32 commands, CI was 7 of 7 -- and a reader of the published history would conclude
that this round was a single change.

The mechanism is in the channel and was written down there without being counted as a risk. The
API has no way to receive a pack: a push here posts a **tree** and a **message**, and the commit
object is rebuilt around them. When the local parent is the remote tip, the rebuild reproduces
the local commit exactly. When an earlier push already rebuilt one -- which happens the first
time a local parent is not a remote object -- the tip is posted on the remote tip and **the
commits in between are not sent at all**. The script's own fallback text says so: *"the content
is identical, the ancestry is not"*. That sentence was true and incomplete: the content of the
intermediate commits was identical to nothing, because it was never sent.

What made it invisible is worth more than the bug. Every reader in this repository asks about a
**tree**: `gate-receipt.mjs` keys its receipts on `HEAD^{tree}`, `verify-local.mjs` covers the
working tree, CI checks out a tree, and the audit asks what the tree can demonstrate. A tree is
the unit of everything here, and a log is the one artefact no gate reads. So the channel could
drop the round's account of itself and every instrument said green, truthfully.

The repair is to stop hopping. `push_incremental.py` now walks back from the revision being
published to the newest commit whose **tree** the remote already holds -- a tree is the only
thing the two repositories can be compared on, since rebuilt commits have different shas -- and
posts each commit after it in order, each on the one before. Three or four commits cost three or
four tree diffs. `PUSH_PLAN_ONLY=1` prints the plan and creates nothing, which is how the plan was
read before it was published, and this close-out is its first use.

Two limits, stated because the alternative is a claim stronger than the instrument:

- **The replay is not in this repository.** It lives in the publishing script, which the suite
  never loads, so no test covers it; the next round that changes it will be reading it rather
  than running it (P16). The honest fix is to move the plan computation into a module the suite
  can import, exactly as the budget arithmetic was moved out of `check-ci-budget.mjs`.
- **A tree the receipt blessed is the tip's, not the ancestors'.** The replayed commits are
  published for the record; their trees are the steps on the way to the tree `verify:local`
  measured, and the script still refuses to move the ref unless the tip's tree survives. That is
  the same bargain as before, made explicit for the commits that were previously dropped.

## Finding 405 — a step cannot be added, so its name describes half of what it runs

`ci.yml` carried one step that ran two batteries. The round that wrote it explained itself: a step
cannot be added. `R2` refuses a step the recording has never measured; `measure-ci-baseline.mjs`
refuses to write a reading that omits any step of the workflow; `verify:local` runs `docs:check`,
which runs that gate; and the run that would measure the step exists only after the push the gate is
blocking. Four rings, each correct, and together they forbid the one act every new battery needs:
arriving.

The cost was a name. `Every proved exit can disappear without a word` described the first command and
not the second, so a reader of a green run was reading a line about a battery that had not been the
subject of it. That is the defect step bounds exist to remove, one level down -- the verdict names
something that is not the one that hung -- and the previous round's repair was to stop needing the
step rather than to open the ring.

The repair this round is not a fifth exception. It is to notice that all four rings are about
**measurement**, and that a tree which adds a step can still say everything except the number: the
step exists, the bound is written, the job's budget is declared, and the steps in front of it have
been measured. So the missing number is isolated in a file of its own,
`golden-master/ci-declarations.json`, and `R8` is the arithmetic over it -- the step exists, the
bound is the workflow's own, the recording does not measure it yet, the bound clears the floor, the
expiry fits the job, no measured step follows it, and it argues for itself in forty characters or
more.

The lifetime is one recording, and it is structural rather than promised. The recorder will not write
a reading that omits a step, so the first refresh measures it; `R7` requires a refresh on every round
that cites a run, so that refresh is the round the declaration was made in; and `R8` refuses the tree
until the sentence is deleted. A promise that outlives its measurement is refused with those words,
because it is the same defect as a bound nobody checked.

What cannot be settled until the measurement exists is `R4`'s multiple -- the bound must be at least
twice the cost. That is where the bet is placed, and it is placed in public: the round that adds the
step guesses, and the round that refreshes is refused if the guess was too small. A refusal that
names a bound, a measurement and a ratio is a sentence somebody can act on; the standing refusal of
every new step was not.

## Finding 406 — a borrowed measurement carried a budget it never spent

`--borrow` records a new job's steps from the seconds the job it was split out of measured. The
argument is sound for the seconds: a step's cost is a property of the command, not of which job it
sits in. The budget is not a property of the command, and the recorder wrote the recording's
`timeoutMinutes` from the workflow it had just read -- the target's budget, not the source's.

So for a borrowed job, `R6` compared the workflow with itself and could never fire, while the
deadline arithmetic was argued from a ceiling the borrowed seconds had never been spent inside. Two
jobs whose steps are the same commands are still told apart by what they are allowed to spend. The
recorder now refuses a borrow across a budget and prints both numbers, which is the only place the
source is still known.

The shape is the round's larger one, one field over: a number that came from somewhere other than
where the check believed it came from. Three rounds in a row, the defect has been a comparison whose
two sides were not independent -- a pack index written by its own reader, a check that compared a
list with itself, and now a budget copied from the job that was being checked.

## Finding 407 — the channel that publishes every finding was never run by a test

Four hundred rounds of findings reached `api.github.com` through `push_incremental.py`: 362 lines
of Python in a scratch directory outside both repositories, with no test, no review, no CI, and one
assertion. The assertion was `if base != local_tree: refuse` -- content, compared with content. It
was sufficient while content was the only thing the channel could get wrong.

It was not sufficient in v3.51, when the channel published one commit out of three. Every tree was
byte-identical, `verify:local` was green, and the round's account of itself had lost two thirds of
its sentences. The repair walked back to the newest commit whose tree the remote held and
republished everything after it, and its only execution was the incident it repaired.

The defect is not that the repair was wrong. It is that the **decision** -- which commits, in what
order, on what parent -- had no subject: it was a function inside a file that immediately performed
the effect, so the only way to look at a plan was an environment variable on a program that must not
be run against a branch it might move, and the printed plan was read by nobody and compared with
nothing.

What the round did with it:

| before | after |
| --- | --- |
| `replay_plan(rev, base_tree)` inside a 362-line Python script outside the tree | `planPublish({remote, commits})` in `scripts/publish-plan.mjs`, a function of data returning data |
| the effect interleaved with the decision in the same file and the same loop | `scripts/publish.mjs` executes a plan and never computes one |
| no test, no address to test | 26 cases in `publish-plan.test.ts` against real repositories, 32 in `publish.test.ts` including an end-to-end publish over HTTP |

The plan says everything except the two fields it cannot know. It is written before any object
exists, so the commit SHAs are the API's answer and not the planner's guess; what it carries instead
is where each object hangs -- `parent` and `base`, each either the remote tip or the local commit
whose rebuilt form precedes this one. The executor resolves a symbol exactly once and refuses one
it cannot resolve. A plan with `parent: null` for the executor to fill in would have a hole in the
one field that decides the history, which is finding 404 with better manners.

The strongest assertion the suite makes is not about a tree. After a replay,
`git -C remote rev-parse main` equals `git -C local rev-parse HEAD`, and the two logs are equal line
for line -- because a commit is a deterministic function of its tree, its parents, its message and
its identities, so a rebuilt commit is *the same commit* when the plan is right. Narrowing the plan
back to the tip alone turns 8 of the file's 32 cases red, and the first of them is the log
comparison. The trees stay equal; the sentences do not.

## Finding 408 — the fallback that produced the incident survived the repair, announced by one line

`replay_plan` returned `None` when no local commit's tree appeared in the remote's ancestry -- a
rewritten history, a rebase, the wrong branch. The caller's answer was:

```python
if plan is None:
    print("the remote holds no tree of this revision's ancestry -- publishing the tip alone")
    plan = [REV]
```

That is the incident exactly: the tip's content arrives, the ancestry does not, every tree matches,
and the round's messages are lost. The repair added the replay above it and left the fallback in
place, so after v3.51 both "the remote is behind" and "the remote is on a different history" ended
at `VERIFIED` -- separated by a line of stdout that nothing reads.

A refusal replaces it, and it quotes the finding, because a reader who meets this state will
otherwise re-derive it from a log comparison that looks correct:

```
the remote holds neither 4a1c9ff02 nor any tree of its ancestry: its tip is 7c3e1ab88
(tree 91f0d2c4e) and no local commit has that tree. Publishing the tip alone is how
finding 404 lost two of three commits — the tree arrives and the sentences do not.
Rebase onto the remote, or publish the branch that produced that tip
```

The case that proves it also checks that nothing was written to either repository, which is the
difference between a refusal and a report of one.

An unborn branch is not the same state and does not take the same path. `head: null` means there is
nothing to locate, so the whole ancestry is the window and the root commit legitimately has no
parent -- published onto nothing, which is what a first push is. It is exercised against a bare
repository whose ref has been deleted, and it ends in the same equality every other case asserts.

## Finding 409 — a listing that said it was partial was used to decide what to delete

`GET /git/trees/{sha}?recursive=1` truncates at 100 000 entries or seven megabytes and reports
`truncated: true` when it does. The channel computed its deletions as *every path in the remote
listing that the local revision does not have*. A path absent from a partial listing and a path that
was never there are the same absence, and the direction of the error is the bad one: files the
local revision removed stay on the remote, and the rebuilt tree keeps them.

The assertion at the end does notice -- the built tree is compared with the local one and the ref
does not move. It notices after every blob of the round has been uploaded, with a message about two
trees and no cause. The refusal now arrives before the first upload and names the listing:

```
the tree listing is truncated, so it cannot be used to decide what to delete:
a path missing from a partial listing and a path that was never there read the same
```

The case asserts three things, and the second two are the ones that make it a refusal rather than a
later error: the message, that no `POST /git/trees` was made, and that no `POST /git/blobs` was.

## Finding 410 — a merge was republished with one parent

`"parents": [head]` -- one line, always, in the commit the channel posts. A merge inside the
replayed window therefore arrives with its second side removed, and the SHA the remote records is
not the SHA that was written. Nothing in the channel compared the two, because the comparison it
made was between trees.

This repository's history is linear, so the line survived four hundred rounds by never being
reachable. That is a fact about this history and not about the code: the sentence would be true of
any repository the channel is pointed at next, and it would become false silently.

The planner refuses a replayed commit with any number of parents other than one, and says what the
second parent is: *a merge carries a history in its second parent that the remote would not receive,
so the SHA it receives would not be the SHA that was written*. Zero parents is allowed in exactly
one state -- the root of a plan onto a branch that does not exist -- and that exception is stated in
the same condition rather than implied by a caller. The case builds a real merge, two branches and
`--no-ff`, so the refusal is proved against git's own notion of a merge rather than a hand-made
record with two parents in it.

## Finding 411 — an alternate object directory let the harness answer its own question

The local transport exists so the execution has a subject: a bare repository standing where
`api.github.com` stands, written with the same objects, so a correct replay leaves the remote's
commit SHAs equal to the local ones. The first version of it added the source repository to
`GIT_ALTERNATE_OBJECT_DIRECTORIES` so that a rebuilt commit could find its parent. The suite was
green.

It was green because `git commit-tree` does not write an object it can already reach. The rebuilt
commit was byte-identical to the local one because it *was* the local one, found through a wire
that was not there -- nothing had crossed the boundary, and the equality was a statement about one
repository compared with itself.

The failure surfaced sideways. The ref update refused to move the branch backwards, and the reason
was `git -C remote cat-file -t <rebuilt>` answering `could not get object info`: the object existed,
in the repository the harness had let the server see. Removing the alternates fixed the equality and
made it stronger than it was designed to be -- the remote now holds only what was uploaded, so an
object the plan references without sending it fails loudly rather than being found locally.

The rule this leaves is the round's ruler turned on its own instruments: **for every assertion, name
the observable that would be absent if the code did nothing.** When the answer is "nothing", the
assertion is measuring the harness. It is the same failure as finding 406 one level out -- a check
whose two sides were not independent -- and it is the third round in a row with that shape.

## Finding 412 — the first real push lost a request to a closed socket, and the retry could not see it

The close-out of v3.53 pointed the new channel at `api.github.com` for the first time. The
docs repository went first as the smallest possible subject -- ten files, two commits, no gate --
and both commits arrived with the right trees, the right parents and the right messages. The
main repository followed with four commits, all four present on the remote in order. So the
channel worked. Then the third push, one commit changing two prose files, failed twice:

```
1/1 aaf954f8f on the remote tip: 2 changed, 0 removed, 10 file(s)
publish failed: fetch failed
```

The cause was `UND_ERR_SOCKET: other side closed` on `POST /git/blobs`. A `curl` to the same
endpoint with the same body answered 201 in under a second, and a Node `fetch` of the same
2.2 MB base64 body answered 201 on its first attempt. The failure is a connection the peer
closed, not a body it refused, and not a status: undici throws a `TypeError` instead of
answering, so the transport's retry loop -- which compares `response.status >= 500` -- never
sees it. The whole push fails on a transient event, with no mention of which request died.

The defect is a shape, not a number. The in-process server in `publish.test.ts` answers every
request it is given; it cannot disappear between the request and the answer, because the same
process is both sides. A test written against that server can drive a 500, a 400, a 422 and a
moved ref, and none of them is the failure the real network produced. The acceptance contract
said as much one round earlier -- *the possibility that the live API answers something this
server does not model remains* -- and then the live API produced something sharper: not an
answer the server does not model, but **no answer at all**.

The repair puts the connection in the same retry loop as the status. `isNetworkFailure` names
only the codes a broken connection carries (`UND_ERR_*`, `ECONNRESET`, `EPIPE`) and the
`TypeError('fetch failed')` undici raises; every other failure is thrown unchanged, because a
retry is for a connection and not for a mistake. Four cases hold it: a server that destroys the
socket answers on the retry and the push ends at the local tip; a server that destroys it every
time spends exactly its budget and then refuses, with the ref unmoved; a `fetchImpl` that throws
an ordinary error is called once and not retried; and the classifier is driven against both
shapes. Removing the new branch from `call` turns the first two cases red.

Two boundaries are now honest rather than merely humble. The read path was measured against the
real API for both repositories (640 entries, 598 files after 42 tree entries are skipped,
`truncated: false`), and the write path was measured by a real push; what remains unmodelled is
any *other* error shape. And the real push's commit SHAs are not the local ones: the old
channel rebuilt history with UTC author dates, so the remote is a different lineage with the
same trees, and the CLI prints `identical: false` rather than a `VERIFIED` it cannot justify. The
end-to-end log equality belongs to the test, where both sides are local git objects; the real
push proves that every commit arrived. Neither claim stands in for the other.

## Finding 413 — a job that has never run has no place in the budget rules

`R6` compares the ceiling in the recording with the ceiling `ci.yml` declares for the same
job id. A job no run has measured has no entry in the recording, so `R2` refuses it as "a job
nobody can size a bound for", and `--borrow` has refused a pair with unequal budgets since
finding 406. Two correct rules meet and close the loop: adding a job needs a recording, a
recording needs a run, a run happens after the push, and the push needs `verify:local`, which
runs `check-ci-budget`. P17 had been on the open list for a round with no way forward.

The repair is not a fifth exception but a promise, one level above `R8`. `ci-declarations.json`
gains a `jobs` list; each entry may name exactly four things -- the job id, the ceiling written
in `ci.yml`, the bound on **every** step of that job in order, and an argument of at least forty
characters. `R9` checks each against the workflow, exempts the job from `R2`'s gap, and refuses
the promise the moment the recording holds that job, because its first run is the thing it was
waiting for. A file with only `jobs` and no `declared` is a normal shape; a file with neither is
a file that says nothing and is refused.

Nineteen cases in `ci-budget.test.ts` drive the whole relation: the pair that is green with the
promise and red without it, the expired promise, a budget the workflow does not declare, a step
omitted / added / reordered / re-bound, a step with no bound of its own, the floor, the argument,
a job that does not exist, a duplicate promise, two promises about one job, the two whitelist
shapes, the two empty-file shapes, the summary, the separation of the two maps, and the refusal
to pretend a deadline exists. Each says which failure shape its fixture cannot produce.

The promise was then published, and the run it was waiting for answered it. `42160224254` measured `sensitivity-shard` at **387 s**; the recorder reported that one declaration was now measured and could be deleted; the deletion is in the same round's last commit; and `check-ci-budget` reads **8 jobs / 82 steps / 54 bounded** with a 25-minute bound at **3.9x**. No part of that sentence could have been written by the file -- which is the difference between this finding and a rule that only looks right.

## Finding 414 — a promise carrying a measurement would forge the one number only CI can spend

The previous round's ruler was about a file: name the fields its writer cannot know. This
round's is about a test: name the failure shape it cannot produce. On a job declaration the two
are the same question. A local apparatus cannot spend a runner's budget -- it cannot produce a
job that timed out, or a step that took 313 seconds -- but it *can* catch somebody writing
those seconds into the promise, because the forged number has to arrive as a field.

`JOB_PROMISE_KEYS` and `STEP_PROMISE_KEYS` are therefore whitelists rather than a documented
convention. `seconds`, `run`, `commit`, `measured`, `ratio` and `derived` are each refused by
name, at both the job and the step level; the sentence says the promise may only name what its
writer can know. Without this rule a reader would take the file for a recording, and `R4`'s
multiple and the first-run settlement would both be argued from a number no run produced.

The ruler is also enforced rather than recited. Every case in the new block carries a
`Cannot produce:` comment, and a case of its own reads the block back and refuses any new case
without one. The mark is assembled from two pieces and counted only on comment lines, so the
check does not count its own pattern as a mark -- a self-counting assertion would pass with one
fewer real statement than cases, which is the hollow witness this campaign keeps finding.

## Finding 415 — a job with no measurement has no deadline, and a rule that computes one is lying

`R5` asks whether a step's bound expires before the job does: the bound plus the **measured
seconds** of every step in front of it has to fit inside the job's ceiling. Every step of a job
that has never run is unmeasured, so the sum has no terms. Substituting the *bounds* for the
measurements would be claiming to know how long a runner spends in steps nobody has watched --
the same forgery finding 414 refuses -- and it would refuse every ordinary job, because the
bounds of seven three-minute setup steps and one twenty-five-minute battery already exceed a
twenty-six-minute ceiling even though the setup steps take twenty-two seconds between them.

`R9` computes no deadline at all. The absence is written into the rule, into a case that asserts
the green path contains neither `expires` nor `deadline`, and into the acceptance boundary. The
first green run supplies the seconds, and `R4`/`R5` settle the bounds in the same commit that
deletes the promise. A rule that answered a question it has no evidence for would have been
harder to notice than no rule: it would print an arithmetic expression and look like proof.

## Finding 416 — a borrow would settle a declaration without a run

`measure-ci-baseline.mjs` is the only writer of the recording, and the recording is the answer
to a promise. If a declared job were borrowed from another job, its id would appear in the
recording and `R9` would immediately demand the promise's deletion -- against seconds from a
different job, on a run in which this job did not exist. That is finding 406's "compare a thing
with itself" one level over: the promise's lifetime is one real run, and a borrow would shorten
it to one manual recording.

The recorder now reads the same declarations file as the gate. A declared job the run does not
report is skipped, not filled: the recording keeps the hole, prints how many promises are still
waiting, and `check-ci-budget` is green in that state because `R9` reads the same promise and
the same recording. A `--borrow` naming a declared job is refused with a sentence that says a
borrow is not a run. The first run that reports the job records it normally and says the promise
can be deleted, leaving the sentence for the round -- a tool that erased it would delete the only
account of why the job exists. Three end-to-end cases drive the three shapes against a real HTTP
server and a fixture workflow.

## Finding 417 — a split can silently measure a subset of itself

The sites battery measured 626 seconds on the runner against a bound `R4` put at 1252 seconds;
v3.53 bought back the 52-second shortage by moving the bound from 20 to 25 and the ceiling from
21 to 26. This round spends less instead: the sorted claimant files are divided by position
between `sensitivity` and a new `sensitivity-shard` job, each running half the claims against
the same 25-minute bound, so the wall clock is the slower shard rather than their sum.

A split introduces a failure shape a single job cannot have. Omit a shard, call one twice, put
two shards in one job, disagree on `n`, or leave one shard with no files, and each shard's own
summary still reads as a clean bill of health about the claims it did run. Nothing in the
summary can see the claims it did not. `checkShardPlan` reads the real `ci.yml` and the real
inventory, recomputes the partition with the same pure function the shipped script uses, and
refuses each of those six edits with a different sentence: the indices must cover `1..n`, every
shard sits in a different job, every shard holds a file, and every proved claim is measured
exactly once. A case merges the `--list` output of both shards and compares it line by line with
the unsharded `--list`, so the function agreeing with itself is not the evidence -- the shipped
script is.

## Finding 418 — an empty shard passes while measuring nothing

When `n` exceeds the number of claimant files, `position % n === i - 1` yields an empty file
list for some shards. An empty baseline list and an empty mutant list are both empty, so
`failures` is zero and the script prints `PASSED`. Zero is also the output of an empty suite, an
isolated suite and a collection failure, which is the shape this repository has refused in
counting, in fault extraction and in the site inventory.

`verify-sites-are-sensitive.mjs` now refuses a shard with no claimant before spawning any child,
in the same exit that refuses an inventory with no proved site. The case drives `--shard 999/999`
against the shipped tree and asserts three things: a non-zero exit, the diagnostic
`holds no claimant`, and empty stdout -- no claim can be reported green by a run that ran none.

## Finding 419 — one flag made an entire job invisible to the shell guard

`cold-tree-job.test.ts` decides which jobs run the suite by following each `run:` line to the
script it names and reading that script for `vitest`. Its pattern ended in `$`, so
`node scripts/verify-sites-are-sensitive.mjs --shard 1/2` did not match. Adding an argument
changed nothing about what the job does, yet the guard answered "this job runs no suite" about a
job that does nothing else. Worse, the old `sensitivity` job disappeared from the same set, and
because the assertion is an equality in both directions, **all fifteen cases stayed green** with
one fewer item on each side.

The `$` is gone and the script is taken as the first token; the flags after it are arguments to
that script, not a second command. `sensitivity-shard` is registered in `SUITE_JOB_IDS`, and the
six jobs that run the suite are named again. This defect was found by registering the new job,
not by reading the guard -- the same way finding 395 was found, and the reason the register is
checked against the workflow rather than trusted.

## Finding 420 — a job that is never over the floor is never asked for a bound, so the first time it is, there is nowhere to put one

Run `42165763231` failed the budget gate on `backend`, a job this round had not touched:
seven steps, no `timeout-minutes` on any of them, 296 seconds measured. `R4`'s rule is
"measured over the floor and bounded nowhere", and the previous run had measured the same
job at 37 seconds, so the rule had been silent for ten rounds. The variable half is
`sudo apt-get install prometheus`: a mirror having a bad day is not a finding about this
repository, which the comment above the step had said since the job existed.

What the rule had never been asked is the second-order question. Once a job is over the
floor, the floor applies to **every** step of it -- that is the half of `R4` that stops a
job from sharing one budget silently -- and seven steps at three minutes are **21**. The
job's ceiling was **20**. So the job was one minute too small to be bounded the way every
other job is, and the fix could not be "add seven bounds": it had to move the ceiling, which
`R6` then refused.

The ceiling is **34** now: five setup steps at 3, the install at **16**, the reader at 3. The
sixteen is the part worth arguing. `R4` asks for twice the measurement and this step measured
273 s in this run, which would say 10; it measured **648 s** on a cold runner, which this
repository wrote down when the job was created. A bound sized on the warm day is a bound that
fires on the cold one and reports a mirror as a hang. 16 is 3.5x the warm reading and 1.5x
the cold one, and it is the only number in this workflow that was chosen from a range rather
than from the reading in front of it -- which is why it is in the open list rather than
described as settled.

## Finding 421 — `R6` refused the safe direction of a budget change as hard as the dangerous one

`R6` compared the recording's `timeoutMinutes` with `ci.yml`'s and refused any difference.
The reason it gives is exact: the step bounds are arithmetic against the job's budget, so a
recording taken under another budget is arguing about a different job. But "another budget"
is two directions with different consequences, and the rule treated them as one.

A **smaller** ceiling invalidates the reading. A bound that fitted inside 45 minutes may
expire after the job has already died at 30, and that is the defect step bounds exist to
remove -- the job dies, and the verdict names the job rather than the step.

A **larger** ceiling invalidates nothing. No step bound moves. Every `deadline = bound +
before` that fitted inside 20 minutes still fits inside 34, so `R5` only gains room. The
reading describes the same commands, spent in the same seconds, and the only thing that
changed is how long the container is allowed to be.

Keeping the symmetric rule had a cost that is the same circle `R9` was written to open: a
ceiling could only be widened by a run, a run happens after the push, and the push requires
this gate. `backend` was blocked by it on the very round that had to bound the job.

`narrowed(record, job)` is now the whole difference, four lines with a comment that says
which direction is which. It also has a third shape that `null` makes easy to get wrong: a
job with no ceiling has no deadline arithmetic at all, so *removing* a ceiling is the widest
change there is and *adding* one is the narrowest, and both are stated. The summary reports
every widening by name -- `budget(s) widened since the reading: backend 20 -> 34` -- because
an exception a reader cannot see is an exception the recording appears to have taken itself.
Four cases hold it: narrower refused, missing refused, wider accepted and named, removed
accepted. The case that used to assert the wider direction was refused now asserts the
narrower one, which is the behaviour that was always meant.

## Finding 422 — a bound at exactly twice a reading fires on a five per cent slower day

Refreshing the recording to run `42172498744` failed the gate on `Lint`, a step this round had
not touched: **361 s** measured against a **12-minute** bound. Twice 361 is **722**, and 720 is
two seconds short. The bound had been sized in v3.53 from a reading of **347 s**, where twice is
694 -- inside 720 by 26 seconds. Nothing about the step changed; the runner had a slightly
different day, which is the one thing a measurement of a runner always has.

Read the rule as written and the gate is correct: it refuses a bound under twice the
measurement, because a runner twice as slow should be reported as slow rather than as hung.
Read it against a sequence of readings and the defect is in the sizing, not the rule. `R4`'s
lower bound is a *floor* on the margin, and a bound placed exactly on a floor has no room for
the thing floors cannot see: the measurement's own spread. 347 to 361 is 4%, and 4% is enough.

The repair is 14 minutes -- 840 s, 2.33x the reading, and 840 plus the 27 s measured in front of
it is 867, inside the 15-minute ceiling. No ceiling moved, so `R6` had nothing to excuse, and
the gate is green with the recording and the workflow agreeing again.

The lesson is not "add margin" -- that sentence would justify any number. It is that a bound
sized from **one** reading is a bound sized from the wrong statistic, and this round produced
the demonstration twice in three runs: the slower shard's 13-minute plan was refused by 440 s
(finding on `R9`'s settlement), and the lint bound was refused by 361 s. Both were arithmetic
that looked right against the reading in front of them. The next round that sizes a bound should
say which reading it used and what it expects a slower day to cost, or the number is a guess
with a decimal point.

## Finding 423 — every bound in this workflow was argued from the last day rather than from the worst day

Finding 422 ended with a sentence and a promise: *a bound sized from one reading is a bound
sized from the wrong statistic, and the next round that sizes a bound should say which reading
it used and what it expects a slower day to cost*. Every bound in `.github/workflows/ci.yml`
was, until this round, a multiple of **one** number -- the seconds of the single run
`golden-master/ci-baseline.json` happened to record. `R4`'s `2x` was twice *that* day. The
statistic a bound needs is a maximum over days, and the recording holds a sample of one by
construction, so the rule was arithmetically exact about the wrong quantity. It showed up
three times in three runs -- a 13-minute plan refused by a 440-second reading, `backend`
unbounded because it had never been slow in front of the recorder, `Lint` refused by 361
against 720 after being sized from 347 -- and each time the repair was to move a number.

`R10` is the rule the arithmetic was missing. `golden-master/ci-readings.json` holds one entry
per run the recorder has ever measured, each step carrying its seconds **and the command those
seconds were spent on**; a bound must be at least twice the slowest reading of *its command*,
from whichever job and whichever run. The command is stored in each entry rather than resolved
through today's tree, because a renamed step would otherwise lose its series, and losing a
series is losing the slow day that justified a bound.

Two consequences fall out of keying by command instead of by name. The same command in two
jobs is one series: `sensitivity` and `sensitivity-shard` run the same script on the same
claims, so the slowest day of either is the slowest day of both, which is the honest reading
and also the one that stops a new job from starting with no history. And an action step keys
by its name, because an action has no `run:` of its own and the download is what costs -- two
jobs that both `Set up Node.js` are the same dowload, not two.

The summary now says which reading the tightest bound is tight against, by job, seconds and
run id: `tightest sensitivity / Every proved exit can disappear without a word at 2.1x of the
slowest reading of its command (633 s in ... run 42142175689)`. A ratio nobody can trace to a
run is the number this round exists to stop printing.

## Finding 424 — a history that demands today's workflow shape deletes the days a bound needs

The first version of `R10` had the recorder write the history entry with the same strictness
as the recording: every job of today's workflow, every step of every job, or refuse. That is
correct for the recording -- a bound with no reading is the state `R2` refuses -- and it is
exactly wrong for a history. `42131836805` ran **seven** jobs; today's workflow has eight,
because v3.54 added `sensitivity-shard`. The recorder refused the run with `holds no job named
"sensitivity-shard"`, and a rule that insists on this will refuse every run from before the
last structural change -- which is to say, adding a job silently resets the evidence to the
sample of one that `R10` was written to remove.

The two files answer different questions and now have different rules. The **recording** is
what CI will spend: it must describe the workflow as it stands, so a gap is a refusal. A
**seed** (`--seed`) is evidence about a command on a day: it is appended to the history, never
to the recording, and a job or step that did not exist then is named in the report rather than
thrown -- `seeded run 42131836805 with 7 of 8 job(s) and 75 step(s); 1 item(s) did not exist
then: sensitivity-shard did not exist`. A seed may not be newer than the recording (that day
is the recording, not a seed), may not be the recording (one day entered twice is one day
weighted twice), and may not be combined with `--borrow` (borrowed seconds are not a day
anything ran).

This is the difference that makes `R10` worth having. With four consecutive runs of one
afternoon the "slowest day" was a fast day, and the gate accepted a `sensitivity` bound of 20
minutes that a seeded **633 s** day promptly refused.

## Finding 425 — a deadline summed the recording rather than the slowest day, so two ceilings had been checked against a fast day

`R5` says a step bound must expire before its job does: `bound + the steps in front of it <=
the job's ceiling`. The prefix was summed from the seconds in the recording -- one day, the
day. Under `R10` that sum is no longer the right one: if a step may legitimately take twice
its recorded time, then everything in front of the bound may too, and a ceiling validated
against the fast prefix is a ceiling that a slow morning overruns. The job then dies at its
own ceiling and names no step, which is the whole defect step bounds exist to remove.

The prefix is now each step's slowest recorded day. Two ceilings moved as a direct result and
neither had been touched by this round:

| job | bound whose deadline broke the ceiling | prefix at its slowest day | old ceiling | new ceiling |
| --- | --- | --- | --- | --- |
| `verify` | `Lint` 14 min | 1019 s (the shell install at 153 s, not 9) | 15 | **18** |
| `batteries-heavy` | the 15-minute backend-support bound | 1532 s | 25 | **27** |

Both were green before and would have failed the first slow morning. `Test with coverage` was
the second step out of `verify` at 902 s, which is how close the old 15 was.

## Finding 426 — the shell install's bound was under twice its own slow day

`Install the shells the suite cross-checks against` was bounded at 3 minutes in all five jobs
that run it. Its reading in the recording is 9 seconds, so twice the day was 18 -- inside 180
by a wide margin, and green for ten rounds. The history holds **153 s** for the same command
on `42131836805`: an `apt-get update` against a slow mirror. Twice 153 is 306, which does not
fit in 180.

The bound is 6 minutes in every job. Nothing about the step changed; the difference is that a
day exists in which it took 17 times longer than the day the bound was written on, and until
this round nothing in the tree could see that day. This is finding 423's defect in its purest
form -- a bound's `2x` was measured against a number that had only ever been small.

## Finding 427 — a bound can be too wide to fit inside its own ceiling

The sites battery's bound was 25 minutes, set in v3.53 from a 626 s day. The history now holds
633 s, and twice that is 1266 s, which 1500 still covers -- so `R4` and `R10` were satisfied.
`R5` was not, once the prefix was counted at its slowest day: 1500 s of bound plus 180 s of
shell install in front of it is **1680**, and the ceiling is **1560**. The job would have died
first and named nothing.

There are two repairs and they are not equal. Raise the ceiling to 29 and the deadline fits;
narrow the bound to 22 (1320 s, 2.09x the slowest day) and the deadline is 1500, inside 1560
with the ceiling untouched. The second is better on the thing the bound is for: a hang is
reported seven minutes sooner, and the job's worst case does not grow. A ceiling is a
tolerance for imprecision; a bound is a claim about a command. Raising the tolerance to keep a
claim that was already looser than the evidence requires is the move that makes budgets mean
less.

So 25 became 22 in both shard jobs, and the ceiling stayed at 26. The gate's own summary shows
the result: `tightest sensitivity / Every proved exit can disappear without a word at 2.1x`.

## Finding 428 — the instrument that could not say why, on the first red it had to explain

The first CI run of this round failed the sites battery's shard 2 with one sentence:

```
verify-sites-are-sensitive: some claimants could not be measured at all:
  packages/core/test/sensitivity-shards.test.ts does not pass on its own, so its claims are unmeasured
    run it alone: node ... run packages/core/test/sensitivity-shards.test.ts --reporter=dot
```

A file, a verdict, and an instruction to go and reproduce it by hand. The same shard passes
locally in 2.9 minutes with 92 claims and 120 runs, so the reader had nothing to go on: not the
exit code, not one line of what the run printed.

Two functions were in the way, and the first is right. `failureSummary` picks at most four
lines out of a failed run -- the failing test, the error line, the totals -- and deliberately
returns **nothing** when none of the three is present, because a summary it invented would be a
sentence about a failure nobody described. What it cannot do is hand back the evidence instead
of a diagnosis, and that is exactly the case here: vitest exits non-zero **with every test
passing** when a worker's RPC deadline expires (`[vitest-worker]: Timeout calling
"onTaskUpdate"`), which this repository has now measured three times and written down twice.
Such a run prints none of the three lines, so the summary was empty, so the gate printed an
empty detail.

`outputTail` is the second function: the last three lines the run actually printed, trimmed and
truncated, printed under `its own output ends:` so a reader knows it is a quotation rather than
a summary. `failureSummary` keeps its contract and its case; the caller chooses between the two
by whether the summary is empty. The sentence also carries the exit code now --
`does not pass on its own (exit 1)` -- because a red test and a dead runner are different
findings and only the number tells them apart before the output is read.

The second half is a hypothesis the reading supports and the first CI run of the fix will test.
The battery runs `CONCURRENCY = 4` claimants at a time, and each claimant is a `vitest` of its
own: left to the default, every child sizes its pool from the machine, so four claimants on a
four-vCPU runner ask for **sixteen** workers. That is finding 297's oversubscription inside the
suite reproduced one layer out, and its signature is the one that arrived: a red with every test
passing, paid for by the synchronous files. A one-file run has nothing to parallelise, so
`--maxWorkers=1` costs no wall clock and removes the oversubscription by construction.

Neither change makes the battery faster. Both make its next red legible, which is the property
the battery exists to have and the one it did not have when it mattered.

Three mutations hold the pair: one-file runs sizing their pool from the machine, a red run with
no report explaining nothing, and a tail that keeps the first lines instead of the last. The
third **survived** on its first case -- the fixture had exactly three lines, so "the tail" and
"the head" were the same three lines -- which is the same defect the mutation is for, in the
test rather than the code.

## Finding 429 — the channel that carried every push could not say what the API answered

Three repairs in three rounds were argued from one anecdote each. Finding 412 is the first
real push losing a request to a closed socket; v3.51 is `POST /git/blobs` answering `500` with
an empty body on a five-entry tree and accepting the same body on the next attempt; v3.53 is
`docs/audit.md` at 1.1 MB refused as base64 with `400 malformed request` and accepted as
`utf-8`. Every one of those sentences is true and none of them is a measurement: the channel
printed its plan and one verdict, and the two to forty requests underneath them left nothing
behind.

So the next question -- *did this push retry, and what did the upstream say when it did* --
had to be answered by reading a terminal at the time. The open list's first entry was the
honest version of that: *keep a reading of what the API answered on every real push.* It had
been open since v3.53 and no round could close it, because closing it is not a repair -- it is
a file and a reader.

## Finding 430 — the unit is the attempt, and the field the retry reads is the field the row keeps

A record per push would have hidden every failure this channel has met. A push is one plan
line per commit and one verdict; the failures arrive per *request*, and two of the three above
were invisible in the verdict because the retry absorbed them. So the row is one attempt:
`at`, `method`, `path`, `attempt`, `status`, `ms`, `sent`, `received`, and the optional
`remaining` the API reports.

Two fields are arguments rather than plumbing.

`status: null` together with `error` is the shape of "the connection broke", and it exists
because `fetch` answers a closed socket by throwing rather than by answering: there is no
status to record, and a row that omitted the field would look the same as a row whose writer
forgot it. The reader therefore requires the `null` explicitly and refuses a row that has
neither a status nor an error -- an attempt that neither answered nor failed is not a thing
that happens.

The error's `code` is read from `failureCode`, the same function `isNetworkFailure` calls. The
alternative -- one expression in the retry rule and another in the recorder -- is two
instruments reading the same event, which is finding 428's shape one file over: a red the
instrument could not describe. A row that named `UND_ERR_SOCKET` on an attempt the retry did
not consider would be the recorder disagreeing with the decision it is supposed to explain.

`remaining` is written only when the API sends `x-ratelimit-remaining`. A synthetic `0` would
read as an exhausted quota on a server that never mentioned one, and an operator acts on that
number.

## Finding 431 — the inventory published `OK` as the diagnostic of a refusal

The first derivation of the site table attributed the new gate's exit to the nearest
`console.log` above it, and that line was
`publish-readings: OK (${entries.length} row(s) of ${file})`. So the inventory recorded the
passing sentence as the diagnostic of the failing branch -- the defect this repository has
found in other people's gates three times, in its own table, on the first round that added a
gate to it.

The cause is the shape `process.exit(main(...))`: a computed exit whose diagnostic is
somewhere inside the function it calls, which `derive-gate-sites.mjs` cannot follow. The
repair is the one `check-open-list.mjs` already used -- read and judge in a function that
returns, then a literal `process.exit(1)` below the failure's own sentence -- and it is
recorded here because the shape is the kind that gets copied: `process.exit(fn())` reads
tidy and publishes a lie.

The same round removed a `catch` in `publish-cli.mjs` that only re-raised. Nothing could
observe it: the failures it would have caught are thrown outside its `try`, and the row it
left in the inventory said a forward existed that no test ever reached. A row nothing can
reach is a row that says nothing about whether the code is live.

## Finding 432 — the plan that was printed as far as the pipe happened to drain

The second CI run of the round failed `Test with coverage` on a test this round never touched:

```
FAIL test/sensitivity-shards.test.ts > the --list of every shard is the unsharded --list
AssertionError: expected [ …(193) ] to deeply equal [ …(183) ]
```

Four calls, seconds apart, one `golden-master/gate-sites.json`: the unsharded `--list` printed
**183** claim lines and the two sharded calls printed **193** between them. The first CI run of
the same round was green on the same test.

The mechanism that fits is a discarded tail. The gate writes one line per claim with
`process.stdout.write` and then calls `process.exit(0)`; on a pipe that write is asynchronous, so
everything still in the stream's buffer dies with the process. A gate that prints a plan and
exits is exactly the shape that loses it, and the loss would be the last N lines printed --
which is why the sorted diff showed the missing rows scattered rather than cut off the end.

The test of that hypothesis was a **2 000-claim** inventory, about 160 KB, past any pipe buffer.
On this machine the count came back **whole**, and the round wrote that up as "the candidate is
excluded". That was wrong, and the way it was wrong is the finding: a local pass is a statement
about local timing. The next CI run executed the same case and answered **171 of 2 000**. The
case built to prove the tail would be lost is the case that lost it, one environment over.

The repair is `writeFileSync(1, plan)`: the same bytes down the same descriptor, with the caller
waiting. A program about to exit owes its reader a flushed pipe, and a loop of `console.log` has
never owed anybody that.

Two things were repaired and one was not. The gate now flushes. The shard case no longer depends
on a file staying still while four processes read it: it drives all four calls against a copy
trimmed to fifty proved sites through `RCA_SENSITIVE_INVENTORY` and asserts `50`, so the count
says which file was read. What was **not** repaired is the observation that started it -- a test
holding a real invariant can be green for the wrong reason, and only the day something moves the
file shows it.

## Finding 433 — five pushes in a file that had no unit to be deep in

The open list held the gap twice and in two different words. One entry said the publish readings
*begin at v3.56* and that the history is **one round deep**; the other said a push cannot be told
from the requests that carried it, because the rows carry no push id.

They were one defect. The file did not hold one push. Partitioned by the only rule that survived
contact with its rows, it holds **five** -- written the same afternoon, 65 rows between them:

| attempt | rows | retried | unanswered | slowest request |
| --- | --- | --- | --- | --- |
| 1 | 3 | 0 | 0 | `GET /git/trees/ed3b1c254…` 5 044 ms |
| 2 | 25 | 2 | 2 | `POST /git/blobs` **28 385 ms** |
| 3 | 8 | 0 | 0 | `POST /git/blobs` 2 120 ms |
| 4 | 16 | 0 | 0 | `POST /git/blobs` 2 211 ms |
| 5 | 13 | 1 | 1 | `POST /git/blobs` **29 632 ms** |

So the entry that called the file one round deep was not a lie about its contents. It was a
sentence about a file in which depth could not be measured: 65 rows, no boundary, and a reader
that could count requests, retries and unanswered attempts and could not say how many pushes had
produced them. A number nobody can compute gets described by its size, and 65 rows from one
afternoon reads as one push.

The variance that went missing with the boundary is the whole reason to keep a history. The
slowest request of attempt 3 is 2 120 ms and of attempt 5 is 29 632 ms -- fourteen times, in one
file, on one branch, in one afternoon. A per-file average of about 8 000 ms describes a channel
no single push ever met, which is the shape `R10` was written about (*a maximum taken over a
sample of one*) arriving in the subject that was built to repair a different instance of it.

The first attempt is three reads and no writes: `--dry-run`. It is counted, and it should be,
which is why the honest name for the unit is a **publish attempt** rather than a push. A dry run
is the attempt whose latency would otherwise have to be guessed at, and it is also the one that
created nothing.

The repair makes the attempt a thing in the file -- `{ rev, branch, rows }` -- and the reader
prints how many attempts the file holds, how many of them named a tip, and one line each with
that attempt's own slowest request.

## Finding 434 — a boundary read off a gap answered the right number by accident

With the rows timestamped, the obvious partition is a threshold: two requests more than *N*
milliseconds apart begin different pushes. The six gaps in the file are 2 299 s, **30 s**,
1 875 s, 3 183 s, 2 781 s and **32 s**, and the two short ones are *inside* a push -- each is the
backoff before the retry of a blob upload that hung and then closed.

A 20-second threshold answers **seven** attempts. A 60-second threshold answers **five**, which
is correct, and correct by luck: every threshold between 32 s and 1 875 s produces the true
partition. The 30-second retry gap is the refutation of the approach rather than an awkward
case -- this channel has already spent 28 seconds hanging on one socket, so a push whose slowest
request outlasts the threshold is a push the threshold cuts in half. A number that is right by
accident, and that moves the answer as the channel gets slower, is the shape `R10` was written
about a second time.

So the boundary comes from the channel's own behaviour, where it is not a guess. `publish()`
asks the remote for the branch before it decides anything, so the first request of every attempt
is `GET /git/ref/heads/<branch>`, and that row *is* where one attempt ends. The reader enforces
it from both sides: an attempt that begins with any other request is refused, and an attempt that
reads the branch a **second** time is refused too -- because two attempts stored as one look
exactly like that. The file that described itself as one push now states five boundaries, and
would refuse a sixth that it could not place.

`rev` is the commit the attempt carried and is `null` for these five: the rows never named a tip,
and a reader that filled one in would be inventing the fact the field exists to report. The
summary prints `0 with a named tip`, so the gap stays a number in the gate's own output.

## Finding 435 — the rule refused the retry it had been written next to

The second-read rule's first version called this a defect:

```
GET /git/ref/heads/main   attempt 1  status 500
GET /git/ref/heads/main   attempt 2  status 200
```

A `500` on the branch read is retried by the rule v3.51 added, so a channel behaving exactly as
designed produces the shape the new rule condemned. The case that states it was written before
the rule was, and it went red in the same minute -- which is the entire argument for writing the
case first in its smallest form, stated as an incident rather than as a preference.

This channel reads a branch twice for exactly two reasons and neither is a hole in the boundary:
`updateRef` answers a `422` by re-reading the branch to say what the remote moved to, and a
`500` or a closed socket on the read itself is retried. The repair exempts both -- the `422` by
looking for the refused `PATCH` above the read, the retry by `attempt > 1`, since a folded
attempt always begins at attempt 1 of its own read. That last clause is what makes the exemption
safe rather than convenient: an attempt that started at attempt 2 is refused outright, so no
retry can be a second push in disguise.

**And the sixth attempt, which named itself.** The push that carried this round is the first
whose `rev` is not `null`: `e23e9e352`, three commits, 611 files per tree, `25 request(s), 0
retried, 0 unanswered; slowest POST /git/blobs 1790 ms`. Attempts 2 and 5 of the same table
each spent 28-29 seconds on one blob before the socket closed. So the reading the anecdote could
not produce is now a comparison inside one file: the same work, on the same day, over the same
branch, is **1 790 ms** when the connection holds. The twenty-eight seconds were the connection
and not the body, which v3.56 could argue only from a retry that succeeded in 1 343 ms.

## Finding 436 — a 404 on a branch read is two states, and the channel had one

`publish()` asked the remote for the branch, `head()` turned a `404` into `null`, and `null`
was read as *unborn*. Two different worlds answer that status: a repository where the branch
has never been created, and a repository where the branch is spelled differently. The plan is
identical for both -- replay the whole ancestry as a chain of new commits -- and only the write
can tell them apart, which is after every blob and every commit has been made.

Measured by hand once: `publish-cli --branch main` against a repository whose branch is
`master`. The plan was "publish the whole history onto nothing". The merge refusal stopped it,
and only because the two histories had diverged; on a linear history the same command creates
`main`, leaves `master` untouched and exits with the code of a successful push. A push that
reports success and moved nothing anyone asked for is worse than one that fails, because
nothing afterwards is wrong.

The repair asks the one question that separates the two: what does the repository hold? On a
`404` the channel asks for the refs, and the answer decides the meaning of the status:

- **nothing listed** -- the branch is unborn, and replaying the history is the only thing a
  push can mean;
- **anything listed** -- the branch is *absent*, which is a name that is wrong rather than a
  branch that is new, and the push is refused unless the caller says `--new-branch`;
- **`409`** -- the API's other way of saying there is nothing to list, read as the empty list
  rather than forwarded, because the status carries the fact the decision turns on;
- **`403`, or a body that is not a list** -- forwarded, because a listing this channel was not
  allowed to read is not a repository with no refs, and the difference is a push onto a branch
  that may already exist.

The listing is asked for only on that path, and the assertion is the shape of an ordinary
push's requests: no `/git/refs` row appears in one. The refusal names what it found, cut at
five names and counted past that, with branches and tags told apart -- a repository holding one
tag and no branch is one where no push has ever landed, and a sentence that said "1 ref" would
leave the operator to guess which.

## Finding 437 — the channel could not create a branch, and described the failure as one that moved

With the decision made, `--new-branch` had to be honest, and it was not. `updateRef` issued
`PATCH /git/refs/heads/<branch>`, which updates a reference that must already exist. On an
absent branch the API answers `422`, the code re-read the branch, and the refusal printed:

```
the branch moved while the plan was being executed: it was null and is undefined.
Nothing was forced — re-read the branch and plan again
```

A sentence about a branch that never moved, carrying `undefined`, printed after the push had
uploaded every blob of every commit it was never going to publish. Everything the real channel
could do with an unborn branch was: build it, upload it, refuse it, and describe the refusal
wrongly. The local transport could do the whole thing, because `git update-ref` creates a ref
that is not there -- which is why the difference survived: every end-to-end proof of the path
ran on the transport that can.

The repair is the call the API has for the state, `POST /git/refs` with `{ref, sha}`, and its
own `422` -- the name was taken while the commits were being made -- gets its own sentence:
`the branch '<name>' was absent when the plan was made and is not now`. That sentence is built
**without** re-reading the branch, and the moved-ref refusal beside it does re-read, because
the two know different things: a SHA can be compared against what the branch is now and both
halves printed, while `null` says only that the branch was absent. A second read would also be
a second branch read inside one push, which the readings gate refuses without an exemption it
would then have to grow -- so the shape of the reading file decided the shape of the sentence.

## Finding 438 — the stand-in server was kinder than the API, so the suite proved a call that cannot work

The unborn path had an end-to-end proof and the proof was green. It was green because the
server that stands where the API stands created the branch on a `PATCH`: it passed
`expected: null` to `local.updateRef`, `git update-ref` created the ref, and the fixture
answered `200` to a request the API answers `422`.

So the suite's only proof of *publishes a whole history onto a branch that does not exist yet*
was a proof of a call that cannot work, and the leaf that made it green was the fixture's
permissiveness rather than the channel's correctness. This is the failure mode of a stand-in
that is written from the same reading of the API as the code it stands in for: it fails in the
direction of yes, and the code and the fixture agree about a world that does not exist.

The repair is one branch of the fixture: a `PATCH` whose ref is absent answers `422`, and a
`POST /git/refs` creates it. The order matters and was kept -- with the repaired fixture the
old code fails the case and the new code passes it, which is the only order in which the case
is worth having. The general form applies to all nine endpoints that server speaks: each is a
claim about the API, and a claim more permissive than the API is invisible until a real push
meets the difference.

**What this round does not claim.** The creation path has no real push behind it: nothing in
this repository's history has ever created a branch, and the first one that does will be the
first one. It is proved by the suite's server and by the local transport, and that is a
statement about two stand-ins rather than about the API.

## The reading this round leaves

The refusal is two rows and no write -- the branch read, then the listing that decided it -- so
the history gains a shape it has never held: an attempt that ends in a refusal, at a cost of
two requests against the twenty-five of the push that followed it. A channel whose readings
only ever contained successes would have had no way to see the difference.

The round's own push is attempt 7. It carries no `/git/refs` row, because `master` exists and
the probe is only asked for when a branch read answers `404` -- the absence is the reading, and
it is worth stating in a file whose subject is what the API was asked.

## Finding 439 — the mutation survived because the case tested both sides of the boundary and neither side was the boundary

The battery's fourteenth substitution replaced `<=` with `<` in the sentence's cut and the
file stayed **green**. The case it was aimed at had two examples, three names and seven, chosen
because they are *short* and *long* -- the two categories the sentence reads as producing
different output. The code does not branch on short and long; it branches on a number. Three
and seven answer identically under either comparison, and the one length that differs is five.

So a case written by naming the categories a reader can name leaves the number it cannot name
unmeasured, and the mutation reports that gap rather than the defect it was meant to find: a
survivor is a statement about the case, not about the code. The repair is two more examples --
exactly five, and exactly six -- and the same substitution now dies.

The shape is `R10`'s, one subject out: a threshold described by two points chosen away from it.
A bound is not measured by a fast day and a slow day if neither of them is the bound.

## Finding 440 — the strongest assertion in the suite could not hold, and the channel had never said why

The end-to-end cases assert that the remote's commit SHAs equal the local ones. The channel's
own verdict on a real push is the same claim, printed as *"VERIFIED: ... byte for byte"*, and
the sentence a push prints when it fails is *"the tip's tree is the local one and its SHA is
not (the history it hangs on is not the local history)"*. Both of those had been read for
several rounds as a description of an exceptional state. They were describing every push.

The measurement is cheap and had never been made: walk the remote's `master` and the local
`HEAD`, pair the commits by subject, compare the SHAs. Of 483 commits on the remote, **236
share a name with their local twin and 247 do not**, and the newest commit that still shares
one is 246 commits back. So the bound is a date: from that round on, every push has renamed
every commit it carried, and `identical` -- the flag the whole assertion rests on -- has been
false for two hundred and forty-six commits.

Two explanations were plausible and both were measured rather than argued. The API might trim
a commit message's trailing newline, and `git commit -m` always writes one; and it might
normalise the author's `+0800` offset to UTC, which this repository's commits all carry. Both
were tested by asking the API to create a commit and hashing every candidate byte string
locally with `git hash-object`, then comparing the returned SHA with each candidate. `probe:
one trailing newline`, `two trailing newlines`, `a space then a newline` and `no trailing
newline` each matched the candidate **containing the bytes that were sent**, and the
`+0800` candidate matched the returned SHA exactly. The API keeps both. Neither explanation
survives, and the reading that killed them is worth more than the two would have been.

What is left is the parent line. `git cat-file -p` of the local commit and of its rebuilt twin
differ on **one line**: `parent cf6c575b…` against `parent dc9af862…`. A commit's name is a
hash over its bytes and its bytes include its parents' names, so a push that hangs its first
commit on a commit the remote holds -- one carrying the tree of a local ancestor and not that
commit, which is what `locateBase` falls back to matching -- renames every commit above it.
No correctness in the replay can prevent that, and the sentence the channel printed was not
wrong. It was an *unverified* account of a cause, and a reader could not tell it from a rebuild
that had lost a file.

## Finding 441 — a cause is worth what the measurement behind it is worth

The repair is a prediction rather than a better sentence. `predictRebuild` takes a local
commit's own bytes, replaces the `parent` lines in order with the names the remote will use,
and hashes the result: when the remote's answer equals that prediction, the replay carried the
tree, the message, both identities and the parent *count*, and the name differs for the one
reason the channel can name. When it does not, the rebuild lost a byte, and `publish` refuses
rather than describing it.

Two properties make it a proof rather than a second opinion. Given a commit's own parents it
returns that commit's name -- it is reconstructing the very bytes git hashed, so a reader that
mangled the message or the header order fails its own round trip before it can be believed.
And the cases hold it against an oracle it shares no line with: `git commit-tree` builds an
object from a tree, a parent, a message and two dates, and the prediction must equal what git
writes, including the one commit shape with two parent lines.

The verdict is three-valued -- the local commit, the local commit with its parents renamed, or
neither -- and only the third refuses. The first two are announced *before the first request*
when the base is a twin, because an operator who learns after the fact that the names will
differ cannot tell a rename from a loss, and the dry run has to say the same thing as the push.

## Finding 442 — two columns that could only ever hold (n, 0) and (0, n)

The first version of the verdict counted the exact commits and the renamed ones, and the
battery's eleventh substitution -- `exact += 1` to `exact += 2` -- **survived**. The reason is
not a gap in the cases: a push above a twin renames every commit it carries and a push onto the
same commit renames none, so the pair is always `(n, 0)` or `(0, n)` and doubling one of them
changes nothing a reader could act on. The counters were two columns shaped like measurements
that could only restate the state and the length.

They are gone, and `commits` replaces them: the number of commits the push carried, which is
the only one of the three that can hold more than two values.

The same substitution also caught a second redundancy one layer up: `identical`, the identity
state and the sentence were each derived from `published.commit === tip`, while the *verdict*
that had already answered that question for each commit was used only to choose a log line. A
mutation of the verdict survived because it changed nothing a caller reads. The return value
now derives all three from the tip's verdict, so the fact has one source and a mutation of it
is a mutation of everything that states it.

## Finding 443 — eight proofs dropped by an edit in the middle of a file

Adding one `throw` in the middle of `publish.mjs` moved every line below it, and re-deriving
`golden-master/gate-sites.json` reported `throw annotations: 79 of 87 carried, 8 dropped`.
The eight were not stale: six `rethrow error` statements and two identical `the plan carries a
blob` refusals share their fingerprints, so the carry had nothing left but the line, and the
line had moved. The gate then demanded eight proofs that already existed, in a file whose
header says the fingerprint exists precisely so that an edit above a site does not lose it --
the accident was surviving one degree down, in the fallback.

The rule added is about what a fingerprint can carry. When *every* prior carrier of one
fingerprint holds the same annotation, the annotation is a property of the fingerprint and not
of a coordinate: whichever occurrence a site is, the proof written for it is the same proof.
When two carriers disagree -- one proved, one exempt for its own reason -- no rule can choose,
and the site keeps nothing, because a wrong proof is worse than a missing one. Both halves are
tested; the second was already a case.

## Finding 444 — a stand-in that loses a byte, so that the refusal is not a rubber stamp

The `differs` verdict is unreachable against an API that keeps what it is sent, and against
the suite's server, which writes through git. A branch no case can reach is a branch whose
sentence has never been printed, and the fix here is a fixture that is *less* kind than the
API: the server drops the message's final newline when the behaviour is asked for, the rebuild
is then a commit nobody sent, and the channel must refuse it by naming the commit and the one
thing it can prove -- that the tree, the message, the identities and the parent count are the
ones that left.

That is a counterfactual fixture and it is labelled as one. The API does not do this: the
probe of finding 440 measured four message shapes and the returned SHA matched the bytes sent
in every one. What the case buys is the difference between a verdict that is computed and a
verdict that is asserted -- and, in the mutation battery, the substitution that removes the
refusal turns it red.

## Finding 445 — a file whose cost reached the default was not in the table that looks for it

The push of finding 440 was green: 8 of 8, first run, no rerun. The push after it -- two
documentation lines and a readings file -- came back **red**, on `build / typecheck / lint /
coverage / mutation`, at `Test with coverage`:

> `publishing to a repository through the local transport > carries a deletion and a mode change,
> because both are entries and not absences` -- `Test timed out in 5000ms` (5 293 ms)

Every other test in the run passed. The commit changed no code at all, which is the fact that
decides what kind of defect this is: the same tree passed an hour earlier, so what failed was not
a decision the diff made.

`timeout-budget.test.ts` exists for exactly this shape and its own comment says the honest thing
about itself -- *it checks every row it has and cannot discover a row it does not*. `publish.test.ts`
was not a row. Measured, it costs **6.95 s** of test time standalone (worst of three passes; 6.23
and 6.57 the others), so the file had already been running past vitest's 5 000 ms default on every
green run, and the default was being spent one test at a time: a single case reported at 5 293 ms
is a case that costs half a second in a process that was not being scheduled.

The repair is the one the table prescribes and not a new idea: the budget goes on the **suite**,
because a budget applied where a stall happened to be noticed protects that test and leaves the
next one written on the default. Five suites in the file, `30 000` ms each, five times the worst
reading, and the same number the two other files in the table carry -- a reader can check a
consistency where they cannot check an invention.

The push that carried the repair was **8 of 8 green**, with the coverage job at 9.8 of its
18-minute budget -- so the same tree that spent 5 293 ms on one test spends it inside a bound now.

What this round does not claim: that the file is now safe on any runner. It claims that the file's
cost is above the default, that it says so, and that the number is a measured one. A table that
cannot discover its own omissions will be extended by the next red, which is how this row arrived.

## Finding 446 — a flag that was read as permission while it was a statement

`--new-branch` was added in v3.58 for one job: to exempt the branch read's `404` from the refusal
that a missing branch on a repository with refs earns. That job is a permission, and the flag was
implemented as one -- `if (remote.head === null && !newBranch)` -- so the code asked the flag only
when the branch was absent. What the same word also says was never looked at: *this branch does not
exist*. A push that passes `--new-branch` onto a branch that **is** there published onto it, exactly
as a plain push would.

That is the failure the v3.58 round was written about, one layer up. There, one `404` answered for
two states; here, one flag carries two statements and the channel honours the half that lets it
proceed. The half it ignored is the one the operator is wrong about: they believe the branch is new,
the channel has just read that it is not, and the plan that follows moves a branch they meant to
create. On a linear history nothing afterwards is wrong -- the ref moves, the push reports success,
and the branch that was meant to be untouched now has somebody else's commits on it.

The two halves are one statement, so a false one is refused rather than ignored:

> `'main' already exists at 3c1f0ab7d and --new-branch says it does not: a push that was meant to
> create a branch must not move one. Drop the flag to publish onto this branch, or name the branch
> that is meant to be new`

and the refusal names the commit it found, because that is the fact the caller was wrong about.

## Finding 447 — the creation path paid for a history when all it needed was a name

A branch that does not exist has nothing to locate a base against: `locateBase` compares the remote
against the ancestry, and with `head: null` there is nothing to compare, so `publish` set
`located = { kind: 'unborn', index: ancestry.length }` and the window became **the whole history**.
That is right about content -- the remote has none of it -- and it is wrong about cost whenever the
objects are already there, which is the ordinary case for a branch made from an existing one.

The question that decides it had never been asked: *does the remote already hold this commit?* It is
one request, and its answer decides the whole push, because a commit is closed -- a remote cannot
hold a commit without holding its tree, its parents and every ancestor. So `200` on
`GET /git/commits/<tip>` means the history arrived with it, and the push is one `POST /git/refs`.

`holds(sha)` is that question on both transports (`cat-file -e <sha>^{commit}` on the local one, so a
blob the remote happens to hold is not an answer to it). It is asked only where the branch read
already answered `404`, so the ordinary push pays nothing, and only when the branch is absent, so the
name-is-wrong refusal still fires first. The plan it produces is **empty** -- `pointerPlan` -- which
`planPublish` refuses in the other sense: that refusal's premise is "a plan with no commits would
move a ref to where it already is", and this plan's ref does not exist yet. Naming a commit that is
there is a change, and it is the only change such a push makes.

Two consequences are stated rather than papered over. The command line prints
`the remote already holds 041ca04d1: naming it is the whole push, and no commit is created` and, for
a dry run, `nothing would be built; one request would create the branch` -- because "0 commit(s)
would be published" is true of that plan and tells the reader the opposite of what would happen.
And the result state is a third identity, `held`, with `commits: 0` and no base: there is no window,
because there was nothing to locate. The assertion the rebuild path has to make after the fact --
that the tree the gate blessed is the tree the remote will hold -- is here an identity, since a
commit's bytes contain its tree.

## Finding 448 — one status, two states, at the creation

`422` on `POST /git/refs` wears two states. The name was taken while the push was being made -- the
race the creation refusal exists for -- **or** the commit the ref was to name is not there after all,
which the pointer path makes reachable for the first time: the question answered `200` a moment
before, and a remote is free to collect an unreachable object in between.

The sentence named the first state only, and said *"while the commits were being created"*, which on
a pointer push is work that never happened. Both states are named now, because the channel cannot
tell them apart without a second read it refuses to make: a sentence that names one state and is
sometimes wrong about it is worse than a sentence that names two.

## Finding 449 — a stand-in that answered a question nobody had asked, and a fixture that withheld nothing

Two fixtures, one defect, in opposite directions.

The readings stand-in in `publish-readings.test.ts` answered every route it did not know with
`201 {sha: 'ccc…'}`. That is a success for a question the fixture had never been asked about, and it
became load-bearing the moment the channel started asking `GET /git/commits/<sha>`: the answer was
`201`, `holds` read it as *the remote has this commit*, and the creation path created a branch
naming a commit the stand-in did not hold. Both readings cases it drove then failed for a reason
that had nothing to do with the channel. The catch-all now answers `404`, and the three routes it
was silently covering (`POST /git/trees`, `POST /git/commits`, `GET /git/commits/…`) are explicit.

The other direction is the fixture in `publish.test.ts` that was believed to withhold objects.
`stage()` clones, and a clone carries **every** object the source can reach, so the docstring's
*"none for the ones above it"* described a fidelity it had never had: every case that said the blobs
have to be uploaded had the blobs already in the remote's store. The channel's end-to-end claim
survives -- a wrong byte hashes to a different blob and the tree differs, which the last assertion
catches -- but the fixture could not express the one state this round is about. `staged(name, upto)`
pushes exactly the history it is given, so a commit above `upto` is absent from the object store and
`upto: null` is a repository with no refs at all; and two cases that had been passing on a clone were
moved onto it, where they now publish something.

## Finding 450 — the shared names, asked as objects rather than as sentences

v3.59 measured the boundary by pairing two logs by **subject**: 236 of 483 commits shared a name, and
the newest shared one was 246 commits back. A subject is a string two different commits can carry,
so that number counted sentences that looked alike.

`holds` answers the question with one answer per commit, so the same boundary was re-measured object
by object: **509** local commits, of which the remote holds **237** by name and **272** it does not.
The newest shared commit is `041ca04d1`, **272 commits back**, and the missing ones begin at the very
next commit in the local history. The shared set is exactly a **suffix** of the local log -- the
oldest 237 -- which the pairing could not have established: it says the rename above the boundary is
total, that every commit before it arrived byte-identical, and that no commit above it ever did.

The boundary is also a moving point with a fixed coordinate: it grew from 246 to 272 while the local
history grew from 483 to 509, so the 26 commits this span of rounds added are exactly the 26 the
boundary moved by. That is the arithmetic of a rename that never stops, and it is why the contract
in v3.59's close-out is *isomorphism* rather than equality.

## Finding 451 — a page called "every ref in the repository"

`refs()` asked `GET /git/refs?per_page=100` and returned what came back, and the comment above
it said "every ref in the repository". The API pages. A repository with a hundred and forty
branches therefore answered with a hundred, and the refusal built on that listing — the one
that tells a mistyped branch from a new one — printed **"it holds 100 branch(es)"**: a number
the reader is entitled to act on, off by forty, in a sentence whose whole purpose is to say what
the repository contains.

The decision the listing serves only needs *one* ref to exist, so the count was never
load-bearing for the refusal — but it is load-bearing for the sentence, which is the part a
person reads. And the page walk is the one place where "full" and "last" are different facts: a
hundred is both the page size and the size of a repository that has a hundred refs, so the
obvious implementation (stop when the page is short) still needs one more question than the
obvious reading suggests, and a walk that stops at a full page reports 100 for a repository that
ended there and 100 for one that did not.

The walk is bounded at ten pages, because it runs inside a refusal and a refusal is not a
reason to read a thousand branches. When the bound is hit the sentence says **"at least"**:
a count of the pages this channel read, printed as the count of refs the repository holds, is
precisely the defect the walk exists to fix, and a bound turned into a fact would be the same
mistake with a smaller number.

`refs()` now answers `{ names, complete }`, because the sentence cannot tell a finished count
from a stopped one unless the transport says which it gave. The local transport answers
`complete: true` unconditionally — a directory listing has no page size — which is the honest
form of the same interface, not a special case.

## Finding 452 — a question the previous answer had already answered

The creation path asks `holds(tip)` before deciding to replay a history. On an empty repository
the channel had, one call earlier, read the listing and been told there are no refs at all — and
then asked anyway: *does the remote hold this commit?* A repository with no refs cannot serve a
commit by any name, so the question had a known answer, and the request bought nothing on every
first push this channel will ever make.

The fix is not "skip the question when the listing is empty" as a cost optimisation. It is that
the two answers mean different things and only one of them is about the object store: an empty
listing is a statement about **names**, and the shortcut it licenses would be a claim about a
commit that no name reaches — in a repository whose objects are, by construction, unreachable
and therefore collectable. So the channel does the conservative thing and says so:

> `the remote holds no refs, so there is no name a shortcut could carry: this push replays the
> history and the question about the tip is not asked`

The replay that follows is correct whatever the object store holds. The saving is one request,
and it is on the path where the listing was already paid for, which is why the ordinary push —
a branch that exists — still asks nothing.

The sentence also had to displace another one. The falling-through branch logs *"the remote does
not hold `<sha>`: this push will build the commits that lead to it"*, which is a claim about the
object store; a path that never looked would have printed it after saying it had not looked.
One test asserts the absence of that line, because a log that says two things is not made
honest by the first one being true.

## Finding 453 — the rule that had "nothing to say", and the three requests it was missing from

v3.60 closed with a sentence about its own real creation push: `--no-gate` was described as
honest for *"a state in which the receipt rule has nothing to say: the tree is already on the
remote, so nothing is being published."* The rule had something to say, and it said it — the
gate runs `requireReceipt({ tree: tipTree })` **before** the remote is read at all, so a pointer
push is gated like every other push: what crosses the wire is a reference, and what the
reference makes reachable is a tree. The bypass was real; the explanation was wrong, and the
difference matters because the explanation is what a reader would use to decide whether the
bypass was safe.

Nothing in the suite could have caught that sentence, because no case combined a gate with the
pointer path: `stage()` builds repositories with no `scripts/verify-local.mjs`, so `requireReceipt`
answers `absent` and the pointer cases pass through a gate that is not there. The case added
here builds a repository with a gate and a tip the remote already holds, and asserts three
things at once — the refusal, that the branch was **not** created, and that the executor made
**zero** transport calls, because the ordering is the claim: a gate that fired after
`GET /git/ref/heads/<branch>` would already have learned something about the remote before
asking whether the tree it is about to name was ever blessed.

The v3.60 push remains as it was: a branch created under a bypass whose justification was
misstated. What changes is that the misstatement is now a measured fact with a test that would
have contradicted it.

## Finding 454 — two pages, one key, and a stand-in that could not answer about pages

The HTTP stand-in in `publish.test.ts` recorded `key = method + pathname` and dropped the query.
Every page of `/git/refs` was therefore the same key, so a case could not have shown a walk even
if the channel had made one: the recording would have said *one request* about two. The key
carries the query now, which is also what the readings ledger records (`/git/refs?per_page=100`),
so a page walk appears in both accounts in the same shape.

The route could not answer a page either — it returned the whole list for every request — which
is finding 449's shape a second time, in the same file, four rounds later: a stand-in that
answers a question nobody declared. It now honours `per_page` and `page`, and `refsCount`
fabricates a repository of a given size so a walk can be exercised on a machine that has no
repository with a hundred and forty branches. The `409`-on-the-first-page state got its
counterpart too: `refsStatusAfter` answers a status on pages after the first, which is how the
rule "a `409` after page one is not an empty repository" became testable — and it was not, until
a mutation that read it as one survived the whole file.

## Finding 455 — a branch that could not be created, because it insisted on the whole history

The creation path's window was the whole ancestry, and v3.60 and v3.61 had each described that as
a cost: `locateBase` needs a remote commit to compare against, a branch that does not exist has
none, so there is nothing to locate and everything is replayed. The first real attempt to create a
branch *with objects* -- the one path v3.60 left unproven -- did not fail slowly. It failed:

> `50a8ce30c has 2 parents, and a replayed commit is published on one: a merge carries a history in
> its second parent that the remote would not receive, so the SHA it receives would not be the SHA
> that was written`

The local history contains a merge. A replayed merge is refused by design, correctly. So on this
repository a branch could not be created at all -- not expensively, *at all* -- and the defect was
not the cost the last two rounds had been writing about but the reach of the window.

The premise was wrong, and the sentence that carried it was wrong in a way that reads as an
argument: "a branch that does not exist has nothing to locate a base against". The branch does not,
but the repository does. A repository with refs has *tips*, and a tip is exactly what a comparison
wants; the listing added in this same round already carries one name per ref and the SHA that name
points at. The base is therefore chosen from what the remote has rather than from a branch it does
not:

- a tip whose SHA is in the local ancestry is a base with **no request at all** -- and its tree is
  the local commit's tree, so even reading the base costs nothing beyond the listing;
- a tip that is not (a renamed twin, which is every tip above this repository's boundary) costs
  one commit read, and is matched by tree;
- the **nearest** match wins, because the window is everything above it: an index of one is a
  single commit to replay and an index of forty is thirty-nine the remote already holds.

Only an empty listing still means the whole ancestry, which is what a first push is. And the
branch is still *created* rather than moved: `expected: null` on the ref update, unchanged.

The choice is also a bound rather than a rule, and the difference matters: a base further back
replays more commits and produces the same tip tree, which the executor asserts after the fact. So
the cost is what depends on the search, and correctness is not.

The mutation that says this is a claim and not a comment is `const base = null` -- the old
behaviour in one line -- and five cases go red on it, including the one that publishes a branch
above a merge and the one that expects the same push onto an empty remote to be refused.

## Finding 456 — the refusal that protected a branch that did not exist

Every push leaves the remote's tip carrying the tree of the local tip and not being that commit.
The channel refuses the next push in that state, and the reason is sound: replaying the tip would
put a second commit with the same message on top of a tree that is already there.

A branch being created is not that case. There is no second commit, because there is no first one
under that name -- the branch does not exist. The refusal fired anyway, on `located.index === 0`
with no regard for which of the two states asked, so a new branch could not be created at a tip the
remote already held under another name. The condition now names the branch as well as the index,
and the window for the creation is the tip itself: one commit, its parent the remote's name for the
twin, no blob at all because the tree is already there.

The measurement that makes it a claim rather than a comment is the mutation that removes the
`remote.head !== null` half: the case that creates `copy` at a twin goes red, and the case that
refuses to *move* a branch onto a twin stays green -- which is the pair that shows the condition is
about which ref is being written and not about content.

## Finding 457 — three entries, one list, and the count nobody recomputed

The `## Open` list is the plan. Every round reads its leftovers there, which makes it the one
document whose staleness compounds: an entry that says "open" about finished work sends the next
round to read code that has already been changed.

Three entries were in that state on the morning of v3.62. The listing that decides a `404` had been
made to walk pages (finding 451); `--new-branch` had been read as a statement and refused on a branch
that exists (finding 446); the creation path had been paid for by a real push -- thirty-five
requests, three commits, one `POST /git/refs`, and a branch whose tree is the one the gate had
blessed (finding 455). And a fourth reason, `[open: the creation path has no real push behind it]`,
was parked *inside* the entry that had been struck when a branch could not be created at all: the one
position where neither a reader nor the guard looks, because the guard treated a strikethrough as the
end of the entry.

The guard has been given a reader for its **form** four times now -- it refuses an entry that says
neither which it is, it refuses a reason too short to be one, it refuses two entries that share a
reason, it reads every list instead of the first. None of those can say that a living entry is still
true, and the docstring says so rather than looking like more than it is. What was missing is
narrower and cheaper: nothing made a round **contact** the file.

So the contact is arithmetic. The list now begins with `Checked at v3.62: **13** entries open`, and
`check-open-list.mjs` recomputes the number from the entries below the line, refuses a number that is
not that count, refuses a second stamp, and refuses a round older than the newest round in the
corpus. A round that writes itself up without opening this file is red. A round that opens it and
lies is not, and cannot be: counting is not reading.

The injection is the fixture set rather than the shipped file: a stamp one round old, a count off by
one, two stamps, no stamp, and a corpus with no round in it -- where the guard does not enforce the
rule and says which rule it did not enforce. The last one is the shape every older fixture in that
file has, so the rule had to be conditional, and a conditional rule that skips silently is the shape
this repository keeps finding in other people's gates.

## Finding 458 — the strikethrough that closed an entry it was quoted inside

The count found this one. The stamp says thirteen; the guard said eleven; the two entries in the
difference were entries whose **bodies** quote a closure -- a sub-item another round struck and
closed, followed by the entry's own `[open: ...]`. `CLOSED.test(item)` looked for a `~~` anywhere in
the entry, so both were judged history, and their own reasons were never read: not for length, not
for being a copy of another entry's.

An entry is closed when its **headline** is struck. The first line is the claim and the rest of the
bullet is what the claim is about, which is also how a reader reads it.

The same two entries gave up a second half once they were admitted as open. `item.match(OPEN)` takes
the first marker, and in a quoting entry the first marker belongs to the quoted sub-item: fifteen
characters of history were judged as the reason a reader is being asked to act on. The entry's own
reason comes last -- quote first, claim after -- so the rule is the last marker.

Both halves were found by counting rather than by reading, which is the point worth keeping: the
number the stamp forced was wrong by two, and the two it was wrong by were not entries anybody would
have picked to look at. The guards that count are worth more than the guards that describe, and this
file has spent four rounds learning that from the other direction.

## Finding 459 — a search with no stopping condition, and no number

A created branch hangs on a tip the remote already has (finding 455), and a tip can only be compared
to the local ancestry by its tree when the two sides renamed the commit. That comparison costs one
commit read per branch, and the walk read every one of them -- including when the answer was already
in hand.

The optimum is provable and was not used: a creation cannot replay **fewer than one commit**. Zero
would be a pointer push, and `holds(tip)` has already answered *no* -- that is what put the push on
this path. Index 0 (the remote's twin of this tip) and index 1 (its parent) both produce exactly one
rebuilt commit, so a base found at either distance cannot be improved on, and the reads below it buy
nothing.

Two shapes followed from that. The free pass over refs that *are* local commits could already hold
the optimum, and the walk then read every twin anyway: a repository whose own branch points at the
parent pays one request per twin to confirm an answer that cannot move. And when it did read, it said
nothing about how many, so the one number in this path that grows with the repository instead of with
the push lived only in a request log nobody has.

The walk now returns what it cost -- `candidates`, `reads`, `stopped` -- and the caller prints it.
Three cases hold the three shapes: a free optimum with two twins present must read **zero**; a parent
twin met first in ref order must read **one** and stop; a repository whose only refs are twins that
match nothing must read **all** of them and say that the whole history is replayed. The third is what
keeps the first two honest: an optimisation nobody can see is indistinguishable from a search that
stopped early and got lucky.

What it does not do is fix the cost. Requests are still linear in the number of twin tips in the worst
case; the difference is that the worst case is now a sentence with a number in it, and the common case
-- the remote's tip is the parent -- is one read instead of one per twin.

## Finding 460 — a budget on one test out of forty-three

The full-suite run that checked this round's changes reported `fetch-official.test.ts >
does not unpack an asset that is not an archive` at `Test timed out in 5000ms`, with the
file's other forty-two tests passing and nothing about that test changed. Nothing in the tree
was wrong with the test: it spawns the script, and on a machine running 239 files it waited
longer than five seconds for a process start.

The file is in `STANDALONE_MS` at 13 212 ms, so the rule that exists for exactly this shape
passed. It asks whether the file states **a** budget larger than the default, `largestBudget`
answers from a `120_000` on one of its tests, and the rule stops asking. Two of that file's
forty-three tests carry a budget of twenty; the rest inherit 5 000 ms.

The quantity that times out belongs to a test, not to a file. A file states its budget on
whichever call happens to carry one, so "the file has a budget" is an invariant that gets
**weaker with every test written** -- the opposite of what a budget is for. Seven of the nine
measured files were in that state; `publish.test.ts` and `reader-against-backend.test.ts`
were the two that could not fail this way, because every one of their top-level suites states
one.

The third arm of `timeout-budget.test.ts` therefore reads call sites rather than numbers: for
a file in the table above the default, **every top-level `describe` / `it` / `test` must carry
a `timeout`**. A suite budget covers the tests nobody has written yet, which is the property
that was missing; a per-test budget covers that test. The scan joins a head split across
lines, ignores a budget in a comment or a string, and looks only at column zero, because a
nested suite is covered by the budget above it.

The seven files now state `{ timeout: FILE_TIMEOUT_MS }` on each top-level suite, at
`30_000` -- the number `gate-sites-are-proven.test.ts` and `publish.test.ts` already use, so a
reader can check consistency rather than take an invention on trust. The measurement that
keeps the rule honest is the fixture that fails it: one budgeted suite, one budgeted test,
and one bare test, which the scan must report by line.

---

## Finding 461 — an entry's own reason said "closed", and the count that defends the list read it as work

v3.62 repaired this list in two halves and shipped them in one commit. The first was finding
458: a strikethrough looked for **anywhere** in an entry had counted two live entries as
history, because each of them quotes a sub-item a later round closed, and the rule became
*the headline decides*. The second was finding 457: a currency stamp at the top of the list,
naming the round that read it and the number of entries it found open.

The stamp was written as **13**. The section holds **11**.

### The measurement

Three guards, one fixture: the two entries as they were published, unedited.

| guard | rule | those two entries | verdict |
| --- | --- | --- | --- |
| v3.61 | a strikethrough anywhere in the entry closes it | `0 open, 2 closed` | **right by accident** — the same rule closed two *live* entries that quote a closure, which is finding 458 |
| v3.62 | the headline decides | `2 open, 0 closed` | **wrong by two** — each entry's own last sentence names the finding that closed it |
| v3.63 | the headline and the reason must agree | both refused, naming the sentence | the bullet is judged rather than guessed |

The fixture is the shipped text, so this is not a hypothetical. Both entries end like this:

```
  ~~`[open: the enumeration gate and the skip paragraph disagree about whether a contract
  skip is a gap, and deciding that needs a fixture whose target refuses a case]`~~
  — Closed by finding 343, which found that the runner could not produce a refusal at all
```

The strike is on the **reason**, and the headline above it was never struck. The v3.62 rule
reads the headline, finds no strike, and hands the bullet to the open branch, where the reason
is judged for its length and for being a copy of another one — and for nothing else. So a
bullet that says "closed" twice, in the two sentences a reader actually reads, was counted as
work.

### Why the count could not see it, which is the part worth keeping

The count is computed **from the guard's own verdicts**: `open` is incremented on the branch
that the guard takes. When the guard is wrong about an entry, the count is wrong about the
same entry, and the two agree. The stamp said 13, the guard said 13, and the number that was
added to catch a stale list could not catch a stale rule.

What saw it was the thing finding 457 said could not be mechanised: a reader. The entries say
in their own last sentence what closed them, and a reader who reaches that sentence has to
decide whether the bullet above it is work or history. This round's reader had counted 13 by
the guard's rule and been told the file held 11 by the file.

### The shape that was already in the log

The repair is not invented. Round v2.44, in `volume-05.md`, writes exactly this:

```
- ~~**M1's reading rests on 19 samples.**~~
  ~~`[open: the quantum is 5.3 points ... ]`~~
  **Closed by finding 216**, which grew the key to 30 samples and re-read every figure derived
  from it.
```

A struck headline, a struck reason, and the closure after them. The two entries this round
found used **half** of that shape, and half is what a rule keyed on one sentence cannot read.
The repair strikes the two headlines and keeps the struck reasons, because the reason is the
record of what was open and the strike is what makes it history.

### The guard

Two rules, one for each direction, because the failure is a disagreement and a disagreement
has two ends:

- a **closed** entry may not carry an unstruck reason — history in the headline and work in
  the body is the shape finding 458's sites were in;
- an **open** entry's reason may not be struck through — which is this finding.

The reason is read **once** per entry, from the last marker, and both branches use that one
reading, so the two rules cannot drift apart on which sentence is the entry's own. Four cases
hold them: the half-struck bullet is refused by name, the same bullet with its headline struck
passes, a closed entry with a live reason is refused, and a live entry that quotes a struck
reason inside itself is still open — that last one is finding 458's fixture, kept because the
new rule must not re-open the old defect.

Two substitutions make the battery prove the rules rather than the lines: `struckReason` made
to answer `false` puts both entries back on the count as work, and the closed branch's reason
check deleted lets a closed bullet ask a reader to do the work.

## Finding 462 — a split described as differing "by seconds", measured at four minutes

The live list carries this:

> **The sensitivity shards are cut by file count, not by cost.** Both hold the same number of
> claimant files and their wall clocks differ by seconds.

Every clause is true and the sentence cannot fail. "Differ by seconds" is true of a 1-second
difference and of a 240-second one, so no run can contradict it — and the number a reader
needs, the one the workflow's wall clock is set by, is exactly the number the phrase declines
to give. The list's own entry for it, one line below, says the split is *unbalanced by
duration*, which the phrase says cannot be so.

### The measurement

Run `466` on `ad266e2ba`, the two jobs, the step that does the work:

| reading | shard 1 | shard 2 | difference | slower shard |
| --- | --- | --- | --- | --- |
| v3.54's own reading, the round that split it | **248 s** | **387 s** | 139 s | shard 2 |
| run `466`, eight rounds later | **439 s** | **199 s** | 240 s | **shard 1** |

So the difference has never been small, and the shard that is slower has **changed**. Two
explanations a reader would try, and neither survives:

| candidate | what it predicts | measured |
| --- | --- | --- |
| equal file counts | equal cost | 25 files each — and the two differ by 240 s |
| equal claim counts | equal cost | 55 and 64 claims (16%) against 439 and 199 seconds (121%) |

The cost is per-file suite cost: a file with five claims in a fast suite is cheaper than a file
with three in a slow one, and neither count is a proxy for it. The battery knows the number --
it runs every file and could print it -- but the number is only valid on the machine that paid
it, and the split has to be checkable on a machine that did not.

### What the round could fix, and what it could not

The entry asks for a split by cost, and that needs three things this repository does not have:
a per-file recording made **where the cost is paid** (a runner), a place to publish it (an
artifact, then a golden), and a rule for when the golden is stale (the shard's own bound,
which would fire when a shard grew past its ceiling). Position is deterministic and the bound
is the backstop, so the split is not dangerous — it is expensive, by 240 seconds of every run,
which is what the entry was recording.

What this round could do is remove the unfalsifiable sentence. The entry now states the two
measurements, the direction, and the two candidates that fail, so the next round starts from
numbers a reader can argue with rather than from a phrase that cannot be wrong.

## Finding 463 — nineteen records left the guard's reach at v3.45, because the heading gained a comma

`check-open-list.mjs` reads two kinds of section: the index's live list and a round's record. It
found them by comparing the heading with an exact string, and finding 162 had already taught this
guard what that costs -- a second `### Open` section appeared, the guard read the first one, and the
count it printed did not move.

At v3.45 a round's record became a **table** for the first time:

```
### Left open, in the order the goal is reached
| priority | item | state | next step |
```

The comma is enough. `wanted.has(trimmed)` answered no, `sections()` skipped the heading, and every
record written that way since has had no reader.

### The measurement

```
$ grep -c '^### Left open,' docs/progress/volume-*.md
docs/progress/volume-10.md:2
docs/progress/volume-11.md:7
docs/progress/volume-12.md:10
```

**Nineteen** records -- nineteen rounds, v3.45 to v3.63 -- and the guard's summary said
`164 section(s)` before this finding and `183` after it. The nineteen keep 184 rows between them
and not one bullet entry, which is why nothing was *miscounted*: a table has no entries to count.
What was missing was two things, and the second is the one that matters:

- no sentence anywhere said that nineteen records were not judged;
- no rule refused a spelling the guard does not know, so the format could change again and the
  only evidence would be a number that did not move -- which is exactly the failure finding 162
  was raised for, arriving the second time through a different door.

### The repair

Three spellings, and one refusal:

| heading | how it is read |
| --- | --- |
| `## Open` | the live list, entries judged, currency stamp checked |
| `### Left open` | a record of entries, each judged as an entry |
| `### Left open, <suffix>` | a record in table form: the rows are counted, the shape is checked, and the summary says the rows were **not judged** |
| anything else beginning `## Open` or `### Left open` | refused, naming the two spellings that are read |

A table-form record that holds no table is refused, because counting zero rows would let an empty
record pass as a record. A table-form record that carries a bullet is refused, because the heading
tells this guard to read rows and the bullet would have no judge -- the two halves of the finding,
one at each end.

The summary line now states the number of table-form records and their rows beside the two entry
counts, so a round that adds a twentieth cannot do it without the number moving:

```
check-open-list: OK (577 entry(ies) across 183 section(s) ...: 533 open with a reason,
42 closed by a finding, and 19 record(s) in table form (185 row(s)) whose rows were not judged)
```

The limit is stated in the summary rather than left to the reader: the guard counts a row and
refuses an entry, and it does not judge a row's `state` column. Judging that column is what the
live list's bullet form is *for*, and a frozen record's rows are the round's own account of what it
left undone -- a number that says "these were not judged" is the honest form of not judging them.
