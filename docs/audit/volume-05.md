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

## Finding 200 — the denominator counted prose, and the ratio was retired to what it measures

Finding 199 introduced `in M of K naming file(s)`: M files went red when the gate was
emptied, K files "name" it. The first run printed `check-official.mjs 3 of 10`, and ten
minus three reads like a shortfall — seven files that name a gate and prove nothing.

Reading the ten says otherwise. One file drives it seventeen times. Of the other nine,
**seven are prose**: sentences in `//` and `/** */` comments, including one in
`gate-sites-are-proven.test.ts` that literally reads *"A file that mentions
`check-official.mjs` in a comment"*. The remaining two are a register key and a `DRIVES`
list. The denominator was `source.includes(gate)`, and a string search cannot tell a
sentence about a gate from a use of it.

**The repository already knew.** That comment is the distinction, written by somebody who
had hit it. What was missing was a reader.

### The fix, and what it moved

`namesInCode` strips comments and keeps strings — with a scanner that tracks quoting,
because the naive `replace(/\/\/.*$/gm, '')` truncates a line at the first `//` and this
tree is full of `https://` inside literals. Six tests: line comment, block comment
(one line and many), string, `https://` inside a string, an escaped quote, and code that
follows a comment.

| gate | before | after |
| --- | --- | --- |
| `check-official.mjs` | 3 of 10 | **3 of 4** |
| `check-no-mock.mjs` | 2 of 8 | **2 of 5** |
| `derive-gate-sites.mjs` | 2 of 7 | **2 of 5** |
| `inject-stability.mjs` | 3 of 8 | **3 of 6** |

`check-official.mjs` also went from 50 to **100** failing tests, because the nested run
now includes the files that actually drive it instead of three that merely mentioned it.

### What the residual is, and why the ratio stops here

After the correction, 75 files still name some gate in code and do not go red when it is
emptied — and they are not evidence of anything missing. `scripts-are-classified.test.ts`
alone names all 42 gates by design: a register key is a string, and it is a proof *of the
register*, not of the gate. `gate-sites-are-proven.test.ts` asserts about the inventory,
`cold-tree-job.test.ts` about a command list.

There is no source-level scan that separates "names it in order to run it" from "names it
in order to say something about it" — the only instrument that can is the run itself, and
the run's answer *is* M. A ratio whose denominator cannot be measured is a number that
invites an inference it cannot support, so the verdict line keeps `in M file(s)` and the
residual is reported once, at the end, as a count with its widest three:

```
named in code, not red: 75 file(s) across 42 gate(s); widest: check-doc-counts.mjs 3, …
```

### The fixture that named its subject in a comment

The correction broke 15 tests in `gates-are-testable-is-enumerated.test.ts`, all with the
wrong refusal. The sandbox wrote its subject into a test file as
`// names scripts/check-throwaway.mjs so the audit has a subject to run` — a comment. Under
the new rule the sandbox had **no test naming its subject**, so every case measured the
`NO-TEST` path instead of the one it was written for.

That is the finding in one sentence: a fixture had been relying on prose being counted, in
the very file whose subject is "the audit of the audits".

### Acceptance

| gate | result |
| --- | --- |
| `namesInCode` / `stripComments` | 6 tests, including the `https://` case the naive stripper would truncate |
| the ratio | K is now "names it in code"; the residual is printed once at the end, not judged |
| the measurement | 42 gates, 0 silent claims, **75** mentioners across 42 gates |
| the fixture | names its subject in code; 22 tests in that file, all green |
| `core` / repo | **168 / 4206** · **172 / 4393** |

## Finding 201 — a number that grows with the tree is read as debt

Finding 200 retired the `M of K` ratio and left one line: `named in code, not red: 77
file(s) across 42 gate(s)`. That number is honest and unusable. It grows by one every
time a gate is added, because `scripts-are-classified.test.ts` names all of them by
design, and within two rounds a reader sees a backlog where there is a register.

The fix is not to stop counting. It is to say **what the count is made of**, and the
shape for that already exists in this repository: a table a human types, each row
carrying the thing it is a proof of instead. Three rows cover most of it.

| role | what it proves instead | pairs |
| --- | --- | --- |
| `scripts-are-classified.test.ts` | the classification of every script | 42 |
| `cold-tree-job.test.ts` | where a gate runs, held to what was measured cold-safe | 15 |
| `gate-sites-are-proven.test.ts` | the inventory's own rules | **0** |

### The residue, named rather than counted

The third row explains nothing in this run, and that is a fact worth its cell: every
gate `gate-sites-are-proven.test.ts` names also goes red when it is emptied, because the
deriver reads the hollowed file. It is declared because a future gate might not be, and
because a table that listed only the rows that currently fire would be a snapshot rather
than a rule.

57 of 77 pairs are explained, and the line now reads:

```
named in code, not red: 77 pair(s); 42 the script register, 15 a command list; unexplained 20: …
```

Twenty pairs across ten files are printed **by name** and not judged. Sampling them
suggests a fourth class — `injection-target-routing.test.ts` and `spread-append-guard.test.ts`
hold tables of `{ file: 'scripts/…' }` rows, which are data about scripts rather than
drives of them — but sampling is not measurement, and adding a row to the table on the
strength of two samples is how a table becomes a place to put anything. The table has
three rows and a test that refuses a fourth kind of growth:

```js
expect(MENTIONER_ROLES.length).toBeLessThan(6);
```

That assertion is worth more than it looks. A role table that lists every file explains
everything and means nothing — the same failure as a check whose scope is "all of it".

### What the three rows are, in code

`classifyMentioners(entries, roles)` splits `{gate, file}` pairs into the declared roles
and the residue, and the tests hold the arithmetic rather than the prose:

- the parts add up to the whole, so a dropped pair cannot hide behind a breakdown;
- every declared file exists, so a rename cannot leave the rule covering nothing;
- every row's `why` is longer than 80 characters, the same floor the doc-count exemptions
  use, because a reason short enough to be a label is not a reason.

Seventeen tests in `gate-proofs.test.ts` now, three of them for the table.

### Acceptance

| gate | result |
| --- | --- |
| the roles | 3 declared, 57 of 77 pairs explained, 20 named by file |
| the arithmetic | parts = whole, in a test rather than in a sentence |
| the table's own limits | file exists; `why` ≥ 80 characters; fewer than six rows |
| the measurement | 42 gates, 0 silent claims, 77 pairs (42 + 15 + 20) |
| `core` / repo | **168 / 4209** · **172 / 4396** |

## Finding 202 — the sample was a property of the whole corpus

Finding 201 left twenty unexplained pairs and one promise: read the ten files. Reading
them produced a better question than the one asked.

**Each of the ten names two to four gates and drives one.** `gen-rcaeval-cases.test.ts`
spawns `gen-rcaeval-cases.mjs` and also asserts that another script's name appears in
some output; `spread-append-guard.test.ts` holds a table of `{ file: 'scripts/…' }` rows;
`injection-target-routing.test.ts` lists the injection scripts it routes. Those pairs are
incidental — a mention *about* a gate, not a use of it — and no source scan separates the
two, which is exactly why finding 200 retired that ratio.

So the twenty are not defects, and saying so is not a measurement either. The pair that
**is** not incidental by construction is a gate's own test file: if `check-no-mock.mjs`
has a `check-no-mock.test.ts` and emptying the gate leaves that file green, the file named
after the gate does not exercise it. `namesakeOf(gate)` makes that askable, and the answer
on this tree is **zero** — no gate's namesake survives its own emptying.

### And the incident that produced the question

The pair count moved from 77 to 36 between two runs of an unchanged meta-gate, with the
register's 42 pairs vanishing. The cause was two files away:
`scripts-are-classified.test.ts` asserted `expect(undriven).toContain('serve-site.mjs')`,
and `gate-proofs.test.ts` — written in this round — used `namesakeOf('serve-site.mjs')` as
a sample. A mention in *any* test file puts the name into the corpus, `serve-site.mjs`
stopped being undriven, that assertion failed for **every** gate at once, and the register
file became a red file for all 42 — so the meta-gate reported no register pairs.

The comment above that assertion already recorded the first incident of exactly this kind,
and concluded that "pinning the exact set would report a coverage change where only prose
had changed". It then pinned one name anyway. **A pinned name is a property of the whole
corpus**, so any new sentence about a script retires it — and a sample that a sentence can
retire is not a sample.

The assertion is gone. What stands in its place is the rule the same comment argued for:
the undriven set is whatever it is, every member must name a class with no verdict to
prove, and `serve-site.mjs` keeps one stable claim — it is a `tool`, and a tool has no exit
for a test to prove. Vacuity is guarded from the other side, by the corpus size.

| gate | result |
| --- | --- |
| namesakes | **0** silent: every gate whose namesake exists is caught by it |
| the twenty pairs | read, and incidental: each file drives one gate and mentions others |
| the register incident | found by the meta-gate's own breakdown moving 42 → 0; fixed by removing the pin |
| `gate-proofs.test.ts` | **19 tests** (`namesakeOf`, both shapes) |
| `core` / repo | **168 / 4211** · **172 / 4398** |

### The nested run that inherited the lock

This round's second defect arrived while proving the first. `verify:local` went red at
`5/31` with the preflight from finding 196 doing exactly its job:

```
reason:  the step exited 1
...
× runs a step in the directory the workflow names
  → verify:local: the tree is not the repository's:
    _witnesses: pid 213281 is running gate-tests-battery on this tree
```

A test in the suite spawns `verify:local.mjs` against a fixture workflow, and the child
**inherited the repository's battery cache** — so when any battery was in flight, the
nested run refused to measure a tree it was told somebody else held. The step it was
asked to run was fine; the refusal was about a lock two processes away.

The repair is the same rule the preflight enforces, applied one level down: a nested run
measures a tree nobody else is holding, or it measures nothing. `nestedEnv(workflow)` gives
each fixture run a cache of its own — empty, therefore unheld — and the ten spawn sites in
`gate-steps.test.ts` now go through it rather than through `{ ...process.env, … }`.

This is the third time in five rounds that ambient state reached a process that had no
business seeing it (a killed battery's mutations, a live battery's lock, and now a lock
inherited by a nested gate). The pattern is the same each time: **a child inherits an
environment, and the environment is a claim about the whole machine.**

## Finding 203 — the open list had two spellings, and one of them had no reader

The guard that reads `docs/progress.md`'s open list was written because three entries
had stopped meaning anything while nothing read them. Its docstring, written in the
same round, draws the conclusion:

> A document that gains a list must gain a reader for it, and the only way to hold that
> is to read all of them.

It then reads **all sections with one heading**:

```js
const DOCS = [{ path: 'docs/progress.md', heading: '### Open' }];
```

The index has an `## Open`. The guard has never seen it. Nineteen thousand, two hundred
and eighty-five bytes, twelve entries, and — measured — **zero** `[open:` markers and
zero closure citations. The volumes' 132 entries are all marked, because the guard
reads them; the index's twelve are not, because nothing did.

This is finding 195's shape, one document later and written by the same hand: a census
that knew four heading forms counted 127 of 191, and the lesson recorded there was that
*the vocabulary of the scan is a claim about the document*. The vocabulary here was one
string.

### What the twelve were

Not a to-do list. A v1-era residuals section, and four of the twelve had been false for
as long as they had existed. The clearest:

> **Five gates are covered by CI running them, not by a test that forces them to
> fail.** ... `check-readme-sample.mjs`, `build-example-bundle.mjs` and `gen-examples.mjs`
> have no test naming them ...

The meta-gate now reports all three, and the two others the entry names:

```
CAUGHT      build-example-bundle.mjs      18 test(s) red in 1 of 2 naming file(s)
CAUGHT      check-readme-sample.mjs       14 test(s) red in 1 of 3 naming file(s)
CAUGHT      gen-examples.mjs              24 test(s) red in 1 of 2 naming file(s)
CAUGHT      check-cli-reference.mjs       32 test(s) red in 3 of 4 naming file(s)
CAUGHT      gen-rcaeval-cases.mjs         38 test(s) red in 1 of 4 naming file(s)
```

and each has a namesake file. So the entry's first half is closed and its second half is
not: the meta-gate proves a gate is caught by **at least** one test, not that every exit
has one (finding 199). It was narrowed rather than struck.

The twelve, each given a verdict by measurement rather than by reading:

| entry | verdict | authority |
| --- | --- | --- |
| real-corpus runs diagnosed | closed | the third naming is the run's own stack trace, quoted in the entry |
| dispatch fired four times | closed | the fix was in a scratch helper outside this tree |
| Anchor 4 closed for three anchors only | **open** | six score targets still have no automated fetch |
| the fourth anchor's fetch defect | closed | `Pass 15` — the first round with a reading from a real run |
| no measured extraction accuracy | closed | `Pass 15`, whose title is "the first reading, and M1 is not met" |
| OpenRCA shard-cache route | **open** | making the shards a source is a change in six other repositories |
| Anchor 4 closed by `official-data.yml` | closed | the workflow is the closure; the retractions are in the audit |
| active injection | **open** | it needs a cluster, and a cluster test does not run in CI |
| Chaos Mesh mapping table | **open** | no test runs `kubectl apply --dry-run=server` |
| five gates only covered by CI | **open, narrowed** | naming half closed; branch half is what the meta-gate cannot say |
| export enumeration | **open** | it asserts a name is mentioned, not called |
| `glm-embedding-3` scheduling | **open** | scope: the abstraction is here, the model is not |

Six closed, six open — and the six that are open now say what would close them, which
none of the twelve did before.

### The second defect, in the same guard

The docstring promises a closed entry is "struck through, **with the finding that closed
it named**". The regex was `/~~|Closed by finding \d+/`, which a strikethrough alone
satisfies — so half the promise was unenforced. And the enforced half could not have
worked on more than half the document: eleven of the twenty shipped citations wrap
(`**Closed by\nfinding 170.**`), and the pattern has no `\s+` across the break.

A rule stated in prose and a rule enforced in code had drifted, which is the defect this
guard exists to catch in other people's lists.

The closure rule now needs **one of three authorities**, and the third exists because
two of the closures I had to judge are not findings at all:

1. `Closed by finding N`;
2. `Closed by Pass N` — this log names rounds in two eras, and a round closes most things;
3. `Closed without a finding: <sentence>` / `Closed in this pass ...`, where the
   authority is a measurement or a fix outside this tree.

`[^.]{0,120}?` keeps the citation inside the closure's own sentence, so "Closed by the
workflow. Finding 170 later found something else." cannot read as a citation.

Measured before choosing the tightening: **19 of the 20 shipped closures already complied**,
and the twentieth says "Closed in this pass by the run itself: 15 s for the install",
which the third authority accepts verbatim. So the stricter rule cost nothing and made
fourteen citations visible that the old one could not see.

### The third defect, in the test

`check-open-list.test.ts` held a **copy** of the guard's two regexes, and five tests
drove the copy — for the reason its own comment gives, that the guard has no injection
point for its document. When the guard was tightened the copy would have stayed where
it was, and those five tests would have gone on agreeing with an implementation that no
longer existed.

They are gone. Every rule is now driven through `runOn`, which spawns the script, so
there is one vocabulary and it is the shipped one. The five new rules (second spelling,
uncited closure refused, three authorities accepted, nested list refused, and the
`## Open` section read rather than merely refused) are all spawns.

Net test count in that file: **13 → 12**. One fewer, and the five that left were
measuring a copy of the thing they claimed to measure.

### The nesting rule, which only two spellings make reachable

A `### Open` inside a `## Open` is two sections whose entry counts overlap. The guard
reports `2 section(s)` and would count the inner list twice, so the summary number would
depend on how the document is headed rather than on how much is open. It is refused
rather than de-duplicated: a document with a list inside a list has no answer to "which
list does this entry belong to", and a guard that silently picked one would be guessing.

### Acceptance

| gate | result |
| --- | --- |
| the spellings | `## Open` and `### Open`, both read; the twelve were exposed at **164 entries across 54 sections** (was 152 / 53) and the document now reports **167 / 55**, its own list included |
| the twelve | 6 closed with an authority, 6 open with a reason that names what would close it |
| the closure rule | one of three authorities required; **19 of 20** shipped closures complied before the change |
| the copy | removed from the test; **12 tests**, all spawning the script |
| the nesting | refused with both line numbers named; 1 test |
| `core` / repo | **168 / 4210** · **172 / 4397** |
| coverage | 99.97 / 99.74 / 100 / 99.97 and 100 ×4 |

## Finding 204 — two counters reached forty-two, and they were not the same counter

`docs/progress.md` carries a table of eleven audit passes with a `Defects` column, and the
audit log carries findings numbered 1–203. Nothing has ever compared them. The obvious
comparison, and the one this round set out to build a guard for:

```
6 + 5 + 4 + 8 + 5 + 3 + 2 + 2 + 3 + 2 + 2 = 42
```

and there are exactly 42 findings numbered 1 through 42. A guard asserting
`sum(defects) === count(findings 1..sum)` would have been written, would have passed, and
would have looked like a check on a table that had none.

**It is a coincidence of two sequences that happen to reach the same number.** Finding 39
is *"A 2.8 GB download was verified with a function that cannot read above 2 GiB"* — the
subject of **pass 6** (`scripts/fetch-official.mjs`), numbered 39 because it was found
during the real-corpus runs. Finding 42, *"The corpus layout was assumed rather than
read"*, is the same line of work. Pass 11 is `src/fault/injector.ts`. The findings are
numbered by when they were found; the passes are numbered by when they were run; the two
orders diverge and the totals agree by accident.

A guard built on the accident has a second failure mode that is worse than the first: it
would keep passing after somebody edited one of the eleven numbers, because the sum would
still be a number that exists as a finding. **A check whose assertion is true for a reason
other than the one it names is a check that will approve the change it was written to
refuse.**

### And the section is not a duplicate either

The plan before that one was to delete the section as a copy of the audit log. Measured:
of 79 prose sentences longer than 60 characters in `## Audit passes`, **zero** appear in
`docs/audit/`. It is unique synthesis — *why* each pass was chosen, which the
finding-by-finding audit log does not carry.

Two plans, both killed by measurement, and neither by argument.

### What the round did instead

The section stays. What was wrong was the index's own accounting, in three places:

1. **`named in code, not red` is retired.** Four rounds: 77 pairs, then a table of three
   roles to explain 57 of them, then 21 residual pairs across ten files, then a role table
   with an assertion refusing its own growth. Every measurement was correct and nothing
   read them. The two questions the line was introduced for — are the inventory's claims
   honoured, and does a gate's own test catch it — are answered by **failures**, which the
   runs already produce. `MENTIONER_ROLES` and `classifyMentioners` existed to explain the
   count and left with it.
2. **The index must be smaller than the smallest volume.** A relation, not a budget: the
   file a reader opens first, to find their way to the others, must not be bigger than
   what it indexes. Printed on every run as two numbers —
   `index 72,217 of smallest volume 92,309` — so the twenty kilobytes of headroom are
   visible rather than assumed.
3. **A claim of mine, corrected.** v2.28's open list says the index had become "the
   largest single file in `docs/`". It is the **smallest** of the five progress files.
   That sentence was written in a round whose subject was that a measurement must be taken
   rather than assumed, and nothing measured it for six rounds.

### The fixture that had to be padded

The relation reddened fifteen structural tests at once, all for a size reason they were
not written to exercise: their "volumes" were one heading, twenty bytes. `volumesOf` now
pads every fixture body to 4,000 bytes, with the reason beside it — **a volume is tens of
kilobytes, and a twenty-byte one is not a volume**. The alternative was an option that
turns the relation off, which is precisely the seam that lets a test measure nothing.

### Acceptance

| gate | result |
| --- | --- |
| the two counters | sum 42 vs findings 1–42: **not the same sequence**, shown by finding 39 (pass 6's subject, numbered 39) |
| the duplication | 0 of 79 prose sentences in the audit log; the section is unique and stays |
| the retired line | `named in code, not red` gone, with `MENTIONER_ROLES` and `classifyMentioners`; 3 tests removed with them |
| the relation | index **71,492** of smallest volume **92,309**, printed each run; 2 tests (one red, one green) |
| the fixtures | every volume body padded to 4,000 bytes, with the reason |
| `core` / repo | **168 / 4209** · **172 / 4396** |

## Finding 205 — a citation reads as well when it resolves to nothing

The audit log numbers its findings 1–204 and cites them constantly: "closed by finding 170",
"finding 46's fix", "the mechanism finding 39 named". The progress log cites them too, from
every round. Across 1.6 MB of markdown there are **996 citations of 202 distinct numbers**,
and until this round nothing had ever checked that a cited number names something.

Two did not.

| citation | file | what the sentence says |
| --- | --- | --- |
| the number 118 | `docs/audit/volume-03.md:773` | "the same reason ... names its own misdiagnosis" |
| the number 133 | `docs/audit/volume-03.md:2383` | "a diagnostic pass while writing up ..." |
| the number 133 | `docs/progress/volume-02.md:519` | "writing up ... turned into finding 134 and then finding 135" |

The third one is also the explanation: **133 was a write-up that became 134 and 135.** The
number was consumed by work that split in two, and the two sentences that referred to it
went on referring. The number 118 has no such story anywhere in the corpus; the sentence that
cites it is the only trace, and it says the finding named a misdiagnosis of its own.

### Why this is worth a gate rather than a careful read

A citation that resolves to nothing **reads exactly as convincingly as one that does**.
The sentence around it is right, the number is wrong, and the reader who follows it finds
an adjacent finding and assumes they mis-scrolled. That is the property that makes it
mechanical: no amount of care at write time catches it, because the thing being checked is
whether a number exists, which is exactly what a script can know.

The guard is `check-citations.mjs` over `audit-citations.mjs`, split at the seam finding
196 established — a gate that a test imports cannot be proved by emptying it. It reports
two different things and only one is an error:

- **`absent`** — numbers skipped in the sequence (118, 132, 133). *Printed.* A hole nothing
  cites is invisible, and renumbering 204 findings to close three would break every
  citation that works today.
- **`dangling`** — a citation of a number with no heading. *Refused*, with file, line, and
  the sentence, because a repair edits one sentence and "somewhere in 1.6 MB" is not a
  place.

### What it cannot do, stated rather than implied

It checks that a number **exists**, not that it is the *right* number. A sentence citing
finding 41 when it meant 42 passes forever: both exist, and the claim about either is prose.
So the three repairs are judgements, and each is recorded as one:

1. `volume-03:773` now cites **finding 46**, whose title is a correction of a wrong
   mechanism — the nearest true referent to "names its own misdiagnosis". The original
   number has no history to consult, so this is a choice rather than a correction.
2. `volume-03:2383` now reads "while writing up **this** finding", because the pass happened
   inside finding 134 and no other number is needed.
3. `progress/volume-02:519` now reads "one write-up turned into findings 134 and 135, and
   all three — 131, 134 and 135 — are the same statement", which is what the table beneath
   it lists. The old sentence counted 133 among the three, and 133 was never written.

### Acceptance

| gate | result |
| --- | --- |
| the measurement | **977 citations of 201 numbers across 11 files**; 3 citations of 2 numbers did not resolve |
| the repairs | 3 sentences, each a recorded judgement rather than a substitution |
| the guard | `audit-citations.test.ts` **7 tests**: both heading spellings, three citation spellings, sentence-not-paragraph context, dangling with location, one number/three places, holes, and the shipped corpus |
| the meta-gate | `CAUGHT check-citations.mjs 3 test(s) red in 2 of 3 naming file(s)`; **43 gates** |
| the inventory | **73** failure sites across 43 scripts, each proved or exempted |
| cold tree | measured with `packages/core/dist` moved aside: `OK (977 citation(s) of 201 number(s) across 11 file(s))`, exit 0 |
| `core` / repo | **169 / 4216** · **173 / 4403** |

## Finding 206 — a budget sized on a number nobody took on the runner

The run that carried finding 205 came back `cancelled`. Not failed: cancelled. One job,
`build / typecheck / lint / coverage / mutation / one reader against a real backend`, and
the API says which step:

```
  1 Set up job                                        0.0m  success
  6 Install the shells the suite cross-checks against  2.5m  success
 10 Test with coverage (core + cli)                    1.5m  success
 12 Mutation suite (gate + export)                     0.0m  success
 13 Install a backend this repository did not write   10.8m  cancelled
 14 A reader, against that backend                     0.0m  skipped
```

Steps 1–12 sum to **259 s**. Step 13 — `apt-get update -qq && apt-get install -y -qq
prometheus` — took **648 s** and was then cancelled at the job's `timeout-minutes: 15`. The
budget was spent by two commands whose costs differ by a factor of forty, and the report
said *cancelled*, which reads like somebody stopped the run.

The comment beside that step gives the number the budget was sized on:

> The distribution already carries Prometheus 2.45.3 — the same version pass 44 measured by
> hand — so the cost here is an `apt-get` and **nine seconds**.

Nine seconds is what it costs where the apt index and the package cache are warm. A cold
`ubuntu-latest` runner pays for both. **The step was costed at nine seconds and measured at
648, and nothing between those two numbers ever ran**, because a budget is only tested when
it is exhausted.

### This is finding 166 again, one level down

Finding 166 split one job into three because "the fix is not a bigger number in one bucket,
it is three buckets whose wall clocks run beside each other" — after a run was reported
`cancelled` with eight steps `skipped`, which "reads like somebody stopped it rather than
like a budget being spent". The split held for four rounds. Then the verify bucket re-acquired
a member with a completely different cost profile, and the same sentence came true again.

That is the part worth recording: **a split is not a property of the workflow, it is a
property of the steps in it at the time.** A bucket whose name lists five things will grow a
sixth, and the sixth will be costed by whoever adds it — from a warm machine.

### The change

A fourth job, `backend`, holding the install and the reader, with `timeout-minutes: 20`
against a measured 648 s install plus a build and a reader. The comment states the
measurement and the reason the headroom exists (an apt mirror having a bad day is not a
finding about this repository). `verify` keeps its 15 minutes for the 259 s of work it
actually does, which is a budget with real headroom for the first time.

Three consequences, each mechanical:

1. **`STEP_PLAN` failed loudly**, which is what it is for: "if a step is added to the
   workflow and not added here, `gate-steps.test.ts` fails — which is the moment a person is
   still thinking about what the step needs". Two steps moved, two were added, and the table
   said so before the suite could pass.
2. **`verify:local` now covers 38 of 45 run steps** (was 36 of 43), because the new job's
   `Install dependencies` and `Build` are commands this machine runs too.
3. **Four tests pinned `36`** — the local step count — in assertions whose subject was "no
   step overrides the shell, the directory or the environment". They failed for a reason
   that had nothing to do with that. The count is now `\d+` and the property is unchanged:
   the number was never what the test was about.

### Acceptance

| gate | result |
| --- | --- |
| the measurement | steps 1–12 **259 s**; step 13 **648 s**, cancelled at 900 s |
| the claim in the comment | "nine seconds" — 72× below the measured cost, and never taken on a runner |
| the workflow | **5 jobs**: verify 15m, backend 20m, batteries 30m, artefacts 15m, cold-tree 20m |
| the plan table | 2 steps moved, 2 added; the exhaustiveness test caught the move first |
| the pinned counts | 4 assertions unpinned; the properties they name are unchanged |
| `verify:local` | **OK** — 31 commands covering **38 of 45** run steps |
| `core` / repo | **169 / 4216** · **173 / 4403** |

## Finding 207 — fifty-eight answers to one question, and one of them current

`docs/progress.md` had two headings spelled `## Open` and `### Open`. The first is the
index's list, twelve entries inherited from the v1 era; the second closes every round, and
there are fifty-seven of them. Both read as "what is not done".

A reader who greps for the open list therefore gets **fifty-eight answers**, and exactly one
is current. The other fifty-seven are records of what a round left behind, frozen at that
round, and most of them describe things that were fixed afterwards -- by a later round, in a
later volume, under a heading that also says `Open`.

### What made this a defect rather than a habit

Two measurements, neither of which was available when the headings were chosen:

1. **The rounds do not carry residuals forward.** Of 135 open entries, **120 never reappear**
   in the next round's list. So "read the last round" is not the answer either: a residual
   raised in v2.12 and never mentioned again is still open if nothing closed it, and no
   single round's list contains it.
2. **There is no derivation from the records to the live set.** An entry is closed by a
   sentence somebody writes; nothing links the sentence to the entry. A guard can check that
   each entry says which it is (finding 203) and cannot check that any of them is still true.

Together they leave exactly one workable arrangement: **one list maintained by hand, and the
rest declared records.** A list that must be derived cannot be; a list that is not derived
must be maintained; and a maintained list needs a name that says so.

### The change

`### Open` in the volumes became `### Left open` -- 57 headings, mechanical, and the count is
asserted. The index keeps `## Open` and now says what it is:

> **This is the only live list.** An entry arrives when the round that raised it declined to
> close it, and is struck when something closes it. A round's own heading is `### Left open`,
> and it is a record of that round, frozen.

Renaming rather than writing the rule down is the whole point. A comment saying "`## Open` is
live" leaves fifty-seven headings that still say `Open`; the reader who greps has already been
misled by the time they find the comment.

The guard's duplicate rule moved with it, and that move is not cosmetic: it was scoped
document-wide, so a live entry and the record that raised it would have been refused for
"sharing a reason". **A carried-forward item is supposed to appear in both.** The rule is now
scoped to one kind, where a shared sentence really is a copy-paste -- the second round
re-signing the first one's text without reading it.

One test now asserts the old spelling is *not* read, because finding 203's first half is the
half a revert would silently undo: a document that went back to `### Open` has no list this
guard reads, and says so.

### Acceptance

| gate | result |
| --- | --- |
| the rename | **57** headings; no `### Open` heading remains in the volumes |
| the live list | one `## Open`, the index's, carrying the standing limits and this round's question |
| the guard | **173 entries across 59 sections: 1 live, 58 records**; 148 open with a reason (172 / 58 before this round's own record) |
| the duplicate rule | scoped to one kind; 2 tests (a carry-forward accepted, two records refused) |
| the revert | the old spelling is no longer read, and the run says the list is gone |
| `core` / repo | **169 / 4218** · **173 / 4405** |

## Finding 208 — a bound that could only be obeyed by the file it was not about

`docs/progress.md`'s volumes have a 280,000-byte budget, and every volume was judged against
it. The number exists for one reason, stated in the guard: a volume past it becomes a pile,
and the reader who has to push and diff it is the one who pays. So it forces a decision --
*start the next volume*.

That advice is only available to the volume that can still grow. Appends land in the last
one; the others are closed, and will never take another round. Judging them against the same
bound therefore produced a rule that could only be obeyed by a file it was not about:

```
docs/audit/volume-03.md   279,893 of 280,000      (107 bytes of room)
```

A repair of one sentence that happened to cross 107 bytes would have been refused, and the
refusal would have said "start the next volume, move the newest round into it" -- advice
volume-03 cannot follow, about a file that is not a pile.

### The decision, and what it costs

The bound now applies to **the last volume only**. Three candidates were on the table and the
live list carried the question for two rounds:

| rule | what it would do | why not |
| --- | --- | --- |
| judge every volume | refuses repairs with impossible advice | the case above |
| a repair allowance for closed volumes | 280,000 to split, 282,000 to repair | two numbers, and the second exists only to undo the first |
| judge the growing volume | the number does what it was written for | a closed volume could be grown by an edit unnoticed |

The third is chosen, and its cost is **stated rather than guarded**: every volume's size is
now printed on each run --

```
sizes 102,903 / 92,355 / 127,029 / 169,431; index 73,625 of smallest volume 92,355
```

(That is the line at the moment this finding was written; the numbers move with every round,
which is why the line is printed rather than quoted in a comment.)

-- so a volume that doubled would appear in the line a reader of a red build already reads.
That is a weaker guarantee than a red gate, and it is the honest one: the failure it guards
against is somebody quietly appending 100 KB to a closed volume, which nobody has done and
which no invariant in this repository would notice even if it were checked, because the
closed volumes' contents are prose.

### Why this was worth a finding rather than a footnote

It is the third time in three rounds that a number's *purpose* outlived its *formula*
(finding 206: a budget costed at nine seconds; finding 207: two lists both called Open;
this one: a split trigger applied to files that cannot split). The pattern is not "the
number was wrong". Each number was right when it was written, and each kept being applied
after the thing it was about had changed -- a job that grew a member, a heading that was
copied, a volume that closed.

### Acceptance

| gate | result |
| --- | --- |
| the bound | judged on the last volume only; a closed volume over it is no longer an error |
| the visibility | all four sizes printed on every run, with the index's relation beside them |
| the tests | 2: closed-over-budget accepted **and** last-over-budget refused, in one case; sizes printed one per volume |
| volume-03 | 279,893 bytes, now compliant by construction rather than by luck |
| `core` / repo | **169 / 4220** · **173 / 4407** |

## Finding 209 — M1's failure belongs to the model, and now that is measured rather than assumed

M1 is the milestone this repository is short of: a strict all-fields extraction rate at or
above 70%. Pass 15 recorded *"the first real reading, and it says M1 is not met"*, and every
round since has worked on the pipeline around it — the guards, the docs, the CI — without
asking the prior question: **does the metric grade its own answer key at 100%?**

If it does not, every model number is uninterpretable, because a run could fail for a reason
that has nothing to do with the model. The audit log's **finding 1** is exactly this class —
*"the regression graded its own answer key"* — and it was found in the regression's scoring
path, not in the extraction one.

### The control

`golden-master/fault-extraction/samples.json` carries 19 samples with `expected: {type,
category, component}`. Submitting those expectations back as predictions, with
`parseOk`/`validationValid`/`verifiable` true, and scoring them with the shipped scorer:

```
  parsed: 19/19 (100.0%)   validated: 19/19 (100.0%)   graded: 19/19 (100.0%)
    type        : graded 19/19 (100.0%)   overall 19/19 (100.0%)
    category    : graded 19/19 (100.0%)   overall 19/19 (100.0%)
    component   : graded 19/19 (100.0%)   overall 19/19 (100.0%)
    description : graded 0/0 (n/a)        overall 0/19 (0.0%)
  strict all-fields: 19/19 (100.0%)
  M1 exit condition: MET (>= 70% strict)
```

**The instrument is sound.** It gives its own answers full marks on every field it scores,
which is the one result that lets "M1 is not met" be a statement about an extractor rather
than about a metric.

### The control needs a control

A test that asserts 100% is worthless if the metric would say 100% to anything. So the same
run was repeated with two predictions corrupted by hand:

| corrupted | type | category | component | strict |
| --- | --- | --- | --- | --- |
| one component, one type | 18/19 | 19/19 | 18/19 | **17/19** |

The metric discriminates, and the 100% above is a reading rather than a constant. Both halves
are now a test (`answer-key.test.ts`, 4 cases): the oracle at 100%, M1 cleared by it, the
`description` scope asserted, and the dataset's shape held so the control cannot go vacuous
by shrinking to one sample or losing a field.

### The scope fact worth publishing

`description` has **no denominator**: `expected` carries three fields, so a run that never
emits a description still reaches 100% strict. That is visible in the report as
`graded 0/0 (n/a)` and it is now asserted, because a reader of "M1 met" is entitled to know
which fields the number is over. It is not a defect — the fourth field has no ground truth to
be graded against — and calling it one would be worse than saying it.

### Why this belongs before any optimisation

The next rounds can now spend themselves on the extractor: a change that moves the strict
rate from below 70% to above it is a change in a number whose ceiling has been checked. The
alternative — tuning against a metric nobody had asked to grade its own key — is how a run
gets to 74% and turns out to have moved nothing.

### Acceptance

| gate | result |
| --- | --- |
| the oracle | type / category / component **19/19**; strict **19/19**; M1 **MET** |
| the negative control | two corrupted predictions → **17/19** strict; the metric discriminates |
| the scope | `description` `graded 0/0`, asserted, so "strict" is named over three fields |
| the vacuity guards | ≥19 samples; every sample carries a non-empty value for each scored field |
| the tests | `answer-key.test.ts` **4** |
| `core` / repo | **170 / 4224** · **174 / 4411** |

## Finding 210 — the vocabulary experiment, run 140 findings late, moved `type` from 21% to 90%

M1 was at **2/19 strict**. The first thing this session did was check the instrument (finding
209): it grades its own answer key at 100%. Then the reading itself, from DeepSeek on a runner:

| field | first real reading (v2.40, unstated space) |
| --- | --- |
| type | **4/19 (21.1%)** |
| category | 11/19 (57.9%) |
| component | 14/19 (73.7%) |
| **strict** | **2/19 (10.5%)** |

Every one of the 28 field-misses was `wrongValue` and none was omitted: the model always
answered, and its answers were **the right fault under another name** —
`cpu-saturation → cpu-throttling`, `memory-leak → unbounded-cache-growth`, `disk-full →
disk-space-exhaustion`, `pod-kill → kubelet-eviction`, `network-loss → network-packet-drop`.

### This had already been diagnosed, 140 findings ago

**Finding 62** measured `type` at 26.3% and named the cause precisely: `category` is a stated
seven-value vocabulary and scored 57.9%; `type` was the words "fault type (short)", and the
expected answers are canonical slugs that appear in **0 of 19** incident texts. It concluded
that "a stated 19-label vocabulary is derivable from the input, so `type`'s ceiling is 19/19
and 26.3% is fully fixable" — and warned that `category` would become the binding constraint
afterwards.

**Finding 63** answered the *shape* instead: hyphenated, lower-case, prefer the mechanism.
**Finding 64** measured what that bought: **one sample**. The vocabulary experiment was never
run. Four hundred and sixty findings of pipeline work later, `type` was at 21.1% and the cause
was the one that had been recorded.

### The change

The vocabulary is now part of the dataset (`types`, schema `/2`), and the prompt **requires**
it: `buildFaultExtractionPrompt(text, types)`, with an empty list a refusal rather than an
empty `one of:`. `parseGoldenDataset` refuses a dataset without the vocabulary, with a
repeated label, or expecting a type outside the one it published — a dataset that contradicts
its own answer space is one no run could satisfy.

### The second reading

Same model, same 19 samples, one change — the answer space is stated:

| field | unstated | stated | Δ |
| --- | --- | --- | --- |
| type | 4/19 (21.1%) | **17/19 (89.5%)** | **+13 samples** |
| category | 11/19 (57.9%) | 13/19 (68.4%) | +2 |
| component | 14/19 (73.7%) | 14/19 (73.7%) | 0 |
| **strict** | **2/19 (10.5%)** | **9/19 (47.4%)** | **+7** |

M1 is still **not met** — 47.4% against 70% — and the number is **not comparable** to the one
before it: `type` is now a 19-way classification, so a model can no longer lose a sample by
naming the fault in its own catalogue. Both readings are kept for that reason.

### What the miss list now says, which it could not say before

With `type` settled, thirteen field-misses remain, and their shape is different:

| field | misses | what they are |
| --- | --- | --- |
| **category** | **6** | `middleware → resource` (×2), `middleware → code`, `runtime → resource`, `runtime → dependency`, `code → runtime` |
| component | 5 | the *other side of a link* (`cart-service → inventory-service`), a synonym (`session-cache → session-store`), one omission |
| type | 2 | `container-crash → library-version-incompatibility`, `redis-latency → cpu-saturation` |

The category misses are **boundary** errors, not naming errors: the model knows what the fault
is and disagrees with the dataset about which bucket it belongs in. Finding 62 predicted that
`category` would become the binding constraint; the first measurement after the vocabulary
confirms it, and the six misses name which boundaries are in dispute.

### Acceptance

| gate | result |
| --- | --- |
| the instrument | unchanged: answer key 19/19 (finding 209) |
| the experiment | 2/19 → **9/19** strict; `type` 4/19 → **17/19** |
| the dataset | `types` required, schema `/2`; 3 refusal tests (absent, repeated/blank, out-of-vocabulary) |
| the prompt | vocabulary required by signature; 5 tests, one of them the empty-list refusal |
| the prediction | finding 62's "category becomes binding" confirmed, with the six misses named |
| `core` / repo | **170 / 4230** · **174 / 4417** |

## Finding 211 — stating what each category owns fixed five of six boundary disputes and created one

Finding 210 ended with six `category` misses and the observation that every one was a
**boundary** disagreement: the model knew the fault and put it in a neighbouring bucket. The
prompt listed the seven values and said nothing about what any of them covers, which is finding
62's asymmetry one level down — `type` had no *space*, `category` had a space but no
*boundaries*.

### The change

Two things, both in the prompt and both derived from the taxonomy rather than from the samples:

- **a definition per category**, stating what it owns rather than what it looks like;
- **a rule per disputed pair** — the five distinct pairs the measured misses produced — saying
  which fact decides between the two.

The vocabulary itself stopped being a hand-written string. It was
`'resource | network | ... | dependency'`, a second copy of `FAULT_CATEGORIES`, so adding a
category in `ir/types.ts` would have left the prompt advertising seven values while the parser
accepted eight, and the disagreement would have surfaced as a rejected model answer rather than
a failing build. It is now `FAULT_CATEGORIES` minus `unknown` — the fallback
`category-derivation.ts` returns when a type cannot be placed is a value the *inference* may
produce and the *prompt* must not offer. The definitions table is a
`Record<Exclude<FaultCategory, 'unknown'>, string>`, so a category without a definition does not
compile.

### The reading, one change later

| field | stated space (finding 210) | defined members | Δ |
| --- | --- | --- | --- |
| type | 17/19 (89.5%) | **19/19 (100.0%)** | +2 |
| category | 13/19 (68.4%) | **17/19 (89.5%)** | +4 |
| component | 14/19 (73.7%) | 15/19 (78.9%) | +1 |
| **strict** | **9/19 (47.4%)** | **13/19 (68.4%)** | **+4** |

### What it fixed, and what it did not

Five of the six disputes resolved, one did not, and one new one appeared:

| boundary | before | after |
| --- | --- | --- |
| cache at 100% command-thread saturation | `middleware → resource` | **middleware** |
| connection pool with every slot held | `middleware → resource` | **middleware** |
| pod evicted on account of another workload | `runtime → resource` | **runtime** |
| segfault inside a linked native library | `runtime → dependency` | **runtime** |
| null dereference behind a 500 | `code → runtime` | **code** |
| consumer lag after a per-record call | `middleware → code` | `middleware → code` |
| **new**: a regex with nested quantifiers in a WAF rule | `code` | **`code → config`** |

The new miss is the interesting one, and it is a real cost rather than noise: the definition of
`config` says "a deployed value — a URL, a flag, a key — holds the wrong thing and is read as
written", and a WAF rule *is* deployed configuration. The dataset calls it `code` because the
defect is a catastrophic backtracking pattern — logic that executes, not a value that is read.
The discriminator exists but the prompt does not state it, so `config` now absorbs a fault it
should not. Stating a member's meaning can enlarge it; that is the risk the previous round's
finding 62 argument did not have to consider, because an unstated answer space cannot be
enlarged by a definition.

`middleware → code` did not move even though the rule says the shared layer wins "even when a
code change is what loaded it". The model read `code`'s definition — "the workload's own source
produces the wrong answer or raises the exception" — and the lag was produced by a code change,
so both definitions still fit. The boundary is stated as a *cause* test; what separates these
two is the *symptom's location*.

### One component answer moved with no component change

`network-delay-cart-to-inventory` answered `inventory-service` in the previous run and
`cart-service` in this one, and the `component` rule is byte-identical between the two. The
only change was the category block. So the run is not a pure function of the field that was
edited: one sample of movement per run is available to a change that does not touch its field.

That matters for the arithmetic. M1 needs **14/19** and this is **13/19**, so the milestone is
one sample away and one sample is the size of the noise just measured. A single reading at
14/19 would not establish the exit condition; the next round states its prediction and repeats
the run.

### The ceiling, priced from the miss list rather than guessed

The six remaining misses sit on six distinct samples:

| sample | field | expected → actual |
| --- | --- | --- |
| `network-loss-payment-gateway` | component | `payment-gateway → order-service` |
| `middleware-redis-latency-cache` | component | `session-cache → session-store` |
| `middleware-kafka-consumer-lag` | category | `middleware → code` |
| `code-slow-regex-api-gateway` | category | `code → config` |
| `config-feature-flag-checkout` | component | `storefront → scheduled-job` |
| `dependency-upstream-5xx-pricing` | component | `tax-calculation → tax-provider` |

Two are `category` and four are `component`, so the two constraints are now comparable for the
first time and the cheaper one is `category`: both of its samples have the other two fields
right, so resolving them reaches **15/19 (78.9%)** and clears the exit condition without
touching the component rule. That is the next round, and it needs no re-annotation.

### Acceptance

| gate | result |
| --- | --- |
| the prompt | seven definitions + five boundary rules, rendered as one line each |
| the vocabulary | derived from `FAULT_CATEGORIES`, `unknown` excluded; the old literal is gone |
| exhaustiveness | `Record` over the answerable union: a category without a definition does not compile |
| the tests | 6 new in `fault-prompt-grammar.test.ts`, 33 in the file; the pair list is the recorded measurement |
| the guard against fitting | no sample id, expected component or eight words of incident text appears in the prompt |
| the batteries | component rule 8/8, M1 ceiling 11/11, M1 ceiling tests 8/8, type-miss probe 74/74, extraction workflow 28/28 — all caught, none survived |
| `core` / repo | **170 / 4236** · **174 / 4423** |
| coverage | 99.97 / 99.74 / 100 / 99.97 and 100 ×4 |
| the reading | 13/19 strict; M1 **not met**, one sample short |

## Finding 212 — a green tree split into two commits is a red commit

The round before this one changed the test count and shipped its documentation in the *next*
commit. Both trees were green locally — the working tree carried the code and the updated
counts together — and the pushed commit `ee1d6488` went red in CI:

> `verify` → `Published suite counts, read from that run rather than taken again`: failure

The count guard was right and the split was wrong. `doc-counts.json` and the prose rows it
checks are a *function of the tree at that commit*, so a commit that adds six tests and leaves
the published count at the old number is a commit whose documents are false about itself. It is
green on the machine where both edits exist in the working copy, which is exactly the state a
commit is meant to freeze out.

The cost was measurable and small — one red run, `39809914874`, at a step whose failure message
names the stale row — but the shape is the one this repository keeps rediscovering: **a
measurement taken from the working tree is not a measurement of the commit.** `--write-doc`
exists to write both halves from one reading for this reason; what it cannot do is stop a person
from committing the halves separately.

The rule that follows is a rule about commits, not about tooling: a commit that changes a
measured quantity ships the measurement. This round's commit did, and it is the reason its count
rows are in the same diff as the tests that moved them.

## Finding 213 — M1 is met, on a prediction that was committed before the run

Finding 211 ended eight points short of the exit condition with a priced ceiling: two `category`
samples, both with the other fields right, worth **15/19**. This round restated the two
boundaries that had survived, and the prediction was written into commit `0c3355d1` **before the
run existed**:

> Prediction, recorded before the run so it can be wrong: category 19/19, strict 15/19 (78.9%),
> M1 met.

Run `39881192308`, same model, same 19 samples:

| field | v2.40 (no space) | v2.41 (space) | v2.42 (definitions) | v2.43 (boundaries) |
| --- | --- | --- | --- | --- |
| type | 4/19 | 17/19 | 19/19 | **19/19** |
| category | 11/19 | 13/19 | 17/19 | **19/19** |
| component | 14/19 | 14/19 | 15/19 | 15/19 |
| **strict** | **2/19** | **9/19** | **13/19** | **15/19 (78.9%)** |

`M1 exit condition: MET (>= 70% strict)` — the first time that line has ever been printed.

### The two changes, and why each was a defect in the text rather than a missing rule

**`middleware` vs `code`** was written as a test of the *cause*: "even when a code change is what
loaded it". That sentence invites exactly the reasoning the model performed — the lag was caused
by a code change, therefore `code` — and then denies it in the second half. The fact that
separates the two is where the **symptom** lands: a queue falling behind is `middleware`, a 500
in the workload's own answers is `code`. Rewritten as that test, the sample moved.

**`code` vs `config`** did not exist, and it was the cost of finding 211's own definitions: once
`config` was defined as "a deployed value ... read as written", a WAF rule containing a
catastrophic regex looked like a member. The discriminator is **executed versus read** — a URL,
a flag, a key is read; a pattern, a rule, a matcher is executed — and stating it returns the
sample without weakening `config`, whose other two samples are both read values.

Both are still descriptions of the taxonomy. Neither names a sample, a component or an incident:
the assertion that forbids the prompt carrying any sample id, any expected component or eight
consecutive words of any incident text passes unchanged.

### What "met" is allowed to mean here

- **It is 15/19, not 19/19.** Four samples miss, all in `component`, and none of them is a
  `category` or `type` error.
- **The margin is one sample.** Finding 211 measured one sample of drift per run on a field whose
  rule had not changed (and this run moved `session-cache`'s component answer again, from
  `session-store` to `session-redis`). One sample down is 14/19 = 73.7%, still above the
  threshold; two down is 13/19 = 68.4%, below it. So the claim is "met, with one sample of margin
  against the drift this instrument has been measured to have", which is weaker than "comfortably
  met" and stronger than "met on one reading".
- **19 samples makes the quantum 5.3 points.** The threshold sits between thirteen and fourteen
  samples; it was crossed at fifteen.
- **`description` still has no denominator** (finding 209): the key carries three fields, so the
  strict rate covers `type`, `category` and `component` only.

### The four remaining misses, and the one that is now a scoring question

| sample | expected → actual | what it is |
| --- | --- | --- |
| `network-loss-payment-gateway` | `payment-gateway → order-service` | the other end of a link |
| `middleware-redis-latency-cache` | `session-cache → session-redis` | the text's own name for the same thing |
| `config-feature-flag-checkout` | `storefront → scheduled-job` | the actor, not the workload |
| `dependency-upstream-5xx-pricing` | `tax-calculation → tax-calculation-service` | the expected name plus a role suffix |

The fourth is a different kind from the other three. `tax-calculation-service` and
`tax-calculation` name the same entity, and `sameValue` normalises case and separators but not a
`-service` suffix. Widening the comparator is the repair finding 61 explicitly refused ("fixing a
comparator that never had the defect it was blamed for"), and it is refused here for the same
reason: `session-store` would then match `session`, and the field would stop distinguishing
anything. The three others are naming questions for the prompt, and the link pair is the one
where the key itself may be inconsistent (recorded as open in v2.42).

### Acceptance

| gate | result |
| --- | --- |
| the prediction | committed before the run; both halves (`category 19/19`, `strict 15/19`) correct |
| the reading | `type 19/19`, `category 19/19`, `component 15/19`, **`strict 15/19`**, M1 **MET** |
| the prompt | six boundary rules; the recorded pair list is the six the two runs produced |
| the tests | 33 in `fault-prompt-grammar.test.ts`, the anti-fitting assertions unchanged and passing |
| `core` / repo | **170 / 4236** · **174 / 4423** (no test moved this round, so no count moved) |
| coverage | 99.97 / 99.74 / 100 / 99.97 and 100 ×4 |

## Finding 214 — the workflow cited a file that has never existed, for the definition of its own number

`fault-extraction-accuracy.yml` opened with:

> `docs/product.md` states the M1 exit condition in terms of extraction accuracy...

There is no `docs/product.md` in this repository and there never was. The file list is
`acceptance`, `architecture`, `audit`, `cli-reference`, `data-model`, `progress`,
`target-formats`, `user-guide`. The condition it described was real, and the number the workflow
produces had been compared against it for four rounds — but the *location* of the definition was
invented, and nothing reads a comment.

This is the same shape as finding 205 (a citation that reads the same whether or not it
resolves), one level down: 205 was about `finding N` references inside the audit log, which a
gate now checks. **File references in comments are checked by nothing.** The citation was
introduced while writing the header, which is exactly when a person is most likely to write the
name of the document they meant to write rather than the one that exists.

The repair is not to create `docs/product.md` to satisfy a stale sentence: the exit condition is
one paragraph, and it belongs where the measurement lives. It is now stated inline in the
workflow header, with the reading that first met it, and the header says why the citation is
gone. A static gate for this would have to distinguish a path from a mention of a path, which is
finding 197's problem again; the honest position is that this one is held by review and recorded
here rather than claimed to be gated.

## Finding 215 — the measurement could not say why, and its first use found two defects in itself

Run `39901474902` — the first attempt to measure v2.44 — reported `unparseable 19/19` and took
about forty seconds. Forty seconds is far too short for nineteen model calls to have returned
usable answers, so the shape of the failure was already visible. The reason was not: it was
printed to stdout, and a job's stdout is unreadable from this project's environment (finding 55).
The artefact was the only channel, and it carried

```json
{ "sampleId": "resource-cpu-saturation-checkout", "parseOk": false }
```

nineteen times. From outside, `parseOk: false` is what a rate limit, an expired key, a truncated
response and a genuinely malformed answer all look like. **The run was paid for and could not say
what happened** — the same shape as finding 205, a citation that reads the same whether or not it
resolves, applied to a failure instead of a reference.

### The repair, in three places

| place | what it now records |
| --- | --- |
| `describeExtractionFailure(text, reason)` | the parser's message, and the response whitespace-collapsed and bounded at 200 characters |
| `derive-fault-golden.mjs` | that record on the artefact for an unparseable response; `transportError` for a request that threw |
| `formatExtractionReport` | up to three of them with the count of the rest, in the step summary |

The bound is not decoration: the input can be an HTML error page of a megabyte, and an artefact
that grows with a provider's error page is one nobody pastes into a report. The two error classes
are kept apart because their repairs differ — a thrown request is the network or the credential,
a malformed answer is the model.

### The second half was the same defect one layer down

`score-fault-extraction.mjs` **re-declares** the fields it reads from the artefact instead of
consuming the core type. It would have dropped the three new ones, so the artefact would have
known why and the report would have printed `(no reason recorded)` about a file that recorded one.
A test drives the *shipped* script over an artefact carrying a reason; removing the pass-through
turns it red, which was checked by hand before restoring it.

### The first use answered the question in one line

Run `39902858134`, same one-line change, no model calls:

> `unparseable  DeepSeek API error 402: {"error":{"message":"Insufficient Balance (request_id: …)"}}`

**The provider account is out of credit.** That is the entire cause of both failed runs, and it
was knowable in forty seconds and unknowable for two runs. Nothing about the prompt, the dataset
or the scorer was involved. The reading in finding 213 (`15/19`, M1 met) was taken 1h20m earlier
and stands; **v2.44's prediction is unmeasured**, and cannot be measured until the balance is
restored or the provider is switched.

### And reading that output found a defect in the report itself

The first real line printed

```
    resource-cpu-saturation-checkoutunparseable   DeepSeek API error 402: …
```

`padEnd(20)` does nothing for a string longer than 20, and every golden id is 26 to 40
characters. The test that pinned the section used `s1` and `s00`, which pad correctly — **a
fixture that only had the shape the defect does not affect**. Both columns now pad *and* are
separated by a space, and the new test uses a real golden id. This is the third time in this
sequence that reading an actual output found what a fixture could not (findings 65 and 96 are the
others).

### Acceptance

| gate | result |
| --- | --- |
| the diagnosis | one run, one line, the cause named: a provider 402 |
| the tests | 9 in `extraction-diagnostics.test.ts`, 2 in `fault-extraction-scripts.test.ts` |
| the pass-through | removing it turns the shipped-script test red (checked, then restored) |
| the report's own shape | a real-length id is asserted to keep the columns apart |
| `core` / repo | **171 / 4251** · **175 / 4438** |
| coverage | 99.97 / 99.74 / 100 / 99.97 and 100 ×4 |
| `gate-sites.json` | re-derived; two line shifts, all 73 proofs carried |

## Finding 216 — the corpus grew from 19 to 30, and fourteen pinned figures moved with it

M1 was met at 15/19 and the number was weak in a way the milestone could not see: at 19 samples the
strict rate moves in steps of **5.3 points**, the threshold sits between thirteen and fourteen
samples, and the margin over it was **one sample** — the same size as the drift the instrument was
measured to have (finding 211). A milestone met on an instrument whose resolution is coarse
relative to its own threshold is met in name.

This round grew the key: **eleven new samples**, one to three per category, each hand-written and
each held to the same three rules the file already states — the type is a lower-case slug absent
from its own text, the category is what `inferFaultCategory` derives from that type, and every
hyphen token of the component appears in the incident. The vocabulary grew from 19 types to 30.

### What a corpus is, in this repository

It is not a data file. **Fourteen assertions in five test files and one number in a workflow were
functions of its size**, and every one of them had to be re-read rather than incremented:

| where | figure | 19-sample | 30-sample |
| --- | --- | --- | --- |
| `category-derivation.test.ts` A/B | graded / conforming / defined | 19 | 30 |
| `category-derivation.test.ts` F | alternative readings that disagree | 2 (0.1053) | **4 (0.1333)** |
| `category-derivation.test.ts` R | distinct verdicts over 5040 row orders | 4 | **8** |
| `category-derivation.test.ts` O | downstream graded / inert | 19 | 30 |
| `denial-inventory.test.ts` | graded, and the partition sum | 19 | 30 |
| `miss-distractor.test.ts` | graded total | 19 | 30 |
| `agreement-baseline.test.ts` | supported / share / delta | 1, 0.0526 | 1 of 30, 0.0333 |
| `fault-extraction-accuracy.yml` | miss-detail row cap | 60 | **128** |

Two of those are results changing rather than denominators: the alternative readings now disagree
with the label on **4 of 30** (still at or below the floor of 0.2, so the verdict "this reading
cannot separate anyone" is unchanged), and the row-order dependence now has **eight** distinct
verdicts instead of four, because the new vocabulary contains a third slug whose verdict depends on
which row is tested first (`queue-disk-watermark`: `queue` is a middleware term and `disk` a
resource term).

### The cap that would have gone quiet

`fault-extraction-accuracy.yml` capped the published miss detail at 60 rows, with a comment that
said the cap "covers every run this dataset can produce" and that "the truncation path exists for
the day the dataset grows". That day was this one: a fully-missed run is now **90** rows. The
workflow would have truncated **routinely** and said so in a suffix that is easy to skim past.

It did not, because `workflow-provider.test.ts` computes a saturated run from the real dataset and
requires `cap >= rows`. The test failed with `the workflow caps detail at 60 rows but a
fully-missed run produces 90`. **A comment predicted the failure and a test caught it** — which is
the difference between the two that findings 196 and 205 keep drawing.

### One sample was renamed rather than a control loosened

`agreement-baseline.test.ts` asserts a property of the ground truth: an expected component is a
service or a mechanism noun, **never a slug that carries its own category term**, because a corpus
where components are category slugs would make "the component supports the category" true by
construction. The first draft called a cache service `product-cache`, whose name contains `cache` —
and the control failed exactly as designed, naming the second sample it now accepted.

The repair is the sample, not the control: it is `product-index` now, its incident rewritten so both
tokens appear, and the property is true of all thirty. **Loosening the assertion would have been the
cheaper edit and the wrong one** — it would have made the baseline's control vacuous for every
sample added afterwards.

### One test that was reading a global it did not own

A full-suite run failed in `step-process.test.ts` with `verify-local-89229-1.sh`: the assertion
diffed the whole of `tmpdir()` before and after its own steps, so a script written by **another
vitest worker** in the same window counted as this one's leak. The runner already names its files
`verify-local-<pid>-<n>.sh`, which is exactly what makes the two distinguishable; the test now
filters by its own pid. This is finding 205's shape once more — a check whose subject was wider than
its claim — and it is why the file says so in a comment rather than quietly.

### What this does to the milestone

**The 15/19 reading belongs to the 19-sample key.** On a 30-sample key the strict rate is a
different number, and it cannot be claimed until it is measured — and measurement is blocked by the
provider's `402` (finding 215). The honest state is therefore: *M1 was met on the previous
instrument; it has not been measured on this one.* The corpus makes the eventual reading sharper
(3.3-point steps instead of 5.3) and the claim narrower (one sample is now worth 3.3 points, so a
single sample of drift no longer covers the margin).

### Acceptance

| gate | result |
| --- | --- |
| the key | 30 samples, 30 types, one to three per category |
| the rules | every sample obeys slug, derivability and token recoverability; asserted over the file |
| the reference probe | `probe-m1-ceiling`: 30/30 recoverable, ceiling 100%, costs 0 samples of headroom |
| the corpus-measuring tests | 14 figures re-read, each with the old and new value stated |
| the row cap | 128, and the test that compares it to a saturated run is what moved it |
| the batteries | component rule 8/8, M1 ceiling 11/11, M1 ceiling tests 8/8, type-miss 74/74, scoring 12/12, workflow 28/28 — all caught |
| `core` / repo | **171 / 4251** · **175 / 4438** |
| coverage | 99.97 / 99.74 / 100 / 99.97 and 100 ×4 |

## Finding 217 — an open item's clause was two claims, and measuring the first dissolved the second

`docs/progress.md` has carried this sentence since pass 11, under the export enumeration:

> the enumeration asserts that a name is mentioned rather than called

Read quickly it says *the list over-claims tests*. Read carefully it is **two claims**: a
measurement ("a name is mentioned, not called") and an inference ("therefore the list's claim is
weaker than it sounds"). The measurement had never been taken. This round took it.

### The measurement

**61 of the 506 names in `TESTED` are named by no test file at all.** That is the sentence's first
half, and it is true.

The second half does not follow, and the obvious repair would have been wrong. A rule of the form
"every listed export must be imported by a test" produces 61 findings, and most of them are false
in a specific way — the export is exercised through a caller:

| name | exercised by |
| --- | --- |
| `readOpenRcaGroundTruth`, `readOpenRcaSubmission` | `score/official.ts` |
| `getUnitDef` | `convertUnit`, `sameDimension` in the same module |
| `buildGroundTruthCsv` and the three other CSV builders | `scripts/format-spec.mjs`, whose output a doc gate compares |
| `isVocabularyMember` | `scripts/check-official.mjs`, which has a test |

The rest are zod schemas (imported by the module that composes them) and constants (paths,
timeouts, vocabularies) whose *behaviour* is what a test would assert. So a name-level rule would
have produced a repair of 61 exemption rows — an exemption table that says "this one doesn't
count", 61 times, which is an instrument that has been talked out of its own finding.

### What actually answers the question

"Is this export exercised" is answered by the **coverage gate**: the suite runs, v8 reports per
function, and `packages/core/vitest.config.ts` requires **`functions: 100`**. Under that threshold
no exported function can be unexecuted, and the figure has held at 100 across every round. That is
a measurement of execution, which a name-level scan is not.

So the two claims divide the work, and the division is now stated where it can fail:

- the **list** says the export exists and is listed, and asserts it in both directions against the
  source;
- the **coverage gate** says it runs;
- and the enumeration test now **reads `functions: 100` out of the config and asserts it**, so
  lowering the threshold fails in the file whose claim depends on it rather than quietly making
  the list's appearance of coverage false. Checked by mutation: `functions: 95` turns it red,
  restoring turns it green.

The second test is the control for the first: it computes, live, how many listed names no test
names, and requires the answer to stay **non-zero**. If it ever reached zero the two criteria
would have collapsed into one and the paragraph above would become false — which is worth a failing
test rather than a sentence that outlives its evidence.

### What this round did not do

It did not add 61 tests, and it did not add 61 exemptions. It also did not close the item: the
residual claim — *no instrument states how each export is exercised* — is real and unchanged, and
the completeness of `index.ts` as a surface still rests on `pack-manifest-completeness` and the
`exports` field. What changed is that the item now says which of its two halves is a measurement,
which is an inference, and which instrument answers the question the sentence was reaching for.

### Acceptance

| gate | result |
| --- | --- |
| the measurement | 61 of 506 names named by no test; the 5 function cases traced to their callers |
| the coupling | `functions: 100` read from the config and asserted in the enumeration test |
| the mutation | `functions: 95` fails that test; restoring it passes (checked by hand) |
| the control | the live count of unnamed names must stay non-zero |
| the open item | corrected in place, not struck: the residual claim is unchanged |
| `core` / repo | **171 / 4253** · **175 / 4440** |
| coverage | 99.97 / 99.74 / 100 / 99.97 and 100 ×4 |

## Finding 218 — a test that edits the source it tests is a race with every other worker

CI run `39954894209` — the first push of v2.46 — reported **191 failing tests** across
`test/official.test.ts` (37) and `test/score.test.ts` (154), all with the same message:

```
→ (0 , assertExportableBundle) is not a function
```

The function exists. It is exported from `src/export/guard.ts`, every exporter imports it, and the
same commit passes the suite locally — three consecutive full runs, 4253 tests each. So the reading
is not "the export is missing"; it is "the module was read at a moment when it did not say that".

### The mechanism

`export-surface-enumerated.test.ts` asserted that its enumeration is computed at run time rather
than frozen at collection time, and the way it asserted that was **to append a probe line to
`src/export/guard.ts` and restore it in a `finally`**:

```ts
writeFileSync(target, original + probe);
expect(exportPairs().length).toBe(before + 1);
// ... finally: writeFileSync(target, original);
```

`writeFileSync` truncates and then writes. For the duration of that window the file on disk is a
partial module, and the suite runs **32 workers**, any of which may import `export/guard.js` at
that moment — `official.test.ts` and `score.test.ts` both do, through the exporters. A worker that
imports inside the window gets a module whose export binding is missing, and every subsequent call
fails with `is not a function`.

**The failure is proportional to the load, which is why it was invisible locally and red in CI**:
the window is microseconds and the probability of another worker importing in it rises with the
number of workers and the length of the run. Nothing in the message points at the mutation, so the
first reading of that run returned to the prompt and the dataset.

### The repair, and what it deliberately does not do

The property under test is "the enumeration is computed when it runs". That does not require the
disk at all: `exportPairs` now takes a reader, and the test varies **what a module says** between
two calls.

```ts
exportPairs(read?: (module: string) => string)
```

A module-level constant would return the first answer twice, so the original defect is still
caught; and nothing is written, so nothing races. The alternative — keeping the write and narrowing
the window — was refused: the window's width is not the property, the write is.

This is the third time in this sequence that a **test's own mechanism** was the defect (findings 84
and 96 were the others), and the first where the mechanism is a write to the tree.

### A second spawn failure, instrumented rather than explained

The same investigation produced a local full-suite run with three failures in
`check-doc-counts.test.ts`: the guard "exited" with no output and code 0, reported as
`expected '' to contain 'check-doc-counts: OK'`. That file's own helper already says *"a spawn that
never ran is not a verdict"* and retries `EAGAIN`/`ENOMEM`; it now also retries a **killed** child
(`status: null`) and — more important — asserts that **every exit prints**, because this guard has
exactly two and both print.

The cause is **not established**. What is established is that the next occurrence names itself:
status, signal, spawn error, and the emptiness, in one message. Recording it that way rather than
guessing is the same trade finding 83 made about an unreadable CI failure.

### Acceptance

| gate | result |
| --- | --- |
| the symptom | 191 failures, one message, function present and exported |
| the mechanism | a `writeFileSync` of a live source module, under 32 workers |
| the repair | reader injected; no write to the tree; the run-time property still asserted |
| the evidence | three consecutive full runs at 4253 passed, and the mutation of `functions: 95` still caught |
| the flake | instrumented, not explained: a killed child and an empty verdict each fail with details |
| `core` / repo | **171 / 4253** · **175 / 4440** |
| coverage | 99.97 / 99.74 / 100 / 99.97 and 100 ×4 |

## Finding 219 — the guard for "no test writes into the tree" found three, and one of them had been "fixed" before

Finding 218 removed one test's write into `src/`. That is a repair of an instance, and this
repository's standard is that a finding without a mechanism is a note. So this round built the
mechanism: a scan over every `.test.ts` in `packages/*/test` that flags a filesystem write whose
**destination** expression — or the destination's `const` binding, transitively — names a root that
makes a path repository-relative (`SRC`, `PACKAGE_ROOT`, `ROOT`, `ROOT_DIR`).

### Four measurements before it was usable, and what each one taught

| version | result | the false reading |
| --- | --- | --- |
| scan the whole rest of the line | 31 hits | named a root in a *later* argument: `writeFileSync(join(tree, …), readFileSync(resolve(ROOT, …)))` writes into a scratch tree and reads the repo |
| first argument only | 17 hits | still counts `copyFileSync(source, target)`, whose repository path is the **source** |
| destination index per call | 4 hits | `join(tree, 'README.md')` matched a `const README = resolve(ROOT, …)` two hundred lines away, because the *string* `'README.md'` tokenises as `README` |
| strings blanked before tokenising | 0 hits | — |

Every intermediate number was a plausible-looking list of offenders, and three of the four were
the guard accusing tests that isolate themselves correctly. **A lexical scan is a sequence of
decisions about what to ignore**, and each one was found by reading the list rather than by
trusting the count.

### What the last measurement found

Three real writes, and they are not the one finding 218 removed:

| site | what it wrote | why it is a write into the tree |
| --- | --- | --- |
| `gate-sites-are-proven.test.ts` | `scripts/.probe-figures-harness-gate-sites.mjs`, removed in a `finally` | every concurrent scan of `scripts/` reads it while it exists |
| `injection-write-discipline.test.ts` | `scripts/injection/__pycache__`, deleted after `py_compile` | the compile writes it; the cleanup is a second write |
| — | (the third is the one 218 removed, now gone) | |

**The first one had already been "fixed" once.** An earlier round recorded a race between this
test and `type-miss-probe.test.ts` over the same harness path, and the repair was to give each file
its own name -- `scratch-prefixes-are-disjoint.test.ts` is that repair's guard and its comment is
the record of it. That fixed the collision between two tests' *premises* and left the interference that
matters: the test's own comment says the deriver reports `scanned: 36` with the file and `35`
without — **a concurrent reader's reading changes while the file exists.** A name that no other
test uses does not make a file invisible to a scan.

The repair is the copy the repository already uses elsewhere: the harness now goes into a copy of
`scripts/` in a temp directory, and the deriver is spawned against it. The assertions are
unchanged, including the equality with the committed `scanned` count, because the copy is
byte-identical.

The second is the same shape one layer down: `py_compile` writes `__pycache__` beside the script
unless told otherwise, so the test compiled in the tree and then cleaned up. `PYTHONPYCACHEPREFIX`
sends the bytecode to a temp directory, so nothing is written and nothing needs removing. The
assertion compares existence **before and after** rather than demanding absence, because a battery
that compiles in the tree can leave one behind and this test must not be blamed for it.

### The guard, stated as narrowly as it is

It sees a root named in the destination or in its `const` bindings, up to four levels. It does
**not** see a path built from `import.meta.dirname`, from `process.cwd()`, or returned by a
function. Those limits are written in the file, next to the four controls that make the scan
falsifiable: the defect's own shape, an inline `join`, a legitimate `mkdtempSync` fixture that must
not be flagged, and a write through a name bound to nothing root-like.

One exemption exists — the guard's own file, whose controls contain the forbidden text as string
literals — and it is stated with that reason rather than left implicit.

### Acceptance

| gate | result |
| --- | --- |
| the scan | 5 tests: the tree, the defect's shape, an inline join, a scratch fixture, a non-root name |
| the tree | 0 offenders across 130 test files |
| the two repairs | harness in a temp copy; bytecode outside the tree |
| the suites | two consecutive full runs at **4258 passed**, working tree clean after each |
| `core` / repo | **172 / 4258** · **176 / 4445** |
| coverage | 99.97 / 99.74 / 100 / 99.97 and 100 ×4 |

## Finding 220 — the guard tested names, the defect survived one definition away, and the write it found was unnecessary three times over

v2.48 built a scan that forbids a test from writing inside the package. It passed with zero
offenders, and it was measuring the wrong thing: **it tested the *spelling* of the binding, not
its value.**

### The class it missed, in the tree it had just scanned

```ts
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const harness = resolve(REPO_ROOT, 'scripts/.probe-figures-harness-type-miss.mjs');
writeFileSync(harness, source.replace(/* ... */));
```

`type-miss-probe.test.ts` wrote a module into `scripts/` and deleted it in a `finally`, on every
call, in a directory two other test files scan. The rule's root list was
`SRC | PACKAGE_ROOT | ROOT | ROOT_DIR`; this file calls its root `REPO_ROOT`. One word.

Widening the rule to the **value** — an expression that resolves from `import.meta.url`,
`import.meta.dirname` or `process.cwd()` is root-ish, because a path built from this file's own
location can only lead inside the tree — makes the name irrelevant rather than longer. Measured
against the tree, the widened rule reported **seven** sites, all in that one file, and none of
them visible to the name list.

### Why the write existed

ESM could reach only the seven names the probe's export list carried, and the test needed an
eighth (`readOutcomeVocabulary`). So it synthesised a module beside the probe that re-exported
that one name from a copy of the source. Three mechanisms were then built to make the copy safe:

| mechanism | what it was for |
| --- | --- |
| a dotfile prefix | so `derive-gate-sites` would not count it as a published script |
| a deriver taught to ignore dotfiles | so the count stayed right, in the deriver rather than at the write |
| an `afterAll` sweeper | so a killed worker's leftover was removed on the next start |

and the file still said: *"This window is still a hazard for any **future** reader of
`scripts/`."* Three mechanisms, and an acknowledged residue, for a copy.

**The copy was unnecessary.** `readOutcomeVocabulary` is a pure function; adding it to the export
list is one line. The battery never noticed the gap because Python's `importlib` sees
module-level functions regardless of the ESM export list — so the two readers disagreed about
what the module publishes, and the test papered over the disagreement by writing a file.

One of the two call sites was worse than that: its `source.replace(a, a)` replaced a string with
itself, so it wrote a **byte-identical copy of the source** and imported it. That site's entire
purpose was to get a cache-busted specifier for a module that was already importable.

Both are gone, and with them the `afterAll`, the dotfile dependency, and the paragraph explaining
the hazard.

### The count in the previous finding was wrong, and the assertion was why

v2.48 recorded "0 offenders across 130 test files". The tree holds **176**, of which 175 are
scanned after the exemption. The number in the finding was not measured from the scan; the test's
own completeness assertion was `expect(files.length).toBeGreaterThan(50)`, which is satisfied by
any walker that reaches a third of the tree — including one that never descends into
`fault/` or `llm/`, where nine files live.

The assertion now compares to `golden-master/doc-counts.json`'s `repo.files` minus the exemption:
a figure the README publishes and CI re-derives from its own run, so the scan cannot certify its
own completeness. That is the same trade finding 217 made — an external oracle instead of a
threshold — with a mistake in a document as the evidence that the threshold was load-bearing.

### A control that had to move, and a scan that read its own specimens

`scratch-prefixes-are-disjoint.test.ts` asserted that the suite's in-tree scratch files exist, as
a non-vacuity control. With both harnesses gone, the population is **empty**, and the control
failed. Deleting the rule was the cheap repair and the wrong one; the control moved from the tree
to the **scan**, which is the stronger place for it — the defect that file once had was a
*spelling* (`resolve(REPO_ROOT, 'scripts/x.mjs')` known, `resolve(ROOT, 'scripts', 'x.mjs')` read
as "no defect"), and a control pinned to a path in the tree disappears exactly when the paths do.

Two more corrections came out of that move, both found by running it:

- the scan counted `node_modules/.pnpm` — a directory `coverage-writes-are-drained.test.ts`
  **reads** to find the coverage provider's source. A read of the installed store is the opposite
  of a scratch file; nothing under `node_modules` is a fixture, and the rule now says so;
- the scan counted **its own control strings**. A scan whose specimens are string literals in
  itself reads as the disease: the file's own header warns about exactly this (a scanner that
  matched its documentation), one level in. It skips itself now, with the reason stated, and the
  controls over those literals are what make the skip safe.

### Acceptance

| gate | result |
| --- | --- |
| the widened rule | flags a location-derived destination whatever the binding is called; two new controls (`HERE`, `process.cwd()`) |
| the mutation | re-adding a write through `REPO_ROOT` fails the guard and names `type-miss-probe.test.ts:750` |
| completeness | the scanned count is compared to `doc-counts.json`, not to a floor |
| the removal | 2 write sites, 1 `afterAll`, 1 no-op `replace`, 1 dotfile dependency, 1 hazard paragraph |
| the population | the in-tree scratch map is empty; the exclusivity rule fires when it is not |
| the probe | 74 injections caught, 0 survived, source restored identical |
| `core` / repo | **172 / 4260** · **176 / 4447** |
| coverage | 99.97 / 99.74 / 100 / 99.97 and 100 ×4 |

## Finding 221 — the scan's roots were a list of two names, and its completeness was a count of one file type

Finding 220 rooted the no-in-tree-write rule in the *value* of a path instead of the spelling of
its binding. Two things about that scan were still lists:

```ts
const TEST_ROOTS = ['packages/core/test', 'packages/cli/test'];   // two names
... else if (entry.endsWith('.test.ts')) out.push(full);          // one file type
```

### The roots

`pnpm-workspace.yaml` says `packages: ['packages/*']`, so the set of packages is a **rule**, and it
was written out as two names. A third package would have been invisible: its tests would run in the
same parallel suite, its counts would be published by the same measurement, and its writes would
race every other worker while the scan reported zero offenders about a tree it had not read.

The roots are now derived from the workspace file, and the derivation **throws** on a glob it does
not understand rather than skipping it — a skipped glob is an unscanned package, which is the
failure the derivation exists to prevent.

### The file type

The test roots hold **179** TypeScript files: 176 `*.test.ts` and three helpers — `helpers.ts`,
`fixtures.ts`, `uncommitted-carry.ts`. The last of those exists to copy a working tree, and a write
in it would be a write by every test that imports it, while a `*.test.ts` filter reads it as
nothing at all. The scan now reads every `.ts` under those roots.

Measured: the widened scan finds **no offenders today**. `uncommitted-carry.ts` shells out to
`git apply` rather than calling `writeFileSync`, so the widening costs nothing — which is the
measurement, not the reason to skip it. Mutation: a `writeFileSync(resolve(process.cwd(), …))`
added to that helper is caught and named (`uncommitted-carry.ts:57`).

### Completeness had to change shape, and the second oracle is the repository's

While the scan read only test files, its completeness assertion compared a *count* to
`doc-counts.json`. That count describes `*.test.ts` and nothing else, so a scan that also reads
helpers cannot be equal to it — and loosening the comparison to `>=` would have been the wrong
direction: a walker that missed files would still satisfy it.

So the assertion is now a **list** compared to `git ls-files` under the derived roots: the
repository's own statement about what exists there, which a walker cannot certify about itself.
The published count is kept, restricted to the subset it actually describes.

| oracle | what it covers | what it would catch |
| --- | --- | --- |
| `git ls-files` under the roots | every `.ts`, helpers included | a walker that stops descending; a root the derivation missed |
| `doc-counts.json` `repo.files` | `*.test.ts` only | a file added without the published count moving |

### The assumption, asserted rather than assumed

Deriving roots at `<pkg>/test` is itself an assumption: a package could put its tests in `src/`.
That case is now an **error at load**, naming the files:

```
Error: these test files are outside a scanned root: packages/core/src/__probe.test.ts
```

checked by mutation, with the probe file created and removed. A scan that reports zero offenders
about a suite it never read is the defect this whole file exists to refuse, and a silent skip is
how it would happen.

### Acceptance

| gate | result |
| --- | --- |
| the roots | derived from `pnpm-workspace.yaml`; an unsupported glob throws |
| the derivation | asserted equal to the directories under `packages/` that have a `test/` |
| the file set | 179 tracked, 178 scanned (this file exempt); compared to `git ls-files` as a list |
| the helpers | `helpers.ts` and `uncommitted-carry.ts` are in the scan; a write added to the second is caught at `:57` |
| the assumption | a `*.test.ts` outside `<pkg>/test/` fails the file at load, naming it |
| the widening's cost | zero offenders today, measured rather than assumed |
| `core` / repo | **172 / 4263** · **176 / 4450** |
| coverage | 99.97 / 99.74 / 100 / 99.97 and 100 ×4 |

## Finding 222 — the run that answered the blocked question ran fourteen minutes after the commit that called it blocked

v2.44's prediction was recorded before its run, the run failed on a provider `402`, and v2.45's
commit — `4694c3d`, 11:47Z — closed with:

> **The provider account has no balance, and the milestone's re-measurement is blocked on it.**
> […] nothing can be re-measured […] The remedies are a top-up or a switch to another registered
> provider.

**At 12:01Z that same day, run `39950191377` completed successfully.** Fourteen minutes later. It
scored thirty samples and printed:

```
  type        : graded 30/30 (100.0%)
  category    : graded 29/30 (96.7%)
  component   : graded 25/30 (83.3%)
  strict all-fields: 24/30 (80.0%)
  M1 exit condition: MET (>= 70% strict)
```

Nobody read it for twenty hours — not through v2.46, v2.47, v2.48, v2.49 or v2.50, four of which
were written while the answer sat in an artefact. The note was not wrong when it was written; it
was **wrong within the hour and there was nothing to notice it with**, because a blocker is a
sentence in a document and a dispatch outcome is a fact in an API.

The artifact is still downloadable, so the reading is recoverable — that is luck, not design, and
the rest of this finding is the design.

### What the reading says

| reading | key | type | category | component | strict |
| --- | --- | --- | --- | --- | --- |
| v2.41 (run `39810137978`) | 19 | 17 | 13 | 14 | 9 (47.4%) |
| v2.42 (run `39880043431`) | 19 | 19 | 17 | 15 | 13 (68.4%) |
| v2.43 (run `39881192308`) | 19 | 19 | 19 | 15 | **15 (78.9%)** |
| **v2.44 rules (run `39950191377`)** | **30** | **30** | **29** | **25** | **24 (80.0%)** |

Recomputed locally against the current key before it was believed: identical to the report, down to
the six misses. The thirty-sample baseline is **24/30**, three samples clear of the twenty-one the
threshold requires.

### The prediction, falsified in substance

v2.44 added two component rules and predicted `component 17/19`. Its own two targets:

| sample | rule v2.44 added | on 30 samples |
| --- | --- | --- |
| `middleware-redis-latency-cache` | name the workload, not the product it runs | **still `session-store`** — the rule did not land |
| `config-feature-flag-checkout` | name the workload that broke, not the actor | **correct now** — the actor rule did land |

One of two. And two *new* component misses arrived with the new samples, both of the same family the
rules were meant to exclude:

| sample | answered | what it named |
| --- | --- | --- |
| `middleware-queue-watermark-ledger-writer` | `message-broker` | the broker, not the writer |
| `dependency-schema-change-currency-feed` | `settlement-service` | the consumer, not the feed |

So "name the workload that owns the fault" is still being read as "name the thing the incident is
about", one layer out. The two rules name two exclusions; the category of error has more members
than the two the rules took.

### A category answer moved back, with the category text untouched

`middleware-kafka-consumer-lag` answered **`code`** again. On the nineteen-sample key v2.43's run
recorded `category 19/19`, which means that sample answered `middleware` then. v2.44 edited only the
*component* block of the same prompt; the category rules were byte-identical.

This is the second instance of the movement v2.42 recorded — a component answer moved when only the
category block changed — and it is the stronger one, because the direction is *backwards*: a rule
that appeared to work stopped appearing to work with no edit to its own text. A single reading at
19/19 was one sample away from being wrong, and the next reading showed it.

### The evidence is now a file, not an artefact

`golden-master/fault-extraction/readings.json` carries all four readings: every sample as answered
beside the expected value it was scored against, the key digest for each, the run id, and the prompt
change between them. `m1-reading-is-reproducible.test.ts` recomputes every total from that table.

| property | how it is held |
| --- | --- |
| the totals are arithmetic | recomputed from the rows; an edited answer and an unedited total fail |
| the scoring side is fixed | a sha256 over the sorted four-field lines, `id` then type, category, component |
| the record cannot drift from the key | every id still in the key must carry its current expected values |
| the one rename is named | `middleware-cache-shard-product-cache` → `…-index`, with the reason and the finding |
| the gap is named, not filled | run `39806875985` (2/19) is listed as *absent* with the reason its artefact was not kept |
| the old instrument is not "now" | exactly one reading is on the current key size, and it is the newest |
| the arithmetic is sensitive | flipping one answered field moves the strict count by exactly one |

### Acceptance

| gate | result |
| --- | --- |
| the reading | 24/30, M1 MET, three samples of margin, recomputed locally before it was recorded |
| the record | 4 readings, 30-key digest pinned, one superseded id with a reason, one absent run with a reason |
| the tests | 8 in `m1-reading-is-reproducible.test.ts` |
| the guard change | the write scan's git oracle reads `--cached --others --exclude-standard`, because a new test file exists before it is added |
| `core` / repo | **173 / 4271** · **177 / 4458** |
| coverage | 99.97 / 99.74 / 100 / 99.97 and 100 ×4 |

## Finding 223 — three changes, one reading: 22/30 against 24, reverted

The thirty-sample baseline was 24/30 with four component misses, three of them one question asked
three ways — the product a workload runs on, the entity it depends on, the entity that depends on it.
So the component rule was replaced with a criterion (*whose own behaviour failed*), a clause was
added forbidding role suffixes, and the examples were changed because one of them, `session-store`,
was the exact string the model had answered for a different workload in three readings.

**Prediction, committed before the run: component 28/30, strict 27/30.**

**Run `40049467914`: component 22/30, strict 22/30 (73.3%).** M1 is still met — 22 is above the 21
the threshold requires — and that is exactly why this finding exists.

### What moved

| field | v2.44 rule | this rule | Δ |
| --- | --- | --- | --- |
| type | 30 | 29 | −1 |
| category | 29 | 29 | 0 |
| component | 25 | **22** | **−3** |
| strict | 24 | **22** | **−2** |

Nine field misses across eight samples, and the shape of four of them is the suffix clause read
literally:

| sample | expected | answered | what happened |
| --- | --- | --- | --- |
| `middleware-kafka-consumer-lag` | `order-events-consumer` | `order-events` | **truncated** |
| `middleware-mysql-replica-lag-analytics` | `analytics-replica` | `replica` | **truncated** |
| `dependency-schema-change-currency-feed` | `currency-feed` | `settlement` | truncated, and still the wrong entity |
| `network-delay-cart-to-inventory` | `cart-service` | *(omitted)* | the answer stopped existing |
| `config-ingress-timeout-partner-portal` | `partner-portal` | `ingress` | new, wrong layer |
| `dependency-upstream-5xx-pricing` | `tax-calculation` | `pricing-service` | new, and a suffix |
| `middleware-kafka-consumer-lag` | type `kafka-consumer-lag` | `upstream-schema-change` | new |
| `middleware-kafka-consumer-lag` | category `middleware` | `dependency` | third instance of cross-field movement |

`order-events-consumer` → `order-events` is the whole finding in one line. The clause said *add no
role suffix unless the incident's own name carries one*; the model read *remove role suffixes*, and
`-consumer`, `-replica` and `-settlement` went the same way as `-service`. The one sample the
criterion was meant to fix by *relationship* — `settlement-service` for `currency-feed` — was
answered `settlement`, which is the wrong entity with the right words taken off it.

One target did move: `middleware-queue-watermark-ledger-writer` answers `ledger-writer` now, so the
"entity it depends on" clause worked for the sample that motivated it.

### Why this is a revert and not a refinement

Three things changed at once — the criterion, the suffix clause, the examples — and **one reading
cannot attribute the four lost samples between them**. The suffix clause is the obvious suspect,
because truncation is exactly its shape, and *obvious* is what this repository has been wrong about
before (findings 61, 84, 96, 190). A refinement on top of an unattributable run would keep the parts
whose contribution nobody measured.

So `FAULT_COMPONENT_RULE` is **byte-identical** to the text that produced 24/30, restored from the
commit rather than retyped, and a test asserts the criterion and the clause are absent from the
prompt.

**And 22/30 is above the threshold.** Keeping the change would have cost two samples, three
component answers and a type miss, while every gate stayed green and the milestone stayed met. A
regression that remains above the bar is the case where a number most easily hides a loss, which is
why the revert is on the record and not on the score.

### What the record does with a failed experiment

`readings.json` carries run `40049467914` with `status: "reverted"` and a reason, beside the
`current` reading it lost to. The tests hold three things:

- every total is still recomputed from the rows, so the failed reading is as auditable as the good one;
- the three truncations are asserted **sample by sample**, because they are the evidence the next
  attempt has to answer for;
- exactly one reading has `status: "current"`, and a reverted reading is required to have a reason
  and to score below it. Without that, 22/30 would sit in the file looking like a result — 222's
  failure mode one layer down.

### What remains untested

The criterion itself. On this run one of its three targets moved and the others were buried under
the suffix clause. Whether *whose own behaviour failed* helps is still an open question, and the
next attempt must change **that and nothing else** — no clause, no example churn — or the reading
will again be unattributable. The same applies to the example hypothesis: removing `session-store`
did not fix `middleware-redis-latency-cache`, which now answers `session-redis`, so the support for
"an example primes an answer" is a correlation that survived, not a cause that was shown.

### Acceptance

| gate | result |
| --- | --- |
| the reading | 22/30, recorded with `status: reverted` and a reason |
| the revert | byte-identical rule text; the criterion and the suffix clause asserted absent |
| the evidence | three truncations asserted by sample, plus the omission |
| the tests | 4 in the reverted block, 8 in `m1-reading-is-reproducible.test.ts` |
| the batteries | component rule 8/8, M1 ceiling 11/11 and 8/8 — all caught after the revert |
| `core` / repo | **173 / 4275** · **177 / 4462** |
| coverage | 99.97 / 99.74 / 100 / 99.97 and 100 ×4 |

## Finding 224 — the criterion alone scored 20/30 and took the milestone below the bar

Finding 223 reverted a bundle of three changes and named the suffix clause as the likely cost,
with the disclaimer that "obvious" is what this repository has been wrong about before. This round
tested that: the criterion alone, with the clause **asserted absent** and the example list
**asserted unchanged**.

**Run `40054484628`: component 21/30, strict 20/30 (66.7%), `M1 exit condition: NOT MET`.**

Both halves of the diagnosis were wrong.

| what the previous round believed | what the run showed |
| --- | --- |
| the suffix clause caused the truncations | `order-events-consumer` still answered `order-events`, with no clause in the prompt |
| the criterion would settle the two relationship samples | `ledger-writer` answered `kafka-broker`, `currency-feed` answered `settlement-service` — the pre-criterion answers |
| one sample was "fixed" at 22/30 | that single sample was noise; it moved again |

Three readings of the same field now sit in one record: **24/30, 22/30, 20/30**. The text that
produced the first is back in the tree, and the other two are kept as measurements.

### What the truncation actually is

`order-events-consumer` → `order-events` appeared at 22/30 with the clause, and at 20/30 without it.
So it is not an instruction the prompt gives; it is what this model does with a long slug for a
component the incident names indirectly. That distinction matters for the next attempt: a rule about
spelling cannot fix it, and the previous round spent a clause on it.

### Cost, stated plainly

Two dispatches bought three facts and no improvement: the criterion is not the lever, the truncation
is not clause-caused, and a single sample moving is not evidence of a fix. The second dispatch also
**took the milestone below its exit condition** — the first time a prompt change in this sequence has
done that — which is why the revert is not a judgement call.

The alternative was to keep the criterion and tune it: it is a defensible-sounding rule, it fixed one
sample once, and at 22/30 it still cleared the threshold. That is exactly the case the record now
exists to refuse.

### What the record holds

| requirement | how |
| --- | --- |
| both failures are auditable | every total is recomputed from the rows, failed readings included |
| the milestone arithmetic is re-derived | the 20/30 reading is asserted to be **below** the imported threshold |
| the falsified diagnosis is pinned | the same sample is asserted to truncate with and without the clause |
| the "fix" that was noise is named | the broker and feed answers are asserted at 20/30 |
| only one reading is the tree's | exactly one `current`; two `reverted`, each with a reason and each scoring below it |

### Where the next attempt has to go

Three prose revisions have moved this field by −2, +0 and −4 strict samples against the same
baseline. The remaining misses are *choices of entity* that a rule about entities has not changed —
`order-service` for `payment-gateway`, `session-store` for `session-cache`, `settlement-service` for
`currency-feed`. That is the shape of a mechanism problem rather than a wording problem: the prompt
asks the model to name a workload and the model names the thing the text is about.

The next lever should therefore constrain the **answer**, not describe it — for instance requiring
the component to be composed from tokens the incident's own text uses, checked after parsing rather
than requested in prose. That is a different kind of change with its own reading, and it is not made
here: this round's job was to close a line of work with evidence rather than leave it half-tried.

### Acceptance

| gate | result |
| --- | --- |
| the reading | 20/30, `M1 NOT MET`, recorded with `status: reverted` and a reason |
| the revert | byte-identical text from the commit that produced 24/30; the criterion asserted absent |
| the record | six readings, two reverted, one current |
| the tests | 4 in the second reverted block (prompt 45), 8 in `m1-reading-is-reproducible.test.ts` |
| the batteries | component rule 8/8, M1 ceiling 11/11 and 8/8 — all caught |
| `core` / repo | **174 / 4279** · **178 / 4466** |
| coverage | 99.97 / 99.74 / 100 / 99.97 and 100 ×4 |

## Finding 225 — the mechanism the previous finding proposed was refuted before it was built

Finding 224 closed the prose line of work and proposed the next lever: *constrain the answer rather
than describe it*, the shape that took `type` from 4/19 to 17/19 when a stated answer space replaced
a stated convention. This round measured that proposal against what already exists — the
thirty-sample key and the five recorded readings — **before writing any of it and before spending a
dispatch.** It does not survive, on two independent grounds.

### Ground one: a candidate list caps the ceiling at 25/30

The strongest form of "constrain the answer" is to hand the model the components the text supports.
The natural extraction is *runs of adjacent words joined by a hyphen*, which is how every expected
component is spelled. **25 of 30** are recoverable that way. The five that are not are not obscure:

| sample | expected | how the text says it |
| --- | --- | --- |
| `network-delay-cart-to-inventory` | `cart-service` | "Cart-to-inventory calls" — the workload is the caller, never a two-word run |
| `middleware-redis-latency-cache` | `session-cache` | "the session Redis" — the kind of store sits between the two words |
| `middleware-kafka-consumer-lag` | `order-events-consumer` | "Consumer group order-events" — reversed |
| `middleware-mysql-replica-lag-analytics` | `analytics-replica` | reads are "against the replica of analytics" |
| `code-timezone-booking-api` | `booking-api` | the text says "Booking reminders"; the API is never named |

Three of those five are the samples that have resisted three rounds of prompt work. A candidate list
that omits them makes them **unanswerable**, so the mechanism's ceiling is 25/30 strict — one sample
above the baseline it would replace, with the hardest samples unwinnable. That is a smaller benchmark
wearing a mechanism's clothes.

### Ground two: token membership does not separate right from wrong

The weaker form is a post-parse rule: reject an answer whose tokens are not all in the text. Measured
over every reading on the current key:

| reading | correct answers outside the text | wrong answers **inside** the text | wrong answers outside |
| --- | --- | --- | --- |
| 24/30 (`39950191377`) | 0 | 2 of 6 | 3 |
| 22/30 (`40049467914`) | 0 | 7 of 8 | 1 |
| 20/30 (`40054484628`) | 0 | 4 of 9 | 5 |

The rule is free — it never loses a right answer — and nearly useless: most wrong answers are
*inside* by construction, because the model builds a plausible slug out of the text's own words and
points it at the wrong entity. `order-service` for `payment-gateway` is the type specimen: both words
are in the incident, the slug is well formed, and it names the other end of the link.

### What this establishes, and what it costs

The failure is a choice of **referent**, not of **form**. Every form-based lever now measured —
suffix clause, candidate list, token membership — scores badly on this corpus, and the reason is the
same in all three: the answer is spelled correctly and means the wrong thing.

The cost of this round was **zero dispatches**. Two earlier rounds spent one each and learned the
same lesson more expensively (findings 223 and 224); this one spent a measurement instead, and its
tests pin the numbers so the next proposal starts from them rather than from the idea.

### Acceptance

| gate | result |
| --- | --- |
| the candidate ceiling | 25/30, with the five named in the test rather than in prose |
| the list's size | median 218 candidates per text, max 277 — pinned as a range |
| the membership rule | free (0 correct answers outside) and weak (2 of 6, 7 of 8, 4 of 9 inside) |
| the cause | `order-service` for `payment-gateway`, asserted at the current reading |
| dispatches | none |
| `core` / repo | **175 / 4283** · **178 / 4470** |
| coverage | 99.97 / 99.74 / 100 / 99.97 and 100 ×4 |

## Finding 226 — "one change, one reading" was a habit, so it became a digest

Findings 223 and 224 each ended with the same sentence: *one change, one reading*. Each time it was
written by someone who had just paid a dispatch to learn it, and each time it was a habit — nothing
in the repository could have stopped the next round from editing the prompt and reading the number
afterwards, or from not reading it at all.

This round turns it into a property. The prompt is a **value**: rendering it with a fixed placeholder
incident and a fixed vocabulary produces a string, and that string has a digest.

```
sha256(render(prompt, 'placeholder incident text', ['cpu-saturation']))
  = 05334666cde677b22d7246dccede5be2a5a5ac21f3587451cdbc0e77e4c0a8b6
```

The reading that produced the current number carries that digest, and
`prompt-changes-are-measured.test.ts` requires the tree to render to it. Changing one character of one
fragment fails the suite, and the failure is an instruction rather than a complaint:

> the prompt in the tree is not the prompt that was measured. Either dispatch
> fault-extraction-accuracy.yml, read the numbers and add the reading with status "current" and this
> digest, or add a `pending` entry with this digest and a reason.

Checked by mutation: one extra space in `FAULT_COMPONENT_RULE` turns it red with
`47fbd0c8… != 05334666…`; restoring it turns it green and leaves `git diff` empty.

### The second route is what makes it a gate rather than a wall

A change can land before its run finishes. `pending` is that state, and it has two rules: it must say
why it is unmeasured, and **its digest must not be the tree's** — a pending entry describing the text
that is in the tree means either the run has happened (move it to a reading) or the entry is stale
(delete it). So the two ways out are "measure it" and "say you have not", and silence is not one of
them.

### Why the rendered string and not the source

Because the source is not what the model sees. `FAULT_COMPONENT_RULE` is one fragment among several
that `buildFaultExtractionPrompt` assembles, and a change to the assembly is as much a prompt change
as a change to a sentence. Hashing the rendered string with fixed arguments covers every fragment and
the order they arrive in, with no list to maintain when a fragment is added.

The control is in the same file: two vocabularies render two prompts with two digests, and so do two
incident texts — a digest function that returned a constant would satisfy every other assertion here
while saying nothing.

### What the record had to say about the past

The two reverted readings carry **no** digest, and the test says so explicitly rather than leaving it
to be discovered: their texts were reverted before this gate existed and cannot be reconstructed. That
is the honest state, and it is also why the gate had to be built now — the third experiment would have
been reconstructible only if this had existed before it.

### Acceptance

| gate | result |
| --- | --- |
| the digest | of the rendered prompt with fixed arguments; 05334666… for the text in the tree |
| the assertion | the tree must equal the digest of the `current` reading |
| the failure | names both digests and both routes |
| the mutation | one extra space fails with 47fbd0c8…; restoring passes and leaves the tree clean |
| the escape hatch | `pending` requires a reason and must not describe the tree's own text |
| the control | the digest moves with the vocabulary and with the incident text |
| `core` / repo | **176 / 4287** · **179 / 4474** |
| coverage | 99.97 / 99.74 / 100 / 99.97 and 100 ×4 |

## Finding 227 — a regression that clears the bar is now arithmetic

Findings 223 and 224 both ended with the same unanswered question in their open items: *22/30 passed
every gate and met the milestone, so what would have caught it?* Nothing did. The gates check that the
tree is consistent with itself; a worse prompt is perfectly consistent with itself.

The record makes the question answerable. Every text measured on the thirty-sample key is in
`readings.json`, so **"is the current prompt the best one measured" is arithmetic** — and the test
that used to check only "exactly one reading is current" now also checks the number:

```
a text on this key scored better: the current reading is 22/30 and the best other text
scored 24. Revert, or add an `acceptedRegression` entry naming this run, the delta and
the reason.
```

Checked by mutation: marking the 22/30 reading `current` and the 24/30 one `reverted` fails exactly as
above, and restoring the file passes with an empty diff.

### The escape hatch is a written argument, not a status

A rule that cannot be overridden is a rule that gets deleted the first time it is inconvenient. So
`acceptedRegression` exists — one entry, naming the run, the delta and a reason of at least eighty
characters — and a second test asserts that **it has never been used**:

> has never accepted a regression, which is a state and not an omission

Adding the field fails that test, which is the point: the diff then shows a decision being made rather
than a rule being worked around. Deleting the test is the deliberate act of deciding that a regression
may be kept, and it leaves a visible trace, which a comment cannot.

Checked by mutation too: with a fabricated `acceptedRegression` the anti-regression rule passes and the
"never accepted" assertion fails — the two tests divide the work, one for the arithmetic and one for the
policy.

### What it does not cover

- **Only texts that were measured.** A prompt that was never dispatched is caught by the digest gate
  (finding 226) rather than by this one; a prompt dispatched and never recorded is caught by nothing,
  which is why the digest gate and this rule are both needed and neither is sufficient.
- **Only the same key.** Readings on the nineteen-sample key are not comparable, and the test scopes
  itself to the current key's size rather than pretending otherwise.
- **Only the strict rate.** A prompt could trade, say, `type` for `component` at constant strict. The
  per-field rates are in the record, and no rule reads them this way yet.

### Acceptance

| gate | result |
| --- | --- |
| the rule | the current reading's strict must be ≥ the best other reading on the same key |
| the mutation | 22/30 marked current fails with both numbers named; restoring passes, diff empty |
| the hatch | `acceptedRegression` requires the current run, the exact delta and a reason ≥ 80 characters |
| the state | "never accepted" is asserted, so using the hatch is a visible edit |
| `core` / repo | **176 / 4289** · **179 / 4476** |
| coverage | 99.97 / 99.74 / 100 / 99.97 and 100 ×4 |

## Finding 228 — the record could still lie by omission, and now a tool says so

Findings 226 and 227 closed two of the three ways a prompt change can go unmeasured: a prompt edited
without a reading (the digest gate) and a reading worse than a previous one (the anti-regression
rule). The third was left open in both:

> a run that happened and was not written into the record is caught by neither.

That is not a hypothetical. Run `39950191377` produced **24/30** and sat unread for twenty hours while
four rounds were written on top of a document that said the measurement was blocked (finding 222). The
gates were all green throughout, because a record cannot disagree with a run it does not know about.

### The tool

`scripts/reconcile-readings.mjs` takes the workflow's run list — fetched with a token, or saved from
the API — and names every successful run whose id is not in the record. A run is *accounted for* if its
id appears as a reading **or** as an `absent` entry, which is the route used for the one run whose
artefact was lost.

```
$ GITHUB_TOKEN=… node scripts/reconcile-readings.mjs
reconcile-readings: OK (7 successful run(s) since id 39806875985, every one of them accounted for
in 7 recorded id(s))
```

Run today, against the real history. That is the first time the record has been checked against the
thing it claims to describe rather than against itself.

### Three decisions the tool had to make, each with a reason

| decision | why |
| --- | --- |
| **scope begins at the smallest recorded id** | run ids increase with creation time, so "the record starts here" is a fact about ids rather than a date to maintain. Without it the tool reports every success since September and becomes noise — and a noisy guard is a guard that gets switched off |
| **only successful runs are asked for** | a `402` has no numbers to record; a tool that demanded an entry for every failure would cry wolf exactly when the record is least interesting |
| **a payload with no `workflow_runs` is an error, not "no runs"** | an empty result and an unreadable input are different findings, which is finding 83's distinction applied to a tool |

The last one is the shape of every defect in this series: a reader that treats "I could not read it" as
"there is nothing there" reports success and means nothing.

### The two exits are gate sites, and they are proved

The script has two failure exits — `2` for an unreadable input or a missing token, `3` for an
unaccounted run — so the inventory requires a site for each. Both are annotated `proved` against
`readings-reconcile.test.ts`, and the meta-gate confirms it by hollowing the script and watching the
suite go red:

```
CAUGHT      reconcile-readings.mjs      10 test(s) red in 1 of 1 naming file(s)
```

Adding the script also required a `DRIVES` declaration in that test file, because
`gate-sites-are-proven` cross-checks the sites a script owns against the tests that spawn it — the two
accounts disagreeing is the state that check exists to prevent. It caught this round's omission before
CI did.

### What it still cannot do

It cannot run in CI without a token, so it is a tool and not a gate: nothing forces anybody to run it.
That is stated rather than papered over, and the alternative — checking run history inside the suite —
would make the suite depend on the network it exists to measure.

### Acceptance

| gate | result |
| --- | --- |
| the tool | 6 tests over a saved payload; unrecorded, failed, out-of-scope and malformed inputs each distinct |
| the live reading | 7 successful runs since id 39806875985, all accounted for |
| the sites | both exits annotated `proved`; meta-gate CAUGHT (44 gates, 0 survived) |
| the register | classified `gate` with the reason both exits exist |
| `core` / repo | **177 / 4295** · **180 / 4482** |
| coverage | 99.97 / 99.74 / 100 / 99.97 and 100 ×4 |

## Finding 229 — the record said the evidence was gone, and the evidence was on the server

Finding 228 closed with two open items, and the sharper one was this:

> **The record's own arithmetic is still hand-made.** `[open: each reading's samples are transcribed
> from an artefact by hand. `derive-fault-golden.mjs` writes the artefact; a small `--reading` mode
> that writes the record entry too would remove the transcription step, which is where a wrong number
> would come from]`

This round went to do that, and the first move was not to write code: it was to download the six
artefacts and compare them to the six readings. The reason is that a transcription tool cannot be
tested against a transcription — if the record is wrong and the tool agrees with it, the tool is a
second copy of the error. So the record was checked against the thing it claims to describe, for the
first time.

### Six for six, and one absence that was not one

| run | key | samples compared | disagreements |
| --- | --- | --- | --- |
| 39806875985 | 19 | 19 | — *the reading did not exist yet* |
| 39810137978 | 19 | 19 | 0 |
| 39880043431 | 19 | 19 | 0 |
| 39881192308 | 19 | 19 | 0 |
| 39950191377 | 30 | 30 | 0 |
| 40049467914 | 30 | 30 | 0 |
| 40054484628 | 30 | 30 | 0 |

Six transcripts, **zero disagreements**. That is a good result and it is not a defence: it is a fact
about six files typed by one person on six afternoons, and it cannot say anything about the seventh.

The absence is the interesting row. Run `39806875985` was not in the readings at all — it sat in
`absent` with this reason:

> the first reading, strict 2/19 with type 4/19, taken before the vocabulary existed. **Its artefact
> was not retained**, so it is named here rather than reconstructed: a number this file cannot
> re-derive is not evidence, and the audit log is where an unattributed figure belongs.

That reasoning is sound and this repository should keep making it. The premise was false. GitHub
retains a workflow artefact for **ninety days**; the run was three weeks old; the artefact was on the
server, 3,977 bytes, not expired. It downloaded in one command.

Derived from the nineteen-sample key and that artefact:

```
type 4, category 11, component 14, strict 2
```

Which is *exactly* the figure the record had been quoting from memory for five rounds — and now it
is arithmetic. The run is the first entry in `readings.json`, `status: old-key`, `key.digest`
`b7816166…` (the same digest the other three nineteen-sample readings carry, which is how the
sixteen-month-old key and this run were confirmed to be the same key).

**What was done with the claim.** `absent` is now an empty list, and the assertion that used to read
`absent.length > 0` reads `toEqual([])`. It is an equality on the whole list rather than a length
check, so re-adding an entry fails a test — the mechanism stays in the schema, because
`reconcile-readings.mjs` still accepts it as a way to account for a run and the route has to stay
open for the run whose artefact really has expired.

### The tool: two numbers with no path from a keyboard

`scripts/record-reading.mjs` derives an entry from an artefact and writes it, or checks an entry that
is already recorded against the artefact it names. The arithmetic lives in
`packages/core/src/fault/reading-record.ts`, because a script cannot be imported by the suite that
would prove it.

| what | who supplies it |
| --- | --- |
| `key.digest` | derived — `id\|type\|category\|component`, sorted, newline-terminated |
| `totals` | derived — counted from the rows it just wrote |
| the rows | derived — the key's order, not the order the run happened to answer in |
| `promptDigest` | **the caller** — the digest of the text that was *measured*, which the tree may have moved past |
| `promptChange`, `status` | **the caller** — prose, and a claim about the tree |

`promptDigest` is the one that had to stay human, and the reason is the whole point of the digest
gate: a tool that computed it from the current tree would record what is true now under the name of
what was true then.

Rows follow the key, not the artefact. The artefact's order is the order requests were made in — a
fact about the run; the record's order is the key's — a fact about the content. Entries are placed by
run id for the same reason: the record's contract is run order, and this tool was written to backfill
a run older than every entry in the file.

### The constraint the record's shape cannot express, written down for the first time

A reading counts hits. Nothing in it carries a denominator, so every reader — the test that
recomputes the totals, the human reading the table — divides by `samples.length`. The scorer does not:
`buildExtractionReport` divides `strict` by the number of **graded** samples. A run with one
unparseable response reports `strict 24/29`; the same answers recorded as a reading recompute to
`24/30`. Both are true of different things, and the record can only hold the second.

Every reading so far has been wholly graded, which is why the two have never disagreed in public.
`assembleReading` therefore **refuses** a run that is not wholly graded and names the samples that
stopped it:

```
record-reading: this run is not a reading: bravo (unparseable) did not reach a scoreable answer.
The scorer divides strict by the graded count and a record entry divides it by the row count, so
writing this one would produce a total that disagrees with the report it preserves.
```

A run with unusable samples is a pipeline finding. It belongs in the report and in `pending`, not in
a reading that would disagree with the report it claims to preserve.

### Four defects this round produced, and how each was caught

**1. Five test invocations omitted `--check`.** The script fell through to its *derive* path, which
then asked for `--status`, and the test expecting exit `2` got exit `1` with a message about a
different question. The assertion caught it — but only because the exit codes differ. A suite whose
branches share an exit code would have measured the wrong path and passed.

**2. `derive-gate-sites.mjs` attributed the refusal exit to the wrong condition.** The exit sits in a
top-level `try`/`catch`, so the deriver took the nearest preceding `if` — the `absent` guard, nine
lines away and about an unrelated question — and published `condition: namedAbsent` for an exit that
fires when a run cannot be recorded. Fixed by returning a decision (`{ ok }`) and testing it, so the
condition is `!derived.ok` because the code says so:

```
scripts/record-reading.mjs:291  !derived.ok  record-reading: ${derived.reason}
```

**3. The module shipped at 97.53% statements and 88.70% branches.** Three of the four
"this sample states no field" arms were unexecuted, and so was the partial-answer normalisation.
Measured, not assumed: the coverage table named lines 120–124. Closed with four cases — three missing
fields across two functions, a partial answer, a row with no `type` at all, and an unparsed extra
sample — and the module is now **100 / 100 / 100 / 100**.

The third one matters for the method rather than the code: a threshold of 99.9 would have hidden
eleven unexecuted branches, and the only reason they were visible is that the table prints the
per-file column.

**4. This round wrote a false number into two documents before checking it.** The volume guard prints
`largest 279,893 of 280,000 bytes`, and the first draft of the open list attributed that figure to
`volume-05` -- the volume being written, and the one whose size was on the author's mind. It is
`volume-03`: `volume-05` is 153,926 and has room for four more findings. The claim was caught by
`wc -c` five minutes later, and it is the same shape as everything else in this series -- **a number
that was read next to its subject, not about it** -- which is why it is written here rather than
quietly corrected. The open list now states both figures and says which volume the split is for.

### What it still cannot do

- **Nothing forces the tool to be run.** It needs a token and a network, so it is not a gate. The
  same limit finding 228 recorded for the reconciler, one level down.
- **In ninety days the artefacts really will be gone.** The `absent` route is not vestigial; it is
  what this record will need for every reading taken before a habit of downloading exists.
- **The record still cannot say "the denominator was smaller than the key."** The refusal above is
  the honest alternative, not a solution.

### Acceptance

| gate | result |
| --- | --- |
| the record against its artefacts | 7 readings, **0 disagreements**, every sample and every total |
| the recovered reading | `39806875985`: type 4 / category 11 / component 14 / strict 2, derived from the artefact |
| `absent` | empty, asserted by equality so re-adding an entry fails |
| the derivation | 30 tests over the module, 20 over the command; every exit the script owns is driven |
| the sites | 3 new sites annotated `proved`; `derive-gate-sites --check` green (78 sites, 45 scripts) |
| the meta-gate | **45 gates, 45 caught, 0 survived**; hollowing `record-reading.mjs` turns 38 tests red in 1 of 3 naming files |
| the register | `record-reading.mjs` classified `gate` with the reason both failure exits exist |
| coverage | module **100 / 100 / 100 / 100**; package **99.97 / 99.74 / 100 / 99.97** |
| `core` / repo | **178 / 4348** · **182 / 4535** |

## Finding 230 — the four-layer condition was met by definition, and now one case proves it can be

M1 carries this exit condition:

> GT four-layer annotation (entity / fault / process / evidence) can all be filled.

Nothing in the tree could answer it. `groundTruthSchema` marks `causalChain` and
`evidenceCheckpoints` **optional**, and `rootCauseEntityId` is `z.string().min(1)` -- a value that
is checked for being non-empty and for nothing else. `findDanglingEdgeRefs` walks the graph's
edges, not the ground truth. So every case in this repository carried a type and a component,
declared three of four layers empty, and was a perfectly valid `FaultCase`. A condition that no
code can fail is a condition met by definition, and this one had been met that way since M1 was
written.

### The definition, before the annotation

`packages/core/src/fault/four-layer.ts` says what filling each layer means, in terms that can
fail:

| layer | filled when | why that and not presence |
| --- | --- | --- |
| entity | `rootCauseEntityId` resolves against the graph | a non-empty string that names no node cannot be scored against -- the evaluator has nothing to compare the model's answer to |
| fault | `type` is non-empty **and** `category` is not `unknown` | `unknown` is a member of the vocabulary on purpose, so it parses; it is the taxonomy declining to answer, and counting it as filled reports a complete case whose category nobody decided |
| process | at least one step, and both ends of every step resolve | a chain of steps naming nodes the graph lacks reads as a causal account and is not one |
| evidence | at least one checkpoint, and its `entityRef` resolves | same, one level down |

Two things the layer list alone would miss. A `CausalStep.evidenceRefs` entry naming a checkpoint
the case does not carry is reported separately from an unresolved entity: one is a graph missing
a node, the other is a step citing evidence the case never states, and they have different
repairs. And `complete` requires both lists to be empty, so a case can fill all four layers and
still be incomplete -- which happened on the first hostile edit tried against it.

### The first case, and what it is annotated from

`golden-master/fault-cases/history-checkout-cpu-saturation.json`, with a four-node graph beside
it, annotated from `resource-cpu-saturation-checkout` in the extraction key:

```
container:synthetic-storefront/checkout-api-app    the 500m limit the usage sat against
pod:synthetic-storefront/checkout-api-0            the workload that was throttled
service:synthetic-storefront/checkout-api          the p99 the pager fired on
service:synthetic-storefront/payment-service       named by the text, carries no checkpoint
```

The causal chain is the text's own sequence -- the cgroup spent the window throttled because
usage sat at a fixed quota, so request handling stretched p99 from 180ms to 4.3s with the load
generator unchanged -- in two steps, each citing the checkpoints that state its half. The three
checkpoints are the three numbers the text states: `>= 500m`, `> 0s` of throttled time, `> 4300ms`.

**The downstream service carries no checkpoint on purpose.** The text says its error rate did
not change, and "did not change" is an absence, not a value a checkpoint can hold -- writing
`== 0%` would have invented a measurement. It is a graph node because the text names it, and
naming a node a case does not score is exactly what an entity graph is for.

### The guard, and the number it prints

`scripts/check-fault-cases.mjs` walks `golden-master/fault-cases/index.json`, parses each case and
its graph through the shipped schemas, and refuses the file if any case is incomplete:

```
check-fault-cases: OK (1 of 30 sample(s) carry a four-layer case; each is complete and every
reference resolves; floor 1)
```

**The count is reported rather than gated, and the floor is a written number.** Requiring thirty
would make the guard red for the next thirty rounds and teach everyone to ignore it; requiring
nothing would let the number reach zero in silence. So `min` sits in the index, is printed on
every run, and moves up as annotation proceeds -- the shape `M1_STRICT_THRESHOLD` has, for the
same reason: a threshold that is not written down is a threshold that drifts.

Three refusals with a reason each: a `sampleId` the key does not carry (otherwise the coverage
figure is a number about a directory rather than about the key), an entry without a `why` of at
least forty characters (the annotation's argument is which part of the text each layer came from,
and a case added without it cannot be reviewed), and a file in the directory the index does not
name (a case that never runs, in a directory that reads as holding one case while holding two).

### What was measured, and what was not

- **One case is annotated.** That is a proof that the four layers *can* be filled for this
  corpus, and it is not a proof that they can be filled for all thirty. M1's condition stays
  open, and the honest statement of its state is `1 of 30`, printed by the guard on every run.
- **The chain's two steps are the text's order, not a measured causal graph.** The text says
  "the pod sat pinned at its 500m limit" and "p99 latency went from 180ms to 4.3s"; that the
  first caused the second is what the incident report asserts, and an annotation cannot do
  better than its source.
- **No attempt was made to generate the remaining twenty-nine automatically.** An earlier probe
  in this round measured what a rule can recover and the answer was noise: a slug-shaped token
  extractor called `copy-paste` and `long-running` entities, and a unit-word extractor missed
  `400Mi` because Kubernetes spells mebibytes `Mi`. Both numbers were discarded rather than
  published, because a rule that has to be corrected by reading its output thirty times is not a
  measurement -- it is a first draft of an annotation.

### Acceptance

| gate | result |
| --- | --- |
| the definition | 14 tests over four layers, the two reference lists and the printed reading |
| the mutations | deleting the dangling-evidence term, the `unknown` test, or `from && to` each turns exactly one test red; source restored byte-for-byte |
| the guard | 17 tests, every exit driven; 8 sites annotated `proved` |
| the meta-gate | **46 gates, 46 caught, 0 survived**; hollowing `check-fault-cases.mjs` turns 34 tests red in 1 of 2 naming files |
| the corpus | 1 of 30 samples carries a four-layer case; the case parses, and all 8 of its references resolve |
| `docs:check` | the guard joined the aggregate, and was **removed from `docs:check:cold`** because it imports `dist` -- the cold job would have run it before a build |
| coverage | `four-layer.ts` **100 × 4**; package **99.97 / 99.74 / 100 / 99.97** |
| `core` / repo | **180 / 4382** · **184 / 4569** |

## Finding 231 — a port is a guess, and `200` is not proof of who answered

The second full run of this round failed one test, and it is the kind of failure that gets filed
as flake:

```
scripts/verify-reader-against-backend.mjs · fails when the API answers the window with no series at all
expected 'verify-reader-against-backend: FAILED…' to contain 'never produced a sample'
  verify-reader-against-backend: FAILED -- the API at http://127.0.0.1:37691 answered 200 with
  something that is not JSON (Unexpected token 'o', "not json at all" is not valid JSON)
```

`"not json at all"` is not a string this repository's stand-in produces. It is
`jaeger.test.ts`'s stub, answering from a different test file in the same run. The gate had asked
a port a question, got an answer, and reported it as a verdict about the reader.

### The window

```js
async function freePort() {
  const probe = createServer();
  probe.listen(0, '127.0.0.1', () => { const { port } = probe.address(); probe.close(() => done(port)); });
}
```

Bind, read the number, release, then `spawn` a child that binds it. Between the release and the
child's `bind()` there is a process spawn — tens of milliseconds — and in a suite where several
files call `listen(0)` concurrently, that window is enough. The port was never reserved; it was
*guessed*, and nothing checked the guess until the gate read a stranger's HTML.

**It was always there.** Serial runs of this file never hit it, because the window has no
competitor in a single file. This round added two test files that spawn processes, the suite got
busier, and the window opened. A latent race is not a new defect; it is an old one that stopped
being invisible.

### The repair: check who answered, then try again

`/-/ready` returning `200` says *something* is listening. So the body is read, and it must contain
the word both real Prometheus and the stand-in say and a stranger does not:

| backend | `/-/ready` body |
| --- | --- |
| Prometheus | `Prometheus is Ready.` |
| the stand-in here | `Ready` |
| a Jaeger stub | `not json at all` |

If the word is missing, the port was not ours, and the loop takes another one — three attempts,
each with its own `freePort()`, and **each attempt stopping what it started before the next
begins**. That last clause is not tidiness: without it, a retry leaks one server per attempt, which
is the exact failure this script's stop path exists to prevent.

Three decisions worth stating:

| decision | why |
| --- | --- |
| the ownership test is the body, not a header | both backends answer `200` with a body that says ready, and neither sets a distinctive header; the body is what is already on the wire |
| three attempts, sharing one budget | the port is external state that can change under the gate, so retrying is the only correct form — and the budget is the deadline, so three attempts cost no more wall clock than one slow one |
| a non-ours answer is a *retry*, an empty window is a *wait* | they are different findings: one says the address is wrong, the other says the server has not scraped yet, and telling them apart is the same distinction between "could not read it" and "there is nothing there" that this repository keeps having to re-learn |

### What it does not fix

The port is still a guess — there is no way to reserve it across a `spawn`, and Prometheus cannot
be told to choose its own port and report it. The repair makes a wrong guess *recoverable* rather
than *harmless*, and it says so in the code where the next reader will look.

### Acceptance

| gate | result |
| --- | --- |
| the reproduction | full run 2 of 5 failed with the stranger's body; three runs of the file alone never did |
| the repair | `/-/ready` ownership check plus a three-attempt loop that stops each attempt before retrying |
| stability | the file alone **3 × 11 passed**; three consecutive full runs **4382 + 187 passed** |
| the sites | the stop path's exit moved two lines and kept its proof; nothing was newly unproved (86 of 86 annotations carried) |

## Finding 232 — one case is a proof, three are a shape; and a quote is the only part of an annotation a machine can check

Finding 230 ended with a number the guard prints on every run -- `1 of 30` -- and with the
statement that one case proves the four layers *can* be filled, not that they can be filled for
the corpus. This round added two more, and the floor moved from 1 to 3 with them:

```
check-fault-cases: OK (3 of 30 sample(s) carry a four-layer case; each is complete, every
reference resolves, and every layer quotes a sentence the incident text contains; floor 3)
```

### The two shapes a single case could not test

| case | shape its chain has | what its evidence has to be |
| --- | --- | --- |
| `history-checkout-cpu-saturation` | two steps inside one workload: container -> pod -> service | a threshold in one place (`>= 500m`) |
| `history-cart-network-delay` | one step **across** a boundary: cart-service -> inventory-service | a **comparison** -- 900ms on the caller and 11ms on the callee, neither of which means anything alone |
| `history-kafka-consumer-lag` | one step **towards a shared resource**: consumer -> topic | a **direction** -- lag grows on the topic, and the text's own last clause ("not broker capacity") is what rules out the other end |

The second is the one that would have been easy to annotate wrongly. `900ms` looks like a slow
service and `11ms` looks like a healthy one; the fault exists only in the difference, and a case
that recorded either number alone would have been a valid case with a wrong conclusion. The third
has the same trap mirrored: the lag is *observable* on the topic, so the annotation could point
the chain at the broker and the text would contradict it in its final clause.

### The quote: the one part of an annotation that can be checked

An entry's `why` is prose -- an argument about where the annotation came from, unverifiable by
construction. A **quote** is not: it is a substring of the incident text, and either it is there
or it is not. So the index schema went to `/2` and every layer must now carry at least one quote
of twelve characters or more, which

- must appear in the incident text of the sample the case names, compared with whitespace folded
  (a quote reflowed across a line break is the same sentence, and failing it would train the
  annotator to copy line breaks);
- must be accompanied by a sentence saying what it supports;
- and must cover all four layers -- three quotes and an unsupported layer fails, because the layer
  is what the exit condition is about.

The defect this catches is specific and common: an annotator works from memory, paraphrases the
source, and the case then rests on a sentence nobody wrote. One changed word is enough:

```
FAILED — 'history-checkout-cpu-saturation' cites a entity quote the incident text does not
contain: 'the pod sat pinned at its 400m limit'.
```

That message is a test, not a hope: seven cases in `check-fault-cases.test.ts` drive the six
refusals (a changed word, a missing layer, a quote too short, an unknown layer name, a quote with
no statement of support, no sources at all) and the one acceptance (whitespace may differ).

### What the guard caught in the code that guards

The first version wrote `problems.push(...sourceProblems(...))`, and
`no-size-dependent-array-is-spread` refused it: the list is one entry per source, so its length is
a function of the annotation, and `push(...)` is bounded by the argument limit rather than by
anything the code decides. Four sources today; the rule exists for the four hundred that would
not fail. Replaced with a `for` loop, and the site's own comment says why rather than leaving the
next reader to re-derive it.

### Declared, not extracted

Two of the three cases carry a `system` name and an absolute `injectTime` that the incident text
does not state: it gives a clock time without a date ("at 02:14 UTC"), a relative duration
("over six hours"), or a change and no time at all. Those values are **declared by the corpus**,
and each entry's `why` says so in its own words rather than leaving the reader to infer that the
text supplied them. The alternative -- leaving `injectTime` out -- is not available, because the
schema requires it, and a case that omitted it would not be a case.

### What it still does not do

- **3 of 30.** The guard holds the number and the floor is 3; nothing here claims the other
  twenty-seven can be annotated, only that three of them were and that the machinery to hold each
  one to its text exists.
- **A quote proves the sentence exists, not that it supports the layer.** "No packet loss and no
  retransmits" is in the text and is used to support the *fault* layer; whether it does is a
  judgement a reader makes. The guard can hold the annotation to its source; it cannot hold it to
  being right, and saying so is the difference between a gate and a certificate.

### Acceptance

| gate | result |
| --- | --- |
| the corpus | **3 of 30**, all complete, 8 references each resolving against one shared eight-node graph |
| the quotes | 12 quotes, each verbatim in its sample's incident text; whitespace folded |
| the guard | 24 tests, every exit and every refusal driven |
| the defect it caught | `problems.push(...)` refused by `no-size-dependent-array-is-spread`; replaced with a loop |
| the module | `four-layer.ts` **100 × 4**; package **99.97 / 99.74 / 100 / 99.97** |
| `core` / repo | **180 / 4390** · **184 / 4577** |

## Finding 233 — the annotated cases had never been asked whether they are cases

`assessFourLayer` answers one question: are the four layers filled, and do their references
resolve. It does not answer "is this a well-formed `FaultCase`", and nothing else did either --
the guard called `faultCaseSchema.parse` and then the four-layer reader, and stopped. So three
cases passed every check while carrying timestamps and units that the repository's own gates
reject.

### What G1 said the first time it was asked

```
'injectTime must be canonical UTC ISO-8601, got 2026-09-14T02:03:00Z'
'window.start and window.end must be canonical UTC ISO-8601'
```

All three cases, every timestamp. `ISO_UTC` in `gates.ts` requires **milliseconds**
(`\d{2}:\d{2}:\d{2}\.\d{3}Z`), and every case was written `...:03:00Z` -- canonical to a human and
not to the gate the case would have to pass before it could be scored. The schema accepts both,
because `faultCaseSchema` says `z.string().min(1)` and leaves canonicality to G1; the annotation
had been validated against the weaker of the two.

### What G2 said the next time

```
checkpoint 'cp-cpu-limit' uses unknown unit 'm'
checkpoint 'cp-lag' uses unknown unit 'messages'
checkpoint 'cp-processing-tripled' uses unknown unit 'x'
```

The conversion table is a closed set -- time, bytes, rate, ratio, count -- and the three units are
the ones a person writes: millicores, a message count, a multiple. `m` is the worst of them,
because in UCUM it is *metres*: a table that accepted it would have converted a CPU quota into a
length.

The repair is a translation, not a relaxation:

| annotated | what it meant | what it says now |
| --- | --- | --- |
| `>= 500 m` | half a core | `>= 0.5 1` -- a ratio of one core, which is what CPU usage is |
| `> 4.2e6 messages` | a count of records | `> 4200000 count` |
| `== 3 x` | three times the time before | `== 3 1` -- a ratio |

Each checkpoint's description now says the same thing in words, so a reader who does not know the
table does not have to guess.

### Both halves are now asked, and the obligation is the annotation's alone

`check-fault-cases.mjs` runs `checkG1Structural` with `requiredSignals: []` and
`checkG2Semantic` on a one-case bundle built from the case and its graph. The first is what makes
this tractable: **the structural half of G1 needs no telemetry**, so an annotated case can carry the
L2 obligation without carrying signals it does not have. G3, G4 and G5 do need telemetry and
outcomes, and they are not asked -- a case that is annotated is not a case that is scoreable, and
conflating the two is how a corpus of annotations would come to be quoted as a corpus of
measurements.

```
check-fault-cases: OK (3 of 30 sample(s) carry a four-layer case; each is complete, every
reference resolves, every layer quotes a sentence the incident text contains, and every case
passes the L2 contract -- structure, references and units; floor 3)
```

### What this says about the earlier rounds

Finding 230 and 232 each claimed their cases were complete, and each was right about the four
layers. Neither claim covered what G1 and G2 check, and neither round had a reason to think it
did -- which is the shape this campaign keeps finding one level up: **the check that was run
answered a narrower question than the sentence it was quoted as supporting.**

### Acceptance

| gate | result |
| --- | --- |
| G1 | three cases, three timestamps repaired to millisecond precision; a missing millisecond now fails the guard |
| G2 | three checkpoints re-expressed in table units; an unknown unit and a hop the topology does not connect each fail the guard |
| the guard | 28 tests, four new: two for L2's structural half, two for its reference half |
| the module | unchanged; `four-layer.ts` **100 × 4**; package **99.97 / 99.74 / 100 / 99.97** |
| `core` / repo | **180 / 4394** · **184 / 4581** |

## Finding 234 — an annotation cannot carry telemetry until its window starts before its onset

Finding 233 closed by asking G1 and G2 of every case and naming the boundary: G3, G4 and G5 need
telemetry these cases do not have, and "a case that is annotated is not a case that is scoreable".
This round crossed part of that boundary, and the first thing it found was that the corpus **could
not** have crossed it as written.

### The window was the onset

All three cases had `window.start === injectTime`. G3 reads a metric's **baseline** from samples
before `injectTime` and its **post-onset** samples from `injectTime` onwards; G2 requires every
signal to sit inside the declared window. With `start === onset` there is no sample that is both
before the onset and inside the window, so the two rules cannot be satisfied at once, and no amount
of telemetry would have made these cases valid.

The corpus now starts each window before its onset -- fifteen minutes before for the two short
windows, an hour before for the six-hour one -- and an incident is what it always was: an onset
inside an observation window, not the window itself.

### Telemetry derived from the checkpoints, with both ends quoted

`history-checkout-cpu-saturation.signals.json` declares two series:

| series | baseline | post | the sentence both come from |
| --- | --- | --- | --- |
| `request_duration_p99_ms` on `checkout-api` | 180 ms | 4300 ms | `180ms to 4.3s` |
| `container_cpu_throttled_seconds_total` on `checkout-api-0` | 12 s | 96 s | `throttling counters climbed` |

The guard expands each into sixteen metric signals -- eight baseline points from `window.start`,
eight post-onset points from `injectTime`, ninety seconds apart, with a **fixed** jitter cycle
rather than a random one so two runs produce the same bytes -- and then runs G1 (with
`requiredSignals: ['metric']`), G2 and G3 over the result. The counter is expanded as an
accumulating series, because a counter that jumps to its post value is a level wearing a counter's
name.

**Both ends are quoted, and the quote is checked the same way the layer quotes are.** That is what
stops the derivation from being an invention: the text states the before and the after, so the
series has two anchors, and the guard refuses a series whose quote is not in the incident text.

### G3 can refuse it, which is the point

The test that makes this a measurement rather than a ceremony flattens **both** series and watches
the gate fail:

```
'history-checkout-cpu-saturation' signals fail G3: no metric sustains |Z| >= 2 for 3 samples
after injection
```

Flattening one series is not enough, and that is G3's semantics rather than an oversight: a case is
valid when *some* metric carries a sustained anomaly, because the fault is allowed to be visible in
one place. The first version of the test flattened only the p99 and passed, which is the shape this
campaign keeps meeting -- **a green that meant "the other series was doing the work"**.

### G5 was askable all along, and nothing had asked it

The same round found a cheaper answer sitting next to the expensive one. G5's checks -- a duplicate
case by fingerprint, contamination from a public benchmark, an identifier in the payload, and
`answerKeyIsolated` -- need **no telemetry at all**, so they apply to an annotation as much as to a
scored case. `answerKeyIsolated: true` is a claim each case makes about itself and nothing had ever
read it; a case whose answer key sits beside its query is a case whose oracle is the payload.

So G5 is now asked of every case, and one test sets `answerKeyIsolated: false` and watches the guard
refuse it. G4 is the only gate left that genuinely needs something the corpus does not have.

### What the number now says

```
check-fault-cases: OK (3 of 30 sample(s) carry a four-layer case; ...; every case passes G1, G2
and G5 -- structure, references, units, and no leaked identifiers; 1 of 3 also carry derived
telemetry that passes G3; floor 3)
```

`1 of 3` is reported, not gated, for the same reason `3 of 30` is. And it says **derived**: these
signals were constructed from the annotation, not captured from a deployment. G4 needs a baseline
solver to show the case is solvable and G5 needs the pollution and de-identification checks; both
are still unasked, so the distance from "annotated" to "scoreable" is smaller and still real.

### Acceptance

| gate | result |
| --- | --- |
| the window | three cases now start before their onset; `start === onset` could never satisfy G2 and G3 together |
| the derivation | two series, both ends quoted, expanded to 32 metric signals on a fixed 90-second cadence |
| G1 / G2 / G3 | all three run over the derived signals; G1's `requiredSignals` is `['metric']` for these cases |
| the refusal | both series flattened fails G3; one series flattened passes, which is G3's `anyStrong` semantics |
| the guard | 34 tests (six new: acceptance, no-anomaly, bad quote, wrong case, empty series, answer key not isolated) |
| G5 | asked of every case; `answerKeyIsolated: false` is refused |
| the meta-gate | **46 gates, 46 caught, 0 survived**; hollowing the guard turns 66 tests red in 1 of 2 naming files |
| `core` / repo | **180 / 4400** · **184 / 4587** |
| coverage | 99.97 / 99.74 / 100 / 99.97 and 100 ×4 |

## Finding 235 — every case now carries telemetry, and one of them carries a control

`1 of 3` became `3 of 3`, and the way it happened says something about what a corpus needs that a
single case cannot show.

```
check-fault-cases: OK (3 of 30 sample(s) carry a four-layer case; each is complete, every
reference resolves, every layer quotes a sentence the incident text contains, and every case
passes G1, G2 and G5 -- structure, references, units, and no leaked identifiers; 3 of 3 also
carry telemetry whose provenance is declared and which passes G3; floor 3)
```

### Three evidence shapes, and a series that does not move

| case | series | what the shape is for |
| --- | --- | --- |
| checkout cpu-saturation | `request_duration_p99_ms` 180 -> 4300; `container_cpu_throttled_seconds_total` 12 -> 96 (counter) | a threshold in one place, plus the mechanism that produced it |
| cart network-delay | `client_span_duration_ms` 12 -> 900; `server_handler_time_ms` **11 -> 11** | a **comparison**, and the second series is the control |
| kafka consumer-lag | `kafka_consumergroup_lag` 0 -> 4.2e6 (counter); `per_message_processing_seconds` 0.02 -> 0.06 | a **direction**, with a ratio that has something to be a ratio of |

**The flat series is new, and it is the most useful thing here.** G3 needs one sustained anomaly
and the network case has it in the caller; the callee's series deliberately carries none. Without
it the corpus could only say "this number moved", and the fault would be indistinguishable from a
slow service -- the annotation's own reason for calling it a *network* fault is that the callee's
handler did not move. A corpus whose every series rises has no way to express its own controls.

The kafka case makes the same point in a different dimension: the checkpoints state a **ratio**
(`== 3 1`), and a ratio is a comparison with nothing to compare until the underlying duration is
present. So `per_message_processing_seconds` carries 0.02s before and 0.06s after, and the ratio
becomes checkable against data rather than against itself.

### Provenance is a closed vocabulary now

`provenance` was a free string. It is now `derived | captured`, and anything else is refused:

```
'history-checkout-cpu-saturation' declares provenance 'measured', which is neither 'derived' nor 'captured'
```

`captured` is admitted and nothing uses it. That is deliberate: a vocabulary with one member makes
the word *derived* unfalsifiable, and the report says "derived" on the strength of this field.
When a case is eventually collected from a deployment, the value is already there and the change is
a data change rather than a schema change.

### What it still does not do

- **G4 has never been asked.** It needs a baseline localiser's outcome -- a real run, not a
  derivation -- and no such run exists for these cases. Every claim here is about the shape a case
  can carry, not about whether a solver can find the answer in it.
- **All three are `derived`.** The signals are constructed from the annotations, and the words in
  the report are the only thing keeping that legible.

### Acceptance

| gate | result |
| --- | --- |
| the corpus | **3 of 3** cases carry declared telemetry that passes G3; 3 of 30 extraction samples are annotated |
| the control | the network case's callee series is flat by construction, and the case still passes G3 on one anomaly |
| provenance | closed vocabulary; `measured` refused, `captured` admitted and unused |
| the guard | 36 tests (two new: an unknown provenance, and `captured`) |
| `core` / repo | **180 / 4402** · **184 / 4589** |
| coverage | 99.97 / 99.74 / 100 / 99.97 and 100 ×4 |

## Finding 236 — G4 was the last gate that needed a run, and now there is one

Findings 233–235 each ended with the same sentence: G4 has never been asked of an annotated case,
because G4 reads `BaselineOutcome`s and no run produced any. This round wrote the run.

### The localiser, and what it refuses to read

`fault/baseline-localiser.ts` ranks services by the largest absolute z-score any of their metrics
reaches after the onset, against that metric's own baseline. Peak per service, descending, ties
broken by service name so two runs produce one order. Nothing about it is clever.

**Two properties are what make it a measurement rather than a certificate**, and both are asserted
rather than described:

| property | why | how it is held |
| --- | --- | --- |
| it never reads the answer key | a localiser that peeked turns G4 into a stamp | the test hands it a case whose `groundTruth` has been replaced wholesale and asserts the ranking is unchanged |
| "not in the ranking" is `null`, not last | a solver that produced no candidate by that name did not place it badly -- it did not place it | `rankOfTruth` is `null` when the component is absent, and G4 counts `null` as unsolved |

The tiebreak earns its own sentence: without it, equal peaks come out in insertion order, which is
the order the signals happened to arrive in -- **a fact about the file, not about the data**.

### What a rank of 1 does and does not mean

The signals are derived from the annotations, so a peak-z method finding the annotated service is
close to tautological: the service carrying the constructed anomaly *is* the answer. What the run
establishes is narrower and still worth the code -- **the case carries a locatable structure**, and
G4's first condition is met by a run rather than assumed. Difficulty needs many cases and a spread
of baselines, which is what `G4Options.distributionMinCases` is for and why it does not fire here.

Both facts are in the module's comment, not only here, because the next reader will be the one
tempted to quote the number.

### The corpus now passes four of five gates

```
check-fault-cases: OK (3 of 30 sample(s) carry a four-layer case; ...; every case passes G1, G2
and G5 -- structure, references, units, and no leaked identifiers; 3 of 3 also carry telemetry
whose provenance is declared, which passes G3, and which the peak-z baseline locates in its
top-K; floor 3)
```

G1, G2, G3, G4 and G5 have now each been asked of every annotated case. What remains between
"annotated" and "scoreable" is no longer a gate: it is that the signals are **derived**, and that
three of thirty samples carry a case at all.

### Two defects of this round

**1. The comparator had a branch nothing executed.** The first version was
`right.peakZ - left.peakZ || (left.service < right.service ? -1 : 1)`, and the coverage table
reported **96.15% branches** on the module with that line named. A hand-written three-way comparator
has two branches and one of them is easy to leave unexecuted; `localeCompare` has none at this
level. Replaced, and the reason is in the code where the next reader will look.

**2. A test paired one case with another case's signals.** The scratch corpus writes the checkout
case, and the first version of the G4 test loaded the *cart* declaration with it -- refused by the
guard's own `names signals for` check, which is the mechanism working. Fixed by using the
declaration that matches, and the test now says why.

### Acceptance

| gate | result |
| --- | --- |
| the run | 12 tests over the localiser: ranking, answer-key blindness, empty inputs, malformed timestamps, missing baseline, non-metric signals, ties, `topK` |
| G4 | asked of every case that carries telemetry; a case whose anomaly belongs to an unnamed service is refused |
| the corpus | **3 of 3** cases pass G3 and are located in the baseline's top-K |
| the meta-gate | **46 gates, 46 caught, 0 survived**; hollowing the guard turns 72 tests red in 1 of 2 naming files |
| coverage | module **100 × 4**; package **99.97 / 99.74 / 100 / 99.97** |
| `core` / repo | **181 / 4419** · **185 / 4606** |

## Finding 237 — one baseline asks whether a method agrees with its own construction

Finding 236 wrote the localiser G4 needed and ended with the sentence that made this round necessary:

> **The baseline is peak-z, and it was chosen because it is dull.** `[open: G4 needs one solver that
> locates the root cause, and this one does -- on data derived from the same annotation. A second
> baseline with a different inductive bias would test whether the case is locatable rather than
> whether one method agrees with the construction]`

G4's rule is "at least one baseline places the true root cause inside its top-K". With one baseline
that sentence is a statement about *that method*, and the method is a peak |z| statistic on series
that were constructed to contain exactly one excursion each. A second baseline only helps if it
**fails differently**, so the second one is a robust median shift:

| | peak-z | median-shift |
| --- | --- | --- |
| a lone spike | dominates the statistic | invisible: one sample of eight does not move a median |
| a contaminated baseline | inflates `sigma` until a real change scores 1.2 | discarded: a median absolute deviation ignores up to half the points |
| a sustained change | seen, scaled by the baseline's spread | seen, scaled by the baseline's robust spread |

Both disagreement shapes are asserted with hand-built series, because a pair of baselines that
agreed everywhere would measure nothing:

```
peak  ['spiky-service', 'steady-service']   robust  ['steady-service', 'spiky-service']
peak  ['mild-service', 'hiccup-service']    robust  ['hiccup-service', 'mild-service']
```

The `1.4826 * MAD` consistency constant is there so the two statistics share a scale: **the pair is
meant to disagree about robustness, not about units**. The `epsilon` floor on the scale is the same
one `zScore` applies to a zero standard deviation, stated identically in both modules, so the two
cannot disagree about degenerate input either.

### G4 now requires both, and there is a control that proves it

`minSolvers: 2`, with both outcomes handed to the gate and the message naming both ranks:

```
'history-checkout-cpu-saturation' is not solvable by both baselines
(peak-z-by-service=1, median-shift-by-service=4): only 1 baseline(s) locate the root cause within top-K
```

That message is from a test, not from the corpus. A declaration was written whose root cause carries
a **spike** and whose three decoys carry steps: peak-z scores the spike at roughly 1600 and ranks the
truth first, and a median over eight samples does not move, so the robust ranking places it fourth of
four -- outside a top-K of three. Under one solver that case would have passed.

**That is the cost of `minSolvers: 2` and it is stated rather than discovered later:** a case whose
only evidence is a brief excursion is refused, because one method finding it is not evidence that the
structure is there rather than that the method is sensitive to it. If a real incident is genuinely a
spike, the corpus has to say so with a second series that a robust statistic can see -- which is a
statement about what a case must carry, not about which solver is right.

### The spike shape exposed a silent fallback

The declaration format could only express a level change or an accumulating counter, and the
expansion read it as `declaration.derivation === 'counter'` -- **everything else silently meant
`step`**. So `"counters"`, a typo, would have produced a step series: a file that reads as a counter
and expands as a level, with nothing in any run to reveal it.

The vocabulary is now closed -- `step | counter | spike` -- and an unknown value is refused:

```
declares derivation 'counters' for 'container_cpu_throttled_seconds_total', which is not one of
step / counter / spike
```

`spike` was added because the control above needs it. That is the honest order of events: the shape
exists because a test required a shape the format could not express, and the vocabulary became closed
because writing the shape made the fallback visible.

### Two defects of this round

**1. Every series in the new module's tests had an even length.** `medianOf` averages the two middles
for an even count and takes the middle sample for an odd one; the second arm was never executed, and
the coverage table reported **96.55% branches** with the line named. Closed with a five-point baseline
`[10, 12, 11, 9, 500]` whose mean is 108.4 and whose median is 11: the test that exercises the arm is
also the clearest statement of the robustness claim, since a post window at 11 scores a shift of
exactly zero.

**2. The corpus test used one case's timestamps for three cases.** The first version of
"agrees on the corpus" expanded every declaration against the cart case's window; the checkout case's
onset is elsewhere, so all its signals landed in the baseline period, the ranking came out empty, and
the assertion failed with `null` rather than with a wrong rank. The helper now takes the case, and
the test says why -- a failure that reads as "no rank" instead of "wrong rank" is the one that gets
misdiagnosed.

### Two vocabularies, one word

`check-data-model-vocabularies` lists the published sets, and reading its output next to this round's
work showed a collision: the signals declaration called its two-member axis `provenance`, and the
repository already publishes a `provenance` -- `PROVENANCE_SOURCES`, four members
(`direct | derived | inferred | defaulted`), describing how a single **value** was obtained.

Two problems, and the second is worse than the first:

- `derived` meant "computed from other values" in the IR and "constructed from prose" in the corpus.
- `captured` was not a member of the published set at all, so the same word had two vocabularies with
  one overlapping member.

The field is now `origin: derived | captured`, and the guard refuses a declaration that still says
`provenance` rather than ignoring it:

```
'history-checkout-cpu-saturation' declares 'provenance'; the signals field is 'origin', because this
repository already publishes a different `provenance` (`PROVENANCE_SOURCES`)
```

Ignoring the old key would have been cheaper and worse: a declaration that still says `provenance`
would arrive with no `origin`, and the guard would report a vocabulary error about an empty string --
a message pointing at a **value** when the thing that has to move is the **key**. That is the same
shape as the `derivation` fallback above, one field over, in the same round.

### What this still does not establish

- **Both baselines are locating a construction.** The series were derived from the annotations, so
  two methods agreeing raises the claim from "one bias likes it" to "two biases find it", not to
  "a real RCA system would". `provenance: derived` is still the only thing saying so.
- **Both aggregate per service with `max`.** Deliberate -- the comparison is about the statistic, not
  about how metrics combine -- and it means a service with many quiet metrics behaves the same under
  both. That is a shared assumption the pair does not test.
- **Three cases, two methods, six outcomes.** A 6/6 is a fact about six outcomes, not a distribution.

### Acceptance

| gate | result |
| --- | --- |
| the second baseline | 18 tests: ranking, answer-key blindness, both disagreement shapes, all three corpus cases, degenerate inputs, ties, `topK`, odd and even medians |
| G4 | asked with `minSolvers: 2`; the message names both methods and both ranks |
| the control | a spike-only case is located by peak-z at rank 1 and by median-shift at rank 4, and is refused |
| the vocabulary | `step | counter | spike`; an unknown derivation is refused instead of expanding as a step |
| the corpus | **3 of 3** cases placed in the top-K of *both* baselines |
| the meta-gate | **46 gates, 46 caught, 0 survived**; hollowing the guard turns **78** tests red in 1 of 2 naming files |
| coverage | both localiser modules **100 × 4**; package **99.97 / 99.75 / 100 / 99.97** |
| `core` / repo | **182 / 4442** · **186 / 4629** |

## Finding 238 — three modules, three answers about whether the corpus can be exported

M1 carries the condition "RCAEval RE1/RE2 export passes L2". It has a passing unit suite and an
official round trip behind it, and **neither had ever been pointed at the annotated corpus**. The
corpus stores its telemetry as declarations that only `check-fault-cases.mjs` expands, so a bundle
built the obvious way carries `signals: {}` and every exporter skips every case:

```
RE1 files: 0  skipped: [{"reason":"no telemetry signals attached"}, ...]
```

Wiring the expansion in changes the answer, and produces three of them:

| suite | cases written | data-less files | coverage report, same bundle |
| --- | --- | --- | --- |
| RE1 | 3 | **0** | `rcaeval-re1 ready` |
| RE2 | 3 | **6** (`logs.csv`, `traces.csv` × 3) | `rcaeval-re2 degraded (no log)` |
| RE3 | 0, 3 skipped | 0 | `rcaeval-re3 degraded (no log, trace)` |

**The exporter and the coverage report disagree, and both are right about different questions.** The
report answers "can this dataset be evaluated for the target"; the exporter answers "what files can I
write". A CSV with a header and no rows satisfies the second and not the first, and nothing connected
them -- `buildLogsCsv` has never returned null.

### The repair that was tried, and the anchor that refused it

The obvious fix is for the exporter to skip a case that cannot fill every file its suite writes,
the way RE3 already skips non-code cases before writing anything. It was implemented, and it turned
the official round trip red:

```
ROUNDTRIP SKIP   1/1 RE2-ob-cpu_1   target=rcaeval-re2    oracle=0.00 signals=80
```

The round trip's own RE2 case carries **80 metric signals and no log** -- it was passing on exactly
the behaviour the repair removes. That is a fact about the anchor, not about the repair: the strongest
artefact in this repository had never exercised RE2's log path either.

**The change was reverted byte-for-byte.** A shared contract that the official round trip depends on
is not rewritten on the strength of one corpus; the disagreement is recorded at the caller instead,
where the corpus is known and where a wrong answer is a finding rather than a regression.

### What is printed now, on every guard run

```
check-fault-cases: coverage rcaeval-re1 ready · rcaeval-re2 degraded (no log) · rcaeval-re3 degraded (no log, trace)
check-fault-cases: export RE1 3 case(s) written, 0 file(s) with no rows · RE2 3 case(s) written, 6 file(s) with no rows · RE3 0 case(s) written, 0 file(s) with no rows, 3 skipped
```

Two numbers that had never existed, printed where the corpus is checked, and pinned by a test:
`RE1 0` and `RE2 6`. A change in either module that moves one of them is now a deliberate edit.

**What this says about M1's condition**: RE1 is met -- three cases, no data-less files. **RE2 is not,
and the blocker is the corpus's modality, not the exporter**: the annotated cases carry metrics only,
and a log cannot be derived from a sentence that does not state one. RE3 is not applicable: it targets
code-level faults and the corpus's three categories are `resource`, `network` and `middleware`.

### One defect of this round

**The counter counted lines.** The first version called a file data-less when its body had at most one
line, which reported `RE1 3 file(s) with no rows` while RE1 was writing real data: `metrics.json` is
one line of JSON, and `inject_time.txt` is one line by design. Emptiness is a property of content --
a JSON object with no keys, a CSV with no rows below its header -- and the pinned numbers were wrong
until it said so. The mistake is the same one this series keeps meeting: **a measure read next to its
subject rather than about it.**

### Acceptance

| gate | result |
| --- | --- |
| the corpus through the exporters | RE1 3 written / 0 data-less; RE2 3 written / 6 data-less; RE3 0 written / 3 skipped |
| the coverage report | `re1 ready`, `re2 degraded (no log)`, `re3 degraded (no log, trace)` on the same bundle |
| the rejected repair | exporter-side refusal turned the official round trip red (`RE2-ob-cpu_1`, 80 metric signals); reverted byte-for-byte |
| the guard | 44 tests; three new, pinning both printed lines and the absence of them when no case carries telemetry |
| the meta-gate | **46 gates, 46 caught, 0 survived**; hollowing the guard turns **82** tests red in 1 of 2 naming files |
| `core` / repo | **182 / 4446** · **186 / 4633** |

## Finding 239 — a log is not a metric, and the corpus had never carried one

Finding 238 ended with the number that named the hole: `RE2 3 case(s) written, 6 file(s) with no
rows`, and a coverage report calling `rcaeval-re2 degraded (no log)`. The corpus could not fill a
`logs.csv` because a declaration could only expand into metric samples, and **a log is not a metric
standing in for one**:

- a metric has a baseline, a threshold and a z-score; a log has a sentence and a time;
- G3 reads only metrics, so a log can never be what makes a case *valid*;
- and the sentence is the point. A log body this repository wrote for itself would be evidence of
  nothing, which is why the declaration's log entries carry both a `body` (a reconstruction) and a
  `quote` (verbatim from the incident text), and the guard checks the quote exactly as it checks the
  four layers'.

### The fourth case, and the first line

`history-queue-watermark-ledger-writer`, annotated from `middleware-queue-watermark-ledger-writer`:
two series (`broker_disk_watermark_percent` 78 → 92, `producer_buffer_records` 200 → 40000) and one
log line, `disk watermark crossed 92 percent; producers throttled`, quoting the broker's own words.
The graph grew to eleven entities and seven edges: `ledger-writer` calls `ledger-events`, and a
`node` called `kafka-broker-3` **hosts** the topic -- because the watermark is measured on the broker
and the fault is in the topic's retention, and a graph that could not say where the disk is would
have made the checkpoint unattributable.

The chain runs writer → topic, and the mechanism sentence carries the real direction ("the topic's
retention was raised…, so the broker's disk watermark crossed…, and it throttled producers"). A chain
pointing the other way would need an edge saying the topic calls its producer, which is a topology
nobody deployed.

### What changed in the numbers

```
check-fault-cases: coverage rcaeval-re1 ready · rcaeval-re2 ready · rcaeval-re3 degraded (no trace)
check-fault-cases: export RE1 4 case(s) written, 0 file(s) with no rows · RE2 4 case(s) written, 7 file(s) with no rows · RE3 0 case(s) written, 0 file(s) with no rows, 4 skipped
```

**`rcaeval-re2` is `ready` for the first time**, and the RE2 export writes four cases where every
`logs.csv` used to be a header. Seven data-less files remain and every one is a `traces.csv`: a trace
needs span timings the texts do not state, and inventing them is the one thing this corpus's
provenance word forbids.

`4 of 30` samples now carry a four-layer case, and the floor moved to 4 with it.

### Three defects of this round

**1. G2 refused the broker.** The first declaration named its series on `kafka-broker-3`, and
`checkG2Semantic` answered `signal references service 'kafka-broker-3' which is not in the entity
graph`. I had assumed signal services were free-form because `checkout-api-0` resolves -- it resolves
because it *is* an entity. The repair was to add the node and its `hosts` edge, not to rename the
series: a checkpoint on a metric the graph cannot attribute is exactly what G2 is for.

**2. The first log tests passed for the wrong reason.** They fed the ledger declaration to the
checkout case, and the refusal they asserted also fires because the declaration names a different
case -- two problems, one assertion, and the test would have kept passing if the log checks were
removed. Rewritten against the checkout declaration with a log line quoting the checkout's own text,
so the only thing under test is the log rule.

**3. `filled  11` versus `filled 11`.** The expectation was written by substituting a digit into the
old string, and the printed reading pads the count to two characters, so eleven loses a space. The
test caught it; the lesson is the same one the `padEnd` findings have been repeating -- **a formatted
line is not a string with a number in it.**

### Acceptance

| gate | result |
| --- | --- |
| the modality | `logs` in a declaration: three signals after the onset, body and quote checked separately |
| the case | `history-queue-watermark-ledger-writer`: 2 series, 1 log line, 4 layers, 4 quotes |
| the graph | eleven entities, seven edges; the broker hosts the topic |
| the corpus | **4 of 30**, floor 4; every layer quotes its text |
| the coverage report | `re1 ready`, **`re2 ready`**, `re3 degraded (no trace)` |
| the export | RE1 4 / 0 data-less; RE2 4 / 7 data-less (all `traces.csv`) |
| the guard | 49 tests; five new over the log rule, two of them driving the acceptance |
| the meta-gate | **46 gates, 46 caught, 0 survived**; hollowing the guard turns **90** tests red in 1 of 2 naming files |
| `core` / repo | **182 / 4451** · **186 / 4638** |

## Finding 240 — the last modality, and an id that was a name

Finding 239 left one sentence: *the seven data-less files are all `traces.csv`*. This round closes
that, and the modality turned out to be the one with a property the other two cannot express.

**A span has a parent.** A metric answers "how much", a log answers "what was said", and a span
answers "where the time went" -- but only if the child sits inside the parent. The cart case states
both numbers the pair needs: `rose from 12ms to 900ms` on the caller and `stayed at 11ms` in the
callee, which is also its own reason for calling the fault a network one. So the declaration gained
`traces`:

| field | what it is |
| --- | --- |
| `service`, `spanName`, `durationMs` | the span's own facts, both durations quoted from the text |
| `parent` | the `spanName` of another entry in the same file, or absent for a root |
| `quote`, `why` | the sentence it rests on, and what it supports |

Four refusals: a quote the incident text does not contain, a duration that is zero or not a number
(a span that did not happen), a `parent` naming nothing in the file, and a span with no statement of
what it supports. The `parent` rule is the one that matters: **a row whose parent id belongs to
nothing is worse than a missing row, because it looks complete.**

### The numbers, all three ready

```
check-fault-cases: coverage rcaeval-re1 ready · rcaeval-re2 ready · rcaeval-re3 ready
check-fault-cases: export RE1 4 case(s) written, 0 file(s) with no rows · RE2 4 case(s) written, 6 file(s) with no rows · RE3 0 case(s) written, 0 file(s) with no rows, 4 skipped
```

Three rounds ago no suite was ready and every modality was missing; now the coverage report calls all
three evaluable. **RE2's data-less count went 7 → 6** -- one `traces.csv` has rows. And **RE3 still
writes nothing**: it targets code-level faults and the corpus's four categories are `resource`,
`network`, `middleware`, `middleware`. Two independent reasons, and the export line says so rather
than leaving a reader to infer it from a zero.

### The defect: an id derived from a name

The first version built span ids from the case id's first twelve characters after stripping hyphens:

```js
const spanId = (index) => `${caseId.replace(/-/g, '').slice(0, 12)}${...}`;
```

`history-checkout-cpu-saturation` and `history-cart-network-delay` happen to differ before the cut,
so the corpus was fine -- and that is exactly the problem. Two cases that agreed up to the twelfth
character would produce **the same span ids**, and one case's trace would point into another's: a
defect that appears only when the corpus grows, in the artefact that is hardest to check by eye. The
prefix is a name, not an identity. It is now `sha256(caseId)` truncated to twelve hex characters,
with the reason in the code.

### What this does not fix

- **The span's timestamp is a fixed offset.** Ten seconds after the onset, for every span in every
  case. The text gives durations and no start times, so the clock is a construction -- the same
  limitation finding 239 recorded for log lines, one field over.
- **A collision is not tested for.** What is tested is the structure the digest protects: the child's
  parent resolves, and a case with spans fills its `traces.csv`. A test that would catch a collision
  needs two cases whose ids agree to twelve characters, and the corpus has none.

### Acceptance

| gate | result |
| --- | --- |
| the modality | `traces` in a declaration: span name, duration, optional parent, quote and why |
| the refusals | five tests: quote, zero duration, dangling parent, no support statement, and the acceptance with a filled `traces.csv` |
| the corpus | the cart case carries two spans, the callee as a child of the caller |
| the coverage report | **all three suites ready** for the first time |
| the export | RE1 4 / 0 data-less; RE2 4 / **6** data-less; RE3 0 / 4 skipped (code-level only) |
| the ids | a digest of the case id, not its first twelve characters |
| the meta-gate | **46 gates, 46 caught, 0 survived**; hollowing the guard turns **102** tests red in 1 of 2 naming files |
| `core` / repo | **182 / 4457** · **186 / 4644** |

## Finding 241 — a guard can lose its own verdict on the way out

The third full run of this round failed thirteen assertions, all in one file, all reading the same
thing:

```
the guard exited 0 without printing; every exit prints. {"status":0,"signal":null,"error":"undefined"}
```

`check-doc-counts.mjs` has two exits and prints at both. A run that exits 0 with no output is not a
verdict from it -- and the test that says so was written for exactly this, one round earlier, after
three cases came back as `expected '' to contain 'check-doc-counts: OK'`.

### Two candidate causes, and a fix for one of them

| cause | what it looks like | what makes it impossible |
| --- | --- | --- |
| the write was **lost** | `console.log`/`console.error` write to a pipe asynchronously, and `process.exit` does not wait for them | `writeSync(1|2, ...)`: the bytes are in the descriptor before the process ends |
| the child **never ran** | the kernel refused the spawn under sixty-four workers | a retry, which the helper already had for `status: null` |

Which one it was is not knowable from one observation, so both are addressed and neither is assumed:

- the guard's output goes through a `verdict(fd, text)` helper that uses `writeSync`, so **a verdict
  can no longer be truncated by its own exit** -- which is worth having whatever the diagnosis, since
  a guard whose failure message can vanish is the one defect that makes every other guard
  unreadable;
- the test helper treats `status: 0` with no output as a third "never ran" shape and retries once,
  and **still fails if the retry is silent too**.

### The deriver had to learn the new call

`derive-gate-sites.mjs` finds a site's diagnostic in the nearest preceding `console.error`,
`console.log` or `process.stderr.write` call. `verdict(2, 'check-doc-counts: FAILED')` is none of
those, so the site lost its fingerprint and the inventory reported a site with **no diagnostic at
all** -- which reads identically to "this guard has no diagnostic", a much stronger claim. The
pattern now includes `verdict(`, with the reason in the code: a diagnostic written through a helper
is still the gate's diagnostic, and a deriver that only understands `console` renames a real message
into a silent one.

### Evidence

Seven full runs were made: **three before the fix, one of which failed**; four after, all green. That
is not proof that the race is gone -- one observation of a rare event is not a rate -- and the
finding says so rather than claiming a fix it cannot demonstrate.

### Acceptance

| gate | result |
| --- | --- |
| the reproduction | 1 of 3 full runs, 13 assertions, `status 0` with empty output |
| the guard | both exits print through `writeSync`; a verdict cannot be truncated by its own exit |
| the deriver | `verdict(` is a diagnostic call; the site kept `check-doc-counts: FAILED` |
| the retry | the silent shape is retried once and fails if it repeats |
| the runs | **4 consecutive full runs green** after the fix, against 1 failure in 3 before |
| the meta-gate | **46 gates, 46 caught, 0 survived**; hollowing `check-doc-counts.mjs` turns **54** tests red |
| `core` / repo | **182 / 4457** · **186 / 4644** |

## Finding 242 — RE3's second blocker, and a mechanism that is an absence

Two rounds ago RE3 had two independent reasons to write nothing: it needs traces, and it selects on
`category === 'code'` with none in the corpus. The first was fixed when the cart case got spans
(finding 240). This round removes the second.

### The fifth case

`history-unhandled-exception-export`, from `code-unhandled-exception-export`. Its mechanism is an
**absence**: the worker's CSV writer throws on an embedded newline, the exception escapes the
worker's own handler, and no nack is ever sent -- so the broker sees a closed connection, the job is
never retried, and a dead job looks like a finished one.

That shapes all four layers:

| layer | what it had to be |
| --- | --- |
| process | the sentence about **what the broker saw** (`the connection close rather than a nack`), because the causal step *is* the missing signal |
| evidence | **split deliberately** -- the only number the text states (3% failures) is a metric checkpoint, and the mechanism exists only as a log line, so the second checkpoint is a quotation with `== 1 count` |
| fault | the exception and its trigger in one clause, because that clause is the whole fault |
| entity | `export-worker`, added to the graph with an edge to the topic it publishes to |

**No span, and that is printed rather than hidden**: the text gives a consequence and no duration, and
a span without a duration would be a number nobody wrote. So RE3 writes the case with exactly one
data-less file -- its `traces.csv` -- and the line says so.

```
check-fault-cases: coverage rcaeval-re1 ready · rcaeval-re2 ready · rcaeval-re3 ready
check-fault-cases: export RE1 5 case(s) written, 0 file(s) with no rows · RE2 5 case(s) written, 7 file(s) with no rows · RE3 1 case(s) written, 1 file(s) with no rows, 4 skipped
check-fault-cases: OK (5 of 30 ...; floor 5)
```

`RE3 0 case(s) written, 4 skipped` had been that line's tail for three rounds.

### What this round did not find

No defect in the code. What it produced instead was **three counts that had to be moved by hand** --
`4 of 30` became `5 of 30`, `entity filled 11` became `12`, and `RE2 ... 6 file(s)` became `7` -- and
each one failed a test until it was updated. That is the pinning working exactly as intended, and it
is also the cost of pinning: **every annotated case edits three assertions in two files**, and a
round that forgot one would be caught, which is the point.

### The 3% now exists in three places

`fault.parameters.failureShare: 0.03`, the checkpoint's `value: 3` with `unit: '%'`, and the series'
`post: 3`. Nothing ties them together, and nothing would notice if one drifted. They are three
statements of one fact in three vocabularies -- a probability, a percentage, and a series value --
and the honest description is that the corpus has no mechanism for "the same number, said twice".

### Acceptance

| gate | result |
| --- | --- |
| the corpus | **5 of 30**, floor 5; the first code-level case |
| the graph | twelve entities, eight edges; `export-worker` calls the topic it publishes to |
| the export | RE1 5 / 0 data-less; RE2 5 / 7; **RE3 1 written, 1 data-less, 4 skipped** |
| the layers | one metric checkpoint and one log checkpoint, because the mechanism has no number |
| the assertions moved | three counts, each caught by a failing test rather than by memory |
| the meta-gate | **46 gates, 46 caught, 0 survived**; hollowing the guard turns **104** tests red in 1 of 2 naming files |
| `core` / repo | **182 / 4458** · **186 / 4645** |

## Finding 243 — eight of eleven checkpoints name a signal that does not exist

The evidence layer has a `signalRef`, and it is the only field tying a checkpoint to telemetry. Every
round so far has checked that a checkpoint's `entityRef` resolves -- G2 does that -- and **nothing has
ever resolved `signalRef`**. Counted for the first time:

```
check-fault-cases: checkpoints 3 of 11 signal reference(s) resolve to a declared series; 3 of 3 inequality(ies) are false at the post value
```

| case | checkpoint | `signalRef` | the series it declares |
| --- | --- | --- | --- |
| checkout | `cp-cpu-limit` | `container_spec_cpu_quota` | `container_cpu_throttled_seconds_total` |
| checkout | `cp-throttled-counters` | `container_cpu_cfs_throttled_seconds_total` | `container_cpu_throttled_seconds_total` |
| checkout | `cp-p99` | **null** | `request_duration_p99_ms` |
| cart | `cp-client-span` | `client_span_duration` | `client_span_duration_ms` |
| cart | `cp-server-handler` | `server_side_handler_time` | `server_handler_time_ms` |
| kafka | `cp-lag` | `kafka_consumergroup_lag` | **the same name** |
| kafka | `cp-processing-tripled` | `per_message_processing_time` | `per_message_processing_seconds` |
| ledger | `cp-watermark` | `broker_disk_watermark_percent` | **the same name** |
| ledger | `cp-buffer` | `producer_buffer_records` | **the same name** |
| export | `cp-failure-ratio` | `export_failure_ratio` | `export_failure_ratio_percent` |
| export | `cp-typeerror-line` | `unhandled_type_error_log` | none: it is a log line |

Three resolve -- `cp-lag`, `cp-watermark`, `cp-buffer` -- and **eight do not**, by a suffix, by a
plural, by a synonym, or by naming nothing at all. **Each of them reads correctly**, which is why five rounds of review did not see it: the failure
mode is a reference that is plausible rather than absent.

**One row of this table was written wrong.** The first draft listed `cp-buffer` as a mismatch --
`producer_record_buffer` against `producer_buffer_records` -- because it was typed from memory, and a
synonym is exactly what four of the real mismatches look like. The printed number said three
references resolve and the table showed two, and that disagreement is what caught it: **the count and
the table were two statements of one fact, and one of them was checked by a machine.**

### And the three that resolve are false at their own value

`cp-lag` asserts `> 4200000` against a series whose post value is 4200000. `cp-watermark` asserts
`> 92` against 92. `cp-buffer` asserts `> 40000` against 40000. A checkpoint that its own telemetry
fails is worse than a dangling reference, because a reader who resolves the name still gets a
contradiction -- and the annotation was written with the value copied from the text rather than from
the series.

### Why this round measures and does not repair

Two of the eleven are not series references at all, and a rule written without them would be wrong:

- `cp-processing-tripled` names a **ratio** (3x) whose series carries seconds (0.06s), so "the series
  must satisfy the checkpoint" is false for it by construction -- the checkpoint is derived from the
  series, not equal to it;
- `cp-cpu-limit` names a **configuration fact** (a 500m quota), which no telemetry series carries.

So the repair needs a vocabulary the corpus does not have: a checkpoint says whether it is *about* a
series, *derived from* one, or *stated by* one and carried nowhere. That is a schema decision, and
this round's contribution is the number that makes it urgent rather than hypothetical.

### Acceptance

| gate | result |
| --- | --- |
| the measurement | **3 of 11** references resolve; **3 of 3** evaluable inequalities are false |
| the table | every mismatch named, with the series it should have named |
| the printout | a third line on every guard run, pinned by two tests |
| the empty case | `0 of 0` rather than a division, asserted |
| the meta-gate | **46 gates, 46 caught, 0 survived**; hollowing the guard turns **108** tests red in 1 of 2 naming files |
| `core` / repo | **182 / 4460** · **186 / 4647** |

## Finding 244 — the reference had four meanings, and the guard could only compare one

Finding 243 measured the problem: eight of eleven checkpoints named a series that did not exist, and
the three that resolved were false under their own comparator. This round repairs it, and the repair
is a vocabulary rather than a rename, because **one optional string was carrying four different
things**:

| `signalKind` | the reference is | what the guard can check |
| --- | --- | --- |
| `series` (default) | a metric the bundle declares | resolves; unit agrees; the assertion holds at the post value |
| `derived` | a metric the value is computed from | resolves only -- a ratio of two durations is not equal to one of them |
| `configuration` | a fact about how the system was configured | resolves to *nothing* telemetry-shaped: naming a series is a modelling error |
| `log` | a declared log line, by id | resolves to a line id the declaration carries |

`CHECKPOINT_REFERENCES` is a published vocabulary in `ir/types.ts`, referenced by the schema with
`z.enum(...)` and documented in the data-model table -- so `check-data-model-vocabularies` now covers
six sets instead of five, and the field cannot be re-spelled anywhere.

### What the corpus had to change

Nine references were repointed or repaired:

- four were a suffix or a plural away (`client_span_duration` → `client_span_duration_ms`,
  `server_side_handler_time` → `server_handler_time_ms`, `export_failure_ratio` →
  `export_failure_ratio_percent`, `container_cpu_cfs_throttled_seconds_total` →
  `container_cpu_throttled_seconds_total`);
- `cp-p99` had no reference at all and now names its series;
- `cp-processing-tripled` is `derived` -- the ratio is 3x and the series carries seconds, so the
  guard would have rejected the correct annotation had it compared them;
- `cp-cpu-limit` is `configuration` -- a 500m quota that no telemetry carries;
- `cp-typeerror-line` is `log`, and log lines now carry an `id` so a checkpoint can name one;
- five comparators became `>=`, because `>` against a value equal to the post is false.

```
check-fault-cases: checkpoints 11 of 11 reference(s) resolve by kind (9 to a series); 0 of 8 comparable assertion(s) fail on the series' own post value
```

### Two defects this round, one of them mine by construction

**1. `configuration` refs cannot be compared, and the first version tried.** The unit check ran
before the `derived` short-circuit, so `cp-processing-tripled` was refused for being "in `1` but the
series is in `s`" -- which is the whole point of a derived value. The check moved behind the
short-circuit.

**2. The guard grew a membership test that the schema had already made unreachable.** With
`signalKind` an enum in the schema, an unknown value fails the parse (exit 1) before the guard sees
the checkpoint, so `CHECKPOINT_REFERENCES.includes(kind)` could not fire. Deleted, and the test now
asserts the parse failure instead -- **one owner for one vocabulary**, which is what
`check-data-model-vocabularies` exists to protect.

### What this round did not do

The values themselves are still copied: `cp-watermark` asserts `>= 92` and the series' post is 92,
and both are transcriptions of the same sentence. The guard now proves they agree, which is the most
it can do -- **it cannot tell whether 92 is the right number, only that two files say it**.

### Acceptance

| gate | result |
| --- | --- |
| the vocabulary | `CHECKPOINT_REFERENCES` published, schema-referenced, documented; six sets checked |
| the rules | one per kind, each refused by its own test: undeclared series, unit mismatch, a false assertion, a configuration that names a series, an unmatched log id, a checkpoint with no reference |
| the corpus | **11 of 11** references resolve by kind; **0 of 8** comparable assertions fail |
| the log ids | a log line without one is refused, because nothing can reference it |
| the meta-gate | **46 gates, 46 caught, 0 survived**; hollowing the guard turns **122** tests red in 1 of 2 naming files |
| `core` / repo | **182 / 4467** · **186 / 4654** |

## Finding 245 — the arithmetic was in the number, so nothing could check it

Finding 244 left this open in as many words: "a `derived` reference names one source and not the
arithmetic". The corpus's only derived checkpoint was the demonstration:

```json
{ "checkpointId": "cp-processing-tripled", "signalKind": "derived",
  "signalRef": "per_message_processing_seconds", "comparator": "==", "value": 3, "unit": "1" }
```

The series it named carries `baseline: 0.02, post: 0.06` seconds. The `3` is `0.06 / 0.02`, and
nothing in the annotation says so. The guard could resolve the reference and then had to stop: it
could not compare a ratio with a duration, so it compared nothing. **Two derived checkpoints could
name the same series with different arithmetic and both would pass**, which makes `derived` a label
rather than a claim.

### The repair is to make the arithmetic part of the annotation and evaluate it

`EvidenceCheckpoint.expression` is a small arithmetic language, and it **replaces** `signalRef` for a
derived checkpoint rather than sitting beside it -- the expression *is* the reference, and a
checkpoint that named one series and computed over another would be two statements of which one is
silently not the one being checked:

```
expression := term (('+' | '-') term)*
term       := unary (('*' | '/') unary)*
unary      := '-' unary | primary
primary    := number | reference | '(' expression ')'
reference  := identifier '.' point          -- point ∈ SERIES_POINTS
```

Twelve lines of grammar, because every operator is one the guard must evaluate the way the annotator
meant, and `fault/expression.ts` evaluates rather than `eval`s. `SERIES_POINTS` (`baseline`, `post`)
is a tuple the parser reads, so the grammar has no second list of point names.

**Units are symbol-exponent pairs**: `*` and `/` add and subtract exponents, `+` and `-` require the
same unit on both sides. That is what rejects `900 ms - 11 s`, and it is not dimensional analysis --
`%` and `1` are different symbols here, as are `1 min` and `60 s`. A unit the grammar cannot read is
refused as unsupported rather than read as dimensionless, because a unit this module cannot multiply
is a unit whose arithmetic it cannot check.

**The comparison is tolerant at `1e-9` relative**, and this is not politeness: `0.06 / 0.02` is
`2.9999999999999996`, so an exact `==` would have rejected the annotation that is right. The
tolerance makes a difference inside it *equal* for every comparator -- `>=` holds on a value one ulp
low, `>` does not -- so no comparator is stricter than the data can be.

### The corpus

`cp-processing-tripled` now states `per_message_processing_seconds.post /
per_message_processing_seconds.baseline` and computes 3. The cart case gains the corpus's second
derived checkpoint, and its first *difference*:

```json
{ "checkpointId": "cp-network-overhead", "signalKind": "derived",
  "expression": "client_span_duration_ms.post - server_handler_time_ms.post",
  "comparator": "==", "value": 889, "unit": "ms" }
```

900 ms minus 11 ms is the part of the delay neither process accounts for, and both operands are
already declared with the sentences that state them -- the checkpoint adds arithmetic, not a new
claim about the world. It is also the first use of the `+`/`-` unit rule: both sides are `ms`, and
the result is `ms`.

```
check-fault-cases: checkpoints 12 of 12 reference(s) resolve by kind (10 over a series, 2 of them computed from 4 reading(s)); 0 of 10 comparable assertion(s) fail against the series they name
```

### Five defects, and two of them were found by the new check

**1. The unit algebra caught the test I wrote for it.** The first division-by-zero test was
`client_span_duration_ms.post / (client_span_duration_ms.post - 900)`. It never reached the division:
`ms - 1` is a unit mismatch, and the guard said so. A bare number is dimensionless here, which is the
whole reason `900 ms - 11 s` is not 889 of anything.

**2. The number leaf's refusal was unreachable.** `primary` tested the first character before calling
`numberNode`, so the "this is not a number" throw inside `numberNode` could not fire for any input --
a refusal, in the parser, that no text could produce. The two leaves now answer `undefined` and
`primary` owns the one refusal message that lists the alternatives.

**3. The counts line was printed only on success.** `0 of 10 comparable assertion(s) fail` is implied
by exit 0, so on a green run it was a decoration and on a red run it was absent -- the numbers that
say *how much of the corpus is actually being checked* vanished exactly when something was wrong with
it. `logCheckpointCounts()` now runs on both exits, and a run with one failing assertion of ten says
`1 of 10` before it says which one.

**4. The test that meant to prove a wrong value is refused passed for the wrong reason.** `cp-p99` is
a `>=` threshold; `4120 >= 4100` holds, so the scratch corpus accepted the "wrong" value and the test
saw exit 0. The comparator is now stated by the fixture rather than inherited from the checkpoint it
edited -- and the fact that it took a real run to see this is the argument for writing the test before
believing the guard.

**5. Every parse failure was reported as `does not parse: [`.** `String(error.message).split('\n')[0]`
on a zod issue list is the opening bracket; the field, the path and the reason were on the lines that
got dropped. That was survivable while refusals were missing strings and stopped being survivable the
moment the schema grew a biconditional whose message *is* the diagnosis. `describeSchemaFailure`
composes `path: message`, one line, and the guard prints it.

### What this does not prove

The expression is checkable; **its choice is not**. `post / baseline` and `baseline / post` both
compute, and only the annotation says which describes the fault. What the guard now establishes is
narrower and stronger than before: the number beside a derived checkpoint is the number that
checkpoint's own arithmetic produces from the readings it names. Whether `889` is the right way to
say "the delay was on the wire" is still a reading of the incident, and the corpus's job is to state
it where a reviewer can disagree.

### Acceptance

| gate | result |
| --- | --- |
| the field | `expression` present exactly when `signalKind` is `derived`; both halves refused by a test, one at the schema and one at the guard |
| the grammar | 35 tests over precedence, associativity, unary minus, every leaf, every refusal, and the depth limit |
| the units | symbol algebra with a documented limit; `ms - s` and an unreadable unit both refused |
| the tolerance | `0.06 / 0.02 == 3` holds, `3.0000001 == 3` does not; relative, so `1e9` and `1e9 + 1` are not equal |
| the corpus | **12 of 12** references resolve by kind; **0 of 10** comparable assertions fail; 2 derived over 4 readings |
| the parse message | `path: message` instead of `[`; six tests, one through a real schema |
| the counts | printed on both exits; a failure of one in ten says `1 of 10` |
| the meta-gate | **46 gates, 46 caught, 0 survived**; hollowing the guard turns **144** tests red in 1 of 2 naming files |
| `core` / repo | **184 / 4530** · **188 / 4717**; coverage 99.97 / 99.76 / 100 / 99.97, and 100 x4 on both new modules |

## Finding 246 — the algebra had a stricter opinion about units than the package did

Finding 245 gave a derived checkpoint an expression language, and gave that language a unit algebra
whose rule for `+` and `-` was "the two sides must be the same unit". The rule was implemented as
*the same spelling*:

```ts
if (!sameUnit(left.unit, right.unit)) throw new Unreadable({ kind: 'unitMismatch', ... });
```

So `900 ms - 0.9 s` was refused, and the refusal was written into a test as though it were a
property: `'+' joins 'ms' and 's', which are not the same unit`. **The test encoded the defect.** A
conversion the repository can do was being reported as a mistake in the annotation.

The package already knew the factors. `util/unit.ts` holds `UNITS` as exact rationals against a
per-dimension base -- `ns us ms s min h`, `By KiBy MiBy GiBy`, `rps QPS TPS`, `1 %`, `count` -- with
`convertUnit`, `isConvertible` and `dimensionOf`, and it is what G2 asks when it decides whether a
checkpoint's unit exists at all. `fault/expression.ts` did not read it. **Two opinions about units in
one package, and the newer one was stricter than the one everything else trusts.**

### The repair

`+` and `-` now admit three cases:

| case | rule | example |
| --- | --- | --- |
| the same map | add directly | `889 ms + 11 ms` |
| two *atomic* units `isConvertible` accepts | convert the right operand into the left one's unit, then add | `900 ms - 0.9 s` = `0 ms`, `50 % + 0.2` = `70 %` |
| anything else | a mismatch, naming both dimensions when the table knows both | `900 ms - 11 count` |

The result keeps the **left** operand's unit. Converting to a canonical base instead would render
`1 min + 30 s` as `90 s` -- the same quantity and not the same sentence -- and the author wrote the
left one first.

`*` and `/` still do not convert. `1 s * 500 ms` is a composite (`s·ms`) by construction, and making
composites dimensional would have to decide what they *render* as after an addition; a rendering
nobody wrote is worse than a refusal. And **compound units still compare structurally**: `MiB/s` and
`KiB/s` are different units here even though a conversion exists. That limit is now the only one, and
it is stated in the module comment rather than discovered by the next annotator.

### The defect inside the repair, and it is the same one as last round's

Dimensionless is an *empty* symbol map, and the first version of `atomicSymbol` returned `undefined`
for it -- so `50 % + 0.2` was a mismatch between a ratio and nothing, even though `util/unit.ts`
lists `1` in the `ratio` dimension beside `%`. Dimensionless is the symbol `1`, because that is what
it is called and what the renderer prints.

Then the shape of the function itself: `if (unit.size !== 1) return undefined` followed by
destructuring produced a bound check the compiler demands and no input can reach -- the same
unreachable refusal that finding 245 deleted from the number leaf. Rewritten as a counted loop whose
every branch is reachable: empty is `1`, one entry to the first power is that symbol, one entry with
another exponent or two entries are `undefined`.

### What this does not change

The corpus. Both derived checkpoints are `ms` over `ms` and `s` over `s`, so nothing in
`golden-master/` moved; the change is visible only where a conversion is needed, and the guard test
that used to assert the refusal now asserts the arithmetic: `4.3 s + 11 min == 664,300 ms` through
the corpus guard, end to end.

### Acceptance

| gate | result |
| --- | --- |
| conversion | `900 ms - 0.9 s` = `0 ms`; `1 min + 30 s` = `1.5 min`; `50 % + 0.2 1` = `70 %` |
| refusal | `ms - count` names both dimensions; `MiB/s + KiB/s` names neither and is still refused |
| the table | one authority: the factors come from `util/unit.ts`, the same module G2 asks |
| reachability | every branch of `atomicSymbol` is taken by a test; the bound check that no input could reach is gone |
| the guard | `4.3 s + 11 min == 664300 ms` accepted end to end, `0 of 2` comparable assertions fail |
| `core` / repo | **184 / 4535** · **188 / 4722**; coverage 99.97 / 99.76 / 100 / 99.97 |
| the meta-gate | **46 gates, 46 caught, 0 survived** |

## Finding 247 — a configuration reference resolved to nothing, and the rule was negative

Finding 244 gave `EvidenceCheckpoint.signalKind` four members and one rule per member. Three of those
rules are positive -- a series reference must resolve to a declared series, a `log` reference to a
declared line `id`, a `derived` one to the readings its expression names. The fourth was:

> `configuration`: the value is a fact about how the system was configured, which no telemetry
> carries, and naming a series by the same name is a modelling error.

That is a rule about what the reference must *not* be. The corpus's only configuration checkpoint
then did what a negative rule permits:

```json
{ "checkpointId": "cp-cpu-limit", "signalKind": "configuration",
  "signalRef": "container_spec_cpu_quota", "comparator": ">=", "value": 0.5, "unit": "1" }
```

`container_spec_cpu_quota` is a plausible cAdvisor metric name. Nothing in the case declares it, no
series carries it, and the check could only ask whether a string looked telemetry-shaped. The number
`0.5` was transcribed from the incident's "500m" -- **in a different unit, by a division nothing
recorded** -- while `fault.parameters.limitMillicores: 500` sat in the same file, three lines away,
unread.

### The repair: cite the case's own declaration

A configuration checkpoint's `signalRef` now names a key of `fault.parameters`, and the guard
compares the checkpoint against what that key holds. The case declares:

```json
"parameters": { "container": "checkout-api-app", "cpuLimit": { "value": 500, "unit": "mcore" } }
```

and the checkpoint cites `cpuLimit` with `== 500 mcore`. The comparison is `compareExactly`, and the
unit rules are:

| the parameter | the checkpoint | result |
| --- | --- | --- |
| a quantity in `mcore` | a quantity in `mcore` | compared as written |
| a quantity in `mcore` | a quantity in `core` | converted through `util/unit.ts`, then compared |
| a quantity in `mcore` | no unit | refused: the parameter has a unit and the checkpoint does not say so |
| a bare number | a unit | refused: the unit is a claim nothing in the file can check |
| a string | anything numeric | refused: `container == 'x'` restates the parameter, and the parameter is already there |

`readDeclaredQuantity` (`ir/parameters.ts`) is the boundary that decides whether a value is a
quantity at all: a number is one with no unit, `{ value, unit? }` is one with, and a boolean, an
array, a nested object without `value`, a non-finite number or a blank unit is not. It lives in `core`
rather than in the guard because a rule only a script can exercise is a rule whose tests are all
subprocess spawns.

### A unit the table could not state, and why it is its own dimension

The incident says "pinned at its 500m limit", and `util/unit.ts` had no way to write `500m` -- which
is *why* the annotation had divided by 1000 into a bare ratio. The table gains a `cores` dimension
with `core` and `mcore` (1/1000, exact). It is a separate dimension rather than a second spelling of
`count`, because a table that let them convert would add a restart count to a CPU quota and report a
number.

### Three copies of four operators, reduced to one

Comparing a checkpoint with its data was already implemented twice: the guard had a ternary chain for
a series' post value and this module had a switch for a computed one. The configuration branch needed
a third. `compareExactly` is now the only implementation, and `holdsWithTolerance` is
`compareExactly` plus the tolerance branch -- which is what the tolerance always was: a correction for
values the package computed, not for literals a person wrote. `499.9999999` against a declared `500`
is a mistake, and the tolerant comparison would have accepted it (the tolerance is `5e-7` there).

### What this still does not prove

That the parameter is the configuration the run actually had. The parameter is tied to the incident
text only through the fault layer's quote, so if the annotation's `500m` is wrong, the checkpoint and
the parameter are wrong together and agree. What changed is that **there is no longer a second,
independent number that could disagree in silence**: the checkpoint's value is now derived from the
case's own statement, and the unit travels with it instead of being reintroduced by hand.

### Acceptance

| gate | result |
| --- | --- |
| the reference | names a key of `fault.parameters`; a key it does not declare is refused and the message lists the ones it does |
| the value | `== 600` against a declared `500 mcore` is refused, and the message says which |
| the unit | `core` is converted (`500 mcore == 0.5 core`); `s` is refused as not convertible; a unit beside a unitless parameter is refused |
| the corpus | `cp-cpu-limit` cites `cpuLimit`; comparable assertions **10 → 11**, failures 0 |
| the table | `cores`/`mcore` added with an exact 1/1000 factor and its own dimension |
| the comparison | one implementation: `compareExactly`; `holdsWithTolerance` is it plus the tolerance |
| `core` / repo | **185 / 4556** · **189 / 4743**; coverage 99.97 / 99.76 / 100 / 99.97 |
| tests | 8 over `readDeclaredQuantity`, 8 over the guard's configuration rules, 6 over `cores`/`mcore`, 1 over `compareExactly` |

## Finding 248 — the corpus's first fault that is not in the application

The sixth case is `history-config-ingress-timeout-partner-portal`, and it is the first whose
`FaultCategory` is `config` and whose root cause is outside every process the text names:

> Partner portal uploads began failing with 504 for files over 5MB, immediately after an ingress
> change. The annotation that sets the upstream read timeout was written as 1s where the previous
> value was 600s, and the upload handler needs about eight seconds. Nothing in the application
> changed and its own logs show the work completing. Restoring the annotation to 600s fixed every
> failure.

### What the four layers had to say, and why each is where it is

| layer | quote | why there |
| --- | --- | --- |
| entity | "Partner portal uploads began failing with 504 for files over 5MB" | the service the failures are reported against, and the size threshold that scopes them |
| fault | "The annotation that sets the upstream read timeout was written as 1s where the previous value was 600s" | the change itself, in both its value and the value it replaced |
| process | "its own logs show the work completing" | what the application did while the ingress refused -- the sentence that turns a 504 into a timeout rather than a crash |
| evidence | "the upload handler needs about eight seconds" | the duration the 1s has to be compared with |

The graph grows by two entities, and one of them is the corpus's first `external`:
`service:partner-portal` and `external:public-ingress`, with the ingress `calls` the service. The
root cause is the *service*, because that is what an operator names; the ingress is the mechanism the
chain passes through, and it is therefore the entity the configuration checkpoint sits on.

The evidence layer is four checkpoints and no more, because the text gives four facts: the timeout
(1s, a configuration fact cited from `fault.parameters.upstreamReadTimeout`), the failures (504s
began), the handler's need (8s, unchanged), and the log line showing the work finishing. The
previous timeout of 600s is declared as a parameter and deliberately **not** a checkpoint: the case
did not run under it, so a checkpoint asserting it would be asserting history.

### The number the text does not give

"How many 504s" is never stated. The series is `baseline: 0, post: 1` and the checkpoint asserts
`>= 1`, so the annotation says *that* failures happened rather than pretending to measure a rate
nobody measured. The `why` in the signals file says exactly that, because a reviewer who reads
`post: 1` as a count of the incident's failures would be reading a floor as a measurement.

### A defect this case had to route around, and cannot yet fix

The obvious shape for "a count that starts at zero" is `derivation: 'counter'`. Expanding it reveals
that `expandSeries` gives a counter's *pre-window* samples `baseline + 0.1 * index`:

| index | 0 | 1 | 2 | 3 |
| --- | --- | --- | --- | --- |
| pre-window, baseline 0 | 0 | 0.1 | 0.2 | 0.3 |

For a baseline of 0 that is a series which was **already accumulating before the onset** -- four
hundredths of a 504 per sample, in a text that says uploads *began* failing. The same formula gives
`12, 12.1, 12.2, 12.3` for the throttling counter, where the text does say the counters "climbed the
whole time", so the increment looks like an attempt to keep a baseline from being degenerate and is
wrong exactly where the baseline is zero.

The case therefore uses `step`, which is what the text describes: it was not happening, then it was.
The expansion itself is **not repaired here**, and the reason is a property of this repository's
standards rather than of the fix: the expansion lives inside `scripts/check-fault-cases.mjs`, and
nothing observes the values it produces -- the guard prints counts of files and checkpoints, not
samples. A change to it would be a change no test could disagree with. The repair is to move the
expansion into `core` where a test can hold the pre-window to its baseline, and that is a round of
its own; this one records the numbers and leaves the item open.

### Acceptance

| gate | result |
| --- | --- |
| the corpus | **6 of 30** samples carry a four-layer case; floor 6 |
| the layers | one source per layer, each quoted verbatim; the process layer is the application's behaviour rather than the failure |
| the graph | 14 entities / 9 edges, and the corpus's first `external` |
| the checkpoints | **16 of 16** resolve by kind -- 12 over a series, 2 computed from 4 readings, 2 citing a declared configuration fact; **0 of 14** comparable assertions fail |
| the exports | RE1 6 cases, 0 files with no rows; RE2 6 cases, 8 files with no rows; RE3 1 case written, 1 file with no rows, 5 skipped |
| the baselines | both place `partner-portal` inside top-K, so G4 holds with two solvers |
| `core` / repo | **185 / 4556** · **189 / 4743**; coverage 99.97 / 99.76 / 100 / 99.97 |

## Finding 249 — the arithmetic nobody could observe, and a counter that was already running

A `*.signals.json` file declares what a case's telemetry says: a baseline reading, a post-onset
reading, and the sentence both come from. The samples are constructed -- and that construction lived
in `scripts/check-fault-cases.mjs`, where **nothing printed it**. The guard reports counts of files,
checkpoints and comparable assertions; it never prints a sample. So the expansion was a piece of
arithmetic with no reader: every value it produced was used to decide G3 and G4, and no test could
disagree with any of it.

The first line of it yields the second half of this finding:

```js
const value = counter ? baseline + index * 0.1 : baseline * (1 + JITTER[index] * 0.02);
```

A counter's pre-window samples were written `baseline + 0.1 * index`. For the throttling counter
(baseline 12) that is `12, 12.1, 12.2, 12.3`, which the incident's own words support ("the counters
climbed the whole time"). For the consumer-lag counter, whose baseline is **0**, it is
`0, 0.1, 0.2, 0.3` -- **lag before the incident, in a text that says the lag began at it**. The
increment is an attempt to keep a baseline from being degenerate, and it is wrong exactly where the
baseline is zero.

It survived four annotation rounds because nothing observed the numbers. Finding 248 found it by
needing a counter, deciding the shape it produced was a claim the text did not make, and using `step`
instead -- reading the code, not running anything.

### The repair: the expansion is a module, and the pre-window is flat

`fault/derived-telemetry.ts` holds `expandSeries`, `expandLog` and `expandTraces`, the closed
`SERIES_DERIVATIONS` vocabulary the guard used to keep for itself, and the constants that decide
cadence and offsets. A counter's pre-window is now its baseline, which is what "this counter had
accumulated this much by the start of the window" means; the post-window still accumulates in equal
steps and its last sample is exactly the declared `post`.

The values are asserted directly, which is the whole point:

| declaration | pre-window | post-window |
| --- | --- | --- |
| `step`, 100 → 300 | `100, 102, 98, 101, 99, 101.6, 98.4, 100.6` | `300, 306, 294, 303, 297, 304.8, 295.2, 301.8` |
| `counter`, 12 → 96 | `12, 12, 12, 12, 12, 12, 12, 12` | `22.5, 33, 43.5, 54, 64.5, 75, 85.5, 96` |
| `counter`, 0 → 1 | `0, 0, 0, 0, 0, 0, 0, 0` | `0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1` |
| `spike`, 12 → 900 | jittered around 12 | `900`, then jittered around 12 |

### A property that could not be tested while the code lived in a script

`expandTraces` derives span ids from `sha256(caseId)` -- finding 240's repair, which replaced a
twelve-character *prefix* of the case id because two cases agreeing that far would have produced the
same span ids and one case's trace would have pointed into the other's. That repair had no test,
because the function was unreachable from the suite. It has one now: two case ids that agree for
twelve characters produce different ids, asserted rather than described.

### The consequence the fix exposed

The negative-control fixture for G4's two-solver requirement changed its answer. Its root cause
carries a spike and its pod carries the throttling counter; with the counter's pre-window flat, that
counter's baseline has no spread at all, the `epsilon` floor turns its rise into an enormous z, and
the *pod* (`checkout-api-0`, a different `service.name`) now outranks the service. Peak-z places the
root cause second instead of first. The case is still refused, and for the reason the test is about
-- the robust ranking places it fourth of four -- but the number moved, and it moved because a claim
the expansion used to invent was removed.

### Acceptance

| gate | result |
| --- | --- |
| the module | `expandSeries`, `expandLog`, `expandTraces`, `SERIES_DERIVATIONS`, and the cadence constants, all exported and enumerated |
| the fix | a counter's pre-window is flat at its baseline; `0 → 1` no longer accumulates before the onset |
| the arithmetic | 19 tests, every one asserting written-out numbers rather than recomputed ones |
| the ids | two case ids agreeing for twelve characters produce different span ids |
| the guard | still green, and now reads the vocabulary and the expansion from `core` instead of owning them |
| `core` / repo | **186 / 4578** · **190 / 4765**; coverage 99.97 / 99.76 / 100 / 99.97, and 100 x4 on the new module |
| the meta-gate | **46 gates, 46 caught, 0 survived** |

## Finding 250 — the first dependency case, the control that names an absence, and two cases refused

The seventh case is `history-dependency-upstream-5xx-pricing`: the first `dependency` category, and
the first whose root cause is not a component of the system at all.

> The pricing service returned 502 on 60% of requests for 18 minutes. Every failure is an upstream
> tax-calculation call answering 503; the pricing service's own error rate against all other
> dependencies is zero. The tax provider's status page shows a degradation window that matches
> exactly. Nothing in the pricing service's own resources moved.

### The annotation's whole job is to separate the two sentences

"What failed" and "why" are in the same paragraph and every naive annotation collapses them. Each
layer is chosen to keep them apart:

| layer | quote | what it separates |
| --- | --- | --- |
| entity | "Every failure is an upstream tax-calculation call answering 503" | the dependency, not the service that reported the failures |
| fault | "The tax provider's status page shows a degradation window that matches exactly" | the fault as the provider states it, with a window that lines up rather than merely precedes |
| process | "The pricing service returned 502 on 60% of requests for 18 minutes" | what the system did with the upstream's answers |
| evidence | "the pricing service's own error rate against all other dependencies is zero" | the control |

### The evidence layer is a pair plus a control, and the control is a zero

Three series, and the third is the one nobody would think to annotate:

| series | reading | role |
| --- | --- | --- |
| `http_502_ratio_percent` on `pricing-service` | 0 → 60 % | the symptom |
| `tax_calculation_503_ratio_percent` on `tax-calculation` | 0 → 60 % | the cause, with the same share because "every failure" of a 60 % rate is 60 % |
| `other_dependency_error_ratio_percent` on `pricing-service` | 0 → 0 | the control: `== 0 %` |

A checkpoint asserting a value **equal to zero** is the corpus's first assertion of an absence, and
without it the case would be satisfied by "the pricing service is broken". With it, the annotation
names the other dependencies as part of what it claims -- which is what the sentence does.

The injection's own share is also a checkpoint: `fault.parameters.sharePercent` is `60 %`, and
`cp-declared-share` asserts it as a configuration fact. So the number in the parameters and the
number in the telemetry have to agree rather than being two statements nobody compares. What this
does **not** do is derive one from the other: `post` is still written by hand, and a `signals`
declaration that could say `post: { parameter: 'sharePercent' }` is an idea, not a mechanism.

### Two candidate cases this round refused, and why

Both are `runtime` samples, and both are refused for a reason the corpus's model states rather than
because they are bad incidents:

- **`runtime-pod-kill-user-profile`** turns on "during which every request 503'd" -- a share of
  exactly 1. The expansion applies a ±2 % jitter to every level reading, so that series would report
  1.02: **a 102 % share**, which no system can produce. Using a count instead ("a 503 happened")
  would be true and weaker than the text. The fix is a declaration that says a series has no sampling
  noise, and inventing that field for one case is the kind of thing this log keeps recording as a
  mistake; so the case waits.
- **`runtime-container-crash-loop-media`** turns on "restarted 178 times in 12 hours". The cadence is
  ninety seconds and the window is the samples, so declaring `post: 178` would compress twelve hours
  of restarts into the twelve minutes the post-window covers, and declaring the restarts in a
  forty-minute window instead would invent a number the text does not give. The case needs a cadence
  that follows the window, which is a model change rather than an annotation.

Both refusals are recorded as open items with their arithmetic, because a corpus that only records
what it accepted cannot say what it cannot express.

### Acceptance

| gate | result |
| --- | --- |
| the corpus | **7 of 30** samples carry a four-layer case; floor 7 |
| the graph | 16 entities / 10 edges; the second `external`, and the first root cause that is one |
| the checkpoints | **20 of 20** resolve by kind -- 15 series, 2 computed from 4 readings, 3 configuration; **0 of 18** comparable assertions fail |
| the exports | RE1 7 cases, 0 empty files; RE2 7 cases, 9 empty files; RE3 1 case, 1 empty, 6 skipped |
| the baselines | both place `tax-calculation` inside top-K |
| `core` / repo | **186 / 4580** · **190 / 4767**; coverage 99.97 / 99.76 / 100 / 99.97 |

## Finding 251 — the samples did not span the window, so `post` was not the reading at its end

Finding 250 refused a case rather than annotate it badly: `runtime-container-crash-loop-media` turns on
"restarted 178 times in 12 hours", and with eight samples ninety seconds apart the whole series covered
twelve minutes. Declaring `post: 178` would have said that 178 restarts happened in the first twelve
minutes of the post-window; declaring the restarts in a forty-minute window would have invented a
number the text does not give.

The cause was in the expansion, and it was older than the case: **the cadence was a constant**
(`SERIES_STEP_MS = 90_000`) and the window only decided where the first sample landed. Every series in
the corpus therefore described the same twelve minutes whatever window it declared, and the two ends of
the window -- which is what `baseline` and `post` name -- were not where the samples were:

| | before | after |
| --- | --- | --- |
| pre-side | eight samples from the window start, ninety seconds apart | eight samples from the window start, spread across `(onset - start) / 8` |
| post-side | eight samples from the onset, ninety seconds apart | eight samples ending on the window end, spaced `(end - onset) / 8` |
| `post` means | the level after the onset | the reading at the end of the window |
| a twenty-minute post-window | twelve minutes of it are represented | all twenty |

`SERIES_STEP_MS` is gone. The count is fixed at eight per side and the spacing is derived, so a
declaration now means what it says: `baseline` is the reading at the start and `post` the reading at the
end.

### A refusal that became unreachable, and was deleted rather than kept

The old loop carried `if (timestamp >= onsetMs) break;`. It existed because a constant cadence could
run past the onset; with the spacing derived from the span, the eighth pre-onset sample lands at
seven eighths of the span and **no input can reach the break**. It is gone, and the test that used to
demonstrate it now demonstrates the property instead: however short the pre-window, all eight samples
are strictly before the fault.

### What it costs, and what it did not change

Every corpus case's post-window samples moved apart: a twenty-minute post-window now steps 150
seconds where it stepped 90. The **values** are unchanged -- the jitter cycle, the counter's
accumulation and the spike's excursion are all functions of the index, not of the timestamp -- so both
baselines rank the same services and G3 and G4 are unaffected. What changed is what the timestamps
mean, which is the point.

### The case the refusal was blocking

`history-runtime-container-crash-loop-media` is the corpus's eighth case and its first `runtime` one,
and its window is the text's own: twelve hours, eight samples a side, the counter accumulating to 178
by the end. The evidence layer is the count the text gives and a probe ratio at exactly zero -- "no
probe ever passes" -- which is also the sentence that rules the liveness probe out as the cause.

### Acceptance

| gate | result |
| --- | --- |
| the expansion | spacing derived per side; `post` lands on the window end; `SERIES_STEP_MS` deleted |
| the tests | the twenty-one assertions hold with the new timestamps, including a twelve-hour window whose last sample is the declared 178 at the window end |
| the guard | **8 of 30**; **23 of 23** references resolve by kind; **0 of 20** comparable assertions fail; RE1 8 / 0 empty, RE2 8 / 10, RE3 1 / 1 / 7 skipped |
| the baselines | both place the root cause in top-K for every case, including the new one |
| `core` / repo | **186 / 4580** · **190 / 4767**; coverage 99.97 / 99.76 / 100 / 99.97 |

## Finding 252 — a share of 102 %, and a fixture that had been lying for three rounds

Finding 250 refused `runtime-pod-kill-user-profile` for a reason that had nothing to do with the
incident: its symptom is "during which every request 503'd", a share of exactly **1**, and the
expansion applies ±2 % of sampling noise to every level reading. A share of 1 with that noise is
`1.02` -- **a 102 % share**, which no system can produce. The annotation could not fix it either:
anything at or below `0.98` understates the sentence.

### The repair has two halves, and they are different rules

`util/unit.ts` now states the range a reading can occupy, beside the conversion factors that are
already there:

| unit | range | why |
| --- | --- | --- |
| `1` | `[0, 1]` | a share is a fraction of a whole |
| `%` | `[0, 100]` | same dimension, different scale -- the ceiling is **per unit**, not per dimension |
| `ms`, `s`, `count`, `By`, `rps`, `core`, `mcore` | `[0, ∞)` | every unit here counts something, and none of them is signed |

- **A declared reading out of range is refused**, by the guard, with the point, the metric, the unit
  and the range in the message. `post: 120` in `%` is a bad annotation, and a bad annotation belongs
  in a refusal rather than in a clamp.
- **A derived sample out of range is clamped**, in the expansion, at the one place where noise is
  applied. At a bound the noise becomes one-sided, which is not a compromise but the correct model: a
  measurement at 100 % has nothing above it to be noisy about.

A counter is not clamped, and that is deliberate. Its samples are exact totals -- `baseline`, then its
increments -- and clamping an exact total would silently rewrite the declaration's own arithmetic.

### What the rule found in a test fixture, before it was ever asked about the corpus

The negative control for G4's two-solver requirement declares four services, one of them a load
generator whose `request_rate_rps` goes 100 → 300 **in unit `1`**. That is a rate declared in the
dimensionless ratio unit, and every unit rule the corpus had passed it, because `1` is a published
unit and nothing asked what a reading *in* it can be.

The bounds rule asked, found that 100 is not a share, and the clamp then flattened the series to 1 --
so the fixture stopped being a negative control and the case was accepted. The failure surfaced as
`expected 'is not solvable by both baselines'`, one layer away from its cause, which is how a
modelling error usually arrives. The unit is now `rps`, and the fixture is the same negative control
it was written to be, with `peak-z-by-service=2, median-shift-by-service=4` -- the numbers finding 251
left behind.

### The ninth case

`history-runtime-pod-kill-user-profile` is the corpus's ninth case and its second `runtime` one. The
text's four sentences separate cleanly, and the separation is the point:

| layer | quote | why |
| --- | --- | --- |
| entity | "The user-profile pod was terminated without a shutdown hook at 14:07" | the thing that stopped |
| fault | "this was the kubelet acting on an eviction decision made for a different workload on the same node" | the cause, outside the application entirely |
| process | "a fresh one took 40 seconds to become ready, during which every request 503'd" | the propagation: one replica, no readiness, every request failed |
| evidence | "Node conditions were healthy and memory was well under the limit" | the control that rules out the node and the pod's own memory |

Three series: `http_503_ratio` 0 → **1** (the reading this round made expressible),
`pod_ready_after_start_seconds` 0 → 40 s, and `node_condition_ready` 1 → 1 on `worker-3` -- a
condition that never moved, and whose checkpoint `== 1` holds only because the clamp keeps a healthy
reading at its own ceiling rather than at 1.02. The graph grows to 22 entities / 14 edges, with
`node:worker-3` `hosts` the pod: the corpus's first node, and the first causal chain that starts
above the workload it breaks.

### The absence the corpus still cannot state

The text's last sentence is *"No application exception was logged because the process never got to
handle a signal."* That is evidence, and it is evidence of **nothing happening**. A `log` checkpoint
names a declared line and asserts something about its body, so the corpus can say a line exists and
cannot say no line exists. Annotating it would mean declaring a log line that the text does not
contain, which is the one thing the guard refuses outright. It is recorded as an open item.

### Acceptance

| gate | result |
| --- | --- |
| the bounds | `1 → [0,1]`, `% → [0,100]`, everything else `[0, ∞)`; unknown units have none and are left alone |
| the clamp | a share of 1 reads `1, 1, 0.98, 1, ...`, never above 1; a `%` series at 99 → 100 clamps its pre-window's `+2 %` arm too |
| the refusal | `post 1.2` in `1` and `baseline -1` in `ms` both refused, with the range in the message; `MiB/s` gets no bounds because the table has none |
| the fixture | the load generator's rate moved from `1` to `rps`; the negative control reproduces its own numbers |
| the corpus | **9 of 30**; **26 of 26** references resolve by kind (20 series, 2 computed from 4 readings, 3 configuration); **0 of 23** comparable assertions fail; 22 entities / 14 edges |
| the exports | RE1 9 cases / 0 empty, RE2 9 / 12, RE3 1 / 1 / 8 skipped |
| `core` / repo | **186 / 4590** · **190 / 4777**; coverage 99.97 / 99.76 / 100 / 99.97 |
| the meta-gate | **46 gates, 46 caught, 0 survived** |
