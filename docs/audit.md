# Audit report

Findings from the scoring-path, OTLP-ingest and LLM-layer audits, with the
measurement that established each one. Every entry follows the same shape: the
defect, the command that demonstrated it, the observed number, the fix, and the
guard that now fails without the fix.

A finding is only listed here after being reproduced locally. A finding that only
appeared in a review, without a failing measurement, is not a finding.

## Scope

Six passes so far:

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

## 1 — The regression graded its own answer key

`runOfficialRegression` built its predictions with
`groundTruth.map(oraclePrediction)` instead of reading the submission the export
publishes. `readOfficialSubmission` was exported, tested, and never called on
this path.

The consequence is that the check compared the answer key against itself. A
`record.csv` that had been corrupted or deleted still reported `passed`. Four
injections — wrong component, wrong reason, wrong datetime, deleted submission —
were all silent.

**Fix**: read `readOfficialSubmission(target, files)`, the same artefact an
external evaluator consumes.

**Guard**: `test/official-submission.test.ts` corrupts each of the four and
asserts the regression fails, plus a case-for-case agreement check against
`scoreOfficial`. Injecting the old line back fails 5 tests.

## 2 — An empty denominator scored as a perfect match

```ts
function rateOf(predicted, expected) {
  if (expected.length === 0) return 1;   // before
  return intersectCount(predicted, expected) / expected.length;
}
```

`1` for an empty `expected` makes "the key asked nothing" and "the prediction
answered everything" the same number. An RCA100 key declaring no chain and no
checkpoint collected the full 0.3 process weight, identically to a key that
declared both and had them matched.

Measured: a case with an empty chain and empty checkpoint list produced
`{"process":1,"chainNodeMatch":1,"checkpointHit":1}` and a headline of 100.

**Fix**: return `undefined`, and let a new `meanOfPresent` average only the terms
that have a denominator. When no term has one the answer is 0, not 1.

**Guard**: `test/official-empty-denominator.test.ts`. Injecting `return 1` back
fails 3 tests.

## 3 — The checksum rate divided by the anchor set

```ts
const total = matched + mismatched.length + missing.length;   // before
```

With `extra` — files the anchors never mention — left out, the numerator and the
denominator were both about anchors, so an unanchored file was neither verified
nor held against the rate. One anchor out of twenty-two produced `score: 100`
beside `passed: false`, which is the worst pair to hand an operator: the number
says the export is perfect, the flag says it is not, and the number is the half
people read.

The existing test asserted `passed` and `extra`, not `score`, which is why it
survived beside its own comment saying the problem must be visible.

**Fix**: add `extra.length` to the denominator. A comparison set is a claim about
the whole export.

**Guard**: `test/score-anchor-denominator.test.ts`, including a monotonicity case
(more unanchored files must lower the score). Injecting the old line fails 2
tests.

## 4 — `openrca-2.0` silently inherited strict accuracy

`aggregateFor` was a chain of `if (target === …)` blocks with nine targets and
six branches. `openrca-2.0` was never named, so it fell through to the generic
strict-accuracy block and reported the share of cases where *every* facet was
reproduced exactly — a different function from the one its own spec advertises
(`matched facets / scored facets`).

The two formulas agree on a perfect export and on an empty one, which is why the
regression never noticed. They part company in between: measured `accuracy: 0.75`
beside `final: 0` for a prediction that reproduced three of the four declared
facets.

**Fix**: name the branch, and end the chain in a `never` guard so a tenth target
stops the build instead of inheriting a formula.

**Guard**: `test/official-aggregate-coverage.test.ts`. Injecting the missing
branch back fails 1 test.

## 5 — An empty AIOps2025 corpus was fully explained

```ts
const explainability = et === 0 ? 1 : em / et;   // before
```

`et` is the total number of evidence points the corpus declares. Answering `1`
when there are none handed an export that declared no evidence at all a free
tenth of the score. Measured: an empty AIOps2025 export scored `final: 10` while
the other eight targets scored 0. It was the only target with a non-zero score on
a nonexistent export.

The other three terms in the same formula already answered 0 with nothing to
average (`la`, `ta`, `eff`), so explainability was the outlier.

**Fix**: `et === 0 ? 0 : em / et`.

**Guard**: `test/official-no-denominator.test.ts` and a corrected assertion in
`test/official.test.ts`. Injecting `? 1` back fails 2 tests.

## 6 — A vacuous structure report earned half the score

Found while building the guard for finding 2. `scoreExport` averages the
structure rate and the checksum rate, and the structure rate was credited
unconditionally. Four of the thirteen OpenRCA checks pass on an empty export
because there is nothing for them to inspect:

- `answer-key-isolated` — "query.csv carries no answer key" holds when there is
  no query.csv;
- `log-header` and `trace-header` — both explicitly accept an absent telemetry
  directory (Telecom ships no logs, so this is deliberate);
- `row-alignment` — zero rows equals zero rows.

That is a structure rate of 0.31, and an empty export reported `score: 15` while
`passed` was correctly `false`.

**Fix**: credit the structure rate only when the structure report passes. The
report's own `passed` flag already answers this correctly; the rate is only
meaningful once the verdict is.

**Guard**: a case in `test/score-anchor-denominator.test.ts` asserting an empty
export scores 0. Injecting the unconditional rate back fails it.

## 7 — A legal integer data point was quarantined as having no value

```ts
const asInt = dp['asInt'];
if (typeof asInt === 'string' && asInt !== '') { ... }   // before
```

`asInt` and `asDouble` are both numbers on the wire. The OTLP JSON mapping
documents int64 as a string so a 64-bit value survives a language with no such
integer, but protojson — which is what most exporters actually use — also admits
the numeric form. A document carrying `asInt: 42` is a legal document.

Measured: that document produced `signals: []` and one quarantine,

```json
{ "index": 1, "reason": "data point has no numeric value (asDouble/asInt)",
  "record": "{\"timeUnixNano\":\"1735689600000000000\",\"asInt\":42}" }
```

That is a quarantine reason that contradicts its own record: the record plainly
contains a numeric value.

**Fix**: accept a safe integer in either form; the two encodings now agree.

**Guard**: `test/otlp-fidelity.test.ts`, plus a case that still rejects a
non-numeric `asInt` and a non-finite `asDouble` so the widening did not become a
hole. Injecting the string-only reader back fails 1 test.

## 8 — Nanoseconds were scaled by a float

```ts
const n = Number(raw);
return Number.isFinite(n) ? n * 1e-6 : undefined;   // before
```

`n * 1e-6` is a float multiply, and at nanosecond magnitudes it does not agree
with exact integer division. Measured over 4000 consecutive millisecond pairs:
**2500 disagreed**, worst case `1.000244140625` reported for a span that was
exactly 1 ms long. Individually:

| true duration | reported |
| --- | --- |
| 1 ms | `0.999755859375` |
| 2 ms | `1.999755859375` |
| 17 ms | `16.999755859375` |
| 1001 ms | `1000.999755859375` |

A duration wrong by a fraction of a millisecond, in a benchmark whose whole
purpose is measuring durations. Nothing downstream could flag it: the value is
finite, positive, and plausible.

**Fix**: divide in `BigInt` before narrowing. `Number(raw)` cannot be used first
because it already loses nanoseconds at these magnitudes, so the division has to
happen while the value is still exact.

**Guard**: `test/otlp-fidelity.test.ts` asserts the four exact values above, plus
the 4000-pair sweep. Injecting `n * 1e-6` back fails 4 tests.

## 9 — A span status delivered by enum name was dropped in silence

```ts
if (typeof rawCode === 'number') {           // before
  status = SPAN_STATUS_CODE[rawCode];
  ...
}
```

The OTLP JSON mapping writes enums as their **names**, not their numbers. The
reader matched numbers only, so `{ status: { code: 'STATUS_CODE_ERROR' } }` fell
past the branch entirely: no `status` on the payload and no quarantine entry.

Measured: an error span ingested as a healthy-looking one —

```json
{ "kind": "trace", "traceId": "t1", "spanId": "s1", "spanName": "op",
  "durationMs": 1000 }
```

This is the worst shape a defect can take here. It is silent, and the direction it
fails in is always the same: an error span that loses its status is
indistinguishable from a healthy one, so the corpus looks *better* than it is.
Zero-loss accounting could not catch it, because a dropped field is not a dropped
record.

**Fix**: read both encodings — the enum name and the numeric form, whether the
number arrives as a number or as a string — and quarantine a code that is present
but unreadable, so the two failure modes ("carries none" versus "carries
something we cannot read") stop being the same outcome.

**Guard**: seven cases in `test/otlp-fidelity.test.ts` covering all five
encodings plus an unrecognised name and an unrecognised number. Injecting the
number-only reader back fails 4 tests.

## 10 — An empty severity was reported as an invalid one

```ts
if (rawSeverity !== undefined && severityText === undefined) {   // before
  quarantine.push({ index, reason: `invalid severity '${rawSeverity}'`, ... });
```

`normalizeSeverity` already treats `''` and `undefined` alike and returns
`undefined` for both, but the guard compared the *token* rather than the raw
field. So `severityText: ''` was quarantined as `invalid severity ''`.

Measured: one legal log record became zero signals and one quarantine entry, for a
field the schema calls optional.

An absent severity and an unrecognisable one are different claims about different
documents, and only the second is a data problem. Collapsing them inflates the
quarantine count with records that were never at fault.

**Fix**: compare the raw field, so only a non-empty unreadable spelling is
quarantined.

**Guard**: four cases in `test/otlp-fidelity.test.ts`. Injecting the token
comparison back fails 1 test.

## 11 — A sub-millisecond inverted span truncated to a legal zero

```ts
const durationMs = endMs - startMs;
if (durationMs < 0) { ... }                  // before
```

Once finding 8 made durations exact, both operands were truncated to whole
milliseconds before being compared. A span whose end precedes its start by **one
nanosecond** therefore produced `durationMs === 0` and passed as a legal
zero-length span.

A negative duration is the inverted-timestamp signature of a broken clock — the
one thing this corpus must never contain — and truncation was hiding it for every
inversion smaller than a millisecond.

**Fix**: compare the exact nanosecond instants as well as the truncated
difference. Both checks are kept: the nanosecond comparison is the precise one,
and the millisecond comparison documents the invariant at the unit the IR uses.

**Guard**: a case asserting a `-1 ns` span is quarantined. Injecting the
truncated comparison back fails 1 test.

## 12 — Only the first choice was ever read

`openai-compat.ts` had **no test file at all** — 0 test references for 98 source
lines — while being the shared transport under both the DeepSeek and OpenAI
adapters, so every LLM-dependent path in the factory ran through it.

```ts
const first = choices[0] as Record<string, unknown>;
const message = first.message as Record<string, unknown> | undefined;
const content = message?.content;
if (typeof content !== 'string') {
  throw new Error(`${name} response choice has no string content`);
}
return content;
```

An OpenAI-compatible server returns a leading choice that carries no text for a
refusal or a content-filtered turn, with a usable completion behind it. Reading
only `choices[0]` discarded that answer and reported the whole response as
unusable.

Measured: two choices, the first with `content: null`, the second with
`"second"`:

```
THREW: Error: X response choice has no string content
```

**Fix**: inspect every choice in order; the first usable text wins.

**Guard**: `test/openai-compat.test.ts` (18 tests). Injecting the first-choice-only
read back fails 3 tests.

## 13 — A null choice leaked a raw `TypeError`

The same two lines dereferenced `choices[0]` without checking it is an object.
Every other malformed shape in this parser produces a named message —
`is not valid JSON`, `is not a JSON object`, `has no choices` — but a `null`
element escaped as an internal error:

```
THREW: TypeError: Cannot read properties of null (reading 'message')
```

Measured for `{"choices":[null]}`. The failure is not that it threw; it is *what*
it threw. A `TypeError` names a JavaScript operation, not a response shape, so an
operator reading it learns nothing about what the server sent.

**Fix**: check the element is an object before touching it, at every position, and
report the position.

**Guard**: two cases asserting the named message and, explicitly, that a
`TypeError` is **not** what comes out. Injecting the unchecked dereference back
fails 2 tests.

## 14 — `''` was accepted as a completion

The declared return type is `string`, and a choice whose content is the empty
string satisfied `typeof content === 'string'`. Measured: `content: ''` returned
`''` as a successful completion, so no caller could tell an empty answer from a
real one — and the surrounding comment claims the function throws "so a malformed
or empty response surfaces as an explicit error", which it did not.

**Fix**: the empty string is not usable text; a whitespace-only completion still
is, because that is a real answer a model can give.

**Guard**: two cases, including the whitespace case that must **keep** working.
Injecting `typeof content === 'string'` back fails 1 test.

## 15 — The prompt never stated the rule the parser enforced

This one is not inside a function. It lives between two of them.

`buildFaultExtractionPrompt` advertised the category vocabulary as a bare field
placeholder:

```
"category": "resource | network | runtime | middleware | code | config | dependency"
```

Nothing in the prompt says the value must be **one of** that list, and nothing
anywhere says the match is case- or space-sensitive. `parseFaultExtractionResponse`
then stored whatever string came back, and `parseFaultSpec` matches the category
by exact value.

Measured end to end, for an incident the prompt itself was built from:

```
parse    -> { ok: true,  extracted: { category: "NETWORK" } }
validate -> { valid: false, reasons: ["invalid fault category 'NETWORK'"] }
```

So a correctly-extracted fault was rejected, and the H3 reviewer was told the
**category** was wrong when it was the **casing** that was wrong — a diagnosis
pointing at the model's judgement instead of at the contract.

**Fix**, in both halves, because either alone would be a half-measure:

- the prompt now says `"one of: …"` and states that the match is
  case-insensitive and that any other value is rejected;
- the parser trims and case-folds before the vocabulary check, and rejects an
  out-of-vocabulary value **at the point it was read**, naming the offending
  string, instead of deferring to a validator that reports it as a category error.

A synonym such as `net` is still rejected. Deciding that `net` means `network` is
a judgement, not a normalisation, and H3 is where that judgement belongs.

**Guard**: `test/importer-contract.test.ts` (12 tests), including the full
ticket-text → prompt → parse → validate pipeline as one assertion. Injecting the
verbatim read back fails 3 tests; dropping the prompt's rule sentence fails 1;
removing the early rejection fails 2.

## 16 — A layout field outside the contract was dropped, not rejected

```ts
if (typeof value !== 'string') { ... }
if (key === 'semanticType') { ... } else { (layoutFields as ...)[key] = value; }
// no check that `key` is an IR field at all
```

`parseRulegenResponse` copied every string-valued key into the layout and never
asked whether the name was one the IR declares. A model that answered `timstamp`
— `timestamp` with the `e` lost — therefore produced a layout that was silently
missing `timestamp` while the parser reported success:

```json
{"ok":true,"generated":{"layout":{"timstamp":"time","metricName":"kpi","metricValue":"val"},"confidence":0.9,"rationale":"typo"}}
```

The failure then appears one stage later, as `missing required field 'timestamp'`.
The parser accepted the layout, and the validator blamed the answer for a missing
field when the actual event was a rejected name — the same shape as finding 15,
where the diagnosis pointed at the model's judgement instead of at the contract.

**Fix**: reject any key that is not in this signal kind's field list, naming it and
listing what was expected. A per-kind check, not a global one (finding 17).

**Guard**: `test/rulegen.test.ts`. Injecting the `continue` back fails 6 tests.

## 17 — A cross-kind field name passed the membership check

Found while building the guard for finding 16. The obvious guard — "is this key a
field somewhere in the IR?" — accepts `spanName` in a *metric* layout, because
`spanName` is a real trace field. It would have left the same typo-blindness in
place for every name a model can borrow across kinds, and the metric rules are
where a borrowed trace field is most likely to appear, since a model mapping
metrics has just been shown the whole contract family.

**Fix**: check against `IR_FIELDS[signalKind]`, the same list the prompt prints for
that kind, so the advertised contract and the enforced one are one object.

**Guard**: two cases, a trace field in a metric layout and a metric field in a log
layout. Injecting the union-of-all-kinds check back fails 3 tests.

## 18 — `semanticType` was cast, not checked

```ts
layoutFields.semanticType = value as MetricPayload['semanticType'];   // before
```

`semanticType` is an enum, not a source column name, and the only validation was a
TypeScript cast — which is erased at runtime and, in a function whose input arrived
as JSON from a model, guarantees nothing. Measured:
`"semanticType":"not-a-real-semantic-type"` parsed as `ok: true` and travelled into
the IR, where the schema rejected the **whole signal**. One hallucinated enum
member therefore discarded an otherwise valid record, and the reason named the
payload rather than the field.

The enum was an inline union inside `MetricPayload`, which is why no consumer could
read it at runtime. That is what made the cast the only option available.

**Fix**: `METRIC_SEMANTIC_TYPES` moves into `ir/types.ts` as an `as const` tuple
with the type derived from it, matching `LOG_SEVERITIES`, `SPAN_STATUSES`,
`SIGNAL_KINDS` and `FAULT_CATEGORIES`; the parser checks membership by name and
rejects at the point it was read. An empty string is rejected too — it is not a
member, and defaulting it would hide a missing field behind a plausible one.

**Guard**: five cases covering the invalid value, the empty value, all six legal
values, and the cross-kind case. Injecting the cast back fails 2 tests.

## 19 — An empty sample set validated as a pass

```ts
return { valid: reasons.length === 0, reasons };   // before
```

The replay over the source samples is the entire check
`validateGeneratedLayout` performs. With `samples` empty the loop body never runs,
no reason is pushed, and the function returns `{"valid":true}` — success reported
for having had no input, which is the one result a guard must never produce.

This is reachable in practice: the caller samples a source before mapping it, and a
source whose sample window contains only blank rows yields no samples. The
signature then reads as "this layout was verified", and the layout has been
verified against nothing.

**Fix**: report the missing evidence as a reason. It is pushed **after** the
structural reasons, so a caller iterating on a layout is told what is wrong with
the layout first and only then told that the evidence was absent.

**Guard**: three cases, including one asserting the structural reasons survive
alongside the new one. Injecting the unconditional return back fails 3 tests.

## 20 — The prompt never named the semantic-type vocabulary

Found while building the guard for finding 18. The prompt printed the field list,
and `semanticType` was in it, but the prompt never said the field's value had to
come from a fixed set. So the one field the parser cannot accept by name was also
the one field the prompt described only as a name:

```
IR fields for signal kind 'metric': timestamp, service, …, metricUnit, semanticType
```

A model asked to fill `semanticType` from that line has to guess whether it wants a
column or a class, and if it guesses class, which classes exist. The prompt is the
only place that can answer either question, and it answered neither.

**Fix**: print the vocabulary beside the field, and only for signal kinds that
have the field — asking a log layout for a semantic type would be a second defect
in the same sentence.

**Guard**: four cases, including one asserting the vocabulary does **not** appear
for `log`. Injecting the sentence's removal fails 1 test; dropping the closed-list
sentence fails 1 more.

## 21 — Only `content[0]` was read

```ts
const first = content[0] as Record<string, unknown>;
const text = first.type === 'text' ? first.text : undefined;
if (typeof text !== 'string') { throw ... }                    // before
```

Anthropic returns `content` as an array of typed blocks, and the completion is the
concatenation of the `text` blocks. Reading only the first threw on any response
that led with something else. Measured, for a leading `tool_use` block with a
usable text block behind it:

```
THREW: Error: Anthropic response content has no string text
```

A leading `tool_use` or `thinking` block is not an edge case: it is what a server
returns for a turn that used a tool or produced reasoning, and the answer was
present in both.

**Fix**: concatenate every text block. A non-text block is **skipped**, not
rejected — it is a legitimate part of a response that simply carries no completion —
and a text block with no usable string is skipped for the same reason.

**Guard**: six cases across `test/anthropic.test.ts` (27 tests in the file).
Injecting the first-block-only read back fails 6 tests.

## 22 — A completion split across blocks was truncated

Found while building the guard for finding 21, and a separate defect with a
separate fix: reading every block only helps if every block's text is used.

Measured: `[{type:'text',text:'first'},{type:'text',text:'second'}]` returned
`'first'`.

For this module the consequence is worse than a short string. Every prompt it
serves asks for JSON, so a truncated completion is not obviously truncated — it is
a body that fails to parse, and the caller reports **"malformed JSON"**, blaming
the model's formatting for a parser that discarded half its output. A diagnosis
naming the wrong component is what makes this worth its own entry.

**Fix**: join the parts. A whitespace-only result is not a completion, because a
caller cannot act on it; surrounding whitespace on a non-blank completion is
preserved, because trimming it would edit the model's answer.

**Guard**: three cases (the join, the blank rejection, the preserved whitespace).
Injecting the first-block-only read fails 6 tests; injecting the removal of the
blank check fails 1.

## 23 — A null content block leaked a raw `TypeError`

`content[0]` was dereferenced without a shape check. Every other malformed shape in
this parser gets a named message — `is not valid JSON`, `is not a JSON object`,
`has no content`, `content has no string text` — but a `null` element escaped as an
internal error:

```
THREW: TypeError: Cannot read properties of null (reading 'type')
```

Measured for `{"content":[null]}`. The defect is not that it threw; it is *what* it
threw. A `TypeError` names a JavaScript operation rather than a response shape, so
an operator reading it learns nothing about which server sent what.

A non-array `content` field was also collapsed into the empty-array case, so
`{"content":"a plain string"}` and `{"content":[]}` produced the same message. They
are different claims about different responses.

**Fix**: check each block is an object and report its **position**; separate the
non-array case from the empty case.

**Guard**: four cases, one of which asserts explicitly that the thrown error is not
a `TypeError`. Injecting the unchecked dereference back fails 2 tests; collapsing
the non-array case back fails 1.

## 24 — `--cases` was checked for JSON-ness, not for the shape it feeds

`--cases` is declared on two commands and means something different on each:

| Command | Placeholder | Contract |
| --- | --- | --- |
| `evolve stale` | `<json>` | an inline JSON array of case descriptors |
| `ingest` | `<file>` | the path to a JSON file holding them |

The defect is on `evolve stale`, where `runEvolveStale` consumes the value by
calling `.map` and the parser checked only that the text parsed as JSON.

```
$ rca-bench evolve stale --input p.json --cases '{"not":"array"}'
ok: true                          # parser's verdict
--cases must be a JSON array      # runEvolveStale, after the command started
```

Two modules were enforcing two halves of one contract: the parser said the value
was valid, the consumer said it was not, and the caller learned which from an
error raised mid-command. A caller that validates its own input before invoking
cannot reproduce the parser's verdict either, because that verdict was not about
the thing it needed.

The first draft of this finding claimed the defect was on `ingest` and cited
`ingest --cases '{"not":"array"}'`. A probe refuted it: that argv is accepted,
and it *should* be, because on `ingest` the value is a file name and a file may
legitimately be called `{"not":"array"}`. **A criterion refuted by measurement is
more dangerous than no criterion** — it invites someone to "fix" correct
behaviour. The finding and its acceptance criteria are now stated per command.

**Fix**: `parseJsonArray`, applied to the flag whose placeholder says `<json>`.
Every JSON flag that feeds an array names that shape at the boundary, and no flag
whose value is a path is parsed as JSON.

**Guard**: `a JSON flag must be the shape its consumer needs`, which loops
`evolve stale` over five non-array JSON values, plus a case asserting that
`ingest --cases` still treats its value as a file name. Injecting the JSON-only
check back fails 1 test.

## 25 — `--anchors` checked the outer object, not its entries

`--anchors` is a claim that specific files were verified against committed
SHA-256 hashes. `readAnchors` verified only that the value was a JSON object.

```
$ rca-bench score --target rcaeval-re2 --dir d --anchors '{"a.txt":123}'
ok: true                          # a number can never equal a hex digest
$ rca-bench score --target rcaeval-re2 --dir d --anchors '{"a.txt":"abc123"}'
ok: true                          # six characters, not a SHA-256
$ rca-bench score --target rcaeval-re2 --dir d --anchors '{"":""}'
ok: true                          # an entry naming no file
```

Each of these is worse than a plain validation gap, because the comparison can
only ever fail. A number never equals a digest, so the hash check reports a
mismatch; and a mismatch is exactly what a tampered file produces. The flag
exists to make "these bytes are verified" trustworthy, and it was accepting input
for which the answer is always "not verified" — indistinguishable from real
corruption. An entry with an empty file name is the same error: it asserts a
verification of nothing.

**Fix**: each entry must be a non-blank file name paired with a 64-character hex
string; `SHA256_HEX` names that shape once.

**Guard**: three cases, one per rejected shape. Injecting the outer-object-only
check back fails 2 tests, loosening the digest pattern to `[0-9a-fA-F]+` fails 1,
and re-accepting the empty object fails 1.

## 26 — `--assume-offset-minutes` was any finite number

The flag overrides the offset applied when a timestamp carries no zone. It was
validated with `Number.isFinite`.

```
$ rca-bench source --path f.csv --assume-offset-minutes 1e21
ok: true                          # parser's verdict
RangeError: Invalid time value    # core, from inside Date.toISOString()
```

A number the parser accepts and core cannot honour is a validation gap, not a
caller error. The caller sees a `RangeError` naming a JavaScript `Date`
operation, which describes nothing about the flag; the actual mistake — an
offset no timezone has, or no real number at all — is not in the message. The
same field also accepted `5.5` minutes and `9007199254740992`, the latter because
`Number.isFinite` is true for it and it is not the literal that was typed.

**Fix**: `parseInteger('assume-offset-minutes', …, -720, 840)`. UTC-12:00 and
UTC+14:00 are the real extremes; anything outside them cannot describe a zone,
and a fractional minute is not one either.

**Guard**: four cases: an unusable magnitude, a fractional value, a value
outside the representable UTC range, and — the other direction — every real
offset including both extremes. Injecting the finite-only check back fails 3
tests; dropping the range while keeping the integer check fails 5.

## 27 — The window flags used `/^\d+$/` and `Number()`

`--lead-ms` and `--lag-ms` size the observation window around an injection. They
were checked with a digit pattern and converted with `Number()`.

```
$ rca-bench ingest --source d --target rcaeval --cases c.json \
    --lead-ms 99999999999999999999
ok: true, leadMs: 100000000000000000000
```

This is the worst shape a defect can take in a parser: **it does not throw.**
`/^\d+$/` accepts any number of digits, `Number()` rounds the 20-digit literal to
`1e20` without complaint, and `1e20` milliseconds is about three billion years.
Nothing downstream rejects it either — the window is simply used, and every
signal in the slice is included. A caller who typed twenty digits meant a
number the flag cannot hold; silently substituting a different one is the failure
mode this whole pass exists to eliminate.

**Fix**: the window flags go through the same `parseInteger` as the offset, with
`MAX_WINDOW_MS` (one day) as the ceiling. The round trip `String(n) === text` is
what makes the precision loss observable: without it, `Number.isSafeInteger` is
false for `1e20` and true for `1e15`, and a 16-digit literal that rounds would
still pass.

**Guard**: five cases, including the acceptance boundary at exactly one day.
Reverting to the digit pattern fails 3 tests. Dropping the round trip fails
**0** — and that is a finding, not a gap in the guards: see "A check the matrix
proved is redundant, kept on purpose" above.

## 28 — A path flag rejected `''` but not `'   '`

```
$ rca-bench source --path "   "
ok: true, path: "   "             # then: ENOENT, no such file or directory
```

An empty string was already refused. Three spaces are the same mistake typed
differently, and the difference the caller sees is not a message about the flag
but an `ENOENT` naming a file that looks empty in the terminal. Every path flag
in the table had the identical gap, because they shared one reader.

**Fix**: `asNonBlank` tests blankness **after** trimming and returns `undefined`
for absent versus `null` for blank, so a caller distinguishes "not given" from
"given something unusable" and reports the right one. Applied to every path flag
— `source`, `export`, `score`, `transform`, `case`, `gate`, `report`, `pack`,
`ingest` and the four `evolve` actions.

**Guard**: a per-command sweep plus a case asserting that *meaningful*
surrounding whitespace is stripped rather than rejected, and one asserting an
internal space is preserved. Injecting the untrimmed comparison back fails 5
tests; removing the blankness test entirely fails 7.

## 29 — `caseDirName` deleted the hyphens, so the round trip read a path that cannot exist

```
$ node -e "console.log(caseDirName('ts-order-service','cpu'))"
tsorderservice-cpu          # RCAEval publishes dataset/ts-order-service-cpu_1/
```

`caseDirName` exists to build the directory name RCAEval uses, and it stripped every
character outside `[A-Za-z0-9_]` — which is what a slugifier does. Component names in
all three systems are hyphenated: `ts-order-service`, `adservice`, `checkoutservice`,
`ts-travel-service`. The function therefore produced a name for a directory that
upstream does not publish.

Nothing detected it for as long as the only consumers were our own exporter and our
own verifier, because both call `caseDirName` and both compare the results to each
other. The defect lived in the shape of the **agreement**, not in either side of it:
two functions that share one naming rule cannot disagree about it. It became
observable the moment a real path entered the picture — `check-official.mjs
--official-dir` reads a directory the operator did not name, and the round trip
failed on a missing path rather than on a wrong number.

**Fix**: preserve the hyphen; the pattern is a pass-through for the characters
upstream uses rather than a replacement set for the ones it does not.

**Guard**: a case per system asserting the exact upstream directory name for a
hyphenated component, plus a case asserting a genuinely illegal character is still
removed — so the fix is not "delete the check". Reverting to the stripping pattern
fails 4 tests.

This finding is why the fourth anchor is not redundant with the first three. An
anchor-1..3 failure is a bug in one function; an anchor-4 failure can be a bug in
the *contract between* functions, which no amount of internal consistency can
reveal.

## 30 — An unconditional `unzip` blamed the archive format for a CSV

The fetch path extracted every asset as an archive, because the corpora are
archives. Two registry entries are not: `rcaeval-baro-simple` is a bare
`simple_data.csv`, and its `extractsTo` is `null` — a field that already said so and
was read by nothing.

Measured on that asset, the failure was `unzip: cannot find zipfile directory in …
simple_data.csv`, and the message named neither the asset id nor the reason. The
operator's next move is to suspect a corrupt download and re-fetch a file that was
never an archive.

An `extractsTo: null` that nothing consults is the same class of defect as findings
24 and 25: a field that records a fact and does not enforce it.

**Fix**: the archive step runs only when the registry says the asset extracts, and a
non-archive asset is moved into place under the name the registry gives it. The
error for a genuinely corrupt archive now names the asset id.

**Guard**: one case per registry shape, driving the real script against a local
server; and a registry-wide case asserting that every entry with `extractsTo: null`
is treated as a file while every entry with a value is treated as an archive.
Ignoring `extractsTo` again fails 2 tests.

## 31 — The generator swallowed its own warnings when it found nothing

```
$ node scripts/gen-rcaeval-cases.mjs --official-dir corpus --out cases.json
# exit 0, empty cases.json, and no output at all
```

The generator warned per skipped case — a directory with no `inject_time.txt`, an
unparseable directory name — and printed the collected warnings only on the branch
that had also found cases. A corpus where *every* case was skipped therefore
produced an empty descriptor file, no diagnostics, and a zero exit, which is
indistinguishable from a corpus that legitimately contains nothing to report.

That is the worst possible shape for this particular tool: its output feeds the round
trip, so an empty descriptor set silently turns the check into a no-op. A check that
has nothing to check must not report success by saying nothing.

**Fix**: warnings are emitted before the empty-result decision, and finding zero
cases is itself an error naming the path and the reason. `--check` mode reports a
descriptor file that disagrees with the corpus as a failure rather than a diff to
eyeball.

**Guard**: cases for the all-skipped corpus, the partly-skipped corpus, and the
`--check` agreement path. Moving the warning print back below the early return fails
2 tests.

The instrument-defect rule from pass 2 applies directly here: this defect was found
*because* a test asserted on stderr, and that test could only see stderr once it
stopped using `execFileSync`. The instrument was fixed and the defect it was pointing
at became visible in the same change.

## 32 — The test fixture was malformed exactly where the script was suspected

The fetch test built a synthetic archive in-process to avoid a network dependency.
`unzip` rejected it four times, and each rejection was initially read as a defect in
`fetch-official.mjs`:

```
End-of-central-directory signature not found
invalid zip file with overlapped components (possible zip bomb)
The value of "value" is out of range. Received -2119958528
```

The last three were all the fixture, and the second is worth recording by name: the
central directory's field offsets are **not** the local header's. The local header
runs `[signature, version-needed, flags, method]`; the central directory runs
`[signature, version-made-by, version-needed, flags, method]`, one field later. The
fixture wrote the local layout into both, so `unzip` read `version = 0` from the
central directory and, among other things, dropped the directory prefix from the
entry name — producing a fixture that could not represent the layout the script under
test was written to handle.

The third rejection was a separate mistake of the same kind: a Unix mode written as
`0o100644 << 16` overflows into the sign bit and must be coerced with `>>> 0`.

**Fix**: the fixture writes a single entry with the full path `dataset/case/metrics.json`
and the correct layout in each header, and `execFileSync` was replaced with
`spawnSync` (see finding 31) so a *successful* extraction can be read back.

**Guard**: the fixture now has its own tests, which run the system `unzip` against it
and assert the extracted path and contents. This is the point — a fixture with no
test of its own can be wrong in a way that presents as a bug in the code it feeds,
and the debugging cost lands on the wrong file.

## 33 — A byte count was recorded without a digest, and the fetch would have enforced it

```
$ node scripts/check-official-registry.mjs
check-official-registry: FAILED
  asset 'rcaeval-baro-simple' records bytes without sha256.
```

`rcaeval-baro-simple` carried `bytes: 570409` beside `sha256: null`. The number was
a placeholder written when the registry was first authored, and it is the most
dangerous shape a pin can take, for two reasons that compound:

- `bytes` is *enforced* by `fetch-official.mjs` — `if (asset.bytes !== null && bytes !== asset.bytes) fail(...)`.
  A digit typed wrong here does not sit quietly, it fails every fetch of that asset
  with a message saying the download is the wrong size.
- `sha256` is the field that would have caught the mistake, and it was `null`, so
  nothing cross-checked the number.

The registry guard was built in the same pass and found this on its first run
against the shipped file. That is the intended relationship between a guard and the
thing it guards: a check that has never failed is a check nobody has verified.

**Fix**: both fields go to `null` together. The measured values arrive from a fetch
that actually ran, which is what `--report-pins` and `apply-pins.mjs` now carry.

**Guard**: `scripts/check-official-registry.mjs` fails when exactly one of the pair
is recorded, and it runs in `pnpm lint` on every push.

## 34 — The registry named a cross-repository cache read that cannot work

The `notFetchable` entry for OpenRCA 1.0 offered, as its alternative to fetching,
"reach it through the AgentiX-E/openrca-* shard repositories instead, which already
cache it on a runner". Both halves of that sentence are false, and they were
measured:

```
$ for r in openrca-{telecom,bank,market}-{dates-early,dates-late,cloudbed-1,cloudbed-2}; do
    gh api /repos/AgentiX-E/$r/actions/caches --jq .total_count
  done
0 0 0 0 0 0
```

- **The caches do not exist.** All six shards report `total_count: 0`. Their last
  successful `cache-dataset.yml` run was 2026-08-02, and Actions caches expire after
  30 days of no access.
- **And they would not have been readable anyway.** A GitHub Actions cache is scoped
  to the repository that wrote it. `actions/cache` resolves a key against the calling
  repository's cache scope, so a cache written by `openrca-telecom-dates-early` is
  invisible to `rca-bench-factory` even while it exists and is fresh.

The second fact is the one that matters, because it is not a matter of waiting for
the cache to be repopulated: the mechanism was wrong, not merely empty. A round trip
built on it would have reported "no data" — a state this project has repeatedly
treated as meaning *the corpus is not there* rather than *we looked in the wrong
place*.

What is true is that the shards are the right place to *perform* the download: they
already read the Google Drive folder with `gdown` and filter it by date, which is
what makes the OpenRCA telemetry obtainable at all. What is not true is that they are
a source this repository can read. Making them one means having them publish an
artifact instead of populating a cache, which is a change in those repositories.

**Fix**: the entry now says what was measured — that the route does not work, why it
does not work, and what the shards are actually good for.

**Guard**: there is none, and that is stated rather than implied. Cross-repository
cache liveness is not decidable from this repository's working tree, so no local
check can assert it; the `--check` mode in `official-data.yml` covers only the assets
this repository fetches itself. The entry is prose that a reader has to evaluate, and
the honest thing is to say so instead of leaving a fabricated alternative in a
machine-readable field.

## 35 — A retraction: the backoff guard was accused of a defect it did not have

This finding was **withdrawn after measurement**, and it is recorded rather than
deleted because the first version of it was written with confidence, was wrong, and
the way it was wrong is the failure mode this document exists to catch.

The observation was real. The failure path of `fetch-official.mjs` was timed rather
than read, and it did this:

```
$ time RCA_BENCH_FETCH_BACKOFF=0 node scripts/fetch-official.mjs --anchor rcaeval-re2 \
      --out /tmp/bo --registry /tmp/registry-probe.json
RETRYING  probe: attempt 1/3 after 3.0s: curl: (7) Failed to connect to 127.0.0.1 port 9 after 0 ms
RETRYING  probe: attempt 2/3 after 3.0s: curl: (7) Failed to connect to 127.0.0.1 port 9 after 0 ms
SKIPPED   probe: attempt 3/3 after 3.0s: curl: (7) Failed to connect to 127.0.0.1 port 9 after 0 ms

0.05s user 0.03s system 0% cpu 9.074 total
```

The connection was refused in **zero milliseconds** and the command took **9.074
seconds**. The backoff override was set, and 6 of those seconds were spent waiting.

The inference was wrong. `2 ** attempt * 1000 * BACKOFF` and
`BACKOFF === 0 ? 0 : 2 ** attempt * 1000 * BACKOFF` are **equivalent** — `0` times
any factor is already `0`, so the ternary changed nothing and the blame was misplaced:

```
$ node -e "const B=0; const a=2; console.log(2**a*1000*B, B===0?0:2**a*1000*B)"
0 0
```

Injecting the guard back — the check that would have caught this before the finding
was written — turns no test red, because there is nothing to catch. The 9 seconds came
entirely from `--retry-connrefused`, which **this pass had added to the curl
invocation minutes earlier** (see finding 36).

The method failure is worth naming precisely, because it is new to this audit. Every
previous finding was found by running a probe and reading the number, and the rule
that worked was "do not trust the reading of the code". This finding was produced by
running the same kind of probe and then *attributing* the number to the nearest
suspicious-looking code, which is the reading of the code wearing the probe's
authority. The number was measured; the cause was assumed. The check that separates
them is cheap and was skipped: **remove the suspected cause and see whether the number
returns.** Restoring the ternary moved 9.074s to 9.075s, and removing
`--retry-connrefused` moved it to 0.067s.

**Fix**: the ternary is gone, as dead weight rather than as a defect, and the comment
at that line says so and points at the real cause. The test written for this finding
is kept, with its comment rewritten to say what it does and does not establish, since
the property it asserts — that the override is honoured — was genuinely asserted
nowhere before.

## 36 — Two retry mechanisms multiplied, and the elapsed time measured the wrong one

The same probe that produced finding 35 reported `after 3.0s` for a connection
refused in 0 ms, and this is where the three seconds and the six seconds of waiting
actually came from. `--retry 2` was in the original argument list, and this pass had
added `--retry-connrefused` alongside it on the reasoning that the outer loop should
own the retries and curl should repeat only the transport-level ones. That is exactly
backwards. `--retry-connrefused` implies its own retry count, so a refused connection
was attempted by curl three times and by the loop three times — nine requests for
three reported attempts — and the elapsed time recorded curl's internal backoff as
though it were the duration of the transfer.

Measured by removal, which is the check that would have saved finding 35:

| curl arguments | `BACKOFF=0`, connection refused in 0 ms |
| --- | --- |
| `--retry 2 --retry-connrefused` | **9.075s**, each attempt `after 3.0s` |
| `--retry 2` | **0.063s**, each attempt `after 0.0s` |
| neither | **0.067s**, each attempt `after 0.0s` |

The middle row is the one that identifies the cause: `--retry 2` on its own does not
retry a refused connection — curl only repeats that class when asked to — so it is
`--retry-connrefused`, and only that flag, that produced the delay and the invented
duration.

This matters beyond the six seconds, because the elapsed time is the *entire*
diagnostic on that line. It is the one fact that separates "the URL is not answered"
from "the transfer started and died", and those two have opposite fixes. A number that
measures something else is worse than no number, because it is still read as a
measurement.

**Fix**: `--retry` is dropped rather than narrowed. One curl invocation is one
attempt, so the number on the line is the time that attempt really took. The loop
retries and only the loop does; each attempt is now named with its number, its
duration and curl's message, so a three-attempt failure shows whether all three burned
the same time — which is what distinguishes a transfer dying partway from a host that
never answered.

**Guard**: two tests, and their fixture had to change for them to be worth anything.
The first version pointed both at the fixture's socket-destroying route and passed
with the defect injected — because that route produces curl's exit code **52**, and
`--retry-connrefused` repeats only code **7**. A server cannot produce code 7, since
the failure is that no server exists, so the fixture now binds a port, releases it,
and uses the dead port as the URL. With the flag injected the two tests fail at
9.08s each — the defect's own signature — and against the fix they pass at 1.1s
combined. Without that fixture change the regression would have been unreachable and
the tests would have been theatre.

## 37 — `--fail` collapses every HTTP error into one exit code, so the classifier could not tell a 404 from a 500

The first version of `classifyFailure` keyed on curl's exit status. Measured against
a local server that returns each status in turn:

```
status 404 -> exit 22 | stderr: "curl: (22) The requested URL returned error: 404"
status 500 -> exit 22 | stderr: "curl: (22) The requested URL returned error: 500"
status 503 -> exit 22 | stderr: "curl: (22) The requested URL returned error: 503"
```

Identical exit codes. `--fail` maps the whole 4xx and 5xx range onto 22, so a
classifier reading the code cannot separate the two failure classes an operator is
choosing between: *the asset moved, edit the registry* and *the server is unwell,
retry*. The only place the HTTP status appears is curl's message text.

A test caught this rather than the reading, and only because the fixture serves both
statuses. The test asserting that a 5xx is not classified as a stale URL failed with
`curl: (22) The requested URL returned error: 500` classified as "the asset is not at
this URL any more" — a confident instruction to edit a URL that is correct.

Two further corrections came from the same round of measuring:

- **`curl: (7)` is not what a mid-request reset looks like.** The fixture destroys
  the socket, which curl reports as code **52**, "Empty reply from server". Code 7 is
  a connection refused outright. Both mean no bytes moved and they are named
  separately, because one means nothing is listening and the other means something is
  listening and refusing to serve.
- **The exit status is not spelled `exited 7`.** curl prints `curl: (7)`, so a rule
  matching only the shell's phrasing matched nothing the real tool emits. Both
  spellings are accepted now.

**Fix**: the HTTP status is parsed out of the message and checked before the transport
codes. `--fail` is still in place — it is what makes a 4xx an error at all — but
nothing downstream reads its exit code as though it identified the response.

**Guard**: the 404 case and the 500 case assert opposite classifications against one
fixture, so collapsing the two fails one of them. The 500 case is the one that fails
loudest, since it is the direction that tells an operator to edit a URL that is
correct.

## 38 — The corpus summary counted directories under the word "file"

`check-official.mjs` printed one number for the corpus it read:

```
ROUNDTRIP declared 1 case(s), found 2 file(s)
```

`readTree` returned a flat `path -> text` map of files, and the line counted
`Object.keys(files).length`. That was correct — and it was only correct because
nothing had ever asked it to count a directory. This pass needed a directory count so
that a corpus which extracted to the wrong depth can be told from one that never
arrived, and adding the count to the same number is what the line's own label already
invited: the reader is told `file(s)` and the value would have been files plus
directories, moving whenever the archive layout changed.

The two numbers answer different questions and one is not derivable from the other. A
download that unpacked a level too deep has both, under a different root. One that
unpacked a level too shallow has directories and no files. The existing test asserted
`/found \d+ file/`, which matches any number and cannot distinguish the two
implementations — so it would have passed either way.

**Fix**: `readTree` returns `{ files, directories }`, and the summary names both.
`--official-dir`'s own root is not counted, because it is the argument the caller
passed rather than something the download produced.

**Guard**: the new test asserts the exact values — `/found 2 file\(s\)/` and
`/, 1 directory\(ies\)/` for a one-case corpus — rather than the presence of a number.

## 39 — A 2.8 GB download was verified with a function that cannot read above 2 GiB

The fourth anchor's first *successful* fetch, run `35482150957` on `07a0001f`, died
here:

```
RangeError [ERR_FS_FILE_TOO_LARGE]: File size (2801345134) is greater than 2 GiB
    at tryCreateBuffer (node:fs:402:13)
    at readFileSync (node:fs:455:14)
    at sha256Of (.../scripts/fetch-official.mjs:277:38)
    at fetchAsset (.../scripts/fetch-official.mjs:338:18)
```

Two assets had already been measured clean:

```
UNPINNED  rcaeval-re2-ob: bytes=1191025569 sha256=0605a36c...7513
UNPINNED  rcaeval-re2-ss: bytes=245629018  sha256=7aff9a3a...e295
```

Both are under 2 GiB. `RE2-TT.zip` is 2 801 345 134 bytes and is not, so the
third asset reached a limit that the first two could never have revealed. The
download itself had worked — the file on disk was the right file — and the
*verification* of it was what could not handle the size. That distinction is the
whole finding: `sha256Of` was `readFileSync`, which materialises the file, and a
function whose input is "a file we just downloaded from a corpus host" cannot
assume the file fits in a `Buffer`.

This also explains the *first* failure, run `35480663989` on `98fdf601`, which
took 12.35 minutes and reported nothing: the two smaller archives download in
about 3 minutes between them and the third spends the rest. The 12.35 minutes was
never evidence of unreachability — it was a large file being transferred
successfully and then refused by its own verifier.

**Fix:** digest off the stream, in 8 MiB chunks (`createReadStream` +
`for await`), so the ceiling is structural rather than raised. There is no buffer
the size of the file, so there is no size the file can be. The `for await` form is
deliberate: an 'error' event on a stream nobody is listening to is a hang, and the
form that rejects is the form that reports.

**Test:** `digests a download larger than 2 GiB instead of failing on the file
size`. It streams 2 GiB + 1 byte over loopback — the smallest input that still
reproduces the production failure, not a stress test — and asserts the digest and
byte count both come back, plus that the file on disk is exactly that many bytes.
The fixture never allocates the body: it writes fixed 4 MiB chunks and re-enters
the pump on `drain`.

The fixture had this defect itself first, and it is worth recording because it is
the same defect one level down. The first version returned from the pump when
`res.write` signalled backpressure instead of resuming on `drain`, so the server
sent 4 MB of a 2 GiB body and then ended the response. The download succeeded, was
short, and *both digests agreed* — with each other and with a wrong number. The
test's byte-count assertion is what would have caught it, and only because it
pins the exact value rather than the shape.

**Injection:** restoring `readFileSync` turns the test red with the original
`ERR_FS_FILE_TOO_LARGE` and the original 2147483649.

**Verified at the failing size.** The unit test uses 2 GiB + 1 because that is the
smallest input that reproduces the failure; the asset that actually failed is
2 801 345 134 bytes. The same streamed digest was run against a file of exactly that
size under a 192 MiB heap cap:

```
file bytes   : 2801345134
shipped      : 282d6ed7b0a03b3ba95893d22e0abc9ee9773838aa85022a3eb4ddcd8486a2c7
independent  : 282d6ed7b0a03b3ba95893d22e0abc9ee9773838aa85022a3eb4ddcd8486a2c7
MATCH        : true
peak rss     : 126 MiB
```

The independent value comes from a separate process with a different chunk size
(1 MiB against the shipped 8 MiB), so the agreement is about the file rather than
about a shared constant. The heap cap is the load-bearing part: the old
implementation could not have produced any number here at all, and the new one
produces the right one while using 126 MiB. That is the difference between raising
a ceiling and removing it.

## 40 — A retraction: the partial run did write its report, and the discarding happened elsewhere

I claimed, from the same run's log tail, that `RE2-OB` and `RE2-SS` — both measured
clean — were printed and then thrown away because the process exited non-zero. I
wrote that from the fetch step's failure and the `Compare the measured pins` step's
`no pin report was written; the fetch did not complete` line, both of which are
real. The inference between them is not, and this is the second time in two passes
that I have attributed a number to the nearest suspicious code instead of measuring.

Measured, with a registry holding one reachable and one 500-answering asset:

```
EXIT: 1
REPORT EXISTS: true
REPORT ASSETS: [{"id":"b-live","url":"...","bytes":19,"sha256":"7bce5166..."}]
STDERR: 1 of 2 asset(s) could not be reached. ...
```

The report is written. `--report-pins` runs *before* the exit code is decided, which
the caller's own comment says, and the code does what the comment says. A partial
run has always produced a complete file for every asset it measured.

The real cause is narrower and I had the mechanism wrong in both directions. Node's
stack overflow did `process.exit(1)` **immediately from inside `fetchAsset`**, before
the loop reached `RE2-OB`'s report write... except `RE2-OB` and `RE2-SS` were written
in order, and `RE2-TT` was third — so the report for the first two was never reached
because the process died in the middle of building `results`, not after it. The
report is written once, after the loop over all assets, and a hard death inside that
loop loses everything before it.

So the *defect* I described — "a run that cannot finish discards the part it did
finish" — is real, and the location is different from where I put it. The report is
not written and then suppressed by an exit code. It is not written at all, because
writing it is a single act after all the fetching, and a crash inside the fetching
means there is no after.

That is worth fixing for the reason I gave, and the fix is at the layer I named second:
measure incrementally. But the finding as first written describes a code path that
does not exist, and a report that keeps a wrong mechanism next to a right conclusion
is worse than one that is merely terse — the next reader would go looking for an
exit-code problem in a script that does not have one.

**What is established:** the digest ceiling (finding 39) is the whole of the observed
failure. Everything else in the run's log follows from it.

**What is not established:** that the pins were recoverable from this run. They were
not, and the reason is process death mid-loop rather than a wrong exit code.

**Retained from the original finding, now separated from the false claim:** a long
fetch should write what it has measured as it goes, because the crash that motivated
this pass is exactly the class of failure that a single write-at-the-end cannot
survive. That is a design change and is listed as such in `docs/progress.md`, not
presented here as a repair of a defect that was observed.

## 41 — Every fixture was smaller than one digest chunk, so the digest could have covered a prefix

Found by injection, not by reading. Replacing the chunked digest with
`hash.update(chunk); break;` — a digest of the first 8 MiB of the file — left all
30 tests green.

Measured, on a 40 MiB body:

```
injected:  UNPINNED  big: bytes=41943040 sha256=042e995365a46153f8d3a1327d986e2fec93554ed9d6b8126cecc7965ecf3be6
restored:  UNPINNED  big: bytes=41943040 sha256=b0e8b99ffb4175ecd69a767e8e4e4c35df2b6d09246fcb67bc4f3a8d9abb2dc3
```

Two different numbers, an identical `bytes=` on both lines, and a green suite.

The cause is the fixture population, and it is worth stating as a general rule
because it is not specific to this function: **every fixture in the file was a few
dozen bytes, so "the whole file" and "the first chunk" were the same bytes.** The
suite could not distinguish the two implementations because it never presented an
input where they differ. The 2 GiB test added in finding 39 does go past one chunk
— but it only asserts that the digest is 64 hex characters and that the byte count
is right, and a truncated digest is still 64 hex characters. `bytes=` comes from
`statSync`, not from the hash, so it cannot see this either.

This is the failure mode the pin exists to prevent, arriving from the inside. The
digest is the *only* thing `golden-master/official-assets.json` records. A pin
covering a prefix is not a slightly wrong number; it is a number that verifies
nothing while being recorded as though it verified something, and a subsequent run
would download a substituted file and report `VERIFIED`.

**Fix:** a `/chunked` fixture of 3 × 8 MiB + 1 bytes of *non-uniform* content, and a
test that asserts the reported digest equals an in-process hash of the same buffer.
The size is chosen against the chunk boundary: over one chunk so "first chunk" is
unambiguously wrong, and not a whole multiple of it so a one-chunk-short read also
disagrees. The content is a byte counter rather than a repeated byte, because a
uniform buffer makes "first chunk" and "whole file" differ only in length and a
defect hashing a fixed-size prefix of the right length would still agree.

**Injections, both now caught:** `break` after the first `hash.update` (digest of
the first chunk), and an `end:` bound of two chunks (digest of a prefix). Before
this finding, the first of those was caught by nothing.

### A note on which fixture sizes this file now needs

Three sizes, each earning its place:

| fixture | size | the only thing it can catch |
| --- | --- | --- |
| `PAYLOAD` | 27 B | everything about parsing and pinning |
| `/chunked` | 24 MiB + 1 | a digest that stops before the end of the file |
| `/huge` | 2 GiB + 1 | a digest that cannot read past Node's 2 GiB ceiling |

The middle one is new and exists because the two outside it are silent about it.
That is the shape of the gap: not a missing assertion, but a missing *input*.

---

## 42 — The corpus layout was assumed rather than read, and the assumption came from our own exporter

Found by the third real run, at the step after the fetch. The fetch itself passed
— finding 39's fix held, all three assets downloaded and digested — and the job
then failed on:

```
error: no RCAEval case directories found under '/tmp/official'. Expected names of
the form {RE1|RE2|RE3}-{service}-{fault}_{instance} each holding inject_time.txt.
```

over a tree that plainly held the corpus.

### What was wrong

`parseRcaEvalDirectory` parsed `^(RE[123])-(.*)-([A-Za-z0-9]+)_(\d+)$`, and
`gen-rcaeval-cases.mjs` walked the tree testing each *directory name* against it.
The corpus contains no such name at any level. Its real layout is nested:

```text
{suite}-{system}/{service}_{fault}/{run}/inject_time.txt
  e.g. RE2-OB/checkoutservice_cpu/1/
```

so a case is three path components and no single component carries it. Every layer
was tested against the regex and none matched:

```
RE2-OB                    -> no  (fused suite+system, not a flat case)
checkoutservice_cpu       -> no  (service_fault, no suite prefix, no instance)
1                         -> no  (bare run index)
```

### Why every in-repo check missed it

**The pattern came from our own exporter.** `caseDirName` writes
`RE2-{service}-{fault}_{instance}`, and `parseRcaEvalDirectory` read it back. The
reader and the writer agreed with each other, and the unit tests exercised exactly
that pair — so the suite was measuring self-consistency and calling it correctness.
This is the same failure shape as finding 29 (where `caseDirName` stripped hyphens
and `oraclePrediction` read the stripped name back), one level up: then the two
sides shared a wrong alphabet, here they share a wrong *layout*.

The documentation reinforced it rather than catching it. `docs/targets/rcaeval.md`
described the layout in terms of what we emit, and the upstream README's
`{benchmark}_{service}_{fault}_{instance}` line — which describes the HuggingFace
Parquet copy's case **identifier**, not a path on disk — read as confirmation.

### The evidence that settled it

Two independent statements in upstream *code*, not prose. `main.py` finds the cases
by globbing `**/data.csv` and reads the labels back out of the path:

```python
data_dir = dirname(data_path)                                       # …/{service}_{fault}/{run}
service, metric = basename(dirname(dirname(data_path))).split("_")   # service, fault
case = basename(dirname(data_path))                                  # {run}
```

and `docs/TORAI.md` prints the tree for the RE2 conversion, which is the same
corpus re-exported:

```text
data/torai-OB/{service}_{fault_type}/{run}/inject_time.txt
```

Both agree, and both disagree with the assumption. The second is what makes the
`{suite}-{system}` top level certain rather than inferred.

### What was changed

1. **`parseRcaEvalPath`** — a new parser for the nested layout, anchored on the
   three components a case has. `parseRcaEvalDirectory` is kept unchanged and
   separate: the flat name is still what we emit, and a single function that
   guessed between two incompatible layouts would hide the next mismatch instead
   of reporting it.
2. **`readRcaEvalGroundTruth`** now tries both, because one file map can hold the
   corpus *and* our own export. Reading only one layout makes the other silently
   score zero cases, and zero cases is not an empty answer — it is a run
   reporting success over data it never looked at.
3. **`gen-rcaeval-cases.mjs`** now finds cases by the file only a case has
   (`inject_time.txt`) and parses the path that file sits on, instead of testing
   directory names. This also bounds the walk: the previous recursive descent was
   unbounded, and since `{service}_{fault}` matched nothing it descended into real
   cases looking for cases below them.
4. **The suite counts** are rendered from what was found rather than from a
   hard-coded `['RE1','RE2','RE3']`, which would have printed `RE1=0 RE2=0 RE3=0`
   for an RE3 corpus while counting every case in it.

### The service/fault split, and which side is allowed to be ambiguous

The split is at the **last** underscore. This is a decision with a right answer, not
a style choice: RE2's fault vocabulary is six single tokens (`cpu`, `mem`, `disk`,
`delay`, `loss`, `socket`), while service names routinely contain underscores and
hyphens. Splitting at the first underscore reads `ts-order-service_cpu` as service
`ts-order` — not a service that exists — which is the same class of error as
finding 29.

The cost is stated rather than hidden: an underscore *inside* the fault would be
read as part of the service. The corpus never produces one, and the test that
covers this says so explicitly instead of implying the split is lossless.

### The injection that found a second, larger gap

Restoring the pre-fix reader —

```ts
const parsed = parseRcaEvalDirectory(dir);   // no parseRcaEvalPath attempt
```

— left **107 of 107 tests green**. The new parser had tests; the *reader that uses
it* had none that presented it a corpus-shaped path. Every existing RCAEval
ground-truth assertion fed the flat name our exporter writes, so the reader was
only ever measured against its own writer's output — the same defect as the one
being fixed, still present in the test population.

Three tests were added:

| test | what it pins |
| --- | --- |
| reads the corpus nested layout, not only the flat name it writes | the reader finds `RE2-OB/checkoutservice_cpu/1` at all |
| keeps a hyphenated service intact when reading the nested layout | and reads `ts-order-service`, not `ts-order` |
| reads both layouts from one file map | a map holding the corpus and our export scores both |

All three go red under that injection; nothing else in the suite does.

### Verification

Fixtures rebuilt in the corpus's real layout, and the full chain run end to end
against a corpus shaped like the download:

```
Wrote /tmp/realistic.json
  108 case(s): RE1=0 RE2=108 RE3=0          # 90 RE2-OB + 18 RE2-TT, decoy __MACOSX ignored

ROUNDTRIP declared 2 case(s), found 4 file(s), 4 directory(ies)
ROUNDTRIP PASS   1/2 RE2-OB/checkoutservice_cpu/1  target=rcaeval-re2  oracle=1.00 signals=3600
ROUNDTRIP PASS   2/2 RE2-OB/checkoutservice_cpu/2  target=rcaeval-re2  oracle=1.00 signals=3600
ROUNDTRIP PASSED (2 case(s) round-tripped through the official layout)
```

Three injections, each confirmed to fail:

| injection | caught by |
| --- | --- |
| walk accepts only run `1` | 4 case-derivation tests |
| service/fault split at the first underscore | 1 parser test |
| reader drops the nested parse | 3 reader tests (added for this) |

### A note on what this cost

Two runs were spent before this one on a fetch that was reported as a failure and
was not; this run was spent on a step that failed for a reason the log stated
plainly. The step message was correct, complete, and printed the expected pattern —
which is why the useful response was to ask whether *the expectation* was right,
not to widen the search. The answer was in upstream code, one `grep` away, and had
been the whole time.

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
