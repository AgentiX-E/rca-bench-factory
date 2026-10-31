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

---

## Finding 298 — the answer is a name, the telemetry is a list of names, and nothing joined them

Three cases were annotated this round, and the first of them failed with this:

```
check-fault-cases: 'history-resource-memory-leak-recommendation' is not solvable by both baselines
  (peak-z-by-service=absent, median-shift-by-service=absent): only 0 baseline(s) locate the root cause within top-K
```

That sentence is about solvers. The defect was three lines of JSON. The annotation had been written
with every reading filed against the pod -- `recommendation-service-0`, where a heap lives -- and one
flat request-rate series against the service, and the answer is `recommendation-service`. Both
baselines reported `absent` for the same reason a search for a misspelled word returns nothing, and
the report named the search rather than the spelling.

### The join nothing made

| half | what it says | where it lives |
| --- | --- | --- |
| the answer | `groundTruth.rootCauseComponent` | the case file |
| the candidates | `series[].service` | the signals file |
| the match | `one.service === answerName` | `classifyDisplacement`, and both baselines' key |

The two files are siblings, so no schema sees both; the schemas were right to say nothing. The
ranking's rule is exact equality, which is why the rule added here is exact equality too: a check
that resolved an alias through the graph would pass cases the scoring pipeline cannot read, which is
this defect one level up.

`fault/answer-presence.ts` is the join, asked where both halves are known, and it names the answer
and the names the file actually carries:

```
'history-resource-memory-leak-recommendation' names root cause component 'recommendation-service',
  and no series carries that name, so no ranking can place it; the series name recommendation-service-0
  -- a reading filed under a component the answer does not name is a reading no solver is scored on
```

### Acceptance

| what | before | after |
| --- | --- | --- |
| the corpus with the readings filed under the pod | `is not solvable by both baselines` | **2 problems**, the first naming the component and the one series name the file has |
| the corpus as repaired | 27 of 30, green | 27 of 30, green |
| `answer-presence.test.ts` | -- | **6 tests** |
| an alias accepted instead of a name | -- | refused, because the consumer refuses it (`'Recommendation'` against `recommendation`) |

**What this does not fix.** It does not make the corpus's naming rule *good*. It makes it *stated*.
A case still has to file at least one moving reading under its answer's exact name, and the reason is
that the ranking is a map keyed on that string. A better ranking would resolve the answer through
the graph and score a component's whole subtree; the corpus does not have that ranking, and a guard
that pretended it did would be describing a pipeline nobody runs.

---

## Finding 299 — one name per reading, so a partition has one viewpoint

The third case this round is a network partition, and a partition is the one fault whose evidence is
**two observations of the same quantity that disagree**: one side of the cluster sees three members,
the other sees three, and the truth is six. The signals file cannot say that:

```
'history-network-partition-search-cluster' declares two series named 'cluster_members_visible',
  so a reference to it names neither
```

That refusal is correct given what `signalRef` is. It is one string resolved against a map keyed on
the metric name, and the evaluator, the checkpoint comparison and the expansion all read that map --
so two series with one name would make every reference to it a coin toss, which the guard says out
loud rather than performing.

### What the case does instead, and what it costs

| what the ticket says | how it is expressed | what is lost |
| --- | --- | --- |
| each side sees three of six | one series, `cluster_members_visible = 3` | that there are two sides is prose |
| each side elected a leader | one counter, `+2` across the window | which side elected first is not expressible |
| one side returns deleted documents | one ratio, `stale_read_ratio = 0.35` | the other side's ratio is not expressible |

So the annotation is honest about its own limit and says so in the file, which is better than a
second series named `cluster_members_visible_side_b` that would have looked like a measurement and
been a naming convention. But the limit is real and it is a consequence of the resolution rule, not
of the fault: *"the same metric on two entities"* is the most ordinary shape in production telemetry
and this corpus cannot express it.

**What this does not fix.** Making `signalRef` resolve as `(entity, metric)` would touch the
expression evaluator, both baselines, the checkpoint comparison and all twenty-seven cases' names.
It is the right change and it is not this round's: the corpus would have to be migrated atomically,
and the round that does it should start from a case that needs it -- this one does.

---

## Finding 300 — three quarters of what a case declares about itself is prose

`fault.parameters` holds a case's own facts, and a reading may cite one with `{ parameter: 'name' }`
so that the number in the series and the number in the injection spec cannot drift apart (finding
258). The mechanism was built and then left alone. Measured this round:

```
check-fault-cases: parameters 23 of 88 (26 percent) declared across 27 case(s) are read by a series
  point or a configuration checkpoint; 65 are prose, in 27 case(s)
```

**Every one of the twenty-seven cases has at least one key nothing reads.** Some of those are
legitimately descriptive -- `service`, `from`, `to`, `trigger`, `container` -- written for a reader
and for a replay. Others are numbers that a reading restates by hand, which is exactly the drift the
mechanism exists to prevent:

| case | key | what it duplicates |
| --- | --- | --- |
| `network-loss-payment-gateway` | `lossPercent: 8` | `client_timeout_ratio.post = 0.08` |
| `middleware-replica-lag-analytics` | `lagSeconds` | the replica-lag reading in prose |
| `queue-watermark-ledger-writer` | `watermarkPercent: 92` | the broker watermark the ticket names |
| `config-datasource-url-orders` | `declaredValuePointsAt`, `staleValuePointsAt` | the two database names the chain uses |

The first row is repaired here: `client_timeout_ratio.post` is now `{ parameter: 'lossPercent' }`, and
the unit algebra converts `8 %` to `0.08 1`, so the two numbers are one number.

### Why a report rather than a rule

A rule would have to decide which keys are descriptive, and nothing in the file says. Two shapes were
considered and both were refused: refusing every unreferenced key would fail twenty-seven cases for
twenty-seven legitimate reasons, and allow-listing the descriptive names would encode today's list as
a law and refuse the next case's `node` or `pod`. So the count is printed on both exits, beside the
checkpoint counts, and the number is the argument.

### Acceptance

| what | before | after |
| --- | --- | --- |
| the reading | absent | `23 of 88 (26 percent)`, printed green and red |
| `lossPercent` | restated by hand as `0.08` | cited, converted by the unit table |
| keys removed rather than cited | **5** (`restartIntervalHours`, `clientTimeoutSeconds`, `replicas`, `sides`, `nodesPerSide`) | each was prose in a parameter; the fact is in the reason, where a reader looks |
| the remaining 65 | unmeasured | measured, and named as the next round's work |

**What this does not fix.** It does not stop a new case from adding another unreferenced key, because
nothing can tell a descriptive key from a forgotten one. It makes the corpus's own drift visible
every run, which is the most a report can do.

## Finding 301 — the gate is a command, and the push is a script that never runs it

Three revisions went up in v3.15. The second and third came back green on all six jobs. The first did
not:

```
05cd7a609  golden master / official metric / examples / documents   failure
05cd7a609  cold tree / no build / every precondition declared       failure
05cd7a609  build / typecheck / lint / coverage / mutation           failure
```

The log names two causes. `lint` exited 1, and `gate-sites.json` was stale against
`derive-gate-sites.mjs --check`:

```
× gate-sites.json > rule 1 · the committed file matches a fresh derivation > is byte-identical to what the deriver produces now
× gate-sites.json > scripts/derive-gate-sites.mjs · the deriver proves itself > passes --check against the committed file, and does not rewrite it
```

Both of those are steps `verify:local` runs, and the same tree fails them locally in under a minute.
**The gate was not weak. The gate was not asked.**

### Why it was not asked

Because there is nothing to ask it. `verify:local` prints a verdict to a terminal and writes nothing
down. The sentence exists in the scrollback of one session and nowhere else, so the only thing
standing between a red tree and a push is whether the person pushing happened to run it over *that*
tree.

The obvious repair -- a pre-push hook -- is the one this repository already believed it had, and it is
structurally unable to fire here. A hook is a property of `git push`. This repository does not publish
with `git push`: every push in its history went through `push_incremental.py`, which uploads blobs to
`POST /git/blobs` and moves `refs/heads/main` with a `PATCH`. Nothing under `.git/hooks` is consulted
for any of that. **The hook was not forgotten; it was never in the path.**

And the failure it allowed is the expensive kind. A red tip is visible and gets fixed. A red revision
in the middle of a three-commit push is invisible, and it is the one `git bisect` lands on -- blaming
the change *after* it for a fault that came from the change before.

### Why a receipt rather than running the gate in the pusher

The pusher could run the steps itself before uploading. That is the correct rule and the wrong
instrument: a full run spends about fifteen minutes of wall clock per revision, and the pusher exists
in the incremental form precisely because a push that takes too long is a push that gets killed -- a
killed push reports nothing, which is indistinguishable from a push that succeeded.

What the pusher needs is not the run. It is the *fact that the run happened, for this exact content*.
That fact is cheap to record and cheap to verify, and it cannot be updated by editing the tree
afterwards, because it is filed under the tree's own name:

| | |
| --- | --- |
| where | `.git/rca-bench-verified/<tree>.json`, one file per tree, never committed |
| written by | `verify:local`, on a green full run over a clean tree |
| read by | `require_receipt` in the pusher, before the first blob is uploaded |
| key | `git rev-parse HEAD^{tree}` -- content, not `HEAD` |

The key is the design. `HEAD` moves when a message is amended, so a receipt keyed on it would expire
for a reason that changes no bytes; a tree SHA moves exactly when the content moves, which is the
question being asked. Measured refusal, with the receipt absent:

```
refusing to push eb311d4: tree b7442537b carries no verify:local receipt
  (.git/rca-bench-verified/b7442537bbdc3b82f865c23475731ac77e7cf212.json).
  Run `pnpm verify:local` over that tree first. A subset run (--only) and a dirty
  working tree both withhold one, because neither names content that can be published.
```

### The three withholds, and the withdrawal

`receiptDecision` is a pure function in `scripts/gate-receipt.mjs`, not four lines inside the gate,
because `verify-local.mjs` is hollowed out by `verify-gates-are-testable.mjs` and no test may import
it. It answers one question -- does this run earn a receipt -- and withholds for three different
reasons, each stated in its own words:

| state | why a receipt would be a lie |
| --- | --- |
| dirty working tree | what ran is not in `HEAD`, so it is content that cannot be pushed at all |
| `--only` subset | `--only docs` proves the documentation guards and says nothing about coverage |
| not a checkout | there is no tree name to file it under |

A red run over content an earlier green run blessed **withdraws** the receipt. Two verdicts about
identical bytes cannot both stand, and the later one is the one that stands; the alternative --
leaving the old receipt in place -- would let a nondeterministic step pass a tree that just failed.

### The price, stated

A receipt is per tree, and a tree is per revision. So a round that pushes three revisions has to gate
three times. That is not a bug in the mechanism, it is the mechanism working: **a revision nobody
verified is a revision nobody should publish.** The practice this pass adopts is one revision per
round -- which is what a round is -- and a second revision only when it has earned its own gate run.

### Proving the tests can fail

Three mutations of the module, one at a time, each restored before the next:

| mutation | red |
| --- | --- |
| `receiptDecision` issues on a subset run (`if (!full)` → `if (false)`) | `withholds on a subset run, because a receipt says the gate ran` |
| `readReceipt` accepts a receipt filed under another tree | `refuses a receipt copied from another tree, because the name is the whole claim` |
| `verifiedTree` reports a dirty tree as clean | `refuses a dirty tree, because what ran is content that cannot be pushed` |

Each mutation kills exactly one of the eighteen tests and no others, so each test is a claim about
one rule rather than a claim about the file.

### Acceptance

| what | before | after |
| --- | --- | --- |
| the verdict | a sentence in a terminal | a sentence **and** a file under `.git`, keyed on the tree |
| a push of an unverified tree | accepted silently | refused before one blob is uploaded |
| three withhold reasons | -- | dirty, subset, no checkout, each with its own sentence |
| a green run then a red run, same tree | both verdicts coexist in scrollback | the receipt is withdrawn |
| tests | -- | **18**, three of them proved to fail by mutation |

**What this does not fix.** The receipt's only consumer is the pusher, which is not in this
repository, so no test here holds writer and reader together: a push path that ignores the file looks,
from inside the tree, exactly like one that reads it. What is proved is the file -- its key, its
shape, and the states that refuse to produce one. The last link is a three-line precondition in a
script this repository does not own, and it is written down rather than assumed.

## Finding 302 — the coverage count loses its error-detecting power at the target it measures

Thirty samples, thirty cases. The guard prints:

```
OK (30 of 30 sample(s) carry a four-layer case; ... floor 30)
```

Both numbers are right. What no rule checked is whether they are counting the same thing. The
numerator is `index.cases.length` — how many entries the index has. The denominator is the number of
samples in the extraction key. An entry names its sample with `sampleId`, and the guard resolved that
id against the key, so a typo was refused; nothing asked whether two entries named the **same**
sample. The sentence was therefore true only while every author happened to pick a distinct id.

### The same defect, opposite symptoms, at the two ends of the schedule

| entries | what a duplicated `sampleId` does | what a reader sees |
| --- | --- | --- |
| 27 of 30 | one sample is annotated twice, one is skipped, the count stays 27 | a numerator visibly short of the denominator — something is still open |
| 30 of 30 | one sample is annotated twice, **one is never annotated** | `30 of 30` — the arithmetic has stopped carrying information |

The second row is the milestone this corpus reached in v3.17, and the two counts agree **by
construction** there: thirty entries, thirty samples. A copy-paste that duplicates an id leaves one
sample unannotated while the report says the annotation is finished. **A progress counter stops being
able to fail at exactly the moment it is asked whether the work is done.**

That is not a mistake in the counter. It is what a pair of independent totals does, and the repair is
to compare the sets rather than the totals.

### The rule

`fault/sample-coverage.ts` answers the question the totals cannot. It is a module rather than four
lines in the loop for the reason `answer-presence` is: the rule states shapes — one duplicate, two,
three; a gap with the index short of the set and a gap with it level — and a script's private `if` can
only be exercised by editing the corpus.

| arm | when it fires | why it is conditional |
| --- | --- | --- |
| a sample annotated more than once | always | a second case for a sample the corpus already carries is an annotation of nothing, whether the schedule is finished or not |
| a sample nobody annotates | only when `entries.length >= samples` | before that, a gap **is** the schedule: at twenty of thirty, ten samples have no case because ten rounds have not happened, and failing every round until the target teaches everyone to skip the line |

Measured, by mutating one entry's `sampleId` to the previous one's:

```
'history-dependency-version-incompatibility-shipping' and
'history-runtime-container-start-notification-worker' annotate sample
'dependency-version-incompatibility-shipping', which is one sample covered twice: ...

no case annotates sample 'runtime-container-start-notification-worker', and the index is as long as
the sample set, so the count that says every sample is covered is counting entries rather than samples
```

The second sentence names the sample the index silently dropped. Without it the first sentence says
"a duplicate exists" and leaves the reader to work out which annotation is now missing.

### What the rule found in the harness

Its first run failed three tests, all of them in `check-fault-cases.test.ts`, and the failure was
correct. `corpusOf(count, difficulty)` builds a fixture from **ten copies of one real annotation**,
and every copy carried `sampleId: 'resource-cpu-saturation-checkout'` — ten annotations of one
sample, which is the shape the rule refuses.

The fixture is right and the rule is right; what was missing is that a corpus may bring its own
extraction key. `corpusOf` now writes one, with an id per copy and the same incident text, and the
test harness passes it with `--samples`. The key lives **beside** the directory rather than inside
it, because the guard refuses any `.json` in a corpus directory that the index does not name — and a
sample key is not a case. That rule was right too, so the convention is a sibling path rather than an
exception in the guard.

### Acceptance

| what | before | after |
| --- | --- | --- |
| `30 of 30` with one duplicated id | printed, and believed | refused, naming both cases |
| the sample left behind by a duplicate | invisible | named |
| a gap while the corpus is still growing | — | silent, because that is the schedule |
| tests | — | **7**, over one duplicate, three duplicates, one gap, an empty index and a duplicate beyond the set |

---

## Finding 303 — a 5117-millisecond failure, and a hard-coded signal

The full suite failed once, on one test:

```
× one step, run as CI would run it > forwards a signal to the step, and then dies of it
  rather than swallowing it 5117ms
```

5117 is five seconds and a scheduling margin, and the only five-second budget in that test is the
second wait:

```ts
until(() => !stillRunning(pid, identity), 5_000)
```

So the runner died of its signal and the **grandchild outlived it** — the exact failure the test
exists to catch, once, under the load of eight concurrent vitest workers.

### What was tried, and what it cost

| attempt | runs | failures |
| --- | --- | --- |
| the file alone | 5 | 0 |
| the file alone, with eight busy loops on eight cores | 12 | 0 |
| the same scenario driven directly, sixty iterations | 60 | 0 |

Seventy-seven runs and no reproduction. The step's own script was reproduced exactly — `echo started`,
`sleep 30 &`, `echo $!`, `sleep 30` — and the driver checked `/proc/<pid>/stat` for the corpse states
the test checks. Nothing survived, and the pid file was never read while empty.

**So this finding does not claim a root cause.** What it does is record two facts about that path that
are certain, and one of them was a defect.

### The one that was a defect: the group was always sent `SIGTERM`

The handler's own comment says it forwards *"the operator's interrupt"*. The code said:

```js
const forward = (signal) => () => {
  signalGroup('SIGTERM');   // both handlers
  ...
  process.kill(process.pid, signal);
};
const onInterrupt = forward('SIGINT');
const onTerminate = forward('SIGTERM');
```

The runner died of the signal it received and **the step was always told `SIGTERM`**. `TERM` and `INT`
are not interchangeable: `TERM` says stop when you can, `INT` says a person at the terminal stopped
you. A step that traps `INT` to flush its work never ran that trap, and a supervisor that sent `INT`
got a step reporting `TERM`.

The test came first and was red before the change — it asserts the shape rather than the verdict:

```ts
expect(existsSync(intFile), 'the group was sent SIGTERM after the runner received SIGINT').toBe(true);
expect(existsSync(termFile), 'the group was sent SIGTERM as well as SIGINT').toBe(false);
```

The step installs both traps, writes which one fired, and exits, so nothing is left looping after the
assertion. One line changed. **This is not an explanation of the 5117 ms**: `sleep` dies of either
signal, which is why the minimal reproduction survived sixty iterations with the old code.

### The one that is not a defect, but is not what its comment says either

```js
/** Last resort: whatever is left when this process ends anyway. */
const sweep = () => signalGroup('SIGKILL');
process.on('exit', sweep);
```

Node does not emit `exit` when a process is terminated **by a signal** — only on `process.exit()` or
an empty event loop. So the handler described as the last resort does not run on the path where a
process is killed, which is the path that leaves orphans behind.

It is left as it is, and the reason is written down rather than acted on: `forward` already sends the
group the signal the runner received, and the runner then dies of it. A `sweep` that fired *before*
the re-raise would replace the grace period the timeout path deliberately has with an immediate
`SIGKILL`, which is a worse behaviour in exchange for a case nobody has observed. What the comment
claims is not what the code does, and that sentence is now the defect.

### Acceptance

| what | before | after |
| --- | --- | --- |
| `SIGINT` to the runner | the step received `SIGTERM` | the step receives `SIGINT` |
| a step that traps `INT` to flush | trap never ran | trap runs |
| tests | — | **+1**, red before the change and green after |
| the 5117 ms failure | — | **recorded, not explained**, with 77 runs of evidence |

---

## Finding 304 — a fallback the type system demands and no input can reach

`fault/sample-coverage.ts` was written, tested with seven cases, and measured at **81.25 % of
branches** — under the 95 % per-file floor, so the run failed. Three arms were unreported, and only
one of them was a missing test.

| line | arm | reachable? |
| --- | --- | --- |
| `quoted[quoted.length - 1] ?? ''` | the `?? ''` fallback | **no**: a non-empty list has a last element |
| `coveredBy.get(sampleId) ?? []` | the `?? []` fallback | **no**: the key came from that same map |
| `missing.length === 1 ? 'sample' : 'samples'` | the plural | **yes**, and nothing tested two gaps |

`packages/core/tsconfig.json` inherits `noUncheckedIndexedAccess: true`, so `array[index]` is
`T | undefined` and the two fallbacks are what the compiler requires. They are also **wrong as
code**: a branch no input can take is dead in the sense this volume has spent several rounds
removing — `v8 ignore` comments and `if (false)` arms written to satisfy a checker.

### The repair is a spelling, not a test

```ts
// before: an index, which the compiler widens to `string | undefined`
`${quoted.slice(0, -1).join(', ')} and ${quoted[quoted.length - 1] ?? ''}`

// after: a slice, which is a string
`${quoted.slice(0, -1).join(', ')} and ${quoted.slice(-1).join('')}`
```

and for the map, read the entries once instead of iterating the keys and looking each value up:

```ts
const duplicated = [...coveredBy.entries()]
  .filter(([, ids]) => ids.length > 1)
  .sort((left, right) => left[0].localeCompare(right[0]));
```

Two spellings, no behaviour change, **81.25 % → 92.3 %**, and the remaining gap was the plural,
which is a real one and got a test rather than a rewrite.

### Why this is a finding rather than a style note

Because the metric could not tell the two gaps apart. A branch that no input reaches and a branch
that an input reaches and no test supplies both appear as one uncovered arm in the same column of
the same table. The first is repaired by changing the code and the second by adding a test, and
**choosing wrong is silent**: a test written for the `?? ''` fallback would assert that an empty
string comes back, which is a statement about a line that can never run. The suite would go green
and the file would gain a claim about nothing.

That is the same defect this volume keeps meeting from the other side — a gate that cannot fail, a
count that cannot disagree — with the sign flipped: here the **measurement** is fine and the
**reading** of it is wrong.

### Acceptance

| what | before | after |
| --- | --- | --- |
| branches in `sample-coverage.ts` | 81.25 % (three arms) | **100 %** |
| two of the three arms | unreachable fallbacks, counted as untested | removed by a change of spelling |
| the third | reachable and untested | tested, with the plural named |
| tests | 7 | **9** |

## Finding 305 — three counts published side by side, and the one relation between them never computed

The last gate run of this round failed at step 6 of 31, on the one check that compares the published
suite counts to a `vitest` report:

```
core   published 199 files / 4894 tests
       measured  198 files / 4894 tests
```

The 199 was **typed, not measured**. The pass that wrote it counted
`packages/core/test/**/*.test.ts` by hand and came out one file high; the two totals beside it
(`cli` 4, `repo` 202) were right.

### Why four guards read those numbers and none of them added them

| guard | what it compares |
| --- | --- |
| `check-doc-counts.mjs` rules 1 and 2 | a document's row to the vocabulary of scopes, and a row to the row above it |
| `check-doc-counts.mjs` rule 3 | a row marked current to `golden-master/doc-counts.json` |
| `check-doc-counts.mjs` rule 4 | a shape it cannot read to the exemption table |
| `measure-doc-counts.mjs --check --from <report>` | `doc-counts.json` to the run that produced the report |

The first four hold a **document** to the declaration. The fifth holds the declaration to a **run**,
and it needs two JSON reports, which only `verify:local` has -- so it is the step that stops being
run when the round is long, and it is exactly the step that was.

So the committed table read

```
core 199 files  +  cli 4 files  =  203
                        repo says  202
```

**A one-file disagreement between three numbers printed in one table, arithmetically visible to any
reader who added them, and no gate added them.** This is Finding 302 one level up: two counts, each
true of its own scope, and nothing comparing them. Round 302 was two *totals* over the same set;
this is two *parts* of one total. The family is the same, and it keeps appearing because a count is
cheap to publish and a relation is expensive to state.

### The repair

`scripts/doc-count-additivity.mjs`: a pure function over the measurement.

```js
export const ADDITIVE_SCOPES = { parts: ['core', 'cli'], whole: 'repo' };

export function checkCountAdditivity(measured, relation = ADDITIVE_SCOPES) { ... }
```

| decision | taken | why not the alternative |
| --- | --- | --- |
| where the rule lives | a `data` module under `scripts/`, **plain JavaScript** | it is called from a gate, and `check-doc-counts.mjs` runs in the cold-tree job, which has no build, so it may not import from `packages/core/dist` |
| a partial measurement | **silent** | `--measured` exists so a caller can hand in the scope it is talking about; several tests hand in one. A gap is reported by rule 3, which refuses a current-state row whose scope has no measurement |
| one problem or one per unit | **one per unit** | a mistyped file count and a stale test count are two different mistakes in two different files |
| the magnitude or the sign | **the sign** | `+1` says a part gained a file, `-8` says one lost eight tests |
| the wiring | `for (const problem of ...) problems.push(problem)` | `problems.push(...checkCountAdditivity(measured))` was the first draft and the spread guard refused it: every `push(...x)` whose length is a function of its input is a candidate for the argument limit, and an exemption for an array bounded at two would weaken the guard to save one line |

**12 tests**: 10 on the rule (`doc-count-additivity.test.ts`) and 2 on the wiring
(`check-doc-counts.test.ts`), the second of which asserts that the measurement that ships **does
add up** -- a rule that fires on its own file is a rule everyone learns to exempt.

### Correcting the number was not a one-line edit, and that is the interesting part

The measurement refuses to run while the suite is red, and the suite was red *because* a test
asserts that the number of test files the scan reads equals the published repo count minus one. So
the loop is closed:

| step | state |
| --- | --- |
| fix the 199 by hand | the suite is still red: one file was added this round, so `repo` is 203 now |
| retake the measurement | refused: a red run has no counts to publish |
| add the missing test file to the count | that is a published claim about a run that has not happened yet |

It was broken by reading the totals off a full run (`Test Files 1 failed | 198 passed (199)`,
`Tests 1 failed | 4905 passed (4906)`), writing those into the declaration and the row, and then
running `--write-doc` -- which re-measured and reported **`core 199 files, 4906 tests` … `no row
needed changing`**. A number that a tool cannot correct has to be corrected by a measurement and
then *confirmed* by the tool; writing it and hoping is what produced the 199.

### A second five-second budget, exceeded under load

The same `--write-doc` run reported `event loop · the hook fails the file that blocked it` at
**5056 ms**, with every test in that file passing when it was run alone three times afterwards. It
is the second sighting this round of a five-second budget exceeded by a machine rather than by the
code (Finding 303's 5117 ms was the first), and neither is reproduced alone. Recorded, not
explained: two sightings of the same shape is a pattern, and a pattern is not yet a cause.

### Acceptance

| what | before | after |
| --- | --- | --- |
| `core` files in `doc-counts.json` | 199, typed | **199, measured** (198 before the new test file) |
| `core + cli == repo` | true of nothing; nothing computed it | **computed on every `docs:check`** |
| guards that can see it | 0 of 4 | **1**, inside the guard that already reads the file |
| tests | -- | **12** (10 rule, 2 wiring) |
| first reachable state on the shipped file | the table was inconsistent | `no row needed changing` |

## Finding 306 — one sentence, two columns, and a factor of a thousand

`export/rcaeval.ts` wrote every instant in `logs.csv` **1000x too small**, on every case, in both
suites that ship a log file. The line was

```ts
/**
 * An instant as Unix **microseconds**, which is the unit both corpora's
 * `timestamp` and `startTime` columns use.
 */
function epochMicros(iso: string): string {
  return String(Date.parse(iso) * 1000);
}
```

and the docblock is the defect. It names two columns -- `logs.csv`'s `timestamp` and
`traces.csv`'s `startTime` -- and it is true of one of them.

### Measured, per file, from both archives

| column | `RE2-OB/checkoutservice_cpu/1` | `RE3-OB/emailservice_f1/1` | digits | unit |
| --- | --- | --- | --- | --- |
| `traces.startTimeMillis` | `1705353846065` | `1731910960029` | 13 | milliseconds |
| `traces.startTime` | `1705353846065999` | `1731910960029548` | 16 | microseconds |
| `logs.timestamp` | `1705353846067349596` | `1731910960181130857` | 19 | **nanoseconds** |

Nineteen digits is not a rounding difference: the IR's instants have millisecond precision, so the
microsecond column always ends in three zeros and the nanosecond column in six. Both corpora are
internally consistent -- `time` is `HH:MM` of the same instant in every file -- so the two archives
agree with each other and disagree with this module.

### Why nothing caught it

Four things read that column and none of them could see a scale:

| reader | what it checks |
| --- | --- |
| `checkRcaEvalStructure` | that the eleven / nine / six column *names* are present |
| `RCAEVAL_UNFILLED_COLUMNS`' test | that named columns are empty and unnamed ones are not |
| `export.test.ts`, "converts the units" | that `rowOf(logs, 'timestamp')` equals `Date.parse(...) * 1000` |
| the round trip | that a case scores, and `oracle` never reads `logs.csv` |

The third of those is the interesting one. It **did** check the value, and it asserted exactly what
the code produced, because it was written in the same pass and from the same sentence. A test and an
implementation that share a belief are one statement, not two, and the shape of the resulting green
is indistinguishable from a green where the belief was true.

This is finding 302's family again, one more subject over: two counts, each true of its own scope,
with nothing comparing them. There, two *totals* over one set; then two *parts* of one total; here
two *columns* in one sentence. The cost of stating a relation is what keeps producing it.

### The repair

`RCAEVAL_INSTANT_COLUMNS` -- one row per **column**, not per file, because the two archives disagree
at that granularity: `traces.csv` holds milliseconds and microseconds in the same row, and `logs.csv`
holds nanoseconds in the column whose name it shares with the microsecond one.

```ts
export const RCAEVAL_INSTANT_COLUMNS = {
  'traces.startTimeMillis': { unit: 'ms', perSecond: 1 },
  'traces.startTime': { unit: 'us', perSecond: 1_000 },
  'logs.timestamp': { unit: 'ns', perSecond: 1_000_000 },
} as const;
```

`instantCell` is the only reader, so the claim and the value cannot drift apart, and the table is
exported so the documentation guard can hold the published unit to it.

One thing the fix turned up on the way: `String(Date.parse(iso) * 1e6)` is not exact. Nanoseconds
since the epoch need 61 bits and a `number` carries 53, so the printed digits are the shortest
representation of a *neighbouring* double. It happens to round-trip for every value the IR can hold,
and "happens to" is not a unit, so the multiplication is `BigInt`.

### Acceptance

| what | before | after |
| --- | --- | --- |
| `logs.csv`'s `timestamp` for `2024-01-15T21:24:06.067Z` | `1705353846067000` (16 digits) | `1705353846067000000` (19) |
| a claim about a unit | one sentence covering two columns in two files | one table row per column |
| tests that fail if the unit regresses | 0 | 2 (the value, and the digit width beside it) |
| tests that changed | -- | 1 rewritten, 1 added; `export.test.ts` 70 → 72 |
| the published claim in `docs/targets/rcaeval.md` | "`timestamp`/`startTime` are Unix **microseconds**" | stated per column, with the digits |

## Finding 307 — three sentences about three files, and nobody had opened one

`docs/targets/rcaeval.md` published this, for four rounds:

```text
logts.csv      # RE2, pre-aggregated event counts
tracets_lat.csv  # per-endpoint request counts, one row a minute
| units | `timestamp`/`startTime` are Unix microseconds |
```

Every clause is wrong, and the wrongness has one cause: none of the three files had ever been read.
This round read them, out of `RE2-OB.zip` by range request (three inflations of 1229, 2844 and 525
compressed bytes, against a 1.19 GB archive), together with the same case's `logs.csv` (23 515 107
bytes), `traces.csv` (71 632 229 bytes) and `cluster_info.json`.

### What the three tables are

| table | columns | grid | values |
| --- | --- | --- | --- |
| `logts.csv` | 30, `<container>_<key>` where `key` is a map key of `cluster_info.json`, ordered by the key **as an integer** | 97 rows, step **15 s**, dense | integers, max 501 |
| `tracets_lat.csv` | 17, `<callee>_<method>`, in **first-appearance order** in `traces.csv` | the same 97 rows | integers, max 54 |
| `tracets_err.csv` | the same 17, name for name and order for order | the same 97 rows | floats, every one `0.0` |

"One row a minute" is off by a factor of four. 1705353840 is a multiple of 15, so the bucket is
`floor(t / 15) * 15` on an absolute grid rather than an offset from the first sample. And "log counts
per pod" is not what the columns are: they are *clusters*, which is why `cluster_info.json` is in the
same directory and why its `template` strings appear verbatim in `logs.csv`'s `log_template` column.

### One of the three is a reducton, and it is exact

Reducing `logs.csv` with `cluster_info.json` reproduces `logts.csv` **cell for cell**:

```
97 row(s) x 30 column(s) = 2910 cell(s), all equal
20 log row(s) match no cluster and appear in no column
check-aggregate-tables: OK (1 case(s), 2910 cell(s) reduced from logs.csv and equal to the corpus's own logts.csv)
```

Twenty `redis` rows carry an empty `log_template` and belong to no cluster; the corpus drops them and
so does the reduction, and the grid still spans their instants.

So that table is now `export/rcaeval-logts.ts` plus `scripts/check-aggregate-tables.mjs`, and the
second runs in `official-data.yml` against whatever corpus was fetched.

### The other two are not, and the refutation is the deliverable

The natural next guess was that they come from `traces.csv`, and eight candidate reductions were
tried against the same case: span count, distinct trace id count, server-side span count,
client-side span count, server-side distinct trace ids, the p50/p90/p95/p99 of the span duration in
milliseconds, the maximum duration, and -- for the error column -- error-status counts and ratios.

| candidate | cells equal, of 1649 |
| --- | --- |
| every one of the eight | **0** |

And no single scale factor rescues them: the ratio between the corpus's value and the count it could
plausibly be ranges over **a factor of 61** within one column, so the disagreement is not a unit.

`tracets_err.csv` cannot even be interrogated: every published value is `0.0` because no span in that
case's trace file carries an error status, which is why its own column is serialised as a float while
`tracets_lat.csv`'s is an integer -- a difference the documentation never mentioned and which is the
only clue the file gives about what the two columns mean.

### What this changes

| claim | before | after |
| --- | --- | --- |
| the grid | "one row a minute" | 97 rows per case, step 15 s, dense, absolute boundaries |
| `logts.csv`'s columns | "per pod" | per `cluster_info.json` key, `<container>_<key>`, integer order |
| `logts.csv`'s provenance | unstated | exact: `logs.csv` + `cluster_info.json`, 2910/2910 |
| `tracets_*`'s provenance | unstated | refuted: 8 candidates, 0/1649, ratio spread 61x |
| RE3 | "RE3 只带 metric" | RE3 ships `logs.csv` and `traces.csv` and **none** of the three aggregates |
| who checks it | nobody | `check-aggregate-tables.mjs`, in `official-data.yml`, refusing an anchor with nothing to check |

`golden-master/rcaeval-aggregates.json` is the measurement, and `rcaeval-aggregates.test.ts` does the
arithmetic between its three rows: each table's row count has to follow from its own interval,
its cell count from its own shape, all three have to agree on the grid, and each unit has to agree
with `RCAEVAL_INSTANT_COLUMNS` -- because a spec that is an independent copy of a fact in source is
two facts, one of which is stale.

### What it does not do

It does not make this repository emit the trace aggregates. Their input is not in the archive, and a
writer whose output no corpus can be compared against is a writer that produces a plausible file --
which is the failure this campaign exists to prevent. P4's third item is therefore closed as a
*measurement* rather than as an emission: one of the three tables is now produced and checked, two
are refused with the work that refused them.

## Finding 308 — the third five-second budget, and the first one with a mechanism

The coverage run of this round failed one test, and the failure was not an assertion:

```
FAIL  test/injection-write-discipline.test.ts > the atomic helper is correct on its own
      > replaces content and removes its temporary file
      × 12178ms
      → Test timed out in 5000ms.
```

Every assertion in it had been satisfied. The test runs a Python helper, and it ran it with `spawnSync`:

```ts
const result = spawnSync('python3', ['-c', program], { encoding: 'utf8' });
```

Findings 303 and 305 recorded the same signature -- a five-second budget missed by a few hundred
milliseconds, not reproduced alone -- and both were left unexplained on the grounds that no mechanism
had been demonstrated. This one is different in exactly one respect: the mechanism is visible in the
source, and it is the one finding 195 already named for a different file. **A synchronous spawn makes
the whole test one blocking call.** Nothing runs while Python starts, so the test's duration is the
machine's, and the machine is running eight workers under coverage instrumentation.

### Why "raise the timeout" is not the whole repair, and "retry" is not a repair at all

| move | verdict |
| --- | --- |
| retry until green | refused -- it converts a budget into a coin, and the user-visible property ("the helper writes atomically") is never what failed |
| raise the timeout and leave `spawnSync` | insufficient -- it hides the blocking, and the stall gauge exists precisely because blocking is the thing this repository measures |
| await the spawn, then state a bound larger than a process launch | **taken** |
| delete the test | refused -- it is the only thing that runs the Python helper at all |

So both halves were done: `spawnSync` became an awaited `spawn`, and the three tests that run an
interpreter carry `SUBPROCESS_TIMEOUT_MS = 60_000`. The number is stated where it is used, with the
reason: their duration is the interpreter's, and the five-second default is a budget for work the
test itself does.

**No assertion moved.** The three tests still fail on a wrong answer, a non-zero exit, and a stray
`__pycache__` in the tree; what they no longer do is fail because the runner was busy.

### The second member, found by running the command that kept finding it

Half an hour later the same family produced a **reproduction**, and it arrived as an ordinary failure
rather than as an orphan:

```
FAIL  test/stall-budget.test.ts > event loop · the hook fails the file that blocked it
      > passes the same wall time when the child is awaited
      × 5005ms
      → Test timed out in 5000ms.
```

That is finding 305's `5056 ms` sighting. It was recorded as a machine-sized budget exceeded under a
concurrent suite, with every test in the file green when run alone three times -- and the reason it
only appeared in `measure-doc-counts` is the reason it is now explained: **that command runs the whole
suite from inside a suite.** The two cases in that `describe` verify the stall gauge by launching a
nested `vitest` in a temporary project and reading its exit code and output. Their duration belongs to
that child, and vitest's five-second default is a budget for work the test itself does.

| what was believed | what was measured |
| --- | --- |
| "a rare orphan, indistinguishable from a scheduling delay" | reproducible in one command, at 5 005 ms, every time that command runs the suite |
| "the fix here would not have prevented it" | the same fix does: the child's duration is not the test's work |
| "no mechanism can be named" | the mechanism is in the file: `runSuite()` starts `vitest.mjs` |

`NESTED_RUNNER_TIMEOUT_MS = 150_000` now covers both cases, above the 120 000 ms bound the child
already carries so that the child's timeout speaks first. No assertion moved, exactly as above.

### What this leaves open

**5117 ms on the signal test is still unexplained**, and this finding does not close it: that one is
not a synchronous spawn and does not launch a runner. The value of the second member is comparative --
the family now has one member with no cause instead of two, and the two that were explained were both
explained by the same question: *whose duration is this test's duration?*

### Acceptance

| what | before | after |
| --- | --- | --- |
| synchronous interpreter spawns in `injection-write-discipline.test.ts` | 3 | **0** |
| the bound those three tests run under | vitest's default 5 000 ms | **60 000 ms**, stated with its reason |
| assertions changed | -- | **0** |
| the file's own duration, alone | 12 178 ms (the one that timed out) | 253 ms |

## Finding 309 — the chapter that ended after the chapter that followed it

v3.18 was written by inserting a new `## v3.18` section into `docs/progress/volume-07.md` at the first
`### Readings` heading below v3.17's title. That heading belongs to v3.17, and inserting **at** it
leaves it where it is: the new chapter opened above the block, and the block stayed below the new
chapter. The result was a file in which

| the round | what it held |
| --- | --- |
| `v3.17` | title, five sections of body, and **no** ledger |
| `v3.18` | its own `### Readings`, `### Left open`, `### Unchanged` — and then a second set of all three |

Every byte of both rounds was present, in file order, and `pnpm docs:check` was green: fourteen guards,
`check-progress-volumes` printing `OK — 7 volume(s), 166 round(s)`, `check-open-list` reading both lists
because it reads **every** `### Left open` it finds. The defect was not a missing section or a
misordered one. It was a section filed under the wrong title, which is the one thing a rule about file
boundaries cannot see.

### Why the numbers matter more than the boundary

The block that slid is not prose. It is v3.17's ledger, and it published **v3.18's** measurements:

| row | published under v3.17 | whose number it was |
| --- | --- | --- |
| the suite | `+5 files, +60 tests in core (202 / 4941)` | v3.18's tree, after v3.18's three files |
| `docs:check` | `audit 1–307, 304 findings` | v3.18's audit index |

So a reader of v3.17 was told that the round which closed P1 ended with a tree it had never seen. This
is the family this campaign keeps finding, one level up from the numbers: **a statement is cheap to
place and expensive to attribute**, and nothing in the tree was asking which round a table belonged to.

### The two rules, and the half each one covers

`scripts/progress-volumes.mjs` gained, beside the five rules it already had:

| rule | what it refuses | what it would have caught here |
| --- | --- | --- |
| a round holds **at most one** of `### Readings`, `### Left open`, `### Unchanged` | a second ledger inside one title | v3.18 holding 2 and 2 |
| once a round carries `### Readings`, the round **after** it carries one too | a round with no ledger after the convention began | v3.17 holding none, since v3.16 does |

The second rule is a **chain** rather than a list of version numbers: which round the convention began
at is a fact the volume itself holds, and pinning `v3.13` in the source would be a literal that rots —
finding 202's lesson, applied before it could be learned again. Measured over the whole log: 6 rounds
carry `### Readings` and 160 do not, no round carries two of anything, and the Pass-era rounds and the
`v2.xx` rounds are exempt by construction rather than by an exemption table.

Both rules count headings **outside fences**, because a round may quote the shape it is describing
(`v2.26` quotes four headings that are not headings), and a quotation counted as a section would make
the guard refuse the round that documents the grammar.

### Proved on the real document, not only on a fixture

A copy of the live volume was edited back into the old shape — v3.17's block moved to the end of the
file — and the gate run against it:

```
volume-07.md: `## v3.18 — a unit that was true of one file and false of the other` holds 2 `### Readings` sections
  -- a round closes itself once, and the second one belongs to the round that was inserted before it (finding 309)
volume-07.md: `## v3.18 — …` holds 2 `### Left open` sections
```

`FAILED`, exit 1. The fixtures in `progress-volumes.test.ts` cover the same two rules from four
directions: the doubled section, the missing one, the rounds before the convention began, and the
quoted one inside a fence.

### Acceptance

| what | before | after |
| --- | --- | --- |
| `### Readings` in v3.17 | 0 | **1** |
| `### Readings` / `### Left open` / `### Unchanged` in v3.18 | 2 / 2 / 2 | **1 / 1 / 1** |
| rounds in the log with more than one closing section | 1 (unseen) | **0**, refused by two rules |
| the v3.17 ledger's suite row | `+5 files, +60 tests (202 / 4941)` | **`+2 files, +25 tests (199 / 4906)`** |
| the v3.17 ledger's audit row | `1–307, 304 findings` | **`1–305, 302 findings`** |
| the old shape replayed on a copy of the live volume | -- | **FAILED, exit 1**, naming finding 309 |

### What these rules cannot do

They read **presence**, not ownership. Two rounds whose ledgers are swapped — each holding exactly one,
each well-formed — pass both rules, and the first rule's message ("belongs to the round that was
inserted before it") is an explanation of the shape that was seen rather than a general diagnosis.
Checking ownership would mean re-deriving each round's numbers from the tree as it stood in that round,
which is a git checkout per round and a question this repository has no way to answer for a round that
was never committed.

The other half is stated rather than repaired: the numbers inside a ledger are checked by
`measure-doc-counts --check` **for the newest round only**, because that is the only round whose
measurement can be taken. A ledger that slid into another round is invisible to it, and the file's own
structure was the only place the question could have been asked.

## Finding 310 — a commit staged while a battery held the tree

`git add -A` stages what the working tree holds, and a verification session here **mutates the working
tree on purpose**: the injection batteries rewrite a guard, run the suite, and put the bytes back in a
`finally`. `tree-repair.mjs` exists because a killed run leaves the rewrite behind, and it repairs the
tree at the start of the next session.

This round found the third case, and it is neither of those two. A full `verify:local` was running in
one process; a commit was staged in another. At the moment of `git add -A` the battery held
`packages/core/src/ingest/jaeger.ts` with its process-table fallback rewritten:

```ts
  const tableName = table?.['serviceName'];
- return typeof tableName === 'string' && tableName !== '' ? tableName : undefined;
+ return undefined;
```

The commit that closed four findings therefore **published a mutation**, and the tree was restored
minutes later by the session that had made it. In between, `git status` was clean -- it reports the
difference between the tree and the index, not between the tree and what the tree was meant to be.

### Why the existing repair did not cover it

| mechanism | what it protects | why it missed |
| --- | --- | --- |
| `_witnesses.py`'s `finally` | a battery that finishes | this battery was still running |
| `tree-repair.mjs` at session start | a session that starts over a killed run's leftovers | it repairs *before* the plan, and the staging happened *during* it |
| the gate receipt | a push claiming a verdict it did not earn | correct but not binding here: the run was red for an unrelated reason (`site/assets/data.js` stale), so no receipt was issued at all |
| the suite itself | a wrong tree | the suite was never run against the staged tree; it was run against the mutated one, by the battery, and against the restored one afterwards |

The one mechanism that **would** have caught it is not built: a pre-commit refusal while a battery
holds a witness journal. The journal is on disk, `_witnesses.py` already knows how to detect it, and
`tree-repair.mjs` already turns it into a verdict at the start of a session -- so the ingredient is
present and only the reader at the commit boundary is missing.

That is stated here rather than implied: **the repair is named and not built in this round**, and it
is in `Left open` with the shape it should have.

### What was measured, and what was merely claimed

| claim | measurement |
| --- | --- |
| the fallback was gone | `git show HEAD:packages/core/src/ingest/jaeger.ts` → `return undefined;`, against `git show e56f957:...` → the ternary |
| it came back | the restored line is in the next commit, and `pnpm typecheck` and the suite are green over it |
| `git status` was clean at the time | it was: the file matched the index because the **index** had taken the mutation too |
| no other file was swept | the working tree now equals `HEAD` except the three files the restore commit names |

## Finding 311 — `git status` compares two of the three things, and the one it leaves out is the one a commit keeps

Finding 310 named the repair as **"a pre-commit refusal while a witness journal exists"** and did not
build it. This round built it, and building it changed it, because the sentence as written refuses the
two states in which a commit publishes nothing:

| state | journal | index | publishes a mutation? |
| --- | --- | --- | --- |
| a battery is measuring and has not mutated yet | on disk | the file's bytes | **no** |
| a battery finished and restored, but its record still settles | on disk | the file's bytes | **no** |
| a battery holds a mutation and `git add -A` ran | on disk | **the mutation** | **yes** |

The first two are not corner cases: thirteen batteries run 30 to 350 seconds each, and a guard that
refused a commit for that whole window would be turned off inside a day. The way it would be turned off
is `--no-verify`, which is the one bypass the guard cannot see.

So the guard asks the third row's question and only that one. Three things are in play, and `git status`
reads exactly two of them:

| what | how it is named |
| --- | --- |
| the working tree | bytes |
| the index | blob ids, from `git ls-files -s` |
| what the tree was **meant** to hold | the journal a battery writes before its first mutation |

`git status` compares the first two. `tree-repair.mjs` compares the third against the first, at the start
of a session. The pair nothing read is **the index against the record**, and the index is the only one of
the three that a commit publishes. That is why `git status` was clean through the whole event: it was not
blind, it was answering a different question.

### The comparison is one `git` process, and it is git's own name for the bytes

`git ls-files -s` prints each staged entry's object id, and git's object id is
`hash("blob <length>\0" + bytes)` over the content. The journal already carries those bytes (base64), so
the expected id can be computed and compared **without reading a single staged file**:

| decision | choice | why not the alternative |
| --- | --- | --- |
| compare blob ids | `gitBlobId(recorded bytes)` against `ls-files -s` | one `git` process for the whole index; reading the staged blobs would be a second decoder, and finding 306 is what a decoder for this corpus cost |
| the hash algorithm | asked with `git rev-parse --show-object-format` | a `sha256` checkout compared against `sha1` ids reports every file as differing |
| what "clean" means | every recorded file that is staged is staged **at the recorded bytes** | "no journal exists" is a different claim, and it is printed as a different sentence |
| a journal that will not parse | refuse | an unreadable record is a file a killed battery left; the tree it was holding is unknown |
| a recorded path outside this checkout | refuse | the cache lives in the checkout, so that record describes a different tree |

The digest reimplementation is pinned against `git hash-object` over three payloads -- empty, a text
line, and `x\0\0\ny` -- because a constant copied out of git's source would agree with itself.

### Two roads not taken, and the reason each was refused

| candidate | verdict |
| --- | --- |
| the gate receipt, keyed on `HEAD^{tree}` | **cannot answer it.** A receipt answers *did a gate run over these bytes*; the question is *are these bytes the ones the tree was meant to hold*, and intent is only written down in the journal. A poisoned commit is refused by the receipt only when no run has happened to bless that tree, which is an accident of which tree was named |
| refusing while any journal exists (finding 310's own wording) | **refuses two of the three states above**, and the `--no-verify` it would provoke is the bypass it cannot survive |

### Acceptance

| what | before | after |
| --- | --- | --- |
| `scripts/staged-mutation.mjs` | does not exist | one comparison, three readers of one journal format |
| `.githooks/pre-commit` | does not exist | runs the guard, and is executable in the tree |
| a commit whose index holds a mutation | **published** (finding 310) | **refused**, naming the file and both digests |
| a commit that publishes nothing the record contradicts | -- | **allowed**, in a fixture where a journal exists and a battery holds the tree |
| failure sites in the inventory | 91 across 48 scripts | **95 across 50** |
| `--no-verify` | -- | **still commits the mutation**, and the test asserts the mutated content is in the revision rather than pretending otherwise |

### What this cannot do

`git commit --no-verify` skips it, and so does any revision built by something other than `git commit`.
The record is on disk and the comparison can be asked about any pair of things; nothing here makes a
caller ask. That is stated in the module rather than left to look like more than it is.

## Finding 312 — the guard's existence is not its execution

The hook was written, placed at `.githooks/pre-commit`, and correct. It then refused nothing for as
long as it took to measure why, and the measurement is two lines long:

```
--- mode 644:
hint: The '.githooks/pre-commit' hook was ignored because it's not set as executable.
hint: You can disable this warning with `git config advice.ignoredHook false`.
[main 7c0a857] nope
 1 file changed, 1 insertion(+), 1 deletion(-)
--- mode 755:
(no commit; exit 1)
```

**git commits anyway**, and the two lines that say so are `hint:`s that `advice.ignoredHook false` — or
any log that keeps stdout and drops stderr — removes entirely. The same shape one setting up:

| what | what git does |
| --- | --- |
| a hook with no execute bit | prints the hint above and **commits** |
| `core.hooksPath` naming a directory that is not there | commits with **no message at all** |

So the installer sets the mode bit rather than trusting the checkout's, and **reads the setting back**
rather than inferring it from the exit status of the command that wrote it: a `git config` that returns 0
without writing what it was asked for is a real possibility, and only a reading catches it. The two
branches a real checkout cannot be built into -- git refusing to write, and the setting reading back as
something else -- are driven through an injected runner, the same seam `verifiedTree` in
`gate-receipt.mjs` has and for the same reason.

`package.json`'s `prepare` runs the installer, and that is the only committed place the wiring can live:
`core.hooksPath` is in `.git/config`, which is not committed, so no file in this repository can make a
clone run the hook. `git-hooks.test.ts` asserts the mode bit **with the command that fixes it in the
message**, and asserts `core.hooksPath` in the clone the suite is running in -- the one claim in this
round that is about a clone rather than about the tree.

### What this does not do

Installing replaces `.git/hooks` with `.githooks`, so any hook a person had there stops running: git
reads one hooks directory, not two. And a clone that installs with `--ignore-scripts` never runs
`prepare`, which the suite's own assertion reports on its next run rather than four commits later.

## Finding 313 — `prepare` is not `pre` + `pare`, and the reader that thought so was this repository's

The installer went in as `package.json`'s `prepare`, which runs after every `pnpm install` and is the only
place a clone can be pointed at `.githooks` — `core.hooksPath` lives in `.git/config`, which is not
committed. The suite then refused the tree:

```
prepare declares a build for a script that was measured not to need one
```

`cold-tree-preconditions.test.ts` holds the rule *every script that reads a build artefact declares the
build*, and its other direction is a loop over `Object.keys(scripts)` whose first line is
`if (!name.startsWith('pre')) continue` — with `name.slice('pre'.length)` as the script being hooked. For
`prepare` that target is **`pare`**, and no script called `pare` needs a build.

The collision is not a mistake in the rule. npm's lifecycle scripts and pnpm's `pre<script>` convention
share one namespace, and the prefix is how this repository reads it:

| name | whose | is it a hook for something |
| --- | --- | --- |
| `pretest`, `prelint`, `predocs:check`, `pretypecheck` | pnpm's `pre<script>` | **yes**, and the target has to need a build |
| `prepare`, `prepack`, `prepublishOnly`, `preversion` | npm's lifecycle | **no** — they run at install and pack time, not before a sibling |

### The repair is a closed set, not a rename

Renaming to `postinstall` would have made the failure go away and left the reading in place: the next
person adding `prepare` for its npm meaning would get the same false refusal, and the message would be
about a script that does not exist. So the reader gained a table, and the table is held by three
assertions rather than by trust:

| assertion | what it stops |
| --- | --- |
| the set **equals** the four names, not contains | a carve-out that grows by one name per failure, which turns the rule off one entry at a time |
| `prepare` is actually defined in the manifest | an exemption for a script nobody has, which no future reader would dare delete |
| the set is **disjoint** from `NEEDS_BUILD` | a lifecycle name that also reads a build artefact being exempted here and checked nowhere — the direction that hides a defect rather than reporting one |

### Acceptance

| what | before | after |
| --- | --- | --- |
| `prepare` in the manifest | not present | present, and the rule refuses it |
| the reader | splits every `pre*` name on the prefix | splits it, except for four names it lists |
| the carve-out | -- | four names, an equality, and disjointness from the build list |
| the suite | red on `cold-tree-preconditions` | green, with one test that exists only to keep the set closed |

### What this cannot do

The table is hand-written. It knows which names in npm's documentation begin with `pre` today; it cannot
know about the one npm adds next, and it will not notice until that name appears in this manifest and the
suite refuses it. The equality is what makes the refusal happen once rather than the table being right.


## Finding 314 — one 500 turned a channel red, and the line that said so named no call

`234fef4b0` went up as v3.19's revision and CI failed it. Five of six jobs were green; the batteries job
passed all 25 battery steps -- 28 witnesses, 0 survivors -- and then:

```
could not publish the report: HTTP Error 500: Internal Server Error
##[error]Process completed with exit code 1.
```

The report existed. The artifact upload two steps later succeeded, 10,243 bytes. What failed was
`scripts/publish-battery-report.py`, the channel that puts the report where it can be read (finding 86:
the job log and the artifact metadata are reachable, their content is not; a git object is the one channel
that is both).

Two defects in one line, and the second is why the first cost a probe:

| defect | what it looked like | what it was |
| --- | --- | --- |
| the failure is unnamed | `HTTP Error 500` | the script catches `HTTPError` and does not carry the path it called into the message, so six possible requests are indistinguishable in the log |
| one bad answer ends the step | exit 1 | a 5xx is retried nowhere, although a 5xx is the one class a retry can fix |

### The measurements that settled both

| question | how it was answered | answer |
| --- | --- | --- |
| which call answered 500 | replayed the six calls by hand against `api.github.com` with a PAT, one at a time | `POST /git/blobs` -- and with an **empty body**, so not even a message to read |
| was the report publishable | posted the same 83,857 bytes again, 20 minutes later | `201` six times of six in base64, six of six in utf-8 |
| is it size | posted 1 KiB … 100 KB of filler | `1024 → 201`, `16384 → 500`, `100000 → 201` -- non-monotone, so not size |

The third row is the one that rules the size hypothesis out, and it was worth the four calls: a rule like
"above N kilobytes use utf-8" would have been inferred from two observations and would have started
refusing the first report that grew past it.

### The discriminator was already written down in this repository

`scripts/fetch-official.mjs` classifies its own failures, for the only other outbound channel here:

> `the server answered ${status}. The asset is not at this URL any more, and no amount of retrying will
> change that` -- for 4xx
>
> `the server answered ${status}, which is a server-side failure and the one class a retry can legitimately
> fix` -- for 5xx

The publish channel never learned it. It does now, and the retry is bounded so that it cannot turn a broken
channel green:

| property | how it is held |
| --- | --- |
| a 4xx is never retried | `retryable(status)` is false for it; a test counts the requests, not the exit code, because a script that hammered four times and then failed would look identical from outside |
| the attempts are bounded | `RCA_BENCH_PUBLISH_ATTEMPTS`, default 4; exhausting them exits 1 **with the call named and the attempt count stated** |
| a transport failure is retried too | no status arrived, so the request's fate is unknown rather than refused -- and it goes through the *same* decision line, not a second copy of the rule |
| the retries are printed | on success as well as on failure: a publish that needed three attempts is a fact about the endpoint, and a channel that hides it reports a health it did not measure |
| a 422 on branch creation is read, not refused | an attempt that answered 500 may have created the ref, so the retry is answered "Reference already exists" -- accepted **only** when the branch now points at the commit just built, so a stale branch still fails |

### Two things the tests found while proving it

Both were found by mutation, and both were the shape this repository keeps finding -- an assertion that
holds for a reason other than the one it names:

| survivor | why it survived | repair |
| --- | --- | --- |
| the path deleted from `ChannelFailure` | the test asserted the output *somewhere* contained `POST /git/blobs`, and the retry line above the failure carries the method and the path too | the assertion now selects **the failure line** by its own text, and requires the attempt count there |
| `retryable(None)` unreachable | the transport branch retried unconditionally, so the `status is None` arm could not be reached by any input -- the "closed connection is not retried" mutation passed the whole suite | one decision point: both outcomes fall through to the same `if not retryable(last.status) or attempt >= ATTEMPTS` |

### Acceptance

| what | before | after |
| --- | --- | --- |
| a 500 on the first object write | the job fails, nothing is published | retried; the publish completes and prints `1 retry` |
| a 403, or any 4xx | fails immediately (correct) | fails immediately, and one test counts the requests to prove it |
| a 500 on every attempt | fails, naming nothing | fails, naming `POST /git/blobs`, the status and `after 4 attempts` |
| a connection closed before any answer | fails with a bare `OSError` traceback | retried; on exhaustion, `a transport failure` naming the call |
| the branch already exists at another commit | not reachable | a red step naming both commits |
| tests in `publish-battery-report.test.ts` | 6 | 13 |
| `core` suite | 204 files / 4982 | 204 files / 4989 |
| coverage | 99.97 / 99.75 / 100 / 99.97 | unchanged -- `scripts/` is outside the coverage instrument |

Nine mutations were applied to the new code and each one turned at least one test red: `retryable` never,
`retryable` always, a closed connection not retried, the decision ignoring the 4xx rule, the decision
ignoring the bound, the path dropped from the message, a 422 refused again, a 422 accepted whatever the
branch points at, and the retry note printed only on failure.

### What this cannot do

A retry cannot distinguish "the endpoint is unwell" from "this request is wrong in a way the endpoint
answers 500 to". If the second ever happens, the step now takes four attempts and about seven seconds of
backoff before it fails -- slower, and no more informative than before. And the bound is a number chosen
from one observation: one 500 that was gone within twenty minutes. An endpoint that is unwell for thirty
minutes will still fail the job, which is the outcome intended, but the *rate* of transient 500s is not
measured anywhere, so nothing here would notice it getting worse.


## Finding 315 — RE3 is the slice that exists for logs and traces, and its export carried neither

The fourth anchor scored **735 cases at `oracle=1.00`** across three corpora. Every one of the 90 RE3
cases exported a `logs.csv` and a `traces.csv` that held **a header and no rows**, and nothing noticed,
because the official metric reads the case *directory name* and the metric table, and the shape check was
satisfied by the two files existing.

Measured, not inferred. On `RE3-OB/emailservice_f1/1`:

| file | corpus | export before this round |
| --- | --- | --- |
| `logs.csv` | 11 106 711 bytes, 70 076 rows | 57 bytes, **0 rows** |
| `traces.csv` | 29 538 448 bytes, 164 920 spans | 116 bytes, **0 rows** |

The adapter `adaptCase` read one payload per case -- the metric table -- and returned a file map holding
exactly that. Logs and traces were written by the exporter and never read as input.

### Why the tables could not simply be fed in

The generic file reader was measured against both corpora files and is wrong about three of their
decisions, each of which loses every row:

| what the reader does | what the file says | cost |
| --- | --- | --- |
| `time` is first in the timestamp aliases | `time` is `HH:MM`; the instant is in `timestamp` (ns) or `startTime` (us) | `parseTimestamp` refuses `06:22`, and **0 of 235 000 rows** survive |
| `container_name` is not a service alias | `container_name` is the service | every log row refused for a missing service |
| `duration` is in the `durationMs` aliases | the corpus writes **microseconds** | every span a thousand times too long |

So the corpus's mapping is stated rather than detected -- `FileLayout` now names the pod column, the node
column and the duration's unit, and the round trip states all four together with the reason for each. The
aliases were **not** reordered: `time` really is the instant in plenty of files, and putting `timestamp`
first would only move which corpus is misread.

Two columns had no route into the IR at all. `pod_name` and `node_name` are RE3's alone, the IR carries
them as resource attributes, and `RCAEVAL_UNFILLED_COLUMNS['logs/RE3']` was **empty** -- the export
claimed to fill six columns while no file-fed case could fill two of them. The file reader now reads them.

### The status column was not what it said it was

`traces.statusCode` was documented and coded as OpenTelemetry's codes, `0`/`1`/`2`. RE3-OB's own values,
over the 164 920 spans of `emailservice_f1/1`:

| value | spans | reading |
| --- | --- | --- |
| `0.0` | 157 156 | gRPC `OK` |
| *(empty)* | 7 626 | the frontend's root spans |
| `14.0` | **138** | gRPC `UNAVAILABLE` |

Fourteen is not an OpenTelemetry status. The 138 spans are the entire failure signal of that case: all of
them `checkoutservice` calling `hipstershop.EmailService/SendOrderConfirmation`, all of them after the
injection instant, in a case whose fault is in `emailservice`. The column is the gRPC code.

The mapping was therefore not approximate but wrong in the commonest case: an OTel `OK` was written as
`1`, which in this column is gRPC `CANCELLED` -- a failure. `statusCode` is now empty and named in
`RCAEVAL_UNFILLED_COLUMNS.traces`, which is a narrowing of a claim rather than a loss: the export cannot
mean the column, so it stops writing one.

### What the round trip can now say, and what it still cannot

`compareModalityTables` compares the exported table with the corpus's own as a multiset of rows over the
columns the plan names, and reports per column. On the 30-case local slice of RE3-OB:

```
ROUNDTRIP modalities 60 table(s) over 2 modality(ies): 2 095 206 of 2 095 206 log row(s),
4 755 090 of 4 755 090 span(s); 330 of 510 column(s) exact, 6 415 067 cell(s) truncated to
the millisecond, 9 043 794 value(s) in columns the IR does not carry

ROUNDTRIP PASSED (30 case(s) round-tripped through the official layout)
```

Every row, not a sample. Three kinds of column, each stated:

| kind | columns | what it means |
| --- | --- | --- |
| exact | `container_name`, `message`, `pod_name`, `node_name`; `traceID`, `spanID`, `serviceName`, `operationName`, `startTimeMillis`, `duration`, `parentSpanID` | cell for cell |
| truncated | `logs.timestamp` (ns), `traces.startTime` (us) | the same instant; the IR's clock is milliseconds |
| derived | `time` (both tables) | checked against the instant, because the corpus's own rendering disagrees with its own instant on one row in 61 828 |
| not carried | `traces.methodName`, `traces.statusCode` | empty, with the count of corpus values reported |

**It cannot say the export is byte-identical**, and no honest claim could: three of the corpus's instants
are finer than the IR's clock, and two of its columns have no field. What it can say is that every row is
there and every column that should agree does.

**It does not read RE2's tables.** RE2's log table is nine columns, four of which the IR has no field for
(`req_path`, `error`, `cluster_id`, `log_template`) and one of which -- `level` -- feeds a closed severity
vocabulary that no RE2 archive in this tree has been measured against. Reading it means answering what a
`level` this reader has never seen should do, and inventing that answer is what this repository spends its
rounds undoing.

## Finding 316 — a nanosecond instant was read through a double, and one in 62 000 crossed a millisecond

The comparison in finding 315 failed on its first real run, on two log rows of `RE3-OB/adservice_f3/2`,
and the cause was in `parseTimestamp`, not in the tables:

```
corpus only: 11:32 | 1732275121315000000 | currencyservice | conversion request successful
export only: 11:32 | 1732275121316000000 | currencyservice | conversion request successful
```

The corpus wrote `1732275121315999877` ns -- 11:32:01.315987877. The reader returned `.316`.

```ts
const n = Number(value);
const multiplier = layout === 'unix_ns' ? 1e-6 : ...;
return { isoUtc: epochToIsoUtc(n * multiplier), ... };
```

`1.7e18` needs 61 bits and a double carries 53, so `Number(value)` **rounds the input** first -- a step of
256 ns at 2024 -- and the product then truncates. A reading within 128 ns below a millisecond boundary
crosses it, and the instant is recorded one millisecond late.

Measured: two of that case's 69 275 log rows, and one of `RE3-OB/currencyservice_f1/1`'s 61 828. The
conversion is now `BigInt` integer arithmetic, which also fixes the truncation direction: `BigInt`
division truncates toward zero, exactly as `TimeClip` does to a fractional millisecond, so the reader and
the writer land on the same millisecond by construction rather than by coincidence.

### Why no test caught it

Every fixture in `time.test.ts` was a round number -- `1788669906000000000` -- and a round number is
exactly representable in a double. The suite asserted that the four layouts agree with `epochMsToIsoUtc`
on inputs where the conversion is exact, which is the same shape as the exporter's `statusCode` test
asserting the number the code produced: both were written from the belief the code was written from.

The tests now carry the corpus's own value, and one of them states the property that makes the defect
possible: a nanosecond epoch needs 61 bits.

### And the corpus has the same defect

The comparison's third finding came from the opposite direction. Of `RE3-OB/currencyservice_f1/1`'s 61 828
log rows, **one** has `time` = `06:17` beside a `timestamp` of `1731910619999999863` -- 06:16:59.999999863.
The corpus derived that minute from a double at microsecond resolution, and 0.14 us below the boundary
rounded up across it. Its own two columns disagree.

So `time` is compared against the **instant**, not against the corpus's rendering of it: the exported cell
must be the minute of the corpus's instant, and the cells where the corpus disagrees with itself are
counted and reported. An export whose `time` is an hour out, or empty, still fails.

### Acceptance

| gate | result |
| --- | --- |
| log rows carried, 30 local RE3-OB cases | **2 095 206 of 2 095 206** |
| spans carried, the same | **4 755 090 of 4 755 090** |
| `RE3-OB/emailservice_f1/1` before / after | 0 / 0 rows -- before; 70 076 / 164 920 -- after |
| an empty `message` in the corpus | the row is quarantined, the table is one row short, and the round trip **fails** naming the table |
| an RE3 case with no `logs.csv` | fails, naming the suite and the file, rather than scoring the case as metric-only |
| a suite with no plan (RE2) | prints nothing about modalities -- a zero would read as "read them, found nothing" |
| `traces.statusCode` | empty, and in `RCAEVAL_UNFILLED_COLUMNS.traces` |
| the file reader's status vocabulary | unchanged: the corpus's `0.0` is read as nothing, because it is not one of `UNSET`/`OK`/`ERROR` |
| tests | `modality-comparison.test.ts` 35 at **100 / 100 / 100 / 100**, `check-official-modalities.test.ts` 4, `ingest.test.ts` +6, `time.test.ts` +2 |
| coverage | **99.97 / 99.76 / 100 / 99.97**, branch up from 99.75; `scripts/` is outside the instrument |

### The stopwatch, and a file that was already at its budget

The first full run after the change failed with no failing test: `check-official-roundtrip.test.ts` held
the event loop for **63 759 ms** against a 45 s budget. That file spawns `check-official.mjs` 58 times,
each spawn blocking its own event loop for the child's whole lifetime, and it sat within a second of the
budget -- the same revision measured 44 s, 46 s, 63 s and 66 s across four runs.

Two repairs, in the order the gauge advises: the new contract's tests moved to
`check-official-modalities.test.ts`, and every spawn in the round-trip file is awaited rather than
blocked on. The blocking went to nothing measurable. This is not finding 315's defect; it is a cost the
round added to an instrument that measures it, which is the instrument working.

### What this cannot do

It cannot say the export is byte-identical to the corpus, and it does not try: three instants are finer
than the IR's clock and two columns have no field. It cannot reach RE2's tables either -- four of its nine
log columns have no field and one feeds a closed vocabulary no RE2 archive here has measured. And the
`time` column is checked against the instant rather than against the corpus's cell, so a corpus whose
`time` column were wrong on *every* row would be reported as a large disagreement and not as a failure;
the instant columns are what carry the proof.

## Finding 317 — the worker cap was derived from a number the container overstates

### The defect

`packages/core/vitest.config.ts` caps the worker count at `min(8, availableParallelism() - 1)`, and
finding 297 wrote that line for a measured reason: a GitHub runner's wall time is twice this box's, and
eight workers on four vCPUs is 2x oversubscription, so every file's time doubles and the synchronous
files -- whose whole duration is one block -- cross the 45 s stall budget. The comment above the line
says `availableParallelism()` *is* "the number of CPUs this process may actually use".

On 2026-10-31 it was not:

```
node -e 'console.log(require("node:os").availableParallelism())'   -> 32
cat /sys/fs/cgroup/cpu.max                                          -> 400000 100000    (4 CPUs)
```

So the cap was 8, on an allowance of 4. Two-thirds of the parallelism the suite believed it had did not
exist, and the files that pay for that are exactly the ones the gauge measures.

### What it looked like

`verify:local` failed at step 5 with `pnpm test:coverage` exiting 1, and the log had **no failing test**:

```
Error: this test file held the event loop for 56358 ms, past the 45000 ms budget.
```

`ingest-report.test.ts` is synchronous CPU work in this process -- it is not one of the files that spawn
children -- so its wall time *is* its blocked time, and 2x oversubscription doubles it. Six runs of one
revision:

| run | workers | `ingest-report.test.ts` | verdict |
| --- | --- | --- | --- |
| 1 | 8 | 44 s | green |
| 2 | 8 | 46 s | green |
| 3 | 8 | **56 358 ms** | **red, 5039 of 5039 tests passing** |
| 4 | 8 | **65 578 ms** | **red, no failing test** |
| 5 | 8 | 44 s | green |
| 6 | `--maxWorkers=4` | -- | green, 57 s wall |

The same revision was green or red depending on nothing but how the scheduler interleaved it. That is the
class of red finding 290 and finding 297 were both written about, one layer down: 297 removed the *host*
count from the decision and kept the *reported* count, which the container also overstates.

### The fix, and why it is a cap rather than a budget

`workerCount(reported, quota)` takes `min(reported, quota)`, leaves one CPU to the main process, keeps the
floor of 2 (a one-core container) and the ceiling of 8 (the memory measurement), and `quotaFromCpuMax`
reads `/sys/fs/cgroup/cpu.max`. `max` and any unreadable text return `null`, which leaves the reported
count in charge -- a missing reading must not become "no CPU", and on the CI runner (4 reported, no quota
file to read) the answer is the same 3 workers as before the change.

Raising the budget instead would have been the other direction, and it is the wrong one: the budget is a
statement about how long one file may block, and it was correct. What was wrong was the number of
processes competing for the allowance it is spent against.

### Acceptance

| claim | how it is held |
| --- | --- |
| the quota caps the count | `workerCount(32, 4) === 3` -- the measurement in one line |
| it never raises it | `workerCount(4, 64) === 3` |
| no quota leaves finding 297 where it was | `workerCount(4, null) === 3`, `workerCount(32, null) === 8` |
| `max` is not zero CPUs | `quotaFromCpuMax('max 100000') === null` |
| a truncated or v1 reading is refused | `''`, `'400000'`, `'0 100000'`, `'four 100000'` all `null` |
| the floor and the ceiling survive | `workerCount(1, 1) === 2`, `workerCount(64, 64) === 8` |

### What this cannot do

It cannot make the suite green under arbitrary load -- a machine ten times oversubscribed by *other*
processes still turns a synchronous file's wall time into blocked time. What it removes is the
oversubscription this repository was doing to itself. And the second red seen in this round,
`ENOENT coverage/.tmp/coverage-N.json`, is a different defect in a dependency: vitest's coverage provider
drains its pending writes once and then resets the list, so a write that arrives after the drain has no
owner and Node turns it into a non-zero exit with no failing test. `coverage-writes-are-drained.test.ts`
already writes that mechanism down and refuses to describe it as a test failure; the workaround measured
here (create `coverage/.tmp` before the run) is a workaround, not a fix.

## Finding 318 — the commit published a spec change without the artefact derived from it

### The defect

The commit that made RE3's export carry its log and trace tables also changed two things other files are
generated from: the `statusCode` field's note in the export spec, and the example `traces.csv` rows on
which that column used to hold a value. Neither generated file was regenerated.

| file | generated from | what it still said |
| --- | --- | --- |
| `site/assets/data.js` | `scripts/gen-examples.mjs` over the export spec and the example set | `SPAN_STATUSES -> 0/1/2`, and two example spans with `statusCode` `1` |
| `docs/targets/rcaeval.md` | the same run, into the `<!-- fields -->` block | the new source `(not carried)` beside the old note |

Measured at that commit, on a clean tree:

```
$ pnpm examples:check
site/assets/data.js is stale - run `pnpm examples:gen` and commit the result.
```

### Why the anchor did not say so

`golden-master/expected.json` holds no entry under `site/`:

```
$ grep -c 'site/assets/data.js' golden-master/expected.json
0
```

The round did re-sign one anchor -- `RE2-order-prod/order_cpu/1/traces.csv` from 276 to 274 bytes -- and
read that as "the derived things agree". An anchor is the list of files somebody chose to freeze. A
derived artefact nobody listed is a derived artefact nobody compared, and the round's own evidence for
that sentence is the diff it published: the anchor moved by two bytes while the site data was three
lines out of date.

### How the commit was made

The step that says this is `artefacts / Examples and site data are up to date`, 24 of 31. That commit was
made after running the steps that were expected to move -- typecheck, lint, coverage, the documentation
guards, the anchor -- and not the rest. The first full run over it stopped there:

```
[24/31] artefacts / Examples and site data are up to date
/tmp/v321-verify/site/assets/data.js is stale - run `pnpm examples:gen` and commit the result.
  failed -- the step exited 1
[25/31] artefacts / Documentation guards are satisfied
  skipped -- job "artefacts" has failed, and this step declares no condition that widens past a failure
```

### The repair

The two artefacts are what that change moves, so they belong in that commit rather than in a later one
that says "regenerate": a tree whose every commit passes the gate is the only kind a per-tree receipt can
speak about.

```
git checkout --detach 513d2c9
node scripts/gen-examples.mjs     # site/assets/data.js, docs/targets/rcaeval.md
git commit --amend                # bb87c24
git rebase --onto bb87c24 513d2c9  # 6454d96
```

Six lines in each file: the note in the field block, and in the site data the same note plus the two
example rows whose status column is now empty.

### What the repair ran into

`git commit --amend` refused, and not for the reason the commit was about:

```
check-staged-mutation: golden-master/doc-counts.json is staged at a blob a battery's journal says was
mutated (recorded bytes bdcf6f226845, staged blob b980f07ea96f)
```

The journal belonged to the `backend-support` battery of a `verify:local` that was killed at step 19. Its
holder pid was gone. Its record describes the tree *before* that battery mutated it -- which was the
child commit, where `doc-counts.json` says 207 files / 5047 tests. Comparing the index at the parent
(206 / 5039) against that record says "mutation", and there is nothing in the record that distinguishes
an abandoned run from a legitimate edit. That is the mechanism working: it is what caught finding 310.

The repair is the one the mechanism's own error message names, and it needs the human step it asks for:
`git status` showed the tree clean apart from the two intended artefacts, so the record was abandoned
rather than live, and it was removed before committing. Restoring from it would have published the
child's test counts inside the parent.

### Acceptance

| claim | how it is held |
| --- | --- |
| the site data follows the spec | `pnpm examples:check` -- "examples data is up to date" |
| the pack follows it too | `pnpm examples:bundle:check` -- "example pack is up to date" |
| the field block matches the code | `pnpm docs:check`, all 15 guards |
| the arithmetic still holds | `pnpm official:check` -- 8 targets scored, 1 skipped by contract |
| the pushed tree passed all 31 steps | the receipt is per tree, and a partial run writes none |

### What this cannot do

It cannot turn a partial run into a gate. The five steps run before the commit were the five its author
expected to move, and the defect was in the one nobody expected to move -- which is the whole content of
the argument for running all of them, and the reason the receipt is keyed by tree rather than by
intention. The cost of the mistake is mechanical, and the receipts enumerate it rather than a number
that a later edit would have to retype: a receipt is per tree, so every tree that gets published costs
one full run -- `b2b616b` and `264de30` for the two repaired trees, `bc0ed03` for the commit that records
the repair, `78f3294` for the correction of this paragraph, and one more for this sentence, which is why
the mechanism is the thing worth writing down.

## Finding 319 — one service, two tables, two spellings

### The defect

`RE2-OB/checkoutservice_cpu/1` calls its front end two things:

| file | the name it writes |
| --- | --- |
| `traces.csv` (`serviceName`) | `frontendservice` |
| `logs.csv` (`container_name`) | `frontend` |
| `simple_metrics.csv` (column prefixes) | `frontend` |

Three tables of one case, one service, two spellings. A reader that carries both makes
two entities out of one, and everything that exists to join a span to the log lines it
caused then joins nothing: the attribution finds no lines for `frontendservice`, and the
lines that mention `frontend` belong to an entity no span ever touched.

Measured on that case: **199 519 of 391 997 spans** carry the spelling the other two
tables do not use.

### Why it survived

Because RE2's two tables were never read. `MODALITY_PLANS` had one entry, for RE3, and the
reason given for the omission was that RE2's log table needed a measured answer about an
unseen `level` and no archive had been measured. That was true and it was also the reason
nobody had looked at the trace table -- which has no such question. Its header is the same
eleven columns as RE3's, byte for byte:

```
time,traceID,spanID,serviceName,methodName,operationName,startTimeMillis,startTime,duration,statusCode,parentSpanID
```

So the suite that was declared unreadable on one file's account had a second file nothing
was wrong with, and the second file's only defect was invisible for as long as neither was
read.

### The repair

`FileIngestOptions.serviceAliases`, an exact-match one-way map from a spelling the corpus
uses to the name the IR holds. The map itself is a fact about one corpus, so it lives in the
plan that describes that corpus and not in the reader:

```js
const RE2_SERVICE_ALIASES = { frontendservice: 'frontend' };
```

One constant, referenced twice: once as the ingest's `serviceAliases` and once as the
`aliases` of the `serviceName` comparison entry. Two literals would be two chances to
disagree, and the round trip is where that disagreement would surface.

The comparison needed a fourth column kind to go with it. `exact` was wrong (the cells
differ), `truncated` was wrong (no digits were dropped), `not-carried` was wrong (the value
is carried). `normalised` is the fourth: the cell is read through a stated transform and
compared in that form. It applies to the corpus's side only, exactly as `truncated` does --
an exporter that wrote the corpus's spelling back would be an exporter that never applied
its own plan, and normalising both sides would let it pass.

### Acceptance

```
ROUNDTRIP MODALITY   1/1 RE2-OB/checkoutservice_cpu/1   traces: 391997/391997 row(s);
  exact 6/11 (traceID, spanID, operationName, startTimeMillis, duration, parentSpanID);
  derived time from the instant; truncated startTime to the millisecond (354652 of 391997
  cells had finer digits); normalised serviceName normalised (199519 of 391997 cell(s)
  spelled differently); not carried methodName (373623 value(s) in the corpus, 0 written),
  statusCode (373623 value(s) in the corpus, 0 written)
```

Every row, and the 199 519 renamed cells are counted as a normalisation rather than as a
loss. Tested four ways: the map applied, the map's absence, a name the map does not
mention, and an export that kept the corpus's spelling (which must fail).

### What this does not do

It does not make the alias discovery automatic. Detection cannot guess that
`frontendservice` and `frontend` are one service, and a rule that stripped a `service`
suffix would be a guess about every corpus at once. What it does is make the statement
available to the plan, which is where a fact about one corpus belongs -- the same place
`FileLayout` was put when detection was measured wrong about three of its decisions
(finding 315).

## Finding 320 — a closed vocabulary rejected a level the corpus spells differently

### The defect

`LOG_SEVERITIES` is OpenTelemetry's: `TRACE`, `DEBUG`, `INFO`, `WARN`, `ERROR`, `FATAL`. The
ingest upper-cases a `level` cell and then consults that vocabulary, which is right and is
what makes `info` and `INFO` one severity. RE2-OB writes one level the vocabulary does not
have:

| `level` in the corpus | rows | `.toUpperCase()` | in the vocabulary |
| --- | --- | --- | --- |
| `info` | 6 202 823 | `INFO` | yes |
| `debug` | 5 105 988 | `DEBUG` | yes |
| `INFO` | 2 138 278 | `INFO` | yes |
| *(empty)* | 1 768 661 | — | not declared |
| **`warning`** | **4 742** | **`WARNING`** | **no** |
| `error` | 4 053 | `ERROR` | yes |

15 224 545 rows across **91** `logs.csv` files in `RE2-OB.zip`, and the six values above are
all of them. So `warning` is 4 742 rows that would be quarantined for saying what they mean
-- their instant, container and body are as good as the rows beside them.

### Why the first measurement would not have found it

The case measured first was `checkoutservice_cpu/1`, whose own distribution is

```
{'info': 70921, 'debug': 56731, '': 19699, 'INFO': 23971}
```

-- four values, no `warning`. A plan written from that case alone would have passed on that
case and quarantined 4 742 rows elsewhere in the suite, and the round trip would have been
green because the case it ran on had none. That is finding 315's shape exactly: a gate that
is green because its sample did not contain the thing.

The full scan is why the number exists. It read all 91 tables through HTTP range requests
against the archive's central directory, inflating only each `logs.csv` member and keeping a
counter -- 180 MB transferred instead of the 1.19 GB archive.

### The repair

`LOG_SEVERITY_SPELLINGS` and `normaliseLogSeverity`, in `ir/types.ts`:

```ts
export const LOG_SEVERITY_SPELLINGS: Readonly<Record<string, LogSeverity>> = { warning: 'WARN' };

export function normaliseLogSeverity(raw: string): LogSeverity | undefined {
  const upper = raw.toUpperCase();
  if (isVocabularyMember(LOG_SEVERITIES, upper)) return upper;
  return LOG_SEVERITY_SPELLINGS[upper.toLowerCase()];
}
```

The table is short on purpose and every entry is a count rather than a guess: `warning` is in
it because 4 742 rows say so, and `err` is not because those 15 224 545 rows contain no such
value. A spelling in neither the vocabulary nor the table stays a rejection, which is how an
unseen one remains visible instead of being folded into its nearest neighbour -- `notice` is
refused by a test that says so.

It is a function rather than a `ColumnTransform` of its own because two readers need the same
answer: the ingest when it builds a signal, and `score/modalities.ts` when it decides whether
the exported cell reproduces the corpus's. Two implementations of one normalisation is the
shape of finding 316, where a unit conversion agreed with itself in two places and with the
corpus in neither.

### Acceptance

```
ROUNDTRIP MODALITY   1/1 RE2-OB/checkoutservice_cpu/1   logs: 171322/171322 row(s);
  exact 2/9 (container_name, message); derived time from the instant; truncated timestamp to
  the millisecond (171321 of 171322 cells had finer digits); normalised level normalised
  (127652 of 171322 cell(s) spelled differently); not carried req_path (59301 value(s) in the
  corpus, 0 written), error (0 value(s) in the corpus, 0 written), cluster_id (171302
  value(s) in the corpus, 0 written), log_template (171302 value(s) in the corpus, 0 written)
```

127 652 cells normalised -- the 70 921 `info` and 56 731 `debug` of that case -- and no
quarantine. Tested five ways: `warning` reaches `WARN`, two cases of one level reduce to one,
`notice` stays a rejection, an empty cell declares nothing, and the comparison's `severity`
transform agrees with the ingest by construction because both call the same function.

### What the four unfilled columns cost

`req_path` is non-empty in 59 301 rows and `cluster_id` and `log_template` in 171 302 --
nearly every row. They are emitted empty and named in `RCAEVAL_UNFILLED_COLUMNS['logs/RE2']`,
which is the export stating a loss rather than inventing a value. `error` is a different
case: **zero** rows carry it, so the column exists and says nothing, and the round trip
reports it as `(0 value(s) in the corpus, 0 written)` rather than as a column nobody checked.

## Finding 321 — the tables that were written for every case, filled or not

### The defect

`exportRcaEval` declared `logs.csv` and `traces.csv` for RE2 and RE3 and then wrote both for
every case that reached the suite:

```ts
if (suite === 'RE2' || suite === 'RE3') {
  files[`${dir}/logs.csv`] = buildLogsCsv(signals, suite);
  files[`${dir}/traces.csv`] = buildTracesCsv(signals);
}
```

`buildLogsCsv` filters for log signals and `buildTracesCsv` for span signals, so a case with
none produced a header and nothing under it. Measured on this repository's own annotated
corpus, through `check-fault-cases`' export:

| suite | cases written | `logs.csv` with no rows | `traces.csv` with no rows |
| --- | --- | --- | --- |
| RE2 | 30 | **19** | **25** |
| RE3 | 5 | 3 | 4 |

The corpus's declarations, read from the `.signals.json` files, agree with that and say why:
11 of the 30 cases declare a log line and 5 declare a span. Nothing was truncated; the
exporter was writing two files per case on the strength of the *suite's* modality set rather
than the *case's* content.

A header is not a placeholder. `check-official` reads a modality as present-or-absent and
refuses a case that is declared and missing, so an empty file here is the exporter
manufacturing the evidence that rule asks for: the case reads back as "has logs, in zero
rows", which is indistinguishable from a log table truncated to nothing.

### The half that made it a defect rather than a wart

The exporter's own output was what satisfied the structural contract that exists to ask
*which modalities a case carries*. `checkRcaEvalStructure` tests `hasLogs && hasTraces` by
looking for paths ending in `/logs.csv` and `/traces.csv`, and an empty file passes.

So the score of an RCAEval export could not see a missing modality, and that was already
written down in this repository as a measured fact:

> strip any single modality from a bundle and re-score, and **all nine targets scored
> identically** ... The other four leave a file behind -- an empty `logs.csv` is still a
> `logs.csv` with the right header -- which is exactly how a structural check stays blind to
> whether a modality is *populated*.

That paragraph is in `target-requirements.test.ts`, offered as the reason the coverage report
exists as a separate measurement. The first clause is true for the six targets whose structure
gates describe their own layout; the second clause was this defect, described accurately and
kept as an invariant.

### Why the two halves survived together

Each half was defensible alone. A suite that declares two modalities should export both -- the
layout is what upstream reads. A structure check should ask for the files the layout names. The
two together are a loop: the exporter writes what the suite declares, the check confirms the
files exist, and the only party who knew the case had no log line was `buildLogsCsv`, which
returns a string either way.

The corpus made it visible because it is the one dataset in this tree that mostly does *not*
carry the modalities it is exported into. Every other consumer had what the exporter needed, so
the empty file was a shape that never cost anything.

### The repair

Three statements, each about one thing:

1. **A table is written iff the case has a signal of its modality.** `signals.some(isLogSignal)`
   and `signals.some(isTraceSignal)`, in `exportRcaEval`.
2. **A case with no metric signal is skipped by name.** Upstream finds a case by globbing for
   `data.csv`, so a case it cannot see is a case whose absence has to be stated rather than
   implied by an empty file. It gets the same treatment a case with no signals at all already
   had, with its own sentence, because the two absences are two different repairs:
   `no metric signals attached, and a case is found by its data.csv`.
3. **The coverage report's RE2 row gains `trace`.** `TARGET_REQUIREMENTS['rcaeval-re2']` said
   `['metric', 'log']` while `checkRcaEvalStructure` required both files for the same suite --
   two statements of one modality set, with the coverage report the lenient one. One case of
   `RE2-OB` holds 171 322 log rows and **391 997 span rows** eleven columns wide, measured in
   finding 319's round, so the lenient answer was also the wrong one: a dataset with metrics
   and logs and no spans was reported `ready` for a target whose own export would then fail its
   structure contract.

And one removal. `check-fault-cases` counted the data-less files and printed the count; with
the exporter unable to produce one, that count is a constant zero and its branch is a line no
input reaches -- the shape finding 285 removed from the same script. The invariant moved to
where it can fail: `export.test.ts` builds four bundles (one modality, the other, both, neither)
and asserts which files exist for each. What the gate prints instead is the fact a reader can
act on:

```
export RE1 30 case(s) written · RE2 30 case(s) written, logs in 11 of 30, traces in 5 of 30 ·
RE3 5 case(s) written, logs in 2 of 5, traces in 1 of 5, 25 skipped
```

The share is the number the old count only ever implied, and it is the one the coverage report
cannot express: `computeCoverage` answers "can this dataset be evaluated at all" with a boolean
over the bundle, so `rcaeval-re2 ready` is true while 19 of 30 cases have no log table. Those
two readings are not in conflict -- one is the floor, the other is the amount -- and until this
round only the floor was printed anywhere.

### Acceptance

| item | before | after |
| --- | --- | --- |
| RE2 `logs.csv` written | 30 (19 empty) | **11** |
| RE2 `traces.csv` written | 30 (25 empty) | **5** |
| RE3 `logs.csv` / `traces.csv` | 5 / 5 (3 and 4 empty) | **2 / 1** |
| a metrics-only case's RE2 export | 4 files, 2 with no rows | **2 files, none empty** |
| `checkRcaEvalStructure` on it | passed | **fails `modality-set`** |
| `TARGET_REQUIREMENTS['rcaeval-re2']` | `metric, log` | **`metric, log, trace`** |
| `core` suite | 207 files / 5 069 tests | **207 files / 5 076 tests** |
| coverage | 99.97 / 99.76 / 100 / 99.97 | **unchanged** |

The structural blindness is now asserted in both directions, because one direction alone would
have been satisfied by the old arrangement: `target-requirements.test.ts` strips each modality a
target does **not** declare and requires the score to be unmoved (nine targets), then strips each
modality the three RCAEval suites **do** declare and requires `modality-set` to fail and the
score to drop.

RE3's case in that test is a code fault, deliberately: the fixture's fault is a resource one,
which RE3 refuses outright, so its export is empty and "the score drops" would have been
`0 < 0` -- an assertion that can never fail wearing the shape of one that can.

## Finding 322 — the anchor's RE2 case was RE2 in name and RE1 in content

### The defect

`anchor-roundtrip.yml` builds a synthetic corpus in the official layout and round-trips it. Its
RE2 case shipped two files:

```
/tmp/synthetic/RE2-TT/ts-order-service_cpu/1/metrics.json
/tmp/synthetic/RE2-TT/ts-order-service_cpu/1/inject_time.txt
```

A real RE2 case ships four: the payload, the injection time, `logs.csv` and `traces.csv`. So the
anchor's RE2 case was a metrics-only case wearing an RE2 directory name -- which was invisible
for exactly as long as RE2's two tables were unread, because the declaration and the fixture
agreed on a suite that reads one file.

The first push that made RE2 read its own tables turned it red:

```
ROUNDTRIP FAIL   2/2 RE2-TT/ts-order-service_cpu/1  reason=RE2 declares a logs table
  and logs.csv is not readable under RE2-TT/ts-order-service_cpu/1
```

Job `124417766663`, step 11, on `d780c3547`. The refusal is the correct verdict: a case that
declares a table it does not ship is not the evidence the slice exists to produce.

### Why the fixture was not wrong when it was written

It was written when RE2's plan was empty. At that point a metrics-only case *was* a full RE2
case, and the fixture documented that faithfully -- the comment above it says the point is to
"join that shape to what the ingest reads", and the shape was `metrics.json`. The defect is not
that the fixture lied; it is that nothing connected the fixture's content to the plan's
declaration, so the day the plan grew two tables the fixture kept its old body and the anchor
kept passing on a case that no longer resembled the slice.

There is a second, quieter reason it was not noticed: the anchor's assertions were about
*counts* (`RE1=1 RE2=1 RE3=0`), the service name in the derived descriptor, and the verdict
lines. A verdict line says `PASS 2/2` whether the case carried one modality or three, and the
modality reading (`ROUNDTRIP MODALITY ...`) did not exist until RE2's tables were read. A gate
that counts cases cannot see what a case contains.

### The repair

The fixture gained the two tables, in the corpora's own nine and eleven columns, with every
cell chosen to be something the comparison classifies rather than something it tolerates:

| cell | value | why that value |
| --- | --- | --- |
| `logs.level` | `WARN`, `warning` | the second exercises `LOG_SEVERITY_SPELLINGS`, so the anchor reports `1 of 2 cell(s) spelled differently` instead of a silent agreement |
| `logs.timestamp` | `1700000060000000000` ns | an exact multiple of the millisecond the IR keeps, so the truncation count is `0 of 2` and a regression in `instantCell` would move it |
| `traces.startTime` / `startTimeMillis` | `1700000060000000` / `1700000060000` | the same instant in the two units the columns are documented to use |
| `traces.duration` | `12000` µs | 12 ms, the IR's unit, so a factor of 1000 shows up as a row mismatch |
| `req_path`, `error`, `cluster_id`, `log_template`, `methodName`, `statusCode` | empty | the columns with no IR field, empty on both sides, so `not carried` reports `0 value(s)` rather than being untested |

The tables are written by hand rather than by exporting a bundle: a fixture generated by the
exporter agrees with the exporter by construction, which is the one thing an anchor cannot
afford.

### Acceptance

```
ROUNDTRIP PASS   1/2 RE1-OB/adservice_cpu/1         target=rcaeval-re1  oracle=1.00 signals=80
ROUNDTRIP PASS   2/2 RE2-TT/ts-order-service_cpu/1  target=rcaeval-re2  oracle=1.00 signals=84
ROUNDTRIP MODALITY   2/2 RE2-TT/ts-order-service_cpu/1  logs: 2/2 row(s); exact 2/9;
  normalised level normalised (1 of 2 cell(s) spelled differently); truncated timestamp
  (0 of 2 cells had finer digits); not carried req_path (0 value(s) in the corpus, 0 written)
ROUNDTRIP MODALITY   2/2 RE2-TT/ts-order-service_cpu/1  traces: 2/2 row(s); exact 6/11;
  truncated startTime (0 of 2 cells had finer digits); not carried methodName (0), statusCode (0)
ROUNDTRIP modalities 2 table(s) over 2 modality(ies): 2 of 2 log row(s), 2 of 2 span(s);
  8 of 20 column(s) exact, 0 cell(s) truncated, 0 value(s) in columns the IR does not carry
```

`signals=84` is 80 metric readings plus two log lines and two spans, on the same case: the
number says the modalities arrived, which the count-based assertions could not.
