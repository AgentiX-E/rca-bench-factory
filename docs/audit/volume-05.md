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
