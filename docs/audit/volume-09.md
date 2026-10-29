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
