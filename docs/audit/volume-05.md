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

## Finding 197 — a document split by run order, and three readers that did not notice

`docs/progress.md` reached 519,758 bytes: the same size at which `docs/audit.md`
stopped being a document (finding 195), reached one document later. Splitting it
looked like the same job. It was not, and the difference is the whole finding.

**The audit log was split by size because a finding is cited by number.** A number
does not care which volume holds it, so a boundary at 280,000 bytes is invisible to
every reader. A round is not cited by number; it is **read in sequence**. "The fix
did not work, the guard passed on a no-op, and two correct rules met in one branch"
means what it says only because the round before it described the fix. A boundary
drawn for size can therefore separate a sentence from its subject.

So the rule is **run order**: a volume holds a contiguous run of rounds, boundaries
fall between two `## ` headings, and the volumes **tile** the log — concatenated,
they are the body that was moved, byte for byte. That last clause is the migration's
proof rather than its claim: it was asserted by the script that did the move
(`concat == body: True`), and the guard now holds the consequence, not the claim.

### The four volumes, and why the boundaries are where they are

| volume | rounds | bytes | opens with | closes with |
| --- | --- | --- | --- | --- |
| 01 | 20 | 102,903 | Pass 14 | Pass 34 |
| 02 | 16 | 92,309 | Pass 35 | Pass 48 |
| 03 | 16 | 126,949 | Pass 49 | Pass 64 |
| 04 | 23 | 130,230 | v2.06 | v2.27 |

The budget is 200,000 — smaller than the audit log's 280,000 on purpose. A round
costs 2–15 KB and arrives far more often than a finding, so the number that matters
is not how much fits but how many rounds of headroom: about fifteen, where the audit
volumes have about one.

`v2.26` and `v2.27` moved into a volume as well, which is worth saying: an index that
kept "the recent entries" would be a fourth naming scheme, and the log already had
two (`## Pass N` and `## v2.NN`) that took a guard to keep in order.

### The guard, and the two rules a sequence can break

`check-progress-volumes.mjs` (verdict) over `progress-volumes.mjs` (reading), for the
reason v2.27 recorded: a gate that a test imports cannot be proved by emptying it.
Five rules:

1. volumes `volume-NN.md`, contiguous from `01`;
2. each ≤ 200,000 bytes;
3. each **begins at a `## ` heading** — a volume that starts mid-round is a boundary
   drawn through a sentence, which is the one thing this split exists to prevent;
4. one order across both eras: `Pass N` strictly increasing, `vX.YY` non-decreasing,
   `v2.15, addendum` the only entry allowed to share a version, and no `Pass` after
   the first `v2.`;
5. the index row's count and first/last labels are the file's rather than the row's
   claim, and **no round is left behind in the index**.

Rule 5's second half is what says the body actually moved. It is checked with a
fence flag, because `v2.26` quotes four old heading forms and `v2.27` quotes a
verdict block: a census that counted them would report rounds the volume does not
hold — the audit guard was wrong about its own example first.

### The three readers whose scope shrank

The split moved 452,394 bytes out of a 519,758-byte file. Three guards read that
document, and each one named **one path**:

| reader | what it does | what the split did to it |
| --- | --- | --- |
| `check-doc-counts.mjs` | holds 179 published counts to the measurement | **went red** — "no file/test counts found", because the rows lived in the body |
| `measure-doc-counts.mjs --write-doc` | rewrites those rows to the new measurement | **would have reported success over nothing** — it wrote one path, found no rows, and printed `no row needed changing` |
| `check-open-list.mjs` | reads the `### Open` lists | would have found 1 list in the index and 46 in the volumes |

The first is a gate doing its job. **The second is the one that matters**: a writer
that opens the wrong file cannot be caught by a red gate, because its verdict is a
sentence it prints itself. That is the same asymmetry `blocker-claims.test.ts` closed
for the audit log — a check whose scope shrank while its verdict stayed green — one
level further out, at the *writer* rather than the reader.

All three now read `scripts/docs-corpus.mjs`: the index and every volume in *reading*
order, because the monotonicity rule over published counts ("a suite that lost tests
is a regression or a mislabelled scope") is only meaningful if the rows are read in
the order they were written. The writer keeps its single-file message word for word
when `--doc` names one file, and names each file and its own row count over the
corpus, because "3 row(s) updated" over five files says nothing about which.

### Acceptance

| gate | result |
| --- | --- |
| the migration | 79 headings → 75 rounds (four were fenced quotations); `concat == body: True` |
| the index | 69,216 bytes, naming four volumes once each; `check-progress-volumes: OK — 4 volume(s), 75 round(s); largest 130,230 of 200,000 bytes` |
| the guard | `progress-volumes.test.ts` **22 tests**: 3 labels, 6 volume rules, 5 order rules, 5 index rules, 2 spawns |
| the three readers | `check-doc-counts` 179 counts over the corpus; the writer writes the file the row lives in; `check-open-list` OK — 146 entries across 47 sections |
| `core` / `cli` / repo | **167 / 4190** · **4 / 187** · **171 / 4377** |
| site inventory | **72** sites across 42 scripts, every one proved or exempted |
| cold tree | `check-progress-volumes.mjs` measured with `packages/core/dist` moved aside: `OK — 4 volume(s), 75 round(s)`, exit 0 |

## Finding 198 — the rule was in prose, and the second violation proved it

Finding 196 moved the reading of `check-audit-volumes.mjs` out of the gate, because a
gate that a test **imports** cannot be proved: `verify-gates-are-testable.mjs` proves
a gate by emptying it, and an emptied file that a test imports kills the worker at its
first statement, reports no failing test, and is refused as `UNATTRIBUTED`.

That finding wrote the rule down. It did not give the rule a reader — and the
repository had a second violation the whole time, which only the meta-gate could see:

```
CAUGHT      measure-doc-counts.mjs                         3 test(s) red
```

`CAUGHT` is true and misleading at once. Three *other* test files spawn the script and
go red when it is emptied; four tests in two files **import** it, and those do not go
red — they disappear. The meta-gate's verdict is over "at least one test named", so a
partially-imported gate passes it while half its proof is invisible. That is the same
shape as a check whose scope shrank while its verdict stayed green, one level up:
the proof's scope shrank and the verdict stayed green.

### The rule, with a reader

`scripts-are-classified.test.ts` gains one assertion: no test file may import a file
whose register class is `gate` or `probe`. It reads every `from '…/scripts/x.mjs'` and
`import('…/scripts/x.mjs')` in `packages/core/test/*.test.ts`, joins it against the
register, and fails with the repair rather than the symptom. Two tests: the rule, and
a negative control that proves the pattern matches something and that the register
distinguishes `data` from `gate` — because a regex that matched nothing would make the
rule pass over every file.

Cost: under a second, against the meta-gate's two and a half minutes.

### What the violation was

`measure-doc-counts.mjs` is 890 lines and was two files in one: a library (`parseSummary`,
`countsFromReports`, the five `MeasurementUnavailable` subclasses, `rewritePublishedRows`,
`diagnoseRedRun`, `SCOPES`) and a CLI. Four tests imported the library half.

The split would have been mechanical except for one thing, and it is the interesting
part: **the library half called `fail()`**, which prints to stderr and ends the process.
A module that can end the process cannot be driven by a test at all — which is how
`fail()` came to be reachable from there: that half was written when it *was* the whole
program, and nothing had asked it to be callable since.

Six sites became `refuse()`, which throws `MeasurementUnavailable` — a class the gate
already caught and printed with `fail(error.lines)`. Same sentences, same exit code,
and now observable. The gate keeps the CLI, the measurement loop, the serialiser and
`main`.

### Two things the meta-gate cannot say

1. **A dynamic import through a variable is invisible to a literal scan.**
   `measure-doc-counts-readings.test.ts` did `await import(pathToFileURL(SCRIPT).href)`,
   so the new rule would not have caught it. It was found by running the suite: the
   import resolved, the constants came back `undefined`, and four tests failed with
   `expected '' to contain 'records a failure'`. The file now imports the data module
   statically and keeps `SCRIPT` only for the spawns, which is what the inventory
   expects. The rule's comment says it reads literal specifiers — a sentence about what
   the check does, rather than one claiming a property it does not have.
2. **`CAUGHT` does not mean "every test that names this gate is a proof".** It means
   "at least one is". The register's `why` fields carry the rest of the argument.

### Acceptance

| gate | result |
| --- | --- |
| the rule | 2 tests: the import scan, and a negative control on the pattern and the register |
| the violation | `measure-doc-counts.mjs` split into the gate and `scripts/doc-counts-rows.mjs` (`data`); 6 `fail()` sites became `refuse()` |
| the tests that imported it | 2 files repointed to the data module; `measure-doc-counts-readings.test.ts` stops importing a gate at all |
| the meta-gate | `OK (42 gate(s), each caught by at least one test)` |
| `core` / repo | **167 / 4192** · **171 / 4379** |
| site inventory | **72** sites across 42 scripts |

## Finding 199 — the inventory's proofs were statements, and nothing measured them

`golden-master/gate-sites.json` carries a `provedBy` for every failure site: the test
that proves this exit can fail. `gate-sites-are-proven.test.ts` holds two halves of it
— the file exists, and it names the script. Neither half is the claim. The claim is
that **the test goes red when the gate is wrong**, and nothing had ever measured that.

`verify-gates-are-testable.mjs` came closest, and stopped one word short. Its verdict
is `CAUGHT` when the hollowed gate made at least one test fail — *at least one*. So a
gate can be caught by one file while another file the inventory names proves nothing
at all, and the inventory stays green. That is the same shape this campaign has
recorded four times about checks, now on the **proofs**: a claim whose scope is wider
than the measurement behind it.

### The measurement, and the two ways to get it wrong

The meta-gate now attributes every `×` line to the file it came from and compares:

- `claimed` = the distinct `provedBy` paths for this gate's sites;
- `red` = the files in which the hollowed run named a failing test;
- `silent` = claimed ∩ run − red — claims this run could see and did not honour.

The first attempt reported `0 of 4 naming file(s)` for **all 42 gates**, and a
zero-silent verdict. It was wrong in the safe direction: the `×` line carries the
test's name and nothing else, and the file is on the `❯ <path>` header above it. A
measurement that is wrong in the safe direction is indistinguishable from a finding —
"no gate's proofs are unmeasured" is exactly what a parser that matches nothing would
say. The corrected parse reads both reporter shapes (`❯` + `×` locally, `FAIL <file>
> …` on CI), and `gate-proofs.test.ts` (8 tests) holds it against canned transcripts,
because a run of the real thing cannot tell those two apart.

### What it found

**Nothing.** All 42 gates honour every claim the inventory makes about them — zero
silent, measured, with the corrected parse. That is the right result and it is worth
stating plainly: this finding's subject is not a defect in the proofs, it is a defect
in the *claim* — an inventory that could have been wrong and would not have said so.

What it does produce is the distribution, printed on every run:

```
CAUGHT      check-doc-counts.mjs                         18 test(s) red in 1 of 4 naming file(s)
CAUGHT      build-example-bundle.mjs                      9 test(s) red in 1 of 5 naming file(s)
CAUGHT      apply-pins.mjs                               14 test(s) red in 2 of 3 naming file(s)
```

"Naming" is a much weaker relation than "proving", and until this run the two were the
same number in every report.

### The rule v2.29 imposed on this code

The parse had to live somewhere a test can import it, and `verify-gates-are-testable.mjs`
is a gate — so `scripts/gate-proofs.mjs` (`data`) holds `classify`, `redFiles`,
`claimedProofs` and `stripAnsi`, and the gate decides. The rule written in finding 198
was applied to the code written in finding 199, one round later, without being asked.

It also broke the meta-gate's own sandbox: the fixture copied the entry point and not
its new dependency, so every refusal printed `ERR_MODULE_NOT_FOUND` instead of its
sentence. Fixed in the fixture, with the reason beside it — a fixture is a tree the
script could run in, and a tree missing a dependency is not one.

### Acceptance

| gate | result |
| --- | --- |
| the comparison | `claimed` vs `red` per gate; `silent` restricted to claims this run executed |
| the corrected parse | `gate-proofs.test.ts` **8 tests**: both reporter shapes, no-header attribution, three endings, ANSI, prefix normalisation |
| the measurement | **42 gates, 0 silent claims**; `in M of K naming file(s)` printed for each |
| enforcement | a silent claim now fails the run, with the file and the gate named |
| the sandbox | `gate-proofs.mjs` copied beside the audit; 22 tests in that file, all green |
| `core` / repo | **168 / 4200** · **172 / 4387** |
