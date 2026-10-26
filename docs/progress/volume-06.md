## v2.56 — a regression that clears the bar is now arithmetic

Two findings ended with the same unanswered question: *22/30 passed every gate and met the milestone,
so what would have caught it?* Nothing did — the gates check that the tree is consistent with itself,
and a worse prompt is perfectly consistent with itself.

The record makes it answerable. Every text measured on this key is in `readings.json`, so **"is the
current prompt the best one measured" is arithmetic**, and the test that checked only *exactly one
reading is current* now also checks the number:

```
a text on this key scored better: the current reading is 22/30 and the best other text
scored 24. Revert, or add an `acceptedRegression` entry naming this run, the delta and
the reason.
```

Mutation: marking 22/30 `current` and 24/30 `reverted` fails exactly there; restoring passes with an
empty diff.

**The escape hatch is a written argument, not a status.** `acceptedRegression` names the run, the delta
and a reason of at least eighty characters — and a second test asserts it **has never been used**.
Adding the field fails that test, which is the point: the diff shows a decision rather than a rule being
worked around, and deleting the test is the deliberate act of deciding a regression may be kept.
Mutation-checked in both directions.

**What it does not cover**, stated rather than implied: only texts that were measured (a never-dispatched
prompt is the digest gate's job), only readings on the same key, and only the strict rate — a prompt
could trade `type` for `component` at constant strict, and no rule reads the per-field rates this way yet.

**Acceptance.** 2 new tests in `m1-reading-is-reproducible.test.ts` (10 in the file); typecheck, lint,
`docs:check` green; two consecutive full runs at **4289 passed**; core **176 / 4289**, cli 4 / 187, repo
**179 / 4476**; coverage 99.97 / 99.74 / 100 / 99.97 and 100 ×4; audit 5 volumes, findings 1–227.

### Left open

- **The trade between fields is unguarded.** `[open: strict can stay flat while `type` falls and
  `component` rises. The per-field rates are already in every reading, so a rule is possible -- but
  which trade is acceptable is a judgement the record cannot make, and a rule that forbade all of them
  would forbid a genuinely better prompt that happened to shuffle two samples]`
- **A dispatched run that is never recorded is invisible.** `[open: the digest gate catches an
  unmeasured prompt and this rule catches a measured worse one; a run that happened and was not written
  into the record is caught by neither. Closing it needs the record to be built from the workflow's own
  history rather than by hand]`

## v2.57 — the record could still lie by omission; now a tool says so

Two gates now cover two of the three ways a prompt change goes unmeasured: an edited prompt with no
reading (v2.55's digest) and a reading worse than a previous one (v2.56's arithmetic). The third was
left open in both — **a run that happened and was never written down is caught by neither** — and it is
not hypothetical: run `39950191377` produced 24/30 and sat unread for twenty hours while four rounds
were written on top of "blocked" (v2.51).

`scripts/reconcile-readings.mjs` closes it as far as a tool can. Given the workflow's run list — fetched
with a token, or saved — it names every successful run whose id is not in the record. A run is
accounted for if its id is a reading **or** an `absent` entry, the route used for the run whose artefact
was lost. Run today against the real history:

```
reconcile-readings: OK (7 successful run(s) since id 39806875985, every one of them accounted for
in 7 recorded id(s))
```

That is the first time the record has been checked against the thing it claims to describe.

**Three decisions, each with a reason:**

| decision | why |
| --- | --- |
| scope begins at the smallest recorded id | run ids increase with time, so "the record starts here" is a fact about ids rather than a date to maintain; without it the tool reports every success since September and gets switched off |
| only successful runs are asked for | a `402` has no numbers; demanding an entry for every failure would cry wolf exactly when the record matters least |
| a payload without `workflow_runs` is an error | "I could not read it" and "there is nothing there" are different findings |

**Both exits are gate sites and both are proved.** The script exits `2` on an unreadable input or a
missing token and `3` on an unaccounted run; the inventory required a site for each, they are annotated
`proved` against `readings-reconcile.test.ts`, and the meta-gate confirms by hollowing:
`CAUGHT reconcile-readings.mjs — 10 test(s) red in 1 of 1 naming file(s)` (44 gates, 0 survived). Adding
the script also required a `DRIVES` declaration in that test file, because `gate-sites-are-proven`
cross-checks the sites a script owns against the tests that spawn it — **it caught this round's omission
before CI did.**

**What it still cannot do:** run in CI without a token. It is a tool, not a gate, and nothing forces
anybody to run it. Stated rather than papered over.

**Acceptance.** 6 tests over a saved payload (unrecorded, failed, out-of-scope, malformed each
distinct); three consecutive full runs at **4295 passed**; typecheck, lint, `docs:check`,
`derive-gate-sites --check` green; core **177 / 4295**, cli 4 / 187, repo **180 / 4482**; coverage
99.97 / 99.74 / 100 / 99.97 and 100 ×4; audit 5 volumes, findings 1–228.

### Left open

- **A tool nobody runs is a habit with a filename.** `[open: the reconciler needs a token and a network,
  so it cannot be a gate. Running it before every push, or in a scheduled workflow that opens an issue
  when it finds an unrecorded run, are both possible -- neither is built]`
- **The record's own arithmetic is still hand-made.** `[open: each reading's samples are transcribed
  from an artefact by hand. `derive-fault-golden.mjs` writes the artefact; a small `--reading` mode that
  writes the record entry too would remove the transcription step, which is where a wrong number would
  come from]`

## v2.58 — the record is derived from the artefact, and one absence turned out to be false

v2.57 closed with the transcription left open:

> **The record's own arithmetic is still hand-made.** `[open: each reading's samples are transcribed
> from an artefact by hand … a small `--reading` mode that writes the record entry too would remove
> the transcription step, which is where a wrong number would come from]`

Before writing that tool, the six transcripts were checked against the six artefacts, because a
transcription tool tested against a transcription measures nothing: if the record is wrong and the
tool agrees with it, the tool is a second copy of the error.

**All six agreed, field for field.** And the seventh — the run that had been sitting in `absent` for
five rounds with the reason *"its artefact was not retained"* — had its artefact on the server the
whole time. GitHub keeps a workflow artefact for ninety days; that run was three weeks old. Downloaded
and derived, it produces `type 4, category 11, component 14, strict 2`, which is exactly the figure
the record had been quoting from memory since v2.20.

So `absent` is empty, that run is now the first entry in `readings.json`, and the assertion that used
to read `absent.length > 0` reads `toEqual([])` — an equality on the whole list, so re-adding an entry
is a test failure rather than an edit.

**The tool.** `scripts/record-reading.mjs` writes an entry from an artefact, or checks an existing one
against the artefact it names. `--check` is the half that can be run against history, and it is what
produced the table above. The arithmetic lives in `packages/core/src/fault/reading-record.ts`:

| what | who supplies it |
| --- | --- |
| `key.digest`, `totals`, the rows | derived — the last is in the key's order, not the run's |
| `promptDigest` | the caller — the digest of the text that *was* measured |
| `promptChange`, `status` | the caller — prose, and a claim about the tree |

Entries are placed by run id rather than appended, because the record's contract is run order and
this tool's first real use was backfilling a run older than every entry in the file. Three refusals
are deliberate: a run already recorded, a run named in `absent` (a run cannot be both), and a run that
is not wholly graded.

**That last one is a constraint the record's shape cannot express, written down for the first time.** A
reading counts hits; every reader divides by `samples.length`. The scorer divides `strict` by the
**graded** count. One unparseable response makes those two numbers disagree — `24/29` against
`24/30` — and every reading so far has been wholly graded, which is why it has never shown. A run with
unusable samples is a pipeline finding and belongs in `pending`, not in a reading that would contradict
the report it preserves.

**Three defects of this round, each caught by a measurement rather than by reading.** Five test
invocations omitted `--check` and measured the derive path instead — the exit-code assertion caught
it. `derive-gate-sites.mjs` attributed the refusal exit to the `absent` guard nine lines away, because
a top-level `try`/`catch` gives it no condition — fixed by returning `{ ok }` and testing that, so the
published condition is `!derived.ok`. And the module shipped at **97.53 / 88.70** with lines 120–124
unexecuted; four cases closed it to **100 ×4**, which a 99.9 threshold would have hidden.

**Acceptance.** 30 tests over the derivation, 20 over the command; typecheck, lint green;
`derive-gate-sites --check` green (78 sites, 45 scripts); the meta-gate at **45 gates, 45 caught, 0
survived** -- hollowing `record-reading.mjs` turns 38 tests red in 1 of 3 naming files; three
consecutive full runs at **4348 passed**; core **178 / 4348**, cli 4 / 187, repo **182 / 4535**;
coverage 99.97 / 99.74 / 100 / 99.97 and 100 ×4; audit 5 volumes, findings 1–229.

### Left open

- **`audit/volume-03.md` is 107 bytes from its limit, and it is not the newest volume.** `[open: the
  guard prints `largest 279,893 of 280,000`, and this round first attributed that number to
  volume-05 -- the volume being written -- and wrote the claim down before checking it. The largest
  is volume-03, at 279,893; volume-05 is 153,926 and has room for four more findings. So the split
  is needed and the object is the third volume: an index plus a sixth volume, with the budget rule
  that produced the number deciding the boundary rather than whoever writes the next one]`
- **The tracker's volumes are at half their budget.** `[open: 102,903 / 92,355 / 127,029 / 121,054 /
  121,095 of 200,000 bytes, index 74,381 of the smallest volume. Nothing here is near a limit, which
  is why the audit's split is the one to do first -- and why the tracker's is a formatting decision
  rather than a forced one]`
- **Nothing forces the new tool to be run.** `[open: `record-reading.mjs` needs a token and a network,
  so like the reconciler it is a tool and not a gate. A scheduled workflow that opens an issue when an
  artefact is about to expire would close the ninety-day half of it -- the download could happen
  before the evidence goes]`

## v2.59 — M1's four-layer condition stops being met by definition

M1 has an exit condition that reads "GT four-layer annotation (entity / fault / process / evidence)
can all be filled". Nothing could answer it: `causalChain` and `evidenceCheckpoints` are optional
in `groundTruthSchema`, `rootCauseEntityId` is a non-empty string that no code resolves, and
`findDanglingEdgeRefs` walks the graph's edges rather than the ground truth. Every case in this
repository carried a type and a component, declared three of four layers empty, and parsed
cleanly. A condition no code can fail is a condition met by definition.

**The definition first.** `fault/four-layer.ts` says what filling each layer means, and each
verdict is about resolution rather than presence: the root cause must name a node, both ends of
every causal step must, and every checkpoint's `entityRef` must. `category: 'unknown'` counts as
empty, because it is the taxonomy declining to answer rather than an answer. A step citing a
checkpoint the case does not carry is reported separately from an unresolved entity -- one is a
graph missing a node, the other is a step citing evidence the case never states, and they are
different repairs. `complete` requires both lists to be empty, so four full layers can still be
incomplete.

**The corpus got its first case.** `golden-master/fault-cases/` holds one `FaultCase` annotated
from `resource-cpu-saturation-checkout`, with a four-node graph beside it: the container whose
usage sat at 500m, the pod that was throttled, the service whose p99 went from 180ms to 4.3s, and
the downstream payment service the text names but which carries no checkpoint -- "error rate did
not change" is an absence, not a value, and `== 0%` would have invented a measurement.

**The guard prints the number instead of gating it.**

```
check-fault-cases: OK (1 of 30 sample(s) carry a four-layer case; each is complete and every
reference resolves; floor 1)
```

Requiring thirty would make it red for thirty rounds and teach everyone to ignore it; requiring
nothing would let it reach zero in silence. So `min` is written in the index and moves up as
annotation proceeds, the same shape `M1_STRICT_THRESHOLD` has.

**One defect of this round.** The guard joined both `docs:check` and `docs:check:cold`, and the
cold-tree test refused it: `cold-tree-job.test.ts` holds the measured set of guards that run
without a build, and this one imports `dist`. Removed from the cold aggregate -- the cold job
would have run it before a build existed, which is precisely the failure that file exists to
prevent.

**What was discarded.** Before annotating, a rule-based probe was tried against the thirty texts
to see whether the remaining cases could be generated. It called `copy-paste` and `long-running`
entities, and missed `400Mi` because Kubernetes spells mebibytes `Mi`. Two numbers came out of it
and neither is published: a rule that has to be corrected by reading its own output thirty times
is a first draft of an annotation, not a measurement.

**A latent race stopped being invisible.** The second full run of the round failed one test in
`reader-against-backend`: the gate reported `answered 200 with something that is not JSON ("not json
at all")` about a stand-in that had never bound its port. That string belongs to `jaeger.test.ts`'s
stub. `freePort()` binds, releases and hands the number to a `spawn`, and nothing reserves it across
that window — so the port was a guess, and a `200` was treated as proof of who answered. The repair
reads the `/-/ready` body and requires the word both a Prometheus and the stand-in say, then takes
another port if it is missing: three attempts, each stopping what it started before the next, because
a retry that leaks a server per attempt is the failure the stop path exists to prevent. The file
alone passed three times before and after; the difference is that the race now recovers instead of
misreporting.

**Acceptance.** 14 tests over the definition, 17 over the guard, every exit driven; three
mutations each turn exactly one test red and the source is restored byte-for-byte; 8 new gate
sites annotated `proved`; the meta-gate at **46 gates, 46 caught, 0 survived** (hollowing the new
guard turns 34 tests red in 1 of 2 naming files); `four-layer.ts` **100 ×4**; core **180 / 4382**, cli 4 / 187, repo
**184 / 4569**; coverage 99.97 / 99.74 / 100 / 99.97 and 100 ×4; audit 5 volumes, findings 1–230.

### Left open

- **Twenty-nine of thirty samples carry no four-layer case.** `[open: the guard reports 1 of 30 and
  the floor is 1. Each remaining annotation is a person reading one text and writing four layers
  from it; the work is bounded and the guard will hold whatever number is reached, but no round so
  far has annotated more than one, and the reason is that each annotation is a judgement nobody has
  made a rule for -- which is the finding, not an excuse]`
- **A rule for the remaining annotations was tried and produced noise.** `[open: a slug extractor
  called `copy-paste` an entity and a unit extractor missed `400Mi`. The next attempt should start
  from the annotation of one case and ask what a reviewer would need to check it, rather than from
  what a regex can find in thirty texts]`
- **`docs:check` now contains a guard that needs `dist`, and `docs:check:cold` does not.** `[open:
  the split is measured by `cold-tree-job.test.ts`, so a guard added to the wrong aggregate fails
  a test -- but the two chains duplicate thirteen names each, and the next guard is added to both
  by whoever adds it until that test says no. A derived split is the obvious repair and has not
  been built]`

## v2.60 — three cases, and a quote the machine can check

v2.59 left `1 of 30` on the guard's line and the sentence that one case is a proof, not a corpus.
This round added two, moved the floor to 3, and made the annotation checkable at the only point
where a machine can check it.

**Two shapes a single case could not test.** `history-cart-network-delay` has a one-step chain
*across* a boundary and evidence that is a **comparison** -- 900ms on the caller, 11ms on the
callee, and neither number means anything alone. `history-kafka-consumer-lag` has a one-step chain
*towards a shared resource* and evidence that is a **direction** -- the lag is observable on the
topic, and the text's own last clause ("not broker capacity") is what rules out pointing the chain
at the broker. Both are cases an annotation could get plausible and wrong; the first would be a
valid case that recorded either number alone.

**The quote is the one part of an annotation that can be checked.** `why` is prose and cannot be
verified. A quote is a substring of the incident text: either it is there or it is not. So
`index.json` went to schema `/2` and every layer must now carry a quote, which must appear in the
named sample's `incidentText` with whitespace folded, must say what it supports, and must cover
all four layers. One changed word fails:

```
'history-checkout-cpu-saturation' cites a entity quote the incident text does not contain:
'the pod sat pinned at its 400m limit'
```

The defect it is for is the one an annotator actually makes: working from memory, paraphrasing
the source, and leaving the case resting on a sentence nobody wrote.

**The guard caught the code that guards.** The first version used
`problems.push(...sourceProblems(...))` and `no-size-dependent-array-is-spread` refused it: the
list is one entry per source, so `push(...)` is bounded by the argument limit rather than by
anything the code decides. Four sources today; the rule is for the four hundred that would not
fail. Replaced with a loop, with the reason in the code.

**Declared, not extracted.** Two of the three texts give a clock time without a date, a relative
duration, or no time at all, so `system` and `injectTime` are declared by the corpus -- and each
entry's `why` says so in its own words rather than leaving a reader to assume the text supplied
them.

**What it still does not do**: three of thirty, and a quote proves the sentence exists rather than
that it supports the layer. The guard can hold an annotation to its source; it cannot hold it to
being right.

**Acceptance.** 15 tests over the definition (one new: the three cases read complete against one
shared graph), 24 over the guard (seven new: six refusals and one acceptance); typecheck, lint,
`docs:check` green; `derive-gate-sites --check` green (86 sites, 46 scripts); `four-layer.ts`
**100 ×4**; core **180 / 4390**, cli 4 / 187, repo **184 / 4577**; coverage 99.97 / 99.74 / 100 /
99.97 and 100 ×4; audit 5 volumes, findings 1–232.

### Left open

- **Twenty-seven samples still carry no four-layer case.** `[open: three shapes are covered and each
  is held to its text. The remaining work is the same judgement repeated, and the machinery now
  makes each repetition cheaper to review -- but nothing about three makes the twenty-seventh
  likely, and a round that claims otherwise would be reporting a trend from three points]`
- **A quote is existence, not support.** `[open: the guard checks that the sentence is in the text,
  not that it justifies the layer. A second reader is the only check for the second property, and
  no process here involves one -- the `why` beside each quote is written by the same hand that
  chose it]`
- **`system` and `injectTime` are declared by the corpus for every case.** `[open: the texts carry no
  date and no system name. A corpus that recorded them per sample would make the declaration
  reviewable one at a time instead of sentence by sentence inside a `why`]`

## v2.61 — the annotated cases had never been asked whether they are cases

`assessFourLayer` answers "are the four layers filled and do their references resolve". It does not
answer "is this a well-formed `FaultCase`", and nothing else did either, so three cases passed every
check in the tree while carrying values the repository's own gates reject.

**G1, the first time it was asked**: all three cases, every timestamp --
`injectTime must be canonical UTC ISO-8601, got 2026-09-14T02:03:00Z`. `ISO_UTC` in `gates.ts`
requires **milliseconds**; the annotation had been written the way a person writes a time, and
validated against `z.string().min(1)`, which is the weaker of the two checks the same value passes
through.

**G2, the next time**: three checkpoints in two cases carried units that are not in the conversion
table -- `m` for millicores, `messages` for a lag, `x` for a multiple. `m` is the worst of them
because in UCUM it is *metres*: a table that accepted it would have converted a CPU quota into a
length. The repair is a translation, not a relaxation: `>= 0.5 1` (a ratio of one core),
`> 4200000 count`, `== 3 1` (a ratio), with each description now saying the same thing in words.

**Why the structural half is askable at all**: `checkG1Structural` needs no telemetry when
`requiredSignals` is empty, so an annotated case can carry the L2 obligation without carrying
signals it does not have. G3/G4/G5 do need telemetry and outcomes and are not asked -- **a case
that is annotated is not a case that is scoreable**, and conflating the two is how a corpus of
annotations would come to be quoted as a corpus of measurements.

```
check-fault-cases: OK (3 of 30 sample(s) carry a four-layer case; each is complete, every
reference resolves, every layer quotes a sentence the incident text contains, and every case
passes the L2 contract -- structure, references and units; floor 3)
```

**What this says about v2.59 and v2.60**: both claimed their cases were complete, and both were
right about the four layers. Neither claim covered what G1 and G2 check, and neither round had a
reason to think it did -- the check that was run answered a narrower question than the sentence it
was quoted as supporting.

**Acceptance.** 28 tests over the guard (four new: two for the structural half, two for the
reference half); typecheck, lint, `docs:check` green; `derive-gate-sites --check` green (86 sites,
46 scripts); `four-layer.ts` **100 ×4**; core **180 / 4394**, cli 4 / 187, repo **184 / 4581**;
coverage 99.97 / 99.74 / 100 / 99.97 and 100 ×4; audit 5 volumes, findings 1–233.

### Left open

- **A case that is annotated is not a case that is scoreable.** `[open: G1's structural half and G2
  are now asked of every case; G3 (the signal carries an anomaly), G4 (the case is solvable) and G5
  (anti-pollution) all need telemetry these cases do not have. The gap between the two is the
  distance from a corpus of annotations to a corpus of measurements, and nothing measures it yet]`
- **The twenty-seven unannotated samples would fail the same two gates.** `[open: they carry no
  `FaultCase` at all, so the question does not arise until one is written. Every new annotation now
  inherits both obligations from the guard, which is the reason to write the next one with the
  timestamp and unit rules in view rather than after]`

## v2.62 — a case cannot carry telemetry until its window starts before its onset

v2.61 closed by naming the boundary: G3/G4/G5 need telemetry the annotated cases do not have. This
round crossed part of it, and the first thing it found was that the corpus **could not** cross it
as written.

**All three cases had `window.start === injectTime`.** G3 reads a baseline from samples before the
onset and the post-onset samples from the onset onwards; G2 requires every signal to sit inside the
window. With `start === onset` no sample is both, so the two rules cannot hold at once and no
amount of telemetry would have made these cases valid. Each window now starts before its onset --
fifteen minutes for the two short ones, an hour for the six-hour one.

**Telemetry derived from the checkpoints, with both ends quoted.** Two series for the checkout
case: `request_duration_p99_ms` 180ms -> 4300ms (the quote `180ms to 4.3s`) and
`container_cpu_throttled_seconds_total` 12s -> 96s (the quote `throttling counters climbed`). The
guard expands each into sixteen metric signals -- eight from `window.start`, eight from
`injectTime`, ninety seconds apart, fixed jitter so two runs produce the same bytes -- and runs
G1 (`requiredSignals: ['metric']`), G2 and G3 over the result. The counter accumulates rather than
jumping, because a counter that jumps is a level wearing a counter's name.

**G3 can refuse it.** Flattening **both** series fails with
`no metric sustains |Z| >= 2 for 3 samples after injection`. Flattening only the p99 passes -- that
is G3's `anyStrong` semantics, and the first version of the test was green for the wrong reason
until it was made to flatten both.

```
check-fault-cases: OK (3 of 30 sample(s) carry a four-layer case; ...; every case passes G1, G2
and G5 -- structure, references, units, and no leaked identifiers; 1 of 3 also carry derived
telemetry that passes G3; floor 3)
```

**G5 was askable all along.** Its four checks -- duplicate by fingerprint, public-benchmark
contamination, an identifier in the payload, and `answerKeyIsolated` -- need no telemetry, so they
apply to an annotation as much as to a scored case. `answerKeyIsolated: true` was a claim each case
made about itself and nothing had read it. G5 is now asked of every case; **G4 is the only gate left
that genuinely needs something the corpus does not have.**

**Still `derived`, and still not scoreable.** G4 needs a baseline solver; the distance from
"annotated" to "scoreable" is smaller and still real, and the word `derived` in the report is what
keeps the difference legible.

**Acceptance.** 34 tests over the guard (six new: acceptance, no-anomaly, bad quote, wrong case,
empty series, answer key not isolated); typecheck, lint, `docs:check` green; `derive-gate-sites --check` green (86 sites, 46
scripts); the meta-gate at **46 gates, 46 caught, 0 survived** (hollowing the guard turns 66 tests red); coverage 99.97 / 99.74 / 100 / 99.97 and 100 ×4; core **180 / 4400**, cli 4 / 187, repo
**184 / 4587**; audit 5 volumes, findings 1–234.

### Left open

- **Two of the three cases still carry no telemetry.** `[open: the second and third declare none, so
  the guard reports 1 of 3. Each needs the same two numbers from its text -- the before and the
  after -- and the network case's pair (12ms and 900ms) is already quoted in its own sources]`
- **G4 has never been asked of an annotated case.** `[open: G4 needs a baseline solver's outcome for
  the case, which is a real localiser run rather than a derivation. G5 was the same shape and turned
  out to need nothing the corpus lacks, so it is now asked -- the remaining gate is the one that
  needs a solver, and that is a decision about which localiser rather than about the corpus]`
- **The derived series is a construction, and the report says so in one word.** `[open: `provenance:
  applied` versus `captured` is a string in the signals file, not a schema-level distinction, so a
  future case could claim either. A closed vocabulary would make the claim checkable]`

## v2.63 — every case carries telemetry now, and one of them carries a control

`1 of 3` became `3 of 3`. Two more signal declarations, and the shapes they add matter more than
the count.

**The cart case carries a series that does not move.** `client_span_duration_ms` runs 12 -> 900 and
`server_handler_time_ms` runs **11 -> 11**. G3 needs one sustained anomaly and the caller has it;
the callee's series deliberately carries none, because that is the annotation's whole reason for
calling this a *network* fault -- the added time is between the two processes. A corpus whose every
series rises can only say "this number moved", and cannot express its own controls.

**The kafka case makes the same point in another dimension.** Its checkpoint states a ratio
(`== 3 1`), and a ratio has nothing to be a ratio of until the underlying duration is present, so
`per_message_processing_seconds` carries 0.02s before and 0.06s after. The lag itself is a counter
(0 -> 4.2e6), because a lag accumulates rather than stepping.

**Provenance became a closed vocabulary.** `derived | captured`; anything else is refused with
`declares provenance 'measured', which is neither 'derived' nor 'captured'`. `captured` is admitted
and nothing uses it -- a vocabulary with one member would make the word *derived* unfalsifiable,
and the report says "derived" on the strength of this field.

**Still not scoreable.** G4 needs a baseline localiser's outcome, which is a real run rather than a
derivation, and no such run exists for these cases.

**Acceptance.** 36 tests over the guard (two new: an unknown provenance, and `captured`); typecheck,
lint, `docs:check` green; `derive-gate-sites --check` green (86 sites, 46 scripts); coverage
99.97 / 99.74 / 100 / 99.97 and 100 ×4; core **180 / 4402**, cli 4 / 187, repo **184 / 4589**;
audit 5 volumes, findings 1–235.

### Left open

- **G4 has never been asked.** `[open: it needs a baseline localiser's rank for each case, which is a
  real run rather than a derivation. The corpus can now carry everything a solver reads except the
  solver's answer, and that is the last gate between an annotated case and a scoreable one]`
- **Every series is derived, and no case is captured.** `[open: the vocabulary admits both and only
  one is used. A captured case would need a deployment and a collection path; until then the word
  "derived" in the report is the only thing distinguishing a construction from a measurement]`
- **Twenty-seven extraction samples are still unannotated.** `[open: 3 of 30. Each new case now
  inherits six obligations -- four layers, a quote per layer, G1, G2, G5, and optionally derived
  telemetry -- and the guard holds every one of them, which is what makes the next annotation
  reviewable rather than merely written]`

## v2.64 — G4 was the last gate that needed a run

Every round since v2.61 ended with the same sentence: G4 has never been asked, because it reads
`BaselineOutcome`s and no run produced any. This round wrote the run.

**`fault/baseline-localiser.ts`** ranks services by the largest absolute z-score any of their
metrics reaches after the onset, against that metric's own baseline; peak per service, descending,
ties broken by service name. Two properties are what make it a measurement rather than a
certificate, and both are asserted: it **never reads `groundTruth`** (a test empties the answer key
and checks the ranking is unchanged), and **"not in the ranking" is `null`, not last** (a solver
that produced no candidate by that name did not place it badly -- it did not place it).

**What a rank of 1 does not mean.** The signals are derived from the annotations, so peak-z finding
the annotated service is close to tautological. What the run establishes is narrower: the case
carries a locatable structure, and G4's first condition is met by a run rather than assumed.

```
check-fault-cases: OK (3 of 30 ...; every case passes G1, G2 and G5 ...; 3 of 3 also carry
telemetry whose provenance is declared, which passes G3, and which the peak-z baseline locates
in its top-K; floor 3)
```

**All five gates have now been asked** of every annotated case. What remains between "annotated"
and "scoreable" is no longer a gate.

**Two defects of this round.** The comparator's first version was
`right.peakZ - left.peakZ || (left.service < right.service ? -1 : 1)` and the coverage table
reported **96.15% branches** with that line named -- a hand-written three-way comparator has two
branches and one is easy to leave unexecuted, so it became `localeCompare`. And a test paired the
checkout case with the *cart* declaration, refused by the guard's own `names signals for` check,
which is the mechanism working.

**Acceptance.** 12 tests over the localiser, 38 over the guard; typecheck, lint, `docs:check`
green; `derive-gate-sites --check` green (86 sites, 46 scripts); the meta-gate at **46 gates, 46
caught, 0 survived** (hollowing the guard turns 72 tests red); localiser **100 ×4**; core
**181 / 4419**, cli 4 / 187, repo **185 / 4606**; coverage 99.97 / 99.74 / 100 / 99.97 and 100 ×4;
audit 5 volumes, findings 1–236.

### Left open

- **The baseline is peak-z, and it was chosen because it is dull.** `[open: G4 needs one solver that
  locates the root cause, and this one does -- on data derived from the same annotation. A second
  baseline with a different inductive bias would test whether the case is locatable rather than
  whether one method agrees with the construction]`
- **Every signal is still derived, and no case is captured.** `[open: the vocabulary admits `captured`
  and nothing uses it. The gap that remains is not a gate but an origin]`
- **Twenty-seven extraction samples carry no case.** `[open: 3 of 30, and each annotation now has to
  satisfy six obligations the guard holds: four layers with quotes, G1, G2, G5, and optionally
  telemetry that passes G3 with a baseline that locates it]`

## v2.65 — a second baseline, because one baseline only asks whether a method agrees with itself

v2.64 ended with the open item that made this round necessary: G4 has one solver, and that solver is
peak-z on series constructed to contain one excursion each -- so a rank of 1 was close to
tautological. G4's rule says "at least one baseline places the truth in its top-K", and with one
baseline that is a statement about that method.

**The second baseline fails differently, or it is the same method twice.** `fault/robust-localiser.ts`
scores `|median(after) - median(before)| / max(1.4826 * MAD(before), epsilon)` and ranks services by
the largest such shift. The pair is:

| | peak-z | median-shift |
| --- | --- | --- |
| a lone spike | dominates | invisible |
| a contaminated baseline | inflates `sigma` until a real change scores 1.2 | discarded by the deviation |
| a sustained change | seen | seen |

Both disagreement shapes are asserted with hand-built series: peak-z ranks the spike first and the
median ranks it last; peak-z misses a tripling behind one wild baseline point and the median finds it.
The `1.4826 * MAD` constant keeps the two on one scale, and the `epsilon` floor is the same one
`zScore` uses -- the pair is meant to disagree about robustness and about nothing else.

**G4 now requires both** (`minSolvers: 2`), and the message names both ranks:

```
'history-checkout-cpu-saturation' is not solvable by both baselines
(peak-z-by-service=1, median-shift-by-service=4): only 1 baseline(s) locate the root cause within top-K
```

That is from a control, not from the corpus: a declaration whose root cause carries a spike and whose
three decoys carry steps. Peak-z ranks the truth first, the median fourth of four, and the case is
refused. **The cost is stated rather than discovered later** -- a case whose only evidence is a brief
excursion does not pass, because one method finding it says more about the method than about the case.

**Writing the control exposed a silent fallback.** The expansion read `derivation === 'counter'` and
treated everything else as `step`, so a typo would have produced a level series from a file that reads
as a counter. The vocabulary is now closed (`step | counter | spike`) and an unknown value is refused;
`spike` was added because the control needed a shape the format could not express.

**The second baseline also exposed a naming collision.** `check-data-model-vocabularies` printed the
published sets beside this round's work, and the signals declaration's two-member `provenance` sat
next to the IR's four-member `PROVENANCE_SOURCES` (`direct | derived | inferred | defaulted`): one
word, two vocabularies, one member in common meaning different things. The field is now
`origin: derived | captured`, and the old key is **refused** rather than ignored -- a declaration
still saying `provenance` would otherwise be read as having no origin, and the message would point at
a value when the key is what has to move.

**Two defects.** Every series in the new test file had an even length, so the odd-count arm of
`medianOf` was never executed -- the coverage table said **96.55% branches** with the line named, and
a five-point baseline whose mean is 108.4 and median is 11 closed it. And the corpus test expanded
every declaration against the cart case's window, so the checkout case's signals all fell before its
own onset and the assertion failed with `null` -- a failure that reads as "no rank" rather than
"wrong rank", which is the kind that gets misdiagnosed.

**Acceptance.** 18 tests over the second baseline, 42 over the guard; typecheck, lint, `docs:check`
green; `derive-gate-sites --check` green (86 sites, 46 scripts); the meta-gate at **46 gates, 46
caught, 0 survived** (hollowing the guard turns 78 tests red); both localiser modules **100 ×4**;
core **182 / 4446**, cli 4 / 187, repo **186 / 4633**; coverage 99.97 / 99.75 / 100 / 99.97; audit 5
volumes, findings 1–237.

### Left open

- **Both baselines are locating a construction.** `[open: two methods agreeing raises the claim from
  "one bias likes it" to "two biases find it", not to "a real RCA system would". The only thing
  separating the two is `provenance: derived`, and no case has ever been captured]`
- **Both aggregate per service with `max`.** `[open: deliberate, so the comparison is about the
  statistic rather than about how metrics combine -- which also means it is a shared assumption the
  pair does not test. A `sum`-aggregating third baseline would test it, and would need its own
  justification rather than its own number]`
- **`origin` has one member in use.** `[open: two values, `derived` and `captured`, and every
  declaration is `derived`. Admitting the second is what keeps the first falsifiable, and no
  collection path exists yet to produce one]`
- **A spike-shaped case is now unrepresentable in the corpus.** `[open: the shape exists in the
  format and no case uses it, because `minSolvers: 2` refuses a case whose only evidence is a spike.
  If a real incident is a brief excursion, the annotation has to carry a second series a robust
  statistic can see -- which is a rule about cases that has not been written down]`

## v2.66 — the corpus had never been exported, and three modules disagree about whether it can be

M1 says "RCAEval RE1/RE2 export passes L2". It had a passing unit suite and a passing official round
trip, and **neither had been pointed at the annotated corpus**. The telemetry lives in declarations
that only the guard expands, so a bundle built the obvious way has `signals: {}` and every exporter
skips everything with `no telemetry signals attached`.

Wiring the expansion in gives three answers instead of one:

| suite | written | data-less files | coverage report, same bundle |
| --- | --- | --- | --- |
| RE1 | 3 | **0** | `rcaeval-re1 ready` |
| RE2 | 3 | **6** | `rcaeval-re2 degraded (no log)` |
| RE3 | 0 / 3 skipped | 0 | `rcaeval-re3 degraded (no log, trace)` |

The exporter and the coverage report answer different questions -- "what files can I write" versus
"can this dataset be evaluated" -- and a CSV with a header and no rows satisfies the first and not the
second. Nothing connected them.

**The repair was tried and the anchor refused it.** Making the exporter skip a case that cannot fill
every file its suite writes turned the official round trip red: `ROUNDTRIP SKIP 1/1 RE2-ob-cpu_1
target=rcaeval-re2 oracle=0.00 signals=80` -- the round trip's own RE2 case carries 80 metric signals
and no log, and was passing on exactly the behaviour the repair removes. Reverted byte-for-byte. A
shared contract the strongest anchor depends on is not rewritten on the strength of one corpus, so
the disagreement is recorded at the caller:

```
check-fault-cases: coverage rcaeval-re1 ready · rcaeval-re2 degraded (no log) · rcaeval-re3 degraded (no log, trace)
check-fault-cases: export RE1 3 case(s) written, 0 file(s) with no rows · RE2 3 case(s) written, 6 file(s) with no rows · RE3 0 case(s) written, 0 file(s) with no rows, 3 skipped
```

Both numbers are pinned by tests, so a change in either module that moves one is a deliberate edit.

**For M1 this means**: RE1 met, with no data-less files. RE2 **not** met, and the blocker is the
corpus's modality rather than the exporter -- the annotated cases carry metrics only, and a log cannot
be derived from a sentence that never states one. RE3 does not apply: code-level faults only, and the
corpus's categories are `resource`, `network`, `middleware`.

**One defect.** The data-less counter counted lines, so `metrics.json` (one line of JSON) and
`inject_time.txt` (one line by design) were both called empty and RE1 reported three empty files while
writing real data. Emptiness is a property of content; the pinned numbers were wrong until it said so.

**Acceptance.** 44 tests over the guard (three new: both printed lines, and their absence when no case
carries telemetry); typecheck, lint, `docs:check` green; `derive-gate-sites --check` green (86 sites,
46 scripts); the meta-gate at **46 gates, 46 caught, 0 survived** (hollowing the guard turns 82 tests
red); core **182 / 4446**, cli 4 / 187, repo **186 / 4633**; audit 5 volumes, findings 1–238.

### Left open

- **RE2 is blocked by the corpus, not by the code.** `[open: three cases carry metrics only. A log line
  cannot be derived from prose that never quotes one, so the honest route is either a corpus case
  whose incident text states a log line, or an acceptance that this half of M1 waits for captured
  telemetry -- and the guard now prints which of the two it is on every run]`
- **The official round trip's RE2 case has never exercised the log path.** `[open: `RE2-ob-cpu_1`
  carries 80 metric signals and no log, so `logs.csv` is header-only there too. The anchor that
  proves the official path is not proving this part of it, and that gap was invisible until a repair
  tried to close the hole]`
- **`buildLogsCsv` cannot return "no file".** `[open: it always emits a header, so the only way a
  caller learns that a case has no logs is by counting rows itself -- which is what the guard now
  does. A null return would make the empty case unrepresentable, and it would change every caller]`

## v2.67 — the first log line, and RE2 stops being degraded

v2.66 ended with the number that named the hole: `RE2 3 case(s) written, 6 file(s) with no rows`,
because a declaration could only expand into metric samples. **A log is not a metric standing in for
one**: it has no baseline and no threshold, G3 never reads it, and its content is a sentence. So the
declaration gained `logs`, whose entries carry a `body` (a reconstruction) and a `quote` (verbatim
from the incident text) -- the same split as the four layers, and checked the same way, because a log
body this repository wrote for itself would be evidence of nothing.

**The fourth case** is `history-queue-watermark-ledger-writer`, from
`middleware-queue-watermark-ledger-writer`: two series (`broker_disk_watermark_percent` 78 → 92,
`producer_buffer_records` 200 → 40000) and one log line quoting the broker. The graph grew to eleven
entities and seven edges -- `ledger-writer` calls `ledger-events`, and a `node` called
`kafka-broker-3` **hosts** the topic, because the watermark is measured on the broker.

```
check-fault-cases: coverage rcaeval-re1 ready · rcaeval-re2 ready · rcaeval-re3 degraded (no trace)
check-fault-cases: export RE1 4 case(s) written, 0 file(s) with no rows · RE2 4 case(s) written, 7 file(s) with no rows · RE3 0 case(s) written, 0 file(s) with no rows, 4 skipped
```

**`rcaeval-re2` is ready for the first time.** The seven data-less files that remain are all
`traces.csv`: a trace needs span timings the texts do not state. `4 of 30` samples carry a four-layer
case and the floor is 4.

**Three defects.** G2 refused the broker -- `signal references service 'kafka-broker-3' which is not
in the entity graph` -- because I had assumed signal services were free-form, when `checkout-api-0`
resolves because it *is* an entity; the repair was to add the node and its `hosts` edge, not to rename
the series. The first log tests passed for the wrong reason: they fed the ledger declaration to the
checkout case, so the caseId mismatch was itself a refusal, and they would have kept passing if the
log checks were deleted -- rewritten against the checkout declaration. And `filled  11` versus
`filled 11`: the formatter pads the count to two characters, and the expectation was written by
substituting a digit into the old string. **A formatted line is not a string with a number in it.**

**Acceptance.** 49 tests over the guard (five new over the log rule); typecheck, lint, `docs:check`
green; `derive-gate-sites --check` green (86 sites, 46 scripts); the meta-gate at **46 gates, 46
caught, 0 survived** (hollowing the guard turns 90 tests red); four cases and eleven entities; core
**182 / 4451**, cli 4 / 187, repo **186 / 4638**; coverage 99.97 / 99.75 / 100 / 99.97; audit 5
volumes, findings 1–239.

### Left open

- **Every data-less file left is a trace.** `[open: a span has a start, a duration and a parent, and
  none of the thirty texts states one. The corpus can reach RE1 and RE2 honestly and cannot reach
  RE3, which needs traces -- and RE3 also targets code-level faults, of which the corpus has none,
  so two independent reasons keep it out]`
- **A log line has no baseline, so nothing checks its timing.** `[open: the three lines are placed at
  fixed offsets after the onset, and a declared offset that contradicted the text would pass. The
  quote holds the content; nothing holds the clock]`
- **26 samples still carry no case.** `[open: 4 of 30. The annotation now has to satisfy seven
  obligations -- four layers with quotes, G1, G2, G5, and optionally telemetry with an origin, a
  series that passes G3, a baseline that locates it, and a log body that quotes its text]`

## v2.68 — the last modality, and an id that was a name

v2.67 ended with one sentence: *the seven data-less files are all `traces.csv`*. This round closes
it, and a span turns out to be the one modality with a property the other two cannot express -- **a
parent**. A metric says how much, a log says what was said, a span says where the time went, but only
if the child sits inside the parent.

The cart case states both numbers the pair needs (`rose from 12ms to 900ms` on the caller, `stayed
at 11ms` in the callee), so the declaration gained `traces`: service, span name, duration, an
optional `parent` naming another entry, and the usual `quote`/`why`. Four refusals -- a quote not in
the text, a duration of zero (a span that did not happen), a `parent` naming nothing, and a span with
no statement of what it supports. The parent rule matters most: **a row whose parent id belongs to
nothing is worse than a missing row, because it looks complete.**

```
check-fault-cases: coverage rcaeval-re1 ready · rcaeval-re2 ready · rcaeval-re3 ready
check-fault-cases: export RE1 4 case(s) written, 0 file(s) with no rows · RE2 4 case(s) written, 6 file(s) with no rows · RE3 0 case(s) written, 0 file(s) with no rows, 4 skipped
```

**All three suites are ready for the first time.** RE2's data-less count went 7 → 6, and RE3 still
writes nothing because it targets code-level faults and the corpus has none -- two independent
reasons, both printed rather than inferred from a zero.

**The defect is the ids.** The first version built span ids from the case id's first twelve
characters after stripping hyphens. The corpus happens to differ before that cut, which is exactly
the problem: two cases that agreed up to the twelfth character would produce the same ids and one
case's trace would point into another's -- a defect that appears only as the corpus grows, in the
artefact that is hardest to check by eye. It is a digest now, with the reason in the code.

**What it does not fix.** Every span sits ten seconds after the onset, because the texts give
durations and no start times; and no test would catch a collision, only the structure a digest
protects.

**A flake, diagnosed rather than retried away.** The third full run failed thirteen assertions in
`check-doc-counts.test.ts`, all reading `the guard exited 0 without printing`. That guard has two
exits and prints at both, so a silent exit 0 is not its verdict -- and the assertion that said so had
been written one round earlier for the same shape. Two candidates: the write was lost (`console.*`
to a pipe is asynchronous and `process.exit` does not wait), or the child never ran. Both are
addressed and neither is assumed: the guard now writes through a `verdict(fd, text)` helper built on
`writeSync`, so a verdict cannot be truncated by its own exit; and the helper retries the silent
shape once, still failing if it repeats. `derive-gate-sites.mjs` had to learn `verdict(` as a
diagnostic call, or the site would have reported **no diagnostic at all** -- a stronger claim than
the truth. Four full runs after the fix were green against one failure in three before; one
observation of a rare event is not a rate, and that is what the finding says.

**Acceptance.** 55 tests over the guard (six new over the span rule); typecheck, lint, `docs:check`
green; `derive-gate-sites --check` green (86 sites, 46 scripts); the meta-gate at **46 gates, 46
caught, 0 survived** (hollowing the guard turns 102 tests red); four consecutive full runs green;
core **182 / 4457**, cli 4 / 187, repo **186 / 4644**; coverage 99.97 / 99.75 / 100 / 99.97; audit 5
volumes, findings 1–241.

### Left open

- **RE3 is unreachable for two reasons that could each be fixed.** `[open: it needs traces, which the
  corpus now has for one case, and code-level faults, of which it has none -- the sample
  `code-unhandled-exception-export` is a code fault whose text quotes a log line, so a fifth case
  would make RE3's first condition true and leave only the category rule between it and an export]`
- **Every span's clock is an offset.** `[open: ten seconds after the onset, because the texts state
  durations and not start times. A declared `offsetMs` with a quote would make the clock checkable in
  the one place it is currently asserted]`
- **A prefix-derived id is not the only place a name was used as an identity.** `[open: the same
  shape -- truncate, slugify, then treat the result as unique -- is what produced the unresolvable
  component names in the extraction key (finding 190). The digest here fixes one instance; the habit
  is what to look for]`

## v2.69 — RE3's second blocker, and a mechanism that is an absence

RE3 had two independent reasons to write nothing: it needs traces, and it selects on
`category === 'code'` with none in the corpus. v2.68 removed the first. This round removes the
second, with `history-unhandled-exception-export` from `code-unhandled-exception-export`.

**The mechanism is an absence.** The CSV writer throws on an embedded newline, the exception escapes
the worker's own handler, and no nack is ever sent -- so the broker sees a closed connection, the job
is never retried, and a dead job looks like a finished one. That shapes the layers: the process step
is the sentence about *what the broker saw*, and the evidence is split deliberately, because the only
number the text states (3% failures) is a metric checkpoint while the mechanism exists only as a log
line -- so the second checkpoint is a quotation with `== 1 count`.

**No span, and the line says so.** The text gives a consequence and no duration; a span without a
duration would be a number nobody wrote. So RE3 writes the case with exactly one data-less file.

```
check-fault-cases: coverage rcaeval-re1 ready · rcaeval-re2 ready · rcaeval-re3 ready
check-fault-cases: export RE1 5 case(s) written, 0 file(s) with no rows · RE2 5 case(s) written, 7 file(s) with no rows · RE3 1 case(s) written, 1 file(s) with no rows, 4 skipped
```

`RE3 0 case(s) written, 4 skipped` had been that line's tail for three rounds. `5 of 30`, floor 5.

**No defect in the code this round.** What it produced instead was three counts that had to be moved
by hand -- `4 of 30` → `5 of 30`, `entity filled 11` → `12`, `RE2 ... 6` → `7` -- each caught by a
failing test. That is the pinning working, and it is also its cost: every annotation edits three
assertions in two files.

**The 3% now exists in three places** -- `parameters.failureShare: 0.03`, the checkpoint's `3 %`, and
the series' `post: 3` -- and nothing ties them together.

**Acceptance.** 56 tests over the guard (one new: the first RE3 case written); typecheck, lint,
`docs:check` green; `derive-gate-sites --check` green (86 sites, 46 scripts); the meta-gate at **46
gates, 46 caught, 0 survived** (hollowing the guard turns 104 tests red); five cases, twelve
entities; core **182 / 4458**, cli 4 / 187, repo **186 / 4645**; coverage 99.97 / 99.75 / 100 /
99.97; audit 5 volumes, findings 1–242.

### Left open

- **One number, said three times, with nothing tying the copies.** `[open: the failure share is in
  `fault.parameters`, in a checkpoint, and in a series. A checkpoint could name the parameter it
  expresses, and the guard could refuse a disagreement -- which is the shape every other duplicated
  fact in this corpus was given]`
- **The second checkpoint is a quotation with a count of one.** `[open: `== 1 count` on a log line is
  the only way the schema can hold "this line exists", and it reads as a measurement of a quantity
  that is really a presence. A comparator for existence would say what it means]`
- **25 samples still carry no case.** `[open: 5 of 30. Two of the three rcaeval suites now export
  every annotated case; RE3 exports the one whose category it accepts, and the next code-level
  sample is what would make that more than a single row]`

## v2.70 — eight of eleven checkpoints name a signal that does not exist

The evidence layer's `signalRef` is the only field tying a checkpoint to telemetry. G2 resolves
`entityRef`; **nothing has ever resolved `signalRef`**. Counted for the first time, printed on every
guard run:

```
check-fault-cases: checkpoints 3 of 11 signal reference(s) resolve to a declared series; 3 of 3 inequality(ies) are false at the post value
```

Three resolve, eight do not: by a suffix (`client_span_duration` vs `client_span_duration_ms`), a
plural, a synonym (`per_message_processing_time` vs `per_message_processing_seconds`), or by naming
nothing at all (`cp-p99` has no `signalRef`, and `cp-typeerror-line` names a log). **Every one of them
reads correctly** -- which is why five rounds of review did not see it. The failure mode is a
reference that is plausible rather than absent.

And the three that do resolve are **false at their own value**: `> 4200000` against a post of
4200000, `> 92` against 92, `> 40000` against 40000. The annotation copied the number from the text
rather than from the series, so a reader who resolves the name gets a contradiction.

**This round measures and does not repair, on purpose.** Two of the eleven are not series references:
`cp-processing-tripled` names a ratio (3x) whose series carries seconds (0.06s), and `cp-cpu-limit`
names a configuration fact (a 500m quota) that no telemetry carries. A rule written without them
would be wrong, and the repair needs a vocabulary the corpus does not have -- a checkpoint that says
whether it is *about* a series, *derived from* one, or *stated by* one and carried nowhere.

**One row of the finding's table was wrong when first written** -- `cp-buffer` was listed as a
mismatch because it was typed from memory, and a synonym is exactly what four of the real mismatches
look like. The printed count said three and the table showed two, and that disagreement is what
caught it: the count and the table were two statements of one fact, and one of them was checked by a
machine.

**Acceptance.** 58 tests over the guard (two new: the numbers, and `0 of 0` rather than a division);
typecheck, lint, `docs:check` green; `derive-gate-sites --check` green (86 sites, 46 scripts); the
meta-gate at **46 gates, 46 caught, 0 survived** (hollowing the guard turns 108 tests red); core
**182 / 4460**, cli 4 / 187, repo **186 / 4647**; audit 5 volumes, findings 1–243.

### Left open

- **A checkpoint needs to say what kind of reference it is.** `[open: about a series, derived from one,
  or stated by one and carried nowhere -- three cases that today share one optional string. Until the
  vocabulary exists, `3 of 11` can only be printed, not gated]`
- **Eight references to fix, and the fix is not a rename.** `[open: renaming `client_span_duration` to
  `client_span_duration_ms` resolves it; re-pointing `cp-processing-tripled` needs the ratio to name
  its source series and the arithmetic. The first is mechanical, the second is a schema decision, and
  doing them together would hide which was which]`
- **The three resolvable checkpoints are false under their own comparator.** `[open: `>` against a value
  equal to the post. Either the comparator becomes `>=` or the checkpoint states a threshold the
  series clears -- and choosing per case is a judgement about what the incident asserted]`

## v2.71 — the reference had four meanings, so the repair is a vocabulary

v2.70 measured eight references that named nothing and three that were false under their own
comparator. The repair is not a rename, because **one optional string was carrying four different
things**: a series the value is a threshold on, a series the value is *computed from*, a
configuration fact no telemetry carries, and a log line.

`CHECKPOINT_REFERENCES` (`series | derived | configuration | log`) is now a published vocabulary --
declared once in `ir/types.ts`, referenced by the schema with `z.enum(...)`, documented in the
data-model table, so `check-data-model-vocabularies` covers six sets instead of five. Each kind has
the rule that can be applied to it, and no more:

| kind | checked |
| --- | --- |
| `series` | resolves; unit agrees; the assertion holds at the post value |
| `derived` | resolves only -- a ratio of two durations is not equal to one of them |
| `configuration` | names *nothing* telemetry-shaped; a series by that name is a modelling error |
| `log` | resolves to a line `id` the declaration carries |

**Corpus:** four references were a suffix or plural away, `cp-p99` had none, `cp-processing-tripled`
is `derived`, `cp-cpu-limit` is `configuration`, `cp-typeerror-line` is `log` against a new `id` field
on log lines, and five comparators became `>=` because `>` against a value equal to the post is false.

```
check-fault-cases: checkpoints 11 of 11 reference(s) resolve by kind (9 to a series); 0 of 8 comparable assertion(s) fail on the series' own post value
```

**Two defects.** The unit check ran before the `derived` short-circuit, so the correct annotation was
refused for being "in `1` but the series is in `s`" -- which is what `derived` means. And the guard
grew a membership test the schema had already made unreachable: an unknown `signalKind` fails the
parse before the guard sees the checkpoint, so the test could not fire. Deleted, with the test now
asserting the parse failure -- **one owner for one vocabulary**.

**Still copied:** `cp-watermark` asserts `>= 92` and the post is 92, both transcribed from one
sentence. The guard proves they agree; it cannot tell whether 92 is right.

**Acceptance.** 65 tests over the guard (nine new over the four kinds); typecheck, lint, `docs:check`
green (six vocabularies); `derive-gate-sites --check` green (86 sites, 46 scripts); the meta-gate at
**46 gates, 46 caught, 0 survived** (hollowing the guard turns 122 tests red); core **182 / 4467**,
cli 4 / 187, repo **186 / 4654**; coverage 99.97 / 99.75 / 100 / 99.97; audit 5 volumes, findings
1–244.

### Left open

- **A `derived` reference names one source and not the arithmetic.** `[open: `cp-processing-tripled`
  says "derived from `per_message_processing_seconds`" and the factor 3 lives only in the value. Two
  derived checkpoints could name the same series with different arithmetic and nothing would
  disagree]`
- **`configuration` refs are checked for the wrong thing.** `[open: the only rule is that they must not
  collide with a series, which catches a modelling error and says nothing about whether the quota is
  the one the case ran under]`
- **24 samples still carry no case.** `[open: 5 of 30. The annotation now satisfies nine obligations,
  and the newest one -- naming what each reference is -- is the first that can be checked
  mechanically]`

## v2.72 — the arithmetic moved from the number into the annotation

**What was open.** Finding 244's first open item: a `derived` reference named one series and the
factor lived only in the value. `cp-processing-tripled` asserted `== 3` over a series whose readings
are `0.02 s` and `0.06 s`, and no file said "divided by". The guard resolved the series and stopped,
because a ratio cannot be compared with a duration -- so of the four kinds of reference, this was the
one where "resolves" was the entire check.

**What changed.**

| layer | before | after |
| --- | --- | --- |
| the checkpoint | `signalRef` + a number | `expression` **instead of** `signalRef`; the value is what it computes |
| the schema | `signalKind` an enum | a biconditional: expression present exactly when `derived`, and `signalRef` forbidden beside it |
| the grammar | none | `fault/expression.ts`: 12 lines, `+ - * /`, parentheses, `<metric>.<point>`, no `eval` |
| the units | not compared for derived | symbol-exponent algebra; `+`/`-` require the same unit, `s/s` is `1` |
| the comparison | none | relative tolerance `1e-9`, because `0.06 / 0.02` is `2.9999999999999996` |
| the corpus | 1 derived checkpoint, 1 reading | 2 derived checkpoints over 4 readings; the cart case gains the first *difference* |

`cp-network-overhead` is `client_span_duration_ms.post - server_handler_time_ms.post == 889 ms`: the
part of the 900ms neither process accounts for. Both operands were already quoted from the sentence
that states them, so the checkpoint adds arithmetic rather than a new claim -- which is the only
honest way to add a derived checkpoint to a corpus derived from text.

**Five defects, and two came from the check itself.** The unit algebra rejected my own
division-by-zero test (`ms - 1` is a mismatch, not a division); the number leaf carried a refusal that
no input could reach because its caller had already tested the first character; the counts line was
printed only on the success path, so `0 of 10` was a decoration and vanished exactly when a corpus was
red; a test that meant to prove "a wrong value is refused" passed because `cp-p99` is `>=` and
`4120 >= 4100`; and every schema refusal had been reported as `does not parse: [` because
`String(error.message).split('\n')[0]` on a zod issue list is a bracket.

**Acceptance.** 35 tests over the grammar, 6 over `describeSchemaFailure`, 78 over the corpus guard
(12 new); both new modules at 100 x4; typecheck, lint, `docs:check` green (six vocabularies in the
table, nine inline `z.enum`s remaining); `derive-gate-sites --check` green (86 sites, 46 scripts --
same count, four line numbers moved); the meta-gate at **46 gates, 46 caught, 0 survived**
(hollowing the guard turns **144** tests red); core **184 / 4530**, cli 4 / 187, repo **188 / 4717**;
coverage 99.97 / 99.76 / 100 / 99.97; audit 5 volumes, findings 1–245.

### Left open

- **The expression is checkable; its choice is not.** `[open: `post / baseline` and
  `baseline / post` both compute, and only the annotation says which describes the fault. The guard
  now proves the number is the number the annotation's own arithmetic produces -- not that the
  arithmetic is the right reading]`
- **The unit algebra has no conversions.** `[open: `%` and `1` are different symbols, as are `1 min`
  and `60 s`, so a checkpoint that divides a percentage by a count is refused rather than converted.
  The refusal is correct and the corpus has no such reading yet; the first one will need a table]`
- **24 samples still carry no case.** `[open: 5 of 30. Ten obligations now, and the newest -- stating
  the arithmetic rather than the number -- is the first that can be computed]`

The `configuration` item from v2.71 is unchanged this round: the only rule is still that a
configuration reference must not collide with a series, which catches a modelling error and says
nothing about whether the quota is the one the case ran under.

## v2.73 — the algebra stops having its own opinion about units

**What was open.** v2.72's own second open item: "the unit algebra has no conversions -- `%` and `1`
are different symbols, as are `1 min` and `60 s`, so a checkpoint that divides a percentage by a
count is refused rather than converted. The refusal is correct and the corpus has no such reading
yet; the first one will need a table."

There was already a table. `util/unit.ts` holds `UNITS` as exact rationals per dimension with
`convertUnit`, `isConvertible` and `dimensionOf`, and it is what G2 asks when it decides whether a
checkpoint's unit exists. `fault/expression.ts` did not read it, so the package had two opinions
about units and the newer one was stricter -- `900 ms - 0.9 s` was refused as "not the same unit",
and the refusal had been written into a test as though it were a property.

**What changed.** `+` and `-` convert when both operands are atomic and the table says they are
convertible; the result keeps the left operand's unit; dimensionless is the symbol `1` (so `%` and
`1` interoperate, as the table has always said). Everything else is still a mismatch, now with both
dimensions named when the table knows them. `*` and `/` do not convert, and compound units still
compare structurally -- the one remaining limit, stated in the module rather than discovered later.

| reading | before | after |
| --- | --- | --- |
| `900 ms - 0.9 s` | refused | `0 ms` |
| `1 min + 30 s` | refused | `1.5 min` |
| `50 % + 0.2 1` | refused | `70 %` |
| `900 ms - 11 count` | refused | refused, `(time and count)` |
| `MiB/s + KiB/s` | refused | refused, no dimensions |

**Two defects inside the repair.** Dimensionless returned `undefined` from `atomicSymbol`, so
`50 % + 0.2` was a mismatch between a ratio and nothing; and the function's `size !== 1` guard left a
bound check no input could reach -- the same unreachable refusal v2.72 deleted from the number leaf.
Both are gone, the second by counting in the loop instead of guarding before it.

**The corpus did not move**, which is the point of saying so: both derived checkpoints are `ms` over
`ms` and `s` over `s`. The conversion is proven where it applies -- a scratch corpus asserting
`4.3 s + 11 min == 664,300 ms` end to end through the guard -- rather than by a corpus edit that would
have needed an invented number.

**Acceptance.** 40 tests over the grammar (four new over conversions, one over a unit the table does
not know); the guard test that asserted the refusal now asserts the arithmetic; `expression.ts` at
100 x4; typecheck, lint, `docs:check` green; `derive-gate-sites --check` green (86 sites, 46 scripts);
the meta-gate at **46 gates, 46 caught, 0 survived**; core **184 / 4535**, cli 4 / 187, repo
**188 / 4722**; coverage 99.97 / 99.76 / 100 / 99.97; audit 5 volumes, findings 1–246.

### Left open

- **Compound units are compared structurally.** `[open: `MiB/s` and `KiB/s` are different units to
  the algebra even though `util/unit.ts` has both. Making a composite dimensional would have to
  decide what it renders as after an addition, and the corpus has no derived reading over a
  composite yet -- the first one will force the decision]`
- **The expression is checkable; its choice is not.** `[open: `post / baseline` and
  `baseline / post` both compute, and only the annotation says which describes the fault]`
- **25 samples still carry no case.** `[open: 5 of 30 carry one. This item's headline said "24" for
  two rounds while its own body said "5 of 30", and 30 - 5 is 25 -- the subtraction has been done
  here, and the count now comes from the two arrays rather than from the sentence beside them]`

## v2.74 — a configuration reference stops being a rule about what it must not be

**What was open.** v2.71's third item, restated in v2.72 and v2.73: "`configuration` refs are checked
for the wrong thing -- the only rule is that they must not collide with a series, which catches a
modelling error and says nothing about whether the quota is the one the case ran under."

The corpus's only configuration checkpoint did what a negative rule permits. `cp-cpu-limit` named
`container_spec_cpu_quota` -- a plausible cAdvisor metric name that nothing in the case declares --
and asserted `>= 0.5 1`. The 0.5 was the incident's "500m" divided by a thousand, by a division no
file recorded, while `fault.parameters.limitMillicores: 500` sat three lines away, unread.

**What changed.** A configuration checkpoint cites a key of the case's own `fault.parameters`, and
the guard compares against what that key holds. Parameters may now be quantities
(`{ "value": 500, "unit": "mcore" }`), read by `readDeclaredQuantity`, so the unit travels with the
value instead of being reintroduced by hand. `util/unit.ts` gains a `cores` dimension (`core`,
`mcore`) because the table had no way to write `500m` -- which is *why* the annotation had divided.

| the parameter | the checkpoint | result |
| --- | --- | --- |
| `500 mcore` | `== 500 mcore` | compared as written |
| `500 mcore` | `== 0.5 core` | converted, then compared |
| `500 mcore` | no unit | refused -- the parameter has one |
| a bare number | a unit | refused -- nothing could check the unit |
| a string | anything numeric | refused -- an identifier restated is not a fact |

**A third copy of four operators, deleted.** The guard had a ternary chain for a series' post value
and `expression.ts` had a switch for a computed one; the configuration branch needed a third.
`compareExactly` is now the only implementation, and `holdsWithTolerance` is that plus the tolerance
branch -- which is what the tolerance always was: a correction for computed values, not for literals.
`499.9999999` against a declared `500` is a mistake, and the tolerant comparison accepts it.

**Corpus:** `limitMillicores: 500` became `cpuLimit: { value: 500, unit: "mcore" }`, and the
checkpoint cites `cpuLimit` with `== 500 mcore`. The comparable denominator went from ten to eleven:
the checkpoint stopped being an assertion whose reference resolved to nothing.

**A note on the CI, recorded rather than argued away.** The run for `e7f28b23` failed with
`Test Files 184 passed`, `Tests 4530 passed`, coverage at 99.97 / 99.76 / 100 / 99.97, and **one
unhandled error**: `[vitest-worker]: Timeout calling "onTaskUpdate"`. Every test passed and the job
was red. The next commit -- same suite plus one refactor -- was green, and `9886a2f1` is that run.
One observation of a rare event is not a rate, so this is an open item rather than a fix; what it
establishes is that a green suite can exit 1, which is a fact about the runner and not about the tree.

**Acceptance.** 8 tests over `readDeclaredQuantity`, 8 over the guard's configuration rules, 6 over
`cores`/`mcore`, 1 over `compareExactly` with both directions of the tolerance boundary; typecheck,
lint, `docs:check` green (six vocabularies); `derive-gate-sites --check` green (86 sites, 46 scripts);
the meta-gate at **46 gates, 46 caught, 0 survived**; core **185 / 4556**, cli 4 / 187, repo
**189 / 4743**; coverage 99.97 / 99.76 / 100 / 99.97; audit 5 volumes, findings 1–247.

### Left open

- **A green suite can exit 1, and nothing here can prevent it.** `[open: `e7f28b23` reported 4530 of
  4530 tests passed, coverage above every threshold, and one unhandled
  `[vitest-worker]: Timeout calling "onTaskUpdate"` -- so the job was red. Raising a worker timeout is
  not a repair, and a retry would hide the next real hang; the item stays until a second observation
  says whether it is a rate or an accident]`
- **The parameter is tied to the text only through the fault layer's quote.** `[open: if `500m` in
  `cpuLimit` is wrong, the checkpoint and the parameter are wrong together and agree -- the guard
  proves they are one statement, not that the statement is right]`
- **Compound units are compared structurally.** `[open: `MiB/s` and `KiB/s` are different units to the
  algebra even though `util/unit.ts` has both]`
- **25 samples still carry no case.** `[open: 5 of 30 carry one, and the arithmetic is now done from
  the two arrays rather than from the sentence beside them]`

## v2.75 — the sixth case, and the first fault that is not in the application

**What this round is.** The corpus is the long pole -- 5 of 30 samples carry a four-layer case -- and
every annotation round so far has found something the guard could not see. This one adds
`history-config-ingress-timeout-partner-portal`: the first `config` case, and the first whose root
cause is outside every process the text names.

**The four layers, and why each quote is where it is.** Entity: the partner portal, because that is
what the failures are reported against. Fault: the annotation that wrote 1s where 600s had been.
Process: "its own logs show the work completing" -- the application's behaviour is the discriminator,
and it is what makes this a timeout rather than a crash. Evidence: the handler's eight seconds, the
existence of 504s, the unchanged handler as a control, and the log line.

**The graph gains the corpus's first `external`.** `external:public-ingress` calls
`service:partner-portal`; the root cause is the service, because that is the name an operator gives,
and the ingress is the mechanism -- which is why the configuration checkpoint sits on it. 14 entities
/ 9 edges.

**No number for the failures.** The text says uploads began failing and never says how many. The
series is `baseline: 0, post: 1` and the checkpoint asserts `>= 1`, so the annotation says that
failures happened instead of measuring a rate nobody measured.

**A defect found by needing a counter and choosing not to use one.** `expandSeries` gives a counter's
pre-window samples `baseline + 0.1 * index`, which for a baseline of zero is a series that was
already accumulating before the onset -- failures before the change, in a text that says they began
then. The case uses `step`, which is what the text describes. The expansion is not repaired, and the
reason is the standard rather than the difficulty: it lives inside the guard's script where nothing
observes the values it produces, so a change to it would be a change no test could disagree with. The
item is open, with the numbers written down.

**Acceptance.** `check-fault-cases` prints **6 of 30**, `16 of 16` references resolved by kind (12
series, 2 computed from 4 readings, 2 configuration), `0 of 14` comparable assertions failing; RE1 6
cases / 0 empty files, RE2 6 / 8, RE3 1 written / 1 empty / 5 skipped; both baselines place
`partner-portal` in top-K. Guard tests 84 (the pinned counts moved by hand: `5 of 30` → `6 of 30`,
`filled 12` → `filled 14`, `RE2 … 7` → `8`, `RE3 … 4 skipped` → `5`); typecheck, lint, `docs:check`
green; the meta-gate at **46 gates, 46 caught, 0 survived**; core **185 / 4556**, cli 4 / 187, repo
**189 / 4743**; coverage 99.97 / 99.76 / 100 / 99.97; audit 5 volumes, findings 1–248.

### Left open

- ~~**A counter's pre-window is not its baseline.**~~ Closed by finding 249 (v2.76): the expansion
  moved into `core` and the pre-window is flat at the baseline.
- **The parameter is tied to the text only through the fault layer's quote.** `[open: if `1s` in
  `upstreamReadTimeout` is wrong, the checkpoint and the parameter are wrong together and agree]`
- **24 samples still carry no case.** `[open: 6 of 30 carry one, and five of the eight categories are
  now represented (`resource`, `network`, `middleware`, `code`, `config`); `runtime` and `dependency`
  are not, and the remaining 24 samples hold both]`

The v2.74 item about a green suite exiting 1 is unchanged this round: `e7f28b23` reported 4530 of 4530
tests passing with one unhandled `[vitest-worker]` timeout, and no later run has repeated it.

## v2.76 — the expansion becomes a module, and a counter stops running before the fault

**What was open, and where it came from.** v2.75 recorded it while annotating: `expandSeries` gave a
counter's pre-window samples `baseline + 0.1 * index`, so a counter with a baseline of zero was
already accumulating before the onset -- failures before the change, in a text that says they began
then. It was not repaired then because the expansion lived inside the guard's script and nothing
observed the values it produced: a change there would have been a change no test could disagree with.

**What changed.** `fault/derived-telemetry.ts` now owns `expandSeries`, `expandLog` and
`expandTraces`, the closed `SERIES_DERIVATIONS` vocabulary the guard used to keep to itself, and the
cadence and offset constants. The guard calls into it. A counter's pre-window is flat at its baseline
-- what "this counter had accumulated this much by the start of the window" means -- and its last
post-onset sample is still exactly the declared `post`.

| declaration | pre-window | post-window |
| --- | --- | --- |
| `step`, 100 → 300 | `100, 102, 98, 101, 99, 101.6, 98.4, 100.6` | `300, 306, 294, 303, 297, 304.8, 295.2, 301.8` |
| `counter`, 12 → 96 | `12, 12, 12, 12, 12, 12, 12, 12` | `22.5, 33, 43.5, 54, 64.5, 75, 85.5, 96` |
| `counter`, 0 → 1 | `0, 0, 0, 0, 0, 0, 0, 0` | `0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1` |

**A property that could not be tested before.** Finding 240 replaced a twelve-character *prefix* of
the case id with a digest because two cases agreeing that far would have shared span ids. That repair
had no test, because the function was unreachable from the suite. It has one: two ids that agree for
twelve characters produce different span ids.

**The consequence the fix exposed, and the number it moved.** The negative control for G4's
two-solver requirement changed its answer: with the throttling counter's pre-window flat, its baseline
has no spread, the `epsilon` floor turns its rise into an enormous z, and the pod that carries it
(`checkout-api-0`) now outranks the service. Peak-z places the root cause **second** instead of
first. The case is still refused for the reason the test is about -- the robust ranking places it
fourth of four -- but the number moved, and it moved because a claim the expansion used to invent was
removed.

**The published description was missing too.** `docs/data-model.md` described the IR and not the
signals file, so the format six cases use had no published specification. It has one now: the three
blocks, their fields, what each expands into, and the counter's flat pre-window. The three shape
names in that paragraph are a copy of `SERIES_DERIVATIONS`, so a test compares the paragraph against
the tuple -- the same shape `check-data-model-vocabularies` gives the vocabularies a zod schema
admits, applied to the one that reaches no schema at all.

**Acceptance.** 21 tests over the expansion (every one asserting written-out numbers); the guard
green with the corpus unchanged (`6 of 30`, `16 of 16`, `0 of 14`); `derived-telemetry.ts` at
100 x4; typecheck, lint, `docs:check` green; `derive-gate-sites --check` green (86 sites, 46 scripts);
the meta-gate at **46 gates, 46 caught, 0 survived**; core **186 / 4580**, cli 4 / 187, repo
**190 / 4767**; coverage 99.97 / 99.76 / 100 / 99.97; audit 5 volumes, findings 1–249.

### Left open

- **24 samples still carry no case.** `[open: 6 of 30 carry one; five of the eight categories are
  represented, and `runtime` and `dependency` are not]`

The two items v2.74 and v2.73 left open -- a parameter tied to the text only through the fault layer's
quote, and compound units compared structurally -- are unchanged this round.

## v2.77 — the seventh case, and two that were refused

**What this round is.** Another corpus round, and the first `dependency` case:
`history-dependency-upstream-5xx-pricing`, whose root cause is a third-party provider rather than a
component of the system.

**The annotation's job was to keep two sentences apart.** "The pricing service returned 502 on 60% of
requests" is what failed; "every failure is an upstream tax-calculation call answering 503" is why.
Entity is the dependency, fault is the provider's status-page window, process is what the pricing
service did with the answers, and evidence is a pair plus a control:

| series | reading | role |
| --- | --- | --- |
| `http_502_ratio_percent` | 0 → 60 % | the symptom |
| `tax_calculation_503_ratio_percent` | 0 → 60 % | the cause -- "every failure" of a 60 % rate is 60 % |
| `other_dependency_error_ratio_percent` | 0 → 0 | `== 0 %`, the control that names the absence |

The zero is the corpus's first assertion of an absence: without it, "the pricing service is broken"
would satisfy the case. And `fault.parameters.sharePercent` is itself a checkpoint, so the declared
share and the telemetry's share have to agree.

**Two candidates refused, with their arithmetic.** `runtime-pod-kill-user-profile` turns on "every
request 503'd" -- a share of exactly 1 -- and the expansion's ±2 % jitter would make it 1.02, a 102 %
share no system can produce; a count would be true and weaker than the text, and a `noise: none`
field invented for one case is the kind of thing this log keeps recording as a mistake. The
crash-loop sample turns on "178 restarts in 12 hours" against a ninety-second cadence, so `post: 178`
would compress twelve hours into the twelve minutes the post-window covers. Both are recorded as open
items: a corpus that only records what it accepted cannot say what it cannot express.

**Acceptance.** `check-fault-cases` prints **7 of 30**, `20 of 20` references resolved by kind (15
series, 2 computed from 4 readings, 3 configuration), `0 of 18` comparable assertions failing; RE1 7
/ 0 empty, RE2 7 / 9, RE3 1 written / 1 empty / 6 skipped; both baselines place `tax-calculation` in
top-K; the graph is 16 entities / 10 edges. The pinned counts moved by hand again (`6 of 30` → `7 of
30`, `filled 16`, `RE2 … 9`, `RE3 … 6 skipped`, `20 of 20`, `0 of 18`); typecheck, lint,
`docs:check` green; the meta-gate at **46 gates, 46 caught, 0 survived**; core **186 / 4580**, cli
4 / 187, repo **190 / 4767**; coverage 99.97 / 99.76 / 100 / 99.97; audit 5 volumes, findings 1–250.

### Left open

- **A share at its maximum cannot carry the corpus's noise.** `[open: the expansion applies ±2 % to
  every level reading, so a series whose post is 1 (`unit: '1'`) or 100 (`%`) reports 1.02 or 102 --
  a value no system can produce. The pod-kill sample needs exactly that, and the model has no way to
  say "this series has no sampling noise"]`
- ~~**The cadence does not follow the window.**~~ Closed by finding 251 (v2.78): the spacing is derived
  from each side's span and `post` is the reading at the window end.
- **`post` cannot be derived from a parameter.** `[open: the pricing case declares `sharePercent: 60 %`
  and a series `post: 60`, and two checkpoints make them agree; nothing makes the second read the
  first, so a change to one is caught only because both are asserted]`
- **23 samples still carry no case.** `[open: 7 of 30 carry one; six of the eight categories are
  represented, and `runtime` is not -- the two refusals above are both `runtime` samples]`

## v2.78 — the samples span the window, and the eighth case stops being refused

**What was open.** v2.77 refused `runtime-container-crash-loop-media` because "restarted 178 times in
12 hours" could not be declared: eight samples ninety seconds apart cover twelve minutes whatever the
window says, so `post: 178` would have compressed twelve hours into the first twelve minutes of the
post-window.

**What changed.** The count is fixed at eight per side and the **spacing is derived from each side's own
span**: the pre-side is left-aligned on the window start, the post-side is right-aligned on the window
end. `SERIES_STEP_MS` is deleted.

| | before | after |
| --- | --- | --- |
| pre-side | 8 samples, 90 s apart, from the window start | 8 samples spread across `(onset - start)`, last one 1/8 of a span before the fault |
| post-side | 8 samples, 90 s apart, from the onset | 8 samples ending on the window end |
| `post` means | the level after the onset | the reading at the end of the window |
| a 20-minute post-window | 12 minutes represented | all 20 |

**A refusal that became unreachable.** The old loop's `if (timestamp >= onsetMs) break;` existed because
a constant cadence could run past the onset; with spacing `span/8` the last pre-onset sample sits at
`7/8 span`, so **no input can reach the break**. Deleted, and the test that demonstrated it now
demonstrates the property (every pre-onset sample is strictly before the fault, however short the
window).

**What it did not change.** The values: the jitter cycle, the counter's accumulation and the spike's
excursion are functions of the index, not of the timestamp, so both baselines rank the same services and
G3/G4 are unaffected. What changed is what the timestamps *mean*.

**The case it unblocked.** `history-runtime-container-crash-loop-media` — the corpus's eighth case, its
first `runtime` one, and its first whose window is a number the text states: twelve hours, the counter
accumulating to 178 by the end, and a probe ratio at exactly zero ("no probe ever passes"), which is
also the sentence that rules the probe out as the cause.

**Acceptance.** `check-fault-cases` prints **8 of 30**, `23 of 23` references resolved by kind (17
series, 2 computed from 4 readings, 3 configuration), `0 of 20` comparable assertions failing; RE1 8 /
0 empty, RE2 8 / 10, RE3 1 written / 1 empty / 7 skipped; both baselines place the root cause in top-K
for all eight. Pinned counts moved by hand (`8 of 30`, `filled 19`, `RE2 … 10`, `RE3 … 7 skipped`,
`23 of 23`, `0 of 20`); typecheck, lint, `docs:check` green; the meta-gate at **46 gates, 46 caught, 0
survived**; core **186 / 4580**, cli 4 / 187, repo **190 / 4767**; coverage 99.97 / 99.76 / 100 /
99.97; audit 5 volumes, findings 1–251.

### Left open

- **22 samples still carry no case.** `[open: 8 of 30 carry one, and all eight categories are now
  represented -- `resource`, `network`, `runtime`, `middleware`, `code`, `config`, `dependency`; the
  remaining 22 are the work]`
- ~~**A share at its maximum still cannot carry the corpus's noise.**~~ Closed by finding 252 (v2.79):
  `util/unit.ts` states the range each unit admits, the guard refuses a declaration outside it, and
  the expansion clamps the noise into it.

## v2.79 — a reading is a measurement, so it stays inside its unit

**What was open.** v2.77's first item, restated in v2.78: "a share at its maximum cannot carry the
corpus's noise -- the expansion applies ±2 % to every level reading, so a series whose post is 1
reports 1.02, which is the reason `runtime-pod-kill-user-profile` is still refused."

**What changed.** `util/unit.ts` states the range a reading can occupy, beside the factors it already
holds: `1` is `[0, 1]`, `%` is `[0, 100]`, and every other unit is `[0, ∞)` because every one of them
counts something and none is signed. A unit the table does not know has no range, and nothing is
clamped against a bound nobody declared. Two rules consume it:

| rule | where | what it does |
| --- | --- | --- |
| the declaration | the guard | refuses `post: 1.2` in `1`, `baseline: -1` in `ms`, naming the range |
| the noise | the expansion | clamps a noisy sample into the range; at a bound the noise is one-sided |

**A counter is not clamped**, deliberately: its samples are exact totals, and clamping an exact total
would silently rewrite the declaration's own arithmetic. Only the sites where noise is applied go
through `withNoise`.

**The rule found a modelling error in a test fixture.** The negative control for G4's two-solver
requirement declares a load generator's `request_rate_rps` as 100 → 300 in unit `1` -- a rate in the
dimensionless ratio unit, which every existing unit rule accepted because `1` is published. The
bounds rule refused it, and the clamp flattened the series, at which point the negative control
stopped refusing the case. Fixed to `rps`; the fixture's own numbers (`peak-z-by-service=2,
median-shift-by-service=4`) are unchanged.

**The ninth case.** `history-runtime-pod-kill-user-profile` -- the corpus's second `runtime` case, and
its first whose causal chain starts *above* the workload: `node:worker-3` `hosts` the pod, the kubelet
acts on an eviction decision taken for another workload, and the service has no ready replica for
forty seconds. Series: `http_503_ratio` 0 → 1 (the reading this round made expressible),
`pod_ready_after_start_seconds` 0 → 40 s, `node_condition_ready` 1 → 1 as the control.

**What the case cannot say.** "No application exception was logged" is evidence of nothing happening,
and a `log` checkpoint asserts that a line exists. The corpus can say a line is there and cannot say
one is absent; declaring a line the text does not contain is the one thing the guard refuses. Open
item.

**Acceptance.** `check-fault-cases` prints **9 of 30**, `26 of 26` references resolved by kind (20
series, 2 computed from 4 readings, 3 configuration), `0 of 23` comparable assertions failing; RE1 9 /
0 empty, RE2 9 / 12, RE3 1 / 1 / 8 skipped; 22 entities / 14 edges; both baselines place the root
cause in top-K for all nine. New tests: 3 over `measurementBounds` and `clampToUnit`, 4 over the
clamp in the expansion, 4 over the guard's refusal; pinned counts moved by hand (`9 of 30`,
`filled 22`, `RE2 … 12`, `RE3 … 8 skipped`, `26 of 26`, `0 of 23`); typecheck, lint, `docs:check`
green; `derive-gate-sites --check` green (86 sites, 46 scripts, four line numbers moved); the
meta-gate at **46 gates, 46 caught, 0 survived**; core **186 / 4590**, cli 4 / 187, repo
**190 / 4777**; coverage 99.97 / 99.76 / 100 / 99.97, and both touched modules clean; audit 5
volumes, findings 1–252.

### Left open

- **21 samples still carry no case.** `[open: 9 of 30 carry one; five categories have a case and the
  remaining 21 samples are the work]`
- **An absence of logs cannot be a checkpoint.** `[open: the pod-kill text's "No application exception
  was logged" is evidence, and a `log` reference asserts that a line exists -- the corpus can say a
  line is present and has no way to say one is missing]`
- **A binary reading still wobbles.** `[open: `node_condition_ready` reads 1 and the noise pulls it to
  0.98 on the downward arms, because the model has no way to say a series has no sampling noise; the
  clamp fixes the ceiling and leaves the wobble]`

The two long-standing items are unchanged: a parameter is tied to the text only through the fault
layer's quote, and compound units are compared structurally.

## v2.80 — the chain was connected at every hop and still was not a chain

**What this round is.** The tenth case, `history-code-timezone-booking-api`: a UTC offset captured at
process start, a daylight saving change, and every reminder created afterwards going out an hour
early. Writing it produced a defect in my own annotation, which is what the round is about.

**The chain I wrote, and what it said.** The propagation is `booking-api -> booking-scheduler`. The
scheduler's innocence — "it dispatched at exactly the time it was given" — wanted a home, and the
chain had a spare step, so step 2 went back: `booking-scheduler -> booking-api`. **G2 accepted it**:
every hop resolved, every hop had a path, and step 2 started exactly where step 1 ended. What it also
asserted is that the scheduler caused the API.

| rule | code | refuses |
| --- | --- | --- |
| steps numbered `1..n` | `CAUSAL_STEPS_NOT_NUMBERED` | `[2]` — one step claiming to be the second |
| no entity visited twice | `CAUSAL_CHAIN_REVISITS` | `a -> b -> a` |

`step` had been read in exactly one place, the sort, so a chain numbered 2, 3 sorted into a plausible
sequence and nothing said the numbers were wrong.

**The first version of the rule was wrong, and an existing test said so.** Refusing every repeat
failed *"accepts a causal step that starts and ends at the same entity"*, whose mechanism is "a
saturated thread pool blocks its own retries". A self-hop is a claim about one component amplifying
itself; a two-entity cycle is mutual causation. The rule collapses self-hops before asking whether
anything repeats.

**The case.** Tenth, and the corpus's second `code`-category case — so **RE3 now writes 2**. Two of
its three checkpoints assert zero (nothing errored; the scheduler was on time), because the text
records a wrong answer that a symptom-only evidence layer cannot exclude. The moving series steps to
exactly 3600 s.

**Acceptance.** New tests: 3 over the chain rules, 1 negative control; the two codes classified as
case-level in `export/guard.ts` (the totality test is what forced the decision); guard prints **10 of
30**, `29 of 29` references resolved by kind, `0 of 26` comparable assertions failing; RE1 10 / 0
empty, RE2 10 / 14, **RE3 2** / 3 empty / 8 skipped; 24 entities / 15 edges; pinned counts moved by
hand (`10 of 30`, `filled 24`, `RE2 … 14`, `RE3 2 … 3`, `29 of 29`, `0 of 26`); typecheck, lint,
`docs:check` green; `derive-gate-sites --check` green (86 sites, 46 scripts); the meta-gate at **46
gates, 46 caught, 0 survived**; core **186 / 4593**, cli 4 / 187, repo **190 / 4780**; coverage
99.97 / 99.76 / 100 / 99.97; audit 5 volumes, findings 1–253.

### Left open

- **20 samples still carry no case.** `[open: 10 of 30 carry one; the remaining 20 include the
  samples whose text gives no number at all, which is the next shape to solve]`
- **The chain's first step is not required to be the root cause.** `[open: two cases start above their
  root cause (`public-ingress`, `worker-3`) because the cause is what an operator names and the chain
  is how it reached the symptoms; whether that is a rule or an exception has not been decided]`

The two items v2.79 left open that this round did not touch are unchanged: an absence of logs cannot be
a checkpoint, and a binary reading still wobbles. So are the two long-standing ones: a parameter is
tied to the text only through the fault layer's quote, and compound units are compared structurally.

## v2.81 — a condition that reads 98 % ready

**What was open.** v2.79's third item: "a binary reading still wobbles -- `node_condition_ready` reads 1
and the noise pulls it to 0.98, because the model has no way to say a series has no sampling noise; the
clamp fixes the ceiling and leaves the wobble."

**What changed.** `SeriesDeclaration.noise`, a closed vocabulary of `sampled` (the default) and `none`.
The distinction is between a reading that is *measured* and one that is *computed*:

| reading | noise | why |
| --- | --- | --- |
| a p99 latency, a queue depth | `sampled` | measured by sampling a continuous quantity |
| a share of counted requests | `none` | two counters and a division: 60 % is 60, not 58.8 |
| a probe's success ratio, a node condition | `none` | counted outcomes: zero means no probe passed |

The default is the old behaviour, so no existing declaration changes meaning. The guard refuses a
member outside the vocabulary, and refuses the field on a `counter` -- its samples are its accumulation
and are exact either way, so the field would claim a distinction the shape does not have.

**Six series adopted**, each with the sentence that makes it exact: pod-kill's `http_503_ratio` (0 → 1,
"every request 503'd") and `node_condition_ready` (1 → 1, a condition is 1 or 0); the 5xx case's three
shares, including the counted zero that is its control; and the crash-loop's
`liveness_probe_success_ratio`. The series the text describes as measured stay `sampled`:
`request_duration_p99_ms`, `client_span_duration_ms`, `server_handler_time_ms`,
`per_message_processing_seconds`. Both baselines still place the root cause in top-K for all ten cases.

**A test that found nothing, twice.** The document test for the noise table stopped at the first blank
line; the section is a paragraph *and* a table, so it compared `[]` to `['sampled', 'none']`. The
`derivation` test had the same shape and was fixed the same way in finding 249 -- copying the first one
to write the second is how the bug came back.

**Acceptance.** New tests: 5 over the field and the vocabulary, 2 over the guard's refusals, 1 over the
document table; `SERIES_NOISE` registered in the export surface (`core` publishes it, so the guard reads
one tuple rather than its own copy); typecheck, lint, `docs:check` green; `derive-gate-sites --check`
green (86 sites, 46 scripts); the meta-gate at **46 gates, 46 caught, 0 survived**; core **186 / 4600**,
cli 4 / 187, repo **190 / 4787**; coverage 99.97 / 99.76 / 100 / 99.97, `derived-telemetry.ts` clean;
audit 5 volumes, findings 1–254.

### Left open

- **20 samples still carry no case.** `[open: 10 of 30; the corpus is the long pole and the next case is
  the next round]`
- **An absence of logs cannot be a checkpoint.** `[open: unchanged from v2.79 -- a `log` reference
  asserts that a line exists]`
- **The audit volume is nearly full.** `[open: volume-05 is 272,641 of 280,000 bytes, so the next
  finding starts volume-06 and its row goes into `docs/audit.md`]`

Unchanged: the chain's first step is not required to be the root cause; a parameter is tied to the text
only through the fault layer's quote; compound units are compared structurally.

## v2.82 — the corpus is two documents joined by one string, and nothing read both

**What this round is.** Not a case. A check that was missing between the corpus's two halves, found by
trying to write the eleventh case.

**The shape.** `index.json` names the extraction sample each case was annotated from, and `sampleId` is
verified: it must exist, it must be unique, and every quote is checked against that sample's
`incidentText`. What nothing checked is what the two sides *say*. The key states a fault's type, its
category and the component a solver has to name; the annotation states all three again, from the text.
Ten cases agreed on all three **by habit, not by rule**.

| field | the key | the annotation |
| --- | --- | --- |
| the fault's type | `expected.type` | `fault.type` |
| its category | `expected.category` | `fault.category` |
| the answer | `expected.component` | `groundTruth.rootCauseComponent` |

`rootCauseComponent` is what a solver is scored on and `category` decides which export a case lands
in, so a silent disagreement would have meant scoring an answer the key that produced the case does
not ask for.

**What the rule did immediately.** Its first act was to refuse the case I was about to write.
`middleware-redis-latency-cache` has a clear cause — the Redis instance's single command thread,
saturated by a `KEYS` command an unrelated debugging script issues every thirty seconds — and the key
says the component is `session-cache`, which is the victim. The honest annotation is refused, and the
three possible readings (the key is wrong; the key means the service that owns the datastore; the
corpus names the workload an operator pages) are a decision about the extraction layer, not something
to settle by editing a case. It waits as an open item.

**Acceptance.** Four new tests (three refusals, one negative control on the corpus); the guard's
message names both sides; a scratch corpus with a changed component, type or category is refused, and
the probe against the redis sample produces exactly the message the finding quotes; typecheck, lint,
`docs:check` green; `derive-gate-sites --check` green (86 sites, 46 scripts); the meta-gate at **46
gates, 46 caught, 0 survived**; core **186 / 4604**, cli 4 / 187, repo **190 / 4791**; coverage
99.97 / 99.76 / 100 / 99.97; audit **6 volumes**, findings 1–255, and `volume-06` starts here because
`volume-05` reached 272,641 of its 280,000 bytes.

### Left open

- **`middleware-redis-latency-cache` cannot be annotated honestly yet.** `[open: the key says
  `session-cache` and the cause is the Redis instance; the reading has to be decided in the extraction
  layer before the case can be written]`
- **19 samples still carry no case.** `[open: 10 of 30; one of the 19 is blocked by the item above,
  which makes it the most valuable of them to settle]`
- **An absence of logs cannot be a checkpoint.** `[open: unchanged -- a `log` reference asserts that a
  line exists]`

Unchanged: the chain's first step is not required to be the root cause; a parameter is tied to the text
only through the fault layer's quote; compound units are compared structurally.

## v2.83 — the eleventh case, and the answer on the other side of a call edge

**What this round is.** The case finding 255 refused. `middleware-redis-latency-cache`: cache GETs go
from 0.4ms to 55ms at 21:30 and stay there, because the instance's single command thread is held by a
`KEYS` command an unrelated debugging script issues every thirty seconds.

**The question was already answered, twice.** Finding 255 refused to pick a reading between "the key
says `session-cache`" and "the cause is the Redis instance". The corpus had been splitting the two all
along:

| case | component | entity |
| --- | --- | --- |
| crash-loop | `media-transcoder` | `container:.../media-transcoder-app` |
| pod-kill | `user-profile` | `pod:.../user-profile-0` |
| this one | `session-cache` | `db:.../session-redis` |

**The component is the service an operator names; the entity is the thing that failed.** A container
and a pod are parts of a service; a datastore is not, and that is the only thing new — the first case
where the two sit on different sides of a `calls` edge. So the annotation follows the existing pattern
rather than inventing one.

**Three firsts.** The graph's first `db` entity, and the first chain that starts at one while the
answer is the service calling it. The first configuration checkpoint whose parameter is a *cadence*
(`keysIntervalSeconds: 30 s`) rather than a limit. And a control that says `normal` rather than `zero`:
"the pool utilisation is normal" invites `== 0`, and `== 0` would be false — the pool was in use, just
not near its ceiling, so the checkpoint asserts `< 100 %`.

**The chain also settles a question in prose.** Its first entity is not `rootCauseComponent`, and
nothing requires it: two cases start above their root cause and this one starts below it, at a
dependency, because that is where the propagation began.

**Acceptance.** `check-fault-cases` prints **11 of 30**, `33 of 33` references resolved by kind (26
series, 2 computed from 4 readings, 4 configuration), `0 of 30` comparable assertions failing; RE1 11 /
0 empty, RE2 11 / 16, RE3 2 / 3 empty / 9 skipped; 26 entities / 16 edges; both baselines place
`session-cache` in top-K. Pinned counts moved by hand (`11 of 30`, `filled 26`, `RE2 … 16`,
`RE3 … 9 skipped`, `33 of 33`, `0 of 30`, `4 citing a declared configuration fact`); typecheck, lint,
`docs:check` green; `derive-gate-sites --check` green (86 sites, 46 scripts); the meta-gate at **46
gates, 46 caught, 0 survived**; core **186 / 4604**, cli 4 / 187, repo **190 / 4791**; coverage
99.97 / 99.76 / 100 / 99.97; audit 6 volumes, findings 1–256.

### Left open

- **19 samples still carry no case.** `[open: 11 of 30 carry one; the corpus is the long pole, and each
  case needs its own reading of the text rather than a template]`
- **An absence of logs cannot be a checkpoint.** `[open: the pod-kill text's "nothing was logged" is
  still unexpressible, because a `log` reference names a line that exists and there is no way to name
  the line that does not]`
- **`normal` needed a bound the text does not give.** `[open: the pool checkpoint asserts below the
  ceiling because "normal" is not "zero"; the level beside it (40 percent) is the annotation's, and a
  reviewer cannot tell from the corpus which half came from the sentence]`

Unchanged: a parameter is tied to the text only through the fault layer's quote; compound units are
compared structurally; a chain's first step is not required to be the root cause.

## v2.84 — the twelfth case: a chain with one entity, and a paraphrase the check caught

**What this round is.** `middleware-database-connection-pool` — the billing service throws `connection
pool exhausted` after a replica promotion, all twenty pool connections are held, and the primary
reports no long-running query.

**The first self-hop in the corpus.** The deadlock is a cycle among the service's own threads, so the
chain has nowhere else to go: `billing-service -> billing-service`, mechanism "twenty threads hold
twenty connections while waiting on a lock held by a transaction that is itself waiting for a
connection". Finding 253's rule kept that shape deliberately, against a unit-test fixture; this is the
first annotation that needs it.

**Three things the case exercises.**

| what | how |
| --- | --- |
| a log line as evidence | the checkpoint asserts `contains` the error string the *victim* logs, not the fault's own line |
| two numbers that are one fact | `connections in use == 20 count` and the pool's declared `poolSize == 20 count` — a reading and its ceiling, so a change to one fails the other |
| a database that is not the cause | `db_long_running_queries == 0 count`, a counted zero: the wait is queued in the client, so the server has nothing running |

**The paraphrase.** The first run refused the annotation: the process quote I wrote was `The deadlock is
entirely inside the service's client pool`, and the text says `the deadlock …` — lowercase, because it
continues the sentence before it. One character of case, caught because the check compares a folded
substring rather than my memory of the paragraph.

**Acceptance.** `check-fault-cases` prints **12 of 30**, `37 of 37` references resolved by kind (28
series, 2 computed from 4 readings, 5 configuration, 2 log), `0 of 33` comparable assertions failing;
RE1 12 / 0 empty, RE2 12 / 17, RE3 2 / 3 empty / 10 skipped; 28 entities / 17 edges; both baselines
place `billing-service` in top-K. Pinned counts moved by hand (`12 of 30`, `filled 28`, `RE2 … 17`,
`RE3 … 10 skipped`, `37 of 37`, `0 of 33`, `5 citing a declared configuration fact`); typecheck, lint,
`docs:check` green; `derive-gate-sites --check` green (86 sites, 46 scripts); the meta-gate at **46
gates, 46 caught, 0 survived**; core **186 / 4604**, cli 4 / 187, repo **190 / 4791**; coverage
99.97 / 99.76 / 100 / 99.97; audit 6 volumes, findings 1–257.

### Left open

- **18 samples still carry no case.** `[open: 12 of 30 carry one; each needs its own reading of the text
  rather than a template, and the slow ones are the samples whose prose gives no number]`
- **The two numbers that are one fact are not linked.** `[open: the pool ceiling appears as a reading
  and as a parameter, and two checkpoints make them agree; nothing makes the series' post value *read*
  the parameter, so a change to the pool size still requires editing both]`
- **An absence of logs cannot be a checkpoint.** `[open: this case needed a line that exists, which is
  why it could be written; the pod-kill case's "nothing was logged" still cannot]`

Unchanged: a parameter is tied to the text only through the fault layer's quote; compound units are
compared structurally; a chain's first step need not be the root cause.

## v2.85 — a reading can cite a parameter instead of copying it

**What was open, twice.** Finding 250's item — "a parameter is tied to the text only through the fault
layer's quote" — and v2.84's restatement: "the two numbers that are one fact are not linked". The
billing case stated the pool's ceiling twice, as a reading and as a parameter, and the two stayed in
step by being edited together.

**What changed.** A series' `baseline` and `post` may be `{ "parameter": "poolSize" }`.
`readDeclaredReading` reads the shape; the guard resolves it against the case's own parameters, because
a *malformed* reference and a reference to something *absent* are two different repairs. Four
refusals, each with its own message: no such key (it lists the ones there are), a value that is not a
quantity, a unit that cannot convert (`cpuLimit` in `mcore`, series in `count`), and a reading that is
neither a number nor a reference (`"five"`).

**Resolution happens once**, into a hash the four consumers read: the unit-range check, the expansion,
the expression evaluator and the checkpoint comparison. That also flushed out the **third** copy of the
six comparison operators, still in the series branch after finding 247 consolidated the other two; it is
`compareExactly` now.

**The corpus.** Two series cite instead of copying: the billing case's
`client_pool_connections_in_use.post` → `{ parameter: 'poolSize' }`, and the pod-kill case's
`pod_ready_after_start_seconds.post` → `{ parameter: 'readyAfterSeconds' }`. Editing a parameter now
moves the reading, which is what "the reading reaches the ceiling because it *is* the ceiling" should
have meant all along.

**What it does not do.** No arithmetic over parameters — the expression language reads series. And the
parameter's *truth* is still tied to the text only through the fault layer's quote.

**Acceptance.** 4 tests over the shape reader (nine malformed values refused), 5 over the guard's
resolution and refusals; `parameters.ts` at 100 × 4; typecheck, lint, `docs:check` green;
`derive-gate-sites --check` green (86 sites, 46 scripts); the meta-gate at **46 gates, 46 caught, 0
survived**; core **186 / 4613**, cli 4 / 187, repo **190 / 4800**; coverage 99.97 / 99.76 / 100 /
99.97; audit 6 volumes, findings 1–258.

### Left open

- **18 samples still carry no case.** `[open: 12 of 30 carry one; the corpus is the long pole and every
  case needs its own reading of the text]`
- **An absence of logs cannot be a checkpoint.** `[open: the pod-kill case's "nothing was logged" is
  still unexpressible; every log checkpoint asserts that a line exists]`
- **A parameter's truth is still a quote.** `[open: the reading now reads the parameter, so the two
  cannot disagree; nothing makes the parameter agree with the sentence it was transcribed from]`

Unchanged: compound units are compared structurally; a chain's first step need not be the root cause.

## v2.86 — a fault whose scope is a size

**What this round is.** The thirteenth case, `network-mtu-catalog-service`: after the overlay was
rebuilt onto a path whose MTU is 1,400 bytes, catalog responses larger than one segment hang; the
interface still advertises 1,500 and the health checks stay green.

**Two of its four checkpoints assert that nothing happened**, which is what makes it the corpus's first
case of its kind:

| checkpoint | reading | role |
| --- | --- | --- |
| large requests hang `== 1` | a share of one | the symptom |
| small payloads unaffected `== 0` | a counted zero | the control that makes this a size threshold |
| health check green `== 1` | never moved | the control that explains the alerting gap |
| path MTU `== 1400 By` | from the parameters | the fact the interface has to fit inside |

Without the zero the case reads as "the network broke"; with it, the case is a threshold a solver has
to reason about.

**A device the graph has no word for.** The text's router reports dropping fragments, and the graph has
no kind-plus-relation for a device on the path — `node` exists, but an edge from a service to a router
would have to be `calls`, which is a lie about the direction. The router stays in
`rootCauseReason` and out of the graph, the chain is `pod -> service`, and the annotation says so.

**The first readings in bytes.** `By` has been in the conversion table since it was written and no case
had used it; this one has two, both exact.

**Acceptance.** `check-fault-cases` prints **13 of 30**, `41 of 41` references resolved by kind (31
series, 2 computed from 4 readings, 6 configuration), `0 of 37` comparable assertions failing; RE1 13 /
0 empty, RE2 13 / 19, RE3 2 / 3 empty / 11 skipped; 30 entities / 18 edges; both baselines place
`catalog-service` in top-K. Pinned counts moved by hand (`13 of 30`, `filled 30`, `RE2 … 19`,
`RE3 … 11 skipped`, `41 of 41`, `0 of 37`, `6 citing a declared configuration fact`); typecheck, lint,
`docs:check` green; `derive-gate-sites --check` green (86 sites, 46 scripts); the meta-gate at **46
gates, 46 caught, 0 survived**; core **186 / 4613**, cli 4 / 187, repo **190 / 4800**; coverage
99.97 / 99.76 / 100 / 99.97; audit 6 volumes, findings 1–259.

### Left open

- **17 samples still carry no case.** `[open: 13 of 30 carry one, and this round spent itself on the
  graph's vocabulary rather than on an annotation -- the corpus is still the long pole]`
- **A device on the network path has no entity.** `[open: the graph's relations are `contains`, `hosts`,
  `calls` and `same_as`, and none of them describes "traffic passes through"; a router, a switch or a
  load balancer therefore cannot be an entity without an edge that lies]`
- **An absence of logs cannot be a checkpoint.** `[open: unchanged; every log checkpoint asserts that a
  line exists, and this case declares none]`

Unchanged: a parameter's truth is still tied to the text only through the fault layer's quote; compound
units are compared structurally; a chain's first step need not be the root cause.

## v2.87 — a vocabulary in four places, and the member that found them

**What was open.** v2.86's second item: "a device on the network path has no entity — the graph's
relations are `contains`, `hosts`, `calls` and `same_as`, and none of them describes 'traffic passes
through'".

**What changed.** One member, `routes`, and the admission that adding it was an experiment in how many
places a vocabulary can live. It found four: the schema's inline `z.enum`, the `EntityRelation` union,
`VALID_RELATIONS` in `entity/graph.ts`, and the union inside the document's `EntityEdge` snippet. Adding
the member to two of them produced a graph the schema admitted and the validity guard refused —
`unknown relation 'routes'` — which is exactly the split the published-vocabulary gate exists to
prevent, for the six vocabularies that *had* a table. The relation set had none, so nothing read it.

Now `EDGE_RELATIONS` is a tuple, `EntityRelation` derives from it, the schema is
`z.enum(EDGE_RELATIONS)`, `VALID_RELATIONS` *is* the tuple, and the document has a row. The gate reports
**seven** published vocabularies and **eight** inline enums, down from six and nine.

`EdgeRelation` — a second type name I introduced beside `EntityRelation` in the same edit — is deleted.
Two names for one type is the same defect as two lists for one vocabulary, one level up.

**What the member buys.** `node:edge-router-2 --routes--> pod:catalog-service-0`: the MTU case's
path-MTU checkpoint now has an owner, the device that reports dropping fragments, and the graph says
why. The case's `why` no longer explains what the graph cannot say.

**Acceptance.** Typecheck, lint, `docs:check` green; `check-data-model-vocabularies` at 7 vocabularies;
`derive-gate-sites --check` green (86 sites, 46 scripts, four line numbers moved); the meta-gate at
**46 gates, 46 caught, 0 survived**; core **186 / 4613**, cli 4 / 187, repo **190 / 4800**; coverage
99.97 / 99.76 / 100 / 99.97; audit 6 volumes, findings 1–260; the corpus is unchanged at **13 of 30**
with 31 entities / 19 edges.

### Left open

- **17 samples still carry no case.** `[open: 13 of 30 carry one; the corpus is the long pole]`
- **An absence of logs cannot be a checkpoint.** `[open: every log checkpoint asserts that a line
  exists, and the pod-kill case's "nothing was logged" still cannot be said]`
- **No relation is checked for direction.** `[open: `routes` says traffic for the target passes through
  the source, and nothing refuses an edge written the other way round -- the graph has no notion of
  which end is upstream]`

Unchanged: a parameter's truth is still tied to the text only through the fault layer's quote; compound
units are compared structurally; a chain's first step need not be the root cause.

## v2.88 — the anchor that died of a filesystem nobody measured

**What was open.** Nothing on the list said "the fourth anchor is broken". The trigger was a CI
reading: `gh run list` showed the 2026-10-26 scheduled `official-data` run as `failure`, and the two
before it too, except one dispatch on 2026-10-12. Twelve failures had been recorded as "the upstream
is flaky" because the run's own summary said so.

**What changed.** The summary was wrong. The fetch had downloaded and verified `RE2-OB`
(1 191 025 569 bytes, digest matching the registry) and then `unzip` wrote 6.3 GB into `/tmp` and hit
`write error (disk full?)`. `/tmp` is a 7.9 GiB tmpfs on the ubuntu-26.04 runner image; it was part of
the ~74 GiB root disk on 24.04, and `ubuntu-latest` moved on 2026-10-19. The corpus never changed.

Three layers, three fixes:

- **destination** — `OFFICIAL_DIR=$RUNNER_TEMP/official`, assigned in the first step and exported
  through `$GITHUB_ENV`, read by every later step. The workflow no longer contains `/tmp` in
  executable text, and a test says so. The first version named it in `jobs.<id>.env` and GitHub
  refused the file (`Unrecognized named-value: 'runner'` — the context does not exist there); no test
  could see that, so the rule set gained one that refuses a `runner` expression above `steps:`. The
  second dispatch then ran and failed nine seconds in, at the same step, because it used
  `$OFFICIAL_DIR` two lines after exporting it — a name exported for later steps does not exist in
  the exporting one, and `set -u` makes that fatal. That one cannot be read out of the document at
  all, so the naming step's `run:` block is now **executed** by the suite under `bash` with a
  temporary `RUNNER_TEMP`/`GITHUB_ENV`, with the shipped defect as its negative control.
- **check** — two exact preflights in `fetch-official.mjs`: the registry's pinned byte count before the
  transfer, and the archive's own central-directory total before extraction (zip64 included, four
  syscalls, no `unzip -l`). A shortfall prints both numbers and exits **3**.
- **vocabulary** — five exit codes (0 fetched, 1 unreachable, 2 pin mismatch, 3 does not fit, 4 could
  not unpack), five branches in the workflow's `case`, and a `*` fallback that names no cause. The old
  `*` called every unrecognised status "an asset could not be downloaded", which is how a full disk
  came to be described as unreachable.

`extract()` no longer calls `fail()` mid-loop, so a failed unpack leaves the pin report intact — the
report's own comment promised that and an `unzip` failure broke it.

**The measurement that had no reader.** The workflow had run `df -h /tmp` before and after the fetch
since it was written. It printed `7.8G` available and nothing compared it to anything. The check now
lives where the requirement is known, and the `df` steps name the same variable the fetch writes to.

**Acceptance.** 4 new tests in the fetch suite (all four red against the pre-fix script, measured by
stashing it), 18 in the new `official-data-destination.test.ts` (7 rules over the text, each re-run
against a mutation that must trip it, plus 2 that execute the naming step); typecheck, lint,
`docs:check` green; `derive-gate-sites --check` green (**88 sites, 46 scripts**, both new sites
annotated `proved`); core **187 / 4635**, cli 4 / 187, repo **191 / 4822**; coverage 99.97 / 99.76 / 100 / 99.97; audit 6 volumes, findings 1–261; the corpus is
unchanged at **13 of 30** with 31 entities / 19 edges.

### Left open

- **The anchor is not yet green.** `[open: the next scheduled run is the proof, and nothing in this
  tree can stand in for it -- the fix makes the run able to pass and makes a failure legible if it
  does not]`
- **17 samples still carry no case.** `[open: 13 of 30 carry one, unchanged for two rounds -- this
  round's gap was below the corpus, in the workflow that would prove the corpus scores]`
- **No relation is checked for direction.** `[open: nothing refuses a `routes` edge written backwards,
  so the graph can state the opposite of the truth and every guard still passes]`
- **An absence of logs cannot be a checkpoint.** `[open: a log checkpoint can only assert that a line
  exists; the pod-kill case still cannot say "nothing was logged"]`

Unchanged: a parameter's truth is still tied to the text only through the fault layer's quote; compound
units are compared structurally; a chain's first step need not be the root cause.
