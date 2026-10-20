## Pass 49 — a gate is a property, and the enumeration was reading a spelling

### What was found, by asking what the two mechanisms cover

`derive-gate-sites.mjs` reported `50 failure site(s) across 32 of 40 script(s)`, and the eight
scripts with no site were not the ones a reader would guess. They were **the batteries and the
probes** -- including three the pipeline runs on every push:

```
scripts/inject-stability.mjs      scripts/probe-m1-ceiling.mjs
scripts/inject-component-rule.mjs scripts/probe-type-misses.mjs
scripts/inject-m1-ceiling-tests.mjs
scripts/probe-denial-inventory.mjs  scripts/serve-site.mjs  scripts/format-spec.mjs
```

The reason was one line. The deriver's rule was written as **`process.exit(1)`** -- a literal --
and everything else went into `excluded`. So `process.exit(main())`, which is how every battery
here reports its verdict, and `process.exit(2)`, which `fetch-official.mjs` uses for "the pin does
not match and retrying cannot help", were **not failure sites**. And the site list is the only
mechanism in this repository that asks whether a failure exit is proved.

> **A gate is a property -- it exits non-zero when it is unhappy -- and the enumeration was
> reading a spelling.** That is finding 168's shape one level up: there the guard's subject was
> the *document* where it said "section", and here it was the *file* the rule was about.

### The fix, and what the first re-derivation exposed

The deriver now treats any **statement-position** exit whose argument is not the literal `0` as a
failure site, and the exclusions are reported as what they are: `{zero: 7, indirect: 3, multiline:
0}`. `computed` and `numeric_other` are gone as tallies because they are no longer exclusions --
a number under a label that says "we threw this away" is a claim that something was thrown away.

That took the inventory from **50 sites across 32 scripts** to **57 across 37**, and the seven new
sites arrived **unannotated**:

| script | what its exit means |
| --- | --- |
| `fetch-official.mjs` | `process.exit(2)`: a downloaded file does not match its registry pin |
| `inject-stability.mjs` | `main()`: a survivor, an inert anchor, or a failed restore |
| `inject-component-rule.mjs` | same shape, different subject |
| `inject-m1-ceiling-tests.mjs` | same shape, different subject |
| `probe-denial-inventory.mjs` | `unresolved.length > 0` |
| `probe-m1-ceiling.mjs` | `main()`: the ceiling it measured |
| `probe-type-misses.mjs` | `main()`: an aggregate of per-type counts |

Six are exempt with **reasons of their own**, because this file refuses a shared reason -- a
sentence covering two sites would say they are the same check. The seventh, `fetch-official`'s,
is **proved**: `fetch-official.test.ts` already asserts `status === 2` in three places, against a
pin mismatch served from its own loopback server.

### Two second accounts of the same predicate, found by the change

Widening the deriver broke two other guards, and both were **restatements of the predicate it
had just corrected**:

- The first draft of the new `isFailureExitStatement` dropped the path that matched an exit
  **not at the start of a line** -- `if (!ok) process.exit(1);`. `exitArgument` anchors at the
  line's beginning, so it returns `undefined` there, and the new code read that as "not an exit".
  `build-example-bundle.mjs` lost its only failure site, and **`scripts-are-classified.test.ts`
  caught it on the same run** -- which is what that register is for, and it is recorded in the
  code rather than only here.
- `scripts-are-classified.test.ts` carried its **own regex** for "does this script have a failure
  exit", so when the inventory grew by seven sites the two accounts disagreed and five scripts
  were reported as "declared a gate or probe without a failure exit" when each has one. It reads
  the inventory now.

### A class whose reason had gone, and nothing that would remove it

`scripts-are-classified.test.ts` filed six scripts under two headings that both existed **because
the deriver could not read a computed exit**: `computed-probe`, whose members were "absent from
`gate-sites.json` and counted under `excluded.computed`", and three batteries under `harness` on
the ground that each "has no verdict of its own". Measured, each of the three ends in
`process.exit(main())` and `main()` returns non-zero when its own checks fail.

Both headings are removed, the six scripts are now `probe` and `gate`, and `probe-category-inference.mjs`
-- the one member with genuinely no exit -- became a `tool`, because this register requires that
the classes with a failure exit be exactly the scripts the inventory names.

> **A class is a recorded decision, and the decision expires while the class does not.** The
> `computed-probe` heading carried its own justification in a doc comment four lines long, and
> nothing tied that justification to the thing it justified -- so it stood until somebody read it.

### Verified (Pass 49)

| gate | result |
| --- | --- |
| the inventory | **57 failure site(s) across 37 of 40 script(s)**; **49 proved, 6 exempt, 0 unannotated**; exclusions `{zero: 7, indirect: 3, multiline: 0}` |
| what the first re-derivation exposed | **7 unannotated sites** across six scripts, four of them batteries or probes the pipeline runs |
| the guards that refused the change | `scripts-are-classified` (both directions), `probe-built-module-guards` (a probe's second exit stopped being a built-module guard), and `gate-sites-are-proven` on the two sites the deriver's own edit displaced |
| `core` test suite | **141 files, 3756 tests passed** (as of `56079af5f`) |
| `cli` test suite | **4 files, 186 tests passed** (as of `56079af5f`) |
| repo test suite | **145 files, 3942 tests passed** (as of `56079af5f`) |
| `typecheck` / `lint` / `docs:check` | green |

### A green local run and a red CI, and the reading that separated them

The first push of this pass failed CI in `build / typecheck / lint / coverage`, with **every test
passing on the runner**:

```
Test Files  140 passed (140)
     Tests  3756 passed (3756)
    Errors  1 error

Vitest caught 1 unhandled error during the test run.
Error: [vitest-worker]: Timeout calling "onTaskUpdate"
```

The suite was green and vitest exited non-zero. Every case in `check-cli-reference.test.ts`
spawns the gate, the gate imports core's built `dist/index.js`, and one case costs about 2.3 s --
so the five cases this pass added took that file from ~21 s of serial work to ~32 s, and the
worker's RPC to the main process timed out under the accumulated update traffic. This machine is
faster, which is why the same run passed here.

The fix is a second test file rather than a wider timeout: it restores the parallelism the extra
cases were taking away, and the five moved to `cli-reference-backend-table.test.ts` with their
two helpers. **The number to read is `141 files` where the previous pass had `140`** -- one file
became two, which is what the green CI is a statement about.

> **A local green is not a reading about the runner.** That sentence is in
> `.github/workflows/ci.yml` beside the job budgets, and this pass is a second instance of it: a
> shared budget (here, an RPC timeout nobody had measured against) exhausted by work that is
> serial in one file and parallel across two.

### Open

- **`verify-gates-are-testable` reads its subjects from a filename prefix.** `gate-sites.json`
  now enumerates **37** scripts with failure exits; the hollowing check covers the **16** named
  `check-*.mjs`. The two mechanisms disagree about what a gate is, and the disagreement is
  invisible from either one alone. `[open: pointing the hollowing at the inventory's script set
  would take it from 16 subjects to 37, and the cost of that -- one vitest run per referencing test
  file, per subject -- has to be measured before it is paid rather than assumed to be affordable]`

## Pass 50 -- the audit's subjects are the property, and two preconditions it was missing

Pass 49 left one entry in this list: `verify-gates-are-testable` read its subjects from a filename
prefix, `gate-sites.json` enumerated 37 scripts, and the two mechanisms disagreed about what a
gate is. The entry named its own condition -- *the cost has to be measured before it is paid
rather than assumed to be affordable* -- so this pass measured it first.

### The measurement, taken before the change

| | prefix rule | inventory |
| --- | --- | --- |
| subjects | **16** | **37** |
| in one and not the other | 0 | **21** |
| named by at least one test file | 16 | **37** |
| `(subject, test file)` links | 63 | **146** |
| wall time, one full run | **51.26 s** | **103.96 s** |
| peak RSS | 171 MB | 561 MB |

The prefix set is a strict subset of the inventory's, so the change could only widen. Zero
NO-TEST among the 37 was measured before running, not after. The floor for one nested `npx vitest`
invocation was measured separately at **1.4-1.5 s regardless of whether it is handed one file or
five**, so the cost scales with subjects rather than with links -- and 21 more subjects for
**+52.7 s** in a job whose budget is 30 minutes is affordable on the evidence rather than on the
assumption.

**The verdict was the best available and not the one expected:** 37 caught, **0 survived, 0
no-test, 0 unattributed, 0 unparsable**, and `restored byte-for-byte: 37 of 37`. Twenty-one
scripts were fully covered by tests the whole time. Nothing was broken; **the instrument could not
see them**, which is a different defect and the one this audit exists to find in other people's
guards.

| the 21 newly-visible subjects | red tests |
| --- | --- |
| `fetch-official.mjs` | 37 |
| `gen-rcaeval-cases.mjs`, `score-fault-extraction.mjs` | 20, 15 |
| `apply-pins.mjs`, `verify-gates-are-testable.mjs` | 15 each |
| `build-example-bundle.mjs`, `gen-examples.mjs`, `derive-fault-golden.mjs` | 10, 13, 13 |
| `inject-stability.mjs`, `inject-component-rule.mjs`, `inject-m1-ceiling-tests.mjs` | 7, 3, 3 |
| `probe-m1-ceiling.mjs`, `probe-agreement-baseline.mjs`, `probe-denial-inventory.mjs` | 3, 3, 3 |
| `measure-doc-counts.mjs`, `verify-example-pack.mjs`, `verify-scorer-stability.mjs` | 4, 8, 9 |
| `derive-backend-support.mjs`, `derive-gate-sites.mjs` | 3, 5 |

### The defect the widening exposed, in the audit itself

Widening the subject list made `verify-gates-are-testable.mjs` a subject **of itself**, and its
own test file is named by it -- so between the first draft of the tests and the fix, the audit ran
on the real tree from inside its own nested suite, recursively. The working tree was found with
**twelve scripts left hollowed, eight of them carrying two or three `process.exit(0);` markers**,
and the journal's repair record held a hollowed file as its "original".

The mechanism is three links, and only the third is about the audit's code:

1. **A test ran the audit for real.** The only cheap way to ask the script what it measures was to
   run it, and running it recurses. `--list` is now that way, and no test on the real tree runs
   the audit.
2. **Killing a run does not kill its children.** `spawnSync`'s `timeout` kills its direct child and
   nothing below it, so the killed audit's `npx vitest` kept running and kept driving the audit --
   **five orphan `node (vitest N)` processes were observed still rewriting the tree minutes after
   the run they belonged to had died.** This is finding 172's lesson one process down the tree, and
   the reason the first listed precondition is what makes a surviving orphan harmless.
3. **The audit had no precondition and no owner.** It would measure a tree it could see was already
   mutated, and it would read whatever was on disk as the "original" to restore.

So two statements were added, both before anything is written:

- **A tree that is already hollowed is not the shipped tree, and measuring it measures nothing.**
  The marker the mutation writes is the marker the precondition reads, from one constant, so the
  two cannot drift; and because a hollowed "original" can no longer be journalled, the repair can no
  longer be a no-op reported as a repair.
- **Two runs cannot measure one tree at the same time.** The journal records a pid, so a holder that
  is alive makes the next run refuse (repairing under a live run would make *it* read a pristine
  gate and record SURVIVED -- a verdict about nothing) and a holder that was killed is taken over.
  The journal also became a **list** rather than one object, because two kills in a session
  overwrote each other, and a lock acquired with `openSync(..., 'wx')` closes the window the
  journal cannot see: it is empty between two subjects.

Both branches were mutation-checked rather than asserted: disabling the already-hollowed guard
fails exactly `refuses a tree that is already hollowed, rather than measuring one`, and disabling
the liveness test fails exactly `refuses while a live run holds the tree, and takes over from a
dead one`.

### Two more "second accounts", both found by running things

- **`derive-gate-sites.mjs`'s own header documented the rule it had stopped implementing.** It
  still said *"a call to `process.exit(...)` whose argument is the literal `1`"* and listed
  `process.exit(2)` and `process.exit(cond ? 0 : 1)` as deliberately not counted -- three paragraphs
  describing what finding 172 removed, unchanged for a whole pass, with nothing reading them. A
  script's prose about its own rule is as far outside the gates as a tracking document's status
  column.
- **A negative assertion is a mention.** The new test asserted that three scripts with no exit must
  not appear in the subject list, and writing their names in that assertion put them into the corpus
  `scripts-are-classified.test.ts` searches when it asks which scripts **no test file names** -- so
  an assertion that a script must not be a subject deleted one from another guard's evidence. The
  assertion is now over the property -- *every script whose source contains no `process.exit` must
  not be listed* -- and names nothing; and that guard's own claim was restated as what its
  instrument can support, since pinning the exact set would report a coverage change where only
  prose had changed.

### Acceptance

| gate | result |
| --- | --- |
| `verify-gates-are-testable`, full run | **37 subjects, 37 caught, 0 survived, 0 no-test, 0 unattributed, 0 unparsable**; **restored byte-for-byte 37 of 37**; 103.96 s |
| `gate-sites.json` | **60 sites across 37 of 40 scripts**; **54 proved + 6 exempt + 0 unannotated**; excluded `{zero: 8, indirect: 3, multiline: 0}` |
| the audit's own test file | **13 -> 16 tests** (subjects from the inventory both ways; a subject the prefix would miss; the already-hollowed refusal; the live-holder refusal and the dead-holder takeover) |
| `scripts-are-classified.test.ts` | the same claim restated over mentions, and it no longer names a script in a negative form |
| `core` test suite | **141 files, 3761 tests passed** (as of `3148b9410`) |
| `cli` test suite | **4 files, 186 tests passed** (as of `3148b9410`) |
| repo test suite | **145 files, 3947 tests passed** (as of `3148b9410`) |
| `typecheck` / `lint` / `docs:check` / `docs:counts:check` | green |
| CI | run `38924872859` on `7c8561db0` -- **four jobs, all success**; the audit's step **153 s on the runner against 103.96 s here** |

### The budget, measured twice, because one run is not a measurement

The audit's step is the one that changed, and on the runner it went from a step nobody had timed to
**153 s** -- 1.5x the local figure, a ratio only a runner can give you.

The job that hosts every battery is where that lands, and **four runs of this same tree** measured it
at **1375 s**, **1164 s**, **1423 s** and **1059 s** of its 1800 s budget. Same work, a spread of
**364 seconds**.

The planning number is **the largest observed: 1423 s, 79%**, because a budget is exhausted by the
worst run and not by the average. The spread is an estimate of a distribution that more runs can widen
and cannot narrow, so the honest form is *at least* this wide rather than *exactly* this wide.

This paragraph was corrected **three times**, and each correction is the same mistake one sample
smaller. It first wrote `1375 s` down as *the* figure; then reported two samples (`1375`, `1164`) and
called the margin seven to ten minutes; then reported three (`1375`, `1164`, `1423`) and called it two
thirds to four fifths -- and **the fourth run came in at 1059 s, below the floor of that claim**, from
CI, an hour later, for free. Every version was falsified by the next run, and only the version that
names the worst case and says the range can widen is not a sample dressed as a measurement. Finding
166 is this file's record of a budget being exceeded; this is the same file failing four times to say
what a budget measurement is.

### Open

- ~~**`verify-gates-are-testable` reads its subjects from a filename prefix.**~~ **Closed by finding
  173.** The audit takes its subjects from `gate-sites.json`, and the tie is asserted in both
  directions against the real tree rather than by pattern-matching the source: 37 subjects, all 37
  caught, 37 of 37 restored byte-for-byte.
- **The batteries job's worst observed run is 79% of its budget, and four readings of one tree span
  364 s.** Measured on the runner: the audit's step is **153 s** for 37 subjects where it was a step
  nobody had timed for 16, and the job that hosts every battery took **1375 s**, **1164 s**,
  **1423 s** and **1059 s** of its 1800 s on the same tree. Plan with 1423 s. `[open: the last time a
  budget in this file was exhausted the run read as `cancelled` rather than as a limit (finding 166),
  and splitting the audit into its own job is the shape that would buy the margin back -- at the cost
  of a fourth job's checkout, install and build, which is a price this pass did not measure]`
- **A killed run leaves its nested suite behind.** Measured, not inferred: `spawnSync`'s timeout
  killed the audit and five `npx vitest` grandchildren kept running. `[open: the audit's first
  precondition makes a surviving orphan harmless -- it refuses instead of measuring -- but the
  orphan still runs for minutes, holding a CPU and re-reading a tree that is being edited, and
  nothing names it. A nested run in its own process group, killed as a group, is the shape that
  would fix it, and it is a change to how the audit spawns rather than to what it measures]`
- **Nothing in this tree has ever been pointed at a backend it did not write.** Carried from pass
  48 for the third time, and re-signed rather than repeated: the fixture replies to all six readers
  in shapes this repository chose, so what the six readers are tested against is one author's
  reading of six APIs, and every reader in the tree is certified by a document rather than by a
  service. `[open: two of the six were driven against real deployments once, by hand, in passes 44
  and 45, and what that cost was a running service -- so the question this entry keeps asking is
  whether a job can stand one up, and it has been asked three times without an answer]`
- **The tracking documents' status columns are outside every gate in this repository.** Unchanged
  from pass 48, and this pass found a second instance of the same shape *inside* the tree: a
  script's header describing the rule its own function had stopped implementing. `[open: holding
  those columns to anything would need either a cross-repository check or the same facts mirrored
  where a gate can reach them, and neither is obviously the right shape yet]`

## Pass 51 -- a run that dies leaves nothing behind: not the mutation, and not the process

Pass 50 left this entry: *a killed run's nested suite keeps running for minutes, holding a CPU and
re-reading a tree that is being edited, and nothing names it.* Its fix was named as "a change to how
the audit spawns", and three measurements decided what shape that change could take.

### The three measurements that decided the shape

| measured | result | what it settled |
| --- | --- | --- |
| `spawnSync(…, { detached: true })` | the child's pid **is** its own group id | a group can be made and later signalled without touching this process |
| what is in a group | the leader **and its children** -- the first experiment's group held a `sleep` that a pid-only kill would have left | stop the group, not the pid |
| `spawnSync` and the child's pid | returned only **after the child exits** | the current spawn cannot name its suite while the suite is running, which is the only moment the name is worth having |

The third is the one that changed the code rather than adding to it. `runTests` is now `spawn` +
`await`, so the group is known while it runs; `detached` puts it in a group of its own; and the
journal entry for the file being mutated is completed with `suite` a few milliseconds after the
mutation begins.

### Three mechanisms, for three ways to die

The file already had two -- a journal for a run that was killed, and a precondition for a tree a
survivor has left mutated. It now has three, and each is written down with the case the others
cannot cover:

- **A signal** is cleaned up by `interrupted`, which stops the suite, puts the file back and exits
  non-zero. `JOURNAL`'s header has recorded since finding 148 that a handler "does not work", with
  the reason: during a `spawnSync` the event loop is blocked, so it cannot run until the child it is
  waiting for has exited, which is exactly where the kill arrived. **That was a fact about blocking,
  read as a fact about signals** -- awaiting the child frees the loop, and the handler that was
  abandoned for two passes now does the whole sweep.
- **A SIGKILL** cannot be handled by any process, so the journal carries the group and the next run
  stops it before repairing the file.
- **A survivor of either** is made harmless by the precondition on the tree, which is what turns a
  twelve-file corruption into a failed run.

The group is checked against **what it is running** before anything is signalled, and the check
refuses more often than it kills: a group id is reused, so a recorded number can name somebody
else's group an hour later, and a script that signals whatever a stale record points at is worse than
one that leaves an orphan. Two refusals are proved rather than asserted -- a decoy group is left
alone, and the group the audit is *in* is left alone, which is the catastrophic case because a signal
there would take down the shell and the runner with it.

### What an experiment found that reading the code did not

`stopSuite` begins with two guards, and the first version of the second one returned in **silence**
for a value that is neither a usable group nor the documented `null`:

```
if (!Number.isInteger(group) || group <= 0) return false;
```

The comment above it said *every refusal is reported, because a sweep that declines in silence cannot
be told apart from one that found nothing.* The code did not do what the comment said, and what found
it was a **test passing for the wrong reason**: the sandbox handed the audit a group id through a
`sed` substitution, the placeholder was inside quotes, and the result was the string `"96828"` rather
than the number `96828` -- so the guard declined silently, the own-group branch was never reached, and
the test timed out instead of failing. Fixing the test exposed the contradiction; both are fixed, and
the malformed case now has its own test.

### The leak this pass made, in the way this pass is about

One test run left `packages/core/bystander.pid` in the repository. The wrapper played the audit's
part in a group whose members the test could watch, and wrote its bystander's pid **by relative
path** into whatever directory the runner happened to have -- the package, not the sandbox. It was
found by `git status`, which is also how finding 173's twelve-file corruption was found:

> **The measurement that finds a leak is not the verdict; it is the working tree.** Two passes in a
> row have now paid for that sentence, and neither leak was visible in any gate's output.

### Acceptance

| gate | result |
| --- | --- |
| the audit, full run against the real tree | **37 subjects, 37 caught, 0 survived, 0 no-test, 0 unattributed, 0 unparsable**; **restored byte-for-byte 37 of 37**; **108.43 s** (103.96 s before this pass) |
| orphaned processes after that run | **none** |
| mutation checks, one per new guard | **5 of 5 CAUGHT**, each by exactly its own test: same-group spawn, no reap, no identity check, no own-group guard, no signal handler |
| `gate-sites.json` | **61 sites across 37 of 40 scripts**; **55 proved + 6 exempt + 0 unannotated** |
| the audit's own test file | **16 -> 22 tests** |
| `core` test suite | **141 files, 3767 tests passed** (as of `e9e87e9e0`) |
| `cli` test suite | **4 files, 186 tests passed** (as of `e9e87e9e0`) |
| repo test suite | **145 files, 3953 tests passed** (as of `e9e87e9e0`) |
| `typecheck` / `lint` / `docs:check` | green |

### Open

- ~~**A killed run leaves its nested suite behind.**~~ **Closed by finding 174.** The suite runs in
  a group of its own, the group is written down before it can outlive the run that started it, a
  signal is cleaned up on the spot, and a SIGKILL is cleaned up by the next run -- with the group's
  members checked before anything is signalled.
- **The journal cannot name the suite for the few milliseconds before it exists.** The entry is
  written before the mutation and completed after the `spawn` returns, so a kill inside that window
  leaves a file the next run repairs and a suite it cannot name. `[open: the window is written down
  rather than closed, and closing it would mean writing the record before the thing it records --
  which would need a name for the suite that does not exist yet]`
- **No reader is driven against a real deployment by CI.** Unchanged from pass 48: the fixture
  server answers all six shapes faithfully, and it is this repository's reading of six APIs rather
  than the APIs themselves. `[open: a real deployment is what would turn a reader from answering
  our fixture into answering the backend, and it needs either a service to point at or a way to
  stand one up inside the job -- neither of which this repository has today]`
- **The batteries job's worst observed run is 79% of its budget, and four readings of one tree span
  364 s.** Unchanged from pass 50, except that the audit now costs 108 s locally where it cost 104.
  `[open: the numbers are in pass 50; the job gains a battery every few passes, and splitting this
  audit into its own job is the shape that would buy the margin back at a price nobody has measured]`

## Pass 52 -- one reader, against a server this repository did not write

This entry had been carried since pass 48, and the reason it survived three passes was written on
it: the six readers are certified by a fixture **written by the same author**, so what that
certifies is one reading of six APIs, and the fix "needs either a service to point at or a way to
stand one up inside the job". What made it cheap was a measurement rather than a decision.

### The measurement that made it cheap

`prometheus` is a **distribution package**, and on this machine it is already installed at
**2.45.3+ds-2ubuntu0.3** -- the version finding 154 measured by hand, and the sandbox is Ubuntu
24.04.3, the same distribution as `ubuntu-latest`. So the service this entry kept asking for costs
`apt-get install` and no download, and the reader answered it on the first try:

```
ok: true | signals: 1 | quarantine: 0
{ "resource": { "service.name": "prometheus" }, "payload": { "kind": "metric", "name": "up", "value": 1 } }
```

### The first run of the gate failed, and it is the finding

The gate's first version waited for `/-/ready`, then asked. It failed in **0.20 seconds** with
`the reader produced no signal ... Quarantined: nothing` -- about a server that was working. The
three questions it could have waited for are not the same question:

| asked | first true |
| --- | --- |
| `/-/ready` | **0.0 s** |
| an instant query for the same metric | **4.9 s** |
| the range query the reader actually makes | **5.5 s** |

The 0.6-second gap between the last two is exactly where the gate landed. This is the oldest shape
in this campaign one layer out -- **a mechanism's check read as the property's check** -- and it
is the third time this pass alone: closing the readers' gap needed a question the readers do not
ask, and the warm-up needed the question the readers *do* ask.

The second thing the same run taught: a server that answers `200` with **HTML** is not warming up,
it is the wrong address. The first version could not tell those apart and waited its whole budget
for a web console to become an API. An empty window is worth waiting for; a body that is not JSON
is not.

### What the gate is

`scripts/verify-reader-against-backend.mjs`: it finds the binary on `PATH` (no shell), takes a free
port by binding and releasing it, writes a scrape config that labels the target with
`service: prometheus`, starts the server **detached** so its whole group can be stopped, waits for
the range form of *the query it is about to make*, reads it through `pullPrometheusMetrics`, reads
it again with a label the server does not set, stops the server, and waits for the port to stop
answering before it reports anything.

The version it prints is the one **the server said** -- `prometheus_build_info`'s own `version`
label, read through the reader -- and two tests hold that: one asserts a version the stand-in
invents appears in the output, and one asserts two runs against two servers report two different
versions. A constant in the script passes the first and fails the second.

The negative control is the half a fixture cannot supply. A fixture contains the labels its author
chose, so "the reader quarantines a series with no service" is not something a fixture can fail at
honestly. Against the real server the gate reads the same series twice, once with `service` and
once with `not_a_label_this_server_sets`, and requires **zero signals and a quarantine** the second
time. The first run of this check against the real server, before the config labelled anything,
quarantined `prometheus_build_info` for exactly this reason -- which is what made the control
possible rather than an obstacle to it.

### What it does not establish

- **Five of the six readers.** One is not six, and `docs/architecture.md` now says which degree of
  evidence each reader has.
- **A deployment's configuration.** The server here scrapes itself with a label the gate writes.
  What is certified is that the reader meets the real query API, not that it meets anybody's
  Prometheus.
- **That the fixture was wrong.** The fixture answers a different question, thousands of times a
  day, and it stays.

| gate | result |
| --- | --- |
| the gate, against the real distribution server, three runs | **OK**, `prometheus 2.45.3+ds`, 1 real signal, and none without the label; **5.87 s / 6.88 s / 7.09 s** |
| processes left behind, checked after every run | **none** |
| the gate's own tests | **12**, every failure exit and both refusals proved, including a stand-in that ignores `SIGTERM` (the gate cannot stop it, and must say so rather than report a verdict) |
| `gate-sites.json` | **63 sites across 38 of 40 scripts**; **57 proved + 6 exempt + 0 unannotated** |
| `core` test suite | **142 files, 3778 tests passed** (as of `98d9a3c`) |
| `cli` test suite | **4 files, 186 tests passed** (as of `98d9a3c`) |
| repo test suite | **146 files, 3964 tests passed** (as of `98d9a3c`) |
| `typecheck` / `lint` / `docs:check` | green |
| CI | run `38987237960` on `4bb688f6d` -- **four jobs, all success**, and the two new steps ran on the runner: **15 s** to install the backend and **7 s** to read it |

### What the runner said, and why the reading is the point

The two new steps measured **15 s and 7 s** on the runner, and the second number is the interesting
one: locally the gate costs 5.87-7.09 s, so the runner is not slower at all. That is not a
coincidence and it is worth writing down -- **the gate's cost is the server's warm-up, not the
machine's speed**, because the four seconds it spends waiting are four seconds of a Prometheus
starting up on any hardware. The install is the part that is a download.

The job that hosts them went from roughly two minutes to **153 s of its 15-minute budget** across
earlier readings, so the pair costs a fraction of the margin that job has.

### Open

- ~~**No reader is driven against a real deployment by CI.**~~ **Closed for one of six by finding
  175.** Prometheus is read from the distribution's own server in the `verify` job, on every push,
  in a step that took 7 s on the runner.
- **Five readers are still certified by a fixture written by the same author.** `[open: the same
  shape as the entry this pass closed, five times over, and the cost is now known to be "a service
  that can be installed" rather than "somebody stands something up" -- Jaeger, Loki, Elasticsearch
  and Kubernetes are the four, and ClickHouse is the one that was measured by hand and nothing
  re-measures]`
- ~~**The gate's own cost in the job is the apt install, which has not been measured on the
  runner.**~~ **Closed in this pass by the run itself**: 15 s for the install, 7 s for the gate, and
  the job at 153 s of 900. The next entry that needs these numbers has them.
- **The journal cannot name the audit's nested suite for the few milliseconds before it exists.**
  Unchanged from pass 51. `[open: written down rather than closed, and closing it would mean naming
  a process before it exists]`

## Pass 53 -- the official metric was never checked against the official code

This pass started from the roadmap rather than from its own Open list. `04-里程碑与路线图.md` has
one unchecked item under M2:

> **Golden Master 复现 RCAEval `BARO@re2-tt = [0.72, 0.99, 1, 0.83, 0.64, 0.8]`**

Six numbers. Before deciding it was blocked, this pass measured what they are.

### What that vector is, and the two ways it cannot be reproduced

Upstream's README, in the section that shows how to reproduce it:

> "in Table 6, BARO achieves **Avg@5** of 0.72, 0.99, 1, 0.83, 0.64, and 0.8 for CPU, MEM, DISK,
> SOCKET, DELAY, LOSS, and AVERAGE on the Train Ticket dataset"

**Six numbers against seven labels.** The expected-output block immediately below is the artefact
rather than the prose, and it says:

| fault | Avg@5 |
| --- | --- |
| CPU | 0.72 |
| MEM | 0.99 |
| DISK | 1.0 |
| SOCKET | 0.83 |
| DELAY | **0.63** |
| LOSS | 0.64 |

No AVERAGE row, and DELAY is 0.63 rather than the 0.64 a reader gets by pairing the prose's list
in order. So the vector in the roadmap dropped DELAY entirely and took the mean (0.8) for LOSS --
**it is a transcription of upstream's prose, not of upstream's output**, and upstream's prose is
wrong about its own table.

The second way is more fundamental: `Avg@5` is a **solver's** accuracy. BARO is a method that
ranks candidate root causes; reproducing its number means running BARO. This product builds
corpora, exports them and scores submissions -- it does not solve RCA. The exit condition asks the
benchmark factory to be a contestant.

> **An exit condition that names a number the product cannot produce is not an unfinished item.**
> It is an item that will sit unchecked forever, and read as a backlog for exactly that long.

### What the product can hold instead

The property that *is* ours: **our scorer computes the same number as upstream's scorer, given the
same input.** That had never been checked. `officialMetric('rcaeval-re2')` carries the rule as a
prose quote and a `source` string, and the implementation below it was a transcription -- by the
same author, from the same reading, with nothing to disagree with.

So this pass ran **upstream's own `Evaluator`**. Its files were read at a commit
(`259ea4167160256a74ad30004aa3d96a998c846e`) and pinned by sha256; `RCAEval/utility.py` is the one
file supplied by the harness, because `evaluation.py` imports `dump_json`/`load_json` and never
calls them while the real utility package pulls pandas, sklearn, requests and tqdm. Every number in
the new record is upstream's.

**317 case sets, 6162 cases, and 29 of them disagreed** -- all of them on `avg5`, all by exactly
**0.01**, in both directions:

| set | ours | upstream | averaging the rounded rates gives |
| --- | --- | --- | --- |
| `random-40-n29` | 0.49 | **0.48** | 0.49 |
| `random-54-n7` | 0.48 | **0.49** | 0.48 |
| `random-105-n3` | 0.26 | **0.27** | 0.26 |
| `random-137-n16` | 0.42 | **0.41** | 0.42 |

The five `AC@k` values agreed in **all 317 sets**. The defect was in one line: `avg5` was the mean
of the per-k rates **after** each had been rounded to two decimals, while upstream averages the
exact rates and rounds once. The repository already knew this rule -- finding 156 records that *"a
mean written beside a distribution rather than computed from it is a second number that can
drift"*, and `check-roundtrip-record.mjs` asserts exactly that of the score block -- and this was
the one place it was broken.

**Why no existing gate could have found it.** The only RCAEval corpus this project has ever scored
is an oracle export: 375 cases, every one perfect, so every rate is exactly 1 and the two averages
are equal by construction. The bug was invisible on every input that has ever run, and its first
symptom would have been a user's partial-rerank submission being reported one point off.

### The record, and why each entry says what it is for

`golden-master/rcaeval-evaluator.json` holds **86 sets**: the 17 designed ones, the 29 that
disagreed, and 40 controls that agreed. Each carries `kind`, and the test asserts that every
`disagreed` entry still separates "average the rounded rates" from "round the average". Without
that assertion the whole file could be satisfied by a set of perfect cases -- which is precisely
the situation that let the bug live.

The record also states the two divergences it does **not** reproduce: an empty corpus scores 0 here
and prints nothing upstream (a deliberate convention, tested in `official-no-denominator.test.ts`),
and a case whose service did not parse counts as a miss here and can be a hit upstream (reachable
only through an export the structural gate rejects).

### The citation was to a repository with no `main`

`officialMetric('rcaeval-re2').source` read `cruiseresearchgroup/RCAEval`. Measured:

| | `cruiseresearchgroup/RCAEval` | `phamquiluan/RCAEval` |
| --- | --- | --- |
| default branch | `v2` | `main` |
| last push | 2026-02-17 | 2026-09-29 |
| stars | 0 | 242 |
| `evaluation.py` | 2,077 bytes | 8,463 bytes |

Both copies compute the same `accuracy(k)` and `average(k)` -- read side by side to be sure -- so no
number was ever wrong. But the corpus registry, the README whose numbers this metric claims to
reproduce, and the branch that is still moving all point at the other repository, and nothing
compared the two accounts. The citation now names the repository the record was taken from, and a
test holds the two strings to each other.

### Acceptance

| gate | result |
| --- | --- |
| the differential search | **317 sets / 6162 cases** against upstream's `Evaluator`; **5 of 5 AC@k agreed everywhere**, **29 sets differed on `avg5` by 0.01** before the fix, **0 after** |
| `golden-master/rcaeval-evaluator.json` | **86 sets / 1506 cases**; 17 `design` + 29 `disagreed` + 40 `control`; provenance carries the commit and the sha256 of both upstream files, and a six-step reproduction recipe |
| `rcaeval-evaluator.test.ts` | **6 tests**: the record is worth holding (counts, kinds, >1000 cases), the provenance is complete, the citation names the same repository, every pinned verdict reproduced, every `disagreed` entry still separates the two readings, and both divergences stated |
| mutation checks, one per guard | **3 of 3 CAUGHT**: averaging the rounded rates again, a per-k denominator off by one, the citation back to the other repository |
| `core` test suite | **143 files, 3784 tests passed** (as of `4369140`) |
| `cli` test suite | **4 files, 186 tests passed** (as of `4369140`) |
| repo test suite | **147 files, 3970 tests passed** (as of `4369140`) |
| `typecheck` / `lint` / `derive-gate-sites --check` | green |

### Open

- **The other eight targets are still transcriptions.** OpenRCA 1.0/2.0, RCA100, AIOps2025,
  Cloud-OpsBench and ITBench each carry a prose rule and a `source` string, and only RCAEval is now
  held to code somebody else wrote. `[open: two of those six quote a paper rather than a released
  evaluator, so there may be nothing to run -- which is a different and equally worth-writing
  answer, and it has not been established which targets have a runnable oracle]`
- **The record cannot be regenerated inside CI.** It needs upstream's source, which is fetched by
  hand and pinned by digest; the recipe is in the record, but nothing runs it. `[open: a job that
  re-fetches the two files and re-runs the generator would turn the pin into a drift detector, at
  the cost of a network dependency in a gate -- and the value depends on how often upstream's
  evaluator changes, which is a number nobody has measured]`
- ~~**The roadmap's M2 exit condition asked for a contestant's score.**~~ **Closed by finding
  176**: corrected in `04-里程碑与路线图.md` and in the acceptance table of
  `03-验收计划与验收标准.md`, and the vector it quoted is recorded as unproducible rather than
  pending -- it drops DELAY and reads upstream's average as LOSS.
- **Five readers are still certified by a fixture written by the same author.** The one time an
  outside implementation was consulted -- upstream's evaluator, this pass -- it found a defect that
  seven passes of self-consistency had not, which is the argument. `[open: Jaeger, Loki, Elasticsearch
  and Kubernetes need a server the sandbox cannot currently obtain, and ClickHouse needs 253 MB
  through a channel that is timing out today; the four are unchanged, and the measurements that say
  so are in pass 52's cost table rather than in a hunch]`


## Pass 54 -- the check existed, the wiring was attempted, and the pipeline refused it

This came out of pass 53's own bookkeeping. Every pass updates
`golden-master/doc-counts.json` by hand, and the question that had never been asked is **what
fails if that update is forgotten**.

### The hole, stated exactly

| question | who answers it | in CI |
| --- | --- | --- |
| do the documents agree with the snapshot? | `check-doc-counts.mjs`, inside `docs:check` | **yes** |
| does the snapshot agree with the suite? | `measure-doc-counts.mjs --check` (`docs:counts:check`) | **no** |

`grep -n 'counts:check' .github/workflows/ci.yml` returned nothing. A snapshot that drifts in
**both** places at once -- somebody adds tests and forgets the number -- leaves every document and
every guard internally consistent and wrong, with the pipeline green.

That is not hypothetical: pass 52 found the snapshot at **139 files / 3686 tests** against a suite of
**140 / 3747**, with every gate green, and found it by reading two numbers side by side.

### The attempt

One step in the `verify` job, measured at **80.09 s** locally against a job at 153 s of its 900 s
budget, plus two tests in the file that already owns the routing rule:

- the workflow must `run: pnpm docs:counts:check`, anchored to a `run:` line, because that file's
  own header records the break where a **comment** satisfied a bare `includes`;
- the package script must point at `measure-doc-counts.mjs **--check**`, not at the writing mode --
  a check that rewrote the snapshot would green-light exactly the drift it was added to report.

Mutation-checked locally: deleting the step failed **exactly one** test and left the other eight
green.

### What the pipeline said, and why it is not "flaky"

CI failed the step, and the reason is not the counts:

```
Error: [vitest-worker]: Timeout calling "onTaskUpdate"
Error: Command failed: pnpm --filter @rca-bench-factory/core test
    at measure (scripts/measure-doc-counts.mjs:103:17)
```

**Every test passed.** The step runs the whole suite a **second time** in the same job -- the
coverage step already ran it once -- and on a two-core runner the worker RPC to the main process
timed out under the accumulated update traffic. Vitest exits non-zero for an unhandled error even
when the suite is green.

This is pass 49's failure with a different cause. There, the trigger was one test file that spawned
the CLI per case (32 s of serial work), and the fix was to split it. Here the trigger is
**repetition of a suite that is already at the edge of that budget**. The same error message, and
the same wrong lesson available: it looks like a flake, and calling it one would have meant a retry
button instead of a measurement.

### The decision, on evidence

**The wiring was reverted.** What remains is the finding, the measured price, and the precise
constraint:

| reading | value |
| --- | --- |
| `docs:counts:check` alone, locally | **80.09 s**, OK |
| the `verify` job before the step | **153 s** of 900 |
| the suite run a second time in that job, on the runner | **`onTaskUpdate` timeout**, suite green |

The shape that would work is not another job and not a retry: it is **reading the run the job
already took**. `measure-doc-counts.mjs` runs each package separately today (`--filter core test`,
`--filter cli test`) precisely so it can attribute counts; the coverage step produces one combined
transcript, so reusing it needs per-package attribution from a single log -- a change to both
scripts, and one that is verifiable locally instead of only on a runner.

### The leak this pass found in its own tooling

The thirteen batteries were running when the session ended. The process died inside
`inject:fault-extraction-scoring`, and `packages/core/src/fault/extraction-scoring.ts` was left with
a seven-line guard **deleted** -- found by `git status`, restored, and then the battery was re-run
(12 of 12 caught).

Nothing repairs that: **no battery writes a journal**, and each takes its backup with
`shutil.copy(SRC, PRISTINE)` at start -- so a run that begins before somebody reverts **copies the
mutated file into the pristine slot**, then certifies `source restored: identical to the pristine
capture`, which is true and worthless. Finding 173's defect, one layer out: the audit got a journal
and a precondition; the batteries that mutate a dozen source files did not.

### Acceptance

| gate | result |
| --- | --- |
| the attempt | step + 2 tests, mutation-checked locally (deleting the step fails exactly one) |
| CI on the attempt | **failed**: `onTaskUpdate` timeout on the second suite run, every test green |
| the revert | `ci.yml` and the routing test are back to 7 tests; the hole is **open and recorded** |
| `core` test suite | **143 files, 3784 tests passed** (as of `209d20e`) |
| `cli` test suite | **4 files, 186 tests passed** (as of `209d20e`) |
| repo test suite | **147 files, 3970 tests passed** (as of `209d20e`) |
| batteries | **13 of 13, rc=0**, after restoring the mutation the interrupted run left behind |
| `typecheck` / `lint` / `docs:check` / `docs:check:cold` | green |

### Open

- **The counts snapshot is still not compared to the suite in CI.** `[open: the attempt is measured
  and rejected -- a second full suite run in the same job trips `onTaskUpdate` on a two-core runner
  with every test green. The shape that would work is reusing the coverage run's transcript, which
  needs per-package attribution from one log; that is locally verifiable and is the next step here,
  rather than a retry or a fifth job]`
- **A killed run leaves every battery's mutation behind, and the next run adopts it as pristine.**
  Measured in this pass: one file, seven lines, left by `inject:fault-extraction-scoring`. No battery
  writes a journal, and `shutil.copy(SRC, PRISTINE)` at start means a run that begins before somebody
  reverts copies the mutation into the pristine slot and then certifies it. Finding 173's defect one
  layer out. `[open: the shape is known because finding 174 built it for the audit -- journal before
  the mutation, repair at start, refuse a mutated tree -- and it needs a shared helper the twelve
  Python batteries call, which is a change to the battery protocol rather than to any one battery]`
- **The snapshot is still a number somebody types.** Nothing generates it. `[open: generating it
  means writing a tracked file from CI, which is a change to how the repository is maintained rather
  than to what it checks]`

## Pass 55 -- a killed battery left a mutation, and the next run adopted it as pristine

Pass 54 recorded the leak it walked into: the thirteen batteries were running when the session
ended, the process died inside `inject:fault-extraction-scoring`, and
`packages/core/src/fault/extraction-scoring.ts` was left with a seven-line guard deleted. That was
the second time -- finding 173 found **twelve** files in the same state -- and both times the only
thing that noticed was `git status`.

### The half that made it permanent

A battery does not merely leave a mutation. Each one captures its backup **at start**:

```python
shutil.copy(SRC, PRISTINE)
...
shutil.copy(PRISTINE, SRC)      # after every injection
...
assert_source_restored()        # compares SRC against PRISTINE
```

So the next run, starting before somebody reverts, **copies the mutated file into the pristine
slot** and then certifies `source restored: identical to the pristine capture`. The check is true
and worthless -- finding 173's `repairFromJournal` defect, which compared a file against the bytes
it had just written, in a second place.

> **An assertion is only in force while the process that makes it is alive.** The reasoning that
> left this gap was "each battery asserts its own restore, so nothing else needs to". After a kill
> there is no process to make the assertion, and the backup slot is refilled by the next run's
> confidence.

### The experiment, run before the fix and again after

| step | measured |
| --- | --- |
| `inject:doc-counts`, **SIGKILL** its python process mid-loop | journal `battery-journal-87159.json` present; `scripts/check-doc-counts.mjs` one line mutated; process gone |
| the same battery again | stderr `_witnesses: repaired doc-counts-shapes (pid 87159 is gone), 1 file(s) put back`; then `12 caught, 0 survived, 0 inert`; journal gone; tree clean |

### `guard(label)`, and the four decisions in it

`scripts/injection/_witnesses.py`:

- **Repair at entry.** Every leftover journal is examined; the holder is identified by reading
  `/proc/<pid>/cmdline` and asking whether it is a battery at all -- **a pid is reused**, and this
  is finding 174's group-id lesson one identifier down. A dead holder's bytes are written back and
  **verified against the record**; a live holder makes the run refuse, because repairing under it
  would make *it* read a file it did not mutate.
- **Record subtrees, not names.** `scripts`, `packages/core/{src,test}`, `packages/cli/{src,test}`,
  `golden-master`: **270 files / 4.3 MB / 4 ms**. A hand-written subject list that forgets one file
  is the defect itself, so the record is deliberately larger than any battery needs.
- **Restore on the exception path**, including Ctrl-C, and clear the journal.
- **Do not restore on a normal exit, and do not leave a record either.** If the guard repaired on
  the way out, every battery's `assert_source_restored` would pass no matter what it did, and the
  check this repository spent a finding on would become vacuous.

  The second half was learned by being bitten, in this pass. The first version kept the journal when
  a file still differed, so the next run could repair a battery that forgot -- which meant a journal
  also outlived a run whose subject had been edited by a **person** while it ran. That is not
  hypothetical: `golden-master/doc-counts.json` was edited during a battery run here, and the next
  battery's repair put the old bytes back over the edit. A record taken at start cannot tell a
  battery's mutation from a person's edit, so it is dropped at a normal exit; a battery whose
  restore failed says so through its own assertion and a non-zero exit.

The ten Python batteries now run as `with W.guard("<name>"): return _measure()`.

**The three Node batteries do not, and the census cannot see them.** `inject-stability.mjs`,
`inject-component-rule.mjs` and `inject-m1-ceiling-tests.mjs` mutate tracked files and restore them at
the end of a loop, exactly like the Python ones -- but they carry no `INJECTIONS` table, and the
register in `batteries-verify-their-restore.test.ts` admits a file to its census by `table && writes`.
So they are outside both the guard and the census, and a kill during one of them leaves the same
mutation with **no record to repair from**. Stated here because the alternative is a sentence that
reads as "every battery is covered" while three are not.

### The second thing a kill leaves: the battery's own lock

`gate-tests-battery.py` -- the one that rewrites the gate scripts -- keeps a lock in `tmpdir` so two
copies cannot share the tree. Its own docstring says a SIGKILL leaves the file behind and the next
run refuses until somebody removes it, and calls that the safer failure.

It is safer than the alternative, and it is still a failure a retry cannot get past: the job that
was killed is exactly the job that will be retried, and it fails on a lock left by itself. Measured
here -- the run this session killed left `/tmp/rca-bench-factory-gate-tests-battery.lock` holding
pid 226480, and the next `gate-test-battery-attribution` run failed with **exit 3** and a message
telling a CI reader to `rm` a file.

The lock already writes the owner's pid into the file, so the question is answerable with the check
the journal already had: **is the owner still a battery?** A lock whose owner is gone is taken over,
and the takeover is printed; a live owner still refuses. The three tests that were failing on the
stale lock pass again, and the file gained a case for both halves.

### The leak this pass found in its own test

The first version of `battery-journal.test.ts` wrote journals into `node_modules/.cache` -- the real
one -- and its cases repaired each other's subjects. The failure it produced was a repair of a
subject belonging to a finished test. That is the same shape as the defect being fixed, one level
up: **a test's scratch escaping into the tree it measures.** The cache is now overridable through
`RCA_BENCH_BATTERY_CACHE`, and the test points it at its own directory.

A second guard caught the file too, and was right to: `coverage-writes-are-drained.test.ts` refuses
a test file that starts an asynchronous child without joining it. The two holders in these cases are
now killed and **awaited**, which is also what keeps the file from pushing coverage into the
reporter after its queue is drained.

### Acceptance

| gate | result |
| --- | --- |
| mechanism tests | **7**: a dead holder is repaired, a live battery is refused, a recycled pid is not a holder, an unverifiable repair fails, an exception restores, **a normal exit neither repairs nor leaves a record**, and a lock whose owner is gone is taken over |
| mutation checks | **5 of 5 CAUGHT**, each by exactly its own test |
| the wiring, asserted | `batteries-verify-their-restore.test.ts` gained `guardsWithJournal`; **deleting any battery's guard turns it red** |
| the end-to-end experiment | SIGKILL -> repair -> `12 caught`, tree clean (table above) |
| `core` test suite | **144 files, 3792 tests passed** (as of `d43a2d9`) |
| `cli` test suite | **4 files, 186 tests passed** (as of `d43a2d9`) |
| repo test suite | **148 files, 3978 tests passed** (as of `d43a2d9`) |
| batteries | **13 of 13, rc=0**; the ten Python ones run inside the guard, the three Node ones do not |
| `typecheck` / `lint` / `docs:check` | green |

### Open

- ~~**Three Node batteries are outside the journal, and the census cannot see them either.**
  `inject-stability.mjs`, `inject-component-rule.mjs` and `inject-m1-ceiling-tests.mjs` mutate tracked
  files without an `INJECTIONS` table, which is the register's admission rule -- so their absence is
  invisible rather than recorded.~~ **Closed by finding 179.** The guessed repair -- "admit a file by
  *writes a tracked path and restores it* rather than by a table" -- was wrong, and it was wrong in a
  way worth keeping: every generator in `scripts/` writes a tracked path, so that rule would have
  admitted twelve tools and called them batteries. The table was never the problem; the *case* was.
  The rule is case-insensitive now, and admitting the three files made the census report four more
  defects it had never been able to see.
- **A kill plus a concurrent edit is still ambiguous.** A normal exit now drops the record, so an
  edit made during a run survives. But a *kill* leaves the record, and if a person edited a guarded
  file in the same window the repair will revert that edit. Narrow, and not reachable from CI.
  `[open: the shape that would close it is recording at write time instead of at start -- one more
  IO per injection, at 25 write sites -- and it needs a decision about what a record means when the
  writer is a person]`
- ~~**The counts snapshot is still not compared to the suite in CI.**~~ **Closed by finding 180.**
  Pass 54 was right that the obvious wiring fails and wrong about what it needed: not a transcript
  to parse, but a **report vitest already writes**. `test:coverage` now emits its JSON report, and
  `--from` derives the same three scopes from it in **0.056 s** against the spawn's **77.35 s**.
- ~~**Eight score targets are still transcriptions.**~~ **Narrowed by finding 181**: OpenRCA 1.0 is
  now held to `main/evaluate.py` over 28 cases, and the transcription it replaced was wrong on 10 of
  the first 25. Seven remain.

## Pass 56 -- the census could not see three batteries, and "could not see" was the finding

### The item was a sentence, and a sentence is not an instrument

Pass 55 ended with a paragraph saying that three batteries were outside the journal *and* outside the
census, because the census admits a file by a mutation table and those three had none. That is a
true sentence. It is also the shape this campaign keeps finding: **a hole that is documented reads
like a hole that has been dealt with.** Nothing failed when those three were killed; nothing failed
when they were wired, either -- the wiring was invisible to every rule in the repository.

So the subject of this pass is not "add a journal to three files". It is: *why could a census built
to catch exactly this not see three of thirteen?*

### What the admission rule was keyed on

```js
const hasTable = /\b(INJECTIONS|MUTATIONS|mutations)\s*[:=]/.test(source);
```

Three spellings, and the third is the lowercase form of one of the first two, which means the
alternation was never about case -- it was a list of the words somebody had typed. All three
JavaScript batteries write `const injections = [`. One character of regex stood between ten batteries
and thirteen, and no amount of reading the rules would have shown it, because the rules are stated
*over the set*.

With `/i`, the census reported four more defects in those three files, and each is a rule that had
been written against the file in front of its author:

| rule | what it was reading | what the files say |
| --- | --- | --- |
| the restore verdict gates the exit | a *bare* `restored = ...` | `const restored = ...`, and `const mismatched = ...` in one of them |
| the battery runs inside the journal | `W.guard('...')` | `withJournal('...')` |
| the backup is outside the tree | any `.bak` anywhere in the source | `node_modules/.cache/extraction-scoring.bak.ts`, which is the recommended location |
| the record's label is the battery's name | `name.slice(0, -3)`, which strips `.py` | `.mjs` is four characters, so the label was `inject-stability.` |

The last one was introduced *while fixing the third*, one line lower in the same object literal. That
is the most useful thing in the table: the failure mode is not carelessness, it is that a rule
inherits the shape of its first subject and then looks general.

### The fifth defect, which no rule was asking about

Two of the three batteries captured their subject while the module loaded:

```js
const suiteOriginal = readFileSync(SUITE, 'utf8');   // runs before withJournal is called
```

Everything about the guard was correct and this one line would have defeated it. A battery that reads
at load time captures whatever a killed run left, mutates from that, and writes it back as "the
original" -- and then prints `source restored: identical to backup`, because it is. Finding 173's
defect wearing the repair, and it would have shipped in this pass if the wiring had been the whole of
it. The census now has a rule for it (`readsBeforeTheRepair`), and the rule is proved by putting the
line back: red.

### The handler that was written, measured, and deleted

`journal.mjs` first installed `SIGINT`/`SIGTERM`/`SIGHUP` handlers that restored and re-raised. It
looked like a strict improvement on the Python side, which only gets Ctrl-C for free. Then a
three-line experiment:

```
process.on('SIGTERM', restore);  execFileSync('sleep', ['5']);
---------------- SIGTERM sent here ----------------
stderr: (nothing)     exit 0     handler never ran
```

A Node signal callback runs on the event loop, and a battery's entire mutation window is spent
blocked inside `execFileSync`. The handler would fire between injections -- the interval that needs
it least -- and never during the sixty seconds that matter. That is worse than no handler, because it
invites the reader to rely on it.

> A guard that fires everywhere except the window it was written for is worse than no guard.

So the module has none, and the guarantee is the record on disk plus the next run. The test asserts
it in the state that matters: a child blocked in `Atomics.wait` is killed with SIGTERM, the tree stays
mutated, the record stays, and the next run repairs it.

### The end-to-end, with the real batteries

| step | measured |
| --- | --- |
| `node scripts/inject-component-rule.mjs`, **SIGKILL** at 4 s | record `battery-journal-614736.json` (label, script name, **272** entries); `fault-prompt-grammar.test.ts` mutated |
| `node scripts/inject-stability.mjs` -- a different battery | `journal: repaired inject-component-rule (pid 614736 is gone), 1 file(s) put back`; `4 caught, 0 survived, 0 inert`; tree clean; no record |
| a Node record read by `_witnesses.py`, and a Python record read by `journal.mjs` | both directions asserted in the suite, not assumed from "the formats look the same" |

One format, two writers, because the battery that repairs a kill is whatever runs next and the
schedule does not promise a language.

### Two exemptions whose reasons had expired

Re-deriving `gate-sites.json` moved three lines and dropped their annotations. The reasons they came
back with were the old ones, and the old ones said:

> Until `verify-gates-are-testable` takes its subjects from this inventory instead of from a filename
> prefix, a computed exit here has no mechanism that would notice the line being emptied.

That was true when it was written and stopped being true at finding 172. The sites stay `exempt`
because no test *executes* a battery that spends a suite run mutating tracked files, so `provedBy`
has nothing to point at -- but each now says what is actually the case: emptying the line surfaces as
inventory drift, which is a static claim, not a test driving the status. An exemption whose reason
expired is the same defect as a proof whose test was deleted, and only a re-derivation would have
surfaced it.

### Acceptance

| gate | result |
| --- | --- |
| mechanism tests | **9** in `battery-journal-node.test.ts`, each naming one property of the record |
| mutation checks | **13 of 13 CAUGHT** (6 against `journal.mjs`, 6 against the census rules, 1 against a battery capturing at module scope), each by the case named in its row |
| the wiring, asserted | `readsBeforeTheRepair` and the two guard spellings; deleting any of them turns the census red |
| end-to-end | SIGKILL -> repair by a different battery -> `4 caught`, tree clean |
| `core` test suite | **145 files, 3803 tests passed** (as of `224b1a8`) |
| `cli` test suite | **4 files, 186 tests passed** (as of `224b1a8`) |
| repo test suite | **149 files, 3989 tests passed** (as of `224b1a8`) |
| coverage | core **99.97 / 99.93 / 100 / 99.97**, cli **100 × 4** |
| gate sites | **63 across 38 scripts**, deriver `--check` OK |
| the three JavaScript batteries | **4 / 8 / 8** caught, 0 survived, 0 inert, restores identical |
| record cost | **272 files / 4.35 MB / 34 ms** per entry and exit, against batteries that take 3 to 60 s |
| `typecheck` / `lint` / `docs:check` | green |

### Open

- **A kill plus a concurrent edit is still ambiguous.** A normal exit drops the record, so an edit
  made during a run survives. A *kill* leaves the record, and a person's edit inside that window is
  reverted by the repair. `[open: the shape that would close it is recording at write time rather
  than at start -- one more IO per injection, at 25 write sites -- and it needs a decision about what
  a record means when the writer is a person]`
- ~~**The counts snapshot is still not compared to the suite in CI.**~~ **Closed by finding 180**,
  one pass after this entry was copied forward. The reading exists; what was missing was a way to
  reuse it, and that turned out to be a file the coverage step already writes.
- ~~**Eight score targets are still transcriptions.**~~ **Narrowed by finding 181**, one pass after
  this entry was copied forward. OpenRCA 1.0 is held to the evaluator; seven targets are not.
- **The JavaScript journal has no way to tell a `python3 -c` battery from a stranger.** A record with
  no `script` field falls back to "does the command line mention `injection`", which is right for the
  ten Python batteries and wrong for a Node battery that was somehow started without a file.
  `[open: not reachable today -- every battery is a file -- but the fallback is a heuristic kept for
  old records, and the condition under which it should be deleted has not been written down]`
- **One CI run of this commit failed 21 files with a module namespace that should be impossible, and
  a rerun of the same commit was green.** Step 10 reported **361** failing tests, every one of them
  either `(0, __vite_ssr_import_N__.assertExportableBundle) is not a function` or
  `STRUCTURAL_CODES is not iterable`. A function declaration is hoisted and a module-scope `const` is
  initialised at evaluation, so a namespace that has `exportAioPs2025` but not
  `assertExportableBundle` means the module was still evaluating when its caller ran -- and no import
  cycle reaches `export/guard.ts`. The two cycles that do exist are `score/score.ts <-> score/official.ts`
  (type-only in the runtime direction) and `score/score.ts <-> targets.ts <-> cli/args.ts <-> score.ts`;
  neither includes the guard, and every failing test was in a file that imports the exporters or the
  scorer. Ruled out by measurement: three local full coverage runs green -- 32 cores at 8 workers,
  the same suite pinned to two cores with `taskset`, and `CI=true` -- and a rerun of the same commit on
  the same runner image, green in **154 s**. `[open: 361 red tests is not noise, so this is recorded
  rather than dismissed. The next instrument is the module graph the failing worker actually saw --
  vite-node's `__vite_ssr_import__` resolution per file -- and that needs a run that reproduces;
  the honest state is that one has not]`

## Pass 57 -- the reading was never missing; the pipeline had no way to reuse it

### Two copies of one fact, and neither one could notice the other

`docs/progress.md` publishes how many test files and tests the suite has.
`golden-master/doc-counts.json` is the measurement those rows are checked
against. `docs:check` holds the **document to the snapshot** -- and nothing held
the **snapshot to the suite**, so the pair could be wrong together while every
gate reported agreement. That has been written down since pass 54 as an open
item, with the measurement that killed the obvious fix:

> a second full suite run in the same job trips `onTaskUpdate` with every test
> green

The diagnosis in that sentence is about cost. The actual obstacle was that
**nobody had asked vitest for the reading it was already producing**: the
coverage step runs the whole suite on every push, and `--reporter=json` writes a
file with one entry per test file and one per assertion.

Two findings came out of that question, and they share a shape: *a fact stored
by coordinate instead of by identity goes stale, and nothing is watching it.*

### Finding 180a -- the counts, read from the run that already happened

`test:coverage` now writes `node_modules/.cache/vitest-report.json` beside its
coverage output, and `measure-doc-counts.mjs --from` derives the same three
scopes from those reports.

**The reading had to be shown to be the same reading.** Counting files and
assertions from a report is a second definition of "a passing test", and this
repository has twice shipped two green numbers that disagreed. So both readers
are held against **one captured run** -- `vitest-report-{core,cli}-sample.json`
are real captures, with the summary lines their runs printed recorded in the
test beside them -- and the mutation check counts a skipped assertion or a
failed file as a pass if the rule is loosened.

| path | cost | result |
| --- | --- | --- |
| `pnpm docs:counts` (spawns three suites) | **77.35 s** | 147 / 3818 · 4 / 186 · 151 / 4004 |
| `--check --from <the two reports>` | **0.056 s** | identical |

And because `--from` reads `pnpm-workspace.yaml` rather than trusting the root
`test` script's two `--filter` flags, it also asserts something the spawn could
not: **every workspace package that declares a `test` script must contribute a
test file**, and **every test file in a report must belong to one**. A third
package added to the workspace and forgotten by the root filter is now a failure
that names it, instead of a `repo` count that is quietly short.

### Finding 180b -- an annotation carried by coordinate is lost by any edit above it

The first full run of the new tests failed, and the failure was not mine: adding
a docstring to `measure-doc-counts.mjs` moved its failure site from line 66 to
97, and re-deriving dropped the site's `proved` status.

`derive-gate-sites.mjs` carried the three hand-authored columns across a rewrite
**by `script:line`**, and said so in a sentence that reads as a considered trade:

> Annotations are matched by `script:line` and dropped for a site that no longer
> exists, so a moved guard loses a stale proof rather than inheriting a wrong one.

The second half is right. The first half is not what happens: **every edit above
a site moves its line**, so a proof is dropped for a guard that did not change at
all -- and the guard then fails on `main` with

```
scripts/measure-doc-counts.mjs:97 has status 'undefined'
```

which names a coordinate rather than a defect, and reads like a missing proof
where there is a moved one. Measured twice: three sites in pass 56, one here. The
same file already computes the identifier that is stable under exactly that edit
-- the fingerprint, which its own header calls *"stable under reindentation and
reformatting"* -- and `--check` compares fingerprints. Carrying by line while
checking by fingerprint was two answers to one question, and the coordinate
answer was the wrong one.

The carry now uses the fingerprint. Re-deriving the real tree reports
**`annotations: 63 of 63 carried`**, and the site that moved keeps `proved`.

Two details the first version could not have had:

- **a proof is consumed when it is used.** Two `process.exit(1)` calls with no
  diagnostic above them have the same fingerprint; without consuming the
  candidate, one proof would be attached to both and one of them would be a proof
  about a line it is not.
- **an ambiguous fingerprint is refused, not guessed.** With several identical
  candidates the line is the only evidence left, so an unmoved one is preferred;
  if none matches, the annotation is dropped and the site is named
  (`ambiguous: ...`). A wrong proof is worse than a missing one -- which is what
  the old sentence was trying to say, one implementation too early.

### Acceptance

| gate | result |
| --- | --- |
| mechanism tests | **15**: 8 on the two readings of one run, 7 on the carry |
| mutation checks | **7 of 7 CAUGHT**, each by the case named in its row |
| the carry, end to end | a re-derivation over a copy whose prior lines were all shifted by 1000 still carries **63 of 63**; the line-keyed version carries **0** |
| the two readings | agree exactly on the real tree, and on the captured pair |
| `core` test suite | **147 files, 3818 tests passed** (as of `01a57c7`) |
| `cli` test suite | **4 files, 186 tests passed** (as of `01a57c7`) |
| repo test suite | **151 files, 4004 tests passed** (as of `01a57c7`) |
| coverage | core **99.97 / 99.93 / 100 / 99.97**, cli **100 × 4** |
| gate sites | **63 across 38 scripts**, 63 of 63 annotations carried |
| CI | the new step reads the reports in **0.056 s**; the job that could not afford a second suite run now has the comparison for free |
| `typecheck` / `lint` / `docs:check` | green |

### Open

- **A kill plus a concurrent edit is still ambiguous**, and this pass touched no battery.
  `[open: the closing shape is a record written at write time rather than at start -- one more IO at
  25 write sites -- and it needs a decision about what a record means when the writer is a person]`
- **Seven score targets are still transcriptions**, and this pass established one oracle, not seven.
  `[open: RCAEval and OpenRCA 1.0 are held to code somebody else wrote; OpenRCA 2.0, RCA100,
  AIOps2025, Cloud-OpsBench and ITBench carry a prose rule and a `source` string, and whether any of
  them has a runnable evaluator at all has not been decided]`
- **The JavaScript journal cannot tell a `python3 -c` battery from a stranger**, unchanged.
  `[open: unreachable today, but the fallback exists for records written before the field did, and
  the condition for deleting it has not been written down]`
- **One CI run of pass 56 failed 21 files with a module namespace missing its own exports**, and a
  rerun of the same commit was green. Nothing here touched it.
  `[open: the next instrument is the module graph the failing worker saw, and that needs a run that
  reproduces -- none has appeared in three local coverage runs or in the rerun]`

## Pass 58 -- the rule was written for a list, and this repository implemented it for one

### What the citation pointed at, and what the rule actually says

`openrca-1.0`'s metric carried `source: 'microsoft/OpenRCA main/evaluate.py'` and
`provenance: 'official'`. Finding 176 established the standard for that claim on
RCAEval: a rule transcribed by the author of the scorer is not an oracle. The
same file was read this pass, at
`c121a483a5a91dbae50708e5942c42a6609098b2` (10,536 bytes, sha256
`9a1c2351…d53f1`), and the transcription is wrong in three ways:

| upstream | here, before |
| --- | --- |
| the denominator is every declared criterion in **every** root (`scores_num = len(components)+len(reasons)+len(times)`) | three criteria, from the first root only |
| a count mismatch scores **zero** (`if scoringpoints_length == prediction_length`) | scored whatever was answered |
| the numerator is the **best assignment** over permutations | compared by position |

So the rule was a *projection* of the published metric onto a single-fault
answer, and the product's own data model is single-fault
(`GroundTruth.rootCauseComponent`), which is why nobody noticed: every fixture
in the tree was single-root.

### The measurement, before the change

28 `(prediction, scoring_points)` pairs in `golden-master/openrca-evaluator.json`,
each with the `(passing, failing, score)` triple upstream's own `evaluate()`
returns. On the first 25:

```
disagreements 10 of 25
two-second-component-wrong   here 1.0    upstream 0.83
two-out-of-order             here 0      upstream 1.0
two-but-one-prediction       here 1.0    upstream 0
three-one-criterion-wrong    here 1.0    upstream 0.89
```

**Not one direction.** The projection inflated a two-root key to a perfect 1.0
where upstream says 0.83, and scored a correctly permuted two-root answer 0 where
upstream says 1.0. A benchmark number that is wrong in both directions cannot be
corrected by a caveat.

### After

```
disagreements 2 of 28
reason-with-quotes   here 1.0   upstream 0.67
embedded-in-prose    here 0     upstream 1.0
```

Both are **parsers, not rules**, and both are recorded in the corpus with their
direction and an argument rather than quietly matched:

- upstream recovers a block with a non-greedy regex, so a reason containing a
  double quote is truncated and its criterion is lost. This repository parses the
  cell as JSON. **Reproducing the truncation would score a correct answer lower
  for being correct.**
- upstream finds a JSON block anywhere in the cell; this repository requires the
  cell to parse. Our exporter writes JSON, so an export is unaffected -- a
  model's prose answer is not.

The direction is asserted, so a change that starts agreeing fails the test.

### What changed in the scorer

- `readOpenRcaRoots` reads **every** block a cell declares, in numeric order,
  instead of `parsed['1']`.
- `scoreOpenRcaRoots` implements the published rule: the denominator is the sum of
  the three declared lists, a length mismatch returns 0, and the numerator is the
  maximum weight of a perfect matching between predictions and scoring points --
  computed as a bitmask DP over the same maximisation upstream enumerates as
  permutations, bounded by the key's root count because a mismatch returns first.
- One upstream **quirk is reproduced deliberately**: a criterion list shorter than
  the root count is not scored, while its length still divides. A key with two
  components and one reason can therefore never be fully earned, and two corpus
  cases pin that.
- A one-root key carries no block: the scorer rebuilds the same three lists from
  the flattened triple, and a second copy would be a second place to keep in step.
  The block is carried only when the triple cannot stand for the key.

### Acceptance

| gate | result |
| --- | --- |
| corpus | **28 cases**, pinned by repo + commit + bytes + sha256, with the method written into the file |
| agreement | **26 of 28**; the 2 differences are declared, argued, and asserted in their direction |
| mechanism tests | **8**: the corpus's identity, its multi-root coverage, its difference arithmetic, the agreement set, the direction of each difference, the count gate, the assignment, and multi-block reading |
| mutation checks | **7 of 7 CAUGHT**, each by the case named in its row |
| `official:check` | 8 targets scored, 1 skipped by contract, all PASS |
| `core` test suite | **148 files, 3826 tests passed** (as of `de7996f`) |
| `cli` test suite | **4 files, 186 tests passed** (as of `de7996f`) |
| repo test suite | **152 files, 4012 tests passed** (as of `de7996f`) |
| coverage | core **99.97 / 99.93 / 100 / 99.97**, cli **100 × 4** |
| `typecheck` / `lint` / `docs:check` | green |

### Open

- ~~**Eight score targets are still transcriptions**, and this pass established no oracle.~~ **Narrowed
  by finding 181**: OpenRCA 1.0 is now held to its evaluator over 28 cases, and seven targets are not.
  **Counted by finding 182**: five now replay against released code. The replacement entry is in
  pass 59's Open list, where the census lives.
- **The product cannot represent a multi-fault answer**, and the official metric for such a case is
  therefore zero.
  `[open: `GroundTruth` carries one root cause, so an export answers one root for a key that may
  declare two; the scorer now computes the published number -- zero -- instead of a projection, which
  makes the reported accuracy honest but says nothing about whether the model should grow. That is a
  product decision, not a scoring one]`

## Pass 59 -- nine claims of "official", counted, and the one that disagreed

### The question nobody had asked

After finding 176 and finding 181 the standard was written down twice in this
document: *a rule transcribed by the author of the scorer is not an oracle.* What
had never been counted was **how many of the nine targets had anything runnable
behind their `source` string**. Each carries a `provenance` label -- `official` or
`derived` -- and a citation, and two of those citations turned out to be wrong when
somebody finally opened them. A label that has never been tested against the thing
it names is a word, not a claim.

So this pass asked one question of each target: **does an artefact upstream define
this number, and can it be replayed here rather than transcribed?** The answers are
in `golden-master/oracle-census.json`, one row per target, each with the probe that
produced it.

| class | meaning | targets |
| --- | --- | --- |
| `code` | released evaluator, replayed case by case | OpenRCA 1.0, RCAEval ×3, **Cloud-OpsBench** |
| `rubric` | machine-readable scoring data, no evaluator code | RCA100 |
| `prose` | only a paper or a dataset README describes it | AIOps2025 |
| `absent` | the citation itself says no scorer is published | OpenRCA 2.0, ITBench |

Two things came out of the count that were not in anybody's plan.

### Finding 182a -- Cloud-OpsBench had an evaluator, and it disagrees

`LLM4Ops/Cloud-OpsBench` ships `agents/cloudops_agent/evaluation.py`, whose
`prediction_scores` computes CA, FA and JRA. Read at
`c84f5ebd448983322b06c24022b126125c632a22` (seven files, each with a digest), the
rule is not an equality of strings:

```python
def normalize_text(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip().lower())
```

Both sides of both comparisons go through it. This repository compared them with
`===`. Measured over 22 recorded pairs: **9 disagreed, every one in the same
direction** -- an answer the benchmark counts as correct was scored wrong here.

| input | upstream | here, before |
| --- | --- | --- |
| `CheckoutService` vs `checkoutservice` | 1 | 0 |
| `" checkoutservice"` vs `"checkoutservice"` | 1 | 0 |
| `"cpu\nsaturation"` vs `"cpu saturation"` | 1 | 0 |
| `"checkout\u00a0service"` vs `"checkout service"` | 1 | 0 |

A single-direction error is the rarer and more dangerous kind: it does not average
out, it makes every number this product reports for that target an understatement
that looks like a weak model.

Two upstream behaviours are **not** reproduced, and both are declared in the corpus
with their direction and an argument:

- a key that declares nothing scores 1.0 there, because `"" == ""`. Here a facet the
  key does not declare is not scored at all. Reproducing it would let an export of
  empty keys report a perfect JRA.
- `str(value)` stringifies a number, so `8080` matches `"8080"` upstream. Our export
  contract types both fields as strings, so a number reads as absent. The difference
  is in the reader, not in the rule.

After: **22 of 24 agree**, and the two that do not are the two above.

The CA and FA in the breakdown now go through the same comparison, because they are
the same two comparisons reported apart. A `jra: 1` printed beside `ca: 0.96` is not
a rounding difference, it is two rules in one report -- and that is exactly what the
old breakdown would print for a corpus full of capital letters.

### Finding 182b -- RCA100 has a rubric, and this repository pays 1.0 or 0

The AIOps2025 and RCA100 datasets are not on GitHub: the paper points at a JiHu
GitLab project, `aiops-live-benchmark/agenticopseval`, whose raw files are reachable
anonymously. `RCA100/answer_key/taxonomy.json` (25,823 bytes, sha256 `840f3cfa…`) is
not documentation -- it is the scoring rubric as data:

```json
"scoring_rubric": { "T3_exact_L3": 1.0, "T2_same_L2": 0.5, "T1_same_L1": 0.2, "T0_different": 0.0 }
```

with `hierarchy.{L1_categories, L2_to_L1, L3_to_L2}` underneath it. This repository's
`rca100` rule pays `1` for an exact fault-type match and `0` otherwise, so a
prediction in the right L2 family earns nothing where the published rubric pays half.

That is **recorded as a `gap` on the census row rather than fixed here**, and the
reason is the difference between this finding and 182a: 182a is *code that was
evaluated against a corpus in one session*. 182b needs the hierarchy carried into
the export and a tier function replayed against 28 fault types -- a change to the
contract, not a comparison. Doing it in the same pass as 182a would have meant
verifying neither properly.

Two smaller answers from the same probe: `aiops2025`'s dataset README documents the
data and **not** the score (`grep` finds no formula), so its rule stays `prose` --
though the project README does state `0.40 / 0.40 / 0.10 / 0.10`, which agrees with
this repository; and ITBench's repository contains **no evaluator at all** --
`src/itbench` is a CLI to create, deploy and show scenarios, and its two name matches
for `eval` are leaderboard markdown that reports **NTAM and % resolved, not pass@1**.
Our metric is named after a quantity upstream does not tabulate.

### What a census can prove, and what it cannot

The nine tests behind this file assert **internal consistency**: one row per target
and no row without a target; only the four documented classes; every `code` row
backed by a corpus that really carries the digests the row cites; every row dated,
with the probe that produced it; and a `gap` only on a row that has no replay.

They cannot assert that the census is **true about the world**. A static inventory of
external facts ages, and no test can re-probe GitHub from inside a suite. The only
honest claim such a table can make about itself is that it was taken on a date, which
is why `takenAt` and a per-row `probe` record are required fields rather than
decoration -- and why the next pass that touches a target has to re-probe that row
instead of trusting it.

One direction **is** falsifiable, and is asserted: a row may claim `code` only with a
corpus behind it. A future pass that quietly downgrades a target to "transcription"
has to delete a file that another test replays.

### Acceptance

| gate | result |
| --- | --- |
| census | **9 rows**: 5 `code`, 1 `rubric`, 1 `prose`, 2 `absent`; every row dated and probed |
| Cloud-OpsBench corpus | **24 pairs** from seven pinned files; **22 agree**, 2 declared differences in their direction |
| mechanism tests | **17**: 8 on the Cloud-OpsBench corpus, 9 on the census |
| mutation checks | **14 of 14 CAUGHT**, each by the test named in its row |
| the rule that changed | reverting the comparison to `===` fails 9 corpus cases; dropping the lowercase, the collapse or the `\u00a0` handling each fails its own case |
| `official:check` | 8 targets PASS, 1 skipped by contract |
| `core` test suite | **150 files, 3843 tests passed** (as of `37de366`) |
| `cli` test suite | **4 files, 186 tests passed** (as of `37de366`) |
| repo test suite | **154 files, 4029 tests passed** (as of `37de366`) |
| coverage | core **99.97 / 99.91 / 100 / 99.97**, cli **100 × 4** |
| gate sites | 65 across 39 scripts, `--check` OK |
| `typecheck` / `lint` / `docs:check` | green |

### Open

- **Four targets have no replay**, and the census says which for each.
  `[open: rca100 has a rubric this rule does not use -- the fault-type term is a coin
  flip where the published rubric pays 1.0/0.5/0.2; aiops2025 has a paper and no code;
  openrca-2.0 and itbench have no scorer published at all. The first is implementable
  as data and is the next pass's subject; the other three need a decision about
  whether a `derived` metric should keep a weight it cannot test]`
- **The census ages.** `[open: nothing re-probes it. The next pass that touches a
  target has to fetch that row's artefact again, and the `probe.takenAt` field is
  there to make "I checked" a claim with a date on it rather than a habit]`
- **The product cannot represent a multi-fault answer**, carried from pass 58 and untouched here.
  `[open: `GroundTruth` carries one root cause, so a two-root key scores zero under
  the published rule; whether the model grows is a product decision, not a scoring one]`
- **A kill plus a concurrent edit is still ambiguous**, carried from pass 57; this pass touched no
  battery. `[open: the closing shape is a record written at write time rather than at start -- one
  more IO at 25 write sites -- and it needs a decision about what a record means when the writer is
  a person]`

## Pass 60 -- one section of one paper, and three clauses that had been dropped

### The source was a paper, and nobody had read the section the rule cited

`rca100`'s metric carried `source: 'arXiv 2606.29193 section 5.4'` and a formula.
Finding 176 had established the standard on RCAEval ("a rule transcribed by the
author of the scorer is not an oracle") and finding 181 had applied it to OpenRCA
1.0. This pass applied it to the one target whose source is a *paper*, and read the
section.

Three clauses were not in the rule, and one of them was in the rule as a number
that appears nowhere:

| The section says | The rule did |
| --- | --- |
| "A UModel entity-ID match with partial credit on topologically adjacent entities (**0.40**)." | paid **0.5** -- a number with no source in the paper, the dataset or the README |
| "99.5% carry a `⟨comparator, value, unit⟩` numeric constraint, so the agent must match the numeric condition, **not merely mention the metric**." | compared the signal **name** alone: `error_count` with a threshold two orders of magnitude wrong scored the checkpoint |
| "`Final_B = (0.4 Entity + 0.3 Fault + 0.3 Process) × 100`" | correct, and implemented **twice** |

### The third one only surfaced because of the first

Changing the adjacent credit moved the per-case score and left the report's
breakdown at 0.5, because `aggregateFor` recomputed the three terms instead of
reading them from the case records. The report then carried `accuracy: 0.94` beside
`final: 95` -- **one quantity, twice, disagreeing**, inside a single report, with
every test green.

That is finding 181's shape one level down, and it is the reason the aggregate now
averages the terms each case record carries. `Final_B` is a linear combination of
the terms, so a headline computed from the mean of the per-case scores and a mean
computed from the terms have to be the same number; the suite asserts they are, on
a three-case export whose cases carry different term sets (a single-case export
cannot tell the two apart, which is why the previous 148 files never did).

The same duplication was in `aiops2025`, and there it was not merely a duplicate but
a **contradiction**: finding 159 had fixed the aggregate's `Exp.` to answer 0 for an
empty denominator, and the per-case rule still answered **1**. It was invisible
because `evidenceComplete` fails such an export first, for a different reason --
*a guard elsewhere is not a guard here*.

### The token

A checkpoint is now `signal|comparator|value|unit`, and a hit requires all four:

```text
order|cpu_usage|>|90|%      # the checkpoint the answer key declares
order|cpu_usage|>|9|%       # a different threshold: not a hit
order|cpu_usage|>|90|ms     # a different unit: not a hit
order|cpu_usage             # the metric, named, with no condition: not a hit
```

Exact equality on the value is the literal reading of "match the numeric
condition", and it is not forgiving -- the dataset's own ground truth carries
`0.4964574898785425`. A tolerance is a rule the paper does not state, so inventing
one would be the same defect pointing the other way. That consequence is an open
item below rather than a fudge.

### What the mutation grid could not see

`mutatePrediction` replaces a facet **whole**: the `evidence` mutation swaps the
list for a sentinel. A rule that keeps the signal name and drops the value therefore
passes the grid, because the grid never keeps the part the rule should be sensitive
to. **A mutation that changes a facet cannot test a rule that reads part of one.**
The case-level assertions in `rca100-evaluator.test.ts` are what close that, and the
grid was left alone rather than widened for one target.

### The corpus is a set of sentences

`golden-master/rca100-evaluator.json` pins the paper by digest
(`2606.29193v1`, 2,958,887 bytes, sha256 `b8b8de83…`) and each clause by verbatim
quote, plus the extraction method -- `pdftotext` **without** `-layout`, because the
layout extraction reproduces the two-column grid and a sentence spanning the column
break comes out interleaved with the other column, so the quote would not appear.

It also records the dataset's own rubric -- `{T3_exact_L3: 1.0, T2_same_L2: 0.5,
T1_same_L1: 0.2, T0_different: 0}` -- with its digest and the reason it is **not
shipped**: 25 KB of CC BY-NC 4.0 data, and this project states that it does not
redistribute the official datasets. So the rubric stays a pinned gap rather than a
half-applied rule, and the census row says what closing it would cost.

### Two intermittent reds, and what they turned out to be about

The full suite went red twice while this pass was being finished, each time in a
different file, each time green on every run of that file alone: `gate-test
battery · reaches UNPARSEABLE` failed with `SyntaxError: Unexpected token '_',
"_witnesses"... is not valid JSON`, and `check-doc-counts · refuses a document with
no counts at all` failed on `expected null to be 1`.

Both are `spawnSync` helpers, and both reported a **child that never ran** as a
verdict about the child's subject. `spawnSync` answers `status: null` when the
process could not be started -- and every assertion in both files reads `status`,
so a resource failure at fork time arrives as a complaint about the battery or
about the guard.

Three things changed, and none of them is a retry of a red:

- the JSON helper in the attribution file parses **stdout only**. It read
  `stdout + stderr`, so anything Python wrote to the other stream became the "last
  line" and the parse error named a stream the reader could not see. Both streams
  are in the failure message now, and the parse says "the snippet printed no JSON
  line. Last line was: …" instead of `Unexpected token`.
- both helpers assert `error` is undefined, so a child that never started says so.
- both retry once, **only** on `EAGAIN` / `ENOMEM` -- a process that was never
  created observed nothing, and retrying it is not the same act as retrying an
  assertion that failed.

Four consecutive full runs were green afterwards and the two reds were not
reproduced. That is not a diagnosis, and it is recorded as an open item rather
than as a fix.

### Acceptance

| gate | result |
| --- | --- |
| corpus | paper pinned by digest; **4 clauses**, each with a verbatim quote and an argument |
| mechanism tests | **15** on the RCA100 corpus + 1 on the AIOps2025 empty denominator |
| mutation checks | **12 of 12 CAUGHT**, each by the test named in its row |
| the clauses that changed | reverting the credit to 0.5, or the token to the signal name, or the aggregate to a recomputation, each turns the suite red |
| the two numbers | `final === 100 × accuracy` on a three-case export; recomposing the headline from term means reports **93** for cases that average **85** |
| `official:check` | 8 targets PASS, 1 skipped by contract |
| `core` test suite | **151 files, 3859 tests passed** (as of `2444bd8`) |
| `cli` test suite | **4 files, 186 tests passed** (as of `2444bd8`) |
| repo test suite | **155 files, 4045 tests passed** (as of `2444bd8`) |
| coverage | core **99.97 / 99.8 / 100 / 99.97**, cli **100 × 4** |
| gate sites | 65 across 39 scripts, `--check` OK |
| `typecheck` / `lint` / `docs:check` | green |

### Open

- **The checkpoint value is matched exactly**, and the dataset's own thresholds carry
  full float precision.
  `[open: "match the numeric condition" is the paper's phrase and it states no
  tolerance, so a tolerance would be an invented rule; the cost is that a submission
  naming the right metric and a rounded threshold scores nothing. This needs a
  decision, not a fudge]`
- **RCA100's fault-type rubric is still not applied**, and this pass established that
  closing it is not a code change.
  `[open: the rubric is 25 KB of CC BY-NC data this project does not redistribute, and
  the exported fault type is a free-form IR string, so a tier would resolve only when
  the data already speaks RCA100 labels. Two ways out: a licence decision, or an
  offline fixture regenerated on demand]`
- **Two whole-suite reds in this pass were not reproduced**, and both were `spawnSync`
  children that reported `status: null`.
  `[open: four full runs after the diagnostic hardening were green, and the two reds
  came from different files, so the common cause is not established. What is
  established is that a child which never started used to read as a verdict about its
  subject, and that the machine is spawning ~200 child processes inside a parallel
  suite. The next instrument is `r.error.code` from a run that reproduces]`
- **The census ages**, carried from pass 59; this pass read a paper and did not re-probe
  a single repository. `[open: nothing re-probes it, and the next pass that touches a
  target has to fetch that row's artefact again rather than trusting the table]`
- **The product cannot represent a multi-fault answer**, carried from pass 58.
  `[open: `GroundTruth` carries one root cause, so a two-root key scores zero under the
  published OpenRCA rule; whether the model grows is a product decision]`

## Pass 61 -- the same paper, a different section, and the relaxation it grants

### The target next to the one just read

Pass 60 read §5.4 for RCA100. §4.4, three pages earlier, defines AIOps2025's
Final_A, and `aiops2025` had the same provenance as `rca100` had: a paper citation
and a rule written from memory. Reading it found one clause missing that changes a
score, and one that cannot be implemented without a decision.

| §4.4 | The rule |
| --- | --- |
| "Two fault families need targeted relaxations: for network attacks, LA accepts a hit on either **source or destination** ..." | compared `component` only -- the reader discarded both endpoint fields |
| "TA ... via two-step matching: keyword detection ... **with embedding-similarity fallback for unhit cases**" | the first step only |
| "The reason field is truncated to its first 20 words" | correct |
| "each observation contributes only its first 20 characters" | correct |
| "`Efficiency = min(1.0, exp(−(APL−5)/5))`, where APL is the mean ... over **LA-correct** cases" | correct |
| "`Final_A = (0.4 LA + 0.4 TA + 0.1 Exp. + 0.1 Eff.) × 100`" | correct |

### The relaxation, and the fields it needs

The dataset's answer key names both endpoints of a network fault in `source` and
`destination` -- the README says so in as many words, and the corpus records that
sentence next to the paper's. The reader read neither, so an answer that named the
**far** end of an injected network fault scored zero on localisation where the
protocol pays full credit.

The fix is one field, `OfficialGroundTruth.alternatives`, and the rule is
`component || alternatives.includes(predicted)`. It is deliberately not
`adjacent`: `adjacent` earns *partial* credit for a topology neighbour (RCA100's
0.40), while an alternative earns a **full** hit. One field carrying both meanings
would be the defect this repository has a finding about.

Scope is enforced by the data rather than by a fault-type list: a case whose key
declares no endpoints has an empty list, and an empty list cannot manufacture a
match. The suite asserts the negative case explicitly -- the same answer on a key
without endpoints still scores zero -- because a relaxation that quietly widened
to "anything the topology mentions" would be a different rule.

### The fallback, which is not a transcription problem

"Weighted ... with embedding-similarity fallback for unhit cases" names neither a
model nor a threshold. Choosing one changes the number; choosing one to reproduce
the paper's reported TA is fitting the metric to its own result. So the first step
is implemented, the second is recorded as a gap with its direction -- a paraphrase
carrying none of the description's words scores 0 here and may be credited there --
and the `gaps` block says what closing it would take.

This is the second target in a row where the honest answer to "implement the
published rule" is "part of it is a decision". That is worth saying plainly: the
census counts five targets as `code`, and of the remaining four, two cannot be
closed by writing code.

### The third copy of the evidence term

The mutation check found it. Removing the 20-character cut from the case rule left
every test green, because the aggregate had **its own copy**:

```ts
// before
const em = groundTruth.reduce((sum, gt, i) =>
  sum + intersectCount((predictions[i]?.evidence ?? []).map((e) => e.slice(0, 20)), gt.evidence), 0);
```

Two implementations of "which cited observation hit", and only one of them had been
changed. The case record now carries `evidenceHits` -- a count, not a rate -- and the
pooled `Exp.` is the sum of those counts over the sum of the denominators. Pooling
rates needs the numerators back; recomputing them was the second copy.

This is the third appearance of the same shape in three passes (181: two averages;
183: case rule vs aggregate; here: case rule vs aggregate again, one term deeper).
The pattern is not "somebody wrote it twice" but **"a term that is reported at two
levels gets computed at the level where it is reported"**, and the level that is
never tested is the one that is only reported.

### The second reader of a directory

The full suite failed twice more while this pass was finishing, this time in
`scripts-are-classified`: `scripts/` was one file longer than the register. The
extra file is `scripts/.probe-figures-harness-type-miss.mjs`, a harness one probe
writes for the duration of a single test and removes in `finally` -- and
`derive-gate-sites.mjs` had **already been taught to ignore dotfiles**, for exactly
this reason, in an earlier pass whose comment says the window "is still a hazard for
any *future* reader of `scripts/`".

This file was that future reader. It filtered on `.endsWith('.mjs')` and nothing
else.

Two fixes, both about a claim rather than a symptom:

- the scan skips dotfiles, with the reason the deriver uses: a file that is not
  committed, not named by `pnpm lint` and never resolved by an operator is not part
  of the tree;
- the probe file gains an `afterAll` that removes the harness. `finally` runs on a
  throw, not on a kill -- and a worker killed by the resource pressure that also
  produced pass 60's two reds leaves the file behind, which is why the second run of
  a broken tree failed too.

**The second reader of a directory is the one that does not know what the first one
learned.** That is the same shape as the duplicated terms, one level out: the fact
was written down once and read twice, and the reading that had to be corrected was
the new one.

### Acceptance

| gate | result |
| --- | --- |
| corpus | paper pinned by digest and **cross-checked against the RCA100 corpus's pin**; dataset README pinned; **9 clauses** quoted, 4 README fields |
| mechanism tests | **16** |
| mutation checks | **9 of 9 CAUGHT** |
| the relaxation | either endpoint accepted; a third entity refused; a key without endpoints unchanged |
| the truncations | a keyword at word 21 does not count; twenty characters decide an evidence point |
| the APL restriction | a long wrong answer no longer enters the efficiency average |
| `official:check` | 8 targets PASS, 1 skipped by contract |
| `core` test suite | **152 files, 3875 tests passed** (as of `5997dcc`) |
| `cli` test suite | **4 files, 186 tests passed** (as of `5997dcc`) |
| repo test suite | **156 files, 4061 tests passed** (as of `5997dcc`) |
| coverage | core **99.97 / 99.75 / 100 / 99.97**, cli **100 × 4** |
| gate sites | 65 across 39 scripts, `--check` OK |
| `typecheck` / `lint` / `docs:check` | green |

### Open

- **A directory's contents are described in more than one place**, and this pass
  found the second copy the hard way.
  `[open: `derive-gate-sites.mjs` ignores dotfiles in `scripts/`; the classification
  scan now does too, because a probe writes one there. Nothing enumerates the readers
  of `scripts/`, so the next one has to learn the same rule from the same comment --
  unless the probe stops writing into the tree at all, which needs its relative
  imports to resolve from somewhere else]`
- **TA's embedding fallback is not implemented**, and cannot be transcribed.
  `[open: the paper names neither the model nor the threshold, so reproducing it
  means choosing both; a threshold picked to match the reported TA would be fitting
  the metric to its own result. The direction it costs is recorded: a paraphrase
  using none of the description's words scores 0 here and may be credited there]`
- **Three items are carried unchanged**, and this pass touched none of them: the
  exact match on a checkpoint value, RCA100's fault-type rubric waiting on a licence
  decision, and the two whole-suite reds that were never reproduced.
  `[open: each has its own entry with its own reason in the pass that raised it (60,
  60 and 60 respectively); repeating the reasons here would make this list the place
  they are maintained, and the earlier entries the place they are read]`

## Pass 62 -- a label with two values for three states, and a metric named after a rule it did not compute

### Two things that were both true and neither of which was checkable

This pass started as the last item on the census: the two targets left with no
replay are `openrca-2.0` and `itbench`, both labelled `derived`, and the question
was whether either could be given a testable source. Opening the ITBench paper
answered that and raised a second question, which turned out to be the larger one.

### 185a -- `itbench-pass-at-1` was not pass@1

The metric carried `id: 'itbench-pass-at-1'`, a `quote` from arXiv 2502.05352
§4.2, and `facets: ['component', 'chain', 'evidence']`. Two things were wrong with
that, and the first was visible in the file itself:

**The quote was not verbatim.** The paper writes

> Diagnosis efficiency is measured using pass@1**(Chen et al., 2021)** (i.e.,
> identifying the cause as mentioned in ground truth), NTAM (Normalized
> Topology-Aware Metric) for root cause and fault propagation chain, **and time to
> diagnosis**.

The field in this repository had dropped the citation and the final clause — which
is the clause that makes the sentence a list of three metrics rather than a
description of one. A `quote` is the one field whose whole value is that it was not
edited, and it had been edited in the direction that made the rule look right.

**And the rule computed something else.** Table 3 of the paper lists the SRE
diagnosis metrics as "pass@1, Fault Localization, Fault Propagation Chain, Mean Time
to Diagnosis" — four, of which pass@1 is the cause alone. The rule here required
the cause *and* the chain *and* the conditions, so a submission that named the right
cause and nothing else scored 0 on a quantity called pass@1.

`golden-master/itbench-evaluator.json`: the paper pinned by digest (v1, 4,068,098
bytes, sha256 `da47aa02…`), six clauses quoted verbatim, and nine cases.

```
published=1 strict=1.00 old=1   oracle
published=1 strict=0.33 old=0   cause-only                    <- disagreed
published=1 strict=0.67 old=0   cause-and-chain               <- disagreed
published=1 strict=0.67 old=0   cause-right-chain-wrong       <- disagreed
published=0 strict=0.67 old=0   wrong-cause-right-rest
published=1 strict=1.00 old=1   key-with-no-chain
published=0 strict=0.00 old=0   empty-key-empty-answer
...
```

**Three of nine disagreed, every one in the same direction.** That is the third
time: Cloud-OpsBench's normalisation (9 of 22), AIOps2025's endpoints (one direction),
and now this. A one-directional error does not average out into noise — it makes
every number the product reports for the target an understatement that reads as a
weak model, which is the failure mode hardest to notice, because a low score looks
like a result.

The fix reports both numbers, each named what it is:

| Number | Rule | Published? |
| --- | --- | --- |
| `passAt1` | predicted root cause equals the key's | yes — §4.2 |
| `strict` | cause **and** chain **and** conditions | **no** — this repository's own conjunction, and the metric's id is `itbench-diagnosis-strict` |

### The decision this pass did **not** make

The two NTAM metrics could be implemented *as an approximation*, and both previous
passes established why that is worse than not implementing them: their components
"have corresponding hyper-parameters that can be tuned to adjust their
contributions", the values are not published, and a set of weights chosen to
reproduce the paper's table would be the metric fitted to its own result. So the
census row now carries a `gap` naming the two metrics, the sentence that makes them
un-replayable, and the direction of the cost.

Of the four targets with no replay, **three are now decided rather than pending**:
RCA100 needs a licence decision, AIOps2025's TA needs a model and a threshold,
ITBench's NTAM needs weights. None of them is waiting for an implementer, and saying
so is more useful than a backlog entry implying otherwise.

### 185b -- `provenance` had two values for three states, and nothing read it

The larger finding came from a smaller observation: **`provenance` was not asserted
anywhere and not summed anywhere.** It travelled to the report and stopped.

It had two values, `official` and `derived`, where `official` meant "transcribed
from the upstream scorer *or* the paper's protocol". Every rule this campaign has
caught — OpenRCA's projection (10 of 25), Cloud-OpsBench's comparison (9 of 22),
RCA100's three dropped clauses, AIOps2025's relaxation, and now ITBench's name — was
labelled `official`. The label was not false. It was **unable to say the one thing
that mattered**: whether anybody else's code had ever computed this number.

Three states, and the label now has three values:

| Label | Meaning | Targets |
| --- | --- | --- |
| `replayed` | a corpus in `golden-master/` runs the released artefact's rule case by case | OpenRCA 1.0, RCAEval ×3, Cloud-OpsBench |
| `transcribed` | a published prose rule, no released code; nothing else computes it | RCA100, AIOps2025 |
| `derived` | upstream publishes neither the rule nor its constants | OpenRCA 2.0, ITBench |

And the label is **derived rather than authored**:
`provenance-matches-the-census.test.ts` maps each census class to exactly one label
and fails on any drift, so the registry cannot claim more than the census supports.
That is the link that was missing — `source` strings were compared between the two
files (pass 59) and `provenance` and `class` were not, so two files described the
same fact and nothing held them together.

The label is also **read** now: `rca-bench official` sums it per run.

```json
"counts": { "passed": 9, "skipped": 0, "failed": 0 },
"provenance": { "replayed": 5, "transcribed": 2, "derived": 2 },
```

Five of nine. A consumer deciding whether to trust a headline should not have to
read nine metric specs to learn that, and a label nobody sums is a label nobody
needs.

### Acceptance

| gate | result |
| --- | --- |
| corpus | ITBench paper pinned by digest; **6 clauses** quoted verbatim, each with an argument; **9 cases** with their published and previous values |
| mechanism tests | **13**: 10 on the ITBench corpus, 4 on the provenance mapping, 1 in the CLI for the split |
| mutation checks | **11 of 11 CAUGHT**, each by the test named in its row |
| the naming | the metric id is not one of the four the paper publishes, and the quote is the whole sentence |
| the direction | every case where the old rule and the paper disagree is one-way; the reverse set is asserted empty |
| the label | 5 `replayed` / 2 `transcribed` / 2 `derived`, derived from the census and asserted both ways |
| `official:check` | 8 targets PASS, 1 skipped by contract |
| `core` test suite | **154 files, 3889 tests passed** (as of `3d5d62b`) |
| `cli` test suite | **4 files, 187 tests passed** (as of `3d5d62b`) |
| repo test suite | **158 files, 4076 tests passed** (as of `3d5d62b`) |
| coverage | core **99.97 / 99.75 / 100 / 99.97**, cli **100 × 4** |
| gate sites | 65 across 39 scripts, `--check` OK |
| `typecheck` / `lint` / `docs:check` | green |

### Open

- **Three of the four un-replayable targets now wait on a decision, not on code**, and
  the fourth is the same shape one step out.
  `[open: RCA100's fault-type rubric is 25 KB of CC BY-NC data this project does not
  redistribute; AIOps2025's TA fallback needs a model and a threshold; ITBench's two
  NTAM metrics need weights the paper leaves tunable; OpenRCA 2.0 has announced that no
  scorer is published. Each entry exists in the pass that measured it, with the cost of
  closing it]`
- **`transcribed` is a confidence level, not a measurement.** `[open: the label says no
  released code exists, which is a fact about upstream; it cannot say how faithfully the
  prose was read. Findings 181, 183 and 184 are three readings of three sections that
  were wrong the first time, so the honest reading of `transcribed` is "unverified except
  by a second reading of the same sentences"]`
- **Four items are carried unchanged**: the exact match on a checkpoint value, the two
  whole-suite reds never reproduced, the census ageing, and the multi-fault model.
  `[open: each has its own entry in the pass that raised it; this list is not the place
  they are maintained]`

## Pass 63 -- a citation that pointed at this repository, and a metric set nobody had opened

### The last target with no source

Pass 62 closed by naming the four targets with no replay and observing that three
of them wait on a decision. The fourth was `openrca-2.0`, and it was the one row
in the census whose `source` string was not merely unopened -- it was **this
repository**:

```ts
source: 'docs/targets/openrca-2.0.md — the official OpenRCA 2.0 scorer is not open-sourced',
quote:  'The official OpenRCA 2.0 evaluation framework and scorer are not open-sourced.',
```

That second line is `docs/targets/openrca-2.0.md:157`. It is not in the paper.
Checked at `arXiv:2606.27154v2`: the string `open-sourced` occurs **zero** times.
Checked at `microsoft/OpenRCA`'s README, at the commit the 1.0 evaluator is pinned
to: `2.0` and `PAVE` occur **zero** times.

> A `quote` field whose entire value is that it was not written here, holding a
> sentence written here.

This is the one defect in the campaign that no amount of replaying would have
found, because there was nothing to replay against: the claim's evidence was the
document making the claim. Every other finding has been "the rule disagreed with
the artefact"; this one is "there was no artefact".

### What the paper actually defines

§3.2, with formal definitions in Appendix G: nine quantities across an outcome and
a process layer.

| Quantity | Computable from this contract? |
| --- | --- |
| EM — exact set equality over `(service, fault_kind)` pairs | yes, and it is one pair here |
| AnySvc — a correct service, ignoring the fault kind | yes |
| Node F1 / Edge F1 — the predicted graph against the annotated one | yes, from the exported path |
| F1 / Precision / Recall over the pair set | degenerates to EM for a one-pair submission — three names for one number |
| Path Reachability — needs the ground-truth **alarm nodes** | **no**: PAVE annotates them, this export does not carry them |
| SQL Exec | no SQL in this contract |

The rule that was there scored `matched facets / scored facets` over four facets.
That is none of the nine. It paid a quarter of a case for the checkpoint
references, which no published metric reads; and it reported a correct service with
no verified path as **three quarters of a success**, which is the exact failure the
paper was written to expose:

> We reserve the term ungrounded diagnosis for cases that satisfy AnySvc but not
> PR: a correct root-cause identification not grounded in a verified causal
> propagation path to the observed symptom.

The report now carries the layers apart — `em` (the headline), `anySvc`, `nodeF1`,
`edgeF1` — so `anySvc: 1` beside `em: 0` and `em: 1` beside `nodeF1: 0` are both
expressible. A single averaged number could say neither.

### One facet that had to leave the list

`chain` was declared a facet of a score that never read it, and the mutation grid
said so before this pass did:

```
case case-001: mutating 'chain' did not lower the score (1)
```

That is the grid working. The score is EM; the graph is a *different published
layer*, and folding it back into `score` would reproduce exactly the averaging the
paper exists to argue against. So `facets` is `['component', 'faultType']` — what
`score` reads — and the graph comparison is asserted case by case in
`openrca2-evaluator.test.ts` instead, which is a stronger instrument for it than a
mutation grid that can only ask whether *the* score moved.

`evidence` left the list entirely: no published metric scores the checkpoint
references, and paying a quarter of a case for them was inventing a fourth term.

### The label moved, because the census moved

`openrca-2.0` was `derived`. It is `transcribed` now — the paper defines the
metrics, and four of the nine are replayable. The census row is `prose` rather than
`absent`, and the registry's label is *derived from that class* by
`provenance-matches-the-census.test.ts`, which is why the two moved together without
anyone editing both: **5 replayed / 3 transcribed / 1 derived.**

### Acceptance

| gate | result |
| --- | --- |
| corpus | paper pinned by digest (v2, 962,086 bytes, sha256 `2c8388aa…`); **5 clauses** quoted verbatim; **7 cases** with `em`/`anySvc`/`nodeF1`/`edgeF1` |
| mechanism tests | **10** on the corpus + 2 on the census and 1 on the aggregate, all updated rather than added around |
| mutation checks | **14 of 14 CAUGHT**, each by the test named in its row |
| the citation | `source` is not a `docs/` path; the invented sentence is not the quote; the negative result is recorded |
| the layers | `anySvc: 0.71` / `em: 0.57` / `nodeF1: 0.78` / `edgeF1: 0.74` on the nine-case export |
| `official:check` | 8 targets PASS, 1 skipped by contract |
| `core` test suite | **155 files, 3901 tests passed** (as of `041ca04`) |
| `cli` test suite | **4 files, 187 tests passed** (as of `041ca04`) |
| repo test suite | **159 files, 4088 tests passed** (as of `041ca04`) |
| coverage | core **99.97 / 99.75 / 100 / 99.97**, cli **100 × 4** |
| gate sites | 65 across 39 scripts, `--check` OK |
| `typecheck` / `lint` / `docs:check` | green |

### Open

- **A quote can no longer be checked mechanically, and that is the residual risk.**
  `[open: the corpus test asserts the quote equals a clause, and the clause was pasted
  from the paper by hand. What is now asserted is that the *source* is external and that
  the old invented sentence is gone -- not that the new sentence is in the PDF. Doing
  that would need the PDF in the repository, which this project does not do, or a network
  test, which the suite does not run]`
- **PR needs a field the contract does not carry.** `[open: closing it means adding the
  alarm-node set to the annotation and to the export, which is a contract change and not a
  scoring one; the paper's own headline number is the AnySvc/PR gap, so this is the most
  valuable of the remaining gaps]`
- **Three non-replayable targets still wait on decisions**, unchanged this pass.
  `[open: RCA100's fault-type rubric is 25 KB of CC BY-NC data this project does not
  redistribute, AIOps2025's TA fallback needs a model and a threshold, and ITBench's two
  NTAM metrics need weights the paper leaves tunable; each has its own entry in the pass
  that measured it, with the cost of closing it]`

## Pass 64 -- the field PR needed was already in the export

### A self-correction, one pass later

Pass 63's Open list said:

> **PR needs a field the contract does not carry.** `[open: closing it means adding the
> alarm-node set to the annotation and to the export…]`

That was wrong, and the sentence that refutes it is in §2.3 of the same paper, three
pages before the metric definitions:

> A candidate path π is verified only if all of **(i) every node along π exhibits a
> deviation beyond its baseline screen**, (ii) every consecutive edge conforms to R …,
> and (iii) each downstream anomaly onsets no earlier than its upstream cause.

An alarm node is "a component observed to behave abnormally during the injection window".
PAVE admits a path only if every node on it crossed its baseline screen. **So every node
of the annotated path is an alarm node by construction** — the field was the chain all
along, and adding one would have been inventing a second copy of a fact the annotation
already asserts.

This is the same shape as finding 180 and finding 183, one level out: not two
implementations of a rule, and not two vocabularies for a fact, but **a missing field that
was already present under a different name**. Reading the *definition of the input* is
what found it; reading only the definition of the metric was not enough.

### What PR is, exactly

Two conjuncts, and the second is why it is stronger than `anySvc`:

- the named root cause is the key's root cause, **and**
- the submitted graph carries a path of **length at least one** from it to a node of the
  annotated path.

Length at least one is the whole distinction. A submission that names the service and
propagates nowhere has not grounded the diagnosis — the paper's `ungrounded diagnosis` —
and a zero-length "path" would make PR identical to AnySvc, which the reported numbers in
the paper rule out (61.5% versus 76.0%).

| Number | Corpus | Rule |
| --- | --- | --- |
| `em` | 0.70 | service and fault kind, the strict outcome layer |
| `anySvc` | 0.80 | the service alone |
| `pr` | 0.56 | a correct cause **and** a path to an alarm node |
| `nodeF1` | 0.67 | graph nodes, exact matching |
| `edgeF1` | 0.50 | graph edges, exact matching |

### The direction of the error, recorded rather than glossed

G*'s nodes are a **subset** of the paper's alarm set: a component that deviated but sat on
no surviving path is absent from the annotation. So this `pr` is a **lower bound**, and the
corpus carries that under `alarmNodeBasis` — the set used, the clause that licenses it, and
the direction. A claim of parity would be exactly the defect this campaign keeps finding.

### Two cases that exist because the numbers would otherwise agree

`detour-that-arrives` has `edgeF1: 0` and `pr: 1` — one valid path is all PR asks for, and
the graph is wrong everywhere else. `cycle-that-arrives-nowhere` closes a loop that never
touches the annotation: PR must be 0, and the walk must terminate, which is a property of
the algorithm rather than of the corpus.

And `wrong-first-hop` is the paper's failure written as a fixture: `em: 1`, `anySvc: 1`,
`pr: 0`. Before this pass the report could not say it at all.

### One thing the gate caught

The first draft walked the graph with `queue.push(...successors)`. The repository has a
test that forbids spreading a size-dependent array into a call — the successor list is the
*submission's*, so its length is unbounded by anything this file controls. Replaced with a
per-successor `push`. That is the second time this campaign has been corrected by a gate it
did not write for the occasion.

### Acceptance

| gate | result |
| --- | --- |
| corpus | **8 clauses** (3 new, all quoted verbatim), **10 cases** with `em`/`anySvc`/`pr`/`nodeF1`/`edgeF1` |
| mechanism tests | **13** on the corpus, 1 of them the termination property |
| mutation checks | **9 of 9 CAUGHT**, each by the test named in its row |
| the alarm set | `alarmNodeBasis` names the set, the clause, and the direction of the error |
| the layers | 0.70 / 0.80 / 0.56 / 0.67 / 0.50 on the ten-case export |
| `official:check` | 8 targets PASS, 1 skipped by contract |
| `core` test suite | **155 files, 3904 tests passed** (as of `39eec9d`) |
| `cli` test suite | **4 files, 187 tests passed** (as of `39eec9d`) |
| repo test suite | **159 files, 4091 tests passed** (as of `39eec9d`) |
| coverage | core **99.97 / 99.73 / 100 / 99.97**, cli **100 × 4** |
| gate sites | 65 across 39 scripts, `--check` OK |
| `typecheck` / `lint` / `docs:check` | green |

### Open

- **`pr` is a lower bound and the corpus says so**, which is not the same as being right.
  `[open: closing the gap needs the PAVE observation graph -- every component that deviated,
  not only the ones on a surviving path -- which the paper describes but does not release;
  or a decision that G* *is* the alarm set, which would make this PR the paper's definition
  rather than a conservative reading of it]`
- **`em` and the four reported quantities are one root cause wide.** `[open: F1, Precision
  and Recall are defined over a predicted pair *set*, and this data model carries one pair,
  so they collapse onto EM. Growing the model is a product decision that would also change
  OpenRCA 1.0's multi-root behaviour]`
- **A quote still cannot be checked mechanically**, unchanged since pass 63.
  `[open: what is asserted is that the source is external and that the old invented
  sentence is gone; the clause itself was pasted by hand, so the guarantee is "nobody can
  quietly cite themselves again", not "this sentence is in that PDF"]`
- **Three non-replayable targets still wait on decisions**, unchanged this pass.
  `[open: RCA100's fault-type rubric is 25 KB of CC BY-NC data this project does not
  redistribute, AIOps2025's TA fallback needs a model and a threshold, and ITBench's two
  NTAM metrics need weights the paper leaves tunable]`

---
