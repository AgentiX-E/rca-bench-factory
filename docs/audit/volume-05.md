## Finding 196 — the gate that could not be proved, and the red that named no reason

The audit split landed, and the first full gate run after it went red at `5/31` with
this block:

```
verify:local: FAILED at 5/31
  step:    verify / Test with coverage (core + cli, ≥95% per dimension, 100% functions)
  command: pnpm test:coverage
  still ran: batteries / Scorer stability battery …, artefacts / …, cold-tree / …
```

The step was named, the directory was named, the command was named, and **the reason
was missing**. `pnpm test:coverage` exited `0` when run by hand. So the run had a
verdict, a subject, and no evidence — and re-running it produced a different
failure at a different step (`13/31`, `UNATTRIBUTED check-audit-volumes.mjs`).

Both were real, and neither was the change under test. This is the log of what each
one was, because a pass that reports four reds and fixes four guesses is how a
campaign spends a week on the wrong subject.

### The first red: a gate whose reading was inside the thing being emptied

`check-audit-volumes.mjs` held both halves of the check: `readVolumes`,
`indexCovers`, `absentNumbers` and `check` (the reading) plus the CLI (the verdict).
`audit-volumes.test.ts` imported the four functions — 16 tests, 14 of them
import-level.

`verify-gates-are-testable.mjs` proves a gate by **emptying it** and requiring the
suite to go red *and to name a failing test*. The two requirements are one
requirement: a crashed worker is not a verdict. Emptying a file that a test imports
kills the worker at its first statement, so the suite exits `1` and names nothing —
the meta-gate's word for that is `UNATTRIBUTED`, and it refuses it:

```
UNATTRIBUTED check-audit-volumes.mjs                     exited 1 and named no failing test
```

That verdict is identical to the one a genuinely broken test file produces, which is
precisely why the meta-gate distinguishes them. **A proof that cannot tell "the
guard was removed" from "the test file is broken" is not a proof.**

The repair is the seam this repository already uses twice (`gate-steps.mjs`,
`step-process.mjs`): the reading moved to `scripts/audit-volumes.mjs`, registered as
`data` — no `main`, no exit, importable; the gate keeps the verdict and is spawned.
Measured after the move:

```
CAUGHT      check-audit-volumes.mjs                       2 test(s) red
verify-gates-are-testable: OK (41 gate(s), each caught by at least one test)
```

### The second red: three endings that read the same

`failureReport` printed the step, the directory and the first line of the command,
and never printed the failure's own words. Three failures are then one sentence:

| what happened | what it means | where a reader goes |
| --- | --- | --- |
| the step exited 1 | the step has something wrong with it | the step's output, above |
| the step was killed by SIGTERM | something signalled it | a supervisor, a bound, or the operator |
| `spawn bash ENOENT` | the step never ran | the plan's shell, or the machine |

The block now carries `reason: <the runner's own message>`, and the timeout branch
carries none — a bound already says what ended the run, and a second line repeating
the error mechanism would read as though the step had also failed on its own
account. Two tests: one per ending, and one that asserts the absence.

The first red after that fix said `reason: the step exited 1`. That is the value:
it converts "something is wrong" into "the step ran and returned non-zero", which
is one of the three and no longer all three.

### The third red: a tree a killed run was still holding

The four failures of the next run were, in order: the site inventory drifting by
one line; `derive-gate-sites --check` disagreeing with itself; a witness table
rejecting `CLIREF 3`; and a CLI-reference test whose fixture had swept up a gate
that was missing a guard. Four subjects, one cause:

> `verify-gates-are-testable: repaired check-backend-support.mjs, left hollowed by a run that was killed`

The injection batteries mutate real files in place and restore them in a `finally`.
A run that is **SIGKILLed** has no `finally`. The restore was already written — the
next battery does it when it takes the guard — but nothing between the kill and the
next battery looks: `pnpm test`, `docs:check` and every reading in between run over a
tree that is not the repository's. The mutation was **one inserted line**, which is
why the inventory drifted: every later `process.exit` in that file moved down one.

The repair is now a preflight. `scripts/tree-repair.mjs` asks `_witnesses.py` to put
back what a dead run left, before the first step of a gate session reads anything:

| state | what the session does |
| --- | --- |
| `repaired` | runs, and prints what was put back (or that there was nothing) |
| `held` | **refuses**, exit 1, naming the live pid: two writers cannot measure one tree |
| `unavailable` | runs, and says the batteries cannot be verified and the tree is not repaired either |

Three details that are not decoration:

1. The repair is driven with `python3 -c`, not by giving `_witnesses.py` a
   `__main__`. `batteries-reach-an-invoker.test.ts` decides "battery" by whether a
   file under `scripts/injection/` has an entry point, and every battery must be
   invoked by a package script and a CI workflow. An entry point would have made a
   shared module into a battery, and the next step would have been wiring a repair
   command into CI as though it measured something.
2. A live pid is not a leftover. The journal is checked against `/proc/<pid>/cmdline`
   for the script the record claims, because pids are reused — the same lesson as
   finding 174's group id, one identifier down.
3. `held` is a refusal rather than a wait: a session that waited would be a session
   whose duration depends on a battery it is not running.

Six tests, including one that spawns `verify-local.mjs` over a held tree and asserts
the refusal happens **before** the first step (`stdout` contains no `[1/`).

### The fourth red: the scan describing its own vocabulary

`coverage-writes-are-drained.test.ts` accepts two shapes of "joins the child it
started" — an inline `.on('close'|'exit'|'error', …)` and an `await new Promise` that
wraps one — because those were the two in the tree. `await once(child, 'exit')` is
the same join written shorter, and the scan reported the file that used it as an
offender. The rule is "joins the child"; the pattern list was its vocabulary. Third
shape added, with the reason written where the next author will read it.

### Acceptance

| gate | result |
| --- | --- |
| the meta-gate | `OK (41 gate(s))`; `check-audit-volumes.mjs` moved from `UNATTRIBUTED` to `CAUGHT (2 test(s) red)` |
| the verdict block | `reason:` on a failed step, absent on a bound; 2 tests, one of them an absence |
| the preflight | 6 tests: repaired, held, unavailable, the module stays a module, and the gate refuses before step 1 |
| the drain rule | third join shape accepted; `coverage-writes-are-drained` green |
| site inventory | **71** sites across 41 scripts, every one proved or exempted |
| `core` / `cli` / repo | **166 / 4168** · **4 / 187** · **170 / 4355** |
| coverage | core 99.97 statements / 99.74 branches / 100 functions / 99.97 lines; cli 100 ×4 |
| `verify:local` | **OK** — 31 commands covering 36 of 43 run steps; `verify 59s of 15m`, `batteries 17m of 30m` |
| the audit log | 5 volumes, findings 1–196, this one the first entry of `volume-05.md` |
