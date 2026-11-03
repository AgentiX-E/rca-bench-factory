## v3.34 — the slice that admits code faults only was scoring a resource fault at 1.00

v3.33 ended with a contradiction it deliberately did not fix: the enumeration gate compared
`roundTripped` against `declared`, so every case the target refuses by contract counted as an unnamed gap,
while the skip paragraph above it said such a case "is not a pass and not a failure". The finding left the
decision open and asked for "a fixture corpus whose target refuses a case".

Looking for that fixture found something upstream of it: the runner **could not produce a refusal at all**,
and the reason is a defect of its own.

### One: the fallback that became an override

```js
...(entry.suite === 'RE3' ? { faultCategory: 'code' } : {}),
```

The fallback exists for a real problem — RE3's directories label the fault by an index (`f1`…`f5`), and
`inferFaultCategory('f1')` is `unknown`, correctly, so without the suite's statement every RE3 case is
refused (finding 268). But it was applied to **every** RE3 case alike. Measured on a corpus holding one case:

```
ROUNDTRIP PASS   1/1 RE3-TT/ts-order-service_cpu/1  target=rcaeval-re3  oracle=1.00 signals=82
```

A CPU fault, scored 1.00, inside the one slice whose published rule admits code-level faults only. The
contract the target exists to enforce was waived by the script that invokes it, and the waiver printed
nothing. That is worse than the contradiction v3.33 found: a contradiction at least fails loudly once
something reaches it.

### Two: the name now wins, in both directions

```js
...(entry.suite === 'RE3' && inferFaultCategory(entry.faultType) === 'unknown'
  ? { faultCategory: 'code' }
  : {}),
```

| corpus | before | after |
| --- | --- | --- |
| `RE3-OB/emailservice_f1/1` (label is an index) | `PASS … oracle=1.00` | `PASS … oracle=1.00` — finding 268 holds |
| `RE3-OB/emailservice_cpu/1` (label is `cpu`) | `PASS … oracle=1.00` | `SKIP … reason=RE3 targets code-level faults only` |

The refusal is not a new mechanism: `exportRcaEval` already wrote it into `ExportOutcome.skipped`, the field
whose doc comment says a caller taking only `files` "scores a population it cannot name". The round trip took
only `files`.

### Three: which made v3.33's branch reachable, and it failed

```
ROUNDTRIP FAILED
ROUNDTRIP   - 1 case(s) declared but 0 round-tripped, and no finding names the difference
```

There was no gap. There was one case, named, with the exporter's sentence beside it. So the decision v3.33
left open is settled on the weaker branch: **a refusal the exporter names is accounted for**, and the gate
takes the reason from `exported.skipped` rather than inferring it from a report that came back empty.

The arithmetic moved out of the script into `score/roundtrip-account.ts` (7 tests), because the branch
cannot be taken on purpose — every path that drops a case records a failure first, so there is no input to
write for the path that does not. What the module can be tested on is the sum, the sentence and the gap. The
equality is also printed on the passing path now, which is new:

```
ROUNDTRIP ACCOUNTED 735 = 735 round-tripped + 0 refused by contract
```

### Four: three reversions, and two of them changed nothing

Each edit was reverted on its own, against the 61-test round-trip file:

| reverted edit | effect |
| --- | --- |
| the category fallback (unconditional again) | **2 tests fail** |
| the gate's equality (`roundTripped === declared`) | **2 tests fail** |
| `allowEmptyReason` restored on the per-case call | **61 pass** |
| `skipped = report.caseCount === 0` (refusal not read) | **61 pass** |

The last two are cleanups, not repairs, and this round counts them as cleanups. What they change is who may
testify: `'the round trip names the single target under test'` is a statement about the **other eight**
targets, and accepting it for this one let `status` read `skipped` for an exporter that had written nothing;
`refusal` replaces "the report looks empty" with "the exporter named this case". Neither moves a byte on any
corpus this repository ships — which is precisely why they were measured rather than argued.

### Five: which corpus the fix is for

The correction changes no verdict on the shipped slice, and that is a measurement rather than a hedge.
RE3's ninety case directories label their fault with an index — `f1`…`f5`, plus one
`ts-route-service_f3_1` — and `inferFaultCategory` is `unknown` for every spelling of that form, so the
fallback still fires for every case there. What changed is the handling of a corpus whose directories do
name a category, which is what `--official-dir` lets an operator point at.

That is also why the defect survived four rounds of reading this file: on every corpus it had been run
against, the unconditional fallback and the correct answer were the same value.

### Readings

> Ledger for `v3.34`.

| item | value |
| --- | --- |
| `core` test suite | **217 files, 5388 tests passed** (as of `22c7eb2`) |
| `cli` test suite | **4 files, 187 tests passed** (as of `22c7eb2`) |
| repo test suite | **221 files, 5575 tests passed** (as of `22c7eb2`) |
| new module | `score/roundtrip-account.ts` — 7 tests, 1 runtime export, 2 types |
| new round-trip cases | **3** (`refuses a resource fault…`, `adds the two halves…`, `prints the accounting on a run that refuses nothing`) |
| RE3 resource fault, before → after | `PASS oracle=1.00` → `SKIP, reason=RE3 targets code-level faults only` |
| enumeration gate | `roundTripped === declared` → `roundTripped + refused === declared`, printed on every run |
| failure sites | **99** across 52 of 70 scripts; **92 proved, 7 exempt** (was 93 / 6) |
| audits | 1–**343**, **340 findings** (absent: 118, 132–133) |
| progress volumes | **9** (this one, now 14 rounds: v3.21–v3.34) |

### Left open

- **The shipped RCAEval corpus's RE3 categories are unmeasured.** All 735 cases round-trip and nothing here
  says what their categories are; the fix's evidence is a two-case fixture, and it establishes that the
  runner would have accepted a resource fault at 1.00, not that the corpus contains one.
  `[open: the corpus's own fault categories are not in any reading this repository takes]`
- **The two cleanups in this round have no test that distinguishes them.** Both revert green. They are
  justified by what they make impossible, not by a reading.
  `[open: a change whose justification is "who may testify" cannot be falsified by an output that is byte-identical either way]`

### Unchanged

The corpus, the answer keys, the checkpoints, the published localisation readings (rank 1: 48 of 60), the
round trip's three target contracts (375 / 270 / 90), the export, the pool's price and every budget the plan
enforces. This round moved one verdict on one synthetic corpus and one row of the site ledger.

## v3.35 — the corpus has eleven fault types and this repository could name six

v3.34 ended with the sentence that had been the gap for two rounds: *all 735 cases round-trip, and no reading
here says what their categories are.* This round took that reading, and the answer is not the one the
sentence assumed — the corpus does not merely have categories this repository had not counted, it has
**135 cases whose category this repository could not name at all**.

### One: the reading, and why it is cheap

Nine archives, 5 161 758 943 bytes, ~38 GB extracted. Every question about *labels* is answered by a zip's
central directory — a contiguous block at the end of the file, 24–139 KB per archive — so
`scripts/read-remote-index.mjs` reads all nine lists for **1 190 358 bytes, 0.023 % of the corpus, in 63
seconds**. The reader is a range request, a backwards scan for the end-of-central-directory signature, and a
fixed-count parse; anything that does not parse is an error rather than an empty list, because an empty list
would read as a corpus with no cases.

Two host facts are in the finding rather than in a comment: the host answers `403` to Node's default
`User-Agent` and `206` to an agent that names itself (measured over five strings), and none of the nine
archives needs zip64 — so that path is refused by name instead of shipped untested.

### Two: what it found

`GROUP BY category` over the 735 cases, before anything changed:

```
resource 360, network 240, unknown 135
```

The 135 are two families, and the corpus names both in its own paper §3.2, quoted in `corpus-fault-taxonomy.ts`:

| family | cases | the corpus calls it |
| --- | --- | --- |
| `socket` | 45 | the fourth **resource** fault (`stress-ng`, inside the container) |
| `f1`…`f5`, `f3_1` | 90 | the five **code-level** faults, each with its own name |

So the code-level slice was not one fault called "code": it is **five distinct faults**, and the pipeline
could not tell `f4` (incorrect *return values*) from `f1` (incorrect *parameter values*) — which is the axis
the next phase of this campaign is about.

### Three: a table that may only add

`fault/corpus-fault-taxonomy.ts` holds the eleven rows and reads a label in two steps, in this order and
never the other:

```
inferFaultCategory(type) !== 'unknown'  ->  it decides; the table only supplies the name
inferFaultCategory(type) === 'unknown'  ->  the table decides
```

The direction is a test, not a comment ("never contradicts the classifier where the classifier speaks"). The
census counts which reading ran per row, so `classifier 600 / taxonomy 135 / unknown 0` is printed rather than
asserted.

`fault/corpus-census.ts` groups a declared set by suite, category and fault type and prints it. It reports
three things a count cannot: which reading named each fault, the tokens **no** reading names, and the
directories that carry a case's marker file and are **not** cases.

### Four: the 736th directory

Walking for `inject_time.txt` gives 736 directories for a corpus the README calls 735 cases. The extra one is
`RE2-OB/checkoutservice_cpu/multi-source-data/` — a run component that is not a number, a `.DS_Store`, and a
sibling `multi-source-data.zip`. `parseRcaEvalPath` has always refused it because the instance must be digits,
so every round trip reports 735: **right by a rule nobody had written down**, and invisible, because 736
rounds to 736. The census prints it by path and `golden-master/corpus-census.json` records it.

### Five: the runner is narrower, and the difference is one case

```js
// before (v3.34)                              // after (v3.35)
entry.suite === 'RE3'                          inferFaultCategory(entry.faultType) === 'unknown'
  && inferFaultCategory(...) === 'unknown'       && corpusFault.category !== 'unknown'
  ? { faultCategory: 'code' }                    ? { faultCategory: corpusFault.category }
```

Identical on the shipped corpus — every RE3 label is a taxonomy token — and different on a corpus whose RE3
label is neither a category nor a token. Measured on a one-case corpus labelled `zzz`:

```
ROUNDTRIP SKIP   1/1 RE3-OB/emailservice_zzz/1  reason=RE3 targets code-level faults only
CENSUS unnameable 1 case(s): zzz (1)
ROUNDTRIP ACCOUNTED 1 = 0 round-tripped + 1 refused by contract
```

v3.34 stamped that case `code` and scored it. The new line stamps nothing, and the refusal travels as a skip
the ledger can see. One test (`refuses a case whose fault label nothing here can name`) is the difference.

### Six: a starvation budget, measured rather than assumed

`background-telemetry.test.ts` reported `Test timed out in 5000ms` on one of its four corpus checks during
this round's first full-suite run: 226 files, four workers on a four-CPU quota, every test passing. The check
costs **364 ms** standalone and **5 002 ms** in that run. That is not work; it is scheduling, and the file
already had the shape that makes it happen — four `spawnSync` calls to `check-fault-cases.mjs`.

The remedy is the one `timeout-budget.test.ts`'s second arm prescribes rather than a smaller fixture: a suite
budget of `30_000`, stated once for the file, with the measurement recorded in that gate's table. No assertion
changed.

### Readings

> Ledger for `v3.35`.

| item | value |
| --- | --- |
| `core` test suite | **222 files, 5456 tests passed** (as of `ff0cb10`) |
| `cli` test suite | **4 files, 187 tests passed** (as of `ff0cb10`) |
| repo test suite | **226 files, 5643 tests passed** (as of `ff0cb10`) |
| new modules | `fault/corpus-fault-taxonomy.ts` (3 runtime exports, 2 types), `fault/corpus-census.ts` (2 runtime exports, 4 types) |
| new scripts | `scripts/read-remote-index.mjs`, `scripts/census-corpus.mjs` |
| new tests | **62** across five files, plus 2 round-trip cases |
| corpus census, before → after | `resource 360, network 240, unknown 135` → `resource 405, network 240, code 90` |
| fault types named | 6 of 11 → **11 of 11** (12 tokens including `f3_1`) |
| the corpus, as bytes | **735 cases** from **1 190 358 of 5 161 758 943 bytes** (0.023 %) |
| directories that are not cases | **1**, named by path |
| failure sites | **103** across 54 of 72 scripts; **103 proved, 0 unannotated** (was 99 / 52 of 70) |
| audits | 1–**345**, **342 findings** (absent: 118, 132–133) |
| progress volumes | **9** (this one, now 15 rounds: v3.21–v3.35) |

### Left open

- **The taxonomy's names are transcribed from a paper, not measured from the archives.** The *tokens* are read
  off nine central directories; the *names* — "Incorrect Return Values" for `f4` — come from §3.2 and one
  worked example in the corpus's own notebook, which is the strongest source that exists for them.
  `[open: nothing in the corpus states f4's human name in a file; a reader has to trust the citation]`
- **`socket` is named by the taxonomy and still `unknown` to the classifier.** That is deliberate — they answer
  different questions — but it means a user-written slug containing "socket" is still `unknown`, and the
  census's 11-of-11 is a statement about the corpus.
  `[open: two vocabularies now exist and only one of them reads the corpus]`

### Unchanged

The corpus, the answer keys, the checkpoints, the localisation readings (rank 1: 48 of 60), the round trip's
three target contracts (375 / 270 / 90), the export, the pool's price, and every budget the plan enforces.
This round moved one refusal on one synthetic corpus, added a reading, and added four failure sites.

## v3.36 — the table reached two call sites, and the product's front door was not one of them

v3.35 ended by naming its own next item: the five code-level names reach the census and no target. Measuring
that claim turned up something better than a missing name — **the category itself reached two call sites**,
and every other way into the product never asked the table at all.

### One: three measurements on the library's own surface

```
parseFaultSpec({ type: 'socket' }, 'historical').spec.category   ->  unknown
parseFaultSpec({ type: 'f1'     }, 'historical').spec.category   ->  unknown
parseFaultSpec({ type: 'f3_1'   }, 'historical').spec.category   ->  unknown
```

The classifier's answers are right — these tokens carry no category word — and that is exactly why the hole
was invisible: every reading this tree takes agreed with every other reading, and the answer was `unknown`
each time. An RE3 slice pointed at `ingestPrimeDataset` arrives as `unknown`, the code-level target refuses
the whole slice (finding 268's shape), and the caller's way through is to restate the corpus's table by hand.

### Two: `undefined` is the contract

`readCorpusCategory(type) -> FaultCategory | undefined` returns the table's claim **only** where the
classifier was silent. `describeCorpusFault` answers in every case, so a caller that wants a value for a
schema has to restate the direction rule to know whether it may use it — and a restated rule is where the
second reading starts. The helper makes the restatement impossible.

`ingest/prime.ts` is now `c.faultCategory ?? readCorpusCategory(c.faultType)` and hands the result to
`parseFaultSpec`. A descriptor that states a category still wins, even against the table, because a
descriptor may describe a corpus this table has never read.

### Three: the spelling the normaliser eats

`normalizeFaultType('f3_1')` is `f3-1`, and the stem rule requires a number after an **underscore** — so a
caller that normalised first would lose the one label that needs the rule most. `prime` asks about the raw
label; the test asserts `{ type: 'f3-1', category: 'code' }`, both halves at once.

### Four: the call site that restated the rule stops

`scripts/check-official.mjs` carried its own copy as a conditional spread. With the rule in one home the copy
is deleted — and the deletion is the measurement: **84** assertions across the round-trip and census files
pass without it, including the `zzz` case that must stay unstamped.

### Readings

> Ledger for `v3.36`.

| item | value |
| --- | --- |
| `core` test suite | **222 files, 5463 tests passed** (as of `cd913df`) |
| `cli` test suite | **4 files, 187 tests passed** (as of `cd913df`) |
| repo test suite | **226 files, 5650 tests passed** (as of `cd913df`) |
| `socket` / `f1` / `f3_1` through the ingest path | `unknown` → **`resource` / `code` / `code`** |
| a descriptor's stated category | still wins, including against the table |
| a label neither reading names (`zzz`) | still `unknown` |
| the runner's own copy of the rule | **deleted**; 84 assertions unchanged |
| new tests | **7** (4 on `readCorpusCategory`, 3 on the ingest fallback) |
| the published corpus | unchanged — no verdict moves |

### Left open

- **The five names still have no consumer.** "Incorrect Return Values" is read out of the paper and printed by
  the census; no target receives it. This round gave the *category* a third consumer.
  `[open: nothing exports a fault's name, so a target that wanted one has nothing to read]`
- **`provedBy` still records mention rather than drive** — carried since v3.32, and now one site narrower
  because deleting the spread retired the line it pointed at.
  `[open: the deriver cannot see a call made from a fixture table]`

### Unchanged

The corpus, the answer keys, the checkpoints, the localisation readings, the round trip's three target
contracts (375 / 270 / 90), the export, the pool's price, and every budget the plan enforces.

## v3.37 — a term any sentence satisfies, and a record that disagreed with its own score

v3.36 closed by naming its own next item: the five code-level **names** reach the census and no target. Going
to measure that turned up two defects in the one term that does read a fault *description*, and the answer to
the item itself.

### One: the word `the` scored a perfect Final_A

AIOps2025's TA carries the same weight as localisation (`0.4`). `keywordHit` read "keyword" as "any token
longer than two characters", and the fixture's description is `CPU saturation on the order service`, whose
tokens include `the`.

| reason | TA before | Final_A before | Final_A after |
| --- | --- | --- | --- |
| the correct sentence | 1 | 100 | 100 |
| a sentence that names the fault | 1 | 100 | 100 |
| `the` | 1 | **100** | **60** |
| `and` | 0 | 60 | 60 |

A keyword is now a **content word**: a closed-class list of function words is filtered out, and the
description is split on punctuation as well as whitespace -- so a description ending in a full stop no longer
carries a final token nothing could match. Both directions are pinned by a test each, and the direction of
each is stated: filtering can only remove credit the fault did not put there, and punctuation-splitting can
only revive a content word that was dead.

### Two: the record said "miss" where the score said 0.4

The case record's four facets are the formula's four terms in order, so `reason` **is** TA. It was built from
the generic predicate, whose `reason` case is exact string equality -- right for OpenRCA, where the reason is
the answer, wrong here. One case, two verdicts:

```
reason = "a cpu saturation event, per the pod metrics"
  ta      = 1        (0.4 of the score)
  facet   = false    (reported as a miss)
```

The fix answers that one facet from the `ta` value already computed, and leaves every other facet on the
shared predicate. The mutation harness could not have caught it, because it judges `degraded` from the score.

### Three: the budget table could not see the file, then could not read it

A full run reported `reader-against-backend.test.ts` at `Test timed out in 5000ms`. Measured: **9 620 ms**
standalone, longest test 2 083 ms, eleven tests that each start a server and wait for it to stop. The file was
not in `STANDALONE_MS` -- the gate checks the rows it has and cannot discover one it does not -- and when the
row was added, `statedBudgets` read `{ timeout: SUITE_BUDGET_MS }` as *no budget*, so the gate named the fixed
file a violator. That is the third false red from that reader and the first where the missing spelling was the
one a suite-scoped budget should use; the fix is a fourth spelling through one `constantValue`.

### Four: the names have no consumer because the corpus's metric is localisation-only

Measured off `OFFICIAL_METRICS`: four of nine targets score a fault string (`openrca-2.0`, `rca100`,
`aiops2025` through TA, `cloud-opsbench`), all four against a field their own dataset supplies, and none has a
field for a name. The three targets that score this corpus -- `rcaeval-re1/-re2/-re3` -- score **`ranks`
alone**: AC@k over service names, no type term. So the item closes as "no target needs it", and the boundary is
pinned by three tests rather than argued: the paper's name does not read back as a token, no two tokens share a
name, no name is a token.

### Five: the record disagreed with itself, and the gate that would have said so refused instead

`measure-doc-counts --write-doc` would not run, and the reason was not this round: v3.35's Readings block
claimed **5472** core tests while v3.36's claimed **5463**, in a document where every round adds tests. One of
the two blocks had been rewritten by an earlier `--write-doc` while it still carried the current-state marker.
Both are now anchored to their own commits with the numbers their commits published (`5456` and `5463`), and
the arithmetic is monotonic again. The gate behaved correctly -- it refused rather than picking one.

### Readings

> Ledger for `v3.37`.

| item | value |
| --- | --- |
| `core` test suite | **222 files, 5472 tests passed** (as of `40be73f`) |
| `cli` test suite | **4 files, 187 tests passed** (as of `40be73f`) |
| repo test suite | **226 files, 5659 tests passed** (as of `40be73f`) |
| `reason = "the"` | TA 1 → **0**, Final_A 100 → **60** |
| a punctuated description | its last word is now readable, and `the` is still refused |
| the `reason` facet vs the `ta` term | one predicate; was exact equality against containment |
| `reader-against-backend.test.ts` | 9 620 ms, now in `STANDALONE_MS` with a 30 000 ms suite budget |
| the budget reader's spellings | 3 → **4**, the fourth a name inside an options object |
| new tests | **9** across four files -- 4 in `official.test.ts`, 3 in `corpus-fault-taxonomy.test.ts`, 1 in `timeout-budget.test.ts`, 1 in `aiops2025-evaluator.test.ts`, plus one golden test rewritten in place |
| targets that score a fault string | **4 of 9**, none of them a corpus name |
| the corpus's own metric | `ranks` only — AC@k, no type term |
| the published corpus | unchanged — no verdict moves |

### Left open

- **The embedding fallback is still missing**, and the gap is unchanged: a paraphrase sharing no word with the
  description scores 0 where the protocol would fall back.
  `[open: needs a model and a threshold the paper does not state]`
- **A key whose description carries no keyword scores 0.** The protocol is silent; this repository records the
  choice as raw gap rather than redistributing 0.4 over the other terms.
  `[open: no published rule says what a key with no keyword is worth]`
- **One full run reported `battery-summary-survives-ci-output.test.ts` red**, with a message the dot reporter
  did not keep, and three subsequent full runs of the same bytes were green at 5 658. Recorded rather than
  explained; the reader this round fixed is a different file.
  `[open: one red, no message, not reproduced in three runs]`
- **`provedBy` still records mention rather than drive** — carried since v3.32, and this round moved no site.
  `[open: check-cli-reference.mjs:51 is driven from a fixture table, which the deriver reads as a literal and not as a call]`

### Unchanged

The corpus, the answer keys, the checkpoints, the localisation readings, the round trip's three target
contracts (375 / 270 / 90), the export, the pool's price, and every budget the plan enforces -- except the one
row this round added.

## v3.38 — a term that could exceed its own ceiling, and a keyword that was a letter

v3.37 closed with four open items, none of them a scoring defect. Going back to the file that produced that
round's two defects -- the AIOps2025 path in `score/official.ts` -- and asking the same question of the terms
it had not re-read found **four** more, all in the same four-line formula, and the answer to one of the open
items. Handling the documentation counts then produced two more: a test arm that formatted a failure as a
number, and a writer that reported writing nothing after writing.

The audit for this round is its own volume: `docs/audit/volume-10.md` (findings 351–356). Volume nine was at
267 928 of 280 000 bytes, twelve kilobytes short of the budget, so the split rule applied for the fifth time
in the log's life.

### One: a keyword was a substring, and `parameter` paid for `ram`

v3.37 decided *which* tokens of a description may be keywords. It did not decide how a token is looked for,
and the answer in the code was `String.prototype.includes`. Measured on a description `ram pressure on the
order service`:

| reason | TA before | TA after | Final_A before | Final_A after |
| --- | --- | --- | --- | --- |
| `ram stayed above 90%` | 1 | 1 | 100 | 100 |
| `the parameter changed` | **1** | **0** | **100** | **60** |
| `a program reconfiguration` | 1 | **0** | **100** | **60** |

`parameter` carries `ram` at positions 3–5. The term paid 0.4 for a reason that names nothing, twice over on
the same fixture. Both sides are now tokenised by one function and compared as sets; the control in the same
test asserts that `ram stayed above 90%` is still credited, so the repair is a narrowing and not a refusal.

### Two: the clause said both sides are cut to twenty characters, and one was

`cited` was sliced; `gt.evidence` was compared whole. An observation longer than the cut became unmatchable --
a submission quoting the answer key's own text scored zero:

| submission, key `order|cpu_usage|1234XYZ` (23 chars) | Exp. before | Exp. after |
| --- | --- | --- |
| the key's own string | **0** | **1** |
| the key's string plus a tail | **0** | **1** |
| a different tail inside the first twenty | 0 | 0 |

The existing test pinned this clause in both directions and could not see the defect, because its key is
*exactly* twenty characters -- the one length at which cutting one side and cutting both are the same
comparison. That is the hazard of a boundary test: the boundary has to be the subject, not the fixture.

### Three: `E_m` counted citations, so the score went past its own ceiling

`E_t` counts evidence points; `E_m` counted the agent's citations. A submission citing the key's only
observation five times scored `Exp. = 5` and **Final_A = 140** -- above 100, which the formula is bounded by
and which nothing in the report refused. Three of the four terms are rates in `[0, 1]`; this one was a ratio
with no upper bound on its numerator.

The numerator now counts distinct points rather than clamping at one: a clamp would print the right number
while leaving the two halves of the ratio counting different things, which is finding 348's defect one field
over. The three other callers of `rateOf` divide by a count of expected items in the same way and inherit the
same guarantee. No published reading moved, because no shipped prediction repeats a citation -- which is the
reason this was invisible, not a reason to keep it.

### Four: an empty component matched an empty key

`LA` is `pred.component === gt.component`, and `'' === ''` is true. A key line with no `service` (or, on a
pod-level line, no `instance`) and a submission that names nothing therefore compared equal, and localisation
paid 0.4 for two absences. The relaxation could not admit the empty string -- `alternatives` drops empty
endpoints when the key is read -- so the only missing half was the refusal. An unnamed key now names nothing.

### Five: the one red with no message left it in the arm that formats the failure

The open item said: one run red, message not kept by the dot reporter, three green runs of the same bytes.
Part of that is the reporter, and part of it was `runPython`'s failure arm. `spawnSync` reports a child that
never started and a child that was killed as `status: null` with both streams `null`, and the arm formatted
that as `python3 exited null: ` followed by nothing -- a failing assertion that states no reason. The arm now
separates "did not run" from "exited non-zero" and carries `result.error.message`, and the test drives it with
an interpreter that does not exist:

```
before:  /nonexistent/python3 exited null: undefined
after:   /nonexistent/python3 did not run: spawnSync /nonexistent/python3 ENOENT
```

The new test was proved by mutation: with the new arm disabled the test failed with the message in the first
line, and the file was restored byte for byte (sha256 compared). What this does **not** do is name why the
child failed to run in that one full-suite run -- `packages/core/vitest.config.ts` records the mechanism that
produces exactly this signature, and the worker cap is headroom against it rather than a proven repair.

### Six: the writer said nothing was written, after writing

Refreshing the published counts is the last step of every round, and this round it refused: a second
current-state row for `core`, which is true -- v3.38's ledger is current and v3.37's was, until now, also
marked as such. Fixing that meant anchoring the older block to its own commit, and measuring the writer on
the way through turned up its own defect.

`measure-doc-counts --write-doc` exists so that the snapshot and the document cannot be moved one at a time.
The write happened inside the loop that rewrote each document; the refusal came after the loop. So a run
with one duplicate row exited 1 and printed `nothing was written` **after** rewriting the three good rows --
the exact half-state the flag was built to remove, denied in the same breath:

```
before  core 160/3947, cli 4/187, repo 164/4134   + a duplicate core row
run     --write-doc  →  exit 1, "nothing was written"
after   core 1/5, cli 1/2, repo 2/7, duplicate kept, snapshot untouched
```

The rewritten text is now collected in a list and written only after every file has been accepted. The
message is unchanged, because the message was right and the code was not. The test that should have caught
this used a document with **no** rows -- where `nothing was written` is true for a reason that has nothing to
do with the refusal -- so the new case is a document that is rewritable *and* refused, and it asserts the
claim rather than the message: the file is compared byte for byte.

### Readings

> Ledger for `v3.38`.

| item | value |
| --- | --- |
| `core` test suite | **222 files, 5479 tests passed** (as of `f7d0fc2f7`) |
| `cli` test suite | **4 files, 187 tests passed** (as of `f7d0fc2f7`) |
| repo test suite | **226 files, 5666 tests passed** (as of `f7d0fc2f7`) |
| coverage, four dimensions | **99.96 / 99.75 / 100 / 99.96** — unchanged |
| `src/score` | **99.85 / 98.89 / 100 / 99.85**; `official.ts` 99.74 / 98.27 / 100 |
| `reason = "the"` | still 0 (v3.37's fix, unchanged by this round) |
| a keyword inside another word | TA 1 → **0**, Final_A 100 → **60** |
| an observation longer than twenty characters | Exp. 0 → **1**, quoted verbatim |
| one observation cited five times | Exp. 5 → **1**, Final_A **140 → 100** |
| an empty component against an empty key | LA 1 → **0** |
| new tests | **7** across four files -- 1 in `official.test.ts`, 4 in `aiops2025-evaluator.test.ts`, 1 in `battery-summary-survives-ci-output.test.ts`, 1 in `measure-doc-counts-write-doc.test.ts` |
| new audit volume | `docs/audit/volume-10.md`, findings **351–356**, 13 710 bytes |
| the published corpus | unchanged — no verdict moves |

### Left open

- **The embedding fallback is still missing.** Unchanged: a paraphrase sharing no word with the description
  scores 0 where the protocol would fall back.
  `[open: §4.4 names a fallback without a model or a cut-off, so fitting one would be a decision dressed as a transcription]`
- **A key whose description carries no keyword scores 0.** The protocol is silent; recorded as a gap rather
  than redistributing 0.4 over the other terms.
  `[open: the protocol prints the weights and the matching rule, and is silent on a description that yields no keyword]`
- **Why that one full-suite run had a child that did not start is still unexplained.** The message is no
  longer empty, and the next occurrence will carry its reason; the mechanism is recorded in
  `vitest.config.ts` as a memory-pressure kill, which the worker cap reduces without proving.
  `[open: the failure is diagnosable now, and still not diagnosed]`
- **`provedBy` still records mention rather than drive** — carried since v3.32, and this round moved no site.
  `[open: gates-are-testable.test.ts reaches that exit through its fixture table, and provedBy can name only one file]`

### Unchanged

The corpus, the answer keys, the checkpoints, the localisation readings, the round trip's three target
contracts (375 / 270 / 90), the export, the pool's price, the six other score targets, and every budget the
plan enforces. The AIOps2025 path changed in four places; nothing else in `src/` did.

## v3.39 — a proof that was a mention, and an arm that had never run

v3.38 closed with five open items. The one at the top was carried since v3.32 and had been re-stated
four times without moving: **`provedBy` records that a file mentions a gate, not that it reaches the
site.** This round stopped arguing about it and measured it, which took two hours of writing and two
minutes of running, and found two false claims out of ninety-six.

The audit is `docs/audit/volume-10.md`, findings **357–358**, appended to the volume opened last round.

### One: the question is an experiment, so it was run

Every failure site passes through `process.exit`. A `--require` hook replaces it in each descendant,
records the innermost frame that is a script under `scripts/`, and calls the original; the trace is
read back per claimant file.

| | before | after |
| --- | --- | --- |
| claims | 96 across 43 files | **100 across 44 files** |
| false | **2** | 0 |
| cost | — | 110 s, one vitest per claimant |

The two:

| site | published witness | what the hook saw |
| --- | --- | --- |
| `check-cli-reference.mjs:51` | `check-cli-reference.test.ts` | `…:301` only |
| `verify-scorer-stability.mjs:306` | `verify-scorer-stability-script.test.ts` | no line of that script at all |

### Two: both were repaired by producing the evidence, not by moving the label

Re-pointing the first claim would have made the inventory true and that file's own header false: it
said, from the day it was drafted, that `gates-are-testable.test.ts` "already covers this gate's first
exit". So the file now has a case that writes a reference with no command table and asserts the
refusal, and the header says why the duplication is deliberate -- one file proves the gate is *testable*,
the inventory names a witness for the *exit*. The hook now records line 51 in that file.

### Three: the stability gate's property arm had never executed

Six cases in `verify-scorer-stability-script.test.ts` all say *refuses*, and all six drive the gate
through a dataset `parseGoldenDataset` rejects. Every refusal was a **parser** refusal; the arm that
says `FAILED: N propert(y/ies)` -- "the scorer broke a property", a different repair -- had never run.
One sample reaches it: the mixed fixture answers the first sample correctly, so `samplesWithMisses` is
0 against a graded count of 1, and the check that requires them to differ has nothing to differ with.
Proved by mutation: with `failures.push` disabled the case fails on `expected +0 to be 1`.

### Four: the gate, and where it runs

`scripts/verify-site-proofs.mjs` runs the measurement for every claim and fails naming both halves --
the site that did not fire and the file that claimed it. The reading lives in `scripts/site-proofs.mjs`
(the hook, the parser, the per-file comparison) so that emptying the gate does not kill the reading,
which is why `gate-proofs.mjs` was split the same way.

| verdict | how it is produced |
| --- | --- |
| an unreadable inventory | `RCA_SITE_PROOFS_INVENTORY` at a path with no file |
| an inventory with no claim | a fixture whose sites are all exempt |
| a claim that did not fire | a fixture gate with two exits and a claimant that takes one |
| a claimant that could not be run | a claim naming a file deleted before the run |

Wired into `pnpm lint`, which the `verify` job runs. Measured cost on that job: 2.9 min of its 15
before, so the whole gate fits with room; the batteries job -- at 21.6 of 30 minutes -- was left alone
on purpose.

### Readings

> Ledger for `v3.39`.

| item | value |
| --- | --- |
| `core` test suite | **223 files, 5499 tests passed** (as of `de4b06c`) |
| `cli` test suite | **4 files, 187 tests passed** (as of `de4b06c`) |
| repo test suite | **227 files, 5686 tests passed** (as of `de4b06c`) |
| coverage, four dimensions | unchanged -- no file under `src/` was touched |
| new tests | **20** across three files -- 18 in `site-proofs.test.ts`, 1 in `check-cli-reference.test.ts`, 1 in `verify-scorer-stability-script.test.ts` |
| claims measured | **100 of 100** honoured, 44 files, 110 s |
| new failure sites | **4**, from the new gate, each proved by `site-proofs.test.ts` |
| new scripts | `scripts/site-proofs.mjs` (data), `scripts/verify-site-proofs.mjs` (gate) -- both registered |
| audit | `volume-10.md`, findings 351–358, 19 108 B |

### Left open

- **The embedding fallback is still missing**, and still for the same reason: the paper names no model
  and no threshold.
  `[open: v3.39 re-signed this without naming a model or a threshold -- §4.4 states the fallback and stops there]`
- **A key whose description carries no keyword scores 0.** Unchanged; recorded as a gap.
  `[open: no published rule prices a key whose description yields no keyword, so 0 is this tree's choice and not the protocol's]`
- **A claim is now measured, but only by running the whole claimant file.** A file whose own tests are
  red is reported as unmeasured rather than as wrong, which is honest and also means a flaky claimant
  can hide a false pointer for one round.
  `[open: the gate reports "unmeasured" and a reader has to re-run it]`
- **The batteries job was not given this gate.** It is at 21.6 of 30 minutes and two more minutes there
  would narrow a margin already flagged as shrinking; the verify job had 12 minutes spare.
  `[open: a per-step recording would have to be re-measured before the gate could move]`
- **Proving a claimant that spawns another gate** still reads as "did not fire" if the nested spawn
  inherits no trace variable -- the reason the hook is installed through `NODE_OPTIONS` rather than an
  explicit `env:` at each call site.
  `[open: an inherited-variable assumption, stated rather than tested]`

### Unchanged

The corpus, the answer keys, the checkpoints, the score targets, the export, the pool's price, and every
budget the plan enforces except the `verify` job's measured time. Nothing under `packages/*/src/` moved.

## v3.40 — the state that had no sentence, and the red file that gave no reason

v3.39 closed with five open items, two of them inside the instrument the round before had just built.
Both were open for the same reason: each is a place where the gate says something true and
insufficient. `provedBy` recorded mention rather than drive until v3.39 measured it; what survived was
a sentence in a header -- **descendants inherit `NODE_OPTIONS`** -- and a refusal that named no cause
-- **"did not pass, so its claims are unmeasured"**. Neither had a run behind it.

This round ran both. The inheritance held; the refusal did not.

The audit is `docs/audit/volume-10.md`, findings **359–360**.

### One: the fixture that contradicts the header took four lines

A helper between the test and the gate, spawning the gate with `env: { PATH: process.env.PATH }`. The
gate runs, exits 7, the helper prints the status -- and the trace file does not exist. The gate then
reports `scripts/gate.mjs:1 is claimed by …, which runs scripts/gate.mjs and never reaches this exit`,
which is false in the direction that matters: the pointer may be perfectly right and the *measurement*
was blind.

The header said the opposite, and the header was not wrong about what it described. It described the
case every claimant in this tree happens to be -- `env: { ...process.env }` -- and generalised it.

### Two: the observation moves to the parent, because the child has nothing left to report through

Anything the child could report through is the environment that was dropped. The parent is still
instrumented at the moment it calls `spawn`, so the hook now wraps `spawn`, `spawnSync`, `fork`,
`execFile`, `execFileSync` and `exec`, and for every child whose arguments name a script under
`scripts/` it appends one line: `spawn traced` or `spawn blind`.

The wrappers call the original and return its result. Three properties are asserted rather than
intended: a noted spawn still returns the child's own object, a spawn it cannot note still happens, and
the wrappers are only installed when a trace path exists, so the suite's own workers -- which exit and
spawn constantly -- are untouched.

### Three: three states, three sentences, and the third one is about the measurement

`unprovenClaims` grew a third branch, keyed on whether the run saw the script at all:

| trace of the claimed script | sentence | repair |
| --- | --- | --- |
| exit at the claimed line | nothing | -- |
| `spawn traced`, no such exit | "runs X and never reaches this exit" | the pointer or the test |
| `spawn blind`, no such exit | "started X in a child that did not carry the hook" | the measurement |

The distinction is load-bearing in both directions. Without the third sentence the gate accuses a
correct pointer; with it used loosely it would excuse every wrong one, so `blindScripts` counts a
script blind only when **no** spawn of it was traced -- one sighted child is enough to have seen it.

Measured over the 44 claimant files, same hook, no other change:

| | count |
| --- | --- |
| spawns of a `scripts/*.mjs` child | 905 |
| traced | **901** |
| blind | **4**, all four in `site-proofs.test.ts`, and all four are the fixtures this round wrote |

### Four: a red claimant now quotes itself

The gate already had the failing run's output in hand and printed only the verdict. `failureSummary`
keeps at most four lines -- two `FAIL` lines, the first error line, the totals -- and returns nothing
when a run died before printing a report, because a summary of output that describes no failure would
be a sentence nobody measured. The gate prints those lines under the refusal, with the command that
reproduces it. What changes is not the verdict but the number of round trips to the same fact.

### Readings

> Ledger for `v3.40`.

| item | value |
| --- | --- |
| `core` test suite | **223 files, 5511 tests passed** (as of `476fc71`) |
| `cli` test suite | **4 files, 187 tests passed** (as of `476fc71`) |
| repo test suite | **227 files, 5698 tests passed** (as of `476fc71`) |
| coverage, four dimensions | **99.96 / 99.75 / 100 / 99.96** -- unchanged; no file under `src/` was touched |
| new tests | **12**, all in `site-proofs.test.ts` (18 -> 30) |
| claims measured | **100 of 100** honoured, 44 files, 107 s |
| spawns measured | **905** recorded, **901** traced, **4** blind |
| failure sites | **107** across 55 scripts -- unchanged in number, four of them moved (81 -> 99, 91 -> 109, 102 -> 120, 201 -> 242) because the gate gained a helper |
| mutation | three, each caught: the blind branch removed (2 cases red), the spawn record disabled (3 red), the summary emptied (3 red); the file restored byte for byte each time (`e9d117f38808`) |

### Left open

- **The embedding fallback is still missing**, and still for the same reason: the paper names no model
  and no threshold, so fitting one would be a decision dressed as a transcription.
  `[open: §4.4 states the fallback and stops there, and a threshold invented here would be this tree's number wearing the protocol's name]`
- **A key whose description carries no keyword scores 0.** Unchanged; recorded as a gap.
  `[open: the protocol is silent about a description that yields no keyword, and this tree's choice to pay nothing is a choice]`
- **The per-site mutation pass, 6 min 28 s, is still not a CI step.** It is the difference between a
  witness that reaches a site and a witness that is *sensitive* to it, and it is the strongest check
  this repository has that no job runs.
  `[open: the batteries job is 21 of 30 minutes on a 22-step budget, so the pass needs a re-measured baseline before it can move]`
- **Blindness is observed one level deep.** The hook sees a child whose *parent* was instrumented. A
  grandchild started by an uninstrumented wrapper -- `pnpm exec node scripts/x.mjs` is the live case --
  is observed only if it inherits, and if it does not, nothing records that it existed.
  `[open: the record covers direct children only, and a wrapper's child appears only when that wrapper inherits]`
- **`failureSummary` reads one reporter's shape.** It was written against `--reporter=dot` as measured
  on this tree; a reporter change would leave the detail empty while the verdict stayed right.
  `[open: the extraction is pinned by fixtures built from the measured output, not by a contract vitest publishes]`

### Unchanged

The corpus, the answer keys, the checkpoints, the score targets, the export, the pool's price, and
every budget the plan enforces. Nothing under `packages/*/src/` moved. The gate's four verdicts and
its two-minute cost on the `verify` job are unchanged; only what it says about a run that could not
measure, and about a run that failed, is new.

## v3.41 — the other half of a proof: a witness can reach an exit and not mind it

P3 was the oldest item on v3.40's list -- open since v3.33, when the per-site pass was 93 sub-runs and
6 min 28 s, done by hand, with a ledger checked by eye at each revision. It asks a different question from
v3.39's. That one asked whether a claimant **reaches** the exit it names. This one asks whether it would
**mind** the exit's absence: a test that drives a gate, watches it fail and asserts nothing about the
failure reaches every exit the gate has, and would go on passing if the gate stopped failing altogether.
Every `provedBy` rests on reach, and reach is half a proof.

This round measured the other half: **105 claims, 45 files, 150 runs, 3.3 minutes, 0 survivors.**

### One: the mutant is a value, not an edit

The hand pass in v3.33 edited files -- replace one `process.exit(1)` with `0`, run the claimant, put it
back. That is also what `verify-gates-are-testable.mjs` does, and it needs a journal, a precondition
against measuring an already-mutated tree, a process-group kill and a restore check because **an edited
tree stays edited**: one measured accident left twelve scripts carrying the marker at once.

The hook already computes the frame that decides reach, so the mutant is one branch on top of it:
`RCA_HOLLOW_SITE` names one site, and from that frame the hook calls `process.exit(0)` instead of the code
the gate asked for. Not one byte of the tree changes, so the journal, the precondition, the restore and
the kill are all unnecessary -- what was never edited cannot be left behind.

Three properties are asserted rather than intended: only the named frame is replaced (a hook that
hollowed anything would turn every failure into success and every witness would look sensitive to
everything); the mutant run writes a trace too (see the third section); and nothing changes in a process
that did not load the hook.

### Two: measure first -- 8 min 54 s serial, 3 min 20 s at four

The cost is one baseline per file plus one run per claim. The baseline cannot be dropped: a claimant that
is red on its own would **catch** every mutant applied to it, so a broken suite would read as 100%
sensitive. Both figures below are measured, not estimated:

| | claims | files | runs | wall clock |
| --- | --- | --- | --- | --- |
| serial probe | 100 | 44 | 144 | **8 min 54 s** |
| four at a time (32 cores here) | 105 | 45 | 150 | **3 min 20 s** |

Four is the number of cores a GitHub runner has crossed with "one vitest run of a single file does not
saturate a core". The ratio lives in `RCA_SENSITIVE_CONCURRENCY` so it can be re-measured on a different
machine rather than believed.

### Three: a green run means three things, and only one is "survived"

A mutant run that passes may mean the witness does not care, or that the mutant **never arrived** -- the
claimant built its own environment and dropped `NODE_OPTIONS` and `RCA_HOLLOW_SITE` together (finding
359's fact, one question over). So the hook writes `hollow <site>` before it replaces the code, and the
gate reads the marker:

| that run | what it means | the repair |
| --- | --- | --- |
| went red | the witness depends on this exit | none |
| green, and the trace holds `hollow` | **survived**: it reached the exit and does not depend on it | add the assertion, or move the pointer |
| green, and the trace holds nothing | the mutant did not arrive, so nothing was measured | fix the measurement, not the inventory |

Reading the third as the first is using the instrument's blindness to accuse a test -- finding 359's
mistake, asked again in a new place.

### Four: the two mistakes this round made

Recorded because "the tool is wrong too" is a shape this audit has written down repeatedly:

| mistake | what it did | what caught it |
| --- | --- | --- |
| `pool([...byFile.keys()], …)` passed the indices | `paths[1]` received `0`, `TypeError` | the first real run |
| `parseHollows` returned a `Set`, the caller used `.includes` | three cases failed with `not a function` | the cases written this round |

The second is the old shape of one contract written in two languages: the parser and its caller each
spell the type, and the compiler cannot see into a `.mjs`.

### Readings

> Ledger for `v3.41`.

| item | value |
| --- | --- |
| `core` test suite | **224 files, 5528 tests passed** (at v3.41) |
| `cli` test suite | **4 files, 187 tests passed** (at v3.41) |
| repo test suite | **228 files, 5715 tests passed** (at v3.41) |
| coverage, four dimensions | **99.96 / 99.75 / 100 / 99.96** -- unchanged; nothing under `packages/*/src/` moved |
| new tests | **17**: 12 in `verify-sites-are-sensitive.test.ts`, 5 in `site-proofs.test.ts` (30 -> 35) |
| claims reached | **105 of 105**, 45 files, 1 min 58 s |
| claims sensitive | **105 of 105**, 150 runs, 3 min 20 s at four at a time |
| failure sites | **112** across 56 scripts (was 107 across 55): the new gate's five exits, each proved by the file written for them |
| CI | a sixth job, `sensitivity`, 15-minute budget, beside the batteries rather than behind them, so the workflow's wall clock is unchanged |

### Left open

- **The embedding fallback is still missing**, seventh round. The paper names no model and no threshold,
  and a number chosen here would be this tree's number wearing the protocol's name.
  `[open: §4.4 names neither a model nor a cut-off, and picking one here would grade the protocol with this tree's number]`
- **A key whose description carries no keyword scores 0.** Unchanged, recorded as a gap.
  `[open: no published rule prices a key whose description yields no keyword, so 0 is this tree's choice]`
- **The pass grows with the claim count.** One baseline per file plus one run per claim: 150 today, and
  every site added later buys one. At four at a time that is about 1.3 s per claim, so the 15-minute
  budget holds to roughly 500.
  `[open: the cost is linear in a number this round made larger, and the budget came from one measurement]`
- **The mutant replaces `process.exit(code)`.** A gate that reported failure by setting
  `process.exitCode = 1` and returning would be invisible to it -- measured rather than assumed:
  `scripts/` uses that spelling zero times today.
  `[open: the instrument covers one spelling of "reports failure", and this tree happens to use only that one]`
- **Blindness is observed one level deep.** Unchanged: a wrapper's child is visible only when the wrapper
  inherits.
  `[open: the spawn record covers direct children, and a wrapper's child is only visible when the wrapper inherits]`
- **A `catch` arm's `condition` is the previous `if`'s.** Found while reading the new entries:
  `verify-site-proofs.mjs:109` and `verify-sites-are-sensitive.mjs:132` both publish
  `condition: "unknown.length > 0"` for a refusal that lives in a `catch`. The column is the deriver's,
  and it looks backwards for an `if`.
  `[open: the deriver has no spelling for a catch arm, so it inherits the last condition it saw]`

### Unchanged

The corpus, the answer keys, the checkpoints, the score targets, the export, the pool's price, and every
budget the plan enforces. Nothing under `packages/*/src/` moved. This round's subject is the sentence that
a test proves a failure site, and the instrument that reads it.

## v3.42 — the guard column named the nearest `if` above, not the block the exit is in

v3.41 closed with a ruler rather than a result: *every "proved" claim should be asked not only whether it
ran, but under what conditions it would go red.* The inventory answers that question in a column. For each
of the 112 failure sites `golden-master/gate-sites.json` publishes a `condition` -- the guard that decides
whether the exit runs at all -- and until this round that column was a guess about the file's shape.

**13 of 112 entries named a guard that does not hold at the exit, and two more published nothing where
the guard could be named.** Three of the thirteen named the opposite branch.

### One: `condition` answered "which `if` is nearest above this line"

The deriver scanned *backwards for an `if` line*. That is not the same question as *which block this exit
is in*, and the two part company exactly where a block ends between the guard and the exit:

| site | published | the guard that holds |
| --- | --- | --- |
| `verify-site-proofs.mjs:109` | `unknown.length > 0` | `catch` -- the refusal fires when the inventory cannot be *read* |
| `verify-sites-are-sensitive.mjs:132` | `!Number.isInteger(CONCURRENCY) \|\| CONCURRENCY < 1` | `catch` |
| `check-battery-budget.mjs:41` | `workflow.errors.length > 0` | `catch` |
| `verify-site-proofs.mjs:242` | `problems.length > 0` | `failures > 0` |
| `verify-sites-are-sensitive.mjs:332` | `unmeasured.length > 0` | `failures > 0` |
| `build-example-bundle.mjs:103` | `!current.equals(expected)` | `!ok` -- the `if` opens no block, so the scan never saw it |
| `check-staged-mutation.mjs:143` | `verdict.differing.length > 0` | `problems.length > 0` |
| `probe-m1-ceiling.mjs:202` | `args.json` | nothing -- `process.exit(main())` at module level |

The first three are the worst class: they name the *other* branch. A reader asking "when does this gate
refuse to read its inventory" was told "when the arguments are unrecognised". A condition that reads as an
answer and is not one is the same defect as a proof that reads as a proof and is not one, one column over.

### Two: two scanners died on the same character before the third asked the tree

**Characters.** The first repair counted braces with a hand-written walk that skipped strings.
`check-no-absolute-paths.mjs` holds `/(['"`])(\/(?:Users|...)\/[^'"`\n]*)\1/g`; the quote characters
*inside the regex* opened a string that never closed, so the walk swallowed the rest of the file and the
enclosing `if` was never pushed. In `check-open-list.mjs` the same desync left a `for` on the stack twenty
lines after it had closed, and that loop was published as the guard of a module-level exit.

**Tokens.** The second attempt used TypeScript's raw scanner. It is not a standalone lexer: a template's
`${...}` has to be rescanned by the parser, so after the first substitution the scanner reads prose as
code. Measured: **80 of 112** sites lost their guard, every one of them in a file with a template literal.

Both are the lesson this file has now recorded five times -- `stripComments` on URLs, the site rule on its
own line 109, and these two. *What encloses this exit* is a question about a syntax tree, and the third
attempt asks the tree. The cost is real and paid deliberately: the deriver imports the compiler the build
already uses. The alternative was a third heuristic in a gate that runs on every push.

### Three: the vocabulary, and the two decisions in it

The 97 entries that were right do not move: an `if` publishes its predicate, a loop its header, `catch` and
`switch` the word. Two rules are new because the old scan could not express them at all:

- **an `else if` chain publishes every link negated.** `check-fault-cases.mjs` exits from the final `else`
  of three tests; publishing only `!(arg === '--help' || arg === '-h')` would be true and would read as
  the complete condition.
- **a declaration is a barrier, an inline closure is not.** `fail(...)`'s exits carry no condition -- the
  condition lives at the call site -- but `verify-local.mjs`'s exit sits in `main().catch((error) => ...)`
  *inside* the guard that decides whether `main()` is ever called, so the guard is published. The old
  oracle could not make that distinction; the tree makes it for free.

Absence stays an answer. It is how a reader learns that a `fail(...)` exit is guarded by whoever called it.

### Four: what the change cost, and the three places it showed

- **15 annotations dropped.** Carrying is by fingerprint (`script` + `condition` + `diagnostic`), and the
  guard text changed for exactly the entries that were wrong. Each was reinstated by hand after checking
  that its **line and its proving test had not moved** -- 97 of 112 carried automatically.
- **The deriver's own exit moved** from 132 to 133, because the file gained an import. Its annotation
  carried, which is what the fingerprint is for.
- **One test needed the compiler reachable.** `gate-sites-are-proven.test.ts` copies `scripts/` into
  `tmpdir()` and runs the deriver there; the copy now needs `node_modules` above it, and the test says so
  rather than discovering it as a flake.

A file the parser cannot read now fails loudly instead of publishing an empty guard -- an empty condition
and "no guard" are indistinguishable in the output, which is the failure mode this campaign keeps finding.

### Five: the column beside it was measured, and declined

The same reasoning applies to `diagnostic`, and it was implemented: the nearest preceding statement in the
same block, walking outward. It changes 20 of 112 entries, and **14 of those become absent**, because the
message usually sits inside the `for` loop just above -- `check-doc-counts.mjs` prints its summary, loops
over the detail, then exits. Scoping to the block throws the message away.

So the column keeps proximity and gains a sentence about what it does not claim. A measurement that decides
against a change is the only kind that can be trusted to have been made for the right reason.

### Six: the tally counts a comment, and it is now named

With a parser available the enumeration was re-measured rather than assumed: 112 statement-position
`process.exit(...)` calls with a non-zero argument, 112 listed. Complete. The tallies beside it are not:
the committed file says `15 zero, 3 indirect`, the parser says `16 zero, 2 non-statement`, and the third
`indirect` is a docstring line in the deriver itself, counted because `stripComments` desyncs in that file
and leaves nine comment lines standing.

Left alone deliberately. Replacing the tallies with the parser's own classification changes what the
`excluded` object means, which is a round of its own; the number is published, so it is now also named.

### Readings

> Ledger for `v3.42`.

| item | value |
| --- | --- |
| `core` test suite | **225 files, 5545 tests passed** (at v3.42) |
| `cli` test suite | **4 files, 187 tests passed** (at v3.42) |
| repo test suite | **229 files, 5732 tests passed** (at v3.42) |
| coverage, four dimensions | unchanged; nothing under `packages/*/src/` moved |
| new tests | **17** in `derive-gate-sites-conditions.test.ts`, one per shape |
| conditions corrected | **15 of 112** rows: 13 guards that did not hold, 2 empty where the guard was nameable; 97 carried by fingerprint, 15 reinstated by hand |
| the two shapes that defeated the scanners | regex-with-quotes: 1 site lost its guard; template: **80 of 112** under a raw token scan |
| mutation of the new rules | catch arm removed -> 2 red; `else` chain collapsed -> 1 red; declaration barrier removed -> 1 red; file restored byte-identically |
| failure sites | **112** across 56 scripts -- unchanged, and re-measured complete against the parser |
| derivation cost | 0.41 s for 75 scripts, of which about 0.2 s is loading the compiler |

### Left open

- **The embedding fallback is still missing**, eighth round. The protocol names no model and no threshold.
  `[open: the protocol names neither a model nor a cut-off, and an eighth round of waiting is cheaper than a number wearing the protocol's name]`
- **A key whose description yields no keyword scores 0.** Unchanged, recorded as a gap.
  `[open: the protocol is silent on a key with no usable description, and a redistribution formula invented here would be unverifiable]`
- **The sensitivity pass grows with the claim count.** 150 runs today, about 1.3 s per claim; the budget
  holds to roughly 500.
  `[open: the cost is linear in a number this round did not change, and the budget came from one measurement]`
- **The mutant replaces `process.exit(code)` only.** `process.exitCode = 1` would be invisible; measured,
  `scripts/` uses that spelling zero times.
  `[open: the instrument covers one spelling of reports failure, and this tree happens to use only that one]`
- **Blindness is observed one level deep.** A wrapper's child is visible only when the wrapper inherits.
  `[open: the spawn record covers direct children only, so a wrapper that does not inherit still hides its own child]`
- **The dropped tallies are still line-shaped.** `excluded` says `15 zero, 3 indirect`; the parser says
  `16 zero, 2 non-statement`. The extra one is a docstring line, counted because `stripComments` desyncs in
  the deriver itself and leaves nine comment lines standing.
  `[open: the enumeration is complete but its tallies are read from lines, so a comment line can enter one of them]`

### Unchanged

The corpus, the answer keys, the checkpoints, the score targets, the export, the pool's price, and every
budget the plan enforces. Nothing under `packages/*/src/` moved. This round's subject is one published
column of the site inventory, and the instrument that derives it.

## v3.43 — the list and the tally added up to the right total for two wrong reasons

v3.42 asked *which thing a claim is about*, and found that `condition` answered "the nearest `if` above".
This round asked the same question of the column beside it -- `excluded`, the tally that exists so a reader
can subtract -- and of the instrument that reads comments.

**The tally was wrong in both directions, and the two errors cancelled.**

| tally | committed file | the tree |
| --- | --- | --- |
| `zero` | 15 | **16** |
| `indirect` | 3 | **2** |
| total | 130 | 130 |

A number that is right for two wrong reasons is harder to notice than a number that is wrong, because the
check anyone would write -- *do the halves add up?* -- passes.

### One: the count that was lost, and the fallback that never reached it

`check-official.mjs:995` holds `if (officialDirArg === undefined) process.exit(0);`. A success exit whose
line does not *begin* with `process.exit`, so `exitArgument` -- which anchors at the start of a line --
returned `undefined`, and the call fell through every branch of `excludedIn`. It was counted nowhere.

The site rule carries a fallback for exactly this shape, with the story attached: *"Dropping the fallback
took `build-example-bundle.mjs`'s only failure exit out of the inventory -- `scripts-are-classified.test.ts`
caught it on the same run."* The tally got no such fallback, and no test caught it, because the two readings
were only ever compared with the tree, and the tree was asked about **sites**.

> A repair made because a test caught it does not generalise on its own. It generalises when the *other*
> reader of the same shape is named -- and here the other reader was three functions below in the same file.

### Two: the count that was invented, by the third hand-written lexer

`derive-gate-sites.mjs` stripped comments before looking for exits. Measured against the parser, that
stripper desyncs in **12 of the 75 scripts**, and the desync is one of two characters every time:

```
check-backend-support.mjs:60    return cell.replace(/`/g, '').trim();
check-no-absolute-paths.mjs:95  const ABSOLUTE_PATH = /(['"`])(\/...)\1/g;
check-l4-status.mjs:101         [...targetMatch[1].matchAll(/'([^']+)'/g)].map(...)
```

A quote or a backtick **inside a regex literal** is a quote to a scanner, and the scanner opens a string it
will never close. That is the identical character that defeated the two scanners v3.42 recorded, one
function over, in a file that had already written the lesson down four times. The comment it let through
this time was the file's own docstring -- `// \`assert(process.exit(1))\`, \`.map((x) => process.exit(1))\`.`
-- which the indirect tally then counted as a real exit.

It is **deleted**, not repaired: once the classification walks the tree, nothing in the file needs to know
what a comment is, and a repaired lexer would be a fourth heuristic with no caller.

### Three: one pass, three baskets, and a partition instead of a remainder

A remainder cannot be checked -- it is whatever the subtraction leaves. So the questions the two readings
answered separately are now one walk that puts every `process.exit(...)` call in exactly one of `sites`,
`zero`, `indirect`. `sites.length + zero + indirect` **is** the number of calls, and a call silently absent
from all three is impossible rather than merely unnoticed.

`multiline` was the fourth basket and is gone. It counted "an exit whose argument spans lines", which a
line reader could not parse and a tree reader cannot express: a spanning call is an ordinary site. It read 0
for every round it existed, and **a tally that is structurally always zero measures the reader's limitation,
not the tree.**

The zero test is now a numeric literal rather than the text `0`, so `0x0` and `0.0` are the same claim --
the rule reads the property and no longer the spelling, which is finding 172's lesson applied one level in.

### Four: the same lexer had a second copy, in the sharper instrument

`scripts/gate-proofs.mjs` carries its own `stripComments`, and it decides the audit's sharpest distinction:
*a comment is prose about the gate, a string or an identifier is the gate being used.* Measured, it desyncs
in **28 of the 219 test files**, and the desync credited two gates to `gate-sites-are-proven.test.ts` by
sentences in a comment:

| gate | files that name it in code, by the stripper | by the compiler |
| --- | --- | --- |
| `apply-pins.mjs` | 4 | **3** |
| `check-no-mock.mjs` | 5 | **4** |

Neither verdict moves today -- each gate has three or four other files that drive it -- which is the whole
reason the defect survived eight rounds. A defect that changes no answer today changes one later, and is
invisible until then.

The repair is exact and the mechanism had to be measured, because the obvious tool does not work:
`getLeadingCommentRanges(text, 12)` returns nothing for `const a = 1; // x` where `getTrailingCommentRanges`
at the same offset returns the comment. So the file is read for its **token boundaries** and each gap
between two adjacent boundaries is scanned for trivia. A string is a token, so no string can straddle a
gap; a `//` inside a regex literal is inside a token, not in a gap.

Verified by the invariant rather than by inspection: blanking comments changes no token, so the token
sequence of all **295** files in `scripts/` and `packages/core/test/` is identical before and after -- **0
mismatches**. A token gained would mean a comment survived; a token lost would mean code was blanked.

The memo is measured rather than assumed: the audit asks this of 219 files for each of 56 gates --
**12,152 calls** -- and parsing each time costs about 65 s against 1.3 s with one parse per file.

### Readings

> Ledger for `v3.43`.

| item | value |
| --- | --- |
| `core` test suite | **226 files, 5568 tests passed** (as of `758c25d`) |
| `cli` test suite | **4 files, 187 tests passed** (as of `758c25d`) |
| repo test suite | **230 files, 5755 tests passed** (as of `758c25d`) |
| coverage, four dimensions | unchanged; nothing under `packages/*/src/` moved |
| new tests | **23**: 18 in `derive-gate-sites-tally.test.ts`, 5 added to `gate-proofs.test.ts` |
| the tally | `{15 zero, 3 indirect}` -> **`{16 zero, 2 indirect}`**; total 130 either way |
| `multiline` | removed: a basket a tree reader cannot reach, which read 0 in every round it existed |
| the deriver's lexer | deleted; it desynced in **12 of 75 scripts** |
| `gate-proofs`' lexer | replaced; it desynced in **28 of 219 test files** and changed **2** published decisions |
| the invariant | token sequence identical for **295** files, **0** mismatches |
| naming cost | 12,152 calls in **1.3 s** with one parse per file, against about 65 s without the memo |
| derivation cost | **0.40 s** for 75 scripts, of which about 0.2 s is loading the compiler |
| mutation of the new reading | indirect basket off -> 5 red; zero read as text -> 1 red; position ignored -> 5 red; previous stripper restored -> 4 red; every file byte-identical afterwards |
| failure sites | **112** across 56 scripts -- unchanged for the fifth round running |

### Left open

- **The embedding fallback is still missing**, ninth round. The protocol names no model and no threshold.
  `[open: the protocol names neither a model nor a cut-off, and a ninth round of waiting is cheaper than a number wearing the protocol's name]`
- **A key whose description yields no keyword scores 0.** Unchanged, recorded as a gap.
  `[open: scoring it anything else needs a rule the protocol does not contain, and this round measured the tally rather than inventing one]`
- **The sensitivity pass grows with the claim count.** 150 runs today, about 1.3 s per claim; the budget
  holds to roughly 500.
  `[open: one measurement set the budget and no run has yet reached the ceiling, so the shard size would be a guess about a curve]`
- **The mutant replaces `process.exit(code)` only.** `process.exitCode = 1` would be invisible; measured,
  `scripts/` uses that spelling zero times.
  `[open: a setter is a different syntax node, so covering it would mean a second hook over a shape that no script here writes]`
- **An exit with no argument is a site.** `process.exit()` exits 0, so by the property it is a success exit,
  but the rule reads the argument's spelling and no-argument is not the literal zero. Measured: zero
  instances in `scripts/`.
  `[open: the rule is about the argument, so a call that has none is classified by absence rather than by meaning]`
- **Blindness is observed one level deep.** A wrapper's child is visible only when the wrapper inherits.
  `[open: the record is built where the spawn happens, so a grandchild is visible only if its parent passed the environment down]`
- **The new dependency is a compiler at gate time.** `gate-proofs.mjs` now imports `typescript`, so a
  sandbox carrying `scripts/` must carry it too; two test harnesses had to say so.
  `[open: the reading is exact because it asks the compiler, and the compiler is a runtime dependency of two gates]`

### Unchanged

The corpus, the answer keys, the checkpoints, the score targets, the export, the pool's price, and every
budget the plan enforces. This round's subject is one published tally and the two lexers that computed it.

## v3.44 — the inventory read the shape of the sentence and published what the shape left out

v3.43 closed with a rule for the next round: *a number you can subtract is worth asking about -- is it a
partition or a remainder?* This round asked the same question one level up, of the **rule** that produces
the numbers: not "do the tallies add up" but "which exits count at all". Three answers came back, and all
three had the same shape -- a sentence read by its grammar rather than by what it does.

| what the rule said | what the tree does | cost |
| --- | --- | --- |
| an exit whose argument is not the literal zero | `process.exit()` exits 0 | a success exit published as a failure site |
| an exit in statement position | `main().then((code) => process.exit(code))` | the sentence that decides two gates' status, filed as "not a site" |
| a `process.exit(...)` call | `process.exitCode = 1`, an alias, a destructuring | exits invisible to the list *and* to the tally |

### One: an exit with no argument was published as a failure exit

`sites` 112 entries, `excluded` `{16 zero, 2 indirect}`, 130 calls. The rule text:

> a statement-position call to `process.exit(...)` whose argument is not the literal zero

An absent argument is not the literal zero, so `process.exit()` fell into `sites`. It exits **0**. No
instance exists in `scripts/`, so no number moves -- and that is exactly why it is worth fixing now: every
published site is a claim that a mutant replacing its argument with `0` will make some test go red. For
`process.exit()` there is nothing to replace; the mutant is the identity. The sensitivity pass would have
printed that claim as a **survivor**, which it describes as *the witness reaches the exit and does not
depend on it* -- an accusation against a test for a defect in the rule.

The test that held the old behaviour said so in its own comment ("it is a site here because the rule is
about the *spelling* of the argument") and pointed at this queue. The rule now reads the value: the numeric
literal zero, so `0x0` and `0.0` are the same claim, and **absence**, which is the same number.

### Two: the basket held the two sentences that decide a status

`indirect` was the last remainder in the table, and it had exactly two members:

```
derive-fault-golden.mjs:252     main().then((code) => process.exit(code))
score-fault-extraction.mjs:153  main().then((code) => process.exit(code))
```

`code` is `main()`'s return value. `main()` prints its diagnostic and returns 2 when the M1 condition is
not met, 1 on a usage error; the arrow hands that number to `process.exit`. So this one sentence is where
each script's status is decided -- and the inventory published the `.catch` arm *below* it, which only
fires on a crash, as each script's failure exit, while filing the verdict-carrying call as "not a site".

The three questions this repository asks about a failure exit all take their subjects from this file:
does a named test reach it (`verify-site-proofs.mjs`), would that test notice its absence
(`verify-sites-are-sensitive.mjs`), and is the whole gate hollowable (`verify-gates-are-testable.mjs`).
The refusals of both scripts were outside all three.

The exclusion defeated itself. *A call that is not in statement position may not run* is equally true of
the sites the rule includes -- `if (!ok) process.exit(1)` may not run either -- and that is precisely what
the published `condition` column records. Position in an expression does not weaken an exit: a call that
runs ends the process wherever it stands. So the basket is **deleted** rather than narrowed.

| item | before | after |
| --- | --- | --- |
| `sites` | 112 | **114** |
| `excluded` | `{16 zero, 2 indirect}` | `{16 zero}` |
| calls | 130 | 130 |
| proof of the two new sites | none required | measured: `fault-extraction-scripts.test.ts`, which drives `main()` to 1, 2 and 3 |

The proof was taken by experiment, not by reading: `verify-site-proofs.mjs` runs each claimant with a hook
on `process.exit`, and it reported no violation for either line -- the exits are reached, by the file the
inventory names.

### Three: a reference the reading could not resolve was counted nowhere

The tally is a partition **of calls**, and the rule says so. That leaves a shape outside its subject: a
reference to the exit family that is not a call.

```
process.exitCode = 1;                 // sets the status without calling anything
const die = process.exit; die(1);     // the reference exits nothing; the call does
const { exit } = process;             // the same, one binding further out
```

Measured: 0 in `scripts/` -- 130 calls, all spelled `process.exit(...)`. That measurement is the reason to
refuse rather than to relax: an absent spelling and a spelling nobody looked for are the same observation.
The two hooks are installed on `process.exit`, so `process.exitCode = 1` is invisible to both; an alias and
a destructured binding split the exit from the call, so the trace would report a line the inventory never
published.

The reading **throws** now, naming the file, the line, the spelling and the statement:

```
scripts/x.mjs: 1 reference(s) to the exit family that this inventory cannot classify:
  scripts/x.mjs:41 is a status set by assignment: if (skip === true) process.exitCode = 1
```

The boundary is resolvability rather than style, and the tests hold both sides of it: `process['exit'](1)`
is **classified**, because the member resolves at run time, the hook sees it, the mutant can hollow it, and
the call sits on the line the trace reports. `process.exit?.(1)` likewise. What is refused is what cannot
be tied to a line an instrument will name.

A fourth basket, `uncounted`, was written and rejected: a basket is published beside `sites` and reads as
a measurement of the tree, and that one would have measured the instrument's reach.

### Four: a 60-line floor crossed a function boundary

`diagnostic` is the message a site prints about itself. The scan upward had a floor of 60 lines -- a
distance, and a distance does not respect the only boundary that matters. With the two continuations
published, the column would have read:

| site | under a 60-line floor | under the enclosing function |
| --- | --- | --- |
| `derive-fault-golden.mjs:252` | `… of … sample(s) did not produce a usable extraction.` | -- |
| `score-fault-extraction.mjs:153` | `M1 exit condition met.` | -- |
| `probe-agreement-baseline.mjs:119` | -- | `error: ${BUNDLE} is missing.` |
| `probe-category-derivation.mjs:242` | -- | `error: ${MISS_DETAIL} is missing.` |

The second row is the failure this round exists to catch: `M1 exit condition met.` is the sentence printed
on the **success** path, five lines above the exit that fires when the condition is *not* met. A missing
fingerprint is a gap; a wrong one is a lie that reads as a fingerprint.

The floor is now the **enclosing function** -- a boundary in the language, not a guess about layout: a
message outside the function containing the exit is a message some caller printed about something else.
Measured over all 130 calls the change moves **4** rows and **no published site's diagnostic**: the two
continuations lose a message that is not theirs, and the two `process.exit(0)` calls gain one that sat
further than 60 lines away (both are in the `zero` basket and publish nothing).

The block-scoped alternative stays declined for v3.42's measured reason: `check-doc-counts.mjs` prints its
summary, then loops over the detail, then exits, so scoping to the enclosing block lost 14 of 112 sites.

Two rows now have no message in scope, and a bare coordinate is what rule 5 forbids. They publish
`verdict` instead -- the expression whose value becomes the status:

```
{ "script": "scripts/score-fault-extraction.mjs", "line": 153, "verdict": "code",
  "status": "proved", "provedBy": "packages/core/test/fault-extraction-scripts.test.ts" }
```

### Readings

> Ledger for `v3.44`.

| item | value |
| --- | --- |
| `core` test suite | **227 files, 5584 tests passed** (as of v3.44) |
| `cli` test suite | **4 files, 187 tests passed** (as of v3.44) |
| repo test suite | **231 files, 5771 tests passed** (as of v3.44) |
| coverage, four dimensions | unchanged; nothing under `packages/*/src/` moved |
| new tests | **16**: 14 in `derive-gate-sites-refusals.test.ts`, 1 in `derive-gate-sites-tally.test.ts`, 1 in `gate-sites-are-proven.test.ts` |
| the tally | `{16 zero, 2 indirect}` -> **`{16 zero}`**; sites 112 -> **114**; calls 130 either way |
| the two recovered sites | `derive-fault-golden.mjs:252`, `score-fault-extraction.mjs:153` -- each proved by `fault-extraction-scripts.test.ts`, by measurement |
| refused spellings | setter, alias, destructuring -- **0** in `scripts/`, 6 fixtures drive the refusal |
| classified non-call spellings | `process['exit'](1)`, `process.exit?.(1)` -- a call is a call |
| the diagnostic floor | 60 lines -> the enclosing function; **4 of 130** calls change, **0** published rows |
| derivation cost | **0.41 s** for 75 scripts, unchanged |
| failure sites | **114** across 56 scripts |
| CI | run `41503049238` on `950c6e73d`: **6 of 6 jobs success** -- verify 6.4, sensitivity 8.2, batteries **26.8**, artefacts 3.1, backend 1.7, cold-tree 0.6 min |
| CI, the commit after | run `41509748078` on `ccad510b3`: **6 of 6 jobs success** -- verify 4.4, sensitivity 7.4, batteries **27.3**, artefacts 0.9, backend 1.2, cold-tree 0.3 min |

### Left open

- **The embedding fallback is still missing**, tenth round. The protocol names no model and no threshold.
  `[open: the protocol names neither a model nor a cut-off, and inventing one here would put a number's authority where the protocol's evidence should be]`
- **A key whose description yields no keyword scores 0.** Unchanged, recorded as a gap.
  `[open: scoring it anything else needs a rule the protocol does not contain, and this round measured the site inventory rather than the scorer]`
- **The sensitivity pass grows with the claim count.** 107 claims today, about 1.3 s per claim.
  `[open: the budget came from one measurement and no run has reached the ceiling, so a shard size would be a guess about a curve]`
- **A gate can refuse by throwing, and no site is a throw.** Measured: **39 throws in 15 scripts**, of
  which 1 is at module top level (`measure-ci-baseline.mjs:55`, unambiguously fatal), 1 sits in a `try`,
  4 are rethrows in a `catch`, and 33 sit in functions whose reachability is not decidable from the
  syntax. None is required to be reached or noticed by any test.
  `[open: the trace hook is installed on process.exit, so a throw is invisible to both instruments; publishing throws as sites would publish claims nothing can measure, which is the reason the refusal above exists]`
- **The mutant replaces `process.exit(<argument>)` only.** `process.exitCode = 1` would be invisible, which
  is now a refused spelling rather than a silent one.
  `[open: a status set by assignment is a different statement from a call, and the inventory refuses it rather than teaching two instruments a second syntax]`
- **Blindness is observed one level deep.** A wrapper's child is visible only when the wrapper inherits.
  `[open: this round changed which exits the inventory publishes and left the spawn record alone, which still stops at the first child]`
- **The new dependency is a compiler at gate time.** `gate-proofs.mjs` imports `typescript`, as does
  `derive-gate-sites.mjs`; two test harnesses had to say so.
  `[open: this round added a second reader to the same file rather than a way to read any of it without the parser]`
- **The batteries job is 2.7 minutes from its ceiling.** Six runs have measured 19.2, 21.9, 26.7, 27.2,
  26.8 and 27.3 minutes against a 30-minute budget.
  `[open: the ceiling is close enough that the next step added to that job would spend it, and the readings still disagree by eight minutes at the low end]`
- **`sites` reads as the population of refusals and is 114 of about 153.** The rule is scoped to
  `process.exit` calls and says so; a reader who takes 114 for "every way a gate says no" is reading the
  column, not the rule.
  `[open: the difference is the 39 throws above, and closing it needs an instrument that can see a throw before the count can be published]`

### Unchanged

The corpus, the answer keys, the checkpoints, the score targets, the export, the pool's price, and every
budget the plan enforces. Nothing under `packages/*/src/` moved. This round's subject is the rule that
decides which exits the inventory publishes.

## v3.45 — the inventory published one spelling of "no" and there are two

v3.44 ended with a ruler for the next round: *ask whether the exit ends the process before asking whether
it looks like an exit.* This round turned that ruler on the inventory's own subject line, and the subject
was wrong in the same way the last four rounds were wrong: it described **the syntax of a refusal** rather
than **a refusal**.

The published rule is *a `process.exit(...)` call whose argument is not a known zero*. A gate that throws
and lets the exception escape ends the process with status 1, prints the stack, and to a shell is
indistinguishable from `process.exit(1)`. Measured: **41 throw statements across 15 scripts**, and the
inventory published **none** of them.

| the rule said | the tree did | what it cost |
| --- | --- | --- |
| a failure exit is a `process.exit` call | 41 throws across 15 scripts end processes too | three questions (reached? depended on? hollowable?) never asked of any of them |
| the usage exit at `measure-ci-baseline.mjs` is the script's refusal | a top-level throw beside it is the refusal that runs when the network answered | the only test drove the usage arm, so the other arm had never executed |

### One — the sentence that decides a script's status had no witness, and its neighbour did

`measure-ci-baseline.mjs` refuses twice. `process.exit(2)` when the usage is wrong, and a **top-level**
`throw` when the run holds no job named `batteries`:

```js
if (TOKEN === '' || !/^\d+$/.test(RUN)) {
  process.stderr.write('usage: …');
  process.exit(2);                                    // published, proved
}
…
if (job === undefined) throw new Error(`run ${RUN} holds no job matching "${JOB}"`);   // published nowhere
```

`battery-budget.test.ts` drove the first with an empty token and a non-numeric run id, and asserted
`status === 2` twice. The second needs a network that answers 200 with a job list that does not carry the
job, which no test had, so that line had never run -- in any test, on any machine, since it was written.

This is not a coverage number. It is the shape the campaign exists to find: a refusal that guards the
number **every battery bound is a multiple of**, sitting outside all three questions, because the rule that
enumerates refusals was written about a call.

### Two — four baskets, and the boundaries are facts about the language

The partition is published beside `sites`, under `throws`, and it is total: `fatal + unguarded + guarded +
rethrow` is the number of throw statements, checked in `derive-gate-sites-throws.test.ts` by a traversal
that shares no code with the reading (it counts `ThrowStatement` nodes and nothing else).

| disposition | where | what it does |
| --- | --- | --- |
| `fatal` | no enclosing function, no enclosing `try` | ends the process, unconditionally |
| `unguarded` | in a function, no enclosing `try` | hands control to the caller, which decides |
| `guarded` | in a `try` block | this frame catches it |
| `rethrow` | in a `catch`, rethrowing the caught binding | carries a decision made above |

Measured: **1 fatal, 36 unguarded, 1 guarded, 3 rethrow**.

Two boundaries were decided by measurement rather than taste.

**A `try` stops at a function boundary.** `try { const f = () => { throw x; }; }` does not guard `f`: the
`try` above its *definition* is not on the stack when it runs somewhere else. Writing the reading the other
way would have called every throw in an arrow function defined anywhere under a `try` guarded, which is the
same defect as reading `condition` from the nearest `if` line.

**A `catch` is not a forward by itself.** The test is whether the thrown expression *is* the caught binding.
`measure-doc-counts.mjs:182` builds a `SuiteFailed` from a red `pnpm` inside a `catch`; that is this
repository's verdict rather than pnpm's, so it escapes its function like any other `unguarded` throw. Three
of the four catch-resident throws are forwards and one is a verdict, and a reading that keyed on the word
`catch` would have said four.

### Three — the second instrument, because a throw is not a call

The reach instrument replaces `process.exit` and records the calling frame. A `throw` is not a call, so that
hook is blind to it by construction -- not by oversight.

The gate process now also listens for its own uncaught exception, and only when it *is* the gate
(`process.argv[1]` names a script under `scripts/`). The guard is what keeps the suite's worker on vitest's
exception handling: taking that away would turn a red test into a green process, which is the worst trade
available here. The listener records the frame, writes the stack the runtime would have written, and exits 1
through the original `process.exit`, so the verdict stays the gate's.

The trace keeps the two facts apart. `parseThrows` reads `throw <file>:<line>` lines that `parseTrace`
explicitly skips, and `unprovenClaims` reads the set that matches the claim's `kind`. Merging them would let
a run that merely crashed satisfy a claim about a refusal the gate chose.

| instrument | what it proves | what it cannot see |
| --- | --- | --- |
| exit hook (`process.exit`) | a claimed exit was reached | a throw |
| uncaught listener (gate only) | a claimed fatal throw was reached | a throw the gate caught |
| value mutant (`RCA_HOLLOW_SITE`) | the suite depends on that exit | a throw: there is no seam to replace |

### Four — the claim that could not be mutated is named, not dropped

`verify-sites-are-sensitive.mjs` hollows an exit by replacing its code with zero from the calling frame.
That is a *value*, which is why it needs no journal and no restore path. A throw has no such seam: the
language offers nothing between the statement and the unwind. So the gate now separates the claims it can
mutate from the one it cannot, and **prints the ones it cannot**:

```
verify-sites-are-sensitive: PASSED (107 claim(s) across 45 file(s), 152 run(s), 3.3 min, …)
verify-sites-are-sensitive: 1 claim(s) are not mutated here -- a throw has no seam this gate can replace:
  scripts/measure-ci-baseline.mjs:69 <- packages/core/test/battery-budget.test.ts
```

A summary that read "108 claims, all proved" while one of them was never asked is the exact defect this
gate was written to prevent, one instrument over.

### Five — the seam that made the line reachable

`measure-ci-baseline.mjs` gained `RCA_GITHUB_API` and `RCA_CI_OUT`, read only by `battery-budget.test.ts`,
which answers from a **real local HTTP server** -- nothing stubs `fetch`. Three paths are now driven that
had never executed: a 500 from the API (`:62`), a run whose jobs carry no `batteries` (`:69`), and the
success path that writes the file. The third asserts the shape every bound is a multiple of, including that
the runner's own bookkeeping steps are dropped.

The seams follow `RCA_CI_WORKFLOW` and `RCA_CI_BASELINE`: an unset variable is the shipped value, and a
`grep` for each name finds exactly one reader.

### Readings

> Ledger for `v3.45`.

| item | value |
| --- | --- |
| `core` test suite | **228 files, 5612 tests passed** (as of this commit) |
| `cli` test suite | **4 files, 187 tests passed** (as of this commit) |
| repo test suite | **232 files, 5799 tests passed** (as of this commit) |
| throw partition | **41 statements**: 1 `fatal`, 36 `unguarded`, 1 `guarded`, 3 `rethrow`; 15 scripts |
| failure sites | **114** across 56 scripts, unchanged; `excluded` `{16 zero}` unchanged |
| proof plan | `verify-site-proofs`: **108 claim(s)** across 45 files, including the one fatal throw -- PASSED |
| sensitivity | `verify-sites-are-sensitive`: **107 claim(s)**, 152 runs, **0 survivors**, 3.3 min; 1 throw named as not-mutated |
| new tests | **28**: 16 in `derive-gate-sites-throws.test.ts`, 5 in `gate-sites-are-proven.test.ts`, 5 in `site-proofs.test.ts`, 2 in `battery-budget.test.ts` |
| deriver cost | 75 scripts in **0.42 s** (was 0.41), because the throw walk is a second pass over the same trees |
| `docs:check` | pending |

### Left open, in the order the goal is reached

| priority | item | state | next step |
| --- | --- | --- | --- |
| **P1** | TA's embedding fallback | eleventh round untouched: the protocol names neither a model nor a threshold | needs a named model and a named threshold, and a sentence saying it is a choice rather than a transcription |
| **P2** | a key whose description carries no keyword scores 0 | the protocol is silent; this repository takes 0 | record it as a gap; do not invent a redistribution |
| **P3** | the sensitivity gate costs grow linearly with claims | 107 claims at about 1.3 s each | the budget still holds about 500; shard by file before then |
| **P4** | the throw partition is not mutated | 1 fatal claim, reached but not hollowable with a value | needs a source-level instrument that restores the file, which is what `verify-gates-are-testable.mjs` already does per gate |
| **P5** | 34 `unguarded` throws are published but not proved | their exit is decided in a caller's frame | a call-graph reading would let them be proved against the exit they actually reach; the disposition is the honest answer until then |
| **P6** | four scripts hold throws and no published site | `doc-counts-rows`, `format-spec`, `gate-receipt`, `serve-site` | all four are libraries or a server rather than gates, so "reach the line" is the question that applies; see whether a test drives each throw's line |
| **P7** | the blind spot still sees only one level | a wrapper that does not inherit hides its own child | unchanged this round |
| **P8** | the compiler is a runtime dependency of three gates | `derive-gate-sites.mjs`, `gate-proofs.mjs`, and the new reading all `import typescript` | "a gate with no dependencies" needs a third correct reading |
| **P9** | the batteries job is 2.7 minutes from its ceiling | six readings: 19.2, 21.9, 26.7, 27.2, 26.8, 27.3 against 30 | take a fresh baseline before adding a step to that job |

**The lesson, for the round after this one.** The last five rounds each asked a version of "is this claim
true?" -- is there a run, can the run disagree, which thing does the sentence name, does the sentence end the
process. This round asked a question about the **subject line**: *what counts as a refusal*. The answer is
not a syntax, and the inventory had been listing one syntax of a thing the language has two of. So the next
ruler is: **before checking every claim, check that the population of claims was enumerated by what the
thing does -- and when the enumerator matches a spelling, ask what the other spelling is.**
