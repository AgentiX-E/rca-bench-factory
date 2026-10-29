# Audit report

Findings from the scoring-path, OTLP-ingest and LLM-layer audits, with the
measurement that established each one. Every entry follows the same shape: the
defect, the command that demonstrated it, the observed number, the fix, and the
guard that now fails without the fix.

A finding is only listed here after being reproduced locally. A finding that only
appeared in a review, without a failing measurement, is not a finding.

## Scope

Seven passes so far:

- **Pass 1** — `packages/core/src/score/`: the official-metric scoring path. This
  is the code that decides whether an export is scorable and what number it
  earns, so a defect here silently mislabels a dataset rather than crashing.
- **Pass 2** — `packages/core/src/ingest/otlp.ts`: the OTLP JSON ingest. It is the
  largest under-verified surface in the package (403 source lines, one test file)
  and the main real-world entry point for exporter output, so a defect here
  distorts every downstream number.
- **Pass 3** — `packages/core/src/llm/openai-compat.ts` and
  `packages/core/src/fault/importer.ts`: the shared LLM transport and the
  historical-fault importer. Both were at the top of the under-verified list.
- **Pass 4** — `packages/core/src/llm/rulegen.ts` and
  `packages/core/src/llm/anthropic.ts`: the LLM rule-generation core and the
  second transport adapter. With pass 3 this covers the whole `llm/` directory,
  which is where the provider-agnostic abstraction lives and therefore where a
  vendor-shaped assumption costs the most.
- **Pass 5** — `packages/core/src/cli/args.ts`: the argument parser in front of
  every command. It is the boundary at which a malformed invocation becomes an
  internal one, and the file the whole CLI's error contract is written in. A
  validation gap here does not mislabel a number the way pass 1 can; it moves a
  failure from "the parser refused this and said why" to "some later stage
  threw", and the caller cannot tell the two apart from the exit code.
- **Pass 6** — the official-data round trip: `scripts/fetch-official.mjs`,
  `packages/core/src/export/rcaeval.ts`, the `--official-dir` branch of
  `scripts/check-official.mjs`, and the two guard scripts
  (`check-no-vendored-data.mjs`, `gen-rcaeval-cases.mjs`). Every other pass audited
  a path whose correctness the suite could decide on its own. This one audits the
  path that takes the repository *outside* its own fixtures, which makes the test
  harness itself part of the subject: a fixture that cannot express the upstream
  layout produces a green suite that establishes nothing, and three of this pass's
  four findings are exactly that.
- **Pass 7** — two measurement surfaces rather than two modules: the root
  `typecheck` entry point, and the branch positions the coverage figure was not
  counting. Both are the same class of defect as each other and as pass 6's — the
  instrument agreed with the thing it was measuring. `pnpm typecheck` was green
  because a previous step had built the tree, and the branch figure was stable
  because the positions it missed were missed in the same way on every run. Neither
  could be found by reading the code under test; both were found by asking what the
  measurement would look like if it were wrong.

## Volumes

The findings live in one file per size budget, because one 1.1 MB document is a pile
rather than a document: a reader cannot find an entry without `grep`, and the push that
carries one new finding carries all of them. The split is by size, not by subject --
a finding that belonged to a theme keeps its number, and numbers are what the rest
of the repository cites. (This sentence said "6 files" while there were seven: a count
in prose is a number that goes stale on the next split, and the table below is the one
that is checked.)

| file | findings | entries | opens with |
| --- | --- | --- | --- |
| [volume-01.md](audit/volume-01.md) | 1–82 | 82 | The regression graded its own answer key |
| [volume-02.md](audit/volume-02.md) | 83–112 | 30 | the stability gate was never run, and four of its properties ... |
| [volume-03.md](audit/volume-03.md) | 113–159 | 44 | the anchor workflow cited a helper that does not exist, and t... |
| [volume-04.md](audit/volume-04.md) | 160–195 | 36 | the second backend was declared unimplementable, and the decl... |
| [volume-05.md](audit/volume-05.md) | 196–254 | 59 | the gate that could not be proved, and the reference with four meanings |
| [volume-06.md](audit/volume-06.md) | 255–266 | 12 | the corpus is two documents joined by one string, and nothing read both |
| [volume-07.md](audit/volume-07.md) | 267–275 | 9 | the layout we wrote is not the layout the loader reads |
| [volume-08.md](audit/volume-08.md) | 276–289 | 14 | the loudest series is not the answer, a reading sits on its unit's grid, and a spread of zero is a step of the declaration |
| [volume-09.md](audit/volume-09.md) | 290–297 | 8 | every test passed and the run was not green |

**Where a new finding goes.** Append to the last volume. When it would grow past
280,000 bytes, start the next volume -- one number higher than the last, holding the
new finding and nothing else -- and add its row above with the first and last number
it holds. The name is not written down here: a next-volume name in prose is a number
that has to be retyped on every split, which is the defect the byte column had. The sizes are not printed here because they
change on every append and a table of stale numbers is worse than no table;
`node scripts/check-audit-volumes.mjs` prints the largest volume against the budget,
and fails if a volume is over budget, if the numbering gaps, or if a volume exists
that this table does not name.

**Two sections sit between findings 44 and 45** -- [Method](#method) and
[Retractions](#retractions) -- and they are here rather than in a volume because
they are about the log rather than about one entry.

## Summary

### Pass 1 — scoring path

| # | Defect | Reproduced as | Status |
| --- | --- | --- | --- |
| 1 | The official-metric regression graded its own answer key | 4 of 4 corruptions silent | fixed |
| 2 | `rateOf` scored an empty denominator as a perfect match | `{"process":1,"chainNodeMatch":1}` → 100 | fixed |
| 3 | `checksumRate` divided by the anchor set, not the export | 1 anchor, 22 files → `score: 100` | fixed |
| 4 | `aggregateFor` had no branch for `openrca-2.0` | `final: 0` beside `accuracy: 0.75` | fixed |
| 5 | AIOps2025 `explainability` scored an empty corpus 1 | empty export → `final: 10` | fixed |
| 6 | A vacuous structure report earned half the score | empty export → `score: 15` | fixed |

Finding 6 was not in the original audit. It surfaced while building the guard for
finding 2 and is recorded because it is the same error one level up.

### Pass 2 — OTLP ingest

| # | Defect | Reproduced as | Status |
| --- | --- | --- | --- |
| 7 | `asInt: 42` (numeric form) lost the data point | legal document → 1 quarantine, 0 signals | fixed |
| 8 | Nanoseconds scaled by the float `1e-6` | 1 ms span → `0.999755859375` ms | fixed |
| 9 | Span status delivered by enum name was dropped in silence | error span → no `status`, no quarantine | fixed |
| 10 | `severityText: ''` quarantined as an invalid severity | 1 signal → 1 quarantine entry | fixed |
| 11 | A sub-millisecond inverted span truncated to a legal 0 ms | `-1 ns` span → `durationMs: 0` | fixed |

Finding 11 surfaced while building the guard for finding 8: once durations were
exact, the negativity check was revealed to be reading the truncated value. It is
recorded separately because the fix is a different one.

### Pass 3 — LLM transport and fault importer

| # | Defect | Reproduced as | Status |
| --- | --- | --- | --- |
| 12 | Only `choices[0]` was read, discarding a usable answer | 2 choices, 2nd usable → threw | fixed |
| 13 | A null choice leaked a raw `TypeError` | `choices: [null]` → `Cannot read properties of null` | fixed |
| 14 | `''` accepted as a completion | empty answer indistinguishable from a real one | fixed |
| 15 | Category read verbatim against a case-sensitive vocabulary | `NETWORK` → parsed `ok`, then `valid: false` | fixed |

Finding 15 is the only one in this report where the defect spans **two functions**
rather than sitting inside one: the prompt never stated the rule the parser
enforced. Reading either file alone shows nothing wrong.

### Pass 4 — LLM rule generation and the Anthropic adapter

| # | Defect | Reproduced as | Status |
| --- | --- | --- | --- |
| 16 | A layout field outside the contract was dropped, not rejected | `{"timstamp": "time"}` → parsed `ok: true` | fixed |
| 17 | A cross-kind field name passed the membership check | `spanName` in a metric layout → accepted | fixed |
| 18 | `semanticType` was cast, not checked against its enum | `"not-a-real-semantic-type"` → reached the IR | fixed |
| 19 | An empty sample set validated as a pass | `validate(layout, 'metric', [])` → `valid: true` | fixed |
| 20 | The prompt never named the semantic-type vocabulary | prompt printed the field, not its values | fixed |
| 21 | Only `content[0]` was read | leading `tool_use` block → threw, answer discarded | fixed |
| 22 | A completion split across text blocks was truncated | 2 text blocks → returned the first only | fixed |
| 23 | A null content block leaked a raw `TypeError` | `{"content":[null]}` → `Cannot read properties of null` | fixed |

Findings 17 and 20 surfaced while building the guard for finding 16, and 22 while
building it for 21. They are listed separately because each has its own fix: the
membership check had to become per-kind, the prompt had to name a vocabulary it
had only ever named as a field, and reading every block is a different change from
reading more than one.

### Pass 5 — CLI argument parsing

| # | Defect | Reproduced as | Status |
| --- | --- | --- | --- |
| 24 | `evolve stale --cases` was checked for JSON-ness, not for the array its consumer needs | `'{"not":"array"}'` → parse `ok: true`, then threw mid-command | fixed |
| 25 | `--anchors` checked the outer object, not its entries | `{"a.txt":123}` → parse `ok: true` | fixed |
| 26 | `--assume-offset-minutes` was any finite number | `1e21` → core `RangeError: Invalid time value` | fixed |
| 27 | The window flags used `/^\d+$/` and `Number()` | 21-digit literal → `1e20`, silently | fixed |
| 28 | A path flag rejected `''` but not `'   '` | `--path "   "` → parse `ok: true`, then ENOENT | fixed |

All five are the same error at five sites: a check that establishes less than its
consumer requires, so the parser reports success and a later stage reports
failure. They divide into two lessons.

**Findings 24 and 25 — "is JSON" is not a contract.** `JSON.parse` succeeding
says the text is well-formed; it says nothing about what the value is.
`evolve stale --cases` feeds `runEvolveStale`, which calls `.map` on it, and
`--anchors` feeds a hash comparison, which can only ever compare strings. Both
were accepted as any JSON at all. The fix is that each flag names the shape its
consumer needs, at the boundary, so the caller learns the shape was wrong from a
message that says so.

Note which flag was *not* changed: `ingest --cases` carries a file **path**, not
JSON, and a path may be any string at all. Sharing a flag name across two
commands is not the same as sharing a contract, and finding 24 exists because the
first draft of this report conflated them. The acceptance criteria are now stated
per command, and a test pins the `ingest` side so nobody "fixes" it later.

**Findings 26 and 27 — `Number()` is not a parser.** `Number.isFinite` and
`Number.isSafeInteger` describe a value; they do not describe the text that
produced it. `Number('0x10')` is 16, `Number('1e3')` is 1000, and a 21-digit
literal is a double that is no longer the literal. Finding 26's `1e21` reached
`Date.toISOString()` and threw `RangeError: Invalid time value`, which is a core
exception surfaced to a CLI caller as though the command were broken; finding
27's window *did not throw at all*, which is worse — a lead window of `1e20` ms
is roughly three billion years, it parses, and nothing downstream ever notices.
The fix is one `parseInteger` used by every integer flag: a decimal-integer
pattern, an exact round trip through `String(n) === text` to make precision loss
observable, then a range the flag's own meaning supplies.

**Finding 28 — blankness is a value, not a length.** `''` was rejected and
`'   '` was not, so the same mistake typed with spaces opened a file named three
spaces. The fix tests blankness after trimming, on every path flag, and returns a
distinct `null` for blank versus `undefined` for absent — because "the flag was
not given" and "the flag was given something unusable" are different errors with
different messages.

### Pass 6 — the official-data round trip

| # | Defect | Reproduced as | Status |
| --- | --- | --- | --- |
| 29 | `caseDirName` deleted hyphens from the component, so the round trip read a path that does not exist | `ts-order-service` → `dataset/tsorderservice/…` | fixed |
| 30 | `unzip` was invoked unconditionally, including on assets that are not archives | a `.csv` asset → `unzip: cannot find zipfile` naming no asset | fixed |
| 31 | The case-descriptor generator dropped its warnings when every case was skipped | empty result, empty stderr, exit 0 | fixed |
| 32 | The archive fixture in the fetch test was malformed in the way the *script* was suspected of being | `unzip`: `End-of-central-directory signature not found` | fixed |
| 33 | A byte count was pinned with no digest beside it, and the fetch enforces the byte count | `rcaeval-baro-simple`: `bytes: 570409`, `sha256: null` | fixed |
| 34 | The registry named a cross-repository cache read that cannot work | six shards, `total_count: 0`; scope is per-repository | fixed |
| 35 | *(withdrawn)* The backoff guard was blamed for a 9-second delay it did not cause | restoring the guard left the time unchanged: 9.074s → 9.075s | no defect |
| 36 | `--retry-connrefused` and the attempt loop both retried; the elapsed time measured curl's retries | refused connection in 0 ms reported as `after 3.0s`; removal: 9.075s → 0.067s | fixed |
| 37 | `--fail` collapses 4xx and 5xx onto exit 22, so the classifier could not tell a 404 from a 500 | 404, 500, 503 all exit 22; only the message differs | fixed |
| 38 | The corpus summary counted directories under the word "file" | `found N file(s)` where N included directories | fixed |
| 39 | A 2.8 GB download was verified with `readFileSync`, which cannot read above 2 GiB | `ERR_FS_FILE_TOO_LARGE` on `RE2-TT.zip` after two assets had measured clean | fixed |
| 40 | *(withdrawn)* The partial run was said to discard its measurements on a non-zero exit | the report **is** written before the exit code: exit 1, report present, 1 pin | no defect |
| 41 | Every fixture was under one digest chunk, so a prefix-only digest passed the suite | `break` after the first `hash.update`: 30/30 green, digest changed | fixed |
| 42 | The corpus reader assumed our exporter's flat layout; the corpus is nested three deep | `derive the case descriptors` found no cases under a tree full of them | fixed |
| 43 | The CI fixture that exercised finding 42 was itself written in the old flat layout | the fix passed locally and `anchor-roundtrip.yml` still failed on `RE2-ts-order-service-cpu_1` | fixed |
| 44 | `official-data.yml` had no concurrency group, so a second dispatch cancelled the first | two runs of 2026-09-20 both `cancelled`, neither producing a measurement | fixed |
| 45 | The corpus walk read every file in the tree into one `Record<string, string>` | exit 134 on the real corpus: `heap out of memory` at 4182 MB, no `ROUNDTRIP` line | fixed |

Findings 31 and 32 are not defects in shipped code. They are defects in the
*instruments* — the generator's diagnostics and the test fixture — and they are
listed because each one produced a green result that would have been read as
evidence. A warning that is swallowed and a fixture that cannot be parsed both make
a test pass for a reason that is not the reason the test exists.

Findings 33 and 34 came from building the guard and then running it against the
shipped registry, which is worth recording as a method note: both were *in the file
this pass was writing about*, and neither was visible from reading it. 33 is a
number that looks like a measurement and is not; 34 is a mechanism that sounds like
a mechanism and is not. Reading the registry would have found neither, and the
second one had been repeated in the workflow comment and in the progress document
before it was measured.

Findings 35 through 37 came from *timing* the failing path instead of reading it, and
that is the method note for this pass — together with its counterexample. The fetch
had already failed once on a real runner, and the only thing that failure report
established was that it took twelve minutes, which is not what a missing URL looks
like. Reproducing it locally against a loopback server that refuses in microseconds
turned "it failed" into three separate observations, of which **two were real defects
in code this pass had just written** — a second retry mechanism that corrupted the one
measurement on the line, and a classifier keyed on a number that `--fail` overwrites —
and one was a defect in the *audit* itself.

Finding 35 is the counterexample and it is the more useful half. The number was
measured honestly and the cause was then attributed to the nearest suspicious-looking
code, which is a reading of the source that borrows the probe's authority. The check
that separates measurement from attribution costs one command — remove the suspected
cause and see whether the number returns — and it was skipped once, in a pass whose
whole argument is that it should not be. Findings 36 and 37 were then confirmed by
that check, and 36's fix is justified by a removal table rather than by a claim.

Findings 39 through 41 close the pass on the first run of the path this whole
document is about, and they divide cleanly into the three kinds of thing an audit
finds. Finding 39 is a real defect, in code written for this pass, on the first
input large enough to expose it — the two assets that came first were both under
2 GiB, so the ceiling could not have been visible earlier in the same run. Finding
40 is a *withdrawal*: the mechanism was inferred from two log lines rather than
measured, and the measurement contradicts it. Finding 41 is a gap in the tests
that only an injection could reveal, and it is the one to read if you read only
one: the suite was green, the codepath was wrong, and the reason was that no
fixture was ever large enough to tell the two implementations apart.

### Pass 7 — the corpus's layout, twice

Findings 42 and 43 are one defect found twice, and the second time is the more
instructive of the two.

**Finding 42.** The third real run fetched all three assets and then failed at
`derive the case descriptors`:

```
error: no RCAEval case directories found under '/tmp/official'.
Expected names of the form {RE1|RE2|RE3}-{service}-{fault}_{instance} each holding inject_time.txt.
```

The pattern in that message is the defect stated plainly. `RE2-order-cpu_1` is
the name *our exporter* writes. The corpus does not contain it, at any level,
because the corpus is nested:

```
RE2-OB/checkoutservice_cpu/1/inject_time.txt
```

The upstream harness says so twice. `main.py` finds the cases by globbing
`**/data.csv` and reads the labels back out of the path —

```python
data_dir = dirname(data_path)                                      # …/{service}_{fault}/{run}
service, metric = basename(dirname(dirname(data_path))).split("_")  # service, fault
case = basename(dirname(data_path))                                 # {run}
```

— and `docs/TORAI.md` prints the tree for the RE2 conversion:

```
data/torai-OB/{service}_{fault_type}/{run}/inject_time.txt
```

So a case is three components with the suite fused to the *system* in the first
one. `RE2-OB` alone is neither a suite nor a case; `checkoutservice_cpu` alone
carries no run. No single directory name can carry the case, which is why a
per-component parse reported nothing over a tree full of cases.

The reason this survived every in-repo check is worth stating separately, because
it is a general failure mode rather than a slip. The reader, the writer and the
unit tests all agreed — the tests asserted `RE2-order-cpu_1` because that is what
`caseDirName` produces, and the reader was validated against what the writer
emitted. **A reader tested only against the writer describes neither the corpus
nor the writer's correctness; it describes their agreement.** Finding 29 had the
same shape and was fixed by widening the character allow-list, which made the
agreement more exact without making either side right.

The fix keeps the two layouts in separate functions rather than teaching one
function to guess between them. `parseRcaEvalPath` reads the corpus;
`parseRcaEvalDirectory` reads what we emit; `readRcaEvalGroundTruth` accepts
either. A single function that tried both would have hidden this mismatch and
would hide the next one, and the two layouts are not interchangeable — one places
the suite in a path component, the other inside a directory name.

**Finding 43.** The fix for 42 passed its unit tests, passed `pnpm test`, and
`anchor-roundtrip.yml` still failed on the same error. That workflow builds a
synthetic corpus and derives descriptors from it on every push, and the corpus it
built was one flat directory named — verbatim — `RE2-ts-order-service-cpu_1`:

```
mkdir -p /tmp/synthetic/RE2-ts-order-service-cpu_1
```

The fixture was written in the layout the reader assumed, so it had been
confirming the assumption rather than testing it. This is finding 42 one level
up and in the *instrument*: the code was wrong, and so was the thing that
certified it. Fixing the code alone left the certification intact.

The corrected fixture is the corpus's own shape, and the workflow now also
asserts the derived `caseId`, so a future drift in the path parse fails naming
the field rather than surfacing as a zero score:

```
CASE=/tmp/synthetic/RE2-TT/ts-order-service_cpu/1
```

Verified end to end after the fix, locally, on that fixture:

```
ROUNDTRIP PASS   1/1 RE2-TT/ts-order-service_cpu/1  target=rcaeval-re2  oracle=1.00 signals=80
ROUNDTRIP PASSED (1 case(s) round-tripped through the official layout)
```

**The method note for this pass** is that both findings are the same error —
*testing a thing against a copy of itself* — and that the second one was only
found because the first was fixed and the fix was then run against something that
was not the fix. Finding 41 was a fixture too small to distinguish two
implementations; finding 43 is a fixture too similar to the implementation to
distinguish two layouts. Both were green. Neither was evidence. The check that
finds them is not reading the test but asking what the test would do if the code
were wrong, and in 43's case the answer was *pass*, because the fixture had been
written from the code.

**Finding 44** is in this pass because this pass caused it. Three dispatches of
`official-data.yml` were issued at `307fb460` inside two minutes, and two of them
were cancelled by hand to stop them competing:

| run | revision | status | what it produced |
| --- | --- | --- | --- |
| [#35485498167](https://github.com/AgentiX-E/rca-bench-factory/actions/runs/35485498167) | `307fb460` | left running | the measurement |
| [#35485506741](https://github.com/AgentiX-E/rca-bench-factory/actions/runs/35485506741) | `307fb460` | `cancelled` during `Fetch the corpus` | nothing |
| [#35485547947](https://github.com/AgentiX-E/rca-bench-factory/actions/runs/35485547947) | `307fb460` | `cancelled` during `Fetch the corpus` | nothing |

The cancellations were deliberate and the reason for them was correct — three
concurrent jobs each pulling several gigabytes from a host we do not control is a
self-inflicted rate-limit. What the workflow lacked was any way to reach that state
without a human noticing, so the guard added here is the ordinary one: group by
anchor, `cancel-in-progress: false`. The `false` is the load-bearing part. A job
whose only product is a measurement should not discard a twelve-minute download to
start an identical one; a queued second dispatch is the correct outcome, and it is
also what makes a third concurrent fetch unreachable.

**The first version of this entry stated the cause wrongly, and the correction is
the more useful record.** It said the two runs "were cancelled by each other" and
that the dispatches had been "issued while the first was still fetching". The run
timestamps say otherwise. `35485506741` was created at 03:01:41 and recorded
`cancelled` at 03:02:40 — the same second `35485547947` was created, because that
is when the cancel request was issued. `35485547947` was cancelled at 03:03:34,
also by request. GitHub reports a manual cancellation and a concurrency
displacement identically, so the count of `cancelled` runs was consistent with both
stories, and the story that got written first was the one that did not require
checking the timestamps.

This is finding 40's lesson arriving again, in the same session: a measured
observation (two runs, both `cancelled`) with a mechanism attached to it that was
never probed. What distinguishes the two here is only that this time the
correction was cheap — `created_at` and `updated_at` on the two runs settle it in
one call — which is an argument for making that call before writing the sentence,
not after someone reads it.

The guard is worth having on its merits, and that is the claim this entry now
makes. It is not a claim about what happened on 2026-09-20.

**One consequence of the guard is recorded here, and it is the guard's own
counterexample.** The first run to fetch on the fixed revision,
[#35485498167](https://github.com/AgentiX-E/rca-bench-factory/actions/runs/35485498167),
was `cancelled` at 03:17:00, seven minutes into the fetch, and
[#35486129312](https://github.com/AgentiX-E/rca-bench-factory/actions/runs/35486129312)
continued on `eb4dae64` — a revision that carries the layout fix, where the
displaced run's `307fb460` did not.

The mechanism was **not** the concurrency group, and the timing rules it out
rather than merely failing to support it. `35486129312` was *created and started*
at 03:16:03, which is 57 seconds **before** the run it is supposed to have
displaced was cancelled at 03:17:00. A group that displaces runs cannot cause a
cancellation that predates the displacing run's own start. Two further
observations agree: both runs report `event: workflow_dispatch` with
`triggering_actor: Lambertyan`, and at the time of writing `35486129312` is
`in_progress` while nothing else occupies the group — so a second run in the
group did **not** displace anything, it ran alongside the first. That was the
open question this note originally posed, and the answer is *does not displace*.

**What cancelled `35485498167` is still not established, and is no longer
claimed.** An earlier revision of this note said it was a `POST
/actions/runs/35485498167/cancel` issued from this session. That is consistent
with the timestamps and it may well be what happened, but no request log was
kept for it and the claim cannot be checked, so it is withdrawn rather than left
standing on plausibility. All that is measured is the ordering: the cancellation
lands at 03:17:00, 57 seconds after `35486129312` started at 03:16:03, and that
ordering is what rules the group out.

The method note survives the withdrawal, because it does not depend on the
mechanism — and the withdrawal is a second instance of the same thing. A
plausible mechanism (the new group) was written up as the cause before the
timestamps were read; the timestamps falsified it in one comparison; and the
replacement sentence was written the same way, from what was plausible rather
than from what was recorded. That is now four times in this pass — 40, 35, and
twice here — and the second of the two is the one worth noticing, because it
happened *while* the lesson was being written down.

This is the same class of self-inflicted diagnosis as the four-concurrent-runs
episode recorded earlier in this section, and it is recorded again rather than
folded into it because the mechanism differs: that one was a retry loop inventing
requests, this one is a human sequencing them wrong against a job that takes
fifteen minutes. Both produce a run history that misrepresents upstream, and both
are fixed on the caller's side.

The common thread with 35 is that all three were found by *running* something and
reading a number, and the one that went wrong (40) went wrong at exactly the step
where a number was replaced by an inference. The method note is the same one, and
it has now been earned twice: measure, then check the attribution by removing the
suspected cause, and do not spend the probe's authority on a mechanism that was
never probed.

Findings 36 and 37 were both in code this pass had just added and both were
documented as working. That is the fourth time in six passes that the defect was in
the newest code rather than the oldest, which is worth stating plainly: an audit that
only reads what has been there a while would have missed the majority of what this
document records.

Two further instrument defects were found and fixed in the same pass, and are
recorded here rather than in the table because neither is reachable from the
shipped code:

- **`execFileSync` cannot see a successful run's stderr.** Its return value is
  stdout alone; stderr arrives only on the exception object, which a zero exit never
  produces. Every assertion about diagnostic output was therefore asserting against
  `''` and passing whenever the message was absent — the exact failure the
  assertions existed to catch. `spawnSync` returns both streams unconditionally.
- **A test fixture that never ran `git add`.** The "catches a vendored corpus"
  cases in `check-no-vendored-data.test.ts` built a repository with `git init`, wrote
  files, and checked that the guard rejected them. Without `git add` the guard's
  `git ls-files` is empty, so it found nothing to reject — and the guard reporting
  nothing to reject is indistinguishable from the guard being broken. Four tests
  passed against a fixture that could not fail.

### A guard that is unreachable on purpose

`asNonBlank` narrows `string | boolean | undefined` down to a string and treats
anything else as blank. That narrowing is sound only if nothing boolean can reach
it, and the measurement says nothing can: every flag read through it is declared
`type: 'string'` in every spec that declares it, and `parseArgs` under
`strict: true` refuses a string flag with no value rather than returning a
placeholder. The table's one boolean flag, `has-header`, is read with
`Boolean(v['has-header'])` and never reaches the reader.

This was established by instrumenting `String.prototype.trim` and counting
non-string receivers across the suite — zero — and by enumerating the declared
types of every flag name the reader is called with. So the branch has no test
that takes it, and it never will. That is not a coverage debt to be closed by
inventing an input; it is the shape of a guarantee. What is guarded instead is
the invariant that keeps it unreachable: a test reads the flag table and fails if
any flag read as a string is declared as anything else. Injecting
`rules: { type: 'boolean' }` turns it red with
`flag 'rules' is read as a string but declared as boolean`. See
`docs/acceptance.md` §2.39 for why the branch is exempt from the ≥95% branch
floor rather than counted against it.

### A check the matrix proved is redundant, kept on purpose

The injection matrix produced one **green** result, and it is worth more than the
nine red ones. Removing `Number.isSafeInteger` from `parseInteger` — defect 27's
second half — was caught by nothing.

The check is not weak; it is *redundant within every range currently declared*.
The rule is a decimal-integer pattern, then `Number()`, then a safe-integer test,
then a range test. Where the range is `0..86400000` (a window) or `-720..840` (an
offset), every value that fails the safe-integer test is at least nine orders of
magnitude outside the range and is rejected by the range test instead. The
verdict is identical on every input, so no test can distinguish the two
implementations:

```
99999999999999999999   => 1e20    not a safe integer,   also > 86400000
9007199254740993       => 9007199254740992  not safe,   also > 86400000
9007199254740991       => 9007199254740991  safe,       also > 86400000
```

It is kept, and the injection is kept in the matrix as the evidence for why. The
reason is that the redundancy is a property of the current bounds, not of the
function. `parseInteger` is the shared integer reader for the whole CLI, and a
future flag with a range near `2^53` — a nanosecond timestamp, a byte count —
would make the check load-bearing again, at which point the round trip
`String(n) === text` is what stops a 17-digit literal from becoming a different
number. Removing it now because a test cannot see it would be optimising for the
metric rather than for the guarantee.

For the same reason the round trip is *not* the only defence: the decimal pattern
is what rejects `0x10` and `1e3`, and the range test is what rejects the
magnitudes. Three checks, one verdict each, and only the union is under test.

## Method
Each finding was reproduced before being fixed, by running the affected path
against a fixture and reading the number. Each fix is accompanied by a test that
fails without it: the injection matrix in `test/` reintroduces each defect and
records whether the suite catches it, and negative controls must stay green so
the matrix is not red on everything.

### Reading the numbers instead of assuming them

Pass 2's five defects were found by writing probes against the **shipped build**
before writing any test, and each probe printed its result rather than asserting
it. `asInt: 42`, a 1 ms span, `code: 'STATUS_CODE_ERROR'`, `severityText: ''` and
a `-1 ns` span each went in as a document and came back with an observed value.
The distinction matters: reading `nanoToEpochMs` tells you it multiplies by
`1e-6`; it does not tell you that 2500 of 4000 real millisecond pairs disagree, or
which ones. Only the second fact is actionable.

Two candidate defects from the same reading did **not** survive measurement and
are therefore not listed: `anyValueToString` already handles a numeric
`doubleValue` correctly, and the trace path's canonical timestamp already matched
the metric path's to the millisecond. They are recorded here as deliberate
non-findings, because "I read the code and it looks wrong" is not evidence.

### The instrument needs its own errors tracked

The parser that reads the suite's own counts had two defects of its own, both
fixed: it read `Tests <n> passed` off a fixed shape, which reports 0 on every
failing run because vitest prints `Tests 1 failed | 54 passed`, and it matched
`Test Files 56 passed` first, which reports the file count as the test count.

The injection harness needed the same treatment in this pass: two injections were
first rejected by `tsc` for an unused symbol rather than by a test, which would
have been logged as "caught" while proving nothing about the tests. Both were
rewritten to compile, and re-run so that the **tests** were what failed.

Pass 3 hit this a third time — the "drop the choice-shape guard" injection was
again rejected by `tsc` — and it was caught only because the rule from pass 2 was
already written down. **This is why the rule is a rule and not a note:** an
injection that never reaches the test run has not been tested, and a matrix that
counts it as caught is measuring the compiler. Across the first three passes, 4 of
26 injections were mis-rejected this way; all four were rewritten and re-run, and
on re-run every one was caught by the tests instead.

Pass 4 is the first pass with **no** mis-rejection: all 10 real injections compiled
and reached the test run, and all 10 were caught by tests. The reason is not that
this pass wrote better injections — it is that the rule was written down in pass 2
and applied before the matrix ran, so the `void symbol;` form was used from the
start wherever a guard was being removed rather than replaced. A rule that gets
applied is worth more than one that gets rediscovered.

### What fixed the long-standing test wording

Pass 3 changed a function that two legacy tests in `deepseek.test.ts` already
covered:

```ts
expect(() => parseDeepSeekResponse('{"choices":[{"message":{"role":"assistant"}}]}')).toThrow(/content/i);
```

The rewording to `no usable completion text` broke both. Rather than edit
assertions to chase the implementation, the parser keeps its existing wording for
the single-choice case: with one choice a count adds nothing to the diagnosis, and
the long-standing wording is what operators already grep for. The ranked message
appears only when position is genuinely ambiguous. **Two assertions that were
there first and pass on their own merits are not the thing to change.**

### The assertion that pinned the defect

Pass 4 met the mirror image of that case, and it is worth recording separately
because the right answer is the opposite one:

```ts
it('accepts an empty sample set for a structurally complete layout', () => {
  const result = validateGeneratedLayout(metricLayout, 'metric', []);
  expect(result.valid).toBe(true);   // this is finding 19
});
```

That assertion was not there first and passing on its own merits; it was there
first and **passing because it encoded the bug**. It is the exact behaviour finding
19 describes, written down as the expected result. It was corrected rather than
deleted — the case stays covered, and the corrected expectation is the one the new
suite states in full — with both the change and the reason recorded in the test
file, because a future reader diffing that line deserves to know which of the two
rules applied.

The distinction between pass 3's case and pass 4's is not "old assertion versus new
one". It is whether the assertion is *right*: pass 3's two tests were asserting
something true that the implementation had stopped honouring, and pass 4's test was
asserting something false that the implementation happened to do. Only the second
should be changed, and only the first is evidence of a regression.

## Retractions
This report's rule is that a finding needs a measurement. The corollary is that a
*claim* needs one too, and three claims in this repository did not have one. They are
recorded here rather than quietly deleted, because a wrong constraint is not harmless:
it gets obeyed, and it gets re-derived by the next reader.

**Retracted: "Anchor 4 needs official data mounted by the operator."** Written when
the round trip was a manual procedure, and it framed a hand-off as a requirement. The
RCAEval corpora are on Zenodo — a plain HTTPS host with a stable URL and no
interactive confirmation. A GitHub runner has general internet access. There was never
anything an operator had to mount; there was only a fetch step that had not been
written. `scripts/fetch-official.mjs` is that step.

**Retracted: "The licences prevent us from using the data."** This was the reason
given for anchor 4 being out of reach, and it was wrong in both directions.

- *RCAEval is not restrictively licensed.* Its README states that the code the
  authors implemented **and their datasets** are distributed under MIT.
  `THIRD-PARTY-NOTICES.md` recorded it as Apache-2.0 code-only, which understated the
  grant, and `golden-master/official-assets.json` carries `"license": "MIT"` per asset
  with the licence source recorded beside it.
- *CC BY-NC-SA 4.0 does not block this use.* NonCommercial is defined in §1(11) as
  use "not primarily intended for or directed towards commercial advantage or monetary
  compensation". This is internal, unreleased research; nothing is sold and nothing is
  charged for. ShareAlike is defined in §1(12) as providing material "to the public",
  and we provide none — we redistribute nothing and we host nothing.

The constraint that does exist is not legal but hygienic, and conflating the two is
what made the wrong claim look plausible: upstream corpora must not be committed to
git. That is a repository-hygiene rule with a technical reason (a 19 GB tree in
history is unremovable and makes every clone pay for it) and it is enforced by
`scripts/check-no-vendored-data.mjs` and by `fetch-official.mjs` refusing an output
path inside the working tree. A licence was never the reason, and dressing a hygiene
rule as a licence rule made the rule harder to satisfy than it is.

The one licence claim that survives is the narrowest one: CausalRCA and RUN ship no
licence, which reserves all rights. We do not fetch them, we do not vendor them, and
we do not need to — they are baselines rather than targets, and the schema shape this
repository defines is its own.

**Retracted: "`fetch-and-verify.sh` downloads and verifies the official data."** The
script prints instructions; the comment at its top always said it "does not fetch
official data for you". `THIRD-PARTY-NOTICES.md` described it as downloading, and the
prose around it followed that description. The script was right and the documents were
wrong. It is retained unchanged — the Golden Master verifies it byte-for-byte, and
rewriting a correct script to match an incorrect description is the wrong repair.

### What this pass did not establish

The four anchors now have a path for the fourth one, and the path is exercised on
every push against a synthetic corpus in the official layout, scoring 1.00. That is
what `anchor-roundtrip.yml` proves: the wiring works and the label never enters the
computation.

It is **not** a run against real telemetry. The corpora total roughly 19 GB and this
session's sandbox has no route to Zenodo (`zenodo.org` fails at the TLS handshake
while `api.github.com` resolves, which is an egress allowlist rather than a property
of either host). The digest and byte-count fields in `golden-master/official-assets.json`
are therefore all `null`: they are filled in by a fetch that has actually run, and a
digest that was never computed is not evidence. `official-data.yml` is the
`workflow_dispatch` job that produces them on a runner.

So the honest statement of anchor 4's state is *executable, not reproduced*. Those are
different claims and this report keeps them apart on purpose — the whole difficulty of
passes 1 through 5 was code that reported success without establishing anything, and
"the CI job is green" would be the same mistake one level up if it were allowed to
stand in for "the number agrees with upstream".

### Pass 8 — the corpus, all of it, in a 4 GB heap

Finding 42 was the layout. Fixing it moved the real run past `derive the case
descriptors` for the first time — `270 case(s): RE1=0 RE2=270 RE3=0`, with
`RE2-OB/checkoutservice_cpu/multi-source-data` correctly skipped — and then the job
died one step later:

```
ok  Fetch the corpus outside the working tree | success
ok  Compare the measured pins against the registry | success
ok  Derive the case descriptors from what was downloaded | success
>>> Round-trip the corpus and score it with the official rule | failure
    FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory
    [2670:0x42b1f000]  Mark-Compact (reduce) 4113.7 (4116.9) -> 4113.7 (4116.9) MB
```

The heap died at 4182 MB with no `ROUNDTRIP` line printed — the process did not
reach its first verdict. The step that was supposed to *check* the corpus could not
fit the corpus into memory.

**Sizes, from the run's own log rather than estimated.** The three assets measure
`bytes=1191025569`, `bytes=245629018`, `bytes=2801345134`: **4.24 GB of archives.**
Free disk went from `86G` to `54G` across the fetch, so the extraction is on the
order of **32 GB** — the archives are compressed and the telemetry inside them is
not. None of that was in the repository, the registry, or any document; it is
recoverable only from a run that got far enough to print it.

**The defect.** The walk did this:

```js
const bytes = readFileSync(path);
if (bytes.includes(0)) continue;
files[relative] = bytes.toString('utf8');   // <- every file, whole corpus
```

So the reader materialised the entire corpus as strings before scoring anything
against a 4 GB heap. And of the three things that then read the map, **none needed
a body**:

| Read site | What it asks | What it needs |
|---|---|---|
| `files[`${caseId}/inject_time.txt`] === undefined` (×2) | does this case hold the file? | a `stat`, or a set |
| `Object.keys(files).length` | how many files arrived? | a count |
| `adaptCase` | one `metrics.json` | **it already re-read that file from disk** |

The third row is why this is a clean removal rather than a trade: the adapter never
consulted the map, so the corpus-wide map contributed a count and two membership
tests, and cost 32 GB to hold.

**The fix.** The walk answers the two questions and keeps nothing else. Bodies are
not opened, so its cost does not scale with bytes either: membership is decided by
the file's extension (`json`, `csv`, `txt`, `log`, `md`) rather than by decoding
every candidate to look for a NUL, and the NUL check moves to `adaptCase`, which is
now the only place a payload is opened and was going to read those bytes anyway.
`files` becomes a `Map<path, null>` — a set whose values say outright that no body
was kept, so a future reader cannot quietly come to depend on one.

**Controlled comparison, same corpus and same heap cap.** A 31 GB corpus in the
corpus's own layout — 270 cases, each with the three metrics and 1200 samples the
real CPU cases carry, plus the bulk telemetry the adapter never reads:

| Implementation | Exit | Heap at death | Result |
|---|---|---|---|
| pre-fix (`readFileSync` into the map) | **134** | 4182.7 MB | `FATAL ERROR: heap out of memory`, no `ROUNDTRIP` line |
| fixed | **0** | 166 MB peak RSS | `ROUNDTRIP PASSED (270 case(s) round-tripped through the official layout)` |

The pre-fix column reproduces the CI failure exactly, down to the
`Official-metric regression PASSED` line appearing *before* the crash — which is the
signature that the corpus-reading branch, not the scoring, is what died. Peak RSS is
now **flat**: 166 MB for 31 GB, because memory follows the largest case rather than
the size of the corpus.

**Why the fixture could not have caught this, and what changed.** Every existing
round-trip fixture is a few hundred bytes per case, so the whole corpus fits in any
heap and the accumulator is invisible — the fixture certified the assumption, which
is finding 43's mistake in a different medium. The new test lowers the child's heap
(`--max-old-space-size=128`) and gives it ~300 MB of corpus, so holding the corpus
violates the cap at any size and the failure is a verdict rather than a coincidence
of how much RAM the machine had. Injection-verified: restoring body retention turns
**exactly one** test red, with the same `heap out of memory` abort; restoring the
pre-fix counting rule turns a different one red, via the `.DS_Store` the fixture now
carries, because the count is a decision under test rather than an accident of the
fixture holding only payload names.

Two consequences worth stating plainly:

- the count's rule changed. The old walk counted non-binary files; the new one
  counts payload names. These agree on the real corpus (packaging is binary *and*
  non-payload) and diverge on a binary `metrics.json`, which the new walk counts and
  which then fails by name in `adaptCase`. That is the right direction — a
  present-but-broken payload is a corpus defect to report, not a file to drop — and
  it is covered by a test of its own.
- the `--max-old-space-size` in the test is load-bearing. Without it the test would
  pass on a large machine and fail on a small one, which is this same defect wearing
  a green tick.

---
