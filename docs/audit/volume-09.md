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
