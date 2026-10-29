## Finding 290 — every test passed, and the run was not green

CI run [`40886479390`](https://github.com/AgentiX-E/rca-bench-factory/actions/runs/40886479390), on
commit `76b8a02f4`, failed. The failing step is `Test with coverage (core + cli, ≥95% per dimension,
100% functions)` and its summary lines are:

```
 Test Files  192 passed (192)
      Tests  4807 passed (4807)
     Errors  1 error
```

Coverage was complete on all four dimensions (`99.97 / 99.75 / 100 / 99.97`). No test failed. The one
error is:

```
Error: [vitest-worker]: Timeout calling "onTaskUpdate"
```

That is the worst shape a red can take, because nothing in it names a subject. It says the worker
failed to *call the main process*, which is not a claim about any test, any file, or any source line —
and the obvious response, re-running it, passes. It had happened before (finding 275's round records an
earlier occurrence) and been "fixed" by splitting a test file in two, which the next finding shows fixed
nothing.

### What the three plausible causes each predicted, and what was measured

| hypothesis | what it predicted | what the log showed |
| --- | --- | --- |
| the runner was starved of CPU | a gap in the report's own timeline | the largest inter-line gap in 157 KB of log is **7.7 s**, and it is the gap before a slow file's own completion line |
| a test hit a timeout | a test reported as `Test timed out` | no test anywhere in the log is reported as timed out; the slowest is 61,201 ms against a 200,000 ms file budget |
| the machine is slower than this one | a local run of the same revision passing while the same tests fail | the same revision passed locally, and the local run has the *same* 108 s wall time to within noise |

None of them survived. What did was a controlled pair, built from the one fact the error message does
carry: **the deadline belongs to a call the worker makes**, and the timer that measures it runs in the
worker.

### The pair

Two test files, identical in every respect except one token. Each has nine tests, each test spends
seven seconds inside a child process:

| the file | the child | total | result |
| --- | --- | --- | --- |
| `spawnSync('sleep', ['7'])` × 9 | started synchronously | 63.97 s | **`[vitest-worker]: Timeout calling "onTaskUpdate"`, exit 1** |
| `await execFile('sleep', ['7'])` × 9 | started asynchronously | 63.91 s | clean, exit 0 |

Both runs pass all nine tests. Both spend 63 seconds. Only the synchronous one fails, and the wall time
is the same to 60 ms — so "the file is slow" and "the machine is slow" predict the wrong row. What
differs is whether the worker's event loop can turn:

- the bridge between the worker and the main process is `birpc`, whose every call carries
  `timeout = DEFAULT_TIMEOUT` and `DEFAULT_TIMEOUT = 6e4` — **sixty seconds, not configurable** through
  any vitest option (`createForksRpcOptions(v8)` passes no override);
- the worker calls `onTaskUpdate` after each task, and the answer arrives promptly;
- Node runs the timers phase before it reads pending IPC, so a loop that has been blocked for 60 s
  reads its own expired timer *first*, throws, and only then would have read the answer that had been
  waiting for most of a minute.

The blocked loop is the whole mechanism. Nothing about traffic, nothing about the machine.

### Which file, and how much

The report's own per-file durations identify it, and the arithmetic confirms it:

| test file | duration on the runner | how many synchronous children |
| --- | --- | --- |
| `check-cli-reference.test.ts` | **61,201 ms** | 9 cases, each spawning the gate plus one `--help` per topic |
| `cli-reference-backend-table.test.ts` | 28,237 ms | 5 cases, same shape |
| `fetch-official.test.ts` | 35,087 ms | mostly awaited; its 12.9 s case is a child, not a loop |
| `typecheck-entrypoint.test.ts` | 37,047 ms | one case at 36,715 ms |
| `ingest-report.test.ts` | 53,516 ms | two CPU-bound cases, 19,755 ms and 33,630 ms |

Nine synchronous children of roughly seven seconds each, in one file, awaiting only microtasks between
them: the loop never reaches the timers phase for 61 seconds, and the deadline is 60.

### The fix

Both CLI-reference files now **wait** for their children (`execFile` in a promise) instead of blocking
on them. That removes the blocking rather than spending less time blocked — the suite's wall time is
unchanged, because the children take the same time either way.

And because "no file blocks the loop longer than the bridge's deadline" is a property of the *suite*,
it is now measured rather than remembered:

| what | where | what it does |
| --- | --- | --- |
| the gauge | `packages/core/test/support/event-loop-stall.ts` | samples the loop every 50 ms and records the longest stretch it did not turn; `stop()` also reads the clock, because a block that ends the file cannot be sampled |
| the hook | `packages/core/test/setup/stall-watch.ts` | registered as `setupFiles`, so it runs in every file's worker; fails the file that exceeded the budget, by name of the budget and of the deadline |
| the budget | 45,000 ms | three quarters of the 60,000 ms deadline. The two largest legitimate stalls in the suite — `typecheck-entrypoint` at 36.7 s and `ingest-report` at 33.6 s, both CPU-bound rather than blocked children — sit inside it, with 15 s of headroom to the deadline |
| the calibration | `stall-budget.test.ts` | reads `DEFAULT_TIMEOUT` out of the installed `birpc` chunk and holds the constant equal to it, rather than restating a number that came from an error message |
| the proof it can fail | `stall-budget.test.ts` | runs a real vitest over a two-case project with the budget lowered to 300 ms: the blocking case fails with the verdict, the awaited case passes — same 1.2 s of `sleep`, one token different |

### Acceptance

| what | before | after |
| --- | --- | --- |
| the failing CI step | `Tests 4807 passed`, `Errors 1 error`, exit 1 | green |
| `check-cli-reference.test.ts` | 9 synchronous cases, 61,201 ms of blocked loop | 9 awaited cases, 18,731 ms, longest stall under the budget |
| `cli-reference-backend-table.test.ts` | 5 synchronous cases, 28,237 ms | 5 awaited cases, 10,056 ms |
| a file that blocks past the budget | nothing measured it | fails with `held the event loop for N ms, past the 45000 ms budget` |
| the suite's own stopwatch | absent | one 50 ms interval per worker, `unref`'d |
| `core` suite | 192 files / 4807 tests | **193 files / 4816 tests** |
| `repo` suite | 196 / 4994 | **197 / 5003** |

**What this does not fix.** The `cli` package is not instrumented: its four files are small and the
gauge lives in core's test tree, so wiring it there needs a shared module and this round did not pay for
one — the omission is stated rather than papered over. Sixty-nine other test files still spawn
synchronously; the gauge makes their totals *visible* only if a file crosses the budget, which is a
threshold and not a prohibition. The budget is a number chosen from two measurements (36.7 s legitimate,
61.2 s fatal) and the dependency's constant, and a slower runner could move the legitimate side up
without moving the fatal side at all. `maxWorkers: 8` on a two-vCPU runner is still an
over-subscription, and a starved **main** process would produce the same message from the other side of
the bridge — the pair above proves the worker-side mechanism, not that it is the only one.

## Finding 291 — the rule that proves gates can be tested required the tests to block

`gate-sites-are-proven.test.ts` rule 7 asks two questions of every proved gate site: does the proving
test *declare* the script in `DRIVES`, and does the test file *spawn* it. Both are required, and a
disagreement in either direction is reported — `declares it but never spawns it`, or the reverse.

The second question read this:

```ts
for (const call of body.matchAll(/\b(?:spawnSync|execFileSync|execSync)\s*\(/g)) { … }
```

Three spellings, and all three are synchronous. So when finding 290's fix converted
`check-cli-reference.test.ts` from `spawnSync` to `execFile`, rule 7 reported the site as
`declares it but never spawns it` — the test file still runs the gate, but not in any way the rule could
see. The rule had quietly become a requirement that a proved gate's test **block its own event loop**,
which is the defect that turn was trying to remove. It is the same shape as the finding it was written
to prevent: the *mention* of a script is not its execution, and here the *blocking* execution of a
script had become the only recognised one.

The evidence classes are now one value rather than two copies of a pattern:

```ts
const SPAWN_CALL = /(?<![.\w])(?:spawnSync|execFileSync|execSync|spawn|execFile|exec)\s*\(/;
```

The negative lookbehind keeps `someRegExp.exec(...)` out. Without it the helper scan — which classifies
a function as spawning when its *body* contains a spawn call — would classify any function that matches
a pattern as a spawning helper, and then read the arguments of every call to it as evidence of what the
file drives. `execFile` is here for a stated reason and not as a tidy-up: an asynchronous call runs the
same script as the synchronous one, and rule 7 is a claim about what a file *runs*.

Both readers use the constant — class 1 (the spawn's own argument list) and class 2 (a call to a helper
whose body spawns) — because the previous version had the same alternation typed twice, which is how the
two could drift apart in the first place.

### What the earlier "fix" for this symptom did, and what it claimed

`cli-reference-backend-table.test.ts` did not begin as a file. It was five more cases inside
`check-cli-reference.test.ts`, and when that file first crossed the deadline the response was to split
it. The header written at the time said:

> the worker's RPC to the main process timed out **under the accumulated update traffic**, and vitest
> exits non-zero for an unhandled error even when the suite is green. […] **Splitting the file is the fix
> rather than widening a timeout**: it restores the parallelism a second test file gets for free.

Both halves were wrong, and the second one is measurable: the split halved the blocking window instead
of removing it. The file it left behind grew back past 60 s two rounds later, and CI run
`40886479390` is that recurrence. The paragraph is now replaced in place, with the pair and the
mechanism, because a header that says "this is the fix" about something that is a budget transfer is
how the next reader learns the wrong lesson.

### Acceptance

| what | before | after |
| --- | --- | --- |
| rule 7's evidence classes | `spawnSync`, `execFileSync`, `execSync` | those, plus `spawn`, `execFile`, `exec` |
| the pattern | typed twice, in two readers | one constant, `SPAWN_CALL` |
| a proved site proved by an awaiting test | `declares it but never spawns it` | accepted |
| `gate-sites-are-proven.test.ts` | 33 tests, green | 33 tests, green |
| the meta-gate over all gates | 47 of 47 caught | **47 of 47 caught, 47 files restored byte-for-byte** |
| the false diagnosis | "the fix rather than widening a timeout" | replaced, with the measured mechanism and the recurrence named |

**What this does not fix.** Rule 7 is still a file-level claim — it establishes that the named test has
a path to executing the script, not that any particular line inside the script is reached — and it now
accepts `spawn` of *anything*, so a file whose helper spawns a non-script child and is also called with
a script path elsewhere would have that path counted as driven. That is the same class of imprecision
the widened set buys, and it is bounded the same way: the declaration must agree with it, so a false
inference shows up as a disagreement rather than as silence.

---

## Finding 292 — the stopwatch was proved to work, and never proved to be installed

Finding 290 ended with an instrument: `test/support/event-loop-stall.ts` measures the longest stretch
during which a test file held the worker's event loop, and `test/setup/stall-watch.ts` is the `afterAll`
hook that turns an over-budget stretch into a failure attributed to the file that caused it. Finding 291
records the meta-level half of the same repair.

The instrument is installed by one line:

```ts
setupFiles: ['./test/setup/stall-watch.ts'],
```

in `packages/core/vitest.config.ts`. Every claim v3.12 made about the instrument survived deleting that
line, and this finding is the measurement of that.

### The demonstration

`stall-budget.test.ts` proves the hook can fail: it builds a two-case project, gives it a 300 ms budget,
and asserts that a blocking case fails while an awaiting case of the same duration passes. Both cases
named the hook with a literal path resolved from the repository root:

```ts
setupFiles: [${JSON.stringify(resolve(ROOT, 'packages/core/test/setup/stall-watch.ts'))}],
```

So the battery was a proof about a file it happened to name, and not about this suite. The controlled
experiment is one deletion:

| state of `packages/core/vitest.config.ts` | `stall-budget.test.ts` | `stall-watch-is-installed.test.ts` | suite |
| --- | --- | --- | --- |
| line present | 9 passed | (did not exist) | green, 4 816 tests |
| line deleted | 9 passed | (did not exist) | **green, 4 816 tests, no gauge** |
| line deleted, after this finding | **2 failed** | **1 failed** | red, 3 failures in 2 files |

The third row is the measurement, with the failure text the repository now produces:

```
× event loop · the hook fails the file that blocked it > fails a suite whose child blocks the loop,
  with every test passing
  → the core vitest config installs no setup file, so there is no hook to test:
    the config installs no setup file: `setupFiles` appears nowhere in it, so the suite runs
    without whatever the setup file was for, and nothing else in the repository would notice

× setup files · this package installs the stopwatch > installs exactly one setup file, and it is
  the stall watch
```

### Why this shape keeps recurring

The suite's own comment on `maxWorkers` says it: a claim that is true by luck is the shape of finding
123. Here the luck is structural rather than numeric, and it has three parts:

1. **a config file is imported by nothing.** Deleting a line from it breaks no import graph, no type, and
   no build. Every mechanism the repository has for noticing a deletion — the compiler, the module
   resolver, the test count — is blind to it, because a config is read by a process that starts outside
   the module graph.
2. **the artefact is an absence.** The gauge's only output is an attribution of a stall. When it is not
   installed it produces no attributions, and "no attributions" is exactly what a healthy suite looks
   like. There is no wrong number to notice, only a missing sentence.
3. **the battery was self-contained.** It proved the hook works by installing the hook itself. That is
   the right way to test a hook and the wrong way to test an installation, and the two were the same
   file.

This is finding 290's structure one level up. There, every test passed and the run was not green because
nothing measured the blocking. Here, every test passes and the *measuring* has been deleted; the
difference is that the second one is silent for longer, because a suite with no gauge fails nothing at
all until the next file blocks for sixty seconds — and then reports the same unattributable
`Timeout calling "onTaskUpdate"` that cost a round to diagnose.

### The fix

| piece | where | what it holds |
| --- | --- | --- |
| the reader | `packages/core/test/support/installed-setup-files.ts` | parses `setupFiles` out of a config **as text**, resolves each entry against the config's own directory, and refuses what it cannot confirm |
| the join | `packages/core/test/stall-watch-is-installed.test.ts` | one entry, it is `stall-watch.ts`, it exists, it registers `afterAll`, it reads its budget from the support module, and it throws on a verdict |
| the load-bearing proof | `packages/core/test/stall-budget.test.ts` | the battery installs the hook the config installs, read from the config, so a deleted entry makes the blocking case pass and fails the battery |

Text rather than an import, for the reason `coverage-thresholds.test.ts` already gives about the two
configs: importing a config executes it, which answers "what object would vitest receive" rather than
"what does the file say". The two agree today and would stop agreeing on the day someone computed the
entry — which is the case the reader refuses instead of guessing at.

Three refusals carry the weight, and each is a way the sentence can be absent while the file still looks
like it says it:

| the config | what a grep for `setupFiles` sees | what the reader reports |
| --- | --- | --- |
| no key at all | nothing, which nobody greps for | `installs no setup file` |
| `setupFiles: []` | the key, present and installed-looking | `the list is empty` |
| two `setupFiles` keys | both; vitest installs the last, a reviewer reads the first | `more than one setupFiles` |
| `setupFiles: files` | a key and a value | `not a list of string literals` |
| `setupFiles: ['./gone.ts']` | a key and a path | `does not exist` |
| `setupFiles: ['./hooks']` (a directory) | a key and a path that `stat`s | `exists and is not a file` |

### Acceptance

| what | before | after |
| --- | --- | --- |
| delete the install line | suite green, 4 816 tests, no gauge | **3 tests red in 2 files** |
| the battery's hook | a literal path it resolved itself | the entry `packages/core/vitest.config.ts` installs |
| `stall-watch-is-installed.test.ts` | did not exist | **13 tests** |
| the reader's refusals | none | 6, each with a case that produces it |
| `core` suite | 193 files, 4 816 tests | **194 files, 4 829 tests** |
| `repo` suite | 197 files, 5 003 tests | **198 files, 5 016 tests** |
| coverage | 99.97 / 99.75 / 100 / 99.97 | unchanged (the new files are tests) |

**What this does not fix.** The `cli` package still has no gauge at all — its config declares no
`setupFiles`, so the suite that runs 187 tests over the CLI is measured for nothing, and this finding's
check is written against `packages/core/vitest.config.ts` by name rather than against every package that
runs tests. A third package added tomorrow inherits the same silence. Nor does the check establish that
the hook *would* throw: it asserts the source contains the `throw`, which is a reading of the file rather
than an execution of it — the execution is the battery's half, and the two halves are joined only by the
path. A hook that referenced `stallVerdict` and discarded its result would pass the reading and fail the
battery, which is the right way round.

---

## Finding 293 — the checkpoint says which entity it is about, and nothing asked the line

The corpus's twenty-fourth case is `resource-disk-full-log-collector`: a collector whose segment
pruner stopped firing after the pod was moved, so the volume the writer shares with it filled and every
write began returning `ENOSPC`. Its evidence layer names six checkpoints, and one of them is a log
line -- the agent's own `no space left on device`. Writing that checkpoint is what produced this
finding.

The guard had checked two things about a log checkpoint and joined neither:

- the four-layer assessment resolves its `entityRef` against the graph, so the entity exists;
- since finding 286 the guard compares the phrase the checkpoint states against the body of the line
  it cites, so the phrase is in the text.

**What nothing asked is whose line it is.** A checkpoint on the checkout pod could cite the settlement
parser's warning, find its phrase, and pass both checks -- and the case would then rest on a sentence
written by a component its chain never touches.

### The demonstration

One edit to a copy of the corpus: the new case's `cp-enospc-log` is pointed at
`service:synthetic-storefront/settlement`, a service that is in the graph and is not in this case's
chain. Nothing else changes; the line, its body and the phrase stay as they were.

| rule | verdict on the mutated corpus |
| --- | --- |
| absent (before this finding) | `OK (24 of 30 sample(s) … every case passes G1, G2 and G5 …)`, exit 0 |
| present (after) | `FAILED — 1 problem(s) across 24 case(s)`, exit 2 |

```
check-fault-cases: 'history-resource-disk-full-log-collector' checkpoint 'cp-enospc-log' names
'service:synthetic-storefront/settlement', and the log line it cites is attributed to
'log-collector-agent': they are a different component, so the phrase is evidence about something other
than what the checkpoint is about
```

### Why the relation is containment rather than equality

The obvious rule -- the checkpoint's entity name equals the line's `service` -- would refuse **three of
the corpus's seven log checkpoints**, and all three are right:

| case | the checkpoint names | the line is attributed to | equal? |
| --- | --- | --- | --- |
| `code-null-dereference-reporting` | `container:…/reporting-app` | `reporting-service` | no |
| `runtime-container-crash-loop-media` | `container:…/media-transcoder-app` | `media-transcoder` | no |
| `resource-disk-full-log-collector` (new) | `pod:…/log-collector-0` | `log-collector-agent` | no |
| `config-ingress-timeout-partner-portal` | `service:…/partner-portal` | `partner-portal` | yes |
| `dependency-schema-change-currency-feed` | `service:…/settlement` | `settlement` | yes |
| `middleware-database-pool-deadlock-billing` | `service:…/billing-service` | `billing-service` | yes |
| `unhandled-exception-export` | `service:…/export-worker` | `export-worker` | yes |

Four of the seven agree on the name, which is why equality looks right and is not: a convention that
holds four times out of seven is a convention that fails the first time evidence is collected one layer
in -- which is what two of these containers and this round's pod are.

A service, its pods, its containers and the node hosting them are one component at four resolutions,
and which of the four a checkpoint names is a matter of where the evidence was collected rather than of
what it is about. So the rule is `sameComponent` -- the judgement `classifyDisplacement` already makes
about a ranking -- and its second caller is why the definition moved from `fault/displacement.ts` into
`entity/graph.ts`. Two copies of that walk would have been two answers within a release.

What it still refuses is the case that judgement was built to refuse: **the wrong replica.** Two pods of
one service are siblings, not ancestors, and a line from `checkout-1` is not a line from `checkout-0`.

### The fix

| piece | where | what it holds |
| --- | --- | --- |
| the judgement | `packages/core/src/entity/graph.ts` | `isContainedIn` / `sameComponent`, moved here so a second caller cannot grow a second definition; the walk keeps a `seen` set, so a graph whose containment is not a tree terminates |
| the rule | `packages/core/src/fault/log-attribution.ts` | for every log checkpoint: resolve the entity, resolve the line's author, refuse a different component and refuse a line whose author resolves to nothing |
| the join | `scripts/check-fault-cases.mjs` | one call, beside the phrase check it completes; the two now say "this phrase is in this line" and "this line is from this entity" |
| the tests | `packages/core/test/log-attribution.test.ts` | **13 cases**, including the two acceptance shapes, the sibling refusal, the alias, the cycle, and the two defects left to the checks that own them |

Emptying the rule was measured too, because a rule whose absence changes nothing is the defect this
volume is about: with `checkLogAttribution` replaced by a no-op, **4 of the 13 cases go red** (the three
refusals and the second-checkpoint case) and the nine permissive cases stay green -- the right direction,
since a rule that refuses nothing cannot fail a corpus that is right.

### Acceptance

| what | before | after |
| --- | --- | --- |
| a checkpoint citing another component's line | green, 24/24 | **red, one problem naming both** |
| the corpus's own seven log checkpoints | unchecked | **all pass, and the two container shapes and the pod shape are cases in the unit test** |
| the corpus | 23 of 30 samples | **24 of 30**, `disk-full` counted for the first time |
| the graph | 65 entities, 46 edges | **70 entities, 50 edges** (the collector, its pod, two containers, its node) |
| `core` suite | 194 files, 4 829 tests | **195 files, 4 845 tests** |
| coverage | 99.97 / 99.75 / 100 / 99.97 | unchanged |

**What this does not fix.** Containment is a relation between two names, not an argument about a body:
a checkpoint on a node and a line from a pod that node hosts are one component here, so a checkpoint
could cite a neighbouring workload's line on the same node and pass -- the resolution is deliberately
coarse and the coarseness is undefended. The rule reads `resolveEntityRef`, so a line attributed by a
name two entities claim resolves to nothing and is refused as unattributed rather than reported as
ambiguous, which is one message for two repairs. And the corpus's log lines are all *declared* rather
than captured, so this rule joins two authored fields; it cannot say whether the sentence a signals file
invented is one a real agent would print.

---

## Finding 294 — the fullest volume was reported without its name, and the reader supplied one

v3.13 closed with a statement it had measured nothing for:

> **`volume-09` is at its budget** (279,893 of 280,000 bytes), so the next finding opens `volume-10`.

Both halves are wrong. `volume-09.md` held **18,803 bytes**; 279,893 is `volume-03.md`. The next finding
does not open a tenth volume; it appends to the ninth, which is what this finding and finding 293 do.

### Where the number came from

The guard prints, on success:

```
check-audit-volumes: OK — 9 volume(s), 289 finding(s), 1–292; largest 279,893 of 280,000 bytes; absent: 118, 132–133
```

`largest 279,893 of 280,000 bytes` is a true statement about the set and a silent one about the file.
The round that needed it had just written in the newest volume, so it attached the newest name to the
largest number. Nothing anywhere compares the two: a size with no subject is not a claim about any
volume, so no reader and no rule could be wrong about it.

This is finding 290's shape in a smaller place. There, an error message said an operation timed out and
did not say what had blocked; here, a summary reports the largest size and does not say which volume is
largest. In both the reader is handed a fact that requires a decision they are not equipped to make, and
in both the reader makes it -- plausibly, and wrongly.

### The fix

| piece | where | what it holds |
| --- | --- | --- |
| the named reading | `scripts/audit-volumes.mjs` | `largestVolume(volumes)` returns `volume-03.md at 279,893 of 280,000 bytes`; the reduction is over every volume rather than `Math.max` of the sizes, so the name is carried rather than reconstructed |
| the same defect, second place | `scripts/progress-volumes.mjs` | the progress index printed its largest volume the same way. Here the guess is **usually right** -- the fullest progress volume is nearly always the newest -- and that is the argument for fixing it rather than against: a reading that is usually right is the one nobody checks |
| the tests | `packages/core/test/audit-volumes.test.ts`, `packages/core/test/progress-volumes.test.ts` | one case each, with a fixture whose **fullest volume is the first**, so a rule that names a position instead of a file fails |

### Acceptance

| what | before | after |
| --- | --- | --- |
| the audit summary | `largest 279,893 of 280,000 bytes` | `largest volume-03.md at 279,893 of 280,000 bytes` |
| the progress summary | `largest 148,336 of 200,000 bytes` | `largest volume-07.md at 148,336 of 200,000 bytes` |
| the claim in `volume-07` | `volume-09` is at its budget | corrected in place, with the arithmetic that shows it was not |
| `audit-volumes.test.ts` | 16 tests | **17** |
| `progress-volumes.test.ts` | 26 tests | **27** |

**What this does not fix.** The size is still a number a reader can misquote; naming it makes the
sentence self-contained rather than checking that anyone read it. The byte budget is still the one
reading in that summary with no assertion behind it -- a volume 30,000 bytes past the budget is refused,
but a volume *near* it says nothing about how close the next append may come. And the same shape is
still present wherever a summary reports an extremum: `docs/progress.md`'s `1 unread phrase(s)` is a
count whose subjects are named only in the file's own `UNMEASURED` list.

---

## Finding 295 — the probe asked whether the number was taken, not whether the child was there

A coverage run of the whole suite reported one failure:

```
FAIL test/step-process.test.ts > one step, run as CI would run it >
     forwards a signal to the step, and then dies of it rather than swallowing it
AssertionError: the grandchild 547275 outlived the runner: expected false to be true
   1 failed | 4846 passed (4847)
```

The test spawns a runner, the runner spawns a step in its own process group, the step backgrounds a
`sleep 30` and records its pid, and the test sends the runner `SIGTERM`. The runner asserts the runner
died *of* `SIGTERM`, and then that everything the step started is gone within five seconds.

### What could not be reproduced, and what that rules out

| replay | conditions | result |
| --- | --- | --- |
| 2 | full core suite, plain | 4847 of 4847, twice |
| 3 | the file alone | 8 of 8, three times |
| 1 | the scenario alone, idle machine | grandchild gone in **0 ms** |
| 8 | the scenario alone, 16 busy loops on a 32-CPU box | gone in **0–1 ms** |
| 10 | the scenario alone, three process-churn loops recycling pids | gone in **0–1 ms** |

Nineteen replays of the exact scenario, every one of them reporting the grandchild gone inside a
millisecond. So two explanations that look plausible on paper are ruled out by measurement rather than
by preference:

| hypothesis | the measurement that kills it |
| --- | --- |
| the pid was **recycled** and the probe answered about a different process | `kernel.pid_max` is **4,194,304** and the namespace was at ~547,000. Recycling inside five seconds would take 3.6 million spawns |
| the grandchild exited and its corpse was never **reaped**, which answers `kill(pid, 0)` | `/proc/<pid>` was gone within 1 ms in all nineteen replays: this container reaps promptly, so a corpse did not sit in front of the probe |

That leaves one candidate -- the group signal **missed**, so the grandchild was still running -- and no
evidence for or against it. Recording that is the honest end of the reproduction attempt.

### The defect in the probe, which does not depend on reproducing the event

`alive(pid)` was `process.kill(pid, 0)`. That answers *"is there a process with this number"*, and the
question both group-kill tests ask is *"is the process I started still there"*. The two differ in two
directions, and neither is exotic:

| what `kill(pid, 0)` says | what the kernel actually holds |
| --- | --- |
| "alive" | a process that exited and has not been reaped yet -- a `Z` corpse still owns its number |
| "alive" | a number the kernel has handed to an unrelated process |
| "alive" | the grandchild, which is the only case the test meant |

So the probe is a gate that a wrong world can pass, in a suite that spawns thousands of processes and
therefore runs beside the exact conditions under which those two false positives occur. The repair
captures the process's **start time** while the number is known to name it, and asks later about that
process: same start time, and not in a state that means it is over (`Z`, `X`). Where the platform reports
no start time at all -- `/proc` is Linux-only -- the probe answers with the signal question alone rather
than claiming an identity it never saw, which is why the two assertions are written to hold on both.

The failure message is now part of the instrument. An assertion that waits five seconds and then says a
number is still alive has thrown away everything it learned; the message now carries what the pid *is*:

```
the grandchild 547275 outlived the runner (it is in state 'S' under parent 1, running 'sleep 30')
```

That sentence separates the surviving hypotheses the reproduction could not. `parent 1` means the
grandchild was orphaned -- the group signal never reached it. `parent <runner>` means the runner died
before its kill landed. A `Z` here instead would mean the process was over and the report was the
probe's.

### Acceptance

| what | before | after |
| --- | --- | --- |
| the probe | `kill(pid, 0)`, identity-blind, corpse-blind | start time + state, per process |
| the failure message | `the grandchild 547275 outlived the runner` | `… (it is in state 'S' under parent 1, running 'sleep 30')` |
| `step-process.test.ts` | 8 tests | **10** |
| turning `stillRunning` back into `alive` | -- | **1 test red** (the probe's own; the two group-kill tests stay green, which is the honest statement about what they can see) |
| the corrected probe over 19 replays | -- | gone in ≤ 1 ms, unchanged |

**What this does not fix.** It does not explain the one failure, and it does not make a missed group
signal less likely. `signalGroup` still swallows `ESRCH` -- if `kill(-pid)` fails because the group does
not exist yet, the forwarder re-raises into its own death and the step's children live on, and nothing
records that the kill went nowhere. That is a real hole, it is not this defect, and it is on the open
list rather than half-fixed here. What changed is that the next occurrence will arrive with a state, a
parent and a command line attached instead of a number.

---

## Finding 296 — the coverage bound was a mean over 195 files, so the newest one was invisible

The round that added `fault/log-attribution.ts` closed with this reading:

> coverage unchanged **99.97 / 99.75 / 100 / 99.97**

Measured after the module landed, the package reported **99.68** branches. The difference is one file:

```
File               | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
 src/fault         |     100 |    99.64 |     100 |     100 |
  ...attribution.ts|     100 |    77.77 |     100 |     100 | 62,68,75-76
```

Both halves of that are defects, and they are different defects.

**The reading was carried, not taken.** 99.75 was the previous round's number. Nothing in the round
re-ran coverage after the last edit, so the row was a copy of a measurement of different code -- the same
shape as finding 294, where a size was copied from a summary and attached to the wrong volume. A number
that is quoted from the last time it was true is a number nobody has.

**The gate could not have caught it anyway.** The thresholds were package totals:

```
thresholds: { statements: 95, branches: 95, functions: 100, lines: 95 }
```

Against 195 files, a mean of 99.68 is satisfied by a file at 77.77 -- and the file under it was the
newest one, which is the file least likely to have been read by anyone. A mean is not a statement about
any member, and a threshold on a mean is a bound that an addition cannot offend. It is also the second
time this suite has had to learn that a package-wide figure is not a per-unit guarantee; the `core`/`cli`
split in finding 123 is the same arithmetic one level up.

### Why the module was where it was

Four branches, at `62`, `68` and `75-76`, all of them the rule's tolerance for what it is handed:

| line | what it guards | why it is reachable |
| --- | --- | --- |
| 62 | a log entry with no `id`, an empty `id`, or a `null` entry | the guard parses `signals.json` with `typeof` checks and no schema, so these are shapes it really passes in |
| 68 | a `log` checkpoint whose `signalRef` is absent | `signalRef` is optional on the type |
| 75-76 | a line that declares no `service` | same: the entry is raw JSON, and the rule reports an authorless line rather than skipping it |

Three tests were added for those shapes, and one assertion makes the empty-`id` guard *observable*
rather than merely present: a checkpoint with no `signalRef` resolves to `''`, so an entry registered
under `''` would be found by it and joined against. Removing `|| one.id === ''` turns that test red.

### The bound, moved to the file

`perFile: true`, thresholds unchanged. The cost was measured before it was chosen: the lowest per-file
figures in the package are `score/official.ts` at 99.73 statements and 98.23 branches, and its two
uncovered statements are the `never` backstop whose own comment argues they must stay uncovered -- so
every file clears 95/95/100/95 today and the change needs no exemptions. The `cli` package is one file
at 100 in every dimension and deliberately does not get the setting: a knob that cannot fail is a knob a
reader learns to skip.

### Acceptance

| what | before | after |
| --- | --- | --- |
| `fault/log-attribution.ts` | 100 / **77.77** / 100 / 100 | **100 / 100 / 100 / 100** |
| the package | 99.97 / **99.68** / 100 / 99.97 | **99.97 / 99.75 / 100 / 99.97** |
| the bound | a mean over 195 files | each file, 95 / 95 / 100 / 95 |
| proof the bound can fail | -- | with the three new tests removed the file alone reports `77.77` and the run dies: `ERROR: Coverage for branches (77.77%) does not meet global threshold (95%)` |
| proof the guard is observable | -- | removing `|| one.id === ''` turns **1 test** red |
| `log-attribution.test.ts` | 13 tests | **16** |
| `coverage-thresholds.test.ts` | 6 tests | **8** |
| the core suite | 4845 tests | **4854** (2 from the 24th case, 2 probe, 3 attribution, 2 threshold) |

**What this does not fix.** `perFile` bounds a file, not a module that nobody wrote tests for at all: a
file whose every branch is reached by an import has 100% and proves nothing. And the reading in the
v3.14 chapter of `volume-07` said `4845 tests` for a corpus that had just grown by a case -- the same
carried number, four lines above the coverage row, found while correcting the one above it.

---

## Finding 297 — the worker cap was a number about this machine, and CI is not this machine

The first push of this round came back red with every test passing:

```
FAIL  test/check-fault-cases.test.ts
Error: this test file held the event loop for 55182 ms, past the 45000 ms budget.
FAIL  test/ingest-report.test.ts
Error: this test file held the event loop for 54136 ms, past the 45000 ms budget.

 Test Files  2 failed | 193 passed (195)
      Tests  4854 passed (4854)
```

The gauge is finding 292's, and it was not wrong: it exists to keep a worker able to answer the
main process inside the bridge's 60,000 ms deadline, and 55 s is inside the margin it was built to
defend. What it caught was a configuration that depended on which machine ran it.

### The same suite, two runners

| reading | the previous run (green) | the run that failed | after the repair |
| --- | --- | --- | --- |
| total test time | 316 s | 540 s | **243 s** |
| `check-fault-cases.test.ts` | 23.0 s | **55.2 s** | **22.1 s**, and no longer one block |
| `ingest-report.test.ts` | 23.5 s | **54.2 s** | **19.1 s** |
| stall verdicts | none | 2 files over budget | none |
| `core` | 195 files / 4854 | 195 files / 4854 (all passing) | 195 files / 4854 |
| coverage | 99.97 / 99.75 / 100 / 99.97 | never reached | 99.97 / 99.75 / 100 / 99.97 |

Both files doubled while the suite as a whole went up by 1.7x, and neither had anything to do with
this round's code. The two causes are different and each got its own repair.

### Cause one: a synchronous file's duration *is* a block

`check-fault-cases.test.ts` runs the guard **116 times**, once per defect, and every invocation is
a node process. It used `spawnSync`, which was the obvious way to write it. A file that never returns
to the event loop never gives the gauge a gap, so the file's whole duration was one block: 23 s on a
fast runner, 55 s on a slow one. The claim the test makes has nothing to do with blocking -- it is
about what the guard prints -- so the fix is to await the child instead of blocking on it, and to read
`close` rather than `exit` so the output is drained before it is compared.

This is the open item "69 files still spawn synchronously", arriving with a measurement. One file
down, 68 to go, and the reason to convert the rest is now a CI failure rather than a preference.

### Cause two: `maxWorkers: 8` is 2x oversubscription on a 4-CPU runner

The cap was a flat 8, chosen against a measured memory budget on a 32-CPU box. A GitHub runner
reports **4** CPUs, so eight workers meant every file competed with seven others for a third of a
core, and CPU-bound files paid the most -- which is exactly and only the shape of the doubling above.

The cap is now `Math.max(2, Math.min(8, availableParallelism() - 1))`: the machine's capacity, capped
at the memory-driven 8, with one CPU left for the main process. On this box that still resolves to 8,
so the local reading is unchanged; on a 4-CPU runner it resolves to 3. The measured effect of the cap
alone is visible in the table: `ingest-report.test.ts`, which was not touched at all, went from 54.2 s
to 19.1 s.

### Acceptance

| what | before | after |
| --- | --- | --- |
| `check-fault-cases.test.ts` | `spawnSync`, file-long block | `await`ed child, longest block one invocation |
| `maxWorkers` | `8` | `max(2, min(8, availableParallelism() - 1))` |
| CI at the first push | 2 stall verdicts, job red | **five jobs green** |
| the suite | 4854 tests | 4854 tests, unchanged |

**What this does not fix.** `ingest-report.test.ts` still holds the loop for its whole duration -- its
cost is 130,000 rows of parsing in this process, and it now fits because there is a CPU to run on, not
because it yields. The stall budget is still 45,000 ms, a number taken from the bridge's 60,000 ms
rather than from a measurement of the slowest file, and the honest statement about it is that it has
more headroom today rather than that it is calibrated. And the 68 other files that spawn synchronously
are still one bad runner away from the same verdict.
