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
| `core` test suite | **228 files, 5612 tests passed** (as of v3.45) |
| `cli` test suite | **4 files, 187 tests passed** (as of v3.45) |
| repo test suite | **232 files, 5799 tests passed** (as of v3.45) |
| throw partition | **41 statements**: 1 `fatal`, 36 `unguarded`, 1 `guarded`, 3 `rethrow`; 15 scripts |
| failure sites | **114** across 56 scripts, unchanged; `excluded` `{16 zero}` unchanged |
| proof plan | `verify-site-proofs`: **108 claim(s)** across 45 files, including the one fatal throw -- PASSED |
| sensitivity | `verify-sites-are-sensitive`: **107 claim(s)**, 152 runs, **0 survivors**, 3.3 min; 1 throw named as not-mutated |
| new tests | **28**: 16 in `derive-gate-sites-throws.test.ts`, 5 in `gate-sites-are-proven.test.ts`, 5 in `site-proofs.test.ts`, 2 in `battery-budget.test.ts` |
| deriver cost | 75 scripts in **0.42 s** (was 0.41), because the throw walk is a second pass over the same trees |
| `docs:check` | green: 376 findings / 1–379, 10 volumes / 193 rounds, 1601 citations naming 376 numbers, 568 open entries with 529 carrying a reason |
| CI | run `41558345549` on `3593d92e9`: **6 of 6 jobs success** -- build 6.3, sensitivity 5.7, batteries **25.2**, backend 0.8, golden master 1.0, cold-tree 0.3 min |
| CI, the commit after | run `41562828735` on `f6d8ee6a0`: **6 of 6 jobs success** -- build 6.6, sensitivity 7.9, batteries **26.8**, backend 0.8, golden master 0.7, cold-tree 0.4 min |

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
| **P9** | the batteries job sits 3 to 11 minutes from its ceiling | eight readings against a 30-minute budget span **19.2 to 27.3**, and the spread is the fact rather than any one value | take a fresh baseline before adding a step; a range is written here rather than a list because every commit produces one more reading, and the spread is the question worth asking |

**The lesson, for the round after this one.** The last five rounds each asked a version of "is this claim
true?" -- is there a run, can the run disagree, which thing does the sentence name, does the sentence end the
process. This round asked a question about the **subject line**: *what counts as a refusal*. The answer is
not a syntax, and the inventory had been listing one syntax of a thing the language has two of. So the next
ruler is: **before checking every claim, check that the population of claims was enumerated by what the
thing does -- and when the enumerator matches a spelling, ask what the other spelling is.**

## v3.46 — the inventory published forty-one throws and never asked whether any test ran one

v3.45 ended with a procedure rather than a result: *before checking every claim, check that the population of
claims was enumerated by what the thing does.* It had just published 41 throw statements with a disposition
each and proved **one** of them, and the sentence explaining that -- "the other three are not exits" -- was
true about exits and silent about execution.

This round asked the missing question of all forty-one: **has any test ever executed this line?** The answer
was no for twenty of them.

### One — the instrument that existed was blind on exactly the statements it was asked about

The obvious reading is coverage: run the suite under V8, read the counter on the block holding each `throw`,
and a zero means the line never ran. That reading is worthless, and the way it fails is silent: a block that
ends by throwing never completes, so its counter is never incremented.

Measured on a three-function probe -- one throws and is caught, one throws and is not, one does not throw --
all three report `count: 0` for the enclosing block. Not a threshold, not a rounding: the instrument cannot
distinguish *ran and threw* from *never ran*, on the precise statement under examination.

Had this been believed, the census would have reported **41 of 41** throws unexecuted and the round would
have been spent writing tests for lines already covered. So the question had to be answered by changing the
program instead of counting it.

### Two — the witness, and the three ways it was wrong before it worked

`scripts/throw-witness.mjs` rewrites `throw X;` into `{ __rcaThrow(<line>, "<file>"); throw X; }`. A block is
a statement, so the rewrite is legal in every position a `throw` can occupy -- the unbraced body of an `if`, a
`case`, a label, a `do`, an arrow's block -- and it inserts no newline, so every line number the inventory,
the stack traces and the exit hook already publish keeps pointing where it did.

Three defects, each found by running it rather than by reading it:

| defect | symptom | repair |
| --- | --- | --- |
| the recorder read `process.argv[1]` | `doc-counts-rows.mjs`'s three throws published as `measure-doc-counts.mjs:271/:487/:534` -- a file under 270 lines | the file name is a literal in the rewrite, computed at transform time |
| the source arrives as **bytes** | `typeof source === 'string'` was false for every module, so nothing was instrumented and the run reported success | decode `Uint8Array`; a string is returned |
| the preload runs in two threads | registered twice, so every reached throw was recorded twice | idempotence guard on the instrument's own call |

A fourth was structural. The suite reaches `scripts/*.mjs` two ways, and the loader sees one: a **spawned**
gate is a node process, a **imported** module is compiled by Vite inside a vitest worker. So
`derive-gate-sites.mjs:631` -- asserted by `derive-gate-sites-throws.test.ts` on the day it was written --
reported nothing, which reads exactly like a row no test reaches. Repair: a Vite plugin calling the **same**
exported function, plus `test/setup/throw-witness.ts` as the worker's recorder. Measured before the setup
file: every test passed and the trace stayed empty, because the rewrite called a global that was not in that
process and the `typeof` guard swallowed the failure -- which is what the guard is for and also why the guard
alone could not report it.

### Three — the census: twenty-one reached, twenty not

| | count | what it meant |
| --- | --- | --- |
| reached | **21** | a test executes the line today |
| not reached | **20** | no test has ever executed it, on any machine, since it was written |

Twenty refusals in a tree whose entire argument is that every refusal is enumerated and proved. Of those,
**eleven** could be aimed at and now are: ten in `published-refusals.test.ts` (two `EISDIR`/`ENOTDIR` shapes
through `check-citations.mjs`, a fixture without `samples` through four `probe-type-misses` arms, a missing
workspace file through `score-fault-extraction.mjs`, a malformed spec through `format-spec.mjs` in-process, a
404 and a 200 through `serve-site.mjs`), one in `derive-gate-sites-refusals.test.ts`, and two that already had
tests which named the file rather than the line.

**Nine cannot be reached**, and the rule refuses the word "unreachable" for them. Each carries a sentence
about that line:

- `build-example-bundle.mjs:57`, `:60` guard the pack contract, not an input: `normalizePackEntries` refuses a
  duplicate path first, and example files carry an `examples/order-prod/` prefix, so the two rows cannot
  collide -- `build-example-bundle.test.ts` measures that they differ.
- `measure-doc-counts.mjs:267` was reachable only through a **defect**: a missing `pnpm-workspace.yaml` raised
  `ENOENT` out of `workspacePackages`, and that is now a diagnosis (finding 218's rule, applied again).
- `probe-m1-ceiling.mjs:118`, `probe-type-misses.mjs:255` and `:1319` assert a partition over values the same
  function produced: firing them requires that function to disagree with itself.
- `probe-type-misses.mjs:550`, `:665`, `:931` repeat the check `:526` and `:570` make, in blocks that run
  later, on the same file: the first block to read it refuses it, so these cannot be the one that reports.

The rule is now three clauses: **`fatal` must be proved; a `proved` row must name a test that reaches the
line and must not also carry a reason; an `exempt` row must carry a reason, must not name a test, and reasons
may not repeat.** A row that says neither is reported in the words that describe the old table: *"so the row
says nothing about whether a test reaches it."*

### Four — a throw *can* be mutated, and the seam is in the source

v3.45 closed the sensitivity gate's throw claim as unmutable: *the language offers nothing between the
statement and the unwind*. That is true of a running process and false of a file. The loader that records a
throw can delete it instead --

```js
// RCA_HOLLOW_THROW=scripts/x.mjs:12
{ typeof __rcaThrow === 'function' && __rcaThrow(12, "x.mjs", true); }
```

-- at the same line, through the same plugin, with the recorder already armed. The third argument makes the
recorder write `hollowed <site>`, which keeps apart the two readings that look identical from outside: *the
mutant arrived and the suite did not notice* from *the mutant never arrived*.

```
verify-sites-are-sensitive: PASSED (139 claim(s) across 51 file(s), 190 run(s), 4.0 min --
  107 exit(s) hollowed, 32 throw(s) removed -- and some test goes red for every one of them)
```

**Zero survivors**, and the two mutants are counted apart in the summary, because a run that emptied every
exit and removed no throw would otherwise read like a complete one. The list of claims this gate cannot
mutate is empty.

### Five — the claim was read off the disposition, so thirty-one proofs went unmeasured

`claimedSites` is what both proof gates read to decide what to run, and it admitted `throws` rows only when
`disposition === 'fatal'`. That was finding 375's reasoning surviving inside the instrument after the
inventory had abandoned it: the table said *thirty-two rows are proved*, and the plan measured **one**.

The condition is now `status === 'proved'`, and the fact compared is the one the row claims: a throw is
honoured by **reaching** the line -- the witness's `reached` set, which includes a throw a caller caught --
falling back to the deaths the hook recorded when the witness did not arm. Measured: **139 claims across 51
files, all reached**. Thirty-one proofs had been true all along; being true is not being measured.

### Six — the reader that knew three kinds of quotation

`timeout-budget.test.ts` reads test files through a character scanner that strips comments and string
literals. It knew strings, template literals, line comments and block comments, and not **regex literals**.

This round added `/['"]/` to `gate-sites-are-proven.test.ts` -- a pattern accepting either kind of quotation --
and the scanner read the quote inside it as the start of a string, swallowed everything up to the next
matching quote, and reported:

```
gate-sites-are-proven.test.ts states no suite budget, only per-test ones: expected 0 to be greater than 5000
```

The file states `timeout: RULE_TIMEOUT_MS`. That is the fourth false red from a reader that knew fewer
spellings than the language has, and the third recorded in that file, which is why the repair is a fourth mode
rather than an escaped pattern: distinguishing a regex from division needs one token of lookbehind -- an
operator or an opening bracket before the slash means a value is expected, a name or a closing bracket means
one just ended, and a trailing keyword is the exception (`return /re/` starts a pattern, `return a / b` does
not).

### Seven — the guard read a name's first binding, and accused a test of the race it prevents

One more reader, and it is the second this round found by adding a file rather than by reading one.
`tests-do-not-write-inside-the-package.test.ts` follows a write's target through its `const` bindings, and
it kept **the first binding per name in the file**. `published-refusals.test.ts` binds `path` twice -- once to
`resolve(ROOT, 'scripts', target)`, once to `join(SCRATCH, name)` -- so every write in the second scope was
read against the first scope's value, and a test writing into `/tmp` was reported as a test racing every other
worker:

```
packages/core/test/published-refusals.test.ts:77  mkdirSync(dirname(path), { recursive: true });
packages/core/test/published-refusals.test.ts:78  writeFileSync(path, contents);
```

The guard's documented false negatives are harmless; this was a false **positive**, which accuses a test of
the exact defect the file exists to prevent -- the direction that gets a guard switched off instead of
repaired. A name resolves to the nearest binding at or before the write now, and a binding's own expression
resolves at its own line. Two controls hold both orders.

### Readings

> Ledger for `v3.46`.

| item | value |
| --- | --- |
| `core` test suite | **230 files, 5652 tests passed** (as of v3.46) |
| `cli` test suite | **4 files, 187 tests passed** (as of v3.46) |
| repo test suite | **234 files, 5839 tests passed** (as of v3.46) |
| throw partition | **41 statements**: 1 `fatal`, 36 `unguarded`, 1 `guarded`, 3 `rethrow`; **32 proved, 9 exempt** |
| the census | **21 reached, 20 not**; 11 driven by tests written this round, 9 exempt with a sentence about the line |
| failure sites | **114** across 56 scripts, unchanged; `excluded` `{16 zero}` unchanged |
| proof plan | `verify-site-proofs`: **139 claim(s)** across 51 files, including all 32 throw claims -- PASSED |
| sensitivity | `verify-sites-are-sensitive`: **139 claim(s)**, 190 runs, **0 survivors**, 4.0 min; 107 exits hollowed, 32 throws removed |
| new tests | **40**: 19 in `throw-witness.test.ts`, 11 in `published-refusals.test.ts`, 3 in `gate-sites-are-proven.test.ts`, 2 in `site-proofs.test.ts`, 2 in `timeout-budget.test.ts`, and one each in `build-example-bundle`, `derive-gate-sites-refusals`, `stall-watch-is-installed` and `tests-do-not-write-inside-the-package` |
| instrument cost | the rewrite is a lexical `/\bthrow\b/` check before `typescript` is required, so a module with no throw pays one regex; the suite pays one property read per module while the plugin is unarmed |
| `docs:check` | green: 386 findings / 1–389, 10 volumes / 194 rounds, 1621 citations naming 386 numbers, 568 open entries with 529 carrying a reason, and the counts re-derived from three measured suites |
| CI | run `41597295486` on `af8fd9ad2`: **6 of 6 jobs success** -- build 6.0, sensitivity **9.4**, batteries **22.4**, backend 1.1, golden master 0.9, cold-tree 0.3 min |

### Left open, in the order the goal is reached

| priority | item | state | next step |
| --- | --- | --- | --- |
| **P1** | TA's embedding fallback | twelfth round untouched: the protocol names neither a model nor a threshold | needs a named model and a named threshold, and a sentence saying it is a choice rather than a transcription |
| **P2** | a key whose description carries no keyword scores 0 | the protocol is silent; this repository takes 0 | record it as a gap; do not invent a redistribution |
| **P3** | the sensitivity gate's cost grows linearly with claims | 139 claims, 190 runs, 4.0 min locally and **9.4 min on the runner** -- the previous round measured 7.0 for 150, so 40 more claims cost 2.4 minutes | the 15-minute budget holds about 300 runs at this rate; shard by file before then |
| **P4** | nine throw rows rest on a sentence rather than a measurement | three are shadowed by a proved line in a block that runs first, three assert a partition over values the same function produced | the shadowed three are reachable by **unit-testing the function that holds them** rather than by driving the whole probe; that is a test, not an argument |
| **P5** | the witness is invisible to a child that drops the environment | a script loaded without `NODE_OPTIONS` is not rewritten, exactly as its exits are not recorded | unchanged this round; it is the same one-level blind spot as P7 |
| **P6** | ~~four scripts hold throws and no published site~~ | **closed**: `format-spec.mjs:669` and `serve-site.mjs:38` are driven; `doc-counts-rows.mjs` and `gate-receipt.mjs` reach theirs through the gates that import them | -- |
| **P7** | the blind spot still sees only one level | a wrapper that does not inherit hides its own child | unchanged this round |
| **P8** | the compiler is a runtime dependency of four readers | `derive-gate-sites.mjs`, `gate-proofs.mjs`, the witness and the Vite plugin all use `typescript` | the witness is the cheap one -- a lexical gate before the import -- and the plugin costs nothing while unarmed; "a gate with no dependencies" still needs a third correct reading |
| **P9** | the batteries job sits 3 to 11 minutes from its ceiling | eight readings against a 30-minute budget span **19.2 to 27.3** | take a fresh baseline before adding a step; the spread is the fact rather than any one value |

**The lesson, for the round after this one.** The round was opened by a claim that four dispositions described
41 refusals, and it turned out that the description had never been connected to an execution: the table said
*what a throw is* and every gate asked *whether it ran*, and nothing bridged the two. The bridge was an
instrument that did not exist, and building it took four corrections, each of which made the instrument
report **nothing** rather than report something wrong -- bytes not decoded, attribution by process, a road the
loader cannot see, a recorder absent from the worker. So the next ruler is: **when a census finds zero, prove
the instrument can find one before you believe it** -- and the cheapest proof is a fixture where the answer is
known.

## v3.47 — a word boundary the tokeniser did not know, and a fallback decided by measuring it

v3.46 closed with a ruler rather than a result: *when a census finds zero, prove the instrument can find one
before you believe it.* It had just instrumented every `throw` in the tree and asked, of each, whether any test
had ever run the line. Twenty had not, eleven were driven, and nine were published as `exempt` with a sentence
apiece.

This round opened on the three oldest open items rather than on the instrument, and the first two turned out to
be the same defect wearing different clothes: **a rule that was written down where it could not be read** -- a
tokeniser whose boundary list was missing a character, and a fallback whose parameters were missing from the
paper.

### One — the hyphen, and an inversion that made the best answer score zero

Type Accuracy asks whether a keyword of the fault description appears in the reason. Both sides are cut into
words by one function, and its pattern kept `-` inside a token. Nothing tested it, and the comment above it
explained the split without mentioning the hyphen, so the choice had never been argued.

It matters because the two sides are written differently: a description is often a **slug**, a reason is prose.
Measured on `replica-apply-thread-saturation on the order service`:

| reason | Type Accuracy |
| --- | --- |
| `saturation in the replica apply thread` | **0** |
| `saturation` | **0** |
| `the order service is slow` | **1** |

The description was one token. A reason that spelled the compound out shared nothing with it, while a reason
that named only the component was paid in full, because `order` and `service` had always been separate tokens on
both sides. The term was measuring spelling, and it preferred the worse answer.

The pattern is `[^a-z0-9]+` now, on the argument that already justified stripping the full stop: splitting can
only turn a dead token into a live one, and the parts are words the description's author chose. The test states
the property rather than the implementation -- both spellings score 1, a single part scores 1, a different fault
still scores 0.

### Two — the fallback the protocol describes, decided by measuring five models instead of arguing

AIOps2025's Type Accuracy is two steps, and only the first is implemented:

> keyword detection against the ground-truth fault descriptions, with embedding-similarity fallback for unhit
> cases.

Twelve rounds recorded that as a gap, on a correct argument: the paper names neither a model nor a threshold, and
choosing one to match the paper's reported TA would be fitting the metric to its own result. That argument says
*do not fit the number*. It does not say the question is undecidable.

What decides it is which models this repository is **allowed** to ship, and four existing gates already answer
that: no network at gate time, no vendored weights, no secrets, and the same number on every machine. A hosted
embedding API fails the first and the third; a neural embedding fails the second. What is left is a surface
model -- a deterministic function of two strings with nothing to download.

So the question became measurable: *is a surface model enough?* `scripts/probe-ta-fallback.mjs` scores the whole
family -- character 2-, 3-, 4- and 5-gram cosine, and token Dice -- over three classes. **Verbatim** is the
description against itself, a scale check. **Paraphrase** is a reason naming the same fault with none of its
description's content words; ten of those had to be written. **Distractor** is every *other* pair's paraphrase
against this pair's description -- ninety measurements, none of them chosen, because the negatives are the cross
product rather than a list.

The decision rule was fixed before the numbers were taken: a model ships only if one threshold admits every
paraphrase, refuses every distractor, and leaves a margin of at least 0.05, with the threshold at the midpoint --
the only value that encodes no preference between a false credit and a false refusal.

| model | paraphrase (min–max) | distractor (min–max) | gap |
| --- | --- | --- | --- |
| `char-2gram-cosine` | 0.180 – 0.460 | 0.164 – 0.539 | **−0.359** |
| `char-3gram-cosine` | 0.059 – 0.276 | 0.000 – 0.360 | **−0.301** |
| `char-4gram-cosine` | 0.041 – 0.139 | 0.000 – 0.246 | **−0.205** |
| `char-5gram-cosine` | 0.021 – 0.106 | 0.000 – 0.148 | **−0.127** |
| `token-dice` | 0.111 – 0.267 | 0.000 – 0.286 | **−0.175** |

Every gap is negative, which says more than "the model did badly": one threshold would have to sit above every
distractor and below every paraphrase at once, and for every model the highest distractor is above the lowest
paraphrase. The best of the five misses the bar by **0.177**.

The probe also reports what the least bad threshold costs, because overlap proves no threshold is right and does
not say how wrong the best one is: `token-dice` at 0.267 misclassifies **10 of 100** pairs -- 8 true paraphrases
refused, 2 descriptions of other faults credited. Wrong in both directions, on the model that overlaps least.

One row is its own finding. `char-2gram-cosine` scores the scorer's own mutation string at **0.202**, above the
floor of its own paraphrases at 0.180: shipping that model would make Type Accuracy unfailable, and
`runOfficialRegression` would report it as *mutating `reason` did not lower the score*. The mutation grid is the
guard earlier rounds did not have, and it is why this question could be asked at all -- a fallback is now a
change the existing regression can refuse.

**So the gap closes as a decision rather than as code.** It is not work not yet done; it is outside what a model
with no weights can do, and the boundary has a number on it. `golden-master/ta-fallback.json` publishes the
classes, the measurements and the bar a future candidate must beat, and `ta-fallback.test.ts` recomputes every
number from the pairs, so the file cannot drift from the code that produced it.

### Three — three exemptions were one duplicated guard, written three times

v3.46's nine exemptions included three whose reasons were the same sentence: *the same check as a proved line
above them, in a block that runs later, so these cannot be the one that reports.*

True, and the sentence was doing more work than it looked. A check that another check always fires first is a
check that was written **twice**. Measured:

- `recordedTypeMisses` and `recordedCategoryMisses` each held their own copy of *this run is not in the table* --
  same map, same key, same message;
- `categoryEvidence`, `denialEvidence` and `derivationEvidence` each held their own copy of *this corpus carries
  no `samples` array* -- **on the same file**, since all three resolve to
  `golden-master/fault-extraction/samples.json`, two through inline paths and one through `DATASET`.

The repair was therefore not a test that reaches the copy behind the first one. It was deleting the copies: three
duplicate guards became two, and the inventory went from **41 throw statements to 38**.

Both survivors are reachable now because both **take what they read** -- `runBody(run)` takes the run name,
`readSamplesCorpus(path)` takes the path -- and both live in `scripts/type-miss-readings.mjs`. Where they live is
not taste: a test may not import a probe, because `verify-gates-are-testable.mjs` proves a probe by emptying it
and the import kills the worker before vitest can name a failure. The rule's own message names the repair --
*move the reading into a data module and leave the verdict in the gate* -- and this is its fifth instance.

The split cost one thing, recorded because a split always costs it: the fixture tree in `published-refusals.test.ts`
copies the probe into a scratch checkout. One file became two, the copy took one, and the refusal it drives failed
with an ESM resolution error instead of the message it asserts. The fixture copies both now.

### Four — the census, after the dedupe

| | v3.46 | now |
| --- | --- | --- |
| throw statements | 41 | **38** |
| proved | 32 | **32** |
| exempt | 9 | **6** |
| rows resting on a sentence | 9 | **6** |

Two rows were removed as duplicate statements and two were added in the module that took their place, so the
proved count is unchanged while the inventory is smaller. The six sentences left are not of the kind this round
deleted: three assert something about a table the same function just produced (`probe-m1-ceiling.mjs:118`,
`probe-type-misses.mjs:269` and `:1268`), two guard the **pack contract** rather than an input
(`build-example-bundle.mjs:57`, `:60` -- `normalizePackEntries` refuses a duplicate path first, and example files
carry an `examples/order-prod/` prefix, so the two rows cannot collide), and one was reachable only through a
**defect** that has since become a diagnosis (`measure-doc-counts.mjs:267`, a missing `pnpm-workspace.yaml`). None
of them is a copy of a guard standing in front of another.

### Readings

> Ledger for `v3.47`.

| item | value |
| --- | --- |
| `core` test suite | **232 files, 5666 tests passed** (as of v3.47) |
| `cli` test suite | **4 files, 187 tests passed** (as of v3.47) |
| repo test suite | **236 files, 5853 tests passed** (as of v3.47) |
| throw partition | **38 statements**: 1 `fatal`, 33 `unguarded`, 1 `guarded`, 3 `rethrow`; **32 proved, 6 exempt** |
| the dedupe | 41 statements to 38: two unknown-run copies became `runBody`, three corpus-guard copies became `readSamplesCorpus` |
| failure sites | **114** across 56 of 78 scripts, unchanged; `excluded` `{16 zero}` unchanged |
| the fallback probe | five surface models, ten pairs, **90 derived distractors**; every gap negative, best **−0.127**; least-bad threshold wrong on 10 of 100 pairs |
| new tests | **13**: 10 in `ta-fallback.test.ts` and 3 in `probe-type-misses-refusals.test.ts` |
| new modules | `scripts/probe-ta-fallback.mjs` (a `tool`: writes the corpus, has no verdict) and `scripts/type-miss-readings.mjs` (a `data` module: the readings, so a test may reach them) |
| proof plan | `verify-site-proofs`: **139 claim(s)** across **52** files, including all 32 throw claims -- PASSED |
| sensitivity | `verify-sites-are-sensitive`: **139 claim(s)**, 191 runs, **0 survivors**, 4.2 min; 107 exits hollowed, 32 throws removed, and no claim left unmutated |
| `docs:check` | green: 389 findings / 1–392, 10 volumes / 195 rounds, 1624 citations naming 389 numbers, 568 open entries with 529 carrying a reason, and the counts re-derived from three measured suites |

### Left open, in the order the goal is reached

| priority | item | state | next step |
| --- | --- | --- | --- |
| **P1** | ~~TA's embedding fallback~~ | **closed as a measured decision**: five surface models overlap the classes, so no threshold exists; a model this repository may ship cannot stand in for the step | the bar for any future candidate is published in `golden-master/ta-fallback.json` |
| **P2** | a key whose description carries no keyword scores 0 | the protocol is silent; this repository takes 0 | record it as a gap; do not invent a redistribution |
| **P3** | the sensitivity gate's cost grows linearly with claims | 139 claims, 191 runs, 4.2 min locally (9.4 on the runner at the same claim count) | the 15-minute budget holds about 300 runs at this rate; shard by file before then |
| **P4** | six throw rows rest on a sentence rather than a measurement | three assert something about a table the same function produced, two guard the pack contract rather than an input, one was reachable only through a defect | the duplicated three were deleted this round; what is left needs the function to disagree with itself, which is a property rather than a test |
| **P5** | the witness is invisible to a child that drops the environment | a script loaded without `NODE_OPTIONS` is not rewritten, exactly as its exits are not recorded | unchanged; the same one-level blind spot as P7 |
| **P7** | the blind spot still sees only one level | a wrapper that does not inherit hides its own child | unchanged this round |
| **P8** | the compiler is a runtime dependency of four readers | `derive-gate-sites.mjs`, `gate-proofs.mjs`, the witness and the Vite plugin all use `typescript` | "a gate with no dependencies" still needs a third correct reading |
| **P9** | the batteries job sits 3 to 11 minutes from its ceiling | eight readings against a 30-minute budget span **19.2 to 27.3** | take a fresh baseline before adding a step |

**The lesson, for the round after this one.** Both defects this round were found by asking what the *other*
spelling is. The tokeniser knew a full stop as a boundary and did not know a hyphen; the exemptions knew a check
as a thing that runs and did not know it as a thing that was written twice. Neither was visible from the
behaviour anyone was measuring -- Type Accuracy looked correct on every fixture, and every exemption had a true
sentence beside it. So the next ruler is: **when a rule has a list in it, count the list against the language
rather than against the fixtures** -- a boundary set, a closed class, a table of kinds all fail the same way, by
being one member short and by looking right on everything that was tried.

## v3.48 — a budget aimed at the job that failed, and arithmetic that asked for a second job

v3.47 closed with a ruler instead of a result: *when a rule has a list in it, count the list
against the language rather than against the fixtures.* It had just found a tokeniser that
kept the hyphen and an exemption clause that described a duplicated guard.

The budget gate was written four rounds earlier for the job that had timed out, and read as
finished ever since -- it was green, it printed a reading, and its own note explained the
arithmetic of a bound. What it had never been asked is whether the question it poses applies
to a set. It does, the set is the workflow, and asking it of the set refused the shipped tree
three times over.

### One — the rules were about the job that failed (finding 393)

`ci-budget.mjs` reads `baseline.job`, a single string. `R3` says *a step that inherits the
job's budget declares no bound of its own*, which can only be evaluated for a job the
recording describes. So the gate could answer its question about `batteries` and about
nothing else. Measured on the tree:

| job | measured | steps | steps declaring a bound |
| --- | --- | --- | --- |
| `verify` | 532 s | 11 | **0** |
| `sensitivity` | 564 s | 7 | **0** |
| `batteries` | 1575 s | 22 | 20 |
| `backend` | 39 s | 7 | 0 |
| `artefacts` | 57 s | 13 | 0 |
| `cold-tree` | 19 s | 8 | 0 |

`verify` spends nine of its fifteen minutes -- six of them in `lint` -- and a hang there was
reported as *the job timed out*, which is the sentence the step bounds were introduced to
replace. The budget was not too small. It was aimed at one bucket.

The repair is not another number. `readWorkflow` now returns the jobs it read, because a
walk over steps cannot answer *does this job bound anything*: a job whose steps were all
renamed still exists, and a job with no `timeout-minutes` has no budget to inherit. The
recording holds `jobs`, keyed by the workflow's id and carrying the label, because a run
reports its jobs under the label and a recording keyed by id has to know which name to look
for. `R3` asks every job over the floor with more than one step. Two exceptions are stated
rather than assumed -- one step (the job's budget already names it) and under the floor
(there is nothing to spend) -- and `budgetSummary` prints them, because an exception nobody
wrote down is indistinguishable from an oversight.

### Two — the recording was three days old, and the bounds could not survive it (finding 394)

`golden-master/ci-baseline.json` was run `41180476384`, dated 2026-10-31, and sized every
bound at exactly twice its measurement. Re-recording the green run `41637098008` refused the
shipped numbers five times:

```
`Type-miss probe battery` is bounded at 12 min and measured 479 s
`Every gate can be shown to fail` is bounded at 5 min and measured 221 s
`Gate-test battery` is bounded at 5 min and measured 185 s
`Backend-support battery` is bounded at 13 min and measured 416 s
`Backend-support battery` is bounded at 13 min and the steps before it measured 18 min,
  so its bound expires at 31 min -- past the job's 30
```

The gate was right and the recording was old: the same steps measured 1230 s three days ago
and 1575 s now. Nothing in the tree can tell that a recording has aged -- a gate in CI
cannot fetch a run -- and a rule about recency would fail the first tree with no run at all.
What the gate has is the arithmetic, and the arithmetic is what makes the ageing visible the
moment somebody measures again: a bound under twice the measurement is refused, and a bound
that outlives the job is refused. Both fired.

### Three — which the arithmetic answered with a second job (finding 394, continued)

The second refusal cannot be repaired by a number. The job has 30 minutes; its two longest
steps measure 479 s and 416 s, so their bounds alone are 16 + 14 = 30 minutes before any of
the other twelve steps is counted. A bigger bucket is the response the module's own note
calls dishonest -- *a bound that cannot expire before the job does is a number with no
effect* -- so the reading is that one job is doing too much for one budget.

| | `batteries` | `batteries-heavy` |
| --- | --- | --- |
| holds | the 14 steps that measure ≤ 221 s, and the report | the type-miss and backend-support batteries |
| measured | 674 s (11.2 min) | 914 s (15.2 min) |
| bounds | largest 8 min | 16 min and 14 min |
| budget | **25** (was 30) | 25 |
| wall clock | the longer of the two, not their sum | |

`sensitivity` is the same arithmetic one job over: one step measures 536 s, so its bound is
18 minutes, and a budget of 15 cannot hold 18 plus the 23 s that ran before it. The job
declares **20** -- what the bound needs rather than what the measurement needs, which is
9.4 minutes of work in a 20-minute bucket and a bound that names the step two minutes before
the job would.

The split is the one moment the arithmetic cannot wait for a measurement: the two jobs exist
only after the change, and the recording has to exist before CI will accept the change. So
the recorder can record a job that has never run **from the job that ran its steps** --
`--borrow <new>=<ran>` -- and the file says which job the seconds came from, with a note that
the run behind them predates the job. The next green run replaces both, and that replacement
is the first thing the round after this one does.

### Four — the equality asked the new job for shells (finding 395)

`cold-tree-job.test.ts` requires every job that runs the suite to install the shells its
fixtures spawn, and it is an equality over jobs rather than a list of the jobs that existed
when it was written: it follows the `node`/`python3` scripts a step names one level deep and
requires any job whose body or scripts mention `vitest` to install `zsh`. The new job runs
`backend-support.py`, which invokes `pnpm exec vitest run --root packages/core`. So the
equality asked, and the job had no such step. Nothing failed -- the battery runs targeted
tests that spawn no shell -- and the guard said so anyway, which is the whole point of
writing it over a set.

### Five -- the successor run moved two measurements past the line

The split landed on `00b76ac83` (run `41658872002`) and the recording was refreshed from it. The
next run, `41670923224` on the docs commit, measured the same steps again, and two of them had
moved:

```
`Every gate can be shown to fail` is bounded at 8 min and measured 251 s
`Type-miss probe battery` is bounded at 16 min and measured 487 s
```

Both are the same 2x rule, and both had drifted rather than jumped: 221 s to 251 s, 479 s to
487 s. The second one is the interesting one, because 16 minutes is 960 s and twice 487 is 974 --
a bound that is now *under* the multiple by fourteen seconds, which is a bound that would kill a
legitimate run on a slow runner and report it as a hang. So the bounds moved to 9 and 17 minutes,
and the job's arithmetic still fits: 17 + the 8.4 minutes that ran before it is 25.4 against a
budget of 25, so the two are indistinguishable at this precision and the recording is the run
that produced them.

That is the module's own instruction carried one step further than the round expected: *a bound
that has to be raised after it fires was wrong, and the honest response is to measure again rather
than to add slack.* Here it was raised before it fired, because the measurement that justified it
had moved -- which is only possible because the recording is a run and the run is recent.

### Readings

> Ledger for `v3.48`.

| item | value |
| --- | --- |
| `core` test suite | **232 files, 5675 tests passed** (as of v3.48) |
| `cli` test suite | **4 files, 187 tests passed** (as of v3.48) |
| repo test suite | **236 files, 5862 tests passed** (as of v3.48) |
| jobs recorded | **7** of 7, **74** steps, **46** of them bounded; 45 min measured, and the recording is the newest green run rather than the one a job borrowed from |
| the two budget jobs | `batteries` 674 s against 25 min; `batteries-heavy` 914 s against 25; the run waits for the longer |
| the bounds that refused | five, on a recording three days newer: 12/479, 5/221, 5/185, 13/416, and one expiring at 31 min in a 30-minute job |
| throw partition | **41 statements**: 4 `fatal`, 33 `unguarded`, 1 `guarded`, 3 `rethrow`; **35 proved, 6 exempt** |
| the recorder's refusals | four, all `fatal`: a workflow that does not parse, a `--borrow` naming no job, a run holding no job of that name, a step the borrowed job never ran -- each reached by a test |
| failure sites | **114** across 56 of 78 scripts, unchanged; `excluded` `{16 zero}` unchanged |
| proof plan | `verify-site-proofs`: **142 claim(s)** across 52 files -- PASSED |
| sensitivity | `verify-sites-are-sensitive`: **142 claim(s)**, 194 runs, **0 survivors**, 4.0 min; 107 exits hollowed, 35 throws removed |
| new tests | **9**: 8 in `ci-budget.test.ts` (rewritten for the job), 1 in `gate-steps.test.ts` |
| `docs:check` | green: 392 findings / 1–395, 10 volumes / 196 rounds, 1631 citations naming 392 numbers, 568 open entries with 529 carrying a reason, and the counts re-derived from three measured suites |
| CI | the split landed on `00b76ac83`, run `41658872002`: **7 of 7 jobs success** -- batteries-heavy **12.9**, build 8.9, batteries **8.4**, sensitivity 7.9, golden master 1.3, backend 1.0, cold-tree 0.5 min; **13.3 min of wall clock** where the one job took 26.3. The recording refresh on `8afd38940`, run `41664998423`: **7 of 7**, batteries-heavy 13.5, wall 13.6. The bounds moved on `61dff700c`, run `41670923224`: **7 of 7**, batteries-heavy 15.6, batteries 12.8, sensitivity 8.2, build 7.2, golden master 1.0, backend 0.7, cold-tree 0.6, **wall 15.8 min** |

### Left open, in the order the goal is reached

| priority | item | state | next step |
| --- | --- | --- | --- |
| **P0** | ~~the recording carried a borrowed job~~ | **closed**: the recording is the newest green run (`41670923224`), `derived` and `note` are gone, and the two bounds that run moved are at 9 and 17 minutes | -- |
| **P2** | a key whose description carries no keyword scores 0 | the protocol is silent; this repository takes 0 | record it as a gap; do not invent a redistribution |
| **P3** | the sensitivity gate's cost grows linearly with claims | 142 claims, 194 runs, 4.0 min locally and 9.4 on the runner at 139 claims | the 15-minute budget holds about 300 runs at this rate; shard by file before then |
| **P4** | six throw rows rest on a sentence rather than a measurement | three assert something about a table the same function produced, two guard the pack contract, one was reachable only through a defect | the duplicated three were deleted in v3.47; what is left needs the function to disagree with itself, which is a property rather than a test |
| **P5/P7** | the witness sees one level | a script loaded without `NODE_OPTIONS` is not rewritten, and a wrapper that does not inherit hides its child | unchanged; needs a second observation channel |
| **P8** | the compiler is a runtime dependency of four readers | `derive-gate-sites.mjs`, `gate-proofs.mjs`, the witness and the Vite plugin all use `typescript` | "a gate with no dependencies" still needs a third correct reading |
| **P9** | the batteries job sat 4 minutes from its ceiling | 26.2 of 30 measured; now 11.2 and 15.2 against 25 each | a fresh baseline before adding another battery, which is a step the arithmetic now makes cheap |

**The lesson, for the round after this one.** All three defects were the same shape: a rule
that answered a question about **the member that failed** rather than about the set it
belongs to. The budget was written after one job timed out and ruled on that job; the
recording described the job the budget described; and the shell rule, once written as an
equality, immediately found a job that a list would have missed. So the next ruler is: **when
a rule is written because something failed, ask which set that thing is a member of, and
write the rule over the set** -- because a rule shaped by one member is a rule that will be
satisfied by the next member being different, and the difference is invisible from inside.

## v3.49 — the recording's every number was checked, and none of them said which tree

v3.48 closed with a ruler rather than a result: *when a rule is written because something
failed, ask which set that thing is a member of, and write the rule over the set.* It had
just split the batteries in two because the arithmetic said one job was doing too much for
one budget.

This round asks the same question of the whole budget gate, one level up. Every rule in
`ci-budget.mjs` is a relation between the recording, the workflow and the arithmetic -- and
together they can all pass on a recording of a tree that is no longer shipping. The gap was
not in the arithmetic. It was that **the recording does not know when it has aged**, and
nothing else in the tree was asked.

### One — the recording was one run behind, and all five rules agreed (finding 396)

The shipped recording was run `41670923224` at `61dff700c`, 7 jobs and 74 steps, 45 minutes
measured. The shipped tree was `91e320884`, whose run is `41677264353`:

| | recording | the tree that shipped |
| --- | --- | --- |
| commit | `61dff700c` | `91e320884` |
| run | `41670923224` | `41677264353` |
| jobs / steps | 7 / 74 | 7 / 74 |
| measured | 45 min | 46 min |

Every second in the file is a real measurement, taken by the only script that may write it.
The one thing that had moved is *which tree*. That is the shape of the defect: a recording
cannot age in any way its own contents show, so the rules that read its contents cannot see
it -- and the tree was full of gates that would have refused a wrong number and did not
notice an old one.

### Two — the second opinion was already written, as prose

The ledger's `| CI |` row reports the jobs' wall clock, and it is written after the run
comes back green -- so the newest run in such a row is a run this repository has already
looked at. Nothing read it. `check-citations.mjs` verifies finding numbers; no gate looked
at a run id at all. That row was the only sentence in the tree that knew the current run
and the only one that could disagree with the recording, and it was prose.

So `R7` is a comparison rather than a number: the recording may not be older than the
newest run the ledger reports. And its second half is what makes the first mean anything --
**the ledger's newest row must name its run**, because a row that reports a wall clock
without naming the run leaves the recording unopposed, and the gate's silence would read as
agreement with a round it never compared itself to. A rule that only compared ids would
pass on a log that had stopped naming them, which is the same defect one layer out.

### Three — the reader, and the three rows that name no run

`ledger-runs.mjs` is the reading: which rows are closing readings, which numbers in them
are run ids, and which rows name none. A run id is **ten to twelve digits and nothing
else**; the rows cite commits a few characters away in the same backticks, and this
repository writes those as nine characters, so the two cannot be confused by length. The
bound is checked on both sides so a thirteen-digit token is not read as its first twelve --
a reader that returned a slightly wrong id would refuse the tree for a run that never ran.

It found three `| CI |` rows in the shipped log with no run id:

```
volume-03.md:1174   the new step reads the reports in 0.056 s
volume-08.md:835    five jobs green on the fourth push
volume-10.md:882    a sixth job, `sensitivity`, 15-minute budget
```

They report what a job looked like rather than what a run measured, and they predate the
convention. They are **counted, not corrected**: naming a run for them now means deriving
the id from a commit in git history and guessing which of that push's two runs is meant, and
an invented provenance is worse than a stated gap. The reader returns them as `unnamed`, the
summary prints how many, and the rule asks only that the **newest** row name one.

### Four — the gate's first red was the tree it was written in

The rule was written after the defect, and the defect was still there. With this round's
ledger row citing `41677264353`, the gate refused the shipped recording:

```
check-ci-budget: the recording is from run 41670923224 and `volume-10.md:2173` reports
run 41677264353: a recording older than the round that reports it describes a tree nobody
shipped, so its seconds size the bounds of a workflow that has since run -- take a new
reading with `node scripts/measure-ci-baseline.mjs 41677264353`
check-ci-budget: FAILED — 1 problem(s)
```

The repair is one command, and the summary then reads `the ledger's newest run is
41677264353 (the recording)`. A gate whose first red is the tree it was written in has been
observed rather than described -- and no bound moved, because the new measurement was within
the bounds the old one had produced: the tightest is `batteries-heavy / Backend-support
battery` at 2.0x, and the longest bound still expires inside its job's budget.

### Five — and the successor run pushed two bounds under the multiple

Citing the round's own run is one thing; the run after it is another. `41749989956` measured the
same steps as `41677264353` and two of them had grown:

```
`Type-miss probe battery` is bounded at 17 min and measured 530 s        (was 494 s)
`Backend-support battery` is bounded at 14 min and measured 427 s       (was 418 s)
```

17 minutes is 1020 s and twice 530 is 1060; 14 minutes is 840 s and twice 427 is 854. Both
bounds were under the multiple, by 40 s and 14 s -- bounds that kill a legitimate run on a slow
runner and report it as a hang. So they move to **18** and **15** minutes, and the job's
arithmetic still holds: the type-miss bound expires at 18.4 min and the backend-support bound at
24.2 of the job's 25.

That is the drift v3.48 predicted, now with a number on it: the type-miss battery went 479 -> 494
-> 530 s across three consecutive runs, about +5% a run, and the two bounds that size it have
followed 16 -> 17 -> 18. **The prediction is arithmetic from here**: at +5% a round the second
bound expires past the job's budget in two or three rounds, and the batteries-heavy job splits
again for the same reason the batteries did -- which is why P9 says *re-take the baseline before
adding a battery*, and why `R7` now makes forgetting to impossible.

The convention that keeps this stable is worth stating, because it looks like an omission: **a
refresh commit's run is not a closing reading.** The recording is taken *from* the run a round
cites, so the commit carrying the new recording cannot cite the run that verifies it -- that run
would be newer than the recording, and `R7` would refuse it, and its repair too, for ever. This
round cites `41749989956`; the runs of `4e78ef8`, `75f2de650`, `f62b962` and `012b81af9` -- every
commit after it -- verify it and stay uncited, and the summary reads `the recording is newer`
because that is what a refresh looks like from inside.

### Readings

> Ledger for `v3.49`.

| item | value |
| --- | --- |
| `core` test suite | **234 files, 5740 tests passed** |
| `cli` test suite | **4 files, 187 tests passed** |
| repo test suite | **238 files, 5927 tests passed** |
| new tests | **20**: 13 in `ledger-runs.test.ts` (the reader), 7 in `ci-budget.test.ts` (`R7` and its gate paths) |
| the recording | **run 41749989956** at `75f2de650`, 7 jobs / 74 steps / **46 bounded**, 43 min measured; before this round it was `41670923224` at `61dff700c`, one run and one commit behind the tree |
| the comparison | the ledger's newest row names run `41749989956`, which is the recording -- `(the recording)`, not one run behind; **3 older rows name no run** and are counted |
| the gate's first red | `the recording is from run 41670923224 and volume-10.md:2173 reports run 41677264353` -- on the tree the rule was written in |
| the bounds that moved | **two**: type-miss 17 -> **18** (530 s) and backend-support 14 -> **15** (427 s), both under the multiple on the successor run |
| throw partition | **41 statements**: 4 `fatal`, 33 `unguarded`, 1 `guarded`, 3 `rethrow`; 35 proved, 6 exempt -- unchanged |
| failure sites | **114** across 56 of **79** scripts; `excluded` `{16 zero}` unchanged |
| proof plan | `verify-site-proofs`: **142 claim(s)** across 52 file(s) -- PASSED, unchanged |
| coverage | core **99.96 / 99.75 / 100 / 99.96**, cli **100 / 100 / 100 / 100** |
| `docs:check` | green: **393 findings / 1–396**, 10 volumes / 197 rounds, **1633 citations** of 393 numbers, 568 open entries with 529 carrying a reason |
| CI | run `41749989956` on `75f2de650`: **7 of 7 jobs success** -- batteries-heavy **16.4**, batteries **11.6**, build 6.9, sensitivity 6.8, backend 1.0, golden master 0.7, cold-tree 0.3 min; **16.4 min of wall clock**. The run before it, `41677264353` on `91e320884`, was 7 of 7 in 15.9 |

### Left open, in the order the goal is reached

| priority | item | state | next step |
| --- | --- | --- | --- |
| **P2** | a key whose description carries no keyword scores 0 | the protocol is silent; this repository takes 0 | record it as a gap; do not invent a redistribution |
| **P3** | the sensitivity gate's cost grows linearly with claims | 142 claims, 194 runs, 4.0 min locally and **9.0** on the runner; its bound moved 18 -> 19 this round | the 20-minute job budget holds it, and the bound expires at 19.3 of 20; shard by file before the claims outgrow the job rather than the step |
| **P4** | six throw rows rest on a sentence rather than a measurement | three assert something about a table the same function produced, two guard the pack contract, one was reachable only through a defect | a test of the *statement* rather than of the line: for `pack`, the shipped example tree must yield unique paths and a manifest; for the partitions, the classifier's return set must stay closed. Both are falsifiable by the code change the guard is for, which is why they are not inputs |
| **P5/P7** | the witness sees one level | a script loaded without `NODE_OPTIONS` is not rewritten, and a wrapper that does not inherit hides its child | unchanged; needs a second observation channel |
| **P8** | the compiler is a runtime dependency of four readers | `derive-gate-sites.mjs`, `gate-proofs.mjs`, the witness and the Vite plugin | "a gate with no dependencies" still needs a third correct reading |
| **P9** | the batteries jobs sit inside their budgets | 11.9 and 15.8 measured against 25 each; the longest bound expires at 22.8 | a fresh baseline before adding another battery -- and `R7` now makes forgetting it impossible |
| **P10** | ~~the measurement drifts and nothing notices~~ | **closed**: `R7` refuses a recording older than the newest run the ledger reports, and the ledger's newest row must name its run | -- |

**The lesson, for the round after this one.** The recording had five rules and all five read
its **contents**; the one thing wrong with it was not in its contents. So the ruler is:
**when every check on an artefact passes, ask what the artefact is an index of, and check
that the index still points at the thing** -- a commit, a run, a version, a corpus. The
numbers were all true; they were true of a tree that had already run again.

## v3.50 — six exemptions stood on sentences, and four of the sentences were already paid for

Everything in this round starts from one line of the previous round's table: **P4 — six throw
rows rest on a sentence rather than a measurement.** The rule that read them (rule 4) asked
whether the sentence was longer than forty characters and distinct from its neighbours. It did
not ask whether anything measured what the sentence claimed, and for two of the six nothing
did.

### One — the rule was about prose, and prose cannot fail (finding 397)

An exemption says *no test can reach this line, because X*. That is a claim about the code, and
claims about code can be checked. The six shipped rows each carried a paragraph, and the
paragraphs were good: they explained the mechanism, named the guard, and said why an input could
not produce the state. What none of them carried was the name of a test.

The measurement that made the gap legible was reading the six against the suite. Four of them
had a test that held their claim and did not say so:

```
probe-m1-ceiling.mjs:118     "includes over the same objects is exact"   held since v3.45, unnamed
probe-type-misses.mjs:269    "publishes four named checks"              held across several assertions
measure-doc-counts.mjs:267   "every state of the tree is diagnosed"     held for one of three states
build-example-bundle.mjs:60  "the pack always appends MANIFEST.json"    held on a fixture, not the shipped pack
```

and two had nothing at all:

```
build-example-bundle.mjs:57  "the pack cannot contain a repeated path"  nothing asserted uniqueness
probe-type-misses.mjs:1268   "classify returns one of three kinds"      the counts were checked against counts
```

That distribution is the finding. A prose exemption does not distinguish *held and unnamed* from
*not held*, and a reader cannot tell the two apart either -- which is why the four were invisible
for four rounds and would have stayed invisible.

### Two — rule 9 asks for the claim and the test that holds it

`gate-sites.json` grows two columns on the throw partition, and only there:

| column | what it is |
| --- | --- |
| `statement` | the claim the exemption rests on, in one sentence a test could falsify |
| `heldBy` | `{file, test}` -- the test that measures that claim, by exact title |

Rule 9 refuses an exempt row without either, a file that does not exist, a file that is not a
test, a title the file does not carry, two exemptions held by one test, two exemptions stating
one claim, and a **proved** row that also carries an exemption's claim. The columns are refused
on exit sites rather than ignored, so half-applying the convention is visible instead of inert.

The rule's limit is stated where it is implemented: it checks that the title exists, not that the
assertion inside that test is the claim. What it does establish is that deleting the test,
renaming it, or pointing two claims at one test **reds the gate**. Measured twice on this tree:
renaming the m1 title in the JSON turned rule 9 red with the row and the title in the message,
and restoring it turned it green -- the rule is not a rule that cannot fail.

### Three — writing the pack's statement found a reader that walks one directory (finding 398)

The first statement -- *the shipped example tree produces a pack in which no archive path appears
twice* -- could not be written against a fixture. `treeWithExamples()` copies six files into a
scratch tree and the existing tests read the pack it produces; the claim is about the tree that
**ships**, so the test builds from `examples/order-prod` and reads the committed index beside it.

Building from the real tree is what exposed `readExampleFiles()`:

```js
for (const name of readdirSync(EXAMPLE_DIR).sort()) {
  const full = resolve(EXAMPLE_DIR, name);
  if (!statSync(full).isFile()) continue;      // a directory is skipped, silently
```

The tree is flat, so the archive was correct. The defect is that nothing could say it was: the
index is written by the same reader as the archive, `--check` compares the archive with itself,
and the download would have been one directory short the first time somebody put an example in a
folder. Reproduced in a fixture -- `examples/order-prod/nested/extra.json`, nine rows before and
ten after -- and fixed in the reader rather than pinned by an assertion:
`readdirSync(dir, { recursive: true })`, with the relative path preserved so a nested file lands
on its own pack row. The committed artefacts did not move a byte: the tree is still flat.

This is the round's sharpest lesson, and it is not the one the round set out to learn. **A
sentence about "the example tree" had been satisfied by a reader about "the example directory",
and the difference is invisible while the tree happens to be one level deep.**

### Four — the counts were checked against counts (finding 399)

`probe-type-misses.mjs:1268` refuses when the three classification counts do not add up to the
rows. The existing test compared the probe's three counts with three computed in the test by
filtering on `kind`, and they agreed on both recorded runs. That is a check between two readings
of one classification: a fourth kind would have incremented a key that does not exist, both sides
would have agreed at a lower total, and the only reader that would have noticed is the guard the
exemption says no test can reach.

The closure is now measured against the shipped `classify` -- not this file's copy -- over a
table built to be adversarial: an empty pair, a pair that normalizes to nothing, one that differs
only by case, one that shares exactly one token, and every recorded miss of both runs. The
remaining three statements are the same shape one layer in: `checkRca100Structure` must publish
each of four checks exactly once; the measurement's diagnoses must all be a
`MeasurementUnavailable` (the parent, not merely a `name`); and the m1 partition was already
held, which is why its row only needed naming.

### Five — the round's own readings

`gate-sites.json`: 41 throws, **6 exempt and 6 held**, 114 exit sites across 56 of 79 scripts,
`excluded {16 zero}`. Rule 9's block is 11 tests: the negative control, the two required columns,
and one rejection per road (no statement, no held test, a missing file, a wrong title, a
non-test file, a shared test, a repeated statement, a proved row carrying a claim, an exit site
carrying the columns).

The four statement tests are the round's product, and each is falsifiable against the defect it
describes:

| claim | test | the defect that reds it |
| --- | --- | --- |
| the shipped pack lists each path once | `build-example-bundle.test.ts` | a duplicate row in `paths` |
| the pack carries the whole tree and the manifest | same file | a file the reader drops (measured: nested dir) |
| every diagnosis is a `MeasurementUnavailable` | `measure-doc-counts-readings.test.ts` | a refusal that stops inheriting |
| four vocabulary checks are published | `score.test.ts` | a check renamed or dropped |
| `classify`'s return set is closed | `type-miss-probe.test.ts` | a fourth kind the counts do not hold |
| the m1 partition covers its dataset | `m1-ceiling-probe.test.ts` | two halves that overlap or leave a row out |

### Six — the run, and the recording taken from it

`41785707854` on `de4242299`: **7 of 7 jobs success**, and the fastest wall clock this
repository has recorded -- **12.6 minutes**, against 15.3 the round before and 16.4 two rounds
back.

| job | minutes |
| --- | --- |
| injection batteries, the two that rewrite a probe a hundred times | **12.6** |
| injection batteries, one step each | 9.6 |
| build / typecheck / lint / coverage / mutation | 8.9 |
| every proved exit can disappear without a word | 8.9 |
| golden master / official metric / examples / documents | 0.9 |
| a backend this repository did not write | 0.7 |
| cold tree / no build / every precondition declared | 0.3 |

The step that forced the bound to 19 minutes measured **510 s** here, and the two batteries
that were 7.9 and 7.0 minutes four hours earlier measured **5.8** and **6.3**. Nothing in the
tree explains that spread; the runner does. It is the reason the bounds are twice the
measurement and not a tenth above it: a bound tight to the last reading would have moved twice
this round and been wrong both times, and a 19-minute bound with a 510 s measurement has 2.2x
of room in it.

Recording re-taken from this run, as `R7` requires: the ledger's newest row is this section, and
a recording older than the run the round reports describes a tree nobody shipped. The tightest
bound after the re-record is `verify / Lint` at 2.1x.

### Readings

> Ledger for `v3.50`.

| item | value |
| --- | --- |
| `core` test suite | **234 files, 5740 tests passed** |
| `cli` test suite | **4 files, 187 tests passed** |
| repo test suite | **238 files, 5927 tests passed** |
| new tests | **17**: 11 rule-9 cases in `gate-sites-are-proven.test.ts`, 3 in `build-example-bundle.test.ts` (two statements and the nested-directory case), 1 in `measure-doc-counts-readings.test.ts`, 1 in `score.test.ts`, 1 in `type-miss-probe.test.ts` |
| throw partition | **41 statements**: 4 `fatal`, 33 `unguarded`, 1 `guarded`, 3 `rethrow`; 35 proved; **6 exempt, 6 of them now holding a named test** |
| the six claims | pack uniqueness, pack manifests and counts it, every diagnosis is a `MeasurementUnavailable`, four vocabulary checks published, `classify`'s return set closed, the m1 partition covers its dataset -- **4 already held and unnamed, 2 not held at all** |
| failure sites | **114** across 56 of **79** scripts; `excluded` `{16 zero}` unchanged |
| proof plan | `verify-site-proofs`: **142 claim(s)** across 52 file(s) -- PASSED, unchanged |
| coverage | core **99.96 / 99.75 / 100 / 99.96**, cli **100 / 100 / 100 / 100** |
| `docs:check` | green: **396 findings / 1–399**, 10 volumes / 198 rounds, **1639 citations** of 396 numbers, 568 open entries with 529 carrying a reason |
| the bound that moved | **one**: the site-proofs step in `sensitivity` 18 -> **19** minutes, because the fresh recording measured it at **542 s** and twice that is 1084 s -- 4 s past 18 minutes. The job still holds: 19 minutes plus its 0.3 minute of setup inside a 20-minute budget |
| the defect the round found | `readExampleFiles()` walked one directory and skipped every non-file silently; reproduced with `examples/order-prod/nested/extra.json` (9 rows before, 10 after), fixed by a recursive walk |
| the rule, measured failing | renaming one `heldBy.test` in the inventory turned rule 9 red on `scripts/probe-m1-ceiling.mjs:118`; restoring it turned the block green |
| the recording | **run 41785707854** at `de4242299`, 7 jobs / 74 steps / **46 bounded**, 41 min measured; taken from the run this round's ledger row names, which is `R7` working on the round that reports it |
| CI | run `41785707854` on `de4242299`: **7 of 7 jobs success** -- batteries-heavy **12.6**, batteries **9.6**, build 8.9, sensitivity 8.9, golden master 0.9, backend 0.7, cold tree 0.3 min; **12.6 min of wall clock**, the fastest recorded. The run before the round, `41762557378` on `38f138cc0`, was 7 of 7 in 15.3 |

### Left open, in the order the goal is reached

| priority | item | state | next step |
| --- | --- | --- | --- |
| **P2** | a key whose description carries no keyword scores 0 | the protocol is silent; this repository takes 0 | record it as a gap; do not invent a redistribution |
| **P3** | the sensitivity gate's cost grows linearly with claims | 142 claims, 194 runs, 4.0 min locally and 9.4 on the runner | the 15-minute budget holds about 300 runs at this rate; shard by file before then |
| **P4** | ~~six throw rows rest on a sentence rather than a measurement~~ | **closed**: every exempt throw states its claim and names the test that holds it, and rule 9 refuses a row that does neither | -- |
| **P5/P7** | the witness sees one level | a script loaded without `NODE_OPTIONS` is not rewritten, and a wrapper that does not inherit hides its child | unchanged; needs a second observation channel |
| **P8** | the compiler is a runtime dependency of four readers | `derive-gate-sites.mjs`, `gate-proofs.mjs`, the witness and the Vite plugin | "a gate with no dependencies" still needs a third correct reading |
| **P9** | the batteries jobs sit inside their budgets | 11.1 and 15.2 measured against 25 each; the longest bound expires at 24.2 of 25 | a fresh baseline before adding another battery -- and `R7` now makes forgetting it impossible |
| **P11** | a `heldBy` title is an index of an assertion | rule 9 checks that the title exists, not that the body still measures the claim | the `sensitivity` battery already knows how to hollow a claim; extending it to `heldBy` is the honest next move |
| **P12** | the pack's index is written by the reader that writes the archive | the two agree by construction, so the **tree** is the only third opinion | `build-example-bundle.test.ts` reads the tree now; a `--check` that also compared the archive against a fresh recursive listing would close it in the tool rather than in a test |

**The lesson, for the round after this one.** The six exemptions were not wrong -- every one of
them was true. What was missing was the difference between *a claim that is true* and *a claim
something measures*, and the inventory could not tell those apart because it recorded the claim
in the one form that cannot fail. So the ruler is: **when a table records a judgement, ask what
would have to change for that judgement to be wrong, and check that the answer is written down
next to it** -- a test name, a run id, a command. The four claims that were already paid for had
been paid for in a place the table did not point at.

## v3.51 — the exemption pointed at a title, and the title pointed at nothing

Last round ended with a table of six claims and one sentence under it: *when a table records a
judgement, ask what would have to change for that judgement to be wrong, and check that the
answer is written down next to it.* Four of the six had an answer written down -- the test that
holds the claim. What the table did not have was the other half of that answer: **what change
would make the claim false.** This round supplies it, runs it, and in doing so finds that the
pack's own check was comparing a list with itself.

### One — the tool agreed with the reader it was supposed to check (finding 400)

`site/assets/example-pack.json` is the page's index of the download, and `--check` compares the
archive against it. Both are produced by `readExampleFiles()`. That is finding 398's shape kept
alive one layer up: 398 was fixed in the reader, and the tool that should have caught 398 could
not, because it reads the reader's own output on both sides.

Writing the third opinion is what exposed it. The first version was

```js
const inTree = treeListing(EXAMPLE_DIR);
const missing = orphansInTree(EXAMPLE_DIR, inTree);   // the listing, compared with itself
```

which is empty for every tree, including one the reader had lost a file from. It printed
`example pack is up to date`. The line was read before it was run, which is the only reason the
round did not ship a check that cannot fail -- and it is the second time in two rounds that the
defect was in the instrument rather than in what the instrument measures.

The fix is a walk that shares nothing with the reader's recursion: `opendirSync` handles
descended by hand, against `readdirSync(..., { recursive: true })`. Two refusals follow from it,
and both are published numbers rather than assertions:

| direction | what it refuses | what it prints |
| --- | --- | --- |
| a tree file the pack does not carry | a short download with an agreeing index | the file names |
| the archive is not the tree plus three | a row nobody can account for | both counts, `10` and `6` |
| a symlink, where the readings disagree | the pack depending on which reading you take | both counts |

The symlink case is real rather than invented: `statSync` follows a link and `Dirent.isFile()`
does not, so a linked example is carried and not listed. The build refuses instead of choosing,
and the message carries both numbers so a person can decide.

### Two — a title is an index too (finding 401)

Rule 9 asks an exemption to name the test that holds its claim. It checks that the file exists,
that it is a test file, and that a test with that title exists. That is the most a rule can do
without reading an assertion -- and reading an assertion is not a thing a checker can do.

What a checker *can* do is the other end of the sentence: change the code so the claim is false,
and require the named test to go red. So each exempt row carries a fifth column:

| column | what it is | what reads it |
| --- | --- | --- |
| `statement` | the claim, one falsifiable sentence | rule 9 (shape), a person (meaning) |
| `heldBy` | `{file, test}`: the test that measures it, by exact title | rule 9 |
| `mutant` | `{file, find, replace, defect}`: the edit that makes it false | rule 10, and the battery |

`verify-claims-are-sensitive.mjs` applies each edit and runs the named file. **7 claims, 12 runs,
12 seconds.** Six go red on an assertion and one on the code's own guard -- the m1 partition's
claim is enforced by the probe's own refusal, so the test reds because the measurement refused
rather than because an assertion failed. A battery that credited any non-zero exit would call
that one an assertion; one that demanded `AssertionError` would call it unmeasured. Neither is
true, so the verdict has four answers:

```
red, with an assertion           the test measures the claim
red, on the code's own guard    the claim is enforced where it lives, and the test notices
green                            the title points at nothing
red, but the tree did not load  unmeasured: the mutation broke the subject, not the claim
```

The fourth is the one that matters. Every "the gate caught it" claim in this repository rests on
a run that failed, and a mutation that does not parse fails every suite for a reason about the
mutation. `BROKEN` is matched before the verdict is given, and a run that matches is reported as
unmeasured with the failure quoted -- which is finding 173's shape avoided, not asserted against.

### Three — the table of edits rots in the way the table cannot see (finding 402)

A mutation is a substring, so it is an index of the tree, and the tree moves. Rule 10 refuses an
edit whose `find` does not occur exactly once, and the battery refuses a file with uncommitted
changes before it writes to it. Both were exercised on this round's own tree:

- moving one `find` string out of the tree turned rule 10 red, naming the count and the file;
- running the battery mid-round refused with *"`scripts/build-example-bundle.mjs` has uncommitted
  changes, so a mutation would overwrite work this run cannot restore"*.

The second is the more useful of the two: the gate failing on the round that wrote it is the only
evidence that a precondition is doing anything.

### Four — what the battery cannot establish

It establishes that one specific edit makes the claim false and that the test notices. It does
not establish that the test's assertion *is* the claim: a test that goes red for an unrelated
reason passes. Two of the seven are caught by a refusal rather than an assertion, which is a
weaker notice than an assertion and is reported as such. And the edit is a **substitution**: a
claim can be falsified by an edit the table does not name, and the table will not know.

These are stated because the alternative is a green run that reads stronger than it is. What the
round adds is that a false claim now has a published way of being false, and a red run that
follows it -- where before there was a sentence and a title.

### Five — the round's own instruments

`gate-sites.json`: **120 failure sites across 57 of 80 scripts**, `excluded {17 zero}`, and **43
throw statements** -- 4 `fatal`, 35 `unguarded`, 1 `guarded`, 3 `rethrow` -- of which 36 are
proved and 7 are exempt, every exemption carrying a claim, a holding test and a falsifying edit.

### Six — the step that could not be added (finding 403)

The battery was written as its own CI step, bounded at three minutes against twelve seconds of
measurement, and then could not be published. The loop has four links: `R2` refuses a step the
recording has never measured; the recording comes from a run; a run comes from a push; the push
needs a green `verify:local`, which runs `docs:check`, which runs `R2` — and is red because the
step has no measurement. **The step's own measurement is on the far side of the gate that
demands it.**

`--borrow` is the same shape for jobs -- a new job's seconds are a neighbour's, with the
derivation written down -- and there is no equivalent for a step, because a job's cost does not
depend on which job it sits in and a step's cost is the thing being measured. So the round folds
the battery into the neighbouring step's command: one `&&`, one bound, the same runner. The price
is the name. A reader who trusts *"Every proved exit can disappear without a word"* is now reading
a summary that is no longer complete, and that is written in the workflow rather than absorbed.
The fix -- a third derivation in the recording, for a step that is new or newly named -- is
P15, and it is not this round's work.

### Seven — the run, and the push that carried one commit of four (finding 404)

| CI | run `41809961840` on `b323263a0`: **7 of 7 jobs success** -- batteries-heavy **15.6**,
batteries **8.2**, build 9.1, sensitivity **10.0**, golden master 0.6, backend 0.6, cold tree
0.4 min; **15.6 min of wall clock**. The run before the round, `41785707854` on `de4242299`, was
7 of 7 in 12.6 |

The recording was re-taken from that run, as `R7` requires: the ledger's newest row is now this
one, and a recording older than the run the round reports describes a tree nobody shipped. The
tightest bound after the re-record is `verify / Lint` at 2.0x.

The ceiling moved with it, and the number is derived rather than picked. The one expensive step
of `sensitivity` measured **542 s** in the previous run and **578 s** in this one -- the claims
battery is the 36 s between them. Twice 578 is 1156 s, so its bound is 20 minutes; the 19 s of
setup in front of it puts the bound's expiry at 1219 s; a 20-minute ceiling would kill the job 19
seconds before the step's own bound could fire, which is exactly the defect step bounds exist to
remove (`R5`). So the ceiling goes 20 -> **21**, which is `ceil(1219 / 60)`. The bound moved first
and the ceiling followed, in that order, because a ceiling is a backstop and the bound is the
number that names a hang.

#### Finding 404 — the push sends the head revision, so a round of commits arrives as one

Four commits were made for this round: `10ef7dd` (the claim's falsifying edit), `b7ae319` (the
docs), `091650a` (the step that could not be added), `35645c4` (the two defects the local gate
found). The remote holds **one**, `b323263a0`, whose message is the last of them.

The mechanism is the publishing channel and it is written down in it: the API takes a message and
a set of files, so every push rebuilds its commit object; when the local parent is the remote tip
the rebuild lands on the same sha, and when an earlier push already rebuilt one, the tip is posted
**on the remote tip** and the commits in between are never sent. The tree survives -- every push
ends by comparing the published tree with the local one and refuses to move the ref if they
differ -- and the messages do not.

Nothing in this repository could have noticed. The receipt gate asks about a **tree**. `docs:check`
reads files. CI checks out a tree. The audit's own questions are about what the tree can
demonstrate. A log is the one artefact no gate reads, so a push that quietly rewrites it is a push
that passes everything.

The fix is to replay rather than hop: walk back from the revision being published to the newest
commit whose **tree** the remote already holds -- a tree is the only thing the two repositories can
honestly be compared on, since the shas of rebuilt commits differ -- and post each commit after it
in order, each one on the one before. A round is three or four commits, so a replay is three or
four tree diffs. `PUSH_PLAN_ONLY=1` prints the plan and creates nothing, which is how the decision
was read before it was published.

This close-out commit is the first use: it is published as its own commit rather than folded into
the last, which is the property the fix is for. The limit is stated rather than hidden: the
publishing channel is not in this repository, so no test in this suite covers the replay, and the
next round that touches it will be reading it rather than running it (P16).

### Readings

> Ledger for `v3.51`.

| item | value |
| --- | --- |
| `core` test suite | **234 files, 5740 tests passed** |
| `cli` test suite | **4 files, 187 tests passed** |
| repo test suite | **238 files, 5927 tests passed** |
| new tests | **27**: 12 in `claims-are-sensitive.test.ts` (every verdict and every refusal of the new battery), 11 rule-10 cases in `gate-sites-are-proven.test.ts`, 4 in `build-example-bundle.test.ts` (two third-opinion cases, the published counts, and the symlink that makes the two readings disagree) |
| throw partition | **43 statements**: 4 `fatal`, 35 `unguarded`, 1 `guarded`, 3 `rethrow`; 36 proved; **7 exempt, every one carrying a claim, a holding test and a falsifying edit** |
| failure sites | **120** across 57 of **80** scripts; `excluded` `{17 zero}` |
| the claims battery | **7 claims, 12 runs, 12 s** -- 6 red on an assertion, 1 on the code's own guard, **0 survivors, 0 unmeasured** |
| coverage | core **99.96 / 99.75 / 100 / 99.96**, cli **100 / 100 / 100 / 100** |
| the pack's two readings | archive **10 rows**, tree **6 files**, three generated files apart; a symlinked example is carried by the reader and invisible to the listing, so the build refuses and prints both counts |
| the defect in the instrument | the first version of the orphan check compared the listing with itself, which is empty for every tree and printed `up to date` |
| the recording | **run 41809961840** at `b323263a0`, 7 jobs / 74 steps / **46 bounded**, 44 min measured; taken from the run this round's ledger row names, which is `R7` working on the round that reports it |
| the bound and the ceiling it needs | the sensitivity step 19 -> **20** minutes (578 s measured; twice is 1156 s) and the job 20 -> **21**, which is `ceil((1200 + 19) / 60)` -- a 20-minute ceiling would have killed the job 19 s before the step's bound could fire |
| the log | **four local commits, one remote commit** until this close-out (finding 404); the push now replays the ancestry and publishes each commit as itself |

### Left open, in the order the goal is reached

| priority | item | state | next step |
| --- | --- | --- | --- |
| **P2** | a key whose description carries no keyword scores 0 | the protocol is silent; this repository takes 0 | record it as a gap; do not invent a redistribution |
| **P3** | the sensitivity gate's cost grows linearly with claims | 142 claims, 194 runs, 10.0 min on the runner; the claims battery adds 12 runs and 36 s | shard by file before the claims outgrow the job rather than the step -- the ceiling has 1 minute of headroom left after this round |
| **P5/P7** | the witness sees one level | a script loaded without `NODE_OPTIONS` is not rewritten, and a wrapper that does not inherit hides its child | unchanged; needs a second observation channel |
| **P8** | the compiler is a runtime dependency of four readers | `derive-gate-sites.mjs`, `gate-proofs.mjs`, the witness and the Vite plugin | "a gate with no dependencies" still needs a third correct reading |
| **P9** | the batteries jobs sit inside their budgets | 15.6 and 8.2 measured against 25 each; the longest bound expires at 24.2 of 25 | a fresh baseline before adding another battery -- `R7` makes forgetting impossible, `R2` makes adding a step visible |
| **P13** | a mutation is one substitution | a claim can be false in ways the table does not name, and the table cannot tell | the next honest step is a second mutant per claim, or a battery that mutates the *assertion* rather than the code |
| **P14** | one of the seven notices is a refusal, not an assertion | the m1 partition's claim is enforced by the probe refusing to publish | a claim whose only notice is a refusal is weaker than one a test asserts; say so per row rather than in a summary |
| **P15** | a CI step cannot be added or renamed, and its name can therefore go stale | the step's own measurement is behind `R2`, a run, a push and the receipt (finding 403) | a third derivation in the recording, the way `--borrow` is for jobs; until then a new battery shares a step name that no longer describes it |
| **P16** | the publishing channel is outside the repository and has no test | the replay that fixes finding 404 lives in the push script, which this suite never loads | move the plan computation into a module the suite can import, the way `ci-budget.mjs` was moved out of the gate |

**The lesson, for the round after this one.** Two rounds in a row, the defect was in the
instrument rather than in the thing it measures: last round a pack reader that walked one
directory, this round a check that compared a list with itself. Both were written by somebody
who had just read the code they were checking. So the ruler is: **for every check, name the two
things it compares and where each of them comes from** -- and if they come from the same place,
the check is a restatement, however green it is.

The close-out added a third, and it is the same ruler turned on the *output* rather than on a
check: a tree is what every gate reads, and a **log** is what none of them reads, so a channel
that carries trees can drop messages through a green run. Name, for every artefact a round
publishes, which gate reads it -- and treat "nothing reads this" as a position on the map rather
than a reassurance.

## v3.52 — a step nobody could add, and the name it left behind

Last round ended with a step that ran two batteries under one name, and with the sentence that
explained it: *a step cannot be added, and a measurement cannot happen without the step.* The
explanation was correct and it was also an admission -- the repository had a class of change it
could not make, and every future battery would inherit the same compromise. This round closes the
class.

### One — a name narrower than its command (finding 405)

`ci.yml` carried

```yaml
      - name: Every proved exit can disappear without a word
        timeout-minutes: 20
        run: node scripts/verify-sites-are-sensitive.mjs && node scripts/verify-claims-are-sensitive.mjs
```

The name describes the first command. The second asks a different question -- *can an exemption's
claim be made false* -- and a reader who trusts the name is reading a green line about a battery
that did not run. That is the defect a step bound exists to remove, one level down: the verdict
names something that is not the one that hung.

The four rings that made it unavoidable were each correct on their own:

1. `R2` refuses a step the recording has never measured, because a bound sized from no measurement
   is a number somebody typed;
2. `measure-ci-baseline.mjs` refuses to write a reading that omits any step of the workflow, because
   a partial recording describes a tree that never ran;
3. `verify:local` runs `docs:check`, which runs that gate, so the tree cannot be pushed while the
   step is unmeasured;
4. the run that would measure the step exists only after the push.

A closed loop of four correct rules. The previous round's answer was to stop needing the step.

### Two — what a tree can still say when it has no number (finding 405)

The rings are all about *measurement*. A round that adds a step cannot supply a measurement and can
supply several other things: the step exists, its bound is written in the workflow, the job's budget
is declared, and every step in front of it has been measured. So the missing number is isolated in a
file of its own rather than let into the recording:

```json
{
  "declared": [
    {
      "job": "sensitivity",
      "step": "Every exemption's claim can be made false",
      "minutes": 3,
      "why": "The claims battery shared the sites step for one round because a step could not be measured before it existed (findings 403 and 405). It runs its own command from this round on, and the first run that measures it deletes this sentence."
    }
  ]
}
```

`R8` is the arithmetic over that list, and every clause is a refusal a reader can act on:

| the clause | what it refuses |
| --- | --- |
| the step exists in the job it names | a promise about a step that was renamed or removed |
| the bound is the workflow's own | two numbers, and a reader deciding which one kills the run |
| the recording does not measure it | a promise that outlived its measurement -- the bound nobody checked |
| the bound clears the floor | a step that has not run is exactly the case the floor is for |
| the bound expires inside the job | an arithmetic that skips a hole, computed from the measurements in front |
| it is the last unmeasured step of its job | a bound after it argued from a sum with an unknown in it |
| it argues for itself in forty characters | a claim about unwatched work with no words behind it |
| an empty list is refused | the file becoming furniture |

The lifetime is one recording, and the mechanism is structural rather than promised: the recorder
cannot write a reading that omits the step, `R7` forces a refresh on every round that cites a run,
and `R8` refuses the tree until the sentence is gone. So a declaration is a promise that is kept or
the round does not close.

### Three — what the declaration cannot do

`R4` -- the bound is at least twice the measurement -- is the one rule with nothing to stand on
before the measurement exists. That is not an oversight, it is where the bet is placed: the round
that adds the step guesses a number and the round that refreshes finds out. If the guess is too
small, the refresh is refused with a bound, a measurement and a ratio, which is a sentence somebody
can act on; the alternative was the standing refusal of every new step, which produced the name this
round deletes.

A whole **job** is still out of reach, and the file says so rather than leaving the gap to be
discovered: a new job's budget is part of what `R6` compares, so a job that has never run is covered
by `--borrow` (which copies seconds) and nothing else. The next round that needs a new job will find
that out from the gate rather than from this paragraph, which is the correct order.

### Four — a borrowed measurement carried a budget it never spent (finding 406)

The recorder writes `timeoutMinutes` from the workflow it has just read. For a job recorded with
`--borrow`, that is the *target's* budget, so `R6` compared the workflow with itself and could never
fire for that job -- while the deadline arithmetic was argued from a ceiling the borrowed seconds had
never been spent inside.

The fix is a refusal in the recorder, where the source job is still known:

```
--borrow batteries-heavy=batteries crosses a budget: `batteries-heavy` declares 40 minutes and
`batteries` declares 25 minutes. The seconds describe the same commands, but a bound has to fit the
job that will enforce it, so a borrow is only a substitute for a measurement inside one budget
```

A step's cost is a property of the command. A budget is not, and the check that could not tell them
apart was comparing one thing with itself -- the third round in a row where that was the defect.

### Five — the round's own instruments

| instrument | what it says now |
| --- | --- |
| `ci.yml` | **75 steps** in 7 jobs, **47 bounded**; bounds total **208 min** against 44 min measured |
| the declaration | **1** step, `sensitivity / Every exemption's claim can be made false`, 3 min, awaiting the run that measures it |
| `gate-sites.json` | **121 failure sites** across 57 of 80 scripts, `excluded {17 zero}`; **44 throws** -- 5 `fatal`, 35 `unguarded`, 1 `guarded`, 3 `rethrow` |
| the step count the plan prints | `sensitivity bounds all 4 of its step(s) on its own`, and the largest is still 20m of the job's 21m |

### Readings

> Ledger for `v3.52`.

| item | value |
| --- | --- |
| `core` test suite | **234 files, 5755 tests passed** (as of this commit) |
| `cli` test suite | **4 files, 187 tests passed** (as of this commit) |
| repo test suite | **238 files, 5942 tests passed** (as of this commit) |
| new tests | **15**, all in `ci-budget.test.ts`: every clause of `R8` (seven refusals and the pair that shows the declaration doing the work), the reading it prints, the shipped pair, the malformed file through the gate, the recorder's "now measured" line, and the borrow across a budget |
| throw partition | **44 statements**: 5 `fatal`, 35 `unguarded`, 1 `guarded`, 3 `rethrow`; 37 proved; 7 exempt |
| failure sites | **121** across 57 of **80** scripts; `excluded` `{17 zero}` |
| the new refusal | `check-ci-budget.mjs` gains one site (a declarations file that cannot be read) and `measure-ci-baseline.mjs` one throw (a borrow across a budget) -- both proved by the same test file |
| the declaration | **1** entry, and the gate is green *because* of it: the same tree without the file is refused, which is the pair the round's first case asserts |
| the step | `sensitivity` now bounds **4** steps; the sites battery keeps 20 min (578 s recorded, 542 s real) and the claims battery gets the 3-minute floor |

One correction to the tables above, and it is about the tables themselves. A count
marked `as of this commit` has to equal the live measurement, so every round that adds tests
rewrites the marked rows of the rounds before it -- v3.49, v3.50 and v3.51 all now read
`5740 / 5927`, and none of them measured that. This round drops the marker from those three
tables and leaves their numbers where they are: they become **records of the state at the close
of v3.51**, which is what they can honestly be. The marker stays on this round's table, so there
is always exactly one row that claims to be now.

### Left open, in the order the goal is reached

| priority | item | state | next step |
| --- | --- | --- | --- |
| **P3** | the sensitivity gate's cost grows linearly with claims | 142 claims, 194 runs, 10.0 min on the runner, and the two batteries now have separate bounds | shard by file when either battery approaches twice its measurement; the split means growth in one no longer spends the other's margin |
| **P17** | a job that has never run can only be recorded by `--borrow` | a new job's budget is part of `R6`'s comparison, so there is nothing to compare | a declaration for a job, which would have to state its budget and every step's bound -- the same shape one level up |
| **P13** | a mutation is one substitution | a claim can be false in ways the table does not name | unchanged this round |
| **P14** | one of the seven notices is a refusal, not an assertion | the m1 partition's claim is enforced by the probe refusing to publish | unchanged this round |
| **P16** | the publishing channel is outside the repository and has no test | the replay that fixes finding 404 lives in the push script | unchanged this round |
| **P2** | a key whose description carries no keyword scores 0 | the protocol is silent | unchanged |
| **P5/P7** | the witness sees one level | a script loaded without `NODE_OPTIONS` is not rewritten | unchanged |
| **P8** | the compiler is a runtime dependency of four readers | unchanged | unchanged |
| **P9** | the batteries jobs sit inside their budgets | 15.6 and 8.2 measured against 25 each | a fresh baseline before adding another battery |

**The lesson, for the round after this one.** The previous round's ruler was *name the two things a
check compares and where each comes from.* This round's is the same ruler applied to a **file**: for
every file a tool writes, name the fields the tool cannot know, and see whether the tree has another
place to put them. `ci-baseline.json` is written by one script and holds measurements; a round that
needed a fact the script could not measure had been writing it as a longer command line, and the name
of the step paid for it. A file with one writer and one kind of content is a file whose gaps are
visible; a file with two kinds of content is one where a promise can hide inside a measurement.
