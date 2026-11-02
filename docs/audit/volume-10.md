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
