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
