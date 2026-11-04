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
